/*
 * Cast bookmarklet: adds a Chromecast button to <video> elements.
 *
 * Loads the Google Cast SDK, opens the device picker and sends the video URL
 * to the Chromecast's Default Media Receiver. The TV then streams the video
 * straight from the server, so the computer is no longer needed.
 *
 * - For Video.js players the button goes into the control bar (works in
 *   fullscreen too); elsewhere it floats in the top right corner of the video.
 * - Click: pick a device and play the video on the TV from the current position.
 *   Click while it plays on the TV: stop casting and seek the local video to
 *   where the TV left off.
 * - Also picks up videos that appear on the page later.
 * - Works in Chrome (and Chromium-based browsers with Cast support).
 */
(function () {
  'use strict';
  var W = window, D = document;

  if (W.__castBm) { W.__castBm.rescan(); return; }
  W.__castBm = { rescan: function () {} };  // guard against a second run while the SDK loads

  var SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  var ICON_OFF = 'M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z';
  var ICON_ON = 'M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5v1.63c3.96 1.28 7.09 4.41 8.37 8.37H19V7zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z';
  var ACTIVE = '#8ab4f8';

  var btns = new Map();   // <video> -> { b: <button>, bar: bool }
  var ctx, player;
  var castVideo = null;   // video currently playing on the TV
  var lastTime = 0;       // last known position on the TV

  function toast(msg, ms) {
    var t = D.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:50%;bottom:24px;' +
      'transform:translateX(-50%);background:#202124;color:#fff;font:14px/1.4 system-ui,sans-serif;' +
      'padding:10px 16px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.5);max-width:90vw';
    (D.fullscreenElement || D.documentElement).appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 4000);
  }

  /* --- video URL --------------------------------------------------------- */

  function typeOf(url) {
    return /\.m3u8(\?|$)/i.test(url) ? 'application/x-mpegurl'
      : /\.mpd(\?|$)/i.test(url) ? 'application/dash+xml'
      : /\.webm(\?|$)/i.test(url) ? 'video/webm'
      : 'video/mp4';
  }

  function mediaUrl(v) {
    var url = v.currentSrc || v.src;
    if (!url) { var s = v.querySelector('source[src]'); if (s) url = s.src; }
    if (url && !/^blob:/.test(url)) return url;
    // MediaSource (HLS/DASH via JS): look for a manifest among the loaded resources.
    var m = performance.getEntriesByType('resource')
      .map(function (e) { return e.name; })
      .filter(function (n) { return /\.(m3u8|mpd)(\?|$)/i.test(n); });
    return m[0] || null;
  }

  /* --- Cast ---------------------------------------------------------------- */

  function load(v) {
    var s = ctx.getCurrentSession();
    var url = mediaUrl(v);
    if (!s) return;
    if (!url) {
      toast('Could not find the video URL (MediaSource stream, no manifest found).', 6000);
      return;
    }
    var info = new chrome.cast.media.MediaInfo(url, typeOf(url));
    info.contentUrl = url;
    info.streamType = chrome.cast.media.StreamType.BUFFERED;
    var md = new chrome.cast.media.GenericMediaMetadata();
    md.title = D.title;
    if (v.poster) md.images = [new chrome.cast.Image(v.poster)];
    info.metadata = md;

    var req = new chrome.cast.media.LoadRequest(info);
    req.autoplay = true;
    req.currentTime = v.currentTime || 0;

    s.loadMedia(req).then(function () {
      castVideo = v;
      lastTime = req.currentTime;
      v.pause();
      paint();
    }, function (err) {
      toast('The Chromecast rejected the video (' + err + '). The server may require cookies/Referer, ' +
        'or it is HLS/DASH without CORS.', 7000);
    });
  }

  function onClick(v, e) {
    e.preventDefault();
    e.stopPropagation();
    var s = ctx.getCurrentSession();
    if (s && castVideo === v) { ctx.endCurrentSession(true); return; }
    if (s) { load(v); return; }
    ctx.requestSession().then(function () { load(v); }, function (err) {
      if (err !== chrome.cast.ErrorCode.CANCEL) toast('Could not connect to the Chromecast (' + err + ').');
    });
  }

  /* --- buttons ------------------------------------------------------------ */

  function icon(d) {
    var NS = 'http://www.w3.org/2000/svg';
    var s = D.createElementNS(NS, 'svg'), p = D.createElementNS(NS, 'path');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', '22');
    s.setAttribute('height', '22');
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'display:block;margin:auto;pointer-events:none';
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    s.appendChild(p);
    return s;
  }

  function stop(e) { e.stopPropagation(); }

  function makeButton(v) {
    var b = D.createElement('button');
    b.type = 'button';
    b.setAttribute('data-cast-bm', '');
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'dblclick'].forEach(function (t) {
      b.addEventListener(t, stop);
    });
    b.addEventListener('click', function (e) { onClick(v, e); });

    // Video.js: put the button in the control bar, before PiP/fullscreen.
    var vjs = v.closest('.video-js');
    var bar = vjs && vjs.querySelector('.vjs-control-bar');
    if (bar) {
      b.className = 'vjs-control vjs-button';
      b.style.cssText = 'display:flex;align-items:center;justify-content:center;cursor:pointer';
      var before = bar.querySelector('.vjs-picture-in-picture-control, .vjs-fullscreen-control');
      bar.insertBefore(b, before);
      return { b: b, bar: true };
    }

    // Otherwise a floating button over the video.
    b.style.cssText = 'all:initial;position:fixed;z-index:2147483647;width:40px;height:40px;' +
      'display:flex;align-items:center;justify-content:center;border-radius:50%;' +
      'background:rgba(0,0,0,.6);color:#fff;cursor:pointer;opacity:.8';
    b.addEventListener('mouseenter', function () { b.style.opacity = '1'; });
    b.addEventListener('mouseleave', function () { b.style.opacity = '.8'; });
    D.documentElement.appendChild(b);
    return { b: b, bar: false };
  }

  function place(v, o) {
    if (o.bar) return;
    var b = o.b, fs = D.fullscreenElement;
    var host = fs && fs.tagName !== 'VIDEO' && fs.contains(v) ? fs : D.documentElement;
    if (b.parentNode !== host) host.appendChild(b);
    var r = v.getBoundingClientRect();
    var visible = r.width >= 120 && r.height >= 80 && r.bottom > 0 && r.top < innerHeight &&
      (!fs || fs.contains(v));
    b.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    b.style.top = Math.max(r.top, 0) + 8 + 'px';
    b.style.left = Math.min(r.right, innerWidth) - 48 + 'px';
  }

  function paint() {
    var s = ctx && ctx.getCurrentSession();
    var dev = s && s.getCastDevice().friendlyName;
    btns.forEach(function (o, v) {
      var on = !!s && castVideo === v;
      o.b.replaceChildren(icon(on ? ICON_ON : ICON_OFF));
      o.b.style.color = on ? ACTIVE : o.bar ? '' : '#fff';
      o.b.title = on ? 'Stop casting to ' + dev
        : s ? 'Play on ' + dev
        : 'Cast to Chromecast';
      o.b.setAttribute('aria-label', o.b.title);
    });
  }

  function rescan() {
    var added = false;
    D.querySelectorAll('video').forEach(function (v) {
      if (!btns.has(v)) { btns.set(v, makeButton(v)); added = true; }
    });
    btns.forEach(function (o, v) {
      // The video is gone, or Video.js re-rendered its control bar and dropped the button.
      if (!v.isConnected || (o.bar && !o.b.isConnected)) {
        o.b.remove();
        btns.delete(v);
        if (v.isConnected) { btns.set(v, makeButton(v)); added = true; }
      }
    });
    btns.forEach(function (o, v) { place(v, o); });
    if (added) paint();
    return btns.size;
  }

  var queued = false;
  function placeSoon() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; btns.forEach(function (o, v) { place(v, o); }); });
  }

  /* --- start --------------------------------------------------------------- */

  function init(ok) {
    if (!ok) { delete W.__castBm; toast('Cast is not available here, this bookmarklet needs Chrome.', 6000); return; }
    var F = cast.framework;
    ctx = F.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });
    player = new F.RemotePlayer();
    var rpc = new F.RemotePlayerController(player);
    rpc.addEventListener(F.RemotePlayerEventType.CURRENT_TIME_CHANGED, function () {
      if (player.isMediaLoaded) lastTime = player.currentTime;
    });
    ctx.addEventListener(F.CastContextEventType.SESSION_STATE_CHANGED, function (e) {
      if (e.sessionState === F.SessionState.SESSION_ENDED && castVideo) {
        try { castVideo.currentTime = lastTime; } catch (_) {}
        castVideo = null;
      }
      paint();
    });

    W.__castBm = { rescan: function () { toast('Cast: videos on this page: ' + rescan()); } };
    var n = rescan();
    paint();
    setInterval(rescan, 1000);
    addEventListener('scroll', placeSoon, { capture: true, passive: true });
    addEventListener('resize', placeSoon);
    D.addEventListener('fullscreenchange', placeSoon);
    toast(n ? 'Cast: ready, videos on this page: ' + n
      : 'Cast: ready. No video on this page yet, the button will appear automatically.');
  }

  if (W.cast && W.cast.framework) {
    init(true);
  } else {
    var prev = W.__onGCastApiAvailable;
    W.__onGCastApiAvailable = function (ok) {
      if (typeof prev === 'function') { try { prev(ok); } catch (_) {} }
      init(ok);
    };
    var sc = D.createElement('script');
    sc.src = SDK;
    sc.onerror = function () {
      delete W.__castBm;
      toast('Could not load the Cast SDK, the page probably blocks it (CSP).', 6000);
    };
    (D.head || D.documentElement).appendChild(sc);
  }
})();
