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

// 시선 title 10 (원형): 글의 제목을 약 10단어로 생성
export async function generateTitle10(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher creating a title for a passage. Create a title that:
1. Is approximately 10 words (between 8 and 12 words)
2. Captures the main idea or theme of the passage
3. Uses natural and grammatically correct English (phrase or sentence form)
4. Is suitable for a high school level English exam

Return ONLY the title, no quotation marks, no additional explanation or commentary.

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
            content: 'You are a helpful English teacher. Always respond with only the title text, no additional text.'
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

// 시선 topic (원형): 영어 문장이 아닌 '구(phrase)'로 약 13단어 주제만 생성
export async function generateTopic13(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher creating the main topic of a passage. Write the topic as a PHRASE only (not a complete sentence). Requirements:
1. Use a phrase of approximately 13 words (between 11 and 15 words)
2. Do NOT write a full sentence (no subject-verb as a main clause; use noun phrases, prepositional phrases, or fragments that express the topic)
3. Capture the main theme or subject of the passage
4. Use natural English suitable for a high school level exam

Return ONLY the phrase, no quotation marks, no period at the end, no additional explanation.

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
            content: 'You are a helpful English teacher. Always respond with only the topic phrase, no additional text.'
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

// 시선 response 20 (원형): 글을 제대로 이해한 독자의 감상평을 약 20단어로 생성
export async function generateResponse20(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher. A reader has read and understood the following passage. Write a short reader's response that MUST start with "I found it fascinating " and then complete the sentence. Requirements:
1. The sentence MUST begin exactly with: I found it fascinating 
2. Total length approximately 20 words (including "I found it fascinating ", so about 16 more words after that)
3. The part after "I found it fascinating " should show that the reader properly understood the passage (main idea, tone, or implication)
4. Use natural, grammatically correct English
5. Suitable for a high school level English exam

Return ONLY the complete sentence starting with "I found it fascinating ", no quotation marks, no additional explanation.

Original passage:
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
            content: 'You are a helpful English teacher. Always respond with only one sentence that starts with "I found it fascinating ", no additional text.'
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

// 시선 interview 25 (변형): 지문 기반 기자-저자 인터뷰 2질문, 답변 각 25단어 정도, 그 중 한 답변 25단어 셔플·한 단어 어법 변형
export async function generateInterview25(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher. Based on the following passage, create a short interview: a journalist (writing an article based on this passage) asks the author two questions, and the author answers. Requirements:
1. Write exactly 2 questions from the journalist and 2 answers from the author.
2. Each answer must be approximately 25 words (between 23 and 27 words). Use complete, natural English sentences.
3. The interview should reflect the passage's main ideas, tone, or implications.

Return ONLY a valid JSON object with this exact structure:
{
  "q1": "First question from the journalist.",
  "a1": "Author's first answer, approximately 25 words, one complete sentence.",
  "q2": "Second question from the journalist.",
  "a2": "Author's second answer, approximately 25 words, one complete sentence."
}

Original passage:
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
            content: 'You are a helpful English teacher. Return only valid JSON with q1, a1, q2, a2. No other text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.6,
        max_tokens: 800,
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

    if (!result.q1 || !result.a1 || !result.q2 || !result.a2) {
      throw new Error('인터뷰 형식이 올바르지 않습니다. (q1, a1, q2, a2 필요)')
    }

    return result
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

