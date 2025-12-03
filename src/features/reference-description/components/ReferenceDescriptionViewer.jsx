import './ReferenceDescriptionViewer.css'

function ReferenceDescriptionViewer({ data }) {
  if (!data || !data.length || data.length === 0) {
    return <div>데이터가 없습니다.</div>
  }

  // 정답이 있는 결과만 필터링
  const validResults = data.filter(r => !r.error && r.answer)

  // 문제를 2개씩 묶어서 페이지 생성
  const groupedData = []
  for (let i = 0; i < data.length; i += 2) {
    groupedData.push(data.slice(i, i + 2))
  }

  // 각 문제를 렌더링하는 함수
  const renderQuestion = (result, itemIdx, className = '') => {
    if (result.error) return null
    
    // 질문에서 "Q." 부분과 나머지 분리
    const questionText = result.question || ''
    const questionWithoutQ = questionText.replace(/^Q\.\s*/i, '').trim()
    
    // 질문에서 "다음 글을 읽고 ~ 쓰시오." 부분 추출 (지문 제외)
    const extractQuestionPart = (text) => {
      if (!text) return text
      const parts = text.split(/\n\s*\n/)
      if (parts.length > 1) {
        let questionPart = parts[0].trim()
        const writeIndex = questionPart.indexOf('쓰시오')
        if (writeIndex !== -1) {
          questionPart = questionPart.substring(0, writeIndex + 3)
        }
        return questionPart
      }
      const writeIndex = text.indexOf('쓰시오')
      if (writeIndex !== -1) {
        return text.substring(0, writeIndex + 3).trim()
      }
      return text.trim()
    }
    
    const questionPart = extractQuestionPart(questionWithoutQ)
    
    // 영어원문에서 밑줄 부분을 볼드 처리
    const formatOriginalText = (originalText, questionText) => {
      if (!originalText) return originalText
      let formatted = String(originalText)
      
      const underlineMatch = questionText.match(/<u>([^<]+)<\/u>/i)
      
      if (underlineMatch) {
        const underlinedText = underlineMatch[1].trim()
        const escapedText = underlinedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        
        if (!formatted.includes(`<strong>${underlinedText}</strong>`)) {
          formatted = formatted.replace(new RegExp(`(${escapedText})`, 'i'), '<strong>$1</strong>')
        }
      }
      
      formatted = formatted.replace(/<u>([^<]+)<\/u>/gi, '<strong>$1</strong>')
      
      return formatted
    }
    
    const originalText = result.original || questionWithoutQ.split(/\n\s*\n/).slice(1).join('\n\n')
    const formattedOriginal = formatOriginalText(originalText, questionText)
    
    // 질문에서 "다음 글을 읽고 밑줄 친~" 부분을 볼드 처리
    const formatQuestionText = (text) => {
      if (!text) return text
      let formatted = String(text).replace(/(다음 글을 읽고 밑줄 친[^가]*?)(가 가리키는|가 지칭하는|를 가리키는|을 가리키는|을 지칭하는|를 지칭하는)/g, '<strong>$1$2</strong>')
      
      if (formatted === text) {
        formatted = String(text).replace(/(다음 글을 읽고 밑줄 친[^본]*?본문에서)/g, '<strong>$1</strong>')
      }
      
      if (formatted === text) {
        formatted = String(text).replace(/(다음 글을 읽고 밑줄 친\s*<u>[^<]*<\/u>)/g, '<strong>$1</strong>')
      }
      
      return formatted
    }
    const formattedQuestion = formatQuestionText(questionPart)
    
    // 조건 처리
    const formatCondition = (condition) => {
      if (!condition) return ''
      let formatted = String(condition)
      formatted = formatted.replace(/<조건>\s*/g, '<조건>\n')
      formatted = formatted.replace(/<조건>\n\s*1\)/g, '<조건>\n1)')
      return formatted
    }
    const safeCondition = result.condition ? formatCondition(String(result.condition)) : ''
    
    return (
      <div key={`question-${itemIdx}`} className={`reference-description-question-item ${className}`.trim()}>
        {/* 출처 */}
        {result.source && (
          <div className="reference-description-source">
            <div className="reference-description-source-content">
              <div className="reference-description-source-title">{result.source}</div>
            </div>
          </div>
        )}
        
        {/* 질문 */}
        <div className="reference-description-question-wrapper">
          <span className="reference-description-question-label">Q.</span>
          {formattedQuestion ? (
            <div 
              className="reference-description-question-text"
              dangerouslySetInnerHTML={{ __html: formattedQuestion }}
            />
          ) : (
            <div className="reference-description-question-text">{questionPart}</div>
          )}
        </div>
        
        {/* 영어원문 박스 */}
        {(result.original || originalText) && (
          <div className="reference-description-original">
            <div 
              className="reference-description-original-text"
              dangerouslySetInnerHTML={{ __html: formattedOriginal }}
            />
          </div>
        )}
        
        {/* 조건 */}
        {safeCondition ? (
          <div 
            className="reference-description-condition"
            dangerouslySetInnerHTML={{ __html: safeCondition }}
          />
        ) : (
          <div className="reference-description-condition">
            {'<조건>'}
            {'\n1) 반드시 본문에 있는 단어만 사용할 것'}
            {'\n2) 어형을 바꾸지 말 것'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="reference-description-viewer">
      {/* 문제 페이지들 (2개씩 묶어서) */}
      {groupedData.map((group, pageIdx) => (
        <div key={`page-${pageIdx}`} className="reference-description-page">
          <div className="reference-description-page-content">
            {group.map((result, idx) => {
              const itemIdx = pageIdx * 2 + idx
              const isFirst = idx === 0
              const isSecond = idx === 1 && group.length > 1
              const className = `${isFirst ? 'question-first' : ''} ${isSecond ? 'question-second' : ''}`.trim()
              return renderQuestion(result, itemIdx, className)
            })}
          </div>
        </div>
      ))}
      
      {/* 정답 페이지 (맨 마지막) */}
      {validResults.length > 0 && (
        <div id="reference-description-answer-page" className="reference-description-page reference-description-answer-page">
          <div className="reference-description-page-content">
            <div className="reference-description-answer-title">정답</div>
            <div className="reference-description-answer-content">
              {validResults.map((result, idx) => (
                <div key={`answer-${idx}`} className="reference-description-answer-item">
                  <div className="reference-description-answer-source">{result.source || `지문 ${result.index + 1}`}</div>
                  <div className="reference-description-answer-text">
                    {result.answer} ({result.wordLimit || 'N'}단어)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReferenceDescriptionViewer
