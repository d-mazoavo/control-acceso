/* Registra un error de escritura en config.js para explicarlo en pantalla (se carga antes que config.js). */
window.addEventListener('error', function (e) {
  if (e && e.filename && /config\.js/.test(e.filename)) window.__errConfig = { msg: String(e.message || 'error'), linea: e.lineno || '' };
});
window.__diagVer = '1.2.0';
