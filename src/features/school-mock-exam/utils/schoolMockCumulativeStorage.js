/**
 * 학교별로 「기출 패턴 분석」이 끝날 때마다 쌓아 두는 장기 저장소.
 * 화면을 나갔다 오면 세션용 bank는 비지만, 여기 남은 누적분으로 동형·변형 품질을 올립니다.
 */

const KEY = 'pocketbook.schoolMockCumulative.v1'
const MAX_RUNS_PER_SCHOOL = 35
const MAX_TOTAL_CHARS_PER_SCHOOL = 130000

/**
 * @returns {{ schools: Record<string, { runs: { at: string, text: string }[] }> }}
 */
export function loadSchoolCumulative() {
  try {
    const j = localStorage.getItem(KEY)
    if (!j) return { schools: {} }
    const o = JSON.parse(j)
    if (!o?.schools || typeof o.schools !== 'object') return { schools: {} }
    return { schools: o.schools }
  } catch {
    return { schools: {} }
  }
}

function saveSchoolCumulative(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

/**
 * 분석 성공 시 해당 학교 히스토리에 한 건 추가
 * @param {string} schoolName
 * @param {string} analysisText
 */
export function appendSchoolAnalysisRun(schoolName, analysisText) {
  const name = String(schoolName ?? '').trim()
  const text = String(analysisText ?? '').trim()
  if (!name || !text) return

  const data = loadSchoolCumulative()
  const prev = data.schools[name] || { runs: [] }
  let runs = [...(prev.runs || []), { at: new Date().toISOString(), text }]

  while (runs.length > MAX_RUNS_PER_SCHOOL) runs.shift()

  let total = runs.reduce((a, r) => a + (r.text?.length || 0), 0)
  while (total > MAX_TOTAL_CHARS_PER_SCHOOL && runs.length > 1) {
    runs.shift()
    total = runs.reduce((a, r) => a + (r.text?.length || 0), 0)
  }

  data.schools[name] = { runs }
  saveSchoolCumulative(data)
}

/**
 * @param {string} schoolName
 */
export function getCumulativeRunCount(schoolName) {
  const name = String(schoolName ?? '').trim()
  if (!name) return 0
  return loadSchoolCumulative().schools[name]?.runs?.length ?? 0
}

/**
 * 생성 API용: 해당 학교 누적 분석을 하나의 블록으로 (길이 상한)
 * @param {string} schoolName
 * @param {number} maxChars
 */
export function formatCumulativeForPrompt(schoolName, maxChars = 90000) {
  const name = String(schoolName ?? '').trim()
  if (!name) return ''
  const runs = loadSchoolCumulative().schools[name]?.runs || []
  if (!runs.length) return ''

  const parts = runs.map((r, i) => {
    const d = r.at ? r.at.slice(0, 10) : ''
    return `[누적 분석 ${i + 1}${d ? ` (${d})` : ''}]\n${r.text || ''}`
  })
  let blob = parts.join('\n\n---\n\n')
  if (blob.length > maxChars) {
    blob = `[…앞부분 ${blob.length - maxChars}자 생략]\n\n${blob.slice(-maxChars)}`
  }
  return blob
}
