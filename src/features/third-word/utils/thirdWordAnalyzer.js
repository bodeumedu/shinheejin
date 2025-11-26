export async function generateThirdWordSummary(englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (!englishText || englishText.trim().length === 0) {
    throw new Error('지문이 없습니다.')
  }

const prompt = `You are an elite English teacher preparing CSAT-style materials.

TASK: Summarize the passage into exactly ONE COMPLETE, GRAMMATICALLY CORRECT sentence of 10~15 words. 

CRITICAL REQUIREMENTS:
- The sentence MUST be grammatically complete and meaningful (do NOT cut off mid-sentence)
- MUST have a clear subject and verb
- MUST express a complete thought
- Use 10~15 words (NOT fewer, NOT more - count carefully)
- Use lower-case words separated by single spaces
- Preserve apostrophes (e.g., butterflies')
- Do NOT include punctuation marks at the end
- Do NOT truncate the sentence - it must be complete

Return ONLY valid JSON in the following format:
{
  "summary": "complete sentence with exactly 10 to 15 words"
}

Passage:
${englishText}`

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
          content: 'You are a concise English summarizer. Always return only strict JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `요약 생성 중 오류가 발생했습니다: ${response.status}`)
  }

  const data = await response.json()
  const result = data.choices[0]?.message?.content?.trim() || '{}'
  const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const summaryData = JSON.parse(cleanedResult)

  if (!summaryData.summary || summaryData.summary.trim().length === 0) {
    throw new Error('요약문을 생성하지 못했습니다.')
  }

  return summaryData
}

