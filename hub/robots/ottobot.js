/* ottobot: Otto DIY Fat 휴머노이드 (정면 모습, 관람자를 바라봄)
 * 걸음 패턴은 OttoDIYLib Otto.cpp 의 진동자 값(A/O/phase_diff)을 근사했다.
 *   walk   : 엉덩이 A=30, 발목 A=20, 발목 위상 -90도
 *   turn   : walk 와 같되 한쪽 엉덩이 진폭을 10으로 줄임
 *   moonwalker : 발목 A=h, 두 발목 위상차 60도, 엉덩이 정지
 *   swing  : 발목 A=h, 두 발목 같은 위상
 *   jump   : 발목 150/30 으로 까치발 후 90 복귀
 * 색은 CSS 변수만 사용한다. play(t)는 t만 보는 순수 함수다.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ID = 'ottobot';

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
  var TAU = Math.PI * 2;

  /* 8x4 LED 매트릭스 입 모양 */
  var MOUTHS = {
    smile: ['........', '#......#', '.#....#.', '..####..'],
    grin:  ['########', '#......#', '.#....#.', '..####..'],
    o:     ['...##...', '..#..#..', '..#..#..', '...##...']
  };

  var svg = null, R = {};

  function base() {
    return { dx: 0, dy: 0, lean: 0, scale: 1, hipL: 0, hipR: 0, tiltL: 0, tiltR: 0,
      armL: 8, armR: 8, heading: 0, lift: 0, mouth: 'smile' };
  }

  /* 발 중심 x, 바깥 모서리 x */
  var FOOT = { L: { cx: 178, outer: 160, inner: 196 }, R: { cx: 222, outer: 240, inner: 204 } };

  function apply(p) {
    if (!svg) return;
    /* 전체: 이동 + 크기(다가옴) */
    R.all.setAttribute('transform', 'translate(' + f2(p.dx) + ' ' + f2(p.dy) + ') translate(200 250) scale(' +
      f2(p.scale) + ') translate(-200 -250)');
    /* 몸 기울기: 디딤발 바깥 모서리를 축으로 회전 */
    var pivot = p.lean >= 0 ? FOOT.R.outer : FOOT.L.outer;
    R.body.setAttribute('transform', 'rotate(' + f2(p.lean) + ' ' + pivot + ' 250)');
    /* 발: 디딤발은 바닥에 평평하게(몸 회전 상쇄), 발목 roll 은 안쪽 모서리 들림 */
    ['L', 'R'].forEach(function (s) {
      var f = FOOT[s];
      var stance = (p.lean >= 0 && s === 'R') || (p.lean < 0 && s === 'L');
      var counter = stance ? 'rotate(' + f2(-p.lean) + ' ' + pivot + ' 250) ' : '';
      var tilt = s === 'L' ? -p.tiltL : p.tiltR;
      var yaw = s === 'L' ? p.hipL : -p.hipR;
      var fw = Math.sin(yaw * Math.PI / 180);
      R['foot' + s].setAttribute('transform', counter + 'rotate(' + f2(tilt) + ' ' + f.outer + ' 250) ' +
        'translate(' + f.cx + ' 241) scale(' + f2(1 + 0.12 * fw) + ' ' + f2(1 + 0.08 * fw) + ') translate(' + (-f.cx) + ' -241)');
    });
    R.upper.setAttribute('transform', 'translate(0 ' + f2(-p.lift) + ')');
    R.armL.setAttribute('transform', 'rotate(' + f2(p.armL) + ' 156 186)');
    R.armR.setAttribute('transform', 'rotate(' + f2(-p.armR) + ' 244 186)');
    R.arrow.setAttribute('transform', 'rotate(' + wrap(p.heading, 360) + ')');
    var m = MOUTHS[p.mouth] || MOUTHS.smile;
    R.leds.forEach(function (d) {
      var on = m[d.r].charAt(d.c) === '#';
      d.n.setAttribute('fill', on ? 'var(--c-ottobot)' : 'var(--fill-2)');
    });
  }

  function mount(el) {
    destroy();
    svg = E('svg', { viewBox: '0 0 400 300', class: 'robot-svg robot-' + ID, role: 'img',
      'aria-label': '오토봇 휴머노이드 동작', preserveAspectRatio: 'xMidYMid meet',
      width: '100%', height: '100%', fill: 'none', stroke: 'var(--line)', 'stroke-width': 3,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round' });

    E('line', { x1: 0, y1: 250, x2: 400, y2: 250, 'stroke-width': 2, 'stroke-dasharray': '6 6' }, svg);

    var mm = E('g', { transform: 'translate(350 50)' }, svg);
    E('circle', { cx: 0, cy: 0, r: 28, fill: 'var(--fill)', 'stroke-width': 2 }, mm);
    R.arrow = E('g', {}, mm);
    E('path', { d: 'M0,-13 L9,9 L0,4 L-9,9 Z', fill: 'var(--fill-2)', 'stroke-width': 2 }, R.arrow);

    R.all = E('g', {}, svg);
    R.body = E('g', {}, R.all);
    R.upper = E('g', {}, R.body);
    var b = R.upper;

    /* 팔 (몸 뒤에 먼저 그림) */
    R.armL = E('g', {}, b);
    E('rect', { x: 149, y: 182, width: 14, height: 40, rx: 7, fill: 'var(--fill)' }, R.armL);
    R.armR = E('g', {}, b);
    E('rect', { x: 237, y: 182, width: 14, height: 40, rx: 7, fill: 'var(--fill)' }, R.armR);

    /* 다리 (엉덩이 서보 아래) */
    E('rect', { x: 170, y: 212, width: 16, height: 32, rx: 3, fill: 'var(--fill-2)' }, b);
    E('rect', { x: 214, y: 212, width: 16, height: 32, rx: 3, fill: 'var(--fill-2)' }, b);

    /* 몸통 (서보 상자) */
    E('rect', { x: 156, y: 178, width: 88, height: 36, rx: 6, fill: 'var(--fill)' }, b);
    E('circle', { cx: 178, cy: 206, r: 3, fill: 'var(--line)', stroke: 'none' }, b);
    E('circle', { cx: 222, cy: 206, r: 3, fill: 'var(--line)', stroke: 'none' }, b);

    /* 네모 머리 */
    E('rect', { x: 146, y: 104, width: 108, height: 76, rx: 10, fill: 'var(--fill)' }, b);
    /* 초음파 눈 */
    [178, 222].forEach(function (cx) {
      E('circle', { cx: cx, cy: 124, r: 13, fill: 'var(--fill)' }, b);
      E('circle', { cx: cx, cy: 124, r: 6, fill: 'var(--fill-2)', 'stroke-width': 2 }, b);
    });
    /* LED 매트릭스 입 */
    E('rect', { x: 166, y: 144, width: 68, height: 30, rx: 4, fill: 'var(--fill)', 'stroke-width': 2 }, b);
    R.leds = [];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 8; c++) {
      R.leds.push({ r: r, c: c, n: E('circle', { cx: 172 + c * 8, cy: 150 + r * 6, r: 2.4, stroke: 'none',
        fill: 'var(--fill-2)' }, b) });
    }

    /* 발: 몸 그룹 안에 두고 디딤발만 회전 상쇄 */
    b = R.body;
    R.footL = E('g', {}, b);
    E('rect', { x: 160, y: 234, width: 36, height: 14, rx: 4, fill: 'var(--fill)' }, R.footL);
    R.footR = E('g', {}, b);
    E('rect', { x: 204, y: 234, width: 36, height: 14, rx: 4, fill: 'var(--fill)' }, R.footR);

    el.appendChild(svg);
    apply(base());
  }

  function destroy() {
    if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
    svg = null; R = {};
  }

  /* Otto 진동자: 엉덩이 = A*sin(phi), 발목 = A*sin(phi + phase) + O */
  function walkPose(t, cycles, hipAL, hipAR) {
    var p = base(), e = env(t, 0.12), ph = TAU * cycles * t;
    p.hipL = hipAL * Math.sin(ph) * e;
    p.hipR = hipAR * Math.sin(ph) * e;
    var ank = 20 * Math.sin(ph - Math.PI / 2) * e;
    /* 두 발목이 같은 쪽으로 roll -> 몸이 좌우로 실림 */
    p.lean = 0.55 * ank;
    p.armL = 8 + 10 * Math.sin(ph) * e;
    p.armR = 8 - 10 * Math.sin(ph) * e;
    return p;
  }

  var motions = [
    { key: 'forward', label: '전진', ms: 2800, play: function (t) {
      var p = walkPose(t, 2, 30, 30);
      /* 관람자 쪽으로 다가왔다가 돌아감 */
      p.scale = 1 + 0.08 * Math.sin(Math.PI * t);
      apply(p);
    } },
    { key: 'turn_left', label: '좌회전', ms: 2800, play: function (t) {
      var p = walkPose(t, 2, 30, 10);
      p.heading = -360 * seg(t, 0.06, 0.94);
      apply(p);
    } },
    { key: 'moonwalk_left', label: '문워크', ms: 3000, play: function (t) {
      var p = base(), e = env(t, 0.1), ph = TAU * 3 * t, h = 25;
      /* 두 발목 60도 위상차: 발 안쪽이 번갈아 들리며 옆으로 미끄러짐 */
      p.tiltL = (h / 2 + h / 2 * Math.sin(ph)) * e * 0.9;
      p.tiltR = (h / 2 + h / 2 * Math.sin(ph - Math.PI / 3)) * e * 0.9;
      /* 로봇 기준 왼쪽 = 화면 오른쪽 */
      p.dx = 60 * Math.sin(Math.PI * seg(t, 0.04, 0.96));
      p.lift = 3 * e;
      p.armL = 8 + 6 * Math.sin(ph) * e;
      p.armR = 8 + 6 * Math.sin(ph - Math.PI / 3) * e;
      apply(p);
    } },
    { key: 'swing', label: '스윙', ms: 2600, play: function (t) {
      var p = base(), e = env(t, 0.12), ph = TAU * 2 * t;
      p.lean = 13 * Math.sin(ph) * e;
      p.armL = 8 + 30 * (0.5 + 0.5 * Math.sin(ph)) * e;
      p.armR = 8 + 30 * (0.5 - 0.5 * Math.sin(ph)) * e;
      apply(p);
    } },
    { key: 'jump', label: '점프', ms: 2400, play: function (t) {
      var p = base();
      /* 발목 150/30: 두 발 안쪽을 세워 까치발 -> 살짝 뜸 -> 착지 */
      var up = seg(t, 0.1, 0.35) * (1 - seg(t, 0.55, 0.8));
      var air = Math.sin(Math.PI * clamp01((t - 0.35) / 0.2));
      p.tiltL = 28 * up; p.tiltR = 28 * up;
      p.lift = 8 * up;
      p.dy = -18 * air + 4 * Math.sin(Math.PI * clamp01((t - 0.8) / 0.15));
      p.armL = 8 + 60 * up; p.armR = 8 + 60 * up;
      p.mouth = up > 0.3 ? 'o' : 'smile';
      apply(p);
    } },
    { key: 'gesture_wave', label: '손 흔들기', ms: 2800, play: function (t) {
      var p = base();
      var raise = seg(t, 0.05, 0.25) * (1 - seg(t, 0.78, 0.96));
      var wave = Math.sin(TAU * 3 * clamp01((t - 0.25) / 0.53));
      /* 로봇의 오른팔 = 화면 왼쪽 팔 */
      p.armL = 8 + 140 * raise + 22 * wave * raise;
      p.lean = -3 * raise;
      p.mouth = raise > 0.3 ? 'grin' : 'smile';
      apply(p);
    } }
  ];

  window.RobotHub.register({ id: ID, mount: mount, motions: motions, destroy: destroy });
})();
