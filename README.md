# PairDrop 

[PairDrop](https://pairdrop.net) is a sublime alternative to AirDrop that works on all platforms.

It uses peer to peer connection in the same local network/Wi-Fi or with paired devices to send images, documents or text.
As it is web based, it runs on all devices.

You want to quickly send a file from your phone to your laptop?
<br>You want to share photos in original quality with friends that use a mixture of Android and iOS?
<br>You want to share private files peer to peer between Linux systems?
<br>AirDrop is unreliable again?
<br>_Send it with PairDrop!_

Developed based on [Snapdrop](https://github.com/RobinLinus/snapdrop)

## Differences to Snapdrop

### Device Pairing
* Pair devices via 6-digit code or QR-Code
* Pair devices outside your local network or in complex network environment (public Wi-Fi, company network, Apple Private Relay, VPN etc.).
* Connect to devices on your mobile hotspot.
* Paired devices will always find each other via shared secrets even after reopening the browser or the Progressive Web App
* You will always discover devices on your local network. Paired devices are shown additionally.
* Paired devices outside your local network that are behind a NAT are connected automatically via [Open Relay: Free WebRTC TURN Server](https://www.metered.ca/tools/openrelay/)

### [Improved UI for sending/receiving files](https://github.com/RobinLinus/snapdrop/issues/560)
* Files are transferred only after a request is accepted first. On transfer completion they are downloaded automatically if possible.
* Multiple files are downloaded as ZIP file
* On iOS and Android the devices share menu is opened instead of downloading the files
* Multiple files are transferred at once with an overall progress indicator

### Share Files Directly From Share / Context Menu
* [Share files directly from context menu on Windows](/docs/how-to.md#share-files-directly-from-context-menu-on-windows)
* [Share directly from share menu on iOS](/docs/how-to.md#share-directly-from-share-menu-on-ios)
* [Share directly from share menu on Android](/docs/how-to.md#share-directly-from-share-menu-on-android)


### Other changes
* [Paste Mode](https://github.com/RobinLinus/snapdrop/pull/534)
* [Prevent devices from sleeping on file transfer](https://github.com/RobinLinus/snapdrop/pull/413)
* Open PairDrop on multiple tabs simultaneously (Thanks [@willstott101](https://github.com/willstott101))
* [Video and Audio preview](https://github.com/RobinLinus/snapdrop/pull/455) (Thanks [@victorwads](https://github.com/victorwads))
* Node-only implementation (Thanks [@Bellisario](https://github.com/Bellisario))
* Automatic restart on error (Thanks [@KaKi87](https://github.com/KaKi87))
* Lots of stability fixes (Thanks [@MWY001](https://github.com/MWY001) [@skiby7](https://github.com/skiby7) and [@willstott101](https://github.com/willstott101))
* To host PairDrop on your local network (e.g. on Raspberry Pi): [All peers connected with private IPs are discoverable by each other](https://github.com/RobinLinus/snapdrop/pull/558)

## Screenshots
![Pairdrop Preview](/docs/pairdrop_screenshot_mobile.gif)

## PairDrop is built with the following awesome technologies:
* Vanilla HTML5 / ES6 / CSS3 frontend
* [WebRTC](http://webrtc.org/) / [WebSockets](http://www.websocket.org/)
* [NodeJS](https://nodejs.org/en/) backend
* [Progressive Web App](https://wikipedia.org/wiki/Progressive_Web_App)
* [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
* [zip.js](https://gildas-lormeau.github.io/zip.js/)

Have any questions? Read our [FAQ](/docs/faq.md).

You can [host your own instance with Docker](/docs/host-your-own.md).


## Support the Community
PairDrop is free and always will be. Still, we have to pay for the domain.

To contribute and support me:<br>
<a href="https://www.buymeacoffee.com/pairdrop" target="_blank">
<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" >
</a>

Thanks a lot for supporting free and open software!

To support the original Snapdrop and its creator go to [his GitHub page](https://github.com/RobinLinus/snapdrop).

## How to contribute

Feel free to [open an issue](https://github.com/schlagmichdoch/pairdrop/issues/new/choose) or a
[pull request](https://github.com/schlagmichdoch/pairdrop/pulls) but follow
[Contributing Guidelines](/CONTRIBUTING.md).
