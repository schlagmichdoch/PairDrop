# Frequently Asked Questions

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    Help! I can't install the PWA!
</summary>

if you are using a Chromium-based browser (Chrome, Edge, Brave, etc.), you can easily install PairDrop PWA on your desktop 
by clicking the install-button in the top-right corner while on [pairdrop.net](https://pairdrop.net).

<img width="400" src="pwa-install.png" alt="Example on how to install a pwa with Edge">

On Firefox, PWAs are installable via [this browser extensions](https://addons.mozilla.org/de/firefox/addon/pwas-for-firefox/)
</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    Shortcuts?
</summary>

Shortcuts!
- Send a message with `CTRL + ENTER`
- Close all send and pair dialogs by pressing `Escape`.
- Copy a received message to clipboard with `CTRL/⌘ + C`.
- Accept file transfer request with `Enter` and decline with `Escape`.
</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    How to save images directly to the gallery on iOS?
</summary>

Apparently, iOS does not allow images shared from a website to be saved to the gallery directly.
It simply does not offer the option for images shared from a website.

iOS Shortcuts to the win:
I created a simple iOS shortcut that takes your photos and saves them to your gallery:
https://routinehub.co/shortcut/13988/

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    Is it possible to send files or text directly from the context or share menu?
</summary>

Yes, it finally is!
* [Send files directly from context menu on Windows](/docs/how-to.md#send-files-directly-from-context-menu-on-windows)
* [Send directly from share menu on iOS](/docs/how-to.md#send-directly-from-share-menu-on-ios)
* [Send directly from share menu on Android](/docs/how-to.md#send-directly-from-share-menu-on-android)

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    Is it possible to send files or text directly via CLI?
</summary>

Yes, it is!

* [Send directly from command-line interface](/docs/how-to.md#send-directly-via-command-line-interface)

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    Are there any Third-Party Apps?
</summary>

Here's a list of some third-party apps compatible with PairDrop:

1. [Snapdrop Android App](https://github.com/fm-sys/snapdrop-android)
2. [Snapdrop for Firefox (Addon)](https://github.com/ueen/SnapdropFirefoxAddon)
3. Feel free to make one :)
</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    What about the connection? Is it a P2P-connection directly from device to device or is there any third-party-server?
</summary>

It uses a P2P connection if WebRTC is supported by the browser. WebRTC needs a Signaling Server, but it is only used to establish a connection and is not involved in the file transfer.

If your devices are paired and behind a NAT, the public TURN Server from [Open Relay](https://www.metered.ca/tools/openrelay/) is used to route your files and messages.

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    What about privacy? Will files be saved on third-party-servers?
</summary>

None of your files are ever sent to any server. Files are sent only between peers. PairDrop doesn't even use a database. If you are curious have a look [at the Server](https://github.com/schlagmichdoch/pairdrop/blob/master/index.js).
WebRTC encrypts the files on transit.

If your devices are paired and behind a NAT, the public TURN Server from [Open Relay](https://www.metered.ca/tools/openrelay/) is used to route your files and messages.

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    What about security? Are my files encrypted while being sent between the computers?
</summary>

Yes. Your files are sent using WebRTC, which encrypts them on transit. To ensure the connection is secure and there is no MITM, compare the security number shown under the device name on both devices. The security number is different for every connection.

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    Transferring many files with paired devices takes too long
</summary>

Naturally, if traffic needs to be routed through the turn server because your devices are behind different NATs, transfer speed decreases.

As the public TURN server used is not super fast, you can easily [specify to use your own TURN server](https://github.com/schlagmichdoch/PairDrop/blob/master/docs/host-your-own.md#specify-stunturn-servers) if you host your own instance.

Alternatively, you can open a hotspot on one of your devices to bridge the connection which makes transfers much faster as no TURN server is needed.

- [How to open a hotspot on Windows](https://support.microsoft.com/en-us/windows/use-your-windows-pc-as-a-mobile-hotspot-c89b0fad-72d5-41e8-f7ea-406ad9036b85#WindowsVersion=Windows_11)
- [How to open a hotspot on Mac](https://support.apple.com/guide/mac-help/share-internet-connection-mac-network-users-mchlp1540/mac)
- [Library to open a hotspot on Linux](https://github.com/lakinduakash/linux-wifi-hotspot)

You can also use mobile hotspots on phones to do that. 
Then, all data should be sent directly between devices and your data plan should not be charged.

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    Why don't you implement feature xyz?
</summary>

Snapdrop and PairDrop are a study in radical simplicity. The user interface is insanely simple. Features are chosen very carefully because complexity grows quadratically since every feature potentially interferes with each other feature. We focus very narrowly on a single use case: instant file transfer. 
We are not trying to optimize for some edge-cases. We are optimizing the user flow of the average users. Don't be sad if we decline your feature request for the sake of simplicity. 

If you want to learn more about simplicity you can read [Insanely Simple: The Obsession that Drives Apple's Success](https://www.amazon.com/Insanely-Simple-Ken-Segall-audiobook/dp/B007Z9686O) or [Thinking, Fast and Slow](https://www.amazon.com/Thinking-Fast-Slow-Daniel-Kahneman/dp/0374533555).

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    Snapdrop and PairDrop are awesome! How can I support them? 
</summary>

* [Buy me a coffee to support open source software](https://www.buymeacoffee.com/pairdrop)
* [File bugs, give feedback, submit suggestions](https://github.com/schlagmichdoch/pairdrop/issues)
* Share PairDrop on social media.
* Fix bugs and make a pull request. 
* Do security analysis and suggestions
* To support the original Snapdrop and its creator go to [his GitHub page](https://github.com/RobinLinus/snapdrop)

</details>

<details>
<summary style="font-size:1.25em;margin-top: 24px; margin-bottom: 16px; font-weight: var(--base-text-weight-semibold, 600); line-height: 1.25;">
    How does it work?
</summary>

[See here for Information about the Technical Implementation](/docs/technical-documentation.md)
</details>

[< Back](/README.md)
