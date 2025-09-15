# 🎤 Google Cloud TTS API 설정 가이드

iOS에서 부드러운 여성 음성을 사용하기 위한 Google Cloud TTS API 연동 가이드입니다.

## 📋 설정 단계

### 1. Google Cloud 프로젝트 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. **Text-to-Speech API** 활성화:
   - Navigation menu → APIs & Services → Library
   - "Text-to-Speech API" 검색 후 활성화

### 2. 서비스 계정 키 생성

1. Navigation menu → IAM & Admin → Service Accounts
2. "Create Service Account" 클릭
3. 서비스 계정 이름 입력 (예: `tts-service`)
4. Role 선택: **Basic → Editor** 또는 **Text-to-Speech API → Text-to-Speech Client**
5. "Create and Download JSON key" 선택
6. 다운로드된 JSON 파일을 `server/` 폴더에 저장

### 3. 서버 설정

```bash
# 1. 서버 폴더로 이동
cd server

# 2. 의존성 설치
npm install

# 3. 환경변수 설정 (Windows)
set GOOGLE_APPLICATION_CREDENTIALS=./your-service-account-key.json

# 환경변수 설정 (Mac/Linux)
export GOOGLE_APPLICATION_CREDENTIALS=./your-service-account-key.json

# 4. 서버 시작
npm start
```

### 4. 테스트

서버 실행 후 브라우저에서 다음 URL로 상태 확인:
- http://localhost:3001/api/health
- http://localhost:3001/api/voices

## 💰 비용 정보

Google Cloud TTS API 무료 한도:
- **월 100만 문자까지 무료**
- 초과 시: 100만 문자당 $16.00 (WaveNet) 또는 $4.00 (Standard)

예상 사용량:
- 받아쓰기 문장 평균 50자
- 하루 100회 사용 시: 5,000자/일
- 월 사용량: 약 150,000자 (**무료 한도 내**)

## ⚙️ 설정 옵션

### 음성 설정
- `ko-KR-Standard-A`: 여성 목소리 (기본)
- `ko-KR-Standard-B`: 남성 목소리  
- `ko-KR-Standard-C`: 여성 목소리 (대체)
- `ko-KR-Standard-D`: 남성 목소리 (대체)

### 품질 설정
현재 설정값:
```javascript
voice: 'ko-KR-Standard-A',  // 부드러운 여성 음성
pitch: 2.0,                 // 높은 음조
speakingRate: 1.0,          // 일반 속도
volumeGainDb: 0.0           // 기본 볼륨
```

## 🔄 자동 대체 시스템

1. **1순위**: Google Cloud TTS API (고품질 여성 음성)
2. **2순위**: Web Speech API (브라우저 기본 음성)
3. **오류 처리**: 자동으로 2순위로 전환

## 🚀 서버 배포 (선택사항)

로컬 서버 대신 클라우드 배포:

### Heroku 배포
```bash
# Heroku CLI 설치 후
heroku create your-tts-app
heroku config:set GOOGLE_APPLICATION_CREDENTIALS="$(cat your-service-account-key.json)"
git add .
git commit -m "Add TTS server"
git push heroku main
```

### 배포 후 클라이언트 설정 변경
```javascript
// app.js에서 TTS_SERVER_URL 변경
const TTS_SERVER_URL = 'https://your-tts-app.herokuapp.com';
```

## 📞 지원

문제 발생 시:
1. 서버 로그 확인: `npm start`에서 출력되는 메시지
2. 브라우저 개발자 도구에서 네트워크 탭 확인
3. Google Cloud Console에서 API 사용량 확인

## 📝 주요 파일

- `server/tts-api.js`: TTS API 서버
- `server/package.json`: 서버 의존성
- `modules/dictation/app.js`: 클라이언트 구현
- `server/tts-cache/`: 음성 파일 캐시 폴더 (자동 생성)

이 설정을 통해 iOS에서도 부드러운 여성 음성으로 받아쓰기를 진행할 수 있습니다! 🎉