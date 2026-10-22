/* Rondas: el rondero marca los puntos de control leyendo su QR y reporta novedades con fotografía;
 * el Director administra los puntos, imprime sus códigos y consulta las marcaciones. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  var PREFIJO = 'AVPR:';
  var MAX_FOTOS = 3;
  function nowIso() { return new Date().toISOString(); }
  function operador() { return AP.Session.operador(); }
  function puntosActivos() {
    return (AP.Sync.puntos || []).filter(function (p) { return p.Activo !== false; })
      .sort(function (a, b) { return (Number(a.Orden) || 999) - (Number(b.Orden) || 999) || (U.fold(a.Title) < U.fold(b.Title) ? -1 : 1); });
  }
  function leerCodigo(texto) {
    var t = String(texto || '').trim().toUpperCase().replace(/\s+/g, '');
    if (t.indexOf(PREFIJO) === 0) t = t.slice(PREFIJO.length);
    return /^[0-9A-Z]{8,40}$/.test(t) ? t : null;
  }
  // Meta de cada punto: revistas exigidas por turno y minutos mínimos entre revistas para que cuenten
  function meta(p) {
    var v = Math.max(1, Math.round(Number(p.VecesTurno) || 1));
    var m = Math.max(0, Math.round(Number(p.IntervaloMin) || 0));
    return { veces: v, intervalo: v > 1 ? m : 0 };
  }
  function fmtMin(m) { return m >= 60 ? (Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '')) : m + ' min'; }
  // Cumplimiento de la ronda de un turno: una revista cuenta si es la primera del punto o si pasó el intervalo mínimo
  // desde la anterior que contó; las demás quedan registradas pero no suman a la meta.
  function cumplimiento(puntos, marcas, ahora) {
    ahora = ahora || new Date();
    var porPunto = {};
    marcas.slice().sort(function (a, b) { return a.FechaHora < b.FechaHora ? -1 : 1; }).forEach(function (x) { (porPunto[x.PuntoId] = porPunto[x.PuntoId] || []).push(x); });
    var tot = { req: 0, ok: 0, marcas: 0, completos: 0, novedades: 0, noCuentan: 0 };
    var filas = puntos.map(function (p) {
      var mt = meta(p), ms = porPunto[p.id] || [], validas = [];
      ms.forEach(function (x) {
        var t = new Date(x.FechaHora).getTime(), u = validas[validas.length - 1];
        if (!u || t - new Date(u.FechaHora).getTime() >= mt.intervalo * 60000) validas.push(x); else x._noCuenta = true;
      });
      var ok = Math.min(validas.length, mt.veces);
      var ult = validas[validas.length - 1] || null;
      var proxima = ok >= mt.veces ? null : ult && mt.intervalo ? new Date(new Date(ult.FechaHora).getTime() + mt.intervalo * 60000) : null;
      tot.req += mt.veces; tot.ok += ok; tot.marcas += ms.length; tot.noCuentan += ms.length - validas.length;
      tot.novedades += ms.filter(function (x) { return x.Novedad; }).length;
      if (ok >= mt.veces) tot.completos++;
      return { p: p, meta: mt, marcas: ms, validas: validas, ok: ok, completo: ok >= mt.veces, ultima: ms[ms.length - 1] || null, proxima: proxima, disponible: !proxima || proxima <= ahora };
    });
    tot.pct = tot.req ? Math.round(tot.ok / tot.req * 100) : 0;
    tot.puntos = puntos.length;
    return { filas: filas, tot: tot };
  }

  AP.Rondas = {
    meta: meta, fmtMin: fmtMin, cumplimiento: cumplimiento,
    payload: function (codigo) { return PREFIJO + codigo; },
    // Marcaciones hechas en este celular (para mostrar el avance de la ronda del turno)
    locales: async function () {
      var l = (await AP.Store.get('rondas:hechas')) || [];
      var lim = Date.now() - 2 * 86400000;
      return l.filter(function (x) { return new Date(x.FechaHora).getTime() >= lim; });
    },
    guardarLocal: async function (x) {
      var l = await AP.Rondas.locales();
      l.push(x);
      await AP.Store.set('rondas:hechas', l);
    }
  };

  // =================== PANEL DEL RONDERO ===================
  // Como el panel de portería, pero solo con la información de la ronda: revistas hechas y pendientes por punto, la próxima
  // revista válida (intervalo mínimo que fija el Director) y el porcentaje de cumplimiento del turno.
  AP.route('/rondas', function () {
    var t = AP.Session.turno;
    var resumen = h('div');
    var lista = h('div', { class: 'stack sm' });
    var content = h('div', { class: 'stack' },
      h('a', { class: 'scan-cta', href: '#/ronda-escanear' }, h('span', { class: 'scan-ico' }, AP.icon('qr', 44)),
        h('span', null, h('strong', null, AP.t('Marcar punto de control')), h('small', null, AP.t('Lea el código QR fijado en el punto')))),
      resumen,
      lista,
      h('div', { class: 'quick-dial' },
        (AP.CFG.telefonos || {}).director ? h('a', { class: 'btn', href: 'tel:' + AP.CFG.telefonos.director }, AP.icon('phone', 18), 'Director') : null,
        (AP.CFG.telefonos || {}).supervisor ? h('a', { class: 'btn', href: 'tel:' + AP.CFG.telefonos.supervisor }, AP.icon('phone', 18), 'Supervisor') : null,
        h('a', { class: 'btn', href: AP.waLink(AP.WA_DIRECTOR), target: '_blank', rel: 'noopener' }, AP.icon('whatsapp', 18), 'Dir. Seguridad')),
      h('div', { class: 'p-foot' },
        h('span', null, 'Turno de: ', h('strong', null, operador().nombre), t ? ' (' + t.usuario + ') desde las ' + U.fTime(t.inicio) : null),
        h('span', null, 'Puntos: ' + (AP.Sync.state.lastPull ? 'actualizados ' + U.rel(AP.Sync.state.lastPull) : 'sin descargar') + ' · ' + AP.Sync.pendingCount() + ' por enviar'),
        AP.selectorIdioma(true),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn small', type: 'button', onclick: function () { AP.Sync.run().then(function () { AP.render(); }); } }, AP.icon('sync', 16), AP.t('Sincronizar')),
          h('a', { class: 'btn small', href: '#/manual-uso' }, AP.icon('file', 16), AP.t('Manual')),
          h('button', { class: 'btn small', type: 'button', onclick: function () { AP.Views.definirPin(); } }, AP.icon('lock', 16), AP.t('Cambiar mi PIN')),
          AP.State.installPrompt ? h('button', { class: 'btn small', type: 'button', onclick: function () { AP.State.installPrompt.prompt(); } }, AP.icon('download', 16), AP.t('Instalar app')) : null,
          h('button', { class: 'btn small', type: 'button', onclick: AP.Views.logout }, AP.icon('logout', 16), AP.t('Cerrar turno')))));
    AP.porteriaShell('Panel de rondas', content, { sub: 'Ronda de seguridad · ' + AP.CFG.empresa });
    async function pintar() {
      var pts = puntosActivos();
      var hechas = (await AP.Rondas.locales()).filter(function (x) { return t && x.TurnoId === t.id; });
      if (!pts.length) {
        resumen.replaceChildren();
        lista.replaceChildren(AP.empty('pin', 'No hay puntos de control', AP.Sync.state.lastPull ? 'El Director de Seguridad Integral aún no ha registrado puntos de ronda.' : 'Conéctese a internet para descargar los puntos de control.'));
        return;
      }
      var c = cumplimiento(pts, hechas), T = c.tot;
      var kind = T.pct >= 100 ? 'ok' : T.pct >= 70 ? 'warn' : 'deny';
      var kpi = function (n, l, k) { return h('div', { class: 'kpi ' + (k || '') }, h('strong', null, String(n)), h('span', null, l)); };
      resumen.replaceChildren(h('section', { class: 'card stack sm ronda-res' },
        h('div', { class: 'row between wrap gap' }, h('h3', null, 'Cumplimiento de la ronda del turno'), AP.pill(T.pct + ' %', kind)),
        h('div', { class: 'ronda-prog ' + kind, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(T.pct), 'aria-label': 'Cumplimiento ' + T.pct + ' %' },
          h('span', { style: { width: Math.min(100, T.pct) + '%' } })),
        h('div', { class: 'kpis kpis-sm' },
          kpi(T.ok + ' / ' + T.req, 'Revistas que cuentan'),
          kpi(T.completos + ' / ' + T.puntos, 'Puntos completos', T.completos === T.puntos ? 'ok' : ''),
          kpi(T.req - T.ok, 'Revistas pendientes', T.req - T.ok ? 'warn' : 'ok'),
          kpi(T.novedades, 'Novedades reportadas', T.novedades ? 'warn' : '')),
        T.noCuentan ? h('p', { class: 'muted small' }, T.noCuentan + ' marcación(es) hechas antes del intervalo mínimo quedaron registradas pero no cuentan para la meta.') : null));
      var ahora = new Date();
      lista.replaceChildren(h('div', { class: 'list' }, c.filas.map(function (f) {
        var p = f.p, u = f.ultima;
        var estado = f.completo ? AP.pill('Completo', 'ok')
          : f.disponible ? AP.pill(f.ok ? 'Revista disponible' : 'Pendiente', f.ok ? 'brand' : 'warn')
            : AP.pill('Desde las ' + U.fTime(f.proxima), 'muted');
        var meta = f.meta.veces > 1 ? f.meta.veces + ' revistas por turno, cada ' + fmtMin(f.meta.intervalo) + ' como mínimo' : '1 revista por turno';
        return h('div', { class: 'list-item static ronda-pt' + (f.completo ? ' ok' : '') },
          h('span', { class: 'dot ' + (f.completo ? 'ok' : u && u.Novedad ? 'warn' : '') }),
          h('div', null, h('strong', null, (p.Orden ? p.Orden + '. ' : '') + p.Title + '  ', h('span', { class: 'ronda-cuenta' }, f.ok + '/' + f.meta.veces)),
            h('small', null, [p.Ubicacion, meta].filter(Boolean).join(' · ')),
            h('small', null, u ? 'Última: ' + U.fTime(u.FechaHora) + (u.Novedad ? ' · con novedad' : '') + (!f.completo && !f.disponible ? ' · la próxima cuenta desde las ' + U.fTime(f.proxima) + ' (faltan ' + fmtMin(Math.ceil((f.proxima - ahora) / 60000)) + ')' : '') : 'Sin revistar en este turno')),
          h('div', { class: 'stack xs end' }, estado,
            h('a', { class: 'btn small ghost', href: '#/ronda-punto?id=' + encodeURIComponent(p.id) + '&manual=1', title: 'Úselo solo si el código QR del punto está dañado o no se puede leer' }, 'Sin QR')));
      })));
    }
    pintar();
    AP.onLeave(AP.Sync.on(U.debounce(pintar, 300)));
    // El tiempo para la próxima revista válida corre aunque no haya cambios
    var tick = setInterval(function () { if (location.hash.indexOf('#/rondas') === 0 && !document.querySelector('.modal-wrap')) pintar(); }, 60000);
    AP.onLeave(function () { clearInterval(tick); });
  });

  // Resumen de cumplimiento del turno del rondero (al cerrar el turno)
  AP.Rondas.resumenTurno = async function (t) {
    var pts = puntosActivos();
    var hechas = (await AP.Rondas.locales()).filter(function (x) { return t && x.TurnoId === t.id; });
    var c = cumplimiento(pts, hechas);
    return { c: c, texto: 'Cumplimiento de ronda: ' + c.tot.pct + ' % (' + c.tot.ok + ' de ' + c.tot.req + ' revistas; ' + c.tot.completos + ' de ' + c.tot.puntos + ' puntos completos; ' + c.tot.novedades + ' novedades).' };
  };

  // =================== LECTURA DEL QR DEL PUNTO ===================
  AP.route('/ronda-escanear', function () {
    var video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
    var canvas = h('canvas', { class: 'hidden' });
    var msg = h('p', { class: 'scan-msg' }, 'Ubique el código QR del punto dentro del recuadro');
    var hecho = false;
    function resolver(texto) {
      var c = leerCodigo(texto);
      var p = c ? puntosActivos().find(function (x) { return String(x.Codigo || '').toUpperCase() === c; }) : null;
      if (!p) {
        U.beep('deny');
        msg.textContent = c && texto.toUpperCase().indexOf(PREFIJO) !== 0 ? 'Ese código no es de un punto de ronda (puede ser una credencial de persona).' : 'Código no reconocido como punto de control activo. Sincronice o informe al Director.';
        msg.classList.add('err');
        hecho = false;
        return;
      }
      hecho = true; scanner.stop(); U.beep('ok');
      AP.go('/ronda-punto?id=' + encodeURIComponent(p.id));
    }
    var scanner = AP.Scanner(video, canvas, function (text) { if (hecho || location.hash.indexOf('#/ronda-escanear') !== 0) return; resolver(text); }, function () { /* */ });
    AP.leerPunto = resolver; // también lo usan las pruebas automáticas
    async function desdeFoto() {
      var f = await AP.pickImage('environment');
      if (!f) return;
      msg.textContent = 'Leyendo la foto…'; msg.classList.remove('err');
      try {
        var text = await AP.decodeQRFromFile(f);
        if (!text) { msg.textContent = 'No se encontró un código QR en la foto. Intente de nuevo, más cerca y con buena luz.'; msg.classList.add('err'); return; }
        resolver(text);
      } catch (e) { msg.textContent = e.message; msg.classList.add('err'); }
    }
    var page = h('div', { class: 'scan-page' }, video, canvas,
      h('div', { class: 'scan-frame' }, h('span'), h('span'), h('span'), h('span')),
      h('div', { class: 'scan-top' },
        h('button', { class: 'icon-btn light', type: 'button', 'aria-label': 'Volver', onclick: function () { AP.go('/rondas'); } }, AP.icon('back', 24)),
        h('strong', null, 'Punto de control'), h('span')),
      h('div', { class: 'scan-bottom' }, msg,
        h('div', { class: 'row gap center wrap' },
          h('button', { class: 'btn light', type: 'button', onclick: desdeFoto }, AP.icon('camera', 18), 'Leer desde foto'))));
    AP.mount(page, 'is-scan');
    AP.onLeave(function () { scanner.stop(); });
    scanner.start().catch(function (e) { msg.textContent = e.message; msg.classList.add('err'); });
  });

  // =================== MARCACIÓN DEL PUNTO (con o sin novedad) ===================
  AP.route('/ronda-punto', function (qs) {
    var p = (AP.Sync.puntos || []).find(function (x) { return x.id === qs.id; });
    if (!p) { AP.toast('Punto de control no encontrado.', 'warn'); return AP.go('/rondas'); }
    var manual = qs.manual === '1';
    var fotos = [];
    var just = AP.textarea('Justificacion', '', { rows: 2, placeholder: 'Por qué no se leyó el código QR (dañado, retirado, sin luz…)' });
    var tipo = AP.select('TipoNovedad', [''].concat(AP.CAT.tiposNovedadRonda), '');
    var desc = AP.textarea('Descripcion', '', { rows: 3, placeholder: 'Qué encontró, dónde exactamente y qué hizo (a quién avisó)' });
    var galeria = h('div', { class: 'gallery' });
    var novBox = h('div', { class: 'stack sm' });
    var estado = AP.segmented('estado', [
      { value: 'ok', label: 'Sin novedad', icon: 'check', cls: 'in' },
      { value: 'nov', label: 'Con novedad', icon: 'alert', cls: 'deny' }
    ], 'ok', function () { pintarNov(); });
    function pintarFotos() {
      galeria.replaceChildren();
      fotos.forEach(function (f, i) {
        galeria.appendChild(h('figure', null, h('img', { src: f.url, alt: f.label }), h('figcaption', null, f.label),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitar foto', onclick: function () { URL.revokeObjectURL(f.url); fotos.splice(i, 1); pintarFotos(); } }, AP.icon('x', 16))));
      });
    }
    async function tomarFoto() {
      if (fotos.length >= MAX_FOTOS) return AP.toast('Máximo ' + MAX_FOTOS + ' fotografías por novedad.', 'warn');
      var file = await AP.pickImage('environment');
      if (!file) return;
      try {
        var r = await U.fotoEvidencia(file);
        var sha = await U.sha256(r.blob);
        var n = fotos.length + 1;
        fotos.push({ name: String(n).padStart(2, '0') + '_novedad.jpg', label: 'Novedad ' + n, blob: r.blob, url: URL.createObjectURL(r.blob), sha256: sha });
        pintarFotos();
      } catch (e) { AP.toast(e.message, 'error'); }
    }
    function pintarNov() {
      novBox.style.display = estado.dataset.value === 'nov' ? '' : 'none';
    }
    novBox.append(AP.field('Tipo de novedad *', tipo), AP.field('Descripción *', desc),
      h('div', { class: 'row gap wrap' }, h('button', { class: 'btn', type: 'button', onclick: tomarFoto }, AP.icon('camera', 18), 'Tomar fotografía')),
      galeria, h('p', { class: 'help' }, 'Fotografíe el hallazgo sin captar el rostro de personas cuando no sea necesario. Cada fotografía queda con su huella SHA-256.'));
    var saving = false;
    async function registrar() {
      if (saving) return;
      var nov = estado.dataset.value === 'nov';
      if (manual && just.value.trim().length < 6) return AP.toast('Explique por qué no se leyó el código QR del punto.', 'warn');
      if (nov && !tipo.value) return AP.toast('Seleccione el tipo de novedad.', 'warn');
      if (nov && desc.value.trim().length < 6) return AP.toast('Describa la novedad.', 'warn');
      if (nov && !fotos.length && !(await AP.confirm('Novedad sin fotografía', 'Se recomienda tomar al menos una fotografía de la novedad. ¿Registrarla sin fotografía?', 'Registrar sin foto', 'danger'))) return;
      saving = true;
      try {
        var u = operador();
        var f = {
          IdLocal: U.uuid(), Title: p.Title, PuntoId: p.id, Codigo: p.Codigo, Origen: manual ? 'Manual (sin lectura de QR)' : 'QR', FechaHora: nowIso(),
          Rondero: u.nombre, RonderoUsuario: u.usuario, TurnoId: u.turnoId, Dispositivo: U.deviceId(), SinConexion: !AP.Sync.state.online,
          Novedad: nov, TipoNovedad: nov ? tipo.value : undefined, Descripcion: nov ? desc.value.trim() : undefined, Justificacion: manual ? just.value.trim() : undefined
        };
        Object.keys(f).forEach(function (k) { if (f[k] === undefined || f[k] === '') delete f[k]; });
        f.Hash = await U.hashRecord(f);
        var photos = [];
        for (var i = 0; i < fotos.length; i++) photos.push({ name: fotos[i].name, label: fotos[i].label, type: 'image/jpeg', data: await fotos[i].blob.arrayBuffer(), sha256: fotos[i].sha256 });
        // ¿Cuenta para la meta? (intervalo mínimo desde la última revista válida del punto en el turno)
        var previas = (await AP.Rondas.locales()).filter(function (x) { return x.TurnoId === f.TurnoId && x.PuntoId === p.id; });
        var antes = cumplimiento([p], previas).filas[0];
        await AP.Sync.enqueue('ronda', f, photos);
        await AP.Rondas.guardarLocal({ IdLocal: f.IdLocal, PuntoId: p.id, Title: p.Title, FechaHora: f.FechaHora, TurnoId: f.TurnoId, Novedad: nov });
        var noCuenta = antes && !antes.completo && antes.proxima && new Date(f.FechaHora) < antes.proxima;
        if (noCuenta) AP.toast('Marcación registrada, pero NO cuenta para la meta: la próxima revista válida de este punto es desde las ' + U.fTime(antes.proxima) + ' (intervalo mínimo de ' + fmtMin(antes.meta.intervalo) + ').', 'warn', 9000);
        else if (antes && antes.completo) AP.toast('Marcación registrada. Este punto ya tenía completas sus revistas del turno.', 'info', 6000);
        fotos.forEach(function (x) { URL.revokeObjectURL(x.url); });
        U.beep(nov ? 'warn' : 'ok');
        if (nov) {
          var texto = 'Novedad de ronda en ' + p.Title + (p.Ubicacion ? ' (' + p.Ubicacion + ')' : '') + ' a las ' + U.fTime(f.FechaHora) + ': ' + tipo.value + '. ' + desc.value.trim() +
            '. Reportó: ' + u.nombre + (photos.length ? '. Fotografías en la app (Consola > Rondas).' : '.');
          AP.modal({
            title: 'Novedad registrada', onClose: function () { AP.go('/rondas'); },
            body: function (close) {
              return h('div', { class: 'stack' }, h('p', null, 'La novedad quedó registrada' + (AP.Sync.state.online ? '' : ' en el celular y se enviará cuando haya señal') + '. Avise de inmediato al Director de Seguridad Integral.'),
                h('a', { class: 'btn big block primary', href: AP.waLink(AP.WA_DIRECTOR, texto), target: '_blank', rel: 'noopener', onclick: function () { setTimeout(close, 400); } }, AP.icon('whatsapp', 22), 'Avisar al Director por WhatsApp'),
                (AP.CFG.telefonos || {}).director ? h('a', { class: 'btn block', href: 'tel:' + AP.CFG.telefonos.director }, AP.icon('phone', 18), 'Llamar al Director') : null,
                h('button', { class: 'btn block', type: 'button', onclick: function () { close(); } }, 'Continuar la ronda'));
            }
          });
        } else {
          if (!noCuenta && !(antes && antes.completo)) AP.toast('Punto marcado: ' + p.Title + ' (' + U.fTime(f.FechaHora) + ').', 'info', 3500);
          AP.go('/rondas');
        }
      } catch (e) { AP.toast('No se pudo registrar: ' + e.message, 'error', 8000); }
      finally { saving = false; }
    }
    var kv = function (k, v) { return v ? h('div', { class: 'kv' }, h('span', null, k), h('strong', null, v)) : null; };
    var cont = h('div', { class: 'stack' },
      h('div', { class: 'verdict ' + (manual ? 'warn' : 'ok') }, AP.icon(manual ? 'alert' : 'pin', 40),
        h('div', null, h('strong', null, p.Title), h('span', null, manual ? 'Marcación SIN lectura del código QR: queda señalada para revisión del Director.' : 'Código leído. Registre el estado del punto.'))),
      h('section', { class: 'card stack sm' }, kv('Ubicación', p.Ubicacion), kv('Instrucciones', p.Instrucciones), kv('Hora', U.fTime(new Date())),
        kv('Meta del turno', meta(p).veces > 1 ? meta(p).veces + ' revistas, con ' + fmtMin(meta(p).intervalo) + ' como mínimo entre una y otra' : '1 revista')),
      manual ? h('section', { class: 'card stack sm' }, AP.field('Justificación *', just)) : null,
      h('section', { class: 'card stack' }, h('h3', null, 'Estado del punto'), estado, novBox),
      h('div', { class: 'actions-sticky' }, h('button', { class: 'btn big block primary', type: 'button', onclick: registrar }, AP.icon('check', 22), 'Registrar marcación')));
    AP.porteriaShell('Punto de control', cont, { back: '/rondas', sub: 'Ronda de seguridad' });
    pintarNov();
    AP.onLeave(function () { fotos.forEach(function (x) { URL.revokeObjectURL(x.url); }); });
  });

  // =================== CONSOLA: MARCACIONES Y PUNTOS DE CONTROL ===================
  function errBox(e) { return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message); }
  function tabla(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a,input')) onRow(r); } : null }, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0] }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }
  function fotosDe(x) { try { var a = JSON.parse(x.Fotos || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

  AP.route('/consola/rondas', function (qs) {
    if (!AP.Session.can('ver')) { AP.go('/'); return; }
    var ED = AP.Session.can('editar');   // Gobierno Corporativo: solo consulta
    var tab = qs.t || 'cumplimiento';
    var content = h('div', { class: 'stack' });
    var tabs = h('div', { class: 'tabs' }, [['cumplimiento', 'Cumplimiento por turno'], ['marcaciones', 'Marcaciones'], ['puntos', 'Puntos de control y metas']].map(function (t) {
      return h('a', { class: t[0] === tab ? 'on' : '', href: '#/consola/rondas?t=' + t[0] }, t[1]);
    }));
    var box = h('div', { class: 'stack' });
    AP.consolaShell('/consola/rondas', 'Rondas de seguridad', content,
      tab === 'puntos' && ED ? h('button', { class: 'btn primary', type: 'button', onclick: function () { editarPunto(null); } }, AP.icon('plus', 18), 'Nuevo punto') : null);
    content.append(tabs, box);
    if (tab === 'puntos') puntos(); else if (tab === 'marcaciones') marcaciones(); else cumplimientoTurnos();

    // ---------- Cumplimiento por turno de cada rondero ----------
    // Turno = desde su inicio hasta su cierre (o hasta ahora si sigue abierto). Se calcula con la meta vigente de cada punto.
    function cumplimientoTurnos() {
      var desde = AP.input('desde', U.ymd(U.addDays(new Date(), -7)), { type: 'date' });
      var hasta = AP.input('hasta', U.ymd(), { type: 'date' });
      var q = AP.buscador('Buscar rondero o usuario', pintar);
      var out = h('div', { class: 'stack' });
      var turnos = [];
      var COLS = [
        ['Rondero', function (x) { return x.nombre; }, 28], ['Usuario', function (x) { return x.usuario; }, 14],
        ['Inicio del turno', function (x) { return x.inicio; }, 17], ['Cierre', function (x) { return x.fin || ''; }, 17], ['Estado', function (x) { return x.abierto ? 'Abierto' : 'Cerrado'; }, 10],
        ['Revistas que cuentan', function (x) { return x.c.tot.ok; }, 12], ['Revistas exigidas', function (x) { return x.c.tot.req; }, 12], ['Cumplimiento (%)', function (x) { return x.c.tot.pct; }, 12],
        ['Puntos completos', function (x) { return x.c.tot.completos + ' de ' + x.c.tot.puntos; }, 14], ['Marcaciones', function (x) { return x.c.tot.marcas; }, 11],
        ['Antes del intervalo (no cuentan)', function (x) { return x.c.tot.noCuentan; }, 14], ['Novedades', function (x) { return x.c.tot.novedades; }, 10],
        ['Puntos incompletos', function (x) { return x.c.filas.filter(function (f) { return !f.completo; }).map(function (f) { return f.p.Title + ' (' + f.ok + '/' + f.meta.veces + ')'; }).join('; '); }, 60]
      ];
      function filtrados() { return turnos.filter(function (x) { return AP.coincide(x, q.value, ['nombre', 'usuario']); }); }
      function pintar() {
        var l = filtrados();
        var prom = l.length ? Math.round(l.reduce(function (a, x) { return a + x.c.tot.pct; }, 0) / l.length) : 0;
        out.replaceChildren(
          h('div', { class: 'row gap wrap' }, AP.pill(l.length + ' turnos', 'brand'), l.length ? AP.pill('Promedio ' + prom + ' %', prom >= 100 ? 'ok' : prom >= 70 ? 'warn' : 'deny') : null),
          tabla([
            ['Turno', function (x) { return h('div', null, h('strong', null, x.nombre), h('small', { class: 'block muted' }, U.fDateTime(x.inicio) + ' → ' + (x.fin ? U.fDateTime(x.fin) : 'abierto'))); }],
            ['Cumplimiento', function (x) { var k = x.c.tot.pct >= 100 ? 'ok' : x.c.tot.pct >= 70 ? 'warn' : 'deny'; return h('div', { class: 'stack xs' }, AP.pill(x.c.tot.pct + ' %', k), h('div', { class: 'ronda-prog mini ' + k }, h('span', { style: { width: Math.min(100, x.c.tot.pct) + '%' } }))); }],
            ['Revistas', function (x) { return x.c.tot.ok + ' de ' + x.c.tot.req; }],
            ['Puntos completos', function (x) { return x.c.tot.completos + ' de ' + x.c.tot.puntos; }],
            ['No cuentan', function (x) { return x.c.tot.noCuentan ? String(x.c.tot.noCuentan) : ''; }],
            ['Novedades', function (x) { return x.c.tot.novedades ? String(x.c.tot.novedades) : ''; }]
          ], l, detalleTurno));
      }
      function detalleTurno(x) {
        AP.modal({ title: 'Ronda de ' + x.nombre + ' — ' + U.fDateTime(x.inicio), size: 'wide', body: h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, 'Turno ' + U.fDateTime(x.inicio) + ' → ' + (x.fin ? U.fDateTime(x.fin) : 'abierto') + '. Cumplimiento ' + x.c.tot.pct + ' % (' + x.c.tot.ok + ' de ' + x.c.tot.req + ' revistas).'),
          tabla([
            ['Punto', function (f) { return h('strong', null, f.p.Title); }],
            ['Meta', function (f) { return f.meta.veces > 1 ? f.meta.veces + ' cada ' + fmtMin(f.meta.intervalo) : '1'; }],
            ['Cuentan', function (f) { return h('span', { class: f.completo ? 'txt-ok' : 'txt-warn' }, f.ok + ' de ' + f.meta.veces); }],
            ['Marcaciones', function (f) { return f.marcas.map(function (m) { return U.fTime(m.FechaHora) + (m._noCuenta ? ' (no cuenta)' : '') + (m.Novedad ? ' · novedad' : ''); }).join(', ') || '—'; }]
          ], x.c.filas)) });
      }
      async function consultar() {
        var a = U.fromLocal(desde.value, '00:00'), b = U.fromLocal(hasta.value, '23:59');
        if (!a || !b || b < a) return AP.toast('Revise el rango de fechas.', 'warn');
        out.replaceChildren(AP.spinner('Consultando…'));
        try {
          var maxH = (AP.CFG.horasMaxTurno || 13) * 3600000;
          var r = await Promise.all([
            AP.B.listRange('AP_Turnos', 'FechaHora', a, new Date(b.getTime() + maxH)),
            AP.B.listRange('AP_Rondas', 'FechaHora', a, new Date(b.getTime() + maxH)),
            AP.B.listAll('AP_PuntosRonda')]);
          var ev = r[0], marcas = r[1], pts = r[2].filter(function (p) { return p.Activo !== false; });
          var cierres = {};
          ev.forEach(function (e) { if (/^(Fin|Cierre)/.test(e.Evento || '')) cierres[e.TurnoId] = e; });
          turnos = ev.filter(function (e) { return e.Evento === 'Inicio de turno' && e.Rol === 'Rondero' && e.FechaHora <= new Date(b.getTime() + 59999).toISOString(); }).map(function (e) {
            var c = cierres[e.TurnoId];
            var ms = marcas.filter(function (m) { return m.TurnoId === e.TurnoId; });
            return { nombre: e.Title, usuario: e.VigilanteUsuario, inicio: U.toDate(e.FechaHora), fin: c ? U.toDate(c.FechaHora) : null, abierto: !c, c: cumplimiento(pts, ms) };
          }).sort(function (x, y) { return x.inicio < y.inicio ? 1 : -1; });
          pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('route', 18), h('span', null, 'Cada punto tiene una meta: cuántas revistas por turno y el tiempo mínimo entre una y otra (en «Puntos de control y metas»). Una revista hecha antes de ese tiempo queda registrada, pero no cuenta para el cumplimiento. El porcentaje se calcula con la meta vigente de cada punto.')),
        h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta), q,
          h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar'),
          AP.btnExcel(function () {
            var l = filtrados();
            if (!l.length) return AP.toast('No hay turnos con el filtro actual.', 'warn');
            AP.exportar('Rondas_cumplimiento', COLS, l, 'xlsx', [['Periodo', desde.value + ' a ' + hasta.value], ['Filtro', q.value || 'ninguno'], ['Regla', 'Una revista cuenta si es la primera del punto en el turno o si pasó el intervalo mínimo desde la anterior que contó.'],
              ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Colecciones AP_Turnos, AP_Rondas y AP_PuntosRonda']]);
          })),
        out);
      consultar();
    }

    // ---------- Marcaciones ----------
    function marcaciones() {
      var desde = AP.input('desde', U.ymd(U.addDays(new Date(), -7)), { type: 'date' });
      var hasta = AP.input('hasta', U.ymd(), { type: 'date' });
      var fNov = AP.select('nov', [['', 'Todas las marcaciones'], ['si', 'Solo con novedad'], ['no', 'Solo sin novedad'], ['manual', 'Solo sin lectura de QR']], '');
      var fPunto = AP.select('punto', [['', 'Todos los puntos']], '');
      var q = AP.buscador('Buscar punto, rondero, novedad o descripción', pintar);
      var out = h('div', { class: 'stack' });
      var datos = [], pts = [];
      var COLS = [
        ['Fecha', function (x) { return U.toDate(x.FechaHora); }, 17], ['Punto de control', function (x) { return x.Title; }, 28], ['Rondero', function (x) { return x.Rondero; }, 26],
        ['Usuario', function (x) { return x.RonderoUsuario; }, 14], ['Lectura', function (x) { return x.Origen; }, 22], ['Justificación (sin QR)', function (x) { return x.Justificacion; }, 30],
        ['Novedad', function (x) { return U.yesNo(!!x.Novedad); }, 9], ['Tipo de novedad', function (x) { return x.TipoNovedad; }, 26], ['Descripción', function (x) { return x.Descripcion; }, 44],
        ['Fotografías', function (x) { return fotosDe(x).length; }, 11], ['Sin conexión', function (x) { return U.yesNo(x.SinConexion); }, 10], ['Dispositivo', function (x) { return x.Dispositivo; }, 12],
        ['Recepción en servidor', function (x) { return x._created ? U.toDate(x._created) : ''; }, 17], ['Id. registro', function (x) { return x.IdLocal; }, 38], ['Huella SHA-256', function (x) { return x.Hash; }, 66]
      ];
      function filtradas() {
        return datos.filter(function (x) {
          if (fNov.value === 'si' && !x.Novedad) return false;
          if (fNov.value === 'no' && x.Novedad) return false;
          if (fNov.value === 'manual' && x.Origen === 'QR') return false;
          if (fPunto.value && x.PuntoId !== fPunto.value) return false;
          return AP.coincide(x, q.value, ['Title', 'Rondero', 'RonderoUsuario', 'TipoNovedad', 'Descripcion', 'Origen']);
        }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
      }
      function pintar() {
        var l = filtradas();
        var activos = pts.filter(function (p) { return p.Activo !== false; });
        // Cumplimiento por día: puntos activos distintos marcados cada día
        var porDia = {};
        datos.forEach(function (x) { var d = U.ymd(x.FechaHora); porDia[d] = porDia[d] || { n: 0, nov: 0, pts: new Set() }; porDia[d].n++; if (x.Novedad) porDia[d].nov++; porDia[d].pts.add(x.PuntoId); });
        var dias = Object.keys(porDia).sort().reverse();
        out.replaceChildren(
          h('div', { class: 'row gap wrap' }, AP.pill(l.length + ' marcaciones', 'brand'), AP.pill(l.filter(function (x) { return x.Novedad; }).length + ' con novedad', 'warn'),
            AP.pill(l.filter(function (x) { return x.Origen !== 'QR'; }).length + ' sin lectura de QR', 'muted')),
          dias.length && activos.length ? h('details', { class: 'card' }, h('summary', null, 'Cumplimiento por día (puntos activos cubiertos)'),
            tabla([['Día', function (d) { return U.fDate(U.fromLocal(d, '12:00')); }], ['Marcaciones', function (d) { return String(porDia[d].n); }],
              ['Puntos cubiertos', function (d) { var c = activos.filter(function (p) { return porDia[d].pts.has(p.id); }).length; return h('span', { class: c < activos.length ? 'txt-warn' : 'txt-ok' }, c + ' de ' + activos.length); }],
              ['Novedades', function (d) { return String(porDia[d].nov); }]], dias)) : null,
          tabla([
            ['Fecha y hora', function (x) { return U.fDateTime(x.FechaHora); }],
            ['Punto', function (x) { return h('strong', null, x.Title); }],
            ['Rondero', function (x) { return x.Rondero; }],
            ['Lectura', function (x) { return x.Origen === 'QR' ? AP.pill('QR', 'ok') : AP.pill('Sin QR', 'warn'); }],
            ['Novedad', function (x) { return x.Novedad ? h('div', null, AP.pill(x.TipoNovedad || 'Novedad', 'deny'), h('small', { class: 'block' }, x.Descripcion || '')) : AP.pill('Sin novedad', 'muted'); }],
            ['Fotos', function (x) { var n = fotosDe(x).length; return n ? String(n) : ''; }]
          ], l.slice(0, 400), detalle),
          l.length > 400 ? h('p', { class: 'muted small' }, 'Se muestran 400 de ' + l.length + '. La descarga incluye todas las filtradas.') : null);
      }
      function detalle(x) {
        var fotos = fotosDe(x);
        AP.modal({ title: 'Marcación — ' + x.Title, size: 'wide', body: h('div', { class: 'stack' },
          h('div', { class: 'kv-grid' }, COLS.filter(function (c) { return c[0] !== 'Fotografías'; }).map(function (c) {
            var v = c[1](x); if (v instanceof Date) v = U.fDateTime(v);
            return v || v === 0 ? h('div', { class: 'kv' }, h('span', null, c[0]), h('strong', { class: /SHA|Id\./.test(c[0]) ? 'mono' : '' }, String(v))) : null;
          })),
          fotos.length ? h('h3', null, 'Fotografías') : null, fotos.length ? AP.Elem.galeria(fotos) : null,
          fotos.length ? h('p', { class: 'muted small' }, fotos.map(function (f) { return (f.etiqueta || f.nombre) + ': SHA-256 ' + f.sha256; }).join(' · ')) : null) });
      }
      async function consultar() {
        var a = U.fromLocal(desde.value, '00:00'), b = U.fromLocal(hasta.value, '23:59');
        if (!a || !b || b < a) return AP.toast('Revise el rango de fechas.', 'warn');
        out.replaceChildren(AP.spinner('Consultando…'));
        try {
          var r = await Promise.all([AP.B.listRange('AP_Rondas', 'FechaHora', a, new Date(b.getTime() + 59999)), AP.B.listAll('AP_PuntosRonda')]);
          datos = r[0]; pts = r[1];
          var v = fPunto.value;
          fPunto.replaceChildren.apply(fPunto, [h('option', { value: '' }, 'Todos los puntos')].concat(pts.map(function (p) { return h('option', { value: p.id }, p.Title); })));
          fPunto.value = v;
          pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      [fNov, fPunto].forEach(function (s) { s.addEventListener('change', pintar); });
      box.replaceChildren(
        h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta), fPunto, fNov, q,
          h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar'),
          AP.btnExcel(function () {
            var l = filtradas();
            if (!l.length) return AP.toast('No hay marcaciones con el filtro actual.', 'warn');
            AP.exportar('Rondas_marcaciones', COLS, l, 'xlsx', [['Periodo', desde.value + ' a ' + hasta.value], ['Filtro', [fPunto.value ? fPunto.selectedOptions[0].textContent : '', fNov.value ? fNov.selectedOptions[0].textContent : '', q.value].filter(Boolean).join(' · ') || 'ninguno'],
              ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Colección AP_Rondas']]);
          })),
        out);
      consultar();
    }

    // ---------- Puntos de control ----------
    var lista = [];
    function puntos() {
      var q = AP.buscador('Buscar punto o ubicación', pintarP);
      var out = h('div');
      function filtrados() {
        return lista.filter(function (p) { return AP.coincide(p, q.value, ['Title', 'Ubicacion', 'Instrucciones']); })
          .sort(function (a, b) { return (a.Activo === false) - (b.Activo === false) || (Number(a.Orden) || 999) - (Number(b.Orden) || 999); });
      }
      function pintarP() {
        out.replaceChildren(tabla([
          ['Orden', function (p) { return p.Orden == null ? '' : String(p.Orden); }],
          ['Punto', function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'block muted' }, p.Ubicacion || '')); }],
          ['Meta por turno', function (p) { var m = meta(p); return m.veces > 1 ? m.veces + ' revistas · cada ' + fmtMin(m.intervalo) : '1 revista'; }],
          ['Instrucciones', function (p) { return p.Instrucciones || ''; }],
          ['Estado', function (p) { return AP.pill(p.Activo === false ? 'Inactivo' : 'Activo', p.Activo === false ? 'muted' : 'ok'); }],
          ['', function (p) {
            if (!ED) return null;
            return h('div', { class: 'row gap nowrap' },
              h('button', { class: 'btn small', type: 'button', title: 'Código QR', onclick: function () { imprimir([p]); } }, AP.icon('qr', 16)),
              h('button', { class: 'btn small', type: 'button', title: 'Editar', onclick: function () { editarPunto(p); } }, AP.icon('edit', 16)));
          }]
        ], filtrados(), ED ? editarPunto : null));
      }
      async function cargar() {
        out.replaceChildren(AP.spinner('Consultando…'));
        try { lista = await AP.B.listAll('AP_PuntosRonda'); pintarP(); } catch (e) { out.replaceChildren(errBox(e)); }
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('pin', 18), h('span', null, 'Cada punto tiene un código QR propio: imprímalo, plastifíquelo y fíjelo en el sitio. El rondero lo lee para dejar constancia de que pasó por allí. Si una etiqueta se pierde o se copia, regenere el código del punto: la etiqueta anterior deja de servir.')),
        h('div', { class: 'filters' }, q,
          ED ? h('button', { class: 'btn', type: 'button', onclick: function () { var l = lista.filter(function (p) { return p.Activo !== false; }); if (!l.length) return AP.toast('No hay puntos activos.', 'warn'); imprimir(l); } }, AP.icon('print', 18), 'Imprimir QR de los puntos activos') : null,
          AP.btnExcel(function () {
            var l = filtrados();
            if (!l.length) return AP.toast('No hay puntos con el filtro actual.', 'warn');
            AP.exportar('Puntos_de_ronda', [['Orden', function (p) { return p.Orden == null ? '' : Number(p.Orden); }, 8], ['Punto', function (p) { return p.Title; }, 30], ['Ubicación', function (p) { return p.Ubicacion; }, 30],
              ['Revistas por turno', function (p) { return meta(p).veces; }, 12], ['Intervalo mínimo (min)', function (p) { return meta(p).intervalo; }, 14],
              ['Instrucciones', function (p) { return p.Instrucciones; }, 50], ['Estado', function (p) { return p.Activo === false ? 'Inactivo' : 'Activo'; }, 10]], l, 'xlsx', [['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
          })),
        out);
      cargar();
      AP.render.puntosRecargar = cargar;
    }

    function editarPunto(p) {
      var nuevo = !p, d0 = p || { Activo: true, Orden: (lista.length || 0) + 1, VecesTurno: 1, IntervaloMin: 120 };
      AP.modal({
        title: nuevo ? 'Nuevo punto de control' : p.Title, size: 'wide',
        body: function (close) {
          var f = {
            Title: AP.input('Title', d0.Title, { placeholder: 'Ej.: Cuarto de bombas, Bodega de material de empaque, Cerramiento lote norte' }),
            Ubicacion: AP.input('Ubicacion', d0.Ubicacion, { placeholder: 'Referencia de ubicación' }),
            Orden: AP.input('Orden', d0.Orden, { type: 'number', min: 1, inputmode: 'numeric' }),
            Instrucciones: AP.textarea('Instrucciones', d0.Instrucciones, { rows: 3, placeholder: 'Qué debe verificar el rondero en este punto (puertas, candados, iluminación, cerramiento…)' }),
            VecesTurno: AP.input('VecesTurno', d0.VecesTurno || 1, { type: 'number', min: 1, max: 24, inputmode: 'numeric' }),
            IntervaloH: AP.select('IntervaloH', [['30', '30 minutos'], ['60', '1 hora'], ['90', '1 hora 30 min'], ['120', '2 horas'], ['150', '2 horas 30 min'], ['180', '3 horas'], ['240', '4 horas'], ['300', '5 horas'], ['360', '6 horas']],
              String(d0.IntervaloMin || 120))
          };
          var activo = AP.check('Activo', 'Punto activo (el rondero lo ve en su ronda)', d0.Activo !== false);
          var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var d = { Title: f.Title.value.trim(), Ubicacion: f.Ubicacion.value.trim(), Orden: f.Orden.value ? Number(f.Orden.value) : null, Instrucciones: f.Instrucciones.value.trim(), Activo: activo.querySelector('input').checked,
              VecesTurno: Math.max(1, Math.min(24, Math.round(Number(f.VecesTurno.value) || 1))), IntervaloMin: Number(f.IntervaloH.value) || 120 };
            if (d.Title.length < 3) return AP.toast('Escriba el nombre del punto.', 'warn');
            var horasTurno = AP.CFG.horasMaxTurno || 12;
            if (d.VecesTurno > 1 && (d.VecesTurno - 1) * d.IntervaloMin > horasTurno * 60) return AP.toast('Con ese intervalo no caben ' + d.VecesTurno + ' revistas en un turno de ' + horasTurno + ' horas. Reduzca las revistas o el intervalo.', 'warn', 8000);
            guardar.disabled = true;
            try {
              if (nuevo) {
                d.Codigo = U.newToken().slice(0, 16);
                await AP.B.create('AP_PuntosRonda', d);
                await AP.Audit.log('Alta de punto de ronda', d.Title, (d.Ubicacion || '') + ' · meta: ' + d.VecesTurno + ' revista(s) por turno' + (d.VecesTurno > 1 ? ', cada ' + fmtMin(d.IntervaloMin) : ''));
              } else {
                await AP.B.update('AP_PuntosRonda', p.id, d);
                await AP.Audit.log('Modificación de punto de ronda', d.Title, (d.Activo ? 'Activo' : 'Inactivo') + (d.Ubicacion ? ' · ' + d.Ubicacion : '') + ' · meta: ' + d.VecesTurno + ' revista(s) por turno' + (d.VecesTurno > 1 ? ', cada ' + fmtMin(d.IntervaloMin) : ''));
              }
              close(); AP.toast('Punto guardado. Los celulares de los ronderos lo reciben en su próxima actualización.');
              if (AP.render.puntosRecargar) AP.render.puntosRecargar();
            } catch (e) { AP.toast(e.message, 'error'); } finally { guardar.disabled = false; }
          } }, AP.icon('check', 18), 'Guardar');
          return h('div', { class: 'stack' },
            h('div', { class: 'form-grid' }, AP.field('Nombre del punto *', f.Title, null, 'span2'), AP.field('Ubicación', f.Ubicacion), AP.field('Orden en la ronda', f.Orden),
              AP.field('Revistas exigidas por turno *', f.VecesTurno, 'Cuántas veces debe pasar el rondero por este punto en cada turno.'),
              AP.field('Tiempo mínimo entre revistas *', f.IntervaloH, 'Una revista hecha antes de este tiempo queda registrada pero no cuenta para la meta.'),
              AP.field('Instrucciones para el rondero', f.Instrucciones, null, 'span2'), h('div', { class: 'field span2' }, activo)),
            p ? h('div', { class: 'row gap wrap' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); imprimir([p]); } }, AP.icon('qr', 18), 'Código QR'),
              h('button', { class: 'btn danger-outline', type: 'button', onclick: async function () {
                if (!(await AP.confirm('Regenerar código', 'La etiqueta actual de «' + p.Title + '» dejará de servir. Deberá imprimir y fijar la nueva.', 'Regenerar', 'danger'))) return;
                try {
                  await AP.B.update('AP_PuntosRonda', p.id, { Codigo: U.newToken().slice(0, 16) });
                  await AP.Audit.log('Regeneración de código de punto de ronda', p.Title, 'Etiqueta anterior revocada');
                  close(); AP.toast('Código regenerado. Imprima la nueva etiqueta.');
                  if (AP.render.puntosRecargar) AP.render.puntosRecargar();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, AP.icon('sync', 18), 'Regenerar código')) : null,
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), guardar));
        }
      });
    }
    function imprimir(l) { AP.State.printPuntos = l; AP.go('/imprimir-puntos'); }
  });

  // Etiquetas con el código QR de cada punto (para fijar en sitio)
  AP.route('/imprimir-puntos', function () {
    var l = AP.State.printPuntos;
    if (!AP.Session.can('admin') || !l || !l.length) return AP.go('/consola/rondas?t=puntos');
    l = l.slice().sort(function (a, b) { return (Number(a.Orden) || 999) - (Number(b.Orden) || 999) || (U.fold(a.Title) < U.fold(b.Title) ? -1 : 1); });
    var hoja = h('div', { class: 'ronda-labels' }, l.map(function (p) {
      return h('div', { class: 'ronda-label' },
        h('div', { class: 'rl-head' }, h('img', { src: 'img/logo.png', alt: 'Avo Pak' }), h('span', null, 'PUNTO DE CONTROL DE RONDA')),
        h('div', { class: 'rl-qr', html: U.qrSvg(AP.Rondas.payload(p.Codigo), 5, 2) }),
        h('strong', null, (p.Orden ? p.Orden + '. ' : '') + p.Title),
        p.Ubicacion ? h('span', null, p.Ubicacion) : null,
        h('small', null, 'No retirar · Dirección de Seguridad Integral'));
    }));
    AP.mount(h('div', { class: 'print-page' },
      h('div', { class: 'no-print row gap wrap between print-bar' },
        h('div', null, h('strong', null, l.length + ' etiqueta(s)'), h('small', { class: 'block muted' }, 'Imprima en papel adhesivo o plastifique la etiqueta. Fíjela a la altura de los ojos, protegida de la lluvia.')),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn', type: 'button', onclick: function () { history.back(); } }, AP.icon('back', 18), 'Volver'),
          h('button', { class: 'btn primary', type: 'button', onclick: function () { window.print(); } }, AP.icon('print', 18), 'Imprimir'))),
      hoja), 'is-print');
  });
})();
