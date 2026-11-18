// 假装成微信小游戏环境跑 game.js：没有 document、没有 window，只有 wx。
// 能跑完 = 代码里没偷偷用网页才有的东西。用法：node test/wx-smoke.js
const path = require('path');
const calls = new Set();
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 12 });
    return (...a) => { calls.add(k); };
  },
  set(t, k, v) { t[k] = v; return true; },
});
const handlers = {};
let saved = null;
let frames = [];
global.wx = {
  createCanvas: () => ({ width: 0, height: 0, getContext: () => ctx }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 }),
  onTouchStart: (f) => (handlers.down = f),
  onTouchMove: (f) => (handlers.move = f),
  onTouchEnd: (f) => (handlers.up = f),
  onTouchCancel: () => {},
  vibrateShort: () => {},
  setStorageSync: (k, v) => { saved = v; },
  getStorageSync: () => '',
  onShow: () => {},
  onHide: () => {},
};
global.requestAnimationFrame = (f) => frames.push(f);
if (typeof global.document !== 'undefined' || typeof global.window !== 'undefined') throw new Error('环境不干净');

require(path.join(__dirname, '..', 'game.js'));
const run = (n) => { for (let i = 0; i < n; i++) { const f = frames.shift(); if (f) f(); } };
run(5);
const touch = (type, x, y) => handlers[type]({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
// 点「进屋」、点喂、在猫身上来回划、点快进
const V = 390 / 375;
const tap = (x, y) => { touch('down', x * V, y * V); touch('up', x * V, y * V); run(10); };
tap(187, 844 / V * 0.84 + 25);
run(30);
tap(50, 844 / V - 238 + 88);
touch('down', 187 * V, (844 / V - 238 - 80) * V);
for (let i = 0; i < 40; i++) touch('move', (187 + (i % 2 ? 30 : -30)) * V, (844 / V - 238 - 80) * V);
touch('up', 187 * V, (844 / V - 238 - 80) * V);
tap(375 - 50, 28);
run(200);
if (!saved) throw new Error('没存档');
console.log('微信环境跑通（存档 ' + saved.length + ' 字）：' + frames.length + ' 帧排队中，画图调用 ' + calls.size + ' 种');
if (!handlers.down || !calls.has('fillRect')) throw new Error('没画出东西或没注册触摸');
