// SUM40 요약 분석 유틸리티

export async function findWordMatches(originalText, summaryText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher. I will give you an original passage and a summary. Identify which words in the summary are DIRECTLY derived from words that ACTUALLY appear in the original passage.

CRITICAL RULES:
1. Only match words where the root word CLEARLY appears in the original passage
2. Word family transformations must be OBVIOUS and DIRECT:
   - "importance" in original → "important" in summary (matched - root "import")
   - "develop" in original → "development" in summary (matched - root "develop")
   - "significant" in original → "significantly" in summary (matched - root "significant")
3. DO NOT match if the root word does not appear in the original passage
4. DO NOT match words that are only vaguely similar or have weak connections
5. DO NOT match words just because they sound similar - the root must actually be in the original
6. Exact matches always count (same word, same form)
7. Be VERY STRICT - when in doubt, do NOT match

Original passage:
${originalText}

Summary:
${summaryText}

Return ONLY a JSON array of the matched words from the summary (use the exact form as it appears in the summary). Format: ["word1", "word2", "word3", ...]
Do not include common words like "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "this", "that", "these", "those", "it", "they", "we", "he", "she", "of", "in", "on", "at", "to", "for", "with", "by", "from", "as", "and", "or", "but", "if", "when", "where", "which", "what", "who", "how", "why".

Return only the JSON array, no additional text.`

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
            content: 'You are an English teacher. Always return only valid JSON arrays, no additional text.'
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
    const result = data.choices[0]?.message?.content?.trim() || '[]'
    
    // JSON 파싱 (마크다운 코드 블록 제거)
    const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const matchedWords = JSON.parse(cleanedResult)
    
    return Array.isArray(matchedWords) ? matchedWords : []
  } catch (error) {
    console.error('단어 매칭 오류:', error)
    return [] // 오류 시 빈 배열 반환
  }
}

export async function summarizeText(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (!text || text.trim().length === 0) {
    throw new Error('요약할 텍스트가 없습니다.')
  }

  const prompt = `You are an English teacher. Summarize the following English passage in approximately 40 words. 

IMPORTANT REQUIREMENTS:
1. The summary should be clear, concise, and maintain the main ideas of the original text
2. **Actively use words from the original passage** - reuse key nouns, verbs, adjectives from the original text
3. **Word transformations are encouraged**: Use word families (e.g., "importance" → "important", "develop" → "development", "significant" → "significantly")
4. Convert nouns to adjectives, adjectives to verbs, verbs to nouns, etc. when appropriate
5. Try to use at least 5-8 key words or their derived forms from the original passage

Passage:
${text}

Return only the summary text without any additional explanation or formatting. The summary should be around 40 words.`

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
            content: 'You are an English teacher who creates concise summaries of academic texts.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 150
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

