import './Sum30Viewer.css'
import { getSum15ThemeCssVars } from '../../sum15/utils/sum15Themes'

function splitAnswerItemsIntoPages(results) {
  const pages = []
  let currentPage = []
  let currentWeight = 0
  const pageBudget = 30

  results.forEach((result, idx) => {
    const sourceText = String(result.source || `지문 ${idx + 1}`)
    const answerText = String(result.summary || '')
    const itemWeight =
      3 +
      Math.ceil(sourceText.length / 28) +
      Math.ceil(answerText.length / 90)

    if (currentPage.length > 0 && currentWeight + itemWeight > pageBudget) {
      pages.push(currentPage)
      currentPage = []
      currentWeight = 0
    }

    currentPage.push({ result, idx })
    currentWeight += itemWeight
  })

  if (currentPage.length > 0) {
    pages.push(currentPage)
  }

  return pages
}

function Sum30Viewer({ data, hideAnswerPage = false, theme = 'classic', idPrefix = 'sum30' }) {
  if (!data || !data.results || data.results.length === 0) {
    return <div>데이터가 없습니다.</div>
  }

  const answerPages = splitAnswerItemsIntoPages(data.results.filter((r) => !r.error))

  return (
    <div className="sum30-viewer" style={getSum15ThemeCssVars(theme)}>
      {/* 문제 페이지들 */}
      {data.results.map((result, idx) => {
        if (result.error) return null
        
        return (
          <div key={`question-${idx}`} id={`${idPrefix}-page-${idx}`} className="sum30-page">
            <div className="sum30-page-content">
              {/* 출처 */}
              {result.source && (
                <div className="sum30-source">
                  <div className="sum30-source-content">
                    <div className="sum30-source-title">{result.source}</div>
                    <div className="sum30-source-subtitle">Q. 다음 지문을 읽고 &lt;조건&gt; 에 맞게 글을 작성하시오.</div>
                  </div>
                </div>
              )}
              
              {/* 영어원문 */}
              <div className="sum30-original">
                <pre className="sum30-original-text">{result.original?.trimStart()}</pre>
              </div>
              
              {/* 빈칸 문제 */}
              <div className="sum30-question">
                <span className="sum30-blank-line"></span>.
              </div>
              
              {/* AI 요약문 (투명하게, 보이지 않음) */}
              <div className="sum30-summary">
                {result.summary}
              </div>
              
              {/* 보기와 조건을 나란히 배치 */}
              <div className="sum30-choices-condition-wrapper">
                {/* 보기 */}
                <div className="sum30-choices">
                  <div className="sum30-choices-title">&lt;보기&gt;</div>
                  <div className="sum30-choices-content">
                    {result.shuffledPairs ? result.shuffledPairs.join(' / ') : ''}
                  </div>
                </div>
                
                {/* 조건 */}
                <div className="sum30-condition">
                  <div className="sum30-condition-title">&lt;조건&gt;</div>
                  <div className="sum30-condition-content">
                    &lt;보기&gt;에 주어진 단어 쌍들을 모두 한번씩 사용하여 빈칸을 채우시오.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
      
      {/* 답지 페이지 (맨 마지막) */}
      {!hideAnswerPage &&
        answerPages.map((pageItems, pageIdx) => (
          <div
            key={`answer-page-${pageIdx}`}
            id={`${idPrefix}-answer-page-${pageIdx}`}
            className="sum30-page sum30-answer-page"
          >
            <div className="sum30-page-content">
              <div className="sum30-answer-title">
                답지{answerPages.length > 1 ? ` (${pageIdx + 1}/${answerPages.length})` : ''}
              </div>
              <div className="sum30-answer-content">
                {pageItems.map(({ result: r, idx }) => (
                  <div key={`answer-${pageIdx}-${idx}`} className="sum30-answer-item">
                    <div className="sum30-answer-source">{r.source || `지문 ${idx + 1}`}</div>
                    <div className="sum30-answer-summary">{r.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
    </div>
  )
}

export default Sum30Viewer

