---
name: hub-shell
description: 4대 로봇 통합 허브의 셸(index.html·hub.js·hub.css·robots.config.js·start_hub.bat) 아키텍처와 구현 규칙. 4분할 소개 화면, 로봇 모듈 등록 규격(window.RobotHub.register), 제어 웹 iframe 띄우기, 나가기, 무입력 자동 복귀, 복귀 전 안전 정지, 같은 출처 실행을 다룬다. hub-web-engineer가 셸을 만들거나 고칠 때, robot-motion-animator가 모듈 규격을 확인할 때 사용한다.
---

# 허브 셸 아키텍처

## 파일 구성 (`통합/` 기준)
```
index.html              # 허브 진입. 더블클릭보다 start_hub.bat 권장
hub/hub.css             # 공통 스타일(디자인 토큰은 robot-motion-animation 스킬)
hub/hub.js              # 상태 전환, iframe, 무입력 타이머, 안전 정지
hub/robots.config.js    # 로봇별 값(유일한 로봇 정보 출처)
hub/robots/{id}.js      # 로봇 SVG + 동작 애니메이션 (animator 담당)
start_hub.bat           # 로컬 서버 실행 후 브라우저 열기
```
모든 스크립트는 classic `<script src>`로 불러온다. ES 모듈과 `fetch()`는 file://에서 막히기 때문이다. 외부 CDN 금지.

## 왜 로컬 서버(같은 출처)인가
허브는 로봇 제어 웹을 **고치지 않고** iframe으로 띄운다. 그런데 iframe 안에서 생긴 클릭·터치는 허브가 직접 볼 수 없고, 로봇을 멈추려면 페이지 안의 정지 버튼·함수를 불러야 한다. 둘 다 허브와 제어 웹이 **같은 출처**일 때만 `iframe.contentWindow`/`contentDocument`로 가능하다. Chrome은 file:// 파일마다 출처를 따로 취급하므로, `통합/`을 루트로 하는 로컬 서버(`http://localhost:8800/`)로 연다. localhost는 보안 컨텍스트라 Web Bluetooth·Web Serial도 동작한다. GitHub Pages(`kgh-dac.github.io`)도 같은 출처를 공유하므로 같은 방식이 통한다.

`start_hub.bat`: `hub/serve.py`(표준 라이브러리만 사용, `127.0.0.1:8800`)를 `python`(없으면 `py`)으로 실행하고 `start http://localhost:8800/` 한다. serve.py는 정적 파일 서버이면서, 로봇 개 제어 웹이 쓰는 상대 경로 API(`/robot_dog/.../robot_control_web/api/*`)를 USB 게이트웨이(`http://127.0.0.1:8787/api/*`, 환경변수 `ROBOTDOG_GATEWAY`로 변경)로 넘기는 프록시다. 로봇 개 페이지는 localhost에서 열리면 게이트웨이 모드로 바뀌어 같은 출처의 `api/`를 부르기 때문이다. 게이트웨이가 꺼져 있으면 502와 JSON 오류를 돌려준다. 프록시 경로 접두사는 하드코딩하지 말고 serve.py 상단 표(`PROXIES`)에 둔다. Chrome/Edge가 아니면 Web Bluetooth가 없다는 안내를 허브 화면에 띄운다.

**대체 모드**: 같은 출처 접근에 실패하면(file:// 등) `hub.js`가 자동으로 "확인 모드"로 바뀐다. 무입력 감지 대신 N분마다 "계속 사용하시나요?" 오버레이를 띄우고, 응답이 없으면 복귀한다. 안전 정지는 iframe 제거(연결 해제)만 가능하다고 화면에 표시한다.

## robots.config.js 규격
```js
window.ROBOTS = [
  { id: 'smars', name: 'SMARS', tagline: '궤도형 모듈 로봇',
    page: 'smars_web/twin/smars_console.html', pagesUrl: null,
    connection: ['ble','serial'],
    stop: {                                   // 인벤토리 값
      steps: [                                // 위에서부터 차례로 시도, 하나 성공하면 다음 단계(disconnect)로
        { call: 'otto.link.stop' },           // 점 경로 전역 함수(win.otto.link.stop), Promise면 await(최대 500ms)
        { selector: '#btnStop', event: 'click', skipIf: '.active' }   // event: click | pointerdown | keydown:Space
      ],
      disconnect: [ { selector: '#btnDisconnect', event: 'click' } ]
    },
    accent: 'var(--c-smars)' },
  // ottobot, robotdog, bike ...
];
window.HUB_CONFIG = { idleMs: 180000, warnMs: 15000, confirmEveryMs: 300000 };
```
- 제어 웹마다 정지 버튼이 반응하는 이벤트가 다르다(SMARS는 `pointerdown`만, 바이크 `#estop`은 토글). 그래서 이벤트 종류와 `skipIf`(요소가 이 선택자에 맞으면 건너뜀)를 설정에 둔다. `pointerdown`은 `new PointerEvent('pointerdown',{bubbles:true})`를 iframe 창의 생성자로 만들어 디스패치한다. `disabled` 요소는 건너뛴다(연결 전이라는 뜻).
- `call`은 점 경로를 `win`에서 따라가 찾는다. `eval` 금지.
- `when: '점 경로'`가 있으면 그 값이 참일 때만 그 단계를 실행한다(예: `otto.link.connected`). 연결 전 호출이 reject되어 잘못된 "정지 확인" 경고가 뜨는 것을 막는다.
- 값은 `_workspace/01_inventory_{id}.json`에서 옮기고 출처를 주석으로 단다.

## 모듈 등록 규격 (animator와의 계약)
```js
window.RobotHub.register({
  id: 'smars',
  mount(el) { /* el 안에 SVG 생성, 정지 상태 */ },
  motions: [ { key: 'forward', label: '전진', ms: 2400, play(t) { /* t: 0..1 진행률 */ } } ],
  destroy() {}
});
```
- 셸이 재생을 주관한다: `requestAnimationFrame` 하나로 4개 구획의 현재 동작 `play(t)`를 부르고, 동작이 끝나면 다음 동작으로 넘기며 자막(`label`)을 바꾼다. 모듈이 자기 타이머를 따로 돌리지 않으므로 4구획 박자가 맞고, 화면이 숨겨지면 한 곳에서 멈출 수 있다.
- `prefers-reduced-motion`이면 각 동작의 `t=0.5` 정지 화면과 자막만 바꾼다.
- 등록 안 된 로봇이 있으면 그 구획에 "준비 중" 카드를 띄우고 나머지는 정상 동작한다.

## 화면 상태
`intro`(4분할) → `control`(선택 로봇) → `intro`.
- **intro**: 2×2 그리드(세로 화면·좁은 폭은 1열). 구획마다 로봇 이름, 한 줄 설명, 연결 방식 배지, 애니메이션 무대, 현재 동작 자막, 동작 목록 점(진행 표시). 구획 전체가 버튼(`role="button"`, Enter/Space, 터치)이다.
- **control**: 상단 고정 바(로봇 이름, "← 처음으로" 버튼, 무입력 남은 시간 표시) + 그 아래 전체 iframe. `allow="bluetooth; serial; usb"`. iframe은 진입 시 생성하고 복귀 시 제거한다(연결이 남지 않게).

## 무입력 자동 복귀
1. 같은 출처면 iframe `load` 후 `contentWindow`에 `pointerdown, keydown, wheel, touchstart, input`을 캡처 단계로 등록하고, 허브 문서에도 같은 이벤트를 등록한다. 입력마다 타이머를 리셋한다. `pointermove`는 리셋하지 않는다(진동·마우스 흔들림으로 영원히 안 끝나는 것을 막는다).
2. `idleMs` 경과 → 경고 오버레이 "15초 후 처음 화면으로 돌아갑니다 [계속 사용]". `warnMs` 동안 입력이 있으면 취소.
3. 경고가 끝나면 **안전 복귀**를 실행한다.
4. `document.hidden`일 때도 타이머는 계속 간다(키오스크 기준).

## 안전 복귀 순서 (나가기 버튼과 자동 복귀 공통)
1. 같은 출처면 `stop.click` 요소 클릭 또는 `stop.call` 함수 호출. 예외는 잡아서 기록만 한다.
2. 200ms 대기(명령 전송 시간) → `stop.disconnect`가 있으면 호출.
3. iframe `src='about:blank'` 후 제거 → intro로 전환, 애니메이션 재개.
4. 1~2단계가 불가능했으면 intro 화면 하단에 3초간 "로봇 정지를 확인하세요" 안내를 띄운다.

## QA 파라미터
`index.html?idleMs=3000&warnMs=1000&robot={id}`을 지원한다. `idleMs`/`warnMs`는 설정값을 덮어쓰고, `robot`은 해당 로봇 control 화면으로 바로 들어간다. 타이머를 몇 분씩 기다리지 않고 시험할 수 있어야 QA가 복귀 흐름을 검증할 수 있다.

## 구현 체크
- 셸 코드에 로봇 id를 하드코딩하지 않는다(설정 순회).
- 키보드만으로 선택·나가기가 된다. Esc = 나가기(확인 없이 안전 복귀).
- 콘솔 오류 0건, 외부 요청 0건.
