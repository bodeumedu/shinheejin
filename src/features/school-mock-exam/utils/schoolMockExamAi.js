import { ANALYSIS_STYLE_REFERENCE_KO } from './analysisStyleReferenceKo.js'
import {
  cleanGeminiTextOutput,
  extractJsonObjectText,
  geminiGenerateFromOpenAiChatBody,
} from '../../../utils/geminiClient.js'

const MODEL = 'gemini-3.1-pro-preview'
const MODEL_TEMPLATE_PROFILE = 'gemini-3-flash-preview'
const MODEL_TEMPLATE_VERIFY = 'gemini-3-flash-preview'

/** 동형·변형: 블록(지문)마다 1문항·다지문 합산 100점 등 긴 출력 대응 */
const MODEL_PARALLEL_MOCK_EXAM = 'gemini-3.1-pro-preview'
/** Gemini 3.1 Pro 출력 상한 */
const PARALLEL_MOCK_MAX_OUTPUT_TOKENS = 32768
const PARALLEL_MOCK_TIMEOUT_MS = 600000
const PARALLEL_MOCK_VERIFY_TIMEOUT_MS = 240000

/** 내신 독해 변형에 쓸 유형 풀 — 생성 시마다 섞어 블록에 배정(고루고루) */
const PARALLEL_BLOCK_TYPE_POOL = [
  '주제·제목·글의 요지 (5지선다)',
  '밑줄 친 어휘·구의 문맥 적절성 (5지선다)',
  '함의·내용과 일치하지 않는 것 (5지선다)',
  '빈칸에 들어갈 말 또는 문장 (5지선다, 선지는 완전 문장형 가능)',
  '(A)(B)(C) 삼중 빈칸 결합형 — 지문 본문에 (A)(B)(C) 위치에 빈칸 필수, 선지는 단어 세트 ①~⑤ (5지선다)',
  '어법상 어색한 것 (5지선다)',
  '어법상 틀린 것 고르기 — 번호 조합·개수형 가능',
  '문장 삽입 — 가장 적절한 위치 ①~⑤',
  '(A)(B)(C) 문단·문장 블록 순서 배열',
  '글의 흐름과 관계 없는 문장 (①~⑤)',
  '요약문·박스 속 빈칸 (5지선다)',
  '어휘(유의어·반의어·다의어) (5지선다)',
  '대명사·지시어가 가리키는 것 (5지선다)',
  '밑줄 부분과 의미가 가장 가까운 것 (5지선다)',
  '짧은 서술형 — 한·두 문장 답(배점은 해당 블록에만 부여, 정답·채점 기준 제시)',
]

function shuffleParallelTypes(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 블록 수만큼 유형을 무작위 배정. 블록 수 ≤ 풀 크기면 중복 없이, 그보다 많으면 풀을 여러 번 섞어 이어 붙임.
 * @param {number} blockCount
 * @returns {string[]}
 */
export function buildParallelBlockTypePlan(blockCount) {
  const n = Math.max(0, Math.floor(Number(blockCount) || 0))
  if (n === 0) return []
  const pool = [...PARALLEL_BLOCK_TYPE_POOL]
  if (n <= pool.length) return shuffleParallelTypes(pool).slice(0, n)
  const reps = Math.ceil(n / pool.length)
  const extended = []
  for (let r = 0; r < reps; r++) extended.push(...shuffleParallelTypes(pool))
  return extended.slice(0, n)
}

/**
 * 분석표 → slotPlan → 무작위 풀 순으로 유형을 확정한다.
 * examTable이 있으면 가장 신뢰도 높은 소스로 쓰고, 없으면 slotPlan, 마지막으로 무작위.
 * @param {number} blockCount
 * @param {unknown} [templateProfile]
 * @param {{ rows: { type: string }[] } | null} [examTable]
 * @returns {string[]}
 */
export function resolveBlockTypes(blockCount, templateProfile, examTable) {
  const tableRows = Array.isArray(examTable?.rows) ? examTable.rows : []
  const slotPlan = Array.isArray(templateProfile?.slotPlan) ? templateProfile.slotPlan : []
  const randomFallback = buildParallelBlockTypePlan(blockCount)
  return Array.from({ length: blockCount }, (_, i) => {
    const tableType = tableRows[i]?.type
    if (tableType && String(tableType).trim()) {
      return String(tableType).trim()
    }
    const slot = slotPlan[i]
    if (slot?.type && String(slot.type).trim() && String(slot.type).trim() !== '유형 미상') {
      return String(slot.type).trim()
    }
    return randomFallback[i]
  })
}

/** 객관식 제작 톤 — 수능 영어 독해 (기출 변형 시에도 문항 설계는 수능 스타일) */
const CSAT_READING_MC_GUIDE_KO = `**객관식 문항 제작 — 수능 영어 독해 스타일(대학수학능력시험)**
- 지시문은 수능 영어 독해에서 쓰는 **짧고 정형화된 한국어**로 쓴다(예: 「글의 주제로 가장 적절한 것을 고르시오」, 「다음 글의 제목으로 가장 적절한 것을 고르시오」, 「글의 요지로 가장 적절한 것을 고르시오」, 「다음 글에서 전제하고 있는 것으로 가장 적절한 것을 고르시오」 등).
- 선지 ①~⑤는 **영어**로 쓴다. 선지 길이·난이도는 **수능 독해**에 가깝게 맞추고, 한 블록에 과도하게 긴 내신식 장문 선지 다섯 개를 붙이지 않는다.
- **주제·제목·요지** 문항이면 정답 하나는 **글 전체의 중심 내용**과 맞고, 오답은 수능에서 흔히 쓰는 방식(지엽적 사실·본문과 어긋난 일반화·지나친 추론 등)으로 설계한다.
- 함의·빈칸·순서·무관문 등 다른 객관식 유형도 **출제 방식·지시문 톤**은 같은 맥락의 **수능 독해 문항**을 본뜬다.`

/** 빈칸·다중 빈칸: 지문 안에 빈칸 표시가 없으면 실패로 간주 */
const BLANK_IN_PASSAGE_RULE_KO = `**빈칸·(A)(B)(C) 다중 빈칸(삼중 빈칸 결합형 포함) — 반드시 지문 안에 뚫기**
- 유형명에 **빈칸**, **(A)(B)(C)**, **삼중**, **3중**, **연계** 등이 있거나 지시문이 「빈칸 (A), (B), (C)에 들어갈 말/단어」「각각 고르시오」 형태면 **영어 지문 본문 속 해당 문장 위치**에 **(A)_______**, **(B)_______**, **(C)_______** 처럼 **표시와 밑줄(또는 공백)**을 넣어 실제 시험지처럼 빈칸을 낸다. 빈칸 표시는 **지문 아래 따로만** 두지 말고 **글 흐름 안에** 넣는다.
- **정답이 되는 단어·구는 지문 본문에 완전한 형태로 쓰지 말 것** — 선지 ①~⑤(또는 표 형 선지)에만 후보를 제시한다. 지문에 정답 단어가 그대로 보이면 **출제 오류**다.
- **빈칸 1개** 유형이면 본문에 **한 곳**만 \`__________\` 로 뚫는다. 빈칸은 반드시 **본문 문장 안**에 있어야 하며, 지문 밖에 따로 빼 두면 안 된다.
- **밑줄 어휘** 유형은 본문 해당 단어/구에 **밑줄**을 긋고, 빈칸 유형과 혼동하지 않는다.`

const CSAT_MARKING_STYLE_KO = `**수능 영어 표시법 — 모든 동형·변형 문항 공통**
- 모든 문항의 **제작·표현 방식**은 가능한 한 **수능 영어 시험지 표시법**을 따른다.
- **어법상 옳지 않은 부분**을 지문에서 고르게 하는 유형은 **지문 전체를 한 문단**으로 유지한 채, 판단 대상 5곳 앞에 **원문자 ①~⑤**를 직접 붙인다. **정답만 따로 튀지 않도록 ①~⑤ 전부 동일하게 볼드+밑줄**을 넣는다. 즉, 판단 대상 5개 모두 \`**__텍스트__**\` 형식으로 표시한다. **아래 보기(선지)에는 볼드/밑줄을 넣지 않는다.**
- **밑줄 친 부분**을 고르게 하거나 의미를 묻는 유형은, 본문의 해당 단어·구에 반드시 \`__밑줄__\` 마커를 넣는다.
- **흐름과 관계없는 문장**을 고르는 유형도, 판단 대상 문장들 앞에 **원문자 ①~⑤**를 직접 붙여 본문 속에 배치한다.
- 위 유형의 아래 선지는 지문 안 번호와 대응되게 **①, ②, ③, ④, ⑤** 또는 번호 조합형으로 쓴다. 괄호 숫자 \`(1)\`, \`(2)\` 같은 표기는 쓰지 않는다.
- **빈칸형**은 \`( )\` 나 \`____\` 3~4개가 아니라, 반드시 **언더바 10개** \`__________\` 로 표기한다. 다중 빈칸도 \`(A)__________\`, \`(B)__________\` 처럼 쓴다.
- **문장 넣기** 유형은 주어진 문장을 **박스 처리된 독립 줄**로 제시하되, 결과 텍스트에 \`[BOX]\` 같은 표시는 쓰지 않는다. 대신 \`주어진 문장: ...\` 형태의 **한 줄**로만 쓰면 PDF 단계에서 박스로 렌더링된다. 본문 문장과 문장 사이 위치 표시는 **원문자 ①~⑤**를 쓴다. \`(1)\`, \`[1]\`, \`<1>\` 금지.
- **요약문 완성** 유형의 요약문도 **박스 처리된 독립 줄**로 제시한다. 결과 텍스트에는 \`요약: ... __________ ...\` 한 줄만 쓰고, PDF 단계에서 박스로 렌더링된다.
- **문장 순서 배열 / 문단 배열**은 첫 문장(도입문장)을 **(A)(B)(C) 앞 안내문**으로 먼저 제시하고, 나머지를 **(A)(B)(C)** 세 덩어리로 **비등비등한 분량**이 되게 나눈다.
- **본문은 항상 영어만** 인쇄한다. 한국어 해석·요약문 설명이 본문 문단에 섞이면 안 된다.
- **논술형/서술형**은 객관식으로 흉내 내지 말고, 반드시 **별도의 서술형 문항**으로 출제한다. 지시문에 답안 길이(예: 영어 1~2문장)를 명시하고, **①~⑤ 선택지**는 두지 않는다.
- **(A)(B)(C) 빈칸형**은 본문 안에 이미 빈칸이 들어가 있으므로, \`(A)\`, \`(B)\`, \`(C)\` 표식 자체를 볼드 처리하지 않는다.
- 각 문항의 첫 구분선에는 반드시 \`배점: xx점\` 이 들어가야 한다.
- 모델 출력에서 **볼드는 \`**텍스트**\`**, **밑줄은 \`__텍스트__\`**, **볼드+밑줄은 \`**__텍스트__**\`** 형태로 표시한다.`

async function openAiChat(apiKey, body, timeoutMs = 180000) {
  try {
    const out = await geminiGenerateFromOpenAiChatBody(body, apiKey, timeoutMs)
    const text = cleanGeminiTextOutput(out.text || '')
    if (out.finishReason === 'MAX_TOKENS') {
      const tail =
        '\n\n[시스템 안내] 응답이 출력 토큰 한도에 도달해 여기서 끊겼을 수 있습니다. 범위·문항을 나눠 다시 생성해 보세요.'
      return text ? `${text}${tail}` : tail.trim()
    }
    return text
  } catch (e) {
    if (String(e?.message || '').includes('요청 시간 초과')) {
      throw new Error(
        `요청 시간 초과(${Math.round(timeoutMs / 1000)}초) — 잠시 후 다시 시도해 주세요.`
      )
    }
    throw e
  }
}

function parseSchoolJsonResponse(text, fallbackMessage = 'JSON 파싱 실패') {
  try {
    return JSON.parse(extractJsonObjectText(text))
  } catch {
    throw new Error(fallbackMessage)
  }
}

/**
 * @param {{ title: string, english: string, korean: string }[]} items
 * @param {number} maxItems
 * @param {number} maxTotalChars
 */
function formatItemsForPrompt(items, maxItems = 40, maxTotalChars = 120000) {
  const slice = items.slice(-maxItems)
  let total = 0
  const parts = []
  for (let i = 0; i < slice.length; i++) {
    const it = slice[i]
    const t = it.title ? `[${it.title}]` : '(제목 없음)'
    const en = it.english || '(본문 없음)'
    const ko = it.korean || ''
    const block = `${i + 1}. ${t}\n${ko ? `메모: ${ko}\n` : ''}--- 원문/추출본 ---\n${en}`
    if (total + block.length > maxTotalChars) {
      parts.push(`[…이하 ${slice.length - i}건의 기출 원문은 길이 제한으로 생략]`)
      break
    }
    parts.push(block)
    total += block.length
  }
  return parts.join('\n\n========\n\n')
}

function sanitizeTemplateSlotCount(raw, fallback) {
  const n = Math.max(1, Math.floor(Number(raw) || 0))
  return Math.min(30, n || fallback || 12)
}

function normalizeTemplateProfile(raw, schoolName, referencePdf = null) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const slotPlanRaw = Array.isArray(o.slotPlan) ? o.slotPlan : []
  const slotPlan = slotPlanRaw
    .map((s, i) => {
      const item = s && typeof s === 'object' ? s : {}
      return {
        no: Math.max(1, Math.floor(Number(item.no) || i + 1)),
        type: String(item.type || '').trim() || '유형 미상',
        optionStyle: String(item.optionStyle || '').trim(),
        answerStyle: String(item.answerStyle || '').trim(),
        pointHint: String(item.pointHint || '').trim(),
        pageHint: String(item.pageHint || '').trim(),
      }
    })
    .sort((a, b) => a.no - b.no)

  return {
    schoolName: String(o.schoolName || schoolName || '').trim(),
    sourceFileLabel: String(o.sourceFileLabel || referencePdf?.fileLabel || '').trim(),
    pageLayout:
      o.pageLayout && typeof o.pageLayout === 'object' && !Array.isArray(o.pageLayout)
        ? {
            pageCountHint: sanitizeTemplateSlotCount(o.pageLayout.pageCountHint, 2),
            columns: String(o.pageLayout.columns || '2단').trim() || '2단',
            leftColumnRule:
              String(o.pageLayout.leftColumnRule || '같은 쪽 좌단 첫 문항, 나머지는 우단').trim() ||
              '같은 쪽 좌단 첫 문항, 나머지는 우단',
            headerStyle: String(o.pageLayout.headerStyle || '').trim(),
            footerStyle: String(o.pageLayout.footerStyle || '').trim(),
          }
        : {
            pageCountHint: 2,
            columns: '2단',
            leftColumnRule: '같은 쪽 좌단 첫 문항, 나머지는 우단',
            headerStyle: '',
            footerStyle: '',
          },
    numberingStyle:
      o.numberingStyle && typeof o.numberingStyle === 'object' && !Array.isArray(o.numberingStyle)
        ? {
            mainQuestion: String(o.numberingStyle.mainQuestion || '1.').trim() || '1.',
            choices: String(o.numberingStyle.choices || '①~⑤').trim() || '①~⑤',
            inlineMarkers: String(o.numberingStyle.inlineMarkers || '지문 내 ①~⑤ / (A)(B)(C)').trim(),
          }
        : {
            mainQuestion: '1.',
            choices: '①~⑤',
            inlineMarkers: '지문 내 ①~⑤ / (A)(B)(C)',
          },
    choiceStyle:
      o.choiceStyle && typeof o.choiceStyle === 'object' && !Array.isArray(o.choiceStyle)
        ? {
            length: String(o.choiceStyle.length || '').trim(),
            tone: String(o.choiceStyle.tone || '').trim(),
            comboUsage: String(o.choiceStyle.comboUsage || '').trim(),
          }
        : { length: '', tone: '', comboUsage: '' },
    scoreStyle:
      o.scoreStyle && typeof o.scoreStyle === 'object' && !Array.isArray(o.scoreStyle)
        ? {
            total: Number(o.scoreStyle.total) || 100,
            pattern: String(o.scoreStyle.pattern || '').trim(),
            difficultyCurve: String(o.scoreStyle.difficultyCurve || '').trim(),
          }
        : { total: 100, pattern: '', difficultyCurve: '' },
    slotPlan,
    compositionRules: Array.isArray(o.compositionRules)
      ? o.compositionRules.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
  }
}

function splitParallelDraftBlocks(text) {
  const s = String(text || '').trim()
  if (!s) return []
  return s.split(/\n(?=====)/).map((x) => x.trim()).filter(Boolean)
}

function extractParallelQuestionNos(text) {
  return splitParallelDraftBlocks(text)
    .map((block) => {
      const m = block.match(/^=====?\s*문항\s*(\d+)/i)
      return m ? Number(m[1]) : null
    })
    .filter((n) => Number.isFinite(n))
}

function validateParallelDraftLocally(draftText, blockCount) {
  const text = String(draftText || '').trim()
  if (!text) {
    return { ok: false, issues: ['초안이 비어 있습니다.'] }
  }
  const blocks = splitParallelDraftBlocks(text)
  const nos = extractParallelQuestionNos(text)
  const issues = []
  if (nos.length !== blockCount) {
    issues.push(`문항 블록 수가 ${nos.length}개로, 요구된 ${blockCount}개와 다릅니다.`)
  }
  for (let i = 1; i <= blockCount; i++) {
    if (!nos.includes(i)) {
      issues.push(`문항 ${i} 블록이 없습니다.`)
    }
  }
  if (!/^=====?\s*정답표/i.test(text) && !/\n=====?\s*정답표/i.test(text)) {
    issues.push('정답표 블록이 없습니다.')
  }
  const missingPoints = blocks
    .filter((block) => /^=====?\s*문항\s*\d+/i.test(block))
    .filter((block) => !/^=====?\s*문항\s*\d+.*배점\s*:\s*[^|=\n]+/i.test(block))
    .map((block) => block.match(/^=====?\s*문항\s*(\d+)/i)?.[1])
    .filter(Boolean)
  if (missingPoints.length > 0) {
    issues.push(`배점이 없는 문항이 있습니다: ${missingPoints.join(', ')}`)
  }
  blocks
    .filter((block) => /^=====?\s*문항\s*\d+/i.test(block))
    .forEach((block) => {
      const no = block.match(/^=====?\s*문항\s*(\d+)/i)?.[1] || '?'
      const isBlankType = /유형\s*:\s*.*빈칸|유형\s*:\s*.*\(A\)\(B\)\(C\)|빈칸에 들어갈|요약문 빈칸/i.test(block)
      if (isBlankType && !/_{10,}|\(A\)_{10,}|\(B\)_{10,}|\(C\)_{10,}/.test(block)) {
        issues.push(`문항 ${no}는 빈칸형인데 본문 내 빈칸 표시가 없습니다.`)
      }

      const isEssayType = /유형\s*:\s*.*(논술|서술)|영어로\s*1-?2문장|한두 문장 답|답하시오\./i.test(block)
      if (isEssayType && /(?:^|\n)\s*①/.test(block)) {
        issues.push(`문항 ${no}는 논술/서술형인데 객관식 선지가 들어가 있습니다.`)
      }

      const isGrammarType = /유형\s*:\s*.*어법|어법상 틀린 부분|어법상 옳지 않은 부분/i.test(block)
      if (isGrammarType) {
        const boldUnderlinedChoices = block.match(/[①②③④⑤]\s*\*\*__.+?__\*\*/g) || []
        if (boldUnderlinedChoices.length < 5) {
          issues.push(`문항 ${no} 어법 표시는 ①~⑤ 모두 본문에서 볼드+밑줄이어야 합니다.`)
        }
      }
    })
  const answerBlock = blocks.find((block) => /^=====?\s*정답표/i.test(block))
  if (answerBlock) {
    const answerRows = answerBlock
      .split(/\r?\n/)
      .map((line) => String(line || '').trim())
      .filter((line) => /^\d+\t/.test(line) || /^\d+\s*\|/.test(line))
    if (answerRows.length !== blockCount) {
      issues.push(`정답표 행 수가 ${answerRows.length}개로, 요구된 ${blockCount}개와 다릅니다.`)
    }
  }
  return { ok: issues.length === 0, issues }
}

function buildParallelAnswerTableFromRows(rows) {
  const body = rows
    .sort((a, b) => a.no - b.no)
    .map((r) =>
      `${r.no}\t${String(r.answer || '').trim()}\t${String(r.points || '').trim()}\t${String(
        r.briefExplanation || ''
      ).trim()}`
    )
  return [
    '===== 정답표 (PDF 말미) =====',
    '※ 시험지 PDF 끝에 붙이는 요약 정답표입니다.',
    '문항\t정답\t배점\t채점 요지',
    ...body,
  ].join('\n')
}

function formatTemplateProfileForPrompt(templateProfile, blockCount) {
  if (!templateProfile || typeof templateProfile !== 'object') return ''
  const slots = Array.isArray(templateProfile.slotPlan) ? templateProfile.slotPlan : []
  const pickedSlots = slots.slice(0, Math.max(0, blockCount || 0))
  const pageLayout = templateProfile.pageLayout || {}
  const numberingStyle = templateProfile.numberingStyle || {}
  const choiceStyle = templateProfile.choiceStyle || {}
  const scoreStyle = templateProfile.scoreStyle || {}
  const rules = Array.isArray(templateProfile.compositionRules) ? templateProfile.compositionRules : []

  return `=== 학교별 시험 템플릿 프로필 (기출 PDF 기반 요약) ===
- 학교: ${templateProfile.schoolName || '(미상)'}
- 참고 파일명: ${templateProfile.sourceFileLabel || '(미상)'}
- 페이지 감: 약 ${pageLayout.pageCountHint || '?'}쪽 · ${pageLayout.columns || '2단'} · ${pageLayout.leftColumnRule || ''}
- 머리말 스타일: ${pageLayout.headerStyle || '(미상)'}
- 바닥글 스타일: ${pageLayout.footerStyle || '(미상)'}
- 문항 번호 스타일: ${numberingStyle.mainQuestion || '1.'}
- 선지 번호 스타일: ${numberingStyle.choices || '①~⑤'}
- 지문 내 표식: ${numberingStyle.inlineMarkers || '(미상)'}
- 보기 길이·톤: ${choiceStyle.length || '(미상)'} / ${choiceStyle.tone || '(미상)'}
- 조합형 사용: ${choiceStyle.comboUsage || '(미상)'}
- 배점 패턴: ${scoreStyle.pattern || '(미상)'}
- 난도 상승 곡선: ${scoreStyle.difficultyCurve || '(미상)'}
${rules.length ? `- 추가 규칙:\n${rules.map((r) => `  • ${r}`).join('\n')}` : '- 추가 규칙: (없음)'}

=== 이번 시험에서 우선 따라야 할 문항 슬롯 순서 ===
${pickedSlots.length ? pickedSlots.map((s) => `- 문항 ${s.no}: ${s.type}${s.optionStyle ? ` / 보기형식 ${s.optionStyle}` : ''}${s.pointHint ? ` / 배점감 ${s.pointHint}` : ''}${s.pageHint ? ` / 위치 ${s.pageHint}` : ''}`).join('\n') : '- 추출된 슬롯 정보 없음' }

이 슬롯 순서는 **기출 번호 직접 매칭이 없는 범위**에서 우선 적용한다. 즉, 사용자가 [범위 n] 제목에 기출 번호를 넣지 않았으면, 이번 출력의 문항 n은 위 슬롯 순서의 n번 스타일을 최대한 따른다.`
}

async function openAiJson(apiKey, body, timeoutMs = 180000) {
  const response = await openAiChat(apiKey, { ...body, response_format: { type: 'json_object' } }, timeoutMs)
  return parseSchoolJsonResponse(response, 'JSON 파싱 실패')
}

/** 기출 패턴 분석 출력 뼈대 — 아래 참고 예시와 같은 촘촘함·톤을 목표로 함 (단, 다른 시험 내용을 베끼지 말 것) */
const ANALYSIS_STRUCTURE_KO = `반드시 아래 **섹션 제목을 그대로** 쓰고, 제공된 기출(텍스트 추출·이미지 전사)에서 **확인되는 범위만** 채우세요. 없으면 해당 소절에 "제공된 자료에서 확인 불가"라고 적으세요.

## 1. 단일 PDF·스캔본 특성
- 스캔 방향(가로/세로), 해상도·가독성, 필기·얼룩이 보이는지, 페이지마다 동일한지.
- (두 개 이상 PDF를 합쳐 넣은 경우에만) 출처별 차이를 한 줄로 구분해도 됨. **별도의 '대조 분석'은 하지 말 것.**

## 2. 시험지 물리 구조
- footer/쪽 번호 기준 실제 시험 본문이 몇 쪽~몇 쪽인지, 맨 뒤 빈 쪽·불필요 페이지 여부.

## 3. 문항 구성·배점
- 선택형·논술형(또는 서술형) 문항 수, **총점은 반드시 100점 만점**으로 정리(원문에 98점 등으로 보이면 100점제로 재배치·추정했다고 한 줄 명시), 구간별 배점 합.

## 4. 전체 난이도·유형 설계 흐름
- 앞쪽→뒤쪽으로 어떤 능력(어휘, 요지, 어법, 빈칸/흐름, 순서·무관문, 고난도 서술 등)을 어떻게 쌓는지 한 단락으로.

## 5. 페이지별 상세
- **1쪽, 2쪽, …** 식으로 각 쪽마다: 좌/우 단 구성, 문항 번호, 유형 이름, 배점(있으면), 보기 형식(5지 문장형/단어형/번호조합/삽입·순서 등), 지문·선지 길이 감상.

## 6. 보기 길이·형식만 따로 정리
- **짧은 보기**에 해당하는 유형 번호들(본문 의존도 높은 유형).
- **긴 보기(완전 문장형 선지)**에 해당하는 문항 구간.
- 논술형은 보기 대신 **답 길이·형식 제한**(단어 수 제한 등)이 어떻게 설계됐는지.

## 7. 출제 의도·레이아웃
- 주제 분포, "읽기→생산" 전환, 시각 밀도(빽빽한 구간 vs 답안 여백) 등 시험지 설계 관찰.

## 8. 동형·변형 출제 시 권장 규칙 (bullet 5~10줄)
- 위 분석을 바탕으로 앞으로 비슷한 시험을 만들 때 지킬 것.`

/**
 * 누적 기출(PDF 추출·전사 텍스트 포함)을 바탕으로 시험지 구조·유형·배점 심층 분석
 * @param {string} apiKey
 * @param {string} schoolName
 * @param {{ title: string, english: string, korean: string }[]} items
 */
export async function analyzeSchoolPastPattern(apiKey, schoolName, items) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  if (!items.length) throw new Error('분석할 기출이 없습니다. PDF를 먼저 등록해 주세요.')

  const catalog = formatItemsForPrompt(items, 25, 110000)
  const user = `학교(또는 시험 묶음 이름): "${schoolName}"

아래는 **시험지 PDF 한 부**에서 추출한 텍스트 또는 스캔 이미지를 Vision으로 전사한 텍스트입니다. OCR·전사 오류가 있을 수 있으나, 그 안에서 구조를 최대한 복원하세요.

**배점 규칙:** 이 학교·시험의 만점은 **항상 100점**으로 서술할 것. 인쇄물·전사본에 합계가 100이 아니게 보이면, 100점 만점에 맞게 조정한 배점표를 제시하고 그 근거를 짧게 적을 것.

--- 누적 기출 원문(추출/전사) ---
${catalog}

--- 참고: 분석 깊이·서술 스타일의 기준(과천고 내신 사례 예시) ---
아래 블록은 **한국 고등 내신 영어 시험지를 어떤 촘촘함으로 분석할지** 보여 주는 참고용입니다. 문항 번호·주제·배점 등 **구체 수치는 이 시험 전용**이므로 그대로 옮기지 마세요. 다만 **총점은 항상 100점 만점**으로 맞추어 서술하는 태도는 따를 것. **같은 수준의 세부 서술**(좌우 단, 유형명, 보기 형식, 선지 길이, 논술 답 길이 제한, 레이아웃·출제 의도)으로, 위 추출/전사본에 맞게 채우세요.

${ANALYSIS_STYLE_REFERENCE_KO}

--- 출력 목차(위 참고와 같은 밀도로 채울 것) ---
${ANALYSIS_STRUCTURE_KO}

출력은 **한국어**만 사용. 불필요한 서문 없이 목차 순서대로 작성.`

  return openAiChat(
    apiKey,
    {
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert on Korean high school English 내신 exam papers. Gemini priority: reconstruct structure faithfully from noisy OCR/PDF text, separate certainty from uncertainty, and reply in Korean only.',
        },
        { role: 'user', content: user },
      ],
      temperature: 0.18,
      max_tokens: 16384,
    },
    420000
  )
}

/**
 * 기출 분석문 + 원문에서 유형별 세부분석 표(JSON)를 추출한다.
 * @param {string} apiKey
 * @param {string} schoolName
 * @param {string} analysisText
 * @param {{ title: string, english: string, korean: string }[]} items
 */
export async function buildExamAnalysisTable(apiKey, schoolName, analysisText, items) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  const analysis = String(analysisText || '').trim()
  if (!analysis) throw new Error('분석 텍스트가 없습니다.')

  const itemExcerpt = formatItemsForPrompt(items || [], 6, 24000)

  const prompt = `학교: ${schoolName}

아래 기출 분석문과 원문을 읽고, 시험지의 **문항별 유형 분석표**를 JSON으로 만드시오.

반드시 아래 JSON 스키마만 채워라:
{
  "rows": [
    {
      "no": "1번",
      "type": "어법",
      "difficulty": "중",
      "source": "교과서",
      "characteristics": "의문문 만들기",
      "variation": "",
      "points": "5.0"
    }
  ]
}

**핵심: 시험지의 모든 문항을 빠짐없이 한 행씩 넣는다.** 객관식 1번부터 마지막 번호까지, 서술형이 있으면 서술형 전 문항까지, 총 문항 수와 rows 길이가 정확히 일치해야 한다. 요약·생략 금지.

규칙:
- rows는 시험지 문항 순서대로 나열한다. 객관식(1번~N번) 먼저, 이어서 서술형(서술형 1~M). **한 문항도 건너뛰지 말 것.**
- no: 문항 번호 (예: "1번", "2번", …, "서술형 1", "서술형 2")
- type: 유형명. 다음 중 해당하는 것: 어법, 어휘, 빈칸, 순서, 주제/제목, 일치불일치, 문장삽입, 질문의 답, 문장고치기, 질문답 영작, 대명사/지시어, 요약문 완성, 밑줄 의미 파악, 알 수 없는 질문, 어순, 문장완성 등. 분석에서 쓰인 이름을 그대로 적되 가능하면 위 목록의 이름을 쓴다.
- difficulty: "하" / "중" / "상". 분석에서 난이도가 서술되어 있으면 반영, 아니면 배점·유형으로 추정.
- source: 출처 (교과서, 본문, 대화문, 교과서 본문 등). 확인 불가하면 빈 문자열.
- characteristics: 출제 특징 (짧게. 예: "접속사, 전치사 고르기", "Point 수일치, 준동사 vs 동사"). 없으면 빈 문자열.
- variation: 변형 방식 제안 (예: "동일 유형 변형", "유형 유지+지문 교체" 등). 없으면 빈 문자열.
- points: 배점 (숫자 문자열, 예: "3.0", "4.0", "5.0"). 분석에서 확인 불가하면 빈 문자열.
- 분석에서 확인 불가한 항목은 빈 문자열로 둔다.
- **rows를 "…" 이나 생략으로 줄이지 말 것. 25문항이면 25행, 30문항이면 30행.**
- JSON 외 텍스트 금지.

분석문:
${analysis}

기출 원문 일부:
${itemExcerpt || '(없음)'}`

  let result
  try {
    result = await openAiJson(
      apiKey,
      {
        model: MODEL_TEMPLATE_PROFILE,
        messages: [
          {
            role: 'system',
            content:
              'You extract a structured exam analysis table from Korean school English exam analysis text. Return only one valid JSON object matching the requested schema. Prefer empty strings to risky guesses.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 12000,
      },
      240000
    )
  } catch (jsonErr) {
    console.warn('분석표 JSON 파싱 실패, 빈 테이블 반환:', jsonErr)
    return { rows: [] }
  }

  const rows = Array.isArray(result?.rows) ? result.rows : []
  return {
    rows: rows.map((r, i) => ({
      no: String(r?.no || `${i + 1}번`).trim(),
      type: String(r?.type || '').trim(),
      difficulty: String(r?.difficulty || '').trim(),
      source: String(r?.source || '').trim(),
      characteristics: String(r?.characteristics || '').trim(),
      variation: String(r?.variation || '').trim(),
      points: String(r?.points || '').trim(),
    })),
  }
}

/**
 * 기출 PDF 분석문 + 원문 일부를 바탕으로 학교별 시험지 템플릿 요약(JSON)을 만든다.
 * @param {string} apiKey
 * @param {string} schoolName
 * @param {string} analysisText
 * @param {{ title: string, english: string, korean: string }[]} items
 * @param {{ widthMm?: number, heightMm?: number, pageCount?: number, fileLabel?: string } | null} [referencePdf]
 */
export async function buildSchoolTemplateProfile(
  apiKey,
  schoolName,
  analysisText,
  items,
  referencePdf = null
) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  const analysis = String(analysisText || '').trim()
  if (!analysis) throw new Error('학교 템플릿을 만들 분석 텍스트가 없습니다.')
  const itemExcerpt = formatItemsForPrompt(items || [], 6, 24000)
  const refLine =
    referencePdf && (referencePdf.fileLabel || referencePdf.widthMm || referencePdf.pageCount)
      ? `파일명 라벨: ${referencePdf.fileLabel || '(없음)'} / 첫 쪽 mm: ${referencePdf.widthMm || '?'}×${referencePdf.heightMm || '?'} / 총 ${referencePdf.pageCount || '?'}쪽`
      : '(참고 PDF 메타 없음)'

  const prompt = `학교: ${schoolName}

목표:
아래 기출 분석문과 원문 일부를 읽고, 이 학교 시험지를 새 범위로 "거의 같은 학교 시험처럼" 재현할 때 쓸 간결한 템플릿 JSON을 만드시오.

반드시 아래 JSON 스키마만 채워라:
{
  "schoolName": "...",
  "sourceFileLabel": "...",
  "pageLayout": {
    "pageCountHint": 2,
    "columns": "2단",
    "leftColumnRule": "...",
    "headerStyle": "...",
    "footerStyle": "..."
  },
  "numberingStyle": {
    "mainQuestion": "1.",
    "choices": "①~⑤",
    "inlineMarkers": "..."
  },
  "choiceStyle": {
    "length": "짧음/중간/김",
    "tone": "...",
    "comboUsage": "..."
  },
  "scoreStyle": {
    "total": 100,
    "pattern": "...",
    "difficultyCurve": "..."
  },
  "slotPlan": [
    { "no": 1, "type": "...", "optionStyle": "...", "answerStyle": "...", "pointHint": "...", "pageHint": "..." }
  ],
  "compositionRules": ["...", "..."]
}

규칙:
- slotPlan은 기출의 앞에서부터 핵심 문항 순서만 6~20개 정도 요약한다.
- "type"은 학생이 체감하는 시험유형 이름으로 구체적으로 적는다. 예: "지문 밑줄 ①~⑤ 중 어법상 어색한 것", "주제", "빈칸", "문장삽입", "순서배열", "서술형 영작".
- header/footer/번호/선지/조합형 사용 습관을 최대한 학교답게 요약한다.
- 모르면 추정하지 말고 짧게 "확인 불가" 또는 빈 문자열로 둔다.
- JSON 외 텍스트 금지.

참고 PDF 메타:
${refLine}

분석문:
${analysis}

기출 원문 일부:
${itemExcerpt || '(없음)'}` 

  const result = await openAiJson(
    apiKey,
    {
      model: MODEL_TEMPLATE_PROFILE,
      messages: [
        {
          role: 'system',
          content:
            'You extract a reusable Korean school exam template profile from analysis text. Return only one valid JSON object matching the requested schema. Prefer empty strings to risky guesses.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    },
    180000
  )
  return normalizeTemplateProfile(result, schoolName, referencePdf)
}

async function verifyParallelMockExamDraft(
  apiKey,
  schoolName,
  templateProfile,
  scopeItems,
  draftText
) {
  const prompt = `학교: ${schoolName}

다음 "학교별 시험 템플릿 프로필"과 "출제 범위"를 기준으로, 아래 생성 초안이 학교 기출 느낌을 충분히 따르는지 점검하시오.

반드시 JSON만 반환:
{
  "ok": true,
  "issues": ["..."],
  "revisionNeeds": ["..."]
}

주요 점검:
- 문항 번호 1..N 연속 여부
- title 번호 직접 매칭 또는 slotPlan 순서가 반영되었는지
- 학교식 번호/선지/조합형/지문 내 표식 스타일이 맞는지
- 같은 학교 시험처럼 보이는지(유형 순서·배점감·보기 길이·레이아웃용 구분선)
- 정답/해설이 문항 블록 안에 새어 나오지 않았는지
- 정답표가 마지막에 한 번만 있는지

판정 규칙:
- 명백하고 구체적인 위반만 ok=false로 표시한다.
- item 번호나 블록을 특정할 수 없는 모호한 인상비평은 ok=true로 둔다.
- 수정 지시가 있다면 짧고 실행 가능하게 쓴다.

학교별 시험 템플릿 프로필:
${JSON.stringify(templateProfile || {}, null, 2)}

출제 범위:
${scopeItems
  .map((it, i) => `[범위 ${i + 1}] ${it.title || ''}\n영어: ${String(it.english || '').slice(0, 1200)}`)
  .join('\n\n---\n\n')}

생성 초안:
${draftText}`

  const result = await openAiJson(
    apiKey,
    {
      model: MODEL_TEMPLATE_VERIFY,
      messages: [
        {
          role: 'system',
          content:
            'You are a conservative verifier for Korean school parallel mock exams. Return only JSON. Fail only on concrete, block-specific issues.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.05,
      max_tokens: 2200,
    },
    PARALLEL_MOCK_VERIFY_TIMEOUT_MS
  )
  const rawIssues = Array.isArray(result?.issues)
    ? result.issues.map((x) => String(x || '').trim()).filter(Boolean)
    : []
  const rawRevisionNeeds = Array.isArray(result?.revisionNeeds)
    ? result.revisionNeeds.map((x) => String(x || '').trim()).filter(Boolean)
    : []
  const concreteIssues = rawIssues.filter((x) => /문항\s*\d+|block\s*\d+|번호|정답표/i.test(x))
  return {
    ok: result?.ok === true || concreteIssues.length === 0,
    issues: concreteIssues,
    revisionNeeds: rawRevisionNeeds,
  }
}

async function reviseParallelMockExamDraft(
  apiKey,
  schoolName,
  templateProfile,
  scopeItems,
  draftText,
  verifyResult
) {
  const prompt = `학교: ${schoolName}

아래 초안을 학교별 시험 템플릿에 더 가깝게 "수정본 전체"로 다시 쓰시오.

수정 요구:
${(verifyResult?.issues || []).map((x) => `- ${x}`).join('\n') || '- 없음'}
${(verifyResult?.revisionNeeds || []).map((x) => `- ${x}`).join('\n') || ''}

반드시 지킬 점:
- 출력은 전체 수정본 텍스트만. 설명 금지.
- 범위 영어 지문은 그대로 유지, 필요한 시험표시만 수정
- 문항 블록 안에는 정답·해설 금지
- 정답표는 마지막 한 번만
- 문항 1부터 ${scopeItems.length}까지 **한 문제도 빠뜨리지 말고 전부** 포함할 것. 초안에 누락된 번호가 있으면 반드시 새로 채워 넣을 것.
- 학교별 시험 템플릿의 slotPlan / 번호 / 보기 형태 / 배점감 / 기출 느낌을 최대한 반영
- 아래 **수능 영어 표시법**도 반드시 반영할 것. 특히 어법 문항의 \`① **__오류 부분__**\`, 빈칸형의 \`__________\`, 문장 넣기의 \`주어진 문장: ...\` 박스 줄과 \`①~⑤\` 위치 표시는 유지/보정할 것.

학교별 시험 템플릿 프로필:
${JSON.stringify(templateProfile || {}, null, 2)}

수능 영어 표시법:
${CSAT_MARKING_STYLE_KO}

출제 범위:
${scopeItems
  .map((it, i) => `[범위 ${i + 1}] ${it.title || ''}\n영어: ${String(it.english || '').slice(0, 1200)}`)
  .join('\n\n---\n\n')}

초안:
${draftText}`

  return openAiChat(
    apiKey,
    {
      model: MODEL_PARALLEL_MOCK_EXAM,
      messages: [
        {
          role: 'system',
          content:
            'You revise a full Korean school parallel mock exam draft to better match the school template. Gemini priority: preserve structure, keep every question block, and output only the full revised plain text draft. Preserve CSAT-style markup such as ①~⑤, inline blank underscores, __underlines__, and **__bold underlined__** spans. Do not print literal [BOX] labels.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.24,
      max_tokens: PARALLEL_MOCK_MAX_OUTPUT_TOKENS,
    },
    PARALLEL_MOCK_TIMEOUT_MS
  )
}

/**
 * 동형 모의고사에서 한 문항만 다시 생성
 * @param {string} apiKey
 * @param {string} schoolName
 * @param {string} analysisText
 * @param {{ title: string, english: string, korean: string }[]} bankItems
 * @param {{ title: string, english: string, korean: string }} scopeItem
 * @param {string} [cumulativeSchoolProfile]
 * @param {unknown} [templateProfile]
 * @param {number} [questionNo]
 * @param {number} [totalQuestionCount]
 * @param {string} [existingQuestionBlock]
 * @param {string} [currentDraftText]
 * @param {string} [assignedType] 이 문항에 사전 배정된 유형
 */
export async function regenerateParallelMockQuestion(
  apiKey,
  schoolName,
  analysisText,
  bankItems,
  scopeItem,
  cumulativeSchoolProfile = '',
  templateProfile = null,
  questionNo = 1,
  totalQuestionCount = 1,
  existingQuestionBlock = '',
  currentDraftText = '',
  assignedType = ''
) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  if (!scopeItem?.english) throw new Error('재생성할 범위 지문이 없습니다.')

  const bankExcerpt = formatItemsForPrompt(bankItems, 8, 35000)
  const cum = String(cumulativeSchoolProfile || '').trim()
  const templateBlock = formatTemplateProfileForPrompt(templateProfile, totalQuestionCount)
  const typeLabel = String(assignedType || '').trim()
  const scopeBlock = `[범위] ${scopeItem.title || '제목 없음'}${typeLabel ? ` | ★유형: ${typeLabel}` : ''}\n영어: ${scopeItem.english || ''}\n한글: ${scopeItem.korean || ''}`

  const prompt = `학교: "${schoolName}"

목표:
이미 생성된 동형 모의고사 중 **문항 ${questionNo} 하나만** 새 버전으로 다시 작성한다.
${typeLabel ? `\n**확정 유형: ${typeLabel}** — 이 유형을 반드시 따를 것. 임의 변경 금지.\n` : ''}

${templateBlock || '=== 학교별 시험 템플릿 프로필 ===\n(없음)\n'}

=== 누적 분석 ===
${cum || '(없음)'}

=== 이번 분석 칸 ===
${analysisText || '(없음)'}

=== 기출 원문 일부 ===
${bankExcerpt || '(없음)'}

=== 이번 문항에 해당하는 시험 범위 ===
${scopeBlock}

=== 현재 전체 초안(스타일 참고용, 다른 문항은 건드리지 말고 문항 ${questionNo}의 톤만 맞추기) ===
${currentDraftText || '(없음)'}

=== 현재 문항 ${questionNo} 초안 (문제점이 있을 수 있음) ===
${existingQuestionBlock || '(없음)'}

지시:
- 오직 **문항 ${questionNo} 하나**만 다시 만든다.
- ${typeLabel ? `확정 유형 **${typeLabel}**로 만든다.` : '학교 템플릿 slotPlan의 문항 ' + questionNo + ' 스타일을 우선 따른다.'}
- 지문 영어는 사용자 입력 원문을 그대로 유지하고, 필요한 시험 표시만 수정한다.
- 문항 블록 안에는 정답/해설 금지.
- 아래 **수능 영어 표시법**을 반드시 반영한다. 특히 어법 오류 표시 \`① **__오류 어구__**\`, 빈칸형 \`__________\`, 문장 넣기 \`주어진 문장: ...\` 박스 줄 + 본문 사이 \`①~⑤\`를 지킨다.
- 아래 JSON만 반환하라:
{
  "questionBlock": "===== 문항 ${questionNo} | ... =====\\n...",
  "answer": "②",
  "points": "3.6",
  "briefExplanation": "한 줄 해설 또는 채점 요지"
}

검사:
- questionBlock는 반드시 "===== 문항 ${questionNo}"로 시작
- answer는 ①~⑤ 또는 "(서술)"
- points는 숫자 문자열
- briefExplanation은 짧게

${CSAT_MARKING_STYLE_KO}`

  const result = await openAiJson(
    apiKey,
    {
      model: MODEL_PARALLEL_MOCK_EXAM,
      messages: [
        {
          role: 'system',
          content:
            'You rewrite only one question block for a Korean school parallel mock exam. Return only JSON with questionBlock/answer/points/briefExplanation. Keep the block structurally complete and never include answer/explanation inside questionBlock. Follow Korean CSAT English exam notation, including ①~⑤, underscore blanks, __underlines__, and **__bold underlined__** spans.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.34,
      max_tokens: 8000,
    },
    PARALLEL_MOCK_TIMEOUT_MS
  )

  const questionBlock = String(result?.questionBlock || '').trim()
  if (!questionBlock || !questionBlock.startsWith(`===== 문항 ${questionNo}`)) {
    throw new Error(`문항 ${questionNo} 재생성 형식이 올바르지 않습니다.`)
  }
  return {
    questionBlock,
    answer: String(result?.answer || '').trim() || '(미상)',
    points: String(result?.points || '').trim() || '',
    briefExplanation: String(result?.briefExplanation || '').trim(),
  }
}

async function rebuildParallelMockExamBySingleQuestions(
  apiKey,
  schoolName,
  analysisText,
  bankItems,
  scopeItems,
  cumulativeSchoolProfile,
  templateProfile,
  currentDraftText = '',
  resolvedTypes = null
) {
  const types = Array.isArray(resolvedTypes) ? resolvedTypes : resolveBlockTypes(scopeItems.length, templateProfile)
  const rows = []
  const blocks = []
  for (let i = 0; i < scopeItems.length; i++) {
    const questionNo = i + 1
    const one = await regenerateParallelMockQuestion(
      apiKey,
      schoolName,
      analysisText,
      bankItems,
      scopeItems[i],
      cumulativeSchoolProfile,
      templateProfile,
      questionNo,
      scopeItems.length,
      '',
      currentDraftText,
      types[i] || ''
    )
    rows.push({
      no: questionNo,
      answer: one.answer,
      points: one.points,
      briefExplanation: one.briefExplanation,
    })
    blocks.push(one.questionBlock)
  }
  blocks.push(buildParallelAnswerTableFromRows(rows))
  return blocks.join('\n\n')
}

/**
 * @param {string} apiKey
 * @param {string} schoolName
 * @param {string} analysisText
 * @param {{ title: string, english: string, korean: string }[]} bankItems
 * @param {{ title: string, english: string, korean: string }[]} scopeItems
 * @param {string} [cumulativeSchoolProfile] 학교별 누적 분석(여러 회 PDF 분석이 쌓인 텍스트)
 * @param {unknown} [templateProfile] 학교별 시험 템플릿 프로필(JSON)
 * @param {string[]} [resolvedTypes] resolveBlockTypes()로 사전 결정한 블록별 유형
 */
export async function generateParallelMockExam(
  apiKey,
  schoolName,
  analysisText,
  bankItems,
  scopeItems,
  cumulativeSchoolProfile = '',
  templateProfile = null,
  resolvedTypes = null
) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  if (!scopeItems.length) throw new Error('이번 시험 범위(제목/영어/한글)를 입력해 주세요.')

  const blockCount = scopeItems.length
  const types = Array.isArray(resolvedTypes) && resolvedTypes.length === blockCount
    ? resolvedTypes
    : resolveBlockTypes(blockCount, templateProfile)

  const bankExcerpt = formatItemsForPrompt(bankItems, 6, 20000)
  const scopeWithTypes = scopeItems
    .map((it, i) => {
      return `[범위 ${i + 1}] ${it.title || '제목 없음'} | ★유형: ${types[i]}\n영어: ${it.english || ''}\n한글: ${it.korean || ''}`
    })
    .join('\n\n---\n\n')

  const cum = String(cumulativeSchoolProfile || '').trim().slice(0, 30000)
  const templateBlock = formatTemplateProfileForPrompt(templateProfile, blockCount)
  const typeList = types.map((t, i) => `- 문항 ${i + 1}: ${t}`).join('\n')

  const user = `학교 맥락: "${schoolName}"

=== 학교별 누적 기출 패턴 노트 ===
${cum || '(아직 없음)'}
${cum ? '\n위 노트를 참고해 이 학교 내신에 가깝고 특징이 뚜렷한 동형·변형 시험을 만드세요.\n' : ''}

${templateBlock || '=== 학교별 시험 템플릿 프로필 ===\n(없음)\n'}

=== 이번 분석 ===
${analysisText || '(없음)'}

=== 기출 원문 일부 ===
${bankExcerpt || '(없음)'}

=== 이번 시험 출제 범위 · 블록별 확정 유형 ===
총 **${blockCount}개** 블록. 각 블록은 ★유형에 표시된 유형으로 **정확히 1문항**만 만든다.

${scopeWithTypes}

=== 확정 유형 요약 (변경 금지) ===
${typeList}
위 유형은 학교 기출 템플릿에서 추출했거나 무작위 배정된 것이다. **임의로 바꾸지 말 것.** 지문과 유형이 어울리지 않으면 같은 유형 안에서 지시문·보기만 조정한다.

${CSAT_READING_MC_GUIDE_KO}

${BLANK_IN_PASSAGE_RULE_KO}

${CSAT_MARKING_STYLE_KO}

=== 과제 ===
영어 **독해** 시험지 제작. 문항 지시문·선지·오답 설계는 **수능 영어 독해** 스타일, 학교 기출 분석은 지문 길이·배점감·유형 분포·보기 형식 참고용. 결과는 **학교 시험지 레이아웃 PDF**에 옮길 예정.

**지문(본문) — 최우선**
- 범위의 **영어(english)** 지문은 원문 그대로(글자·철자·구두점·줄바꿈까지) 출력. 의역·요약·앞뒤 자르기 금지.
- 허용되는 수정은 출제용 표시뿐: 빈칸(____), 밑줄, ①~⑤, (A)(B)(C) 블록 구분, 어법 오류 표시 등.
- 빈칸·삼중 빈칸 유형은 위 빈칸 규칙을 반드시 준수(지문 안에 빈칸 뚫기, 정답 단어 지문 노출 금지).
- **한글(korean)**은 출제 의도 파악용이며 출력에 포함하지 않는다.
- 생략·중략·"…"·요약본 치환 금지. 각 블록마다 영어 지문 전부 실을 것.

**출력 형식**
- 각 문항: \`===== 문항 n | [범위 n 제목] | 배점: xx점 | 유형: … =====\`
  → 한국어 지시문 → 영어 지문(출제 표시 포함) → 보기(객관식이면 ①~⑤).
- 문항 번호 1~${blockCount} 연속·누락 없이. 한 블록에 한 문항만.
- 지시문 어투·보기 길이·번호 스타일은 학교 템플릿 프로필에 맞추기.
- **객관식 문항 블록에 정답·해설 절대 금지**(학생용 PDF). 정답은 맨 뒤 정답표에만.
- 서술형은 답 길이·채점 기준을 지시문에 명시.

**배점**: 총 ${blockCount}문항, 합계 정확히 **100점**. 소수 첫째 자리까지 허용.

**정답표 (맨 뒤 필수)**
- 마지막에 \`===== 정답표 (PDF 말미) =====\` 블록 한 번만.
- 탭 구분: \`문항\\t정답\\t배점\` (서술형이면 \`채점 요지\` 열 추가 가능).
- 문항 1~${blockCount} · 정답 ①~⑤ 또는 (서술) · 배점 합 100.

**금지**: 지문 발췌/요약/짧게 다시 쓰기 · 한 블록에 2문항 이상 · 빈칸형인데 본문에 빈칸 미표시 · 범위 한글 해석 출력 · 기출 문항·보기 문장 그대로 복제.
마크다운 코드블록 없이 일반 텍스트. 문항 1~${blockCount} + 정답표까지 한 번에 출력.`

  let draft = await openAiChat(
    apiKey,
    {
      model: MODEL_PARALLEL_MOCK_EXAM,
      messages: [
        {
          role: 'system',
          content:
            'You assemble English reading exam items for Korean schools. Gemini priority: preserve every scope block, preserve passage text verbatim, and keep the final output structurally valid. NEVER put the answer key or explanations inside each question block. Put answers, points, and brief explanations ONLY in the final tab-separated table block starting with "===== 정답표 (PDF 말미) =====". Follow Korean CSAT English exam notation: ①~⑤, inline underscore blanks, __underlines__, and **__bold underlined__** error spans. Do not print literal [BOX] labels. Each scope block = exactly ONE question. English passage verbatim plus exam markup; no Korean passage in output. Total score 100.',
        },
        { role: 'user', content: user },
      ],
      temperature: 0.34,
      max_tokens: PARALLEL_MOCK_MAX_OUTPUT_TOKENS,
    },
    PARALLEL_MOCK_TIMEOUT_MS
  )

  const localCheck1 = validateParallelDraftLocally(draft, blockCount)
  if (!localCheck1.ok) {
    draft = await reviseParallelMockExamDraft(
      apiKey,
      schoolName,
      templateProfile,
      scopeItems,
      draft,
      {
        issues: localCheck1.issues,
        revisionNeeds: [
          `문항 1~${blockCount}가 모두 보이게 초안을 완성할 것`,
          '누락된 문항 블록을 추가하고 정답표도 마지막에 다시 쓸 것',
        ],
      }
    )
  }

  if (templateProfile && typeof templateProfile === 'object') {
    const verify1 = await verifyParallelMockExamDraft(apiKey, schoolName, templateProfile, scopeItems, draft)
    if (!verify1.ok) {
      draft = await reviseParallelMockExamDraft(
        apiKey,
        schoolName,
        templateProfile,
        scopeItems,
        draft,
        verify1
      )
    }
  }

  const localCheck2 = validateParallelDraftLocally(draft, blockCount)
  if (!localCheck2.ok) {
    draft = await rebuildParallelMockExamBySingleQuestions(
      apiKey,
      schoolName,
      analysisText,
      bankItems,
      scopeItems,
      cumulativeSchoolProfile,
      templateProfile,
      draft,
      types
    )
    const localCheck3 = validateParallelDraftLocally(draft, blockCount)
    if (!localCheck3.ok) {
      throw new Error(
        `동형 모의고사 초안이 끝까지 완성되지 않았습니다: ${localCheck3.issues[0] || '문항 누락'}`
      )
    }
  }

  return draft
}
