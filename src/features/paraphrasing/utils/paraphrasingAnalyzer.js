// Paraphrasing 처리 유틸리티 - OpenAI API 사용

export async function paraphraseText(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher helping students practice advanced paraphrasing. Paraphrase the following English text with significant changes in wording, sentence structure, and expression while maintaining the exact same meaning and level of difficulty. 

Requirements:
- Use different vocabulary and synonyms extensively
- Restructure sentences (change from active to passive, combine or split sentences, etc.)
- Use different grammatical structures
- Vary the sentence order and flow
- Maintain the same meaning, tone, and formality level
- Make substantial changes - the paraphrased version should look significantly different from the original

Return ONLY the paraphrased text, no additional explanation or commentary.

Original text:
${text}`

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
            content: 'You are a helpful English teacher. Always respond with only the paraphrased text, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9
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

