import './Sum15Viewer.css'

function Sum15Viewer({ data }) {
  if (!data || !data.results || data.results.length === 0) {
    return <div>데이터가 없습니다.</div>
  }

  return (
    <div className="sum15-viewer">
      {/* 문제 페이지들 */}
      {data.results.map((result, idx) => {
        if (result.error) return null
        
        return (
          <div key={`question-${idx}`} id={`sum15-page-${idx}`} className="sum15-page">
            <div className="sum15-page-content">
              {/* 출처 */}
              {result.source && (
                <div className="sum15-source">
                  <div className="sum15-source-content">
                    <div className="sum15-source-title">{result.source}</div>
                    <div className="sum15-source-subtitle">Q. 다음 지문을 읽고 &lt;조건&gt; 에 맞게 글을 작성하시오.</div>
                  </div>
                </div>
              )}
              
              {/* 영어원문 */}
              <div className="sum15-original">
                <pre className="sum15-original-text">{result.original?.trimStart()}</pre>
              </div>
              
              {/* 빈칸 문제 */}
              <div className="sum15-question">
                The passage suggests that <span className="sum15-blank-line"></span>.
              </div>
              
              {/* AI 요약문 (투명하게, 보이지 않음) */}
              <div className="sum15-summary">
                {result.summary}
              </div>
              
              {/* 보기와 조건을 나란히 배치 */}
              <div className="sum15-choices-condition-wrapper">
                {/* 보기 */}
                <div className="sum15-choices">
                  <div className="sum15-choices-title">&lt;보기&gt;</div>
                  <div className="sum15-choices-content">
                    {result.transformedShuffledWords ? result.transformedShuffledWords.join(' / ') : (result.shuffledWords ? result.shuffledWords.join(' / ') : '')}
                  </div>
                </div>
                
                {/* 조건 */}
                <div className="sum15-condition">
                  <div className="sum15-condition-title">&lt;조건&gt;</div>
                  <div 
                    className="sum15-condition-content"
                    dangerouslySetInnerHTML={{ __html: result.conditionText || '' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })}
      
      {/* 답지 페이지 (맨 마지막) */}
      <div id="sum15-answer-page" className="sum15-page sum15-answer-page">
        <div className="sum15-page-content">
          <div className="sum15-answer-title">답지</div>
          <div className="sum15-answer-content">
            {data.results
              .filter(r => !r.error)
              .map((r, idx) => (
                <div key={`answer-${idx}`} className="sum15-answer-item">
                  <div className="sum15-answer-source">{r.source || `지문 ${idx + 1}`}</div>
                  <div className="sum15-answer-summary">{r.summary}</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sum15Viewer

