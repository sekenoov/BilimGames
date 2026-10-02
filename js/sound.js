/* Tiny synthesized sound kit — no files, works offline. */
window.Sound = (function () {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem("tt-muted") === "1"; } catch (e) {}

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // One soft tone with a quick envelope.
  function tone(freq, start, dur, opts = {}) {
    const a = ac(); if (!a || muted) return;
    const t = a.currentTime + start;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const vol = opts.vol == null ? 0.18 : opts.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function noise(start, dur, vol = 0.08) {
    const a = ac(); if (!a || muted) return;
    const t = a.currentTime + start;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    const f = a.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 0.8;
    const g = a.createGain(); g.gain.value = vol;
    src.buffer = buf; src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  }

  const notes = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G4: 392, E4: 329.63, C4: 261.63 };

  return {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem("tt-muted", muted ? "1" : "0"); } catch (e) {}
      if (!muted) this.click();
      return muted;
    },
    unlock() { ac(); },
    click() { tone(880, 0, 0.05, { vol: 0.08, type: "triangle" }); },
    dice() { for (let i = 0; i < 7; i++) noise(i * 0.075, 0.05, 0.12); tone(660, 0.56, 0.12, { type: "triangle", vol: 0.12 }); },
    step(i = 0) { tone(520 + i * 60, 0, 0.09, { type: "triangle", vol: 0.13 }); },
    fork() { tone(notes.E5, 0, 0.12, { vol: 0.12 }); tone(notes.A5, 0.12, 0.18, { vol: 0.12 }); },
    card() { tone(notes.C5, 0, 0.14, { vol: 0.12 }); tone(notes.G5, 0.08, 0.22, { vol: 0.12 }); },
    bonus() { [notes.C5, notes.E5, notes.G5, notes.C6].forEach((f, i) => tone(f, i * 0.08, 0.22, { type: "triangle", vol: 0.14 })); },
    trap() { tone(440, 0, 0.22, { type: "sawtooth", vol: 0.06, to: 330 }); tone(330, 0.2, 0.35, { type: "sawtooth", vol: 0.06, to: 196 }); },
    saved() { tone(notes.G5, 0, 0.12, { vol: 0.12 }); tone(notes.C6, 0.1, 0.25, { vol: 0.12 }); },
    score(p) {
      if (p <= 0) { tone(300, 0, 0.18, { type: "triangle", vol: 0.1, to: 240 }); return; }
      const seq = [notes.C5, notes.E5, notes.G5, notes.C6].slice(0, p + 1);
      seq.forEach((f, i) => tone(f, i * 0.07, 0.2, { vol: 0.14 }));
    },
    tick() { tone(1200, 0, 0.04, { type: "square", vol: 0.04 }); },
    timeUp() { tone(740, 0, 0.16, { type: "square", vol: 0.06 }); tone(740, 0.22, 0.16, { type: "square", vol: 0.06 }); tone(560, 0.44, 0.3, { type: "square", vol: 0.06 }); },
    finish() { [notes.G4, notes.C5, notes.E5, notes.G5, notes.E5, notes.G5].forEach((f, i) => tone(f, i * 0.1, 0.25, { type: "triangle", vol: 0.14 })); },
    win() {
      const m = [notes.C5, notes.E5, notes.G5, notes.C6, notes.G5, notes.C6, notes.E6];
      m.forEach((f, i) => tone(f, i * 0.12, i === m.length - 1 ? 0.8 : 0.22, { type: "triangle", vol: 0.15 }));
    }
  };
})();
