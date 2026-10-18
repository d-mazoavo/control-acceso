/* Página pública de inducción para visitantes (el enlace llega con el pase por WhatsApp o correo). Sin datos personales. */
(function () {
  'use strict';
  var T = window.AP_TEXTOS || {}, C = window.AP_CONFIG || {};
  var ind = T.induccionVisitantes;
  var box = document.getElementById('contenido');
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  box.textContent = '';
  if (!ind) { box.appendChild(el('p', null, 'La inducción no está disponible en este momento. Solicítela en portería.')); return; }
  document.getElementById('titulo').textContent = ind.titulo;
  document.getElementById('empresa').textContent = (C.empresa || 'Avo Pak S.A.S.') + (C.sede ? ' · ' + C.sede : '');
  box.appendChild(el('p', 'intro', ind.intro));
  ind.secciones.forEach(function (s) {
    var sec = el('section');
    sec.appendChild(el('h2', null, s.titulo));
    var ul = el('ul');
    s.items.forEach(function (i) { ul.appendChild(el('li', null, i)); });
    sec.appendChild(ul);
    box.appendChild(sec);
  });
  box.appendChild(el('p', 'cierre', ind.cierre));
  var btns = el('div', 'btns');
  var imp = el('button', null, 'Imprimir o guardar en PDF');
  imp.type = 'button';
  imp.addEventListener('click', function () { window.print(); });
  btns.appendChild(imp);
  box.appendChild(btns);
  document.getElementById('pie').textContent = 'Dirección de Seguridad Integral · ' + (C.empresa || 'Avo Pak S.A.S.') + ' · ' + (T.versionInduccion || '');
})();
