import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseSlashExamBlocks } from '../utils/parseSlashExamFormat.js'
import {
  extractPdfTextFromFile,
  getPdfFirstPageSizeMm,
  renderPdfFileToImages,
} from '../utils/extractSchoolPdf.js'
import {
  exportSchoolMockExamPdfB4,
  SCHOOL_MOCK_B4_MM,
  splitSchoolMockResultIntoBlocks,
} from '../utils/schoolMockExamPdf.js'
import { transcribeExamPageImages } from '../utils/schoolMockExamVision.js'
import {
  appendSchoolAnalysisRun,
  formatCumulativeForPrompt,
  getCumulativeRunCount,
  loadSchoolCumulative,
} from '../utils/schoolMockCumulativeStorage.js'
import {
  appendSchoolItems,
  clearSchoolItems,
  getSchoolEntry,
  listSchoolNames,
  loadSchoolMockBank,
  removeSchoolItem,
  saveSchoolMockBank,
  setSchoolAnalysis,
  setSchoolParallelMockResult,
  setSchoolTemplateProfile,
  setSchoolReferencePdfMeta,
} from '../utils/schoolMockBankStorage.js'
import {
  analyzeSchoolPastPattern,
  buildSchoolTemplateProfile,
  generateParallelMockExam,
  regenerateParallelMockQuestion,
} from '../utils/schoolMockExamAi.js'
import {
  formatScopePresetLabel,
  loadScopePresets,
  normalizeScopeGrade,
  removeScopePresetById,
  saveScopePresets,
  upsertScopePreset,
} from '../utils/schoolMockScopePresetsStorage.js'
import './SchoolParallelMockExamInput.css'

/**
 * 시험지 PDF 파일명에서 시험 구분 문자열 추출
 * @param {string} fileName
 */
function deriveExamLabelFromPdfFileName(fileName) {
  let s = String(fileName || '')
    .replace(/\.pdf$/i, '')
    .trim()
  s = s.replace(/\s*보기\s*수정\s*$/iu, '')
  s = s.replace(/_보기수정\s*$/iu, '')
  s = s.replace(/\s*-\s*복사본\s*$/iu, '')
  s = s.replace(/\s*\(\d+\)\s*$/u, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s || '기출'
}

/** 텍스트 레이어가 거의 없으면 스캔본으로 보고 Vision 전사 시도 */
const SCAN_TEXT_SHORT_THRESHOLD = 420
const VISION_MAX_PAGES = 14
const MAX_ITEM_STORE_CHARS = 380000

function capItemBody(s) {
  const t = String(s ?? '')
  if (t.length <= MAX_ITEM_STORE_CHARS) return t
  return `${t.slice(0, MAX_ITEM_STORE_CHARS)}\n\n[브라우저 저장 한도로 잘림 — 원본 PDF는 따로 보관하세요.]`
}

function shuffleScopeItems(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function extractQuestionNoFromBlock(block) {
  const m = String(block || '')
    .trim()
    .match(/^=====?\s*문항\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

function formatElapsedTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m <= 0) return `${s}초`
  return `${m}분 ${s}초`
}

function getLoadingEstimateText(label) {
  const text = String(label || '')
  if (!text) return ''
  if (text.includes('PDF에서 텍스트 추출')) return '예상 10~30초'
  if (text.includes('스캔 이미지 인식')) return '예상 1~4분'
  if (text.includes('기출 패턴 분석')) return '예상 20~60초'
  if (text.includes('학교 시험 템플릿')) return '예상 10~40초'
  if (text.includes('동형·변형 모의고사 생성')) return '예상 1~4분'
  if (text.includes('문항') && text.includes('다시 만드는 중')) return '예상 20~90초'
  if (text.includes('B4 PDF 만들기')) return '예상 10~40초'
  return '예상 수십 초~수분'
}

function parseAnswerTableBlock(block) {
  const lines = String(block || '').split(/\r?\n/)
  const noteLines = []
  const rowLines = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (/^=====.*정답표/i.test(t)) continue
    if (t.startsWith('※')) {
      noteLines.push(t)
      continue
    }
    if (t.includes('\t')) rowLines.push(t)
  }
  const headerCells = rowLines[0]?.split('\t').map((x) => x.trim()) || ['문항', '정답', '배점']
  const rows = rowLines.slice(1).map((line) => {
    const cells = line.split('\t').map((x) => x.trim())
    return {
      no: Number(cells[0]) || 0,
      answer: cells[1] || '',
      points: cells[2] || '',
      brief: cells[3] || '',
    }
  })
  return { noteLines, headerCells, rows }
}

function buildAnswerTableBlock(prevBlock, totalQuestionCount, overridesByNo) {
  const parsed = parseAnswerTableBlock(prevBlock)
  const rowsMap = new Map(parsed.rows.map((r) => [r.no, r]))
  Object.entries(overridesByNo || {}).forEach(([k, v]) => {
    rowsMap.set(Number(k), { no: Number(k), ...(v || {}) })
  })
  const allRows = []
  for (let i = 1; i <= totalQuestionCount; i++) {
    const row = rowsMap.get(i) || { no: i, answer: '', points: '', brief: '' }
    allRows.push(row)
  }
  const useBrief =
    parsed.headerCells.includes('채점 요지') || allRows.some((r) => String(r.brief || '').trim().length > 0)
  const header = useBrief ? ['문항', '정답', '배점', '채점 요지'] : ['문항', '정답', '배점']
  const body = allRows.map((r) =>
    useBrief
      ? `${r.no}\t${r.answer || ''}\t${r.points || ''}\t${r.brief || ''}`
      : `${r.no}\t${r.answer || ''}\t${r.points || ''}`
  )
  return [
    '===== 정답표 (PDF 말미) =====',
    ...(parsed.noteLines.length ? parsed.noteLines : ['※ 시험지 PDF 끝에 붙이는 요약 정답표입니다.']),
    header.join('\t'),
    ...body,
  ].join('\n')
}

export default function SchoolParallelMockExamInput({ onClose, apiKey }) {
  const examPdfRef = useRef(null)
  const bankRef = useRef(null)
  const [pdfInputKey, setPdfInputKey] = useState(0)
  const [derivedLabelPreview, setDerivedLabelPreview] = useState('')
  const [bank, setBank] = useState(() => loadSchoolMockBank())
  const [schoolInput, setSchoolInput] = useState('과천고')
  const [scopePaste, setScopePaste] = useState('')
  const [scopeYear, setScopeYear] = useState(() => String(new Date().getFullYear()))
  const [scopeGrade, setScopeGrade] = useState('고2')
  const [scopeSemester, setScopeSemester] = useState('1')
  const [scopeExamType, setScopeExamType] = useState('기말')
  const [scopePresets, setScopePresets] = useState(() => loadScopePresets().presets)
  const [analysisText, setAnalysisText] = useState('')
  const [resultText, setResultText] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [loadingElapsedSec, setLoadingElapsedSec] = useState(0)
  const [error, setError] = useState(null)
  const [lastGeneratedScopeItems, setLastGeneratedScopeItems] = useState([])
  const [lastGeneratedTemplateProfile, setLastGeneratedTemplateProfile] = useState(null)
  const [regeneratingQuestionNo, setRegeneratingQuestionNo] = useState(null)
  /** 마지막으로 등록한 기출 PDF 첫 쪽 규격(mm) — 생성 PDF 안내·레이아웃 감에 참고 */
  const [referencePdfMm, setReferencePdfMm] = useState(null)

  bankRef.current = bank

  const schoolNames = useMemo(() => {
    const fromBank = listSchoolNames(bank)
    const fromCum = Object.keys(loadSchoolCumulative().schools || {}).filter(Boolean)
    return [...new Set([...fromBank, ...fromCum])].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [bank])

  const activeSchool = String(schoolInput ?? '').trim()
  const entry = useMemo(() => getSchoolEntry(bank, activeSchool), [bank, activeSchool])
  const cumulativeCount = activeSchool ? getCumulativeRunCount(activeSchool) : 0

  useEffect(() => {
    if (!loading) {
      setLoadingElapsedSec(0)
      return
    }
    setLoadingElapsedSec(0)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setLoadingElapsedSec(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [loading])

  useEffect(() => {
    const e = getSchoolEntry(bankRef.current, activeSchool)
    setResultText(e.lastParallelResult || '')
    setLastGeneratedScopeItems([])
    setLastGeneratedTemplateProfile(null)
    setRegeneratingQuestionNo(null)
  }, [activeSchool])

  const scopePresetsForSchool = useMemo(() => {
    if (!activeSchool) return []
    return scopePresets
      .filter((p) => p.schoolName === activeSchool)
      .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
  }, [scopePresets, activeSchool])

  const resultBlocks = useMemo(() => splitSchoolMockResultIntoBlocks(resultText), [resultText])
  const loadingTimingText = useMemo(() => {
    if (!loading) return ''
    const estimate = getLoadingEstimateText(loadingLabel)
    const elapsed = `${formatElapsedTime(loadingElapsedSec)} 경과`
    return estimate ? `${estimate} · ${elapsed}` : elapsed
  }, [loading, loadingElapsedSec, loadingLabel])
  const questionBlocks = useMemo(
    () =>
      resultBlocks
        .map((block, idx) => ({ block, idx, no: extractQuestionNoFromBlock(block) }))
        .filter((x) => x.no != null),
    [resultBlocks]
  )

  useEffect(() => {
    setAnalysisText(entry.analysisText || '')
  }, [activeSchool, entry.analysisText])

  useEffect(() => {
    setReferencePdfMm(entry.referencePdfMeta ?? null)
  }, [entry.referencePdfMeta])

  const persist = useCallback((next) => {
    setBank(next)
    saveSchoolMockBank(next)
  }, [])

  function persistParallelResult(text) {
    if (!activeSchool) return
    setBank((prev) => {
      const next = setSchoolParallelMockResult(prev, activeSchool, text)
      saveSchoolMockBank(next)
      return next
    })
  }

  const ensureTemplateProfile = useCallback(
    async (analysisSourceText) => {
      const analysisBase = String(analysisSourceText || analysisText || entry.analysisText || '').trim()
      if (!analysisBase) return entry.templateProfile || null
      if (entry.templateProfile && typeof entry.templateProfile === 'object') return entry.templateProfile
      if (!apiKey?.trim()) return null

      const profile = await buildSchoolTemplateProfile(
        apiKey,
        activeSchool,
        analysisBase,
        entry.items,
        entry.referencePdfMeta || referencePdfMm || null
      )
      setBank((prev) => {
        const next = setSchoolTemplateProfile(prev, activeSchool, profile)
        saveSchoolMockBank(next)
        return next
      })
      return profile
    },
    [apiKey, activeSchool, analysisText, entry.analysisText, entry.items, entry.referencePdfMeta, entry.templateProfile, referencePdfMm]
  )

  const handleAddFromPdf = useCallback(async () => {
    const pdfFile = examPdfRef.current
    if (!pdfFile) {
      setError('시험지 PDF를 선택해 주세요.')
      return
    }
    setError(null)
    setLoading(true)
    setLoadingLabel('PDF에서 텍스트 추출 중…')
    try {
      let refMeta = null
      try {
        refMeta = await getPdfFirstPageSizeMm(pdfFile)
      } catch {
        refMeta = null
      }

      const extracted = await extractPdfTextFromFile(pdfFile)
      let body = extracted.fullText

      if (body.length < SCAN_TEXT_SHORT_THRESHOLD) {
        if (!apiKey?.trim()) {
          throw new Error(
            'PDF에서 글자가 거의 읽히지 않습니다(스캔본). 상단에 API 키를 넣은 뒤 다시 시도하면 페이지 이미지를 인식해 전사합니다.'
          )
        }
        setLoadingLabel('스캔 이미지 인식 중…(시간이 걸릴 수 있음)')
        const { images } = await renderPdfFileToImages(pdfFile, { maxPages: VISION_MAX_PAGES })
        body = await transcribeExamPageImages(apiKey, images, '시험지')
      }

      const merged = `=== [시험지 PDF] ${pdfFile.name} ===\n${body}`
      const labelBase = deriveExamLabelFromPdfFileName(pdfFile.name)
      const parsed = [
        {
          title: `[PDF] ${labelBase}`,
          english: capItemBody(merged),
          korean: `파일: ${pdfFile.name}`,
          raw: `pages:${extracted.pageCount}`,
        },
      ]
      let next = appendSchoolItems(bank, activeSchool, parsed)
      const metaForRef = {
        ...(refMeta || { widthMm: 0, heightMm: 0 }),
        pageCount: Number(extracted.pageCount) || 0,
        fileLabel: labelBase,
      }
      next = setSchoolReferencePdfMeta(next, activeSchool, metaForRef)
      persist(next)
      examPdfRef.current = null
      setDerivedLabelPreview('')
      setPdfInputKey((k) => k + 1)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
      setLoadingLabel('')
    }
  }, [apiKey, bank, activeSchool, persist])

  const handleAnalyze = useCallback(async () => {
    if (!apiKey?.trim()) {
      setError('API 키를 먼저 설정해 주세요.')
      return
    }
    const items = entry.items
    if (!items.length) {
      setError('분석할 기출이 없습니다. PDF를 먼저 등록해 주세요.')
      return
    }
    setError(null)
    setLoading(true)
    setLoadingLabel('기출 패턴 분석 중…')
    try {
      const out = await analyzeSchoolPastPattern(apiKey, activeSchool, items)
      setAnalysisText(out)
      let next = setSchoolAnalysis(bank, activeSchool, out)
      persist(next)
      appendSchoolAnalysisRun(activeSchool, out)
      try {
        setLoadingLabel('학교 시험 템플릿 정리 중…')
        const profile = await buildSchoolTemplateProfile(
          apiKey,
          activeSchool,
          out,
          items,
          entry.referencePdfMeta || referencePdfMm || null
        )
        next = setSchoolTemplateProfile(next, activeSchool, profile)
        persist(next)
      } catch (templateErr) {
        console.warn('학교 템플릿 추출 실패:', templateErr)
      }
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
      setLoadingLabel('')
    }
  }, [apiKey, entry.items, activeSchool, bank, persist, entry.referencePdfMeta, referencePdfMm])

  const handleGenerate = useCallback(async () => {
    if (!apiKey?.trim()) {
      setError('API 키를 먼저 설정해 주세요.')
      return
    }
    const scope = parseSlashExamBlocks(scopePaste)
    if (!scope.length) {
      setError('이번 시험 범위를 제목/영어/한글 형식으로 입력해 주세요.')
      return
    }
    setError(null)
    setLoading(true)
    setLoadingLabel('동형·변형 모의고사 생성 중…')
    try {
      const randomizedScope = shuffleScopeItems(scope)
      const cumulative = formatCumulativeForPrompt(activeSchool)
      let templateProfile = entry.templateProfile || null
      if (!templateProfile) {
        setLoadingLabel('학교 시험 템플릿 준비 중…')
        templateProfile = await ensureTemplateProfile(analysisText || entry.analysisText || '')
        setLoadingLabel('동형·변형 모의고사 생성 중…')
      }
      const out = await generateParallelMockExam(
        apiKey,
        activeSchool,
        analysisText || entry.analysisText || '',
        entry.items,
        randomizedScope,
        cumulative,
        templateProfile
      )
      setResultText(out)
      setLastGeneratedScopeItems(randomizedScope)
      setLastGeneratedTemplateProfile(templateProfile || null)
      setRegeneratingQuestionNo(null)
      setBank((prev) => {
        const next = setSchoolParallelMockResult(prev, activeSchool, out)
        saveSchoolMockBank(next)
        return next
      })
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
      setLoadingLabel('')
    }
  }, [apiKey, scopePaste, analysisText, entry.items, entry.analysisText, entry.templateProfile, activeSchool, ensureTemplateProfile])

  const handleRegenerateOneQuestion = useCallback(
    async (questionNo) => {
      const targetScope = lastGeneratedScopeItems[questionNo - 1]
      if (!targetScope) {
        setError('이 문항을 다시 만들 범위 정보가 없습니다. 이번 회차를 다시 생성한 뒤 시도해 주세요.')
        return
      }
      const blocks = splitSchoolMockResultIntoBlocks(resultText)
      const qIdx = blocks.findIndex((b) => extractQuestionNoFromBlock(b) === questionNo)
      if (qIdx === -1) {
        setError(`문항 ${questionNo} 블록을 찾지 못했습니다.`)
        return
      }
      const answerIdx = blocks.findIndex((b) => /^=====?\s*정답표/i.test(String(b).trim()))
      const cumulative = formatCumulativeForPrompt(activeSchool)
      setError(null)
      setRegeneratingQuestionNo(questionNo)
      setLoading(true)
      setLoadingLabel(`문항 ${questionNo}만 다시 만드는 중…`)
      try {
        const templateProfile =
          lastGeneratedTemplateProfile ||
          entry.templateProfile ||
          (await ensureTemplateProfile(analysisText || entry.analysisText || ''))
        const regen = await regenerateParallelMockQuestion(
          apiKey,
          activeSchool,
          analysisText || entry.analysisText || '',
          entry.items,
          targetScope,
          cumulative,
          templateProfile,
          questionNo,
          Math.max(lastGeneratedScopeItems.length, questionBlocks.length),
          blocks[qIdx],
          resultText
        )
        const nextBlocks = [...blocks]
        nextBlocks[qIdx] = regen.questionBlock
        const totalCount = Math.max(lastGeneratedScopeItems.length, questionBlocks.length, questionNo)
        const prevAnswerBlock =
          answerIdx >= 0 ? nextBlocks[answerIdx] : '===== 정답표 (PDF 말미) =====\n※ 시험지 PDF 끝에 붙이는 요약 정답표입니다.'
        const nextAnswerBlock = buildAnswerTableBlock(prevAnswerBlock, totalCount, {
          [questionNo]: {
            answer: regen.answer,
            points: regen.points,
            brief: regen.briefExplanation,
          },
        })
        if (answerIdx >= 0) nextBlocks[answerIdx] = nextAnswerBlock
        else nextBlocks.push(nextAnswerBlock)
        const nextText = nextBlocks.join('\n\n')
        setResultText(nextText)
        persistParallelResult(nextText)
      } catch (e) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
        setLoadingLabel('')
        setRegeneratingQuestionNo(null)
      }
    },
    [
      lastGeneratedScopeItems,
      resultText,
      activeSchool,
      lastGeneratedTemplateProfile,
      entry.templateProfile,
      entry.analysisText,
      entry.items,
      ensureTemplateProfile,
      analysisText,
      apiKey,
      questionBlocks.length,
      persistParallelResult,
    ]
  )

  const handleRemoveItem = useCallback(
    (id) => {
      const next = removeSchoolItem(bank, activeSchool, id)
      persist(next)
    },
    [bank, activeSchool, persist]
  )

  const handleClearBank = useCallback(() => {
    if (!window.confirm('이 학교에 쌓인 기출을 모두 지울까요?')) return
    const next = clearSchoolItems(bank, activeSchool)
    persist(next)
  }, [bank, activeSchool, persist])

  const handleSaveScopePreset = useCallback(() => {
    if (!activeSchool) {
      setError('먼저 학교 이름을 입력해 주세요.')
      return
    }
    setError(null)
    try {
      const data = loadScopePresets()
      const next = upsertScopePreset(data, {
        schoolName: activeSchool,
        year: scopeYear,
        grade: scopeGrade,
        semester: scopeSemester,
        examType: scopeExamType,
        body: scopePaste,
      })
      saveScopePresets(next)
      setScopePresets(next.presets)
    } catch (e) {
      setError(e?.message || String(e))
    }
  }, [activeSchool, scopeYear, scopeGrade, scopeSemester, scopeExamType, scopePaste])

  const handleLoadScopePreset = useCallback((p) => {
    setScopePaste(p.body || '')
    setScopeYear(String(p.year ?? '').trim() || String(new Date().getFullYear()))
    setScopeGrade(normalizeScopeGrade(p.grade))
    setScopeSemester(p.semester === '2' ? '2' : '1')
    setScopeExamType(p.examType === '중간' ? '중간' : '기말')
    setError(null)
  }, [])

  const handleDeleteScopePreset = useCallback((id) => {
    if (!window.confirm('이 저장된 시험 범위를 삭제할까요?')) return
    setError(null)
    const data = loadScopePresets()
    const next = removeScopePresetById(data, id)
    saveScopePresets(next)
    setScopePresets(next.presets)
  }, [])

  const handleCopyResult = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(resultText)
    } catch {
      setError('복사에 실패했습니다. 브라우저 클립보드 권한을 확인해 주세요.')
    }
  }, [resultText])

  const handleResultBlur = useCallback(
    (e) => {
      persistParallelResult(e.target.value)
    },
    [persistParallelResult]
  )

  const handleExportPdfB4 = useCallback(async () => {
    if (!resultText?.trim()) {
      setError('먼저 생성 결과를 만든 뒤 PDF로 저장해 주세요.')
      return
    }
    persistParallelResult(resultText)
    setError(null)
    setLoading(true)
    setLoadingLabel('B4 PDF 만들기…')
    try {
      await exportSchoolMockExamPdfB4({
        bodyText: resultText,
        schoolName: activeSchool,
        referencePdf: referencePdfMm,
        referenceFileLabel:
          entry.referencePdfMeta?.fileLabel ||
          String(entry.items[0]?.title || '')
            .replace(/^\[PDF\]\s*/i, '')
            .trim() ||
          '',
      })
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
      setLoadingLabel('')
    }
  }, [resultText, activeSchool, referencePdfMm, persistParallelResult, entry.referencePdfMeta?.fileLabel])

  const handleAnalysisChange = useCallback(
    (e) => {
      const v = e.target.value
      setAnalysisText(v)
      setBank((prev) => {
        const next = setSchoolAnalysis(prev, activeSchool, v)
        saveSchoolMockBank(next)
        return next
      })
    },
    [activeSchool]
  )

  return (
    <div className="spme-root">
      <div className="spme-toolbar">
        <button type="button" className="spme-btn spme-btn-ghost" onClick={onClose}>
          메인으로
        </button>
      </div>

      <p className="spme-lead">
        학교별로 <strong>시험지 PDF 한 파일</strong>(스캔본)을 올려 「기출 패턴 분석」에 씁니다. 텍스트가 비면 API 키로 Vision 전사(앞쪽 {VISION_MAX_PAGES}
        쪽)를 시도합니다. <strong>등록한 기출 본문·분석 칸 내용</strong>은 브라우저 <code>localStorage</code>에 학교 이름별로 저장되어, 메인으로 나갔다
        와도 그대로 이어집니다. 같은 학교로 분석을 돌릴 때마다 쌓는 <strong>학교별 누적 패턴 노트</strong>도 별도로 보관되어 동형·변형 생성에 반영됩니다.{' '}
        <strong>이번 시험 범위</strong>는 아래에서 <strong>고등학교 학년</strong>·년도·학기·중간/기말과 함께 브라우저에 저장해 두었다가 다시 불러올 수 있습니다.{' '}
        <strong>생성 결과</strong>는 학교 이름별로 브라우저에 자동 저장됩니다(다시 들어와도 이어짐). <strong>B4 PDF 저장</strong>은 아래{' '}
        <strong>생성 결과</strong> 칸 옆·위쪽 버튼으로 JIS B4({SCHOOL_MOCK_B4_MM.w}×{SCHOOL_MOCK_B4_MM.h}mm) 파일을 내려받습니다. 다른 PC·브라우저와는 공유되지 않습니다.
      </p>

      <section className="spme-card">
        <h3 className="spme-h3">1. 학교 선택</h3>
        <div className="spme-row">
          <label className="spme-label">
            학교 이름
            <input
              className="spme-input"
              list="spme-school-datalist"
              value={schoolInput}
              onChange={(e) => setSchoolInput(e.target.value)}
              placeholder="예: 과천고"
            />
            <datalist id="spme-school-datalist">
              {schoolNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <span className="spme-meta">
            저장된 기출 {entry.items.length}건 · 학교 누적 분석 {cumulativeCount}회
          </span>
        </div>
      </section>

      <section className="spme-card">
        <h3 className="spme-h3">2. 기출 PDF 등록 (스캔본)</h3>
        <p className="spme-note">
          시험지 PDF <strong>한 파일</strong>만 선택합니다. 순수 스캔은 텍스트 추출이 비어 있을 수 있어, 그때는 OpenAI Vision으로 앞쪽 {VISION_MAX_PAGES}쪽까지 전사합니다.{' '}
          <strong>시험 구분(목록 제목)</strong>은 <strong>파일 이름</strong>에서 자동으로 만듭니다(끝의 .pdf, 「보기수정」 등은 제거).
        </p>
        <div className="spme-row spme-pdf-row" key={pdfInputKey}>
          <label className="spme-label spme-file-label spme-file-label-full">
            시험지 PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="spme-file"
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                examPdfRef.current = f
                setDerivedLabelPreview(f ? deriveExamLabelFromPdfFileName(f.name) : '')
              }}
            />
          </label>
        </div>
        {derivedLabelPreview ? (
          <p className="spme-derived-label">
            저장 제목: <strong>[PDF] {derivedLabelPreview}</strong>
          </p>
        ) : null}
        <div className="spme-actions">
          <button type="button" className="spme-btn spme-btn-primary" onClick={handleAddFromPdf} disabled={loading}>
            PDF 기출로 추가
          </button>
          <button
            type="button"
            className="spme-btn spme-btn-danger"
            onClick={handleClearBank}
            disabled={loading || !entry.items.length}
          >
            이 학교 기출 전부 비우기
          </button>
        </div>
        {entry.items.length > 0 && (
          <ul className="spme-itemlist">
            {entry.items
              .slice()
              .reverse()
              .slice(0, 12)
              .map((it) => (
                <li key={it.id} className="spme-item">
                  <div className="spme-item-head">
                    <strong>{it.title || '(제목 없음)'}</strong>
                    <button type="button" className="spme-btn spme-btn-tiny" onClick={() => handleRemoveItem(it.id)}>
                      삭제
                    </button>
                  </div>
                  <div className="spme-item-snippet">
                    {it.english.slice(0, 120)}
                    {it.english.length > 120 ? '…' : ''}
                  </div>
                </li>
              ))}
            {entry.items.length > 12 && (
              <li className="spme-item spme-more">외 {entry.items.length - 12}건</li>
            )}
          </ul>
        )}
      </section>

      <section className="spme-card">
        <h3 className="spme-h3">3. 기출 패턴 분석 (AI)</h3>
        <p className="spme-note">
          단일 PDF 추출·전사본만으로 본문 쪽수·빈 쪽, 문항·배점, 페이지별 좌우 단·유형·보기 길이, 논술 답 길이 제한, 출제 의도·레이아웃을{' '}
          <strong>정해진 목차</strong>로 촘촘히 씁니다. 배점은 <strong>항상 만점 100점</strong>으로 정리합니다(원문 합계가 어긋나 보이면 100점제로 맞춰 서술). 원문이 짧거나 전사 오류가 있으면 일부는 &quot;확인 불가&quot;로 남을 수 있습니다.
        </p>
        <div className="spme-actions">
          <button type="button" className="spme-btn spme-btn-primary" onClick={handleAnalyze} disabled={loading}>
            분석 실행
          </button>
        </div>
        <textarea
          className="spme-textarea spme-analysis"
          value={analysisText}
          onChange={handleAnalysisChange}
          rows={10}
          spellCheck={false}
          placeholder="분석 실행 후 표시. 직접 수정해도 저장됩니다."
        />
      </section>

      <section className="spme-card">
        <h3 className="spme-h3">4. 이번 시험 범위 → 동형·변형 모의고사</h3>
        <p className="spme-note">
          형식: <strong>제목/영어원문 전체/한글 전체//</strong> — 지문마다 블록을 나눕니다. 제목에 <strong>기출 문항 번호</strong>(예: <code>독해 3번</code>)를
          넣으면, 분석에 그 번호가 <strong>주제·요지</strong> 등으로 나온 경우 그 유형으로 맞춥니다. 번호가 없으면 유형은 <strong>무작위로 골고루</strong> 배정됩니다.{' '}
          <strong>객관식</strong>은 <strong>수능 영어 독해</strong> 스타일로 짜고, <strong>한 블록당 문항 1개</strong>입니다. 영어·한글은 <strong>입력과 동일하게</strong> 두고 보기·지시문만 새로
          작성합니다. <strong>생성 결과에는 범위의 한글 해석은 넣지 않고</strong> 영어 지문·문항만 나옵니다. 여러 지문이면 문항 수만큼 배점을 나눠 <strong>합계 100점</strong>. 결과는{' '}
          <strong>입력한 범위 블록 순서도 생성 때마다 무작위로 섞여</strong> 같은 범위로 다시 뽑아도 문항 순서 체감이 달라집니다.{' '}
          <strong>시험지 PDF용</strong>으로 블록 구분선이 보이게 나옵니다.           <strong>B4 PDF 저장</strong>은 JIS B4(257×364mm) · 머리말·2단·각주 형태로 내려받으며, <strong>같은 쪽은 좌단에 첫 문항만·이어지는 문항은 우단</strong>에 쌓이게 배치합니다(기출 2단 관례). 생성 결과 맨 끝 <strong>정답표</strong>는 <strong>맨 뒤 표 형식</strong>으로 붙습니다. 기출 PDF를
          등록했다면 그 첫 쪽 규격을 부제에 참고로 적습니다. 생성은{' '}
          <strong>gpt-4.1</strong>(출력 최대 약 3.2만 토큰)·<strong>최대 10분</strong> 대기입니다.
        </p>
        <div className="spme-scope-fields spme-row">
          <label className="spme-label spme-label-narrow">
            고등학교 학년
            <select
              className="spme-input spme-select"
              value={scopeGrade}
              onChange={(e) => setScopeGrade(e.target.value)}
            >
              <option value="고1">고1</option>
              <option value="고2">고2</option>
              <option value="고3">고3</option>
              <option value="공통">학년 공통</option>
            </select>
          </label>
          <label className="spme-label spme-label-narrow">
            시험 연도
            <input
              className="spme-input"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={scopeYear}
              onChange={(e) => setScopeYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="예: 2025"
            />
          </label>
          <label className="spme-label spme-label-narrow">
            학기
            <select
              className="spme-input spme-select"
              value={scopeSemester}
              onChange={(e) => setScopeSemester(e.target.value)}
            >
              <option value="1">1학기</option>
              <option value="2">2학기</option>
            </select>
          </label>
          <label className="spme-label spme-label-narrow">
            시험 구분
            <select
              className="spme-input spme-select"
              value={scopeExamType}
              onChange={(e) => setScopeExamType(e.target.value)}
            >
              <option value="중간">중간고사</option>
              <option value="기말">기말고사</option>
            </select>
          </label>
          <button type="button" className="spme-btn spme-btn-secondary" onClick={handleSaveScopePreset} disabled={loading}>
            범위 저장 (학교·학년·연도·학기·구분)
          </button>
        </div>
        <p className="spme-note spme-note-tight">
          같은 <strong>학교 이름 · 고교 학년 · 연도 · 학기 · 중간/기말</strong> 조합으로 다시 저장하면 이전 범위 본문이 <strong>덮어써집니다</strong>.
        </p>
        <textarea
          className="spme-textarea"
          value={scopePaste}
          onChange={(e) => setScopePaste(e.target.value)}
          rows={16}
          spellCheck={false}
          placeholder="예: 독해 3번/(영어 지문)/(한글 해석)//  ← 제목에 기출 번호를 넣으면 분석과 유형 매칭에 쓰입니다."
        />
        {scopePresetsForSchool.length > 0 && (
          <div className="spme-scope-saved">
            <div className="spme-scope-saved-title">저장된 시험 범위 ({activeSchool})</div>
            <ul className="spme-scope-saved-list">
              {scopePresetsForSchool.map((p) => (
                <li key={p.id} className="spme-scope-saved-item">
                  <div className="spme-scope-saved-meta">
                    <strong>{formatScopePresetLabel(p)}</strong>
                    <span className="spme-scope-saved-date">
                      {p.savedAt ? p.savedAt.slice(0, 10) : ''}
                    </span>
                  </div>
                  <div className="spme-scope-saved-actions">
                    <button
                      type="button"
                      className="spme-btn spme-btn-tiny"
                      onClick={() => handleLoadScopePreset(p)}
                      disabled={loading}
                    >
                      불러오기
                    </button>
                    <button
                      type="button"
                      className="spme-btn spme-btn-tiny spme-btn-danger-ghost"
                      onClick={() => handleDeleteScopePreset(p.id)}
                      disabled={loading}
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="spme-actions">
          <button type="button" className="spme-btn spme-btn-accent" onClick={handleGenerate} disabled={loading}>
            동형·변형 모의고사 만들기
          </button>
          <button type="button" className="spme-btn spme-btn-secondary" onClick={handleCopyResult} disabled={!resultText}>
            결과 복사
          </button>
          <button
            type="button"
            className="spme-btn spme-btn-secondary"
            onClick={handleExportPdfB4}
            disabled={loading || !resultText?.trim()}
          >
            B4 PDF 저장
          </button>
        </div>
      </section>

      {loading && (
        <div className="spme-loading" role="status" aria-live="polite">
          <p>{loadingLabel}</p>
          {loadingTimingText ? <p className="spme-loading-sub">{loadingTimingText}</p> : null}
        </div>
      )}
      {error && (
        <p className="spme-error" role="alert">
          {error}
        </p>
      )}

      <section className="spme-card spme-result-card">
        <div className="spme-result-header">
          <h3 className="spme-h3 spme-result-title">생성 결과</h3>
          <div className="spme-result-actions">
            <button
              type="button"
              className="spme-btn spme-btn-primary"
              onClick={handleExportPdfB4}
              disabled={loading || !resultText?.trim()}
            >
              B4 PDF 저장 ({SCHOOL_MOCK_B4_MM.w}×{SCHOOL_MOCK_B4_MM.h}mm)
            </button>
            <span className="spme-result-hint">머리말·2단·각주 형태로 저장됩니다. 칸을 수정한 뒤에는 포커스를 빼면 브라우저에 반영됩니다.</span>
          </div>
        </div>
        <textarea
          className="spme-textarea spme-result"
          value={resultText}
          onChange={(e) => setResultText(e.target.value)}
          onBlur={handleResultBlur}
          rows={18}
          spellCheck={false}
          placeholder="생성된 모의고사 텍스트"
        />
        {questionBlocks.length > 0 && (
          <div className="spme-regenerate-panel">
            <div className="spme-regenerate-title">문항별 다시 만들기</div>
            <div className="spme-regenerate-list">
              {questionBlocks.map((qb) => (
                <button
                  key={qb.no}
                  type="button"
                  className="spme-btn spme-btn-tiny spme-btn-secondary"
                  disabled={
                    loading ||
                    regeneratingQuestionNo != null ||
                    lastGeneratedScopeItems.length < qb.no
                  }
                  onClick={() => handleRegenerateOneQuestion(qb.no)}
                >
                  {regeneratingQuestionNo === qb.no ? `문항 ${qb.no} 재작성 중…` : `문항 ${qb.no}만 새로`}
                </button>
              ))}
            </div>
            {lastGeneratedScopeItems.length === 0 ? (
              <p className="spme-regenerate-hint">
                현재 칸의 결과는 범위-문항 매핑 정보가 없어 문항별 재작성이 잠겨 있습니다. 이번 회차를 다시 생성하면 버튼이 활성화됩니다.
              </p>
            ) : (
              <p className="spme-regenerate-hint">
                마음에 들지 않는 문항만 다시 뽑아 현재 결과와 정답표를 바로 교체합니다.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
