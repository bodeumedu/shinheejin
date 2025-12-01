// 한글 요약 분석 유틸리티

export async function summarizeInKorean(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (!text || text.trim().length === 0) {
    throw new Error('요약할 텍스트가 없습니다.')
  }

  const prompt = `You are a Korean English teacher. Summarize the following English passage in Korean in ONE sentence.

IMPORTANT REQUIREMENTS:
1. The summary should be a SINGLE, complete sentence in Korean
2. The summary should be clear, concise, and maintain the main ideas of the original text
3. Use formal Korean language appropriate for academic purposes
4. The summary should be comprehensive but concise (about 30-50 words in Korean)

Passage:
${text}

Return only the Korean summary text without any additional explanation or formatting.`

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
            content: 'You are a Korean English teacher who creates concise Korean summaries of English texts. Always respond in Korean.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
    }

    const data = await response.json()
    const summary = data.choices[0]?.message?.content?.trim() || ''

    if (!summary) {
      throw new Error('요약 생성에 실패했습니다.')
    }

    return summary
  } catch (error) {
    if (error.message.includes('API')) {
      throw error
    }
    throw new Error(`요약 생성 중 오류가 발생했습니다: ${error.message}`)
  }
}

export async function findKeySentence(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (!text || text.trim().length === 0) {
    throw new Error('분석할 텍스트가 없습니다.')
  }

  const prompt = `You are a Korean English teacher. From the following English passage, find the sentence that BEST represents the main topic or theme.

IMPORTANT REQUIREMENTS:
1. Select ONE sentence that best represents the main topic
2. Copy the sentence EXACTLY as it appears in the original text
3. Do not modify, paraphrase, or shorten the sentence
4. The sentence should clearly convey the central idea of the passage

Passage:
${text}

Return only the selected sentence without any additional explanation or formatting.`

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
            content: 'You are a Korean English teacher. Always return only the exact sentence from the text, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
    }

    const data = await response.json()
    const keySentence = data.choices[0]?.message?.content?.trim() || ''

    if (!keySentence) {
      throw new Error('주제 문장 찾기에 실패했습니다.')
    }

    return keySentence
  } catch (error) {
    if (error.message.includes('API')) {
      throw error
    }
    throw new Error(`주제 문장 찾기 중 오류가 발생했습니다: ${error.message}`)
  }
}

