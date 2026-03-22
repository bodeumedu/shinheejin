// 일치/불일치 (객불) 문제 생성: 수능 스타일 내용 일치·불일치

export async function generateContentMatchQuestion(englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }
  if (!englishText || englishText.trim().length === 0) {
    throw new Error('지문이 없습니다.')
  }

  const prompt = `You are an expert at creating Korean CSAT-style English "content match/mismatch" questions.

TASK: Based on the following English passage, create ONE multiple-choice question.

QUESTION FORMAT (fixed): "다음 글의 내용과 일치하지 않는 것은?"
- Create exactly 5 options. All options must be complete English sentences.
- Each option should be approximately 20 words in length (not short phrases; write full, substantive sentences).
- 4 options must MATCH the passage content (true according to the passage).
- 1 option must clearly NOT MATCH the passage (false or inconsistent with the passage). This is the correct answer (because the question asks which does NOT match).

REQUIREMENTS:
- Mix key ideas, specific details, and inferable statements in a natural 수능 style.
- Paraphrase; do NOT copy sentences verbatim from the passage.
- Avoid overly easy factual statements; use core content, details, and generalized statements.
- The one incorrect option (정답) must be clearly inconsistent with the passage, not ambiguous.
- For each option, provide a short Korean explanation (해설) that states whether it matches or not and why (judgment + brief reason).

Return ONLY a valid JSON object with this exact structure:
{
  "options": [
    "First option sentence in English.",
    "Second option sentence in English.",
    "Third option sentence in English.",
    "Fourth option sentence in English.",
    "Fifth option sentence in English."
  ],
  "correctAnswerIndex": 0,
  "explanations": [
    "①에 대한 해설: 일치/불일치 판단 및 한글 근거",
    "②에 대한 해설: ...",
    "③에 대한 해설: ...",
    "④에 대한 해설: ...",
    "⑤에 대한 해설: ..."
  ]
}

Note: correctAnswerIndex is 0-based (0, 1, 2, 3, or 4). It must be the index of the ONE option that does NOT match the passage.

Passage:
${englishText}`

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
            content: 'You are a CSAT English question creator. Return only valid JSON with options, correctAnswerIndex, and explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.6,
        max_tokens: 1200,
        response_format: { type: 'json_object' }
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
    }

    const data = await response.json()
    const raw = data.choices[0]?.message?.content?.trim() || '{}'
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(cleaned)

    if (!result.options || !Array.isArray(result.options) || result.options.length !== 5) {
      throw new Error('보기 5개가 생성되지 않았습니다.')
    }
    if (result.correctAnswerIndex == null || result.correctAnswerIndex < 0 || result.correctAnswerIndex > 4) {
      throw new Error('정답 번호가 올바르지 않습니다.')
    }
    if (!result.explanations || !Array.isArray(result.explanations) || result.explanations.length < 5) {
      result.explanations = result.options.map((_, i) => `보기 ${i + 1}에 대한 해설`)
    }

    return result
  } catch (error) {
    if (error.message.includes('API') || error.message.includes('보기') || error.message.includes('정답')) {
      throw error
    }
    throw new Error(`일치/불일치 문제 생성 중 오류: ${error.message}`)
  }
}
