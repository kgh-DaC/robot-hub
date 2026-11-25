/* SMARS: 궤도형 소형 로봇 (옆모습, 오른쪽이 앞)
 * 규격: robot-motion-animation 스킬, window.RobotHub.register()
 * 색은 CSS 변수만 사용한다. play(t)는 t만 보는 순수 함수다.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ID = 'smars';

  function E(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function seg(t, a, b) { return ease((t - a) / (b - a)); }
  function f2(v) { return Math.round(v * 100) / 100; }
  function wrap(v, per) { v = f2(v) % per; if (v < 0) v += per; return f2(v) === per ? 0 : f2(v); }

  var svg = null, R = {};

  function base() {
    return { dx: 0, dy: 0, wheel: 0, tread: 0, heading: 0, mx: 0, my: 0, msc: 1,
      wall: 0, arcs: 0, arcT: 0, bang: 0, notes: [0, 0, 0], noteT: [0, 0, 0] };
  }

  function apply(p) {
    if (!svg) return;
    R.robot.setAttribute('transform', 'translate(' + f2(p.dx) + ' ' + f2(p.dy) + ')');
    R.wheels.forEach(function (w) {
      w.g.setAttribute('transform', 'rotate(' + wrap(p.wheel, 90) + ' ' + w.cx + ' ' + w.cy + ')');
    });
    R.tread.setAttribute('stroke-dashoffset', wrap(p.tread, 12));
    R.arrow.setAttribute('transform', 'translate(' + f2(p.mx) + ' ' + f2(p.my) + ') rotate(' + wrap(p.heading, 360) + ') scale(' + f2(p.msc) + ')');
    R.wall.setAttribute('opacity', f2(p.wall));
    R.arcs.forEach(function (a, i) {
      var pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * (p.arcT * 5 - i * 0.22));
      a.setAttribute('opacity', f2(p.arcs * (0.25 + 0.75 * pulse)));
    });
    R.bang.setAttribute('opacity', f2(p.bang));
    R.notes.forEach(function (n, i) {
      var k = p.noteT[i];
      n.setAttribute('opacity', f2(p.notes[i]));
      n.setAttribute('transform', 'translate(' + f2(i * 14 - 4) + ' ' + f2(-34 * k) + ')');
    });
  }

  function mount(el) {
    destroy();
    svg = E('svg', { viewBox: '0 0 400 300', class: 'robot-svg robot-' + ID, role: 'img',
      'aria-label': 'SMARS 궤도형 로봇 동작', preserveAspectRatio: 'xMidYMid meet',
      width: '100%', height: '100%', fill: 'none', stroke: 'var(--line)', 'stroke-width': 3,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round' });

    /* 바닥선 */
    E('line', { x1: 0, y1: 250, x2: 400, y2: 250, 'stroke-width': 2, 'stroke-dasharray': '6 6' }, svg);

    /* 미니맵 (위에서 본 방향) */
    var mm = E('g', { transform: 'translate(350 50)' }, svg);
    E('circle', { cx: 0, cy: 0, r: 28, fill: 'var(--fill)', 'stroke-width': 2 }, mm);
    R.arrow = E('g', {}, mm);
    E('path', { d: 'M0,-13 L9,9 L0,4 L-9,9 Z', fill: 'var(--fill-2)', 'stroke-width': 2 }, R.arrow);

    /* 장애물 벽 (safe_stop) */
    R.wall = E('g', { opacity: 0 }, svg);
    E('rect', { x: 342, y: 168, width: 20, height: 82, rx: 3, fill: 'var(--fill-2)' }, R.wall);
    E('line', { x1: 342, y1: 196, x2: 362, y2: 196, 'stroke-width': 2 }, R.wall);
    E('line', { x1: 342, y1: 222, x2: 362, y2: 222, 'stroke-width': 2 }, R.wall);

    /* 로봇 */
    R.robot = E('g', {}, svg);
    var g = R.robot;
    /* 초음파 파동 (로봇과 같이 이동) */
    R.arcs = [];
    [14, 26, 38].forEach(function (r) {
      var cx = 282, cy = 177, a = 38 * Math.PI / 180;
      var x1 = cx + r * Math.cos(-a), y1 = cy + r * Math.sin(-a);
      var x2 = cx + r * Math.cos(a), y2 = cy + r * Math.sin(a);
      R.arcs.push(E('path', { d: 'M' + f2(x1) + ',' + f2(y1) + ' A' + r + ',' + r + ' 0 0 1 ' + f2(x2) + ',' + f2(y2),
        stroke: 'var(--fx)', 'stroke-width': 2, 'stroke-dasharray': '4 4', opacity: 0 }, g));
    });
    R.bang = E('text', { x: 300, y: 140, 'font-size': 26, 'font-weight': 700, fill: 'var(--fx)', stroke: 'none',
      'text-anchor': 'middle', opacity: 0 }, g);
    R.bang.textContent = '!';

    /* 궤도 */
    E('rect', { x: 138, y: 206, width: 124, height: 42, rx: 21, fill: 'var(--fill-2)' }, g);
    R.tread = E('rect', { x: 143, y: 211, width: 114, height: 32, rx: 16, 'stroke-width': 2,
      'stroke-dasharray': '6 6' }, g);
    E('circle', { cx: 200, cy: 232, r: 5, fill: 'var(--fill)', 'stroke-width': 2 }, g);
    R.wheels = [];
    [[160, 227], [240, 227]].forEach(function (c) {
      E('circle', { cx: c[0], cy: c[1], r: 14, fill: 'var(--fill)' }, g);
      var wg = E('g', {}, g);
      E('line', { x1: c[0] - 9, y1: c[1], x2: c[0] + 9, y2: c[1], 'stroke-width': 2 }, wg);
      E('line', { x1: c[0], y1: c[1] - 9, x2: c[0], y2: c[1] + 9, 'stroke-width': 2 }, wg);
      E('circle', { cx: c[0], cy: c[1], r: 3, fill: 'var(--line)', stroke: 'none' }, g);
      R.wheels.push({ g: wg, cx: c[0], cy: c[1] });
    });

    /* 몸체 */
    E('rect', { x: 146, y: 150, width: 108, height: 56, rx: 8, fill: 'var(--fill)' }, g);
    E('rect', { x: 146, y: 178, width: 108, height: 9, fill: 'var(--c-smars)', 'stroke-width': 2 }, g);
    /* 모터 쉴드 보드 + 부저 */
    E('rect', { x: 156, y: 136, width: 84, height: 14, rx: 3, fill: 'var(--fill-2)' }, g);
    E('rect', { x: 172, y: 124, width: 16, height: 12, rx: 3, fill: 'var(--fill)' }, g);
    E('line', { x1: 206, y1: 143, x2: 230, y2: 143, 'stroke-width': 2 }, g);
    /* 초음파 센서: 두 눈 */
    E('rect', { x: 254, y: 152, width: 9, height: 50, rx: 2, fill: 'var(--fill-2)' }, g);
    [165, 189].forEach(function (cy) {
      E('circle', { cx: 270, cy: cy, r: 10, fill: 'var(--fill)' }, g);
      E('circle', { cx: 270, cy: cy, r: 4.5, fill: 'var(--fill-2)', 'stroke-width': 2 }, g);
    });

    /* 음표 (부저) */
    R.notes = [];
    for (var i = 0; i < 3; i++) {
      var n = E('text', { x: 172, y: 116, 'font-size': 22, fill: 'var(--fx)', stroke: 'none', opacity: 0 }, g);
      n.textContent = i === 1 ? '♫' : '♪';
      R.notes.push(n);
    }

    el.appendChild(svg);
    apply(base());
  }

  function destroy() {
    if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
    svg = null; R = {};
  }

  var DEG = 180 / Math.PI;

  var motions = [
    { key: 'forward', label: '전진', ms: 2600, play: function (t) {
      var p = base();
      p.dx = 70 * seg(t, 0.05, 0.5) - 70 * seg(t, 0.58, 0.95);
      p.wheel = p.dx / 14 * DEG;
      p.tread = -p.dx;
      var moving = Math.min(1, Math.abs(p.dx) / 10);
      p.dy = -0.8 * Math.abs(Math.sin(2 * Math.PI * 12 * t)) * moving;
      apply(p);
    } },
    { key: 'turn_left', label: '좌회전', ms: 2400, play: function (t) {
      var p = base();
      var k = seg(t, 0.08, 0.92);
      p.heading = -360 * k;
      /* 보이는 쪽(왼쪽) 궤도는 뒤로 돈다 */
      p.wheel = -360 * k;
      p.tread = 48 * k;
      apply(p);
    } },
    { key: 'joystick_drive', label: '곡선 주행', ms: 3000, play: function (t) {
      var p = base();
      var th = 2 * Math.PI * seg(t, 0.05, 0.95);
      /* 위에서 보면 오른쪽으로 원을 그리며 한 바퀴, 옆에서 보면 앞뒤로 오간다 */
      p.mx = 8 - 8 * Math.cos(th);
      p.my = -8 * Math.sin(th);
      p.msc = 1 - 0.35 * Math.sin(th / 2);
      p.heading = th * DEG;
      p.dx = 60 * Math.sin(th);
      p.wheel = 720 * seg(t, 0.05, 0.95);
      p.tread = -96 * seg(t, 0.05, 0.95);
      apply(p);
    } },
    { key: 'safe_stop', label: '장애물 정지', ms: 3000, play: function (t) {
      var p = base();
      p.wall = seg(t, 0, 0.12) * (1 - seg(t, 0.86, 1));
      p.dx = 50 * seg(t, 0.08, 0.42) - 50 * seg(t, 0.64, 0.92);
      p.wheel = p.dx / 14 * DEG;
      p.tread = -p.dx;
      p.arcs = seg(t, 0.04, 0.12) * (1 - seg(t, 0.62, 0.7));
      p.arcT = t;
      p.bang = seg(t, 0.42, 0.46) * (1 - seg(t, 0.6, 0.64));
      apply(p);
    } },
    { key: 'buzzer_alarm', label: '경보음', ms: 2400, play: function (t) {
      var p = base();
      var starts = [0.06, 0.34, 0.62], on = 0;
      for (var i = 0; i < 3; i++) {
        var k = (t - starts[i]) / 0.32;
        if (k >= 0 && k <= 1) {
          p.noteT[i] = k;
          p.notes[i] = Math.sin(Math.PI * k);
          if (k < 0.45) on = 1;
        }
      }
      p.dy = on * 1.2 * Math.sin(2 * Math.PI * 30 * t);
      apply(p);
    } }
  ];

  window.RobotHub.register({ id: ID, mount: mount, motions: motions, destroy: destroy });
})();
