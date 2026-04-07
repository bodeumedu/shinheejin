import './Sum40Viewer.css'
import { getSum15ThemeCssVars } from '../../sum15/utils/sum15Themes'

function splitAnswerItemsIntoPages(results) {
  const pages = []
  let currentPage = []
  let currentWeight = 0
  const pageBudget = 28

  results.forEach((result, idx) => {
    const sourceText = String(result.source || `지문 ${idx + 1}`)
    const answerText = `정답: ${String(result.answerLine || '-')}\n완성 요약문: ${String(result.summary || '')}`
    const itemWeight =
      4 +
      Math.ceil(sourceText.length / 28) +
      Math.ceil(answerText.length / 80)

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

function Sum40Viewer({ data, hideAnswerPage = false, theme = 'classic', idPrefix = 'sum40' }) {
  if (!data || !data.results || data.results.length === 0) {
    return <div>데이터가 없습니다.</div>
  }

  const answerPages = splitAnswerItemsIntoPages(data.results.filter((r) => !r.error))

  return (
    <div className="sum40-viewer" style={getSum15ThemeCssVars(theme)}>
      {data.results.map((result, idx) => {
        if (result.error) return null

        return (
          <div key={`question-${idx}`} id={`${idPrefix}-page-${idx}`} className="sum40-page">
            <div className="sum40-page-content">
              {result.source && (
                <div className="sum40-source">
                  <div className="sum40-source-content">
                    <div className="sum40-source-title">{result.source}</div>
                    <div className="sum40-source-subtitle">Q. 다음 지문을 읽고 빈칸에 알맞은 단어를 쓰시오.</div>
                  </div>
                </div>
              )}

              <div className="sum40-original">
                <pre className="sum40-original-text">{result.original?.trimStart()}</pre>
              </div>

              <div className="sum40-question">
                <div className="sum40-question-label">▶ 다음 40단어 요약문의 빈칸을 완성하시오.</div>
                <div className="sum40-question-summary">{result.blankedSummary}</div>
              </div>

              <div className="sum40-condition">
                <div className="sum40-condition-title">&lt;조건&gt;</div>
                <div className="sum40-condition-content">빈칸은 제시된 첫 글자를 참고하여 알맞은 단어를 쓰시오.</div>
              </div>
            </div>
          </div>
        )
      })}

      {!hideAnswerPage &&
        answerPages.map((pageItems, pageIdx) => (
          <div
            key={`answer-page-${pageIdx}`}
            id={`${idPrefix}-answer-page-${pageIdx}`}
            className="sum40-page sum40-answer-page"
          >
            <div className="sum40-page-content">
              <div className="sum40-answer-title">
                답지{answerPages.length > 1 ? ` (${pageIdx + 1}/${answerPages.length})` : ''}
              </div>
              <div className="sum40-answer-content">
                {pageItems.map(({ result: r, idx }) => (
                  <div key={`answer-${pageIdx}-${idx}`} className="sum40-answer-item">
                    <div className="sum40-answer-source">{r.source || `지문 ${idx + 1}`}</div>
                    <div className="sum40-answer-summary">정답: {r.answerLine || '-'}</div>
                    <div className="sum40-answer-summary">완성 요약문: {r.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
    </div>
  )
}

export default Sum40Viewer
