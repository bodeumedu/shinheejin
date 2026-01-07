import './GrammarAnalysisDesignViewer.css'

function GrammarAnalysisDesignViewer({ data, source }) {
  if (!data) {
    return <div className="grammar-analysis-design-viewer">분석 데이터가 없습니다.</div>
  }

  // 출처 파싱 (예: "출처/영어원문/한글해석//" 형식에서 출처 추출)
  const parseSource = (text) => {
    if (!text) return { unit: '', koreanTitle: '', englishTitle: '' }
    
    // "//" 기준으로 텍스트 블록 분리
    const blocks = text.split('//')
    const firstBlock = blocks[0] || ''
    
    // "/"로 구분된 형식인지 확인
    const parts = firstBlock.split('/').map(p => p.trim())
    
    if (parts.length >= 3) {
      // 출처/영어원문/한글해석 형식
      return {
        unit: parts[0] || '',
        englishTitle: parts[1] || '',
        koreanTitle: parts[2] || ''
      }
    } else if (parts.length >= 2) {
      // 출처/영어원문 형식
      return {
        unit: parts[0] || '',
        englishTitle: parts[1] || '',
        koreanTitle: ''
      }
    }
    
    // 단순 출처인 경우
    return {
      unit: text.trim(),
      koreanTitle: '',
      englishTitle: ''
    }
  }

  const sourceInfo = parseSource(source)
  const sentences = data.hasAIReview && data.aiReview?.sentences 
    ? data.aiReview.sentences 
    : []

  return (
    <div className="grammar-analysis-design-viewer">
      {/* A4 페이지 */}
      <div className="grammar-analysis-a4-page">
        {/* 헤더: 출처만 */}
        {sourceInfo.unit && (
          <div className="grammar-analysis-header">
            <div className="source-unit-box">
              {sourceInfo.unit}
            </div>
          </div>
        )}

        {/* 출처 아래 줄부터 가로폭 전체 사용 */}
        <div className="grammar-analysis-content">
          {sentences.map((sentence, idx) => (
            <div key={idx} className="sentence-section">
              {/* 영어 문장 (번호 포함) */}
              <div className="sentence-row">
                <span className="sentence-number">
                  {String(idx + 1).padStart(2, '0')}.
                </span>
                <span className="english-sentence">
                  {sentence.original || sentence.text}
                </span>
              </div>

              {/* 한글 번역 */}
              {sentence.koreanTranslation && (
                <div className="korean-translation">
                  {sentence.koreanTranslation}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default GrammarAnalysisDesignViewer

