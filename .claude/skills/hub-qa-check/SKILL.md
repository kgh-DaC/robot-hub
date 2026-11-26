---
name: hub-qa-check
description: 통합 로봇 허브의 검증 절차. 정적 검사 스크립트(check_hub.mjs), 헤드리스 브라우저 실행 검사(콘솔 오류·4분할 캡처·상태 전환), 나가기·무입력 복귀·안전 정지 흐름 검사, 인벤토리↔애니메이션↔설정 경계면 대조, 보고서 형식을 담는다. hub-qa가 허브를 만들거나 고친 뒤마다 사용한다. 개별 로봇 제어 웹 자체의 QA는 각 로봇 폴더 하네스 담당이다.
---

# 허브 QA 절차

결함은 대부분 경계면에서 생긴다: 인벤토리에 없는 동작이 애니메이션에 들어가거나, 설정 경로가 실제 파일과 다르거나, 정지 선택자가 페이지에 없는 경우. 그래서 파일 존재보다 **대조**를 먼저 본다.

## 1. 정적 검사
```bash
node .claude/skills/hub-qa-check/scripts/check_hub.mjs .
```
FAIL 줄을 그대로 보고서에 옮긴다.

## 2. 정지 선택자 실재 확인
각 `robots.config.js`의 `stop.steps`·`stop.disconnect`의 선택자와 함수 경로를 해당 제어 웹 HTML·JS에서 grep해 실제로 있는지 확인한다. 정지 명령 문자열이 로봇 프로토콜 문서(인벤토리 `stop.evidence`)와 같은지도 본다. 없으면 심각도 **높음**(로봇이 멈추지 않을 수 있음).

## 3. 브라우저 실행 검사
로컬 서버를 띄우고(`python -m http.server 8800 --bind 127.0.0.1`, 백그라운드) Edge/Chrome 헤드리스로 확인한다.
```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
  --window-size=1600,900 --screenshot="_workspace/qa_intro.png" http://localhost:8800/
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
  --enable-logging=stderr --v=0 --dump-dom http://localhost:8800/ > _workspace/qa_dom.html
```
- 캡처를 Read로 열어 4구획 통일성(선 굵기, 바닥선, 로봇 크기, 자막 위치)과 실루엣 구분을 눈으로 판단한다.
- 상태 전환·타이머는 `index.html?qa=1&idleMs=3000&warnMs=1000` 같은 QA 파라미터를 셸이 지원하면 그것으로 시험한다. 지원하지 않으면 엔지니어 결함으로 보고한다(시험 불가능한 타이머는 고칠 수 없다).
- 좁은 화면(`--window-size=420,900`)에서 1열로 바뀌는지 캡처한다.
- 검사가 끝나면 서버를 끈다.

흐름 자동 시험: 서버를 띄운 상태에서 `node .claude/skills/hub-qa-check/scripts/flow_cdp.mjs <임시 프로필 폴더> <통합 절대 경로>` (상대 경로 `.`이면 file:// 시나리오가 깨진다) (Edge를 DevTools 프로토콜로 조종해 진입·나가기·자동 복귀·file:// 확인 모드를 시험한다).

정지 도달 판정 시험: `scripts/fake_gateway.py`(항상 ok)·`scripts/fake_gateway_fail.py`(실패 응답)·`scripts/fake_gateway_hang.py`(응답 지연 → unconfirmed)를 띄우고 `ROBOTDOG_GATEWAY`를 그 주소로 준 허브 서버에 대고 `scripts/flow_stop_delivery.mjs`를 돌린다. 게이트웨이가 없으면 offline 토스트, 실패 응답이면 경고 오버레이, ok면 confirmed가 기대값이다.

펌웨어 업로드 시험: `node tools/test_stk500.mjs`(AVR 업로더 단위 시험, 가짜 STK500 부트로더), 서버를 띄운 상태에서 `node .claude/skills/hub-qa-check/scripts/flow_firmware.mjs <임시 프로필> <통합 절대 경로>`(가짜 navigator.serial 로 확인 → 정지·iframe 닫기 → 포트 → 쓰기·검증 → 완료 → iframe 재생성, 포트 사용 중 안내, file:// 로봇 개 안내 대화상자, Web Serial 없음). 실제 포트에는 연결하지 않는다.

그 밖의 스크립트: `flow_focus.mjs`(경고 취소 후 포커스 — **실제 마우스 클릭**(CDP Input.dispatchMouseEvent)으로 시험한다. `el.click()`은 포커스 이동을 재현하지 못한다), `net_check.mjs`(4대 페이지 로드 시 4xx·실패 요청 0건).

## 4. 흐름 검사 (코드 읽기 + QA 파라미터)
| 항목 | 기대 |
| --- | --- |
| 구획 클릭/Enter | 해당 로봇 iframe이 뜨고 상단 바에 이름·처음으로 버튼 |
| 처음으로 / Esc | 정지 → 연결 해제 → iframe 제거 → intro, 애니메이션 재개 |
| 무입력 idleMs | 경고 오버레이 → warnMs 후 안전 복귀 |
| 경고 중 입력 | 복귀 취소, 타이머 리셋 |
| pointermove만 발생 | 타이머 리셋 안 됨 |
| 같은 출처 실패(file://) | 확인 모드로 전환, 화면에 안내 |
| 모듈 하나 누락 | 그 구획만 "준비 중", 나머지 정상 |

## 5. 보고서 (`_workspace/05_qa_report.md`)
```markdown
# 허브 QA 보고서 — {회차}회차 ({날짜})
## 요약: 통과 X / 실패 Y / 사람 확인 Z
## 결함
| # | 심각도 | 담당(animator/engineer) | 내용 | 재현 | 근거 |
## 사람 확인 필요 (실물 로봇)
- 예: ottobot 실물 연결 상태에서 "처음으로" 누르면 실제로 멈추는가
## 이전 회차 결함 처리 여부
```
심각도: **높음** = 로봇 안전·진입 불가, **중간** = 기능 오류, **낮음** = 시각 통일성·문구.
