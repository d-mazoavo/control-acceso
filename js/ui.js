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
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'
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
    var k = { Habilitado: 'ok', Aprobada: 'ok', Permitido: 'ok', Conforme: 'ok', Inhabilitado: 'deny', Rechazada: 'deny', Negado: 'deny', 'No conforme': 'deny', Cancelada: 'muted', Pendiente: 'warn' }[estado] || 'muted';
    return AP.pill(estado || '—', k);
  };
  AP.photoEl = function (rec, cls) {
    var src = rec && rec.Foto ? rec.Foto : U.avatar(rec && (rec.Title || rec.Nombre));
    return h('img', { class: 'photo ' + (cls || ''), src: src, alt: 'Fotografía de ' + ((rec && rec.Title) || 'la persona'), loading: 'lazy' });
  };

  // Abre la cámara del celular (o el selector de archivos en el computador)
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
