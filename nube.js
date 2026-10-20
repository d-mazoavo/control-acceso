/* =====================================================================
   Estudios de seguridad de personal — capa de nube (Firebase)
   - Acceso: Firebase Authentication (correo y contraseña), un único administrador.
   - Llave de datos AES-256-GCM generada en el equipo. En el servidor solo se guarda envuelta (cifrada)
     con la clave de cifrado del Director y, aparte, con el código de recuperación.
   - Cada registro viaja y se guarda cifrado: Firebase (Google) solo almacena texto cifrado.
   - Bitácora: solo se agrega; las reglas del servidor impiden modificarla o borrarla y exigen el encadenamiento.
   ===================================================================== */
(function () {
  'use strict';
  const TE = new TextEncoder(), TD = new TextDecoder();
  const KDF_ITER = 600000;
  const AAD_LLAVE = TE.encode('avopak-estudios/llave-datos/v1');
  const C = window.EST_CONFIG || {};
  let auth = null, fs = null, FV = null, TS = null;

  const N = window.Nube = { dek: null, inst: null, KDF_ITER, VER: '1.2.0' };

  function b64(u8) { u8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const b = atob(s); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  function conTiempo(p, ms, que) {
    let t; const lim = new Promise((_, rej) => { t = setTimeout(() => { const e = new Error('Sin respuesta del servidor (' + que + '). Revise la conexión.'); e.code = 'timeout'; rej(e); }, ms); });
    return Promise.race([p, lim]).finally(() => clearTimeout(t));
  }

  // ---------- Llaves ----------
  async function kek(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', TE.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function envolver(raw, pass) {
    const salt = rnd(16), iv = rnd(12);
    const k = await kek(pass, salt, KDF_ITER);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD_LLAVE }, k, raw);
    return { salt: b64(salt), iter: KDF_ITER, iv: b64(iv), ct: b64(ct) };
  }
  async function desenvolver(w, pass) {
    if (!w || !w.ct) return null;
    const k = await kek(pass, unb64(w.salt), w.iter);
    try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv), additionalData: AAD_LLAVE }, k, unb64(w.ct))); }
    catch (e) { return null; }
  }
  const importarLlave = raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32 símbolos, sin I, O, 0 ni 1
  N.nuevoCodigo = () => { const b = rnd(24); let s = ''; for (let i = 0; i < 24; i++) { s += ALFA[b[i] & 31]; if (i % 4 === 3 && i < 23) s += '-'; } return s; };
  N.normCodigo = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const limpiaLlave = l => ({ pass: l.pass, rec: l.rec });

  // ---------- Inicio ----------
  N.configurado = () => !!(C.firebase && C.firebase.apiKey && C.firebase.projectId && !/PEGUE|XXXX/i.test(C.firebase.apiKey));
  N.init = function () {
    firebase.initializeApp(C.firebase);
    auth = firebase.auth(); fs = firebase.firestore();
    if (C.emulador) {
      if (C.emulador.auth) auth.useEmulator(C.emulador.auth, { disableWarnings: true });
      if (C.emulador.firestore) fs.useEmulator(C.emulador.firestore[0], C.emulador.firestore[1]);
    }
    FV = firebase.firestore.FieldValue; TS = firebase.firestore.Timestamp;
  };
  N.proyecto = () => (C.firebase && C.firebase.projectId) || '';
  N.alCambiarSesion = cb => auth.onAuthStateChanged(cb);
  N.usuario = () => auth.currentUser;
  N.entrar = (correo, clave) => auth.signInWithEmailAndPassword(correo, clave);
  N.salir = () => auth.signOut();
  N.restablecer = correo => auth.sendPasswordResetEmail(correo);
  N.cambiarContrasena = async (actual, nueva) => {
    const u = auth.currentUser;
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, actual));
    await u.updatePassword(nueva);
  };
  N.errorTexto = e => {
    const m = {
      'auth/invalid-credential': 'Correo o contraseña de acceso incorrectos.', 'auth/wrong-password': 'Correo o contraseña de acceso incorrectos.',
      'auth/user-not-found': 'Correo o contraseña de acceso incorrectos.', 'auth/invalid-email': 'El correo no es válido.',
      'auth/too-many-requests': 'Demasiados intentos. Espere unos minutos o restablezca la contraseña de acceso.',
      'auth/network-request-failed': 'Sin conexión con el servidor de acceso. Revise internet.',
      'auth/email-already-in-use': 'Ese correo ya tiene cuenta en este proyecto: use la misma contraseña de acceso con la que se creó.',
      'auth/weak-password': 'La contraseña de acceso es demasiado débil (mínimo 10 caracteres).',
      'auth/requires-recent-login': 'Por seguridad, cierre sesión, vuelva a entrar e intente de nuevo.',
      'permission-denied': 'El servidor rechazó la operación (permisos). Verifique que publicó las reglas de Firestore y que usa la cuenta del administrador.',
      'unavailable': 'Sin conexión con el servidor. Revise internet.', 'timeout': e.message
    };
    return m[e && e.code] || (e && e.message) || String(e);
  };

  // ---------- Instalación ----------
  N.leerInstalacion = async () => { const s = await conTiempo(fs.doc('config/instalacion').get({ source: 'server' }), 20000, 'instalación'); return s.exists ? s.data() : null; };
  // seq: { persona: n, estudio_2026: n, informe_2026: n, ... }
  N.instalar = async ({ correo, clave, codigo, claveCifrado, seq }) => {
    let cred;
    try { cred = await auth.createUserWithEmailAndPassword(correo, clave); }
    catch (e) { if (e.code === 'auth/email-already-in-use') cred = await auth.signInWithEmailAndPassword(correo, clave); else throw e; }
    const uid = cred.user.uid;
    const raw = rnd(32);
    const rec = N.nuevoCodigo();
    const llave = { pass: await envolver(raw, claveCifrado), rec: await envolver(raw, N.normCodigo(rec)) };
    const id = Array.from(rnd(8), x => x.toString(16).padStart(2, '0')).join('');
    const b = fs.batch();
    b.set(fs.doc('config/instalacion'), { adminUid: uid, codigo: String(codigo || '').trim(), id, creada: FV.serverTimestamp(), version: 1 });
    b.set(fs.doc('config/llave'), Object.assign({ creada: FV.serverTimestamp(), modificada: FV.serverTimestamp() }, llave));
    b.set(fs.doc('contadores/seq'), Object.assign({}, seq || {}, { _mod: FV.serverTimestamp() }));
    try { await conTiempo(b.commit(), 30000, 'instalación'); }
    catch (e) { if (e.code === 'permission-denied') { const x = new Error('El servidor rechazó la instalación: revise el código de instalación y que publicó las reglas de Firestore, o el proyecto ya fue instalado.'); x.code = 'instalacion-rechazada'; throw x; } throw e; }
    N.dek = await importarLlave(raw); raw.fill(0);
    N.inst = { adminUid: uid, id };
    return { recuperacion: rec, llave };
  };

  // ---------- Llave de datos ----------
  N.leerLlave = async () => { const s = await conTiempo(fs.doc('config/llave').get({ source: 'server' }), 20000, 'llave'); return s.exists ? limpiaLlave(s.data()) : null; };
  N.abrir = async (llave, clave) => { const raw = await desenvolver(llave && llave.pass, clave); if (!raw) return false; N.dek = await importarLlave(raw); raw.fill(0); return true; };
  N.verificarClave = async (llave, clave) => { const raw = await desenvolver(llave && llave.pass, clave); if (!raw) return false; raw.fill(0); return true; };
  // Recuperación: abre con el código y fija una nueva clave de cifrado
  N.recuperar = async (llave, codigo, nuevaClave) => {
    const raw = await desenvolver(llave && llave.rec, N.normCodigo(codigo)); if (!raw) return null;
    const pass = await envolver(raw, nuevaClave);
    await conTiempo(fs.doc('config/llave').update({ pass, modificada: FV.serverTimestamp() }), 20000, 'llave');
    N.dek = await importarLlave(raw); raw.fill(0);
    return { pass, rec: llave.rec };
  };
  N.cambiarClave = async (llave, actual, nueva) => {
    const raw = await desenvolver(llave.pass, actual); if (!raw) return null;
    const pass = await envolver(raw, nueva); raw.fill(0);
    await conTiempo(fs.doc('config/llave').update({ pass, modificada: FV.serverTimestamp() }), 20000, 'llave');
    return { pass, rec: llave.rec };
  };
  N.regenerarCodigo = async (llave, clave) => {
    const raw = await desenvolver(llave.pass, clave); if (!raw) return null;
    const codigo = N.nuevoCodigo(); const rec = await envolver(raw, N.normCodigo(codigo)); raw.fill(0);
    await conTiempo(fs.doc('config/llave').update({ rec, modificada: FV.serverTimestamp() }), 20000, 'llave');
    return { codigo, llave: { pass: llave.pass, rec } };
  };
  N.cerrar = () => { N.dek = null; };

  // ---------- Cifrado de registros (la identificación del documento va como dato asociado: no se pueden intercambiar) ----------
  N.cifrar = async (id, obj) => {
    const iv = rnd(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: TE.encode(id) }, N.dek, TE.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  };
  N.descifrar = async (id, d) => JSON.parse(TD.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(d.iv), additionalData: TE.encode(id) }, N.dek, unb64(d.ct))));

  // ---------- Datos ----------
  // lista: [{ id, c, o }] o [{ id, c, del: true }]
  N.escribir = async (lista, progreso) => {
    for (let i = 0; i < lista.length; i += 250) {
      const b = fs.batch();
      for (const w of lista.slice(i, i + 250)) {
        const ref = fs.doc('datos/' + w.id);
        if (w.del) b.set(ref, { c: w.c || '', del: true, _mod: FV.serverTimestamp() });
        else { const e = await N.cifrar(w.id, w.o); b.set(ref, { c: w.c, iv: e.iv, ct: e.ct, del: false, _mod: FV.serverTimestamp() }); }
      }
      await conTiempo(b.commit(), 45000, 'envío');
      if (progreso) progreso(Math.min(lista.length, i + 250), lista.length);
    }
  };
  // Documentos modificados después de desdeMs (incluye la marca de tiempo del servidor)
  N.leerCambios = async desdeMs => {
    const out = []; let ultimo = null;
    for (;;) {
      let q = fs.collection('datos').where('_mod', '>', TS.fromMillis(Math.max(0, desdeMs))).orderBy('_mod').limit(500);
      if (ultimo) q = q.startAfter(ultimo);
      const s = await conTiempo(q.get({ source: 'server' }), 45000, 'descarga');
      s.docs.forEach(d => { const x = d.data(); out.push({ id: d.id, c: x.c, del: !!x.del, iv: x.iv, ct: x.ct, mod: x._mod ? x._mod.toMillis() : 0 }); });
      if (s.docs.length < 500) break;
      ultimo = s.docs[s.docs.length - 1];
    }
    return out;
  };

  // ---------- Bitácora (solo agregar) ----------
  N.leerBitacora = async desdeN => {
    const out = []; let n = desdeN;
    for (;;) {
      const s = await conTiempo(fs.collection('bitacora').where('n', '>', n).orderBy('n').limit(500).get({ source: 'server' }), 45000, 'bitácora');
      for (const d of s.docs) {
        const x = d.data(); let e;
        try { e = await N.descifrar('bitacora/' + x.n, x); } catch (er) { const z = new Error('La entrada ' + x.n + ' de la bitácora en el servidor no se pudo descifrar.'); z.code = 'integridad'; throw z; }
        if (e.n !== x.n || e.hash !== x.hash || e.prev !== x.prev) { const z = new Error('La entrada ' + x.n + ' de la bitácora en el servidor no es coherente.'); z.code = 'integridad'; throw z; }
        out.push(e);
      }
      if (s.docs.length < 500) break;
      n = out[out.length - 1].n;
    }
    return out;
  };
  // Lotes pequeños: cada entrada comprueba en el servidor el encadenamiento con la anterior
  N.agregarBitacora = async (entradas, alConfirmar) => {
    for (let i = 0; i < entradas.length; i += 8) {
      const lote = entradas.slice(i, i + 8);
      const b = fs.batch();
      for (const e of lote) {
        const c = await N.cifrar('bitacora/' + e.n, e);
        b.set(fs.doc('bitacora/' + e.n), { n: e.n, hash: e.hash, prev: e.prev, iv: c.iv, ct: c.ct, _mod: FV.serverTimestamp() });
      }
      await conTiempo(b.commit(), 45000, 'bitácora');
      if (alConfirmar) alConfirmar(lote[lote.length - 1].n);
    }
  };

  // ---------- Consecutivos (transacción en el servidor: no se repiten entre equipos) ----------
  N.reservar = async (campo, cantidad) => {
    cantidad = cantidad || 1;
    const ref = fs.doc('contadores/seq');
    return conTiempo(fs.runTransaction(async t => {
      const s = await t.get(ref);
      const v = (s.exists && Number(s.data()[campo])) || 0;
      t.set(ref, { [campo]: v + cantidad, _mod: FV.serverTimestamp() }, { merge: true });
      return v + 1;
    }), 20000, 'consecutivo');
  };
})();
