/* Consola: visitas, historial, inspecciones, usuarios, bitácora, instalación y carga masiva */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function guard(perm) { if (!AP.Session.can(perm || 'consola')) { AP.go('/porteria'); return false; } return true; }
  function errBox(e) {
    if (e && e.missingList) return AP.empty('settings', 'Falta crear la estructura en SharePoint', e.message, AP.Session.can('admin') ? h('a', { class: 'btn primary', href: '#/consola/instalacion' }, 'Ir a instalación') : null);
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con Microsoft 365' : 'No fue posible cargar la información', e && e.message);
  }
  function simpleTable(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a')) onRow(r); } : null }, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0] }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }

  // =================== VISITAS ===================
  AP.route('/consola/visitas', function (qs) {
    if (!guard()) return;
    var tab = qs.t || 'pendientes';
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/visitas', 'Visitas', content,
      h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nueva visita'));
    var visitas = [];
    async function cargar() {
      content.replaceChildren(AP.spinner('Consultando…'));
      try {
        visitas = await AP.B.listRange('AP_Visitas', 'FechaFin', U.addDays(new Date(), tab === 'historial' ? -60 : -1), null, { exclude: ['Foto'] });
        pintar();
      } catch (e) { content.replaceChildren(errBox(e)); }
    }
    function pintar() {
      var hoy = U.ymd(), ahora = new Date();
      var grupos = {
        pendientes: visitas.filter(function (v) { return v.Estado === 'Pendiente' && new Date(v.FechaFin) >= ahora; }),
        hoy: visitas.filter(function (v) { return U.ymd(v.FechaInicio) <= hoy && U.ymd(v.FechaFin) >= hoy && v.Estado !== 'Cancelada'; }),
        proximas: visitas.filter(function (v) { return U.ymd(v.FechaInicio) > hoy && v.Estado !== 'Cancelada'; }),
        historial: visitas.slice()
      };
      var lista = (grupos[tab] || []).sort(function (a, b) { return a.FechaInicio < b.FechaInicio ? (tab === 'historial' ? 1 : -1) : (tab === 'historial' ? -1 : 1); });
      var tabs = h('div', { class: 'tabs' }, [['pendientes', 'Por aprobar'], ['hoy', 'Hoy'], ['proximas', 'Próximas'], ['historial', 'Últimos 60 días']].map(function (t) {
        return h('a', { class: t[0] === tab ? 'on' : '', href: '#/consola/visitas?t=' + t[0] }, t[1] + (t[0] !== 'historial' ? ' (' + grupos[t[0]].length + ')' : ''));
      }));
      content.replaceChildren(tabs, simpleTable([
        ['Visitante', function (v) { return h('div', null, h('strong', null, v.Title), h('small', { class: 'block muted' }, (v.TipoDoc || '') + ' ' + (v.NumDoc || '') + (v.Empresa ? ' · ' + v.Empresa : ''))); }],
        ['Fecha y hora', function (v) { return U.fDateTime(v.FechaInicio) + ' – ' + U.fTime(v.FechaFin); }],
        ['Anfitrión', function (v) { return [v.Anfitrion, v.Area].filter(Boolean).join(' · '); }],
        ['Motivo', function (v) { return v.Motivo; }],
        ['Placa', function (v) { return v.Placa; }],
        ['Estado', function (v) { return AP.estadoPill(v.Estado); }],
        ['', function (v) {
          return h('div', { class: 'row gap nowrap' },
            v.Estado === 'Pendiente' ? h('button', { class: 'btn small primary', type: 'button', onclick: function () { aprobar(v, true); } }, AP.icon('check', 16), 'Aprobar') : null,
            v.Estado === 'Pendiente' ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { aprobar(v, false); } }, 'Rechazar') : null,
            v.Estado === 'Aprobada' ? h('button', { class: 'btn small', type: 'button', onclick: function () { pase(v); } }, AP.icon('qr', 16), 'Pase') : null,
            h('button', { class: 'btn small', type: 'button', title: 'Editar', onclick: function () { editar(v); } }, AP.icon('edit', 16)));
        }]
      ], lista, editar));
    }
    cargar();

    async function aprobar(v, si) {
      var motivo = '';
      if (!si) {
        motivo = await new Promise(function (res) {
          AP.modal({ title: 'Rechazar visita de ' + v.Title, body: function (close) {
            var t = AP.textarea('m', '', { placeholder: 'Motivo del rechazo' });
            return h('div', { class: 'stack' }, t, h('button', { class: 'btn danger', type: 'button', onclick: function () { if (t.value.trim().length < 4) return AP.toast('Indique el motivo.', 'warn'); res(t.value.trim()); close(); } }, 'Rechazar'));
          }, onClose: function () { res(null); } });
        });
        if (!motivo) return;
      }
      try {
        var cambios = { Estado: si ? 'Aprobada' : 'Rechazada', AprobadoPor: AP.Session.user.upn, FechaAprobacion: new Date().toISOString() };
        if (motivo) cambios.Observaciones = ((v.Observaciones ? v.Observaciones + '\n' : '') + 'Rechazo: ' + motivo);
        await AP.B.update('AP_Visitas', v.id, cambios);
        Object.assign(v, cambios);
        await AP.Audit.log(si ? 'Aprobación de visita' : 'Rechazo de visita', v.Title + ' — ' + U.fDateTime(v.FechaInicio), motivo);
        AP.toast(si ? 'Visita aprobada.' : 'Visita rechazada.');
        AP.Sync.run();
        if (si && v.Correo) pase(v); else pintar();
      } catch (e) { AP.toast(e.message, 'error'); }
    }

    function pase(v) {
      AP.modal({
        title: 'Pase de ' + v.Title,
        body: function (close) {
          var img = h('img', { class: 'pase-img', alt: 'Pase de visitante' });
          var blobP = AP.paseCanvas({ titulo: 'Pase de visitante', nombre: v.Title, linea2: U.fLong(v.FechaInicio) + ' a ' + U.fTime(v.FechaFin), linea3: 'Visita a: ' + [v.Anfitrion, v.Area].filter(Boolean).join(' · '), linea4: AP.CFG.sede, token: v.Token, pie: 'Presente este código y su documento de identidad' })
            .then(function (c) { img.src = c.toDataURL('image/png'); return new Promise(function (r) { c.toBlob(r, 'image/png'); }); });
          var correo = AP.input('correo', v.Correo || '', { type: 'email', placeholder: 'correo@visitante.com' });
          return h('div', { class: 'stack center' }, img,
            AP.field('Correo del visitante', correo),
            h('div', { class: 'row gap wrap center' },
              h('button', { class: 'btn primary', type: 'button', onclick: async function () {
                var to = correo.value.trim();
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return AP.toast('Escriba un correo válido.', 'warn');
                try {
                  await enviarPase(v, to, await blobP);
                  AP.toast('Pase enviado a ' + to);
                  close(); pintar();
                } catch (e) { AP.toast('No se pudo enviar: ' + e.message, 'error', 8000); }
              } }, AP.icon('mail', 18), 'Enviar por correo'),
              h('button', { class: 'btn', type: 'button', onclick: async function () { U.download(await blobP, 'Pase_' + U.safeName(v.Title) + '.png'); } }, AP.icon('download', 18), 'Descargar'),
              navigator.canShare ? h('button', { class: 'btn', type: 'button', onclick: async function () {
                var file = new File([await blobP], 'Pase_' + U.safeName(v.Title) + '.png', { type: 'image/png' });
                if (navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: 'Pase de visitante', text: 'Pase de visitante — ' + AP.CFG.empresa }).catch(function () {});
                else AP.toast('Este navegador no permite compartir imágenes.', 'warn');
              } }, AP.icon('share', 18), 'Compartir (WhatsApp)') : null,
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); AP.imprimirCarnes([v], 'visita'); } }, AP.icon('print', 18), 'Imprimir')),
            h('p', { class: 'muted small' }, 'El pase contiene solo un código aleatorio; deja de funcionar si la visita se cancela o vence.'));
        }
      });
    }

    async function enviarPase(v, to, blob) {
      var b64 = await U.blobToBase64(blob);
      var e = AP.esc;
      var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">' +
        '<p>Señor(a) ' + e(v.Title) + ':</p>' +
        '<p>La Dirección de Seguridad Integral de ' + e(AP.CFG.empresa) + ' confirma la autorización de su visita:</p>' +
        '<table style="border-collapse:collapse;font-size:14px">' +
        '<tr><td style="padding:2px 12px 2px 0;color:#666">Fecha y hora</td><td><b>' + e(U.fLong(v.FechaInicio)) + ' a ' + e(U.fTime(v.FechaFin)) + '</b></td></tr>' +
        '<tr><td style="padding:2px 12px 2px 0;color:#666">Visita a</td><td>' + e([v.Anfitrion, v.Area].filter(Boolean).join(' — ')) + '</td></tr>' +
        '<tr><td style="padding:2px 12px 2px 0;color:#666">Lugar</td><td>' + e(AP.CFG.sede) + '</td></tr></table>' +
        '<p>Presente en la portería el código QR adjunto (en su celular o impreso) junto con su documento de identidad original. ' +
        'Durante su permanencia deberá estar acompañado por su anfitrión y atender las instrucciones del personal de seguridad.</p>' +
        '<p><img src="cid:pase" alt="Pase de visitante" width="320"></p>' +
        '<p style="font-size:11px;color:#666;border-top:1px solid #ddd;padding-top:8px"><b>Aviso de privacidad.</b> ' + e(AP.TX.avisoPrivacidad(AP.CFG)) + '</p></div>';
      await AP.B.sendMail({ to: [to], cc: v.AnfitrionCorreo ? [v.AnfitrionCorreo] : [], subject: 'Autorización de visita — ' + AP.CFG.empresa + ' — ' + U.fDate(v.FechaInicio), html: html, attachments: [{ name: 'pase-visitante.png', type: 'image/png', base64: b64, cid: 'pase' }] });
      var upd = { QREnviado: new Date().toISOString() };
      if (to !== v.Correo) upd.Correo = to;
      await AP.B.update('AP_Visitas', v.id, upd);
      Object.assign(v, upd);
      await AP.Audit.log('Envío de pase', v.Title, 'Correo: ' + to);
    }

    function editar(v) {
      var nuevo = !v;
      var d0 = v || { TipoDoc: 'CC', Categoria: 'Visitante', Estado: 'Aprobada' };
      var ini = v ? new Date(v.FechaInicio) : U.fromLocal(U.ymd(U.addDays(new Date(), 1)), '08:00');
      var fin = v ? new Date(v.FechaFin) : U.fromLocal(U.ymd(ini), '17:00');
      AP.modal({
        title: nuevo ? 'Prerregistro de visita' : 'Visita de ' + v.Title, size: 'wide',
        body: function (close) {
          var I = AP.input;
          var iniIn = I('ini', U.toLocalInput(ini), { type: 'datetime-local' }), finIn = I('fin', U.toLocalInput(fin), { type: 'datetime-local' });
          var resumenEl = h('p', { class: 'note' });
          function resumen() {
            var a = U.fromLocalInput(iniIn.value), b = U.fromLocalInput(finIn.value);
            resumenEl.textContent = a && b && b > a ? 'El QR de este visitante solo servirá para ingresar entre el ' + U.fDateTime(a) + ' y el ' + U.fDateTime(b) + ' (' + U.duracion(a, b) + ').' : 'Revise las horas de vigencia del QR.';
          }
          iniIn.addEventListener('change', resumen); finIn.addEventListener('change', resumen); resumen();
          var form = h('div', { class: 'form-grid' },
            AP.field('Nombres y apellidos *', I('Title', d0.Title)),
            AP.field('Empresa / entidad', I('Empresa', d0.Empresa)),
            AP.field('Tipo de documento', AP.select('TipoDoc', AP.CAT.tiposDoc, d0.TipoDoc)),
            AP.field('Número de documento *', I('NumDoc', d0.NumDoc)),
            AP.field('Teléfono', I('Telefono', d0.Telefono, { inputmode: 'tel' })),
            AP.field('Correo del visitante', I('Correo', d0.Correo, { type: 'email' }), 'Para enviarle el pase con el código QR.'),
            AP.field('Anfitrión *', I('Anfitrion', d0.Anfitrion)),
            AP.field('Correo del anfitrión', I('AnfitrionCorreo', d0.AnfitrionCorreo, { type: 'email' }), 'Recibe copia del pase.'),
            AP.field('Área', I('Area', d0.Area)),
            AP.field('El QR vale desde *', iniIn, 'Antes de esta hora exacta el QR no abre el ingreso.'),
            AP.field('El QR vale hasta *', finIn, 'Después de esta hora exacta el QR queda vencido para ingresar (la salida siempre se registra).'),
            h('div', { class: 'span2 stack sm' }, h('div', { class: 'presets' }, [['1 hora', 60], ['2 horas', 120], ['4 horas', 240], ['Hasta las 18:00', 'dia']].map(function (pr) {
              return h('button', { class: 'btn small', type: 'button', onclick: function () {
                var a = U.fromLocalInput(iniIn.value); if (!a) return AP.toast('Indique primero la hora de inicio.', 'warn');
                var b = pr[1] === 'dia' ? U.fromLocal(U.ymd(a), '18:00') : new Date(a.getTime() + pr[1] * 60000);
                if (b <= a) return AP.toast('La hora de inicio es posterior a las 18:00.', 'warn');
                finIn.value = U.toLocalInput(b); resumen();
              } }, pr[0]);
            })), resumenEl),
            AP.field('Estado', AP.select('Estado', AP.CAT.estadosVisita, d0.Estado)),
            AP.field('Placa del vehículo', I('Placa', d0.Placa, { autocapitalize: 'characters' })),
            AP.field('Tipo de vehículo', AP.select('VehiculoTipo', AP.CAT.vehiculos, d0.VehiculoTipo)),
            AP.field('Motivo de la visita *', AP.textarea('Motivo', d0.Motivo), null, 'span2'),
            AP.field('Observaciones de seguridad', AP.textarea('Observaciones', d0.Observaciones), 'Por ejemplo: áreas restringidas autorizadas, elementos que ingresa.', 'span2'));
          var guardar = async function (enviar) {
            var d = AP.formData(form);
            var a = U.fromLocalInput(d.ini), b = U.fromLocalInput(d.fin);
            delete d.ini; delete d.fin;
            if (d.Title.length < 5 || !d.NumDoc || !d.Anfitrion || !d.Motivo) return AP.toast('Complete los campos obligatorios (*).', 'warn');
            if (!a || !b || b <= a) return AP.toast('Revise la fecha y hora de la visita.', 'warn');
            d.FechaInicio = a.toISOString(); d.FechaFin = b.toISOString();
            d.Placa = U.normPlaca(d.Placa);
            try {
              var rec;
              if (nuevo) {
                d.Token = U.newToken(); d.Categoria = 'Visitante'; d.SolicitadoPor = AP.Session.user.upn;
                if (d.Estado === 'Aprobada') { d.AprobadoPor = AP.Session.user.upn; d.FechaAprobacion = new Date().toISOString(); }
                rec = await AP.B.create('AP_Visitas', d);
                visitas.push(rec);
                await AP.Audit.log('Prerregistro de visita', d.Title + ' — ' + U.fDateTime(d.FechaInicio), 'Estado: ' + d.Estado + '; anfitrión: ' + d.Anfitrion);
              } else {
                if (d.Estado === 'Aprobada' && v.Estado !== 'Aprobada') { d.AprobadoPor = AP.Session.user.upn; d.FechaAprobacion = new Date().toISOString(); }
                await AP.B.update('AP_Visitas', v.id, d);
                Object.assign(v, d); rec = v;
                await AP.Audit.log('Modificación de visita', d.Title, 'Estado: ' + d.Estado);
              }
              close(); AP.toast('Visita guardada.');
              AP.Sync.run();
              if (enviar && rec.Estado === 'Aprobada') pase(rec); else pintar();
            } catch (e) { AP.toast(e.message, 'error'); }
          };
          return h('div', { class: 'stack' }, form,
            h('p', { class: 'help' }, 'Vigencia estricta: el QR del visitante funciona únicamente entre las horas que usted programe; el vigilante no puede levantarla por excepción. Conforme al procedimiento AP-SG-PD-002, el prerregistro debe hacerse con al menos 24 horas de antelación y queda sujeto a la validación de la Dirección de Seguridad Integral.'),
            h('div', { class: 'row gap wrap end' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn', type: 'button', onclick: function () { guardar(false); } }, AP.icon('check', 18), 'Guardar'),
              h('button', { class: 'btn primary', type: 'button', onclick: function () { guardar(true); } }, AP.icon('qr', 18), 'Guardar y generar pase')));
        }
      });
    }
  });

  // =================== HISTORIAL ===================
  var COLS_MOV = [
    ['Fecha', function (m) { return U.fDate(m.FechaHora); }, 11], ['Hora', function (m) { return U.fTime(m.FechaHora); }, 7],
    ['Movimiento', function (m) { return m.Resultado === 'Negado' ? 'Ingreso negado' : m.Sentido; }, 14], ['Nombres y apellidos', function (m) { return m.Title; }, 32],
    ['Tipo doc.', function (m) { return m.TipoDoc; }, 8], ['N.° documento', function (m) { return m.NumDoc; }, 15], ['Teléfono', function (m) { return m.Telefono; }, 13],
    ['Categoría', function (m) { return m.Categoria; }, 20], ['Empresa / dependencia', function (m) { return m.Empresa; }, 26],
    ['Motivo', function (m) { return m.Motivo; }, 26], ['Anfitrión / área', function (m) { return [m.Anfitrion, m.Area].filter(Boolean).join(' · '); }, 24],
    ['Vehículo', function (m) { return m.VehiculoTipo; }, 12], ['Placa', function (m) { return m.Placa; }, 10],
    ['Carné entregado', function (m) { return m.CarneEntregado; }, 10], ['Autorización confirmada', function (m) { return U.yesNo(m.AutorizacionConfirmada); }, 12],
    ['Documento en custodia', function (m) { return U.yesNo(m.DocumentoCustodia); }, 11], ['Carné devuelto', function (m) { return U.yesNo(m.CarneDevuelto); }, 10],
    ['Estado mostrado', function (m) { return m.EstadoMostrado; }, 20], ['Novedad', function (m) { return m.Novedad; }, 30], ['Turno programado', function (m) { return m.HorarioInfo; }, 24], ['Excepción', function (m) { return U.yesNo(m.Excepcion); }, 9],
    ['Autorizado por', function (m) { return m.AutorizadoPor; }, 22], ['Motivo excepción / negación', function (m) { return m.MotivoExcepcion || m.MotivoNegacion; }, 30],
    ['Origen', function (m) { return m.Origen; }, 14], ['Vigilante', function (m) { return m.Vigilante; }, 22], ['Usuario vigilante', function (m) { return m.VigilanteUsuario; }, 14],
    ['Cuenta Microsoft 365', function (m) { return m.VigilanteCorreo; }, 26], ['Dispositivo', function (m) { return m.Dispositivo; }, 12],
    ['Sin conexión', function (m) { return U.yesNo(m.SinConexion); }, 9], ['Observaciones', function (m) { return m.Observaciones; }, 30],
    ['Fecha de recepción en servidor', function (m) { return m._created ? U.fDateTime(m._created) : ''; }, 18], ['Id. registro', function (m) { return m.IdLocal; }, 38],
    ['Huella SHA-256', function (m) { return m.Hash; }, 66]
  ];
  AP.COLS_MOV = COLS_MOV;

  AP.route('/consola/historial', function () {
    if (!AP.Session.can('consola') && !AP.Session.can('historial')) { AP.go('/porteria'); return; }
    var content = h('div', { class: 'stack' });
    var desde = AP.input('desde', U.ymd(U.addDays(new Date(), -7)), { type: 'date' });
    var hasta = AP.input('hasta', U.ymd(), { type: 'date' });
    var cat = AP.select('cat', [['', 'Todas las categorías']].concat(AP.CAT.tiposPersona, ['Visitante'], AP.CAT.categoriasManual.filter(function (c) { return AP.CAT.tiposPersona.indexOf(c) < 0; })), '');
    var mov = AP.select('mov', [['', 'Todos los movimientos'], 'Ingreso', 'Salida', ['Negado', 'Ingresos negados'], ['Excepcion', 'Excepciones'], ['Offline', 'Registrados sin conexión']], '');
    var txt = AP.input('txt', '', { type: 'search', placeholder: 'Nombre, documento, placa o empresa' });
    var out = h('div');
    var datos = [];
    function filtrar() {
      var t = U.fold(txt.value), d = U.normDoc(txt.value);
      return datos.filter(function (m) {
        if (cat.value && m.Categoria !== cat.value) return false;
        if (mov.value === 'Ingreso' && !(m.Sentido === 'Ingreso' && m.Resultado === 'Permitido')) return false;
        if (mov.value === 'Salida' && m.Sentido !== 'Salida') return false;
        if (mov.value === 'Negado' && m.Resultado !== 'Negado') return false;
        if (mov.value === 'Excepcion' && !m.Excepcion) return false;
        if (mov.value === 'Offline' && !m.SinConexion) return false;
        if (!t) return true;
        return U.fold([m.Title, m.Empresa, m.Placa, m.Anfitrion, m.Vigilante, m.VigilanteUsuario].join(' ')).indexOf(t) >= 0 || (d.length >= 3 && (U.normDoc(m.NumDoc).indexOf(d) >= 0 || U.normPlaca(m.Placa).indexOf(d) >= 0));
      }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
    }
    var tblBox = h('div');
    function pintar() {
      var rows = filtrar();
      var ing = rows.filter(function (m) { return m.Sentido === 'Ingreso' && m.Resultado === 'Permitido'; }).length;
      var sal = rows.filter(function (m) { return m.Sentido === 'Salida'; }).length;
      var neg = rows.filter(function (m) { return m.Resultado === 'Negado'; }).length;
      tblBox.replaceChildren(
        h('div', { class: 'row gap wrap between' },
          h('div', { class: 'row gap wrap' }, AP.pill(rows.length + ' registros', 'brand'), AP.pill(ing + ' ingresos', 'ok'), AP.pill(sal + ' salidas', 'muted'), neg ? AP.pill(neg + ' negados', 'deny') : null),
          h('div', { class: 'row gap' },
            h('button', { class: 'btn', type: 'button', disabled: !rows.length, onclick: function () { exp('xlsx', rows); } }, AP.icon('download', 18), 'Excel'),
            h('button', { class: 'btn', type: 'button', disabled: !rows.length, onclick: function () { exp('csv', rows); } }, AP.icon('download', 18), 'CSV'))),
        simpleTableMov(rows));
    }
    function simpleTableMov(rows) {
      var lim = rows.slice(0, 300);
      return h('div', { class: 'stack sm' }, simpleTable([
        ['Fecha y hora', function (m) { return U.fDateTime(m.FechaHora); }],
        ['Movimiento', function (m) { return m.Resultado === 'Negado' ? AP.pill('Negado', 'deny') : AP.pill(m.Sentido, m.Sentido === 'Ingreso' ? 'ok' : 'muted'); }],
        ['Nombre', function (m) { return h('div', null, h('strong', null, m.Title), h('small', { class: 'block muted' }, (m.TipoDoc || '') + ' ' + (m.NumDoc || ''))); }],
        ['Categoría', function (m) { return m.Categoria; }],
        ['Empresa / anfitrión', function (m) { return [m.Empresa, m.Anfitrion].filter(Boolean).join(' · '); }],
        ['Placa', function (m) { return m.Placa; }],
        ['Vigilante', function (m) { return m.Vigilante; }],
        ['', function (m) { return [m.Excepcion ? AP.pill('Excepción', 'warn') : null, m.SinConexion ? AP.pill('Sin conexión', 'muted') : null]; }]
      ], lim, detalle), rows.length > 300 ? h('p', { class: 'muted small' }, 'Se muestran 300 de ' + rows.length + '. La exportación incluye todos.') : null);
    }
    function detalle(m) {
      AP.modal({
        title: (m.Resultado === 'Negado' ? 'Ingreso negado' : m.Sentido) + ' — ' + m.Title, size: 'wide',
        body: h('div', { class: 'kv-grid' }, COLS_MOV.map(function (c) { var v = c[1](m); return v ? h('div', { class: 'kv' }, h('span', null, c[0]), h('strong', { class: c[0].indexOf('SHA') >= 0 || c[0].indexOf('Id.') >= 0 ? 'mono' : '' }, String(v))) : null; }),
          m.DatosAdicionales ? h('div', { class: 'kv' }, h('span', null, 'Datos adicionales'), h('strong', null, m.DatosAdicionales)) : null)
      });
    }
    async function consultar() {
      var a = U.fromLocal(desde.value, '00:00'), b = U.fromLocal(hasta.value, '23:59');
      if (!a || !b || b < a) return AP.toast('Revise el rango de fechas.', 'warn');
      if ((b - a) / 86400000 > 400) return AP.toast('Consulte máximo 400 días por vez.', 'warn');
      tblBox.replaceChildren(AP.spinner('Consultando historial…'));
      try {
        datos = await AP.B.listRange('AP_Movimientos', 'FechaHora', a, new Date(b.getTime() + 59999));
        pintar();
      } catch (e) { tblBox.replaceChildren(errBox(e)); }
    }
    function exp(fmt, rows) {
      AP.exportar('Historial_ingresos_salidas', COLS_MOV, rows, fmt, [
        ['Documento', 'Historial de ingresos y salidas — ' + AP.CFG.porteria],
        ['Periodo', desde.value + ' a ' + hasta.value], ['Filtros', [cat.value, mov.value, txt.value].filter(Boolean).join(' · ') || 'ninguno'],
        ['Generado por', AP.Session.user.nombre + ' (' + AP.Session.user.upn + ')'], ['Fecha de generación', U.fDateTime(new Date())],
        ['Registros', rows.length], ['Fuente', AP.CFG.modo === 'demo' ? 'Datos de demostración' : 'SharePoint — lista AP_Movimientos']
      ]);
    }
    [cat, mov].forEach(function (s) { s.addEventListener('change', pintar); });
    txt.addEventListener('input', U.debounce(pintar, 200));
    AP.add(content, h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta), cat, mov, txt,
      h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar')), tblBox);
    if (AP.Session.can('consola')) AP.consolaShell('/consola/historial', 'Historial de ingresos y salidas', content);
    else AP.porteriaShell('Historial', content, { back: '/porteria' });
    consultar();
  });

  // =================== INSPECCIONES ===================
  AP.route('/consola/inspecciones', function () {
    if (!guard()) return;
    var content = h('div', { class: 'stack' });
    var desde = AP.input('desde', U.ymd(U.addDays(new Date(), -30)), { type: 'date' });
    var hasta = AP.input('hasta', U.ymd(), { type: 'date' });
    var txt = AP.input('txt', '', { type: 'search', placeholder: 'Placa, contenedor, precinto o conductor' });
    var box = h('div');
    var datos = [];
    AP.consolaShell('/consola/inspecciones', 'Inspecciones de carga', content);
    function filtrar() {
      var t = U.fold(txt.value);
      return datos.filter(function (i) { return !t || U.fold([i.Placa, i.Remolque, i.Contenedor, i.Precintos, i.Conductor, i.Transportadora].join(' ')).indexOf(t) >= 0; })
        .sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
    }
    var COLS = [
      ['Fecha', function (i) { return U.fDateTime(i.FechaHora); }, 16], ['Operación', function (i) { return i.Operacion; }, 24], ['Placa', function (i) { return i.Placa; }, 10],
      ['Remolque', function (i) { return i.Remolque; }, 10], ['Contenedor', function (i) { return i.Contenedor; }, 14], ['Transportadora', function (i) { return i.Transportadora; }, 24],
      ['Conductor', function (i) { return i.Conductor; }, 26], ['Doc. conductor', function (i) { return i.DocConductor; }, 14], ['Precintos', function (i) { return i.Precintos; }, 22],
      ['Resultado', function (i) { return i.Resultado; }, 12], ['No conformidades', function (i) { return i.NoConformidades; }, 40], ['Testigo', function (i) { return i.Testigo; }, 22],
      ['Vigilante', function (i) { return i.Vigilante; }, 22], ['Fotos', function (i) { return fotosDe(i).length; }, 6], ['Sin conexión', function (i) { return U.yesNo(i.SinConexion); }, 9],
      ['Observaciones', function (i) { return i.Observaciones; }, 30], ['Id. registro', function (i) { return i.IdLocal; }, 38], ['Huella SHA-256', function (i) { return i.Hash; }, 66]
    ];
    function fotosDe(i) { try { return JSON.parse(i.Fotos || '[]'); } catch (e) { return []; } }
    function pintar() {
      var rows = filtrar();
      box.replaceChildren(h('div', { class: 'row gap wrap between' },
        h('div', { class: 'row gap' }, AP.pill(rows.length + ' inspecciones', 'brand'), AP.pill(rows.filter(function (i) { return i.Resultado === 'No conforme'; }).length + ' no conformes', 'deny')),
        h('button', { class: 'btn', type: 'button', disabled: !rows.length, onclick: function () {
          AP.exportar('Inspecciones_carga', COLS, rows, 'xlsx', [['Periodo', desde.value + ' a ' + hasta.value], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        } }, AP.icon('download', 18), 'Exportar')),
        simpleTable([
          ['Fecha', function (i) { return U.fDateTime(i.FechaHora); }], ['Operación', function (i) { return i.Operacion; }],
          ['Vehículo', function (i) { return h('div', null, h('strong', null, i.Placa), h('small', { class: 'block muted' }, [i.Remolque, i.Contenedor].filter(Boolean).join(' · '))); }],
          ['Conductor', function (i) { return h('div', null, i.Conductor || '', h('small', { class: 'block muted' }, i.Transportadora || '')); }],
          ['Precintos', function (i) { return i.Precintos; }], ['Resultado', function (i) { return AP.estadoPill(i.Resultado); }],
          ['Fotos', function (i) { return String(fotosDe(i).length); }]
        ], rows, detalle));
    }
    function detalle(i) {
      var chk = []; try { chk = JSON.parse(i.Checklist || '[]'); } catch (e) { /* */ }
      var pv = []; try { pv = JSON.parse(i.PrecintosVerificacion || '[]'); } catch (e) { /* */ }
      var gal = h('div', { class: 'gallery' });
      fotosDe(i).forEach(function (f) {
        var fig = h('figure', null, h('div', { class: 'ph' }), h('figcaption', null, f.etiqueta || f.nombre));
        gal.appendChild(fig);
        AP.B.fileUrl(f.ruta).then(function (u) {
          if (!u) return;
          var a = h('a', { href: f.url && f.url.indexOf('demo://') !== 0 ? f.url : u, target: '_blank', rel: 'noopener' }, h('img', { src: u, alt: f.etiqueta || '' }));
          fig.replaceChild(a, fig.firstChild);
        }).catch(function () { fig.firstChild.textContent = 'No disponible'; });
      });
      AP.modal({
        title: i.Operacion + ' — ' + i.Placa, size: 'wide',
        body: h('div', { class: 'stack' },
          h('div', { class: 'kv-grid' }, COLS.filter(function (c) { return ['No conformidades', 'Fotos'].indexOf(c[0]) < 0; }).map(function (c) { var v = c[1](i); return v ? h('div', { class: 'kv' }, h('span', null, c[0]), h('strong', { class: /SHA|Id\./.test(c[0]) ? 'mono' : '' }, String(v))) : null; })),
          i.NoConformidades ? h('div', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, i.NoConformidades)) : null,
          h('h3', null, 'Puntos inspeccionados'),
          h('div', { class: 'chk-view' }, chk.map(function (c) { return h('div', { class: 'chk-v ' + (c.estado === 'NC' ? 'deny' : '') }, h('span', null, c.punto), h('strong', null, c.estado === 'C' ? 'Conforme' : c.estado === 'NC' ? 'No conforme' + (c.nota ? ': ' + c.nota : '') : 'N/A')); })),
          pv.length ? h('h3', null, 'Precintos — verificación VVTT') : null,
          pv.map(function (p) { return h('div', { class: 'kv' }, h('span', null, p.numero), h('strong', null, ['ver', 'verificar', 'halar', 'girar'].map(function (k) { return (p[k] ? '✓ ' : '✗ ') + k; }).join('  '))); }),
          h('h3', null, 'Fotografías'), gal,
          h('p', { class: 'muted small' }, 'Cada fotografía conserva su huella SHA-256 en el registro de la inspección.'))
      });
    }
    async function consultar() {
      var a = U.fromLocal(desde.value, '00:00'), b = U.fromLocal(hasta.value, '23:59');
      box.replaceChildren(AP.spinner('Consultando…'));
      try { datos = await AP.B.listRange('AP_Inspecciones', 'FechaHora', a, new Date(b.getTime() + 59999)); pintar(); }
      catch (e) { box.replaceChildren(errBox(e)); }
    }
    txt.addEventListener('input', U.debounce(pintar, 200));
    AP.add(content, h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta), txt,
      h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar')), box);
    consultar();
  });

  // =================== USUARIOS ===================
  AP.route('/consola/usuarios', function () {
    if (!guard('admin')) return;
    var content = h('div', { class: 'stack' });
    var usuarios = [];
    AP.consolaShell('/consola/usuarios', 'Usuarios y roles', content,
      h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Agregar usuario'));
    async function cargar() {
      content.replaceChildren(AP.spinner());
      try { usuarios = await AP.B.listAll('AP_Usuarios'); pintar(); } catch (e) { content.replaceChildren(errBox(e)); }
    }
    function pintar() {
      content.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null,
          'Aquí se registran las cuentas de Microsoft 365 que usan la aplicación. Los vigilantes que operan con usuario y PIN se gestionan en "Vigilantes"; ' +
          'el celular de portería se registra aquí con su cuenta de servicio y el rol "Dispositivo de portería". ' +
          'El rol define qué pantallas ve cada cuenta; los permisos efectivos sobre los datos los define el sitio de SharePoint (ver Instalación).')),
        h('div', { class: 'kv-grid roles' },
          h('div', { class: 'kv' }, h('span', null, 'Administrador'), h('strong', null, 'Consola completa, usuarios, instalación y portería')),
          h('div', { class: 'kv' }, h('span', null, 'Analista'), h('strong', null, 'Consola (personas, visitas, historial, inspecciones) y portería')),
          h('div', { class: 'kv' }, h('span', null, 'Supervisor'), h('strong', null, 'Portería e historial de ingresos y salidas')),
          h('div', { class: 'kv' }, h('span', null, 'Vigilante'), h('strong', null, 'Solo portería')),
          h('div', { class: 'kv' }, h('span', null, 'Dispositivo de portería'), h('strong', null, 'Cuenta de servicio del celular; exige usuario y PIN de un vigilante para operar'))),
        simpleTable([
          ['Usuario (correo)', function (u) { return u.Title; }], ['Nombre', function (u) { return u.Nombre; }], ['Rol', function (u) { return u.Rol; }],
          ['Empresa', function (u) { return u.Empresa; }], ['Activo', function (u) { return u.Activo === false ? AP.pill('Inactivo', 'deny') : AP.pill('Activo', 'ok'); }],
          ['', function (u) { return h('button', { class: 'btn small', type: 'button', onclick: function () { editar(u); } }, AP.icon('edit', 16), 'Editar'); }]
        ], usuarios, editar),
        h('p', { class: 'muted small' }, 'Administradores fijos (config.js): ' + (AP.CFG.administradores || []).join(', ')));
    }
    function editar(u) {
      var nuevo = !u; var d0 = u || { Rol: 'Vigilante', Activo: true };
      AP.modal({
        title: nuevo ? 'Agregar usuario' : u.Title,
        body: function (close) {
          var form = h('div', { class: 'stack' },
            AP.field('Correo con el que inicia sesión en Microsoft 365 *', AP.input('Title', d0.Title, { type: 'email', disabled: !nuevo })),
            AP.field('Nombre', AP.input('Nombre', d0.Nombre)),
            AP.field('Rol', AP.select('Rol', AP.CAT.roles, d0.Rol)),
            AP.field('Empresa', AP.input('Empresa', d0.Empresa, { placeholder: 'Avo Pak S.A.S. o contratista' })),
            AP.check('Activo', 'Usuario activo', d0.Activo !== false),
            AP.field('Observaciones (p. ej., soporte de la solicitud)', AP.textarea('Observaciones', d0.Observaciones)));
          return h('div', { class: 'stack' }, form, h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var d = AP.formData(form);
            if (nuevo) d.Title = String(d.Title || '').toLowerCase().trim(); else delete d.Title;
            if (nuevo && !/^[^@\s]+@[^@\s]+$/.test(d.Title)) return AP.toast('Escriba el correo del usuario.', 'warn');
            try {
              if (nuevo) { await AP.B.create('AP_Usuarios', d); } else { await AP.B.update('AP_Usuarios', u.id, d); }
              await AP.Audit.log(nuevo ? 'Alta de usuario' : 'Modificación de usuario', nuevo ? d.Title : u.Title, 'Rol: ' + d.Rol + '; activo: ' + U.yesNo(d.Activo));
              close(); AP.toast('Usuario guardado.'); cargar(); AP.Sync.run();
            } catch (e) { AP.toast(e.message, 'error'); }
          } }, 'Guardar'));
        }
      });
    }
    cargar();
  });

  // =================== BITÁCORA ===================
  AP.route('/consola/bitacora', function () {
    if (!guard('admin')) return;
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/bitacora', 'Bitácora de actuaciones', content);
    content.appendChild(AP.spinner());
    AP.B.listRange('AP_Bitacora', 'FechaHora', U.addDays(new Date(), -90), null).then(function (rows) {
      rows.sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
      var COLS = [['Fecha', function (r) { return U.fDateTime(r.FechaHora); }, 16], ['Acción', function (r) { return r.Accion; }, 22], ['Referencia', function (r) { return r.Referencia; }, 30],
        ['Usuario', function (r) { return r.Usuario; }, 28], ['Detalle', function (r) { return r.Detalle; }, 50], ['Huella SHA-256', function (r) { return r.Hash; }, 66]];
      content.replaceChildren(
        h('div', { class: 'row between wrap gap' }, h('p', { class: 'muted' }, 'Últimos 90 días. La lista conserva el historial de versiones de SharePoint.'),
          h('button', { class: 'btn', type: 'button', onclick: function () { AP.exportar('Bitacora', COLS, rows, 'xlsx', [['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]); } }, AP.icon('download', 18), 'Exportar')),
        simpleTable(COLS.map(function (c) { return [c[0], c[0] === 'Huella SHA-256' ? function (r) { return r.Hash ? h('code', { class: 'mono small' }, r.Hash.slice(0, 16) + '…') : ''; } : c[1]]; }), rows));
    }).catch(function (e) { content.replaceChildren(errBox(e)); });
  });

  // =================== INSTALACIÓN ===================
  AP.route('/consola/instalacion', function () {
    if (!guard('admin')) return;
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/instalacion', 'Instalación y configuración', content);
    var log = h('pre', { class: 'log' });
    var estado = h('div', { class: 'stack sm' }, AP.spinner('Verificando…'));
    function L(t) { log.textContent += t + '\n'; log.scrollTop = log.scrollHeight; }
    async function verificar() {
      estado.replaceChildren(AP.spinner('Verificando…'));
      try {
        var s = await AP.B.status();
        estado.replaceChildren(
          h('div', { class: 'kv' }, h('span', null, 'Sitio de SharePoint'), h('strong', null, AP.CFG.modo === 'demo' ? 'Local (demostración)' : AP.CFG.sitioSharePoint), AP.pill('Conectado', 'ok')),
          Object.keys(s.lists).map(function (n) { return h('div', { class: 'kv' }, h('span', null, n), h('strong', null, AP.SCHEMA[n].desc), AP.pill(s.lists[n] ? 'Creada' : 'Falta', s.lists[n] ? 'ok' : 'deny')); }));
      } catch (e) {
        estado.replaceChildren(h('div', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, 'No fue posible conectarse al sitio: ' + e.message)));
      }
    }
    var permisos = [
      'Cree un sitio de comunicación privado (p. ej., "Seguridad Integral — Control de Acceso"). Usted queda como propietario.',
      'Pulse "Crear o verificar estructura" (abajo). Se crean las listas AP_Personas, AP_Visitas, AP_Movimientos, AP_Inspecciones, AP_Usuarios, AP_Vigilantes, AP_CambiosPin, AP_Turnos, AP_Horarios, AP_Permisos, AP_Verificaciones y AP_Bitacora (si actualiza desde una versión anterior, vuelva a pulsarlo para crear las nuevas listas y columnas).',
      'En Configuración del sitio > Permisos > Niveles de permisos, cree el nivel "Agregar sin editar" copiando "Lectura" y marcando "Agregar elementos".',
      'Agregue la cuenta de servicio del celular de portería (y, si las hubiere, las cuentas personales de vigilantes y supervisores) al grupo "Visitantes" del sitio (solo lectura).',
      'En AP_Movimientos, AP_Inspecciones, AP_Turnos, AP_CambiosPin y la biblioteca Documentos (AP_Horarios, AP_Permisos y AP_Verificaciones quedan de solo lectura para el grupo Visitantes: solo el Director las modifica): Configuración > Permisos de esta lista > Dejar de heredar; asigne al grupo Visitantes el nivel "Agregar sin editar".',
      'Verifique en cada lista que el control de versiones esté activo (Configuración de la lista > Configuración de versiones).',
      'Registre en "Usuarios" la cuenta de servicio con el rol "Dispositivo de portería", inicie sesión con ella una vez en el celular de portería y cree en "Vigilantes" el usuario de cada vigilante.'
    ];
    AP.add(content, 
      h('section', { class: 'card stack' }, h('h3', null, '1. Conexión'), estado,
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn', type: 'button', onclick: verificar }, AP.icon('sync', 18), 'Verificar'),
          h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            log.textContent = '';
            try { await AP.B.provision(L); await AP.Audit.log('Instalación', 'Estructura de listas', log.textContent.slice(0, 2000)); AP.toast('Estructura lista.'); verificar(); AP.Sync.run(); }
            catch (e) { L('ERROR: ' + e.message); if (e.status === 403) L('Su cuenta no tiene permiso para crear listas en el sitio, o la aplicación no tiene el permiso Sites.ReadWrite.All aprobado.'); }
          } }, AP.icon('settings', 18), 'Crear o verificar estructura')), log),
      h('section', { class: 'card stack' }, h('h3', null, '2. Permisos en SharePoint (se hace una vez)'),
        h('ol', { class: 'steps' }, permisos.map(function (p) { return h('li', null, p); })),
        h('p', { class: 'muted small' }, 'Con esta configuración los vigilantes pueden consultar a quién dejar entrar y agregar registros, pero no pueden modificar ni borrar registros, ni habilitar personas.')),
      h('section', { class: 'card stack' }, h('h3', null, '3. Este dispositivo'),
        h('div', { class: 'kv' }, h('span', null, 'Identificador'), h('strong', null, U.deviceId())),
        h('div', { class: 'kv' }, h('span', null, 'Almacenamiento sin conexión'), h('strong', null, AP.Store.isMemory() ? 'Temporal (este navegador no permite guardar datos)' : 'Disponible')),
        h('div', { class: 'kv' }, h('span', null, 'Registros pendientes'), h('strong', null, String(AP.Sync.pendingCount()))),
        h('div', { class: 'kv' }, h('span', null, 'Última actualización'), h('strong', null, AP.Sync.state.lastPull ? U.fDateTime(AP.Sync.state.lastPull) : 'nunca')),
        h('div', { class: 'kv' }, h('span', null, 'Versión'), h('strong', null, AP.VERSION + ' · modo ' + AP.CFG.modo)),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn', type: 'button', onclick: function () { AP.Sync.run().then(function () { AP.toast('Sincronizado.'); AP.render(); }); } }, AP.icon('sync', 18), 'Sincronizar ahora'),
          h('button', { class: 'btn danger-outline', type: 'button', onclick: async function () {
            if (AP.Sync.pendingCount()) return AP.toast('Hay registros pendientes de envío; sincronice antes de borrar.', 'warn');
            if (!(await AP.confirm('Borrar datos locales', 'Se eliminan del dispositivo las copias de personas, visitas y movimientos. No afecta los datos en SharePoint.', 'Borrar', 'danger'))) return;
            await AP.Store.clearAll(); AP.toast('Datos locales eliminados.'); setTimeout(function () { location.reload(); }, 800);
          } }, AP.icon('trash', 18), 'Borrar datos locales'))),
      AP.CFG.modo === 'demo' ? h('section', { class: 'card stack' }, h('h3', null, 'Demostración'),
        AP.check('off', 'Simular pérdida de internet', AP.Demo.offline, { onchange: function (e) { AP.Demo.offline = e.target.checked; AP.Sync.state.online = !e.target.checked; AP.Sync.emit(); AP.toast(e.target.checked ? 'Sin conexión simulada.' : 'Conexión restablecida.'); if (!e.target.checked) AP.Sync.run(); } }),
        h('button', { class: 'btn danger-outline', type: 'button', onclick: function () { AP.Demo.reset(); } }, AP.icon('trash', 18), 'Restablecer datos de demostración')) : null);
    verificar();
  });

  // =================== CARGA MASIVA ===================
  var MAPA = {
    'nombre': 'Title', 'nombres y apellidos': 'Title', 'nombre completo': 'Title', 'tipo': 'Tipo', 'tipo de persona': 'Tipo',
    'tipo doc': 'TipoDoc', 'tipo documento': 'TipoDoc', 'tipo de documento': 'TipoDoc', 'documento': 'NumDoc', 'numero de documento': 'NumDoc', 'n documento': 'NumDoc', 'cedula': 'NumDoc',
    'telefono': 'Telefono', 'celular': 'Telefono', 'correo': 'Correo', 'email': 'Correo', 'empresa': 'Empresa', 'cargo': 'Cargo', 'area': 'Area',
    'estado': 'Estado', 'vigente hasta': 'VigenciaHasta', 'vigencia': 'VigenciaHasta', 'placa': 'Placa', 'tipo de vehiculo': 'VehiculoTipo', 'vehiculo': 'VehiculoTipo',
    'autoriza datos': 'AutorizaDatos', 'autoriza foto': 'AutorizaFoto', 'observaciones': 'Observaciones'
  };
  var PLANTILLA = ['Nombre completo', 'Tipo', 'Tipo de documento', 'Número de documento', 'Teléfono', 'Correo', 'Empresa', 'Cargo', 'Área', 'Estado', 'Vigente hasta', 'Placa', 'Tipo de vehículo', 'Autoriza datos', 'Autoriza foto', 'Observaciones'];

  AP.plantillaPersonas = async function () {
    var ejemplo = ['Nombre Apellido Apellido', 'Contratista', 'CC', '1234567890', '3000000000', 'correo@empresa.com', 'Empresa contratista S.A.S.', 'Técnico', 'Mantenimiento', 'Habilitado', '2026-12-31', 'ABC123', 'Camioneta', 'Sí', 'Sí', ''];
    var guia = [
      ['Tipo', AP.CAT.tiposPersona.join(' | ')], ['Tipo de documento', AP.CAT.tiposDoc.join(' | ')], ['Estado', 'Habilitado | Inhabilitado'],
      ['Vigente hasta', 'AAAA-MM-DD (opcional). Contratistas: fecha de la seguridad social verificada.'], ['Autoriza datos / Autoriza foto', 'Sí | No — debe existir el soporte firmado.'],
      ['Regla', 'Si el número de documento ya existe, la fila actualiza a esa persona; si no, se crea con una credencial QR nueva.']
    ];
    if (window.writeXlsxFile) {
      var blob = await window.writeXlsxFile([
        { sheet: 'Personas', data: [PLANTILLA.map(function (c) { return { value: c, fontWeight: 'bold', backgroundColor: '#E8ECDD' }; }), ejemplo.map(function (v) { return { value: v }; })], columns: PLANTILLA.map(function () { return { width: 20 }; }) },
        { sheet: 'Instrucciones', data: guia.map(function (g) { return [{ value: g[0], fontWeight: 'bold' }, { value: g[1] }]; }), columns: [{ width: 28 }, { width: 90 }] }
      ]).toBlob();
      U.download(blob, 'Plantilla_carga_personas.xlsx');
    } else {
      U.download(new Blob([U.csv([PLANTILLA, ejemplo])], { type: 'text/csv' }), 'Plantilla_carga_personas.csv');
    }
  };

  AP.cargaMasiva = function (done) {
    AP.modal({
      title: 'Carga masiva de personas', size: 'wide',
      body: function (close) {
        var inp = h('input', { type: 'file', accept: '.xlsx,.csv' });
        var prev = h('div', { class: 'stack' });
        var filas = [];
        inp.addEventListener('change', async function () {
          prev.replaceChildren(AP.spinner('Leyendo archivo…'));
          try {
            var f = inp.files[0];
            var rows;
            if (/\.csv$/i.test(f.name)) {
              var txt = (await f.text()).replace(/^﻿/, '');
              var sep = txt.split('\n')[0].indexOf(';') >= 0 ? ';' : ',';
              rows = txt.split(/\r?\n/).filter(Boolean).map(function (l) { return l.split(sep).map(function (c) { return c.replace(/^"|"$/g, '').trim(); }); });
            } else {
              var sheets = await window.readXlsxFile(f);
              rows = (Array.isArray(sheets) && sheets[0] && sheets[0].data) ? sheets[0].data : sheets;
            }
            var head = rows[0].map(function (c) { return MAPA[U.fold(c).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()] || null; });
            if (head.indexOf('Title') < 0 || head.indexOf('NumDoc') < 0) throw new Error('El archivo debe tener las columnas "Nombre completo" y "Número de documento". Use la plantilla.');
            var existentes = new Map((await AP.B.listAll('AP_Personas', { exclude: ['Foto'] })).map(function (p) { return [U.normDoc(p.NumDoc), p]; }));
            var vistos = new Set();
            filas = rows.slice(1).map(function (r, i) {
              var o = {};
              head.forEach(function (k, j) { if (k) { var v = r[j]; if (v instanceof Date) v = U.ymd(v); o[k] = v == null ? '' : String(v).trim(); } });
              var err = [];
              if (!o.Title || o.Title.length < 5) err.push('nombre');
              var d = U.normDoc(o.NumDoc); if (!d) err.push('documento');
              if (vistos.has(d)) err.push('documento repetido en el archivo'); vistos.add(d);
              if (o.Tipo && AP.CAT.tiposPersona.indexOf(o.Tipo) < 0) {
                var t = AP.CAT.tiposPersona.find(function (x) { return U.fold(x).indexOf(U.fold(o.Tipo)) === 0; });
                if (t) o.Tipo = t; else err.push('tipo');
              }
              o.Tipo = o.Tipo || 'Personal propio';
              o.TipoDoc = o.TipoDoc || 'CC';
              o.Estado = U.fold(o.Estado) === 'inhabilitado' ? 'Inhabilitado' : 'Habilitado';
              if (o.VigenciaHasta && !/^\d{4}-\d{2}-\d{2}$/.test(o.VigenciaHasta)) {
                var m = String(o.VigenciaHasta).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (m) o.VigenciaHasta = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); else err.push('fecha de vigencia');
              }
              if ('AutorizaDatos' in o) o.AutorizaDatos = U.parseBool(o.AutorizaDatos);
              if ('AutorizaFoto' in o) o.AutorizaFoto = U.parseBool(o.AutorizaFoto);
              if (o.Placa) o.Placa = o.Placa.split(',').map(U.normPlaca).filter(Boolean).join(', ');
              Object.keys(o).forEach(function (k) { if (o[k] === '') delete o[k]; });
              var ex = existentes.get(d);
              return { n: i + 2, data: o, err: err, existente: ex };
            }).filter(function (x) { return Object.keys(x.data).length; });
            var nuevos = filas.filter(function (x) { return !x.err.length && !x.existente; }).length;
            var act = filas.filter(function (x) { return !x.err.length && x.existente; }).length;
            var malos = filas.filter(function (x) { return x.err.length; });
            prev.replaceChildren(
              h('div', { class: 'row gap wrap' }, AP.pill(nuevos + ' nuevas', 'ok'), AP.pill(act + ' a actualizar', 'brand'), malos.length ? AP.pill(malos.length + ' con errores (se omiten)', 'deny') : null),
              malos.length ? h('div', { class: 'log' }, malos.slice(0, 50).map(function (x) { return h('div', { class: 'txt-deny' }, 'Fila ' + x.n + ': revisar ' + x.err.join(', ')); })) : null,
              simpleTable([['Fila', function (x) { return String(x.n); }], ['Nombre', function (x) { return x.data.Title; }], ['Documento', function (x) { return x.data.NumDoc; }],
                ['Tipo', function (x) { return x.data.Tipo; }], ['Estado', function (x) { return x.data.Estado; }], ['Acción', function (x) { return x.err.length ? AP.pill('Error', 'deny') : x.existente ? AP.pill('Actualizar', 'brand') : AP.pill('Crear', 'ok'); }]],
              filas.slice(0, 200)),
              h('button', { class: 'btn primary', type: 'button', disabled: !(nuevos + act), onclick: importar }, AP.icon('upload', 18), 'Importar ' + (nuevos + act) + ' personas'));
          } catch (e) { prev.replaceChildren(h('div', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, e.message))); }
        });
        async function importar() {
          var ok = filas.filter(function (x) { return !x.err.length; });
          var bar = h('progress', { max: ok.length, value: 0 });
          var info = h('p');
          prev.replaceChildren(bar, info);
          var c = 0, u = 0, fallos = [];
          for (var i = 0; i < ok.length; i++) {
            var x = ok[i];
            try {
              if (x.existente) { await AP.B.update('AP_Personas', x.existente.id, x.data); u++; }
              else {
                var d = Object.assign({ Token: U.newToken() }, x.data);
                if (d.AutorizaDatos) { d.FechaAutorizacion = U.ymd(); d.VersionAutorizacion = AP.CFG.versionAutorizacion; }
                await AP.B.create('AP_Personas', d); c++;
              }
            } catch (e) { fallos.push('Fila ' + x.n + ': ' + e.message); }
            bar.value = i + 1; info.textContent = (i + 1) + ' de ' + ok.length;
          }
          await AP.Audit.log('Carga masiva de personas', (inp.files[0] || {}).name || '', c + ' creadas, ' + u + ' actualizadas, ' + fallos.length + ' con error');
          prev.replaceChildren(h('div', { class: 'banner ' + (fallos.length ? 'warn' : 'info') }, AP.icon('check', 18), h('span', null, c + ' personas creadas y ' + u + ' actualizadas.' + (fallos.length ? ' ' + fallos.length + ' con error.' : ''))),
            fallos.length ? h('div', { class: 'log' }, fallos.map(function (f) { return h('div', null, f); })) : null,
            h('button', { class: 'btn primary', type: 'button', onclick: function () { close(); if (done) done(); } }, 'Terminar'));
          AP.Sync.run();
        }
        return h('div', { class: 'stack' },
          h('p', null, 'Cargue un archivo Excel (.xlsx) o CSV con las columnas de la plantilla. Si el documento ya existe, se actualizan sus datos; si no, se crea la persona con una credencial QR nueva. Las fotografías se cargan aparte.'),
          h('div', { class: 'row gap wrap' }, inp, h('button', { class: 'btn small', type: 'button', onclick: AP.plantillaPersonas }, AP.icon('file', 16), 'Descargar plantilla')),
          prev);
      }
    });
  };
})();
