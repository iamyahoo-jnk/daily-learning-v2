# 🌟 Google Cloud TTS 완벽 설정 가이드 (30분 완성)

## 🎯 목표
iOS에서 자연스러운 한국어 여성 음성으로 받아쓰기 서비스 제공

---

## 📋 1단계: Google Cloud 프로젝트 생성 (5분)

### 1.1 Google Cloud Console 접속
👉 **https://console.cloud.google.com/** 접속

### 1.2 프로젝트 생성
1. 상단의 **"프로젝트 선택"** 드롭다운 클릭
2. **"새 프로젝트"** 클릭
3. **프로젝트 이름**: `Daily-Learning-TTS` 입력
4. **"만들기"** 클릭 → 프로젝트 생성 완료 ✅

---

## 🔌 2단계: Text-to-Speech API 활성화 (3분)

### 2.1 API 라이브러리 이동
1. 왼쪽 메뉴에서 **"APIs 및 서비스" > "라이브러리"** 클릭

### 2.2 TTS API 검색 및 활성화
1. 검색창에 **"Text-to-Speech"** 입력
2. **"Cloud Text-to-Speech API"** 클릭
3. **"사용 설정"** 클릭 → API 활성화 완료 ✅

---

## 🔑 3단계: 서비스 계정 키 생성 (7분)

### 3.1 서비스 계정 생성
1. 왼쪽 메뉴에서 **"IAM 및 관리자" > "서비스 계정"** 클릭
2. **"서비스 계정 만들기"** 클릭
3. **서비스 계정 이름**: `tts-service-account` 입력
4. **"만들고 계속하기"** 클릭

### 3.2 역할 부여
1. **역할 선택** 드롭다운에서 검색: `Text-to-Speech`
2. **"Cloud Text-to-Speech 사용자"** 선택
3. **"계속"** → **"완료"** 클릭

### 3.3 JSON 키 다운로드 ⭐ 중요!
1. 생성된 서비스 계정 **이메일 주소 클릭**
2. **"키"** 탭 클릭
3. **"키 추가" > "새 키 만들기"** 클릭
4. **JSON** 선택 → **"만들기"** 클릭
5. **JSON 파일 자동 다운로드** ✅

### 3.4 키 파일 배치
다운로드된 JSON 파일을 다음 위치에 복사:
```
📁 google-tts-demo/
   📄 service-account-key.json ← 여기에 복사
```

---

## 💻 4단계: 서버 설정 (10분)

### 4.1 터미널에서 google-tts-demo 폴더로 이동
```bash
cd "C:\Users\iamya\OneDrive\센소리 앤 브레인 센터\훈련프로그램\앱\9월4일\daily-learning-v2\google-tts-demo"
```

### 4.2 Google TTS 패키지 설치
```bash
npm install @google-cloud/text-to-speech
```

### 4.3 환경변수 설정

**Windows (cmd):**
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=service-account-key.json
```

**Windows (PowerShell):**
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "service-account-key.json"
```

**Mac/Linux:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=service-account-key.json
```

### 4.4 서버 시작
```bash
node real-google-server.js
```

**성공 메시지:**
```
✅ Google Cloud TTS 클라이언트 초기화 성공
🚀 Google Cloud TTS 서버 실행: http://localhost:3001
✅ 실제 Google Cloud TTS 연결됨
🎤 ko-KR-Wavenet-A 여성 음성 사용 가능
```

---

## 🧪 5단계: 테스트 (5분)

### 5.1 서버 상태 확인
브라우저에서 접속: **http://localhost:3001/api/health**

### 5.2 받아쓰기 앱 테스트
1. **받아쓰기 페이지 새로고침**
2. **🌟 Google 여성음성** 버튼 클릭
3. **자연스러운 여성 음성 확인** ✅

### 5.3 iPhone에서 테스트
1. **iPhone Safari로 받아쓰기 페이지 접속**
2. **미션 선택 후 🔊 듣기 버튼** 클릭
3. **Google WaveNet 고품질 여성 음성** 재생 확인 🎉

---

## 💰 비용 정보

### 무료 한도
- **월 100만 문자 무료**
- 받아쓰기 50자 × 2000회 = 100,000자 (**무료 범위 내**)

### 초과 시 요금
- **WaveNet 음성**: $16/100만자
- **Standard 음성**: $4/100만자
- **실제 예상 비용**: 월 $1-2 정도

---

## 🔧 문제 해결

### ❌ "인증 정보를 찾을 수 없음" 오류
**해결**: 환경변수 다시 설정
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=service-account-key.json
```

### ❌ "API 활성화되지 않음" 오류
**해결**: Google Cloud Console에서 Text-to-Speech API 활성화 확인

### ❌ "할당량 초과" 오류
**해결**: Google Cloud Console > APIs > 할당량에서 사용량 확인

---

## 🎉 완료!

**이제 iPhone에서 Google 수준의 자연스러운 한국어 여성 음성을 들을 수 있습니다!**

### 🔄 일상 사용법
1. 터미널에서 `node real-google-server.js` 실행
2. iPhone으로 받아쓰기 앱 접속
3. 🔊 듣기 버튼 → 자동으로 Google TTS 사용

**문제 발생 시 이 문서를 참고하세요!** 📚