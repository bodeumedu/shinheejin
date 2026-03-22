// 한글원문생성: 영어 원문을 한글 해석으로 번역

export async function translateEnglishToKorean(englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const trimmed = (englishText || '').trim()
  if (!trimmed) {
    throw new Error('영어 원문이 비어 있습니다.')
  }

  const prompt = `Translate the following English text into natural Korean. This is for study materials, so the translation should be accurate and readable.

STRICT STYLE: Use only the formal declarative ending style. Every sentence must end with "~입니다." or "~습니다." (e.g. "~합니다.", "~였습니다.", "~했습니다."). Do not use "~해요.", "~이에요.", "~예요.", "~네요.", "~죠." or other informal/casual endings. Keep the same style throughout the entire translation.

Return ONLY the Korean translation, no additional explanation or text.

English text:
${trimmed}`

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
            role: 'system',
            content: 'You are a helpful translator for English study materials. Always use the formal "~입니다." / "~습니다." style for every sentence. Respond with only the Korean translation, no other text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('AI 응답이 비어있습니다.')
    }

    return content.trim()
  } catch (error) {
    throw error
  }
}
