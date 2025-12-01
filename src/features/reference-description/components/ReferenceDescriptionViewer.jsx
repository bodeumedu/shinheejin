import './ReferenceDescriptionViewer.css'

function ReferenceDescriptionViewer({ data }) {
  if (!data || !data.length || data.length === 0) {
    return <div>데이터가 없습니다.</div>
  }

  return (
    <div className="reference-description-viewer">
      {/* 문제 페이지들 */}
      {data.map((result, idx) => {
        if (result.error) return null
        
        return (
          <div key={`question-${idx}`} id={`reference-description-page-${idx}`} className="reference-description-page">
            <div className="reference-description-page-content">
              {/* 출처 */}
              {result.source && (
                <div className="reference-description-source">
                  <div className="reference-description-source-content">
                    <div className="reference-description-source-title">{result.source}</div>
                  </div>
                </div>
              )}
              
              {/* 영어원문 */}
              <div className="reference-description-original">
                <pre className="reference-description-original-text">{result.original?.trimStart()}</pre>
              </div>
              
              {/* 문제 */}
              <div 
                className="reference-description-question"
                dangerouslySetInnerHTML={{ __html: result.question || '' }}
              />
              
              {/* 조건 */}
              <div 
                className="reference-description-condition"
                dangerouslySetInnerHTML={{ __html: result.condition || '' }}
              />
              
              {/* 정답 */}
              {result.answer && (
                <div className="reference-description-answer">
                  정답: {result.answer} ({result.wordLimit || 'N'}단어)
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ReferenceDescriptionViewer

