'use strict';
// 声音：唱片机放的原创小曲、角色们的合奏、主人点钢琴的一小段。
// 全部用 WebAudio 现场合成，不用音频文件。

const music = (() => {
  let ctx = null, master = null, bus = null;
  let mode = null;                    // 'record' 唱片机 | 'band' 合奏 | null 安静
  let band = new Set();               // 正在演奏的乐器
  let song = 0, step = 0, nextT = 0, startT = 0, timer = null;
  let recordSong = -1;

  const vol = () => (S.env.mute ? 0 : (S.env.volume ?? 60) / 100);
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ensure() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    master.gain.value = vol() * 0.6;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---------- 音色 ----------
  function tone(out, m, t, dur, type, gain, { attack = 0.005, filter = 0, detune = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq(m);
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(out, t, dur, gain, hp) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = 'highpass';
    f.frequency.value = hp;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  function kick(out, t, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }

  // ---------- 曲子：和弦进行 + 按种子生成的旋律（A 段 8 小节 + B 段 8 小节）----------
  const SONGS = [
    { name: '像素小镇', bpm: 112, key: 60, seed: 11, prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], bounce: true },
    { name: '午后的芯片', bpm: 92, key: 62, seed: 23, prog: [[5, 'M'], [7, 'M'], [4, 'm'], [9, 'm']] },
    { name: '星星夜曲', bpm: 76, key: 57, seed: 37, prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], soft: true },
    { name: 'Token 进行曲', bpm: 124, key: 64, seed: 41, prog: [[0, 'M'], [5, 'M'], [7, 'M'], [5, 'M']], bounce: true },
  ];
  const RHYTHMS = [
    'x-x-x-x-x---x---', 'x---x-x-x---x-x-', 'x-xxx---x-x-x---', 'x--x--x-x-x-x---',
    'x-x-x-xxx---x---', 'x---x---x-x-x-x-', 'xx--x-x-x---xx--', 'x-x---x-x-x-x---',
  ];
  const PENT = [0, 2, 4, 7, 9];
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const chordOf = ([root, q]) => [root, root + (q === 'm' ? 3 : 4), root + 7];
  // 每个曲子生成一次：melody[bar][step] = { m, len } 或 null
  const built = new Map();
  function build(i) {
    if (built.has(i)) return built.get(i);
    const def = SONGS[i];
    const melody = [];
    const scale = [];
    for (let o = 0; o < 3; o++) for (const p of PENT) scale.push(def.key + 12 + o * 12 + p - 12);
    let idx = 7;
    for (let half = 0; half < 2; half++) {
      const rand = rng(def.seed + half * 101);
      const pats = [0, 1, 2, 3].map(() => RHYTHMS[Math.floor(rand() * RHYTHMS.length)]);
      for (let b = 0; b < 8; b++) {
        const chord = chordOf(def.prog[b % def.prog.length]).map((x) => def.key + 12 + x);
        const pat = b === 7 ? 'x-------x-------' : pats[b % 4];
        const bar = Array(16).fill(null);
        for (let s = 0; s < 16; s++) {
          if (pat[s] !== 'x') continue;
          let len = 1;
          while (s + len < 16 && pat[s + len] === '-') len++;
          let m;
          if (s % 4 === 0) {
            // 强拍落在和弦音上（挑离上一个音最近的）
            const cur = scale[idx];
            m = chord.flatMap((c) => [c - 12, c, c + 12]).sort((p, q) => Math.abs(p - cur) - Math.abs(q - cur))[0];
            idx = scale.reduce((best, v, k) => (Math.abs(v - m) < Math.abs(scale[best] - m) ? k : best), 0);
          } else {
            idx = Math.max(2, Math.min(scale.length - 3, idx + [-2, -1, -1, 1, 1, 2][Math.floor(rand() * 6)]));
            m = scale[idx];
          }
          if (b === 7 && s === 8) m = def.key + 12 + def.prog[0][0];
          bar[s] = { m, len };
        }
        melody.push(bar);
      }
    }
    const res = { def, melody };
    built.set(i, res);
    return res;
  }

  // ---------- 每个 16 分音符排一次 ----------
  function playStep(st, t) {
    const { def, melody } = build(song);
    const bar = Math.floor(st / 16) % melody.length, s = st % 16;
    const chord = chordOf(def.prog[bar % def.prog.length]);
    const sp = 60 / def.bpm / 4;          // 一个 16 分音符多长
    const note = melody[bar][s];
    const root = def.key - 24 + def.prog[bar % def.prog.length][0];
    if (mode === 'record') {
      if (note) tone(bus, note.m, t, note.len * sp * 0.9, def.soft ? 'triangle' : 'square', def.soft ? 0.07 : 0.035, { filter: 3200 });
      // 低音：一拍一个，跳跳的曲子八分音符八度跳
      if (def.bounce ? s % 2 === 0 : s % 8 === 0) tone(bus, root + (def.bounce && s % 4 === 2 ? 12 : 0), t, sp * (def.bounce ? 1.6 : 6), 'triangle', 0.09);
      // 分解和弦，轻轻的
      if (s % 2 === 0) tone(bus, def.key + chord[(s / 2) % 3] + (s % 8 >= 4 ? 12 : 0), t, sp * 1.5, 'triangle', 0.02);
      if (!def.soft) {
        if (s === 0 || s === 8 || (def.bounce && s === 10)) kick(bus, t, 0.14);
        if (s === 4 || s === 12) noise(bus, t, 0.1, 0.05, 1500);
        if (s % 2 === 0) noise(bus, t, 0.03, 0.015, 7000);
      } else if (s === 0) noise(bus, t, 0.4, 0.008, 5000);
      return;
    }
    // 合奏：谁在演奏才有谁那一声部
    const has = (k) => band.has(k);
    const lead = has('violin') ? 'violin' : has('synth') ? 'synth' : has('guitar') ? 'guitar' : has('piano') ? 'piano' : null;
    if (note && lead === 'violin') tone(bus, note.m, t, note.len * sp * 1.1, 'sawtooth', 0.025, { attack: 0.06, filter: 1800 });
    if (note && lead === 'synth') tone(bus, note.m, t, note.len * sp * 0.8, 'square', 0.025, { filter: 2600 });
    if (note && lead === 'guitar') tone(bus, note.m, t, sp * 2, 'triangle', 0.05, { filter: 2400 });
    if (note && lead === 'piano') tone(bus, note.m, t, sp * 3, 'triangle', 0.05);
    if (has('piano') && lead !== 'piano' && s % 2 === 0) tone(bus, def.key + chord[(s / 2) % 3] + (s % 8 >= 4 ? 12 : 0), t, sp * 2.5, 'triangle', 0.03);
    if (has('piano') && s % 8 === 0) tone(bus, root + 12, t, sp * 7, 'triangle', 0.06);
    if (has('synth') && lead !== 'synth' && s % 2 === 1) tone(bus, def.key + 12 + chord[(s >> 1) % 3], t, sp * 0.8, 'square', 0.012, { filter: 3000 });
    if (has('guitar') && lead !== 'guitar' && [0, 6, 8, 14].includes(s)) {
      chord.forEach((c, k) => tone(bus, def.key + c, t + k * 0.012, sp * 4, 'triangle', 0.025, { filter: 2000 }));
    }
    if (has('drums')) {
      if (s === 0 || s === 8) kick(bus, t, 0.12);
      if (s === 4 || s === 12) noise(bus, t, 0.1, 0.045, 1500);
      if (s % 2 === 0) noise(bus, t, 0.03, 0.012, 7000);
    }
  }

  function tick() {
    if (!mode || !ctx) return;
    const { def } = build(song);
    // 往后排 1 秒：窗口被挡住时定时器会变慢，排远一点不容易断
    while (nextT < ctx.currentTime + 1) {
      playStep(step, nextT);
      nextT += 60 / def.bpm / 4;
      step++;
    }
  }

  function begin(newMode, newSong) {
    try {
      ensure();
    } catch {
      return;
    }
    stop();
    mode = newMode;
    song = newSong;
    bus = ctx.createGain();
    bus.gain.value = newMode === 'band' ? 0.55 : 1;
    bus.connect(master);
    step = 0;
    nextT = startT = ctx.currentTime + 0.08;
    tick();
    timer = setInterval(tick, 100);
  }
  function stop() {
    if (bus) {
      bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      const old = bus;
      setTimeout(() => old.disconnect(), 150);
    }
    bus = null;
    mode = null;
    clearInterval(timer);
    timer = null;
  }

  // 唱片机优先；没放唱片时，两个以上的人在演奏就合奏
  function refresh(recordOn) {
    if (recordOn) {
      if (mode !== 'record') {
        recordSong = (recordSong + 1) % SONGS.length;
        begin('record', recordSong);
      }
      return;
    }
    if (band.size >= 2) {
      if (mode !== 'band') begin('band', Math.floor(Math.random() * SONGS.length));
    } else if (mode) stop();
  }

  return {
    songs: SONGS,
    // 每帧由场景调用：唱片机开没开、现在谁在演奏
    update(recordOn, playing) {
      band = playing;
      refresh(recordOn);
    },
    mode: () => mode,
    songName: () => (mode ? SONGS[song].name : ''),
    // 合奏时的拍子：第几拍、拍内进度（0~1），给场景里点头、冒音符用
    beat() {
      if (!mode || !ctx) return null;
      const spb = 60 / SONGS[song].bpm;
      const b = Math.max(0, ctx.currentTime - startT) / spb;
      return { n: Math.floor(b), phase: b % 1 };
    },
    setVolume() {
      if (master) master.gain.value = vol() * 0.6;
    },
    // 主人点钢琴：五声音阶随机弹一小段
    melody() {
      try {
        ensure();
      } catch {
        return;
      }
      const scale = [72, 74, 76, 79, 81, 84];
      let k = Math.floor(Math.random() * 3);
      for (let i = 0; i < 6; i++) {
        k = Math.max(0, Math.min(scale.length - 1, k + [-1, 1, 1, 2, -2][Math.floor(Math.random() * 5)]));
        tone(master, scale[k], ctx.currentTime + i * 0.17, 0.4, 'triangle', 0.08);
      }
    },
  };
})();
