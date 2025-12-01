/**
 * 지칭서술형 문제 생성 유틸리티
 * 지문에서 밑줄 친 "this"가 가리키는 것을 찾아 조건에 맞게 답변 생성
 */

/**
 * 지문에서 밑줄 친 "this"가 가리키는 것을 찾아 답변 생성
 * @param {string} englishText - 영어 원문
 * @param {string} apiKey - OpenAI API 키
 * @returns {Promise<{question: string, answer: string, condition: string}>}
 */
export async function generateReferenceDescription(englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an expert Korean English teacher creating a reference description question (지칭서술형 문제). Analyze the following English text and create a question where students must identify what a reference word or phrase refers to in the text.

SUPPORTED REFERENCE WORDS/PHRASES:
- "this", "this matter", "this issue", "this problem", etc.
- "such", "such a thing", "such behavior", etc.
- "it", "that", "these", "those"
- "do so", "doing so", "did so", "does so" (meaning "그렇게 하다" - refers to an action mentioned earlier)
- Other reference expressions that point to something mentioned earlier

CRITICAL REQUIREMENTS:
1. Find a reference word/phrase in the text that refers to something mentioned earlier (e.g., "this", "this matter", "such", "it", "that", "do so", "doing so")
2. The reference must point to something NOT explicitly stated in the same sentence - students must look back at previous context
3. Answer format depends on the reference word type:
   - For "this matter", "this issue", "this problem", "this", "that", "it", "such" etc.: Answer must be a NOUN PHRASE (명사구) from the text that the reference word points to (1-10 words)
   - For "do so", "doing so", "did so", "does so": Answer must be a VERB PHRASE (동사구) from the text - the ACTION that "do so" refers to (1-10 words)
4. Use EXACT words from the text - no paraphrasing, no word form changes
5. Create the question format: "다음 글을 읽고 밑줄 친 [reference]가 가리키는 것을 본문에서 찾아 <조건>에 맞게 [N]단어 이하로 쓰시오."

Text to analyze:
${englishText}

IMPORTANT EXAMPLES:

Example 1 - "this matter" (noun phrase answer):
If the text says: "Recently, we discovered that two songs might have been used without permission, thus violating the rights of others' works. We extend our deepest apologies for this matter..."
Then:
- Reference word: "this matter"
- Answer: "violating the rights of others' works" (NOUN PHRASE from text, 5 words)
- Question format: "다음 글을 읽고 밑줄 친 this matter가 가리키는 것을 본문에서 찾아 <조건>에 맞게 5단어 이하로 쓰시오."

Example 2 - "do so" (verb phrase answer):
If the text says: "We should take immediate action. If we do so, we can prevent further damage."
Then:
- Reference word: "do so"
- Answer: "take immediate action" (VERB PHRASE from text, 3 words - the action "do so" refers to)
- Question format: "다음 글을 읽고 밑줄 친 do so가 가리키는 것을 본문에서 찾아 <조건>에 맞게 3단어 이하로 쓰시오."

CRITICAL ANSWER FORMAT RULES:
- "this matter", "this issue", "this problem", "this", "that", "it", "such", "these", "those" → Answer MUST be a NOUN PHRASE (명사구) from the text
- "do so", "doing so", "did so", "does so" → Answer MUST be a VERB PHRASE (동사구) from the text - the action that "do so" refers to

DO NOT mix them up! If the reference is "do so", the answer must be a verb phrase (action), not a noun phrase.

CRITICAL: Before returning, you MUST:
1. Count the exact number of words in the answer phrase
2. Set wordLimit to match the exact word count of the answer
3. Make sure the reference word in the question matches the reference word marked with <u> in the text
4. Verify that the answer phrase is 1-10 words long

Return a JSON object with these exact keys:
{
  "referenceWord": "the reference word/phrase found in the text (e.g., 'this matter', 'this', 'such', 'it', 'do so', 'doing so')",
  "question": "다음 글을 읽고 밑줄 친 <u>[reference word]</u>가 가리키는 것을 본문에서 찾아 <조건>에 맞게 [N]단어 이하로 쓰시오.\n\n[Full English text with ONLY the reference word marked as <u>reference word</u> - make sure this matches the reference word in the question]",
  "answer": "exact phrase from the original text (1-10 words, no changes). IMPORTANT: If reference is 'this matter'/'this issue'/'this'/etc., answer must be a NOUN PHRASE. If reference is 'do so'/'doing so'/'did so'/'does so', answer must be a VERB PHRASE (the action it refers to).",
  "wordLimit": EXACT number of words in the answer (count carefully - this must match the answer word count),
  "condition": "<조건>\n1) 반드시 본문에 있는 단어만 사용할 것\n2) 어형을 바꾸지 말 것"
}

IMPORTANT VALIDATION RULES:
- The reference word in "question" must be EXACTLY the same as the word marked with <u> in the text
- wordLimit must equal the exact word count of the answer phrase
- Count words carefully: "a matter-of-fact account" = 3 words, not 4

Return ONLY valid JSON.`

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
          content: 'You are an expert English teacher who creates precise reference description questions. Always return valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`OpenAI API 오류: ${response.status} ${errorData.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('AI 응답이 비어있습니다.')
  }

  try {
    const result = JSON.parse(content)
    
    // 필수 필드 검증
    if (!result.question || !result.answer) {
      throw new Error('AI 응답에 필수 필드가 없습니다.')
    }

    // 답의 실제 단어 수 계산
    const answerWords = result.answer.trim().split(/\s+/).filter(w => w.length > 0)
    const actualWordCount = answerWords.length

    // wordLimit 검증 및 수정
    let wordLimit = result.wordLimit || actualWordCount
    if (wordLimit !== actualWordCount) {
      console.warn(`단어 수 불일치: wordLimit=${wordLimit}, 실제 답 단어 수=${actualWordCount}. wordLimit을 실제 단어 수로 조정합니다.`)
      wordLimit = actualWordCount
    }

    // 답이 1-10단어 범위 내인지 확인
    if (actualWordCount < 1 || actualWordCount > 10) {
      throw new Error(`답의 단어 수가 범위를 벗어났습니다: ${actualWordCount}단어 (1-10단어 범위 필요)`)
    }

    // 질문의 지칭어와 텍스트의 밑줄 표시가 일치하는지 확인
    const referenceWord = result.referenceWord || 'this'
    const questionText = result.question || ''
    const underlinedMatch = questionText.match(/<u>([^<]+)<\/u>/)
    
    if (underlinedMatch) {
      const underlinedWord = underlinedMatch[1].trim().toLowerCase()
      const referenceWordLower = referenceWord.toLowerCase()
      
      if (underlinedWord !== referenceWordLower) {
        console.warn(`지칭어 불일치: 질문의 지칭어="${referenceWord}", 밑줄 표시="${underlinedWord}". 질문을 수정합니다.`)
        // 질문에서 밑줄 표시를 수정
        result.question = result.question.replace(/<u>[^<]+<\/u>/, `<u>${referenceWord}</u>`)
        // 텍스트에서도 밑줄 표시 수정
        const textMatch = result.question.match(/<u>[^<]+<\/u>[\s\S]*?(<u>[^<]+<\/u>)/)
        if (textMatch && textMatch[1]) {
          result.question = result.question.replace(new RegExp(`<u>${underlinedWord}<\/u>`, 'gi'), `<u>${referenceWord}</u>`)
        }
      }
    }

    return {
      question: result.question,
      answer: result.answer,
      wordLimit: wordLimit,
      condition: result.condition || '<조건>\n1) 반드시 본문에 있는 단어만 사용할 것\n2) 어형을 바꾸지 말 것',
      referenceWord: referenceWord
    }
  } catch (parseError) {
    console.error('JSON 파싱 오류:', parseError)
    console.error('응답 내용:', content)
    throw new Error(`AI 응답을 파싱할 수 없습니다: ${parseError.message}`)
  }
}

