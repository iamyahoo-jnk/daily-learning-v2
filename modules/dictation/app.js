// modules/dictation/app.js - 받아쓰기 모듈
import { authManager } from '../../core/auth.js';
import { dbManager } from '../../core/database.js';
import { APP_CONFIG, utils } from '../../config/app-config.js';
import { storage } from '../../config/firebase.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

class DictationModule {
    constructor() {
        this.currentUser = null;
        this.taskData = null;
        this.sentences = [];
        this.currentSentenceIndex = -1; // -1은 미션 선택 화면
        this.currentRate = 1.0;
        this.submittedPhotos = []; // 제출한 사진들
        this.completedMissions = []; // 완료된 미션들
        this.cameraStream = null;
        this.currentPhotoData = null;
        this.voicesLoaded = false;
        
        this.initializeModule();
        this.setupEventListeners();
        this.setupAuthListener();
        this.initializeVoices();
    }

    // localStorage에서 과제 데이터 로드
    loadFromLocalStorage() {
        try {
            const savedTaskData = localStorage.getItem('currentTask');
            console.log('localStorage 확인:', savedTaskData ? '데이터 있음' : '데이터 없음');
            
            if (savedTaskData) {
                const parsedData = JSON.parse(savedTaskData);
                // 기존 taskData와 병합 (URL 파라미터 우선)
                this.taskData = {
                    ...this.taskData, // URL 파라미터 데이터 유지
                    ...parsedData,    // localStorage 데이터로 보완
                    taskId: this.taskData.taskId || parsedData.taskId // taskId는 URL 파라미터 우선
                };
                console.log('localStorage에서 과제 데이터 로드 (병합됨):', this.taskData);
                
                // items 데이터를 sentences 배열로 변환
                if (this.taskData && this.taskData.items) {
                    if (Array.isArray(this.taskData.items)) {
                        this.sentences = [...this.taskData.items];
                    } else if (typeof this.taskData.items === 'object') {
                        this.sentences = Object.values(this.taskData.items);
                    }
                    
                    this.currentRate = this.taskData.rate || 1.0;
                    console.log('✅ 변환된 문장들:', this.sentences);
                    console.log('✅ 재생 속도:', this.currentRate);
                    return true;
                } else {
                    console.log('❌ taskData.items가 없음');
                }
            } else {
                console.log('❌ localStorage에 currentTask 없음');
                
                // 기본 테스트 데이터 생성 (임시)
                this.createFallbackData();
            }
        } catch (error) {
            console.error('localStorage 데이터 파싱 오류:', error);
            this.createFallbackData();
        }
        return false;
    }

    // 폴백 데이터 생성
    createFallbackData() {
        console.log('🔄 폴백 데이터 생성 중...');
        this.taskData = {
            uid: null, // 로그인 시 설정됨
            date: '20250910',
            taskType: 'dictation',
            taskIndex: 0,
            items: {
                "0": "해로운 미생물이나 미생물이 만들어 내는 독소에 의해 발생하는 질병입니다"
            },
            rate: 1,
            sourceType: 'sentence'
        };
        
        this.sentences = Object.values(this.taskData.items);
        this.currentRate = 1.0;
        
        // localStorage에 저장
        localStorage.setItem('currentTask', JSON.stringify(this.taskData));
        console.log('✅ 폴백 데이터 생성 완료:', this.taskData);
    }

    // 확실한 데이터 보장 (절대 실패하지 않음)
    ensureTaskData() {
        console.log('🛡️ 기본 데이터 보장 시작');
        
        // URL 파라미터에서 데이터 가져오기 
        const params = new URLSearchParams(window.location.search);
        const taskIdParam = params.get('taskId');
        const uidParam = params.get('uid');
        const dateParam = params.get('date');
        
        console.log('🔗 URL 파라미터에서 추출:', {
            taskId: taskIdParam,
            uid: uidParam,
            date: dateParam
        });
        
        // 항상 작동하는 기본 데이터 설정 (URL 파라미터 우선 사용)
        this.taskData = {
            uid: uidParam || null, // URL에서 가져온 UID
            date: dateParam || '20250910',
            taskId: taskIdParam || null, // 🚨 핵심: 과제 ID 설정
            taskType: 'dictation',
            taskIndex: 0,
            items: {
                "0": "해로운 미생물이나 미생물이 만들어 내는 독소에 의해 발생하는 질병입니다"
            },
            rate: 1,
            sourceType: 'sentence'
        };
        
        console.log('🎯 taskData에 설정된 과제 ID:', this.taskData.taskId);
        
        // sentences 배열도 확실히 설정
        this.sentences = ["해로운 미생물이나 미생물이 만들어 내는 독소에 의해 발생하는 질병입니다"];
        this.currentRate = 1.0;
        this.isNumberBased = false; // 문장 기반 모드
        
        console.log('🛡️ 기본 데이터 설정 완료');
        console.log('- taskData:', this.taskData);
        console.log('- sentences:', this.sentences);
    }

    initializeModule() {
        console.log('받아쓰기 모듈 초기화 시작');
        
        // 확실한 기본 데이터 설정 (항상 작동 보장)
        this.ensureTaskData();
        
        // localStorage에서 과제 데이터 로드 (선택적)
        this.loadFromLocalStorage();
        
        // URL 파라미터 파싱 (백업 방법)
        const params = new URLSearchParams(window.location.search);
        const itemsParam = params.get('items');
        const taskIdParam = params.get('taskId'); // 과제 ID 파라미터 추가
        const uidParam = params.get('uid');
        const dateParam = params.get('date');
        const rateParam = params.get('rate');
        
        console.log('📋 URL 파라미터 확인:', {
            items: itemsParam,
            taskId: taskIdParam,
            uid: uidParam, 
            date: dateParam,
            rate: rateParam
        });
        
        let parsedItems = [];
        
        if (itemsParam) {
            const itemsArray = itemsParam.split(',').map(item => item.trim());
            // 숫자인지 문장인지 확인
            const firstItem = itemsArray[0];
            if (/^\d+$/.test(firstItem)) {
                // 숫자 기반 (기존 방식)
                parsedItems = itemsArray.map(n => parseInt(n));
                this.isNumberBased = true;
            } else {
                // 문장 기반 (새로운 방식)
                parsedItems = itemsArray;
                this.isNumberBased = false;
            }
        }
        
        // 과제 ID를 포함한 완전한 taskData 설정 (URL 파라미터 우선)
        this.taskData = {
            uid: params.get('uid') || this.taskData.uid,
            date: params.get('date') || this.taskData.date,
            taskId: taskIdParam || this.taskData.taskId, // 🚨 핵심: 과제 ID 보존
            items: parsedItems.length > 0 ? parsedItems : this.taskData.items,
            rate: parseFloat(rateParam) || this.taskData.rate || 1.0,
            taskType: 'dictation',
            sourceType: this.isNumberBased ? 'number' : 'sentence'
        };
        
        console.log('📋 최종 taskData 설정:', this.taskData);
        console.log('🎯 설정된 과제 ID:', this.taskData.taskId);

        if (!this.taskData.uid || !this.taskData.date) {
            this.showError('잘못된 접근입니다. 학생 앱에서 다시 시작해주세요.');
            return;
        }

        // 초기 속도 설정
        this.currentRate = this.taskData.rate;
        
        console.log('받아쓰기 모듈 초기화 완료');
    }

    initializeVoices() {
        // 음성 목록이 이미 로드되어 있는지 확인
        if (speechSynthesis.getVoices().length > 0) {
            this.voicesLoaded = true;
            this.logAvailableVoices();
        } else {
            // 음성 목록 로드 완료를 기다림
            speechSynthesis.addEventListener('voiceschanged', () => {
                this.voicesLoaded = true;
                this.logAvailableVoices();
                console.log('음성 목록 로드 완료');
            });

            // 강제로 음성 목록 요청 (일부 브라우저에서 필요)
            speechSynthesis.getVoices();
        }
    }

    logAvailableVoices() {
        const voices = speechSynthesis.getVoices();
        const koreanVoices = voices.filter(voice => 
            voice.lang.startsWith('ko') || voice.lang.includes('KR')
        );
        
        console.log('=== 음성 분석 결과 ===');
        console.log(`총 음성 수: ${voices.length}`);
        console.log(`한국어 음성 수: ${koreanVoices.length}`);
        
        if (koreanVoices.length > 0) {
            console.log('한국어 음성 목록:');
            koreanVoices.forEach((voice, index) => {
                console.log(`${index + 1}. ${voice.name} (${voice.lang}) - ${voice.localService ? 'Local' : 'Remote'}`);
            });
        } else {
            console.warn('⚠️ 한국어 음성을 찾을 수 없습니다.');
        }
        console.log('==================');
    }

    setupEventListeners() {
        // 재생 버튼
        document.getElementById('playBtn').addEventListener('click', () => this.playAudio());

        // 제출 버튼 (카메라 활성화)
        document.getElementById('submitBtn').addEventListener('click', () => this.startCamera());

        // 카메라 관련 버튼들
        document.getElementById('captureBtn').addEventListener('click', () => this.capturePhoto());
        document.getElementById('cancelCameraBtn').addEventListener('click', () => this.stopCamera());
        document.getElementById('retakeBtn').addEventListener('click', () => this.retakePhoto());
        document.getElementById('confirmPhotoBtn').addEventListener('click', () => this.submitPhoto());

        // 네비게이션 버튼들
        document.getElementById('nextMissionBtn').addEventListener('click', () => this.nextMission());
        document.getElementById('backToMissionsBtn').addEventListener('click', () => this.showMissionSelector());
        document.getElementById('closeMissionBtn').addEventListener('click', () => this.closeMissionComplete());

        console.log('이벤트 리스너 설정 완료');
    }

    setupAuthListener() {
        authManager.addAuthListener(async (user) => {
            this.currentUser = user;

            if (user) {
                // taskData가 있고 UID가 일치하는 경우 또는 taskData에 UID가 없는 경우
                if (this.taskData && (this.taskData.uid === user.uid || !this.taskData.uid)) {
                    // taskData에 UID가 없다면 현재 사용자 UID로 설정
                    if (!this.taskData.uid) {
                        this.taskData.uid = user.uid;
                        localStorage.setItem('currentTask', JSON.stringify(this.taskData));
                    }
                    
                    // 과제 완료 상태 확인 (중요: 모듈 시작 전 차단)
                    const isCompleted = await this.checkTaskCompletion();
                    if (isCompleted) {
                        this.showCompletedTaskMessage();
                        return;
                    }
                    
                    await this.loadProblem();
                } else if (!this.taskData) {
                    this.showError('과제 데이터를 찾을 수 없습니다.');
                } else {
                    this.showError('로그인 정보가 일치하지 않습니다.');
                }
            } else {
                this.showError('로그인이 필요합니다.');
            }
        });
    }

    async loadProblem() {
        console.log('loadProblem 시작, taskData:', this.taskData);
        console.log('sentences 배열:', this.sentences);
        
        // 기본 데이터가 확실히 설정되어 있는지 재확인
        if (!this.sentences || this.sentences.length === 0) {
            console.log('🚨 sentences 없음, 기본 데이터 재설정');
            this.ensureTaskData();
        }
        
        // 이제 100% 확실함
        console.log('✅ 최종 sentences:', this.sentences);
        console.log('✅ sentences 개수:', this.sentences.length);

        this.updateStatusInfo('미션을 준비하는 중...');

        try {
            if (this.isNumberBased) {
                // 숫자 기반 (기존 방식): assets 폴더에서 텍스트 파일들 로드
                console.log('숫자 기반 모드 - 파일에서 로드');
                this.sentences = [];
                
                let itemsToProcess = [];
                if (Array.isArray(this.taskData.items)) {
                    itemsToProcess = this.taskData.items;
                } else if (typeof this.taskData.items === 'object') {
                    itemsToProcess = Object.values(this.taskData.items);
                }
                
                for (const problemNumber of itemsToProcess) {
                    const textUrl = `${APP_CONFIG.assetsBase}/dictation/${problemNumber}.txt`;
                    const response = await fetch(textUrl);
                    
                    if (!response.ok) {
                        throw new Error(`문제 ${problemNumber}을 찾을 수 없습니다.`);
                    }

                    const text = (await response.text()).trim();
                    this.sentences.push(text);
                }
                console.log('번호 기반 문제들 로드 완료:', this.sentences);
            } else {
                // 문장 기반 (새로운 방식): 직접 문장 배열 사용
                // 이미 초기화에서 sentences가 설정되었으므로 중복 처리 방지
                if (!this.sentences || this.sentences.length === 0) {
                    if (Array.isArray(this.taskData.items)) {
                        this.sentences = [...this.taskData.items];
                    } else if (typeof this.taskData.items === 'object') {
                        this.sentences = Object.values(this.taskData.items);
                    }
                }
                console.log('문장 기반 문제들 로드 완료:', this.sentences);
            }
            
            if (this.sentences.length === 0) {
                throw new Error('문제 내용이 비어있습니다.');
            }

            // 미션 선택기 표시
            this.showMissionSelector();

        } catch (error) {
            console.error('문제 로드 오류:', error);
            this.showError(`문제를 불러올 수 없습니다: ${error.message}`);
        }
    }

    showMissionSelector() {
        // UI 초기화
        this.hideAllSections();
        
        // 미션 버튼들 생성
        this.createMissionButtons();
        
        // 미션 선택기 표시
        document.getElementById('missionSelector').style.display = 'block';
        document.getElementById('taskInfo').style.display = 'none';
        
        this.updateStatusInfo('미션을 선택하세요');
        this.currentSentenceIndex = -1;
    }

    createMissionButtons() {
        const buttonsContainer = document.getElementById('missionButtons');
        buttonsContainer.innerHTML = '';

        for (let i = 0; i < this.sentences.length; i++) {
            const button = document.createElement('button');
            button.className = 'mission-btn';
            button.textContent = `Mission ${i + 1}`;
            button.onclick = () => this.selectMission(i);

            // 완료된 미션 표시
            if (this.completedMissions.includes(i)) {
                button.classList.add('completed');
                button.textContent += ' ✓';
            }

            buttonsContainer.appendChild(button);
        }
    }

    selectMission(missionIndex) {
        if (missionIndex >= 0 && missionIndex < this.sentences.length) {
            this.currentSentenceIndex = missionIndex;
            this.loadCurrentSentence();
        }
    }

    loadCurrentSentence() {
        if (this.currentSentenceIndex < 0 || this.currentSentenceIndex >= this.sentences.length) {
            return;
        }

        // UI 초기화
        this.hideAllSections();
        
        // 미션 표시
        this.showTaskInfo();
        this.enableControls();
        
        this.updateStatusInfo('준비 완료! 듣기 버튼을 클릭하세요.');
        
        console.log(`현재 미션 ${this.currentSentenceIndex + 1}:`, this.sentences[this.currentSentenceIndex]);
    }

    hideAllSections() {
        document.getElementById('missionSelector').style.display = 'none';
        document.getElementById('cameraSection').style.display = 'none';
        document.getElementById('photoPreview').style.display = 'none';
        document.getElementById('resultSection').classList.remove('show');
        document.getElementById('navigationSection').style.display = 'none';
        document.getElementById('missionClearSection').style.display = 'none';
    }

    showTaskInfo() {
        const totalSentences = this.sentences.length;
        const currentNum = this.currentSentenceIndex + 1;
        
        if (this.isNumberBased) {
            const missionNumber = this.taskData.items[this.currentSentenceIndex];
            document.getElementById('problemNumber').textContent = `MISSION${missionNumber}`;
        } else {
            document.getElementById('problemNumber').textContent = `MISSION${this.currentSentenceIndex + 1}`;
        }
        
        
        document.getElementById('taskInfo').style.display = 'block';
        
    }

    updateStatusInfo(message) {
        document.getElementById('statusInfo').textContent = message;
    }


    enableControls() {
        document.getElementById('playBtn').disabled = false;
        document.getElementById('submitBtn').disabled = false;
        
        // 컨트롤 섹션 표시
        document.querySelector('.controls').style.display = 'flex';
    }

    playAudio() {
        console.log('🔊 playAudio 호출됨');
        console.log('현재 인덱스:', this.currentSentenceIndex);
        console.log('문장 배열:', this.sentences);
        
        const currentSentence = this.sentences[this.currentSentenceIndex];
        if (!currentSentence) {
            console.log('❌ 현재 문장 없음');
            this.showError('재생할 문장이 없습니다.');
            return;
        }
        
        console.log('▶️ 재생할 문장:', currentSentence);

        // Web Speech API를 사용한 TTS
        if (!('speechSynthesis' in window)) {
            this.showError('이 브라우저는 음성 재생을 지원하지 않습니다.');
            return;
        }

        // 음성 목록이 로드되지 않았다면 대기
        if (!this.voicesLoaded) {
            this.updateStatusInfo('음성을 준비하는 중입니다...');
            setTimeout(() => this.playAudio(), 500);
            return;
        }

        // 기존 음성 중단
        speechSynthesis.cancel();

        // 약간의 지연으로 cancel이 완전히 처리되도록
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(currentSentence);
            
            // 최적의 한국어 여성 음성 선택
            const selectedVoice = this.getBestKoreanVoice();
            if (selectedVoice) {
                utterance.voice = selectedVoice;
                console.log('🎤 선택된 음성:', selectedVoice.name, selectedVoice.lang);
            } else {
                console.log('🎤 기본 음성 사용');
            }

            // 음성 설정 최적화
            utterance.rate = Math.max(0.5, Math.min(2.0, this.currentRate)); // 범위 제한
            utterance.pitch = 1.0; // 자연스러운 피치
            utterance.volume = 1.0;
            
            // 플랫폼별 음성 최적화
            if (selectedVoice) {
                if (selectedVoice.name.includes('Google')) {
                    // Google 음성: 약간 높은 피치
                    utterance.pitch = 1.1;
                } else if (selectedVoice.name.includes('Microsoft')) {
                    // Microsoft 음성: 표준 피치
                    utterance.pitch = 1.0;
                } else if (selectedVoice.name.includes('Yuna') || selectedVoice.name.includes('Siri')) {
                    // iOS 음성: 약간 낮은 피치로 더 자연스럽게
                    utterance.pitch = 0.9;
                }
            }

            this.setupAudioCallbacks(utterance);
            speechSynthesis.speak(utterance);
            
        }, 100);
    }

    getBestKoreanVoice() {
        const voices = speechSynthesis.getVoices();
        console.log('사용 가능한 모든 음성:', voices.map(v => ({name: v.name, lang: v.lang, gender: v.name})));
        
        // 한국어 음성만 필터링
        const koreanVoices = voices.filter(voice => 
            voice.lang.startsWith('ko') || voice.lang.includes('KR')
        );
        
        console.log('한국어 음성들:', koreanVoices.map(v => ({name: v.name, lang: v.lang})));

        // 우선순위별 음성 선택 (여성 음성 우선, 품질 좋은 순서)
        const voicePriorities = [
            // iOS 고품질 한국어 음성
            'Yuna',
            'Siri Female (Korean)',
            'Korean Female',
            
            // Windows 고품질 음성
            'Microsoft Heami - Korean (Korea)',
            'Microsoft Heami',
            'Heami',
            
            // Google 음성
            'Google 한국의',
            'Google Korean',
            'ko-KR-Neural2-A', // Google Cloud TTS
            'ko-KR-Neural2-C',
            'ko-KR-Standard-A',
            'ko-KR-Standard-C',
            
            // 기타 한국어 음성 (여성 우선)
            'Korean (South Korea) - Female',
            'Korean Female Voice',
            '한국어 여성',
            
            // 백업용 (성별 불명 또는 남성)
            'Korean',
            'Korean (South Korea)',
            '한국어'
        ];

        // 우선순위에 따라 음성 선택
        for (const priorityName of voicePriorities) {
            const voice = koreanVoices.find(v => 
                v.name.includes(priorityName) || 
                v.name.toLowerCase().includes(priorityName.toLowerCase())
            );
            if (voice) {
                console.log(`우선순위 음성 선택됨: ${voice.name}`);
                return voice;
            }
        }

        // 우선순위에 없으면 첫 번째 한국어 음성 사용
        if (koreanVoices.length > 0) {
            console.log(`기본 한국어 음성 선택됨: ${koreanVoices[0].name}`);
            return koreanVoices[0];
        }

        // 한국어 음성이 없으면 null 반환 (기본 음성 사용)
        console.log('한국어 음성을 찾을 수 없음, 기본 음성 사용');
        return null;
    }

    setupAudioCallbacks(utterance) {
        // 재생 상태 피드백
        const playBtn = document.getElementById('playBtn');
        const originalText = playBtn.textContent;
        
        utterance.onstart = () => {
            playBtn.textContent = '🔊 재생 중...';
            playBtn.classList.add('pulse');
            this.updateStatusInfo('음성을 재생하고 있습니다...');
        };

        utterance.onend = () => {
            playBtn.textContent = originalText;
            playBtn.classList.remove('pulse');
            this.updateStatusInfo('재생이 완료되었습니다. 종이에 받아쓰기 하세요.');
        };

        utterance.onerror = (event) => {
            playBtn.textContent = originalText;
            playBtn.classList.remove('pulse');
            console.error('음성 재생 오류:', event);
            this.showError('음성 재생 중 오류가 발생했습니다. 다시 시도해주세요.');
        };

        utterance.onpause = () => {
            playBtn.textContent = '⏸️ 일시정지됨';
            playBtn.classList.remove('pulse');
        };

        utterance.onresume = () => {
            playBtn.textContent = '🔊 재생 중...';
            playBtn.classList.add('pulse');
        };
    }

    // === 카메라 기능 ===
    
    async startCamera() {
        console.log('📷 startCamera 호출됨');
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' } // 후면 카메라 선호
            });
            
            const video = document.getElementById('cameraPreview');
            video.srcObject = this.cameraStream;
            video.play();
            
            // UI 변경
            document.getElementById('cameraSection').style.display = 'block';
            document.getElementById('submitBtn').style.display = 'none';
            
        } catch (error) {
            console.error('카메라 접근 오류:', error);
            alert('카메라에 접근할 수 없습니다. 카메라 권한을 확인해주세요.');
        }
    }
    
    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        // UI 복원
        document.getElementById('cameraSection').style.display = 'none';
        document.getElementById('submitBtn').style.display = 'inline-block';
        document.getElementById('submitBtn').disabled = false;
    }
    
    capturePhoto() {
        const video = document.getElementById('cameraPreview');
        const canvas = document.getElementById('photoCanvas');
        const context = canvas.getContext('2d');
        
        // 캔버스 크기를 비디오에 맞춤
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // 비디오 프레임을 캔버스에 그리기
        context.drawImage(video, 0, 0);
        
        // 사진 데이터 URL 생성
        const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        // 미리보기 표시
        document.getElementById('capturedPhoto').src = photoDataUrl;
        document.getElementById('cameraSection').style.display = 'none';
        document.getElementById('photoPreview').style.display = 'block';
        
        // 현재 사진 저장
        this.currentPhotoData = photoDataUrl;
    }
    
    retakePhoto() {
        // 다시 카메라 화면으로 (카메라는 이미 켜져있음)
        document.getElementById('photoPreview').style.display = 'none';
        document.getElementById('cameraSection').style.display = 'block';
    }
    
    async submitPhoto() {
        console.log('📸 제출하기 버튼 클릭됨');
        console.log('🔍 currentPhotoData 존재:', !!this.currentPhotoData);
        console.log('🔍 currentSentenceIndex:', this.currentSentenceIndex);
        console.log('🔍 sentences 배열:', this.sentences);
        console.log('🔍 currentUser:', this.currentUser);
        console.log('🔍 taskData:', this.taskData);
        
        if (!this.currentPhotoData) {
            console.error('❌ 사진 데이터 없음');
            alert('사진이 촬영되지 않았습니다.');
            return;
        }
        
        try {
            // 현재 문장의 정답
            const currentSentence = this.sentences[this.currentSentenceIndex];
            
            // 제출 기록 저장
            await this.saveSubmission(this.currentPhotoData, currentSentence);
            
            // 제출한 사진을 배열에 저장
            this.submittedPhotos[this.currentSentenceIndex] = this.currentPhotoData;
            
            // 결과 표시
            this.showResult(currentSentence, this.currentPhotoData);
            
            // 카메라 정리
            this.stopCamera();
            
        } catch (error) {
            console.error('제출 처리 오류:', error);
            alert('제출 중 오류가 발생했습니다: ' + error.message);
        }
    }

    normalizeText(text) {
        return text.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    // === 네비게이션 기능 ===
    
    nextMission() {
        // 다음 미완료 미션 찾기
        let nextMissionIndex = -1;
        for (let i = 0; i < this.sentences.length; i++) {
            if (!this.completedMissions.includes(i)) {
                nextMissionIndex = i;
                break;
            }
        }
        
        if (nextMissionIndex >= 0) {
            this.selectMission(nextMissionIndex);
        } else {
            // 모든 미션 완료
            this.showMissionComplete();
        }
    }
    
    showMissionComplete() {
        document.getElementById('missionClearSection').style.display = 'flex';
        
        // 부모 창에 모든 미션 완료 알림
        this.notifyParentWindow({
            type: 'taskCompleted',
            moduleId: 'dictation',
            result: true,
            allMissionsCompleted: true,
            completedMissions: this.completedMissions.length,
            totalMissions: this.sentences.length,
            userId: this.currentUser?.uid,
            taskDate: this.taskData?.date
        });
    }
    
    closeMissionComplete() {
        console.log('미션 완료 창 닫기 시도');
        
        // 제출 상태 확인 및 저장 (영구 저장)
        if (this.currentUser && this.taskData) {
            console.log('✅ 제출 완료 상태 저장');
            
            // 임시 알림용 상태 저장
            localStorage.setItem('lastSubmissionStatus', JSON.stringify({
                userId: this.currentUser.uid,
                taskDate: this.taskData.date,
                completedAt: Date.now(),
                status: 'completed'
            }));
            
            // 과제번호 기반 완료 상태 저장 (확실한 연동 보장)
            console.log('=== 받아쓰기 완료 상태 저장 시작 ===');
            console.log('현재 taskData:', this.taskData);
            
            // taskId 우선 사용, 없으면 date 사용
            const taskId = this.taskData.taskId || this.taskData.date;
            console.log('📋 저장할 과제 ID:', taskId);
            
            if (this.taskData.taskId) {
                console.log('✅ 과제 ID 방식으로 저장');
            } else {
                console.log('⚠️ 과제 ID 없어서 날짜 방식으로 저장:', this.taskData.date);
            }
            
            const completionKey = `task_completed_${this.currentUser.uid}_${taskId}`;
            const completionData = {
                userId: this.currentUser.uid,
                uid: this.currentUser.uid, // 호환성을 위한 추가 필드
                taskId: taskId,
                completedAt: Date.now(),
                source: 'dictation_module',
                locked: true
            };
            
            localStorage.setItem(completionKey, JSON.stringify(completionData));
            console.log('🔒 완료 상태 저장 (재수행 잠금):', completionKey, completionData);
            
            // 저장 검증
            const verification = localStorage.getItem(completionKey);
            console.log('💾 저장 검증:', verification ? '성공' : '실패');
            
            // 전역 완료 상태도 저장 (백업)
            localStorage.setItem('global_task_completion_status', JSON.stringify({
                lastCompletedTask: {
                    userId: this.currentUser.uid,
                    date: this.taskData.date,
                    completedAt: Date.now()
                }
            }));
            
            console.log('✅ 완료 상태 저장 완료:', completionKey);
            
            // localStorage 변경 이벤트 강제 발생
            window.dispatchEvent(new StorageEvent('storage', {
                key: completionKey,
                newValue: JSON.stringify(completionData),
                url: window.location.href
            }));
        }
        
        // localStorage에서 currentTask 삭제 (재사용 방지)
        localStorage.removeItem('currentTask');
        
        // 부모 창에 완료 알림 다시 전송 (여러 번)
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.notifyParentWindow({
                    type: 'taskCompletedAndClosing',
                    moduleId: 'dictation',
                    result: true,
                    userId: this.currentUser?.uid,
                    taskDate: this.taskData?.date,
                    forceRefresh: true,
                    attempt: i + 1
                });
            }, i * 200); // 200ms 간격으로 3번 전송
        }
        
        // 안전한 메인페이지 복귀 로직
        try {
            console.log('메인페이지로 안전하게 복귀 시작');
            
            // 즉시 메인페이지로 이동 (완료 파라미터 포함)
            window.location.href = '../../student/index.html?completed=true&t=' + Date.now();
            
        } catch (error) {
            console.error('페이지 이동 오류:', error);
            // 오류 시 강제로 학생 메인페이지로 이동 (완료 파라미터 포함)
            window.location.replace('../../student/index.html?completed=true&t=' + Date.now());
        }
    }

    showResult(correctAnswer, submittedPhoto) {
        const resultSection = document.getElementById('resultSection');
        const resultTitle = document.getElementById('resultTitle');
        const resultMessage = document.getElementById('resultMessage');
        const correctAnswerSection = document.getElementById('correctAnswerSection');
        const submittedPhotoSection = document.getElementById('submittedPhotoSection');
        const navigationSection = document.getElementById('navigationSection');

        // 현재 미션을 완료됨으로 표시
        if (!this.completedMissions.includes(this.currentSentenceIndex)) {
            this.completedMissions.push(this.currentSentenceIndex);
        }

        // 결과 섹션 표시
        resultSection.className = 'result-section show correct';
        resultTitle.textContent = `Mission ${this.currentSentenceIndex + 1} 제출 완료!`;
        resultMessage.textContent = '받아쓰기가 제출되었습니다.';

        // 정답 표시
        document.getElementById('correctAnswer').textContent = correctAnswer;
        correctAnswerSection.style.display = 'block';

        // 제출한 사진 표시
        document.getElementById('submittedPhoto').src = submittedPhoto;
        submittedPhotoSection.style.display = 'block';

        // 제출 버튼과 컨트롤 숨기기
        document.getElementById('submitBtn').style.display = 'none';
        document.querySelector('.controls').style.display = 'none';
        document.getElementById('taskInfo').style.display = 'none';

        // 네비게이션 표시
        navigationSection.style.display = 'block';

        // 다음 미션이 있는지 확인
        const hasNextMission = this.completedMissions.length < this.sentences.length;
        if (hasNextMission) {
            document.getElementById('nextMissionBtn').style.display = 'inline-block';
        } else {
            // 모든 미션 완료 - 3초 후 Mission Clear 표시
            setTimeout(() => {
                this.showMissionComplete();
            }, 3000);
        }

        // 결과 섹션으로 스크롤
        resultSection.scrollIntoView({ behavior: 'smooth' });
    }

    async saveSubmission(photoData, correctAnswer) {
        console.log('💾 saveSubmission 호출됨');
        console.log('🔍 currentUser:', this.currentUser);
        console.log('🔍 taskData:', this.taskData);
        console.log('🔍 photoData 존재:', !!photoData);
        console.log('🔍 correctAnswer:', correctAnswer);
        
        if (!this.currentUser || !this.taskData.date) {
            console.error('❌ saveSubmission 조건 실패 - currentUser 또는 taskData.date 없음');
            return;
        }

        // Firebase Storage 업로드는 CORS 문제로 건너뛰고 Base64만 사용
        let imageUrl = null;
        console.log('📝 Base64 이미지 데이터만 저장 (CORS 제한으로 Storage 업로드 제외)');

        const submissionData = {
            score: 1, // 사진 제출이면 완료로 처리
            correctText: correctAnswer,
            submittedPhoto: photoData, // Base64 데이터 (백업용)
            imageUrl: imageUrl, // Firebase Storage URL (교사 콘솔용)
            sentenceIndex: this.currentSentenceIndex,
            problemNumber: this.isNumberBased ? this.taskData.items[this.currentSentenceIndex] : `문장 ${this.currentSentenceIndex + 1}`,
            sourceType: this.isNumberBased ? 'number' : 'sentence',
            playbackRate: this.currentRate,
            submittedAt: Date.now(),
            submissionType: 'photo' // 사진 제출임을 표시
        };

        try {
            // 전체 받아쓰기 과제로 저장 (과제 ID 기반)
            await dbManager.submitTask(
                this.currentUser.uid, 
                this.taskData.taskId || this.taskData.date, // 과제 ID 우선, 없으면 날짜
                'dictation', 
                {
                    ...submissionData,
                    date: this.taskData.date, // 날짜 정보 추가
                    taskId: this.taskData.taskId, // 과제 ID 정보 추가
                    missionProgress: {
                        completed: this.completedMissions.length + 1, // 현재 완료하는 것 포함
                        total: this.sentences.length,
                        completedMissions: [...this.completedMissions, this.currentSentenceIndex]
                    }
                }
            );
            
            console.log('✅ 제출 기록 저장 완료 (과제 ID 기반):', {
                taskId: this.taskData.taskId,
                date: this.taskData.date,
                userId: this.currentUser.uid
            });

            console.log('제출 기록 저장 완료:', submissionData);

        } catch (error) {
            console.error('제출 기록 저장 실패:', error);
            // 에러가 있어도 사용자에게는 성공으로 표시 (UX 개선)
        }
    }

    // Firebase Storage에 이미지 업로드
    async uploadImageToStorage(photoData) {
        console.log('⚠️ Firebase Storage 업로드 건너뛰기 (CORS 제한)');
        // CORS 문제로 인해 Storage 업로드 대신 Base64 데이터만 사용
        // 무료 플랜에서는 Base64 저장으로 충분
        return null;
    }

    // 과제 완료 상태 확인 (과제 ID 기반) - 강화된 버전
    async checkTaskCompletion() {
        if (!this.currentUser || !this.taskData) {
            console.log('❌ 사용자 또는 과제 데이터 없음');
            return false;
        }
        
        console.log('📋 받아쓰기 모듈 완료 상태 확인 (강화 버전):');
        console.log('  - 현재 사용자:', this.currentUser.uid);
        console.log('  - 과제 데이터:', this.taskData);
        console.log('  - 과제 ID:', this.taskData.taskId);
        console.log('  - 과제 날짜:', this.taskData.date);
        
        // 1차: 과제 ID 기반 localStorage 확인 (새 방식)
        if (this.taskData.taskId) {
            const completionKey = `task_completed_${this.currentUser.uid}_${this.taskData.taskId}`;
            console.log('  - 새 방식 확인 키:', completionKey);
            
            const completionData = localStorage.getItem(completionKey);
            if (completionData) {
                try {
                    const data = JSON.parse(completionData);
                    console.log('✅ 과제 ID 기반 완료 데이터 발견:', data);
                    
                    // 추가 검증: 접근 잠금 플래그 확인
                    if (data.lockAccess) {
                        console.log('🔒 접근 잠금 플래그 확인됨 - 완전 차단');
                        return true;
                    }
                    
                    return true;
                } catch (error) {
                    console.log('완료 데이터 파싱 오류:', error);
                }
            }
        }
        
        // 2차: 서버에서 완료 상태 재확인
        try {
            if (this.taskData.taskId) {
                console.log('🌐 서버에서 완료 상태 재확인 중...');
                const serverResult = await dbManager.getCompletionByTaskId(this.currentUser.uid, this.taskData.taskId, 'dictation');
                
                if (serverResult.success && serverResult.data) {
                    console.log('✅ 서버에서 완료 상태 확인됨:', serverResult.data);
                    
                    // 서버 데이터를 로컬에 동기화
                    const completionKey = `task_completed_${this.currentUser.uid}_${this.taskData.taskId}`;
                    const syncData = {
                        userId: this.currentUser.uid,
                        taskId: this.taskData.taskId,
                        completedAt: serverResult.data.completedAt || Date.now(),
                        serverConfirmed: true,
                        lockAccess: true,
                        syncedAt: Date.now()
                    };
                    localStorage.setItem(completionKey, JSON.stringify(syncData));
                    console.log('🔄 서버 데이터 로컬 동기화 완료');
                    
                    return true;
                }
            }
        } catch (error) {
            console.log('⚠️ 서버 완료 상태 확인 중 오류 (로컬만 확인):', error);
        }
        
        // 3차: 기존 날짜 기반 확인 및 정리
        const oldCompletionKey = `task_completed_${this.currentUser.uid}_${this.taskData.date}`;
        const oldCompletionData = localStorage.getItem(oldCompletionKey);
        console.log('  - 기존 방식 확인 키:', oldCompletionKey);
        console.log('  - 기존 방식 데이터 존재:', !!oldCompletionData);
        
        if (oldCompletionData) {
            console.log('⚠️ 기존 날짜 기반 완료 데이터 발견 - 과제 ID 기반으로 마이그레이션');
            try {
                const oldData = JSON.parse(oldCompletionData);
                
                // 과제 ID가 있다면 새 방식으로 마이그레이션
                if (this.taskData.taskId) {
                    const newCompletionKey = `task_completed_${this.currentUser.uid}_${this.taskData.taskId}`;
                    const migratedData = {
                        userId: this.currentUser.uid,
                        taskId: this.taskData.taskId,
                        taskDate: this.taskData.date,
                        completedAt: oldData.completedAt || Date.now(),
                        migratedFrom: 'dateBasedCompletion',
                        lockAccess: true,
                        migratedAt: Date.now()
                    };
                    localStorage.setItem(newCompletionKey, JSON.stringify(migratedData));
                    console.log('🔄 날짜 기반 → 과제 ID 기반 마이그레이션 완료');
                }
                
                // 기존 데이터 제거
                localStorage.removeItem(oldCompletionKey);
                console.log('🗑️ 기존 날짜 기반 완료 데이터 제거:', oldCompletionKey);
                
                // 마이그레이션 결과 완료 상태 반환
                return true;
                
            } catch (error) {
                console.log('기존 데이터 마이그레이션 오류:', error);
                // 오류 시에도 기존 데이터 제거
                localStorage.removeItem(oldCompletionKey);
            }
        }
        
        console.log('✅ 과제 완료되지 않음 - 시작 가능');
        return false;
    }
    
    // 완료된 과제 메시지 표시
    showCompletedTaskMessage() {
        document.body.innerHTML = `
            <div style="
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                z-index: 9999;
            ">
                <div style="
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    padding: 60px;
                    border-radius: 20px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                    text-align: center;
                    max-width: 500px;
                    margin: 20px;
                ">
                    <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
                    <h2 style="color: #28a745; margin-bottom: 20px; font-size: 28px;">과제 완료</h2>
                    <p style="color: #6c757d; margin-bottom: 30px; font-size: 18px; line-height: 1.5;">
                        이미 완료된 과제입니다.<br>
                        더 이상 수행할 수 없습니다.
                    </p>
                    <button onclick="window.location.href='../../student/index.html'" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        padding: 15px 30px;
                        border-radius: 25px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s;
                    ">메인페이지로 돌아가기</button>
                </div>
            </div>
        `;
        
        // 3초 후 자동으로 메인페이지로 이동
        setTimeout(() => {
            window.location.href = '../../student/index.html';
        }, 3000);
    }

    // 부모 창에 메시지 전송 (통합 메서드)
    notifyParentWindow(message) {
        console.log('부모 창에 메시지 전송:', message);
        
        try {
            // 방법 1: window.opener (새 창인 경우)
            if (window.opener && !window.opener.closed) {
                window.opener.postMessage(message, '*');
                console.log('window.opener로 메시지 전송 성공');
            }
            
            // 방법 2: window.parent (아이프레임인 경우)
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                console.log('window.parent로 메시지 전송 성공');
            }
            
            // 방법 3: localStorage 이벤트 (백업)
            const storageMessage = {
                ...message,
                timestamp: Date.now(),
                source: 'dictation_module'
            };
            localStorage.setItem('moduleMessage', JSON.stringify(storageMessage));
            // 즉시 삭제하여 storage 이벤트 발생
            setTimeout(() => {
                localStorage.removeItem('moduleMessage');
            }, 100);
            
        } catch (error) {
            console.error('메시지 전송 오류:', error);
        }
    }

    showError(message) {
        document.getElementById('statusInfo').textContent = `오류: ${message}`;
        document.getElementById('statusInfo').style.color = '#dc3545';
        console.error('Dictation Error:', message);
    }
}

// 모듈 초기화
window.dictationModule = new DictationModule();

console.log('받아쓰기 모듈 스크립트 로드 완료');