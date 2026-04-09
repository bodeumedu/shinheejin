import { openAiChatCompletions } from '../../../utils/openaiProxyClient'
import { geminiGenerateContent, cleanGeminiTextOutput } from '../../../utils/geminiClient'
import { parsePeonaBlock } from './parsePeonaBlock'

/**
 * 통합 지문형: 출처 / 영어 전체 한 덩어리(문장마다 끊지 말고 원문 흐름 유지, 다수 [정답/오답]) / 한글(입력 그대로) //
 * 문항번호·1/2/3으로 문장 쪼개기 금지.
 */
const SYSTEM_PROMPT = `[Role]
고등학교 영어 교사. 수능·교재용 '통합 지문 이택일'을 만듭니다.

[절대 금지]
- 문항 번호(1, 2, 3…)를 붙이거나, 한 문항당 영어 한 줄만 두는 형식.
- 원문을 문장 단위로 잘라 여러 블록으로 나누기.
- 한글 줄에 [한글/한글] 이택일 넣기(한글은 참고문 그대로만).
- 제목·소제목·질문만 덩어리로 두고 본문은 한 줄씩만 주기.
- A·B 단독, [A/B] 플레이스홀더.
- 정답·오답이 아닌 엉뚱한 단어(예: delinquent ↔ delightful)로 장난치기 — 오답은 문법·형태·수일치·시제·전치사·분사·관계사 등 어법상 틀린 형태여야 함.

[출력 형식 — 이것만 출력, 설명·코드펜스 금지]
1행: 출처 문자열(입력과 동일)
2행: 단독 /
3행부터: 영어 본문 전체를 한 덩어리로(원문과 같은 문단·문장 순서). 문장마다 새 항목으로 나누지 말 것. 본문 안에만 [앞=원문 정답 / 뒤=명백한 어법 오답] 18~28개 삽입.
다음 줄: 단독 /
다음: 한글 — 사용자가 제공한 경우 그 문자열과 완전히 동일(재번역·맞춤법 수정 금지). 없으면 "-" 한 줄.
마지막 줄: //

[영어 본문 규칙]
- 원문 문장을 이어 붙인 한 덩어리(또는 원문과 동일한 문단 나눔만 허용). 중간에 빈 줄로 항목 구분 금지.
- 각 [정/오]는 원문에서 해당 위치만 두 후보로 바꾼 것.
- 어법 변형 위주(동사형·분사·관계사·도치·병렬·전치사 등). 의미만 비슷한 단어 바꾸기만 하지 말 것.

[형식 예시 — 실제 단어만. 아래는 한 지문 전체가 한 블록임]
수특라 예시_Gateway
/
People [involved/involving] in the conception and engineering of robots designed to perceive and act know how fundamental is the ability to discriminate [oneself/themselves] from other entities in the environment. Without such an ability, no goal-oriented action would be [possible/impossible].
/
(여기에는 입력으로 받은 한글 전문을 수정 없이 그대로 붙임)
//`

/**
 * 피어나는 대량 생성이라 Pro(3.1)보다 Flash가 훨씬 빠릅니다.
 * `.env`: VITE_PEONA_GEMINI_MODEL=gemini-3.1-pro-preview 로 품질 우선 가능.
 */
const GEMINI_MODEL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_PEONA_GEMINI_MODEL &&
    String(import.meta.env.VITE_PEONA_GEMINI_MODEL).trim()) ||
  'gemini-3-flash-preview'
const OPENAI_MODEL = 'gpt-4o-mini'
const PEONA_GEMINI_MAX_OUTPUT = 32768
const PEONA_OPENAI_MAX_TOKENS = 16384
const PEONA_GEMINI_TIMEOUT_MS = 120000

function trimAiOutput(content) {
  return cleanGeminiTextOutput(String(content ?? ''))
}

function buildUserPrompt(source, english, korean) {
  const rawKr = String(korean ?? '')
  let body = `[입력]

[출처 — 출력 1행과 동일]
${source}

[영어 원문 — 문장·문단 구조 유지, 이 전체에만 이택일 삽입. 끊어서 문항 나누지 말 것]
${english}`

  if (rawKr.trim()) {
    body += `

[한글 — 출력에서 마지막 / 와 // 사이에 아래를 글자 단위까지 동일하게 복사. 한글에 대괄호 이택일 넣지 말 것]
${rawKr}`
  } else {
    body += `

[한글 없음 — 세 번째 블록은 "-" 한 줄만 출력]`
  }
  return body
}

/**
 * @param {string} englishText
 * @param {string} source
 * @param {string} apiKey OpenAI 키 (Gemini 미사용 시 필수)
 * @param {{ korean?: string, geminiApiKey?: string }} [options]
 */
export async function generatePeonaWorkbook(englishText, source, apiKey, options = {}) {
  const { korean = '', geminiApiKey = '' } = options
  const openKey = String(apiKey || '').trim()
  const geminiKey = String(geminiApiKey || '').trim()
  if (!openKey && !geminiKey) {
    throw new Error('OpenAI 또는 Gemini API 키 중 하나를 설정해 주세요.')
  }

  const trimmed = String(englishText || '').trim()
  if (!trimmed) throw new Error('영어 원문이 비어 있습니다.')

  const src = String(source || '').trim() || '지문'
  const userPrompt = buildUserPrompt(src, trimmed, korean)

  if (geminiKey) {
    const { text, finishReason } = await geminiGenerateContent({
      apiKey: geminiKey,
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      userContent: userPrompt,
      temperature: 0.35,
      maxOutputTokens: PEONA_GEMINI_MAX_OUTPUT,
      timeoutMs: PEONA_GEMINI_TIMEOUT_MS,
    })
    const out = trimAiOutput(text)
    if (!out) throw new Error('Gemini 응답이 비어 있습니다.')
    if (finishReason === 'MAX_TOKENS') {
      console.warn(
        '[peona] Gemini MAX_TOKENS — 여전히 잘렸을 수 있습니다. 지문을 // 로 나누거나 짧은 지문으로 시도하세요.'
      )
    }
    return out
  }

  const data = await openAiChatCompletions(openKey, {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.45,
    max_tokens: PEONA_OPENAI_MAX_TOKENS,
  })
  const content = data.choices[0]?.message?.content
  if (!content) throw new Error('AI 응답이 비어있습니다.')
  return trimAiOutput(content)
}

/**
 * `//` 로 나뉜 여러 지문을 동시에 호출해 총 대기 시간을 줄입니다.
 */
export async function runPeonaOnDoubleSlashInput(inputText, apiKey, options = {}) {
  const geminiKey = String(options.geminiApiKey || '').trim()
  if (!String(apiKey || '').trim() && !geminiKey) {
    throw new Error('OpenAI 또는 Gemini API 키 중 하나를 설정해 주세요.')
  }

  const blocks = String(inputText || '')
    .split(/\s*\/\/+\s*/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  if (blocks.length === 0) {
    throw new Error('입력이 비어 있습니다.')
  }

  const rowPromises = blocks.map(async (block, i) => {
    const parsed = parsePeonaBlock(block, i)
    if (!parsed) {
      return {
        i,
        calledApi: false,
        text: `[지문 ${i + 1}] 형식을 인식하지 못했습니다.\n`,
      }
    }
    const { source, english: englishText, korean: koreanText } = parsed
    if (!englishText || !englishText.replace(/\s/g, '').length) {
      return {
        i,
        calledApi: false,
        text: `[${source || `지문 ${i + 1}`}] 영어 구간을 찾지 못했습니다. 출처/영어/한글// 또는 전처리 결과(출처\\n/\\n영어) 형식을 확인하세요.\n`,
      }
    }
    const result = await generatePeonaWorkbook(englishText, source || `지문 ${i + 1}`, apiKey, {
      korean: koreanText || '',
      geminiApiKey: geminiKey,
    })
    return { i, calledApi: true, text: result }
  })

  const rows = await Promise.all(rowPromises)
  rows.sort((a, b) => a.i - b.i)

  const apiCallCount = rows.filter((r) => r.calledApi).length
  if (apiCallCount === 0) {
    throw new Error(
      '피어나로 넘길 영어 지문이 없습니다. 전처리 후 이어하기를 쓰는 경우, 또는 출처/영어/한글// 형식인지 확인하세요.'
    )
  }

  return rows.map((r) => r.text).join('\n//\n') + '\n//'
}
