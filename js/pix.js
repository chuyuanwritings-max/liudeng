// 8 比特像素 + 赛璐璐（平涂 + 一层硬阴影 + 1 像素深色描边）。所有角色、家具、图标都在这里用代码画。
// 画法：先在一张小格子（Grid）上点格子，自动描边，再合并成一行行色块画到 canvas 上；画过的形状会缓存。

const OUT = '#1a1218';

const PAL = {
  out: OUT,
  cat: '#e8a056', catS: '#b96f3a', stripe: '#c0773e', cream: '#f7e6c4', creamS: '#d8bf98',
  eye: '#231a22', hi: '#fff4e0', nose: '#a0564a', earIn: '#c98a74', blush: '#d9735e', dirt: '#7a5a3e',
  skin: '#f1c9a5', skinS: '#d6a27f',
  wood: '#8a5a3c', woodS: '#6b4430', woodL: '#a7714b',
  coral: '#e0604e', coralS: '#b44538',
  mustard: '#d9a441', mustardS: '#a97c2c',
  teal: '#4f8a84', tealS: '#386660',
  leaf: '#5f8f5a', leafS: '#466c44',
  cream2: '#efe2c6', cream2S: '#cdbd9c',
  glow: '#ffd98a', glowS: '#e8a94c',
  blue: '#7fb6d6', blueS: '#5a8fb0',
  ink: '#2a2230', white: '#fbf3e4',
};

function Grid(w, h) {
  this.w = w;
  this.h = h;
  this.c = new Array(w * h).fill(0);
}
Grid.prototype.px = function (x, y, col) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  this.c[y * this.w + x] = col;
};
Grid.prototype.get = function (x, y) {
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
  return this.c[y * this.w + x];
};
Grid.prototype.rect = function (x, y, w, h, col, shade) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, shade && (i >= w - Math.max(1, Math.round(w * 0.3)) || j === h - 1) ? shade : col);
};
// 椭圆：右下方一块用阴影色（一层硬阴影）
Grid.prototype.ell = function (cx, cy, rx, ry, col, shade, cut) {
  const k = cut == null ? 0.55 : cut;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x, y, shade && dx * 0.55 + dy * 0.9 > k ? shade : col);
    }
  }
};
Grid.prototype.tri = function (x, y, h, dir, col, inner) {
  // 尖朝上的三角（耳朵）：第 j 行宽 j+1，dir=1 向右长，-1 向左长
  for (let j = 0; j < h; j++) for (let i = 0; i <= j; i++) this.px(x + i * dir, y + j, inner && i > 0 && i < j && j > 1 ? inner : col);
};
Grid.prototype.line = function (x0, y0, x1, y1, col) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
};
Grid.prototype.mirror = function () {
  const g = new Grid(this.w, this.h);
  for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.c[y * this.w + x] = this.c[y * this.w + (this.w - 1 - x)];
  return g;
};
// 自动描边 + 合并成色块
Grid.prototype.runs = function (outline) {
  const w = this.w + 2;
  const h = this.h + 2;
  const g = new Grid(w, h);
  for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.c[(y + 1) * w + x + 1] = this.c[y * this.w + x];
  if (outline !== false) {
    const add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (g.c[y * w + x]) continue;
        if (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1)) add.push(y * w + x);
      }
    for (const i of add) g.c[i] = OUT;
  }
  const out = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const col = g.c[y * w + x];
      if (!col) { x++; continue; }
      let n = 1;
      while (x + n < w && g.c[y * w + x + n] === col) n++;
      out.push(x - 1, y - 1, n, col);
      x += n;
    }
  }
  return { runs: out, w: this.w, h: this.h };
};

const cache = {};
let cacheSize = 0;
function cached(key, build) {
  let r = cache[key];
  if (!r) {
    if (cacheSize > 600) {
      for (const k in cache) delete cache[k];
      cacheSize = 0;
    }
    r = cache[key] = build();
    cacheSize++;
  }
  return r;
}

// 画色块：(x, y) 是左上角，px 是一格多大
function blit(ctx, sp, x, y, px, alpha) {
  const r = sp.runs;
  const o = 0.35; // 一点点重叠，免得缩放后格子之间露缝
  if (alpha != null) ctx.globalAlpha = alpha;
  let last = null;
  for (let i = 0; i < r.length; i += 4) {
    if (r[i + 3] !== last) {
      last = r[i + 3];
      ctx.fillStyle = last;
    }
    ctx.fillRect(x + r[i] * px, y + r[i + 1] * px, r[i + 2] * px + o, px + o);
  }
  if (alpha != null) ctx.globalAlpha = 1;
}

// 底边中点放在 (x, y)
function blitBottom(ctx, sp, x, y, px, alpha) {
  blit(ctx, sp, Math.round(x - (sp.w * px) / 2), Math.round(y - sp.h * px), px, alpha);
}

// ———————————————————— 宠物：橘白小猫「灯芯」 ————————————————————
// o: { pose: sit|eat|back|lie|walk, b: 呼吸 0/1, eye: open|shut|happy|half, look: -1/0/1, tail: 0~7, dirt: 0~3, blush, frame }
function petSprite(o) {
  const key = 'pet|' + [o.pose, o.b, o.eye, o.look, o.tail, o.dirt, o.blush ? 1 : 0, o.frame || 0, o.flip ? 1 : 0].join(',');
  return cached(key, () => {
    let g;
    if (o.pose === 'lie') g = petLie(o);
    else if (o.pose === 'walk') g = petWalk(o);
    else g = petSit(o);
    if (o.flip) g = g.mirror();
    return g.runs();
  });
}

function tailPts(g, x0, y0, dir, ph, len, up) {
  for (let i = 0; i < len; i++) {
    const s = Math.sin(ph + i * 0.55) * i * 0.22;
    const x = x0 + dir * (i * 0.75 + s);
    const y = y0 - i * up + Math.abs(s) * 0.3;
    const tip = i >= len - 2;
    g.rect(Math.round(x), Math.round(y), 2, 2, tip ? PAL.cream : PAL.cat);
    if (!tip) g.px(Math.round(x) + (dir > 0 ? 1 : 0), Math.round(y) + 1, PAL.catS);
  }
}

function dirtSpots(g, n, spots) {
  for (let i = 0; i < n && i < spots.length; i++) {
    const s = spots[i];
    g.px(s[0], s[1], PAL.dirt);
    g.px(s[0] + 1, s[1], PAL.dirt);
    g.px(s[0], s[1] + 1, PAL.dirt);
  }
}

function eyes(g, x1, x2, y, kind) {
  for (const x of [x1, x2]) {
    if (kind === 'open') {
      g.rect(x, y, 2, 2, PAL.eye);
      g.px(x, y, PAL.hi);
    } else if (kind === 'happy') {
      g.px(x, y + 1, PAL.eye);
      g.px(x + 1, y, PAL.eye);
      g.px(x + 2, y + 1, PAL.eye);
    } else if (kind === 'half') {
      g.rect(x, y + 1, 2, 1, PAL.eye);
      g.px(x, y + 1, PAL.hi);
    } else {
      g.rect(x, y + 1, 3, 1, PAL.eye);
    }
  }
}

function petSit(o) {
  const g = new Grid(30, 26);
  const b = o.pose === 'eat' ? 3 : -o.b;
  const back = o.pose === 'back';
  // 尾巴在身后
  tailPts(g, back ? 10 : 19, 21, back ? -1 : 1, (o.tail / 8) * Math.PI * 2, 9, 1.05);
  g.ell(14, 18.5, 7.5, 6 + (o.b ? 0.3 : 0), PAL.cat, PAL.catS);
  if (!back) {
    g.ell(14, 20, 4, 4.2, PAL.cream, PAL.creamS);
    g.ell(10.5, 24, 2.2, 1.4, PAL.cream, PAL.creamS);
    g.ell(17.5, 24, 2.2, 1.4, PAL.cream, PAL.creamS);
  } else {
    g.rect(12, 13, 1, 2, PAL.stripe);
    g.rect(15, 14, 1, 2, PAL.stripe);
    g.rect(13, 17, 2, 1, PAL.stripe);
  }
  const hy = 10 + b;
  g.tri(7, hy - 7, 4, 1, PAL.cat, back ? PAL.cat : PAL.earIn);
  g.tri(21, hy - 7, 4, -1, PAL.cat, back ? PAL.cat : PAL.earIn);
  g.ell(14, hy, 7.6, 6, PAL.cat, PAL.catS);
  // 额头条纹
  g.rect(13, hy - 5, 2, 1, PAL.stripe);
  g.px(12, hy - 4, PAL.stripe);
  g.px(15, hy - 4, PAL.stripe);
  if (back) {
    g.rect(12, hy - 1, 4, 1, PAL.stripe);
    g.rect(13, hy + 2, 2, 1, PAL.stripe);
  } else {
    // 口鼻一圈白
    g.ell(14, hy + 2.5, 3.2, 2.2, PAL.cream, PAL.creamS, 0.8);
    g.px(7, hy + 1, PAL.stripe);
    g.px(21, hy + 1, PAL.stripe);
    const lx = o.look || 0;
    eyes(g, 10 + lx, 16 + lx, hy - 1, o.eye);
    g.rect(13, hy + 1, 2, 1, PAL.nose);
    g.px(12, hy + 3, PAL.eye);
    g.px(15, hy + 3, PAL.eye);
    if (o.pose === 'eat') g.rect(13, hy + 3, 2, 1, PAL.nose);
    if (o.blush) {
      g.rect(8, hy + 2, 2, 1, PAL.blush);
      g.rect(19, hy + 2, 2, 1, PAL.blush);
    }
  }
  dirtSpots(g, o.dirt, [[9, 16], [17, 19], [12, 22], [19, 15], [8, hy - 2]]);
  return g;
}

function petLie(o) {
  const g = new Grid(34, 16);
  // 尾巴绕到身前
  for (let i = 0; i < 11; i++) {
    const x = 28 - i * 1.4;
    const y = 12 + Math.sin(i * 0.35) * 1.5 + (i > 8 ? -((o.tail % 4) * 0.25) : 0);
    g.rect(Math.round(x), Math.round(y), 2, 2, i > 8 ? PAL.cream : PAL.cat);
  }
  g.ell(19, 9.5 - o.b * 0.4, 11, 5 + o.b * 0.4, PAL.cat, PAL.catS);
  g.rect(16, 5, 1, 2, PAL.stripe);
  g.rect(20, 5, 1, 2, PAL.stripe);
  g.rect(24, 6, 1, 2, PAL.stripe);
  const hx = 8;
  const hy = 9;
  g.tri(3, hy - 7, 4, 1, PAL.cat, PAL.earIn);
  g.tri(13, hy - 7, 4, -1, PAL.cat, PAL.earIn);
  g.ell(hx, hy, 6.2, 5, PAL.cat, PAL.catS);
  g.ell(hx, hy + 2.3, 2.8, 1.8, PAL.cream, null);
  g.rect(hx - 1, hy - 4, 2, 1, PAL.stripe);
  eyes(g, hx - 4, hx + 2, hy - 1, o.eye);
  g.rect(hx - 1, hy + 1, 2, 1, PAL.nose);
  if (o.blush) {
    g.rect(hx - 5, hy + 2, 2, 1, PAL.blush);
    g.rect(hx + 4, hy + 2, 2, 1, PAL.blush);
  }
  g.ell(14, 13.5, 2.4, 1.3, PAL.cream, PAL.creamS);
  dirtSpots(g, o.dirt, [[17, 7], [23, 10], [13, 10], [26, 8]]);
  return g;
}

function petWalk(o) {
  const g = new Grid(32, 24);
  const f = o.frame || 0;
  tailPts(g, 25, 14, 1, (o.tail / 8) * Math.PI * 2, 8, 1.1);
  // 四条腿交替
  const legs = [[9, f ? 0 : 1], [12, f ? 1 : 0], [20, f ? 1 : 0], [23, f ? 0 : 1]];
  for (const l of legs) {
    g.rect(l[0], 17, 2, 3 + l[1], l[1] ? PAL.cat : PAL.catS);
    g.rect(l[0], 20 + l[1], 2, 1, PAL.cream);
  }
  g.ell(17, 14 - o.b * 0.3, 9.5, 5, PAL.cat, PAL.catS);
  g.ell(16, 16.5, 5, 2, PAL.cream, null);
  g.rect(17, 10, 1, 2, PAL.stripe);
  g.rect(21, 10, 1, 2, PAL.stripe);
  const hy = 9 - f * 0.5;
  g.tri(2, hy - 7, 4, 1, PAL.cat, PAL.earIn);
  g.tri(11, hy - 7, 4, -1, PAL.cat, PAL.earIn);
  g.ell(7, hy, 6, 5, PAL.cat, PAL.catS);
  g.ell(4.5, hy + 2.2, 2.8, 1.8, PAL.cream, null);
  g.rect(6, hy - 4, 2, 1, PAL.stripe);
  if (o.eye === 'open') {
    g.rect(4, hy - 1, 2, 2, PAL.eye);
    g.px(4, hy - 1, PAL.hi);
  } else g.rect(4, hy, 2, 1, PAL.eye);
  g.px(1, hy + 1, PAL.nose);
  dirtSpots(g, o.dirt, [[14, 12], [22, 14], [10, 15]]);
  return g;
}

// ———————————————————— 人：小C / 阿树 / 你 ————————————————————
const PEOPLE = {
  c: { hair: '#3b3040', hairS: '#2a2230', coat: '#76874f', coatS: '#5a6a3b', pants: '#3a3346', shoe: '#e8e0d0', style: 'bob', glasses: true },
  s: { hair: '#6b4a36', hairS: '#523726', coat: '#557aa6', coatS: '#3f5d84', pants: '#c8b48e', shoe: '#5a3e2e', style: 'beanie', hat: PAL.mustard, hatS: PAL.mustardS },
  me: { hair: '#7a4a36', hairS: '#5c3626', coat: '#c8664a', coatS: '#9e4c36', pants: '#4a3c4c', shoe: '#efe2c6', style: 'bun' },
};

// o: { b: 呼吸, wave: 挥手, blink, rows: 只画上面几行（头像） }
function personGrid(id, o) {
  const P = PEOPLE[id];
  const g = new Grid(18, o.rows || 32);
  const b = o.b || 0;
  const y0 = 3 - b;
  // 后面的头发
  if (P.style === 'bob') {
    g.ell(9, y0 + 6, 6, 6.2, P.hair, P.hairS);
    g.rect(3, y0 + 6, 12, 5, P.hair, P.hairS);
  } else if (P.style === 'bun') {
    g.ell(9, y0 + 0.5, 2.6, 2.4, P.hair, P.hairS);
    g.ell(9, y0 + 6, 5.6, 5.8, P.hair, P.hairS);
  } else g.ell(9, y0 + 6.5, 5.4, 5.4, P.hair, P.hairS);
  // 脸
  g.ell(9, y0 + 7.5, 4.3, 4.6, PAL.skin, PAL.skinS, 0.9);
  // 刘海 / 帽子
  if (P.style === 'bob') {
    g.rect(4, y0 + 2, 10, 3, P.hair);
    g.px(6, y0 + 5, P.hair);
    g.px(12, y0 + 5, P.hair);
  } else if (P.style === 'beanie') {
    g.ell(9, y0 + 3.4, 5.6, 4, P.hat, P.hatS);
    g.rect(3, y0 + 4, 12, 2, P.hatS);
    g.rect(8, y0 - 1, 2, 1, P.hat);
    g.px(4, y0 + 7, P.hair);
    g.px(13, y0 + 7, P.hair);
  } else {
    g.rect(5, y0 + 2, 8, 2, P.hair);
    g.px(5, y0 + 4, P.hair);
    g.px(12, y0 + 4, P.hair);
  }
  // 眼睛
  const ey = y0 + 7;
  if (o.blink) {
    g.rect(6, ey + 1, 2, 1, PAL.eye);
    g.rect(11, ey + 1, 2, 1, PAL.eye);
  } else {
    g.rect(6, ey, 2, 2, PAL.eye);
    g.rect(11, ey, 2, 2, PAL.eye);
    g.px(6, ey, PAL.hi);
    g.px(11, ey, PAL.hi);
  }
  if (P.glasses) {
    g.rect(5, ey - 1, 4, 1, '#4a3a40');
    g.rect(10, ey - 1, 4, 1, '#4a3a40');
    g.px(9, ey, '#4a3a40');
  }
  g.rect(8, y0 + 10, 2, 1, '#b8655a');
  if (id === 'me') {
    g.px(5, y0 + 9, PAL.blush);
    g.px(13, y0 + 9, PAL.blush);
  }
  // 身体
  const by = y0 + 12;
  g.rect(8, by, 2, 1, PAL.skinS);
  g.rect(4, by + 1, 10, 10, P.coat, P.coatS);
  if (id === 's') g.rect(8, by + 1, 2, 5, PAL.white);
  if (id === 'c') g.rect(7, by + 1, 4, 2, PAL.cream);
  if (id === 'me') g.rect(4, by + 1, 10, 2, P.coatS);
  // 手臂
  if (o.wave) {
    g.rect(14, by - 3, 2, 5, P.coat);
    g.rect(14, by - 5, 2, 2, PAL.skin);
  } else {
    g.rect(14, by + 2, 2, 8, P.coatS);
    g.rect(14, by + 10, 2, 1, PAL.skin);
  }
  g.rect(2, by + 2, 2, 8, P.coat);
  g.rect(2, by + 10, 2, 1, PAL.skin);
  // 腿
  g.rect(5, by + 11, 3, 5, P.pants);
  g.rect(10, by + 11, 3, 5, P.pants);
  g.rect(4, by + 16, 4, 2, P.shoe);
  g.rect(10, by + 16, 4, 2, P.shoe);
  return g;
}

function personSprite(id, o) {
  o = o || {};
  const key = 'p|' + id + '|' + (o.b || 0) + (o.wave ? 1 : 0) + (o.blink ? 1 : 0) + '|' + (o.rows || 0);
  return cached(key, () => personGrid(id, o).runs());
}

// 头像：只画头和肩膀，放在 (cx, cy) 为中心、size 见方
function avatar(ctx, id, cx, cy, size, o) {
  o = o || {};
  if (id === 'pet') {
    const sp = petSprite({ pose: 'sit', b: 0, eye: o.blink ? 'shut' : 'open', look: 0, tail: 2, dirt: 0 });
    const px = size / 22;
    // 只要头
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - size / 2, cy - size / 2, size, size);
    ctx.clip();
    blit(ctx, sp, cx - 15 * px, cy - size / 2 - 1 * px, px);
    ctx.restore();
    return;
  }
  const sp = personSprite(id, { rows: 17, blink: o.blink });
  const px = size / 18;
  blit(ctx, sp, cx - (sp.w * px) / 2, cy - size / 2 - px, px);
}

// ———————————————————— 家具 ————————————————————
// t：动画时间（秒）
function furnitureSprite(kind, f) {
  return cached('f|' + kind + '|' + f, () => {
    let g;
    if (kind === 'record') {
      g = new Grid(22, 20);
      g.rect(1, 9, 20, 10, PAL.wood, PAL.woodS);
      g.rect(2, 11, 8, 6, PAL.woodS);
      g.rect(12, 11, 8, 6, PAL.woodS);
      g.px(9, 14, PAL.mustard);
      g.px(12, 14, PAL.mustard);
      g.rect(2, 6, 18, 3, '#3a3036', '#2a2228');
      g.ell(9, 5.5, 6, 2.6, '#2a2228', null);
      g.ell(9, 5.5, 1.6, 1, PAL.coral, null);
      // 唱片转：标签上一点白跟着转
      const a = (f / 4) * Math.PI * 2;
      g.px(9 + Math.round(Math.cos(a) * 4), 5 + Math.round(Math.sin(a) * 1.5), '#6a5a62');
      g.line(17, 3, 14, 6, '#c9c0b0');
      g.rect(16, 2, 2, 2, '#c9c0b0');
      // 斜靠的唱片套
      g.rect(0, 0, 1, 0, PAL.teal);
    } else if (kind === 'plant') {
      g = new Grid(22, 30);
      const sw = f % 2;
      g.rect(6, 22, 10, 7, '#b9643f', '#8f4a2e');
      g.rect(5, 21, 12, 2, '#cf774f');
      g.line(11, 21, 11, 12, PAL.leafS);
      g.line(11, 18, 5 + sw, 12, PAL.leafS);
      g.line(11, 16, 17 - sw, 9, PAL.leafS);
      g.ell(5 + sw, 11, 4.5, 3.5, PAL.leaf, PAL.leafS);
      g.ell(16 - sw, 8, 5, 4, PAL.leaf, PAL.leafS);
      g.ell(10 + sw, 4.5, 4, 4, PAL.leaf, PAL.leafS);
      g.ell(15, 15, 3.6, 2.6, PAL.leaf, PAL.leafS);
      // 龟背竹的洞
      g.px(4 + sw, 10, 0);
      g.px(16 - sw, 7, 0);
      g.px(18 - sw, 9, 0);
      g.px(10 + sw, 3, 0);
    } else if (kind === 'beanbag') {
      g = new Grid(24, 16);
      g.ell(12, 10, 11, 6, PAL.mustard, PAL.mustardS);
      g.ell(10, 7, 6, 3, '#e6b860', null);
      g.line(8, 12, 16, 12, PAL.mustardS);
    } else if (kind === 'shelf') {
      g = new Grid(20, 26);
      g.rect(1, 1, 18, 24, PAL.wood, PAL.woodS);
      g.rect(3, 3, 14, 9, '#4a3330');
      g.rect(3, 14, 14, 9, '#4a3330');
      const books = ['#c8664a', '#4f8a84', '#d9a441', '#efe2c6', '#5b7fb0', '#7f9a5a'];
      for (let i = 0; i < 6; i++) g.rect(3 + i * 2 + (i > 3 ? 1 : 0), 5 + (i % 2), 2, 7 - (i % 2), books[i]);
      for (let i = 0; i < 4; i++) g.rect(4 + i * 3, 16 + (i % 3), 2, 7 - (i % 3), books[(i + 3) % 6]);
      g.ell(15, 20, 1.6, 2.4, PAL.leaf, null);
    } else if (kind === 'tank') {
      g = new Grid(22, 22);
      g.rect(1, 18, 20, 3, PAL.wood, PAL.woodS);
      g.rect(2, 4, 18, 14, '#5f9aa0', '#4d8288');
      g.rect(2, 4, 18, 2, '#86c0c2');
      g.rect(3, 15, 16, 2, '#c9b48a');
      g.line(5, 15, 5, 10, PAL.leaf);
      g.line(6, 15, 7, 11, PAL.leafS);
      const fx = 8 + ((f * 2) % 10);
      g.rect(fx, 10, 3, 2, PAL.coral);
      g.px(fx + ((f >> 2) % 2 ? 3 : -1), 10, PAL.coralS);
      g.px(14 - (f % 6), 7 + ((f >> 1) % 3), '#d9f0ee');
      g.px(15, 12 - (f % 5), '#d9f0ee');
    } else if (kind === 'yarn') {
      g = new Grid(20, 14);
      g.rect(2, 7, 16, 6, PAL.wood, PAL.woodS);
      g.line(2, 9, 17, 9, PAL.woodL);
      g.ell(7, 6, 4, 3.5, PAL.coral, PAL.coralS);
      g.ell(13, 6, 3.5, 3.2, PAL.teal, PAL.tealS);
      g.line(5, 5, 9, 7, '#f08a76');
      g.line(12, 4, 15, 7, '#6fb0a8');
      g.line(16, 6, 19, 11, PAL.teal);
    } else if (kind === 'tent') {
      g = new Grid(26, 28);
      for (let j = 0; j < 22; j++) {
        const hw = Math.round(j * 0.55);
        for (let i = -hw; i <= hw; i++) g.px(13 + i, 5 + j, i > hw * 0.3 ? PAL.cream2S : (i + 30) % 5 === 0 ? PAL.coral : PAL.cream2);
      }
      for (let j = 10; j < 22; j++) {
        const hw = Math.round((j - 10) * 0.35);
        for (let i = -hw; i <= hw; i++) g.px(13 + i, 5 + j, '#3a2a30');
      }
      g.line(11, 2, 13, 6, PAL.wood);
      g.line(15, 2, 13, 6, PAL.wood);
      // 星星串灯
      for (let i = 0; i < 6; i++) {
        const x = 3 + i * 4;
        const y = 8 + Math.round(Math.abs(i - 2.5) * -1 + 3);
        g.px(x, y, (i + f) % 3 === 0 ? '#fff2b0' : PAL.glow);
      }
    } else {
      g = new Grid(4, 4);
    }
    return g.runs();
  });
}

const FURN_NAME = { record: '唱片机', plant: '龟背竹', beanbag: '懒人沙发', shelf: '小书架', tank: '小鱼缸', yarn: '毛线篮', tent: '星星帐篷' };

// ———————————————————— 图标 ————————————————————
function iconGrid(name) {
  const g = new Grid(14, 14);
  switch (name) {
    case 'food':
      g.ell(7, 6.5, 4.5, 1.8, '#b98a5a', null);
      g.px(5, 5, PAL.coral); g.px(7, 5, '#c98a4a'); g.px(9, 6, PAL.coral); g.px(6, 6, '#c98a4a');
      for (let j = 0; j < 5; j++) g.rect(1 + j * 0.5, 7 + j, 12 - j, 1, j > 2 ? PAL.coralS : PAL.coral);
      g.rect(2, 8, 10, 1, '#f08a76');
      break;
    case 'rest':
      g.ell(7, 7, 5.5, 5.5, PAL.glow, PAL.glowS);
      g.ell(9.5, 5.5, 4.5, 4.5, 0, null);
      g.px(11, 2, PAL.white); g.px(12, 9, PAL.white);
      break;
    case 'love':
      g.ell(4.5, 5, 3.2, 3, PAL.coral, PAL.coralS);
      g.ell(9.5, 5, 3.2, 3, PAL.coral, PAL.coralS);
      for (let j = 0; j < 6; j++) g.rect(1.5 + j, 6 + j, 11 - j * 2, 1, j > 2 ? PAL.coralS : PAL.coral);
      g.px(3, 4, '#f6a090');
      break;
    case 'clean':
      for (let j = 0; j < 11; j++) {
        const w = j < 4 ? j * 0.6 : Math.min(4.5, 1.5 + (j - 3) * 0.8) - (j > 9 ? (j - 9) * 1.5 : 0);
        for (let i = -Math.round(w); i <= Math.round(w); i++) g.px(7 + i, 1 + j, i > 0 && j > 5 ? PAL.blueS : PAL.blue);
      }
      g.px(5, 7, PAL.white); g.px(5, 8, PAL.white);
      break;
    case 'hand':
      g.rect(3, 6, 8, 6, PAL.skin, PAL.skinS);
      for (let i = 0; i < 4; i++) g.rect(3 + i * 2, 2 + (i === 0 || i === 3 ? 1 : 0), 2, 5, PAL.skin);
      g.rect(10, 6, 3, 2, PAL.skin);
      g.line(5, 3, 5, 6, PAL.skinS); g.line(7, 2, 7, 6, PAL.skinS); g.line(9, 3, 9, 6, PAL.skinS);
      break;
    case 'blanket':
      g.rect(1, 3, 12, 9, PAL.teal, PAL.tealS);
      for (let j = 0; j < 9; j += 3) for (let i = (j / 3) % 2 ? 0 : 3; i < 12; i += 6) g.rect(1 + i, 3 + j, 3, 3, '#6fa8a0');
      g.rect(1, 3, 12, 2, PAL.cream2);
      break;
    case 'sponge':
      g.rect(2, 5, 10, 7, '#f0c95a', '#c9a03c');
      g.px(4, 7, '#c9a03c'); g.px(8, 9, '#c9a03c'); g.px(6, 10, '#c9a03c');
      g.ell(4, 3, 1.8, 1.8, '#dff1f7', null); g.ell(9, 2, 1.3, 1.3, '#dff1f7', null); g.ell(11.5, 4, 1, 1, '#dff1f7', null);
      break;
    case 'energy':
      for (let j = 0; j < 11; j++) {
        const w = j < 5 ? j * 0.55 : 3 - (j - 5) * 0.2;
        for (let i = -Math.round(w); i <= Math.round(w); i++) g.px(7 + i, 1 + j, j > 6 ? PAL.glowS : i < 1 && j > 3 ? '#fff2b0' : PAL.glow);
      }
      break;
    case 'ff':
      for (let j = 0; j < 9; j++) { const w = 4 - Math.abs(j - 4); g.rect(2, 2 + j, w + 1, 1, PAL.cream2); g.rect(7, 2 + j, w + 1, 1, PAL.cream2); }
      break;
    case 'share':
      for (let j = 0; j < 10; j++) g.rect(1 + j, 6 - Math.floor(j / 2), 1, 1 + j - Math.floor(j / 2), PAL.white);
      g.line(1, 6, 12, 1, PAL.white); g.line(12, 1, 8, 12, PAL.cream2S); g.line(5, 8, 12, 1, PAL.blueS);
      g.rect(5, 8, 2, 3, PAL.cream2S);
      break;
    case 'log':
      g.rect(2, 1, 10, 12, PAL.cream2, PAL.cream2S);
      g.rect(2, 1, 2, 12, PAL.coral);
      g.line(5, 4, 10, 4, PAL.ink); g.line(5, 7, 10, 7, PAL.ink); g.line(5, 10, 8, 10, PAL.ink);
      break;
    case 'ad':
      g.rect(1, 2, 12, 9, PAL.ink, '#1f1a24');
      g.rect(2, 3, 10, 7, '#4a5a7a');
      for (let j = 0; j < 5; j++) g.rect(5, 4 + j, 3 - Math.abs(j - 2), 1, PAL.glow);
      g.rect(4, 11, 6, 1, PAL.ink);
      break;
    case 'doctor':
      g.rect(1, 4, 12, 9, PAL.white, PAL.cream2S);
      g.rect(4, 2, 6, 2, PAL.cream2S);
      g.rect(6, 6, 2, 6, PAL.coral); g.rect(4, 8, 6, 2, PAL.coral);
      break;
    case 'door':
      g.rect(2, 1, 10, 12, PAL.wood, PAL.woodS);
      g.rect(4, 3, 6, 4, PAL.woodL); g.rect(4, 8, 6, 3, PAL.woodL);
      g.px(10, 8, PAL.glow);
      break;
    case 'heartSend':
      g.ell(4, 6, 2.8, 2.6, PAL.coral, PAL.coralS);
      g.ell(8.5, 6, 2.8, 2.6, PAL.coral, PAL.coralS);
      for (let j = 0; j < 5; j++) g.rect(1.5 + j, 7 + j, 10 - j * 2, 1, PAL.coral);
      g.px(12, 1, PAL.glow); g.px(11, 2, PAL.glow); g.px(13, 2, PAL.glow); g.px(12, 3, PAL.glow);
      break;
    case 'sofa':
      g.ell(7, 8, 6, 4, PAL.mustard, PAL.mustardS);
      break;
    case 'sick':
      g.rect(5, 1, 3, 10, PAL.white, PAL.cream2S);
      g.rect(5, 8, 3, 4, PAL.coral);
      g.ell(6.5, 11.5, 2.2, 2, PAL.coral, PAL.coralS);
      break;
    default:
      g.rect(3, 3, 8, 8, PAL.white);
  }
  return g;
}

function icon(ctx, name, cx, cy, size, alpha) {
  const sp = cached('i|' + name, () => iconGrid(name).runs());
  const px = size / 14;
  blit(ctx, sp, cx - (sp.w * px) / 2, cy - (sp.h * px) / 2, px, alpha);
}

module.exports = { PAL, OUT, Grid, blit, blitBottom, cached, petSprite, personSprite, avatar, furnitureSprite, icon, FURN_NAME, PEOPLE };
