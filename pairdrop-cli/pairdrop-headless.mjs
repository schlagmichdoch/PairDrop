#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import process from 'process';
import { WebSocket } from 'ws';

const CHUNK_SIZE = 64_000;
const PARTITION_SIZE = 1_000_000;
const CONFIG_DIR = process.env.PAIRDROP_CONFIG_DIR || (
  process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'pairdrop-cli')
    : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'pairdrop-cli')
);
const STATE_FILE = path.join(CONFIG_DIR, 'headless.json');

function usage() {
  console.log(`Usage:
  pairdrop --headless pair
  pairdrop --headless peers
  pairdrop --headless reset
  pairdrop --headless [--to DEVICE] FILE [FILE ...]`);
}

function normalizeDomain(domain) {
  const url = new URL(domain);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function websocketUrl(domain) {
  const url = normalizeDomain(domain);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname += 'server';
  url.search = '';
  url.searchParams.set('webrtc_supported', 'false');
  return url.toString();
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function readState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!state.roomSecret) throw new Error('missing room secret');
    return state;
  } catch {
    throw new Error('Headless CLI is not paired yet. Run: pairdrop --headless pair');
  }
}

function writeState(state) {
  ensureConfigDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function clearState() {
  try {
    fs.unlinkSync(STATE_FILE);
    console.log('Headless pairing state cleared.');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Headless CLI is not currently paired.');
      return;
    }
    throw error;
  }
}

function peerLabel(peer) {
  const name = peer?.name || {};
  return name.deviceName || name.displayName || peer.id;
}

function sendJson(ws, message) {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify(message), error => error ? reject(error) : resolve());
  });
}

function relay(ws, peerId, roomSecret, message) {
  return sendJson(ws, {
    ...message,
    to: peerId,
    roomType: 'secret',
    roomId: roomSecret
  });
}

const messageQueues = new WeakMap();

function takeQueuedMessage(ws, predicate) {
  const queue = messageQueues.get(ws) || [];
  const index = queue.findIndex(predicate);
  if (index === -1) return undefined;
  return queue.splice(index, 1)[0];
}

function waitFor(ws, predicate, timeoutMs = 30_000) {
  const queued = takeQueuedMessage(ws, predicate);
  if (queued) return Promise.resolve(queued);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for PairDrop peer.'));
    }, timeoutMs);

    const onMessage = raw => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!predicate(message)) return;

      // connect() queues messages before this listener runs. Remove the
      // matching queued copy so a later wait cannot consume it twice.
      takeQueuedMessage(ws, predicate);
      cleanup();
      resolve(message);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('PairDrop connection closed.'));
    };

    function cleanup() {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('close', onClose);
    }

    ws.on('message', onMessage);
    ws.on('close', onClose);
  });
}

function connect(domain) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(websocketUrl(domain), {
      headers: {
        'User-Agent': 'PairDrop Headless CLI'
      }
    });

    const peers = new Map();
    let wsFallback;
    let wsPeerFallback;
    messageQueues.set(ws, []);

    const onMessage = async raw => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.type === 'ping') {
        await sendJson(ws, { type: 'pong' });
        return;
      }

      messageQueues.get(ws).push(message);

      if (message.type === 'ws-config') {
        wsFallback = message.wsConfig?.wsFallback === true;
        wsPeerFallback = message.wsConfig?.wsPeerFallback === true;
      } else if (message.type === 'peers') {
        for (const peer of message.peers || []) peers.set(peer.id, peer);
      } else if (message.type === 'peer-joined') {
        peers.set(message.peer.id, message.peer);
      } else if (message.type === 'peer-left') {
        peers.delete(message.peerId);
      }
    };

    ws.on('message', onMessage);
    ws.once('error', reject);
    ws.once('open', () => resolve({
      ws,
      peers,
      getWsFallback: () => wsFallback,
      getWsPeerFallback: () => wsPeerFallback
    }));
  });
}

async function awaitInitialConfig(connection) {
  const deadline = Date.now() + 5000;
  while (
    connection.getWsFallback() === undefined &&
    connection.getWsPeerFallback() === undefined &&
    Date.now() < deadline
  ) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  if (connection.getWsFallback() !== true && connection.getWsPeerFallback() !== true) {
    throw new Error('This PairDrop instance does not support headless WebSocket peers. Upgrade PairDrop or enable WS_FALLBACK=true.');
  }
}

async function pair(domain) {
  const connection = await connect(domain);
  const { ws } = connection;
  await awaitInitialConfig(connection);

  const initiatedPromise = waitFor(ws, message => message.type === 'pair-device-initiated', 5000);
  await sendJson(ws, { type: 'pair-device-initiate' });

  const initiated = await initiatedPromise;
  console.log('');
  console.log(`PairDrop pairing code: ${initiated.pairKey}`);
  console.log('Enter that code in PairDrop on the device you want to pair.');

  await waitFor(ws, message => message.type === 'pair-device-joined', 120_000);
  writeState({ roomSecret: initiated.roomSecret, domain: normalizeDomain(domain).toString() });
  console.log('Paired successfully.');
  ws.close();
}

async function discover(domain, roomSecret, waitMs = 2500) {
  const connection = await connect(domain);
  await awaitInitialConfig(connection);

  const { ws, peers } = connection;
  const peersPromise = waitFor(
    ws,
    message => message.type === 'peers' && message.roomType === 'secret',
    5000
  );
  await sendJson(ws, { type: 'room-secrets', roomSecrets: [roomSecret] });
  await peersPromise;
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

  return connection;
}

async function listPeers(domain) {
  const state = readState();
  const effectiveDomain = domain || state.domain;
  const { ws, peers } = await discover(effectiveDomain, state.roomSecret);

  if (!peers.size) {
    console.log('No paired devices are online.');
  } else {
    for (const peer of peers.values()) {
      console.log(`${peer.id}\t${peerLabel(peer)}\t${peer.name?.displayName || ''}`);
    }
  }

  ws.close();
}

function selectPeers(peers, target) {
  const values = [...peers.values()];
  if (!values.length) throw new Error('No paired devices are online.');

  if (!target) return values;

  const needle = target.toLowerCase();
  const matches = values.filter(peer =>
    peer.id.toLowerCase().startsWith(needle) ||
    peerLabel(peer).toLowerCase().includes(needle) ||
    (peer.name?.displayName || '').toLowerCase().includes(needle)
  );

  if (!matches.length) throw new Error(`No online paired device matches "${target}".`);
  if (matches.length > 1) throw new Error(`More than one device matches "${target}". Use a more specific --to value.`);
  return matches;
}

function fileMetadata(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`Headless mode currently supports regular files only: ${filePath}`);

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    mime: 'application/octet-stream'
  };
}

async function sendFilesToPeer(ws, peer, roomSecret, files) {
  const peerId = peer.id;
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const header = files.map(file => ({
    name: file.name,
    mime: file.mime,
    size: file.size
  }));

  console.log(`Sending ${files.length} file${files.length === 1 ? '' : 's'} (${totalSize} bytes) to ${peerLabel(peer)}...`);

  await relay(ws, peerId, roomSecret, { type: 'signal', connected: false });

  try {
    await waitFor(ws, message => message.type === 'signal' && message.sender?.id === peerId, 5000);
  } catch {
    // The websocket transfer itself does not depend on the cosmetic signal handshake.
  }

  await relay(ws, peerId, roomSecret, {
    type: 'request',
    header,
    totalSize,
    imagesOnly: false,
    thumbnailDataUrl: ''
  });

  const response = await waitFor(
    ws,
    message => message.type === 'files-transfer-response' && message.sender?.id === peerId,
    120_000
  );

  if (!response.accepted) throw new Error(`Transfer was declined by ${peerLabel(peer)}.`);

  for (const file of files) {
    await relay(ws, peerId, roomSecret, {
      type: 'header',
      size: file.size,
      name: file.name,
      mime: file.mime
    });

    let offset = 0;
    let partitionBytes = 0;

    for await (const chunk of fs.createReadStream(file.path, { highWaterMark: CHUNK_SIZE })) {
      await relay(ws, peerId, roomSecret, {
        type: 'ws-chunk',
        chunk: chunk.toString('base64')
      });

      offset += chunk.length;
      partitionBytes += chunk.length;

      if (offset < file.size && partitionBytes >= PARTITION_SIZE) {
        await relay(ws, peerId, roomSecret, { type: 'partition', offset });
        await waitFor(
          ws,
          message => message.type === 'partition-received' &&
            message.sender?.id === peerId &&
            message.offset === offset,
          30_000
        );
        partitionBytes = 0;
      }
    }

    await waitFor(
      ws,
      message => message.type === 'file-transfer-complete' && message.sender?.id === peerId,
      120_000
    );
  }

  console.log(`Transfer to ${peerLabel(peer)} complete.`);
}

async function sendHeadless(domain, target, paths) {
  const state = readState();
  const effectiveDomain = domain || state.domain;
  const files = paths.map(fileMetadata);
  const { ws, peers } = await discover(effectiveDomain, state.roomSecret);
  const targets = selectPeers(peers, target);

  for (const peer of targets) {
    await sendFilesToPeer(ws, peer, state.roomSecret, files);
  }

  ws.close();
}

async function main() {
  const args = process.argv.slice(2);
  const domainIndex = args.indexOf('--domain');
  let domain = process.env.PAIRDROP_DOMAIN || '';

  if (domainIndex !== -1) {
    domain = args[domainIndex + 1] || '';
    args.splice(domainIndex, 2);
  }

  if (!domain) domain = 'https://pairdrop.net/';

  const command = args[0];

  if (command === 'pair') return pair(domain);
  if (command === 'peers') return listPeers(domain);
  if (command === 'reset' || command === 'unpair') return clearState();
  if (command === '-h' || command === '--help' || !command) return usage();

  let target = '';
  if (args[0] === '--to') {
    if (args.length < 3) throw new Error('Use: pairdrop --headless --to DEVICE FILE [FILE ...]');
    target = args[1];
    args.splice(0, 2);
  }

  return sendHeadless(domain, target, args);
}

main().catch(error => {
  console.error(`pairdrop: ${error.message}`);
  process.exitCode = 1;
});
