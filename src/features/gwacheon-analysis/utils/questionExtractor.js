// 문제 영역 추출 유틸리티

// AI를 사용하여 1번 문제의 위치 찾기 (1. 부터 2. 전까지)
// pageNumber: 페이지 번호 (1부터 시작, 첫 페이지는 1)
export async function detectQuestion1Region(imageData, apiKey, pageNumber = 1) {
  try {
    // 이미지 크기 확인 및 리사이즈
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
                text: pageNumber === 1 
                  ? `이 시험지 이미지에서 1번 문제의 정확한 위치를 찾아주세요.

🚨🚨🚨 매우 중요: 헤더, 지시사항, 배점표는 절대 포함하면 안 됩니다! 🚨🚨🚨

📋 첫 페이지 구조 (위에서 아래로):
1. 헤더 영역 (상단): "2025학년도", "제1교시", "공통영어2", "1학년 1~8반", "평가일", "인쇄매수" 등 ← 이것들은 문제가 아닙니다!
2. 지시사항 영역: "○ 선택형", "○ 논술형", "OMR답안지" 등 ← 이것들도 문제가 아닙니다!
3. 배점표 영역: "선택형 : 1~17 문항 70점", "논술형: 논1~논5 5 문항 30 점", "총 22 문항 합계 100 점" 등 ← 이것도 문제가 아닙니다! 절대 포함하면 안 됩니다!
4. 문제 영역 (하단): 실제 문제들 "1. ...", "2. ..." 등 ← 여기서만 찾아야 합니다!

⚠️⚠️⚠️ 배점표는 절대 문제가 아닙니다! ⚠️⚠️⚠️
- "선택형 : 1~17 문항 70점" ← 이것은 배점표입니다! 문제가 아닙니다!
- "논술형: 논1~논5 5 문항 30 점" ← 이것은 배점표입니다! 문제가 아닙니다!
- "총 22 문항 합계 100 점" ← 이것은 배점표입니다! 문제가 아닙니다!
- "문항", "점", "총", "합계" 같은 단어가 보이면 배점표입니다! 절대 포함하면 안 됩니다!

❌❌❌ 절대 찾으면 안 되는 것들 (이것들을 포함하면 완전히 잘못된 것입니다) ❌❌❌:
- "제1교시" 또는 "교시" ← 이것은 문제가 아닙니다!
- "공통영어2" 또는 "공통영어" 또는 과목명 ← 이것은 문제가 아닙니다!
- "1학년 1~8반" 또는 "학년", "반" ← 이것은 문제가 아닙니다!
- "평가일" 또는 날짜 정보 ← 이것은 문제가 아닙니다!
- "선택형" ← 이것은 문제가 아닙니다!
- "논술형" ← 이것은 문제가 아닙니다!
- "OMR답안지" ← 이것은 문제가 아닙니다!
- "컴퓨터용 사인펜" ← 이것은 문제가 아닙니다!
- "문항", "배점", "점", "총점" ← 이것들은 문제가 아닙니다!
- "1/8", "1-1/8" 등 페이지 번호 ← 이것은 문제가 아닙니다!
- "인쇄매수" 또는 "30매", "×9" ← 이것은 문제가 아닙니다!
- "2025학년도 2학기 2차 지필평가" 같은 시험 정보 ← 이것은 문제가 아닙니다!
- "1-17", "17 문항", "70 점" 같은 배점표 ← 이것은 문제가 아닙니다!
- "논1~논5", "5 문항", "30 점" 같은 배점표 ← 이것은 문제가 아닙니다!
- "총", "22 문항", "합계 100 점" 같은 배점표 ← 이것은 문제가 아닙니다!

✅✅✅ 반드시 찾아야 하는 것 (이미지의 하단 부분, 헤더/지시사항/배점표 아래) ✅✅✅:
- 정확히 "1." (숫자 1 바로 뒤에 점(.)이 있는 것만)
- ⚠️ 매우 중요: 인쇄된 텍스트로 된 "1." 문제만 찾아야 합니다! 손으로 쓴 필기는 절대 찾으면 안 됩니다!
- "1."로 시작하는 인쇄된 영어 본문 텍스트 (예: "1. Many atoms in your body are nearly as old as the universe itself.")
- 본문 아래에 있는 모든 인쇄된 선택지: ①, ②, ③, ④, ⑤ (반드시 5개 모두!)

🔍🔍🔍 찾는 방법 (단계별로 정확히 따라하세요) 🔍🔍🔍:
1. 이미지의 상단 절반(50%)은 완전히 무시하세요! 헤더, 지시사항, 배점표가 모두 여기에 있습니다!
2. ⚠️ 매우 중요: 배점표 영역을 완전히 건너뛰세요! "문항", "점", "총", "합계" 같은 단어가 보이는 부분은 모두 배점표입니다!
3. 배점표 아래에서만 인쇄된 텍스트로 된 "1." (숫자 1과 점)로 시작하는 영어 본문을 찾으세요
4. ⚠️ 매우 중요: 손으로 쓴 필기는 완전히 무시하세요! 인쇄된 텍스트만 찾아야 합니다!
5. 그 본문 아래에 인쇄된 선택지 ①, ②, ③, ④, ⑤가 있는지 확인하세요
6. "2." 문제가 보이면 그 위까지가 1번 문제입니다

⚠️⚠️⚠️ 최종 확인 (반드시 체크하세요) ⚠️⚠️⚠️:
1. "제1교시" 또는 "교시"가 보이면 → 잘못된 것입니다! 더 아래를 찾으세요!
2. "공통영어" 또는 과목명이 보이면 → 잘못된 것입니다! 더 아래를 찾으세요!
3. "1학년 1~8반" 또는 "학년", "반"이 보이면 → 잘못된 것입니다! 더 아래를 찾으세요!
4. "평가일" 또는 날짜가 보이면 → 잘못된 것입니다! 더 아래를 찾으세요!
5. "인쇄매수" 또는 "30매"가 보이면 → 잘못된 것입니다! 더 아래를 찾으세요!
6. "선택형" 또는 "논술형"이 보이면 → 잘못된 것입니다! 더 아래를 찾으세요!
7. ⚠️⚠️⚠️ "문항", "배점", "점", "총", "합계"가 보이면 → 절대 잘못된 것입니다! 이것은 배점표입니다! 더 아래를 찾으세요!
8. ⚠️⚠️⚠️ "1-17", "논1~논5", "70 점", "30 점", "100 점" 같은 배점표가 보이면 → 절대 잘못된 것입니다! 더 아래를 찾으세요!
9. ⚠️ 손으로 쓴 필기가 보이면 → 잘못된 것입니다! 인쇄된 텍스트만 찾아야 합니다!
10. "1." 본문과 모든 선택지(①~⑤)가 모두 인쇄된 텍스트여야 합니다!
11. 선택지가 하나라도 빠지면 안 됩니다!

✅ 올바른 1번 문제 영역:
- "1." (숫자 1과 점) 본문 전체
- 본문 아래의 모든 선택지 ①, ②, ③, ④, ⑤ (5개 모두!)
- 2단 레이아웃 전체 너비 (왼쪽 컬럼 시작부터 오른쪽 컬럼 끝까지)
- 마지막 선택지(⑤) 아래로 충분한 여백
- "2." 문제는 포함하지 않습니다

1번 문제의 위치를 다음과 같은 JSON 형식으로 응답해주세요:
{
  "x": 100,
  "y": 200,
  "width": 800,
  "height": 300
}

좌표는 픽셀 단위입니다. 
- x: "1." (숫자 1과 점) 본문이 시작하는 왼쪽 컬럼의 시작 위치 (여백 포함)
- y: "1." (숫자 1과 점) 본문이 시작하는 위치보다 약간 위쪽 (여백 포함, 단 헤더/지시사항/배점표는 절대 제외)
- width: 왼쪽 컬럼 시작부터 오른쪽 컬럼 끝까지의 전체 너비 (2단 전체, 넉넉하게)
- height: y 위치부터 마지막 선택지(⑤)가 끝나는 위치 아래로 충분한 여백까지의 높이 (넉넉하게)

JSON 형식으로만 응답해주세요.`
                  : `이 시험지 이미지에서 1번 문제의 정확한 위치를 찾아주세요.

🚨 매우 중요: 이것은 ${pageNumber}번째 페이지입니다! 첫 페이지가 아니므로 헤더나 지시사항이 없을 수 있습니다. 이미지 전체에서 "1." 문제를 찾아야 합니다!

✅ 반드시 찾아야 하는 것:
- 정확히 "1." (숫자 1 바로 뒤에 점(.)이 있는 것만)
- "1."로 시작하는 영어 본문 텍스트 (예: "1. Many atoms in your body are nearly as old as the universe itself.")
- 본문 아래에 있는 모든 선택지: ①, ②, ③, ④, ⑤ (반드시 5개 모두!)

🔍 찾는 방법:
1. 이미지 전체에서 "1." (숫자 1과 점)로 시작하는 영어 본문을 찾으세요
2. 그 본문 아래에 선택지 ①, ②, ③, ④, ⑤가 있는지 확인하세요
3. "2." 문제가 보이면 그 위까지가 1번 문제입니다

✅ 올바른 1번 문제 영역:
- "1." (숫자 1과 점) 본문 전체
- 본문 아래의 모든 선택지 ①, ②, ③, ④, ⑤ (5개 모두!)
- 2단 레이아웃 전체 너비 (왼쪽 컬럼 시작부터 오른쪽 컬럼 끝까지)
- 마지막 선택지(⑤) 아래로 충분한 여백
- "2." 문제는 포함하지 않습니다

1번 문제의 위치를 다음과 같은 JSON 형식으로 응답해주세요:
{
  "x": 100,
  "y": 200,
  "width": 800,
  "height": 300
}

좌표는 픽셀 단위입니다. 
- x: "1." (숫자 1과 점) 본문이 시작하는 왼쪽 컬럼의 시작 위치 (여백 포함)
- y: "1." (숫자 1과 점) 본문이 시작하는 위치보다 약간 위쪽 (여백 포함)
- width: 왼쪽 컬럼 시작부터 오른쪽 컬럼 끝까지의 전체 너비 (2단 전체, 넉넉하게)
- height: y 위치부터 마지막 선택지(⑤)가 끝나는 위치 아래로 충분한 여백까지의 높이 (넉넉하게)

⚠️ 최종 확인 (반드시 체크하세요):
1. "1." 본문과 모든 선택지(①~⑤)만 포함해야 합니다!
2. 선택지가 하나라도 빠지면 안 됩니다!

JSON 형식으로만 응답해주세요.`
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
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    const jsonText = data.choices[0]?.message?.content?.trim();
    
    console.log('AI 응답 원본:', jsonText);
    
    if (!jsonText) {
      throw new Error('문제 위치를 찾을 수 없습니다.');
    }

    // JSON 파싱
    let questionData;
    try {
      // 먼저 직접 파싱 시도
      questionData = JSON.parse(jsonText);
    } catch (e) {
      console.log('JSON 파싱 실패, 텍스트에서 추출 시도:', e.message);
      
      // 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
      let cleanedText = jsonText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      
      // JSON 객체 추출 시도
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          questionData = JSON.parse(jsonMatch[0]);
          console.log('추출된 JSON:', questionData);
        } catch (parseError) {
          console.error('추출된 JSON 파싱 실패:', parseError);
          console.error('추출된 텍스트:', jsonMatch[0]);
          throw new Error('JSON 형식을 파싱할 수 없습니다: ' + parseError.message);
        }
      } else {
        console.error('JSON 형식을 찾을 수 없습니다. 원본 텍스트:', jsonText);
        throw new Error('JSON 형식을 찾을 수 없습니다.');
      }
    }

    if (!questionData.x || !questionData.y || !questionData.width || !questionData.height) {
      throw new Error('문제 위치 데이터가 올바르지 않습니다.');
    }

    return questionData;
  } catch (error) {
    console.error('1번 문제 영역 감지 오류:', error);
    throw error;
  }
}

// 이미지에서 특정 영역을 잘라내기
export function cropImageRegion(imageData, x, y, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 이미지의 실제 크기 사용
        const imgWidth = img.naturalWidth || img.width;
        const imgHeight = img.naturalHeight || img.height;
        
        // 좌표가 이미지 범위를 벗어나지 않도록 조정
        const actualX = Math.max(0, Math.min(x, imgWidth - 1));
        const actualY = Math.max(0, Math.min(y, imgHeight - 1));
        const actualWidth = Math.min(width, imgWidth - actualX);
        const actualHeight = Math.min(height, imgHeight - actualY);
        
        // 최소 크기 확인
        if (actualWidth <= 0 || actualHeight <= 0) {
          reject(new Error('잘라낼 영역이 너무 작습니다.'));
          return;
        }
        
        canvas.width = actualWidth;
        canvas.height = actualHeight;
        
        // 흰색 배경
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, actualWidth, actualHeight);
        
        // 이미지 영역 그리기
        ctx.drawImage(
          img,
          actualX, actualY, actualWidth, actualHeight,
          0, 0, actualWidth, actualHeight
        );
        
        const croppedImage = canvas.toDataURL('image/jpeg', 0.9);
        resolve(croppedImage);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = imageData;
  });
}
