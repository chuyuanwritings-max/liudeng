// 房间：墙、窗（跟着游戏里的钟变天色）、地板、吊灯（会闪）、三个人的角落。
// 只画「不怎么动的背景」和家具；宠物、人、特效在 main.js 里画在上面。
const pix = require('./pix.js');
const { PAL } = pix;

const PX = 3; // 房间里一个像素格 = 3 点

function snap(v) {
  return Math.round(v / PX) * PX;
}

// 根据屏幕高度摆房间：返回各处的位置
function layout(W, top, bottom) {
  const RH = bottom - top;
  const floorY = snap(top + RH * 0.5);
  const R = {
    W, top, bottom, RH, floorY,
    win: { x: 141, y: snap(top + 20), w: 93, h: snap(Math.min(126, RH * 0.24)) },
    door: { x: 66, y: floorY - 114, w: 48, h: 114 },
    lamp: { x: 186, y: snap(top + RH * 0.3) },
    pet: { x: 187, y: snap(floorY + (bottom - floorY) * 0.6) },
    bowl: { x: 118, y: snap(floorY + (bottom - floorY) * 0.78) },
  };
  const cy = snap(floorY + (bottom - floorY) * 0.36);
  R.corners = {
    c: { x: 58, y: cy, petX: 118, mat: '#56653d' },
    s: { x: 318, y: cy, petX: 256, mat: '#3f5878' },
    me: { x: 187, y: floorY + 12, petX: 187, mat: '#8f4e3a' },
  };
  return R;
}

// 天色：按小时给窗外三层颜色
function sky(hour) {
  if (hour < 5 || hour >= 21) return ['#141a33', '#1b2443', '#243058', 'night'];
  if (hour < 7) return ['#2b2c55', '#7a5a7a', '#d7906e', 'dawn'];
  if (hour < 17) return ['#7fb0c8', '#9cc4d4', '#c4dcdc', 'day'];
  if (hour < 19) return ['#4a4f7a', '#c4746a', '#f0b070', 'dusk'];
  return ['#1d2142', '#2f3360', '#55507a', 'night'];
}

// 灯在闪：几个正弦叠加，偶尔暗一下
function flicker(t) {
  const n = Math.sin(t * 7.1) * 0.02 + Math.sin(t * 13.7) * 0.015 + Math.sin(t * 2.3) * 0.02;
  const dip = Math.sin(t * 0.9) > 0.985 ? -0.12 : 0;
  return 1 + n + dip;
}

function darkness(hour) {
  // 0 = 白天，1 = 深夜
  if (hour >= 7 && hour < 17) return 0.15;
  if (hour >= 17 && hour < 19) return 0.15 + ((hour - 17) / 2) * 0.6;
  if (hour >= 5 && hour < 7) return 0.75 - ((hour - 5) / 2) * 0.6;
  return 0.75 + (hour >= 21 || hour < 3 ? 0.25 : 0.1);
}

function rect(ctx, x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
}

function drawRoom(ctx, R, o) {
  const { t, hour, lampBoost } = o;
  const W = R.W;
  const fl = flicker(t) + (lampBoost || 0);
  const dark = darkness(hour);

  // 墙
  rect(ctx, 0, R.top, W, R.floorY - R.top, '#3d2f3b');
  for (let x = 0; x < W; x += 15) rect(ctx, x, R.top, PX, R.floorY - R.top, '#392b37');
  rect(ctx, 0, R.top, W, PX * 3, '#2a1f29');
  // 护墙板
  const wy = R.floorY - 54;
  rect(ctx, 0, wy, W, 54, '#33262f');
  rect(ctx, 0, wy, W, PX * 2, '#4c3842');
  for (let x = 12; x < W; x += 48) {
    rect(ctx, x, wy + 12, 36, 30, '#2e222b');
    rect(ctx, x, wy + 12, 36, PX, '#281d25');
  }

  // 窗
  const w = R.win;
  const sk = sky(hour);
  rect(ctx, w.x - 9, w.y - 9, w.w + 18, w.h + 18, PAL.out);
  rect(ctx, w.x - 6, w.y - 6, w.w + 12, w.h + 12, PAL.wood);
  rect(ctx, w.x - 6, w.y + w.h, w.w + 12, 6, PAL.woodS);
  const b1 = snap(w.h * 0.45);
  const b2 = snap(w.h * 0.75);
  rect(ctx, w.x, w.y, w.w, b1, sk[0]);
  rect(ctx, w.x, w.y + b1, w.w, b2 - b1, sk[1]);
  rect(ctx, w.x, w.y + b2, w.w, w.h - b2, sk[2]);
  if (sk[3] === 'night') {
    // 星星一闪一闪
    const stars = [[8, 10], [30, 22], [52, 8], [70, 30], [84, 14], [20, 40], [62, 46]];
    stars.forEach((s, i) => {
      if (Math.sin(t * 1.7 + i * 2.1) > -0.3 && s[1] < w.h - 30) rect(ctx, w.x + s[0], w.y + s[1], PX, PX, '#f4ecd0');
    });
    // 月亮
    rect(ctx, w.x + 66, w.y + 9, 12, 12, '#f2e6c0');
    rect(ctx, w.x + 72, w.y + 9, 6, 6, sk[0]);
  } else if (sk[3] === 'day') {
    rect(ctx, w.x + 12 + ((t * 2) % 60), w.y + 15, 24, 6, '#eef4f2');
    rect(ctx, w.x + 18 + ((t * 2) % 60), w.y + 12, 12, 3, '#eef4f2');
  }
  // 远处楼
  const bld = [[0, 36, 18], [18, 52, 15], [33, 30, 21], [54, 46, 15], [69, 26, 24]];
  bld.forEach((b, i) => {
    const bh = Math.min(b[1], w.h - 6);
    rect(ctx, w.x + b[0], w.y + w.h - bh, b[2], bh, sk[3] === 'day' ? '#6c8a9a' : '#18152a');
    if (sk[3] !== 'day') {
      for (let yy = w.y + w.h - bh + 6; yy < w.y + w.h - 3; yy += 9)
        for (let xx = w.x + b[0] + 3; xx < w.x + b[0] + b[2] - 3; xx += 6) {
          const on = Math.sin(xx * 12.9 + yy * 7.3 + Math.floor(t / 4 + i) * 1.3) > 0.2;
          if (on) rect(ctx, xx, yy, PX, PX, '#e8b65a');
        }
    }
  });
  // 窗框十字
  rect(ctx, w.x + w.w / 2 - 3, w.y, 6, w.h, PAL.wood);
  rect(ctx, w.x, w.y + snap(w.h / 2) - 3, w.w, 6, PAL.wood);
  // 窗帘
  for (const side of [-1, 1]) {
    const cx = side < 0 ? w.x - 21 : w.x + w.w + 3;
    rect(ctx, cx - 3, w.y - 12, 24, w.h + 30, PAL.out);
    rect(ctx, cx, w.y - 9, 18, w.h + 24, '#4f7a6e');
    rect(ctx, cx + (side < 0 ? 12 : 0), w.y - 9, 6, w.h + 24, '#3c6056');
    rect(ctx, cx + 6, w.y - 9, PX, w.h + 24, '#5f8c80');
  }
  rect(ctx, w.x - 30, w.y - 15, w.w + 60, 6, PAL.out);
  rect(ctx, w.x - 27, w.y - 14, w.w + 54, 3, PAL.woodL);

  // 门
  const d = R.door;
  const knock = o.doorShake ? Math.round(Math.sin(t * 60) * 2) : 0;
  rect(ctx, d.x - 6, d.y - 6, d.w + 12, d.h + 6, PAL.out);
  rect(ctx, d.x - 3, d.y - 3, d.w + 6, d.h + 3, '#5a3a2c');
  rect(ctx, d.x + knock, d.y, d.w, d.h, PAL.wood);
  rect(ctx, d.x + d.w - 9 + knock, d.y, 9, d.h, PAL.woodS);
  rect(ctx, d.x + 6 + knock, d.y + 9, d.w - 18, 39, PAL.woodL);
  rect(ctx, d.x + 6 + knock, d.y + 57, d.w - 18, 45, PAL.woodL);
  rect(ctx, d.x + 9 + knock, d.y + 12, d.w - 24, 33, PAL.wood);
  rect(ctx, d.x + 9 + knock, d.y + 60, d.w - 24, 39, PAL.wood);
  rect(ctx, d.x + d.w - 15 + knock, d.y + 54, 6, 6, PAL.glow);
  // 门口挂的小钥匙牌：三个颜色 = 三个人
  ['#7f9a5a', '#5b7fb0', '#c8664a'].forEach((c, i) => rect(ctx, d.x + 9 + i * 9 + knock, d.y - 18, 6, 9, c));

  // 地板
  rect(ctx, 0, R.floorY, W, R.bottom - R.floorY, '#5a4033');
  rect(ctx, 0, R.floorY, W, PX * 2, '#3a2a25');
  rect(ctx, 0, R.floorY + PX * 2, W, PX * 3, '#4b352b');
  let row = 0;
  for (let y = R.floorY + 18; y < R.bottom; y += 18, row++) {
    rect(ctx, 0, y, W, PX, '#4b352b');
    for (let x = (row % 2) * 45 + 20; x < W; x += 90) rect(ctx, x, y - 15, PX, 15, '#4b352b');
  }
  // 中间的地毯
  const p = R.pet;
  ellipse(ctx, p.x, p.y - 6, 96, 26, PAL.out);
  ellipse(ctx, p.x, p.y - 6, 93, 23, '#7a3e36');
  ellipse(ctx, p.x, p.y - 6, 84, 19, '#a3523f');
  ellipse(ctx, p.x, p.y - 6, 72, 14, '#7a3e36');
  for (let i = -3; i <= 3; i++) rect(ctx, p.x + i * 21 - 3, p.y - 7, 6, 3, '#d9a441');

  // 夜里变暗（灯光下面再提亮）
  ctx.fillStyle = 'rgba(12,8,22,' + (dark * 0.5).toFixed(3) + ')';
  ctx.fillRect(0, R.top, W, R.bottom - R.top);

  // 灯光：一圈圈的硬边光（不是渐变，跟赛璐璐一个路子）
  const L = R.lamp;
  const bands = [[220, 0.05], [165, 0.06], [115, 0.07], [70, 0.09]];
  const lightK = (0.5 + dark * 0.7) * fl;
  for (const bd of bands) {
    ctx.fillStyle = 'rgba(255,205,130,' + (bd[1] * lightK).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(L.x, L.y + 70, bd[0], bd[0] * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 地上的光斑
  ctx.fillStyle = 'rgba(255,214,150,' + (0.09 * lightK).toFixed(3) + ')';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 6, 118, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // 吊灯
  rect(ctx, L.x - 1, R.top, PX, L.y - R.top - 12, '#1f1820');
  const sw = Math.round(Math.sin(t * 0.8) * 1);
  ctx.save();
  ctx.translate(sw, 0);
  rect(ctx, L.x - 9, L.y - 15, 18, 6, PAL.out);
  // 灯罩（梯形）
  for (let j = 0; j < 7; j++) {
    const hw = 9 + j * 3;
    rect(ctx, L.x - hw - 3, L.y - 12 + j * 3, hw * 2 + 6, 3, PAL.out);
    rect(ctx, L.x - hw, L.y - 12 + j * 3, hw * 2, 3, j > 4 ? PAL.mustardS : PAL.mustard);
    rect(ctx, L.x + hw - 6, L.y - 12 + j * 3, 6, 3, PAL.mustardS);
  }
  rect(ctx, L.x - 30, L.y + 9, 60, 3, PAL.out);
  // 灯泡
  const bulbA = Math.min(1, 0.75 + (fl - 1) * 3);
  ctx.globalAlpha = Math.max(0.4, bulbA);
  rect(ctx, L.x - 9, L.y + 9, 18, 9, '#fff2c0');
  rect(ctx, L.x - 6, L.y + 18, 12, 3, PAL.glow);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function ellipse(ctx, x, y, rx, ry, col) {
  // 用横条拼的像素椭圆
  ctx.fillStyle = col;
  for (let yy = -ry; yy < ry; yy += PX) {
    const k = 1 - ((yy + PX / 2) / ry) ** 2;
    if (k <= 0) continue;
    const hw = snap(rx * Math.sqrt(k));
    ctx.fillRect(snap(x - hw), snap(y + yy), hw * 2, PX + 0.3);
  }
}

// 一个角落：地垫 + 家具
function drawCorner(ctx, R, id, kind, frame, o) {
  const c = R.corners[id];
  if (id !== 'me') {
    ellipse(ctx, c.x, c.y, 51, 13, PAL.out);
    ellipse(ctx, c.x, c.y, 48, 11, c.mat);
  } else {
    ellipse(ctx, c.x, c.y, 45, 9, PAL.out);
    ellipse(ctx, c.x, c.y, 42, 7, c.mat);
  }
  if (kind) {
    const sp = pix.furnitureSprite(kind, frame);
    pix.blitBottom(ctx, sp, c.x + (id === 'me' ? 0 : id === 'c' ? -6 : 6), c.y + 3, PX);
  } else if (o && o.empty) {
    // 空角落：虚线框 + 加号，一呼一吸
    const a = 0.45 + Math.sin(o.t * 3) * 0.25;
    ctx.globalAlpha = a;
    ctx.fillStyle = PAL.cream2;
    for (let i = -30; i < 30; i += 9) {
      ctx.fillRect(c.x + i, c.y - 54, 5, 3);
      ctx.fillRect(c.x + i, c.y - 3, 5, 3);
    }
    for (let j = -54; j < 0; j += 9) {
      ctx.fillRect(c.x - 33, c.y + j, 3, 5);
      ctx.fillRect(c.x + 30, c.y + j, 3, 5);
    }
    ctx.fillRect(c.x - 9, c.y - 30, 18, 4);
    ctx.fillRect(c.x - 2, c.y - 37, 4, 18);
    ctx.globalAlpha = 1;
  }
}

module.exports = { PX, snap, layout, drawRoom, drawCorner, ellipse, darkness, sky };
