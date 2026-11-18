// 规则层：宠物需求、你的精力、两个假朋友的作息、后果（闹脾气 / 生病 / 跑去朋友角落 / 想念）。
// 不碰画面、不碰平台：node 里也能直接跑（test/balance.js 用它算几百天）。
const C = require('./config.js');

const NEEDS = ['food', 'rest', 'love', 'clean'];
const DAY = 1440;
const ACT_NEED = { feed: 'food', pat: 'love', tuck: 'rest', clean: 'clean' };
const VERB = { feed: '喂了它', pat: '摸了摸它的头', tuck: '给它盖了被子', clean: '给它洗干净了' };
const SHORT = { feed: '喂', pat: '摸', tuck: '盖被', clean: '洗' };

function hm(s) {
  const p = s.split(':');
  return +p[0] * 60 + +p[1];
}

function friendCfg(id) {
  return C.friends.find((f) => f.id === id);
}

function name(who) {
  if (who === 'me') return '你';
  const f = friendCfg(who);
  return f ? f.name : who;
}

// 存在存档里的随机数（mulberry32），每次取一个都会变
function rand(S) {
  let a = (S.rs = (S.rs + 0x6d2b79f5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function newState(seed) {
  const t = (C.time.startDay - 1) * DAY + C.time.startHour * 60;
  const S = {
    v: 1,
    t,
    rs: seed | 0,
    needs: Object.assign({}, C.needs.start),
    asleep: false,
    floorSleep: false,
    blanket: null, // 谁盖的被子
    sleepT: 0,
    sick: false,
    neglect: 0,
    recover: 0,
    sulk: false,
    corner: null, // 它跑去谁的角落了
    energy: C.energy.start,
    energyAcc: 0,
    last: { me: t, c: t - 60, s: t - 120 }, // 每个人上次来照顾的时间
    lastBy: { feed: null, pat: null, tuck: null, clean: null }, // 每样东西最后是谁做的（房间里的痕迹）
    friends: {},
    cover: null, // { who, acts:[], until, reason }
    hearts: { c: 0, s: 0 }, // 朋友留在她角落的爱心
    sentHeart: { c: -1, s: -1 }, // 你哪天给她留过爱心
    owed: { c: 0, s: 0 }, // 你替她做过几次（她下次来会回谢）
    missing: {}, // 它正在想谁
    furniture: { me: null },
    unlocked: {},
    log: [],
    events: [], // 给画面层的一次性事件（敲门、朋友来了……）
    stats: { min: 0, sickMin: 0, sulkMin: 0, cornerMin: 0, lowMin: 0, needSum: 0, covers: 0, adCovers: 0, missed: 0, doctor: 0, sickTimes: 0, myActs: 0 },
  };
  for (const f of C.friends) S.friends[f.id] = { tripUntil: -1, visitUntil: -1, lastShift: {} };
  return S;
}

function log(S, who, text, kind) {
  // 同一句话一小时内不重复记
  for (let i = S.log.length - 1; i >= 0 && S.t - S.log[i].t < 60; i--) {
    if (S.log[i].who === who && S.log[i].text === text) return;
  }
  S.log.push({ t: Math.round(S.t), who, text, kind: kind || '' });
  if (S.log.length > 80) S.log.splice(0, S.log.length - 80);
}

function event(S, e) {
  S.events.push(e);
  if (S.events.length > 30) S.events.shift();
}

function clamp(v) {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

// —— 能不能做这件事（不能的话返回理由，给画面层显示）——
function check(S, act, who) {
  const n = S.needs;
  if (who === 'me' && S.energy < 1) return 'tired';
  if (act === 'feed') {
    if (S.asleep) return 'asleep';
    if (n.food >= C.acts.feed.fullAt) return 'full';
  } else if (act === 'pat') {
    if (n.love >= C.acts.pat.fullAt) return 'full';
  } else if (act === 'tuck') {
    if (S.asleep && S.blanket) return 'asleep';
    if (!S.asleep && n.rest >= C.acts.tuck.sleepyAt) return 'notSleepy';
  } else if (act === 'clean') {
    if (S.asleep) return 'asleep';
    if (n.clean >= C.acts.clean.fullAt) return 'full';
  }
  return null;
}

// 做一件照顾的事。free = 看广告代做（不花精力）。返回 null 或不能做的理由。
function act(S, kind, who, opts) {
  opts = opts || {};
  const why = check(S, kind, opts.free ? 'ad' : who);
  if (why) return why;
  const n = S.needs;
  const A = C.acts;
  if (kind === 'feed') {
    n.food = clamp(n.food + (S.sick ? A.feed.sickGain : A.feed.gain));
    n.clean = clamp(n.clean - A.feed.cleanCost);
  } else if (kind === 'pat') {
    n.love = clamp(n.love + (S.asleep ? A.pat.asleepGain : A.pat.gain));
  } else if (kind === 'tuck') {
    S.asleep = true;
    S.floorSleep = false;
    S.blanket = who;
    S.sleepT = 0;
  } else if (kind === 'clean') {
    n.clean = clamp(n.clean + A.clean.gain);
  }
  if (kind !== 'pat') n.love = clamp(n.love + A.companyLove);
  if (who === 'me' && !opts.free) S.energy -= 1;
  if (who === 'me') S.stats.myActs++;

  // 替缺席的朋友做了她该做的事
  let covered = null;
  if (who === 'me' && S.cover && S.t <= S.cover.until && S.cover.acts.indexOf(kind) >= 0) {
    covered = S.cover.who;
    S.cover.acts.splice(S.cover.acts.indexOf(kind), 1);
    S.owed[covered]++;
    S.stats.covers++;
    if (opts.free) S.stats.adCovers++;
    if (!S.cover.acts.length) S.cover = null;
  }
  S.last[who] = S.t;
  S.lastBy[kind] = { who, t: Math.round(S.t) };
  if (S.missing[who]) delete S.missing[who];
  if (covered) log(S, who, '替' + name(covered) + VERB[kind], 'cover');
  else log(S, who, VERB[kind], kind);
  if (who === 'me' && S.corner && n.love >= C.corner.backAt) backFromCorner(S);
  return null;
}

function backFromCorner(S) {
  S.corner = null;
  log(S, 'pet', '回到了屋子中间', 'back');
  event(S, { type: 'back' });
}

function doctor(S) {
  if (!S.sick) return false;
  S.sick = false;
  S.neglect = 0;
  S.recover = 0;
  for (const k of NEEDS) S.needs[k] = Math.max(S.needs[k], 45);
  S.stats.doctor++;
  log(S, 'me', '请医生来看了它，它好了', 'doctor');
  return true;
}

// 你给朋友留一个预设动作（敲门 / 留爱心）
function send(S, to, what) {
  const day = Math.floor(S.t / DAY);
  if (what === 'heart') {
    if (S.sentHeart[to] === day) return 'already';
    S.sentHeart[to] = day;
    log(S, 'me', '给' + name(to) + '留了一颗爱心', 'heart');
  } else {
    log(S, 'me', '敲了敲' + name(to) + '的门', 'knock');
  }
  return null;
}

function collectHeart(S, from) {
  if (!S.hearts[from]) return false;
  S.hearts[from] = 0;
  S.energy = Math.min(C.energy.max + 1, S.energy + C.heartEnergy); // 爱心可以多出一格
  return true;
}

// —— 朋友到点来上班 ——
function friendShift(S, f, shift) {
  const fs = S.friends[f.id];
  const day = Math.floor(S.t / DAY);
  if (fs.lastShift[shift.at] === day) return;
  fs.lastShift[shift.at] = day;

  let reason = null;
  if (S.t < fs.tripUntil) reason = '出远门了';
  else {
    let p = f.skip;
    if (S.sentHeart[f.id] >= day - 1) p *= C.heartSkipMul;
    if (rand(S) < p) reason = f.reasons[Math.floor(rand(S) * f.reasons.length)];
  }
  if (reason) {
    S.stats.missed++;
    // 只为真正需要的事求你替：已经满的就不算
    const need = shift.acts.filter((a) => a === 'pat' || check(S, a, f.id) !== 'full');
    log(S, f.id, '没来（' + reason + '）', 'miss');
    if (need.length) {
      S.cover = { who: f.id, acts: need.slice(), until: S.t + C.cover.windowMin, reason };
      event(S, { type: 'absent', who: f.id });
    }
    return;
  }
  // 来了
  if (S.cover && S.cover.who === f.id) S.cover = null;
  fs.visitUntil = S.t + C.friendVisitMin;
  event(S, { type: 'arrive', who: f.id });
  for (const a of shift.acts) {
    let r = act(S, a, f.id);
    if (r) act(S, 'pat', f.id); // 要做的事已经不用做了，就摸摸它
  }
  if (!S.last[f.id] || S.last[f.id] < S.t) S.last[f.id] = S.t;
  if (S.owed[f.id] > 0) {
    S.owed[f.id] = 0;
    S.hearts[f.id] = 1;
    log(S, f.id, '回了你一个「谢谢」，留下一颗爱心', 'thanks');
  } else if (rand(S) < f.heartChance) {
    S.hearts[f.id] = 1;
    log(S, f.id, '留了一颗爱心', 'heart');
  }
  if (rand(S) < f.knockChance) {
    log(S, f.id, '敲了敲门', 'knock');
    event(S, { type: 'knock', who: f.id });
  }
}

// 往前走 dt 游戏分钟（内部按 1 分钟一步）
function advance(S, dt) {
  S._acc = (S._acc || 0) + dt;
  while (S._acc >= 1) {
    S._acc -= 1;
    step(S);
  }
}

function step(S) {
  const prevDay = Math.floor(S.t / DAY);
  const prevMin = S.t % DAY;
  S.t += 1;
  const day = Math.floor(S.t / DAY);
  const min = S.t % DAY;
  const n = S.needs;
  const N = C.needs;
  const h = 1 / 60;

  // 出远门：每天早上决定一次
  if (day !== prevDay) {
    for (const f of C.friends) {
      const fs = S.friends[f.id];
      if (S.t >= fs.tripUntil && f.tripPerDay && rand(S) < f.tripPerDay) {
        const d = f.tripDays[0] + Math.floor(rand(S) * (f.tripDays[1] - f.tripDays[0] + 1));
        fs.tripUntil = S.t + d * DAY;
        log(S, f.id, '出远门了（' + d + '天）', 'trip');
      }
    }
  }

  // 需求往下掉
  const sickMul = S.sick ? N.sickMul : 1;
  for (const k of NEEDS) {
    if (k === 'rest') continue;
    const m = S.asleep ? N.sleepMul[k] : 1;
    n[k] = clamp(n[k] - N.decayPerHour[k] * h * m * sickMul);
  }
  if (S.asleep) {
    const r = C.sleep.restorePerHour * (S.floorSleep ? C.sleep.floorMul : 1);
    n.rest = clamp(n.rest + r * h);
    S.sleepT += 1;
    if (S.floorSleep && !S.sick && rand(S) < C.sleep.floorColdPerHour * h) {
      getSick(S, '睡地板着凉了');
    }
    let wake = null;
    if (n.rest >= 100 || S.sleepT >= C.acts.tuck.maxSleepMin) wake = '睡醒了';
    else if (n.food <= C.sleep.wakeHungryAt) wake = '饿醒了';
    if (wake) {
      S.asleep = false;
      S.floorSleep = false;
      S.blanket = null;
      log(S, 'pet', wake, 'wake');
      event(S, { type: 'wake' });
    }
  } else {
    n.rest = clamp(n.rest - N.decayPerHour.rest * h * sickMul);
    if (n.rest <= C.sleep.collapseAt && n.food <= C.sleep.wakeHungryAt + 4) {
      // 又困又饿：饿得睡不着（只记一次）
      if (!S.hungryAwake) {
        S.hungryAwake = true;
        log(S, 'pet', '又困又饿，睡不着', 'sulk');
      }
    } else if (n.rest <= C.sleep.collapseAt) {
      S.hungryAwake = false;
      S.asleep = true;
      S.floorSleep = true;
      S.blanket = null;
      S.sleepT = 0;
      log(S, 'pet', '困得直接睡在了地板上', 'floor');
    }
  }

  // 精力
  if (S.energy < C.energy.max) {
    S.energyAcc += 1;
    if (S.energyAcc >= C.energy.regenMin) {
      S.energyAcc = 0;
      S.energy += 1;
    }
  } else S.energyAcc = 0;

  // 闹脾气
  const lowest = Math.min(n.food, n.rest, n.love, n.clean);
  if (!S.sulk && lowest < C.sulk.below) {
    S.sulk = true;
    const k = NEEDS.reduce((a, b) => (n[a] <= n[b] ? a : b));
    log(S, 'pet', '闹脾气了（' + { food: '太饿', rest: '太困', love: '没人理它', clean: '身上脏' }[k] + '）', 'sulk');
  } else if (S.sulk && lowest >= C.sulk.recoverAt) {
    S.sulk = false;
    log(S, 'pet', '不生气了', 'unsulk');
  }

  // 生病
  if (!S.sick) {
    if (lowest <= C.sick.neglectAt) S.neglect += 1;
    else S.neglect = Math.max(0, S.neglect - 0.5);
    if (S.neglect >= C.sick.neglectMin) getSick(S, '被冷落太久');
  } else {
    if (lowest >= C.sick.recoverAllAbove) S.recover += 1;
    else S.recover = 0;
    if (S.recover >= C.sick.recoverMin) {
      S.sick = false;
      S.recover = 0;
      S.neglect = 0;
      log(S, 'pet', '慢慢自己好了', 'cured');
    }
  }

  // 跑去朋友角落
  if (!S.corner && n.love < C.corner.loveBelow) {
    let best = null;
    for (const f of C.friends) if (!best || S.last[f.id] > S.last[best]) best = f.id;
    if (best && S.last[best] > S.last.me) {
      S.corner = best;
      log(S, 'pet', '跑去' + name(best) + '的角落睡了', 'corner');
      event(S, { type: 'corner', who: best });
    }
  } else if (S.corner && n.love >= C.corner.backAt) backFromCorner(S);

  // 想念：谁很久没来
  for (const who of ['me', 'c', 's']) {
    const gone = S.t - S.last[who] >= C.miss.afterMin;
    if (gone && !S.missing[who]) {
      S.missing[who] = S.t;
      if (who !== 'me') log(S, 'pet', '一直望着' + name(who) + '的角落', 'missing');
    } else if (!gone && S.missing[who]) delete S.missing[who];
  }

  // 朋友到点
  for (const f of C.friends) {
    for (const sh of f.shifts) {
      const at = hm(sh.at);
      if (prevMin < at && min >= at) friendShift(S, f, sh);
    }
  }
  if (S.cover && S.t > S.cover.until) {
    log(S, 'pet', '没等到' + name(S.cover.who), 'expire');
    S.cover = null;
  }

  // 统计（机器人比较懒人和勤快人用）
  const st = S.stats;
  st.min++;
  st.needSum += (n.food + n.rest + n.love + n.clean) / 4;
  if (S.sick) st.sickMin++;
  if (S.sulk) st.sulkMin++;
  if (S.corner) st.cornerMin++;
  if (lowest < N.lowAt) st.lowMin++;
}

function getSick(S, why) {
  S.sick = true;
  S.recover = 0;
  S.stats.sickTimes++;
  log(S, 'pet', '生病了（' + why + '）', 'sick');
  event(S, { type: 'sick' });
}

// 它现在最想要什么（分享卡、提示用）
function worst(S) {
  if (S.sick) return 'sick';
  const n = S.needs;
  const k = NEEDS.reduce((a, b) => (n[a] <= n[b] ? a : b));
  return n[k] < 45 ? k : 'ok';
}

// 「小C 昨晚 23:10 给它盖了被子」
function when(t, now) {
  const d = Math.floor(t / DAY);
  const nd = Math.floor(now / DAY);
  const m = ((t % DAY) + DAY) % DAY;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  const clock = hh + ':' + (mm < 10 ? '0' : '') + mm;
  const part = hh < 5 ? '凌晨' : hh < 9 ? '早上' : hh < 12 ? '上午' : hh < 14 ? '中午' : hh < 18 ? '下午' : hh < 19 ? '傍晚' : '晚上';
  let day;
  if (d === nd) day = part === '晚上' ? '今晚' : '今天' + part;
  else if (d === nd - 1) day = part === '晚上' ? '昨晚' : '昨天' + part;
  else day = nd - d + '天前' + part;
  return day + ' ' + clock;
}

function line(e, now) {
  const who = e.who === 'pet' ? C.petName : name(e.who);
  return who + ' ' + when(e.t, now) + ' ' + e.text;
}

module.exports = { NEEDS, DAY, ACT_NEED, VERB, SHORT, newState, advance, act, check, doctor, send, collectHeart, worst, when, line, name, friendCfg, rand };
