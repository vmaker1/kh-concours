/* 워드(.docx) 양식 채우기 — 데모·비상용 출력과 미리보기에 씀
 * (실제 운영에서는 구글 문서 양식을 Apps Script가 채웁니다. 칸 규칙은 똑같아요)
 *   {{이름}}      한 번 채우는 칸
 *   {{줄.이름}}   표에서 그 줄을 사람·조 수만큼 반복
 *   {{직인}} {{서명}}  그림 자리 (없으면 지워짐)
 * data = { fields:{…}, pages:[{fields:{…}, rows:[{…}], images:{서명:{…}}}], images:{직인:{data:base64, w:mm, h:mm, overlay:true, dx:mm, dy:mm}} } */
var DF = (function () {
  'use strict';
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var NS = 'xmlns:w="' + W + '" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  var env = {
    JSZip: typeof JSZip !== 'undefined' ? JSZip : null,
    DOMParser: typeof DOMParser !== 'undefined' ? DOMParser : null,
    XMLSerializer: typeof XMLSerializer !== 'undefined' ? XMLSerializer : null
  };
  var TOKEN = /\{\{([^{}]+)\}\}/g;
  var IMAGE_KEYS = ['직인', '서명'];

  function kids(n) { var o = []; for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) o.push(c); return o; }
  function all(n, local) { return Array.prototype.slice.call(n.getElementsByTagNameNS(W, local)); }
  function text(t) { var s = ''; for (var c = t.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) s += c.data; return s; }
  function setText(t, s) {
    while (t.firstChild) t.removeChild(t.firstChild);
    t.appendChild(t.ownerDocument.createTextNode(s));
    t.setAttribute('xml:space', 'preserve');
  }
  function isOpen(s) { var a = s.lastIndexOf('{{'), b = s.lastIndexOf('}}'); return a >= 0 && a > b; }

  /* 워드가 한 칸({{성명}})을 여러 조각으로 쪼개 저장한 경우 한 조각으로 합침 */
  function mergeTokens(p) {
    var ts = all(p, 't');
    for (var i = 0; i < ts.length; i++) {
      var s = text(ts[i]), j = i + 1;
      while (j < ts.length && (isOpen(s) || (/\{$/.test(s) && /^\{/.test(text(ts[j]))))) {
        s += text(ts[j]); setText(ts[j], ''); j++;
      }
      if (j > i + 1) setText(ts[i], s);
    }
  }

  function fieldVal(fields, k) { var v = fields[k]; return v == null ? '' : String(v); }

  function replaceIn(scope, fields, imgFn) {
    all(scope, 't').forEach(function (t) {
      var s = text(t);
      if (s.indexOf('{{') < 0) return;
      var imgs = [];
      s = s.replace(TOKEN, function (m, k) {
        k = k.trim();
        if (IMAGE_KEYS.indexOf(k) >= 0) { imgs.push(k); return ''; }
        return fieldVal(fields, k);
      });
      setText(t, s);
      if (s.indexOf('\n') >= 0) splitLines(t);
      imgs.forEach(function (k) { if (imgFn) imgFn(t, k); });
    });
  }
  // 줄바꿈이 든 값 → <w:t>a</w:t><w:br/><w:t>b</w:t>
  function splitLines(t) {
    var parts = text(t).split('\n'), doc = t.ownerDocument, after = t.nextSibling, run = t.parentNode;
    setText(t, parts[0]);
    for (var i = 1; i < parts.length; i++) {
      var br = doc.createElementNS(W, 'w:br'); run.insertBefore(br, after);
      var nt = doc.createElementNS(W, 'w:t'); nt.setAttribute('xml:space', 'preserve'); nt.appendChild(doc.createTextNode(parts[i])); run.insertBefore(nt, after);
    }
  }

  function expandRows(scope, rows) {
    all(scope, 'tr').forEach(function (tr) {
      var s = all(tr, 't').map(text).join('');
      if (s.indexOf('{{줄.') < 0) return;
      var parent = tr.parentNode;
      (rows || []).forEach(function (row) {
        var c = tr.cloneNode(true);
        all(c, 't').forEach(function (t) {
          var v = text(t);
          if (v.indexOf('{{줄.') < 0) return;
          setText(t, v.replace(/\{\{줄\.([^{}]+)\}\}/g, function (m, k) { return fieldVal(row, k.trim()); }));
          if (text(t).indexOf('\n') >= 0) splitLines(t);
        });
        parent.insertBefore(c, tr);
      });
      parent.removeChild(tr);
    });
  }

  function emu(mm) { return Math.round(mm * 36000); }
  function drawingXml(img, rid, id) {
    var cx = emu(img.w || 20), cy = emu(img.h || 20);
    var graphic = '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="kc' + id + '.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    var inner = img.overlay
      ? '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="' + (251659264 + id) + '" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="character"><wp:posOffset>' + emu(img.dx || 0) + '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="line"><wp:posOffset>' + emu(img.dy || 0) + '</wp:posOffset></wp:positionV><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + id + '" name="kc' + id + '"/><wp:cNvGraphicFramePr/>' + graphic + '</wp:anchor>'
      : '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="kc' + id + '"/><wp:cNvGraphicFramePr/>' + graphic + '</wp:inline>';
    return '<w:r ' + NS + '><w:drawing>' + inner + '</w:drawing></w:r>';
  }

  function b64ToBytes(b64) {
    b64 = String(b64).replace(/^data:[^,]+,/, '');
    if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function fill(buf, data, opt) {
    opt = opt || {};
    var Z = env.JSZip, DP = env.DOMParser, XS = env.XMLSerializer;
    var zip, media = {}, nextId = 9000;
    var pages = data.pages && data.pages.length ? data.pages : [{}];
    return Z.loadAsync(buf).then(function (z) {
      zip = z;
      return Promise.all([zip.file('word/document.xml').async('string'), zip.file('word/_rels/document.xml.rels').async('string'), zip.file('[Content_Types].xml').async('string')]);
    }).then(function (res) {
      var doc = new DP().parseFromString(res[0], 'application/xml');
      var rels = new DP().parseFromString(res[1], 'application/xml');
      var ctypes = res[2];
      var body = doc.getElementsByTagNameNS(W, 'body')[0];
      var ch = kids(body), sect = ch.length && ch[ch.length - 1].localName === 'sectPr' ? ch[ch.length - 1] : null;
      var tpl = ch.filter(function (n) { return n !== sect; });
      tpl.forEach(function (n) { mergeTokensDeep(n); body.removeChild(n); });

      function imageRid(key, img) {
        var mk = key + '|' + (img.data || '').length + '|' + (img.data || '').slice(-40);
        if (media[mk]) return media[mk];
        var n = Object.keys(media).length + 1, rid = 'rIdKc' + n, path = 'media/kcimg' + n + '.png';
        zip.file('word/' + path, b64ToBytes(img.data));
        var r = rels.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship');
        r.setAttribute('Id', rid); r.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'); r.setAttribute('Target', path);
        rels.documentElement.appendChild(r);
        media[mk] = rid;
        return rid;
      }
      function imgFn(images) {
        return function (t, key) {
          var img = images[key];
          if (!img || !img.data) return;
          var rid = imageRid(key, img), id = ++nextId;
          var frag = new DP().parseFromString(drawingXml(img, rid, id), 'application/xml').documentElement;
          var run = t.parentNode;
          run.parentNode.insertBefore(doc.importNode(frag, true), run.nextSibling);
        };
      }

      pages.forEach(function (pg, i) {
        var f = {}, k;
        for (k in (data.fields || {})) f[k] = data.fields[k];
        for (k in (pg.fields || {})) f[k] = pg.fields[k];
        var images = {};
        for (k in (data.images || {})) images[k] = data.images[k];
        for (k in (pg.images || {})) images[k] = pg.images[k];
        var clones = tpl.map(function (n) { var c = n.cloneNode(true); body.insertBefore(c, sect); return c; });
        clones.forEach(function (c) { expandRows(c, pg.rows || data.rows || []); });
        clones.forEach(function (c) { replaceIn(c, f, imgFn(images)); });
        if (i > 0) pageBreakBefore(doc, body, clones[0]);
      });
      if (ctypes.indexOf('Extension="png"') < 0) ctypes = ctypes.replace('<Types ', '<Types ').replace(/(<Types[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>');
      zip.file('word/document.xml', new XS().serializeToString(doc));
      zip.file('word/_rels/document.xml.rels', new XS().serializeToString(rels));
      zip.file('[Content_Types].xml', ctypes);
      // 머리말·꼬리말의 칸
      var hf = Object.keys(zip.files).filter(function (n) { return /^word\/(header|footer)\d*\.xml$/.test(n); });
      return Promise.all(hf.map(function (n) {
        return zip.file(n).async('string').then(function (x) {
          var d = new DP().parseFromString(x, 'application/xml');
          all(d, 'p').forEach(mergeTokens);
          var hf0 = {}, k0; for (k0 in (data.fields || {})) hf0[k0] = data.fields[k0]; for (k0 in ((pages[0] || {}).fields || {})) if (!(k0 in hf0)) hf0[k0] = pages[0].fields[k0];
          replaceIn(d.documentElement, hf0, null);
          zip.file(n, new XS().serializeToString(d));
        });
      }));
    }).then(function () {
      return zip.generateAsync({ compression: 'DEFLATE', type: opt.type || (typeof Blob !== 'undefined' && typeof window !== 'undefined' ? 'blob' : 'uint8array'), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    });
  }
  function mergeTokensDeep(n) { if (n.localName === 'p') mergeTokens(n); all(n, 'p').forEach(mergeTokens); }
  function pageBreakBefore(doc, body, first) {
    var run = doc.createElementNS(W, 'w:r'), br = doc.createElementNS(W, 'w:br');
    br.setAttribute('w:type', 'page'); run.appendChild(br);
    if (first && first.localName === 'p') {
      var ppr = kids(first).filter(function (x) { return x.localName === 'pPr'; })[0];
      first.insertBefore(run, ppr ? ppr.nextSibling : first.firstChild);
    } else {
      var p = doc.createElementNS(W, 'w:p'); p.appendChild(run); body.insertBefore(p, first);
    }
  }

  /* 템플릿 안에 들어 있는 칸 이름 목록 (양식 안내용) */
  function fieldsOf(buf) {
    return env.JSZip.loadAsync(buf).then(function (z) {
      var names = Object.keys(z.files).filter(function (n) { return /^word\/(document|header\d*|footer\d*)\.xml$/.test(n); });
      return Promise.all(names.map(function (n) { return z.file(n).async('string'); }));
    }).then(function (xs) {
      var seen = {}, out = [];
      xs.forEach(function (x) {
        var d = new env.DOMParser().parseFromString(x, 'application/xml');
        all(d, 'p').forEach(function (p) { mergeTokens(p); var s = all(p, 't').map(text).join(''); var m; TOKEN.lastIndex = 0; while ((m = TOKEN.exec(s))) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); } } });
      });
      return out;
    });
  }

  /* 줄 단위 워드 (벽보용 시간표): 기본 양식의 용지·여백만 쓰고 본문은 새로 씀 */
  function xe(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function lrun(text, size, bold, color) {
    return '<w:r><w:rPr><w:rFonts w:ascii="Nanum Gothic" w:eastAsia="Nanum Gothic" w:hAnsi="Nanum Gothic"/>' + (bold ? '<w:b/>' : '') + '<w:color w:val="' + (color || '000000') + '"/><w:sz w:val="' + Math.round(size * 2) + '"/><w:szCs w:val="' + Math.round(size * 2) + '"/></w:rPr><w:t xml:space="preserve">' + xe(text) + '</w:t></w:r>';
  }
  function lpara(text, size, bold, color, pb) { return '<w:p><w:pPr>' + (pb ? '<w:pageBreakBefore/>' : '') + '<w:spacing w:before="0" w:after="80"/></w:pPr>' + (text ? lrun(text, size, bold, color) : '') + '</w:p>'; }
  function linesBody(pages) {
    var SZ = { bm: 10, title: 26, date: 20, group: 22, per: 16, row: 20 }, W = [4500, 3100, 1800], out = '';
    var NIL = '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>';
    (pages || []).forEach(function (pg, pi) {
      var buf = [];
      var flush = function () {
        if (!buf.length) return;
        out += '<w:tbl><w:tblPr><w:tblW w:w="' + W.reduce(function (a, b) { return a + b; }, 0) + '" w:type="dxa"/><w:tblBorders>' + NIL + '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + W.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>' +
          buf.map(function (l) { return '<w:tr>' + l.c.map(function (c, i) { return '<w:tc><w:tcPr><w:tcW w:w="' + W[i] + '" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>' + (c ? lrun(c, SZ.row, l.k === 'lunch') : '') + '</w:p></w:tc>'; }).join('') + '</w:tr>'; }).join('') + '</w:tbl>';
        buf = [];
      };
      out += lpara((pg.fields || {}).날짜 || '', SZ.bm, false, '888888', pi > 0);
      (pg.lines || []).forEach(function (l) {
        if (l.k === 'session' || l.k === 'lunch') { buf.push(l); return; }
        flush();
        if (l.k === 'gap') out += lpara('', SZ.row);
        else if (l.k === 'title') out += lpara(l.t, SZ.title, true);
        else if (l.k === 'date') out += lpara(l.t, SZ.date, false);
        else if (l.k === 'group') out += lpara(l.t, SZ.group, true);
        else if (l.k === 'per') out += lpara(l.t, SZ.per, false, '333333');
      });
      flush();
    });
    return out;
  }
  function linesDocx(buf, data, opt) {
    opt = opt || {};
    var JSZip = env.JSZip;
    return JSZip.loadAsync(buf).then(function (zip) {
      return zip.file('word/document.xml').async('string').then(function (xml) {
        var sect = (/<w:sectPr[\s\S]*?<\/w:sectPr>(?![\s\S]*<w:sectPr)/.exec(xml) || [''])[0];
        xml = xml.replace(/<w:body>[\s\S]*<\/w:body>/, function () { return '<w:body>' + linesBody(data.pages) + sect + '</w:body>'; });
        zip.file('word/document.xml', xml);
        return zip.generateAsync({ compression: 'DEFLATE', type: opt.type || (typeof Blob !== 'undefined' && typeof window !== 'undefined' ? 'blob' : 'uint8array'), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      });
    });
  }

  return { fill: fill, fieldsOf: fieldsOf, env: env, linesDocx: linesDocx, linesBody: linesBody };
})();
if (typeof module !== 'undefined') module.exports = DF;
