// config/app-config.js - 앱 전체 설정 및 모듈 정의
export const APP_CONFIG = {
  // 앱 기본 설정
  timezone: "Asia/Seoul",
  assetsBase: "/assets",
  
  // 계정 설정
  accounts: {
    studentDomain: "@id.local",
    teacherDomains: ["@naver.com", "@gmail.com"] // 교사 계정으로 인정할 도메인들
  },

  // 훈련 모듈 정의 (확장 가능)
  modules: {
    dictation: {
      id: "dictation",
      name: "받아쓰기",
      description: "소리로 듣고 입력하세요",
      icon: "🎧",
      path: "/modules/dictation/",
      enabled: true,
      settings: {
        allowRetry: true,
        showAnswer: true,
        rateControl: true
      }
    },
    
    reading: {
      id: "reading", 
      name: "읽기",
      description: "문장을 소리 내어 들을 수 있어요",
      icon: "📖",
      path: "/modules/reading/",
      enabled: true,
      settings: {
        rateControl: true,
        autoSubmit: true
      }
    },

    // 미래 확장을 위한 예시 모듈들
    vocabulary: {
      id: "vocabulary",
      name: "어휘 학습",
      description: "새로운 단어를 배워보세요",
      icon: "📚",
      path: "/modules/vocabulary/",
      enabled: false, // 아직 구현되지 않음
      external: false
    },

    math: {
      id: "math",
      name: "수학 연산",
      description: "기초 수학 문제를 풀어보세요",
      icon: "🔢",
      path: "/modules/math/",
      enabled: false,
      external: false
    },

    // 외부 연동 모듈 예시
    external_training: {
      id: "external_training",
      name: "외부 훈련 프로그램",
      description: "기존 훈련 프로그램과 연동",
      icon: "🔗", 
      path: "/modules/external/",
      enabled: false,
      external: true,
      api: {
        baseUrl: "", // 외부 프로그램 API URL
        authRequired: true
      }
    }
  },

  // 데이터베이스 컬렉션 정의
  collections: {
    users: "users",
    roster: "roster", 
    assignments: "assignments", // users/{uid}/assignments/{date}
    submissions: "submissions"  // users/{uid}/submissions/{date}
  },

  // UI 설정
  ui: {
    theme: "modern",
    animations: true,
    responsiveBreakpoint: "768px"
  }
};

// 유틸리티 함수들
export const utils = {
  // 현재 날짜를 YYYYMMDD 형식으로
  getTodayKey() {
    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: APP_CONFIG.timezone }));
    const y = kst.getFullYear();
    const m = String(kst.getMonth() + 1).padStart(2, "0");
    const d = String(kst.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  },

  // 학생 계정인지 확인
  isStudentAccount(email) {
    return email?.endsWith(APP_CONFIG.accounts.studentDomain);
  },

  // 교사 계정인지 확인  
  isTeacherAccount(email) {
    if (!email) return false;
    return APP_CONFIG.accounts.teacherDomains.some(domain => email.endsWith(domain));
  },

  // 활성화된 모듈만 반환
  getEnabledModules() {
    return Object.values(APP_CONFIG.modules).filter(module => module.enabled);
  },

  // 특정 모듈 설정 반환
  getModuleConfig(moduleId) {
    return APP_CONFIG.modules[moduleId] || null;
  },

  // 날짜를 키 형식으로 변환 (YYYYMMDD)
  formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  },

  // 날짜를 문자열로 포맷 (한국어)
  formatDateString(date) {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    }).format(date);
  },

  // 과제 ID 생성 (YYYYMMDD_N 형식)
  generateTaskId(date, sequence) {
    const dateKey = typeof date === 'string' ? date : this.formatDateKey(date);
    return `${dateKey}_${sequence}`;
  },

  // 과제 ID에서 날짜 추출
  extractDateFromTaskId(taskId) {
    return taskId.split('_')[0];
  },

  // 과제 ID에서 시퀀스 추출
  extractSequenceFromTaskId(taskId) {
    const parts = taskId.split('_');
    return parseInt(parts[1]) || 1;
  },

  // 날짜별 다음 시퀀스 번호 계산
  getNextSequenceForDate(existingTaskIds, dateKey) {
    const dateTaskIds = existingTaskIds.filter(id => id.startsWith(dateKey + '_'));
    if (dateTaskIds.length === 0) return 1;
    
    const sequences = dateTaskIds.map(id => this.extractSequenceFromTaskId(id));
    return Math.max(...sequences) + 1;
  }
};