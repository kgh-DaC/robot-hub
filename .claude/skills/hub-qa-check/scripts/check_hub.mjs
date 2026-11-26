// 사용: node .claude/skills/hub-qa-check/scripts/check_hub.mjs [통합 폴더 경로]
// 허브 정적 검사. 외부 의존성 없음. 결과를 표 형태로 출력하고 실패가 있으면 exit 1.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(process.argv[2] || '.');
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

// 1. 필수 파일
for (const f of ['index.html', 'hub/hub.css', 'hub/hub.js', 'hub/robots.config.js', 'start_hub.bat'])
  ok(`파일 존재: ${f}`, exists(f));

// 2. index.html 이 참조하는 로컬 스크립트·스타일이 실제로 있는가, 외부 URL이 없는가
if (exists('index.html')) {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"'#]+)["']/g)].map((m) => m[1]);
  for (const r of refs) {
    if (/^https?:\/\//i.test(r) || r.startsWith('//')) ok(`외부 참조 없음: ${r}`, false, 'CDN/외부 URL 금지');
    else if (!r.startsWith('data:')) ok(`참조 경로: ${r}`, exists(decodeURI(r)));
  }
  ok('module 스크립트 미사용', !/type\s*=\s*["']module["']/i.test(html), 'file:// 대체 모드에서 막힘');
}

// 3. 설정 + 모듈 로드
const modules = [];
const sandbox = { window: {}, console, document: undefined };
sandbox.window.RobotHub = { register: (m) => modules.push(m) };
sandbox.RobotHub = sandbox.window.RobotHub;
let robots = [];
try {
  vm.runInNewContext(read('hub/robots.config.js'), sandbox, { filename: 'robots.config.js' });
  robots = sandbox.window.ROBOTS || [];
  ok('ROBOTS 4대 정의', robots.length === 4, `실제 ${robots.length}`);
  ok('HUB_CONFIG.idleMs 존재', !!(sandbox.window.HUB_CONFIG && sandbox.window.HUB_CONFIG.idleMs));
} catch (e) { ok('robots.config.js 실행', false, e.message); }

for (const r of robots) {
  ok(`[${r.id}] 제어 웹 경로 존재: ${r.page}`, !!r.page && exists(r.page));
  ok(`[${r.id}] 정지 방법 지정(stop.steps)`, !!(r.stop && Array.isArray(r.stop.steps) && r.stop.steps.length), '없으면 iframe 제거만 가능 → 보고서에 명시');
  const modFile = `hub/robots/${r.id}.js`;
  if (!exists(modFile)) { ok(`[${r.id}] 애니메이션 모듈 존재`, false, modFile); continue; }
  try { vm.runInNewContext(read(modFile), sandbox, { filename: modFile }); }
  catch (e) { ok(`[${r.id}] 모듈 로드`, false, e.message); continue; }
  const m = modules.find((x) => x.id === r.id);
  ok(`[${r.id}] register() id 일치`, !!m);
  if (!m) continue;
  ok(`[${r.id}] mount/destroy 함수`, typeof m.mount === 'function' && typeof m.destroy === 'function');
  const mo = m.motions || [];
  ok(`[${r.id}] 동작 4~6개`, mo.length >= 4 && mo.length <= 6, `실제 ${mo.length}`);
  for (const x of mo) {
    ok(`[${r.id}] ${x.key} ms 2000~3200`, x.ms >= 2000 && x.ms <= 3200, `${x.ms}`);
    ok(`[${r.id}] ${x.key} 자막 2~6자`, typeof x.label === 'string' && [...x.label].length >= 2 && [...x.label].length <= 6, x.label);
    ok(`[${r.id}] ${x.key} play 함수`, typeof x.play === 'function');
  }
  // 인벤토리와 대조
  const invPath = `_workspace/01_inventory_${r.id}.json`;
  if (exists(invPath)) {
    const inv = JSON.parse(read(invPath));
    const keys = new Set((inv.motions || []).map((z) => z.key));
    for (const x of mo) ok(`[${r.id}] ${x.key} 인벤토리 근거 있음`, keys.has(x.key));
    ok(`[${r.id}] 제어 웹 경로 = 인벤토리`, inv.control_page && inv.control_page.path === r.page, `${inv.control_page && inv.control_page.path}`);
  } else ok(`[${r.id}] 인벤토리 파일`, false, invPath);
  // 모듈 내 색 하드코딩
  const src = read(modFile);
  const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  ok(`[${r.id}] 색 하드코딩 없음(CSS 변수 사용)`, hex.length === 0, hex.slice(0, 3).join(' '));
}

// 4. 셸에 로봇 id 하드코딩 금지, 외부 요청 금지
if (exists('hub/hub.js')) {
  const js = read('hub/hub.js');
  for (const r of robots) ok(`hub.js에 '${r.id}' 하드코딩 없음`, !new RegExp(`['"\`]${r.id}['"\`]`).test(js));
  ok('hub.js 외부 URL 없음', !/https?:\/\/(?!localhost|127\.0\.0\.1)/.test(js));
  ok('hub.js eval/new Function 없음', !/\beval\s*\(|new\s+Function\s*\(/.test(js));
  ok('hub.js 무입력 이벤트 등록', /pointerdown/.test(js) && /keydown/.test(js));
  ok('hub.js iframe allow 속성', /bluetooth/.test(js) || /bluetooth/.test(exists('index.html') ? read('index.html') : ''));
}

// 5. 펌웨어 업로드: 설정 ↔ manifest ↔ 산출물 대조(설정에 firmware 가 있는 로봇만)
const fwRobots = robots.filter((r) => r.firmware);
if (fwRobots.length) {
  for (const f of ['hub/flash/stk500.js', 'hub/flash/esp32.js', 'hub/vendor/esptool.bundle.js', 'hub/firmware/manifest.json', 'hub/firmware/manifest.js'])
    ok(`파일 존재: ${f}`, exists(f));
  let man = null;
  try { man = JSON.parse(read('hub/firmware/manifest.json')); } catch (e) { ok('manifest.json 읽기', false, e.message); }
  if (man && exists('hub/firmware/manifest.js')) {
    const sb = { window: {} };
    try { vm.runInNewContext(read('hub/firmware/manifest.js'), sb); ok('manifest.js = manifest.json', JSON.stringify(sb.window.HUB_FIRMWARE_MANIFEST) === JSON.stringify(man)); }
    catch (e) { ok('manifest.js 실행', false, e.message); }
  }
  const crypto = await import('node:crypto');
  for (const r of fwRobots) {
    const e = man && man.robots && man.robots[r.id];
    ok(`[${r.id}] manifest 항목`, !!e);
    if (!e) continue;
    ok(`[${r.id}] 펌웨어 빌드 상태 ok`, e.status === 'ok', e.status === 'failed' ? `failed: ${String(e.error).split('\n')[0]}` : '');
    ok(`[${r.id}] 방식 = 설정`, e.method === r.firmware.method && ['avr', 'esp32'].includes(e.method), e.method);
    ok(`[${r.id}] fqbn = 설정`, e.fqbn === r.firmware.fqbn, e.fqbn);
    if (r.firmware.flashLimit) ok(`[${r.id}] Flash ≤ 실측 한도`, e.size && e.size.flash <= r.firmware.flashLimit, `${e.size && e.size.flash}/${r.firmware.flashLimit}`);
    for (const f of e.files || []) {
      const p = `hub/firmware/${r.id}/${f.name}`;
      const okFile = exists(p) && crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex') === f.sha256;
      ok(`[${r.id}] ${f.name} sha256`, okFile);
    }
    ok(`[${r.id}] firmware.data.js 존재`, !!e.data && exists(e.data), e.data);
    if (e.method === 'esp32') {
      const want = { 'bootloader.bin': 0x1000, 'partitions.bin': 0x8000, 'boot_app0.bin': 0xe000, 'app.bin': 0x10000 };
      for (const [n, a] of Object.entries(want)) ok(`[${r.id}] ${n} @0x${a.toString(16)}`, (e.files || []).some((f) => f.name === n && f.address === a));
    }
  }
}

const fail = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.name}${r.detail ? ' | ' + r.detail : ''}`);
console.log(`\n합계: ${results.length - fail.length}/${results.length} 통과, 실패 ${fail.length}`);
process.exit(fail.length ? 1 : 0);
