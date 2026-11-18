// 音效配方：每种操作一个声音，事越大声音越大、越长。全部用 platform.tone 现场合成。
const platform = require('./platform.js');
const T = platform.tone;

const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047 };

const S = {
  tap() { T({ freq: 880, to: 660, dur: 0.05, type: 'square', vol: 0.08 }); },
  press() { T({ freq: 520, dur: 0.04, type: 'triangle', vol: 0.08 }); },
  no() { T({ freq: 180, to: 140, dur: 0.16, type: 'square', vol: 0.1 }); T({ freq: 150, dur: 0.12, type: 'square', vol: 0.08, delay: 0.1 }); },
  meow() { T({ freq: 700, to: 980, dur: 0.12, type: 'triangle', vol: 0.14 }); T({ freq: 980, to: 620, dur: 0.18, type: 'triangle', vol: 0.12, delay: 0.1 }); },
  // 倒猫粮：一串高音叮叮
  pour() { for (let i = 0; i < 7; i++) T({ freq: 1400 + Math.random() * 900, dur: 0.04, type: 'square', vol: 0.05, delay: i * 0.06 }); },
  nom() { T({ freq: 240, to: 160, dur: 0.08, type: 'square', vol: 0.09 }); },
  // 呼噜：低频噪声一下一下
  purr() { T({ noise: true, freq: 220, to: 160, dur: 0.22, vol: 0.12 }); },
  rub() { T({ noise: true, freq: 1800, to: 900, dur: 0.06, vol: 0.04, filter: 'bandpass' }); },
  bubble() { T({ freq: 500 + Math.random() * 500, to: 1300, dur: 0.06, type: 'sine', vol: 0.09 }); },
  whoosh() { T({ noise: true, freq: 2400, to: 300, dur: 0.35, vol: 0.12 }); },
  lullaby() { [N.E5, N.C5, N.G4].forEach((f, i) => T({ freq: f, dur: 0.32, type: 'triangle', vol: 0.12, delay: 0.25 + i * 0.28 })); },
  done() { T({ freq: N.C5, dur: 0.1, type: 'square', vol: 0.09 }); T({ freq: N.G5, dur: 0.16, type: 'square', vol: 0.09, delay: 0.08 }); },
  heart() { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => T({ freq: f, dur: 0.12, type: 'square', vol: 0.09, delay: i * 0.06 })); },
  knock() { T({ freq: 120, to: 70, dur: 0.1, type: 'sine', vol: 0.3 }); T({ freq: 120, to: 70, dur: 0.1, type: 'sine', vol: 0.3, delay: 0.18 }); T({ noise: true, freq: 500, dur: 0.05, vol: 0.08 }); },
  bell() { T({ freq: N.E5, dur: 0.4, type: 'triangle', vol: 0.15 }); T({ freq: N.C5, dur: 0.6, type: 'triangle', vol: 0.15, delay: 0.25 }); },
  absent() { T({ freq: N.A4, to: N.F4, dur: 0.3, type: 'triangle', vol: 0.12 }); T({ freq: N.E4, dur: 0.4, type: 'triangle', vol: 0.1, delay: 0.25 }); },
  sick() { [N.E4, N.D4, N.C4].forEach((f, i) => T({ freq: f, dur: 0.3, type: 'triangle', vol: 0.14, delay: i * 0.22 })); },
  sulk() { T({ freq: 320, to: 200, dur: 0.25, type: 'square', vol: 0.08 }); },
  // 大事：替朋友 / 治好 / 重逢 —— 和弦 + 琶音，更响更长
  cover() {
    [N.C5, N.E5, N.G5].forEach((f) => T({ freq: f, dur: 0.7, type: 'triangle', vol: 0.12 }));
    [N.G5, N.C6].forEach((f, i) => T({ freq: f, dur: 0.25, type: 'square', vol: 0.07, delay: 0.3 + i * 0.12 }));
  },
  cured() {
    [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6].forEach((f, i) => T({ freq: f, dur: 0.18, type: 'square', vol: 0.11, delay: i * 0.09 }));
    T({ freq: N.C4, dur: 0.9, type: 'triangle', vol: 0.16, delay: 0.1 });
  },
  reunion() {
    S.meow();
    [N.G4, N.C5, N.E5, N.G5].forEach((f, i) => T({ freq: f, dur: 0.3, type: 'triangle', vol: 0.13, delay: 0.25 + i * 0.1 }));
  },
  ad() { T({ freq: 660, dur: 0.08, type: 'square', vol: 0.08 }); },
  ff() { T({ freq: 300, to: 1200, dur: 0.35, type: 'sawtooth', vol: 0.06 }); },
  place() { T({ freq: 200, to: 120, dur: 0.12, type: 'square', vol: 0.12 }); S.done(); },
};

module.exports = S;
