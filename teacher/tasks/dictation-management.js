// teacher/tasks/dictation-management.js - 받아쓰기 전용 관리 로직
import { authManager } from '../../core/auth.js';
import { dbManager } from '../../core/database.js';
import { APP_CONFIG, utils } from '../../config/app-config.js';

class DictationManagement {
    constructor() {
        this.currentUser = null;
        this.selectedStudent = null;
        this.sentences = [];
        this.sentenceIndex = 0;
        
        this.parseParams();
        this.initializeApp();
        this.setupEventListeners();
        this.setupAuthListener();
    }

    parseParams() {
        console.log('=== dictation-management parseParams 호출 ===');
        console.log('현재 URL:', window.location.href);
        console.log('현재 search 파라미터:', window.location.search);
        
        // URL 파라미터에서 학생 정보 가져오기
        const params = new URLSearchParams(window.location.search);
        const studentUid = params.get('student');
        const studentName = params.get('studentName');
        
        console.log('파싱된 파라미터:');
        console.log('  - studentUid:', studentUid);
        console.log('  - studentUid 길이:', studentUid?.length);
        console.log('  - studentName:', studentName);
        
        if (studentUid) {
            this.selectedStudent = {
                uid: studentUid,
                displayName: studentName || studentUid
            };
            console.log('✅ selectedStudent 설정 완료:', this.selectedStudent);
        } else {
            console.log('❌ studentUid가 없어서 메인으로 리다이렉트');
            // 파라미터가 없으면 메인으로 리다이렉트
            window.location.href = '../index.html';
        }
    }

    initializeApp() {
        // 학생 정보 표시
        this.displayStudentInfo();
        
        // 날짜 기본값 설정
        this.setDefaultDates();
        this.setSentenceDates();
        
        // 문장 에디터 초기화
        this.initSentenceEditor();
    }

    displayStudentInfo() {
        if (this.selectedStudent) {
            document.getElementById('studentInfo').textContent = 
                `선택된 학생: ${this.selectedStudent.displayName}`;
        }
    }

    setDefaultDates() {
        try {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);

            const viewStartEl = document.getElementById('viewStartDate');
            const viewEndEl = document.getElementById('viewEndDate');
            
            if (viewStartEl) viewStartEl.valueAsDate = today;
            if (viewEndEl) viewEndEl.valueAsDate = nextWeek;
        } catch (error) {
            console.error('기본 날짜 설정 오류:', error);
        }
    }

    setSentenceDates() {
        try {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);

            const sentenceStartEl = document.getElementById('sentenceStartDate');
            const sentenceEndEl = document.getElementById('sentenceEndDate');
            
            if (sentenceStartEl) sentenceStartEl.valueAsDate = tomorrow;
            if (sentenceEndEl) sentenceEndEl.valueAsDate = nextWeek;
        } catch (error) {
            console.error('문장 날짜 설정 오류:', error);
        }
    }

    initSentenceEditor() {
        const editor = document.getElementById('sentenceEditor');
        if (editor) {
            const exampleSentences = [
                '안녕하세요. 오늘 날씨가 좋네요.',
                '받아쓰기 연습을 시작하겠습니다.',
                '천천히 정확하게 써보세요.'
            ];
            
            editor.value = exampleSentences.join('\n');
        } else {
            console.error('sentenceEditor 요소를 찾을 수 없습니다');
        }
    }

    parseTextToSentences(text) {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }

    setupEventListeners() {
        // 과제 삭제 관련
        document.getElementById('clearTodayTaskBtn').addEventListener('click', () => this.clearTodayTask());
        document.getElementById('clearAllTasksBtn').addEventListener('click', () => this.clearAllTasks());

        // 문장 기반 배정 관련
        document.getElementById('sentenceBulkAssignBtn').addEventListener('click', () => this.sentenceBulkAssign());
        document.getElementById('sentencePreviewBtn').addEventListener('click', () => this.previewSentenceAssign());

        // 전체 과제 조회 관련
        document.getElementById('viewAllTasksBtn').addEventListener('click', () => this.viewAllTasks());
        document.getElementById('cleanupOrphanDataBtn').addEventListener('click', () => this.cleanupOrphanData());
        document.getElementById('verifyCleanupBtn').addEventListener('click', () => this.verifyCleanupResult());

        // 모달 관련 이벤트
        this.setupModalEvents();

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
                        오늘 배정된 받아쓰기 과제가 없습니다.
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

        // 받아쓰기 과제만 필터링
        const dictationTasks = assignment.tasks.filter(task => task.type === 'dictation');
        
        console.log('🔍 오늘 배정된 받아쓰기 과제:', dictationTasks.length, '개');
        console.log('과제 상세:', dictationTasks);
        
        if (dictationTasks.length === 0) {
            assignmentsEl.innerHTML = `
                <div style="text-align: center; color: #6c757d; padding: 20px;">
                    오늘 배정된 받아쓰기 과제가 없습니다.
                </div>
            `;
            return;
        }

        const tasksHTML = dictationTasks.map(task => {
            const rate = task.rate || 1.0;
            let contentDisplay = '';
            
            if (task.sourceType === 'sentence') {
                // 문장 기반 과제
                const sentences = Array.isArray(task.items) ? task.items : [task.items];
                const preview = sentences.length > 2 
                    ? `${sentences.slice(0, 2).join(', ')}... (총 ${sentences.length}개)`
                    : sentences.join(', ');
                contentDisplay = `문장: ${preview}`;
            } else {
                // 번호 기반 과제 (기존)
                const items = Array.isArray(task.items) ? task.items.join(', ') : task.items;
                contentDisplay = `문제 번호: ${items}`;
            }
            
            return `
                <div class="assignment-item">
                    <div class="assignment-info">
                        <div class="assignment-title">받아쓰기 과제 ${task.taskId ? `(ID: ${task.taskId})` : ''}</div>
                        <div class="assignment-details">
                            ${contentDisplay} | 재생 속도: ${rate}x
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button class="btn btn-secondary btn-small view-detail-btn" data-task='${JSON.stringify(task)}'>
                            📋 상세보기
                        </button>
                        <button class="btn btn-danger btn-small delete-task-btn" data-task-id="${task.taskId || ''}" style="margin-left: 5px;">
                            🗑️ 삭제
                        </button>
                        <div class="status status-success">배정됨</div>
                    </div>
                </div>
            `;
        }).join('');

        assignmentsEl.innerHTML = tasksHTML;
        
        // 상세보기 버튼 이벤트 리스너 추가
        document.querySelectorAll('.view-detail-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskData = JSON.parse(e.target.getAttribute('data-task'));
                this.showAssignmentDetail(taskData);
            });
        });

        // 개별 과제 삭제 버튼 이벤트 리스너 추가
        document.querySelectorAll('.delete-task-btn').forEach(btn => {
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
        if (!confirm(`⚠️ 과제 ID "${taskId}"를 완전히 삭제하시겠습니까?\n\n삭제되는 항목:\n• 과제 할당 정보\n• 학생 제출 데이터\n• 제출된 이미지 파일\n• 완료 상태 기록\n\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }
        
        try {
            console.log('🗑️ 과제 완전 삭제 시작:', taskId);
            
            // 무료 플랜 호환: Firestore 데이터만 삭제 (Storage는 보존)
            const deleteResult = await dbManager.deleteFirestoreDataOnly(this.selectedStudent.uid, taskId);
            
            if (deleteResult.success) {
                const { results } = deleteResult;
                let successMessage = `과제 ${taskId} 삭제 완료!\n\n`;
                successMessage += `• 과제 할당: ${results.assignmentDeleted ? '✅ 삭제됨' : '❌ 없음'}\n`;
                successMessage += `• 제출 데이터: ${results.submissionDeleted ? '✅ 삭제됨' : '❌ 없음'}\n`;
                if (results.cacheCleared) {
                    successMessage += `• 캐시 정리: ${results.cacheCleared}개 삭제됨\n`;
                }
                if (results.storageNote) {
                    successMessage += `• ${results.storageNote}\n`;
                }
                
                if (results.errors.length > 0) {
                    successMessage += `\n⚠️ 일부 오류:\n${results.errors.join('\n')}`;
                }
                
                console.log('✅ 과제 완전 삭제 성공:', results);
                this.showAlert('sentenceAlert', successMessage, 'success');
                
                // UI 새로고침
                await this.loadCurrentAssignments();
                
            } else {
                console.error('❌ 과제 삭제 실패:', deleteResult);
                this.showAlert('sentenceAlert', 
                    `삭제 중 오류가 발생했습니다:\n${deleteResult.error}\n\n${deleteResult.results?.errors?.join('\n') || ''}`, 
                    'error');
            }
            
        } catch (error) {
            console.error('❌ 과제 삭제 처리 오류:', error);
            this.showAlert('sentenceAlert', `삭제 처리 중 오류가 발생했습니다: ${error.message}`, 'error');
        }
    }

    // 오늘 받아쓰기 과제만 삭제
    async clearTodayTask() {
        if (!confirm('오늘 배정된 받아쓰기 과제를 삭제하시겠습니까?')) {
            return;
        }

        const clearBtn = document.getElementById('clearTodayTaskBtn');
        clearBtn.disabled = true;
        clearBtn.textContent = '삭제 중...';

        try {
            const today = utils.getTodayKey();
            const result = await dbManager.markTaskAsConfirmed(this.selectedStudent.uid, today, 'dictation');
            
            if (result.success) {
                this.showAlert('sentenceAlert', '오늘 받아쓰기 과제가 삭제되었습니다.', 'success');
                await this.loadCurrentAssignments();
            } else {
                this.showAlert('sentenceAlert', '과제 삭제 실패: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('오늘 과제 삭제 오류:', error);
            this.showAlert('sentenceAlert', '오류가 발생했습니다: ' + error.message, 'error');
        }

        clearBtn.disabled = false;
        clearBtn.textContent = '🗑️ 오늘 과제만 삭제';
    }

    // 모든 받아쓰기 과제 삭제 (오늘 및 이후 모든 날짜)
    async clearAllTasks() {
        if (!confirm('선택한 학생의 모든 받아쓰기 과제를 삭제하시겠습니까?\n(오늘 이후 모든 과제가 삭제됩니다)')) {
            return;
        }

        const clearBtn = document.getElementById('clearAllTasksBtn');
        clearBtn.disabled = true;
        clearBtn.textContent = '삭제 중...';

        try {
            const result = await dbManager.clearAllAssignments(this.selectedStudent.uid, 'dictation');
            
            if (result.success) {
                this.showAlert('sentenceAlert', '모든 받아쓰기 과제가 삭제되었습니다.', 'success');
                await this.loadCurrentAssignments();
            } else {
                this.showAlert('sentenceAlert', '과제 삭제 실패: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('과제 삭제 오류:', error);
            this.showAlert('sentenceAlert', '오류가 발생했습니다: ' + error.message, 'error');
        }

        clearBtn.disabled = false;
        clearBtn.textContent = '🗑️ 전체 과제 삭제';
    }

    // 전체 과제 조회
    async viewAllTasks() {
        const startDate = document.getElementById('viewStartDate').value;
        const endDate = document.getElementById('viewEndDate').value;
        
        if (!startDate || !endDate) {
            alert('조회 기간을 설정해주세요.');
            return;
        }

        const viewBtn = document.getElementById('viewAllTasksBtn');
        const resultEl = document.getElementById('allTasksResult');
        
        viewBtn.disabled = true;
        viewBtn.textContent = '조회 중...';

        try {
            // 기간 내 모든 과제 조회
            const allTasks = await this.getAllTasksInPeriod(startDate, endDate);
            this.renderAllTasks(allTasks);
            resultEl.style.display = 'block';
            
        } catch (error) {
            console.error('전체 과제 조회 오류:', error);
            alert('과제 조회 중 오류가 발생했습니다.');
        } finally {
            viewBtn.disabled = false;
            viewBtn.textContent = '📊 전체 과제 조회';
        }
    }

    async getAllTasksInPeriod(startDate, endDate) {
        const tasks = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
            const dateKey = utils.formatDateKey(date);
            
            try {
                const result = await dbManager.getAssignment(this.selectedStudent.uid, dateKey);
                
                if (result.success && result.data.tasks) {
                    const dictationTasks = result.data.tasks.filter(task => task.type === 'dictation');
                    
                    if (dictationTasks.length > 0) {
                        console.log(`📋 ${dateKey}에 ${dictationTasks.length}개 받아쓰기 과제 발견`);
                        
                        // 각 과제별로 개별 처리
                        for (const task of dictationTasks) {
                            let isCompleted = false;
                            let completionDetails = null;
                            
                            console.log(`🔍 과제 ${task.taskId} 완료 상태 확인 시작`);
                            
                            // 1차: 과제 ID 기반 확인 (우선)
                            if (task && task.taskId) {
                                try {
                                    const taskIdResult = await dbManager.getCompletionByTaskId(this.selectedStudent.uid, task.taskId, 'dictation');
                                    console.log(`  - 과제 ID ${task.taskId} 확인 결과:`, taskIdResult);
                                    
                                    if (taskIdResult.success && taskIdResult.data) {
                                        isCompleted = true;
                                        completionDetails = {
                                            method: 'taskId',
                                            taskId: task.taskId,
                                            data: taskIdResult.data
                                        };
                                        console.log(`  ✅ 과제 ID 기반 완료 확인됨`);
                                    }
                                } catch (error) {
                                    console.log(`  ⚠️ 과제 ID 확인 오류:`, error);
                                }
                            }
                            
                            // 2차: 날짜 기반 확인 (하위 호환 및 백업)
                            if (!isCompleted) {
                                try {
                                    const dateResult = await dbManager.getCompletion(this.selectedStudent.uid, dateKey, 'dictation');
                                    console.log(`  - 날짜 ${dateKey} 확인 결과:`, dateResult);
                                    
                                    if (dateResult.success && dateResult.data) {
                                        isCompleted = true;
                                        completionDetails = {
                                            method: 'date',
                                            dateKey: dateKey,
                                            data: dateResult.data
                                        };
                                        console.log(`  ✅ 날짜 기반 완료 확인됨`);
                                    }
                                } catch (error) {
                                    console.log(`  ⚠️ 날짜 기반 확인 오류:`, error);
                                }
                            }
                            
                            // 3차: 교사 확인 상태 체크 (추가 검증)
                            if (completionDetails && completionDetails.data) {
                                const data = completionDetails.data;
                                const teacherConfirmed = data.confirmedByTeacher || data.teacherConfirmed || false;
                                console.log(`  - 교사 확인 여부:`, teacherConfirmed);
                                
                                if (teacherConfirmed) {
                                    completionDetails.teacherConfirmed = true;
                                }
                            }
                            
                            console.log(`🎯 과제 ${task.taskId} 최종 완료 상태:`, isCompleted, completionDetails);
                            
                            // 각 과제를 개별 항목으로 추가
                            tasks.push({
                                date: new Date(date),
                                dateKey: dateKey,
                                dateStr: utils.formatDateString(date),
                                taskId: task.taskId, // 개별 과제 ID
                                tasks: [task], // 단일 과제를 배열로
                                completed: isCompleted,
                                completionDetails: completionDetails
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`${dateKey} 과제 조회 오류:`, error);
            }
        }

        return tasks;
    }

    renderAllTasks(allTasks) {
        const resultEl = document.getElementById('allTasksResult');
        
        if (allTasks.length === 0) {
            resultEl.innerHTML = `
                <div style="text-align: center; color: #6c757d; padding: 40px;">
                    선택한 기간에 배정된 과제가 없습니다.
                </div>
            `;
            return;
        }

        const tasksHTML = allTasks.map(taskGroup => {
            const taskInfo = taskGroup.tasks.map(task => {
                let contentDisplay = '';
                
                if (task.sourceType === 'sentence') {
                    const sentences = Array.isArray(task.items) ? task.items : [task.items];
                    contentDisplay = `문장 ${sentences.length}개`;
                } else {
                    const items = Array.isArray(task.items) ? task.items.join(', ') : task.items;
                    contentDisplay = `문제 번호: ${items}`;
                }
                
                const taskIdDisplay = task.taskId ? `[ID: ${task.taskId}] ` : '';
                return `${taskIdDisplay}${contentDisplay} (속도: ${task.rate || 1.0}x)`;
            }).join(', ');

            const statusClass = taskGroup.completed ? 'completed' : '';
            let statusText = taskGroup.completed ? '완료' : '미완료';
            const statusBadge = taskGroup.completed ? 'completed' : 'pending';

            // 교사 확인 여부 표시
            let teacherConfirmIcon = '';
            if (taskGroup.completed && taskGroup.completionDetails) {
                const details = taskGroup.completionDetails;
                
                if (details.teacherConfirmed || (details.data && (details.data.confirmedByTeacher || details.data.teacherConfirmed))) {
                    teacherConfirmIcon = ' 👨‍🏫';
                    statusText += ' (교사확인)';
                } else if (details.method === 'taskId' && details.data) {
                    // 학생이 자동 제출한 경우
                    teacherConfirmIcon = ' 🎯';
                    statusText += ' (자동제출)';
                }
            }

            // 삭제 버튼 생성 (완료된 과제에만 표시)
            let deleteButton = '';
            if (taskGroup.completed && taskGroup.completionDetails && taskGroup.completionDetails.taskId) {
                deleteButton = `
                    <button class="btn btn-danger btn-small delete-completed-task-btn" 
                            data-task-id="${taskGroup.completionDetails.taskId}" 
                            style="margin-left: 10px; padding: 4px 8px; font-size: 11px;"
                            title="완료된 과제와 제출 데이터 완전 삭제">
                        🗑️ 삭제
                    </button>
                `;
            }

            return `
                <div class="task-list-item ${statusClass}">
                    <div class="task-info">
                        <div class="task-info-title">${taskGroup.dateStr}${teacherConfirmIcon}</div>
                        <div class="task-info-details">${taskInfo}</div>
                        ${taskGroup.completionDetails ? `
                            <div class="completion-method" style="font-size: 12px; color: #6c757d; margin-top: 5px;">
                                확인방식: ${taskGroup.completionDetails.method === 'taskId' ? '과제ID기반' : '날짜기반'}
                                ${taskGroup.completionDetails.taskId ? ` | ID: ${taskGroup.completionDetails.taskId}` : ''}
                            </div>
                        ` : ''}
                    </div>
                    <div class="task-actions" style="display: flex; align-items: center;">
                        <div class="completion-status ${statusBadge}">${statusText}</div>
                        ${deleteButton}
                    </div>
                </div>
            `;
        }).join('');

        resultEl.innerHTML = `
            <div style="margin-bottom: 15px; font-weight: 600; color: #2c3e50;">
                총 ${allTasks.length}일의 과제 (완료: ${allTasks.filter(t => t.completed).length}일)
            </div>
            ${tasksHTML}
        `;

        // 전체 과제 조회에서 삭제 버튼 이벤트 리스너 추가
        resultEl.querySelectorAll('.delete-completed-task-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = e.target.getAttribute('data-task-id');
                if (taskId) {
                    this.deleteCompletedTaskFromHistory(taskId);
                }
            });
        });
    }

    // 전체 과제 조회에서 완료된 과제 삭제
    async deleteCompletedTaskFromHistory(taskId) {
        if (!confirm(`📋 완료된 과제 "${taskId}"를 기록에서 완전히 삭제하시겠습니까?\n\n⚠️ 삭제되는 항목:\n• 학생 제출 데이터\n• 제출된 이미지 파일\n• 완료 기록\n\n※ 주의: 이미 과제 할당은 해제된 상태입니다.\n\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        try {
            console.log('🗑️ 완료된 과제 기록 삭제 시작:', taskId);

            // 무료 플랜 호환: Firestore 데이터만 삭제 (Storage는 보존)
            const deleteResult = await dbManager.deleteFirestoreDataOnly(this.selectedStudent.uid, taskId);
            
            if (deleteResult.success) {
                const { results } = deleteResult;
                let successMessage = `완료된 과제 ${taskId} 기록 삭제 완료!\n\n`;
                successMessage += `• 제출 데이터: ${results.submissionDeleted ? '✅ 삭제됨' : '❌ 없음'}\n`;
                if (results.cacheCleared) {
                    successMessage += `• 캐시 정리: ${results.cacheCleared}개 삭제됨\n`;
                }
                if (results.storageNote) {
                    successMessage += `• ${results.storageNote}\n`;
                }
                
                if (results.errors.length > 0) {
                    successMessage += `\n⚠️ 일부 오류:\n${results.errors.join('\n')}`;
                }
                
                console.log('✅ 완료된 과제 기록 삭제 성공:', results);
                alert(successMessage);
                
                // 전체 과제 조회 새로고침
                await this.viewAllTasks();
                
            } else {
                console.error('❌ 완료된 과제 기록 삭제 실패:', deleteResult);
                alert(`삭제 중 오류가 발생했습니다:\n${deleteResult.error}\n\n${deleteResult.results?.errors?.join('\n') || ''}`);
            }
            
        } catch (error) {
            console.error('❌ 완료된 과제 기록 삭제 처리 오류:', error);
            alert(`삭제 처리 중 오류가 발생했습니다: ${error.message}`);
        }
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

    // === 문장 기반 배정 시스템 ===

    previewSentenceAssign() {
        const assignments = this.generateSentenceAssignments();
        
        if (assignments.length === 0) {
            this.showAlert('sentenceAlert', '배정 조건을 확인해주세요.', 'error');
            return;
        }

        const previewText = assignments.slice(0, 10).map(a => 
            `${a.dateStr}: 문장 ${a.sentences.length}개 (속도: ${a.rate}x)`
        ).join('\n');
        
        const totalText = assignments.length > 10 
            ? `\n... 및 ${assignments.length - 10}일 더`
            : '';

        alert(`미리보기 (총 ${assignments.length}일):\n\n${previewText}${totalText}`);
    }

    async sentenceBulkAssign() {
        const assignments = this.generateSentenceAssignments();
        
        if (assignments.length === 0) {
            this.showAlert('sentenceAlert', '배정 조건을 확인해주세요.', 'error');
            return;
        }

        if (!confirm(`총 ${assignments.length}일의 과제를 배정하시겠습니까?`)) {
            return;
        }

        const bulkBtn = document.getElementById('sentenceBulkAssignBtn');
        const progressEl = document.getElementById('sentenceProgress');
        const progressBar = document.getElementById('sentenceProgressBar');
        const progressText = document.getElementById('sentenceProgressText');

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
                
                // 받아쓰기 과제를 유지하면서 새 과제 추가 (교체하지 않음)
                const updatedTasks = [...existingTasks]; // 기존 과제 모두 유지
                
                console.log('🔍 과제 할당 전 기존 과제들:', existingTasks.length, '개');
                console.log('기존 과제 상세:', existingTasks.map(t => ({id: t.taskId, type: t.type})));
                
                // 새 과제 ID 생성
                const nextSequence = utils.getNextSequenceForDate(existingTaskIds, assignment.dateKey);
                const taskId = utils.generateTaskId(assignment.dateKey, nextSequence);
                
                console.log('생성된 새 과제 ID:', taskId);
                
                updatedTasks.push({
                    taskId: taskId,
                    type: 'dictation',
                    sourceType: 'sentence',
                    items: assignment.sentences,
                    rate: assignment.rate,
                    assignedAt: Date.now()
                });

                const taskConfig = {
                    tasks: updatedTasks,
                    lastUpdated: Date.now()
                };
                
                console.log('📤 저장할 과제 설정:', taskConfig);
                console.log('저장할 과제 개수:', updatedTasks.length);
                console.log('저장할 과제 목록:', updatedTasks.map(t => ({id: t.taskId, type: t.type})));

                await dbManager.assignTask(this.selectedStudent.uid, assignment.dateKey, taskConfig);
                completed++;

            } catch (error) {
                console.error(`${assignment.dateStr} 배정 오류:`, error);
                errors++;
            }

            const progress = Math.round(((completed + errors) / assignments.length) * 100);
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `${progress}%`;
            progressText.textContent = `진행률: ${completed + errors}/${assignments.length}일 (성공: ${completed}, 실패: ${errors})`;

            // UI 업데이트를 위한 약간의 지연
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (errors === 0) {
            this.showAlert('sentenceAlert', `배정 완료: 총 ${completed}일의 과제가 성공적으로 배정되었습니다.`, 'success');
        } else {
            this.showAlert('sentenceAlert', `배정 완료: 성공 ${completed}일, 실패 ${errors}일`, 'error');
        }

        await this.loadCurrentAssignments();

        bulkBtn.disabled = false;
        bulkBtn.textContent = '📝 문장 기반 배정 시작';
        
        // 3초 후 진행률 숨기기
        setTimeout(() => {
            progressEl.style.display = 'none';
        }, 3000);
    }

    generateSentenceAssignments() {
        const startDate = new Date(document.getElementById('sentenceStartDate').value);
        const endDate = new Date(document.getElementById('sentenceEndDate').value);
        const sentencesText = document.getElementById('sentenceEditor').value.trim();
        const sentencesPerDay = parseInt(document.getElementById('sentencesPerDay').value) || 1;
        const rate = parseFloat(document.getElementById('sentenceRate').value) || 1.0;

        if (!startDate || !endDate || !sentencesText || startDate > endDate) {
            return [];
        }

        // 선택된 요일
        const selectedDays = [
            document.getElementById('sentenceMon').checked,
            document.getElementById('sentenceTue').checked,
            document.getElementById('sentenceWed').checked,
            document.getElementById('sentenceThu').checked,
            document.getElementById('sentenceFri').checked,
            document.getElementById('sentenceSat').checked,
            document.getElementById('sentenceSun').checked
        ];

        // 문장 파싱
        const allSentences = this.parseTextToSentences(sentencesText);
        if (allSentences.length === 0) return [];

        const assignments = [];
        let sentenceIndex = 0;

        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const dayOfWeek = date.getDay();
            const selectedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

            if (selectedDays[selectedIndex]) {
                const sentences = [];
                
                for (let i = 0; i < sentencesPerDay && sentenceIndex < allSentences.length; i++) {
                    sentences.push(allSentences[sentenceIndex]);
                    sentenceIndex++;
                }

                if (sentences.length > 0) {
                    assignments.push({
                        date: new Date(date),
                        dateKey: utils.formatDateKey(date),
                        dateStr: utils.formatDateString(date),
                        sentences: sentences,
                        rate: rate
                    });
                }

                if (sentenceIndex >= allSentences.length) break;
            }
        }

        return assignments;
    }

    // 모달 이벤트 설정
    setupModalEvents() {
        const modal = document.getElementById('assignmentDetailModal');
        const closeButtons = modal.querySelectorAll('.modal-close, .modal-close-btn');

        // 모달 닫기 이벤트
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        });

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        // ESC 키로 모달 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });

        // 제출 확인 버튼 이벤트
        const confirmBtn = document.getElementById('confirmSubmissionBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.confirmTaskSubmission();
            });
        }
    }

    // 과제 상세 정보 표시
    async showAssignmentDetail(taskData) {
        const modal = document.getElementById('assignmentDetailModal');
        
        // 문장 정보 표시
        const sentencesEl = document.getElementById('assignedSentences');
        if (taskData.sourceType === 'sentence' && taskData.items) {
            const sentences = Array.isArray(taskData.items) ? taskData.items : [taskData.items];
            sentencesEl.innerHTML = sentences.map((sentence, index) => `
                <div class="sentence-item">
                    <span style="font-weight: 600; color: #007bff; min-width: 30px;">${index + 1}.</span>
                    <span>${sentence}</span>
                </div>
            `).join('');
        } else {
            // 번호 기반 과제
            const items = Array.isArray(taskData.items) ? taskData.items : [taskData.items];
            sentencesEl.innerHTML = `
                <div class="sentence-item">
                    <span style="font-weight: 600; color: #007bff;">문제 번호:</span>
                    <span>${items.join(', ')}</span>
                </div>
            `;
        }

        // 제출 정보 확인 및 표시
        const isCompleted = await this.loadSubmissionInfo(taskData);
        
        // 완료 상태 표시
        const statusEl = document.getElementById('taskCompletionStatus');
        if (isCompleted) {
            statusEl.className = 'task-status-badge completed';
            statusEl.textContent = '✅ 완료됨';
        } else {
            statusEl.className = 'task-status-badge pending';
            statusEl.textContent = '📝 미완료';
        }

        // 모달 표시
        modal.style.display = 'flex';
    }

    async loadSubmissionInfo(taskData) {
        const submissionSection = document.getElementById('submissionSection');
        const submissionContent = document.getElementById('submissionContent');
        
        try {
            // 학생 콘솔과 동일한 방식으로 제출 데이터 조회 (getSubmissionByTaskId 사용)
            let completionResult;
            if (taskData.taskId) {
                console.log('🎯 과제 ID 기반으로 제출 데이터 조회 (학생 콘솔과 동일한 방식):', taskData.taskId);
                console.log('🔍 조회 대상 학생:', this.selectedStudent.uid);
                completionResult = await dbManager.getSubmissionByTaskId(this.selectedStudent.uid, taskData.taskId);
            } else {
                console.log('📅 날짜 기반으로 제출 데이터 조회 (하위 호환)');
                const today = utils.getTodayKey();
                completionResult = await dbManager.getCompletion(this.selectedStudent.uid, today, 'dictation');
            }
            
            console.log('🔍 교사 콘솔 상세보기 조회 결과:', completionResult);
            
            if (completionResult.success && completionResult.data) {
                const completionData = completionResult.data;
                console.log('받아쓰기 완료 데이터:', completionData);
                console.log('이미지 URL 확인:', completionData.imageUrl);
                console.log('제출 시간 확인:', completionData.submittedAt);
                console.log('모듈 ID 확인:', completionData.moduleId);
                
                // getSubmissionByTaskId는 다른 데이터 구조를 반환하므로 적절히 처리
                const hasSubmission = completionData.imageUrl || 
                                    completionData.submittedPhoto || 
                                    (completionData.answers && completionData.answers.length > 0) ||
                                    completionData.submittedAt; // 제출 시간이 있으면 제출된 것으로 간주
                
                if (hasSubmission) {
                    let contentHTML = '';
                    
                    // 제출 시간 가져오기 (여러 필드 시도)
                    const submissionTime = completionData.submittedAt || completionData.completedAt || Date.now();
                    
                    if (completionData.imageUrl) {
                        // Firebase Storage의 이미지가 있는 경우
                        contentHTML = `
                            <div class="submission-item">
                                <div class="submission-meta">
                                    <span>제출 시간</span>
                                    <span>${new Date(submissionTime).toLocaleString('ko-KR')}</span>
                                </div>
                                <img src="${completionData.imageUrl}" 
                                     alt="학생이 제출한 받아쓰기 답안" 
                                     class="submission-image"
                                     onclick="window.open('${completionData.imageUrl}', '_blank')"
                                     style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
                                <div style="margin-top: 10px; font-size: 12px; color: #6c757d;">
                                    이미지를 클릭하면 크게 볼 수 있습니다
                                </div>
                            </div>
                        `;
                    } else if (completionData.submittedPhoto) {
                        // Base64 이미지가 있는 경우 (백업용)
                        contentHTML = `
                            <div class="submission-item">
                                <div class="submission-meta">
                                    <span>제출 시간</span>
                                    <span>${new Date(submissionTime).toLocaleString('ko-KR')}</span>
                                </div>
                                <img src="${completionData.submittedPhoto}" 
                                     alt="학생이 제출한 받아쓰기 답안" 
                                     class="submission-image"
                                     onclick="window.open('${completionData.submittedPhoto}', '_blank')"
                                     style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
                                <div style="margin-top: 10px; font-size: 12px; color: #6c757d;">
                                    이미지를 클릭하면 크게 볼 수 있습니다
                                </div>
                            </div>
                        `;
                    } else if (completionData.answers && completionData.answers.length > 0) {
                        // 텍스트 답안만 있는 경우
                        contentHTML = completionData.answers.map((answer, index) => `
                            <div class="submission-item">
                                <div class="submission-meta">
                                    <span>문제 ${index + 1}</span>
                                    <span>${new Date(submissionTime).toLocaleString('ko-KR')}</span>
                                </div>
                                <div class="submission-text">${answer}</div>
                            </div>
                        `).join('');
                    } else {
                        // 제출 시간만 있는 경우 (기본 완료 표시)
                        contentHTML = `
                            <div class="submission-item">
                                <div class="submission-meta">
                                    <span>제출 완료</span>
                                    <span>${new Date(submissionTime).toLocaleString('ko-KR')}</span>
                                </div>
                                <div class="submission-text">과제가 제출되었습니다.</div>
                            </div>
                        `;
                    }
                    
                    submissionContent.innerHTML = contentHTML;
                    submissionSection.style.display = 'block';
                    
                    // 확인 버튼 활성화
                    const confirmBtn = document.getElementById('confirmSubmissionBtn');
                    confirmBtn.style.display = 'block';
                    
                    return true; // 완료됨
                } else {
                    // 제출된 과제가 없는 경우
                    submissionContent.innerHTML = `
                        <div class="no-submission">
                            아직 제출된 과제가 없습니다.
                        </div>
                    `;
                    submissionSection.style.display = 'block';
                    
                    // 확인 버튼 숨기기
                    const confirmBtn = document.getElementById('confirmSubmissionBtn');
                    confirmBtn.style.display = 'none';
                    
                    return false; // 미완료
                }
            } else {
                // 완료 데이터가 없는 경우
                submissionContent.innerHTML = `
                    <div class="no-submission">
                        아직 제출된 과제가 없습니다.
                    </div>
                `;
                submissionSection.style.display = 'block';
                
                // 확인 버튼 숨기기
                const confirmBtn = document.getElementById('confirmSubmissionBtn');
                confirmBtn.style.display = 'none';
                
                return false; // 미완료
            }
        } catch (error) {
            console.error('제출 정보 로드 오류:', error);
            submissionContent.innerHTML = `
                <div class="no-submission">
                    제출 정보를 불러오는 중 오류가 발생했습니다.
                </div>
            `;
            submissionSection.style.display = 'block';
            
            // 확인 버튼 숨기기
            const confirmBtn = document.getElementById('confirmSubmissionBtn');
            confirmBtn.style.display = 'none';
            
            return false; // 오류이므로 미완료로 처리
        }
    }

    async confirmTaskSubmission() {
        if (!confirm('이 과제의 제출을 확인하시겠습니까?\n\n확인하면:\n• 현재 배정된 과제에서 제거됩니다\n• 전체 과제 조회에서 "완료"로 표시됩니다\n• 학생이 해당 과제를 다시 수행할 수 없습니다')) {
            return;
        }

        try {
            const today = utils.getTodayKey();
            
            // 현재 과제 정보 가져오기
            const currentAssignment = await dbManager.getAssignment(this.selectedStudent.uid, today);
            let taskToConfirm = null;
            
            if (currentAssignment.success && currentAssignment.data.tasks) {
                // 받아쓰기 과제 찾기
                const dictationTasks = currentAssignment.data.tasks.filter(task => task.type === 'dictation');
                if (dictationTasks.length > 0) {
                    taskToConfirm = dictationTasks[0]; // 첫 번째 받아쓰기 과제
                }
            }
            
            // 1단계: 서버에 완료 상태 저장
            let completionResult;
            if (taskToConfirm && taskToConfirm.taskId) {
                // 과제 ID 기반 완료 표시 (새 방식)
                completionResult = await dbManager.markTaskAsCompletedByTaskId(
                    this.selectedStudent.uid, 
                    taskToConfirm.taskId, 
                    'dictation',
                    {
                        confirmedByTeacher: true,
                        confirmedAt: Date.now(),
                        confirmedBy: this.currentUser.uid,
                        taskDate: today
                    }
                );
                console.log('과제 ID 기반 완료 표시 결과:', completionResult);
            } else {
                // 기존 날짜 기반 완료 표시 (하위 호환)
                completionResult = await dbManager.markTaskAsConfirmed(this.selectedStudent.uid, today, 'dictation');
                console.log('날짜 기반 완료 표시 결과:', completionResult);
            }
            
            // 2단계: 배정된 과제에서 제거
            const removeResult = await dbManager.markTaskAsConfirmed(this.selectedStudent.uid, today, 'dictation');
            
            if (completionResult && completionResult.success && removeResult.success) {
                // 3단계: 학생의 localStorage에도 완료 상태 반영 (선택적)
                if (taskToConfirm && taskToConfirm.taskId) {
                    // 완료 상태를 localStorage에도 저장하여 학생이 재접근 시 차단
                    const completionData = {
                        userId: this.selectedStudent.uid,
                        taskId: taskToConfirm.taskId,
                        taskDate: today,
                        completedAt: Date.now(),
                        confirmedByTeacher: true,
                        confirmedBy: this.currentUser.uid,
                        lockAccess: true,
                        teacherConfirmed: true
                    };
                    
                    // 교사가 확인한 완료 상태임을 표시
                    console.log('교사 확인 완료 데이터:', completionData);
                }
                
                this.showAlert('sentenceAlert', '✅ 과제 제출이 확인되었습니다.\n• 현재 과제에서 제거됨\n• 전체 조회에서 완료로 표시됨\n• 학생 재수행 차단됨', 'success');
                
                // 모달 닫기
                document.getElementById('assignmentDetailModal').style.display = 'none';
                
                // 현재 과제 목록 새로고침
                await this.loadCurrentAssignments();
                
            } else {
                let errorMsg = '확인 처리 중 오류가 발생했습니다.';
                if (completionResult && !completionResult.success) {
                    errorMsg += '\n완료 상태 저장 실패: ' + (completionResult.error || '알 수 없는 오류');
                }
                if (!removeResult.success) {
                    errorMsg += '\n과제 제거 실패: ' + (removeResult.error || '알 수 없는 오류');
                }
                alert(errorMsg);
            }
        } catch (error) {
            console.error('과제 확인 오류:', error);
            alert('확인 처리 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // 디버깅: 1~5번 과제 상태 조사
    async debugTasksStatus() {
        const studentUid = this.selectedStudent.uid;
        const baseDate = "20250912";
        const taskIds = ["20250912_1", "20250912_2", "20250912_3", "20250912_4", "20250912_5"];

        console.log("=== 1~5번 과제 상태 조사 시작 ===");

        // 1. Assignment 데이터 확인
        const assignmentResult = await dbManager.getAssignment(studentUid, baseDate);
        console.log("📋 Assignment 데이터:", assignmentResult);
        if (assignmentResult.success && assignmentResult.data && assignmentResult.data.tasks) {
            console.log("  현재 Assignment에 있는 과제들:");
            assignmentResult.data.tasks.forEach(task => {
                console.log(`    - ${task.taskId}: ${task.type}`);
            });
        } else {
            console.log("  ❌ Assignment 데이터 없음");
        }

        // 2. 각 과제 ID별 상세 조사
        for (const taskId of taskIds) {
            console.log(`\n🔍 과제 ${taskId} 조사:`);
            
            // Submission 데이터 확인
            try {
                const submissionResult = await dbManager.getSubmissionByTaskId(studentUid, taskId);
                console.log(`  Submission: ${submissionResult.success ? "✅ 존재함" : "❌ 없음"}`);
                if (submissionResult.success && submissionResult.data) {
                    console.log(`    제출 시간:`, new Date(submissionResult.data.submittedAt).toLocaleString());
                    console.log(`    과제 타입:`, submissionResult.data.taskType);
                }
            } catch (error) {
                console.log(`  Submission 확인 오류:`, error);
            }
            
            // Completion 데이터 확인
            try {
                const completionResult = await dbManager.getCompletionByTaskId(studentUid, taskId, 'dictation');
                console.log(`  Completion: ${completionResult.success ? "✅ 존재함" : "❌ 없음"}`);
                if (completionResult.success && completionResult.data) {
                    console.log(`    완료 시간:`, new Date(completionResult.data.completedAt).toLocaleString());
                }
            } catch (error) {
                console.log(`  Completion 확인 오류:`, error);
            }
        }

        console.log("=== 조사 완료 ===");
    }

    // 고아 데이터 정리 함수
    async cleanupOrphanData() {
        if (!confirm('⚠️ 고아 데이터 정리를 실행하시겠습니까?\n\n다음이 완전히 삭제됩니다:\n• 할당 목록에 없는 과제의 제출 데이터\n• 할당 목록에 없는 과제의 완료 기록\n• 관련 이미지 및 캐시 데이터\n\n이 작업은 되돌릴 수 없습니다.')) {
            return;
        }

        const studentUid = this.selectedStudent.uid;
        const baseDate = "20250912";
        
        console.log("=== 고아 데이터 정리 시작 ===");
        
        try {
            // 1. 현재 할당된 과제 목록 확인
            const assignmentResult = await dbManager.getAssignment(studentUid, baseDate);
            const assignedTaskIds = [];
            
            if (assignmentResult.success && assignmentResult.data && assignmentResult.data.tasks) {
                assignedTaskIds.push(...assignmentResult.data.tasks.map(task => task.taskId));
                console.log("📋 현재 할당된 과제 ID들:", assignedTaskIds);
            }
            
            // 2. 모든 가능한 과제 ID 목록 (1~10번까지 체크)
            const allPossibleTaskIds = [];
            for (let i = 1; i <= 10; i++) {
                allPossibleTaskIds.push(`${baseDate}_${i}`);
            }
            
            // 3. 고아 데이터 찾기 (할당되지 않았지만 데이터가 있는 과제들)
            const orphanTasks = [];
            
            for (const taskId of allPossibleTaskIds) {
                if (!assignedTaskIds.includes(taskId)) {
                    // 할당되지 않은 과제인데 데이터가 있는지 확인
                    const hasSubmission = await this.checkHasSubmission(studentUid, taskId);
                    const hasCompletion = await this.checkHasCompletion(studentUid, taskId);
                    
                    if (hasSubmission || hasCompletion) {
                        orphanTasks.push({
                            taskId: taskId,
                            hasSubmission: hasSubmission,
                            hasCompletion: hasCompletion
                        });
                        console.log(`🔍 고아 데이터 발견: ${taskId} (Submission: ${hasSubmission ? '✅' : '❌'}, Completion: ${hasCompletion ? '✅' : '❌'})`);
                    }
                }
            }
            
            if (orphanTasks.length === 0) {
                console.log("✅ 정리할 고아 데이터가 없습니다.");
                alert("정리할 고아 데이터가 없습니다.");
                return;
            }
            
            console.log(`📊 발견된 고아 데이터: ${orphanTasks.length}개`);
            
            // 4. 고아 데이터 삭제 실행
            let cleanedCount = 0;
            const errors = [];
            
            for (const orphan of orphanTasks) {
                try {
                    console.log(`🧹 ${orphan.taskId} 고아 데이터 정리 중...`);
                    
                    const deleteResult = await dbManager.deleteFirestoreDataOnly(studentUid, orphan.taskId);
                    
                    if (deleteResult && deleteResult.success) {
                        console.log(`✅ ${orphan.taskId} 정리 완료`);
                        cleanedCount++;
                    } else {
                        console.error(`❌ ${orphan.taskId} 정리 실패:`, deleteResult?.error);
                        errors.push(`${orphan.taskId}: ${deleteResult?.error || '알 수 없는 오류'}`);
                    }
                } catch (error) {
                    console.error(`❌ ${orphan.taskId} 정리 중 오류:`, error);
                    errors.push(`${orphan.taskId}: ${error.message}`);
                }
                
                // 잠깐 대기 (과부하 방지)
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // 5. 결과 보고
            let resultMessage = `🎉 고아 데이터 정리 완료!\n\n`;
            resultMessage += `• 정리된 과제: ${cleanedCount}개\n`;
            resultMessage += `• 실패: ${errors.length}개\n`;
            
            if (errors.length > 0) {
                resultMessage += `\n❌ 실패한 항목:\n${errors.join('\n')}`;
            }
            
            console.log("=== 고아 데이터 정리 완료 ===");
            console.log(resultMessage);
            alert(resultMessage);
            
            // 6. UI 새로고침 (정리 후 업데이트)
            await this.loadCurrentAssignments();
            
        } catch (error) {
            console.error("❌ 고아 데이터 정리 중 오류:", error);
            alert(`고아 데이터 정리 중 오류가 발생했습니다: ${error.message}`);
        }
    }

    // 헬퍼 함수: Submission 데이터 존재 여부 확인
    async checkHasSubmission(userId, taskId) {
        try {
            const result = await dbManager.getSubmissionByTaskId(userId, taskId);
            // success가 true이고 data가 null이 아니고 빈 객체가 아닌 경우만 true
            const hasData = result.success && result.data && Object.keys(result.data).length > 0;
            console.log(`🔍 checkHasSubmission - ${taskId}:`, { 
                success: result.success, 
                hasData: !!result.data, 
                dataKeys: result.data ? Object.keys(result.data).length : 0,
                결과: hasData 
            });
            return hasData;
        } catch (error) {
            console.log(`❌ checkHasSubmission 오류 - ${taskId}:`, error);
            return false;
        }
    }

    // 헬퍼 함수: Completion 데이터 존재 여부 확인  
    async checkHasCompletion(userId, taskId) {
        try {
            const result = await dbManager.getCompletionByTaskId(userId, taskId, 'dictation');
            // success가 true이고 data가 null이 아니고 빈 객체가 아닌 경우만 true
            const hasData = result.success && result.data && Object.keys(result.data).length > 0;
            console.log(`🔍 checkHasCompletion - ${taskId}:`, { 
                success: result.success, 
                hasData: !!result.data, 
                dataKeys: result.data ? Object.keys(result.data).length : 0,
                결과: hasData 
            });
            return hasData;
        } catch (error) {
            console.log(`❌ checkHasCompletion 오류 - ${taskId}:`, error);
            return false;
        }
    }

    // 고아 데이터 정리 결과 검증 함수
    async verifyCleanupResult() {
        if (!this.selectedStudent) {
            alert('학생을 먼저 선택해주세요.');
            return;
        }

        console.log('🔍 고아 데이터 정리 결과 검증 시작...');
        
        const studentUid = this.selectedStudent.uid;
        const today = new Date();
        const baseDate = utils.formatDateKey(today);
        
        try {
            // 1. 현재 할당된 과제 목록 확인
            const assignmentResult = await dbManager.getAssignment(studentUid, baseDate);
            const assignedTaskIds = assignmentResult.success && assignmentResult.data?.tasks 
                ? assignmentResult.data.tasks.map(task => task.taskId) 
                : [];
            
            console.log('📋 현재 할당된 과제:', assignedTaskIds);
            
            // 2. 모든 가능한 과제 ID 확인 (1-10번)
            const allPossibleTaskIds = Array.from({length: 10}, (_, i) => `${baseDate}_${i + 1}`);
            
            // 3. 고아 데이터 탐지
            const orphanReport = [];
            const cleanReport = [];
            
            for (const taskId of allPossibleTaskIds) {
                const isAssigned = assignedTaskIds.includes(taskId);
                const hasSubmission = await this.checkHasSubmission(studentUid, taskId);
                const hasCompletion = await this.checkHasCompletion(studentUid, taskId);
                
                if (isAssigned) {
                    // 할당된 과제
                    cleanReport.push({
                        taskId,
                        status: '정상 할당',
                        hasData: hasSubmission || hasCompletion
                    });
                } else if (hasSubmission || hasCompletion) {
                    // 고아 데이터 발견
                    orphanReport.push({
                        taskId,
                        hasSubmission,
                        hasCompletion
                    });
                } else {
                    // 깨끗한 상태
                    cleanReport.push({
                        taskId,
                        status: '깨끗함',
                        hasData: false
                    });
                }
            }
            
            // 4. 검증 결과 출력
            console.log('\n📊 검증 결과:');
            console.log(`✅ 정상 할당된 과제: ${assignedTaskIds.length}개`);
            console.log(`🧹 깨끗한 과제: ${cleanReport.filter(r => r.status === '깨끗함').length}개`);
            console.log(`⚠️ 고아 데이터: ${orphanReport.length}개`);
            
            if (orphanReport.length > 0) {
                console.log('\n🔍 발견된 고아 데이터:');
                orphanReport.forEach(orphan => {
                    console.log(`  • ${orphan.taskId}:`, {
                        제출데이터: orphan.hasSubmission ? '있음' : '없음',
                        완료데이터: orphan.hasCompletion ? '있음' : '없음'
                    });
                });
            }
            
            // 5. 사용자에게 결과 표시
            let message = `🔍 고아 데이터 검증 결과\n\n`;
            message += `✅ 정상 할당된 과제: ${assignedTaskIds.length}개\n`;
            message += `🧹 깨끗한 과제: ${cleanReport.filter(r => r.status === '깨끗함').length}개\n`;
            message += `⚠️ 고아 데이터: ${orphanReport.length}개\n`;
            
            if (orphanReport.length > 0) {
                message += `\n발견된 고아 데이터:\n`;
                orphanReport.forEach(orphan => {
                    message += `• ${orphan.taskId}: `;
                    const parts = [];
                    if (orphan.hasSubmission) parts.push('제출데이터');
                    if (orphan.hasCompletion) parts.push('완료데이터');
                    message += parts.join(', ') + '\n';
                });
                message += `\n"🧹 고아 데이터 정리" 버튼으로 정리하세요.`;
            } else {
                message += `\n🎉 모든 데이터가 깨끗합니다!`;
            }
            
            alert(message);
            
        } catch (error) {
            console.error('❌ 검증 중 오류:', error);
            alert('검증 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
        }
    }
}

// 앱 초기화
window.dictationManagement = new DictationManagement();

console.log('받아쓰기 관리 스크립트 로드 완료');