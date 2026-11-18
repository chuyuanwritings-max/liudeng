// 《留灯》原型主程序：开场 → 小屋。所有画面画在一张 canvas 上（微信小游戏没有 HTML 按钮）。
//
// 小屋里：
//   上面   钟 + 你的精力（灯火）+ 调试「快进」
//   中间   房间：小C 的角落（左）、你的角落（窗下）、阿树的角落（右），猫「灯芯」在地毯上
//   下面   四条需求（饱 / 困 / 心 / 净）→ 四个照顾按钮（喂 / 摸 / 盖被 / 洗）→ 最新一条痕迹 + 分享
// 弹层（G.over）：away 你不在的时候 · log 全部痕迹 · share 分享卡 · friend 朋友 · furn 摆家具 · ad 广告占位
const platform = require('./platform.js');
const config = require('./config.js');
const sim = require('./sim.js');
const pix = require('./pix.js');
const room = require('./room.js');
const sfx = require('./sfx.js');
const { PAL } = pix;

const DESIGN_W = 375;
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
const P = platform.setup(onTouch);
const scale = P.width / DESIGN_W;
const L = { W: DESIGN_W, H: P.height / scale };
const ctx = P.ctx;

// —— 版面 ——
const TOP = 56;
const BOTTOM_UI = 238;
const R = room.layout(L.W, TOP, L.H - BOTTOM_UI);
const UI = (() => {
  const y0 = R.bottom;
  const needsY = y0 + 12;
  const btnY = needsY + 76;
  const traceY = btnY + 66;
  return {
    needsY,
    btnY,
    traceY,
    btns: ['feed', 'pat', 'tuck', 'clean'].map((k, i) => ({ id: 'act_' + k, act: k, x: 50 + i * 91.7, y: btnY, r: 33 })),
  };
})();

const NEED_ICON = { food: 'food', rest: 'rest', love: 'love', clean: 'clean' };
const ACT_ICON = { feed: 'food', pat: 'hand', tuck: 'blanket', clean: 'sponge' };
const ACT_LABEL = { feed: '喂', pat: '摸头', tuck: '盖被', clean: '洗' };
const REASON = { tired: '没精力了', asleep: '嘘…它在睡', full: '它现在不需要', notSleepy: '它还不困' };

// —— 状态 ——
let S = null; // 规则层存档（sim.js）
const G = {
  mode: 'title',
  t: 0,
  over: null, // 当前弹层
  buttons: [],
  pressed: null,
  tool: null, // 'clean' = 拿着海绵
  hint: 0, // 「在它身上来回划」提示还剩几秒
  rub: null, // { id, x, y, dist, moved, kind }
  parts: [],
  floats: [],
  toast: null,
  big: null, // 大字（替朋友、治好……）
  flash: 0,
  lampBoost: 0,
  doorShake: 0,
  bars: null, // 需求条显示值（平滑追上真实值）
  pet: { x: R.pet.x, y: R.pet.y, face: 1, hop: 0, happy: 0, eat: 0, blink: 0, nextBlink: 2, wander: 0, wx: 0, lookAt: null, lookT: 0, react: 0 },
  blanketDrop: 0,
  pour: 0,
  visitors: {}, // 正在屋里的朋友：{ c: 剩几秒 }
  saveT: 0,
  ffCount: 0,
  firstRoom: true,
};

function now() {
  return platform.now();
}

// —— 存档 ——
function loadOrNew() {
  const saved = platform.load(config.saveKey);
  if (saved && saved.v === 1) {
    S = saved;
    S.events = [];
    const lastReal = S.lastReal || now();
    const gone = Math.max(0, ((now() - lastReal) / 60000) * config.time.gamePerRealMin);
    catchUp(Math.min(gone, config.time.offlineMaxMin), '你不在的时候');
  } else {
    S = sim.newState(Math.floor(Math.random() * 1e9));
    S.lastReal = now();
    S.firstOpen = true;
  }
  G.bars = Object.assign({}, S.needs);
}

function save() {
  S.lastReal = now();
  platform.save(config.saveKey, S);
}

// 补算一段时间（关掉再打开 / 快进），之后弹「你不在的时候」
function catchUp(min, title) {
  if (min < 1) return;
  const from = S.t;
  const missedMe = S.missing.me;
  const wasSick = S.sick;
  sim.advance(S, min);
  S.events = [];
  const lines = S.log.filter((e) => e.t > from);
  if (min >= config.time.awaySummaryMin || lines.length) {
    G.over = { type: 'away', title, min: Math.round(min), lines, t: 0, reunion: !!S.missing.me || missedMe, sickNow: S.sick && !wasSick };
  }
}

// —— 输入 ——
function hit(b, x, y) {
  if (b.r) return Math.hypot(x - b.x, y - b.y) <= b.r + 6;
  return x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4;
}

function findButton(x, y) {
  for (let i = G.buttons.length - 1; i >= 0; i--) if (hit(G.buttons[i], x, y)) return G.buttons[i];
  return null;
}

function petHit(x, y) {
  const p = G.pet;
  return Math.abs(x - p.x) < 52 && y > p.y - 78 && y < p.y + 10;
}

function onTouch(type, id, sx, sy) {
  const x = sx / scale;
  const y = sy / scale;
  if (type === 'down') {
    const b = findButton(x, y);
    if (b) {
      G.pressed = { id: b.id, tid: id };
      sfx.press();
      return;
    }
    if (G.mode === 'room' && !G.over && petHit(x, y)) {
      G.rub = { id, x, y, x0: x, y0: y, dist: 0, moved: 0, kind: G.tool === 'clean' ? 'clean' : 'pat', lastSnd: 0, step: 0 };
      return;
    }
    if (G.over && G.over.tapClose) G.pressed = { id: '__close', tid: id };
  } else if (type === 'move') {
    if (G.rub && G.rub.id === id) rubMove(x, y);
  } else if (type === 'up') {
    if (G.rub && G.rub.id === id) {
      if (G.rub.moved < 10) tapPet();
      G.rub = null;
      return;
    }
    if (G.pressed && G.pressed.tid === id) {
      const pid = G.pressed.id;
      G.pressed = null;
      if (pid === '__close') {
        if (G.over && G.over.tapClose && G.over.t > 0.3) closeOver();
        return;
      }
      const b = findButton(x, y);
      if (b && b.id === pid && b.onTap) b.onTap();
    }
  }
}

function closeOver() {
  const o = G.over;
  G.over = null;
  sfx.tap();
  if (o && o.type === 'away' && o.reunion) reunion();
}

// —— 照顾 ——
function burst(x, y, kind, n, spread) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (spread || 60) * (0.4 + Math.random() * 0.8);
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.9 + Math.random() * 0.6, t: 0, kind });
  }
}

function floatText(text, x, y, col, iconName) {
  G.floats.push({ text, x, y, t: 0, col: col || PAL.cream2, icon: iconName });
}

function toast(text, iconName) {
  G.toast = { text, t: 0, icon: iconName };
}

function bigMoment(text, who) {
  G.big = { text, t: 0, who };
  G.flash = 0.6;
  G.lampBoost = 0.5;
  burst(G.pet.x, G.pet.y - 40, 'heart', 22, 140);
  platform.vibrate(true);
}

function refuse(why) {
  sfx.no();
  platform.vibrate(false);
  toast(REASON[why] || '现在不行', why === 'tired' ? 'energy' : null);
  G.pet.react = 0.4;
}

// 做一件事，成功后的反馈都在这里
function doAct(kind, opts) {
  opts = opts || {};
  const before = Object.assign({}, S.needs);
  const coverWho = S.cover && S.cover.acts.indexOf(kind) >= 0 ? S.cover.who : null;
  const r = sim.act(S, kind, 'me', opts);
  if (r) {
    refuse(r);
    return false;
  }
  const p = G.pet;
  const need = sim.ACT_NEED[kind];
  const gain = Math.round(S.needs[need] - before[need]);
  if (kind === 'feed') {
    G.pour = 1.2;
    p.eat = 2.6;
    sfx.pour();
  } else if (kind === 'tuck') {
    G.blanketDrop = 0.5;
    sfx.whoosh();
    sfx.lullaby();
    burst(p.x, p.y - 30, 'star', 8, 60);
  } else if (kind === 'pat') {
    sfx.purr();
    burst(p.x, p.y - 50, 'heart', 8, 70);
  } else if (kind === 'clean') {
    burst(p.x, p.y - 30, 'spark', 14, 90);
    for (let i = 0; i < 5; i++) setTimeoutGame(() => sfx.bubble(), i * 0.07);
  }
  sfx.done();
  platform.vibrate(false);
  p.happy = 1.4;
  p.hop = 0.35;
  if (gain > 0 && kind !== 'tuck') floatText('+' + gain, needX(need), UI.needsY - 6, PAL.glow, NEED_ICON[need]);
  if (kind === 'tuck') floatText('晚安', p.x, p.y - 70, PAL.glow, 'rest');
  if (coverWho) {
    sfx.cover();
    bigMoment('你替' + sim.name(coverWho) + sim.VERB[kind], coverWho);
  } else if (sim.NEEDS.every((k) => S.needs[k] >= 80)) {
    G.lampBoost = 0.35;
    burst(p.x, p.y - 40, 'spark', 16, 110);
    floatText('它很满足', p.x, p.y - 92, PAL.glow);
  }
  G.tool = null;
  save();
  return true;
}

// 摸 / 洗：手指在它身上来回划
function rubMove(x, y) {
  const r = G.rub;
  const d = Math.hypot(x - r.x, y - r.y);
  r.x = x;
  r.y = y;
  r.moved += d;
  if (r.moved < 10) return;
  const kind = r.kind;
  const act = kind === 'clean' ? 'clean' : 'pat';
  const why = sim.check(S, act, 'me');
  r.dist += d;
  r.step += d;
  if (r.step > 22) {
    r.step = 0;
    if (kind === 'clean') {
      G.parts.push({ x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 20, vy: -30, life: 0.9, t: 0, kind: 'bubble' });
      sfx.bubble();
    } else {
      G.parts.push({ x, y: y - 8, vx: (Math.random() - 0.5) * 30, vy: -50, life: 0.8, t: 0, kind: 'heart' });
      if (G.t - r.lastSnd > 0.3) {
        r.lastSnd = G.t;
        if (S.sulk && Math.random() < 0.5) sfx.sulk();
        else sfx.purr();
      }
    }
    G.pet.happy = Math.max(G.pet.happy, 0.25);
  }
  if (why) {
    if (!r.warned) {
      r.warned = true;
      toast(REASON[why], why === 'tired' ? 'energy' : null);
    }
    return;
  }
  const need = act === 'clean' ? config.acts.clean.rubDist : config.acts.pat.rubDist * (S.sulk ? config.acts.pat.sulkRubMul : 1);
  r.need = need;
  if (r.dist >= need) {
    r.dist = 0;
    doAct(act);
  }
}

function tapPet() {
  const p = G.pet;
  if (S.asleep) {
    toast('嘘…它在睡');
    sfx.tap();
    return;
  }
  if (S.sulk) {
    sfx.sulk();
    p.react = 0.5;
    toast('它在闹脾气，多摸一会儿');
    return;
  }
  sfx.meow();
  p.hop = 0.3;
  p.happy = 0.6;
  G.hint = Math.max(G.hint, 1.2);
}

function needX(k) {
  return 12 + sim.NEEDS.indexOf(k) * 89 + 44;
}

function onActButton(kind) {
  if (kind === 'feed' || kind === 'tuck') {
    doAct(kind);
    return;
  }
  const why = sim.check(S, kind, 'me');
  if (why) {
    refuse(why);
    return;
  }
  if (kind === 'clean') {
    G.tool = G.tool === 'clean' ? null : 'clean';
    G.hint = 2.5;
  } else {
    G.tool = null;
    G.hint = 2.5;
  }
}

// —— 广告（假的）——
function watchAd(label, onDone) {
  sfx.ad();
  const real = platform.showRewardedAd(config.rewardedAdUnitId, onDone, () => toast('没看完，不算'));
  if (!real) G.over = { type: 'ad', label, t: 0, done: onDone };
}

function coverByAd() {
  if (!S.cover) return;
  const kind = S.cover.acts[0];
  const who = S.cover.who;
  watchAd('替' + sim.name(who) + '代' + sim.SHORT[kind] + '一次', () => {
    const r = doAct(kind, { free: true });
    if (!r) toast('现在做不了，' + REASON[sim.check(S, kind, 'ad')]);
  });
}

function doctorByAd() {
  watchAd('请医生', () => {
    if (sim.doctor(S)) {
      sfx.cured();
      bigMoment('医生来过了，它好了');
      burst(G.pet.x, G.pet.y - 30, 'spark', 20, 120);
      save();
    }
  });
}

// —— 朋友、角落 ——
function collectHeart(id) {
  if (!sim.collectHeart(S, id)) return;
  const c = R.corners[id];
  sfx.heart();
  platform.vibrate(false);
  burst(c.x, c.y - 70, 'heart', 10, 80);
  floatText('+1', 60, 30, PAL.glow, 'energy');
  G.parts.push({ x: c.x, y: c.y - 70, tx: 60, ty: 28, t: 0, life: 0.6, kind: 'fly' });
  save();
}

function sendTo(id, what) {
  const r = sim.send(S, id, what);
  if (r === 'already') {
    toast('今天已经留过了');
    sfx.no();
    return;
  }
  const c = R.corners[id];
  if (what === 'heart') {
    sfx.heart();
    burst(c.x, c.y - 60, 'heart', 12, 70);
    toast('留给' + sim.name(id) + '：她今天更可能会来', 'heartSend');
  } else {
    sfx.knock();
    G.doorShake = 0.5;
    toast('咚咚');
  }
  platform.vibrate(false);
  G.over = null;
  save();
}

function placeFurniture(kind) {
  S.furniture.me = kind;
  S.log.push({ t: Math.round(S.t), who: 'me', text: '在角落放了一件' + pix.FURN_NAME[kind], kind: 'furn' });
  sfx.place();
  burst(R.corners.me.x, R.corners.me.y - 30, 'spark', 14, 90);
  platform.vibrate(false);
  G.over = null;
  save();
}

function reunion() {
  sfx.reunion();
  bigMoment('它一直在等你');
  G.pet.hop = 0.6;
  G.pet.happy = 2.5;
}

// 游戏时间里的小定时器（按秒）
const timers = [];
function setTimeoutGame(fn, sec) {
  timers.push({ fn, at: G.t + sec });
}

// 规则层发来的事件（只在你正看着的时候演出来）
function handleEvents() {
  const ev = S.events;
  S.events = [];
  for (const e of ev) {
    if (e.type === 'arrive') {
      G.visitors[e.who] = 6;
      sfx.bell();
      toast(sim.name(e.who) + ' 来了');
    } else if (e.type === 'knock') {
      G.doorShake = 0.6;
      setTimeoutGame(() => sfx.knock(), 0.8);
    } else if (e.type === 'absent') {
      sfx.absent();
      platform.vibrate(false);
    } else if (e.type === 'sick') {
      sfx.sick();
      platform.vibrate(true);
      toast('它生病了', 'sick');
    } else if (e.type === 'corner') {
      sfx.sulk();
      toast('它去' + sim.name(e.who) + '那边了');
    } else if (e.type === 'back') {
      sfx.meow();
    }
  }
}

function fastForward() {
  sfx.ff();
  G.ffCount++;
  catchUp(config.time.fastForwardMin, '快进了 ' + config.time.fastForwardMin / 60 + ' 小时');
  G.bars = G.bars || Object.assign({}, S.needs);
  save();
}

// ———————————————————— 每帧 ————————————————————
function update(dt) {
  G.t += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (G.t >= timers[i].at) { timers[i].fn(); timers.splice(i, 1); }
  if (G.over) G.over.t += dt;
  if (G.over && G.over.type === 'ad' && G.over.t >= config.fakeAdSec) {
    const done = G.over.done;
    G.over = null;
    done();
  }
  if (G.mode !== 'room') return;
  // 游戏时间往前走
  sim.advance(S, (dt / 60) * config.time.gamePerRealMin);
  handleEvents();
  G.saveT += dt;
  if (G.saveT > 5) {
    G.saveT = 0;
    save();
  }
  // 需求条平滑追上
  for (const k of sim.NEEDS) {
    const d = S.needs[k] - G.bars[k];
    G.bars[k] += Math.abs(d) < 0.3 ? d : d * Math.min(1, dt * 5);
  }
  for (const k in G.visitors) {
    G.visitors[k] -= dt;
    if (G.visitors[k] <= 0) delete G.visitors[k];
  }
  // 朋友来访期间在角落站着（游戏时间里）
  for (const f of config.friends) {
    if (S.friends[f.id].visitUntil > S.t && !G.visitors[f.id]) G.visitors[f.id] = 0.5;
  }
  const p = G.pet;
  p.hop = Math.max(0, p.hop - dt);
  p.happy = Math.max(0, p.happy - dt);
  p.eat = Math.max(0, p.eat - dt);
  p.react = Math.max(0, p.react - dt);
  G.hint = Math.max(0, G.hint - dt);
  G.flash = Math.max(0, G.flash - dt);
  G.lampBoost = Math.max(0, G.lampBoost - dt * 0.5);
  G.doorShake = Math.max(0, G.doorShake - dt);
  G.blanketDrop = Math.max(0, G.blanketDrop - dt);
  G.pour = Math.max(0, G.pour - dt);
  if (G.pour > 0 && Math.random() < 0.6) G.parts.push({ x: R.bowl.x + (Math.random() - 0.5) * 10, y: R.bowl.y - 60, vx: (Math.random() - 0.5) * 20, vy: 80, life: 0.6, t: 0, kind: 'kibble' });
  if (p.eat > 0 && Math.floor(p.eat * 4) !== Math.floor((p.eat + dt) * 4)) sfx.nom();
  // 眨眼
  p.nextBlink -= dt;
  if (p.nextBlink <= 0) {
    p.blink = 0.13;
    p.nextBlink = 2 + Math.random() * 3;
  }
  p.blink = Math.max(0, p.blink - dt);
  // 它要去哪
  let tx = R.pet.x;
  let ty = R.pet.y;
  if (S.corner) {
    tx = R.corners[S.corner].petX;
    ty = R.corners[S.corner].y + 24;
  } else if (p.eat > 0) {
    tx = R.bowl.x + 34;
    ty = R.bowl.y;
  } else if (!S.asleep && !S.sick) {
    p.wander -= dt;
    if (p.wander <= 0) {
      p.wander = 5 + Math.random() * 6;
      p.wx = S.sulk ? 0 : Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 70;
    }
    tx += p.wx;
  }
  if (S.asleep || S.sick) {
    if (!S.corner) {
      tx = R.pet.x;
      ty = R.pet.y;
    }
  }
  const dx = tx - p.x;
  const dy = ty - p.y;
  const dist = Math.hypot(dx, dy);
  const sp = S.asleep ? 400 : 70;
  if (dist > 1) {
    const k = Math.min(1, (sp * dt) / dist);
    p.x += dx * k;
    p.y += dy * k;
    if (Math.abs(dx) > 1) p.face = dx > 0 ? 1 : -1;
    p.walking = dist > 3 && !S.asleep;
  } else p.walking = false;
  // 想念：望向很久没来的人的角落
  p.lookT -= dt;
  if (p.lookT <= 0) {
    p.lookT = 3 + Math.random() * 2;
    const miss = Object.keys(S.missing).filter((k) => k !== 'me');
    p.lookAt = miss.length && !S.asleep ? miss[Math.floor(Math.random() * miss.length)] : null;
  }
  // 粒子
  for (const q of G.parts) {
    q.t += dt;
    if (q.kind === 'fly') continue;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    if (q.kind === 'kibble') {
      q.vy += 300 * dt;
      if (q.y > R.bowl.y - 10) q.life = 0;
    } else if (q.kind === 'bubble' || q.kind === 'heart' || q.kind === 'zzz' || q.kind === 'note') q.vy -= 10 * dt;
    else q.vy += 120 * dt;
  }
  G.parts = G.parts.filter((q) => q.t < q.life);
  for (const f of G.floats) f.t += dt;
  G.floats = G.floats.filter((f) => f.t < 1.4);
  if (G.toast) {
    G.toast.t += dt;
    if (G.toast.t > 1.8) G.toast = null;
  }
  if (G.big) {
    G.big.t += dt;
    if (G.big.t > 2.2) G.big = null;
  }
  // 睡觉冒 Z，唱片机冒音符
  if (S.asleep && Math.random() < dt * 0.8) G.parts.push({ x: p.x + 20, y: p.y - 40, vx: 10, vy: -16, life: 2.2, t: 0, kind: 'zzz' });
  if (G.visitors.c && Math.random() < dt * 1.5) G.parts.push({ x: R.corners.c.x - 10, y: R.corners.c.y - 60, vx: 8, vy: -20, life: 1.8, t: 0, kind: 'note' });
}

// ———————————————————— 画 ————————————————————
function text(str, x, y, size, col, align, weight) {
  ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col || PAL.cream2;
  ctx.fillText(str, x, y);
}

function textOutlined(str, x, y, size, col, align) {
  ctx.font = '800 ' + size + 'px ' + FONT;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = PAL.out;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = col || PAL.cream2;
  ctx.fillText(str, x, y);
}

// 像素风面板：深色描边 + 底色 + 下沿一层阴影
function panel(x, y, w, h, col, shade) {
  ctx.fillStyle = PAL.out;
  ctx.fillRect(x - 3, y, w + 6, h);
  ctx.fillRect(x, y - 3, w, h + 6);
  ctx.fillStyle = shade || '#241b26';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col || '#33263a';
  ctx.fillRect(x, y, w, h - 4);
}

function button(id, x, y, w, h, onTap, draw, opt) {
  opt = opt || {};
  const down = G.pressed && G.pressed.id === id;
  const oy = down ? 2 : 0;
  if (!opt.bare) panel(x, y + oy, w, h - oy, opt.col || '#4a3848', opt.shade || '#2e2230');
  draw(x, y + oy, w, h, down);
  G.buttons.push({ id, x, y, w, h, onTap });
}

function drawTopBar() {
  ctx.fillStyle = '#1c141e';
  ctx.fillRect(0, 0, L.W, TOP);
  ctx.fillStyle = PAL.out;
  ctx.fillRect(0, TOP - 3, L.W, 3);
  const day = Math.floor(S.t / 1440) + 1;
  const m = Math.floor(S.t % 1440);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  const night = hh >= 19 || hh < 6;
  pix.icon(ctx, night ? 'rest' : 'energy', 20, 28, 20);
  text((hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm, 36, 23, 18, PAL.cream2, 'left', 800);
  text('第 ' + day + ' 天', 37, 42, 11, '#a8949c', 'left', 600);
  // 精力：一格一盏小灯火
  const n = Math.max(config.energy.max, S.energy);
  const ex = 116;
  for (let i = 0; i < n; i++) {
    const on = i < S.energy;
    const x = ex + i * 26;
    pix.icon(ctx, 'energy', x, 28, 22, on ? 1 : 0.22);
    if (!on && i === S.energy) {
      // 下一格还要多久
      const k = S.energyAcc / config.energy.regenMin;
      ctx.fillStyle = PAL.glow;
      ctx.fillRect(x - 9, 43, 18 * k, 3);
      ctx.fillStyle = 'rgba(255,217,138,0.25)';
      ctx.fillRect(x - 9 + 18 * k, 43, 18 * (1 - k), 3);
    }
  }
  text('精力', ex - 18, 28, 10, '#a8949c', 'center', 600);
  // 调试：快进
  button('ff', L.W - 92, 12, 82, 32, fastForward, (x, y, w, h) => {
    pix.icon(ctx, 'ff', x + 17, y + 14, 16);
    text('快进3h', x + 52, y + 14, 12, PAL.cream2, 'center', 700);
  }, { col: '#3a3048', shade: '#262032' });
  text('调试', L.W - 51, 50, 8, '#6f5f6a', 'center', 600);
}

function drawPetAndRoom() {
  const t = G.t;
  const hour = (S.t % 1440) / 60;
  room.drawRoom(ctx, R, { t, hour, lampBoost: G.lampBoost, doorShake: G.doorShake > 0 });
  const frame = Math.floor(t * 4) % 8;
  // 角落：你（窗下，最靠后）、小C、阿树
  room.drawCorner(ctx, R, 'me', S.furniture.me, frame, { empty: true, t });
  room.drawCorner(ctx, R, 'c', 'record', G.visitors.c ? frame : 0);
  room.drawCorner(ctx, R, 's', 'plant', Math.floor(t * 0.7) % 2);
  G.buttons.push({ id: 'corner_me', x: R.corners.me.x - 45, y: R.corners.me.y - 70, w: 90, h: 76, onTap: () => openFurn() });
  for (const id of ['c', 's']) {
    const c = R.corners[id];
    G.buttons.push({ id: 'corner_' + id, x: c.x - 50, y: c.y - 80, w: 100, h: 92, onTap: () => (S.hearts[id] ? collectHeart(id) : openFriend(id)) });
  }
  // 碗
  drawBowl();
  // 朋友来了：站在她的角落
  for (const id of ['c', 's']) {
    if (!G.visitors[id]) continue;
    const c = R.corners[id];
    const sp = pix.personSprite(id, { b: Math.floor(t * 1.5) % 2, wave: Math.floor(t * 2) % 2 === 0, blink: Math.floor(t * 10) % 37 === 0 });
    pix.blitBottom(ctx, sp, c.x + (id === 'c' ? -22 : 22), c.y + 4, 3);
  }
  // 名牌 + 爱心 + 缺席
  for (const id of ['c', 's', 'me']) drawNameplate(id);
  drawPet();
}

function drawBowl() {
  const b = R.bowl;
  room.ellipse(ctx, b.x, b.y + 2, 24, 6, 'rgba(20,12,18,0.4)');
  const bowl = pix.cached('bowl', () => {
    const g = new pix.Grid(16, 7);
    for (let j = 0; j < 6; j++) g.rect(j * 0.5, j + 1, 16 - j, 1, j > 3 ? PAL.coralS : PAL.coral);
    g.rect(1, 1, 14, 1, '#f08a76');
    return g.runs();
  });
  // 碗里还剩多少：跟饱不饱走
  const fill = Math.round((G.bars.food / 100) * 5);
  if (fill > 0) {
    ctx.fillStyle = '#c98a4a';
    for (let i = 0; i < fill * 2; i++) ctx.fillRect(b.x - 15 + ((i * 7) % 30), b.y - 21 + (i % 2) * 3 - Math.min(fill, 2) * 1.5, 3, 3);
  }
  pix.blitBottom(ctx, bowl, b.x, b.y, 3);
  // 痕迹：最后是谁喂的
  const lb = S.lastBy.feed;
  if (lb && S.t - lb.t < 720) {
    drawBadge(lb.who, b.x + 22, b.y - 26, 14);
  }
}

function drawBadge(who, x, y, s) {
  ctx.fillStyle = PAL.out;
  ctx.fillRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4);
  ctx.fillStyle = who === 'me' ? '#8f4e3a' : who === 'c' ? '#56653d' : '#3f5878';
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - s / 2, y - s / 2, s, s);
  ctx.clip();
  pix.avatar(ctx, who, x, y + s * 0.08, s * 1.05);
  ctx.restore();
}

function drawNameplate(id) {
  const c = R.corners[id];
  const t = G.t;
  const y = id === 'me' ? c.y + 14 : c.y + 18;
  const x = id === 'me' ? c.x + 52 : c.x;
  const absent = S.cover && S.cover.who === id;
  const away = id !== 'me' && S.t < S.friends[id].tripUntil;
  ctx.globalAlpha = absent || away ? 0.55 : 1;
  drawBadge(id, x, y, 18);
  ctx.globalAlpha = 1;
  if (absent || away) {
    // 缺席：头像右上角一个小月亮 / 行李箱
    pix.icon(ctx, away ? 'door' : 'rest', x + 11, y - 10, 12);
  }
  if (id !== 'me' && S.hearts[id]) {
    const hy = c.y - 84 + Math.sin(t * 3) * 3;
    pix.icon(ctx, 'love', c.x, hy, 22);
    if (Math.floor(t * 2) % 2) {
      ctx.fillStyle = PAL.glow;
      ctx.fillRect(c.x + 12, hy - 12, 3, 3);
    }
  }
}

function petPose() {
  const p = G.pet;
  const t = G.t;
  const o = { b: 0, eye: 'open', look: 0, tail: Math.floor(t * 4) % 8, dirt: S.needs.clean < 25 ? 3 : S.needs.clean < 45 ? 2 : S.needs.clean < 65 ? 1 : 0, blush: S.sick, frame: 0, flip: false };
  const breathRate = S.asleep || S.sick ? 0.35 : 0.6;
  o.b = Math.sin(t * Math.PI * 2 * breathRate) > 0 ? 1 : 0;
  if (S.sick) {
    o.pose = 'lie';
    o.eye = p.blink > 0 ? 'shut' : 'half';
  } else if (S.asleep) {
    o.pose = 'lie';
    o.eye = 'shut';
  } else if (p.walking) {
    o.pose = 'walk';
    o.frame = Math.floor(t * 8) % 2;
    o.flip = p.face > 0;
    o.eye = p.blink > 0 ? 'shut' : 'open';
  } else if (p.eat > 0) {
    o.pose = 'eat';
    o.eye = 'happy';
  } else if (S.sulk && !(G.rub && p.happy > 0)) {
    o.pose = 'back';
    o.tail = Math.floor(t * 10) % 8;
  } else {
    o.pose = 'sit';
    o.eye = p.happy > 0 || (G.rub && G.rub.moved > 10) ? 'happy' : p.blink > 0 ? 'shut' : 'open';
    if (p.lookAt) o.look = R.corners[p.lookAt].x < p.x ? -1 : 1;
  }
  return o;
}

function drawPet() {
  const p = G.pet;
  const o = petPose();
  const sp = pix.petSprite(o);
  const hop = p.hop > 0 ? Math.sin((p.hop / 0.35) * Math.PI) * 8 : 0;
  const shake = p.react > 0 ? Math.sin(G.t * 50) * 2 : 0;
  // 影子
  room.ellipse(ctx, p.x, p.y + 1, o.pose === 'lie' ? 45 : 30, 6, 'rgba(20,10,16,0.45)');
  pix.blitBottom(ctx, sp, Math.round(p.x + shake), Math.round(p.y - hop), 3);
  const top = p.y - (o.pose === 'lie' ? 48 : 78) - hop;
  // 被子
  if (S.asleep && S.blanket) {
    const drop = G.blanketDrop > 0 ? (G.blanketDrop / 0.5) * 60 : 0;
    drawBlanket(p.x + 9, p.y - 33 - drop, S.blanket);
  }
  // 生病：体温计 + 冒汗
  if (S.sick) {
    pix.icon(ctx, 'sick', p.x - 52, p.y - 44 + Math.sin(G.t * 2) * 2, 22);
    if (Math.floor(G.t * 2) % 2) {
      ctx.fillStyle = PAL.blue;
      ctx.fillRect(p.x - 6, top + 4, 3, 6);
    }
  }
  // 闹脾气：头上一团乱线
  if (S.sulk && !S.asleep && !S.sick) {
    const sx = p.x + 6;
    const sy = top - 6 + Math.sin(G.t * 6) * 2;
    ctx.fillStyle = PAL.out;
    for (let i = 0; i < 10; i++) {
      const a = i * 1.9 + G.t * 4;
      ctx.fillRect(Math.round(sx + Math.cos(a) * (5 + (i % 3) * 3)), Math.round(sy + Math.sin(a) * 4), 3, 3);
    }
  }
  // 想念：头上的泡泡里是那个人的脸
  if (p.lookAt && !S.asleep && !S.sick && !S.sulk) {
    const bx = p.x + (R.corners[p.lookAt].x < p.x ? -40 : 40);
    const by = top - 14;
    ctx.fillStyle = PAL.out;
    ctx.fillRect(bx - 17, by - 17, 34, 34);
    ctx.fillStyle = PAL.cream2;
    ctx.fillRect(bx - 15, by - 15, 30, 30);
    ctx.fillStyle = PAL.out;
    ctx.fillRect(bx - (bx < p.x ? -12 : 15), by + 18, 6, 6);
    ctx.fillRect(bx - (bx < p.x ? -18 : 21), by + 27, 3, 3);
    pix.avatar(ctx, p.lookAt, bx, by + 1, 26);
  }
  // 摸 / 洗的进度圈
  if (G.rub && G.rub.need && G.rub.moved > 10) {
    const k = Math.min(1, G.rub.dist / G.rub.need);
    ctx.strokeStyle = PAL.out;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 40, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.stroke();
    ctx.strokeStyle = G.rub.kind === 'clean' ? PAL.blue : PAL.coral;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  // 提示：在它身上来回划
  if (G.hint > 0 || G.firstRoomHint > 0) {
    const ix = p.x + Math.sin(G.t * 6) * 24;
    const iy = p.y - 50 + Math.cos(G.t * 12) * 3;
    pix.icon(ctx, G.tool === 'clean' ? 'sponge' : 'hand', ix, iy, 30, 0.9);
  }
  if (G.tool === 'clean' && !G.hint) {
    pix.icon(ctx, 'sponge', p.x + 46, p.y - 70 + Math.sin(G.t * 4) * 3, 24);
  }
}

function drawBlanket(cx, cy, who) {
  const col = who === 'me' ? ['#c8664a', '#9e4c36', '#e08a6a'] : who === 'c' ? ['#76874f', '#5a6a3b', '#94a56a'] : ['#557aa6', '#3f5d84', '#7a9cc4'];
  const sp = pix.cached('blanket|' + who, () => {
    const g = new pix.Grid(24, 11);
    g.rect(0, 1, 24, 10, col[0], col[1]);
    for (let j = 0; j < 9; j += 3) for (let i = (j / 3) % 2 ? 0 : 3; i < 22; i += 6) g.rect(i + 1, j + 2, 3, 3, col[2]);
    g.rect(0, 0, 24, 2, PAL.cream2);
    return g.runs();
  });
  pix.blit(ctx, sp, Math.round(cx - 36), Math.round(cy), 3);
}

function drawParticles() {
  for (const q of G.parts) {
    const k = 1 - q.t / q.life;
    ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.5));
    if (q.kind === 'heart') pix.icon(ctx, 'love', q.x, q.y, 12);
    else if (q.kind === 'bubble') {
      ctx.fillStyle = PAL.out;
      ctx.fillRect(q.x - 4, q.y - 4, 9, 9);
      ctx.fillStyle = '#dff1f7';
      ctx.fillRect(q.x - 3, q.y - 3, 7, 7);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(q.x - 2, q.y - 2, 2, 2);
    } else if (q.kind === 'kibble') {
      ctx.fillStyle = '#c98a4a';
      ctx.fillRect(q.x, q.y, 3, 3);
    } else if (q.kind === 'star' || q.kind === 'spark') {
      ctx.fillStyle = q.kind === 'star' ? PAL.glow : PAL.white;
      ctx.fillRect(q.x - 1, q.y - 4, 3, 9);
      ctx.fillRect(q.x - 4, q.y - 1, 9, 3);
    } else if (q.kind === 'zzz') textOutlined('z', q.x, q.y, 10 + q.t * 4, PAL.cream2);
    else if (q.kind === 'note') textOutlined('♪', q.x, q.y, 12, PAL.glow);
    else if (q.kind === 'fly') {
      const e = q.t / q.life;
      pix.icon(ctx, 'love', q.x + (q.tx - q.x) * e, q.y + (q.ty - q.y) * e - Math.sin(e * Math.PI) * 40, 16);
    }
  }
  ctx.globalAlpha = 1;
  for (const f of G.floats) {
    const k = f.t / 1.4;
    ctx.globalAlpha = 1 - k * k;
    const y = f.y - k * 34;
    if (f.icon) {
      pix.icon(ctx, f.icon, f.x - 16, y, 16);
      textOutlined(f.text, f.x + 8, y, 15, f.col);
    } else textOutlined(f.text, f.x, y, 15, f.col);
    ctx.globalAlpha = 1;
  }
}

// 横幅：朋友没来 / 生病
function drawBanners() {
  let y = R.top + 8;
  if (S.sick) {
    panel(12, y, L.W - 24, 50, '#5a2f36', '#3e1f26');
    pix.icon(ctx, 'sick', 34, y + 23, 26);
    text('它生病了', 54, y + 16, 15, PAL.cream2, 'left', 800);
    text('不请医生，要都养好 10 小时才自己好', 54, y + 34, 10, '#e0b8b0', 'left', 500);
    button('doctor', L.W - 124, y + 8, 104, 34, doctorByAd, (x, yy, w, h) => {
      pix.icon(ctx, 'ad', x + 18, yy + 15, 18);
      text('请医生', x + 62, yy + 15, 14, PAL.white, 'center', 800);
    }, { col: '#c8664a', shade: '#9e4c36' });
    y += 58;
  }
  if (S.cover && S.t <= S.cover.until) {
    const who = S.cover.who;
    const kind = S.cover.acts[0];
    panel(12, y, L.W - 24, 54, '#2f3a4a', '#202836');
    drawBadge(who, 36, y + 25, 30);
    pix.icon(ctx, 'rest', 50, y + 11, 13);
    text(sim.name(who) + ' 没来', 60, y + 15, 14, PAL.cream2, 'left', 800);
    text(S.cover.reason, 60, y + 32, 10, '#a9b8c8', 'left', 500);
    const left = Math.max(0, Math.round((S.cover.until - S.t) / 60));
    text('还剩' + left + 'h', 132, y + 32, 10, '#a9b8c8', 'left', 500);
    button('cover_me', L.W - 186, y + 9, 76, 36, () => doAct(kind), (x, yy, w, h) => {
      pix.icon(ctx, ACT_ICON[kind], x + 18, yy + 16, 20);
      text('我来', x + 50, yy + 10, 12, PAL.cream2, 'center', 800);
      pix.icon(ctx, 'energy', x + 44, yy + 25, 10);
      text('-1', x + 56, yy + 25, 9, PAL.glow, 'center', 700);
    }, { col: '#4a5a6e', shade: '#33404f' });
    button('cover_ad', L.W - 104, y + 9, 84, 36, coverByAd, (x, yy, w, h) => {
      pix.icon(ctx, 'ad', x + 15, yy + 16, 18);
      text('代' + ACT_LABEL[kind], x + 52, yy + 10, 12, PAL.white, 'center', 800);
      text('看广告', x + 52, yy + 25, 9, '#ffe2c8', 'center', 600);
    }, { col: '#c8664a', shade: '#9e4c36' });
  }
}

function drawNeeds() {
  const y = UI.needsY;
  for (const k of sim.NEEDS) {
    const x = needX(k) - 40;
    const v = G.bars[k];
    const low = v < config.needs.lowAt;
    const blink = low && Math.floor(G.t * 3) % 2;
    pix.icon(ctx, NEED_ICON[k], x + 10, y + 12, 20);
    // 条
    ctx.fillStyle = PAL.out;
    ctx.fillRect(x + 22, y + 5, 58, 14);
    ctx.fillStyle = '#2a2030';
    ctx.fillRect(x + 24, y + 7, 54, 10);
    const col = v < config.needs.lowAt ? (blink ? '#ff7a5a' : PAL.coral) : v < 60 ? PAL.mustard : '#8fbf6a';
    const w = Math.max(0, Math.round((54 * v) / 100 / 3) * 3);
    ctx.fillStyle = col;
    ctx.fillRect(x + 24, y + 7, w, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 24, y + 14, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 24, y + 7, w, 2);
  }
  // 现在最急的一件，用一行小字说
  const st = S.sick ? '生病了' : S.corner ? '在' + sim.name(S.corner) + '的角落生闷气' : S.sulk ? '在闹脾气' : S.asleep ? (S.blanket ? sim.name(S.blanket) === '你' ? '盖着你的被子睡' : '盖着' + sim.name(S.blanket) + '的被子睡' : '睡在地板上') : '';
  if (st) text(config.petName + ' ' + st, L.W / 2, y + 34, 11, S.sick || S.sulk || S.corner ? '#f0a090' : '#b8a8b0', 'center', 600);
}

function drawActButtons() {
  for (const b of UI.btns) {
    const why = sim.check(S, b.act, 'me');
    const dim = why === 'tired' || why === 'asleep' || why === 'notSleepy' || why === 'full';
    const down = G.pressed && G.pressed.id === b.id;
    const active = G.tool === 'clean' && b.act === 'clean';
    const oy = down ? 3 : 0;
    // 圆按钮（像素圆）
    room.ellipse(ctx, b.x, b.y + 4, b.r + 3, b.r + 3, PAL.out);
    room.ellipse(ctx, b.x, b.y + 3, b.r, b.r, active ? '#9e4c36' : '#2a1f2c');
    room.ellipse(ctx, b.x, b.y + oy, b.r + 3, b.r + 3, PAL.out);
    room.ellipse(ctx, b.x, b.y + oy, b.r, b.r, active ? '#c8664a' : dim ? '#3a2e3c' : '#5a4458');
    room.ellipse(ctx, b.x - 6, b.y - 8 + oy, b.r - 12, b.r - 16, active ? '#d97a5a' : dim ? '#3e3240' : '#664e64');
    pix.icon(ctx, ACT_ICON[b.act], b.x, b.y - 3 + oy, 34, dim ? 0.4 : 1);
    text(ACT_LABEL[b.act], b.x, b.y + 22 + oy, 11, dim ? '#7a6a74' : PAL.cream2, 'center', 800);
    // 这件事最近是谁做的：小头像
    const lb = S.lastBy[b.act];
    if (lb && S.t - lb.t < 720) drawBadge(lb.who, b.x + b.r - 6, b.y - b.r + 6, 14);
    // 现在最需要的一件：一圈光
    const need = sim.ACT_NEED[b.act];
    if (!dim && S.needs[need] < config.needs.lowAt) {
      ctx.strokeStyle = 'rgba(255,217,138,' + (0.4 + Math.sin(G.t * 6) * 0.3).toFixed(2) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y + oy, b.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    G.buttons.push({ id: b.id, x: b.x, y: b.y, r: b.r, onTap: () => onActButton(b.act) });
  }
}

function drawTraceStrip() {
  const y = UI.traceY;
  const last = S.log.slice().reverse().find((e) => e.kind !== 'furn') || S.log[S.log.length - 1];
  button('log', 12, y, L.W - 84, 44, () => { G.over = { type: 'log', t: 0, tapClose: true }; sfx.tap(); }, (x, yy, w, h) => {
    pix.icon(ctx, 'log', x + 16, yy + 20, 20);
    if (last) {
      drawBadge(last.who, x + 40, yy + 20, 20);
      fitText(sim.line(last, S.t), x + 56, yy + 20, w - 62, 12, PAL.cream2);
    } else text('还没有人来过', x + 56, yy + 20, 12, '#a8949c', 'left', 600);
  }, { col: '#33263a', shade: '#241b26' });
  button('share', L.W - 62, y, 50, 44, openShare, (x, yy, w, h) => {
    pix.icon(ctx, 'share', x + 25, yy + 16, 20);
    text('叫朋友', x + 25, yy + 33, 9, PAL.cream2, 'center', 700);
  }, { col: '#4f7a6e', shade: '#3c6056' });
}

// 一行放不下就缩小字号
function fitText(str, x, y, maxW, size, col) {
  let s = size;
  ctx.font = '600 ' + s + 'px ' + FONT;
  while (s > 9 && ctx.measureText(str).width > maxW) {
    s -= 0.5;
    ctx.font = '600 ' + s + 'px ' + FONT;
  }
  let out = str;
  while (ctx.measureText(out).width > maxW && out.length > 2) out = out.slice(0, -2) + '…';
  text(out, x, y, s, col, 'left', 600);
}

// ———— 弹层 ————
function dim(a) {
  ctx.fillStyle = 'rgba(10,6,14,' + (a == null ? 0.72 : a) + ')';
  ctx.fillRect(0, 0, L.W, L.H);
}

function drawAway(o) {
  dim();
  const lines = o.lines.slice(-7);
  const h = 166 + Math.max(1, lines.length) * 34;
  const y = Math.max(60, (L.H - h) / 2);
  panel(24, y, L.W - 48, h, '#33263a', '#241b26');
  text(o.title, L.W / 2, y + 26, 17, PAL.glow, 'center', 800);
  // 下一步该做什么：它最缺的那样
  const wk = sim.worst(S);
  if (wk !== 'ok') {
    const ic = wk === 'sick' ? 'sick' : NEED_ICON[wk];
    text('它最缺', L.W - 76, y + 50, 10, '#f0a090', 'right', 700);
    pix.icon(ctx, ic, L.W - 62, y + 50, 18);
  }
  // 它现在的样子
  const sp = pix.petSprite(petPose());
  pix.blitBottom(ctx, sp, L.W / 2, y + 102, 2.4);
  if (!lines.length) text('屋里很安静', L.W / 2, y + 122, 12, '#a8949c');
  lines.forEach((e, i) => {
    const ly = y + 124 + i * 34;
    drawBadge(e.who, 50, ly, 22);
    fitText(sim.line(e, S.t), 68, ly, L.W - 48 - 64, 12, e.kind === 'miss' || e.kind === 'sick' || e.kind === 'sulk' || e.kind === 'corner' ? '#f0a090' : e.kind === 'cover' || e.kind === 'thanks' ? PAL.glow : PAL.cream2);
  });
  button('away_ok', L.W / 2 - 60, y + h - 44, 120, 34, closeOver, (x, yy, w, hh) => text('好', x + w / 2, yy + 15, 15, PAL.white, 'center', 800), { col: '#c8664a', shade: '#9e4c36' });
}

function drawLog() {
  dim();
  const lines = S.log.slice(-14);
  const h = 70 + Math.max(1, lines.length) * 30;
  const y = Math.max(40, (L.H - h) / 2);
  panel(16, y, L.W - 32, h, '#33263a', '#241b26');
  pix.icon(ctx, 'log', 40, y + 24, 20);
  text('屋里的痕迹', 58, y + 24, 16, PAL.glow, 'left', 800);
  text('点任意处关', L.W - 34, y + 24, 10, '#a8949c', 'right', 500);
  lines.forEach((e, i) => {
    const ly = y + 58 + i * 30;
    drawBadge(e.who, 40, ly, 20);
    fitText(sim.line(e, S.t), 58, ly, L.W - 32 - 54, 12, e.kind === 'cover' || e.kind === 'thanks' ? PAL.glow : PAL.cream2);
  });
}

function openShare() {
  sfx.tap();
  const k = sim.worst(S);
  const title = config.share.lines[k];
  platform.share(title, config.share.realShare);
  G.over = { type: 'share', t: 0, title, tapClose: true };
}

function drawShare(o) {
  dim(0.8);
  const x = 34;
  const w = L.W - 68;
  const y = L.H / 2 - 190;
  text('微信里会发出这样一张卡片', L.W / 2, y - 18, 12, '#a8949c', 'center', 600);
  // 卡片：白底，上面一行标题，下面一张图
  ctx.fillStyle = PAL.out;
  ctx.fillRect(x - 3, y - 3, w + 6, 320 + 6);
  ctx.fillStyle = '#f6f1ea';
  ctx.fillRect(x, y, w, 320);
  drawBadge('me', x + 22, y + 22, 22);
  text('你', x + 40, y + 22, 12, '#5a4a52', 'left', 600);
  text(o.title, x + 14, y + 56, 18, '#1f1a22', 'left', 800);
  // 图：房间缩影
  const iy = y + 78;
  ctx.fillStyle = '#3d2f3b';
  ctx.fillRect(x + 14, iy, w - 28, 170);
  ctx.fillStyle = '#5a4033';
  ctx.fillRect(x + 14, iy + 110, w - 28, 60);
  ctx.fillStyle = 'rgba(255,205,130,0.16)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, iy + 90, 110, 80, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.mustard;
  ctx.fillRect(x + w / 2 - 15, iy + 12, 30, 12);
  ctx.fillStyle = '#fff2c0';
  ctx.fillRect(x + w / 2 - 6, iy + 24, 12, 6);
  const sp = pix.petSprite(Object.assign(petPose(), { pose: S.sick || S.asleep ? 'lie' : 'sit', look: 0, flip: false }));
  pix.blitBottom(ctx, sp, x + w / 2, iy + 150, 3.4);
  // 痕迹一行
  const last = S.log[S.log.length - 1];
  if (last) fitText(sim.line(last, S.t), x + 14, iy + 186, w - 28, 11, '#6a5a62');
  ctx.fillStyle = '#e2dbd2';
  ctx.fillRect(x, y + 292, w, 1);
  text('留灯小屋 · 你、小C、阿树 · 点开就能回来', x + 14, y + 306, 10, '#8a7a82', 'left', 500);
  text('（原型：只展示，不会真的发出去）', L.W / 2, y + 350, 11, '#a8949c', 'center', 500);
  text('点任意处关', L.W / 2, y + 370, 10, '#6f5f6a', 'center', 500);
}

function openFriend(id) {
  sfx.tap();
  G.over = { type: 'friend', id, t: 0, tapClose: true };
}

function drawFriend(o) {
  dim(0.6);
  const f = sim.friendCfg(o.id);
  const c = R.corners[o.id];
  const w = 230;
  const x = Math.max(12, Math.min(L.W - w - 12, c.x - w / 2));
  const y = Math.max(TOP + 10, c.y - 250);
  panel(x, y, w, 190, '#33263a', '#241b26');
  const sp = pix.personSprite(o.id, { b: Math.floor(G.t * 1.5) % 2, wave: Math.floor(G.t * 2) % 2 === 0 });
  pix.blitBottom(ctx, sp, x + 40, y + 112, 3);
  text(f.name, x + 80, y + 26, 18, PAL.cream2, 'left', 800);
  text(f.habit + ' · ' + f.shifts.map((s) => s.at).join(' / '), x + 80, y + 48, 11, '#a8949c', 'left', 600);
  const last = S.last[o.id];
  text('上次来：' + sim.when(last, S.t), x + 80, y + 68, 11, '#c8b8c0', 'left', 500);
  if (S.t < S.friends[o.id].tripUntil) text('出远门了', x + 80, y + 88, 11, '#f0a090', 'left', 700);
  else if (S.missing[o.id]) text('它很想她', x + 80, y + 88, 11, '#f0a090', 'left', 700);
  button('knock_' + o.id, x + 14, y + 128, 96, 46, () => sendTo(o.id, 'knock'), (bx, by, bw, bh) => {
    pix.icon(ctx, 'door', bx + 24, by + 21, 24);
    text('敲门', bx + 64, by + 21, 13, PAL.cream2, 'center', 800);
  });
  const sent = S.sentHeart[o.id] === Math.floor(S.t / 1440);
  button('heart_' + o.id, x + 120, y + 128, 96, 46, () => sendTo(o.id, 'heart'), (bx, by, bw, bh) => {
    pix.icon(ctx, 'heartSend', bx + 24, by + 21, 24, sent ? 0.4 : 1);
    text(sent ? '留过了' : '留爱心', bx + 64, by + 21, 13, sent ? '#8a7a82' : PAL.cream2, 'center', 800);
  }, { col: '#5a3a44', shade: '#3e2630' });
}

function openFurn() {
  sfx.tap();
  G.over = { type: 'furn', t: 0, tapClose: true };
}

function drawFurn() {
  dim(0.7);
  const list = config.furniture.mine.concat([config.furniture.limited]);
  const y = L.H / 2 - 170;
  panel(16, y, L.W - 32, 300, '#33263a', '#241b26');
  text('你的角落放什么', L.W / 2, y + 26, 16, PAL.glow, 'center', 800);
  text('每人一个角落，一件家具', L.W / 2, y + 46, 10, '#a8949c', 'center', 500);
  const cw = 100;
  list.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const bx = 30 + col * (cw + 8) + (row === 1 ? (cw + 8) / 2 : 0);
    const by = y + 62 + row * 112;
    const lim = k === config.furniture.limited;
    const locked = lim && !S.unlocked[k];
    const cur = S.furniture.me === k;
    button('furn_' + k, bx, by, cw, 102, () => {
      if (locked) watchAd('限定家具 · ' + pix.FURN_NAME[k], () => { S.unlocked[k] = true; placeFurniture(k); });
      else placeFurniture(k);
    }, (x, yy, w, h) => {
      const sp = pix.furnitureSprite(k, Math.floor(G.t * 4) % 8);
      const px = Math.min(2.6, 70 / Math.max(sp.w, sp.h));
      pix.blitBottom(ctx, sp, x + w / 2, yy + 70, px);
      text(pix.FURN_NAME[k], x + w / 2, yy + 84, 12, PAL.cream2, 'center', 700);
      if (lim) {
        panel(x + 4, yy + 4, 40, 18, '#c8664a', '#9e4c36');
        text('限定', x + 24, yy + 12, 10, PAL.white, 'center', 800);
        if (locked) pix.icon(ctx, 'ad', x + w - 16, yy + 14, 16);
      }
    }, { col: cur ? '#6a5040' : '#45354a', shade: cur ? '#4a3428' : '#2e2230' });
  });
}

function drawAd(o) {
  ctx.fillStyle = '#0c0a10';
  ctx.fillRect(0, 0, L.W, L.H);
  pix.icon(ctx, 'ad', L.W / 2, L.H / 2 - 60, 56);
  text('广告占位（激励视频）', L.W / 2, L.H / 2, 17, PAL.cream2, 'center', 800);
  text('看完：' + o.label, L.W / 2, L.H / 2 + 28, 13, PAL.glow, 'center', 600);
  const k = Math.min(1, o.t / config.fakeAdSec);
  ctx.fillStyle = '#2a2230';
  ctx.fillRect(L.W / 2 - 100, L.H / 2 + 56, 200, 8);
  ctx.fillStyle = PAL.glow;
  ctx.fillRect(L.W / 2 - 100, L.H / 2 + 56, 200 * k, 8);
}

function drawToast() {
  if (G.toast) {
    const tt = G.toast;
    const a = tt.t < 0.15 ? tt.t / 0.15 : tt.t > 1.5 ? (1.8 - tt.t) / 0.3 : 1;
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = '700 13px ' + FONT;
    const w = ctx.measureText(tt.text).width + (tt.icon ? 50 : 30);
    const y = R.pet.y - 150;
    panel(L.W / 2 - w / 2, y, w, 32, '#2a2030', '#1c141e');
    if (tt.icon) pix.icon(ctx, tt.icon, L.W / 2 - w / 2 + 18, y + 14, 16);
    text(tt.text, L.W / 2 + (tt.icon ? 10 : 0), y + 14, 13, PAL.cream2, 'center', 700);
    ctx.globalAlpha = 1;
  }
  if (G.big) {
    const b = G.big;
    const pop = b.t < 0.2 ? 0.6 + (b.t / 0.2) * 0.5 : b.t < 0.3 ? 1.1 - ((b.t - 0.2) / 0.1) * 0.1 : 1;
    const a = b.t > 1.8 ? (2.2 - b.t) / 0.4 : 1;
    ctx.globalAlpha = Math.max(0, a);
    ctx.save();
    ctx.translate(L.W / 2, R.top + R.RH * 0.36);
    ctx.scale(pop, pop);
    ctx.font = '800 20px ' + FONT;
    const w = ctx.measureText(b.text).width + (b.who ? 70 : 40);
    panel(-w / 2, -24, w, 48, '#6a4a2a', '#4a321c');
    if (b.who) drawBadge(b.who, -w / 2 + 26, -2, 26);
    textOutlined(b.text, b.who ? 16 : 0, -2, 20, PAL.glow);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ———— 开场 ————
function drawTitle() {
  const t = G.t;
  ctx.fillStyle = '#120d13';
  ctx.fillRect(0, 0, L.W, L.H);
  const fl = 1 + Math.sin(t * 7) * 0.03 + Math.sin(t * 13) * 0.02;
  const cy = L.H * 0.34;
  for (const bd of [[240, 0.05], [170, 0.06], [110, 0.08], [60, 0.12]]) {
    ctx.fillStyle = 'rgba(255,205,130,' + (bd[1] * fl).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(L.W / 2, cy, bd[0], bd[0], 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1f1820';
  ctx.fillRect(L.W / 2 - 1, 0, 3, cy - 60);
  for (let j = 0; j < 9; j++) {
    const hw = 15 + j * 4;
    ctx.fillStyle = PAL.out;
    ctx.fillRect(L.W / 2 - hw - 3, cy - 62 + j * 4, hw * 2 + 6, 4);
    ctx.fillStyle = j > 6 ? PAL.mustardS : PAL.mustard;
    ctx.fillRect(L.W / 2 - hw, cy - 62 + j * 4, hw * 2, 4);
  }
  ctx.fillStyle = '#fff2c0';
  ctx.fillRect(L.W / 2 - 12, cy - 26, 24, 10);
  textOutlined('留灯', L.W / 2, cy + 50, 54, PAL.glow);
  text('给晚回来的人，留一盏灯', L.W / 2, cy + 92, 14, '#c8b8c0', 'center', 600);
  // 三个人和一只猫
  const by = L.H * 0.72;
  const b = Math.floor(t * 1.5) % 2;
  pix.blitBottom(ctx, pix.personSprite('c', { b }), L.W / 2 - 100, by, 3);
  pix.blitBottom(ctx, pix.personSprite('me', { b: 1 - b }), L.W / 2, by - 6, 3);
  pix.blitBottom(ctx, pix.personSprite('s', { b }), L.W / 2 + 100, by, 3);
  pix.blitBottom(ctx, pix.petSprite({ pose: 'sit', b, eye: Math.floor(t * 10) % 31 === 0 ? 'shut' : 'open', look: 0, tail: Math.floor(t * 4) % 8, dirt: 0 }), L.W / 2 - 46, by + 36, 2.4);
  text('小C', L.W / 2 - 100, by + 18, 11, '#a8949c');
  text('你', L.W / 2, by + 12, 11, '#a8949c');
  text('阿树', L.W / 2 + 100, by + 18, 11, '#a8949c');
  button('enter', L.W / 2 - 80, L.H * 0.84, 160, 50, enterRoom, (x, y, w, h) => text('进屋', x + w / 2, y + 22, 18, PAL.white, 'center', 800), { col: '#c8664a', shade: '#9e4c36' });
  text(config.version, L.W / 2, L.H - 18, 10, '#5a4a52');
}

function enterRoom() {
  G.mode = 'room';
  sfx.bell();
  if (S.firstOpen) {
    S.firstOpen = false;
    G.firstRoomHint = 4;
    toast('三个人一起养它：摸摸它试试');
  }
  save();
}

function draw() {
  ctx.setTransform(P.dpr * scale, 0, 0, P.dpr * scale, 0, 0);
  G.buttons = [];
  if (G.mode === 'title') {
    drawTitle();
    return;
  }
  ctx.fillStyle = '#1c141e';
  ctx.fillRect(0, 0, L.W, L.H);
  drawPetAndRoom();
  drawParticles();
  drawBanners();
  // 底部 UI 背景
  ctx.fillStyle = '#1c141e';
  ctx.fillRect(0, R.bottom, L.W, L.H - R.bottom);
  ctx.fillStyle = PAL.out;
  ctx.fillRect(0, R.bottom, L.W, 3);
  drawNeeds();
  drawActButtons();
  drawTraceStrip();
  drawTopBar();
  drawToast();
  if (G.flash > 0) {
    ctx.fillStyle = 'rgba(255,220,150,' + (G.flash * 0.35).toFixed(3) + ')';
    ctx.fillRect(0, 0, L.W, L.H);
  }
  const o = G.over;
  if (o) {
    // 弹层盖住下面的按钮
    G.buttons = [];
    if (o.type === 'away') drawAway(o);
    else if (o.type === 'log') drawLog();
    else if (o.type === 'share') drawShare(o);
    else if (o.type === 'friend') drawFriend(o);
    else if (o.type === 'furn') drawFurn();
    else if (o.type === 'ad') drawAd(o);
  }
}

let last = now();
function frame() {
  const t = now();
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (G.firstRoomHint > 0) G.firstRoomHint -= dt;
  update(dt);
  draw();
  platform.nextFrame(frame);
}

loadOrNew();
platform.onHide(() => S && save());
platform.onShow(() => {
  if (!S) return;
  const gone = ((now() - (S.lastReal || now())) / 60000) * config.time.gamePerRealMin;
  if (gone > 2) catchUp(Math.min(gone, config.time.offlineMaxMin), '你不在的时候');
  S.lastReal = now();
});
platform.exposeForTest('__liudeng', {
  G, R, UI, L, scale, config, sim,
  S: () => S,
  reset() { S = sim.newState(12345); S.lastReal = now(); G.bars = Object.assign({}, S.needs); G.over = null; save(); },
  fastForward, doAct, enterRoom,
});
frame();
