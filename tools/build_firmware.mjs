#!/usr/bin/env node
// 로봇별 기본 펌웨어 빌드(로컬·CI 공용). 외부 npm 의존성 없음.
//
// 사용: node tools/build_firmware.mjs [--install] [--force] [--only smars,bike] [--allow-dirty]
//   --install      robots.config.js 의 firmware.core / libraries 버전을 arduino-cli 로 설치(CI 첫 단계)
//   --force        소스 커밋이 manifest 와 같아도 다시 빌드
//   --only         일부 로봇만
//   --allow-dirty  스케치 폴더에 커밋 안 된 변경이 있어도 빌드(manifest 에 dirty 로 기록)
//
// 입력: hub/robots.config.js 의 firmware 항목(로봇 정보의 유일한 출처). 로봇 폴더는 읽기만 한다.
// 출력: hub/firmware/{id}/ (빌드 산출물 + firmware.data.js), hub/firmware/manifest.json, hub/firmware/manifest.js
//
// 건너뛰기: 그 로봇의 "소스 커밋"(스케치 폴더·libraryDirs 를 마지막으로 바꾼 커밋)과 빌드 설정 키가
//   manifest 와 같고 파일 sha256 이 맞으면 다시 빌드하지 않는다. ESP32 바이너리는 같은 소스라도 빌드마다
//   바이트가 달라지므로(빌드 시각 등) 이렇게 해야 CI 가 매시간 쓸데없는 커밋을 만들지 않는다.
// 실패: 그 로봇의 기존 펌웨어 파일과 정보는 그대로 두고 manifest 에 status:'failed', failedCommit, error 를 적는다.
//   같은 커밋·같은 설정에서 이미 실패했다면 다시 시도하지 않는다(--force 로 재시도). 새 실패가 있으면 종료 코드 1.
//
// arduino-cli 라이브러리 폴더는 .fwbuild/arduino-user 로 따로 둔다(ARDUINO_DIRECTORIES_USER).
// 이 PC 의 스케치북 라이브러리(다른 버전의 Servo 등)가 섞이지 않게 하고, CI 와 같은 버전으로 빌드하기 위해서다.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FORMAT = 1;   // 산출물 형식이 바뀌면 올린다(빌드 설정 키에 들어가 전체 재빌드)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'hub', 'firmware');
const WORK = path.join(ROOT, '.fwbuild');
// 빌드 폴더: ESP32 링커(ld)는 한글 등 ASCII 밖 경로에 출력 파일을 못 만든다(2026-11-26 실측, '통합' 폴더).
// 저장소 경로가 ASCII 가 아니면 OS 임시 폴더를 쓴다. FW_BUILD_DIR 로 바꿀 수 있다.
const BUILD_ROOT = process.env.FW_BUILD_DIR ||
  (/^[ -~]*$/.test(WORK) ? path.join(WORK, 'build') : path.join(os.tmpdir(), 'robot-hub-fwbuild'));
const ESP32_INDEX = 'https://espressif.github.io/arduino-esp32/package_esp32_index.json';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const onlyArg = (() => { const i = args.indexOf('--only'); return i >= 0 ? String(args[i + 1] || '').split(',').filter(Boolean) : null; })();

const env = { ...process.env };
env.ARDUINO_DIRECTORIES_USER = process.env.FW_ARDUINO_USER || path.join(WORK, 'arduino-user');
const CLI = process.env.ARDUINO_CLI || 'arduino-cli';

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { cwd: opts.cwd || ROOT, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: false });
  if (r.error) throw r.error;
  if (opts.check !== false && r.status !== 0) {
    const e = new Error(`${cmd} ${argv.join(' ')} 실패(${r.status})\n${(r.stderr || '').slice(-4000)}\n${(r.stdout || '').slice(-4000)}`);
    e.stdout = r.stdout; e.stderr = r.stderr;
    throw e;
  }
  return r;
}
const git = (dir, ...a) => run('git', ['-C', dir, ...a]).stdout.trim();
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const log = (...a) => console.log('[fw]', ...a);

// ---------------------------------------------------------------- 설정
function loadRobots() {
  const sb = { window: {}, console };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'hub', 'robots.config.js'), 'utf8'), sb, { filename: 'robots.config.js' });
  return (sb.window.ROBOTS || []).filter((r) => r.firmware);
}

function readManifest() {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); }
  catch { return { schema: 1, robots: {} }; }
}

function writeIfChanged(file, text) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return true;
}

// ---------------------------------------------------------------- 설치(--install)
function install(robots) {
  const cores = [...new Set(robots.map((r) => r.firmware.core).filter(Boolean))];
  const libs = [...new Set(robots.flatMap((r) => r.firmware.libraries || []))];
  const urls = ['--additional-urls', ESP32_INDEX];
  log('보드 목록 갱신');
  run(CLI, ['core', 'update-index', ...urls]);
  for (const c of cores) { log('코어 설치', c); run(CLI, ['core', 'install', c, ...urls]); }
  if (libs.length) {
    log('라이브러리 목록 갱신');
    run(CLI, ['lib', 'update-index']);
    for (const l of libs) { log('라이브러리 설치', l); run(CLI, ['lib', 'install', l]); }
  }
}

function installedVersions() {
  const v = { cli: '', cores: {}, libs: {} };
  try { v.cli = (JSON.parse(run(CLI, ['version', '--format', 'json']).stdout).VersionString) || ''; } catch { /* 무시 */ }
  try {
    const j = JSON.parse(run(CLI, ['core', 'list', '--format', 'json']).stdout);
    for (const p of j.platforms || []) v.cores[p.id] = p.installed_version || (p.release && p.release.version) || '';
  } catch { /* 무시 */ }
  try {
    const j = JSON.parse(run(CLI, ['lib', 'list', '--format', 'json']).stdout);
    for (const l of j.installed_libraries || []) v.libs[l.library.name] = l.library.version || '';
  } catch { /* 무시 */ }
  return v;
}

// ---------------------------------------------------------------- 소스 정보
function sourceInfo(fw) {
  const parts = fw.sketch.split('/');
  const repo = parts[0];
  const repoDir = path.join(ROOT, repo);
  const rel = (p) => p.split('/').slice(1).join('/');
  const paths = [rel(fw.sketch), ...(fw.libraryDirs || []).filter((d) => d.split('/')[0] === repo).map(rel)];
  const commit = git(repoDir, 'log', '-1', '--format=%H', '--', ...paths);
  const head = git(repoDir, 'rev-parse', 'HEAD');
  const date = commit ? git(repoDir, 'log', '-1', '--format=%cI', commit) : '';
  const dirty = git(repoDir, 'status', '--porcelain', '--', ...paths) !== '';
  let url = '';
  try { url = git(repoDir, 'remote', 'get-url', 'origin'); } catch { /* 무시 */ }
  return { repo, url, path: rel(fw.sketch), commit, commitDate: date, head, dirty };
}

function buildKey(fw) {
  const k = { FORMAT, fqbn: fw.fqbn, core: fw.core, libraries: fw.libraries || [], libraryDirs: fw.libraryDirs || [], method: fw.method, flashLimit: fw.flashLimit || 0 };
  return sha256(JSON.stringify(k)).slice(0, 16);
}

function filesIntact(id, entry) {
  if (!entry || !Array.isArray(entry.files) || !entry.files.length) return false;
  for (const f of entry.files) {
    const p = path.join(OUT, id, f.name);
    if (!fs.existsSync(p) || sha256(fs.readFileSync(p)) !== f.sha256) return false;
  }
  return fs.existsSync(path.join(OUT, id, 'firmware.data.js'));
}

// ---------------------------------------------------------------- 빌드
function parseHexSize(text) {
  // 이미지 끝 주소(바이트) = 필요한 Flash 크기
  let base = 0, end = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(':')) continue;
    const n = parseInt(line.substr(1, 2), 16), addr = parseInt(line.substr(3, 4), 16), type = parseInt(line.substr(7, 2), 16);
    if (type === 0) end = Math.max(end, base + addr + n);
    else if (type === 2) base = parseInt(line.substr(9, 4), 16) << 4;
    else if (type === 4) base = parseInt(line.substr(9, 4), 16) << 16;
  }
  return end;
}

function compile(r, src) {
  const fw = r.firmware;
  const buildDir = path.join(BUILD_ROOT, r.id);
  fs.rmSync(buildDir, { recursive: true, force: true });
  const argv = ['compile', '--fqbn', fw.fqbn, '--build-path', buildDir, '--warnings', 'none', '--format', 'json'];
  for (const d of fw.libraryDirs || []) argv.push('--libraries', path.join(ROOT, d));
  argv.push(path.join(ROOT, fw.sketch));
  log(r.id, '컴파일', fw.fqbn);
  const res = run(CLI, argv, { check: false });
  let j = null;
  try { j = JSON.parse(res.stdout); } catch { /* 아래에서 실패 처리 */ }
  if (res.status !== 0 || !j || !j.success) {
    const msg = (j && (j.compiler_err || j.error)) || res.stderr || res.stdout || '컴파일 실패';
    const lines = String(msg).trim().split(/\r?\n/);
    const errs = lines.filter((l) => /error|오류/i.test(l));   // 요약 첫 줄에 실제 오류가 오게
    throw new Error([...errs.slice(0, 3), ...lines.slice(-12)].join('\n'));
  }
  const br = j.builder_result || {};
  const sec = br.executable_sections_size || [];
  const text = sec.find((s) => s.name === 'text') || {};
  const data = sec.find((s) => s.name === 'data') || {};
  const size = { flash: text.size || 0, flashMax: text.max_size || 0, ram: data.size || 0, ramMax: data.max_size || 0 };
  if (fw.flashLimit) {
    size.flashLimit = fw.flashLimit;
    if (size.flash > fw.flashLimit) throw new Error(`Flash ${size.flash}B 가 실측 한도 ${fw.flashLimit}B 를 넘습니다(넘으면 업로드 후 부팅이 멈춤)`);
  }
  const libs = (br.used_libraries || []).map((l) => ({ name: l.name, version: l.version || '', location: l.location || '' }));
  const plat = br.build_platform || br.board_platform || {};
  const sketchName = path.basename(fw.sketch);
  const files = [];
  let flash = null;

  if (fw.method === 'avr') {
    const hex = fs.readFileSync(path.join(buildDir, sketchName + '.ino.hex'));
    const end = parseHexSize(hex.toString('utf8'));
    files.push({ name: 'firmware.hex', kind: 'hex', address: 0, size: end, sha256: sha256(hex), _buf: hex });
  } else if (fw.method === 'esp32') {
    // flash_args: 1줄째 플래시 설정, 그 뒤 "주소 파일" (코어가 만든 업로드 목록 그대로)
    const lines = fs.readFileSync(path.join(buildDir, 'flash_args'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const opt = lines.shift();
    const m = (k) => { const x = opt.match(new RegExp('--' + k + '\\s+(\\S+)')); return x ? x[1] : ''; };
    flash = { mode: m('flash-mode'), freq: m('flash-freq'), size: m('flash-size') };
    const rename = (f) => /bootloader\.bin$/.test(f) ? 'bootloader.bin' : /partitions\.bin$/.test(f) ? 'partitions.bin' : /boot_app0\.bin$/.test(f) ? 'boot_app0.bin' : /\.ino\.bin$/.test(f) ? 'app.bin' : path.basename(f);
    for (const l of lines) {
      const [addr, f] = l.split(/\s+/);
      const p = path.isAbsolute(f) ? f : path.join(buildDir, f);
      const buf = fs.readFileSync(p);
      files.push({ name: rename(f), kind: 'bin', address: parseInt(addr, 16), size: buf.length, sha256: sha256(buf), _buf: buf });
    }
    if (!files.some((f) => f.name === 'app.bin')) throw new Error('flash_args 에 앱(.ino.bin)이 없습니다');
  } else throw new Error('알 수 없는 method: ' + fw.method);

  return { size, libs, platform: { id: plat.id || '', version: plat.version || '' }, files, flash };
}

// ---------------------------------------------------------------- 출력
function writeOutputs(id, files) {
  const dir = path.join(OUT, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, f.name), f._buf);
  // file:// 에서는 fetch 가 막히므로 업로드용 데이터를 classic script 로도 만든다(HEX 는 문자열, bin 은 base64)
  const data = { files: files.map((f) => f.kind === 'hex'
    ? { name: f.name, kind: 'hex', text: f._buf.toString('utf8') }
    : { name: f.name, kind: 'bin', base64: f._buf.toString('base64') }) };
  const js = '/* 자동 생성(tools/build_firmware.mjs). 고치지 말 것. */\n' +
    '(window.HUB_FIRMWARE_DATA = window.HUB_FIRMWARE_DATA || {})[' + JSON.stringify(id) + '] = ' + JSON.stringify(data) + ';\n';
  fs.writeFileSync(path.join(dir, 'firmware.data.js'), js);
}

function saveManifest(man) {
  const ordered = { schema: 1, note: '자동 생성(tools/build_firmware.mjs). 로봇별 기본 펌웨어 정보.', robots: man.robots };
  const json = JSON.stringify(ordered, null, 2) + '\n';
  const a = writeIfChanged(path.join(OUT, 'manifest.json'), json);
  const b = writeIfChanged(path.join(OUT, 'manifest.js'),
    '/* 자동 생성(tools/build_firmware.mjs). file:// 에서도 읽히도록 manifest.json 과 같은 내용을 script 로 둔다. */\n' +
    'window.HUB_FIRMWARE_MANIFEST = ' + json.trimEnd() + ';\n');
  return a || b;
}

// ---------------------------------------------------------------- main
function main() {
  let robots = loadRobots();
  if (onlyArg) robots = robots.filter((r) => onlyArg.includes(r.id));
  if (!robots.length) { log('빌드할 로봇이 없습니다'); return 0; }
  if (flag('--install')) install(loadRobots());
  const vers = installedVersions();
  const man = readManifest();
  man.robots = man.robots || {};
  // 설정에서 빠진 로봇은 manifest 에서도 지운다(--only 가 아닐 때만)
  if (!onlyArg) for (const id of Object.keys(man.robots)) if (!loadRobots().some((r) => r.id === id)) delete man.robots[id];

  const summary = [];
  let newFailures = 0;
  for (const r of robots) {
    const fw = r.firmware;
    const prev = man.robots[r.id];
    let src;
    try { src = sourceInfo(fw); }
    catch (e) { summary.push([r.id, '실패', '소스 정보: ' + e.message]); newFailures++; continue; }
    const key = buildKey(fw);

    if (src.dirty && !flag('--allow-dirty')) {
      summary.push([r.id, '건너뜀', '스케치 폴더에 커밋 안 된 변경이 있음(--allow-dirty)']);
      continue;
    }
    if (!flag('--force') && prev && prev.buildKey === key) {
      if (prev.status === 'ok' && prev.source && prev.source.commit === src.commit && filesIntact(r.id, prev)) {
        summary.push([r.id, '건너뜀', '소스 커밋 같음 ' + src.commit.slice(0, 7)]); continue;
      }
      if (prev.status === 'failed' && prev.failedCommit === src.commit) {
        summary.push([r.id, '건너뜀', '이 커밋은 이미 빌드 실패로 기록됨(재시도는 --force)']); continue;
      }
    }

    // 표시용 기본 정보(빌드 실패여도 갱신)
    const base = {
      name: r.name, board: fw.board || '', boardNote: fw.boardNote || '', fqbn: fw.fqbn, method: fw.method,
      bauds: fw.bauds || [], signature: fw.signature || '', buildKey: key
    };
    try {
      const out = compile(r, src);
      writeOutputs(r.id, out.files);
      const coreId = fw.core ? fw.core.split('@')[0] : '';
      man.robots[r.id] = {
        ...base,
        status: 'ok',
        source: src,
        built: new Date().toISOString(),
        toolchain: {
          arduinoCli: vers.cli,
          core: coreId ? coreId + '@' + (out.platform.version || vers.cores[coreId] || '') : '',
          libraries: out.libs.filter((l) => l.location !== 'platform').map((l) => l.name + '@' + l.version)
        },
        size: out.size,
        flash: out.flash || undefined,
        files: out.files.map(({ _buf, ...f }) => f),
        data: 'hub/firmware/' + r.id + '/firmware.data.js'
      };
      summary.push([r.id, '빌드', `Flash ${out.size.flash}/${out.size.flashLimit || out.size.flashMax}B, 커밋 ${src.commit.slice(0, 7)}`]);
    } catch (e) {
      newFailures++;
      const keep = prev && prev.status !== undefined ? prev : null;
      man.robots[r.id] = {
        ...(keep || base),
        ...base,
        status: 'failed',
        failedCommit: src.commit,
        failedAt: new Date().toISOString(),
        error: String(e.message || e).slice(0, 2000),
        // 이전에 성공한 펌웨어가 있으면 files/source/built 는 그대로 남는다(업로드는 이전 펌웨어로 가능)
      };
      summary.push([r.id, '실패', String(e.message || e).split('\n')[0]]);
    }
  }

  const changed = saveManifest(man);
  for (const [id, what, detail] of summary) console.log(`${what.padEnd(4)} | ${id} | ${detail}`);
  log(changed ? 'manifest 갱신됨' : 'manifest 변화 없음');
  return newFailures ? 1 : 0;
}

process.exit(main());
