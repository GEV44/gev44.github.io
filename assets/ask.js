/* Ask your documents: in-browser retrieval (BM25) + extractive cited answers.
   No network, no dependencies. Works in browsers (window.Ask) and node (require). */
(function (root) {
  'use strict';

  var STOP = ('a an and are as at be been but by can could did do does doing for from had has have how i if in into is it its just may me might my of on or our out shall she should so some such than that the their them then there these they this those to too us was we were what when where which who whom why will with would you your about after again all also am any because before being between both each few get got here him her his more most much no nor not now only other over own same up very while tell please give need want know s t').split(/\s+/);
  var STOPSET = {};
  STOP.forEach(function (w) { if (w) STOPSET[w] = 1; });

  // Words that mean roughly the same thing map to the first word of the group.
  var GROUPS = [
    ['refund', 'reimburse', 'repay', 'moneyback', 'reimbursement'],
    ['return', 'sendback'],
    ['cancel', 'cancellation', 'rebook', 'reschedule', 'postpone'],
    ['price', 'cost', 'fee', 'charge', 'pay', 'payment', 'paying'],
    ['child', 'kid', 'children', 'kids', 'pediatric', 'paediatric', 'minor', 'toddler'],
    ['leave', 'vacation', 'holiday', 'pto', 'timeoff', 'absence'],
    ['remote', 'wfh', 'telework', 'telecommute', 'home'],
    ['warranty', 'guarantee', 'guaranteed'],
    ['delivery', 'shipping', 'ship', 'shipment', 'dispatch', 'courier', 'parcel', 'package'],
    ['broken', 'damaged', 'damage', 'faulty', 'defective', 'defect', 'malfunction'],
    ['pain', 'hurt', 'ache', 'toothache', 'sore'],
    ['emergency', 'urgent', 'urgently'],
    ['sick', 'ill', 'illness', 'unwell', 'sickness'],
    ['parental', 'maternity', 'paternity', 'baby', 'newborn', 'adoption'],
    ['equipment', 'laptop', 'computer', 'monitor', 'desk', 'chair', 'device'],
    ['insurance', 'insurer', 'coverage', 'policyholder'],
    ['hours', 'opening', 'open', 'schedule', 'closing', 'close'],
    ['abroad', 'international', 'overseas', 'foreign'],
    ['late', 'delay', 'delayed', 'overdue'],
    ['whiten', 'whitening', 'bleach', 'bleaching'],
    ['anxious', 'anxiety', 'nervous', 'afraid', 'fear', 'phobia'],
    ['xray', 'radiograph', 'radiation', 'scan'],
    ['fired', 'dismissal', 'terminate', 'termination', 'resign', 'resignation', 'notice'],
    ['receipt', 'invoice', 'proof']
  ];

  function rawStem(w) {
    if (w.length <= 3) return w;
    if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
    else if (/sses$/.test(w)) w = w.slice(0, -2);
    else if (/(ches|shes|xes|zes)$/.test(w)) w = w.slice(0, -2);
    else if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    if (w.length > 6 && /ations?$/.test(w)) w = w.replace(/ations?$/, '');
    else if (w.length > 6 && /ments?$/.test(w)) w = w.replace(/ments?$/, '');
    else if (w.length > 5 && /ing$/.test(w)) w = w.slice(0, -3);
    else if (w.length > 5 && /ed$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 5 && /ly$/.test(w)) w = w.slice(0, -2);
    if (w.length > 4 && /e$/.test(w)) w = w.slice(0, -1);
    if (w.length > 3 && /([^aeious])\1$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    return w;
  }

  var CANON = {};
  GROUPS.forEach(function (g) {
    var head = rawStem(g[0]);
    g.forEach(function (w) { CANON[rawStem(w)] = head; });
  });

  function stem(w) {
    var s = rawStem(w);
    return CANON[s] || s;
  }

  function tokenize(text, keepStops) {
    var out = [];
    var m = String(text).toLowerCase().replace(/[’']/g, '').match(/[a-z0-9À-ɏ]+/g) || [];
    for (var i = 0; i < m.length; i++) {
      var w = m[i];
      if (!keepStops && STOPSET[w]) continue;
      if (w.length < 2 && !/\d/.test(w)) continue;
      out.push(stem(w));
    }
    return out;
  }

  function wordCount(s) { return (String(s).match(/\S+/g) || []).length; }

  function splitSentences(text) {
    var parts = String(text).replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [];
    return parts.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function isHeadingLine(line, nextBlank) {
    var t = line.trim();
    if (/^#{1,6}\s+\S/.test(t)) return t.replace(/^#{1,6}\s+/, '').trim();
    if (nextBlank && t.length <= 70 && wordCount(t) <= 9 && !/[.!?,;:]$/.test(t) && /^[A-Z0-9]/.test(t) && !/^[-*•]/.test(t)) return t;
    return null;
  }

  // Split a document into chunks of roughly 80-150 words that never cross a heading.
  function chunkDocument(text, opts) {
    opts = opts || {};
    var minW = opts.min || 80, maxW = opts.max || 150;
    var docName = opts.docName || '';
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var sections = [], cur = { heading: opts.defaultHeading || docName || 'Document', paras: [] }, buf = [];
    function flushPara() {
      if (buf.length) { cur.paras.push(buf.join(' ').replace(/\s+/g, ' ').trim()); buf = []; }
    }
    function pushSection() {
      flushPara();
      if (cur.paras.length) sections.push(cur);
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) { flushPara(); continue; }
      var prevBlank = i === 0 || !lines[i - 1].trim();
      var nextBlank = i + 1 >= lines.length || !lines[i + 1].trim();
      var h = prevBlank ? isHeadingLine(line, nextBlank) : null;
      if (h) { pushSection(); cur = { heading: h, paras: [] }; continue; }
      buf.push(line.trim());
    }
    pushSection();

    var chunks = [];
    sections.forEach(function (sec) {
      var units = [];
      sec.paras.forEach(function (p) {
        if (wordCount(p) <= maxW) { units.push(p); return; }
        var cur2 = '';
        splitSentences(p).forEach(function (s) {
          if (cur2 && wordCount(cur2 + ' ' + s) > maxW) { units.push(cur2); cur2 = s; }
          else cur2 = cur2 ? cur2 + ' ' + s : s;
        });
        if (cur2) units.push(cur2);
      });
      var acc = '';
      var secChunks = [];
      units.forEach(function (u) {
        if (acc && wordCount(acc + ' ' + u) > maxW && wordCount(acc) >= minW) { secChunks.push(acc); acc = u; }
        else acc = acc ? acc + '\n\n' + u : u;
      });
      if (acc) secChunks.push(acc);
      if (secChunks.length > 1 && wordCount(secChunks[secChunks.length - 1]) < 35) {
        var last = secChunks.pop();
        secChunks[secChunks.length - 1] += '\n\n' + last;
      }
      secChunks.forEach(function (t, k) {
        chunks.push({
          heading: sec.heading + (secChunks.length > 1 ? ' (part ' + (k + 1) + ')' : ''),
          section: sec.heading,
          text: t,
          doc: docName
        });
      });
    });
    chunks.forEach(function (c, i) { c.id = i; });
    return chunks;
  }

  function buildIndex(chunks, k1, b) {
    k1 = k1 || 1.5; b = (b === undefined ? 0.75 : b);
    var docs = chunks.map(function (c) {
      // heading is kept as context and counted twice so titles help ranking
      var toks = tokenize(c.heading + ' ' + c.heading + ' ' + c.text);
      var tf = {};
      toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      return { tf: tf, len: toks.length };
    });
    var N = docs.length, df = {}, total = 0;
    docs.forEach(function (d) {
      total += d.len;
      Object.keys(d.tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
    });
    return { chunks: chunks, docs: docs, df: df, N: N, avgdl: total / Math.max(N, 1), k1: k1, b: b };
  }

  function idf(index, term) {
    var n = index.df[term] || 0;
    return Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
  }

  function unique(a) {
    var seen = {}, out = [];
    a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function search(index, query, k) {
    var qt = unique(tokenize(query));
    var res = [];
    index.docs.forEach(function (d, i) {
      var s = 0;
      qt.forEach(function (t) {
        var f = d.tf[t];
        if (!f) return;
        s += idf(index, t) * (f * (index.k1 + 1)) / (f + index.k1 * (1 - index.b + index.b * d.len / index.avgdl));
      });
      if (s > 0) res.push({ chunk: index.chunks[i], score: s, i: i });
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res.slice(0, k || 5);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Wrap words whose stem matches a query term in <mark>. Text is escaped first.
  function highlight(text, terms) {
    var set = {};
    terms.forEach(function (t) { set[t] = 1; });
    var out = '', last = 0, re = /[A-Za-z0-9À-ɏ]+(?:[’'][A-Za-z]+)?/g, m;
    while ((m = re.exec(text))) {
      var w = m[0].toLowerCase().replace(/[’']/g, '');
      if (!STOPSET[w] && set[stem(w)]) {
        out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
        last = m.index + m[0].length;
      }
    }
    return out + esc(text.slice(last));
  }

  var LOW_COVERAGE = 0.4;

  function answer(index, query, opts) {
    opts = opts || {};
    var qt = unique(tokenize(query));
    var out = { query: query, terms: qt, sentences: [], sources: [], confident: false, coverage: 0, topScore: 0 };
    if (!qt.length || !index.N) return out;
    var hits = search(index, query, 5);
    if (!hits.length) return out;
    var top = hits[0];
    out.topScore = top.score;
    out.results = hits;

    var topToks = index.docs[top.i].tf;
    var unknownIdf = Math.log(1 + (index.N + 0.5) / 0.5);
    var den = 0, num = 0;
    qt.forEach(function (t) {
      var w = index.df[t] ? idf(index, t) : unknownIdf;
      den += w;
      if (topToks[t]) num += w;
    });
    out.coverage = den ? num / den : 0;
    out.confident = out.coverage >= LOW_COVERAGE && top.score >= 1.5;
    if (!out.confident) return out;

    // rank sentences from the top chunks
    var cand = [];
    hits.slice(0, 3).forEach(function (h, rank) {
      splitSentences(h.chunk.text.replace(/\n+/g, ' ')).forEach(function (s, pos) {
        var st = unique(tokenize(s)), sc = 0, hit = [];
        st.forEach(function (t) {
          if (qt.indexOf(t) >= 0) { sc += idf(index, t); hit.push(t); }
        });
        if (sc > 0 && wordCount(s) >= 4) {
          cand.push({ text: s, score: sc * (1 - rank * 0.12) * (pos === 0 ? 1.05 : 1), chunk: h.chunk, hit: hit, rank: rank, pos: pos });
        }
      });
    });
    cand.sort(function (a, b) { return b.score - a.score; });
    if (!cand.length) { out.confident = false; return out; }
    var chosen = [cand[0]], covered = {};
    cand[0].hit.forEach(function (t) { covered[t] = 1; });
    for (var i = 1; i < cand.length && chosen.length < (opts.maxSentences || 3); i++) {
      var c = cand[i];
      var fresh = c.hit.filter(function (t) { return !covered[t]; }).length;
      if (c.score >= cand[0].score * 0.5 && fresh > 0) {
        chosen.push(c);
        c.hit.forEach(function (t) { covered[t] = 1; });
      }
    }
    // order: by chunk rank then position, so the text reads in document order
    chosen.sort(function (a, b) { return a.rank - b.rank || a.pos - b.pos; });
    var cites = [];
    chosen.forEach(function (c) {
      var n = cites.indexOf(c.chunk.id);
      if (n < 0) { cites.push(c.chunk.id); n = cites.length - 1; }
      out.sentences.push({ text: c.text, cite: n + 1, chunkId: c.chunk.id });
    });
    cites.forEach(function (id, i) {
      var ch = index.chunks[id];
      out.sources.push({ n: i + 1, heading: ch.heading, doc: ch.doc, text: ch.text, html: highlight(ch.text, qt) });
    });
    return out;
  }

  var api = {
    stem: stem, tokenize: tokenize, chunkDocument: chunkDocument, buildIndex: buildIndex,
    search: search, answer: answer, highlight: highlight, esc: esc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Ask = api;
})(typeof window !== 'undefined' ? window : this);
