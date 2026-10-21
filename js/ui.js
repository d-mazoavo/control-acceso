/* Componentes de interfaz */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;

  // Crea elementos sin usar HTML dinámico (previene inyección de código con datos de terceros).
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'html') el.innerHTML = v; // uso reservado a contenido generado por la propia app (SVG de QR)
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    kids.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) return append(el, c);
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  }
  AP.h = h;
  // Los bloques opcionales (null, undefined, false) se omiten también en replaceChildren, como en AP.h;
  // así nunca aparece el texto "null" en pantalla.
  (function () {
    var orig = Element.prototype.replaceChildren;
    if (!orig || orig._ap) return;
    var seguro = function () {
      return orig.apply(this, Array.prototype.filter.call(arguments, function (c) { return c !== null && c !== undefined && c !== false; }));
    };
    seguro._ap = true;
    Element.prototype.replaceChildren = seguro;
  })();
  // Agrega hijos ignorando valores vacíos (null, undefined, false)
  AP.add = function (el) { append(el, Array.prototype.slice.call(arguments, 1)); return el; };

  // ---------- Íconos ----------
  var P = {
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM16 16h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM6.5 6.5h1v1h-1zM16.5 6.5h1v1h-1zM6.5 16.5h1v1h-1z',
    search: 'M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14zM20 20l-4-4',
    user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
    users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.5 2.3 3.5 5.2',
    car: 'M5 16h14M3 16v-3l2-5h14l2 5v3h-2M3 16h2M7 16a2 2 0 1 0 0 .01M17 16a2 2 0 1 0 0 .01M5.5 11h13',
    truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6 18a2 2 0 1 0 0-.01M17 18a2 2 0 1 0 0-.01',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6z',
    badge: 'M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6zM9 12l2 2l4-4',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    download: 'M12 4v11M7 10l5 5l5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5l5 5M5 4h14',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12l5 5L20 7',
    x: 'M6 6l12 12M18 6L6 18',
    alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    clock: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM12 7v5l3 2',
    sync: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
    offline: 'M2 8a15 15 0 0 1 6-3.5M22 8a15 15 0 0 0-11-4M5 12a10 10 0 0 1 3.5-2.3M19 12a10 10 0 0 0-5-2.8M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18',
    logout: 'M15 4h4v16h-4M10 8l-4 4l4 4M6 12h11',
    settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z',
    phone: 'M5 3h4l2 5l-3 2a12 12 0 0 0 6 6l2-3l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2',
    camera: 'M3 8h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z',
    print: 'M7 9V3h10v6M7 17H4V9h16v8h-3M7 14h10v7H7z',
    mail: 'M3 5h18v14H3zM3 6l9 7l9-7',
    eye: 'M2 12s4-7 10-7s10 7 10 7s-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
    unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
    home: 'M3 11l9-7l9 7M5 10v10h14V10',
    menu: 'M4 6h16M4 12h16M4 18h16',
    back: 'M15 5l-7 7l7 7',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    flash: 'M13 3L5 14h6l-1 7l8-11h-6z',
    history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2',
    key: 'M15 7a4 4 0 1 1-3.5 6L4 20.5V17h3v-3h3l1.5-1.5A4 4 0 0 1 15 7z',
    door: 'M5 21V3h11v18M16 5h3v16M12 12h.01M3 21h18',
    inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    share: 'M18 8a3 3 0 1 0 0-.01M6 15a3 3 0 1 0 0-.01M18 22a3 3 0 1 0 0-.01M8.6 13.5l6.8-4M8.6 16.5l6.8 4',
    seal: 'M8 3h8v6l-4 3l-4-3zM12 12v9M9 18h6',
    keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    bell: 'M6 10a6 6 0 0 1 12 0c0 5 2 7 2 7H4s2-2 2-7M10 21a2 2 0 0 0 4 0',
    package: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h2M12 14h2M16 14h.01M8 17h2M12 17h2',
    pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12.5a3 3 0 1 0 0-6a3 3 0 0 0 0 6z',
    route: 'M6 19a2 2 0 1 0 0-.01M18 5a2 2 0 1 0 0-.01M6 17V9a3 3 0 0 1 3-3h1M18 7v8a3 3 0 0 1-3 3h-1M10 6l2-2M10 6l2 2M14 18l-2-2M14 18l-2 2',
    word: 'M6 3h8l4 4v14H6zM14 3v4h4M8.5 11l1.2 6l1.8-4.5l1.8 4.5l1.2-6',
    whatsapp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z'
  };
  AP.icon = function (name, size, cls) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 20); svg.setAttribute('height', size || 20);
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    var p = document.createElementNS(ns, 'path'); p.setAttribute('d', P[name] || P.file);
    svg.appendChild(p);
    return svg;
  };

  // ---------- Avisos ----------
  var toastBox = null;
  AP.toast = function (msg, kind, ms) {
    if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    var t = h('div', { class: 'toast ' + (kind || '') }, AP.icon(kind === 'error' ? 'alert' : kind === 'warn' ? 'alert' : 'check', 18), h('span', null, msg));
    toastBox.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, ms || (kind === 'error' ? 6000 : 3200));
  };

  // ---------- Ventanas modales ----------
  AP.modal = function (opt) {
    var prev = document.activeElement;
    var close = function (v) {
      wrap.remove(); document.removeEventListener('keydown', onKey);
      if (prev && prev.focus) try { prev.focus(); } catch (e) { /* ignorar */ }
      if (opt.onClose) opt.onClose(v);
    };
    var onKey = function (e) { if (e.key === 'Escape' && !opt.persistent) close(); };
    var body = typeof opt.body === 'function' ? opt.body(close) : opt.body;
    var actions = (opt.actions || []).map(function (a) {
      return h('button', { class: 'btn ' + (a.kind || ''), type: 'button', onclick: function () { a.onClick ? a.onClick(close) : close(a.value); } }, a.icon ? AP.icon(a.icon, 18) : null, a.label);
    });
    var box = h('div', { class: 'modal ' + (opt.size || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opt.title || '' },
      h('div', { class: 'modal-head' }, h('h2', null, opt.title || ''),
        opt.persistent ? null : h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onclick: function () { close(); } }, AP.icon('x', 20))),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions) : null);
    var wrap = h('div', { class: 'modal-wrap', onclick: function (e) { if (e.target === wrap && !opt.persistent) close(); } }, box);
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey);
    var f = box.querySelector('input,select,textarea,button.primary');
    if (f) setTimeout(function () { try { f.focus(); } catch (e) { /* ignorar */ } }, 30);
    return { close: close, el: box };
  };
  AP.confirm = function (title, text, okLabel, kind) {
    return new Promise(function (res) {
      AP.modal({
        title: title, body: h('p', { class: 'muted' }, text),
        onClose: function (v) { res(v === true); },
        actions: [{ label: 'Cancelar', value: false }, { label: okLabel || 'Aceptar', kind: kind || 'primary', value: true }]
      });
    });
  };

  // ---------- Formularios ----------
  // field('Etiqueta', inputEl, ayuda)
  AP.field = function (label, input, help, cls) {
    var id = input.id || ('f' + Math.random().toString(36).slice(2, 9));
    input.id = id;
    return h('div', { class: 'field ' + (cls || '') }, h('label', { for: id }, label), input, help ? h('small', { class: 'help' }, help) : null);
  };
  AP.input = function (name, value, attrs) {
    return h('input', Object.assign({ name: name, value: value == null ? '' : value, autocomplete: 'off' }, attrs || {}));
  };
  AP.select = function (name, options, value, attrs) {
    var s = h('select', Object.assign({ name: name }, attrs || {}));
    options.forEach(function (o) {
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : (o === '' ? '— Seleccione —' : o);
      var opt = h('option', { value: v }, l);
      if (String(v) === String(value == null ? '' : value)) opt.selected = true;
      s.appendChild(opt);
    });
    return s;
  };
  AP.textarea = function (name, value, attrs) {
    var t = h('textarea', Object.assign({ name: name, rows: 3 }, attrs || {}));
    t.value = value || ''; return t;
  };
  AP.check = function (name, label, checked, attrs) {
    var i = h('input', Object.assign({ type: 'checkbox', name: name, checked: !!checked }, attrs || {}));
    return h('label', { class: 'check' }, i, h('span', null, label));
  };
  AP.formData = function (root) {
    var o = {};
    root.querySelectorAll('input[name],select[name],textarea[name]').forEach(function (el) {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value.trim();
    });
    return o;
  };
  AP.segmented = function (name, options, value, onChange) {
    var wrap = h('div', { class: 'segmented', role: 'radiogroup' });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', role: 'radio', class: o.value === value ? 'on ' + (o.cls || '') : (o.cls || ''), 'aria-checked': String(o.value === value), dataset: { v: o.value } },
        o.icon ? AP.icon(o.icon, 18) : null, o.label);
      b.addEventListener('click', function () {
        wrap.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-checked', 'true'); wrap.dataset.value = o.value;
        if (onChange) onChange(o.value);
      });
      wrap.appendChild(b);
    });
    wrap.dataset.value = value;
    wrap.dataset.name = name;
    return wrap;
  };

  AP.spinner = function (text) { return h('div', { class: 'loading' }, h('span', { class: 'spin' }), text ? h('span', null, text) : null); };
  AP.empty = function (icon, title, text, action) {
    return h('div', { class: 'empty' }, AP.icon(icon || 'inbox', 36), h('strong', null, title), text ? h('p', null, text) : null, action || null);
  };
  AP.pill = function (text, kind) { return h('span', { class: 'pill ' + (kind || '') }, text); };
  AP.estadoPill = function (estado) {
    var k = { Habilitado: 'ok', Aprobada: 'ok', Permitido: 'ok', Conforme: 'ok', Confirmado: 'ok', Inhabilitado: 'deny', Rechazada: 'deny', Rechazado: 'deny', Negado: 'deny', 'No conforme': 'deny', Cancelada: 'muted', Cancelado: 'muted', Pendiente: 'warn' }[estado] || 'muted';
    return AP.pill(estado || '—', k);
  };
  AP.photoEl = function (rec, cls) {
    var src = rec && rec.Foto ? rec.Foto : U.avatar(rec && (rec.Title || rec.Nombre));
    return h('img', { class: 'photo ' + (cls || ''), src: src, alt: 'Fotografía de ' + ((rec && rec.Title) || 'la persona'), loading: 'lazy' });
  };

  // Abre la cámara del celular (o el selector de archivos en el computador)
  // ---------- Control de elementos: auxiliares comunes (consola y pantalla de verificación) ----------
  AP.Elem = {
    items: function (x) { try { var a = JSON.parse((x && x.Items) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } },
    fotos: function (x) { try { var a = JSON.parse((x && x.Fotos) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } },
    resumen: function (elems) {
      return elems.map(function (i) { return (i.cant > 1 ? i.cant + ' × ' : '') + i.desc + (i.serial ? ' (' + i.serial + ')' : ''); }).join('; ');
    },
    tabla: function (elems) {
      return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, 'Elemento'), h('th', null, 'Cant.'), h('th', null, 'Serial / código'))),
        h('tbody', null, elems.length ? elems.map(function (i) {
          return h('tr', null, h('td', { 'data-label': 'Elemento' }, i.desc), h('td', { 'data-label': 'Cant.' }, String(i.cant || 1)), h('td', { 'data-label': 'Serial' }, i.serial || '—'));
        }) : h('tr', null, h('td', { colspan: 3, class: 'center muted' }, 'Sin elementos')))));
    },
    // Fotografías guardadas (se descargan del servidor solo cuando se muestran)
    galeria: function (fotos) {
      var gal = h('div', { class: 'gallery' });
      fotos.forEach(function (f) {
        var fig = h('figure', null, h('div', { class: 'ph' }, 'Cargando…'), h('figcaption', null, f.etiqueta || 'Fotografía'));
        gal.appendChild(fig);
        AP.B.fileUrl(f.ruta).then(function (u) {
          if (!u) { fig.firstChild.textContent = 'No disponible'; return; }
          fig.replaceChild(h('a', { href: u, target: '_blank', rel: 'noopener' }, h('img', { src: u, alt: f.etiqueta || 'Fotografía de los elementos' })), fig.firstChild);
        }).catch(function () { fig.firstChild.textContent = 'No disponible'; });
      });
      return gal;
    }
  };

  // ---------- Anfitrión: búsqueda en el personal propio (v2.2.0) ----------
  // Deja la visita vinculada al colaborador. Conserva en campos ocultos Anfitrion, AnfitrionId, AnfitrionDoc y
  // AnfitrionCargo, que AP.formData lee junto con el resto del formulario.
  // opt: { fuente: async () => personas, valor: registro previo, onSelect: fn(persona), libre: bool, placeholder }
  AP.anfitrionPicker = function (opt) {
    opt = opt || {};
    var v0 = opt.valor || {};
    var hid = {};
    ['Anfitrion', 'AnfitrionId', 'AnfitrionDoc', 'AnfitrionCargo'].forEach(function (k) { hid[k] = h('input', { type: 'hidden', name: k, value: v0[k] || '' }); });
    var area = '';
    var buscar = h('input', { type: 'search', autocomplete: 'off', class: 'anf-buscar', placeholder: opt.placeholder || 'Nombre, documento, cargo o área del colaborador', 'aria-label': 'Buscar anfitrión en el personal propio' });
    var res = h('div', { class: 'list anf-res' });
    var vista = h('div', { class: 'stack sm' });
    var box = h('div', { class: 'anf-pick' }, vista, h('div', { hidden: true }, hid.Anfitrion, hid.AnfitrionId, hid.AnfitrionDoc, hid.AnfitrionCargo));
    var cache = null;
    async function personal() {
      if (!cache) {
        var l = await opt.fuente();
        cache = (l || []).filter(function (p) { return p.Tipo === 'Personal propio' && p.Estado === 'Habilitado' && p.Title; });
      }
      return cache;
    }
    function fijar(p) {
      hid.Anfitrion.value = p ? p.Title : (opt.libre ? buscar.value.trim() : '');
      hid.AnfitrionId.value = p ? p.id : '';
      hid.AnfitrionDoc.value = p ? (p.NumDoc || '') : '';
      hid.AnfitrionCargo.value = p ? (p.Cargo || '') : '';
      area = p ? (p.Area || '') : '';
    }
    var filtrar = U.debounce(async function () {
      if (!hid.AnfitrionId.value) fijar(null);
      var t = U.fold(buscar.value), d = U.normDoc(buscar.value);
      if (t.length < 2) { res.replaceChildren(); return; }
      try {
        var l = (await personal()).filter(function (p) {
          return U.fold([p.Title, p.Cargo, p.Area].join(' ')).indexOf(t) >= 0 || (d.length >= 3 && U.normDoc(p.NumDoc).indexOf(d) >= 0);
        }).slice(0, 8);
        if (!l.length) {
          res.replaceChildren(h('p', { class: 'muted small' }, 'No aparece en el personal propio habilitado.' + (opt.libre && buscar.value.trim() ? ' Se registrará como texto: «' + buscar.value.trim() + '», sin vínculo con un colaborador.' : '')));
          return;
        }
        res.replaceChildren.apply(res, l.map(function (p) {
          return h('button', { class: 'list-item', type: 'button', onclick: function () { fijar(p); pintar(); if (opt.onSelect) opt.onSelect(p); } },
            AP.icon('badge', 20), h('div', null, h('strong', null, p.Title), h('small', null, [p.Cargo, p.Area].filter(Boolean).join(' · ') || 'Personal propio')));
        }));
      } catch (e) { res.replaceChildren(h('p', { class: 'note' }, 'No fue posible consultar el personal: ' + e.message)); }
    }, 200);
    buscar.addEventListener('input', filtrar);
    function pintar() {
      if (hid.AnfitrionId.value) {
        vista.replaceChildren(h('div', { class: 'sel-persona' }, AP.icon('badge', 22),
          h('div', null, h('strong', null, hid.Anfitrion.value),
            h('small', { class: 'block muted' }, [hid.AnfitrionCargo.value, area].filter(Boolean).join(' · ') || 'Personal propio'),
            h('small', { class: 'block muted' }, 'Visita vinculada al colaborador')),
          h('button', { class: 'btn small', type: 'button', onclick: function () { buscar.value = ''; fijar(null); res.replaceChildren(); pintar(); setTimeout(function () { try { buscar.focus(); } catch (e) { /* */ } }, 30); } }, 'Cambiar')));
      } else {
        vista.replaceChildren(buscar, res,
          hid.Anfitrion.value && buscar.value.trim() === hid.Anfitrion.value ? h('small', { class: 'help' }, 'Anfitrión sin vincular: búsquelo y selecciónelo de la lista para vincular la visita al colaborador.') : null);
      }
    }
    if (!v0.AnfitrionId && v0.Anfitrion) buscar.value = v0.Anfitrion;
    pintar();
    box.valor = function () { return { Anfitrion: hid.Anfitrion.value, AnfitrionId: hid.AnfitrionId.value, AnfitrionDoc: hid.AnfitrionDoc.value, AnfitrionCargo: hid.AnfitrionCargo.value, Area: area }; };
    box.vinculado = function () { return !!hid.AnfitrionId.value; };
    return box;
  };

  // ---------- Quién autoriza: se elige de la lista de personas registradas ----------
  // Guarda en campos ocultos AutorizadoPor ("Nombre — Cargo"), AutorizadoPorId, AutorizadoPorDoc y AutorizadoPorCargo.
  // opt: { fuente: async () => personas, valor: registro previo, placeholder }
  AP.autorizaPicker = function (opt) {
    opt = opt || {};
    var v0 = opt.valor || {};
    var K = ['AutorizadoPor', 'AutorizadoPorId', 'AutorizadoPorDoc', 'AutorizadoPorCargo'];
    var hid = {};
    K.forEach(function (k) { hid[k] = h('input', { type: 'hidden', name: k, value: v0[k] || '' }); });
    var buscar = h('input', { type: 'search', autocomplete: 'off', placeholder: opt.placeholder || 'Nombre, documento, cargo o área de quien autoriza', 'aria-label': 'Buscar a quien autoriza' });
    var res = h('div', { class: 'list anf-res' });
    var vista = h('div', { class: 'stack sm' });
    var box = h('div', { class: 'anf-pick' }, vista, h('div', { hidden: true }, K.map(function (k) { return hid[k]; })));
    var cache = null;
    async function personas() {
      if (!cache) {
        var l = await opt.fuente();
        // Primero el personal propio (jefes de área); luego los demás registrados habilitados
        cache = (l || []).filter(function (p) { return p.Estado === 'Habilitado' && p.Title; })
          .sort(function (a, b) { return (a.Tipo === 'Personal propio' ? 0 : 1) - (b.Tipo === 'Personal propio' ? 0 : 1) || (U.fold(a.Title) < U.fold(b.Title) ? -1 : 1); });
      }
      return cache;
    }
    function texto(nombre, cargo) { return nombre + (cargo ? ' — ' + cargo : ''); }
    function miCargo() { return (AP.Session.user.perfil && AP.Session.user.perfil.Cargo) || 'Director de Seguridad Integral'; }
    function fijar(p, yo) {
      if (yo) {
        hid.AutorizadoPor.value = texto(AP.Session.user.nombre, miCargo());
        hid.AutorizadoPorId.value = ''; hid.AutorizadoPorDoc.value = (AP.Session.user.perfil && AP.Session.user.perfil.NumDoc) || ''; hid.AutorizadoPorCargo.value = miCargo();
        return;
      }
      hid.AutorizadoPor.value = p ? texto(p.Title, p.Cargo) : '';
      hid.AutorizadoPorId.value = p ? p.id : '';
      hid.AutorizadoPorDoc.value = p ? (p.NumDoc || '') : '';
      hid.AutorizadoPorCargo.value = p ? (p.Cargo || '') : '';
    }
    var filtrar = U.debounce(async function () {
      var t = U.fold(buscar.value), d = U.normDoc(buscar.value);
      if (t.length < 2) { res.replaceChildren(); return; }
      try {
        var l = (await personas()).filter(function (p) {
          return U.fold([p.Title, p.Cargo, p.Area, p.Empresa].join(' ')).indexOf(t) >= 0 || (d.length >= 3 && U.normDoc(p.NumDoc).indexOf(d) >= 0);
        }).slice(0, 8);
        if (!l.length) { res.replaceChildren(h('p', { class: 'muted small' }, 'No aparece entre las personas habilitadas. Regístrela primero en Personas.')); return; }
        res.replaceChildren.apply(res, l.map(function (p) {
          return h('button', { class: 'list-item', type: 'button', onclick: function () { fijar(p); pintar(); if (opt.onSelect) opt.onSelect(p); } },
            AP.icon('badge', 20), h('div', null, h('strong', null, p.Title), h('small', null, [p.Cargo, p.Area, p.Tipo !== 'Personal propio' ? p.Tipo + (p.Empresa ? ' · ' + p.Empresa : '') : ''].filter(Boolean).join(' · ') || p.Tipo || '')));
        }));
      } catch (e) { res.replaceChildren(h('p', { class: 'note' }, 'No fue posible consultar las personas: ' + e.message)); }
    }, 200);
    buscar.addEventListener('input', filtrar);
    function pintar() {
      if (hid.AutorizadoPor.value) {
        vista.replaceChildren(h('div', { class: 'sel-persona' }, AP.icon('badge', 22),
          h('div', null, h('strong', null, hid.AutorizadoPor.value),
            h('small', { class: 'block muted' }, hid.AutorizadoPorId.value ? 'Persona registrada' + (hid.AutorizadoPorDoc.value ? ' · doc. ' + hid.AutorizadoPorDoc.value : '') : (hid.AutorizadoPorCargo.value ? 'Usuario de la consola' : 'Registro anterior (texto libre)'))),
          h('button', { class: 'btn small', type: 'button', onclick: function () { buscar.value = ''; K.forEach(function (k) { hid[k].value = ''; }); res.replaceChildren(); pintar(); setTimeout(function () { try { buscar.focus(); } catch (e) { /* */ } }, 30); } }, 'Cambiar')));
      } else {
        vista.replaceChildren(buscar, res,
          AP.Session.can('admin') ? h('button', { class: 'btn small ghost', type: 'button', onclick: function () { fijar(null, true); pintar(); } }, AP.icon('shield', 16), 'Autorizo yo (' + miCargo() + ')') : null);
      }
    }
    pintar();
    box.valor = function () { var o = {}; K.forEach(function (k) { o[k] = hid[k].value; }); return o; };
    box.elegido = function () { return !!hid.AutorizadoPor.value; };
    return box;
  };

  // ---------- Búsqueda y descarga en las listas ----------
  // Coincide si cada palabra escrita aparece en alguno de los campos (sin tildes; documentos y placas sin signos).
  AP.coincide = function (r, txt, campos) {
    var palabras = U.fold(txt).split(/\s+/).filter(Boolean);
    if (!palabras.length) return true;
    var vals = campos.map(function (k) { var v = typeof k === 'function' ? k(r) : r[k]; return v == null ? '' : String(v); });
    var s = U.fold(vals.join(' | ')), sd = vals.map(U.normDoc).join('|');
    return palabras.every(function (p) { var pd = U.normDoc(p); return s.indexOf(p) >= 0 || (pd.length >= 3 && sd.indexOf(pd) >= 0); });
  };
  AP.buscador = function (placeholder, alCambiar) {
    var i = h('input', { type: 'search', class: 'grow', placeholder: placeholder || 'Buscar en la lista', 'aria-label': placeholder || 'Buscar en la lista', autocomplete: 'off' });
    i.addEventListener('input', U.debounce(alCambiar, 200));
    return i;
  };
  AP.btnExcel = function (onclick, texto) {
    return h('button', { class: 'btn', type: 'button', onclick: onclick }, AP.icon('download', 18), texto || 'Excel');
  };

  // ---------- Visitantes ya conocidos (v2.3.0) ----------
  // Las visitas anteriores de la misma cédula llenan el formulario de una visita nueva. El visitante NO se crea en
  // Personas: allí solo figuran quienes tienen QR permanente (personal propio, contratistas y conductores).
  var cacheVis = {};
  AP.Visitantes = {
    historial: async function (doc, excluirId) {
      var raw = String(doc || '').trim(), d = U.normDoc(raw);
      if (d.length < 5) return [];
      var c = cacheVis[d];
      if (!c || Date.now() - c.t > 60000) {
        var porId = {};
        (AP.Sync.visitas || []).forEach(function (v) { if (U.normDoc(v.NumDoc) === d) porId[v.id] = v; });
        var vals = [raw]; if (d !== raw) vals.push(d);
        for (var i = 0; i < vals.length; i++) {
          try { (await AP.B.findBy('AP_Visitas', 'NumDoc', vals[i])).forEach(function (v) { if (!v._borrado) porId[v.id] = v; }); }
          catch (e) { /* sin conexión: solo lo que hay en el dispositivo */ }
        }
        c = cacheVis[d] = { t: Date.now(), l: Object.keys(porId).map(function (k) { return porId[k]; }).sort(function (a, b) { return (a.FechaInicio || '') < (b.FechaInicio || '') ? 1 : -1; }) };
      }
      return c.l.filter(function (v) { return v.id !== excluirId; });
    },
    olvidar: function (doc) { delete cacheVis[U.normDoc(doc)]; },
    // Llena con la visita (o persona) de referencia los campos que estén vacíos; devuelve los nombres de los campos llenados
    llenar: function (campos, ref) {
      var nombres = { Title: 'nombre', TipoDoc: 'tipo de documento', Empresa: 'empresa', Telefono: 'celular', Correo: 'correo', Placa: 'placa', VehiculoTipo: 'vehículo' };
      var hechos = [];
      Object.keys(nombres).forEach(function (k) {
        var el = campos[k], val = ref && ref[k];
        if (!el || !val) return;
        var vacio = !String(el.value || '').trim() || (k === 'TipoDoc' && el.value === 'CC');
        if (!vacio || String(el.value) === String(val)) return;
        el.value = val;
        el.classList.add('autollenado');
        el.addEventListener('input', function () { el.classList.remove('autollenado'); }, { once: true });
        hechos.push(nombres[k]);
      });
      return hechos;
    },
    resumen: function (l) {
      var rech = l.filter(function (v) { return v.Estado === 'Rechazada'; });
      return { n: l.length, ultima: l[0] || null, rechazadas: rech, ultRechazo: rech[0] || null };
    }
  };

  // ---------- WhatsApp ----------
  // Número internacional sin signos para wa.me. Celulares de Colombia: 10 dígitos que empiezan por 3.
  AP.waNum = function (tel) {
    var raw = String(tel || '').trim(), d = raw.replace(/\D/g, '');
    if (/^3\d{9}$/.test(d)) return '57' + d;
    if (/^573\d{9}$/.test(d)) return d;
    if (/^00\d{10,15}$/.test(d)) return d.slice(2);
    if (raw.charAt(0) === '+' && d.length >= 10 && d.length <= 15) return d;
    return '';
  };
  AP.waLink = function (num, texto) { return 'https://wa.me/' + num + (texto ? '?text=' + encodeURIComponent(texto) : ''); };
  AP.WA_DIRECTOR = '573106453940';

  // ---------- Inducción para visitantes ----------
  AP.Induccion = {
    // Página pública con el texto completo, en el mismo sitio de la aplicación
    url: function () { try { return new URL('induccion.html', location.href.split('#')[0]).href; } catch (e) { return 'induccion.html'; } },
    texto: function () {
      var c = (AP.TX && AP.TX.induccionCorta) || [];
      if (!c.length) return '';
      return 'INDUCCIÓN PARA VISITANTES — inocuidad y seguridad (de obligatorio cumplimiento):\n' +
        c.map(function (x) { return '• ' + x; }).join('\n') +
        '\nLea la inducción completa antes de su visita: ' + AP.Induccion.url();
    },
    html: function () {
      var c = (AP.TX && AP.TX.induccionCorta) || [], e = AP.esc || function (s) { return String(s); };
      if (!c.length) return '';
      return '<p style="margin:16px 0 4px"><b>Inducción para visitantes — inocuidad y seguridad (de obligatorio cumplimiento)</b></p><ul style="margin:0 0 6px;padding-left:20px">' +
        c.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>' +
        '<p>Lea la inducción completa antes de su visita: <a href="' + e(AP.Induccion.url()) + '">' + e(AP.Induccion.url()) + '</a></p>';
    }
  };

  // ---------- Aviso al anfitrión de que su visitante ya ingresó ----------
  // Devuelve { num, texto, persona } o null si no hay anfitrión. El celular se toma de su registro en Personas.
  AP.avisoAnfitrion = function (v, cuando, personas) {
    if (!v || !v.Anfitrion) return null;
    var lista = personas || (AP.Sync && AP.Sync.personas) || [];
    var d = U.normDoc(v.AnfitrionDoc);
    var p = lista.find(function (x) { return (v.AnfitrionId && x.id === v.AnfitrionId) || (d && U.normDoc(x.NumDoc) === d); }) || null;
    var nombre = (p && p.Title) || v.Anfitrion;
    var texto = 'Avo Pak S.A.S. — Dirección de Seguridad Integral. ' + nombre + ': su visitante ' + v.Title + (v.Empresa ? ' (' + v.Empresa + ')' : '') +
      ' registró su ingreso por ' + (v.Porteria || (AP.CFG && AP.CFG.porteria) || 'portería') + ' a las ' + U.fTime(cuando || new Date()) + '. ' +
      'Preséntese a recibirlo. Desde este momento usted es responsable de acompañarlo durante toda su permanencia y de que cumpla el protocolo de visitantes ' +
      '(inducción de inocuidad y SST, elementos de protección y áreas autorizadas) hasta su salida.';
    return { num: p ? AP.waNum(p.Telefono) : '', texto: texto, persona: p, nombre: nombre };
  };

  AP.pickImage = function (capture) {
    return new Promise(function (res) {
      var i = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      if (capture) i.setAttribute('capture', capture);
      i.addEventListener('change', function () { res(i.files && i.files[0] ? i.files[0] : null); i.remove(); });
      document.body.appendChild(i);
      i.click();
    });
  };
})();
