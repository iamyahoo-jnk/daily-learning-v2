@echo off
echo 🚀 Google Cloud TTS 서버 시작 중...
echo.

REM 의존성 설치 확인
if not exist "node_modules" (
    echo 📦 의존성 설치 중...
    npm install
    echo.
)

REM 실제 Google TTS 서버 시작
echo 🌟 실제 Google Cloud TTS 서버 실행...
node real-google-server.js

pause