/* Arranque, sesión, navegación y estructura de pantallas */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;
  AP.CFG = window.AP_CONFIG || {};
  AP.TX = window.AP_TEXTOS || {};
  AP.State = {};
  AP.VERSION = '1.2.1';

  var Session = (AP.Session = { user: null, rol: null, perms: {}, turno: null, dispositivo: false });

  Session.resolveRole = function () {
    var u = Session.user;
    if (!u) return null;
    var upn = String(u.upn || '').toLowerCase();
    var admins = (AP.CFG.administradores || []).map(function (x) { return String(x).toLowerCase().trim(); });
    var rol = null;
    if (admins.indexOf(upn) >= 0) rol = 'Administrador';
    var row = AP.Sync.usuarios.find(function (x) { return String(x.Title || '').toLowerCase().trim() === upn; });
    if (!rol && row && row.Activo !== false) rol = row.Rol;
    if (rol && !AP.ROLES[rol]) rol = null;
    Session.dispositivo = !!(rol && AP.ROLES[rol].dispositivo);
    if (Session.dispositivo && Session.turno) {
      // Celular de portería con turno abierto: opera con el rol del vigilante, nunca con funciones de consola.
      var tr = AP.ROLES[Session.turno.rol] ? Session.turno.rol : 'Vigilante';
      Session.rol = tr;
      Session.perms = Object.assign({}, AP.ROLES[tr], { consola: false, admin: false, dispositivo: true });
      return rol;
    }
    Session.rol = rol;
    Session.perms = rol ? AP.ROLES[rol] : {};
    return rol;
  };
  Session.setTurno = function (t) { Session.turno = t || null; Session.resolveRole(); };
  // Quien firma cada registro: el vigilante del turno (celular de portería) o el usuario de Microsoft 365.
  Session.operador = function () {
    var u = Session.user || {}, t = Session.turno;
    if (t && Session.dispositivo) return { nombre: t.nombre, upn: u.upn, usuario: t.usuario, turnoId: t.id };
    return { nombre: u.nombre, upn: u.upn };
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
    if (!Session.user) return AP.Views.login();
    if (!Session.rol) return AP.Views.noAccess();
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
    ['/consola/vigilantes', 'badge', 'Vigilantes', 'admin'],
    ['/consola/usuarios', 'key', 'Usuarios', 'admin'],
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
        box.appendChild(h('div', { class: 'banner warn' }, AP.icon('lock', 18), h('span', null, Session.dispositivo
          ? 'La sesión de la cuenta de servicio de Microsoft 365 debe renovarse. Siga registrando: todo queda guardado en el celular. Avise al Director de Seguridad Integral para renovarla.'
          : 'La sesión de Microsoft 365 debe renovarse para enviar los registros.'),
          h('button', { class: 'btn small', type: 'button', onclick: function () { AP.B.relogin(); } }, 'Renovar')));
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
    if (Session.dispositivo) return AP.Views.cerrarTurno();
    var n = AP.Sync.pendingCount();
    if (n && !(await AP.confirm('Hay registros sin enviar', 'Este celular tiene ' + n + ' registro(s) pendientes de sincronizar. Si cierra sesión, se conservarán en el dispositivo y se enviarán al volver a iniciar sesión. ¿Desea salir?', 'Cerrar sesión', 'danger'))) return;
    AP.B.logout();
  };

  AP.Views.login = function () {
    var demo = AP.CFG.modo === 'demo';
    var box = h('div', { class: 'login' },
      h('div', { class: 'login-card' },
        h('img', { class: 'login-logo', src: 'img/logo.png', alt: 'Avo Pak' }),
        h('h1', null, 'Control de Acceso'),
        h('p', { class: 'muted' }, 'Dirección de Seguridad Integral · ' + AP.CFG.porteria),
        demo
          ? h('div', { class: 'stack' },
            h('p', { class: 'note' }, 'Modo demostración con datos ficticios. Nada de lo que registre sale de este dispositivo.'),
            h('button', { class: 'btn primary big', type: 'button', onclick: function () { AP.Demo.loginAs('Dispositivo'); } }, AP.icon('door', 22), 'Celular de portería (usuario y PIN)'),
            h('button', { class: 'btn big', type: 'button', onclick: function () { AP.Demo.loginAs('Administrador'); } }, AP.icon('shield', 22), 'Entrar como Director de Seguridad Integral'))
          : h('div', { class: 'stack' },
            AP.State.bootError ? h('p', { class: 'banner deny' }, AP.State.bootError) : null,
            AP.Graph.lastLoginError ? h('p', { class: 'banner warn' }, 'Inicio de sesión no completado: ' + AP.Graph.lastLoginError) : null,
            h('button', { class: 'btn primary big', type: 'button', disabled: !!AP.State.configError, onclick: function () {
              if (!navigator.onLine) return AP.toast('Se requiere conexión a internet para iniciar sesión por primera vez.', 'warn');
              AP.B.login();
            } }, AP.icon('key', 22), 'Iniciar sesión con Microsoft 365'),
            h('p', { class: 'muted small' }, 'Uso restringido. Acceso exclusivo para personal autorizado por la Dirección de Seguridad Integral de Avo Pak S.A.S.'))),
      h('p', { class: 'login-foot' }, AP.CFG.empresa + ' · v' + AP.VERSION));
    AP.mount(box, 'is-login');
  };

  AP.Views.noAccess = function () {
    AP.mount(h('div', { class: 'login' }, h('div', { class: 'login-card' },
      h('img', { class: 'login-logo', src: 'img/logo.png', alt: 'Avo Pak' }),
      h('h1', null, 'Cuenta sin autorización'),
      h('p', null, 'La cuenta ', h('strong', null, Session.user.upn), ' no tiene un rol asignado en la aplicación.'),
      h('p', { class: 'muted' }, AP.Sync.state.lastPull ? 'Solicite al Director de Seguridad Integral su inclusión en la lista de usuarios.' : 'No fue posible consultar la lista de usuarios. Verifique la conexión a internet.'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', type: 'button', onclick: async function () { await AP.Sync.run(); Session.resolveRole(); render(); } }, AP.icon('sync', 18), 'Reintentar'),
        h('button', { class: 'btn', type: 'button', onclick: function () { AP.B.logout(); } }, AP.icon('logout', 18), 'Cerrar sesión')))), 'is-login');
  };

  // ---------- Arranque ----------
  async function boot() {
    root = document.getElementById('app');
    AP.CFG.modo = AP.CFG.modo === 'demo' ? 'demo' : 'm365';
    AP.B = AP.CFG.modo === 'demo' ? AP.Demo : AP.Graph;
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
  async function startSession() {
    Session.user = AP.B.me();
    await AP.Sync.load();
    Session.turno = (await AP.Store.get('turno:actual')) || null;
    Session.resolveRole();
    if (!AP.Sync.state.lastPull || !Session.rol) {
      root.replaceChildren(AP.spinner('Descargando datos de acceso…'));
      await Promise.race([AP.Sync.run(), U.sleep(15000)]);
      Session.resolveRole();
    }
    if (Session.turno && Session.rol && !Session.dispositivo) { await AP.Store.del('turno:actual'); Session.setTurno(null); }
    await vigilarTurno();
    if (!syncStarted) {
      syncStarted = true;
      AP.Sync.start();
      AP.Sync.on(function () { if (Session.user && !Session.rol && Session.resolveRole()) render(); });
      AP.Sync.on(U.debounce(vigilarTurno, 500));
      setInterval(vigilarTurno, 60000);
    }
  }
  async function vigilarTurno() {
    if (!Session.turno || !AP.Pin) return;
    var msg = await AP.Pin.vigilar();
    if (msg) { AP.toast(msg, 'warn', 9000); render(); }
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
