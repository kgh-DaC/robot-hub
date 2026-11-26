# 통합 로봇 제어 허브

로봇 4대의 제어 웹을 첫 화면 하나에서 골라 쓰는 허브입니다. 첫 화면은 4칸으로 나뉘어 각 로봇의 생김새와 실제로 구현된 동작을 애니메이션으로 보여 줍니다. 로봇을 고르면 그 로봇의 기존 제어 웹이 열리고, 나갈 때는 로봇을 먼저 멈춘 뒤 첫 화면으로 돌아옵니다.

| 로봇 | 설명 | 연결 | 제어 웹 | 레포 |
| --- | --- | --- | --- | --- |
| SMARS | 두 궤도로 달리는 소형 탱크 로봇 | Web Bluetooth (BLE, 기본), Web Serial (USB) | `smars_web/twin/smars_console.html` | [lecture-SMARS](https://github.com/kgh-DaC/lecture-SMARS) |
| 오토봇 (Otto) | 두 다리로 걷고 춤추는 Otto 로봇 | Web Bluetooth (BLE) | `ottobot/web/index.html` | [ottobot](https://github.com/kgh-DaC/ottobot) |
| 로봇 개 | 네 다리 12관절로 걷는 사족 로봇 | USB 게이트웨이 / Wi-Fi 핫스팟 | `robot_dog/esp32-robot-dog-code-master/software/robot_control_web/index.html` | [robot-dog](https://github.com/kgh-DaC/robot-dog) |
| 셀프 밸런싱 바이크 | 반동 휠로 스스로 서는 두 바퀴 로봇 | Web Bluetooth / Web Serial | `self-balancing-bike_app/web/index.html` | [self-balancing-bike_app](https://github.com/kgh-DaC/self-balancing-bike_app) |

각 로봇 폴더는 git 서브모듈(독립 레포)입니다. 허브는 로봇 폴더를 고치지 않고 제어 웹을 그대로 띄웁니다.

## 사용법

### 온라인
https://kgh-dac.github.io/robot-hub/ 를 **Chrome 또는 Edge**로 엽니다. Web Bluetooth와 Web Serial은 이 두 브라우저에서만 동작합니다.

### 태블릿 (갤럭시 탭 등 안드로이드)
- **Chrome**으로 온라인 주소를 엽니다. 삼성 인터넷은 Web Bluetooth가 없을 수 있습니다.
- 첫 화면의 "전체 화면" 버튼으로 키오스크처럼 쓸 수 있습니다. 제어 중 뒤로 가기(제스처·버튼)는 "← 처음으로"와 같게 로봇을 멈추고 첫 화면으로 돌아갑니다.
- 로봇별로 태블릿에서 되는 연결은 카드에 표시됩니다.
  - SMARS·오토봇·바이크: BLE로 연결됩니다. SMARS는 BLE 모듈(HM-10/HC-08/AT-09 계열)일 때 BLE로 붙고, HC-05(클래식 블루투스)는 태블릿에서 연결할 수 없습니다.
  - 로봇 개: 카드를 누르면 연결 방법이 나옵니다. 태블릿을 로봇 개 Wi-Fi(RobotDog-…)에 연결한 뒤 로봇이 내주는 페이지(http://192.168.4.1)를 엽니다. 이때는 허브의 자동 복귀·자동 정지가 적용되지 않습니다.

### 내 컴퓨터에서 (권장)
```bash
git clone --recurse-submodules https://github.com/kgh-DaC/robot-hub.git
```
1. Python 3을 설치합니다.
2. `start_hub.bat`을 더블클릭합니다. 로컬 서버(`hub/serve.py`, http://localhost:8800/)가 뜨고 Chrome이나 Edge가 열립니다.
3. 서버 창을 닫으면 허브가 멈춥니다.

로봇 개를 USB로 쓰려면 로봇 개 레포의 `usb_gateway.py`를 먼저 켜 둡니다. 허브 서버가 로봇 개 페이지의 `api/` 요청을 게이트웨이(기본 `http://127.0.0.1:8787`, 환경변수 `ROBOTDOG_GATEWAY`로 변경)로 넘깁니다.

### 서버 없이 (index.html 더블클릭)
`start_hub.bat` 없이 `index.html`을 Chrome·Edge로 바로 열어도 SMARS·오토봇·바이크의 **블루투스·USB 시리얼 연결이 됩니다.** 로봇 개는 카드를 누르면 제어 페이지를 새 탭에서 열고, 그 페이지의 "USB 직렬 (브라우저)"로 연결합니다.

이때는 "확인 모드"입니다. 브라우저가 파일끼리의 접근을 막아 허브가 로봇 페이지 안을 볼 수 없으므로 5분마다 계속 사용할지 묻고, 나갈 때 정지 버튼 대신 화면을 닫아(연결 끊기) 로봇을 멈춥니다(각 로봇 펌웨어가 통신이 끊기면 0.5~1.5초 안에 스스로 멈춤). 나갈 때 정지 버튼까지 눌러 주는 완전한 자동 정지는 `start_hub.bat`이나 온라인 주소에서 됩니다.

## 화면 흐름
1. **첫 화면**: 4칸에 로봇별 동작 애니메이션이 나옵니다. 칸을 누르면 그 로봇의 제어 화면으로 들어갑니다.
2. **제어 화면**: 기존 제어 웹이 그대로 뜹니다. 위쪽 바에 "← 처음으로" 버튼과 무입력 카운트다운이 있습니다.
3. **나가기**: "← 처음으로"를 누르거나, 3분 동안 입력이 없으면 15초 경고가 뜬 뒤 자동으로 나갑니다. 경고 중 아무 곳이나 누르면 계속 사용합니다.
4. **안전 정지**: 나가기 전에 허브가 그 로봇 페이지의 정지 버튼을 대신 누르고 연결을 끊습니다. 정지가 로봇에 닿지 않은 것으로 보이면 제어 화면을 남겨 둔 채 경고를 띄웁니다.

5. **펌웨어 업로드**: 제어 화면 위쪽 바의 "펌웨어 업로드"를 누르면 그 로봇의 기본 펌웨어(제어 웹의 시험 항목이 모두 동작하는 펌웨어)를 USB로 올립니다. 누를 때만 올리며 자동 업로드는 없습니다. 순서: 확인(보드·소스 커밋·빌드 날짜, 덮어쓰기 경고) → 로봇 정지·제어 화면 닫기 → USB 포트 고르기 → 리셋·동기화·쓰기·검증 → 결과. 닫으면 제어 화면을 다시 엽니다. 컴퓨터의 Chrome·Edge(Web Serial)에서만 되고 블루투스로는 안 됩니다. 로봇 개는 USB 게이트웨이가 포트를 쥐고 있으면 끄고 올립니다.

무입력 시간과 정지 방법은 `hub/robots.config.js`에서 바꿉니다. 시험용으로 주소에 `?robot=bike&idleMs=5000&warnMs=3000`처럼 붙일 수도 있습니다.

## 로봇 레포 변경 반영
- **내 컴퓨터**: 허브가 로봇 폴더를 직접 띄우므로 고친 내용이 바로 반영됩니다.
- **온라인(GitHub Pages)**: `.github/workflows/pages.yml`이 매시간(그리고 허브 push, 수동 실행, `repository_dispatch` `robot-updated` 때) 각 로봇 레포의 최신 커밋으로 서브모듈을 올리고 다시 배포합니다. 로봇 레포에 **push된 변경만** 반영되며, 최대 1시간 걸립니다. 바로 반영하려면 Actions 탭에서 `pages` 워크플로를 수동 실행합니다.
- 로봇에 새 동작이 추가돼도 첫 화면 애니메이션(`hub/robots/*.js`)은 자동으로 바뀌지 않습니다.
- **펌웨어**: 같은 워크플로가 서브모듈을 올린 뒤 `tools/build_firmware.mjs`로 기본 펌웨어를 다시 빌드해 `hub/firmware/`에 커밋합니다. 스케치 폴더의 마지막 커밋이 그대로인 로봇은 건너뜁니다. 빌드가 실패하면 그 로봇은 이전 펌웨어를 유지하고(대화상자에 표시) 워크플로는 실패로 표시되지만 배포는 계속됩니다. 내 컴퓨터에서는 `build_firmware.bat`(처음은 `build_firmware.bat --install`)로 빌드합니다(arduino-cli·Node.js 필요).

## 주의
- 온라인 허브(https)에서는 로봇 개의 USB 모드가 동작하지 않습니다(로컬 서버 프록시 필요). Wi-Fi 모드도 브라우저의 혼합 콘텐츠(https → http) 차단 때문에 막힐 수 있습니다. 로봇 개는 내 컴퓨터에서 쓰세요.
- 허브의 정지 동작은 화면 자동화로 시험했습니다. **실물 로봇에서 실제로 멈추는지는 사람이 직접 확인해야 합니다.** 로봇마다 펌웨어 failsafe(명령이 끊기면 스스로 멈춤)가 있지만 처음 쓸 때는 전원 스위치를 가까이 두세요.

## 파일 구성
```
index.html, start_hub.bat      허브 진입 화면·실행기
hub/hub.js, hub/hub.css        셸(첫 화면, 제어 화면, 무입력 복귀, 안전 정지)
hub/robots.config.js           로봇별 설정(제어 웹 경로, 연결, 정지 단계)
hub/robots/*.js                로봇별 첫 화면 애니메이션
hub/serve.py                   로컬 서버(같은 출처 실행, 로봇 개 API 프록시)
hub/firmware/                  로봇별 기본 펌웨어 빌드 결과 + manifest.json/.js (자동 생성)
hub/flash/stk500.js            AVR 업로더(STK500v1, Web Serial)
hub/flash/esp32.js, hub/vendor/ ESP32 업로더(esptool-js 번들, 라이선스·버전 포함)
tools/build_firmware.mjs       펌웨어 빌드(로컬·CI 공용), build_firmware.bat 은 Windows 실행기
tools/test_stk500.mjs          AVR 업로더 단위 시험(가짜 부트로더)
tools/vendor-esptool/          esptool-js 번들 다시 만들기(npm)
.github/workflows/pages.yml    서브모듈 최신화 + GitHub Pages 배포
smars_web/ ottobot/ robot_dog/ self-balancing-bike_app/   로봇 서브모듈
HANDOFF.md                     작업 인수 문서(현재 상태, 다음 할 일)
```
