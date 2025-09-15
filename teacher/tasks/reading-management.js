// teacher/tasks/reading-management.js - 읽기 전용 관리 로직
import { authManager } from '../../core/auth.js';
import { dbManager } from '../../core/database.js';
import { APP_CONFIG, utils } from '../../config/app-config.js';

class ReadingManagement {
    constructor() {
        this.currentUser = null;
        this.selectedStudent = null;
        
        this.parseParams();
        this.initializeApp();
        this.setupEventListeners();
        this.setupAuthListener();
    }

    parseParams() {
        // URL 파라미터에서 학생 정보 가져오기
        const params = new URLSearchParams(window.location.search);
        const studentUid = params.get('student');
        const studentName = params.get('studentName');
        
        if (studentUid) {
            this.selectedStudent = {
                uid: studentUid,
                displayName: studentName || studentUid
            };
        } else {
            // 파라미터가 없으면 메인으로 리다이렉트
            window.location.href = '../index.html';
        }
    }

    initializeApp() {
        console.log('읽기 관리 앱 초기화');
        
        // 학생 정보 표시
        this.displayStudentInfo();
        
        // 날짜 기본값 설정
        this.setDefaultDates();
        
        console.log('읽기 관리 앱 초기화 완료');
    }

    displayStudentInfo() {
        const studentInfoEl = document.getElementById('studentInfo');
        if (this.selectedStudent) {
            studentInfoEl.innerHTML = `
                <strong>학생:</strong> ${this.selectedStudent.displayName} 
                <span style="color: #6c757d;">(${this.selectedStudent.uid})</span>
            `;
        }
    }

    setDefaultDates() {
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(today.getMonth() + 1);
        
        document.getElementById('startDate').value = today.toISOString().split('T')[0];
        document.getElementById('endDate').value = nextMonth.toISOString().split('T')[0];
    }

    setupEventListeners() {
        // 오늘 과제 관련
        document.getElementById('assignTodayBtn').addEventListener('click', () => this.assignToday());
        document.getElementById('clearTodayBtn').addEventListener('click', () => this.clearToday());

        // 대량 배정 관련
        document.getElementById('bulkAssignBtn').addEventListener('click', () => this.bulkAssign());
        document.getElementById('previewBtn').addEventListener('click', () => this.previewBulkAssign());

        console.log('이벤트 리스너 설정 완료');
    }

    setupAuthListener() {
        authManager.addAuthListener(async (user) => {
            this.currentUser = user;

            if (user && authManager.isTeacher(user)) {
                await this.loadCurrentAssignments();
            } else {
                window.location.href = '../index.html';
            }
        });
    }

    async loadCurrentAssignments() {
        const assignmentsEl = document.getElementById('currentAssignments');
        assignmentsEl.innerHTML = '<div class="assignment-loading">과제 정보를 확인하는 중...</div>';

        try {
            const today = utils.getTodayKey();
            const result = await dbManager.getAssignment(this.selectedStudent.uid, today);

            if (result.success) {
                this.renderCurrentAssignments(result.data);
            } else {
                assignmentsEl.innerHTML = `
                    <div style="text-align: center; color: #6c757d; padding: 20px;">
                        오늘 배정된 읽기 과제가 없습니다.
                    </div>
                `;
            }
        } catch (error) {
            console.error('과제 로드 오류:', error);
            assignmentsEl.innerHTML = `
                <div style="text-align: center; color: #dc3545; padding: 20px;">
                    과제 정보 로드 중 오류가 발생했습니다.
                </div>
            `;
        }
    }

    renderCurrentAssignments(assignment) {
        const assignmentsEl = document.getElementById('currentAssignments');
        
        if (!assignment.tasks || assignment.tasks.length === 0) {
            assignmentsEl.innerHTML = `
                <div style="text-align: center; color: #6c757d; padding: 20px;">
                    배정된 과제가 없습니다.
                </div>
            `;
            return;
        }

        // 읽기 과제만 필터링
        const readingTasks = assignment.tasks.filter(task => task.type === 'reading');
        
        if (readingTasks.length === 0) {
            assignmentsEl.innerHTML = `
                <div style="text-align: center; color: #6c757d; padding: 20px;">
                    오늘 배정된 읽기 과제가 없습니다.
                </div>
            `;
            return;
        }

        const tasksHTML = readingTasks.map(task => {
            const items = Array.isArray(task.items) ? task.items.join(', ') : task.items;
            const rate = task.rate || 1.0;
            
            return `
                <div class="assignment-item">
                    <div class="assignment-info">
                        <div class="assignment-title">읽기 과제 ${task.taskId ? `(ID: ${task.taskId})` : ''}</div>
                        <div class="assignment-details">
                            텍스트 번호: ${items} | 읽기 속도: ${rate}x
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button class="btn btn-danger btn-small delete-reading-task-btn" data-task-id="${task.taskId || ''}" style="margin-left: 5px;">
                            🗑️ 삭제
                        </button>
                        <div class="status status-success">배정됨</div>
                    </div>
                </div>
            `;
        }).join('');

        assignmentsEl.innerHTML = tasksHTML;
        
        // 개별 과제 삭제 버튼 이벤트 리스너 추가
        document.querySelectorAll('.delete-reading-task-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.getAttribute('data-task-id');
                if (taskId) {
                    this.deleteSpecificTask(taskId);
                }
            });
        });
    }

    // 특정 과제 ID로 과제 삭제
    async deleteSpecificTask(taskId) {
        if (!confirm(`과제 ID "${taskId}"를 삭제하시겠습니까?`)) {
            return;
        }

        try {
            const dateKey = utils.extractDateFromTaskId(taskId);
            const result = await dbManager.getAssignment(this.selectedStudent.uid, dateKey);
            
            if (result.success && result.data.tasks) {
                // 해당 taskId를 가진 과제만 제거
                const updatedTasks = result.data.tasks.filter(task => task.taskId !== taskId);
                
                const taskConfig = {
                    tasks: updatedTasks,
                    lastUpdated: Date.now()
                };

                const updateResult = await dbManager.assignTask(this.selectedStudent.uid, dateKey, taskConfig);
                
                if (updateResult.success) {
                    this.showAlert('assignmentAlert', `과제 ${taskId}가 삭제되었습니다.`, 'success');
                    await this.loadCurrentAssignments();
                } else {
                    this.showAlert('assignmentAlert', '과제 삭제 실패: ' + updateResult.error, 'error');
                }
            } else {
                this.showAlert('assignmentAlert', '과제를 찾을 수 없습니다.', 'error');
            }
        } catch (error) {
            console.error('특정 과제 삭제 오류:', error);
            this.showAlert('assignmentAlert', '오류가 발생했습니다: ' + error.message, 'error');
        }
    }

    async assignToday() {
        const problemNumbers = document.getElementById('problemNumbers').value.trim();
        const readingRate = parseFloat(document.getElementById('readingRate').value);
        const assignBtn = document.getElementById('assignTodayBtn');

        if (!problemNumbers) {
            this.showAlert('assignmentAlert', '텍스트 번호를 입력해주세요.', 'error');
            return;
        }

        // 문제 번호 파싱
        const items = this.parseNumbers(problemNumbers);
        if (items.length === 0) {
            this.showAlert('assignmentAlert', '유효한 텍스트 번호를 입력해주세요.', 'error');
            return;
        }

        assignBtn.disabled = true;
        assignBtn.textContent = '배정 중...';
        this.showAlert('assignmentAlert', '과제를 배정하는 중입니다...', 'info');

        try {
            const today = utils.getTodayKey();
            
            // 기존 과제 불러오기 (덮어쓰기 방지)
            const existingResult = await dbManager.getAssignment(this.selectedStudent.uid, today);
            let existingTasks = [];
            
            if (existingResult.success && existingResult.data.tasks) {
                existingTasks = existingResult.data.tasks;
            }

            // 기존 과제 ID들 수집
            const existingTaskIds = existingTasks.map(task => task.taskId).filter(id => id);
            
            // 기존 읽기 과제 제거 후 새 과제 추가
            const updatedTasks = existingTasks.filter(task => task.type !== 'reading');
            
            // 새 과제 ID 생성
            const nextSequence = utils.getNextSequenceForDate(existingTaskIds, today);
            const taskId = utils.generateTaskId(today, nextSequence);
            
            updatedTasks.push({
                taskId: taskId,
                type: 'reading',
                items: items,
                rate: readingRate
            });

            const taskConfig = {
                tasks: updatedTasks,
                lastUpdated: Date.now()
            };

            const result = await dbManager.assignTask(this.selectedStudent.uid, today, taskConfig);

            if (result.success) {
                this.showAlert('assignmentAlert', '읽기 과제가 성공적으로 배정되었습니다!', 'success');
                await this.loadCurrentAssignments();
                this.clearTodayForm();
            } else {
                this.showAlert('assignmentAlert', '과제 배정에 실패했습니다: ' + result.error, 'error');
            }

        } catch (error) {
            console.error('과제 배정 오류:', error);
            this.showAlert('assignmentAlert', '오류가 발생했습니다: ' + error.message, 'error');
        }

        assignBtn.disabled = false;
        assignBtn.textContent = '📖 오늘 과제로 배정';
    }

    async clearToday() {
        if (!confirm('오늘의 읽기 과제를 삭제하시겠습니까?')) {
            return;
        }

        const clearBtn = document.getElementById('clearTodayBtn');
        clearBtn.disabled = true;
        clearBtn.textContent = '삭제 중...';

        try {
            const today = utils.getTodayKey();
            const existingResult = await dbManager.getAssignment(this.selectedStudent.uid, today);
            
            if (existingResult.success && existingResult.data.tasks) {
                // 읽기 외 다른 과제만 남기기
                const remainingTasks = existingResult.data.tasks.filter(task => task.type !== 'reading');
                
                const taskConfig = {
                    tasks: remainingTasks,
                    lastUpdated: Date.now()
                };

                const result = await dbManager.assignTask(this.selectedStudent.uid, today, taskConfig);

                if (result.success) {
                    this.showAlert('assignmentAlert', '읽기 과제가 삭제되었습니다.', 'success');
                    await this.loadCurrentAssignments();
                } else {
                    this.showAlert('assignmentAlert', '과제 삭제에 실패했습니다: ' + result.error, 'error');
                }
            }

        } catch (error) {
            console.error('과제 삭제 오류:', error);
            this.showAlert('assignmentAlert', '오류가 발생했습니다: ' + error.message, 'error');
        }

        clearBtn.disabled = false;
        clearBtn.textContent = '🗑️ 오늘 과제 삭제';
    }

    previewBulkAssign() {
        const assignments = this.generateBulkAssignments();
        
        if (assignments.length === 0) {
            this.showAlert('bulkAlert', '배정 조건을 확인해주세요.', 'error');
            return;
        }

        const previewText = assignments.slice(0, 10).map(a => 
            `${a.dateStr}: 텍스트 ${a.texts.join(', ')}`
        ).join('\n');

        const totalText = assignments.length > 10 
            ? `\n... 및 ${assignments.length - 10}일 더`
            : '';

        alert(`미리보기 (총 ${assignments.length}일):\n\n${previewText}${totalText}`);
    }

    async bulkAssign() {
        const assignments = this.generateBulkAssignments();
        
        if (assignments.length === 0) {
            this.showAlert('bulkAlert', '배정 조건을 확인해주세요.', 'error');
            return;
        }

        if (!confirm(`총 ${assignments.length}일의 과제를 배정하시겠습니까?`)) {
            return;
        }

        const bulkBtn = document.getElementById('bulkAssignBtn');
        const progressEl = document.getElementById('bulkProgress');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');

        bulkBtn.disabled = true;
        bulkBtn.textContent = '배정 중...';
        progressEl.style.display = 'block';

        let completed = 0;
        let errors = 0;

        for (const assignment of assignments) {
            try {
                // 기존 과제 불러오기
                const existingResult = await dbManager.getAssignment(this.selectedStudent.uid, assignment.dateKey);
                let existingTasks = [];
                
                if (existingResult.success && existingResult.data.tasks) {
                    existingTasks = existingResult.data.tasks;
                }

                // 기존 과제 ID들 수집
                const existingTaskIds = existingTasks.map(task => task.taskId).filter(id => id);
                
                // 읽기 과제만 교체
                const updatedTasks = existingTasks.filter(task => task.type !== 'reading');
                
                // 새 과제 ID 생성
                const nextSequence = utils.getNextSequenceForDate(existingTaskIds, assignment.dateKey);
                const taskId = utils.generateTaskId(assignment.dateKey, nextSequence);
                
                updatedTasks.push({
                    taskId: taskId,
                    type: 'reading',
                    items: assignment.texts,
                    rate: parseFloat(document.getElementById('bulkRate').value)
                });

                const taskConfig = {
                    tasks: updatedTasks,
                    lastUpdated: Date.now()
                };

                await dbManager.assignTask(this.selectedStudent.uid, assignment.dateKey, taskConfig);
                completed++;

            } catch (error) {
                console.error(`배정 실패 (${assignment.dateStr}):`, error);
                errors++;
            }

            // 진행률 업데이트
            const progress = Math.round(((completed + errors) / assignments.length) * 100);
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `${progress}%`;
            progressText.textContent = `진행: ${completed + errors}/${assignments.length} (성공: ${completed}, 실패: ${errors})`;
        }

        // 완료 처리
        if (errors === 0) {
            this.showAlert('bulkAlert', `모든 과제가 성공적으로 배정되었습니다! (${completed}일)`, 'success');
        } else {
            this.showAlert('bulkAlert', `배정 완료: 성공 ${completed}일, 실패 ${errors}일`, 'error');
        }

        await this.loadCurrentAssignments();

        bulkBtn.disabled = false;
        bulkBtn.textContent = '📚 기간별 배정 시작';
        
        // 3초 후 진행률 숨기기
        setTimeout(() => {
            progressEl.style.display = 'none';
        }, 3000);
    }

    generateBulkAssignments() {
        const startDate = new Date(document.getElementById('startDate').value);
        const endDate = new Date(document.getElementById('endDate').value);
        const bulkProblems = document.getElementById('bulkProblems').value.trim();
        const textsPerDay = parseInt(document.getElementById('textsPerDay').value);

        if (!startDate || !endDate || !bulkProblems || startDate > endDate) {
            return [];
        }

        // 선택된 요일
        const selectedDays = [
            document.getElementById('mon').checked,  // 1
            document.getElementById('tue').checked,  // 2
            document.getElementById('wed').checked,  // 3
            document.getElementById('thu').checked,  // 4
            document.getElementById('fri').checked,  // 5
            document.getElementById('sat').checked,  // 6
            document.getElementById('sun').checked   // 0
        ];

        // 텍스트 번호 파싱
        const allTexts = this.parseNumbers(bulkProblems);
        if (allTexts.length === 0) return [];

        const assignments = [];
        let textIndex = 0;

        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const dayOfWeek = date.getDay(); // 0=일, 1=월, ..., 6=토
            const selectedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=월, 1=화, ..., 6=일로 변환

            if (selectedDays[selectedIndex]) {
                const texts = [];
                
                for (let i = 0; i < textsPerDay && textIndex < allTexts.length; i++) {
                    texts.push(allTexts[textIndex]);
                    textIndex++;
                }

                if (texts.length > 0) {
                    assignments.push({
                        date: new Date(date),
                        dateKey: this.formatDateKey(date),
                        dateStr: this.formatDateString(date),
                        texts: texts
                    });
                }

                // 모든 텍스트를 사용했으면 종료
                if (textIndex >= allTexts.length) {
                    break;
                }
            }
        }

        return assignments;
    }

    parseNumbers(input) {
        const numbers = [];
        const parts = input.split(',');
        
        for (const part of parts) {
            const trimmed = part.trim();
            
            if (trimmed.includes('-')) {
                // 범위 (예: 1-10)
                const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
                if (!isNaN(start) && !isNaN(end) && start <= end) {
                    for (let i = start; i <= end; i++) {
                        numbers.push(i);
                    }
                }
            } else {
                // 개별 번호
                const num = parseInt(trimmed);
                if (!isNaN(num)) {
                    numbers.push(num);
                }
            }
        }
        
        return [...new Set(numbers)].sort((a, b) => a - b); // 중복 제거 및 정렬
    }

    formatDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    formatDateString(date) {
        return date.toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            weekday: 'short'
        });
    }

    showAlert(elementId, message, type) {
        const alertEl = document.getElementById(elementId);
        alertEl.textContent = message;
        alertEl.className = `alert alert-${type === 'success' ? 'success' : 'error'} show`;

        if (type === 'success') {
            setTimeout(() => {
                alertEl.classList.remove('show');
            }, 3000);
        }
    }

    clearTodayForm() {
        document.getElementById('problemNumbers').value = '';
        document.getElementById('readingRate').value = '1.0';
    }
}

// 앱 초기화
window.readingManagement = new ReadingManagement();

console.log('읽기 관리 스크립트 로드 완료');