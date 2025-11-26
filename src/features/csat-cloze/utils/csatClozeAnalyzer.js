// 빈칸 수능문제 출제 유틸리티

// 빈칸 문제 생성 (재시도 로직 포함)
export async function generateClozeQuestion(englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (!englishText || englishText.trim().length === 0) {
    throw new Error('지문이 없습니다.')
  }

  const createPrompt = (isRetry = false) => `You are a GPT specialized in creating English cloze questions for the Korean College Scholastic Ability Test (CSAT). Create a cloze inference question based on the following English passage.

REQUIREMENTS:
1. Read the ENTIRE passage (do NOT summarize or trim any sentences)
2. Find a core phrase or clause that represents the main argument or important content of the passage
3. Replace ONLY that phrase/clause (within its sentence) with exactly 20 underscores: ____________________
4. The returned passage MUST include every sentence from the original passage, unchanged except for the inserted blank
5. The blank should NOT be an entire sentence, but a core phrase or clause within a sentence (approximately half of a sentence)
6. The blank must contain meaningful content that is crucial to understanding the passage's logic
7. The correct answer MUST capture the meaning of the removed phrase/clause but MUST NOT be an identical copy of the original wording. Use a paraphrased phrase/clauses that fits naturally.
8. Create 5 multiple-choice options in English:
   - Correct answer (1): A phrase or clause that fits the logical flow of the sentence naturally and meaningfully (NOT necessarily the original text)
   - Wrong answer 1 (1): Grammatically natural but contradicts the premise of the context
   - Wrong answer 2 (1): Grammatically natural but derives a lesson not mentioned in the passage
   - Wrong answer 3 (1): Grammatically natural but only partially correct
   - Wrong answer 4 (1): Grammatically natural but completely opposite to the correct meaning
9. Use intermediate to high difficulty vocabulary suitable for CSAT level
10. Mark which option is the correct answer by setting "correctAnswerIndex" (0-based index: 0, 1, 2, 3, or 4)
11. DO NOT provide explanation yet - it will be generated after shuffling the options
12. IMPORTANT: When creating the correct answer option, rephrase the original idea. Never paste the exact phrase/words removed from the passage.
${isRetry ? '\n12. CRITICAL: You MUST include exactly 20 underscores (____________________) in the passageWithBlank field. Do NOT use fewer or more underscores. This is essential!' : ''}

Return your response in the following JSON format:
{
  "passageWithBlank": "The FULL original passage with exactly 20 underscores (____________________) replacing the removed phrase/clause",
  "options": [
    "option 1 text",
    "option 2 text",
    "option 3 text",
    "option 4 text",
    "option 5 text"
  ],
  "correctAnswerIndex": 2
}

Original Passage:
${englishText}

Return ONLY the JSON object, no additional text or explanation.`

  const maxRetries = 3
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const isRetry = attempt > 0
      const prompt = createPrompt(isRetry)
      
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
              content: isRetry 
                ? 'You are a CSAT English cloze question creator. Always return only valid JSON, no additional text. You MUST include exactly 20 underscores (____________________) in the passageWithBlank field.'
                : 'You are a CSAT English cloze question creator. Always return only valid JSON, no additional text.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1200,
          response_format: { type: 'json_object' }
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
      }

      const data = await response.json()
      const result = data.choices[0]?.message?.content?.trim() || '{}'
      
      // JSON 파싱
      const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const questionData = JSON.parse(cleanedResult)
      
      // 유효성 검사
      if (!questionData.passageWithBlank || !questionData.options || !Array.isArray(questionData.options) || questionData.options.length !== 5) {
        throw new Error('문제 생성 형식이 올바르지 않습니다.')
      }
      
      if (questionData.correctAnswerIndex === undefined || questionData.correctAnswerIndex < 0 || questionData.correctAnswerIndex > 4) {
        throw new Error('정답 인덱스가 올바르지 않습니다.')
      }

      // 언더바 20개가 포함되어 있는지 확인
      if (!questionData.passageWithBlank.includes('____________________')) {
        lastError = new Error('빈칸이 올바르게 생성되지 않았습니다.')
        if (attempt < maxRetries - 1) {
          console.warn(`빈칸 누락 감지. 재시도 ${attempt + 1}/${maxRetries - 1}...`)
          continue // 재시도
        }
        throw lastError
      }

      // 성공 시 반환
      return questionData
    } catch (error) {
      if (error.message.includes('API')) {
        throw error
      }
      
      lastError = error
      
      // 마지막 시도가 아니면 재시도
      if (attempt < maxRetries - 1 && error.message.includes('빈칸')) {
        console.warn(`문제 생성 실패. 재시도 ${attempt + 1}/${maxRetries - 1}...`, error.message)
        continue
      }
      
      // 마지막 시도이거나 빈칸 관련 오류가 아니면 즉시 에러
      if (attempt >= maxRetries - 1 || !error.message.includes('빈칸')) {
        throw new Error(`문제 생성 중 오류가 발생했습니다${attempt > 0 ? ` (${attempt + 1}회 시도)` : ''}: ${error.message}`)
      }
    }
  }

  throw lastError || new Error('문제 생성에 실패했습니다.')
}

// 보기를 섞은 후 해설을 생성하는 함수
export async function generateClozeExplanation(shuffledOptions, correctAnswerNumber, passageWithBlank, englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const numberSymbols = ['①', '②', '③', '④', '⑤']
  const correctSymbol = numberSymbols[correctAnswerNumber - 1]
  const optionsList = shuffledOptions.map((opt, idx) => `${numberSymbols[idx]} ${opt}`).join('\n')

  const prompt = `You are a GPT specialized in creating explanations for Korean CSAT English cloze questions. 

Given the following shuffled options for a cloze question, create a Korean explanation (approximately 200 characters).

PASSAGE WITH BLANK:
${passageWithBlank}

OPTIONS (already shuffled and numbered):
${optionsList}

CORRECT ANSWER: ${correctSymbol} (option ${correctAnswerNumber})

ORIGINAL PASSAGE (for reference):
${englishText}

REQUIREMENTS:
1. Start with "정답은 ${correctSymbol}번입니다."
2. Explain why the correct answer (${correctSymbol}) is right (1-2 sentences)
3. Explain why EACH of the 4 wrong answers is wrong (1 sentence for each: ${shuffledOptions.map((_, idx) => {
    const symbols = ['①', '②', '③', '④', '⑤']
    return idx + 1 !== correctAnswerNumber ? symbols[idx] : null
  }).filter(s => s).join(', ')}번)
4. When referring to options, ALWAYS use the numbered format (①번, ②번, etc.) that matches the shuffled order above
5. Keep the explanation concise - approximately 200 Korean characters total
6. All explanation must be in Korean
7. Cover all 5 options briefly but clearly

Return ONLY the explanation text in Korean, no additional formatting.`

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
            content: 'You are a CSAT English question explanation creator. Always return only the explanation text in Korean.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 400
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
    }

    const data = await response.json()
    let explanation = data.choices[0]?.message?.content?.trim() || ''
    
    if (!explanation || explanation.length === 0) {
      throw new Error('해설 생성에 실패했습니다.')
    }

    return explanation
  } catch (error) {
    if (error.message.includes('API')) {
      throw error
    }
    throw new Error(`해설 생성 중 오류가 발생했습니다: ${error.message}`)
  }
}

