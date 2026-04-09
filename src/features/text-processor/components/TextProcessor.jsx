import { useState, useCallback } from 'react'
import { preprocessText } from '../../preprocessor/utils/preprocessorEngine'
import { runPeonaOnDoubleSlashInput } from '../../peona/utils/peonaGenerator'
import { processAllTexts as processComplexDescription } from '../../complex-description/utils/complexDescriptionProcessor'
import { paraphraseText } from '../../paraphrasing/utils/paraphrasingAnalyzer'
import { summarizeInKorean, findKeySentence as findKeySentenceKS } from '../../korean-summary/utils/koreanSummaryAnalyzer'
import { createBlank } from '../../blank/utils/blankAnalyzer'
import './TextProcessor.css'

const MODES = [
  { id: 'preprocessor', label: '🔧 전처리', desc: '출처/영어/한글// 형식 · 영어 구간에 연결부사/대명사 기준 /// 삽입 (API 불필요)', needsApiKey: false },
  { id: 'peona', label: '🌸 피어나', desc: '통합 지문 이택일(한 덩어리) · Gemini 권장', needsApiKey: true },
  { id: 'complex-description', label: '📋 복합서술형', desc: '주제문장{}/복잡문장[]/어휘<> 자동 분석', needsApiKey: true },
  { id: 'paraphrasing', label: '✏️ Paraphrasing', desc: '영어 지문 패러프레이징', needsApiKey: true },
  { id: 'korean-summary', label: '📝 요약문 한글', desc: '한글 한 문장 요약 + 주제 문장', needsApiKey: true },
  { id: 'blank-nouns', label: '📝 빈칸(명사)', desc: '중요 명사 하이라이트 빈칸', needsApiKey: true },
  { id: 'blank-verbs', label: '📝 빈칸(동사)', desc: '중요 동사 하이라이트 빈칸', needsApiKey: true },
  { id: 'blank-adjectives', label: '📝 빈칸(형용사)', desc: '중요 형용사 하이라이트 빈칸', needsApiKey: true },
]

function parseBlocksDoubleSlash(inputText) {
  const textBlocks = []
  let currentBlock = ''
  for (let i = 0; i < inputText.length; i++) {
    const char = inputText[i]
    const nextChar = inputText[i + 1]
    if (char === '/' && nextChar === '/') {
      textBlocks.push(currentBlock)
      currentBlock = ''
      i++
    } else {
      currentBlock += char
    }
  }
  if (currentBlock.trim().length > 0) textBlocks.push(currentBlock)
  return textBlocks
}

function parseSingleSlash(block) {
  const parts = []
  let currentPart = ''
  for (let j = 0; j < block.length; j++) {
    const char = block[j]
    const prevChar = j > 0 ? block[j - 1] : ''
    const nextChar = j < block.length - 1 ? block[j + 1] : ''
    if (char === '/' && prevChar !== '/' && nextChar !== '/') {
      parts.push(currentPart)
      currentPart = ''
    } else {
      currentPart += char
    }
  }
  if (currentPart.length > 0) parts.push(currentPart)
  return parts
}

function processPreprocessor(inputText) {
  // preprocessText는 동기 함수 — async로 감싸면 Promise가 되어 setResults에 잘못 들어가 빈 화면이 됨
  return preprocessText(inputText)
}

async function processPeona(inputText, apiKey, geminiApiKey = '') {
  if (!String(apiKey || '').trim() && !String(geminiApiKey || '').trim()) {
    throw new Error('피어나는 OpenAI 또는 Gemini API 키가 필요합니다.')
  }
  return runPeonaOnDoubleSlashInput(inputText, apiKey, {
    geminiApiKey: String(geminiApiKey || '').trim(),
  })
}

async function processParaphrasing(inputText, apiKey) {
  const textBlocks = parseBlocksDoubleSlash(inputText)
  const results = []
  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i]
    const parts = parseSingleSlash(block)
    const source = parts[0] || ''
    const englishText =
      parts.length >= 3 ? parts.slice(1, -1).join('/') : (parts[1] || '')
    if (!englishText.trim()) continue
    try {
      const paraphrased = await paraphraseText(englishText, apiKey)
      results.push({ source: source.trim(), original: englishText, paraphrased })
    } catch (error) {
      results.push({ source: source.trim(), original: englishText, paraphrased: `[오류: ${error.message}]` })
    }
  }
  return results.map((r, i) => {
    const s = r.source || `지문 ${i + 1}`
    return s + '\n' + r.original + '\n↓\n' + r.paraphrased + '\n\n\n'
  }).join('')
}

async function processKoreanSummary(inputText, apiKey) {
  const textBlocks = inputText.split('//').filter(b => b.trim().length > 0)
  const results = []
  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i].trim()
    const parts = block.split('/').map(p => p.trim())
    let source, englishText
    if (parts.length >= 3) { source = parts[0]; englishText = parts.slice(1, -1).join('/') }
    else if (parts.length >= 2) { source = parts[0]; englishText = parts[1] }
    else { source = `지문 ${i + 1}`; englishText = block }

    try {
      const summary = await summarizeInKorean(englishText, apiKey)
      let keySentence = ''
      try { keySentence = await findKeySentenceKS(englishText, apiKey) } catch {}
      results.push({ source: source.trim(), original: englishText.trim(), summary, keySentence })
    } catch (error) {
      results.push({ source: source.trim(), original: englishText.trim(), summary: `[오류: ${error.message}]`, error: error.message })
    }
  }

  let text = results.map((r, i) => {
    const s = r.source || `지문 ${i + 1}`
    return s + '\n\n' + r.original + '\n\n▶\n' + r.summary + '\n\n\n'
  }).join('')

  const valid = results.filter(r => !r.error && r.summary)
  if (valid.length > 0) {
    text += '\n\n━━━━━━━━━━━━━━━━━━━━\n\n📋 답지\n\n'
    valid.forEach((r, i) => { text += `${r.source || `지문 ${i + 1}`}\n${r.summary}\n\n` })
  }
  return text
}

async function processBlank(inputText, blankType, apiKey) {
  const texts = inputText.split('//').map(t => t.trim()).filter(t => t.length > 0)
  const divided = texts.map((textBlock) => {
    const parts = textBlock.split('/').map((p) => p.trim())
    if (parts.length >= 3) {
      return {
        title: parts[0] || '',
        english: parts.slice(1, -1).join('/'),
        korean: parts[parts.length - 1] || '',
      }
    }
    return { title: parts[0] || '', english: parts[1] || '', korean: parts[2] || '' }
  })

  const results = []
  for (let i = 0; i < divided.length; i++) {
    const tb = divided[i]
    if (!tb.english.trim()) continue
    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const blankResult = await createBlank(tb.english, blankType, apiKey)
        if (!blankResult.textWithBlanks) throw new Error('하이라이트 결과가 비어 있습니다.')
        results.push({ ...tb, ...blankResult, blankType })
        break
      } catch (error) {
        if (error.message?.includes('파싱할 수 없습니다') && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * attempt))
          continue
        }
        if (attempt === maxRetries || !error.message?.includes('파싱할 수 없습니다')) {
          results.push({ ...tb, textWithBlanks: `[오류: ${error.message}]`, answers: [], blankCount: 0, blankType, error: error.message })
          break
        }
      }
    }
  }

  const blankTypeKorean = { 'nouns': '명사', 'verbs': '동사', 'adjectives': '형용사' }
  let output = `━━━ ${blankTypeKorean[blankType] || blankType} 하이라이트 빈칸 ━━━\n\n`
  results.forEach((r, i) => {
    output += `【${r.title || `지문 ${i + 1}`}】\n`
    const plain = (r.textWithBlanks || '').replace(/<b>(.*?)<\/b>/gi, '[$1]')
    output += plain + '\n\n'
  })

  output += '\n━━━ 답지 ━━━\n\n'
  results.forEach((r, i) => {
    if (r.error) return
    const boldMatches = [...(r.textWithBlanks || '').matchAll(/<b>(.*?)<\/b>/gi)]
    const words = boldMatches.map(m => m[1].trim()).filter(Boolean)
    output += `${r.title || `지문 ${i + 1}`} (총 ${words.length}개)\n`
    words.forEach((w, j) => { output += `  ${j + 1}. ${w}\n` })
    output += '\n'
  })

  return output
}

/** 전처리 결과 패널과 동일한 문자열 (피어나 등으로 넘길 때 사용) */
function buildPreprocessorOutputString(data) {
  if (!data) return ''
  if (data.results && data.results.length > 0) {
    let s = ''
    data.results.forEach((r, idx) => {
      if (idx > 0) s += r.separator || ''
      s += r.processed || ''
      if (idx === data.results.length - 1 && r.separator) s += r.separator
    })
    return s
  }
  return data.processed || ''
}

function TextProcessor({ apiKey, geminiApiKey = '' }) {
  const [text, setText] = useState('')
  const [selectedMode, setSelectedMode] = useState('preprocessor')
  const [results, setResults] = useState({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [processingStatus, setProcessingStatus] = useState('')

  const currentMode = MODES.find(m => m.id === selectedMode)

  const handleProcess = useCallback(async () => {
    if (!text.trim()) { setError('지문을 입력해주세요.'); return }
    if (currentMode.needsApiKey && !apiKey?.trim() && !geminiApiKey?.trim()) {
      setError('API 키를 먼저 설정해주세요. (피어나는 Gemini 키만으로도 가능)')
      return
    }

    setIsProcessing(true)
    setError('')
    setProcessingStatus(`${currentMode.label} 처리 중...`)

    try {
      let result
      switch (selectedMode) {
        case 'preprocessor':
          result = processPreprocessor(text)
          setResults(prev => ({ ...prev, [selectedMode]: { type: 'preprocessor', data: result } }))
          break
        case 'peona':
          result = await processPeona(text, apiKey, geminiApiKey)
          setResults(prev => ({ ...prev, [selectedMode]: { type: 'text', data: result } }))
          break
        case 'complex-description':
          result = await processComplexDescription(text, apiKey)
          setResults(prev => ({ ...prev, [selectedMode]: { type: 'complex', data: result } }))
          break
        case 'paraphrasing':
          result = await processParaphrasing(text, apiKey)
          setResults(prev => ({ ...prev, [selectedMode]: { type: 'text', data: result } }))
          break
        case 'korean-summary':
          result = await processKoreanSummary(text, apiKey)
          setResults(prev => ({ ...prev, [selectedMode]: { type: 'text', data: result } }))
          break
        case 'blank-nouns':
          result = await processBlank(text, 'nouns', apiKey)
          setResults(prev => ({ ...prev, [selectedMode]: { type: 'text', data: result } }))
          break
        case 'blank-verbs':
          result = await processBlank(text, 'verbs', apiKey)
          setResults(prev => ({ ...prev, [selectedMode]: { type: 'text', data: result } }))
          break
        case 'blank-adjectives':
          result = await processBlank(text, 'adjectives', apiKey)
          setResults(prev => ({ ...prev, [selectedMode]: { type: 'text', data: result } }))
          break
        default:
          break
      }
    } catch (err) {
      console.error('처리 중 오류:', err)
      setError(err.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
      setProcessingStatus('')
    }
  }, [text, selectedMode, apiKey, geminiApiKey, currentMode])

  const currentResult = results[selectedMode]

  const handleCopy = () => {
    if (!currentResult) return
    let copyText = ''
    if (currentResult.type === 'preprocessor') {
      copyText = buildPreprocessorOutputString(currentResult.data)
    } else if (currentResult.type === 'complex') {
      copyText = currentResult.data.processed
    } else {
      copyText = currentResult.data
    }
    navigator.clipboard.writeText(copyText)
    alert('결과가 클립보드에 복사되었습니다.')
  }

  const handleContinueToPeona = () => {
    if (!currentResult || currentResult.type !== 'preprocessor') return
    if (!apiKey?.trim() && !geminiApiKey?.trim()) {
      alert('피어나는 OpenAI 또는 Gemini API 키가 필요합니다. 상단에서 키를 설정해 주세요.')
      return
    }
    const out = buildPreprocessorOutputString(currentResult.data).trim()
    if (!out) {
      alert('전처리된 텍스트가 비어 있습니다. 지문 형식(출처/영어/한글//)을 확인해 주세요.')
      return
    }
    setText(out)
    setSelectedMode('peona')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const renderResult = () => {
    if (!currentResult) return null

    if (currentResult.type === 'preprocessor') {
      const data = currentResult.data
      return (
        <div className="tp-result-grid">
          <div className="tp-result-panel">
            <h4>원본 텍스트</h4>
            <div className="tp-result-content">
              <pre>{data.original}</pre>
            </div>
          </div>
          <div className="tp-result-panel">
            <h4>전처리된 텍스트</h4>
            <div className="tp-result-content">
              <pre>
                {data.results && data.results.length > 0
                  ? data.results.map((r, idx) => (
                    <span key={idx} style={{ color: r.isValid ? '#2c3e50' : '#e74c3c' }}>
                      {idx > 0 ? (r.separator || '') : ''}{r.processed}
                      {idx === data.results.length - 1 && r.separator ? r.separator : ''}
                    </span>
                  ))
                  : data.processed
                }
              </pre>
            </div>
          </div>
        </div>
      )
    }

    if (currentResult.type === 'complex') {
      const data = currentResult.data
      return (
        <div className="tp-result-grid">
          <div className="tp-result-panel">
            <h4>원본 텍스트</h4>
            <div className="tp-result-content">
              <pre>{data.original}</pre>
            </div>
          </div>
          <div className="tp-result-panel">
            <h4>처리된 텍스트</h4>
            <div className="tp-result-content">
              <pre>{data.processed}</pre>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="tp-result-single">
        <pre>{currentResult.data}</pre>
      </div>
    )
  }

  return (
    <div className="text-processor">
      <div className="tp-top">
        <div className="tp-input-area">
          <label>지문 입력 (출처/영어/한글// 형식)</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="출처/영어/한글// 출처2/영어2/한글2// 형식으로 입력하세요."
            disabled={isProcessing}
          />
          <small>형식: 출처/영어/한글// (영어 구간 안에 / 가 있어도 됨 · // 로 지문 구분)</small>
        </div>
        <div className="tp-mode-area">
          <label>처리 모드 선택</label>
          <div className="tp-mode-tabs">
            {MODES.map(mode => (
              <button
                key={mode.id}
                className={`tp-mode-tab ${selectedMode === mode.id ? 'tp-mode-tab-active' : ''}`}
                onClick={() => setSelectedMode(mode.id)}
                disabled={isProcessing}
              >
                <span>{mode.label}</span>
                {results[mode.id] && <span className="tp-mode-done">완료</span>}
              </button>
            ))}
          </div>
          <div className="tp-mode-desc">{currentMode?.desc}</div>
          <div className="tp-action-buttons">
            <button
              className="tp-btn tp-btn-process"
              onClick={handleProcess}
              disabled={
                isProcessing ||
                !text.trim() ||
                (currentMode?.needsApiKey && !apiKey?.trim() && !geminiApiKey?.trim())
              }
            >
              {isProcessing ? processingStatus : '실행하기'}
            </button>
            <button
              className="tp-btn tp-btn-reset"
              onClick={() => { setText(''); setResults({}); setError('') }}
              disabled={isProcessing}
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      {error && <div className="tp-error">{error}</div>}

      {currentResult && (
        <div className="tp-builder-result">
          <div className="tp-result-header">
            <h3>{currentMode?.label} 결과</h3>
            <div className="tp-result-header-actions">
              {currentResult.type === 'preprocessor' && (
                <button
                  type="button"
                  className="tp-btn tp-btn-peona-next"
                  onClick={handleContinueToPeona}
                  disabled={isProcessing}
                  title="전처리 결과를 위 입력창에 넣고 피어나 모드로 전환합니다"
                >
                  🌸 피어나로 이어서 하기
                </button>
              )}
              <button type="button" className="tp-btn tp-btn-copy" onClick={handleCopy}>📋 복사</button>
            </div>
          </div>
          {renderResult()}
        </div>
      )}
    </div>
  )
}

export default TextProcessor
