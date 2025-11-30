// 요약문 한글 분석 유틸리티

export async function findKeySentence(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (!text || text.trim().length === 0) {
    throw new Error('텍스트가 없습니다.')
  }

  const prompt = `You are an English teacher. Find the ONE sentence from the following English passage that best represents the main topic or central idea. 

IMPORTANT:
1. Copy the sentence EXACTLY as it appears in the passage (do not modify, paraphrase, or shorten it)
2. Include the exact punctuation (period, comma, etc.)
3. Return ONLY the sentence, no additional text or explanation

Passage:
${text}

Return only the exact sentence from the passage that best represents the main topic.`

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
            content: 'You are an English teacher. Always return only the exact sentence from the passage, no additional text.'
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
      throw new Error('주제 문장을 찾을 수 없습니다.')
    }

    // 문장의 마침표 확인 및 정리
    return keySentence.replace(/^["']|["']$/g, '').trim()
  } catch (error) {
    if (error.message.includes('API')) {
      throw error
    }
    throw new Error(`주제 문장 찾기 중 오류가 발생했습니다: ${error.message}`)
  }
}

export async function summarizeInKorean(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (!text || text.trim().length === 0) {
    throw new Error('요약할 텍스트가 없습니다.')
  }

  const prompt = `You are a Korean English teacher. Summarize the following English passage in Korean as a SINGLE, complete sentence.

IMPORTANT REQUIREMENTS:
1. The summary must be written in Korean
2. The summary must be a SINGLE, complete sentence (not multiple sentences)
3. The summary should be clear, concise, and maintain the main ideas of the original text
4. Capture the core message and key points of the passage

Passage:
${text}

Return only the Korean summary sentence without any additional explanation or formatting.`

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
            content: 'You are a Korean English teacher who creates concise Korean summaries of academic texts. Always return a single complete sentence in Korean.'
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

    // 여러 문장으로 나뉘어 있으면 첫 번째 문장만 사용
    const sentences = summary.split(/[.!?。！？]\s*/).filter(s => s.trim().length > 0)
    const singleSentence = sentences.length > 0 ? sentences[0].trim() : summary.trim()
    
    // 마지막에 마침표가 없으면 추가
    return singleSentence.endsWith('.') || singleSentence.endsWith('!') || singleSentence.endsWith('?') 
      ? singleSentence 
      : singleSentence + '.'

  } catch (error) {
    if (error.message.includes('API')) {
      throw error
    }
    throw new Error(`요약 생성 중 오류가 발생했습니다: ${error.message}`)
  }
}

