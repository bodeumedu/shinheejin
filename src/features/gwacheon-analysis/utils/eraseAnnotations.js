// 필기 제거 유틸리티

export async function eraseAnnotationsFromImage(imageData, apiKey) {
  try {
    // AI를 사용하여 필기 부분 감지
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
                text: `이 시험지 이미지에서 학생이 작성한 필기(펜으로 쓴 글씨, 밑줄, 체크 표시, 답안 등)를 모두 찾아주세요. 
                
필기의 특징:
- 펜이나 연필로 작성한 손글씨
- 문제 번호 옆에 체크 표시
- 보기 옆에 O, X 표시
- 밑줄 긋기
- 답안 작성
- 계산 과정 등

필기가 아닌 것:
- 인쇄된 문제 텍스트
- 인쇄된 보기
- 인쇄된 그림이나 도표

JSON 형식으로 응답해주세요:
{
  "hasAnnotations": true/false,
  "annotations": [
    {
      "type": "handwriting" | "underline" | "checkmark" | "answer",
      "description": "필기 설명",
      "approximateLocation": "위치 설명 (예: 1번 문제 옆, 3번 보기 아래)"
    }
  ]
}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`필기 감지 실패: ${response.status}`);
    }

    const data = await response.json();
    const jsonText = data.choices[0].message.content.trim();
    
    let annotationData;
    try {
      annotationData = JSON.parse(jsonText);
    } catch (e) {
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        annotationData = JSON.parse(jsonMatch[0]);
      } else {
        // 필기 감지 실패 시 원본 반환
        return imageData;
      }
    }

    // 필기가 없으면 원본 반환
    if (!annotationData.hasAnnotations || !annotationData.annotations || annotationData.annotations.length === 0) {
      return imageData;
    }

    // 필기 제거 처리 (현재는 간단한 방법 사용)
    // 실제로는 이미지 편집 라이브러리나 AI를 사용하여 필기 부분을 제거해야 함
    // 여기서는 일단 원본 반환 (나중에 개선 가능)
    
    // TODO: 실제 필기 제거 로직 구현
    // - Canvas를 사용하여 필기 부분을 흰색으로 덮기
    // - 또는 AI를 사용하여 필기 없는 이미지 생성
    
    return imageData;
  } catch (error) {
    console.error('필기 제거 오류:', error);
    // 오류 시 원본 반환
    return imageData;
  }
}


