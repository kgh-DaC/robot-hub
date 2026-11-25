/* bike: 셀프 밸런싱 바이크 (옆모습, 오른쪽이 앞)
 * 뒷바퀴 구동(구동 서보2), 앞바퀴 조향 서보(A3), 중앙 반동 휠(플라이휠)로 좌우 균형.
 * 반동 휠은 진행 방향 축으로 돌므로 옆모습에서는 모서리(타원)로 보이고,
 * 오른쪽 위 원에는 "뒤에서 본 미니뷰"를 그려 기울기와 휠 회전을 보여준다.
 * 원 테두리의 작은 삼각형은 다른 로봇 미니맵 화살표와 같은 뜻(진행 방향)이다.
 * 색은 CSS 변수만 사용한다. play(t)는 t만 보는 순수 함수다.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ID = 'bike';

  function E(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function seg(t, a, b) { return ease((t - a) / (b - a)); }
  function env(t, e) { return ease(t / e) * ease((1 - t) / e); }
  function f2(v) { return Math.round(v * 100) / 100; }
  function wrap(v, per) { v = f2(v) % per; if (v < 0) v += per; return f2(v) === per ? 0 : f2(v); }
  var DEG = 180 / Math.PI, TAU = Math.PI * 2;

  var RW = { x: 140, y: 220 }, FW = { x: 262, y: 220 }, WR = 30;

  var svg = null, R = {};

  function base() { return { dx: 0, wheel: 0, steer: 0, lean: 0, fly: 0, heading: 0 }; }

  function apply(p) {
    if (!svg) return;
    R.bike.setAttribute('transform', 'translate(' + f2(p.dx) + ' 0)');
    R.rearSp.setAttribute('transform', 'rotate(' + wrap(p.wheel, 60) + ' ' + RW.x + ' ' + RW.y + ')');
    R.frontSp.setAttribute('transform', 'rotate(' + wrap(p.wheel, 60) + ' ' + FW.x + ' ' + FW.y + ')');
    /* 조향: 앞바퀴가 비스듬히 보여 좁아짐 */
    var c = Math.cos(p.steer / DEG);
    R.front.setAttribute('transform', 'translate(' + FW.x + ' 0) scale(' + f2(c) + ' 1) translate(' + (-FW.x) + ' 0)');
    R.bar.setAttribute('transform', 'translate(' + f2(-10 * Math.sin(p.steer / DEG)) + ' 0)');
    R.flyDash.setAttribute('stroke-dashoffset', wrap(p.fly / 6, 12));
    /* 뒤에서 본 미니뷰 */
    R.rear.setAttribute('transform', 'rotate(' + f2(p.lean) + ' 0 20)');
    R.flySp.setAttribute('transform', 'rotate(' + wrap(p.fly, 180) + ' 0 -6)');
    R.tick.setAttribute('transform', 'rotate(' + f2(p.heading) + ')');
  }

  function wheel(parent, w) {
    var g = E('g', {}, parent);
    E('circle', { cx: w.x, cy: w.y, r: WR, fill: 'var(--fill)' }, g);
    E('circle', { cx: w.x, cy: w.y, r: WR - 6, 'stroke-width': 2 }, g);
    var sp = E('g', {}, g);
    for (var i = 0; i < 3; i++) {
      var a = i * Math.PI / 3;
      E('line', { x1: f2(w.x - 22 * Math.cos(a)), y1: f2(w.y - 22 * Math.sin(a)),
        x2: f2(w.x + 22 * Math.cos(a)), y2: f2(w.y + 22 * Math.sin(a)), 'stroke-width': 2 }, sp);
    }
    E('circle', { cx: w.x, cy: w.y, r: 5, fill: 'var(--fill-2)', 'stroke-width': 2 }, g);
    return { g: g, sp: sp };
  }

  function mount(el) {
    destroy();
    svg = E('svg', { viewBox: '0 0 400 300', class: 'robot-svg robot-' + ID, role: 'img',
      'aria-label': '셀프 밸런싱 바이크 동작', preserveAspectRatio: 'xMidYMid meet',
      width: '100%', height: '100%', fill: 'none', stroke: 'var(--line)', 'stroke-width': 3,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round' });

    E('line', { x1: 0, y1: 250, x2: 400, y2: 250, 'stroke-width': 2, 'stroke-dasharray': '6 6' }, svg);

    /* 미니뷰: 뒤에서 본 모습 */
    var mm = E('g', { transform: 'translate(350 50)' }, svg);
    E('circle', { cx: 0, cy: 0, r: 28, fill: 'var(--fill)', 'stroke-width': 2 }, mm);
    E('line', { x1: -20, y1: 20, x2: 20, y2: 20, 'stroke-width': 2 }, mm);
    R.rear = E('g', {}, mm);
    E('line', { x1: 0, y1: 4, x2: 0, y2: -16, 'stroke-width': 2.5 }, R.rear);
    E('line', { x1: -9, y1: -17, x2: 9, y2: -17, 'stroke-width': 2.5 }, R.rear);
    E('rect', { x: -3.5, y: 3, width: 7, height: 17, rx: 3.5, fill: 'var(--fill-2)', 'stroke-width': 2 }, R.rear);
    E('circle', { cx: 0, cy: -6, r: 9, fill: 'var(--c-bike)', 'stroke-width': 2 }, R.rear);
    R.flySp = E('g', {}, R.rear);
    E('line', { x1: 0, y1: -13, x2: 0, y2: 1, stroke: 'var(--fill)', 'stroke-width': 2 }, R.flySp);
    R.tick = E('g', {}, mm);
    E('path', { d: 'M0,-34 L5,-27 L-5,-27 Z', fill: 'var(--line)', 'stroke-width': 1.5 }, R.tick);

    R.bike = E('g', {}, svg);
    var b = R.bike;
    /* 뒷바퀴 + 구동 서보 */
    var rw = wheel(b, RW); R.rearSp = rw.sp;
    /* 프레임 */
    E('path', { d: 'M140,220 L176,150 L244,134 M176,150 L204,214 L140,220 M204,214 L238,150', 'stroke-width': 4 }, b);
    E('rect', { x: 150, y: 196, width: 22, height: 14, rx: 3, fill: 'var(--fill-2)' }, b);
    /* 전자부 상자 */
    E('rect', { x: 166, y: 122, width: 64, height: 20, rx: 4, fill: 'var(--fill-2)' }, b);
    E('line', { x1: 176, y1: 132, x2: 200, y2: 132, 'stroke-width': 2 }, b);
    /* 반동 휠 (옆에서 보면 모서리) */
    E('ellipse', { cx: 206, cy: 176, rx: 9, ry: 29, fill: 'var(--c-bike)' }, b);
    R.flyDash = E('ellipse', { cx: 206, cy: 176, rx: 4, ry: 23, stroke: 'var(--fill)', 'stroke-width': 2,
      'stroke-dasharray': '6 6' }, b);
    E('circle', { cx: 206, cy: 176, r: 3, fill: 'var(--line)', stroke: 'none' }, b);
    /* 앞바퀴 + 포크 (조향) */
    R.front = E('g', {}, b);
    var fw = wheel(R.front, FW); R.frontSp = fw.sp;
    E('line', { x1: 244, y1: 128, x2: 262, y2: 220, 'stroke-width': 4 }, b);
    E('rect', { x: 236, y: 122, width: 16, height: 12, rx: 3, fill: 'var(--fill)' }, b);
    /* 핸들 */
    R.bar = E('g', {}, b);
    E('line', { x1: 242, y1: 122, x2: 236, y2: 108, 'stroke-width': 4 }, R.bar);
    E('line', { x1: 228, y1: 108, x2: 242, y2: 108, 'stroke-width': 5 }, R.bar);

    el.appendChild(svg);
    apply(base());
  }

  function destroy() {
    if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
    svg = null; R = {};
  }

  function drive(t, dir) {
    var p = base();
    p.dx = dir * (70 * seg(t, 0.05, 0.52) - 70 * seg(t, 0.6, 0.95));
    p.wheel = p.dx / WR * DEG;
    /* 주행 중 미세 보정: 최대 약 1.5도 */
    p.lean = 1.5 * Math.sin(TAU * 3 * t) * env(t, 0.1);
    p.fly = 360 * t + 60 * (1 - Math.cos(TAU * 3 * t));
    return p;
  }

  function steer(t, dir) {
    var p = base();
    var k = seg(t, 0.08, 0.3) * (1 - seg(t, 0.7, 0.92));
    p.steer = dir * 35 * k;
    p.heading = dir * 45 * k;
    /* 인벤토리 movement 는 조향만 말한다. 기울기는 균형 보정 범위의 작은 값(최대 약 2.8도) */
    p.lean = dir * 2 * k + 0.8 * Math.sin(TAU * 4 * t) * k;
    p.fly = 360 * t + 90 * (1 - Math.cos(TAU * t));
    p.wheel = 120 * seg(t, 0.05, 0.95);
    return p;
  }

  var motions = [
    { key: 'balance', label: '균형 잡기', ms: 3000, play: function (t) {
      var p = base();
      var e = env(t, 0.12);
      /* 미세 보정: 최대 3도 이내 (10도는 펌웨어 이탈 기준) */
      p.lean = (2.4 * Math.sin(TAU * 2 * t) + 0.6 * Math.sin(TAU * 5 * t)) * e;
      /* 기울기 반대로 휠이 가감속 */
      p.fly = 720 * t + 140 * (1 - Math.cos(TAU * 2 * t));
      apply(p);
    } },
    { key: 'drive_forward', label: '전진', ms: 2800, play: function (t) {
      apply(drive(t, 1));
    } },
    { key: 'steer_left', label: '좌회전', ms: 2600, play: function (t) {
      apply(steer(t, -1));
    } },
    { key: 'steer_right', label: '우회전', ms: 2600, play: function (t) {
      apply(steer(t, 1));
    } }
  ];

  window.RobotHub.register({ id: ID, mount: mount, motions: motions, destroy: destroy });
})();
