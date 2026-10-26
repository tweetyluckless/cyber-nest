'use strict';
// 像素画数据：每个字符对应 colors 里的一个颜色，'.' 是透明。
// 渲染时会自动裁掉空白并描一圈深色轮廓，所以这里不用画边框。

const CHARACTERS = [
  {
    id: 'claude', name: 'Claude', nick: '小橘',
    desc: '认真想清楚每一个 Token，偶尔写首小诗。',
    base: 15, tps: 0.1,
    colors: { O: '#D97757', o: '#F0A58A', k: '#2b1a12', p: '#ffc2b0' },
    art: [
      '.......O........',
      '..O....O....O...',
      '...O...O...O....',
      '....O..O..O.....',
      '.....OOOOO......',
      '....OoOOOOO.....',
      'OOOOOkOOOkOOOOOO',
      '....OOOOOOO.....',
      '....OpOOOpO.....',
      '.....OOOOO......',
      '....O..O..O.....',
      '...O...O...O....',
      '..O....O....O...',
      '.......O........',
    ],
  },
  {
    id: 'deepseek', name: 'DeepSeek', nick: '鲸鲸',
    desc: '从深海游上来的小鲸鱼，便宜又能打。',
    base: 100, tps: 1,
    colors: { B: '#4D6BFE', b: '#A9B8FF', k: '#0f1640', w: '#ffffff' },
    art: [
      '...........B..B.',
      '............BB..',
      '............B...',
      '..BBBBBBB...B...',
      '.BBBBBBBBB.BB...',
      'BBwBBBBBBBBBB...',
      'BBkBBBBBBBBBB...',
      'BBBBBBBBBBBB....',
      'BbbbbbbbBBBB....',
      '.bbbbbbbbBB.....',
      '..bbbbbbb.......',
    ],
  },
  {
    id: 'llama', name: 'Llama', nick: '羊驼',
    desc: '开源草原上的羊驼，到处都有它的亲戚。',
    base: 1100, tps: 8,
    colors: { W: '#F4EAD5', w: '#D6C4A0', k: '#2a2118', n: '#D99A7A' },
    art: [
      '.W..W...........',
      '.WW.WW..........',
      '.WWWWW..........',
      '.WkWkW..........',
      '.WWnWW..........',
      '..WWW...........',
      '..WWW...........',
      '..WWWWWWWWW.....',
      '.WWWWWWWWWWW....',
      '.WwWWWWWWWwW....',
      '..WwwwwwwwW.....',
      '..W.W...W.W.....',
      '..W.W...W.W.....',
      '..w.w...w.w.....',
    ],
  },
  {
    id: 'gemini', name: 'Gemini', nick: '闪闪',
    desc: '一闪一闪的星星，图片视频都看得懂。',
    base: 12000, tps: 47,
    // 新版 Gemini 四角星：左黄、上红、右蓝、下绿（字母按位置：B 上、R 左、G 右、Y 下）。左右不对称，走路时不镜像翻转
    noFlip: true,
    colors: { B: '#EA4335', b: '#FF7A6A', R: '#FBBC04', G: '#4285F4', Y: '#34A853', C: '#8A7FD8', k: '#10142a' },
    art: [
      '.......B.......',
      '.......B.......',
      '......BbB......',
      '......BBB......',
      '.....BBBBB.....',
      '....RRBBBGG....',
      '..RRRRkCkGGGG..',
      'RRRRRRCCCGGGGGG',
      '..RRRRCCCGGGG..',
      '....RRYYYGG....',
      '.....YYYYY.....',
      '......YYY......',
      '......YYY......',
      '.......Y.......',
      '.......Y.......',
    ],
  },
  {
    id: 'gpt', name: 'ChatGPT', nick: '结结',
    desc: '绕成一朵花的结，最早出名的那一位。',
    base: 130000, tps: 260,
    // OpenAI 的花结标志：六个圆角环一圈圈扣在一起，黑色的线、白色的底（照着标志图缩成像素的），中间的六边形空洞里是小脸
    colors: { K: '#1A1A1E', w: '#FFFFFF', p: '#FF9DB0' },
    art: [
      '.....KKKK........',
      '....KKwwwKKKKK...',
      '....KwwwKKwwwKK..',
      '...KwwKKwwwwwwK..',
      '..KKwwKwwwKKKwwK.',
      '.KwKwwKwKKwwKKKK.',
      'KKwKwwKKwKKwwwKK.',
      'KwwKwwKwwwKKKwwKK',
      'KKwKKwKpwpwKKKwwK',
      '.KwwKKKwwwKKwKwwK',
      '..KwwwKKwKKKwKwwK',
      '..KKKwwKKKwKwKwKK',
      '..KwwKKKwwKKwKKK.',
      '..KwwwwwwKKwwK...',
      '...KwwwKKKwwwK...',
      '....KKKKKwwKK....',
      '........KKKK.....',
    ],
  },
  {
    id: 'hf', name: 'Hugging Face', nick: '抱抱脸',
    desc: '给每个开源模型一个大大的拥抱。',
    base: 1.4e6, tps: 1400,
    colors: { Y: '#FFD21E', y: '#FF9D00', k: '#3a2a00', r: '#FF5D5D' },
    art: [
      '....YYYYYYY.....',
      '...YYYYYYYYY....',
      '..YYYYYYYYYYY...',
      '..YYkYYYYYkYY...',
      '..YYkYYYYYkYY...',
      '..YYYYYYYYYYY...',
      'yYYYkrrrrrkYYYy.',
      'yy.YYkrrrkYYY.yy',
      '...YYYkkkYYY....',
      '....YYYYYYY.....',
    ],
  },
  {
    id: 'mistral', name: 'Mistral', nick: '小风',
    desc: '从法国吹来的一阵像素风。',
    base: 3e7, tps: 7800,
    colors: { Y: '#FFD800', A: '#FFAF00', O: '#FF8205', R: '#FA500F', D: '#E10500', k: '#2a0a00' },
    art: [
      'YY......YY',
      'YY......YY',
      'AAAA..AAAA',
      'AAAA..AAAA',
      'OOOOOOOOOO',
      'OOkOOOOkOO',
      'RR..RR..RR',
      'RR..RR..RR',
      'DD..DD..DD',
      'DD..DD..DD',
    ],
  },
  {
    id: 'qwen', name: 'Qwen', nick: '千问',
    desc: '千问千答，问什么都接得住。',
    base: 7.4e8, tps: 44000,
    colors: { Q: '#615CED', q: '#A39FFF', k: '#160f4a', m: '#ff8fb1' },
    art: [
      '....QQQQQQ......',
      '...QQQQQQQQ.....',
      '..QQqqqqqqQQ....',
      '..QQqkqqkqQQ....',
      '..QQqqqqqqQQ....',
      '..QQqqmmqqQQ....',
      '...QQQQQQQQ.....',
      '....QQQQQQ.QQ...',
      '............QQ..',
    ],
  },
  {
    id: 'grok', name: 'Grok', nick: '斜杠',
    desc: '嘴有点毒，但跑得是真快。',
    base: 1.7e10, tps: 260000,
    colors: { K: '#26262b', W: '#EDEDED', k: '#111' },
    art: [
      '.....WWWWW......',
      '...WWKKKKKWW....',
      '..WKKKKKKKKWW...',
      '.WKKKKKKKKKWKW..',
      '.WKKWKKKKWKKKW..',
      '.WKKKKKKWKKKKW..',
      '.WKKKKKWKKKKKW..',
      '.WKKKKWKKKKKKW..',
      '..WKWKKKKKKKW...',
      '...WWKKKKKWW....',
      '.....WWWWW......',
    ],
  },
  {
    id: 'kimi', name: 'Kimi', nick: '月月',
    desc: '在月亮上一口气读完了一整本书。',
    base: 3.8e11, tps: 1.6e6,
    colors: { M: '#FFE27A', m: '#E8B84A', k: '#3a2a00', p: '#ffb3a0' },
    art: [
      '.....MMMM.......',
      '...MMMM.........',
      '..MMMM..........',
      '.MMMM...........',
      '.MMMk...........',
      'MMMM............',
      'MMMM............',
      'MMMMp...........',
      'mMMMM...........',
      '.mMMMM......M...',
      '..mMMMMM..MMM...',
      '...mmMMMMMMM....',
      '.....mmmmm......',
    ],
  },
  {
    // Meta 超级智能实验室 2026 年的新模型 Muse Spark：一簇蓝紫色的小火花
    id: 'muse', name: 'Muse', nick: '缪缪',
    desc: 'Meta 超级智能实验室的新星，羊驼的小师妹。',
    base: 8.4e12, tps: 1.1e7,
    colors: { P: '#8B5CF6', M: '#C4A5FF', B: '#0668E1', b: '#4C9BFF', w: '#FFFFFF', k: '#1A1240', p: '#FF9DC8' },
    art: [
      '......P........',
      '.....PP........',
      '.....PPP....P..',
      '....PPMP...PP..',
      '....PMMPP.PPP..',
      '...PPMMMPPPP...',
      '..PPMMMMMMPP...',
      '..PMMwwwwMMPP..',
      '.PPMwwwwwwMPP..',
      '.PbMwkwwkwMbP..',
      '.BbMwpwwpwMbB..',
      '.BBbMwwwwMbBB..',
      '..BBbbMMbbBB...',
      '...BBBBBBBB....',
      '.....BBBB......',
    ],
  },
  {
    // Claude Code 的像素小螃蟹，照着参考图按格子 1:1 画的。压轴角色：集齐其他所有伙伴才登场
    id: 'clawd', name: 'Clawd', nick: '小钳',
    desc: '住在终端里的像素小螃蟹，最爱写代码。压轴登场！',
    base: 1.8e14, tps: 7e7,
    requires: { all: true },
    colors: { O: '#DD876D', k: '#000000' },
    art: [
      '..OOOOOOOOOOO..',
      '..OOOOOOOOOOO..',
      '..OOkOOOOOkOO..',
      'OOOOkOOOOOkOOOO',
      'OOOOOOOOOOOOOOO',
      '..OOOOOOOOOOO..',
      '..OOOOOOOOOOO..',
      '...O.O...O.O...',
    ],
  },
];

const ICONS = {
  chip: {
    colors: { p: '#9aa0b5', B: '#6B6F80', D: '#2C2F3A', C: '#2FBFA7', L: '#7FF5DF', w: '#E6FFFA' },
    art: [
      '..p.p.p.p.p.p..',
      '.BBBBBBBBBBBBB.',
      'pBDDDDDDDDDDDBp',
      '.BDDCCCCCCCDDB.',
      'pBDCCLLLLLCCDBp',
      '.BDCLLwwwLLCDB.',
      'pBDCLwwwwwLCDBp',
      '.BDCLwwwwwLCDB.',
      'pBDCLLwwwLLCDBp',
      '.BDCCLLLLLCCDB.',
      'pBDDCCCCCCCDDBp',
      '.BDDDDDDDDDDDB.',
      'pBBBBBBBBBBBBBp',
      '..p.p.p.p.p.p..',
    ],
  },
  bug: {
    colors: { G: '#5BD36B', g: '#C8FFCF', k: '#1B3A1F' },
    art: [
      '..k....k..',
      '...k..k...',
      '..GGGGGG..',
      '.GgGGGGgG.',
      'kGGGGGGGGk',
      '.GGGkkGGG.',
      'kGGGGGGGGk',
      '.GGGGGGGG.',
      'k.G....G.k',
    ],
  },
  heart: {
    colors: { R: '#FF5D7A', r: '#FFB3C1' },
    art: [
      '.RR.RR.',
      'RrRRRRR',
      'RRRRRRR',
      '.RRRRR.',
      '..RRR..',
      '...R...',
    ],
  },
  crown: {
    colors: { y: '#FFD23A', o: '#E0A020', r: '#FF5D7A', b: '#7AB0FF' },
    art: [
      'y..y..y',
      'yy.y.yy',
      'yyyyyyy',
      'oryoyro',
    ],
  },
  // ---- 配饰（g_ 开头），按部位画在角色身上 ----
  g_towel: { colors: { w: '#FFFFFF', b: '#9AD0F0' }, art: ['.wwwww.', 'wbwbwbw', 'wwwwwww'] },
  g_beanie: { colors: { r: '#D84A4A', w: '#F4EFE4' }, art: ['...w...', '.rrrrr.', 'rrrrrrr', 'wwwwwww'] },
  g_bow: { colors: { p: '#FF8FB1', d: '#D8608A' }, art: ['pp.pp', 'ppdpp', 'pp.pp'] },
  g_party: { colors: { y: '#FFD84A', b: '#5D9DFF', r: '#FF5D7A' }, art: ['..r..', '..y..', '.byb.', '.yby.', 'bybyb'] },
  g_sunglasses: { colors: { k: '#16161C', s: '#5A5A6A' }, art: ['kkk.kkk', 'ksk.kks', 'kkk.kkk'] },
  g_glasses: { colors: { o: '#8A6A3A' }, art: ['ooo.ooo', 'o.ooo.o', 'ooo.ooo'] },
  g_scarf: { colors: { r: '#D83A3A', w: '#F4EFE4' }, art: ['rrrrrrrrr', 'rwrwrwrwr', '......rr.', '......rr.'] },
  g_bowtie: { colors: { k: '#2A2A34', r: '#C23B55' }, art: ['rr.rr', 'rrkrr', 'rr.rr'] },
  anger: { colors: { r: '#FF3A4A' }, art: ['.r.r.', 'rr.rr', '.....', 'rr.rr', '.r.r.'] },
  star: { colors: { y: '#FFE14A' }, art: ['.y.', 'yyy', '.y.'] },
  fist: { colors: { s: '#F0D0A8' }, art: ['sss', 'sss'] },
  note: {
    colors: { n: '#FFE08A' },
    art: [
      '..nn',
      '..n.',
      '..n.',
      'nnn.',
      'nn..',
    ],
  },
  fish: {
    colors: { b: '#7AB0E0', l: '#B8D8F0', k: '#1A2A40' },
    art: [
      '.bbb..b',
      'bklbbbb',
      '.bbb..b',
    ],
  },
  arrow: {
    colors: { y: '#FFCF4A', o: '#E0A020' },
    art: [
      '.yyy.',
      '.yyy.',
      'yyyyy',
      '.yoy.',
      '..o..',
    ],
  },
  zzz: {
    colors: { z: '#cfe0ff' },
    art: [
      'zzz',
      '..z',
      '.z.',
      'zzz',
    ],
  },
  globe: {
    colors: { B: '#3D7BE0', G: '#4CC26B', w: '#D8F0FF' },
    art: [
      '...BBBB...',
      '.BBGGBBBB.',
      'BBGGGBBGBB',
      'BGGGBBBGGB',
      'BBGBBBGGGB',
      'BBBBBBGGBB',
      'BGGBBBBBBB',
      'BBGGGBBBwB',
      '.BBGGBBBB.',
      '...BBBB...',
    ],
  },
};

const OUTLINE = '#140f1f';
const spriteCache = new Map();

// 把像素画渲染成一张原尺寸 canvas（含 1px 轮廓），silhouette=true 时画成剪影
function getSprite(key, silhouette = false) {
  const cacheKey = key + (silhouette ? ':s' : '');
  if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey);
  const def = ICONS[key] || CHARACTERS.find((c) => c.id === key);
  const rows = def.art;
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }));
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const filled = (x, y) => {
    const r = rows[y + minY];
    const ch = r && r[x + minX];
    return x >= 0 && x < w && ch !== undefined && ch !== '.';
  };
  const c = document.createElement('canvas');
  c.width = w + 2;
  c.height = h + 2;
  const g = c.getContext('2d');
  g.fillStyle = OUTLINE;
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) {
        g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!filled(x, y)) continue;
      g.fillStyle = silhouette ? '#2a2342' : def.colors[rows[y + minY][x + minX]] || '#ff00ff';
      g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  spriteCache.set(cacheKey, c);
  return c;
}

// 列表里用的放大图标
function iconCanvas(key, size = 36, silhouette = false) {
  const spr = getSprite(key, silhouette);
  const scale = Math.max(1, Math.floor(size / Math.max(spr.width, spr.height)));
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const w = spr.width * scale, h = spr.height * scale;
  g.drawImage(spr, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
  return c;
}
