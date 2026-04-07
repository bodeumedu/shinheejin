import {
  buildFullTopicLinesForPrompt,
  collectAllTopicIds,
  findTopicLabel,
  passageForMcqDisplay,
} from './grammarWorkbookUtils.js'
import { isWritingMode } from './grammarWorkbookModes.js'
import {
  formatQuotaForPrompt,
  assertQuotaMatch,
  splitQuotaIntoParts,
  sumQuota,
} from './grammarWorkbookQuota.js'
import {
  buildOpenAiLikeChatResponse,
  cleanGeminiTextOutput,
  extractJsonObjectText,
  geminiGenerateFromOpenAiChatBody,
} from '../../../utils/geminiClient.js'
import {
  buildTemplateCatalogPromptBlock,
  buildTemplatePlan,
  buildTemplatePlanPromptBlock,
} from './grammarWorkbookTemplates.js'

/** 객관식은 PDF·UI에서 ①~⑤ 고정 — 모델이 3~4개만 줄 때 자동 보정 */
const MCQ_TARGET_CHOICE_COUNT = 5
const MCQ_MIN_CHOICES_BEFORE_PAD = 2
const MCQ_CHOICE_PAD_TEXT =
  '※ [자동 보정] AI 응답에 선택지가 부족합니다. 필요하면 문제를 다시 생성해 주세요.'
const ENABLE_BATCH_AI_REVIEW = true
const MCQ_NEAR_DUPLICATE_SIMILARITY = 0.96
const GRAMMAR_MODEL_MAIN = 'gemini-3.1-pro-preview'
const GRAMMAR_MODEL_REVIEW = 'gemini-3-flash-preview'

/**
 * 모델이 choices를 배열이 아닌 객체로 주거나 options 키를 쓰는 경우 보정
 * @param {unknown} raw
 * @returns {unknown[]}
 */
function coerceChoicesArray(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object') {
    const keys = Object.keys(raw).filter((k) => /^\d+$/.test(k))
    if (keys.length > 0) {
      return keys.sort((a, b) => Number(a) - Number(b)).map((k) => raw[k])
    }
    return Object.values(raw)
  }
  return []
}

function normalizeChoiceText(text) {
  return String(text ?? '')
    .replace(/^\s*(?:[①②③④⑤]|\(?[1-5]\)?[.)]?|[A-E][.)])\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 객관식 보기 후보를 한곳에서 모음 (필드명 산재 대비)
 * @param {object} p
 * @returns {string[]}
 */
function extractMcqChoicesFromProblem(p) {
  const fromChoices = coerceChoicesArray(p.choices)
  const fromOptions = coerceChoicesArray(p.options)
  const fromAlternatives = coerceChoicesArray(p.alternatives)
  const arr =
    fromChoices.length > 0
      ? fromChoices
      : fromOptions.length > 0
        ? fromOptions
        : fromAlternatives
  return arr.map((c) => String(c ?? '').trim()).filter((s) => s.length > 0)
}

function canonicalizeMcqChoices(choices) {
  return choices.map((s) => normalizeChoiceText(s)).filter(Boolean)
}

function toChoiceNumberedLines(choices) {
  const marks = ['①', '②', '③', '④', '⑤']
  return choices.map((c, i) => `${marks[i] || `${i + 1}.`} ${normalizeChoiceText(c)}`)
}

function compactTextSignature(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
}

function jaccardBigramSimilarity(a, b) {
  const mk = (s) => {
    const t = compactTextSignature(s)
    const set = new Set()
    for (let i = 0; i < t.length - 1; i++) {
      set.add(t.slice(i, i + 2))
    }
    return set
  }
  const A = mk(a)
  const B = mk(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const uni = A.size + B.size - inter
  return uni > 0 ? inter / uni : 0
}

function validateProblemDiversity(problems, writingMode) {
  const byPassage = new Set()
  const byChoiceSet = new Set()
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i]
    const pSig = compactTextSignature(String(p.passage || '').replace(/^Q\.\s*/i, ''))
    if (pSig.length > 14) {
      if (byPassage.has(pSig)) {
        throw new Error(`문항 ${i + 1}: 앞 문항과 지문·질문이 거의 동일해 중복으로 판단되었습니다.`)
      }
      byPassage.add(pSig)
    }
    if (writingMode) continue
    const ch = Array.isArray(p.choices) ? p.choices : []
    const chNorm = ch.map((x) => compactTextSignature(x))
    if (new Set(chNorm).size !== chNorm.length) {
      throw new Error(`문항 ${i + 1}: 보기에 동일/유사 항목이 중복되어 있습니다.`)
    }
    for (let a = 0; a < ch.length; a++) {
      for (let b = a + 1; b < ch.length; b++) {
        if (jaccardBigramSimilarity(ch[a], ch[b]) >= MCQ_NEAR_DUPLICATE_SIMILARITY) {
          throw new Error(`문항 ${i + 1}: 보기 ${a + 1}번과 ${b + 1}번이 지나치게 유사합니다.`)
        }
      }
    }
    const choiceSig = chNorm.join('||')
    if (choiceSig && byChoiceSet.has(choiceSig)) {
      throw new Error(`문항 ${i + 1}: 앞 문항과 보기 세트가 사실상 동일합니다.`)
    }
    if (choiceSig) byChoiceSet.add(choiceSig)
  }
}

/**
 * 문제집·내신 톤 + 학년 맞춤 (프롬프트용)
 * @param {string} difficulty
 * @param {string} modeId
 */
function buildPedagogyStyleBlock(difficulty, modeId) {
  const gradeHint =
    difficulty.startsWith('초')
      ? '초등 고학년~중학 준비 수준의 쉬운 어휘·짧은 문장.'
      : difficulty.startsWith('중')
        ? '중학교 영어 내신·문제집(EBS·자습서류)에서 흔한 어휘·문장 길이·오답 유형.'
        : '고등학교 영어 내신·교과서 부교재·졸업평가 수준의 어법·어휘 난이도.'

  const base = `KOREAN SCHOOL STYLE (문제집·학교 시험 기출 이미지):
- 한국 학교 영어 시험과 문제집에 가깝게 출제할 것(교실에서 익숙한 지시어, 공정한 오답, 과한 TOEIC식 영어·지엽적 잡학 금지).
- TARGET LEARNER LEVEL "${difficulty}"에 맞출 것: ${gradeHint}
- 지시문(passage 첫 줄 Q.)은 내신에서 자주 쓰는 한국어 표현을 쓸 것(예: 다음 중 옳은 것, 어법상 알맞은 것, 밑줄 친 부분 중 틀린 것, 본문의 주제로 가장 적절한 것).`

  if (modeId === 'essay') {
    return `${base}
- 서술형은 해당 학년 단원 평가·영작에서 요구하는 수준과 채점 포인트(문법 적용·필수 어휘)를 반영할 것.`
  }

  if (modeId === 'concept') {
    return `${base}
- 개념형은 개념 설명, 규칙 비교, 용법 매칭, 성분 분석처럼 "이해 확인" 성격이 드러나게 만들 것.
- 객관식처럼 억지 5지선다로 바꾸지 말고, 학생이 직접 판단·서술·연결·분석하도록 구성할 것.
- modelAnswer와 explanation은 교사용 해설로 분명하게 적을 것.`
  }

  if (modeId === 'workbook') {
    return `${base}
- 워크북은 같은 문법 구조를 반복해서 직접 써 보는 연습지처럼 만들 것.
- 보기 고르기보다 짧은 변환·영작·재배열·반복 쓰기 연습에 가깝게 구성할 것.
- 학생이 직접 답을 써 보게 하고, modelAnswer와 간단한 채점 포인트를 함께 제공할 것.`
  }

  return `${base}
- 객관식은 반드시 JSON 배열 "choices"에 문자열 5개를 넣을 것(객체·null·[]·생략 금지). 각 문자열은 비어 있지 않아야 함. 영어 보기를 passage에만 몰아넣고 choices를 비우면 안 됨.
- 보기 문자열에는 문제집·기출처럼 ①②③④⑤ 번호를 붙여도 됨.`
}

/**
 * 모델이 topicId 접두(g6-2 → "6-2")를 빼먹거나 하이픈만 다른 경우, 이번 배치 quota에 맞게 보정
 * @param {string} rawId
 * @param {string[]} allowedIds
 */
function normalizeTopicIdForBatch(rawId, allowedIds) {
  let s = String(rawId ?? '')
    .trim()
    .replace(/[–—﹣−]/g, '-')
  if (!s) return s
  const allowed = [...new Set(allowedIds.filter(Boolean))]
  if (allowed.includes(s)) return s
  const lower = s.toLowerCase()
  const caseHit = allowed.find((a) => a.toLowerCase() === lower)
  if (caseHit) return caseHit
  const bySlice = allowed.filter((a) => a.length >= 2 && a.slice(1) === s)
  if (bySlice.length === 1) return bySlice[0]
  return s
}

/** 본문 첫 줄이 "Q. "로 시작하지 않으면 시험지 형식용 질문 행을 덧붙임 (API 누락 대비) */
function ensurePassageHasQLine(passage, writingMode) {
  const s = String(passage ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
  if (!s) return s
  const firstLine = (s.split(/\r?\n/)[0] || '').trim()
  if (/^Q\.\s/.test(firstLine)) return s
  const fallback = writingMode ? 'Q. 다음 요구에 따라 직접 써 보시오.' : 'Q. 다음 중 알맞은 것을 고르시오.'
  return `${fallback}\n\n${s}`
}

/**
 * 객관식 정답 위치(①~⑤) 편향을 줄이기 위해 보기 순서를 섞고 정답 인덱스를 재매핑
 * @param {string[]} choices
 * @param {number} correctIndex
 * @returns {{ choices: string[], correctIndex: number }}
 */
function shuffleChoicesWithAnswer(choices, correctIndex) {
  const pairs = choices.map((text, idx) => ({ text, idx }))
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pairs[i], pairs[j]] = [pairs[j], pairs[i]]
  }
  const nextChoices = pairs.map((p) => p.text)
  const nextCorrectIndex = pairs.findIndex((p) => p.idx === correctIndex)
  return { choices: nextChoices, correctIndex: nextCorrectIndex }
}

function formatOneProblemBlock(p, sections, writingMode) {
  const no = p.no ?? p.number
  const tid = p.topicId || ''
  const label = findTopicLabel(sections, tid)
  const fmt = p.format || p.type || '문제'
  const passage = passageForMcqDisplay(
    ensurePassageHasQLine(p.passage || p.question || '', writingMode),
    writingMode
  )

  const choices = Array.isArray(p.choices) ? toChoiceNumberedLines(p.choices) : []
  const idx = p.correctIndex ?? p.answerIndex
  const mark = idx != null && idx >= 0 && idx < 5 ? ['①', '②', '③', '④', '⑤'][idx] : ''
  const expl = p.explanation || p.explain || ''
  const modelAns = p.modelAnswer || p.model_answer || ''

  if (writingMode) {
    return [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `[${no}] ${label}`,
      `형식: ${fmt}`,
      '',
      passage,
      '',
      modelAns ? `【모범 답안 예시】\n${modelAns}` : '',
      expl ? `【채점·해설】\n${expl}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  const choiceBlock = choices.length ? choices.join('\n') : '(보기 없음)'
  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `[${no}] ${label}`,
    `형식: ${fmt}`,
    '',
    passage,
    '',
    choiceBlock,
    '',
    idx != null && idx >= 0 && idx < 5 ? `정답: ${mark}` : '',
    expl ? `해설: ${expl}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const PROBLEM_COUNT_OPTIONS = [25, 50, 100]

export function formatProblemsAsText(problems, sections, modeId) {
  if (!Array.isArray(problems)) return ''
  const writingMode = isWritingMode(modeId)
  return problems.map((p) => formatOneProblemBlock(p, sections, writingMode)).join('\n\n')
}

/** 유형이 섞인 배열 — 각 문항의 grammarWorkbookModeId(없으면 fallbackMode)로 서술형 여부 판별 */
export function formatProblemsAsTextMixed(problems, sections, fallbackMode = 'mcq') {
  if (!Array.isArray(problems)) return ''
  return problems
    .map((p) =>
      formatOneProblemBlock(p, sections, isWritingMode(p.grammarWorkbookModeId || fallbackMode))
    )
    .join('\n\n')
}

const PASSAGE_Q_RULE = `MANDATORY "Q." QUESTION LINE (every problem, all modes):
- The JSON field "passage" MUST start with ONE Korean line beginning exactly with "Q. " (capital Q, ASCII period, space).
- That line must clearly state the task and should fit the chosen item style naturally.
- For multiple-choice items: if every option in "choices" is already a full English sentence or standalone fragment, put ALL English ONLY in "choices" — do NOT add a duplicate example English sentence in "passage" after the Q. line. Exception: add a shared English stem in "passage" after Q. only when the item really needs one.
- When a shared stem IS needed, use "\\n\\n" after the Q. line, then the stem (may include ____ or (1)(2) etc.).
- Never put only bare English without a preceding Q. line inside "passage".
- Open-response items (concept/workbook/essay): keep passage Korean-led when appropriate, and place blanks, source sentences, 조건, 제시어, 지문, 요약문 등 the template requires inside "passage".`

function buildModeBlock(n, modeId) {
  switch (modeId) {
    case 'concept':
      return `QUESTION MODE — "개념" (개념 확인형 서답)
- use the concept template catalog as recommendations, not as a rigid checklist.
- choices: 반드시 빈 배열 [].
- correctAnswerIndex: null.
- modelAnswer: 정답 또는 모범 답안을 짧고 분명하게 제시.
- explanation: 한국어 해설.
- Each of the ${n} items: exactly ONE topicId from the MANDATORY QUOTA below.`

    case 'workbook':
      return `QUESTION MODE — "워크북" (반복 연습형 서답)
- use the workbook template catalog as recommendations, not as a rigid checklist.
- blanks, bracket choices, combining prompts, transformation cues, chunk lists 등 템플릿에 필요한 자료는 모두 "passage" 안에 넣는다.
- choices: 반드시 빈 배열 [].
- correctAnswerIndex: null.
- modelAnswer: 학생이 실제로 써야 할 정답 문장/정답 표현.
- explanation: 짧은 채점 포인트 또는 해설.
- Each of the ${n} items: exactly ONE topicId from the MANDATORY QUOTA.`

    case 'mcq':
      return `QUESTION MODE — "객관식" (어법·판별 심화)
- use the multiple-choice template catalog as recommendations, not as a rigid checklist.
- passage: Line 1 = "Q. " + 한국어 지시문. 한 지문을 보고 고르는 유형만 "\\n\\n" 뒤에 공통 지문/문장/보기 자료를 넣을 것.
- choices: 항상 ①~⑤.
- explanation: 한국어.
- Each of the ${n} items: exactly ONE topicId from the MANDATORY QUOTA, exactly 5 choices, correctAnswerIndex 0..4.`

    case 'essay':
      return `QUESTION MODE — "서술형" (내신 서답·영작)
- use the essay template catalog as recommendations, not as a rigid checklist.
- 지문, 조건, 제시어, 전환 문장, 요약문, 해석 대상 문장 등 템플릿 요소를 "passage" 안에 자연스럽게 구성할 것.
- choices: 반드시 빈 배열 [].
- correctAnswerIndex: null.
- modelAnswer: 채점 가능한 모범 답안.
- explanation: 한국어 채점 포인트와 해설.
- Each of the ${n} items: exactly ONE topicId from the MANDATORY QUOTA.`

    default:
      return buildModeBlock(n, 'mcq')
  }
}

function isGrammarBatchRetryable(err) {
  const m = err?.message || String(err)
  return (
    m.includes('불일치') ||
    m.includes('JSON') ||
    m.includes('잘렸') ||
    m.includes('비어 있습니다') ||
    m.includes('뿐입니다') ||
    m.includes('객관식 보기가 너무 적') ||
    m.includes('correctAnswerIndex는') ||
    m.includes('중복') ||
    m.includes('유사') ||
    m.includes('검수 실패') ||
    m.includes('repetitive question structures') ||
    m.includes('same question structures') ||
    m.includes('too similar') ||
    m.includes('near-duplicate')
  )
}

/** Gemini 호출이 끝없이 대기하지 않도록 (브라우저 기본 타임아웃 없음) */
function grammarRequestTimeoutMs(batchSize, essay) {
  const base = essay ? 3600 : 2600
  const linear = batchSize * base
  const floor = batchSize >= 35 ? 180000 : 120000
  return Math.min(420000, Math.max(floor, linear))
}

function parseGeminiJsonText(raw, fallbackMessage) {
  const jsonText = extractJsonObjectText(raw)
  try {
    return JSON.parse(jsonText)
  } catch {
    throw new Error(fallbackMessage)
  }
}

async function openAiChatCompletionsFetch(body, apiKey, timeoutMs) {
  try {
    const out = await geminiGenerateFromOpenAiChatBody(body, apiKey, timeoutMs)
    return buildOpenAiLikeChatResponse(out.text, out.finishReason)
  } catch (e) {
    if (String(e?.message || '').includes('요청 시간 초과')) {
      const sec = Math.round(timeoutMs / 1000)
      throw new Error(
        `요청 시간 초과(${sec}초) — 서버 응답이 없습니다. 네트워크·VPN·방화벽을 확인하거나, 잠시 후 다시 시도해 주세요.`
      )
    }
    throw e
  }
}

/**
 * @param {Record<string, number>} quotaObject
 */
async function fetchGrammarBatchOnce(
  apiKey,
  difficulty,
  typeConfig,
  modeId,
  quotaObject,
  batchSize,
  numberOffset,
  essay,
  attemptIndex,
  previousErrorMessage = ''
) {
  const { sections, promptSubject, promptFocus, label } = typeConfig
  const n = batchSize
  const writingMode = isWritingMode(modeId)
  const templatePlan = buildTemplatePlan(modeId, n)
  const templateCatalogBlock = buildTemplateCatalogPromptBlock(modeId, label, difficulty)
  const templatePlanBlock = buildTemplatePlanPromptBlock(templatePlan, label, difficulty)
  const quotaLines = formatQuotaForPrompt(quotaObject, sections)
  const refCatalog = buildFullTopicLinesForPrompt(sections)
  const modeBlock = buildModeBlock(n, modeId)
  const quotaTopicIds = Object.entries(quotaObject)
    .filter(([, c]) => (Number(c) || 0) > 0)
    .map(([id]) => id)
  const exactTopicIdBlock =
    quotaTopicIds.length > 0
      ? `\nEXACT topicId STRINGS — use ONLY these in JSON "topicId" (character-for-character, including the first letter e.g. g):\n${quotaTopicIds.map((id) => `- "${id}"`).join('\n')}\n`
      : ''

  const jsonExample = writingMode
    ? `{
  "problems": [
    {
      "no": 1,
      "topicId": "g2-1",
      "format": "유형 라벨",
      "passage": "Q. 문법과 난이도에 맞는 자연스러운 형식으로 한국어 지시문과 본문/조건/빈칸/제시어를 구성하시오.",
      "choices": [],
      "correctAnswerIndex": null,
      "modelAnswer": "모범 답안",
      "explanation": "한글 해설"
    }
  ]
}`
    : `{
  "problems": [
    {
      "no": 1,
      "topicId": "g2-1",
      "format": "유형 라벨",
      "passage": "Q. 다음 중 옳은 문장을 고르시오.",
      "choices": ["① ...", "② ...", "③ ...", "④ ...", "⑤ ..."],
      "correctAnswerIndex": 2,
      "explanation": "한글 해설"
    }
  ]
}`

  const retryBlock =
    attemptIndex > 1
      ? writingMode
        ? `

RETRY (${attemptIndex}): Rewrite the ENTIRE JSON from scratch. Validation previously failed. Before final output, silently verify all of the following:
- each quota line is satisfied exactly,
- every item is school-appropriate, internally consistent, and has all required fields,
- the JSON parses as one object with one "problems" array only.
If quota says 3 for "g5-2", output exactly 3 objects with "topicId":"g5-2". Never shorten it to "5-2".`
        : `

RETRY (${attemptIndex}): Rewrite the ENTIRE JSON from scratch. Validation previously failed. Before final output, silently verify all of the following:
(1) each EXACT "topicId" count equals the quota,
(2) every non-essay item has "choices" as an array of exactly 5 non-empty strings,
(3) correctAnswerIndex is 0..4,
(4) distractors are meaningfully distinct.
Do not add comments, explanations, markdown, or any text before/after the JSON object.`
      : ''
  const retryIssueBlock =
    attemptIndex > 1 && previousErrorMessage
      ? `\nPREVIOUS FAILURE TO FIX:\n- ${String(previousErrorMessage).replace(/\s+/g, ' ').trim()}\n`
      : ''

  const prompt = `You are an expert Korean high-school English grammar item writer specializing in ${promptSubject}.

TARGET LEARNER LEVEL: ${difficulty} (Korean school grade; adjust difficulty accordingly).

GRAMMAR THEME: ${label}
FOCUS: ${promptFocus}

${buildPedagogyStyleBlock(difficulty, modeId)}

TASK: Create EXACTLY ${n} separate problems following the QUESTION MODE below.

MANDATORY QUOTA — you MUST output exactly this many problems per topicId (sum = ${n}). Do not swap counts between topicIds.
${quotaLines}
${exactTopicIdBlock}
STRICT COUNT: Each quota line means EXACTLY that many JSON objects with that exact "topicId" string. If a line says 5 for "g6-2", there must be exactly 5 objects with "topicId":"g6-2" — not 4, not 6. Never drop the letter prefix (g, p, etc.). After writing all problems, mentally recount per topicId before returning.

TOPIC REFERENCE (for understanding labels; topicId strings must match EXACTLY):
${refCatalog}

${modeBlock}
${templateCatalogBlock}
${templatePlanBlock}

${PASSAGE_Q_RULE}
${retryBlock}
${retryIssueBlock}

GEMINI OUTPUT DISCIPLINE:
- Think silently and output only the final JSON object.
- Do not wrap JSON in markdown fences.
- Do not apologize or explain.
- If uncertain, prefer a simple but fully valid school-style item over a fancy risky item.
- Before output, silently re-count the array length, per-topicId quota, and all required fields.

TEMPLATE POLICY:
- The catalog and suggested mix are references, not hard assignments.
- You may choose the most suitable item format yourself for each topic as long as it matches the mode and feels natural for Korean school materials.
- Avoid mechanically forcing underlines / matching / counts just because a template mentions them; prefer what best fits the grammar point.
- Add light variety across the batch when natural.
- Avoid repeating the exact same item style too many times in a row.
- If the batch is large enough, try to mix 2-3 different item styles, but never force variety when one style is clearly best for the grammar point.

Return ONLY valid JSON (no markdown):
${jsonExample}

The "problems" array MUST have length ${n}. Use "no": 1 through ${n} in this batch.
For multiple-choice items: every problem MUST have exactly 5 strings in "choices" and correctAnswerIndex 0..4.
For open-response items (concept/workbook/essay): every problem MUST have "choices": [], "correctAnswerIndex": null, non-empty "modelAnswer" string.
Every "passage" MUST begin with a line starting with "Q. " as in the example.
Each problem's topicId must appear in the MANDATORY QUOTA and respect its count.`

  const maxTokens = 16384
  const baseTemperature = modeId === 'mcq' ? 0.26 : modeId === 'concept' ? 0.2 : 0.24
  const temperature = Math.max(0.08, baseTemperature - (attemptIndex - 1) * 0.03)
  const timeoutMs = grammarRequestTimeoutMs(n, essay)

  const response = await openAiChatCompletionsFetch(
    {
      model: GRAMMAR_MODEL_MAIN,
      messages: [
        {
          role: 'system',
          content: writingMode
            ? modeId === 'concept'
              ? 'You create Korean school English grammar concept-check open-response items. Use the template catalog as recommendations, choose the most natural format yourself, keep choices empty, include modelAnswer and explanation, maintain light variety across the batch when natural, and return one valid JSON object only.'
              : modeId === 'workbook'
                ? 'You create Korean school English grammar workbook drills. Use the template catalog as recommendations, choose the most natural format yourself, keep choices empty, include modelAnswer and explanation, maintain light variety across the batch when natural, and return one valid JSON object only.'
                : 'You create Korean school English grammar 서술형 items. Use the template catalog as recommendations, choose the most natural format yourself, keep choices empty, include modelAnswer and explanation, maintain light variety across the batch when natural, and return one valid JSON object only.'
            : 'You create Korean school English grammar items for workbook + 내신 use. Prioritize valid structure, clear distinction among choices, light variety across the batch when natural, and one valid JSON object only. Every item must have exactly five distinct choices and exact per-topicId counts.',
        },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    },
    apiKey,
    timeoutMs
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
  }

  const data = await response.json()
  const raw = data.choices[0]?.message?.content?.trim() || '{}'
  const result = parseGeminiJsonText(
    raw,
    'JSON 파싱 실패. 응답이 잘렸거나 JSON 앞뒤에 불필요한 텍스트가 섞였습니다. 다시 시도해 주세요.'
  )

  const problems = result.problems
  if (!Array.isArray(problems) || problems.length === 0) {
    throw new Error('문항 배열이 비어 있습니다.')
  }

  if (problems.length < n) {
    throw new Error(
      `생성된 문항이 ${problems.length}개뿐입니다(목표 ${n}개). 응답이 잘렸을 수 있어 다시 시도해 주세요.`
    )
  }

  const allowedQuotaIds = Object.entries(quotaObject)
    .filter(([, c]) => (Number(c) || 0) > 0)
    .map(([id]) => id)

  const normalized = problems.slice(0, n).map((p, i) => {
    const choices = writingMode ? [] : extractMcqChoicesFromProblem(p)
    const correctIndex =
      p.correctAnswerIndex != null
        ? Number(p.correctAnswerIndex)
        : p.correctIndex != null
          ? Number(p.correctIndex)
          : null
    return {
      no: numberOffset + i + 1,
      topicId: normalizeTopicIdForBatch(p.topicId, allowedQuotaIds),
      format: p.format || templatePlan[i]?.label || (writingMode ? (modeId === 'concept' ? '개념형' : modeId === 'workbook' ? '워크북형' : '서술형') : '객관식'),
      passage: ensurePassageHasQLine(p.passage || p.question || '', writingMode),
      choices,
      correctIndex:
        writingMode || choices.length === 0
          ? null
          : correctIndex != null && !Number.isNaN(correctIndex)
            ? correctIndex
            : null,
      explanation: p.explanation || '',
      modelAnswer: p.modelAnswer != null ? String(p.modelAnswer) : p.model_answer != null ? String(p.model_answer) : '',
    }
  })

  assertQuotaMatch(normalized, quotaObject, '')

  for (let i = 0; i < normalized.length; i++) {
    const p = normalized[i]
    if (writingMode) {
      if (p.choices.length !== 0) {
        throw new Error(`문항 ${i + 1}: 개념/워크북/서술형 문항은 choices를 빈 배열 []로 두어야 합니다.`)
      }
      if (!p.modelAnswer || !String(p.modelAnswer).trim()) {
        throw new Error(`문항 ${i + 1}: 개념/워크북/서술형 문항에는 modelAnswer(모범 답안)가 필요합니다.`)
      }
      continue
    }
    let ch = canonicalizeMcqChoices([...p.choices])
    if (ch.length > MCQ_TARGET_CHOICE_COUNT) {
      ch = ch.slice(0, MCQ_TARGET_CHOICE_COUNT)
    }
    const nCh = ch.length
    if (nCh < MCQ_MIN_CHOICES_BEFORE_PAD) {
      throw new Error(
        `문항 ${i + 1}: 객관식 보기가 너무 적습니다(최소 ${MCQ_MIN_CHOICES_BEFORE_PAD}개, 현재 ${nCh}개).`
      )
    }
    if (p.correctIndex == null || p.correctIndex < 0 || p.correctIndex >= nCh) {
      throw new Error(
        `문항 ${i + 1}: correctAnswerIndex는 0~${Math.max(0, nCh - 1)}이어야 합니다(보기 ${nCh}개).`
      )
    }
    while (ch.length < MCQ_TARGET_CHOICE_COUNT) {
      ch.push(MCQ_CHOICE_PAD_TEXT)
    }
    const shuffled = shuffleChoicesWithAnswer(ch, p.correctIndex)
    p.choices = shuffled.choices
    p.correctIndex = shuffled.correctIndex
  }

  validateProblemDiversity(normalized, writingMode)

  if (ENABLE_BATCH_AI_REVIEW) {
    try {
      await verifyGeneratedBatchWithAi({
        apiKey,
        difficulty,
        grammarLabel: label,
        modeId,
        essay: writingMode,
        problems: normalized,
      })
    } catch {
      // Gemini 검수 오탐은 생성 자체를 막지 않으므로 조용히 무시합니다.
    }
  }

  return normalized
}

function aiReviewTimeoutMs(problemCount) {
  const n = Math.max(1, Number(problemCount) || 1)
  return Math.min(180000, Math.max(70000, 30000 + n * 13000))
}

async function verifyGeneratedBatchWithAi({
  apiKey,
  difficulty,
  grammarLabel,
  modeId,
  essay,
  problems,
}) {
  const payload = {
    difficulty,
    grammarLabel,
    modeId,
    essay,
    problems,
  }
  const prompt = `You are a conservative QA verifier for Korean grammar workbook problems.
Check these rules and return ONLY JSON:
{
  "ok": true|false,
  "issues": ["..."],
  "fixHints": ["..."]
}

Rules:
1) Item variety: avoid repetitive same question structures across this batch.
   However, DO NOT flag items just because they share the same broad grammar family/theme (for example, multiple "to-infinitive" items in one workbook is expected).
   Only flag this rule when two items are nearly interchangeable in stem/task/micro-skill/choice pattern, not when they merely test related subtopics from the same unit.
2) Non-essay: choices must be five, distinct, and not near-duplicate.
3) Non-essay: answer index must align with best choice.
4) Open-response feasibility: instruction, passage 자료, 조건, 빈칸/제시어/지문, and modelAnswer must be mutually consistent and actually solvable with the requested grammar.
5) No obvious contradiction like asking "for+목적격+to부정사" but giving Korean meaning that cannot naturally realize that structure.

If any violation exists, ok=false and include concrete issue messages referencing item number.
If the issue is vague, subjective, or not tied to a specific item number, return ok=true.
Be conservative: if uncertain, return ok=true.

DATA:
${JSON.stringify(payload)}`

  const response = await openAiChatCompletionsFetch(
    {
      model: GRAMMAR_MODEL_REVIEW,
      messages: [
        {
          role: 'system',
          content:
            'You are a conservative worksheet QA validator. Return only JSON. Only fail on clear, item-specific violations.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    },
    apiKey,
    aiReviewTimeoutMs(problems.length)
  )
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `검수 API 오류: ${response.status}`)
  }
  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content?.trim() || '{}'
  const parsed = parseGeminiJsonText(raw, '검수 JSON 파싱 실패')
  if (parsed?.ok === true) return
  const issues = Array.isArray(parsed?.issues) ? parsed.issues.filter(Boolean) : []
  const concreteIssues = issues.filter((issue) => /문항\s*\d+|item\s*\d+/i.test(String(issue)))
  if (concreteIssues.length === 0) return
  const msg = concreteIssues[0] || issues[0] || '검수 단계에서 규칙 위반이 감지되었습니다.'
  throw new Error(`검수 실패: ${msg}`)
}

/**
 * 한 번에 너무 많은 문항을 요청하면 할당 불일치가 늘어나고, 너무 잘게 쪼개면 API 호출 횟수가 과도해진다.
 * 개념/워크북/서술형은 4문항 단위, 객관식은 8문항 단위로 균형을 맞춘다.
 */
function getGrammarChunkCap(modeId) {
  return isWritingMode(modeId) ? 4 : 8
}

/** @param {number} n */
function buildChunkSizesForCount(n, modeId = 'mcq') {
  if (!Number.isFinite(n) || n <= 0) return []
  const chunkCap = getGrammarChunkCap(modeId)
  const out = []
  let left = n
  while (left > 0) {
    const sz = Math.min(chunkCap, left)
    out.push(sz)
    left -= sz
  }
  return out
}

/** API 분할 호출 횟수 (로딩 문구용) */
export function countGrammarApiRoundsForProblemCount(n, modeId = 'mcq') {
  return buildChunkSizesForCount(n, modeId).length
}

async function fetchGrammarBatchesSequentially(
  apiKey,
  difficulty,
  typeConfig,
  modeId,
  quotaObject,
  chunkSizes,
  essay
) {
  const parts = splitQuotaIntoParts(quotaObject, chunkSizes)
  let merged = []
  let offset = 0
  for (let i = 0; i < parts.length; i++) {
    const sz = chunkSizes[i]
    const batch = await fetchGrammarBatch(
      apiKey,
      difficulty,
      typeConfig,
      modeId,
      parts[i],
      sz,
      offset,
      essay
    )
    merged = merged.concat(batch)
    offset += sz
  }
  return merged
}

async function fetchGrammarBatch(
  apiKey,
  difficulty,
  typeConfig,
  modeId,
  quotaObject,
  batchSize,
  numberOffset,
  essay
) {
  const maxAttempts = 10
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchGrammarBatchOnce(
        apiKey,
        difficulty,
        typeConfig,
        modeId,
        quotaObject,
        batchSize,
        numberOffset,
        essay,
        attempt,
        lastErr?.message || ''
      )
    } catch (e) {
      lastErr = e
      if (attempt >= maxAttempts || !isGrammarBatchRetryable(e)) throw e
    }
  }
  throw lastErr
}

/**
 * @param {Record<string, number>} quotaObject — UI에서 미리 무작위 배분한 topicId별 문항 수 (합 = problemCount)
 */
export async function generateGrammarWorkbookProblems(
  apiKey,
  difficulty,
  selectedTopicIds,
  problemCount,
  typeConfig,
  modeId = 'mcq',
  quotaObject
) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  const n = Number(problemCount)
  if (!Number.isFinite(n) || n < 1 || n > 150) {
    throw new Error('문항 수가 올바르지 않습니다.')
  }

  if (!quotaObject || typeof quotaObject !== 'object') {
    throw new Error('문항 배분 정보가 없습니다.')
  }
  if (sumQuota(quotaObject) !== n) {
    throw new Error(`문항 배분 합이 ${n}이 아닙니다. 페이지를 새로고침하거나 배분을 다시 뽑아 주세요.`)
  }

  const { sections } = typeConfig
  const allIds = collectAllTopicIds(sections)
  const picked = [...new Set(selectedTopicIds)].filter(Boolean)
  const pool = picked.length ? picked : allIds
  const poolSet = new Set(pool)

  for (const id of Object.keys(quotaObject)) {
    if ((Number(quotaObject[id]) || 0) > 0 && !poolSet.has(id)) {
      throw new Error(`배분에 허용되지 않은 topicId가 있습니다: "${id}"`)
    }
  }

  const essay = isWritingMode(modeId)

  const chunkSizes = buildChunkSizesForCount(n, modeId)
  if (!chunkSizes.length) {
    throw new Error('지원하지 않는 문항 수입니다.')
  }

  const merged = await fetchGrammarBatchesSequentially(
    apiKey,
    difficulty,
    typeConfig,
    modeId,
    quotaObject,
    chunkSizes,
    essay
  )
  assertQuotaMatch(merged, quotaObject, '')
  return {
    problems: merged,
    fullText: formatProblemsAsText(merged, sections, modeId),
  }
}

const REVIEW_DRAFT_MAX_CHARS = 120_000

function reviewRequestTimeoutMs(charLen) {
  const base = 120_000
  const extra = Math.min(280_000, Math.floor(charLen * 2.5))
  return Math.min(600_000, base + extra)
}

/**
 * 생성된 문제지 텍스트를 한 번 검토·교정합니다 (형식·줄바꿈 최대한 유지).
 * @param {string} apiKey
 * @param {string} difficulty
 * @param {string} grammarLabel
 * @param {string} draftText
 * @returns {Promise<string>}
 */
export async function reviewGrammarWorkbookDraft(apiKey, difficulty, grammarLabel, draftText) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  const raw = String(draftText || '').trim()
  if (!raw) throw new Error('검토할 내용이 없습니다.')
  if (raw.length > REVIEW_DRAFT_MAX_CHARS) {
    throw new Error(
      `검토할 텍스트가 너무 깁니다(약 ${REVIEW_DRAFT_MAX_CHARS.toLocaleString('ko-KR')}자 이하로 줄여 주세요).`
    )
  }

  const timeoutMs = reviewRequestTimeoutMs(raw.length)
  const prompt = `You are a careful editor for Korean high-school English grammar worksheets.

TARGET LEARNER LEVEL: ${difficulty}

GRAMMAR THEME (context): ${grammarLabel}

TASK: Read the ENTIRE draft between DRAFT START/END. Fix wrong answers vs explanations, English grammar mistakes, awkward or incorrect Korean in 해설/지시문, typos, and broken numbering. For multiple-choice items keep exactly five choices labeled ①~⑤ and make 정답 consistent with the best choice.

RULES:
- Preserve structure: line breaks, ━━━ separators, lines like [n]..., 형식:, passage, choices, 정답:, 해설: (and essay model answers if present).
- 각 문항 본문(영어 지문 앞)에는 반드시 한 줄로 "Q. "로 시작하는 한국어 질문·지시가 있어야 합니다. 없으면 알맞은 지시문을 넣고, 영어 지문 전에 빈 줄을 둡니다.
- 개념/워크북/서술형 문항은 각 형식에 맞는 자료(빈칸, 연결 대상, 제시어, 조건, 전환 문장, 요약문, 지문 등)가 passage에 자연스럽게 들어 있어야 하며, modelAnswer·해설과 서로 맞아야 합니다.
- Do NOT add chatty meta text (no "검토했습니다"). Output ONLY the corrected full worksheet text.
- If one item is badly broken, rewrite that item in the same format.
- Plain text only — no markdown code fences.

--- DRAFT START ---
${raw}
--- DRAFT END ---`

  const response = await openAiChatCompletionsFetch(
    {
      model: GRAMMAR_MODEL_MAIN,
      messages: [
        {
          role: 'system',
          content:
            'You edit Korean English grammar worksheets. Reply with only the corrected full draft text, same layout, no markdown fences.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.22,
      max_tokens: 20000,
    },
    apiKey,
    timeoutMs
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
  }

  const data = await response.json()
  let out = cleanGeminiTextOutput(data.choices[0]?.message?.content?.trim() || '')
  if (!out)
    throw new Error(
      '검토 결과가 비어 있습니다. 출력 한도(약 2만 토큰)에 걸려 잘렸을 수 있으니 문항 수를 줄이거나 다시 시도해 주세요.'
    )
  return out
}
