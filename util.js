/* Utilidades generales */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var TZ = 'America/Bogota';

  var U = (AP.U = {});

  U.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  // Credencial aleatoria de 130 bits en base32 (sin caracteres ambiguos). Solo usa caracteres
  // del modo alfanumérico del código QR, lo que produce códigos más pequeños y fáciles de leer.
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  U.newToken = function () {
    var b = crypto.getRandomValues(new Uint8Array(26));
    var s = '';
    for (var i = 0; i < 26; i++) s += B32[b[i] & 31];
    return s;
  };
  U.QR_PREFIX = 'AVP1:';
  U.qrPayload = function (token) { return U.QR_PREFIX + token; };
  // Interpreta el texto leído: acepta "AVP1:XXXX" o el código suelto digitado.
  U.parseQR = function (text) {
    if (!text) return null;
    var t = String(text).trim().toUpperCase().replace(/\s+/g, '');
    if (t.indexOf(U.QR_PREFIX) === 0) t = t.slice(U.QR_PREFIX.length);
    if (!/^[0-9A-Z]{10,40}$/.test(t)) return null;
    return t;
  };

  U.normDoc = function (s) { return String(s || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); };
  U.normPlaca = function (s) { return String(s || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); };
  U.fold = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  };
  U.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 2 ? p[2][0] : (p[1] || '')[0] || '')).toUpperCase();
  };

  // ---------- Fechas (siempre en hora de Colombia) ----------
  var fmtCache = {};
  function fmt(opts) {
    var k = JSON.stringify(opts);
    if (!fmtCache[k]) fmtCache[k] = new Intl.DateTimeFormat('es-CO', Object.assign({ timeZone: TZ }, opts));
    return fmtCache[k];
  }
  U.toDate = function (v) { return v instanceof Date ? v : (v ? new Date(v) : null); };
  U.fDate = function (v) { var d = U.toDate(v); return d && !isNaN(d) ? fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(d) : ''; };
  U.fTime = function (v) { var d = U.toDate(v); return d && !isNaN(d) ? fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d) : ''; };
  U.fDateTime = function (v) { var d = U.toDate(v); return d && !isNaN(d) ? U.fDate(d) + ' ' + U.fTime(d) : ''; };
  U.fLong = function (v) {
    var d = U.toDate(v); if (!d || isNaN(d)) return '';
    return fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d) + ', ' + U.fTime(d);
  };
  // Partes de fecha en hora de Colombia
  U.partsCO = function (v) {
    var d = U.toDate(v) || new Date();
    var p = {};
    fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    if (p.hour === '24') p.hour = '00';
    return p;
  };
  // 'AAAA-MM-DD' de hoy (o de la fecha dada) en Colombia
  U.ymd = function (v) { var p = U.partsCO(v); return p.year + '-' + p.month + '-' + p.day; };
  // Convierte 'AAAA-MM-DD' + 'HH:MM' (hora Colombia, UTC-5 fijo) a Date
  U.fromLocal = function (ymd, hm) {
    if (!ymd) return null;
    return new Date(ymd + 'T' + (hm || '00:00') + ':00-05:00');
  };
  U.toLocalInput = function (v) { // para <input type="datetime-local">
    var p = U.partsCO(v); return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  };
  U.fromLocalInput = function (s) { return s ? new Date(s + ':00-05:00') : null; };
  U.startOfDayCO = function (v) { return U.fromLocal(U.ymd(v), '00:00'); };
  U.addDays = function (d, n) { return new Date(U.toDate(d).getTime() + n * 86400000); };
  U.rel = function (v) {
    var d = U.toDate(v); if (!d) return 'nunca';
    var s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 45) return 'hace un momento';
    var m = Math.round(s / 60); if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60); if (h < 24) return 'hace ' + h + ' h ' + (m % 60) + ' min';
    var dd = Math.floor(h / 24); return 'hace ' + dd + (dd === 1 ? ' día' : ' días');
  };
  U.duracion = function (desde, hasta) {
    var ms = (U.toDate(hasta) || new Date()) - U.toDate(desde);
    if (!(ms >= 0)) return '';
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60);
    return h ? h + ' h ' + (m % 60) + ' min' : m + ' min';
  };

  // ---------- Criptografía ----------
  U.sha256 = async function (data) {
    var buf;
    if (typeof data === 'string') buf = new TextEncoder().encode(data);
    else if (data instanceof Blob) buf = await data.arrayBuffer();
    else buf = data;
    if (!(window.crypto && crypto.subtle)) return '';
    var h = await crypto.subtle.digest('SHA-256', buf);
    return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  };
  // Derivación PBKDF2-SHA256 (para el PIN de los vigilantes; nunca se guarda el PIN en claro)
  U.randomHex = function (bytes) {
    var a = new Uint8Array(bytes); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  };
  U.randomDigits = function (n) {
    var out = '', a = new Uint32Array(n); crypto.getRandomValues(a);
    for (var i = 0; i < n; i++) out += String(a[i] % 10);
    return out;
  };
  U.pbkdf2 = async function (secret, saltHex, iterations) {
    if (!(window.crypto && crypto.subtle)) throw new Error('Este navegador no permite validar el PIN de forma segura. Abra la aplicación desde su dirección https.');
    var salt = new Uint8Array(saltHex.match(/../g).map(function (x) { return parseInt(x, 16); }));
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations }, key, 256);
    return Array.prototype.map.call(new Uint8Array(bits), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  };
  // Huella de un registro: JSON con claves ordenadas
  U.hashRecord = function (obj) {
    var keys = Object.keys(obj).filter(function (k) { return k !== 'Hash' && obj[k] !== undefined && obj[k] !== null && obj[k] !== ''; }).sort();
    var canon = keys.map(function (k) { return JSON.stringify(k) + ':' + JSON.stringify(obj[k]); }).join(',');
    return U.sha256('{' + canon + '}');
  };

  // ---------- Imágenes ----------
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('No fue posible leer la imagen.')); };
      img.src = src;
    });
  }
  // Reduce una foto. mode 'fit' (conserva todo) o 'cover' (recorta al tamaño w×h).
  U.processImage = async function (file, opt) {
    opt = Object.assign({ max: 1600, quality: 0.78, mode: 'fit', w: 0, h: 0 }, opt || {});
    var url = URL.createObjectURL(file);
    try {
      var img;
      if (window.createImageBitmap) {
        try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { img = null; }
      }
      if (!img) img = await loadImage(url);
      var sw = img.width, sh = img.height, sx = 0, sy = 0, dw, dh;
      if (opt.mode === 'cover') {
        dw = opt.w; dh = opt.h;
        var r = Math.max(dw / sw, dh / sh);
        var cw = dw / r, ch = dh / r;
        sx = (sw - cw) / 2; sy = (sh - ch) / 2; sw = cw; sh = ch;
      } else {
        var k = Math.min(1, opt.max / Math.max(sw, sh));
        dw = Math.round(sw * k); dh = Math.round(sh * k);
      }
      var c = document.createElement('canvas');
      c.width = dw; c.height = dh;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dw, dh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', opt.quality); });
      var dataUrl = opt.dataUrl ? c.toDataURL('image/jpeg', opt.quality) : null;
      return { blob: blob, dataUrl: dataUrl, w: dw, h: dh };
    } finally { URL.revokeObjectURL(url); }
  };
  // Fotografía de evidencia: se reduce hasta que pese menos de ~450 KB (límite de un registro en la base de datos).
  // La huella SHA-256 se calcula después, sobre la imagen exacta que se guarda.
  U.fotoEvidencia = async function (file) {
    var pasos = [[1600, 0.78], [1280, 0.72], [1024, 0.66], [800, 0.6]];
    var r = null;
    for (var i = 0; i < pasos.length; i++) {
      r = await U.processImage(file, { max: pasos[i][0], quality: pasos[i][1] });
      if (r.blob.size <= 450000) break;
    }
    return r;
  };
  // Foto de persona para cotejo visual: baja resolución deliberada (minimización de datos).
  U.personPhoto = function (file) {
    return U.processImage(file, { mode: 'cover', w: 240, h: 300, quality: 0.72, dataUrl: true })
      .then(function (r) { return r.dataUrl; });
  };

  // Avatar con iniciales (para personas sin foto)
  U.avatar = function (name, size) {
    size = size || 96;
    var colors = ['#66754e', '#4f6b5a', '#7a6a3a', '#5a5f66', '#6d5a7a', '#3f6573'];
    var n = 0; String(name || '').split('').forEach(function (ch) { n = (n + ch.charCodeAt(0)) % 997; });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + Math.round(size * 1.25) + '" viewBox="0 0 80 100">' +
      '<rect width="80" height="100" fill="' + colors[n % colors.length] + '"/>' +
      '<text x="40" y="60" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">' +
      U.initials(name).replace(/[<>&"]/g, '') + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  // ---------- QR ----------
  U.qrSvg = function (text, cell, margin) {
    var q = qrcode(0, 'M');
    q.addData(text, /^[0-9A-Z $%*+\-./:]*$/.test(text) ? 'Alphanumeric' : 'Byte');
    q.make();
    return q.createSvgTag({ cellSize: cell || 4, margin: margin == null ? 4 : margin, scalable: true });
  };
  U.qrCanvas = function (text, px) {
    var q = qrcode(0, 'M');
    q.addData(text, /^[0-9A-Z $%*+\-./:]*$/.test(text) ? 'Alphanumeric' : 'Byte');
    q.make();
    var n = q.getModuleCount(), quiet = 4, total = n + quiet * 2;
    var cell = Math.max(1, Math.floor(px / total));
    var c = document.createElement('canvas');
    c.width = c.height = cell * total;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) {
      if (q.isDark(r, col)) ctx.fillRect((col + quiet) * cell, (r + quiet) * cell, cell, cell);
    }
    return c;
  };

  // ---------- Archivos ----------
  // Descarga un archivo generado. Dentro de claude.ai usa el permiso de descarga del visor.
  U.download = async function (blob, name) {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        var dl = await window.claude.use('downloads');
        if (dl) {
          try { await dl.save({ filename: name, data: blob }); }
          catch (e) { if (e && e.code !== 'declined' && AP.toast) AP.toast('No fue posible descargar el archivo en esta vista (' + (e.code || e.message) + ').', 'warn'); }
          return;
        }
      }
    } catch (e) { /* se usa la descarga normal */ }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };
  U.blobToBase64 = function (blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1]); };
      fr.onerror = rej; fr.readAsDataURL(blob);
    });
  };
  U.csv = function (rows) {
    function cell(v) {
      if (v === null || v === undefined) return '';
      var s = String(v);
      // Neutraliza fórmulas al abrir en Excel (inyección CSV)
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return '﻿' + rows.map(function (r) { return r.map(cell).join(';'); }).join('\r\n');
  };
  U.safeName = function (s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^0-9A-Za-z_\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  };

  // ---------- Dispositivo ----------
  U.deviceId = function () {
    var k = 'ap.dispositivo';
    var v = null;
    try { v = localStorage.getItem(k); } catch (e) { /* sin almacenamiento */ }
    if (!v) {
      v = 'DISP-' + U.newToken().slice(0, 6);
      try { localStorage.setItem(k, v); } catch (e) { /* ignorar */ }
    }
    return v;
  };
  U.isMobile = function () { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900); };

  // ---------- Sonido y vibración ----------
  var actx = null;
  U.beep = function (kind) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var seq = kind === 'deny' ? [[330, 0, 0.18], [260, 0.22, 0.28]] : kind === 'warn' ? [[620, 0, 0.12], [620, 0.18, 0.12]] : [[880, 0, 0.12]];
      seq.forEach(function (s) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = s[0]; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, actx.currentTime + s[1]);
        g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + s[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + s[1] + s[2]);
        o.connect(g); g.connect(actx.destination);
        o.start(actx.currentTime + s[1]); o.stop(actx.currentTime + s[1] + s[2] + 0.02);
      });
    } catch (e) { /* sin audio */ }
    try { if (navigator.vibrate) navigator.vibrate(kind === 'deny' ? [120, 80, 220] : kind === 'warn' ? [80, 60, 80] : 60); } catch (e) { /* ignorar */ }
  };

  U.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  U.chunk = function (arr, n) { var o = []; for (var i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
  U.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  U.yesNo = function (v) { return v === true ? 'Sí' : v === false ? 'No' : ''; };
  U.parseBool = function (v) {
    if (typeof v === 'boolean') return v;
    var s = U.fold(v); return s === 'si' || s === 'sí' || s === 'true' || s === 'x' || s === '1' || s === 'yes';
  };
})();
