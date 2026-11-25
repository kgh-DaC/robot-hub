---
name: github-repo-publish
description: 원격 레포가 없는 로봇 프로젝트(현재 ottobot, robot_dog)와 통합 허브 폴더를 GitHub(kgh-DaC 계정)에 새 레포로 올리고, 허브에서 각 로봇을 git 서브모듈로 묶고, 필요하면 GitHub Pages를 켠다. 사용자가 레포 이름·공개 범위를 승인한 뒤 repo-publisher가 사용한다. 이미 원격이 있는 레포에 일반 커밋을 push하는 일상 작업에는 쓰지 않는다.
---

# GitHub 레포 게시

레포 생성·push는 외부 공개 행위라 되돌리기 어렵다. 그래서 승인 → 검사 → 실행 → 기록 순서를 지킨다.

## 0. 승인 확인 (오케스트레이터가 사용자에게 받음)
다음이 모두 프롬프트에 있어야 시작한다. 하나라도 없으면 멈추고 보고한다.
- 대상 폴더와 레포 이름 (기본 제안: `ottobot` → `ottobot`, `robot_dog` → `robot-dog`, 허브 → `robot-hub`)
- 공개 범위 `public` / `private` (Pages를 무료로 쓰려면 public이어야 한다)
- 커밋되지 않은 변경을 커밋할지 여부 (기본: 커밋하지 않음)
- 허브 레포에 로봇을 서브모듈로 묶을지 여부 (기본: 묶음)

## 1. 사전 검사
```bash
bash .claude/skills/github-repo-publish/scripts/secret_scan.sh {폴더}
```
- 비밀 값 패턴(토큰, 비밀번호, Wi-Fi 비밀번호 상수, `.env`)과 50MB 넘는 파일을 찾는다. **추적 대상(git ls-files)** 기준이다.
- 걸리면 push하지 않는다. 파일과 줄을 보고서에 적는다(값 자체는 적지 않는다).
- `.gitignore`에 `_workspace/qa_tmp`, `.pytest_cache`, `settings.local.json`, `node_modules`가 빠졌으면 보고한다(승인 없이 고치지 않는다).

## 2. 로봇 레포 생성 (원격 없는 폴더만)
```bash
cd {폴더}
gh repo create kgh-DaC/{이름} --{public|private} --source . --remote origin --push
```
- `--push`는 현재 브랜치의 HEAD만 올린다. 실행 전 `git branch --show-current`를 기록한다.
- 이미 같은 이름이 있으면(`gh repo view` 성공) 만들지 않고 보고한다.

## 3. 허브 레포
허브(`통합/`)는 로봇 폴더 4개를 서브모듈로 갖는다. 로봇 폴더는 이미 각자 git 저장소이므로 그대로 서브모듈로 등록한다.
```bash
cd 통합
git init -b main     # 아직 저장소가 아니면
git submodule add https://github.com/kgh-DaC/lecture-SMARS.git smars_web   # 폴더가 이미 있으면 아래 방식
```
폴더가 이미 있을 때는 `git submodule add <url> <path>`가 기존 저장소를 그대로 등록한다(`'smars_web' already exists in the index`가 나오면 `git rm --cached` 후 재시도하지 말고 보고). 그 뒤 허브 파일만 커밋한다:
`index.html hub/ start_hub.bat CLAUDE.md .claude/ .gitmodules`. `_workspace/`는 커밋하지 않는다(.gitignore).

## 4. GitHub Pages (선택, 승인 시)
같은 계정의 Pages는 모두 `https://kgh-dac.github.io` 한 출처를 공유한다. 허브와 로봇 레포 모두 Pages를 켜면 허브가 iframe 안 제어 페이지에 같은 출처로 접근할 수 있다(무입력 감지·안전 정지에 필요). 단, 서브모듈은 Pages에서 내용이 풀리지 않으므로 허브의 `robots.config.js`에 `pagesUrl`을 따로 둔다.
```bash
gh api -X POST repos/kgh-DaC/{이름}/pages -f "source[branch]=main" -f "source[path]=/"
```
private 레포는 무료 요금제에서 Pages가 안 된다. 실패하면 보고만 한다.

## 5. 기록
`_workspace/02_publisher_report.md`에 레포별 URL·공개 범위·push 커밋·Pages URL·건너뛴 항목을 표로 적는다. 각 로봇의 `CLAUDE.md`는 고치지 않는다(로봇 하네스 소유).
