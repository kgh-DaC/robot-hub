#!/usr/bin/env bash
# 사용: secret_scan.sh <git 저장소 폴더>
# git이 추적하는 파일에서 비밀 값 의심 패턴과 50MB 초과 파일을 찾는다. 값은 출력하지 않고 파일:줄만 출력한다.
set -u
DIR="${1:?폴더를 지정하세요}"
cd "$DIR" || exit 2
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "NOT_GIT $DIR"; exit 2
fi
FOUND=0
PATTERN='(gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|(password|passwd|pwd|secret|token|api[_-]?key)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{4,}|WIFI_PASS[A-Z_]*[[:space:]]*["=])'
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.png|*.jpg|*.jpeg|*.gif|*.stl|*.3mf|*.apk|*.zip|*.pptx|*.docx|*.pdf) ;;
    *) grep -nIiE "$PATTERN" -- "$f" 2>/dev/null | cut -d: -f1 | while read -r ln; do echo "SECRET? $f:$ln"; done ;;
  esac
  case "$(basename "$f")" in .env|.env.*|credentials*.json|settings.local.json) echo "SENSITIVE_FILE $f";; esac
  sz=$(wc -c <"$f" 2>/dev/null || echo 0)
  [ "$sz" -gt 52428800 ] && echo "LARGE $f $sz"
done < <(git ls-files)
echo "SCAN_DONE $DIR"
