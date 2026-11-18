// 《留灯》原型 · 所有可以调的数都在这里。
// 时间单位：游戏里的「分钟」（一天 = 1440 分钟）。需求值 0~100，100 = 完全满足。

const config = {
  version: '留灯 · 原型 0.1',
  saveKey: 'liudeng_save_v1',
  petName: '灯芯',

  // —— 时间 ——
  time: {
    // 真实 1 分钟 = 游戏里几分钟。1 = 跟真实时间一样；10 = 真实 2.4 小时过完游戏一天。
    gamePerRealMin: 10,
    startDay: 1,
    startHour: 19, // 第一次打开时是几点（傍晚开局，马上就到小C的夜班）
    offlineMaxMin: 36 * 60, // 关掉再打开，最多补算多久（游戏分钟）
    awaySummaryMin: 30, // 离开超过这么久，回来弹「你不在的时候」
    fastForwardMin: 180, // 调试按钮「快进」一次快进多久
  },

  // —— 需求：每小时掉多少（醒着时）。睡着时乘 sleepMul，生病时乘 sickMul ——
  needs: {
    start: { food: 70, rest: 55, love: 65, clean: 75 },
    decayPerHour: { food: 6.5, rest: 4.5, love: 5.5, clean: 4 },
    sleepMul: { food: 0.5, love: 0.4, clean: 0.4 },
    sickMul: 1.35,
    lowAt: 30, // 低于这个，需求条变红、闪
  },

  // —— 照顾动作 ——
  acts: {
    feed: { gain: 32, sickGain: 22, cleanCost: 7, fullAt: 88 }, // 吃完会弄脏一点
    pat: { gain: 22, asleepGain: 12, fullAt: 96, rubDist: 260, sulkRubMul: 2 }, // rubDist：手指在它身上划多长算摸完一次（点）
    tuck: { sleepyAt: 75, maxSleepMin: 6 * 60 }, // 困到 75 以下才肯盖被子睡；最多睡多久
    clean: { gain: 50, fullAt: 88, rubDist: 320 },
    companyLove: 3, // 有人来做任何事，它都开心一点
  },

  // —— 睡觉 ——
  sleep: {
    restorePerHour: 20, // 盖着被子睡，每小时回多少
    floorMul: 0.55, // 没盖被子睡地板，只回这么多
    collapseAt: 8, // 困到这个值就直接倒在地板上睡
    wakeHungryAt: 8, // 饿到这个值会被饿醒
    floorColdPerHour: 0.08, // 睡地板每小时着凉（生病）的机会
  },

  // —— 你的精力：一个人照顾不过来 ——
  energy: {
    max: 3, // 最多攒几点
    regenMin: 180, // 多久回一点（游戏分钟）
    start: 3,
  },

  // —— 后果 ——
  sulk: { below: 25, recoverAt: 40 }, // 任何一项低于 25 闹脾气（背过身、摸要摸两倍久），都回到 40 以上才好
  sick: {
    neglectAt: 5, // 某项低到这个值开始算「被冷落」
    neglectMin: 360, // 被冷落累计这么久就生病
    recoverAllAbove: 50, // 不请医生：所有需求都在 50 以上……
    recoverMin: 10 * 60, // ……连续这么久才自己好
  },
  corner: { loveBelow: 22, backAt: 50 }, // 心情太低，它会跑去最近照顾它的朋友角落睡；回到 50 才回来
  miss: { afterMin: 20 * 60 }, // 谁超过这么久没来，它就望着谁的角落

  // —— 两个假朋友（第一版没有服务器，朋友是按作息自己来的假人）——
  // shifts：每天几点来、做什么。skip：每次缺席的机会。tripPerDay：出远门（连着几天不来）的机会
  friends: [
    {
      id: 'c', name: '小C', habit: '夜猫子', tag: '#7f9a5a',
      shifts: [{ at: '23:10', acts: ['tuck', 'pat'] }, { at: '13:20', acts: ['pat'] }],
      skip: 0.3, tripPerDay: 0.0, tripDays: [1, 2],
      reasons: ['在加班', '赶稿到很晚', '和同事聚餐', '睡着了'],
      heartChance: 0.45, knockChance: 0.35, furniture: 'record',
    },
    {
      id: 's', name: '阿树', habit: '早起', tag: '#5b7fb0',
      shifts: [{ at: '07:40', acts: ['feed', 'clean'] }, { at: '18:30', acts: ['feed'] }],
      skip: 0.22, tripPerDay: 0.12, tripDays: [1, 2],
      reasons: ['睡过头了', '临时加班', '赶地铁没空'],
      heartChance: 0.4, knockChance: 0.4, furniture: 'plant',
    },
  ],
  friendVisitMin: 25, // 朋友来了在角落站多久（看得到她）
  heartSkipMul: 0.5, // 你今天给她留了爱心，她缺席的机会减半
  heartEnergy: 1, // 收下朋友留的爱心，回几点精力

  // 朋友缺席后，「替她」的窗口
  cover: { windowMin: 240 },

  // —— 激励视频（假的）——
  rewardedAdUnitId: '', // 空着 = 放「广告占位」
  fakeAdSec: 1.5,

  // —— 家具：每人一个角落放一件 ——
  furniture: {
    mine: ['beanbag', 'shelf', 'tank', 'yarn'], // 免费可选
    limited: 'tent', // 限定：看广告解锁
  },

  // —— 分享卡（假的，只展示） ——
  share: {
    realShare: false, // true 时在微信里真的调起分享
    lines: {
      food: '它饿了，快回来喂它',
      rest: '它困了，快回来给它盖被子',
      love: '它想你了，快回来摸摸它',
      clean: '它脏兮兮的，快回来帮它洗洗',
      sick: '它生病了，快回来看看它',
      ok: '灯还亮着，回来坐坐',
    },
  },
};

module.exports = config;
