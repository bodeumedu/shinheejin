import { useState } from 'react'
import { generateContentMatchQuestion } from '../utils/contentMatchAnalyzer'
import './ContentMatchInput.css'

const SYMBOLS = ['①', '②', '③', '④', '⑤']

function formatOneResult(passage, questionData) {
  const lines = []
  lines.push('다음 글의 내용과 일치하지 않는 것은?')
  lines.push('')
  lines.push('[지문]')
  lines.push(passage.trim())
  lines.push('')
  questionData.options.forEach((opt, i) => {
    lines.push(SYMBOLS[i] + ' ' + (opt || '').trim())
  })
  lines.push('')
  lines.push('[정답] ' + SYMBOLS[questionData.correctAnswerIndex])
  lines.push('[해설]')
  questionData.explanations.forEach((exp) => {
    lines.push((exp || '').trim() || '(해설 없음)')
  })
  return lines.join('\n')
}

function parseBlock(block) {
  const trimmed = block.trim()
  const firstSlash = trimmed.indexOf('/')
  if (firstSlash === -1) {
    return { source: `지문 1`, englishText: trimmed }
  }
  const source = trimmed.slice(0, firstSlash).trim()
  let rest = trimmed.slice(firstSlash + 1).trim()
  const secondSlash = rest.indexOf('/')
  const englishText = secondSlash === -1 ? rest : rest.slice(0, secondSlash).trim()
  return { source, englishText: englishText.replace(/\/해석[\s\S]*$/g, '').trim() }
}

function extractEnglishOnly(text) {
  const lines = text.split('\n')
  const englishLines = lines
    .map((line) => {
      const koreanMatch = line.match(/[가-힣]+/)
      if (koreanMatch) {
        const englishPart = line.substring(0, koreanMatch.index).trim()
        return englishPart
      }
      return line.trim()
    })
    .filter((line) => {
      if (!line || line.length === 0) return false
      const englishChars = (line.match(/[a-zA-Z]/g) || []).length
      return englishChars >= 10
    })
  return englishLines.join('\n').trim()
}

function ContentMatchInput({ text, setText, onProcess, apiKey }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  const handleProcess = async (e) => {
    e.preventDefault()
    if (!text || !text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }
    if (!apiKey || !apiKey.trim()) {
      setError('API 키를 설정해주세요.')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const blocks = text.split('//').map((b) => b.trim()).filter((b) => b.length > 0)
      const results = []
      let fullOutput = ''

      for (let i = 0; i < blocks.length; i++) {
        const { source, englishText: rawEnglish } = parseBlock(blocks[i])
        const englishText = extractEnglishOnly(rawEnglish || blocks[i])
        if (!englishText || englishText.length < 20) {
          results.push({ source, error: '영어 지문이 없거나 너무 짧습니다.', formatted: '' })
          continue
        }

        try {
          const questionData = await generateContentMatchQuestion(englishText, apiKey)
          const formatted = formatOneResult(englishText, questionData)
          results.push({ source, passage: englishText, questionData, formatted })
          if (fullOutput) fullOutput += '\n\n\n'
          fullOutput += `[${source}]\n\n` + formatted
        } catch (err) {
          results.push({ source, error: err.message || '생성 실패', formatted: '' })
          if (fullOutput) fullOutput += '\n\n\n'
          fullOutput += `[${source}]\n\n[오류: ${err.message}]`
        }
      }

      onProcess({ results, fullText: fullOutput })
    } catch (err) {
      setError(err.message || '처리 중 오류가 발생했습니다.')
      alert(err.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="content-match-input-container">
      <form onSubmit={handleProcess} className="content-match-form">
        <div className="form-section">
          <label htmlFor="content-match-text">지문 입력 *</label>
          <textarea
            id="content-match-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="출처/영어원문/한글해석// 출처2/영어원문2/한글해석2// 형식으로 입력하세요."
            rows="12"
            required
            disabled={isProcessing}
          />
          <small>형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능)</small>
        </div>
        {error && <div className="error-message">{error}</div>}
        <div className="button-group">
          <button type="button" onClick={() => { setText(''); setError(''); }} className="btn btn-reset" disabled={isProcessing}>
            입력 초기화
          </button>
          <button type="submit" className="btn btn-submit" disabled={isProcessing}>
            {isProcessing ? '처리 중...' : '처리 실행'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ContentMatchInput
