/* 로봇별 값의 유일한 출처. 셸(hub.js)은 이 배열을 순회만 하고 로봇 이름을 모른다.
 * 값은 _workspace/01_inventory_{id}.json 에서 옮겼고, 각 항목 옆에 출처를 적었다.
 *
 * stop.steps      위에서부터 차례로 시도. 하나 성공하면 나머지는 건너뛰고 disconnect 단계로 간다.
 * stop.disconnect 같은 방식. 비어 있으면 연결 해제는 iframe 제거(페이지 종료)에 맡긴다.
 * step 형식
 *   { selector, event: 'click' | 'pointerdown' | 'keydown:Space', skipIf }  요소가 disabled 이거나 skipIf 에 맞으면 건너뜀
 *   { keydown: 'Space' }                                                   iframe 문서에 키 이벤트 디스패치
 *   { call: 'a.b.c' }                                                      iframe 창에서 점 경로 함수 호출, Promise면 최대 500ms 대기
 *   공통 선택 항목 when: 'a.b.c'                                             iframe 창의 점 경로 값이 거짓이면 건너뜀
 * stop.also      (선택) steps 다음에 성공 여부와 상관없이 모두 실행하는 추가 정지 단계(형식은 step 과 같음)
 * stop.settleMs   해제 단계 뒤 iframe 을 지우기 전 기다리는 시간(페이지가 정지/해제 명령을 다 보내도록)
 * stop.failCheck  (선택) { selector, text } 정지 명령 '도달' 실패 표시. 정지를 보낸 뒤 그 요소 문구가 text(정규식)에 맞으면 실패
 * stop.okCheck    (선택) { selector, text } 도달 확인 표시. 있으면 checkMs 안에 이 문구가 안 보일 때 '미확인'으로 본다
 * stop.offlineCheck (선택) { selector, text } 로봇에 닿는 경로 자체가 없어서 난 실패. failCheck 보다 먼저 보고, 맞으면 경고 없이 토스트만 띄우고 나간다
 * stop.checkMs   (선택) 정지를 보낸 때부터 도달 판정을 기다리는 최대 시간(기본 3000, 최대 10000)
 *   실패/미확인이면 허브는 iframe 을 지우지 않고 "정지 명령이 전달되지 않았을 수 있습니다" 경고를 띄운다.
 *   failCheck/okCheck 가 없는 로봇은 도달을 확인하지 않는다(delivery: unchecked).
 *
 * firmware        (선택) 기본 펌웨어 업로드. 제어 화면 상단 "펌웨어 업로드" 버튼을 눌렀을 때만 올린다(자동 업로드 없음).
 *   빌드 입력(tools/build_firmware.mjs 가 읽는다. 셸은 화면 표시와 업로드 방식만 쓴다)
 *     sketch       스케치 폴더(통합/ 기준). 맨 앞 폴더가 소스 저장소(서브모듈)다.
 *     fqbn         arduino-cli 보드 이름. core 는 '패키지:아키텍처@버전'(CI 와 로컬이 같은 버전을 쓴다)
 *     libraries    라이브러리 매니저에서 설치할 '이름@버전' 목록
 *     libraryDirs  (선택) 추가 --libraries 폴더(통합/ 기준, 소스 저장소 안에 있는 것)
 *     flashLimit   (선택) 이 크기(B)를 넘으면 그 로봇 빌드를 실패로 처리(실측 한도)
 *   업로드(브라우저)
 *     method       'avr'(STK500v1, hub/flash/stk500.js) | 'esp32'(esptool-js, hub/vendor/esptool.bundle.js)
 *     bauds        앞에서부터 시도. avr: 부트로더 baud(동기화 실패 시 다음 값), esp32: 스텁 전송 baud(ROM 접속은 115200)
 *     signature    (avr) 칩 서명 3바이트 hex. 다르면 업로드하지 않는다(보드가 다름)
 *     board        대화상자에 보이는 보드 이름, boardNote 미확인 사항, portHint 포트를 열 수 없을 때 덧붙일 안내
 *   빌드 결과(크기·sha256·소스 커밋·빌드 날짜)는 hub/firmware/manifest.json(.js) 에서 읽는다.
 */
window.ROBOTS = [
  {
    id: 'smars',
    name: 'SMARS',
    tagline: '두 궤도로 달리는 소형 탱크 로봇',
    // 01_inventory_smars.json control_page.path
    page: 'smars_web/twin/smars_console.html',
    pagesUrl: null,
    // 연결 방식(2026-11-26 SMARS 콘솔에 BLE 추가, smars_console.html:10, 336, 767-815):
    //   블루투스 BLE(기본, Web Bluetooth, HM-10/HC-08/AT-09 계열 FFE0 → FFF0 → Nordic UART) → 태블릿에서도 연결 가능
    //   USB 시리얼 57600 / 블루투스 COM(HC-05, 같은 Web Serial 경로) / 시뮬레이션
    connection: ['ble', 'serial'],
    stop: {
      steps: [
        // stop.page_hook: button.dp.stop[data-dir="S"] 는 pointerdown 핸들러만 있음(smars_console.html:1521-1529). 연결 전 disabled.
        // pointerId 1(마우스)을 주는 이유: 핸들러 첫 줄이 setPointerCapture(e.pointerId)라 없는 포인터 id면 예외로 정지 전에 끝난다.
        { selector: 'button.dp.stop[data-dir="S"]', event: 'pointerdown' },
        // 대안: document keydown Space (smars_console.html:1540, 연결 중에만 동작)
        { keydown: 'Space' }
      ],
      // stop.extra_stop_buttons: #btnMZero onclick → stopMHold()(mTimer 의 200ms M 유지 전송 끄기) + M 0 0 (smars_console.html:383, 1580-1583).
      // S 버튼(stopDrive)은 mTimer 를 건드리지 않으므로 따로 누른다. 연결 전 disabled(needs-conn).
      also: [ { selector: '#btnMZero', event: 'click' } ],
      // stop.disconnect_hook: #btnDisconnect onclick(1030) → MOVE S, BUZ 0 0, USW 0, LNW 0, AUTO 0 후 포트 닫기(1039-1048, 최대 약 1.15초)
      disconnect: [ { selector: '#btnDisconnect', event: 'click' } ],
      settleMs: 1200
    },
    // stop.failsafe_detail: 펌웨어 워치독 600ms (AUTO 중 3000ms)
    failsafe: '600ms 무명령 시 자동 정지',
    // 기본 펌웨어: twin/smars_firmware (제어 웹 twin/smars_console.html 의 명령 전체를 처리하는 펌웨어)
    firmware: {
      sketch: 'smars_web/twin/smars_firmware',
      fqbn: 'arduino:avr:uno',
      core: 'arduino:avr@1.8.8',
      libraries: [],
      method: 'avr',
      bauds: [115200, 57600],
      signature: '1e950f',
      board: 'Arduino Uno 호환 (ATmega328P)',
      portHint: ''
    },
    accent: 'var(--c-smars)'
  },
  {
    id: 'ottobot',
    name: '오토봇',
    tagline: '두 다리로 걷고 춤추는 Otto 로봇',
    // 01_inventory_ottobot.json control_page.path
    page: 'ottobot/web/index.html',
    pagesUrl: null,
    // connection.type = ["ble","serial"] (BLE OTTO2 FFE0, USB 9600 보조)
    connection: ['ble', 'serial'],
    stop: {
      steps: [
        // stop.page_hook: #btnStop click(detail 0) → emergencyStop(): 누르고 있던 입력·keepalive 상태를 비우고 link.stop() (bundle.js:2748-2756, 2869-2871)
        // 버튼을 먼저 쓰는 이유: link.stop()만 부르면 페이지의 keepalive 상태가 남는다. 미연결이면 disabled(bundle.js:2715).
        { selector: '#btnStop', event: 'click' },
        // 대안: window.otto.link.stop() (Promise, 미연결이면 reject) (bundle.js:632, 2921)
        // when: 미연결이면 link.stop()이 reject 하므로 연결 중일 때만 부른다(bundle.js:633, link.connected)
        { call: 'otto.link.stop', when: 'otto.link.connected' }
      ],
      disconnect: [
        // stop.disconnect_hook: #btnDisconnect click → releaseAllInputs + link.disconnect() (bundle.js:2897-2900), 연결 중에만 enabled
        { selector: '#btnDisconnect', event: 'click' },
        // 대안: window.otto.link.disconnect() (Promise, 마지막 쓰기를 마친 뒤 끊음) (bundle.js:479)
        { call: 'otto.link.disconnect', when: 'otto.link.connected' }
      ],
      settleMs: 400
    },
    // stop.evidence: config.h:86 MOVE_WATCHDOG_MS 1500
    failsafe: '1.5초 무수신 시 정지',
    // 기본 펌웨어: firmware/otto_fat. ottobot 하네스(otto-firmware compile.py) 기준 FQBN arduino:avr:uno
    // (이 Nano 는 Optiboot, 115200 업로드 확인). Flash 실측 한도 30,720B(넘으면 업로드는 되나 부팅이 멈춤, docs/HANDOVER.md)
    firmware: {
      sketch: 'ottobot/firmware/otto_fat',
      fqbn: 'arduino:avr:uno',
      core: 'arduino:avr@1.8.8',
      libraries: ['OttoDIYLib@13.0.0', 'Servo@1.3.0'],
      flashLimit: 30720,
      method: 'avr',
      bauds: [115200, 57600],
      signature: '1e950f',
      board: 'Arduino Nano 호환 (ATmega328P, Optiboot)',
      portHint: ''
    },
    accent: 'var(--c-ottobot)'
  },
  {
    id: 'robotdog',
    name: '로봇 개',
    tagline: '네 다리 12관절로 걷는 사족 로봇',
    // 01_inventory_robotdog.json control_page.path (robot_page.html 은 meta refresh 런처라 쓰지 않음)
    // localhost 에서 열리면 게이트웨이 모드(conn.mode='usb')가 되어 같은 출처 api/status, api/command 를 부른다(index.html:330,341)
    // → hub/serve.py 의 PROXIES 가 이 경로를 USB 게이트웨이(127.0.0.1:8787)로 넘긴다.
    page: 'robot_dog/esp32-robot-dog-code-master/software/robot_control_web/index.html',
    pagesUrl: null,
    // connection.type = ["serial","wifi"]. 허브(localhost)에서는 USB 게이트웨이 경유
    connection: ['serial', 'wifi'],
    // 이 페이지는 http://localhost 에서만 게이트웨이 모드가 된다(index.html:330). 온라인 허브(https)·태블릿에서는
    // 같은 출처 api/ 가 없어 연결할 수 없고, 로봇 IP(http)는 https 허브 안에서 혼합 콘텐츠로 막힌다.
    // → localOnly: 로컬 허브가 아니면 iframe 대신 offsite 안내(로봇이 직접 내주는 페이지, inventory hosting.modes.robot_served)를 띄운다.
    localOnly: true,
    offsite: {
      title: '로봇 개는 로봇 Wi-Fi로 연결합니다',
      text: '이 화면(온라인 허브·태블릿)에서는 로봇 개에 연결할 수 없습니다. 로봇이 직접 내주는 제어 페이지를 여세요.',
      steps: [
        '로봇 개 전원을 켭니다.',
        '태블릿 Wi-Fi 설정에서 RobotDog-로 시작하는 Wi-Fi에 연결합니다(인터넷 없음 알림이 나오면 연결 유지).',
        '아래 "로봇 페이지 열기"를 누릅니다(새 탭, http://192.168.4.1).'
      ],
      url: 'http://192.168.4.1/',
      label: '로봇 페이지 열기',
      note: '이 방식에서는 허브의 무입력 복귀·자동 정지가 적용되지 않습니다. 다 쓰면 로봇 페이지에서 정지를 누르세요.'
    },
    // 파일로 연 허브(file://): 이 페이지는 file:// 에서 Web Serial 직접 연결을 지원하지만(index.html:333-337),
    // iframe 안이면 자기 Wi-Fi 프레임 안이라고 보고 연결 카드를 숨긴다(index.html:340, 879) → 새 탭에서 직접 연다.
    fileOffsite: {
      title: '로봇 개는 새 탭에서 직접 연결합니다',
      text: '파일로 연 허브에서는 로봇 개 제어 페이지를 새 탭에서 엽니다. 그 페이지의 연결 방식에서 "USB 직렬 (브라우저)"(Web Serial) 또는 "Wi-Fi"를 고르세요.',
      steps: [
        '로봇 개를 USB 케이블로 연결하거나 전원을 켭니다.',
        '아래 "제어 페이지 열기"를 누릅니다(새 탭).',
        '연결 방식에서 "USB 직렬 (브라우저)"를 누르고 포트를 고릅니다. Wi-Fi는 로봇 Wi-Fi(RobotDog-…)에 먼저 연결합니다.'
      ],
      url: 'robot_dog/esp32-robot-dog-code-master/software/robot_control_web/index.html',
      label: '제어 페이지 열기',
      note: '새 탭에서는 허브의 무입력 복귀·자동 정지가 적용되지 않습니다. 다 쓰면 그 페이지에서 정지를 누르고 탭을 닫으세요(펌웨어 1초 리스로도 멈춤).'
    },
    stop: {
      steps: [
        // stop.page_hook_selector: #stop click → stop() → POST api/command cmd=STOP (index.html:150, 1580, 789-794)
        { selector: '#stop', event: 'click' },
        // 대안: document keydown Space/Escape → stop() (index.html:1591-1593)
        { keydown: 'Space' }
      ],
      // 해제 단계 없음(의도적). 게이트웨이 모드의 #usbLink 는 토글(released 면 CONNECT)이고 DISCONNECT 는 정지 확인까지 최대 6초,
      // #cmOff 는 file:// 에서만 보인다. 정지 후에는 펌웨어 리스(1초)가 하트비트가 끊긴 로봇을 비활성화하고,
      // iframe 제거 시 페이지의 pagehide 핸들러가 활성 상태면 STOP 을 한 번 더 보낸다(index.html:1597-1599).
      disconnect: [],
      settleMs: 400,
      // 도달 확인: stop() 은 비동기 POST 라 '보냈다'와 '도달했다'가 다르다. 결과는 #msg 에 쓴다(index.html:166, 760, 789-794).
      //   성공 "정지 명령을 보냈습니다. ..." / 실패 "정지 실패: <error>"(게이트웨이 꺼짐 502 포함), "정지 명령 전송 실패! 즉시 전원을 차단하세요."
      // offlineCheck: 로봇에 닿는 경로 자체가 없어서 난 정지 실패. 경고 대신 토스트만 띄우고 바로 나간다(오케스트레이터 결정 2026-11-25).
      //   근거: 경로가 없으면 이 페이지는 동작 명령(ARM/WALK)도 보낼 수 없었으므로 이 페이지 때문에 움직이는 로봇은 없다.
      //   경로가 중간에 끊겼더라도 하트비트가 끊기면 펌웨어 리스(1초)가 정지·비활성화한다. 경로 없는 상태에서 iframe 을 붙잡아 둬도 할 수 있는 일이 없다.
      //   - gateway_offline: 허브 프록시가 게이트웨이에 접속하지 못함(hub/serve.py 502)
      //   - not_connected: 페이지가 연결 안 함 상태(index.html:765)
      //   - usb_released: 사용자가 게이트웨이 USB 를 놓아 둠 / usb_connecting: 게이트웨이가 아직 핸드셰이크 중(usb_gateway.py:273, 299, 313)
      //   usb_disconnected 는 넣지 않았다. 처음부터 안 열린 경우와 동작 중 끊긴 경우를 구분할 수 없어(usb_gateway.py:282, 315, 347) 경고를 유지한다.
      //   stop() 의 실패 문구는 "정지 실패: " + 오류 코드 그대로다(index.html:791).
      offlineCheck: { selector: '#msg', text: '^정지 실패: (gateway_offline|not_connected|usb_released|usb_connecting)$' },
      // 그 밖의 실패 문구, 또는 checkMs 안에 okCheck 문구가 안 보이면 경고 오버레이(iframe 유지)
      failCheck: { selector: '#msg', text: '정지 실패|정지 명령 전송 실패' },
      okCheck: { selector: '#msg', text: '정지 명령을 보냈습니다' },
      // 프록시가 게이트웨이 접속 거부를 판정하는 데 Windows 에서 약 2초 걸린다
      checkMs: 4000
    },
    // stop.failsafe_detail: LEASE_TIMEOUT_MS 1000
    failsafe: '1초 하트비트 리스',
    // 기본 펌웨어: tools/servoInitPose (robot_control_web 의 WALKHB 등 명령을 처리하는 스케치. software/robot_dog_esp32 아님)
    // 기록 영역: 부트로더 0x1000, 파티션 0x8000, boot_app0 0xe000, 앱 0x10000. 플래시 전체 지우기 안 함(Preferences/EEPROM 유지)
    firmware: {
      sketch: 'robot_dog/esp32-robot-dog-code-master/tools/servoInitPose',
      fqbn: 'esp32:esp32:esp32',
      core: 'esp32:esp32@3.3.12',
      // ESP32_ISR_Servo 는 코어 2.x 에서만 쓴다(servoInitPose.ino:8-10 #if ESP_ARDUINO_VERSION_MAJOR < 3). 코어 3.3.12 빌드에는 안 들어가지만 인벤토리 기준으로 설치는 해 둔다.
      libraries: ['ESP32_ISR_Servo@1.5.0'],
      method: 'esp32',
      chip: 'ESP32',
      bauds: [460800, 115200],
      board: 'ESP32 개발 보드 (ESP32-WROOM, 4MB)',
      portHint: '로봇 개 USB 게이트웨이(usb_gateway.py)나 다른 시리얼 프로그램이 포트를 쥐고 있으면 끄고 다시 시도하세요. 연결이 안 되면 보드의 BOOT 버튼을 누른 채 업로드를 다시 누르세요.'
    },
    accent: 'var(--c-robotdog)'
  },
  {
    id: 'bike',
    name: '셀프 밸런싱 바이크',
    tagline: '반동 휠로 스스로 서는 두 바퀴 로봇',
    // 01_inventory_bike.json control_page.path
    page: 'self-balancing-bike_app/web/index.html',
    pagesUrl: null,
    // connection.type = ["ble","serial"] (HM-10/NUS BLE, USB 9600)
    connection: ['ble', 'serial'],
    stop: {
      steps: [
        // stop.page_hook: #estop click 은 토글(setEstop(!estop), index.html:1001) → 이미 .active 면 건너뜀
        { selector: '#estop', event: 'click', skipIf: '.active' }
      ],
      // stop.disconnect_hook: #btnDisconnect click (index.html:1025), 연결 전 disabled
      disconnect: [ { selector: '#btnDisconnect', event: 'click' } ],
      settleMs: 300
    },
    // stop.evidence: remote.ino 500ms 무수신 시 중립. 페이지도 hidden/pagehide 시 중립 전송(index.html:971-981)
    failsafe: '500ms 무수신 시 중립',
    // 기본 펌웨어: 03.Firmware/self_balancing_bike. ServoTimer2 는 저장소 안 _workspace/lib 를 --libraries 로 쓴다.
    // 보드 종류 미확인: Nano 가정(arduino:avr:nano = 신형 부트로더 115200). 동기화가 안 되면 57600(구형 부트로더)으로 다시 시도한다.
    firmware: {
      sketch: 'self-balancing-bike_app/03.Firmware/self_balancing_bike',
      fqbn: 'arduino:avr:nano',
      core: 'arduino:avr@1.8.8',
      libraries: [],
      libraryDirs: ['self-balancing-bike_app/_workspace/lib'],
      method: 'avr',
      bauds: [115200, 57600],
      signature: '1e950f',
      board: 'Arduino Nano 호환 (ATmega328P)',
      boardNote: '보드 종류를 아직 확인하지 못했습니다(Nano 가정).',
      // HC-05 가 D0/D1(하드웨어 Serial)을 USB 와 같이 쓴다(self_balancing_bike.ino:79 Serial.begin(9600) HC-05 data-mode) → 업로드 응답이 섞일 수 있다
      portHint: 'HC-05 블루투스 모듈이 D0/D1(하드웨어 Serial)에 물려 있어 업로드가 실패하면 블루투스 모듈을 빼고 다시 시도하세요.'
    },
    accent: 'var(--c-bike)'
  }
];

// 사용자 승인값(2026-11-25): 무입력 3분, 경고 15초, 확인 모드 5분마다
window.HUB_CONFIG = { idleMs: 180000, warnMs: 15000, confirmEveryMs: 300000 };
