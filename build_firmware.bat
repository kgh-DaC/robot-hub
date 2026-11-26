@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
rem 로봇별 기본 펌웨어를 이 PC 에서 빌드한다(CI 와 같은 스크립트: tools\build_firmware.mjs).
rem 처음 한 번은 build_firmware.bat --install 로 코어·라이브러리(robots.config.js 에 고정된 버전)를 설치한다.
rem 인자는 그대로 넘긴다: --install --force --only smars,bike --allow-dirty
where node >/dev/null 2>/dev/null || (echo Node.js 가 필요합니다. https://nodejs.org 에서 설치하세요. & pause & exit /b 1)
where arduino-cli >/dev/null 2>/dev/null || (echo arduino-cli 가 필요합니다. & pause & exit /b 1)
node tools\build_firmware.mjs %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" echo 빌드 실패가 있습니다. 위 표를 확인하세요.
pause
exit /b %RC%
