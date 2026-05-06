# How-To

## Send directly from share menu on iOS
I created an iOS shortcut to send images, files, folder, URLs \
or text directly from the share-menu 
https://routinehub.co/shortcut/13990/

[//]: # (Todo: Add screenshots)

<br>

## Send directly from share menu on Android
The [Web Share Target API](https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target) is implemented.

When the PWA is installed, it will register itself to the share-menu of the device automatically.

<br>

## Send directly via command-line interface
Send files or text with PairDrop via command-line interface. \
This opens PairDrop in the default browser where you can choose the receiver.

### Usage
```bash
pairdrop -h
```
```
Send files or text with PairDrop via command-line interface.
Current domain: https://pairdrop-dev.onrender.com/

Usage:
Open PairDrop:		pairdrop
Send files:		pairdrop file1/directory1 (file2/directory2 file3/directory3 ...)
Send text:		pairdrop -t "text"
Specify domain:		pairdrop -d "https://pairdrop.net/"
Show this help text:	pairdrop (-h|--help)

This pairdrop-cli version was released alongside v1.10.4
```

<br>

### Setup

#### Linux / Mac
1. Download the latest _pairdrop-cli.zip_ from the [releases page](https://github.com/schlagmichdoch/PairDrop/releases)
   ```shell
   wget "https://github.com/schlagmichdoch/PairDrop/releases/download/v1.11.2/pairdrop-cli.zip"
   ```
   or
   ```shell
   curl -LO "https://github.com/schlagmichdoch/PairDrop/releases/download/v1.11.2/pairdrop-cli.zip"
   ```
2. Unzip the archive to a folder of your choice e.g. `/usr/share/pairdrop-cli/`
   ```shell
   sudo unzip pairdrop-cli.zip -d /usr/share/pairdrop-cli/
   ```
3. Copy the file _.pairdrop-cli-config.example_ to _.pairdrop-cli-config_
   ```shell
   sudo cp /usr/share/pairdrop-cli/.pairdrop-cli-config.example /usr/share/pairdrop-cli/.pairdrop-cli-config
   ```
4. Make the bash file _pairdrop_ executable
   ```shell
   sudo chmod +x /usr/share/pairdrop-cli/pairdrop
   ```
5. Add a symlink to /usr/local/bin/ to include _pairdrop_ to _PATH_
   ```shell
   sudo ln -s /usr/share/pairdrop-cli/pairdrop /usr/local/bin/pairdrop
   ```

<br>

#### Windows
1. Download the latest _pairdrop-cli.zip_ from the [releases page](https://github.com/schlagmichdoch/PairDrop/releases)
2. Put file in a preferred folder e.g. `C:\Program Files\pairdrop-cli`
3. Inside this folder, copy the file _.pairdrop-cli-config.example_ to _.pairdrop-cli-config_
4. Search for and open `Edit environment variables for your account`
5. Click `Environment Variables…`
6. Under _System Variables_ select `Path` and click _Edit..._
7. Click _New_, insert the preferred folder (`C:\Program Files\pairdrop-cli`), click *OK* until all windows are closed
8. Reopen Command prompt window

**Requirements**

As Windows cannot execute bash scripts natively, you need to install [Git Bash](https://gitforwindows.org/).

Then, you can also use pairdrop-cli from the default Windows Command Prompt 
by using the shell file instead of the bash file which then itself executes 
_pairdrop-cli_ (the bash file) via the Git Bash.
```shell
pairdrop.sh -h
```

<br>

## Send multiple files and directories directly from context menu on Windows

### Registering to open files with PairDrop
It is possible to send multiple files with PairDrop via the context menu by adding pairdrop-cli to Windows `Send to` menu:
1. Download the latest _pairdrop-cli.zip_ from the [releases page](https://github.com/schlagmichdoch/PairDrop/releases)
2. Unzip the archive to a folder of your choice e.g. `C:\Program Files\pairdrop-cli\`
3. Inside this folder, copy the file _.pairdrop-cli-config.example_ to _.pairdrop-cli-config_
4. Copy the shortcut _send with PairDrop.lnk_
5. Hit Windows Key+R, type: `shell:sendto` and hit Enter.
6. Paste the copied shortcut into the directory
7. Open the properties window of the shortcut and edit the link field to point to _send-with-pairdrop.ps1_ located in the folder you used in step 2: \
   `"C:\Program Files\PowerShell\7\pwsh.exe" -File "C:\Program Files\pairdrop-cli\send-with-pairdrop.ps1"`
8. You are done! You can now send multiple files and directories directly via PairDrop:

   _context menu_ > _Send to_ > _PairDrop_

##### Requirements
As Windows cannot execute bash scripts natively, you need to install [Git Bash](https://gitforwindows.org/).

<br>

## Send multiple files and directories directly from context menu on Ubuntu using Nautilus

### Registering to open files with PairDrop
It is possible to send multiple files with PairDrop via the context menu by adding pairdrop-cli to Nautilus `Scripts` menu:
1. Register _pairdrop_ as executable via [guide above](#linux).
2. Copy the shell file _send-with-pairdrop_ to `~/.local/share/nautilus/scripts/` to include it in the context menu
   ```shell
   cp /usr/share/pairdrop-cli/send-with-pairdrop ~/.local/share/nautilus/scripts/
   ```
3. Make the shell file _send-with-pairdrop_ executable
   ```shell
   chmod +x ~/.local/share/nautilus/scripts/send-with-pairdrop
   ```
4. You are done! You can now send multiple files and directories directly via PairDrop:

   _context menu_ > _Scripts_ > _send-with-pairdrop_

<br>

## File Handling API
The [File Handling API](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/how-to/handle-files)
was implemented, but it was removed as default file associations were overwritten ([#17](https://github.com/schlagmichdoch/PairDrop/issues/17),
[#116](https://github.com/schlagmichdoch/PairDrop/issues/116) [#190](https://github.com/schlagmichdoch/PairDrop/issues/190))
and it only worked with explicitly specified file types and couldn't handle directories at all.

[< Back](/README.md)
