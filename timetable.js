/* 시간표 양식 — 75회 '예선시간표(종합)'·'공개용'·'세부일정표'·'전체일정표(달력)' 형식을 그대로 따름
 * 관리자 화면(admin.html)과 참가자 공개 시간표(schedule.html)가 함께 씀 */
var TT = (function () {
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toMin(t) { var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function dt(d) { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function dayTitle(d) { var x = dt(d); return x ? (x.getMonth() + 1) + '월' + x.getDate() + '일 ' + WD[x.getDay()] + '요일' : d; }
  function shortDate(d) { var x = dt(d); return x ? (x.getMonth() + 1) + '.' + x.getDate() + '(' + WD[x.getDay()] + ')' : d; }
  function secText(sec) { sec = Math.round(+sec || 0); var m = Math.floor(sec / 60), r = sec % 60; return m + '분' + (r ? r + '초' : ''); }
  function secShort(sec) { sec = Math.round(+sec || 0); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function split(gk) { var p = String(gk).split('|'); return { div: p[0], cat: p[1] || '' }; }
  function roundName(info, r) { return r === 'R2' ? (info.r2Name || '본선') : (info.r1Name || '예선'); }

  /* 세션 목록 → 날짜별 시간표 (조 사이 30분 이상 빈 첫 구간을 점심시간으로 표시) */
  function buildDays(list, plan) {
    var by = {};
    list.forEach(function (s) { var k = s.round + '|' + s.date; (by[k] = by[k] || { round: s.round, date: s.date, ses: [] }).ses.push(s); });
    return Object.keys(by).sort().map(function (k) {
      var d = by[k];
      d.ses.sort(function (a, b) { return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0; });
      var p = (plan || []).filter(function (x) { return x.round === d.round && x.date === d.date; })[0] || {};
      var rows = [], prevG = null, prevEnd = null, lunchDone = false;
      d.ses.forEach(function (s) {
        if (prevEnd && !lunchDone && toMin(s.startTime) - toMin(prevEnd) >= 30) { rows.push({ type: 'lunch', start: prevEnd, end: s.startTime }); lunchDone = true; }
        if (s.groupKey !== prevG) {
          rows.push({ type: 'group', groupKey: s.groupKey, perSec: s.perSec, total: d.ses.filter(function (x) { return x.groupKey === s.groupKey; }).reduce(function (a, x) { return a + (+x.count || 0); }, 0) });
          prevG = s.groupKey;
        }
        rows.push(Object.assign({ type: 'session' }, s)); prevEnd = s.endTime;
      });
      return { round: d.round, date: d.date, start: d.ses[0].startTime, end: d.ses[d.ses.length - 1].endTime, rows: rows, ses: d.ses, piano: p.piano === 'Y', note: p.note || '', venue: p.venue || d.ses[0].venue || '' };
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.round < b.round ? -1 : 1); });
  }

  /* 계획(KC.planAll 결과) → 세션 목록 모양으로 (편성 전 미리보기용) */
  function sessionsFromPlan(pa, round) {
    var out = [];
    pa.days.forEach(function (r) {
      r.items.forEach(function (x) { if (x.type === 'session') out.push({ round: round, groupKey: x.groupKey, no: String(x.no), label: x.no + '조', date: r.day.date, drawTime: x.draw, startTime: x.start, endTime: x.end, venue: r.day.venue || '', count: x.n, perSec: x.perSec }); });
    });
    return out;
  }

  /* ① 날짜별 시간표 (공개용 public / 내부용 internal) — 하루 한 장
   * 예선: '피아노 / 중등부 / 100명 (3분20초)' 머리 + '중등부 1조 09:30 ~ 10:40 / 20명' — 공개용은 인원 없이(설정 pubCountR1)
   * 본선: 악기 머리('피아노') + 내부용만 '초(7분), 중(8분), 고(20분)' + '초등부 1조 …/ 7명' (한 조뿐이면 '초등부') */
  function dayLines(day, info, mode) {
    var internal = mode === 'internal', r2 = day.round === 'R2';
    var showCount = internal || (r2 ? info.pubCountR2 !== 'N' : info.pubCountR1 === 'Y');
    var L = [{ k: 'title', t: info.title || '' }, { k: 'date', t: roundName(info, day.round) + ' : ' + dayTitle(day.date), sub: '(' + day.start + '~' + day.end + ')' }];
    var prevDiv = null;
    day.rows.forEach(function (r) {
      if (r.type === 'lunch') { L.push({ k: 'lunch', c: ['점심시간', r.start + ' ~ ' + r.end, ''] }); return; }
      if (r.type === 'group') {
        var g = split(r.groupKey);
        if (!r2) { L.push({ k: 'group', t: g.div + ' / ' + g.cat + (showCount ? ' / ' + r.total + '명' : ''), sub: internal && r.perSec ? '(' + secText(r.perSec) + ')' : '' }); return; }
        if (g.div !== prevDiv) {
          prevDiv = g.div;
          L.push({ k: 'group', t: g.div, sub: '' });
          if (internal) {
            var seen = [], parts = [];
            day.ses.forEach(function (s) { var x = split(s.groupKey); if (x.div === g.div && seen.indexOf(x.cat) < 0) { seen.push(x.cat); parts.push(x.cat.replace(/등부|학부|부$/g, '').replace(/일반/, '일반') + '(' + secText(s.perSec) + ')'); } });
            L.push({ k: 'per', t: parts.join(', ') });
          }
        }
        return;
      }
      var gg = split(r.groupKey), multi = day.ses.filter(function (s) { return s.groupKey === r.groupKey; }).length > 1;
      var label = gg.cat + (r2 && !multi ? '' : ' ' + (r.label || r.no + '조'));
      L.push({ k: 'session', c: [label, r.startTime + ' ~ ' + r.endTime, showCount ? '/ ' + r.count + '명' : ''], draw: internal ? '추첨 ' + r.drawTime : '' });
    });
    if (internal) L.push({ k: 'foot', t: [day.venue ? '장소: ' + day.venue : '', day.piano ? '피아노 사용' : '', day.note || ''].filter(Boolean).join(' · ') });
    else L.push({ k: 'foot', t: '※ 각 조 경연 시작 ' + (info.drawLeadMin || 30) + '분 전에 연주 순서를 추첨합니다. 추첨 시각까지 대기실에 도착해 주세요.' });
    return L;
  }
  function dayDoc(day, info, mode) {
    var h = '<section class="ttd pg">';
    dayLines(day, info, mode).forEach(function (l) {
      if (l.k === 'title') h += '<div class="ttd-top">' + esc(l.t) + '</div>';
      else if (l.k === 'date') h += '<div class="ttd-date"><b>' + esc(l.t.split(' : ')[0]) + '</b> : ' + esc(l.t.split(' : ')[1]) + ' <span>' + esc(l.sub) + '</span></div>';
      else if (l.k === 'group') h += '<div class="ttd-g">' + esc(l.t) + (l.sub ? ' <span>' + esc(l.sub) + '</span>' : '') + '</div>';
      else if (l.k === 'per') h += '<div class="ttd-p">' + esc(l.t) + '</div>';
      else if (l.k === 'lunch') h += '<div class="ttd-l"><span>' + esc(l.c[0]) + '</span><span class="tm">' + esc(l.c[1]) + '</span><span></span><span></span></div>';
      else if (l.k === 'session') h += '<div class="ttd-s"><span>' + esc(l.c[0]) + '</span><span class="tm">' + esc(l.c[1]) + '</span><span>' + esc(l.c[2]) + '</span><span class="dr">' + esc(l.draw || '') + '</span></div>';
      else if (l.k === 'foot' && l.t) h += '<div class="ttd-foot">' + esc(l.t) + '</div>';
    });
    return h + '</section>';
  }
  /* 공지 본문용 텍스트 */
  function dayText(day, info, mode) {
    return dayLines(day, info, mode).map(function (l) {
      if (l.k === 'date') return l.t + ' ' + l.sub;
      if (l.k === 'session' || l.k === 'lunch') return l.c.filter(Boolean).join('   ') + (l.draw ? '   (' + l.draw + ')' : '');
      if (l.k === 'group') return '\n' + l.t + (l.sub ? ' ' + l.sub : '');
      return l.t;
    }).join('\n');
  }

  /* ② 세부일정표 (운영진·심사위원용 표) — 엑셀/표 공용 행 */
  function detailRows(days, info) {
    var head = ['일자', '라운드', '부문', '구분', '조', '대기(추첨)', '시작', '종료', '경연시간', '인원', '쉼시간', '배당시간', '인당시간', '비고'];
    var rows = [head];
    days.forEach(function (d) {
      d.ses.forEach(function (s, i) {
        var dur = toMin(s.endTime) - toMin(s.startTime), nx = d.ses[i + 1], rest = nx ? toMin(nx.startTime) - toMin(s.endTime) : '';
        var per = s.count ? Math.round(dur * 60 / s.count) : 0, g = split(s.groupKey), note = [];
        if (i === 0 && toMin(s.drawTime) <= toMin('08:30')) note.push('조출');
        if (nx && rest >= 30) note.push('점심');
        rows.push([shortDate(d.date), roundName(info, d.round), g.div, g.cat, s.label || (s.no + '조'), s.drawTime, s.startTime, s.endTime,
          Math.floor(dur / 60) + ':' + ('0' + dur % 60).slice(-2), +s.count, rest === '' ? '' : Math.floor(rest / 60) + ':' + ('0' + rest % 60).slice(-2),
          s.perSec ? secShort(s.perSec) : '', per ? secShort(per) : '', note.join(', ')]);
      });
    });
    return rows;
  }
  function detailTable(days, info) {
    var rows = detailRows(days, info);
    return '<table class="ttx"><thead><tr>' + rows[0].map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.slice(1).map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i >= 5 && i <= 12 ? ' class="n"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  /* ③ 달력형 — internal: 인원·1인 시간까지 / share(전달용): 부문·오전·오후만 */
  function calendarCells(days, info, mode) {
    var cells = {};
    days.forEach(function (d) {
      var lines = [], divs = [];
      d.ses.forEach(function (s) { var dv = split(s.groupKey).div + '|' + d.round; if (divs.indexOf(dv) < 0) divs.push(dv); });
      divs.forEach(function (dv) {
        var dname = dv.split('|')[0], list = d.ses.filter(function (s) { return split(s.groupKey).div === dname; });
        var tot = list.reduce(function (a, s) { return a + (+s.count || 0); }, 0);
        lines.push({ cls: 'cd', text: dname + '(' + roundName(info, d.round) + ')' + (mode === 'internal' ? ' /' + tot : '') });
        var cats = [];
        list.forEach(function (s) { var c = split(s.groupKey).cat; if (cats.indexOf(c) < 0) cats.push(c); });
        ['오전', '오후'].forEach(function (half) {
          var parts = cats.map(function (c) {
            var ss = list.filter(function (s) { return split(s.groupKey).cat === c && (half === '오전' ? toMin(s.startTime) < 720 : toMin(s.startTime) >= 720); });
            if (!ss.length) return '';
            var n = ss.reduce(function (a, s) { return a + (+s.count || 0); }, 0);
            return c + (mode === 'internal' ? ' /' + n + (ss[0].perSec ? '(' + secShort(ss[0].perSec) + ')' : '') : '');
          }).filter(Boolean);
          if (parts.length) lines.push({ cls: '', text: half + ': ' + parts.join(', ') });
        });
      });
      if (d.piano) lines.push({ cls: 'pn', text: '피아노사용' });
      if (mode === 'internal' && d.note) lines.push({ cls: 'nt', text: d.note });
      var c = cells[d.date] || { time: [], lines: [] };
      c.time.push(d.start + '~' + d.end); c.lines = c.lines.concat(lines);
      cells[d.date] = c;
    });
    return cells;
  }
  function weeks(days) {
    var ds = days.map(function (d) { return d.date; }).sort();
    if (!ds.length) return [];
    var a = dt(ds[0]), b = dt(ds[ds.length - 1]);
    a.setDate(a.getDate() - a.getDay()); b.setDate(b.getDate() + (6 - b.getDay()));
    var out = [], cur = new Date(a), wk = [];
    while (cur <= b) {
      wk.push(cur.getFullYear() + '-' + ('0' + (cur.getMonth() + 1)).slice(-2) + '-' + ('0' + cur.getDate()).slice(-2));
      if (wk.length === 7) { out.push(wk); wk = []; }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }
  function calendar(days, info, mode) {
    var cells = calendarCells(days, info, mode), wks = weeks(days);
    var h = '<div class="ttc"><div class="ttc-t">' + esc(info.title || '') + ' 경연 일정' + (mode === 'share' ? '' : ' <span>(내부용)</span>') + '</div><table><thead><tr>' +
      WD.map(function (w, i) { return '<th class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '요일</th>'; }).join('') + '</tr></thead><tbody>';
    wks.forEach(function (wk) {
      h += '<tr>' + wk.map(function (d, i) {
        var c = cells[d], x = dt(d);
        return '<td class="' + (c ? 'on' : '') + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '"><div class="dn">' + (x.getDate() === 1 ? (x.getMonth() + 1) + '/' : '') + x.getDate() + '</div>' +
          (c ? (mode === 'internal' ? '<div class="tm">(' + esc(c.time.join(', ')) + ')</div>' : '') + c.lines.map(function (l) { return '<div class="' + l.cls + '">' + esc(l.text) + '</div>'; }).join('') : '') + '</td>';
      }).join('') + '</tr>';
    });
    h += '</tbody></table>' + (info.calendarNote ? '<div class="ttc-n">' + esc(info.calendarNote).replace(/\n/g, '<br>') + '</div>' : '') + '</div>';
    return h;
  }
  function calendarAOA(days, info, mode) {
    var cells = calendarCells(days, info, mode), rows = [[info.title + ' 경연 일정' + (mode === 'share' ? '' : ' (내부용)')], WD.map(function (w) { return w + '요일'; })];
    weeks(days).forEach(function (wk) {
      rows.push(wk.map(function (d) { return dt(d).getDate(); }));
      var maxL = Math.max.apply(null, wk.map(function (d) { var c = cells[d]; return c ? c.lines.length + (mode === 'internal' ? 1 : 0) : 0; }).concat([1]));
      for (var i = 0; i < maxL; i++) rows.push(wk.map(function (d) {
        var c = cells[d]; if (!c) return '';
        var ls = (mode === 'internal' ? ['(' + c.time.join(', ') + ')'] : []).concat(c.lines.map(function (l) { return l.text; }));
        return ls[i] || '';
      }));
    });
    if (info.calendarNote) { rows.push([]); String(info.calendarNote).split('\n').forEach(function (l) { rows.push([l]); }); }
    return rows;
  }
  /* 날짜별 시간표를 엑셀 한 시트에 줄 단위로 */
  function docAOA(days, info, mode) {
    var rows = [];
    days.forEach(function (d) {
      dayLines(d, info, mode).forEach(function (l) {
        if (l.k === 'session' || l.k === 'lunch') rows.push(l.c.concat(l.draw ? [l.draw] : []));
        else if (l.k === 'date') rows.push([l.t + ' ' + l.sub]);
        else if (l.k === 'group') { rows.push([]); rows.push([l.t + (l.sub ? ' ' + l.sub : '')]); }
        else rows.push([l.t]);
      });
      rows.push([]); rows.push([]);
    });
    return rows;
  }
  var CSS = '.ttd{font-size:15px;line-height:1.75;padding:18px 0;border-bottom:1px dashed var(--line,#ccc)}.ttd-top{font-weight:700;font-size:17px}.ttd-date{margin:4px 0 10px}.ttd-date span{color:var(--sub,#555)}' +
    '.ttd-p{color:var(--sub,#555);font-size:14px}.ttd-g{font-weight:800;margin-top:10px}.ttd-g span{font-weight:600;color:var(--sub,#555)}.ttd-s,.ttd-l{display:grid;grid-template-columns:9.5em 9em 4.5em auto;gap:6px;font-variant-numeric:tabular-nums}.ttd-l{color:var(--accent,#8a1c3c);font-weight:700;margin:6px 0}.ttd-s .dr{color:var(--sub,#666);font-size:13px}.ttd-foot{margin-top:12px;font-size:13px;color:var(--sub,#555)}' +
    '.ttx th,.ttx td{white-space:nowrap}.ttc table{table-layout:fixed;width:100%;border-collapse:collapse}.ttc th,.ttc td{border:1px solid #999;vertical-align:top;padding:4px 5px;font-size:12px;line-height:1.45;position:static;background:#fff;color:#000}.ttc th{background:#eee;text-align:center}' +
    '.ttc td{height:92px}.ttc td .dn{font-weight:700}.ttc td.on{background:#fbf3f6}.ttc .sun .dn,.ttc th.sun{color:#c00}.ttc .sat .dn,.ttc th.sat{color:#1a4fb4}.ttc .tm{font-size:11px;color:#444}.ttc .cd{font-weight:700}.ttc .pn{color:#8a1c3c;font-size:11px}.ttc .nt{color:#555;font-size:11px}' +
    '.ttc-t{font-weight:800;font-size:18px;margin-bottom:8px}.ttc-t span{font-weight:500;font-size:13px;color:#666}.ttc-n{margin-top:8px;font-size:12px;color:#333}' +
    '@media(max-width:600px){.ttd-s,.ttd-l{grid-template-columns:auto 7.6em 3.4em;font-size:14px;gap:8px}.ttd-s span:first-child,.ttd-l span:first-child{white-space:nowrap}.ttd-s .dr{grid-column:1/-1;margin-top:-4px}}' +
    '@media print{.ttd{border:0;page-break-after:always;break-after:page;font-size:13pt}.ttd:last-child{page-break-after:auto}}';
  return { buildDays: buildDays, sessionsFromPlan: sessionsFromPlan, dayDoc: dayDoc, dayText: dayText, dayLines: dayLines, roundName: roundName, split: split, detailRows: detailRows, detailTable: detailTable, calendar: calendar, calendarAOA: calendarAOA, docAOA: docAOA, CSS: CSS, dayTitle: dayTitle, shortDate: shortDate, secText: secText, secShort: secShort };
})();
