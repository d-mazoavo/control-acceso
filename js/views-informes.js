/* Novedades de ronda y su verificación por el Director, informe de cada novedad (PDF o Word, español o inglés, con firma
 * escaneada), archivo fotográfico mensual y liberación de espacio, e informe mensual de seguridad con gráficas. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;
  var I = function () { return AP.Informe; };

  function errBox(e) { return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message); }
  function fotosDe(x) { try { var a = JSON.parse(x.Fotos || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function tabla(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a,input')) onRow(r); } : null }, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0] }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }
  function kv(k, v) { return v || v === 0 ? h('div', { class: 'kv' }, h('span', null, k), h('strong', null, String(v))) : null; }
  function kpi(v, t, k) { return h('div', { class: 'kpi ' + (k || '') }, h('strong', null, String(v)), h('span', null, t)); }

  // ---------- Textos en inglés de los catálogos (los textos libres se transcriben tal como se registraron) ----------
  var TIPO_EN = {
    'Puerta, ventana o acceso abierto': 'Door, window or access left open', 'Persona sospechosa': 'Suspicious person',
    'Objeto o paquete sospechoso': 'Suspicious object or package', 'Cerramiento o perímetro vulnerado': 'Fence or perimeter breached',
    'Daño en infraestructura o equipos': 'Damage to infrastructure or equipment', 'Iluminación deficiente': 'Poor lighting',
    'Fuga, derrame o goteo': 'Leak, spill or drip', 'Riesgo de incendio o eléctrico': 'Fire or electrical hazard', 'Condición insegura': 'Unsafe condition',
    'Animal o plaga': 'Animal or pest', 'Otra': 'Other'
  };
  var RESULTADOS = ['Confirmada — atendida', 'Confirmada — en seguimiento', 'No confirmada'];
  var RESULTADO_EN = { 'Confirmada — atendida': 'Confirmed — resolved', 'Confirmada — en seguimiento': 'Confirmed — follow-up in progress', 'No confirmada': 'Not confirmed' };
  var ROL_EN = { Rondero: 'Patrol guard', Supervisor: 'Security supervisor', Analista: 'Security analyst', Administrador: 'Director of Integral Security', Vigilante: 'Security guard' };
  function origenTxt(x, idioma) {
    var en = idioma === 'en';
    if (x.Origen === 'Reporte de novedad') return en ? 'Incident report (outside a checkpoint)' : 'Reporte de novedad (fuera de un punto de control)';
    if (x.Origen === 'QR') return en ? 'Checkpoint, QR code read' : 'Punto de control, con lectura del código QR';
    return en ? 'Checkpoint, without QR code read' : 'Punto de control, sin lectura del código QR';
  }
  function rolTxt(r, idioma) { return idioma === 'en' ? (ROL_EN[r] || r || '') : (r === 'Administrador' ? 'Director de Seguridad Integral' : r || ''); }
  function lugarDe(x) { return x.Lugar || x.Title || ''; }
  function estadoVer(v) { return !v ? { t: 'Por verificar', k: 'warn' } : /^No confirmada/.test(v.Resultado) ? { t: v.Resultado, k: 'muted' } : /seguimiento/.test(v.Resultado) ? { t: v.Resultado, k: 'warn' } : { t: v.Resultado, k: 'ok' }; }

  // Verificaciones de novedades de ronda desde una fecha: { porRonda: Map(RondaId → [verificaciones en orden]) }
  async function verificaciones(desde) {
    var l = await AP.B.listRange('AP_Verificaciones', 'FechaHora', desde, null).catch(function () { return []; });
    var m = new Map();
    l.filter(function (v) { return v.RondaId; }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? -1 : 1; })
      .forEach(function (v) { if (!m.has(v.RondaId)) m.set(v.RondaId, []); m.get(v.RondaId).push(v); });
    return m;
  }
  function ultima(m, x) { var l = m.get(x.IdLocal); return l && l.length ? l[l.length - 1] : null; }

  // =================== NOVEDADES DE RONDA Y SU VERIFICACIÓN ===================
  AP.Rondas.tabNovedades = function (box) {
    var ED = AP.Session.can('editar'), ADM = AP.Session.can('admin');
    var desde = AP.input('desde', U.ymd(U.addDays(new Date(), -30)), { type: 'date' });
    var hasta = AP.input('hasta', U.ymd(), { type: 'date' });
    var fEst = AP.select('estado', [['', 'Todas'], ['por', 'Por verificar'], ['ver', 'Verificadas']], '');
    var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposNovedadRonda.map(function (t) { return [t, t]; })), '');
    var q = AP.buscador('Buscar lugar, descripción, quien reportó o verificación', pintar);
    var out = h('div', { class: 'stack' });
    var datos = [], ver = new Map();
    function filtradas() {
      return datos.filter(function (x) {
        var v = ultima(ver, x);
        if (fEst.value === 'por' && v) return false;
        if (fEst.value === 'ver' && !v) return false;
        if (fTipo.value && x.TipoNovedad !== fTipo.value) return false;
        return AP.coincide(x, q.value, ['Title', 'Lugar', 'Descripcion', 'Rondero', 'RonderoUsuario', 'TipoNovedad', function (r) { var w = ultima(ver, r); return w ? w.Resultado + ' ' + w.Nota + ' ' + (w.Acciones || '') : 'por verificar'; }]);
      }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
    }
    function pintar() {
      var l = filtradas(), por = datos.filter(function (x) { return !ultima(ver, x); }).length;
      out.replaceChildren(
        h('div', { class: 'kpis kpis-sm' }, kpi(datos.length, 'Novedades en el periodo', 'brand'), kpi(por, 'Por verificar', por ? 'warn' : 'ok'), kpi(datos.length - por, 'Verificadas', 'ok')),
        tabla([
          ['Fecha y hora', function (x) { return U.fDateTime(x.FechaHora); }],
          ['Lugar', function (x) { return h('div', null, h('strong', null, lugarDe(x)), h('small', { class: 'block muted' }, x.Origen === 'Reporte de novedad' ? 'Reporte sin punto de control' : x.Origen === 'QR' ? 'Punto de control (QR)' : 'Punto de control (sin QR)')); }],
          ['Novedad', function (x) { return h('div', null, AP.pill(x.TipoNovedad || 'Novedad', 'deny'), h('small', { class: 'block' }, x.Descripcion || '')); }],
          ['Reportó', function (x) { return h('div', null, x.Rondero || '', h('small', { class: 'block muted' }, rolTxt(x.Rol) || '')); }],
          ['Fotos', function (x) { var n = fotosDe(x).length; return n ? String(n) : ''; }],
          ['Verificación', function (x) { var v = ultima(ver, x), e = estadoVer(v); return h('div', null, AP.pill(e.t, e.k), v ? h('small', { class: 'block muted' }, U.fDateTime(v.FechaVerificacion || v.FechaHora)) : null); }],
          ['', function (x) {
            return h('div', { class: 'row gap nowrap' },
              ED ? h('button', { class: 'btn small', type: 'button', onclick: function () { verificar(x); } }, ultima(ver, x) ? 'Actualizar' : 'Verificar') : null,
              ADM ? h('button', { class: 'btn small', type: 'button', title: 'Informe en PDF o Word', onclick: function () { informeNovedad(x, ver.get(x.IdLocal) || []); } }, AP.icon('file', 16)) : null);
          }]
        ], l, detalle));
    }
    function detalle(x) {
      var fotos = fotosDe(x), vs = ver.get(x.IdLocal) || [];
      AP.modal({ title: 'Novedad — ' + lugarDe(x), size: 'wide', body: function (close) {
        return h('div', { class: 'stack' },
          h('div', { class: 'kv-grid' }, kv('Fecha y hora', U.fDateTime(x.FechaHora)), kv('Lugar', lugarDe(x)), kv('Origen', origenTxt(x)), kv('Tipo de novedad', x.TipoNovedad),
            kv('Descripción', x.Descripcion), kv('Justificación (sin QR)', x.Justificacion), kv('Reportó', (x.Rondero || '') + (x.RonderoUsuario ? ' (' + x.RonderoUsuario + ')' : '')), kv('Perfil', rolTxt(x.Rol)),
            kv('Registrado sin conexión', x.SinConexion ? 'Sí' : null), kv('Recepción en el servidor', x._created ? U.fDateTime(x._created) : null), kv('Id. registro', x.IdLocal)),
          h('div', { class: 'kv' }, h('span', null, 'Huella SHA-256 del registro'), h('strong', { class: 'mono' }, x.Hash || '—')),
          fotos.length ? h('h3', null, 'Fotografías') : null, fotos.length ? AP.Elem.galeria(fotos) : null,
          fotos.length ? h('p', { class: 'muted small' }, fotos.map(function (f) { return (f.etiqueta || f.nombre) + ': SHA-256 ' + f.sha256; }).join(' · ')) : null,
          h('h3', null, 'Verificación de la Dirección de Seguridad Integral'),
          vs.length ? h('div', { class: 'stack sm' }, vs.slice().reverse().map(function (v, i) {
            return h('div', { class: 'card stack xs' + (i ? ' muted' : '') }, h('div', { class: 'row gap wrap' }, AP.pill(v.Resultado, estadoVer(v).k), h('small', null, 'Verificada el ' + U.fDateTime(v.FechaVerificacion || v.FechaHora) + ' por ' + (v.VerificadoPor || '') + (i ? ' (anterior)' : ''))),
              h('p', null, v.Nota), v.Acciones ? h('p', { class: 'small' }, h('strong', null, 'Acciones: '), v.Acciones) : null);
          })) : h('p', { class: 'muted' }, 'Aún no se ha verificado.'),
          h('div', { class: 'row gap wrap end' },
            ED ? h('button', { class: 'btn', type: 'button', onclick: function () { close(); verificar(x); } }, AP.icon('check', 18), vs.length ? 'Actualizar la verificación' : 'Registrar la verificación') : null,
            ADM ? h('button', { class: 'btn primary', type: 'button', onclick: function () { close(); informeNovedad(x, vs); } }, AP.icon('file', 18), 'Informe en PDF o Word') : null));
      } });
    }
    function verificar(x) {
      var previa = ultima(ver, x);
      AP.modal({ title: 'Verificar novedad — ' + lugarDe(x), size: 'wide', body: function (close) {
        var cuando = AP.input('FechaVerificacion', U.toLocalInput(new Date()), { type: 'datetime-local' });
        var res = AP.select('Resultado', RESULTADOS, previa ? previa.Resultado : RESULTADOS[0]);
        var nota = AP.textarea('Nota', '', { rows: 4, placeholder: 'Qué verificó en el sitio, con quién y cómo (sin datos de salud ni datos personales innecesarios).' });
        var acc = AP.textarea('Acciones', '', { rows: 3, placeholder: 'Acciones adoptadas o pendientes, responsable y plazo (opcional).' });
        var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
          if (nota.value.trim().length < 10) return AP.toast('Describa lo que verificó (mínimo 10 caracteres).', 'warn');
          var fv = cuando.value ? new Date(cuando.value + ':00-05:00') : new Date();
          if (isNaN(fv) || fv < new Date(x.FechaHora) - 60000 || fv > new Date(Date.now() + 5 * 60000)) return AP.toast('La fecha de verificación debe estar entre la novedad y este momento.', 'warn');
          btn.disabled = true;
          try {
            var f = { IdLocal: U.uuid(), Title: lugarDe(x).slice(0, 200), RondaId: x.IdLocal, Origen: 'Ronda', Novedad: x.TipoNovedad || 'Novedad de ronda', Resultado: res.value, Nota: nota.value.trim(),
              Acciones: acc.value.trim() || undefined, FechaVerificacion: fv.toISOString(), VerificadoPor: AP.Session.user.nombre, FechaHora: new Date().toISOString() };
            Object.keys(f).forEach(function (k) { if (f[k] === undefined) delete f[k]; });
            f.Hash = await U.hashRecord(f);
            var rec = await AP.B.create('AP_Verificaciones', f);
            await AP.Audit.log('Verificación de novedad de ronda', lugarDe(x) + ' — ' + (x.TipoNovedad || ''), res.value + ': ' + f.Nota, f.Hash);
            if (!ver.has(x.IdLocal)) ver.set(x.IdLocal, []);
            ver.get(x.IdLocal).push(Object.assign({}, f, rec || {}));
            close(); AP.toast('Verificación registrada.'); pintar();
          } catch (e) { AP.toast(e.message, 'error'); btn.disabled = false; }
        } }, AP.icon('check', 18), 'Registrar verificación');
        return h('div', { class: 'stack' },
          h('p', null, h('strong', null, (x.TipoNovedad || 'Novedad') + ' — ' + lugarDe(x)), ' (' + U.fDateTime(x.FechaHora) + ', reportó ' + (x.Rondero || '') + ')'),
          x.Descripcion ? h('p', { class: 'muted' }, x.Descripcion) : null,
          previa ? h('div', { class: 'banner info' }, AP.icon('history', 18), h('span', null, 'Ya tiene una verificación (' + previa.Resultado + ', ' + U.fDateTime(previa.FechaVerificacion || previa.FechaHora) + '). La nueva queda como actualización; la anterior se conserva.')) : null,
          h('div', { class: 'form-grid' }, AP.field('Fecha y hora de la verificación', cuando), AP.field('Resultado', res),
            AP.field('Lo que verificó *', nota, null, 'span2'), AP.field('Acciones adoptadas', acc, null, 'span2')),
          h('p', { class: 'help' }, 'La verificación no modifica el registro de quien reportó: queda aparte, con su nombre, la fecha y su huella SHA-256, y sale en el informe de la novedad.'),
          h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
      } });
    }
    async function consultar() {
      var a = U.fromLocal(desde.value, '00:00'), b = U.fromLocal(hasta.value, '23:59');
      if (!a || !b || b < a) return AP.toast('Revise el rango de fechas.', 'warn');
      out.replaceChildren(AP.spinner('Consultando…'));
      try {
        var r = await Promise.all([AP.B.listRange('AP_Rondas', 'FechaHora', a, new Date(b.getTime() + 59999)), verificaciones(a)]);
        datos = r[0].filter(function (x) { return x.Novedad; }); ver = r[1];
        pintar();
      } catch (e) { out.replaceChildren(errBox(e)); }
    }
    [fEst, fTipo].forEach(function (s) { s.addEventListener('change', pintar); });
    box.replaceChildren(
      h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null, 'Aquí llegan las novedades reportadas en las rondas, tanto al marcar un punto como con «Reportar novedad». Registre su verificación (lo que constató, el resultado y las acciones) y genere el informe en PDF o Word, en español o en inglés, dirigido a la Asamblea General de Accionistas y a la Gerencia General.')),
      h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta), fEst, fTipo, q,
        h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar'),
        AP.btnExcel(function () {
          var l = filtradas();
          if (!l.length) return AP.toast('No hay novedades con el filtro actual.', 'warn');
          AP.exportar('Novedades_de_ronda', [
            ['Fecha', function (x) { return U.toDate(x.FechaHora); }, 17], ['Lugar', lugarDe, 30], ['Origen', function (x) { return origenTxt(x); }, 30], ['Tipo de novedad', function (x) { return x.TipoNovedad; }, 26],
            ['Descripción', function (x) { return x.Descripcion; }, 50], ['Reportó', function (x) { return x.Rondero; }, 26], ['Perfil', function (x) { return rolTxt(x.Rol); }, 18], ['Fotografías', function (x) { return fotosDe(x).length; }, 10],
            ['Verificación', function (x) { var v = ultima(ver, x); return v ? v.Resultado : 'Por verificar'; }, 26], ['Fecha de la verificación', function (x) { var v = ultima(ver, x); return v ? U.toDate(v.FechaVerificacion || v.FechaHora) : ''; }, 17],
            ['Lo verificado', function (x) { var v = ultima(ver, x); return v ? v.Nota : ''; }, 50], ['Acciones', function (x) { var v = ultima(ver, x); return v ? v.Acciones : ''; }, 40],
            ['Id. registro', function (x) { return x.IdLocal; }, 38], ['Huella SHA-256', function (x) { return x.Hash; }, 66]
          ], l, 'xlsx', [['Periodo', desde.value + ' a ' + hasta.value], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Colecciones AP_Rondas y AP_Verificaciones']]);
        })),
      out);
    consultar();
  };

  // =================== INFORME DE UNA NOVEDAD (PDF o Word, español o inglés) ===================
  function informeNovedad(x, vs) {
    var IN = I();
    AP.modal({ title: 'Informe de la novedad — ' + lugarDe(x), size: 'wide', body: function (close) {
      var idioma = AP.select('idioma', [['es', 'Español'], ['en', 'English (inglés)']], 'es');
      var paraDef = { es: 'Asamblea General de Accionistas y Gerencia General — ' + AP.CFG.empresa, en: "General Shareholders' Meeting and General Management — " + AP.CFG.empresa };
      var asuntoDef = function (l) { return l === 'en' ? 'Security incident report: ' + (TIPO_EN[x.TipoNovedad] || x.TipoNovedad || 'incident') + ' at ' + lugarDe(x) + ' (' + IN.fechaHora(x.FechaHora, 'en').slice(0, 10) + ')' : 'Novedad de seguridad: ' + (x.TipoNovedad || 'novedad') + ' en ' + lugarDe(x) + ' (' + U.fDate(x.FechaHora) + ')'; };
      var para = AP.input('para', paraDef.es), asunto = AP.input('asunto', asuntoDef('es'));
      var clas = AP.select('clas', IN.CLASIFICACIONES.es, IN.CLASIFICACIONES.es[0]);
      var cons = AP.textarea('consideraciones', '', { rows: 4, placeholder: 'Opcional. Su análisis, conclusiones o recomendaciones; se presentan separadas de los hechos reportados y de la verificación.' });
      var prob = AP.check('probatorio', 'Incluir advertencia de destinación a eventual actuación judicial, administrativa o disciplinaria', false);
      var editado = { para: false, asunto: false };
      para.addEventListener('input', function () { editado.para = true; }); asunto.addEventListener('input', function () { editado.asunto = true; });
      idioma.addEventListener('change', function () {
        var l = idioma.value, i0 = clas.selectedIndex;
        if (!editado.para) para.value = paraDef[l];
        if (!editado.asunto) asunto.value = asuntoDef(l);
        clas.replaceChildren.apply(clas, IN.CLASIFICACIONES[l].map(function (c) { return h('option', { value: c }, c); }));
        clas.selectedIndex = Math.max(0, i0);
      });
      var firmaInfo = h('p', { class: 'muted small' }, 'Consultando su firma escaneada…');
      IN.firma().then(function (f) { firmaInfo.replaceChildren(f ? 'El informe sale con su firma escaneada.' : h('span', { class: 'txt-warn' }, 'No ha cargado su firma escaneada: el informe sale con el espacio para firmar a mano. Cárguela en Consola › Informe mensual.')); });
      async function gen(formato, btn) {
        var txt = btn.lastChild.textContent;
        btn.disabled = true; btn.lastChild.textContent = 'Generando…';
        try {
          var m = await modeloNovedad(x, vs, { idioma: idioma.value, para: para.value.trim(), asunto: asunto.value.trim(), clasificacion: clas.value, consideraciones: cons.value.trim(), probatorio: prob.querySelector('input').checked });
          await IN.descargar(m, formato, 'Informe_novedad_' + U.safeName(lugarDe(x)).slice(0, 40) + '_' + U.ymd(x.FechaHora), ['Informe de novedad de ronda', 'Registro ' + x.IdLocal + ' · ' + (x.TipoNovedad || '') + ' · para: ' + para.value.trim() + ' · ' + clas.value]);
        } catch (e) { console.error(e); AP.toast('No se pudo generar el informe: ' + e.message, 'error', 9000); }
        finally { btn.disabled = false; btn.lastChild.textContent = txt; }
      }
      var bPdf = h('button', { class: 'btn primary', type: 'button', onclick: function () { gen('pdf', bPdf); } }, AP.icon('file', 18), 'Descargar PDF');
      var bWord = h('button', { class: 'btn', type: 'button', onclick: function () { gen('word', bWord); } }, AP.icon('word', 18), 'Descargar Word');
      return h('div', { class: 'stack' },
        !vs.length ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, 'Esta novedad aún no tiene su verificación: el informe dirá «pendiente de verificación». Puede registrarla primero.')) : null,
        h('p', { class: 'muted small' }, 'Estructura del modelo de informe de la Dirección: encabezado, memorando, antecedentes, hechos reportados, registro fotográfico, verificación de la Dirección, fuentes e integridad y firma. En inglés se traducen los títulos y los textos de la aplicación; lo escrito por quien reportó y por usted se transcribe tal como se registró.'),
        h('div', { class: 'form-grid' }, AP.field('Idioma del informe', idioma), AP.field('Clasificación', clas), AP.field('Para', para, null, 'span2'), AP.field('Asunto', asunto, null, 'span2'),
          AP.field('Consideraciones de la Dirección de Seguridad Integral', cons, null, 'span2'), h('div', { class: 'field span2' }, prob)),
        firmaInfo,
        h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cerrar'), bWord, bPdf));
    } });
  }

  async function modeloNovedad(x, vs, o) {
    var IN = I(), L = o.idioma, T = IN.tr(L), en = L === 'en';
    var hoy = new Date(), nombre = AP.Session.user.nombre, cargo = IN.cargo();
    var fotos = fotosDe(x), items = [];
    for (var k = 0; k < fotos.length; k++) {
      var f = fotos[k], dat = null;
      try { dat = await AP.B.fileData(f.ruta); } catch (e) { dat = null; }
      var etq = f.tipo === 'lugar' || f.etiqueta === 'Lugar' ? T('Lugar', 'Place') : /^Lugar y/.test(f.etiqueta || '') ? T('Lugar y novedad', 'Place and incident') : T('Novedad', 'Incident') + ' ' + (f.etiqueta || '').replace(/\D+/g, '');
      items.push({ bytes: dat ? dat.bytes : null, type: dat ? dat.type : 'image/jpeg', pie: T('Fotografía ', 'Photograph ') + (k + 1) + '. ' + etq, sub: 'SHA-256: ' + (f.sha256 || '—'), falta: T('(Ya no está en la nube: consulte el archivo fotográfico del mes)', '(No longer stored online: see the monthly photo archive)') });
    }
    var tipo = en ? (TIPO_EN[x.TipoNovedad] || x.TipoNovedad) : x.TipoNovedad;
    var quien = (x.Rondero || '—') + (x.RonderoUsuario ? T(' (usuario ', ' (user ') + x.RonderoUsuario + ')' : '');
    var v = vs.length ? vs[vs.length - 1] : null;
    var B = [];
    B.push({ t: 'cab', lugarFecha: 'La Ceja (Antioquia), ' + IN.fechaLarga(hoy, L), titulo: T('INFORME DE NOVEDAD DE SEGURIDAD', 'SECURITY INCIDENT REPORT'), subtitulo: (tipo || '') + ' — ' + lugarDe(x) });
    B.push({ t: 'memo', filas: [[T('PARA:', 'TO:'), o.para || '—'], [T('DE:', 'FROM:'), nombre + ' — ' + (en ? IN.cargoEn(cargo) : cargo)], [T('FECHA:', 'DATE:'), IN.fechaLarga(hoy, L, true)],
      [T('ASUNTO:', 'SUBJECT:'), o.asunto || ''], [T('REFERENCIA:', 'REFERENCE:'), T('Registro de ronda ', 'Patrol record ') + x.IdLocal], [T('CLASIFICACIÓN:', 'CLASSIFICATION:'), o.clasificacion, true]] });
    B.push({ t: 'h', texto: T('Antecedentes', 'Background') });
    var como = x.Origen === 'Reporte de novedad' ? T('mediante la opción «Reportar novedad», fuera de un punto de control', 'through the "Report incident" option, outside a checkpoint')
      : x.Origen === 'QR' ? T('al marcar el punto de control «' + x.Title + '» mediante la lectura de su código QR', 'while checking in at checkpoint "' + x.Title + '" by reading its QR code')
        : T('al marcar el punto de control «' + x.Title + '» sin lectura de su código QR, con la justificación: «' + (x.Justificacion || '') + '»', 'while checking in at checkpoint "' + x.Title + '" without reading its QR code, with the justification: "' + (x.Justificacion || '') + '"');
    B.push({ t: 'p', texto: T('El ', 'On ') + IN.fechaLarga(x.FechaHora, L, true) + ', ' + quien + (x.Rol ? ', ' + rolTxt(x.Rol, L) : '') +
      T(', registró en la aplicación de control de acceso de ' + AP.CFG.empresa + ', durante la ronda de seguridad, una novedad en «' + lugarDe(x) + '», ' + como + '. ',
        ', recorded an incident at "' + lugarDe(x) + '" in the access control application of ' + AP.CFG.empresa + ' during the security patrol, ' + como + '. ') +
      (x._created ? T('El servidor recibió el registro el ' + U.fDateTime(x._created) + (x._createdBy ? ', enviado por el usuario ' + x._createdBy : '') + '. ', 'The server received the record on ' + IN.fechaHora(x._created, 'en') + (x._createdBy ? ', sent by user ' + x._createdBy : '') + '. ') : '') +
      (x.SinConexion ? T('El registro se hizo sin conexión y se envió al restablecerse la señal.', 'The record was made offline and sent once the connection was restored.') : '') });
    B.push({ t: 'h', texto: T('Hechos reportados', 'Reported facts') });
    var filas = [[T('Fecha y hora', 'Date and time'), IN.fechaHora(x.FechaHora, L)], [T('Lugar', 'Place'), lugarDe(x)], [T('Origen del registro', 'Record origin'), origenTxt(x, L)],
      [T('Tipo de novedad', 'Incident type'), tipo], [T('Descripción', 'Description'), x.Descripcion], [T('Reportó', 'Reported by'), quien + (x.Rol ? ' — ' + rolTxt(x.Rol, L) : '')],
      [T('Dispositivo', 'Device'), x.Dispositivo]].filter(function (f) { return f[1]; }).map(function (f) { return [{ t: f[0], b: true, fill: '#F3F6F1' }, f[1]]; });
    B.push({ t: 'tabla', filas: filas, anchos: [3200, 6438] });
    B.push({ t: 'p', size: 9, color: '#6F7A6B', texto: T('Este numeral transcribe lo consignado por quien reportó la novedad; no contiene conclusiones de esta Dirección.', 'This section transcribes what the reporting person recorded; it contains no conclusions of this Department.') });
    B.push({ t: 'h', texto: T('Registro fotográfico', 'Photographic record') });
    if (items.length) {
      B.push({ t: 'p', texto: T('Fotografías tomadas en el momento con la cámara de la aplicación, que no admite imágenes de la galería del celular; cada una lleva impresos la fecha, la hora y el lugar, y su huella SHA-256 quedó en el registro.', 'Photographs taken on the spot with the application camera, which does not accept images from the phone gallery; each one bears the date, time and place, and its SHA-256 fingerprint was stored in the record.') });
      B.push({ t: 'fotos', items: items });
    } else B.push({ t: 'p', texto: T('El registro no tiene fotografías.', 'The record has no photographs.') });
    B.push({ t: 'h', texto: T('Verificación de la Dirección de Seguridad Integral', 'Verification by the Integral Security Department') });
    if (v) {
      B.push({ t: 'tabla', anchos: [3200, 6438], filas: [
        [T('Fecha de la verificación', 'Verification date'), IN.fechaHora(v.FechaVerificacion || v.FechaHora, L)], [T('Resultado', 'Result'), en ? (RESULTADO_EN[v.Resultado] || v.Resultado) : v.Resultado],
        [T('Lo verificado', 'Findings'), v.Nota], [T('Acciones adoptadas', 'Actions taken'), v.Acciones || T('Sin acciones registradas.', 'No actions recorded.')], [T('Verificó', 'Verified by'), v.VerificadoPor],
        [T('Registro de la verificación', 'Verification record'), IN.fechaHora(v.FechaHora, L) + ' · ' + (v.IdLocal || '')]
      ].map(function (f) { return [{ t: f[0], b: true, fill: '#F3F6F1' }, f[1]]; }) });
      if (vs.length > 1) B.push({ t: 'p', size: 9, color: '#6F7A6B', texto: T('Verificaciones anteriores: ', 'Previous verifications: ') + vs.slice(0, -1).map(function (w) { return IN.fechaHora(w.FechaVerificacion || w.FechaHora, L) + ' — ' + (en ? (RESULTADO_EN[w.Resultado] || w.Resultado) : w.Resultado) + ': ' + w.Nota; }).join(' · ') });
    } else B.push({ t: 'p', b: true, color: '#9A6400', texto: T('Pendiente de verificación a la fecha de este informe.', 'Pending verification as of the date of this report.') });
    B.push({ t: 'h', texto: T('Fuentes e integridad del registro', 'Sources and record integrity') });
    B.push({ t: 'p', texto: T('Fuente documental: registro electrónico de ronda (colección AP_Rondas) y registro de verificación (colección AP_Verificaciones) de la aplicación de control de acceso de ' + AP.CFG.empresa + '. Ambos son de solo agregar: no se modifican ni se borran, y la hora de recepción y el usuario los fija el servidor.',
      'Documentary source: electronic patrol record (AP_Rondas collection) and verification record (AP_Verificaciones collection) of the access control application of ' + AP.CFG.empresa + '. Both are append-only: they cannot be modified or deleted, and the reception time and user are set by the server.') +
      (en ? ' Entries typed into the system (place, description, findings and actions) are reproduced as originally recorded, in Spanish.' : '') });
    var fi = [[T('Identificador del registro', 'Record identifier'), x.IdLocal], [T('Huella SHA-256 del registro', 'Record SHA-256 fingerprint'), { t: x.Hash || '—', size: 7.5 }],
      [T('Usuario que lo envió (verificado por el servidor)', 'Sending user (verified by the server)'), x._createdBy || '—'], [T('Recepción en el servidor', 'Server reception'), x._created ? IN.fechaHora(x._created, L) : '—'],
      [T('Fotografías', 'Photographs'), fotos.length + T(' (cada una con su huella SHA-256, verificable contra el archivo conservado)', ' (each with its SHA-256 fingerprint, verifiable against the stored file)')]];
    if (v) fi.push([T('Huella SHA-256 de la verificación', 'Verification SHA-256 fingerprint'), { t: v.Hash || '—', size: 7.5 }]);
    B.push({ t: 'tabla', anchos: [3600, 6038], size: 9, filas: fi.map(function (f) { return [{ t: f[0], b: true, fill: '#F3F6F1' }, f[1]]; }) });
    if (o.consideraciones) {
      B.push({ t: 'h', texto: T('Consideraciones de la Dirección de Seguridad Integral', 'Considerations of the Integral Security Department') });
      o.consideraciones.split(/\n{2,}/).forEach(function (pp) { B.push({ t: 'p', texto: pp.trim() }); });
    }
    if (o.probatorio) B.push({ t: 'aviso', titulo: T('Advertencia.', 'Notice.'), texto: T('El presente informe se expide para sustentar eventual actuación judicial, administrativa o disciplinaria. Su contenido y sus anexos se conservan en su forma original; cualquier alteración puede verificarse mediante las huellas SHA-256 indicadas.', 'This report is issued to support possible judicial, administrative or disciplinary proceedings. Its content and annexes are kept in their original form; any alteration can be verified through the SHA-256 fingerprints indicated.') });
    var fm = await IN.firma();
    B.push({ t: 'firma', texto: T('Se expide el presente informe en La Ceja (Antioquia), el ' + IN.fechaLarga(hoy, L) + ', con base en los registros descritos.', 'This report is issued in La Ceja (Antioquia), on ' + IN.fechaLarga(hoy, L) + ', based on the records described above.'),
      cierre: T('Atentamente,', 'Sincerely,'), img: fm, nombre: nombre, cargo: en ? IN.cargoEn(cargo) : cargo });
    return { idioma: L, titulo: T('Informe de novedad de seguridad', 'Security incident report') + ' — ' + lugarDe(x), autor: nombre + ' — ' + cargo, clasificacion: o.clasificacion, bloques: B,
      pieTexto: T('Informe generado el ' + U.fDateTime(hoy) + ' desde la aplicación de control de acceso · registro ' + String(x.IdLocal).slice(0, 8), 'Report generated on ' + IN.fechaHora(hoy, 'en') + ' from the access control application · record ' + String(x.IdLocal).slice(0, 8)) };
  }

  // =================== FOTOGRAFÍAS DE RONDA: ESPACIO, ARCHIVO MENSUAL Y LIBERACIÓN ===================
  var CUOTA = 1024 * 1024 * 1024;   // 1 GiB gratuito de Firestore (todos los registros de la aplicación)
  var BASE64 = 4 / 3;               // las fotos se guardan como texto base64
  function mesesAtras(n) {
    var p = U.partsCO(), y = Number(p.year), m = Number(p.month), out = [];
    for (var i = 0; i < n; i++) { out.push(y + '-' + String(m).padStart(2, '0')); m--; if (!m) { m = 12; y--; } }
    return out;
  }
  function rangoMes(ym) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)), fin = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { a: U.fromLocal(ym + '-01', '00:00'), b: new Date(U.fromLocal(ym + '-' + String(fin).padStart(2, '0'), '23:59').getTime() + 59999), dias: fin };
  }
  function mb(bytes) { return (bytes / 1048576).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' MB'; }
  function pesoFoto(f) { return (Number(f.bytes) || 450000) * BASE64; }   // fotos antiguas sin tamaño registrado: hasta ~450 KB
  async function bitacoraDe(accion) {
    try { return await AP.B.consulta('AP_Bitacora', [['Accion', '==', accion]], { limite: 500, probar: true }); } catch (e) { return []; }
  }

  AP.Rondas.tabFotos = function (box) {
    var ADM = AP.Session.can('admin');
    var meses = mesesAtras(4);
    var fMes = AP.select('mes', meses.map(function (ym) { return [ym, I().nombreMes(ym, 'es')]; }), meses[1]);
    var out = h('div', { class: 'stack' });
    var resumen = h('div', { class: 'stack' });
    var marcas = [], archivados = [], liberados = [];
    async function cargarResumen() {
      resumen.replaceChildren(AP.spinner('Calculando el espacio de las fotografías…'));
      try {
        var r = rangoMes(meses[meses.length - 1]), b = rangoMes(meses[0]).b;
        var res = await Promise.all([AP.B.listRange('AP_Rondas', 'FechaHora', r.a, b), bitacoraDe('Archivo fotográfico mensual de rondas'), bitacoraDe('Liberación de fotografías de ronda')]);
        var todas = res[0]; archivados = res[1]; liberados = res[2];
        var filas = meses.map(function (ym) {
          var l = todas.filter(function (x) { return U.ymd(x.FechaHora).slice(0, 7) === ym; });
          var lib = liberados.some(function (z) { return z.Referencia === ym; });
          var fotos = 0, peso = 0, pesoLib = 0;
          l.forEach(function (x) { fotosDe(x).forEach(function (f) { fotos++; var p = pesoFoto(f); peso += p; if (lib && !x.Novedad) pesoLib += p; }); });
          return { ym: ym, marcas: l.length, fotos: fotos, peso: peso, nube: peso - pesoLib, archivado: archivados.some(function (z) { return z.Referencia === ym; }), liberado: lib };
        });
        var nube = filas.reduce(function (a, f) { return a + f.nube; }, 0), pct = Math.round(nube / CUOTA * 100);
        resumen.replaceChildren(
          h('section', { class: 'card stack sm' },
            h('h3', null, 'Espacio de las fotografías de ronda en la nube (cálculo aproximado)'),
            h('div', { class: 'medidor ' + (pct >= 70 ? 'deny' : pct >= 45 ? 'warn' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('span', { style: { width: Math.min(100, Math.max(1, pct)) + '%' } })),
            h('p', { class: 'small' }, h('strong', null, mb(nube)), ' de los 1.024 MB gratuitos de la base de datos (' + pct + ' %), contando solo las fotos de los últimos 4 meses. Los demás registros de la aplicación también ocupan parte de ese espacio.'),
            h('p', { class: 'help' }, 'Para no pagar: cada mes descargue el archivo fotográfico del mes anterior (ZIP con cada foto y su huella SHA-256) y guárdelo en el equipo o en la nube de la empresa; después libere el espacio de ese mes. Se borran de la nube solo las fotos de marcaciones sin novedad; las de novedades se conservan. El registro de cada marcación y la huella de su foto no se borran, así que cualquier foto archivada puede verificarse.')),
          tabla([
            ['Mes', function (f) { return h('strong', null, I().nombreMes(f.ym, 'es')); }],
            ['Marcaciones', function (f) { return String(f.marcas); }],
            ['Fotos', function (f) { return String(f.fotos); }],
            ['Peso aproximado', function (f) { return mb(f.peso); }],
            ['Archivo fotográfico', function (f) { return f.archivado ? AP.pill('Descargado', 'ok') : AP.pill('Sin descargar', f.ym === meses[0] ? 'muted' : 'warn'); }],
            ['Nube', function (f) { return f.liberado ? AP.pill('Espacio liberado', 'ok') : AP.pill('En la nube', 'muted'); }]
          ], filas));
      } catch (e) { resumen.replaceChildren(errBox(e)); }
    }
    async function delMes(ym) {
      var r = rangoMes(ym);
      var l = await AP.B.listRange('AP_Rondas', 'FechaHora', r.a, r.b);
      return l.filter(function (x) { return fotosDe(x).length; }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? -1 : 1; });
    }
    function progreso(texto) { var p = h('p', { class: 'muted small' }, texto); out.replaceChildren(p); return p; }
    async function archivar() {
      var ym = fMes.value, nom = I().nombreMes(ym, 'es');
      var p = progreso('Consultando las marcaciones de ' + nom + '…');
      try {
        marcas = await delMes(ym);
        var lista = [];
        marcas.forEach(function (x) { fotosDe(x).forEach(function (f) { lista.push({ x: x, f: f }); }); });
        if (!lista.length) { out.replaceChildren(); return AP.toast('No hay fotografías de ronda en ' + nom + '.', 'warn'); }
        var archivos = [], filas = [['Fecha', 'Hora', 'Lugar o punto', 'Origen', 'Registró', 'Usuario', 'Novedad', 'Tipo de novedad', 'Foto', 'Archivo', 'SHA-256 registrado', 'SHA-256 del archivo', 'Estado', 'Id. registro']];
        var ok = 0, faltan = 0, distintas = 0;
        for (var i = 0; i < lista.length; i++) {
          var it = lista[i], x = it.x, f = it.f;
          p.textContent = 'Descargando la foto ' + (i + 1) + ' de ' + lista.length + '…';
          var dat = null;
          try { dat = await AP.B.fileData(f.ruta); } catch (e) { dat = null; }
          var pc = U.partsCO(x.FechaHora);
          var nombre = pc.year + '-' + pc.month + '-' + pc.day + '/' + pc.hour + pc.minute + pc.second + '_' + U.safeName(lugarDe(x)).slice(0, 40) + '_' + U.safeName(x.RonderoUsuario || x.Rondero || '').slice(0, 20) + '_' + (f.nombre || 'foto.jpg');
          var estado, sha = '';
          if (!dat) { estado = 'No está en la nube'; faltan++; }
          else {
            sha = await U.sha256(new Blob([dat.bytes]));
            if (sha === f.sha256) { estado = 'Íntegra'; ok++; } else { estado = 'LA HUELLA NO COINCIDE'; distintas++; }
            archivos.push({ name: nombre, data: dat.bytes });
          }
          filas.push([pc.day + '/' + pc.month + '/' + pc.year, pc.hour + ':' + pc.minute + ':' + pc.second, lugarDe(x), x.Origen || '', x.Rondero || '', x.RonderoUsuario || '', x.Novedad ? 'Sí' : 'No', x.TipoNovedad || '', f.etiqueta || '', dat ? nombre : '', f.sha256 || '', sha, estado, x.IdLocal]);
        }
        var csv = '﻿' + filas.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'); }).join('\r\n');
        var leeme = 'AVO PAK S.A.S. — DIRECCIÓN DE SEGURIDAD INTEGRAL\r\nArchivo fotográfico de las rondas de seguridad — ' + nom + '\r\n\r\n' +
          'Generado el ' + U.fDateTime(new Date()) + ' por ' + AP.Session.user.nombre + ' desde la aplicación de control de acceso.\r\n' +
          'Fotografías: ' + lista.length + ' (íntegras: ' + ok + '; ya no estaban en la nube: ' + faltan + '; con huella distinta: ' + distintas + ').\r\n\r\n' +
          'Cada fotografía se tomó en el momento con la cámara de la aplicación (sin galería) y lleva impresos la fecha, la hora, el lugar y el usuario.\r\n' +
          'El archivo «indice.csv» relaciona cada foto con su marcación y con la huella SHA-256 que quedó en el registro (colección AP_Rondas), que no se modifica ni se borra.\r\n' +
          'Para verificar una foto, calcule su SHA-256 (por ejemplo, en Windows: certutil -hashfile archivo.jpg SHA256) y compárela con la columna «SHA-256 registrado».\r\n' +
          'Conserve este archivo en un lugar seguro de la empresa: después de liberar el espacio, las fotos de marcaciones sin novedad ya no estarán en la nube.\r\n';
        archivos.unshift({ name: 'indice.csv', data: csv }, { name: 'LEEME.txt', data: leeme });
        p.textContent = 'Armando el archivo ZIP…';
        var zipBlob = AP.Docx.zip(archivos, 'application/zip');
        var hash = await U.sha256(zipBlob);
        var nzip = 'Archivo_fotografico_rondas_' + ym + '.zip';
        U.download(zipBlob, nzip);
        await AP.Audit.log('Archivo fotográfico mensual de rondas', ym, nzip + ' · ' + lista.length + ' fotos (íntegras ' + ok + ', fuera de la nube ' + faltan + ', huella distinta ' + distintas + ') · ' + mb(zipBlob.size), hash);
        out.replaceChildren(h('div', { class: 'banner ' + (distintas ? 'deny' : 'info') }, AP.icon(distintas ? 'alert' : 'check', 18), h('span', null,
          'Se descargó ' + nzip + ' (' + mb(zipBlob.size) + '): ' + ok + ' fotos íntegras' + (faltan ? ', ' + faltan + ' que ya no estaban en la nube' : '') + (distintas ? ', ' + distintas + ' CON HUELLA DISTINTA (revise el índice)' : '') + '. Guárdelo en un lugar seguro de la empresa antes de liberar el espacio. Su huella SHA-256 quedó en la bitácora.')));
        cargarResumen();
      } catch (e) { out.replaceChildren(errBox(e)); }
    }
    async function liberar() {
      var ym = fMes.value, nom = I().nombreMes(ym, 'es');
      if (ym >= meses[0]) return AP.toast('El mes en curso no se puede liberar: espere a que termine y descargue primero su archivo fotográfico.', 'warn', 8000);
      if (!archivados.some(function (z) { return z.Referencia === ym; })) return AP.toast('Primero descargue el archivo fotográfico de ' + nom + ' y guárdelo en un lugar seguro.', 'warn', 8000);
      var p = progreso('Consultando las fotografías de ' + nom + '…');
      try {
        marcas = await delMes(ym);
        var borrar = [];
        marcas.filter(function (x) { return !x.Novedad; }).forEach(function (x) { fotosDe(x).forEach(function (f) { if (f.ruta) borrar.push(f.ruta); }); });
        out.replaceChildren();
        if (!borrar.length) return AP.toast('No hay fotos de marcaciones sin novedad en ' + nom + '.', 'info');
        if (!(await AP.confirm('Liberar espacio de ' + nom, 'Se borrarán de la nube ' + borrar.length + ' fotos de marcaciones SIN novedad de ' + nom + '. Las fotos de novedades se conservan, y cada marcación conserva la huella SHA-256 de su foto. Confirme que ya guardó el archivo fotográfico del mes en un lugar seguro. Esta acción no se puede deshacer.', 'Liberar espacio', 'danger'))) return;
        p = progreso('Liberando…');
        var hechas = 0, yaNo = 0;
        for (var i = 0; i < borrar.length; i++) {
          p.textContent = 'Liberando la foto ' + (i + 1) + ' de ' + borrar.length + '…';
          try { await AP.B.borrarArchivo(borrar[i]); hechas++; }
          catch (e) {
            if (e.status === 403 || /permis/i.test(e.message || '')) {
              out.replaceChildren(h('div', { class: 'banner deny' }, AP.icon('lock', 18), h('span', null, 'Firebase no permitió borrar las fotos: falta publicar la regla nueva de la base de datos (paso único en la consola de Firebase, Firestore Database › Reglas). Las ' + hechas + ' fotos liberadas antes de este aviso quedaron liberadas.')));
              if (hechas) await AP.Audit.log('Liberación de fotografías de ronda', ym, hechas + ' de ' + borrar.length + ' fotos liberadas (interrumpida por permisos)');
              return;
            }
            yaNo++;
          }
        }
        await AP.Audit.log('Liberación de fotografías de ronda', ym, hechas + ' fotos de marcaciones sin novedad borradas de la nube' + (yaNo ? ' (' + yaNo + ' no se pudieron borrar)' : '') + '. Se conservan los registros y las huellas SHA-256; las fotos están en el archivo fotográfico del mes.');
        out.replaceChildren(h('div', { class: 'banner info' }, AP.icon('check', 18), h('span', null, 'Espacio liberado: ' + hechas + ' fotos de ' + nom + ' borradas de la nube' + (yaNo ? ' (' + yaNo + ' no se pudieron borrar; repita más tarde)' : '') + '.')));
        cargarResumen();
      } catch (e) { out.replaceChildren(errBox(e)); }
    }
    box.replaceChildren(resumen,
      h('section', { class: 'card stack sm' }, h('h3', null, 'Archivo fotográfico mensual'),
        h('div', { class: 'filters' }, AP.field('Mes', fMes),
          h('button', { class: 'btn primary', type: 'button', onclick: archivar }, AP.icon('download', 18), 'Descargar archivo fotográfico (ZIP)'),
          ADM ? h('button', { class: 'btn danger-outline', type: 'button', onclick: liberar }, AP.icon('trash', 18), 'Liberar espacio de ese mes') : null),
        h('p', { class: 'help' }, 'El ZIP trae cada foto en una carpeta por día, un índice (indice.csv) con la marcación y la huella SHA-256 de cada foto (verificada al descargar) y un archivo LEEME con las instrucciones. Se descarga en este equipo: puede tardar varios minutos si el mes tiene muchas fotos.'),
        out));
    cargarResumen();
  };

  // =================== INFORME MENSUAL DE SEGURIDAD ===================
  function ymActual() { return U.ymd().slice(0, 7); }
  function ymAnterior(ym) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1; if (!m) { m = 12; y--; } return y + '-' + String(m).padStart(2, '0'); }
  function ultimoDia() { var r = rangoMes(ymActual()); return Number(U.ymd().slice(8, 10)) === r.dias; }
  // Mes que corresponde informar: el mes en curso desde su último día; antes, el mes anterior
  function mesPorInformar() { return ultimoDia() ? ymActual() : ymAnterior(ymActual()); }
  function marcado(ym) { try { return localStorage.getItem('ap:informe-mensual:' + ym) === '1'; } catch (e) { return false; } }
  function marcar(ym) { try { localStorage.setItem('ap:informe-mensual:' + ym, '1'); } catch (e) { /* sin almacenamiento */ } }

  AP.InformeMensual = {
    // Aviso en la consola del Director: desde el último día del mes y hasta el día 5 del siguiente, si aún no lo ha generado
    aviso: function () {
      if (!AP.Session.can('admin') || location.hash.indexOf('#/consola/informe-mensual') === 0) return null;
      var dia = Number(U.ymd().slice(8, 10)), ym = mesPorInformar();
      if (!(ultimoDia() || dia <= 5) || marcado(ym)) return null;
      return h('div', { class: 'banner info' }, AP.icon('file', 18), h('span', null, 'El informe mensual de seguridad de ' + I().nombreMes(ym, 'es') + ' ya se puede generar.'),
        h('a', { class: 'btn small', href: '#/consola/informe-mensual?mes=' + ym }, 'Generarlo'));
    }
  };

  function cuenta(l, clave) {
    var m = {};
    l.forEach(function (x) { var k = typeof clave === 'function' ? clave(x) : x[clave]; if (k == null || k === '') return; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { k: k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n || (a.k < b.k ? -1 : 1); });
  }
  function esVisitante(m) { return m.RefLista === 'AP_Visitas' || /Visitante/.test(m.Categoria || ''); }
  var TIPOS_NOV = [
    [/llegada tard|ingreso tard/i, 'Llegada tardía', 'Late arrival'], [/muy temprano|antes del horario/i, 'Llegada muy temprano', 'Very early arrival'], [/fuera de turno|fuera del horario/i, 'Ingreso fuera de turno', 'Entry outside shift'],
    [/d[ií]a no programado/i, 'Día no programado', 'Unscheduled day'], [/ausencia/i, 'Ingreso durante ausencia', 'Entry during absence'], [/salida no autorizada/i, 'Salida no autorizada', 'Unauthorized exit'],
    [/sin lectura de qr/i, 'Sin lectura de QR', 'No QR read'], [/alerta de salida/i, 'Salida con alerta del Director', 'Exit with Director alert'], [/vencimiento|vencid/i, 'Vigencia vencida', 'Expired validity'],
    [/sin salida registrada/i, 'Ingreso anterior sin salida', 'Previous entry without exit'], [/elemento/i, 'Elementos', 'Items'], [/./, 'Otras novedades', 'Other']];
  function tipoNov(t, en) { var x = TIPOS_NOV.find(function (r) { return r[0].test(t); }); return x ? x[en ? 2 : 1] : en ? 'Other' : 'Otras novedades'; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function variacion(a, b, en) {
    if (!b) return en ? 'no comparison (no data for the previous month)' : 'sin comparación (el mes anterior no tiene datos)';
    var v = Math.round((a - b) / b * 100);
    return (v > 0 ? '+' : '') + v + (en ? ' % vs. previous month' : ' % frente al mes anterior');
  }
  function n0(v) { return Number(v || 0).toLocaleString('es-CO'); }

  // Datos del mes y del mes anterior (para comparar)
  async function datosMes(ym) {
    var r = rangoMes(ym), rp = rangoMes(ymAnterior(ym)), B = AP.B;
    var hasta = new Date(Math.min(r.b.getTime(), Date.now()));
    var maxH = (AP.CFG.horasMaxTurno || 13) * 3600000;
    var res = await Promise.all([
      B.listRange('AP_Movimientos', 'FechaHora', rp.a, hasta),
      B.listRange('AP_Solicitudes', 'FechaSolicitud', r.a, hasta).catch(function () { return []; }),
      B.listRange('AP_Inspecciones', 'FechaHora', r.a, hasta).catch(function () { return []; }),
      B.listRange('AP_Rondas', 'FechaHora', rp.a, hasta).catch(function () { return []; }),
      B.listRange('AP_Turnos', 'FechaHora', new Date(r.a.getTime() - maxH), hasta).catch(function () { return []; }),
      B.listAll('AP_PuntosRonda').catch(function () { return []; }),
      verificaciones(r.a)
    ]);
    var enMes = function (x, f) { var t = new Date(x[f || 'FechaHora']); return t >= r.a && t <= r.b; };
    var enPrev = function (x) { var t = new Date(x.FechaHora); return t >= rp.a && t <= rp.b; };
    return { ym: ym, r: r, hasta: hasta, movs: res[0].filter(function (x) { return enMes(x); }), movsPrev: res[0].filter(enPrev), sol: res[1], insp: res[2],
      rondas: res[3].filter(function (x) { return enMes(x); }), rondasPrev: res[3].filter(enPrev), turnos: res[4], puntos: res[5], ver: res[6] };
  }

  // Indicadores calculados (independientes del idioma)
  function calcular(d) {
    var J = AP.Jornada, ingr = function (l) { return l.filter(function (m) { return m.Sentido === 'Ingreso' && m.Resultado === 'Permitido'; }); };
    var ing = ingr(d.movs), ingP = ingr(d.movsPrev);
    var negados = d.movs.filter(function (m) { return m.Resultado === 'Negado'; });
    var nov = d.movs.filter(function (m) { return m.Novedad; }), excep = d.movs.filter(function (m) { return m.Excepcion; });
    var personas = new Set(ing.map(function (m) { return m.Token || U.normDoc(m.NumDoc) || m.IdLocal; }));
    var porDia = function (l) { var o = {}; l.forEach(function (m) { var k = Number(U.ymd(m.FechaHora).slice(8, 10)); o[k] = (o[k] || 0) + 1; }); return o; };
    var pd = porDia(ing), pdp = porDia(ingP), rp = rangoMes(ymAnterior(d.ym));
    var hoyDia = d.hasta < d.r.b ? Number(U.ymd(d.hasta).slice(8, 10)) : d.r.dias;
    var porHora = new Array(24).fill(0); ing.forEach(function (m) { porHora[parseInt(U.partsCO(m.FechaHora).hour, 10)]++; });
    // Rondas: cumplimiento por ronda (turnos de los ronderos y rondas por día de los demás perfiles)
    var pts = d.puntos.filter(function (p) { return p.Activo !== false; });
    var cierres = {}; d.turnos.forEach(function (e) { if (/^(Fin|Cierre)/.test(e.Evento || '')) cierres[e.TurnoId] = e; });
    var rondasT = d.turnos.filter(function (e) { return e.Evento === 'Inicio de turno' && e.Rol === 'Rondero' && new Date(e.FechaHora) >= d.r.a && new Date(e.FechaHora) <= d.r.b; }).map(function (e) {
      var ms = d.rondas.filter(function (m) { return m.TurnoId === e.TurnoId && m.PuntoId; });
      return { inicio: e.FechaHora, nombre: e.Title, c: AP.Rondas.cumplimiento(pts, ms) };
    });
    // Revistas de supervisión (Director, Analista, Supervisor): se informan aparte y no cuentan para el cumplimiento
    var sup = d.rondas.filter(function (m) { return AP.Rondas.esSupervision(m); });
    var cumpProm = rondasT.length ? Math.round(rondasT.reduce(function (a, x) { return a + x.c.tot.pct; }, 0) / rondasT.length) : null;
    var cumpDia = {};
    rondasT.forEach(function (x) { var k = Number(U.ymd(x.inicio).slice(8, 10)); (cumpDia[k] = cumpDia[k] || []).push(x.c.tot.pct); });
    var porPunto = pts.map(function (p) {
      var conMeta = rondasT.filter(function (x) { var f = x.c.filas.find(function (y) { return y.p.id === p.id; }); return f && f.completo; }).length;
      return { p: p, marcas: d.rondas.filter(function (m) { return m.PuntoId === p.id && !AP.Rondas.esSupervision(m); }).length, sup: sup.filter(function (m) { return m.PuntoId === p.id; }).length, cumplidas: conMeta, rondas: rondasT.length };
    }).sort(function (a, b) { return pct(a.cumplidas, a.rondas) - pct(b.cumplidas, b.rondas) || b.marcas - a.marcas; });
    var novR = d.rondas.filter(function (x) { return x.Novedad; }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? -1 : 1; });
    var verif = novR.filter(function (x) { return ultima(d.ver, x); });
    var fotos = 0, peso = 0; d.rondas.forEach(function (x) { fotosDe(x).forEach(function (f) { fotos++; peso += pesoFoto(f); }); });
    return {
      ing: ing, ingP: ingP, negados: negados, nov: nov, excep: excep, personas: personas.size, visit: ing.filter(esVisitante).length,
      salidas: d.movs.filter(function (m) { return m.Sentido === 'Salida' && m.Resultado === 'Permitido'; }).length,
      porDia: pd, porDiaPrev: pdp, diasPrev: rp.dias, hoyDia: hoyDia, porHora: porHora,
      cats: cuenta(ing, 'Categoria'), negMot: cuenta(negados, function (m) { return String(m.EstadoMostrado || m.MotivoNegacion || 'Sin motivo').replace(/\s*—.*$/, '').replace(/\(\d+ MIN\)/i, '').trim(); }),
      novTipo: function (en) { return cuenta(d.movs.filter(function (m) { return m.Novedad; }), function (m) { return tipoNov(String(m.Novedad).split(' | ')[0], en); }); },
      sol: d.sol, solAp: d.sol.filter(function (x) { return x.Estado === 'Aprobada'; }).length, solRe: d.sol.filter(function (x) { return x.Estado === 'Rechazada'; }).length,
      insp: d.insp, inspNC: d.insp.filter(function (i) { return i.Resultado === 'No conforme'; }).length,
      rondas: d.rondas, rondasPrev: d.rondasPrev, rondasT: rondasT, sup: sup.filter(function (m) { return m.PuntoId; }).length, cumpProm: cumpProm, cumpDia: cumpDia, porPunto: porPunto, pts: pts,
      sinQR: d.rondas.filter(function (x) { return x.PuntoId && x.Origen !== 'QR'; }).length, reportes: d.rondas.filter(function (x) { return x.Origen === 'Reporte de novedad'; }).length,
      novR: novR, verif: verif.length, fotos: fotos, peso: peso
    };
  }

  // Gráficas del informe (PNG)
  async function graficas(c, d, en) {
    var G = AP.Graf, T = I().tr(en ? 'en' : 'es'), out = {};
    var dias = [], s1 = [], s2 = [];
    for (var i = 1; i <= d.r.dias; i++) { dias.push(String(i)); s1.push(i <= c.hoyDia ? (c.porDia[i] || 0) : null); s2.push(i <= c.diasPrev ? (c.porDiaPrev[i] || 0) : null); }
    out.dia = await G.png(G.lineas(dias, [{ nombre: I().nombreMes(d.ym, en ? 'en' : 'es'), valores: s1 }, { nombre: I().nombreMes(ymAnterior(d.ym), en ? 'en' : 'es'), valores: s2 }], { alto: 300 }));
    out.hora = await G.png(G.columnas(c.porHora.map(function (n, h2) { return { x: String(h2).padStart(2, '0'), n: n }; }), { alto: 260, etiquetaCada: 2 }));
    if (c.cats.length) out.cats = await G.png(G.barrasH(c.cats.map(function (x) { return { k: x.k, n: x.n }; }), { max: 8 }));
    var cd = [];
    for (i = 1; i <= d.r.dias; i++) { var l = c.cumpDia[i]; cd.push(l ? Math.round(l.reduce(function (a, b) { return a + b; }, 0) / l.length) : null); }
    if (c.rondasT.length) out.cump = await G.png(G.lineas(dias, [{ nombre: T('Cumplimiento', 'Compliance'), valores: cd }], { unidad: '%', tope: 100, meta: { valor: 100, etiqueta: T('Meta 100 %', 'Target 100 %') }, alto: 260 }));
    var pp = c.porPunto.slice().sort(function (a, b) { return b.marcas - a.marcas; });
    if (pp.length) out.puntos = await G.png(G.barrasH(pp.map(function (x) { return { k: x.p.Title, n: x.marcas }; }), { max: 12 }));
    var nt = cuenta(c.novR, function (x) { return en ? (TIPO_EN[x.TipoNovedad] || x.TipoNovedad) : x.TipoNovedad; });
    if (nt.length) out.novTipo = await G.png(G.barrasH(nt, { max: 8, color: AP.Graf.colores.s1 }));
    return out;
  }

  // Borrador automático del resumen y de las conclusiones (el Director lo edita antes de generar)
  function borrador(c, d, en) {
    var T = I().tr(en ? 'en' : 'es'), mes = I().nombreMes(d.ym, en ? 'en' : 'es');
    var res = T('Durante ' + mes.toLowerCase() + ' se registraron ' + n0(c.ing.length) + ' ingresos permitidos en portería (' + variacion(c.ing.length, c.ingP.length) + '), de ' + n0(c.personas) + ' personas distintas, ' + n0(c.visit) + ' de ellos de visitantes. Se negaron ' + n0(c.negados.length) + ' ingresos y se registraron ' + n0(c.nov.length) + ' novedades de portería. ',
      'During ' + mes + ', ' + n0(c.ing.length) + ' authorized entries were recorded at the gate (' + variacion(c.ing.length, c.ingP.length, true) + '), by ' + n0(c.personas) + ' different people, ' + n0(c.visit) + ' of them visitors. ' + n0(c.negados.length) + ' entries were denied and ' + n0(c.nov.length) + ' gate exceptions were recorded. ') +
      T('En las rondas de seguridad el rondero hizo ' + n0(c.rondas.length - c.reportes - c.sup) + ' marcaciones' + (c.cumpProm != null ? ', con un cumplimiento promedio de ' + c.cumpProm + ' % en ' + c.rondasT.length + ' turnos de ronda' : '') + (c.sup ? ', y se hicieron ' + n0(c.sup) + ' revistas de supervisión' : '') + '; se reportaron ' + n0(c.novR.length) + ' novedades, de las cuales ' + n0(c.verif) + ' están verificadas por esta Dirección.',
        'During security patrols the patrol guard made ' + n0(c.rondas.length - c.reportes - c.sup) + ' checkpoint check-ins' + (c.cumpProm != null ? ', with an average compliance of ' + c.cumpProm + ' % over ' + c.rondasT.length + ' patrol shifts' : '') + (c.sup ? ', and ' + n0(c.sup) + ' supervisory checks were made' : '') + '; ' + n0(c.novR.length) + ' incidents were reported, ' + n0(c.verif) + ' of which have been verified by this Department.');
    var bajos = c.porPunto.filter(function (x) { return x.rondas && pct(x.cumplidas, x.rondas) < 80; }).slice(0, 3).map(function (x) { return x.p.Title; });
    var con = [];
    if (c.cumpProm != null && c.cumpProm < 90) con.push(T('El cumplimiento promedio de las rondas (' + c.cumpProm + ' %) está por debajo de la meta' + (bajos.length ? '; los puntos con menor cumplimiento son: ' + bajos.join(', ') : '') + '.', 'Average patrol compliance (' + c.cumpProm + ' %) is below target' + (bajos.length ? '; the checkpoints with the lowest compliance are: ' + bajos.join(', ') : '') + '.'));
    if (c.novR.length - c.verif > 0) con.push(T('Quedan ' + (c.novR.length - c.verif) + ' novedades de ronda pendientes de verificación.', (c.novR.length - c.verif) + ' patrol incidents remain pending verification.'));
    if (c.sinQR) con.push(T(c.sinQR + ' marcaciones se hicieron sin lectura del código QR; conviene revisar el estado de las etiquetas.', c.sinQR + ' check-ins were made without reading the QR code; the condition of the labels should be reviewed.'));
    if (c.inspNC) con.push(T(c.inspNC + ' inspecciones de carga resultaron no conformes.', c.inspNC + ' cargo inspections were non-conforming.'));
    if (!con.length) con.push(T('No se identificaron desviaciones relevantes en el periodo.', 'No relevant deviations were identified during the period.'));
    return { resumen: res, conclusiones: con.join('\n\n') };
  }

  async function modeloMensual(d, c, g, o) {
    var IN = I(), L = o.idioma, en = L === 'en', T = IN.tr(L), hoy = new Date();
    var nombre = AP.Session.user.nombre, cargo = IN.cargo(), mes = IN.nombreMes(d.ym, L);
    var parcial = d.hasta < d.r.b;
    var periodo = T('Del 1 al ' + (parcial ? Number(U.ymd(d.hasta).slice(8, 10)) : d.r.dias) + ' de ' + mes.toLowerCase(), 'From ' + mes.replace(/ (\d{4})$/, ' 1') + ' to ' + (parcial ? Number(U.ymd(d.hasta).slice(8, 10)) : d.r.dias) + ', ' + d.ym.slice(0, 4)) + (parcial ? T(' (corte: ' + U.fDateTime(d.hasta) + ')', ' (cut-off: ' + IN.fechaHora(d.hasta, 'en') + ')') : '');
    var B = [];
    var img = function (k) { return g[k] ? { bytes: g[k].bytes, w: g[k].w, h: g[k].h } : null; };
    B.push({ t: 'cab', lugarFecha: 'La Ceja (Antioquia), ' + IN.fechaLarga(hoy, L), titulo: T('INFORME MENSUAL DE GESTIÓN DE SEGURIDAD INTEGRAL', 'MONTHLY INTEGRAL SECURITY MANAGEMENT REPORT'), subtitulo: T('Control de acceso y rondas de seguridad — ', 'Access control and security patrols — ') + mes });
    B.push({ t: 'memo', filas: [[T('PARA:', 'TO:'), o.para], [T('DE:', 'FROM:'), nombre + ' — ' + (en ? IN.cargoEn(cargo) : cargo)], [T('FECHA:', 'DATE:'), IN.fechaLarga(hoy, L, true)],
      [T('ASUNTO:', 'SUBJECT:'), T('Informe mensual de seguridad integral — ', 'Monthly integral security report — ') + mes], [T('PERIODO:', 'PERIOD:'), periodo], [T('CLASIFICACIÓN:', 'CLASSIFICATION:'), o.clasificacion, true]] });
    // 1. Resumen ejecutivo
    B.push({ t: 'h', texto: T('Resumen ejecutivo', 'Executive summary') });
    B.push({ t: 'kpis', cols: 4, items: [
      [n0(c.ing.length), T('Ingresos permitidos', 'Authorized entries')], [n0(c.personas), T('Personas distintas', 'Different people')],
      [n0(c.negados.length), T('Ingresos negados', 'Denied entries'), c.negados.length ? 'mal' : ''], [n0(c.nov.length), T('Novedades de portería', 'Gate exceptions')],
      [n0(c.rondas.length), T('Marcaciones de ronda', 'Patrol check-ins')], [c.cumpProm == null ? '—' : c.cumpProm + ' %', T('Cumplimiento promedio de rondas', 'Average patrol compliance'), c.cumpProm != null && c.cumpProm < 90 ? 'mal' : ''],
      [n0(c.novR.length), T('Novedades de ronda', 'Patrol incidents'), c.novR.length - c.verif ? 'mal' : ''], [n0(c.verif) + ' / ' + n0(c.novR.length), T('Novedades verificadas', 'Verified incidents')]] });
    o.resumen.split(/\n{2,}/).forEach(function (p) { if (p.trim()) B.push({ t: 'p', texto: p.trim() }); });
    // 2. Control de acceso
    B.push({ t: 'h', texto: T('Control de acceso en portería', 'Gate access control') });
    B.push({ t: 'p', texto: T('Ingresos permitidos: ' + n0(c.ing.length) + ' (' + variacion(c.ing.length, c.ingP.length) + '); salidas: ' + n0(c.salidas) + '; ingresos de visitantes: ' + n0(c.visit) + '; excepciones autorizadas: ' + n0(c.excep.length) + '; solicitudes de ingreso al Director: ' + n0(c.sol.length) + ' (' + n0(c.solAp) + ' aprobadas, ' + n0(c.solRe) + ' rechazadas).',
      'Authorized entries: ' + n0(c.ing.length) + ' (' + variacion(c.ing.length, c.ingP.length, true) + '); exits: ' + n0(c.salidas) + '; visitor entries: ' + n0(c.visit) + '; authorized exceptions: ' + n0(c.excep.length) + '; entry requests to the Director: ' + n0(c.sol.length) + ' (' + n0(c.solAp) + ' approved, ' + n0(c.solRe) + ' rejected).') });
    if (img('dia')) B.push({ t: 'graf', titulo: T('Ingresos por día del mes, frente al mes anterior', 'Entries per day of the month, compared with the previous month'), img: img('dia'), nota: T('Cada punto es el número de ingresos permitidos de ese día.', 'Each point is the number of authorized entries on that day.') });
    if (img('cats')) B.push({ t: 'graf', titulo: T('Ingresos por categoría', 'Entries by category'), img: img('cats') });
    if (img('hora')) B.push({ t: 'graf', titulo: T('Ingresos por hora del día', 'Entries by hour of the day'), img: img('hora'), nota: T('Hora de llegada, sumando todos los días del mes.', 'Arrival time, adding up all days of the month.') });
    if (c.negMot.length) B.push({ t: 'tabla', cabecera: true, anchos: [7, 2], filas: [[T('Motivo de la negación', 'Reason for denial'), { t: T('Ingresos negados', 'Denied entries'), align: 'right' }]].concat(c.negMot.slice(0, 8).map(function (x) { return [x.k, { t: n0(x.n), align: 'right' }]; })) });
    var nt = c.novTipo(en);
    if (nt.length) B.push({ t: 'tabla', cabecera: true, anchos: [7, 2], filas: [[T('Novedad de portería', 'Gate exception'), { t: T('Registros', 'Records'), align: 'right' }]].concat(nt.map(function (x) { return [x.k, { t: n0(x.n), align: 'right' }]; })) });
    // 3. Rondas
    B.push({ t: 'h', texto: T('Rondas de seguridad', 'Security patrols') });
    B.push({ t: 'kpis', cols: 4, items: [[n0(c.rondasT.length), T('Turnos de ronda', 'Patrol shifts')], [n0(c.pts.length), T('Puntos de control activos', 'Active checkpoints')],
      [n0(c.rondas.length - c.reportes - c.sup), T('Marcaciones del rondero', 'Patrol guard check-ins')], [n0(c.sup), T('Revistas de supervisión (Director, Analista, Supervisor)', 'Supervisory checks (Director, Analyst, Supervisor)')],
      [n0(c.sinQR), T('Sin lectura de QR', 'Without QR read'), c.sinQR ? 'mal' : ''],
      [n0(c.reportes), T('Reportes de novedad sin punto', 'Incident reports outside checkpoints')],
      [c.cumpProm == null ? '—' : c.cumpProm + ' %', T('Cumplimiento promedio', 'Average compliance'), c.cumpProm != null && c.cumpProm < 90 ? 'mal' : ''], [c.rondasPrev.length ? (c.rondas.length >= c.rondasPrev.length ? '+' : '') + Math.round((c.rondas.length - c.rondasPrev.length) / c.rondasPrev.length * 100) + ' %' : '—', T('Marcaciones frente al mes anterior', 'Check-ins vs. previous month')]] });
    B.push({ t: 'p', texto: T('Cada marcación exige la foto del lugar, tomada en el momento con la cámara de la aplicación (sin galería). El cumplimiento se exige solo al rondero: es el porcentaje de revistas que cuentan frente a las exigidas por punto en cada turno de ronda (meta y tiempo mínimo entre revistas fijados por la Dirección). Las revistas de supervisión del Director, el Analista y el Supervisor se registran con su foto, pero no cuentan para el cumplimiento.',
      'Each check-in requires a photograph of the place, taken on the spot with the application camera (no gallery). Compliance applies only to the patrol guard: it is the percentage of valid rounds against those required per checkpoint in each patrol shift (target and minimum interval set by the Department). Supervisory checks by the Director, the Analyst and the Supervisor are recorded with their photo but do not count toward compliance.') });
    if (img('cump')) B.push({ t: 'graf', titulo: T('Cumplimiento promedio de las rondas por día', 'Average patrol compliance per day'), img: img('cump') });
    if (img('puntos')) B.push({ t: 'graf', titulo: T('Marcaciones por punto de control', 'Check-ins per checkpoint'), img: img('puntos') });
    if (c.porPunto.length) B.push({ t: 'tabla', cabecera: true, anchos: [4.2, 1.8, 1.8, 2, 1.2], size: 8.5, filas: [[T('Punto de control', 'Checkpoint'), { t: T('Marcaciones del rondero', 'Patrol guard check-ins'), align: 'right' }, { t: T('Revistas de supervisión', 'Supervisory checks'), align: 'right' }, { t: T('Turnos con meta cumplida', 'Shifts meeting target'), align: 'right' }, { t: '%', align: 'right' }]]
      .concat(c.porPunto.map(function (x) { var p = pct(x.cumplidas, x.rondas); return [x.p.Title, { t: n0(x.marcas), align: 'right' }, { t: n0(x.sup), align: 'right' }, { t: x.cumplidas + ' / ' + x.rondas, align: 'right' }, { t: x.rondas ? p + ' %' : '—', align: 'right', color: x.rondas && p < 80 ? '#B3261E' : null, b: x.rondas && p < 80 }]; })) });
    // 4. Novedades y verificación
    B.push({ t: 'h', texto: T('Novedades de seguridad y su verificación', 'Security incidents and their verification') });
    if (c.novR.length) {
      B.push({ t: 'p', texto: T('Se reportaron ' + c.novR.length + ' novedades en las rondas; ' + c.verif + ' tienen verificación de esta Dirección y ' + (c.novR.length - c.verif) + ' están pendientes.', c.novR.length + ' incidents were reported during patrols; ' + c.verif + ' have been verified by this Department and ' + (c.novR.length - c.verif) + ' are pending.') });
      if (img('novTipo')) B.push({ t: 'graf', titulo: T('Novedades de ronda por tipo', 'Patrol incidents by type'), img: img('novTipo') });
      B.push({ t: 'tabla', cabecera: true, size: 8, anchos: [1.7, 2.6, 2.6, 3.4, 2.6], filas: [[T('Fecha', 'Date'), T('Lugar', 'Place'), T('Tipo', 'Type'), T('Descripción', 'Description'), T('Verificación', 'Verification')]].concat(c.novR.map(function (x) {
        var v = ultima(d.ver, x);
        return [IN.fechaHora(x.FechaHora, L), lugarDe(x), en ? (TIPO_EN[x.TipoNovedad] || x.TipoNovedad) : x.TipoNovedad, x.Descripcion || '',
          v ? { t: (en ? (RESULTADO_EN[v.Resultado] || v.Resultado) : v.Resultado) + ': ' + v.Nota } : { t: T('Pendiente de verificación', 'Pending verification'), color: '#9A6400', b: true }];
      })) });
      if (o.fotosNov) {
        var items = [];
        for (var k = 0; k < c.novR.length && items.length < 12; k++) {
          var x = c.novR[k], f = fotosDe(x).filter(function (z) { return z.tipo !== 'lugar' && z.etiqueta !== 'Lugar'; })[0] || fotosDe(x)[0];
          if (!f) continue;
          var dat = null; try { dat = await AP.B.fileData(f.ruta); } catch (e) { dat = null; }
          items.push({ bytes: dat ? dat.bytes : null, type: dat ? dat.type : 'image/jpeg', pie: IN.fechaHora(x.FechaHora, L) + ' — ' + lugarDe(x), sub: 'SHA-256: ' + (f.sha256 || '—') });
        }
        if (items.length) { B.push({ t: 'p', b: true, texto: T('Registro fotográfico de las novedades', 'Photographic record of the incidents') }); B.push({ t: 'fotos', items: items }); }
      }
    } else B.push({ t: 'p', texto: T('No se reportaron novedades en las rondas del periodo.', 'No incidents were reported during the patrols of the period.') });
    // 5. Inspecciones de carga
    if (c.insp.length) {
      B.push({ t: 'h', texto: T('Inspecciones de vehículos de carga', 'Cargo vehicle inspections') });
      B.push({ t: 'p', texto: T('Se registraron ' + c.insp.length + ' inspecciones de vehículos de carga: ' + (c.insp.length - c.inspNC) + ' conformes y ' + c.inspNC + ' no conformes.', c.insp.length + ' cargo vehicle inspections were recorded: ' + (c.insp.length - c.inspNC) + ' conforming and ' + c.inspNC + ' non-conforming.') });
    }
    // 6. Conclusiones y recomendaciones
    B.push({ t: 'h', texto: T('Conclusiones y recomendaciones', 'Conclusions and recommendations') });
    o.conclusiones.split(/\n{2,}/).forEach(function (p) { if (p.trim()) B.push({ t: 'p', texto: p.trim() }); });
    var rec = o.recomendaciones.split(/\n+/).map(function (s) { return s.replace(/^[-•*\d.)\s]+/, '').trim(); }).filter(Boolean);
    if (rec.length) { B.push({ t: 'p', b: true, texto: T('Recomendaciones:', 'Recommendations:') }); B.push({ t: 'lista', items: rec }); }
    // 7. Fuentes
    B.push({ t: 'h', texto: T('Fuentes, método e integridad', 'Sources, method and integrity') });
    B.push({ t: 'p', texto: T('Las cifras salen de los registros de la aplicación de control de acceso de ' + AP.CFG.empresa + ': ingresos y salidas (AP_Movimientos), solicitudes de ingreso (AP_Solicitudes), inspecciones (AP_Inspecciones), marcaciones y novedades de ronda (AP_Rondas), turnos (AP_Turnos), puntos de control (AP_PuntosRonda) y verificaciones (AP_Verificaciones). Estos registros son de solo agregar: no se modifican ni se borran. Los registros hechos sin conexión cuentan desde que llegan al servidor.',
      'Figures come from the records of the ' + AP.CFG.empresa + ' access control application: entries and exits (AP_Movimientos), entry requests (AP_Solicitudes), inspections (AP_Inspecciones), patrol check-ins and incidents (AP_Rondas), shifts (AP_Turnos), checkpoints (AP_PuntosRonda) and verifications (AP_Verificaciones). These records are append-only: they cannot be modified or deleted. Records made offline are counted once they reach the server.') +
      (en ? ' Entries typed into the system are reproduced as originally recorded, in Spanish.' : '') });
    B.push({ t: 'tabla', anchos: [3600, 6038], size: 8.5, filas: [
      [T('Periodo', 'Period'), periodo], [T('Registros considerados', 'Records considered'), T(n0(d.movs.length) + ' movimientos de portería, ' + n0(d.rondas.length) + ' registros de ronda, ' + n0(d.sol.length) + ' solicitudes y ' + n0(d.insp.length) + ' inspecciones', n0(d.movs.length) + ' gate movements, ' + n0(d.rondas.length) + ' patrol records, ' + n0(d.sol.length) + ' requests and ' + n0(d.insp.length) + ' inspections')],
      [T('Huella SHA-256 del conjunto de datos', 'SHA-256 fingerprint of the data set'), { t: o.huella, size: 7.5 }], [T('Generado por', 'Generated by'), nombre + ' — ' + IN.fechaHora(hoy, L)]
    ].map(function (f) { return [{ t: f[0], b: true, fill: '#F3F6F1' }, f[1]]; }) });
    var fm = await IN.firma();
    B.push({ t: 'firma', texto: T('Se expide el presente informe en La Ceja (Antioquia), el ' + IN.fechaLarga(hoy, L) + ', con base en los registros del periodo.', 'This report is issued in La Ceja (Antioquia), on ' + IN.fechaLarga(hoy, L) + ', based on the records of the period.'),
      cierre: T('Atentamente,', 'Sincerely,'), img: fm, nombre: nombre, cargo: en ? IN.cargoEn(cargo) : cargo });
    return { idioma: L, titulo: T('Informe mensual de seguridad integral — ', 'Monthly integral security report — ') + mes, autor: nombre + ' — ' + cargo, clasificacion: o.clasificacion, bloques: B,
      pieTexto: T('Informe generado el ' + U.fDateTime(hoy) + ' desde la aplicación de control de acceso · periodo ' + d.ym, 'Report generated on ' + IN.fechaHora(hoy, 'en') + ' from the access control application · period ' + d.ym) };
  }

  // Huella del conjunto de datos usado (para reproducir el informe): identificadores y huellas de los registros
  async function huellaDatos(d) {
    var l = [].concat(d.movs, d.rondas, d.sol, d.insp).map(function (x) { return (x.IdLocal || x.id) + ':' + (x.Hash || ''); }).sort();
    return U.sha256(new Blob([l.join('\n')]));
  }

  AP.route('/consola/informe-mensual', function (qs) {
    if (!AP.Session.can('admin')) { AP.go('/'); return; }
    var IN = I();
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/informe-mensual', 'Informe mensual de seguridad', content);
    var opciones = mesesAtras(4);
    var mes0 = qs.mes && opciones.indexOf(qs.mes) >= 0 ? qs.mes : mesPorInformar();
    var fMes = AP.select('mes', opciones.map(function (ym) { return [ym, IN.nombreMes(ym, 'es') + (ym === ymActual() ? ' (en curso)' : '')]; }), mes0);
    var idioma = AP.select('idioma', [['es', 'Español'], ['en', 'English (inglés)']], 'es');
    var paraDef = { es: 'Asamblea General de Accionistas y Gerencia General — ' + AP.CFG.empresa, en: "General Shareholders' Meeting and General Management — " + AP.CFG.empresa };
    var para = AP.input('para', paraDef.es);
    var clas = AP.select('clas', IN.CLASIFICACIONES.es, IN.CLASIFICACIONES.es[1]);
    var resumen = AP.textarea('resumen', '', { rows: 5 });
    var conclusiones = AP.textarea('conclusiones', '', { rows: 5 });
    var recomendaciones = AP.textarea('recomendaciones', '', { rows: 4, placeholder: 'Una recomendación por línea, con responsable y plazo si aplica.' });
    var fotosNov = AP.check('fotosNov', 'Incluir una foto de cada novedad (hasta 12)', true);
    var vista = h('div', { class: 'stack' });
    // Lo que el Director edita a mano no se reemplaza; lo que no ha tocado se vuelve a redactar al cambiar de idioma
    var d = null, c = null, g = { es: null, en: null }, ed = { res: false, con: false }, paraEditado = false;
    resumen.addEventListener('input', function () { ed.res = true; guardarBorrador(); });
    conclusiones.addEventListener('input', function () { ed.con = true; guardarBorrador(); });
    recomendaciones.addEventListener('input', function () { guardarBorrador(); });
    para.addEventListener('input', function () { paraEditado = true; });
    idioma.addEventListener('change', function () {
      var l = idioma.value, i0 = clas.selectedIndex;
      if (!paraEditado) para.value = paraDef[l];
      clas.replaceChildren.apply(clas, IN.CLASIFICACIONES[l].map(function (x) { return h('option', { value: x }, x); }));
      clas.selectedIndex = Math.max(0, i0);
      if (c) { var b = borrador(c, d, l === 'en'); if (!ed.res) resumen.value = b.resumen; if (!ed.con) conclusiones.value = b.conclusiones; }
      if (ed.res || ed.con || recomendaciones.value.trim()) AP.toast('Los textos que usted escribió o editó no se traducen solos: revíselos en el idioma del informe.', 'info', 7000);
      guardarBorrador();
    });
    fMes.addEventListener('change', function () { cargar(); });
    async function guardarBorrador() {
      if (!d) return;
      try { await AP.Store.set('informe-mensual:' + d.ym, { resumen: ed.res ? resumen.value : '', conclusiones: ed.con ? conclusiones.value : '', recomendaciones: recomendaciones.value }); } catch (e) { /* opcional */ }
    }
    async function cargar() {
      vista.replaceChildren(AP.spinner('Consultando los registros del mes…'));
      AP.Viz.limpiar && AP.Viz.limpiar();
      try {
        d = await datosMes(fMes.value);
        c = calcular(d);
        g = { es: null, en: null };
        var guard = null;
        try { guard = await AP.Store.get('informe-mensual:' + d.ym); } catch (e) { guard = null; }
        var b = borrador(c, d, idioma.value === 'en');
        guard = guard || {};
        ed = { res: !!guard.resumen, con: !!guard.conclusiones };
        resumen.value = guard.resumen || b.resumen; conclusiones.value = guard.conclusiones || b.conclusiones; recomendaciones.value = guard.recomendaciones || '';
        await pintar();
      } catch (e) { vista.replaceChildren(errBox(e)); }
    }
    async function graf(lang) { if (!g[lang]) g[lang] = await graficas(c, d, lang === 'en'); return g[lang]; }
    async function pintar() {
      var gg = await graf('es');
      var im = function (k, t) { return gg[k] ? h('section', { class: 'card stack sm' }, h('h3', null, t), h('img', { class: 'graf-img', src: gg[k].url, alt: t })) : null; };
      var parcial = d.hasta < d.r.b;
      vista.replaceChildren(
        parcial ? h('div', { class: 'banner warn' }, AP.icon('clock', 18), h('span', null, 'El mes aún no termina: el informe llega hasta ' + U.fDateTime(d.hasta) + '. Lo ideal es generarlo el último día del mes, al final de la jornada, o al día siguiente.')) : null,
        h('div', { class: 'kpis' }, kpi(n0(c.ing.length), 'Ingresos permitidos', 'brand'), kpi(n0(c.personas), 'Personas distintas'), kpi(n0(c.negados.length), 'Ingresos negados', c.negados.length ? 'deny' : ''),
          kpi(n0(c.nov.length), 'Novedades de portería', c.nov.length ? 'warn' : ''), kpi(n0(c.rondas.length - c.reportes - c.sup), 'Marcaciones del rondero'), kpi(n0(c.sup), 'Revistas de supervisión'), kpi(c.cumpProm == null ? '—' : c.cumpProm + ' %', 'Cumplimiento promedio de rondas', c.cumpProm != null && c.cumpProm < 90 ? 'warn' : 'ok'),
          kpi(n0(c.novR.length), 'Novedades de ronda', c.novR.length - c.verif ? 'warn' : ''), kpi(n0(c.verif) + ' / ' + n0(c.novR.length), 'Novedades verificadas')),
        im('dia', 'Ingresos por día, frente al mes anterior'), im('cats', 'Ingresos por categoría'), im('hora', 'Ingresos por hora del día'),
        im('cump', 'Cumplimiento promedio de las rondas por día'), im('puntos', 'Marcaciones por punto de control'), im('novTipo', 'Novedades de ronda por tipo'),
        c.novR.length - c.verif ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, (c.novR.length - c.verif) + ' novedad(es) de ronda sin verificar: el informe las muestra como pendientes. '), h('a', { class: 'btn small', href: '#/consola/rondas?t=novedades' }, 'Verificarlas')) : null);
    }
    async function generar(formato, btn) {
      if (!d) return;
      var txt = btn.lastChild.textContent;
      btn.disabled = true; btn.lastChild.textContent = 'Generando…';
      try {
        var lang = idioma.value;
        var m = await modeloMensual(d, c, await graf(lang), { idioma: lang, para: para.value.trim() || paraDef[lang], clasificacion: clas.value, resumen: resumen.value, conclusiones: conclusiones.value, recomendaciones: recomendaciones.value,
          fotosNov: fotosNov.querySelector('input').checked, huella: await huellaDatos(d) });
        await IN.descargar(m, formato, 'Informe_mensual_seguridad_' + d.ym, ['Informe mensual de seguridad', d.ym + ' · para: ' + (para.value.trim() || paraDef[lang]) + ' · ' + clas.value]);
        marcar(d.ym);
      } catch (e) { console.error(e); AP.toast('No se pudo generar el informe: ' + e.message, 'error', 9000); }
      finally { btn.disabled = false; btn.lastChild.textContent = txt; }
    }
    var bWord = h('button', { class: 'btn primary', type: 'button', onclick: function () { generar('word', bWord); } }, AP.icon('word', 18), 'Descargar Word');
    var bPdf = h('button', { class: 'btn', type: 'button', onclick: function () { generar('pdf', bPdf); } }, AP.icon('file', 18), 'Descargar PDF');
    content.append(
      h('div', { class: 'banner info' }, AP.icon('file', 18), h('span', null, 'Informe del mes para la Asamblea General de Accionistas y la Gerencia General: ingresos, rondas, novedades y su verificación, con gráficas. Desde el último día de cada mes el panel le recuerda generarlo (la aplicación no tiene servidor propio, así que no lo envía sola). Descárguelo en Word para ajustarlo o en PDF para enviarlo, en español o en inglés.')),
      h('section', { class: 'card stack' },
        h('div', { class: 'form-grid' }, AP.field('Mes', fMes), AP.field('Idioma del informe', idioma), AP.field('Para', para, null, 'span2'), AP.field('Clasificación', clas, null, 'span2'),
          AP.field('Resumen ejecutivo (borrador automático: revíselo)', resumen, null, 'span2'), AP.field('Conclusiones', conclusiones, null, 'span2'),
          AP.field('Recomendaciones', recomendaciones, null, 'span2'), h('div', { class: 'field span2' }, fotosNov)),
        h('div', { class: 'row gap wrap end' }, bPdf, bWord)),
      vista,
      IN.tarjetaFirma());
    cargar();
  });
})();
