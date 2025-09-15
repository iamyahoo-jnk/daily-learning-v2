// modules/reading/app.js - 읽기 모듈
import { authManager } from '../../core/auth.js';
import { dbManager } from '../../core/database.js';
import { APP_CONFIG, utils } from '../../config/app-config.js';

class ReadingModule {
    constructor() {
        this.currentUser = null;
        this.taskData = null;
        this.currentText = '';
        this.currentRate = 1.0;
        this.isCompleted = false;
        
        this.initializeModule();
        this.setupEventListeners();
        this.setupAuthListener();
    }

    initializeModule() {
        console.log('읽기 모듈 초기화 시작');
        
        // URL 파라미터 파싱
        const params = new URLSearchParams(window.location.search);
        this.taskData = {
            uid: params.get('uid'),
            date: params.get('date'),
            items: params.get('items')?.split(',').map(n => parseInt(n.trim())),
            rate: parseFloat(params.get('rate')) || 1.0
        };

        console.log('Task Data:', this.taskData);

        if (!this.taskData.uid || !this.taskData.date) {
            this.showError('잘못된 접근입니다. 학생 앱에서 다시 시작해주세요.');
            return;
        }

        // 초기 속도 설정
        this.currentRate = this.taskData.rate;
        this.updateSpeedDisplay();
        
        console.log('읽기 모듈 초기화 완료');
    }

    setupEventListeners() {
        // 재생 버튼들
        document.getElementById('listenBtn').addEventListener('click', () => this.readText());
        document.getElementById('repeatBtn').addEventListener('click', () => this.readText());

        // 속도 슬라이더
        const speedSlider = document.getElementById('speedSlider');
        speedSlider.value = this.currentRate;
        speedSlider.addEventListener('input', (e) => {
            this.currentRate = parseFloat(e.target.value);
            this.updateSpeedDisplay();
        });

        // 완료 버튼
        document.getElementById('completeBtn').addEventListener('click', () => this.completeTask());

        console.log('이벤트 리스너 설정 완료');
    }

    setupAuthListener() {
        authManager.addAuthListener(async (user) => {
            this.currentUser = user;

            if (user && user.uid === this.taskData.uid) {
                await this.loadText();
            } else {
                this.showError('로그인 정보가 일치하지 않습니다.');
            }
        });
    }

    async loadText() {
        if (!this.taskData.items || this.taskData.items.length === 0) {
            this.showError('문제 번호가 지정되지 않았습니다.');
            return;
        }

        // 첫 번째 문제 번호 사용
        const problemNumber = this.taskData.items[0];
        
        this.updateStatusInfo('문제를 불러오는 중...');
        this.showTaskInfo(problemNumber);

        try {
            const textUrl = `${APP_CONFIG.assetsBase}/dictation/${problemNumber}.txt`;
            const response = await fetch(textUrl);
            
            if (!response.ok) {
                throw new Error(`문제 ${problemNumber}을 찾을 수 없습니다.`);
            }

            this.currentText = (await response.text()).trim();
            
            if (!this.currentText) {
                throw new Error('문제 내용이 비어있습니다.');
            }

            this.displayText();
            this.updateStatusInfo('텍스트를 확인하고 읽어주기 버튼을 클릭하세요.');
            this.enableControls();

            console.log('텍스트 로드 완료:', problemNumber, this.currentText);

        } catch (error) {
            console.error('텍스트 로드 오류:', error);
            this.showError(`텍스트를 불러올 수 없습니다: ${error.message}`);
        }
    }

    displayText() {
        const textContentEl = document.getElementById('textContent');
        textContentEl.textContent = this.currentText;
        textContentEl.classList.add('fade-in');

        // 긴 텍스트의 경우 폰트 크기 조정
        if (this.currentText.length > 50) {
            textContentEl.classList.remove('large-text');
        } else {
            textContentEl.classList.add('large-text');
        }
    }

    showTaskInfo(problemNumber) {
        document.getElementById('problemNumber').textContent = problemNumber;
        document.getElementById('playbackSpeed').textContent = `${this.currentRate}x`;
        document.getElementById('taskInfo').style.display = 'block';
    }

    updateStatusInfo(message) {
        document.getElementById('statusInfo').textContent = message;
    }

    updateSpeedDisplay() {
        document.getElementById('speedValue').textContent = `${this.currentRate}x`;
        document.getElementById('playbackSpeed').textContent = `${this.currentRate}x`;
    }

    enableControls() {
        document.getElementById('listenBtn').disabled = false;
        document.getElementById('repeatBtn').disabled = false;
        document.getElementById('completeBtn').disabled = false;
    }

    readText() {
        if (!this.currentText) {
            this.showError('읽을 텍스트가 없습니다.');
            return;
        }

        // Web Speech API를 사용한 TTS
        if (!('speechSynthesis' in window)) {
            this.showError('이 브라우저는 음성 재생을 지원하지 않습니다.');
            return;
        }

        // 기존 음성 중단
        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(this.currentText);
        
        // 한국어 음성 찾기
        const voices = speechSynthesis.getVoices();
        const koreanVoice = voices.find(voice => 
            voice.lang.startsWith('ko') || voice.lang.startsWith('ko-KR')
        );
        
        if (koreanVoice) {
            utterance.voice = koreanVoice;
        }

        utterance.rate = this.currentRate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // 재생 상태 피드백
        const listenBtn = document.getElementById('listenBtn');
        const originalText = listenBtn.textContent;
        
        utterance.onstart = () => {
            listenBtn.textContent = '🔊 읽는 중...';
            listenBtn.classList.add('pulse');
            this.updateStatusInfo('텍스트를 읽어주고 있습니다...');
            
            // 텍스트 하이라이트 효과
            const textContentEl = document.getElementById('textContent');
            textContentEl.classList.add('text-highlight');
        };

        utterance.onend = () => {
            listenBtn.textContent = originalText;
            listenBtn.classList.remove('pulse');
            this.updateStatusInfo('읽기가 완료되었습니다. 완료 버튼을 클릭하세요.');
            
            // 하이라이트 효과 제거
            const textContentEl = document.getElementById('textContent');
            textContentEl.classList.remove('text-highlight');
        };

        utterance.onerror = (event) => {
            listenBtn.textContent = originalText;
            listenBtn.classList.remove('pulse');
            console.error('음성 재생 오류:', event);
            this.showError('음성 재생 중 오류가 발생했습니다.');
            
            // 하이라이트 효과 제거
            const textContentEl = document.getElementById('textContent');
            textContentEl.classList.remove('text-highlight');
        };

        speechSynthesis.speak(utterance);
    }

    async completeTask() {
        if (this.isCompleted) {
            this.closeWindow();
            return;
        }

        const completeBtn = document.getElementById('completeBtn');
        completeBtn.disabled = true;
        completeBtn.textContent = '완료 처리 중...';

        try {
            // 제출 기록 저장
            await this.saveCompletion();

            // 완료 상태 표시
            this.showCompletion();
            this.isCompleted = true;

            // 부모 창에 완료 알림 (학생 앱에서 감지)
            if (window.opener && !window.opener.closed) {
                window.opener.postMessage({
                    type: 'taskCompleted',
                    moduleId: 'reading',
                    result: true
                }, '*');
            }

            // 버튼 텍스트 변경
            completeBtn.textContent = '창 닫기';
            completeBtn.disabled = false;

        } catch (error) {
            console.error('완료 처리 오류:', error);
            this.showError('완료 처리 중 오류가 발생했습니다: ' + error.message);
            completeBtn.disabled = false;
            completeBtn.textContent = '✅ 완료하기';
        }
    }

    showCompletion() {
        const completionSection = document.getElementById('completionSection');
        completionSection.classList.add('show', 'fade-in');
        
        this.updateStatusInfo('읽기를 성공적으로 완료했습니다!');
        
        // 완료 섹션으로 스크롤
        completionSection.scrollIntoView({ behavior: 'smooth' });
    }

    async saveCompletion() {
        if (!this.currentUser || !this.taskData.date) return;

        const submissionData = {
            score: 1, // 읽기는 완료하면 항상 1점
            readingText: this.currentText,
            problemNumber: this.taskData.items[0],
            playbackRate: this.currentRate,
            submittedAt: Date.now(),
            completedAt: Date.now(),
            textLength: this.currentText.length
        };

        try {
            await dbManager.submitTask(
                this.currentUser.uid, 
                this.taskData.date, 
                'reading', 
                submissionData
            );

            console.log('완료 기록 저장 완료:', submissionData);

        } catch (error) {
            console.error('완료 기록 저장 실패:', error);
            // 에러가 있어도 사용자에게는 성공으로 표시 (UX 개선)
        }
    }

    closeWindow() {
        // 3초 후 창 자동 닫기
        setTimeout(() => {
            window.close();
        }, 1000);
        
        this.updateStatusInfo('1초 후 창이 자동으로 닫힙니다...');
    }

    showError(message) {
        document.getElementById('statusInfo').textContent = `오류: ${message}`;
        document.getElementById('statusInfo').style.color = '#dc3545';
        
        // 텍스트 표시 영역에도 오류 표시
        const textContentEl = document.getElementById('textContent');
        textContentEl.textContent = message;
        textContentEl.style.color = '#dc3545';
        
        console.error('Reading Error:', message);
    }
}

// 모듈 초기화
window.readingModule = new ReadingModule();

// 음성 목록이 로드된 후 초기화 (브라우저별 차이 대응)
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {
        console.log('음성 목록 로드 완료');
    };
}

console.log('읽기 모듈 스크립트 로드 완료');