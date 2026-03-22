// OCR 및 문항 파싱 유틸리티

// OpenAI Vision API를 사용하여 이미지에서 텍스트 추출 (OCR)
export async function extractTextFromImage(imageData, apiKey) {
  try {
    const { resizeImage, getImageSizeMB, validateBase64Image } = await import('./imageUtils');
    
    if (!validateBase64Image(imageData)) {
      throw new Error('이미지 형식이 올바르지 않습니다.');
    }

    const imageSizeMB = getImageSizeMB(imageData);
    let finalImage = imageData;
    
    if (imageSizeMB > 20) {
      console.log('이미지가 너무 큽니다. 리사이즈 중...');
      finalImage = await resizeImage(imageData, 2000, 2000, 0.85);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `이 시험지 이미지에서 모든 텍스트를 추출해주세요.

⚠️ 매우 중요:
- 헤더, 지시사항, 배점표는 모두 포함해서 추출하세요
- 손으로 쓴 필기는 제외하고 인쇄된 텍스트만 추출하세요
- 문제 번호(1., 2., 3. 등)와 선택지(①, ②, ③, ④, ⑤)를 모두 포함하세요
- 텍스트의 순서와 구조를 최대한 유지하세요

추출한 텍스트를 그대로 반환해주세요.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: finalImage
                }
              }
            ]
          }
        ],
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    const extractedText = data.choices[0]?.message?.content?.trim();
    
    if (!extractedText) {
      throw new Error('텍스트를 추출할 수 없습니다.');
    }

    return extractedText;
  } catch (error) {
    console.error('OCR 오류:', error);
    throw error;
  }
}

// 추출된 텍스트에서 문항들을 파싱
export async function parseQuestionsFromText(text, apiKey) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `다음은 시험지에서 OCR로 추출한 텍스트입니다. 이 텍스트에서 각 문항을 파싱해서 JSON 형식으로 반환해주세요.

⚠️ 매우 중요:
- 헤더, 지시사항, 배점표는 제외하고 실제 문제만 파싱하세요
- 문제 번호는 "1.", "2.", "3." 형식으로 시작합니다
- 각 문제는 본문과 선택지(①, ②, ③, ④, ⑤)를 포함합니다
- 문제 번호가 없는 텍스트(헤더, 지시사항, 배점표 등)는 제외하세요

다음과 같은 JSON 형식으로 반환해주세요:
{
  "questions": [
    {
      "number": 1,
      "content": "1. Many atoms in your body are nearly as old as the universe itself...",
      "options": [
        "① 첫 번째 선택지",
        "② 두 번째 선택지",
        "③ 세 번째 선택지",
        "④ 네 번째 선택지",
        "⑤ 다섯 번째 선택지"
      ]
    },
    {
      "number": 2,
      "content": "2. Human beings have evolved...",
      "options": [
        "① 첫 번째 선택지",
        "② 두 번째 선택지",
        "③ 세 번째 선택지",
        "④ 네 번째 선택지",
        "⑤ 다섯 번째 선택지"
      ]
    }
  ]
}

추출한 텍스트:
${text}

JSON 형식으로만 응답해주세요.`
          }
        ],
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    const jsonText = data.choices[0]?.message?.content?.trim();
    
    console.log('파싱된 JSON 원본:', jsonText);
    
    if (!jsonText) {
      throw new Error('문항을 파싱할 수 없습니다.');
    }

    // JSON 파싱
    let parsedData;
    try {
      // 먼저 직접 파싱 시도
      parsedData = JSON.parse(jsonText);
    } catch (e) {
      console.log('JSON 파싱 실패, 텍스트에서 추출 시도:', e.message);
      
      // 마크다운 코드 블록 제거
      let cleanedText = jsonText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      
      // JSON 객체 추출 시도
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedData = JSON.parse(jsonMatch[0]);
          console.log('추출된 JSON:', parsedData);
        } catch (parseError) {
          console.error('추출된 JSON 파싱 실패:', parseError);
          throw new Error('JSON 형식을 파싱할 수 없습니다: ' + parseError.message);
        }
      } else {
        throw new Error('JSON 형식을 찾을 수 없습니다.');
      }
    }

    if (!parsedData.questions || !Array.isArray(parsedData.questions)) {
      throw new Error('문항 데이터가 올바르지 않습니다.');
    }

    return parsedData.questions;
  } catch (error) {
    console.error('문항 파싱 오류:', error);
    throw error;
  }
}









