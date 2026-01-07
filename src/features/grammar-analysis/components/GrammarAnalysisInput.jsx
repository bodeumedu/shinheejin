import { useState } from 'react'
import './GrammarAnalysisInput.css'
import { analyzeGrammarHybrid } from '../utils/grammarAnalyzer'

function GrammarAnalysisInput({ text, setText, onProcess, apiKey }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 텍스트에서 출처를 제외하고 영어원문만 추출
  const extractEnglishText = (inputText) => {
    if (!inputText || !inputText.trim()) {
      return inputText
    }

    // "출처/영어원문/한글해석//" 형식인지 확인
    const parts = inputText.split('/')
    
    // "/"로 구분된 부분이 2개 이상이면 형식화된 입력으로 간주
    if (parts.length >= 2) {
      // 첫 번째 부분은 출처이므로 제외, 두 번째 부분이 영어원문
      const englishText = parts[1]?.trim() || ''
      return englishText || inputText // 영어원문이 없으면 원본 반환
    }

    // 형식화되지 않은 입력이면 그대로 반환
    return inputText
  }

  // AI 분석 실행 (문장별 개별 처리)
  const handleProcess = async () => {
    if (!text.trim()) {
      setError('영어 지문을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const englishText = extractEnglishText(text)
      if (!englishText.trim()) {
        setError('분석할 영어 지문을 찾을 수 없습니다.')
        setIsLoading(false)
        return
      }

      const result = await analyzeGrammarHybrid(englishText, apiKey)
      
      if (result.error) {
        setError(result.error)
        return
      }

      onProcess(result)
    } catch (error) {
      console.error('분석 오류:', error)
      setError(error.message || '분석 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="grammar-analysis-input-container">
      <div className="input-section">
        <label htmlFor="text">영어 지문 입력</label>
        <textarea
          id="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="분석할 영어 지문을 입력하세요..."
          rows="15"
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="button-group">
        <button
          type="button"
          className="btn-ai"
          onClick={handleProcess}
          disabled={isLoading || !text.trim() || !apiKey}
        >
          {isLoading ? 'AI 분석 중...' : 'AI 분석 시작'}
        </button>
      </div>
      
      {!apiKey && (
        <div className="error-message" style={{ marginTop: '10px', color: '#856404', background: '#fff3cd' }}>
          ⚠️ API 키가 필요합니다. 상단에서 API 키를 설정해주세요.
        </div>
      )}

    </div>
  )
}

export default GrammarAnalysisInput

