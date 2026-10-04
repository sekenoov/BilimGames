/* Путь Великой степи / Ұлы Дала жолы: игровая логика. Обычный скрипт, работает с file://. */
(function () {
  "use strict";

  const D = window.HK_DATA;
  const I18N = window.HK_I18N;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const TEAM_COLORS = ["#C2410C", "#7C3AED", "#0F766E", "#334155"];
  const TOPICS = ["turks", "khanate", "both"];

  /* ============ Language ============ */
  let lang = pickLang();
  let T = I18N[lang];

  function pickLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "ru" || q === "kz") return q;
    try {
      for (const k of ["bilim-lang", "bilim-game-lang"]) { const s = localStorage.getItem(k); if (s === "ru" || s === "kz") return s; }
    } catch (e) {}
    return "kz";
  }
  function setLang(l) {
    if (l === lang || !I18N[l]) return;
    lang = l;
    T = I18N[lang];
    try { localStorage.setItem("bilim-lang", lang); localStorage.setItem("bilim-game-lang", lang); } catch (e) {}
    Sound.click();
    applyStatic();
    renderSetup();
    if (state) {
      buildBoard();
      render();
      renderBanner();
      if (state.phase === "over") renderResults();
    }
  }
  const L = (o) => (o ? o[lang] || o.ru : "");

  /* ============ Board ============ */
  // Верхняя ветка = «налево», нижняя = «направо» (карта читается слева направо).
  const NODES = {
    start:  { x: 100,  y: 540, slot: "start", next: ["a1"] },
    a1:     { x: 255,  y: 540, next: ["u1", "down1"] },
    u1:     { x: 325,  y: 335, next: ["up1"] },
    up1:    { x: 480,  y: 215, slot: "up1",   next: ["u2"] },
    u2:     { x: 635,  y: 335, next: ["mid"] },
    down1:  { x: 420,  y: 850, slot: "down1", next: ["d1"] },
    d1:     { x: 600,  y: 800, next: ["mid"], risky: true },
    mid:    { x: 750,  y: 540, slot: "mid",   next: ["b1"] },
    b1:     { x: 900,  y: 540, next: ["p1", "down2"] },
    p1:     { x: 970,  y: 335, next: ["up2"] },
    up2:    { x: 1120, y: 215, slot: "up2",   next: ["p2"] },
    p2:     { x: 1275, y: 335, next: ["last"] },
    down2:  { x: 1060, y: 850, slot: "down2", next: ["m1"] },
    m1:     { x: 1240, y: 800, next: ["last"], risky: true },
    last:   { x: 1345, y: 540, slot: "last",  next: ["finish"] },
    finish: { x: 1515, y: 540, slot: "finish", next: [] }
  };
  const PLACE_R = 70, CELL_R = 34, TOKEN_R = 24;

  const DIST = (function () {
    const d = { finish: 0 };
    let changed = true;
    while (changed) {
      changed = false;
      for (const id in NODES) {
        const ds = NODES[id].next.map((n) => d[n]).filter((v) => v != null);
        if (ds.length) { const v = Math.min(...ds) + 1; if (d[id] !== v) { d[id] = v; changed = true; } }
      }
    }
    return d;
  })();

  /* ============ Content ============ */
  const topic = () => D.topics[state ? state.topic : config.topic];
  function placeOf(nodeId) {
    const slot = NODES[nodeId].slot;
    if (!slot) return null;
    if (slot === "finish") return "finish";
    return topic().slots[slot];
  }
  function placeText(pid) {
    if (pid === "finish") return { name: T.finishName, sub: "", to: T.finishName };
    return L(D.places[pid]);
  }
  function sourceTopics(tid) { return D.topics[tid].from ? D.topics[tid].from.map((x) => D.topics[x]) : [D.topics[tid]]; }
  function pool(kind) { return sourceTopics(state.topic).reduce((all, t) => all.concat(t[kind] || []), []); }
  // Вопросы под уровень. Если их меньше двух, берём все.
  function byLevel(list) {
    const f = list.filter((x) => !x.lv || x.lv.includes(state.level));
    return f.length >= 2 ? f : list;
  }

  /* ============ State ============ */
  let state = null;
  let history = [];
  let config = loadConfig();
  let clock = { left: 0, paused: false, last: 0, low: false };
  let anim = 0;
  let cardTimer = { uid: null, total: 0, left: 0, paused: false };
  let bannerTimeout = null;

  function loadConfig() {
    const def = { topic: "turks", level: 1, teams: 3, names: ["", "", "", ""], players: [6, 6, 6, 6], minutes: 15, answer: 45 };
    let c = def;
    try { c = Object.assign(def, JSON.parse(localStorage.getItem("hk-config") || "{}")); } catch (e) {}
    const q = new URLSearchParams(location.search).get("topic");
    if (TOPICS.includes(q)) c.topic = q;
    if (!TOPICS.includes(c.topic)) c.topic = "turks";
    return c;
  }
  function saveConfig() { try { localStorage.setItem("hk-config", JSON.stringify(config)); } catch (e) {} }

  function newGame() {
    const placeholders = currentPlaceholders();
    const teams = [];
    for (let i = 0; i < config.teams; i++) {
      teams.push({
        name: (config.names[i] || "").trim() || placeholders[i],
        color: TEAM_COLORS[i],
        players: config.players[i],
        speaker: 1,
        points: 0,
        path: ["start"],
        skip: false,
        finished: false
      });
    }
    state = {
      topic: config.topic, level: config.level,
      teams, cur: 0, round: 1, turn: 1,
      phase: "roll", die: null, stepsLeft: 0, chain: false,
      card: null, finalRound: false, finalReason: null,
      types: layoutTypes(),
      decks: {}, uid: 0
    };
    history = [];
    clock = { left: config.minutes * 60 * 1000, paused: false, last: performance.now(), low: false };
    show("game");
    buildBoard();
    hideBanner();
    render();
  }

  // Типы клеток каждый раз новые.
  function layoutTypes() {
    const types = {};
    const plain = Object.keys(NODES).filter((id) => !NODES[id].slot);
    for (const id of plain) {
      const r = Math.random();
      types[id] = NODES[id].risky ? (r < 0.6 ? "t" : "b") : (r < 0.5 ? "q" : r < 0.75 ? "b" : "t");
    }
    const safe = plain.filter((id) => !NODES[id].risky);
    const count = (t) => safe.filter((id) => types[id] === t).length;
    if (!count("b")) types[safe[rand(safe.length)]] = "b";
    if (!count("t")) { const qs = safe.filter((id) => types[id] === "q"); types[(qs.length ? qs : safe)[rand((qs.length ? qs : safe).length)]] = "t"; }
    if (!count("q")) { const bs = safe.filter((id) => types[id] !== "q"); types[bs[rand(bs.length)]] = "q"; }
    return types;
  }

  function draw(name, list) {
    let d = state.decks[name];
    if (!d || d.i >= d.order.length || d.n !== list.length) {
      const last = d ? d.order[d.order.length - 1] : -1;
      let order = shuffle(list.map((_, i) => i));
      if (order.length > 1 && order[0] === last) order.push(order.shift());
      d = state.decks[name] = { order, i: 0, n: list.length };
    }
    return list[d.order[d.i++]];
  }

  function snapshot() {
    history.push(JSON.stringify(state));
    if (history.length > 150) history.shift();
  }

  function undo() {
    if (!history.length || !state) return;
    anim++;
    state = JSON.parse(history.pop());
    cardTimer.uid = null;
    Sound.click();
    render();
    renderBanner();
  }

  /* ============ Helpers ============ */
  const team = () => state.teams[state.cur];
  const at = (t) => t.path[t.path.length - 1];
  const nodeType = (id) => NODES[id].slot ? (id === "finish" ? "finish" : "p") : state.types[id];
  function forkOptions(id) {
    return NODES[id].next.map((to, i) => {
      let x = to; while (!NODES[x].slot) x = NODES[x].next[0];
      const p = placeText(placeOf(x));
      return { to, dir: i === 0 ? "left" : "right", key: i === 0 ? "↑" : "↓", name: p.name, toText: p.to, blurb: i === 0 ? T.roadUp : T.roadDown };
    });
  }
  function progress(t) {
    const total = DIST.start;
    return Math.max(0, Math.min(1, (total - DIST[at(t)]) / total));
  }

  /* ============ Actions ============ */
  function roll() {
    if (state.phase !== "roll") return;
    snapshot();
    state.die = 1 + rand(3);
    state.phase = "rolled";
    Sound.dice();
    render({ rolling: true });
  }

  function go() {
    if (state.phase !== "rolled") return;
    snapshot();
    state.stepsLeft = state.die;
    state.phase = "moving";
    render();
    stepLoop(anim);
  }

  function stepLoop(id) {
    if (id !== anim) return;
    const t = team();
    const here = at(t);
    if (state.stepsLeft <= 0 || here === "finish") return land();
    const next = NODES[here].next;
    if (next.length > 1) {
      state.phase = "fork";
      Sound.fork();
      render();
      return;
    }
    moveTo(next[0]);
  }

  function moveTo(to) {
    const t = team();
    t.path.push(to);
    state.stepsLeft--;
    if (to === "finish") state.stepsLeft = 0;
    Sound.step(state.die - state.stepsLeft);
    state.phase = "moving";
    render();
    const id = anim;
    setTimeout(() => stepLoop(id), 420);
  }

  function chooseFork(i) {
    if (state.phase !== "fork") return;
    const opts = NODES[at(team())].next;
    if (!opts[i]) return;
    snapshot();
    moveTo(opts[i]);
  }

  function questionCard(place) {
    if (place) {
      const qs = byLevel(D.places[place].questions);
      if (qs.length) return { kind: "q", place, item: draw("place:" + place + ":" + state.level, qs) };
    }
    return { kind: "q", item: draw("q:" + state.level, byLevel(pool("questions"))) };
  }

  function land() {
    const t = team();
    const here = at(t);
    const type = nodeType(here);
    const chain = state.chain;
    state.chain = false;

    if (type === "finish") {
      t.finished = true;
      Sound.finish();
      const first = !state.finalRound;
      if (first) { state.finalRound = true; state.finalReason = "finish"; }
      openCard({ kind: "finish", first });
      return;
    }
    if (type === "p") { openCard(questionCard(placeOf(here))); return; }
    if (type === "q") { openCard(questionCard(null)); return; }
    if (chain) { endTurn(); return; }            // шаги от бонуса не дают новый бонус или ловушку
    if (type === "b") { openCard({ kind: "b", item: draw("b", pool("bonuses")) }); return; }
    if (type === "t") { openCard({ kind: "t", item: draw("t", pool("traps")) }); return; }
    endTurn();
  }

  function openCard(card) {
    card.uid = ++state.uid;
    card.reveal = false;
    state.card = card;
    state.phase = "card";
    if (card.kind === "b") Sound.bonus();
    else if (card.kind === "t") Sound.trap();
    else if (card.kind === "q") Sound.card();
    render();
  }

  function anotherQuestion() {
    const c = state.card;
    if (!c || c.kind !== "q") return;
    snapshot();
    const next = questionCard(c.place || null);
    next.uid = ++state.uid;
    next.reveal = false;
    state.card = next;
    Sound.click();
    render();
  }

  function revealAnswer() {
    const c = state.card;
    if (!c || c.kind !== "q" || !L(c.item).a) return;
    c.reveal = !c.reveal;
    Sound.click();
    const box = $("#card .answer");
    if (box) box.hidden = !c.reveal;
    const btn = $("#card [data-act='reveal']");
    if (btn) btn.setAttribute("aria-pressed", String(c.reveal));
  }

  function score(p) {
    if (!state.card || state.card.kind !== "q") return;
    snapshot();
    team().points += p;
    Sound.score(p);
    const i = state.cur;
    endTurn();
    if (p > 0) floatPoints(i, "+" + p);
  }

  function applyBonus() {
    const c = state.card;
    if (!c || c.kind !== "b") return;
    snapshot();
    const e = c.item.effect;
    state.card = null;
    if (e.points) {
      team().points += e.points;
      const i = state.cur;
      endTurn();
      floatPoints(i, "+" + e.points);
    } else if (e.steps) {
      state.stepsLeft = e.steps;
      state.die = e.steps;
      state.chain = true;
      state.phase = "moving";
      render();
      stepLoop(anim);
    } else if (e.again) {
      state.phase = "roll";
      state.die = null;
      flashBanner(T.rollAgain);
      render();
    }
  }

  function resolveTrap(saved) {
    const c = state.card;
    if (!c || c.kind !== "t") return;
    snapshot();
    const t = team();
    const i = state.cur;
    if (saved) { Sound.saved(); endTurn(); flashBanner(T.savedBanner(t.name)); return; }
    const e = c.item.effect;
    state.card = null;
    if (e.points) { const before = t.points; t.points = Math.max(0, t.points + e.points); endTurn(); if (before !== t.points) floatPoints(i, String(e.points), true); return; }
    if (e.skip) { t.skip = true; endTurn(); return; }
    if (e.back) {
      state.phase = "moving";
      render();
      const id = anim;
      let n = e.back;
      const stepBack = () => {
        if (id !== anim) return;
        if (n-- <= 0 || t.path.length <= 1) { endTurn(); return; }
        t.path.pop();
        Sound.step(0);
        render();
        setTimeout(stepBack, 420);
      };
      setTimeout(stepBack, 200);
    }
  }

  function continueFinish() {
    if (!state.card || state.card.kind !== "finish") return;
    snapshot();
    endTurn();
  }

  function continueSkip() {
    if (state.phase !== "skip") return;
    snapshot();
    team().skip = false;
    endTurn(true);
  }

  // Ход переходит к следующей команде. После последней команды последнего круга игра заканчивается.
  function endTurn(skipped) {
    const t = team();
    if (!skipped) t.speaker = (t.speaker % t.players) + 1;
    state.card = null;
    state.die = null;
    state.chain = false;
    state.stepsLeft = 0;

    let next = state.cur + 1;
    while (true) {
      if (next >= state.teams.length) {
        if (state.finalRound || state.teams.every((x) => x.finished)) { endGame(); return; }
        next = 0;
        state.round++;
      }
      if (!state.teams[next].finished) break;
      next++;
    }
    state.cur = next;
    state.turn++;
    state.phase = team().skip ? "skip" : "roll";
    render();
    renderBanner();
  }

  /* ============ Clock ============ */
  function tickClock(now) {
    requestAnimationFrame(tickClock);
    if (!state || !$("#screen-game").classList.contains("is-active")) { clock.last = now; return; }
    const dt = now - clock.last;
    clock.last = now;
    if (!clock.paused && clock.left > 0) {
      clock.left = Math.max(0, clock.left - dt);
      if (clock.left === 0 && !state.finalRound) {
        state.finalRound = true;
        state.finalReason = "time";
        Sound.timeUp();
        renderBanner();
      }
    }
    const s = Math.ceil(clock.left / 1000);
    const txt = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    const el = $("#clock-text");
    if (el.textContent !== txt) el.textContent = txt;
    $("#clock").classList.toggle("is-paused", clock.paused);
    $("#clock").classList.toggle("is-low", s <= 60);

    if (state.phase === "card" && cardTimer.uid === state.card.uid && !cardTimer.paused && cardTimer.left > 0) {
      const before = Math.ceil(cardTimer.left / 1000);
      cardTimer.left = Math.max(0, cardTimer.left - dt);
      const after = Math.ceil(cardTimer.left / 1000);
      if (after !== before) {
        if (after <= 5 && after > 0) Sound.tick();
        if (after === 0) Sound.timeUp();
        paintTimer();
      }
    }
  }

  /* ============ Rendering: board ============ */
  const SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  const GLYPHS = {
    q: "M-12 -10h24a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H-2l-7 6v-6h-3a4 4 0 0 1-4-4v-10a4 4 0 0 1 4-4z",
    b: "M0 -12V12M-12 0H12",
    t: "M0 -12V4M0 12v.5"
  };
  // Қошқар мүйіз: орнамент в углах карты.
  const HORN = "M0 40C0 18 14 4 32 4c14 0 22 10 22 20 0 9-7 15-15 15-7 0-11-5-11-10 0-4 3-7 7-7M108 40c0-22-14-36-32-36-14 0-22 10-22 20 0 9 7 15 15 15 7 0 11-5 11-10 0-4-3-7-7-7M54 24v34";

  function buildBoard() {
    const svg = $("#board");
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    const deco = el("g", { class: "deco" }, svg);
    [[60, 90, 1], [1540, 90, -1], [60, 1010, 1], [1540, 1010, -1]].forEach(([x, y, s]) => {
      el("path", { d: HORN, transform: `translate(${x} ${y}) scale(${s * 1.3} ${y > 500 ? -1.3 : 1.3}) translate(0 -30)` }, deco);
    });
    const gEdges = el("g", {}, svg);
    const gNodes = el("g", {}, svg);
    el("g", { id: "fork-tags" }, svg);
    el("g", { id: "tokens" }, svg);

    for (const id in NODES) {
      for (const to of NODES[id].next) {
        const a = NODES[id], b = NODES[to];
        el("line", { class: "edge", x1: a.x, y1: a.y, x2: b.x, y2: b.y, "data-from": id, "data-to": to }, gEdges);
      }
    }

    for (const id in NODES) {
      const n = NODES[id];
      const g = el("g", { "data-node": id, transform: `translate(${n.x} ${n.y})` }, gNodes);
      if (n.slot) {
        const pid = placeOf(id);
        const p = placeText(pid);
        g.setAttribute("class", "place place--" + (pid === "finish" ? "finish" : "site"));
        const clip = el("clipPath", { id: "clip-" + id }, defs);
        el("circle", { r: PLACE_R - 6 }, clip);
        el("circle", { class: "pulse", r: PLACE_R }, g);
        el("circle", { class: "ring", r: PLACE_R }, g);
        el("image", { href: `assets/${pid}.png`, x: -(PLACE_R - 6), y: -(PLACE_R - 6), width: (PLACE_R - 6) * 2, height: (PLACE_R - 6) * 2, "clip-path": `url(#clip-${id})`, preserveAspectRatio: "xMidYMid slice" }, g);
        el("circle", { class: "ring-accent", r: PLACE_R - 3 }, g);
        // Длинное название в две строки, чтобы не наезжало на соседей.
        let words = [p.name];
        if (p.name.length > 10) {
          const sp = p.name.indexOf(" "), hy = p.name.lastIndexOf("-");
          if (sp > 0) words = [p.name.slice(0, sp), p.name.slice(sp + 1)];
          else if (hy > 0) words = [p.name.slice(0, hy + 1), p.name.slice(hy + 1)];
        }
        const label = el("text", { class: "place-label", y: PLACE_R + 42 }, g);
        words.forEach((w, i) => { const ts = el("tspan", { x: 0, dy: i ? 34 : 0 }, label); ts.textContent = w; });
        if (id === "start") { const s = el("text", { class: "start-label", y: -PLACE_R - 18 }, g); s.textContent = T.startLabel; }
        if (p.sub) { const s = el("text", { class: "place-sub", y: PLACE_R + 70 + (words.length - 1) * 34 }, g); s.textContent = p.sub; }
      } else {
        const type = state.types[id];
        g.setAttribute("class", "cell cell--" + type);
        el("circle", { class: "pulse", r: CELL_R }, g);
        el("circle", { class: "base", r: CELL_R }, g);
        el("path", { class: "glyph", d: GLYPHS[type], transform: "scale(1.15)" }, g);
      }
      g.addEventListener("click", () => {
        if (state.phase !== "fork") return;
        const i = NODES[at(team())].next.indexOf(id);
        if (i >= 0) chooseFork(i);
      });
    }
  }

  function renderBoard() {
    const svg = $("#board");
    const forkFrom = state.phase === "fork" ? at(team()) : null;
    const options = forkFrom ? NODES[forkFrom].next : [];
    svg.querySelectorAll("[data-node]").forEach((g) => {
      g.classList.toggle("is-target", options.includes(g.dataset.node));
      g.style.cursor = options.includes(g.dataset.node) ? "pointer" : "";
    });
    svg.querySelectorAll(".edge").forEach((e) => e.classList.toggle("is-option", e.dataset.from === forkFrom));
    const tags = $("#fork-tags");
    tags.innerHTML = "";
    if (forkFrom) {
      forkOptions(forkFrom).forEach((o) => {
        const a = NODES[forkFrom], b = NODES[o.to];
        const x = (a.x + b.x) / 2 - 70, y = (a.y + b.y) / 2 + (o.dir === "left" ? -6 : 6);
        const g = el("g", { class: "fork-tag", transform: `translate(${x} ${y})` }, tags);
        el("rect", { x: -74, y: -22, width: 148, height: 44, rx: 22 }, g);
        const t = el("text", { y: 8 }, g);
        t.textContent = `${o.key}  ${o.dir === "left" ? T.left : T.right}`;
      });
    }

    const layer = $("#tokens");
    const groups = {};
    state.teams.forEach((t, i) => { (groups[at(t)] = groups[at(t)] || []).push(i); });
    const order = state.teams.map((_, i) => i).filter((i) => i !== state.cur).concat([state.cur]);
    order.forEach((i) => {
      const t = state.teams[i];
      let g = layer.querySelector(`[data-team="${i}"]`);
      if (!g) {
        g = el("g", { class: "token", "data-team": i });
        el("circle", { class: "halo", r: TOKEN_R + 4, stroke: t.color }, g);
        el("circle", { class: "body", r: TOKEN_R, fill: t.color }, g);
        const tx = el("text", {}, g);
        tx.textContent = t.name.trim().charAt(0).toUpperCase();
        const n0 = NODES[at(t)];
        g.style.transform = `translate(${n0.x}px, ${n0.y}px)`;
      }
      layer.appendChild(g);
      const id = at(t);
      const n = NODES[id];
      const same = groups[id];
      const k = same.indexOf(i), m = same.length;
      let dx = 0, dy = 0;
      if (n.slot) { dy = PLACE_R - 12; dx = (k - (m - 1) / 2) * 44; }
      else if (m > 1) { const ang = (Math.PI * 2 * k) / m - Math.PI / 2; dx = Math.cos(ang) * 24; dy = Math.sin(ang) * 24; }
      g.style.transform = `translate(${n.x + dx}px, ${n.y + dy}px)`;
      g.classList.toggle("is-current", i === state.cur && !state.teams[i].finished);
    });
  }

  /* ============ Rendering: side panel ============ */
  // Асық вместо кубика: показывает 1, 2 или 3.
  function asykHTML(v, rolling) {
    const shape = `<svg viewBox="0 0 120 96" aria-hidden="true"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7D774"/><stop offset="1" stop-color="#D99A1E"/></linearGradient></defs>
      <path class="asyk__body" d="M24 14c10-8 26-6 32 2 3 4 5 4 8 0 6-8 22-10 32-2 10 8 12 22 6 32 4 10 2 24-6 32-10 8-26 6-32-2-3-4-5-4-8 0-6 8-22 10-32 2-8-8-10-22-6-32-6-10-4-24 6-32z"/>
      <ellipse class="asyk__dip" cx="60" cy="48" rx="20" ry="13"/></svg>`;
    if (!v) return `<div class="asyk asyk--empty" role="img" aria-label="${esc(T.aria.asyk(null))}">${shape}<b>?</b></div>`;
    return `<div class="asyk${rolling ? " is-rolling" : ""}" role="img" aria-label="${esc(T.aria.asyk(v))}">${shape}<b>${v}</b></div>`;
  }

  function renderSide(opts = {}) {
    const t = team();
    const turn = $("#turn");
    turn.style.setProperty("--team", t.color);
    let dots = "";
    for (let i = 1; i <= t.players; i++) dots += `<i class="${i === t.speaker ? "on" : ""}"></i>`;
    let body = "";
    const p = state.phase;

    if (p === "roll") {
      body = `<div class="say"><small>${T.say}</small>«${esc(T.rollPhrase)}»</div>
        <div class="turn__row">${asykHTML(null)}<div class="status">${esc(T.rollStatus(t.speaker))}</div></div>
        <button class="btn btn--primary btn--large" data-act="roll">${T.rollBtn} <kbd>Space</kbd></button>`;
    } else if (p === "rolled") {
      const ph = T.movePhrases(state.die);
      body = `<div class="turn__row">${asykHTML(state.die, opts.rolling)}<div class="steps-left"><b>${state.die}</b>${T.steps(state.die)}</div></div>
        <div class="say"><small>${T.say}</small>«${esc(ph[state.turn % ph.length])}»</div>
        <button class="btn btn--primary btn--large" data-act="go">${T.go} <kbd>Space</kbd></button>`;
    } else if (p === "moving") {
      body = `<div class="turn__row">${asykHTML(state.chain ? null : state.die)}<div class="steps-left"><b>${state.stepsLeft}</b>${T.stepsLeft}</div></div>`;
    } else if (p === "fork") {
      const o = forkOptions(at(t));
      body = `<div class="say"><small>${T.say}</small>${esc(T.forkSay(o[0].toText, o[1].toText))}</div>
        <div class="forks">${o.map((x, i) => `<button class="fork-btn" data-act="fork" data-i="${i}"><kbd>${x.key}</kbd><b>${esc(T.forkBtn(x.dir, x.name))}</b><span>${esc(x.blurb)}</span></button>`).join("")}</div>
        <div class="status">${state.stepsLeft} ${T.stepsLeft}</div>`;
    } else if (p === "skip") {
      body = `<div class="status">${T.skipText(esc(t.name))}</div>
        <button class="btn btn--primary btn--large" data-act="skip">${T.nextTeam} <kbd>Space</kbd></button>`;
    } else if (p === "card") {
      body = `<div class="status">${esc(T.answering(t.speaker))}</div>`;
    }

    turn.innerHTML = `
      <div class="turn__label">${state.finalRound ? T.finalRound : T.round(state.round)} · ${T.nowPlaying}</div>
      <div class="turn__team">${esc(t.name)}</div>
      <div class="speaker"><span>${esc(T.speaker(t.speaker, t.players))}</span><span class="speaker__dots">${dots}</span></div>
      <div class="turn__body">${body}</div>`;

    const rows = state.teams.map((x, i) => `
      <div class="score-row${i === state.cur ? " is-current" : ""}" data-row="${i}">
        <i class="score-row__dot" style="background:${x.color}"></i>
        <div class="score-row__name">${esc(x.name)}${x.finished ? `<small>${T.finished}</small>` : x.skip ? `<small>${T.skipsNext}</small>` : ""}</div>
        <div class="score-row__pts">${x.points}</div>
        <div class="score-row__bar"><i style="width:${Math.round(progress(x) * 100)}%;background:${x.color}"></i></div>
      </div>`).join("");
    $("#scores").innerHTML = `<div class="scores__title">${T.points}</div>${rows}`;

    const K = T.keys;
    const c = state.card;
    const k = {
      roll: [["Space", K.roll]],
      rolled: [["Space", K.go]],
      moving: [],
      fork: [["↑", K.left], ["↓", K.right]],
      skip: [["Space", K.next]],
      card: c && c.kind === "q" ? [["0-3", K.points], ["H", K.hint]].concat(L(c.item).a ? [["A", K.answer]] : []).concat([["R", K.another], ["T", K.timer]])
        : c && c.kind === "t" ? [["S", K.saved], ["Space", K.penalty], ["H", K.hint]]
        : [["Space", K.next]]
    }[p] || [];
    k.push(["⌫", K.undo], ["L", K.lang], ["?", K.help]);
    $("#keys").innerHTML = k.map(([a, b]) => `<span><kbd>${a}</kbd>${b}</span>`).join("");
  }

  /* ============ Rendering: card ============ */
  function effectText(e) {
    if (e.steps) return T.effect.steps(e.steps);
    if (e.points) return T.effect.points(e.points);
    if (e.again) return T.effect.again;
    if (e.skip) return T.effect.skip;
    if (e.back) return T.effect.back(e.back);
    return "";
  }

  function timerHTML() {
    return `<button class="timer" data-act="timer" aria-label="${esc(T.aria.timer)}"><svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="27"/><circle class="bar" cx="32" cy="32" r="27" stroke-dasharray="169.6" stroke-dashoffset="0"/></svg><span></span></button>`;
  }

  function paintTimer() {
    const w = $("#card .timer");
    if (!w) return;
    const s = Math.ceil(cardTimer.left / 1000);
    w.querySelector("span").textContent = s;
    w.querySelector(".bar").style.strokeDashoffset = String(169.6 * (1 - cardTimer.left / (cardTimer.total || 1)));
    w.classList.toggle("is-low", s <= 5);
    w.classList.toggle("is-paused", cardTimer.paused);
  }

  function renderCard() {
    const ov = $("#overlay");
    const c = state.card;
    if (state.phase !== "card" || !c) { ov.hidden = true; return; }
    const t = team();
    const teamChip = `<span class="chip chip--team"><i style="background:${t.color}"></i>${esc(T.teamChip(t.name, t.speaker))}</span>`;
    let html = "";

    if (c.kind === "q") {
      const it = L(c.item);
      const place = c.place ? placeText(c.place) : null;
      const chip = place ? `<span class="chip chip--p">${T.placeChip}</span>` : `<span class="chip chip--q">${esc(T.cats[c.item.cat] || T.legend.q)}</span>`;
      html = `
        <div class="card__head">${chip}${teamChip}${timerHTML()}</div>
        ${place ? `<div class="card__place"><img src="assets/${c.place}.png" alt=""><b>${esc(place.name)}</b><span>${esc(place.sub)}</span></div>` : ""}
        <p class="card__q${it.q.length > 80 ? " is-long" : ""}">${esc(it.q)}</p>
        ${it.say ? `<div class="card__say"><small>${T.sayLabel}</small>${esc(it.say)}</div>` : ""}
        ${it.a ? `<div class="answer"${c.reveal ? "" : " hidden"}><small>${T.answerLabel}</small>${esc(it.a)}</div>` : ""}
        <div class="hint" hidden><small>${T.hintLabel}</small>${esc(it.a || it.hint || "")}</div>
        <div class="card__foot">
          <span class="pts-label">${T.points}</span>
          <div class="points">
            ${[0, 1, 2, 3].map((n) => `<button class="pt${n === 3 ? " pt--3" : ""}" data-act="score" data-p="${n}"><b>${n}</b><span>${T.pts[n]}</span></button>`).join("")}
          </div>
          <div class="card__actions">
            <span class="hint-tip">${T.holdHint}</span>
            ${it.a ? `<button class="btn" data-act="reveal" aria-pressed="${c.reveal}">${T.showAnswer} <kbd>A</kbd></button>` : ""}
            <button class="btn" data-act="another">${T.another} <kbd>R</kbd></button>
          </div>
        </div>`;
    } else if (c.kind === "b") {
      html = `
        <div class="card__head"><span class="chip chip--b">${T.bonusChip}</span>${teamChip}</div>
        <p class="card__q">${esc(L(c.item))}</p>
        <div class="card__effect card__effect--b">${effectText(c.item.effect)}</div>
        <div class="card__foot"><span class="spacer"></span><button class="btn btn--primary btn--large" data-act="bonus">${T.cont} <kbd>Space</kbd></button></div>`;
    } else if (c.kind === "t") {
      const it = L(c.item);
      html = `
        <div class="card__head"><span class="chip chip--t">${T.trapChip}</span>${teamChip}</div>
        <p class="card__q">${esc(it.text)}</p>
        <div class="card__effect card__effect--t">${effectText(c.item.effect)}</div>
        <div class="save">
          <div class="save__txt"><small>${T.saveLabel}</small><p>${esc(it.save)}</p></div>
          ${timerHTML()}
        </div>
        <div class="hint" hidden><small>${T.hintLabel}</small>${esc(it.hint || "")}</div>
        <div class="card__foot">
          <button class="btn btn--good btn--large" data-act="saved">${T.saved} <kbd>S</kbd></button>
          <span class="spacer"></span>
          <span class="hint-tip">${T.holdHint}</span>
          <button class="btn btn--large" data-act="penalty">${T.penalty} <kbd>Space</kbd></button>
        </div>`;
    } else if (c.kind === "finish") {
      const others = state.teams.filter((x) => !x.finished).length;
      html = `
        <div class="card__head"><span class="chip chip--p">${T.finishChip}</span>${teamChip}</div>
        <div class="card__place"><img src="assets/finish.png" alt=""></div>
        <p class="card__q">${esc(L(topic()).finish.replace("{team}", t.name))}</p>
        <div class="card__say"><small>${T.note}</small>${c.first && others ? T.finishNoteFirst : T.finishNote}</div>
        <div class="card__foot"><span class="spacer"></span><button class="btn btn--primary btn--large" data-act="finish">${T.cont} <kbd>Space</kbd></button></div>`;
    }

    const card = $("#card");
    const key = c.uid + ":" + lang;
    if (card.dataset.uid !== key) {
      const fresh = (card.dataset.uid || "").split(":")[0] !== String(c.uid);
      card.innerHTML = html;
      card.dataset.uid = key;
      card.lang = lang === "kz" ? "kk" : "ru";
      if (fresh) { card.style.animation = "none"; void card.offsetWidth; card.style.animation = ""; }
    }
    ov.hidden = false;

    if (cardTimer.uid !== c.uid) {
      cardTimer = { uid: c.uid, total: config.answer * 1000, left: config.answer * 1000, paused: false };
    }
    paintTimer();
  }

  function render(opts) {
    if (!state) return;
    renderBoard();
    renderSide(opts);
    renderCard();
  }

  function floatPoints(i, txt, neg) {
    const cell = document.querySelector(`[data-row="${i}"] .score-row__pts`);
    if (!cell) return;
    const f = document.createElement("span");
    f.className = "float" + (neg ? " neg" : "");
    f.textContent = txt.replace("-", "−");
    cell.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }

  /* ============ Banner ============ */
  function renderBanner() {
    const b = $("#banner");
    if (bannerTimeout) return;
    if (state && state.finalRound && state.phase !== "over") {
      b.textContent = state.finalReason === "time" ? T.timeUpBanner : T.finishBanner;
      b.hidden = false;
    } else b.hidden = true;
  }
  function flashBanner(text) {
    const b = $("#banner");
    clearTimeout(bannerTimeout);
    b.textContent = text;
    b.hidden = false;
    b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
    bannerTimeout = setTimeout(() => { bannerTimeout = null; renderBanner(); }, 2200);
  }
  function hideBanner() { clearTimeout(bannerTimeout); bannerTimeout = null; $("#banner").hidden = true; }

  /* ============ End ============ */
  function endGame() {
    anim++;
    state.phase = "over";
    $("#overlay").hidden = true;
    hideBanner();
    renderResults();
    show("results");
    Sound.win();
  }

  function renderResults() {
    const ranked = state.teams.slice().sort((a, b) => b.points - a.points || progress(b) - progress(a));
    const top = ranked[0], second = ranked[1];
    const tie = second && second.points === top.points && progress(second) === progress(top);
    $("#results-title").textContent = tie ? T.tie : T.wins(top.name);
    $("#results-eyebrow").textContent = state.finalReason === "time" ? T.timeUp : T.gameOver;
    let rank = 0, prev = null;
    $("#podium").innerHTML = ranked.map((t, i) => {
      const key = t.points + ":" + progress(t);
      if (key !== prev) rank = i + 1;
      prev = key;
      return `<li class="${rank === 1 ? "is-win" : ""}"><span class="rank">${rank}</span><i class="dotc" style="background:${t.color}"></i><span>${esc(t.name)}</span><span class="pts">${t.points}</span></li>`;
    }).join("");
    $("#results-q").innerHTML = L(topic()).final;
  }

  /* ============ Screens ============ */
  function show(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === "screen-" + name));
    if (name !== "game") { $("#overlay").hidden = true; $("#help").hidden = true; }
  }

  /* ============ Static text ============ */
  function applyStatic() {
    document.documentElement.lang = lang === "kz" ? "kk" : "ru";
    document.title = T.docTitle;
    document.querySelectorAll("[data-t]").forEach((n) => {
      const v = T[n.dataset.t];
      if (typeof v !== "string") return;
      (n.querySelector("span") || n).textContent = v;
    });
    $("#rules").innerHTML = T.rules.map((r, i) => `<li><span class="rules__n">${i + 1}</span>${esc(r)}</li>`).join("");
    document.querySelectorAll(".lang").forEach((g) => {
      const bs = [...g.querySelectorAll("button")];
      bs.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.lang === lang)));
      g.style.setProperty("--n", bs.length);
      g.style.setProperty("--i", Math.max(0, bs.findIndex((b) => b.dataset.lang === lang)));
    });
    $("#legend").innerHTML = ["q", "b", "t", "p"].map((k) => `<span><i class="dot dot--${k}"></i>${T.legend[k]}</span>`).join("");
    $("#help-grid").innerHTML = T.help.map(([k, v]) => `<div>${k.split(" / ").map((x) => `<kbd>${esc(x)}</kbd>`).join(" / ")} ${esc(v)}</div>`).join("");
    const A = T.aria;
    [["#btn-undo", A.undo], ["#btn-sound", A.sound], ["#btn-full", A.full], ["#btn-help", A.help], ["#btn-exit", A.exit], ["#clock", A.clock]].forEach(([s, v]) => {
      const n = $(s); n.setAttribute("aria-label", v); n.title = v;
    });
    const tt = state ? state.topic : config.topic;
    $("#topbar-topic").textContent = L(D.topics[tt]).short;
  }

  /* ============ Setup ============ */
  let placeholderPool = shuffle(window.HK_TEAM_NAMES);
  let setupReady = false;
  function currentPlaceholders() { return placeholderPool.slice(0, 4); }

  function renderSetup() {
    document.querySelectorAll("#seg-topic button").forEach((b) => { b.textContent = L(D.topics[b.dataset.v]).short; });
    document.querySelectorAll("#seg-level button").forEach((b) => { b.textContent = T.levels[Number(b.dataset.v) - 1]; });
    document.querySelectorAll("#seg-time button").forEach((b) => { b.textContent = `${b.dataset.v} ${T.min}`; });
    document.querySelectorAll("#seg-answer button").forEach((b) => { b.textContent = `${b.dataset.v} ${T.sec}`; });
    const about = $("#topic-about"), txt = L(D.topics[config.topic]).about;
    if (about.textContent !== txt) { about.textContent = txt; if (setupReady) replay(about, "swap"); }
    setSeg("#seg-topic", config.topic);
    setSeg("#seg-level", config.level);
    setSeg("#seg-teams", config.teams);
    setSeg("#seg-time", config.minutes);
    setSeg("#seg-answer", config.answer);
    syncTeamRows();
  }

  // Перезапуск короткой CSS-анимации на элементе.
  function replay(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

  // Строки команд не пересоздаются: обновляется только то, что изменилось,
  // новые строки плавно раскрываются, лишние плавно сворачиваются.
  function syncTeamRows() {
    const rows = $("#team-rows");
    const ph = currentPlaceholders();
    const live = () => [...rows.children].filter((r) => !r.classList.contains("is-leaving"));
    while (live().length < config.teams) {
      const back = rows.querySelector(".is-leaving");
      if (back) { back.classList.remove("is-leaving"); slide(back, true); continue; }
      const i = live().length;
      const slot = document.createElement("div");
      slot.className = "team-slot";
      slot.innerHTML = `
        <div class="team-row">
          <i class="team-row__dot" style="background:${TEAM_COLORS[i]}"></i>
          <input type="text" maxlength="18" data-i="${i}">
          <div class="stepper">
            <button type="button" data-step="-1" data-i="${i}">−</button>
            <output></output>
            <button type="button" data-step="1" data-i="${i}">+</button>
          </div>
        </div>`;
      rows.appendChild(slot);
      if (setupReady) slide(slot, true);
    }
    live().slice(config.teams).forEach((slot) => { slot.classList.add("is-leaving"); slide(slot, false); });
    live().forEach((slot, i) => {
      const inp = slot.querySelector("input");
      inp.placeholder = ph[i];
      inp.setAttribute("aria-label", T.teamName(i + 1));
      const name = config.names[i] || "";
      if (document.activeElement !== inp && inp.value !== name) inp.value = name;
      const out = slot.querySelector("output"), txt = T.players(config.players[i]);
      if (out.textContent !== txt) out.textContent = txt;
      slot.querySelector('[data-step="-1"]').setAttribute("aria-label", T.fewer);
      slot.querySelector('[data-step="1"]').setAttribute("aria-label", T.more);
    });
  }

  function slide(el, open) {
    const token = (el._slide = (el._slide || 0) + 1);
    const done = () => {
      if (el._slide !== token) return;
      if (!open) return el.remove();
      el.classList.remove("is-sliding");
      el.style.height = el.style.opacity = "";
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
    const fresh = open && !el.style.height;          // новая строка: растёт с нуля
    const from = fresh ? 0 : el.offsetHeight;          // иначе с текущей высоты, даже посреди анимации
    el.classList.add("is-sliding");
    el.style.transition = "none";
    el.style.height = from + "px";
    if (fresh) el.style.opacity = "0";
    void el.offsetHeight;
    el.style.transition = "";
    el.style.height = (open ? el.scrollHeight : 0) + "px";
    el.style.opacity = open ? "1" : "0";
    setTimeout(done, 340);
  }

  function setSeg(sel, v) {
    const g = $(sel), bs = [...g.querySelectorAll("button")];
    const i = bs.findIndex((b) => b.dataset.v === String(v));
    bs.forEach((b, k) => b.setAttribute("aria-checked", String(k === i)));
    g.style.setProperty("--n", bs.length);
    g.style.setProperty("--i", Math.max(0, i));
  }
  function segClick(sel, fn) {
    $(sel).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; fn(b.dataset.v); Sound.click(); renderSetup(); saveConfig(); });
  }

  segClick("#seg-topic", (v) => { config.topic = v; $("#topbar-topic").textContent = L(D.topics[v]).short; });
  segClick("#seg-level", (v) => { config.level = Number(v); });
  segClick("#seg-teams", (v) => {
    const n = Number(v);
    if (n !== config.teams) { config.teams = n; const per = Math.round(18 / n); config.players = config.players.map(() => per); }
  });
  segClick("#seg-time", (v) => { config.minutes = Number(v); });
  segClick("#seg-answer", (v) => { config.answer = Number(v); });
  $("#team-rows").addEventListener("input", (e) => {
    if (e.target.matches("input")) { config.names[Number(e.target.dataset.i)] = e.target.value; saveConfig(); }
  });
  $("#team-rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]"); if (!b) return;
    const i = Number(b.dataset.i);
    const v = Math.max(1, Math.min(12, config.players[i] + Number(b.dataset.step)));
    if (v === config.players[i]) { replay(b.closest(".stepper"), "nope"); return; }
    config.players[i] = v;
    Sound.click(); syncTeamRows(); saveConfig();
    replay(b.closest(".stepper").querySelector("output"), "bump");
  });
  $("#setup-form").addEventListener("submit", (e) => { e.preventDefault(); Sound.unlock(); applyStatic(); newGame(); applyStatic(); });
  document.querySelectorAll(".lang").forEach((g) => g.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]"); if (!b) return;
    setLang(b.dataset.lang); b.blur();
  }));

  /* ============ Game UI events ============ */
  document.addEventListener("click", (e) => {
    Sound.unlock();
    const a = e.target.closest("[data-act]");
    if (!a || !state) return;
    const act = a.dataset.act;
    if (act === "roll") roll();
    else if (act === "go") go();
    else if (act === "fork") chooseFork(Number(a.dataset.i));
    else if (act === "skip") continueSkip();
    else if (act === "score") score(Number(a.dataset.p));
    else if (act === "another") anotherQuestion();
    else if (act === "reveal") revealAnswer();
    else if (act === "bonus") applyBonus();
    else if (act === "saved") resolveTrap(true);
    else if (act === "penalty") resolveTrap(false);
    else if (act === "finish") continueFinish();
    else if (act === "timer") toggleCardTimer();
    if (a.blur) a.blur();
  });

  function toggleCardTimer() {
    if (state.phase !== "card") return;
    cardTimer.paused = !cardTimer.paused;
    paintTimer();
  }
  function toggleHelp(force) {
    const h = $("#help");
    h.hidden = force != null ? !force : !h.hidden;
  }
  function toggleSound() {
    const m = Sound.toggle();
    $("#btn-sound").classList.toggle("is-muted", m);
  }
  function toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen && document.exitFullscreen();
  }
  function exitGame() {
    if (!state || state.phase === "over") return;
    if (confirm(T.confirmEnd)) endGame();
  }

  $("#btn-undo").addEventListener("click", (e) => { undo(); e.currentTarget.blur(); });
  $("#btn-sound").addEventListener("click", (e) => { toggleSound(); e.currentTarget.blur(); });
  $("#btn-full").addEventListener("click", (e) => { toggleFull(); e.currentTarget.blur(); });
  $("#btn-help").addEventListener("click", (e) => { toggleHelp(); e.currentTarget.blur(); });
  $("#btn-exit").addEventListener("click", (e) => { e.currentTarget.blur(); exitGame(); });
  $("#clock").addEventListener("click", () => { clock.paused = !clock.paused; });
  $("#help").addEventListener("click", (e) => { if (e.target.id === "help" || e.target.closest("[data-close-help]")) toggleHelp(false); });
  $("#btn-again").addEventListener("click", () => newGame());
  $("#btn-newteams").addEventListener("click", () => { placeholderPool = shuffle(window.HK_TEAM_NAMES); state = null; renderSetup(); show("setup"); });
  $("#btn-sound").classList.toggle("is-muted", Sound.muted);

  /* ============ Keyboard ============ */
  // Клавиши по e.code: работают и на русской, и на казахской раскладке.
  function showHint(on) {
    const h = $("#card .hint");
    if (h && state && state.phase === "card") h.hidden = !on;
  }

  document.addEventListener("keydown", (e) => {
    Sound.unlock();
    const active = document.querySelector(".screen.is-active").id;
    const k = e.key;
    const code = e.code;
    const typing = e.target.matches && e.target.matches("input");
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (code === "KeyL" && !typing) { e.preventDefault(); return setLang(lang === "kz" ? "ru" : "kz"); }
    if (active === "screen-setup") {
      if (k === "Enter" && !typing) { e.preventDefault(); $("#setup-form").requestSubmit(); }
      return;
    }
    if (active === "screen-results" || !state) return;

    const helpOpen = !$("#help").hidden;
    if (helpOpen) {
      if (k === "Escape" || k === "?" || code === "Slash" || k === "Enter") { e.preventDefault(); toggleHelp(false); }
      return;
    }

    if (code === "Space" || k === "Enter" || k.startsWith("Arrow") || k === "Backspace") e.preventDefault();
    if (e.repeat && code !== "KeyH") return;

    if (k === "Backspace") return undo();
    if (code === "KeyM") return toggleSound();
    if (code === "KeyF") return toggleFull();
    if (k === "?" || code === "Slash") return toggleHelp(true);
    if (code === "KeyP") { clock.paused = !clock.paused; return; }
    if (k === "Escape") return;

    const go_ = code === "Space" || k === "Enter";
    const p = state.phase;
    if (p === "roll" && go_) return roll();
    if (p === "rolled" && go_) return go();
    if (p === "skip" && go_) return continueSkip();
    if (p === "fork") {
      if (k === "ArrowUp" || k === "ArrowLeft" || code === "Digit1") return chooseFork(0);
      if (k === "ArrowDown" || k === "ArrowRight" || code === "Digit2") return chooseFork(1);
      return;
    }
    if (p === "card" && state.card) {
      const c = state.card;
      if (code === "KeyH") return showHint(true);
      if (code === "KeyT") return toggleCardTimer();
      if (c.kind === "q") {
        const d = /^Digit([0-3])$/.exec(code) || /^Numpad([0-3])$/.exec(code);
        if (d) return score(Number(d[1]));
        if (code === "KeyR") return anotherQuestion();
        if (code === "KeyA") return revealAnswer();
      } else if (c.kind === "b" && go_) return applyBonus();
      else if (c.kind === "t") {
        if (code === "KeyS") return resolveTrap(true);
        if (go_) return resolveTrap(false);
      } else if (c.kind === "finish" && go_) return continueFinish();
    }
  });
  document.addEventListener("keyup", (e) => { if (e.code === "KeyH") showHint(false); });
  window.addEventListener("blur", () => showHint(false));

  /* ============ Boot ============ */
  // Подложка, которая переезжает к выбранной кнопке в переключателях.
  document.querySelectorAll(".segmented, .lang").forEach((g) => g.insertAdjacentHTML("afterbegin", '<span class="seg-thumb" aria-hidden="true"></span>'));
  applyStatic();
  renderSetup();
  requestAnimationFrame(() => requestAnimationFrame(() => { setupReady = true; document.body.classList.add("is-ready"); }));
  requestAnimationFrame(tickClock);
})();
