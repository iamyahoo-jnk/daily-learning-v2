// student/app.js - 학생 앱 로직
import { authManager } from '../core/auth.js';
import { dbManager } from '../core/database.js';
import { APP_CONFIG, utils } from '../config/app-config.js';

class StudentApp {
    constructor() {
        console.log('🚀 StudentApp 생성자 시작');
        
        this.currentUser = null;
        this.todayAssignments = null;
        this.completionStatus = {};
        
        try {
            console.log('🔧 앱 초기화 중...');
            this.initializeApp();
            
            console.log('📋 이벤트 리스너 설정 중...');
            this.setupEventListeners();
            
            console.log('🔐 Auth 리스너 설정 중...');
            this.setupAuthListener();
            
            console.log('🎯 페이지 포커스 리스너 설정 중...');
            this.setupPageFocusListener();
            
            console.log('✅ StudentApp 생성자 완료');
        } catch (error) {
            console.error('❌ StudentApp 생성자에서 오류:', error);
            console.error('오류 스택:', error.stack);
            
            // 오류 발생 시에도 기본 UI는 표시
            document.getElementById('loginCard').style.display = 'block';
        }
    }

    initializeApp() {
        console.log('학생 앱 초기화 시작');
        
        // 모듈 import 상태 확인
        console.log('🔍 모듈 import 상태 확인:');
        console.log('  - authManager:', typeof authManager, authManager);
        console.log('  - dbManager:', typeof dbManager, dbManager);
        console.log('  - APP_CONFIG:', typeof APP_CONFIG, APP_CONFIG);
        console.log('  - utils:', typeof utils, utils);
        
        // localStorage 상태 확인
        this.debugLocalStorage();
        
        // 현재 날짜 표시
        this.updateDateDisplay();
        
        // 자동완성 강제 차단
        this.preventAutoComplete();
        
        // URL 파라미터로 완료 상태 확인
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('completed') === 'true') {
            console.log('🎉 URL에서 완료 상태 감지됨');
            setTimeout(() => {
                this.forceRefreshCompletionStatus();
            }, 500);
        }
        
        // 페이지 로드 시 즉시 완료 상태 체크
        setTimeout(() => {
            console.log('🔄 페이지 로드 후 완료 상태 즉시 체크');
            if (this.currentUser && this.todayAssignments) {
                this.forceRefreshCompletionStatus();
            }
        }, 1000);
        
        // Firebase 연결 테스트 (초기화 후)
        setTimeout(() => {
            this.testFirebaseConnection();
        }, 2000);
        
        console.log('학생 앱 초기화 완료');
    }


    preventAutoComplete() {
        // 입력 필드 자동완성 강제 차단
        const studentIdInput = document.getElementById('studentId');
        const passwordInput = document.getElementById('studentPassword');
        
        if (studentIdInput && passwordInput) {
            // 기존 값 강제 지우기
            studentIdInput.value = '';
            passwordInput.value = '';
            
            // 추가 자동완성 방지 속성
            studentIdInput.setAttribute('autocomplete', 'off');
            studentIdInput.setAttribute('autocapitalize', 'none');
            studentIdInput.setAttribute('autocorrect', 'off');
            studentIdInput.setAttribute('spellcheck', 'false');
            
            passwordInput.setAttribute('autocomplete', 'new-password');
            
            // 페이지 로드 후 다시 한번 지우기 (지연 실행)
            setTimeout(() => {
                studentIdInput.value = '';
                passwordInput.value = '';
            }, 100);
            
            setTimeout(() => {
                studentIdInput.value = '';
                passwordInput.value = '';
            }, 500);
            
            console.log('자동완성 차단 설정 완료');
        }
    }

    updateDateDisplay() {
        const dateEl = document.getElementById('currentDate');
        const now = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        };
        const dateStr = now.toLocaleDateString('ko-KR', options);
        dateEl.textContent = dateStr;
    }

    setupEventListeners() {
        // 로그인
        document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
        document.getElementById('studentPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });

        // 로그아웃
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());

        console.log('이벤트 리스너 설정 완료');
    }

    setupAuthListener() {
        console.log('🔧 Auth 리스너 설정 중...');
        
        authManager.addAuthListener(async (user) => {
            console.log('🔐 Auth 상태 변경 감지:', user ? `로그인됨 (${user.email})` : '로그아웃됨');
            this.currentUser = user;

            try {
                if (user && authManager.isStudent(user)) {
                    console.log('✅ 학생 계정 확인 완료');
                    this.showMainContent(user);
                    
                    // 과제 로드 후 완료 상태를 자동으로 반영
                    console.log('📚 과제 데이터 로드 시작...');
                    await this.loadTodayAssignments();
                    
                    // 서버 제출 데이터 전체 조사 (핵심 디버깅)
                    console.log('🔍 로그인 직후 서버 제출 데이터 전체 조사 시작');
                    setTimeout(async () => {
                        await this.debugServerSubmissions();
                        console.log('🔄 서버 조사 완료 후 완료 상태 체크');
                        this.forceRefreshCompletionStatus();
                    }, 1000);
                    
                    console.log('✅ 로그인 완료 - 과제 및 완료 상태 모두 로드됨');
                } else if (user && !authManager.isStudent(user)) {
                    // 교사나 다른 계정으로 로그인된 경우
                    console.log('❌ 비학생 계정 로그인 시도:', user.email);
                    this.showLoginError('학생 계정으로만 로그인할 수 있습니다.');
                    authManager.logout();
                } else {
                    console.log('👤 로그인 필요 - 로그인 카드 표시');
                    this.showLoginCard();
                }
            } catch (error) {
                console.error('❌ Auth 리스너에서 오류 발생:', error);
                console.error('오류 스택:', error.stack);
                
                // 오류 발생 시에도 UI는 정상 표시
                if (user) {
                    this.showMainContent(user);
                } else {
                    this.showLoginCard();
                }
                
                // 사용자에게 오류 알림
                this.showLoginAlert('로그인 처리 중 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.', 'error');
            }
        });
    }

    async handleLogin() {
        console.log('🔐 로그인 시도 시작');
        
        // AuthManager 초기화 상태 확인
        console.log('🔍 AuthManager 상태 확인:', authManager);
        console.log('🔍 AuthManager 타입:', typeof authManager);
        console.log('🔍 AuthManager login 함수:', typeof authManager?.login);
        
        const studentId = document.getElementById('studentId').value.trim();
        const password = document.getElementById('studentPassword').value;
        const loginBtn = document.getElementById('loginBtn');

        console.log('📝 입력값 확인:');
        console.log('  - 학생ID:', studentId);
        console.log('  - 비밀번호:', password ? '입력됨' : '비어있음');

        if (!studentId || !password) {
            console.log('❌ 입력값 검증 실패');
            this.showLoginError('아이디와 비밀번호를 입력해주세요.');
            return;
        }

        // 로딩 상태
        loginBtn.disabled = true;
        loginBtn.textContent = '로그인 중...';
        this.showLoginAlert('로그인 중입니다...', 'info');

        try {
            // AuthManager 유효성 재확인
            if (!authManager || typeof authManager.login !== 'function') {
                throw new Error('AuthManager가 제대로 초기화되지 않았습니다');
            }
            
            // @id.local 이메일로 변환
            const email = `${studentId}@id.local`;
            console.log('📧 변환된 이메일:', email);
            console.log('🔥 authManager.login 호출 중...');
            
            const result = await authManager.login(email, password);
            console.log('🔥 authManager.login 결과:', result);

            if (result.success) {
                console.log('✅ 로그인 성공, 사용자 정보:', result.user);
                console.log('👤 학생 계정 여부 확인 중...');
                
                const isStudent = authManager.isStudent(result.user);
                console.log('👤 학생 계정 확인 결과:', isStudent);
                
                if (isStudent) {
                    console.log('✅ 학생 계정 확인됨');
                    this.showLoginAlert('로그인 성공!', 'success');
                    // UI는 authListener에서 처리됨
                } else {
                    console.log('❌ 비학생 계정');
                    this.showLoginError('학생 계정으로만 로그인할 수 있습니다.');
                    await authManager.logout();
                }
            } else {
                console.log('❌ 로그인 실패:', result.error);
                this.showLoginError(result.error);
            }

        } catch (error) {
            console.error('❌ 로그인 catch 블록 오류:', error);
            console.error('오류 타입:', typeof error);
            console.error('오류 메시지:', error.message);
            console.error('오류 스택:', error.stack);
            this.showLoginError('로그인 중 오류가 발생했습니다: ' + error.message);
        } finally {
            // 버튼 상태 복원
            loginBtn.disabled = false;
            loginBtn.textContent = '시작하기';
            console.log('🔄 로그인 버튼 상태 복원');
        }
    }

    // Firebase 연결 테스트 함수
    async testFirebaseConnection() {
        console.log('🧪 Firebase 연결 테스트 시작');
        
        try {
            // 1. 필요한 모듈들이 로드되었는지 확인
            const { auth, db } = await import('../config/firebase.js');
            console.log('📦 Firebase import 상태:');
            console.log('  - auth:', auth);
            console.log('  - db:', db);
            
            // 2. AuthManager 상태 확인
            console.log('🔐 AuthManager 최종 상태 확인:');
            console.log('  - authManager 존재:', !!authManager);
            console.log('  - login 함수 존재:', typeof authManager?.login);
            console.log('  - currentUser:', authManager?.currentUser);
            
            // 3. 현재 인증 상태 확인
            console.log('👤 현재 인증 상태:', auth.currentUser);
            
            console.log('✅ Firebase 연결 테스트 완료');
            
        } catch (error) {
            console.error('❌ Firebase 연결 테스트 실패:', error);
            console.error('오류 상세:', error.message);
            console.error('오류 스택:', error.stack);
            
            // 사용자에게 알림
            this.showLoginError('Firebase 연결에 문제가 있습니다. 네트워크 연결을 확인해주세요.');
        }
    }

    async handleLogout() {
        await authManager.logout();
        this.clearInputs();
    }

    showLoginCard() {
        document.getElementById('loginCard').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
    }

    showMainContent(user) {
        document.getElementById('loginCard').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'block';
        
        // 사용자 이름 표시
        const studentName = user.email.split('@')[0]; // @id.local 제거
        document.getElementById('studentName').textContent = `${studentName}님`;
        
        // 현재 날짜 표시
        this.updateCurrentDate();
    }

    // 현재 날짜를 한국어로 표시
    updateCurrentDate() {
        const now = new Date();
        const currentDateEl = document.getElementById('currentDate');
        
        if (currentDateEl) {
            const formattedDate = utils.formatDateString(now);
            currentDateEl.textContent = formattedDate;
            console.log('현재 날짜 업데이트:', formattedDate);
        }
    }
    

    showLoginAlert(message, type) {
        const alertEl = document.getElementById('loginAlert');
        alertEl.className = `alert alert-${type === 'success' ? 'success' : 'error'}`;
        alertEl.textContent = message;
        alertEl.style.display = 'block';

        // 자동 숨김
        setTimeout(() => {
            alertEl.style.display = 'none';
        }, 3000);
    }

    showLoginError(message) {
        this.showLoginAlert(message, 'error');
    }

    // 제출 완료 상태 확인
    checkSubmissionStatus() {
        try {
            const submissionStatus = localStorage.getItem('lastSubmissionStatus');
            if (submissionStatus) {
                const status = JSON.parse(submissionStatus);
                const completedTime = new Date(status.completedAt);
                const timeAgo = this.getTimeAgo(completedTime);
                
                console.log('✅ 제출 완료 상태 발견:', status);
                
                // 성공 메시지 표시
                this.showSuccessMessage(`🎉 과제 제출 완료! (${timeAgo})`);
                
                // 상태 정리 (한 번만 표시)
                localStorage.removeItem('lastSubmissionStatus');
            }
        } catch (error) {
            console.log('제출 상태 확인 오류:', error);
        }
    }

    // 시간 차이 계산
    getTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / (1000 * 60));
        
        if (minutes < 1) return '방금 전';
        if (minutes < 60) return `${minutes}분 전`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}시간 전`;
        
        const days = Math.floor(hours / 24);
        return `${days}일 전`;
    }

    // 성공 메시지 표시
    showSuccessMessage(message) {
        // 기존 알림이 있다면 제거
        const existingAlert = document.querySelector('.success-alert');
        if (existingAlert) {
            existingAlert.remove();
        }

        const alertDiv = document.createElement('div');
        alertDiv.className = 'success-alert';
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            border-radius: 8px;
            padding: 15px 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            z-index: 1000;
            font-weight: 600;
            animation: slideIn 0.3s ease;
        `;
        
        alertDiv.textContent = message;
        document.body.appendChild(alertDiv);

        // 5초 후 자동 제거
        setTimeout(() => {
            alertDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => alertDiv.remove(), 300);
        }, 5000);
    }

    // 과제 완료 상태 확인 (서버 기반 - 교사/학생 과제 ID 연동)
    async isTaskCompleted(taskId) {
        if (!this.currentUser || !taskId) {
            return false;
        }
        
        console.log(`🔍 서버 기반 과제 ${taskId} 완료 상태 확인 시작`);
        console.log(`👤 현재 사용자 UID: ${this.currentUser.uid}`);
        
        try {
            // 1단계: 서버에서 제출 데이터 확인 (핵심 로직)
            console.log('🌐 서버에서 제출 완료 데이터 확인 중...');
            console.log('🔍 조회 파라미터:', {
                userId: this.currentUser.uid,
                taskId: taskId,
                userEmail: this.currentUser.email
            });
            
            const submissionResult = await dbManager.getSubmissionByTaskId(this.currentUser.uid, taskId);
            console.log('🔍 서버 조회 결과 상세:', submissionResult);
            
            if (submissionResult.success && submissionResult.data) {
                console.log('✅ 서버에서 제출 완료 확인됨:', submissionResult.data);
                
                // 제출 데이터가 있으면 완료 상태
                const submissionData = submissionResult.data;
                console.log('📊 제출 데이터 상세:', {
                    taskId: submissionData.taskId,
                    submittedAt: new Date(submissionData.submittedAt).toLocaleString(),
                    score: submissionData.score,
                    status: submissionData.status
                });
                
                // localStorage에 완료 상태 캐싱 (빠른 재확인용)
                const cacheKey = `server_completion_cache_${this.currentUser.uid}_${taskId}`;
                const cacheData = {
                    taskId: taskId,
                    completed: true,
                    submittedAt: submissionData.submittedAt,
                    cachedAt: Date.now(),
                    source: 'server_confirmed'
                };
                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                
                return true;
            }
            
            // 2단계: 캐시된 완료 상태 확인 (서버 요청 실패 시 백업)
            console.log('💾 캐시된 완료 상태 확인 중...');
            const cacheKey = `server_completion_cache_${this.currentUser.uid}_${taskId}`;
            const cachedData = localStorage.getItem(cacheKey);
            
            if (cachedData) {
                try {
                    const cache = JSON.parse(cachedData);
                    const cacheAge = Date.now() - cache.cachedAt;
                    
                    // 캐시가 1시간 이내면 사용
                    if (cacheAge < 3600000 && cache.completed) {
                        console.log('💾 캐시에서 완료 상태 확인됨 (유효기간 내)');
                        return true;
                    }
                } catch (e) {
                    // 캐시 파싱 실패 시 무시
                }
            }
            
            console.log(`❌ 과제 ${taskId} 서버에서 완료 데이터 없음 - 미완료 상태`);
            return false;
            
        } catch (error) {
            console.error('⚠️ 서버 완료 상태 확인 중 오류:', error);
            
            // 서버 오류 시 localStorage 백업 확인
            console.log('🔧 서버 오류로 인한 localStorage 백업 확인');
            return this.checkLocalStorageCompletion(taskId);
        }
    }
    
    // localStorage 백업 완료 상태 확인 (서버 오류 시에만 사용)
    checkLocalStorageCompletion(taskId) {
        console.log('💾 localStorage 백업 완료 상태 확인:', taskId);
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            
            if (key && (key.includes('task_completed') || key.includes('completion') || key.includes('cache'))) {
                const value = localStorage.getItem(key);
                
                if (key.includes(taskId) && key.includes(this.currentUser.uid)) {
                    console.log(`✅ localStorage 백업에서 완료 확인: ${key}`);
                    return true;
                }
                
                try {
                    if (value) {
                        const data = JSON.parse(value);
                        if ((data.taskId === taskId || data.taskId === taskId.toString()) && 
                            (data.userId === this.currentUser.uid || data.uid === this.currentUser.uid)) {
                            console.log(`✅ localStorage JSON에서 완료 확인: ${key}`);
                            return true;
                        }
                    }
                } catch (e) {
                    // 파싱 실패 무시
                }
            }
        }
        
        return false;
    }

    // 기존 날짜 기반 완료 데이터 정리 (과제 ID 기반으로 마이그레이션)
    cleanupOldCompletionData() {
        if (!this.currentUser) return;
        
        console.log('🧹 기존 날짜 기반 완료 데이터 정리 중...');
        
        const keysToRemove = [];
        const today = utils.getTodayKey();
        
        // localStorage에서 모든 완료 관련 키 확인
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('task_completed_') && key.includes(this.currentUser.uid)) {
                console.log('🔍 발견된 완료 키:', key);
                
                // 날짜 패턴 확인 (YYYYMMDD_N이 아닌 날짜 기반 키)
                const keyParts = key.split('_');
                if (keyParts.length === 4) {
                    const lastPart = keyParts[3];
                    // 순수 날짜 형식인지 확인 (8자리이고 '_'가 없음)
                    if (lastPart.length === 8 && !lastPart.includes('_') && /^\d{8}$/.test(lastPart)) {
                        console.log('🗑️ 날짜 기반 키 발견 (제거 대상):', key);
                        keysToRemove.push(key);
                    }
                }
            }
        }
        
        // 추가로 다른 완료 관련 키들도 정리
        const additionalKeys = [
            'lastSubmissionStatus',
            'global_task_completion_status',
            'moduleMessage'
        ];
        
        additionalKeys.forEach(keyName => {
            if (localStorage.getItem(keyName)) {
                console.log('🗑️ 추가 정리 키:', keyName);
                keysToRemove.push(keyName);
            }
        });
        
        // 오래된 키 제거
        keysToRemove.forEach(key => {
            console.log('🗑️ 제거할 완료 데이터 키:', key, '→', localStorage.getItem(key)?.substring(0, 50) + '...');
            localStorage.removeItem(key);
        });
        
        if (keysToRemove.length > 0) {
            console.log(`✅ ${keysToRemove.length}개의 기존 완료 데이터 정리 완료`);
        } else {
            console.log('📝 정리할 기존 완료 데이터가 없음');
        }
        
        // 모든 localStorage 키 출력 (디버깅)
        console.log('📋 정리 후 남은 localStorage 키들:');
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('task_completed_') || key.includes('completion') || key.includes('submission')) {
                const value = localStorage.getItem(key);
                console.log(`  - ${key}: ${value ? value.substring(0, 30) + '...' : 'null'}`);
            }
        }
    }

    // 강제 완료 상태 초기화 (디버깅/테스트용)
    forceResetCompletionStatus() {
        console.log('🔄 강제 완료 상태 초기화 실행...');
        
        if (!this.currentUser) return;
        
        const today = utils.getTodayKey();
        const keysToCheck = [];
        
        // 모든 localStorage 키 검사
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('completed') || key.includes('submission') || key.includes('progress'))) {
                keysToCheck.push(key);
            }
        }
        
        console.log('🔍 완료 관련 키들:', keysToCheck);
        
        // 오늘 날짜 관련 모든 완료 데이터 제거
        keysToCheck.forEach(key => {
            if (key.includes(today) || key.includes(this.currentUser.uid)) {
                console.log('🗑️ 강제 제거:', key);
                localStorage.removeItem(key);
            }
        });
        
        // 완료 상태 메모리에서도 초기화
        this.completionStatus = {};
        
        console.log('✅ 강제 완료 상태 초기화 완료');
    }

    async loadTodayAssignments() {
        if (!this.currentUser) return;

        // 제출 완료 상태 확인 및 표시
        this.checkSubmissionStatus();

        const taskCardsEl = document.getElementById('taskCards');
        taskCardsEl.innerHTML = '<div class="loading">오늘의 과제를 불러오는 중...</div>';

        try {
            // 기존 날짜 기반 완료 데이터 정리 (먼저 수행)
            this.cleanupOldCompletionData();
            
            // 실제 과제 데이터 로드
            console.log('=== 과제 데이터 로드 시작 ===');
            const today = utils.getTodayKey();
            console.log('📅 오늘 날짜 키:', today);
            console.log('👤 현재 사용자 정보:');
            console.log('  - UID:', this.currentUser.uid);
            console.log('  - Email:', this.currentUser.email);
            console.log('  - DisplayName:', this.currentUser.displayName);
            
            const result = await dbManager.getAssignment(this.currentUser.uid, today);
            console.log('과제 로드 결과:', result);
            
            if (result.success && result.data) {
                console.log('📊 서버 응답 상세 분석:');
                console.log('  result.success:', result.success);
                console.log('  result.data:', result.data);
                console.log('  result.data.tasks 타입:', typeof result.data.tasks);
                console.log('  result.data.tasks 내용:', result.data.tasks);
                
                // tasks가 존재하고 비어있지 않은지 확인
                let hasTasks = false;
                if (result.data.tasks) {
                    if (Array.isArray(result.data.tasks)) {
                        hasTasks = result.data.tasks.length > 0;
                        console.log('  배열 형태 tasks, 개수:', result.data.tasks.length);
                    } else if (typeof result.data.tasks === 'object') {
                        hasTasks = Object.keys(result.data.tasks).length > 0;
                        console.log('  객체 형태 tasks, 키 개수:', Object.keys(result.data.tasks).length);
                    }
                }
                
                if (hasTasks) {
                    // 실제 과제 데이터가 있는 경우
                    this.todayAssignments = result.data;
                    console.log('✅ 실제 과제 데이터 로드 완료:', this.todayAssignments);
                    console.log('과제 개수:', Array.isArray(result.data.tasks) ? result.data.tasks.length : Object.keys(result.data.tasks).length);
                } else {
                    console.log('❌ 과제 데이터가 비어있음 - 빈 상태로 설정');
                    this.todayAssignments = null;
                    
                    // 모든 관련 데이터 완전 초기화
                    console.log('🧹 과제 데이터 비어있음 - 모든 관련 데이터 완전 초기화');
                    this.completionStatus = {};
                    
                    // localStorage에서 모든 완료 관련 데이터 제거
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.includes('task_completed_') && key.includes(this.currentUser.uid)) {
                            keysToRemove.push(key);
                        }
                    }
                    keysToRemove.forEach(key => {
                        console.log('🗑️ localStorage 키 제거:', key);
                        localStorage.removeItem(key);
                    });
                }
            } else {
                console.log('❌ 서버 응답 실패 또는 데이터 없음');
                console.log('result.success:', result.success);
                console.log('result.data:', result.data);
                console.log('result.error:', result.error);
                console.log('result.message:', result.message);
                
                // 과제가 없을 때는 null로 설정하여 빈 상태 표시
                this.todayAssignments = null;
                
                // 모든 관련 데이터 완전 초기화
                console.log('🧹 과제 없음 - 모든 관련 데이터 완전 초기화');
                this.completionStatus = {};
                
                // localStorage에서 모든 완료 관련 데이터 제거
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.includes('task_completed_') && key.includes(this.currentUser.uid)) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => {
                    console.log('🗑️ localStorage 키 제거:', key);
                    localStorage.removeItem(key);
                });
            }
            
            // 완료 상태 초기화
            this.completionStatus = {};
            
            // 카드 렌더링 (async 처리)
            await this.renderTaskCards();
            
            console.log('✅ 과제 로드 및 UI 업데이트 완료');

        } catch (error) {
            console.error('과제 로드 오류:', error);
            taskCardsEl.innerHTML = `
                <div class="alert alert-error">
                    과제를 불러오는 중 오류가 발생했습니다: ${error.message}
                </div>
            `;
        }
    }

    async loadCompletionStatus() {
        if (!this.currentUser || !this.todayAssignments) return;

        try {
            const todayKey = utils.getTodayKey();
            const result = await dbManager.getSubmissions(this.currentUser.uid, todayKey);

            if (result.success) {
                this.completionStatus = result.data;
            } else {
                this.completionStatus = {};
            }

        } catch (error) {
            console.error('완료 상태 로드 오류:', error);
            this.completionStatus = {};
        }
    }

    async renderTaskCards() {
        const taskCardsEl = document.getElementById('taskCards');
        
        console.log('=== renderTaskCards 시작 ===');
        console.log('todayAssignments:', this.todayAssignments);
        
        if (!this.todayAssignments || !this.todayAssignments.tasks) {
            console.log('❌ 과제 데이터 없음 - 빈 상태 표시');
            this.showEmptyState();
            return;
        }

        // tasks가 배열이 아닌 객체일 경우 배열로 변환
        let tasksArray = [];
        if (Array.isArray(this.todayAssignments.tasks)) {
            tasksArray = this.todayAssignments.tasks;
        } else if (typeof this.todayAssignments.tasks === 'object' && this.todayAssignments.tasks !== null) {
            tasksArray = Object.values(this.todayAssignments.tasks);
        }
        
        if (tasksArray.length === 0) {
            this.showEmptyState();
            return;
        }

        console.log('✅ 과제 렌더링 시작, 총 과제 수:', tasksArray.length);
        
        // 과제 HTML 생성 (async로 처리)
        const taskHTMLArray = await Promise.all(tasksArray.map(async (task, index) => {
            console.log(`=== 과제 ${index} (ID: ${task.taskId}) 처리 중 ===`);
            
            const moduleConfig = utils.getModuleConfig(task.type);
            if (!moduleConfig || !moduleConfig.enabled) {
                return '';
            }

            // 완료 상태 확인 (async로 처리)
            const isCompleted = task.taskId ? await this.isTaskCompleted(task.taskId) : false;
            console.log(`과제 ${task.taskId} 렌더링 완료 상태:`, isCompleted);
            
            const completedClass = isCompleted ? 'completed' : '';
            const buttonText = isCompleted ? '🚫 완료됨 - 재수행 불가' : '▶️ 시작하기';
            const buttonClass = isCompleted ? 'btn-completed' : 'btn-primary';
            const buttonDisabled = isCompleted ? 'disabled style="pointer-events: none; cursor: not-allowed; opacity: 0.6;"' : '';
            const buttonOnclick = isCompleted ? '' : `onclick="window.studentApp.startTask('${task.type}', ${index})"`;

            let itemsDisplay = '';
            if (task.type === 'dictation') {
                if (task.sourceType === 'sentence') {
                    const sentenceCount = Array.isArray(task.items) ? task.items.length : 1;
                    itemsDisplay = `<span class="detail-tag">문장 ${sentenceCount}개</span>`;
                } else {
                    const items = Array.isArray(task.items) ? task.items.join(', ') : task.items;
                    itemsDisplay = items ? `<span class="detail-tag">문제: ${items}</span>` : '';
                }
            } else if (task.type === 'reading') {
                const items = Array.isArray(task.items) ? task.items.join(', ') : task.items;
                itemsDisplay = items ? `<span class="detail-tag">텍스트: ${items}</span>` : '';
            }

            // 완료 상태 배지 생성 (완료/미완료 표시)
            const statusBadge = isCompleted ? 
                '<div class="status-badge completed">✅ 완료</div>' : 
                '<div class="status-badge pending">📝 미완료</div>';

            const cardHTML = `
                <div class="task-card ${task.type} ${completedClass}" data-task-type="${task.type}" data-task-index="${index}" data-task-id="${task.taskId || ''}">
                    ${statusBadge}
                    <div class="card-header">
                        <div class="task-icon">${moduleConfig.icon}</div>
                        <div class="task-info">
                            <div class="task-title">${moduleConfig.name} ${task.taskId ? `[ID: ${task.taskId}]` : ''}</div>
                            <div class="task-description">${moduleConfig.description}</div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="task-meta">
                            ${itemsDisplay}
                            ${task.rate !== 1.0 ? `<span class="detail-tag">속도: ${task.rate}x</span>` : ''}
                        </div>
                        <button class="btn-start ${buttonClass}" ${buttonDisabled} ${buttonOnclick}>${buttonText}</button>
                    </div>
                </div>
            `;
            
            console.log(`과제 ${index} HTML 생성 완료:`, cardHTML ? cardHTML.substring(0, 100) + '...' : 'null');
            return cardHTML;
        }));
        
        // HTML 배열을 필터링하고 조인
        const tasksHTML = taskHTMLArray.filter(html => html && html.length > 0).join('');

        console.log('최종 HTML 길이:', tasksHTML.length);
        console.log('생성된 HTML (처음 200자):', tasksHTML ? tasksHTML.substring(0, 200) : 'null');
        
        taskCardsEl.innerHTML = tasksHTML;
        console.log('DOM에 HTML 삽입 완료');
    }

    showEmptyState() {
        console.log('🔄 showEmptyState() 호출됨 - 빈 상태 표시');
        const taskCardsEl = document.getElementById('taskCards');
        const emptyStateEl = document.getElementById('emptyState');
        
        if (taskCardsEl) {
            taskCardsEl.innerHTML = '';
            console.log('✅ 과제 카드 영역 비움');
        }
        if (emptyStateEl) {
            emptyStateEl.style.display = 'block';
            console.log('✅ 빈 상태 메시지 표시');
        }
        
        console.log('🎯 빈 상태 표시 완료');
    }

    // localStorage 디버그 함수
    debugLocalStorage() {
        console.log('🔍 === localStorage 전체 상태 확인 ===');
        console.log(`📊 전체 localStorage 항목 수: ${localStorage.length}`);
        
        const completionKeys = [];
        const allKeys = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            allKeys.push(key);
            
            if (key && (key.includes('completed') || key.includes('completion') || key.includes('submission'))) {
                completionKeys.push(key);
                const value = localStorage.getItem(key);
                console.log(`✅ 완료 관련 키: ${key}`);
                console.log(`   값: ${value}`);
            }
        }
        
        console.log(`📋 모든 localStorage 키들:`, allKeys);
        console.log(`🎯 완료 관련 키 개수: ${completionKeys.length}개`);
        
        if (completionKeys.length === 0) {
            console.log('⚠️ 완료 관련 데이터가 전혀 없습니다!');
        }
    }

    // 서버 제출 데이터 전체 조사 (디버깅용)
    async debugServerSubmissions() {
        if (!this.currentUser) {
            console.log('❌ 사용자가 로그인되지 않아 서버 데이터 조회 불가');
            return;
        }
        
        console.log('🌐 === 서버 제출 데이터 전체 조사 시작 ===');
        
        try {
            const result = await dbManager.getAllSubmissionsByUser(this.currentUser.uid);
            
            if (result.success && result.data.length > 0) {
                console.log('🎯 서버에서 발견된 제출 데이터들:');
                result.data.forEach((submission, index) => {
                    console.log(`📄 제출 문서 ${index + 1}:`, submission);
                });
            } else {
                console.log('❌ 서버에 제출 데이터가 없음 또는 조회 실패');
                console.log('조회 결과:', result);
            }
            
        } catch (error) {
            console.error('❌ 서버 제출 데이터 조회 오류:', error);
        }
        
        console.log('🌐 === 서버 제출 데이터 조사 완료 ===');
    }


    async startTask(moduleType, taskIndex) {
        console.log(`과제 시작: ${moduleType}, 인덱스: ${taskIndex}`);

        if (!this.currentUser || !this.todayAssignments) {
            alert('과제 정보를 불러오는 중입니다. 잠시만 기다려주세요.');
            return;
        }

        // 과제 데이터 가져오기
        const task = Array.isArray(this.todayAssignments.tasks) 
            ? this.todayAssignments.tasks[taskIndex]
            : this.todayAssignments.tasks[taskIndex.toString()];

        if (!task) {
            alert('과제 정보를 찾을 수 없습니다.');
            return;
        }

        // 과제 완료 상태 확인 (재수행 방지) - 서버 기반 보안 확인
        if (task.taskId) {
            console.log('=== 🛡️ 서버 기반 완료 상태 확인 시작 ===');
            console.log('확인할 task:', task);
            
            // 1차: 서버 기반 완료 상태 확인 (핵심 로직)
            const isCompleted = await this.isTaskCompleted(task.taskId);
            console.log('🌐 서버 기반 완료 상태 결과:', isCompleted);
            
            if (isCompleted) {
                // 더 명확한 알림 메시지 + 재시도 방지
                alert('🚫 이미 완료된 과제입니다!\n\n✅ 과제는 한 번만 수행 가능합니다\n❌ 재수행이 불가능합니다\n\n질문이 있으시면 선생님께 문의해주세요.');
                console.log('❌ [보안차단 1단계] 완료된 과제 재수행 시도 차단:', moduleType, taskIndex, 'taskId:', task.taskId);
                
                // 즉시 UI 강제 새로고침으로 완료 상태 재확인
                await this.renderTaskCards();
                
                // 추가: 버튼 즉시 비활성화
                const taskButton = document.querySelector(`[data-task-id="${task.taskId}"] .btn-start`);
                if (taskButton) {
                    taskButton.disabled = true;
                    taskButton.style.pointerEvents = 'none';
                    taskButton.style.cursor = 'not-allowed';
                    taskButton.style.opacity = '0.5';
                    taskButton.textContent = '🚫 완료됨 - 재수행 불가';
                    taskButton.className = 'btn-start btn-completed';
                }
                
                // 추가 잠금: 전역적으로 이 과제 차단
                const globalLockKey = `task_locked_${this.currentUser.uid}_${task.taskId}`;
                localStorage.setItem(globalLockKey, JSON.stringify({
                    locked: true,
                    lockedAt: Date.now(),
                    reason: 'already_completed'
                }));
                
                return;
            }
            
            // 추가 보안: 전역 잠금 상태 확인
            const globalLockKey = `task_locked_${this.currentUser.uid}_${task.taskId}`;
            const lockData = localStorage.getItem(globalLockKey);
            if (lockData) {
                try {
                    const lock = JSON.parse(lockData);
                    if (lock.locked) {
                        console.log('❌ [보안차단 1.5단계] 전역 잠금으로 차단됨');
                        alert('🔒 이 과제는 완료되어 잠겨있습니다.');
                        return;
                    }
                } catch (e) {
                    // 파싱 오류 무시
                }
            }
            
            // 2차: 타임스탬프 기반 중복 확인  
            const recentAttemptKey = `recent_attempt_${this.currentUser.uid}_${task.taskId}`;
            const recentAttempt = localStorage.getItem(recentAttemptKey);
            const now = Date.now();
            
            if (recentAttempt) {
                const attemptTime = parseInt(recentAttempt);
                if (now - attemptTime < 3000) { // 3초 내 중복 클릭 방지
                    console.log('❌ [보안차단 2단계] 중복 클릭 방지');
                    return;
                }
            }
            
            // 시도 타임스탬프 기록
            localStorage.setItem(recentAttemptKey, now.toString());
        }

        // 서버 기반 완료 상태 확인이 이미 위에서 완료되었으므로 중복 확인 제거

        // 모듈 설정 확인
        const moduleConfig = utils.getModuleConfig(moduleType);
        if (!moduleConfig || !moduleConfig.enabled) {
            alert('현재 사용할 수 없는 모듈입니다.');
            return;
        }

        // localStorage에 과제 데이터 저장
        const taskData = {
            uid: this.currentUser.uid,
            userId: this.currentUser.uid, // 호환성을 위해 추가
            date: this.todayAssignments.date,
            taskType: moduleType,
            taskIndex: taskIndex,
            taskId: task.taskId,
            items: task.items,
            rate: task.rate,
            sourceType: task.sourceType,
            userEmail: this.currentUser.email // 디버깅용 추가
        };
        
        localStorage.setItem('currentTask', JSON.stringify(taskData));
        console.log('📋 과제 데이터 localStorage에 저장:', taskData);
        console.log('📋 저장된 과제 ID:', task.taskId);
        console.log('📋 현재 사용자 UID:', this.currentUser.uid);
        
        // 모듈로 이동 (과제 ID와 함께)
        if (moduleType === 'dictation') {
            this.openDictationModule(task);
        } else if (moduleType === 'reading') {
            this.openReadingModule(task);
        } else {
            alert(`${moduleConfig.name} 모듈은 아직 준비 중입니다.`);
        }
    }

    openDictationModule(task) {
        let itemsParam;
        
        if (task.sourceType === 'sentence') {
            // 문장 기반: 문장 배열을 그대로 전달
            itemsParam = Array.isArray(task.items) ? task.items.join(',') : task.items;
        } else {
            // 번호 기반: 기존 방식
            itemsParam = Array.isArray(task.items) ? task.items.join(',') : task.items;
        }
        
        const params = new URLSearchParams({
            uid: this.currentUser.uid,
            date: utils.getTodayKey(),
            taskId: task.taskId || '', // 과제 ID 추가 (핵심!)
            items: itemsParam,
            rate: task.rate || 1.0
        });

        const url = `../modules/dictation/index.html?${params.toString()}`;
        console.log('🎯 받아쓰기 모듈로 이동:', url);
        console.log('🎯 전달되는 과제 ID:', task.taskId);
        window.location.href = url;
    }

    openReadingModule(task) {
        const params = new URLSearchParams({
            uid: this.currentUser.uid,
            date: utils.getTodayKey(),
            taskId: task.taskId || '', // 과제 ID 추가 (받아쓰기와 동일)
            items: Array.isArray(task.items) ? task.items.join(',') : task.items,
            rate: task.rate || 1.0
        });

        const url = `../modules/reading/index.html?${params.toString()}`;
        console.log('📖 읽기 모듈로 이동:', url);
        console.log('📖 전달되는 과제 ID:', task.taskId);
        window.location.href = url;
    }

    clearInputs() {
        document.getElementById('studentId').value = '';
        document.getElementById('studentPassword').value = '';
        document.getElementById('loginAlert').style.display = 'none';
    }

    // 과제 완료 후 호출되는 함수 (모듈에서 호출)
    async onTaskCompleted(moduleType) {
        console.log(`과제 완료: ${moduleType}`);
        
        // 완료 상태 새로고침
        await this.loadCompletionStatus();
        
        // UI 업데이트
        this.renderTaskCards();
        
        // 완료 알림
        this.showCompletionAlert(moduleType);
    }

    showCompletionAlert(moduleType) {
        const moduleConfig = utils.getModuleConfig(moduleType);
        const moduleName = moduleConfig ? moduleConfig.name : moduleType;
        
        // 임시 알림 (추후 더 예쁜 알림으로 교체 가능)
        alert(`${moduleName} 과제를 완료했습니다!`);
    }

    // 페이지가 다시 포커스될 때 상태 새로고침 (모듈 창에서 돌아올 때)
    setupPageFocusListener() {
        window.addEventListener('focus', async () => {
            if (this.currentUser && this.todayAssignments) {
                console.log('🎯 페이지 포커스 - UI 즉시 새로고침');
                await this.renderTaskCards();
                }
        });
        
        // 새로고침 이벤트 추가 (localStorage 변경 감지)
        window.addEventListener('storage', async (e) => {
            if (e.key && e.key.includes('task_completed_') && this.currentUser) {
                console.log('💾 localStorage 변경 감지 - UI 업데이트');
                await this.renderTaskCards();
                }
        });
        
        // 주기적 체크 (5초마다 - async 처리)
        setInterval(async () => {
            if (this.currentUser && document.visibilityState === 'visible') {
                console.log('🔄 주기적 체크 - UI 상태 새로고침');
                await this.renderTaskCards();
                }
        }, 5000);
        
        // 더 긴 간격으로 서버 데이터 새로고침 (10초마다)
        setInterval(() => {
            if (this.currentUser && document.visibilityState === 'visible') {
                console.log('🌐 서버 데이터 정기 새로고침');
                this.loadTodayAssignments(); // 서버에서 최신 과제 데이터 로드
            }
        }, 10000);
        
        // 페이지 가시성 변경 감지 (다른 탭에서 돌아올 때) - 간결하고 확실한 버전
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && this.currentUser && this.todayAssignments) {
                console.log('📱 페이지가 다시 보임 - UI 즉시 새로고침');
                
                // UI 즉시 새로고침
                await this.renderTaskCards();
                }
        });
        
        // 페이지 로드 완료 시 체크
        if (document.readyState === 'complete') {
            setTimeout(() => {
                if (this.currentUser && this.todayAssignments) {
                    this.forceRefreshCompletionStatus();
                }
            }, 2000);
        } else {
            window.addEventListener('load', () => {
                setTimeout(() => {
                    if (this.currentUser && this.todayAssignments) {
                        this.forceRefreshCompletionStatus();
                    }
                }, 2000);
            });
        }
        
        // postMessage 이벤트 리스너 (모듈에서 오는 메시지)
        window.addEventListener('message', (event) => {
            console.log('postMessage 수신:', event.data);
            
            if (event.data && event.data.type === 'taskCompletedAndClosing' && event.data.moduleId === 'dictation') {
                console.log('받아쓰기 모듈 완료 메시지 수신 - 즉시 UI 업데이트');
                setTimeout(() => {
                    this.forceRefreshCompletionStatus();
                }, 200);
            }
            
            if (event.data && event.data.type === 'taskCompleted' && event.data.moduleId === 'dictation') {
                console.log('받아쓰기 과제 완료 메시지 수신');
                setTimeout(() => {
                    this.forceRefreshCompletionStatus();
                }, 500);
            }
        });
    }

    // 완료 상태 강제 새로고침 (수동으로 호출 가능) - 강화된 버전
    async forceRefreshCompletionStatus() {
        console.log('🔄 완료 상태 강제 새로고침 시작');
        
        if (!this.currentUser || !this.todayAssignments) {
            console.log('❌ 사용자 또는 과제 데이터 없음 - 새로고침 중단');
            return;
        }
        
        try {
            console.log('🔍 완료 상태 체크 시작');
            console.log('  - currentUser:', this.currentUser?.uid);
            console.log('  - todayAssignments:', this.todayAssignments);
            
            // 모든 과제의 완료 상태를 개별적으로 체크
            let hasAnyCompletedTask = false;
            const tasks = Array.isArray(this.todayAssignments.tasks) 
                ? this.todayAssignments.tasks 
                : Object.values(this.todayAssignments.tasks || {});
                
            console.log('  - 전체 과제 수:', tasks.length);
            
            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                if (task.taskId) {
                    const isCompleted = this.isTaskCompleted(task.taskId);
                    console.log(`  - 과제 ${i + 1} (ID: ${task.taskId}) 완료 상태:`, isCompleted);
                    if (isCompleted) {
                        hasAnyCompletedTask = true;
                    }
                }
            }
            
            console.log('🎯 전체 완료 상태 체크 결과:', hasAnyCompletedTask);
            
            // 강제로 UI 업데이트 (반드시 실행)
            console.log('🔄 UI 강제 업데이트 시작');
            this.renderTaskCards();
                console.log('🔄 UI 강제 업데이트 완료');
            
            
            // 완료 상태인 경우 성공 메시지 표시 (한 번만)
            if (hasAnyCompletedTask) {
                console.log('🎉 완료된 과제 발견 - 성공 메시지 확인');
                this.checkSubmissionStatus();
            }
            
            console.log('✅ 완료 상태 강제 새로고침 완료');
        } catch (error) {
            console.error('❌ 새로고침 오류:', error);
        }
    }


}

// 전역 인스턴스 생성
window.studentApp = new StudentApp();

// 페이지 포커스 리스너 추가
window.studentApp.setupPageFocusListener();

console.log('학생 앱 스크립트 로드 완료');