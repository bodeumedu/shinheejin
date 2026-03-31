/**
 * 이번 시험 범위(슬래시 형식 텍스트)를 학교·고교 학년·년도·학기·중간/기말 단위로 localStorage에 보관
 */

const KEY = 'pocketbook.schoolMockScopePresets.v1'
const MAX_PRESETS = 120

/**
 * @typedef {{
 *   id: string,
 *   schoolName: string,
 *   year: string,
 *   grade: '고1' | '고2' | '고3' | '공통',
 *   semester: '1' | '2',
 *   examType: '중간' | '기말',
 *   body: string,
 *   savedAt: string
 * }} ScopePreset
 */

/** @param {unknown} raw */
export function normalizeScopeGrade(raw) {
  const s = String(raw ?? '').trim()
  if (s === '고1' || s === '1') return '고1'
  if (s === '고2' || s === '2') return '고2'
  if (s === '고3' || s === '3') return '고3'
  return '공통'
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * @returns {{ presets: ScopePreset[] }}
 */
export function loadScopePresets() {
  try {
    const j = localStorage.getItem(KEY)
    if (!j) return { presets: [] }
    const o = JSON.parse(j)
    if (!o || !Array.isArray(o.presets)) return { presets: [] }
    const presets = o.presets.filter(
      (p) =>
        p &&
        typeof p === 'object' &&
        typeof p.id === 'string' &&
        typeof p.schoolName === 'string' &&
        typeof p.body === 'string'
    )
    return { presets }
  } catch {
    return { presets: [] }
  }
}

/**
 * @param {{ presets: ScopePreset[] }} data
 */
export function saveScopePresets(data) {
  let presets = [...(data.presets || [])]
  presets.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
  if (presets.length > MAX_PRESETS) presets = presets.slice(0, MAX_PRESETS)
  localStorage.setItem(KEY, JSON.stringify({ presets }))
}

/**
 * @param {ScopePreset} p
 */
export function formatScopePresetLabel(p) {
  const sem = p.semester === '2' ? '2학기' : '1학기'
  const exam = p.examType === '중간' ? '중간고사' : '기말고사'
  const g = normalizeScopeGrade(p.grade)
  const gLabel = g === '공통' ? '학년 공통' : g
  return `${p.year} · ${gLabel} · ${sem} · ${exam}`
}

/**
 * 같은 학교·고교 학년·년도·학기·중간/기말이면 본문을 덮어씀(항목 하나만 유지)
 * @param {{ presets: ScopePreset[] }} data
 * @param {Omit<ScopePreset, 'id'|'savedAt'> & { id?: string }} input
 * @returns {{ presets: ScopePreset[] }}
 */
export function upsertScopePreset(data, input) {
  const schoolName = String(input.schoolName ?? '').trim()
  const year = String(input.year ?? '').trim()
  const semester = input.semester === '2' ? '2' : '1'
  const examType = input.examType === '중간' ? '중간' : '기말'
  const grade = normalizeScopeGrade(input.grade)
  const body = String(input.body ?? '')
  if (!schoolName) throw new Error('학교 이름을 입력해 주세요.')
  if (!year) throw new Error('년도를 입력해 주세요.')
  if (!body.trim()) throw new Error('저장할 시험 범위 텍스트가 비어 있습니다.')

  const presets = [...(data.presets || [])]
  const matchIdx = presets.findIndex((x) => {
    const xGrade = normalizeScopeGrade(x.grade)
    return (
      x.schoolName === schoolName &&
      String(x.year ?? '').trim() === year &&
      (x.semester === '2' ? '2' : '1') === semester &&
      (x.examType === '중간' ? '중간' : '기말') === examType &&
      xGrade === grade
    )
  })
  const now = new Date().toISOString()
  const row = {
    id: matchIdx >= 0 ? presets[matchIdx].id : newId(),
    schoolName,
    year,
    grade,
    semester,
    examType,
    body,
    savedAt: now,
  }
  if (matchIdx >= 0) presets[matchIdx] = row
  else presets.push(row)
  return { presets }
}

/**
 * @param {string} id
 */
export function removeScopePresetById(data, id) {
  const rid = String(id ?? '')
  return {
    presets: (data.presets || []).filter((p) => p.id !== rid),
  }
}

/**
 * @param {string} schoolName
 * @returns {ScopePreset[]}
 */
export function listScopePresetsForSchool(schoolName) {
  const name = String(schoolName ?? '').trim()
  if (!name) return []
  return loadScopePresets()
    .presets.filter((p) => p.schoolName === name)
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
}
