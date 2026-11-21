// Headless desktop check: meadow, wind, night, figure event. Screenshots in ./shots
const { chromium } = require('playwright');
const out = __dirname + '/shots/';
require('fs').mkdirSync(out, { recursive: true });
const steps = (process.argv[2] || 'all').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[stats]')) errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.goto('http://localhost:5173/?day=600');
  await p.waitForTimeout(1500);
  await p.mouse.click(640, 360); // start audio + remove overlay
  const ev = (f, a) => p.evaluate(f, a);
  const st = async (tag) => console.log(tag, JSON.stringify(await ev(() => window.__poc?.stats())));
  const shot = async (n) => { await p.screenshot({ path: out + n + '.png' }); console.log('shot', n); };
  await p.waitForTimeout(12000); await st('meadow');
  await ev(() => __poc.look(0.6, -0.12));
  await shot('1_meadow_a'); await p.waitForTimeout(700); await shot('1_meadow_b_wind');
  if (steps.includes('all') || steps.includes('biomes')) for (const [i, bm] of ['forest', 'cave', 'sea'].entries()) {
    console.log('teleport', bm, await ev((x) => __poc.teleport(x), bm));
    await p.waitForTimeout(9000); await st(bm); await shot(`2_${i}_${bm}`);
    if (bm === 'sea') { await ev(() => __poc.look(0, -0.5)); await p.keyboard.down('KeyC'); await p.waitForTimeout(2500); await p.keyboard.up('KeyC'); await st('dive'); await shot('2_3_underwater'); }
  }
  await ev(() => __poc.teleport('meadow')); await p.waitForTimeout(6000);
  await ev(() => __poc.setPhase(0.75)); await p.waitForTimeout(1500); await st('night'); await shot('3_night');
  await ev(() => __poc.trigger()); await p.waitForTimeout(3200); await st('after-trigger');
  await shot('4_figure_edge'); // figure at ~50deg, should be at edge of 75deg vfov / wider hfov
  await ev(() => __poc.lookAtFigure()); await p.waitForTimeout(150); await shot('5_looking'); await p.waitForTimeout(600);
  await st('after-look'); await shot('6_popped');
  console.log('eventlog', JSON.stringify(await ev(() => __poc.event.log)));
  // unseen path: trigger, look away, wait > lifetime
  await ev(() => __poc.trigger()); await p.waitForTimeout(3000); await ev(() => __poc.look(Math.PI, 0));
  await p.waitForTimeout(11000); console.log('eventlog', JSON.stringify(await ev(() => __poc.event.log)));
  console.log(errs.slice(0, 30).join('\n'));
  await b.close();
})();
