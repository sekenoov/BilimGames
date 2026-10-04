/* Tech Trail — game logic. Plain script (works from file://). */
(function () {
  "use strict";

  const D = window.TT_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const WORDS = ["zero", "one", "two", "three", "four"];
  const TEAM_COLORS = ["#7A5AF8", "#F97316", "#EC4899", "#334155"];

  /* ============ Board ============ */
  // Upper branch = "turn left", lower branch = "turn right" (the map is read left → right).
  const NODES = {
    home:    { x: 100,  y: 540, place: "home",    next: ["a1"] },
    a1:      { x: 255,  y: 540, next: ["u1", "gaming"] },
    u1:      { x: 325,  y: 335, next: ["school"] },
    school:  { x: 480,  y: 215, place: "school",  next: ["u2"] },
    u2:      { x: 635,  y: 335, next: ["cafe"] },
    gaming:  { x: 420,  y: 850, place: "gaming",  next: ["d1"] },
    d1:      { x: 600,  y: 800, next: ["cafe"], risky: true },
    cafe:    { x: 750,  y: 540, place: "cafe",    next: ["b1"] },
    b1:      { x: 900,  y: 540, next: ["p1", "mall"] },
    p1:      { x: 970,  y: 335, next: ["park"] },
    park:    { x: 1120, y: 215, place: "park",    next: ["p2"] },
    p2:      { x: 1275, y: 335, next: ["techlab"] },
    mall:    { x: 1060, y: 850, place: "mall",    next: ["m1"] },
    m1:      { x: 1240, y: 800, next: ["techlab"], risky: true },
    techlab: { x: 1345, y: 540, place: "techlab", next: ["finish"] },
    finish:  { x: 1515, y: 540, place: "finish",  next: [] }
  };
  const PLACE_R = 70, CELL_R = 34, TOKEN_R = 24;

  // Distance (in steps) from each node to the finish, for progress bars.
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

  /* ============ State ============ */
  let state = null;
  let history = [];
  let config = loadConfig();
  let clock = { left: 0, paused: false, last: 0, low: false };
  let anim = 0;                 // bumps to cancel running animations
  let cardTimer = { uid: null, total: 0, left: 0, paused: false };
  let bannerTimeout = null;

  function loadConfig() {
    const def = { teams: 3, names: ["", "", "", ""], players: [6, 6, 6, 6], minutes: 15, answer: 45 };
    try { return Object.assign(def, JSON.parse(localStorage.getItem("tt-config") || "{}")); } catch (e) { return def; }
  }
  function saveConfig() { try { localStorage.setItem("tt-config", JSON.stringify(config)); } catch (e) {} }

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
        path: ["home"],
        skip: false,
        finished: false
      });
    }
    state = {
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
    hideBanner(true);
    render();
  }

  // Random cell types every game → a different board each time.
  function layoutTypes() {
    const types = {};
    const plain = Object.keys(NODES).filter((id) => !NODES[id].place);
    for (const id of plain) {
      const r = Math.random();
      types[id] = NODES[id].risky ? (r < 0.6 ? "t" : "b") : (r < 0.5 ? "q" : r < 0.75 ? "b" : "t");
    }
    // Guarantee a mix: at least one bonus and one trap on the safe cells.
    const safe = plain.filter((id) => !NODES[id].risky);
    const count = (t) => safe.filter((id) => types[id] === t).length;
    if (!count("b")) types[safe[rand(safe.length)]] = "b";
    if (!count("t")) { const qs = safe.filter((id) => types[id] === "q"); types[(qs.length ? qs : safe)[rand((qs.length ? qs : safe).length)]] = "t"; }
    if (!count("q")) { const bs = safe.filter((id) => types[id] !== "q"); types[bs[rand(bs.length)]] = "q"; }
    return types;
  }

  function draw(name, list) {
    let d = state.decks[name];
    if (!d || d.i >= d.order.length) {
      const last = d ? d.order[d.order.length - 1] : -1;
      let order = shuffle(list.map((_, i) => i));
      if (order.length > 1 && order[0] === last) order.push(order.shift());
      d = state.decks[name] = { order, i: 0 };
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
  const nodeType = (id) => NODES[id].place ? (id === "finish" ? "finish" : "p") : state.types[id];
  const placeName = (id) => D.places[NODES[id].place].name;
  function forkOptions(id) {
    const n = NODES[id].next;
    return n.map((to, i) => {
      // name the road after the place it leads to
      let x = to; while (!NODES[x].place) x = NODES[x].next[0];
      return { to, dir: i === 0 ? "left" : "right", key: i === 0 ? "↑" : "↓", place: placeName(x), blurb: D.places[NODES[x].place].blurb };
    });
  }
  function progress(t) {
    const total = DIST.home;
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
    if (type === "p") {
      const place = NODES[here].place;
      const item = draw("place:" + place, D.places[place].questions);
      openCard({ kind: "q", place, cat: "Place challenge", q: item.q, say: item.say, hint: item.hint });
      return;
    }
    if (type === "q") {
      const item = draw("q", D.questions);
      openCard({ kind: "q", cat: item.cat, q: item.q, say: item.say, hint: item.hint });
      return;
    }
    if (chain) { endTurn(); return; }            // bonus steps don't trigger another bonus/trap
    if (type === "b") { openCard(Object.assign({ kind: "b" }, draw("b", D.bonuses))); return; }
    if (type === "t") { openCard(Object.assign({ kind: "t" }, draw("t", D.traps))); return; }
    endTurn();
  }

  function openCard(card) {
    card.uid = ++state.uid;
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
    const item = c.place ? draw("place:" + c.place, D.places[c.place].questions) : draw("q", D.questions);
    const next = { kind: "q", place: c.place, cat: c.place ? "Place challenge" : item.cat, q: item.q, say: item.say, hint: item.hint };
    next.uid = ++state.uid;
    state.card = next;
    Sound.click();
    render();
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
    const e = c.effect;
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
      flashBanner("Roll again!");
      render();
    }
  }

  function resolveTrap(saved) {
    const c = state.card;
    if (!c || c.kind !== "t") return;
    snapshot();
    const t = team();
    const i = state.cur;
    if (saved) { Sound.saved(); endTurn(); flashBanner(t.name + " saved themselves!"); return; }
    const e = c.effect;
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

  // Advance to the next team. Game ends after the last team of the final round.
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
        // If the round just ended with no one mid-turn, the game ends at the next endTurn.
      }
    }
    const s = Math.ceil(clock.left / 1000);
    const txt = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    const el = $("#clock-text");
    if (el.textContent !== txt) el.textContent = txt;
    $("#clock").classList.toggle("is-paused", clock.paused);
    $("#clock").classList.toggle("is-low", s <= 60);

    // Answer timer
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

  function buildBoard() {
    const svg = $("#board");
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
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
      if (n.place) {
        g.setAttribute("class", "place place--" + n.place);
        const clip = el("clipPath", { id: "clip-" + id }, defs);
        el("circle", { r: PLACE_R - 6 }, clip);
        el("circle", { class: "pulse", r: PLACE_R }, g);
        el("circle", { class: "ring", r: PLACE_R }, g);
        el("image", { href: `assets/${n.place}.png`, x: -(PLACE_R - 6), y: -(PLACE_R - 6), width: (PLACE_R - 6) * 2, height: (PLACE_R - 6) * 2, "clip-path": `url(#clip-${id})`, preserveAspectRatio: "xMidYMid slice" }, g);
        el("circle", { class: "ring-accent", r: PLACE_R - 3 }, g);
        const label = el("text", { class: "place-label", y: PLACE_R + 42 }, g);
        label.textContent = D.places[n.place].name;
        const sub = D.places[n.place].blurb;
        if (id === "home") { const s = el("text", { class: "start-label", y: -PLACE_R - 18 }, g); s.textContent = "START"; }
        else if (sub) { const s = el("text", { class: "place-sub", y: PLACE_R + 70 }, g); s.textContent = sub; }
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
    // Fork highlight
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
        const x = (a.x + b.x) / 2 - 64, y = (a.y + b.y) / 2 + (o.dir === "left" ? -6 : 6);
        const g = el("g", { class: "fork-tag", transform: `translate(${x} ${y})` }, tags);
        el("rect", { x: -62, y: -22, width: 124, height: 44, rx: 22 }, g);
        const t = el("text", { y: 8 }, g);
        t.textContent = `${o.key}  ${o.dir.toUpperCase()}`;
      });
    }

    // Tokens
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
      layer.appendChild(g); // keeps current team on top
      const id = at(t);
      const n = NODES[id];
      const same = groups[id];
      const k = same.indexOf(i), m = same.length;
      let dx = 0, dy = 0;
      if (n.place) { dy = PLACE_R - 12; dx = (k - (m - 1) / 2) * 44; }
      else if (m > 1) { const ang = (Math.PI * 2 * k) / m - Math.PI / 2; dx = Math.cos(ang) * 24; dy = Math.sin(ang) * 24; }
      g.style.transform = `translate(${n.x + dx}px, ${n.y + dy}px)`;
      g.classList.toggle("is-current", i === state.cur && !state.teams[i].finished);
    });
  }

  /* ============ Rendering: side panel ============ */
  function dieHTML(v, rolling) {
    const pips = { 1: [4], 2: [0, 8], 3: [0, 4, 8] }[v] || [];
    let s = "";
    for (let i = 0; i < 9; i++) s += `<i class="${pips.includes(i) ? "on" : ""}"></i>`;
    if (!v) return `<div class="die die--empty" aria-label="Dice not rolled">?</div>`;
    return `<div class="die${rolling ? " is-rolling" : ""}" aria-label="Dice: ${v}">${s}</div>`;
  }

  function sayPhrase() {
    const n = WORDS[state.die] || state.die;
    const s = state.die === 1 ? "step" : "steps";
    const v = [`Move ${n} ${s}, please!`, `Go ${n} ${s} forward!`, `${cap(n)} ${s} forward, please!`];
    return v[state.turn % v.length];
  }
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  function renderSide(opts = {}) {
    const t = team();
    const turn = $("#turn");
    turn.style.setProperty("--team", t.color);
    let dots = "";
    for (let i = 1; i <= t.players; i++) dots += `<i class="${i === t.speaker ? "on" : ""}"></i>`;
    let body = "";
    const p = state.phase;

    if (p === "roll") {
      body = `<div class="say"><small>Say</small>“Roll the dice, please!”</div>
        <div class="turn__row">${dieHTML(null)}<div class="status">Speaker ${t.speaker} asks the operator to roll.</div></div>
        <button class="btn btn--primary btn--large" data-act="roll">Roll the dice <kbd>Space</kbd></button>`;
    } else if (p === "rolled") {
      body = `<div class="turn__row">${dieHTML(state.die, opts.rolling)}<div class="steps-left"><b>${state.die}</b>${state.die === 1 ? "step" : "steps"}</div></div>
        <div class="say"><small>Say</small>“${esc(sayPhrase())}”</div>
        <button class="btn btn--primary btn--large" data-act="go">Go <kbd>Space</kbd></button>`;
    } else if (p === "moving") {
      body = `<div class="turn__row">${dieHTML(state.chain ? null : state.die)}<div class="steps-left"><b>${state.stepsLeft}</b>${state.stepsLeft === 1 ? "step" : "steps"} left</div></div>`;
    } else if (p === "fork") {
      const o = forkOptions(at(t));
      body = `<div class="say"><small>Say</small>“Turn ${o[0].dir} to the ${esc(o[0].place)}!” or “Turn ${o[1].dir} to the ${esc(o[1].place)}!”</div>
        <div class="forks">${o.map((x, i) => `<button class="fork-btn" data-act="fork" data-i="${i}"><kbd>${x.key}</kbd><b>Turn ${x.dir} · ${esc(x.place)}</b><span>${esc(x.blurb)}</span></button>`).join("")}</div>
        <div class="status">${state.stepsLeft} ${state.stepsLeft === 1 ? "step" : "steps"} left</div>`;
    } else if (p === "skip") {
      body = `<div class="status"><b>${esc(t.name)}</b> must skip this turn — too tired after a late night online.</div>
        <button class="btn btn--primary btn--large" data-act="skip">Next team <kbd>Space</kbd></button>`;
    } else if (p === "card") {
      body = `<div class="status">Speaker ${t.speaker} is answering…</div>`;
    }

    turn.innerHTML = `
      <div class="turn__label">${state.finalRound ? "Final round" : "Round " + state.round} · Now playing</div>
      <div class="turn__team">${esc(t.name)}</div>
      <div class="speaker"><span>Speaker ${t.speaker} of ${t.players}</span><span class="speaker__dots">${dots}</span></div>
      <div class="turn__body">${body}</div>`;

    // Scores
    const rows = state.teams.map((x, i) => `
      <div class="score-row${i === state.cur ? " is-current" : ""}" data-row="${i}">
        <i class="score-row__dot" style="background:${x.color}"></i>
        <div class="score-row__name">${esc(x.name)}${x.finished ? "<small>finished</small>" : x.skip ? "<small>skips next</small>" : ""}</div>
        <div class="score-row__pts">${x.points}</div>
        <div class="score-row__bar"><i style="width:${Math.round(progress(x) * 100)}%;background:${x.color}"></i></div>
      </div>`).join("");
    $("#scores").innerHTML = `<div class="scores__title">Points</div>${rows}`;

    // Contextual keys
    const k = {
      roll: [["Space", "Roll"]],
      rolled: [["Space", "Go"]],
      moving: [],
      fork: [["↑", "Left road"], ["↓", "Right road"]],
      skip: [["Space", "Next team"]],
      card: state.card && state.card.kind === "q" ? [["0–3", "Points"], ["H", "Hint"], ["R", "New question"], ["T", "Pause timer"]]
        : state.card && state.card.kind === "t" ? [["S", "Saved"], ["Space", "Penalty"], ["H", "Hint"]]
        : [["Space", "Continue"]]
    }[p] || [];
    k.push(["⌫", "Undo"], ["?", "Help"]);
    $("#keys").innerHTML = k.map(([a, b]) => `<span><kbd>${a}</kbd>${b}</span>`).join("");
  }

  /* ============ Rendering: card ============ */
  function effectText(e, kind) {
    if (e.steps) return `+${e.steps} ${e.steps === 1 ? "step" : "steps"} forward`;
    if (e.points > 0) return `+${e.points} ${e.points === 1 ? "point" : "points"}`;
    if (e.points < 0) return `${e.points} point`;
    if (e.again) return "Roll again!";
    if (e.skip) return "Skip your next turn";
    if (e.back) return `Go back ${e.back} ${e.back === 1 ? "step" : "steps"}`;
    return "";
  }

  function timerHTML() {
    return `<div class="timer" data-act="timer" title="Pause / resume — T"><svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="27"/><circle class="bar" cx="32" cy="32" r="27" stroke-dasharray="169.6" stroke-dashoffset="0"/></svg><span></span></div>`;
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
    const teamChip = `<span class="chip chip--team"><i style="background:${t.color}"></i>${esc(t.name)} · Speaker ${t.speaker}</span>`;
    let html = "";

    if (c.kind === "q") {
      const place = c.place ? D.places[c.place] : null;
      html = `
        <div class="card__head">
          <span class="chip ${place ? "chip--p" : "chip--q"}">${esc(c.cat)}</span>${teamChip}${timerHTML()}
        </div>
        ${place ? `<div class="card__place"><img src="assets/${c.place}.png" alt=""><b>${esc(place.name)}</b></div>` : ""}
        <p class="card__q${c.q.length > 70 ? " is-long" : ""}">${esc(c.q)}</p>
        ${c.say ? `<div class="card__say"><small>Try</small>${esc(c.say)}</div>` : ""}
        <div class="hint" hidden><small>Teacher hint</small>${esc(c.hint || "")}</div>
        <div class="card__foot">
          <span class="pts-label">Points</span>
          <div class="points">
            <button class="pt" data-act="score" data-p="0"><b>0</b><span>No answer</span></button>
            <button class="pt" data-act="score" data-p="1"><b>1</b><span>Okay</span></button>
            <button class="pt" data-act="score" data-p="2"><b>2</b><span>Good</span></button>
            <button class="pt pt--3" data-act="score" data-p="3"><b>3</b><span>Excellent</span></button>
          </div>
          <span class="spacer"></span>
          <span class="hint-tip">Hold <kbd>H</kbd> for hint</span>
          <button class="btn" data-act="another">New question <kbd>R</kbd></button>
        </div>`;
    } else if (c.kind === "b") {
      html = `
        <div class="card__head"><span class="chip chip--b">Bonus · Technology helps</span>${teamChip}</div>
        <p class="card__q">${esc(c.text)}</p>
        <div class="card__effect card__effect--b">${effectText(c.effect)}</div>
        <div class="card__foot"><span class="spacer"></span><button class="btn btn--primary btn--large" data-act="bonus">Continue <kbd>Space</kbd></button></div>`;
    } else if (c.kind === "t") {
      html = `
        <div class="card__head"><span class="chip chip--t">Trap · Technology harms</span>${teamChip}</div>
        <p class="card__q">${esc(c.text)}</p>
        <div class="card__effect card__effect--t">${effectText(c.effect)}</div>
        <div class="save">
          <div class="save__txt"><small>Save yourself! Answer well and avoid the penalty</small><p>${esc(c.save)}</p></div>
          ${timerHTML()}
        </div>
        <div class="hint" hidden><small>Teacher hint</small>${esc(c.hint || "")}</div>
        <div class="card__foot">
          <button class="btn btn--good btn--large" data-act="saved">Saved! <kbd>S</kbd></button>
          <span class="spacer"></span>
          <span class="hint-tip">Hold <kbd>H</kbd> for hint</span>
          <button class="btn btn--large" data-act="penalty">Take the penalty <kbd>Space</kbd></button>
        </div>`;
    } else if (c.kind === "finish") {
      const others = state.teams.filter((x) => !x.finished).length;
      html = `
        <div class="card__head"><span class="chip chip--p">Finish</span>${teamChip}</div>
        <div class="card__place"><img src="assets/finish.png" alt=""></div>
        <p class="card__q">${esc(t.name)} finished the digital day!</p>
        <div class="card__say"><small>Note</small>${c.first && others ? "Final round: the other teams play until the end of this round. Most points wins!" : "Points decide the winner."}</div>
        <div class="card__foot"><span class="spacer"></span><button class="btn btn--primary btn--large" data-act="finish">Continue <kbd>Space</kbd></button></div>`;
    }

    const card = $("#card");
    if (card.dataset.uid !== String(c.uid)) {
      card.innerHTML = html;
      card.dataset.uid = String(c.uid);
      // restart animation
      card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
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
    f.textContent = txt;
    cell.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }

  /* ============ Banner ============ */
  function renderBanner() {
    const b = $("#banner");
    if (bannerTimeout) return;
    if (state && state.finalRound) {
      b.textContent = state.finalReason === "time" ? "Time’s up! Final round" : "A team has finished! Final round";
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
    const ranked = state.teams.slice().sort((a, b) => b.points - a.points || progress(b) - progress(a));
    const top = ranked[0], second = ranked[1];
    const tie = second && second.points === top.points && progress(second) === progress(top);
    $("#results-title").textContent = tie ? "It’s a tie!" : `${top.name} win${top.name.match(/s$/i) ? "" : "s"}!`;
    $("#results-eyebrow").textContent = state.finalReason === "time" ? "Time’s up" : "Game over";
    let rank = 0, prev = null;
    $("#podium").innerHTML = ranked.map((t, i) => {
      const key = t.points + ":" + progress(t);
      if (key !== prev) rank = i + 1;
      prev = key;
      return `<li class="${rank === 1 ? "is-win" : ""}"><span class="rank">${rank}</span><i class="dotc" style="background:${t.color}"></i><span>${esc(t.name)}</span><span class="pts">${t.points}</span></li>`;
    }).join("");
    $("#results-q").innerHTML = "Last question for everyone: <b>Is technology our friend or our enemy?</b> Each team — one sentence!";
    show("results");
    Sound.win();
  }

  /* ============ Screens ============ */
  function show(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === "screen-" + name));
    if (name !== "game") { $("#overlay").hidden = true; $("#help").hidden = true; }
  }

  /* ============ Setup ============ */
  let placeholderPool = shuffle(D.teamNames);
  function currentPlaceholders() { return placeholderPool.slice(0, 4); }

  let setupReady = false;

  function renderSetup() {
    setSeg("#seg-teams", config.teams);
    setSeg("#seg-time", config.minutes);
    setSeg("#seg-answer", config.answer);
    syncTeamRows();
  }

  // Restart a short CSS animation on an element.
  function replay(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
  const playersText = (n) => `${n} ${n === 1 ? "player" : "players"}`;

  // Team rows are not rebuilt on every click: only what changed is updated,
  // new rows slide open and removed rows slide shut.
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
          <input type="text" maxlength="18" aria-label="Team ${i + 1} name" data-i="${i}">
          <div class="stepper" aria-label="Players in team ${i + 1}">
            <button type="button" data-step="-1" data-i="${i}" aria-label="Fewer players">−</button>
            <output></output>
            <button type="button" data-step="1" data-i="${i}" aria-label="More players">+</button>
          </div>
        </div>`;
      rows.appendChild(slot);
      if (setupReady) slide(slot, true);
    }
    live().slice(config.teams).forEach((slot) => { slot.classList.add("is-leaving"); slide(slot, false); });
    live().forEach((slot, i) => {
      const inp = slot.querySelector("input");
      inp.placeholder = ph[i];
      const name = config.names[i] || "";
      if (document.activeElement !== inp && inp.value !== name) inp.value = name;
      const out = slot.querySelector("output"), txt = playersText(config.players[i]);
      if (out.textContent !== txt) out.textContent = txt;
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
    const fresh = open && !el.style.height;          // a new row grows from zero
    const from = fresh ? 0 : el.offsetHeight;          // otherwise from its current height, even mid-animation
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
    const i = bs.findIndex((b) => Number(b.dataset.v) === Number(v));
    bs.forEach((b, k) => b.setAttribute("aria-checked", String(k === i)));
    g.style.setProperty("--n", bs.length);
    g.style.setProperty("--i", Math.max(0, i));
  }

  $("#seg-teams").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const n = Number(b.dataset.v);
    if (n !== config.teams) {
      config.teams = n;
      const per = Math.round(18 / n);
      config.players = config.players.map(() => per);
    }
    Sound.click(); renderSetup(); saveConfig();
  });
  $("#seg-time").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; config.minutes = Number(b.dataset.v); Sound.click(); renderSetup(); saveConfig(); });
  $("#seg-answer").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; config.answer = Number(b.dataset.v); Sound.click(); renderSetup(); saveConfig(); });
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
  $("#setup-form").addEventListener("submit", (e) => { e.preventDefault(); Sound.unlock(); newGame(); });

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
    if (confirm("End the game now and show the results?")) endGame();
  }

  $("#btn-undo").addEventListener("click", (e) => { undo(); e.currentTarget.blur(); });
  $("#btn-sound").addEventListener("click", (e) => { toggleSound(); e.currentTarget.blur(); });
  $("#btn-full").addEventListener("click", (e) => { toggleFull(); e.currentTarget.blur(); });
  $("#btn-help").addEventListener("click", (e) => { toggleHelp(); e.currentTarget.blur(); });
  $("#btn-exit").addEventListener("click", (e) => { e.currentTarget.blur(); exitGame(); });
  $("#clock").addEventListener("click", () => { clock.paused = !clock.paused; });
  $("#help").addEventListener("click", (e) => { if (e.target.id === "help" || e.target.closest("[data-close-help]")) toggleHelp(false); });
  $("#btn-again").addEventListener("click", () => newGame());
  $("#btn-newteams").addEventListener("click", () => { placeholderPool = shuffle(D.teamNames); renderSetup(); show("setup"); });
  $("#btn-sound").classList.toggle("is-muted", Sound.muted);

  /* ============ Keyboard ============ */
  function showHint(on) {
    const h = $("#card .hint");
    if (h && state && state.phase === "card") h.hidden = !on;
  }

  document.addEventListener("keydown", (e) => {
    Sound.unlock();
    const active = document.querySelector(".screen.is-active").id;
    const k = e.key;
    const typing = e.target.matches && e.target.matches("input");

    if (active === "screen-setup") {
      if (k === "Enter" && !typing) { e.preventDefault(); newGame(); }
      return;
    }
    if (active === "screen-results") return;
    if (!state || e.metaKey || e.ctrlKey || e.altKey) return;

    const helpOpen = !$("#help").hidden;
    if (helpOpen) {
      if (k === "Escape" || k === "?" || k === "/" || k === "Enter") { e.preventDefault(); toggleHelp(false); }
      return;
    }

    if (k === " " || k === "Enter" || k.startsWith("Arrow") || k === "Backspace") e.preventDefault();
    if (e.repeat && k !== "h" && k !== "H") return;

    const lower = k.toLowerCase();
    if (k === "Backspace") return undo();
    if (lower === "m") return toggleSound();
    if (lower === "f") return toggleFull();
    if (k === "?" || k === "/") return toggleHelp(true);
    if (lower === "p") { clock.paused = !clock.paused; return; }
    if (k === "Escape") return;

    const go_ = k === " " || k === "Enter";
    const p = state.phase;
    if (p === "roll" && go_) return roll();
    if (p === "rolled" && go_) return go();
    if (p === "skip" && go_) return continueSkip();
    if (p === "fork") {
      if (k === "ArrowUp" || k === "ArrowLeft" || k === "1") return chooseFork(0);
      if (k === "ArrowDown" || k === "ArrowRight" || k === "2") return chooseFork(1);
      return;
    }
    if (p === "card" && state.card) {
      const c = state.card;
      if (lower === "h") return showHint(true);
      if (lower === "t") return toggleCardTimer();
      if (c.kind === "q") {
        if (/^[0-3]$/.test(k)) return score(Number(k));
        if (lower === "r") return anotherQuestion();
      } else if (c.kind === "b" && go_) return applyBonus();
      else if (c.kind === "t") {
        if (lower === "s") return resolveTrap(true);
        if (go_) return resolveTrap(false);
      } else if (c.kind === "finish" && go_) return continueFinish();
    }
  });
  document.addEventListener("keyup", (e) => { if (e.key.toLowerCase() === "h") showHint(false); });
  window.addEventListener("blur", () => showHint(false));

  /* ============ Boot ============ */
  // A pill that slides to the selected option in segmented controls.
  document.querySelectorAll(".segmented").forEach((g) => g.insertAdjacentHTML("afterbegin", '<span class="seg-thumb" aria-hidden="true"></span>'));
  renderSetup();
  requestAnimationFrame(() => requestAnimationFrame(() => { setupReady = true; document.body.classList.add("is-ready"); }));
  requestAnimationFrame(tickClock);
})();
