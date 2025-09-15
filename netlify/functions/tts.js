// netlify/functions/tts.js - Google Cloud TTS Netlify Function
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event, context) => {
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    const { text, voice = 'ko-KR-Neural2-A', speed = 1.0 } = JSON.parse(event.body);
    
    if (!text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '텍스트가 필요합니다.' }),
      };
    }

    // Initialize Google Cloud TTS client
    const ttsClient = new TextToSpeechClient({
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    });

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

    // Base64 인코딩하여 반환
    const audioBase64 = response.audioContent.toString('base64');
    const audioDataUrl = `data:audio/mpeg;base64,${audioBase64}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        audioUrl: audioDataUrl,
        cached: false
      }),
    };

  } catch (error) {
    console.error('❌ TTS Function 오류:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'TTS 생성 중 오류가 발생했습니다.',
        details: error.message 
      }),
    };
  }
};