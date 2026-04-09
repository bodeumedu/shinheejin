import { openAiChatCompletions } from '../../../utils/openaiProxyClient'

// 빈칸 분석 유틸리티 - OpenAI API 사용

export async function createBlank(text, blankType, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const blankTypeKorean = {
    'nouns': '명사',
    'verbs': '동사',
    'adjectives': '형용사'
  }

  const blankTypeEnglish = {
    'nouns': 'nouns',
    'verbs': 'verbs',
    'adjectives': 'adjectives'
  }

  const prompt = `You are an English teacher creating a study highlight. Analyze the following English text and HIGHLIGHT (bold) EXACTLY 15 of the most important ${blankTypeKorean[blankType]} in the passage.

Instructions:
1) Move LEFT-TO-RIGHT through the text to COVER THE WHOLE PASSAGE (not just the beginning).
2) Choose ONLY SINGLE WORDS that are ${blankTypeKorean[blankType]} (nouns if 명사, verbs if 동사, adjectives if 형용사). Exclude mid-sentence capitalized proper nouns.
3) Return the highlighted text where each chosen word is wrapped with <b>word</b>. Do NOT add extra spaces or change punctuation.
4) Also return an array of selections in ORIGINAL ORDER with character offsets so numbering is deterministic.

Return JSON:
{
  "highlights": [
    { "start": 10, "end": 17, "word": "happens", "pos": "verb", "context": "..." },
    { "start": 120, "end": 127, "word": "million", "pos": "noun", "context": "..." }
  ],
  "textWithHighlights": "Full text where selected words are wrapped with <b>...</b> tags"
}

Important:
- Select EXACTLY 15 items total, strictly ordered by "start".
- Each item must be ONE WORD only (no phrases).
- Exclude mid-sentence Capitalized proper nouns.
- Distribute selections across the entire text. Ensure that the last 20% of the text includes at least a few replacements if valid targets exist.

Text to analyze:
${text}

Return ONLY a valid JSON object, no additional text.`

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
      max_tokens: 2000
    })
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('AI 응답을 받을 수 없습니다.')
    }

    // JSON 파싱 (코드 블록 제거)
    let jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    // JSON 시작과 끝 찾기 (중괄호 사이)
    const jsonStart = jsonContent.indexOf('{')
    const jsonEnd = jsonContent.lastIndexOf('}')
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1)
    }
    
    let result
    try {
      result = JSON.parse(jsonContent)
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError)
      console.error('파싱 시도한 내용:', jsonContent)
      throw new Error(`AI 응답을 파싱할 수 없습니다: ${parseError.message}`)
    }

    // 필수 필드 확인
    if (!result.highlights || !Array.isArray(result.highlights) || typeof result.textWithHighlights !== 'string') {
      console.error('AI 응답 형식 오류:', result)
      throw new Error('AI 응답 형식이 올바르지 않습니다.')
    }

    // 정렬 및 답지 생성 (볼드 하이라이트 모드)
    const replacements = [...result.highlights]
      .filter(r => typeof r.start === 'number' && typeof r.end === 'number' && r.word && r.end > r.start)
      .sort((a, b) => a.start - b.start)

    // 하이라이트 텍스트 보정: <b>가 없거나 기존 빈칸(언더바)이 남아있으면 원문에서 다시 생성
    let textWithBlanks = result.textWithHighlights || ''
    const hasBold = /<b>.*?<\/b>/i.test(textWithBlanks)
    
    console.log('빈칸 생성 검증:', {
      hasTextWithHighlights: !!result.textWithHighlights,
      hasBoldTags: hasBold,
      replacementsCount: replacements.length,
      textLength: text.length,
      preview: textWithBlanks.substring(0, 100)
    });
    
    // replacements가 없거나 <b> 태그가 없으면 재구성
    if (replacements.length === 0) {
      console.warn('replacements가 비어있습니다. AI 응답을 확인하세요.');
      throw new Error('선택된 단어가 없습니다. 다시 시도해주세요.');
    }
    
    if (!hasBold || /_{4,}/.test(textWithBlanks)) {
      // 원문(text)과 하이라이트 오프셋으로 <b> 래핑 재구성
      console.log('빈칸 재구성 중...');
      let out = ''
      let cur = 0
      for (const r of replacements) {
        if (r.start < cur) {
          console.warn('오프셋 순서 문제:', { start: r.start, cur, word: r.word });
          continue
        }
        if (r.start >= text.length || r.end > text.length) {
          console.warn('오프셋 범위 초과:', { start: r.start, end: r.end, textLength: text.length, word: r.word });
          continue
        }
        out += text.slice(cur, r.start)
        out += `<b>${text.slice(r.start, r.end)}</b>`
        cur = r.end
      }
      out += text.slice(cur)
      textWithBlanks = out
      
      const boldCount = (textWithBlanks.match(/<b>/g) || []).length
      console.log('재구성 완료:', { 
        textWithBlanksLength: textWithBlanks.length, 
        boldTags: boldCount,
        expectedCount: replacements.length
      });
      
      if (boldCount === 0) {
        throw new Error('빈칸을 생성할 수 없습니다. <b> 태그가 생성되지 않았습니다.');
      }
    }
    
    if (!textWithBlanks || textWithBlanks.trim().length === 0) {
      throw new Error('빈칸 텍스트가 비어있습니다.');
    }
    const answers = []

    for (let i = 0; i < replacements.length; i++) {
      const r = replacements[i]
      answers.push({
        number: answers.length + 1,
        word: r.word,
        context: r.context || ''
      })
    }

    // 검증: 답지를 순서대로 <b>...</b>를 원단어로 대체했을 때 원문이 복원되는지 확인 (로깅 용도)
    try {
      // <b>…</b>를 답지 단어로 바꿔 원문과 일치하는지 확인
      let idxBold = 0
      const recon = textWithBlanks.replace(/<b>(.*?)<\/b>/g, (_m, _p1) => {
        const w = answers[idxBold]?.word ?? _p1
        idxBold++
        return w
      })
      if (recon !== text) {
        console.warn('재구성 불일치: AI 오프셋 또는 선택 오류 가능.')
      }
    } catch (_) {}

    // 답지는 위에서 1..N으로 부여됨

    return {
      textWithBlanks: textWithBlanks,
      answers: answers,
      blankCount: answers.length
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.')
    }
    throw error
  }
}

