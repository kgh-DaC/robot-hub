# 인수 문서 — 통합 로봇 제어 허브

이 문서만 읽고도 다른 계정·새 세션에서 이어서 작업할 수 있게 유지한다. 작업이 끝날 때마다 갱신한다.

마지막 갱신: 2026-11-26 (허브 완성·게시·Pages 배포 완료)

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

## 3. 로봇별 정보 (자세한 근거는 `_workspace/01_inventory_*.json`)
| 로봇 | 폴더 / 레포 | 제어 웹 | 연결 | 허브가 쓰는 정지 방법 | 펌웨어 failsafe |
| --- | --- | --- | --- | --- | --- |
| SMARS | `smars_web` / kgh-DaC/lecture-SMARS (public) | `smars_web/twin/smars_console.html` | Web Serial 57600 (USB 또는 HC-05 SPP COM) | `button.dp.stop[data-dir="S"]`에 **pointerdown** (click 안 됨) → `#btnDisconnect` | 600ms |
| Otto | `ottobot` / kgh-DaC/ottobot (private, 브랜치 `master`) | `ottobot/web/index.html` | BLE `OTTO2` (FFE0, notify FFE1, write FFE2) | `window.otto.link.stop()` 또는 `#btnStop` → `otto.link.disconnect()` | 1.5s |
| 로봇 개 | `robot_dog` / kgh-DaC/robot-dog (private, `main`) | `robot_dog/esp32-robot-dog-code-master/software/robot_control_web/index.html` (`robot_page.html`은 런처라 안 씀) | localhost에서는 USB 게이트웨이 모드(`api/*`), Wi-Fi 핫스팟 | `#stop` click | 1s 리스, 기울기 20° |
| 바이크 | `self-balancing-bike_app` / kgh-DaC/self-balancing-bike_app (private) | `self-balancing-bike_app/web/index.html` | BLE(FFE0/FFE1, Nordic UART) / Web Serial 9600 | `#estop` click (토글이라 `.active`면 건너뜀) → `#btnDisconnect` | 500ms |

## 4. 설계 핵심 (왜 이렇게 했는가)
- **로봇 폴더는 수정하지 않는다.** 각 폴더에 자기 하네스와 규칙이 있다(예: `smars_web/twin/` 수정 금지). 허브는 제어 웹을 iframe으로 그대로 띄운다.
- **로컬 서버(같은 출처)로 연다.** 그래야 허브가 iframe 안의 입력을 감지하고 정지 버튼을 대신 누를 수 있다. file://로 열면 "확인 모드"(5분마다 계속 사용 여부를 묻기)로 바뀌고, 복귀할 때 iframe 제거(연결 끊김)만 가능하다.
- **로봇 개 API 프록시:** 로봇 개 페이지는 localhost에서 열리면 같은 출처 `api/`를 부른다. `hub/serve.py`가 이 요청을 USB 게이트웨이 `http://127.0.0.1:8787`로 넘긴다(환경변수 `ROBOTDOG_GATEWAY`로 변경). 게이트웨이(`usb_gateway.py`)를 먼저 켜야 USB 모드가 된다. localhost에서는 Web Serial 직접 연결 버튼이 숨겨진다.
- **복귀 순서:** 정지 명령 → (해제) → iframe 제거 → 첫 화면. 정지 방법은 `hub/robots.config.js`의 `stop.steps`에만 둔다.
- **애니메이션은 실제 구현된 동작만** 보여준다(인벤토리 근거 필수).

## 5. 다음 할 일
1. Pages에서 Chrome/Edge로 4대 제어 화면을 열어 보고(BLE·Web Serial 권한 요청), 로봇 개는 로컬 허브로 쓴다.
2. 사람이 실물로 시험: 로봇별로 연결 → 움직이는 중 "← 처음으로" → 실제로 멈추는지. 무입력 3분 자동 복귀, 키오스크 터치스크린에서 경고창 탭 시 아래 버튼이 눌리지 않는지도 확인.
3. (선택) 로봇 레포 push 즉시 반영: 각 로봇 레포에 robot-hub로 `repository_dispatch`(type `robot-updated`)를 보내는 워크플로 + PAT 시크릿 추가. 로봇 폴더 수정이라 각 로봇 하네스에서 한다.

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
