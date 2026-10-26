'use strict';
// 核心：存档、数值、升级数据。场景在 scene.js，界面在 ui.js

const SAVE_KEY = 'aiPixelFarm.v1';
const COST_GROWTH = 1.15;
const OFFLINE_RATE = 0.5;
const OFFLINE_CAP = 8 * 3600;

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- 模型迭代 ----------
// 每个 AI 可以一代代升级模型，每升一级产出 ×2，费用 ×10（以前是 ×3 / ×7，满级 ×2187 太膨胀了）
const LEVEL_MUL = 2;
const LEVEL_COST_BASE = 300;
const LEVEL_COST_GROWTH = 10;
const MODEL_VERSIONS = {
  claude: ['Claude 1', 'Claude 2', 'Claude 3 Haiku', 'Claude 3.5 Sonnet', 'Claude 4 Sonnet', 'Claude 4.5 Opus', 'Claude Sonnet 5.5', 'Claude Opus 5.5'],
  deepseek: ['DeepSeek V1', 'DeepSeek Coder', 'DeepSeek V2', 'DeepSeek V2.5', 'DeepSeek V3', 'DeepSeek R1', 'DeepSeek V3.2', 'DeepSeek V4'],
  llama: ['LLaMA', 'Llama 2', 'Code Llama', 'Llama 3', 'Llama 3.1 405B', 'Llama 3.3', 'Llama 4 Scout', 'Llama 4 Behemoth'],
  gemini: ['Bard', 'Gemini 1.0', 'Gemini 1.5 Pro', 'Gemini 2.0 Flash', 'Gemini 2.5 Pro', 'Gemini 3 Pro', 'Gemini 3 Ultra', 'Gemini 4'],
  gpt: ['GPT-1', 'GPT-2', 'GPT-3', 'GPT-3.5', 'GPT-4', 'GPT-4o', 'o3', 'GPT-5'],
  hf: ['Transformers', 'Datasets', 'Spaces', 'BLOOM', 'StarCoder', 'Zephyr', 'SmolLM', 'Open-R1'],
  mistral: ['Mistral 7B', 'Mixtral 8x7B', 'Mistral Large', 'Codestral', 'Mistral Large 2', 'Mistral Medium 3', 'Magistral', 'Mistral Large 3'],
  qwen: ['Qwen', 'Qwen 1.5', 'Qwen 2', 'Qwen 2.5', 'QwQ', 'Qwen 2.5 Max', 'Qwen 3', 'Qwen 3 Max'],
  grok: ['Grok 1', 'Grok 1.5', 'Grok 2', 'Grok 3', 'Grok 3 Think', 'Grok 4', 'Grok 4 Heavy', 'Grok 5'],
  kimi: ['Kimi', 'Kimi 长文本', 'Kimi k1.5', 'Kimi k2', 'Kimi k2 Thinking', 'Kimi k3', 'Kimi 研究员', 'Kimi k4'],
  muse: ['Avocado 内测', 'Muse Spark', 'Muse Spark 思考', 'Muse Spark 沉思', 'Muse 开源版', 'Muse Flame', 'Muse Nova', '个人超级智能'],
  clawd: ['Clawd 预览版', 'Clawd 1.0', 'Clawd + 子代理', 'Clawd + Hooks', 'Clawd + MCP', 'Clawd + 插件', 'Clawd + 后台任务', 'Clawd 2.0'],
};
// 有解锁条件的角色：all 是集齐其他所有角色（压轴的 Clawd），char/level 是某个角色升到几级
const othersMissing = (c) => CHARACTERS.filter((x) => x.id !== c.id && !owned(x.id)).length;
const requirementMet = (c) => !c.requires || (c.requires.all ? othersMissing(c) === 0 : level(c.requires.char) >= c.requires.level);
const level = (id) => S.levels[id] || 1;
const maxLevel = (id) => MODEL_VERSIONS[id].length;
const versionName = (id) => MODEL_VERSIONS[id][level(id) - 1];
const levelCost = (c) => c.base * LEVEL_COST_BASE * Math.pow(LEVEL_COST_GROWTH, level(c.id) - 1);

// ---------- 伙伴：好感度 & 每个角色的统计 ----------
// 好感每 25 点一颗心，最多 10 颗；每颗心让这个角色的产出 +2%
const AFF_PER_HEART = 25;
const MAX_HEARTS = 10;
const AFF_BONUS_PER_HEART = 0.02;
const HEART_TITLES = ['初次见面', '认识了', '认识了', '熟悉', '熟悉', '好朋友', '好朋友', '挚友', '挚友', '形影不离', '最爱 🧡'];
// 每一只都有自己的名字、好感和统计：S.pets[种类][第几只]，第几只对应场景里的那只（最多 3 只）
const MAX_SHOWN = 3;
function petOf(type, slot = 0) {
  if (!S.pets[type]) S.pets[type] = [];
  const list = S.pets[type];
  const c = CHARACTERS.find((x) => x.id === type);
  while (list.length <= slot) list.push({ name: list.length ? `${c.nick}${list.length + 1}号` : c.nick, aff: 0 });
  return list[slot];
}
// x 可以是场景里的角色（按它是第几只），也可以是种类名（算第 1 只）
const petFor = (x) => (typeof x === 'string' ? petOf(x, 0) : petOf(x.type, x.slot || 0));
function bumpStat(x, key, n = 1) {
  const p = petFor(x);
  p[key] = (p[key] || 0) + n;
}
function addAff(x, n) {
  const p = petFor(x);
  p.aff = Math.max(0, Math.min(AFF_PER_HEART * MAX_HEARTS, (p.aff || 0) + n));
}
const heartsOf = (pet) => Math.min(MAX_HEARTS, Math.floor((pet.aff || 0) / AFF_PER_HEART));
// 一种角色的产出加成：取场上那几只的平均心数
function hearts(type) {
  const n = Math.max(1, Math.min(owned(type), MAX_SHOWN));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += heartsOf(petOf(type, i));
  return sum / n;
}

// ---------- 关系网：每两只之间一个关系值（-100 死对头 ~ 100 挚友） ----------
// 有些搭配天生就合得来/合不来，第一次见面时从这里起步
const INNATE_REL = {
  'claude|clawd': 40, 'hf|llama': 25, 'deepseek|qwen': 20, 'kimi|qwen': 15, 'llama|mistral': 15,
  'claude|kimi': 10, 'claude|gpt': 5, 'gemini|gpt': -10, 'gpt|grok': -15, 'gemini|grok': -15, 'claude|grok': -5,
  'llama|muse': -12, 'hf|muse': 5, 'gpt|muse': -5, 'gemini|muse': -8, 'claude|muse': 10, 'clawd|muse': 8, 'deepseek|gpt': -8,
};
const REL_TITLES = [[60, '挚友', '#ff8fb1'], [30, '好朋友', '#7ef59a'], [10, '朋友', '#a8e8b8'], [-10, '普通', '#9b92c0'], [-30, '不对付', '#ffb070'], [-101, '死对头', '#ff5d5d']];
const petKey = (x) => `${x.type}:${x.slot || 0}`;
const relKey = (a, b) => [petKey(a), petKey(b)].sort().join('|');
function getRel(a, b) {
  const k = relKey(a, b);
  if (S.rel[k] === undefined) {
    const types = [a.type, b.type].sort().join('|');
    S.rel[k] = INNATE_REL[types] ?? (a.type === b.type ? 15 : 0);
  }
  return S.rel[k];
}
// 关系跨过"挚友 / 死对头 / 和好"这些坎时通知界面（弹个提示）
let onRelMilestone = () => {};
function addRel(a, b, n) {
  if (petKey(a) === petKey(b)) return;
  const old = getRel(a, b);
  const v = Math.max(-100, Math.min(100, old + n));
  S.rel[relKey(a, b)] = v;
  if (old < 60 && v >= 60) onRelMilestone(a, b, 'bff');
  else if (old > -30 && v <= -30) onRelMilestone(a, b, 'enemy');
  else if (old < 0 && v >= 10) onRelMilestone(a, b, 'makeup');
}
const relTitle = (v) => REL_TITLES.find(([min]) => v >= min);

// ---------- 升级 ----------
const TIERS = [
  { need: 1, costMul: 10, name: '多加几张卡' },
  { need: 5, costMul: 50, name: 'RLHF 调教' },
  { need: 25, costMul: 500, name: '超长上下文' },
  { need: 50, costMul: 5e4, name: '多模态觉醒' },
  { need: 100, costMul: 5e6, name: '通往 AGI' },
];

const UPGRADES = [];
CHARACTERS.forEach((c) => TIERS.forEach((t, i) => UPGRADES.push({
  id: `${c.id}_${i}`, kind: 'char', icon: c.id,
  name: `${c.nick}·${t.name}`, desc: `${c.name} 的产出 ×2`,
  cost: c.base * t.costMul,
  unlocked: () => owned(c.id) >= t.need,
})));
UPGRADES.push(
  { id: 'click_0', kind: 'click', icon: 'chip', name: '机械键盘', desc: '点击产出 ×2', cost: 100, mul: 2, unlocked: () => S.clicks >= 10 },
  { id: 'click_1', kind: 'click', icon: 'chip', name: '人体工学椅', desc: '点击产出 ×2', cost: 600, mul: 2, unlocked: () => S.clicks >= 60 },
  { id: 'click_2', kind: 'click', icon: 'chip', name: '提示词工程', desc: '每次点击额外获得 1% 每秒产出', cost: 1e4, pct: 0.01, unlocked: () => S.clicks >= 150 },
  { id: 'click_3', kind: 'click', icon: 'chip', name: '思维链', desc: '每次点击额外获得 2% 每秒产出', cost: 1e6, pct: 0.02, unlocked: () => S.clicks >= 300 },
  { id: 'click_4', kind: 'click', icon: 'chip', name: 'Vibe Coding', desc: '每次点击额外获得 3% 每秒产出', cost: 1e8, pct: 0.03, unlocked: () => S.clicks >= 600 },
  { id: 'global_0', kind: 'global', icon: 'globe', name: '开源社区', desc: '所有角色产出 +10%', cost: 5e4, mul: 1.1, unlocked: () => S.total >= 2e4 },
  { id: 'global_1', kind: 'global', icon: 'globe', name: '自建数据中心', desc: '所有角色产出 +15%', cost: 5e6, mul: 1.15, unlocked: () => S.total >= 2e6 },
  { id: 'global_2', kind: 'global', icon: 'globe', name: '隔壁核电站', desc: '所有角色产出 +20%', cost: 5e8, mul: 1.2, unlocked: () => S.total >= 2e8 },
  { id: 'global_3', kind: 'global', icon: 'globe', name: '戴森球', desc: '所有角色产出 +50%', cost: 5e11, mul: 1.5, unlocked: () => S.total >= 2e11 },
  { id: 'bug_0', kind: 'bug', icon: 'bug', name: 'Debug 专家', desc: 'Bug 出现得更频繁，奖励 ×2', cost: 2e4, unlocked: () => S.bugs >= 1 },
);

// ---------- 存档 ----------
// 原有家具和院子设施（需要买才会出现的那些）
const BUILTIN_FURN = ['armchair', 'piano', 'rug', 'cattree', 'sofa', 'shelf', 'fireplace', 'beanbag', 'lamp', 'fridge', 'counter', 'bed', 'tv', 'table',
  'swing', 'tramp', 'garden', 'pond', 'camp', 'spring'];
const defaultState = () => ({
  tokens: 0, total: 0, clicks: 0, clickEarned: 0, bugs: 0,
  owned: {}, levels: {}, pets: {}, rel: {}, ups: [], playSec: 0, last: Date.now(),
  // 屋里能点的东西：两扇窗开没开、窗帘拉没拉、哪些灯关了、壁炉手动开关（只在当季有效）
  home: { winOpen: [false, false], curtainClosed: false, lampsOff: [], fire: null, tv: false },
  peak: 0,
  // 商城：背包里的礼物和配饰、买过的家具、增益的到期时间
  inv: {}, decor: {}, boost: { doubleUntil: 0 },
  // 装修：原有家具挪到的位置、自己摆出来的家具、收在仓库里的家具
  layout: {}, placed: [], store: {},
  stored: {},                          // 收进仓库的原有家具 { key: true }
  // 开局只有这几样原有家具，其余的都要在商城里用 Token 买（机柜和书桌一直都在）
  ownedFurn: { bed: true, armchair: true, garden: true },
  // 菜园 4 块地：stage 0 种子 → 1 发芽 → 2 长叶 → 3 成熟；wet 表示浇过水
  garden: { plots: Array.from({ length: 4 }, () => ({ stage: 0, grow: 0, wet: false })) },
  panelHidden: false,
  env: { season: 'auto', time: 'real', weather: 'random' },
});

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 老存档里家具本来就都在：全部算已拥有
      if (!parsed.ownedFurn) parsed.ownedFurn = Object.fromEntries(BUILTIN_FURN.map((k) => [k, true]));
      const s = Object.assign(defaultState(), parsed);
      s.env = Object.assign(defaultState().env, s.env);
      s.home = Object.assign(defaultState().home, s.home);
      s.boost = Object.assign(defaultState().boost, s.boost);
      // 旧存档的好感/统计是按种类记的：搬给每种角色的第 1 只
      if (s.stats && !Object.keys(s.pets).length) {
        for (const [type, st] of Object.entries(s.stats)) {
          const c = CHARACTERS.find((x) => x.id === type);
          if (c) s.pets[type] = [{ name: c.nick, ...st }];
        }
        delete s.stats;
      }
      return s;
    }
  } catch {}
  return defaultState();
}

function save() {
  S.ups = [...upSet];
  S.last = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  } catch {}
}

let S = load();
let upSet = new Set(S.ups);
let buff = null; // { name, mul, until }
let bulk = 1;

// ---------- 数值 ----------
const owned = (id) => S.owned[id] || 0;
const has = (id) => upSet.has(id);

function charMul(id) {
  return TIERS.reduce((m, _, i) => (has(`${id}_${i}`) ? m * 2 : m), 1);
}
function globalMul() {
  return UPGRADES.reduce((m, u) => (u.kind === 'global' && has(u.id) ? m * u.mul : m), 1);
}
function unitTps(c) {
  return c.tps * charMul(c.id) * globalMul() * Math.pow(LEVEL_MUL, level(c.id) - 1) * (1 + AFF_BONUS_PER_HEART * hearts(c.id));
}
function baseTps() {
  return CHARACTERS.reduce((s, c) => s + owned(c.id) * unitTps(c), 0);
}
const buffMul = () => (buff ? buff.mul : 1);
const boostMul = () => (S.boost.doubleUntil > Date.now() ? 2 : 1);
const tps = () => baseTps() * buffMul() * boostMul();
// 商城价格：几秒的产出，至少 price × 20
const shopPrice = (item) => Math.max(item.price * 20, Math.round(baseTps() * item.price));

function clickValue() {
  let v = 1, pct = 0;
  UPGRADES.forEach((u) => {
    if (u.kind !== 'click' || !has(u.id)) return;
    if (u.mul) v *= u.mul;
    if (u.pct) pct += u.pct;
  });
  return (v + baseTps() * pct) * buffMul();
}

function costOf(c, n) {
  const first = c.base * Math.pow(COST_GROWTH, owned(c.id));
  return first * (Math.pow(COST_GROWTH, n) - 1) / (COST_GROWTH - 1);
}
function maxAffordable(c) {
  const first = c.base * Math.pow(COST_GROWTH, owned(c.id));
  return Math.floor(Math.log(S.tokens * (COST_GROWTH - 1) / first + 1) / Math.log(COST_GROWTH));
}
const bulkCount = (c) => (bulk === 'max' ? Math.max(1, maxAffordable(c)) : bulk);

function earn(x) {
  S.tokens += x;
  S.total += x;
}

// ---------- 数字格式 ----------
const UNITS = [[1e16, '亿亿'], [1e12, '万亿'], [1e8, '亿'], [1e4, '万']];
function fmt(n, decimals = 0) {
  if (n >= 1e20) return n.toExponential(2).replace('+', '');
  for (const [v, u] of UNITS) {
    if (n >= v) {
      const x = n / v;
      return x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2) + u;
    }
  }
  if (decimals && n < 100 && n % 1) return n.toFixed(decimals);
  return Math.floor(n).toLocaleString('en-US');
}
function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h} 小时 ${m} 分`;
  if (m) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

// ---------- 提示 & 飘字 ----------
let toastTimer;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function floatText(text, cssX, cssY, color) {
  const f = el('div', 'float', text);
  f.style.left = cssX + 'px';
  f.style.top = cssY + 'px';
  if (color) f.style.color = color;
  $('#fx').appendChild(f);
  setTimeout(() => f.remove(), 900);
}
