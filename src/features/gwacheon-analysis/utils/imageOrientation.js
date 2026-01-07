// 이미지 방향 감지 및 회전 유틸리티

// AI를 사용하여 이미지에서 "공통영어2"를 찾아 상단에 오도록 회전
export async function detectAndRotateImage(imageData, apiKey) {
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
                text: `이 이미지에서 "공통영어2" 또는 "공통영어" 텍스트의 위치를 찾아서 올바른 회전 각도를 결정해주세요.

🎯 목표: "공통영어2" 또는 "공통영어" 텍스트가 이미지의 맨 위쪽(상단)에 와야 합니다.

⚠️⚠️⚠️ 매우 중요: "공통영어2" 또는 "공통영어" 텍스트를 정확히 찾으세요! ⚠️⚠️⚠️
1. 먼저 이미지 전체를 스캔해서 "공통영어2" 또는 "공통영어" 텍스트를 찾으세요
2. 이 텍스트가 이미지의 어느 위치에 있는지 정확히 확인하세요:
   - 이미지의 가장 위쪽(상단)에 있는지
   - 이미지의 가장 아래쪽(하단)에 있는지
   - 이미지의 왼쪽 가장자리에 있는지
   - 이미지의 오른쪽 가장자리에 있는지

📐 회전 규칙 ("공통영어2"를 위쪽으로 이동시키는 방향):
1. "공통영어2"가 이미지의 위쪽(상단)에 있으면 → {"rotation": 0} (이미 올바른 방향, 상단 중앙, 상단 왼쪽, 상단 오른쪽 모두 포함)
2. "공통영어2"가 이미지의 아래쪽(하단)에 있으면 → {"rotation": 180} (거꾸로, 180도 회전 필요, 하단 중앙, 하단 왼쪽, 하단 오른쪽 모두 포함)
3. "공통영어2"가 이미지의 왼쪽 가장자리 중앙(세로 중앙)에 있으면 → {"rotation": -90} (왼쪽으로 90도 회전, 반시계 방향으로 회전하면 왼쪽이 위로 감)
4. "공통영어2"가 이미지의 오른쪽 가장자리 중앙(세로 중앙)에 있으면 → {"rotation": 90} (오른쪽으로 90도 회전, 시계 방향으로 회전하면 오른쪽이 위로 감)

⚠️⚠️⚠️ 매우 중요: 정확히 확인하세요! ⚠️⚠️⚠️
- "공통영어2"가 상단(위쪽) 어디에 있든 → {"rotation": 0} (회전하지 마세요!)
- "공통영어2"가 하단(아래쪽) 어디에 있든 → {"rotation": 180} (180도 회전)
- "공통영어2"가 왼쪽 가장자리 중앙에 있으면 → {"rotation": -90} (왼쪽으로 90도)
- "공통영어2"가 오른쪽 가장자리 중앙에 있으면 → {"rotation": 90} (오른쪽으로 90도)

다음과 같은 JSON 형식으로만 응답해주세요:
{
  "rotation": 0
}

rotation 값은 반드시 0, 90, -90, 180 중 하나의 숫자여야 합니다.

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
        max_tokens: 200
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
      console.log('⚠️ AI 응답이 비어있습니다. 회전 없음으로 처리합니다.');
      return { rotation: 0, rotatedImage: imageData };
    }

    // JSON 파싱
    let rotationData;
    try {
      // 먼저 직접 파싱 시도
      rotationData = JSON.parse(jsonText);
    } catch (e) {
      console.log('⚠️ JSON 파싱 실패, 텍스트에서 추출 시도:', e.message);
      
      // 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
      let cleanedText = jsonText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      
      // JSON 객체 추출 시도
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          rotationData = JSON.parse(jsonMatch[0]);
          console.log('추출된 JSON:', rotationData);
        } catch (e2) {
          console.error('❌ 추출된 JSON 파싱 실패:', e2);
          console.error('추출된 텍스트:', jsonMatch[0]);
          return { rotation: 0, rotatedImage: imageData };
        }
      } else {
        console.error('❌ JSON 패턴을 찾을 수 없습니다. 원본 텍스트:', jsonText);
        return { rotation: 0, rotatedImage: imageData };
      }
    }

    let rotation = rotationData.rotation || 0;
    console.log('✅ AI가 감지한 회전 각도:', rotation);
    
    // rotation 값 검증 및 정규화
    if (typeof rotation !== 'number') {
      console.warn('⚠️ rotation이 숫자가 아닙니다:', rotation);
      rotation = 0;
    }
    
    // rotation 값을 유효한 각도로 정규화
    if (rotation === 90 || rotation === -270) {
      rotation = 90; // 오른쪽으로 90도 회전
    } else if (rotation === -90 || rotation === 270) {
      rotation = -90; // 왼쪽으로 90도 회전
    } else if (rotation === 180 || rotation === -180) {
      rotation = 180; // 180도로 통일
    } else if (rotation !== 0) {
      console.warn('⚠️ 예상치 못한 rotation 값:', rotation, '→ 0으로 처리합니다.');
      rotation = 0;
    }
    
    console.log('✅ 최종 회전 각도:', rotation);
    
    // 회전이 필요 없으면 원본 반환
    if (rotation === 0) {
      console.log('✅ 회전 불필요 - 이미지가 이미 올바른 방향입니다.');
      return { rotation: 0, rotatedImage: imageData };
    }

    // 이미지 회전
    console.log('🔄 이미지 회전 시작...', rotation, '도');
    const rotatedImage = await rotateImage(imageData, rotation);
    console.log('✅ 회전 완료!');
    return { rotation, rotatedImage };
  } catch (error) {
    console.error('이미지 방향 감지 오류:', error);
    // 오류 발생 시 원본 반환
    return { rotation: 0, rotatedImage: imageData };
  }
}

// 이미지를 회전시켜서 새로운 이미지 데이터 반환 (export)
export function rotateImage(imageData, degrees) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 회전에 따라 캔버스 크기 조정
        if (degrees === 90 || degrees === -90 || degrees === 270 || degrees === -270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        
        // 회전 적용
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        
        // 회전 각도 적용 (양수는 시계 방향, 음수는 반시계 방향)
        ctx.rotate((degrees * Math.PI) / 180);
        
        // 이미지 그리기 (회전 중심을 기준으로)
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
        
        const rotatedImage = canvas.toDataURL('image/png', 0.95);
        console.log('회전 완료:', degrees, '도, 결과 이미지 크기:', canvas.width, 'x', canvas.height);
        resolve(rotatedImage);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = imageData;
  });
}

