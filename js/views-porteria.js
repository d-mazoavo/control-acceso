/* Pantallas de portería (celular del vigilante) */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function nowIso() { return new Date().toISOString(); }
  var NOV_SIN_QR = 'Ingreso sin lectura de QR';
  var TX_INGRESO_SIN_QR = (AP.TX && AP.TX.ingresoSinQR) || 'El ingreso se registra leyendo el QR de la persona. Si no lo presenta, solo puede registrarse por excepción: indique quién lo autoriza y por qué. Queda en las alertas y en las novedades para verificación del Director de Seguridad Integral.';
  function user() { return AP.Session.operador(); }

  // Construye y guarda un movimiento en la cola del dispositivo
  async function registrar(f) {
    var u = user();
    var mov = Object.assign({
      IdLocal: U.uuid(), FechaHora: nowIso(), Vigilante: u.nombre, VigilanteCorreo: u.upn, VigilanteUsuario: u.usuario, TurnoId: u.turnoId, Dispositivo: U.deviceId(),
      SinConexion: !AP.Sync.state.online, DesfaseReloj: AP.Sync.state.skew, Porteria: AP.CFG.porteria
    }, f);
    Object.keys(mov).forEach(function (k) { if (mov[k] === undefined || mov[k] === '') delete mov[k]; });
    mov.Hash = await U.hashRecord(mov);
    await AP.Sync.enqueue('mov', mov);
    return mov;
  }
  AP.registrarMovimiento = registrar;

  function flash(ok, title, sub) {
    U.beep(ok ? 'ok' : 'deny');
    var el = h('div', { class: 'flash ' + (ok ? 'ok' : 'deny'), role: 'alert' }, AP.icon(ok ? 'check' : 'x', 72), h('strong', null, title), sub ? h('span', null, sub) : null);
    document.body.appendChild(el);
    return new Promise(function (res) { setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); res(); }, 250); }, 1300); });
  }

  // =================== INICIO DE PORTERÍA ===================
  AP.route('/porteria', function () {
    var dentro = AP.Access.inside();
    var tel = AP.CFG.telefonos || {};
    var tile = function (icon, title, sub, path, cls) {
      return h('a', { class: 'tile ' + (cls || ''), href: '#' + path }, AP.icon(icon, 28), h('strong', null, title), sub ? h('small', null, sub) : null);
    };
    function porLlegarTxt() { var n = AP.Access.visitasPorLlegar().length; return n ? n + ' por llegar' : 'Ninguna por llegar'; }
    // Visitantes no anunciados registrados hoy en portería y la decisión del Director sobre cada uno
    var solicitudes = h('div');
    function pintarSolicitudes() {
      var hoy = U.ymd();
      var l = AP.Sync.visitas.filter(function (v) { return v.Origen === 'Portería' && U.ymd(v.FechaSolicitud || v.FechaInicio) === hoy && !(v.Estado === 'Aprobada' && AP.Access.estadoVisita(v).clave !== 'porLlegar'); })
        .sort(function (a, b) { return (a.FechaSolicitud || '') < (b.FechaSolicitud || '') ? 1 : -1; });
      if (!l.length) { solicitudes.replaceChildren(); return; }
      var txt = { Pendiente: 'Esperando aprobación', Aprobada: 'Aprobada: leer QR', Rechazada: 'Rechazada', Cancelada: 'Cancelada' };
      solicitudes.replaceChildren(h('section', { class: 'card stack sm' },
        h('h3', { class: 'row gap' }, AP.icon('inbox', 20), h('span', null, 'Visitantes no anunciados de hoy')),
        h('div', { class: 'list' }, l.slice(0, 8).map(function (v) {
          return h('a', { class: 'list-item', href: '#/espera?id=' + encodeURIComponent(v.id) }, AP.icon('user', 20),
            h('div', null, h('strong', null, v.Title), h('small', null, U.fTime(v.FechaSolicitud || v.FechaInicio) + ' · visita a ' + (v.Anfitrion || '—'))),
            AP.pill(txt[v.Estado] || v.Estado, v.Estado === 'Aprobada' ? 'ok' : v.Estado === 'Pendiente' ? 'warn' : v.Estado === 'Rechazada' ? 'deny' : 'muted'));
        }))));
    }
    pintarSolicitudes();
    // Solicitudes de ingreso enviadas hoy al Director (llegadas tardías, fuera de turno, día no programado)
    var solIng = h('div');
    function pintarSolIng() {
      var hoy = U.ymd();
      var l = (AP.Sync.solicitudes || []).filter(function (x) { return U.ymd(x.FechaSolicitud) === hoy && !AP.solicitudUsada(x) && x.Estado !== 'Cancelada'; })
        .sort(function (a, b) { return a.FechaSolicitud < b.FechaSolicitud ? 1 : -1; });
      if (!l.length) { solIng.replaceChildren(); return; }
      var txt = { Pendiente: 'Esperando al Director', Aprobada: 'Aprobada: registrar ingreso', Rechazada: 'Rechazada: registrar' };
      solIng.replaceChildren(h('section', { class: 'card stack sm' },
        h('h3', { class: 'row gap' }, AP.icon('clock', 20), h('span', null, 'Ingresos en decisión del Director')),
        h('div', { class: 'list' }, l.slice(0, 8).map(function (x) {
          return h('a', { class: 'list-item', href: '#/espera-ingreso?id=' + encodeURIComponent(x.id) }, AP.icon('user', 20),
            h('div', null, h('strong', null, x.Title), h('small', null, U.fTime(x.FechaSolicitud) + ' · ' + (x.Novedad || x.Tipo || ''))),
            AP.pill(txt[x.Estado] || x.Estado, x.Estado === 'Aprobada' ? 'ok' : x.Estado === 'Pendiente' ? 'warn' : 'deny'));
        }))));
    }
    pintarSolIng();
    var content = h('div', { class: 'stack' },
      h('a', { class: 'scan-cta', href: '#/escanear' }, h('span', { class: 'scan-ico' }, AP.icon('qr', 44)),
        h('span', null, h('strong', null, 'Leer código QR'), h('small', null, 'Ingreso y salida: siempre con lectura del QR'))),
      h('div', { class: 'tiles' },
        tile('search', 'Buscar', 'Por documento o nombre', '/buscar'),
        tile('edit', 'Registro manual', 'No anunciado / sin QR / salidas', '/manual'),
        tile('user', 'Visitas de hoy', porLlegarTxt(), '/visitas-hoy', AP.Access.visitasPorLlegar().length ? 'accent' : ''),
        tile('users', 'Personas dentro', String(dentro.length) + (AP.Session.can('admin') ? '' : ' · solo consulta'), '/dentro', dentro.length ? 'accent' : ''),
        tile('badge', 'Autoridad', 'Visita de autoridad', '/manual?cat=Autoridad'),
        tile('truck', 'Vehículo de carga', 'Inspección y precintos', '/carga'),
        tile('history', 'Mi turno', AP.Sync.pendingCount() ? AP.Sync.pendingCount() + ' por enviar' : 'Registros del celular', '/turno')),
      solIng,
      solicitudes,
      h('div', { class: 'quick-dial' },
        tel.director ? h('a', { class: 'btn', href: 'tel:' + tel.director }, AP.icon('phone', 18), 'Director') : null,
        tel.supervisor ? h('a', { class: 'btn', href: 'tel:' + tel.supervisor }, AP.icon('phone', 18), 'Supervisor') : null,
        h('a', { class: 'btn', href: AP.waLink(AP.WA_DIRECTOR), target: '_blank', rel: 'noopener' }, AP.icon('whatsapp', 18), 'Dir. Seguridad')),
      h('div', { class: 'p-foot' },
        h('span', null, AP.Session.turno ? 'Turno de: ' : 'Vigilante: ', h('strong', null, user().nombre),
          AP.Session.turno ? ' (' + AP.Session.turno.usuario + ') desde las ' + U.fTime(AP.Session.turno.inicio) : null),
        h('span', null, 'Datos: ' + (AP.Sync.state.lastPull ? U.rel(AP.Sync.state.lastPull) : 'sin descargar')),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn small', type: 'button', onclick: function () { AP.Sync.run().then(function () { AP.render(); }); } }, AP.icon('sync', 16), 'Sincronizar'),
          AP.Session.can('consola') ? h('a', { class: 'btn small', href: '#/consola/panel' }, AP.icon('chart', 16), 'Consola') : null,
          !AP.Session.can('consola') && AP.Session.can('historial') ? h('a', { class: 'btn small', href: '#/consola/historial' }, AP.icon('history', 16), 'Historial') : null,
          AP.State.installPrompt ? h('button', { class: 'btn small', type: 'button', onclick: function () { AP.State.installPrompt.prompt(); } }, AP.icon('download', 16), 'Instalar app') : null,
          h('button', { class: 'btn small', type: 'button', onclick: AP.Views.logout }, AP.icon('logout', 16), AP.Session.turno ? 'Cerrar turno' : 'Salir'))));
    AP.porteriaShell('Control de Acceso', content);
    AP.onLeave(AP.Sync.on(U.debounce(function () {
      var t = document.querySelector('a.tile[href="#/dentro"] small');
      if (t) t.textContent = String(AP.Access.inside().length) + (AP.Session.can('admin') ? '' : ' · solo consulta');
      var tv = document.querySelector('a.tile[href="#/visitas-hoy"]');
      if (tv) { tv.querySelector('small').textContent = porLlegarTxt(); tv.classList.toggle('accent', AP.Access.visitasPorLlegar().length > 0); }
      pintarSolicitudes();
      pintarSolIng();
    }, 200)));
  });

  // =================== LECTOR QR ===================
  AP.route('/escanear', function () {
    var video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
    var canvas = h('canvas', { class: 'hidden' });
    var msg = h('p', { class: 'scan-msg' }, 'Ubique el código QR dentro del recuadro');
    var torchOn = false;
    var torchBtn = h('button', { class: 'icon-btn light', type: 'button', 'aria-label': 'Linterna' }, AP.icon('flash', 24));
    var done = false;
    // Si el resultado no es favorable, se confirma con el servidor antes de mostrarlo (visita recién aprobada, etc.)
    async function evaluar(token, origen) {
      msg.classList.remove('err');
      msg.textContent = 'Verificando…';
      var r = await AP.Access.evaluarActual(token);
      r.origen = origen;
      U.beep(r.nivel === 'ok' ? 'ok' : r.nivel === 'warn' ? 'warn' : 'deny');
      AP.State.result = r; AP.State.fromScan = true;
      if (location.hash.indexOf('#/escanear') === 0) AP.go('/resultado');
    }
    var scanner = AP.Scanner(video, canvas, function (text) {
      if (done || location.hash.indexOf('#/escanear') !== 0) return;
      var token = U.parseQR(text);
      done = true;
      scanner.stop();
      if (!token) {
        U.beep('deny');
        AP.State.result = { token: null, nivel: 'deny', etiqueta: 'CÓDIGO NO VÁLIDO', detalle: 'El código leído no es una credencial de Avo Pak.', origen: 'QR', invalido: true };
        AP.State.fromScan = true;
        AP.go('/resultado');
        return;
      }
      evaluar(token, 'QR');
    }, function () { /* errores de cuadro ignorados */ });
    AP.leerToken = evaluar; // también lo usan las pruebas automáticas

    torchBtn.addEventListener('click', async function () {
      torchOn = !torchOn;
      var ok = await scanner.torch(torchOn);
      if (!ok) { torchOn = false; AP.toast('La linterna no está disponible en este celular.', 'warn'); }
      torchBtn.classList.toggle('on', torchOn);
    });

    var manual = function () {
      AP.modal({
        title: 'Digitar código de la credencial',
        body: function (close) {
          var i = AP.input('codigo', '', { placeholder: 'Ej.: AVP1:7KQ2… o el código impreso', autocapitalize: 'characters', inputmode: 'text' });
          i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
          function go() {
            var t = U.parseQR(i.value);
            if (!t) return AP.toast('Código no válido.', 'warn');
            close(); done = true; scanner.stop();
            evaluar(t, 'Código digitado');
          }
          return h('div', null, AP.field('Código', i, 'También funciona con lectores de código externos (tipo teclado).'),
            h('button', { class: 'btn primary block', type: 'button', onclick: go }, 'Consultar'));
        }
      });
    };

    async function desdeFoto() {
      var f = await AP.pickImage('environment');
      if (!f) return;
      msg.textContent = 'Leyendo la foto…';
      try {
        var text = await AP.decodeQRFromFile(f);
        if (!text) { msg.textContent = 'No se encontró un código QR en la foto. Intente de nuevo, más cerca y con buena luz.'; msg.classList.add('err'); return; }
        var t = U.parseQR(text);
        done = true; scanner.stop();
        if (!t) { AP.State.result = { token: null, nivel: 'deny', etiqueta: 'CÓDIGO NO VÁLIDO', detalle: 'El código leído no es una credencial de Avo Pak.', origen: 'Foto', invalido: true }; AP.State.fromScan = true; AP.go('/resultado'); }
        else evaluar(t, 'Foto del código');
      } catch (e) { msg.textContent = e.message; msg.classList.add('err'); }
    }

    var page = h('div', { class: 'scan-page' },
      video, canvas,
      h('div', { class: 'scan-frame' }, h('span'), h('span'), h('span'), h('span')),
      h('div', { class: 'scan-top' },
        h('button', { class: 'icon-btn light', type: 'button', 'aria-label': 'Volver', onclick: function () { AP.go('/porteria'); } }, AP.icon('back', 24)),
        h('strong', null, 'Leer credencial'), torchBtn),
      h('div', { class: 'scan-bottom' }, msg,
        h('div', { class: 'row gap center wrap' },
          h('button', { class: 'btn light', type: 'button', onclick: desdeFoto }, AP.icon('camera', 18), 'Leer desde foto'),
          h('button', { class: 'btn light', type: 'button', onclick: manual }, AP.icon('keyboard', 18), 'Digitar código'),
          h('a', { class: 'btn light', href: '#/buscar' }, AP.icon('search', 18), 'Buscar documento'))));
    AP.mount(page, 'is-scan');
    AP.onLeave(function () { scanner.stop(); });
    scanner.start().catch(function (e) {
      msg.textContent = e.message;
      msg.classList.add('err');
    });
  });

  // =================== RESULTADO Y REGISTRO ===================
  AP.route('/resultado', function () {
    var r = AP.State.result;
    if (!r) return AP.go('/porteria');
    var rec = r.rec || {};
    var esVisita = r.tipo === 'visita';
    var esManual = r.tipo === 'manual';
    // El sentido lo determina el sistema por el último movimiento; el vigilante no lo elige.
    var sentido = (AP.State.forceSalida && AP.Session.can('admin')) ? 'Salida' : (r.sentido || 'Ingreso');
    AP.State.forceSalida = false;
    var manualExtra = esManual ? AP.State.manualExtra : null;
    AP.State.manualExtra = null;
    var form = h('div', { class: 'stack' });
    var vuelta = AP.State.fromScan ? '/escanear' : '/porteria';

    var banner = h('div', { class: 'verdict ' + r.nivel },
      AP.icon(r.nivel === 'ok' ? 'check' : r.nivel === 'warn' ? 'alert' : 'x', 40),
      h('div', null, h('strong', null, r.etiqueta), r.detalle ? h('span', null, r.detalle) : null));

    var ficha = null;
    if (r.rec) {
      var filas = [];
      var add = function (k, v) { if (v) filas.push(h('div', { class: 'kv' }, h('span', null, k), h('strong', null, v))); };
      add('Documento', (rec.TipoDoc ? rec.TipoDoc + ' ' : '') + (rec.NumDoc || ''));
      add(esVisita ? 'Empresa / entidad' : 'Empresa', rec.Empresa);
      if (!esVisita) add('Cargo / área', [rec.Cargo, rec.Area].filter(Boolean).join(' · '));
      if (esVisita) {
        add('Visita a', [rec.Anfitrion, rec.AnfitrionCargo, rec.Area].filter(Boolean).join(' · '));
        add('Motivo', rec.Motivo);
        add('Horario', U.fDateTime(rec.FechaInicio) + ' a ' + U.fTime(rec.FechaFin));
      }
      if (esManual) { add('Visita a', [rec.Anfitrion, rec.Area].filter(Boolean).join(' · ')); add('Motivo', rec.Motivo); }
      add('Vehículo', [rec.VehiculoTipo, rec.Placa].filter(Boolean).join(' · '));
      ficha = h('div', { class: 'card person' },
        h('div', { class: 'person-photo' }, AP.photoEl(rec, 'big')),
        h('div', { class: 'person-data' },
          h('h2', null, rec.Title || 'Sin nombre'),
          h('div', { class: 'row gap wrap' }, AP.pill(r.categoria || (esVisita ? 'Visitante' : rec.Tipo || 'Persona'), 'brand'),
            !esVisita && !esManual && rec.Estado ? AP.estadoPill(rec.Estado) : null),
          filas));
      if (!esVisita && !esManual && rec.AutorizaFoto === false) {
        ficha.appendChild(h('p', { class: 'note' }, 'Sin fotografía autorizada: verifique la identidad con el documento.'));
      }
    }

    var ult = r.ultimo;
    var ultimo = ult ? h('p', { class: 'muted small' }, AP.icon('clock', 14), ' Último registro: ', h('strong', null, ult.Sentido), ' ' + U.fDateTime(ult.FechaHora) + ' (' + U.rel(ult.FechaHora) + ')') : null;

    // --- Controles ---
    var sentidoCtl = AP.Session.can('admin')
      ? AP.segmented('Sentido', [
        { value: 'Ingreso', label: 'Ingreso', icon: 'door', cls: 'in' },
        { value: 'Salida', label: 'Salida', icon: 'logout', cls: 'out' }
      ], sentido, function () { pintar(); })
      : h('div', { class: 'sentido-auto ' + (sentido === 'Salida' ? 'out' : 'in'), dataset: { value: sentido } },
        AP.icon(sentido === 'Salida' ? 'logout' : 'door', 22), h('strong', null, sentido === 'Salida' ? 'SALIDA' : 'INGRESO'),
        h('small', null, 'Determinado por el sistema según el último registro'));

    // --- Elementos programados por la Dirección de Seguridad Integral para esta persona ---
    // Se muestran los registros de elementos pendientes del día. El vigilante coteja
    // cada elemento y deja constancia; el resultado también queda anotado en el registro del movimiento.
    var EL = AP.Elem;
    var elem = { el: h('div', { class: 'elem-wrap' }), lista: [], resueltos: {}, cargado: false };
    function sentidoActual() { return sentidoCtl.dataset.value || sentido; }
    function elemDe(x) {
      if (r.token && x.Token && x.Token === r.token) return true;
      var d = U.normDoc(rec.NumDoc || '');
      return !!(d && x.PersonaDoc && U.normDoc(x.PersonaDoc) === d);
    }
    async function cargarElementos() {
      if (r.invalido || !(r.token || rec.NumDoc)) return;
      try {
        var desde = U.startOfDayCO(new Date());
        var hasta = U.addDays(desde, 1);
        var todos = await AP.B.listRange('AP_Elementos', 'FechaPrevista', desde, hasta, {});
        elem.lista = todos.filter(function (x) { return x.Estado === 'Pendiente' && elemDe(x); })
          .sort(function (a, b) { return a.FechaPrevista < b.FechaPrevista ? -1 : 1; });
        elem.cargado = true;
        pintarElementos();
      } catch (e) {
        elem.el.replaceChildren(h('p', { class: 'note' }, AP.icon('alert', 16), ' No fue posible consultar los elementos programados para esta persona (' + e.message + '). Si porta herramientas o equipos, comuníquese con la Dirección de Seguridad Integral antes de permitir su paso.'));
      }
    }
    function pintarElementos() {
      if (!elem.lista.length) { elem.el.replaceChildren(); return; }
      var s0 = sentidoActual();
      var orden = elem.lista.slice().sort(function (a, b) { return (a.Sentido === s0 ? 0 : 1) - (b.Sentido === s0 ? 0 : 1); });
      var pend = elem.lista.filter(function (x) { return !elem.resueltos[x.id]; }).length;
      elem.el.replaceChildren(h('section', { class: 'card stack elem-box' },
        h('h3', { class: 'row gap' }, AP.icon('package', 22), h('span', null, 'Registros de elementos (' + elem.lista.length + ')')),
        pend ? h('p', { class: 'note' }, 'Revise físicamente cada elemento (descripción, cantidad y serial) contra esta lista antes de verificar.') : null,
        orden.map(tarjetaElemento)));
    }
    function tarjetaElemento(x) {
      var elems = EL.items(x), fotos = EL.fotos(x), res = elem.resueltos[x.id];
      var esIn = x.Sentido === 'Ingreso', coincide = x.Sentido === sentidoActual();
      var verbo = esIn ? 'ingresa' : 'sale';
      var cab = h('div', { class: 'elem-head' },
        AP.pill(x.Sentido.toUpperCase(), esIn ? 'ok' : 'warn'),
        h('span', { class: 'small' }, 'Previsto: ', h('strong', null, U.fDateTime(x.FechaPrevista))),
        h('span', { class: 'small' }, 'Autoriza: ', h('strong', null, x.AutorizadoPor || '—')));
      var cuerpo = [cab, EL.tabla(elems)];
      if (fotos.length) cuerpo.push(EL.galeria(fotos));
      if (x.Observaciones) cuerpo.push(h('p', { class: 'small' }, h('strong', null, 'Indicaciones: '), x.Observaciones));
      if (res) {
        cuerpo.push(h('div', { class: 'elem-res ' + (res.estado === 'Confirmado' ? 'ok' : 'deny') },
          AP.icon(res.estado === 'Confirmado' ? 'check' : 'x', 20),
          h('span', null, res.estado === 'Confirmado' ? 'Verificado: los elementos ' + (esIn ? 'ingresaron' : 'salieron') + ' conforme a la lista.' : 'Registrado: no coincide. ' + res.nota)));
      } else {
        if (!coincide) cuerpo.push(h('p', { class: 'note' }, 'Programado para la ' + x.Sentido.toUpperCase() + '. Verifíquelo solo cuando la persona efectivamente ' + verbo + ' con los elementos.'));
        var bOk = h('button', { class: 'btn ' + (esIn ? 'go-in' : 'go-out'), type: 'button' }, AP.icon('check', 20), 'Verificado: sí ' + verbo);
        var bNo = h('button', { class: 'btn danger-outline', type: 'button' }, AP.icon('x', 18), 'No coincide / no los presenta');
        bOk.onclick = function () { resolverElemento(x, 'Confirmado', '', [bOk, bNo]); };
        bNo.onclick = function () {
          AP.modal({ title: 'Elementos que no coinciden', body: function (close) {
            var t = AP.textarea('nota', '', { placeholder: 'Describa qué no coincide (elemento, cantidad o serial distinto, no los presenta, elementos adicionales, etc.)', rows: 3 });
            return h('div', { class: 'stack' }, h('p', { class: 'muted small' }, x.Title + ' — ' + x.Sentido + ' de elementos'), t,
              h('button', { class: 'btn danger block', type: 'button', onclick: function () {
                if (t.value.trim().length < 6) return AP.toast('Describa brevemente qué no coincide.', 'warn');
                close(); resolverElemento(x, 'Rechazado', t.value.trim(), [bOk, bNo]);
              } }, 'Registrar novedad'));
          } });
        };
        cuerpo.push(h('div', { class: 'row gap wrap' }, bOk, bNo));
      }
      return h('div', { class: 'elem-sol ' + (esIn ? 'in' : 'out') + (res ? ' hecho' : '') }, cuerpo);
    }
    async function resolverElemento(x, estado, nota, btns) {
      btns.forEach(function (b) { b.disabled = true; });
      var u = AP.Session.operador();
      var cambios = { Estado: estado, Vigilante: u.nombre, VigilanteUsuario: u.usuario, FechaConfirmacion: new Date().toISOString() };
      if (nota) cambios.NotaPorteria = nota;
      try {
        await AP.B.update('AP_Elementos', x.id, cambios);
        elem.resueltos[x.id] = { estado: estado, nota: nota, sentido: x.Sentido, resumen: EL.resumen(EL.items(x)) };
        U.beep(estado === 'Confirmado' ? 'ok' : 'deny');
        AP.toast(estado === 'Confirmado' ? 'Elementos verificados.' : 'Novedad de elementos registrada. Informe a la Dirección de Seguridad Integral.', estado === 'Confirmado' ? 'info' : 'warn', 5000);
        pintarElementos();
      } catch (e) {
        btns.forEach(function (b) { b.disabled = false; });
        AP.toast('No se pudo guardar la verificación de elementos: ' + e.message + (e.offline ? ' Intente de nuevo cuando haya señal.' : ''), 'error', 8000);
      }
    }
    // Constancia en el registro del movimiento
    function notaElementos(sent) {
      var out = [];
      elem.lista.forEach(function (x) {
        var z = elem.resueltos[x.id];
        if (z) out.push((z.estado === 'Confirmado' ? 'Elementos verificados (' : 'Elementos NO coinciden (') + z.sentido.toLowerCase() + '): ' + z.resumen + (z.nota ? ' — ' + z.nota : ''));
        else if (x.Sentido === sent) out.push('Elementos programados SIN verificar (' + x.Sentido.toLowerCase() + '): ' + EL.resumen(EL.items(x)));
      });
      return out.join(' | ');
    }

    var placas = String(rec.Placa || '').split(/[,;/]/).map(function (x) { return x.trim(); }).filter(Boolean);
    var enVeh = AP.check('enVehiculo', 'Llega o sale en vehículo', !!(ult && ult.Placa && sentido === 'Salida'));
    var placaIn = AP.input('Placa', ult && ult.Placa && sentido === 'Salida' ? ult.Placa : (placas[0] || ''), { placeholder: 'Placa', autocapitalize: 'characters', maxlength: 10, list: 'placas-dl' });
    var dl = h('datalist', { id: 'placas-dl' }, placas.map(function (p) { return h('option', { value: p }); }));
    var vehTipo = AP.select('VehiculoTipo', AP.CAT.vehiculos, (ult && ult.VehiculoTipo) || rec.VehiculoTipo || '');
    var vehBox = h('div', { class: 'grid2' }, AP.field('Placa', placaIn), AP.field('Tipo de vehículo', vehTipo), dl);
    enVeh.querySelector('input').addEventListener('change', pintar);

    // Si la autorización quedó registrada al solicitar la visita en portería, llega marcada (el vigilante la confirma)
    var autoriza = AP.check('AutorizacionConfirmada', 'El visitante autorizó el tratamiento de sus datos (aviso de privacidad)', esVisita && rec.AutorizaDatos === true);
    var carne = AP.input('CarneEntregado', '', { placeholder: 'N.° de carné temporal entregado (si aplica)' });
    var custodia = AP.check('DocumentoCustodia', 'Documento de identidad dejado en custodia', false);
    var devuelto = AP.check('CarneDevuelto', 'Carné temporal devuelto', !!(ult && ult.CarneEntregado));
    var induc = AP.check('InduccionConfirmada', 'El visitante recibió la inducción para visitantes (inocuidad y SST) y se compromete a cumplirla', false);
    var visIn = h('div', { class: 'stack sm' }, autoriza, h('p', { class: 'help' }, AP.TX.confirmacionVisitante), induc, AP.field('Carné temporal', carne), custodia);
    var visOut = h('div', { class: 'stack sm' }, devuelto, ult && ult.DocumentoCustodia ? h('p', { class: 'note' }, 'Se dejó documento en custodia: devuélvalo al visitante.') : null);
    var obs = AP.textarea('Observaciones', '', { placeholder: 'Observaciones (opcional): elementos que ingresa, novedades…', rows: 2 });
    var acciones = h('div', { class: 'actions-sticky' });

    function pintar() {
      var s = sentidoCtl.dataset.value;
      if (elem.cargado) pintarElementos();
      vehBox.style.display = enVeh.querySelector('input').checked ? '' : 'none';
      visIn.style.display = (esVisita || (esManual && rec.Categoria !== 'Autoridad')) && s === 'Ingreso' ? '' : 'none';
      visOut.style.display = (esVisita || esManual) && s === 'Salida' ? '' : 'none';
      acciones.replaceChildren();
      if (r.invalido) {
        AP.add(acciones, h('a', { class: 'btn big block', href: '#/manual' }, AP.icon('edit', 20), 'Registro manual'),
          h('a', { class: 'btn block', href: '#' + vuelta }, 'Volver a leer'));
        return;
      }
      var tel = (AP.CFG.telefonos || {}).director;
      var llamar = tel ? h('a', { class: 'btn block', href: 'tel:' + tel }, AP.icon('phone', 18), 'Llamar al Director') : null;
      var sinQR = r.token && !esManual && (r.origen === 'Documento');
      if (s === 'Salida') {
        if (r.salidaNoAutorizada) {
          AP.add(acciones,
            h('p', { class: 'note' }, AP.TX.salidaNoAutorizada),
            h('button', { class: 'btn big block danger', type: 'button', onclick: function () { guardar('Salida', 'Permitido', { Novedad: r.novedad }); } }, AP.icon('alert', 22), 'Registrar salida no autorizada y reportar'),
            llamar);
        } else if (sinQR) {
          AP.add(acciones, h('p', { class: 'note' }, AP.TX.salidaSinQR),
            h('button', { class: 'btn big block go-out', type: 'button', onclick: function () { excepcion({ titulo: 'Salida sin lectura de QR', novedad: 'Salida sin lectura de QR', sent: 'Salida', boton: 'Registrar salida por excepción' }); } }, AP.icon('key', 22), 'Registrar salida sin QR (excepción)'));
        } else {
          if (r.nivel !== 'ok') AP.add(acciones, h('p', { class: 'note' }, AP.TX.salidaNoSeImpide));
          AP.add(acciones, h('button', { class: 'btn big block go-out', type: 'button', onclick: function () { guardar('Salida', 'Permitido'); } }, AP.icon('logout', 22), 'Registrar SALIDA'));
        }
      } else if (r.nivel === 'ok' && sinQR) {
        // Persona o visita encontrada por documento (sin leer su QR): solo por excepción, con quién autoriza y por qué
        AP.add(acciones, h('p', { class: 'note' }, TX_INGRESO_SIN_QR),
          h('button', { class: 'btn big block go-in', type: 'button', onclick: function () { excepcion({ titulo: 'Ingreso sin lectura de QR', novedad: NOV_SIN_QR, sent: 'Ingreso', nota: TX_INGRESO_SIN_QR, boton: 'Registrar ingreso por excepción' }); } }, AP.icon('key', 22), 'Registrar ingreso sin QR (excepción)'));
      } else if (r.nivel === 'ok') {
        AP.add(acciones, h('button', { class: 'btn big block go-in', type: 'button', onclick: function () { guardar('Ingreso', 'Permitido'); } }, AP.icon('check', 22), 'Registrar INGRESO'));
      } else if (r.aprobacionDirector && r.token && rec.id) {
        // Llegada tardía, fuera de turno o contratista en día no programado: decide el Director
        var abierta = AP.solicitudAbierta(r.token);
        if (abierta) {
          AP.add(acciones,
            h('p', { class: 'note' }, abierta.Estado === 'Pendiente' ? 'Ya se envió la solicitud al Director a las ' + U.fTime(abierta.FechaSolicitud) + '. Espere su decisión.' : 'El Director ya decidió esta solicitud (' + abierta.Estado.toLowerCase() + '). Ábrala para registrar el resultado.'),
            h('a', { class: 'btn big block primary', href: '#/espera-ingreso?id=' + encodeURIComponent(abierta.id) }, AP.icon('clock', 22), abierta.Estado === 'Pendiente' ? 'Ver la solicitud (esperando al Director)' : 'Ver la decisión del Director'),
            llamar);
        } else {
          AP.add(acciones,
            h('p', { class: 'note' }, AP.TX.aprobacionDirector || 'Este ingreso no lo puede autorizar el vigilante. Envíe la solicitud: el Director de Seguridad Integral la aprueba o la rechaza y usted ve la decisión en esta pantalla.'),
            h('button', { class: 'btn big block primary', type: 'button', onclick: function (e) { enviarSolicitud(e.currentTarget); } }, AP.icon('inbox', 22), 'Enviar a aprobación del Director'),
            llamar);
        }
      } else if (r.registrable) {
        AP.add(acciones,
          sinQR ? h('p', { class: 'note' }, TX_INGRESO_SIN_QR) : null,
          h('button', { class: 'btn big block go-pend', type: 'button', onclick: function () {
            if (sinQR) excepcion({ titulo: 'Ingreso sin lectura de QR', novedad: [r.novedad, NOV_SIN_QR].filter(Boolean).join(' | '), sent: 'Ingreso', nota: TX_INGRESO_SIN_QR, boton: 'Registrar ingreso pendiente por excepción' });
            else guardar('Ingreso', 'Permitido', { Novedad: r.novedad });
          } }, AP.icon('clock', 22), 'Registrar ingreso PENDIENTE de verificación' + (sinQR ? ' (sin QR)' : '')),
          h('button', { class: 'btn block danger-outline', type: 'button', onclick: function () { guardar('Ingreso', 'Negado'); } }, AP.icon('x', 18), 'Negar ingreso y registrar'),
          llamar);
      } else {
        AP.add(acciones,
          h('button', { class: 'btn big block danger', type: 'button', onclick: function () { guardar('Ingreso', 'Negado'); } }, AP.icon('x', 22), 'Negar ingreso y registrar'),
          r.sinExcepcion ? h('p', { class: 'note' }, AP.TX.sinExcepcion) : h('button', { class: 'btn block', type: 'button', onclick: function () { excepcion({}); } }, AP.icon('key', 18), 'Autorizar por excepción'),
          r.sinExcepcion ? llamar : null);
      }
    }

    function excepcion(o) {
      o = o || {};
      AP.modal({
        title: o.titulo || 'Ingreso por excepción',
        body: function (close) {
          var quien = AP.input('AutorizadoPor', AP.Session.can('admin') ? (AP.Session.user.nombre || '') : '', { placeholder: 'Nombre y cargo de quien autoriza' });
          var mot = AP.textarea('MotivoExcepcion', '', { placeholder: o.nota ? 'Por qué no presenta el QR (olvidó el carné, celular sin batería…) y cómo se autorizó (llamada, presencial)' : 'Motivo y forma de la autorización (llamada, correo, presencial)' });
          return h('div', { class: 'stack' }, h('p', { class: 'note' }, o.nota || (o.sent === 'Salida' ? AP.TX.salidaSinQR : AP.TX.excepcion)), AP.field('Autorizado por *', quien), AP.field(o.nota ? 'Justificación *' : 'Motivo *', mot),
            h('button', { class: 'btn primary block', type: 'button', onclick: function () {
              if (quien.value.trim().length < 4 || mot.value.trim().length < 6) return AP.toast('Indique quién autoriza y el motivo.', 'warn');
              close();
              guardar(o.sent || 'Ingreso', 'Permitido', { Excepcion: true, AutorizadoPor: quien.value.trim(), MotivoExcepcion: mot.value.trim(), Novedad: o.novedad });
            } }, o.boton || 'Registrar ingreso por excepción'));
        }
      });
    }

    async function enviarSolicitud(btn) {
      if (saving) return;
      saving = true; btn.disabled = true; btn.lastChild.textContent = 'Enviando…';
      var u = user(), ahora = new Date();
      var data = {
        Title: rec.Title, Token: r.token, Tipo: r.tipoSolicitud || 'Solicitud', PersonaTipo: rec.Tipo, TipoDoc: rec.TipoDoc, NumDoc: rec.NumDoc, Empresa: rec.Empresa,
        Cargo: rec.Cargo, Area: rec.Area, Novedad: r.novedad, HorarioInfo: r.horarioInfo, Origen: r.origen || 'QR', Estado: 'Pendiente', Porteria: AP.CFG.porteria,
        SolicitadoPor: AP.Session.user.usuario, SolicitadoPorNombre: u.nombre, FechaSolicitud: ahora.toISOString()
      };
      try {
        var sol = await AP.B.create('AP_Solicitudes', data);
        AP.Sync.solicitudes.push(sol);
        AP.Audit.log('Solicitud de ingreso a aprobación del Director', rec.Title + ' (' + (rec.NumDoc || '') + ') — ' + (r.novedad || data.Tipo), 'Registró ' + u.nombre + ' en ' + AP.CFG.porteria);
        if (AP.Notif && AP.Notif.aviso) AP.Notif.aviso('Solicitud enviada al Director', rec.Title + ' — ' + (r.novedad || data.Tipo), 'sol-' + sol.id);
        U.beep('ok');
        AP.State.result = null;
        AP.go('/espera-ingreso?id=' + encodeURIComponent(sol.id) + '&nueva=1');
      } catch (e) {
        if (e.offline) {
          var neg = await AP.confirm('Sin conexión', 'No fue posible enviar la solicitud al Director. Llámelo o escríbale por WhatsApp. Mientras no haya aprobación, la persona no ingresa. ¿Registrar ahora el ingreso negado?', 'Registrar ingreso negado', 'danger');
          saving = false;
          if (neg) return await guardar('Ingreso', 'Negado');
        } else AP.toast('No se pudo enviar la solicitud: ' + e.message, 'error', 8000);
      } finally { saving = false; btn.disabled = false; btn.lastChild.textContent = 'Enviar a aprobación del Director'; }
    }

    var saving = false;
    async function guardar(sent, resultado, extra) {
      if (saving) return;
      var veh = enVeh.querySelector('input').checked;
      var placa = U.normPlaca(placaIn.value);
      if (veh && resultado !== 'Negado' && !placa) return AP.toast('Escriba la placa del vehículo.', 'warn');
      var esVisitante = esVisita || (esManual && rec.Categoria !== 'Autoridad');
      if (resultado === 'Permitido' && sent === 'Ingreso' && esVisitante && !autoriza.querySelector('input').checked) {
        return AP.toast('Confirme que el visitante autorizó el tratamiento de datos. Si no autoriza, no puede registrarse su ingreso.', 'warn', 7000);
      }
      var sinVerificar = resultado === 'Permitido' ? elem.lista.filter(function (x) { return x.Sentido === sent && !elem.resueltos[x.id]; }) : [];
      if (sinVerificar.length) {
        var seguir = await AP.confirm('Elementos sin verificar',
          'Esta persona tiene ' + (sinVerificar.length === 1 ? 'un registro' : sinVerificar.length + ' registros') + ' de ' + sent.toLowerCase() + ' de elementos sin verificar. Verifíquelo(s) en la parte superior antes de registrar. Si registra de todas formas, quedará constancia de que los elementos no se verificaron.',
          'Registrar de todas formas', 'danger');
        if (!seguir) { try { elem.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* */ } return; }
      }
      saving = true;
      try {
        var notaEl = notaElementos(sent);
        var f = {
          Title: rec.Title || '(sin nombre)', Sentido: sent, Resultado: resultado,
          Categoria: r.categoria || (esVisita ? 'Visitante' : rec.Tipo), Origen: r.origen || 'QR',
          Token: r.token || undefined, RefLista: esVisita ? 'AP_Visitas' : esManual ? 'Manual' : 'AP_Personas', RefId: rec.id,
          TipoDoc: rec.TipoDoc, NumDoc: rec.NumDoc, Telefono: rec.Telefono, Empresa: rec.Empresa, Cargo: rec.Cargo,
          Anfitrion: rec.Anfitrion, AnfitrionCorreo: rec.AnfitrionCorreo, AnfitrionId: rec.AnfitrionId, AnfitrionDoc: rec.AnfitrionDoc, Area: rec.Area, Motivo: rec.Motivo,
          Placa: veh ? placa : undefined, VehiculoTipo: veh ? vehTipo.value : undefined,
          EstadoMostrado: r.etiqueta, Observaciones: [obs.value.trim(), notaEl].filter(Boolean).join(' | '),
          DatosAdicionales: rec.DatosAdicionales
        };
        if (resultado === 'Negado') f.MotivoNegacion = r.etiqueta + (r.detalle ? ': ' + r.detalle : '');
        var ex = Object.assign({}, extra || {});
        var nov = ex.Novedad || r.novedad;
        delete ex.Novedad;
        var mx = manualExtra && sent === 'Ingreso' ? Object.assign({}, manualExtra) : null;
        f.Novedad = [mx && mx.Novedad, nov, r.novedadPrevia && sent === 'Ingreso' ? r.novedadPrevia : ''].filter(Boolean).join(' | ') || undefined;
        if (mx) delete mx.Novedad;
        if (r.permisoId) f.PermisoId = String(r.permisoId);
        if (r.solicitud) {
          f.SolicitudId = r.solicitud.id;
          if (r.solicitud.PermisoId) f.PermisoId = r.solicitud.PermisoId;
          f.AutorizadoPor = (r.solicitud.DecididoPorNombre || r.solicitud.DecididoPor || '') + ' (Director de Seguridad Integral)';
        }
        if (r.horarioInfo) f.HorarioInfo = r.horarioInfo;
        if (sent === 'Salida' && ult) f.EntradaId = ult.IdLocal;
        if (esVisitante && sent === 'Ingreso') {
          f.AutorizacionConfirmada = autoriza.querySelector('input').checked;
          f.InduccionConfirmada = induc.querySelector('input').checked;
          f.CarneEntregado = carne.value.trim();
          f.DocumentoCustodia = custodia.querySelector('input').checked;
        }
        if ((esVisita || esManual) && sent === 'Salida') f.CarneDevuelto = devuelto.querySelector('input').checked;
        if (mx) Object.assign(f, mx);
        Object.assign(f, ex);
        var mov = await registrar(f);
        if (AP.Notif) AP.Notif.movimiento(mov);
        await flash(resultado === 'Permitido', resultado === 'Negado' ? 'INGRESO NEGADO' : sent === 'Ingreso' ? 'INGRESO REGISTRADO' : 'SALIDA REGISTRADA', rec.Title);
        AP.State.result = null;
        if (esVisita && sent === 'Ingreso' && resultado === 'Permitido' && rec.Anfitrion && location.hash.indexOf('#/resultado') === 0) { avisarAnfitrion(mov); return; }
        if (location.hash.indexOf('#/resultado') === 0) AP.go(vuelta);
      } catch (e) {
        AP.toast('No se pudo guardar: ' + e.message, 'error');
      } finally { saving = false; }
    }

    // Después de registrar el ingreso de un visitante: WhatsApp al anfitrión para que lo reciba y lo acompañe
    function avisarAnfitrion(mov) {
      var av = AP.avisoAnfitrion(rec, mov.FechaHora);
      AP.modal({
        title: 'Avise al anfitrión',
        onClose: function () { if (location.hash.indexOf('#/resultado') === 0) AP.go(vuelta); },
        body: function (close) {
          return h('div', { class: 'stack' },
            h('p', null, h('strong', null, rec.Title), ' ingresó. Avise a su anfitrión, ', h('strong', null, av.nombre), ', para que lo reciba y lo acompañe durante toda la visita.'),
            av.num
              ? h('a', { class: 'btn big block primary', href: AP.waLink(av.num, av.texto), target: '_blank', rel: 'noopener', onclick: function () {
                AP.Audit.log('Aviso al anfitrión', rec.Title + ' → ' + av.nombre, 'WhatsApp desde portería (' + AP.CFG.porteria + ')');
                setTimeout(close, 400);
              } }, AP.icon('whatsapp', 22), 'Avisar por WhatsApp a ' + av.nombre)
              : h('p', { class: 'note' }, 'El anfitrión no tiene un celular válido registrado en Personas. Avísele por teléfono o radio.'),
            h('button', { class: 'btn block', type: 'button', onclick: function () { close(); } }, av.num ? 'Ahora no' : 'Continuar'));
        }
      });
    }

    var cont = h('div', { class: 'stack' }, banner, ficha, ultimo, elem.el,
      r.invalido ? null : h('div', { class: 'card stack' }, h('h3', null, 'Registro'), sentidoCtl, enVeh, vehBox, visIn, visOut, obs),
      acciones);
    form.appendChild(cont);
    AP.porteriaShell('Verificación', form, { back: vuelta });
    pintar();
    cargarElementos();
  });

  // =================== BÚSQUEDA ===================
  AP.route('/buscar', function () {
    var q = AP.input('q', '', { placeholder: 'Número de documento o nombre', inputmode: 'search', type: 'search', autofocus: true });
    var list = h('div', { class: 'list' });
    function buscar() {
      var t = U.fold(q.value), d = U.normDoc(q.value);
      list.replaceChildren();
      if (t.length < 3) { list.appendChild(h('p', { class: 'muted center' }, 'Escriba al menos 3 caracteres.')); return; }
      var res = [];
      AP.Sync.personas.forEach(function (p) {
        if ((d && U.normDoc(p.NumDoc).indexOf(d) >= 0) || U.fold(p.Title).indexOf(t) >= 0) res.push({ tipo: 'persona', rec: p });
      });
      AP.Sync.visitas.forEach(function (v) {
        if ((d && U.normDoc(v.NumDoc).indexOf(d) >= 0) || U.fold(v.Title).indexOf(t) >= 0) res.push({ tipo: 'visita', rec: v });
      });
      if (!res.length) {
        list.appendChild(AP.empty('search', 'Sin resultados', 'La persona no está registrada en el celular.', h('a', { class: 'btn', href: '#/manual' }, 'Registro manual')));
        return;
      }
      res.slice(0, 30).forEach(function (x) {
        var ev = AP.Access.evaluate(x.rec.Token);
        list.appendChild(h('button', { class: 'list-item', type: 'button', onclick: function () {
          ev.origen = 'Documento'; AP.State.result = ev; AP.State.fromScan = false; AP.go('/resultado');
        } }, AP.photoEl(x.rec, 'sm'), h('div', null, h('strong', null, x.rec.Title), h('small', null, (x.rec.TipoDoc || '') + ' ' + (x.rec.NumDoc || '') + ' · ' + (x.tipo === 'visita' ? 'Visitante — ' + (x.rec.Anfitrion || '') : (x.rec.Tipo || '')))),
          h('span', { class: 'dot ' + ev.nivel, title: ev.etiqueta })));
      });
    }
    q.addEventListener('input', U.debounce(buscar, 200));
    AP.porteriaShell('Buscar persona', h('div', { class: 'stack' }, q, list), { back: '/porteria' });
    setTimeout(function () { q.focus(); }, 50);
    buscar();
  });

  // =================== REGISTRO MANUAL / AUTORIDAD ===================
  // El visitante no anunciado NO ingresa por registro manual: el vigilante registra sus datos y los envía a aprobación
  // del Director de Seguridad Integral; al aprobarse, el visitante recibe su QR y entra y sale leyéndolo.
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  AP.route('/manual', function (qs) {
    var cat = qs.cat || 'Visitante no anunciado';
    var box = h('div', { class: 'stack' });
    var catCtl = AP.select('Categoria', AP.CAT.categoriasManual, cat);
    catCtl.addEventListener('change', function () { AP.go('/manual?cat=' + encodeURIComponent(catCtl.value)); });
    var esAut = cat === 'Autoridad';
    var noAnunciado = cat === 'Visitante no anunciado';
    var I = AP.input;
    var f = {
      Title: I('Title', '', { placeholder: esAut ? 'Servidor a cargo' : 'Nombres y apellidos', autocapitalize: 'words' }),
      TipoDoc: AP.select('TipoDoc', AP.CAT.tiposDoc, 'CC'),
      NumDoc: I('NumDoc', '', { inputmode: 'numeric', placeholder: 'Número' }),
      Telefono: I('Telefono', '', { inputmode: 'tel', placeholder: noAnunciado ? 'Ej.: 3001234567' : '' }),
      Empresa: esAut ? AP.select('Empresa', [''].concat(AP.CAT.entidades), '') : I('Empresa', ''),
      Anfitrion: I('Anfitrion', '', { placeholder: 'Persona o área visitada' }),
      Motivo: AP.textarea('Motivo', '', { rows: 2 }),
      Placa: I('Placa', '', { autocapitalize: 'characters', maxlength: 10 }),
      VehiculoTipo: AP.select('VehiculoTipo', AP.CAT.vehiculos, ''),
      AutorizadoPor: I('AutorizadoPor', AP.Session.can('admin') && !esAut && !noAnunciado ? (AP.Session.user.nombre || '') : '', { placeholder: 'Nombre y cargo de quien autoriza el ingreso' })
    };
    // Todo ingreso manual (sin QR), salvo autoridades, exige quién autoriza y por qué; queda como excepción y novedad
    var requiereJust = !esAut && !noAnunciado;
    var justif = AP.textarea('Justificacion', '', { rows: 2, placeholder: 'Por qué ingresa sin QR: olvidó el carné, celular sin batería, conductor no registrado…' });
    // Visitante no anunciado: anfitrión del personal propio, correo opcional y autorización de datos previa a la solicitud
    var anf = null, correo = null, autorizaSol = null;
    if (noAnunciado) {
      delete f.Anfitrion; delete f.AutorizadoPor;
      anf = AP.anfitrionPicker({ fuente: function () { return Promise.resolve(AP.Sync.personas); }, libre: true, placeholder: 'Buscar colaborador (nombre, cargo o área)' });
      correo = I('Correo', '', { type: 'email', inputmode: 'email', placeholder: 'Opcional' });
      autorizaSol = AP.check('AutorizaDatos', AP.TX.confirmacionSolicitudVisita ||
        ((AP.TX.confirmacionVisitante || '¿Autoriza el tratamiento de sus datos personales para el control de acceso?') +
          ' Incluye el envío por WhatsApp, al celular que suministra, del código QR de su visita.'), false);
    }
    var aut = {
      Unidad: I('Unidad', '', { placeholder: 'Unidad / seccional / dependencia' }),
      Grado: I('Grado', '', { placeholder: 'Grado o cargo' }),
      Credencial: I('Credencial', '', { placeholder: 'N.° de placa, credencial o T.P.' }),
      Servidores: I('Servidores', '1', { type: 'number', min: 1, inputmode: 'numeric' }),
      TipoVisita: AP.select('TipoVisita', [''].concat(AP.CAT.tiposVisitaAutoridad), ''),
      Orden: I('Orden', '', { placeholder: 'N.° de orden o acto, si se exhibe' })
    };
    // Si el documento corresponde a una persona registrada o a una visita vigente, se sugiere usarla.
    var sugerencia = h('div', { class: 'stack sm' });
    f.NumDoc.addEventListener('input', U.debounce(function () {
      sugerencia.replaceChildren();
      var d = U.normDoc(f.NumDoc.value); if (d.length < 5) return;
      var p = AP.Sync.personas.find(function (x) { return U.normDoc(x.NumDoc) === d; });
      if (p) {
        var ev = AP.Access.evaluate(p.Token);
        sugerencia.appendChild(h('button', { class: 'banner ' + (ev.nivel === 'ok' ? 'info' : 'deny'), type: 'button', onclick: function () {
          ev.origen = 'Documento'; AP.State.result = ev; AP.State.fromScan = false; AP.go('/resultado');
        } }, AP.icon('user', 18), h('span', null, p.Title + ' ya está registrado (' + ev.etiqueta + '). Toque para usar su ficha.')));
      }
      var v = noAnunciado ? visitaVigente(d) : null;
      // Visitante conocido: se llenan los datos de su visita anterior (el vigilante los confirma con él)
      if (noAnunciado && !v) {
        AP.Visitantes.historial(f.NumDoc.value).then(function (l) {
          if (U.normDoc(f.NumDoc.value) !== d || !l.length) return;
          var llenos = AP.Visitantes.llenar({ Title: f.Title, TipoDoc: f.TipoDoc, Empresa: f.Empresa, Telefono: f.Telefono, Correo: correo, Placa: f.Placa, VehiculoTipo: f.VehiculoTipo }, l[0]);
          sugerencia.appendChild(h('p', { class: 'banner info' }, AP.icon('user', 18), h('span', null, 'Visitante conocido (última visita: ' + U.fDate(l[0].FechaInicio) + ').' + (llenos.length ? ' Se llenaron: ' + llenos.join(', ') + '. Confírmelos con el visitante y corrija lo que haya cambiado.' : ''))));
        });
      }
      if (v) {
        sugerencia.appendChild(h('a', { class: 'banner ' + (v.Estado === 'Aprobada' ? 'info' : 'warn'), href: '#/espera?id=' + encodeURIComponent(v.id) },
          AP.icon(v.Estado === 'Aprobada' ? 'qr' : 'clock', 18),
          h('span', null, v.Title + (v.Estado === 'Aprobada' ? ' ya tiene una visita aprobada: lea su código QR.' : ' ya tiene una solicitud esperando aprobación. Toque para verla.'))));
      }
    }, 250));

    var salidas = salidasManuales();
    AP.add(box,
      salidas,
      AP.field('Categoría', catCtl),
      esAut ? h('p', { class: 'note' }, AP.TX.autoridad) : null,
      noAnunciado ? h('p', { class: 'note' }, 'El visitante no anunciado NO ingresa todavía. Registre sus datos y envíe la solicitud al Director de Seguridad Integral. Si la aprueba, el visitante recibe por WhatsApp su código QR: léalo para registrar el ingreso y, después, la salida.') : null,
      h('div', { class: 'card stack' },
        esAut ? AP.field('Entidad', f.Empresa) : null,
        esAut ? AP.field('Unidad', aut.Unidad) : null,
        AP.field(esAut ? 'Nombres y apellidos del servidor a cargo' : 'Nombres y apellidos' + (noAnunciado ? ' *' : ''), f.Title),
        esAut ? AP.field('Grado / cargo', aut.Grado) : null,
        h('div', { class: 'grid2' }, AP.field('Tipo doc.', f.TipoDoc), AP.field('Número de documento' + (noAnunciado ? ' *' : ''), f.NumDoc)),
        sugerencia,
        esAut ? h('div', { class: 'grid2' }, AP.field('Placa / credencial', aut.Credencial), AP.field('N.° de servidores', aut.Servidores)) : null,
        esAut ? AP.field('Tipo de visita', aut.TipoVisita) : null,
        esAut ? AP.field('Orden o acto que soporta la actuación', aut.Orden) : null,
        !esAut ? AP.field('Empresa / dependencia', f.Empresa) : null,
        !esAut ? AP.field(noAnunciado ? 'Celular con WhatsApp *' : 'Teléfono', f.Telefono, noAnunciado ? 'A este número el Director le enviará el código QR si aprueba la visita.' : null) : null,
        noAnunciado ? AP.field('Correo electrónico', correo) : null,
        noAnunciado ? AP.field('Colaborador que visita (anfitrión) *', anf, 'Busque en el personal propio. Si no aparece, escriba el nombre o el área.') : AP.field(esAut ? 'Área visitada / acompañante' : 'Anfitrión o área solicitante', f.Anfitrion),
        AP.field('Motivo' + (noAnunciado ? ' *' : ''), f.Motivo),
        h('div', { class: 'grid2' }, AP.field(esAut ? 'Vehículo(s) / placa(s)' : 'Placa', f.Placa), AP.field('Tipo de vehículo', f.VehiculoTipo)),
        requiereJust ? AP.field('Autorizado por *', f.AutorizadoPor) : null,
        requiereJust ? AP.field('Justificación: por qué ingresa sin QR *', justif, 'Queda en las alertas y en las novedades para verificación del Director de Seguridad Integral.') : null,
        noAnunciado ? h('div', { class: 'stack sm' }, autorizaSol, h('p', { class: 'help' }, 'Pregúntele al visitante y marque solo si responde que sí. Sin su autorización no se registran sus datos.')) : null),
      noAnunciado
        ? h('button', { class: 'btn big block primary', type: 'button', onclick: function (e) { enviarSolicitud(e.currentTarget); } }, AP.icon('inbox', 22), 'Enviar a aprobación del Director')
        : h('button', { class: 'btn big block go-in', type: 'button', onclick: continuar }, AP.icon('check', 22), 'Continuar al registro'));

    function visitaVigente(doc) {
      var ahora = new Date();
      return AP.Sync.visitas.filter(function (v) {
        return U.normDoc(v.NumDoc) === doc && new Date(v.FechaFin) >= ahora && (v.Estado === 'Pendiente' || v.Estado === 'Aprobada');
      }).sort(function (a, b) { return a.FechaInicio < b.FechaInicio ? -1 : 1; })[0] || null;
    }

    var enviando = false;
    async function enviarSolicitud(btn) {
      if (enviando) return;
      var d = {};
      Object.keys(f).forEach(function (k) { d[k] = f[k].value.trim(); });
      var a = anf.valor();
      var mail = correo.value.trim();
      if (d.Title.length < 5) return AP.toast('Escriba el nombre completo del visitante.', 'warn');
      if (U.normDoc(d.NumDoc).length < 4) return AP.toast('Escriba el número de documento.', 'warn');
      if (!AP.waNum(d.Telefono)) return AP.toast('Escriba el celular del visitante (10 dígitos, ej.: 3001234567). Allí recibirá el código QR por WhatsApp.', 'warn', 7000);
      if (mail && !EMAIL_RE.test(mail)) return AP.toast('El correo no es válido. Corríjalo o déjelo vacío.', 'warn');
      if (!a.Anfitrion || a.Anfitrion.length < 3) return AP.toast('Indique el colaborador o el área que visita.', 'warn');
      if (d.Motivo.length < 4) return AP.toast('Escriba el motivo de la visita.', 'warn');
      if (!autorizaSol.querySelector('input').checked) return AP.toast('Sin la autorización del visitante para el tratamiento de sus datos no es posible registrar la solicitud.', 'warn', 7000);
      var previa = visitaVigente(U.normDoc(d.NumDoc));
      if (previa) { AP.toast(previa.Estado === 'Aprobada' ? 'Esta persona ya tiene una visita aprobada: lea su código QR.' : 'Esta persona ya tiene una solicitud esperando aprobación.', 'info', 6000); AP.go('/espera?id=' + encodeURIComponent(previa.id)); return; }
      var ahora = new Date(), u = user();
      // Vigencia provisional: el Director fija la definitiva al aprobar
      var fin = U.fromLocal(U.ymd(ahora), '23:59');
      if (fin.getTime() - ahora.getTime() < 3 * 3600000) fin = new Date(ahora.getTime() + 3 * 3600000);
      var data = {
        Title: d.Title, TipoDoc: d.TipoDoc, NumDoc: d.NumDoc, Telefono: d.Telefono, Correo: mail, Empresa: d.Empresa,
        Motivo: d.Motivo, Placa: U.normPlaca(d.Placa), VehiculoTipo: d.VehiculoTipo,
        Anfitrion: a.Anfitrion, AnfitrionId: a.AnfitrionId, AnfitrionDoc: a.AnfitrionDoc, AnfitrionCargo: a.AnfitrionCargo, Area: a.Area,
        Categoria: 'Visitante', Estado: 'Pendiente', Origen: 'Portería', Porteria: AP.CFG.porteria, Token: U.newToken(),
        FechaInicio: ahora.toISOString(), FechaFin: fin.toISOString(),
        SolicitadoPor: AP.Session.user.usuario, SolicitadoPorNombre: u.nombre, FechaSolicitud: ahora.toISOString(), AutorizaDatos: true
      };
      enviando = true; btn.disabled = true; btn.lastChild.textContent = 'Enviando…';
      try {
        var rec = await AP.B.create('AP_Visitas', data);
        AP.Sync.visitas.push(rec); AP.Sync.reindex(); AP.Visitantes.olvidar(d.NumDoc);
        await AP.Audit.log('Solicitud de visita no anunciada (portería)', d.Title + ' — ' + U.fDateTime(ahora), 'Visita a: ' + a.Anfitrion + (a.AnfitrionId ? ' (vinculado)' : ' (sin vincular)') + '; registró ' + u.nombre);
        U.beep('ok');
        AP.go('/espera?id=' + encodeURIComponent(rec.id) + '&nueva=1');
      } catch (e) {
        AP.toast(e.offline ? 'Sin conexión: la solicitud no se pudo enviar. Intente de nuevo cuando haya señal o llame al Director de Seguridad Integral. El visitante no ingresa mientras tanto.' : 'No se pudo enviar la solicitud: ' + e.message, 'error', 9000);
      } finally { enviando = false; btn.disabled = false; btn.lastChild.textContent = 'Enviar a aprobación del Director'; }
    }

    function continuar() {
      var d = {};
      Object.keys(f).forEach(function (k) { d[k] = f[k].value.trim(); });
      var jus = justif.value.trim();
      if (d.Title.length < 5) return AP.toast('Escriba el nombre completo.', 'warn');
      if (!esAut && d.NumDoc.length < 4) return AP.toast('Escriba el número de documento.', 'warn');
      if (requiereJust && d.AutorizadoPor.length < 4) return AP.toast('Indique quién autoriza el ingreso.', 'warn');
      if (requiereJust && jus.length < 6) return AP.toast('Escriba por qué la persona ingresa sin QR.', 'warn');
      var extra = null;
      if (esAut) {
        if (!d.Empresa) return AP.toast('Seleccione la entidad.', 'warn');
        extra = { unidad: aut.Unidad.value.trim(), grado: aut.Grado.value.trim(), credencial: aut.Credencial.value.trim(), servidores: aut.Servidores.value, tipoVisita: aut.TipoVisita.value, orden: aut.Orden.value.trim() };
      }
      var rec = {
        Title: d.Title, TipoDoc: d.TipoDoc, NumDoc: d.NumDoc, Telefono: d.Telefono, Empresa: d.Empresa, Anfitrion: d.Anfitrion,
        Motivo: d.Motivo, Placa: U.normPlaca(d.Placa), VehiculoTipo: d.VehiculoTipo, Categoria: cat,
        Cargo: esAut ? extra.grado : '', Area: esAut ? extra.unidad : '',
        DatosAdicionales: extra ? JSON.stringify(extra) : undefined
      };
      var key = d.NumDoc ? 'DOC:' + U.normDoc(d.NumDoc) : null;
      var ult = key ? AP.Access.lastFor(key) : null;
      AP.State.result = {
        tipo: 'manual', rec: rec, categoria: cat, origen: 'Manual', token: null, nivel: 'ok',
        etiqueta: esAut ? 'AUTORIDAD — INFORME AL DIRECTOR' : 'REGISTRO MANUAL',
        detalle: d.AutorizadoPor ? 'Autorizado por ' + d.AutorizadoPor : (esAut ? 'Diligenciar formato AP-SG-FT-002' : ''),
        ultimo: ult, sentido: ult && ult.Sentido === 'Ingreso' ? 'Salida' : 'Ingreso'
      };
      if (d.AutorizadoPor) { rec.AutorizadoPor = d.AutorizadoPor; }
      AP.State.manualExtra = requiereJust ? { Excepcion: true, AutorizadoPor: d.AutorizadoPor, MotivoExcepcion: jus, Novedad: 'Ingreso sin lectura de QR (registro manual: ' + cat + ')' } : null;
      AP.State.fromScan = false;
      AP.go('/resultado');
    }
    AP.porteriaShell(esAut ? 'Visita de autoridad' : noAnunciado ? 'Visitante no anunciado' : 'Registro manual', box, { back: '/porteria' });
  });

  // Quienes ingresaron por registro manual (sin QR: autoridades, personas sin carné) registran su salida desde aquí.
  function salidasManuales() {
    var lista = AP.Access.inside().filter(function (m) { return m.RefLista === 'Manual'; });
    if (!lista.length) return null;
    return h('section', { class: 'card stack sm' },
      h('h3', { class: 'row gap' }, AP.icon('logout', 20), h('span', null, 'Salida de registros manuales (' + lista.length + ')')),
      h('p', { class: 'muted small' }, 'Personas que ingresaron sin QR. Toque el nombre para registrar su salida.'),
      h('div', { class: 'list' }, lista.map(function (m) {
        return h('button', { class: 'list-item', type: 'button', onclick: function () {
          AP.State.result = {
            tipo: 'manual', token: null, origen: 'Manual', categoria: m.Categoria, nivel: 'ok', etiqueta: 'REGISTRO DE SALIDA', detalle: 'Ingresó el ' + U.fDateTime(m.FechaHora),
            rec: { Title: m.Title, TipoDoc: m.TipoDoc, NumDoc: m.NumDoc, Empresa: m.Empresa, Anfitrion: m.Anfitrion, Area: m.Area, Motivo: m.Motivo, Placa: m.Placa, VehiculoTipo: m.VehiculoTipo, Categoria: m.Categoria, Telefono: m.Telefono, Cargo: m.Cargo },
            ultimo: m, sentido: 'Salida'
          };
          AP.State.fromScan = false; AP.go('/resultado');
        } }, AP.icon('user', 20),
          h('div', null, h('strong', null, m.Title), h('small', null, (m.Categoria || '') + ' · ingresó ' + U.fTime(m.FechaHora) + (U.ymd(m.FechaHora) !== U.ymd() ? ' del ' + U.fDate(m.FechaHora) : '') + ' (' + U.duracion(m.FechaHora) + ')')),
          h('span', { class: 'btn small' }, 'Salida'));
      })));
  }

  // =================== SOLICITUD DE VISITA: ESPERA DE LA DECISIÓN DEL DIRECTOR ===================
  function textoAvisoDirector(v) {
    return 'Visitante no anunciado en ' + (v.Porteria || AP.CFG.porteria) + ': ' + v.Title + (v.Empresa ? ' (' + v.Empresa + ')' : '') +
      '. Visita a: ' + (v.Anfitrion || '—') + '. Motivo: ' + (v.Motivo || '—') + '. Registró: ' + (v.SolicitadoPorNombre || v.SolicitadoPor || '') +
      ' a las ' + U.fTime(v.FechaSolicitud || v.FechaInicio) + '. Pendiente de su aprobación en la app (Consola > Visitas > Por aprobar).';
  }
  AP.route('/espera', function (qs) {
    var id = qs.id;
    var box = h('div', { class: 'stack' });
    AP.porteriaShell('Solicitud de visita', box, { back: '/porteria' });
    var estadoPrevio = null;
    function visita() { return AP.Sync.visitas.find(function (x) { return x.id === id; }) || null; }
    function pintar() {
      if (document.querySelector('.modal-wrap')) return;
      var v = visita();
      if (!v) { box.replaceChildren(AP.spinner('Consultando la solicitud…')); return; }
      var est = v.Estado;
      if (estadoPrevio === 'Pendiente' && est !== 'Pendiente') U.beep(est === 'Aprobada' ? 'ok' : 'deny');
      estadoPrevio = est;
      var vence = new Date(v.FechaFin) < new Date();
      var verdict;
      if (est === 'Pendiente') {
        verdict = h('div', { class: 'verdict warn' }, AP.icon('clock', 40), h('div', null, h('strong', null, 'ESPERANDO APROBACIÓN'),
          h('span', null, 'El visitante NO ingresa todavía. Esta pantalla se actualiza sola cuando el Director decida.')));
      } else if (est === 'Aprobada') {
        verdict = h('div', { class: 'verdict ' + (vence ? 'deny' : 'ok') }, AP.icon(vence ? 'x' : 'check', 40), h('div', null, h('strong', null, vence ? 'APROBACIÓN VENCIDA' : 'VISITA APROBADA'),
          h('span', null, vence ? 'La autorización terminó el ' + U.fDateTime(v.FechaFin) + '.' : 'Vale del ' + U.fDateTime(v.FechaInicio) + ' a las ' + U.fTime(v.FechaFin) + (U.ymd(v.FechaFin) !== U.ymd(v.FechaInicio) ? ' del ' + U.fDate(v.FechaFin) : '') + '. Pida al visitante el código QR que recibió por WhatsApp y léalo.')));
      } else if (est === 'Rechazada') {
        verdict = h('div', { class: 'verdict deny' }, AP.icon('x', 40), h('div', null, h('strong', null, 'VISITA RECHAZADA'), h('span', null, 'No se permite el ingreso. Informe al visitante con cortesía.')));
      } else {
        verdict = h('div', { class: 'verdict muted' }, AP.icon('x', 40), h('div', null, h('strong', null, 'SOLICITUD ' + String(est || '').toUpperCase()), h('span', null, 'El visitante no ingresa con esta solicitud.')));
      }
      var kv = function (k, val) { return val ? h('div', { class: 'kv' }, h('span', null, k), h('strong', null, val)) : null; };
      var datos = h('section', { class: 'card stack sm' },
        h('h3', null, v.Title),
        kv('Documento', (v.TipoDoc ? v.TipoDoc + ' ' : '') + (v.NumDoc || '')),
        kv('Celular', v.Telefono), kv('Empresa / entidad', v.Empresa),
        kv('Visita a', [v.Anfitrion, v.AnfitrionCargo, v.Area].filter(Boolean).join(' · ')),
        kv('Motivo', v.Motivo), kv('Vehículo', [v.VehiculoTipo, v.Placa].filter(Boolean).join(' · ')),
        kv('Solicitud', U.fDateTime(v.FechaSolicitud || v.FechaInicio) + (v.SolicitadoPorNombre ? ' · registró ' + v.SolicitadoPorNombre : '')),
        est !== 'Pendiente' && v.FechaAprobacion ? kv(est === 'Aprobada' ? 'Aprobada' : 'Decisión', U.fDateTime(v.FechaAprobacion) + (v.AprobadoPorNombre ? ' · ' + v.AprobadoPorNombre : '')) : null,
        est === 'Rechazada' ? kv('Motivo del rechazo', v.JustificacionDecision || '—') : null);
      var acciones = h('div', { class: 'stack sm' });
      if (est === 'Pendiente') {
        AP.add(acciones,
          h('a', { class: 'btn block', href: AP.waLink(AP.WA_DIRECTOR, textoAvisoDirector(v)), target: '_blank', rel: 'noopener' }, AP.icon('whatsapp', 18), 'Avisar al Director por WhatsApp'),
          h('button', { class: 'btn block danger-outline', type: 'button', onclick: function () { cancelar(v); } }, AP.icon('x', 18), 'Cancelar solicitud (el visitante se retiró)'));
      } else if (est === 'Aprobada' && !vence) {
        AP.add(acciones, h('a', { class: 'btn big block go-in', href: '#/escanear' }, AP.icon('qr', 22), 'Leer QR del visitante'),
          h('p', { class: 'muted small' }, 'El ingreso y la salida del visitante se registran leyendo su QR.'));
      }
      AP.add(acciones, h('a', { class: 'btn block', href: '#/porteria' }, 'Volver a portería'));
      box.replaceChildren(verdict, qs.nueva && est === 'Pendiente' ? h('p', { class: 'banner info' }, AP.icon('check', 18), h('span', null, 'Solicitud enviada al Director de Seguridad Integral. Avísele también por WhatsApp si es urgente.')) : null, datos, acciones);
    }
    async function cancelar(v) {
      var ok = await AP.confirm('Cancelar solicitud', '¿El visitante se retiró? La solicitud quedará cancelada y el Director ya no la verá por aprobar.', 'Sí, cancelar', 'danger');
      if (!ok) return;
      var u = user();
      var cambios = { Estado: 'Cancelada', Observaciones: (v.Observaciones ? v.Observaciones + '\n' : '') + 'Cancelada en portería por ' + u.nombre + ' el ' + U.fDateTime(new Date()) + ': el visitante se retiró.' };
      try {
        await AP.B.update('AP_Visitas', v.id, cambios);
        Object.assign(v, cambios);
        await AP.Audit.log('Cancelación de solicitud de visita (portería)', v.Title, 'Por ' + u.nombre);
        AP.toast('Solicitud cancelada.');
        pintar();
        AP.Sync.run();
      } catch (e) { AP.toast('No se pudo cancelar: ' + e.message, 'error', 7000); }
    }
    pintar();
    if (!visita()) AP.Sync.run().then(function () { if (!visita()) box.replaceChildren(AP.empty('search', 'Solicitud no encontrada', 'Verifique la conexión e intente de nuevo.', h('a', { class: 'btn', href: '#/porteria' }, 'Volver a portería'))); });
    // Mientras se espera la decisión, se consulta el servidor cada 15 segundos
    var t = setInterval(function () { var v = visita(); if (document.visibilityState === 'visible' && (!v || v.Estado === 'Pendiente')) AP.Sync.run(); }, 15000);
    AP.onLeave(function () { clearInterval(t); });
    AP.onLeave(AP.Sync.on(U.debounce(pintar, 250)));
  });

  // =================== SOLICITUD DE INGRESO: ESPERA DE LA DECISIÓN DEL DIRECTOR ===================
  // Ya registrado el resultado (ingreso o ingreso negado) con esta solicitud
  AP.solicitudUsada = function (x) { return AP.Sync.allMovs().some(function (m) { return m.SolicitudId === x.id; }); };
  // Solicitud de hoy que sigue abierta para la persona: pendiente, o decidida y sin registrar en portería
  AP.solicitudAbierta = function (token) {
    var hoy = U.ymd(), ahora = new Date();
    return (AP.Sync.solicitudes || []).filter(function (x) {
      if (x.Token !== token || U.ymd(x.FechaSolicitud) !== hoy || AP.solicitudUsada(x)) return false;
      if (x.Estado === 'Pendiente' || x.Estado === 'Rechazada') return true;
      return x.Estado === 'Aprobada' && x.VigenteHasta && new Date(x.VigenteHasta) > ahora;
    }).sort(function (a, b) { return a.FechaSolicitud < b.FechaSolicitud ? 1 : -1; })[0] || null;
  };
  function textoSolDirector(x) {
    return 'Solicitud de ingreso en ' + (x.Porteria || AP.CFG.porteria) + ': ' + x.Title + (x.Empresa ? ' (' + x.Empresa + ')' : '') + ' — ' + (x.Novedad || x.Tipo) +
      (x.HorarioInfo ? '. Turno: ' + x.HorarioInfo : '') + '. Registró: ' + (x.SolicitadoPorNombre || x.SolicitadoPor || '') + ' a las ' + U.fTime(x.FechaSolicitud) +
      '. Pendiente de su decisión en la app (Consola > Solicitudes de ingreso).';
  }
  AP.route('/espera-ingreso', function (qs) {
    var id = qs.id;
    var box = h('div', { class: 'stack' });
    AP.porteriaShell('Solicitud de ingreso', box, { back: '/porteria' });
    var previo = null, ocupado = false;
    function sol() { return (AP.Sync.solicitudes || []).find(function (x) { return x.id === id; }) || null; }
    function persona(x) { var hit = x.Token ? AP.Sync.byToken.get(x.Token) : null; return hit && hit.tipo === 'persona' ? hit.rec : null; }
    function pintar() {
      if (document.querySelector('.modal-wrap') || ocupado) return;
      var x = sol();
      if (!x) { box.replaceChildren(AP.spinner('Consultando la solicitud…')); return; }
      if (previo === 'Pendiente' && x.Estado !== 'Pendiente') U.beep(x.Estado === 'Aprobada' ? 'ok' : 'deny');
      previo = x.Estado;
      var usada = AP.solicitudUsada(x);
      var vence = x.Estado === 'Aprobada' && x.VigenteHasta && new Date(x.VigenteHasta) <= new Date();
      var v;
      if (x.Estado === 'Pendiente') v = ['warn', 'clock', 'ESPERANDO DECISIÓN DEL DIRECTOR', 'La persona NO ingresa todavía. Esta pantalla se actualiza sola cuando el Director decida.'];
      else if (x.Estado === 'Aprobada') v = usada ? ['ok', 'check', 'INGRESO YA REGISTRADO', 'El ingreso aprobado ya quedó registrado.']
        : vence ? ['deny', 'x', 'APROBACIÓN VENCIDA', 'La aprobación permitía registrar el ingreso hasta las ' + U.fTime(x.VigenteHasta) + '. Comuníquese con el Director.']
          : ['ok', 'check', 'INGRESO APROBADO POR EL DIRECTOR', 'Registre el ingreso' + (x.VigenteHasta ? ' antes de las ' + U.fTime(x.VigenteHasta) : '') + '.'];
      else if (x.Estado === 'Rechazada') v = ['deny', 'x', 'INGRESO RECHAZADO POR EL DIRECTOR', usada ? 'El ingreso negado ya quedó registrado.' : 'No se permite el ingreso. Registre el ingreso negado e informe a la persona con cortesía.'];
      else v = ['muted', 'x', 'SOLICITUD ' + String(x.Estado || '').toUpperCase(), 'La persona no ingresa con esta solicitud.'];
      var verdict = h('div', { class: 'verdict ' + v[0] }, AP.icon(v[1], 40), h('div', null, h('strong', null, v[2]), h('span', null, v[3])));
      var kv = function (k, val) { return val ? h('div', { class: 'kv' }, h('span', null, k), h('strong', null, val)) : null; };
      var datos = h('section', { class: 'card stack sm' },
        h('h3', null, x.Title),
        kv('Documento', ((x.TipoDoc || '') + ' ' + (x.NumDoc || '')).trim()), kv('Tipo / empresa', [x.PersonaTipo, x.Empresa].filter(Boolean).join(' · ')),
        kv('Motivo', x.Novedad || x.Tipo), kv('Turno programado', x.HorarioInfo),
        kv('Solicitud', U.fDateTime(x.FechaSolicitud) + (x.SolicitadoPorNombre ? ' · registró ' + x.SolicitadoPorNombre : '')),
        x.Estado !== 'Pendiente' && x.FechaDecision ? kv('Decisión', U.fDateTime(x.FechaDecision) + (x.DecididoPorNombre ? ' · ' + x.DecididoPorNombre : '')) : null,
        x.Estado !== 'Pendiente' ? kv(x.Estado === 'Rechazada' ? 'Motivo del rechazo' : 'Justificación', x.Justificacion) : null);
      var acciones = h('div', { class: 'stack sm' });
      if (x.Estado === 'Pendiente') {
        AP.add(acciones,
          h('a', { class: 'btn block', href: AP.waLink(AP.WA_DIRECTOR, textoSolDirector(x)), target: '_blank', rel: 'noopener' }, AP.icon('whatsapp', 18), 'Avisar al Director por WhatsApp'),
          (AP.CFG.telefonos || {}).director ? h('a', { class: 'btn block', href: 'tel:' + AP.CFG.telefonos.director }, AP.icon('phone', 18), 'Llamar al Director') : null,
          h('button', { class: 'btn block danger-outline', type: 'button', onclick: function () { seRetiro(x); } }, AP.icon('x', 18), 'La persona se retiró: registrar ingreso negado'));
      } else if (x.Estado === 'Aprobada' && !usada && !vence) {
        AP.add(acciones, h('button', { class: 'btn big block go-in', type: 'button', onclick: function () { ingresar(x); } }, AP.icon('check', 22), 'Registrar INGRESO'));
      } else if (x.Estado === 'Rechazada' && !usada) {
        AP.add(acciones, h('button', { class: 'btn big block danger', type: 'button', onclick: function () {
          negar(x, 'Ingreso rechazado por el Director de Seguridad Integral' + (x.Justificacion ? ': ' + x.Justificacion : ''), 'rechazado por el Director');
        } }, AP.icon('x', 22), 'Registrar ingreso negado'));
      }
      AP.add(acciones, h('a', { class: 'btn block', href: '#/porteria' }, 'Volver a portería'));
      box.replaceChildren(verdict,
        qs.nueva && x.Estado === 'Pendiente' ? h('p', { class: 'banner info' }, AP.icon('check', 18), h('span', null, 'Solicitud enviada al Director de Seguridad Integral. Si es urgente, avísele también por WhatsApp o llámelo.')) : null,
        datos, acciones);
    }
    // Ingreso aprobado: se registra con la constancia de la aprobación (sin depender de que el permiso ya esté en el celular)
    function ingresar(x) {
      var ev = AP.Access.evaluate(x.Token);
      if (!ev.rec) return AP.toast('La persona no figura en los datos del celular. Sincronice e intente de nuevo.', 'warn');
      var r2 = Object.assign({}, ev, {
        nivel: 'ok', etiqueta: 'INGRESO APROBADO POR EL DIRECTOR', sentido: 'Ingreso', solicitud: x,
        detalle: 'Aprobó ' + (x.DecididoPorNombre || 'el Director') + ' a las ' + U.fTime(x.FechaDecision) + (x.Justificacion ? '. ' + x.Justificacion : '') + '.',
        origen: (x.Origen === 'Documento' ? 'Documento' : 'QR') + ' (aprobación del Director)',
        novedad: (x.Novedad || x.Tipo) + ' — ingreso aprobado por el Director' + (x.Origen === 'Documento' ? ' | ' + NOV_SIN_QR : '')
      });
      delete r2.aprobacionDirector; delete r2.sinExcepcion; delete r2.registrable;
      AP.State.result = r2; AP.State.fromScan = false;
      AP.go('/resultado');
    }
    async function negar(x, motivo, como) {
      if (ocupado) return;
      ocupado = true;
      try {
        var p = persona(x) || {};
        var mov = await registrar({
          Title: x.Title, Sentido: 'Ingreso', Resultado: 'Negado', Categoria: x.PersonaTipo || p.Tipo, Origen: x.Origen || 'QR', Token: x.Token,
          RefLista: 'AP_Personas', RefId: p.id, TipoDoc: x.TipoDoc, NumDoc: x.NumDoc, Telefono: p.Telefono, Empresa: x.Empresa, Cargo: x.Cargo, Area: x.Area,
          EstadoMostrado: como === 'se retiró' ? 'SE RETIRÓ ANTES DE LA DECISIÓN DEL DIRECTOR' : 'INGRESO RECHAZADO POR EL DIRECTOR', MotivoNegacion: motivo,
          Novedad: (x.Novedad || x.Tipo) + ' — ' + como, HorarioInfo: x.HorarioInfo, SolicitudId: x.id
        });
        if (AP.Notif) AP.Notif.movimiento(mov);
        await flash(false, 'INGRESO NEGADO', x.Title);
      } catch (e) { AP.toast('No se pudo registrar: ' + e.message, 'error', 8000); }
      finally { ocupado = false; pintar(); }
    }
    async function seRetiro(x) {
      if (!(await AP.confirm('La persona se retiró', 'Se registra el ingreso negado de ' + x.Title + ' y la solicitud queda cancelada; el Director ya no la verá por decidir.', 'Registrar y cancelar', 'danger'))) return;
      try {
        var u = user();
        await AP.B.update('AP_Solicitudes', x.id, { Estado: 'Cancelada', Observaciones: (x.Observaciones ? x.Observaciones + '\n' : '') + 'Cancelada en portería por ' + u.nombre + ' el ' + U.fDateTime(new Date()) + ': la persona se retiró.' });
        x.Estado = 'Cancelada';
      } catch (e) { AP.toast('No se pudo cancelar la solicitud (' + e.message + '). Se registra igual el ingreso negado.', 'warn', 7000); }
      await negar(x, 'La persona se retiró antes de la decisión del Director de Seguridad Integral', 'se retiró');
      AP.Sync.run();
    }
    pintar();
    if (!sol()) AP.Sync.run().then(function () { if (!sol()) box.replaceChildren(AP.empty('search', 'Solicitud no encontrada', 'Verifique la conexión e intente de nuevo.', h('a', { class: 'btn', href: '#/porteria' }, 'Volver a portería'))); });
    // Mientras se espera la decisión se consulta el servidor cada 15 segundos
    var t = setInterval(function () {
      var x = sol();
      if (document.visibilityState === 'visible' && (!x || x.Estado === 'Pendiente')) AP.Sync.pullSolicitudes().then(pintar).catch(function () { /* se reintenta */ });
    }, 15000);
    AP.onLeave(function () { clearInterval(t); });
    AP.onLeave(AP.Sync.on(U.debounce(pintar, 250)));
  });

  // =================== VISITAS DE HOY (solo consulta) ===================
  // El vigilante sabe con anticipación quién llega durante el día. No se registra nada desde aquí:
  // el ingreso y la salida se hacen leyendo el QR del visitante, y al ingresar la visita sale de esta lista.
  AP.route('/visitas-hoy', function () {
    var box = h('div', { class: 'stack vis-hoy' });
    AP.porteriaShell('Visitas de hoy', box, { back: '/porteria', sub: 'Solo consulta' });
    function pintar() {
      var ahora = new Date(), l = AP.Access.visitasPorLlegar(ahora);
      box.replaceChildren(
        h('p', { class: 'note' }, 'Solo consulta. El ingreso y la salida se registran leyendo el QR del visitante; al ingresar, sale de esta lista.'),
        l.length ? h('div', { class: 'list' }, l.map(function (v) {
          var ya = new Date(v.FechaInicio) <= ahora;
          return h('div', { class: 'list-item static' },
            h('div', { class: 'vh-hora' }, U.fTime(v.FechaInicio), h('small', { class: 'block muted' }, 'a ' + U.fTime(v.FechaFin))),
            h('div', null, h('strong', null, v.Title),
              h('small', null, [v.Empresa, v.Anfitrion ? 'visita a ' + [v.Anfitrion, v.Area].filter(Boolean).join(' · ') : ''].filter(Boolean).join(' — ')),
              v.Motivo ? h('small', null, v.Motivo) : null,
              v.Placa ? h('small', null, 'Vehículo: ' + [v.VehiculoTipo, v.Placa].filter(Boolean).join(' ')) : null),
            AP.pill(v.Origen === 'Portería' ? 'No anunciado' : ya ? 'Puede llegar' : 'Desde ' + U.fTime(v.FechaInicio), v.Origen === 'Portería' ? 'warn' : ya ? 'ok' : 'muted'));
        })) : AP.empty('user', 'No hay visitas por llegar hoy', 'Aquí aparecen las visitas aprobadas para hoy hasta que el visitante ingresa.'),
        h('p', { class: 'muted small' }, 'Datos del celular: ' + (AP.Sync.state.lastPull ? 'actualizados ' + U.rel(AP.Sync.state.lastPull) : 'sin descargar') + '.'));
    }
    pintar();
    AP.onLeave(AP.Sync.on(U.debounce(pintar, 250)));
    AP.Sync.run();
  });

  // =================== PERSONAS DENTRO ===================
  // El vigilante puede VER quién está dentro, pero no modificar nada: no hay botón de salida ni registro manual desde esta lista.
  // Solo el Director (rol Administrador) puede registrar una salida desde aquí; la del vigilante se hace leyendo el QR.
  AP.route('/dentro', function (qs) {
    var editar = AP.Session.can('admin');
    var filtro = qs.f || 'Todas';
    var lista = AP.Access.inside();
    var max = (AP.CFG.horasMaxPermanencia || 14) * 3600000;
    var cats = ['Todas'].concat(Array.from(new Set(lista.map(function (m) { return m.Categoria || 'Otro'; }))));
    var chips = h('div', { class: 'chips' }, cats.map(function (c) {
      var n = c === 'Todas' ? lista.length : lista.filter(function (m) { return (m.Categoria || 'Otro') === c; }).length;
      return h('a', { class: 'chip ' + (c === filtro ? 'on' : ''), href: '#/dentro?f=' + encodeURIComponent(c) }, c + ' (' + n + ')');
    }));
    var vis = lista.filter(function (m) { return filtro === 'Todas' || (m.Categoria || 'Otro') === filtro; });
    var cont = h('div', { class: 'stack' }, chips,
      editar ? null : h('p', { class: 'note' }, 'Solo consulta. La salida de cada persona se registra únicamente al leer su QR.'),
      vis.length ? h('div', { class: 'list' }, vis.map(function (m) {
        var largo = Date.now() - new Date(m.FechaHora).getTime() > max;
        var p = m.Token ? (AP.Sync.byToken.get(m.Token) || {}).rec : null;
        var cuerpo = [AP.photoEl(p || { Title: m.Title }, 'sm'),
          h('div', null, h('strong', null, m.Title), h('small', null, (m.Categoria || '') + ' · desde ' + U.fTime(m.FechaHora) + (U.ymd(m.FechaHora) !== U.ymd() ? ' del ' + U.fDate(m.FechaHora) : '') + ' (' + U.duracion(m.FechaHora) + ')' + (m.Placa ? ' · ' + m.Placa : ''))),
          m._pendiente ? AP.icon('sync', 16) : null,
          editar ? h('span', { class: 'btn small' }, 'Salida') : null];
        return editar
          ? h('button', { class: 'list-item' + (largo ? ' overdue' : ''), type: 'button', onclick: function () { salida(m); } }, cuerpo)
          : h('div', { class: 'list-item static' + (largo ? ' overdue' : '') }, cuerpo);
      })) : AP.empty('users', 'No hay personas registradas dentro', 'Según los registros de los últimos ' + (AP.CFG.diasHistorialEnPorteria || 2) + ' días.'));
    function salida(m) {
      var ev = m.Token ? AP.Access.evaluate(m.Token) : null;
      if (!ev || !ev.rec) ev = manualDesde(m);
      ev.origen = 'Lista de personas dentro (Director)'; AP.State.result = ev;
      AP.State.forceSalida = true; AP.State.fromScan = false;
      AP.go('/resultado');
    }
    function manualDesde(m) {
      return {
        tipo: 'manual', token: m.Token || null, origen: 'Lista de personas dentro (Director)', categoria: m.Categoria, nivel: 'ok', etiqueta: 'REGISTRO DE SALIDA', detalle: 'Ingresó el ' + U.fDateTime(m.FechaHora),
        rec: { Title: m.Title, TipoDoc: m.TipoDoc, NumDoc: m.NumDoc, Empresa: m.Empresa, Anfitrion: m.Anfitrion, Area: m.Area, Motivo: m.Motivo, Placa: m.Placa, VehiculoTipo: m.VehiculoTipo, Categoria: m.Categoria, Telefono: m.Telefono, Cargo: m.Cargo },
        ultimo: m, sentido: 'Salida'
      };
    }
    AP.porteriaShell('Personas dentro', cont, { back: '/porteria', sub: lista.length + ' en instalaciones' + (editar ? '' : ' (solo consulta)') });
  });

  // =================== MI TURNO ===================
  AP.route('/turno', function () {
    var dev = U.deviceId();
    var desde = Date.now() - 24 * 3600000;
    var mios = AP.Sync.allMovs().filter(function (m) { return m.Dispositivo === dev && new Date(m.FechaHora).getTime() >= desde; });
    var insp = AP.Sync.outbox.filter(function (o) { return o.kind === 'insp'; });
    var t = AP.Session.turno;
    var cont = h('div', { class: 'stack' },
      t ? h('div', { class: 'card stack sm' },
        h('div', { class: 'row gap wrap between' },
          h('div', null, h('strong', null, t.nombre), h('small', { class: 'muted block' }, 'Usuario ' + t.usuario + ' · ' + t.rol + ' · turno desde ' + U.fDateTime(t.inicio) + ' (' + U.duracion(t.inicio) + ')')),
          (function (n) { return AP.pill(n + (n === 1 ? ' registro' : ' registros') + ' en el turno', 'brand'); })(AP.Pin.resumenTurno(t).registros)),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn', type: 'button', onclick: function () { AP.Views.definirPin(); } }, AP.icon('lock', 18), 'Cambiar mi PIN'),
          h('button', { class: 'btn primary', type: 'button', onclick: AP.Views.cerrarTurno }, AP.icon('logout', 18), 'Cerrar turno y salir'))) : null,
      h('div', { class: 'card row gap wrap between' },
        h('div', null, h('strong', null, AP.Sync.pendingCount() + ' por enviar'), h('small', { class: 'muted block' }, 'Dispositivo ' + dev + (AP.Store.isMemory() ? ' · almacenamiento temporal' : ''))),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { AP.Sync.run().then(function () { AP.render(); }); } }, AP.icon('sync', 18), 'Enviar ahora')),
      insp.length ? h('div', { class: 'card' }, h('h3', null, 'Inspecciones por enviar'), insp.map(function (o) {
        return h('div', { class: 'kv' }, h('span', null, o.fields.Placa + ' · ' + U.fTime(o.fields.FechaHora)), h('strong', { class: o.error ? 'txt-deny' : '' }, o.error || (o.photos.length + ' fotos')));
      })) : null,
      mios.length ? h('div', { class: 'list' }, mios.map(function (m) {
        return h('div', { class: 'list-item static' },
          h('span', { class: 'dot ' + (m.Resultado === 'Negado' ? 'deny' : m.Sentido === 'Ingreso' ? 'ok' : 'out') }),
          h('div', null, h('strong', null, m.Title), h('small', null, U.fTime(m.FechaHora) + ' · ' + (m.Resultado === 'Negado' ? 'Ingreso negado' : m.Sentido) + (m.Placa ? ' · ' + m.Placa : '') + (m.Excepcion ? ' · excepción' : ''))),
          m._pendiente ? h('span', { class: 'pill ' + (m._error ? 'deny' : 'warn'), title: m._error || '' }, m._error ? 'Error' : 'Pendiente') : h('span', { class: 'pill ok' }, 'Enviado'));
      })) : AP.empty('history', 'Sin registros en las últimas 24 horas', 'Los registros hechos desde este celular aparecerán aquí.'));
    AP.porteriaShell('Mi turno', cont, { back: '/porteria' });
    AP.onLeave(AP.Sync.on(U.debounce(function () { if (location.hash === '#/turno' && !document.querySelector('.modal-wrap')) AP.render(); }, 600)));
  });
})();
