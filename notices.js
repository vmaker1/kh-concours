/* 홈페이지 공지사항 양식 — 시스템 조회가 안 될 때를 대비해 기존 방식(게시판 공지)도 같은 데이터로 바로 만듦
 * 75회 실제 공지(조편성 한글 원문, 게시판 1536·1580·1581·1583·1587번 글) 형식을 따름 */
var NT = (function () {
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dt(d) { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function koDate(d) { var x = dt(d); return x ? (x.getMonth() + 1) + '월' + x.getDate() + '일 ' + WD[x.getDay()] + '요일' : d; }
  function koDay(d) { var x = dt(d); return x ? (x.getMonth() + 1) + '월' + x.getDate() + '일' : d; }
  function koDateShort(d) { var x = dt(d); return x ? (x.getMonth() + 1) + '월 ' + x.getDate() + '일(' + WD[x.getDay()] + ')' : d; }
  // '08:30' → '오전 8시30분', '12:30' → '오후 12시30분', '13:00' → '오후 1시'
  function koTime(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return t || '';
    var h = +m[1], mi = +m[2], ap = h < 12 ? '오전' : '오후', hh = h > 12 ? h - 12 : h;
    return ap + ' ' + hh + '시' + (mi ? mi + '분' : '');
  }
  function dateRange(dates) {
    dates = dates.filter(Boolean).sort(); if (!dates.length) return '';
    var a = dt(dates[0]), b = dt(dates[dates.length - 1]);
    if (dates[0] === dates[dates.length - 1]) return koDay(dates[0]);
    if (a.getMonth() === b.getMonth()) return (a.getMonth() + 1) + '월' + a.getDate() + '~' + b.getDate() + '일';
    return koDay(dates[0]) + '~' + koDay(dates[dates.length - 1]);
  }
  function split(gk) { var p = String(gk).split('|'); return { div: p[0], cat: p[1] || '' }; }
  function baseCat(c) { return String(c).replace(/\((남|여)\)$/, ''); }
  function edition(title) { var m = /제\s*\d+\s*회/.exec(title || ''); return m ? m[0].replace(/\s/g, '') : ''; }
  function grade(p) { var g = String(p.grade || ''); return /^\d+$/.test(g) ? g + '학년' : g; }
  function sg(p, sep) { return [p.school, grade(p)].filter(Boolean).join(sep || '/'); }
  function catShort(c) { return c.replace(/\(.*\)/, '').replace(/대학일반부|대학·일반부/, '대학·일반').replace(/등부$|학부$/, '').replace(/부$/, ''); }
  // 동명이인: 출생 연월 + '**' (예: 박민영0802**) — 75회 공지 방식
  function nameMap(list) {
    var c = {}; list.forEach(function (p) { var n = String(p.name).replace(/\d+\**$/, ''); c[n] = (c[n] || 0) + 1; });
    var out = {}; list.forEach(function (p) { var n = String(p.name).replace(/\d+\**$/, ''); out[p.id] = c[n] > 1 ? n + String(p.birth || '').slice(0, 4) + '**' : n; });
    return out;
  }
  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{([^{}]+)\}/g, function (m, k) { return k in vars ? vars[k] : m; });
  }
  function divisionLine(cfg, div) {
    var out = '';
    String(cfg.noticeDivisionLines || '').split('\n').forEach(function (l) { var m = /^\s*([^=]+?)\s*=\s*(.+)$/.exec(l); if (m && m[1] === div) out = m[2]; });
    return out;
  }
  /* 본문 텍스트 → 게시판 붙여넣기용 HTML. '*' 소제목과 [[굵게]] 줄은 굵게 */
  function toHTML(text, tables) {
    return String(text).split('\n').map(function (l) {
      var tm = /^\[\[TABLE:(\d+)\]\]$/.exec(l); if (tm && tables) return tables[+tm[1]];
      if (l === '') return '<p>&nbsp;</p>';
      var b = /^\[\[(.*)\]\]$/.exec(l);
      if (b) return '<p><strong>' + esc(b[1]) + '</strong></p>';
      if (/^\*/.test(l)) return '<p><strong>' + esc(l) + '</strong></p>';
      return '<p>' + esc(l) + '</p>';
    }).join('');
  }
  function plain(text, tablesText) {
    return String(text).split('\n').map(function (l) {
      var tm = /^\[\[TABLE:(\d+)\]\]$/.exec(l); if (tm) return tablesText[+tm[1]];
      var b = /^\[\[(.*)\]\]$/.exec(l); return b ? b[1] : l;
    }).join('\n');
  }
  function make(type, key, title, body, tablesHTML, tablesText) {
    return { type: type, key: key, title: title, text: plain(body, tablesText || []), html: toHTML(body, tablesHTML || []) };
  }

  /* 데이터 묶음: {cfg, participants, sessions, entries, results, plan} */
  function ctx(D) {
    var P = {}; D.participants.forEach(function (p) { P[p.id] = p; });
    var cnt = {}; D.entries.forEach(function (e) { cnt[e.sessionId] = (cnt[e.sessionId] || 0) + 1; });
    var order = {}; (D.groupKeys || []).forEach(function (k, i) { order[k] = i; });
    var ses = D.sessions.slice().sort(function (a, b) { return (a.date + a.startTime) < (b.date + b.startTime) ? -1 : 1; });
    return { D: D, cfg: D.cfg, P: P, cnt: cnt, ses: ses, order: order };
  }
  function r2Date(C, gks) {
    var ds = C.ses.filter(function (s) { return s.round === 'R2' && gks.indexOf(s.groupKey) >= 0; }).map(function (s) { return s.date; });
    if (!ds.length) (C.D.plan || []).forEach(function (d) { if (d.round === 'R2' && String(d.blocks).indexOf(gks[0].split('|')[0]) >= 0) ds.push(d.date); });
    ds = ds.filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
    return ds.length ? ds.map(koDateShort).join(', ') : '추후 공지';
  }

  /* ① 예선 조편성 공지 — 부문·구분별 (성악 남/여는 한 공지에) */
  function prelimGroups(D) {
    var C = ctx(D), cfg = C.cfg, units = {}, uorder = [];
    C.ses.filter(function (s) { return s.round === 'R1'; }).forEach(function (s) {
      var g = split(s.groupKey), u = g.div + '|' + baseCat(g.cat);
      if (!units[u]) { units[u] = []; uorder.push(u); }
      units[u].push(s);
    });
    return uorder.map(function (u) {
      var list = units[u], div = u.split('|')[0], cat = u.split('|')[1];
      var gks = list.map(function (s) { return s.groupKey; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      gks.sort(function (a, b) { return (C.order[a] || 0) - (C.order[b] || 0) || (a < b ? -1 : 1); });
      var people = D.entries.filter(function (e) { return e.round === 'R1' && list.some(function (s) { return s.sessionId === e.sessionId; }); }).map(function (e) { return C.P[e.pid]; }).filter(Boolean);
      var nm = nameMap(people);
      var title = cfg.title + ' 예선 조편성 / ' + div + ' / ' + cat + ' (' + dateRange(list.map(function (s) { return s.date; })) + ')';
      var dl = divisionLine(cfg, div);
      var body = fill(cfg.noticeR1Body, { '대회명': cfg.title, '부문': div, '구분': cat, '부문안내': dl });
      if (!dl) body = body.replace(/\n\n(?=\*본선)/, '\n'); // 부문 안내가 없으면 빈 줄 없애기
      var lines = [];
      gks.forEach(function (gk) {
        var g = split(gk), ss = list.filter(function (s) { return s.groupKey === gk; });
        lines.push(''); lines.push('[[' + div + ' ' + g.cat + ']]');
        var prevDate = '';
        ss.forEach(function (s) {
          if (s.date !== prevDate) { lines.push(koDate(s.date)); lines.push('[[' + g.cat + ']]'); prevDate = s.date; }
          lines.push('[[' + s.label + ' ]]');
          lines.push('연주 순서 추첨 : ' + koTime(s.drawTime) + ', 경연 : ' + koTime(s.startTime));
          D.entries.filter(function (e) { return e.sessionId === s.sessionId; }).sort(function (a, b) { return a.seq - b.seq; })
            .forEach(function (e) { if (C.P[e.pid]) lines.push(nm[e.pid]); });
        });
      });
      return make('r1groups', u, title, body + '\n' + lines.join('\n'));
    });
  }

  /* ② 본선 진출자 공지 — 부문·구분별 */
  function finalists(D) {
    var C = ctx(D), cfg = C.cfg, out = [];
    var keys = Object.keys((D.results || {}).R1 || {}).sort(function (a, b) { return (C.order[a] || 0) - (C.order[b] || 0); });
    keys.forEach(function (gk) {
      var g = split(gk), rows = D.results.R1[gk].rows.filter(function (r) { return r.pass === 'Y'; });
      if (!rows.length) return;
      var ppl = rows.map(function (r) { return C.P[r.pid]; }).filter(Boolean).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ko'); });
      var nm = nameMap(ppl);
      var list = ppl.map(function (p) { return nm[p.id] + ' ' + sg(p); }).join('\n') + '\n(총 ' + ppl.length + '명)';
      var title = cfg.title + ' ' + g.div + ' ' + g.cat + ' 본선 진출자';
      var body = fill(cfg.noticeFinalistBody, { '대회명': cfg.title, '부문': g.div, '구분': g.cat, '명단': list, '본선일자': r2Date(C, [gk]), '문의시작': cfg.noticeInquiryFrom || '(문의 시작일)' });
      out.push(make('finalists', gk, title, body));
    });
    return out;
  }

  /* ③ 본선 안내 — 악기별: 부문|조|소집시간|연주순서 추첨|경연 시작 표 + 부문별 명단 */
  function finalGuide(D) {
    var C = ctx(D), cfg = C.cfg, divs = [], out = [];
    C.ses.filter(function (s) { return s.round === 'R2'; }).forEach(function (s) { var d = split(s.groupKey).div; if (divs.indexOf(d) < 0) divs.push(d); });
    divs.forEach(function (div) {
      var ss = C.ses.filter(function (s) { return s.round === 'R2' && split(s.groupKey).div === div; });
      var gks = ss.map(function (s) { return s.groupKey; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      var cats = gks.map(function (k) { return catShort(split(k).cat); }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      var title = edition(cfg.title) + ' ' + div + '(' + cats.join('⦁') + ') 부문 본선 안내';
      var head = ['부문', '조', '소집시간', '연주순서 추첨', '경연 시작'];
      var trs = ss.map(function (s) { return [split(s.groupKey).cat, s.label, s.drawTime, s.drawTime, s.startTime]; });
      var th = '<table border="1" cellpadding="6" style="border-collapse:collapse"><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        trs.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
      var tt = [head.join(' | ')].concat(trs.map(function (r) { return r.join(' | '); })).join('\n');
      var names = [];
      gks.forEach(function (gk) {
        var ppl = D.entries.filter(function (e) { return e.round === 'R2' && ss.some(function (s) { return s.sessionId === e.sessionId && s.groupKey === gk; }); }).map(function (e) { return C.P[e.pid]; }).filter(Boolean)
          .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ko'); });
        var nm = nameMap(ppl);
        names.push(''); names.push('[[' + split(gk).cat + ']]');
        ppl.forEach(function (p) { names.push(nm[p.id] + ' ' + sg(p)); });
      });
      var body = fill(cfg.noticeFinalGuideBody, { '대회명': cfg.title, '부문': div, '구분': '', '본선일자': r2Date(C, gks), '시간표': '[[TABLE:0]]', '명단': names.join('\n').replace(/^\n/, '') });
      out.push(make('finalguide', div, title, body, [th], [tt]));
    });
    return out;
  }

  /* ④ 입상자 공지 — 악기별: 1위/공동 2위/없음 + 심사위원 전원 합의 메모 */
  function winners(D) {
    var C = ctx(D), cfg = C.cfg, R2 = (D.results || {}).R2 || {}, divs = [], out = [];
    Object.keys(R2).sort(function (a, b) { return (C.order[a] || 0) - (C.order[b] || 0); }).forEach(function (k) { var d = split(k).div; if (divs.indexOf(d) < 0) divs.push(d); });
    divs.forEach(function (div) {
      var lines = [];
      Object.keys(R2).filter(function (k) { return split(k).div === div; }).sort(function (a, b) { return (C.order[a] || 0) - (C.order[b] || 0); }).forEach(function (gk) {
        var g = R2[gk], vacant = [];
        lines.push(''); lines.push('[[' + split(gk).cat.replace('대학일반부', '대학·일반부') + ']]');
        var who = function (r) { var p = C.P[r.pid] || r; return (p.name || '').replace(/\d+\**$/, '') + ' (' + sg(p, ' / ') + ')'; };
        for (var k = 1; k <= (g.awardCount || 3); k++) {
          var w = g.rows.filter(function (r) { return r.award && r.award.replace(/\s/g, '').replace('공동', '') === k + '위'; });
          if (!w.length) { lines.push(k + '위 : 없음'); vacant.push(k); }
          else lines.push((w.length > 1 ? '공동 ' : '') + k + '위 : ' + w.map(who).join(', '));
        }
        g.rows.filter(function (r) { return r.award && !/^(공동\s*)?\d+위$/.test(r.award.trim()); }).forEach(function (r) { lines.push(r.award + ' : ' + who(r)); });
        if (g.awardNote) lines.push(g.awardNote);
        else if (vacant.length && g.rows.some(function (r) { return r.scored; })) lines.push('*심사위원 전원 합의에 따라 ' + vacant.join('위와 ') + '위는 없음');
      });
      var title = cfg.title + ' ' + div + ' 부문 입상자';
      var body = fill(cfg.noticeWinnersBody, { '대회명': cfg.title, '부문': div, '구분': '', '입상자': lines.join('\n').replace(/^\n/, ''), '인터뷰마감': cfg.noticeInterviewDue || '(인터뷰지 마감 일시)' });
      out.push(make('winners', div, title, body));
    });
    return out;
  }

  /* ⑤ 예선 시간표 공지 (공개용 — 인원 없이) */
  function prelimTimetable(D) {
    if (typeof TT === 'undefined') return [];
    var C = ctx(D), list = C.ses.filter(function (s) { return s.round === 'R1'; }).map(function (s) { return Object.assign({}, s, { count: C.cnt[s.sessionId] || 0 }); });
    if (!list.length) return [];
    var days = TT.buildDays(list, D.plan), info = Object.assign({}, D.cfg);
    var body = days.map(function (d) { return TT.dayText(d, info, 'public').split('\n').slice(1).join('\n'); }).join('\n\n');
    return [make('r1table', 'all', D.cfg.title + ' 예선 시간표', body.replace(/^(예선 : .*)$/gm, '[[$1]]'))];
  }

  var TYPES = [
    { id: 'r1groups', name: '예선 조편성', desc: '부문·구분별 — 조, 추첨·경연 시각, 이름(가나다순, 동명이인 출생연월)', fn: prelimGroups },
    { id: 'r1table', name: '예선 시간표', desc: '공개용 — 인원 없이 날짜별', fn: prelimTimetable },
    { id: 'finalists', name: '본선 진출자', desc: '부문·구분별 — 이름 학교/학년, 총 인원, 본선 안내', fn: finalists },
    { id: 'finalguide', name: '본선 안내', desc: '악기별 — 소집·추첨·경연 시작 표와 명단', fn: finalGuide },
    { id: 'winners', name: '입상자', desc: '악기별 — 1위·공동·없음, 심사위원 합의 메모', fn: winners }
  ];
  function docFile(n) {
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' + esc(n.title) + '</title>' +
      '<style>body{font-family:"맑은 고딕","Malgun Gothic",sans-serif;font-size:11pt;line-height:1.6}p{margin:0}table{border-collapse:collapse}td,th{border:1px solid #666;padding:4px 8px}</style></head><body>' +
      '<p><strong>제목 : ' + esc(n.title) + '</strong></p><p>&nbsp;</p>' + n.html + '</body></html>';
  }
  return { TYPES: TYPES, koTime: koTime, koDate: koDate, dateRange: dateRange, nameMap: nameMap, docFile: docFile, toHTML: toHTML };
})();
