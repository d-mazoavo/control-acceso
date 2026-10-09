/* Vigilantes con usuario y PIN: validación sin conexión, turnos y PIN personal */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;

  var ITER = 100000;               // iteraciones PBKDF2-SHA256
  var MAX_FALLOS_USUARIO = 5;      // intentos fallidos por usuario antes del bloqueo
  var MAX_FALLOS_CELULAR = 10;     // intentos fallidos en el celular (cualquier usuario) antes del bloqueo
  var MIN_BLOQUEO = 5;             // minutos de bloqueo

  var P = (AP.Pin = { ITER: ITER });

  P.norm = function (u) { return String(u || '').trim().toLowerCase().replace(/\s+/g, ''); };

  P.hash = async function (pin) {
    var salt = U.randomHex(16);
    return { PinHash: await U.pbkdf2(pin, salt, ITER), PinSalt: salt, PinIter: ITER };
  };

  // Regla del PIN: 6 a 8 dígitos, sin repeticiones ni secuencias evidentes, y que no salga del documento.
  P.regla = function (pin, v) {
    pin = String(pin || '');
    if (!/^\d{6,8}$/.test(pin)) return 'El PIN debe tener entre 6 y 8 dígitos, solo números.';
    if (/^(\d)\1+$/.test(pin)) return 'El PIN no puede ser un mismo dígito repetido.';
    if ('0123456789'.indexOf(pin) >= 0 || '9876543210'.indexOf(pin) >= 0) return 'El PIN no puede ser una secuencia (por ejemplo, 123456).';
    if (v && v.NumDoc && U.normDoc(v.NumDoc).indexOf(pin) >= 0) return 'El PIN no puede formar parte de su número de documento.';
    return null;
  };
  P.temporal = function () { var p; do { p = U.randomDigits(6); } while (P.regla(p)); return p; };

  // PIN personales registrados para un vigilante (los del servidor más los que aún no se han enviado), del más reciente al más antiguo
  P.cambiosDe = function (v, lista) {
    var seen = new Set(), out = [];
    AP.Sync.outbox.forEach(function (o) {
      if (o.kind === 'pin' && String(o.fields.VigilanteId) === String(v.id)) { seen.add(o.fields.IdLocal); out.push(o.fields); }
    });
    (lista || AP.Sync.cambiosPin).forEach(function (c) { if (String(c.VigilanteId) === String(v.id) && !seen.has(c.IdLocal)) out.push(c); });
    return out.sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
  };

  // Credencial vigente: el PIN personal más reciente definido sobre la versión vigente; si no existe, el temporal asignado por el administrador.
  P.credencial = function (v, lista) {
    var ver = Number(v.PinVersion || 0);
    var c = P.cambiosDe(v, lista).filter(function (x) { return Number(x.BaseVersion) === ver; })[0];
    if (c) return { hash: c.PinHash, salt: c.PinSalt, iter: Number(c.PinIter) || ITER, temporal: false, desde: c.FechaHora, version: ver };
    return { hash: v.PinHash, salt: v.PinSalt, iter: Number(v.PinIter) || ITER, temporal: true, desde: v.PinFecha, version: ver };
  };

  P.verificar = async function (v, pin) {
    var cred = P.credencial(v);
    if (!cred.hash || !cred.salt) return false;
    return (await U.pbkdf2(String(pin), cred.salt, cred.iter)) === cred.hash;
  };

  // ---------- Bloqueo por intentos fallidos (en el dispositivo) ----------
  var fallos = null;
  async function getFallos() { if (!fallos) fallos = (await AP.Store.get('pin:fallos')) || {}; return fallos; }
  function guardarFallos() { return AP.Store.set('pin:fallos', fallos); }

  // Valida usuario y PIN contra la copia local. Devuelve { v, cred } o { error }.
  P.ingresar = async function (usuario, pin) {
    var key = P.norm(usuario);
    var f = await getFallos();
    var now = Date.now();
    var lock = Math.max((f[key] && f[key].hasta) || 0, (f['*'] && f['*'].hasta) || 0);
    if (lock > now) return { error: 'Demasiados intentos fallidos. Espere ' + Math.ceil((lock - now) / 60000) + ' min o comuníquese con el supervisor.', bloqueado: true };
    if (!key || !pin) return { error: 'Escriba su usuario y su PIN.' };
    var v = AP.Sync.vigilantes.find(function (x) { return P.norm(x.Usuario) === key; });
    var ok = false;
    try {
      if (v && v.PinHash) ok = await P.verificar(v, pin);
      else await U.pbkdf2(String(pin), '00112233445566778899aabbccddeeff', ITER); // mismo tiempo de respuesta si el usuario no existe
    } catch (e) { return { error: e.message }; }

    if (!ok) {
      var bloqueo = false;
      [[key, MAX_FALLOS_USUARIO], ['*', MAX_FALLOS_CELULAR]].forEach(function (x) {
        var r = f[x[0]] || { n: 0 };
        if (r.hasta && r.hasta <= now) r = { n: 0 };
        r.n++;
        if (r.n >= x[1]) { r.hasta = now + MIN_BLOQUEO * 60000; r.n = 0; bloqueo = true; }
        f[x[0]] = r;
      });
      await guardarFallos();
      if (bloqueo) {
        await P.evento('Bloqueo por intentos fallidos', {
          id: '', vigilanteId: v ? String(v.id) : '', usuario: v ? v.Usuario : String(usuario).slice(0, 40),
          nombre: v ? v.Title : 'Usuario no registrado', rol: v ? v.Rol : ''
        }, { Detalle: 'Bloqueo de ' + MIN_BLOQUEO + ' min en el celular tras intentos fallidos de inicio de turno.' });
        return { error: 'Demasiados intentos fallidos. El inicio de turno queda bloqueado ' + MIN_BLOQUEO + ' min. Se dejó constancia.', bloqueado: true };
      }
      return { error: 'Usuario o PIN incorrecto.' };
    }
    delete f[key]; delete f['*']; await guardarFallos();
    if (v.Activo === false) return { error: 'Su usuario está inactivo. Comuníquese con el supervisor del contratista.' };
    var cred = P.credencial(v);
    var hv = AP.CFG.horasVigenciaPinTemporal || 72;
    if (cred.temporal && v.PinFecha && now - new Date(v.PinFecha).getTime() > hv * 3600000) {
      return { error: 'Su PIN temporal venció (vigencia de ' + hv + ' horas). Solicite el restablecimiento por conducto del supervisor del contratista.' };
    }
    return { v: v, cred: cred };
  };

  // ---------- Turnos ----------
  P.evento = async function (evento, t, extra) {
    var me = AP.Session.user || {};
    var f = Object.assign({
      IdLocal: U.uuid(), Title: t.nombre, Evento: evento, TurnoId: t.id, VigilanteId: t.vigilanteId, VigilanteUsuario: t.usuario, Rol: t.rol,
      FechaHora: new Date().toISOString(), InicioTurno: t.inicio, Dispositivo: U.deviceId(), Cuenta: me.upn, SinConexion: !AP.Sync.state.online
    }, extra || {});
    Object.keys(f).forEach(function (k) { if (f[k] === undefined || f[k] === null || f[k] === '') delete f[k]; });
    f.Hash = await U.hashRecord(f);
    await AP.Sync.enqueue('turno', f);
    return f;
  };

  P.iniciarTurno = async function (v) {
    var t = {
      id: U.uuid(), vigilanteId: String(v.id), usuario: v.Usuario, nombre: v.Title,
      rol: AP.CAT.rolesPin.indexOf(v.Rol) >= 0 ? v.Rol : 'Vigilante', inicio: new Date().toISOString(),
      pinVersion: Number(v.PinVersion || 0), dispositivo: U.deviceId()
    };
    await AP.Store.set('turno:actual', t);
    AP.Session.setTurno(t);
    await P.evento('Inicio de turno', t);
    return t;
  };

  P.resumenTurno = function (t) {
    t = t || AP.Session.turno;
    if (!t) return null;
    var movs = AP.Sync.allMovs().filter(function (m) { return m.TurnoId === t.id; });
    var insp = AP.Sync.outbox.filter(function (o) { return o.kind === 'insp' && o.fields.TurnoId === t.id; }).length;
    return { movs: movs, registros: movs.length, inspeccionesPendientes: insp, pendientes: AP.Sync.pendingCount() };
  };

  P.cerrarTurno = async function (evento, detalle) {
    var t = AP.Session.turno;
    if (!t) return;
    var r = P.resumenTurno(t);
    await P.evento(evento || 'Fin de turno', t, { Registros: r.registros, Pendientes: r.pendientes, Detalle: detalle });
    await AP.Store.del('turno:actual');
    AP.Session.setTurno(null);
  };

  // Cierra el turno si superó la duración máxima, si la credencial fue dada de baja o si el administrador restableció el PIN.
  var vigilando = false;
  P.vigilar = async function () {
    var t = AP.Session.turno;
    if (!t || vigilando) return false;
    vigilando = true;
    try {
      var horas = AP.CFG.horasMaxTurno || 13;
      if (Date.now() - new Date(t.inicio).getTime() > horas * 3600000) {
        await P.cerrarTurno('Cierre automático de turno', 'El turno superó ' + horas + ' horas sin cerrarse.');
        return 'El turno se cerró automáticamente por superar ' + horas + ' horas.';
      }
      if (AP.Sync.vigilantes.length) {
        var v = AP.Sync.vigilantes.find(function (x) { return String(x.id) === t.vigilanteId; });
        if (!v || v.Activo === false) {
          await P.cerrarTurno('Cierre por baja de la credencial', 'La credencial fue desactivada desde la consola.');
          return 'El turno se cerró: la credencial del vigilante fue desactivada.';
        }
        if (Number(v.PinVersion || 0) !== Number(t.pinVersion || 0)) {
          await P.cerrarTurno('Cierre por restablecimiento del PIN', 'El administrador restableció el PIN durante el turno.');
          return 'El turno se cerró: el PIN fue restablecido por el administrador.';
        }
      }
      return false;
    } finally { vigilando = false; }
  };

  // Registra el PIN personal definido por el vigilante. Solo se guarda la huella.
  P.definirPin = async function (v, nuevo, acepta) {
    var f = Object.assign({
      IdLocal: U.uuid(), Title: v.Usuario, VigilanteId: String(v.id), BaseVersion: Number(v.PinVersion || 0),
      FechaHora: new Date().toISOString(), Dispositivo: U.deviceId(), AceptaCondiciones: !!acepta,
      VersionAviso: (AP.TX && AP.TX.versionAvisoVigilante) || ''
    }, await P.hash(nuevo));
    f.Hash = await U.hashRecord(f);
    await AP.Sync.enqueue('pin', f);
    return f;
  };
})();
