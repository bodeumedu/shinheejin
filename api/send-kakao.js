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
    
    // 전화번호를 memberId 형식으로 변환 (14자리)
    // 한국 전화번호: 010-1234-5678 → 01012345678 → 821012345678 → 82101234567800 (14자리)
    const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, ''); // 숫자만 추출
    let memberId;
    
    if (cleanPhoneNumber.length === 11 && cleanPhoneNumber.startsWith('010')) {
      // 010으로 시작하는 11자리 번호: 01012345678 → 82101234567800
      memberId = `82${cleanPhoneNumber.substring(1)}00`; // 앞의 0 제거, 82 추가, 끝에 00 추가
    } else if (cleanPhoneNumber.length === 10) {
      // 10자리 번호: 1012345678 → 82101234567800
      memberId = `8210${cleanPhoneNumber}00`;
    } else if (cleanPhoneNumber.startsWith('82')) {
      // 이미 국가코드가 포함된 경우: 821012345678 → 82101234567800
      memberId = cleanPhoneNumber.padEnd(14, '0'); // 14자리로 맞춤
    } else {
      // 다른 형식: 숫자만 추출하여 14자리로 맞춤
      memberId = cleanPhoneNumber.padEnd(14, '0').substring(0, 14);
    }
    
    // memberId가 14자리인지 확인
    if (memberId.length !== 14) {
      throw new Error(`전화번호 변환 오류: memberId는 14자리여야 합니다. (현재: ${memberId.length}자리, 전화번호: ${phoneNumber})`);
    }
    
    const solapiResponse = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Authorization': `user ${authString}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          to: memberId, // memberId 형식으로 전송
          from: senderNumber || '01012345678',
          kakaoOptions: {
            pfId: pfId,
            templateId: templateCode,
            variables: variables || {},
          },
        },
      }),
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
      const errorMsg = result.errorMessage || result.message || result.error || `솔라피 API 오류: ${solapiResponse.status}`;
      console.error('솔라피 API 오류:', result);
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
