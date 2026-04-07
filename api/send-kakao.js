import crypto from 'node:crypto';

/**
 * Vercel Serverless Function
 * POST /api/send-kakao
 *
 * 솔라피 SDK를 통한 카카오톡 알림톡 발송
 */
function normalizeSenderNumber(value) {
  return String(value || '').replace(/[^0-9]/g, '').trim();
}

async function fetchActiveSenderNumber(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) return '';

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');

  const response = await fetch('https://api.solapi.com/senderid/v1/numbers/active', {
    method: 'GET',
    headers: {
      Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`활성 발신번호 조회 실패 (${response.status})`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return normalizeSenderNumber(data[0]);
  }
  if (Array.isArray(data?.numberList)) {
    return normalizeSenderNumber(data.numberList[0]);
  }
  return '';
}

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phoneNumber, templateCode, message, variables, scheduleDate } = req.body;

    // 필수 파라미터 검증
    if (!phoneNumber || !templateCode) {
      return res.status(400).json({ 
        error: '필수 파라미터가 누락되었습니다: phoneNumber, templateCode' 
      });
    }

    // 솔라피 환경 변수 확인 (디버깅 로그 포함)
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const pfId = process.env.SOLAPI_PF_ID;
    const configuredSenderNumber = normalizeSenderNumber(
      process.env.SOLAPI_SENDER_NUMBER ||
      process.env.SENDER_NUMBER ||
      process.env.SOLAPI_FROM ||
      process.env.SOLAPI_FROM_NUMBER
    );

    // 환경 변수 존재 여부 확인 (값은 로그하지 않음 - 보안)
    const envVarsStatus = {
      SOLAPI_API_KEY: apiKey ? '설정됨' : '미설정',
      SOLAPI_API_SECRET: apiSecret ? '설정됨' : '미설정',
      SOLAPI_PF_ID: pfId ? '설정됨' : '미설정',
      SOLAPI_SENDER_NUMBER: configuredSenderNumber ? '설정됨' : '미설정',
    };
    console.log('환경 변수 상태:', envVarsStatus);

    if (!apiKey || !apiSecret) {
      console.error('솔라피 API 키가 설정되지 않았습니다. 환경 변수 상태:', envVarsStatus);
      return res.status(500).json({ 
        error: '서버 설정 오류: 솔라피 API 키가 설정되지 않았습니다.\n\n' +
               '확인 사항:\n' +
               '1. Vercel Dashboard → Settings → Environment Variables에서 환경 변수가 설정되었는지 확인\n' +
               '2. 환경 변수 이름이 정확한지 확인 (SOLAPI_API_KEY, SOLAPI_API_SECRET - 대소문자 구분)\n' +
               '3. Production, Preview, Development 모두에 환경 변수가 설정되었는지 확인\n' +
               '4. 환경 변수 추가 후 반드시 재배포했는지 확인 (Deployments → 최신 배포 → Redeploy)\n' +
               '5. 현재 사용 중인 URL이 프로덕션 URL인지 확인 (localhost가 아닌 vercel.app 도메인)\n\n' +
               '자세한 내용은 VERCEL_SOLAPI_ENV_SETUP.md 파일을 참고하세요.'
      });
    }

    if (!pfId) {
      console.error('플러스친구 ID가 설정되지 않았습니다.');
      return res.status(500).json({ 
        error: '서버 설정 오류: 플러스친구 ID가 설정되지 않았습니다.' 
      });
    }

    let senderNumber = configuredSenderNumber;
    if (!senderNumber) {
      try {
        senderNumber = await fetchActiveSenderNumber(apiKey, apiSecret);
        console.log('활성 발신번호 자동 조회 결과:', senderNumber ? '조회 성공' : '조회 실패');
      } catch (senderLookupError) {
        console.error('활성 발신번호 자동 조회 실패:', senderLookupError);
      }
    }

    if (!senderNumber) {
      console.error('발신자 번호가 설정되지 않았습니다.');
      return res.status(500).json({
        error: '서버 설정 오류: 사용 가능한 발신번호를 찾지 못했습니다.\n' +
               'Vercel Dashboard에서 SOLAPI_SENDER_NUMBER를 설정하거나 솔라피에 발신번호가 활성화되어 있는지 확인해주세요.'
      });
    }

    // 전화번호 정리 (하이픈 제거, 숫자만 추출)
    const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, '').trim();
    
    console.log('🔵 [1단계] 전화번호 처리:', {
      원본: phoneNumber,
      정리된번호: cleanPhoneNumber,
      길이: cleanPhoneNumber.length
    });
    
    // 전화번호 유효성 검증
    if (!cleanPhoneNumber || cleanPhoneNumber.length < 10 || cleanPhoneNumber.length > 15) {
      console.error('❌ 전화번호 유효성 검증 실패:', {
        원본: phoneNumber,
        정리된: cleanPhoneNumber,
        길이: cleanPhoneNumber.length
      });
      throw new Error(`유효하지 않은 전화번호입니다: ${phoneNumber} (길이: ${cleanPhoneNumber.length})`);
    }

    let normalizedScheduleDate = '';
    if (scheduleDate) {
      const parsedScheduleDate = new Date(scheduleDate);
      if (Number.isNaN(parsedScheduleDate.getTime())) {
        throw new Error('예약 발송 시간이 올바르지 않습니다.');
      }
      if (parsedScheduleDate.getTime() <= Date.now() + 60 * 1000) {
        throw new Error('예약 발송 시간은 현재보다 1분 이상 이후여야 합니다.');
      }
      normalizedScheduleDate = parsedScheduleDate.toISOString();
    }
    
    // 한국 전화번호를 14자리 memberId 형식으로 변환
    // Solapi SDK도 memberId를 요구하므로 변환 필요
    let memberId;
    if (cleanPhoneNumber.length === 11 && cleanPhoneNumber.startsWith('010')) {
      // 010-1234-5678 형식: 01012345678 → 82101234567800
      const withoutLeadingZero = cleanPhoneNumber.substring(1); // 1012345678
      memberId = `82${withoutLeadingZero}00`; // 82101234567800
    } else if (cleanPhoneNumber.length === 10 && cleanPhoneNumber.startsWith('10')) {
      // 1012345678 형식: 82101234567800
      memberId = `82${cleanPhoneNumber}00`;
    } else if (cleanPhoneNumber.startsWith('82')) {
      // 이미 국가코드 포함
      if (cleanPhoneNumber.length === 12) {
        memberId = `${cleanPhoneNumber}00`;
      } else {
        memberId = cleanPhoneNumber.padEnd(14, '0').substring(0, 14);
      }
    } else {
      // 기타: 기본 변환
      const baseNumber = cleanPhoneNumber.startsWith('010') 
        ? cleanPhoneNumber.substring(1) 
        : cleanPhoneNumber;
      memberId = `82${baseNumber}00`.substring(0, 14).padEnd(14, '0');
    }
    
    // 14자리 검증
    if (memberId.length !== 14 || !/^\d{14}$/.test(memberId)) {
      throw new Error(`memberId 변환 실패: 14자리 형식이 아닙니다. (원본: ${phoneNumber}, 변환: ${memberId})`);
    }
    
    console.log('🔵 [1-2단계] memberId 변환 완료:', {
      정리된번호: cleanPhoneNumber,
      memberId: memberId,
      memberId길이: memberId.length
    });
    
    // 솔라피 SDK 동적 import (CommonJS/ES Module 호환)
    let SolapiMessageService;
    try {
      const solapiModule = await import('solapi');
      // CommonJS와 ES Module 모두 지원
      SolapiMessageService = solapiModule.SolapiMessageService || solapiModule.default?.SolapiMessageService || solapiModule.default;
      
      if (!SolapiMessageService) {
        throw new Error('SolapiMessageService를 찾을 수 없습니다. SDK 모듈 구조를 확인해주세요.');
      }
      
      console.log('🔵 [2단계] SDK 모듈 로드 완료');
    } catch (importError) {
      console.error('❌ SDK 모듈 로드 실패:', importError);
      throw new Error(`SDK 모듈을 로드할 수 없습니다: ${importError.message}`);
    }
    
    // 솔라피 SDK 초기화
    const messageService = new SolapiMessageService(apiKey, apiSecret);
    
    console.log('🔵 [3단계] SDK 초기화 완료');
    
    // 알림톡 발송 (SDK 사용)
    // SDK가 자동으로 전화번호 형식 변환 및 인증 처리
    let result;
    
    // 디버깅: 전송할 변수 확인
    console.log('📤 [API] 전송할 변수:', {
      templateCode,
      variables,
      variablesKeys: variables ? Object.keys(variables) : [],
      variablesValues: variables ? Object.values(variables) : [],
    });
    
    try {
      result = await messageService.send(
        {
          to: cleanPhoneNumber,
          from: senderNumber,
          kakaoOptions: {
            pfId: pfId,
            templateId: templateCode,
            memberId: memberId, // 14자리 memberId 형식 (필수)
            variables: variables || {},
            disableSms: false, // SMS 대체 발송 허용
          },
        },
        normalizedScheduleDate
          ? {
              scheduledDate: normalizedScheduleDate,
            }
          : undefined,
      );
      
      // 솔라피 응답 확인
      console.log('📥 [API] 솔라피 응답:', JSON.stringify(result, null, 2));
      
      // 실패한 메시지가 있는지 확인
      if (result.failedMessageList && result.failedMessageList.length > 0) {
        const failedMessages = result.failedMessageList;
        const errorDetails = failedMessages.map(msg => {
          return `코드: ${msg.errorCode}, 메시지: ${msg.errorMessage || msg.errorMsg || '알 수 없는 오류'}`;
        }).join('\n');
        
        throw new Error(`${failedMessages.length}개의 메시지가 접수되지 못했습니다. 자세한 에러 메시지는 해당 에러 내 failedMessageList를 확인해주세요.\n\n${errorDetails}`);
      }
      
      // 성공한 메시지가 없는 경우
      if (result.successfulMessageList && result.successfulMessageList.length === 0) {
        throw new Error('메시지가 발송되지 않았습니다. 템플릿 코드와 변수를 확인해주세요.');
      }
      
    } catch (sdkError) {
      console.error('❌ 솔라피 SDK 오류:', {
        error: sdkError.message,
        stack: sdkError.stack,
        phoneNumber: cleanPhoneNumber,
        templateCode: templateCode,
        pfId: pfId,
        fullError: sdkError
      });
      
      // SDK 오류 메시지 추출
      let errorMsg = '카카오톡 발송 중 오류가 발생했습니다.';
      if (sdkError.message) {
        errorMsg = sdkError.message;
      } else if (sdkError.errorMessage) {
        errorMsg = sdkError.errorMessage;
      } else if (typeof sdkError === 'string') {
        errorMsg = sdkError;
      }
      
      throw new Error(errorMsg);
    }

    console.log('✅ 카카오톡 발송 성공 (SDK 사용):', result);

    return res.status(200).json({
      success: true,
      message: normalizedScheduleDate
        ? '카카오톡 예약발송이 성공적으로 접수되었습니다.'
        : '카카오톡 메시지가 성공적으로 발송되었습니다.',
      data: result,
      scheduledDate: normalizedScheduleDate || undefined,
    });

  } catch (error) {
    console.error('카카오톡 발송 실패:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || '카카오톡 발송 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
