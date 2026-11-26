/* 통합 로봇 허브 셸.
 * - window.RobotHub.register(): 애니메이션 모듈 등록 창구(모듈보다 먼저 로드되어야 한다)
 * - intro(2x2 소개) ↔ control(제어 웹 iframe) 상태 전환
 * - 무입력 자동 복귀, 확인 모드(같은 출처 접근 불가 시), 복귀 전 안전 정지
 * - 펌웨어 업로드(사용자가 버튼을 눌렀을 때만): 안전 정지 → iframe 닫기 → 포트 선택 → 업로드 → iframe 다시 열기
 * 로봇별 값은 robots.config.js(window.ROBOTS)에만 있다. 이 파일은 그 배열을 순회만 한다.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- 모듈 등록
  var registry = Object.create(null);
  window.RobotHub = {
    register: function (mod) {
      if (!mod || typeof mod.id !== 'string') { console.warn('[hub] register: id 없음', mod); return; }
      registry[mod.id] = mod;
      if (typeof onRegistered === 'function') onRegistered(mod.id);
    }
  };
  var onRegistered = null;

  var ROBOTS = Array.isArray(window.ROBOTS) ? window.ROBOTS : [];
  var BASE = window.HUB_CONFIG || {};

  // ---------------------------------------------------------------- QA 파라미터
  var params = new URLSearchParams(location.search);
  function numParam(name, fallback) {
    var v = params.get(name);
    if (v === null || v === '') return fallback;
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : fallback;
  }
  var CFG = {
    idleMs: numParam('idleMs', BASE.idleMs || 180000),
    warnMs: numParam('warnMs', BASE.warnMs || 15000),
    confirmEveryMs: numParam('confirmEveryMs', BASE.confirmEveryMs || 300000)
  };

  var CONN_LABEL = { ble: 'BLE', serial: 'USB 시리얼', wifi: 'Wi-Fi' };
  var ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var isFileUrl = location.protocol === 'file:';
  // 이 컴퓨터에서 start_hub.bat(hub/serve.py)으로 연 허브인가. localOnly 로봇은 여기서만 iframe 으로 연다.
  var isLocalHub = location.protocol === 'http:' && /^(localhost|127\.\d+\.\d+\.\d+)(:\d+)?$/i.test(location.host);
  var CONN_SUPPORT = { ble: 'bluetooth' in navigator, serial: 'serial' in navigator, wifi: true };
  var CONN_API = { ble: 'Web Bluetooth', serial: 'Web Serial' };

  // ---------------------------------------------------------------- DOM
  var $ = function (id) { return document.getElementById(id); };
  var el = {};

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------------------------------------------------------------- 상태
  var state = 'intro';            // intro | control | exiting | stopwarn | firmware
  var current = null;             // 선택 로봇 설정
  var frame = null;               // iframe
  var sameOrigin = false;         // iframe 문서 접근 가능 여부
  var boundWin = null;            // 입력 감지를 등록한 iframe 창
  var lastInput = 0;
  var warnStart = 0;              // 경고 오버레이 시작 시각(0 = 꺼짐)
  var confirmStart = 0;           // 확인 모드 기준 시각
  var ticker = null;
  var cards = [];                 // { robot, root, stage, caption, dots, mod, idx, start, mounted }

  // ---------------------------------------------------------------- 시작
  function init() {
    el.intro = $('intro');
    el.grid = $('grid');
    el.control = $('control');
    el.frameHost = $('frameHost');
    el.robotName = $('robotName');
    el.btnHome = $('btnHome');
    el.idleLeft = $('idleLeft');
    el.modeNote = $('modeNote');
    el.overlay = $('overlay');
    el.overlayTitle = $('overlayTitle');
    el.overlayText = $('overlayText');
    el.overlayCount = $('overlayCount');
    el.btnContinue = $('btnContinue');
    el.busy = $('busy');
    el.stopWarn = $('stopWarn');
    el.stopWarnText = $('stopWarnText');
    el.stopWarnCount = $('stopWarnCount');
    el.btnLeaveAnyway = $('btnLeaveAnyway');
    el.btnBackToControl = $('btnBackToControl');
    el.toast = $('toast');
    el.btnFull = $('btnFull');
    el.offsite = $('offsite');
    el.offsiteTitle = $('offsiteTitle');
    el.offsiteText = $('offsiteText');
    el.offsiteSteps = $('offsiteSteps');
    el.offsiteNote = $('offsiteNote');
    el.offsiteLink = $('offsiteLink');
    el.btnOffsiteClose = $('btnOffsiteClose');
    el.notices = $('notices');
    el.btnFw = $('btnFw');
    el.btnOffsiteFw = $('btnOffsiteFw');
    el.fw = $('fw');
    el.fwTitle = $('fwTitle');
    el.fwInfo = $('fwInfo');
    el.fwWarn = $('fwWarn');
    el.fwNotes = $('fwNotes');
    el.fwProgress = $('fwProgress');
    el.fwStage = $('fwStage');
    el.fwBar = $('fwBar');
    el.fwResult = $('fwResult');
    el.fwCancel = $('fwCancel');
    el.fwGo = $('fwGo');

    showEnvNotices();
    buildCards();
    loadModules();

    el.btnHome.addEventListener('click', function () { exitToIntro('button'); });
    el.btnContinue.addEventListener('click', function () { markInput(); });
    // 결함 #6: 경고 오버레이를 마우스로 누르면 mousedown 기본 동작이 포커스를 (곧 숨겨질) 버튼/BODY 로 옮긴다.
    // 기본 포커스 이동을 막아 markInput → focusFrame 이 준 iframe 포커스가 유지되게 한다(click 은 그대로 발생).
    el.overlay.addEventListener('mousedown', function (e) { e.preventDefault(); });
    // 결함 #10: 경고를 누르는 순간(pointerdown/touchstart) 오버레이를 숨기면, 손을 뗄 때 생기는 click 이
    // 같은 좌표의 로봇 페이지 버튼(SMARS AUTO, 바이크 비상 정지 토글 등)을 누른다. 그래서 오버레이 위의 누름은
    // markInput 에서 미루고, 손을 뗀 뒤(click / touchend) 숨긴다. touchend 는 preventDefault 로 합성 click 을 막는다.
    el.overlay.addEventListener('click', function () { markInput(); });
    el.overlay.addEventListener('touchend', function (e) { e.preventDefault(); markInput(); }, { passive: false });
    el.btnLeaveAnyway.addEventListener('click', function () { resolveStopWarn('leave'); });
    el.btnBackToControl.addEventListener('click', function () { resolveStopWarn('back'); });
    el.btnOffsiteClose.addEventListener('click', hideOffsite);
    el.offsite.addEventListener('click', function (e) { if (e.target === el.offsite) hideOffsite(); });
    setupFullscreen();
    setupHistory();
    setupFirmware();

    // 허브 문서의 입력. iframe 안 입력은 iframe 창에서 따로 받는다.
    ACTIVITY_EVENTS.forEach(function (t) { document.addEventListener(t, markInput, { capture: true, passive: true }); });
    // Esc = 나가기. 허브 문서에 포커스가 있을 때만 온다. iframe 안의 Esc 는 로봇 페이지 몫(로봇 개·바이크는 Esc=정지)이라 가로채지 않는다.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state === 'firmware') { e.preventDefault(); fwCancel(); }
      else if (e.key === 'Escape' && state === 'control') { e.preventDefault(); exitToIntro('esc'); }
      else if (e.key === 'Escape' && !el.offsite.hidden) { e.preventDefault(); hideOffsite(); }
    });

    if (reduceMotion && reduceMotion.addEventListener) reduceMotion.addEventListener('change', resetCardTimes);
    requestAnimationFrame(loop);

    var want = params.get('robot');
    if (want) {
      var r = ROBOTS.filter(function (x) { return x.id === want; })[0];
      if (r) enterRobot(r); else console.warn('[hub] robot 파라미터에 맞는 로봇 없음:', want);
    }
  }

  // ---------------------------------------------------------------- 환경 안내
  function showEnvNotices() {
    var msgs = [];
    if (isFileUrl) {
      msgs.push({ kind: 'warn', text: '파일로 직접 열었습니다. 블루투스·USB 연결은 그대로 됩니다. 다만 허브가 로봇 페이지 안을 볼 수 없어 나갈 때 정지 버튼 대신 화면을 닫아(연결 끊기) 멈추고, 5분마다 계속 사용 여부를 묻습니다. 완전한 자동 정지는 start_hub.bat이나 온라인 허브로 여세요.' });
    } else if (!window.isSecureContext) {
      msgs.push({ kind: 'bad', text: '보안 연결이 아니라 블루투스·USB를 쓸 수 없습니다. 온라인 허브(https)나 이 컴퓨터의 start_hub.bat(http://localhost:8800/)으로 여세요.' });
    }
    // 로봇별 제약은 카드에 따로 표시한다(cardEnv). 여기서는 블루투스가 없을 때만 브라우저를 바꾸라고 안내한다.
    // 예: 삼성 인터넷·iPad Safari 등은 Web Bluetooth 가 없을 수 있다. 안드로이드 Chrome 은 Web Bluetooth 가 있다.
    if (!CONN_SUPPORT.ble && !CONN_SUPPORT.serial) {
      msgs.push({ kind: 'warn', text: '이 브라우저는 블루투스·USB 연결을 지원하지 않습니다. 태블릿은 Chrome, 컴퓨터는 Chrome이나 Edge로 여세요.' });
    } else if (!CONN_SUPPORT.ble) {
      msgs.push({ kind: 'warn', text: '이 브라우저에는 Web Bluetooth가 없어 블루투스 로봇을 연결할 수 없습니다. Chrome으로 여세요.' });
    }
    msgs.forEach(function (m) { el.notices.appendChild(h('p', 'notice ' + m.kind, m.text)); });
    el.notices.hidden = !msgs.length;
  }

  // ---------------------------------------------------------------- 카드
  function buildCards() {
    ROBOTS.forEach(function (robot) {
      var root = h('div', 'card');
      root.setAttribute('role', 'button');
      root.tabIndex = 0;
      root.setAttribute('aria-label', robot.name + ' 제어 화면 열기');
      if (robot.accent) root.style.setProperty('--accent', robot.accent);

      var head = h('div', 'card-head');
      var titles = h('div', 'card-titles');
      titles.appendChild(h('h2', 'card-name', robot.name));
      titles.appendChild(h('p', 'card-tag', robot.tagline || ''));
      head.appendChild(titles);
      var badges = h('div', 'badges');
      (robot.connection || []).forEach(function (c) { badges.appendChild(h('span', 'badge', CONN_LABEL[c] || c)); });
      head.appendChild(badges);
      var env = cardEnv(robot);

      var stage = h('div', 'stage');
      var foot = h('div', 'card-foot');
      var caption = h('p', 'caption', '');
      caption.setAttribute('aria-live', 'off');
      var dots = h('div', 'dots');
      dots.setAttribute('aria-hidden', 'true');
      foot.appendChild(caption);
      foot.appendChild(dots);

      root.appendChild(head);
      if (env.text) root.appendChild(h('p', 'card-env ' + env.kind, env.text));
      root.appendChild(stage);
      root.appendChild(foot);
      el.grid.appendChild(root);

      var card = { robot: robot, root: root, stage: stage, caption: caption, dots: dots, mod: null, idx: 0, start: 0, mounted: false, failed: false, shownIdx: -1 };
      cards.push(card);
      setPending(card, '불러오는 중');

      var open = env.offsite ? function () { showOffsite(robot); } : function () { enterRobot(robot); };
      root.addEventListener('click', open);
      root.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') { e.preventDefault(); open(); }
      });
    });
  }

  // 이 기기·이 허브에서 로봇을 연결할 수 있는가. 제약이 없으면 text 는 비어 있다(카드에 아무것도 안 붙음).
  function cardEnv(robot) {
    if (robot.localOnly) {
      if (isLocalHub) return { kind: '', text: '' };
      if (isFileUrl && robot.fileOffsite) return { kind: 'info', text: '새 탭에서 직접 연결 · 눌러서 열기', offsite: true };
      return { kind: 'warn', text: robot.offsite ? '이 화면에서는 연결 불가 · 눌러서 연결 방법 보기' : '이 컴퓨터의 start_hub.bat에서만 연결됩니다', offsite: !!robot.offsite };
    }
    var conns = robot.connection || [];
    var ok = conns.filter(function (c) { return CONN_SUPPORT[c] !== false; });
    var missing = conns.filter(function (c) { return CONN_SUPPORT[c] === false; }).map(function (c) { return CONN_API[c] || c; });
    if (!missing.length) return { kind: '', text: '' };
    if (!ok.length) return { kind: 'warn', text: '이 브라우저에서는 연결할 수 없습니다(' + missing.join('·') + ' 없음)' };
    return { kind: 'info', text: '이 기기에서는 ' + ok.map(function (c) { return CONN_LABEL[c] || c; }).join('·') + '로 연결' };
  }

  // localOnly 로봇을 로컬 허브 밖(온라인·태블릿)에서 골랐을 때의 안내
  function showOffsite(robot) {
    var o = (isFileUrl && robot.fileOffsite) || robot.offsite;
    if (state !== 'intro' || !o) return;
    el.offsiteTitle.textContent = o.title || robot.name;
    el.offsiteText.textContent = o.text || '';
    el.offsiteSteps.textContent = '';
    (o.steps || []).forEach(function (s) { el.offsiteSteps.appendChild(h('li', '', s)); });
    el.offsiteSteps.hidden = !(o.steps && o.steps.length);
    el.offsiteNote.textContent = o.note || '';
    el.offsiteNote.hidden = !o.note;
    el.offsiteLink.hidden = !o.url;
    if (o.url) { el.offsiteLink.href = o.url; el.offsiteLink.textContent = o.label || '열기'; }
    // 펌웨어 업로드는 허브 최상위에서 하므로 iframe 없이 여는 로봇도 여기서 할 수 있다
    el.btnOffsiteFw.hidden = !fwEntry(robot);
    el.btnOffsiteFw.onclick = function () { openFirmware(robot, 'intro'); };
    el.offsite.hidden = false;
    el.btnOffsiteClose.focus();
  }
  function hideOffsite() { el.offsite.hidden = true; }

  // 태블릿 키오스크용 전체 화면(지원할 때만 버튼 표시). 같은 문서 안 상태 전환이라 제어 화면에서도 유지된다.
  function setupFullscreen() {
    var d = document, root = d.documentElement;
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req || !(d.fullscreenEnabled || d.webkitFullscreenEnabled)) return;
    var cur = function () { return d.fullscreenElement || d.webkitFullscreenElement; };
    var sync = function () { el.btnFull.textContent = cur() ? '전체 화면 끝내기' : '전체 화면'; };
    el.btnFull.hidden = false;
    sync();
    el.btnFull.addEventListener('click', function () {
      try {
        if (cur()) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        else { var p = req.call(root); if (p && p.catch) p.catch(function () { /* 거절 무시 */ }); }
      } catch (e) { /* 무시 */ }
    });
    d.addEventListener('fullscreenchange', sync);
    d.addEventListener('webkitfullscreenchange', sync);
  }

  // 안드로이드 뒤로 가기(제스처·버튼)가 허브를 떠나 정지 절차를 건너뛰지 않게:
  // 제어 화면에 들어갈 때 기록을 하나 쌓고, 뒤로 가기는 "← 처음으로"와 같이 처리한다.
  var popIgnore = false;
  function setupHistory() {
    if (!window.history || !history.pushState) return;
    window.addEventListener('popstate', function () {
      if (popIgnore) { popIgnore = false; return; }
      if (state === 'control') { exitToIntro('back'); return; }
      if (state === 'exiting' || state === 'stopwarn') { pushControlHistory(); return; }
      if (state === 'firmware') { if (fw.origin === 'control') pushControlHistory(); fwCancel(); return; }
      if (!el.offsite.hidden) hideOffsite();
    });
    // 제어 중 새로고침·탭 닫기: 브라우저가 허락하면 확인을 묻는다(정지 절차를 거치지 않으므로)
    window.addEventListener('beforeunload', function (e) {
      if (state === 'control' || state === 'exiting' || state === 'stopwarn' || (state === 'firmware' && (fw.origin === 'control' || fw.busy))) { e.preventDefault(); e.returnValue = ''; }
    });
  }
  function pushControlHistory() {
    try { if (!(history.state && history.state.hubControl)) history.pushState({ hubControl: true }, ''); } catch (e) { /* 무시 */ }
  }
  function popControlHistory() {
    try { if (history.state && history.state.hubControl) { popIgnore = true; history.back(); } } catch (e) { popIgnore = false; }
  }

  function setPending(card, text) {
    card.stage.textContent = '';
    var p = h('div', 'stage-pending', text);
    card.stage.appendChild(p);
    card.caption.textContent = '';
    card.dots.textContent = '';
    card.root.classList.add('is-pending');
  }

  function loadModules() {
    onRegistered = function (id) {
      cards.forEach(function (c) { if (c.robot.id === id && !c.mounted) mountCard(c); });
    };
    cards.forEach(function (card) {
      if (registry[card.robot.id]) { mountCard(card); return; }   // 이미 등록됨
      var src = card.robot.module || ('hub/robots/' + card.robot.id + '.js');
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () {
        if (!card.mounted) { card.failed = true; setPending(card, '준비 중'); }
      };
      s.onerror = function () { card.failed = true; setPending(card, '준비 중'); };
      document.body.appendChild(s);
    });
  }

  function mountCard(card) {
    var mod = registry[card.robot.id];
    if (!mod || typeof mod.mount !== 'function' || !Array.isArray(mod.motions) || !mod.motions.length) {
      setPending(card, '준비 중'); return;
    }
    card.stage.textContent = '';
    try { mod.mount(card.stage); }
    catch (e) { console.error('[hub] mount 실패', card.robot.id, e); setPending(card, '준비 중'); return; }
    card.mod = mod;
    card.mounted = true;
    card.root.classList.remove('is-pending');
    card.dots.textContent = '';
    mod.motions.forEach(function () { card.dots.appendChild(h('span', 'dot')); });
    card.idx = 0;
    card.start = performance.now();
    card.shownIdx = -1;
  }

  function resetCardTimes() {
    var now = performance.now();
    cards.forEach(function (c) { c.start = now; c.shownIdx = -1; });
  }

  // ---------------------------------------------------------------- 애니메이션(셸이 주관하는 rAF 하나)
  function loop(now) {
    requestAnimationFrame(loop);
    if (state !== 'intro' || document.hidden) return;
    var reduced = reduceMotion && reduceMotion.matches;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!c.mounted) continue;
      var motions = c.mod.motions;
      var m = motions[c.idx];
      var ms = Math.max(200, Number(m.ms) || 2400);
      var elapsed = now - c.start;
      if (elapsed >= ms) {
        // 프레임이 오래 멈췄다면 한 칸만 넘긴다(건너뛰기보다 순서 유지가 보기 좋다)
        c.idx = (c.idx + 1) % motions.length;
        c.start = now;
        m = motions[c.idx];
        ms = Math.max(200, Number(m.ms) || 2400);
        elapsed = 0;
      }
      if (c.shownIdx !== c.idx) {
        c.shownIdx = c.idx;
        c.caption.textContent = m.label || '';
        var ds = c.dots.children;
        for (var d = 0; d < ds.length; d++) ds[d].classList.toggle('on', d === c.idx);
        if (reduced) safePlay(c, m, 0.5);
      }
      if (!reduced) safePlay(c, m, Math.min(1, elapsed / ms));
    }
  }

  function safePlay(card, motion, t) {
    try { motion.play(t); }
    catch (e) {
      console.error('[hub] play 실패', card.robot.id, motion.key, e);
      card.mounted = false;
      try { card.mod.destroy && card.mod.destroy(); } catch (e2) { /* 무시 */ }
      setPending(card, '준비 중');
    }
  }

  // ---------------------------------------------------------------- control 진입
  function enterRobot(robot) {
    if (state !== 'intro') return;
    hideOffsite();
    current = robot;
    state = 'control';
    pushControlHistory();
    sameOrigin = false;
    boundWin = null;

    el.robotName.textContent = robot.name;
    el.modeNote.hidden = true;
    el.intro.hidden = true;
    el.control.hidden = false;
    document.title = robot.name + ' - 로봇 통합 제어 허브';
    updateFwButton(robot);

    createFrame(robot);

    lastInput = Date.now();
    confirmStart = Date.now();
    warnStart = 0;
    hideOverlay();
    startTicker();
    // 카드에서 Space 로 들어오면 keyup 이 포커스 받은 버튼을 눌러 바로 나가 버리므로 포커스를 옮기지 않는다
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function createFrame(robot) {
    sameOrigin = false;
    boundWin = null;
    frame = document.createElement('iframe');
    frame.className = 'robot-frame';
    frame.title = robot.name + ' 제어 화면';
    // 권한 정책: 기본 허용 대상('src')은 iframe 의 출처다. 파일로 연 허브(file://)는 출처가 불투명(null)이라
    // 'src' 가 맞지 않아 iframe 안에서 Web Serial·Web Bluetooth 가 막힌다(2026-11-26 실측) → file:// 에서는 * 로 위임.
    frame.setAttribute('allow', isFileUrl ? 'bluetooth *; serial *; usb *' : 'bluetooth; serial; usb');
    frame.addEventListener('load', onFrameLoad);
    frame.src = robot.page;
    el.frameHost.appendChild(frame);
  }

  function onFrameLoad() {
    if (!frame) return;
    var win = null;
    try {
      win = frame.contentWindow;
      void win.document.body;           // 다른 출처면 여기서 예외
      if (win.location.href === 'about:blank') return;
      sameOrigin = true;
    } catch (e) {
      sameOrigin = false;
    }
    if (sameOrigin && win !== boundWin) {
      ACTIVITY_EVENTS.forEach(function (t) { win.addEventListener(t, markInput, { capture: true, passive: true }); });
      boundWin = win;
    }
    if (!sameOrigin) {
      el.modeNote.textContent = '확인 모드: 이 화면의 입력을 볼 수 없어 ' + Math.round(CFG.confirmEveryMs / 60000) +
        '분마다 계속 사용 여부를 묻습니다. 나갈 때 로봇 정지는 화면 닫기(연결 끊기)로만 됩니다.';
      el.modeNote.hidden = false;
      confirmStart = Date.now();
    } else {
      el.modeNote.hidden = true;
    }
    lastInput = Date.now();
  }

  // ---------------------------------------------------------------- 무입력 타이머
  // 펌웨어 대화상자(제어 화면에서 연 것)도 쓰기 중(busy)이 아니면 무입력 타이머가 돈다(QA 결함 #11).
  // 대화상자는 모달이라 그동안의 입력은 모두 허브 문서로 온다 → lastInput/idleMs 기준.
  function fwIdleActive() { return state === 'firmware' && fw.origin === 'control' && !fw.busy; }

  function markInput(e) {
    if (state !== 'control' && !fwIdleActive()) return;
    // 결함 #10: 경고 오버레이 위에서 누르기 시작한 입력은 손을 뗄 때(click/touchend)까지 미룬다
    if (warnStart && e && (e.type === 'pointerdown' || e.type === 'touchstart') &&
        e.target && e.target.nodeType === 1 && el.overlay.contains(e.target)) return;
    lastInput = Date.now();
    if (!sameOrigin) confirmStart = Date.now();
    if (warnStart) {
      warnStart = 0; hideOverlay(); focusFrame();
      setTimeout(focusFrame, 0);   // 브라우저 기본 포커스 처리 뒤에 한 번 더(포인터 경로 보강)
    }
  }

  // 경고를 취소한 뒤 로봇 페이지 키보드 조작(방향키, Space/Esc 정지)이 바로 듣도록 iframe 에 포커스를 돌려준다
  function focusFrame() {
    if (state !== 'control' || !frame) return;
    try {
      frame.focus();
      if (sameOrigin && frame.contentWindow) frame.contentWindow.focus();
    } catch (e) { /* 무시 */ }
  }

  function startTicker() {
    stopTicker();
    ticker = setInterval(tick, 250);   // document.hidden 이어도 멈추지 않는다(키오스크 기준)
    tick();
  }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  function tick() {
    var now = Date.now();
    if (state === 'firmware' && fw.origin === 'control' && fw.busy) {
      // 쓰기(포트 선택·리셋~검증) 중에만 멈춘다. 끝나면 그때부터 다시 잰다.
      lastInput = now; confirmStart = now; warnStart = 0;
      el.idleLeft.textContent = '펌웨어 쓰는 중';
      return;
    }
    if (state !== 'control' && !fwIdleActive()) return;
    var idleMode = sameOrigin || state === 'firmware';
    var base = idleMode ? lastInput : confirmStart;
    var period = idleMode ? CFG.idleMs : CFG.confirmEveryMs;
    var left = period - (now - base);

    if (!warnStart && left <= 0) {
      warnStart = now;
      showOverlay(idleMode);
    }
    if (warnStart) {
      var wl = CFG.warnMs - (now - warnStart);
      el.overlayCount.textContent = Math.max(0, Math.ceil(wl / 1000)) + '초';
      el.idleLeft.textContent = '곧 처음 화면으로';
      if (wl <= 0) { exitToIntro('idle'); return; }
    } else {
      el.idleLeft.textContent = (idleMode ? '입력 없으면 ' : '확인까지 ') + fmt(left) + ' 후 처음 화면';
    }
  }

  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function showOverlay(idleKind) {
    var sec = Math.round(CFG.warnMs / 1000);
    el.overlayTitle.textContent = idleKind ? '한동안 입력이 없었습니다' : '계속 사용하시나요?';
    el.overlayText.textContent = sec + '초 후 로봇을 멈추고 처음 화면으로 돌아갑니다.';
    el.overlayCount.textContent = sec + '초';
    el.overlay.classList.toggle('over-fw', state === 'firmware');   // 펌웨어 대화상자 위에 보이게
    el.overlay.hidden = false;
    el.btnContinue.focus();
  }
  function hideOverlay() {
    el.overlay.hidden = true;
    if (document.activeElement === el.btnContinue) {
      if (state === 'control') el.btnHome.focus();
      else if (state === 'firmware') (el.fwGo.hidden || el.fwGo.disabled ? el.fwCancel : el.fwGo).focus();
    }
  }

  // ---------------------------------------------------------------- 안전 복귀
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function exitToIntro(reason) {
    // 펌웨어 대화상자(쓰기 중 아님)에서 무입력 복귀: 대화상자를 닫고 같은 안전 복귀를 한다.
    // iframe 을 이미 지운 단계(포트 선택·완료·실패)면 포트는 업로더가 이미 닫았으므로 바로 첫 화면으로.
    if (fwIdleActive()) {
      el.fw.hidden = true;
      var noFrame = fw.frameClosed || !frame;
      fw.phase = null; fw.robot = null; fw.image = null; fw.origin = null; fw.frameClosed = false;
      state = 'control';
      if (noFrame) {
        stopTicker(); warnStart = 0; hideOverlay();
        console.info('[hub] 복귀(' + reason + ') 펌웨어 대화상자, 제어 화면은 이미 닫힘');
        backToIntro();
        return;
      }
    }
    if (state !== 'control') return;
    state = 'exiting';
    stopTicker();
    warnStart = 0;
    hideOverlay();
    el.idleLeft.textContent = '로봇 정지 중';   // 결함 #9: 멈춘 카운트다운을 남기지 않는다
    el.busy.hidden = false;
    var robot = current;
    var f = frame;

    safeStop(robot, f).then(function (report) {
      console.info('[hub] 복귀(' + reason + ') ' + robot.id + ' ' + JSON.stringify(report));
      // stop:'ok' 는 정지 명령을 '보냈다'는 뜻일 뿐이다. 페이지 표시로 도달 실패나 미확인이 보이면
      // iframe 을 지우지 않고(페이지의 실패 문구가 남게) 사용자에게 묻는다.
      if (report.delivery === 'failed' || report.delivery === 'unconfirmed') {
        showStopWarn(report, reason === 'idle');
        return;
      }
      teardown(f);
      backToIntro();
      // offline: 페이지가 로봇에 닿는 경로가 없었다 = 동작 명령도 보낼 수 없었다 → 경고 대신 토스트만
      if (report.delivery === 'offline') showToast('제어 화면이 로봇에 연결되어 있지 않아 정지 명령을 보내지 못했습니다. 로봇이 멈춰 있는지 확인하세요.');
      else if (!report.access) showToast('로봇 정지를 확인하세요. 이 화면에서는 정지 명령을 보낼 수 없었습니다.');
      else if (report.stopError) showToast('로봇 정지를 확인하세요. 정지 명령 중 오류가 있었습니다.');
    }, function (e) {
      console.error('[hub] 안전 복귀 오류', e);
      teardown(f);
      backToIntro();
      showToast('로봇 정지를 확인하세요.');
    });
  }

  // ---------------------------------------------------------------- 정지 미도달 경고
  // state 'stopwarn': iframe 은 남겨 두고 나갈지 돌아갈지 묻는다. 자동 복귀였다면 사람이 없을 수 있으므로 30초 뒤 나간다.
  var STOPWARN_AUTO_MS = 30000;
  var stopWarnTimer = null;

  function showStopWarn(report, auto) {
    state = 'stopwarn';
    el.busy.hidden = true;
    el.idleLeft.textContent = '정지 확인 필요';   // 결함 #9: 무입력 타이머는 멈춰 있다
    el.stopWarnText.textContent = report.delivery === 'failed'
      ? '제어 화면에 정지 실패가 표시되었습니다.'
      : '정지 명령이 로봇에 닿았는지 확인되지 않았습니다.';
    clearInterval(stopWarnTimer); stopWarnTimer = null;
    el.stopWarnCount.hidden = !auto;
    el.stopWarn.hidden = false;
    if (auto) {
      var end = Date.now() + STOPWARN_AUTO_MS;
      var upd = function () {
        var left = end - Date.now();
        el.stopWarnCount.textContent = Math.max(0, Math.ceil(left / 1000)) + '초 후 처음 화면으로 돌아갑니다.';
        if (left <= 0) resolveStopWarn('leave');
      };
      upd();
      stopWarnTimer = setInterval(upd, 250);
    }
    el.btnBackToControl.focus();
  }

  function resolveStopWarn(choice) {
    if (state !== 'stopwarn') return;
    clearInterval(stopWarnTimer); stopWarnTimer = null;
    el.stopWarn.hidden = true;
    if (choice === 'leave') {
      teardown(frame);
      backToIntro();
      showToast('로봇 정지를 확인하세요. 정지 명령이 전달되지 않았을 수 있습니다.');
      return;
    }
    // 제어 화면으로 돌아가기: 무입력 타이머를 새로 시작하고 iframe 에 포커스
    state = 'control';
    pushControlHistory();   // 뒤로 가기로 나왔다가 돌아온 경우 기록을 다시 쌓는다
    lastInput = Date.now();
    confirmStart = Date.now();
    warnStart = 0;
    startTicker();
    focusFrame();
  }

  // 정지 '도달' 확인. stop.failCheck / stop.okCheck = { selector, text(정규식 문자열) }.
  // 정지 명령을 보내기 전부터 그 요소의 변화를 지켜보고, 보낸 뒤 처음 맞는 문구로 판정한다(이전에 남아 있던 문구에 속지 않게).
  function watchDelivery(win, doc, stop) {
    var fc = stop.failCheck, oc = stop.okCheck, nc = stop.offlineCheck;
    if (!fc && !oc && !nc) return null;
    var verdict = null, waiters = [], observers = [];
    function finish(v) {
      if (verdict) return;
      verdict = v;
      observers.forEach(function (o) { try { o.disconnect(); } catch (e) { /* 무시 */ } });
      waiters.forEach(function (w) { w(); });
    }
    function test(c) {
      var t = doc.querySelector(c.selector);
      return !!t && new RegExp(c.text).test(t.textContent || '');
    }
    function check() {
      if (verdict) return;
      // offline(로봇에 닿는 경로 자체가 없음)을 먼저 본다. 그 문구가 failCheck 에도 맞을 수 있기 때문이다.
      if (nc && test(nc)) finish('offline');
      else if (fc && test(fc)) finish('failed');
      else if (oc && test(oc)) finish('confirmed');
    }
    [nc, fc, oc].forEach(function (c) {
      if (!c || !win.MutationObserver) return;
      var t = doc.querySelector(c.selector);
      if (!t) return;
      var o = new win.MutationObserver(check);
      o.observe(t, { childList: true, characterData: true, subtree: true });
      observers.push(o);
    });
    if (!observers.length) return null;      // 확인할 요소가 없음 → 확인 안 함(unchecked)
    return {
      // 판정이 날 때까지 최대 ms. 시간 안에 판정이 없으면 okCheck 가 있으면 'unconfirmed', failCheck 만 있으면 'confirmed'(실패 표시 없음)
      wait: function (ms) {
        return new Promise(function (resolve) {
          var done = function () { resolve(verdict); };
          if (verdict) { done(); return; }
          waiters.push(done);
          setTimeout(function () { finish(oc ? 'unconfirmed' : 'confirmed'); }, ms);
        });
      },
      cancel: function () { finish('none'); }
    };
  }

  // 정지 → 추가 정지(also) → 200ms → 해제 → settleMs → 도달 확인.
  // 반환: { access, stop, also, disconnect, delivery, stopError }
  //   stop: ok 는 '보냈다'(예외 없이 디스패치)는 뜻. delivery 가 '도달' 판정:
  //   confirmed | failed | unconfirmed | offline(로봇에 닿는 경로 없음) | unchecked(이 로봇은 확인 수단 없음) | none(보낸 정지 없음)
  function safeStop(robot, f) {
    var report = { access: false, stop: 'none', also: 'none', disconnect: 'none', delivery: 'none', stopError: false };
    var win = null, doc = null;
    try {
      win = f && f.contentWindow;
      doc = win && win.document;
      void doc.body;
      report.access = !!(doc && win.location.href !== 'about:blank');
    } catch (e) { report.access = false; }
    var stop = robot.stop || {};
    if (!report.access) return Promise.resolve(report);

    var watch = null;
    try { watch = watchDelivery(win, doc, stop); } catch (e) { console.warn('[hub] 도달 확인 준비 실패', e); watch = null; }
    var t0 = Date.now();

    return runSteps(win, doc, stop.steps || []).then(function (r) {
      report.stop = r.result;
      report.stopError = r.errors > 0 && r.result !== 'ok';
      // stop.also: 성공 여부와 상관없이 모두 실행하는 추가 정지(예: 다른 반복 전송 끄기)
      return runAll(win, doc, stop.also || []);
    }).then(function (a) {
      report.also = a;
      return sleep(200);
    }).then(function () {
      var steps = stop.disconnect || [];
      if (!steps.length) return { result: 'none' };
      return runSteps(win, doc, steps);
    }).then(function (r) {
      report.disconnect = r.result;
      if (report.stop !== 'ok' && r.result !== 'ok') return null;   // 보낸 것이 없으면(대개 미연결) 기다릴 필요 없음
      return sleep(Math.max(0, Math.min(3000, Number(stop.settleMs) || 0)));
    }).then(function () {
      if (report.stop !== 'ok') { if (watch) watch.cancel(); return null; }
      if (!watch) { report.delivery = 'unchecked'; return null; }
      var limit = Math.max(0, Math.min(10000, Number(stop.checkMs) || 3000));
      return watch.wait(Math.max(0, limit - (Date.now() - t0))).then(function (v) { report.delivery = v; });
    }).then(function () { return report; });
  }

  // 모든 단계를 차례로 실행(성공해도 멈추지 않음). 결과: 'ok,skip,...' 또는 'none'
  function runAll(win, doc, steps) {
    var out = [];
    return steps.reduce(function (p, step) {
      return p.then(function () {
        var r;
        try { r = runStep(win, doc, step); } catch (e) { console.warn('[hub] 단계 실패', step, e); r = 'fail'; }
        return Promise.resolve(r).then(function (v) { out.push(v); }, function (e) { console.warn('[hub] 단계 실패', step, e); out.push('fail'); });
      });
    }, Promise.resolve()).then(function () { return out.length ? out.join(',') : 'none'; });
  }

  // 단계를 차례로 시도. 결과: ok(하나 성공) | skipped(모두 건너뜀: 대개 미연결) | failed
  function runSteps(win, doc, steps) {
    var i = 0, errors = 0, skipped = 0;
    function next() {
      if (i >= steps.length) return Promise.resolve({ result: errors ? 'failed' : (skipped ? 'skipped' : 'none'), errors: errors });
      var step = steps[i++];
      var out;
      try { out = runStep(win, doc, step); }
      catch (e) { console.warn('[hub] 단계 실패', step, e); errors++; return next(); }
      return Promise.resolve(out).then(function (res) {
        if (res === 'ok') return { result: 'ok', errors: errors };
        if (res === 'skip') skipped++; else errors++;
        return next();
      }, function (e) { console.warn('[hub] 단계 실패', step, e); errors++; return next(); });
    }
    return next();
  }

  // 'ok' | 'skip' | 'fail' 또는 그 Promise
  function runStep(win, doc, step) {
    if (step.when && !getPath(win, step.when)) return 'skip';     // 조건(예: 연결 중) 아님
    if (step.call) return callPath(win, step.call);
    if (step.keydown) return dispatchKey(win, doc, step.keydown);
    if (!step.selector) return 'skip';
    var target = doc.querySelector(step.selector);
    if (!target) return 'skip';
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') return 'skip';
    if (step.skipIf && target.matches(step.skipIf)) return 'ok';   // 이미 원하는 상태(예: 비상 정지 켜짐)
    var ev = step.event || 'click';
    if (ev.indexOf('keydown:') === 0) return dispatchKey(win, doc, ev.slice(8), target);
    return guarded(win, function () {
      if (ev === 'click') { target.click(); return; }
      var Ctor = ev.indexOf('pointer') === 0 && win.PointerEvent ? win.PointerEvent : win.MouseEvent;
      target.dispatchEvent(new Ctor(ev, { bubbles: true, cancelable: true, composed: true,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }));
    });
  }

  function dispatchKey(win, doc, code, target) {
    var key = code === 'Space' ? ' ' : code;
    return guarded(win, function () {
      (target || doc).dispatchEvent(new win.KeyboardEvent('keydown', { code: code, key: key, bubbles: true, cancelable: true }));
    });
  }

  // 이벤트 핸들러 안의 예외는 dispatchEvent 밖으로 나오지 않고 iframe 창의 error 이벤트로 보고된다.
  // 디스패치 동안 error 가 생기면 실패로 본다(예: 정지 핸들러가 정지 전에 예외로 끝남).
  function guarded(win, fn) {
    var failed = false;
    var onErr = function () { failed = true; };
    win.addEventListener('error', onErr);
    try { fn(); }
    finally { win.removeEventListener('error', onErr); }
    return failed ? 'fail' : 'ok';
  }

  function getPath(win, path) {
    var v = win, parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }

  function callPath(win, path) {
    var parts = String(path).split('.');
    var ctx = null, fn = win;
    for (var i = 0; i < parts.length; i++) {
      if (fn == null) return 'skip';
      ctx = fn;
      fn = fn[parts[i]];
    }
    if (typeof fn !== 'function') return 'skip';
    var r = fn.call(ctx);
    if (r && typeof r.then === 'function') {
      return Promise.race([
        Promise.resolve(r).then(function () { return 'ok'; }),
        sleep(500).then(function () { return 'ok'; })     // 500ms 안에 안 끝나도 명령은 나간 것으로 본다
      ]);
    }
    return 'ok';
  }

  function teardown(f) {
    if (!f) return;
    try { f.removeEventListener('load', onFrameLoad); } catch (e) { /* 무시 */ }
    try { f.src = 'about:blank'; } catch (e) { /* 무시 */ }
    if (f.parentNode) f.parentNode.removeChild(f);
  }

  function backToIntro() {
    frame = null;
    current = null;
    boundWin = null;
    sameOrigin = false;
    el.busy.hidden = true;
    el.control.hidden = true;
    el.intro.hidden = false;
    document.title = '로봇 통합 제어 허브';
    state = 'intro';
    popControlHistory();   // 버튼·자동 복귀로 나왔으면 제어 화면 기록을 걷어 낸다(뒤로 가기로 나왔으면 이미 없음)
    resetCardTimes();
    if (cards[0]) cards[0].root.focus();
  }

  // ---------------------------------------------------------------- 펌웨어 업로드
  // 로봇별 값: robots.config.js 의 firmware(방식·baud·보드 이름·안내), 빌드 결과: hub/firmware/manifest.js(window.HUB_FIRMWARE_MANIFEST).
  // 업로더는 방식별로 버튼을 누를 때 classic script 로 불러온다(file:// 에서도 되게). 펌웨어 바이트는 manifest 의 data(.js)에 있다.
  var FLASHERS = {
    avr: { scripts: ['hub/flash/stk500.js'], global: 'HubSTK500' },
    esp32: { scripts: ['hub/vendor/esptool.bundle.js', 'hub/flash/esp32.js'], global: 'HubESP32' }
  };
  var HAS_SERIAL = 'serial' in navigator;
  // phase: confirm(설명) → stopping(로봇 정지·제어 화면 닫기) → port(포트 고르기 대기) → flashing → done | failed
  var fw = { robot: null, origin: null, phase: null, busy: false, frameClosed: false, image: null };

  function fwEntry(robot) {
    var man = window.HUB_FIRMWARE_MANIFEST;
    if (!robot || !robot.firmware || !man || !man.robots) return null;
    return man.robots[robot.id] || null;
  }
  function fwHasFiles(entry) { return !!(entry && Array.isArray(entry.files) && entry.files.length && entry.data); }

  function setupFirmware() {
    el.btnFw.addEventListener('click', function () { if (state === 'control' && current) openFirmware(current, 'control'); });
    el.fwGo.addEventListener('click', fwGo);
    el.fwCancel.addEventListener('click', fwCancel);
  }

  function updateFwButton(robot) {
    var entry = fwEntry(robot);
    el.btnFw.hidden = !entry;
    if (!entry) return;
    if (HAS_SERIAL) {
      el.btnFw.removeAttribute('aria-disabled');
      el.btnFw.title = 'USB 케이블로 ' + robot.name + ' 기본 펌웨어를 올립니다';
    } else {
      // 비활성 표시. 누르면 이유를 보여 주도록 클릭은 받고, 대화상자의 업로드 버튼은 꺼 둔다.
      el.btnFw.setAttribute('aria-disabled', 'true');
      el.btnFw.title = '이 브라우저에는 Web Serial이 없어 업로드할 수 없습니다(컴퓨터의 Chrome·Edge 필요)';
    }
  }

  function shortSha(x) { return x ? String(x).slice(0, 7) : '-'; }
  function fmtDate(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function openFirmware(robot, origin) {
    if (origin === 'control' ? state !== 'control' : state !== 'intro') return;
    var entry = fwEntry(robot);
    if (!entry) return;
    var cfg = robot.firmware || {};
    fw.robot = robot; fw.origin = origin; fw.busy = false; fw.frameClosed = false; fw.image = null;
    // 제어 화면에서 열었으면 무입력 타이머는 계속 돈다(대화상자 조작도 입력). 실제 쓰기(busy) 중에만 tick 이 멈춘다.
    if (origin === 'control') { warnStart = 0; hideOverlay(); lastInput = Date.now(); }
    else hideOffsite();
    state = 'firmware';

    el.fwTitle.textContent = robot.name + ' 펌웨어 업로드';
    el.fwInfo.textContent = '';
    var src = entry.source || {};
    var rows = [
      ['로봇', robot.name],
      ['보드', (entry.board || cfg.board || '-') + (entry.fqbn ? ' · ' + entry.fqbn : '')],
      ['펌웨어', (src.repo ? src.repo + '/' : '') + (src.path || '-')],
      ['소스 커밋', shortSha(src.commit) + (src.commitDate ? ' (' + fmtDate(src.commitDate) + ')' : '')],
      ['빌드 날짜', fmtDate(entry.built)],
      ['크기', entry.size && entry.size.flash ? entry.size.flash.toLocaleString() + ' B' : '-']
    ];
    rows.forEach(function (r) { el.fwInfo.appendChild(h('dt', '', r[0])); el.fwInfo.appendChild(h('dd', '', r[1])); });

    el.fwNotes.textContent = '';
    var note = function (t, cls) { el.fwNotes.appendChild(h('li', cls || '', t)); };
    if (!HAS_SERIAL) note('이 브라우저에는 Web Serial이 없어 업로드할 수 없습니다. 컴퓨터에서 Chrome이나 Edge로 여세요.', 'warn');
    if (entry.status === 'failed') {
      note(fwHasFiles(entry)
        ? '최신 소스(커밋 ' + shortSha(entry.failedCommit) + ') 빌드에 실패해 이전 펌웨어(커밋 ' + shortSha(src.commit) + ')를 올립니다.'
        : '펌웨어 빌드에 실패해 올릴 파일이 없습니다.', 'warn');
    }
    if (entry.boardNote || cfg.boardNote) note(entry.boardNote || cfg.boardNote, 'warn');
    note('USB 데이터 케이블로 컴퓨터와 로봇 보드를 연결하세요. 블루투스로는 업로드할 수 없습니다.');
    if (origin === 'control') note('업로드를 누르면 로봇을 멈추고 제어 화면을 닫은 뒤(연결 해제) 포트를 고릅니다. 끝나면 제어 화면을 다시 엽니다.');
    else note('열려 있는 로봇 제어 페이지(다른 탭 등)가 같은 USB 포트를 쓰고 있으면 먼저 닫으세요.');

    el.fwWarn.hidden = false;
    el.fwProgress.hidden = true;
    el.fwBar.value = 0;
    el.fwResult.hidden = true;
    el.fwResult.className = 'fw-result';
    fw.phase = 'confirm';
    fwButtons('업로드', '취소', HAS_SERIAL && fwHasFiles(entry));
    el.fw.hidden = false;
    el.fwCancel.focus();   // 기본 포커스는 취소(실수로 Enter 를 눌러 덮어쓰지 않게)
  }

  function fwButtons(goText, cancelText, goEnabled, cancelEnabled) {
    el.fwGo.hidden = !goText;
    if (goText) el.fwGo.textContent = goText;
    el.fwGo.disabled = !goEnabled;
    el.fwCancel.textContent = cancelText;
    el.fwCancel.disabled = cancelEnabled === false;
  }

  function fwStage(text, pct) {
    el.fwProgress.hidden = false;
    el.fwStage.textContent = text;
    if (pct != null) el.fwBar.value = Math.max(0, Math.min(100, pct));
  }

  function fwResult(ok, text) {
    el.fwResult.hidden = false;
    el.fwResult.className = 'fw-result ' + (ok ? 'ok' : 'bad');
    el.fwResult.textContent = text;
  }

  function fwGo() {
    if (fw.busy) return;
    if (fw.phase === 'confirm') { fwPrepare(); return; }
    if (fw.phase === 'port' || fw.phase === 'failed') { fwPickAndFlash(); return; }
    if (fw.phase === 'done') fwClose();
  }

  // 업로드 중(busy)에는 닫기·Esc·뒤로 가기를 받지 않는다(쓰는 도중 포트를 놓으면 보드가 빈 상태로 남는다)
  function fwCancel() {
    if (state !== 'firmware' || fw.busy) return;
    fwClose();
  }

  // 대화상자 닫기. 제어 화면에서 열었으면 닫아 둔 iframe 을 다시 만들고 무입력 타이머를 새로 시작한다.
  function fwClose() {
    el.fw.hidden = true;
    var origin = fw.origin, robot = fw.robot;
    fw.phase = null; fw.robot = null; fw.image = null;
    if (origin === 'control') {
      state = 'control';
      if (fw.frameClosed || !frame) createFrame(robot);
      fw.frameClosed = false;
      lastInput = Date.now();
      confirmStart = Date.now();
      warnStart = 0;
      startTicker();
      el.btnFw.focus();
    } else {
      state = 'intro';
      resetCardTimes();
      var c = cards.filter(function (x) { return x.robot === robot; })[0];
      if (c) c.root.focus();
    }
  }

  // 1단계: 업로더·펌웨어 데이터를 불러와 확인 → 로봇 안전 정지(stop.steps) → iframe 닫기(제어 웹이 쥔 시리얼 포트를 놓게)
  // 포트 선택은 다음 클릭(사용자 제스처)에서 한다. 정지에 몇 초 걸리면 이번 클릭의 사용자 활성화가 만료될 수 있기 때문이다.
  function fwPrepare() {
    var robot = fw.robot, entry = fwEntry(robot);
    fw.busy = true;
    fw.phase = 'stopping';
    el.fwWarn.hidden = true;
    el.fwResult.hidden = true;
    fwButtons('업로드', '취소', false, false);
    fwStage('펌웨어 파일 확인 중…', 0);
    fwLoad(robot, entry).then(function (img) {
      fw.image = img;
      if (fw.origin !== 'control' || !frame) return null;
      fwStage('로봇을 멈추고 제어 화면을 닫는 중…', 0);
      var f = frame;
      return safeStop(robot, f).then(function (report) {
        console.info('[hub] 펌웨어 업로드 전 정지 ' + robot.id + ' ' + JSON.stringify(report));
      }, function (e) { console.warn('[hub] 업로드 전 정지 오류', e); }).then(function () {
        teardown(f);
        frame = null; boundWin = null; sameOrigin = false;
        fw.frameClosed = true;
        return sleep(300);   // 문서가 사라지며 제어 웹의 포트가 닫히는 시간
      });
    }).then(function () {
      fw.busy = false; lastInput = Date.now();   // 쓰기·정지가 끝난 때부터 무입력 시간을 다시 잰다
      fw.phase = 'port';
      fwStage('USB 포트를 고르세요. 목록에서 로봇 보드의 포트(예: USB-SERIAL CH340, CP210x, Arduino)를 고릅니다. 블루투스 포트는 고르지 마세요.', 0);
      fwButtons('포트 고르고 업로드', fw.frameClosed ? '취소(제어 화면 다시 열기)' : '취소', true);
      el.fwGo.focus();
    }, function (e) {
      fw.busy = false; lastInput = Date.now();   // 쓰기·정지가 끝난 때부터 무입력 시간을 다시 잰다
      fw.phase = 'confirm';
      fwButtons('', fw.frameClosed ? '닫기(제어 화면 다시 열기)' : '닫기', false);
      el.fwProgress.hidden = true;
      fwResult(false, '펌웨어 파일을 불러오지 못했습니다: ' + (e && e.message || e));
    });
  }

  // 2단계: 사용자 제스처 안에서 포트 선택 → 업로드
  function fwPickAndFlash() {
    var robot = fw.robot, entry = fwEntry(robot), cfg = robot.firmware || {};
    el.fwResult.hidden = true;
    var pick;
    try { pick = navigator.serial.requestPort(); }
    catch (e) { pick = Promise.reject(e); }
    fw.busy = true;
    fwButtons(el.fwGo.textContent, el.fwCancel.textContent, false, false);
    pick.then(function (port) {
      var info = {};
      try { info = port.getInfo ? port.getInfo() : {}; } catch (e) { /* 무시 */ }
      if (info.bluetoothServiceClassId) throw flashErr('bt_port', '블루투스 직렬 포트입니다');
      fw.phase = 'flashing';
      return fwRun(robot, entry, cfg, port);
    }).then(function (res) {
      fw.busy = false; lastInput = Date.now();   // 쓰기·정지가 끝난 때부터 무입력 시간을 다시 잰다
      fw.phase = 'done';
      fwStage('완료', 100);
      fwResult(true, '업로드 완료' + (res && res.baud ? ' (' + res.baud + 'bps)' : '') + '. 로봇이 새 펌웨어로 다시 시작합니다.' +
        (fw.origin === 'control' ? '\n닫으면 제어 화면을 다시 엽니다.' : ''));
      fwButtons('', '닫기', false);
      el.fwCancel.focus();
    }, function (e) {
      fw.busy = false; lastInput = Date.now();   // 쓰기·정지가 끝난 때부터 무입력 시간을 다시 잰다
      var cancelled = e && e.name === 'NotFoundError';   // 포트 선택 창을 닫음
      fw.phase = cancelled ? 'port' : 'failed';
      if (cancelled) fwStage('포트를 고르지 않았습니다. 다시 누르세요.', 0);
      else { console.warn('[hub] 펌웨어 업로드 실패', e); fwResult(false, fwHint(e, robot, entry)); }
      fwButtons(cancelled ? '포트 고르고 업로드' : '다시 시도', fw.frameClosed ? '닫기(제어 화면 다시 열기)' : '닫기', true);
      el.fwGo.focus();
    });
  }

  function flashErr(code, msg) { var e = new Error(msg); e.code = code; return e; }

  var FW_STAGE = { open: '포트 여는 중', reset: '보드 리셋', sync: '부트로더 동기화', signature: '칩 확인', write: '쓰기', verify: '검증', leave: '마무리', done: '완료' };
  function fwRun(robot, entry, cfg, port) {
    var bauds = (entry.bauds && entry.bauds.length) ? entry.bauds : (cfg.bauds || []);
    var log = function (m) { console.info('[hub][fw] ' + m); };
    var avr = entry.method === 'avr';
    var onProgress = function (ev) {
      var label = FW_STAGE[ev.stage] || ev.stage;
      var pct = null, txt = label;
      if (ev.stage === 'sync' && ev.attempt) txt = label + ' (' + ev.attempt + '/' + ev.attempts + ')';
      if (ev.stage === 'write') { txt = label + ' ' + (ev.percent || 0) + '%'; pct = avr ? (ev.percent || 0) * 0.6 : (ev.percent || 0); }
      else if (ev.stage === 'verify') {
        if (avr) { txt = label + ' ' + (ev.percent || 0) + '%'; pct = 60 + (ev.percent || 0) * 0.4; }
        else txt = '쓰기·검증(MD5)';
      }
      if (ev.stage === 'open' || ev.stage === 'reset') pct = 0;
      fwStage(txt + (ev.baud ? ' · ' + ev.baud + 'bps' : ''), pct);
    };
    var lib = window[FLASHERS[entry.method].global];
    var img = fw.image;
    if (avr) {
      var maxSize = entry.size && (entry.size.flashLimit || entry.size.flashMax);
      return lib.flash(port, img.hex, { bauds: bauds, signature: entry.signature || cfg.signature, maxSize: maxSize, onProgress: onProgress, log: log });
    }
    return lib.flash(port, img.files, { bauds: bauds, chip: cfg.chip, onProgress: onProgress, log: log });
  }

  // 실패 원인 추정 문구
  function fwHint(e, robot, entry) {
    var cfg = robot.firmware || {};
    var code = e && e.code;
    var extra = cfg.portHint ? '\n' + cfg.portHint : '';
    var t;
    if (code === 'port_busy' || (e && (e.name === 'NetworkError' || e.name === 'InvalidStateError'))) {
      t = '포트를 열 수 없습니다(사용 중). Arduino IDE 시리얼 모니터, 다른 탭의 제어 화면 등 이 포트를 쓰는 프로그램을 닫고 다시 시도하세요.' + extra;
    } else if (code === 'no_sync') {
      t = '보드와 동기화하지 못했습니다. 고른 포트가 이 로봇이 맞는지, 보드 종류나 부트로더가 설정(' + (entry.board || cfg.board || entry.fqbn) + ')과 다르지 않은지 확인하세요. 충전 전용 USB 케이블은 데이터가 가지 않습니다.' + extra;
    } else if (code === 'signature_mismatch' || code === 'chip_mismatch') {
      t = '보드의 칩이 이 펌웨어와 다릅니다. 다른 로봇의 포트를 골랐을 수 있습니다.';
    } else if (code === 'verify_failed') {
      t = '기록 검증에 실패했습니다. USB 케이블과 로봇 전원을 확인하고 다시 시도하세요.';
    } else if (code === 'too_large') {
      t = '펌웨어가 보드 용량보다 큽니다. 보드 종류 설정을 확인하세요.';
    } else if (code === 'bt_port') {
      t = '블루투스 직렬 포트를 골랐습니다. 업로드는 USB 케이블 포트로만 됩니다.';
    } else if (code === 'io') {
      t = '업로드 중 연결이 끊겼습니다. USB 케이블(데이터용인지)과 로봇 전원을 확인하세요.';
    } else {
      t = '업로드에 실패했습니다.';
    }
    return t + '\n(자세히: ' + String(e && e.message || e) + ')';
  }

  // 업로더 스크립트와 펌웨어 데이터(firmware.data.js)를 classic script 로 불러오고 sha256 을 확인한다.
  var scriptCache = Object.create(null);
  function loadScript(src) {
    if (!scriptCache[src]) {
      scriptCache[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () { resolve(); };
        s.onerror = function () { delete scriptCache[src]; reject(new Error(src + ' 를 불러오지 못했습니다')); };
        document.body.appendChild(s);
      });
    }
    return scriptCache[src];
  }

  function fwLoad(robot, entry) {
    var lib = FLASHERS[entry.method];
    if (!lib) return Promise.reject(new Error('알 수 없는 업로드 방식: ' + entry.method));
    var p = Promise.resolve();
    lib.scripts.forEach(function (src) { p = p.then(function () { return loadScript(src); }); });
    return p.then(function () { return loadScript(entry.data); }).then(function () {
      if (!window[lib.global]) throw new Error('업로더를 불러오지 못했습니다');
      var data = window.HUB_FIRMWARE_DATA && window.HUB_FIRMWARE_DATA[robot.id];
      if (!data || !Array.isArray(data.files)) throw new Error('펌웨어 데이터가 없습니다');
      var byName = Object.create(null);
      data.files.forEach(function (f) { byName[f.name] = f; });
      var img = { hex: null, files: [] };
      return Promise.all(entry.files.map(function (meta) {
        var f = byName[meta.name];
        if (!f) throw new Error(meta.name + ' 데이터가 없습니다');
        var bytes = f.kind === 'hex' ? new TextEncoder().encode(f.text) : b64bytes(f.base64);
        if (f.kind === 'hex') img.hex = f.text;
        else img.files.push({ name: meta.name, address: meta.address, data: bytes });
        return sha256hex(bytes).then(function (hx) {
          if (hx && hx !== meta.sha256) throw new Error(meta.name + ' 무결성(sha256) 불일치');
        });
      })).then(function () { return img; });
    });
  }

  function b64bytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // crypto.subtle 이 없는 환경(보안 컨텍스트 아님)이면 확인을 건너뛴다(null)
  function sha256hex(bytes) {
    var c = window.crypto && window.crypto.subtle;
    if (!c) return Promise.resolve(null);
    return c.digest('SHA-256', bytes).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  var toastTimer = null;
  function showToast(text) {
    el.toast.textContent = text;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
