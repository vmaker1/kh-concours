/* 심사위원 명단 엑셀 읽기 — 「2026년_75회_심사위원명단」 양식 그대로
 *
 *  1) 부문 탭 (피아노·바이올린·…)
 *       예선 : 3월25일 / 수요일 오전 9시 도착 / 중등부
 *       순번 | 이름 | 나이 | 소속 | 전화번호 | 비고
 *     → 라운드·날짜·도착시간·담당 구분(초·중·고등부)·순번(좌석)
 *  2) 정리 탭: 번호 | 부문 | 구분(예선/본선) | 구분2(종일/반나절) | 요일 | 일자 | 시간 | 이름 | … | 심사비   (한 줄 = 하루)
 *     → 종일/반나절, 그날 심사비
 *  3) 심사비 탭: 평일/주말 × 예선(종일)·예선(반나절)·본선(종일)·본선(반나절) → 단가표
 *
 *  부문 탭이 있으면 그걸 기본으로 쓰고, 정리 탭에서 종일/반나절·심사비를 덧붙입니다.
 *  부문 탭 없이 정리 탭만 있으면 부문 전체를 맡은 것으로 넣습니다.
 *  표 오른쪽에 메모처럼 적어 둔 칸(다른 명단·계산)은 읽지 않습니다.
 *  나이(출생연도)는 쓰지 않습니다 — 주민번호는 본인이 직접 입력하는 화면에서만 받음. */
var JL = (function () {
  function s(v) { return v == null ? '' : String(v).trim(); }
  function clean(v) { return s(v).replace(/\s+/g, ''); }
  function pad(n) { return ('0' + n).slice(-2); }
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function parseDate(v, year) {
    v = s(v); var m;
    if (/^\d{5}(\.\d+)?$/.test(v) && +v > 30000 && +v < 70000) { var t = new Date(Date.UTC(1899, 11, 30) + Math.floor(+v) * 864e5); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); } // 엑셀 날짜 일련번호
    if ((m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(v))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    if ((m = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(v))) return year + '-' + pad(m[1]) + '-' + pad(m[2]);
    if ((m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(v))) { var y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : year; return y + '-' + pad(m[1]) + '-' + pad(m[2]); }
    return '';
  }
  function parseTime(v) {
    v = s(v); if (!v) return '';
    var pm = /오후|PM|pm/.test(v), am = /오전|AM|am/.test(v), m, h;
    if ((m = /(\d{1,2})\s*:\s*(\d{2})/.exec(v))) { h = +m[1]; if (pm && h < 12) h += 12; if (am && h === 12) h = 0; if (!am && !pm && h < 7) h += 12; return pad(h) + ':' + m[2]; }
    if ((m = /(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/.exec(v))) { h = +m[1]; if (pm && h < 12) h += 12; if (!am && !pm && h < 7) h += 12; return pad(h) + ':' + (m[2] ? pad(m[2]) : m[3] ? '30' : '00'); }
    if (/^0?\.\d+$/.test(v)) { var mins = Math.round(+v * 1440); return pad(Math.floor(mins / 60)) + ':' + pad(mins % 60); }
    return '';
  }
  function money(v) { var d = s(v).replace(/[^\d]/g, ''); return d ? +d : ''; }
  // '초·중·고등부' → 초등부·중등부·고등부, '고등부 남·여' → 고등부(남·여 모두), '고등부 남' → 고등부(남)
  function parseTargets(t) {
    t = clean(t).replace(/[(（][^)）]*[)）]/g, '');
    if (!t || /요일/.test(t)) return [];
    var g = '';
    if (/남[·ㆍ・,.]?여|남녀/.test(t)) t = t.replace(/남[·ㆍ・,.]?여|남녀/, '');
    else if (/부남$/.test(t)) { g = '(남)'; t = t.replace(/남$/, ''); }
    else if (/부여$/.test(t)) { g = '(여)'; t = t.replace(/여$/, ''); }
    var m = /^((?:초|중|고)(?:[·ㆍ・.,](?:초|중|고))*)등부$/.exec(t);
    if (m) return m[1].split(/[·ㆍ・.,]/).map(function (x) { return x + '등부' + g; });
    t = t.replace(/[·ㆍ・]/g, '');
    return t ? [t + g] : [];
  }
  function phoneOf(v, warn, who) {
    var d = s(v).replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 8) return '010-' + d.slice(0, 4) + '-' + d.slice(4);
    if (d.length === 11 && /^01/.test(d)) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    if (d.length === 10 && /^01/.test(d)) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    warn.push(who + ' 전화번호 확인: ' + s(v));
    return s(v);
  }
  var ROUND_RE = /^\s*(예선|본선|1차|2차|결선)\s*[:：]?\s*(.+)$/;
  function roundOf(word, cfg) {
    if (/본선|2차|결선/.test(word)) return 'R2';
    if (cfg && s(cfg.r2Name) && word.indexOf(s(cfg.r2Name)) >= 0) return 'R2';
    return 'R1';
  }
  function parseHeader(text, year, cfg) {
    var m = ROUND_RE.exec(s(text)); if (!m) return null;
    var rest = m[2], date = parseDate(rest, year); if (!date) return null;
    var parts = rest.split(/[\/|]/).map(s), arrive = '', targets = [];
    var dow = (/(월|화|수|목|금|토|일)요일/.exec(rest) || [])[1] || '';
    parts.slice(1).forEach(function (x) {
      if (!arrive && /\d/.test(x) && /시|:/.test(x)) arrive = parseTime(x);
      if (/부/.test(x) && !/요일/.test(x)) targets = targets.concat(parseTargets(x));
    });
    var memo = (/[(（]([^)）]*)[)）]/.exec(rest) || [])[1] || '';
    return { round: roundOf(m[1], cfg), roundWord: m[1], date: date, dow: dow, arrive: arrive, targets: targets, memo: s(memo), raw: s(text) };
  }
  function colIndex(head, names) {
    var h = head.map(clean);
    for (var i = 0; i < names.length; i++) { var k = h.indexOf(names[i]); if (k >= 0) return k; }
    for (var j = 0; j < names.length; j++) { for (var q = 0; q < h.length; q++) if (h[q] && h[q].indexOf(names[j]) >= 0) return q; }
    return -1;
  }
  function isFlatHeader(row) {
    var h = row.map(clean);
    return h.indexOf('이름') >= 0 && h.indexOf('부문') >= 0 && h.indexOf('구분') >= 0 && (h.indexOf('일자') >= 0 || h.indexOf('날짜') >= 0);
  }
  function sheetDivision(sh) {
    for (var i = 0; i < Math.min(sh.rows.length, 6); i++) {
      var cells = sh.rows[i].map(s).filter(Boolean);
      if (cells.length === 1 && cells[0].length <= 8 && !/회|심사위원|명단/.test(cells[0]) && !ROUND_RE.test(cells[0])) return cells[0];
    }
    return s(sh.name);
  }

  /* 부문 탭의 블록들 */
  function readBlocks(sh, year, cfg, warn) {
    var rows = sh.rows, out = [], division = sheetDivision(sh);
    for (var i = 0; i < rows.length; i++) {
      var H = parseHeader(rows[i][0], year, cfg); if (!H) continue;
      var head = rows[i + 1] || [], ci;
      if (colIndex(head, ['이름']) >= 0) { ci = { seq: colIndex(head, ['순번', '번호']), name: colIndex(head, ['이름', '성명']), aff: colIndex(head, ['소속']), phone: colIndex(head, ['전화번호', '연락처', '휴대폰', '전화']), note: colIndex(head, ['비고']) }; i++; }
      else ci = { seq: 0, name: 1, aff: 3, phone: 4, note: 5 };
      var d = new Date(H.date + 'T00:00:00');
      if (H.dow && DOW[d.getDay()] !== H.dow) warn.push(division + ' ' + H.raw + ' — ' + H.date + '은 ' + DOW[d.getDay()] + '요일이에요. 연도를 확인해 주세요.');
      var block = { division: division, round: H.round, roundWord: H.roundWord, date: H.date, arrive: H.arrive, targets: H.targets, memo: H.memo, raw: H.raw, people: [] };
      for (var j = i + 1; j < rows.length; j++) {
        var r = rows[j];
        if (parseHeader(r[0], year, cfg)) break;
        var name = s(r[ci.name]).replace(/\s+/g, '');
        if (!name) { if (block.people.length) break; else continue; }
        if (/^(이름|성명)$/.test(name)) continue;
        block.people.push({ seq: s(r[ci.seq]), name: name, affiliation: ci.aff >= 0 ? s(r[ci.aff]) : '', phone: ci.phone >= 0 ? phoneOf(r[ci.phone], warn, division + ' ' + name) : '', note: ci.note >= 0 ? s(r[ci.note]) : '' });
        i = j;
      }
      if (block.people.length) out.push(block);
    }
    return out;
  }
  /* 정리 탭 (한 줄 = 한 사람의 하루) */
  function readFlat(sh, year, cfg, warn) {
    var hi = -1;
    for (var i = 0; i < Math.min(sh.rows.length, 10); i++) if (isFlatHeader(sh.rows[i])) { hi = i; break; }
    if (hi < 0) return null;
    var head = sh.rows[hi], c = {
      div: colIndex(head, ['부문']), round: colIndex(head, ['구분']), shift: colIndex(head, ['구분2', '종일/반나절', '시간구분']), date: colIndex(head, ['일자', '날짜']),
      time: colIndex(head, ['시간', '도착']), name: colIndex(head, ['이름', '성명']), aff: colIndex(head, ['소속']), phone: colIndex(head, ['전화번호', '연락처']), note: colIndex(head, ['비고']), fee: colIndex(head, ['심사비', '금액'])
    };
    var out = [];
    sh.rows.slice(hi + 1).forEach(function (r) {
      var name = s(r[c.name]).replace(/\s+/g, ''), div = s(r[c.div]), date = parseDate(r[c.date], year);
      if (!name || !div || !date) return;
      var sh2 = s(r[c.shift]);
      out.push({ division: div, round: roundOf(s(r[c.round]), cfg), date: date, shift: /반/.test(sh2) ? '반나절' : /종일|전일/.test(sh2) ? '종일' : '', arrive: parseTime(r[c.time]), name: name,
        affiliation: c.aff >= 0 ? s(r[c.aff]) : '', phone: c.phone >= 0 ? phoneOf(r[c.phone], warn, div + ' ' + name) : '', note: c.note >= 0 ? s(r[c.note]) : '', fee: c.fee >= 0 ? money(r[c.fee]) : '' });
    });
    return out;
  }
  /* 심사비 탭 → '예선 종일=300000, …, 주말 본선 반나절=350000' */
  function readRates(sheets) {
    for (var k = 0; k < sheets.length; k++) {
      var rows = sheets[k].rows;
      for (var i = 0; i < Math.min(rows.length, 10); i++) {
        var h = rows[i].map(clean), cols = [];
        h.forEach(function (x, ci) { var m = /^(예선|본선|1차|2차)\(?(종일|반나절|반일)\)?$/.exec(x); if (m) cols.push({ ci: ci, round: /본선|2차/.test(m[1]) ? '본선' : '예선', shift: /반/.test(m[2]) ? '반나절' : '종일' }); });
        if (cols.length < 2) continue;
        var parts = [];
        rows.slice(i + 1, i + 6).forEach(function (r) {
          var lab = clean(r[0]); if (!/평일|주말|휴일/.test(lab)) return;
          cols.forEach(function (c) { var v = money(r[c.ci]); if (v) parts.push((/평일/.test(lab) ? '' : '주말 ') + c.round + ' ' + c.shift + '=' + v); });
        });
        if (parts.length) return { text: parts.join(', '), sheet: sheets[k].name };
      }
    }
    return null;
  }

  function parse(sheets, opt) {
    opt = opt || {};
    var year = opt.year || new Date().getFullYear(), cfg = opt.cfg || {}, warn = [], blocks = [], flat = null, flatName = '';
    var flats = [];
    sheets.forEach(function (sh) {
      var f = readFlat(sh, year, cfg, []);
      if (f && f.length) { flats.push({ name: sh.name, rows: f }); return; }
      blocks = blocks.concat(readBlocks(sh, year, cfg, warn));
    });
    if (flats.length) {
      var pick = flats.filter(function (x) { return /정리/.test(x.name); })[0] || flats.slice().sort(function (a, b) { return b.rows.length - a.rows.length; })[0];
      flatName = pick.name;
      flat = readFlat(sheets.filter(function (x) { return x.name === pick.name; })[0], year, cfg, warn);
    }
    var rates = readRates(sheets);
    var rows = [], used = {};
    var fkey = function (x) { return x.division + '|' + x.date + '|' + x.name; };
    var fmap = {}; (flat || []).forEach(function (x, i) { fmap[fkey(x)] = i; });
    if (blocks.length) {
      blocks.forEach(function (b) {
        b.people.forEach(function (p) {
          var fi = fmap[b.division + '|' + b.date + '|' + p.name], f = fi == null ? null : flat[fi];
          if (f) used[fi] = 1;
          else if (flat) warn.push(flatName + ' 탭에 없음: ' + b.division + ' ' + b.date.slice(5) + ' ' + p.name + ' (심사비는 단가표로 계산)');
          rows.push({ name: p.name, round: b.round, division: b.division, targets: b.targets, date: b.date, shift: f ? f.shift : '', arrive: b.arrive || (f ? f.arrive : ''), fee: f ? f.fee : '',
            affiliation: p.affiliation || (f ? f.affiliation : ''), phone: p.phone || (f ? f.phone : ''), note: [p.note, b.memo].filter(Boolean).join(' · '), seq: p.seq });
        });
      });
      (flat || []).forEach(function (f, i) { if (!used[i]) warn.push(flatName + ' 탭에만 있음: ' + f.division + ' ' + f.date.slice(5) + ' ' + f.name + ' — 부문 탭 이름과 맞는지 확인해 주세요 (불러오지 않음)'); });
    } else if (flat) {
      warn.push('부문 탭(예선 : 3월25일 / … / 초등부 형식)이 없어 담당 구분을 알 수 없어요. 부문 전체를 맡은 것으로 넣었어요.');
      flat.forEach(function (f) { rows.push({ name: f.name, round: f.round, division: f.division, targets: [], date: f.date, shift: f.shift, arrive: f.arrive, fee: f.fee, affiliation: f.affiliation, phone: f.phone, note: f.note, seq: '' }); });
    }
    // 같은 사람·같은 날이 두 번 → 하나만
    var seen = {}, dedup = [];
    rows.forEach(function (r) { var k = r.name + '|' + r.round + '|' + r.division + '|' + r.date; if (seen[k]) return; seen[k] = 1; dedup.push(r); });
    return { rows: dedup, blocks: blocks, flatSheet: flatName, rates: rates ? rates.text : '', ratesSheet: rates ? rates.sheet : '', warnings: warn, year: year };
  }

  // 명단에 연도가 없을 때(3월25일) — 블록 머리의 요일이 맞는 해를 고름. 정리 탭에 날짜가 통째로 있으면 그 해
  function detectYear(sheets, around) {
    var now = around || new Date().getFullYear(), votes = {}, flatYear = {};
    sheets.forEach(function (sh) {
      var f = readFlat(sh, now, {}, []);
      if (f) sh.rows.forEach(function (r) { r.forEach(function (c) { var v = s(c); if (/^\d{5}$/.test(v) || /^\d{4}\s*[-./년]/.test(v)) { var d = parseDate(v, now); if (d) flatYear[d.slice(0, 4)] = (flatYear[d.slice(0, 4)] || 0) + 1; } }); });
      else sh.rows.forEach(function (r) {
        var m = ROUND_RE.exec(s(r[0])); if (!m) return;
        var md = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(m[2]), dw = (/(월|화|수|목|금|토|일)요일/.exec(m[2]) || [])[1]; if (!md || !dw) return;
        for (var y = now - 2; y <= now + 2; y++) if (DOW[new Date(y, +md[1] - 1, +md[2]).getDay()] === dw) votes[y] = (votes[y] || 0) + 1;
      });
    });
    var best = 0, by = 0;
    Object.keys(votes).forEach(function (y) { var v = votes[y] * 10 + (flatYear[y] ? 5 : 0) - Math.abs(+y - now); if (v > best) { best = v; by = +y; } });
    if (by) return by;
    var fy = Object.keys(flatYear).sort(function (a, b) { return flatYear[b] - flatYear[a]; })[0];
    return fy ? +fy : 0;
  }

  return { parse: parse, detectYear: detectYear, parseDate: parseDate, parseTime: parseTime, parseTargets: parseTargets, parseHeader: parseHeader };
})();
if (typeof module !== 'undefined') module.exports = JL;
