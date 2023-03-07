# Frequently Asked Questions

### Instructions / Discussions
* [Video Instructions](https://www.youtube.com/watch?v=4XN02GkcHUM) (Big thanks to [TheiTeckHq](https://www.youtube.com/channel/UC_DUzWMb8gZZnAbISQjmAfQ))
* [idownloadblog](http://www.idownloadblog.com/2015/12/29/snapdrop/)
* [thenextweb](http://thenextweb.com/insider/2015/12/27/snapdrop-is-a-handy-web-based-replacement-for-apples-fiddly-airdrop-file-transfer-tool/)
* [winboard](http://www.winboard.org/artikel-ratgeber/6253-dateien-vom-desktop-pc-mit-anderen-plattformen-teilen-mit-snapdrop.html)
* [免費資源網路社群](https://free.com.tw/snapdrop/)
* [Hackernews](https://news.ycombinator.com/front?day=2020-12-24)
* [Reddit](https://www.reddit.com/r/Android/comments/et4qny/snapdrop_is_a_free_open_source_cross_platform/)
* [Producthunt](https://www.producthunt.com/posts/snapdrop)

### Help! I can't install the PWA!
if you are using a Chromium-based browser (Chrome, Edge, Brave, etc.), you can easily install PairDrop PWA on your desktop 
by clicking the install-button in the top-right corner while on [pairdrop.net](https://pairdrop.net).

<img src="pwa-install.png" alt="Example on how to install a pwa with Edge">

On Firefox, PWAs are installable via [this browser extensions](https://addons.mozilla.org/de/firefox/addon/pwas-for-firefox/)

### Are there any shortcuts?
Sure!
- Send a message with `CTRL + ENTER`
- Close all send and pair dialogs by pressing `Escape`.
- Copy a received message to clipboard with `CTRL/⌘ + C`.
- Accept file transfer request with `Enter` and decline with `Escape`.

### When I receive images on iOS I cannot add them directly to the gallery?
Apparently, iOS does not allow images shared from a website to be saved to the gallery directly.
It simply does not offer the option for images shared from a website.

iOS Shortcuts to the win:
I created a simple iOS shortcut that takes your photos and saves them to your gallery:
https://routinehub.co/shortcut/13988/

### Is it possible to send files or text directly from the context or share menu?
Yes, it finally is!
* [Send files directly from context menu on Windows](/docs/how-to.md#send-files-directly-from-context-menu-on-windows)
* [Send directly from share menu on iOS](/docs/how-to.md#send-directly-from-share-menu-on-ios)
* [Send directly from share menu on Android](/docs/how-to.md#send-directly-from-share-menu-on-android)

### Is it possible to send files or text directly via CLI?
Yes, it is!

* [Send directly from command-line interface](/docs/how-to.md#send-directly-via-command-line-interface)
### What about the connection? Is it a P2P-connection directly from device to device or is there any third-party-server?
It uses a P2P connection if WebRTC is supported by the browser. WebRTC needs a Signaling Server, but it is only used to establish a connection and is not involved in the file transfer.

If your devices are paired and behind a NAT, the public TURN Server from [Open Relay](https://www.metered.ca/tools/openrelay/) is used to route your files and messages.

### What about privacy? Will files be saved on third-party-servers?
None of your files are ever sent to any server. Files are sent only between peers. PairDrop doesn't even use a database. If you are curious have a look [at the Server](https://github.com/schlagmichdoch/pairdrop/blob/master/index.js).
WebRTC encrypts the files on transit.

If your devices are paired and behind a NAT, the public TURN Server from [Open Relay](https://www.metered.ca/tools/openrelay/) is used to route your files and messages.

### What about security? Are my files encrypted while being sent between the computers?
Yes. Your files are sent using WebRTC, which encrypts them on transit. To ensure the connection is secure and there is no MITM, compare the security number shown under the device name on both devices. The security number is different for every connection.

### Transferring many files with paired devices takes too long
Naturally, if traffic needs to be routed through the turn server because your devices are behind different NATs, transfer speed decreases.

As the public TURN server used is not super fast, you can easily [specify to use your own TURN server](https://github.com/schlagmichdoch/PairDrop/blob/master/docs/host-your-own.md#specify-stunturn-servers) if you host your own instance.

Alternatively, you can open a hotspot on one of your devices to bridge the connection which makes transfers much faster as no TURN server is needed.

- [How to open a hotspot on Windows](https://support.microsoft.com/en-us/windows/use-your-windows-pc-as-a-mobile-hotspot-c89b0fad-72d5-41e8-f7ea-406ad9036b85#WindowsVersion=Windows_11)
- [How to open a hotspot on Mac](https://support.apple.com/guide/mac-help/share-internet-connection-mac-network-users-mchlp1540/mac)
- [Library to open a hotspot on Linux](https://github.com/lakinduakash/linux-wifi-hotspot)

You can also use mobile hotspots on phones to do that. 
Then, all data should be sent directly between devices and your data plan should not be charged.

### Why don't you implement feature xyz?
Snapdrop and PairDrop are a study in radical simplicity. The user interface is insanely simple. Features are chosen very carefully because complexity grows quadratically since every feature potentially interferes with each other feature. We focus very narrowly on a single use case: instant file transfer. 
We are not trying to optimize for some edge-cases. We are optimizing the user flow of the average users. Don't be sad if we decline your feature request for the sake of simplicity. 

If you want to learn more about simplicity you can read [Insanely Simple: The Obsession that Drives Apple's Success](https://www.amazon.com/Insanely-Simple-Ken-Segall-audiobook/dp/B007Z9686O) or [Thinking, Fast and Slow](https://www.amazon.com/Thinking-Fast-Slow-Daniel-Kahneman/dp/0374533555).


### Snapdrop and PairDrop are awesome! How can I support them? 
* [Buy me a cover to support open source software](https://www.buymeacoffee.com/pairdrop)
* [File bugs, give feedback, submit suggestions](https://github.com/schlagmichdoch/pairdrop/issues)
* Share PairDrop on social media.
* Fix bugs and make a pull request. 
* Do security analysis and suggestions


### How does it work?
[See here for Information about the Technical Implementation](/docs/technical-documentation.md)

[< Back](/README.md)
