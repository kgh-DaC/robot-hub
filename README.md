# 통합 로봇 제어 허브

로봇 4대의 제어 웹을 첫 화면 하나에서 골라 쓰는 허브입니다. 첫 화면은 4칸으로 나뉘어 각 로봇의 생김새와 실제로 구현된 동작을 애니메이션으로 보여 줍니다. 로봇을 고르면 그 로봇의 기존 제어 웹이 열리고, 나갈 때는 로봇을 먼저 멈춘 뒤 첫 화면으로 돌아옵니다.

| 로봇 | 설명 | 연결 | 제어 웹 | 레포 |
| --- | --- | --- | --- | --- |
| SMARS | 두 궤도로 달리는 소형 탱크 로봇 | Web Serial (USB, HC-05 블루투스 COM) | `smars_web/twin/smars_console.html` | [lecture-SMARS](https://github.com/kgh-DaC/lecture-SMARS) |
| 오토봇 (Otto) | 두 다리로 걷고 춤추는 Otto 로봇 | Web Bluetooth (BLE) | `ottobot/web/index.html` | [ottobot](https://github.com/kgh-DaC/ottobot) |
| 로봇 개 | 네 다리 12관절로 걷는 사족 로봇 | USB 게이트웨이 / Wi-Fi 핫스팟 | `robot_dog/esp32-robot-dog-code-master/software/robot_control_web/index.html` | [robot-dog](https://github.com/kgh-DaC/robot-dog) |
| 셀프 밸런싱 바이크 | 반동 휠로 스스로 서는 두 바퀴 로봇 | Web Bluetooth / Web Serial | `self-balancing-bike_app/web/index.html` | [self-balancing-bike_app](https://github.com/kgh-DaC/self-balancing-bike_app) |

각 로봇 폴더는 git 서브모듈(독립 레포)입니다. 허브는 로봇 폴더를 고치지 않고 제어 웹을 그대로 띄웁니다.

## 사용법

### 온라인
https://kgh-dac.github.io/robot-hub/ 를 **Chrome 또는 Edge**로 엽니다. Web Bluetooth와 Web Serial은 이 두 브라우저에서만 동작합니다.

### 내 컴퓨터에서 (권장)
```bash
git clone --recurse-submodules https://github.com/kgh-DaC/robot-hub.git
```
1. Python 3을 설치합니다.
2. `start_hub.bat`을 더블클릭합니다. 로컬 서버(`hub/serve.py`, http://localhost:8800/)가 뜨고 Chrome이나 Edge가 열립니다.
3. 서버 창을 닫으면 허브가 멈춥니다.

로봇 개를 USB로 쓰려면 로봇 개 레포의 `usb_gateway.py`를 먼저 켜 둡니다. 허브 서버가 로봇 개 페이지의 `api/` 요청을 게이트웨이(기본 `http://127.0.0.1:8787`, 환경변수 `ROBOTDOG_GATEWAY`로 변경)로 넘깁니다.

> `index.html`을 파일로 직접 열면(file://) "확인 모드"로 바뀝니다. 이 모드에서는 5분마다 계속 사용할지 묻고, 나갈 때 정지 명령 없이 화면을 닫는 것(연결 끊기)으로만 로봇을 멈춥니다. 반드시 로컬 서버나 온라인 주소로 여세요.

## 화면 흐름
1. **첫 화면**: 4칸에 로봇별 동작 애니메이션이 나옵니다. 칸을 누르면 그 로봇의 제어 화면으로 들어갑니다.
2. **제어 화면**: 기존 제어 웹이 그대로 뜹니다. 위쪽 바에 "← 처음으로" 버튼과 무입력 카운트다운이 있습니다.
3. **나가기**: "← 처음으로"를 누르거나, 3분 동안 입력이 없으면 15초 경고가 뜬 뒤 자동으로 나갑니다. 경고 중 아무 곳이나 누르면 계속 사용합니다.
4. **안전 정지**: 나가기 전에 허브가 그 로봇 페이지의 정지 버튼을 대신 누르고 연결을 끊습니다. 정지가 로봇에 닿지 않은 것으로 보이면 제어 화면을 남겨 둔 채 경고를 띄웁니다.

무입력 시간과 정지 방법은 `hub/robots.config.js`에서 바꿉니다. 시험용으로 주소에 `?robot=bike&idleMs=5000&warnMs=3000`처럼 붙일 수도 있습니다.

## 로봇 레포 변경 반영
- **내 컴퓨터**: 허브가 로봇 폴더를 직접 띄우므로 고친 내용이 바로 반영됩니다.
- **온라인(GitHub Pages)**: `.github/workflows/pages.yml`이 매시간(그리고 허브 push, 수동 실행, `repository_dispatch` `robot-updated` 때) 각 로봇 레포의 최신 커밋으로 서브모듈을 올리고 다시 배포합니다. 로봇 레포에 **push된 변경만** 반영되며, 최대 1시간 걸립니다. 바로 반영하려면 Actions 탭에서 `pages` 워크플로를 수동 실행합니다.
- 로봇에 새 동작이 추가돼도 첫 화면 애니메이션(`hub/robots/*.js`)은 자동으로 바뀌지 않습니다.

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
.github/workflows/pages.yml    서브모듈 최신화 + GitHub Pages 배포
smars_web/ ottobot/ robot_dog/ self-balancing-bike_app/   로봇 서브모듈
HANDOFF.md                     작업 인수 문서(현재 상태, 다음 할 일)
```
