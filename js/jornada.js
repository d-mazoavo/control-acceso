/* Jornada del personal propio: festivos de Colombia, programación de planta, estado en planta y horas entre la entrada y
 * la salida registradas en portería, divididas en diurnas, nocturnas y en domingo o festivo.
 * IMPORTANTE: son horas de PERMANENCIA EN PLANTA según portería; no equivalen por sí solas al tiempo de trabajo
 * efectivo ni a la liquidación de nómina (descansos, horas extra autorizadas y novedades se validan en Talento Humano). */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;

  function addYmd(ymd, n) { return U.ymd(new Date(new Date(ymd + 'T12:00:00-05:00').getTime() + n * 86400000)); }
  function dow(ymd) { return new Date(ymd + 'T12:00:00-05:00').getUTCDay(); }
  function lunes(ymd) { var d = dow(ymd); return addYmd(ymd, d === 0 ? -6 : 1 - d); }
  function toMin(hm) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; }

  // ---------- Festivos de Colombia (Ley 51 de 1983: los "trasladables" pasan al lunes siguiente) ----------
  function pascua(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451),
      mes = Math.floor((hh + l - 7 * m + 114) / 31), dia = ((hh + l - 7 * m + 114) % 31) + 1;
    return y + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  }
  function aLunes(ymd) { var d = dow(ymd); return d === 1 ? ymd : addYmd(ymd, (8 - d) % 7); }
  var cacheFest = {};
  function festivos(y) {
    if (cacheFest[y]) return cacheFest[y];
    var p = pascua(y), f = {};
    function pon(ymd, n) { f[ymd] = n; }
    pon(y + '-01-01', 'Año Nuevo'); pon(y + '-05-01', 'Día del Trabajo'); pon(y + '-07-20', 'Independencia');
    pon(y + '-08-07', 'Batalla de Boyacá'); pon(y + '-12-08', 'Inmaculada Concepción'); pon(y + '-12-25', 'Navidad');
    [['01-06', 'Reyes Magos'], ['03-19', 'San José'], ['06-29', 'San Pedro y San Pablo'], ['08-15', 'Asunción de la Virgen'],
      ['10-12', 'Día de la Raza'], ['11-01', 'Todos los Santos'], ['11-11', 'Independencia de Cartagena']].forEach(function (x) { pon(aLunes(y + '-' + x[0]), x[1]); });
    pon(addYmd(p, -3), 'Jueves Santo'); pon(addYmd(p, -2), 'Viernes Santo');
    pon(addYmd(p, 43), 'Ascensión del Señor'); pon(addYmd(p, 64), 'Corpus Christi'); pon(addYmd(p, 71), 'Sagrado Corazón');
    cacheFest[y] = f;
    return f;
  }
  function festivo(ymd) { return festivos(Number(ymd.slice(0, 4)))[ymd] || null; }
  function domOFest(ymd) { return dow(ymd) === 0 || !!festivo(ymd); }

  // Franja nocturna (art. 160 CST, modificado por la Ley 2466 de 2025: nocturno de 19:00 a 06:00; ajustable en config.js)
  function franja() {
    var c = (AP.CFG && AP.CFG.jornada) || {};
    return { diurna: toMin(c.inicioDiurno || '06:00'), nocturna: toMin(c.inicioNocturno || '19:00') };
  }

  // Divide un intervalo [a, b) en minutos diurnos, nocturnos y de domingo o festivo (por la fecha de cada minuto)
  function clasificar(a, b) {
    var F = franja(), out = { total: 0, diurnas: 0, nocturnas: 0, dfDiurnas: 0, dfNocturnas: 0 };
    var t = a.getTime(), fin = b.getTime();
    while (t < fin) {
      var ymd = U.ymd(new Date(t)), p = U.partsCO(new Date(t));
      var m = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
      var limites = [F.diurna, F.nocturna, 1440].filter(function (x) { return x > m; });
      var hasta = Math.min(fin, U.fromLocal(ymd, '00:00').getTime() + Math.min.apply(null, limites) * 60000);
      if (hasta <= t) hasta = t + 60000;
      var min = (hasta - t) / 60000;
      var noche = m >= F.nocturna || m < F.diurna, df = domOFest(ymd);
      out.total += min;
      if (df) { if (noche) out.dfNocturnas += min; else out.dfDiurnas += min; }
      else if (noche) out.nocturnas += min; else out.diurnas += min;
      t = hasta;
    }
    Object.keys(out).forEach(function (k) { out[k] = out[k] / 60; });
    return out;
  }

  // ---------- Programación: turno de una persona en una fecha ----------
  // ctx = { semanas: { 'AAAA-MM-DD(lunes)': { token: { d: {fecha: código}, turnos } } }, horarios: [...] }
  function indexarSemanas(docs) {
    var idx = {};
    (docs || []).forEach(function (w) {
      var datos = AP.Horario.jsonDe(w.Datos, {}), turnos = AP.Horario.jsonDe(w.Turnos, {}), porTok = {};
      Object.keys(datos).forEach(function (pid) { var x = datos[pid]; if (x && x.t) porTok[x.t] = { d: x.d || {}, turnos: turnos, pid: pid }; });
      idx[w.Semana] = porTok;
    });
    return idx;
  }
  function turnoDe(ctx, token, ymd) {
    var w = ctx.semanas && ctx.semanas[lunes(ymd)], x = w && w[token];
    if (x) {
      var cod = x.d[ymd] || '';
      var t = cod && cod !== 'D' ? x.turnos[cod] : null;
      return { fuente: 'planta', cod: cod, nombre: t ? (t.n || cod) : cod === 'D' ? 'Descanso' : '', e: t ? t.e : null, s: t ? t.s : null };
    }
    var wd = String(dow(ymd));
    var hz = (ctx.horarios || []).filter(function (h0) {
      return h0.Token === token && h0.Activo !== false && String(h0.Dias || '').split(',').indexOf(wd) >= 0 &&
        (!h0.VigenteDesde || ymd >= h0.VigenteDesde) && (!h0.VigenteHasta || ymd <= h0.VigenteHasta);
    })[0];
    if (hz) return { fuente: 'horario', cod: '', nombre: hz.Turno || 'Horario', e: hz.HoraEntrada, s: hz.HoraSalida, libre: hz.Modalidad === 'Libre' };
    return null;
  }
  function rangoTurno(ymd, t) {
    if (!t || !t.e || !t.s) return null;
    var a = toMin(t.e), b = toMin(t.s);
    return { ini: U.fromLocal(ymd, t.e), fin: U.fromLocal(b <= a ? addYmd(ymd, 1) : ymd, t.s) };
  }
  function horasTurno(t) { if (!t || !t.e || !t.s) return 0; var m = toMin(t.s) - toMin(t.e); if (m <= 0) m += 1440; return m / 60; }

  // ---------- Movimientos de una persona → intervalos en planta ----------
  function clave(m) { return m.Token || ('DOC:' + U.normDoc(m.NumDoc)); }
  function agrupar(movs) {
    var g = {};
    movs.filter(function (m) { return m.Resultado === 'Permitido'; }).forEach(function (m) {
      var k = m.Token || '', d = U.normDoc(m.NumDoc);
      (g[k || 'DOC:' + d] = g[k || 'DOC:' + d] || []).push(m);
      if (k && d) (g['DOC:' + d] = g['DOC:' + d] || []).push(m);
    });
    return g;
  }
  function movsDe(grupos, p) {
    var a = (grupos[p.Token] || []), b = (grupos['DOC:' + U.normDoc(p.NumDoc)] || []), vistos = {}, out = [];
    a.concat(b).forEach(function (m) { if (!vistos[m.IdLocal || m.id]) { vistos[m.IdLocal || m.id] = 1; out.push(m); } });
    return out.sort(function (x, y) { return x.FechaHora < y.FechaHora ? -1 : 1; });
  }
  function intervalos(ms, ahora) {
    var maxH = ((AP.Horario && AP.Horario.cfg().horasMaxSinSalida) || 14) * 3600000;
    ahora = ahora || new Date();
    var out = [], abierto = null;
    ms.forEach(function (m) {
      if (m.Sentido === 'Ingreso') {
        if (abierto) out.push({ ini: abierto, fin: null, estado: 'Sin salida registrada' });
        abierto = m;
      } else if (m.Sentido === 'Salida') {
        if (!abierto) { out.push({ ini: null, fin: m, estado: 'Salida sin ingreso registrado' }); return; }
        var dur = new Date(m.FechaHora) - new Date(abierto.FechaHora);
        out.push({ ini: abierto, fin: m, estado: dur > maxH ? 'Revisar: más de ' + Math.round(maxH / 3600000) + ' h' : 'Completo' });
        abierto = null;
      }
    });
    if (abierto) out.push({ ini: abierto, fin: null, estado: ahora - new Date(abierto.FechaHora) > maxH ? 'Sin salida registrada' : 'En planta' });
    return out;
  }

  // ---------- Compendio de horas por persona en un rango de fechas ----------
  // personas: [{ id, Title, NumDoc, Token, Area, Cargo, TipoPersonal }], movs del rango ampliado (un día antes y uno después)
  function compendio(personas, movs, desdeYmd, hastaYmd, ctx, ausencias) {
    var grupos = agrupar(movs), ahora = new Date();
    return personas.map(function (p) {
      var ivs = intervalos(movsDe(grupos, p), ahora).filter(function (iv) {
        var ref = iv.ini || iv.fin, y = U.ymd(ref.FechaHora);
        return y >= desdeYmd && y <= hastaYmd;
      });
      var dias = {}, tot = { total: 0, diurnas: 0, nocturnas: 0, dfDiurnas: 0, dfNocturnas: 0 }, incompletos = 0, tardes = 0;
      ivs.forEach(function (iv) {
        var y = U.ymd((iv.ini || iv.fin).FechaHora);
        var d = dias[y] = dias[y] || { fecha: y, entradas: [], salidas: [], total: 0, diurnas: 0, nocturnas: 0, dfDiurnas: 0, dfNocturnas: 0, estados: [], novedades: [] };
        if (iv.ini) d.entradas.push(iv.ini.FechaHora);
        if (iv.fin) d.salidas.push(iv.fin.FechaHora);
        [iv.ini, iv.fin].forEach(function (m) { if (m && m.Novedad) { d.novedades.push(m.Novedad); if (/tard/i.test(m.Novedad) && m.Sentido === 'Ingreso') tardes++; } });
        if (iv.estado === 'Completo' && iv.ini && iv.fin) {
          var c = clasificar(new Date(iv.ini.FechaHora), new Date(iv.fin.FechaHora));
          Object.keys(c).forEach(function (k) { d[k] += c[k]; tot[k] += c[k]; });
        } else { d.estados.push(iv.estado); if (iv.estado !== 'En planta') incompletos++; }
      });
      // Programado en cada día del rango y ausencias registradas por Talento Humano
      var programadas = 0, diasProg = 0, diasAus = 0, y0 = desdeYmd;
      var aus = (ausencias || []).filter(function (a) { return a.Token === p.Token && a.Estado !== 'Anulada'; });
      while (y0 <= hastaYmd) {
        var t = ctx ? turnoDe(ctx, p.Token, y0) : null;
        if (t && t.e) { programadas += horasTurno(t); diasProg++; if (dias[y0]) dias[y0].turno = t.nombre + ' ' + t.e + '–' + t.s; else if (y0 < U.ymd()) dias[y0] = { fecha: y0, entradas: [], salidas: [], total: 0, diurnas: 0, nocturnas: 0, dfDiurnas: 0, dfNocturnas: 0, estados: ['Programado sin registro de ingreso'], novedades: [], turno: t.nombre + ' ' + t.e + '–' + t.s }; }
        var a = aus.find(function (x) { return U.ymd(x.Desde) <= y0 && U.ymd(x.Hasta) >= y0; });
        if (a) { diasAus++; dias[y0] = dias[y0] || { fecha: y0, entradas: [], salidas: [], total: 0, diurnas: 0, nocturnas: 0, dfDiurnas: 0, dfNocturnas: 0, estados: [], novedades: [] }; dias[y0].ausencia = a.Tipo; }
        y0 = addYmd(y0, 1);
      }
      var lista = Object.keys(dias).sort().map(function (k) { return dias[k]; });
      return { p: p, dias: lista, tot: tot, diasConRegistro: lista.filter(function (d) { return d.entradas.length; }).length, incompletos: incompletos, tardes: tardes,
        programadas: programadas, diasProg: diasProg, diasAus: diasAus };
    });
  }

  // ---------- Estado de cada persona en este momento ----------
  function estadoAhora(p, grupos, ctx, ausencias) {
    var ahora = new Date(), hoy = U.ymd(ahora);
    var ms = movsDe(grupos, p), ult = ms[ms.length - 1] || null;
    var maxH = ((AP.Horario && AP.Horario.cfg().horasMaxSinSalida) || 14) * 3600000;
    var t = turnoDe(ctx, p.Token, hoy), r = rangoTurno(hoy, t);
    var a = (ausencias || []).find(function (x) { return x.Token === p.Token && x.Estado !== 'Anulada' && new Date(x.Desde) <= ahora && ahora <= new Date(x.Hasta); });
    var turnoTxt = t && t.e ? t.nombre + ' ' + t.e + '–' + t.s : t && t.cod === 'D' ? 'Descanso' : '';
    if (ult && ult.Sentido === 'Ingreso' && ahora - new Date(ult.FechaHora) < maxH) {
      return { k: 'dentro', txt: 'En planta desde ' + U.fTime(ult.FechaHora) + (U.ymd(ult.FechaHora) !== hoy ? ' (' + U.fDate(ult.FechaHora) + ')' : ''), kind: 'ok', turno: turnoTxt, nov: ult.Novedad || '' };
    }
    if (a) return { k: 'ausente', txt: (a.Tipo || 'Ausencia') + ' hasta ' + U.fDate(a.Hasta), kind: 'muted', turno: turnoTxt };
    var salioHoy = ult && ult.Sentido === 'Salida' && U.ymd(ult.FechaHora) === hoy;
    if (r) {
      var ant = ((AP.Horario && AP.Horario.cfg().minutosAntelacionTurno) || 30) * 60000;
      // Salió durante o después de su turno de hoy
      if (salioHoy && new Date(ult.FechaHora) >= new Date(r.ini.getTime() - ant)) return { k: 'salio', txt: 'Salió a las ' + U.fTime(ult.FechaHora), kind: 'muted', turno: turnoTxt, nov: ult.Novedad || '' };
      if (ahora < new Date(r.ini.getTime() - ant)) return { k: 'programado', txt: 'Programado desde las ' + t.e, kind: 'brand', turno: turnoTxt };
      if (ahora <= r.fin) return { k: 'falta', txt: 'No ha llegado (turno desde las ' + t.e + ')', kind: 'deny', turno: turnoTxt };
      return { k: 'noasistio', txt: 'Sin ingreso registrado en su turno', kind: 'warn', turno: turnoTxt };
    }
    if (salioHoy) return { k: 'salio', txt: 'Salió a las ' + U.fTime(ult.FechaHora), kind: 'muted', turno: turnoTxt, nov: ult.Novedad || '' };
    if (t && t.cod === 'D') return { k: 'descanso', txt: 'Descanso', kind: 'muted', turno: 'Descanso' };
    return { k: 'sin', txt: 'Sin turno hoy', kind: 'muted', turno: '' };
  }

  AP.Jornada = {
    addYmd: addYmd, dow: dow, lunes: lunes, toMin: toMin, festivos: festivos, festivo: festivo, domOFest: domOFest, pascua: pascua,
    clasificar: clasificar, indexarSemanas: indexarSemanas, turnoDe: turnoDe, rangoTurno: rangoTurno, horasTurno: horasTurno,
    agrupar: agrupar, movsDe: movsDe, intervalos: intervalos, compendio: compendio, estadoAhora: estadoAhora, clave: clave
  };
})();
