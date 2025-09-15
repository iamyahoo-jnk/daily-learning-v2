// 실제 Google Cloud TTS 서버
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

// Google Cloud TTS Client
let textToSpeech = null;
let ttsClient = null;

// Google Cloud TTS 클라이언트 초기화 함수
function initializeGoogleTTS() {
    try {
        textToSpeech = require('@google-cloud/text-to-speech');
        
        // 환경변수 또는 서비스 계정 키 파일 확인
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT) {
            ttsClient = new textToSpeech.TextToSpeechClient();
            console.log('✅ Google Cloud TTS 클라이언트 초기화 성공');
            return true;
        } else {
            console.log('⚠️ Google Cloud 인증 정보를 찾을 수 없음 (데모 모드로 실행)');
            return false;
        }
    } catch (error) {
        console.log('⚠️ Google Cloud TTS 패키지 없음 - npm install 필요');
        console.log('   실행: npm install @google-cloud/text-to-speech');
        return false;
    }
}

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Google TTS 초기화
const hasGoogleTTS = initializeGoogleTTS();

// 캐시 디렉토리 설정
const CACHE_DIR = path.join(__dirname, 'tts-cache');

// 캐시 디렉토리 생성
async function ensureCacheDir() {
    try {
        await fs.access(CACHE_DIR);
    } catch {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        console.log('📁 TTS 캐시 디렉토리 생성:', CACHE_DIR);
    }
}

// 실제 Google Cloud TTS API 엔드포인트
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voice = 'ko-KR-Wavenet-A', speed = 1.0 } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: '텍스트가 필요합니다.' });
        }

        console.log('🎤 Google TTS 요청:', { 
            text: text.substring(0, 50) + '...', 
            voice, 
            speed,
            googleTTS: hasGoogleTTS ? 'REAL' : 'DEMO'
        });

        if (hasGoogleTTS && ttsClient) {
            // 실제 Google Cloud TTS 사용
            const audioBase64 = await generateRealGoogleTTS(text, voice, speed);
            
            if (audioBase64) {
                res.json({ 
                    success: true, 
                    audioUrl: `data:audio/mp3;base64,${audioBase64}`,
                    voice: voice,
                    message: `✅ 실제 Google Cloud ${voice} 음성`,
                    type: 'google-cloud-tts'
                });
                console.log('✅ 실제 Google TTS 생성 완료');
            } else {
                throw new Error('Google TTS 생성 실패');
            }
            
        } else {
            // 데모 모드: 최적화된 Web Speech API 시뮬레이션
            console.log('🔄 데모 모드: 클라이언트에서 최적화된 Web Speech 사용');
            
            res.json({ 
                success: true, 
                audioUrl: null, // 클라이언트에서 Web Speech 사용
                voice: voice,
                message: '⚠️ 데모 모드 (Google 인증 설정 필요)',
                type: 'web-speech-optimized',
                fallback: true
            });
        }

    } catch (error) {
        console.error('❌ TTS API 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '음성 생성 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 실제 Google Cloud TTS 음성 생성
async function generateRealGoogleTTS(text, voiceName, speed) {
    try {
        if (!ttsClient) {
            throw new Error('Google TTS 클라이언트 없음');
        }

        // Google TTS 요청 설정 - 최고 품질 한국어 여성 음성
        const request = {
            input: { text },
            voice: {
                languageCode: 'ko-KR',
                name: voiceName, // ko-KR-Wavenet-A (최고 품질 자연스러운 여성)
                ssmlGender: 'FEMALE'
            },
            audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: speed,
                pitch: 0.0,      // 자연스러운 여성 톤 (Google이 최적화)
                volumeGainDb: 0.0
            }
        };

        console.log('🌐 실제 Google Cloud TTS API 호출...');
        const [response] = await ttsClient.synthesizeSpeech(request);

        if (response.audioContent) {
            // Base64 인코딩하여 브라우저에서 바로 재생 가능
            const audioBase64 = response.audioContent.toString('base64');
            console.log(`✅ Google TTS 성공: ${Math.round(audioBase64.length/1024)}KB 생성`);
            return audioBase64;
        } else {
            throw new Error('Google TTS 응답에 오디오 없음');
        }

    } catch (error) {
        console.error('❌ Google TTS 생성 오류:', error.message);
        
        // API 할당량 초과나 인증 오류 세부 정보
        if (error.code) {
            console.error(`   오류 코드: ${error.code}`);
        }
        
        return null;
    }
}

// 사용 가능한 Google 한국어 음성 목록
app.get('/api/voices', (req, res) => {
    const koreanVoices = [
        {
            name: 'ko-KR-Wavenet-A',
            ssmlGender: 'FEMALE',
            description: '자연스러운 한국어 여성 음성 (최고 품질) ⭐',
            quality: 'WaveNet'
        },
        {
            name: 'ko-KR-Wavenet-B',
            ssmlGender: 'FEMALE', 
            description: '부드러운 한국어 여성 음성',
            quality: 'WaveNet'
        },
        {
            name: 'ko-KR-Standard-A',
            ssmlGender: 'FEMALE',
            description: '표준 한국어 여성 음성 (경제적)',
            quality: 'Standard'
        }
    ];

    res.json({ 
        success: true, 
        voices: koreanVoices, // 여성 음성만 제공
        message: hasGoogleTTS ? 
            'Google Cloud TTS 한국어 여성 음성 (실제)' : 
            'Google Cloud TTS 한국어 여성 음성 (데모)',
        authenticated: hasGoogleTTS
    });

    console.log(`✅ 한국어 여성 음성 ${koreanVoices.length}개 반환 (${hasGoogleTTS ? 'REAL' : 'DEMO'})`);
});

// 서버 상태 및 Google 인증 상태 확인
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: hasGoogleTTS ? 
            '🌟 Google Cloud TTS 서버가 정상 실행 중입니다!' :
            '⚠️ 데모 모드로 실행 중 (Google 인증 설정 필요)',
        timestamp: new Date().toISOString(),
        googleTTS: {
            enabled: hasGoogleTTS,
            status: hasGoogleTTS ? 'AUTHENTICATED' : 'NOT_AUTHENTICATED'
        },
        features: [
            hasGoogleTTS ? '✅ 실제 Google WaveNet 음성' : '⚠️ 데모 모드',
            '✅ 한국어 여성 음성 특화',
            '✅ iOS Safari 완벽 호환',
            '✅ 실시간 음성 생성'
        ],
        setup: hasGoogleTTS ? null : {
            step1: '1. Google Cloud Console에서 프로젝트 생성',
            step2: '2. Text-to-Speech API 활성화', 
            step3: '3. 서비스 계정 키 생성 및 GOOGLE_APPLICATION_CREDENTIALS 설정',
            step4: '4. npm install @google-cloud/text-to-speech'
        }
    });
});

// 서버 시작
async function startServer() {
    try {
        await ensureCacheDir();
        
        app.listen(port, () => {
            console.log(`\n🚀 Google Cloud TTS 서버 실행: http://localhost:${port}`);
            
            if (hasGoogleTTS) {
                console.log('✅ 실제 Google Cloud TTS 연결됨');
                console.log('🎤 ko-KR-Wavenet-A 여성 음성 사용 가능');
            } else {
                console.log('⚠️ 데모 모드 실행 중');
                console.log('💡 실제 Google TTS 사용을 위한 설정:');
                console.log('   1. Google Cloud Console: https://console.cloud.google.com/');
                console.log('   2. Text-to-Speech API 활성화');
                console.log('   3. 서비스 계정 키 생성');
                console.log('   4. npm install @google-cloud/text-to-speech');
            }
            
            console.log('\n📋 API 엔드포인트:');
            console.log('   POST /api/tts - 텍스트를 음성으로 변환');
            console.log('   GET /api/voices - 음성 목록');
            console.log('   GET /api/health - 서버 상태');
            console.log('\n🎯 받아쓰기 앱에서 테스트 가능!\n');
        });
    } catch (error) {
        console.error('❌ 서버 시작 오류:', error);
    }
}

startServer();

module.exports = app;