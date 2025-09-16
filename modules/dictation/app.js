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
        this.debugLogs = []; // iOS용 디버그 로그 저장
        
        this.setupiOSLogging(); // iOS 로깅 설정
        this.initializeModule();
        this.setupEventListeners();
        this.setupAuthListener();
        this.initializeVoices();
        this.setupiOSUI(); // iOS 전용 UI 설정
    }

    // 디바이스 감지 (초기화용)
    detectDevice() {
        const userAgent = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(userAgent);
        const isAndroid = /Android/.test(userAgent);
        const isMac = /Mac/.test(userAgent) && !isIOS;
        const isWindows = /Windows/.test(userAgent);
        
        return { isIOS, isAndroid, isMac, isWindows };
    }

    // iOS 콘솔 로그를 화면에 표시
    setupiOSLogging() {
        const device = this.detectDevice();
        if (!device.isIOS) return;

        // 기존 console.log 함수를 덮어씀
        const originalLog = console.log;
        const originalError = console.error;
        
        console.log = (...args) => {
            originalLog(...args);
            this.addToScreenLog('LOG: ' + args.join(' '));
        };
        
        console.error = (...args) => {
            originalError(...args);
            this.addToScreenLog('ERROR: ' + args.join(' '));
        };
    }

    // 화면에 로그 추가
    addToScreenLog(message) {
        this.debugLogs.push(`${new Date().toLocaleTimeString()}: ${message}`);
        
        // 최대 50개 로그만 유지
        if (this.debugLogs.length > 50) {
            this.debugLogs.shift();
        }
        
        // 상태 정보 영역에 표시
        const statusElement = document.getElementById('statusInfo');
        if (statusElement && this.debugLogs.length > 0) {
            const lastLog = this.debugLogs[this.debugLogs.length - 1];
            statusElement.innerHTML = `
                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">
                    최신 로그: ${lastLog}
                </div>
                <button onclick="dictationModule.showAllLogs()" 
                        style="padding: 5px 10px; font-size: 12px; background: #007bff; color: white; border: none; border-radius: 5px;">
                    전체 로그 보기
                </button>
            `;
        }
    }

    // 전체 로그 팝업 표시
    showAllLogs() {
        const logText = this.debugLogs.join('\n');
        
        // 모달 생성
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
            align-items: center; justify-content: center; padding: 20px;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 10px; max-width: 90%; max-height: 80%; overflow: auto;">
                <h3>iOS 디버그 로그</h3>
                <pre style="font-size: 10px; text-align: left; white-space: pre-wrap; background: #f5f5f5; padding: 10px; border-radius: 5px;">${logText}</pre>
                <div style="margin-top: 15px; text-align: center;">
                    <button onclick="navigator.clipboard.writeText(\`${logText.replace(/`/g, '\\`')}\`); alert('로그가 클립보드에 복사되었습니다!');" 
                            style="margin-right: 10px; padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 5px;">
                        로그 복사
                    </button>
                    <button onclick="document.body.removeChild(this.closest('div').parentElement);" 
                            style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 5px;">
                        닫기
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // 음성 정보 표시 (iOS 디버깅용)
    showVoiceInfo() {
        const voices = speechSynthesis.getVoices();
        console.log('🔍 음성 정보 표시 요청');
        
        const koreanVoices = voices.filter(voice => 
            voice.lang.includes('ko') || voice.lang.includes('KR') || voice.lang.includes('Korean')
        );
        
        let info = `📱 iPhone 음성 디버그 정보\n\n`;
        info += `전체 음성 수: ${voices.length}개\n`;
        info += `한국어 음성 수: ${koreanVoices.length}개\n\n`;
        
        if (koreanVoices.length > 0) {
            info += `🎤 한국어 음성 목록:\n`;
            koreanVoices.forEach((voice, index) => {
                const selected = index === 0 ? ' ⭐ (선택됨)' : '';
                info += `${index + 1}. ${voice.name}${selected}\n`;
                info += `   - 언어: ${voice.lang}\n`;
                info += `   - 로컬: ${voice.localService ? 'YES' : 'NO'}\n`;
                info += `   - URI: ${voice.voiceURI}\n\n`;
            });
        } else {
            info += `❌ 한국어 음성을 찾을 수 없습니다.\n`;
            info += `전체 음성 목록:\n`;
            voices.forEach((voice, index) => {
                if (index < 10) { // 처음 10개만 표시
                    info += `${index + 1}. ${voice.name} (${voice.lang})\n`;
                }
            });
        }
        
        // 선택된 음성 테스트
        const selectedVoice = this.selectBestFemaleVoice();
        if (selectedVoice) {
            info += `\n✅ 현재 선택된 음성: ${selectedVoice.name}\n`;
            info += `   언어: ${selectedVoice.lang}\n`;
            info += `   로컬: ${selectedVoice.localService ? 'YES' : 'NO'}\n`;
        }
        
        // 모달로 표시
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
            align-items: center; justify-content: center; padding: 20px;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 10px; max-width: 90%; max-height: 80%; overflow: auto;">
                <h3>🎤 iOS 음성 디버그 정보</h3>
                <pre style="font-size: 11px; text-align: left; white-space: pre-wrap; background: #f5f5f5; padding: 15px; border-radius: 5px;">${info}</pre>
                <div style="margin-top: 15px; text-align: center;">
                    <button onclick="navigator.clipboard.writeText(\`${info.replace(/`/g, '\\`')}\`); alert('음성 정보가 클립보드에 복사되었습니다!');" 
                            style="margin-right: 10px; padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 5px;">
                        정보 복사
                    </button>
                    <button onclick="dictationModule.testSelectedVoice();" 
                            style="margin-right: 10px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 5px;">
                        음성 테스트
                    </button>
                    <button onclick="document.body.removeChild(this.closest('div').parentElement);" 
                            style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 5px;">
                        닫기
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // 선택된 음성 테스트
    testSelectedVoice() {
        const testText = "안녕하세요. 이것은 음성 테스트입니다.";
        console.log('🎵 음성 테스트 시작');
        
        const utterance = new SpeechSynthesisUtterance(testText);
        const selectedVoice = this.selectBestFemaleVoice();
        
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        
        utterance.rate = 0.8;
        utterance.pitch = 1.5;
        utterance.volume = 1.0;
        
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
        
        console.log('✅ 음성 테스트 실행됨');
    }

    // iOS 전용 UI 설정
    setupiOSUI() {
        const device = this.detectDevice();
        if (device.isIOS) {
            // iOS에서만 모든 전용 버튼들 표시
            const voiceInfoBtn = document.getElementById('voiceInfoBtn');
            const iosSystemBtn = document.getElementById('iosSystemBtn');
            const iosShortcutsBtn = document.getElementById('iosShortcutsBtn');
            
            if (voiceInfoBtn) {
                voiceInfoBtn.style.display = 'inline-flex';
                console.log('📱 iOS 음성 정보 버튼 활성화');
            }
            
            if (iosSystemBtn) {
                iosSystemBtn.style.display = 'inline-flex';
                console.log('🍎 iOS Siri 음성 버튼 활성화');
            }
            
            if (iosShortcutsBtn) {
                iosShortcutsBtn.style.display = 'inline-flex';
                console.log('⚡ iOS Shortcuts 버튼 활성화');
            }
        }
    }

    // 직접 iOS 시스템 TTS 테스트
    async tryDirectSystemTTS() {
        if (this.currentSentenceIndex < 0 || this.currentSentenceIndex >= this.sentences.length) {
            alert('먼저 미션을 선택하세요.');
            return;
        }

        const currentSentence = this.sentences[this.currentSentenceIndex];
        console.log('🍎 직접 iOS 시스템 TTS 테스트');
        
        const success = await this.tryiOSSystemTTS(currentSentence);
        
        if (!success) {
            alert('iOS 시스템 음성을 사용할 수 없습니다. 기본 음성을 사용하세요.');
        }
    }

    // iOS Shortcuts 생성 도우미
    createiOSShortcut() {
        const instructions = `
📱 iOS Shortcuts 앱에서 한국어 TTS 만들기:

1️⃣ Shortcuts 앱 열기
2️⃣ "+" 버튼으로 새 Shortcut 생성
3️⃣ "Add Action" 선택
4️⃣ "Speak Text" 액션 추가
5️⃣ Shortcut 이름: "Speak Korean"으로 설정
6️⃣ 저장 후 이 페이지로 돌아오기

설정 완료 후 "🍎 Siri 음성" 버튼을 사용하면 
iPhone의 Siri 음성으로 받아쓰기를 들을 수 있습니다!
        `;

        // 모달로 안내 표시
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
            align-items: center; justify-content: center; padding: 20px;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 25px; border-radius: 15px; max-width: 90%; max-height: 80%; overflow: auto;">
                <h3>⚡ iOS Shortcuts 설정</h3>
                <pre style="font-size: 12px; text-align: left; white-space: pre-wrap; background: #f5f5f5; padding: 15px; border-radius: 8px; line-height: 1.4;">${instructions}</pre>
                <div style="margin-top: 20px; text-align: center;">
                    <button onclick="window.open('shortcuts://'); document.body.removeChild(this.closest('div').parentElement);" 
                            style="margin-right: 10px; padding: 12px 20px; background: #007bff; color: white; border: none; border-radius: 8px; font-size: 14px;">
                        📱 Shortcuts 앱 열기
                    </button>
                    <button onclick="document.body.removeChild(this.closest('div').parentElement);" 
                            style="padding: 12px 20px; background: #6c757d; color: white; border: none; border-radius: 8px; font-size: 14px;">
                        나중에 하기
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        console.log('⚡ iOS Shortcuts 설정 안내 표시됨');
    }

    // Google TTS 직접 테스트
    async testGoogleTTS() {
        if (this.currentSentenceIndex < 0 || this.currentSentenceIndex >= this.sentences.length) {
            // 테스트 문장으로 시연
            const testText = "안녕하세요. Google Cloud의 자연스러운 한국어 여성 음성입니다.";
            console.log('🌟 Google TTS 테스트 시작');
            
            try {
                this.updateStatusInfo('🌟 Google TTS 서버 연결 확인 중...');
                
                const audioUrl = await this.generateTTSAudio(testText);
                
                if (audioUrl) {
                    const audio = new Audio(audioUrl);
                    
                    audio.onplay = () => {
                        console.log('🎵 Google TTS 테스트 재생 시작');
                        this.updateStatusInfo('🎵 Google 고품질 여성 음성 테스트 중...');
                    };
                    
                    audio.onended = () => {
                        console.log('✅ Google TTS 테스트 완료');
                        this.updateStatusInfo('✅ Google TTS 테스트 완료! 서버가 정상 작동합니다.');
                    };
                    
                    audio.onerror = () => {
                        console.error('❌ Google TTS 테스트 재생 오류');
                        this.updateStatusInfo('❌ Google TTS 재생 오류. 서버를 확인하세요.');
                    };
                    
                    await audio.play();
                    
                } else {
                    throw new Error('Google TTS 서버 연결 실패');
                }
                
            } catch (error) {
                console.error('❌ Google TTS 테스트 오류:', error);
                
                // 서버 상태 확인
                const serverStatus = await this.checkGoogleTTSServer();
                if (serverStatus) {
                    this.updateStatusInfo('⚠️ 서버는 실행 중이지만 TTS 생성에 오류가 있습니다.');
                } else {
                    this.updateStatusInfo('❌ Google TTS 서버에 연결할 수 없습니다. 서버를 시작하세요.');
                    this.showGoogleTTSSetup();
                }
            }
            
            return;
        }

        // 현재 미션의 문장으로 테스트
        const currentSentence = this.sentences[this.currentSentenceIndex];
        console.log('🌟 현재 미션으로 Google TTS 테스트');
        
        const success = await this.playAudioWithExternalTTS(currentSentence);
        if (!success) {
            this.showGoogleTTSSetup();
        }
    }

    // Google TTS 서버 상태 확인
    async checkGoogleTTSServer() {
        try {
            const response = await fetch('http://localhost:3001/api/health', {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Google TTS 서버 상태:', data.message);
                return true;
            }
            return false;
            
        } catch (error) {
            console.error('❌ 서버 상태 확인 오류:', error);
            return false;
        }
    }

    // Google TTS 설정 안내
    showGoogleTTSSetup() {
        const instructions = `
🌟 Google Cloud TTS 서버 시작하기:

📁 1. 터미널에서 google-tts-demo 폴더로 이동:
   cd "google-tts-demo"

📦 2. 의존성 설치 (최초 1회):
   npm install

🚀 3. 서버 시작:
   npm start

✅ 4. 서버가 실행되면 "🌟 Google 여성음성" 버튼 사용 가능!

🎤 특징:
• WaveNet 품질의 자연스러운 한국어 여성 음성
• iOS Safari 완벽 호환
• 실시간 고품질 음성 생성
• 남성 음성 완전 차단

서버 실행 후 이 버튼을 다시 눌러보세요! 🚀
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
            align-items: center; justify-content: center; padding: 20px;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 25px; border-radius: 15px; max-width: 90%; max-height: 80%; overflow: auto;">
                <h3>🌟 Google Cloud TTS 설정</h3>
                <pre style="font-size: 12px; text-align: left; white-space: pre-wrap; background: #f5f5f5; padding: 15px; border-radius: 8px; line-height: 1.4;">${instructions}</pre>
                <div style="margin-top: 20px; text-align: center;">
                    <button onclick="dictationModule.checkGoogleTTSServer().then(status => { if(status) alert('✅ 서버가 실행 중입니다!'); else alert('❌ 서버가 실행되지 않았습니다.'); }); document.body.removeChild(this.closest('div').parentElement);" 
                            style="margin-right: 10px; padding: 12px 20px; background: #28a745; color: white; border: none; border-radius: 8px; font-size: 14px;">
                        🔍 서버 상태 확인
                    </button>
                    <button onclick="document.body.removeChild(this.closest('div').parentElement);" 
                            style="padding: 12px 20px; background: #6c757d; color: white; border: none; border-radius: 8px; font-size: 14px;">
                        닫기
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        console.log('🌟 Google TTS 설정 안내 표시됨');
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

    // iOS 전용 음성 강제 로딩 (여성 음성 확인 포함)
    forceLoadVoicesForIOS() {
        console.log('🔄 iOS 음성 강제 로딩 시도...');
        
        // iOS에서 음성을 강제로 로드하는 트릭들
        const tempUtterance = new SpeechSynthesisUtterance('테스트');
        tempUtterance.volume = 0;
        tempUtterance.rate = 10; // 매우 빠르게 끝내기
        speechSynthesis.speak(tempUtterance);
        
        // 음성 목록 강제 새로고침
        speechSynthesis.cancel();
        
        // 여러 번 시도
        setTimeout(() => {
            // 다시 한번 트리거
            const tempUtterance2 = new SpeechSynthesisUtterance('');
            tempUtterance2.volume = 0;
            speechSynthesis.speak(tempUtterance2);
            speechSynthesis.cancel();
            
            setTimeout(() => {
                const voices = speechSynthesis.getVoices();
                if (voices.length > 0) {
                    this.voicesLoaded = true;
                    const koreanVoices = voices.filter(v => v.lang.startsWith('ko') || v.lang.includes('KR'));
                    console.log('✅ iOS 음성 강제 로딩 성공:', voices.length, '개 음성 발견,', koreanVoices.length, '개 한국어 음성');
                    
                    // 여성 음성 확인
                    const femaleVoices = koreanVoices.filter(v => {
                        const name = v.name.toLowerCase();
                        return !name.includes('male') || name.includes('female');
                    });
                    console.log('👩 발견된 여성 음성:', femaleVoices.length, '개');
                }
            }, 100);
        }, 50);
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
        // 데모 모드: 로그인 없이도 작동하도록 수정
        console.log('🚀 데모 모드로 시작합니다 (로그인 우회)');
        
        // 가짜 사용자 생성
        this.currentUser = {
            uid: 'demo-user',
            email: 'demo@example.com'
        };
        
        // 기본 taskData 설정
        if (!this.taskData) {
            this.taskData = {
                uid: 'demo-user',
                taskId: 'demo-dictation',
                title: '받아쓰기 연습 (데모)'
            };
        }
        
        // 바로 loadProblem 실행
        this.loadProblem().catch(error => {
            console.error('loadProblem 오류:', error);
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
        
        // iOS에서 외부 TTS 사용 여부 확인
        const device = this.detectDevice();
        if (device.isIOS && this.shouldUseExternalTTS()) {
            this.playAudioWithExternalTTS(currentSentence);
            return;
        }

        // Web Speech API를 사용한 TTS
        if (!('speechSynthesis' in window)) {
            this.showError('이 브라우저는 음성 재생을 지원하지 않습니다.');
            return;
        }

        // 음성 목록이 로드되지 않았다면 대기 (iOS 최적화)
        if (!this.voicesLoaded) {
            const device = this.detectDevice();
            if (device.isIOS) {
                // iOS에서는 더 적극적으로 음성 로딩
                this.updateStatusInfo('🍎 iOS 음성을 준비하는 중입니다...');
                this.forceLoadVoicesForIOS();
                setTimeout(() => this.playAudio(), 300); // iOS는 더 빠르게 재시도
            } else {
                this.updateStatusInfo('음성을 준비하는 중입니다...');
                setTimeout(() => this.playAudio(), 500);
            }
            return;
        }

        // 기존 음성 중단
        speechSynthesis.cancel();

        // 약간의 지연으로 cancel이 완전히 처리되도록
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(currentSentence);
            
            // iOS에서 더 나은 처리를 위한 문장 전처리
            utterance.text = this.optimizeTextForTTS(currentSentence);
            
            // 최적의 한국어 여성 음성 선택
            const selectedVoice = this.getBestKoreanVoice();
            if (selectedVoice) {
                utterance.voice = selectedVoice;
                console.log('🎤 선택된 음성:', selectedVoice.name, selectedVoice.lang);
            } else {
                console.log('🎤 기본 음성 사용');
            }

            // 기기별 최적화된 음성 파라미터 설정
            const device = this.detectDevice();
            
            // 기본 설정
            utterance.volume = 1.0;
            utterance.rate = Math.max(0.5, Math.min(2.0, this.currentRate));
            
            // 기기별 최적화된 파라미터 적용
            if (device.isIOS) {
                // iPhone용: 강제로 여성 음성 설정
                utterance.rate = 0.8; // 느린 속도 (더 자연스럽게)
                utterance.pitch = 1.5; // 높은 톤 (여성적으로)
                utterance.volume = 1.0; // 최대 볼륨
                utterance.lang = 'ko-KR'; // 한국어 강제 지정
                
                // iPhone에서 가장 확실한 여성 음성 강제 선택
                const voices = speechSynthesis.getVoices();
                const femaleVoices = voices.filter(v => 
                    v.lang.includes('ko') && 
                    (v.name.toLowerCase().includes('yuna') || 
                     v.name.toLowerCase().includes('female') ||
                     v.name.toLowerCase().includes('siri') ||
                     (!v.name.toLowerCase().includes('male') && !v.name.toLowerCase().includes('남성')))
                );
                
                if (femaleVoices.length > 0) {
                    utterance.voice = femaleVoices[0];
                    console.log(`🍎 iPhone 강제 여성 음성 선택: ${femaleVoices[0].name}`);
                } else {
                    console.log('🍎 iPhone 여성 음성을 찾지 못함, 기본 설정 사용');
                }
                
                console.log(`🍎 iPhone 강력한 여성 음성 설정: rate=${utterance.rate}, pitch=${utterance.pitch}, voice=${utterance.voice?.name || 'default'}`);
                
            } else if (device.isAndroid) {
                // Android 최적화: 부드러운 여성 톤
                if (selectedVoice && selectedVoice.name.includes('Google')) {
                    utterance.rate = Math.max(0.75, Math.min(1.7, this.currentRate * 0.95));
                    utterance.pitch = 1.1; // 더 부드러운 여성 톤
                    utterance.volume = 0.95;
                } else {
                    utterance.rate = Math.max(0.7, Math.min(1.6, this.currentRate * 0.9));
                    utterance.pitch = 1.15; // 여성적인 톤
                    utterance.volume = 0.9;
                }
                console.log(`🤖 Android 부드러운 여성 톤 적용: rate=${utterance.rate.toFixed(2)}, pitch=${utterance.pitch}, volume=${utterance.volume}`);
                
            } else if (device.isWindows) {
                // Windows 최적화: 부드러운 여성 톤
                if (selectedVoice && selectedVoice.name.includes('Microsoft')) {
                    utterance.rate = Math.max(0.75, Math.min(1.6, this.currentRate * 0.95));
                    utterance.pitch = 1.05; // 부드러운 톤
                    utterance.volume = 0.95;
                } else {
                    utterance.rate = Math.max(0.7, Math.min(1.5, this.currentRate * 0.9));
                    utterance.pitch = 1.1; // 여성적인 톤
                    utterance.volume = 0.9;
                }
                console.log(`🪟 Windows 부드러운 여성 톤 적용: rate=${utterance.rate.toFixed(2)}, pitch=${utterance.pitch}, volume=${utterance.volume}`);
                
            } else {
                // 기타 플랫폼: 부드러운 여성 톤 기본 설정
                utterance.rate = Math.max(0.7, Math.min(1.6, this.currentRate * 0.9));
                utterance.pitch = 1.1; // 부드러운 여성 톤
                utterance.volume = 0.9;
                console.log(`💻 부드러운 여성 톤 기본 설정 적용: rate=${utterance.rate.toFixed(2)}, pitch=${utterance.pitch}, volume=${utterance.volume}`);
            }

            this.setupAudioCallbacks(utterance);
            speechSynthesis.speak(utterance);
            
        }, 100);
    }

    // TTS용 텍스트 최적화 (iOS 특화)
    optimizeTextForTTS(text) {
        if (!text) return text;
        
        const device = this.detectDevice();
        let optimizedText = text;
        
        if (device.isIOS) {
            // iOS TTS 최적화
            optimizedText = text
                // 숫자와 특수문자 처리
                .replace(/(\d+)%/g, '$1퍼센트')
                .replace(/(\d+)℃/g, '$1도')
                .replace(/(\d+)km/g, '$1킬로미터')
                .replace(/(\d+)m/g, '$1미터')
                .replace(/(\d+)kg/g, '$1킬로그램')
                
                // 문장 부호 최적화 (iOS TTS가 더 자연스럽게 읽도록)
                .replace(/\.\.\./g, '... ')  // 줄임표 뒤 공백
                .replace(/([가-힣])([.!?])/g, '$1$2 ')  // 문장 끝 공백
                .replace(/,\s*/g, ', ')  // 쉼표 뒤 일정한 공백
                
                // 발음하기 어려운 단어 처리
                .replace(/COVID-19/g, '코비드 19')
                .replace(/AI/g, '에이아이')
                .replace(/IoT/g, '아이오티')
                .replace(/5G/g, '5지')
                
                // 긴 문장 호흡 표시
                .replace(/([가-힣]{30,}?)([,.])/g, '$1$2 ');
                
            console.log('📝 iOS TTS 텍스트 최적화:', {
                원본: text.substring(0, 50) + '...',
                최적화: optimizedText.substring(0, 50) + '...'
            });
        }
        
        return optimizedText;
    }

    // 기기 감지 함수
    detectDevice() {
        const userAgent = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(userAgent);
        const isAndroid = /Android/.test(userAgent);
        const isMac = /Mac/.test(userAgent) && !isIOS;
        const isWindows = /Windows/.test(userAgent);
        
        console.log('🔍 기기 감지 결과:', { userAgent, isIOS, isAndroid, isMac, isWindows });
        return { isIOS, isAndroid, isMac, isWindows };
    }

    // 디버그용 음성 선택 함수 (알림 없이)
    getBestKoreanVoiceDebug() {
        const voices = speechSynthesis.getVoices();
        const koreanVoices = voices.filter(voice => 
            voice.lang.startsWith('ko') || voice.lang.includes('KR')
        );
        
        if (koreanVoices.length > 0) {
            return koreanVoices[0]; // 첫 번째 한국어 음성 반환
        }
        return null;
    }

    // 외부 TTS 사용 여부 판단
    shouldUseExternalTTS() {
        // 모든 디바이스에서 Google TTS 시도 (특히 iOS)
        return true; // Google Cloud TTS 우선 사용
    }

    // iOS 시스템 레벨 TTS 접근 시도
    async tryiOSSystemTTS(text) {
        console.log('🍎 iOS 시스템 TTS 시도');
        
        try {
            // 방법 1: iOS VoiceOver API 활용 시도
            if (window.speechSynthesis && window.speechSynthesis.getVoices) {
                const systemTTSResult = await this.accessiOSVoiceOver(text);
                if (systemTTSResult) return systemTTSResult;
            }

            // 방법 2: iOS Shortcuts URL Scheme 시도
            const shortcutsResult = await this.tryiOSShortcuts(text);
            if (shortcutsResult) return shortcutsResult;

            // 방법 3: iOS 시스템 읽기 기능 트리거
            const systemReadResult = await this.triggeriOSSystemRead(text);
            if (systemReadResult) return systemReadResult;

            return false;

        } catch (error) {
            console.error('❌ iOS 시스템 TTS 오류:', error);
            return false;
        }
    }

    // iOS VoiceOver API 접근 시도
    async accessiOSVoiceOver(text) {
        try {
            console.log('🔊 VoiceOver API 접근 시도');

            // VoiceOver가 활성화되어 있는지 확인
            if (window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis) {
                
                // iOS의 접근성 API를 통한 시스템 음성 접근
                const utterance = new SpeechSynthesisUtterance(text);
                
                // iOS 시스템 설정 기반 음성 선택 시도
                const voices = speechSynthesis.getVoices();
                
                // iOS 시스템 기본 음성 찾기 (보통 Siri 음성)
                let systemVoice = voices.find(voice => 
                    voice.default === true && 
                    (voice.lang.includes('ko') || voice.lang.includes('KR'))
                );

                if (!systemVoice) {
                    // iOS에서 "장치에서" 음성 찾기
                    systemVoice = voices.find(voice => 
                        voice.localService === true && 
                        (voice.lang.includes('ko') || voice.lang.includes('KR'))
                    );
                }

                if (!systemVoice) {
                    // Apple 음성 찾기
                    systemVoice = voices.find(voice => 
                        (voice.voiceURI.includes('Apple') || voice.voiceURI.includes('com.apple')) &&
                        (voice.lang.includes('ko') || voice.lang.includes('KR'))
                    );
                }

                if (systemVoice) {
                    utterance.voice = systemVoice;
                    console.log('✅ iOS 시스템 음성 발견:', systemVoice.name, systemVoice.voiceURI);
                    
                    // iOS 최적화 설정
                    utterance.rate = 0.8;
                    utterance.pitch = 1.0; // 시스템 기본값 사용
                    utterance.volume = 1.0;

                    return new Promise((resolve) => {
                        utterance.onstart = () => {
                            console.log('▶️ iOS 시스템 음성 재생 시작');
                            resolve(true);
                        };
                        
                        utterance.onerror = () => {
                            console.log('❌ iOS 시스템 음성 재생 실패');
                            resolve(false);
                        };

                        speechSynthesis.cancel();
                        speechSynthesis.speak(utterance);
                    });
                } else {
                    console.log('⚠️ iOS 시스템 음성을 찾을 수 없음');
                }
            }

            return false;

        } catch (error) {
            console.error('❌ VoiceOver API 오류:', error);
            return false;
        }
    }

    // iOS Shortcuts URL Scheme 시도
    async tryiOSShortcuts(text) {
        try {
            console.log('📱 iOS Shortcuts 시도');

            // iOS Shortcuts URL Scheme으로 Siri TTS 호출 시도
            const encodedText = encodeURIComponent(text);
            
            // Shortcuts URL (사용자가 미리 만들어야 함)
            const shortcutsURL = `shortcuts://run-shortcut?name=Speak Korean&input=${encodedText}`;
            
            // URL Scheme 실행 시도
            const link = document.createElement('a');
            link.href = shortcutsURL;
            link.target = '_blank';
            
            // 사용자에게 알림
            const userConsent = confirm('iOS Siri 음성으로 재생하시겠습니까? (Shortcuts 앱이 열립니다)');
            
            if (userConsent) {
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                console.log('✅ iOS Shortcuts 실행됨');
                return true;
            }

            return false;

        } catch (error) {
            console.error('❌ iOS Shortcuts 오류:', error);
            return false;
        }
    }

    // iOS 시스템 읽기 기능 트리거
    async triggeriOSSystemRead(text) {
        try {
            console.log('📖 iOS 시스템 읽기 기능 시도');

            // 방법 1: Selection API를 사용하여 텍스트 선택 후 iOS "선택 항목 말하기" 트리거
            const textElement = document.createElement('div');
            textElement.textContent = text;
            textElement.style.cssText = `
                position: absolute; 
                left: -9999px; 
                opacity: 0.01;
                font-size: 16px;
                user-select: text;
                -webkit-user-select: text;
            `;
            
            document.body.appendChild(textElement);

            // 텍스트 선택
            const range = document.createRange();
            range.selectNodeContents(textElement);
            
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            // iOS "선택 항목 말하기" 기능 트리거 시도
            setTimeout(() => {
                // 사용자에게 iOS 접근성 기능 사용 안내
                alert('iOS 설정 → 접근성 → 음성 콘텐츠 → "선택 항목 말하기"를 켜고, 선택된 텍스트를 길게 눌러 "말하기"를 선택하세요.');
                
                // 3초 후 정리
                setTimeout(() => {
                    document.body.removeChild(textElement);
                }, 3000);
            }, 1000);

            return true;

        } catch (error) {
            console.error('❌ iOS 시스템 읽기 오류:', error);
            return false;
        }
    }

    // 사전 녹음된 여성 음성 사용 (iOS 전용)
    async usePreRecordedFemaleAudio(text) {
        console.log('🎵 사전 녹음 여성 음성 시도:', text.substring(0, 30) + '...');
        
        try {
            // Web Speech API로 여성 음성 생성 후 즉시 재생
            return new Promise((resolve, reject) => {
                const utterance = new SpeechSynthesisUtterance(text);
                
                // 극단적 여성 설정
                utterance.rate = 0.6;    // 매우 느리게
                utterance.pitch = 2.0;   // 최고 음조
                utterance.volume = 1.0;  // 최대 볼륨
                
                // 첫 번째 한국어 음성 강제 선택
                const voices = speechSynthesis.getVoices();
                const koreanVoices = voices.filter(voice => 
                    voice.lang.includes('ko') || voice.lang.includes('KR')
                );
                
                if (koreanVoices.length > 0) {
                    utterance.voice = koreanVoices[0];
                    console.log('🎤 강제 여성 음성 설정:', koreanVoices[0].name);
                }
                
                utterance.onstart = () => {
                    console.log('▶️ 음성 재생 시작');
                    resolve(true);
                };
                
                utterance.onend = () => {
                    console.log('✅ 음성 재생 완료');
                };
                
                utterance.onerror = (error) => {
                    console.error('❌ 음성 재생 오류:', error);
                    reject(error);
                };
                
                speechSynthesis.cancel(); // 기존 음성 중단
                speechSynthesis.speak(utterance);
            });
            
        } catch (error) {
            console.error('❌ 사전 녹음 음성 오류:', error);
            return false;
        }
    }

    // Google Cloud TTS API를 사용한 고품질 여성 음성 재생
    async playAudioWithExternalTTS(text) {
        try {
            this.updateStatusInfo('🌟 Google Cloud 고품질 여성 음성으로 재생 중...');
            const playBtn = document.getElementById('playBtn');
            playBtn.disabled = true;
            playBtn.textContent = '🔊 재생 중...';

            // Google Cloud TTS API 호출
            const audioUrl = await this.generateTTSAudio(text);
            
            if (audioUrl === 'USE_WEB_SPEECH') {
                // 데모 모드: 최적화된 Web Speech API 사용
                console.log('🔄 Google 데모 모드 → 최적화된 Web Speech 사용');
                this.updateStatusInfo('🔄 최적화된 Web Speech 음성으로 재생 중...');
                this.playAudioWithWebSpeech(text);
                return;
                
            } else if (audioUrl) {
                console.log('✅ Google TTS 오디오 생성 성공');
                
                // 실제 Google TTS 고품질 오디오 재생
                const audio = new Audio(audioUrl);
                audio.playbackRate = this.currentRate;
                
                audio.onplay = () => {
                    console.log('🎵 Google 고품질 여성 음성 재생 시작');
                    this.updateStatusInfo('🎵 Google 고품질 여성 음성 재생 중...');
                };
                
                audio.onended = () => {
                    console.log('✅ Google TTS 재생 완료');
                    playBtn.disabled = false;
                    playBtn.textContent = '🔊 듣기';
                    this.updateStatusInfo('✅ 완료! 자연스러운 여성 음성으로 재생되었습니다.');
                };
                
                audio.onerror = (error) => {
                    console.error('❌ Google TTS 재생 오류:', error);
                    throw new Error('Google TTS 재생 실패');
                };
                
                await audio.play();
                return;
                
            } else {
                throw new Error('Google TTS 오디오 생성 실패');
            }
            
        } catch (error) {
            console.error('❌ Google TTS 오류:', error);
            this.updateStatusInfo('🔄 Google TTS 오류, 대체 방법으로 재생...');
            
            // Google TTS 실패 시 iOS 시스템 TTS 시도
            const device = this.detectDevice();
            if (device.isIOS) {
                const systemSuccess = await this.tryiOSSystemTTS(text);
                if (systemSuccess) {
                    document.getElementById('playBtn').disabled = false;
                    document.getElementById('playBtn').textContent = '🔊 듣기';
                    return;
                }
            }
            
            // 최종 대체: Web Speech API
            this.playAudioWithWebSpeech(text);
        }
    }

    // Google Cloud TTS API 호출 (Netlify Function 사용)
    async generateTTSAudio(text) {
        try {
            console.log('🌐 Google TTS API 호출:', text.substring(0, 50) + '...');
            
            // Netlify Function 엔드포인트 설정 (여러 경로 시도)
            let response;
            try {
                response = await fetch('/.netlify/functions/tts', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        text: text,
                        voice: 'ko-KR-Neural2-A', // Neural2 음성 (가장 자연스러운 여성 음성)
                        speed: this.currentRate || 1.0
                    })
                });
            } catch (fetchError) {
                console.log('🔄 첫 번째 경로 실패, /api/tts 시도...');
                response = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        text: text,
                        voice: 'ko-KR-Neural2-A',
                        speed: this.currentRate || 1.0
                    })
                });
            }

            if (!response.ok) {
                throw new Error(`TTS API 응답 오류: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                if (data.audioUrl) {
                    // 실제 Google TTS 오디오 URL 반환
                    console.log(`✅ ${data.type === 'google-cloud-tts' ? '실제 Google TTS' : 'TTS'} 생성 성공`);
                    console.log(`   음성: ${data.voice}, 메시지: ${data.message}`);
                    return data.audioUrl;
                    
                } else if (data.fallback) {
                    // 데모 모드: 클라이언트에서 최적화된 Web Speech 사용
                    console.log('🔄 Google TTS 데모 모드: 최적화된 Web Speech 사용');
                    return 'USE_WEB_SPEECH'; // 특수 값으로 Web Speech 사용 지시
                    
                } else {
                    throw new Error('TTS 응답에 오디오 URL이 없습니다');
                }
            } else {
                throw new Error(data.error || 'TTS 생성 실패');
            }
            
        } catch (error) {
            console.error('❌ TTS API 호출 오류:', error);
            
            // 네트워크 오류인지 확인
            if (error.name === 'TypeError' || error.message.includes('fetch')) {
                console.log('🔄 TTS 서버 연결 실패, Web Speech로 대체');
            }
            
            return null;
        }
    }

    // 남성 음성 감지 (iOS 전용)
    isMaleVoice(voice) {
        if (!voice || !voice.name) return false;
        
        const voiceName = voice.name.toLowerCase();
        
        // 명시적 남성 키워드 체크
        const maleKeywords = [
            'male', 'man', '남성', 'masculine', 
            'diego', 'carlos', 'jorge', 'pablo',
            'john', 'david', 'michael', 'robert'
        ];
        
        const isMale = maleKeywords.some(keyword => voiceName.includes(keyword));
        
        if (isMale) {
            console.log(`🚫 남성 음성 감지: ${voice.name}`);
            return true;
        }
        
        return false;
    }

    // 강화된 여성 음성 선택 (iOS 특화)
    selectBestFemaleVoice() {
        const voices = speechSynthesis.getVoices();
        console.log(`🔍 전체 음성 수: ${voices.length}`);
        
        // 한국어 음성 필터링
        const koreanVoices = voices.filter(voice => 
            voice.lang.includes('ko') || 
            voice.lang.includes('KR') || 
            voice.lang.includes('Korean')
        );
        
        console.log(`🇰🇷 한국어 음성 수: ${koreanVoices.length}`);
        koreanVoices.forEach((voice, index) => {
            console.log(`${index + 1}. ${voice.name} (${voice.lang}) - ${voice.localService ? 'Local' : 'Remote'}`);
        });

        if (koreanVoices.length === 0) {
            console.log('❌ 한국어 음성을 찾을 수 없음');
            return null;
        }

        const device = this.detectDevice();
        
        if (device.isIOS) {
            // iOS에서 여성 음성 우선 선택 로직
            console.log('📱 iOS 여성 음성 선택 중...');
            
            // 1순위: 명시적 여성 음성 키워드가 있는 음성
            let femaleVoice = koreanVoices.find(voice => 
                voice.name.toLowerCase().includes('female') ||
                voice.name.toLowerCase().includes('woman') ||
                voice.name.toLowerCase().includes('여성') ||
                voice.name.toLowerCase().includes('yuna') ||
                voice.name.toLowerCase().includes('jieun') ||
                voice.name.toLowerCase().includes('sora')
            );
            
            if (femaleVoice) {
                console.log('✅ iOS 명시적 여성 음성 발견:', femaleVoice.name);
                return femaleVoice;
            }

            // 2순위: 로컬 음성 중에서 첫 번째 (iOS는 보통 여성 음성이 기본)
            let localVoice = koreanVoices.find(voice => voice.localService);
            if (localVoice) {
                console.log('✅ iOS 로컬 음성 선택:', localVoice.name);
                return localVoice;
            }

            // 3순위: 첫 번째 한국어 음성
            console.log('✅ iOS 기본 한국어 음성 선택:', koreanVoices[0].name);
            return koreanVoices[0];
        }

        // 기타 플랫폼: 첫 번째 한국어 음성 선택
        console.log('✅ 기본 한국어 음성 선택:', koreanVoices[0].name);
        return koreanVoices[0];
    }

    // 기존 Web Speech 방법 (분리)
    playAudioWithWebSpeech(text) {
        console.log('🔄 Web Speech API 사용 (외부 TTS 실패 시 대체)');
        
        if (!window.speechSynthesis) {
            console.error('❌ Web Speech API 지원 안됨');
            this.updateStatusInfo('음성 재생을 지원하지 않는 브라우저입니다.');
            return;
        }

        const playBtn = document.getElementById('playBtn');
        playBtn.disabled = true;
        playBtn.textContent = '🔊 재생 중...';

        // 기존 음성 중단
        speechSynthesis.cancel();

        // 약간의 지연으로 cancel이 완전히 처리되도록
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            
            // iOS에서 더 나은 처리를 위한 문장 전처리
            utterance.text = this.optimizeTextForTTS(text);
            
            // 최적의 한국어 여성 음성 선택 (강화된 로직)
            const bestVoice = this.selectBestFemaleVoice();
            if (bestVoice) {
                utterance.voice = bestVoice;
                console.log('✅ 선택된 음성:', bestVoice.name, bestVoice.lang);
            } else {
                console.log('⚠️ 적합한 한국어 음성을 찾을 수 없음, 기본 음성 사용');
            }

            // iOS 디바이스별 최적화
            const device = this.detectDevice();
            if (device.isIOS) {
                // iOS: 극단적 여성 음성 설정 (남성 음성 완전 차단)
                if (bestVoice && this.isMaleVoice(bestVoice)) {
                    console.log('⚠️ 남성 음성 감지됨, 대체 음성 찾는 중...');
                    
                    // 모든 한국어 음성 중에서 여성 음성 재검색
                    const voices = speechSynthesis.getVoices();
                    const koreanVoices = voices.filter(voice => 
                        voice.lang.includes('ko') || voice.lang.includes('KR')
                    );
                    
                    // 남성이 아닌 음성 찾기
                    const nonMaleVoice = koreanVoices.find(voice => !this.isMaleVoice(voice));
                    if (nonMaleVoice) {
                        utterance.voice = nonMaleVoice;
                        console.log('✅ 대체 여성 음성 선택:', nonMaleVoice.name);
                    } else {
                        console.log('⚠️ 여성 음성을 찾을 수 없어 극단적 설정 적용');
                    }
                }
                
                // iOS: 극단적 여성 톤 설정
                utterance.rate = Math.max(0.3, Math.min(2.0, this.currentRate * 0.75)); // 더 느리게
                utterance.pitch = 1.8; // 매우 높은 음조 (여성스럽게)
                utterance.volume = 1.0; // 최대 볼륨
                console.log(`📱 iOS 극단적 여성 톤 설정: rate=${utterance.rate.toFixed(2)}, pitch=${utterance.pitch}, volume=${utterance.volume}`);
            } else if (device.isAndroid) {
                // Android: 표준 설정
                utterance.rate = Math.max(0.1, Math.min(2.0, this.currentRate));
                utterance.pitch = 1.0;
                utterance.volume = 1.0;
                console.log(`🤖 Android 표준 설정: rate=${utterance.rate.toFixed(2)}, pitch=${utterance.pitch}, volume=${utterance.volume}`);
            } else {
                // Desktop: 부드러운 여성 톤
                utterance.rate = Math.max(0.1, Math.min(2.0, this.currentRate));
                utterance.pitch = 1.2;
                utterance.volume = 0.9;
                console.log(`💻 Desktop 부드러운 여성 톤 설정: rate=${utterance.rate.toFixed(2)}, pitch=${utterance.pitch}, volume=${utterance.volume}`);
            }

            this.setupAudioCallbacks(utterance);
            speechSynthesis.speak(utterance);
            
        }, 100);
    }

    // iPhone용 음성 정보 화면 표시
    displayVoiceInfoForIphone(voices) {
        const device = this.detectDevice();
        if (!device.isIOS) return; // iOS가 아니면 실행하지 않음
        
        const koreanVoices = voices.filter(voice => 
            voice.lang.startsWith('ko') || voice.lang.includes('KR')
        );
        
        // 상태 정보 영역에 표시
        const statusElement = document.getElementById('statusInfo');
        if (statusElement) {
            let info = `📱 iPhone 음성 정보\n`;
            info += `전체 음성: ${voices.length}개\n`;
            info += `한국어 음성: ${koreanVoices.length}개\n\n`;
            
            if (koreanVoices.length > 0) {
                info += `📋 한국어 음성 목록:\n`;
                koreanVoices.forEach((voice, index) => {
                    info += `${index + 1}. ${voice.name}\n`;
                    info += `   언어: ${voice.lang}\n`;
                    info += `   ${voice.localService ? '로컬' : '원격'}\n\n`;
                });
                
                // 선택될 음성
                const selectedVoice = koreanVoices[0];
                info += `✅ 선택된 음성: ${selectedVoice.name}\n`;
                info += `   언어: ${selectedVoice.lang}`;
            } else {
                info += `❌ 한국어 음성을 찾을 수 없습니다.`;
            }
            
            // 화면에 표시 (복사 가능하게)
            statusElement.innerHTML = `
                <div style="background: #f0f8ff; padding: 15px; border-radius: 10px; margin: 10px 0;">
                    <pre style="font-size: 12px; text-align: left; white-space: pre-wrap; user-select: text;">${info}</pre>
                    <button onclick="navigator.clipboard.writeText(\`${info.replace(/`/g, '\\`')}\`); alert('복사됨!');" 
                            style="margin-top: 10px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 5px;">
                        📋 정보 복사하기
                    </button>
                </div>
            `;
        }
    }

    getBestKoreanVoice() {
        const voices = speechSynthesis.getVoices();
        console.log('🔊 사용 가능한 모든 음성 (총 ' + voices.length + '개):');
        voices.forEach((v, index) => {
            console.log(`${index + 1}. ${v.name} (${v.lang}) - ${v.localService ? '로컬' : '원격'} - ${v.voiceURI}`);
        });
        
        // iPhone용 음성 정보 화면 표시
        this.displayVoiceInfoForIphone(voices);
        
        // 한국어 음성만 필터링 (여성 음성 우선)
        const koreanVoices = voices.filter(voice => 
            voice.lang.startsWith('ko') || voice.lang.includes('KR')
        );
        
        // iOS 실제 여성 음성 강화 감지
        const femaleKoreanVoices = [];
        const maleKoreanVoices = [];
        
        koreanVoices.forEach(voice => {
            const name = voice.name.toLowerCase();
            const voiceURI = voice.voiceURI ? voice.voiceURI.toLowerCase() : '';
            
            // 명시적 남성 음성 제외 먼저 체크
            const isMale = (
                name.includes('male') && !name.includes('female') ||
                name.includes('남성') ||
                name.includes('man') && !name.includes('woman') ||
                name.includes('boy') ||
                voiceURI.includes('male') && !voiceURI.includes('female')
            );
            
            if (isMale) {
                maleKoreanVoices.push(voice);
                return;
            }
            
            // iOS/macOS 여성 음성 특별 감지
            const isFemale = (
                // 명시적 여성 키워드
                name.includes('female') ||
                name.includes('여성') ||
                name.includes('woman') ||
                
                // iOS 특정 여성 음성들
                name.includes('yuna') ||
                name.includes('siri') && name.includes('female') ||
                name.includes('korean') && name.includes('female') ||
                name === 'yuna' ||
                name === 'korean female' ||
                
                // voiceURI 기반 감지 (iOS에서 더 정확)
                voiceURI.includes('yuna') ||
                voiceURI.includes('female') ||
                
                // Android 여성 음성
                name.includes('google 한국의') ||
                name.includes('korean (south korea) - female') ||
                
                // Windows 여성 음성
                name.includes('heami') ||
                
                // 기본적으로 성별이 명시되지 않은 경우도 여성으로 간주 (대부분 여성 음성)
                (!name.includes('male') && !name.includes('남성') && !name.includes('man'))
            );
            
            if (isFemale) {
                femaleKoreanVoices.push(voice);
            } else {
                maleKoreanVoices.push(voice);
            }
        });
        
        console.log('🎤 한국어 음성들 (총 ' + koreanVoices.length + '개):', koreanVoices.map(v => ({name: v.name, lang: v.lang, uri: v.voiceURI})));
        console.log('👩 여성 한국어 음성들 (총 ' + femaleKoreanVoices.length + '개):', femaleKoreanVoices.map(v => ({name: v.name, lang: v.lang, uri: v.voiceURI})));
        console.log('👨 남성 한국어 음성들 (총 ' + maleKoreanVoices.length + '개):', maleKoreanVoices.map(v => ({name: v.name, lang: v.lang, uri: v.voiceURI})));

        // 기기별 최적화된 음성 우선순위
        const device = this.detectDevice();
        let voicePriorities = [];

        if (device.isIOS) {
            // iPhone용 간단하고 확실한 음성 우선순위
            voicePriorities = [
                // 최우선: iOS 기본 한국어 음성 (보통 Yuna)
                'Korean (South Korea)',
                'Korean',
                '한국어',
                
                // iOS 고품질 음성들
                'Yuna',
                'Sora',
                'Jieun',
                
                // 백업용
                'Microsoft Heami - Korean (Korea)'
            ];
        } else if (device.isAndroid) {
            // Android 전용 우선순위
            voicePriorities = [
                'Google 한국의',
                'Google Korean Female',
                'Google Korean',
                'Samsung Korean Female',
                'Korean Female Voice',
                'Korean (South Korea) - Female',
                'Korean Female',
                'Korean (South Korea)',
                'Korean'
            ];
        } else if (device.isWindows) {
            // Windows 전용 우선순위
            voicePriorities = [
                'Microsoft Heami - Korean (Korea)',
                'Microsoft Heami',
                'Heami',
                'Korean Female Voice',
                'Korean (South Korea) - Female',
                'Korean Female',
                'Korean (South Korea)',
                'Korean'
            ];
        } else if (device.isMac) {
            // macOS 전용 우선순위
            voicePriorities = [
                'Yuna',
                'Korean Female',
                'Korean (South Korea) - Female',
                'Korean (South Korea)',
                'Korean',
                '한국어'
            ];
        } else {
            // 기타 플랫폼 (범용)
            voicePriorities = [
                'Google 한국의',
                'Google Korean',
                'Korean Female Voice',
                'Korean (South Korea) - Female',
                'Korean Female',
                'Korean (South Korea)',
                'Korean',
                '한국어'
            ];
        }

        console.log(`📱 ${device.isIOS ? 'iOS' : device.isAndroid ? 'Android' : device.isWindows ? 'Windows' : device.isMac ? 'macOS' : '기타'} 전용 음성 우선순위:`, voicePriorities);

        // 1차: 여성 음성에서 우선순위 검색
        console.log('🔍 1차: 여성 음성에서 우선순위 검색 중...');
        for (const priorityName of voicePriorities) {
            const voice = femaleKoreanVoices.find(v => 
                v.name.includes(priorityName) || 
                v.name.toLowerCase().includes(priorityName.toLowerCase())
            );
            if (voice) {
                console.log(`✅ 여성 우선순위 음성 선택됨: ${voice.name}`);
                return voice;
            }
        }

        // 2차: 여성 음성 중 첫 번째 (iOS에서 강제 여성 음성 사용)  
        if (femaleKoreanVoices.length > 0) {
            const selectedFemale = femaleKoreanVoices[0];
            console.log(`✅ 강제 여성 한국어 음성 선택됨: ${selectedFemale.name} (URI: ${selectedFemale.voiceURI})`);
            return selectedFemale;
        }

        // 3차: iOS에서 남성 음성 완전 차단 - 여성 음성만 사용
        if (device.isIOS) {
            console.log('🍎 iOS - 남성 음성 차단, 여성 음성만 사용');
            // iOS에서는 여성 음성이 없으면 아예 null 반환 (기본 음성 사용하지 않음)
            console.log('❌ iOS에서 여성 한국어 음성을 찾을 수 없음');
            return null;
        }

        // 4차: 다른 플랫폼에서만 전체 한국어 음성 검색
        console.log('⚠️ 여성 음성 없음. 전체 한국어 음성에서 검색...');
        for (const priorityName of voicePriorities) {
            const voice = koreanVoices.find(v => 
                v.name.includes(priorityName) || 
                v.name.toLowerCase().includes(priorityName.toLowerCase())
            );
            if (voice) {
                // 남성 음성인지 다시 체크
                const isMaleVoice = maleKoreanVoices.some(male => male.name === voice.name);
                if (!isMaleVoice) {
                    console.log(`⚠️ 일반 우선순위 음성 선택됨: ${voice.name}`);
                    return voice;
                }
            }
        }

        // 5차: 마지막 백업 (여성 음성만)
        const nonMaleVoices = koreanVoices.filter(v => 
            !maleKoreanVoices.some(male => male.name === v.name)
        );
        
        if (nonMaleVoices.length > 0) {
            console.log(`⚠️ 백업 여성 음성 선택됨: ${nonMaleVoices[0].name}`);
            return nonMaleVoices[0];
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