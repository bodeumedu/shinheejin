/** @typedef {{ id: string, title: string, topics: { id: string, label: string }[] }} GrammarSection */

/**
 * @param {GrammarSection[]} sections
 * @returns {string[]}
 */
export function collectAllTopicIds(sections) {
  const ids = []
  for (const sec of sections) {
    for (const t of sec.topics) ids.push(t.id)
  }
  return ids
}

/**
 * @param {GrammarSection[]} sections
 * @param {string} topicId
 */
export function findTopicLabel(sections, topicId) {
  for (const sec of sections) {
    const t = sec.topics.find((x) => x.id === topicId)
    if (t) return `${sec.title} — ${t.label}`
  }
  return topicId
}

/**
 * @param {GrammarSection[]} sections
 * @param {string[]} selectedIds
 */
export function buildTopicLinesForPrompt(sections, selectedIds) {
  const set = new Set(selectedIds)
  const lines = []
  for (const sec of sections) {
    for (const t of sec.topics) {
      if (set.has(t.id)) {
        lines.push(`- topicId "${t.id}": ${sec.title} — ${t.label}`)
      }
    }
  }
  return lines.join('\n')
}

/** 체크 없이 랜덤 출제할 때 — 전체 세부 주제를 프롬프트에 나열 */
export function buildFullTopicLinesForPrompt(sections) {
  const lines = []
  for (const sec of sections) {
    for (const t of sec.topics) {
      lines.push(`- topicId "${t.id}": ${sec.title} — ${t.label}`)
    }
  }
  return lines.join('\n')
}

function isPrimarilyEnglishBlock(text) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t || t.includes('【')) return false
  const hangul = (t.match(/[\u3131-\uD79D]/g) || []).length
  const latin = (t.match(/[A-Za-z]/g) || []).length
  return latin >= 8 && latin > hangul * 3
}

/**
 * 모의고사형 PDF 등: Q. 다음에 붙는 "예시 영어 문장"은 보기와 중복되는 경우가 많아 박스에서 제외
 * (밑줄·빈칸 지문 등 공통 지문이 필요한 유형은 유지)
 * @param {string} passage
 * @param {boolean} essay
 */
export function passageForMcqDisplay(passage, essay) {
  if (essay) return String(passage ?? '')
  let s = String(passage ?? '').trim()
  if (!s) return s
  if (!/^Q\.\s/m.test(s)) return s

  const parts = s.split(/\n\n+/)
  if (parts.length >= 2) {
    const head = parts[0].trim()
    const rest = parts.slice(1).join('\n\n').trim()
    const hasBlankOrNumberedStem = /_{2,}|＿{2,}|\.{3,}|\( *\d+ *\)|\(\d+\)/.test(rest)
    if (!hasBlankOrNumberedStem && isPrimarilyEnglishBlock(rest)) {
      return head
    }
  }

  const lines = s.split(/\r?\n/)
  const out = []
  let seenQ = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    if (!seenQ) {
      out.push(line)
      if (/^Q\.\s/.test(t)) seenQ = true
      continue
    }
    if (!t) continue
    if (/【/.test(t)) {
      out.push(line)
      continue
    }
    if (isPrimarilyEnglishBlock(t) && !/_{2,}|＿{2,}/.test(t)) {
      break
    }
    out.push(line)
  }
  const compact = out.join('\n').trim()
  return compact || s
}
