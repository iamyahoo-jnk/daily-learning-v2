// teacher/main-app.js - 교사 콘솔 메인 화면 로직
import { authManager } from '../core/auth.js';
import { dbManager } from '../core/database.js';
import { APP_CONFIG, utils } from '../config/app-config.js';

class TeacherMainApp {
    constructor() {
        this.currentUser = null;
        this.selectedStudent = null;
        this.studentsList = [];
        this.studentFormVisible = false;
        
        this.initializeApp();
        this.setupEventListeners();
        this.setupAuthListener();
    }

    initializeApp() {
        console.log('교사 메인 앱 초기화 시작');
        console.log('교사 메인 앱 초기화 완료');
    }

    setupEventListeners() {
        // 로그인
        document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
        document.getElementById('loginPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });

        // 로그아웃
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());

        // 학생 관리
        document.getElementById('selectedStudent').addEventListener('change', (e) => {
            this.handleStudentSelection(e.target.value);
        });

        document.getElementById('toggleStudentFormBtn').addEventListener('click', () => this.toggleStudentForm());
        document.getElementById('addStudentBtn').addEventListener('click', () => this.handleAddStudent());
        
        // 누락된 계정 복구 버튼 (개발자 도구용)
        if (document.getElementById('fixMissingAccountsBtn')) {
            document.getElementById('fixMissingAccountsBtn').addEventListener('click', () => this.fixMissingAccounts());
        }

        // 과제 카드 클릭 (카드 방식 네비게이션)
        this.setupTaskCardNavigation();

        console.log('이벤트 리스너 설정 완료');
    }

    setupTaskCardNavigation() {
        const taskCards = document.querySelectorAll('.menu-card[data-task]');
        
        taskCards.forEach(card => {
            card.addEventListener('click', (e) => {
                const taskType = card.dataset.task;
                
                if (card.classList.contains('disabled')) {
                    alert('이 기능은 아직 준비 중입니다.');
                    return;
                }

                if (!this.selectedStudent) {
                    alert('먼저 학생을 선택해주세요.');
                    return;
                }

                this.openTaskManagement(taskType);
            });
        });
    }

    openTaskManagement(taskType) {
        console.log('=== openTaskManagement 호출 ===');
        console.log('선택된 학생 정보:', this.selectedStudent);
        console.log('전달할 UID:', this.selectedStudent.uid);
        console.log('전달할 UID 길이:', this.selectedStudent.uid.length);
        
        // 각 과제 타입별로 전용 관리 화면 열기
        const params = new URLSearchParams({
            student: this.selectedStudent.uid,
            studentName: this.selectedStudent.displayName || this.selectedStudent.email,
            task: taskType
        });

        const url = `./tasks/${taskType}.html?${params.toString()}`;
        console.log('생성된 URL:', url);
        console.log('URL에 포함된 student 파라미터:', params.get('student'));
        
        // 같은 탭에서 열기 (전체 화면 전환)
        window.location.href = url;
        
        console.log(`${taskType} 관리 화면으로 이동 완료`);
    }

    setupAuthListener() {
        authManager.addAuthListener((user) => {
            this.currentUser = user;
            this.updateAuthUI(user);

            if (user && authManager.isTeacher(user)) {
                this.showMainContent();
                this.loadStudentsList();
                this.updateStudentListUI();
            } else if (user && !authManager.isTeacher(user)) {
                // 학생 계정으로 로그인된 경우
                this.showLoginError('교사 계정으로 로그인해주세요.');
                authManager.logout();
            } else {
                this.showLoginSection();
            }
        });
    }

    updateAuthUI(user) {
        const teacherInfo = document.getElementById('teacherInfo');
        const logoutBtn = document.getElementById('logoutBtn');

        if (user) {
            const role = authManager.getUserRole(user);
            teacherInfo.textContent = `${user.email} (${role})`;
            teacherInfo.className = 'status success';
            logoutBtn.style.display = 'block';
        } else {
            teacherInfo.textContent = '로그인 필요';
            teacherInfo.className = 'status pending';
            logoutBtn.style.display = 'none';
        }
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const loginBtn = document.getElementById('loginBtn');

        if (!email || !password) {
            this.showLoginError('이메일과 비밀번호를 입력해주세요.');
            return;
        }

        // 로딩 상태
        loginBtn.disabled = true;
        loginBtn.textContent = '로그인 중...';
        this.showLoginStatus('로그인 중입니다...', 'info');

        try {
            const result = await authManager.login(email, password);

            if (result.success) {
                if (authManager.isTeacher(result.user)) {
                    this.showLoginStatus('로그인 성공!', 'success');
                    // UI는 authListener에서 처리됨
                } else {
                    this.showLoginError('교사 계정으로만 로그인할 수 있습니다.');
                    await authManager.logout();
                }
            } else {
                this.showLoginError(result.error);
            }
        } catch (error) {
            this.showLoginError('로그인 중 오류가 발생했습니다: ' + error.message);
        }

        // 버튼 상태 복원
        loginBtn.disabled = false;
        loginBtn.textContent = '로그인';
    }

    async handleLogout() {
        await authManager.logout();
        this.selectedStudent = null;
        // localStorage에서 선택된 학생 정보 제거
        localStorage.removeItem('selectedStudent');
        this.clearInputs();
    }

    showLoginSection() {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
    }

    showMainContent() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
    }

    showLoginStatus(message, type) {
        const statusEl = document.getElementById('loginStatus');
        statusEl.textContent = message;
        statusEl.className = `alert alert-${type === 'success' ? 'success' : 'error'}`;
        statusEl.style.display = 'block';
    }

    showLoginError(message) {
        this.showLoginStatus(message, 'error');
    }

    async loadStudentsList() {
        const selectEl = document.getElementById('selectedStudent');
        
        selectEl.innerHTML = '<option value="">학생 목록 로드 중...</option>';
        
        try {
            const result = await dbManager.getRoster();

            if (result.success) {
                this.studentsList = result.data;
                
                // UID 수정 체크 및 자동 수정
                await this.checkAndFixTruncatedUIDs();
                
                this.updateStudentSelect();
                this.updateStudentListUI();
                
                // localStorage에서 이전에 선택된 학생 복원
                this.restoreSelectedStudent();
                
                console.log(`학생 목록 로드 완료: ${result.data.length}명`);
            } else {
                selectEl.innerHTML = '<option value="">학생 목록 로드 실패</option>';
                console.error('학생 목록 로드 오류:', result.error);
            }
        } catch (error) {
            console.error('학생 목록 로드 오류:', error);
            selectEl.innerHTML = '<option value="">오류 발생</option>';
        }
    }

    // 잘린 UID 체크 및 수정
    async checkAndFixTruncatedUIDs() {
        console.log('🔍 잘린 UID 체크 시작...');
        
        for (const student of this.studentsList) {
            if (student.uid && student.uid.length < 28) {
                console.log(`⚠️ 잘린 UID 발견: ${student.uid} (길이: ${student.uid.length})`);
                
                try {
                    // 실제 Firebase Auth에서 올바른 UID 찾기
                    const correctUID = await this.findCorrectUID(student.email);
                    if (correctUID && correctUID !== student.uid) {
                        console.log(`🔧 UID 수정: ${student.uid} → ${correctUID}`);
                        await this.fixStudentUID(student, correctUID);
                        student.uid = correctUID; // 메모리상에서도 수정
                    }
                } catch (error) {
                    console.error(`UID 수정 실패 (${student.email}):`, error);
                }
            }
        }
    }

    // 올바른 UID 찾기 (Firebase Auth 사용자 목록에서)
    async findCorrectUID(email) {
        // 현재 로그인된 사용자가 올바른 UID를 가지고 있는지 확인
        if (authManager.currentUser && authManager.currentUser.email === email) {
            return authManager.currentUser.uid;
        }
        
        // test4@id.local의 올바른 UID를 하드코딩으로 수정 (임시)
        if (email === 'test4@id.local') {
            return 'aEtk5uNbExdkE6sMPhZOCJntCVA2'; // 학생 콘솔에서 확인된 올바른 UID
        }
        
        // 다른 방법으로 올바른 UID를 찾아야 함
        // 이 경우 학생이 직접 로그인했을 때의 UID를 사용해야 함
        return null;
    }

    // 학생 UID 수정
    async fixStudentUID(oldStudent, newUID) {
        try {
            // 1. 새로운 UID로 roster에 올바른 정보 저장
            const newStudentData = {
                ...oldStudent,
                uid: newUID
            };
            
            await dbManager.addStudent(newStudentData);
            console.log(`✅ 새 UID로 학생 정보 저장: ${newUID}`);
            
            // 2. 기존 잘못된 UID 문서 제거
            await dbManager.removeStudent(oldStudent.uid);
            console.log(`🗑️ 잘못된 UID 문서 제거: ${oldStudent.uid}`);
            
        } catch (error) {
            console.error('UID 수정 중 오류:', error);
        }
    }

    updateStudentSelect() {
        const selectEl = document.getElementById('selectedStudent');
        selectEl.innerHTML = '<option value="">학생을 선택하세요</option>';

        this.studentsList.forEach(student => {
            const option = document.createElement('option');
            option.value = student.uid;
            option.textContent = student.displayName || student.email || student.uid;
            selectEl.appendChild(option);
        });
    }

    restoreSelectedStudent() {
        try {
            const savedStudent = localStorage.getItem('selectedStudent');
            if (savedStudent) {
                const studentData = JSON.parse(savedStudent);
                
                // 저장된 학생이 현재 학생 목록에 있는지 확인
                const foundStudent = this.studentsList.find(s => s.uid === studentData.uid);
                if (foundStudent) {
                    // select 요소에서 해당 학생 선택
                    const selectEl = document.getElementById('selectedStudent');
                    selectEl.value = studentData.uid;
                    
                    // handleStudentSelection 호출하여 UI 업데이트
                    this.handleStudentSelection(studentData.uid);
                    
                    console.log('이전 선택 학생 복원:', foundStudent);
                } else {
                    // 저장된 학생이 더 이상 목록에 없으면 localStorage에서 제거
                    localStorage.removeItem('selectedStudent');
                }
            }
        } catch (error) {
            console.error('학생 선택 복원 오류:', error);
            localStorage.removeItem('selectedStudent');
        }
    }

    handleStudentSelection(uid) {
        const studentInfoEl = document.getElementById('studentInfo');
        
        console.log('=== handleStudentSelection 호출 ===');
        console.log('전달받은 UID:', uid);
        console.log('전달받은 UID 길이:', uid?.length);
        
        if (!uid) {
            this.selectedStudent = null;
            studentInfoEl.style.display = 'none';
            // localStorage에서 선택된 학생 정보 제거
            localStorage.removeItem('selectedStudent');
            return;
        }

        console.log('학생 목록에서 검색 중...');
        console.log('현재 학생 목록:', this.studentsList.map(s => ({ uid: s.uid, name: s.displayName || s.email })));
        
        this.selectedStudent = this.studentsList.find(s => s.uid === uid);
        console.log('찾은 학생:', this.selectedStudent);
        
        if (this.selectedStudent) {
            console.log('✅ 선택된 학생 UID 확인:');
            console.log('  - UID:', this.selectedStudent.uid);
            console.log('  - UID 길이:', this.selectedStudent.uid.length);
            console.log('  - 이메일:', this.selectedStudent.email);
            
            studentInfoEl.innerHTML = `
                <strong>선택된 학생:</strong> ${this.selectedStudent.displayName || this.selectedStudent.email || this.selectedStudent.uid}<br>
                <strong>이메일:</strong> ${this.selectedStudent.email || '없음'}<br>
                <strong>UID:</strong> ${this.selectedStudent.uid}
            `;
            studentInfoEl.style.display = 'block';
            
            // localStorage에 선택된 학생 정보 저장
            localStorage.setItem('selectedStudent', JSON.stringify(this.selectedStudent));
            
            console.log('선택된 학생 정보 저장 완료:', this.selectedStudent);
        } else {
            console.log('❌ 해당 UID를 가진 학생을 찾을 수 없음');
        }
    }

    async handleAddStudent() {
        const newStudentId = document.getElementById('newStudentId').value.trim();
        const newStudentPassword = document.getElementById('newStudentPassword').value.trim();
        
        if (!newStudentId) {
            alert('학생 아이디를 입력해주세요.');
            return;
        }

        if (!newStudentPassword) {
            alert('비밀번호를 입력해주세요.');
            return;
        }

        if (newStudentPassword.length < 6) {
            alert('비밀번호는 최소 6자리 이상이어야 합니다.');
            return;
        }

        const addBtn = document.getElementById('addStudentBtn');
        addBtn.disabled = true;
        addBtn.textContent = '계정 생성 중...';

        try {
            // 1단계: Firebase Auth에 실제 계정 생성
            console.log(`학생 계정 생성 시작: ${newStudentId}`);
            const authResult = await authManager.createStudentAccount(newStudentId, newStudentPassword);
            
            console.log('✅ main-app.js에서 받은 authResult:', authResult);
            console.log('✅ main-app.js에서 받은 UID:', authResult.uid);
            console.log('✅ main-app.js에서 받은 UID 길이:', authResult.uid?.length);
            
            if (!authResult.success) {
                throw new Error(authResult.error);
            }

            // 2단계: roster에 학생 정보 저장
            const studentData = {
                uid: authResult.uid,
                email: authResult.email,
                displayName: authResult.displayName,
                createdAt: Date.now(),
                createdBy: this.currentUser.email
            };
            
            console.log('✅ 데이터베이스에 저장할 studentData:', studentData);
            console.log('✅ 저장할 UID:', studentData.uid);
            console.log('✅ 저장할 UID 길이:', studentData.uid?.length);

            const dbResult = await dbManager.addStudent(studentData);

            if (dbResult.success) {
                alert(`학생 계정이 성공적으로 생성되었습니다!\n아이디: ${newStudentId}\n비밀번호: ${newStudentPassword}`);
                document.getElementById('newStudentId').value = '';
                document.getElementById('newStudentPassword').value = '';
                await this.loadStudentsList(); // 목록 새로고침
            } else {
                // Auth는 성공했지만 DB 저장 실패
                console.warn('Auth 성공, DB 저장 실패:', dbResult.error);
                alert('계정은 생성되었지만 정보 저장에 실패했습니다. 다시 시도해주세요.');
            }

        } catch (error) {
            console.error('학생 추가 오류:', error);
            alert('학생 추가에 실패했습니다: ' + error.message);
        }

        addBtn.disabled = false;
        addBtn.textContent = '추가';
    }

    // 학생 관리 폼 토글
    toggleStudentForm() {
        const formEl = document.getElementById('studentForm');
        const btnEl = document.getElementById('toggleStudentFormBtn');
        
        this.studentFormVisible = !this.studentFormVisible;
        
        if (this.studentFormVisible) {
            formEl.style.display = 'block';
            formEl.classList.add('expanded');
            btnEl.textContent = '관리 패널 닫기';
            btnEl.classList.remove('btn-secondary');
            btnEl.classList.add('btn-primary');
            this.updateStudentListUI();
        } else {
            formEl.style.display = 'none';
            formEl.classList.remove('expanded');
            btnEl.textContent = '학생 추가/삭제';
            btnEl.classList.remove('btn-primary');
            btnEl.classList.add('btn-secondary');
        }
    }

    // 학생 목록 UI 업데이트
    updateStudentListUI() {
        const studentListEl = document.getElementById('studentList');
        
        if (!studentListEl || !this.studentFormVisible) {
            return;
        }

        if (this.studentsList.length === 0) {
            studentListEl.innerHTML = `
                <div style="text-align: center; color: #6c757d; padding: 20px;">
                    등록된 학생이 없습니다.
                </div>
            `;
            return;
        }

        let html = '';
        this.studentsList.forEach(student => {
            const isSelected = this.selectedStudent?.uid === student.uid;
            const studentId = student.email ? student.email.replace('@id.local', '') : student.uid;
            
            html += `
                <div class="student-item ${isSelected ? 'selected' : ''}" data-uid="${student.uid}">
                    <div class="student-details">
                        <div class="student-name">${student.displayName || studentId}</div>
                        <div class="student-email">${student.email || 'No email'}</div>
                    </div>
                    <div class="student-actions">
                        <button class="btn btn-small btn-secondary" onclick="window.teacherMainApp.selectStudentFromList('${student.uid}')">
                            ${isSelected ? '선택됨' : '선택'}
                        </button>
                        <button class="btn btn-small btn-danger" onclick="window.teacherMainApp.removeStudentFromList('${student.uid}')">
                            삭제
                        </button>
                    </div>
                </div>
            `;
        });

        studentListEl.innerHTML = html;
    }

    // 목록에서 학생 선택
    selectStudentFromList(uid) {
        const selectEl = document.getElementById('selectedStudent');
        selectEl.value = uid;
        this.handleStudentSelection(uid);
        this.updateStudentListUI();
    }

    // 목록에서 학생 삭제
    async removeStudentFromList(uid) {
        const student = this.studentsList.find(s => s.uid === uid);
        if (!student) return;

        const studentName = student.displayName || (student.email ? student.email.replace('@id.local', '') : student.uid);
        if (!confirm(`정말로 "${studentName}" 학생을 삭제하시겠습니까?\n\n경고: 이 작업은 되돌릴 수 없으며, 학생의 모든 과제와 제출 기록이 삭제됩니다.`)) {
            return;
        }

        try {
            const result = await dbManager.removeStudent(uid);

            if (result.success) {
                alert(`"${studentName}" 학생이 삭제되었습니다.`);
                
                // 선택된 학생이었다면 선택 해제
                if (this.selectedStudent?.uid === uid) {
                    this.selectedStudent = null;
                    document.getElementById('selectedStudent').value = '';
                    document.getElementById('studentInfo').style.display = 'none';
                    localStorage.removeItem('selectedStudent');
                }
                
                // 목록 새로고침
                await this.loadStudentsList();
            } else {
                alert('학생 삭제에 실패했습니다: ' + result.error);
            }

        } catch (error) {
            console.error('학생 삭제 오류:', error);
            alert('학생 삭제 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // 누락된 계정 복구 (개발자 도구)
    async fixMissingAccounts() {
        if (!confirm('Authentication에만 있고 roster에 누락된 학생 계정을 복구하시겠습니까?')) {
            return;
        }

        try {
            // test4 계정을 roster에 수동 추가
            const test4Data = {
                uid: 'aEtk5uNbExdkE6sMPhZOCJnt',
                email: 'test4@id.local',
                displayName: 'test4',
                createdAt: Date.now(),
                createdBy: this.currentUser.email,
                active: true
            };

            const result = await dbManager.addStudent(test4Data);
            
            if (result.success) {
                alert('test4 계정이 roster에 추가되었습니다!');
                await this.loadStudentsList();
            } else {
                alert('복구 실패: ' + result.error);
            }

        } catch (error) {
            console.error('계정 복구 오류:', error);
            alert('복구 중 오류 발생: ' + error.message);
        }
    }

    clearInputs() {
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        document.getElementById('newStudentId').value = '';
        document.getElementById('loginStatus').style.display = 'none';
    }
}

// 전역 인스턴스 생성
window.teacherMainApp = new TeacherMainApp();

console.log('교사 메인 앱 스크립트 로드 완료');