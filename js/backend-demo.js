/* Modo demostración: mismo comportamiento que la versión conectada, con datos ficticios guardados en el dispositivo */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;
  var S = function () { return AP.Store; };
  var user = null;
  var cache = {};

  function offline() { return AP.Demo.offline; }
  async function lat() { await U.sleep(120 + Math.random() * 120); if (offline()) throw AP.mkErr('offline', 'Sin conexión (simulada).'); }
  async function load(list) {
    if (!cache[list]) cache[list] = (await S().get('demo:' + list)) || [];
    return cache[list];
  }
  async function save(list) { await S().set('demo:' + list, cache[list]); }
  function nextId(arr) { return String(arr.reduce(function (m, x) { return Math.max(m, parseInt(x.id, 10) || 0); }, 0) + 1); }
  function pick(rec, exclude) {
    var o = Object.assign({}, rec);
    (exclude || []).forEach(function (k) { delete o[k]; });
    return o;
  }

  var D = (AP.Demo = {
    name: 'demo',
    offline: false,
    init: async function () {
      var seeded = await S().get('demo:seeded');
      if (seeded !== 5) await D.seed();
      user = await S().get('demo:user');
      return !!user;
    },
    me: function () { return user; },
    loginAs: async function (rol) {
      user = rol === 'Dispositivo'
        ? { upn: 'porteria.demo@avopak.example', nombre: 'Celular de portería (demo)' }
        : { upn: 'director.demo@avopak.example', nombre: 'Director de Seguridad Integral (demo)' };
      await S().set('demo:user', user);
      await AP.startSession();
      location.hash = rol === 'Dispositivo' ? '#/porteria' : '#/consola/panel';
      AP.render();
    },
    login: function () { AP.render(); },
    relogin: function () { return D.login(); },
    logout: async function () { await S().del('demo:user'); user = null; AP.endSession(); location.hash = '#/'; AP.render(); },
    reset: async function () {
      cache = {}; await S().clearAll(); try { localStorage.removeItem('ap.dispositivo'); } catch (e) {}
      await D.seed(); user = null; AP.endSession();
      AP.Sync.personas = []; AP.Sync.visitas = []; AP.Sync.movs = []; AP.Sync.usuarios = []; AP.Sync.vigilantes = []; AP.Sync.cambiosPin = []; AP.Sync.horarios = []; AP.Sync.permisos = []; AP.Sync.outbox = [];
      AP.Sync.state.lastPull = null; AP.Sync.reindex();
      location.hash = '#/'; AP.render();
    },

    listAll: async function (list, opt) {
      await lat();
      var arr = await load(list);
      return arr.map(function (r) { return pick(r, opt && opt.exclude); });
    },
    listRange: async function (list, field, desde, hasta, opt) {
      await lat();
      var a = U.toDate(desde).getTime(), b = hasta ? U.toDate(hasta).getTime() : Infinity;
      return (await load(list)).filter(function (r) {
        var t = new Date(r[field]).getTime(); return t >= a && t <= b;
      }).map(function (r) { return pick(r, opt && opt.exclude); });
    },
    findBy: async function (list, field, value) {
      await lat();
      return (await load(list)).filter(function (r) { return String(r[field]) === String(value); }).map(function (r) { return pick(r, ['Foto']); });
    },
    getFields: async function (list, ids, cols) {
      await lat();
      var arr = await load(list), out = {};
      ids.forEach(function (id) {
        var r = arr.find(function (x) { return x.id === String(id); });
        if (r) { out[id] = {}; cols.forEach(function (c) { out[id][c] = r[c]; }); }
      });
      return out;
    },
    create: async function (list, fields) {
      await lat();
      var arr = await load(list);
      if (fields.IdLocal && arr.some(function (r) { return r.IdLocal === fields.IdLocal; })) {
        throw AP.mkErr('api', 'Valor duplicado en IdLocal', { status: 409 });
      }
      var now = new Date().toISOString();
      var rec = Object.assign({}, fields, { id: nextId(arr), _created: now, _modified: now, _createdBy: user && user.upn, _etag: U.uuid() });
      arr.push(rec);
      await save(list);
      AP.Graph.skewSeconds = 0;
      return Object.assign({}, rec);
    },
    update: async function (list, id, fields) {
      await lat();
      var arr = await load(list);
      var r = arr.find(function (x) { return x.id === String(id); });
      if (!r) throw AP.mkErr('api', 'Elemento no encontrado', { status: 404 });
      Object.keys(fields).forEach(function (k) { if (k[0] !== '_' && k !== 'id') r[k] = fields[k]; });
      r._modified = new Date().toISOString(); r._modifiedBy = user && user.upn; r._etag = U.uuid();
      await save(list);
      return Object.assign({}, r);
    },
    remove: async function (list, id) {
      await lat();
      var arr = await load(list);
      cache[list] = arr.filter(function (x) { return x.id !== String(id); });
      await save(list);
    },
    upload: async function (relPath, blob) {
      await lat();
      var buf = await blob.arrayBuffer();
      await S().set('demo:file:' + relPath, { type: blob.type, buf: buf });
      return { path: relPath, webUrl: 'demo://' + relPath };
    },
    fileUrl: async function (relPath) {
      var f = await S().get('demo:file:' + relPath);
      if (!f) return '';
      return URL.createObjectURL(new Blob([f.buf], { type: f.type }));
    },
    sendMail: async function (msg) {
      await lat();
      D.lastMail = msg;
      return null;
    },
    provision: async function (log) {
      log('Modo demostración: la estructura de datos es local y ya está creada.');
      Object.keys(AP.SCHEMA).forEach(function (n) { log('· ' + n + ' — ' + AP.SCHEMA[n].desc); });
      return {};
    },
    status: async function () {
      var o = { site: true, lists: {} };
      Object.keys(AP.SCHEMA).forEach(function (n) { o.lists[n] = true; });
      return o;
    },

    // ---------- Datos ficticios ----------
    seed: async function () {
      cache = {};
      await S().clearAll();
      var now = new Date();
      var hoy = U.ymd(now);
      var en = function (d) { return U.ymd(U.addDays(now, d)); };
      // Credenciales fijas, para que los carnés impresos desde la consola funcionen en cualquier celular en modo demo.
      var P = [
        ['Laura Marcela Ríos Arango', 'Personal propio', 'CC', '1000000101', 'Avo Pak S.A.S.', 'Analista de calidad', 'Calidad', 'Habilitado', '', 'ABC123', 'Automóvil'],
        ['Juan Pablo Osorio Henao', 'Personal propio', 'CC', '1000000102', 'Avo Pak S.A.S.', 'Operario de empaque', 'Producción', 'Habilitado', '', '', ''],
        ['Diana Carolina Muñoz Zapata', 'Personal propio', 'CC', '1000000103', 'Avo Pak S.A.S.', 'Coordinadora logística', 'Logística', 'Habilitado', '', 'XYZ89F', 'Motocicleta'],
        ['Andrés Felipe Cardona Gil', 'Personal propio', 'CC', '1000000104', 'Avo Pak S.A.S.', 'Operario de recepción', 'Producción', 'Inhabilitado', '', '', ''],
        ['Sebastián Arboleda Duque', 'Contratista', 'CC', '1000000201', 'Montajes Industriales Demo S.A.S.', 'Técnico electricista', 'Mantenimiento', 'Habilitado', en(20), '', ''],
        ['Paula Andrea Giraldo Toro', 'Contratista', 'CC', '1000000202', 'Aseo Integral Demo Ltda.', 'Auxiliar de aseo', 'Servicios generales', 'Habilitado', en(-3), '', ''],
        ['Camilo Hernández Restrepo', 'Contratista', 'CE', 'E0000301', 'Refrigeración Demo S.A.S.', 'Técnico de frío', 'Cuartos fríos', 'Habilitado', en(45), 'JKL456', 'Camioneta'],
        ['Mauricio Alzate Londoño', 'Conductor / transportador', 'CC', '1000000401', 'Transportes Demo S.A.S.', 'Conductor tractocamión', 'Despachos', 'Habilitado', en(60), 'TTR901', 'Tractocamión'],
        ['Natalia Bedoya Salazar', 'Personal propio', 'CC', '1000000105', 'Avo Pak S.A.S.', 'Auxiliar administrativa', 'Administración', 'Habilitado', '', '', '']
      ];
      var tokens = ['DEMO0000000000000000000001', 'DEMO0000000000000000000002', 'DEMO0000000000000000000003', 'DEMO0000000000000000000004',
        'DEMO0000000000000000000005', 'DEMO0000000000000000000006', 'DEMO0000000000000000000007', 'DEMO0000000000000000000008', 'DEMO0000000000000000000009'];
      cache.AP_Personas = P.map(function (p, i) {
        return {
          id: String(i + 1), Title: p[0], Tipo: p[1], TipoDoc: p[2], NumDoc: p[3], Empresa: p[4], Cargo: p[5], Area: p[6], Estado: p[7],
          MotivoEstado: p[7] === 'Inhabilitado' ? 'Suspensión de acceso por novedad de seguridad en revisión' : '',
          VigenciaHasta: p[8], Placa: p[9], VehiculoTipo: p[10], Token: tokens[i], Telefono: '300000000' + i, Correo: '',
          Foto: U.avatar(p[0]), AutorizaDatos: true, AutorizaFoto: true, FechaAutorizacion: hoy, VersionAutorizacion: 'AUT-ACC-01',
          _created: now.toISOString(), _modified: now.toISOString(), _etag: 'e' + i
        };
      });
      var h = function (hh, mm, d) { return U.fromLocal(en(d || 0), (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm).toISOString(); };
      cache.AP_Visitas = [
        { id: '1', Title: 'Ricardo Vélez Mejía', Categoria: 'Visitante', TipoDoc: 'CC', NumDoc: '1000000501', Empresa: 'Certificadora Demo Internacional', Motivo: 'Auditoría de seguimiento de la certificación', Anfitrion: 'Laura Marcela Ríos Arango', Area: 'Calidad', FechaInicio: h(6, 0), FechaFin: h(23, 0), Estado: 'Aprobada', Token: 'DEMOVISITA0000000000000001', Correo: 'visitante.demo@example.com', Placa: 'MNO234', VehiculoTipo: 'Automóvil', AprobadoPor: 'director.demo@avopak.example', SolicitadoPor: 'director.demo@avopak.example' },
        { id: '2', Title: 'Valentina Castaño Ruiz', Categoria: 'Visitante', TipoDoc: 'CC', NumDoc: '1000000502', Empresa: 'Cliente Importador Demo', Motivo: 'Visita comercial a planta', Anfitrion: 'Diana Carolina Muñoz Zapata', Area: 'Logística', FechaInicio: h(9, 0, 1), FechaFin: h(12, 0, 1), Estado: 'Pendiente', Token: 'DEMOVISITA0000000000000002', Correo: '', SolicitadoPor: 'director.demo@avopak.example' },
        { id: '3', Title: 'Jorge Iván Patiño Ochoa', Categoria: 'Visitante', TipoDoc: 'CC', NumDoc: '1000000503', Empresa: 'Proveedor de Insumos Demo', Motivo: 'Entrega de muestras', Anfitrion: 'Juan Pablo Osorio Henao', Area: 'Producción', FechaInicio: h(7, 0, -1), FechaFin: h(10, 0, -1), Estado: 'Aprobada', Token: 'DEMOVISITA0000000000000003', Correo: '', SolicitadoPor: 'director.demo@avopak.example' }
      ];
      // Movimientos de ejemplo de hoy y ayer
      var mv = [];
      function mov(p, sentido, iso, extra) {
        mv.push(Object.assign({
          id: String(mv.length + 1), IdLocal: U.uuid(), Title: p.Title, Sentido: sentido, Resultado: 'Permitido', Categoria: p.Tipo,
          Origen: 'QR', Token: p.Token, RefLista: 'AP_Personas', RefId: p.id, TipoDoc: p.TipoDoc, NumDoc: p.NumDoc, Empresa: p.Empresa,
          Cargo: p.Cargo, EstadoMostrado: p.Estado, FechaHora: iso, Vigilante: 'Carlos Andrés Gómez Ruiz', VigilanteCorreo: 'porteria.demo@avopak.example',
          VigilanteUsuario: 'vigilante1', TurnoId: U.ymd(iso) === hoy ? 'TURNO-DEMO-HOY' : 'TURNO-DEMO-AYER',
          Dispositivo: 'DISP-DEMO01', SinConexion: false, Porteria: 'Portería principal', _created: iso
        }, extra || {}));
      }
      var pp = cache.AP_Personas;
      mov(pp[0], 'Ingreso', h(6, 2), { Placa: 'ABC123', VehiculoTipo: 'Automóvil' });
      mov(pp[1], 'Ingreso', h(5, 51));
      mov(pp[2], 'Ingreso', h(6, 40), { Placa: 'XYZ89F', VehiculoTipo: 'Motocicleta' });
      mov(pp[4], 'Ingreso', h(7, 15));
      mov(pp[8], 'Ingreso', h(7, 30));
      mov(pp[8], 'Salida', h(12, 5));
      mov(pp[3], 'Ingreso', h(6, 10), { Resultado: 'Negado', Sentido: 'Ingreso', MotivoNegacion: 'Persona inhabilitada' });
      mov(pp[1], 'Ingreso', h(5, 55, -1)); mov(pp[1], 'Salida', h(14, 3, -1));
      mov(pp[0], 'Ingreso', h(6, 5, -1)); mov(pp[0], 'Salida', h(16, 40, -1));
      cache.AP_Movimientos = mv.filter(function (m) { return new Date(m.FechaHora) <= now; });
      cache.AP_Inspecciones = [];
      cache.AP_Usuarios = [
        { id: '1', Title: 'director.demo@avopak.example', Nombre: 'Director de Seguridad Integral (demo)', Rol: 'Administrador', Activo: true },
        { id: '2', Title: 'porteria.demo@avopak.example', Nombre: 'Celular de portería (demo)', Rol: 'Dispositivo de portería', Activo: true, Empresa: 'Avo Pak S.A.S.', Observaciones: 'Cuenta de servicio del celular de portería principal' }
      ];
      // Vigilantes con usuario y PIN. Los PIN de demostración se guardan, como en producción, solo como huella PBKDF2.
      var hace = function (d) { return U.addDays(now, -d).toISOString(); };
      async function cred(pin) { return AP.Pin.hash(pin || AP.Pin.temporal()); }
      var VG = [
        ['1', 'Carlos Andrés Gómez Ruiz', '1000000601', 'vigilante1', 'Vigilante', true],
        ['2', 'Luz Elena Restrepo Vargas', '1000000602', 'supervisor1', 'Supervisor', true],
        ['3', 'Andrés Mauricio Pérez Lopera', '1000000603', 'nuevo1', 'Vigilante', true],
        ['4', 'Jhon Fredy Cano Mesa', '1000000604', 'vigilante2', 'Vigilante', false]
      ];
      cache.AP_Vigilantes = [];
      for (var vi = 0; vi < VG.length; vi++) {
        var g = VG[vi];
        cache.AP_Vigilantes.push(Object.assign({
          id: g[0], Title: g[1], TipoDoc: 'CC', NumDoc: g[2], Usuario: g[3], Rol: g[4], Activo: g[5],
          Empresa: 'Vigilancia Demo Ltda.', Cargo: g[4] === 'Supervisor' ? 'Supervisora de seguridad' : 'Guarda de seguridad', Telefono: '',
          PinVersion: 1, PinFecha: g[3] === 'nuevo1' ? now.toISOString() : hace(30), PinPor: 'director.demo@avopak.example',
          SolicitadoPor: 'Supervisora del contratista (demo)', Soporte: 'Correo de solicitud (demo)', FechaAlta: g[3] === 'nuevo1' ? now.toISOString() : hace(30),
          AltaPor: 'director.demo@avopak.example',
          FechaBaja: g[5] ? null : hace(5), BajaPor: g[5] ? '' : 'director.demo@avopak.example', MotivoBaja: g[5] ? '' : 'Retiro del servicio informado por el contratista'
        }, await cred(g[3] === 'nuevo1' ? '615283' : null)));
      }
      var personal = { vigilante1: '482915', supervisor1: '730264', vigilante2: '159372' };
      cache.AP_CambiosPin = [];
      for (vi = 0; vi < cache.AP_Vigilantes.length; vi++) {
        var vv = cache.AP_Vigilantes[vi];
        if (!personal[vv.Usuario]) continue;
        cache.AP_CambiosPin.push(Object.assign({
          id: String(cache.AP_CambiosPin.length + 1), IdLocal: U.uuid(), Title: vv.Usuario, VigilanteId: vv.id, BaseVersion: 1,
          FechaHora: hace(29), Dispositivo: 'DISP-DEMO01', AceptaCondiciones: true, VersionAviso: 'AUT-PIN-01'
        }, await cred(personal[vv.Usuario])));
      }
      var tv = function (id, ev, iso, extra) {
        return Object.assign({ id: String(id), IdLocal: U.uuid(), Title: 'Carlos Andrés Gómez Ruiz', Evento: ev, VigilanteId: '1', VigilanteUsuario: 'vigilante1', Rol: 'Vigilante',
          FechaHora: iso, Dispositivo: 'DISP-DEMO01', Cuenta: 'porteria.demo@avopak.example', SinConexion: false }, extra || {});
      };
      cache.AP_Turnos = [
        tv(1, 'Inicio de turno', h(5, 45, -1), { TurnoId: 'TURNO-DEMO-AYER', InicioTurno: h(5, 45, -1) }),
        tv(2, 'Fin de turno', h(18, 5, -1), { TurnoId: 'TURNO-DEMO-AYER', InicioTurno: h(5, 45, -1), Registros: 4, Pendientes: 0 }),
        tv(3, 'Inicio de turno', h(5, 45), { TurnoId: 'TURNO-DEMO-HOY', InicioTurno: h(5, 45) })
      ].filter(function (t) { return new Date(t.FechaHora) <= now; });
      // Horarios y permisos de demostración (relativos a la hora de creación, para ver los distintos resultados)
      var hmCO = function (min) { var q = U.partsCO(new Date(now.getTime() + min * 60000)); return q.hour + ':' + q.minute; };
      var TODOS = '0,1,2,3,4,5,6';
      var HR = [[1, 'Turno A', hmCO(-120), hmCO(420), TODOS], [2, 'Turno A', hmCO(-120), hmCO(420), TODOS],
        [5, 'Aseo', hmCO(-4), hmCO(540), TODOS], [6, 'Frío', hmCO(-25), hmCO(540), TODOS], [8, 'Administrativo', '08:00', '17:00', '1,2,3,4,5']];
      cache.AP_Horarios = HR.map(function (x, i) {
        var pr = cache.AP_Personas[x[0]];
        return { id: String(i + 1), Title: pr.Title, Token: pr.Token, NumDoc: pr.NumDoc, Area: pr.Area, Turno: x[1], Dias: x[4], HoraEntrada: x[2], HoraSalida: x[3], Activo: true,
          VigenteDesde: '', VigenteHasta: '', _created: now.toISOString() };
      });
      cache.AP_Permisos = [{ id: '1', Title: cache.AP_Personas[1].Title, Token: cache.AP_Personas[1].Token, NumDoc: cache.AP_Personas[1].NumDoc, Tipo: 'Salida anticipada',
        Desde: new Date(now.getTime() - 5 * 60000).toISOString(), Hasta: new Date(now.getTime() + 180 * 60000).toISOString(), Estado: 'Vigente', Detalle: 'Permiso autorizado (demostración)', AutorizadoPor: 'Director de Seguridad Integral (demo)', _created: now.toISOString() }];
      cache.AP_Verificaciones = [];
      cache.AP_Bitacora = [{ id: '1', Title: 'Datos de demostración creados', Accion: 'Instalación', Usuario: 'sistema', FechaHora: now.toISOString(), Detalle: 'Datos ficticios para pruebas.' }];
      var keys = Object.keys(cache);
      for (var i = 0; i < keys.length; i++) await save(keys[i]);
      await S().set('demo:seeded', 5);
    }
  });
})();
