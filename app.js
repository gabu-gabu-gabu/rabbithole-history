/* RabbitHole on the web: the map, the era slider, the category cards and the two-fact
   rabbit hole, following the same rules as the iPhone app (the rules are in logic.js).
   Data comes from Website/data, which Tools/build_website.py writes from the app's own
   files. Nothing is sent anywhere. */
(function () {
  "use strict";

  const APP_STORE_URL = "https://apps.apple.com/us/app/rabbithole-history-explorer/id6816717138";
  const L = window.RHLogic;
  const MAP_W = 1000, MAP_H = 498, ZOOM = 3;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const small = () => window.matchMedia("(max-width: 900px)").matches;
  const touch = () => window.matchMedia("(hover: none)").matches;
  const jump = (node) => node.scrollIntoView({ block: "start", behavior: "instant" });

  let index = null;
  const state = { era: 2, region: null, category: null, facts: null, shown: new Set(), level: 1, zoomed: false, inHole: false, cards: { entries: {}, mentions: {} } };
  const cache = new Map();

  /* Which facts this browser has read. Kept only here, on this device. */
  const read = (() => {
    let ids = new Set();
    try { ids = new Set(JSON.parse(localStorage.getItem("rh.read") || "[]")); } catch (e) { /* private window */ }
    return {
      has: (id) => ids.has(id),
      add: (id) => { ids.add(id); try { localStorage.setItem("rh.read", JSON.stringify([...ids])); } catch (e) { /* fine */ } },
    };
  })();
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* fine */ } };
  const recall = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  const eraId = () => index.eras[state.era].id;
  const hasFacts = (region, era) => Boolean(index.counts[region + "|" + era]);
  const shortName = (region) => index.regions[region].replace(/ \(.*\)$/, "");

  /* ---------- map ---------- */
  function drawMap(map) {
    const svg = $("map");
    const ns = "http://www.w3.org/2000/svg";
    for (const line of map.graticule) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", L.pathData(line));
      p.setAttribute("class", "grat");
      svg.appendChild(p);
    }
    for (const region of map.regions) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", region.rings.map((r) => L.pathData(r) + "Z").join(""));
      p.setAttribute("class", "region");
      p.setAttribute("data-region", region.id);
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.setAttribute("aria-label", index.regions[region.id]);
      p.addEventListener("mouseenter", () => hover(region.id));
      p.addEventListener("focus", () => hover(region.id));
      p.addEventListener("mouseleave", () => hover(null));
      p.addEventListener("blur", () => hover(null));
      p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(region.id); } });
      svg.appendChild(p);
    }
    /* One listener for taps and clicks. On a small screen the regions are too small to hit,
       so the first tap zooms in around the finger and the second one chooses. */
    svg.addEventListener("click", (e) => {
      const region = e.target.closest ? e.target.closest(".region") : null;
      if (small() && !state.zoomed) return zoomAt(e);
      if (region) choose(region.getAttribute("data-region"));
    });
    $("zoom-out").addEventListener("click", zoomOut);
  }

  function zoomAt(e) {
    const svg = $("map");
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * MAP_W;
    const y = ((e.clientY - box.top) / box.height) * MAP_H;
    svg.setAttribute("viewBox", L.zoomBox(x, y, ZOOM, MAP_W, MAP_H).map((n) => n.toFixed(1)).join(" "));
    svg.classList.add("zoomed");
    state.zoomed = true;
    $("zoom-out").hidden = false;
    hover(null);
  }

  function zoomOut() {
    const svg = $("map");
    svg.setAttribute("viewBox", "0 0 " + MAP_W + " " + MAP_H);
    svg.classList.remove("zoomed");
    state.zoomed = false;
    $("zoom-out").hidden = true;
    hover(null);
  }

  function hover(region) {
    const shown = region || state.region;
    let text;
    if (shown) text = index.regions[shown] + (hasFacts(shown, eraId()) ? "" : " · nothing yet for this era");
    else if (small() && !state.zoomed) text = "Tap the map to zoom in, then tap a region.";
    else if (touch()) text = "Tap a region.";
    else text = "Hover over the map to see each region.";
    $("hover").textContent = text;
  }

  function paintMap() {
    for (const p of document.querySelectorAll("#map .region")) {
      const id = p.getAttribute("data-region");
      p.classList.toggle("has", hasFacts(id, eraId()));
      p.classList.toggle("on", id === state.region);
      p.setAttribute("aria-pressed", id === state.region ? "true" : "false");
    }
    const list = $("region-list");
    for (const o of list.options) if (o.value) o.textContent = index.regions[o.value] + (hasFacts(o.value, eraId()) ? "" : " (nothing yet for this era)");
    list.value = state.region || "";
  }

  /* ---------- era ---------- */
  function setEra(i) {
    state.era = i;
    $("era-slider").value = String(i);
    remember("rh.era", eraId());
    paintEra(); paintMap(); paintPanel(); hover(null);
  }

  function paintEra() {
    const era = index.eras[state.era];
    $("era-name").textContent = era.name;
    $("era-span").textContent = era.span;
    $("era-slider").setAttribute("aria-valuetext", era.name + ", " + era.span);
    [...$("era-ticks").children].forEach((t, i) => t.classList.toggle("on", i === state.era));
  }

  /* ---------- category panel ---------- */
  function choose(region) {
    state.region = region || null;
    paintMap();
    paintPanel();
    hover(null);
    if (state.region && small()) jump($("panel"));
  }

  function paintPanel() {
    const has = Boolean(state.region);
    $("panel-empty").hidden = has;
    $("panel-place").hidden = !has;
    if (!has) return;
    const era = index.eras[state.era];
    $("place-era").textContent = era.name + " · " + era.span;
    $("place-name").textContent = index.regions[state.region];
    const counts = index.counts[state.region + "|" + era.id];
    const list = $("cats");
    const none = $("none-here");
    list.textContent = "";
    none.hidden = Boolean(counts);
    if (!counts) {
      /* Nothing for this era: say so once and offer the eras that do have something. */
      const others = L.erasWithFacts(state.region, index.eras, index.counts);
      $("none-line").textContent = others.length
        ? "Nothing here yet for this era. " + shortName(state.region) + " has facts in:"
        : "Nothing here yet.";
      const box = $("none-eras");
      box.textContent = "";
      for (const e of others) {
        const b = el("button", null, e.name);
        b.type = "button";
        b.addEventListener("click", () => setEra(index.eras.indexOf(e)));
        box.appendChild(b);
      }
      return;
    }
    for (const cat of index.categories) {
      const li = el("li");
      const b = el("button", "cat");
      b.type = "button";
      const title = index.titles[state.region + "|" + era.id + "|" + cat.id];
      b.appendChild(el("span", "k", cat.name));
      if (counts[cat.id]) {
        b.appendChild(el("span", "t", title ? title.title : cat.name));
        if (title) b.appendChild(el("span", "s", title.subtitle));
        b.addEventListener("click", () => openHole(cat.id));
      } else {
        b.disabled = true;
        b.appendChild(el("span", "s", "Nothing here yet for this time and place."));
      }
      li.appendChild(b);
      list.appendChild(li);
    }
  }

  /* ---------- the rabbit hole ---------- */
  function loadPlace(region, era) {
    const key = region + "__" + era;
    if (!cache.has(key)) cache.set(key, fetch("data/facts/" + key + ".json").then((r) => r.json()));
    return cache.get(key);
  }

  /* The name cards for a place and era. If they fail to load the facts still show, plain. */
  function loadCards(region, era) {
    const key = "cards/" + region + "__" + era;
    if (!cache.has(key)) cache.set(key, fetch("data/" + key + ".json").then((r) => r.json()).catch(() => ({ entries: {}, mentions: {} })));
    return cache.get(key);
  }

  /* A fact's text with the names that have a card turned into small buttons. */
  function factText(fact) {
    const p = el("p");
    for (const piece of L.spans(fact.text, state.cards.mentions[fact.id])) {
      const card = piece.entry && state.cards.entries[piece.entry];
      if (!card) { p.append(piece.text); continue; }
      const b = el("button", "name", piece.text);
      b.type = "button";
      b.setAttribute("aria-label", "Who or what is " + piece.text + "?");
      b.addEventListener("click", (e) => { e.stopPropagation(); showCard(card, b); });
      b.addEventListener("keydown", (e) => e.stopPropagation());
      p.appendChild(b);
    }
    return p;
  }

  const KINDS = { person: "Person", place: "Place", term: "Term" };
  function showCard(card, opener) {
    $("card-kind").textContent = KINDS[card.type] || "";
    $("card-name").textContent = card.name;
    $("card-text").textContent = card.summary;
    const src = $("card-src");
    src.textContent = "";
    const a = el("a", null, card.source_title);
    a.href = card.source_url; a.target = "_blank"; a.rel = "noopener";
    src.append("Source: ", a, " (English Wikipedia)");
    const life = $("card-life");
    life.hidden = !card.life;
    life.href = APP_STORE_URL;
    const dialog = $("card");
    dialog.returnFocusTo = opener;
    if (!dialog.open) dialog.showModal();
  }

  async function openHole(category) {
    const [place, cards] = await Promise.all([loadPlace(state.region, eraId()), loadCards(state.region, eraId())]);
    state.cards = cards;
    state.category = category;
    state.facts = place[category] || [];
    state.shown = new Set();
    state.level = 1;
    $("stage").hidden = true;
    document.querySelector(".intro").hidden = true;
    $("hole").hidden = false;
    /* So the browser's Back button climbs out of the hole instead of leaving the site. */
    if (!state.inHole) { state.inHole = true; try { history.pushState({ hole: true }, ""); } catch (e) { /* fine */ } }
    const catName = index.categories.find((c) => c.id === category).name;
    $("crumb").textContent = shortName(state.region) + " · " + index.eras[state.era].name + " · " + catName;
    showPair(L.openingPair(state.facts, read.has));
    jump($("explore"));
  }

  function showPair(facts) {
    const box = $("pair");
    box.textContent = "";
    if (facts.length < 2) return showBottom();
    $("bottom").hidden = true;
    $("prompt").hidden = false;
    $("level").textContent = "Level " + state.level;
    for (const fact of facts) {
      state.shown.add(fact.id);
      const card = el("article", "fact");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Choose this fact: " + fact.text);
      card.appendChild(factText(fact));
      const src = el("div", "src");
      src.append("Source: ");
      const a = el("a", null, fact.source_title);
      a.href = fact.source_url;
      a.target = "_blank";
      a.rel = "noopener";
      a.addEventListener("click", (e) => e.stopPropagation());
      a.addEventListener("keydown", (e) => e.stopPropagation());
      src.append(a, " (English Wikipedia)");
      card.appendChild(src);
      const pick = () => {
        read.add(fact.id);
        state.level += 1;
        showPair(L.nextPair(state.facts, fact, state.shown));
        jump($("explore"));
      };
      card.addEventListener("click", pick);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      box.appendChild(card);
    }
  }

  function showBottom() {
    $("prompt").hidden = true;
    $("level").textContent = "";
    $("bottom").hidden = false;
    const next = L.relatedWithFacts(state.category, index.counts[state.region + "|" + eraId()]);
    $("bottom-line").textContent = next.length
      ? "Carry on in " + shortName(state.region) + " with something related, or go back up to the map."
      : "Go back up to the map and pick somewhere new.";
    const again = $("again");
    again.textContent = "";
    for (const c of next) {
      const b = el("button", null, index.categories.find((k) => k.id === c).name);
      b.type = "button";
      b.addEventListener("click", () => openHole(c));
      again.appendChild(b);
    }
    const up = el("button", null, "Back to the map");
    up.type = "button";
    up.addEventListener("click", leaveHole);
    again.appendChild(up);
  }

  /* The page's own "back" buttons go through the browser's history, so both ways out agree. */
  function leaveHole() {
    if (state.inHole && history.state && history.state.hole) history.back();
    else closeHole();
  }

  function closeHole() {
    state.inHole = false;
    $("pair").textContent = "";
    $("hole").hidden = true;
    $("stage").hidden = false;
    document.querySelector(".intro").hidden = false;
    jump($("explore"));
  }

  /* ---------- start ---------- */
  async function start() {
    for (const id of ["store-top", "store-mid"]) { $(id).href = APP_STORE_URL; $(id).target = "_blank"; }
    const [idx, map] = await Promise.all([fetch("data/index.json").then((r) => r.json()), fetch("data/map.json").then((r) => r.json())]);
    index = idx;
    const saved = index.eras.findIndex((e) => e.id === recall("rh.era"));
    if (saved >= 0) state.era = saved;
    const ticks = $("era-ticks");
    for (const era of index.eras) ticks.appendChild(el("span", null, era.name));
    const list = $("region-list");
    for (const [id, name] of Object.entries(index.regions).sort((a, b) => a[1].replace(/^The /, "").localeCompare(b[1].replace(/^The /, "")))) {
      const o = el("option", null, name);
      o.value = id;
      list.appendChild(o);
    }
    list.addEventListener("change", () => choose(list.value));
    const slider = $("era-slider");
    slider.value = String(state.era);
    slider.addEventListener("input", () => setEra(Number(slider.value)));
    $("hole-back").addEventListener("click", leaveHole);
    const dialog = $("card");
    $("card-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });   // a click on the dimmed page
    dialog.addEventListener("close", () => { if (dialog.returnFocusTo && dialog.returnFocusTo.isConnected) dialog.returnFocusTo.focus(); });
    window.addEventListener("popstate", () => { if ($("card").open) $("card").close(); if (state.inHole) closeHole(); });
    drawMap(map);
    paintEra();
    paintMap();
    hover(null);
    document.documentElement.setAttribute("data-ready", "1");
  }

  start().catch((err) => {
    $("hover").textContent = "The map could not load. Please refresh the page.";
    console.error(err);
  });
})();
