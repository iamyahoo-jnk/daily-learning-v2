// server/tts-api.js - Google Cloud TTS API 서버
const express = require('express');
const cors = require('cors');
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

// CORS 설정
app.use(cors());
app.use(express.json());

// Google Cloud TTS 클라이언트 초기화
// 환경변수 GOOGLE_APPLICATION_CREDENTIALS에 서비스 계정 키 파일 경로 설정
const ttsClient = new textToSpeech.TextToSpeechClient();

// 오디오 파일 캐시 디렉토리
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

// 텍스트를 음성으로 변환하는 API 엔드포인트
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voice = 'ko-KR-Neural2-A', speed = 1.0 } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: '텍스트가 필요합니다.' });
        }

        console.log('🎤 TTS 요청:', { text: text.substring(0, 50) + '...', voice, speed });

        // 캐시 키 생성 (텍스트 + 음성 + 속도의 해시)
        const cacheKey = crypto
            .createHash('md5')
            .update(`${text}_${voice}_${speed}`)
            .digest('hex');
        
        const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

        // 캐시된 파일이 있는지 확인
        try {
            await fs.access(cacheFilePath);
            console.log('💾 캐시된 음성 파일 사용:', cacheKey);
            
            // 캐시된 파일을 Base64로 인코딩하여 반환
            const audioBuffer = await fs.readFile(cacheFilePath);
            const audioBase64 = audioBuffer.toString('base64');
            const audioDataUrl = `data:audio/mpeg;base64,${audioBase64}`;
            
            return res.json({ 
                success: true, 
                audioUrl: audioDataUrl,
                cached: true,
                cacheKey 
            });
            
        } catch {
            // 캐시된 파일이 없으면 새로 생성
        }

        // Google Cloud TTS API 요청 설정 (자연스러운 음성을 위해 최적화)
        const request = {
            input: { text },
            voice: {
                languageCode: 'ko-KR',
                name: voice || 'ko-KR-Neural2-A', // Neural2 음성 우선 사용 (가장 자연스러움)
                ssmlGender: voice && voice.includes('B') ? 'MALE' : 'FEMALE'
            },
            audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: speed || 1.0,
                pitch: 0.0,  // 자연스러운 음조 (중성)
                volumeGainDb: 2.0  // 약간 볼륨 증가
            }
        };

        console.log('🌐 Google TTS API 호출 중...');
        const [response] = await ttsClient.synthesizeSpeech(request);

        // 생성된 오디오를 캐시에 저장
        await fs.writeFile(cacheFilePath, response.audioContent);
        console.log('💾 음성 파일 캐시 저장:', cacheKey);

        // Base64 인코딩하여 반환
        const audioBase64 = response.audioContent.toString('base64');
        const audioDataUrl = `data:audio/mpeg;base64,${audioBase64}`;

        res.json({ 
            success: true, 
            audioUrl: audioDataUrl,
            cached: false,
            cacheKey 
        });

        console.log('✅ TTS 생성 완료');

    } catch (error) {
        console.error('❌ TTS API 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: 'TTS 생성 중 오류가 발생했습니다.',
            details: error.message 
        });
    }
});

// 사용 가능한 음성 목록 조회
app.get('/api/voices', async (req, res) => {
    try {
        console.log('🔍 음성 목록 조회 요청');
        
        const [result] = await ttsClient.listVoices({});
        const koreanVoices = result.voices.filter(voice => 
            voice.languageCodes.some(code => code.startsWith('ko'))
        );

        res.json({ 
            success: true, 
            voices: koreanVoices.map(voice => ({
                name: voice.name,
                languageCodes: voice.languageCodes,
                ssmlGender: voice.ssmlGender,
                naturalSampleRateHertz: voice.naturalSampleRateHertz
            }))
        });

        console.log(`✅ 한국어 음성 ${koreanVoices.length}개 반환`);

    } catch (error) {
        console.error('❌ 음성 목록 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '음성 목록 조회 중 오류가 발생했습니다.' 
        });
    }
});

// 캐시 관리 엔드포인트
app.delete('/api/cache', async (req, res) => {
    try {
        const files = await fs.readdir(CACHE_DIR);
        const deletePromises = files.map(file => 
            fs.unlink(path.join(CACHE_DIR, file))
        );
        
        await Promise.all(deletePromises);
        console.log(`🗑️ 캐시 파일 ${files.length}개 삭제`);
        
        res.json({ success: true, deletedCount: files.length });
        
    } catch (error) {
        console.error('❌ 캐시 삭제 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '캐시 삭제 중 오류가 발생했습니다.' 
        });
    }
});

// 서버 상태 확인
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'TTS API 서버가 정상적으로 실행 중입니다.',
        timestamp: new Date().toISOString()
    });
});

// 정적 파일 제공 (캐시된 오디오 파일)
app.use('/cache', express.static(CACHE_DIR));

async function startServer() {
    try {
        await ensureCacheDir();
        
        app.listen(port, () => {
            console.log(`🚀 TTS API 서버가 포트 ${port}에서 실행 중입니다.`);
            console.log(`📋 사용 가능한 엔드포인트:`);
            console.log(`   POST /api/tts - 텍스트를 음성으로 변환`);
            console.log(`   GET /api/voices - 사용 가능한 음성 목록`);
            console.log(`   DELETE /api/cache - 캐시 파일 삭제`);
            console.log(`   GET /api/health - 서버 상태 확인`);
        });
    } catch (error) {
        console.error('❌ 서버 시작 오류:', error);
    }
}

startServer();

module.exports = app;