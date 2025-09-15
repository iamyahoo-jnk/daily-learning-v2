# Google Cloud Text-to-Speech 설정 가이드

## 🎯 목표
아이폰에서 자연스러운 한국어 음성으로 받아쓰기를 할 수 있도록 Google Cloud TTS 설정

## 📋 설정 순서

### 1. Google Cloud Console 설정
1. **Google Cloud Console 접속**: https://console.cloud.google.com
2. **새 프로젝트 생성** (또는 기존 프로젝트 선택)
   - 프로젝트 이름: `daily-learning-tts` (예시)
3. **Text-to-Speech API 활성화**:
   - 상단 검색바에서 "Text-to-Speech API" 검색
   - 클릭 후 "사용 설정" 버튼 클릭

### 2. 서비스 계정 및 키 생성
1. **IAM 및 관리자 > 서비스 계정** 메뉴 이동
2. **서비스 계정 만들기** 클릭:
   - 서비스 계정 이름: `tts-service-account`
   - 서비스 계정 ID: `tts-service-account`
   - 설명: `Daily Learning TTS Service`
3. **역할 부여**:
   - "Cloud Text-to-Speech API 사용자" 역할 선택
4. **키 생성**:
   - 생성된 서비스 계정 클릭
   - "키" 탭 이동
   - "키 추가" > "새 키 만들기" > "JSON" 선택
   - **JSON 파일 다운로드**

### 3. 인증 파일 배치 (보안 중요!)
⚠️ **보안을 위해 OneDrive가 아닌 로컬 디렉토리에 저장**

다운로드한 JSON 파일을 다음 경로에 저장:
```
C:\Users\[사용자명]\AppData\Local\daily-learning-tts\google-tts-key.json
```

**⚠️ 주의사항**:
- OneDrive, Google Drive 등 클라우드 폴더에 저장 금지
- GitHub 등 코드 저장소에 업로드 금지
- 이메일로 전송 금지

### 4. 서버 실행
Windows에서:
```cmd
start-tts-server.bat
```

또는 직접 실행:
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=credentials\google-tts-key.json
node tts-api.js
```

## 💰 비용 정보
- **무료 할당량**: 월 100만 글자
- **추가 사용**: $4/100만 글자
- **일반적인 학습 사용**: 무료 할당량 내에서 충분

## 🎵 지원 음성
- **ko-KR-Standard-A**: 여성 음성 (기본)
- **ko-KR-Standard-B**: 남성 음성
- **ko-KR-Standard-C**: 남성 음성
- **ko-KR-Standard-D**: 남성 음성
- **ko-KR-Wavenet-A**: 고품질 여성 음성
- **ko-KR-Wavenet-B**: 고품질 남성 음성
- **ko-KR-Wavenet-C**: 고품질 여성 음성
- **ko-KR-Wavenet-D**: 고품질 남성 음성

## 🔧 문제 해결
1. **인증 오류**: JSON 파일 경로 확인
2. **API 오류**: Text-to-Speech API 활성화 확인
3. **네트워크 오류**: 방화벽 및 인터넷 연결 확인

## ✅ 설정 완료 확인
서버가 성공적으로 시작되면:
1. http://localhost:3001/api/health 접속
2. 받아쓰기 앱에서 "Google TTS 테스트" 버튼 클릭