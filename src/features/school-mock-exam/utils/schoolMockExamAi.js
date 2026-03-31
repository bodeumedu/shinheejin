import { ANALYSIS_STYLE_REFERENCE_KO } from './analysisStyleReferenceKo.js'

const MODEL = 'gpt-4o-mini'
const MODEL_TEMPLATE_PROFILE = 'gpt-4o-mini'

/** 동형·변형: 블록(지문)마다 1문항·다지문 합산 100점 등 긴 출력 대응 */
const MODEL_PARALLEL_MOCK_EXAM = 'gpt-4.1'
/** gpt-4.1 실제 completion 상한 */
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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(apiKey).trim()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API 오류: ${response.status}`)
    }
    const data = await response.json()
    const choice = data.choices?.[0]
    const text = choice?.message?.content?.trim() || ''
    if (choice?.finish_reason === 'length') {
      const tail =
        '\n\n[시스템 안내] 응답이 출력 토큰 한도에 도달해 여기서 끊겼을 수 있습니다. 범위·문항을 나눠 다시 생성해 보세요.'
      return text ? `${text}${tail}` : tail.trim()
    }
    return text
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(
        `요청 시간 초과(${Math.round(timeoutMs / 1000)}초) — 잠시 후 다시 시도해 주세요.`
      )
    }
    throw e
  } finally {
    clearTimeout(timer)
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
  const cleaned = String(response || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(cleaned || '{}')
  } catch {
    throw new Error('JSON 파싱 실패')
  }
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
            'You are an expert on Korean high school English "내신" exam papers. You reconstruct exam structure, item types, and scoring from messy PDF text or OCR transcripts. Be precise; mark uncertainty. Reply in Korean only.',
        },
        { role: 'user', content: user },
      ],
      temperature: 0.25,
      max_tokens: 16384,
    },
    420000
  )
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
            'You extract a reusable Korean school exam template profile from analysis text. Return only JSON matching the requested schema.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.15,
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
      model: MODEL_TEMPLATE_PROFILE,
      messages: [
        {
          role: 'system',
          content:
            'You are a strict verifier for Korean school parallel mock exams. Return only JSON with ok/issues/revisionNeeds.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2200,
    },
    PARALLEL_MOCK_VERIFY_TIMEOUT_MS
  )
  return {
    ok: result?.ok === true,
    issues: Array.isArray(result?.issues) ? result.issues.map((x) => String(x || '').trim()).filter(Boolean) : [],
    revisionNeeds: Array.isArray(result?.revisionNeeds)
      ? result.revisionNeeds.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
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
            'You revise a full Korean school parallel mock exam draft to better match the school template. Output only the full revised plain text draft. Preserve and correct CSAT-style markup such as circled numerals ①~⑤, inline blank underscores, __underlines__, and **__bold underlined__** error spans. Do not print literal [BOX] labels; use plain standalone summary/sentence lines that can be boxed later.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.35,
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
  currentDraftText = ''
) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  if (!scopeItem?.english) throw new Error('재생성할 범위 지문이 없습니다.')

  const bankExcerpt = formatItemsForPrompt(bankItems, 8, 35000)
  const cum = String(cumulativeSchoolProfile || '').trim()
  const templateBlock = formatTemplateProfileForPrompt(templateProfile, totalQuestionCount)
  const scopeBlock = `[범위] ${scopeItem.title || '제목 없음'}\n영어: ${scopeItem.english || ''}\n한글: ${scopeItem.korean || ''}`

  const prompt = `학교: "${schoolName}"

목표:
이미 생성된 동형 모의고사 중 **문항 ${questionNo} 하나만** 새 버전으로 다시 작성한다.

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
- 제목에 기출 번호가 있으면 해당 번호 유형을 우선 적용, 없으면 학교 템플릿 slotPlan의 문항 ${questionNo} 스타일을 우선 따른다.
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
            'You rewrite only one question block for a Korean school parallel mock exam. Return only JSON with questionBlock/answer/points/briefExplanation. Never include answer/explanation inside questionBlock. Follow Korean CSAT English exam notation, including circled numerals ①~⑤, underscore blanks, __underlines__, and **__bold underlined__** error spans. Do not print literal [BOX] labels.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.52,
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
  currentDraftText = ''
) {
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
      currentDraftText
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
 */
export async function generateParallelMockExam(
  apiKey,
  schoolName,
  analysisText,
  bankItems,
  scopeItems,
  cumulativeSchoolProfile = '',
  templateProfile = null
) {
  if (!apiKey?.trim()) throw new Error('API 키가 필요합니다.')
  if (!scopeItems.length) throw new Error('이번 시험 범위(제목/영어/한글)를 입력해 주세요.')

  const bankExcerpt = formatItemsForPrompt(bankItems, 8, 45000)
  const scopeBlock = scopeItems
    .map((it, i) => {
      return `[범위 ${i + 1}] ${it.title || '제목 없음'}\n영어: ${it.english || ''}\n한글: ${it.korean || ''}`
    })
    .join('\n\n---\n\n')

  const cum = String(cumulativeSchoolProfile || '').trim()
  const templateBlock = formatTemplateProfileForPrompt(templateProfile, scopeItems.length)
  const blockCount = scopeItems.length
  const typePlan = buildParallelBlockTypePlan(blockCount)
  const typePlanLines = typePlan
    .map((t, i) => `- **[범위 ${i + 1}] 기본 유형 후보(무작위 배정)**: ${t}`)
    .join('\n')

  const user = `학교 맥락: "${schoolName}"

=== 학교별 누적 기출 패턴 노트 (이 학교로 여러 번 실행한 「분석」이 시간 순으로 쌓인 자료) ===
${cum || '(아직 없음 — 같은 학교 이름으로 PDF를 올리고 분석을 돌릴수록 이 블록이 두터워집니다.)'}
${cum ? '\n위 누적 노트를 **최우선**으로 참고해, 이 학교 내신에 가깝고 특징이 뚜렷한 동형·변형 시험을 만드세요. 서로 다른 시험 회차 분석이 겹치면 공통 패턴과 변화를 균형 있게 반영하세요.\n' : ''}

${templateBlock || '=== 학교별 시험 템플릿 프로필 ===\n(없음 — 분석 텍스트와 기출 원문 일부만 참고)\n'}

=== 이번 화면 세션의 분석 칸(재진입 직후에는 보통 비어 있음) ===
${analysisText || '(없음)'}

=== 이번 세션에만 있는 기출 원문 일부(재진입 후에는 보통 비어 있음) ===
${bankExcerpt || '(없음)'}

=== 이번 시험 출제 범위(원문·해석) — 아래 블록은 사용자가 붙여 넣은 실제 시험 지문 길이 ===
${scopeBlock}

=== 이번 생성: 블록별 유형 — 기출 번호 매칭이 있으면 최우선, 없으면 아래 무작위 배정 ===
지문 블록은 총 **${blockCount}개**이다. **각 [범위 n]마다 문항은 정확히 1개만** 만든다.

**1) 기출(분석) 문항 번호 ↔ 유형 (최우선)**
- 위 **누적 기출 패턴 노트**, **이번 화면 분석 칸**, **기출 원문 일부**에서 **문항 번호별로 어떤 유형이었는지**(예: 3번 = 주제·요지, 5번 = 빈칸, 12번 = 순서)를 찾는다.
- 각 \`[범위 n]\`의 **제목(title)**에 기출 문항 번호를 넣을 수 있다(예: \`독해 3번\`, \`기출 12번\`, \`[3] 지문1\`). 번호가 **분석 본문의 문항 번호**와 대응되면, **그 기출 번호의 유형을 이 블록에 적용**한다.
- **기출에서 해당 번호가 주제·제목·요지·글의 목적·중심 내용** 등으로 서술되어 있으면, 이 블록은 **반드시 주제(요지)형 객관식**으로 낸다. 아래 무작위 배정표는 **이 블록에 한해 무시**한다.
- 기출에서 해당 번호가 **빈칸·순서·무관문·함의** 등으로 나오면 **그 유형**으로 맞춘다(역시 아래 표보다 우선).
- 번호를 알 수 없거나 분석에 해당 지문이 없으면, 아래 **기본 무작위 배정**을 따른다.

**2) 기본 무작위 배정 (기출 매칭이 없을 때만 그대로 따름)**
${typePlanLines}

${CSAT_READING_MC_GUIDE_KO}

${BLANK_IN_PASSAGE_RULE_KO}

${CSAT_MARKING_STYLE_KO}

=== 과제 ===
이것은 **문법 워크북용 짧은 예문이 아니라**, 영어 **독해**용이다. **객관식 문항의 만드는 방식(지시문·선지·오답 설계)**은 위 **수능 영어 독해** 스타일을 따른다. 학교 **기출 분석**은 지문 길이·배점감·유형 분포 참고용이고, **문항 문구·선지는 수능식으로 새로 짠다**(실제 학교·수능 기출 문항을 그대로 복제하지는 말 것). 사용자는 이 결과를 **학교 시험지 레이아웃으로 PDF**에 옮길 예정이므로, **블록마다 구분선·문항 번호·배점**이 PDF로 옮기기 쉽게 보이게 출력한다.

**지문(본문) 처리 — 최우선 (위반 시 실패로 간주)**
- 위 "이번 시험 출제 범위"에 있는 **영어(english)**와 **한글(korean)**은 출제·의도 파악에 모두 참고하되, **최종 출력에는 영어 지문만** 실는다. **범위에 넣은 한글 해석·요지 본문은 생성 결과에 인쇄하지 말 것**(PDF에 영어 독해지만 올릴 예정).
- **영어 지문**은 아래 예외를 제외하고 **사용자가 붙여 넣은 글자·철자·구두점·띄어쓰기·줄바꿈·문단 순서까지 그대로** 출력에 옮긴다. **의역·요약·앞뒤 자르기**는 금지.
- **허용되는 수정은 오직 출제를 위한 표시**뿐이다: 예) 빈칸(____), 밑줄, ①~⑤ 번호 붙이기, 삽입형·순서형을 위한 (A)(B)(C) 블록 구분, "틀린 부분 고르기"용 일부 단어·구의 의도적 오류 표시 등. 이때도 **나머지 문장·문단은 원문 그대로** 둔다.
- **빈칸·삼중 빈칸 유형**은 위 **「빈칸·(A)(B)(C) 다중 빈칸」** 규칙을 반드시 지킨다(지문 안에 (A)(B)(C) 뚫기, 정답 단어 지문 노출 금지).
- **금지 표현**: 생략, 중략, "…", "[이하 생략]", 첫 문장만 싣고 나머지 생략, 두세 문장 요약본으로 치환 등.
- 블록이 여러 개면 **각 [범위 n]마다 영어 지문을 전부** 실을 것(한 블록만 길게 하고 다른 블록은 짧게 줄이지 말 것). **한글 해석 블록은 출력하지 않는다.**

**블록당 1문항 규칙**
- **[범위 1] … [범위 ${blockCount}]** 각각 **변형 문항 1개**만 작성한다.
- **유형 결정 순서**: (가) 기출 분석에서 **해당 문항 번호의 유형**이 밝혀지면 그것을 따른다 → (나) 아니면 위 **기본 무작위 배정**을 따른다.
- (가)에서 **주제형**이면 **수능식 주제·요지 문항**으로 완성한다. (나)일 때도 객관식은 **수능 독해 스타일**로 만든다.
- 사용자가 제목에 기출 번호를 넣지 않은 블록은, 위 **학교별 시험 템플릿 프로필의 slotPlan 순서**(문항 1, 2, 3…)를 우선 따라 해당 학교의 체감 구성을 재현한다.
- 지문 내용과 맞지 않으면 **같은 유형·같은 수능식 톤 안에서** 보기·지시문만 조정한다.
- **재실행**할 때마다 기본 배정은 새로 섞이므로 버전마다 조합이 달라질 수 있다(기출 매칭은 매번 동일하게 읽힌다).

**출력 형식 (PDF 옮기기용)**
- 각 문항은 다음과 같이 **한 덩어리**로 구분한다(예시):
  \`===== 문항 n | [범위 n 제목] | 배점: xx점 | 유형: … =====\`
  그 다음 한국어 지시문 → **영어 지문**(필요한 출제 표시 포함) → 보기·정답·해설(해당 시). **범위의 한글 해석·요지는 출력에 넣지 않는다.**
- 문항 번호는 1부터 ${blockCount}까지 **연속·누락 없이** 한 번씩만 쓴다. 블록 구분 줄은 반드시 \`===== 문항 숫자\`로 시작하게 해 **PDF 2단 자동 배치**가 기출과 같이(같은 쪽 **좌단 1문항·우단에 나머지 문항**) 맞아떨어지게 한다.
- **한 문항의 지시문·지문·보기·해설**은 **같은 \`===== 문항 n … =====\` 블록 안**에만 넣고, 다음 문항 내용을 이전 블록에 섞지 않는다.
- 지시문 어투, 보기 길이감, 조합형/밑줄형 표기, 번호 스타일은 가능하면 **학교별 시험 템플릿 프로필**과 비슷하게 맞춘다.

**배점**
- 문항이 총 **${blockCount}개**이므로, 각 문항 배점을 정하여 **합계가 정확히 100점**(만점)이 되게 한다. 소수 첫째 자리까지 허용(예: 3.3점씩 여러 개 후 합 100).

**금지**
- 출제 범위 지문을 "핵심만 발췌", "요약 지문", "짧은 예시 문단으로 대체"하는 것.
- 영어 지문을 더 짧은 동의어·간단 문장으로 다시 쓰는 것(문제용 변형이 아닌 이상).
- 한 블록에 객관식 2문항 이상, 또는 객관식+서술을 한 블록에 동시에 넣는 것.
- **빈칸·(A)(B)(C) 유형인데 지문 본문에 빈칸 표시 없이 정답 단어만 글로 써 두는 것**(삼중 빈칸이면 반드시 지문에 (A)(B)(C) 위치 표시).

요구사항:
- 실제 특정 학교의 **문항 문구·보기 문장을 그대로 복제**하지는 말 것. 사용자 제공 **범위 영어 지문**은 위 규칙대로 **전체 인용**해도 된다. **범위 한글은 출력에 반복하지 말 것.**
- **객관식**은 ①~⑤ 선지까지만 문항 블록에 쓴다. **정답·해설·풀이는 문항 블록에 절대 넣지 말 것**(학생용 PDF에 노출됨). 정답 번호·배점·한 줄 해설이 필요하면 **말미 「정답표」표에만** 적는다. **서술형**만 지시문에 답 길이·채점 기준을 명시한다(모범 답 문장은 정답표에).
- **중간에 생략 없이** 문항 1~${blockCount}·해설까지 한 번에 출력.
- 마크다운 코드블록 없이 일반 텍스트로 한 번에 출력.

**정답표 (PDF 맨 뒤 — 필수)**
- 각 문항 블록에는 **정답·해설을 쓰지 않은 뒤**, **가장 마지막**에 아래 형식으로 **정답표 블록을 한 번만** 붙인다. (문항 중간에 정답·요약 표 금지.)
- 첫 줄은 반드시 다음 구분선으로 시작한다: \`===== 정답표 (PDF 말미) =====\`
- 그 다음 한 줄 안내(선택): \`※ 시험지 PDF 끝에 붙이는 요약 정답표. 문항별 정답·배점만 적는다.\`
- 표 내용은 **탭(Tab)으로 열을 구분**한다. 첫 데이터 행은 헤더로 \`문항\\t정답\\t배점\` (서술형이 있으면 \`채점 요지\` 열을 추가해도 됨).
- 형식 예(코드블록 없이 그대로 출력): 첫 줄 \`===== 정답표 (PDF 말미) =====\` 다음 \`※ 시험지 PDF 끝에 붙이는 요약 정답표입니다.\` 다음 줄부터 \`문항 [탭] 정답 [탭] 배점\` 헤더, 이후 \`1 [탭] ② [탭] 3.6\` 식으로 ${blockCount}문항까지.
- **문항 번호**는 1~${blockCount}와 일치해야 하고, **정답**은 ①~⑤ 또는 서술형이면 \`(서술)\` 등 짧게, **배점** 합계가 100점이 되게 적는다.`

  let draft = await openAiChat(
    apiKey,
    {
      model: MODEL_PARALLEL_MOCK_EXAM,
      messages: [
        {
          role: 'system',
          content:
            'You assemble English reading exam items for Korean schools. NEVER put the answer key or explanations inside each question block—only question stem, passage, and choices. Put answers, points, and brief explanations ONLY in the final tab-separated table block starting with "===== 정답표 (PDF 말미) =====". Use cumulative/analysis text to map past-exam question numbers to types. Follow Korean CSAT English exam notation: circled numerals ①~⑤, inline underscore blanks, __underlines__, and **__bold underlined__** error spans. Do not print literal [BOX] labels. Each scope block = exactly ONE question. English passage verbatim plus exam markup; no Korean passage in output. Total score 100. Triple-blank items: inline (A)(B)(C) blanks in passage. After ALL questions, the answer table at the end.',
        },
        { role: 'user', content: user },
      ],
      temperature: 0.52,
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
      draft
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
