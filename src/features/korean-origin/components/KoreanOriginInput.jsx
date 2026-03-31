import { useState } from 'react'
import { translateEnglishToKorean } from '../utils/koreanOriginAnalyzer'
import './KoreanOriginInput.css'

function KoreanOriginInput({ text, setText, onProcess, apiKey }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!text || !text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }

    if (!apiKey || !apiKey.trim()) {
      setError('API 키를 먼저 설정해주세요.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // "//" 로 블록 분리 (슬래시 한/두 개 앞뒤 공백·줄바꿈 허용)
      const blocks = text.split(/\s*\/\/+\s*/).map(b => b.trim()).filter(b => b.length > 0)
      const outputParts = []

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        // 첫 번째 "/" 로만 출처와 영어원문 분리 (영어원문 안에 "/" 가 있을 수 있음)
        const firstSlash = block.indexOf('/')
        let source = ''
        let englishText = ''

        if (firstSlash === -1) {
          source = `지문 ${i + 1}`
          englishText = block
        } else {
          source = block.slice(0, firstSlash).trim()
          englishText = block.slice(firstSlash + 1).trim()
        }

        if (!englishText || !englishText.replace(/\s/g, '').length) {
          outputParts.push(`${source}\n/`)
          continue
        }

        const koreanTranslation = await translateEnglishToKorean(englishText, apiKey)
        outputParts.push(`${source}\n/\n${englishText}\n/\n${(koreanTranslation || '').trim()}`.trim())
      }

      // 문단마다 // (앞뒤 줄바꿈, 빈 줄 없음), 맨 끝은 반드시 // 로 끝냄
      const result = outputParts.map(p => p.trim()).join('\n//\n') + '\n//'
      onProcess(result)
    } catch (err) {
      setError(err.message || '처리 중 오류가 발생했습니다.')
      alert(err.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="korean-origin-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label htmlFor="korean-origin-text">지문 입력 *</label>
          <textarea
            id="korean-origin-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`출처/영어원문

//

출처2/영어원문2

// 형식 (슬래시 앞뒤 줄바꿈)`}
            rows="12"
            required
            disabled={isLoading}
          />
          <small>형식: 출처/영어원문 후 줄바꿈 두고 // 넣고 줄바꿈 두고 다음 지문 (슬래시 한·두 개 앞뒤 줄바꿈). 영어가 한 문장이면 한글도 한 문장으로, 쉼표·마침표 등 구두점 개수·순서를 영어와 맞춥니다.</small>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="button-group">
          <button
            type="button"
            onClick={() => {
              setText('')
              setError('')
            }}
            className="btn btn-reset"
            disabled={isLoading}
          >
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

export default KoreanOriginInput
