import { useState } from 'react'
import { summarizeInKorean, findKeySentence } from '../utils/koreanSummaryAnalyzer'
import './KoreanSummaryInput.css'

function KoreanSummaryInput({ text, setText, onProcess, apiKey }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)

  const handleProcess = async () => {
    if (!text || text.trim().length === 0) {
      alert('지문을 입력해주세요.')
      return
    }

    if (!apiKey) {
      alert('API 키를 설정해주세요.')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      const result = await processAllTexts(text, apiKey)
      onProcess(result)
    } catch (err) {
      setError(err.message || '처리 중 오류가 발생했습니다.')
      alert(err.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  const processAllTexts = async (inputText, apiKey) => {
    // 텍스트를 //로 분리
    const textBlocks = inputText.split('//').filter(block => block.trim().length > 0)
    const results = []

    for (let i = 0; i < textBlocks.length; i++) {
      const block = textBlocks[i].trim()
      
      // 출처/영어원문/한글해석 형식 파싱
      const parts = block.split('/').map(p => p.trim())
      let source = ''
      let englishText = ''

      if (parts.length >= 3) {
        // 출처/영어원문/한글해석 형식 - 한글해석 제거
        source = parts[0]
        englishText = parts.slice(1, -1).join('/') // 한글해석 제외하고 영어원문만
      } else if (parts.length >= 2) {
        // 출처/영어원문 형식
        source = parts[0]
        englishText = parts[1]
      } else {
        source = `지문 ${i + 1}`
        englishText = block
      }
      
      // 영어원문에서 "/해석" 패턴 제거 (줄바꿈 포함 모든 패턴)
      englishText = englishText.replace(/\/해석[\s\S]*$/g, '').trim() // "/해석" 이후 모든 내용 제거
      englishText = englishText.replace(/\/해석[^\n]*/g, '').trim() // "/해석" 패턴 제거
      // 한글 문자가 포함된 라인 전체 제거
      const lines = englishText.split('\n')
      englishText = lines.filter(line => !/[가-힣]/.test(line)).join('\n').trim()

      try {
        const summary = await summarizeInKorean(englishText, apiKey)
        let keySentence = ''
        
        // 주제 문장 찾기
        try {
          keySentence = await findKeySentence(englishText, apiKey)
        } catch (keyError) {
          console.warn(`주제 문장 찾기 실패 (${source}):`, keyError)
          // 주제 문장 찾기 실패해도 계속 진행
        }
        
        results.push({
          source: source.trim(),
          original: englishText.trim(),
          summary: summary,
          keySentence: keySentence
        })
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 중 오류:`, error)
        results.push({
          source: source.trim(),
          original: englishText.trim(),
          summary: `[오류: ${error.message}]`,
          error: error.message
        })
      }
    }

    // 결과 포맷팅 (SUM40과 동일한 형식)
    const formattedResults = results.map((r, index) => {
      if (r.error) {
        return {
          text: r.source + '\n' + r.original + '\n\n[오류: ' + r.error + ']\n\n',
          summary: null
        }
      }
      
      let formatted = r.source || `지문 ${index + 1}`
      formatted += '\n\n' // 출처 다음 줄바꿈 2번
      formatted += r.original + '\n\n' // 영어원문 + 줄바꿈 2번
      formatted += '▶\n' // 화살표 기호 + 줄바꿈
      formatted += r.summary + '\n\n\n' // 한글 요약문 + 줄바꿈 3번
      
      return {
        text: formatted,
        summary: r.summary,
        source: r.source || `지문 ${index + 1}`
      }
    })

    const allText = formattedResults.map(r => r.text).join('')
    
    // 답지 생성 (오류가 없고 요약문이 있는 것만)
    const answerKeyResults = results.filter(r => !r.error && r.summary)
    let answerKeyText = ''
    
    if (answerKeyResults.length > 0) {
      answerKeyText += '\n\n\n━━━━━━━━━━━━━━━━━━━━\n\n'
      answerKeyText += '📋 답지\n\n'
      
      answerKeyResults.forEach((r, index) => {
        answerKeyText += `${r.source || `지문 ${index + 1}`}\n`
        answerKeyText += `${r.summary}\n\n`
      })
    }

    const finalText = allText + answerKeyText

    return {
      original: inputText,
      processed: finalText,
      summary: finalText,
      results: results
    }
  }

  return (
    <div className="korean-summary-input-container">
      <div className="korean-summary-input-header">
        <h2>요약문 한글</h2>
        <p>각 지문을 한글로 한 문장으로 요약합니다.</p>
      </div>

      <div className="korean-summary-input-box">
        <label htmlFor="korean-summary-text-input">지문 입력 (출처/영어원문// 형식으로 구분)</label>
        <textarea
          id="korean-summary-text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="출처/영어원문//&#10;출처2/영어원문2//"
          className="korean-summary-textarea"
        />
      </div>

      {error && (
        <div className="korean-summary-error">
          오류: {error}
        </div>
      )}

      <div className="korean-summary-actions">
        <button
          onClick={handleProcess}
          disabled={isProcessing || !text || !apiKey}
          className="btn btn-primary"
        >
          {isProcessing ? '처리 중...' : '처리 실행'}
        </button>
      </div>
    </div>
  )
}

export default KoreanSummaryInput

