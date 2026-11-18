// 平台层：只有这个文件知道自己跑在微信里还是浏览器里。
// 微信小游戏：wx.createCanvas / wx.onTouchStart / wx.createRewardedVideoAd
// 浏览器预览：一张 <canvas id="game">，用 pointer 事件（只用一种事件，免得一次点击被算两次）
const isWx = typeof wx !== 'undefined' && wx && typeof wx.createCanvas === 'function';

function setup(onTouch) {
  let canvas, width, height, dpr;
  if (isWx) {
    canvas = wx.createCanvas();
    const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
    width = info.windowWidth;
    height = info.windowHeight;
    dpr = info.pixelRatio || 2;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const send = (type) => (e) => {
      const list = e.changedTouches || [];
      for (let i = 0; i < list.length; i++) {
        onTouch(type, list[i].identifier, list[i].clientX, list[i].clientY);
      }
    };
    wx.onTouchStart((e) => { unlockAudio(); send('down')(e); });
    wx.onTouchMove(send('move'));
    wx.onTouchEnd(send('up'));
    wx.onTouchCancel(send('up'));
  } else {
    canvas = document.getElementById('game');
    // 电脑上预览时装成一部手机大小；手机浏览器里就占满屏
    const phone = window.innerWidth > 520;
    width = phone ? 390 : window.innerWidth;
    height = phone ? Math.min(844, window.innerHeight - 20) : window.innerHeight;
    dpr = window.devicePixelRatio || 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      unlockAudio();
      const p = pos(e);
      onTouch('down', e.pointerId, p[0], p[1]);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      onTouch('move', e.pointerId, p[0], p[1]);
    });
    const up = (e) => {
      const p = pos(e);
      onTouch('up', e.pointerId, p[0], p[1]);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }
  return { canvas, ctx: canvas.getContext('2d'), width, height, dpr };
}

function now() {
  return Date.now();
}

function nextFrame(fn) {
  return requestAnimationFrame(fn);
}

function vibrate(strong) {
  if (isWx && wx.vibrateShort) {
    wx.vibrateShort({ type: strong ? 'heavy' : 'light', fail() {} });
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(strong ? 30 : 10);
  }
}

// 激励视频。填了广告位 id 且在微信里才放真广告，返回 true；
// 否则返回 false，由游戏自己放「广告占位」倒计时。
let rewardedAd = null;
function showRewardedAd(adUnitId, onReward, onSkip) {
  onSkip = onSkip || function () {};
  if (!isWx || !adUnitId || !wx.createRewardedVideoAd) return false;
  if (!rewardedAd) rewardedAd = wx.createRewardedVideoAd({ adUnitId });
  rewardedAd.offClose();
  rewardedAd.onClose((res) => {
    // 旧版基础库 res 为 undefined，算看完
    if (!res || res.isEnded) onReward();
    else onSkip();
  });
  rewardedAd.show().catch(() => {
    rewardedAd.load().then(() => rewardedAd.show()).catch(() => onReward());
  });
  return true;
}

// 存档：微信用 wx.setStorageSync，浏览器用 localStorage
function load(key) {
  try {
    const raw = isWx ? wx.getStorageSync(key) : window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function save(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (isWx) wx.setStorageSync(key, raw);
    else window.localStorage.setItem(key, raw);
  } catch (e) {
    // 存不了就算了：原型里不影响玩
  }
}

function exposeForTest(name, value) {
  if (!isWx && typeof window !== 'undefined') window[name] = value;
}

// —— 声音：WebAudio 现场合成（微信用 wx.createWebAudioContext，浏览器用 AudioContext）——
let actx = null;
let noiseBuf = null;
let muted = false;
function audio() {
  if (actx) return actx;
  try {
    if (isWx) {
      if (wx.createWebAudioContext) actx = wx.createWebAudioContext();
    } else if (typeof window !== 'undefined') {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
  } catch (e) {
    actx = null;
  }
  return actx;
}
function unlockAudio() {
  const a = audio();
  if (a && a.state === 'suspended' && a.resume) a.resume();
}
// 一个音：freq 起始频率，to 结束频率，dur 秒，type 波形，vol 音量，delay 延后几秒
function tone(o) {
  const a = audio();
  if (!a || muted) return;
  try {
    const t0 = a.currentTime + (o.delay || 0);
    const dur = o.dur || 0.12;
    const g = a.createGain();
    const vol = (o.vol == null ? 0.2 : o.vol) * 0.6;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 4) + (o.attack || 0));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(a.destination);
    let src;
    if (o.noise) {
      if (!noiseBuf) {
        noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.6), a.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      src = a.createBufferSource();
      src.buffer = noiseBuf;
      const f = a.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.freq || 800, t0);
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
      src.connect(f);
      f.connect(g);
    } else {
      src = a.createOscillator();
      src.type = o.type || 'square';
      src.frequency.setValueAtTime(o.freq, t0);
      if (o.to) src.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
      src.connect(g);
    }
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  } catch (e) {
    // 没声音也能玩
  }
}

// 分享卡：原型里默认只展示；enabled=true 且在微信里才真的调起分享
function share(title, enabled) {
  if (isWx && enabled && wx.shareAppMessage) {
    wx.shareAppMessage({ title });
    return true;
  }
  return false;
}

// 切回前台（关掉再打开、切 App 回来）：补算不在的时间
function onShow(fn) {
  if (isWx) {
    if (wx.onShow) wx.onShow(() => fn());
  } else if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) fn();
    });
  }
}
function onHide(fn) {
  if (isWx) {
    if (wx.onHide) wx.onHide(() => fn());
  } else if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => fn());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) fn();
    });
  }
}

module.exports = { isWx, setup, now, nextFrame, vibrate, showRewardedAd, load, save, exposeForTest, tone, share, onShow, onHide };
