import './KoreanSummaryViewer.css'

// 주제 문장에 형광펜 스타일 적용
function highlightKeySentence(originalText, keySentence) {
  if (!keySentence || !originalText) {
    return originalText.replace(/\n/g, '<br>')
  }
  
  // HTML 이스케이프
  const escapeHtml = (text) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
  
  const escapedOriginal = escapeHtml(originalText)
  const trimmedKeySentence = keySentence.trim()
  const escapedKeySentence = escapeHtml(trimmedKeySentence)
  
  // 정확히 일치하는 문장 찾기 (공백 처리 고려, 대소문자 무시)
  const normalizedKeySentence = escapedKeySentence.replace(/\s+/g, '\\s+')
  const regex = new RegExp(`(${normalizedKeySentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  
  if (regex.test(escapedOriginal)) {
    return escapedOriginal.replace(regex, '<mark>$1</mark>').replace(/\n/g, '<br>')
  }
  
  // 정확히 일치하지 않으면 부분 매칭 시도 (주요 단어들)
  const keyWords = trimmedKeySentence.split(/\s+/).filter(w => w.length > 2)
  if (keyWords.length >= 3) {
    // 최소 3개 이상의 연속 단어로 매칭 시도
    for (let len = Math.min(keyWords.length, 6); len >= 3; len--) {
      const wordsToMatch = keyWords.slice(0, len)
      const pattern = wordsToMatch.map(w => escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
      const partialRegex = new RegExp(`(${pattern})`, 'gi')
      if (partialRegex.test(escapedOriginal)) {
        return escapedOriginal.replace(partialRegex, '<mark>$1</mark>').replace(/\n/g, '<br>')
      }
    }
  }
  
  // 매칭 실패 시 원본 반환
  return escapedOriginal.replace(/\n/g, '<br>')
}

function KoreanSummaryViewer({ data, processedText }) {
  if (!data || !data.results || data.results.length === 0) {
    return <div>데이터가 없습니다.</div>
  }

  // 처리된 텍스트에서 각 지문의 요약문 추출
  const extractSummariesFromProcessedText = (processedText, results) => {
    if (!processedText) return {}
    
    const summaries = {}
    
    // 답지 구분선 이전의 텍스트만 사용
    const mainText = processedText.split('━━━━━━━━━━━━━━━━━━━━')[0] || processedText
    
    // 각 지문별로 분리 (출처로 시작하는 블록)
    results.forEach((result, idx) => {
      if (result.error || !result.source) return
      
      try {
        // 출처를 포함하는 블록 찾기 (출처가 정확히 일치하는 부분)
        const sourcePattern = new RegExp(`${result.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\\n[\\s\\S]*?▶\\n([\\s\\S]*?)(\\n\\n\\n|$)`, 'g')
        const match = mainText.match(sourcePattern)
        
        if (match) {
          // ▶ 다음의 요약문 추출
          const block = match[0]
          const arrowIndex = block.indexOf('▶')
          if (arrowIndex !== -1) {
            let summaryText = block.substring(arrowIndex + 1).trim()
            
            // 줄바꿈 정리
            summaryText = summaryText
              .split('\n')
              .map(line => line.trim())
              .filter(line => line && !line.includes(result.source))
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim()
            
            if (summaryText) {
              summaries[result.source] = summaryText
            }
          }
        }
      } catch (error) {
        console.error(`요약문 추출 오류 (${result.source}):`, error)
      }
    })
    
    return summaries
  }
  
  const summaries = extractSummariesFromProcessedText(processedText, data.results)

  return (
    <div className="korean-summary-viewer">
      {/* 문제 페이지들 */}
      {data.results.map((result, idx) => {
        if (result.error) return null
        
        // 처리된 텍스트에서 추출한 요약문 또는 원본 요약문 사용
        const displaySummary = summaries[result.source] || result.summary || ''
        
        return (
          <div key={`question-${idx}`} id={`korean-summary-page-${idx}`} className="korean-summary-page">
            <div className="korean-summary-page-content">
              {/* 출처 */}
              {result.source && (
                <div className="korean-summary-source">
                  <div className="korean-summary-source-content">
                    <div className="korean-summary-source-title">{result.source}</div>
                    <div className="korean-summary-source-subtitle">Q. 다음 지문을 읽고 &lt;조건&gt; 에 맞게 글을 작성하시오.</div>
                  </div>
                </div>
              )}
              
              {/* 영어원문 */}
              <div className="korean-summary-original">
                <div 
                  className="korean-summary-original-text"
                  dangerouslySetInnerHTML={{ 
                    __html: result.original?.trimStart() 
                      ? highlightKeySentence(result.original.trimStart(), result.keySentence)
                      : '' 
                  }}
                />
              </div>
              
              {/* 한글 요약문 답안 박스 */}
              <div className="korean-summary-answer-box">
                <div className="korean-summary-answer-label">요약문 (한글):</div>
                <div className="korean-summary-answer-content">
                  {displaySummary || ''}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      
      {/* 답지 페이지 (맨 마지막) */}
      <div id="korean-summary-answer-page" className="korean-summary-page korean-summary-answer-page">
        <div className="korean-summary-page-content">
          <div className="korean-summary-answer-title">답지</div>
          <div className="korean-summary-answer-content">
            {data.results
              .filter(r => !r.error && r.summary)
              .map((r, idx) => (
                <div key={`answer-${idx}`} className="korean-summary-answer-item">
                  <div className="korean-summary-answer-source">{r.source || `지문 ${idx + 1}`}</div>
                  <div className="korean-summary-answer-summary">{r.summary}</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}

export default KoreanSummaryViewer

