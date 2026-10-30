'use strict';
// 声音：唱片机放的原创小曲、角色们的合奏、主人点钢琴的一小段。
// 全部用 WebAudio 现场合成，不用音频文件。

const music = (() => {
  let ctx = null, master = null, bus = null;
  let mode = null;                    // 'record' 唱片机 | 'band' 合奏 | null 安静
  let band = new Set();               // 正在演奏的乐器
  let song = 0, step = 0, nextT = 0, startT = 0, timer = null;
  let recordSong = -1, lastBandSong = -1;

  const vol = () => (S.env.mute ? 0 : (S.env.volume ?? 60) / 100);
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ensure() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      // 十件乐器一起响也不破音
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    master.gain.value = vol() * 0.6;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---------- 音色 ----------
  function tone(out, m, t, dur, type, gain, { attack = 0.005, filter = 0, detune = 0, vib = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq(m);
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    if (vib) {
      // 颤音：长笛和萨克斯吹长音时会抖一点
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = vib;
      lfo.connect(depth).connect(o.detune);
      lfo.start(t);
      lfo.stop(t + attack + dur + 0.05);
    }
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
    { name: '爵士小猫', bpm: 138, key: 65, seed: 53, prog: [[2, 'm'], [7, 'M'], [0, 'M'], [9, 'm']], style: 'jazz', scale: [0, 2, 3, 4, 7, 9], leads: ['sax', 'piano', 'flute'] },
    { name: '海边华尔兹', bpm: 150, key: 67, seed: 61, prog: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M']], style: 'waltz', beats: 3, leads: ['accordion', 'flute', 'violin'] },
    { name: '雨天波萨', bpm: 108, key: 62, seed: 71, prog: [[0, 'M'], [9, 'm'], [2, 'm'], [7, 'M']], style: 'bossa', leads: ['flute', 'guitar', 'sax'] },
    { name: '下班放克', bpm: 110, key: 57, seed: 83, prog: [[0, 'm'], [0, 'm'], [5, 'M'], [7, 'm']], style: 'funk', scale: [0, 3, 5, 7, 10], leads: ['synth', 'sax', 'guitar'] },
    { name: '椰子雷鬼', bpm: 88, key: 64, seed: 97, prog: [[0, 'M'], [5, 'M'], [0, 'M'], [7, 'M']], style: 'reggae', leads: ['marimba', 'guitar', 'flute'] },
    { name: '凌晨三点的小窝', bpm: 66, key: 60, seed: 103, prog: [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']], soft: true, style: 'ballad', leads: ['violin', 'flute', 'piano'] },
  ];
  // 节奏型：k 底鼓 / s 军鼓 / h 踩镲 / b 贝斯（walk 是贝斯依次走的音）/ comp 吉他和手风琴扫和弦的位置
  const GROOVES = {
    pop: { k: 'x-------x-------', s: '----x-------x---', h: 'x-x-x-x-x-x-x-x-', b: 'x-------x-------', walk: [0, 0], comp: 'x-----x-x-----x-' },
    bounce: { k: 'x-------x-x-----', s: '----x-------x---', h: 'x-x-x-x-x-x-x-x-', b: 'x-x-x-x-x-x-x-x-', walk: [0, 12], comp: 'x-----x-x-----x-' },
    jazz: { k: 'x-------x-------', s: '----------x---x-', h: 'x---x-x-x---x-x-', b: 'x---x---x---x---', walk: [0, 'third', 7, 'lead'], comp: '----x-------x-x-', light: true },
    waltz: { k: 'x-----------', s: '----x---x---', h: 'x---x---x---', b: 'x---------x-', walk: [0, 7], comp: '----x---x---', light: true },
    bossa: { k: 'x--x----x--x----', s: 'x--x--x---x--x--', h: 'x-x-x-x-x-x-x-x-', b: 'x--x----x--x----', walk: [0, 7, 7, 0], comp: 'x--x--x---x--x--', rim: true, light: true },
    funk: { k: 'x-x---x---x--x--', s: '----x--x-x--x---', h: 'xxxxxxxxxxxxxxxx', b: 'x-x--x-x--x-x-x-', walk: [0, 0, 12, 0, 7, 10], comp: '--x--x----x--x--' },
    reggae: { k: '--------x-------', s: '--------x-------', h: 'x-x-x-x-x-x-x-x-', b: 'x--x--x---------', walk: [0, 0, 7], comp: '--x---x---x---x-' },
    ballad: { k: 'x---------------', s: '--------x-------', h: 'x-------x-------', b: 'x-------x-------', walk: [0, 7], comp: 'x-------x-------', rim: true, light: true },
  };
  const grooveOf = (def) => GROOVES[def.style || (def.bounce ? 'bounce' : 'pop')];
  const beatsOf = (def) => def.beats || 4;
  const RHYTHMS = [
    'x-x-x-x-x---x---', 'x---x-x-x---x-x-', 'x-xxx---x-x-x---', 'x--x--x-x-x-x---',
    'x-x-x-xxx---x---', 'x---x---x-x-x-x-', 'xx--x-x-x---xx--', 'x-x---x-x-x-x---',
  ];
  const RHYTHMS3 = ['x---x---x---', 'x-----x-x---', 'x-x-x---x---', 'x-----x-----', 'x---x-x-x---', 'x---x-x-x-x-'];
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
    const N = beatsOf(def) * 4, rhythms = N === 12 ? RHYTHMS3 : RHYTHMS;
    for (let o = 0; o < 3; o++) for (const p of def.scale || PENT) scale.push(def.key + 12 + o * 12 + p - 12);
    let idx = 7;
    for (let half = 0; half < 2; half++) {
      const rand = rng(def.seed + half * 101);
      const pats = [0, 1, 2, 3].map(() => rhythms[Math.floor(rand() * rhythms.length)]);
      for (let b = 0; b < 8; b++) {
        const chord = chordOf(def.prog[b % def.prog.length]).map((x) => def.key + 12 + x);
        const pat = b === 7 ? ('x' + '-'.repeat(N / 2 - 1)).repeat(2) : pats[b % 4];
        const bar = Array(N).fill(null);
        for (let s = 0; s < N; s++) {
          if (pat[s] !== 'x') continue;
          let len = 1;
          while (s + len < N && pat[s + len] === '-') len++;
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
          if (b === 7 && s === N / 2) m = def.key + 12 + def.prog[0][0];
          bar[s] = { m, len };
        }
        melody.push(bar);
      }
    }
    const res = { def, melody };
    built.set(i, res);
    return res;
  }

  function drumHit(gr, s, t, soft) {
    if (gr.k[s] === 'x') kick(bus, t, soft ? 0.08 : 0.13);
    if (gr.s[s] === 'x') {
      if (gr.rim) noise(bus, t, 0.03, soft ? 0.022 : 0.03, 3200);
      else noise(bus, t, 0.1, gr.light ? 0.025 : 0.047, 1500);
    }
    if (gr.h[s] === 'x') noise(bus, t, gr.h.length === 16 && gr.h[1] === 'x' ? 0.02 : 0.03, gr.light ? 0.009 : 0.013, 7000);
  }
  // 贝斯这一下该弹哪个音：按节奏型里的第几下，从 walk 里取
  function bassNote(gr, s, chord, root, nextRoot) {
    let n = 0;
    for (let k = 0; k < s; k++) if (gr.b[k] === 'x') n++;
    const w = gr.walk[n % gr.walk.length];
    if (w === 'third') return root + chord[1] - chord[0];
    if (w === 'lead') return nextRoot + (nextRoot > root ? -1 : 1);    // 半音走向下一个和弦
    return root + w;
  }
  // 主旋律交给谁：这里是每种乐器的音色
  const LEADS = {
    violin: (m, t, n, sp) => tone(bus, m, t, n * sp * 1.1, 'sawtooth', 0.025, { attack: 0.06, filter: 1800 }),
    synth: (m, t, n, sp) => tone(bus, m, t, n * sp * 0.8, 'square', 0.025, { filter: 2600 }),
    guitar: (m, t, n, sp) => tone(bus, m, t, sp * 2, 'triangle', 0.05, { filter: 2400 }),
    piano: (m, t, n, sp) => tone(bus, m, t, sp * 3, 'triangle', 0.05),
    flute: (m, t, n, sp) => {
      tone(bus, m + 12, t, n * sp * 1.05, 'sine', 0.06, { attack: 0.04, vib: 10 });
      noise(bus, t, 0.05, 0.006, 5000);
    },
    sax: (m, t, n, sp) => tone(bus, m, t, n * sp * 1.0, 'sawtooth', 0.04, { attack: 0.025, filter: 1500, vib: 9 }),
    accordion: (m, t, n, sp) => {
      tone(bus, m, t, n * sp, 'square', 0.016, { attack: 0.02, filter: 2100, detune: -6 });
      tone(bus, m, t, n * sp, 'square', 0.016, { attack: 0.02, filter: 2100, detune: 6 });
    },
    marimba: (m, t) => {
      tone(bus, m + 12, t, 0.28, 'sine', 0.085);
      tone(bus, m + 36, t, 0.05, 'sine', 0.012);
    },
  };
  const LEAD_ORDER = ['violin', 'flute', 'sax', 'accordion', 'synth', 'guitar', 'marimba', 'piano'];

  // ---------- 每个 16 分音符排一次 ----------
  function playStep(st, t) {
    const { def, melody } = build(song);
    const N = beatsOf(def) * 4;
    const bar = Math.floor(st / N) % melody.length, s = st % N;
    const chord = chordOf(def.prog[bar % def.prog.length]);
    const sp = 60 / def.bpm / 4;          // 一个 16 分音符多长
    const gr = grooveOf(def);
    if (def.style === 'jazz' && s % 4 === 2) t += sp * 0.33;   // 爵士的摇摆：反拍晚一点点
    const note = melody[bar][s];
    const root = def.key - 24 + def.prog[bar % def.prog.length][0];
    const root2 = def.key - 24 + def.prog[(bar + 1) % def.prog.length][0];
    if (mode === 'record') {
      if (note) tone(bus, note.m, t, note.len * sp * 0.9, def.soft ? 'triangle' : 'square', def.soft ? 0.07 : 0.035, { filter: 3200 });
      // 低音：一拍一个，跳跳的曲子八分音符八度跳
      if (gr.b[s] === 'x') tone(bus, bassNote(gr, s, chord, root, root2), t, sp * (gr.b[1] === '-' && gr.b[2] === '-' && gr.b[3] === '-' ? 6 : 1.6), 'triangle', 0.09);
      // 分解和弦，轻轻的
      if (s % 2 === 0) tone(bus, def.key + chord[(s / 2) % 3] + (s % 8 >= 4 ? 12 : 0), t, sp * 1.5, 'triangle', 0.02);
      if (!def.soft) drumHit(gr, s, t);
      else if (s === 0) noise(bus, t, 0.4, 0.008, 5000);
      return;
    }
    // 合奏：谁在演奏才有谁那一声部
    const has = (k) => band.has(k);
    // 有两件能领奏的乐器时，后半段换另一件来，像轮流 solo
    const leads = [...new Set([...(def.leads || []), ...LEAD_ORDER])].filter(has);
    const lead = leads[bar >= 8 && leads.length > 1 ? 1 : 0] || null;
    if (note && lead) LEADS[lead](note.m, t, note.len, sp);
    if (has('piano') && lead !== 'piano' && s % 2 === 0) tone(bus, def.key + chord[(s / 2) % 3] + (s % 8 >= 4 ? 12 : 0), t, sp * 2.5, 'triangle', 0.03);
    if (has('piano') && !has('bass') && s % 8 === 0) tone(bus, root + 12, t, sp * 7, 'triangle', 0.06);
    if (has('bass') && gr.b[s] === 'x') tone(bus, bassNote(gr, s, chord, root, root2), t, sp * 2.6, 'triangle', 0.14, { filter: 800 });
    if (has('flute') && lead !== 'flute' && note && note.len >= 4) tone(bus, note.m + 12, t, note.len * sp, 'sine', 0.02, { attack: 0.05, vib: 10 });
    if (has('sax') && lead !== 'sax' && s === 0) tone(bus, def.key + 12 + chord[1], t, N * sp * 0.8, 'sawtooth', 0.016, { attack: 0.08, filter: 1100, vib: 6 });
    if (has('marimba') && lead !== 'marimba' && s % 2 === 0) tone(bus, def.key + 24 + chord[(s / 2) % 3], t, 0.2, 'sine', 0.035);
    if (has('accordion') && lead !== 'accordion' && gr.comp[s] === 'x') {
      chord.forEach((c) => tone(bus, def.key + 12 + c, t, sp * 1.4, 'square', 0.007, { filter: 1900 }));
    }
    if (has('synth') && lead !== 'synth' && s % 2 === 1) tone(bus, def.key + 12 + chord[(s >> 1) % 3], t, sp * 0.8, 'square', 0.012, { filter: 3000 });
    if (has('guitar') && lead !== 'guitar' && gr.comp[s] === 'x') {
      chord.forEach((c, k) => tone(bus, def.key + c, t + k * 0.012, sp * 4, 'triangle', 0.025, { filter: 2000 }));
    }
    if (has('drums')) drumHit(gr, s, t, def.soft);
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
      if (mode !== 'band') {
        // 换一首，别连着两次是同一首
        let next;
        do next = Math.floor(Math.random() * SONGS.length); while (next === lastBandSong);
        lastBandSong = next;
        begin('band', next);
      }
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
