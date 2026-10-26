'use strict';
// 场景：小屋（室内）+ 户外，季节与昼夜，角色走动，对话气泡

// ---------- 季节 & 昼夜 ----------
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_NAMES = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const FAST_DAY_SEC = 600;
const SEASON_CYCLE_SEC = 600;

const env = {
  hours() {
    if (S.env.time === 'fast') return (((Date.now() / 1000) % FAST_DAY_SEC) / FAST_DAY_SEC) * 24;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  },
  season() {
    const mode = S.env.season;
    if (SEASONS.includes(mode)) return mode;
    if (mode === 'cycle') return SEASONS[Math.floor(Date.now() / 1000 / SEASON_CYCLE_SEC) % 4];
    // 跟随现实：3-5 月春，6-8 夏，9-11 秋，12-2 冬
    return SEASONS[Math.floor(((new Date().getMonth() + 10) % 12) / 3)];
  },
  clock() {
    const h = this.hours();
    const pad = (n) => String(Math.floor(n)).padStart(2, '0');
    return `${pad(h)}:${pad((h % 1) * 60)}`;
  },
};

// [小时, 天顶色, 地平线色, 夜晚程度 0~1]
const SKY_KEYS = [
  [0, '#18224a', '#2c3870', 1],
  [4.5, '#18224a', '#2c3870', 1],
  [6, '#5068a8', '#f6a882', 0.4],
  [7.5, '#5ea6e6', '#b4e0f5', 0],
  [16.5, '#5ea6e6', '#c4e6f2', 0],
  [18.3, '#4d4f92', '#f2875a', 0.4],
  [19.8, '#1c2550', '#34407a', 0.9],
  [24, '#18224a', '#2c3870', 1],
];

const hexRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lighten = (hex, t) => rgb(mixRgb(hexRgb(hex), [255, 255, 255], t));
const darken = (hex, t) => rgb(mixRgb(hexRgb(hex), [20, 15, 31], t));

function skyAt(h) {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const [h0, t0, b0, d0] = SKY_KEYS[i];
    const [h1, t1, b1, d1] = SKY_KEYS[i + 1];
    if (h < h0 || h > h1) continue;
    const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
    return { top: mixRgb(hexRgb(t0), hexRgb(t1), t), bottom: mixRgb(hexRgb(b0), hexRgb(b1), t), dark: d0 + (d1 - d0) * t };
  }
  return { top: hexRgb(SKY_KEYS[0][1]), bottom: hexRgb(SKY_KEYS[0][2]), dark: 1 };
}

// 树叶/灌木色阶：[暗, 中, 亮, 点缀]
const PAL = {
  spring: {
    grass: '#74c44e', grassDark: '#5aa53c', grassLight: '#96d86c', hill: '#7cc46a', hill2: '#a3d895',
    leaf: ['#d9709a', '#f492b4', '#fbc4d8', '#ffffff'], bush: ['#3d8f2c', '#5aa53c', '#7cc46a', '#ffb3cf'],
    flowers: ['#ff8fb1', '#ffe66d', '#ffffff'],
  },
  summer: {
    grass: '#4fae3a', grassDark: '#3d8f2c', grassLight: '#6cc450', hill: '#4f9f45', hill2: '#79c06a',
    leaf: ['#22703a', '#2f8f3a', '#4fb04f', '#7ad66a'], bush: ['#22703a', '#2f8f3a', '#4fb04f', null],
    flowers: ['#ff5d5d', '#ffd84a', '#b28dff'],
  },
  autumn: {
    grass: '#b8a043', grassDark: '#9a8233', grassLight: '#d0b85a', hill: '#b4854a', hill2: '#cfa262',
    leaf: ['#a8402a', '#d0602a', '#ec8f34', '#f5c242'], bush: ['#8a3a22', '#b4502a', '#d47a3a', null],
    flowers: null,
  },
  winter: {
    grass: '#e9f1f8', grassDark: '#c5d4e3', grassLight: '#ffffff', hill: '#cfdcea', hill2: '#e6eef7',
    leaf: null, bush: ['#c5d4e3', '#e9f1f8', '#ffffff', null],
    flowers: null,
  },
};
const FALL_COLORS = { spring: ['#f492b4', '#fbc4d8', '#ffffff'], autumn: ['#d0602a', '#ec8f34', '#f5c242', '#a8402a'] };

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 画布工具 ----------
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

// 给图层里所有不透明的形状外面描一圈 1px 的边
function outlined(src, color = OUTLINE) {
  const w = src.width, h = src.height;
  const a = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  const o = out.data;
  const [R, G, B] = hexRgb(color);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[(y * w + x) * 4 + 3] > 0) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        const i = (y * w + x) * 4;
        o[i] = R; o[i + 1] = G; o[i + 2] = B; o[i + 3] = 255;
      }
    }
  }
  const c = newCanvas(w, h);
  const cg = c.getContext('2d');
  cg.putImageData(out, 0, 0);
  cg.drawImage(src, 0, 0);
  return c;
}

// 显示器上的 Token 余额走势，每 3 秒记一次
const tokenHistory = [];
setInterval(() => {
  tokenHistory.push(S.tokens);
  if (tokenHistory.length > 60) tokenHistory.shift();
}, 3000);

// ---------- 场景 ----------
const room = (() => {
  const cv = $('#room');
  // 画面分两层：天空直接画在 main 上；地面、房子、角色画在前景层 fg，夜色只压前景
  const main = cv.getContext('2d');
  const fgCanvas = document.createElement('canvas');
  const fg = fgCanvas.getContext('2d');
  let g = main;
  const HOUSE_R = 528;               // 右墙内侧
  let GALLERY_X = 158;               // 相框墙左边
  const GALLERY_COLS = 6;
  let SHELF_X = 320;                 // 书架左边
  let FIRE_X = 362;                  // 壁炉左边（宽 40）
  // 能在装修模式里挪动的家具：位置存在 S.layout 里，resize() 时读出来
  let BEANBAG_X = 417;               // 懒人沙发中心
  let FLOOR_LAMP_X = 430;
  let FRIDGE_X = 438;                // 冰箱左边（宽 14）
  let COUNTER_X = 454;               // 橱柜左边（宽 32）
  let BED_X = 492;                   // 床左边（宽 32）
  let CAB_X = 79;                    // 机柜左边（宽 22，上面放着芯片）
  let DESK_X = 104;                  // 书桌左边（宽 48）
  let RUG_X = 60;                    // 书桌前的小地毯
  // 屋里每件落地家具的默认位置（x）。装修时存在 S.layout[key] = { x, dy }，dy 是从墙边往屋子前面挪了多少
  const FLOOR_DEF = {
    armchair: 14, piano: 57, cabinet: 79, desk: 104, rug: 60, cattree: 160, sofa: 186, shelf: 320, fireplace: 362,
    beanbag: 417, lamp: 430, fridge: 438, counter: 454, bed: 492, tv: 14, table: 200,
  };
  const PD = {};                     // 每件家具往前挪的 dy
  const gy = (k) => GROUND + (PD[k] || 0);   // 这件家具的"地面"：靠墙时就是墙根
  // 这件原有家具现在不在场上：还没买，或者收进仓库了（机柜、书桌一直都在；长椅看 S.decor）
  const ALWAYS = ['cabinet', 'desk', 'bench'];
  const gone = (k) => !!S.stored?.[k] || (!ALWAYS.includes(k) && !S.ownedFurn?.[k]);
  // 不能收起来的：机柜上有芯片，书桌是写代码的地方
  const KEEP = ['cabinet', 'desk'];
  let PIANO_X = 57;                  // 立式钢琴：靠墙，在窗边小桌和机柜之间（宽 20）
  let CATTREE_X = 160;               // 猫爬架：长沙发左边的地板上（宽 24）
  let TV_X = 14;                     // 电视 + 游戏机：扶手椅前面的地板上（宽 28）
  let ARMCHAIR_X = 14;               // 扶手椅 + 边桌左边（宽 40）
  let TABLE_X = 200;                 // 长餐桌：摆在长沙发和壁炉前面的地板上（宽 192）
  const TABLE_W = 192;
  let SEAT_X0 = 216;                 // 前后两排各 6 个座位，间隔 32
  const SEAT_GAP = 32;
  const WALL = 4;
  const DOOR_X = HOUSE_R + WALL;     // 门外侧
  const OUT_L = DOOR_X + 6;          // 户外可走区域左边界
  let LAMPS = [60, 154, 334, 470];
  const ROPE = 22;                   // 秋千绳长

  let W = 480, H = 96, SCALE = 2, GROUND = 70, CEIL = 10, U = 1;
  let OUT_R = 472;                    // 户外平时闲逛的右边界（再往右是温泉）
  let wasMeal = false;
  let L = {};                         // 屋内家具的位置，随高度变化
  let hills = [], decor = [], stars = [], clouds = [];
  let layers = { key: '' };
  let entities = [], particles = [], weather = [];
  let spots = [];
  let held = null;                    // 正被鼠标提着的角色
  let trail = [];                     // 拖动轨迹，松手时算甩出去的速度
  let bug = null;
  let chipBump = 0;
  let nextBugAt = performance.now() + 60000 + Math.random() * 60000;
  let onBug = () => {};
  let onBugCaught = () => {};
  let onReward = () => {};            // 收菜、钓到鱼时由界面那边发奖励
  let highlight = null;               // 伙伴页点"找它"时，在它头上画个箭头 { type, until }
  let hovered = null;                 // 鼠标正悬停的角色（满级的这时才显示王冠）
  let season = env.season(), pal = PAL[season], sky = skyAt(env.hours());

  // 当前画到哪个画布上（建图层时会临时切走）
  let gc = g;
  const r = (x, y, w, h, c) => {
    gc.fillStyle = c;
    gc.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  function paint(canvas, fn) {
    const prev = gc;
    gc = canvas.getContext('2d');
    fn();
    gc = prev;
    return canvas;
  }

  const floorTop = () => GROUND + 5;
  const floorBottom = () => H - 3;
  const chipPos = () => ({ x: CAB_X + 3, y: gy('cabinet') - 20 - 16 });
  const tankRect = () => ({ x: COUNTER_X + 14, y: gy('counter') - 16 - 9, w: 17, h: 9 });
  const randY = () => floorTop() + Math.random() * (floorBottom() - floorTop());
  const randX = (out) => (out ? OUT_L + Math.random() * (OUT_R - OUT_L) : 10 + Math.random() * (HOUSE_R - 18));
  const clampX = (x, out) => (out ? Math.max(OUT_L, Math.min(OUT_R, x)) : Math.max(10, Math.min(HOUSE_R - 8, x)));
  // 饭点：早 7 点、午 12 点、晚 18 点，各一个半小时
  const isMealTime = () => {
    const h = env.hours();
    return (h >= 7 && h < 8.5) || (h >= 12 && h < 13.5) || (h >= 18 && h < 19.5);
  };

  // 相框墙上第 i 个相框（6 列 2 行）
  function frameRect(i) {
    const col = i % GALLERY_COLS, row = Math.floor(i / GALLERY_COLS);
    return { x: GALLERY_X + col * 26, y: L.galleryY + row * 27 };
  }

  // ---------- 尺寸 ----------
  function resize() {
    const box = cv.parentElement;
    const cw = box.clientWidth, ch = box.clientHeight;
    if (!cw || !ch) return;
    SCALE = Math.max(2, Math.floor(ch / 135));
    W = Math.max(OUT_L + 40, Math.floor(cw / SCALE));
    H = Math.max(80, Math.floor(ch / SCALE));
    U = Math.max(1, H / 100);
    GROUND = H - Math.round(H * 0.26);
    CEIL = Math.round(H * 0.1);
    const wallH = GROUND - CEIL;
    const winH = Math.max(18, Math.round(wallH * 0.42));
    // 装修过的家具位置（旧存档里只存了 x 的数字，也认）
    const lay = S.layout || {};
    const fl = (k, def) => {
      const v = lay[k];
      return typeof v === 'number' ? { x: v, dy: 0 } : { x: v?.x ?? def, dy: v?.dy ?? 0 };
    };
    const dyMax = floorBottom() - GROUND - 8;
    for (const k of Object.keys(FLOOR_DEF)) PD[k] = Math.max(0, Math.min(dyMax, fl(k, FLOOR_DEF[k]).dy));
    ARMCHAIR_X = fl('armchair', 14).x;
    PIANO_X = fl('piano', 57).x;
    CAB_X = fl('cabinet', 79).x;
    DESK_X = fl('desk', 104).x;
    RUG_X = fl('rug', 60).x;
    CATTREE_X = fl('cattree', 160).x;
    SHELF_X = fl('shelf', 320).x;
    FIRE_X = fl('fireplace', 362).x;
    BEANBAG_X = fl('beanbag', 417).x;
    FLOOR_LAMP_X = fl('lamp', 430).x;
    FRIDGE_X = fl('fridge', 438).x;
    COUNTER_X = fl('counter', 454).x;
    BED_X = fl('bed', 492).x;
    TV_X = fl('tv', 14).x;
    TABLE_X = fl('table', 200).x;
    SEAT_X0 = TABLE_X + 16;
    // 墙上的东西：窗户、挂钟、留言板、相框墙、调料架、吊灯
    const wl = (k, x, y) => ({ x: lay[k]?.x ?? x, y: lay[k]?.y ?? y });
    const winY0 = CEIL + Math.round(wallH * 0.16);
    const deskTop = gy('desk') - 14;
    const w1 = wl('win', 12, winY0);
    const corkY = CEIL + 6, corkH = Math.min(20, GROUND - 35 - 4 - corkY);
    L = {
      win: { x: w1.x, y: w1.y, w: 36, h: winH },
      shelfH: Math.min(wallH - 8, 46),
      cord: Math.max(6, Math.round(wallH * 0.12)),
      clock: wl('clock', 90, CEIL + 10),
      wainH: Math.round(wallH * 0.28),
      desk: { top: deskTop, mx: DESK_X + 9, my: deskTop - 21, mw: 30, mh: 18 },
    };
    L.showClock = CEIL + 17 < GROUND - 40;
    L.cork = corkH >= 10 ? { ...wl('cork', 108, corkY), w: 40, h: corkH } : null;
    const gp = wl('gallery', 158, CEIL + 8);
    GALLERY_X = gp.x;
    L.galleryY = gp.y;
    L.sofa = CEIL + 8 + 51 < GROUND - 22 && !gone('sofa') ? { x: fl('sofa', 186).x, w: 104 } : null;
    const w2h = Math.max(14, Math.min(winH, GROUND - 26 - winY0));
    L.win2 = { ...wl('win2', 496, winY0), w: 24, h: w2h };
    L.rack = wl('rack', 454, GROUND - 36);
    LAMPS = [60, 154, 334, 470].map((d, i) => lay['lamp' + i]?.x ?? d);
    // 角色可以去坐/打字/睡觉的位置：a = 走过去站的地方，d = 坐下后画的位置
    for (const e of entities) leaveSpot(e);
    spots = [
      { kind: 'sit', piece: 'armchair', ax: ARMCHAIR_X + 13, ay: gy('armchair') + 6, dx: ARMCHAIR_X + 13, dy: gy('armchair') - 11, arms: true },
      { kind: 'type', piece: 'desk', ax: DESK_X + 24, ay: gy('desk') + 5, dx: DESK_X + 24, dy: gy('desk') + 5 },
      { kind: 'sit', piece: 'beanbag', ax: BEANBAG_X, ay: gy('beanbag') + 6, dx: BEANBAG_X, dy: gy('beanbag') - 5 },
      { kind: 'sleep', piece: 'bed', ax: BED_X + 8, ay: gy('bed') + 6, dx: BED_X + 9, dy: gy('bed') - 6, bed: true },
      { kind: 'sleep', piece: 'bed', ax: BED_X + 20, ay: gy('bed') + 6, dx: BED_X + 20, dy: gy('bed') - 6, bed: true },
    ];
    // 长沙发坐得下 4 个
    if (L.sofa) {
      for (let i = 0; i < 4; i++) {
        const sx = L.sofa.x + 14 + i * 25;
        spots.push({ kind: 'sit', piece: 'sofa', ax: sx, ay: gy('sofa') + 6, dx: sx, dy: gy('sofa') - 10 });
      }
    }
    // 钢琴凳、电视前的两个坐垫、鱼缸前、猫爬架三层
    PD.tv = Math.min(PD.tv, floorBottom() - 1 - (floorTop() + 22));
    L.tv = { y: floorTop() + 9 + PD.tv, cushionY: Math.min(floorBottom() - 1, floorTop() + 22 + PD.tv) };
    L.catBase = gy('cattree') + 9;
    spots.push({ kind: 'piano', piece: 'piano', ax: PIANO_X + 10, ay: gy('piano') + 6, dx: PIANO_X + 10, dy: gy('piano') + 4 });
    for (const gx of [TV_X + 6, TV_X + 22]) spots.push({ kind: 'game', piece: 'tv', ax: gx, ay: L.tv.cushionY, dx: gx, dy: L.tv.cushionY });
    const tk = tankRect();
    spots.push({ kind: 'aquarium', piece: 'counter', ax: tk.x + tk.w / 2, ay: gy('counter') + 6, dx: tk.x + tk.w / 2, dy: gy('counter') + 6 });
    for (const [px, py] of [[5, 9], [19, 19], [11, 30]]) {
      spots.push({ kind: 'perch', piece: 'cattree', ax: CATTREE_X + 12, ay: L.catBase + 3, dx: CATTREE_X + px, dy: L.catBase - py });
    }
    // 长餐桌：俯视角度，能看到桌面。后排 6 个坐在桌子后面，桌面挡住腰以下；前排 6 个坐在小圆凳上
    const band = floorBottom() - floorTop();
    const tt0 = floorTop() + Math.max(3, Math.round(band * 0.18));
    PD.table = Math.min(PD.table, floorBottom() - (tt0 + 19));
    const tt = tt0 + PD.table;
    L.table = { top: tt, depth: 10, backY: tt + 4, frontY: Math.min(floorBottom(), tt + 19) };
    for (let i = 0; i < 6; i++) {
      const sx = SEAT_X0 + i * SEAT_GAP;
      spots.push({ kind: 'eat', piece: 'table', ax: sx, ay: floorTop(), dx: sx, dy: L.table.backY });
      spots.push({ kind: 'eat', piece: 'table', front: true, ax: sx, ay: Math.min(floorBottom(), L.table.frontY + 2), dx: sx, dy: L.table.frontY });
    }
    // 户外设施：户外够宽才摆，温泉放在最右边
    const outW = W - OUT_L;
    // 户外设施：x 和往前后挪的 dy（窗口变窄时别挤出画面）
    const yd = (k, def, half) => {
      const v = fl(k, def);
      return { x: Math.max(OUT_L + half, Math.min(v.x, W - 4 - half)), dy: v.dy };
    };
    const sp0 = yd('spring', W - 52, 48);
    L.spring = outW >= 120 && !gone('spring') ? { x: sp0.x, y: GROUND + 15 + sp0.dy } : null;
    const sw0 = yd('swing', OUT_L + 70, 17), tr0 = yd('tramp', OUT_L + 140, 15);
    L.swing = outW >= 200 && !gone('swing') ? sw0.x : null;
    L.swingDY = sw0.dy;
    L.tramp = outW >= 270 && !gone('tramp') ? tr0.x : null;
    L.trampDY = tr0.dy;
    const gd0 = yd('garden', OUT_L + 212, 36), pd0 = yd('pond', OUT_L + 302, 40), cp0 = yd('camp', OUT_L + 392, 21);
    L.garden = outW >= 340 && !gone('garden') ? { x: gd0.x, y: GROUND + 10 + gd0.dy } : null;
    L.pond = outW >= 430 && !gone('pond') ? { x: pd0.x, y: GROUND + 17 + pd0.dy } : null;
    L.camp = outW >= 540 && !gone('camp') ? { x: cp0.x, y: GROUND + 15 + cp0.dy } : null;
    OUT_R = W - 8;
    if (L.spring) {
      for (let i = 0; i < 4; i++) {
        const sx = L.spring.x - 25 + i * 17;
        // 脚底沉到水面下 7 像素，前半池水盖住下半身
        spots.push({ kind: 'bath', out: true, ax: sx, ay: Math.min(floorBottom(), L.spring.y + 11), dx: sx, dy: L.spring.y + 6 });
      }
    }
    if (L.swing) spots.push({ kind: 'swing', out: true, ax: L.swing, ay: Math.min(floorBottom(), swingBase().d0 + 3), dx: L.swing, dy: swingBase().d0 - 6 });
    if (L.tramp) spots.push({ kind: 'bounce', out: true, ax: L.tramp, ay: Math.min(floorBottom(), trampY() + 5), dx: L.tramp, dy: trampY() });
    // 商城买的户外长椅：摆在秋千和蹦床之间的前排，两个座位
    const bn0 = yd('bench', OUT_L + 106, 12);
    L.bench = outW >= 270 && !gone('bench') ? { x: bn0.x, y: floorBottom() - 1 + Math.min(0, bn0.dy) } : null;
    if (L.bench && S.decor.bench) {
      for (const bx of [L.bench.x - 5, L.bench.x + 5]) spots.push({ kind: 'sit', out: true, ax: bx, ay: L.bench.y, dx: bx, dy: L.bench.y - 4 });
    }
    // 菜园：站在地块前面浇水
    if (L.garden) spots.push({ kind: 'garden', out: true, ax: L.garden.x, ay: L.garden.y + 9, dx: L.garden.x, dy: L.garden.y + 9 });
    // 池塘左右岸各坐一个钓鱼的，脸朝着水
    if (L.pond) {
      spots.push({ kind: 'fish', out: true, face: 1, ax: L.pond.x - 38, ay: L.pond.y + 2, dx: L.pond.x - 36, dy: L.pond.y + 1 });
      spots.push({ kind: 'fish', out: true, face: -1, ax: L.pond.x + 38, ay: L.pond.y + 2, dx: L.pond.x + 36, dy: L.pond.y + 1 });
    }
    // 篝火：左、右、后三根木头凳子
    if (L.camp) {
      const { x: cx, y: cy } = L.camp;
      spots.push({ kind: 'camp', out: true, face: 1, ax: cx - 15, ay: cy + 3, dx: cx - 15, dy: cy + 2 });
      spots.push({ kind: 'camp', out: true, face: -1, ax: cx + 15, ay: cy + 3, dx: cx + 15, dy: cy + 2 });
      spots.push({ kind: 'camp', out: true, face: 1, ax: cx, ay: Math.max(floorTop(), cy - 10), dx: cx, dy: cy - 5 });
    }
    // 收进仓库的家具上的位子也收走
    spots = spots.filter((sp) => !sp.piece || !gone(sp.piece));
    // 自己摆的家具上的位子（小沙发、街机、望远镜、吊床……）
    for (const pf of placedFurniture()) {
      for (const sp of pf.d.spots?.(pf.x, pf.y) || []) spots.push({ ...sp, out: pf.x > DOOR_X, furn: pf.uid });
    }
    cv.width = W;
    cv.height = H;
    fgCanvas.width = W;
    fgCanvas.height = H;
    const size = { width: W * SCALE + 'px', height: H * SCALE + 'px' };
    Object.assign(cv.style, size);
    Object.assign($('#fx').style, size);
    build();
    layers.key = '';
    for (const e of entities) {
      e.x = Math.min(e.x, W - 8);
      e.tx = Math.min(e.tx, W - 8);
      e.y = Math.max(floorTop(), Math.min(floorBottom(), e.y));
      e.ty = e.y;
    }
  }

  // 山、星星、云和装饰的位置，用固定种子生成，窗口大小变了也长得一样
  function build() {
    const rand = seeded(20261025);
    hills = [];
    for (let x = 0; x < W; x++) {
      hills.push([
        Math.round((12 + 4 * Math.sin(x * 0.021) + 3 * Math.sin(x * 0.057 + 2)) * U),
        Math.round((5 + 3 * Math.sin(x * 0.043 + 1) + 2 * Math.sin(x * 0.11)) * U),
      ]);
    }
    stars = Array.from({ length: Math.floor(W / 9) }, () => [OUT_L + rand() * (W - OUT_L), 2 + rand() * Math.max(4, GROUND * 0.55), rand() * 6]);
    clouds = Array.from({ length: Math.max(2, Math.floor(W / 110)) }, (_, i) => {
      const sprite = makeCloud(seeded(i * 97 + 5), 10 + Math.floor(rand() * 10));
      return { x: rand() * W, y: 2 + rand() * GROUND * 0.3, speed: 1 + rand() * 2, sprite };
    });
    decor = [];
    let x = OUT_L + 34;
    // 秋千、蹦床、温泉那几块地方空出来
    const busy = (px) => (L.swing && Math.abs(px - L.swing) < 26) || (L.tramp && Math.abs(px - L.tramp) < 24)
      || (L.garden && Math.abs(px - L.garden.x) < 34) || (L.pond && Math.abs(px - L.pond.x) < 48) || (L.camp && Math.abs(px - L.camp.x) < 28)
      || (L.spring && Math.abs(px - L.spring.x) < 54);
    const endX = W - 14;
    for (let n = 0; x < endX; n++) {
      if (busy(x)) {
        x += 6;
        continue;
      }
      const p = rand();
      let type, gap;
      if (n % 6 === 3) [type, gap] = ['special', 24];
      else if (p < 0.36) [type, gap] = ['tree', 30 * U];
      else if (p < 0.52) [type, gap] = ['bush', 18];
      else if (p < 0.70) [type, gap] = ['flowers', 14];
      else if (p < 0.81) [type, gap] = ['fence', 26];
      else if (p < 0.91) [type, gap] = ['lamp', 20];
      else [type, gap] = ['rock', 12];
      decor.push({ type, x: Math.round(x), v: rand(), seed: Math.floor(rand() * 1e6) });
      x += gap + rand() * 14;
    }
  }

  // ---------- 小部件 ----------
  // 有明暗的椭圆团块，树冠、灌木、云都用它
  function blob(cx, cy, rx, ry, tones, rand) {
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d > 1 + (rand() - 0.5) * 0.3) continue;
        const s = (dx / rx) * 0.6 + (dy / ry) * 0.8 + (rand() - 0.5) * 0.5;
        let col = s < -0.55 ? tones[2] : s > 0.45 ? tones[0] : tones[1];
        if (tones[3] && rand() < 0.05) col = tones[3];
        r(cx + dx, cy + dy, 1, 1, col);
      }
    }
  }

  function makeCloud(rand, w) {
    const c = newCanvas(w * 2 + 8, w + 6);
    paint(c, () => {
      const tones = ['#dfe6f2', '#ffffff', '#ffffff'];
      const base = w * 0.5 + 3;
      blob(Math.round(w * 0.6), Math.round(base + 1), Math.round(w * 0.45), Math.round(w * 0.25), tones, rand);
      blob(Math.round(w * 1.0), Math.round(base - 1), Math.round(w * 0.45), Math.round(w * 0.35), tones, rand);
      blob(Math.round(w * 1.45), Math.round(base + 1), Math.round(w * 0.4), Math.round(w * 0.25), tones, rand);
    });
    return outlined(c, '#a9b6d0');
  }

  const sunSprite = (() => {
    const c = newCanvas(17, 17);
    paint(c, () => {
      blob(8, 8, 4, 4, ['#f7b23a', '#ffd84a', '#fff1a0'], seeded(1));
      for (const [x, y] of [[8, 1], [8, 15], [1, 8], [15, 8], [3, 3], [13, 3], [3, 13], [13, 13]]) r(x, y, 1, 1, '#ffd84a');
    });
    return outlined(c, '#c47a1a');
  })();

  const moonSprite = (() => {
    const c = newCanvas(11, 11);
    paint(c, () => {
      blob(5, 5, 4, 4, ['#d8d3a8', '#f4f1d0', '#ffffff'], seeded(2));
      r(4, 3, 1, 1, '#d0caa0');
      r(6, 6, 2, 1, '#d0caa0');
    });
    return outlined(c, '#6a6a5a');
  })();

  // ---------- 静态图层（换季或改尺寸时才重画） ----------
  function ensureLayers() {
    const home = S.home;
    const key = `${W}x${H}:${season}:${CHARACTERS.filter((c) => owned(c.id)).map((c) => c.id + level(c.id)).join()}:${home.winOpen.join()}:${home.curtainClosed}:${Object.keys(S.decor).join()}:${JSON.stringify(S.layout)}:${JSON.stringify(S.stored)}:${H}`;
    if (layers.key === key) return;
    layers = {
      key, land: buildLand(), decor: buildDecor(), house: buildHouse(), pieces: buildPieces(),
      tableBack: gone('table') ? null : buildChairs(), table: gone('table') ? null : buildTable(), springFront: buildSpringFront(), swingFront: buildSwingFront(), tv: gone('tv') ? null : buildTV(),
    };
  }

  function buildLand() {
    return paint(newCanvas(W, H), () => {
      const rand = seeded(7);
      for (let x = DOOR_X; x < W; x++) {
        const [far, near] = hills[x];
        r(x, GROUND - far - 6, 1, far + 6, pal.hill2);
        r(x, GROUND - far - 6, 1, 1, lighten(pal.hill2, 0.3));
        r(x, GROUND - near, 1, near, pal.hill);
        r(x, GROUND - near, 1, 1, lighten(pal.hill, 0.25));
      }
      // 远处山坡上的小树
      for (let x = DOOR_X + 10; x < W; x += 14 + Math.floor(rand() * 20)) {
        const top = GROUND - hills[x][0] - 6;
        const tone = darken(pal.hill2, 0.25);
        r(x, top - 3, 3, 3, tone);
        r(x + 1, top - 4, 1, 1, tone);
      }
      gc.drawImage(buildBackTrees(), 0, 0);
      r(DOOR_X, GROUND, W - DOOR_X, H - GROUND, pal.grass);
      for (let i = 0; i < ((W - DOOR_X) * (H - GROUND)) / 9; i++) {
        const x = DOOR_X + Math.floor(rand() * (W - DOOR_X));
        const y = GROUND + 1 + Math.floor(rand() * (H - GROUND));
        r(x, y, 1, rand() < 0.5 ? 1 : 2, rand() < 0.6 ? pal.grassDark : pal.grassLight);
      }
      // 地平线上冒出来的草尖
      for (let x = DOOR_X; x < W; x += 2) {
        if (rand() < 0.5) r(x, GROUND - 1, 1, 1, pal.grass);
      }
      // 门口的踏脚石
      for (let i = 0; i < 4; i++) {
        const sx = DOOR_X + 4 + i * 9, sy = GROUND + 9 + (i % 2) * 3;
        r(sx, sy, 6, 3, season === 'winter' ? '#b9c6d4' : '#9a8f84');
        r(sx + 1, sy, 4, 1, season === 'winter' ? '#d8e2ec' : '#b3a99e');
      }
    });
  }

  // 远景树：沿着地平线种一排小一号的树，各品种混着，蒙一层淡淡的雾显得远
  function buildBackTrees() {
    const layer = newCanvas(W, H);
    const saveU = U;
    U = saveU * 0.62;
    paint(layer, () => {
      const rand = seeded(4242);
      for (let x = OUT_L + 14; x < W - 10; x += 26 + Math.floor(rand() * 22)) {
        drawTree(x, GROUND + 1, rand(), seeded(Math.floor(x * 13)));
      }
    });
    U = saveU;
    const edge = mixRgb(hexRgb(pal.hill), [20, 15, 31], 0.45).map((v) => v.toString(16).padStart(2, '0')).join('');
    const out = outlined(layer, '#' + edge);
    const og = out.getContext('2d');
    og.globalCompositeOperation = 'source-atop';
    og.fillStyle = rgb(hexRgb(pal.hill2), 0.3);
    og.fillRect(0, 0, W, H);
    og.globalCompositeOperation = 'source-over';
    return out;
  }

  function buildDecor() {
    const layer = paint(newCanvas(W, H), () => {
      const base = GROUND + 2;
      for (const d of decor) {
        const rand = seeded(d.seed);
        if (d.type === 'tree') drawTree(d.x, base, d.v, rand);
        else if (d.type === 'bush') drawBush(d.x, base, rand);
        else if (d.type === 'flowers') drawFlowers(d.x, base, d.v);
        else if (d.type === 'fence') drawFence(d.x, base);
        else if (d.type === 'lamp') drawLampPost(d.x, base);
        else if (d.type === 'rock') drawRock(d.x, base);
        else drawSpecial(d.x, base);
      }
      if (L.garden) drawGardenBeds();
      if (L.pond) drawPond();
      if (L.camp) drawCampfirePit();
      if (S.decor.bench && L.bench) drawBench();
      if (S.decor.scarecrow && L.garden) drawScarecrow();
      if (L.tramp) drawTrampoline();
      if (L.spring) drawSpringBack();
    });
    return outlined(layer);
  }

  // ---------- 户外设施 ----------
  // 画一条 w 像素粗的直线
  function line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) r(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, w, w, c);
  }

  // 秋千架（3/4 斜侧视角）：两副 A 字架一前一后，横梁斜着伸向画面里面，秋千左右荡。
  // 近处 A 架的顶点 N、远处 A 架的顶点 F；绳子挂在横梁中间 P 两侧
  // 简单秋千：正面看是两根柱子 + 一根横梁，座板朝着镜头前后荡。
  // 往镜头这边荡时座板在画面上往下移一点（离我们更近），往外荡时往上移；地上的影子跟着前后走，这样透视是对的
  const SWING_K = 0.5;               // 前后移动 1 像素，画面上上下移动多少
  const swingBase = () => {
    const d0 = floorTop() + 6 + (L.swingDY || 0);   // 秋千架脚的深度
    return { x: L.swing, d0, barY: d0 - 7 - ROPE };
  };
  // 座板此刻的位置（荡的角度 a，正的是往镜头这边）
  function swingSeat(a) {
    const { x, d0 } = swingBase();
    const z = Math.sin(a) * ROPE;
    return { x, y: d0 + z * SWING_K - 7 - ROPE * (1 - Math.cos(a)), shadowY: d0 + z * SWING_K, z };
  }
  function swingAngle(t) {
    const rider = spots.find((s) => s.kind === 'swing')?.who;
    return rider ? rider.swingA || 0 : Math.sin(t * 0.8) * 0.06;
  }
  // 架子：两根柱子 + 横梁（和秋千架脚一个深度，在后面走的角色会被挡住）
  function buildSwingFront() {
    if (!L.swing) return null;
    const { x, d0, barY } = swingBase();
    const layer = paint(newCanvas(W, H), () => {
      for (const px of [x - 14, x + 13]) {
        r(px, barY, 2, d0 - barY, '#8a5e3c');
        r(px, barY, 1, d0 - barY, '#a07450');
        r(px - 2, d0 - 1, 6, 2, '#6e4b34');
      }
      r(x - 16, barY - 2, 33, 3, '#7a5236');
      r(x - 16, barY - 2, 33, 1, '#a07450');
      if (season === 'winter') r(x - 16, barY - 3, 33, 1, '#ffffff');
    });
    return outlined(layer);
  }
  // 绳子和座板：画在坐着的角色身后
  function drawSwingSeat(t) {
    const { x, barY } = swingBase();
    const s = swingSeat(swingAngle(t));
    const sy = Math.round(s.y);
    for (const rx of [x - 6, x + 6]) line(rx, barY + 1, rx, sy - 1, '#d8c09a');
    // 往镜头这边荡时座板看起来宽一点
    const half = 7 + (s.z > 6 ? 1 : 0);
    r(x - half, sy, half * 2 + 1, 2, '#8a5e3c');
    r(x - half, sy, half * 2 + 1, 1, '#a07450');
  }

  // 蹦床：蓝色边框 + 黑色弹力布
  const trampY = () => GROUND + 10 + (L.trampDY || 0);
  function drawTrampoline() {
    const x = L.tramp, y = trampY();
    for (const lx of [x - 11, x - 4, x + 4, x + 11]) r(lx, y, 1, 4, '#3a3a4a');
    for (let dx = -14; dx <= 14; dx++) {
      const h = Math.round(3 * Math.sqrt(1 - (dx * dx) / 196));
      r(x + dx, y - h, 1, h * 2 + 1, '#3a6ac0');
      if (Math.abs(dx) < 13) r(x + dx, y - h + 1, 1, Math.max(1, h * 2 - 1), '#26223a');
    }
    if (season === 'winter') r(x - 8, y - 3, 16, 1, '#ffffff');
  }

  // 小菜园：4 块地的木框（土和作物会变，另外画）+ 小木牌
  const plotX = (i) => L.garden.x - 20 + i * 13;
  function drawGardenBeds() {
    const { x: gx, y: gy } = L.garden;
    for (let i = 0; i < 4; i++) {
      const px = plotX(i);
      r(px - 6, gy - 3, 13, 7, '#8a5e3c');
      r(px - 6, gy - 3, 13, 1, '#a07450');
    }
    r(gx - 30, gy - 10, 1, 12, '#6b4a2f');
    r(gx - 35, gy - 14, 11, 6, '#a07450');
    r(gx - 35, gy - 14, 11, 1, '#c09060');
    r(gx - 33, gy - 12, 2, 2, '#5cc25a');
    r(gx - 30, gy - 12, 3, 2, '#e8822a');
  }

  // 钓鱼池塘：不规则的水面，荷叶、芦苇；冬天结冰
  const POND_RX = 30, POND_RY = 7;
  const pondEdge = (a) => 1 + 0.1 * Math.sin(2 * a + 2.4) + 0.08 * Math.sin(5 * a + 0.5) + 0.04 * Math.sin(9 * a);
  function inPond(x, y) {
    if (!L.pond) return false;
    const nx = (x - L.pond.x) / POND_RX, ny = (y - L.pond.y) / POND_RY;
    return Math.hypot(nx, ny) <= pondEdge(Math.atan2(ny, nx)) * 0.95;
  }
  function drawPond() {
    const { x: cx, y: cy } = L.pond;
    const ice = season === 'winter';
    for (let dy = -POND_RY - 2; dy <= POND_RY + 2; dy++) {
      for (let dx = -POND_RX - 4; dx <= POND_RX + 4; dx++) {
        if (!inPond(cx + dx, cy + dy)) continue;
        let c = ice ? '#c8e0f0' : Math.hypot(dx / POND_RX, dy / POND_RY) < 0.55 ? '#2f6aa8' : '#3a7ab8';
        if (((dx * 5 + dy * 11) & 31) === 0) c = ice ? '#ffffff' : '#7ab0e0';
        r(cx + dx, cy + dy, 1, 1, c);
      }
    }
    if (ice) {
      line(cx - 12, cy - 2, cx - 2, cy + 1, '#a8c8e0');
      line(cx + 4, cy - 3, cx + 14, cy + 2, '#a8c8e0');
    } else {
      // 荷叶，夏天开小粉花
      for (const [lx, ly] of [[-14, -2], [6, 2], [16, -3], [-4, 4]]) {
        r(cx + lx - 2, cy + ly, 5, 2, '#3fa848');
        r(cx + lx - 1, cy + ly, 2, 1, '#5cc25a');
        if (season === 'summer' && lx > 0) r(cx + lx, cy + ly - 1, 1, 1, '#ff8fb1');
      }
    }
    // 岸边的芦苇（冬天是枯黄色）
    const reed = ice ? '#b8a070' : season === 'autumn' ? '#c8a050' : '#5aa53c';
    for (const rx of [-26, -23, 24, 27, 21]) {
      const h = 7 + (Math.abs(rx) % 4);
      r(cx + rx, cy - h, 1, h, reed);
      if (rx % 2) r(cx + rx, cy - h - 2, 1, 2, '#7a5230');
    }
  }

  // 篝火：一圈石头 + 三根木头凳子（火苗另外画）
  function drawCampfirePit() {
    const { x: cx, y: cy } = L.camp;
    for (let a = 0; a < Math.PI * 2; a += 0.7) r(cx + Math.cos(a) * 6 - 1, cy + Math.sin(a) * 2 - 1, 3, 2, a > 3 ? '#8a8a96' : '#74747f');
    r(cx - 4, cy - 1, 9, 2, '#3a2a20');
    for (const [lx, ly] of [[-15, 2], [15, 2], [0, -5]]) {
      r(cx + lx - 5, cy + ly - 1, 11, 3, '#7a5236');
      r(cx + lx - 5, cy + ly - 1, 11, 1, '#9a6e46');
      r(cx + lx + 4, cy + ly - 1, 2, 3, '#c8a070');
      if (season === 'winter') r(cx + lx - 4, cy + ly - 2, 9, 1, '#ffffff');
    }
  }

  // 温泉：不规则的池子。后半圈石头 + 整池水面 + ♨ 木牌画在背景里；前半池水和前排石头盖在泡澡的角色身上
  const SPRING_RX = 34, SPRING_RY = 9;
  const SPRING_WATERLINE = -1;        // 这条线以下的水挡住泡澡的角色
  const springEdge = (a) => 1 + 0.13 * Math.sin(3 * a + 0.7) + 0.08 * Math.sin(5 * a + 2.1) + 0.05 * Math.sin(8 * a + 1.3);
  function springShape(dx, dy) {
    const nx = dx / SPRING_RX, ny = dy / SPRING_RY;
    return Math.hypot(nx, ny) <= springEdge(Math.atan2(ny, nx)) * 0.95;
  }
  // 前后两层用同一套水面花纹，接缝处才看不出来
  function waterColor(dx, dy) {
    if (((dx * 7 + dy * 13) & 31) === 0) return '#8ad8e0';
    return Math.hypot(dx / SPRING_RX, dy / SPRING_RY) < 0.5 ? '#3f97a8' : '#4aa8b8';
  }
  function paintWater(fromDy) {
    const { x: cx, y: cy } = L.spring;
    for (let dy = fromDy; dy <= SPRING_RY + 2; dy++) {
      for (let dx = -SPRING_RX - 6; dx <= SPRING_RX + 6; dx++) {
        if (springShape(dx, dy)) r(cx + dx, cy + dy, 1, 1, waterColor(dx, dy));
      }
    }
  }
  // 池边一圈大小不一的石头；front=true 画前半圈
  function paintRocks(front) {
    const { x: cx, y: cy } = L.spring;
    const rand = seeded(front ? 78 : 77);
    const tones = season === 'summer' || season === 'spring' ? ['#8a8a96', '#74747f', '#9a9aa6', '#6a8a5a'] : ['#8a8a96', '#74747f', '#9a9aa6', '#84848f'];
    for (let a = 0; a < Math.PI * 2; a += 0.14 + rand() * 0.12) {
      const isFront = Math.sin(a) >= 0.15;
      const size = 2 + Math.floor(rand() * 4);
      if (isFront !== front) continue;
      const k = springEdge(a) * 0.98;
      const rx = cx + Math.cos(a) * SPRING_RX * k, ry = cy + Math.sin(a) * SPRING_RY * k;
      const c = tones[Math.floor(rand() * tones.length)];
      r(rx - size / 2, ry - size / 2, size + 1, size, c);
      r(rx - size / 2, ry - size / 2, size, 1, season === 'winter' ? '#ffffff' : lighten(c, 0.25));
    }
    // 两块大石头
    if (!front) blob(cx - SPRING_RX + 2, cy - 5, 5, 4, ['#6a6a76', '#82828e', '#a0a0ad'], seeded(31));
    else blob(cx + SPRING_RX - 3, cy + 6, 5, 3, ['#6a6a76', '#82828e', '#a0a0ad'], seeded(32));
  }
  function drawSpringBack() {
    const { x: cx, y: cy } = L.spring;
    paintWater(-SPRING_RY - 3);
    paintRocks(false);
    // 小木桶
    r(cx - 42, cy + 2, 7, 6, '#a07450');
    r(cx - 42, cy + 3, 7, 1, '#6b4a2f');
    r(cx - 42, cy + 6, 7, 1, '#6b4a2f');
    r(cx - 41, cy + 2, 5, 1, '#4aa8b8');
    // ♨ 木牌
    const sx = cx - 44;
    r(sx, cy - 16, 1, 18, '#6b4a2f');
    r(sx - 6, cy - 22, 13, 8, '#a07450');
    r(sx - 6, cy - 22, 13, 1, '#c09060');
    r(sx - 3, cy - 18, 7, 2, '#c23b55');
    r(sx - 2, cy - 21, 1, 3, '#c23b55');
    r(sx, cy - 21, 1, 3, '#c23b55');
    r(sx + 2, cy - 21, 1, 3, '#c23b55');
  }
  // 前半池水（不描边，免得水面中间多出一条黑线）+ 前排石头（描边）
  function buildSpringFront() {
    if (!L.spring) return null;
    const water = paint(newCanvas(W, H), () => paintWater(SPRING_WATERLINE));
    const rocks = outlined(paint(newCanvas(W, H), () => paintRocks(true)));
    water.getContext('2d').drawImage(rocks, 0, 0);
    return water;
  }

  // 泡澡的角色身边，水面上一圈晃动的涟漪
  function drawRipples(t) {
    const wy = L.spring.y + SPRING_WATERLINE;
    for (const s of spots) {
      if (s.kind !== 'bath' || !s.who) continue;
      // 左右各一小段，忽远忽近地晃，不连成一条线
      const x = Math.round(s.who.x), w = 5 + Math.round(Math.sin(t * 3 + x) * 1.5);
      if (Math.sin(t * 5 + x) > -0.5) {
        r(x - w - 2, wy, 2, 1, '#b8f0f4');
        r(x + w, wy, 2, 1, '#b8f0f4');
      }
    }
  }

  // ---------- 餐厅：长餐桌 + 季节美食 ----------
  const FOOD = {
    cake: (x, y) => { r(x - 2, y - 3, 5, 3, '#fff4e0'); r(x - 2, y - 3, 5, 1, '#ff9db8'); r(x, y - 4, 1, 1, '#ff3a5a'); },
    mochi: (x, y) => { r(x - 3, y - 2, 2, 2, '#ffb3cf'); r(x - 1, y - 3, 2, 2, '#ffffff'); r(x + 1, y - 2, 2, 2, '#9ad08a'); },
    salad: (x, y) => { r(x - 2, y - 2, 5, 2, '#d8e0e8'); r(x - 2, y - 3, 5, 1, '#5cc25a'); r(x, y - 4, 1, 1, '#ff5d5d'); },
    tea: (x, y) => { r(x - 1, y - 3, 3, 3, '#f4efe4'); r(x - 1, y - 3, 3, 1, '#9ac85a'); },
    watermelon: (x, y) => { r(x - 2, y - 3, 5, 2, '#ff5d5d'); r(x - 2, y - 1, 5, 1, '#3d8f2c'); r(x - 1, y - 3, 1, 1, '#222'); r(x + 1, y - 2, 1, 1, '#222'); },
    shavedIce: (x, y) => { r(x - 2, y - 2, 5, 2, '#a8d8ff'); r(x - 1, y - 4, 3, 2, '#ffffff'); r(x, y - 4, 1, 1, '#ff5d7a'); },
    noodles: (x, y) => { r(x - 2, y - 2, 5, 2, '#f4efe4'); r(x - 2, y - 3, 5, 1, '#ffe8a0'); },
    lemonade: (x, y) => { r(x - 1, y - 4, 3, 4, '#ffe66d'); r(x - 1, y - 4, 3, 1, '#ffffff'); },
    pumpkinPie: (x, y) => { r(x - 2, y - 2, 5, 2, '#e8822a'); r(x - 2, y - 2, 5, 1, '#f5a04a'); r(x - 3, y - 1, 7, 1, '#c8a060'); },
    chicken: (x, y) => { r(x - 2, y - 3, 5, 3, '#b8743a'); r(x - 1, y - 4, 3, 1, '#c88a4a'); r(x + 2, y - 4, 1, 1, '#ffffff'); },
    grapes: (x, y) => { r(x - 1, y - 3, 3, 2, '#8a4ab0'); r(x, y - 1, 1, 1, '#8a4ab0'); r(x, y - 4, 1, 1, '#5aa53c'); },
    apple: (x, y) => { r(x - 1, y - 3, 3, 3, '#e83a3a'); r(x, y - 4, 1, 1, '#6b4a2f'); },
    hotpot: (x, y) => { r(x - 3, y - 3, 7, 3, '#3a3a4a'); r(x - 2, y - 3, 5, 1, '#e8502a'); },
    dumplings: (x, y) => { r(x - 3, y - 2, 2, 2, '#fff4e0'); r(x, y - 2, 2, 2, '#fff4e0'); r(x - 1, y - 3, 2, 1, '#fff4e0'); },
    turkey: (x, y) => { r(x - 2, y - 3, 5, 3, '#9a5a2a'); r(x - 1, y - 4, 3, 1, '#b06a32'); r(x + 2, y - 4, 1, 1, '#ffffff'); },
    cocoa: (x, y) => { r(x - 1, y - 3, 3, 3, '#c23b55'); r(x - 1, y - 3, 3, 1, '#7a4a2a'); },
    steak: (x, y) => { r(x - 2, y - 2, 4, 2, '#7a3a20'); r(x - 2, y - 2, 4, 1, '#9a5a30'); r(x + 2, y - 2, 1, 1, '#5cc25a'); r(x - 3, y - 1, 1, 1, '#ffb030'); },
    lobster: (x, y) => { r(x - 2, y - 2, 5, 2, '#e8502a'); r(x - 2, y - 2, 5, 1, '#ff7a4a'); r(x - 3, y - 3, 1, 1, '#e8502a'); r(x + 3, y - 3, 1, 1, '#e8502a'); },
    soup: (x, y) => { r(x - 2, y - 2, 5, 2, '#ffffff'); r(x - 1, y - 2, 3, 1, '#e8a040'); r(x, y - 2, 1, 1, '#5cc25a'); },
    parfait: (x, y) => { r(x - 1, y - 4, 3, 4, '#ffffff'); r(x - 1, y - 3, 3, 1, '#ff9db8'); r(x - 1, y - 1, 3, 1, '#ffd0a0'); r(x, y - 5, 1, 1, '#ff3a5a'); },
  };
  // 晚宴的四道菜，每个座位轮着上
  const MENU = {
    spring: ['salad', 'steak', 'cake', 'parfait'],
    summer: ['lobster', 'watermelon', 'shavedIce', 'salad'],
    autumn: ['soup', 'turkey', 'pumpkinPie', 'grapes'],
    winter: ['soup', 'steak', 'dumplings', 'cocoa'],
  };
  const STEAMY = ['tea', 'soup', 'steak', 'turkey', 'cocoa', 'dumplings'];
  // 桌子中线上的摆设位置（都在两个座位之间）：两座烛台、两盆花、正中间的大菜
  const CANDLES = () => [SEAT_X0 + SEAT_GAP / 2, SEAT_X0 + SEAT_GAP * 4.5];
  const BOUQUETS = () => [SEAT_X0 + SEAT_GAP * 1.5, SEAT_X0 + SEAT_GAP * 3.5];
  const CENTER_X = () => SEAT_X0 + SEAT_GAP * 2.5;

  // 后排的椅背：在坐着的角色身后，露出桌子后沿
  function buildChairs() {
    const tt = L.table.top;
    const layer = paint(newCanvas(W, H), () => {
      for (let i = 0; i < 6; i++) {
        const sx = SEAT_X0 + i * SEAT_GAP;
        r(sx - 6, tt - 13, 2, 14, '#7d5838');
        r(sx + 5, tt - 13, 2, 14, '#7d5838');
        r(sx - 6, tt - 14, 13, 2, '#a07450');
        r(sx - 4, tt - 9, 9, 1, '#6e4b34');
        r(sx - 4, tt - 6, 9, 1, '#6e4b34');
      }
    });
    return outlined(layer);
  }

  // 两排座位的餐盘位置（盘子底边的 y）
  const plateRows = () => [[0, L.table.top + 3], [1, L.table.top + L.table.depth - 1]];

  // 长餐桌（俯视，高档晚宴）：白桌布 + 金色桌旗 + 每个座位一套餐具 + 烛台、花艺和季节大菜。
  // 画在后排角色前面、前排角色后面
  function buildTable() {
    const { top: tt, depth, frontY } = L.table;
    const accent = { spring: '#f4a8c4', summer: '#8ad0c0', autumn: '#e09040', winter: '#c23b55' }[season];
    const GOLD = '#d8b050', GOLD_D = '#a88030', SILVER = '#d0d6e0';
    const layer = paint(newCanvas(W, H), () => {
      // 前排丝绒软凳（在桌子前面、前排角色身后）
      for (let i = 0; i < 6; i++) {
        const sx = SEAT_X0 + i * SEAT_GAP;
        r(sx - 3, frontY, 1, 3, '#5a3c28');
        r(sx + 3, frontY, 1, 3, '#5a3c28');
        r(sx - 5, frontY - 3, 11, 3, '#8a2a3a');
        r(sx - 4, frontY - 3, 9, 1, '#b04a5a');
        r(sx - 5, frontY - 1, 11, 1, GOLD_D);
      }
      // 桌腿（从桌布下面露出来）
      for (const lx of [TABLE_X + 3, TABLE_X + TABLE_W / 2 - 1, TABLE_X + TABLE_W - 6]) r(lx, tt + depth + 4, 3, 4, '#5a3c28');
      // 白桌布：桌面 + 前面垂下来一截，下摆是波浪边
      r(TABLE_X, tt, TABLE_W, depth, '#f6f2ea');
      for (let x = TABLE_X + 8; x < TABLE_X + TABLE_W; x += 16) r(x, tt + 1, 1, depth - 1, '#ebe5d8');
      r(TABLE_X - 1, tt + depth, TABLE_W + 2, 4, '#ece6da');
      for (let x = TABLE_X - 1; x < TABLE_X + TABLE_W + 1; x += 4) {
        r(x, tt + depth + 4, 2, 1, '#ece6da');
        r(x + 2, tt + depth + 1, 1, 3, '#ddd6c8');
      }
      r(TABLE_X, tt, TABLE_W, 1, '#ffffff');
      // 金色桌旗，中间一条当季颜色
      const cy = tt + Math.floor(depth / 2);
      r(TABLE_X + 4, cy - 1, TABLE_W - 8, 3, GOLD);
      r(TABLE_X + 4, cy, TABLE_W - 8, 1, accent);
      r(TABLE_X + 4, tt + depth, TABLE_W - 8, 3, GOLD);
      r(TABLE_X + 4, tt + depth + 1, TABLE_W - 8, 1, accent);
      // 每个座位一套：金边底盘 + 白瓷盘 + 菜、左叉右刀、右上方红酒杯、左边折好的餐巾
      const menu = MENU[season];
      for (let i = 0; i < 6; i++) {
        const sx = SEAT_X0 + i * SEAT_GAP;
        for (const [row, py] of plateRows()) {
          r(sx - 4, py, 9, 1, GOLD);
          r(sx - 3, py - 1, 7, 1, '#ffffff');
          FOOD[menu[(i * 2 + row) % 4]](sx, py - 1);
          r(sx - 6, py - 2, 1, 3, SILVER);
          r(sx - 7, py - 2, 1, 1, SILVER);
          r(sx + 6, py - 2, 1, 3, '#e8ecf2');
          r(sx - 10, py - 1, 2, 2, accent);
          r(sx - 10, py - 2, 1, 1, lighten(accent, 0.3));
          // 红酒杯
          r(sx + 9, py - 1, 1, 1, '#e0f0f8');
          r(sx + 9, py - 3, 1, 2, '#e0f0f8');
          r(sx + 8, py - 5, 3, 2, '#c8e0f0');
          r(sx + 8, py - 4, 3, 1, '#8a1a3a');
        }
      }
      // 两座三叉金烛台（火苗另外画，会闪）
      for (const x of CANDLES()) {
        r(x - 2, cy + 1, 5, 1, GOLD_D);
        r(x, cy - 7, 1, 8, GOLD);
        r(x - 3, cy - 7, 7, 1, GOLD);
        r(x - 3, cy - 9, 1, 2, GOLD);
        r(x + 3, cy - 9, 1, 2, GOLD);
        r(x - 3, cy - 11, 1, 2, '#fff8e8');
        r(x + 3, cy - 11, 1, 2, '#fff8e8');
        r(x, cy - 12, 1, 5, '#fff8e8');
      }
      // 两盆花艺
      const petals = { spring: ['#f492b4', '#fbc4d8', '#ffffff'], summer: ['#ffd84a', '#ff8a5a', '#ffffff'], autumn: ['#e07a2c', '#c9502a', '#f0c060'], winter: ['#c23b55', '#ffffff', '#2f8f3a'] }[season];
      for (const x of BOUQUETS()) {
        r(x - 3, cy + 1, 7, 1, SILVER);
        blob(x, cy - 2, 4, 3, ['#2f7a2a', '#3fa848', '#5cc25a'], seeded(x));
        const rnd = seeded(x + 7);
        for (let k = 0; k < 7; k++) r(x - 3 + Math.floor(rnd() * 7), cy - 4 + Math.floor(rnd() * 4), 1, 1, petals[k % 3]);
      }
      // 正中间的季节大菜
      drawCenterpiece(CENTER_X(), cy + 1);
    });
    return outlined(layer);
  }

  // 晚宴主菜：春天三层草莓蛋糕、夏天水果塔、秋天烤火鸡、冬天圣诞树桩蛋糕
  function drawCenterpiece(x, y) {
    r(x - 7, y, 15, 1, '#d0d6e0');
    if (season === 'spring') {
      r(x - 5, y - 3, 11, 3, '#fff4f0');
      r(x - 4, y - 6, 9, 3, '#ffe0ea');
      r(x - 2, y - 9, 5, 3, '#fff4f0');
      r(x - 5, y - 3, 11, 1, '#ff9db8');
      r(x - 4, y - 6, 9, 1, '#ff9db8');
      for (const fx of [-3, 0, 3]) r(x + fx, y - 10, 1, 1, '#ff3a5a');
    } else if (season === 'summer') {
      r(x - 5, y - 2, 11, 2, '#ff5d5d');
      r(x - 5, y - 1, 11, 1, '#3d8f2c');
      r(x - 4, y - 5, 3, 3, '#ffa030');
      r(x + 2, y - 5, 3, 3, '#ffd84a');
      r(x - 1, y - 6, 3, 3, '#8a4ab0');
      r(x - 1, y - 8, 3, 2, '#ff3a5a');
      r(x, y - 9, 1, 1, '#5cc25a');
    } else if (season === 'autumn') {
      r(x - 5, y - 5, 11, 5, '#a0602a');
      r(x - 4, y - 6, 9, 1, '#b8743a');
      r(x - 3, y - 5, 4, 1, '#c88a4a');
      r(x - 7, y - 4, 2, 2, '#b8743a');
      r(x + 6, y - 4, 2, 2, '#b8743a');
      r(x - 8, y - 4, 1, 1, '#ffffff');
      r(x + 8, y - 4, 1, 1, '#ffffff');
      r(x - 6, y - 1, 2, 1, '#5cc25a');
      r(x + 5, y - 1, 2, 1, '#ff5d3a');
    } else {
      r(x - 6, y - 4, 13, 4, '#6a3a20');
      r(x - 6, y - 4, 13, 1, '#8a5a30');
      r(x + 6, y - 4, 1, 4, '#c8a070');
      for (const fx of [-4, -1, 2]) r(x + fx, y - 5, 1, 1, '#ffffff');
      r(x - 1, y - 6, 2, 1, '#2f8f3a');
      r(x + 1, y - 6, 1, 1, '#ff3a3a');
    }
  }

  // ---------- 树：七个品种，按 v 分 ----------
  // 叶子色阶 [暗, 中, 亮, 点缀]，null 表示冬天掉光
  const TREE_TONES = {
    sakura: { spring: ['#d06890', '#f08cb0', '#fbc4d8', '#ffffff'], summer: ['#2f7a2a', '#3f9a3a', '#5cba4a'], autumn: ['#b04a2a', '#d06a3a', '#f09a4a'], winter: null },
    oak: { spring: ['#4a9a3a', '#6aba4a', '#9ad86a'], summer: ['#22703a', '#2f8f3a', '#4fb04f', '#7ad66a'], autumn: ['#a8402a', '#d0602a', '#ec8f34', '#f5c242'], winter: null },
    maple: { spring: ['#4f9a3a', '#6cba4a', '#9ad86a'], summer: ['#2f7a2a', '#3f9a3a', '#5cba4a'], autumn: ['#a01e14', '#d0302a', '#f05a3a', '#ffb03a'], winter: null },
    ginkgo: { spring: ['#6aa83a', '#8ac84a', '#b0e070'], summer: ['#3f8a2a', '#5aa83a', '#7ac84a'], autumn: ['#c8941a', '#f0c030', '#ffe070'], winter: null },
    birch: { spring: ['#6ab84a', '#8ad060', '#b8e888'], summer: ['#4a9a3a', '#6ab84a', '#8ad060'], autumn: ['#c8a020', '#e8c040', '#fff080'], winter: null },
    willow: { spring: ['#6ab84a', '#8ad060', '#b8e888'], summer: ['#3a8a3a', '#5aa84a', '#7ac860'], autumn: ['#a8a030', '#c8c050', '#e8e070'], winter: null },
  };
  const BARK = { dark: '#4a3020', mid: '#6b4a2f', light: '#8a6440' };

  function drawTree(x, base, v, rand) {
    if (v < 0.2) return drawPine(x, base, v, rand);
    if (v < 0.32) return drawBirch(x, base, v, rand);
    if (v < 0.44) return drawFruitTree(x, base, v, rand);
    if (v < 0.58) return drawBroadleaf(x, base, v, rand, 'maple');
    if (v < 0.7) return drawGinkgo(x, base, v, rand);
    return drawBroadleaf(x, base, v, rand, season === 'spring' ? 'sakura' : 'oak');
  }

  // 有点收腰的树干：底部根脚外扩，右边一条暗面，左边一条亮面，中间几道树皮纹
  function trunk(x, base, th, w, bark = BARK) {
    for (let i = 0; i < th; i++) {
      const ww = w + (i < 2 ? 2 - i : 0) - (i > th * 0.75 ? 1 : 0);
      const lx = x - Math.floor(ww / 2);
      r(lx, base - 1 - i, ww, 1, bark.mid);
      r(lx, base - 1 - i, 1, 1, bark.light);
      r(lx + ww - 1, base - 1 - i, 1, 1, bark.dark);
      if (i % 4 === 2 && ww > 2) r(lx + 1, base - 1 - i, 1, 1, bark.dark);
    }
  }

  // 一团团树冠：先画一层偏暗的底，再按"后排 → 前排"叠几团有明暗的叶簇
  function canopy(cx, cy, rr, tones, rand, squash = 0.75) {
    blob(cx, cy + Math.round(rr * 0.25), Math.round(rr * 0.95), Math.round(rr * squash * 0.85), [tones[0], tones[0], tones[1]], rand);
    const clusters = [[-0.55, 0.1, 0.55], [0.55, 0.15, 0.55], [-0.3, -0.45, 0.5], [0.35, -0.4, 0.5], [0, -0.05, 0.62], [0, -0.7, 0.4]];
    for (const [ox, oy, k] of clusters) {
      blob(Math.round(cx + ox * rr), Math.round(cy + oy * rr * squash), Math.max(2, Math.round(rr * k)), Math.max(2, Math.round(rr * k * squash)), tones, rand);
    }
  }

  // 阔叶树（橡树 / 枫树 / 春天的樱花）：粗树干分出几根枝，枝头顶着叶簇
  function drawBroadleaf(x, base, v, rand, kind) {
    const th = Math.round((13 + v * 6) * U);
    const rr = Math.round((8 + v * 4) * U);
    const bark = kind === 'sakura' ? { dark: '#3e2626', mid: '#5a3a3a', light: '#7a5050' } : BARK;
    trunk(x, base, th, 3, bark);
    const top = base - th;
    // 分枝
    const arms = kind === 'sakura' ? [[-1.25, 0.55], [1.2, 0.5], [-0.6, 1.05], [0.65, 1], [0, 1.3]] : [[-1, 0.7], [1, 0.6], [0, 1]];
    const tips = arms.map(([dx, dy]) => ({ x: x + Math.round(dx * rr * 0.85), y: top - Math.round(dy * rr * 0.6) }));
    for (const tp of tips) line(x, top + 2, tp.x, tp.y, bark.mid, 2);
    if (season === 'winter') {
      for (const tp of tips) branch(tp.x, tp.y, rr * 0.45, Math.atan2(top - tp.y, tp.x - x) || 1.57, 1, rand);
      return;
    }
    const tones = TREE_TONES[kind][season];
    if (kind === 'sakura') {
      // 樱花：伞一样往两边铺开，花簇开在每根枝头和枝条中段，簇和簇之间露出枝干
      for (const tp of tips) {
        const mx = Math.round((x + tp.x) / 2), my = Math.round((top + tp.y) / 2);
        blob(mx, my - 1, Math.max(2, Math.round(rr * 0.28)), Math.max(2, Math.round(rr * 0.2)), tones, rand);
      }
      for (const tp of tips) blob(tp.x, tp.y - 1, Math.round(rr * 0.48), Math.round(rr * 0.34), tones, rand);
      for (let k = 0; k < 8; k++) r(x - rr + Math.floor(rand() * rr * 2), base - 1, 1, 1, tones[1 + (k % 2)]);
      return;
    }
    canopy(x, top - Math.round(rr * 0.45), rr, tones, rand, kind === 'maple' ? 0.8 : 0.72);
  }

  // 白桦：细长的白色树干带黑斑，树冠小而高
  function drawBirch(x, base, v, rand) {
    const th = Math.round((20 + v * 10) * U);
    for (let i = 0; i < th; i++) {
      r(x - 1, base - 1 - i, 2, 1, '#ecebe2');
      r(x, base - 1 - i, 1, 1, '#cfcdc2');
      if ((i * 7 + Math.floor(v * 10)) % 5 === 0) r(x - 1, base - 1 - i, 1 + (i % 2), 1, '#2a2a2a');
    }
    line(x, base - th * 0.6, x - 5, base - th * 0.8, '#d8d6cc');
    line(x, base - th * 0.7, x + 5, base - th * 0.9, '#d8d6cc');
    if (season === 'winter') {
      branch(x, base - th, 6, 1.4, 1, rand);
      branch(x, base - th, 6, 1.9, 1, rand);
      return;
    }
    const rr = Math.round((6 + v * 3) * U);
    canopy(x, base - th - Math.round(rr * 0.2), rr, TREE_TONES.birch[season], rand, 1.15);
  }

  // 果树：圆圆的树冠，春天开白花、夏天结红苹果、秋天果子变橙；冬天跟别的阔叶树一样只剩整齐的枝丫
  function drawFruitTree(x, base, v, rand) {
    drawBroadleaf(x, base, v, rand, 'oak');
    if (season === 'winter') return;
    const th = Math.round((13 + v * 6) * U), rr = Math.round((8 + v * 4) * U);
    const cy = base - th - Math.round(rr * 0.45);
    const cols = { spring: ['#ffffff', '#ffd0dc'], summer: ['#e8402a', '#ff6a4a'], autumn: ['#ff8a2a', '#ffc040'] }[season];
    for (let k = 0; k < 7; k++) {
      const px = Math.round(x + (rand() - 0.5) * rr * 1.5), py = Math.round(cy + (rand() - 0.5) * rr * 0.9);
      r(px, py, 2, 2, cols[k % 2]);
      if (season !== 'spring') r(px, py, 1, 1, '#ffffff');
    }
  }

  // （以前的垂柳，冬天太吓人，不再用了）
  function drawWillow(x, base, v, rand) {
    const th = Math.round((12 + v * 6) * U);
    trunk(x, base, th, 3);
    const top = base - th;
    const rr = Math.round((9 + v * 3) * U);
    const tones = TREE_TONES.willow[season] || ['#6b5a3a', '#8a7450', '#a08a60'];
    if (season !== 'winter') blob(x, top - 2, rr, Math.round(rr * 0.45), tones, rand);
    for (let dx = -rr; dx <= rr; dx += 2) {
      const len = Math.round((rr - Math.abs(dx)) * 0.9 + 6 + rand() * 6);
      const sway = dx < 0 ? -1 : 1;
      for (let i = 0; i < len; i++) r(x + dx + (i > len * 0.6 ? sway : 0), top - 1 + i, 1, 1, i % 5 === 0 ? tones[2] : tones[1]);
    }
  }

  // 银杏：往上收的扇形树冠，秋天金黄
  function drawGinkgo(x, base, v, rand) {
    const th = Math.round((14 + v * 6) * U);
    trunk(x, base, th, 3);
    const top = base - th;
    if (season === 'winter') {
      for (const ang of [1.2, 1.57, 1.95]) branch(x, top, 7 * U, ang, 1, rand);
      return;
    }
    const tones = TREE_TONES.ginkgo[season];
    const rr = Math.round((8 + v * 3) * U);
    for (let k = 0; k < 3; k++) {
      const w = Math.round(rr * (1 - k * 0.28));
      blob(x, top - Math.round(k * rr * 0.55), w, Math.max(2, Math.round(rr * 0.42)), tones, rand);
    }
    if (season === 'autumn') for (let k = 0; k < 8; k++) r(x - rr + Math.floor(rand() * rr * 2), base - 1 + Math.floor(rand() * 2), 1, 1, tones[1]);
  }

  // 冬天的光秃树枝，枝头和上沿堆点雪
  function branch(x, y, len, ang, depth, rand) {
    for (let i = 0; i < len; i++) {
      const px = x + Math.cos(ang) * i, py = y - Math.sin(ang) * i;
      r(px, py, 1, 1, '#5a3c26');
      if (rand() < 0.3) r(px, py - 1, 1, 1, '#ffffff');
    }
    const ex = x + Math.cos(ang) * len, ey = y - Math.sin(ang) * len;
    r(ex, ey - 1, 1, 1, '#ffffff');
    if (depth > 0) {
      branch(ex, ey, len * 0.6, ang + 0.45 + rand() * 0.3, depth - 1, rand);
      branch(ex, ey, len * 0.6, ang - 0.45 - rand() * 0.3, depth - 1, rand);
    }
  }

  // 松树：三四层锯齿边的针叶，左亮右暗，冬天每层积雪
  function drawPine(x, base, v, rand) {
    const h = Math.round((28 + v * 30) * U);
    trunk(x, base, 5, 3);
    const tones = season === 'winter' ? ['#1f4a3a', '#2a5e48', '#3a7458'] : ['#174a30', '#226a40', '#368a52'];
    const tiers = 4;
    const tierH = (h - 4) / tiers;
    for (let k = 0; k < tiers; k++) {
      const yBot = base - 4 - Math.round(k * tierH * 0.8);
      const yTop = yBot - Math.round(tierH * 1.25);
      const halfMax = Math.round(h * 0.28 * (1 - k / (tiers + 0.6)));
      for (let y = yTop; y <= yBot; y++) {
        const t = (y - yTop) / Math.max(1, yBot - yTop);
        const half = Math.round(halfMax * t);
        for (let dx = -half; dx <= half; dx++) {
          // 下沿锯齿
          if (y === yBot && (dx + k) % 3 === 0) continue;
          r(x + dx, y, 1, 1, dx < -half * 0.35 ? tones[2] : dx > half * 0.35 ? tones[0] : tones[1]);
        }
        if (season === 'winter' && t < 0.35) r(x - half, y, Math.max(1, half), 1, '#f4f8ff');
      }
      if (season === 'winter') r(x - halfMax + 1, yBot - 1, halfMax * 2 - 2, 1, '#f4f8ff');
    }
    r(x, base - h - 1, 1, 2, tones[2]);
  }

  function drawBush(x, base, rand) {
    blob(x, base - 4, 6, 4, pal.bush, rand);
    if (season === 'spring') for (let i = 0; i < 4; i++) r(x - 4 + Math.floor(rand() * 9), base - 7 + Math.floor(rand() * 5), 1, 1, '#ffffff');
  }

  function drawFlowers(x, base, v) {
    if (pal.flowers) {
      for (let i = 0; i < 4; i++) {
        const fx = x - 5 + i * 3, tall = i % 2;
        r(fx, base - 4 - tall, 1, 4 + tall, '#3d8f2c');
        r(fx + 1, base - 2, 1, 1, '#5aa53c');
        r(fx - 1, base - 6 - tall, 3, 2, pal.flowers[(i + Math.floor(v * 3)) % 3]);
        r(fx, base - 7 - tall, 1, 1, pal.flowers[(i + Math.floor(v * 3)) % 3]);
        r(fx, base - 6 - tall, 1, 1, '#fff6b0');
      }
    } else if (season === 'autumn') {
      for (let i = 0; i < 5; i++) r(x - 5 + i * 2, base - 3 - (i % 2) * 2, 1, 3 + (i % 2) * 2, i % 2 ? '#a07a32' : '#8a6a2a');
    } else {
      r(x - 4, base - 2, 8, 2, '#f4f8ff');
      r(x - 2, base - 3, 4, 1, '#f4f8ff');
    }
  }

  function drawFence(x, base) {
    for (let i = 0; i < 6; i++) {
      const px = x - 10 + i * 4;
      r(px, base - 9, 2, 9, '#c8a27a');
      r(px, base - 9, 1, 9, '#d8b48c');
      r(px, base - 10, 1, 1, '#c8a27a');
      if (season === 'winter') r(px, base - 11, 2, 1, '#ffffff');
    }
    r(x - 11, base - 7, 24, 1, '#a9845e');
    r(x - 11, base - 4, 24, 1, '#a9845e');
  }

  function drawLampPost(x, base) {
    r(x, base - 26, 1, 26, '#3a3a4a');
    r(x - 1, base - 2, 3, 2, '#3a3a4a');
    r(x - 2, base - 29, 5, 2, '#4a4a5c');
    r(x - 1, base - 27, 3, 1, '#9a9a8a');
    if (season === 'winter') r(x - 2, base - 30, 5, 1, '#ffffff');
  }

  function drawRock(x, base) {
    r(x - 3, base - 3, 7, 3, '#8a8a96');
    r(x - 2, base - 4, 5, 1, season === 'winter' ? '#ffffff' : '#a0a0ad');
    r(x + 1, base - 2, 2, 1, '#74747f');
  }

  // 季节限定：春天郁金香、夏天向日葵、秋天南瓜、冬天雪人
  function drawSpecial(x, y) {
    if (season === 'winter') {
      r(x - 4, y - 8, 9, 8, '#ffffff');
      r(x - 5, y - 6, 11, 5, '#ffffff');
      r(x + 2, y - 6, 2, 4, '#dfe8f2');
      r(x - 3, y - 14, 7, 6, '#ffffff');
      r(x + 2, y - 13, 1, 4, '#dfe8f2');
      r(x - 2, y - 12, 1, 1, '#222');
      r(x + 1, y - 12, 1, 1, '#222');
      r(x - 1, y - 11, 4, 1, '#ff8a2a');
      r(x - 3, y - 16, 7, 2, '#2a2a3a');
      r(x - 2, y - 19, 5, 3, '#2a2a3a');
      r(x - 2, y - 17, 5, 1, '#c23b55');
      r(x - 1, y - 6, 1, 1, '#222');
      r(x - 1, y - 4, 1, 1, '#222');
      r(x - 7, y - 9, 3, 1, '#6b4a2f');
      r(x + 5, y - 9, 3, 1, '#6b4a2f');
    } else if (season === 'autumn') {
      r(x - 4, y - 6, 9, 6, '#e8822a');
      r(x - 5, y - 5, 11, 4, '#e8822a');
      r(x - 3, y - 6, 2, 1, '#f5a04a');
      r(x - 1, y - 6, 1, 6, '#c5651c');
      r(x + 2, y - 6, 1, 6, '#c5651c');
      r(x, y - 8, 2, 2, '#4a7a2a');
      r(x + 2, y - 9, 2, 1, '#5a8a3a');
    } else if (season === 'summer') {
      r(x, y - 14, 1, 14, '#3d8f2c');
      r(x + 1, y - 7, 2, 1, '#3d8f2c');
      r(x - 2, y - 9, 2, 1, '#3d8f2c');
      r(x - 3, y - 19, 7, 5, '#ffd23a');
      r(x - 2, y - 20, 5, 7, '#ffd23a');
      r(x - 1, y - 18, 3, 3, '#7a4a1a');
      r(x - 1, y - 18, 1, 1, '#9a6a3a');
    } else {
      for (let i = 0; i < 3; i++) {
        const fx = x - 4 + i * 4, c = ['#ff5d7a', '#ffd84a', '#c48dff'][i];
        r(fx, y - 6, 1, 6, '#3d8f2c');
        r(fx + 1, y - 4, 1, 1, '#5aa53c');
        r(fx - 1, y - 9, 3, 3, c);
        r(fx - 1, y - 10, 1, 1, c);
        r(fx + 1, y - 10, 1, 1, c);
      }
    }
  }

  // 四季壁纸：底色 + 竖条纹 + 交错排列的小图案
  const WALLPAPER = {
    spring: { base: '#6a4f6e', stripe: '#715575', motif: (x, y) => {
      r(x, y - 1, 1, 1, '#e7a0bf'); r(x - 1, y, 1, 1, '#e7a0bf'); r(x + 1, y, 1, 1, '#e7a0bf'); r(x, y + 1, 1, 1, '#e7a0bf');
      r(x, y, 1, 1, '#ffe08a'); r(x + 1, y + 2, 1, 1, '#7ab07a');
    } },
    summer: { base: '#3f6460', stripe: '#456b66', motif: (x, y) => {
      r(x, y, 1, 1, '#7fc79a'); r(x + 1, y - 1, 1, 1, '#7fc79a'); r(x - 1, y + 1, 1, 1, '#5aa878'); r(x + 1, y, 1, 1, '#a8e0b8');
    } },
    autumn: { base: '#664534', stripe: '#6d4b39', motif: (x, y) => {
      r(x, y - 1, 1, 1, '#e08a3a'); r(x - 1, y, 3, 1, '#e08a3a'); r(x, y + 1, 1, 1, '#c8602a'); r(x, y + 2, 1, 1, '#8a5a30');
    } },
    winter: { base: '#475172', stripe: '#4d5879', motif: (x, y) => {
      r(x, y, 1, 1, '#d8e6ff'); r(x - 1, y - 1, 1, 1, '#a8bce0'); r(x + 1, y - 1, 1, 1, '#a8bce0'); r(x - 1, y + 1, 1, 1, '#a8bce0'); r(x + 1, y + 1, 1, 1, '#a8bce0');
    } },
  };

  function drawWallpaper(wainTop) {
    const wp = WALLPAPER[season];
    r(0, CEIL, DOOR_X, wainTop - CEIL, wp.base);
    for (let x = 0; x < HOUSE_R; x += 12) r(x, CEIL, 4, wainTop - CEIL, wp.stripe);
    for (let y = CEIL + 7, row = 0; y < wainTop - 4; y += 9, row++) {
      for (let x = 6 + (row % 2) * 6; x < HOUSE_R - 2; x += 12) wp.motif(x, y);
    }
  }

  // ---------- 加宽后的新家具（画在家具图层里，会描边） ----------
  // 壁炉：秋冬一直烧，春天晚上烧；主人手动开关过就按主人的来（换季后恢复自动）
  const fireLit = () => {
    const f = S.home.fire;
    if (f && f.season === season) return f.on;
    return season === 'autumn' || season === 'winter' || (season === 'spring' && sky.dark > 0.6);
  };
  // 灯：编号 0~3 是吊灯，'floor' 落地灯，'desk' 台灯
  const lampOn = (id) => !S.home.lampsOff.includes(id);
  const fireRect = () => ({ x: FIRE_X + 8, y: gy('fireplace') - 20, w: 24, h: 18 });

  // 砖砌壁炉 + 烟囱 + 壁炉台上的季节摆设（火苗另外画）
  function drawFireplace() {
    const G_ = gy('fireplace');
    const x0 = FIRE_X, top = G_ - 32;
    r(x0 + 8, CEIL + 3, 24, top - CEIL - 3, '#7a4a3c');
    for (let y = CEIL + 5, row = 0; y < top; y += 4, row++) {
      r(x0 + 8, y, 24, 1, '#5e382c');
      for (let x = x0 + 8 + (row % 2) * 4; x < x0 + 32; x += 8) r(x, y - 3, 1, 3, '#5e382c');
    }
    r(x0, top, 40, 32, '#8a5a4a');
    for (let y = top + 3, row = 0; y < G_; y += 4, row++) {
      r(x0, y, 40, 1, '#6e4436');
      for (let x = x0 + (row % 2) * 5; x < x0 + 40; x += 10) r(x, y - 3, 1, 3, '#6e4436');
    }
    const f = fireRect();
    r(f.x - 2, f.y - 2, f.w + 4, f.h + 2, '#5a3a30');
    r(f.x, f.y, f.w, f.h, '#1a1010');
    r(x0 - 3, top - 3, 46, 3, '#7d5838');
    r(x0 - 3, top - 3, 46, 1, '#a07450');
    r(x0 - 4, G_ - 2, 48, 2, '#6e6a72');
    // 壁炉台上的摆设
    const my = top - 3;
    r(x0 + 2, my - 6, 2, 6, '#f4efe4');
    r(x0 + 2, my - 7, 2, 1, '#ffcf4a');
    r(x0 + 36, my - 5, 2, 5, '#f4efe4');
    r(x0 + 36, my - 6, 2, 1, '#ffcf4a');
    if (season === 'winter') {
      for (let x = x0 - 2; x < x0 + 42; x += 3) r(x, my + 3 + ((x / 3) % 2), 2, 1, (x / 3) % 3 ? '#2f8f3a' : '#ff5d5d');
      for (const [sx, c] of [[x0 + 4, '#c23b55'], [x0 + 17, '#2f8f3a'], [x0 + 30, '#c23b55']]) {
        r(sx, my + 4, 4, 6, c);
        r(sx, my + 4, 4, 1, '#ffffff');
        r(sx + 2, my + 9, 3, 2, c);
      }
    } else if (season === 'autumn') {
      r(x0 + 10, my - 4, 6, 4, '#e8822a');
      r(x0 + 12, my - 4, 1, 4, '#c5651c');
      r(x0 + 12, my - 6, 2, 2, '#4a7a2a');
      r(x0 + 24, my - 3, 5, 3, '#f0a83a');
    } else if (season === 'spring') {
      r(x0 + 17, my - 5, 5, 5, '#7ab0d8');
      r(x0 + 18, my - 9, 1, 4, '#3d8f2c');
      r(x0 + 16, my - 11, 3, 2, '#ff8fb1');
      r(x0 + 20, my - 10, 2, 2, '#ffe66d');
    } else {
      r(x0 + 12, my - 4, 6, 4, '#f4d0a0');
      r(x0 + 13, my - 5, 4, 1, '#f4d0a0');
      r(x0 + 24, my - 6, 4, 6, '#3fa848');
      r(x0 + 25, my - 8, 2, 2, '#5cc25a');
    }
  }

  // 懒人沙发 + 落地灯 + 小圆地毯
  function drawBeanbagRug() {
    const G_ = gy('beanbag');
    const bx = BEANBAG_X;
    r(bx - 13, G_ + 6, 34, 8, '#5a7aa0');
    r(bx - 11, G_ + 8, 30, 4, '#7a9ac0');
  }
  function drawBeanbag() {
    const G_ = gy('beanbag');
    const bx = BEANBAG_X;
    blob(bx, G_ - 5, 9, 5, ['#a8402a', '#c9563a', '#e07a5a'], seeded(11));
    r(bx - 9, G_ - 1, 19, 2, '#a8402a');
  }
  function drawFloorLamp() {
    const G_ = gy('lamp');
    const lx = FLOOR_LAMP_X;
    r(lx, G_ - 34, 1, 34, '#3a3557');
    r(lx - 2, G_ - 1, 5, 1, '#3a3557');
    r(lx - 4, G_ - 39, 9, 5, '#f0d090');
    r(lx - 3, G_ - 39, 7, 1, '#fff0c0');
  }

  // 小厨房：冰箱、橱柜、咖啡机、调料架
  function drawFridge() {
    const G_ = gy('fridge');
    const fx = FRIDGE_X, ft = gy('fridge') - 36;
    r(fx, ft, 14, 36, '#d8e0e8');
    r(fx, ft, 14, 1, '#f4f8fc');
    r(fx, ft + 12, 14, 1, '#a8b4c0');
    r(fx + 11, ft + 4, 1, 5, '#8a96a4');
    r(fx + 11, ft + 16, 1, 8, '#8a96a4');
    r(fx + 3, ft + 18, 2, 2, '#ff5d7a');
    r(fx + 6, ft + 22, 2, 2, '#ffd84a');
    r(fx + 3, ft + 26, 3, 3, '#ffffff');
    r(fx + 4, ft + 27, 1, 1, '#d97757');
  }
  function drawCounter() {
    const cx = COUNTER_X, ct = gy('counter') - 16;
    r(cx, ct, 32, 16, '#8a6040');
    r(cx, ct, 32, 2, '#e8e0d0');
    r(cx + 15, ct + 3, 1, 12, '#6e4b34');
    r(cx + 11, ct + 7, 2, 1, '#d9b45a');
    r(cx + 18, ct + 7, 2, 1, '#d9b45a');
    // 咖啡机 + 杯子
    r(cx + 3, ct - 11, 8, 11, '#3a3557');
    r(cx + 3, ct - 11, 8, 1, '#55507a');
    r(cx + 5, ct - 5, 4, 1, '#26223a');
    r(cx + 9, ct - 9, 1, 1, '#ff5d5d');
    r(cx + 5, ct - 3, 3, 3, '#ffffff');
    // 鱼缸（小鱼另外画，会游）：玻璃框 + 水 + 底沙 + 水草
    const tk = tankRect();
    r(tk.x, tk.y, tk.w, tk.h, '#5a8ab0');
    r(tk.x + 1, tk.y + 2, tk.w - 2, tk.h - 3, '#7ab8e0');
    r(tk.x + 1, tk.y + tk.h - 3, tk.w - 2, 2, '#e8d8a8');
    r(tk.x + 3, tk.y + tk.h - 6, 1, 3, '#3fa848');
    r(tk.x + 4, tk.y + tk.h - 7, 1, 4, '#5cc25a');
    r(tk.x + tk.w - 4, tk.y + tk.h - 5, 1, 2, '#3fa848');
    r(tk.x + 9, tk.y + tk.h - 4, 2, 1, '#9a9aa6');
    r(tk.x, tk.y, tk.w, 1, '#3a3a4a');
  }
  // 厨房墙上的调料架
  function drawRack() {
    const { x: cx, y: sy } = L.rack;
    r(cx, sy, 32, 2, '#7d5838');
    [['#d97757', 3], ['#f4efe4', 4], ['#5bd36b', 3], ['#ffd21e', 4], ['#9b72cb', 3]].forEach(([c, hgt], i) => {
      r(cx + 2 + i * 6, sy - hgt, 4, hgt, c);
      r(cx + 2 + i * 6, sy - hgt, 4, 1, '#ffffff');
    });
  }

  // 立式钢琴（靠墙）+ 琴凳
  function drawPiano() {
    const G_ = gy('piano');
    const x = PIANO_X, top = G_ - 22;
    r(x, top, 20, 22, '#3a2228');
    r(x, top, 20, 1, '#5a3a40');
    r(x + 1, top + 1, 18, 2, '#4a2a30');
    r(x + 3, top + 4, 14, 5, '#2a1a1e');
    r(x + 7, top + 5, 6, 3, '#f4efe4');
    r(x + 8, top + 6, 1, 1, '#1a1a1a');
    r(x + 11, top + 6, 1, 1, '#1a1a1a');
    // 琴键
    r(x - 1, top + 10, 22, 3, '#2a1a1e');
    r(x, top + 11, 20, 2, '#ffffff');
    for (let k = 1; k < 20; k += 3) r(x + k, top + 11, 1, 1, '#1a1a1a');
    r(x + 1, top + 14, 2, 8, '#2a1a1e');
    r(x + 17, top + 14, 2, 8, '#2a1a1e');
    r(x + 6, G_ - 2, 3, 1, '#d8b050');
    r(x + 11, G_ - 2, 3, 1, '#d8b050');
    // 琴凳
    r(x + 4, G_ + 1, 12, 3, '#3a2228');
    r(x + 4, G_ + 1, 12, 1, '#5a3a40');
    r(x + 5, G_ + 4, 1, 2, '#2a1a1e');
    r(x + 14, G_ + 4, 1, 2, '#2a1a1e');
  }

  // ---------- 商城买来的家具 ----------
  // 唱片机：摆在钢琴顶上
  const recordRect = () => ({ x: PIANO_X + 5, y: gy('piano') - 27, w: 10, h: 5 });
  function drawRecordPlayer() {
    const rc = recordRect();
    r(rc.x, rc.y + 2, rc.w, 3, '#7d5838');
    r(rc.x, rc.y + 2, rc.w, 1, '#a07450');
    r(rc.x + 1, rc.y + 1, 7, 1, '#1a1a1e');
    r(rc.x + 3, rc.y + 1, 2, 1, '#c23b55');
    r(rc.x + 8, rc.y, 1, 2, '#d0d6e0');
  }
  // 户外长椅（两个座位）
  function drawBench() {
    const { x, y } = L.bench;
    r(x - 10, y - 9, 21, 2, '#8a5e3c');
    r(x - 10, y - 9, 21, 1, '#a07450');
    r(x - 10, y - 6, 21, 1, '#7a5236');
    r(x - 11, y - 4, 23, 2, '#8a5e3c');
    r(x - 11, y - 4, 23, 1, '#a07450');
    r(x - 9, y - 2, 1, 3, '#3a3a4a');
    r(x + 9, y - 2, 1, 3, '#3a3a4a');
    if (season === 'winter') r(x - 11, y - 5, 23, 1, '#ffffff');
  }
  // 稻草人：守在菜园右边
  function drawScarecrow() {
    const x = L.garden.x + 34, y = L.garden.y + 2;
    r(x, y - 22, 1, 22, '#6b4a2f');
    r(x - 7, y - 15, 15, 1, '#6b4a2f');
    r(x - 4, y - 16, 9, 9, '#5a7ab8');
    r(x - 4, y - 16, 9, 1, '#7a9ad0');
    r(x - 6, y - 15, 2, 3, '#e8c870');
    r(x + 5, y - 15, 2, 3, '#e8c870');
    r(x - 2, y - 22, 5, 5, '#f0d8a0');
    r(x - 1, y - 21, 1, 1, '#2a2a2a');
    r(x + 1, y - 21, 1, 1, '#2a2a2a');
    r(x - 4, y - 24, 9, 2, '#b8863a');
    r(x - 2, y - 26, 5, 2, '#b8863a');
    if (season === 'winter') r(x - 4, y - 25, 9, 1, '#ffffff');
  }
  // 远处山坡上的小风车，叶片一直转
  function drawWindmill(t) {
    const x = Math.round(OUT_L + (W - OUT_L) * 0.47);
    const base = GROUND - hills[x][0] - 5;
    r(x - 2, base - 13, 5, 13, '#e8e0d0');
    r(x - 2, base - 13, 1, 13, '#ffffff');
    r(x - 3, base - 15, 7, 2, '#a8503e');
    r(x, base - 4, 1, 3, '#7d5838');
    const cx = x, cy = base - 12;
    for (let k = 0; k < 4; k++) {
      const a = t * 1.2 + (k * Math.PI) / 2;
      line(cx, cy, cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, '#f4efe4');
    }
    r(cx - 1, cy - 1, 2, 2, '#7d5838');
  }
  // 屋顶下挂的一串彩灯：画在最上层，晚上才显得亮
  function drawStringLights(t) {
    const cols = ['#ff5d5d', '#ffd84a', '#5bd36b', '#5d9dff', '#ff8fb1'];
    const lit = sky.dark > 0.25;
    for (let x = 6, i = 0; x < HOUSE_R - 4; x += 8, i++) {
      const sag = Math.round(Math.sin(((x % 48) / 48) * Math.PI) * 3);
      r(x, CEIL + 3 + sag, 4, 1, '#2a2a34');
      const on = !lit || Math.sin(t * 3 + i * 1.3) > -0.3;
      r(x + 1, CEIL + 4 + sag, 2, 2, on ? cols[i % cols.length] : darken(cols[i % cols.length], 0.4));
      if (lit && on) {
        g.fillStyle = rgb(hexRgb(cols[i % cols.length]), 0.25 * sky.dark);
        g.fillRect(x - 1, CEIL + 2 + sag, 6, 6);
      }
    }
  }

  // 猫爬架：麻绳柱子 + 三层台子，最上面是个小窝
  function drawCatTree() {
    const x = CATTREE_X, base = L.catBase;
    const rope = '#d8c098', ropeD = '#b8a078', pad = '#9a7ab8', padL = '#b89ad0';
    r(x - 1, base - 2, 26, 3, pad);
    r(x - 1, base - 2, 26, 1, padL);
    for (const [px, py0, py1] of [[10, base - 2, base - 30], [3, base - 2, base - 9], [20, base - 9, base - 19]]) {
      r(x + px, py1, 3, py0 - py1, rope);
      for (let y = py1 + 1; y < py0; y += 2) r(x + px, y, 3, 1, ropeD);
    }
    r(x, base - 10, 11, 2, pad);
    r(x, base - 10, 11, 1, padL);
    r(x + 14, base - 20, 11, 2, pad);
    r(x + 14, base - 20, 11, 1, padL);
    // 顶层小窝
    r(x + 4, base - 30, 15, 9, pad);
    r(x + 4, base - 30, 15, 1, padL);
    r(x + 8, base - 27, 7, 5, '#5a4a70');
    r(x + 9, base - 28, 5, 1, '#5a4a70');
    // 挂着的小毛球
    r(x + 23, base - 18, 1, 5, '#c8b08a');
    r(x + 22, base - 13, 3, 3, '#ff8fb1');
  }

  // 电视 + 游戏机 + 两个坐垫（地板上，屏幕内容另外画）
  function buildTV() {
    const x = TV_X, y = L.tv.y, cy = L.tv.cushionY;
    const layer = paint(newCanvas(W, H), () => {
      r(x, y - 4, 28, 4, '#6e4b34');
      r(x, y - 4, 28, 1, '#8a6040');
      r(x + 2, y, 2, 2, '#4a3020');
      r(x + 24, y, 2, 2, '#4a3020');
      r(x + 9, y - 3, 10, 2, '#2a2a34');
      r(x + 17, y - 3, 1, 1, '#7ef59a');
      r(x + 2, y - 19, 24, 15, '#22222a');
      r(x + 2, y - 19, 24, 1, '#3a3a48');
      r(x + 13, y - 5, 2, 1, '#3a3a48');
      for (const gx of [x + 6, x + 22]) {
        r(gx - 5, cy - 2, 11, 3, '#c25b6e');
        r(gx - 4, cy - 2, 9, 1, '#d87a8a');
      }
    });
    return outlined(layer);
  }
  const tvScreen = () => ({ x: TV_X + 4, y: L.tv.y - 17, w: 20, h: 11 });

  // 窗框：关着时中间有十字窗棂；打开时两扇窗页往屋里推开，侧着只看到窄窄一条
  function drawWindowFrame(w, open) {
    const wood = '#7d5838';
    r(w.x, w.y, w.w, 2, wood);
    r(w.x, w.y + w.h - 2, w.w, 2, wood);
    r(w.x, w.y, 2, w.h, wood);
    r(w.x + w.w - 2, w.y, 2, w.h, wood);
    if (open) {
      for (const lx of [w.x + 2, w.x + w.w - 5]) {
        r(lx, w.y + 1, 3, w.h - 2, '#a07450');
        r(lx + 1, w.y + 3, 1, w.h - 6, '#cfe6f2');
      }
    } else {
      r(w.x + w.w / 2 - 1, w.y, 2, w.h, wood);
      if (w.w > 30) r(w.x + 2, w.y + Math.round(w.h / 2) - 1, w.w - 4, 2, wood);
    }
    r(w.x - 2, w.y + w.h, w.w + 4, 2, '#a07450');
    if (season === 'winter') {
      r(w.x - 2, w.y + w.h - 1, w.w + 4, 1, '#f4f8ff');
      if (!open) {
        r(w.x + 2, w.y + w.h - 4, 4, 2, 'rgba(230,240,255,0.7)');
        r(w.x + w.w - 7, w.y + w.h - 4, 5, 2, 'rgba(230,240,255,0.7)');
      }
    }
  }

  // 卧室角：小床（被子跟季节换）+ 床头第二扇窗
  const QUILT = { spring: ['#f4a8c4', '#ffffff'], summer: ['#8ad0c0', '#ffffff'], autumn: ['#e09040', '#ffe0a0'], winter: ['#5a7ac0', '#d8e6ff'] };
  function drawBed() {
    const G_ = gy('bed');
    const bx = BED_X;
    r(bx + 28, G_ - 20, 4, 20, '#7d5838');
    r(bx + 28, G_ - 20, 4, 1, '#a07450');
    r(bx, G_ - 12, 3, 12, '#7d5838');
    r(bx, G_ - 6, 32, 4, '#6e4b34');
    r(bx + 2, G_ - 2, 2, 2, '#5a3c28');
    r(bx + 27, G_ - 2, 2, 2, '#5a3c28');
    r(bx + 3, G_ - 9, 25, 3, '#f4efe4');
    r(bx + 20, G_ - 12, 8, 3, '#ffffff');
    r(bx + 20, G_ - 12, 8, 1, '#e8e0d0');
    drawQuilt();
  }
  function drawBedRug() {
    const G_ = gy('bed');
    const bx = BED_X;
    r(bx - 2, G_ + 6, 24, 6, '#c2708e');
    r(bx, G_ + 7, 20, 4, '#e0a0b8');
  }

  // 被子：家具图层里画一次，有人睡觉时再盖在他身上画一次
  function drawQuilt() {
    const G_ = gy('bed');
    const [c1, c2] = QUILT[season];
    const bx = BED_X;
    r(bx + 3, G_ - 9, 22, 5, c1);
    for (let x = bx + 4; x < bx + 25; x += 4) r(x, G_ - 7, 2, 2, c2);
    r(bx + 3, G_ - 9, 22, 1, lighten(c1, 0.3));
  }

  // ---------- 屋里的每件落地家具：各画各的，装修时能单独挪 ----------
  function drawArmchair() {
    // 扶手椅
    const ay = gy('armchair'), AX = ARMCHAIR_X;
    r(AX + 2, ay - 20, 22, 12, '#c9963a');
    r(AX + 3, ay - 19, 20, 2, '#e0b45a');
    r(AX + 0, ay - 12, 26, 7, '#b5852f');
    r(AX + 0, ay - 13, 5, 8, '#c9963a');
    r(AX + 21, ay - 13, 5, 8, '#c9963a');
    r(AX + 0, ay - 13, 5, 1, '#e0b45a');
    r(AX + 21, ay - 13, 5, 1, '#e0b45a');
    r(AX + 5, ay - 12, 16, 2, '#d8a848');
    r(AX + 8, ay - 17, 8, 5, '#d97757');
    r(AX + 9, ay - 17, 6, 1, '#f0a58a');
    r(AX + 1, ay - 5, 2, 5, '#5a3c28');
    r(AX + 23, ay - 5, 2, 5, '#5a3c28');

    // 边桌 + 当季小摆设
    r(AX + 28, ay - 12, 12, 2, '#8a6040');
    r(AX + 28, ay - 12, 12, 1, '#a07450');
    r(AX + 30, ay - 10, 1, 10, '#6e4b34');
    r(AX + 37, ay - 10, 1, 10, '#6e4b34');
    r(AX + 30, ay - 4, 8, 1, '#6e4b34');
    const ty = ay - 12;
    if (season === 'spring') {
      r(AX + 32, ty - 5, 4, 5, '#7ab0d8');
      r(AX + 33, ty - 5, 1, 5, '#a8d0ee');
      r(AX + 33, ty - 8, 1, 3, '#3d8f2c');
      r(AX + 31, ty - 10, 2, 2, '#ff8fb1');
      r(AX + 34, ty - 11, 2, 2, '#ffe66d');
      r(AX + 33, ty - 12, 1, 1, '#ffffff');
    } else if (season === 'summer') {
      r(AX + 32, ty - 6, 4, 6, '#ff9d5a');
      r(AX + 32, ty - 6, 4, 1, '#ffd0a0');
      r(AX + 33, ty - 4, 1, 3, '#ffc080');
      r(AX + 35, ty - 9, 1, 4, '#ff5d7a');
    } else if (season === 'autumn') {
      r(AX + 31, ty - 4, 6, 4, '#e8822a');
      r(AX + 33, ty - 4, 1, 4, '#c5651c');
      r(AX + 33, ty - 6, 2, 2, '#4a7a2a');
    } else {
      r(AX + 32, ty - 5, 4, 5, '#e8e0d0');
      r(AX + 32, ty - 5, 4, 1, '#7a4a2a');
      r(AX + 36, ty - 4, 1, 2, '#e8e0d0');
    }

  }
  function drawCabinet() {
    // 机柜（指示灯另外画）
    r(CAB_X + 0, gy('cabinet') - 20, 22, 20, '#3a3557');
    r(CAB_X + 0, gy('cabinet') - 20, 22, 1, '#55507a');
    for (let i = 0; i < 3; i++) r(CAB_X + 2, gy('cabinet') - 17 + i * 5, 18, 3, '#26223a');
    r(CAB_X + 1, gy('cabinet') - 1, 3, 1, '#26223a');
    r(CAB_X + 18, gy('cabinet') - 1, 3, 1, '#26223a');

  }
  function drawDesk() {
    // 书桌 + 显示器 + 台灯 + 键盘 + 杯子（屏幕内容另外画）
    const desk = L.desk, dt = desk.top;
    r(DESK_X + 0, dt, 48, 3, '#8a6040');
    r(DESK_X + 0, dt, 48, 1, '#a07450');
    r(DESK_X + 2, dt + 3, 2, gy('desk') - dt - 3, '#6e4b34');
    r(DESK_X + 32, dt + 3, 14, gy('desk') - dt - 4, '#7a5438');
    r(DESK_X + 33, dt + 5, 12, 1, '#5a3c28');
    r(DESK_X + 37, dt + 7, 4, 1, '#d9b45a');
    const { mx, my, mw, mh } = desk;
    r(mx + mw / 2 - 2, dt - 3, 4, 3, '#3a3557');
    r(mx + mw / 2 - 4, dt - 1, 8, 1, '#3a3557');
    r(mx, my, mw, mh, '#4a4568');
    r(mx, my, mw, 1, '#6a6590');
    r(mx + 2, my + 2, mw - 4, mh - 4, '#0f1a14');
    r(DESK_X + 9, dt - 2, 12, 2, '#d8d4e8');
    for (let k = 0; k < 5; k++) r(DESK_X + 10 + k * 2, dt - 2, 1, 1, '#a8a4c0');
    r(DESK_X + 42, dt - 4, 4, 4, '#ffffff');
    r(DESK_X + 42, dt - 4, 4, 1, '#d97757');
    r(DESK_X + 46, dt - 3, 1, 2, '#ffffff');
    r(DESK_X + 1, dt - 2, 5, 2, '#3a3557');
    r(DESK_X + 3, dt - 9, 1, 7, '#3a3557');
    r(DESK_X + 3, dt - 11, 5, 3, '#c23b55');
    r(DESK_X + 4, dt - 11, 3, 1, '#e05a72');

  }
  function drawSofa() {
    if (!L.sofa) return;
    // 照片墙下面的长沙发
    if (L.sofa) {
      const sx0 = L.sofa.x, sw = L.sofa.w;
      r(sx0 + 2, gy('sofa') - 20, sw - 4, 10, '#4a5a9a');
      r(sx0 + 3, gy('sofa') - 19, sw - 6, 2, '#6a7aba');
      for (let x = sx0 + sw / 3; x < sx0 + sw - 4; x += sw / 3) r(x, gy('sofa') - 18, 1, 8, '#3a4a82');
      r(sx0, gy('sofa') - 11, sw, 6, '#3f4f8a');
      r(sx0 + 4, gy('sofa') - 11, sw - 8, 2, '#5a6aaa');
      r(sx0 - 2, gy('sofa') - 15, 6, 10, '#4a5a9a');
      r(sx0 + sw - 4, gy('sofa') - 15, 6, 10, '#4a5a9a');
      r(sx0 - 2, gy('sofa') - 15, 6, 1, '#6a7aba');
      r(sx0 + sw - 4, gy('sofa') - 15, 6, 1, '#6a7aba');
      r(sx0 + 6, gy('sofa') - 17, 7, 6, '#ffcf4a');
      r(sx0 + sw - 13, gy('sofa') - 17, 7, 6, '#d97757');
      r(sx0, gy('sofa') - 5, 2, 5, '#2a1e16');
      r(sx0 + sw - 2, gy('sofa') - 5, 2, 5, '#2a1e16');
    }

  }
  function drawShelf() {
    // 书架 + 顶上的盆栽和奖杯
    const SX = SHELF_X;
    const shelfH = L.shelfH, sy = gy('shelf') - shelfH;
    r(SX, sy, 28, shelfH, '#5a3d2b');
    r(SX, sy, 28, 1, '#7d5838');
    const shelves = Math.max(2, Math.floor((shelfH - 4) / 9));
    const books = ['#d97757', '#4d6bfe', '#5bd36b', '#ffd21e', '#9b72cb', '#ff7a8a', '#10a37f'];
    for (let s = 0; s < shelves; s++) {
      const by = sy + 2 + s * 9;
      r(SX + 2, by, 24, 7, '#2a1e16');
      for (let b = 0; b < 6; b++) {
        const bh = 6 - (b % 3 === 1 ? 1 : 0);
        if ((b + s) % 5 === 4) {
          r(SX + 3 + b * 4, by + 7 - bh + 2, 3, bh - 2, books[(b + s * 2) % books.length]);
          continue;
        }
        r(SX + 3 + b * 4, by + 7 - bh, 3, bh, books[(b + s * 2) % books.length]);
        r(SX + 3 + b * 4, by + 7 - bh + 1, 3, 1, 'rgba(255,255,255,0.35)');
      }
    }
    r(SX + 3, sy - 5, 6, 5, '#a65a3a');
    r(SX + 3, sy - 5, 6, 1, '#c27050');
    blob(SX + 6, sy - 8, 4, 3, ['#2f8f3a', '#3fa848', '#5cc25a'], seeded(3));
    r(SX + 1, sy - 3, 2, 4, '#3fa848');
    r(SX + 18, sy - 2, 6, 2, '#a07c2a');
    r(SX + 20, sy - 6, 2, 4, '#e0b030');
    r(SX + 18, sy - 9, 6, 3, '#ffd23a');
    r(SX + 19, sy - 9, 1, 2, '#fff1a0');

  }
  function drawRugDecal() {
    // 地毯
    r(RUG_X, gy('rug') + 8, 90, 12, '#7a3550');
    r(RUG_X + 2, gy('rug') + 10, 86, 8, '#9a4766');
    for (let x = RUG_X + 4; x < RUG_X + 86; x += 4) r(x, gy('rug') + 13, 2, 2, (x / 4) % 2 ? '#c2708e' : '#e0b45a');
    for (let x = RUG_X + 1; x < RUG_X + 90; x += 3) {
      r(x, gy('rug') + 7, 1, 1, '#c2708e');
      r(x, gy('rug') + 20, 1, 1, '#c2708e');
    }
  }
  function drawTableRug() {
    // 餐桌下的大地毯：酒红底 + 金色花边 + 菱形花纹
    const rx0 = TABLE_X - 10, rw = TABLE_W + 20;
    const ry0 = L.table.top - 5, rh = Math.min(floorBottom(), L.table.frontY + 4) - ry0;
    r(rx0, ry0, rw, rh, '#6a2a3a');
    r(rx0 + 2, ry0 + 2, rw - 4, rh - 4, '#c8a050');
    r(rx0 + 3, ry0 + 3, rw - 6, rh - 6, '#7a3045');
    for (let x = rx0 + 8; x < rx0 + rw - 8; x += 12) {
      const cy = ry0 + Math.round(rh / 2);
      r(x, cy - 1, 1, 3, '#c8a050');
      r(x - 1, cy, 3, 1, '#c8a050');
    }
    for (let x = rx0 + 1; x < rx0 + rw - 1; x += 3) {
      r(x, ry0 - 1, 1, 1, '#c8a050');
      r(x, ry0 + rh, 1, 1, '#c8a050');
    }
  }

  function buildHouse() {
    const lw = DOOR_X + 12;
    const { win, shelfH, cord, clock, cork, desk } = L;
    const wainTop = GROUND - L.wainH;
    // 墙面、护墙板和地板（不描边）
    const back = paint(newCanvas(lw, H), () => {
      drawWallpaper(wainTop);
      r(0, wainTop - 2, DOOR_X, 2, '#8a6040');
      r(0, wainTop - 2, DOOR_X, 1, '#a07450');
      r(0, wainTop, DOOR_X, L.wainH, '#6e4b34');
      for (let x = 3; x < HOUSE_R; x += 7) {
        r(x, wainTop, 1, L.wainH, '#5a3c28');
        r(x + 1, wainTop, 1, L.wainH, '#7d5840');
      }
      r(0, GROUND - 2, DOOR_X, 2, '#3e2a1c');
      for (let row = 0, y = GROUND; y < H; row++, y += 6) {
        r(0, y, DOOR_X, 6, row % 2 ? '#5b3f2c' : '#654632');
        r(0, y, DOOR_X, 1, row % 2 ? '#664a35' : '#70503a');
        r(0, y + 5, DOOR_X, 1, '#48311f');
        for (let x = (row * 13) % 24; x < DOOR_X; x += 24) {
          r(x, y, 1, 5, '#48311f');
          r(x + 7, y + 2, 4, 1, '#584029');
        }
      }
      gc.clearRect(win.x + 2, win.y + 2, win.w - 4, win.h - 4);
      const w2 = L.win2;
      gc.clearRect(w2.x + 2, w2.y + 2, w2.w - 4, w2.h - 4);
    });

    // 家具和摆设（描边）
    const objs = paint(newCanvas(lw, H), () => {
      // 天花板横梁
      r(0, CEIL, DOOR_X, 3, '#5a3c28');
      r(0, CEIL + 2, DOOR_X, 1, '#432d1e');

      // 窗户 + 窗帘（窗可以开关，窗帘可以拉上拉开）
      drawWindowFrame(win, S.home.winOpen[0]);
      r(win.x - 5, win.y - 3, win.w + 10, 1, '#a07450');
      if (S.home.curtainClosed) {
        // 拉上：两片窗帘在中间合拢，有几道褶子
        for (const [cx, w] of [[win.x - 4, win.w / 2 + 4], [win.x + win.w / 2, win.w / 2 + 4]]) {
          r(cx, win.y - 2, w, win.h + 4, '#3f7a6e');
          for (let fx = cx + 2; fx < cx + w - 1; fx += 4) r(fx, win.y - 2, 1, win.h + 4, '#5a9a8a');
          for (let fx = cx + 4; fx < cx + w - 1; fx += 4) r(fx, win.y - 2, 1, win.h + 4, '#2f6a5e');
        }
      } else {
        for (const [cx, dir] of [[win.x - 4, 1], [win.x + win.w, -1]]) {
          r(cx, win.y - 2, 4, win.h + 4, '#3f7a6e');
          r(cx + (dir > 0 ? 1 : 2), win.y - 2, 1, win.h + 4, '#5a9a8a');
          r(cx, win.y + Math.round(win.h * 0.55), 4, 2, '#d9b45a');
        }
      }

      // 吊灯（灯泡另外画）
      for (const lx of LAMPS) {
        r(lx, CEIL + 3, 1, cord - 3, '#2a1e16');
        r(lx - 3, CEIL + cord, 7, 3, '#e8c170');
        r(lx - 4, CEIL + cord + 2, 9, 1, '#d0a850');
        r(lx - 2, CEIL + cord, 2, 1, '#f5dc98');
      }

      // 挂钟（指针另外画）
      if (L.showClock) {
        for (let dy = -6; dy <= 6; dy++) {
          for (let dx = -6; dx <= 6; dx++) {
            const d = Math.hypot(dx, dy);
            if (d <= 4.3) r(clock.x + dx, clock.y + dy, 1, 1, dx + dy < -3 ? '#ffffff' : '#f4efe4');
            else if (d <= 5.6) r(clock.x + dx, clock.y + dy, 1, 1, dx + dy < 0 ? '#a07048' : '#7a5236');
          }
        }
        r(clock.x, clock.y - 3, 1, 1, '#3a3050');
        r(clock.x + 3, clock.y, 1, 1, '#3a3050');
        r(clock.x, clock.y + 3, 1, 1, '#3a3050');
        r(clock.x - 3, clock.y, 1, 1, '#3a3050');
      }

      // 软木留言板
      if (cork) {
        r(cork.x, cork.y, cork.w, cork.h, '#8a6040');
        r(cork.x + 1, cork.y + 1, cork.w - 2, cork.h - 2, '#c89a62');
        for (let i = 0; i < 18; i++) r(cork.x + 2 + ((i * 7) % (cork.w - 4)), cork.y + 2 + ((i * 5) % (cork.h - 4)), 1, 1, '#b08550');
        const notes = [['#ffe66d', 3, 2], ['#ff9db8', 13, 4], ['#9ee6a8', 28, 2], ['#9fc8ff', 20, cork.h - 9]];
        for (const [c, nx, ny] of notes) {
          if (ny + 6 > cork.h - 1 || nx + 6 > cork.w - 1) continue;
          r(cork.x + nx, cork.y + ny, 6, 6, c);
          r(cork.x + nx + 1, cork.y + ny + 2, 4, 1, 'rgba(60,40,40,0.35)');
          r(cork.x + nx + 1, cork.y + ny + 4, 3, 1, 'rgba(60,40,40,0.35)');
          r(cork.x + nx + 2, cork.y + ny, 1, 1, '#c23b55');
        }
        // 一张小照片
        if (cork.h >= 12) {
          const px = cork.x + 5, py = cork.y + cork.h - 9;
          r(px, py, 9, 7, '#ffffff');
          r(px + 1, py + 1, 7, 3, '#7ec4f0');
          r(px + 1, py + 4, 7, 2, '#5aa53c');
          r(px + 3, py + 2, 2, 2, '#d97757');
        }
      }

      // 相框墙：买到的角色挂出相框，没买到的位置先钉着钉子
      const FRAME_COLORS = ['#c9963a', '#7d5838', '#b8b8c8', '#a8503e', '#5a3c28'];
      CHARACTERS.forEach((c, i) => {
        const f = frameRect(i);
        if (!f) return;
        if (!owned(c.id)) {
          r(f.x + 11, f.y + 3, 2, 2, '#8a8a96');
          return;
        }
        const isMax = level(c.id) >= maxLevel(c.id);
        const fc = isMax ? '#ffd23a' : FRAME_COLORS[i % FRAME_COLORS.length];
        r(f.x + 11, f.y - 3, 2, 3, '#2a1e16');
        r(f.x, f.y, 24, 24, fc);
        r(f.x, f.y, 24, 1, lighten(fc, 0.3));
        r(f.x, f.y, 1, 24, lighten(fc, 0.2));
        r(f.x + 2, f.y + 2, 20, 20, lighten(Object.values(c.colors)[0], 0.72));
        const spr = getSprite(c.id);
        gc.drawImage(spr, f.x + 12 - Math.floor(spr.width / 2), f.y + 12 - Math.floor(spr.height / 2));
        // 相框底边的等级点：亮的是已升到的级数
        const lv = level(c.id);
        for (let k = 0; k < maxLevel(c.id); k++) {
          r(f.x + 4 + k * 2, f.y + 22, 1, 1, k < lv ? (isMax ? '#ffffff' : '#ffcf4a') : darken(fc, 0.35));
        }
        if (isMax) {
          const crown = getSprite('crown');
          gc.drawImage(crown, f.x + 12 - Math.floor(crown.width / 2), f.y - 4);
        }
      });

      // 卧室的窗、厨房墙上的调料架（墙上的东西，可以在墙上挪）
      drawWindowFrame(L.win2, S.home.winOpen[1]);
      if (!gone('counter')) drawRack();

    });

    // 房子结构（描边）
    const struct = paint(newCanvas(lw, H), () => {
      const roofW = DOOR_X + 8;
      r(0, 2, roofW, CEIL - 2, '#8a3b2e');
      for (let y = 3, row = 0; y < CEIL - 1; y += 3, row++) {
        r(0, y + 2, roofW, 1, '#6e2d23');
        for (let x = (row % 2) * 3; x < roofW; x += 6) r(x, y, 1, 2, '#6e2d23');
      }
      r(0, 2, roofW, 1, '#a8503e');
      r(0, CEIL - 1, roofW, 1, '#5a241c');
      if (season === 'winter') {
        r(0, 0, roofW + 1, 3, '#f4f8ff');
        for (let x = 6; x < roofW; x += 17) r(x, 3, 2, 1 + (x % 3), '#f4f8ff');
      }
      r(0, CEIL, 3, H - CEIL, '#2a2240');
      r(HOUSE_R, CEIL, WALL, GROUND - 24 - CEIL, '#2a2240');
      r(HOUSE_R - 1, GROUND - 25, WALL + 2, 2, '#7a5236');
      r(HOUSE_R - 1, GROUND - 25, 1, 25, '#7a5236');
      r(DOOR_X, GROUND - 25, 1, 25, '#7a5236');
      r(DOOR_X + 2, GROUND - 23, 3, 23, '#8a5e3c');
      r(DOOR_X + 2, GROUND - 23, 1, 23, '#a07048');
      r(DOOR_X + 4, GROUND - 13, 1, 2, '#ffcf4a');
      r(HOUSE_R, GROUND, WALL + 1, H - GROUND, '#4a3324');
      // 门口地垫
      r(DOOR_X + 6, GROUND + 3, 14, 3, '#7a5a3a');
      r(DOOR_X + 7, GROUND + 4, 12, 1, '#9a7a4a');
    });
    // 地上的地毯（在所有家具和角色下面）
    const decals = paint(newCanvas(lw, H), () => {
      if (!gone('rug')) drawRugDecal();
      if (!gone('beanbag')) drawBeanbagRug();
      if (!gone('bed')) drawBedRug();
      if (!gone('table')) drawTableRug();
    });
    const house = newCanvas(lw, H);
    const hg = house.getContext('2d');
    hg.drawImage(back, 0, 0);
    hg.drawImage(outlined(decals), 0, 0);
    hg.drawImage(outlined(objs), 0, 0);
    hg.drawImage(outlined(struct), 0, 0);
    return house;
  }

  // 靠墙的落地家具：画法、每帧会动的部分（显示器、炉火、鱼……）
  const PIECES = {
    armchair: { name: '扶手椅', draw: drawArmchair, anim: animArmchair },
    piano: { name: '钢琴', draw: () => { drawPiano(); if (S.decor.record) drawRecordPlayer(); } },
    cabinet: { name: '机柜和芯片', draw: drawCabinet, anim: animCabinet },
    desk: { name: '书桌', draw: drawDesk, anim: animDesk },
    cattree: { name: '猫爬架', draw: drawCatTree },
    sofa: { name: '长沙发', draw: drawSofa },
    shelf: { name: '书架', draw: drawShelf },
    fireplace: { name: '壁炉', draw: drawFireplace, anim: drawFire },
    beanbag: { name: '懒人沙发', draw: drawBeanbag },
    lamp: { name: '落地灯', draw: drawFloorLamp, anim: animFloorLamp },
    fridge: { name: '冰箱', draw: drawFridge },
    counter: { name: '橱柜和鱼缸', draw: drawCounter, anim: animCounter },
    bed: { name: '床', draw: drawBed },
  };
  const WALL_PIECES = Object.keys(PIECES);
  // 每件家具画到自己的小图上（裁掉空白、描边），记下左上角在场景里的位置
  const pieceCache = new Map();
  function buildPieces() {
    const out = {};
    for (const [k, p] of Object.entries(PIECES)) {
      if (gone(k)) continue;
      // 只重画位置、季节变了的那几件（装修拖动时每挪一下都要重建）
      const ck = [k, season, H, FLOOR_X[k]?.(), PD[k], S.decor.record].join();
      if (pieceCache.has(ck)) {
        if (pieceCache.get(ck)) out[k] = pieceCache.get(ck);
        continue;
      }
      pieceCache.set(ck, null);
      if (pieceCache.size > 200) pieceCache.clear();
      const full = paint(newCanvas(DOOR_X + 12, H), p.draw);
      const a = full.getContext('2d').getImageData(0, 0, full.width, full.height).data;
      let x0 = full.width, y0 = full.height, x1 = -1, y1 = -1;
      for (let y = 0; y < full.height; y++) {
        for (let x = 0; x < full.width; x++) {
          if (!a[(y * full.width + x) * 4 + 3]) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) continue;
      x0 = Math.max(0, x0 - 1);
      y0 = Math.max(0, y0 - 1);
      const w = Math.min(full.width - x0, x1 - x0 + 3), h = Math.min(full.height - y0, y1 - y0 + 3);
      const crop = newCanvas(w, h);
      crop.getContext('2d').drawImage(full, x0, y0, w, h, 0, 0, w, h);
      out[k] = { img: outlined(crop), x: x0, y: y0, w, h };
      pieceCache.set(ck, out[k]);
    }
    return out;
  }
  const pieceBox = (k) => layers.pieces?.[k];
  // 家具在深度排序里的位置：靠墙时比所有角色都靠后；坐在它上面的角色紧跟在它后面画
  const pieceSort = (k) => gy(k) - 0.5;

  // ---------- 角色 ----------
  function spawn(type, drop) {
    const out = !drop && Math.random() < 0.3;
    // 别生在餐桌、池塘这些家具里面
    let x = randX(out), y = randY();
    const obs = obstacles();
    for (let k = 0; k < 30 && obs.some((o) => inBox({ x, y }, o)); k++) {
      x = randX(out);
      y = randY();
    }
    // slot：这是这种角色的第几只（对应 S.pets 里那只的名字、好感和统计）
    const used = entities.filter((e) => e.type === type).map((e) => e.slot);
    let slot = 0;
    while (used.includes(slot)) slot++;
    entities.push({
      type, slot, x, y, tx: x, ty: y,
      dir: Math.random() < 0.5 ? -1 : 1,
      speed: 7 + Math.random() * 7,
      state: 'idle',
      timer: Math.random() * 3,
      phase: Math.random() * 10,
      drop: drop ? 40 : 0,
      jump: 0,
      hold: 0,
      emit: 1 + Math.random() * 4,
      out: x > HOUSE_R,
    });
  }

  function sync(animate = true) {
    CHARACTERS.forEach((c) => {
      const want = Math.min(owned(c.id), MAX_SHOWN);
      // 编号大的先离开，留下来的还是原来那几只
      const mine = entities.filter((e) => e.type === c.id).sort((a, b) => a.slot - b.slot);
      for (let i = mine.length; i < want; i++) spawn(c.id, animate);
      for (let i = want; i < mine.length; i++) {
        leaveSpot(mine[i]);
        entities.splice(entities.indexOf(mine[i]), 1);
      }
    });
  }

  // ---------- 坐下 / 打字 / 睡觉 / 吃饭 / 泡温泉 / 荡秋千 / 蹦床 ----------
  // 闲逛够了想找点事做：饭点去餐桌，晚上钻被窝，冬天和夜里爱泡温泉
  function chooseSpot(e, wantOut) {
    if (decorOn) return null;
    const night = sky.dark > 0.6;
    const meal = isMealTime();
    // 看星星只在天黑以后
    const free = spots.filter((s) => !s.who && !s.reserved && (s.kind !== 'sleep' || night || Math.random() < 0.08) && (s.kind !== 'stargaze' || sky.dark > 0.45));
    const of = (kind) => free.filter((s) => s.kind === kind);
    if (meal && of('eat').length && Math.random() < 0.7) return pick(of('eat'));
    const baths = of('bath');
    if (baths.length && Math.random() < (night ? 0.06 : 0) + (season === 'winter' ? 0.06 : 0)) return pick(baths);
    // 晚上篝火点起来了，有人会出去烤火
    if (night && of('camp').length && Math.random() < 0.12) return pick(of('camp'));
    if (wantOut) {
      // 下雨时户外只剩温泉能去
      const outs = free.filter((s) => s.out && (!raining() || s.kind === 'bath'));
      if (!outs.length || Math.random() > 0.4) return null;
      // 冬天更爱泡温泉，夏天更爱荡秋千和蹦床
      if (baths.length && Math.random() < (season === 'winter' ? 0.6 : 0.3)) return pick(baths);
      return pick(outs);
    }
    const jam = free.filter((s) => INSTR.includes(s.kind) && !s.out);
    if (jam.length && spots.some((s) => INSTR.includes(s.kind) && s.who) && Math.random() < 0.3) return pick(jam);
    const coder = e.type === 'clawd';
    if (Math.random() > (coder ? 0.6 : night ? 0.55 : 0.35)) return null;
    // 不是饭点也偶尔去餐桌坐坐
    const inside = free.filter((s) => !s.out && (s.kind !== 'eat' || Math.random() < 0.15));
    if (!inside.length) return null;
    const beds = night ? inside.filter((s) => s.kind === 'sleep') : [];
    const desk = inside.find((s) => s.kind === 'type');
    if (beds.length && Math.random() < 0.6) return pick(beds);
    // Clawd 是个代码狂，比别人更爱去书桌
    if (coder && desk && Math.random() < 0.75) return desk;
    return pick(inside);
  }

  function leaveSpot(e) {
    for (const s of spots) {
      if (s.who === e) s.who = null;
      if (s.reserved === e) s.reserved = null;
    }
    // 从位子上下来：轻轻跳回地上，不瞬移
    if (e.act) {
      startHop(e, e.act.ax, e.act.ay);
      e.tx = e.act.ax;
      e.ty = e.act.ay;
      e.out = e.act.ax > DOOR_X - 2;
    }
    e.act = null;
    e.goal = null;
    e.lift = 0;
  }

  // ---------- 合奏 ----------
  const INSTR = ['piano', 'guitar', 'violin', 'drums', 'synth'];
  let ensemble = false;               // 两个以上的人在演奏
  let lastBeat = -1, nextCheer = 0, nextJamBonus = 0;
  function updateBand(dt, now) {
    const players = entities.filter((e) => e.act && INSTR.includes(e.act.kind));
    music.update(!!(S.decor.record && S.home.music), new Set(players.map((e) => e.act.kind)));
    const was = ensemble;
    ensemble = players.length >= 2;
    if (ensemble && !was) {
      nextCheer = now + 4000;
      nextJamBonus = now + 10000;
      talk.sayTo(pick(players), pick(JAM_LINES.start));
    }
    if (!ensemble) return;
    // 踩着拍子冒音符
    const b = music.beat();
    if (b && b.n !== lastBeat) {
      lastBeat = b.n;
      for (const e of players) if (Math.random() < 0.5) musicNotes(e.x, e.y - 14, 1);
    }
    // 合奏一起演得越久越熟
    if (now > nextJamBonus) {
      nextJamBonus = now + 10000;
      for (let i = 0; i < players.length; i++) {
        addAff(players[i], 1);
        for (let j = i + 1; j < players.length; j++) addRel(players[i], players[j], 1);
      }
    }
    // 附近闲着的跑来听，鼓掌叫好
    if (now > nextCheer) {
      nextCheer = now + 5000 + Math.random() * 5000;
      const cx = players.reduce((s, e) => s + e.x, 0) / players.length;
      const fans = entities.filter((e) => socialFree(e) && e.out === players[0].out && Math.abs(e.x - cx) < 110);
      const fan = fans.length && pick(fans);
      if (fan) {
        fan.dir = cx >= fan.x ? 1 : -1;
        fan.jump = 0.4;
        fan.hold = 3;
        for (let k = 0; k < 5; k++) particles.push({ x: fan.x + (Math.random() - 0.5) * 8, y: fan.y - getSprite(fan.type).height, life: 0.6, decay: 1.5, rise: 10, size: 1, color: pick(['#ffe14a', '#ffffff']) });
        talk.sayTo(fan, pick(JAM_LINES.cheer));
      }
    }
  }

  // ---------- 角色互动：拥抱、击掌、吵架、打架、和好 ----------
  let nextSocial = performance.now() + 15000;
  let nextRelTick = performance.now() + 10000;
  let fights = [];                    // 正在打架的烟尘团 { a, b, x, y, t, dur }
  const alive = (e) => entities.includes(e);
  const socialFree = (e) => !e.act && !e.goal && !e.held && !e.fall && !e.hop && !e.chasing && !e.joining && !e.social && e.drop === 0 && e.hold <= 0;

  function updateSocial(dt, now) {
    for (const f of [...fights]) if ((f.t += dt) >= f.dur) endFight(f);
    for (const e of entities) if (e.dizzy > 0) e.dizzy -= dt;
    // 一起做事的会慢慢变熟：同桌吃饭、一起泡温泉、一起烤火、一起打游戏
    if (now > nextRelTick) {
      nextRelTick = now + 10000;
      for (const kind of ['eat', 'bath', 'camp', 'game']) {
        const group = entities.filter((e) => e.act?.kind === kind);
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) addRel(group[i], group[j], kind === 'game' ? 0.5 : 1);
      }
    }
    if (now < nextSocial) return;
    nextSocial = now + 8000 + Math.random() * 12000;
    // 挑一对都闲着的：关系越好或越差越容易被挑中，离得太远的不算
    const cands = entities.filter(socialFree);
    const pairs = [];
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i], b = cands[j];
        if (a.out !== b.out || Math.hypot(a.x - b.x, a.y - b.y) > 170) continue;
        pairs.push({ a, b, w: Math.abs(getRel(a, b)) + 10 + Math.random() * 40 });
      }
    }
    pairs.sort((p, q) => q.w - p.w);
    for (const { a, b } of pairs.slice(0, 3)) {
      const kind = pickSocial(getRel(a, b));
      if (!kind) continue;
      interact(a, b, kind, true);
      return;
    }
  }

  // 关系好就抱抱击掌，关系差就吵架，特别差会打起来；死对头偶尔也会和好
  function pickSocial(rel) {
    const r = Math.random();
    if (rel <= -30 && r < 0.25) return 'makeup';
    if (rel <= -40) return r < 0.6 ? 'fight' : 'argue';
    if (rel <= -15) return r < 0.8 ? 'argue' : 'fight';
    if (rel >= 25) return r < 0.6 ? 'hug' : 'highfive';
    return r < 0.2 ? 'argue' : r < 0.55 ? 'highfive' : r < 0.75 ? 'hug' : null;
  }

  // a 站着等，b 走过来，到了再开始互动
  function interact(a, b, kind, approach, maxWait = 10000) {
    a.social = b.social = kind;
    const done = () => {
      for (const e of [a, b]) {
        e.social = null;
        e.lean = 0;
        e.joining = false;
        if (!e.act) e.hold = 0;
      }
    };
    if (!approach) return perform(a, b, kind, done);
    const gap = kind === 'hug' ? 9 : kind === 'fight' ? 6 : 14;
    a.hold = 12;
    b.tx = a.x + (b.x >= a.x ? 1 : -1) * gap;
    b.ty = a.y;
    b.state = 'walk';
    b.joining = true;
    const t0 = performance.now();
    const wait = () => {
      if (!alive(a) || !alive(b) || a.held || b.held) return done();
      if (b.joining && performance.now() - t0 < maxWait) return setTimeout(wait, 150);
      if (Math.hypot(a.x - b.x, a.y - b.y) > 24) return done();
      perform(a, b, kind, done);
    };
    setTimeout(wait, 150);
  }

  // 这两只有专属台词就用专属的（PAIR_SOCIAL 按名字字母序写，第一句是排在前面的那只说的）
  function pairTalk(a, b, kind) {
    const own = PAIR_SOCIAL[[a.type, b.type].sort().join('|')]?.[kind];
    if (!own || Math.random() < 0.3) return talk.pair(a, b, pick(SOCIAL_LINES[kind]));
    const [first, second] = a.type <= b.type ? [a, b] : [b, a];
    talk.pair(first, second, pick(own));
  }
  function perform(a, b, kind, done) {
    a.dir = b.x >= a.x ? 1 : -1;
    b.dir = -a.dir;
    a.hold = b.hold = 4;
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 12 };
    if (kind === 'hug' || kind === 'makeup') {
      // 两只往中间靠，贴在一起
      for (const e of [a, b]) {
        e.jump = 0.4;
        e.sqv = (e.sqv || 0) + 3;
        e.lean = e.dir * Math.max(0, Math.floor((Math.abs(a.x - b.x) - 8) / 2));
      }
      const top = Math.min(a.y - getSprite(a.type).height, b.y - getSprite(b.type).height);
      for (let k = 0; k < 3; k++) setTimeout(() => particles.push({ x: mid.x + (Math.random() - 0.5) * 8, y: top - 2, life: 1.6, decay: 0.8, rise: 8, sprite: 'heart' }), k * 700);
      // 先冒爱心，过一会儿再开口（气泡会挡住爱心）
      setTimeout(() => alive(a) && alive(b) && pairTalk(a, b, kind), 1600);
      addRel(a, b, kind === 'makeup' ? 15 : 4);
      setTimeout(done, 4500);
    } else if (kind === 'highfive') {
      for (const e of [a, b]) e.jump = 0.4;
      for (let k = 0; k < 8; k++) particles.push({ x: mid.x, y: mid.y + 4, life: 0.6, decay: 1.6, rise: (Math.random() - 0.3) * 20, size: 1, color: pick(['#ffe14a', '#ffffff']) });
      pairTalk(a, b, 'highfive');
      addRel(a, b, 2);
      setTimeout(done, 3000);
    } else if (kind === 'argue') {
      const puff = () => {
        for (const e of [a, b]) if (alive(e)) particles.push({ x: e.x + 4, y: e.y - getSprite(e.type).height - 2, life: 0.9, rise: 4, sprite: 'anger' });
      };
      puff();
      setTimeout(puff, 1300);
      setTimeout(puff, 2600);
      pairTalk(a, b, 'argue');
      addRel(a, b, -4);
      // 吵完扭头就走
      setTimeout(() => {
        done();
        for (const [e, d] of [[a, -1], [b, 1]]) {
          if (!alive(e) || e.held) continue;
          const away = (e === a ? a.dir : b.dir) * -1;
          e.tx = e.x + away * 30 * d * d;
          e.ty = e.y;
          e.state = 'walk';
        }
      }, 3800);
    } else if (kind === 'fight') {
      talk.sayTo(a, pick(SOCIAL_LINES.fightStart));
      setTimeout(() => {
        if (!alive(a) || !alive(b) || a.held || b.held) return done();
        a.fighting = b.fighting = true;
        fights.push({ a, b, x: (a.x + b.x) / 2, y: Math.max(a.y, b.y), t: 0, dur: 3, done });
      }, 700);
    }
  }

  // 打完：两个从烟尘里弹开，眼冒金星
  function endFight(f) {
    fights.splice(fights.indexOf(f), 1);
    const { a, b } = f;
    addRel(a, b, -8);
    for (const [e, d] of [[a, -1], [b, 1]]) {
      if (!alive(e)) continue;
      e.fighting = false;
      e.x = f.x + d * 4;
      e.y = f.y;
      e.fall = { vx: d * (28 + Math.random() * 14), vy: -95, landY: f.y, fromY: f.y - 1, ko: true };
      e.dizzy = 4;
      addAff(e, -1);
    }
    f.done();
    setTimeout(() => {
      if (alive(a)) talk.sayTo(a, pick(SOCIAL_LINES.fightAfter));
      setTimeout(() => alive(b) && talk.sayTo(b, pick(SOCIAL_LINES.fightAfter)), 900);
    }, 900);
  }

  // 打架的烟尘团：一团翻滚的白烟，时不时伸出拳头、冒出星星
  function drawFight(f, t) {
    const cx = f.x, cy = f.y - 9;
    const cols = [f.a, f.b].map((e) => Object.values(CHARACTERS.find((c) => c.id === e.type).colors)[0]);
    for (let k = 0; k < 7; k++) {
      const a = t * 7 + k * 0.9;
      const bx = cx + Math.cos(a * 1.3 + k) * 6, by = cy + Math.sin(a * 1.7 + k) * 4;
      const rr = 4 + ((k + Math.floor(t * 10)) % 3);
      for (let dy = -rr; dy <= rr; dy++) {
        const w = Math.round(Math.sqrt(rr * rr - dy * dy));
        r(bx - w, by + dy, w * 2 + 1, 1, dy < -rr / 3 ? '#ffffff' : '#ddd8cc');
      }
    }
    const tick = Math.floor(t * 8);
    for (let k = 0; k < 3; k++) {
      const a = tick * 2.3 + k * 2.1;
      const px = cx + Math.cos(a) * 11, py = cy + Math.sin(a) * 7;
      if ((tick + k) % 3 === 0) g.drawImage(getSprite('fist'), Math.round(px), Math.round(py));
      else if ((tick + k) % 3 === 1) g.drawImage(getSprite('star'), Math.round(px), Math.round(py));
      else line(cx, cy, px, py, cols[k % 2], 2);
    }
  }

  // 头晕：三颗小星星绕着头转
  function drawDizzy(e, top, t) {
    for (let k = 0; k < 3; k++) {
      const a = t * 5 + (k * Math.PI * 2) / 3;
      g.drawImage(getSprite('star'), Math.round(e.x + Math.cos(a) * 6 - 1), Math.round(top - 3 + Math.sin(a) * 2));
    }
  }

  // ---------- 装修：挪家具、摆新家具 ----------
  // 户外设施最右能摆到哪（再往右是温泉）
  const outMax = () => W - 4;

  // 商城买的家具：w/h 画出来的大小，fw/fd 占地（脚底往左右 fw、往里 fd），x,y 是底边中点
  // draw 画不动的部分（会缓存并描边），anim 每帧画会动的部分，spots 是能去玩的位置
  const FURN = {
    plant: {
      where: 'any', w: 12, h: 17, fw: 4, fd: 3,
      draw(x, y) {
        r(x - 4, y - 6, 8, 6, '#b0603a');
        r(x - 4, y - 6, 8, 1, '#d07a50');
        r(x - 3, y - 1, 6, 1, '#8a4a2a');
        blob(x, y - 10, 5, 4, ['#2f8f3a', '#3fa848', '#5cc25a'], seeded(5));
        r(x - 1, y - 16, 2, 3, '#3fa848');
      },
    },
    monstera: {
      where: 'in', w: 18, h: 27, fw: 5, fd: 4,
      draw(x, y) {
        r(x, y - 22, 1, 14, '#2f7a30');
        r(x - 4, y - 16, 1, 8, '#2f7a30');
        r(x + 4, y - 18, 1, 10, '#2f7a30');
        for (const [dx, dy, rx] of [[-5, -16, 5], [5, -19, 5], [0, -24, 4], [-1, -12, 4]]) blob(x + dx, y + dy, rx, 3, ['#1f6f2a', '#2f8f3a', '#4aaa50'], seeded(7 + dx));
        r(x - 5, y - 8, 10, 8, '#e8e0d0');
        r(x - 5, y - 8, 10, 1, '#ffffff');
        r(x - 4, y - 1, 8, 1, '#b8b0a0');
      },
    },
    loveseat: {
      where: 'in', w: 34, h: 16, fw: 16, fd: 5, sortD: 7,
      draw(x, y) {
        const c = '#c25b6e', l = '#d87a8a', d = '#9a3a50';
        r(x - 13, y - 15, 26, 8, c);
        r(x - 12, y - 14, 24, 2, l);
        r(x, y - 14, 1, 6, d);
        r(x - 15, y - 8, 30, 5, d);
        r(x - 13, y - 8, 26, 2, c);
        for (const ax of [x - 16, x + 12]) {
          r(ax, y - 11, 4, 8, c);
          r(ax, y - 11, 4, 1, l);
        }
        r(x - 15, y - 3, 2, 3, '#2a1e16');
        r(x + 13, y - 3, 2, 3, '#2a1e16');
      },
      spots: (x, y) => [-6, 7].map((dx) => ({ kind: 'sit', ax: x + dx, ay: y + 3, dx: x + dx, dy: y - 6 })),
    },
    arcade: {
      where: 'in', w: 16, h: 29, fw: 7, fd: 4,
      draw(x, y) {
        r(x - 7, y - 28, 14, 28, '#3a3a8a');
        r(x - 7, y - 28, 14, 1, '#5a5aba');
        r(x - 6, y - 27, 12, 4, '#ff5d7a');
        r(x - 4, y - 26, 8, 2, '#ffd84a');
        r(x - 6, y - 22, 12, 10, '#26265a');
        r(x - 7, y - 12, 14, 3, '#2a2a6a');
        r(x - 4, y - 14, 1, 2, '#c0c0d0');
        r(x - 5, y - 15, 3, 1, '#ff3a4a');
        r(x + 1, y - 12, 1, 1, '#ffd84a');
        r(x + 3, y - 12, 1, 1, '#5bd36b');
        r(x - 7, y - 9, 14, 9, '#2e2e78');
        r(x - 1, y - 6, 2, 3, '#ffcf4a');
      },
      // 屏幕：有人玩时小飞机打方块，没人时闪"INSERT COIN"一样的点点
      anim(x, y, t, pf) {
        const sx = x - 5, sy = y - 21;
        r(sx, sy, 10, 8, '#0a0c1a');
        const busy = spots.some((sp) => sp.furn === pf.uid && sp.who);
        if (busy) {
          const k = Math.floor(t * 6);
          for (let i = 0; i < 4; i++) r(sx + 1 + ((i * 3 + k) % 8), sy + 1 + (i % 2), 1, 1, ['#ff5d7a', '#ffd84a', '#5bd36b', '#5d9dff'][i]);
          r(sx + 3 + Math.round(Math.sin(t * 3) * 3), sy + 6, 3, 1, '#7ef59a');
          r(sx + 4 + Math.round(Math.sin(t * 3) * 3), sy + 2 + (k % 4), 1, 1, '#ffffff');
        } else if (Math.floor(t * 2) % 2) {
          r(sx + 2, sy + 3, 6, 1, '#ffd84a');
        }
      },
      spots: (x, y) => [{ kind: 'arcade', face: -1, ax: x + 11, ay: y + 1, dx: x + 10, dy: y + 1 }],
    },
    xmastree: {
      where: 'any', w: 22, h: 36, fw: 7, fd: 4,
      draw(x, y) {
        r(x - 1, y - 4, 3, 4, '#6b4a2f');
        for (let i = 0; i < 4; i++) {
          const w = 16 - i * 4, top = y - 10 - i * 6;
          r(x - w / 2, top, w + 1, 7, i % 2 ? '#2f8f3a' : '#277a32');
          r(x - w / 2, top + 6, w + 1, 1, '#1f6a2a');
        }
        r(x - 9, y - 4, 5, 4, '#c23b55');
        r(x - 7, y - 4, 1, 4, '#ffd84a');
        r(x + 5, y - 3, 4, 3, '#4d6bfe');
        r(x + 6, y - 3, 1, 3, '#ffffff');
      },
      anim(x, y, t) {
        r(x - 1, y - 36, 3, 3, '#ffe14a');
        r(x, y - 37, 1, 5, '#ffe14a');
        const dots = [[-6, -6], [3, -8], [-3, -12], [5, -5], [-4, -17], [2, -19], [-1, -24], [2, -27], [-6, -9], [0, -14]];
        const cols = ['#ff5d5d', '#ffd84a', '#5d9dff', '#ff8fb1'];
        dots.forEach(([dx, dy], k) => r(x + dx, y + dy, 1, 1, Math.sin(t * 3 + k * 1.7) > -0.2 ? cols[k % 4] : '#1f5a2a'));
      },
    },
    telescope: {
      where: 'any', w: 16, h: 19, fw: 4, fd: 3,
      draw(x, y) {
        line(x, y - 9, x - 4, y, '#5a5a6a');
        line(x, y - 9, x + 4, y, '#5a5a6a');
        line(x, y - 9, x, y, '#4a4a5a');
        line(x - 5, y - 9, x + 5, y - 15, '#d0d6e0', 2);
        r(x + 5, y - 17, 2, 3, '#8a96a4');
        r(x - 6, y - 9, 2, 2, '#3a3a4a');
      },
      spots: (x, y) => [{ kind: 'stargaze', face: 1, ax: x - 9, ay: y + 1, dx: x - 8, dy: y + 1 }],
    },
    globe: {
      where: 'in', w: 12, h: 16, fw: 4, fd: 3,
      draw(x, y) {
        r(x - 3, y - 1, 7, 1, '#7d5838');
        r(x, y - 5, 1, 4, '#7d5838');
        for (let dy = -4; dy <= 4; dy++) {
          const w = Math.round(Math.sqrt(16.5 - dy * dy));
          r(x - w, y - 10 + dy, w * 2 + 1, 1, '#4a8ad8');
        }
        r(x - 2, y - 13, 3, 2, '#5bb04a');
        r(x + 1, y - 9, 3, 3, '#5bb04a');
        r(x - 3, y - 8, 2, 2, '#5bb04a');
        r(x - 1, y - 13, 1, 1, '#ffffff');
        line(x - 3, y - 15, x + 4, y - 5, '#d8b050');
      },
    },
    lamppost: {
      where: 'out', w: 9, h: 35, fw: 2, fd: 2,
      draw(x, y) {
        r(x, y - 30, 1, 30, '#3a3a4a');
        r(x - 1, y - 2, 3, 2, '#3a3a4a');
        r(x - 3, y - 34, 7, 4, '#2a2a34');
        r(x - 2, y - 35, 5, 1, '#2a2a34');
      },
      anim(x, y) {
        r(x - 2, y - 33, 5, 2, sky.dark > 0.3 ? '#fff2b0' : '#9a9a8a');
      },
    },
    flowerbed: {
      where: 'out', w: 26, h: 10, fw: 12, fd: 4,
      draw(x, y) {
        r(x - 12, y - 4, 24, 4, '#8a5e3c');
        r(x - 12, y - 4, 24, 1, '#a07450');
        r(x - 11, y - 5, 22, 1, '#5a3c20');
        const cols = { spring: ['#ff8fb1', '#ffe66d', '#ffffff'], summer: ['#ff5d5d', '#ff9d3a', '#ffd84a'], autumn: ['#e8822a', '#9b72cb', '#ffcf4a'], winter: null }[season];
        for (let k = 0; k < 7; k++) {
          const fx = x - 10 + k * 3, fy = y - 7 - (k % 2);
          if (!cols) {
            r(fx, y - 6, 2, 1, '#ffffff');
            continue;
          }
          r(fx, fy, 1, 2, '#3d8f2c');
          r(fx - (k % 2), fy - 2, 2, 2, cols[k % 3]);
        }
      },
    },
    hammock: {
      where: 'out', w: 38, h: 20, fw: 18, fd: 3, sortD: 12,
      draw(x, y) {
        for (const px of [x - 17, x + 16]) {
          r(px, y - 18, 2, 18, '#7a5236');
          r(px, y - 18, 2, 1, '#9a6e46');
        }
        for (let dx = -15; dx <= 15; dx++) {
          const sag = Math.round(5 * (1 - (dx / 16) ** 2));
          r(x + dx, y - 15 + sag, 1, 2, (dx + 15) % 6 < 3 ? '#e0c890' : '#d97757');
        }
        line(x - 16, y - 16, x - 15, y - 15, '#c8b08a');
        line(x + 15, y - 15, x + 16, y - 16, '#c8b08a');
      },
      spots: (x, y) => [{ kind: 'nap', ax: x, ay: y + 3, dx: x, dy: y - 11 }],
    },
  };

  // 乐器：放在家具里一起摆。吉他和小提琴演奏时拿在手上，架子鼓和电子琴坐/站在后面
  Object.assign(FURN, {
    guitar: {
      where: 'any', w: 14, h: 18, fw: 5, fd: 4,
      draw(x, y) {
        r(x - 4, y - 7, 9, 2, '#8a5e3c');
        r(x - 4, y - 7, 9, 1, '#a07450');
        r(x - 3, y - 5, 1, 5, '#6b4a2f');
        r(x + 3, y - 5, 1, 5, '#6b4a2f');
      },
      anim(x, y, t, pf) {
        if (spots.some((sp) => sp.furn === pf.uid && sp.who)) return;
        drawGuitar(x + 6, y - 2, -1, 0);
      },
      spots: (x, y) => [{ kind: 'guitar', ax: x, ay: y + 2, dx: x, dy: y - 5 }],
    },
    violin: {
      where: 'any', w: 12, h: 20, fw: 4, fd: 3,
      draw(x, y) {
        r(x, y - 15, 1, 15, '#3a3a4a');
        line(x, y - 1, x - 3, y, '#3a3a4a');
        line(x, y - 1, x + 3, y, '#3a3a4a');
        r(x - 5, y - 19, 11, 6, '#2a2a34');
        r(x - 4, y - 18, 9, 4, '#f4efe4');
        for (let k = 0; k < 3; k++) r(x - 3, y - 17 + k, 7, 1, k % 2 ? '#f4efe4' : '#9a96b0');
      },
      spots: (x, y) => [{ kind: 'violin', face: 1, ax: x - 9, ay: y + 1, dx: x - 8, dy: y + 1 }],
    },
    drums: {
      where: 'any', w: 26, h: 20, fw: 12, fd: 3,
      draw(x, y) {
        // 底鼓
        for (let dy = -5; dy <= 5; dy++) {
          const w = Math.round(Math.sqrt(30 - dy * dy));
          r(x - w, y - 6 + dy, w * 2 + 1, 1, '#e8e0d0');
        }
        r(x - 3, y - 9, 7, 6, '#c23b55');
        r(x - 2, y - 8, 5, 1, '#e05a72');
        // 两个嗵鼓、军鼓
        r(x - 11, y - 9, 7, 3, '#c23b55');
        r(x - 11, y - 9, 7, 1, '#f4efe4');
        r(x - 9, y - 6, 1, 6, '#8a8a96');
        r(x + 5, y - 13, 6, 3, '#c23b55');
        r(x + 5, y - 13, 6, 1, '#f4efe4');
        // 镲片
        r(x + 9, y - 18, 1, 18, '#8a8a96');
        r(x + 6, y - 19, 8, 1, '#e8c060');
        r(x - 12, y - 16, 1, 7, '#8a8a96');
        r(x - 15, y - 17, 7, 1, '#e8c060');
      },
      anim(x, y, t, pf) {
        // 有人打鼓时镲片一闪一闪
        if (!spots.some((sp) => sp.furn === pf.uid && sp.who)) return;
        const b = music.beat();
        if (b && b.phase < 0.25) r(x + 6, y - 20, 8, 1, '#fff4b0');
      },
      spots: (x, y) => [{ kind: 'drums', ax: x, ay: y + 3, dx: x, dy: y - 6 }],
    },
    synth: {
      where: 'any', w: 24, h: 14, fw: 11, fd: 3,
      draw(x, y) {
        line(x - 7, y, x + 7, y - 8, '#3a3a4a');
        line(x + 7, y, x - 7, y - 8, '#3a3a4a');
        r(x - 11, y - 11, 22, 4, '#2a2a34');
        r(x - 10, y - 10, 20, 2, '#ffffff');
        for (let k = 0; k < 20; k += 2) if (k % 7 !== 4) r(x - 10 + k + 1, y - 10, 1, 1, '#1a1a1a');
        r(x - 11, y - 12, 22, 1, '#4a4a5a');
        r(x - 9, y - 12, 2, 1, '#ff5d7a');
        r(x - 6, y - 12, 2, 1, '#7ef59a');
      },
      spots: (x, y) => [{ kind: 'synth', ax: x, ay: y + 3, dx: x, dy: y - 6 }],
    },
  });

  // 庭院里的新设施
  Object.assign(FURN, {
    // 滑梯：左边爬梯子，右边滑下来
    slide: {
      where: 'out', w: 32, h: 25, fw: 14, fd: 4,
      draw(x, y) {
        for (const lx of [x - 13, x - 9]) r(lx, y - 20, 1, 20, '#c23b55');
        for (let k = 0; k < 5; k++) r(x - 13, y - 3 - k * 4, 5, 1, '#e05a72');
        r(x - 14, y - 22, 9, 2, '#4d6bfe');
        r(x - 14, y - 22, 9, 1, '#7d95ff');
        r(x - 6, y - 20, 1, 20, '#8a8a96');
        r(x + 6, y - 8, 1, 8, '#8a8a96');
        for (let i = 0; i <= 18; i++) {
          const sy = Math.round(y - 20 + i * (18 / 18));
          r(x - 6 + i, sy, 1, 3, '#ffd21e');
          r(x - 6 + i, sy, 1, 1, '#fff1a0');
        }
      },
      spots: (x, y) => [{ kind: 'slide', ax: x - 15, ay: y + 2, dx: x - 11, dy: y + 1 }],
    },
    // 沙坑：有人在玩的时候会堆出一个小城堡
    sandbox: {
      where: 'out', w: 30, h: 10, fw: 13, fd: 4,
      draw(x, y) {
        r(x - 13, y - 5, 27, 5, '#a07450');
        r(x - 13, y - 5, 27, 1, '#c09060');
        r(x - 12, y - 4, 25, 3, '#f0d890');
        for (let k = 0; k < 6; k++) r(x - 10 + k * 4, y - 3 + (k % 2), 1, 1, '#d8c070');
        r(x + 8, y - 8, 3, 3, '#ff5d5d');
        r(x + 8, y - 9, 3, 1, '#ffffff');
        line(x - 10, y - 9, x - 8, y - 5, '#5d9dff');
      },
      anim(x, y, t, pf) {
        if (!spots.some((sp) => sp.furn === pf.uid && sp.who)) return;
        r(x - 3, y - 6, 6, 3, '#e8c870');
        r(x - 3, y - 8, 2, 2, '#e8c870');
        r(x + 1, y - 8, 2, 2, '#e8c870');
        r(x - 2, y - 11, 1, 3, '#7a5236');
        r(x - 1, y - 11, 2, 1, '#ff5d5d');
      },
      spots: (x, y) => [{ kind: 'sand', ax: x - 6, ay: y + 2, dx: x - 6, dy: y - 2, face: 1 }, { kind: 'sand', ax: x + 5, ay: y + 2, dx: x + 5, dy: y - 2, face: -1 }],
    },
    // 野餐垫：红白格子布 + 野餐篮，坐两个
    picnic: {
      where: 'out', w: 32, h: 12, fw: 15, fd: 3,
      draw(x, y) {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) r(x - 15 + i * 4, y - 4 + j * 2, 4, 2, (i + j) % 2 ? '#ff5d5d' : '#ffffff');
        r(x + 7, y - 8, 7, 4, '#b8863a');
        r(x + 7, y - 8, 7, 1, '#d8a85a');
        r(x + 8, y - 10, 1, 2, '#8a5e3c');
        r(x + 12, y - 10, 1, 2, '#8a5e3c');
        r(x + 8, y - 11, 5, 1, '#8a5e3c');
        r(x - 2, y - 6, 2, 2, '#e8402a');
        r(x - 7, y - 6, 4, 2, '#f4d0a0');
        r(x - 7, y - 5, 4, 1, '#7ac860');
      },
      spots: (x, y) => [{ kind: 'picnic', face: 1, ax: x - 10, ay: y + 2, dx: x - 10, dy: y - 1 }, { kind: 'picnic', face: -1, ax: x + 1, ay: y + 2, dx: x + 1, dy: y - 1 }],
    },
    // 遮阳伞 + 躺椅：躺着打个盹
    lounger: {
      where: 'out', w: 40, h: 30, fw: 15, fd: 4, sortD: 7,
      draw(x, y) {
        r(x - 6, y - 26, 1, 26, '#d8d4c8');
        for (let dx = -13; dx <= 13; dx++) {
          const top = y - 29 + Math.round(Math.abs(dx) * 0.3);
          r(x - 6 + dx, top, 1, 3, Math.floor((dx + 13) / 4) % 2 ? '#ff8a3a' : '#ffffff');
        }
        r(x - 3, y - 5, 15, 2, '#4dc0c8');
        r(x - 3, y - 5, 15, 1, '#8ae0e8');
        line(x + 11, y - 5, x + 13, y - 10, '#4dc0c8', 2);
        r(x - 2, y - 3, 1, 3, '#8a8a96');
        r(x + 10, y - 3, 1, 3, '#8a8a96');
      },
      spots: (x, y) => [{ kind: 'nap', ax: x + 4, ay: y + 2, dx: x + 4, dy: y - 5 }],
    },
    // 喷泉：水一直往上喷；旁边可以站着扔硬币许愿
    fountain: {
      where: 'out', w: 28, h: 22, fw: 12, fd: 5,
      draw(x, y) {
        for (let dy = -4; dy <= 4; dy++) {
          const w = Math.round(12 * Math.sqrt(1 - (dy / 4.6) ** 2));
          r(x - w, y - 5 + dy, w * 2 + 1, 1, dy < -2 ? '#b8b8c4' : '#9a9aa6');
        }
        for (let dy = -2; dy <= 2; dy++) {
          const w = Math.round(10 * Math.sqrt(1 - (dy / 3) ** 2));
          r(x - w, y - 5 + dy, w * 2 + 1, 1, dy < 0 ? '#9ad0f0' : '#7ac0e8');
        }
        r(x - 1, y - 15, 3, 10, '#b8b8c4');
        r(x - 4, y - 16, 9, 2, '#9a9aa6');
        r(x - 3, y - 16, 7, 1, '#7ac0e8');
      },
      anim(x, y, t) {
        r(x, y - 18 - (Math.floor(t * 8) % 2), 1, 2, '#e0f4ff');
        for (let k = 0; k < 6; k++) {
          const p = (t * 1.2 + k / 6) % 1, side = k % 2 ? 1 : -1;
          r(Math.round(x + side * p * 8), Math.round(y - 17 - 5 * p + 12 * p * p), 1, 1, '#bfe6ff');
        }
      },
      spots: (x, y) => [{ kind: 'wish', face: -1, ax: x + 16, ay: y + 1, dx: x + 15, dy: y + 1 }],
    },
    // 鸟屋：白天会有一只小蓝鸟停在门口，时不时飞出去转一圈
    birdhouse: {
      where: 'out', w: 12, h: 30, fw: 3, fd: 2,
      draw(x, y) {
        r(x, y - 18, 1, 18, '#7a5236');
        r(x - 4, y - 25, 9, 7, '#d97757');
        r(x - 4, y - 25, 9, 1, '#f0a58a');
        r(x - 5, y - 26, 11, 1, '#8a3b2e');
        r(x - 4, y - 27, 9, 1, '#8a3b2e');
        r(x - 2, y - 28, 5, 1, '#8a3b2e');
        r(x - 1, y - 23, 2, 2, '#2a1a10');
        r(x - 1, y - 20, 3, 1, '#5a3c28');
      },
      anim(x, y, t) {
        if (sky.dark > 0.5) return;
        const ph = (t * 0.12 + (x % 7) / 7) % 1;
        let bx = x + 1, by = y - 22;
        if (ph > 0.7) {
          const q = (ph - 0.7) / 0.3;
          bx = Math.round(x + 1 + Math.sin(q * Math.PI * 2) * 14);
          by = Math.round(y - 22 - Math.sin(q * Math.PI) * 10);
        }
        r(bx, by, 2, 2, '#5d9dff');
        r(bx + 1, by - 1, 1, 1, '#5d9dff');
        r(bx + 2, by, 1, 1, '#ffb030');
      },
    },
  });

  // 拿在手上的吉他：琴身 + 斜着的琴颈（d 是琴颈朝向）
  function drawGuitar(x, y, d, strum) {
    for (const [dx, dy, w] of [[-3, -3, 7], [-4, -2, 9], [-4, -1, 9], [-3, 0, 7], [-3, 1, 7]]) r(x + dx, y + dy, w, 1, '#d08a3a');
    r(x - 1, y - 2, 3, 2, '#5a3020');
    line(x + d * 3, y - 2, x + d * 9, y - 6, '#6b4a2f');
    r(x + d * 9 - (d < 0 ? 1 : 0), y - 7, 2, 2, '#3a2a20');
    if (strum) r(x - d * 2, y - 1 - strum, 1, 1, '#ffffff');
  }
  // 演奏中的角色手上的乐器
  function drawHeldInstrument(e, foot, h, t) {
    const d = flipOf(e) ? -1 : 1;
    const b = music.beat();
    const hit = b ? (b.phase < 0.3 ? 1 : 0) : Math.floor(t * 4 + e.phase) % 2;
    if (e.act.kind === 'guitar') drawGuitar(Math.round(e.x + d * 2), Math.round(foot - h * 0.3), d, hit);
    if (e.act.kind === 'violin') {
      const vx = Math.round(e.x + d * 4), vy = Math.round(foot - h * 0.72);
      r(vx - 2, vy - 1, 5, 3, '#a0502a');
      r(vx - 1, vy - 1, 3, 1, '#c87040');
      line(vx + d * 2, vy - 1, vx + d * 6, vy - 3, '#3a2218');
      const bx = Math.round(Math.sin(t * 6 + e.phase) * 3);
      line(vx - d * 4 + bx, vy - 4, vx + d * 3 + bx, vy + 2, '#e8dcc0');
    }
    if (e.act.kind === 'drums' && hit) {
      r(Math.round(e.x - 6), Math.round(foot + 1), 1, 2, '#e8dcc0');
      r(Math.round(e.x + 6), Math.round(foot - 1), 1, 2, '#e8dcc0');
    }
  }

  function placedFurniture() {
    const out = [];
    for (const pf of S.placed || []) {
      const d = FURN[pf.id];
      if (d) out.push({ ...pf, d, block: { x0: pf.x - d.fw, x1: pf.x + d.fw, y0: pf.y - d.fd, y1: pf.y + 1 } });
    }
    return out;
  }

  // 家具的静态部分画一次缓存起来，跟屋里其他家具一样描边
  const furnCache = new Map();
  function furnSprite(id) {
    const key = id + ':' + season;
    if (!furnCache.has(key)) {
      const d = FURN[id];
      const c = newCanvas(d.w + 6, d.h + 6);
      paint(c, () => d.draw(Math.floor((d.w + 6) / 2), d.h + 3));
      furnCache.set(key, outlined(c));
    }
    return furnCache.get(key);
  }
  function drawPlaced(pf, t) {
    const d = pf.d;
    g.drawImage(furnSprite(pf.id), Math.round(pf.x) - Math.floor((d.w + 6) / 2), Math.round(pf.y) - d.h - 3);
    d.anim?.(pf.x, pf.y, t, pf);
  }

  // ---------- 装修：能挪的东西 ----------
  // zone：in 屋里地上 / out 院子里 / wall 墙上。kind：floor 落地家具、yard 院子设施（都是 x + 往前挪的 dy）、wall 墙上的东西（x, y）
  const FLOOR_X = {
    armchair: () => ARMCHAIR_X, piano: () => PIANO_X, cabinet: () => CAB_X, desk: () => DESK_X, rug: () => RUG_X, cattree: () => CATTREE_X,
    sofa: () => L.sofa?.x, shelf: () => SHELF_X, fireplace: () => FIRE_X, beanbag: () => BEANBAG_X, lamp: () => FLOOR_LAMP_X,
    fridge: () => FRIDGE_X, counter: () => COUNTER_X, bed: () => BED_X, tv: () => TV_X, table: () => TABLE_X,
  };
  // 院子设施现在的位置：x 和相对默认位置往前（正）往后（负）挪了多少
  const YARD_POS = {
    swing: () => L.swing && { x: L.swing, dy: L.swingDY || 0 },
    tramp: () => L.tramp && { x: L.tramp, dy: L.trampDY || 0 },
    garden: () => L.garden && { x: L.garden.x, dy: L.garden.y - (GROUND + 10) },
    pond: () => L.pond && { x: L.pond.x, dy: L.pond.y - (GROUND + 17) },
    camp: () => L.camp && { x: L.camp.x, dy: L.camp.y - (GROUND + 15) },
    bench: () => L.bench && S.decor.bench && { x: L.bench.x, dy: L.bench.y - (floorBottom() - 1) },
    spring: () => L.spring && { x: L.spring.x, dy: L.spring.y - (GROUND + 15) },
  };
  // 每件落地家具最多能往前挪多少
  function dyLimit(k) {
    if (k === 'rug') return floorBottom() - GROUND - 21;
    if (k === 'tv') return floorBottom() - 1 - (floorTop() + 22);
    if (k === 'table') return floorBottom() - (L.table.top - (PD.table || 0) + 19);
    return floorBottom() - GROUND - 8;
  }

  function movables() {
    ensureLayers();
    const list = [];
    const box = (v) => ({ x0: v.x, x1: v.x + v.w, y0: v.y, y1: v.y + v.h });
    // 靠墙的落地家具：左右挪，也能往屋子中间挪
    for (const k of WALL_PIECES) {
      const b = pieceBox(k);
      if (!b || (k === 'sofa' && !L.sofa)) continue;
      list.push({ key: k, name: PIECES[k].name, zone: 'in', kind: 'floor', x: FLOOR_X[k](), dy: PD[k] || 0, vis: { x: b.x, y: b.y, w: b.w, h: b.h }, foot: { x0: b.x + 2, x1: b.x + b.w - 2, y0: gy(k) - 6, y1: gy(k) + 8 } });
    }
    if (!gone('tv')) list.push({ key: 'tv', name: '电视和游戏机', zone: 'in', kind: 'floor', x: TV_X, dy: PD.tv || 0,
      vis: { x: TV_X - 1, y: L.tv.y - 20, w: 30, h: L.tv.cushionY - L.tv.y + 22 }, foot: { x0: TV_X - 1, x1: TV_X + 29, y0: L.tv.y - 5, y1: L.tv.cushionY + 2 } });
    if (!gone('table')) list.push({ key: 'table', name: '长餐桌', zone: 'in', kind: 'floor', x: TABLE_X, dy: PD.table || 0,
      vis: { x: TABLE_X - 10, y: L.table.top - 14, w: TABLE_W + 20, h: L.table.frontY - L.table.top + 18 }, foot: { x0: TABLE_X - 8, x1: TABLE_X + TABLE_W + 8, y0: L.table.top - 1, y1: L.table.frontY + 3 } });
    // 地毯平铺在地上，不占地方，可以塞到家具底下
    if (!gone('rug')) list.push({ key: 'rug', name: '小地毯', zone: 'in', kind: 'floor', x: RUG_X, dy: PD.rug || 0, vis: { x: RUG_X, y: gy('rug') + 7, w: 90, h: 14 }, foot: null });
    // 墙上的东西
    const wall = (key, name, v, pos, extra = {}) => list.push({ key, name, zone: 'wall', kind: 'wall', x: pos.x, y: pos.y, vis: v, foot: extra.noFoot ? null : box(v), ...extra });
    wall('win', '窗户', { x: L.win.x - 5, y: L.win.y - 3, w: L.win.w + 10, h: L.win.h + 5 }, L.win);
    wall('win2', '卧室的窗', { x: L.win2.x - 1, y: L.win2.y - 1, w: L.win2.w + 2, h: L.win2.h + 2 }, L.win2);
    if (L.showClock) wall('clock', '挂钟', { x: L.clock.x - 6, y: L.clock.y - 6, w: 13, h: 13 }, L.clock);
    if (L.cork) wall('cork', '留言板', { x: L.cork.x, y: L.cork.y, w: L.cork.w, h: L.cork.h }, L.cork);
    wall('gallery', '相框墙', { x: GALLERY_X, y: L.galleryY - 3, w: GALLERY_COLS * 26 - 2, h: 2 * 27 + 1 }, { x: GALLERY_X, y: L.galleryY });
    if (!gone('counter')) wall('rack', '调料架', { x: L.rack.x, y: L.rack.y - 5, w: 32, h: 7 }, L.rack);
    // 吊灯挂在天花板上，只能左右挪，也不跟别的东西抢地方
    LAMPS.forEach((lx, i) => wall('lamp' + i, '吊灯', { x: lx - 4, y: CEIL + 2, w: 9, h: L.cord + 3 }, { x: lx, y: 0 }, { xOnly: true, noFoot: true }));
    // 院子里的设施
    const yard = (key, name, v, foot) => {
      const pos = YARD_POS[key]();
      if (pos) list.push({ key, name, zone: 'out', kind: 'yard', x: pos.x, dy: pos.dy, vis: v, foot });
    };
    if (L.swing) {
      const { x, d0, barY } = swingBase();
      yard('swing', '秋千', { x: x - 17, y: barY - 3, w: 35, h: d0 - barY + 6 }, { x0: x - 17, x1: x + 17, y0: d0 - 4, y1: d0 + 4 });
    }
    if (L.tramp) yard('tramp', '蹦床', { x: L.tramp - 15, y: trampY() - 5, w: 31, h: 10 }, { x0: L.tramp - 15, x1: L.tramp + 15, y0: trampY() - 4, y1: trampY() + 4 });
    if (L.bench) yard('bench', '长椅', { x: L.bench.x - 12, y: L.bench.y - 10, w: 25, h: 11 }, { x0: L.bench.x - 12, x1: L.bench.x + 12, y0: L.bench.y - 5, y1: L.bench.y + 1 });
    if (L.garden) {
      const sc = S.decor.scarecrow;
      yard('garden', '菜园', { x: L.garden.x - 36, y: L.garden.y - 26, w: sc ? 75 : 64, h: 31 }, { x0: L.garden.x - 36, x1: L.garden.x + (sc ? 38 : 27), y0: L.garden.y - 4, y1: L.garden.y + 5 });
    }
    if (L.pond) yard('pond', '池塘', { x: L.pond.x - 40, y: L.pond.y - 14, w: 81, h: 24 }, { x0: L.pond.x - 40, x1: L.pond.x + 40, y0: L.pond.y - 9, y1: L.pond.y + 9 });
    if (L.camp) yard('camp', '篝火', { x: L.camp.x - 21, y: L.camp.y - 16, w: 43, h: 22 }, { x0: L.camp.x - 21, x1: L.camp.x + 21, y0: L.camp.y - 7, y1: L.camp.y + 5 });
    if (L.spring) yard('spring', '温泉', { x: L.spring.x - 50, y: L.spring.y - 14, w: 100, h: 26 }, { x0: L.spring.x - 48, x1: L.spring.x + 48, y0: L.spring.y - 10, y1: L.spring.y + 12 });
    // 商城买来的家具
    for (const pf of placedFurniture()) {
      const d = pf.d;
      list.push({ key: 'p' + pf.uid, name: shopItem(pf.id)?.name || pf.id, zone: d.where === 'any' ? null : d.where, kind: 'placed', x: pf.x, y: pf.y,
        vis: { x: pf.x - d.w / 2, y: pf.y - d.h, w: d.w, h: d.h + 2 }, foot: pf.block, pf });
    }
    return list;
  }
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const DOOR_FOOT = () => ({ x0: HOUSE_R - 2, x1: OUT_L + 2, y0: 0, y1: H });
  // 这块地方能不能放：墙上的只跟墙上的比；地上的整个在屋里或整个在院子里，不压着别的家具
  function fits(foot, zone, skipKey) {
    if (zone === 'wall') {
      if (foot.x0 < 2 || foot.x1 > HOUSE_R - 1 || foot.y0 < CEIL + 3 || foot.y1 > GROUND - 1) return false;
      return !movables().some((m) => m.key !== skipKey && m.zone === 'wall' && m.foot && overlap(m.foot, foot));
    }
    const inside = foot.x0 >= 2 && foot.x1 <= HOUSE_R - 2;
    const outside = foot.x0 >= OUT_L - 2 && foot.x1 <= W - 2;
    if (zone === 'in' ? !inside : zone === 'out' ? !outside : !(inside || outside)) return false;
    if (foot.y1 > floorBottom() + 9 || foot.y0 < GROUND - 8) return false;
    if (overlap(DOOR_FOOT(), foot)) return false;
    return !movables().some((m) => m.key !== skipKey && m.zone !== 'wall' && m.foot && overlap(m.foot, foot));
  }
  const freeFoot = (d, x, y) => ({ x0: x - d.fw, x1: x + d.fw, y0: y - d.fd, y1: y + 1 });
  const shiftBox = (b, dx, dy) => b && { x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy };

  let decorOn = false;
  let decorDrag = null;               // { key, p0, x0, y0, bad }
  let decorHover = null;

  function decorPick(p) {
    const hits = movables().filter((m) => p.x >= m.vis.x && p.x < m.vis.x + m.vis.w && p.y >= m.vis.y && p.y < m.vis.y + m.vis.h);
    hits.sort((a, b) => a.vis.w * a.vis.h - b.vis.w * b.vis.h);
    return hits[0] || null;
  }
  function decorStart(ev) {
    const p = toLocal(ev);
    const m = decorPick(p);
    if (!m) return false;
    decorDrag = { key: m.key, p0: p, x0: m.x, y0: m.kind === 'wall' || m.kind === 'placed' ? m.y : m.dy, bad: false };
    // 搬家具的时候大家先起来让一让
    for (const e of entities) leaveSpot(e);
    return true;
  }
  // 拖动中：挪得过去就真的挪，挪不过去就停在原地并标红；没在拖时返回鼠标下东西的名字
  function decorMove(ev) {
    const p = toLocal(ev);
    if (!decorDrag) {
      const m = decorPick(p);
      decorHover = m?.key || null;
      return m?.name || null;
    }
    const m = movables().find((x) => x.key === decorDrag.key);
    if (!m) return null;
    const nx = Math.round(decorDrag.x0 + p.x - decorDrag.p0.x);
    let ny = Math.round(decorDrag.y0 + p.y - decorDrag.p0.y);
    const cur = m.kind === 'wall' || m.kind === 'placed' ? m.y : m.dy;
    if (m.xOnly) ny = cur;
    if (m.kind === 'floor') ny = Math.max(0, Math.min(dyLimit(m.key), ny));
    if (m.kind === 'yard' && m.key === 'bench') ny = Math.min(0, ny);
    if (m.kind === 'placed') ny = Math.max(floorTop() + 2, Math.min(floorBottom(), ny));
    if (nx === m.x && ny === cur) return m.name;
    const ddx = nx - m.x, ddy = ny - cur;
    let ok;
    if (m.kind === 'placed') ok = fits(freeFoot(m.pf.d, nx, ny), m.zone, m.key);
    else if (!m.foot) ok = m.vis.x + ddx >= 2 && m.vis.x + m.vis.w + ddx <= HOUSE_R - 2;
    else ok = fits(shiftBox(m.foot, ddx, ddy), m.zone, m.key);
    decorDrag.bad = !ok;
    if (!ok) return m.name;
    if (m.kind === 'placed') {
      const sp = S.placed.find((q) => q.uid === m.pf.uid);
      sp.x = nx;
      sp.y = ny;
    } else if (m.kind === 'wall') {
      S.layout[m.key] = m.xOnly ? { x: nx } : { x: nx, y: ny };
    } else {
      S.layout[m.key] = { x: nx, dy: ny };
    }
    resize();
    return m.name;
  }
  function decorEnd() {
    decorDrag = null;
  }
  // 装修模式里右键：把鼠标下面的东西收进仓库；返回提示文字
  const STORE_NAMES = {
    armchair: '扶手椅', piano: '钢琴', rug: '小地毯', cattree: '猫爬架', sofa: '长沙发', shelf: '书架', fireplace: '壁炉', beanbag: '懒人沙发',
    lamp: '落地灯', fridge: '冰箱', counter: '橱柜和鱼缸', bed: '床', swing: '秋千', tramp: '蹦床', garden: '菜园', pond: '池塘',
    camp: '篝火', spring: '温泉', bench: '长椅', tv: '电视和游戏机', table: '长餐桌',
  };
  function decorStoreAt(ev) {
    const m = decorPick(toLocal(ev));
    if (!m) return null;
    if (m.pf) {
      storeFurn(m.pf.uid);
      return `「${m.name}」收进仓库了`;
    }
    if (m.kind === 'wall') return `${m.name}是墙上的，只能挪位置`;
    if (KEEP.includes(m.key) || !STORE_NAMES[m.key]) return `${m.name}不能收起来（好多玩法离不开它）`;
    S.stored[m.key] = true;
    for (const e of entities) leaveSpot(e);
    resize();
    return `「${m.name}」收进仓库了`;
  }
  function unstoreBuiltin(k) {
    delete S.stored[k];
    resize();
  }

  // 新家具找个空地方摆：屋里优先，别挡住别人要去的位子
  function placeNew(id) {
    const d = FURN[id];
    if (!d) return false;
    const sides = d.where === 'any' ? ['in', 'out'] : [d.where];
    for (const side of sides) {
      const cands = [];
      const x0 = side === 'in' ? 8 : OUT_L + 4, x1 = side === 'in' ? HOUSE_R - 14 : outMax() - 4;
      for (let x = x0 + d.fw; x <= x1 - d.fw; x += 4) for (let y = floorBottom(); y >= floorTop() + 2; y -= 3) cands.push({ x, y });
      cands.sort(() => Math.random() - 0.5);
      for (const c of cands) {
        const foot = freeFoot(d, c.x, c.y);
        const wide = { x0: foot.x0 - 4, x1: foot.x1 + 4, y0: foot.y0 - 3, y1: foot.y1 + 3 };
        if (!fits(foot, side, null) || spots.some((sp) => inBox({ x: sp.ax, y: sp.ay }, wide)) || entities.some((e) => inBox(e, wide))) continue;
        const uid = Math.max(0, ...S.placed.map((q) => q.uid)) + 1;
        S.placed.push({ id, uid, x: c.x, y: c.y });
        resize();
        return true;
      }
    }
    return false;
  }
  // 收进仓库
  function storeFurn(uid) {
    const i = S.placed.findIndex((q) => q.uid === uid);
    if (i < 0) return;
    const [pf] = S.placed.splice(i, 1);
    S.store[pf.id] = (S.store[pf.id] || 0) + 1;
    for (const e of entities) if (e.act?.furn === uid) leaveSpot(e);
    resize();
  }
  // 恢复默认摆放：原有家具回原位，自己摆的如果被压住了就换个地方（实在没地方就收进仓库）
  function resetLayout() {
    S.layout = {};
    resize();
    for (const pf of [...S.placed]) {
      const d = FURN[pf.id];
      if (!d || fits(freeFoot(d, pf.x, pf.y), null, 'p' + pf.uid)) continue;
      S.placed.splice(S.placed.indexOf(pf), 1);
      if (!placeNew(pf.id)) S.store[pf.id] = (S.store[pf.id] || 0) + 1;
    }
    resize();
  }

  // 装修模式：每件能挪的家具套一个虚线框，鼠标下的亮黄，挪不过去时变红
  function drawDecorOverlay(t) {
    if (!decorOn) return;
    g.fillStyle = 'rgba(20, 16, 40, 0.18)';
    g.fillRect(0, 0, W, H);
    for (const m of movables()) {
      const active = decorDrag?.key === m.key;
      const col = active ? (decorDrag.bad ? '#ff5d5d' : '#ffcf4a') : decorHover === m.key ? '#ffe680' : 'rgba(255,255,255,0.6)';
      const { x, y, w, h } = m.vis;
      const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
      const off = Math.floor(t * 8);
      for (let px = x0; px < x1; px++) {
        if (((px + off) >> 1) % 2) continue;
        r(px, y0, 1, 1, col);
        r(px, y1, 1, 1, col);
      }
      for (let py = y0; py <= y1; py++) {
        if (((py + off) >> 1) % 2) continue;
        r(x0, py, 1, 1, col);
        r(x1, py, 1, 1, col);
      }
      if (active || decorHover === m.key) {
        g.fillStyle = active && decorDrag.bad ? 'rgba(255,93,93,0.18)' : 'rgba(255,207,74,0.15)';
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
  }

  // ---------- 走路绕开家具 ----------
  // 地上不能穿过去的东西（左上角 x0,y0 到右下角 x1,y1，y 是脚底的深度）
  function obstacles() {
    const list = [
      ...(gone('table') ? [] : [{ x0: TABLE_X - 6, x1: TABLE_X + TABLE_W + 6, y0: L.table.top - 2, y1: L.table.frontY + 1 }]),
      ...(gone('tv') ? [] : [{ x0: TV_X - 1, x1: TV_X + 29, y0: L.tv.y - 5, y1: L.tv.y + 1 }]),
      ...(gone('cattree') ? [] : [{ x0: CATTREE_X - 2, x1: CATTREE_X + 26, y0: L.catBase - 3, y1: L.catBase + 1 }]),
    ];
    if (L.pond) list.push({ x0: L.pond.x - 33, x1: L.pond.x + 33, y0: L.pond.y - 8, y1: L.pond.y + 8 });
    if (L.garden) list.push({ x0: L.garden.x - 27, x1: L.garden.x + 27, y0: L.garden.y - 3, y1: L.garden.y + 4 });
    if (L.tramp) list.push({ x0: L.tramp - 15, x1: L.tramp + 15, y0: trampY() - 3, y1: trampY() + 3 });
    if (L.spring) list.push({ x0: L.spring.x - 44, x1: L.spring.x + 44, y0: L.spring.y - 9, y1: L.spring.y + 9 });
    // 往屋子中间挪过的靠墙家具也挡路
    for (const k of WALL_PIECES) if (PD[k] > 2 && pieceBox(k)) {
      const b = pieceBox(k);
      list.push({ x0: b.x, x1: b.x + b.w, y0: gy(k) - 3, y1: gy(k) + 3 });
    }
    if (L.camp) list.push({ x0: L.camp.x - 7, x1: L.camp.x + 7, y0: L.camp.y - 3, y1: L.camp.y + 2 });
    for (const f of placedFurniture()) if (f.block) list.push(f.block);
    return list;
  }
  const inBox = (p, o) => p.x > o.x0 && p.x < o.x1 && p.y > o.y0 && p.y < o.y1;
  function segHits(a, b, o) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
    for (let i = 1; i < n; i++) if (inBox({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, o)) return true;
    return false;
  }
  // 在 3×2 像素的格子上用 A* 找路，再把能直接走到的拐点拉直。家具多了也不会穿过去
  const CELL_W = 3, CELL_H = 2;
  let gridCache = { key: '', blocked: null, cols: 0, rows: 0 };
  function navGrid(obs) {
    const key = W + ':' + H + ':' + obs.map((o) => `${o.x0},${o.x1},${o.y0},${o.y1}`).join(';');
    if (gridCache.key === key) return gridCache;
    const cols = Math.ceil(W / CELL_W), rows = Math.floor((floorBottom() - floorTop()) / CELL_H) + 1;
    const blocked = new Uint8Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const p = { x: cx * CELL_W + CELL_W / 2, y: floorTop() + cy * CELL_H };
        if (obs.some((o) => inBox(p, o))) blocked[cy * cols + cx] = 1;
      }
    }
    gridCache = { key, blocked, cols, rows };
    return gridCache;
  }
  function planPath(e) {
    e.pathKey = e.tx + ',' + e.ty;
    const clampY = (y) => Math.max(floorTop(), Math.min(floorBottom(), y));
    const obs = obstacles();
    const tgt = { x: e.tx, y: e.ty };
    // 目标点落在家具里面：挪到家具前面
    for (const o of obs) if (inBox(tgt, o) && !e.goal) tgt.y = clampY(o.y1 + 2);
    e.path = [];
    let start = { x: e.x, y: e.y };
    // 起点在家具里（比如刚被扔进来、家具刚摆过来）：先从最近的前后边走出来，再接着找路
    for (const o of obs) {
      if (!inBox(start, o)) continue;
      start = { x: start.x, y: start.y - o.y0 < o.y1 - start.y ? clampY(o.y0 - 2) : clampY(o.y1 + 2) };
      e.path.push(start);
    }
    const live = obs.filter((o) => !inBox(start, o) && !inBox(tgt, o));
    const clear = (a, b) => !live.some((o) => segHits(a, b, o));
    if (clear(start, tgt)) {
      e.path.push(tgt);
    } else {
      const { blocked, cols, rows } = navGrid(obs);
      const cell = (p) => [Math.max(0, Math.min(cols - 1, Math.floor(p.x / CELL_W))), Math.max(0, Math.min(rows - 1, Math.round((p.y - floorTop()) / CELL_H)))];
      const [sx, sy] = cell(start), [gx, gy] = cell(tgt);
      const idx = (x, y) => y * cols + x;
      const free = (x, y) => !blocked[idx(x, y)] || (x === gx && y === gy) || (Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2);
      // A*：横着走一格 3 像素，竖着一格 2 像素
      const cost = new Float32Array(cols * rows).fill(Infinity);
      const from = new Int32Array(cols * rows).fill(-1);
      const open = [[0, sx, sy]];
      cost[idx(sx, sy)] = 0;
      const h = (x, y) => Math.hypot((x - gx) * CELL_W, (y - gy) * CELL_H);
      let found = false;
      for (let n = 0; open.length && n < 20000; n++) {
        let bi = 0;
        for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
        const [, x, y] = open[bi];
        open[bi] = open[open.length - 1];
        open.pop();
        if (x === gx && y === gy) {
          found = true;
          break;
        }
        const c0 = cost[idx(x, y)];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !free(nx, ny)) continue;
          const c = c0 + Math.hypot(dx * CELL_W, dy * CELL_H);
          if (c >= cost[idx(nx, ny)]) continue;
          cost[idx(nx, ny)] = c;
          from[idx(nx, ny)] = idx(x, y);
          open.push([c + h(nx, ny), nx, ny]);
        }
      }
      if (found) {
        const pts = [];
        for (let k = idx(gx, gy); k !== idx(sx, sy) && k >= 0; k = from[k]) pts.unshift({ x: (k % cols) * CELL_W + CELL_W / 2, y: floorTop() + Math.floor(k / cols) * CELL_H });
        pts[pts.length - 1] = tgt;
        // 拉直：从当前点出发，能直接走到的最远拐点就直接走过去
        let cur = start;
        for (let k = 0; k < pts.length;) {
          let far = k;
          for (let j = pts.length - 1; j > k; j--) {
            if (clear(cur, pts[j])) {
              far = j;
              break;
            }
          }
          cur = pts[far];
          e.path.push(cur);
          k = far + 1;
        }
      }
      if (!e.path.length) e.path.push(tgt);
    }
    e.tx = tgt.x;
    e.ty = tgt.y;
    e.pathKey = e.tx + ',' + e.ty;
  }

  // 小跳一下换位置（上下椅子、爬猫爬架、跳进温泉……），代替直接瞬移
  function startHop(e, tx, ty) {
    const dist = Math.hypot(tx - e.x, ty - e.y);
    if (dist < 1.5) {
      e.x = tx;
      e.y = ty;
      return;
    }
    e.hop = { fx: e.x, fy: e.y, tx, ty, t: 0, dur: Math.max(0.22, Math.min(0.5, dist / 70)), h: Math.min(12, 4 + dist * 0.25) };
  }
  function updateHop(e, dt) {
    const h = e.hop;
    h.t += dt;
    const k = Math.min(1, h.t / h.dur);
    e.x = h.fx + (h.tx - h.fx) * k;
    e.y = h.fy + (h.ty - h.fy) * k;
    e.hopLift = Math.sin(k * Math.PI) * h.h;
    if (k >= 1) {
      e.hop = null;
      e.hopLift = 0;
      e.sqv = (e.sqv || 0) + 2.5;
    }
  }

  // 每种活动做多久（秒）、记哪项统计、加多少好感
  const ACTIVITY = {
    sit: { min: 8, max: 22 },
    type: { min: 8, max: 22 },
    sleep: { min: 25, max: 60, stat: 'sleeps', aff: 1 },
    eat: { min: 15, max: 30, stat: 'meals', aff: 2 },
    bath: { min: 20, max: 40, stat: 'baths', aff: 3 },
    swing: { min: 10, max: 20, stat: 'swings', aff: 2 },
    bounce: { min: 8, max: 15, stat: 'bounces', aff: 2 },
    garden: { min: 12, max: 25, aff: 2 },
    fish: { min: 18, max: 35, aff: 2 },
    camp: { min: 15, max: 30, stat: 'camps', aff: 2 },
    piano: { min: 10, max: 20, stat: 'pianos', aff: 2 },
    game: { min: 12, max: 24, stat: 'games', aff: 2 },
    aquarium: { min: 8, max: 16, aff: 1 },
    perch: { min: 10, max: 22, stat: 'perches', aff: 1 },
    arcade: { min: 10, max: 20, stat: 'games', aff: 2 },
    slide: { min: 10, max: 20, aff: 2 },
    sand: { min: 12, max: 25, aff: 2 },
    picnic: { min: 15, max: 30, aff: 2 },
    wish: { min: 4, max: 8, aff: 1 },
    guitar: { min: 15, max: 30, stat: 'pianos', aff: 2 },
    violin: { min: 15, max: 30, stat: 'pianos', aff: 2 },
    drums: { min: 15, max: 30, stat: 'pianos', aff: 2 },
    synth: { min: 15, max: 30, stat: 'pianos', aff: 2 },
    stargaze: { min: 12, max: 25, aff: 2 },
    nap: { min: 20, max: 40, stat: 'sleeps', aff: 2 },
  };

  function startActivity(e, s, quiet = false) {
    s.reserved = null;
    if (s.who) {
      e.goal = null;
      return;
    }
    s.who = e;
    e.goal = null;
    e.act = s;
    startHop(e, s.dx, s.dy);
    e.out = s.out || false;
    const a = ACTIVITY[s.kind];
    e.actTimer = a.min + Math.random() * (a.max - a.min);
    if (a.stat) bumpStat(e, a.stat);
    if (a.aff) addAff(e, a.aff);
    e.zzz = 1 + Math.random() * 2;
    e.swingT = 0;
    e.bph = 0;
    e.fishT = 4 + Math.random() * 8;
    e.gardenT = 1;
    e.state = 'idle';
    if (s.kind === 'type') e.dir = 1;
    if (s.face) e.dir = s.face;
    if (!quiet) talk.activity(e, s.kind);
    if (s.kind === 'wish') {
      for (let k = 0; k < 6; k++) particles.push({ x: e.x - 8 + Math.random() * 4, y: e.y - 10 - k, life: 0.7, decay: 1.4, rise: -6 + k * 2, size: 1, color: k ? '#bfe6ff' : '#ffcf4a' });
    }
  }

  function updateActivity(e, dt) {
    e.actTimer -= dt;
    const kind = e.act.kind;
    if (kind === 'slide') {
      const sx = e.act.dx + 11, top = 20;
      e.slideT = ((e.slideT || 0) + dt / 4) % 1;
      const k = e.slideT;
      if (k < 0.35) {
        e.x = sx - 11;
        e.lift = (k / 0.35) * top;
      } else if (k < 0.45) {
        e.x = sx - 11 + ((k - 0.35) / 0.1) * 4;
        e.lift = top;
      } else if (k < 0.7) {
        const q = (k - 0.45) / 0.25;
        e.x = sx - 7 + q * 20;
        e.lift = top * (1 - q) + 1;
        e.dir = 1;
        if (Math.random() < dt * 8) particles.push({ x: e.x - 3, y: e.y - e.lift, life: 0.4, decay: 2, rise: 2, size: 1, color: '#ffffff' });
      } else {
        const q = (k - 0.7) / 0.3;
        e.x = sx + 13 - q * 24;
        e.lift = 0;
        e.dir = -1;
      }
    }
    if (kind === 'sand' && Math.random() < dt * 1.5) {
      particles.push({ x: e.x + e.dir * 4, y: e.y - 2, life: 0.5, decay: 1.6, rise: 6, size: 1, color: '#e8c870' });
    }
    // 荡秋千：坐板沿着圆弧来回摆，越荡越高
    if (kind === 'swing') {
      e.swingT += dt;
      const amp = Math.min(0.6, 0.15 + e.swingT * 0.12);
      e.swingA = Math.sin(e.swingT * 2.6) * amp;
      const seat = swingSeat(e.swingA);
      e.x = seat.x;
      e.y = seat.y + 1;
    }
    // 蹦床：一下一下往上弹，落到垫子上压扁一下
    if (kind === 'bounce') {
      const prev = Math.sin(e.bph);
      e.bph += dt * 3.4;
      e.lift = Math.abs(Math.sin(e.bph)) * 24;
      if (Math.sign(Math.sin(e.bph)) !== Math.sign(prev)) {
        e.sqv = (e.sqv || 0) + 5;
        dust(e, 2);
      }
    }
    // 菜园：先收成熟的，再给没浇水的地浇水
    if (kind === 'garden' && (e.gardenT -= dt) <= 0) {
      e.gardenT = 2.5;
      const plots = S.garden.plots;
      const ripe = plots.findIndex((p) => p.stage >= 3);
      const dry = plots.findIndex((p) => !p.wet && p.stage < 3);
      if (ripe >= 0) {
        e.dir = plotX(ripe) >= e.x ? 1 : -1;
        harvest(ripe, e);
      } else if (dry >= 0) {
        plots[dry].wet = true;
        e.dir = plotX(dry) >= e.x ? 1 : -1;
        for (let k = 0; k < 6; k++) particles.push({ x: plotX(dry) + (Math.random() - 0.5) * 8, y: L.garden.y - 8, life: 0.6, decay: 1.4, rise: -14, size: 1, color: '#8ac8f0' });
      }
    }
    // 钓鱼：等一阵，浮标一沉就钓上来一条
    if (kind === 'fish' && (e.fishT -= dt) <= 0) {
      e.fishT = 6 + Math.random() * 9;
      const bx = e.x + e.act.face * 20;
      particles.push({ x: bx, y: L.pond.y - 4, life: 1.2, rise: 14, sprite: 'fish' });
      for (let k = 0; k < 6; k++) particles.push({ x: bx + (Math.random() - 0.5) * 6, y: L.pond.y - 1, life: 0.5, decay: 1.6, rise: 8, size: 1, color: season === 'winter' ? '#ffffff' : '#9ad0f0' });
      onReward('fish', e, { cssX: bx * SCALE, cssY: (L.pond.y - 8) * SCALE });
    }
    // 弹钢琴冒音符；看鱼时偶尔顺手喂一下
    if (INSTR.includes(kind) && !ensemble && Math.random() < dt * 1.6) musicNotes(e.x, e.y - 14, 1);
    if (kind === 'aquarium' && Math.random() < dt * 0.08) feedFish();
    // 吃饭掉点渣，泡澡冒点热气
    if (kind === 'eat' && Math.random() < dt * 0.8) {
      particles.push({ x: e.x + (Math.random() - 0.5) * 6, y: L.table.top + (e.act.front ? 6 : 2), life: 0.5, decay: 1.5, rise: -4, size: 1, color: pick(['#f4d0a0', '#ffffff', '#e8822a']) });
    }
    if (kind === 'bath' && Math.random() < dt * 1.2) {
      particles.push({ x: e.x + (Math.random() - 0.5) * 10, y: e.y - 10, life: 1, decay: 0.9, rise: 8, size: 1, color: 'rgba(255,255,255,0.7)' });
    }
    // 天亮了就起床
    if (e.act.kind === 'sleep' && sky.dark < 0.3) e.actTimer = Math.min(e.actTimer, 3);
    const sleepy = e.act.kind === 'sleep' || e.act.kind === 'nap' || (e.act.kind === 'sit' && sky.dark > 0.6);
    if (sleepy && (e.zzz -= dt) <= 0) {
      e.zzz = 1.2 + Math.random();
      particles.push({ x: e.x + 5, y: e.y - getSprite(e.type).height, life: 1.6, rise: 6, sprite: 'zzz' });
    }
    if (e.actTimer <= 0 && e.hold <= 0) {
      // 两个人一起打游戏的，打完一个欢呼一个不服
      if (kind === 'game') {
        const rival = spots.find((s) => s.kind === 'game' && s.who && s.who !== e)?.who;
        if (rival) talk.gameOver(e, rival);
      }
      leaveSpot(e);
      e.state = 'idle';
      e.timer = 0.5 + Math.random() * 2;
    }
  }

  // ---------- 菜园 / 钓鱼 / 篝火 ----------
  const GROW_SEC = 150;               // 浇过水后每 2 分半长一个阶段（冬天慢一倍）
  const CROP = {
    spring: { fruit: '#ff3a5a', leaf: '#3fa848' },  // 草莓
    summer: { fruit: '#ff5d3a', leaf: '#3d8f2c' },  // 番茄
    autumn: { fruit: '#ff8a2a', leaf: '#5aa53c' },  // 胡萝卜
    winter: { fruit: '#d8f0c8', leaf: '#8ac87a' },  // 白菜
  };
  const campLit = () => sky.dark > 0.25 && !raining();

  function growGarden(dt) {
    for (const p of S.garden.plots) {
      if (!p.wet || p.stage >= 3) continue;
      p.grow += dt;
      if (p.grow >= GROW_SEC * (season === 'winter' ? 2 : 1)) {
        p.stage++;
        p.grow = 0;
        p.wet = false;
      }
    }
  }

  // 收获一块成熟的地；by 是收菜的角色（主人自己点的时候为空）
  function harvest(i, by) {
    const p = S.garden.plots[i];
    if (!p || p.stage < 3) return;
    p.stage = 0;
    p.grow = 0;
    p.wet = false;
    const x = plotX(i), y = L.garden.y - 4;
    for (let k = 0; k < 8; k++) particles.push({ x: x + (Math.random() - 0.5) * 8, y, life: 0.9, rise: 12, size: 1, color: pick([CROP[season].fruit, '#ffcf4a', '#ffffff']) });
    onReward('harvest', by, { cssX: x * SCALE, cssY: y * SCALE });
  }

  function drawCrops(t) {
    const { y: gy } = L.garden;
    const crop = CROP[season];
    S.garden.plots.forEach((p, i) => {
      const px = plotX(i);
      r(px - 5, gy - 2, 11, 5, p.wet ? '#5a3e28' : '#7a5a3a');
      if (p.wet) r(px - 4, gy - 1, 2, 1, '#7a9ab8');
      if (p.stage === 0) r(px, gy - 1, 1, 1, '#4a3020');
      if (p.stage >= 1) {
        r(px, gy - 3, 1, 2, crop.leaf);
        r(px - 1, gy - 4, 1, 1, crop.leaf);
        r(px + 1, gy - 4, 1, 1, crop.leaf);
      }
      if (p.stage >= 2) {
        r(px - 3, gy - 6, 7, 3, crop.leaf);
        r(px - 2, gy - 7, 5, 1, lighten(crop.leaf, 0.2));
      }
      if (p.stage >= 3) {
        if (season === 'winter') {
          r(px - 3, gy - 7, 7, 5, crop.fruit);
          r(px - 2, gy - 8, 5, 1, '#ffffff');
        } else if (season === 'autumn') {
          r(px - 1, gy - 2, 3, 2, crop.fruit);
        } else {
          for (const [fx, fy] of [[-3, -4], [2, -5], [0, -3]]) r(px + fx, gy + fy, 2, 2, crop.fruit);
        }
        if (Math.sin(t * 3 + i) > 0.95) r(px + 3, gy - 9, 1, 1, '#ffffff');
      }
    });
  }

  // 钓鱼：鱼竿、鱼线、浮标；快上钩时浮标往下沉
  function drawFishing(t) {
    for (const s of spots) {
      if (s.kind !== 'fish' || !s.who) continue;
      const e = s.who, f = s.face;
      const tipX = e.x + f * 12, tipY = e.y - 17;
      line(e.x + f * 3, e.y - 7, tipX, tipY, '#6b4a2f');
      const bx = e.x + f * 20, dip = e.fishT < 0.8 ? 1 + Math.round(Math.sin(t * 20)) : 0;
      const by = L.pond.y - 1 + dip + (Math.sin(t * 2 + e.x) > 0.7 ? 1 : 0);
      line(tipX, tipY, bx, by, 'rgba(240,240,240,0.7)');
      if (season === 'winter') r(bx - 2, by, 5, 2, '#1a3a5a');
      r(bx, by - 1, 1, 1, '#ffffff');
      r(bx, by, 1, 1, '#ff3a3a');
    }
  }

  function drawCampFlames(t) {
    const { x: cx, y: cy } = L.camp;
    r(cx - 3, cy - 2, 7, 2, '#5a3a20');
    if (!campLit()) return;
    for (let i = 0; i < 4; i++) {
      const fx = cx - 3 + i * 2;
      const h = 3 + Math.round(2 * Math.sin(t * 10 + i * 1.9) + Math.sin(t * 15 + i));
      r(fx, cy - 2 - h, 2, h, '#e8502a');
      r(fx, cy - 2 - Math.round(h * 0.6), 1, Math.round(h * 0.6), '#ffb030');
    }
    if (Math.random() < 0.15) particles.push({ x: cx + (Math.random() - 0.5) * 4, y: cy - 6, life: 0.7, decay: 1.4, rise: 12, size: 1, color: '#ffb030' });
  }

  // 动态的户外部分：秋千绳和坐板、温泉热气、菜园作物、鱼竿
  function drawOutdoorDynamic(t) {
    if (L.garden) drawCrops(t);
    if (L.pond) drawFishing(t);
    if (L.swing) {
      // 座板在地上的影子：往前荡影子往下走，往后荡往上走
      const s = swingSeat(swingAngle(t));
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(Math.round(L.swing - 6), Math.round(s.shadowY) + 1, 13, 2);
    }
    if (L.spring) {
      const n = season === 'winter' || sky.dark > 0.6 ? 0.5 : 0.25;
      if (Math.random() < n) {
        particles.push({ x: L.spring.x + (Math.random() - 0.5) * 60, y: L.spring.y - 1, life: 1.4, decay: 0.8, rise: 7, size: 1, color: 'rgba(255,255,255,0.55)' });
      }
    }
  }

  // 电视屏幕：有人打游戏时是两个小人对战；主人开着电视时是彩色节目；关着就是黑屏
  function drawTVScreen(t) {
    const s = tvScreen();
    const players = spots.filter((sp) => sp.kind === 'game' && sp.who);
    if (players.length) {
      r(s.x, s.y, s.w, s.h, '#1a2a4a');
      r(s.x, s.y + s.h - 2, s.w, 2, '#3fa848');
      const ax = s.x + 3 + Math.round((Math.sin(t * 3) + 1) * 3), bx = s.x + s.w - 5 - Math.round((Math.cos(t * 2.6) + 1) * 3);
      const hop = (k) => (Math.sin(t * 8 + k) > 0.6 ? 2 : 0);
      r(ax, s.y + s.h - 5 - hop(0), 2, 3, '#ff5d5d');
      r(bx, s.y + s.h - 5 - hop(2), 2, 3, '#5d9dff');
      if (Math.sin(t * 5) > 0) r(Math.round((ax + bx) / 2), s.y + 3, 1, 1, '#ffd84a');
      r(s.x + 2, s.y + 1, 3 + Math.floor((t * 2) % 4), 1, '#ff5d5d');
      r(s.x + s.w - 6, s.y + 1, 3 + Math.floor((t * 1.7) % 4), 1, '#5d9dff');
    } else if (S.home.tv) {
      const cols = ['#ff5d7a', '#ffd84a', '#5bd36b', '#5d9dff', '#b28dff'];
      const ch = Math.floor(t / 4) % 3;
      for (let i = 0; i < 5; i++) r(s.x + i * 4, s.y, 4, s.h, cols[(i + ch) % 5]);
      r(s.x + 3, s.y + 3 + Math.round(Math.sin(t * 2) * 2), 6, 4, '#ffffff');
    } else {
      r(s.x, s.y, s.w, s.h, '#14141c');
      line(s.x + 2, s.y + s.h - 2, s.x + 6, s.y + 2, 'rgba(255,255,255,0.12)');
    }
  }

  // 鱼缸里的三条小鱼；喂食时游到水面抢吃的
  let feedUntil = 0;
  function drawFish(t) {
    const tk = tankRect();
    const feeding = performance.now() < feedUntil;
    const cols = ['#ff8a2a', '#ffd84a', '#ff5d7a'];
    for (let i = 0; i < 3; i++) {
      const span = tk.w - 6;
      const p = (Math.sin(t * (0.6 + i * 0.25) + i * 2) + 1) / 2;
      const fx = tk.x + 2 + Math.round(p * span);
      const fy = feeding ? tk.y + 3 : tk.y + 3 + ((i * 2 + Math.round(Math.sin(t + i) + 1)) % (tk.h - 5));
      const dir = Math.cos(t * (0.6 + i * 0.25) + i * 2) > 0 ? 1 : -1;
      r(fx, fy, 2, 1, cols[i]);
      r(fx - dir, fy, 1, 1, darken(cols[i], 0.3));
    }
    if (Math.random() < 0.03) particles.push({ x: tk.x + 3 + Math.random() * (tk.w - 6), y: tk.y + tk.h - 3, life: 0.8, decay: 1.2, rise: 6, size: 1, color: 'rgba(220,240,255,0.8)' });
  }
  function feedFish() {
    feedUntil = performance.now() + 5000;
    const tk = tankRect();
    for (let k = 0; k < 8; k++) particles.push({ x: tk.x + 3 + Math.random() * (tk.w - 6), y: tk.y - 2, life: 1, decay: 0.9, rise: -3, size: 1, color: pick(['#c8a060', '#a07840']) });
  }

  // 主人点钢琴：用五声音阶随机弹一小段（很轻）
  function playMelody() {
    music.melody();
    musicNotes(PIANO_X + 10, gy('piano') - 16, 6);
  }
  function musicNotes(x, y, n) {
    for (let k = 0; k < n; k++) {
      particles.push({ x: x + (Math.random() - 0.5) * 14, y: y - Math.random() * 4, life: 1.3, decay: 0.8, rise: 12 + Math.random() * 6, sprite: 'note' });
    }
  }

  // 桌上热菜冒热气、烛台的火苗一闪一闪（画在桌子那层之后）
  function drawTableSteam(t) {
    const menu = MENU[season];
    for (let i = 0; i < 6; i++) {
      for (const [row, py] of plateRows()) {
        if (!STEAMY.includes(menu[(i * 2 + row) % 4])) continue;
        const p = (t * 0.5 + i * 0.37 + row * 0.5) % 1;
        r(SEAT_X0 + i * SEAT_GAP + Math.round(Math.sin(t * 3 + i + row)), py - 6 - Math.round(p * 6), 1, 1, `rgba(255,255,255,${0.55 * (1 - p)})`);
      }
    }
    const cy = L.table.top + Math.floor(L.table.depth / 2);
    for (const x of CANDLES()) {
      for (const [fx, fy] of [[-3, -12], [3, -12], [0, -13]]) {
        const flick = Math.sin(t * 13 + x + fx) > 0;
        r(x + fx, cy + fy, 1, 1, flick ? '#ffb030' : '#ff8a20');
        if (flick) r(x + fx, cy + fy - 1, 1, 1, '#fff0a0');
      }
    }
  }

  // 想不想出门：白天爱出去，天黑就回家，冬天懒得动
  function outChance() {
    if (raining()) return 0.02;
    let p = sky.dark > 0.7 ? 0.06 : sky.dark > 0.3 ? 0.3 : 0.55;
    if (season === 'winter') p *= 0.6;
    if (wx.kind === 'fog') p *= 0.7;
    return p;
  }

  // 松手后的抛物线：重力下落、撞墙反弹、落地一路弹跳
  const GRAVITY = 260;
  function updateFall(e, dt) {
    const f = e.fall;
    f.vy += GRAVITY * dt;
    e.x += f.vx * dt;
    e.y += f.vy * dt;
    f.vx *= 0.998;
    if (e.x < 6 || e.x > W - 6) {
      e.x = Math.max(6, Math.min(W - 6, e.x));
      e.sqv = (e.sqv || 0) + Math.min(4, Math.abs(f.vx) / 120);
      f.vx = -f.vx * 0.6;
      dust(e, 3);
    }
    if (e.y < f.landY) return;
    e.y = f.landY;
    if (f.vy > 45) {
      // 撞地：压扁一下再弹起来，越弹越低
      e.sqv = (e.sqv || 0) + Math.min(11, f.vy / 22);
      dust(e, Math.min(8, Math.round(f.vy / 30)));
      f.vy = -f.vy * 0.55;
      f.vx *= 0.8;
      f.bounces = (f.bounces || 0) + 1;
      if (f.vy < -60) f.bounced = true;
      return;
    }
    const fallH = f.landY - f.fromY;
    // 摔疼了：记一次摔倒，好感 -2（打架被弹开的不算）
    if (!f.ko && (f.bounced || fallH > 30)) {
      bumpStat(e, 'falls');
      addAff(e, -2);
    }
    e.fall = null;
    e.state = 'idle';
    e.timer = 1 + Math.random() * 2;
    // 掉进池塘：扑通一声溅起水花，自己爬到岸边（冬天结冰就是摔在冰面上）
    const splash = inPond(e.x, e.y) && season !== 'winter';
    if (splash) {
      for (let k = 0; k < 14; k++) particles.push({ x: e.x + (Math.random() - 0.5) * 12, y: e.y - 2, life: 0.7, decay: 1.3, rise: 10 + Math.random() * 10, size: 1, color: pick(['#9ad0f0', '#ffffff', '#5a9ad8']) });
      startHop(e, e.x, Math.min(floorBottom(), L.pond.y + POND_RY + 4));
      e.sqv = (e.sqv || 0) + 4;
      addAff(e, -1);
    }
    // 落在家具里面（比如打架被弹到餐桌那儿）：跳到家具前面或后面站好
    const inside = !splash && obstacles().find((o) => inBox(e, o));
    const standY = inside ? (inside.y1 + 2 <= floorBottom() ? inside.y1 + 2 : Math.max(floorTop(), inside.y0 - 2)) : e.y;
    if (inside) startHop(e, e.x, standY);
    e.tx = e.x;
    e.ty = standY;
    e.out = e.x > DOOR_X - 2;
    if (!f.ko) talk.landed(e, { fallH, bounced: f.bounced, partner: splash ? null : partnerOf(e), out: e.out, splash });
  }

  // 落地扬起的小灰尘
  function dust(e, n) {
    const out = e.x > DOOR_X;
    const col = out ? (season === 'winter' ? '#ffffff' : '#d8c8a0') : '#a08a70';
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      particles.push({ x: e.x + side * (3 + Math.random() * 5), y: e.y - 1, life: 0.5, decay: 1.6, rise: 3 + Math.random() * 5, size: 1, color: col });
    }
  }

  // 果冻弹簧：sq > 0 是压扁，< 0 是拉长，会来回抖几下再停住
  function updateSquash(e, dt) {
    if (!e.sq && !e.sqv) return;
    e.sqv = (e.sqv || 0) + (-220 * (e.sq || 0) - 7 * e.sqv) * dt;
    e.sq = Math.max(-0.35, Math.min(0.45, (e.sq || 0) + e.sqv * dt));
    if (Math.abs(e.sq) < 0.004 && Math.abs(e.sqv) < 0.05) e.sq = e.sqv = 0;
  }

  // 落地时身边最近的另一个角色
  function partnerOf(e) {
    let best = null, bestD = 22;
    for (const o of entities) {
      if (o === e || o.held || o.fall || o.drop > 0) continue;
      const d = Math.hypot(o.x - e.x, (o.y - e.y) * 1.5);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  function updateEntity(e, dt) {
    updateSquash(e, dt);
    if (e.drop > 0) {
      e.drop = Math.max(0, e.drop - dt * 100);
      if (e.drop === 0) e.sqv = (e.sqv || 0) + 4;
      return;
    }
    if (e.held || e.fighting) return;
    if (e.fall) {
      updateFall(e, dt);
      return;
    }
    if (e.hop) {
      updateHop(e, dt);
      return;
    }
    if (e.chasing) {
      chaseBug(e, dt);
      return;
    }
    e.jump = Math.max(0, e.jump - dt);
    // 模型 4 级以上身上会冒小星星，级别越高越频繁
    const lv = level(e.type);
    if (lv >= 4 && (e.spark = (e.spark ?? 1) - dt) <= 0) {
      e.spark = (0.5 + Math.random() * 1.5) * (4 / lv);
      const s = getSprite(e.type);
      particles.push({
        x: e.x - s.width / 2 + Math.random() * s.width, y: e.y - Math.random() * s.height,
        life: 0.7, decay: 1.4, rise: 4, size: 1, color: pick(['#ffffff', '#fff1a0', '#ffcf4a']),
      });
    }
    if (e.act) {
      if (e.hold > 0) e.hold -= dt;
      updateActivity(e, dt);
      return;
    }
    // 说话的时候站着不动；被叫去聊天的还没走到就先边走边聊
    if (e.hold > 0) {
      e.hold -= dt;
      if (!(e.joining && e.state === 'walk')) {
        e.state = 'idle';
        return;
      }
    }
    if (e.state === 'walk') {
      // 目标变了就重新规划路线：遇到餐桌、电视、猫爬架、池塘这些就绕着走
      if (e.pathKey !== e.tx + ',' + e.ty) planPath(e);
      const wp = e.path[0];
      const dx = wp.x - e.x, dy = wp.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1 && e.path.length > 1) {
        e.path.shift();
      } else if (dist < 1) {
        e.state = 'idle';
        e.timer = 1 + Math.random() * 4;
        e.joining = false;
        // 只有真的走到了位子跟前才坐上去；半路被打断改了目的地的，原来的位子就不要了
        if (e.goal && Math.hypot(e.x - e.goal.ax, e.y - e.goal.ay) < 8) startActivity(e, e.goal);
        else e.goal = null;
      } else {
        // 被叫去聊天的小跑过去
        const step = Math.min(dist, e.speed * (e.joining ? 1.8 : 1) * dt);
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
        if (Math.abs(dx) > 0.5) e.dir = dx > 0 ? 1 : -1;
      }
    } else if ((e.timer -= dt) <= 0) {
      const wantOut = Math.random() < outChance();
      const s = chooseSpot(e, wantOut);
      if (s) {
        s.reserved = e;
        e.goal = s;
        e.tx = s.ax;
        e.ty = s.ay;
      } else {
        e.goal = null;
        e.tx = wantOut === e.out ? clampX(e.x + (Math.random() - 0.5) * 90, e.out) : randX(wantOut);
        e.ty = randY();
      }
      e.state = 'walk';
    }
    const out = e.x > DOOR_X - 2;
    if (out !== e.out) {
      e.out = out;
      talk.stepped(e, out);
    }
    if ((e.emit -= dt) <= 0) {
      e.emit = 2 + Math.random() * 4;
      particles.push({ x: e.x, y: e.y - getSprite(e.type).height - 2, life: 1, color: '#ffcf4a', size: 2 });
    }
  }

  // ---------- 天气 ----------
  // 每个季节各种天气出现的概率；雨停之后有机会出彩虹
  const WEATHER_ODDS = {
    spring: { clear: 0.4, cloudy: 0.25, rain: 0.25, fog: 0.1 },
    summer: { clear: 0.45, cloudy: 0.15, rain: 0.15, storm: 0.2, fog: 0.05 },
    autumn: { clear: 0.4, cloudy: 0.25, rain: 0.2, fog: 0.15 },
    winter: { clear: 0.3, cloudy: 0.25, snow: 0.35, fog: 0.1 },
  };
  // 天气让天空变灰、变暗多少
  const WEATHER_SKY = { cloudy: [0.35, 0.05], rain: [0.55, 0.18], storm: [0.7, 0.32], snow: [0.4, 0.08], fog: [0.45, 0.06] };
  let wx = { kind: 'clear', until: 0 };
  let baseDark = 0;                   // 只按钟点算的夜色（不含阴天下雨的变暗）
  let flash = 0, nextBolt = 0;
  const raining = () => wx.kind === 'rain' || wx.kind === 'storm';

  function rollWeather(now) {
    const prev = wx.kind;
    const mode = S.env.weather || 'random';
    let kind;
    if (mode !== 'random') kind = mode;
    else if ((prev === 'rain' || prev === 'storm') && Math.random() < 0.4) kind = 'rainbow';
    else {
      const odds = WEATHER_ODDS[season];
      let roll = Math.random();
      kind = 'clear';
      for (const [k, p] of Object.entries(odds)) {
        if ((roll -= p) < 0) {
          kind = k;
          break;
        }
      }
    }
    // 一种天气持续 6~15 分钟；加速模式下按比例缩短；彩虹只挂 2 分钟
    const fast = S.env.time === 'fast' ? 1 / 6 : 1;
    const mins = kind === 'rainbow' ? 2 : 6 + Math.random() * 9;
    wx = { kind, until: now + mins * 60000 * fast };
    if (kind !== prev) onWeatherChange(kind);
  }

  function onWeatherChange(kind) {
    weather = weather.filter((p) => p.kind !== 'rain');
    if (kind === 'rain' || kind === 'storm') {
      // 下雨了：外面的都往家跑，菜园自动浇了水
      for (const e of entities) {
        if (e.out && !e.act && !e.held && !e.fall) {
          e.tx = randX(false);
          e.ty = randY();
          e.state = 'walk';
          e.goal = null;
        }
      }
      if (L.garden) for (const p of S.garden.plots) if (p.stage < 3) p.wet = true;
    }
    if (EVENT_LINES['wx_' + kind]) talk.event('wx_' + kind);
  }

  function weatherSky() {
    const k = WEATHER_SKY[wx.kind];
    if (!k) return;
    const gray = [118, 124, 138];
    sky = { top: mixRgb(sky.top, gray, k[0]), bottom: mixRgb(sky.bottom, gray, k[0]), dark: Math.min(1, sky.dark + k[1]) };
  }

  // ---------- 天气粒子 ----------
  function newWeather() {
    const x = OUT_L - 20 + Math.random() * (W - OUT_L + 20);
    if (raining()) return { kind: 'rain', x, y: -4, vx: -14, vy: 120 + Math.random() * 40 };
    if (wx.kind === 'snow') return { kind: 'snow', x, y: -2, vx: (Math.random() - 0.3) * 3, vy: 7 + Math.random() * 7, big: Math.random() < 0.25 };
    if (season === 'summer') {
      return { kind: 'fly', x, y: GROUND - 24 + Math.random() * 34, vx: 0, vy: 0, life: 4 + Math.random() * 5, ph: Math.random() * 6 };
    }
    return { kind: 'leaf', x, y: -2, vx: 3 + Math.random() * 4, vy: 6 + Math.random() * 5, c: pick(FALL_COLORS[season]), ph: Math.random() * 6 };
  }

  function updateWeather(dt) {
    const outW = W - OUT_L;
    let want;
    if (raining()) want = outW / (wx.kind === 'storm' ? 1.5 : 2.5);
    else if (wx.kind === 'snow') want = outW / 4;
    else if (season === 'winter') want = 0;
    else if (season === 'summer') want = sky.dark > 0.5 ? outW / 25 : 0;
    else want = wx.kind === 'fog' ? 0 : outW / 20;
    const spawnN = raining() ? 6 : 1;
    for (let i = 0; i < spawnN; i++) if (weather.length < want && Math.random() < 0.6) weather.push(newWeather());
    // 雨点落进池塘溅起小水圈
    if (raining() && L.pond && Math.random() < 0.3) {
      particles.push({ x: L.pond.x + (Math.random() - 0.5) * 50, y: L.pond.y + (Math.random() - 0.5) * 10, life: 0.4, decay: 2, rise: 0, size: 1, color: '#c8e8ff' });
    }
    weather = weather.filter((p) => {
      if (p.kind === 'rain') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.land = p.land ?? floorTop() + Math.random() * (floorBottom() - floorTop());
        // 斜着飘的雨点飘过门口就消失，别落进屋里
        return p.y < p.land && p.x > DOOR_X + 1;
      }
      if (p.kind === 'fly') {
        p.ph += dt;
        p.vx += (Math.random() - 0.5) * 20 * dt;
        p.vy += (Math.random() - 0.5) * 20 * dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        return (p.life -= dt) > 0 && p.x > OUT_L;
      }
      p.ph = (p.ph || 0) + dt;
      p.x += (p.vx + (p.kind === 'leaf' ? Math.sin(p.ph * 3) * 4 : 0)) * dt;
      p.y += p.vy * dt;
      p.land = p.land ?? floorTop() + Math.random() * (floorBottom() - floorTop());
      return p.y < p.land && p.x < W + 2 && p.x > DOOR_X;
    });
  }

  function update(dt, now) {
    const next = env.season();
    // 换季时清掉上一季的花瓣/落叶/雪
    if (next !== season) weather = [];
    season = next;
    pal = PAL[season];
    sky = skyAt(env.hours());
    baseDark = sky.dark;
    // 天气：到点换一种；锁定了天气就跟着设置走
    const mode = S.env.weather || 'random';
    if (now > wx.until || (mode !== 'random' && wx.kind !== mode)) rollWeather(now);
    weatherSky();
    // 雷雨：隔一阵闪一下电
    flash = Math.max(0, flash - dt * 3);
    if (wx.kind === 'storm' && now > nextBolt) {
      nextBolt = now + 6000 + Math.random() * 9000;
      flash = 1;
      if (Math.random() < 0.4) talk.event('thunder');
    }
    chipBump = Math.max(0, chipBump - dt * 6);
    if (L.garden) growGarden(dt);
    updateBand(dt, now);
    // 唱片机开着：一直往外冒音符
    if (S.decor.record && S.home.music && Math.random() < dt * 1.3) {
      const rc = recordRect();
      musicNotes(rc.x + 4, rc.y, 1);
    }
    // 到饭点有人喊开饭
    const meal = isMealTime();
    if (meal && !wasMeal && !gone('table')) talk.event('meal');
    wasMeal = meal;
    // 清理没人用的预订：预订的人已经改主意了（比如下雨跑回家）、或者坐着的人已经离开，位子就让出来
    for (const s of spots) {
      if (s.reserved && (s.reserved.goal !== s || !entities.includes(s.reserved))) s.reserved = null;
      if (s.who && (s.who.act !== s || !entities.includes(s.who))) s.who = null;
    }
    for (const e of entities) updateEntity(e, dt);
    updateSocial(dt, now);
    // 提着不放，过一阵就挣扎抗议
    if (held && (held.heldTime += dt) > held.nextGripe) {
      held.nextGripe = held.heldTime + 3.5 + Math.random() * 2;
      talk.struggle(held);
    }
    particles = particles.filter((p) => (p.life -= dt * (p.decay || 1)) > 0);
    for (const p of particles) p.y -= dt * (p.rise ?? 12);
    for (const c of clouds) {
      c.x += c.speed * dt;
      if (c.x > W + 4) c.x = -c.sprite.width - 4;
    }
    updateWeather(dt);

    if (!bug && now > nextBugAt) {
      spawnBug(now);
      onBug();
    }
    if (bug) updateBug(dt, now);
  }

  // Bug 出场：院子里从天上挂着小叶子伞飘下来、或者从土里钻出来；屋里从天花板吊着丝垂下来、或者从地板缝里钻出来
  function spawnBug(now) {
    const out = L.garden ? Math.random() < 0.55 : false;
    const x = randX(out), y = randY();
    const how = out ? pick(['sky', 'ground']) : pick(['thread', 'ground']);
    const dir = Math.random() < 0.5 ? 1 : -1;
    bug = { x, y, ty: y, dir, vy: 0, wob: 0, turn: 4, born: now, nagged: false, chaser: null, inside: true, enter: { how, t: 0 } };
    if (how === 'sky') bug.y = -6;
    if (how === 'thread') bug.y = CEIL + 2;
  }
  const BUG_ENTER = { sky: 3, ground: 1.4, thread: 2 };
  // 出场动画：到了地面才开始爬
  function updateBugEnter(dt) {
    const en = bug.enter;
    en.t += dt;
    const k = Math.min(1, en.t / BUG_ENTER[en.how]);
    if (en.how === 'sky') {
      bug.y = -6 + (bug.ty + 6) * k;
      bug.x += Math.sin(en.t * 3) * 6 * dt;
    } else if (en.how === 'thread') {
      bug.y = CEIL + 2 + (bug.ty - CEIL - 2) * (1 - (1 - k) * (1 - k));
    } else if (Math.random() < dt * 14) {
      particles.push({ x: bug.x + (Math.random() - 0.5) * 6, y: bug.ty - 1, life: 0.5, decay: 1.6, rise: 6 + Math.random() * 6, size: 1, color: bug.x > DOOR_X ? '#7a5a3a' : '#5a3c28' });
    }
    if (k >= 1) {
      bug.y = bug.ty;
      bug.enter = null;
      for (let i = 0; i < 5; i++) particles.push({ x: bug.x + (Math.random() - 0.5) * 8, y: bug.y - 1, life: 0.4, decay: 1.8, rise: 4, size: 1, color: 'rgba(255,255,255,0.7)' });
    }
  }
  // 出场时多画的东西：小伞、吊丝、土堆
  function drawBugEnter() {
    const en = bug.enter;
    if (!en) return;
    const bx = Math.round(bug.x), by = Math.round(bug.y);
    if (en.how === 'sky') {
      // 一片叶子当降落伞
      line(bx - 4, by - 7, bx, by - 3, '#e8e0d0');
      line(bx + 4, by - 7, bx, by - 3, '#e8e0d0');
      r(bx - 5, by - 10, 11, 2, '#5cc25a');
      r(bx - 3, by - 11, 7, 1, '#7ad87a');
      r(bx, by - 10, 1, 2, '#3a8a3a');
    } else if (en.how === 'thread') {
      r(bx, CEIL, 1, by - CEIL - 4, 'rgba(255,255,255,0.75)');
    } else {
      // 土堆越鼓越大，Bug 从里面一点点钻出来
      const k = Math.min(1, en.t / BUG_ENTER.ground);
      const w = 3 + Math.round(k * 4);
      const dirt = bug.x > DOOR_X ? '#8a6a44' : '#6a4a30';
      r(bx - w, by - 1, w * 2 + 1, 2, dirt);
      r(bx - w + 2, by - 2, w * 2 - 3, 1, dirt);
    }
  }

  // Bug 在地上乱爬，不会自己离开；太久没人管，就有角色去抓
  const BUG_NAG_MS = 150000;
  const BUG_HELP_MS = 180000;
  function updateBug(dt, now) {
    bug.wob += dt;
    if (bug.enter) return updateBugEnter(dt);
    if ((bug.turn -= dt) <= 0) {
      bug.turn = 2 + Math.random() * 4;
      if (Math.random() < 0.4) bug.dir = -bug.dir;
      bug.vy = (Math.random() - 0.5) * 10;
    }
    bug.x += bug.dir * 14 * dt;
    bug.y += bug.vy * dt;
    // 刚爬进来时允许在画面外，进来之后就在边界来回折返
    if (bug.x > 8 && bug.x < W - 8) bug.inside = true;
    if (bug.inside && (bug.x < 8 || bug.x > W - 8)) {
      bug.x = Math.max(8, Math.min(W - 8, bug.x));
      bug.dir = -bug.dir;
    }
    if (bug.y < floorTop() || bug.y > floorBottom()) {
      bug.y = Math.max(floorTop(), Math.min(floorBottom(), bug.y));
      bug.vy = -bug.vy;
    }
    const age = now - bug.born;
    if (age > BUG_NAG_MS && !bug.nagged) {
      bug.nagged = true;
      talk.event('bugNag');
    }
    // 追的那只被拎走了、或者还没人追：找最近的空闲角色
    if (bug.chaser && (!entities.includes(bug.chaser) || !bug.chaser.chasing)) bug.chaser = null;
    if (age > BUG_HELP_MS && !bug.chaser && !bug.enter) {
      const cands = entities.filter((e) => !e.held && !e.fall && e.drop === 0);
      cands.sort((a, b) => Math.hypot(a.x - bug.x, a.y - bug.y) - Math.hypot(b.x - bug.x, b.y - bug.y));
      const e = cands[0];
      if (e) {
        leaveSpot(e);
        e.chasing = true;
        e.hold = 0;
        e.joining = false;
        bug.chaser = e;
        talk.say(e.type, pick(EVENT_LINES.bugChase));
      }
    }
  }

  // 追 Bug：跑得比平时快，追上了就扑住
  function chaseBug(e, dt) {
    if (!bug) {
      e.chasing = false;
      return;
    }
    const dx = bug.x - e.x, dy = bug.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 5) {
      const caught = { x: bug.x, y: bug.y };
      bug = null;
      scheduleBug();
      e.chasing = false;
      e.state = 'idle';
      e.timer = 2;
      e.tx = e.x;
      e.ty = e.y;
      e.jump = 0.4;
      e.sqv = (e.sqv || 0) + 5;
      dust(e, 6);
      for (let i = 0; i < 10; i++) {
        particles.push({ x: caught.x + (Math.random() - 0.5) * 10, y: caught.y - Math.random() * 8, life: 0.8, rise: 10, size: 1, color: pick(['#5bd36b', '#c8ffcf', '#ffcf4a']) });
      }
      onBugCaught(e);
      return;
    }
    const step = Math.min(dist, Math.max(22, e.speed * 2.2) * dt);
    e.x += (dx / dist) * step;
    e.y += (dy / dist) * step;
    if (Math.abs(dx) > 0.5) e.dir = dx > 0 ? 1 : -1;
    e.out = e.x > DOOR_X - 2;
  }

  function scheduleBug() {
    const [lo, hi] = has('bug_0') ? [50, 120] : [90, 220];
    nextBugAt = performance.now() + (lo + Math.random() * (hi - lo)) * 1000;
  }

  // ---------- 每帧绘制 ----------
  // sx / sy 是压扁拉长的比例，脚底始终贴着 footY
  function drawSprite(spr, cx, footY, flip, sx = 1, sy = 1) {
    const w = Math.max(1, Math.round(spr.width * sx)), h = Math.max(1, Math.round(spr.height * sy));
    const x = Math.round(cx - w / 2), y = Math.round(footY - h);
    if (flip) {
      g.save();
      g.scale(-1, 1);
      g.drawImage(spr, -x - w, y, w, h);
      g.restore();
    } else {
      g.drawImage(spr, x, y, w, h);
    }
  }

  // 朝左走时镜像；标志左右不对称的角色（比如 Gemini）不翻
  const NO_FLIP = new Set(CHARACTERS.filter((c) => c.noFlip).map((c) => c.id));
  const flipOf = (e) => e.dir < 0 && !NO_FLIP.has(e.type);

  // 果冻形变 + 下落时被拉长
  function squashScale(e) {
    const sq = e.sq || 0;
    const stretch = e.fall ? Math.min(0.22, Math.abs(e.fall.vy) / 1100) : 0;
    return [1 + sq * 0.8 - stretch * 0.5, 1 - sq + stretch];
  }

  // 像素风的分段渐变
  function drawSky() {
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      const y0 = Math.floor((GROUND * i) / bands), y1 = Math.floor((GROUND * (i + 1)) / bands);
      r(0, y0, W, y1 - y0, rgb(mixRgb(sky.top, sky.bottom, i / (bands - 1))));
    }
  }

  // 太阳/月亮沿弧线走过户外的天空
  function arcPos(p) {
    return {
      x: OUT_L + 16 + p * (W - OUT_L - 32),
      y: GROUND - 10 - Math.sin(p * Math.PI) * (GROUND * 0.75),
    };
  }

  // 坐在扶手椅里时，把两边扶手再画一遍挡在身前，看起来像陷进椅子里
  function drawArmchairArms() {
    const G_ = gy('armchair');
    for (const ax of [ARMCHAIR_X, ARMCHAIR_X + 21]) {
      r(ax - 1, G_ - 14, 7, 10, OUTLINE);
      r(ax, G_ - 13, 5, 8, '#c9963a');
      r(ax, G_ - 13, 5, 1, '#e0b45a');
    }
  }

  const typist = () => spots.find((s) => s.kind === 'type')?.who;

  // 书桌显示器：有人打字时滚代码，没人时画最近的 Token 余额走势
  function drawMonitor(t) {
    const { mx, my, mw, mh } = L.desk;
    const x0 = mx + 2, y0 = my + 2, w = mw - 4, h = mh - 4;
    if (typist()) {
      const colors = ['#9ee6a8', '#ffcf4a', '#9fc8ff', '#ff9db8', '#ffffff'];
      const scroll = Math.floor(t * 3);
      for (let row = 0; row < Math.floor(h / 2); row++) {
        const n = scroll + row;
        const indent = (n * 7) % 3 * 2;
        const len = 4 + ((n * 13) % (w - 8));
        r(x0 + 1 + indent, y0 + 1 + row * 2, Math.min(len, w - 2 - indent), 1, colors[n % colors.length]);
      }
      if (Math.floor(t * 4) % 2) r(x0 + 2, y0 + h - 2, 2, 1, '#ffffff');
      return;
    }
    for (let x = x0 + 1; x < x0 + w; x += 4) for (let y = y0 + 1; y < y0 + h; y += 3) r(x, y, 1, 1, '#18301f');
    const pts = tokenHistory.slice(-w);
    if (pts.length > 1) {
      const lo = Math.min(...pts), hi = Math.max(...pts);
      const span = hi - lo || 1;
      let prev = null;
      pts.forEach((v, i) => {
        const x = x0 + w - pts.length + i;
        const y = y0 + h - 2 - Math.round(((v - lo) / span) * (h - 4));
        if (prev !== null) {
          const [a, b] = prev < y ? [prev, y] : [y, prev];
          r(x, a, 1, b - a + 1, '#5bd36b');
        } else {
          r(x, y, 1, 1, '#5bd36b');
        }
        prev = y;
      });
      r(x0 + w - 1, prev, 1, 1, '#ffcf4a');
    }
    if (Math.floor(t * 2) % 2) r(x0 + 1, y0 + 1, 2, 1, '#9ee6a8');
  }

  // 壁炉里跳动的火苗
  function drawFire(t) {
    const f = fireRect();
    r(f.x + 3, f.y + f.h - 3, f.w - 6, 2, '#5a3a20');
    r(f.x + 5, f.y + f.h - 4, 6, 1, '#7a5030');
    r(f.x + 13, f.y + f.h - 4, 6, 1, '#7a5030');
    if (!fireLit()) return;
    for (let i = 0; i < 6; i++) {
      const fx = f.x + 4 + i * 3;
      const hgt = 5 + Math.round(3 * Math.sin(t * 9 + i * 1.7) + 2 * Math.sin(t * 13 + i));
      r(fx, f.y + f.h - 3 - hgt, 3, hgt, '#e8502a');
      r(fx + 1, f.y + f.h - 3 - Math.round(hgt * 0.7), 1, Math.round(hgt * 0.7), '#ffb030');
      r(fx + 1, f.y + f.h - 4, 1, 1, '#fff0a0');
    }
    // 偶尔蹦出火星
    if (Math.random() < 0.08) particles.push({ x: f.x + 4 + Math.random() * (f.w - 8), y: f.y + 6, life: 0.6, decay: 1.5, rise: 10, size: 1, color: '#ffb030' });
  }

  function drawDynamicHouse(t) {
    const lit = sky.dark > 0.3;
    LAMPS.forEach((lx, i) => r(lx - 1, CEIL + L.cord + 3, 3, 1, lit && lampOn(i) ? '#fff4c0' : '#a89060'));
    // 关着的窗玻璃上两道反光；开着的窗偶尔飘进一片花瓣/叶子/雪花
    [L.win, L.win2].forEach((w, i) => {
      if (!S.home.winOpen[i]) {
        if (i === 0 && S.home.curtainClosed) return;
        line(w.x + 5, w.y + w.h - 5, w.x + 9, w.y + 4, 'rgba(255,255,255,0.28)');
        line(w.x + 9, w.y + w.h - 5, w.x + 12, w.y + 7, 'rgba(255,255,255,0.18)');
      } else if (Math.random() < 0.012) {
        const c = season === 'winter' ? '#ffffff' : pick(FALL_COLORS[season] || ['#7ac860', '#5aa53c']);
        particles.push({ x: w.x + 4 + Math.random() * (w.w - 8), y: w.y + 4, life: 2.2, decay: 0.5, rise: -9, size: 1, color: c });
      }
    });
    if (L.showClock) {
      const h = env.hours();
      const { x, y } = L.clock;
      const hand = (ang, len, c) => {
        for (let i = 1; i <= len; i++) r(x + Math.round(Math.sin(ang) * i), y - Math.round(Math.cos(ang) * i), 1, 1, c);
      };
      hand(((h % 12) / 12) * Math.PI * 2, 2, '#2a2040');
      hand(((h % 1)) * Math.PI * 2, 3, '#c23b55');
      r(x, y, 1, 1, '#2a2040');
    }
  }
  // 落地灯的灯泡
  function animFloorLamp() {
    r(FLOOR_LAMP_X - 2, gy('lamp') - 34, 5, 1, sky.dark > 0.3 && lampOn('floor') ? '#fff4c0' : '#c2a070');
  }
  // 咖啡机冒热气 + 鱼缸里的鱼
  function animCounter(t) {
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.5 + i / 2) % 1;
      r(COUNTER_X + 6 + Math.round(Math.sin(t * 3 + i * 2)), gy('counter') - 20 - Math.round(p * 6), 1, 1, `rgba(255,255,255,${0.6 * (1 - p)})`);
    }
    drawFish(t);
  }
  // 台灯、显示器、打字时键盘上跳动的键
  function animDesk(t) {
    r(DESK_X + 4, L.desk.top - 8, 3, 1, sky.dark > 0.3 && lampOn('desk') ? '#fff4c0' : '#c2a070');
    drawMonitor(t);
    if (typist()) {
      for (let k = 0; k < 5; k++) {
        if ((Math.floor(t * 12) + k * 3) % 5 === 0) r(DESK_X + 10 + k * 2, L.desk.top - 2, 1, 1, '#ffffff');
      }
    }
  }
  // 冬天边桌上的热可可冒热气
  function animArmchair(t) {
    if (season !== 'winter') return;
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.6 + i / 3) % 1;
      r(ARMCHAIR_X + 33 + Math.round(Math.sin(t * 3 + i * 2) * 1.2), gy('armchair') - 18 - Math.round(p * 7), 1, 1, `rgba(255,255,255,${0.7 * (1 - p)})`);
    }
  }
  // 机柜的指示灯 + 上面发光的芯片
  function animCabinet(t) {
    for (let i = 0; i < 3; i++) r(CAB_X + 16, gy('cabinet') - 16 + i * 5, 2, 1, Math.sin(t * 5 + i * 2) > 0 ? '#7ef59a' : '#2b5a3a');
    const chip = getSprite('chip');
    const { x: cx, y: cy } = chipPos();
    const glow = 0.18 + 0.1 * Math.sin(t * 3) + chipBump * 0.35;
    g.fillStyle = `rgba(127, 245, 223, ${glow})`;
    g.fillRect(cx - 3, cy - 3 - Math.round(chipBump * 2), chip.width + 6, chip.height + 6);
    g.drawImage(chip, cx, cy - Math.round(chipBump * 2));
  }

  // 雨后彩虹：户外天空上一道七色的弧
  function drawRainbow() {
    const cols = ['#ff5d5d', '#ff9d3a', '#ffe14a', '#5bd36b', '#5d9dff', '#8a6aff'];
    const cx = OUT_L + (W - OUT_L) * 0.55, cy = GROUND + 6, R = Math.min((W - OUT_L) * 0.42, GROUND * 1.05);
    g.globalAlpha = 0.45 * (1 - sky.dark);
    cols.forEach((c, i) => {
      const rr = R - i * 2;
      for (let a = Math.PI; a <= Math.PI * 2; a += 0.6 / rr) {
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.75;
        if (y < GROUND) r(x, y, 2, 2, c);
      }
    });
    g.globalAlpha = 1;
  }

  // 身上的配饰：头上的贴着头顶，脸上的在上三分之一，脖子上的在中间偏下；浴巾只在泡温泉时顶着
  function drawGear(e, foot, h, dx = 0) {
    const gear = petFor(e).gear;
    if (!gear) return;
    const top = foot - h;
    const put = (id, y) => {
      if (!id) return;
      const spr = getSprite('g_' + id);
      g.drawImage(spr, Math.round(e.x + dx - spr.width / 2), Math.round(y));
    };
    if (e.act?.kind === 'bath') put(gear.bath, top - 3);
    else put(gear.head, top - getSprite('g_' + (gear.head || 'bow')).height + 3);
    put(gear.face, top + h * 0.3);
    put(gear.neck, top + h * 0.62);
  }

  // 撑在头顶的小伞，颜色跟着角色走
  function drawUmbrella(x, top, type) {
    const c = Object.values(CHARACTERS.find((ch) => ch.id === type).colors)[0];
    r(x, top - 1, 1, 6, '#3a3a4a');
    r(x - 6, top - 3, 13, 2, c);
    r(x - 5, top - 4, 11, 1, c);
    r(x - 3, top - 5, 7, 1, lighten(c, 0.3));
    r(x - 7, top - 2, 1, 1, darken(c, 0.3));
    r(x + 7, top - 2, 1, 1, darken(c, 0.3));
  }

  // 夜里的天空：先压暗，再画星星和月亮。它们都在天空层，前景会挡住它们
  function drawNightSky(t) {
    const d = sky.dark;
    if (d <= 0.02) return;
    g.fillStyle = `rgba(8, 12, 40, ${0.5 * d})`;
    g.fillRect(DOOR_X, 0, W - DOOR_X, H);
    g.fillStyle = `rgba(8, 8, 30, ${0.28 * d})`;
    g.fillRect(0, 0, DOOR_X, H);
    // 星星月亮只在真正的夜里、而且天上没有雨雪雾的时候出来（阴天的变暗不算夜里）
    const nd = baseDark;
    if (nd < 0.25 || ['rain', 'storm', 'snow', 'fog'].includes(wx.kind)) return;
    const dim = wx.kind === 'cloudy' ? 0.45 : 1;
    // 窗户里的星星（从窗洞里透出来）
    if (nd > 0.3) {
      for (const win of [L.win, L.win2]) {
        for (let i = 0; i < 6; i++) {
          if (Math.sin(t * 2 + i * 1.7 + win.x) > -0.3) r(win.x + 4 + ((i * 11) % (win.w - 8)), win.y + 4 + ((i * 7) % (win.h - 8)), 1, 1, rgb([255, 255, 255], dim));
        }
      }
    }
    for (const [sx, sy, ph] of stars) {
      if (Math.sin(t * 2 + ph) > -0.4) r(sx, sy, 1, 1, rgb([255, 255, 255], dim * Math.min(1, nd * (0.6 + 0.4 * Math.sin(t * 3 + ph)))));
    }
    const h = env.hours();
    if (h > 18.5 || h < 6) {
      g.globalAlpha = dim;
      const { x, y } = arcPos(((h - 18.5 + 24) % 24) / 11.5);
      g.drawImage(moonSprite, Math.round(x - 5), Math.round(y - 5));
      g.globalAlpha = 1;
    }
  }

  // 夜色只压在前景层已有的像素上（source-atop），天空那部分是透明的不受影响
  function shadeForeground() {
    const d = sky.dark;
    if (d <= 0.02) return;
    fg.globalCompositeOperation = 'source-atop';
    fg.fillStyle = `rgba(8, 12, 40, ${0.5 * d})`;
    fg.fillRect(DOOR_X, 0, W - DOOR_X, H);
    fg.fillRect(0, 0, DOOR_X, CEIL);
    fg.fillStyle = `rgba(8, 8, 30, ${0.28 * d})`;
    fg.fillRect(0, CEIL, DOOR_X, H - CEIL);
    fg.globalCompositeOperation = 'source-over';
  }

  // 灯光、萤火虫：画在最上面，夜里才显得亮
  function drawLights() {
    const d = sky.dark;
    for (const dc of decor) {
      if (dc.type === 'lamp') r(dc.x - 1, GROUND + 2 - 27, 3, 1, d > 0.3 ? '#fff2b0' : '#9a9a8a');
    }
    if (d < 0.25) return;
    const glow = (x, y, rad, a) => {
      const grad = g.createRadialGradient(x, y, 1, x, y, rad);
      grad.addColorStop(0, `rgba(255, 205, 130, ${a})`);
      grad.addColorStop(1, 'rgba(255, 205, 130, 0)');
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    LAMPS.forEach((lx, i) => lampOn(i) && glow(lx, CEIL + L.cord + 4, 50, 0.3 * d));
    if (lampOn('floor') && !gone('lamp')) glow(FLOOR_LAMP_X, gy('lamp') - 36, 30, 0.3 * d);
    for (const pf of placedFurniture()) {
      if (pf.id === 'lamppost') glow(pf.x, pf.y - 32, 34, 0.35 * d);
      if (pf.id === 'xmastree') glow(pf.x, pf.y - 18, 18, 0.18 * d);
    }
    if (L.camp) glow(L.camp.x, L.camp.y - 4, 36, (0.4 + 0.06 * Math.sin(performance.now() / 80)) * d);
    // 晚宴烛台的暖光
    if (!gone('table')) for (const x of CANDLES()) glow(x, L.table.top + Math.floor(L.table.depth / 2) - 12, 26, 0.32 * d);
    if (fireLit() && !gone('fireplace')) {
      const f = fireRect();
      const flick = 0.9 + 0.1 * Math.sin(performance.now() / 90);
      const fg2 = g.createRadialGradient(f.x + f.w / 2, f.y + f.h - 6, 2, f.x + f.w / 2, f.y + f.h - 6, 48);
      fg2.addColorStop(0, `rgba(255, 140, 60, ${0.35 * d * flick})`);
      fg2.addColorStop(1, 'rgba(255, 140, 60, 0)');
      g.fillStyle = fg2;
      g.fillRect(f.x - 40, f.y - 40, f.w + 80, f.h + 60);
    }
    if (lampOn('desk')) glow(109, L.desk.top - 7, 22, 0.3 * d);
    const { mx, my, mw, mh } = L.desk;
    const mg = g.createRadialGradient(mx + mw / 2, my + mh / 2, 2, mx + mw / 2, my + mh / 2, 30);
    mg.addColorStop(0, `rgba(120, 220, 170, ${0.18 * d})`);
    mg.addColorStop(1, 'rgba(120, 220, 170, 0)');
    g.fillStyle = mg;
    g.fillRect(mx - 20, my - 20, mw + 40, mh + 40);
    for (const dc of decor) if (dc.type === 'lamp') glow(dc.x, GROUND - 25, 28, 0.35 * d);
    for (const p of weather) {
      if (p.kind !== 'fly') continue;
      const a = 0.5 + 0.5 * Math.sin(p.ph * 4);
      r(p.x, p.y, 1, 1, `rgba(220, 255, 120, ${a})`);
      g.fillStyle = `rgba(220, 255, 120, ${a * 0.25})`;
      g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
    }
  }

  // 切换当前画到哪个画布上
  function use(ctx) {
    g = gc = ctx;
    ctx.imageSmoothingEnabled = false;
  }

  function draw(t) {
    ensureLayers();
    // ---- 天空层 ----
    use(main);
    drawSky();
    const h = env.hours();
    // 太阳：下雨、雷雨、起雾时躲起来，多云时淡一点
    const hideSun = ['rain', 'storm', 'fog', 'snow'].includes(wx.kind);
    if (h >= 6 && h <= 18.5 && !hideSun) {
      const { x, y } = arcPos((h - 6) / 12.5);
      g.globalAlpha = wx.kind === 'cloudy' ? 0.55 : 1;
      g.drawImage(sunSprite, Math.round(x - 8), Math.round(y - 8));
      g.globalAlpha = 1;
    }
    g.globalAlpha = sky.dark > 0.5 ? 0.45 : 0.95;
    for (const c of clouds) g.drawImage(c.sprite, Math.round(c.x), Math.round(c.y));
    g.globalAlpha = 1;
    // 阴天下雨时天上压一层灰云
    if (WEATHER_SKY[wx.kind] && wx.kind !== 'fog') {
      g.fillStyle = `rgba(90, 96, 112, ${WEATHER_SKY[wx.kind][0] * 0.6})`;
      g.fillRect(DOOR_X, 0, W - DOOR_X, Math.round(GROUND * 0.35));
    }
    if (wx.kind === 'rainbow') drawRainbow();
    drawNightSky(t);

    // ---- 前景层 ----
    use(fg);
    fg.clearRect(0, 0, W, H);
    g.drawImage(layers.land, 0, 0);
    if (S.decor.windmill) drawWindmill(t);
    g.drawImage(layers.decor, 0, 0);
    g.drawImage(layers.house, 0, 0);
    drawDynamicHouse(t);
    drawOutdoorDynamic(t);

    // 按深度排序；餐桌和温泉前沿也参与排序，坐在后面吃饭/泡澡的会被挡住下半身
    const list = entities.filter((e) => e !== held && !e.fighting);
    for (const [k, pc] of Object.entries(layers.pieces || {})) {
      list.push({ isLayer: null, y: pieceSort(k), after: (tt) => {
        g.drawImage(pc.img, pc.x, pc.y);
        PIECES[k].anim?.(tt);
      } });
    }
    if (bug) list.push({ isBug: true, y: bug.enter ? bug.ty : bug.y });
    for (const f of fights) list.push({ isLayer: null, y: f.y, after: (tt) => drawFight(f, tt) });
    if (layers.tableBack) list.push({ isLayer: layers.tableBack, y: L.table.top - 0.5 });
    if (layers.tv) list.push({ isLayer: layers.tv, y: L.tv.y, after: drawTVScreen });
    // 秋千近处的绳子和架腿：在荡秋千的角色前面，在地上走的角色后面
    if (layers.swingFront) {
      list.push({ isLayer: null, y: swingSeat(swingAngle(t)).y + 0.5, after: drawSwingSeat });
      list.push({ isLayer: layers.swingFront, y: swingBase().d0 });
    }
    if (layers.table) list.push({ isLayer: layers.table, y: L.table.top + 7.5, after: drawTableSteam });
    if (layers.springFront) list.push({ isLayer: layers.springFront, y: L.spring.y + 7, after: drawRipples });
    // 篝火的火苗：在后面那根凳子上的角色前面，两边的角色后面
    if (L.camp) list.push({ isLayer: null, y: L.camp.y - 0.5, after: drawCampFlames });
    for (const pf of placedFurniture()) list.push({ isLayer: null, y: pf.y - (pf.d.sortD ?? pf.d.fd) - 0.5, after: (tt) => drawPlaced(pf, tt) });
    // 坐在家具上的角色紧跟着那件家具画（不然家具往前挪了以后会挡住坐着的人）
    const sortKey = (o) => (o.act?.piece && PIECES[o.act.piece] && !o.hop ? pieceSort(o.act.piece) + 0.2 : o.y);
    list.sort((a, b) => sortKey(a) - sortKey(b));
    for (const e of list) {
      if ('isLayer' in e) {
        if (e.isLayer) g.drawImage(e.isLayer, 0, 0);
        e.after?.(t);
        continue;
      }
      if (e.isBug) {
        const en = bug.enter;
        const spr = getSprite('bug');
        if (!en || en.how !== 'sky') {
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(Math.round(bug.x - 5), Math.round((en ? bug.ty : bug.y)) - 1, 10, 2);
        } else {
          // 还在天上：地上的影子越来越大
          const k = Math.min(1, en.t / BUG_ENTER.sky);
          g.fillStyle = `rgba(0,0,0,${0.1 + 0.2 * k})`;
          g.fillRect(Math.round(bug.x - 2 - 3 * k), Math.round(bug.ty) - 1, Math.round(4 + 6 * k), 2);
        }
        if (en?.how === 'ground') {
          const k = Math.min(1, en.t / BUG_ENTER.ground);
          const show = Math.round(spr.height * Math.max(0, (k - 0.3) / 0.7));
          if (show > 0) g.drawImage(spr, 0, 0, spr.width, show, Math.round(bug.x - spr.width / 2), Math.round(bug.y - show), spr.width, show);
        } else {
          drawSprite(spr, bug.x, bug.y - (en ? 0 : Math.floor(bug.wob * 8) % 2), bug.dir < 0);
        }
        drawBugEnter();
        continue;
      }
      const spr = getSprite(e.type);
      // 赶去聊天、追 Bug 的时候即使在"说话"状态也照样迈步，跑起来步子更快
      const hurry = e.joining || e.chasing;
      const walking = (e.state === 'walk' || e.chasing) && e.drop === 0 && (e.hold <= 0 || hurry);
      let bob = walking ? Math.floor(t * (hurry ? 13 : 8) + e.phase) % 2 : 0;
      const kind = e.act?.kind;
      if (kind === 'type') bob = Math.floor(t * 9 + e.phase) % 2;
      if (kind === 'eat') bob = Math.floor(t * 4 + e.phase) % 2;
      if (INSTR.includes(kind) && kind !== 'piano') {
        const b = music.beat();
        bob = b ? (b.phase < 0.3 ? 1 : 0) : Math.floor(t * 4 + e.phase) % 2;
      }
      const jump = e.jump > 0 ? Math.round(Math.sin((e.jump / 0.4) * Math.PI) * 6) : 0;
      const lift = Math.round((e.lift || 0) + (e.hopLift || 0));
      // 坐着、吃饭、泡澡、荡秋千都不在地上，不画影子；蹦床的影子留在垫子上
      if (!['sit', 'eat', 'bath', 'swing', 'perch', 'piano', 'nap', 'guitar', 'drums', 'synth', 'picnic', 'sand'].includes(kind)) {
        const shadowW = Math.max(6, spr.width - 4 - Math.floor(lift / 6));
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(Math.round(e.x - shadowW / 2), Math.round(e.y) - 1, shadowW, 2);
      }
      const [sx, sy] = squashScale(e);
      const foot = e.y - bob - jump - e.drop - lift;
      drawSprite(spr, e.x + (e.lean || 0), foot, flipOf(e), sx, sy);
      // 满级的小金冠：鼠标悬停时才戴上
      if (e === hovered && level(e.type) >= maxLevel(e.type)) {
        const crown = getSprite('crown');
        g.drawImage(crown, Math.round(e.x - crown.width / 2), Math.round(foot - spr.height * sy - crown.height + 2));
      }
      drawGear(e, foot, spr.height * sy);
      if (e.act && INSTR.includes(e.act.kind)) drawHeldInstrument(e, foot, spr.height * sy, t);
      if (e.dizzy > 0) drawDizzy(e, foot - spr.height * sy, t);
      // 下雨还在外面的撑把小伞
      if (raining() && e.out && !e.act && e.drop === 0) drawUmbrella(e.x, foot - spr.height * sy - 1, e.type);
      if (e.act?.arms) drawArmchairArms();
      // 睡觉时把被子盖在身上
      if (e.act?.bed) {
        r(BED_X + 3, GROUND - 10, 22, 1, OUTLINE);
        drawQuilt();
      }
    }
    if (held) drawHeld(t);

    for (const p of weather) {
      if (p.kind === 'snow') r(p.x, p.y, p.big ? 2 : 1, p.big ? 2 : 1, '#ffffff');
      else if (p.kind === 'leaf') r(p.x, p.y, 2, 1 + (Math.sin(p.ph * 5) > 0 ? 1 : 0), p.c);
      else if (p.kind === 'rain') {
        r(p.x, p.y, 1, 3, 'rgba(190, 215, 245, 0.75)');
        if (p.y + 4 >= p.land) r(p.x - 1, p.land, 3, 1, 'rgba(200, 225, 250, 0.6)');
      }
    }
    shadeForeground();

    // ---- 合成，再叠灯光和特效 ----
    use(main);
    g.drawImage(fgCanvas, 0, 0);
    // 起雾：户外蒙一层白雾
    if (wx.kind === 'fog') {
      g.fillStyle = `rgba(222, 226, 234, ${0.42 - sky.dark * 0.2})`;
      g.fillRect(DOOR_X, 0, W - DOOR_X, H);
    }
    drawLights();
    if (S.decor.lights) drawStringLights(t);
    // 打雷闪电：整个画面亮一下
    if (flash > 0) {
      g.fillStyle = `rgba(235, 240, 255, ${flash * 0.45})`;
      g.fillRect(0, 0, W, H);
    }

    for (const p of particles) {
      g.globalAlpha = Math.min(1, p.life * 1.5);
      if (p.sprite) g.drawImage(getSprite(p.sprite), Math.round(p.x - 4), Math.round(p.y - 4));
      else r(p.x, p.y, p.size, p.size, p.color);
    }
    g.globalAlpha = 1;
    drawHighlight(t);
    drawDecorOverlay(t);
  }

  // 伙伴页里点了某个角色：它头上出现一个上下跳的箭头
  function drawHighlight(t) {
    if (!highlight || performance.now() > highlight.until) return;
    const arrow = getSprite('arrow');
    for (const e of entities) {
      if (e.type !== highlight.type || (highlight.slot !== undefined && e.slot !== highlight.slot)) continue;
      const top = e.y - (e.lift || 0) - getSprite(e.type).height - e.drop;
      g.drawImage(arrow, Math.round(e.x - arrow.width / 2), Math.round(top - arrow.height - 3 - Math.abs(Math.sin(t * 6)) * 4));
    }
  }

  const STATUS = {
    sit: '坐着休息', type: '在写代码', sleep: '在睡觉 💤', eat: '在吃饭', bath: '在泡温泉 ♨', swing: '在荡秋千', bounce: '在蹦床上',
    garden: '在菜园浇水', fish: '在钓鱼 🎣', camp: '在烤火 🔥', piano: '在弹钢琴 🎹', game: '在打游戏 🎮', aquarium: '在看鱼', perch: '在猫爬架上',
    arcade: '在玩街机 🕹', stargaze: '在看星星 🔭', nap: '在打盹',
    slide: '在玩滑梯', sand: '在沙坑里堆城堡', picnic: '在野餐 🧺', wish: '在喷泉边许愿',
    guitar: '在弹吉他 🎸', violin: '在拉小提琴 🎻', drums: '在打鼓 🥁', synth: '在弹电子琴 🎹',
  };
  const GOING = {
    sit: '去找地方坐', type: '去书桌写代码', sleep: '去床上睡觉', eat: '去餐桌吃饭', bath: '去泡温泉', swing: '去荡秋千', bounce: '去玩蹦床',
    garden: '去菜园', fish: '去池塘钓鱼', camp: '去烤火', piano: '去弹钢琴', game: '去打游戏', aquarium: '去看鱼', perch: '去爬猫爬架',
    arcade: '去玩街机', stargaze: '去看星星', nap: '去打个盹',
    slide: '去玩滑梯', sand: '去沙坑', picnic: '去野餐', wish: '去喷泉许愿',
    guitar: '去弹吉他', violin: '去拉小提琴', drums: '去打鼓', synth: '去弹电子琴',
  };
  // 伙伴页显示的当前状态（有好几只时看第一只）
  function statusOf(type, slot = 0) {
    const e = typeof type === 'object' ? type : entities.find((x) => x.type === type && x.slot === slot);
    if (!e) return '';
    if (e.held) return '被你拎着';
    if (e.fall) return '在空中飞';
    if (e.drop > 0) return '刚搬进小窝';
    if (e.chasing) return '在追 Bug';
    if (e.act) return STATUS[e.act.kind];
    if (e.goal) return GOING[e.goal.kind];
    if (e.joining) return '去找朋友聊天';
    if (e.hold > 0) return '在聊天';
    if (e.state === 'walk') return e.out ? '在外面散步' : '在屋里溜达';
    return e.out ? '在外面发呆' : '在屋里发呆';
  }

  // ---------- 点击 ----------
  function toLocal(ev) {
    const rc = cv.getBoundingClientRect();
    return {
      x: ((ev.clientX - rc.left) * W) / rc.width,
      y: ((ev.clientY - rc.top) * H) / rc.height,
      cssX: ev.clientX - rc.left,
      cssY: ev.clientY - rc.top,
    };
  }

  function hit(ev) {
    const p = toLocal(ev);
    if (bug) {
      const b = getSprite('bug');
      if (Math.abs(p.x - bug.x) < b.width / 2 + 5 && p.y > bug.y - b.height - 5 && p.y < bug.y + 4) {
        bug = null;
        scheduleBug();
        return { kind: 'bug', p };
      }
    }
    // 点成熟的作物直接收获
    if (L.garden) {
      const i = S.garden.plots.findIndex((pl, k) => pl.stage >= 3 && Math.abs(p.x - plotX(k)) < 6 && p.y > L.garden.y - 10 && p.y < L.garden.y + 3);
      if (i >= 0) {
        harvest(i, null);
        return { kind: 'crop', p };
      }
    }
    const c = getSprite('chip');
    const cp = chipPos();
    if (p.x >= cp.x - 4 && p.x <= cp.x + c.width + 4 && p.y >= cp.y - 4 && p.y <= cp.y + c.height + 4) {
      chipBump = 1;
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: cp.x + c.width / 2 + (Math.random() - 0.5) * 12, y: cp.y + 4,
          life: 0.8, decay: 1.6, rise: 18 + Math.random() * 12, color: '#7ff5df', size: 1,
        });
      }
      return { kind: 'chip', p };
    }
    const e = entityAt(p);
    if (e) return { kind: 'char', p, e };
    // 没点到角色：看看是不是点了窗户、窗帘、灯、壁炉
    const f = furnitureAt(p);
    if (f) {
      f.toggle();
      save();
      return { kind: 'furniture', p, f };
    }
    return { kind: 'none', p };
  }

  // 屋里能点的东西：返回 { label: 悬停提示, toggle: 点击时做什么 }
  function furnitureAt(p) {
    const inR = (x, y, w, h) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
    const home = S.home;
    const flip = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    const win = L.win, w2 = L.win2;
    // 窗帘（拉开时是两侧的布条；拉上时盖住整扇窗）
    if (home.curtainClosed && inR(win.x - 4, win.y - 2, win.w + 8, win.h + 4)) {
      return { label: '拉开窗帘', toggle: () => { home.curtainClosed = false; } };
    }
    if (!home.curtainClosed && (inR(win.x - 4, win.y - 2, 4, win.h + 4) || inR(win.x + win.w, win.y - 2, 4, win.h + 4))) {
      return { label: '拉上窗帘', toggle: () => { home.curtainClosed = true; } };
    }
    for (const [i, w] of [[0, win], [1, w2]]) {
      if (inR(w.x, w.y, w.w, w.h)) {
        return { label: home.winOpen[i] ? '关上窗户' : '打开窗户', toggle: () => { home.winOpen[i] = !home.winOpen[i]; } };
      }
    }
    for (let i = 0; i < LAMPS.length; i++) {
      if (inR(LAMPS[i] - 4, CEIL + 2, 9, L.cord + 3)) {
        return { label: lampOn(i) ? '关灯' : '开灯', toggle: () => { home.lampsOff = flip(home.lampsOff, i); } };
      }
    }
    if (!gone('lamp') && inR(FLOOR_LAMP_X - 5, gy('lamp') - 40, 11, 8)) {
      return { label: lampOn('floor') ? '关落地灯' : '开落地灯', toggle: () => { home.lampsOff = flip(home.lampsOff, 'floor'); } };
    }
    if (inR(DESK_X, L.desk.top - 12, 9, 6)) {
      return { label: lampOn('desk') ? '关台灯' : '开台灯', toggle: () => { home.lampsOff = flip(home.lampsOff, 'desk'); } };
    }
    const rc = recordRect();
    if (S.decor.record && !gone('piano') && inR(rc.x - 1, rc.y - 1, rc.w + 2, rc.h + 2)) {
      return {
        label: home.music ? `停止音乐（${music.songName() || '…'}）` : '放音乐 ♪（每次换一首）',
        toggle: () => {
          home.music = !home.music;
          music.update(home.music, new Set());
          if (home.music) toast(`♪ 正在播放《${music.songName()}》`);
        },
      };
    }
    if (!gone('piano') && inR(PIANO_X - 1, gy('piano') - 22, 22, 22)) return { label: '弹一段钢琴 ♪', toggle: playMelody };
    const ts = tvScreen();
    if (!gone('tv') && inR(ts.x - 2, ts.y - 2, ts.w + 4, ts.h + 4)) {
      return { label: home.tv ? '关掉电视' : '打开电视', toggle: () => { home.tv = !home.tv; } };
    }
    const tk = tankRect();
    if (!gone('counter') && inR(tk.x - 1, tk.y - 2, tk.w + 2, tk.h + 2)) return { label: '喂鱼', toggle: feedFish };
    const fr = fireRect();
    if (!gone('fireplace') && inR(fr.x - 2, fr.y - 2, fr.w + 4, fr.h + 2)) {
      const lit = fireLit();
      return { label: lit ? '熄灭壁炉' : '点燃壁炉', toggle: () => { home.fire = { on: !lit, season }; } };
    }
    return null;
  }

  // 鼠标悬停在什么上面：角色 / 显示器 / 能点的家具
  function hoverInfo(ev) {
    const p = toLocal(ev);
    const e = entityAt(p);
    if (e) return { kind: 'char', e };
    const d = L.desk;
    if (p.x >= d.mx && p.x < d.mx + d.mw && p.y >= d.my && p.y < d.my + d.mh) return { kind: 'monitor' };
    const f = furnitureAt(p);
    if (f) return { kind: 'furniture', label: f.label };
    return null;
  }

  // 拖着角色松手时，落点算不算放在了某个位子上
  const DROP_KIND = {
    type: 'desk', sleep: 'bed', sit: 'seat', eat: 'eat', bath: 'bath', swing: 'swing', bounce: 'bounce', garden: 'garden', fish: 'fish', camp: 'camp',
    piano: 'piano', game: 'game', aquarium: 'aquarium', perch: 'perch',
    arcade: 'arcade', stargaze: 'stargaze', nap: 'nap', slide: 'slide', sand: 'sand', picnic: 'picnic', wish: 'wish', guitar: 'guitar', violin: 'violin', drums: 'drums', synth: 'synth',
  };
  function spotHit(sp, p) {
    switch (sp.kind) {
      case 'piano': return Math.abs(p.x - sp.dx) < 11 && p.y > gy('piano') - 24 && p.y < gy('piano') + 8;
      case 'game': return Math.abs(p.x - sp.dx) < 8 && Math.abs(p.y - (sp.dy - 6)) < 9;
      case 'aquarium': return Math.abs(p.x - sp.dx) < 10 && p.y > gy('counter') - 28 && p.y < gy('counter') + 9;
      case 'perch': return Math.abs(p.x - sp.dx) < 7 && Math.abs(p.y - (sp.dy - 6)) < 7;
      case 'garden': return Math.abs(p.x - sp.dx) < 28 && p.y > L.garden.y - 10 && p.y < L.garden.y + 14;
      case 'fish': return Math.abs(p.x - sp.dx) < 10 && Math.abs(p.y - (sp.dy - 6)) < 10;
      case 'camp': return Math.abs(p.x - sp.dx) < 8 && Math.abs(p.y - (sp.dy - 5)) < 8;
      case 'type': return p.x > DESK_X && p.x < DESK_X + 48 && p.y > L.desk.my && p.y < gy('desk') + 8;
      case 'eat': return Math.abs(p.x - sp.dx) < 14 && Math.abs(p.y - (sp.dy - 7)) < 8;
      case 'bath': return Math.abs(p.x - sp.dx) < 8 && Math.abs(p.y - L.spring.y) < 14;
      case 'swing': return Math.abs(p.x - sp.dx) < 10 && p.y > swingBase().barY && p.y < swingBase().d0;
      case 'bounce': return Math.abs(p.x - sp.dx) < 15 && p.y > trampY() - 22 && p.y < trampY() + 4;
      default: return Math.abs(p.x - sp.dx) < 13 && p.y > sp.dy - 22 && p.y < sp.dy + 8;
    }
  }

  // 鼠标下面最靠前的角色（飞在半空的也能接住）
  function entityAt(p) {
    const sorted = [...entities].sort((a, b) => b.y - a.y);
    for (const e of sorted) {
      const s = getSprite(e.type);
      if (Math.abs(p.x - e.x) < s.width / 2 + 1 && p.y > e.y - s.height - e.drop - 1 && p.y < e.y + 2) return e;
    }
    return null;
  }

  // 戳一下：跳起来冒个爱心
  function poke(e) {
    const s = getSprite(e.type);
    e.jump = 0.4;
    particles.push({ x: e.x, y: e.y - s.height - 4, life: 1.2, rise: 10, sprite: 'heart' });
  }

  // ---------- 拖动 ----------
  function grab(e) {
    leaveSpot(e);
    e.goal = null;
    e.joining = false;
    e.hold = 0;
    e.fall = null;
    e.state = 'idle';
    e.held = true;
    e.hop = null;
    e.hopLift = 0;
    e.chasing = false;
    // 把打架的一方拎走：架就打不成了，另一个晕乎乎地留在原地
    const fight = fights.find((f) => f.a === e || f.b === e);
    if (fight) {
      fights.splice(fights.indexOf(fight), 1);
      for (const x of [fight.a, fight.b]) x.fighting = false;
      (fight.a === e ? fight.b : fight.a).dizzy = 2;
      fight.done();
    }
    e.heldTime = 0;
    bumpStat(e, 'grabs');
    e.nextGripe = 3;
    held = e;
    trail = [];
  }

  // 鼠标位置大概在角色身体上部，看起来像拎着它
  function dragTo(ev) {
    if (!held) return;
    const p = toLocal(ev);
    const s = getSprite(held.type);
    held.x = Math.max(4, Math.min(W - 4, p.x));
    held.y = Math.max(s.height + 2, Math.min(H - 2, p.y + s.height * 0.6));
    const now = performance.now();
    trail.push({ x: held.x, y: held.y, t: now });
    trail = trail.filter((q) => now - q.t < 100);
  }

  // 松手：先看放在了什么地方，再按甩出去的速度飞出去
  function release(ev) {
    const e = held;
    if (!e) return null;
    held = null;
    e.held = false;
    const p = toLocal(ev);
    const ctx = { e, p, kind: 'drop' };
    let vx = 0, vy = 0;
    // 松手前停住不动超过 0.1 秒就当作轻轻放下
    trail = trail.filter((q) => performance.now() - q.t < 100);
    if (trail.length > 1) {
      const a = trail[0], b = trail[trail.length - 1];
      const dt = Math.max(16, b.t - a.t) / 1000;
      vx = (b.x - a.x) / dt;
      vy = (b.y - a.y) / dt;
    }
    const speed = Math.hypot(vx, vy);
    ctx.thrown = speed > 220;
    // 甩出去时手劲放大一些，飞得更远
    const THROW_BOOST = 1.7, MAX_V = 650;
    vx = Math.max(-MAX_V, Math.min(MAX_V, vx * THROW_BOOST));
    vy = Math.max(-MAX_V, Math.min(MAX_V * 0.6, vy * THROW_BOOST));

    if (!ctx.thrown) {
      // 椅子 / 沙发 / 书桌
      // 落点附近可能有好几个位子（双人床、长沙发），优先挑空着的
      const near = spots.filter((sp) => spotHit(sp, p)).sort((a, b) => Math.abs(p.x - a.dx) - Math.abs(p.x - b.dx));
      const seat = near.find((sp) => !sp.who && !sp.reserved) || near[0];
      const other = seat && (seat.who || seat.reserved);
      if (seat && !other) {
        startActivity(e, seat, true);
        ctx.kind = DROP_KIND[seat.kind];
        return ctx;
      }
      // 蹦床上已经有人：被弹飞
      if (seat?.kind === 'bounce') ctx.kind = 'tramp';
      // 位子上已经有人了
      else if (other && other !== e) {
        ctx.kind = 'occupied';
        ctx.other = other;
      }
      // 芯片
      const c = getSprite('chip'), cp = chipPos();
      if (p.x >= cp.x - 4 && p.x <= cp.x + c.width + 4 && p.y >= cp.y - 4 && p.y <= cp.y + c.height + 4) {
        ctx.kind = 'chip';
        chipBump = 1;
      }
      // 壁炉 / 冰箱 / 咖啡机
      const inRect = (x, y, w, h) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
      const f = fireRect();
      if (inRect(f.x - 2, f.y - 4, f.w + 4, f.h + 6)) ctx.kind = fireLit() ? 'fire' : 'coldFire';
      // 篝火正中间：点着就烫得弹开
      if (L.camp && inRect(L.camp.x - 6, L.camp.y - 10, 12, 12)) ctx.kind = campLit() ? 'fire' : 'coldCamp';
      if (inRect(FRIDGE_X, GROUND - 36, 14, 36)) ctx.kind = 'fridge';
      if (inRect(COUNTER_X, GROUND - 28, 14, 28)) ctx.kind = 'coffee';
      // 相框墙
      CHARACTERS.forEach((ch, i) => {
        const f = frameRect(i);
        if (owned(ch.id) && p.x >= f.x && p.x < f.x + 24 && p.y >= f.y && p.y < f.y + 24) {
          ctx.kind = 'portrait';
          ctx.of = ch;
        }
      });
    }
    // 直接砸在 Bug 上
    if (bug && Math.abs(bug.x - e.x) < 12 && Math.abs(bug.y - e.y) < 10) {
      ctx.kind = 'bug';
      bug = null;
      scheduleBug();
    }
    let landY = e.y >= floorTop() && e.y <= floorBottom() ? e.y : Math.max(floorTop(), Math.min(floorBottom(), e.y)) + Math.random() * 4;
    // 从池塘正上方往下丢：掉进水里
    if (L.pond && e.y < floorTop() && Math.abs(e.x - L.pond.x) < POND_RX - 4 && Math.abs(vx) < 80) landY = L.pond.y;
    // 用力甩到蹦床上也会被弹飞
    if (ctx.thrown && L.tramp && Math.abs(e.x - L.tramp) < 16 && e.y > trampY() - 20) ctx.kind = 'tramp';
    if (ctx.kind === 'tramp') {
      vy = -340;
      vx = vx * 0.3 + (Math.random() - 0.5) * 60;
      e.sqv = (e.sqv || 0) + 6;
      bumpStat(e, 'bounces');
    }
    // 被放进烧着的壁炉：烫得弹出来
    if (ctx.kind === 'fire') {
      addAff(e, -4);
      vx = 140 + Math.random() * 60;
      vy = -170;
      e.sqv = (e.sqv || 0) - 5;
    }
    e.fall = { vx, vy, landY: Math.min(floorBottom(), landY), fromY: e.y };
    return ctx;
  }

  function drawHeld(t) {
    const e = held;
    const spr = getSprite(e.type);
    // 地上的影子离得越远越小
    const groundY = Math.max(floorTop(), Math.min(floorBottom(), e.y + 8));
    const lift = Math.max(0, groundY - e.y);
    const sw = Math.max(3, spr.width - 4 - Math.floor(lift / 8));
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(Math.round(e.x - sw / 2), Math.round(groundY) - 1, sw, 2);
    // 左右扭来扭去地挣扎
    const wiggle = Math.round(Math.sin(t * 22));
    e.dir = Math.floor(t * 3) % 2 ? 1 : -1;
    // 被拎着的时候身体往下坠一点，像软软的被拉长
    const [sx, sy] = squashScale(e);
    drawSprite(spr, e.x + wiggle, e.y, flipOf(e), sx * 0.94, sy * 1.08);
    drawGear(e, e.y, spr.height * sy * 1.08, wiggle);
  }

  // 放在芯片上充电时冒一圈蓝光
  function chargeFx(e) {
    const s = getSprite(e.type);
    for (let i = 0; i < 14; i++) {
      particles.push({
        x: e.x + (Math.random() - 0.5) * s.width, y: e.y - Math.random() * s.height,
        life: 0.9, rise: 14 + Math.random() * 10, size: 1, color: pick(['#7ff5df', '#ffffff', '#ffcf4a']),
      });
    }
  }

  new ResizeObserver(resize).observe(cv.parentElement);
  resize();

  return {
    sync, update, draw, hit, scheduleBug, resize,
    poke, grab, dragTo, release, chargeFx, statusOf,
    highlight: (type, slot) => { highlight = { type, slot, until: performance.now() + 4000 }; },
    entityAt: (ev) => entityAt(toLocal(ev)),
    setHover: (e) => { hovered = e; },
    hoverInfo,
    isHeld: () => !!held,
    decor: {
      on: () => decorOn,
      set(v) {
        decorOn = v;
        decorDrag = null;
        decorHover = null;
        if (v) for (const e of entities) leaveSpot(e);
      },
      start: decorStart,
      move: decorMove,
      end: decorEnd,
      placeNew,
      store: storeFurn,
      storeAt: decorStoreAt,
      has: (k) => !gone(k),
      buyBuiltin(k) {
        S.ownedFurn[k] = true;
        delete S.stored[k];
        resize();
      },
      unstore: unstoreBuiltin,
      storedNames: () => Object.keys(S.stored || {}).filter((k) => S.stored[k]).map((k) => [k, STORE_NAMES[k] || k]),
      reset: resetLayout,
    },
    // 关系网里撮合 / 挑拨：被叫的那只放下手里的事走过去
    socialFar(pa, pb, kind) {
      const find = (x) => entities.find((e) => e.type === x.type && (e.slot || 0) === (x.slot || 0));
      const a = find(pa), b = find(pb);
      if (!a || !b) return false;
      for (const e of [a, b]) {
        if (e.held || e.fall || e.fighting || e.social || e.chasing || e.drop > 0) return false;
      }
      for (const e of [a, b]) {
        leaveSpot(e);
        e.hop = null;
        e.hopLift = 0;
        e.hold = 0;
        e.joining = false;
      }
      const nick = CHARACTERS.find((c) => c.id === a.type).nick;
      talk.sayTo(b, pick(MATCH_LINES[['hug', 'highfive', 'makeup'].includes(kind) ? 'good' : 'bad']).replace('{nick}', nick));
      interact(a, b, kind, true, 25000);
      return true;
    },
    // 被丢到别人身边时由对话那边叫过来：关系好就抱、不好就吵
    social(a, b, kind) {
      if (a.social || b.social || b.held || b.fall || b.fighting || a.fighting) return false;
      interact(a, b, kind, false);
      return true;
    },
    // 模型升级：这个 AI 的分身全都跳起来，冒一圈光
    levelUp(id) {
      const c = CHARACTERS.find((x) => x.id === id);
      const tint = Object.values(c.colors)[0];
      for (const e of entities) {
        if (e.type !== id) continue;
        e.jump = 0.4;
        const s = getSprite(e.type);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          particles.push({
            x: e.x + Math.cos(a) * (s.width / 2 + 2), y: e.y - s.height / 2 + Math.sin(a) * (s.height / 2 + 2),
            life: 1.1, rise: 8 + Math.random() * 6, size: 1,
            color: i % 3 ? '#ffcf4a' : tint,
          });
        }
      }
      this.celebrate(id);
    },
    // 新相框挂上墙时闪一下
    celebrate(id) {
      const f = frameRect(CHARACTERS.findIndex((c) => c.id === id));
      for (let i = 0; i < 14; i++) {
        particles.push({
          x: f.x + Math.random() * 24, y: f.y + Math.random() * 24,
          life: 1 + Math.random() * 0.6, rise: 4 + Math.random() * 8, size: 1,
          color: pick(['#ffcf4a', '#ffffff', '#fff1a0']),
        });
      }
    },
    cssScale: () => SCALE,
    width: () => W,
    floorBottom,
    typist,
    list: () => entities,
    now: () => ({ season, dark: sky.dark, weather: wx.kind }),
    setOnBug: (fn) => { onBug = fn; },
    setOnBugCaught: (fn) => { onBugCaught = fn; },
    setOnReward: (fn) => { onReward = fn; },
    // 商城用：重新布置场景（买了家具之后）、马上引来 Bug、菜园全熟
    rebuild: () => {
      resize();
      layers.key = '';
    },
    spawnBugNow: () => {
      if (!bug) nextBugAt = 0;
    },
    ripenGarden: () => {
      for (const p of S.garden.plots) {
        p.stage = 3;
        p.wet = false;
      }
    },
    // 角色在画布上的 CSS 坐标（用来在它身上飘字）
    cssPos: (e) => ({ cssX: e.x * SCALE, cssY: (e.y - getSprite(e.type).height) * SCALE }),
  };
})();

// ---------- 对话气泡 ----------
const talk = (() => {
  const bubbles = []; // { e, node, until }
  let nextChat = performance.now() + 4000;
  let nextDuo = performance.now() + 20000;
  const alive = (e) => room.list().includes(e);

  function remove(b) {
    b.node.remove();
    bubbles.splice(bubbles.indexOf(b), 1);
  }

  function say(e, text, ms = 3500, hold = true) {
    if (!e || !text) return;
    const old = bubbles.find((b) => b.e === e);
    if (old) remove(old);
    // 同时最多 3 个气泡，太多就挤成一团了
    if (bubbles.length >= 3) remove(bubbles[0]);
    const node = el('div', 'bubble', text);
    $('#fx').appendChild(node);
    bubbles.push({ e, node, until: performance.now() + ms });
    if (hold) e.hold = Math.max(e.hold || 0, ms / 1000);
    position();
  }

  function randomEntity(filter) {
    const list = room.list().filter((e) => e.drop === 0 && !bubbles.some((b) => b.e === e) && (!filter || filter(e)));
    return list.length ? pick(list) : null;
  }

  // 把台词里的 {tokens} {clicks} 换成真实数字
  const fill = (text, vars = {}) => text
    .replace('{tokens}', fmt(S.tokens))
    .replace('{clicks}', fmt(S.clicks))
    .replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

  const free = (e) => !e.act && !e.goal && !e.held && !e.fall;

  function whenOk(when) {
    if (!when) return true;
    const { season, dark } = room.now();
    return when === season || (when === 'night' && dark > 0.6) || (when === 'day' && dark < 0.3);
  }

  // 几个角色走到一起再聊：第一个人站着等，其他人走到他两边
  // 关系条件：friends 要 ≥30，rivals 要 ≤-20（看前两个人）
  const relOk = (rel, a, b) => !rel || (rel === 'friends' ? getRel(a, b) >= 30 : getRel(a, b) <= -20);
  function startConvo() {
    const options = CONVOS.filter((c) => whenOk(c.when) && c.who.every((id) => room.list().some((e) => e.type === id && free(e)))
      && (!c.rel || room.list().some((a) => a.type === c.who[0] && room.list().some((b) => b.type === c.who[1] && b !== a && relOk(c.rel, a, b)))));
    if (!options.length) return;
    // 有合适的"看场合"或"看关系"的对话时，一半机会优先用它
    const special = options.filter((c) => c.when || c.rel);
    const convo = special.length && Math.random() < 0.5 ? pick(special) : pick(options);
    // 挑一组离得近的：发起人的每个候选都看看其他人最近的那只有多远，太远（比如一个在屋里一个在池塘）就不聊
    const avail = (id, taken) => room.list().filter((x) => x.type === id && x.drop === 0 && free(x) && !bubbles.some((b) => b.e === x) && !taken.includes(x));
    let people = null, best = Infinity;
    for (const host of avail(convo.who[0], [])) {
      const group = [host];
      let worst = 0;
      for (const id of convo.who.slice(1)) {
        const near = avail(id, group).sort((a, b) => Math.abs(a.x - host.x) - Math.abs(b.x - host.x))[0];
        if (!near) {
          worst = Infinity;
          break;
        }
        group.push(near);
        worst = Math.max(worst, Math.abs(near.x - host.x));
      }
      if (worst < best) {
        best = worst;
        people = group;
      }
    }
    if (!people || best > CONVO_MAX_DIST || !relOk(convo.rel, people[0], people[1])) return;
    const [host, ...guests] = people;
    // 发起人原地等着，其他人小跑到他两边
    host.hold = CONVO_MAX_WAIT / 1000;
    guests.forEach((gst, i) => {
      const side = (i === 0 ? Math.sign(gst.x - host.x) || 1 : -Math.sign(guests[0].x - host.x) || -1);
      gst.tx = Math.max(10, Math.min(room.width() - 8, host.x + side * 16 * (1 + Math.floor(i / 2))));
      gst.ty = host.y;
      gst.state = 'walk';
      gst.joining = true;
    });
    playConvo(convo, people, 300);
  }

  const CONVO_MAX_WAIT = 15000;
  const CONVO_MAX_DIST = 110;         // 聊天的人之间最远隔多少像素（太远就不叫过来聊了）
  const CONVO_NEAR = 34;              // 开口时每个人离发起人最远多少，超过就不聊

  // 按顺序播一段对话；people 和 convo.who 一一对应。等所有人都走到位了才开口
  function playConvo(convo, people, delay) {
    const lines = convo.lines.map((l, i) => (Array.isArray(l) ? l : [i % convo.who.length, l]));
    const gap = 2400;
    const ok = () => people.every((p) => alive(p) && !p.held && !p.chasing);
    const begin = performance.now();
    nextChat = begin + CONVO_MAX_WAIT + lines.length * gap + 3000;
    const waitAll = () => {
      if (!ok()) {
        // 有人被拎走了，这段对话作罢，其他人也别傻等
        for (const p of people) {
          p.joining = false;
          if (!p.act) p.hold = 0;
        }
        return;
      }
      if (people.some((p) => p.joining)) {
        if (performance.now() - begin < CONVO_MAX_WAIT) return setTimeout(waitAll, 200);
        // 等太久还没走到，就不隔着老远喊话了
        for (const p of people) {
          p.joining = false;
          if (!p.act) p.hold = 0;
        }
        return;
      }
      // 人到齐了还得真的站在一块儿（比如目标被家具挡开了），否则不聊
      const far = people.some((p) => Math.hypot(p.x - people[0].x, (p.y - people[0].y) * 1.5) > CONVO_NEAR);
      if (far) {
        for (const p of people) if (!p.act) p.hold = 0;
        return;
      }
      start();
    };
    setTimeout(waitAll, delay);
    const start = () => {
      for (const p of people) p.joining = false;
      nextChat = performance.now() + lines.length * gap + 3000;
      for (const p of people) p.hold = (lines.length * gap) / 1000 + 1;
      // 聊过天会更熟一点
      for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) addRel(people[i], people[j], 2);
      lines.forEach(([idx, text], i) => setTimeout(() => {
        if (!ok()) return;
        // 聊到一半被拉开了（比如被拎走又放到别处），就别隔空接着聊
        if (people.some((p) => Math.hypot(p.x - people[0].x, p.y - people[0].y) > CONVO_NEAR * 1.5)) return;
        const me = people[idx];
        const other = idx === 0 ? people[1] : people[0];
        me.dir = other.x >= me.x ? 1 : -1;
        say(me, fill(text), gap + 600);
      }, i * gap));
    };
  }

  // 被扔到别人身边：有专属两人对话就直接聊，没有就打个招呼
  function bump(a, b) {
    const ca = CHARACTERS.find((c) => c.id === a.type), cb = CHARACTERS.find((c) => c.id === b.type);
    const face = () => {
      a.dir = b.x >= a.x ? 1 : -1;
      b.dir = a.x >= b.x ? 1 : -1;
    };
    // 被丢到好朋友身边就抱一个，丢到死对头身边就吵起来
    const rel = getRel(a, b);
    if (!b.act && (rel >= 25 || rel <= -20) && Math.random() < 0.7 && room.social(a, b, rel >= 25 ? (Math.random() < 0.6 ? 'hug' : 'highfive') : rel <= -40 && Math.random() < 0.5 ? 'fight' : 'argue')) return;
    if (a.type === b.type) {
      const [la, lb] = pick(SAME_LINES);
      face();
      say(a, la, 3000);
      setTimeout(() => alive(b) && say(b, lb, 3000), 2000);
      return;
    }
    const pair = CONVOS.filter((c) => c.who.length === 2 && !c.when && c.who.includes(a.type) && c.who.includes(b.type));
    if (pair.length && !b.act) {
      const convo = pick(pair);
      face();
      playConvo(convo, convo.who[0] === a.type ? [a, b] : [b, a], 300);
      return;
    }
    face();
    say(a, fill(pick(BUMP_LINES.a), { nick: cb.nick }), 3000);
    setTimeout(() => alive(b) && say(b, fill(pick(BUMP_LINES.b), { nick: ca.nick }), 3000, !b.act), 2000);
  }

  // 被提起来
  function grabbed(e) {
    say(e, pick(GRAB_LINES[e.type] || GRAB_LINES.default), 2500, false);
  }

  // 松手的一瞬间：放在了椅子、书桌、芯片、相框上，或者被甩出去
  function released(ctx) {
    const { e, kind } = ctx;
    if (DROP_LINES[kind] && !['occupied', 'bug', 'chip'].includes(kind)) return say(e, pick(DROP_LINES[kind]), 2800, false);
    if (kind === 'chip') return say(e, pick(ctx.cool ? DROP_LINES.chipCool : DROP_LINES.chip), 2800, false);
    if (kind === 'bug') return say(e, pick(DROP_LINES.bug), 2800, false);
    if (kind === 'occupied') {
      say(e, pick(DROP_LINES.occupied.a), 2800, false);
      setTimeout(() => alive(ctx.other) && say(ctx.other, pick(DROP_LINES.occupied.b), 2800, false), 1600);
      return;
    }
    if (kind === 'portrait') {
      const self = ctx.of.id === e.type;
      return say(e, fill(pick(self ? DROP_LINES.portraitSelf : DROP_LINES.portraitOther), { nick: ctx.of.nick }), 3000, false);
    }
    if (ctx.thrown) say(e, pick(THROW_LINES), 2000, false);
  }

  // 落地之后：身边有人就聊，摔重了喊疼，晚上/冬天/夏天被丢在外面会抱怨
  function landed(e, { fallH, bounced, partner, out, splash }) {
    if (splash) return say(e, pick(DROP_LINES.splash), 2800);
    if (partner) return bump(e, partner);
    if (bounced || fallH > 30) return say(e, pick(Math.random() < 0.6 ? LAND_LINES.ouch : LAND_LINES.fun), 2500);
    if (out) {
      const { season, dark } = room.now();
      if (dark > 0.6) return say(e, pick(DROP_LINES.nightOut), 3000);
      if (season === 'winter') return say(e, pick(DROP_LINES.winterOut), 3000);
      if (season === 'summer' && Math.random() < 0.5) return say(e, pick(DROP_LINES.summerOut), 2500);
    }
  }

  // 有人在打字时，旁边的凑过来搭话
  function typingBanter() {
    const typist = room.typist();
    if (!typist || bubbles.length >= 2) return false;
    const other = randomEntity((e) => !e.out && free(e) && e !== typist);
    if (!other) return false;
    other.tx = typist.x + (other.x >= typist.x ? 14 : -14);
    other.ty = Math.min(typist.y + 4, room.floorBottom());
    other.state = 'walk';
    const walkMs = Math.min(5000, (Math.hypot(other.tx - other.x, other.ty - other.y) / other.speed) * 1000 + 300);
    setTimeout(() => {
      if (!alive(other) || room.typist() !== typist) return;
      other.dir = typist.x >= other.x ? 1 : -1;
      say(other, pick(TYPING_TALK.ask), 2800);
      setTimeout(() => alive(typist) && say(typist, pick(TYPING_TALK.reply), 2600, false), 2200);
    }, walkMs);
    return true;
  }

  function position() {
    const s = room.cssScale();
    const roomW = $('#fx').clientWidth;
    for (const b of bubbles) {
      const spr = getSprite(b.e.type);
      const x = b.e.x * s;
      const y = (b.e.y - spr.height - b.e.drop) * s - 6;
      const w = b.node.offsetWidth;
      const left = Math.max(w / 2 + 2, Math.min(roomW - w / 2 - 2, x));
      b.node.style.left = left + 'px';
      b.node.style.top = y + 'px';
      b.node.style.setProperty('--tail', `${w / 2 + (x - left) - 4}px`);
    }
  }

  function update(now) {
    for (const b of [...bubbles]) {
      if (now > b.until || !alive(b.e)) remove(b);
    }
    if (now > nextChat) {
      nextChat = now + 5000 + Math.random() * 7000;
      if (!(Math.random() < 0.3 && typingBanter())) {
        const e = bubbles.length < 2 && randomEntity();
        if (e) say(e, pick(LINES[e.type].idle));
      }
    }
    if (now > nextDuo) {
      nextDuo = now + 18000 + Math.random() * 17000;
      startConvo();
    }
    position();
  }

  function stepped(e, out) {
    if (Math.random() > 0.35 || bubbles.length >= 2 || e.drop > 0) return;
    const { season, dark } = room.now();
    const lines = out ? (dark > 0.6 ? OUTDOOR_LINES.night : OUTDOOR_LINES[season]) : OUTDOOR_LINES.home;
    say(e, pick(lines), 2500, false);
  }

  return {
    update,
    stepped,
    grabbed,
    released,
    landed,
    struggle: (e) => say(e, pick(HELD_LINES), 2500, false),
    sayTo: (e, text) => say(e, text, 3000, false),
    // 两个人一来一回各说一句
    pair: (a, b, [la, lb]) => {
      say(a, fill(la), 2800, false);
      setTimeout(() => alive(b) && say(b, fill(lb), 2800, false), 1500);
    },
    gameOver: (a, b) => {
      const [win, lose] = Math.random() < 0.5 ? [a, b] : [b, a];
      addRel(a, b, Math.random() < 0.7 ? 1 : -2);
      say(win, pick(ACTIVITY_LINES.gameWin), 2800, false);
      setTimeout(() => alive(lose) && say(lose, pick(ACTIVITY_LINES.gameLose), 2800, false), 1200);
    },
    poked: (e) => say(e, pick(LINES[e.type].click), 2500),
    // 让某种角色过一会儿说一句话
    say: (id, text, delay = 0) => setTimeout(() => say(room.list().find((x) => x.type === id && x.drop === 0), text, 3500, false), delay),
    levelUp: (id) => {
      const e = room.list().find((x) => x.type === id && x.drop === 0);
      say(e, pick(LEVELUP_LINES[id] || LEVELUP_LINES.default), 3500, false);
      // 过一会儿别的 AI 来起哄
      setTimeout(() => {
        const fan = randomEntity((x) => x.type !== id);
        const c = CHARACTERS.find((x) => x.id === id);
        if (fan) say(fan, fill(pick(LEVELUP_REACT), { who: c.nick, ver: versionName(id) }), 3000, false);
      }, 2200);
    },
    activity: (e, kind) => {
      if (Math.random() > 0.45 || bubbles.length >= 2) return;
      const { season, dark } = room.now();
      let lines;
      if (kind === 'eat') lines = [...ACTIVITY_LINES.eat, ...EAT_LINES[season]];
      else if (kind === 'camp') lines = dark > 0.25 ? ACTIVITY_LINES.camp : ACTIVITY_LINES.campDay;
      else if (kind === 'fish' && season === 'winter') lines = ACTIVITY_LINES.fishWinter;
      else if (kind === 'bath') lines = [...ACTIVITY_LINES.bath, ...(season === 'winter' ? ACTIVITY_LINES.bathWinter : []), ...(dark > 0.6 ? ACTIVITY_LINES.bathNight : [])];
      else if (ACTIVITY_LINES[kind] && kind !== 'sit') lines = ACTIVITY_LINES[kind];
      else lines = dark > 0.6 ? ACTIVITY_LINES.sleepy : ACTIVITY_LINES.sit;
      say(e, pick(lines), 2500, false);
    },
    hello: (id) => setTimeout(() => say(room.list().find((e) => e.type === id), LINES[id].hello, 4000), 700),
    event: (kind) => {
      const e = randomEntity();
      if (e) say(e, pick(EVENT_LINES[kind]), 2500);
    },
  };
})();
room.setOnBug(() => talk.event('bug'));
