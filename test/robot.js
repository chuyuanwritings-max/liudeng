// 测试机器人：手机大小的浏览器里，用「快进」各过三天，比较懒人和勤快人；顺路截图。用法：node test/robot.js
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const shots = path.join(__dirname, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'preview.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  const ok = [];
  const check = (cond, msg) => { if (!cond) throw new Error('没通过：' + msg); ok.push(msg); };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const SC = await g(() => __liudeng.scale);
  const snap = (n) => page.screenshot({ path: path.join(shots, n + '.png') });
  const S = () => g(() => { const s = __liudeng.S(); return JSON.parse(JSON.stringify({ needs: s.needs, energy: s.energy, sick: s.sick, sulk: s.sulk, asleep: s.asleep, cover: s.cover, hearts: s.hearts, corner: s.corner, stats: s.stats, t: s.t, log: s.log.length })); });
  const btn = (id) => g((i) => __liudeng.G.buttons.find((x) => x.id === i) || null, id);
  const clickBtn = async (id) => {
    const b = await btn(id);
    if (!b) return false;
    const cx = b.r ? b.x : b.x + b.w / 2;
    const cy = b.r ? b.y : b.y + b.h / 2;
    await page.mouse.click(cx * SC, cy * SC);
    await page.waitForTimeout(60);
    return true;
  };
  const rub = async (n) => {
    const p = await g(() => ({ x: __liudeng.G.pet.x, y: __liudeng.G.pet.y }));
    const y = (p.y - 40) * SC;
    await page.mouse.move((p.x - 30) * SC, y);
    await page.mouse.down();
    for (let i = 0; i < n; i++) await page.mouse.move((p.x + (i % 2 ? -30 : 30)) * SC, y + (i % 3), { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(60);
  };
  const closeAway = async () => { if (await g(() => __liudeng.G.over && __liudeng.G.over.type === 'away')) await clickBtn('away_ok'); };
  const waitAd = async () => { await page.waitForTimeout(300); await page.waitForFunction(() => !__liudeng.G.over || __liudeng.G.over.type !== 'ad', null, { timeout: 4000 }); await page.waitForTimeout(80); };

  // —— 开场 ——
  await snap('01_开场');
  check(await g(() => __liudeng.G.mode === 'title'), '打开先是开场');
  await clickBtn('enter');
  check(await g(() => __liudeng.G.mode === 'room'), '点「进屋」进小屋');
  await page.waitForTimeout(700);
  await snap('02_小屋_傍晚');

  // —— 一次点击只算一次 ——
  await g(() => { const s = __liudeng.S(); s.needs.food = 60; });
  const e0 = (await S()).energy;
  await clickBtn('act_feed');
  const s1 = await S();
  check(s1.energy === e0 - 1 && s1.needs.food > 85, '点一下「喂」：只花 1 点精力，饱涨了');
  await page.waitForTimeout(500);
  await snap('03_喂');
  await clickBtn('act_feed');
  check((await S()).energy === e0 - 1, '它饱了再点：不花精力，提示「不需要」');
  await g(() => { const s = __liudeng.S(); s.needs.love = 40; });
  await rub(14);
  check((await S()).needs.love > 55, '手指在它身上来回划 = 摸头');
  await g(() => { const s = __liudeng.S(); s.energy = 0; s.needs.clean = 40; });
  await clickBtn('act_clean');
  check(await g(() => __liudeng.G.toast && __liudeng.G.toast.text === '没精力了'), '没精力：按钮变暗，点了提示「没精力了」');

  // —— 弹层截图 ——
  await clickBtn('corner_c'); await page.waitForTimeout(300); await snap('04_朋友小C');
  await clickBtn('heart_c');
  check(await g(() => __liudeng.S().sentHeart.c >= 0), '给小C 留爱心（她当天缺席机会减半）');
  await clickBtn('corner_me'); await page.waitForTimeout(300); await snap('05_摆家具');
  await clickBtn('furn_tent'); await page.waitForTimeout(500); await snap('06_广告占位');
  await waitAd();
  check(await g(() => __liudeng.S().furniture.me === 'tent'), '看广告解锁限定家具「星星帐篷」并放进你的角落');
  await clickBtn('share'); await page.waitForTimeout(300); await snap('07_分享卡');
  check(await g(() => __liudeng.G.over.title.indexOf('快回来') >= 0), '分享卡只展示文案：' + (await g(() => __liudeng.G.over.title)));
  await page.mouse.click(195 * SC, 60 * SC); await page.waitForTimeout(400);

  // —— 三天：懒人 vs 勤快人 ——
  async function play(kind) {
    await g(() => __liudeng.reset());
    await page.waitForTimeout(100);
    let sickSeen = false, coverSeen = false, cornerSeen = false, ads = 0;
    for (let i = 0; i < 24; i++) {
      await clickBtn('ff');
      await page.waitForTimeout(40);
      const st = await S();
      if (st.sick) sickSeen = true;
      if (st.cover) coverSeen = true;
      if (st.corner) cornerSeen = true;
      if (kind === 'lazy' && i === 5) await snap('20_懒人_第2天的弹窗');
      await closeAway();
      if (kind === 'lazy') {
        if (i % 4 === 3) await clickBtn('act_feed'); // 一天两次，只喂一下
        if (i === 17) { await page.waitForTimeout(300); await snap('21_懒人_第3天'); }
        continue;
      }
      // 勤快人：收爱心 → 病了请医生 → 朋友没来就替她（看广告）→ 花精力补最缺的
      for (const id of ['c', 's']) if (st.hearts[id]) await clickBtn('corner_' + id);
      if (st.sick) { await clickBtn('doctor'); await waitAd(); ads++; }
      if ((await S()).cover) {
        if (!coverSeen || i === 1) {}
        await clickBtn('cover_ad'); await page.waitForTimeout(200);
        if (ads === 0) await snap('10_勤快_替朋友广告');
        await waitAd(); ads++;
        await page.waitForTimeout(250);
        if (ads === 1) await snap('11_勤快_替朋友之后');
      }
      for (let k = 0; k < 4; k++) {
        const s = await S();
        if (s.energy < 1) break;
        const order = ['food', 'love', 'clean', 'rest'].sort((a, b) => s.needs[a] - s.needs[b]);
        const need = order.find((n) => s.needs[n] < 65 && !(s.asleep && (n === 'food' || n === 'clean')) && !(n === 'rest' && (s.asleep || s.needs.rest >= 75)));
        if (!need) break;
        if (need === 'food') await clickBtn('act_feed');
        else if (need === 'rest') await clickBtn('act_tuck');
        else if (need === 'love') await rub(14);
        else { await clickBtn('act_clean'); await rub(18); }
        await page.waitForTimeout(40);
      }
      if (i === 8) { await page.waitForTimeout(300); await snap('12_勤快_第2天'); }
    }
    await page.waitForTimeout(300);
    await snap(kind === 'lazy' ? '22_懒人_第4天早上' : '13_勤快_第4天早上');
    const st = (await S()).stats;
    return { avg: Math.round(st.needSum / st.min), sick: Math.round((st.sickMin / st.min) * 100), sulk: Math.round((st.sulkMin / st.min) * 100), corner: Math.round((st.cornerMin / st.min) * 100), missed: st.missed, covers: st.covers, ads, sickSeen, coverSeen, cornerSeen };
  }
  const lazy = await play('lazy');
  await clickBtn('log'); await page.waitForTimeout(300); await snap('23_懒人_痕迹记录');
  await page.mouse.click(195 * SC, 400 * SC); await page.waitForTimeout(400);
  const good = await play('good');
  const fmt = (r) => '平均满足 ' + r.avg + '，闹脾气 ' + r.sulk + '%，生病 ' + r.sick + '%，在朋友角落 ' + r.corner + '%，朋友缺席 ' + r.missed + ' 次，你替了 ' + r.covers + ' 次，广告 ' + r.ads + ' 次';
  console.log('懒人（一天来两次，只喂一下）：' + fmt(lazy));
  console.log('勤快人（三小时一次）：' + fmt(good));
  check(good.avg > lazy.avg + 15, '勤快人平均满足明显更高（' + good.avg + ' vs ' + lazy.avg + '）');
  check(lazy.sick > good.sick && lazy.sulk > good.sulk, '懒人的猫闹脾气、生病多得多');
  check(lazy.sickSeen || lazy.cornerSeen, '懒人看得到后果：生病 / 跑去朋友角落');
  check(lazy.missed + good.missed > 0, '三天里假朋友会缺席');
  check(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  await browser.close();
  console.log(ok.map((m) => '✓ ' + m).join('\n'));
  console.log('共 ' + ok.length + ' 项');
})().catch((e) => { console.error(e.message); process.exit(1); });
