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
Download the bash file: [pairdrop-cli/pairdrop](/pairdrop-cli/pairdrop).

#### Linux
1. Download the latest _pairdrop-cli.zip_ from the [releases page](https://github.com/schlagmichdoch/PairDrop/releases)
2. Unzip the archive to a folder of your choice e.g. `/usr/local/bin/pairdrop-cli/`
3. Make sure the bash file `/usr/local/bin/pairdrop-cli/pairdrop` is executable. Otherwise, use `chmod +x pairdrop`
4. Add absolute path of the folder to PATH variable to make `pairdrop` available globally by executing
   `export PATH=$PATH:/usr/local/bin/pairdrop-cli/`

<br>

#### Mac
1. add bash file to `/usr/local/bin`

<br>

#### Windows
1. Download the latest _pairdrop-cli.zip_ from the [releases page](https://github.com/schlagmichdoch/PairDrop/releases)
2. Put file in a preferred folder e.g. `C:\Program Files\pairdrop-cli`
3. Search for and open `Edit environment variables for your account`
4. Click `Environment Variables…`
5. Under *System Variables* select `Path` and click *Edit...*
6. Click *New*, insert the preferred folder (`C:\Program Files\pairdrop-cli`), click *OK* until all windows are closed
7. Reopen Command prompt window

<br>

### Requirements
As Windows cannot execute bash scripts natively, you need to install [Git Bash](https://gitforwindows.org/).
Then, you can also use pairdrop-cli from the default Windows Command Prompt \
by using the shell file instead of the bash file: `pairdrop.sh -h` which then itself executes \
pairdrop-cli (the bash file) via the Git Bash.

<br>

## Send multiple files and directories directly from context menu on Windows

### Registering to open files with PairDrop
It is possible to send multiple files with PairDrop via the context menu by adding pairdrop-cli to Windows `Send to` menu:
1. Download the latest _pairdrop-cli.zip_ from the [releases page](https://github.com/schlagmichdoch/PairDrop/releases)
2. Unzip the archive to a folder of your choice e.g. `C:\Program Files\pairdrop-cli\`
3. Copy the shortcut _send with PairDrop.lnk_
4. Hit Windows Key+R, type: `shell:sendto` and hit Enter.
5. Paste the copied shortcut into the directory
6. Open the properties window of the shortcut and edit the link field to point to _send-with-pairdrop.ps1_ located in the folder you used in step 2: \
   `"C:\Program Files\PowerShell\7\pwsh.exe" -File "C:\Program Files\pairdrop-cli\send-with-pairdrop.ps1"`
7. You are done! You can now send multiple files and directories directly via PairDrop:

> _context menu > Send to > PairDrop_

##### Requirements
As Windows cannot execute bash scripts natively, you need to install [Git Bash](https://gitforwindows.org/).

<br>

## Send multiple files and directories directly from context menu on Ubuntu using Nautilus

### Registering to open files with PairDrop
It is possible to send multiple files with PairDrop via the context menu by adding pairdrop-cli to Nautilus `Scripts` menu:
1. Download the latest _pairdrop-cli.zip_ from the [releases page](https://github.com/schlagmichdoch/PairDrop/releases)
2. Unzip the archive to a folder of your choice e.g. `/usr/local/bin/pairdrop-cli/`
3. Copy the shell file _send-with-pairdrop.sh_ to `/home/<user>/.local/share/nautilus/scripts/`
4. Edit the shell file and edit the variable `pathToPairDropCli` to point to the pairdrop-cli executable from step 2 (e.g. `/usr/local/bin/pairdrop-cli/pairdrop`) 
5. Make sure the shell file `/home/<user>/.local/share/nautilus/scripts/send-with-pairdrop.sh` is executable. Otherwise, use `chmod +x send-with-pairdrop.sh`
6. You are done! You can now send multiple files and directories directly via PairDrop:

> _context menu > Scripts > send-with-pairdrop.sh_

<br>

## File Handling API
The [File Handling API](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/how-to/handle-files)
was implemented, but it was removed as default file associations were overwritten ([#17](https://github.com/schlagmichdoch/PairDrop/issues/17),
[#116](https://github.com/schlagmichdoch/PairDrop/issues/116) [#190](https://github.com/schlagmichdoch/PairDrop/issues/190))
and it only worked with explicitly specified file types and not with directories at all.

[< Back](/README.md)
