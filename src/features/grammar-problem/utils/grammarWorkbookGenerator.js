import {
  buildFullTopicLinesForPrompt,
  collectAllTopicIds,
  findTopicLabel,
  passageForMcqDisplay,
} from './grammarWorkbookUtils.js'
import { isEssayMode } from './grammarWorkbookModes.js'
import {
  formatQuotaForPrompt,
  assertQuotaMatch,
  splitQuotaIntoParts,
  sumQuota,
} from './grammarWorkbookQuota.js'

/** 객관식은 PDF·UI에서 ①~⑤ 고정 — 모델이 3~4개만 줄 때 자동 보정 */
const MCQ_TARGET_CHOICE_COUNT = 5
const MCQ_MIN_CHOICES_BEFORE_PAD = 2
const MCQ_CHOICE_PAD_TEXT =
  '※ [자동 보정] AI 응답에 선택지가 부족합니다. 필요하면 문제를 다시 생성해 주세요.'
const ENABLE_BATCH_AI_REVIEW = true
const MCQ_NEAR_DUPLICATE_SIMILARITY = 0.96

const MCQ_SUBTYPE_POOL = [
  '밑줄 친 ①~⑤ 중 어법상 어색한 것',
  '밑줄 친 ①~⑤ 중 어법상 옳은 것',
  '문장 5개 중 어법상 옳은 것',
  '문장 5개 중 어법상 틀린 것',
  '같은 문법 포인트의 서로 다른 쓰임 구분',
  '빈칸에 들어갈 가장 알맞은 표현',
  '어법상 고쳐 써야 할 부분 찾기',
]

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

function randomShuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildSubtypePlan(modeId, n) {
  const size = Math.max(0, Number(n) || 0)
  if (size <= 0) return []
  if (!['workbook', 'mcq'].includes(modeId)) return []
  const pool = randomShuffle(MCQ_SUBTYPE_POOL)
  if (size <= pool.length) return pool.slice(0, size)
  const out = []
  while (out.length < size) out.push(...randomShuffle(MCQ_SUBTYPE_POOL))
  return out.slice(0, size)
}

function buildSubtypePlanPromptBlock(modeId, subtypePlan) {
  if (!['workbook', 'mcq'].includes(modeId) || !subtypePlan.length) return ''
  return `\nMANDATORY ITEM TYPE DIVERSITY PLAN (use as "format" and actual item design):
- 문제 유형을 단조롭게 반복하지 말고 아래 배정을 따른다.
${subtypePlan.map((t, i) => `- no ${i + 1}: ${t}`).join('\n')}
- 각 문항은 위 배정과 실제 내용(지시문·지문·보기 구조)이 일치해야 한다.`
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

function validateProblemDiversity(problems, essay) {
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
    if (essay) continue
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
 * @param {boolean} essay
 */
function buildPedagogyStyleBlock(difficulty, essay) {
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

  if (essay) {
    return `${base}
- 서술형은 해당 학년 단원 평가·영작에서 요구하는 수준과 채점 포인트(문법 적용·필수 어휘)를 반영할 것.`
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
function ensurePassageHasQLine(passage, essay) {
  const s = String(passage ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
  if (!s) return s
  const firstLine = (s.split(/\r?\n/)[0] || '').trim()
  if (/^Q\.\s/.test(firstLine)) return s
  const fallback = essay ? 'Q. 다음 요구에 따라 답하시오.' : 'Q. 다음 중 알맞은 것을 고르시오.'
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

function formatOneProblemBlock(p, sections, essay) {
  const no = p.no ?? p.number
  const tid = p.topicId || ''
  const label = findTopicLabel(sections, tid)
  const fmt = p.format || p.type || '문제'
  const passage = passageForMcqDisplay(
    ensurePassageHasQLine(p.passage || p.question || '', essay),
    essay
  )

  const choices = Array.isArray(p.choices) ? toChoiceNumberedLines(p.choices) : []
  const idx = p.correctIndex ?? p.answerIndex
  const mark = idx != null && idx >= 0 && idx < 5 ? ['①', '②', '③', '④', '⑤'][idx] : ''
  const expl = p.explanation || p.explain || ''
  const modelAns = p.modelAnswer || p.model_answer || ''

  if (essay) {
    return [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `[${no}] ${label}`,
      `형식: ${fmt} (서술형)`,
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
  const essay = isEssayMode(modeId)
  return problems.map((p) => formatOneProblemBlock(p, sections, essay)).join('\n\n')
}

/** 유형이 섞인 배열 — 각 문항의 grammarWorkbookModeId(없으면 fallbackMode)로 서술형 여부 판별 */
export function formatProblemsAsTextMixed(problems, sections, fallbackMode = 'mcq') {
  if (!Array.isArray(problems)) return ''
  return problems
    .map((p) =>
      formatOneProblemBlock(p, sections, isEssayMode(p.grammarWorkbookModeId || fallbackMode))
    )
    .join('\n\n')
}

const PASSAGE_Q_RULE = `MANDATORY "Q." QUESTION LINE (every problem, all modes):
- The JSON field "passage" MUST start with ONE Korean line beginning exactly with "Q. " (capital Q, ASCII period, space).
- That line must clearly state the task (e.g. "Q. 다음 중 옳은 문장을 고르시오.", "Q. 어법상 옳은 것을 고르시오.", "Q. 밑줄에 알맞는 말을 고르시오.").
- For multiple-choice (non-essay): if every option in "choices" is already a full English sentence or standalone fragment, put ALL English ONLY in "choices" — do NOT add a duplicate example English sentence in "passage" after the Q. line. Exception: you MUST add a shared English stem in "passage" after Q. only when the item needs one (e.g. one passage with a blank/underline, or numbered sentences to judge, or a short dialogue stem all choices refer to).
- When a shared stem IS needed, use "\\n\\n" after the Q. line, then the stem (may include ____ or (1)(2) etc.).
- Never put only bare English without a preceding Q. line inside "passage".
- 서술형(essay): after "Q. ", the passage is Korean-led with required markers "【한글 해석】" and "【영작에 사용할 단어】" (see QUESTION MODE — 서술형).`

function buildModeBlock(n, modeId) {
  switch (modeId) {
    case 'concept':
      return `QUESTION MODE — "개념" (문법 개념 확인, 전부 한글)
- passage: FIRST line MUST be "Q. " + 한국어 질문/지시 (옳은 설명 고르기, 용어 구별 등). Then optional extra Korean context on following lines.
- choices: ①~⑤ 모두 한국어 문장이나 짧은 구.
- explanation: 정답 근거를 한국어로 1~3문장.
- Each of the ${n} items: exactly ONE topicId from the MANDATORY QUOTA below, exactly 5 choices, correctAnswerIndex 0..4.`

    case 'workbook':
      return `QUESTION MODE — "워크북" (기초)
- passage: Line 1 = "Q. " + 한국어 지시문만 두는 것이 기본. 보기(choices)만으로 문장이 완결되면 passage에 영어 예시 문장을 넣지 말 것(중복·혼선 방지). 공통 지문이 필요한 빈칸·밑줄·짧은 대화만 passage에 "\\n\\n" 뒤에 넣을 것.
- Mix across items: 용법·형태 고르기, 쉬운 빈칸, 짧은 완성, 어색한 것 고르기 등.
- choices: 항상 ①~⑤ 다섯 개.
- explanation: 한국어.
- Each of the ${n} items: exactly ONE topicId from the MANDATORY QUOTA, exactly 5 choices, correctAnswerIndex 0..4.`

    case 'mcq':
      return `QUESTION MODE — "객관식" (어법·판별 심화)
- passage: Line 1 = "Q. " + 한국어 지시문이 기본. "옳은 문장 고르기"처럼 보기가 각각 완전한 영어 문장이면 passage는 Q. 한 줄(또는 Q. + 한국어 보조 한 줄)로 끝내고, 영어는 전부 choices에만 둘 것. 한 지문을 보고 고르는 유형만 "\\n\\n" 뒤에 영어 지문(밑줄·번호·빈칸 포함)을 넣을 것.
- Mix item types: 틀린 어법 / 다른 용법 / 옳은 문장 개수 / 옳은 문장 모두 고르기 등.
- choices: 항상 ①~⑤.
- explanation: 한국어.
- Each of the ${n} items: exactly ONE topicId from the MANDATORY QUOTA, exactly 5 choices, correctAnswerIndex 0..4.`

    case 'essay':
      return `QUESTION MODE — "서술형" (영작·보기 없음)
- passage MUST follow this structure (all inside the single "passage" string, use \\n for newlines):
  (1) Line 1: "Q. " + 한국어 지시 — 반드시 "아래 한글 뜻을 (해당 topic의 문법 포인트)를 써서 영어로 쓰시오" 류로, 문법을 명시해 요구할 것.
  (2) Blank line, then a line starting exactly with "【한글 해석】" — 그 문법 포인트가 자연스럽게 쓰일 만한 의미의 한국어 문장(또는 짧은 연결된 두 문장). 단순 번역 틀이 아니라, 학습자가 그 문법으로만 표현하기 쉬운 뉘앙스로 쓸 것.
  (3) Next line starting exactly with "【영작에 사용할 단어】" — 영작에 반드시 포함해야 할 영어 단어·구 3~8개를 쉼표 또는 · 로 제시 (모범 답에도 모두 쓸 것).
  (4) 선택: "【힌트】" 줄에 한국어로 짧은 힌트 가능.
- choices: 반드시 빈 배열 [].
- correctAnswerIndex: null.
- modelAnswer: 위 한글 뜻을 담은 자연스러운 영어 문장(들). 반드시 해당 topic 문법을 올바르게 쓰고, "【영작에 사용할 단어】"에 적은 단어·구를 모두 포함할 것.
- explanation: 한국어로 채점 포인트(문법 적용 여부, 필수 단어 포함 여부, 의미 일치 여부).
- Each of the ${n} items: exactly ONE topicId from the MANDATORY QUOTA. NO multiple-choice.`

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
    m.includes('서술형 passage에') ||
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

/** OpenAI 호출이 끝없이 대기하지 않도록 (브라우저 기본 타임아웃 없음) */
function grammarRequestTimeoutMs(batchSize, essay) {
  const base = essay ? 3600 : 2600
  const linear = batchSize * base
  const floor = batchSize >= 35 ? 180000 : 120000
  return Math.min(420000, Math.max(floor, linear))
}

async function openAiChatCompletionsFetch(body, apiKey, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    return response
  } catch (e) {
    if (e?.name === 'AbortError') {
      const sec = Math.round(timeoutMs / 1000)
      throw new Error(
        `요청 시간 초과(${sec}초) — 서버 응답이 없습니다. 네트워크·VPN·방화벽을 확인하거나, 잠시 후 다시 시도해 주세요.`
      )
    }
    throw e
  } finally {
    clearTimeout(timer)
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
  const subtypePlan = buildSubtypePlan(modeId, n)
  const subtypePlanBlock = buildSubtypePlanPromptBlock(modeId, subtypePlan)
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

  const jsonExample = essay
    ? `{
  "problems": [
    {
      "no": 1,
      "topicId": "2-1",
      "format": "서술형",
      "passage": "Q. 아래 한글 뜻을 enough to 구문을 사용하여 영어로 쓰시오.\\n\\n【한글 해석】그는 그 상자를 들기에 충분히 힘이 세다.\\n【영작에 사용할 단어】 strong, enough, lift, box",
      "choices": [],
      "correctAnswerIndex": null,
      "modelAnswer": "He is strong enough to lift the box.",
      "explanation": "한글 채점 포인트"
    }
  ]
}`
    : `{
  "problems": [
    {
      "no": 1,
      "topicId": "2-1",
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
      ? essay
        ? `

RETRY (${attemptIndex}): Validation failed (topicId count mismatch or spelling). Before JSON output, tally per topicId: count objects with that EXACT "topicId" string — each tally MUST equal the quota (not more, not fewer). If quota says 3 for "g5-2", output exactly 3 objects with "g5-2", never 4. Do NOT use shortened ids like "5-2" if the quota says "g5-2".`
        : `

RETRY (${attemptIndex}): Validation failed (topicId mismatch, missing choices, index errors, or overly similar distractors). Before JSON output: (1) tally per topicId — each EXACT "topicId" count MUST equal quota. (2) Every non-essay item MUST have "choices" as a JSON array of exactly 5 non-empty strings (not {}, not omitted). (3) correctAnswerIndex must be 0..4. (4) Within each item, make all five choices meaningfully distinct; do not output two distractors that differ only by one tiny word, punctuation, or tense tweak.`
      : ''
  const retryIssueBlock =
    attemptIndex > 1 && previousErrorMessage
      ? `\nPREVIOUS FAILURE TO FIX:\n- ${String(previousErrorMessage).replace(/\s+/g, ' ').trim()}\n`
      : ''

  const prompt = `You are an expert Korean high-school English grammar item writer specializing in ${promptSubject}.

TARGET LEARNER LEVEL: ${difficulty} (Korean school grade; adjust difficulty accordingly).

GRAMMAR THEME: ${label}
FOCUS: ${promptFocus}

${buildPedagogyStyleBlock(difficulty, essay)}

TASK: Create EXACTLY ${n} separate problems following the QUESTION MODE below.

MANDATORY QUOTA — you MUST output exactly this many problems per topicId (sum = ${n}). Do not swap counts between topicIds.
${quotaLines}
${exactTopicIdBlock}
STRICT COUNT: Each quota line means EXACTLY that many JSON objects with that exact "topicId" string. If a line says 5 for "g6-2", there must be exactly 5 objects with "topicId":"g6-2" — not 4, not 6. Never drop the letter prefix (g, p, etc.). After writing all problems, mentally recount per topicId before returning.

TOPIC REFERENCE (for understanding labels; topicId strings must match EXACTLY):
${refCatalog}

${modeBlock}
${subtypePlanBlock}

${PASSAGE_Q_RULE}
${retryBlock}
${retryIssueBlock}

Return ONLY valid JSON (no markdown):
${jsonExample}

The "problems" array MUST have length ${n}. Use "no": 1 through ${n} in this batch.
For non-essay items: every problem MUST have exactly 5 strings in "choices" and correctAnswerIndex 0..4.
For essay items: every problem MUST have "choices": [], "correctAnswerIndex": null, non-empty "modelAnswer" string.
For essay items: every "passage" MUST include the exact markers "【한글 해석】" and "【영작에 사용할 단어】" after the Q. line, as in the example.
Every "passage" MUST begin with a line starting with "Q. " as in the example.
Each problem's topicId must appear in the MANDATORY QUOTA and respect its count.`

  const maxTokens = 16384
  const temperature = Math.min(0.68, 0.38 + (attemptIndex - 1) * 0.1)
  const timeoutMs = grammarRequestTimeoutMs(n, essay)

  const response = await openAiChatCompletionsFetch(
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: essay
            ? 'You create Korean school English grammar 서술형(영작) items in workbook + 내신 style for the given grade: passage gives Korean meaning + required English words; students write English using the target grammar. Return only valid JSON with a "problems" array. No markdown. Follow per-topicId counts exactly.'
            : 'You create Korean school English grammar items (workbook + 내신-style). Every multiple-choice problem MUST include "choices" as a JSON array of exactly 5 non-empty strings — never omit, null, {}, or []. Return only valid JSON with a "problems" array. No markdown. Follow per-topicId counts exactly.',
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
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  let result
  try {
    result = JSON.parse(cleaned)
  } catch (e) {
    throw new Error('JSON 파싱 실패. 응답이 잘렸을 수 있습니다. 다시 시도해 주세요.')
  }

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
    const choices = essay ? [] : extractMcqChoicesFromProblem(p)
    const correctIndex =
      p.correctAnswerIndex != null
        ? Number(p.correctAnswerIndex)
        : p.correctIndex != null
          ? Number(p.correctIndex)
          : null
    return {
      no: numberOffset + i + 1,
      topicId: normalizeTopicIdForBatch(p.topicId, allowedQuotaIds),
      format: p.format || subtypePlan[i] || (essay ? '서술형' : '객관식'),
      passage: ensurePassageHasQLine(p.passage || p.question || '', essay),
      choices,
      correctIndex:
        essay || choices.length === 0
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
    if (essay) {
      if (p.choices.length !== 0) {
        throw new Error(`문항 ${i + 1}: 서술형 탭은 choices를 빈 배열 []로 두어야 합니다.`)
      }
      if (!p.modelAnswer || !String(p.modelAnswer).trim()) {
        throw new Error(`문항 ${i + 1}: 서술형은 modelAnswer(모범 답안)가 필요합니다.`)
      }
      const pv = String(p.passage || '')
      if (!pv.includes('【한글 해석】')) {
        throw new Error(
          `문항 ${i + 1}: 서술형 passage에 「【한글 해석】」이 포함되어야 합니다(문법 포인트가 드러나는 한글 뜻).`
        )
      }
      if (!pv.includes('【영작에 사용할 단어】')) {
        throw new Error(
          `문항 ${i + 1}: 서술형 passage에 「【영작에 사용할 단어】」가 포함되어야 합니다(필수 영단어·구 제시).`
        )
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

  validateProblemDiversity(normalized, essay)

  if (ENABLE_BATCH_AI_REVIEW) {
    await verifyGeneratedBatchWithAi({
      apiKey,
      difficulty,
      grammarLabel: label,
      modeId,
      essay,
      problems: normalized,
    })
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
  const prompt = `You are a strict QA verifier for Korean grammar workbook problems.
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
4) Essay feasibility: instruction, Korean meaning, required words, and modelAnswer must be mutually consistent and actually solvable with the requested grammar.
5) No obvious contradiction like asking "for+목적격+to부정사" but giving Korean meaning that cannot naturally realize that structure.

If any violation exists, ok=false and include concrete issue messages referencing item number.
Be conservative: if uncertain, return ok=true.

DATA:
${JSON.stringify(payload)}`

  const response = await openAiChatCompletionsFetch(
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a strict worksheet QA validator. Return only JSON with ok/issues/fixHints.',
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
  let parsed = {}
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('검수 JSON 파싱 실패')
  }
  if (parsed?.ok === true) return
  const issues = Array.isArray(parsed?.issues) ? parsed.issues.filter(Boolean) : []
  const msg = issues[0] || '검수 단계에서 규칙 위반이 감지되었습니다.'
  throw new Error(`검수 실패: ${msg}`)
}

/**
 * 한 번에 10·20문항씩 여러 topicId를 섞으면 할당(3)보다 많이(4) 찍는 등 불일치가 잦음.
 * 개념·워크북·객관식·서술형 공통으로 최대 5문항 단위 API 호출 (25문항도 5×5).
 */
const GRAMMAR_CHUNK_CAP = 5

/** @param {number} n */
function buildChunkSizesForCount(n) {
  if (!Number.isFinite(n) || n <= 0) return []
  const out = []
  let left = n
  while (left > 0) {
    const sz = Math.min(GRAMMAR_CHUNK_CAP, left)
    out.push(sz)
    left -= sz
  }
  return out
}

/** API 분할 호출 횟수 (로딩 문구용). modeId는 호환용 */
export function countGrammarApiRoundsForProblemCount(n, _modeId) {
  return buildChunkSizesForCount(n).length
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

  const essay = isEssayMode(modeId)

  const chunkSizes = buildChunkSizesForCount(n)
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
- 서술형 문항에는 「【한글 해석】」(문법 포인트가 드러나는 한글 뜻)과 「【영작에 사용할 단어】」(필수 영단어·구)가 있어야 합니다. 빠졌으면 채워 넣고, modelAnswer가 그 단어들을 모두 쓰도록 맞춥니다.
- Do NOT add chatty meta text (no "검토했습니다"). Output ONLY the corrected full worksheet text.
- If one item is badly broken, rewrite that item in the same format.
- Plain text only — no markdown code fences.

--- DRAFT START ---
${raw}
--- DRAFT END ---`

  const response = await openAiChatCompletionsFetch(
    {
      model: 'gpt-4o-mini',
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
  let out = data.choices[0]?.message?.content?.trim() || ''
  out = out
    .replace(/^```(?:text|plaintext)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
  if (!out)
    throw new Error(
      '검토 결과가 비어 있습니다. 출력 한도(약 2만 토큰)에 걸려 잘렸을 수 있으니 문항 수를 줄이거나 다시 시도해 주세요.'
    )
  return out
}
