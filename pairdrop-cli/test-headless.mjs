import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pairdrop-headless-'));
const configDir = path.join(tmp, 'config');
const fixture = path.join(tmp, 'fixture.txt');
const roomSecret = 'R'.repeat(64);
const port = 32100 + Math.floor(Math.random() * 1000);
const domain = `http://127.0.0.1:${port}/`;

fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(fixture, 'hello from PairDrop headless CLI\n');
fs.writeFileSync(
  path.join(configDir, 'headless.json'),
  JSON.stringify({ roomSecret, domain })
);

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    WS_FALLBACK: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function waitForHttp() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(domain + 'config', response => {
          response.resume();
          response.statusCode === 200 ? resolve() : reject(new Error(String(response.statusCode)));
        });
        req.once('error', reject);
      });
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error('PairDrop test server did not start');
}

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

await waitForHttp();

const receiver = new WebSocket(
  `ws://127.0.0.1:${port}/server?webrtc_supported=true`,
  { headers: { 'User-Agent': 'Mozilla/5.0 PairDrop integration test' } }
);

let receiverId;
let senderId;
let received = Buffer.alloc(0);
let wsPeerFallback = false;

await new Promise((resolve, reject) => {
  receiver.once('open', resolve);
  receiver.once('error', reject);
});

receiver.on('message', raw => {
  const message = JSON.parse(raw.toString());

  if (message.type === 'ping') {
    send(receiver, { type: 'pong' });
    return;
  }

  if (message.type === 'ws-config') {
    wsPeerFallback = message.wsConfig?.wsPeerFallback === true;
    return;
  }

  if (message.type === 'display-name') {
    receiverId = message.peerId;
    send(receiver, { type: 'room-secrets', roomSecrets: [roomSecret] });
    return;
  }

  if (message.type === 'signal') {
    senderId = message.sender.id;
    send(receiver, {
      type: 'signal',
      connected: true,
      to: senderId,
      roomType: 'secret',
      roomId: roomSecret
    });
    return;
  }

  if (message.type === 'request') {
    senderId = message.sender.id;
    assert.equal(message.header.length, 1);
    assert.equal(message.header[0].name, 'fixture.txt');
    send(receiver, {
      type: 'files-transfer-response',
      accepted: true,
      to: senderId,
      roomType: 'secret',
      roomId: roomSecret
    });
    return;
  }

  if (message.type === 'header') {
    assert.equal(message.name, 'fixture.txt');
    return;
  }

  if (message.type === 'ws-chunk') {
    received = Buffer.concat([received, Buffer.from(message.chunk, 'base64')]);
    if (received.length === fs.statSync(fixture).size) {
      send(receiver, {
        type: 'file-transfer-complete',
        to: message.sender.id,
        roomType: 'secret',
        roomId: roomSecret
      });
    }
    return;
  }

  if (message.type === 'partition') {
    send(receiver, {
      type: 'partition-received',
      offset: message.offset,
      to: message.sender.id,
      roomType: 'secret',
      roomId: roomSecret
    });
  }
});

const cli = spawn(
  process.execPath,
  ['pairdrop-cli/pairdrop-headless.mjs', '--domain', domain, fixture],
  {
    cwd: root,
    env: { ...process.env, PAIRDROP_CONFIG_DIR: configDir },
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

let stdout = '';
let stderr = '';
cli.stdout.on('data', chunk => { stdout += chunk; });
cli.stderr.on('data', chunk => { stderr += chunk; });

const exitCode = await new Promise(resolve => cli.once('close', resolve));

receiver.close();
server.kill('SIGTERM');

assert.equal(exitCode, 0, stderr || stdout);
assert.equal(wsPeerFallback, true);
assert.ok(receiverId);
assert.ok(senderId);
assert.equal(received.toString(), fs.readFileSync(fixture, 'utf8'));
assert.match(stdout, /Transfer to .* complete\./);

console.log('headless CLI integration test passed with WS_FALLBACK=false');
