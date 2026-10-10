/*
 * Notificaciones — Avo Pak S.A.S.
 * Push del navegador (todos los registros de portería) + EmailJS (negados, novedades, inspecciones no conformes).
 *
 * Para activar el correo, el Director configura EmailJS una vez:
 *   AP.Notif.configurar({ serviceId, templateId, publicKey })
 * Los valores se guardan en localStorage para no pedirlos cada vez.
 */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});

  /* ───────── utilidades ───────── */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fHora(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function leerCfg() {
    try { return JSON.parse(localStorage.getItem('ap_emailjs') || 'null'); } catch (e) { return null; }
  }
  function guardarCfg(o) {
    try { localStorage.setItem('ap_emailjs', JSON.stringify(o)); } catch (e) {}
  }

  /* ───────── permisos de notificación del navegador ───────── */
  var permisoPedido = false;
  function pedirPermiso() {
    if (permisoPedido) return;
    permisoPedido = true;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(function () {});
    }
  }

  /* ───────── notificación push (navegador) ───────── */
  function pushLocal(titulo, cuerpo, tag) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(titulo, {
        body: cuerpo,
        icon: '/app/img/icon-192.png',
        badge: '/app/img/icon-192.png',
        tag: tag || ('ap-' + Date.now()),
        requireInteraction: false
      });
    } catch (e) { /* silencioso */ }
  }

  /* ───────── correo vía EmailJS ───────── */
  function enviarCorreo(params) {
    var cfg = leerCfg();
    if (!cfg || !cfg.serviceId || !cfg.templateId || !cfg.publicKey) return; // no configurado
    if (typeof emailjs === 'undefined') return; // librería no cargada
    emailjs.send(cfg.serviceId, cfg.templateId, params, cfg.publicKey)
      .catch(function (e) { console.warn('[AP] EmailJS error:', e); });
  }

  /* ───────── funciones públicas ───────── */

  /**
   * Notificar un movimiento de portería.
   * @param {object} mov  Objeto con los campos del movimiento (ya construido).
   */
  function notificarMovimiento(mov) {
    pedirPermiso();
    var hora = fHora(mov.FechaHora);
    var nombre = mov.Title || '(sin nombre)';
    var sent = mov.Sentido || '';
    var resultado = mov.Resultado || '';
    var vigilante = mov.Vigilante || '';
    var empresa = mov.Empresa ? ' · ' + mov.Empresa : '';
    var placa = mov.Placa ? ' · Placa: ' + mov.Placa : '';
    var novedad = mov.Novedad ? ' · NOVEDAD: ' + mov.Novedad : '';

    /* push para todos los registros */
    var titulo, cuerpo;
    if (resultado === 'Negado') {
      titulo = '🚫 INGRESO NEGADO — ' + nombre;
      cuerpo = hora + empresa + ' · Motivo: ' + (mov.MotivoNegacion || '—') + ' · Por: ' + vigilante;
    } else if (sent === 'Ingreso') {
      titulo = '✅ Ingreso — ' + nombre;
      cuerpo = hora + empresa + placa + (mov.Excepcion ? ' · EXCEPCIÓN' : '') + novedad + ' · ' + vigilante;
    } else {
      titulo = '🚪 Salida — ' + nombre;
      cuerpo = hora + empresa + placa + novedad + ' · ' + vigilante;
    }
    pushLocal(titulo, cuerpo, 'mov-' + (mov.IdLocal || Date.now()));

    /* correo solo para negados y novedades */
    var esNegado = resultado === 'Negado';
    var tieneNovedad = !!(mov.Novedad && mov.Novedad.trim());
    if (esNegado || tieneNovedad) {
      enviarCorreo({
        asunto: esNegado ? 'Ingreso negado — ' + nombre : 'Novedad — ' + nombre,
        tipo: esNegado ? 'INGRESO NEGADO' : 'NOVEDAD',
        hora: hora,
        nombre: nombre,
        empresa: mov.Empresa || '—',
        categoria: mov.Categoria || '—',
        placa: mov.Placa || '—',
        vigilante: vigilante,
        porteria: mov.Porteria || '—',
        detalle: esNegado ? (mov.MotivoNegacion || '—') : (mov.Novedad || '—'),
        observaciones: mov.Observaciones || '—',
        to_email: 'dmazo@avo-pak.com'
      });
    }
  }

  /**
   * Notificar una inspección de vehículo de carga.
   * @param {object} insp  Campos de la inspección.
   * @param {boolean} conforme  true = conforme, false = no conforme.
   */
  function notificarInspeccion(insp, conforme) {
    pedirPermiso();
    var hora = fHora(insp.FechaHora);
    var placa = insp.Placa || '—';
    var vigilante = insp.Vigilante || '';
    var nc = insp.NoConformidades || '';

    var titulo = conforme
      ? '🔍 Inspección conforme — ' + placa
      : '⚠️ INSPECCIÓN NO CONFORME — ' + placa;
    var cuerpo = hora + ' · ' + (insp.Empresa || '') + ' · ' + vigilante + (nc ? '\n' + nc.split('\n')[0] : '');
    pushLocal(titulo, cuerpo, 'insp-' + (insp.IdLocal || Date.now()));

    /* correo solo para no conformes */
    if (!conforme) {
      enviarCorreo({
        asunto: 'Inspección NO CONFORME — ' + placa,
        tipo: 'INSPECCIÓN NO CONFORME',
        hora: hora,
        nombre: placa,
        empresa: insp.Empresa || insp.Transportadora || '—',
        categoria: 'Inspección de carga',
        placa: placa,
        vigilante: vigilante,
        porteria: insp.Porteria || '—',
        detalle: nc || '—',
        observaciones: insp.Observaciones || '—',
        to_email: 'dmazo@avo-pak.com'
      });
    }
  }

  /**
   * Configurar EmailJS. Llame una vez desde la consola del administrador.
   * @param {object} o  { serviceId, templateId, publicKey }
   */
  function configurar(o) {
    if (!o || !o.serviceId || !o.templateId || !o.publicKey) return;
    guardarCfg(o);
    if (typeof emailjs !== 'undefined') emailjs.init(o.publicKey);
  }

  /** Inicialización automática al cargar. */
  function init() {
    var cfg = leerCfg();
    if (cfg && cfg.publicKey && typeof emailjs !== 'undefined') {
      emailjs.init(cfg.publicKey);
    }
    /* pedir permiso push al primer gesto del usuario */
    document.addEventListener('click', pedirPermiso, { once: true });
  }

  AP.Notif = {
    init: init,
    configurar: configurar,
    movimiento: notificarMovimiento,
    inspeccion: notificarInspeccion,
    emailConfigurado: function () { return !!leerCfg(); }
  };

})();
