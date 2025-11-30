/**
 * Vercel Serverless Function
 * POST /api/send-kakao
 * 
 * 솔라피 REST API를 통한 카카오톡 알림톡 발송
 */
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
    const { phoneNumber, templateCode, message, variables } = req.body;

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
    const senderNumber = process.env.SOLAPI_SENDER_NUMBER;

    // 환경 변수 존재 여부 확인 (값은 로그하지 않음 - 보안)
    const envVarsStatus = {
      SOLAPI_API_KEY: apiKey ? '설정됨' : '미설정',
      SOLAPI_API_SECRET: apiSecret ? '설정됨' : '미설정',
      SOLAPI_PF_ID: pfId ? '설정됨' : '미설정',
      SOLAPI_SENDER_NUMBER: senderNumber ? '설정됨' : '미설정',
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

    // 솔라피 REST API로 알림톡 발송
    // 솔라피 API 엔드포인트: https://api.solapi.com/messages/v4/send
    // 솔라피는 user 방식 인증 사용 (API Key:Secret을 Base64 인코딩)
    const authString = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    
    // 전화번호 정리 (하이픈 제거, 숫자만 추출)
    const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, '').trim(); // 숫자만 추출
    
    console.log('🔵 [1단계] 전화번호 처리 시작:', {
      원본: phoneNumber,
      정리된번호: cleanPhoneNumber,
      길이: cleanPhoneNumber.length,
      타입: typeof phoneNumber
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
    
    // Solapi 공식 예제에 따르면 일반 전화번호 형식만 사용하면 됨
    // 14자리 memberId 변환 불필요 - Solapi가 내부적으로 처리
    console.log('🔵 [2단계] 전화번호 검증 완료 (변환 불필요)', {
      정리된번호: cleanPhoneNumber,
      길이: cleanPhoneNumber.length
    });
    
    // Solapi API 요청 본문 생성 (공식 예제 코드 기반)
    // Solapi 공식 예제에서는:
    // - to: 일반 전화번호 형식 (예: 01030034420)
    // - from: 일반 전화번호 형식 (예: 01030034420)
    // - kakaoOptions에 memberId 필드 없음!
    const requestBody = {
      message: {
        to: cleanPhoneNumber, // 일반 전화번호 형식 (하이픈 제거, 숫자만)
        from: senderNumber || cleanPhoneNumber, // 발신번호 (받는 번호와 동일 또는 설정된 발신번호)
        kakaoOptions: {
          pfId: pfId,
          templateId: templateCode,
          // memberId 필드 제거 (Solapi 공식 예제에는 없음)
          variables: variables || {},
          disableSms: false, // SMS 대체 발송 허용
        },
      },
    };
    
    console.log('🔵 [최종 요청 본문] (Solapi 공식 형식)', {
      to: requestBody.message.to,
      toLength: requestBody.message.to.length,
      from: requestBody.message.from,
      fromLength: requestBody.message.from.length,
      pfId: requestBody.message.kakaoOptions.pfId,
      templateId: requestBody.message.kakaoOptions.templateId
    });
    
    console.log('Solapi API 요청 본문:', JSON.stringify(requestBody, null, 2));
    
    const solapiResponse = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Authorization': `user ${authString}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // 응답 본문 읽기
    const responseText = await solapiResponse.text();
    let result;
    
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('솔라피 API 응답 파싱 실패:', responseText);
      throw new Error(`솔라피 API 응답 형식 오류: ${responseText.substring(0, 200)}`);
    }

    if (!solapiResponse.ok) {
      console.error('솔라피 API 오류 응답:', {
        status: solapiResponse.status,
        statusText: solapiResponse.statusText,
        responseBody: result,
        requestBody: requestBody,
        cleanPhoneNumber: cleanPhoneNumber,
        cleanPhoneNumberLength: cleanPhoneNumber.length
      });
      
      // 오류 메시지 상세 추출
      let errorMsg = `솔라피 API 오류: ${solapiResponse.status}`;
      if (result.errorMessage) {
        errorMsg = result.errorMessage;
      } else if (result.message) {
        errorMsg = result.message;
      } else if (result.error) {
        if (typeof result.error === 'string') {
          errorMsg = result.error;
        } else if (result.error.message) {
          errorMsg = result.error.message;
        }
      } else if (result.errors && Array.isArray(result.errors)) {
        errorMsg = result.errors.map(e => {
          if (typeof e === 'string') return e;
          if (e.message) return e.message;
          return JSON.stringify(e);
        }).join(', ');
      }
      
      throw new Error(errorMsg);
    }

    console.log('카카오톡 발송 성공:', result);

    return res.status(200).json({
      success: true,
      message: '카카오톡 메시지가 성공적으로 발송되었습니다.',
      data: result,
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
