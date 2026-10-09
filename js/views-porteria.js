/* Pantallas de portería (celular del vigilante) */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function nowIso() { return new Date().toISOString(); }
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
    var content = h('div', { class: 'stack' },
      h('a', { class: 'scan-cta', href: '#/escanear' }, h('span', { class: 'scan-ico' }, AP.icon('qr', 44)),
        h('span', null, h('strong', null, 'Leer código QR'), h('small', null, 'Ingreso y salida: siempre con lectura del QR'))),
      h('div', { class: 'tiles' },
        tile('search', 'Buscar', 'Por documento o nombre', '/buscar'),
        tile('edit', 'Registro manual', 'Sin QR / no anunciado', '/manual'),
        tile('badge', 'Autoridad', 'Visita de autoridad', '/manual?cat=Autoridad'),
        tile('truck', 'Vehículo de carga', 'Inspección y precintos', '/carga'),
        tile('users', 'Personas dentro', String(dentro.length) + (AP.Session.can('admin') ? '' : ' · solo consulta'), '/dentro', dentro.length ? 'accent' : ''),
        tile('history', 'Mi turno', AP.Sync.pendingCount() ? AP.Sync.pendingCount() + ' por enviar' : 'Registros del celular', '/turno')),
      h('div', { class: 'quick-dial' },
        tel.director ? h('a', { class: 'btn', href: 'tel:' + tel.director }, AP.icon('phone', 18), 'Director') : null,
        tel.supervisor ? h('a', { class: 'btn', href: 'tel:' + tel.supervisor }, AP.icon('phone', 18), 'Supervisor') : null,
        tel.policia ? h('a', { class: 'btn danger-outline', href: 'tel:' + tel.policia }, AP.icon('phone', 18), 'Emergencias ' + tel.policia) : null),
      h('div', { class: 'p-foot' },
        h('span', null, AP.Session.turno ? 'Turno de: ' : 'Vigilante: ', h('strong', null, user().nombre),
          AP.Session.turno ? ' (' + AP.Session.turno.usuario + ') desde las ' + U.fTime(AP.Session.turno.inicio) : null),
        h('span', null, 'Datos: ' + (AP.Sync.state.lastPull ? U.rel(AP.Sync.state.lastPull) : 'sin descargar')),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn small', type: 'button', onclick: function () { AP.Sync.run().then(function () { AP.render(); }); } }, AP.icon('sync', 16), 'Sincronizar'),
          AP.Session.can('consola') ? h('a', { class: 'btn small', href: '#/consola/panel' }, AP.icon('chart', 16), 'Consola') : null,
          !AP.Session.can('consola') && AP.Session.can('historial') ? h('a', { class: 'btn small', href: '#/consola/historial' }, AP.icon('history', 16), 'Historial') : null,
          AP.State.installPrompt ? h('button', { class: 'btn small', type: 'button', onclick: function () { AP.State.installPrompt.prompt(); } }, AP.icon('download', 16), 'Instalar app') : null,
          h('button', { class: 'btn small', type: 'button', onclick: AP.Views.logout }, AP.icon('logout', 16), AP.Session.dispositivo ? 'Cerrar turno' : 'Salir'))));
    AP.porteriaShell('Control de Acceso', content);
    AP.onLeave(AP.Sync.on(U.debounce(function () {
      var t = document.querySelector('a.tile[href="#/dentro"] small');
      if (t) t.textContent = String(AP.Access.inside().length) + (AP.Session.can('admin') ? '' : ' · solo consulta');
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
    var scanner = AP.Scanner(video, canvas, function (text) {
      if (done || location.hash.indexOf('#/escanear') !== 0) return;
      var token = U.parseQR(text);
      done = true;
      scanner.stop();
      if (!token) {
        U.beep('deny');
        AP.State.result = { token: null, nivel: 'deny', etiqueta: 'CÓDIGO NO VÁLIDO', detalle: 'El código leído no es una credencial de Avo Pak.', origen: 'QR', invalido: true };
      } else {
        var r = AP.Access.evaluate(token);
        r.origen = 'QR';
        U.beep(r.nivel === 'ok' ? 'ok' : r.nivel === 'warn' ? 'warn' : 'deny');
        AP.State.result = r;
      }
      AP.State.fromScan = true;
      AP.go('/resultado');
    }, function () { /* errores de cuadro ignorados */ });

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
            var r = AP.Access.evaluate(t); r.origen = 'Código digitado';
            AP.State.result = r; AP.State.fromScan = true; AP.go('/resultado');
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
        if (!t) { AP.State.result = { token: null, nivel: 'deny', etiqueta: 'CÓDIGO NO VÁLIDO', detalle: 'El código leído no es una credencial de Avo Pak.', origen: 'Foto', invalido: true }; }
        else { var r = AP.Access.evaluate(t); r.origen = 'Foto del código'; U.beep(r.nivel === 'ok' ? 'ok' : r.nivel === 'warn' ? 'warn' : 'deny'); AP.State.result = r; }
        AP.State.fromScan = true; AP.go('/resultado');
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
        add('Visita a', [rec.Anfitrion, rec.Area].filter(Boolean).join(' · '));
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

    var placas = String(rec.Placa || '').split(/[,;/]/).map(function (x) { return x.trim(); }).filter(Boolean);
    var enVeh = AP.check('enVehiculo', 'Llega o sale en vehículo', !!(ult && ult.Placa && sentido === 'Salida'));
    var placaIn = AP.input('Placa', ult && ult.Placa && sentido === 'Salida' ? ult.Placa : (placas[0] || ''), { placeholder: 'Placa', autocapitalize: 'characters', maxlength: 10, list: 'placas-dl' });
    var dl = h('datalist', { id: 'placas-dl' }, placas.map(function (p) { return h('option', { value: p }); }));
    var vehTipo = AP.select('VehiculoTipo', AP.CAT.vehiculos, (ult && ult.VehiculoTipo) || rec.VehiculoTipo || '');
    var vehBox = h('div', { class: 'grid2' }, AP.field('Placa', placaIn), AP.field('Tipo de vehículo', vehTipo), dl);
    enVeh.querySelector('input').addEventListener('change', pintar);

    var autoriza = AP.check('AutorizacionConfirmada', 'El visitante autorizó el tratamiento de sus datos (aviso de privacidad)', false);
    var carne = AP.input('CarneEntregado', '', { placeholder: 'N.° de carné temporal entregado (si aplica)' });
    var custodia = AP.check('DocumentoCustodia', 'Documento de identidad dejado en custodia', false);
    var devuelto = AP.check('CarneDevuelto', 'Carné temporal devuelto', !!(ult && ult.CarneEntregado));
    var visIn = h('div', { class: 'stack sm' }, autoriza, h('p', { class: 'help' }, AP.TX.confirmacionVisitante), AP.field('Carné temporal', carne), custodia);
    var visOut = h('div', { class: 'stack sm' }, devuelto, ult && ult.DocumentoCustodia ? h('p', { class: 'note' }, 'Se dejó documento en custodia: devuélvalo al visitante.') : null);
    var obs = AP.textarea('Observaciones', '', { placeholder: 'Observaciones (opcional): elementos que ingresa, novedades…', rows: 2 });
    var acciones = h('div', { class: 'actions-sticky' });

    function pintar() {
      var s = sentidoCtl.dataset.value;
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
      } else if (r.nivel === 'ok') {
        AP.add(acciones, h('button', { class: 'btn big block go-in', type: 'button', onclick: function () { guardar('Ingreso', 'Permitido'); } }, AP.icon('check', 22), 'Registrar INGRESO'));
      } else if (r.registrable) {
        AP.add(acciones,
          h('button', { class: 'btn big block go-pend', type: 'button', onclick: function () { guardar('Ingreso', 'Permitido', { Novedad: r.novedad }); } }, AP.icon('clock', 22), 'Registrar ingreso PENDIENTE de verificación'),
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
          var quien = AP.input('AutorizadoPor', '', { placeholder: 'Nombre y cargo de quien autoriza' });
          var mot = AP.textarea('MotivoExcepcion', '', { placeholder: 'Motivo y forma de la autorización (llamada, correo, presencial)' });
          return h('div', { class: 'stack' }, h('p', { class: 'note' }, o.sent === 'Salida' ? AP.TX.salidaSinQR : AP.TX.excepcion), AP.field('Autorizado por', quien), AP.field('Motivo', mot),
            h('button', { class: 'btn primary block', type: 'button', onclick: function () {
              if (quien.value.trim().length < 4 || mot.value.trim().length < 6) return AP.toast('Indique quién autoriza y el motivo.', 'warn');
              close();
              guardar(o.sent || 'Ingreso', 'Permitido', { Excepcion: true, AutorizadoPor: quien.value.trim(), MotivoExcepcion: mot.value.trim(), Novedad: o.novedad });
            } }, o.boton || 'Registrar ingreso por excepción'));
        }
      });
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
      saving = true;
      try {
        var f = {
          Title: rec.Title || '(sin nombre)', Sentido: sent, Resultado: resultado,
          Categoria: r.categoria || (esVisita ? 'Visitante' : rec.Tipo), Origen: r.origen || 'QR',
          Token: r.token || undefined, RefLista: esVisita ? 'AP_Visitas' : esManual ? 'Manual' : 'AP_Personas', RefId: rec.id,
          TipoDoc: rec.TipoDoc, NumDoc: rec.NumDoc, Telefono: rec.Telefono, Empresa: rec.Empresa, Cargo: rec.Cargo,
          Anfitrion: rec.Anfitrion, AnfitrionCorreo: rec.AnfitrionCorreo, Area: rec.Area, Motivo: rec.Motivo,
          Placa: veh ? placa : undefined, VehiculoTipo: veh ? vehTipo.value : undefined,
          EstadoMostrado: r.etiqueta, Observaciones: obs.value.trim(),
          DatosAdicionales: rec.DatosAdicionales
        };
        if (resultado === 'Negado') f.MotivoNegacion = r.etiqueta + (r.detalle ? ': ' + r.detalle : '');
        var nov = (extra && extra.Novedad) || r.novedad;
        f.Novedad = [nov, r.novedadPrevia && sent === 'Ingreso' ? r.novedadPrevia : ''].filter(Boolean).join(' | ') || undefined;
        if (r.permisoId) f.PermisoId = String(r.permisoId);
        if (r.horarioInfo) f.HorarioInfo = r.horarioInfo;
        if (sent === 'Salida' && ult) f.EntradaId = ult.IdLocal;
        if (esVisitante && sent === 'Ingreso') {
          f.AutorizacionConfirmada = autoriza.querySelector('input').checked;
          f.CarneEntregado = carne.value.trim();
          f.DocumentoCustodia = custodia.querySelector('input').checked;
        }
        if ((esVisita || esManual) && sent === 'Salida') f.CarneDevuelto = devuelto.querySelector('input').checked;
        if (manualExtra && sent === 'Ingreso') Object.assign(f, manualExtra);
        Object.assign(f, extra || {});
        await registrar(f);
        await flash(resultado === 'Permitido', resultado === 'Negado' ? 'INGRESO NEGADO' : sent === 'Ingreso' ? 'INGRESO REGISTRADO' : 'SALIDA REGISTRADA', rec.Title);
        AP.State.result = null;
        if (location.hash.indexOf('#/resultado') === 0) AP.go(vuelta);
      } catch (e) {
        AP.toast('No se pudo guardar: ' + e.message, 'error');
      } finally { saving = false; }
    }

    var cont = h('div', { class: 'stack' }, banner, ficha, ultimo,
      r.invalido ? null : h('div', { class: 'card stack' }, h('h3', null, 'Registro'), sentidoCtl, enVeh, vehBox, visIn, visOut, obs),
      acciones);
    form.appendChild(cont);
    AP.porteriaShell('Verificación', form, { back: vuelta });
    pintar();
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
  AP.route('/manual', function (qs) {
    var cat = qs.cat || 'Visitante no anunciado';
    var box = h('div', { class: 'stack' });
    var catCtl = AP.select('Categoria', AP.CAT.categoriasManual, cat);
    catCtl.addEventListener('change', function () { AP.go('/manual?cat=' + encodeURIComponent(catCtl.value)); });
    var esAut = cat === 'Autoridad';
    var I = AP.input;
    var f = {
      Title: I('Title', '', { placeholder: esAut ? 'Servidor a cargo' : 'Nombres y apellidos', autocapitalize: 'words' }),
      TipoDoc: AP.select('TipoDoc', AP.CAT.tiposDoc, 'CC'),
      NumDoc: I('NumDoc', '', { inputmode: 'numeric', placeholder: 'Número' }),
      Telefono: I('Telefono', '', { inputmode: 'tel' }),
      Empresa: esAut ? AP.select('Empresa', [''].concat(AP.CAT.entidades), '') : I('Empresa', ''),
      Anfitrion: I('Anfitrion', '', { placeholder: 'Persona o área visitada' }),
      Motivo: AP.textarea('Motivo', '', { rows: 2 }),
      Placa: I('Placa', '', { autocapitalize: 'characters', maxlength: 10 }),
      VehiculoTipo: AP.select('VehiculoTipo', AP.CAT.vehiculos, ''),
      AutorizadoPor: I('AutorizadoPor', '', { placeholder: 'Quién autoriza el ingreso' })
    };
    var aut = {
      Unidad: I('Unidad', '', { placeholder: 'Unidad / seccional / dependencia' }),
      Grado: I('Grado', '', { placeholder: 'Grado o cargo' }),
      Credencial: I('Credencial', '', { placeholder: 'N.° de placa, credencial o T.P.' }),
      Servidores: I('Servidores', '1', { type: 'number', min: 1, inputmode: 'numeric' }),
      TipoVisita: AP.select('TipoVisita', [''].concat(AP.CAT.tiposVisitaAutoridad), ''),
      Orden: I('Orden', '', { placeholder: 'N.° de orden o acto, si se exhibe' })
    };
    // Si el documento corresponde a una persona registrada, se sugiere usar su ficha.
    var sugerencia = h('div');
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
    }, 250));

    var noAnunciado = cat === 'Visitante no anunciado';
    AP.add(box, 
      AP.field('Categoría', catCtl),
      esAut ? h('p', { class: 'note' }, AP.TX.autoridad) : null,
      noAnunciado ? h('p', { class: 'note' }, 'Ningún visitante ingresa sin prerregistro, salvo autorización expresa. Comuníquese con el anfitrión o con la Dirección de Seguridad Integral antes de permitir el ingreso.') : null,
      h('div', { class: 'card stack' },
        esAut ? AP.field('Entidad', f.Empresa) : null,
        esAut ? AP.field('Unidad', aut.Unidad) : null,
        AP.field(esAut ? 'Nombres y apellidos del servidor a cargo' : 'Nombres y apellidos', f.Title),
        esAut ? AP.field('Grado / cargo', aut.Grado) : null,
        h('div', { class: 'grid2' }, AP.field('Tipo doc.', f.TipoDoc), AP.field('Número de documento', f.NumDoc)),
        sugerencia,
        esAut ? h('div', { class: 'grid2' }, AP.field('Placa / credencial', aut.Credencial), AP.field('N.° de servidores', aut.Servidores)) : null,
        esAut ? AP.field('Tipo de visita', aut.TipoVisita) : null,
        esAut ? AP.field('Orden o acto que soporta la actuación', aut.Orden) : null,
        !esAut ? AP.field('Empresa / dependencia', f.Empresa) : null,
        !esAut ? AP.field('Teléfono', f.Telefono) : null,
        AP.field(esAut ? 'Área visitada / acompañante' : 'Anfitrión o área solicitante', f.Anfitrion),
        AP.field('Motivo', f.Motivo),
        h('div', { class: 'grid2' }, AP.field(esAut ? 'Vehículo(s) / placa(s)' : 'Placa', f.Placa), AP.field('Tipo de vehículo', f.VehiculoTipo)),
        noAnunciado || cat.indexOf('sin carné') > 0 ? AP.field('Autorizado por', f.AutorizadoPor, 'Obligatorio para visitantes no anunciados y personas sin carné.') : null),
      h('button', { class: 'btn big block go-in', type: 'button', onclick: continuar }, AP.icon('check', 22), 'Continuar al registro'));

    function continuar() {
      var d = {};
      Object.keys(f).forEach(function (k) { d[k] = f[k].value.trim(); });
      if (d.Title.length < 5) return AP.toast('Escriba el nombre completo.', 'warn');
      if (!esAut && d.NumDoc.length < 4) return AP.toast('Escriba el número de documento.', 'warn');
      if ((noAnunciado || cat.indexOf('sin carné') > 0) && d.AutorizadoPor.length < 4) return AP.toast('Indique quién autoriza el ingreso.', 'warn');
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
        tipo: 'manual', rec: rec, categoria: cat, origen: 'Manual', token: null,
        nivel: noAnunciado || cat.indexOf('sin carné') > 0 ? 'ok' : 'ok',
        etiqueta: esAut ? 'AUTORIDAD — INFORME AL DIRECTOR' : 'REGISTRO MANUAL',
        detalle: d.AutorizadoPor ? 'Autorizado por ' + d.AutorizadoPor : (esAut ? 'Diligenciar formato AP-SG-FT-002' : ''),
        ultimo: ult, sentido: ult && ult.Sentido === 'Ingreso' ? 'Salida' : 'Ingreso'
      };
      if (d.AutorizadoPor) { rec.AutorizadoPor = d.AutorizadoPor; }
      AP.State.manualExtra = d.AutorizadoPor ? { Excepcion: noAnunciado || cat.indexOf('sin carné') > 0, AutorizadoPor: d.AutorizadoPor, MotivoExcepcion: noAnunciado ? 'Visitante sin prerregistro' : cat } : null;
      AP.State.fromScan = false;
      AP.go('/resultado');
    }
    AP.porteriaShell(esAut ? 'Visita de autoridad' : 'Registro manual', box, { back: '/porteria' });
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
    var tv = t ? AP.Sync.vigilantes.find(function (x) { return String(x.id) === t.vigilanteId; }) : null;
    var cont = h('div', { class: 'stack' },
      t ? h('div', { class: 'card stack sm' },
        h('div', { class: 'row gap wrap between' },
          h('div', null, h('strong', null, t.nombre), h('small', { class: 'muted block' }, 'Usuario ' + t.usuario + ' · ' + t.rol + ' · turno desde ' + U.fDateTime(t.inicio) + ' (' + U.duracion(t.inicio) + ')')),
          (function (n) { return AP.pill(n + (n === 1 ? ' registro' : ' registros') + ' en el turno', 'brand'); })(AP.Pin.resumenTurno(t).registros)),
        h('div', { class: 'row gap wrap' },
          tv ? h('button', { class: 'btn', type: 'button', onclick: function () { AP.Views.definirPin(tv, { temporal: false }); } }, AP.icon('lock', 18), 'Cambiar mi PIN') : null,
          h('button', { class: 'btn primary', type: 'button', onclick: AP.Views.cerrarTurno }, AP.icon('logout', 18), 'Cerrar turno'))) : null,
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
