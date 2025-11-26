// KEY 문제 생성 유틸리티

// 보기를 섞은 후 해설을 생성하는 함수
export async function generateKeyExplanation(shuffledOptions, correctAnswerNumber, englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const numberSymbols = ['①', '②', '③', '④', '⑤']
  const correctSymbol = numberSymbols[correctAnswerNumber - 1]
  const optionsList = shuffledOptions.map((opt, idx) => `${numberSymbols[idx]} ${opt}`).join('\n')

  const prompt = `You are a GPT specialized in creating explanations for Korean CSAT English questions. 

Given the following shuffled options for a topic question, create a Korean explanation (approximately 200 characters).

OPTIONS (already shuffled and numbered):
${optionsList}

CORRECT ANSWER: ${correctSymbol} (option ${correctAnswerNumber})

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

Passage:
${englishText}

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
    
    // 해설이 너무 길면 250자 정도로 제한
    if (explanation.length > 250) {
      // 정답 부분은 유지하고 나머지 부분을 간결하게
      const answerPart = explanation.match(/정답은\s*[①②③④⑤]번입니다?[.\s]*/)?.[0] || ''
      const restPart = explanation.replace(/정답은\s*[①②③④⑤]번입니다?[.\s]*/, '').trim()
      
      if (restPart.length > 200) {
        // 나머지 부분을 200자로 제한
        explanation = answerPart + restPart.substring(0, 200) + '...'
      } else {
        explanation = answerPart + restPart
      }
    }
    
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

export async function generateKeyQuestion(englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (!englishText || englishText.trim().length === 0) {
    throw new Error('지문이 없습니다.')
  }

  const prompt = `You are a GPT specialized in creating English subject questions for the Korean College Scholastic Ability Test (CSAT). Create a topic question based on the following English passage.

REQUIREMENTS:
1. Question instruction (in Korean): "다음 글의 주제로 가장 적절한 것은?"
2. Provide 5 multiple-choice options (NEVER use (a)~(e) format)
3. All options must be grammatically natural and only one should be correct
4. Options must follow these criteria:
   - Correct answer (1): Most accurately reflects the central idea or theme of the passage
   - Wrong answer 1 (1): Different from the theme or misinterpreted
   - Wrong answer 2 (1): Related to the theme but requires excessive interpretation
   - Wrong answer 3 (1): Related to the theme but doesn't match the core of the passage
   - Wrong answer 4 (1): Completely unrelated to the theme
5. Question and options must be written in English
6. Mark which option is the correct answer by setting "correctAnswerIndex" (0-based index: 0, 1, 2, 3, or 4)
7. DO NOT provide explanation yet - it will be generated after shuffling the options

Return your response in the following JSON format:
{
  "instruction": "다음 글의 주제로 가장 적절한 것은?",
  "options": [
    "option 1 text",
    "option 2 text",
    "option 3 text",
    "option 4 text",
    "option 5 text"
  ],
  "correctAnswerIndex": 2
}

Passage:
${englishText}

Return ONLY the JSON object, no additional text or explanation.`

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
            content: 'You are a CSAT English question creator. Always return only valid JSON, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
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
    if (!questionData.instruction || !questionData.options || !Array.isArray(questionData.options) || questionData.options.length !== 5) {
      throw new Error('문제 생성 형식이 올바르지 않습니다.')
    }
    
    if (questionData.correctAnswerIndex === undefined || questionData.correctAnswerIndex < 0 || questionData.correctAnswerIndex > 4) {
      throw new Error('정답 인덱스가 올바르지 않습니다.')
    }

    return questionData
  } catch (error) {
    if (error.message.includes('API')) {
      throw error
    }
    throw new Error(`문제 생성 중 오류가 발생했습니다: ${error.message}`)
  }
}

