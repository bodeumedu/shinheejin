// Summary 처리 유틸리티 - OpenAI API 사용

export async function summarizeText(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher creating a summary for a fill-in-the-blank exercise. Create a summary sentence that:
1. Starts with "The passage suggests that"
2. Contains exactly 15 words total (including "The passage suggests that")
3. Captures the main idea of the passage
4. Uses natural and grammatically correct English
5. Is suitable for a high school level English exam

Important: The sentence must be exactly 15 words total. Count carefully.

Return ONLY the complete 15-word sentence starting with "The passage suggests that", no additional explanation or commentary.

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
            content: 'You are a helpful English teacher. Always respond with only the summary text, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
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

// 동사원형 변환 유틸리티 - OpenAI API 사용
export async function getBaseForms(words, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  if (words.length === 0) {
    return {}
  }

  const prompt = `You are an English teacher. Convert the following English words to their base verb forms (root forms) ONLY when there is a clear and unambiguous conversion. The words may be:
- Verb forms (-ing, -ed, -s): convert to infinitive form ONLY if it's a verb (NOT plural nouns)
- Nouns (-ment, -tion, -sion): convert to base verb form ONLY if clear (e.g., "development" -> "develop", "exploration" -> "explore")
- Adjectives (-ive, -able, -ible, -al): convert to base verb form ONLY if clear (e.g., "imaginative" -> "imagine", "immutable" -> "immute")

CRITICAL RULES:
- Return ONLY a valid JSON object with this structure: {"word1": "base_form1", "word2": "base_form2", ...}
- DO NOT convert plural nouns ending in -s:
  - "photographs" -> "photographs" (NOT "photograph")
  - "students" -> "students" (NOT "student")
  - "ideas" -> "ideas" (NOT "idea")
  - ONLY convert -s if it's clearly a third-person singular verb (e.g., "plays" -> "play", "goes" -> "go")
- DO NOT convert if the base form is unclear, ambiguous, or doesn't exist:
  - "importance" -> "importance" (NOT "import")
  - "possible" -> "possible" (NOT "poss")
  - "personal" -> "personal" (NOT "person")
  - "-ance/-ence" endings: convert ONLY if clearly related to a verb (e.g., "difference" -> "differ", but NOT "importance" -> "import")
  - "-ible" endings: convert ONLY if clearly related to a verb (e.g., "flexible" -> "flex", but NOT "possible" -> "poss")
  - "-al" endings: convert ONLY if clearly related to a verb (e.g., "arrival" -> "arrive", but NOT "personal" -> "person")
- Verb forms (-ing, -ed) MUST be converted: "living" -> "live", "played" -> "play"
- Verb forms ending in -s: convert ONLY if it's a verb, NOT a plural noun
- Keep any punctuation marks that are part of the word
- When in doubt, return the word as-is (unchanged)
- Do not add any explanation or commentary

Words to convert:
${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}

Return the JSON object only:`

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
            content: 'You are a helpful English teacher. Always respond with valid JSON only, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
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

    const result = JSON.parse(content)
    return result
  } catch (error) {
    throw error
  }
}

