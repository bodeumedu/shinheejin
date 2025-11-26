import { useState } from 'react'
import { summarizeText, findWordMatches } from '../utils/sum40Analyzer'
import './Sum40Input.css'

function Sum40Input({ text, setText, onProcess, apiKey }) {
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
        const summary = await summarizeText(englishText, apiKey)
        
        // 원문 단어와 요약문 단어 매칭 (볼드 처리용)
        let boldedSummary = summary
        try {
          const matchedWords = await findWordMatches(englishText, summary, apiKey)
          console.log('매칭된 단어들:', matchedWords) // 디버깅용
          
          if (matchedWords && matchedWords.length > 0) {
            // 매칭된 단어들을 볼드 처리 (긴 단어부터 처리하여 부분 매칭 방지)
            const sortedWords = matchedWords.sort((a, b) => b.length - a.length)
            
            sortedWords.forEach(word => {
              // 단어 경계를 고려하여 정확히 일치하는 경우만 볼드 처리
              // 이미 볼드 처리된 부분은 건너뛰기
              const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const wordRegex = new RegExp(`(?<!<b>\\s*)\\b(${escapedWord})\\b(?![^<]*</b>)`, 'gi')
              
              boldedSummary = boldedSummary.replace(wordRegex, (match, p1) => {
                // 이미 HTML 태그 안에 있는지 확인
                const beforeMatch = boldedSummary.substring(0, boldedSummary.indexOf(match))
                const openTags = (beforeMatch.match(/<b>/g) || []).length
                const closeTags = (beforeMatch.match(/<\/b>/g) || []).length
                
                // 태그가 열려있지 않은 경우만 볼드 처리
                if (openTags === closeTags) {
                  return `<b>${p1}</b>`
                }
                return match
              })
            })
          }
        } catch (matchError) {
          console.error('단어 매칭 중 오류:', matchError)
          // 매칭 오류 시 원본 요약문 사용
          boldedSummary = summary
        }
        
        results.push({
          source: source.trim(),
          original: englishText.trim(),
          summary: summary,
          boldedSummary: boldedSummary
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

    // 결과 포맷팅
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
      // 볼드 처리된 요약문 사용
      const summaryText = r.boldedSummary || r.summary
      formatted += summaryText + '\n\n\n' // 요약문 + 줄바꿈 3번
      
      return {
        text: formatted,
        summary: summaryText, // HTML 포함된 요약문
        source: r.source || `지문 ${index + 1}`
      }
    })

    const allText = formattedResults.map(r => r.text).join('')

    return {
      original: inputText,
      processed: allText,
      summary: allText,
      results: results
    }
  }

  return (
    <div className="sum40-input-container">
      <div className="sum40-input-header">
        <h2>SUM40 - 40단어 요약</h2>
        <p>각 지문을 약 40단어 내외로 요약합니다.</p>
      </div>

      <div className="sum40-input-box">
        <label htmlFor="sum40-text-input">지문 입력 (출처/영어원문// 형식으로 구분)</label>
        <textarea
          id="sum40-text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="출처/영어원문//&#10;출처2/영어원문2//"
          className="sum40-textarea"
        />
      </div>

      {error && (
        <div className="sum40-error">
          오류: {error}
        </div>
      )}

      <div className="sum40-actions">
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

export default Sum40Input

