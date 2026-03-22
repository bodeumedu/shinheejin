import './Sum15Viewer.css'

function Sum15Viewer({ data, blankPrefix = 'The passage suggests that ', blankSuffix = '.', answerKey = 'summary', showSummaryBeforeBlank = false, hideBlankLine = false }) {
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

              {/* 인터뷰 등: summary를 빈칸 위에 표시 (showSummaryBeforeBlank일 때만) */}
              {showSummaryBeforeBlank && result.summary && (
                <div className="sum15-original sum15-interview-text">
                  <pre className="sum15-original-text" style={{ whiteSpace: 'pre-wrap' }}>{result.summary}</pre>
                </div>
              )}
              
              {/* 빈칸 문제 (hideBlankLine이면 표시 안 함, e.g. 인터뷰는 summary 안에 빈칸 포함) */}
              {!hideBlankLine && (
                <div className="sum15-question">
                  {blankPrefix}<span className="sum15-blank-line"></span>{blankSuffix}
                </div>
              )}
              
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
                  <div className="sum15-answer-summary">{r[answerKey] ?? r.summary}</div>
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

