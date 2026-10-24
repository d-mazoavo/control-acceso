/* Idioma de la aplicación (español o inglés). Cada usuario lo elige en su celular o computador y queda guardado en ese
 * equipo. En inglés se traduce toda la interfaz en pantalla (menús, títulos, botones, formularios, tablas, avisos,
 * mensajes y el manual de uso). Los datos registrados, los archivos que se descargan (Excel, Word, PDF), las credenciales,
 * los mensajes a terceros (WhatsApp, correo) y los textos legales que se aceptan (aviso de privacidad, autorización de
 * datos, condiciones de uso de la credencial) siguen en español, que es la versión que tiene valor jurídico y probatorio. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var CLAVE = 'ap_idioma_menu';

  // Menús y títulos (base). El diccionario completo de la interfaz está en js/i18n-en.js (window.AP_I18N_EN).
  var EN = {
    'Panel': 'Dashboard', 'Personas': 'People', 'Visitas': 'Visits', 'Solicitudes de ingreso': 'Entry requests',
    'Ingresos y salidas': 'Entries and exits', 'Inspecciones': 'Inspections', 'Horarios': 'Schedules', 'Permisos': 'Permits',
    'Novedades': 'Exceptions to verify', 'Usuarios': 'Users', 'Elementos': 'Items and equipment', 'Rondas': 'Security rounds',
    'Programación': 'Guard roster', 'Bitácora': 'Audit log', 'Instalación': 'Setup', 'Notificaciones': 'Notifications',
    'Estadísticas': 'Statistics', 'Planta': 'Plant shifts', 'Talento Humano': 'Human Resources', 'Manual de uso': 'User manual',
    'Ir a portería': 'Go to the gate', 'Cambiar mi contraseña': 'Change my password', 'Cerrar sesión': 'Sign out',
    'Idioma del menú': 'Language', 'Idioma': 'Language', 'Consola': 'Console', 'Control de Acceso': 'Access Control', 'Solo consulta': 'View only',
    'Empresas': 'Companies', 'Cargos': 'Job positions'
  };

  function leer() { try { return localStorage.getItem(CLAVE) === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; } }
  var actual = leer();

  // ---------- Diccionario ----------
  var X = null, TPL = null, IDX = null, cache = new Map();
  var LETRA = /[A-Za-zÁÉÍÓÚÑáéíóúñÜü]/;
  function limpio(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function palabras(s) { return (s.toLowerCase().match(/[a-záéíóúñü]{3,}/g) || []); }
  function preparar() {
    if (X) return;
    var D = window.AP_I18N_EN || { x: {}, t: [] };
    X = Object.create(null);
    Object.keys(D.x || {}).forEach(function (k) { X[limpio(k)] = D.x[k]; });
    Object.keys(EN).forEach(function (k) { X[k] = EN[k]; });
    TPL = []; IDX = Object.create(null);
    var frec = Object.create(null), pre = [];
    (D.t || []).forEach(function (p) {
      var es = limpio(p[0]), partes = es.split(/\{(\d+)\}/), re = '^', orden = [], lit = '';
      for (var j = 0; j < partes.length; j++) {
        if (j % 2 === 0) { re += esc(partes[j]); lit += ' ' + partes[j]; }
        else { re += '([\\s\\S]*?)'; orden.push(Number(partes[j])); }
      }
      var ws = Array.from(new Set(palabras(lit)));
      ws.forEach(function (w) { frec[w] = (frec[w] || 0) + 1; });
      pre.push({ src: re + '$', orden: orden, en: p[1], largo: lit.replace(/\s+/g, '').length, ws: ws });
    });
    pre.forEach(function (t) {
      if (!t.ws.length) return;
      var clave = t.ws.slice().sort(function (a, b) { return frec[a] - frec[b] || b.length - a.length; })[0];
      (IDX[clave] = IDX[clave] || []).push(t);
      TPL.push(t);
    });
  }
  function porPlantilla(k, prof) {
    var vistos = new Set(), cand = [];
    palabras(k).forEach(function (w) { (IDX[w] || []).forEach(function (t) { if (!vistos.has(t)) { vistos.add(t); cand.push(t); } }); });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return b.largo - a.largo; });
    for (var i = 0; i < cand.length; i++) {
      var t = cand[i];
      if (!t.re) t.re = new RegExp(t.src);
      var m = t.re.exec(k);
      if (!m) continue;
      var vals = {};
      for (var j = 0; j < t.orden.length; j++) {
        var v = m[j + 1], tv = prof < 2 ? traducir(v, prof + 1) : null;
        vals[t.orden[j]] = tv != null ? (/^\s/.test(v) ? ' ' : '') + tv + (/\s$/.test(v) ? ' ' : '') : v;
      }
      return t.en.replace(/\{(\d+)\}/g, function (x, n) { return vals[n] != null ? vals[n] : ''; });
    }
    return null;
  }
  // Frases compuestas: partes separadas con « · », « — », « → » o «; » (p. ej., documento · cargo · área), un paréntesis
  // final (p. ej., «Hoy (3)» o «08:00 – 17:00 (+1 día)»), una lista de días separada por comas, un número de sección
  // («7. Portería…»), un día de la semana con su fecha y los meses («octubre de 2026»).
  var MESES = { enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August',
    septiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December' };
  function parte(p, prof) { return /^[^A-Za-zÁÉÍÓÚÑáéíóúñ]*$/.test(p) ? p : traducir(p, prof + 1); }
  var NOLETRA = /^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+$/;
  function porSeparador(k, sep, prof, final) {
    var hubo = false, ps = k.split(sep);
    var out = ps.map(function (p, i) {
      var t = parte(p, prof);
      // Las oraciones intermedias perdieron su punto al separarlas
      if ((t == null || t === p) && final && i < ps.length - 1) { var t2 = traducir(p + final, prof + 1); if (t2 != null) t = t2.replace(/\.$/, ''); }
      if (t != null && t !== p) { hubo = true; return t; }
      return p;
    });
    return hubo ? out.join(sep) : null;
  }
  function compuesto(k, prof) {
    var m, r;
    // «7. Portería…»
    if ((m = /^(\d+(?:\.\d+)*\.?\s+)(.+)$/.exec(k)) && LETRA.test(m[2]) && (r = traducir(m[2], prof + 1)) != null) return m[1] + r;
    // «3 de 10», «08:00 a 17:00», «23/10/2026 a 26/10/2026»
    if ((m = /^(\d+) de (\d+)$/.exec(k))) return m[1] + ' of ' + m[2];
    if ((m = /^(\S+) a (\S+)$/.exec(k)) && NOLETRA.test(m[1]) && NOLETRA.test(m[2])) return m[1] + ' to ' + m[2];
    // «octubre de 2026»
    if ((m = /^([a-záéíóúñ]+) de (\d{4})$/i.exec(k)) && MESES[m[1].toLowerCase()]) return MESES[m[1].toLowerCase()] + ' ' + m[2];
    // «12 ingresos», «día 10», «Mié 07/10/2026»
    if ((m = /^([\d.,]+) ([A-Za-zÁÉÍÓÚÑáéíóúñ() ]+)$/.exec(k)) && X[m[2]] != null) return m[1] + ' ' + X[m[2]];
    if ((m = /^([A-Za-zÁÉÍÓÚÑáéíóúñ.]+) ([^A-Za-zÁÉÍÓÚÑáéíóúñ]+)$/.exec(k)) && X[m[1]] != null) return X[m[1]] + ' ' + m[2];
    var seps = [' · ', ' — ', ' → ', ' | ', '; ', ': ', '. '];
    for (var i = 0; i < seps.length; i++) {
      if (k.indexOf(seps[i]) > 0) { r = porSeparador(k, seps[i], prof, seps[i] === '. ' ? '.' : null); if (r != null) return r; }
    }
    // Paréntesis final: «Hoy (3)», «08:00 – 17:00 (+1 día)», «Lun 12/10/2026 (festivo)»
    if ((m = /^(.*\S)\s+(\([^()]*\))$/.exec(k))) {
      var a = parte(m[1], prof), b = X[m[2]] != null ? X[m[2]] : /^\([^A-Za-zÁÉÍÓÚÑáéíóúñ]*\)$/.test(m[2]) ? m[2] : traducir(m[2].slice(1, -1), prof + 1);
      if (b != null && b.charAt(0) !== '(') b = '(' + b + ')';
      if ((a != null && a !== m[1]) || (b != null && b !== m[2])) return (a != null ? a : m[1]) + ' ' + (b != null ? b : m[2]);
      return null;
    }
    if (k.indexOf(', ') > 0) return porSeparador(k, ', ', prof, null);
    return null;
  }
  function traducir(s, prof) {
    prof = prof || 0;
    var k = limpio(s);
    if (!k || !LETRA.test(k)) return null;
    preparar();
    if (X[k] != null) return X[k];
    if (cache.has(k)) return cache.get(k);
    var r = porPlantilla(k, prof);
    if (r == null && prof < 3) r = compuesto(k, prof);
    if (cache.size > 30000) cache.clear();
    // Un resultado vacío en un nivel interno puede deberse al límite de profundidad: solo se guarda el del nivel superior
    if (r != null || prof === 0) cache.set(k, r);
    return r;
  }

  // ---------- Traducción de la pantalla ----------
  // Sin traducir: código, textos preformateados (detalles de registros) y lo que el usuario escribe. De los campos de
  // formulario solo se traducen sus atributos (placeholder, title, aria-label), nunca su valor.
  var SALTAR = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, NOSCRIPT: 1, INPUT: 1 };
  var SOLO_ATR = { INPUT: 1, TEXTAREA: 1 };
  var ATRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function excluido(el, paraAtributos) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (paraAtributos && n === el && SOLO_ATR[n.nodeName]) continue;
      if (SALTAR[n.nodeName] || n.getAttribute('translate') === 'no' || n.isContentEditable) return true;
    }
    return false;
  }
  function textoNodo(n) {
    var v = n.nodeValue;
    if (!v || v.length > 6000 || !LETRA.test(v)) return;
    if (n.__en === v) return;              // ya traducido por este módulo
    var r = traducir(v);
    n.__es = v;
    if (r == null) { n.__en = v; return; }
    var nv = v.match(/^\s*/)[0] + r + v.match(/\s*$/)[0];
    n.__en = nv;
    if (nv !== v) n.nodeValue = nv;
  }
  function atributos(el) {
    for (var i = 0; i < ATRS.length; i++) {
      var a = ATRS[i], v = el.getAttribute(a);
      if (!v || !LETRA.test(v)) continue;
      var hechos = el.__enA || (el.__enA = {});
      if (hechos[a] === v) continue;
      var r = traducir(v);
      (el.__esA || (el.__esA = {}))[a] = v;
      hechos[a] = r != null ? r : v;
      if (r != null && r !== v) el.setAttribute(a, r);
    }
  }
  function recorrer(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { if (!excluido(raiz.parentNode)) textoNodo(raiz); return; }
    if (raiz.nodeType === 1) {
      if (SOLO_ATR[raiz.nodeName]) { if (!excluido(raiz, true)) atributos(raiz); return; }
      if (excluido(raiz)) return;
      atributos(raiz);
    }
    else if (raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      if (n.nodeType === 1) {
        if (n.getAttribute('translate') === 'no' || n.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (SOLO_ATR[n.nodeName]) { atributos(n); return NodeFilter.FILTER_REJECT; }
        return SALTAR[n.nodeName] ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    } });
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) textoNodo(n); else atributos(n); }
  }
  var obs = null;
  function observar() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver(function (muts) {
      if (actual !== 'en') return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') { if (!excluido(m.target)) for (var j = 0; j < m.addedNodes.length; j++) recorrer(m.addedNodes[j]); }
        else if (m.type === 'characterData') { if (m.target.parentNode && !excluido(m.target.parentNode)) textoNodo(m.target); }
        else if (m.type === 'attributes' && m.target.nodeType === 1 && !excluido(m.target, true)) atributos(m.target);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRS });
  }
  // Vuelve al español lo que está en pantalla
  function restaurar() {
    var w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n.__es !== undefined) { var o = n.__es; delete n.__es; delete n.__en; if (n.nodeValue !== o) n.nodeValue = o; } }
      else if (n.__esA) { var es = n.__esA; Object.keys(es).forEach(function (a) { n.setAttribute(a, es[a]); }); delete n.__esA; delete n.__enA; }
    }
  }
  function aplicar() {
    try { document.documentElement.lang = actual === 'en' ? 'en' : 'es-CO'; } catch (e) { /* */ }
    if (actual === 'en') { observar(); preparar(); recorrer(document.documentElement); }
  }

  AP.idioma = function () { return actual; };
  AP.setIdioma = function (v) {
    var antes = actual;
    actual = v === 'en' ? 'en' : 'es';
    try { localStorage.setItem(CLAVE, actual); } catch (e) { /* sin almacenamiento: vale para esta sesión */ }
    if (antes === 'en' && actual === 'es') restaurar();
    if (AP.render) AP.render();
    aplicar();
  };
  // Traduce un texto (en español, si el idioma elegido es español)
  AP.t = function (s) { if (actual !== 'en') return s; var r = traducir(s); return r != null ? r : s; };
  // Texto original (en español) de la opción elegida en una lista: para los archivos que se descargan
  AP.textoOpcion = function (sel) {
    var o = sel && sel.options[sel.selectedIndex];
    if (!o) return '';
    var t = o.firstChild;
    return t && t.__es !== undefined ? limpio(t.__es) : o.text;
  };
  // Para pruebas: textos en pantalla que siguen en español
  AP.i18nPendientes = function () {
    var out = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n.__es !== undefined && n.__en === n.__es && LETRA.test(n.__es) && !excluido(n.parentNode)) out.add(limpio(n.__es)); }
      else if (n.__esA) Object.keys(n.__esA).forEach(function (a) { if (n.__enA && n.__enA[a] === n.__esA[a]) out.add('[' + a + '] ' + limpio(n.__esA[a])); });
    }
    return Array.from(out);
  };
  AP.traducir = function (s) { return traducir(s); };

  // Selector compacto (ES | EN) para la consola, la portería y las rondas
  AP.selectorIdioma = function (compacto) {
    var h = AP.h;
    var wrap = h('div', { class: 'lang-switch' + (compacto ? ' compact' : ''), role: 'group', 'aria-label': 'Idioma' },
      compacto ? null : h('span', { class: 'lang-lbl' }, 'Idioma'));
    [['es', 'ES', 'Español'], ['en', 'EN', 'English']].forEach(function (o) {
      wrap.appendChild(h('button', { type: 'button', class: 'lang-btn' + (actual === o[0] ? ' on' : ''), 'aria-pressed': String(actual === o[0]), title: o[2], translate: 'no',
        onclick: function () { if (actual !== o[0]) AP.setIdioma(o[0]); } }, o[1]));
    });
    return wrap;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar); else aplicar();
})();
