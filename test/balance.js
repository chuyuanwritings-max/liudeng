// 难度体检：不开画面，直接用规则层跑很多个三天，比较几种玩家。用法：node test/balance.js [天数] [局数]
const sim = require('../js/sim.js');

const DAYS = +process.argv[2] || 3;
const RUNS = +process.argv[3] || 200;

// 一次上线：先收爱心，再按最缺的顺序花精力
function visit(S, o) {
  for (const id of ['c', 's']) sim.collectHeart(S, id);
  if (o.ads && S.sick) sim.doctor(S);
  if (o.ads && S.cover) {
    const a = S.cover.acts[0];
    sim.act(S, a, 'me', { free: true });
  }
  if (o.cover && S.cover) for (const a of S.cover.acts.slice()) sim.act(S, a, 'me');
  if (o.hearts) for (const id of ['c', 's']) sim.send(S, id, 'heart');
  for (let i = 0; i < 6 && S.energy >= 1; i++) {
    const order = ['food', 'love', 'clean', 'rest'].sort((a, b) => S.needs[a] - S.needs[b]);
    let done = false;
    for (const k of order) {
      if (S.needs[k] > o.careBelow) continue;
      const a = { food: 'feed', love: 'pat', clean: 'clean', rest: 'tuck' }[k];
      if (!sim.act(S, a, 'me')) { done = true; break; }
    }
    if (!done) break;
  }
}

const players = {
  不来: { every: 1e9 },
  懒人_一天一次: { every: 24 * 60, careBelow: 80 },
  一天两次: { every: 12 * 60, careBelow: 75 },
  一天三次: { every: 8 * 60, careBelow: 75, cover: true },
  勤快_三小时一次不看广告: { every: 180, careBelow: 65, cover: true, hearts: true, sleepHours: true },
  勤快_不替朋友: { every: 180, careBelow: 65, sleepHours: true },
  勤快_三小时一次看广告: { every: 180, careBelow: 65, ads: true, cover: true, hearts: true, sleepHours: true },
};

function run(o, seed) {
  const S = sim.newState(seed);
  const end = S.t + DAYS * 1440;
  let next = S.t;
  while (S.t < end) {
    if (S.t >= next && !(o.sleepHours && ((S.t % 1440) < 7 * 60))) { visit(S, o); next = S.t + o.every; }
    sim.advance(S, 10);
  }
  return S.stats;
}

console.log(DAYS + ' 天 × ' + RUNS + ' 局');
for (const [k, o] of Object.entries(players)) {
  const a = { need: 0, sick: 0, sulk: 0, corner: 0, sickAny: 0, covers: 0, missed: 0, ads: 0 };
  for (let i = 0; i < RUNS; i++) {
    const st = run(o, i * 977 + 1);
    a.need += st.needSum / st.min;
    a.sick += st.sickMin / st.min;
    a.sulk += st.sulkMin / st.min;
    a.corner += st.cornerMin / st.min;
    a.sickAny += st.sickTimes > 0 ? 1 : 0;
    a.covers += st.covers;
    a.missed += st.missed;
    a.ads += st.adCovers + st.doctor;
  }
  const p = (v) => Math.round((v / RUNS) * 100) + '%';
  console.log(
    k.padEnd(16, '　'),
    '平均满足 ' + Math.round(a.need / RUNS),
    '| 闹脾气 ' + p(a.sulk),
    '| 生病时间 ' + p(a.sick),
    '| 病过 ' + p(a.sickAny),
    '| 在朋友角落 ' + p(a.corner),
    '| 朋友缺席 ' + (a.missed / RUNS).toFixed(1) + ' 次',
    '| 你替了 ' + (a.covers / RUNS).toFixed(1),
    '| 广告 ' + (a.ads / RUNS).toFixed(1)
  );
}
