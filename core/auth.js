// core/auth.js - 통합 인증 관리 시스템
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth } from "../config/firebase.js";
import { utils } from "../config/app-config.js";

export class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authListeners = new Set();
    this.initializeAuth();
  }

  async initializeAuth() {
    // 세션 지속성 설정 (탭 닫으면 로그아웃)
    await setPersistence(auth, browserSessionPersistence);
    
    // 인증 상태 변경 감지
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      this.notifyListeners(user);
    });

    console.log("AuthManager 초기화 완료");
  }

  // 이메일/비밀번호 로그인
  async login(email, password) {
    try {
      // 아이디만 입력된 경우 @id.local 자동 추가
      if (!email.includes("@")) {
        email = `${email}@id.local`;
      }

      console.log("로그인 시도:", email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("로그인 성공:", userCredential.user.email);
      return { success: true, user: userCredential.user };
      
    } catch (error) {
      console.log("로그인 실패:", error.code);
      
      // 사용자가 존재하지 않는 경우 자동 가입 시도
      if (error.code === "auth/user-not-found") {
        return await this.signup(email, password);
      }
      
      return { 
        success: false, 
        error: this.getErrorMessage(error.code),
        code: error.code 
      };
    }
  }

  // 회원가입
  async signup(email, password) {
    try {
      console.log("회원가입 시도:", email);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("회원가입 성공:", userCredential.user.email);
      return { 
        success: true, 
        user: userCredential.user,
        isNewUser: true 
      };
      
    } catch (error) {
      console.error("회원가입 실패:", error);
      return { 
        success: false, 
        error: this.getErrorMessage(error.code),
        code: error.code 
      };
    }
  }

  // 로그아웃
  async logout() {
    try {
      await signOut(auth);
      console.log("로그아웃 완료");
      return { success: true };
    } catch (error) {
      console.error("로그아웃 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 사용자 역할 확인
  getUserRole(user = this.currentUser) {
    if (!user?.email) return "guest";
    
    if (utils.isStudentAccount(user.email)) {
      return "student";
    }
    
    if (utils.isTeacherAccount(user.email)) {
      return "teacher";
    }
    
    return "unknown";
  }

  // 학생 계정인지 확인
  isStudent(user = this.currentUser) {
    return this.getUserRole(user) === "student";
  }

  // 교사 계정인지 확인  
  isTeacher(user = this.currentUser) {
    return this.getUserRole(user) === "teacher";
  }

  // 현재 사용자 정보 반환
  getCurrentUser() {
    return this.currentUser;
  }

  // 인증 상태 변경 리스너 등록
  addAuthListener(callback) {
    this.authListeners.add(callback);
    
    // 이미 로그인되어 있다면 즉시 호출
    if (this.currentUser) {
      callback(this.currentUser);
    }
    
    return () => this.authListeners.delete(callback);
  }

  // 모든 리스너에게 알림
  notifyListeners(user) {
    this.authListeners.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        console.error("Auth listener 오류:", error);
      }
    });
  }

  // 교사가 학생 계정 생성 (관리자 전용)
  async createStudentAccount(studentId, password) {
    try {
      const studentEmail = `${studentId}@id.local`;
      
      // Firebase Auth에 계정 생성
      const userCredential = await createUserWithEmailAndPassword(auth, studentEmail, password);
      const user = userCredential.user;
      
      console.log(`학생 계정 생성 성공: ${user.uid} (${studentEmail})`);
      console.log('✅ auth.js에서 생성된 UID:', user.uid);
      console.log('✅ auth.js에서 생성된 UID 길이:', user.uid.length);
      
      return {
        success: true,
        user: user,
        uid: user.uid,
        email: user.email,
        displayName: studentId
      };
      
    } catch (error) {
      console.error("학생 계정 생성 실패:", error);
      
      return {
        success: false,
        error: this.getErrorMessage(error.code) || error.message
      };
    }
  }

  // 에러 메시지 한국어 변환
  getErrorMessage(errorCode) {
    const errorMessages = {
      // 로그인 관련 오류
      "auth/invalid-email": "유효하지 않은 이메일 주소입니다.",
      "auth/user-disabled": "비활성화된 계정입니다.",
      "auth/user-not-found": "존재하지 않는 계정입니다.",
      "auth/wrong-password": "잘못된 비밀번호입니다.",
      "auth/network-request-failed": "네트워크 연결을 확인해주세요.",
      "auth/too-many-requests": "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.",
      
      // 계정 생성 관련 오류
      "auth/email-already-in-use": "이미 사용중인 아이디입니다.",
      "auth/weak-password": "비밀번호가 너무 약합니다. (최소 6자리 이상)",
      "auth/invalid-password": "유효하지 않은 비밀번호입니다.",
      "auth/operation-not-allowed": "계정 생성이 허용되지 않습니다.",
      "auth/admin-restricted-operation": "관리자 권한이 필요한 작업입니다."
    };
    
    return errorMessages[errorCode] || `인증 오류: ${errorCode}`;
  }

  // 현재 사용자의 UID 반환  
  getCurrentUID() {
    return this.currentUser?.uid || null;
  }

  // 현재 사용자의 이메일 반환
  getCurrentEmail() {
    return this.currentUser?.email || null;
  }
}

// 전역 AuthManager 인스턴스
export const authManager = new AuthManager();