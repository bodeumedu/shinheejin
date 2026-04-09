/**
 * 피어나용 지문 블록 → 출처, 영어(API 전달), 한글(표시용·API 제외)
 *
 * 1) 전처리기 출력: 출처\n/\n영어\n/\n한글  (가운데 / 는 줄바꿈 둘레만 구분자)
 * 2) 통합 형식: 출처/영어/한글 (영어 안에 / 가 있으면 마지막 / 뒤만 한글로 간주)
 */
export function parsePeonaBlock(block, index = 0) {
  const t = String(block || '').trim()
  if (!t) return null

  const byLineSlash = t.split(/\n\/\s*\n/).map((s) => s.trim()).filter((s) => s.length > 0)
  if (byLineSlash.length >= 2) {
    return {
      source: byLineSlash[0],
      english: byLineSlash[1],
      korean: byLineSlash[2] || '',
    }
  }

  const p = t.split('/').map((s) => s.trim())
  if (p.length >= 3) {
    return {
      source: p[0],
      english: p.slice(1, -1).join('/'),
      korean: p[p.length - 1],
    }
  }
  if (p.length === 2) {
    return { source: p[0], english: p[1], korean: '' }
  }
  if (p.length === 1) {
    return { source: `지문 ${index + 1}`, english: p[0], korean: '' }
  }
  return { source: `지문 ${index + 1}`, english: t, korean: '' }
}
