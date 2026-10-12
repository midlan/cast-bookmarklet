# cast-bookmarklet

A bookmarklet for desktop Chrome that adds a Chromecast button to `<video>` elements on a page.

Unlike Chrome's own "Cast…" menu item, it doesn't mirror the tab. It sends only the video URL to the
Chromecast (Default Media Receiver), and the TV streams the video straight from the server. You can
close the tab or turn the computer off. In short, it behaves like the cast button Chrome on Android
shows on videos.

## Installation

1. Open [`cast-bookmarklet.txt`](cast-bookmarklet.txt) and copy its entire contents (it starts with `javascript:`).
2. In Chrome, open the bookmark manager (Ctrl+Shift+O), choose **Add new bookmark** from the ⋮ menu
   and paste the copied text into the URL field.

## Usage

On a page with a video, click the bookmark.

- **Video.js**: the button appears in the control bar next to PiP and also works in fullscreen.
- **Other players**: a floating button in the top right corner of the video.
- **Click**: pick a Chromecast; the video starts on the TV from the current position and pauses on the computer.
- **Click again while casting**: stops casting and seeks the video on the computer to where the TV left off.
- Videos that appear on the page later get a button automatically.

## Limitations

- Works only in Chrome (and Chromium-based browsers with Cast support).
- The Chromecast fetches the video without cookies or a Referer, so it won't work for videos behind
  a login or URLs tied to a session.
- For HLS/DASH via MediaSource (`blob:` URLs) the bookmarklet tries to find the manifest
  (`.m3u8`/`.mpd`) among the loaded resources. The server must also send CORS headers.
- Doesn't work with DRM, videos inside iframes or inside shadow DOM.
- Pages whose CSP blocks `www.gstatic.com` won't let the Cast SDK load (the bookmarklet tells you).
- After a page reload Chrome rejoins the running session, but the button doesn't know which video is
  playing on the TV. To stop casting in that case, use the media button in Chrome's toolbar.

## Building

`cast-bookmarklet.js` is the readable source; `cast-bookmarklet.txt` is produced from it by minification:

```sh
npm install
npm run build
```

The button icons are based on [Material Icons](https://github.com/google/material-design-icons) (Apache License 2.0).
