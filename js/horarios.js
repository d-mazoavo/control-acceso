/* Horarios programados, permisos y puntualidad (reglas que se aplican sin conexión en el celular de portería) */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;
  var H = (AP.Horario = {});

  function cfg() { return Object.assign({ minutosPendiente: 10, minutosAntelacionTurno: 120, minutosSalidaAntesDeFin: 0, horasMaxSinSalida: 14 }, (AP.CFG && AP.CFG.puntualidad) || {}); }
  H.cfg = cfg;

  function toMin(hm) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; }
  H.toMin = toMin;
  // Día de la semana (0 = domingo) de una fecha 'AAAA-MM-DD' de Colombia
  function dow(ymd) { return new Date(ymd + 'T12:00:00-05:00').getUTCDay(); }
  function addYmd(ymd, n) { return U.ymd(new Date(new Date(ymd + 'T12:00:00-05:00').getTime() + n * 86400000)); }
  H.dow = dow;
  H.nombreDias = function (dias) {
    var set = String(dias || '').split(',').filter(Boolean);
    if (set.length === 7) return 'Todos los días';
    var nombres = {}; AP.CAT.dias.forEach(function (d) { nombres[d[0]] = d[1]; });
    return AP.CAT.dias.filter(function (d) { return set.indexOf(d[0]) >= 0; }).map(function (d) { return d[1]; }).join(', ');
  };

  // Horarios activos de una persona
  H.deTokenOf = function (token) {
    return AP.Sync.horarios.filter(function (x) { return x.Token === token && x.Activo !== false; });
  };

  // Jornadas (instancias con fecha) de la persona en los días cercanos a "now"
  H.instancias = function (token, now) {
    var hs = H.deTokenOf(token), out = [];
    if (!hs.length) return out;
    var hoy = U.ymd(now);
    [-1, 0, 1].forEach(function (off) {
      var ymd = addYmd(hoy, off), wd = String(dow(ymd));
      hs.forEach(function (x) {
        if (x.VigenteDesde && ymd < x.VigenteDesde) return;
        if (x.VigenteHasta && ymd > x.VigenteHasta) return;
        if (String(x.Dias || '').split(',').indexOf(wd) < 0) return;
        var a = toMin(x.HoraEntrada), b = toMin(x.HoraSalida);
        if (a == null || b == null) return;
        var start = U.fromLocal(ymd, x.HoraEntrada);
        var end = U.fromLocal(b <= a ? addYmd(ymd, 1) : ymd, x.HoraSalida);
        out.push({ rec: x, ymd: ymd, start: start, end: end });
      });
    });
    return out;
  };

  // Jornada que corresponde al instante dado.
  // Ingreso: la que contiene el instante (con antelación) o, si no, la de la fecha de hoy (para medir llegada tardía o fuera de turno).
  // Salida (opt.salida): la jornada más reciente ya iniciada; si ya terminó, la salida es normal.
  H.jornada = function (token, now, opt) {
    var ins = H.instancias(token, now);
    if (!ins.length) return null;
    var ant = cfg().minutosAntelacionTurno * 60000, t = now.getTime(), hoy = U.ymd(now), best = null;
    if (opt && opt.salida) {
      ins.forEach(function (i) { if (i.start.getTime() - ant <= t && (!best || i.start > best.start)) best = i; });
      return best;
    }
    ins.forEach(function (i) {
      var dentro = t >= i.start.getTime() - ant && t <= i.end.getTime();
      if (!(dentro || i.ymd === hoy)) return;
      if (!best || (dentro && i.start > best.start) || (!dentro && !best.dentro && i.start > best.start)) { best = i; best.dentro = dentro; }
    });
    return best;
  };

  // Permisos vigentes del instante, de los tipos indicados
  H.permisosVigentes = function (token, now, tipos) {
    var t = now.getTime();
    return AP.Sync.permisos.filter(function (p) {
      return p.Token === token && p.Estado !== 'Anulado' && (!tipos || tipos.indexOf(p.Tipo) >= 0) &&
        new Date(p.Desde).getTime() <= t && t <= new Date(p.Hasta).getTime();
    }).sort(function (a, b) { return a.Hasta < b.Hasta ? 1 : -1; });
  };
  var TIPOS_ENTRADA = ['Ingreso tardío', 'Ingreso y salida fuera de horario'];
  var TIPOS_SALIDA = ['Salida anticipada', 'Salida temporal (cita o diligencia)', 'Ingreso y salida fuera de horario'];

  function hm(d) { return U.fTime(d); }
  function descJornada(j) { return j.rec.Turno ? j.rec.Turno + ' · ' + j.rec.HoraEntrada + ' a ' + j.rec.HoraSalida : j.rec.HoraEntrada + ' a ' + j.rec.HoraSalida; }

  // Evalúa el INGRESO de una persona con horario. Devuelve null si no hay horarios registrados (sin regla adicional).
  // ult = último movimiento permitido de la persona.
  H.evaluarIngreso = function (p, now, ult) {
    var token = p.Token, c = cfg();
    if (!H.deTokenOf(token).length) return null;
    var j = H.jornada(token, now);
    var perm = H.permisosVigentes(token, now, TIPOS_ENTRADA)[0];
    var info = j ? descJornada(j) : '';
    if (perm) {
      return { nivel: 'ok', etiqueta: 'INGRESO AUTORIZADO — ' + perm.Tipo.toUpperCase(), detalle: 'Permiso vigente hasta las ' + hm(perm.Hasta) + (perm.AutorizadoPor ? ' (autoriza ' + perm.AutorizadoPor + ')' : '') + '.', permisoId: perm.id || perm.IdLocal, horarioInfo: info };
    }
    if (!j) {
      return { nivel: 'warn', registrable: true, novedad: 'Ingreso en día no programado', etiqueta: 'DÍA NO PROGRAMADO — INGRESO PENDIENTE',
        detalle: 'No tiene turno programado para hoy. Puede registrarse el ingreso, que queda pendiente de verificación por el Director de Seguridad Integral.', horarioInfo: '' };
    }
    // Reingreso dentro de la misma jornada (salió y regresa): no se mide como llegada tardía
    if (ult && ult.Sentido === 'Salida' && new Date(ult.FechaHora).getTime() >= j.start.getTime() - c.minutosAntelacionTurno * 60000 && now <= j.end) {
      var pt = AP.Sync.permisos.filter(function (x) { return x.Token === token && x.Estado !== 'Anulado' && x.Tipo === 'Salida temporal (cita o diligencia)' && new Date(x.Desde).getTime() <= new Date(ult.FechaHora).getTime() + 60000; }).sort(function (a, b) { return a.Hasta < b.Hasta ? 1 : -1; })[0];
      if (pt && now.getTime() > new Date(pt.Hasta).getTime() + 5 * 60000) {
        return { nivel: 'warn', registrable: true, novedad: 'Reingreso fuera del plazo del permiso', etiqueta: 'REINGRESO FUERA DE PLAZO — PENDIENTE', detalle: 'El permiso de salida temporal vencía a las ' + hm(pt.Hasta) + '.', horarioInfo: info };
      }
      return { nivel: 'ok', etiqueta: 'REINGRESO', detalle: 'Regresa a su jornada (' + info + ').', horarioInfo: info };
    }
    var delta = Math.floor(now.getTime() / 60000) - Math.floor(j.start.getTime() / 60000);
    var ant = Math.floor((j.start.getTime() - now.getTime()) / 60000);
    if (now > j.end) {
      return { nivel: 'deny', sinExcepcion: true, novedad: 'Ingreso denegado: fuera de turno', etiqueta: 'INGRESO DENEGADO — FUERA DE SU TURNO',
        detalle: 'Su turno era ' + info + ' y ya terminó. Comuníquese con el Director de Seguridad Integral, que debe verificar y, si procede, registrar el permiso.', horarioInfo: info };
    }
    if (delta <= 0) {
      if (ant > c.minutosAntelacionTurno) {
        return { nivel: 'warn', registrable: true, novedad: 'Ingreso anticipado', etiqueta: 'INGRESO ANTICIPADO — PENDIENTE', detalle: 'Su turno inicia a las ' + j.rec.HoraEntrada + '. Se registra y queda pendiente de verificación.', horarioInfo: info };
      }
      return { nivel: 'ok', etiqueta: 'HABILITADO — A TIEMPO', detalle: 'Turno ' + info + '.', horarioInfo: info };
    }
    if (delta < c.minutosPendiente) {
      return { nivel: 'warn', registrable: true, novedad: 'Ingreso tardío (' + delta + ' min)', etiqueta: 'INGRESO PENDIENTE — LLEGÓ ' + delta + ' MIN TARDE',
        detalle: 'Turno ' + info + '. Se registra el ingreso y queda pendiente de verificación por el Director de Seguridad Integral.', horarioInfo: info };
    }
    return { nivel: 'deny', sinExcepcion: true, novedad: 'Ingreso denegado: llegada tardía (' + delta + ' min)', etiqueta: 'INGRESO DENEGADO — LLEGADA TARDÍA (' + delta + ' MIN)',
      detalle: 'Turno ' + info + '. El ingreso queda denegado hasta que el Director de Seguridad Integral verifique. Repórtele la novedad.', horarioInfo: info };
  };

  // Evalúa la SALIDA. Sin horarios: salida normal.
  H.evaluarSalida = function (p, now) {
    var token = p.Token, c = cfg();
    if (!H.deTokenOf(token).length) return null;
    var j = H.jornada(token, now, { salida: true });
    var info = j ? descJornada(j) : '';
    if (j && now.getTime() >= j.end.getTime() - c.minutosSalidaAntesDeFin * 60000) {
      return { nivel: 'ok', etiqueta: 'SALIDA AUTORIZADA', detalle: 'Finalizó su jornada (' + info + ').', horarioInfo: info };
    }
    var perm = H.permisosVigentes(token, now, TIPOS_SALIDA)[0];
    if (perm) {
      return { nivel: 'ok', etiqueta: 'SALIDA AUTORIZADA — ' + perm.Tipo.toUpperCase(), detalle: 'Permiso vigente hasta las ' + hm(perm.Hasta) + (perm.Tipo.indexOf('temporal') > 0 ? '; debe reingresar leyendo su QR.' : '.'), permisoId: perm.id || perm.IdLocal, horarioInfo: info };
    }
    return { nivel: 'deny', salidaNoAutorizada: true, novedad: 'Salida no autorizada', etiqueta: 'SALIDA NO AUTORIZADA',
      detalle: (j ? 'Su jornada termina a las ' + hm(j.end) + ' (' + info + '). ' : 'No tiene jornada programada hoy. ') + 'No tiene permiso de salida registrado.', horarioInfo: info };
  };
})();
