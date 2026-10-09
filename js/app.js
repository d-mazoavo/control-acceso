/* Arranque, sesión, navegación y estructura de pantallas */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;
  AP.CFG = window.AP_CONFIG || {};
  AP.TX = window.AP_TEXTOS || {};
  AP.State = {};
  AP.VERSION = '2.0.0';

  var Session = (AP.Session = { user: null, rol: null, perms: {}, turno: null, dispositivo: false });

  // El rol lo asigna el administrador en la consola (Usuarios); el servidor lo hace cumplir con las reglas de seguridad.
  Session.resolveRole = function () {
    var u = Session.user;
    if (!u) return null;
    var rol = u.rol && AP.ROLES[u.rol] ? u.rol : null;
    // Vigilantes y supervisores operan la portería por turnos
    Session.dispositivo = !!(rol && AP.ROLES_TURNO.indexOf(rol) >= 0);
    Session.rol = rol;
    Session.perms = rol ? Object.assign({}, AP.ROLES[rol], Session.dispositivo ? { dispositivo: true } : {}) : {};
    return rol;
  };
  Session.setTurno = function (t) { Session.turno = t || null; Session.resolveRole(); };
  // Quien firma cada registro: el usuario que inició sesión (y su turno, si lo tiene).
  Session.operador = function () {
    var u = Session.user || {}, t = Session.turno;
    if (t) return { nombre: t.nombre, upn: u.upn, usuario: t.usuario, turnoId: t.id };
    return { nombre: u.nombre, upn: u.upn, usuario: u.usuario };
  };
  Session.can = function (p) { return !!Session.perms[p]; };

  // ---------- Navegación ----------
  var routes = {};
  AP.route = function (path, fn) { routes[path] = fn; };
  AP.go = function (path) { if (location.hash === '#' + path) render(); else location.hash = path; };
  AP.back = function (fallback) { if (history.length > 1 && AP.State._navCount > 1) history.back(); else AP.go(fallback || '/'); };
  AP.State._navCount = 0;
  var cleanup = null;
  AP.onLeave = function (fn) { var prev = cleanup; cleanup = function () { if (prev) prev(); fn(); }; };

  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var q = {};
    var i = raw.indexOf('?');
    var path = i >= 0 ? raw.slice(0, i) : raw;
    if (i >= 0) raw.slice(i + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    return { path: path, q: q };
  }

  var root;
  function render() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    document.querySelectorAll('.modal-wrap').forEach(function (m) { m.remove(); });
    AP.State._navCount++;
    var r = parseHash();
    if (!Session.user) return AP.State.instalado === false ? AP.Views.instalacion() : AP.Views.login();
    if (!Session.rol) return AP.Views.noAccess();
    if (Session.user.perfil && Session.user.perfil.PinTemporal) return AP.Views.claveObligatoria();
    if (Session.dispositivo && !Session.turno) return AP.Views.pin();
    var path = r.path;
    if (path === '/' || path === '') path = Session.can('consola') && !U.isMobile() ? '/consola/panel' : '/porteria';
    var fn = routes[path];
    if (!fn) { var k = Object.keys(routes).find(function (p) { return p.slice(-1) === '*' && path.indexOf(p.slice(0, -1)) === 0; }); fn = k && routes[k]; }
    if (!fn) fn = routes['/porteria'];
    try { fn(r.q, path); } catch (e) { console.error(e); AP.mount(AP.empty('alert', 'Ocurrió un error al mostrar la pantalla', e.message)); }
    window.scrollTo(0, 0);
  }
  AP.render = render;

  AP.mount = function (node, cls) {
    root.className = 'app ' + (cls || '');
    root.replaceChildren(node);
  };

  // ---------- Estructuras de pantalla ----------
  AP.statusChip = function () {
    var chip = h('button', { class: 'status-chip', type: 'button', 'aria-live': 'polite', onclick: function () { AP.Sync.run(); AP.toast('Sincronizando…'); } });
    function paint() {
      var s = AP.Sync.state, n = AP.Sync.pendingCount();
      chip.replaceChildren();
      var kind = s.syncing ? 'sync' : !s.online ? 'off' : s.authProblem ? 'warn' : n ? 'warn' : 'on';
      chip.className = 'status-chip ' + kind;
      chip.appendChild(AP.icon(s.syncing ? 'sync' : !s.online ? 'offline' : 'check', 16, s.syncing ? 'rot' : ''));
      chip.appendChild(h('span', null, s.syncing ? 'Sincronizando' : !s.online ? 'Sin conexión' : s.authProblem ? 'Sesión vencida' : n ? n + ' pendiente' + (n > 1 ? 's' : '') : 'En línea'));
      chip.title = 'Última actualización: ' + (s.lastPull ? U.fDateTime(s.lastPull) : 'nunca');
    }
    paint();
    var off = AP.Sync.on(paint);
    AP.onLeave(off);
    return chip;
  };

  AP.porteriaShell = function (title, content, opt) {
    opt = opt || {};
    var head = h('header', { class: 'topbar' },
      opt.back
        ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Volver', onclick: function () { AP.go(opt.back); } }, AP.icon('back', 22))
        : h('img', { class: 'brand-mark', src: 'img/logo-avo.png', alt: 'Avo Pak' }),
      h('div', { class: 'topbar-title' }, h('strong', null, title), h('small', null, opt.sub || AP.CFG.porteria)),
      AP.statusChip());
    var page = h('div', { class: 'porteria' }, head, AP.Views.banners(), h('main', { class: 'p-main' }, content));
    if (AP.CFG.modo === 'demo') page.prepend(h('div', { class: 'demo-ribbon' }, 'MODO DEMOSTRACIÓN — datos ficticios'));
    AP.mount(page, 'is-porteria');
    return page;
  };

  var NAV = [
    ['/consola/panel', 'chart', 'Panel'],
    ['/consola/personas', 'users', 'Personas'],
    ['/consola/visitas', 'user', 'Visitas'],
    ['/consola/historial', 'history', 'Historial'],
    ['/consola/inspecciones', 'truck', 'Inspecciones'],
    ['/consola/horarios', 'clock', 'Horarios', 'admin'],
    ['/consola/permisos', 'key', 'Permisos', 'admin'],
    ['/consola/novedades', 'alert', 'Novedades', 'admin'],
    ['/consola/vigilantes', 'badge', 'Usuarios', 'admin'],
    ['/consola/bitacora', 'file', 'Bitácora', 'admin'],
    ['/consola/instalacion', 'settings', 'Instalación', 'admin']
  ];
  AP.consolaShell = function (active, title, content, actions) {
    var nav = h('nav', { class: 'side', 'aria-label': 'Consola' },
      h('div', { class: 'side-brand' }, h('img', { src: 'img/logo-avo.png', alt: 'Avo Pak' }), h('div', null, h('strong', null, 'Control de Acceso'), h('small', null, 'Dirección de Seguridad Integral'))),
      NAV.filter(function (n) { return !n[3] || Session.can(n[3]); }).map(function (n) {
        return h('a', { href: '#' + n[0], class: active === n[0] ? 'on' : '' }, AP.icon(n[1], 19), h('span', null, n[2]));
      }),
      h('div', { class: 'side-foot' },
        h('a', { href: '#/porteria' }, AP.icon('door', 19), h('span', null, 'Ir a portería')),
        h('div', { class: 'who' }, AP.icon('user', 16), h('span', null, Session.operador().nombre), h('small', null, Session.rol)),
        h('button', { class: 'linkish', type: 'button', onclick: function () { AP.Views.definirPin(); } }, AP.icon('lock', 16), ' Cambiar mi contraseña'),
        h('button', { class: 'linkish', type: 'button', onclick: AP.Views.logout }, AP.icon('logout', 16), ' Cerrar sesión')));
    var menuBtn = h('button', { class: 'icon-btn only-mobile', type: 'button', 'aria-label': 'Menú', onclick: function () { page.classList.toggle('nav-open'); } }, AP.icon('menu', 22));
    var head = h('header', { class: 'c-head' }, menuBtn, h('h1', null, title), h('div', { class: 'c-actions' }, actions || null), AP.statusChip());
    var page = h('div', { class: 'consola' }, nav, h('div', { class: 'c-main' }, AP.CFG.modo === 'demo' ? h('div', { class: 'demo-ribbon' }, 'MODO DEMOSTRACIÓN — datos ficticios') : null, head, AP.Views.banners(true), h('main', { class: 'c-content' }, content)));
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) page.classList.remove('nav-open'); });
    AP.mount(page, 'is-consola');
    return page;
  };

  // ---------- Vistas comunes ----------
  AP.Views = AP.Views || {};
  AP.Views.banners = function (consola) {
    var box = h('div', { class: 'banners' });
    function paint() {
      box.replaceChildren();
      var s = AP.Sync.state;
      if (s.authProblem) {
        box.appendChild(h('div', { class: 'banner warn' }, AP.icon('lock', 18), h('span', null,
          'La sesión debe renovarse para enviar los registros. Lo registrado queda guardado en el celular y se enviará al volver a ingresar.'),
          h('button', { class: 'btn small', type: 'button', onclick: function () { AP.Views.logout(); } }, 'Volver a ingresar')));
      }
      if (!consola && AP.Sync.stale()) {
        box.appendChild(h('div', { class: 'banner ' + (s.online ? 'info' : 'warn') }, AP.icon('clock', 18),
          h('span', null, s.lastPull ? 'Datos del celular actualizados ' + U.rel(s.lastPull) + '. Una inhabilitación reciente podría no reflejarse.' : 'El celular aún no tiene los datos de personas habilitadas. Conéctese a internet.')));
      }
      var errs = AP.Sync.outbox.filter(function (o) { return o.error; }).length;
      if (errs) box.appendChild(h('div', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, errs + ' registro(s) no se han podido enviar. Revise "Mi turno" o avise al supervisor.')));
      if (s.skew != null && Math.abs(s.skew) > 180) {
        box.appendChild(h('div', { class: 'banner warn' }, AP.icon('clock', 18), h('span', null, 'La hora del celular difiere ' + Math.round(Math.abs(s.skew) / 60) + ' min de la hora del servidor. Ajuste la fecha y hora automáticas.')));
      }
    }
    paint();
    AP.onLeave(AP.Sync.on(paint));
    return box;
  };

  AP.Views.logout = async function () {
    if (Session.turno) return AP.Views.cerrarTurno();
    var n = AP.Sync.pendingCount();
    if (n && !(await AP.confirm('Hay registros sin enviar', 'Este celular tiene ' + n + ' registro(s) pendientes de enviar. Si cierra sesión, se conservarán en el dispositivo y se enviarán al volver a iniciar sesión. ¿Desea salir?', 'Cerrar sesión', 'danger'))) return;
    await AP.Sync.limpiarLocal();
    await AP.B.logout();
  };

  function cabecera(titulo, sub) {
    return [h('img', { class: 'login-logo', src: 'img/logo.png', alt: 'Avo Pak' }), h('h1', null, titulo), h('p', { class: 'muted' }, sub || ('Dirección de Seguridad Integral · ' + AP.CFG.porteria))];
  }
  var AVISO_USO = 'Uso restringido. Acceso exclusivo para personal autorizado por la Dirección de Seguridad Integral de Avo Pak S.A.S.';

  AP.Views.login = function () {
    var usuario = AP.input('usuario', '', { autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off', enterkeyhint: 'next' });
    var clave = AP.input('clave', '', { type: 'password', autocomplete: 'off', enterkeyhint: 'go' });
    var msg = h('p', { class: 'pin-msg', role: 'alert' });
    var btn = h('button', { class: 'btn primary big', type: 'submit', disabled: !!AP.State.configError }, AP.icon('key', 22), 'Ingresar');
    var form = h('form', { class: 'stack', autocomplete: 'off', onsubmit: async function (e) {
      e.preventDefault();
      msg.textContent = ''; msg.className = 'pin-msg';
      if (!navigator.onLine) { msg.textContent = 'Se requiere conexión a internet para iniciar sesión.'; msg.className = 'pin-msg error'; return; }
      btn.disabled = true; btn.lastChild.textContent = 'Verificando…';
      try {
        var me = await AP.B.login(usuario.value, clave.value);
        if (AP.Pin.temporalVencida(me.perfil)) {
          await AP.B.salir();
          throw new Error('Su PIN temporal venció (vigencia de ' + (AP.CFG.horasVigenciaPinTemporal || 72) + ' horas). Solicite el restablecimiento al Director de Seguridad Integral.');
        }
        clave.value = '';
        AP.B.lastLoginError = null; AP.State.bootError = null;
        await startSession({ ingreso: true });
        location.hash = '#/'; render();
      } catch (err) {
        msg.textContent = err.message; msg.className = 'pin-msg error';
        clave.value = ''; try { clave.focus(); } catch (x) { /* ignorar */ }
      } finally { btn.disabled = false; btn.lastChild.textContent = 'Ingresar'; }
    } },
      AP.field('Usuario', usuario),
      AP.field('Contraseña o PIN', clave),
      msg, btn);
    var box = h('div', { class: 'login' },
      h('div', { class: 'login-card' },
        cabecera('Control de Acceso'),
        AP.State.bootError ? h('p', { class: 'banner deny' }, AP.State.bootError) : null,
        AP.B.lastLoginError ? h('p', { class: 'banner warn' }, AP.B.lastLoginError) : null,
        form,
        h('p', { class: 'muted small' }, AVISO_USO),
        AP.State.configError ? null : h('button', { class: 'linkish small', type: 'button', onclick: function () { AP.State.instalado = false; render(); } }, 'Primera instalación')),
      h('p', { class: 'login-foot' }, AP.CFG.empresa + ' · v' + AP.VERSION));
    AP.mount(box, 'is-login');
    setTimeout(function () { try { usuario.focus(); } catch (e) { /* ignorar */ } }, 50);
  };

  // Primera vez: se crea el administrador de la aplicación con el código de instalación
  AP.Views.instalacion = function () {
    var f = {
      codigo: AP.input('codigo', '', { autocapitalize: 'characters', autocomplete: 'off' }),
      nombre: AP.input('nombre', '', { autocomplete: 'off' }),
      tipoDoc: AP.select('tipoDoc', AP.CAT.tiposDoc, 'CC'),
      numDoc: AP.input('numDoc', '', { inputmode: 'numeric', autocomplete: 'off' }),
      usuario: AP.input('usuario', '', { autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off' }),
      clave: AP.input('clave', '', { type: 'password', autocomplete: 'new-password' }),
      clave2: AP.input('clave2', '', { type: 'password', autocomplete: 'new-password' })
    };
    var msg = h('p', { class: 'pin-msg', role: 'alert' });
    var btn = h('button', { class: 'btn primary big', type: 'submit' }, AP.icon('shield', 22), 'Crear administrador');
    var form = h('form', { class: 'stack', autocomplete: 'off', onsubmit: async function (e) {
      e.preventDefault();
      var fallo = function (t) { msg.textContent = t; msg.className = 'pin-msg error'; };
      msg.textContent = ''; msg.className = 'pin-msg';
      var u = AP.Pin.norm(f.usuario.value);
      if (!f.codigo.value.trim()) return fallo('Escriba el código de instalación.');
      if (f.nombre.value.trim().length < 5) return fallo('Escriba su nombre completo.');
      if (!U.normDoc(f.numDoc.value)) return fallo('Escriba su número de documento.');
      if (!/^[a-z0-9._-]{3,30}$/.test(u)) return fallo('El usuario debe tener de 3 a 30 caracteres: letras minúsculas sin tildes, números, punto o guion.');
      var r = AP.Pin.reglaClave(f.clave.value, { Usuario: u, NumDoc: f.numDoc.value });
      if (r) return fallo(r);
      if (f.clave.value !== f.clave2.value) return fallo('La confirmación no coincide con la contraseña.');
      btn.disabled = true; btn.lastChild.textContent = 'Creando…';
      try {
        await AP.B.instalar({ codigo: f.codigo.value, nombre: f.nombre.value.trim(), tipoDoc: f.tipoDoc.value, numDoc: f.numDoc.value.trim(), usuario: u, clave: f.clave.value });
        AP.State.instalado = true;
        await startSession({ ingreso: true });
        await AP.Audit.log('Instalación', 'Administrador inicial', 'Usuario ' + u + ' creado con el código de instalación.');
        AP.toast('Aplicación instalada. Usted es el administrador.', 'info', 6000);
        location.hash = '#/consola/panel'; render();
      } catch (err) { fallo(err.message); }
      finally { btn.disabled = false; btn.lastChild.textContent = 'Crear administrador'; }
    } },
      h('p', { class: 'note small' }, 'Primera instalación. Cree el usuario del administrador (Director de Seguridad Integral). El código de instalación está en las reglas de seguridad de Firebase (firestore.rules); solo sirve una vez.'),
      AP.field('Código de instalación', f.codigo),
      AP.field('Nombre completo', f.nombre),
      h('div', { class: 'row gap' }, AP.field('Tipo doc.', f.tipoDoc), AP.field('Número de documento', f.numDoc)),
      AP.field('Usuario (para ingresar)', f.usuario, 'Letras minúsculas, números, punto o guion. Ejemplo: dmazo'),
      AP.field('Contraseña', f.clave, 'Mínimo 10 caracteres, con letras y números.'),
      AP.field('Confirme la contraseña', f.clave2),
      msg, btn,
      h('button', { class: 'linkish small', type: 'button', onclick: function () { AP.State.instalado = null; render(); } }, 'La aplicación ya está instalada: ir al inicio de sesión'));
    AP.mount(h('div', { class: 'login' }, h('div', { class: 'login-card' }, cabecera('Instalación inicial'), form),
      h('p', { class: 'login-foot' }, AP.CFG.empresa + ' · v' + AP.VERSION)), 'is-login');
  };

  AP.Views.noAccess = function () {
    AP.mount(h('div', { class: 'login' }, h('div', { class: 'login-card' },
      h('img', { class: 'login-logo', src: 'img/logo.png', alt: 'Avo Pak' }),
      h('h1', null, 'Usuario sin autorización'),
      h('p', null, 'El usuario ', h('strong', null, Session.user.usuario), ' no tiene un rol válido en la aplicación.'),
      h('p', { class: 'muted' }, 'Solicite al Director de Seguridad Integral la revisión de su usuario.'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn', type: 'button', onclick: function () { AP.B.logout(); } }, AP.icon('logout', 18), 'Cerrar sesión')))), 'is-login');
  };

  // ---------- Arranque ----------
  async function boot() {
    root = document.getElementById('app');
    AP.CFG.modo = 'firebase';
    AP.B = AP.Firebase;
    root.replaceChildren(AP.spinner('Cargando…'));
    try { await AP.Store._open(); } catch (e) { /* respaldo en memoria */ }
    var logged = false;
    try {
      logged = await AP.B.init(AP.CFG);
    } catch (e) {
      console.error(e);
      AP.State.bootError = e.message;
      if (e.config) AP.State.configError = true;
    }
    if (logged) await startSession();
    window.addEventListener('hashchange', render);
    render();
    registerSW();
  }

  var syncStarted = false;
  async function startSession(opt) {
    opt = opt || {};
    Session.user = AP.B.me();
    if (!Session.user) return;
    await AP.Sync.load();
    Session.turno = (await AP.Store.get('turno:actual')) || null;
    Session.resolveRole();
    // Un turno abierto en este celular por otra persona se cierra dejando constancia
    if (Session.turno && String(Session.turno.vigilanteId) !== String(Session.user.vigilanteId)) {
      await AP.Pin.cerrarTurno('Cierre de turno por cambio de usuario', 'Inició sesión el usuario ' + Session.user.usuario + ' en este celular.');
    }
    if (Session.turno && !Session.dispositivo) { await AP.Store.del('turno:actual'); Session.setTurno(null); }
    if (!AP.Sync.state.lastPull) {
      root.replaceChildren(AP.spinner('Descargando datos de acceso…'));
      await Promise.race([AP.Sync.run(), U.sleep(15000)]);
    }
    // Al ingresar, vigilantes y supervisores abren su turno (si ya definieron su PIN personal)
    if (opt.ingreso && Session.dispositivo && !Session.turno && !(Session.user.perfil && Session.user.perfil.PinTemporal)) {
      await AP.Pin.iniciarTurno();
      AP.toast('Turno iniciado. ' + Session.user.nombre + ', sus registros quedan a su nombre.', 'info', 4500);
    }
    await vigilarTurno();
    if (!syncStarted) {
      syncStarted = true;
      AP.Sync.start();
      AP.Sync.on(function () { if (Session.user && !Session.rol && Session.resolveRole()) render(); });
      AP.Sync.on(U.debounce(vigilarTurno, 500));
      setInterval(vigilarTurno, 60000);
    }
  }
  var saliendo = false;
  async function vigilarTurno() {
    if (!Session.user || saliendo) return;
    var r = Session.turno ? await AP.Pin.vigilar() : (AP.B.inactivo ? { msg: 'Su usuario fue dado de baja o su contraseña fue restablecida.', salir: true } : null);
    if (!r) return;
    AP.toast(r.msg, 'warn', 9000);
    if (r.salir) {
      saliendo = true;
      try { await AP.Sync.limpiarLocal(); await AP.B.logout(); } finally { saliendo = false; }
      return;
    }
    render();
  }
  AP.startSession = startSession;
  AP.endSession = function () { Session.user = null; Session.rol = null; Session.perms = {}; Session.turno = null; Session.dispositivo = false; };

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
    if (AP.CFG.sinServiceWorker) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            AP.toast('Hay una nueva versión de la aplicación. Se aplicará al volver a abrirla.', 'info', 8000);
          }
        });
      });
    }).catch(function (e) { console.warn('Sin modo sin conexión de la app:', e && e.message); });
  }

  // Instalación como app en Android
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); AP.State.installPrompt = e; });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
