/**
 * 입력 형식: 제목/영어원문/한글원문  (여러 개는 // 로 구분)
 * 영어 원문 안에 / 가 있어도 되도록 첫 슬래시·마지막 슬래시로 제목·한글을 구분합니다.
 * @param {string} text
 * @returns {{ title: string, english: string, korean: string, raw: string }[]}
 */
export function parseSlashExamBlocks(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return []
  const chunks = raw
    .split(/\/{2,}/g)
    .map((s) => s.trim())
    .filter(Boolean)
  const out = []
  for (const chunk of chunks) {
    const one = parseOneTitleEnglishKorean(chunk)
    if (one) out.push(one)
  }
  return out
}

/**
 * @param {string} chunk 단일 항목 (// 없이)
 */
export function parseOneTitleEnglishKorean(chunk) {
  const s = String(chunk ?? '').trim()
  if (!s) return null
  const first = s.indexOf('/')
  if (first < 0) return null
  const last = s.lastIndexOf('/')
  if (last <= first) return null
  const title = s.slice(0, first).trim()
  const english = s.slice(first + 1, last).trim()
  const korean = s.slice(last + 1).trim()
  if (!title && !english && !korean) return null
  return { title, english, korean, raw: s }
}
