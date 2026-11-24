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

  /* 세션 목록 → 날짜별 시간표
   *  점심: 30분 이상 빈 구간 가운데 12:30에 가장 가까운 것 (앞뒤로 부문이 바뀌면 '중간채점')
   *  쉬는 시간: 그 밖에 breakMin(15)분 이상 빈 구간 */
  function buildDays(list, plan, opt) {
    var brk = +((opt || {}).breakMin) || 15;
    var by = {};
    list.forEach(function (s) { var k = s.round + '|' + s.date; (by[k] = by[k] || { round: s.round, date: s.date, ses: [] }).ses.push(s); });
    return Object.keys(by).sort().map(function (k) {
      var d = by[k];
      d.ses.sort(function (a, b) { return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0; });
      var p = (plan || []).filter(function (x) { return x.round === d.round && x.date === d.date; })[0] || {};
      var rows = [], prevG = null, prevEnd = null, lunchI = -1, best = 1e9;
      d.ses.forEach(function (s, i) {
        if (!i) return; var a = d.ses[i - 1], g = toMin(s.startTime) - toMin(a.endTime);
        if (g >= 30) { var dist = Math.abs((toMin(a.endTime) + toMin(s.startTime)) / 2 - 750); if (dist < best) { best = dist; lunchI = i; } }
      });
      d.ses.forEach(function (s, i) {
        var g = i ? toMin(s.startTime) - toMin(prevEnd) : 0;
        if (i === lunchI) rows.push({ type: 'lunch', start: prevEnd, end: s.startTime, note: split(d.ses[i - 1].groupKey).div !== split(s.groupKey).div ? '중간채점' : '' });
        else if (i && g >= brk) rows.push({ type: 'break', start: prevEnd, end: s.startTime });
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
      if (r.type === 'lunch') { L.push({ k: 'lunch', c: ['점심시간', r.start + ' ~ ' + r.end, internal && r.note ? '(' + r.note + ')' : ''] }); return; }
      if (r.type === 'break') { L.push({ k: 'lunch', c: ['쉬는 시간', r.start + ' ~ ' + r.end, ''] }); return; }
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
  var CSS = '.ttw{background:#fff;color:#000;padding:16px 22px;margin:0 0 12px;border:1px solid #ddd;font-size:17px;line-height:1.5}.ttw .bm{font-size:11px;color:#888}.ttw .t{font-size:22px;font-weight:800}.ttw .d{font-size:17px}.ttw .g{font-size:19px;font-weight:800}.ttw .p{font-size:14px;color:#333}.ttw .gp{height:10px}.ttw .s{display:grid;grid-template-columns:12em 9em 5em;font-variant-numeric:tabular-nums}.ttw .s.l{font-weight:800}' +
    '@media print{.ttw{border:0;margin:0;padding:0;font-size:20pt}.ttw .t{font-size:26pt}.ttw .d{font-size:20pt}.ttw .g{font-size:23pt}.ttw .p{font-size:16pt}.ttw .gp{height:6mm}.ttw .bm{font-size:9pt}}' +
    '.ttd{font-size:15px;line-height:1.75;padding:18px 0;border-bottom:1px dashed var(--line,#ccc)}.ttd-top{font-weight:700;font-size:17px}.ttd-date{margin:4px 0 10px}.ttd-date span{color:var(--sub,#555)}' +
    '.ttd-p{color:var(--sub,#555);font-size:14px}.ttd-g{font-weight:800;margin-top:10px}.ttd-g span{font-weight:600;color:var(--sub,#555)}.ttd-s,.ttd-l{display:grid;grid-template-columns:9.5em 9em 4.5em auto;gap:6px;font-variant-numeric:tabular-nums}.ttd-l{color:var(--accent,#8a1c3c);font-weight:700;margin:6px 0}.ttd-s .dr{color:var(--sub,#666);font-size:13px}.ttd-foot{margin-top:12px;font-size:13px;color:var(--sub,#555)}' +
    '.ttx th,.ttx td{white-space:nowrap}.ttc table{table-layout:fixed;width:100%;border-collapse:collapse}.ttc th,.ttc td{border:1px solid #999;vertical-align:top;padding:4px 5px;font-size:12px;line-height:1.45;position:static;background:#fff;color:#000}.ttc th{background:#eee;text-align:center}' +
    '.ttc td{height:92px}.ttc td .dn{font-weight:700}.ttc td.on{background:#fbf3f6}.ttc .sun .dn,.ttc th.sun{color:#c00}.ttc .sat .dn,.ttc th.sat{color:#1a4fb4}.ttc .tm{font-size:11px;color:#444}.ttc .cd{font-weight:700}.ttc .pn{color:#8a1c3c;font-size:11px}.ttc .nt{color:#555;font-size:11px}' +
    '.ttc-t{font-weight:800;font-size:22px;margin-bottom:10px;text-align:center}.ttc-t span{font-weight:500;font-size:14px;color:#666}.ttc-n{margin-top:8px;font-size:12px;color:#333}' +
    '@media(max-width:600px){.ttd-s,.ttd-l{grid-template-columns:auto 7.6em 3.4em;font-size:14px;gap:8px}.ttd-s span:first-child,.ttd-l span:first-child{white-space:nowrap}.ttd-s .dr{grid-column:1/-1;margin-top:-4px}}' +
    '@media print{.ttd{border:0;page-break-after:always;break-after:page;font-size:13pt}.ttd:last-child{page-break-after:auto}}';
  /* ③ 벽보용 (75회 '예선시간표(종합)'·'본선시간표(종합)' 구글 문서 그대로) — 한 장 = 하루(예선) 또는 하루의 한 부문(본선)
   *  예선: 제75회 이화경향음악콩쿠르 / 예선 : 3월25일 수요일 (09:30~16:50) / 피아노 / 중등부 / 100명 (3분20초) / 중등부 1조 09:30 ~ 10:40 / 20명 …
   *        작은 부문은 한 머리로: 클라리넷 / 초(14)중(17)고등부(29) / 60명 (3분)
   *  본선: 제75회 … / 피아노 / 본선 : 4월9일 목요일 (10:00~16:20) / 초(7분), 중(8분), 고(20분) / 초등부 1조 10:00 ~ 10:50 / 7명 …
   *  opt.split: 예선에 부문이 둘 이상인 날은 부문별 장도 함께 (방 문 앞에 붙일 것) */
  function catShort(c) { return String(c).replace(/\((남|여)\)/, '').replace(/등부|학부/, '').replace(/^대학일반부?$|^대학·일반부?$/, '대학·일반').replace(/부$/, ''); }
  function bookmark(d, divs) { var x = dt(d.date); return (x ? (x.getMonth() + 1) + '.' + x.getDate() : d.date) + '.' + divs.map(function (v) { return v.div + (v.cats.length && d.round !== 'R2' ? '.' + v.cats.map(catShort).filter(function (c, i, a) { return a.indexOf(c) === i; }).join('_') : ''); }).join('_'); }
  function wallPages(days, info, opt) {
    opt = opt || {};
    var title = info.title || '', pages = [];
    days.forEach(function (day) {
      var r2 = day.round === 'R2', divs = [];
      day.ses.forEach(function (s) { var g = split(s.groupKey), v = divs.filter(function (x) { return x.div === g.div; })[0]; if (!v) { v = { div: g.div, cats: [], keys: [] }; divs.push(v); } if (v.keys.indexOf(s.groupKey) < 0) { v.keys.push(s.groupKey); v.cats.push(g.cat); } });
      var lunch = day.rows.filter(function (r) { return r.type === 'lunch'; })[0], rests = day.rows.filter(function (r) { return r.type === 'break'; });
      function sesLine(s) {
        var g = split(s.groupKey), multi = day.ses.filter(function (x) { return x.groupKey === s.groupKey; }).length > 1;
        return { k: 'session', c: [g.cat + (r2 && !multi ? '' : ' ' + (s.label || s.no + '조')), s.startTime + ' ~ ' + s.endTime] };
      }
      function groupHead(v, ses) {   // 예선: 부문 머리 (작은 구분은 한 머리로 묶음)
        var tot = {}, per = {}; ses.forEach(function (s) { tot[s.groupKey] = (tot[s.groupKey] || 0) + (+s.count || 0); per[s.groupKey] = per[s.groupKey] || s.perSec; });
        var ks = Object.keys(tot), all = ks.reduce(function (a, k) { return a + tot[k]; }, 0);
        var pers = ks.map(function (k) { return per[k]; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        var ps = pers.length === 1 ? ' (' + secText(pers[0]) + ')' : '';
        if (ks.length > 1 && ks.every(function (k) { return tot[k] <= (+opt.mergeMax || 30); }))
          var sh = ks.map(function (k) { return catShort(split(k).cat); }), dup = sh.some(function (x, i) { return sh.indexOf(x) !== i; });
          return [{ k: 'group', t: v.div + ' / ' + ks.map(function (k, i) { var c = split(k).cat; return dup || i === ks.length - 1 ? c : catShort(c); }).join('·') }];
        return null;
      }
      function body(sel) {   // sel: 이 장에 넣을 세션
        var L = [], prev = null, shownLunch = false, merged = {};
        var first = sel[0], last = sel[sel.length - 1];
        sel.forEach(function (s, i) {
          var g = split(s.groupKey);
          if (lunch && !shownLunch && s.startTime >= lunch.end && (i > 0 || sel.length < day.ses.length)) { if (L.length) L.push({ k: 'gap' }); L.push({ k: 'lunch', c: ['점심시간', lunch.start + ' ~ ' + lunch.end] }); L.push({ k: 'gap' }); shownLunch = true; }
          if (!r2 && s.groupKey !== prev) {
            var v = divs.filter(function (x) { return x.div === g.div; })[0], same = sel.filter(function (x) { return split(x.groupKey).div === g.div; });
            if (merged[g.div] == null) merged[g.div] = groupHead(v, same) || false;
            if (merged[g.div] === false) {
              var gs = sel.filter(function (x) { return x.groupKey === s.groupKey; });
              if (L.length && L[L.length - 1].k !== 'gap') L.push({ k: 'gap' });
              L.push({ k: 'group', t: g.div + ' / ' + g.cat }); L.push({ k: 'gap' });
            } else if (merged[g.div] !== true) { if (L.length && L[L.length - 1].k !== 'gap') L.push({ k: 'gap' }); L.push(merged[g.div][0]); L.push({ k: 'gap' }); merged[g.div] = true; }
          }
          var rb = i > 0 && rests.filter(function (r) { return r.end === s.startTime && r.start === sel[i - 1].endTime; })[0];
          if (rb) { var last = L.pop(); if (last.k === 'gap') { L.push({ k: 'lunch', c: ['쉬는 시간', rb.start + ' ~ ' + rb.end] }); L.push(last); } else { L.push(last); L.push({ k: 'lunch', c: ['쉬는 시간', rb.start + ' ~ ' + rb.end] }); } }
          L.push(sesLine(s)); prev = s.groupKey;
        });
        return { lines: L, start: first.startTime, end: last.endTime };
      }
      function head(d0, b, divLabel) {
        var date = { k: 'date', t: roundName(info, day.round) + ' : ' + dayTitle(day.date), sub: '(' + b.start + '~' + b.end + ')' };
        if (!r2) return [{ k: 'title', t: title }, date, { k: 'gap' }];
        return [{ k: 'title', t: title }, date, { k: 'gap' }, { k: 'group', t: divLabel }, { k: 'gap' }];
      }
      if (r2) {
        divs.forEach(function (v) { var b = body(day.ses.filter(function (s) { return split(s.groupKey).div === v.div; })); pages.push({ bookmark: bookmark(day, [v]).replace('.', ' ').replace(/^(\d+) (\d+)\./, '$1.$2 '), lines: head(day, b, v.div).concat(b.lines) }); });
        return;
      }
      var all = body(day.ses);
      pages.push({ bookmark: bookmark(day, divs), lines: head(day, all).concat(all.lines) });
      if (opt.split !== false && divs.length > 1) divs.forEach(function (v) {
        var b = body(day.ses.filter(function (s) { return split(s.groupKey).div === v.div; }));
        pages.push({ bookmark: bookmark(day, [v]), lines: head(day, b).concat(b.lines), part: true });
      });
    });
    return pages;
  }
  /* ④ 인쇄용 시간표 (A4 세로) — 공개용(public)·운영용(ops) 모두 인원·1인 시간까지, 운영용은 추첨 시각·장소·메모도
   *  한 장 = 하루. 줄: title · date · group · per · session/lunch(c: 칸) · gap · foot */
  function printLines(day, info, ops) {
    var r2 = day.round === 'R2', prevDiv = null;
    var L = [{ k: 'title', t: info.title || '' }, { k: 'date', t: roundName(info, day.round) + ' : ' + dayTitle(day.date), sub: '(' + day.start + '~' + day.end + ')' }, { k: 'gap' }];
    day.rows.forEach(function (r) {
      if (r.type === 'lunch') { L.push({ k: 'lunch', c: ['점심시간', r.start + ' ~ ' + r.end, '', ops && r.note ? '(' + r.note + ')' : ''] }); return; }
      if (r.type === 'break') { L.push({ k: 'lunch', c: ['쉬는 시간', r.start + ' ~ ' + r.end, '', ''] }); return; }
      if (r.type === 'group') {
        var g = split(r.groupKey);
        if (!r2) { if (L[L.length - 1].k !== 'gap') L.push({ k: 'gap' }); L.push({ k: 'group', t: g.div + ' / ' + g.cat + ' / ' + r.total + '명' + (r.perSec ? ' (' + secText(r.perSec) + ')' : '') }); return; }
        if (g.div !== prevDiv) {
          prevDiv = g.div; if (L[L.length - 1].k !== 'gap') L.push({ k: 'gap' });
          var seen = [], parts = [], tot = 0;
          day.ses.forEach(function (s) { var x = split(s.groupKey); if (x.div !== g.div) return; tot += +s.count || 0; if (seen.indexOf(x.cat) < 0) { seen.push(x.cat); parts.push(catShort(x.cat) + '(' + secText(s.perSec) + ')'); } });
          L.push({ k: 'group', t: g.div + ' / ' + tot + '명' }); L.push({ k: 'per', t: parts.join(', ') });
        }
        return;
      }
      var gg = split(r.groupKey), multi = day.ses.filter(function (s) { return s.groupKey === r.groupKey; }).length > 1;
      L.push({ k: 'session', c: [gg.cat + (r2 && !multi ? '' : ' ' + (r.label || r.no + '조')), r.startTime + ' ~ ' + r.endTime, (+r.count || 0) + '명', ops ? '추첨 ' + r.drawTime : ''] });
    });
    var foot = ops ? [day.venue ? '장소: ' + day.venue : '', day.piano ? '피아노 사용' : '', day.note || ''].filter(Boolean).join(' · ') : '※ 각 조 경연 시작 ' + (info.drawLeadMin || 30) + '분 전에 연주 순서를 추첨합니다. 추첨 시각까지 대기실에 도착해 주세요.';
    if (foot) { L.push({ k: 'gap' }); L.push({ k: 'foot', t: foot }); }
    if (!ops) L.forEach(function (l) { if (l.c) l.c.pop(); });   // 공개용은 추첨 칸 없이
    return L;
  }
  /* 쪽 채우기: 줄 수와 글자 폭으로 글씨 크기를 정해 한 장을 알맞게 채움(여백 2cm). 제목·날짜는 크게, 모두 가운데 정렬
   *  결과(pt): { size, row, title, date, group, per, foot, bm, gap, lh(줄 높이 배수), after(줄 뒤 간격 배수), cols(칸별 글자 폭 em), align } */
  var PAPER = { A4: { w: 210, h: 297, lo: 11, hi: 22 }, A3: { w: 297, h: 420, lo: 18, hi: 44 } }, MARGIN_MM = 20;
  var KS = { title: 1.8, date: 1.42, group: 1.16, per: 0.9, row: 1, foot: 0.74 }, LH = 1.32, AFTER = 0.2, GAPK = 0.55, BM = 9;
  function emOf(t) { var e = 0; String(t == null ? '' : t).split('').forEach(function (ch) { e += /[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch) ? 1 : ch === ' ' ? 0.32 : /[0-9]/.test(ch) ? 0.56 : 0.6; }); return e; }
  function fitPage(pg) {
    var P = PAPER[pg.size] || PAPER.A4, W = (P.w - 2 * MARGIN_MM) * 72 / 25.4, H = (P.h - 2 * MARGIN_MM) * 72 / 25.4 - BM * (LH + AFTER);
    var sumK = 0, gaps = 0, cols = [], rw = [];
    (pg.lines || []).forEach(function (l) {
      if (l.k === 'gap') { gaps++; return; }
      if (l.c) { sumK += KS.row; l.c.forEach(function (c, i) { cols[i] = Math.max(cols[i] || 0, emOf(c)); }); return; }
      var k = KS[l.k] || 1, txt = (l.t || '') + (l.sub ? ' ' + l.sub : '');
      sumK += l.k === 'foot' ? k * Math.max(1, Math.ceil(emOf(txt) * k * P.lo / W)) : k;
    });
    cols = cols.map(function (c) { return c ? c + 1.6 : 0; });          // 칸 사이 여백
    var colEm = cols.reduce(function (a, b) { return a + b; }, 0) || 1;
    var rH = H * 0.9 / ((LH + AFTER) * sumK + GAPK * gaps), rW = W * 0.97 / colEm;
    var r = Math.max(P.lo, Math.min(P.hi, rH, rW)); r = Math.floor(r * 2) / 2;
    // 글씨가 최대 크기에 닿아도 아래가 많이 남으면 줄 간격·빈 줄을 늘려 쪽을 고르게 채움 (줄 간격은 최대 2.3배까지)
    var lh = LH, gk = GAPK, used = r * ((LH + AFTER) * sumK + GAPK * gaps);
    if (used < H * 0.85 && sumK) {
      var extra = (H * 0.88 - used) / r, lines = sumK + gaps * 1.5;
      var dl = Math.min(2.3 - LH, extra / lines); lh = LH + dl; gk = GAPK + dl * 1.5;
    }
    var f = { size: pg.size || 'A4', row: r, bm: BM, gap: Math.round(gk * r * 10) / 10, lh: Math.round(lh * 100) / 100, after: AFTER, cols: cols, align: cols.map(function (c, i) { return i === 0 ? 'left' : 'center'; }), width: Math.round(W) };
    Object.keys(KS).forEach(function (k) { if (k !== 'row') f[k] = Math.round(KS[k] * r * 2) / 2; });
    // 제목·날짜가 폭을 넘으면 줄여 한 줄에
    (pg.lines || []).forEach(function (l) { if (l.k === 'title' || l.k === 'date' || l.k === 'group') { var txt = (l.t || '') + (l.sub ? ' ' + l.sub : ''), mx = Math.floor(W * 0.97 / (emOf(txt) || 1) * 2) / 2; if (f[l.k] > mx) f[l.k] = Math.max(mx, r); } });
    return f;
  }
  /* 인쇄용 장 목록 — mode: 'wall'(벽보, A3 세로, 시각만) · 'public' · 'ops' (A4 세로) */
  function printPages(days, info, mode, opt) {
    var pages = mode === 'wall'
      ? wallPages(days, info, opt).map(function (p) { return { bookmark: p.bookmark, lines: p.lines, size: 'A3' }; })
      : days.map(function (d) { return { bookmark: shortDate(d.date) + ' ' + roundName(info, d.round), lines: printLines(d, info, mode === 'ops'), size: 'A4' }; });
    pages.forEach(function (p) { p.fit = fitPage(p); });
    return pages;
  }
  /* 인쇄용 장 → HTML (인쇄·미리보기 공용, 글씨는 pt 그대로). opt.preview면 쪽 모양 상자로 줄여 보여 줌 */
  function pagesHTML(pages, opt) {
    opt = opt || {};
    var size = (pages[0] && pages[0].size) || 'A4', P = PAPER[size];
    var h = '<style>' + (opt.preview ? '' : '@media print{@page{size:' + size + ' portrait;margin:' + MARGIN_MM + 'mm}}') +
      '.ttp{font-family:"Nanum Gothic","Pretendard","Malgun Gothic",sans-serif;color:#000;background:#fff;box-sizing:border-box;text-align:center}' +
      '.ttp p{margin:0}.ttp .bm{text-align:left;color:#888}.ttp table{margin:0 auto;width:auto;border-collapse:collapse;font-variant-numeric:tabular-nums;background:none}.ttp td{padding:0;white-space:nowrap;border:0!important;background:none!important;vertical-align:middle}.ttp tr.l td{font-weight:800}' +
      '.ttp.pv{width:' + P.w + 'mm;min-height:' + P.h + 'mm;padding:' + MARGIN_MM + 'mm;margin:0 auto 14px;box-shadow:0 1px 8px rgba(0,0,0,.25);zoom:' + (opt.zoom || (size === 'A3' ? 0.3 : 0.45)) + '}' +
      '@media print{.ttp{break-after:page;page-break-after:always}.ttp:last-child{break-after:auto;page-break-after:auto}}</style>';
    return h + pages.map(function (pg) {
      var f = pg.fit || fitPage(pg), out = '', buf = [];
      var lp = function (sz) { return 'font-size:' + sz + 'pt;line-height:' + (sz * f.lh).toFixed(1) + 'pt;margin-bottom:' + (sz * f.after).toFixed(1) + 'pt'; };
      var flush = function () {
        if (!buf.length) return;
        out += '<table><colgroup>' + buf[0].c.map(function (c, i) { return '<col style="width:' + ((f.cols[i] || 6) * f.row).toFixed(1) + 'pt">'; }).join('') + '</colgroup>' + buf.map(function (l) { return '<tr' + (l.k === 'lunch' ? ' class="l"' : '') + '>' + l.c.map(function (c, i) { return '<td style="text-align:' + (f.align[i] || 'left') + ';' + lp(f.row) + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
        buf = [];
      };
      pg.lines.forEach(function (l) {
        if (l.c) { buf.push(l); return; }
        flush();
        if (l.k === 'gap') out += '<div style="height:' + f.gap + 'pt"></div>';
        else if (l.k === 'title') out += '<p style="' + lp(f.title) + ';font-weight:800">' + esc(l.t) + '</p>';
        else if (l.k === 'date') out += '<p style="' + lp(f.date) + ';font-weight:700">' + esc(l.t) + (l.sub ? ' <span style="font-weight:500">' + esc(l.sub) + '</span>' : '') + '</p>';
        else if (l.k === 'group') out += '<p style="' + lp(f.group) + ';font-weight:800">' + esc(l.t) + '</p>';
        else if (l.k === 'per') out += '<p style="' + lp(f.per) + ';color:#333">' + esc(l.t) + '</p>';
        else if (l.k === 'foot') out += '<p style="' + lp(f.foot) + ';color:#333">' + esc(l.t) + '</p>';
      });
      flush();
      return '<section class="ttp' + (opt.preview ? ' pv' : '') + '"><p class="bm" style="' + lp(f.bm) + '">' + esc(pg.bookmark || '') + '</p>' + out + '</section>';
    }).join('');
  }
  function wallHTML(pages) {
    return pages.map(function (p) {
      return '<section class="ttw pg"><div class="bm">' + esc(p.bookmark) + '</div>' + p.lines.map(function (l) {
        if (l.k === 'gap') return '<div class="gp"></div>';
        if (l.k === 'title') return '<div class="t">' + esc(l.t) + '</div>';
        if (l.k === 'date') return '<div class="d">' + esc(l.t) + '</div>';
        if (l.k === 'group') return '<div class="g">' + esc(l.t) + '</div>';
        if (l.k === 'per') return '<div class="p">' + esc(l.t) + '</div>';
        return '<div class="s' + (l.k === 'lunch' ? ' l' : '') + '"><span>' + esc(l.c[0]) + '</span><span>' + esc(l.c[1]) + '</span><span>' + esc(l.c[2]) + '</span></div>';
      }).join('') + '</section>';
    }).join('');
  }

  return { wallPages: wallPages, wallHTML: wallHTML, printLines: printLines, printPages: printPages, pagesHTML: pagesHTML, fitPage: fitPage, emOf: emOf, buildDays: buildDays, sessionsFromPlan: sessionsFromPlan, dayDoc: dayDoc, dayText: dayText, dayLines: dayLines, roundName: roundName, split: split, detailRows: detailRows, detailTable: detailTable, calendar: calendar, calendarAOA: calendarAOA, docAOA: docAOA, CSS: CSS, dayTitle: dayTitle, shortDate: shortDate, secText: secText, secShort: secShort };
})();
if (typeof module !== 'undefined') module.exports = TT;
