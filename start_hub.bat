@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "HUB_URL=http://localhost:8800/"

rem --- Python 찾기 (python, 없으면 py) ---
set "PY="
python -c "import sys" >nul 2>nul && set "PY=python"
if not defined PY (
  py -3 -c "import sys" >nul 2>nul && set "PY=py -3"
)
if not defined PY (
  echo [허브] Python 3 이 필요합니다. https://www.python.org 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

rem --- 로컬 서버 (별도 창, 창을 닫으면 서버 종료) ---
start "Robot Hub Server" %PY% hub\serve.py
timeout /t 1 /nobreak >nul

rem --- Chrome, 없으면 Edge, 둘 다 없으면 기본 브라우저 (Web Bluetooth/Serial 은 Chrome/Edge 전용) ---
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>nul && (start "" chrome "%HUB_URL%" & goto :done)
reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>nul && (start "" chrome "%HUB_URL%" & goto :done)
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" >nul 2>nul && (start "" msedge "%HUB_URL%" & goto :done)
start "" "%HUB_URL%"

:done
echo [허브] %HUB_URL% 을 열었습니다. 서버 창을 닫으면 허브가 멈춥니다.
echo [허브] 로봇 개를 USB 로 쓰려면 usb_gateway.py 도 실행하세요(127.0.0.1:8787).
endlocal
