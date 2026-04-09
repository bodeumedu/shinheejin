import { useState } from 'react'
import { preprocessText } from '../utils/preprocessorEngine'
import './PreprocessorInput.css'

function PreprocessorInput({ text, setText, onProcess }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = preprocessText(text)
      onProcess(result)
    } catch (err) {
      console.error('전처리 중 오류 발생:', err)
      setError(err.message || '전처리 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="preprocessor-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label htmlFor="text">지문 입력 *</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`출처/영어/한글// 또는 줄바꿈 형식:\n출처\n/\n영어\n/\n한글//\n\n// 로 지문 구분 (전처리·통합과 동일 규칙)`}
            rows="12"
            required
            disabled={isLoading}
          />
          <small>
            전처리 규칙 (통합 화면과 동일):<br />
            1. // 기준으로 지문 나누기<br />
            2. 출처/영어/한글 — 한 줄 슬래시 또는 줄바꿈 + / + 줄바꿈 모두 인식<br />
            3. 각 지문당 /// 슬래시 2개 (연결부사 → such → 대명사 → 한정사 우선순위)<br />
            4. 원문은 바꾸지 않고 슬래시만 삽입
          </small>
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" className="btn-submit" disabled={isLoading}>
          {isLoading ? '전처리 중...' : '전처리 실행'}
        </button>
      </form>
    </div>
  )
}

export default PreprocessorInput
