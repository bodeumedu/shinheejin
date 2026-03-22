import './ReferenceDescriptionViewer.css'

function ReferenceDescriptionViewer({ data }) {
  if (!data || !data.length || data.length === 0) {
    return <div>데이터가 없습니다.</div>
  }

  const validResults = data.filter(
    (r) => !r.error && (r.passageWithUnderlines || r.question)
  )

  const groupedData = []
  for (let i = 0; i < data.length; i += 2) {
    groupedData.push(data.slice(i, i + 2))
  }

  const renderAnalysisBlock = (block, blockIdx) => {
    const phrase = (block.underline || '').trim()
    if (!phrase) return null

    const times = block.doubleHeader === false ? 1 : 2
    const summaryKo = (block.summaryKo || '').trim()
    const linesKo = Array.isArray(block.linesKo) ? block.linesKo : []
    const linesEn = Array.isArray(block.linesEn) ? block.linesEn : []

    return (
      <div key={`block-${blockIdx}`} className="reference-description-analysis-block">
        {Array.from({ length: times }, (_, i) => (
          <div key={`h-${i}`} className="reference-description-analysis-header">
            <u>{phrase}</u>
          </div>
        ))}
        {summaryKo ? (
          <div className="reference-description-analysis-equals">= {summaryKo}</div>
        ) : null}
        {linesKo.map((line, i) => (
          <div key={`ko-${i}`} className="reference-description-analysis-arrow">
            → {line}
          </div>
        ))}
        {linesEn.map((line, i) => (
          <div key={`en-${i}`} className="reference-description-analysis-arrow reference-description-analysis-arrow-en">
            → {line}
          </div>
        ))}
      </div>
    )
  }

  const renderQuestion = (result, itemIdx, className = '') => {
    if (result.error) return null

    const passage =
      result.passageWithUnderlines ||
      (result.question && result.question.includes('<u>') ? result.question : '') ||
      ''

    const blocks = Array.isArray(result.blocks) ? result.blocks : []

    const passageHtml = passage

    return (
      <div
        key={`question-${itemIdx}`}
        className={`reference-description-question-item ${className}`.trim()}
      >
        {result.source && (
          <div className="reference-description-source">
            <div className="reference-description-source-content">
              <div className="reference-description-source-title">{result.source}</div>
            </div>
          </div>
        )}

        {passage ? (
          <div className="reference-description-passage-wrap">
            <div
              className="reference-description-passage-text"
              dangerouslySetInnerHTML={{ __html: passageHtml }}
            />
          </div>
        ) : (
          <div className="reference-description-passage-wrap reference-description-passage-missing">
            지문(밑줄 포함)이 없습니다. 텍스트 결과를 확인하세요.
          </div>
        )}

        {blocks.length > 0 ? (
          <div className="reference-description-analysis-list">
            {blocks.map((b, i) => renderAnalysisBlock(b, i))}
          </div>
        ) : (
          <div className="reference-description-analysis-list reference-description-passage-missing">
            해설 블록이 없습니다. (이전 형식 결과일 수 있습니다)
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="reference-description-viewer">
      {groupedData.map((group, pageIdx) => (
        <div
          key={`page-${pageIdx}`}
          id={`reference-description-page-${pageIdx}`}
          className="reference-description-page"
        >
          <div className="reference-description-page-content">
            {group.map((result, idx) => {
              const itemIdx = pageIdx * 2 + idx
              const isFirst = idx === 0
              const isSecond = idx === 1 && group.length > 1
              const cn = `${isFirst ? 'question-first' : ''} ${isSecond ? 'question-second' : ''}`.trim()
              return renderQuestion(result, itemIdx, cn)
            })}
          </div>
        </div>
      ))}

      {validResults.length > 0 && (
        <div
          id="reference-description-answer-page"
          className="reference-description-page reference-description-answer-page"
        >
          <div className="reference-description-page-content">
            <div className="reference-description-answer-title">표현 요약</div>
            <div className="reference-description-answer-content">
              {validResults.map((result, idx) => (
                <div key={`answer-${idx}`} className="reference-description-answer-item">
                  <div className="reference-description-answer-source">
                    {result.source || `지문 ${result.index + 1}`}
                  </div>
                  <pre className="reference-description-answer-summary">
                    {result.answerSummary ||
                      (Array.isArray(result.blocks)
                        ? result.blocks
                            .map((b) => {
                              const u = (b.underline || '').trim()
                              const s = (b.summaryKo || '').trim()
                              return u && s ? `${u} → ${s}` : s || u
                            })
                            .filter(Boolean)
                            .join('\n')
                        : result.answer || '')}
                  </pre>
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
