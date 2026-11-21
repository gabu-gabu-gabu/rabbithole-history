/* The rules of the rabbit hole, kept apart from the page so they can be tested on their own
   (WebsiteTests/unit.test.js). They match the app's FactStore: see CLAUDE.md, "Facts data". */
(function (root) {
  "use strict";

  /* Closest categories first, as in the app (FactCategory.related). */
  const RELATED = {
    food: ["culture", "science", "politics"], art: ["literature", "culture", "philosophy"],
    war: ["politics", "science", "culture"], literature: ["art", "philosophy", "culture"],
    science: ["philosophy", "war", "food"], politics: ["war", "philosophy", "culture"],
    philosophy: ["literature", "science", "politics"], culture: ["food", "art", "literature"],
  };

  function shuffle(list, random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* From a list ranked best first (ties share a `rank`), the best fact and then the next
     best, preferring a different source article among equally ranked ones. */
  function pair(ranked) {
    if (ranked.length < 2) return ranked.map((r) => r.fact);
    const first = ranked[0];
    const rest = ranked.slice(1);
    const equals = rest.filter((r) => r.rank === rest[0].rank);
    const second = equals.find((r) => r.fact.source_url !== first.fact.source_url) || rest[0];
    return [first.fact, second.fact];
  }

  /* Two facts to open with: the shallowest first (depth 1 where the section has them), and
     at the same depth, facts never read before come first. Same order as the app. */
  function openingPair(facts, isRead, random) {
    const ranked = shuffle(facts, random || Math.random).map((fact) => {
      const seen = isRead && isRead(fact.id) ? 1 : 0;
      return { fact, depth: fact.depth, seen, rank: fact.depth + "|" + seen };
    });
    ranked.sort((a, b) => a.depth - b.depth || a.seen - b.seen);
    return pair(ranked);
  }

  /* Every fact not yet shown in this hole, best follow-up to `from` first:
     1 shares a tag and is one level deeper, 2 shares a tag, 3 one level deeper, 4 the rest;
     then more shared tags, then depth closest to one level deeper, then chance. */
  function rankNext(facts, from, shown, random) {
    const want = from.depth + 1;
    const tags = new Set(from.tags);
    const ranked = shuffle(facts.filter((f) => !shown.has(f.id)), random || Math.random).map((fact) => {
      const shared = fact.tags.filter((t) => tags.has(t)).length;
      const deeper = fact.depth === want;
      const group = shared && deeper ? 1 : shared ? 2 : deeper ? 3 : 4;
      const dist = Math.abs(fact.depth - want);
      return { fact, group, shared, dist, rank: group + "|" + shared + "|" + dist };
    });
    ranked.sort((a, b) => a.group - b.group || b.shared - a.shared || a.dist - b.dist);
    return ranked;
  }

  function nextPair(facts, from, shown, random) {
    return pair(rankNext(facts, from, shown, random));
  }

  /* The related categories that have facts for this place and era. */
  function relatedWithFacts(category, counts) {
    return (RELATED[category] || []).filter((c) => counts && counts[c]);
  }

  /* SVG path data for one outline: a flat list x, y, x, y… in map units (0 to 1 across). */
  function pathData(flat) {
    let d = "";
    for (let i = 0; i + 1 < flat.length; i += 2) {
      d += (i ? "L" : "M") + (flat[i] * 1000).toFixed(1) + " " + (flat[i + 1] * 1000).toFixed(1);
    }
    return d;
  }

  /* The other eras in which this region has facts, in time order. */
  function erasWithFacts(region, eras, counts) {
    return eras.filter((e) => counts[region + "|" + e.id]);
  }

  /* A zoomed view of the map (x, y, width, height in the 1000-wide drawing) around a point,
     kept inside the drawing. */
  function zoomBox(x, y, factor, width, height) {
    const w = width / factor;
    const h = height / factor;
    const left = Math.min(Math.max(x - w / 2, 0), width - w);
    const top = Math.min(Math.max(y - h / 2, 0), height - h);
    return [left, top, w, h];
  }

  /* Cuts a fact's text into pieces, marking the names that have a card. `mentions` is a list
     of [exact words, card id]. As in the app: the longest name claims its place first (so
     "Mahmud of Ghazni" is his card, not the city's), each name is marked once, and a name
     that sits inside a claimed one is looked for again further on. */
  function spans(text, mentions) {
    const claimed = [];
    const order = (mentions || []).map((m, i) => ({ words: m[0], entry: m[1], i }))
      .filter((m) => m.words)
      .sort((a, b) => [...b.words].length - [...a.words].length || a.i - b.i);
    for (const m of order) {
      let from = 0;
      for (;;) {
        const at = text.indexOf(m.words, from);
        if (at < 0) break;
        const end = at + m.words.length;
        if (!claimed.some((c) => at < c.end && end > c.start)) { claimed.push({ start: at, end, entry: m.entry }); break; }
        from = at + 1;
      }
    }
    claimed.sort((a, b) => a.start - b.start);
    const pieces = [];
    let cursor = 0;
    for (const c of claimed) {
      if (c.start > cursor) pieces.push({ text: text.slice(cursor, c.start) });
      pieces.push({ text: text.slice(c.start, c.end), entry: c.entry });
      cursor = c.end;
    }
    if (cursor < text.length) pieces.push({ text: text.slice(cursor) });
    return pieces;
  }

  const api = { spans, RELATED, shuffle, pair, openingPair, rankNext, nextPair, relatedWithFacts, pathData, erasWithFacts, zoomBox };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RHLogic = api;
})(typeof self !== "undefined" ? self : this);
