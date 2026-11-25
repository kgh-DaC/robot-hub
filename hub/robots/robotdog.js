/* robotdog: ESP32 4족 보행 로봇개 (옆모습, 오른쪽이 앞)
 * 다리 4개 x 3관절(ALPHA 어깨, BETA 윗다리, GAMMA 아랫다리). 옆모습에서는 BETA/GAMMA 가 보이고
 * ALPHA(좌우 벌림)는 보이지 않으므로 선회는 미니맵으로 표현한다.
 * 보행: 대각선 쌍 트롯. 쌍 A = LF + RH, 쌍 B = RF + LH (servoInitPose.ino setWalkingPose).
 * 화면 앞쪽(관람자 쪽)은 왼쪽 다리(LF, LH), 뒤쪽 흐린 다리는 오른쪽(RF, RH).
 * 색은 CSS 변수만 사용한다. play(t)는 t만 보는 순수 함수다.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ID = 'robotdog';

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
  function frac(x) { return x - Math.floor(x); }
  function f2(v) { return Math.round(v * 100) / 100; }
  function wrap(v, per) { v = f2(v) % per; if (v < 0) v += per; return f2(v) === per ? 0 : f2(v); }

  var L1 = 58, L2 = 58;          /* 윗다리, 아랫다리 */
  var SH_Y = 140, GROUND = 250;  /* 어깨 높이, 바닥 */
  /* 다리 정의: 어깨 x, 앞쪽 여부, 대각 쌍, 먼 쪽 여부 */
  var LEGS = [
    { id: 'RH', x: 166, pair: 1, far: true },
    { id: 'RF', x: 246, pair: 0, far: true },
    { id: 'LH', x: 160, pair: 0, far: false },
    { id: 'LF', x: 240, pair: 1, far: false }
  ];
  /* pair 1 = A(LF+RH) 가 먼저 스윙, pair 0 = B(RF+LH) */

  var svg = null, R = {};

  function base() {
    return { dx: 0, dy: 0, heading: 0, feet: { LF: [0, 0], RF: [0, 0], LH: [0, 0], RH: [0, 0] } };
  }

  /* 2관절 IK: 어깨 기준 발 위치 (fx, fy[아래 +]) -> 무릎 좌표. 무릎은 뒤쪽으로 접힘 */
  function ik(sx, sy, fx, fy) {
    var d = Math.sqrt(fx * fx + fy * fy);
    var maxd = L1 + L2 - 0.5;
    if (d > maxd) { fx *= maxd / d; fy *= maxd / d; d = maxd; }
    var a0 = Math.atan2(fy, fx);
    var b = Math.acos(clamp01((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    var ka = a0 + b;
    return { kx: sx + L1 * Math.cos(ka), ky: sy + L1 * Math.sin(ka), fx: sx + fx, fy: sy + fy };
  }

  function apply(p) {
    if (!svg) return;
    R.dog.setAttribute('transform', 'translate(' + f2(p.dx) + ' 0)');
    R.trunk.setAttribute('transform', 'translate(0 ' + f2(p.dy) + ')');
    LEGS.forEach(function (lg) {
      var f = p.feet[lg.id];
      var sy = SH_Y + p.dy - (lg.far ? 3 : 0);
      var s = ik(lg.x, sy, f[0], GROUND - 4 - sy - f[1]);
      var path = 'M' + lg.x + ',' + f2(sy) + ' L' + f2(s.kx) + ',' + f2(s.ky) + ' L' + f2(s.fx) + ',' + f2(s.fy);
      var n = R.legs[lg.id];
      n.outer.setAttribute('d', path);
      n.inner.setAttribute('d', path);
      n.knee.setAttribute('cx', f2(s.kx)); n.knee.setAttribute('cy', f2(s.ky));
      n.hip.setAttribute('cy', f2(sy));
      n.foot.setAttribute('cx', f2(s.fx)); n.foot.setAttribute('cy', f2(s.fy));
    });
    R.arrow.setAttribute('transform', 'rotate(' + wrap(p.heading, 360) + ')');
  }

  function makeLeg(parent, lg) {
    var g = E('g', {}, parent);
    var inner = lg.far ? 'var(--fill-2)' : 'var(--fill)';
    var o = {
      outer: E('path', { 'stroke-width': 13 }, g),
      inner: E('path', { stroke: inner, 'stroke-width': 7 }, g),
      hip: E('circle', { cx: lg.x, cy: SH_Y, r: 7, fill: inner }, g),
      knee: E('circle', { r: 5, fill: inner, 'stroke-width': 2.5 }, g),
      foot: E('circle', { r: 4.5, fill: 'var(--line)', stroke: 'none' }, g)
    };
    R.legs[lg.id] = o;
  }

  function mount(el) {
    destroy();
    svg = E('svg', { viewBox: '0 0 400 300', class: 'robot-svg robot-' + ID, role: 'img',
      'aria-label': '로봇개 4족 보행 동작', preserveAspectRatio: 'xMidYMid meet',
      width: '100%', height: '100%', fill: 'none', stroke: 'var(--line)', 'stroke-width': 3,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round' });

    E('line', { x1: 0, y1: 250, x2: 400, y2: 250, 'stroke-width': 2, 'stroke-dasharray': '6 6' }, svg);

    var mm = E('g', { transform: 'translate(350 50)' }, svg);
    E('circle', { cx: 0, cy: 0, r: 28, fill: 'var(--fill)', 'stroke-width': 2 }, mm);
    R.arrow = E('g', {}, mm);
    E('path', { d: 'M0,-13 L9,9 L0,4 L-9,9 Z', fill: 'var(--fill-2)', 'stroke-width': 2 }, R.arrow);

    R.dog = E('g', {}, svg);
    R.legs = {};
    /* 먼 쪽 다리 먼저 */
    makeLeg(R.dog, LEGS[0]); makeLeg(R.dog, LEGS[1]);
    /* 몸통 */
    R.trunk = E('g', {}, R.dog);
    var b = R.trunk;
    E('rect', { x: 134, y: 116, width: 130, height: 34, rx: 8, fill: 'var(--fill)' }, b);
    E('line', { x1: 150, y1: 140, x2: 250, y2: 140, 'stroke-width': 2, 'stroke-dasharray': '2 6' }, b);
    /* ESP32 보드 */
    E('rect', { x: 162, y: 104, width: 70, height: 12, rx: 2, fill: 'var(--fill-2)' }, b);
    E('line', { x1: 172, y1: 110, x2: 200, y2: 110, 'stroke-width': 2 }, b);
    /* 앞판 + 방향 표시 */
    E('rect', { x: 262, y: 112, width: 14, height: 40, rx: 4, fill: 'var(--fill-2)' }, b);
    E('rect', { x: 265, y: 122, width: 8, height: 10, rx: 2, fill: 'var(--c-robotdog)', 'stroke-width': 2 }, b);
    /* 가까운 쪽 다리 */
    makeLeg(R.dog, LEGS[2]); makeLeg(R.dog, LEGS[3]);

    el.appendChild(svg);
    apply(base());
  }

  function destroy() {
    if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
    svg = null; R = {};
  }

  /* 트롯 한 다리: 위상 ph(0..1). 앞 절반 스윙(들고 앞으로), 뒤 절반 디딤(뒤로 밀기) */
  function trotFoot(ph, S, H) {
    if (ph < 0.5) {
      var u = ph / 0.5;
      return [-S + 2 * S * ease(u), H * Math.sin(Math.PI * u)];
    }
    var v = (ph - 0.5) / 0.5;
    return [S - 2 * S * v, 0];
  }

  /* g: 걸음 진행(사이클 수, 줄면 뒤로 걷기), amp: 보폭 크기 0..1 */
  function gait(p, g, S, H, amp) {
    LEGS.forEach(function (lg) {
      var ph = frac(g + (lg.pair === 1 ? 0 : 0.5));
      var f = trotFoot(ph, S, H);
      p.feet[lg.id] = [f[0] * amp, f[1] * amp];
    });
    p.dy = -1.5 * Math.abs(Math.sin(2 * Math.PI * g)) * amp;
  }

  var S = 9, H = 14;

  /* 왕복: 2사이클 나갔다가 2사이클 뒤로 걸어 복귀. 몸 이동 = 4S x 사이클(디딤발 고정) */
  function travel(t, dir) {
    var p = base();
    var g = 2 * (seg(t, 0.06, 0.58) - seg(t, 0.64, 0.96));
    gait(p, g * dir, S, H, env(t, 0.08));
    p.dx = 4 * S * g * dir;
    return p;
  }

  var motions = [
    { key: 'forward', label: '앞으로', ms: 3000, play: function (t) {
      apply(travel(t, 1));
    } },
    { key: 'left', label: '왼쪽 선회', ms: 3000, play: function (t) {
      var p = base();
      /* 제자리 트롯(작은 보폭). 제자리 회전인지 곡선 이동인지 unknown 이라
       * 미니맵 화살표만 왼쪽으로 약 50도 돌렸다가 되돌린다(보수적 표현). */
      gait(p, 3 * t, 4, H, env(t, 0.1));
      p.heading = -50 * seg(t, 0.1, 0.42) * (1 - seg(t, 0.62, 0.92));
      apply(p);
    } },
    { key: 'backward', label: '뒤로', ms: 3000, play: function (t) {
      apply(travel(t, -1));
    } },
    { key: 'walk_stop', label: '보행 멈춤', ms: 2800, play: function (t) {
      var p = base();
      /* 제자리 트롯 -> 걸음을 줄이며 중립 자세(90/45/90)로 서서히 복귀 -> 살짝 내려앉음 */
      var amp = ease(t / 0.08) * (1 - seg(t, 0.45, 0.68));
      gait(p, 2.5 * t, 6, H, amp);
      p.dy += 4 * Math.sin(Math.PI * clamp01((t - 0.7) / 0.25));
      apply(p);
    } }
  ];

  window.RobotHub.register({ id: ID, mount: mount, motions: motions, destroy: destroy });
})();
