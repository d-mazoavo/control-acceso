/* Consola: vigilantes de portería (usuario y PIN), turnos y credenciales */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function errBox(e) {
    if (e && e.missingList) return AP.empty('settings', 'Falta crear la estructura en SharePoint', e.message, h('a', { class: 'btn primary', href: '#/consola/instalacion' }, 'Ir a instalación'));
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con Microsoft 365' : 'No fue posible cargar la información', e && e.message);
  }
  function tabla(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a')) onRow(r); } : null }, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0] }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }
  function kv(label, value) { return h('div', { class: 'kv' }, h('span', null, label), h('strong', null, value || '—')); }
  function me() { return AP.Session.user.upn; }
  function nowIso() { return new Date().toISOString(); }

  var EVENTO_KIND = {
    'Inicio de turno': 'ok', 'Fin de turno': 'brand', 'Cierre automático de turno': 'warn', 'Cierre por baja de la credencial': 'warn',
    'Cierre por restablecimiento del PIN': 'warn', 'Bloqueo por intentos fallidos': 'deny', 'Desvinculación del celular': 'deny'
  };

  AP.route('/consola/vigilantes', function (qs) {
    if (!AP.Session.can('admin')) { AP.go('/porteria'); return; }
    var datos = { vig: [], cambios: [], turnos: [] };
    var filtro = qs.f || 'Activos';
    var q = h('input', { type: 'search', placeholder: 'Buscar por nombre, usuario, documento o empresa', class: 'grow' });
    var chips = h('div', { class: 'chips' });
    var tablaBox = h('div', { class: 'stack' });
    var eventosBox = h('div', { class: 'stack' });
    var content = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    AP.consolaShell('/consola/vigilantes', 'Vigilantes de portería', content, [
      h('button', { class: 'btn', type: 'button', onclick: exportar }, AP.icon('download', 18), 'Exportar'),
      h('button', { class: 'btn primary', type: 'button', onclick: crear }, AP.icon('plus', 18), 'Agregar vigilante')]);
    q.addEventListener('input', U.debounce(pintar, 200));

    async function cargar() {
      try {
        var r = await Promise.all([
          AP.B.listAll('AP_Vigilantes'), AP.B.listAll('AP_CambiosPin'),
          AP.B.listRange('AP_Turnos', 'FechaHora', U.addDays(new Date(), -60), null)]);
        datos.vig = r[0]; datos.cambios = r[1];
        datos.turnos = r[2].sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
        content.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null,
            'Cada vigilante opera el celular de portería con su usuario y un PIN que solo él conoce. Aquí ve a qué persona corresponde cada usuario, el estado de su PIN y sus turnos. ' +
            'El PIN temporal se muestra una sola vez, al crear o restablecer la credencial. Las altas y bajas del personal del contratista se tramitan a solicitud escrita del supervisor designado por el contratista.')),
          h('div', { class: 'filters' }, chips, q), tablaBox,
          h('h3', null, 'Eventos de turno (últimos 60 días)'), eventosBox);
        pintar();
      } catch (e) { content.replaceChildren(errBox(e)); }
    }

    function estadoPin(v) {
      var c = AP.Pin.credencial(v, datos.cambios);
      if (v.Activo === false) return AP.pill('Sin uso (de baja)', '');
      if (c.temporal) {
        var hv = AP.CFG.horasVigenciaPinTemporal || 72;
        var vencido = v.PinFecha && Date.now() - new Date(v.PinFecha).getTime() > hv * 3600000;
        return AP.pill(vencido ? 'Temporal vencido' : 'Temporal, pendiente de cambio', vencido ? 'deny' : 'warn');
      }
      return AP.pill('Personal desde ' + U.fDate(c.desde), 'ok');
    }
    function turnosDe(v) { return datos.turnos.filter(function (t) { return String(t.VigilanteId) === String(v.id); }); }
    function ultimoTurno(v) {
      var ev = turnosDe(v).filter(function (t) { return t.Evento === 'Inicio de turno' || /^(Fin|Cierre)/.test(t.Evento || ''); })[0];
      if (!ev) return '';
      if (ev.Evento === 'Inicio de turno') return h('span', null, AP.pill('Turno abierto', 'ok'), ' desde ' + U.fDateTime(ev.FechaHora));
      return U.fDateTime(ev.InicioTurno || ev.FechaHora) + ' a ' + U.fTime(ev.FechaHora);
    }

    function pintar() {
      var act = datos.vig.filter(function (v) { return v.Activo !== false; }), baja = datos.vig.filter(function (v) { return v.Activo === false; });
      chips.replaceChildren.apply(chips, [['Activos', act.length], ['De baja', baja.length], ['Todos', datos.vig.length]].map(function (c) {
        return h('a', { class: 'chip ' + (c[0] === filtro ? 'on' : ''), href: '#/consola/vigilantes?f=' + encodeURIComponent(c[0]) }, c[0] + ' (' + c[1] + ')');
      }));
      var t = U.fold(q.value);
      var rows = (filtro === 'Activos' ? act : filtro === 'De baja' ? baja : datos.vig).filter(function (v) {
        return !t || U.fold([v.Title, v.Usuario, v.NumDoc, v.Empresa, v.Cargo].join(' ')).indexOf(t) >= 0;
      }).sort(function (a, b) { return String(a.Title).localeCompare(String(b.Title), 'es'); });
      tablaBox.replaceChildren(tabla([
        ['Usuario', function (v) { return h('code', null, v.Usuario); }], ['Nombre', function (v) { return v.Title; }],
        ['Documento', function (v) { return [v.TipoDoc, v.NumDoc].filter(Boolean).join(' '); }], ['Empresa', function (v) { return v.Empresa; }],
        ['Rol', function (v) { return v.Rol; }], ['PIN', estadoPin],
        ['Estado', function (v) { return v.Activo === false ? AP.pill('De baja', 'deny') : AP.pill('Activo', 'ok'); }],
        ['Último turno', ultimoTurno],
        ['', function (v) { return h('button', { class: 'btn small', type: 'button', onclick: function () { detalle(v); } }, 'Ver'); }]
      ], rows, detalle));
      var evs = datos.turnos.slice(0, 80);
      eventosBox.replaceChildren(tabla([
        ['Fecha', function (e) { return U.fDateTime(e.FechaHora); }], ['Evento', function (e) { return AP.pill(e.Evento, EVENTO_KIND[e.Evento] || ''); }],
        ['Vigilante', function (e) { return e.Title; }], ['Usuario', function (e) { return e.VigilanteUsuario; }],
        ['Registros', function (e) { return e.Registros == null ? '' : String(e.Registros); }], ['Dispositivo', function (e) { return e.Dispositivo; }],
        ['Detalle', function (e) { return e.Detalle; }]
      ], evs));
    }

    // ---------- Ficha del vigilante ----------
    function detalle(v) {
      var c = AP.Pin.credencial(v, datos.cambios);
      var tv = turnosDe(v).slice(0, 40);
      AP.modal({
        title: v.Title, size: 'wide',
        body: function (close) {
          var activo = v.Activo !== false;
          return h('div', { class: 'stack' },
            h('div', { class: 'kv-grid' },
              kv('Usuario', v.Usuario), kv('Rol', v.Rol), kv('Documento', [v.TipoDoc, v.NumDoc].filter(Boolean).join(' ')), kv('Empresa', v.Empresa),
              kv('Cargo', v.Cargo), kv('Teléfono', v.Telefono),
              kv('Estado', activo ? 'Activo' : 'De baja desde ' + U.fDateTime(v.FechaBaja)),
              kv('PIN', !activo ? 'Sin uso' : c.temporal ? 'Temporal, asignado el ' + U.fDateTime(v.PinFecha) + ' por ' + (v.PinPor || '—') : 'Personal, definido por el vigilante el ' + U.fDateTime(c.desde)),
              kv('Alta', U.fDateTime(v.FechaAlta) + (v.AltaPor ? ' · ' + v.AltaPor : '')), kv('Solicitado por', [v.SolicitadoPor, v.Soporte].filter(Boolean).join(' · ')),
              !activo ? kv('Motivo de la baja', (v.MotivoBaja || '') + (v.BajaPor ? ' · ' + v.BajaPor : '')) : null,
              v.Observaciones ? kv('Observaciones', v.Observaciones) : null),
            h('div', { class: 'row gap wrap' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); editar(v); } }, AP.icon('edit', 18), 'Editar datos'),
              activo ? h('button', { class: 'btn', type: 'button', onclick: function () { close(); restablecer(v); } }, AP.icon('key', 18), 'Restablecer PIN') : null,
              activo
                ? h('button', { class: 'btn danger-outline', type: 'button', onclick: function () { close(); darDeBaja(v); } }, AP.icon('lock', 18), 'Dar de baja')
                : h('button', { class: 'btn primary', type: 'button', onclick: function () { close(); reactivar(v); } }, AP.icon('unlock', 18), 'Reactivar')),
            h('h3', null, 'Turnos y eventos (últimos 60 días)'),
            tabla([['Fecha', function (e) { return U.fDateTime(e.FechaHora); }], ['Evento', function (e) { return AP.pill(e.Evento, EVENTO_KIND[e.Evento] || ''); }],
              ['Inicio del turno', function (e) { return e.InicioTurno ? U.fDateTime(e.InicioTurno) : ''; }], ['Registros', function (e) { return e.Registros == null ? '' : String(e.Registros); }],
              ['Dispositivo', function (e) { return e.Dispositivo; }]], tv),
            h('p', { class: 'muted small' }, 'Los registros de ingreso, salida e inspección hechos en sus turnos se consultan en Historial filtrando por su nombre.'));
        }
      });
    }

    // ---------- PIN temporal: se muestra una sola vez ----------
    function mostrarPin(v, pin, titulo) {
      var hv = AP.CFG.horasVigenciaPinTemporal || 72;
      AP.modal({
        title: titulo, persistent: true,
        body: function (close) {
          return h('div', { class: 'stack' },
            h('p', null, h('strong', null, v.Title), ' · usuario ', h('code', null, v.Usuario)),
            h('div', { class: 'pin-grande', 'aria-label': 'PIN temporal' }, pin),
            h('p', { class: 'note' }, 'Este PIN no se volverá a mostrar ni puede consultarse después. Entréguelo de forma reservada al vigilante o por conducto del supervisor del contratista. ' +
              'Vence en ' + hv + ' horas y, al primer ingreso, la aplicación exigirá al vigilante definir un PIN personal que nadie más conoce.'),
            h('div', { class: 'row gap wrap end' },
              navigator.clipboard ? h('button', { class: 'btn', type: 'button', onclick: function () { navigator.clipboard.writeText(pin).then(function () { AP.toast('PIN copiado.'); }, function () { AP.toast('No fue posible copiar.', 'warn'); }); } }, AP.icon('file', 18), 'Copiar') : null,
              h('button', { class: 'btn primary', type: 'button', onclick: function () { close(); } }, AP.icon('check', 18), 'Ya lo anoté para entregarlo')));
        }
      });
    }

    function formDatos(d0, nuevo) {
      var usuario = AP.input('Usuario', d0.Usuario, { autocapitalize: 'none', disabled: !nuevo, placeholder: 'p. ej., número de documento' });
      var doc = AP.input('NumDoc', d0.NumDoc, { inputmode: 'text' });
      var tocado = false;
      usuario.addEventListener('input', function () { tocado = true; });
      doc.addEventListener('input', function () { if (nuevo && !tocado) usuario.value = U.normDoc(doc.value).toLowerCase(); });
      return h('div', { class: 'form-grid' },
        AP.field('Nombre completo *', AP.input('Title', d0.Title), null, 'span2'),
        AP.field('Tipo de documento', AP.select('TipoDoc', AP.CAT.tiposDoc, d0.TipoDoc || 'CC')),
        AP.field('Número de documento *', doc),
        AP.field('Usuario para iniciar turno *', usuario, nuevo ? 'Letras minúsculas, números, punto o guion. No se puede cambiar después.' : 'El usuario no se modifica.'),
        AP.field('Rol', AP.select('Rol', AP.CAT.rolesPin, d0.Rol || 'Vigilante'), 'Supervisor: además consulta el historial y puede desvincular el celular.'),
        AP.field('Empresa *', AP.input('Empresa', d0.Empresa, { placeholder: 'Empresa de vigilancia contratista' })),
        AP.field('Cargo', AP.input('Cargo', d0.Cargo, { placeholder: 'Guarda de seguridad' })),
        AP.field('Teléfono', AP.input('Telefono', d0.Telefono, { inputmode: 'tel' })),
        nuevo ? AP.field('Solicitado por *', AP.input('SolicitadoPor', d0.SolicitadoPor, { placeholder: 'Supervisor designado por el contratista' })) : null,
        nuevo ? AP.field('Soporte de la solicitud', AP.input('Soporte', d0.Soporte, { placeholder: 'Correo o comunicación, con fecha' })) : null,
        AP.field('Observaciones', AP.textarea('Observaciones', d0.Observaciones), null, 'span2'));
    }
    function validar(d, nuevo) {
      if (!d.Title || d.Title.length < 5) return 'Escriba el nombre completo.';
      if (!U.normDoc(d.NumDoc)) return 'Escriba el número de documento.';
      if (!d.Empresa) return 'Escriba la empresa.';
      if (nuevo) {
        if (!/^[a-z0-9._-]{3,30}$/.test(d.Usuario)) return 'El usuario debe tener de 3 a 30 caracteres: letras minúsculas sin tildes, números, punto o guion.';
        if (datos.vig.some(function (x) { return AP.Pin.norm(x.Usuario) === d.Usuario; })) return 'Ese usuario ya existe (puede estar de baja). Elija otro.';
        if (!d.SolicitadoPor) return 'Indique quién solicitó la credencial.';
      }
      return null;
    }

    function crear() {
      AP.modal({
        title: 'Agregar vigilante', size: 'wide',
        body: function (close) {
          var form = formDatos({}, true);
          var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var d = AP.formData(form);
            d.Usuario = AP.Pin.norm(d.Usuario);
            var e = validar(d, true);
            if (e) return AP.toast(e, 'warn');
            var dup = datos.vig.find(function (x) { return x.Activo !== false && U.normDoc(x.NumDoc) === U.normDoc(d.NumDoc); });
            if (dup && !(await AP.confirm('Documento ya registrado', 'El documento ya tiene la credencial activa "' + dup.Usuario + '". ¿Crear otra credencial para la misma persona?', 'Crear de todos modos'))) return;
            guardar.disabled = true;
            try {
              var pin = AP.Pin.temporal();
              var rec = Object.assign(d, await AP.Pin.hash(pin), {
                Activo: true, PinVersion: 1, PinFecha: nowIso(), PinPor: me(), FechaAlta: nowIso(), AltaPor: me()
              });
              var v = await AP.B.create('AP_Vigilantes', rec);
              await AP.Audit.log('Alta de vigilante', d.Usuario + ' — ' + d.Title, 'Rol: ' + d.Rol + '; empresa: ' + d.Empresa + '; solicitado por: ' + d.SolicitadoPor + (d.Soporte ? ' (' + d.Soporte + ')' : ''));
              close();
              mostrarPin(v, pin, 'Credencial creada');
              cargar(); AP.Sync.run();
            } catch (err) {
              AP.toast(err.status === 409 ? 'Ese usuario ya existe en SharePoint.' : err.message, 'error');
            } finally { guardar.disabled = false; }
          } }, AP.icon('key', 18), 'Crear y generar PIN temporal');
          return h('div', { class: 'stack' }, form, h('div', { class: 'row end' }, guardar));
        }
      });
    }

    function editar(v) {
      AP.modal({
        title: 'Editar datos — ' + v.Usuario, size: 'wide',
        body: function (close) {
          var form = formDatos(v, false);
          return h('div', { class: 'stack' }, form, h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var d = AP.formData(form); delete d.Usuario;
            var e = validar(d, false);
            if (e) return AP.toast(e, 'warn');
            try {
              await AP.B.update('AP_Vigilantes', v.id, d);
              await AP.Audit.log('Modificación de vigilante', v.Usuario + ' — ' + d.Title, 'Rol: ' + d.Rol + '; empresa: ' + d.Empresa);
              close(); AP.toast('Datos guardados.'); cargar(); AP.Sync.run();
            } catch (err) { AP.toast(err.message, 'error'); }
          } }, 'Guardar')));
        }
      });
    }

    // Motivo y solicitante: deja la trazabilidad de cada actuación sobre la credencial
    function pedirMotivo(titulo, texto, conCatalogo, boton, kind) {
      return new Promise(function (res) {
        AP.modal({
          title: titulo, onClose: function (v) { res(v || null); },
          body: function (close) {
            var form = h('div', { class: 'stack' },
              h('p', { class: 'muted' }, texto),
              conCatalogo ? AP.field('Motivo *', AP.select('motivo', [''].concat(AP.CAT.motivosBaja), '')) : null,
              AP.field('Solicitado por *', AP.input('solicitado', '', { placeholder: 'Supervisor del contratista o funcionario que lo pide' })),
              AP.field(conCatalogo ? 'Detalle' : 'Motivo *', AP.textarea('detalle', '')));
            return h('div', { class: 'stack' }, form, h('div', { class: 'row gap end' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn ' + (kind || 'primary'), type: 'button', onclick: function () {
                var d = AP.formData(form);
                if (conCatalogo && !d.motivo) return AP.toast('Seleccione el motivo.', 'warn');
                if (!conCatalogo && !d.detalle) return AP.toast('Escriba el motivo.', 'warn');
                if (!d.solicitado) return AP.toast('Indique quién lo solicita.', 'warn');
                close(d);
              } }, boton)));
          }
        });
      });
    }

    async function restablecer(v) {
      var d = await pedirMotivo('Restablecer PIN — ' + v.Usuario,
        'Se genera un PIN temporal nuevo y el PIN actual deja de servir. Si el vigilante tiene un turno abierto, el celular lo cerrará al actualizarse.', false, 'Restablecer PIN');
      if (!d) return;
      try {
        var pin = AP.Pin.temporal();
        await AP.B.update('AP_Vigilantes', v.id, Object.assign(await AP.Pin.hash(pin), { PinVersion: (Number(v.PinVersion) || 0) + 1, PinFecha: nowIso(), PinPor: me() }));
        await AP.Audit.log('Restablecimiento de PIN', v.Usuario + ' — ' + v.Title, 'Solicitado por: ' + d.solicitado + '; motivo: ' + d.detalle);
        mostrarPin(v, pin, 'PIN restablecido');
        cargar(); AP.Sync.run();
      } catch (e) { AP.toast(e.message, 'error'); }
    }

    async function darDeBaja(v) {
      var d = await pedirMotivo('Dar de baja — ' + v.Usuario,
        'La credencial deja de funcionar en cuanto el celular de portería se actualice, y cualquier turno abierto con ella se cierra. El registro se conserva para la trazabilidad de los turnos y movimientos ya hechos.', true, 'Dar de baja', 'danger');
      if (!d) return;
      try {
        await AP.B.update('AP_Vigilantes', v.id, { Activo: false, FechaBaja: nowIso(), BajaPor: me(), MotivoBaja: d.motivo + (d.detalle ? ': ' + d.detalle : '') });
        await AP.Audit.log('Baja de vigilante', v.Usuario + ' — ' + v.Title, 'Motivo: ' + d.motivo + (d.detalle ? ' (' + d.detalle + ')' : '') + '; solicitado por: ' + d.solicitado);
        AP.toast('Credencial dada de baja.'); cargar(); AP.Sync.run();
      } catch (e) { AP.toast(e.message, 'error'); }
    }

    async function reactivar(v) {
      var d = await pedirMotivo('Reactivar — ' + v.Usuario, 'La credencial se reactiva con un PIN temporal nuevo; el PIN personal anterior no vuelve a servir.', false, 'Reactivar');
      if (!d) return;
      try {
        var pin = AP.Pin.temporal();
        await AP.B.update('AP_Vigilantes', v.id, Object.assign(await AP.Pin.hash(pin), {
          Activo: true, FechaBaja: null, BajaPor: '', MotivoBaja: '', PinVersion: (Number(v.PinVersion) || 0) + 1, PinFecha: nowIso(), PinPor: me()
        }));
        await AP.Audit.log('Reactivación de vigilante', v.Usuario + ' — ' + v.Title, 'Solicitado por: ' + d.solicitado + '; motivo: ' + d.detalle);
        mostrarPin(v, pin, 'Credencial reactivada');
        cargar(); AP.Sync.run();
      } catch (e) { AP.toast(e.message, 'error'); }
    }

    function exportar() {
      var COLS = [
        ['Usuario', function (v) { return v.Usuario; }, 16], ['Nombres y apellidos', function (v) { return v.Title; }, 32],
        ['Tipo doc.', function (v) { return v.TipoDoc; }, 8], ['N.° documento', function (v) { return v.NumDoc; }, 15],
        ['Empresa', function (v) { return v.Empresa; }, 26], ['Cargo', function (v) { return v.Cargo; }, 20], ['Rol', function (v) { return v.Rol; }, 12],
        ['Estado', function (v) { return v.Activo === false ? 'De baja' : 'Activo'; }, 10],
        ['PIN', function (v) { var c = AP.Pin.credencial(v, datos.cambios); return v.Activo === false ? 'Sin uso' : c.temporal ? 'Temporal' : 'Personal'; }, 10],
        ['PIN vigente desde', function (v) { return U.fDateTime(AP.Pin.credencial(v, datos.cambios).desde); }, 18],
        ['Alta', function (v) { return U.fDateTime(v.FechaAlta); }, 18], ['Alta por', function (v) { return v.AltaPor; }, 26],
        ['Solicitado por', function (v) { return v.SolicitadoPor; }, 26], ['Soporte', function (v) { return v.Soporte; }, 26],
        ['Baja', function (v) { return U.fDateTime(v.FechaBaja); }, 18], ['Motivo de la baja', function (v) { return v.MotivoBaja; }, 36]
      ];
      AP.exportar('Vigilantes_porteria', COLS, datos.vig, 'xlsx', [['Generado por', AP.Session.user.nombre + ' (' + me() + ')'], ['Fecha', U.fDateTime(new Date())],
        ['Nota', 'El PIN no se exporta: solo se conserva su huella criptográfica.']]);
    }

    cargar();
  });
})();
