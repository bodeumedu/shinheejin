// 한글원문생성: 영어 원문을 한글 해석으로 번역

/**
 * 영어가 사실상 한 문장인지(문장 종결 부호 0~1개, 세미콜론·빈 줄 구분 없음) 느슨히 판별
 * @param {string} text
 */
export function isLikelySingleEnglishSentence(text) {
  const t = String(text ?? '')
    .trim()
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return false
  if (t.includes(';')) return false
  if (/\n\s*\n/.test(String(text ?? '').trim())) return false
  const punct = t.match(/[.!?]/g)
  if (!punct || punct.length === 0) return true
  if (punct.length > 1) return false
  return /[.!?]\s*$/.test(t)
}

export async function translateEnglishToKorean(englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const trimmed = (englishText || '').trim()
  if (!trimmed) {
    throw new Error('영어 원문이 비어 있습니다.')
  }

  const singleSentence = isLikelySingleEnglishSentence(trimmed)

  const singleSentenceBlock = singleSentence
    ? `
SINGLE-SENTENCE SOURCE: The English below is ONE sentence (or one sentence fragment without multiple sentence-ending punctuation).

PUNCTUATION ALIGNMENT (must follow):
- Output EXACTLY ONE Korean sentence (one main clause chain ending once). No line breaks inside the translation.
- Match the English punctuation COUNT and ORDER: count commas (,), periods (.), question marks (?), exclamation marks (!) in the English and use the same total counts in Korean in parallel positions (phrase boundaries). Do not add extra commas or sentence-final marks; do not omit them unless Korean grammar absolutely requires merging two English commas into one—if you must merge, keep the total as close as possible and never increase sentence count.
- The final sentence-ending type must correspond to the English (statement → period after formal ending; question → formal question + ?; exclamation → one ! if the English had one).
`
    : ''

  const strictStyle = `STRICT STYLE: Use only formal Korean (합쇼체). Declarative sentences end with "~습니다." or "~입니다." (e.g. "~합니다.", "~였습니다."). If the English ends with a question mark, use a formal question ending such as "~습니까?" and keep one "?". If the English ends with "!", keep a single "!" after an appropriate formal ending. Do not use "~해요.", "~이에요.", "~예요.", "~네요.", "~죠." or other 해요체/informal endings.`

  const prompt = `Translate the following English text into natural Korean. This is for study materials, so the translation should be accurate and readable.

${strictStyle}
${singleSentenceBlock}
Return ONLY the Korean translation, no additional explanation or text.

English text:
${trimmed}`

  const systemBase =
    'You are a helpful translator for English study materials. Use formal Korean (합쇼체): declarative ~습니다/~입니다; questions ~습니까? etc.; avoid 해요체. Respond with only the Korean translation, no other text.'
  const systemExtra = singleSentence
    ? ' When the user marks a single-sentence source, output exactly one Korean sentence and preserve comma/question/exclamation/period counts and order to mirror the English.'
    : ''

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
            content: systemBase + systemExtra,
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
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
      throw new Error('AI 응답이 비어있습니다.')
    }

    return content.trim()
  } catch (error) {
    throw error
  }
}
