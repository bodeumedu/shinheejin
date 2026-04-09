import { openAiChatCompletions } from '../../../utils/openaiProxyClient'

// 복합서술형 처리 유틸리티 - OpenAI API 사용

// 1. 주제를 가장 잘 드러내는 문장 찾기
export async function findKeySentence(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher. Analyze the following English text and find the ONE sentence that is most meaningful for students to study for an exam. This should be the sentence that best represents the main topic or is most important for understanding the text.

Return ONLY a valid JSON object with this exact key:
- keySentence: The sentence that is most meaningful for exam study (copy exactly from the text, including all punctuation)

Text:
${text}`

  try {
    const data = await openAiChatCompletions(apiKey, {
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
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('AI 응답이 비어있습니다.')
    }

    const result = JSON.parse(content)

    if (!result.keySentence) {
      throw new Error('AI 응답에 필수 정보가 없습니다.')
    }

    return result.keySentence
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AI 응답 파싱 오류: ' + error.message)
    }
    throw error
  }
}

// 9. 문법적으로 가장 복잡한 문장 찾기 ({ } 안 제외)
export async function findComplexSentence(text, excludeRanges, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher. Analyze the following English text and find the ONE sentence that is grammatically the most complex.

Important: Exclude any sentences that are between { } brackets.

Return ONLY a valid JSON object with this exact key:
- complexSentence: The grammatically most complex sentence (copy exactly from the text, including all punctuation)

Text:
${text}`

  try {
    const data = await openAiChatCompletions(apiKey, {
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
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('AI 응답이 비어있습니다.')
    }

    const result = JSON.parse(content)

    if (!result.complexSentence) {
      throw new Error('AI 응답에 필수 정보가 없습니다.')
    }

    return result.complexSentence
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AI 응답 파싱 오류: ' + error.message)
    }
    throw error
  }
}

// 10. 고난이도 단어 6개 찾기 ({ } 와 [ ] 안 제외)
export async function findDifficultWords(text, excludeRanges, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher. Analyze the following English text and find 6 difficult or key words.

Important: 
- Exclude any words that are between { } brackets
- Exclude any words that are between [ ] brackets
- Select words that are high-level, difficult, or key to understanding the text
- Provide Korean translations for each word

Return ONLY a valid JSON object with this exact structure:
{
  "words": [
    {"word": "exact word from text", "korean": "한글 뜻"},
    ...
  ]
}

Text:
${text}`

  try {
    const data = await openAiChatCompletions(apiKey, {
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
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('AI 응답이 비어있습니다.')
    }

    const result = JSON.parse(content)

    if (!result.words || !Array.isArray(result.words)) {
      throw new Error('AI 응답에 필수 정보가 없습니다.')
    }

    return result.words
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AI 응답 파싱 오류: ' + error.message)
    }
    throw error
  }
}

// 한글 해석 생성
export async function translateSentence(englishSentence, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `Translate the following English sentence into Korean. Return ONLY the Korean translation, no additional text.

English sentence:
${englishSentence}`

  try {
    const data = await openAiChatCompletions(apiKey, {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful translator. Always respond with only the translation, no additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7
    })
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('AI 응답이 비어있습니다.')
    }

    return content.trim()
  } catch (error) {
    throw error
  }
}
