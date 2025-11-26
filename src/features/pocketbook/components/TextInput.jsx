import { useState } from 'react'
import './TextInput.css'
import { analyzeText } from '../utils/textAnalyzer'

function TextInput({ text, setText, onDivide, apiKey }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 다중 지문 파싱: "제목 / 영어원문 / 한글원문 // 제목2 / 영어원문2 / 한글원문2 //"
  const parseMultipleTexts = (raw) => {
    const blocks = raw
      .split('//')
      .map(b => b.trim())
      .filter(b => b.length > 0)
    return blocks.map(block => {
      const parts = block.split('/').map(p => p.trim())
      return {
        title: parts[0] || '',
        english: parts[1] || '',
        korean: parts[2] || ''
      }
    }).filter(b => b.english && b.english.trim().length > 0)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!text.trim()) {
      setError('지문을 입력해주세요. 형식: "제목 / 영어원문 / 한글원문 // ..."')
      return
    }

    setIsLoading(true)
    setError('')
    
    try {
      const parsed = parseMultipleTexts(text)
      // 단일 영어 지문만 주어진 경우도 허용(제목/해석 없이)
      const results = parsed.length > 0 ? parsed : [{ title: '', english: text.trim(), korean: '' }]
      onDivide(results)
    } catch (error) {
      console.error('분석 중 오류 발생:', error)
      setError(error.message || '분석 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="text-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label htmlFor="text">지문 입력 *</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`형식 예시)\n제목1 / 영어원문1 / 한글원문1 //\n제목2 / 영어원문2 / 한글원문2 //\n\n"//" 두 개가 지문 구분자입니다. 단일 지문도 입력 가능`}
            rows="12"
            required
            disabled={isLoading}
          />
          <small>여러 지문을 한 번에 넣으면 '//' 기준으로 나누어 각각 2페이지씩 생성합니다.</small>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <button type="submit" className="btn-submit" disabled={isLoading}>
          {isLoading ? '지문 나누는 중...' : '지문 나누기'}
        </button>
      </form>
    </div>
  )
}

export default TextInput

