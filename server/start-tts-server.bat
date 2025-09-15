@echo off
echo 🚀 Google Cloud TTS 서버 시작...

REM Google Cloud 인증 파일 경로 설정 (보안을 위해 로컬 디렉토리 사용)
set GOOGLE_APPLICATION_CREDENTIALS=C:\Users\%USERNAME%\AppData\Local\daily-learning-tts\google-tts-key.json

REM 인증 파일 존재 확인
if not exist "%GOOGLE_APPLICATION_CREDENTIALS%" (
    echo ❌ 오류: Google Cloud 인증 파일을 찾을 수 없습니다.
    echo 📁 파일 위치: %GOOGLE_APPLICATION_CREDENTIALS%
    echo 💡 Google Cloud Console에서 서비스 계정 JSON 키를 다운로드하여 위 경로에 저장하세요.
    pause
    exit /b 1
)

echo ✅ 인증 파일 발견: %GOOGLE_APPLICATION_CREDENTIALS%
echo 🌐 TTS 서버 시작 중...

REM Node.js 서버 실행
node tts-api.js

pause