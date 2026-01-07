// 이미지 생성 유틸리티 - DALL-E API 사용

export async function generateMainImage(description, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  try {
    const prompt = `Create a simple, clean, and concise illustration. The scene should represent the main theme and content: ${description}. Style: minimal illustration, clean lines, simple shapes, clear composition, modern flat design, educational and easy to understand. The image should be simple and capture the essence of the story in a single scene. IMPORTANT: Do NOT include any text, words, letters, or written content in the image. The image should be purely visual with no text elements. White background, clean illustration style.`
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        style: 'natural',
        response_format: 'b64_json' // 직접 base64로 받아 브라우저에서 안전하게 표시
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `이미지 생성 오류: ${response.status}`)
    }

    const data = await response.json()
    const b64 = data.data?.[0]?.b64_json

    if (!b64) {
      throw new Error('이미지(base64)를 받을 수 없습니다.')
    }

    // data URL로 반환 (CORS 문제 없이 즉시 사용 가능)
    return `data:image/png;base64,${b64}`
  } catch (error) {
    console.error('메인 이미지 생성 오류:', error)
    throw error
  }
}



