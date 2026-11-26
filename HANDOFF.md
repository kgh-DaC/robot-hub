# 인수 문서 — 통합 로봇 제어 허브

이 문서만 읽고도 다른 계정·새 세션에서 이어서 작업할 수 있게 유지한다. 작업이 끝날 때마다 갱신한다.

마지막 갱신: 2026-11-26 (펌웨어 선택 업로드, SMARS BLE, 전체 화면 버튼 위치)

## 1. 한눈에 보기
- **목표:** 첫 화면을 4칸으로 나눠 로봇 4대(SMARS, Otto, 로봇 개, 셀프 밸런싱 바이크)의 생김새와 동작을 애니메이션으로 보여준다. 로봇을 고르면 기존 제어 웹으로 들어가고, "← 처음으로" 버튼이나 무입력 3분(+경고 15초) 뒤 로봇을 멈추고 첫 화면으로 돌아온다.
- **실행:** `start_hub.bat` 더블클릭 → `hub/serve.py`가 `http://localhost:8800/`을 띄우고 브라우저를 연다. Chrome/Edge를 쓴다(Web Bluetooth·Web Serial).
- **하네스:** 허브 작업은 `robot-hub-orchestrator` 스킬로 한다(`CLAUDE.md` 참고). 개별 로봇 기능 수정은 각 로봇 폴더의 하네스로 한다.

## 2. 현재 상태
| 항목 | 상태 |
| --- | --- |
| 하네스 구축(에이전트 5, 스킬 6) | 완료 |
| 로봇 4대 인벤토리 조사 | 완료 (`_workspace/01_inventory_*.json`) |
| 애니메이션 모듈 `hub/robots/*.js` | 완료 |
| 허브 셸 `index.html`, `hub/*`, `start_hub.bat` | 완료 |
| QA | 3회차 + 메인 재검증 완료, 남은 결함 없음 (`_workspace/05_qa_report.md`) |
| 허브 레포 | https://github.com/kgh-DaC/robot-hub (public), 로봇 4개 서브모듈 |
| 로봇 레포 공개 | lecture-SMARS·ottobot·robot-dog·self-balancing-bike_app 모두 public (2026-11-26) |
| GitHub Pages | https://kgh-dac.github.io/robot-hub/ 배포 완료(Actions 소스). index·제어 웹 4개·모듈 200 확인 |
| 로봇 변경 자동 반영 | `.github/workflows/pages.yml`: push·매시간·수동·repository_dispatch(robot-updated) 때 서브모듈을 각 레포 최신으로 올리고 재배포 |
| 실물 로봇 정지 시험 | 미시험 (사람이 해야 함) |
| 펌웨어 선택 업로드 | 완료(제어 화면 '펌웨어 업로드' 버튼, Web Serial+USB, AVR STK500·ESP32 esptool-js 0.7.1). 가짜 시리얼 시험만, **실물 업로드 미시험** |
| 펌웨어 자동 빌드 | `pages.yml` sync 잡: 서브모듈 갱신 → `tools/build_firmware.mjs`(스케치 폴더 커밋+빌드 설정 해시가 같으면 건너뜀) → `hub/firmware/` 커밋. 로컬은 `build_firmware.bat` |

## 3. 로봇별 정보 (자세한 근거는 `_workspace/01_inventory_*.json`)
| 로봇 | 폴더 / 레포 | 제어 웹 | 연결 | 허브가 쓰는 정지 방법 | 펌웨어 failsafe |
| --- | --- | --- | --- | --- | --- |
| SMARS | `smars_web` / kgh-DaC/lecture-SMARS (public) | `smars_web/twin/smars_console.html` | **BLE 기본**(Web Bluetooth, HM-10 계열 FFE0/FFF0/Nordic) / Web Serial 57600 (USB). 블루투스 COM(HC-05)은 2026-11-26 삭제 | `button.dp.stop[data-dir="S"]`에 **pointerdown** (click 안 됨) → `#btnDisconnect` | 600ms |
| Otto | `ottobot` / kgh-DaC/ottobot (public, 브랜치 `master`) | `ottobot/web/index.html` | BLE `OTTO2` (FFE0, notify FFE1, write FFE2) | `window.otto.link.stop()` 또는 `#btnStop` → `otto.link.disconnect()` | 1.5s |
| 로봇 개 | `robot_dog` / kgh-DaC/robot-dog (public, `main`) | `robot_dog/esp32-robot-dog-code-master/software/robot_control_web/index.html` (`robot_page.html`은 런처라 안 씀) | localhost에서는 USB 게이트웨이 모드(`api/*`), Wi-Fi 핫스팟 | `#stop` click | 1s 리스, 기울기 20° |
| 바이크 | `self-balancing-bike_app` / kgh-DaC/self-balancing-bike_app (public) | `self-balancing-bike_app/web/index.html` | BLE(FFE0/FFE1, Nordic UART) / Web Serial 9600 | `#estop` click (토글이라 `.active`면 건너뜀) → `#btnDisconnect` | 500ms |

## 4. 설계 핵심 (왜 이렇게 했는가)
- **태블릿(안드로이드 Chrome):** 카드마다 이 기기에서 되는 연결을 기능 감지(`'bluetooth'/'serial' in navigator`)로 표시. 로봇 개는 `localOnly`라 로컬 허브 밖에서는 iframe 대신 로봇 Wi-Fi 페이지(http://192.168.4.1) 안내(`offsite`)를 띄운다(https 허브에서 http 로봇 IP는 혼합 콘텐츠로 막힘). 안드로이드 뒤로 가기는 history 항목으로 잡아 "처음으로"와 같이 안전 정지 후 복귀, 당겨서 새로고침 차단(overscroll-behavior), 전체 화면 버튼.
- **SMARS BLE (2026-11-26):** 제어 웹에 '블루투스 BLE'(기본) 추가, 펌웨어는 그대로(BLE 모듈이 투명 UART). 이 PC의 `SMARS01`은 클래식(BTHENUM)으로 등록돼 있어, 모듈이 진짜 HC-05면 BLE 목록에 안 나온다 → BLE 모듈(HM-10 계열, Otto의 OTTO2와 같은 종류)로 바꾸면 태블릿에서도 쓸 수 있다. 실물 미확인.
- **로봇 폴더는 수정하지 않는다.** 각 폴더에 자기 하네스와 규칙이 있다(예: `smars_web/twin/` 수정 금지). 허브는 제어 웹을 iframe으로 그대로 띄운다.
- **로컬 서버(같은 출처)로 연다.** 그래야 허브가 iframe 안의 입력을 감지하고 정지 버튼을 대신 누를 수 있다. file://로 열면 "확인 모드"(5분마다 계속 사용 여부를 묻기)로 바뀌고, 복귀할 때 iframe 제거(연결 끊김)만 가능하다. 블루투스·시리얼 연결 자체는 file://에서도 된다(iframe `allow`를 `*`로 위임, 로봇 개는 새 탭).
- **로봇 개 API 프록시:** 로봇 개 페이지는 localhost에서 열리면 같은 출처 `api/`를 부른다. `hub/serve.py`가 이 요청을 USB 게이트웨이 `http://127.0.0.1:8787`로 넘긴다(환경변수 `ROBOTDOG_GATEWAY`로 변경). 게이트웨이(`usb_gateway.py`)를 먼저 켜야 USB 모드가 된다. localhost에서는 Web Serial 직접 연결 버튼이 숨겨진다.
- **복귀 순서:** 정지 명령 → (해제) → iframe 제거 → 첫 화면. 정지 방법은 `hub/robots.config.js`의 `stop.steps`에만 둔다.
- **애니메이션은 실제 구현된 동작만** 보여준다(인벤토리 근거 필수).

## 5. 다음 할 일
0. 펌웨어 업로드 실물 확인: SMARS CH340이 115200(Uno 부트로더) 업로드 되는지, Otto 30,558B(한도 30,720B, 여유 162B) 부팅, 로봇 개 ESP32 자동 리셋(안 되면 BOOT 버튼)·설정 유지, 바이크(Nano 확인, 부트로더 신형/구형 자동 재시도)·HC-05(D0/D1) 단 채 업로드 가능 여부. GitHub Actions 첫 빌드 결과 확인.
1. Pages에서 Chrome/Edge로 4대 제어 화면을 열어 보고(BLE·Web Serial 권한 요청), 로봇 개는 로컬 허브로 쓴다.
2. 갤럭시 탭 실기기 확인: Chrome으로 온라인 허브 → 오토봇·바이크 BLE 연결, 뒤로 가기 제스처 시 정지·복귀, 로봇 개 Wi-Fi 안내 흐름. 삼성 인터넷은 Web Bluetooth 없을 수 있음.
3. 사람이 실물로 시험: 로봇별로 연결 → 움직이는 중 "← 처음으로" → 실제로 멈추는지. 무입력 3분 자동 복귀, 키오스크 터치스크린에서 경고창 탭 시 아래 버튼이 눌리지 않는지도 확인.
4. (선택) 로봇 레포 push 즉시 반영: 각 로봇 레포에 robot-hub로 `repository_dispatch`(type `robot-updated`)를 보내는 워크플로 + PAT 시크릿 추가. 로봇 폴더 수정이라 각 로봇 하네스에서 한다.

## 6. 미해결·주의
- 로봇 레포 변경은 **push된 커밋만** Pages에 반영된다(최대 1시간 지연). 로컬 허브는 폴더를 직접 띄우므로 즉시 반영. 로봇에 새 동작이 생기면 첫 화면 애니메이션은 자동으로 안 바뀐다(인벤토리·애니메이터 재실행).
- Pages(https)에서는 로봇 개 USB 모드(serve.py 프록시 필요)가 안 되고, Wi-Fi 모드도 혼합 콘텐츠(https→http) 차단으로 안 될 가능성이 높다. 로봇 개는 로컬 허브로 쓴다.
- 예약 워크플로는 레포에 60일간 활동이 없으면 GitHub가 멈춘다.
- `robot_dog/tools/servoInitPose/web_control.ino:78`의 로봇 핫스팟 고정 비밀번호(약한 숫자열)는 사용자 승인 하에 public으로 공개됐다. 바꾸려면 로봇 개 하네스에서 펌웨어 값을 바꾼다.
- ottobot·robot_dog `.gitignore`에 `_workspace/qa_tmp`, `node_modules` 등이 빠져 있다(각 로봇 하네스에서 처리).
- ottobot·robot_dog에 커밋 안 된 변경이 있다(각 로봇 작업자의 진행 중 작업). 레포에는 올라가지 않았다.
- `self-balancing-bike_app/.claude/skills/bike-protocol`은 보드레이트(115200→실제 9600)·failsafe(없음→실제 있음) 서술이 낡았다(바이크 하네스에서 수정).
- 로봇 개: 좌/우가 제자리 회전인지 곡선 보행인지 실물 확인 필요. 기존 보드 I2C SCL(GPIO22) 문제로 IMU 미검출.
- Otto: 초음파 센서 무응답, 하드웨어 시험 진행 중.

## 7. 파일 지도
```
통합/
├── index.html, start_hub.bat          허브 진입·실행기
├── hub/  hub.js hub.css robots.config.js serve.py robots/{smars,ottobot,robotdog,bike}.js
├── CLAUDE.md                           하네스 호출 조건·변경 이력
├── HANDOFF.md                          이 문서
├── .claude/agents/, .claude/skills/    하네스 (오케스트레이터: robot-hub-orchestrator)
├── _workspace/                         중간 산출물(인벤토리, 보고서) — git 제외
└── smars_web/ ottobot/ robot_dog/ self-balancing-bike_app/   로봇별 독립 저장소
```

## 8. 변경 기록
| 날짜 | 내용 |
| --- | --- |
| 2026-11-25 | 하네스 구축, 인벤토리 4대, ottobot·robot-dog private 레포 게시, 허브 제작 시작 |
| 2026-11-26 | QA 3회차(결함 #6·#9 수정, #10 터치 관통 수정·재검증), robot-hub public 게시·서브모듈 4개, 로봇 레포 3개 public 전환, Pages(Actions)+서브모듈 자동 최신화 워크플로 추가 — 첫 배포는 GitHub 장애로 실패 |
| 2026-11-26 | Pages 배포 실패 원인: GitHub 장애 + 구버전 액션(deploy-pages@v4·upload-pages-artifact@v3에서 artifact 조회 실패). configure-pages@v6·upload-pages-artifact@v5·deploy-pages@v5로 올려 배포 성공. README 추가 |
| 2026-11-26 | 갤럭시 탭 대응(카드별 연결 가능 표시, 로봇 개 offsite 안내, 뒤로 가기=안전 복귀, 새로고침 방지, 전체 화면, 세로 2x2). 태블릿 에뮬레이션으로 로컬·Pages 검증 |
| 2026-11-26 | (ottobot 폴더 작업) Otto 제어 웹 하단에 핀 연결 카드 추가(`ottobot/web/js/ui-pins.js`). ottobot에서 커밋·push해야 Pages에 반영 |
| 2026-11-26 | (ottobot 폴더 작업) 멈춰 있을 때 터치 → 기쁨 제스처 + HELLO(펌웨어·웹·데모). 펌웨어 업로드 대기, 허브 첫 화면 애니메이션은 그대로 |
| 2026-11-26 | BAT 없이(index.html 더블클릭, file://) 블루투스·시리얼: iframe 권한 정책 'src'가 불투명 출처(null)와 맞지 않아 막혀 있었음 → file://에서 `allow="bluetooth *; serial *; usb *"`. 로봇 개는 iframe 안이면 연결 카드를 숨겨 `fileOffsite`(새 탭 직접 열기) 추가. 안내 문구·README·hub-shell 스킬 갱신. 헤드리스 Edge로 file://·Pages 모두 4개 iframe serial/bluetooth 허용 확인, check_hub 123/123. 같은 날 Otto 펌웨어(터치 인사) COM10 업로드·부팅·PING 확인 |
| 2026-11-26 | 첫 화면 왼쪽 위에 학교 로고(`hub/img/logo.png`, ball_and_beam 교재 웹과 같은 파일) + 'Dept. Mechanical System', '로봇을 선택하세요' 문구 삭제. 폭 1000px 이하에서는 로고 줄이 제목 위로. check_hub 124/124, 1600×900·800×1280 캡처 확인. Otto 터치 인사는 사용자 요청으로 '기쁨 제스처 → HELLO → 원위치'로 되돌려 재업로드 |
| 2026-11-26 | push: ottobot `ece9b4a`(터치 인사·핀 카드·그동안 커밋 안 된 BLE/펌웨어 작업 포함), robot-hub `8e93517`. Pages 첫 배포는 GitHub 일시 오류(deploy 단계)로 실패 → 수동 실행으로 성공, 로고·hub.js·ottobot 번들 200 확인. robot_dog 미커밋 작업은 건드리지 않음 |
| 2026-11-26 | 상태 점검: Pages 예약 배포 성공·주요 파일 200, 로봇 레포 4개 모두 public 확인 → 3절 표의 private 표기 정정. 남은 일은 실물·실기기 시험(사람)과 로봇 레포 dispatch(로봇 하네스) |
| 2026-11-26 | **펌웨어 선택 업로드**: 로봇 제어 화면 상단 '펌웨어 업로드' → 덮어쓰기 경고 → 안전 정지·iframe 제거 → 포트 선택 → 쓰기·검증 → iframe 재로드. 펌웨어(제어 웹 항목 전부 지원): smars `twin/smars_firmware`(uno), ottobot `firmware/otto_fat`(uno=Optiboot, 한도 30,720B), robotdog `tools/servoInitPose`(esp32, robot_dog_esp32 아님), bike `03.Firmware/self_balancing_bike`(nano 가정, ServoTimer2는 bike `_workspace/lib`). 무입력 타이머는 실제 쓰기 중에만 멈춤(QA #11 수정). CI 자동 빌드. 시험: test_stk500 27/27, flow_firmware 46/46, check_hub 163/163. ESP32 링커가 한글 경로에서 실패 → 빌드 폴더는 %TEMP%
obot-hub-fwbuild |
| 2026-11-26 | SMARS 제어 웹에 블루투스 BLE(기본) 추가(smars_web 폴더, 사용자 승인으로 twin/ 1회 예외), 허브 smars connection ['ble','serial']. 첫 화면 전체 화면 버튼을 첫 줄 오른쪽으로 |
| 2026-11-26 | CI 펌웨어 빌드 실측: 수동 실행 옵션 `force_firmware` 추가 → Actions에서 4대 모두 빌드 성공(smars 10,930B, ottobot 30,558/30,720B, robotdog 1,142,559B, bike 10,762B), 봇 커밋 584fe8b, Pages 배포 성공. 이후 로봇 소스(스케치 폴더) 커밋이 바뀔 때만 자동 재빌드 |
| 2026-11-26 | 바이크 보드 Nano 확인(사용자). 바이크 제어 웹 하단에 핀 연결 카드 추가(self-balancing-bike_app `ff879cb`, PCB 회로도 `Downloads/새 폴더/open source balance bike/04.SCH/SCH.pdf` 기준). 확인된 펌웨어↔PCB 차이: 배터리 분배 전압은 PCB A0인데 원본 코드는 A7(현 펌웨어는 미사용), D10은 PCB에서 360° 뒷바퀴 서보, D5(DIRM) 커넥터 없음 |
| 2026-11-26 | 바이크 핀 카드 정정: 제작 PCB 레포 `kgh-DaC/self-balancing-bike_pcb`(private) 기준. FlyWheel 1 VIN(나노 쪽) … 8 B로 원본 SCH와 반대, 엔코더 A=D3·B=D2, U2 TPS563201 3A, 역접속 보호 없음. 이전 카드의 FlyWheel 번호·엔코더 A/B는 틀렸었음 |
| 2026-11-26 | 바이크 핀 카드: 나노 그림 옆에 제작 PCB 윗면 그림(실척, 커넥터 핀 번호·신호) 추가 |
| 2026-11-26 | 바이크 핀 카드: 별도 나노 그림 삭제(사용자 요청), PCB 윗면 그림 하나로 표시 |
| 2026-11-26 | SMARS 콘솔 '블루투스 COM (HC-05)' 연결 방식 삭제(smars_web, 사용자 요청). 허브 config 주석·README 맞춤 |
