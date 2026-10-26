'use strict';
// 界面：购买、列表、环境设置、窗口按钮、主循环

// ---------- 行为 ----------
function clickChip(p) {
  const v = clickValue();
  earn(v);
  S.clicks++;
  S.clickEarned += v;
  floatText('+' + fmt(v, 1), p.cssX, p.cssY);
}

// helper：帮你抓到 Bug 的角色（自己点的时候为空）
function catchBug(p, helper) {
  S.bugs++;
  const bonusMul = has('bug_0') ? 2 : 1;
  const nick = helper && CHARACTERS.find((c) => c.id === helper.type).nick;
  const head = helper ? `${nick}帮你抓到一只 Bug！` : '抓到一只 Bug！';
  if (Math.random() < 0.5) {
    const v = (Math.min(S.tokens * 0.15, baseTps() * 900) + 13) * bonusMul;
    earn(v);
    floatText('+' + fmt(v), p.cssX, p.cssY, '#7ef59a');
    toast(`${head}修复赏金 +${fmt(v)} Token`);
  } else {
    const secs = 30 * bonusMul;
    buff = { name: '灵感爆发', mul: 7, until: Date.now() + secs * 1000 };
    floatText('灵感爆发!', p.cssX, p.cssY, '#7ef59a');
    if (!helper) talk.event('buff');
    toast(`${head}灵感爆发：${secs} 秒内产出 ×7`);
  }
  if (helper) {
    talk.say(helper.type, pick(EVENT_LINES.bugCaught));
    bumpStat(helper, 'bugs');
    addAff(helper, 3);
  }
  renderHeader();
}

// 收菜、钓鱼的奖励；e 是干活的角色（主人自己点的时候为空）
function giveReward(kind, e, pos) {
  let v = kind === 'harvest' ? baseTps() * 40 + clickValue() * 10 + 20 : baseTps() * 15 + clickValue() * 4 + 8;
  // 稻草人守着菜园，收菜多给一半
  if (kind === 'harvest' && S.decor.scarecrow) v *= 1.5;
  earn(v);
  floatText(`+${fmt(v)} ${kind === 'harvest' ? '🥕' : '🐟'}`, pos.cssX, pos.cssY, '#7ef59a');
  if (e) {
    bumpStat(e, kind === 'harvest' ? 'harvests' : 'fishes');
    addAff(e, 1);
    talk.say(e.type, pick(kind === 'harvest' ? EVENT_LINES.harvest : EVENT_LINES.fishCaught));
  }
  renderHeader();
}

function buyChar(c) {
  const n = bulkCount(c);
  const cost = costOf(c, n);
  if (S.tokens < cost || !requirementMet(c)) return;
  const first = owned(c.id) === 0;
  const finale = CHARACTERS.find((x) => x.requires?.all);
  const finaleBefore = finale && requirementMet(finale);
  S.tokens -= cost;
  S.owned[c.id] = owned(c.id) + n;
  room.sync();
  if (first) {
    toast(`${c.name}「${c.nick}」搬进了小窝！`);
    talk.hello(c.id);
    room.celebrate(c.id);
  }
  // 集齐了其他所有人：压轴角色解锁
  if (finale && !finaleBefore && requirementMet(finale) && !owned(finale.id)) {
    setTimeout(() => toast(`集齐全员！压轴角色 ${finale.name}「${finale.nick}」解锁了！`, 6000), 2500);
    talk.say('claude', '我有个住在终端里的小螃蟹朋友，想来小窝玩～', 5000);
  }
  flashRow(charRows[c.id].row);
  refreshUI();
}

// 卖一只退的钱 = 买最后那一只时的价格
const sellPrice = (c) => c.base * Math.pow(COST_GROWTH, owned(c.id) - 1);
function sellChar(c) {
  if (!owned(c.id)) return;
  const refund = sellPrice(c);
  S.tokens += refund;
  S.owned[c.id] = owned(c.id) - 1;
  room.sync();
  toast(`卖掉了 1 只 ${c.nick}，退回 ${fmt(refund)} Token`);
  refreshUI();
  save();
}

function upgradeModel(c) {
  if (!owned(c.id) || level(c.id) >= maxLevel(c.id)) return;
  const cost = levelCost(c);
  if (S.tokens < cost) return;
  S.tokens -= cost;
  S.levels[c.id] = level(c.id) + 1;
  const max = level(c.id) >= maxLevel(c.id);
  toast(`${c.nick} 升级到了 ${versionName(c.id)}！产出 ×${LEVEL_MUL}${max ? '，已经是最终形态 👑' : ''}`, 4000);
  room.levelUp(c.id);
  talk.levelUp(c.id);
  // 升级刚好满足了某个特殊角色的解锁条件
  for (const x of CHARACTERS) {
    if (x.requires?.char === c.id && x.requires.level === level(c.id) && !owned(x.id)) {
      setTimeout(() => toast(`解锁新角色：${x.name}「${x.nick}」！去角色列表里看看吧`, 5000), 4200);
    }
  }
  flashRow(charRows[c.id].row);
  refreshUI();
  save();
}

function buyUpgrade(u) {
  if (has(u.id) || S.tokens < u.cost) return;
  S.tokens -= u.cost;
  upSet.add(u.id);
  toast(`已购买「${u.name}」：${u.desc}`);
  refreshUI();
}

function flashRow(row) {
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}

// ---------- 角色列表 ----------
const charRows = {};

function buildCharList() {
  const box = $('#tab-chars');
  CHARACTERS.forEach((c) => {
    const row = el('div', 'row');
    const icon = iconCanvas(c.id, 32);
    const shadow = iconCanvas(c.id, 32, true);
    const info = el('div', 'info');
    const name = el('div', 'name');
    const desc = el('div', 'desc');
    const cost = el('div', 'cost');
    const side = el('div', 'side');
    const count = el('div', 'count');
    const lvBtn = el('button', 'lv-btn');
    lvBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      upgradeModel(c);
    });
    // 卖掉一只（不小心多买了）：按买最后那只的价格全额退
    const sellBtn = el('button', 'sell-btn', '卖');
    sellBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      sellChar(c);
    });
    const top = el('div', 'side-top');
    top.append(sellBtn, count);
    info.append(name, desc, cost);
    side.append(top, lvBtn);
    row.append(icon, shadow, info, side);
    row.title = c.desc;
    row.addEventListener('click', () => buyChar(c));
    box.appendChild(row);
    charRows[c.id] = { row, icon, shadow, name, desc, cost, count, lvBtn, sellBtn };
  });
}

function renderCharList() {
  let shownLocked = false;
  CHARACTERS.forEach((c, i) => {
    const r = charRows[c.id];
    let locked, hidden;
    if (c.requires) {
      // 特殊角色：买到前置角色后就露出剪影，满足等级条件才能买
      locked = !requirementMet(c) && !owned(c.id);
      // 压轴角色：集齐一半伙伴后先露出剪影
      hidden = !owned(c.id) && (c.requires.all ? othersMissing(c) > (CHARACTERS.length - 1) / 2 : !owned(c.requires.char));
    } else {
      locked = !(i === 0 || owned(c.id) > 0 || S.total >= c.base * 0.6);
      hidden = locked && shownLocked;
      if (locked) shownLocked = true;
    }
    r.row.classList.toggle('hidden', hidden);
    r.row.classList.toggle('locked', locked);
    r.icon.style.display = locked ? 'none' : '';
    r.shadow.style.display = locked ? '' : 'none';
    if (hidden) return;
    const n = bulkCount(c);
    const cost = costOf(c, n);
    if (locked) {
      r.name.textContent = '???';
      if (c.requires) {
        const req = c.requires;
        if (req.all) r.desc.textContent = `压轴角色：集齐其他 ${CHARACTERS.length - 1} 位伙伴后登场（还差 ${othersMissing(c)} 位）`;
        else {
          const who = CHARACTERS.find((x) => x.id === req.char);
          r.desc.textContent = `${who.nick}升到 Lv${req.level}（${MODEL_VERSIONS[req.char][req.level - 1]}）后解锁`;
        }
      } else {
        r.desc.textContent = '再多赚点 Token 就能解锁';
      }
      r.cost.textContent = '';
    } else {
      r.name.innerHTML = '';
      const lv = level(c.id);
      r.name.append(c.name, el('small', '', c.nick), el('span', `lv${lv >= maxLevel(c.id) ? ' max' : ''}`, `Lv${lv}`));
      r.desc.textContent = `${versionName(c.id)} · 每只 +${fmt(unitTps(c), 1)}/s`;
      r.cost.textContent = `${n > 1 ? `×${n} ` : ''}${fmt(cost)} Token`;
    }
    r.count.textContent = owned(c.id) || '';
    r.sellBtn.style.display = owned(c.id) > 0 ? '' : 'none';
    r.sellBtn.title = owned(c.id) > 0 ? `卖掉 1 只，退回 ${fmt(sellPrice(c))} Token` : '';
    r.row.classList.toggle('poor', !locked && S.tokens < cost);
    // 模型升级按钮：买到这个角色后才出现
    const canLevel = !locked && owned(c.id) > 0;
    r.lvBtn.style.display = canLevel ? '' : 'none';
    if (canLevel) {
      if (level(c.id) >= maxLevel(c.id)) {
        r.lvBtn.textContent = '👑 满级';
        r.lvBtn.disabled = true;
        r.lvBtn.title = '已经是最终形态';
      } else {
        const lc = levelCost(c);
        r.lvBtn.textContent = `⬆ ${fmt(lc)}`;
        r.lvBtn.disabled = S.tokens < lc;
        r.lvBtn.title = `升级到 ${MODEL_VERSIONS[c.id][level(c.id)]}，产出 ×${LEVEL_MUL}`;
      }
    }
  });
}

// ---------- 升级列表 ----------
let upKey = '';
function renderUpgrades() {
  const list = UPGRADES.filter((u) => !has(u.id) && u.unlocked()).sort((a, b) => a.cost - b.cost);
  const key = list.map((u) => u.id).join(',');
  const box = $('#tab-ups');
  if (key !== upKey) {
    upKey = key;
    box.innerHTML = '';
    if (!list.length) box.appendChild(el('div', 'empty', '暂时没有可用的升级，继续发展小窝吧～'));
    list.forEach((u) => {
      const row = el('div', 'row');
      row.dataset.id = u.id;
      const info = el('div', 'info');
      info.append(el('div', 'name', u.name), el('div', 'desc', u.desc), el('div', 'cost', `${fmt(u.cost)} Token`));
      row.append(iconCanvas(u.icon, 32), info);
      row.addEventListener('click', () => buyUpgrade(u));
      box.appendChild(row);
    });
  }
  let affordable = 0;
  list.forEach((u) => {
    const ok = S.tokens >= u.cost;
    if (ok) affordable++;
    box.querySelector(`[data-id="${u.id}"]`)?.classList.toggle('poor', !ok);
  });
  $('#upBadge').textContent = affordable || '';
}

// ---------- 伙伴页：状态、好感度、统计 ----------
const PARTNER_STATS = [
  ['pokes', '被戳'], ['grabs', '被拎'], ['falls', '摔倒'], ['bugs', '抓 Bug'],
  ['meals', '吃饭'], ['baths', '泡澡'], ['swings', '秋千'], ['bounces', '蹦床'], ['sleeps', '睡觉'],
  ['fishes', '钓鱼'], ['harvests', '收菜'], ['camps', '烤火'],
  ['pianos', '演奏'], ['games', '游戏'], ['perches', '爬架'], ['gifts', '收礼'],
];
const partnerCards = {};
let partnerKey = '';
let partnerView = 'cards';            // cards：一只一张卡；graph：关系网
let relFocus = null;                  // 关系网里点中的那只

// 场景里显示着的每一只
function shownPets() {
  const mine = [];
  for (const c of CHARACTERS) {
    for (let slot = 0; slot < Math.min(owned(c.id), MAX_SHOWN); slot++) mine.push({ c, slot, type: c.id });
  }
  return mine;
}

// 它和其他每一只的关系，从好到坏排好
function relationsOf(me, mine) {
  return mine.filter((o) => o.type !== me.type || o.slot !== me.slot).map((o) => ({ o, v: Math.round(getRel(me, o)) })).sort((a, b) => b.v - a.v);
}

function relName(x) {
  return petOf(x.type, x.slot).name;
}

function renderPartners() {
  const box = $('#tab-partners');
  if (!box.classList.contains('on')) return;
  // 每一只单独一张卡：场景里显示几只就列几只（每种最多 3 只）
  const mine = shownPets();
  const key = partnerView + mine.map(({ c, slot }) => c.id + slot).join();
  if (key !== partnerKey) {
    partnerKey = key;
    box.innerHTML = '';
    for (const k of Object.keys(partnerCards)) delete partnerCards[k];
    const views = el('div', 'shop-cats');
    for (const [id, label] of [['cards', '伙伴卡片'], ['graph', '关系网']]) {
      const b = el('button', id === partnerView ? 'on' : '', label);
      b.addEventListener('click', () => {
        partnerView = id;
        renderPartners();
      });
      views.appendChild(b);
    }
    box.appendChild(views);
    if (!mine.length) box.appendChild(el('div', 'empty', '还没有伙伴，先去角色页买一个吧～'));
    else if (partnerView === 'graph') buildRelGraph(box);
    else buildCards(box, mine);
  }
  if (partnerView === 'graph') return drawRelGraph(mine);
  fillCards(mine);
}

function buildCards(box, mine) {
  {
    for (const { c, slot } of mine) {
      const card = el('div', 'pcard');
      const info = el('div', 'pinfo');
      const parts = { name: el('div', 'pname'), status: el('div', 'pstatus'), hearts: el('div', 'phearts'), rel: el('div', 'prel'), stats: el('div', 'pstats'), gear: el('div', 'pgear') };
      info.append(parts.name, parts.status, parts.hearts, parts.rel, parts.gear, parts.stats);
      const gift = el('button', 'gift-btn', '🎁');
      gift.title = '送礼物 / 戴配饰';
      gift.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGiftPicker(c.id, slot);
      });
      card.append(iconCanvas(c.id, 32), info, gift);
      card.title = '点一下，在场景里找到它';
      card.addEventListener('click', () => room.highlight(c.id, slot));
      box.appendChild(card);
      partnerCards[c.id + slot] = parts;
    }
    box.appendChild(el('div', 'partners-tip', '好感度：戳它、一起吃饭、泡温泉、荡秋千、玩蹦床、送礼物都会变亲近；摔疼它或者扔进壁炉会扣好感。同种角色的几只各算各的，产出加成取它们的平均心数，每颗心 +2%。'));
  }
}

function fillCards(mine) {
  for (const { c, slot } of mine) {
    const p = partnerCards[c.id + slot];
    const pet = petOf(c.id, slot);
    const h = heartsOf(pet);
    p.name.innerHTML = '';
    p.name.append(pet.name, el('small', '', c.name), el('span', `lv${level(c.id) >= maxLevel(c.id) ? ' max' : ''}`, `Lv${level(c.id)}`));
    p.status.textContent = room.statusOf(c.id, slot) || '…';
    p.hearts.innerHTML = '';
    p.hearts.append('♥'.repeat(h), el('span', 'off', '♥'.repeat(MAX_HEARTS - h)));
    const next = h < MAX_HEARTS ? `，下一颗还差 ${AFF_PER_HEART - ((pet.aff || 0) % AFF_PER_HEART)}` : '';
    p.hearts.append(el('span', 'ptitle', `${HEART_TITLES[h]}${next}`));
    // 身上戴着的配饰，点 × 摘下来放回背包
    const gearKey = JSON.stringify(pet.gear || {});
    if (p.gear.dataset.key !== gearKey) {
      p.gear.dataset.key = gearKey;
      p.gear.innerHTML = '';
      for (const [gs, id] of Object.entries(pet.gear || {})) {
        const chip = el('span', 'gear-chip', `${shopItem(id).name} ×`);
        chip.title = `摘下${WEAR_SLOTS[gs]}的${shopItem(id).name}`;
        chip.addEventListener('click', (ev) => {
          ev.stopPropagation();
          takeOff(c.id, slot, gs);
        });
        p.gear.appendChild(chip);
      }
    }
    p.stats.innerHTML = '';
    PARTNER_STATS.forEach(([k, label], i) => {
      if (i) p.stats.append(' · ');
      p.stats.append(`${label} `, el('b', '', fmt(pet[k] || 0)));
    });
    // 最好的朋友和最不对付的那只
    const rels = relationsOf({ type: c.id, slot }, mine);
    p.rel.innerHTML = '';
    const best = rels[0], worst = rels[rels.length - 1];
    if (best && best.v >= 10) p.rel.append(el('span', 'good', `${relTitle(best.v)[1]}：${relName(best.o)}`));
    if (worst && worst.v <= -10 && worst !== best) p.rel.append(el('span', 'bad', `${relTitle(worst.v)[1]}：${relName(worst.o)}`));
  }
}

// 撮合 / 挑拨：花一点 Token，关系马上 ±12，两只还会凑过去抱一下或者吵一架
const matchCost = () => shopPrice({ price: 45 });
function matchmake(a, b, good) {
  const cost = matchCost();
  if (S.tokens < cost) return toast(`Token 不够，需要 ${fmt(cost)}`);
  const before = getRel(a, b);
  S.tokens -= cost;
  addRel(a, b, good ? 12 : -12);
  const v = getRel(a, b);
  const kind = good ? (before < 0 ? 'makeup' : v >= 40 && Math.random() < 0.4 ? 'highfive' : 'hug') : v <= -35 ? 'fight' : 'argue';
  const went = room.socialFar(a, b, kind);
  const na = relName(a), nb = relName(b);
  toast(good ? `你在${na}面前说了${nb}一堆好话……💕` : `你在${na}耳边嘀咕了${nb}几句坏话……💢`);
  if (!went) toast(`（它俩现在忙着呢，关系已经变了，下次见面就知道）`, 3000);
  save();
  renderHeader();
  renderPartners();
}

// 关系跨过大坎时弹个提示
onRelMilestone = (a, b, kind) => {
  const na = relName(a), nb = relName(b);
  if (kind === 'bff') toast(`💕 ${na} 和 ${nb} 成为了挚友！`, 4500);
  else if (kind === 'enemy') toast(`💢 ${na} 和 ${nb} 成了死对头……`, 4500);
  else toast(`🤝 ${na} 和 ${nb} 和好了！`, 4000);
};

// ---------- 关系网：一圈头像，线的颜色表示关系，点一只看它和谁好 ----------
const REL_W = 312, REL_H = 250;
let relNodes = [];

function buildRelGraph(box) {
  const cv = el('canvas', 'relgraph');
  cv.width = REL_W * 2;
  cv.height = REL_H * 2;
  cv.addEventListener('click', (ev) => {
    const b = cv.getBoundingClientRect();
    const x = ((ev.clientX - b.left) / b.width) * REL_W, y = ((ev.clientY - b.top) / b.height) * REL_H;
    const hit = relNodes.find((n) => Math.hypot(n.x - x, n.y - y) < 12);
    relFocus = hit && !(relFocus && relFocus.type === hit.type && relFocus.slot === hit.slot) ? { type: hit.type, slot: hit.slot } : null;
    if (hit) room.highlight(hit.type, hit.slot);
    renderPartners();
  });
  const legend = el('div', 'rel-legend');
  for (const [, name, col] of REL_TITLES) {
    const item = el('span', '', name);
    item.style.setProperty('--c', col);
    legend.appendChild(item);
  }
  box.append(cv, legend, el('div', 'rel-list'), el('div', 'partners-tip', '一起聊天、吃饭、泡温泉、烤火会越来越熟，关系好的会抱抱、击掌；关系差的会吵架，甚至打成一团。把两只丢到一块儿也会触发互动。点头像看它的关系，实线是友好，虚线是不和。'));
}

function drawRelGraph(mine) {
  const box = $('#tab-partners');
  const cv = box.querySelector('.relgraph');
  if (!cv) return;
  const g = cv.getContext('2d');
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, REL_W, REL_H);
  const cx = REL_W / 2, cy = REL_H / 2, R = Math.min(REL_W, REL_H) / 2 - 18;
  relNodes = mine.map((m, i) => {
    const a = (i / mine.length) * Math.PI * 2 - Math.PI / 2;
    return { ...m, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
  });
  if (relFocus && !relNodes.some((n) => n.type === relFocus.type && n.slot === relFocus.slot)) relFocus = null;
  const isFocus = (n) => relFocus && n.type === relFocus.type && n.slot === relFocus.slot;
  // 先画线：没选中时只画关系明显的；选中时只画它的线
  for (let i = 0; i < relNodes.length; i++) {
    for (let j = i + 1; j < relNodes.length; j++) {
      const a = relNodes[i], b = relNodes[j];
      const v = getRel(a, b);
      const mineLine = isFocus(a) || isFocus(b);
      if (relFocus ? !mineLine : Math.abs(v) < 10) continue;
      g.strokeStyle = relTitle(v)[2];
      g.globalAlpha = relFocus ? 0.95 : 0.55;
      g.lineWidth = Math.abs(v) >= 60 ? 3 : Math.abs(v) >= 30 ? 2 : 1;
      g.setLineDash(v < 0 ? [4, 3] : []);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
  }
  g.setLineDash([]);
  g.globalAlpha = 1;
  for (const n of relNodes) {
    const spr = getSprite(n.type);
    const sc = Math.max(1, Math.floor(18 / Math.max(spr.width, spr.height)));
    g.fillStyle = isFocus(n) ? '#3d3366' : '#17132a';
    g.strokeStyle = isFocus(n) ? '#ffcf4a' : '#3a3160';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(n.x, n.y, 12, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.drawImage(spr, Math.round(n.x - (spr.width * sc) / 2), Math.round(n.y - (spr.height * sc) / 2), spr.width * sc, spr.height * sc);
  }
  // 选中的那只：列出它和每一只的关系
  const list = box.querySelector('.rel-list');
  const k = relFocus ? relFocus.type + relFocus.slot + relationsOf(relFocus, mine).map((r) => r.v).join() : '-';
  if (list.dataset.key === k) return;
  list.dataset.key = k;
  list.innerHTML = '';
  if (!relFocus) return list.appendChild(el('div', 'rel-hint', '点一个头像，看看它和大家的关系'));
  list.appendChild(el('div', 'rel-head', `${relName(relFocus)} 的关系 · 撮合/挑拨每次 ${fmt(matchCost())} Token`));
  for (const { o, v } of relationsOf(relFocus, mine)) {
    const [, title, col] = relTitle(v);
    const row = el('div', 'rel-row');
    const tag = el('span', 'rel-tag', title);
    tag.style.color = col;
    const good = el('button', 'rel-act good', '撮合');
    const bad = el('button', 'rel-act bad', '挑拨');
    good.title = `花 ${fmt(matchCost())} Token，让它们凑一块儿亲近亲近`;
    bad.title = `花 ${fmt(matchCost())} Token，让它们吵一架`;
    good.addEventListener('click', () => matchmake(relFocus, o, true));
    bad.addEventListener('click', () => matchmake(relFocus, o, false));
    row.append(iconCanvas(o.type, 16), el('span', 'rel-name', relName(o)), tag, el('b', '', (v > 0 ? '+' : '') + v), good, bad);
    list.appendChild(row);
  }
}

// ---------- 商城 ----------
let shopCat = 'gift';
let shopKey = '';
const shopRows = {};

// 商品的小图标：配饰用像素画，其他用 emoji
function itemIcon(item) {
  if (shopItem(item.id)?.slot) return iconCanvas('g_' + item.id, 24);
  return el('span', 'emoji', item.icon || '🎁');
}

function renderShop() {
  const box = $('#tab-shop');
  if (!box.classList.contains('on')) return;
  const key = shopCat + Object.keys(S.decor).join() + S.placed.length + JSON.stringify(S.store) + JSON.stringify(S.ownedFurn);
  if (key !== shopKey) {
    shopKey = key;
    box.innerHTML = '';
    const cats = el('div', 'shop-cats');
    for (const [id, label] of SHOP_TABS) {
      const b = el('button', id === shopCat ? 'on' : '', label);
      b.addEventListener('click', () => {
        shopCat = id;
        renderShop();
      });
      cats.appendChild(b);
    }
    box.appendChild(cats);
    for (const item of SHOP[shopCat]) {
      const row = el('div', 'row shop-row');
      const info = el('div', 'info');
      let desc = item.desc || '';
      if (shopCat === 'gift') {
        const fans = Object.entries(FAVORITE_GIFT).filter(([, g]) => g === item.id).map(([id]) => CHARACTERS.find((c) => c.id === id).nick);
        desc = `好感 +${item.aff}${fans.length ? ` · ${fans.join('、')}最爱（翻倍）` : ''}`;
      } else if (shopCat === 'wear') {
        desc = `戴在${WEAR_SLOTS[item.slot]} · ${item.desc || '送给伙伴就会戴上'}`;
      }
      const cost = el('div', 'cost');
      const stock = el('div', 'stock');
      info.append(el('div', 'name', item.name), el('div', 'desc', desc), cost);
      const btn = el('button', 'lv-btn', '买');
      btn.addEventListener('click', () => buyItem(shopCat, item));
      const side = el('div', 'side');
      side.append(stock, btn);
      row.append(itemIcon(item), info, side);
      box.appendChild(row);
      shopRows[item.id] = { cost, stock, btn };
    }
    box.appendChild(el('div', 'partners-tip', PLACEABLE.includes(shopCat)
      ? '家具买了会自动找个空地方摆上。点右边的 🛠 进入装修模式，就能把家具拖到喜欢的位置；不想要的可以在"环境"页收进仓库。'
      : '礼物和配饰买了放进背包，到"伙伴"页点 🎁 送给想送的那一只。价格会随小窝的产出一起涨。'));
  }
  for (const item of SHOP[shopCat]) {
    const r = shopRows[item.id];
    const price = shopPrice(item);
    const have = furnCount(item.id);
    const placeable = PLACEABLE.includes(shopCat);
    const needPiano = item.id === 'record' && !room.decor.has('piano');
    const done = item.builtin ? !!S.ownedFurn[item.id] : (shopCat === 'decor' && S.decor[item.id]) || (placeable && have >= FURN_MAX);
    r.cost.textContent = done ? (item.builtin ? '已拥有' : placeable ? '买满了' : '已摆放') : needPiano ? '要先有钢琴' : `${fmt(price)} Token`;
    r.stock.textContent = shopCat === 'gift' || shopCat === 'wear' ? `背包 ${S.inv[item.id] || 0}` : item.builtin ? '原有家具' : placeable ? `已有 ${have}/${FURN_MAX}` : '';
    if (needPiano) {
      r.btn.textContent = '买';
      r.btn.disabled = true;
      continue;
    }
    r.btn.textContent = done ? '✓' : '买';
    r.btn.disabled = done || S.tokens < price;
  }
}

// 这种家具一共有几件（摆着的 + 仓库里的）
const furnCount = (id) => S.placed.filter((q) => q.id === id).length + (S.store[id] || 0);

function buyItem(cat, item) {
  const price = shopPrice(item);
  if (item.builtin) {
    if (S.tokens < price || S.ownedFurn[item.id]) return;
    S.tokens -= price;
    room.decor.buyBuiltin(item.id);
    toast(`「${item.name}」搬进来啦！`);
    save();
    refreshUI();
    return;
  }
  if (item.id === 'record' && !room.decor.has('piano')) return toast('唱片机要放在钢琴上，先买一架钢琴吧');
  if (S.tokens < price || (cat === 'decor' && S.decor[item.id]) || (PLACEABLE.includes(cat) && furnCount(item.id) >= FURN_MAX)) return;
  S.tokens -= price;
  if (cat === 'gift' || cat === 'wear') {
    S.inv[item.id] = (S.inv[item.id] || 0) + 1;
    toast(`买到了「${item.name}」，已放进背包`);
  } else if (cat === 'decor') {
    S.decor[item.id] = true;
    room.rebuild();
    toast(`「${item.name}」已经摆好啦！`);
  } else if (PLACEABLE.includes(cat)) {
    if (room.decor.placeNew(item.id)) toast(`「${item.name}」摆好啦！点右边的 🛠 可以挪位置`);
    else {
      S.store[item.id] = (S.store[item.id] || 0) + 1;
      toast(`没地方摆「${item.name}」了，先放进仓库（环境页 → 装修）`);
    }
    renderDecorList();
  } else if (item.id === 'double') {
    S.boost.doubleUntil = Math.max(Date.now(), S.boost.doubleUntil) + 10 * 60000;
    toast('双倍产出生效！10 分钟内产出 ×2');
  } else if (item.id === 'fertilizer') {
    room.ripenGarden();
    toast('施了肥，菜园全部成熟啦！');
  } else if (item.id === 'bugbait') {
    room.spawnBugNow();
    toast('放下诱饵……有 Bug 爬过来了！');
  } else if (item.id === 'candy') {
    for (const c of CHARACTERS) for (let s = 0; s < Math.min(owned(c.id), MAX_SHOWN); s++) addAff({ type: c.id, slot: s }, 5);
    toast('大家都吃到了糖果，好感 +5');
  }
  save();
  refreshUI();
}

// ---------- 送礼 / 戴配饰 ----------
function giveItem(type, slot, id) {
  const item = shopItem(id);
  if (!item || !(S.inv[id] > 0)) return;
  const who = { type, slot };
  const pet = petOf(type, slot);
  const e = room.list().find((x) => x.type === type && x.slot === slot);
  S.inv[id]--;
  if (item.slot) {
    pet.gear = pet.gear || {};
    const old = pet.gear[item.slot];
    if (old) S.inv[old] = (S.inv[old] || 0) + 1;
    pet.gear[item.slot] = id;
    addAff(who, 3);
    if (e) talk.sayTo(e, pick(GIFT_LINES.wear));
  } else {
    const fav = FAVORITE_GIFT[type] === id;
    addAff(who, item.aff * (fav ? 2 : 1));
    if (e) talk.sayTo(e, pick(fav ? GIFT_LINES.fav : GIFT_LINES.normal));
    toast(`${pet.name}收到了「${item.name}」${fav ? '，是它最喜欢的！好感 +' + item.aff * 2 : '，好感 +' + item.aff}`);
  }
  bumpStat(who, 'gifts');
  if (e) room.poke(e);
  save();
  refreshUI();
}

function takeOff(type, slot, gearSlot) {
  const pet = petOf(type, slot);
  const id = pet.gear?.[gearSlot];
  if (!id) return;
  S.inv[id] = (S.inv[id] || 0) + 1;
  delete pet.gear[gearSlot];
  save();
  refreshUI();
}

// 送礼的小弹窗：列出背包里有的礼物和配饰
function openGiftPicker(type, slot) {
  closeGiftPicker();
  const pet = petOf(type, slot);
  const pop = el('div', 'picker');
  pop.appendChild(el('div', 'picker-title', `送给 ${pet.name}`));
  const items = [...SHOP.gift, ...SHOP.wear].filter((it) => S.inv[it.id] > 0);
  if (!items.length) pop.appendChild(el('div', 'empty', '背包是空的，先去商城买点礼物吧～'));
  for (const it of items) {
    const b = el('button', 'picker-item');
    b.append(itemIcon(it), el('span', '', `${it.name} ×${S.inv[it.id]}`));
    if (FAVORITE_GIFT[type] === it.id) b.append(el('span', 'fav', '最爱'));
    b.addEventListener('click', () => {
      giveItem(type, slot, it.id);
      closeGiftPicker();
    });
    pop.appendChild(b);
  }
  const close = el('button', 'picker-close', '关闭');
  close.addEventListener('click', closeGiftPicker);
  pop.appendChild(close);
  $('#panel').appendChild(pop);
}
function closeGiftPicker() {
  document.querySelector('.picker')?.remove();
}

// ---------- 鼠标悬停提示：角色 / 显示器 / 能点的家具 ----------
function showTip(ev, info) {
  const tip = $('#tip');
  if (!info) {
    tip.classList.remove('show');
    return;
  }
  tip.innerHTML = '';
  if (info.kind === 'char') {
    const e = info.e;
    const c = CHARACTERS.find((x) => x.id === e.type);
    const pet = petFor(e);
    const h = heartsOf(pet);
    const hearts = el('div', 't-hearts');
    hearts.append('♥'.repeat(h), el('span', 'off', '♥'.repeat(MAX_HEARTS - h)));
    tip.append(
      el('div', 't-name', `${pet.name} · Lv${level(c.id)}${level(c.id) >= maxLevel(c.id) ? ' 👑' : ''}`),
      el('div', 't-sub', `${c.name} · ${versionName(c.id)}`),
      hearts,
      el('div', 't-sub', `${HEART_TITLES[h]} · ${room.statusOf(e) || ''}`),
    );
  } else if (info.kind === 'monitor') {
    const hist = tokenHistory;
    const ago = hist.length ? hist[0] : S.tokens;
    const diff = S.tokens - ago;
    const mins = Math.max(1, Math.round((hist.length * 3) / 60));
    tip.append(
      el('div', 't-name', 'Token 走势'),
      el('div', '', `当前余额 ${fmt(S.tokens)}`),
      el('div', '', `${mins} 分钟内 ${diff >= 0 ? '+' : '-'}${fmt(Math.abs(diff))}`),
      el('div', '', `历史最高 ${fmt(Math.max(S.peak, S.tokens))}`),
      el('div', 't-sub', `每秒 +${fmt(tps(), 1)} · 每分钟 +${fmt(tps() * 60)}`),
    );
  } else {
    tip.append(el('div', '', info.label));
  }
  tip.classList.add('show');
  const scene = $('#scene').getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX - scene.left + 14, y = ev.clientY - scene.top - h - 8;
  if (x + w > scene.width - 4) x = ev.clientX - scene.left - w - 14;
  if (y < 4) y = ev.clientY - scene.top + 16;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

// ---------- 环境设置 ----------
const SEASON_MODES = [
  ['auto', '跟随现实月份'],
  ['cycle', '快速轮换（10 分钟一季）'],
  ['spring', '一直是春天'],
  ['summer', '一直是夏天'],
  ['autumn', '一直是秋天'],
  ['winter', '一直是冬天'],
];
const WEATHER_MODES = [
  ['random', '随机变化'],
  ['clear', '一直晴天'],
  ['cloudy', '一直多云'],
  ['rain', '一直下雨'],
  ['storm', '一直雷雨'],
  ['snow', '一直下雪'],
  ['fog', '一直起雾'],
];
const WEATHER_NAMES = { clear: '晴 ☀', cloudy: '多云 ☁', rain: '下雨 🌧', storm: '雷雨 ⛈', snow: '下雪 ❄', fog: '起雾 🌫', rainbow: '彩虹 🌈' };
const TIME_MODES = [
  ['real', '跟随现实时间'],
  ['fast', '加速（10 分钟一天）'],
];
function buildEnvTab() {
  const box = $('#tab-env');
  const section = (title, modes, key) => {
    box.appendChild(el('div', 'env-title', title));
    const wrap = el('div', 'env-opts');
    modes.forEach(([value, label]) => {
      const b = el('button', '', label);
      b.dataset.key = key;
      b.dataset.value = value;
      b.addEventListener('click', () => {
        S.env[key] = value;
        renderEnv();
        save();
      });
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
  };
  box.appendChild(el('div', 'env-now'));
  section('季节', SEASON_MODES, 'season');
  section('昼夜', TIME_MODES, 'time');
  section('天气', WEATHER_MODES, 'weather');
  box.appendChild(el('p', 'env-tip', '小家伙们白天爱出门溜达，天黑了大多会回屋，冬天也比较懒得出去。'));
  box.appendChild(el('div', 'env-title', '声音'));
  const snd = el('div', 'env-opts env-sound');
  const slider = el('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 100;
  slider.value = S.env.volume ?? 60;
  const pct = el('span', 'vol-pct', `${slider.value}%`);
  slider.addEventListener('input', () => {
    S.env.volume = +slider.value;
    pct.textContent = `${slider.value}%`;
    music.setVolume();
  });
  slider.addEventListener('change', save);
  const mute = el('button', S.env.mute ? 'on' : '', S.env.mute ? '已静音' : '静音');
  mute.addEventListener('click', () => {
    S.env.mute = !S.env.mute;
    mute.textContent = S.env.mute ? '已静音' : '静音';
    mute.classList.toggle('on', S.env.mute);
    music.setVolume();
    save();
  });
  snd.append(el('span', 'vol-label', '音量'), slider, pct, mute);
  box.append(snd, el('p', 'env-tip', '点钢琴上的唱片机放音乐（每次换一首）；两只以上的伙伴一起演奏乐器就是合奏，声音会小一点。'));
  box.appendChild(el('div', 'env-title', '装修'));
  const wrap = el('div', 'env-opts');
  const mode = el('button', 'decor-toggle', '进入装修模式');
  mode.addEventListener('click', () => setDecor(!room.decor.on()));
  const reset = el('button', '', '恢复默认摆放');
  reset.addEventListener('click', () => {
    if (!confirm('把家具都放回原来的位置？')) return;
    room.decor.reset();
    save();
    renderDecorList();
    toast('家具都回到原来的位置啦');
  });
  wrap.append(mode, reset);
  box.append(wrap, el('div', 'decor-list'));
  renderDecorList();
}

// 装修模式开关：场景里给能挪的家具套上框，拖动换位置
function setDecor(on) {
  room.decor.set(on);
  $('#btnDecor').classList.toggle('on', on);
  const b = $('#tab-env .decor-toggle');
  if (b) b.textContent = on ? '完成装修' : '进入装修模式';
  if (on) toast('装修模式：按住拖动换位置，右键收进仓库；再点一次 🛠 完成', 4500);
  else {
    save();
    toast('装修完成！');
  }
}

// 摆着的家具可以收进仓库，仓库里的可以再摆出来
let decorListKey = '';
function renderDecorList() {
  const box = $('#tab-env .decor-list');
  if (!box) return;
  const key = JSON.stringify([S.placed.map((q) => q.uid), S.store, S.stored]);
  if (key === decorListKey) return;
  decorListKey = key;
  box.innerHTML = '';
  const row = (item, label, btnText, fn) => {
    const r = el('div', 'decor-row');
    const b = el('button', '', btnText);
    b.addEventListener('click', () => {
      fn();
      save();
      renderDecorList();
      renderShop();
    });
    r.append(el('span', 'emoji', item.icon), el('span', 'dname', label), b);
    box.appendChild(r);
  };
  for (const q of S.placed) {
    const item = shopItem(q.id);
    if (item) row(item, item.name, '收起', () => room.decor.store(q.uid));
  }
  for (const [id, n] of Object.entries(S.store)) {
    const item = shopItem(id);
    if (!item || !n) continue;
    row(item, `${item.name}（仓库 ×${n}）`, '摆出来', () => {
      if (!room.decor.placeNew(id)) return toast('没有空地方了，先挪一挪别的家具吧');
      S.store[id]--;
    });
  }
  for (const [k, name] of room.decor.storedNames()) {
    row({ icon: '📦' }, `${name}（仓库）`, '摆出来', () => room.decor.unstore(k));
  }
  if (!box.children.length) box.appendChild(el('p', 'env-tip', '在商城"家具"里买的东西会出现在这里，可以收起或者重新摆出来。'));
  box.appendChild(el('p', 'env-tip', '装修模式里右键点家具就能收进仓库（机柜和书桌除外）。落地家具能左右挪、也能拉到屋子中间；窗户、挂钟、相框墙这些墙上的东西在墙上随便挪；吊灯只能沿着天花板左右挪；院子里的设施（连温泉）都能挪。'));
}

function renderEnv() {
  const { weather } = room.now();
  const season = env.season();
  const info = `${SEASON_NAMES[season]} · ${env.clock()} · ${WEATHER_NAMES[weather] || ''}`;
  $('#envInfo').textContent = info;
  const now = $('#tab-env .env-now');
  if (now) now.textContent = `现在是 ${info}`;
  document.querySelectorAll('#tab-env .env-opts button[data-key]').forEach((b) => {
    b.classList.toggle('on', S.env[b.dataset.key] === b.dataset.value);
  });
  renderDecorList();
}

// ---------- 统计 ----------
function renderStats() {
  const box = $('#tab-stats');
  if (!box.classList.contains('on')) return;
  const totalChars = CHARACTERS.reduce((s, c) => s + owned(c.id), 0);
  const lines = [
    ['累计赚取', fmt(S.total) + ' Token'],
    ['当前每秒', fmt(tps(), 1) + ' Token'],
    ['每次点击', fmt(clickValue(), 1) + ' Token'],
    ['点击次数', fmt(S.clicks)],
    ['点击赚取', fmt(S.clickEarned) + ' Token'],
    ['角色总数', fmt(totalChars)],
    ['模型总等级', fmt(CHARACTERS.reduce((s, c) => s + (owned(c.id) ? level(c.id) : 0), 0))],
    ['已购升级', `${upSet.size} / ${UPGRADES.length}`],
    ['抓到的 Bug', fmt(S.bugs)],
    ['游戏时长', fmtTime(S.playSec)],
  ];
  if (!box.firstChild) {
    lines.forEach(() => {
      const l = el('div', 'stat-line');
      l.append(el('span'), el('b'));
      box.appendChild(l);
    });
    const act = el('div', 'stat-actions');
    const god = el('button', 'god-btn');
    god.addEventListener('click', () => setGodHand(!S.godHand));
    const reset = el('button', '', '重置存档');
    reset.addEventListener('click', resetGame);
    act.append(god, reset, el('p', '', '神之手：作弊开关，开着时 Token 无限；关掉会还原成开启前的余额（这期间买的东西都留着）。'), el('p', '', '小提示：地上偶尔会爬过一只绿色 Bug，点它有惊喜。'));
    box.appendChild(act);
  }
  const god = box.querySelector('.god-btn');
  god.textContent = S.godHand ? '✋ 神之手：开' : '✋ 神之手：关';
  god.classList.toggle('on', !!S.godHand);
  box.querySelectorAll('.stat-line').forEach((l, i) => {
    l.children[0].textContent = lines[i][0];
    l.children[1].textContent = lines[i][1];
  });
}

// ---------- 神之手：作弊开关，Token 无限 ----------
const GOD_TOKENS = 1e300;
function setGodHand(on) {
  if (on === !!S.godHand) return;
  if (on) {
    if (!confirm('开启神之手？Token 会变成无限，想买什么都行。\n关掉时余额会还原成开启前的数字，这期间买的东西都留着。')) return;
    S.godBackup = S.tokens;
    S.godHand = true;
    S.tokens = GOD_TOKENS;
    toast('✋ 神之手降临！Token 无限');
  } else {
    S.godHand = false;
    S.tokens = S.godBackup || 0;
    delete S.godBackup;
    toast('神之手收回了，余额恢复到开启前');
  }
  save();
  refreshUI();
}

function renderHeader() {
  $('#tokens').textContent = S.godHand ? '∞' : fmt(S.tokens);
  $('#tps').textContent = `每秒 ${fmt(tps(), 1)} Token`;
  const parts = [];
  if (S.godHand) parts.push('✋ 神之手');
  if (buff) parts.push(`${buff.name} ×${buff.mul} ${Math.ceil((buff.until - Date.now()) / 1000)}s`);
  const dbl = S.boost.doubleUntil - Date.now();
  if (dbl > 0) parts.push(`双倍 ×2 ${Math.floor(dbl / 60000)}:${String(Math.floor((dbl % 60000) / 1000)).padStart(2, '0')}`);
  $('#buff').textContent = parts.join(' · ');
}

function refreshUI() {
  renderHeader();
  renderEnv();
  renderCharList();
  renderUpgrades();
  renderPartners();
  renderShop();
  renderStats();
}

function resetGame() {
  if (!confirm('确定要清空所有进度重新开始吗？')) return;
  if (!confirm('真的确定？这一步没法撤销。')) return;
  const keep = { panelHidden: S.panelHidden, env: S.env };
  S = Object.assign(defaultState(), keep);
  upSet = new Set();
  buff = null;
  upKey = '';
  room.sync(false);
  room.resize();
  save();
  refreshUI();
  toast('存档已重置，点击屋里发光的芯片重新开始吧！');
}

// ---------- 窗口按钮 ----------
const bridge = window.desk;

function applyPanel(hidden) {
  S.panelHidden = hidden;
  $('#app').classList.toggle('no-panel', hidden);
  $('#btnPanel').textContent = hidden ? '◀' : '▶';
  $('#btnPanel').title = hidden ? '展开菜单' : '收起菜单';
}

function bindControls() {
  $('#btnDecor').addEventListener('click', () => setDecor(!room.decor.on()));
  $('#btnClose').addEventListener('click', () => {
    save();
    bridge ? bridge.close() : window.close();
  });
  $('#btnMin').addEventListener('click', () => bridge?.minimize());
  $('#btnPanel').addEventListener('click', () => applyPanel(!S.panelHidden));
  const pin = $('#btnPin');
  bridge?.isPinned().then((on) => pin.classList.toggle('on', on));
  pin.addEventListener('click', async () => {
    if (!bridge) return;
    const on = await bridge.togglePin();
    pin.classList.toggle('on', on);
    toast(on ? '已置顶，会一直浮在其他窗口上面' : '已取消置顶');
  });

  document.querySelectorAll('#tabs > button').forEach((b) => b.addEventListener('click', () => {
    closeGiftPicker();
    document.querySelectorAll('#tabs > button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
    $('#tabs').classList.toggle('no-bulk', b.dataset.tab !== 'chars');
    refreshUI();
  }));
  document.querySelectorAll('#bulk button').forEach((b) => b.addEventListener('click', () => {
    bulk = b.dataset.bulk === 'max' ? 'max' : Number(b.dataset.bulk);
    document.querySelectorAll('#bulk button').forEach((x) => x.classList.toggle('on', x === b));
    renderCharList();
  }));

  bindRoomPointer();
  room.setOnBugCaught((e) => catchBug(room.cssPos(e), e));
  room.setOnReward(giveReward);

  window.addEventListener('beforeunload', save);
}

// ---------- 房间里的鼠标：点芯片、抓 Bug、戳角色、拖角色 ----------
const DRAG_THRESHOLD = 4;
const CHARGE_COOLDOWN = 20000;
let lastCharge = 0;
const lastPokeAff = {};

// 把角色放在芯片上充电：奖励一笔 Token，有冷却
function chargeAt(ctx) {
  const now = Date.now();
  if (now - lastCharge < CHARGE_COOLDOWN) {
    ctx.cool = true;
    return;
  }
  lastCharge = now;
  const v = clickValue() * 25 + baseTps() * 5;
  earn(v);
  room.chargeFx(ctx.e);
  floatText('⚡+' + fmt(v), ctx.p.cssX, ctx.p.cssY - 10, '#7ff5df');
}

function bindRoomPointer() {
  const cvs = $('#room');
  let press = null; // { e, x, y, dragging }

  let decorPress = false;
  cvs.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (room.decor.on()) {
      if (room.decor.start(ev)) {
        decorPress = true;
        cvs.setPointerCapture(ev.pointerId);
        cvs.style.cursor = 'grabbing';
        showTip(null, null);
      }
      return;
    }
    const h = room.hit(ev);
    if (h.kind === 'chip') clickChip(h.p);
    else if (h.kind === 'bug') catchBug(h.p);
    else if (h.kind === 'char') {
      press = { e: h.e, x: ev.clientX, y: ev.clientY, dragging: false };
      cvs.setPointerCapture(ev.pointerId);
      return;
    } else return;
    renderHeader();
  });

  cvs.addEventListener('pointermove', (ev) => {
    if (room.decor.on()) {
      const name = room.decor.move(ev);
      if (decorPress) return;
      cvs.style.cursor = name ? 'grab' : '';
      showTip(ev, name ? { kind: 'furniture', label: `${name} · 按住拖动 · 右键收进仓库` } : null);
      return;
    }
    if (!press) {
      const info = room.hoverInfo(ev);
      room.setHover(info?.kind === 'char' ? info.e : null);
      cvs.style.cursor = info?.kind === 'char' ? 'grab' : info?.kind === 'furniture' ? 'pointer' : '';
      showTip(ev, info);
      return;
    }
    if (!press.dragging && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > DRAG_THRESHOLD) {
      press.dragging = true;
      showTip(null, null);
      room.grab(press.e);
      talk.grabbed(press.e);
      cvs.style.cursor = 'grabbing';
    }
    if (press.dragging) room.dragTo(ev);
  });

  const end = (ev) => {
    if (decorPress) {
      decorPress = false;
      room.decor.end();
      if (cvs.hasPointerCapture(ev.pointerId)) cvs.releasePointerCapture(ev.pointerId);
      cvs.style.cursor = '';
      save();
      return;
    }
    if (!press) return;
    const { e, dragging } = press;
    press = null;
    if (cvs.hasPointerCapture(ev.pointerId)) cvs.releasePointerCapture(ev.pointerId);
    cvs.style.cursor = '';
    if (!dragging) {
      room.poke(e);
      talk.poked(e);
      bumpStat(e, 'pokes');
      // 戳一下 +1 好感，同一个角色 3 秒内只算一次，免得狂点刷好感
      const now = Date.now();
      if (now - (lastPokeAff[e.type] || 0) > 3000) {
        lastPokeAff[e.type] = now;
        addAff(e, 1);
      }
      return;
    }
    const ctx = room.release(ev);
    if (!ctx) return;
    if (ctx.kind === 'chip') chargeAt(ctx);
    if (ctx.kind === 'bug') {
      catchBug(ctx.p);
      bumpStat(ctx.e, 'bugs');
      addAff(ctx.e, 2);
    }
    talk.released(ctx);
    renderHeader();
  };
  cvs.addEventListener('contextmenu', (ev) => {
    if (!room.decor.on()) return;
    ev.preventDefault();
    const msg = room.decor.storeAt(ev);
    if (msg) {
      toast(msg);
      save();
      renderDecorList();
      renderShop();
    }
  });
  cvs.addEventListener('pointerleave', () => {
    room.setHover(null);
    showTip(null, null);
  });
  cvs.addEventListener('pointerup', end);
  cvs.addEventListener('pointercancel', end);
}

// ---------- 主循环 ----------
let lastTick = Date.now();
function tick() {
  const now = Date.now();
  let dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt > 60) {
    // 电脑睡眠等导致的长间隔按离线收益算
    earn(baseTps() * Math.min(dt, OFFLINE_CAP) * OFFLINE_RATE);
    dt = 0;
  }
  if (buff && now >= buff.until) {
    buff = null;
    toast('灵感爆发结束了');
  }
  earn(tps() * dt);
  if (S.godHand) S.tokens = GOD_TOKENS;
  S.playSec += dt;
  if (S.tokens > S.peak) S.peak = S.tokens;
}

function startLoops() {
  setInterval(tick, 100);
  setInterval(refreshUI, 250);
  setInterval(save, 10000);

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    room.update(dt, now);
    room.draw(now / 1000);
    talk.update(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function offlineEarnings() {
  const away = (Date.now() - S.last) / 1000;
  if (away < 60) return;
  const gain = baseTps() * Math.min(away, OFFLINE_CAP) * OFFLINE_RATE;
  if (gain <= 0) return;
  earn(gain);
  toast(`你离开了 ${fmtTime(away)}，大家帮你赚了 ${fmt(gain)} Token`, 5000);
}

// ---------- 启动 ----------
buildCharList();
buildEnvTab();
bindControls();
applyPanel(S.panelHidden);
room.sync(false);
room.scheduleBug();
offlineEarnings();
lastTick = Date.now();
refreshUI();
if (S.total === 0) toast('点击屋里发光的 GPU 芯片来生成 Token！', 6000);
startLoops();
