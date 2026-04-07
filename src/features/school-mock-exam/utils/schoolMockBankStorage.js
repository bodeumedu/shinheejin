/** @typedef {{ id: string, title: string, english: string, korean: string, raw: string, addedAt: string }} SchoolMockItem */
/** @typedef {{ widthMm: number, heightMm: number, widthPt?: number, heightPt?: number, pageCount: number, fileLabel?: string }} SchoolReferencePdfMeta */

const STORAGE_KEY = 'pocketbook.schoolMockBank.v1'

function getRawSchoolEntry(data, key) {
  const e = data.schools?.[key]
  if (!e || typeof e !== 'object') return { items: [], analysisText: '' }
  return e
}

/**
 * @returns {{ schools: Record<string, { items: SchoolMockItem[], analysisText: string, referencePdfMeta?: SchoolReferencePdfMeta | null, lastParallelResult?: string, templateProfile?: unknown }> }}
 */
export function loadSchoolMockBank() {
  try {
    const j = localStorage.getItem(STORAGE_KEY)
    if (!j) return { schools: {} }
    const o = JSON.parse(j)
    if (!o || typeof o !== 'object' || !o.schools || typeof o.schools !== 'object') {
      return { schools: {} }
    }
    return { schools: o.schools }
  } catch {
    return { schools: {} }
  }
}

/**
 * @param {{ schools: Record<string, { items: SchoolMockItem[], analysisText: string }> }} data
 */
export function saveSchoolMockBank(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function listSchoolNames(data) {
  return Object.keys(data.schools || {})
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ko'))
}

/**
 * @param {string} schoolName
 * @returns {{ items: SchoolMockItem[], analysisText: string, referencePdfMeta: SchoolReferencePdfMeta | null, lastParallelResult: string, templateProfile: unknown | null, examTable: { rows: object[] } | null }}
 */
export function getSchoolEntry(data, schoolName) {
  const key = String(schoolName ?? '').trim()
  if (!key) return { items: [], analysisText: '', referencePdfMeta: null, lastParallelResult: '', templateProfile: null, examTable: null }
  const e = getRawSchoolEntry(data, key)
  const meta = e.referencePdfMeta
  const hasDims =
    meta && typeof meta === 'object' && typeof meta.widthMm === 'number' && typeof meta.heightMm === 'number'
  const hasLabel = meta && typeof meta === 'object' && typeof meta.fileLabel === 'string' && meta.fileLabel.trim()
  const referencePdfMeta =
    hasDims || hasLabel
      ? {
          widthMm: hasDims ? meta.widthMm : 0,
          heightMm: hasDims ? meta.heightMm : 0,
          widthPt: meta.widthPt,
          heightPt: meta.heightPt,
          pageCount: Number(meta.pageCount) || 0,
          fileLabel: typeof meta?.fileLabel === 'string' ? meta.fileLabel.trim() : '',
        }
      : null
  return {
    items: Array.isArray(e.items) ? e.items : [],
    analysisText: typeof e.analysisText === 'string' ? e.analysisText : '',
    referencePdfMeta,
    lastParallelResult: typeof e.lastParallelResult === 'string' ? e.lastParallelResult : '',
    templateProfile:
      e.templateProfile && typeof e.templateProfile === 'object' && !Array.isArray(e.templateProfile)
        ? e.templateProfile
        : null,
    examTable:
      e.examTable && typeof e.examTable === 'object' && Array.isArray(e.examTable.rows)
        ? e.examTable
        : null,
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * @param {string} schoolName
 * @param {Omit<SchoolMockItem, 'id'|'addedAt'>[]} parsed
 */
export function appendSchoolItems(data, schoolName, parsed) {
  const key = String(schoolName ?? '').trim()
  if (!key) throw new Error('학교 이름을 입력해 주세요.')
  const now = new Date().toISOString()
  const prev = getSchoolEntry(data, key)
  const items = [
    ...prev.items,
    ...parsed.map((p) => ({
      id: newId(),
      title: p.title || '',
      english: p.english || '',
      korean: p.korean || '',
      raw: p.raw || '',
      addedAt: now,
    })),
  ]
  return {
    ...data,
    schools: {
      ...data.schools,
      [key]: {
        items,
        analysisText: prev.analysisText,
        referencePdfMeta: prev.referencePdfMeta,
        lastParallelResult: prev.lastParallelResult,
        templateProfile: prev.templateProfile,
        examTable: prev.examTable,
      },
    },
  }
}

/**
 * 동형·변형 생성 결과(텍스트) — 학교별로 브라우저에 보관, B4 PDF 저장에 사용
 * @param {{ schools: Record<string, unknown> }} data
 * @param {string} schoolName
 * @param {string} text
 */
export function setSchoolParallelMockResult(data, schoolName, text) {
  const key = String(schoolName ?? '').trim()
  if (!key) return data
  const prev = getSchoolEntry(data, key)
  return {
    ...data,
    schools: {
      ...data.schools,
      [key]: {
        items: prev.items,
        analysisText: prev.analysisText,
        referencePdfMeta: prev.referencePdfMeta,
        lastParallelResult: String(text ?? ''),
        templateProfile: prev.templateProfile,
        examTable: prev.examTable,
      },
    },
  }
}

/**
 * @param {string} schoolName
 * @param {string} analysisText
 */
export function setSchoolAnalysis(data, schoolName, analysisText) {
  const key = String(schoolName ?? '').trim()
  if (!key) return data
  const prev = getSchoolEntry(data, key)
  return {
    ...data,
    schools: {
      ...data.schools,
      [key]: {
        items: prev.items,
        analysisText: String(analysisText ?? ''),
        referencePdfMeta: prev.referencePdfMeta,
        lastParallelResult: prev.lastParallelResult,
        templateProfile: prev.templateProfile,
        examTable: prev.examTable,
      },
    },
  }
}

/**
 * 학교 시험지 템플릿 프로필(JSON 객체) 저장
 * @param {{ schools: Record<string, unknown> }} data
 * @param {string} schoolName
 * @param {unknown} templateProfile
 */
export function setSchoolTemplateProfile(data, schoolName, templateProfile) {
  const key = String(schoolName ?? '').trim()
  if (!key) return data
  const prev = getSchoolEntry(data, key)
  return {
    ...data,
    schools: {
      ...data.schools,
      [key]: {
        items: prev.items,
        analysisText: prev.analysisText,
        referencePdfMeta: prev.referencePdfMeta,
        lastParallelResult: prev.lastParallelResult,
        templateProfile:
          templateProfile && typeof templateProfile === 'object' && !Array.isArray(templateProfile)
            ? templateProfile
            : null,
        examTable: prev.examTable,
      },
    },
  }
}

/**
 * 마지막으로 등록한 기출 PDF 첫 쪽 규격(동형 PDF·표시용)
 * @param {{ schools: Record<string, unknown> }} data
 * @param {string} schoolName
 * @param {SchoolReferencePdfMeta | null} meta
 */
export function setSchoolReferencePdfMeta(data, schoolName, meta) {
  const key = String(schoolName ?? '').trim()
  if (!key) return data
  const prev = getSchoolEntry(data, key)
  return {
    ...data,
    schools: {
      ...data.schools,
      [key]: {
        items: prev.items,
        analysisText: prev.analysisText,
        referencePdfMeta: meta == null ? null : meta,
        lastParallelResult: prev.lastParallelResult,
        templateProfile: prev.templateProfile,
        examTable: prev.examTable,
      },
    },
  }
}

/**
 * 시험 분석표(유형별 세부분석) 저장
 * @param {{ schools: Record<string, unknown> }} data
 * @param {string} schoolName
 * @param {{ rows: object[] } | null} examTable
 */
export function setSchoolExamTable(data, schoolName, examTable) {
  const key = String(schoolName ?? '').trim()
  if (!key) return data
  const prev = getSchoolEntry(data, key)
  return {
    ...data,
    schools: {
      ...data.schools,
      [key]: {
        items: prev.items,
        analysisText: prev.analysisText,
        referencePdfMeta: prev.referencePdfMeta,
        lastParallelResult: prev.lastParallelResult,
        templateProfile: prev.templateProfile,
        examTable: examTable && typeof examTable === 'object' && Array.isArray(examTable.rows)
          ? examTable
          : null,
      },
    },
  }
}

/**
 * @param {string} schoolName
 * @param {string} itemId
 */
export function removeSchoolItem(data, schoolName, itemId) {
  const key = String(schoolName ?? '').trim()
  if (!key) return data
  const prev = getSchoolEntry(data, key)
  const items = prev.items.filter((it) => it.id !== itemId)
  return {
    ...data,
    schools: {
      ...data.schools,
      [key]: {
        items,
        analysisText: prev.analysisText,
        referencePdfMeta: items.length === 0 ? null : prev.referencePdfMeta,
        lastParallelResult: prev.lastParallelResult,
        templateProfile: prev.templateProfile,
        examTable: prev.examTable,
      },
    },
  }
}

/**
 * @param {string} schoolName
 */
export function clearSchoolItems(data, schoolName) {
  const key = String(schoolName ?? '').trim()
  if (!key) return data
  const prev = getSchoolEntry(data, key)
  return {
    ...data,
    schools: {
      ...data.schools,
      [key]: {
        items: [],
        analysisText: prev.analysisText,
        referencePdfMeta: null,
        lastParallelResult: prev.lastParallelResult,
        templateProfile: prev.templateProfile,
        examTable: prev.examTable,
      },
    },
  }
}

