---
name: robot-inventory
description: 로봇 프로젝트 폴더에서 제어 웹 진입 파일, 연결 방식(BLE/Web Serial/Wi-Fi), 정지 명령과 페이지 내부 정지 함수, 구현된 동작 목록(근거 포함), 로봇 외형, GitHub 레포 상태를 찾아 정해진 JSON으로 정리한다. 통합 허브 제작·갱신 전에 robot-inventory-analyst가 로봇마다 사용한다. 로봇 펌웨어나 제어 웹 자체를 고치는 작업에는 쓰지 않는다(각 로봇 폴더의 자체 하네스 담당).
---

# 로봇 인벤토리 조사

허브는 이 JSON만 보고 화면·애니메이션·정지 로직을 만든다. 그래서 여기 적힌 값이 틀리면 허브 전체가 틀린다. 모든 값에 근거 파일을 붙인다.

## 절차

1. **로봇 하네스 읽기**: `{폴더}/CLAUDE.md`, `HANDOFF.md`, `_workspace/HANDOFF.md`, `docs/`를 먼저 읽는다. 수정 금지 규칙과 현재 상태(미완성 기능, 실물 미시험)를 `constraints`에 옮긴다.
2. **제어 웹 진입 파일 찾기**: `*.html`을 찾되 `_workspace/`, `backup`, `qa_tmp`, `ref/`, `node_modules/`, `teacher/`는 제외한다. CLAUDE.md·README에 "제어 웹"으로 언급된 파일을 우선한다. 경로는 `통합/` 기준 상대 경로로 적는다.
3. **연결 방식**: `navigator.bluetooth`, `navigator.serial`, `WebSocket`, `fetch(` 등을 grep한다. BLE면 서비스·특성 UUID와 기기 이름도 적는다.
4. **정지 방법**: 프로토콜 문서·펌웨어에서 정지 명령(문자열/바이트)을 찾고, 제어 페이지 JS에서 그 명령을 보내는 **전역 함수 또는 버튼**(예: `id="btnStop"`, `window.sendCmd`)과 연결 해제 함수를 찾는다. 허브가 같은 출처(same-origin)에서 이 함수·버튼을 호출해 로봇을 멈춘다. 펌웨어 failsafe(연결 끊김 시 정지) 유무도 적는다.
5. **동작 목록**: 제어 페이지의 버튼·명령표와 펌웨어의 명령 처리부를 대조해 **둘 다 있는 동작**만 `motions`에 넣는다. 각 동작에 `label_ko`(화면 자막), 움직임 설명(어느 부위가 어떻게), 근거 `파일:줄`을 적는다.
6. **외형**: 바퀴/궤도/다리 수, 관절(서보) 위치, 특징 부품(초음파 눈, LED 매트릭스 입, 플라이휠 등)을 `appearance`에 적는다. 사진(`img/`, `assets/`)이 있으면 경로를 적는다.
7. **레포 상태**: `git -C {폴더} remote -v`, `git log -1 --oneline`, `git status --short | wc -l`, 원격이 있으면 `gh repo view {owner/name} --json visibility,url,homepageUrl`.

## 출력 스키마 (`_workspace/01_inventory_{id}.json`)

```json
{
  "id": "smars | ottobot | robotdog | bike",
  "name_ko": "표시 이름",
  "folder": "smars_web",
  "control_page": { "path": "smars_web/twin/smars_console.html", "candidates": [], "evidence": "CLAUDE.md:7" },
  "connection": { "type": ["ble", "serial"], "ble": { "name": null, "service": null, "char": null }, "serial_baud": null, "evidence": [] },
  "stop": {
    "command": "S\\n", "page_hook": "button#stop 클릭 | window.fn() | null",
    "disconnect_hook": null, "firmware_failsafe": true, "evidence": []
  },
  "motions": [ { "key": "forward", "label_ko": "전진", "movement": "두 궤도가 같은 방향으로 회전", "evidence": "파일:줄" } ],
  "appearance": { "locomotion": "tracks | wheels | legs | two-wheel-balance", "legs": 0, "parts": [], "images": [] },
  "repo": { "status": "remote | local-only | none | unknown", "remote_url": null, "visibility": null, "pages_url": null, "head": null, "uncommitted": 0 },
  "constraints": [ "수정 금지 규칙, 미시험 기능 등" ],
  "unknown": [ { "field": "stop.page_hook", "unknown_reason": "..." } ]
}
```

## 판단 기준
- 동작 이름이 펌웨어와 페이지에서 다르면 페이지 표기를 `label_ko`로 쓰고 둘 다 `evidence`에 남긴다.
- 연결 안정화·캘리브레이션 같은 설정 기능은 동작이 아니다. 관람자가 "로봇이 하는 일"로 볼 수 있는 것만 넣는다.
- 현재 알려진 출발점은 `../robot-motion-animation/references/robots.md`에 있다. 그 문서와 실제 코드가 다르면 코드를 따르고 차이를 `unknown`이 아닌 `constraints`에 적는다.
