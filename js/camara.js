/* Cámara en vivo para fotografías de evidencia (rondas y novedades).
 * La foto se toma en el momento con la cámara del celular, dentro de la aplicación: no hay forma de elegir una imagen de la
 * galería ni de los archivos. Cada foto lleva impresos la fecha, la hora, el lugar y el usuario, y se reduce para ocupar poco
 * espacio en la base de datos. La huella SHA-256 se calcula sobre la imagen exacta que se guarda. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function conf() {
    var c = (AP.CFG && AP.CFG.fotoRonda) || {};
    return { max: Number(c.max) || 800, calidad: Number(c.calidad) || 0.55 };
  }
  function selloFecha(d) {
    var p = U.partsCO(d);
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute + ':' + p.second;
  }

  // Dibuja la franja con la fecha, la hora y los datos del registro en la parte inferior de la foto
  function sellar(ctx, w, hh, lineas) {
    var fs = Math.max(12, Math.round(w / 46));
    var pad = Math.round(fs * 0.6), alto = pad * 2 + lineas.length * Math.round(fs * 1.3);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, hh - alto, w, alto);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    lineas.forEach(function (l, i) {
      ctx.font = (i === 0 ? 'bold ' : '') + fs + 'px Arial, Helvetica, sans-serif';
      var t = String(l || '');
      while (t.length > 4 && ctx.measureText(t).width > w - pad * 2) t = t.slice(0, -2);
      if (t !== String(l || '')) t = t.replace(/.$/, '…');
      ctx.fillText(t, pad, hh - alto + pad + i * Math.round(fs * 1.3));
    });
  }

  AP.Camara = {
    sellar: sellar, selloFecha: selloFecha,
    // opt: { titulo, ayuda, lineas: function (fecha) → [texto…] }
    // Devuelve null si la persona cancela, o { blob, url, sha256, w, h, bytes, fecha }.
    tomar: function (opt) {
      opt = opt || {};
      return new Promise(function (resolve) {
        var C = conf();
        var stream = null, track = null, terminado = false, tomada = null, linterna = false;
        var video = h('video', { class: 'cam-video', playsinline: true, muted: true, autoplay: true });
        var preview = h('img', { class: 'cam-preview hidden', alt: 'Fotografía tomada' });
        var msg = h('p', { class: 'cam-msg' }, opt.ayuda || AP.t('Encuadre el lugar y oprima el botón para tomar la foto.'));
        var btnTomar = h('button', { class: 'cam-shutter', type: 'button', 'aria-label': AP.t('Tomar la foto'), disabled: true, onclick: capturar });
        var btnLuz = h('button', { class: 'icon-btn light', style: { visibility: 'hidden' }, type: 'button', 'aria-label': AP.t('Linterna'), title: AP.t('Linterna'), onclick: alternarLuz }, AP.icon('flash', 22));
        var usar = h('button', { class: 'btn primary big', type: 'button', onclick: function () { cerrar(tomada); } }, AP.icon('check', 20), AP.t('Usar esta foto'));
        var repetir = h('button', { class: 'btn light big', type: 'button', onclick: otraVez }, AP.icon('camera', 20), AP.t('Repetir'));
        var accionesFoto = h('div', { class: 'row gap center wrap hidden' }, repetir, usar);
        var page = h('div', { class: 'cam-page', role: 'dialog', 'aria-modal': 'true', 'aria-label': opt.titulo || AP.t('Tomar foto') },
          video, preview,
          h('div', { class: 'scan-top' },
            h('button', { class: 'icon-btn light', type: 'button', 'aria-label': AP.t('Cancelar'), onclick: function () { cerrar(null); } }, AP.icon('x', 24)),
            h('strong', null, opt.titulo || AP.t('Tomar foto')), btnLuz),
          h('div', { class: 'scan-bottom' }, msg, h('div', { class: 'row center' }, btnTomar), accionesFoto));
        document.body.appendChild(page);
        document.body.classList.add('cam-abierta');

        function alHash() { cerrar(null); }
        window.addEventListener('hashchange', alHash);

        function parar() {
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
          stream = null; track = null;
        }
        function cerrar(res) {
          if (terminado) return;
          terminado = true;
          parar();
          window.removeEventListener('hashchange', alHash);
          document.body.classList.remove('cam-abierta');
          page.remove();
          if (!res && tomada) URL.revokeObjectURL(tomada.url);
          resolve(res || null);
        }
        async function abrir() {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return fallo(AP.t('Este navegador no permite usar la cámara. Use Chrome (Android) o Safari (iPhone).'));
          }
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
          } catch (e) {
            return fallo(e && e.name === 'NotAllowedError' ? AP.t('Permiso de cámara denegado. Autorícelo en la configuración del navegador para este sitio.')
              : e && e.name === 'NotFoundError' ? AP.t('No se encontró una cámara en el dispositivo.') : AP.t('No fue posible abrir la cámara.') + ' (' + (e && e.message) + ')');
          }
          if (terminado) { parar(); return; }
          video.srcObject = stream;
          await video.play().catch(function () { /* iOS reproduce tras interacción */ });
          track = stream.getVideoTracks()[0];
          try { var caps = track.getCapabilities ? track.getCapabilities() : {}; if (caps.torch) btnLuz.style.visibility = 'visible'; } catch (e) { /* sin linterna */ }
          btnTomar.disabled = false;
        }
        function fallo(texto) {
          msg.textContent = texto + ' ' + AP.t('Sin la foto tomada en el momento no se puede registrar. Avise al Director de Seguridad Integral.');
          msg.classList.add('err');
          btnTomar.classList.add('hidden');
        }
        async function alternarLuz() {
          if (!track) return;
          linterna = !linterna;
          try { await track.applyConstraints({ advanced: [{ torch: linterna }] }); } catch (e) { linterna = false; }
          btnLuz.classList.toggle('on', linterna);
        }
        async function capturar() {
          if (!stream || video.readyState < 2 || !video.videoWidth) return AP.toast(AP.t('La cámara aún no está lista.'), 'warn');
          btnTomar.disabled = true;
          try {
            var vw = video.videoWidth, vh = video.videoHeight;
            var k = Math.min(1, C.max / Math.max(vw, vh));
            var w = Math.round(vw * k), hh = Math.round(vh * k);
            var c = document.createElement('canvas'); c.width = w; c.height = hh;
            var ctx = c.getContext('2d');
            ctx.drawImage(video, 0, 0, w, hh);
            var fecha = new Date();
            sellar(ctx, w, hh, (opt.lineas ? opt.lineas(fecha) : []).filter(function (x) { return x != null; }));
            var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', C.calidad); });
            if (!blob) throw new Error(AP.t('No fue posible tomar la foto.'));
            var sha = await U.sha256(blob);
            tomada = { blob: blob, url: URL.createObjectURL(blob), sha256: sha, w: w, h: hh, bytes: blob.size, fecha: fecha.toISOString() };
            preview.src = tomada.url;
            preview.classList.remove('hidden'); video.classList.add('hidden');
            btnTomar.classList.add('hidden'); accionesFoto.classList.remove('hidden');
            msg.textContent = AP.t('Revise la foto: si se ve bien el lugar, oprima «Usar esta foto».');
          } catch (e) {
            AP.toast(e.message, 'error');
            btnTomar.disabled = false;
          }
        }
        function otraVez() {
          if (tomada) URL.revokeObjectURL(tomada.url);
          tomada = null;
          preview.classList.add('hidden'); video.classList.remove('hidden');
          accionesFoto.classList.add('hidden'); btnTomar.classList.remove('hidden'); btnTomar.disabled = false;
          msg.textContent = opt.ayuda || AP.t('Encuadre el lugar y oprima el botón para tomar la foto.');
        }
        abrir();
      });
    }
  };
})();
