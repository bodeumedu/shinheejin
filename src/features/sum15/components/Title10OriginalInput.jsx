import { useState } from 'react'
import './Sum15Input.css'
import { generateTitle10 } from '../utils/sum15Analyzer'

// 시선 title 10 (원형): SUM15 원형과 동일하되 15단어 요약 대신 글의 제목을 약 10단어로 생성
function Title10OriginalInput({ text, setText, onProcess, apiKey }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const processAllTexts = async (inputText, apiKey) => {
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
    if (currentBlock.trim().length > 0) {
      textBlocks.push(currentBlock)
    }

    const results = []

    for (let i = 0; i < textBlocks.length; i++) {
      const block = textBlocks[i]
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

      const source = parts[0] || ''
      const englishText = parts[1] || ''
      const koreanTranslation = parts[2] || ''

      if (!englishText.trim()) {
        console.warn(`지문 ${i + 1}: 영어원문이 없어 건너뜁니다.`)
        continue
      }

      try {
        const title = await generateTitle10(englishText, apiKey)
        const words = (title || '').split(/\s+/).filter(w => w.length > 0)
        const shuffledWords = [...words].sort(() => Math.random() - 0.5)

        const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것'

        results.push({
          source: source.trim(),
          original: englishText,
          summary: title,
          remainingWords: words,
          shuffledWords: shuffledWords,
          transformedShuffledWords: shuffledWords,
          boldedShuffledWords: shuffledWords,
          conditionText,
          koreanTranslation
        })
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 중 오류:`, error)
        results.push({
          source: source.trim(),
          original: englishText,
          summary: `[오류: ${error.message}]`,
          remainingWords: [],
          shuffledWords: [],
          koreanTranslation,
          error: error.message
        })
      }
    }

    const formattedResults = results.map((r, index) => {
      if (r.error) {
        return {
          text: r.source + '\n' + r.original + '\n\n[오류: ' + r.error + ']\n\n\n\n\n\n\n\n\n',
          summary: null
        }
      }
      let formatted = r.source || `지문 ${index + 1}`
      formatted += '\n'
      formatted += r.original + '\n'
      formatted += r.summary + '\n'
      formatted += 'The best title for the passage is ___________________________.\n\n'
      formatted += '<보기>\n' + (r.shuffledWords || []).join(' / ') + '\n\n'
      formatted += '<조건>\n' + (r.conditionText || '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것') + '\n\n\n\n\n'
      return {
        text: formatted,
        summary: r.summary,
        source: r.source || `지문 ${index + 1}`
      }
    })

    const questionText = formattedResults.map(r => r.text).join('')
    const answerSheet = results
      .filter(r => !r.error)
      .map((r) => (r.source || '') + '\n' + r.summary)
      .join('\n\n')

    return {
      original: inputText,
      summary: questionText,
      answerSheet: answerSheet,
      questionParts: formattedResults,
      results
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }
    if (!apiKey) {
      setError('API 키를 먼저 설정해주세요.')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const result = await processAllTexts(text, apiKey)
      onProcess(result)
    } catch (error) {
      console.error('처리 중 오류 발생:', error)
      setError(error.message || '처리 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="sum15-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label htmlFor="text">지문 입력 *</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="출처/영어원문/한글해석// 출처2/영어원문2/한글해석2// 형식으로 입력하세요."
            rows="12"
            required
            disabled={isLoading}
          />
          <small>형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 글의 제목 10단어 정도 (원형)</small>
        </div>
        {error && <div className="error-message">{error}</div>}
        <div className="button-group">
          <button type="button" onClick={() => { setText(''); setError(''); }} className="btn btn-reset" disabled={isLoading}>
            입력 초기화
          </button>
          <button type="submit" className="btn btn-submit" disabled={isLoading}>
            {isLoading ? '처리 중...' : '처리 실행'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Title10OriginalInput
