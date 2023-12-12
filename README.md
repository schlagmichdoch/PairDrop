<div align="center">
  <a href="https://github.com/schlagmichdoch/PairDrop">
    <img src="public/images/android-chrome-512x512.png" alt="Logo"  width="150" height="150">
  </a>
 
  <h1>PairDrop</h1>

  <p>
    Local file sharing in your browser. Inspired by Apple's AirDrop.
    <br />
    <a href="https://pairdrop.net"><strong>Explore  »</strong></a>
    <br />
    <br />
    <a href="https://github.com/schlagmichdoch/PairDrop/issues">Report Bug</a>
    ·
    <a href="https://github.com/schlagmichdoch/PairDrop/issues">Request Feature</a>
  </p>
</div>

## Features
[PairDrop](https://pairdrop.net) is a sublime alternative to AirDrop that works on all platforms.

- File Sharing on your local network
  - Send images, documents or text via peer to peer connection to devices on the same local network.
- Internet Transfers
  - Join temporary public rooms to transfer files easily over the internet!
- Web-Application 
  - As it is web based, it runs on all devices.

You want to quickly send a file from your phone to your laptop?
<br>You want to share photos in original quality with friends that use a mixture of Android and iOS?
<br>You want to share private files peer to peer between Linux systems?
<br>AirDrop is unreliable again?
<br>_Send it with PairDrop!_

Developed based on [Snapdrop](https://github.com/RobinLinus/snapdrop)

## Differences to Snapdrop
<details><summary>Click to expand</summary>

### Paired Devices and Public Rooms - Internet Transfer
* Transfer files over the internet between paired devices or by entering temporary public rooms.
* Connect to devices in complex network environments (public Wi-Fi, company network, Apple Private Relay, VPN etc.).
* Connect to devices on your mobile hotspot.
* Devices outside your local network that are behind a NAT are connected automatically via the PairDrop TURN server.
* Connect to devices on your mobile hotspot.
* You will always discover devices on your local network. Paired devices and devices in the same public room are shown additionally.

#### Persistent Device Pairing
* Pair your devices via a 6-digit code or a QR-Code.
* Paired devices will always find each other via shared secrets independently of their local network. 
* Paired devices are persistent. You find your devices even after reopening PairDrop.
* You can edit and unpair devices easily
* Ideal to always connect easily to your own devices

#### Temporary Public Rooms
* Enter a public room via a 5-letter code or a QR-Code.
* Enter a public room to temporarily connect to devices outside your local network.
* All devices in the same public room see each other mutually.
* Public rooms are temporary. Public rooms are left as soon as PairDrop is closed.
* Ideal to connect easily to others in complex network situations or over the internet.

### [Improved UI for sending/receiving files](https://github.com/RobinLinus/snapdrop/issues/560)
* Files are transferred only after a request is accepted first. On transfer completion files are downloaded automatically if possible.
* Multiple files are downloaded as a ZIP file
* On iOS and Android, in addition to downloading, files can be shared or saved to the gallery via the Share menu.
* Multiple files are transferred at once with an overall progress indicator

### Send Files or Text Directly From Share Menu, Context Menu or CLI
* [Send files directly from context menu on Windows](docs/how-to.md#send-multiple-files-and-directories-directly-from-context-menu-on-windows)
* [Send files directly from context menu on Ubuntu (using Nautilus)](/docs/how-to.md#send-multiple-files-and-directories-directly-from-context-menu-on-ubuntu-using-nautilus)
* [Send files directly from share menu on iOS](docs/how-to.md#send-directly-from-share-menu-on-ios)
* [Send files directly from share menu on Android](docs/how-to.md#send-directly-from-share-menu-on-android)
* [Send files directly via command-line interface](docs/how-to.md#send-directly-via-command-line-interface)

### Other changes
* Change your display name permanently to easily differentiate your devices
* [Paste files/text and choose the recipient afterwords ](https://github.com/RobinLinus/snapdrop/pull/534)
* [Prevent devices from sleeping on file transfer](https://github.com/RobinLinus/snapdrop/pull/413)
* Warn user before PairDrop is closed on file transfer
* Open PairDrop on multiple tabs simultaneously (Thanks [@willstott101](https://github.com/willstott101))
* [Video and Audio preview](https://github.com/RobinLinus/snapdrop/pull/455) (Thanks [@victorwads](https://github.com/victorwads))
* Switch theme back to auto/system after darkmode or lightmode is enabled
* Node-only implementation (Thanks [@Bellisario](https://github.com/Bellisario))
* Automatic restart on error (Thanks [@KaKi87](https://github.com/KaKi87))
* Lots of stability fixes (Thanks [@MWY001](https://github.com/MWY001) [@skiby7](https://github.com/skiby7) and [@willstott101](https://github.com/willstott101))
* To host PairDrop on your local network (e.g. on Raspberry Pi): [All peers connected with private IPs are discoverable by each other](https://github.com/RobinLinus/snapdrop/pull/558)
* When hosting PairDrop yourself you can [set your own STUN/TURN servers](docs/host-your-own.md#specify-stunturn-servers)
* Built-in translations via [Weblate](https://hosted.weblate.org/engage/pairdrop/)
* Airy design (Thanks [@Avieshek](https://linktr.ee/avieshek/))

</details>

## Screenshots
<img src="docs/pairdrop_screenshot_mobile.gif" alt="Gif of Screenshots that show PairDrop in use" style="width: 300px">

## PairDrop is built with the following awesome technologies:
* Vanilla HTML5 / ES6 / CSS3 frontend
* [WebRTC](http://webrtc.org/) / [WebSockets](http://www.websocket.org/)
* [NodeJS](https://nodejs.org/en/) backend
* [Progressive Web App](https://wikipedia.org/wiki/Progressive_Web_App)
* [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
* [Weblate](https://weblate.org/) Web based localization tool
* [zip.js](https://github.com/gildas-lormeau/zip.js) JavaScript library to zip and unzip files ([BSD 3-Clause License](licenses/BSD_3-Clause-zip-js))
* [NoSleep](https://github.com/richtr/NoSleep.js) JavaScript library to prevent display sleep and enable wake lock in any Android or iOS web browser ([MIT License](licenses/MIT-NoSleep))
* [heic2any](https://github.com/alexcorvi/heic2any) JavaScript library to convert HEIC/HEIF images to PNG/GIF/JPEG ([MIT License](licenses/MIT-heic2any))
* [cyrb53](https://github.com/bryc) Super fast hash function

Have any questions? Read our [FAQ](docs/faq.md).

You can [host your own instance with Docker](docs/host-your-own.md).


## Support PairDrop
<a href="https://www.buymeacoffee.com/pairdrop" target="_blank">
<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" >
</a>

PairDrop is free and always will be.
Still, we have to pay for the domain and the server.

To contribute and support, please use BuyMeACoffee via the button above.

Thanks a lot for supporting free and open software!

## Translate PairDrop
<a href="https://hosted.weblate.org/engage/pairdrop/">
<img src="https://hosted.weblate.org/widget/pairdrop/pairdrop-spa/open-graph.png" alt="Translation status" style="width: 300px" />
</a>

## How to contribute

Feel free to [open an issue](https://github.com/schlagmichdoch/pairdrop/issues/new/choose) or a
[pull request](https://github.com/schlagmichdoch/pairdrop/pulls) but follow
[Contributing Guidelines](CONTRIBUTING.md).
