# 로봇별 외형·동작 출발점 (2026-11-25 하네스 구축 시 조사)

인벤토리(`_workspace/01_inventory_*.json`)가 이 문서보다 우선한다. 여기는 그리기 시작할 때의 길잡이다.

## SMARS (`smars_web`, 제어 웹 `smars_web/twin/smars_console.html`)
- 외형: 3D 프린트 소형 궤도(탱크)형. 옆모습 = 둥근 사각 궤도 + 바퀴 2개 + 위쪽 몸체, 앞에 초음파 센서 "두 눈", 아래 적외선 라인 센서.
- 하드웨어: L298P 쉴드, 초음파 T=D7/R=D8, 부저 D4, 라인 센서 A2, 블루투스 + USB(57600).
- 동작 후보: 전진, 후진, 좌/우 회전, 부저, 초음파 거리 측정(장애물 앞 정지), 라인 감지. 제어 웹에 D-pad/조이스틱, 3D 트윈, 주행 맵.
- 주의: `twin/`은 원본 `../smars`의 사본이고 수정 금지(smars_web/CLAUDE.md).

## ottobot (`ottobot`, 제어 웹 `ottobot/web/index.html`)
- 외형: Otto DIY Fat 휴머노이드. 네모 머리(정면 LED 매트릭스 입, 초음파 눈), 서보 다리 2개(엉덩이 yaw YL/YR + 발목 roll RL/RR), 팔 서보 2개.
- 연결: BLE `OTTO2`(FFE0 서비스), 9600bps 줄 단위 텍스트 프로토콜. STOP = `S\n`.
- 동작 근거: `ottobot/docs/protocol.md` MOVE id 표 — 전진, 후진, 좌/우 회전, 위아래, 문워크, 스윙, 크루사이토, 점프, 날갯짓, 까치발 스윙, 굽히기, 다리 흔들기, 떨기, 상승 회전. GESTURE(Happy, Wave, Victory …), SING, MOUTH, ARMS.
- 그리는 법: 정면 모습이 특징적(매트릭스 입). 걸음은 발목 roll로 몸 기울기 + 엉덩이 yaw로 발 앞뒤 표현.

## 로봇 개 (`robot_dog`, 제어 웹 `robot_dog/robot_page.html` 또는 `esp32-robot-dog-code-master/software/robot_control_web/index.html`)
- 외형: ESP32 4족 보행(Spot Micro 계열). 다리 4개 × (어깨·윗다리·아랫다리) 3관절, 직육면체 몸통, INA219 전력 센서, IMU 자세 안정화.
- 연결: ESP32 Wi-Fi(핫스팟 모드) 또는 USB 게이트웨이. 인증된 원격 보행 제어.
- 동작 후보: 서기/앉기, 걷기(트롯), 몸 기울이기(roll/pitch), 수평 유지. 인벤토리로 확정할 것.
- 주의: 실물 동작 명령은 사람 승인 대상(robot_dog 루프 훅). 허브는 동작을 보내지 않고 페이지만 띄운다.

## 셀프 밸런싱 바이크 (`self-balancing-bike_app`, 제어 웹 `self-balancing-bike_app/web/index.html`)
- 외형: 2륜 자전거. 뒷바퀴 구동, 앞바퀴 조향 서보, 중앙 반동 휠(플라이휠)로 좌우 균형.
- 연결: Web Bluetooth / Web Serial(기본 9600), STX…ETX 프레임, 조이스틱 `J x y`, 펌웨어 failsafe 있음.
- 동작 후보: 제자리 균형(플라이휠 회전 + 차체 미세 기울기), 전진/후진, 좌/우 조향, 캘리브레이션 상태 표시(동작 아님).
- 그리는 법: 옆모습 + 뒤에서 본 미니뷰(기울기 표현)를 미니맵 원 자리에 쓴다.
