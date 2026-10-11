/* Lector de códigos QR con la cámara del celular */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});

  // Lee un código QR desde una fotografía (alternativa cuando la cámara en vivo no está disponible)
  AP.decodeQRFromFile = async function (file) {
    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('No fue posible leer la imagen.')); }; i.src = url; });
      if ('BarcodeDetector' in window) {
        try {
          var det = new window.BarcodeDetector({ formats: ['qr_code'] });
          var codes = await det.detect(img);
          if (codes && codes.length) return codes[0].rawValue;
        } catch (e) { /* se intenta con jsQR */ }
      }
      var sizes = [1000, 1600, 700];
      for (var i = 0; i < sizes.length; i++) {
        var k = Math.min(1, sizes[i] / Math.max(img.width, img.height));
        var w = Math.round(img.width * k), hh = Math.round(img.height * k);
        var c = document.createElement('canvas'); c.width = w; c.height = hh;
        var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, w, hh);
        var r = window.jsQR(ctx.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: 'attemptBoth' });
        if (r && r.data) return r.data;
      }
      return null;
    } finally { URL.revokeObjectURL(url); }
  };

  AP.Scanner = function (video, canvas, onCode, onError) {
    var stopped = false;
    var stream = null, raf = null, running = false, detector = null, lastText = '', lastAt = 0, wake = null, track = null, busy = false;

    async function start() {
      if (running) return;
      stopped = false;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Este navegador no permite usar la cámara. Use Chrome (Android) o Safari (iPhone) y abra la app desde una dirección https.');
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch (e) {
        var msg = e && e.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Autorícelo en la configuración del navegador para este sitio.'
          : e && e.name === 'NotFoundError' ? 'No se encontró una cámara en el dispositivo.' : 'No fue posible abrir la cámara (' + (e && e.message) + ').';
        throw new Error(msg);
      }
      if (stopped) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; return; }
      video.srcObject = stream;
      video.setAttribute('playsinline', ''); video.muted = true;
      await video.play().catch(function () { /* iOS reproduce tras interacción */ });
      track = stream.getVideoTracks()[0];
      if ('BarcodeDetector' in window) {
        try {
          var fm = await window.BarcodeDetector.getSupportedFormats();
          if (fm.indexOf('qr_code') >= 0) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch (e) { detector = null; }
      }
      try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
      if (stopped) { stop(); return; }
      running = true;
      loop();
    }

    function loop() {
      if (!running) return;
      raf = requestAnimationFrame(tick);
    }

    async function tick() {
      if (!running) return;
      if (busy || video.readyState < 2) return loop();
      busy = true;
      try {
        var text = null;
        if (detector) {
          var codes = await detector.detect(video);
          if (codes && codes.length) text = codes[0].rawValue;
        } else if (window.jsQR) {
          var vw = video.videoWidth, vh = video.videoHeight;
          var k = Math.min(1, 720 / Math.max(vw, vh));
          var w = Math.round(vw * k), hh = Math.round(vh * k);
          canvas.width = w; canvas.height = hh;
          var ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, w, hh);
          var img = ctx.getImageData(0, 0, w, hh);
          var r = window.jsQR(img.data, w, hh, { inversionAttempts: 'attemptBoth' });
          if (r && r.data) text = r.data;
        }
        if (text) {
          var now = Date.now();
          if (text !== lastText || now - lastAt > 2500) {
            lastText = text; lastAt = now;
            onCode(text);
          }
        }
      } catch (e) {
        if (onError) onError(e);
      } finally {
        busy = false;
        loop();
      }
    }

    function stop() {
      stopped = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null; track = null;
      try { if (wake) wake.release(); } catch (e) { /* ignorar */ }
      wake = null;
    }

    async function torch(on) {
      if (!track) return false;
      try {
        var caps = track.getCapabilities ? track.getCapabilities() : {};
        if (!caps.torch) return false;
        await track.applyConstraints({ advanced: [{ torch: !!on }] });
        return true;
      } catch (e) { return false; }
    }

    return { start: start, stop: stop, torch: torch, pause: function () { running = false; }, resume: function () { if (stream && !running) { running = true; loop(); } } };
  };
})();
