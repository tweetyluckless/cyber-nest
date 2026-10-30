'use strict';
// 商城里卖的东西。price 是"几秒的产出"，实际价格 = max(price × 20, 每秒产出 × price)，
// 这样不管小窝发展到多大，买东西都有分量。

const SHOP = {
  // 礼物：送给某一只加好感；送到它最喜欢的那样，好感翻倍
  gift: [
    { id: 'cookie', icon: '🍪', name: '小饼干', aff: 3, price: 30 },
    { id: 'milktea', icon: '🧋', name: '奶茶', aff: 5, price: 60 },
    { id: 'hay', icon: '🌿', name: '嫩草', aff: 5, price: 60 },
    { id: 'sauce', icon: '🌶️', name: '辣酱', aff: 5, price: 60 },
    { id: 'baguette', icon: '🥖', name: '法棍', aff: 6, price: 80 },
    { id: 'flowers', icon: '💐', name: '花束', aff: 8, price: 120 },
    { id: 'mooncake', icon: '🥮', name: '月饼', aff: 8, price: 120 },
    { id: 'avocado', icon: '🥑', name: '牛油果', aff: 8, price: 120 },
    { id: 'book', icon: '📕', name: '好书', aff: 10, price: 180 },
    { id: 'cake', icon: '🎂', name: '蛋糕', aff: 15, price: 300 },
    { id: 'keyboard', icon: '⌨️', name: '机械键盘', aff: 20, price: 500 },
    { id: 'gpu', icon: '🖥️', name: '显卡', aff: 30, price: 1200 },
  ],
  // 配饰：送给某一只就戴上；同一个部位只能戴一样，换下来的回到背包
  wear: [
    { id: 'towel', name: '小浴巾', slot: 'bath', desc: '泡温泉时顶在头上', price: 200 },
    { id: 'beanie', name: '毛线帽', slot: 'head', price: 300 },
    { id: 'bow', name: '蝴蝶结', slot: 'head', price: 300 },
    { id: 'party', name: '派对帽', slot: 'head', price: 400 },
    { id: 'sunglasses', name: '墨镜', slot: 'face', price: 400 },
    { id: 'glasses', name: '圆框眼镜', slot: 'face', price: 300 },
    { id: 'scarf', name: '红围巾', slot: 'neck', price: 300 },
    { id: 'bowtie', name: '领结', slot: 'neck', price: 300 },
  ],
  // 家具和装饰：买一次永久摆在家里
  decor: [
    { id: 'lights', icon: '💡', name: '彩灯串', desc: '屋顶挂一串彩灯，晚上一闪一闪', price: 900 },
    { id: 'record', icon: '📻', name: '唱片机', desc: '摆在钢琴上，点一下放音乐', price: 900 },
    { id: 'windmill', icon: '🌀', name: '小风车', desc: '远处山坡上转个不停', price: 1500 },
    { id: 'bench', icon: '🪑', name: '户外长椅', desc: '院子里多两个座位', price: 1200 },
    { id: 'scarecrow', icon: '🌾', name: '稻草人', desc: '守着菜园，收菜奖励 ×1.5', price: 1500 },
  ],
  // 可以自由摆放的家具：买了先找个空地方摆上，到装修模式里随便挪
  furn: [
    // 屋里原来的家具（新开局时没有，要一件件买回来）
    { id: 'armchair', builtin: true, icon: '🪑', name: '扶手椅 + 边桌', desc: '窗边的老位置', price: 120 },
    { id: 'rug', builtin: true, icon: '🟥', name: '小地毯', desc: '书桌前铺一块', price: 150 },
    { id: 'beanbag', builtin: true, icon: '🫘', name: '懒人沙发', desc: '带一块圆地毯', price: 200 },
    { id: 'lamp', builtin: true, icon: '💡', name: '落地灯', desc: '晚上可以开关', price: 200 },
    { id: 'shelf', builtin: true, icon: '📚', name: '书架', desc: '满满一架书', price: 300 },
    { id: 'fridge', builtin: true, icon: '🧊', name: '冰箱', desc: '贴满了冰箱贴', price: 300 },
    { id: 'counter', builtin: true, icon: '🐠', name: '橱柜和鱼缸', desc: '有咖啡机，鱼缸可以喂鱼', price: 500 },
    { id: 'table', builtin: true, icon: '🍽️', name: '长餐桌', desc: '12 个座位，饭点大家一起吃饭', price: 600 },
    { id: 'cattree', builtin: true, icon: '🐈', name: '猫爬架', desc: '三层台子能爬上去', price: 600 },
    { id: 'sofa', builtin: true, icon: '🛋️', name: '长沙发', desc: '坐得下 4 只', price: 800 },
    { id: 'fireplace', builtin: true, icon: '🔥', name: '壁炉', desc: '秋冬自己点着，也能手动开关', price: 900 },
    { id: 'tv', builtin: true, icon: '📺', name: '电视和游戏机', desc: '两只一起打游戏', price: 1200 },
    { id: 'piano', builtin: true, icon: '🎹', name: '钢琴', desc: '可以弹，唱片机也放在它上面', price: 1500 },
    { id: 'bed', builtin: true, icon: '🛏️', name: '床', desc: '睡得下两只', price: 400 },
    { id: 'plant', icon: '🪴', name: '盆栽', desc: '屋里屋外都能摆', price: 300 },
    { id: 'monstera', icon: '🌿', name: '龟背竹', desc: '大叶子盆栽，摆在屋里', price: 500 },
    { id: 'globe', icon: '🌍', name: '地球仪', desc: '书房必备', price: 600 },
    { id: 'flowerbed', icon: '🌷', name: '花坛', desc: '院子里的小花坛，花跟着季节换', price: 700 },
    { id: 'lamppost', icon: '🏮', name: '路灯', desc: '院子里的路灯，晚上会亮', price: 800 },
    { id: 'xmastree', icon: '🎄', name: '圣诞树', desc: '挂满会闪的小彩灯', price: 1200 },
    { id: 'loveseat', icon: '🛋️', name: '双人小沙发', desc: '屋里多两个座位', price: 1500 },
    { id: 'telescope', icon: '🔭', name: '望远镜', desc: '天黑以后有人会来看星星', price: 1800 },
    { id: 'hammock', icon: '🏝️', name: '吊床', desc: '院子里打个盹', price: 2000 },
    { id: 'arcade', icon: '🕹️', name: '街机', desc: '一个人也能玩的游戏机', price: 2500 },
  ],
  // 庭院：摆在院子里的设施
  yard: [
    // 院子里原来的设施
    { id: 'garden', builtin: true, icon: '🥕', name: '菜园', desc: '种菜收菜，能换 Token', price: 400 },
    { id: 'swing', builtin: true, icon: '🪢', name: '秋千', desc: '荡得越来越高', price: 700 },
    { id: 'tramp', builtin: true, icon: '🤸', name: '蹦床', desc: '蹦蹦蹦，还能把人弹飞', price: 900 },
    { id: 'camp', builtin: true, icon: '🏕️', name: '篝火', desc: '晚上点起来，大家围着烤火', price: 1000 },
    { id: 'pond', builtin: true, icon: '🎣', name: '钓鱼池塘', desc: '钓到鱼能换 Token', price: 1200 },
    { id: 'spring', builtin: true, icon: '♨️', name: '温泉', desc: '泡四只，冬天最受欢迎', price: 2500 },
    { id: 'birdhouse', icon: '🐦', name: '鸟屋', desc: '白天有只小蓝鸟进进出出', price: 600 },
    { id: 'picnic', icon: '🧺', name: '野餐垫', desc: '格子布 + 野餐篮，坐两个', price: 800 },
    { id: 'sandbox', icon: '🏖️', name: '沙坑', desc: '两只一起堆沙子城堡', price: 900 },
    { id: 'lounger', icon: '⛱️', name: '遮阳伞躺椅', desc: '躺着晒太阳打个盹', price: 1400 },
    { id: 'slide', icon: '🛝', name: '滑梯', desc: '爬上去、滑下来，玩个不停', price: 2200 },
    { id: 'fountain', icon: '⛲', name: '喷泉', desc: '水一直往上喷，还能扔硬币许愿', price: 2600 },
  ],
  // 乐器：两只以上一起演奏就是合奏，会有音乐（唱片机开着时让唱片机先放）
  music: [
    { id: 'guitar', icon: '🎸', name: '吉他', desc: '坐在小凳上弹，屋里屋外都能摆', price: 1500 },
    { id: 'violin', icon: '🎻', name: '小提琴', desc: '配一个乐谱架', price: 1800 },
    { id: 'synth', icon: '🎹', name: '电子琴', desc: '哔哔啵啵的合成器', price: 2000 },
    { id: 'drums', icon: '🥁', name: '架子鼓', desc: '合奏的节奏担当', price: 2500 },
    { id: 'bass', icon: '🎸', name: '贝斯', desc: '配一个小音箱，低音一响乐队就稳了', price: 2200 },
    { id: 'flute', icon: '🪈', name: '长笛', desc: '清清亮亮的，雨天波萨最爱它', price: 1600 },
    { id: 'accordion', icon: '🪗', name: '手风琴', desc: '海边华尔兹就等它开口', price: 2400 },
    { id: 'marimba', icon: '🎶', name: '木琴', desc: '叮叮咚咚，敲起来很治愈', price: 2800 },
    { id: 'sax', icon: '🎷', name: '萨克斯', desc: '爵士小猫的灵魂', price: 3000 },
  ],
  // 增益：买了立刻生效
  boost: [
    { id: 'double', icon: '⚡', name: '双倍产出', desc: '10 分钟内产出 ×2', price: 600 },
    { id: 'fertilizer', icon: '🌱', name: '速熟肥料', desc: '菜园里的作物立刻全部成熟', price: 240 },
    { id: 'bugbait', icon: '🐛', name: 'Bug 诱饵', desc: '马上引来一只 Bug', price: 90 },
    { id: 'candy', icon: '🍬', name: '好感糖果', desc: '所有伙伴好感 +5', price: 400 },
  ],
};
const SHOP_TABS = [['gift', '礼物'], ['wear', '配饰'], ['decor', '装饰'], ['furn', '家具'], ['yard', '庭院'], ['music', '乐器'], ['boost', '增益']];
const PLACEABLE = ['furn', 'yard', 'music'];   // 买了要摆出来的分类
const FURN_MAX = 3;                    // 每种家具最多买几件
const WEAR_SLOTS = { head: '头上', face: '脸上', neck: '脖子', bath: '泡澡时' };

// 每个角色最喜欢的礼物
const FAVORITE_GIFT = {
  claude: 'book', deepseek: 'gpu', llama: 'hay', gemini: 'flowers', gpt: 'cake', hf: 'cookie',
  mistral: 'baguette', qwen: 'milktea', grok: 'sauce', kimi: 'mooncake', clawd: 'keyboard', muse: 'avocado',
};

const shopItem = (id) => Object.values(SHOP).flat().find((x) => x.id === id);
