// 텍스트 분석 유틸리티 - OpenAI API 사용

export async function analyzeText(text, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an English teacher helping students understand English texts. Analyze the following English text and provide the following items in JSON format:

1. koreanTopic: A Korean topic sentence summarizing the main theme
2. englishTitle: An English title for the text
3. keySentence: The sentence from the text that best represents the main topic (copy exactly from the text)
4. summaryWithTextWords: An English summary using words from the original text. Write it as a SINGLE, complete sentence (not multiple sentences). Make it concise but comprehensive, about 30-50 words. IMPORTANT: Identify the 7 most important words in the summary and wrap each of them with <b> tags (e.g., <b>important</b>). The words should be key vocabulary or concepts.
5. summaryWithNewWords: An English summary using different words (paraphrasing). Write it as a SINGLE, complete sentence (not multiple sentences). Make it concise but comprehensive, about 30-50 words. IMPORTANT: Identify the 7 most important words in the summary and wrap each of them with <b> tags (e.g., <b>important</b>). The words should be key vocabulary or concepts.
6. koreanDiagram: Explain the structure and organization of the text step by step in Korean. This should describe how the text is organized, what happens in each part, and the flow of the story or argument. Use hierarchical indentation format (2 spaces per level). Each line should be a complete sentence describing a step or part of the text structure, but must fit in one line (about 40-50 characters). Format example:
텍스트의 전체적인 구성 설명
  첫 번째 단계나 부분에서 일어나는 일에 대한 설명
    첫 번째 단계의 세부 내용 설명
  두 번째 단계나 부분에서 일어나는 일에 대한 설명
7. englishDiagram: Explain the structure and organization of the text step by step in English. This should describe how the text is organized, what happens in each part, and the flow of the story or argument. Use hierarchical indentation format (2 spaces per level). Each line should be a complete sentence describing a step or part of the text structure, but must fit in one line (about 50-60 characters). Format example:
Description of the overall text structure
  Description of what happens in the first step or part
    Description of details in the first step
  Description of what happens in the second step or part
8. mainImageDescription: A detailed description of a single image that best represents the main theme and content of the entire text. This should be a comprehensive scene description (3-4 sentences) that captures the essence of the whole story.
9. vocabulary: Select exactly 20 high-school-level English words that are important for understanding the text. Return as an array of objects: [{ "word": "abandon", "meaning": "버리다, 포기하다" }, ...]. Choose words from the text when possible; include clear Korean meanings. Keep to exactly 20 items.

Text to analyze:
${text}

Return ONLY a valid JSON object with these exact keys: koreanTopic, englishTitle, keySentence, summaryWithTextWords, summaryWithNewWords, koreanDiagram, englishDiagram, mainImageDescription, vocabulary.`

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
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('AI 응답을 받을 수 없습니다.')
    }

    // JSON 파싱 (코드 블록 제거)
    const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(jsonContent)

    // 필수 필드 확인
    if (!result.koreanTopic || !result.englishTitle || !result.mainImageDescription) {
      throw new Error('AI 응답 형식이 올바르지 않습니다.')
    }

    return {
      koreanTopic: result.koreanTopic,
      englishTitle: result.englishTitle,
      keySentence: result.keySentence || text.substring(0, 100),
      summaryWithTextWords: result.summaryWithTextWords || '',
      summaryWithNewWords: result.summaryWithNewWords || '',
      koreanDiagram: result.koreanDiagram || '',
      englishDiagram: result.englishDiagram || '',
      mainImageDescription: result.mainImageDescription || '',
      vocabulary: Array.isArray(result.vocabulary) ? result.vocabulary.slice(0, 20) : []
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.')
    }
    throw error
  }
}

