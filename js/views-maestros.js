/* Datos maestros del Director de Seguridad Integral: personas jurídicas (empresas) y catálogo de cargos.
 * Al crear o editar una persona natural se elige su empresa y su cargo de estas listas. Solo el Director crea y modifica;
 * nada se borra si tiene personas vinculadas (se inactiva). */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function errBox(e) {
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message);
  }
  function tabla(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: c[2] || '' }, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a,input')) onRow(r); } : null },
          cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0], class: c[2] || '' }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }
  function porNombre(a, b) { return U.fold(a.Title) < U.fold(b.Title) ? -1 : 1; }
  // NIT colombiano: número con o sin dígito de verificación (900123456-7)
  function normNit(v) { return String(v || '').replace(/[^\dkK-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, ''); }

  // ---------- Consulta compartida (formulario de personas, carga masiva, usuarios) ----------
  var cache = { emp: null, car: null, te: 0, tc: 0 };
  AP.Maestros = {
    empresas: async function (fresco) {
      if (fresco || !cache.emp || Date.now() - cache.te > 60000) { cache.emp = (await AP.B.listAll('AP_Empresas', { exclude: ['Logo'] })).sort(porNombre); cache.te = Date.now(); }
      return cache.emp;
    },
    cargos: async function (fresco) {
      if (fresco || !cache.car || Date.now() - cache.tc > 60000) { cache.car = (await AP.B.listAll('AP_Cargos')).sort(porNombre); cache.tc = Date.now(); }
      return cache.car;
    },
    olvidar: function () { cache = { emp: null, car: null, te: 0, tc: 0 }; },
    normNit: normNit,
    // Empresa de la organización (para el personal propio)
    propia: function (lista) {
      var n = U.fold(AP.CFG.empresa || '').replace(/s\.?a\.?s\.?$/, '').trim();
      return (lista || []).find(function (e) { return n && U.fold(e.Title).indexOf(n) === 0; }) || null;
    },
    // Busca una empresa por NIT o por nombre (carga masiva y vinculación de registros anteriores)
    buscarEmpresa: function (lista, texto) {
      var t = U.fold(texto).trim(), n = normNit(texto).replace(/-\d$/, '');
      if (!t) return null;
      return (lista || []).find(function (e) { return (n.length >= 6 && normNit(e.NIT).replace(/-\d$/, '') === n) || U.fold(e.Title) === t; }) || null;
    },
    buscarCargo: function (lista, texto) {
      var t = U.fold(texto).trim();
      return t ? (lista || []).find(function (c) { return U.fold(c.Title) === t; }) || null : null;
    }
  };

  // Vinculación de registros anteriores: personas que tienen escrito el nombre de la empresa (o del cargo) sin vínculo
  async function vincularAnteriores(tipo, reg, personas, despues) {
    var esEmp = tipo === 'empresa';
    var campo = esEmp ? 'Empresa' : 'Cargo', idc = esEmp ? 'EmpresaId' : 'CargoId';
    var l = personas.filter(function (p) { return !p[idc] && p[campo] && U.fold(p[campo]).trim() === U.fold(reg.Title).trim(); });
    if (!l.length) return AP.toast('No hay personas sin vincular con ' + (esEmp ? 'la empresa' : 'el cargo') + ' escrito «' + reg.Title + '».', 'info', 6000);
    if (!(await AP.confirm('Vincular personas', l.length + ' persona(s) tienen escrito «' + reg.Title + '» como ' + campo.toLowerCase() + ' sin vínculo. ¿Vincularlas a este registro?', 'Vincular'))) return;
    var ok = 0;
    for (var i = 0; i < l.length; i++) {
      var d = {}; d[idc] = reg.id; d[campo] = reg.Title;
      try { await AP.B.update('AP_Personas', l[i].id, d); Object.assign(l[i], d); ok++; } catch (e) { /* se informa abajo */ }
    }
    await AP.Audit.log('Vinculación de personas a ' + (esEmp ? 'empresa' : 'cargo'), reg.Title, ok + ' de ' + l.length + ' personas vinculadas');
    AP.toast(ok + ' persona(s) vinculada(s) a «' + reg.Title + '».', 'info', 6000);
    AP.Sync.run();
    if (despues) despues();
  }

  // =================== EMPRESAS (PERSONAS JURÍDICAS) ===================
  AP.route('/consola/empresas', function () {
    if (!AP.Session.can('admin')) { AP.go('/'); return; }
    var box = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    var lista = [], personas = [], logos = {};
    var fEst = AP.select('est', [['act', 'Activas'], ['inact', 'Inactivas'], ['', 'Todas']], 'act');
    var q = AP.buscador('Buscar por nombre o NIT', pintar);
    fEst.addEventListener('change', pintar);
    var out = h('div');
    AP.consolaShell('/consola/empresas', 'Empresas (personas jurídicas)', box,
      h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nueva empresa'));
    function vinculadas(e) { return personas.filter(function (p) { return p.EmpresaId === e.id; }); }
    function filtradas() {
      return lista.filter(function (e) {
        if (fEst.value === 'act' && e.Activo === false) return false;
        if (fEst.value === 'inact' && e.Activo !== false) return false;
        return AP.coincide(e, q.value, ['Title', 'NIT']);
      });
    }
    function logoEl(e, big) { return h('img', { class: 'logo-emp' + (big ? ' big' : ''), src: logos[e.id] || U.avatar(e.Title), alt: '' }); }
    async function cargarLogos(ids) {
      var faltan = ids.filter(function (id) { return !(id in logos); });
      if (!faltan.length) return;
      faltan.forEach(function (id) { logos[id] = ''; });
      try {
        var f = await AP.B.getFields('AP_Empresas', faltan, ['Logo']);
        Object.keys(f).forEach(function (id) { logos[id] = f[id].Logo || ''; });
        pintar();
      } catch (e) { /* el logo es opcional en la lista */ }
    }
    function pintar() {
      var l = filtradas();
      out.replaceChildren(tabla([
        ['', function (e) { return logoEl(e); }],
        ['Empresa', function (e) { return h('strong', null, e.Title); }],
        ['NIT', function (e) { return e.NIT || ''; }],
        ['Personas vinculadas', function (e) { return String(vinculadas(e).length); }, 'num'],
        ['Estado', function (e) { return AP.pill(e.Activo === false ? 'Inactiva' : 'Activa', e.Activo === false ? 'muted' : 'ok'); }],
        ['', function (e) { return h('button', { class: 'btn small', type: 'button', onclick: function () { editar(e); } }, AP.icon('edit', 16), 'Editar'); }]
      ], l, editar));
      cargarLogos(l.map(function (e) { return e.id; }));
    }
    async function cargar() {
      try {
        var r = await Promise.all([AP.Maestros.empresas(true), AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] })]);
        lista = r[0]; personas = r[1];
        var sinVinc = personas.filter(function (p) { return !p.EmpresaId; }).length;
        box.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('building', 18), h('span', null, 'Personas jurídicas a las que se vinculan las personas naturales registradas: la empresa propia, los contratistas, las transportadoras y demás. ' +
            'Al crear o editar una persona se elige su empresa de esta lista. Solo se registran el nombre o razón social, el NIT y el logo.')),
          sinVinc ? h('p', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, sinVinc + ' persona(s) registradas aún no están vinculadas a una empresa. Cree la empresa y use «Vincular personas con este nombre» en su ficha, o edite cada persona.')) : null,
          h('div', { class: 'filters' }, fEst, q, AP.btnExcel(function () {
            var l = filtradas();
            if (!l.length) return AP.toast('No hay empresas con el filtro actual.', 'warn');
            AP.exportar('Empresas', [['Nombre o razón social', function (e) { return e.Title; }, 36], ['NIT', function (e) { return e.NIT; }, 16],
              ['Personas vinculadas', function (e) { return vinculadas(e).length; }, 12], ['Estado', function (e) { return e.Activo === false ? 'Inactiva' : 'Activa'; }, 10],
              ['Observaciones', function (e) { return e.Observaciones; }, 40]], l, 'xlsx', [['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
          })), out);
        pintar();
      } catch (e) { box.replaceChildren(errBox(e)); }
    }
    function editar(e) {
      var nuevo = !e, d0 = e || { Activo: true };
      var logo = nuevo ? '' : (logos[e.id] || '');
      AP.modal({ title: nuevo ? 'Nueva empresa' : e.Title, size: 'wide', body: function (close) {
        var f = { Title: AP.input('Title', d0.Title, { placeholder: 'Razón social completa' }), NIT: AP.input('NIT', d0.NIT, { placeholder: '900123456-7', inputmode: 'numeric' }),
          Observaciones: AP.textarea('Observaciones', d0.Observaciones, { rows: 2 }) };
        var act = AP.check('Activo', 'Empresa activa (se puede elegir al registrar personas)', d0.Activo !== false);
        var img = h('img', { class: 'logo-emp big', src: logo || U.avatar(d0.Title || '?'), alt: 'Logo' });
        var vinc = nuevo ? [] : vinculadas(e);
        var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
          var d = { Title: f.Title.value.trim(), NIT: normNit(f.NIT.value), Observaciones: f.Observaciones.value.trim(), Activo: act.querySelector('input').checked, Logo: logo };
          if (d.Title.length < 3) return AP.toast('Escriba el nombre o razón social.', 'warn');
          if (!/^\d{5,12}(-[\dkK])?$/.test(d.NIT)) return AP.toast('Escriba el NIT: solo números, con o sin dígito de verificación (ej.: 900123456-7).', 'warn', 7000);
          var base = d.NIT.replace(/-.$/, '');
          var dup = lista.find(function (x) { return x.id !== (e && e.id) && (normNit(x.NIT).replace(/-.$/, '') === base || U.fold(x.Title) === U.fold(d.Title)); });
          if (dup) return AP.toast('Ya existe una empresa con ese NIT o ese nombre: ' + dup.Title + ' (' + (dup.NIT || '') + ').', 'warn', 7000);
          if (!d.Activo && vinc.length && !(await AP.confirm('Inactivar empresa', 'Hay ' + vinc.length + ' persona(s) vinculadas. Seguirán vinculadas, pero la empresa no se podrá elegir para nuevas personas. ¿Continuar?', 'Inactivar'))) return;
          guardar.disabled = true;
          try {
            if (nuevo) { var rec = await AP.B.create('AP_Empresas', d); logos[rec.id] = logo; }
            else {
              await AP.B.update('AP_Empresas', e.id, d); logos[e.id] = logo;
              // El nombre de la empresa se actualiza también en las personas vinculadas
              if (d.Title !== e.Title) { for (var i = 0; i < vinc.length; i++) { try { await AP.B.update('AP_Personas', vinc[i].id, { Empresa: d.Title }); } catch (x) { /* se corrige al editar la persona */ } } }
            }
            await AP.Audit.log(nuevo ? 'Alta de empresa' : 'Modificación de empresa', d.Title + ' (NIT ' + d.NIT + ')', (d.Activo ? 'Activa' : 'Inactiva') + (logo ? '; con logo' : ''));
            AP.Maestros.olvidar();
            close(); AP.toast('Empresa guardada.'); cargar(); AP.Sync.run();
          } catch (x) { AP.toast(x.message, 'error'); guardar.disabled = false; }
        } }, AP.icon('check', 18), 'Guardar');
        return h('div', { class: 'edit-person' },
          h('div', { class: 'edit-side' }, img,
            h('div', { class: 'row gap wrap center' },
              h('button', { class: 'btn small', type: 'button', onclick: async function () {
                var file = await AP.pickImage(null); if (!file) return;
                try {
                  var r = await U.processImage(file, { max: 320, quality: 0.85, dataUrl: true });
                  if (r.dataUrl.length > 300000) return AP.toast('El logo es demasiado pesado. Use una imagen más pequeña.', 'warn');
                  logo = r.dataUrl; img.src = logo;
                } catch (x) { AP.toast(x.message, 'error'); }
              } }, AP.icon('upload', 16), 'Cargar logo'),
              h('button', { class: 'btn small ghost', type: 'button', onclick: function () { logo = ''; img.src = U.avatar(f.Title.value || '?'); } }, 'Quitar')),
            h('p', { class: 'help' }, 'Imagen PNG o JPG; se reduce automáticamente.')),
          h('div', { class: 'stack' },
            h('div', { class: 'form-grid' }, AP.field('Nombre o razón social *', f.Title, null, 'span2'), AP.field('NIT *', f.NIT, 'Con o sin dígito de verificación.'),
              h('div', { class: 'field' }, act), AP.field('Observaciones', f.Observaciones, null, 'span2')),
            nuevo ? null : h('section', { class: 'card stack sm' }, h('h3', null, 'Personas vinculadas (' + vinc.length + ')'),
              vinc.length ? tabla([['Persona', function (p) { return p.Title; }], ['Documento', function (p) { return p.NumDoc; }], ['Tipo', function (p) { return p.Tipo; }], ['Cargo', function (p) { return p.Cargo; }], ['Estado', function (p) { return AP.estadoPill(p.Estado); }]], vinc.slice().sort(porNombre))
                : h('p', { class: 'muted small' }, 'Ninguna persona vinculada.'),
              h('button', { class: 'btn small', type: 'button', onclick: function () { vincularAnteriores('empresa', e, personas, function () { close(); cargar(); }); } }, AP.icon('users', 16), 'Vincular personas con este nombre')),
            h('div', { class: 'row gap wrap end' },
              !nuevo && !vinc.length ? h('button', { class: 'btn danger-outline', type: 'button', onclick: async function () {
                if (!(await AP.confirm('Borrar empresa', '¿Borrar definitivamente «' + e.Title + '»? No tiene personas vinculadas.', 'Borrar', 'danger'))) return;
                try { await AP.B.borrarFisico('AP_Empresas', e.id); await AP.Audit.log('Borrado de empresa', e.Title, 'NIT ' + (e.NIT || '')); AP.Maestros.olvidar(); close(); cargar(); }
                catch (x) { AP.toast(x.message, 'error'); }
              } }, AP.icon('trash', 16), 'Borrar') : null,
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), guardar)));
      } });
    }
    cargar();
  });

  // =================== CARGOS ===================
  AP.route('/consola/cargos', function () {
    if (!AP.Session.can('admin')) { AP.go('/'); return; }
    var box = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    var lista = [], personas = [];
    var fEst = AP.select('est', [['act', 'Activos'], ['inact', 'Inactivos'], ['', 'Todos']], 'act');
    var fClase = AP.select('clase', [['', 'Toda clase de personal']].concat(AP.CAT.tiposPersonal), '');
    var q = AP.buscador('Buscar cargo o área', pintar);
    [fEst, fClase].forEach(function (s) { s.addEventListener('change', pintar); });
    var out = h('div');
    AP.consolaShell('/consola/cargos', 'Cargos', box,
      h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nuevo cargo'));
    function conCargo(c) { return personas.filter(function (p) { return p.CargoId === c.id; }); }
    function filtrados() {
      return lista.filter(function (c) {
        if (fEst.value === 'act' && c.Activo === false) return false;
        if (fEst.value === 'inact' && c.Activo !== false) return false;
        if (fClase.value && c.TipoPersonal !== fClase.value) return false;
        return AP.coincide(c, q.value, ['Title', 'Area', 'TipoPersonal']);
      });
    }
    function pintar() {
      out.replaceChildren(tabla([
        ['Cargo', function (c) { return h('strong', null, c.Title); }],
        ['Área', function (c) { return c.Area || ''; }],
        ['Clase de personal', function (c) { return c.TipoPersonal || ''; }],
        ['Personas con el cargo', function (c) { return String(conCargo(c).length); }, 'num'],
        ['Estado', function (c) { return AP.pill(c.Activo === false ? 'Inactivo' : 'Activo', c.Activo === false ? 'muted' : 'ok'); }],
        ['', function (c) { return h('button', { class: 'btn small', type: 'button', onclick: function () { editar(c); } }, AP.icon('edit', 16), 'Editar'); }]
      ], filtrados(), editar));
    }
    async function cargar() {
      try {
        var r = await Promise.all([AP.Maestros.cargos(true), AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] })]);
        lista = r[0]; personas = r[1];
        box.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('briefcase', 18), h('span', null, 'Catálogo de cargos. Al crear o editar una persona se elige su cargo de esta lista; el área y la clase de personal del cargo se proponen automáticamente en la ficha de la persona.')),
          h('div', { class: 'filters' }, fEst, fClase, q, AP.btnExcel(function () {
            var l = filtrados();
            if (!l.length) return AP.toast('No hay cargos con el filtro actual.', 'warn');
            AP.exportar('Cargos', [['Cargo', function (c) { return c.Title; }, 34], ['Área', function (c) { return c.Area; }, 20], ['Clase de personal', function (c) { return c.TipoPersonal; }, 18],
              ['Personas con el cargo', function (c) { return conCargo(c).length; }, 12], ['Estado', function (c) { return c.Activo === false ? 'Inactivo' : 'Activo'; }, 10],
              ['Observaciones', function (c) { return c.Observaciones; }, 40]], l, 'xlsx', [['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
          })), out);
        pintar();
      } catch (e) { box.replaceChildren(errBox(e)); }
    }
    function editar(c) {
      var nuevo = !c, d0 = c || { Activo: true };
      var conEste = nuevo ? [] : conCargo(c);
      AP.modal({ title: nuevo ? 'Nuevo cargo' : c.Title, size: 'wide', body: function (close) {
        var f = { Title: AP.input('Title', d0.Title, { placeholder: 'Ej.: Operario de empaque' }), Area: AP.input('Area', d0.Area, { placeholder: 'Ej.: Producción' }),
          TipoPersonal: AP.select('TipoPersonal', [['', '— No aplica —']].concat(AP.CAT.tiposPersonal), d0.TipoPersonal || ''), Observaciones: AP.textarea('Observaciones', d0.Observaciones, { rows: 2 }) };
        var act = AP.check('Activo', 'Cargo activo (se puede elegir al registrar personas)', d0.Activo !== false);
        var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
          var d = { Title: f.Title.value.trim(), Area: f.Area.value.trim(), TipoPersonal: f.TipoPersonal.value, Observaciones: f.Observaciones.value.trim(), Activo: act.querySelector('input').checked };
          if (d.Title.length < 3) return AP.toast('Escriba el nombre del cargo.', 'warn');
          var dup = lista.find(function (x) { return x.id !== (c && c.id) && U.fold(x.Title) === U.fold(d.Title); });
          if (dup) return AP.toast('Ya existe el cargo «' + dup.Title + '».', 'warn');
          guardar.disabled = true;
          try {
            if (nuevo) await AP.B.create('AP_Cargos', d);
            else {
              await AP.B.update('AP_Cargos', c.id, d);
              if (d.Title !== c.Title) { for (var i = 0; i < conEste.length; i++) { try { await AP.B.update('AP_Personas', conEste[i].id, { Cargo: d.Title }); } catch (x) { /* se corrige al editar la persona */ } } }
            }
            await AP.Audit.log(nuevo ? 'Alta de cargo' : 'Modificación de cargo', d.Title, [d.Area, d.TipoPersonal, d.Activo ? 'Activo' : 'Inactivo'].filter(Boolean).join('; '));
            AP.Maestros.olvidar();
            close(); AP.toast('Cargo guardado.'); cargar(); AP.Sync.run();
          } catch (x) { AP.toast(x.message, 'error'); guardar.disabled = false; }
        } }, AP.icon('check', 18), 'Guardar');
        return h('div', { class: 'stack' },
          h('div', { class: 'form-grid' }, AP.field('Nombre del cargo *', f.Title, null, 'span2'), AP.field('Área', f.Area, 'Se propone en la ficha de la persona.'),
            AP.field('Clase de personal', f.TipoPersonal, 'Para el personal propio. Se propone en la ficha de la persona.'), h('div', { class: 'field span2' }, act), AP.field('Observaciones', f.Observaciones, null, 'span2')),
          nuevo ? null : h('section', { class: 'card stack sm' }, h('h3', null, 'Personas con este cargo (' + conEste.length + ')'),
            conEste.length ? tabla([['Persona', function (p) { return p.Title; }], ['Documento', function (p) { return p.NumDoc; }], ['Empresa', function (p) { return p.Empresa; }], ['Área', function (p) { return p.Area; }], ['Estado', function (p) { return AP.estadoPill(p.Estado); }]], conEste.slice().sort(porNombre))
              : h('p', { class: 'muted small' }, 'Ninguna persona tiene este cargo.'),
            h('button', { class: 'btn small', type: 'button', onclick: function () { vincularAnteriores('cargo', c, personas, function () { close(); cargar(); }); } }, AP.icon('users', 16), 'Vincular personas con este cargo escrito')),
          h('div', { class: 'row gap wrap end' },
            !nuevo && !conEste.length ? h('button', { class: 'btn danger-outline', type: 'button', onclick: async function () {
              if (!(await AP.confirm('Borrar cargo', '¿Borrar definitivamente el cargo «' + c.Title + '»? Ninguna persona lo tiene asignado.', 'Borrar', 'danger'))) return;
              try { await AP.B.borrarFisico('AP_Cargos', c.id); await AP.Audit.log('Borrado de cargo', c.Title, ''); AP.Maestros.olvidar(); close(); cargar(); }
              catch (x) { AP.toast(x.message, 'error'); }
            } }, AP.icon('trash', 16), 'Borrar') : null,
            h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), guardar));
      } });
    }
    cargar();
  });

  // ---------- Ajuste automático de datos (actualización de octubre de 2026) ----------
  // Lo ejecuta en segundo plano la sesión del Director de Seguridad Integral, como máximo una vez al día. Completa en las
  // fichas el ámbito de Talento Humano y, en los permisos, ausencias y horarios recientes, el mes, el ámbito y el jefe
  // inmediato vigente, para que el Jefe de Producción y Talento Humano los consulten sin índices compuestos. No toca los
  // registros de ingreso y salida (no se modifican por diseño).
  AP.Migracion = {
    run: async function () {
      if (!AP.Session.can('admin') || navigator.onLine === false) return;
      var U = AP.U, hoy = U.ymd(), clave = 'migracion:2026-10';
      try { if ((await AP.Store.get(clave)) === hoy) return; } catch (e) { /* sin copia local: se ejecuta */ }
      var n = 0, fallas = 0, ahoraIso = new Date().toISOString(), desde = U.addDays(new Date(), -60);
      async function upd(lista, id, campos) {
        try { await AP.B.update(lista, id, campos); n++; } catch (e) { fallas++; }
        await U.sleep(120);
      }
      var per = await AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] });
      var porTok = {};
      per.forEach(function (p) { if (p.Token) porTok[p.Token] = p; });
      var amb = function (p) { return p.Tipo === 'Personal propio' || !!p.JefeId; };
      for (var i = 0; i < per.length; i++) { if (!!per[i].AmbitoTH !== amb(per[i])) await upd('AP_Personas', per[i].id, { AmbitoTH: amb(per[i]) }); }
      var perm = await AP.B.listRange('AP_Permisos', 'Hasta', desde, null);
      for (var j = 0; j < perm.length; j++) {
        var x = perm[j], p = porTok[x.Token], c = {};
        if (!x.Mes && x.Desde) c.Mes = U.ymd(x.Desde).slice(0, 7);
        if (p) {
          if (!!x.AmbitoTH !== amb(p)) c.AmbitoTH = amb(p);
          if (!x.PersonaId) c.PersonaId = p.id;
          if (!x.PersonaTipo && p.Tipo) c.PersonaTipo = p.Tipo;
          if (x.Estado !== 'Anulado' && x.Hasta >= ahoraIso && (x.JefeId || '') !== (p.JefeId || '')) c.JefeId = p.JefeId || '';
        }
        if (Object.keys(c).length) await upd('AP_Permisos', x.id, c);
      }
      var aus = await AP.B.listRange('AP_Ausencias', 'Hasta', desde, null);
      for (var k = 0; k < aus.length; k++) {
        var a = aus[k], pa = porTok[a.Token];
        if (pa && a.Estado !== 'Anulada' && a.Hasta >= ahoraIso && (a.JefeId || '') !== (pa.JefeId || '')) await upd('AP_Ausencias', a.id, { JefeId: pa.JefeId || '' });
      }
      // Horarios fijos asignados por un jefe a una persona que cambió de jefe inmediato
      var hor = await AP.B.listAll('AP_Horarios');
      for (var m = 0; m < hor.length; m++) {
        var hz = hor[m], ph = porTok[hz.Token];
        if (hz.JefeId && ph && (ph.JefeId || '') !== hz.JefeId) await upd('AP_Horarios', hz.id, { JefeId: ph.JefeId || '', PersonaId: ph.id });
      }
      if (!fallas) { try { await AP.Store.set(clave, hoy); } catch (e) { /* se repite mañana */ } }
      if (n) await AP.Audit.log('Ajuste automático de datos', 'Actualización de octubre de 2026', n + ' registro(s) completados (ámbito de Talento Humano, mes y jefe inmediato vigente)' + (fallas ? '; ' + fallas + ' pendiente(s) para el próximo ingreso' : '') + '.');
      return { actualizados: n, fallas: fallas };
    }
  };
})();
