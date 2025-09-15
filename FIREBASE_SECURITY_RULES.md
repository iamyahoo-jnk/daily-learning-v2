# Firebase 보안 규칙 설정

이 앱은 교사가 학생 계정을 생성하고 관리하는 시스템입니다. 다음 Firebase 보안 규칙을 적용해야 합니다.

## Firestore 보안 규칙

Firebase Console > Firestore Database > 규칙 탭에서 다음 규칙을 설정하세요:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자 인증 확인 함수
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // 교사 계정 확인 함수 
    function isTeacher() {
      return isAuthenticated() && 
        (request.auth.token.email.matches('.*@gmail.com') || 
         request.auth.token.email.matches('.*@naver.com'));
    }
    
    // 학생 계정 확인 함수
    function isStudent() {
      return isAuthenticated() && 
        request.auth.token.email.matches('.*@id.local');
    }
    
    // 본인 계정 확인 함수
    function isOwner(uid) {
      return isAuthenticated() && request.auth.uid == uid;
    }

    // roster 컬렉션 - 학생 목록 (교사만 읽기/쓰기)
    match /roster/{studentId} {
      allow read, write: if isTeacher();
    }
    
    // users 컬렉션 - 사용자별 데이터
    match /users/{userId} {
      // 교사는 모든 사용자 데이터에 접근 가능
      // 학생은 자신의 데이터만 접근 가능
      allow read, write: if isTeacher() || isOwner(userId);
      
      // assignments 하위 컬렉션 - 과제 할당
      match /assignments/{assignmentId} {
        allow read: if isTeacher() || isOwner(userId);
        allow write: if isTeacher();
      }
      
      // submissions 하위 컬렉션 - 과제 제출
      match /submissions/{submissionId} {
        allow read: if isTeacher() || isOwner(userId);
        allow write: if isOwner(userId);
      }
    }
  }
}
```

## Firebase Authentication 설정

Firebase Console > Authentication에서 다음을 설정하세요:

### 1. 로그인 방법
- **이메일/비밀번호**: 활성화

### 2. 사용자 관리
- 교사는 Firebase Console에서 수동으로 계정을 생성하거나, 앱의 교사 콘솔에서 생성
- 학생 계정은 교사 콘솔에서만 생성 가능

### 3. 도메인 제한 (선택사항)
- Settings > Authorized domains에서 허용할 도메인 설정

## 보안 규칙 설명

### 1. roster 컬렉션
- 교사만 학생 목록을 읽고 쓸 수 있음
- 학생 추가/삭제는 교사만 가능

### 2. users/{userId} 컬렉션
- 교사는 모든 학생의 데이터에 접근 가능
- 학생은 자신의 데이터만 접근 가능

### 3. assignments 하위 컬렉션
- 교사만 과제를 할당할 수 있음
- 학생은 자신의 과제만 읽을 수 있음

### 4. submissions 하위 컬렉션
- 학생은 자신의 제출물만 작성할 수 있음
- 교사는 모든 학생의 제출물을 읽을 수 있음

## 계정 구조

### 교사 계정
- 이메일: `teacher@gmail.com`, `teacher@naver.com` 등
- 권한: 모든 데이터 읽기/쓰기, 학생 계정 생성/삭제

### 학생 계정
- 이메일: `student01@id.local`, `student02@id.local` 등
- 권한: 자신의 데이터만 읽기/쓰기, 자신의 과제 제출

## 적용 방법

1. Firebase Console 접속
2. 프로젝트 선택 (sensory-and-brain)
3. Firestore Database > 규칙 탭 이동
4. 위의 규칙 코드를 복사하여 붙여넣기
5. "게시" 버튼 클릭하여 적용

## 테스트

규칙이 올바르게 적용되었는지 확인하려면:

1. 교사 계정으로 로그인하여 학생 목록 조회 가능한지 확인
2. 학생 계정으로 로그인하여 자신의 과제만 볼 수 있는지 확인
3. Firebase Console의 "규칙 시뮬레이터"에서 다양한 시나리오 테스트

## 주의사항

- 프로덕션 환경에서는 반드시 이 보안 규칙을 적용해야 합니다
- 규칙 변경 후에는 충분한 테스트를 거쳐야 합니다
- 정기적으로 보안 규칙을 검토하고 업데이트하세요