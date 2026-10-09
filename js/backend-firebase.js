/*
 * Conexión con Firebase (Google): inicio de sesión con usuario y contraseña, y base de datos Firestore.
 * Nadie usa correo: cada usuario tiene internamente una dirección técnica que nunca ve ni recibe mensajes.
 * Para no agotar la cuota gratuita, cada celular guarda una copia local y solo descarga lo que cambió
 * (el documento meta/cambios indica la última modificación de cada colección).
 */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;

  function err(kind, message, extra) {
    var e = new Error(message);
    e[kind] = true;
    if (extra) Object.assign(e, extra);
    return e;
  }
  AP.mkErr = err;

  var TIMEOUT = 20000;            // ms sin respuesta del servidor = sin conexión
  var SOLAPE = 120000;            // ms que se repiten en cada consulta incremental (escrituras simultáneas)
  var MAX_FOTO = 700000;          // bytes máximos de una fotografía de evidencia (límite de Firestore: 1 MiB por documento)
  var LIMITE_CONSULTA = 5000;     // registros máximos de una consulta histórica (protege la cuota gratuita)
  var DIAS_COPIA = 120;           // días de historial que la consola conserva en su copia local
  // Colecciones cuyo identificador es el IdLocal generado en el celular: un reintento nunca duplica el registro.
  var POR_IDLOCAL = { AP_Movimientos: 1, AP_Inspecciones: 1, AP_Turnos: 1, AP_Verificaciones: 1 };
  // Campos pesados que se guardan aparte para no descargarlos en cada sincronización.
  var PESADOS = { AP_Personas: ['Foto'], AP_Visitas: ['Foto'] };

  var app = null, auth = null, db = null, cfg = null;
  var usuarioAuth = null;   // usuario de Firebase Authentication
  var cuenta = null;        // cuentas/{uid}: { vigilanteId, usuario, rol, activo }
  var perfil = null;        // AP_Vigilantes/{vigilanteId}
  var mem = {};             // copia local por colección
  var marcador = null, marcadorAt = 0;
  var ultimaMedicion = 0;
  var enVuelo = {};         // envíos de fotografías en curso

  function FV() { return firebase.firestore.FieldValue; }
  function ts() { return FV().serverTimestamp(); }
  function millis(v) { return v && v.toMillis ? v.toMillis() : (typeof v === 'number' ? v : 0); }
  function iso(v) { return v && v.toDate ? v.toDate().toISOString() : (typeof v === 'string' ? v : null); }
  function norm(u) { return String(u || '').trim().toLowerCase().replace(/\s+/g, ''); }
  function emailDe(usuario, version) { return norm(usuario) + '.' + (version || 1) + '@' + (cfg.dominioUsuarios || 'usuarios.avo-pak.com'); }
  function venceTemporal() { return firebase.firestore.Timestamp.fromMillis(Date.now() + (cfg.horasVigenciaPinTemporal || 72) * 3600000); }
  function esConsola() { return !!(cuenta && (cuenta.rol === 'Administrador' || cuenta.rol === 'Analista')); }

  // ---------- Errores y tiempo de espera ----------
  function codigo(e) { return String((e && e.code) || '').replace(/^(firestore|auth)\//, ''); }
  function mapErr(e) {
    if (!e) return err('api', 'Error desconocido.');
    if (e.offline || e.authRequired || e.api) return e;
    var c = codigo(e);
    if (c === 'unavailable' || c === 'deadline-exceeded' || c === 'network-request-failed') return err('offline', 'Sin conexión con el servidor.');
    if (c === 'unauthenticated' || c === 'user-token-expired' || c === 'user-disabled' || c === 'requires-recent-login') return err('authRequired', 'La sesión expiró. Vuelva a iniciar sesión.');
    if (c === 'permission-denied') return err('api', 'Sin permiso para esta operación.', { status: 403, code: c });
    if (c === 'not-found') return err('api', 'Registro no encontrado.', { status: 404, code: c });
    if (c === 'already-exists') return err('api', 'El registro ya existe.', { status: 409, code: c });
    if (c === 'resource-exhausted' || c === 'quota-exceeded') return err('api', 'Se alcanzó el límite diario del plan gratuito de Firebase. Los registros quedan guardados en el celular y se enviarán después.', { status: 429, code: c });
    if (c === 'too-many-requests') return err('api', 'Demasiados intentos. Espere unos minutos e intente de nuevo.', { status: 429, code: c });
    return err('api', (e && e.message) || String(e), { code: c });
  }
  // Ejecuta una operación con tiempo máximo; sin internet falla de inmediato.
  async function crudo(fn, ms) {
    if (navigator.onLine === false) throw err('offline', 'Sin conexión.');
    var t;
    try {
      return await Promise.race([fn(), new Promise(function (_, rej) {
        t = setTimeout(function () { rej(err('offline', 'El servidor no respondió (conexión lenta o ausente).', { timeout: true })); }, ms || TIMEOUT);
      })]);
    } finally { clearTimeout(t); }
  }
  async function run(fn, ms) {
    try { return await crudo(fn, ms); } catch (e) { throw mapErr(e); }
  }
  // Operación sobre datos: si se niega el permiso, se verifica si el usuario fue desactivado.
  async function op(fn, ms) {
    try { return await run(fn, ms); }
    catch (e) {
      if (e.status === 403 && usuarioAuth) {
        var c = null;
        try { c = await run(function () { return db.doc('cuentas/' + usuarioAuth.uid).get({ source: 'server' }); }); } catch (x) { c = null; }
        if (c && (!c.exists || c.data().activo !== true)) {
          FB.inactivo = true;
          throw err('authRequired', 'Su usuario fue dado de baja o su contraseña fue restablecida por el administrador.', { inactivo: true });
        }
      }
      throw e;
    }
  }

  // ---------- Formato de los registros ----------
  function normDoc(doc) {
    var d = doc.data() || {};
    var o = {};
    Object.keys(d).forEach(function (k) { if (k[0] !== '_') o[k] = d[k]; });
    o.id = doc.id;
    o._mod = millis(d._mod);
    o._etag = String(o._mod);
    o._created = iso(d._creado);
    o._modified = iso(d._mod);
    o._createdBy = d._creadoPorUsuario || '';
    o._modifiedBy = d._modPorUsuario || '';
    if (d._borrado) o._borrado = true;
    return o;
  }
  function limpiar(list, fields, forUpdate) {
    var types = {};
    (AP.SCHEMA[list] ? AP.SCHEMA[list].cols : []).forEach(function (c) { types[c[0]] = c[1]; });
    var o = {};
    Object.keys(fields || {}).forEach(function (k) {
      if (k[0] === '_' || k === 'id') return;
      if (k !== 'Title' && !types[k]) return;
      var v = fields[k], t = types[k];
      if (v === undefined) return;
      if (v === null || v === '') {
        if (forUpdate) o[k] = (t === 'datetime' || t === 'number' || t === 'bool') ? null : '';
        return;
      }
      if (t === 'number') v = Number(v);
      if (t === 'bool') v = !!v;
      if (t === 'datetime') v = U.toDate(v).toISOString();
      if ((t === 'text' || k === 'Title') && typeof v !== 'string') v = String(v);
      if ((t === 'text' || k === 'Title') && v.length > 255) v = v.slice(0, 255);
      o[k] = v;
    });
    return o;
  }
  function separarPesados(list, o) {
    var cols = PESADOS[list];
    if (!cols) return null;
    var p = null;
    cols.forEach(function (c) { if (c in o) { p = p || {}; p[c] = o[c]; delete o[c]; } });
    return p;
  }
  function sello(nuevo) {
    var quien = cuenta ? cuenta.usuario : '';
    var s = { _mod: ts(), _modPor: usuarioAuth.uid, _modPorUsuario: quien };
    if (nuevo) { s._creado = ts(); s._creadoPor = usuarioAuth.uid; s._creadoPorUsuario = quien; }
    return s;
  }
  // Toda escritura avisa en meta/cambios qué colección cambió (las reglas lo exigen).
  function marcar(batch, lists) {
    var o = {};
    lists.forEach(function (l) { o[l] = ts(); });
    batch.set(db.doc('meta/cambios'), o, { merge: true });
  }

  // ---------- Copia local por colección ----------
  async function copia(list) {
    if (!mem[list]) mem[list] = (await AP.Store.get('fb:' + list)) || { docs: {}, cursor: null, full: false, ranges: {} };
    return mem[list];
  }
  function guardar(list) { return mem[list] ? AP.Store.set('fb:' + list, mem[list]) : Promise.resolve(); }
  function poner(list, rec) {
    var c = mem[list];
    if (!c) return;
    c.docs[rec.id] = Object.assign({}, c.docs[rec.id] || {}, rec);
    guardar(list);
  }
  function valores(c, opt) {
    var ex = (opt && opt.exclude) || [];
    return Object.keys(c.docs).map(function (id) { return c.docs[id]; })
      .filter(function (r) { return !r._borrado; })
      .map(function (r) { var o = Object.assign({}, r); ex.forEach(function (k) { delete o[k]; }); return o; });
  }
  async function leerMarcador(force) {
    if (!force && marcador && Date.now() - marcadorAt < 5000) return marcador;
    var s = await op(function () { return db.doc('meta/cambios').get({ source: 'server' }); });
    var d = s.exists ? s.data() : {};
    var m = {};
    Object.keys(d).forEach(function (k) { m[k] = millis(d[k]); });
    marcador = m; marcadorAt = Date.now();
    return m;
  }
  // Trae solo lo modificado desde la última consulta
  async function refrescar(list, c) {
    var m = await leerMarcador();
    var mk = m[list] || 0;
    if (c.cursor != null && mk <= c.cursor) return;
    var desde = Math.max(0, (c.cursor || 0) - SOLAPE);
    var snap = await op(function () {
      return db.collection(list).where('_mod', '>', firebase.firestore.Timestamp.fromMillis(desde)).get({ source: 'server' });
    });
    snap.forEach(function (d) { c.docs[d.id] = normDoc(d); });
    c.cursor = mk;
    await guardar(list);
  }
  // En los celulares de portería solo se conserva el periodo que se usa (minimización de datos).
  function podar(list, c, field, desdeIso) {
    if (esConsola() || c.full) return;
    var have = c.ranges[field];
    if (!have || have >= desdeIso) return;
    var borro = false;
    Object.keys(c.docs).forEach(function (id) {
      var v = c.docs[id][field];
      if (!v || v < desdeIso) { delete c.docs[id]; borro = true; }
    });
    c.ranges[field] = desdeIso;
    if (borro) guardar(list);
  }

  // ---------- Sesión ----------
  async function guardarSesion() {
    if (!usuarioAuth) return;
    await AP.Store.set('fb:sesion', { uid: usuarioAuth.uid, cuenta: cuenta, perfil: perfil });
  }
  async function cargarSesion() {
    var cs = await run(function () { return db.doc('cuentas/' + usuarioAuth.uid).get({ source: 'server' }); });
    if (!cs.exists) throw err('api', 'Este usuario no está habilitado en la aplicación.', { sinCuenta: true });
    cuenta = cs.data();
    if (cuenta.activo !== true) throw err('api', 'Su usuario está inactivo o su contraseña fue restablecida. Comuníquese con el Director de Seguridad Integral.', { inactivo: true });
    if (cuenta.temporalHasta && millis(cuenta.temporalHasta) < Date.now()) {
      throw err('api', 'Su PIN temporal venció (vigencia de ' + (cfg.horasVigenciaPinTemporal || 72) + ' horas). Solicite el restablecimiento al Director de Seguridad Integral.', { inactivo: true });
    }
    cuenta = Object.assign({}, cuenta, { temporalHasta: cuenta.temporalHasta ? millis(cuenta.temporalHasta) : null });
    var ps = await run(function () { return db.doc('AP_Vigilantes/' + cuenta.vigilanteId).get({ source: 'server' }); });
    perfil = ps.exists ? normDoc(ps) : null;
    if (perfil && perfil.PinTemporal && (await AP.Store.get('fb:clavePendiente')) === usuarioAuth.uid) {
      // La contraseña personal ya se cambió pero no alcanzó a registrarse en el perfil
      try { await registrarClavePersonal(); } catch (e) { /* se reintenta en la próxima sesión */ }
    }
    await guardarSesion();
  }
  async function registrarClavePersonal() {
    var cambios = { PinTemporal: false, PinPersonalDesde: new Date().toISOString() };
    await op(function () {
      var b = db.batch();
      b.update(db.doc('AP_Vigilantes/' + cuenta.vigilanteId), Object.assign({}, cambios, sello(false)));
      if (cuenta.temporalHasta) b.update(db.doc('cuentas/' + usuarioAuth.uid), { temporalHasta: null });
      marcar(b, ['AP_Vigilantes']);
      return b.commit();
    });
    perfil = Object.assign({}, perfil, cambios);
    cuenta = Object.assign({}, cuenta, { temporalHasta: null });
    await AP.Store.del('fb:clavePendiente');
    await guardarSesion();
  }
  async function salir() {
    try { if (auth) await auth.signOut(); } catch (e) { /* sin conexión: la sesión local se cierra igual */ }
    usuarioAuth = null; cuenta = null; perfil = null; FB.inactivo = false;
    await AP.Store.del('fb:sesion');
    // Al cerrar sesión se borra la copia local de datos (no los registros pendientes de envío)
    var keys = Object.keys(AP.SCHEMA);
    for (var i = 0; i < keys.length; i++) await AP.Store.del('fb:' + keys[i]);
    mem = {}; marcador = null;
  }

  // Crea la identidad de acceso en una instancia aparte, para no cerrar la sesión de quien la crea.
  async function crearIdentidad(usuario, version, clave) {
    var sec = firebase.initializeApp(cfg.firebase, 'alta-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
    try {
      var a2 = sec.auth();
      if (cfg.emulador && cfg.emulador.auth) a2.useEmulator(cfg.emulador.auth, { disableWarnings: true });
      await a2.setPersistence(firebase.auth.Auth.Persistence.NONE);
      for (var v = version, intentos = 0; intentos < 10; v++, intentos++) {
        try {
          var r = await crudo(function () { return a2.createUserWithEmailAndPassword(emailDe(usuario, v), String(clave)); });
          var uid = r.user.uid;
          try { await a2.signOut(); } catch (e) { /* ignorar */ }
          return { uid: uid, version: v };
        } catch (e) {
          // Una identidad huérfana de un intento anterior: se usa la siguiente versión
          if (codigo(e) === 'email-already-in-use') continue;
          if (codigo(e) === 'weak-password') throw err('api', 'La contraseña es demasiado débil (mínimo 6 caracteres).');
          throw mapErr(e);
        }
      }
      throw err('api', 'No fue posible crear la cuenta de acceso. Intente de nuevo.');
    } finally { try { await sec.delete(); } catch (e) { /* ignorar */ } }
  }

  var FB = (AP.Firebase = {
    name: 'firebase',
    inactivo: false,
    skewSeconds: null,

    init: async function (config) {
      cfg = config;
      if (!window.firebase || !firebase.firestore || !firebase.auth) throw new Error('No se cargó la librería de Firebase.');
      var fc = cfg.firebase || {};
      if (!fc.apiKey || !fc.projectId || /PEGAR|COMPLETAR/i.test(fc.apiKey + fc.projectId)) {
        throw err('config', 'La aplicación aún no está conectada a Firebase: complete el bloque "firebase" de config.js.');
      }
      app = firebase.initializeApp(fc);
      auth = app.auth();
      db = app.firestore();
      db.settings({ ignoreUndefinedProperties: true, merge: true });
      if (cfg.emulador) {
        if (cfg.emulador.auth) auth.useEmulator(cfg.emulador.auth, { disableWarnings: true });
        if (cfg.emulador.firestore) db.useEmulator(cfg.emulador.firestore[0], cfg.emulador.firestore[1]);
      }
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      usuarioAuth = await new Promise(function (res) { var off = auth.onAuthStateChanged(function (u) { off(); res(u); }); });
      if (!usuarioAuth) return false;
      var loc = await AP.Store.get('fb:sesion');
      if (loc && loc.uid === usuarioAuth.uid) { cuenta = loc.cuenta; perfil = loc.perfil; }
      try {
        await cargarSesion();
      } catch (e) {
        if (e.inactivo || e.sinCuenta || e.authRequired) {
          FB.lastLoginError = e.message;
          await salir();
          return false;
        }
        // Error pasajero (sin internet, cuota diaria agotada, servidor no disponible): se sigue con la copia local
        if (cuenta) return true;
        FB.lastLoginError = 'No fue posible verificar su usuario en este momento: ' + e.message;
        return false;
      }
      return true;
    },

    me: function () {
      if (!usuarioAuth || !cuenta) return null;
      return {
        uid: usuarioAuth.uid, upn: cuenta.usuario, usuario: cuenta.usuario, rol: cuenta.rol, vigilanteId: cuenta.vigilanteId,
        nombre: (perfil && perfil.Title) || cuenta.usuario, perfil: perfil
      };
    },

    login: async function (usuario, clave) {
      var u = norm(usuario);
      if (!u || !clave) throw err('api', 'Escriba su usuario y su contraseña.');
      var ld = await run(function () { return db.doc('login/' + u).get({ source: 'server' }); });
      if (!ld.exists) { await U.sleep(600); throw err('api', 'Usuario o contraseña incorrectos.'); }
      try {
        var cred = await crudo(function () { return auth.signInWithEmailAndPassword(ld.data().email, String(clave)); });
        usuarioAuth = cred.user;
      } catch (e) {
        var c = codigo(e);
        if (/wrong-password|invalid-credential|user-not-found|invalid-login-credentials|invalid-email/.test(c)) throw err('api', 'Usuario o contraseña incorrectos.');
        if (c === 'too-many-requests') throw err('api', 'Demasiados intentos fallidos con este usuario. El acceso queda bloqueado temporalmente; intente en unos minutos.');
        if (c === 'user-disabled') throw err('api', 'Su usuario está inhabilitado.');
        throw mapErr(e);
      }
      try { await cargarSesion(); }
      catch (e) { await salir(); throw e; }
      return FB.me();
    },
    relogin: function () { return AP.Views && AP.Views.logout ? AP.Views.logout() : FB.logout(); },
    logout: async function () {
      await salir();
      AP.endSession();
      location.hash = '#/';
      AP.render();
    },
    salir: salir,

    // Perfil propio actualizado (para vigilar bajas y restablecimientos durante el turno)
    miPerfil: async function () {
      if (!cuenta) return null;
      var s = await op(function () { return db.doc('AP_Vigilantes/' + cuenta.vigilanteId).get({ source: 'server' }); });
      perfil = s.exists ? normDoc(s) : perfil;
      await guardarSesion();
      return perfil;
    },

    cambiarClave: async function (actual, nueva) {
      if (!usuarioAuth) throw err('authRequired', 'Debe iniciar sesión.');
      try {
        var c = firebase.auth.EmailAuthProvider.credential(usuarioAuth.email, String(actual));
        await crudo(function () { return usuarioAuth.reauthenticateWithCredential(c); });
      } catch (e) {
        if (/wrong-password|invalid-credential|invalid-login-credentials/.test(codigo(e))) throw err('api', 'La contraseña o PIN actual no es correcto.');
        throw mapErr(e);
      }
      try { await crudo(function () { return usuarioAuth.updatePassword(String(nueva)); }); }
      catch (e) {
        if (codigo(e) === 'weak-password') throw err('api', 'La contraseña es demasiado débil.');
        throw mapErr(e);
      }
      await AP.Store.set('fb:clavePendiente', usuarioAuth.uid);
      try { await registrarClavePersonal(); } catch (e) { /* queda pendiente; se registra al volver a iniciar sesión */ }
    },

    // ---------- Lectura ----------
    listAll: async function (list, opt) {
      var c = await copia(list);
      if (!c.full) {
        var m = await leerMarcador(true);
        var snap = await op(function () { return db.collection(list).get({ source: 'server' }); });
        c.docs = {};
        snap.forEach(function (d) { c.docs[d.id] = normDoc(d); });
        c.full = true; c.ranges = {}; c.cursor = m[list] || 0;
        await guardar(list);
      } else {
        await refrescar(list, c);
      }
      return valores(c, opt);
    },

    listRange: async function (list, field, desde, hasta, opt) {
      var c = await copia(list);
      var a = U.toDate(desde).toISOString();
      var b = hasta ? U.toDate(hasta).toISOString() : null;
      var have = c.ranges[field];
      var cubierto = c.full || (have && a >= have);
      var reciente = a >= new Date(Date.now() - DIAS_COPIA * 864e5).toISOString();
      var llegaAHoy = !b || !have || b >= have;
      if (!cubierto && (!have || esConsola()) && reciente && llegaAHoy) {
        // Se amplía la copia local (solo lo que falta) y en adelante solo se descargan los cambios
        var m = await leerMarcador(true);
        var q = db.collection(list).where(field, '>=', a);
        if (have) q = q.where(field, '<', have);
        var snap = await op(function () { return q.get({ source: 'server' }); });
        snap.forEach(function (d) { c.docs[d.id] = normDoc(d); });
        c.ranges[field] = a;
        if (c.cursor == null) c.cursor = m[list] || 0;
        await guardar(list);
        cubierto = true;
      }
      if (!cubierto) {
        // Consulta histórica puntual: no se guarda en el celular y tiene tope de registros
        var q2 = db.collection(list).where(field, '>=', a).where(field, '<=', b || new Date(Date.now() + 864e5).toISOString()).limit(LIMITE_CONSULTA);
        var s2 = await op(function () { return q2.get({ source: 'server' }); }, 60000);
        if (s2.size >= LIMITE_CONSULTA) throw err('api', 'La consulta supera ' + LIMITE_CONSULTA + ' registros. Reduzca el rango de fechas.');
        var out = [];
        s2.forEach(function (d) { var r = normDoc(d); if (!r._borrado) out.push(r); });
        return out;
      }
      await refrescar(list, c);
      podar(list, c, field, a);
      return valores(c, opt).filter(function (r) { var v = r[field]; return v && v >= a && (!b || v <= b); });
    },

    findBy: async function (list, field, value) {
      if (field === 'IdLocal' && POR_IDLOCAL[list]) {
        var s = await op(function () { return db.collection(list).doc(String(value)).get({ source: 'server' }); });
        return s.exists ? [normDoc(s)] : [];
      }
      var snap = await op(function () { return db.collection(list).where(field, '==', value).limit(50).get({ source: 'server' }); });
      var out = [];
      snap.forEach(function (d) { out.push(normDoc(d)); });
      return out;
    },

    // Columnas puntuales de varios registros (p. ej., la foto de las personas)
    getFields: async function (list, ids, cols) {
      var out = {};
      var pes = (PESADOS[list] || []).filter(function (k) { return cols.indexOf(k) >= 0; });
      var liv = cols.filter(function (k) { return pes.indexOf(k) < 0; });
      var c = await copia(list);
      var faltan = [];
      ids.forEach(function (id) {
        out[id] = {};
        var r = c.docs[id];
        if (!r && liv.length) faltan.push(id);
        liv.forEach(function (k) { if (r) out[id][k] = r[k]; });
      });
      var docId = firebase.firestore.FieldPath.documentId();
      var grupos = U.chunk(faltan, 30);
      for (var g = 0; g < grupos.length; g++) {
        var s1 = await op(function () { return db.collection(list).where(docId, 'in', grupos[g]).get({ source: 'server' }); });
        s1.forEach(function (d) { var r = normDoc(d); liv.forEach(function (k) { out[d.id][k] = r[k]; }); });
      }
      if (pes.length) {
        var gp = U.chunk(ids.map(String), 30);
        for (var j = 0; j < gp.length; j++) {
          var s2 = await op(function () { return db.collection(list + '_Foto').where(docId, 'in', gp[j]).get({ source: 'server' }); });
          s2.forEach(function (d) { var x = d.data(); pes.forEach(function (k) { out[d.id] = out[d.id] || {}; out[d.id][k] = x[k] || ''; }); });
        }
      }
      return out;
    },

    // ---------- Escritura ----------
    create: async function (list, fields) {
      var o = limpiar(list, fields, false);
      var pes = separarPesados(list, o);
      var ref = POR_IDLOCAL[list] && fields.IdLocal ? db.collection(list).doc(String(fields.IdLocal)) : db.collection(list).doc();
      var enviado = Date.now();
      try {
        await op(function () {
          var b = db.batch();
          b.set(ref, Object.assign({}, o, sello(true)));
          if (pes) b.set(db.collection(list + '_Foto').doc(ref.id), Object.assign({}, pes, { _mod: ts(), _modPor: usuarioAuth.uid }));
          marcar(b, [list]);
          return b.commit();
        });
      } catch (e) {
        if (e.status === 403 && POR_IDLOCAL[list]) {
          var ya = null;
          try { ya = await run(function () { return ref.get({ source: 'server' }); }); } catch (x) { ya = null; }
          if (ya && ya.exists) throw err('api', 'El registro ya había sido enviado.', { status: 409 });
        }
        throw e;
      }
      var rec = Object.assign({}, o, pes || {}, { id: ref.id, _mod: 0, _etag: 'local-' + enviado, _created: new Date(enviado).toISOString(), _modified: new Date(enviado).toISOString(), _createdBy: cuenta ? cuenta.usuario : '' });
      poner(list, rec);
      if (list === 'AP_Movimientos') FB._medirDesfase(ref, enviado);
      return rec;
    },

    update: async function (list, id, fields) {
      var o = limpiar(list, fields, true);
      var pes = separarPesados(list, o);
      var ref = db.collection(list).doc(String(id));
      await op(function () {
        var b = db.batch();
        b.update(ref, Object.assign({}, o, sello(false)));
        if (pes) b.set(db.collection(list + '_Foto').doc(String(id)), Object.assign({}, pes, { _mod: ts(), _modPor: usuarioAuth.uid }));
        marcar(b, [list]);
        return b.commit();
      });
      var c = mem[list];
      var prev = c && c.docs[id] ? c.docs[id] : {};
      var rec = Object.assign({}, prev, o, pes || {}, { id: String(id), _mod: 0, _etag: 'local-' + Date.now(), _modified: new Date().toISOString() });
      poner(list, rec);
      return rec;
    },

    // No se borra información: se marca como retirada
    remove: async function (list, id) {
      await op(function () {
        var b = db.batch();
        b.update(db.collection(list).doc(String(id)), Object.assign({ _borrado: true }, sello(false)));
        marcar(b, [list]);
        return b.commit();
      });
      if (mem[list] && mem[list].docs[id]) { mem[list].docs[id]._borrado = true; guardar(list); }
    },

    // Fotografía de evidencia: se guarda tal cual (su huella SHA-256 quedó registrada en la inspección)
    upload: async function (relPath, blob) {
      if (blob.size > MAX_FOTO) throw err('api', 'La fotografía supera el tamaño permitido (' + Math.round(blob.size / 1024) + ' KB). Tómela de nuevo.');
      var id = relPath.replace(/\//g, '|');
      var ref = db.collection('AP_Archivos').doc(id);
      var datos = await U.blobToBase64(blob);
      // Si la misma foto ya se está enviando (conexión lenta), se espera ese envío en lugar de repetirlo
      enVuelo[id] = enVuelo[id] || ref.set({ Ruta: relPath, Tipo: blob.type || 'image/jpeg', Bytes: blob.size, Datos: datos, _creado: ts(), _creadoPor: usuarioAuth.uid, _creadoPorUsuario: cuenta ? cuenta.usuario : '' })
        .then(function (r) { delete enVuelo[id]; return r; }, function (e) { delete enVuelo[id]; throw e; });
      try {
        // Tiempo de espera proporcional al tamaño (mínimo 30 s; ~15 KB/s en conexiones lentas)
        await op(function () { return enVuelo[id] || Promise.resolve(); }, Math.max(30000, Math.round(datos.length / 15)));
      } catch (e) {
        if (e.status === 403) {
          var s = null;
          try { s = await run(function () { return ref.get({ source: 'server' }); }); } catch (x) { s = null; }
          if (s && s.exists) return { path: relPath, webUrl: '', id: id, existed: true };
        }
        throw e;
      }
      return { path: relPath, webUrl: '', id: id };
    },

    fileUrl: async function (relPath) {
      var s = await op(function () { return db.collection('AP_Archivos').doc(relPath.replace(/\//g, '|')).get({ source: 'server' }); });
      if (!s.exists) return '';
      var d = s.data();
      var bin = atob(d.Datos || '');
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: d.Tipo || 'image/jpeg' }));
    },

    // Sin servidor de correo: se comparte la imagen (WhatsApp, correo del celular) o se descarga y se abre el correo.
    sendMail: async function (msg) {
      var texto = String(msg.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|div|table)>/gi, '\n').replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
      var a = (msg.attachments || [])[0];
      var file = null;
      if (a) {
        var bin = atob(a.base64), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        file = new File([arr], a.name, { type: a.type });
      }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: msg.subject, text: texto }); return null; }
        catch (e) { if (e && e.name === 'AbortError') throw err('api', 'Envío cancelado.'); }
      }
      if (file) U.download(file, file.name);
      var to = (msg.to || []).join(','), cc = (msg.cc || []).join(',');
      location.href = 'mailto:' + encodeURIComponent(to).replace(/%2C/g, ',') + '?subject=' + encodeURIComponent(msg.subject) +
        (cc ? '&cc=' + encodeURIComponent(cc) : '') + '&body=' + encodeURIComponent(texto + (file ? '\n\n(Adjunte la imagen descargada: ' + file.name + ')' : ''));
      AP.toast('Se descargó la imagen y se abrió su correo: adjúntela antes de enviar.', 'info', 9000);
      return null;
    },

    // ---------- Administración de usuarios ----------
    usuarioLibre: async function (usuario) {
      var s = await op(function () { return db.doc('login/' + norm(usuario)).get({ source: 'server' }); });
      return !s.exists;
    },

    _cuentasActivas: async function (vigilanteId) {
      var s = await op(function () { return db.collection('cuentas').where('vigilanteId', '==', String(vigilanteId)).where('activo', '==', true).get({ source: 'server' }); });
      var out = [];
      s.forEach(function (d) { out.push(d.id); });
      return out;
    },

    crearUsuario: async function (datos, clave) {
      var u = norm(datos.Usuario);
      if (!(await FB.usuarioLibre(u))) throw err('api', 'Ese usuario ya existe (puede estar de baja). Elija otro.', { status: 409 });
      var ident = await crearIdentidad(u, 1, clave);
      var ref = db.collection('AP_Vigilantes').doc();
      var ahora = new Date().toISOString();
      var rec = limpiar('AP_Vigilantes', Object.assign({}, datos, {
        Usuario: u, Uid: ident.uid, Activo: true, PinVersion: ident.version, PinTemporal: true, PinFecha: ahora, PinPor: cuenta.usuario,
        FechaAlta: ahora, AltaPor: cuenta.usuario
      }), false);
      await op(function () {
        var b = db.batch();
        b.set(ref, Object.assign({}, rec, sello(true)));
        b.set(db.doc('cuentas/' + ident.uid), { vigilanteId: ref.id, usuario: u, rol: rec.Rol, activo: true, temporalHasta: venceTemporal(), _mod: ts(), _modPor: usuarioAuth.uid });
        b.set(db.doc('login/' + u), { email: emailDe(u, ident.version), _mod: ts() });
        marcar(b, ['AP_Vigilantes']);
        return b.commit();
      });
      var out = Object.assign({}, rec, { id: ref.id });
      poner('AP_Vigilantes', out);
      return out;
    },

    editarUsuario: async function (v, datos) {
      var o = limpiar('AP_Vigilantes', datos, true);
      delete o.Usuario; delete o.Uid; delete o.Activo; delete o.PinVersion; delete o.PinTemporal;
      var uids = o.Rol ? await FB._cuentasActivas(v.id) : [];
      await op(function () {
        var b = db.batch();
        b.update(db.doc('AP_Vigilantes/' + v.id), Object.assign({}, o, sello(false)));
        uids.forEach(function (uid) { b.update(db.doc('cuentas/' + uid), { rol: o.Rol, _mod: ts(), _modPor: usuarioAuth.uid }); });
        marcar(b, ['AP_Vigilantes']);
        return b.commit();
      });
      var out = Object.assign({}, v, o);
      poner('AP_Vigilantes', out);
      return out;
    },

    // Nueva contraseña temporal: se crea una identidad nueva y la anterior queda sin efecto
    restablecerUsuario: async function (v, clave, extra) {
      // Se toma la ficha vigente del servidor (otra sesión pudo haberla cambiado)
      var fs0 = await op(function () { return db.doc('AP_Vigilantes/' + v.id).get({ source: 'server' }); });
      if (fs0.exists) v = Object.assign({}, v, normDoc(fs0));
      var anteriores = await FB._cuentasActivas(v.id);
      var ident = await crearIdentidad(v.Usuario, (Number(v.PinVersion) || 1) + 1, clave);
      var ahora = new Date().toISOString();
      var upd = limpiar('AP_Vigilantes', Object.assign({ Uid: ident.uid, PinVersion: ident.version, PinTemporal: true, PinFecha: ahora, PinPor: cuenta.usuario }, extra || {}), true);
      await op(function () {
        var b = db.batch();
        b.update(db.doc('AP_Vigilantes/' + v.id), Object.assign({}, upd, sello(false)));
        b.set(db.doc('cuentas/' + ident.uid), { vigilanteId: v.id, usuario: v.Usuario, rol: v.Rol, activo: true, temporalHasta: venceTemporal(), _mod: ts(), _modPor: usuarioAuth.uid });
        anteriores.concat(v.Uid ? [v.Uid] : []).forEach(function (uid) {
          if (uid !== ident.uid) b.set(db.doc('cuentas/' + uid), { activo: false, reemplazadaPor: ident.uid, _mod: ts(), _modPor: usuarioAuth.uid }, { merge: true });
        });
        b.set(db.doc('login/' + norm(v.Usuario)), { email: emailDe(v.Usuario, ident.version), _mod: ts() });
        marcar(b, ['AP_Vigilantes']);
        return b.commit();
      });
      var out = Object.assign({}, v, upd);
      poner('AP_Vigilantes', out);
      return out;
    },

    bajaUsuario: async function (v, extra) {
      var upd = limpiar('AP_Vigilantes', Object.assign({ Activo: false }, extra || {}), true);
      var uids = await FB._cuentasActivas(v.id);
      if (v.Uid && uids.indexOf(v.Uid) < 0) uids.push(v.Uid);
      await op(function () {
        var b = db.batch();
        b.update(db.doc('AP_Vigilantes/' + v.id), Object.assign({}, upd, sello(false)));
        uids.forEach(function (uid) { b.set(db.doc('cuentas/' + uid), { activo: false, _mod: ts(), _modPor: usuarioAuth.uid }, { merge: true }); });
        marcar(b, ['AP_Vigilantes']);
        return b.commit();
      });
      var out = Object.assign({}, v, upd);
      poner('AP_Vigilantes', out);
      return out;
    },

    // ---------- Instalación inicial ----------
    instalar: async function (o) {
      var u = norm(o.usuario);
      var cred;
      try { cred = await crudo(function () { return auth.createUserWithEmailAndPassword(emailDe(u, 1), String(o.clave)); }); }
      catch (e) {
        if (codigo(e) === 'email-already-in-use') throw err('api', 'Ese usuario ya fue usado en un intento anterior. Escriba otro usuario.');
        if (codigo(e) === 'weak-password') throw err('api', 'La contraseña es demasiado débil.');
        throw mapErr(e);
      }
      usuarioAuth = cred.user;
      var ref = db.collection('AP_Vigilantes').doc();
      var ahora = new Date().toISOString();
      cuenta = { vigilanteId: ref.id, usuario: u, rol: 'Administrador', activo: true };
      var rec = limpiar('AP_Vigilantes', {
        Title: o.nombre, TipoDoc: o.tipoDoc || 'CC', NumDoc: o.numDoc, Empresa: cfg.empresa || '', Cargo: o.cargo || 'Director de Seguridad Integral',
        Usuario: u, Uid: usuarioAuth.uid, Rol: 'Administrador', Activo: true, PinVersion: 1, PinTemporal: false, PinFecha: ahora, PinPersonalDesde: ahora,
        PinPor: u, FechaAlta: ahora, AltaPor: u, SolicitadoPor: 'Instalación inicial', Observaciones: 'Administrador creado en la instalación de la aplicación.'
      }, false);
      var marcas = {};
      Object.keys(AP.SCHEMA).forEach(function (l) { marcas[l] = ts(); });
      try {
        await run(function () {
          var b = db.batch();
          b.set(db.doc('config/instalacion'), { codigo: String(o.codigo || '').trim().toUpperCase(), adminUid: usuarioAuth.uid, usuario: u, fecha: ts() });
          b.set(ref, Object.assign({}, rec, sello(true)));
          b.set(db.doc('cuentas/' + usuarioAuth.uid), { vigilanteId: ref.id, usuario: u, rol: 'Administrador', activo: true, _mod: ts(), _modPor: usuarioAuth.uid });
          b.set(db.doc('login/' + u), { email: emailDe(u, 1), _mod: ts() });
          b.set(db.doc('meta/cambios'), marcas);
          return b.commit();
        });
      } catch (e) {
        try { await usuarioAuth.delete(); } catch (x) { /* ignorar */ }
        await salir();
        if (e.status === 403) throw err('api', 'Código de instalación incorrecto, o la aplicación ya fue instalada.');
        throw e;
      }
      await cargarSesion();
      return FB.me();
    },

    // Diferencia entre la hora del celular y la del servidor (se mide como máximo cada 10 minutos)
    _medirDesfase: function (ref, enviado) {
      if (Date.now() - ultimaMedicion < 600000) return;
      ultimaMedicion = Date.now();
      var t0 = Date.now();
      run(function () { return ref.get({ source: 'server' }); }).then(function (s) {
        var c = s.exists && s.data()._creado;
        if (!c) return;
        var lat = (Date.now() - t0) / 2;
        FB.skewSeconds = Math.round((enviado + lat / 2 - millis(c)) / 1000);
      }).catch(function () { /* se mide en otra ocasión */ });
    },

    provision: async function (log) {
      log('Firebase no requiere crear estructura: cada colección se crea sola con su primer registro.');
      log('Las reglas de seguridad se publican desde la consola de Firebase (ver la guía de instalación).');
      return {};
    },
    status: async function () {
      await leerMarcador(true);
      var o = { site: true, lists: {} };
      Object.keys(AP.SCHEMA).forEach(function (n) { o.lists[n] = true; });
      return o;
    }
  });
})();
