/* 출력물·공문 데이터 만들기 — 양식(구글 문서/시트, 워드)에 넣을 값을 한곳에서 계산
 * FM.build(종류, 관리자데이터, 옵션) → { key, type:'doc'|'sheet', title, fields, pages|sheets, register }
 *  - 구글: Apps Script가 드라이브 양식을 복사해 채움 (gas.export)
 *  - 데모·비상: 워드 양식(web/templates)을 브라우저에서 채움 (DF.fill) / 표는 엑셀로 */
var FM = (function () {
  'use strict';
  var K = typeof KC !== 'undefined' ? KC : null;
  var T = typeof TT !== 'undefined' ? TT : null;
  var WD = ['일', '월', '화', '수', '목', '금', '토'];

  var FORMS = {
    tt_public: { name: '시간표 (공개용)', type: 'doc', file: 'tt_public.docx', cat: '시간표', desc: 'A4 세로, 날짜마다 한 장 — 인원·1인 시간 포함', lines: true },
    tt_ops: { name: '시간표 (운영·심사위원용)', type: 'doc', file: 'tt_ops.docx', cat: '시간표', desc: 'A4 세로 — 인원·1인 시간·추첨 시각·장소·메모', lines: true },
    tt_wall: { name: '시간표 (벽보용)', type: 'doc', file: 'tt_public.docx', cat: '시간표', desc: 'A3 세로로 붙이는 큰 글씨 — 시각만(인원·1인 시간 없이), 하루 한 장 + 부문별 장', lines: true },
    att_group: { name: '조별 출석부', type: 'sheet', file: 'att_group.xlsx', cat: '현장', desc: '조마다 한 탭, 조별 순서대로' },
    att_perf: { name: '현장 경연순서 출석부', type: 'sheet', file: 'att_perf.xlsx', cat: '현장', desc: '추첨 후 경연순번 순서' },
    pieces: { name: '곡목 알림표', type: 'sheet', file: 'pieces.xlsx', cat: '현장', desc: '경연순번과 곡목 (이름 없음)' },
    score_ox: { name: '예선 채점표 (예비)', type: 'sheet', file: 'score_ox.xlsx', cat: '현장', desc: '심사위원별·심사일별 한 장에 60명 (O/X)' },
    score_rank: { name: '본선 채점표 (예비)', type: 'sheet', file: 'score_rank.xlsx', cat: '현장', desc: '전산 장애 대비 등위 표' },
    staff_att: { name: '진행요원 출석부', type: 'sheet', file: 'staff_att.xlsx', cat: '현장', desc: '근무일마다 한 탭' },
    gonggyeol: { name: '공결 협조 공문', type: 'doc', file: 'gonggyeol.docx', cat: '공문', series: '공문', desc: '참가자·반주자 학교·부대·기관에' },
    judge_request: { name: '심사 요청 공문', type: 'doc', file: 'judge_request.docx', cat: '공문', series: '공문', desc: '심사위원 소속기관에' },
    judge_cert: { name: '심사위원 위촉확인서', type: 'doc', file: 'judge_cert.docx', cat: '확인서', series: '확인서' },
    award_cert: { name: '입상확인서', type: 'doc', file: 'award_cert.docx', cat: '확인서', series: '확인서' },
    award_cert_en: { name: '영문 수상증명서', type: 'doc', file: 'award_cert_en.docx', cat: '확인서', series: '확인서' },
    contract: { name: '근로계약서 (단시간)', type: 'doc', file: 'contract.docx', cat: '인력', desc: '진행요원 — 근로일별 근로시간 포함' },
    pledge: { name: '정보보안 서약서', type: 'doc', file: 'pledge.docx', cat: '인력' },
    judge_agree: { name: '심사위원 동의서', type: 'doc', file: 'judge_agree.docx', cat: '인력', desc: '개인정보 수집·이용 동의 + 공정심사 서약' },
    photo_agree: { name: '촬영 및 영상 활용 동의서', type: 'doc', file: 'photo_agree.docx', cat: '현장', desc: '본선 진출자 이름을 미리 채움 / 반주자용 빈 양식' },
    results: { name: '채점 결과표', type: 'sheet', generic: true, cat: '결과' },
    pay_judge: { name: '심사비 지급명세', type: 'sheet', generic: true, cat: '지급' },
    pay_prize: { name: '상금 지급명세', type: 'sheet', generic: true, cat: '지급' },
    pay_staff: { name: '진행요원 인건비', type: 'sheet', generic: true, cat: '지급' }
  };

  /* ---------- 날짜·이름 도우미 ---------- */
  function s(v) { return v == null ? '' : String(v).trim(); }
  function pd(d) { var m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s(d)); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function iso(x) { return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); }
  function koDate(d) { var x = pd(d); return x ? x.getFullYear() + '년 ' + (x.getMonth() + 1) + '월 ' + x.getDate() + '일' : s(d); }
  function koDateW(d) { var x = pd(d); return x ? koDate(d) + '(' + WD[x.getDay()] + ')' : s(d); }
  function md(d) { var x = pd(d); return x ? (x.getMonth() + 1) + '월 ' + x.getDate() + '일' : s(d); }
  function mdw(d) { var x = pd(d); return x ? md(d) + '(' + WD[x.getDay()] + ')' : s(d); }
  function dot(d) { var x = pd(d); return x ? x.getFullYear() + '. ' + (x.getMonth() + 1) + '. ' + x.getDate() + '.' : s(d); }
  function wd(d) { var x = pd(d); return x ? WD[x.getDay()] : ''; }
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function enDate(d) { var x = pd(d); return x ? MON[x.getMonth()] + ' ' + x.getDate() + ', ' + x.getFullYear() : s(d); }
  function today(L) { return s(L && L.today) || iso(new Date()); }
  function spaced(n) { n = s(n).replace(/\s+/g, ''); return /^[가-힣]{2,4}$/.test(n) ? n.split('').join(' ') : n; }
  function won(n) { return Math.round(+n || 0).toLocaleString('en-US'); }
  function manwon(n) { n = Math.round(+n || 0); return n % 10000 === 0 ? (n / 10000) + '만원' : won(n) + '원'; }
  function fullBirth(b, ref) {
    var d = s(b).replace(/\D/g, '');
    if (d.length === 8) return d;
    if (d.length !== 6) return '';
    var yy = +d.slice(0, 2), cur = +String((ref || new Date().getFullYear())).slice(-2);
    return (yy > cur ? '19' : '20') + d;
  }
  function birthDot(b) { var f = fullBirth(b); return f ? f.slice(0, 4) + '.' + f.slice(4, 6) + '.' + f.slice(6, 8) + '.' : s(b); }
  function birthDotSp(b) { var f = fullBirth(b); return f ? f.slice(0, 4) + '. ' + (+f.slice(4, 6)) + '. ' + (+f.slice(6, 8)) + '.' : s(b); }
  function phoneFmt(p) { var d = s(p).replace(/\D/g, ''); return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : s(p); }
  function hm(mins) { mins = Math.round(+mins || 0); var h = Math.floor(mins / 60), m = mins % 60; return (h ? h + '시간' : '') + (m ? (h ? ' ' : '') + m + '분' : (h ? '' : '0분')); }
  function split(gk) { var p = s(gk).split('|'); return { div: p[0], cat: p[1] || '' }; }
  function edition(cfg) { var m = /제\s*(\d+)\s*회/.exec(s(cfg.title)); return m ? m[1] : ''; }
  function title(cfg) { return s(cfg.title).replace(/\s*\(데모\)\s*$/, ''); }
  function ordinal(n) { n = +n; var t = n % 100; return n + (t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
  function rname(cfg, r) { return r === 'R2' ? (cfg.r2Name || '본선') : (cfg.r1Name || '예선'); }

  function period(L) {
    var cfg = L.cfg || {};
    if (s(cfg.eventPeriod)) { var t = s(cfg.eventPeriod); return { text: t, sentence: t.replace(/\s*[~∼-]\s*/, '부터 ') + '까지' }; }
    var ds = (L.sessions || []).map(function (x) { return x.date; }).filter(Boolean).sort();
    if (!ds.length) return { text: '', sentence: '' };
    var a = pd(ds[0]), b = pd(ds[ds.length - 1]);
    var right = a.getFullYear() === b.getFullYear() ? md(ds[ds.length - 1]) : koDate(ds[ds.length - 1]);
    return { text: koDate(ds[0]) + ' ~ ' + right, sentence: koDate(ds[0]) + '부터 ' + right + '까지', from: ds[0], to: ds[ds.length - 1] };
  }

  function common(L, opt) {
    var cfg = L.cfg || {}, per = period(L), day = s(opt && opt.date) || today(L);
    return {
      대회명: title(cfg), 회차: edition(cfg), 대회약칭: s(cfg.shortTitle), 주최: s(cfg.hostLine) || '경향신문사 · 이화여자고등학교',
      기간: per.text, 기간문장: per.sentence, 장소: s(cfg.venueShort), 장소상세: s(cfg.venueFull),
      사장직함: s(cfg.ceoTitle) || '경향신문사 사장', 사장명: spaced(cfg.ceoName), 사장명붙임: s(cfg.ceoName), 영문사장명: s(cfg.ceoNameEn),
      담당부서: s(cfg.deptName), 담당자: s(cfg.manager), 전화: s(cfg.phone), 이메일: s(cfg.email), 회사주소: s(cfg.companyAddress).replace(/^\d{5}\s*/, ''),
      기관연락처: [s(cfg.companyAddress), cfg.phone ? '전화 ' + cfg.phone : '', cfg.fax ? '팩스 ' + cfg.fax : '', s(cfg.homepage)].filter(Boolean).join('  ·  '),
      담당줄: ['담당  ' + [s(cfg.deptName), s(cfg.manager)].filter(Boolean).join(' '), cfg.phone ? '전화 ' + cfg.phone : '', cfg.email ? '이메일 ' + cfg.email : ''].filter(Boolean).join('   ·   '),
      시행일: dot(day), 발급일: koDate(day), 연도: day.slice(0, 4)
    };
  }

  /* ---------- 문서번호 ---------- */
  function noFormat(cfg, series) { return s(series === '공문' ? cfg.docNoFormat : cfg.certNoFormat) || (series === '공문' ? '경향 G{yyyy}-{MM}{NN}' : '제 {yy}-{MM}{NN} 호'); }
  function fmtNo(fmt, date, n) {
    var x = pd(date) || new Date();
    return fmt.replace(/\{yyyy\}/g, x.getFullYear()).replace(/\{yy\}/g, String(x.getFullYear()).slice(-2)).replace(/\{MM\}/g, ('0' + (x.getMonth() + 1)).slice(-2))
      .replace(/\{NNN\}/g, ('00' + n).slice(-3)).replace(/\{NN\}/g, ('0' + n).slice(-2)).replace(/\{N\}/g, n);
  }
  function nextNo(L, series, date) {
    var fmt = noFormat(L.cfg || {}, series);
    var probe = fmtNo(fmt.replace(/\{N+\}/g, '\u00a7'), date, 0).split('\u00a7');
    var esc = function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var re = new RegExp('^' + esc(probe[0]) + '(\\d+)' + esc(probe[1] || '') + '$');
    var max = 0;
    (L.docs || []).forEach(function (d) { if (d.series === series && d.status !== '취소') { var m = re.exec(s(d.docNo)); if (m) max = Math.max(max, +m[1]); } });
    return max + 1;
  }
  function numbers(L, series, date, count, start) {
    var fmt = noFormat(L.cfg || {}, series), n0 = +start || nextNo(L, series, date), out = [];
    for (var i = 0; i < count; i++) out.push(fmtNo(fmt, date, n0 + i));
    return out;
  }

  /* ---------- 공통 자료 ---------- */
  function counts(L) { var c = {}; (L.entries || []).forEach(function (e) { c[e.sessionId] = (c[e.sessionId] || 0) + 1; }); return c; }
  function pmap(L) { var m = {}; (L.participants || []).forEach(function (p) { m[p.id] = p; }); return m; }
  function sesOf(L, opt) {
    var c = counts(L);
    return (L.sessions || []).filter(function (x) {
      if (opt.round && x.round !== opt.round) return false;
      if (opt.groupKey && x.groupKey !== opt.groupKey && split(x.groupKey).div !== opt.groupKey) return false;
      if (opt.sessionIds && opt.sessionIds.length && opt.sessionIds.indexOf(x.sessionId) < 0) return false;
      if (opt.dates && opt.dates.length && opt.dates.indexOf(x.date) < 0) return false;
      return true;
    }).map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; o.count = c[x.sessionId] || 0; return o; })
      .sort(function (a, b) { return (a.date + a.startTime).localeCompare(b.date + b.startTime) || (+a.no) - (+b.no); });
  }
  // 연주순서 = 같은 부문(groupKey) 앞 조 인원 합 + 추첨번호 (core 와 같은 규칙)
  function perfOrders(L, round, gk) {
    var ses = (L.sessions || []).filter(function (x) { return x.round === round && x.groupKey === gk; }).sort(function (a, b) { return (+a.no) - (+b.no); });
    var pm = pmap(L), ent = (L.entries || []).filter(function (e) { return e.round === round && pm[e.pid] && pm[e.pid].groupKey === gk; });
    var out = {}, off = 0, range = {};
    ses.forEach(function (x) {
      var list = ent.filter(function (e) { return e.sessionId === x.sessionId; });
      list.forEach(function (e) { out[e.entryId] = s(e.drawNo) ? off + (+e.drawNo) : null; });
      range[x.sessionId] = [off + 1, off + list.length];
      off += list.length;
    });
    return { order: out, range: range };
  }
  function sheetName(x, used) {
    var g = split(x.groupKey), n = (g.div + ' ' + g.cat + ' ' + (x.label || x.no + '조')).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 90);
    var k = n, i = 2; while (used[k]) k = n + ' (' + (i++) + ')'; used[k] = 1; return k;
  }
  function sesFields(L, x, round) {
    var g = split(x.groupKey), cfg = L.cfg || {};
    return { 라운드: rname(cfg, round || x.round), 부문: g.div, 구분: g.cat, 조: x.label || (x.no + '조'), 날짜: mdw(x.date), 추첨시간: s(x.drawTime), 시작시간: s(x.startTime), 종료시간: s(x.endTime), 장소: s(x.venue) || s(cfg.venueShort), 인원: String(x.count || 0) };
  }

  /* ========== 표(시트) 양식 ========== */
  function attGroup(L, opt) {
    var pm = pmap(L), used = {}, round = opt.round || 'R1';
    var sheets = sesOf(L, { round: round, groupKey: opt.groupKey, sessionIds: opt.sessionIds, dates: opt.dates }).map(function (x) {
      var rows = (L.entries || []).filter(function (e) { return e.sessionId === x.sessionId; }).sort(function (a, b) { return (+a.seq || 0) - (+b.seq || 0); }).map(function (e) {
        var p = pm[e.pid] || {};
        return { 순번: s(e.seq), 접수번호: s(p.id), 성명: s(p.name), 생년월일: s(p.birth), 학교: s(p.school), 학년: s(p.grade), 휴대폰: phoneFmt(p.phone), 보호자휴대폰: phoneFmt(p.guardianPhone) === phoneFmt(p.phone) ? '' : phoneFmt(p.guardianPhone), 비고: s(e.note) };
      });
      return { name: sheetName(x, used), fields: sesFields(L, x, round), rows: rows };
    });
    return { sheets: sheets, headers: [['순번', '순번'], ['접수번호', '접수번호'], ['성명', '성명'], ['생년월일', '생년월일'], ['학교', '학교'], ['학년', '학년'], ['휴대폰', '휴대폰'], ['보호자 휴대폰', '보호자휴대폰'], ['출석', ''], ['추첨번호', ''], ['비고', '비고']] };
  }
  function attPerf(L, opt) {
    var pm = pmap(L), used = {}, round = opt.round || 'R1', warn = [];
    var sheets = sesOf(L, { round: round, groupKey: opt.groupKey, sessionIds: opt.sessionIds, dates: opt.dates }).map(function (x) {
      var po = perfOrders(L, round, x.groupKey);
      var list = (L.entries || []).filter(function (e) { return e.sessionId === x.sessionId; });
      var drawn = list.filter(function (e) { return s(e.drawNo); }).length;
      if (drawn < list.length) warn.push(sheetName(x, {}) + ': 추첨 ' + drawn + '/' + list.length + '명');
      list.sort(function (a, b) { var A = po.order[a.entryId], B = po.order[b.entryId]; return (A == null ? 9999 + (+a.seq) : A) - (B == null ? 9999 + (+b.seq) : B); });
      var absent = 0;
      var rows = list.map(function (e) {
        var p = pm[e.pid] || {}; if (e.attend === 'N') absent++;
        // 연주순서 = 조 안 몇 번째 · 추첨번호 = 부문 안에서 이어지는 번호(심사위원 경연순번) · 순번 = 처음 편성 순번
        return { 연주순서: s(e.drawNo), 추첨번호: po.order[e.entryId] == null ? '' : String(po.order[e.entryId]), 순번: s(e.seq), 성명: s(p.name), 학교: s(p.school), 학년: s(p.grade), 휴대폰: phoneFmt(p.phone), 보호자휴대폰: phoneFmt(p.guardianPhone) === phoneFmt(p.phone) ? '' : phoneFmt(p.guardianPhone), 출석: e.attend === 'N' ? '불참' : e.attend === 'Y' ? '○' : '', 비고: s(e.note) };
      });
      var f = sesFields(L, x, round); f.불참 = String(absent);
      return { name: sheetName(x, used), fields: f, rows: rows };
    });
    return { sheets: sheets, warn: warn, headers: [['연주순서', '연주순서'], ['추첨번호', '추첨번호'], ['순번', '순번'], ['성명', '성명'], ['학교', '학교'], ['학년', '학년'], ['휴대폰', '휴대폰'], ['보호자 휴대폰', '보호자휴대폰'], ['출석', '출석'], ['비고', '비고']] };
  }
  /* 예선 종이 채점표 — 심사위원 × 심사일마다, 한 장에 60칸 (왼쪽 1~30번째, 오른쪽 31~60번째)
   * 그날 그 심사위원이 맡은 조를 경연순번대로 이어 붙이고, 조가 바뀌는 칸에 '▶ 2조 10:30' 표시.
   * 조편성 전이면 명단의 심사일로 1~60 빈 칸 장을 만듦 */
  var PER_PAGE = 60, HALF = 30;
  function cmpK(a, b) { return K && K.cmpKo ? K.cmpKo(a, b) : String(a).localeCompare(String(b), 'ko'); }
  function gkCmp(a, b) { return K && K.groupKeyCmp ? K.groupKeyCmp(a, b) : cmpK(a, b); }
  function groupText(gks) {
    if (!gks.length) return '';
    var divs = [], cats = {};
    gks.forEach(function (k) { var g = split(k); if (divs.indexOf(g.div) < 0) divs.push(g.div); (cats[g.div] = cats[g.div] || []); if (g.cat && cats[g.div].indexOf(g.cat) < 0) cats[g.div].push(g.cat); });
    return divs.map(function (d) { return d + (cats[d].length ? ' ' + cats[d].join('·') : ''); }).join(', ');
  }
  function judgeDayPages(L, opt) {
    opt = opt || {};
    var round = opt.round || 'R1', c = counts(L), per = opt.per || PER_PAGE, out = [], poC = {};
    var ses = (L.sessions || []).filter(function (x) { return x.round === round; });
    var js = (L.judges || []).filter(function (j) { return j.round === round && (!opt.judgeIds || !opt.judgeIds.length || opt.judgeIds.indexOf(j.judgeId) >= 0); });
    if (!(L.judges || []).some(function (j) { return j.round === round; })) {   // 심사위원 등록 전: 부문마다 이름 빈 칸
      var seen = {}; ses.forEach(function (x) { var dv = split(x.groupKey).div; if (!seen[dv]) { seen[dv] = 1; js.push({ judgeId: '', name: '', round: round, groups: dv, seat: '' }); } });
    }
    var divOf = function (j) { return s(j.groups).split(/[|,\s]/)[0]; };
    js.sort(function (a, b) { return gkCmp(divOf(a), divOf(b)) || (+a.seat || 99) - (+b.seat || 99) || cmpK(a.name, b.name); });
    function po(gk) { return poC[gk] || (poC[gk] = perfOrders(L, round, gk)); }
    js.forEach(function (j) {
      var fixed = s(j.dates).split(/[,\s]+/).filter(Boolean), info = K && K.parseDayInfo ? K.parseDayInfo(j.dayInfo) : {};
      var mine = ses.filter(function (x) { return (!K || K.judgeCovers(j, x.groupKey)) && (!fixed.length || fixed.indexOf(x.date) >= 0); });
      if (opt.groupKey) mine = mine.filter(function (x) { return x.groupKey === opt.groupKey || split(x.groupKey).div === opt.groupKey; });
      var dates = {}; mine.forEach(function (x) { dates[x.date] = 1; });
      if (!opt.groupKey || divOf(j) === opt.groupKey || s(j.groups).indexOf(opt.groupKey) >= 0) fixed.forEach(function (d) { dates[d] = 1; });
      Object.keys(dates).sort().forEach(function (d) {
        if (opt.dates && opt.dates.length && opt.dates.indexOf(d) < 0) return;
        var ds = mine.filter(function (x) { return x.date === d; }).sort(function (a, b) { return gkCmp(a.groupKey, b.groupKey) || cmpK(s(a.startTime), s(b.startTime)) || (+a.no) - (+b.no); });
        var gks = []; ds.forEach(function (x) { if (gks.indexOf(x.groupKey) < 0) gks.push(x.groupKey); });
        var multiDiv = gks.some(function (k) { return split(k).div !== split(gks[0]).div; });
        var slots = [];
        ds.forEach(function (x) {
          var rg = po(x.groupKey).range[x.sessionId] || [1, c[x.sessionId] || 0], g = split(x.groupKey);
          for (var n = rg[0]; n <= rg[1]; n++) slots.push({ no: String(n), mark: n === rg[0] ? '▶ ' + (multiDiv ? g.div + ' ' + g.cat + ' ' : gks.length > 1 ? g.cat + ' ' : '') + (x.label || x.no + '조') + (x.startTime ? ' ' + x.startTime : '') : '' });
        });
        var blank = !slots.length;
        if (blank) for (var b = 1; b <= per; b++) slots.push({ no: String(b), mark: '' });
        var pages = Math.ceil(slots.length / per), x0 = info[d] || {};
        var gt = gks.length ? groupText(gks) : groupText(s(j.groups).split(/\s*,\s*/).filter(Boolean));
        for (var p = 0; p < pages; p++) out.push({ judge: j, date: d, slots: slots.slice(p * per, (p + 1) * per), page: p + 1, pages: pages, blank: blank, count: blank ? 0 : slots.length, groups: gt, shift: x0.shift || '', arrive: x0.arrive || '' });
      });
    });
    return out;
  }
  function pageRows(slots) {
    var rows = [];
    for (var i = 0; i < HALF; i++) { var a = slots[i] || {}, b = slots[i + HALF] || {}; rows.push({ 번호1: a.no || '', 메모1: a.mark || '', 번호2: b.no || '', 메모2: b.mark || '' }); }
    return rows;
  }
  function scoreOx(L, opt) {
    var used = {}, round = opt.round || 'R1', cfg = L.cfg || {}, warn = [];
    var pages = judgeDayPages(L, { round: round, groupKey: opt.groupKey, dates: opt.dates, judgeIds: opt.judgeIds });
    if (pages.some(function (p) { return p.blank; })) warn.push('조편성 전인 날은 1~60번 빈 칸으로 나왔어요.');
    var sheets = pages.map(function (P) {
      var nm = (P.date.slice(5).replace('-', '.') + ' ' + (P.judge.name || P.groups) + (P.pages > 1 ? ' (' + P.page + ')' : '')).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 90), k = nm, i = 2;
      while (used[k]) k = nm + ' ' + (i++); used[k] = 1;
      return { name: k, fields: { 라운드: rname(cfg, round), 부문: P.groups, 구분: '', 조: '', 날짜: mdw(P.date), 심사위원: P.judge.name || '', 인원: P.count ? P.count + '명' : '', 쪽: P.pages > 1 ? '(' + P.page + '/' + P.pages + '쪽)' : '', 도착: P.arrive ? P.arrive + ' 도착' : '' }, rows: pageRows(P.slots) };
    });
    return { sheets: sheets, warn: warn, headers: [['경연순번', '번호1'], ['판정(O·X)', ''], ['메모', '메모1'], ['', ''], ['경연순번', '번호2'], ['판정(O·X)', ''], ['메모', '메모2']] };
  }
  function scoreSheets(L, opt, ox) {
    var used = {}, round = opt.round || (ox ? 'R1' : 'R2'), cfg = L.cfg || {}, sheets = [];
    sesOf(L, { round: round, groupKey: opt.groupKey, sessionIds: opt.sessionIds, dates: opt.dates }).forEach(function (x) {
      var po = perfOrders(L, round, x.groupKey), rg = po.range[x.sessionId] || [1, x.count], rows = [];
      for (var n = rg[0]; n <= rg[1]; n++) rows.push({ 경연순번: String(n) });
      var judges = opt.perJudge ? (L.judges || []).filter(function (j) { return j.round === round && (!K || K.judgeCovers(j, x.groupKey)); }) : [null];
      judges.forEach(function (j) {
        var f = sesFields(L, x, round); f.심사위원 = j ? j.name : ''; f.최하등위 = String(cfg['r' + (round === 'R2' ? 2 : 1) + 'Max'] || 5);
        sheets.push({ name: sheetName(x, used) + (j ? ' ' + j.name : ''), fields: f, rows: rows });
      });
    });
    return { sheets: sheets, headers: [['경연순번', '경연순번'], [ox ? '판정(O·X)' : '등위', ''], ['비고', '']] };
  }
  function piecesSheet(L, opt) {
    var pm = pmap(L), used = {}, round = opt.round || 'R1', warn = [];
    var sheets = sesOf(L, { round: round, groupKey: opt.groupKey, sessionIds: opt.sessionIds, dates: opt.dates }).map(function (x) {
      var po = perfOrders(L, round, x.groupKey);
      var list = (L.entries || []).filter(function (e) { return e.sessionId === x.sessionId && e.attend !== 'N'; });
      list.sort(function (a, b) { var A = po.order[a.entryId], B = po.order[b.entryId]; return (A == null ? 9999 + (+a.seq) : A) - (B == null ? 9999 + (+b.seq) : B); });
      if (list.some(function (e) { return !s(e.drawNo); })) warn.push(sheetName(x, {}) + ': 추첨 전이라 조별 순서로 나왔어요');
      var rows = list.map(function (e) {
        var ps = K ? K.piecesFor(pm[e.pid] || {}, round) : [];
        var o = { 경연순번: po.order[e.entryId] == null ? '(' + s(e.seq) + ')' : String(po.order[e.entryId]) };
        for (var i = 0; i < 3; i++) {
          var x = ps[i]; if (!x) { o['곡' + (i + 1)] = ''; continue; }
          var head = [x.kind, x.country && String(x.kind || '').indexOf(x.country) < 0 ? x.country : ''].filter(Boolean).join(' · ');
          o['곡' + (i + 1)] = (head ? '[' + head + '] ' : '') + [x.composer, x.title].filter(Boolean).join(' — ');
        }
        return o;
      });
      return { name: sheetName(x, used), fields: sesFields(L, x, round), rows: rows };
    });
    return { sheets: sheets, warn: warn, headers: [['경연순번', '경연순번'], ['곡목 ①', '곡1'], ['곡목 ②', '곡2'], ['곡목 ③', '곡3']] };
  }
  function staffAtt(L, opt) {
    var staff = {}; (L.staff || []).forEach(function (x) { staff[x.staffId] = x; });
    var by = {};
    (L.work || []).forEach(function (w) { if (!staff[w.staffId] || (opt.dates && opt.dates.length && opt.dates.indexOf(w.date) < 0)) return; (by[w.date] = by[w.date] || []).push(w); });
    var sheets = Object.keys(by).sort().map(function (d) {
      var rows = by[d].sort(function (a, b) { return (s(a.planStart) + staff[a.staffId].name).localeCompare(s(b.planStart) + staff[b.staffId].name, 'ko'); })
        .map(function (w, i) { return { 순번: String(i + 1), 성명: staff[w.staffId].name, 담당: s(w.role), 출근: '', 퇴근: '' }; });
      return { name: md(d).replace(/\s/g, '') + '(' + wd(d) + ')', fields: { 날짜: koDateW(d) }, rows: rows };
    });
    return { sheets: sheets, headers: [['순번', '순번'], ['성명', '성명'], ['담당', '담당'], ['출근시간', ''], ['퇴근시간', ''], ['서명', '']] };
  }

  /* ========== 시간표 (문서, 날짜마다 한 장) ========== */
  // 시간표 — 한 장 = 줄 목록 + 용지(A4/A3) + 글씨 크기(쪽을 알맞게 채우도록 계산). 구글 문서는 Apps Script가 바로 만들고, 워드는 DF.linesDocx
  function ttInfo(cfg) { return { title: title(cfg), r1Name: cfg.r1Name, r2Name: cfg.r2Name, drawLeadMin: cfg.drawLeadMin }; }
  function ttOut(pages) { return { pages: pages.map(function (p) { return { fields: { 날짜: p.bookmark }, lines: p.lines, size: p.size, fit: p.fit }; }) }; }
  function timetable(L, opt, ops) {
    if (!T || !T.printPages) throw new Error('시간표 모듈(TT)이 없습니다');
    var cfg = L.cfg || {}, list = opt.sessions || sesOf(L, { round: opt.round, dates: opt.dates });
    return ttOut(T.printPages(T.buildDays(list, L.plan || []), ttInfo(cfg), ops ? 'ops' : 'public'));
  }
  // 벽보용: A3 세로, 시각만 — 하루 한 장 + (부문이 둘 이상인 날) 부문별 장
  function timetableWall(L, opt) {
    if (!T || !T.printPages) throw new Error('시간표 모듈(TT)이 없습니다');
    var cfg = L.cfg || {}, list = opt.sessions || sesOf(L, { round: opt.round, dates: opt.dates });
    return ttOut(T.printPages(T.buildDays(list, L.plan || []), ttInfo(cfg), 'wall', { split: opt.split !== false }));
  }

  /* ========== 공문·확인서 ========== */
  function honorOf(recipient) {
    var r = s(recipient);
    if (/학교|교장|초등|중학|고등|학원/.test(r)) return '귀 교';
    if (/사단|부대|대대|연대|여단|군단|사령부|육군|해군|공군|해병/.test(r)) return '귀 부대';
    if (/대학교|대학|총장/.test(r)) return '귀 대학';
    return '귀 기관';
  }
  function scheduleLines(L, pid) {
    var cfg = L.cfg || {}, pm = pmap(L), p = pm[pid] || {}, g = split(p.groupKey), out = [];
    ['R1', 'R2'].forEach(function (round) {
      var e = (L.entries || []).filter(function (x) { return x.round === round && x.pid === pid; })[0];
      if (!e) return;
      var x = (L.sessions || []).filter(function (q) { return q.sessionId === e.sessionId; })[0];
      if (!x) return;
      out.push(koDateW(x.date) + ' - ' + g.cat.replace(/(대학)(일반부)/, '$1·$2') + ' ' + g.div + '부문 ' + rname(cfg, round));
    });
    return out;
  }
  function gonggyeol(L, opt) {
    var cfg = L.cfg || {}, pm = pmap(L), ttl = title(cfg);
    var reqs = (opt.requests || []).map(function (r) { return typeof r === 'string' ? (L.requests || []).filter(function (q) { return q.reqId === r; })[0] : r; }).filter(Boolean);
    var nos = numbers(L, '공문', opt.date || today(L), reqs.length, opt.startNo);
    var pages = reqs.map(function (r, i) {
      var p = pm[r.pid] || { name: r.name || '' }, acc = r.target === '반주자';
      var lines = r.schedule ? [].concat(r.schedule) : scheduleLines(L, r.pid);
      return {
        fields: { 문서번호: nos[i], 수신: s(r.recipient), 참조: s(r.attn) || '', 제목: '『' + ttl + '』 공결 처리 요청의 건', 기관호칭: s(r.honor) || honorOf(r.recipient),
          대상구분: acc ? '참가자와 반주자' : '참가자', 요청대상: acc ? s(p.name) + ' 참가자의 반주자 ' + s(r.accompName) : s(p.name) + ' 참가자', 요청일정: lines.join('\n') },
        register: { kind: 'gonggyeol', series: '공문', docNo: nos[i], title: '공결 협조 공문 — ' + s(r.recipient) + ' (' + s(p.name) + (acc ? ' 반주자' : '') + ')', target: s(r.recipient), refId: r.reqId || r.pid || '', reqId: r.reqId || '' }
      };
    });
    return { pages: pages };
  }
  function judgePeople(L, opt) {
    var keys = opt.people || [];
    return (L.judgePeople || []).filter(function (x) { return !keys.length || keys.indexOf(x.key) >= 0 || keys.indexOf(x.staffId) >= 0; });
  }
  function daysText(L, P) {
    var cfg = L.cfg || {}, parts = [];
    ['R1', 'R2'].forEach(function (r) { var R = P.rounds[r]; if (R && R.dates.length) parts.push('(' + rname(cfg, r) + ') ' + R.dates.map(md).join(', ')); });
    return parts.join('  ');
  }
  function divisionsOf(P) {
    var o = []; Object.keys(P.rounds).forEach(function (r) { P.rounds[r].divisions.forEach(function (d) { if (o.indexOf(d) < 0) o.push(d); }); }); return o;
  }
  // 하루하루 심사비 (판단 근거: 명단의 종일/반나절 · 설정의 심사비 단가표). 옛 데이터면 1일 심사비 × 일수
  function dayList(L, P) {
    if (P.dayInfo && P.dayInfo.length) return P.dayInfo;
    var fee = +(L.cfg || {}).judgeFee || 0;
    return (P.days || []).map(function (d) { return { date: d, shift: '', fee: fee }; });
  }
  function staffOf(L, id) { return (L.staff || []).filter(function (x) { return x.staffId === id; })[0] || {}; }
  function judgeCert(L, opt) {
    var people = judgePeople(L, opt), nos = numbers(L, '확인서', opt.date || today(L), people.length, opt.startNo);
    return { pages: people.map(function (P, i) {
      return { fields: { 번호: nos[i], 성명: P.name, 소속: P.affiliation, 심사부문: divisionsOf(P).join(', '), 심사일자: daysText(L, P) },
        register: { kind: 'judge_cert', series: '확인서', docNo: nos[i], title: '심사위원 위촉확인서 — ' + P.name, target: P.name, refId: P.staffId || P.key } };
    }) };
  }
  function judgeRequest(L, opt) {
    var cfg = L.cfg || {}, people = judgePeople(L, opt), nos = numbers(L, '공문', opt.date || today(L), people.length, opt.startNo);
    return { pages: people.map(function (P, i) {
      var st = staffOf(L, P.staffId), aff = P.affiliation || st.affiliation || '', di = dayList(L, P);
      var dayStr = di.map(function (x, j) { var d = pd(x.date); return (j && pd(di[j - 1].date).getMonth() === d.getMonth() ? d.getDate() + '일' : md(x.date)) + '(' + (x.shift || '종일') + ')'; }).join(', ');
      var total = di.reduce(function (a, x) { return a + (+x.fee || 0); }, 0);
      return { fields: { 문서번호: nos[i], 제목: title(cfg) + ' 심사 요청', 수신: s(st.orgHead) || (aff ? aff + '장' : ''), 참조: '담당자', 기관명: aff, 호칭: s(st.title) || '교수',
          심사대상: divisionsOf(P).join(', ') + ' 부문 참가자', 심사일시: dayStr, 심사위원: P.name + '님',
          심사비: total ? manwon(total) + (di.length > 1 ? ' [' + di.map(function (x) { return md(x.date) + '(' + manwon(x.fee) + ')'; }).join(', ') + ']' : '') : '' },
        register: { kind: 'judge_request', series: '공문', docNo: nos[i], title: '심사 요청 공문 — ' + aff + ' (' + P.name + ')', target: aff, refId: P.staffId || P.key } };
    }) };
  }
  var DIV_EN = { 피아노: 'Piano', 바이올린: 'Violin', 비올라: 'Viola', 첼로: 'Cello', 콘트라베이스: 'Double Bass', 더블베이스: 'Double Bass', 성악: 'Voice', 플루트: 'Flute', 오보에: 'Oboe', 클라리넷: 'Clarinet', 바순: 'Bassoon', 호른: 'Horn', 트럼펫: 'Trumpet', 트롬본: 'Trombone', 튜바: 'Tuba', 하프: 'Harp', 기타: 'Guitar', 작곡: 'Composition', 색소폰: 'Saxophone', 타악기: 'Percussion' };
  var CAT_EN = { 초등부: 'Elementary School Division', 중등부: 'Middle School Division', 고등부: 'High School Division', 대학일반부: 'University & Open Division', 대학부: 'University Division', 일반부: 'Open Division' };
  function winners(L, opt) {
    var pm = pmap(L), out = [], R2 = (L.results || {}).R2 || {};
    Object.keys(R2).forEach(function (gk) {
      (R2[gk].rows || []).forEach(function (r) {
        if (!r.award) return;
        if (opt && opt.pids && opt.pids.length && opt.pids.indexOf(r.pid) < 0) return;
        var x = (L.sessions || []).filter(function (q) { return q.sessionId === r.sessionId; })[0] || {};
        out.push({ pid: r.pid, p: pm[r.pid] || {}, groupKey: gk, award: r.award, rank: r.rank, date: x.date || '' });
      });
    });
    var rk = function (w) { var m = /(\d+)\s*위/.exec(w.award); return m ? +m[1] : 99; };
    return out.sort(function (a, b) { return a.groupKey.localeCompare(b.groupKey, 'ko') || rk(a) - rk(b) || String(a.p.name).localeCompare(String(b.p.name), 'ko'); });
  }
  function awardCert(L, opt, en) {
    var cfg = L.cfg || {}, list = winners(L, opt).map(function (w) {
      var g = split(w.p.groupKey || w.groupKey), cat = g.cat.replace(/\((남|여)\)/, '');
      return { name: w.p.name, birth: w.p.birth, school: w.p.school, div: g.div.replace(/\((남|여)\)/, ''), cat: cat, award: w.award, date: w.date, refId: w.pid };
    }).concat((opt.manual || []).map(function (m) { return { name: s(m.name), birth: s(m.birth), school: s(m.school), div: s(m.div), cat: s(m.cat), award: s(m.award), date: s(m.date), edition: s(m.edition), year: s(m.year), awardDate: s(m.awardDate), refId: 'manual', nameEn: s(m.nameEn), schoolEn: s(m.schoolEn) }; }));
    var nos = numbers(L, '확인서', opt.date || today(L), list.length, opt.startNo), en1 = opt.en || {};
    return { pages: list.map(function (w, i) {
      var ed = w.edition || edition(cfg), ttl = w.edition ? '제' + w.edition + '회 이화경향음악콩쿠르' : title(cfg);
      var e = en1[w.refId] || {};
      var f = { 번호: en ? 'No. ' + nos[i].replace(/[^\d-]/g, '') : nos[i], 성명: w.name, 성명띄움: spaced(w.name), 생년월일: birthDot(w.birth), 당시소속: w.school, 대회명: ttl, 참가부문: w.div + ' 부문',
        입상순위: w.cat + ' ' + w.award, 경연일시: koDate(w.date), 시상일: koDate(w.awardDate || cfg.awardDate) };
      if (en) {
        var rankN = /(\d+)\s*위/.exec(w.award), joint = /공동/.test(w.award);
        f.영문성명 = s(e.nameEn || w.nameEn); f.영문소속 = s(e.schoolEn || w.schoolEn); f.영문생년월일 = birthDotSp(w.birth).replace(/\.$/, '');
        f.영문대회명 = ordinal(ed) + ' Ewha-KyungHyang Music Competition'; f.영문연도 = (w.year || (w.date || '').slice(0, 4));
        f.영문부문 = (DIV_EN[w.div] || w.div) + ' Division'; f.영문순위 = (joint ? 'Joint ' : '') + (rankN ? ordinal(rankN[1]) + ' Prize' : w.award) + ', ' + (CAT_EN[w.cat.replace(/·/g, '')] || w.cat);
        f.영문경연일 = enDate(w.date); f.영문발급일 = enDate(opt.date || today(L));
      }
      return { fields: f, register: { kind: en ? 'award_cert_en' : 'award_cert', series: '확인서', docNo: nos[i], title: (en ? '영문 수상증명서 — ' : '입상확인서 — ') + w.name + ' (' + w.div + ' ' + w.cat + ' ' + w.award + ')', target: w.name, refId: w.refId } };
    }) };
  }

  /* ========== 인력 서류 ========== */
  function imagesFor(st, opt) {
    var im = {}, sig = s(st.sign);
    if (/^data:image\/png;base64,/.test(sig)) im.서명 = { data: sig, w: 26, h: 9 };
    else if (/^drive:/.test(sig)) im.서명 = { drive: sig.slice(6), w: 26, h: 9 };
    return im;
  }
  function staffList(L, opt, kind) {
    var ids = opt.staffIds || [];
    return (L.staff || []).filter(function (x) { return x.kind === kind && !/삭제/.test(x.status) && (!ids.length || ids.indexOf(x.staffId) >= 0); });
  }
  function contract(L, opt) {
    var cfg = L.cfg || {};
    return { pages: staffList(L, opt, 'staff').map(function (st) {
      var ws = (L.work || []).filter(function (w) { return w.staffId === st.staffId; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
      var tot = 0;
      var rows = ws.map(function (w) {
        var m = K ? K.workMinutes(w, cfg, true) : { rest: 0, work: 0 }; tot += m.work;
        return { 날짜: dot(w.date), 요일: wd(w.date), 시업: s(w.planStart), 종업: s(w.planEnd), 휴게: m.rest ? m.rest + '분' : '없음', 근로시간: hm(m.work) };
      });
      var signedAt = s(st.contractAt).slice(0, 10);
      return { fields: { 성명: st.name, 생년월일: birthDot(st.birth), 근로자주소: s(st.address), 연락처: phoneFmt(st.phone), 계약시작: ws.length ? koDate(ws[0].date) : '', 계약종료: ws.length ? koDate(ws[ws.length - 1].date) : '',
          근무부서: s(cfg.workDept), 근무장소: s(cfg.workPlace), 업무: s(cfg.workDuty), 시급: won(st.wage || cfg.hourlyWage), 지급일: s(cfg.payDay),
          근로일수: String(ws.length), 총근로시간: hm(tot), 계약일: koDate(signedAt || opt.date || today(L)) },
        rows: rows, images: imagesFor(st), register: { kind: 'contract', series: '', docNo: '', title: '근로계약서 — ' + st.name, target: st.name, refId: st.staffId } };
    }) };
  }
  function pledge(L, opt) {
    return { pages: staffList(L, opt, 'staff').map(function (st) {
      return { fields: { 성명: st.name, 생년월일: birthDot(st.birth), 주소: s(st.address), 연락처: phoneFmt(st.phone), 서약일: koDate(s(st.pledgeAt).slice(0, 10) || opt.date || today(L)) },
        images: imagesFor(st), register: { kind: 'pledge', series: '', docNo: '', title: '정보보안 서약서 — ' + st.name, target: st.name, refId: st.staffId } };
    }) };
  }
  function judgeAgree(L, opt) {
    return { pages: staffList(L, opt, 'judge').map(function (st) {
      return { fields: { 성명: st.name, 소속: s(st.affiliation), 연락처: phoneFmt(st.phone), 동의일: koDate(s(st.agreeAt).slice(0, 10) || opt.date || today(L)),
          동의표시: st.agreeAt ? '■ 동의함     □ 동의하지 않음' : '□ 동의함     □ 동의하지 않음' },
        images: imagesFor(st), register: { kind: 'judge_agree', series: '', docNo: '', title: '심사위원 동의서 — ' + st.name, target: st.name, refId: st.staffId } };
    }) };
  }
  function photoAgree(L, opt) {
    var pm = pmap(L), pages = [];
    if (!opt.blankOnly) {
      (L.entries || []).filter(function (e) { return e.round === 'R2' && (!opt.groupKey || (pm[e.pid] || {}).groupKey === opt.groupKey || split((pm[e.pid] || {}).groupKey).div === opt.groupKey); })
        .map(function (e) { return pm[e.pid]; }).filter(Boolean)
        .sort(function (a, b) { return (a.groupKey + a.name).localeCompare(b.groupKey + b.name, 'ko'); })
        .forEach(function (p) {
          var g = split(p.groupKey);
          pages.push({ fields: { 구분: '경연자', 성명: p.name, 성별: /남/.test(p.gender) ? '남' : /여/.test(p.gender) ? '여' : '', 연락처: '', 참가부문: g.div.replace(/\((남|여)\)/, '') + ' ' + g.cat.replace(/\((남|여)\)/, ''), 학교: s(p.school), 학년: s(p.grade) } });
        });
    }
    for (var i = 0; i < (+opt.blank || 0); i++) pages.push({ fields: { 구분: opt.blankKind || '반주자', 성명: '', 성별: '', 연락처: '', 참가부문: '', 학교: '', 학년: '' } });
    return { pages: pages };
  }

  /* ========== 양식 없이 만드는 표 (결과·지급) ========== */
  function resultsSheet(L, opt) {
    var cfg = L.cfg || {}, round = opt.round || 'R2', R = (L.results || {})[round] || {}, used = {};
    var sheets = Object.keys(R).filter(function (gk) { return !opt.groupKey || gk === opt.groupKey || split(gk).div === opt.groupKey; }).map(function (gk) {
      var g = R[gk], ox = g.mode === 'ox';
      var head = ['순위', '경연순번', '성명', '학교', '학년'].concat(g.judges.map(function (j) { return j.letter; })).concat(ox ? ['O 개수', '결과'] : ['등위합', '유효합', '결과']);
      var rows = g.rows.slice().sort(function (a, b) { return (a.rank || 999) - (b.rank || 999) || (a.perfOrder || 999) - (b.perfOrder || 999); }).map(function (r) {
        var vals = r.values.map(function (v) { return v == null ? '' : ox ? (v > 0 ? 'O' : 'X') : v; });
        return [r.absent ? '' : (r.rank || ''), r.perfOrder == null ? '' : r.perfOrder, r.name, r.school, r.grade].concat(vals)
          .concat(r.absent ? (ox ? ['', '불참'] : ['', '', '불참']) : ox ? [r.score, r.pass === 'Y' ? '본선 진출' : ''] : [r.total, r.effective, r.award || '']);
      });
      var nm = (g.label + ' ' + rname(cfg, round)).slice(0, 90); while (used[nm]) nm += '+'; used[nm] = 1;
      return { name: nm, title: title(cfg) + ' ' + g.label + ' ' + rname(cfg, round) + ' 결과', head: head, rows: rows,
        note: '심사위원: ' + g.judges.map(function (j) { return j.letter + ' ' + j.name; }).join(', ') + (ox ? '' : '  ·  유효합 = 등위합에서 가장 높은·낮은 등위 하나씩 뺀 값 (낮을수록 상위)') };
    });
    return { generic: true, sheets: sheets };
  }
  function payJudge(L, opt) {
    var cfg = L.cfg || {}, tot = { a: 0, t: 0, l: 0, n: 0 };
    var rows = judgePeople(L, opt).map(function (P) {
      var st = staffOf(L, P.staffId), amt = dayList(L, P).reduce(function (a, x) { return a + (+x.fee || 0); }, 0), w = K.withholding(amt, 'judge', cfg);
      tot.a += w.amount; tot.t += w.tax; tot.l += w.local; tot.n += w.net;
      return [P.name, P.affiliation, daysText(L, P), P.days.length, w.amount, w.tax, w.local, w.net, s(st.bank), s(st.accountMask), s(st.holder), s(st.rrnMask), st.submittedAt ? '제출' : st.staffId ? '미제출' : '명단만'];
    });
    rows.push(['합계', '', '', '', tot.a, tot.t, tot.l, tot.n, '', '', '', '', '']);
    return { generic: true, sheets: [{ name: '심사비', title: title(cfg) + ' 심사비 지급명세', head: ['성명', '소속', '심사일', '일수', '심사비', '소득세', '지방소득세', '실지급액', '은행', '계좌(가림)', '예금주', '주민번호(가림)', '정보'],
      rows: rows, note: (s(cfg.judgeRates) ? '심사비 단가: ' + s(cfg.judgeRates).replace(/=(\d+)/g, function (m, v) { return ' ' + manwon(+v); }) : '1일 ' + won(cfg.judgeFee) + '원') + ' · 기타소득(일시적 인적용역) 필요경비 ' + cfg.taxJudgeExpense + '% 적용, 기타소득금액 ' + won(cfg.taxMinIncome) + '원 이하 과세하지 않음' }], fullKeys: { 9: 'accountEnc', 11: 'rrnEnc' }, refs: judgePeople(L, opt).map(function (P) { return staffOf(L, P.staffId); }) };
  }
  function payPrize(L, opt) {
    var cfg = L.cfg || {}, groups = {}, prizes = {}, tot = { a: 0, t: 0, l: 0, n: 0 }, refs = [];
    (L.groups || []).forEach(function (g) { groups[g.groupKey] = g; });
    (L.prizes || []).forEach(function (x) { prizes[x.pid] = x; });
    var rows = winners(L, opt).map(function (w) {
      var g = split(w.groupKey), pz = prizes[w.pid] || {}, amt = s(pz.amount) ? +pz.amount : K.prizeAmount(cfg, groups[w.groupKey], w.award), t = K.withholding(amt, 'prize', cfg);
      tot.a += t.amount; tot.t += t.tax; tot.l += t.local; tot.n += t.net; refs.push(pz);
      return [g.div, g.cat, w.award, w.p.name, birthDot(w.p.birth), t.amount, t.tax, t.local, t.net, s(pz.holder), s(pz.relation), s(pz.bank), s(pz.accountMask), s(pz.rrnMask), pz.submittedAt ? '제출' : '미제출', pz.attend ? pz.attend + (pz.attendCount ? ' ' + pz.attendCount + '명' : '') : ''];
    });
    rows.push(['합계', '', '', '', '', tot.a, tot.t, tot.l, tot.n, '', '', '', '', '', '', '']);
    return { generic: true, sheets: [{ name: '상금', title: title(cfg) + ' 상금 지급명세', head: ['부문', '구분', '순위', '성명', '생년월일', '상금', '소득세', '지방소득세', '실지급액', '예금주', '관계', '은행', '계좌(가림)', '주민번호(가림)', '정보', '시상식'],
      rows: rows, note: '기타소득(순위 경쟁 대회 상금) 필요경비 ' + cfg.taxPrizeExpense + '% 적용, 기타소득금액 ' + won(cfg.taxMinIncome) + '원 이하 과세하지 않음' }], fullKeys: { 12: 'accountEnc', 13: 'rrnEnc' }, refs: refs };
  }
  function payStaff(L, opt) {
    var cfg = L.cfg || {}, rows = [], refs = [], total = 0;
    staffList(L, opt, 'staff').forEach(function (st) {
      var ws = (L.work || []).filter(function (w) { return w.staffId === st.staffId; });
      K.staffPay(ws, cfg, st.wage).forEach(function (M) {
        total += M.pay; refs.push(st);
        rows.push([st.name, M.month.replace('-', '년 ') + '월', M.days, hm(M.minutes), hm(M.holiday), won(M.wage), M.pay, s(st.bank), s(st.accountMask), s(st.rrnMask)]);
      });
    });
    rows.push(['합계', '', '', '', '', '', total, '', '', '']);
    return { generic: true, sheets: [{ name: '인건비', title: title(cfg) + ' 진행요원 인건비', head: ['성명', '월', '근무일수', '근로시간', '주휴시간', '시급', '지급액(세전)', '은행', '계좌(가림)', '주민번호(가림)'],
      rows: rows, note: '실제 출퇴근 시각(없으면 예정)에서 휴게시간을 뺀 시간 · 주 15시간 이상 근무한 주는 주휴(근로시간×8/40) · 10원 단위 올림 · 4대보험·세금은 인사팀 처리' }], fullKeys: { 8: 'accountEnc', 9: 'rrnEnc' }, refs: refs };
  }

  /* ========== 진입점 ========== */
  function build(kind, L, opt) {
    opt = opt || {};
    var F = FORMS[kind];
    if (!F) throw new Error('알 수 없는 출력물: ' + kind);
    var base = common(L, opt), part;
    switch (kind) {
      case 'att_group': part = attGroup(L, opt); break;
      case 'att_perf': part = attPerf(L, opt); break;
      case 'score_ox': part = scoreOx(L, opt); break;
      case 'score_rank': part = scoreSheets(L, opt, false); break;
      case 'pieces': part = piecesSheet(L, opt); break;
      case 'staff_att': part = staffAtt(L, opt); break;
      case 'tt_public': part = timetable(L, opt, false); break;
      case 'tt_ops': part = timetable(L, opt, true); break;
      case 'tt_wall': part = timetableWall(L, opt); break;
      case 'gonggyeol': part = gonggyeol(L, opt); break;
      case 'judge_request': part = judgeRequest(L, opt); break;
      case 'judge_cert': part = judgeCert(L, opt); break;
      case 'award_cert': part = awardCert(L, opt, false); break;
      case 'award_cert_en': part = awardCert(L, opt, true); break;
      case 'contract': part = contract(L, opt); break;
      case 'pledge': part = pledge(L, opt); break;
      case 'judge_agree': part = judgeAgree(L, opt); break;
      case 'photo_agree': part = photoAgree(L, opt); break;
      case 'results': part = resultsSheet(L, opt); break;
      case 'pay_judge': part = payJudge(L, opt); break;
      case 'pay_prize': part = payPrize(L, opt); break;
      case 'pay_staff': part = payStaff(L, opt); break;
    }
    // 관리자가 화면에서 고친 값 덮어쓰기 (pages[i].fields)
    if (opt.edits && part.pages) Object.keys(opt.edits).forEach(function (i) { var pg = part.pages[+i]; if (pg) { var e = opt.edits[i]; for (var k in e) pg.fields[k] = e[k]; if (pg.register && e.문서번호 != null) pg.register.docNo = e.문서번호; if (pg.register && e.번호 != null) pg.register.docNo = e.번호; } });
    var count = part.pages ? part.pages.length : (part.sheets || []).length;
    var cfg = L.cfg || {}, stamp = (opt.date || today(L)).replace(/-/g, '').slice(2);
    var out = { key: kind, cat: F.cat, type: F.type, lines: !!F.lines, generic: !!F.generic || !!part.generic, file: F.file || '', name: F.name, title: title(cfg) + ' ' + F.name + (opt.round ? ' (' + rname(cfg, opt.round) + ')' : '') + ' ' + stamp,
      fields: base, pages: part.pages, sheets: part.sheets, headers: part.headers, warn: part.warn || [], count: count, fullKeys: part.fullKeys, refs: part.refs };
    if (F.type === 'doc' && /^(judge_cert|award_cert|award_cert_en|gonggyeol|judge_request|contract|pledge|judge_agree)$/.test(kind)) {
      var cf = cfg.sealOverlay === 'N' ? { w: +cfg.sealSizeMm || 21, h: +cfg.sealSizeMm || 21 } : { w: +cfg.sealSizeMm || 21, h: +cfg.sealSizeMm || 21, overlay: true, dx: +cfg.sealDxMm || -14, dy: +cfg.sealDyMm || -6 };
      if (kind === 'contract' && cf.overlay) { cf.w = cf.h = Math.round(cf.w * 0.68); cf.dx = -10; cf.dy = -9; }
      out.seal = cf;   // 직인 그림은 서버(드라이브) 또는 브라우저가 붙임
    }
    out.register = (part.pages || []).map(function (pg, i) { var f = {}, k; for (k in base) f[k] = base[k]; for (k in pg.fields) f[k] = pg.fields[k]; if (pg.rows && pg.rows.length) f.__rows = pg.rows; return pg.register ? Object.assign({ pageIndex: i, fields: f }, pg.register) : null; }).filter(Boolean);
    return out;
  }

  // 표(시트)를 엑셀용 2차원 배열로 (양식 없는 경우·데모)
  function toAOA(data) {
    return (data.sheets || []).map(function (sh) {
      if (sh.head) return { name: sh.name, aoa: [[sh.title || data.title]].concat(sh.note ? [[sh.note]] : []).concat([[]]).concat([sh.head]).concat(sh.rows) };
      var f = {}; for (var k in data.fields) f[k] = data.fields[k]; for (k in sh.fields) f[k] = sh.fields[k];
      var head = (data.headers || []).map(function (h) { return h[0]; });
      var info = [f.부문, f.구분, f.조, f.날짜, f.시작시간 ? f.시작시간 + '~' + f.종료시간 : '', f.심사위원 ? '심사위원 ' + f.심사위원 : '', f.쪽].filter(Boolean).join('  ');
      return { name: sh.name, aoa: [[f.대회명 + ' ' + (f.라운드 && String(data.name).indexOf(f.라운드) !== 0 ? f.라운드 + ' ' : '') + data.name], [info], []].concat([head]).concat(sh.rows.map(function (r) { return (data.headers || []).map(function (h) { return h[1] ? r[h[1]] || '' : ''; }); })) };
    });
  }

  return { FORMS: FORMS, build: build, toAOA: toAOA, judgeDayPages: judgeDayPages, pageRows: pageRows, nextNo: nextNo, numbers: numbers, fmtNo: fmtNo, period: period, common: common, winners: winners,
    koDate: koDate, koDateW: koDateW, md: md, mdw: mdw, dot: dot, birthDot: birthDot, fullBirth: fullBirth, spaced: spaced, won: won, hm: hm, phoneFmt: phoneFmt,
    setDeps: function (k, t) { K = k || K; T = t || T; } };
})();
if (typeof module !== 'undefined') module.exports = FM;
