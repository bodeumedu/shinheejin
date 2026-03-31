import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { GRAMMAR_WORKBOOK_TYPES, getGrammarWorkbookType } from '../utils/grammarWorkbookRegistry.js'
import { GRAMMAR_WORKBOOK_MODES, getGrammarWorkbookMode } from '../utils/grammarWorkbookModes.js'
import { collectAllTopicIds } from '../utils/grammarWorkbookUtils.js'
import {
  buildRandomQuotaObject,
  sumQuota,
  normalizeQuotaToTotal,
  allocateCountsByWeights,
} from '../utils/grammarWorkbookQuota.js'
import {
  generateGrammarWorkbookProblems,
  PROBLEM_COUNT_OPTIONS,
  countGrammarApiRoundsForProblemCount,
  reviewGrammarWorkbookDraft,
} from '../utils/grammarWorkbookGenerator.js'
import { exportGrammarWorkbookMockExamPdf } from '../utils/grammarWorkbookMockExamPdf.js'
import './GrammarWorkbookInput.css'

const DIFFICULTY_GRADES = [
  { value: '초6', label: '초6' },
  { value: '중1', label: '중1' },
  { value: '중2', label: '중2' },
  { value: '중3', label: '중3' },
  { value: '고1', label: '고1' },
  { value: '고2', label: '고2' },
  { value: '고3', label: '고3' },
]

const MODE_IDS = GRAMMAR_WORKBOOK_MODES.map((m) => m.id)

function emptySelectedByMode() {
  return Object.fromEntries(MODE_IDS.map((id) => [id, []]))
}

function sortTopicIds(ids) {
  return [...ids].sort((a, b) => String(a).localeCompare(String(b), 'ko'))
}

function computeGenerationModes(selectedByMode, questionModeId) {
  const active = MODE_IDS.filter((id) => (selectedByMode[id] || []).length > 0)
  if (active.length > 0) return active
  return [questionModeId]
}

function poolForGenerationMode(modeId, selectedByMode, sections) {
  const allIds = sortTopicIds(collectAllTopicIds(sections))
  const valid = new Set(allIds)
  const raw = selectedByMode[modeId] || []
  const filtered = sortTopicIds([...new Set(raw.filter((id) => valid.has(id)))])
  if (filtered.length > 0) return filtered
  return allIds
}

export default function GrammarWorkbookInput({ onClose, apiKey }) {
  const [grammarKind, setGrammarKind] = useState('to-infinitive')
  const grammarConfig = useMemo(() => getGrammarWorkbookType(grammarKind), [grammarKind])

  const [questionModeId, setQuestionModeId] = useState('concept')
  const questionMode = useMemo(() => getGrammarWorkbookMode(questionModeId), [questionModeId])

  const [selectedByMode, setSelectedByMode] = useState(emptySelectedByMode)
  const [quotaByMode, setQuotaByMode] = useState({})
  const quotaEpochRef = useRef('')
  const prevGrammarKindRef = useRef(null)

  const [difficulty, setDifficulty] = useState('중2')
  const [problemCount, setProblemCount] = useState(50)
  const [loading, setLoading] = useState(false)
  const [loadingSeconds, setLoadingSeconds] = useState(0)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewSeconds, setReviewSeconds] = useState(0)
  const [error, setError] = useState(null)
  const [resultText, setResultText] = useState('')
  const [generatedProblems, setGeneratedProblems] = useState(null)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [pdfTestNo, setPdfTestNo] = useState('01')
  const [pdfTitle, setPdfTitle] = useState('보듬교육 문법 TEST')
  const [pdfTimeLimit, setPdfTimeLimit] = useState('제한 시간 : 30분')

  useEffect(() => {
    setResultText('')
    setError(null)
    setGeneratedProblems(null)
  }, [grammarKind, questionModeId])

  useEffect(() => {
    if (!loading) {
      setLoadingSeconds(0)
      return
    }
    setLoadingSeconds(0)
    const id = setInterval(() => {
      setLoadingSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (!reviewLoading) {
      setReviewSeconds(0)
      return
    }
    setReviewSeconds(0)
    const id = setInterval(() => {
      setReviewSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [reviewLoading])

  const generationModes = useMemo(
    () => computeGenerationModes(selectedByMode, questionModeId),
    [selectedByMode, questionModeId]
  )

  const countsByMode = useMemo(() => {
    if (generationModes.length === 1) {
      return { [generationModes[0]]: problemCount }
    }
    return allocateCountsByWeights(
      problemCount,
      generationModes.map((id) => ({
        id,
        w: Math.max(1, (selectedByMode[id] || []).length),
      }))
    )
  }, [generationModes, selectedByMode, problemCount])

  const poolSignature = useMemo(() => {
    const sel = selectedByMode
    const modes = computeGenerationModes(sel, questionModeId)
    const poolParts = modes.map((mid) =>
      poolForGenerationMode(mid, sel, grammarConfig.sections).join('|')
    )
    return `${grammarKind}|${problemCount}|${modes.join(',')}|${poolParts.join('||')}`
  }, [grammarKind, problemCount, selectedByMode, questionModeId, grammarConfig.sections])

  const toggleTopic = useCallback((id) => {
    setSelectedByMode((prev) => {
      const mid = questionModeId
      const cur = new Set(prev[mid] || [])
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      return { ...prev, [mid]: sortTopicIds([...cur]) }
    })
  }, [questionModeId])

  const selectSectionTopics = useCallback(
    (section) => {
      setSelectedByMode((prev) => {
        const mid = questionModeId
        const cur = new Set(prev[mid] || [])
        section.topics.forEach((t) => cur.add(t.id))
        return { ...prev, [mid]: sortTopicIds([...cur]) }
      })
    },
    [questionModeId]
  )

  const deselectSectionTopics = useCallback(
    (section) => {
      setSelectedByMode((prev) => {
        const mid = questionModeId
        const cur = new Set(prev[mid] || [])
        section.topics.forEach((t) => cur.delete(t.id))
        return { ...prev, [mid]: sortTopicIds([...cur]) }
      })
    },
    [questionModeId]
  )

  const selectAll = useCallback(() => {
    setSelectedByMode((prev) => ({
      ...prev,
      [questionModeId]: sortTopicIds(collectAllTopicIds(grammarConfig.sections)),
    }))
  }, [grammarConfig.sections, questionModeId])

  const deselectAll = useCallback(() => {
    setSelectedByMode((prev) => ({
      ...prev,
      [questionModeId]: [],
    }))
  }, [questionModeId])

  useLayoutEffect(() => {
    const grammarChanged =
      prevGrammarKindRef.current != null && prevGrammarKindRef.current !== grammarKind
    prevGrammarKindRef.current = grammarKind

    if (grammarChanged) {
      setSelectedByMode(emptySelectedByMode())
      quotaEpochRef.current = ''
    }

    const effectiveSelected = grammarChanged ? emptySelectedByMode() : selectedByMode
    const modes = computeGenerationModes(effectiveSelected, questionModeId)

    const anyPoolEmpty = modes.some(
      (mid) => poolForGenerationMode(mid, effectiveSelected, grammarConfig.sections).length === 0
    )
    if (anyPoolEmpty) {
      setQuotaByMode({})
      return
    }

    const poolParts = modes.map((mid) =>
      poolForGenerationMode(mid, effectiveSelected, grammarConfig.sections).join('|')
    )
    const sig = `${grammarKind}|${problemCount}|${modes.join(',')}|${poolParts.join('||')}`

    if (!grammarChanged && quotaEpochRef.current === sig) {
      return
    }

    quotaEpochRef.current = sig

    const counts =
      modes.length === 1
        ? { [modes[0]]: problemCount }
        : allocateCountsByWeights(
            problemCount,
            modes.map((id) => ({
              id,
              w: Math.max(1, (effectiveSelected[id] || []).length),
            }))
          )

    const next = {}
    for (const mid of modes) {
      const pool = poolForGenerationMode(mid, effectiveSelected, grammarConfig.sections)
      const n = counts[mid] || 0
      next[mid] = n > 0 && pool.length ? buildRandomQuotaObject(n, pool) : {}
    }
    setQuotaByMode(next)
  }, [grammarKind, grammarConfig.sections, problemCount, selectedByMode, questionModeId])

  const reshuffleQuota = useCallback(() => {
    quotaEpochRef.current = poolSignature
    setQuotaByMode(() => {
      const next = {}
      for (const mid of generationModes) {
        const pool = poolForGenerationMode(mid, selectedByMode, grammarConfig.sections)
        const n = countsByMode[mid] || 0
        next[mid] = n > 0 && pool.length ? buildRandomQuotaObject(n, pool) : {}
      }
      return next
    })
  }, [generationModes, selectedByMode, grammarConfig.sections, countsByMode, poolSignature])

  const balanceQuotaToTarget = useCallback(() => {
    setQuotaByMode((prev) => {
      const next = { ...prev }
      for (const mid of generationModes) {
        const pool = poolForGenerationMode(mid, selectedByMode, grammarConfig.sections)
        const target = countsByMode[mid] || 0
        next[mid] = normalizeQuotaToTotal(prev[mid] || {}, pool, target)
      }
      return next
    })
  }, [generationModes, selectedByMode, grammarConfig.sections, countsByMode])

  const updateTopicQuota = useCallback(
    (modeId, topicId, raw) => {
      const v = Math.max(0, Math.min(problemCount, Number.parseInt(String(raw), 10) || 0))
      setQuotaByMode((prev) => {
        const cur = { ...(prev[modeId] || {}) }
        if (v <= 0) delete cur[topicId]
        else cur[topicId] = v
        return { ...prev, [modeId]: cur }
      })
    },
    [problemCount]
  )

  const quotaGroupedByMode = useMemo(() => {
    return generationModes.map((mid) => {
      const qp = quotaByMode[mid] || {}
      const pool = poolForGenerationMode(mid, selectedByMode, grammarConfig.sections)
      const poolSet = new Set(pool)
      const grouped = grammarConfig.sections
        .map((sec) => ({
          title: sec.title,
          rows: sec.topics
            .filter((t) => poolSet.has(t.id))
            .map((t) => ({
              id: t.id,
              label: t.label,
              modeId: mid,
              count: Number(qp[t.id]) || 0,
            })),
        }))
        .filter((g) => g.rows.length > 0)
      return {
        modeId: mid,
        modeLabel: getGrammarWorkbookMode(mid).shortTitle,
        target: countsByMode[mid] || 0,
        sum: sumQuota(qp),
        sections: grouped,
      }
    })
  }, [generationModes, quotaByMode, selectedByMode, grammarConfig.sections, countsByMode])

  const cartByMode = useMemo(() => {
    return MODE_IDS.filter((id) => (selectedByMode[id] || []).length > 0).map((id) => {
      const set = new Set(selectedByMode[id] || [])
      const sections = grammarConfig.sections
        .map((sec) => ({
          title: sec.title,
          topics: sec.topics.filter((t) => set.has(t.id)),
        }))
        .filter((block) => block.topics.length > 0)
      return {
        modeId: id,
        modeLabel: getGrammarWorkbookMode(id).shortTitle,
        sections,
      }
    })
  }, [selectedByMode, grammarConfig.sections])

  const selectionSummary = useMemo(() => {
    const parts = MODE_IDS.filter((id) => (selectedByMode[id] || []).length > 0).map(
      (id) => `${getGrammarWorkbookMode(id).shortTitle} ${(selectedByMode[id] || []).length}개`
    )
    const total = MODE_IDS.reduce((a, id) => a + (selectedByMode[id] || []).length, 0)
    return { parts, total }
  }, [selectedByMode])

  const resultModeLabel = useMemo(() => {
    if (generationModes.length > 1) {
      return generationModes.map((id) => getGrammarWorkbookMode(id).shortTitle).join(' + ')
    }
    return getGrammarWorkbookMode(generationModes[0]).shortTitle
  }, [generationModes])

  const quotaSum = useMemo(
    () => generationModes.reduce((a, m) => a + sumQuota(quotaByMode[m] || {}), 0),
    [generationModes, quotaByMode]
  )

  const quotaOk =
    generationModes.length > 0 &&
    generationModes.every((mid) => sumQuota(quotaByMode[mid] || {}) === (countsByMode[mid] || 0))

  const quotaMismatch =
    generationModes.length > 0 &&
    generationModes.some((mid) => {
      const t = countsByMode[mid] || 0
      const s = sumQuota(quotaByMode[mid] || {})
      return t > 0 && s > 0 && s !== t
    })

  const grammarApiRoundCount = useMemo(
    () =>
      generationModes.reduce(
        (sum, mid) => sum + countGrammarApiRoundsForProblemCount(countsByMode[mid] || 0, mid),
        0
      ),
    [generationModes, countsByMode]
  )

  const generateBlockedReason = useMemo(() => {
    if (loading) return null
    if (!apiKey?.trim()) {
      return '메인 화면 상단에서 OpenAI API 키를 입력하면 생성할 수 있습니다.'
    }
    if (generationModes.length === 0) {
      return '이 문법에 출제할 세부 주제가 없습니다.'
    }
    if (!quotaOk) {
      return `유형별 문항 배분 합이 목표(${problemCount})와 맞지 않습니다. 숫자를 맞추거나 「합계 목표에 맞추기」를 눌러 주세요.`
    }
    return null
  }, [loading, apiKey, generationModes.length, quotaOk, problemCount])

  const handleGenerate = useCallback(async () => {
    setError(null)
    if (!apiKey?.trim()) {
      setError('상단에서 OpenAI API 키를 입력해 주세요.')
      return
    }
    if (generationModes.length === 0) {
      setError('출제할 세부 주제가 없습니다.')
      return
    }
    if (
      !generationModes.every((mid) => sumQuota(quotaByMode[mid] || {}) === (countsByMode[mid] || 0))
    ) {
      setError('유형별 문항 배분이 목표와 다릅니다. 조정하거나 「합계 목표에 맞추기」를 눌러 주세요.')
      return
    }
    setLoading(true)
    setResultText('')
    setGeneratedProblems(null)
    try {
      const merged = []
      const textParts = []
      let globalNo = 0
      for (const mid of generationModes) {
        const n = countsByMode[mid] || 0
        const qp = quotaByMode[mid] || {}
        const picked = selectedByMode[mid] || []
        const topicsForGenerate = picked.length > 0 ? sortTopicIds(picked) : []
        const { fullText, problems } = await generateGrammarWorkbookProblems(
          apiKey,
          difficulty,
          topicsForGenerate,
          n,
          grammarConfig,
          mid,
          qp
        )
        const modeMeta = getGrammarWorkbookMode(mid)
        const chunk = (problems || []).map((p, i) => ({
          ...p,
          grammarWorkbookModeId: mid,
          no: globalNo + i + 1,
        }))
        globalNo += chunk.length
        merged.push(...chunk)
        textParts.push(`━━━━ ${modeMeta.shortTitle} 유형 · ${chunk.length}문항 ━━━━\n\n${fullText}`)
      }
      setResultText(textParts.join('\n\n'))
      setGeneratedProblems(merged.length ? merged : null)
    } catch (e) {
      let msg = e?.message || String(e)
      if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        msg += ' 브라우저에서 api.openai.com 접속이 막혔을 수 있습니다. 네트워크·VPN·확장 프로그램을 확인해 주세요.'
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [
    apiKey,
    difficulty,
    generationModes,
    countsByMode,
    quotaByMode,
    selectedByMode,
    grammarConfig,
  ])

  const handleCopy = useCallback(() => {
    if (!resultText) return
    navigator.clipboard.writeText(resultText).then(
      () => alert('결과가 클립보드에 복사되었습니다.'),
      () => alert('복사에 실패했습니다.')
    )
  }, [resultText])

  const handleReview = useCallback(async () => {
    setError(null)
    if (!apiKey?.trim()) {
      setError('상단에서 OpenAI API 키를 입력해 주세요.')
      return
    }
    const draft = resultText.trim()
    if (!draft) {
      setError('검토할 텍스트가 없습니다.')
      return
    }
    setReviewLoading(true)
    try {
      const out = await reviewGrammarWorkbookDraft(apiKey, difficulty, grammarConfig.label, draft)
      setResultText(out)
      setGeneratedProblems(null)
    } catch (e) {
      let msg = e?.message || String(e)
      if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        msg += ' 브라우저에서 api.openai.com 접속이 막혔을 수 있습니다. 네트워크·VPN·확장 프로그램을 확인해 주세요.'
      }
      setError(msg)
    } finally {
      setReviewLoading(false)
    }
  }, [apiKey, difficulty, grammarConfig.label, resultText])

  const handleExportMockPdf = useCallback(async () => {
    if (!generatedProblems?.length) {
      setError('PDF로보낼 문항 데이터가 없습니다. 문제를 다시 생성해 주세요.')
      return
    }
    setPdfExporting(true)
    setError(null)
    try {
      await exportGrammarWorkbookMockExamPdf({
        problems: generatedProblems,
        sections: grammarConfig.sections,
        modeId: questionModeId,
        testNumber: pdfTestNo,
        title: pdfTitle.trim() || '보듬교육 문법 TEST',
        timeLimit: pdfTimeLimit.trim() || '제한 시간 : 30분',
        footerLabel: '보듬교육 문법 TEST',
        grammarLabel: grammarConfig.label,
      })
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setPdfExporting(false)
    }
  }, [
    generatedProblems,
    grammarConfig.sections,
    grammarConfig.label,
    questionModeId,
    pdfTestNo,
    pdfTitle,
    pdfTimeLimit,
  ])

  return (
    <div className="grammar-wb-container">
      <div className="grammar-wb-header">
        <h2>문법 워크북 생성기</h2>
        <p>
          문법 영역을 고른 뒤, <strong>문제 유형 탭(개념·워크북·객관식·서술형)</strong>을 바꿔 가며 대단원 아래{' '}
          <strong>세부 주제를 체크</strong>하면, 그 탭에만 선택이 저장됩니다.{' '}
          <strong>한 탭에서도 아무 것도 체크하지 않은 상태</strong>로 생성하면, 그때는 <strong>현재 탭 유형</strong>으로{' '}
          전체 세부 주제 풀에서 <strong>무작위</strong> 출제됩니다.{' '}
          <strong>두 탭 이상에서 하나라도 체크</strong>해 두면, 생성 시 유형마다 맞는 프롬프트로 나누어 출제한 뒤{' '}
          <strong>한 텍스트·한 PDF</strong>로 이어 붙입니다. 문항 수(25/50/100)는 전체 합계이며, 탭별 체크 개수 비율로 유형별 문항 수를 나눕니다.
        </p>
        <p className="grammar-wb-theme-desc">
          <strong>현재: {grammarConfig.label}</strong> — {grammarConfig.description}
        </p>
      </div>

      <div className="grammar-wb-tabs" role="tablist" aria-label="문제 유형">
        {GRAMMAR_WORKBOOK_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={questionModeId === m.id}
            className={`grammar-wb-tab ${questionModeId === m.id ? 'grammar-wb-tab-active' : ''}`}
            onClick={() => setQuestionModeId(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="grammar-wb-mode-desc">
        <strong>{questionMode.shortTitle}</strong> — {questionMode.description}{' '}
        <span className="grammar-wb-mode-desc-hint">(체크는 이 탭에만 적용)</span>
      </p>

      <div className="grammar-wb-toolbar">
        <div className="grammar-wb-toolbar-main">
          <div className="grammar-wb-option grammar-wb-option-wide">
            <label htmlFor="gwb-grammar">문법 영역</label>
            <select
              id="gwb-grammar"
              value={grammarKind}
              onChange={(e) => setGrammarKind(e.target.value)}
              className="grammar-wb-select"
            >
              {GRAMMAR_WORKBOOK_TYPES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grammar-wb-option">
            <label htmlFor="gwb-difficulty">문제 난이도</label>
            <select
              id="gwb-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="grammar-wb-select"
              aria-describedby="gwb-difficulty-hint"
            >
              {DIFFICULTY_GRADES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p id="gwb-difficulty-hint" className="grammar-wb-field-hint">
              선택한 학년에 맞춰 <strong>문제집·학교 내신</strong>에 가까운 어휘·문장 길이·지시문 톤으로 만듭니다.
            </p>
          </div>
          <div className="grammar-wb-option">
            <span className="grammar-wb-radio-label" id="gwb-count-label">
              문항 수
            </span>
            <div className="grammar-wb-radio-row" role="group" aria-labelledby="gwb-count-label">
              {PROBLEM_COUNT_OPTIONS.map((c) => (
                <label key={c} className="grammar-wb-radio-pill">
                  <input
                    type="radio"
                    name="gwb-problem-count"
                    value={c}
                    checked={problemCount === c}
                    onChange={() => setProblemCount(c)}
                  />
                  <span>{c}문항</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grammar-wb-toolbar-actions">
            <button type="button" className="btn-gwb btn-gwb-ghost" onClick={selectAll}>
              세부 주제 전체 선택
            </button>
            <button type="button" className="btn-gwb btn-gwb-ghost" onClick={deselectAll}>
              세부 주제 전체 해제
            </button>
          </div>
        </div>
        <div className="grammar-wb-toolbar-meta" aria-label="선택·생성 요약">
          <span className="grammar-wb-count-pill">
            탭별 선택:{' '}
            {selectionSummary.parts.length > 0 ? (
              <>
                <strong>{selectionSummary.parts.join(', ')}</strong> (합계 {selectionSummary.total}체크)
              </>
            ) : (
              <span className="grammar-wb-random-hint">없음 → 생성 시 현재 탭·전체 풀 랜덤</span>
            )}
          </span>
          <span className="grammar-wb-count-pill grammar-wb-count-pill-accent">
            생성 예정: <strong>{problemCount}</strong>문항 (API <strong>{grammarApiRoundCount}</strong>회 호출)
          </span>
        </div>
      </div>

      <div className="grammar-wb-topics-wrap">
        <h3 className="grammar-wb-topics-title">
          출제 범위 — {grammarConfig.label} · <strong>{questionMode.shortTitle}</strong> 탭 전용 체크
        </h3>
        {grammarConfig.sections.map((section) => (
          <section key={section.id} className="grammar-wb-section">
            <div className="grammar-wb-section-head">
              <h4 className="grammar-wb-section-title">{section.title}</h4>
              <div className="grammar-wb-section-btns">
                <button type="button" className="btn-gwb btn-gwb-mini" onClick={() => selectSectionTopics(section)}>
                  이 단원만 전체 선택
                </button>
                <button type="button" className="btn-gwb btn-gwb-mini" onClick={() => deselectSectionTopics(section)}>
                  이 단원만 전체 해제
                </button>
              </div>
            </div>
            <ul className="grammar-wb-topic-list">
              {section.topics.map((t) => (
                <li key={t.id}>
                  <label className="grammar-wb-check-label">
                    <input
                      type="checkbox"
                      checked={(selectedByMode[questionModeId] || []).includes(t.id)}
                      onChange={() => toggleTopic(t.id)}
                    />
                    <span>{t.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="grammar-wb-cart-panel">
        <div className="grammar-wb-cart">
          <h3 className="grammar-wb-cart-title">선택한 출제 항목 (유형 탭별)</h3>
          {cartByMode.length === 0 ? (
            <p className="grammar-wb-cart-empty">
              어느 탭에도 체크 없음 — 생성 시 <strong>현재 탭 유형</strong>으로 전체 풀에서 무작위 출제됩니다.
            </p>
          ) : (
            <ul className="grammar-wb-cart-list">
              {cartByMode.map((modeBlock) => (
                <li key={modeBlock.modeId} className="grammar-wb-cart-mode">
                  <span className="grammar-wb-cart-mode-label">{modeBlock.modeLabel}</span>
                  <ul className="grammar-wb-cart-list">
                    {modeBlock.sections.map((block) => (
                      <li key={`${modeBlock.modeId}-${block.title}`} className="grammar-wb-cart-block">
                        <span className="grammar-wb-cart-cat">{block.title}</span>
                        <ul className="grammar-wb-cart-items">
                          {block.topics.map((t) => (
                            <li key={t.id} className="grammar-wb-cart-item">
                              <span className="grammar-wb-cart-item-name">{t.label}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grammar-wb-quota">
          <div className="grammar-wb-quota-head">
            <h3 className="grammar-wb-quota-title">문항 배분 — 유형·세부 주제별 (숫자 직접 수정 가능)</h3>
            <div className="grammar-wb-quota-actions">
              <button
                type="button"
                className="btn-gwb btn-gwb-mini"
                onClick={reshuffleQuota}
                disabled={quotaGroupedByMode.length === 0}
              >
                무작위 다시
              </button>
              <button
                type="button"
                className="btn-gwb btn-gwb-mini"
                onClick={balanceQuotaToTarget}
                disabled={quotaGroupedByMode.length === 0}
              >
                합계 목표에 맞추기
              </button>
            </div>
          </div>
          {quotaMismatch ? (
            <p className="grammar-wb-quota-warn">
              유형별 합계가 목표와 다르면 생성할 수 없습니다. 숫자를 조정하거나 「합계 목표에 맞추기」를 눌러 주세요.
            </p>
          ) : null}
          {quotaGroupedByMode.length === 0 ? (
            <p className="grammar-wb-quota-empty">배분 정보가 없습니다.</p>
          ) : (
            <div className="grammar-wb-quota-by-mode">
              {quotaGroupedByMode.map((block) => (
                <div key={block.modeId} className="grammar-wb-quota-mode-wrap">
                  <p className="grammar-wb-quota-mode-headline">
                    <strong>{block.modeLabel}</strong> 유형 — 목표 <strong>{block.target}</strong>문항 · 합계{' '}
                    <strong>{block.sum}</strong>
                  </p>
                  <ul className="grammar-wb-quota-sections">
                    {block.sections.map((g) => (
                      <li key={`${block.modeId}-${g.title}`} className="grammar-wb-quota-sec">
                        <span className="grammar-wb-quota-sec-title">{g.title}</span>
                        <ul className="grammar-wb-quota-rows">
                          {g.rows.map((row) => (
                            <li key={`${block.modeId}-${row.id}`} className="grammar-wb-quota-row">
                              <span className="grammar-wb-quota-row-label">{row.label}</span>
                              <label className="grammar-wb-quota-input-wrap">
                                <span className="grammar-wb-quota-input-sr">문항 수</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={problemCount}
                                  className="grammar-wb-quota-input"
                                  value={row.count}
                                  onChange={(e) => updateTopicQuota(row.modeId, row.id, e.target.value)}
                                />
                                <span className="grammar-wb-quota-suffix">문항</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="grammar-wb-quota-total">
            합계 <strong>{quotaSum}</strong> / 목표 <strong>{problemCount}</strong>문항
          </p>
        </div>
      </div>

      <div className="grammar-wb-generate-row">
        <button
          type="button"
          className="btn-gwb btn-gwb-primary"
          onClick={handleGenerate}
          disabled={loading || reviewLoading || !apiKey?.trim() || !quotaOk}
        >
          {loading
            ? `생성 중… (${problemCount}문항 · ${grammarApiRoundCount}단계)`
            : `${problemCount}문항 한 번에 만들기`}
        </button>
      </div>

      {loading ? (
        <p className="grammar-wb-loading-hint" role="status" aria-live="polite">
          OpenAI 서버 응답까지 <strong>{loadingSeconds}</strong>초 경과 · 보통 1~6분 걸릴 수 있습니다.{' '}
          {grammarApiRoundCount > 1
            ? `내부적으로 총 ${grammarApiRoundCount}회(유형·문항 수에 따라 분할)로 API를 호출합니다. `
            : ''}
          오래 걸리면 네트워크·VPN·방화벽 또는 API 키·결제 한도를 확인해 주세요.
        </p>
      ) : null}

      {generateBlockedReason ? (
        <p className="grammar-wb-generate-blocked" role="status">
          {generateBlockedReason}
        </p>
      ) : null}

      {error && <div className="grammar-wb-error">{error}</div>}

      {resultText ? (
        <div className="grammar-wb-result">
          {reviewLoading ? (
            <div className="grammar-wb-review-banner" role="status" aria-live="assertive">
              <span className="grammar-wb-review-banner-dot" aria-hidden />
              <div className="grammar-wb-review-banner-text">
                <strong className="grammar-wb-review-banner-title">검토 중</strong>
                <span className="grammar-wb-review-banner-sub">
                  {reviewSeconds}초 경과 · 정답·해설·영문 표현을 점검해 같은 형식으로 고칩니다. 문항이 많으면 수 분 걸릴 수 있습니다.
                </span>
              </div>
            </div>
          ) : null}
          <div className="grammar-wb-result-bar">
            <span className="grammar-wb-result-label">
              {reviewLoading ? '검토 중 — 잠시만 기다려 주세요' : `생성 결과 (${grammarConfig.label} · ${resultModeLabel})`}
            </span>
            <div className="grammar-wb-result-actions">
              <button
                type="button"
                className="btn-gwb btn-gwb-secondary"
                onClick={handleReview}
                disabled={reviewLoading || loading || !apiKey?.trim() || !resultText.trim()}
              >
                {reviewLoading ? `검토 중 (${reviewSeconds}초)` : 'AI 검토·교정 한 번'}
              </button>
              <button
                type="button"
                className="btn-gwb btn-gwb-secondary"
                onClick={handleCopy}
                disabled={reviewLoading}
              >
                전체 복사
              </button>
            </div>
          </div>
          <div className="grammar-wb-pdf-panel">
            <p className="grammar-wb-pdf-panel-title">A4 · 2단 모의고사형 PDF</p>
            <div className="grammar-wb-pdf-fields">
              <label className="grammar-wb-pdf-field">
                <span>시험 번호</span>
                <input
                  type="text"
                  value={pdfTestNo}
                  onChange={(e) => setPdfTestNo(e.target.value)}
                  maxLength={4}
                  className="grammar-wb-pdf-input"
                  placeholder="01"
                />
              </label>
              <label className="grammar-wb-pdf-field grammar-wb-pdf-field-grow">
                <span>제목</span>
                <input
                  type="text"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                  className="grammar-wb-pdf-input"
                />
              </label>
              <label className="grammar-wb-pdf-field">
                <span>제한 시간 문구</span>
                <input
                  type="text"
                  value={pdfTimeLimit}
                  onChange={(e) => setPdfTimeLimit(e.target.value)}
                  className="grammar-wb-pdf-input"
                />
              </label>
            </div>
            <p className="grammar-wb-pdf-hint">
              PDF 끝에는 <strong>해설지</strong>(정답·해설·서술형 모범답안)가 항상 이어집니다.
            </p>
            <button
              type="button"
              className="btn-gwb btn-gwb-primary grammar-wb-pdf-btn"
              onClick={handleExportMockPdf}
              disabled={pdfExporting || !generatedProblems?.length}
            >
              {pdfExporting ? 'PDF 만드는 중…' : '모의고사형 PDF 다운로드'}
            </button>
          </div>
          <p className="grammar-wb-result-edit-hint">
            아래 내용은 직접 수정할 수 있습니다. 「전체 복사」에는 수정된 글이 반영됩니다. 「AI 검토·교정」은 현재 칸의 글을 한 번 더 다듬어 덮어쓰며, 이후에는 PDF용 구조 데이터가 맞지 않아 비워지므로 PDF가 필요하면 검토 후 다시 생성해 주세요.
          </p>
          <textarea
            className="grammar-wb-result-text"
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            rows={24}
            spellCheck={false}
            aria-label="생성 결과 편집"
            disabled={reviewLoading}
          />
        </div>
      ) : (
        <div className="grammar-wb-content grammar-wb-content-hint">
          <p className="grammar-wb-placeholder">
            API 키를 입력하고 문법 영역·문항 수를 고른 뒤 「{problemCount}문항 한 번에 만들기」를 누르면 문제지 형식의 텍스트가 표시됩니다.
            탭마다 체크를 나누어 두면 유형별로 나눠 만든 뒤 한 번에 이어 붙이고, 어느 탭에도 체크가 없으면 현재 탭 유형으로 전체 범위에서 랜덤 출제됩니다.
          </p>
        </div>
      )}

      {onClose && (
        <div className="grammar-wb-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            메인 메뉴로 돌아가기
          </button>
        </div>
      )}
    </div>
  )
}
