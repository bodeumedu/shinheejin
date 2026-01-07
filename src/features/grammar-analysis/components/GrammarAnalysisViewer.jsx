import './GrammarAnalysisViewer.css'

function GrammarAnalysisViewer({ analysis }) {
  if (!analysis) {
    return <div className="grammar-analysis-viewer">분석 결과가 없습니다.</div>
  }

  if (analysis.error && !analysis.localAnalysis) {
    return (
      <div className="grammar-analysis-viewer error">
        <div className="error-message">{analysis.error}</div>
      </div>
    )
  }

  const hasAIReview = analysis.hasAIReview && analysis.aiReview

  // 두 단어 이상인지 확인하는 헬퍼 함수
  const hasTwoOrMoreWords = (text) => {
    if (!text || typeof text !== 'string') return false
    // 구두점 제거 후 공백으로 단어 분리
    const words = text.trim().replace(/[.,!?;:()[\]{}'"]/g, ' ').split(/\s+/).filter(w => w.length > 0)
    return words.length >= 2
  }

  // 관사(a, an, the) 필터링 함수
  const filterArticles = (wordAnalysis) => {
    if (!wordAnalysis || !Array.isArray(wordAnalysis)) return []
    const articles = ['a', 'an', 'the', 'A', 'An', 'The']
    return wordAnalysis.filter(word => {
      const wordText = word.word?.toLowerCase() || ''
      return !articles.includes(wordText)
    })
  }

  return (
    <div className="grammar-analysis-viewer">
      <div className="analysis-header">
        <h2>문법 분석 결과</h2>
        {hasAIReview && (
          <span className="ai-badge">✓ AI 분석 완료</span>
        )}
      </div>

      {hasAIReview && analysis.aiReview.sentences ? (
        // AI 검수 결과 표시
        <div className="sentences-container">
          {analysis.aiReview.sentences.map((sentence, idx) => (
            <div key={idx} className="sentence-analysis">
              <div className="sentence-header">
                <span className="sentence-number">문장 {sentence.index || idx + 1}</span>
              </div>
              
              <div className="original-sentence">
                {sentence.original}
              </div>

              {sentence.koreanTranslation && (
                <div className="translation">
                  <strong>번역:</strong> {sentence.koreanTranslation}
                </div>
              )}

              {(() => {
                const filteredWordAnalysis = filterArticles(sentence.wordAnalysis)
                return filteredWordAnalysis && filteredWordAnalysis.length > 0 && (
                  <div className="word-analysis-table">
                    <h4>단어별 분석</h4>
                    <table className="word-table">
                      <thead>
                        <tr>
                          <th>Word</th>
                          <th>Part of Speech</th>
                          <th>Grammatical Function</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWordAnalysis.map((word, wordIdx) => (
                          <tr key={wordIdx}>
                            <td className="word-cell">{word.word}</td>
                            <td className="pos-cell">{word.partOfSpeech}</td>
                            <td className="function-cell">{word.grammaticalFunction}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {sentence.nounPhrases && sentence.nounPhrases.filter(np => hasTwoOrMoreWords(np.text)).length > 0 && (
                <div className="noun-phrases">
                  <h4>명사구</h4>
                  {sentence.nounPhrases.filter(np => hasTwoOrMoreWords(np.text)).map((np, npIdx) => (
                    <div key={npIdx} className="phrase-item">
                      <span className="phrase-text">{np.text}</span>
                      {np.function && (
                        <span className="phrase-function"> ({np.function})</span>
                      )}
                      {np.translation && (
                        <span className="phrase-translation">: {np.translation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.nounClauses && sentence.nounClauses.filter(nc => hasTwoOrMoreWords(nc.text)).length > 0 && (
                <div className="noun-clauses">
                  <h4>명사절</h4>
                  {sentence.nounClauses.filter(nc => hasTwoOrMoreWords(nc.text)).map((nc, ncIdx) => (
                    <div key={ncIdx} className="clause-item">
                      <span className="clause-text">{nc.text}</span>
                      {nc.function && (
                        <span className="clause-function"> ({nc.function})</span>
                      )}
                      {nc.translation && (
                        <span className="clause-translation">: {nc.translation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.adjectivePhrases && sentence.adjectivePhrases.filter(ap => hasTwoOrMoreWords(ap.text)).length > 0 && (
                <div className="adjective-phrases">
                  <h4>형용사구</h4>
                  {sentence.adjectivePhrases.filter(ap => hasTwoOrMoreWords(ap.text)).map((ap, apIdx) => (
                    <div key={apIdx} className="phrase-item">
                      <span className="phrase-text">{ap.text}</span>
                      {ap.modifies && (
                        <span className="phrase-modifies"> (수식: {ap.modifies})</span>
                      )}
                      {ap.translation && (
                        <span className="phrase-translation">: {ap.translation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.adjectiveClauses && sentence.adjectiveClauses.filter(ac => hasTwoOrMoreWords(ac.text)).length > 0 && (
                <div className="adjective-clauses">
                  <h4>형용사절</h4>
                  {sentence.adjectiveClauses.filter(ac => hasTwoOrMoreWords(ac.text)).map((ac, acIdx) => (
                    <div key={acIdx} className="clause-item">
                      <span className="clause-text">{ac.text}</span>
                      {ac.antecedent && (
                        <span className="clause-antecedent"> (선행사: {ac.antecedent})</span>
                      )}
                      {ac.function && (
                        <span className="clause-function"> ({ac.function})</span>
                      )}
                      {ac.translation && (
                        <span className="clause-translation">: {ac.translation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.adverbPhrases && sentence.adverbPhrases.filter(ap => hasTwoOrMoreWords(ap.text)).length > 0 && (
                <div className="adverb-phrases">
                  <h4>부사구</h4>
                  {sentence.adverbPhrases.filter(ap => hasTwoOrMoreWords(ap.text)).map((ap, apIdx) => (
                    <div key={apIdx} className="phrase-item">
                      <span className="phrase-text">{ap.text}</span>
                      {ap.function && (
                        <span className="phrase-function"> ({ap.function})</span>
                      )}
                      {ap.modifies && (
                        <span className="phrase-modifies"> (수식: {ap.modifies})</span>
                      )}
                      {ap.translation && (
                        <span className="phrase-translation">: {ap.translation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.adverbClauses && sentence.adverbClauses.filter(ac => hasTwoOrMoreWords(ac.text)).length > 0 && (
                <div className="adverb-clauses">
                  <h4>부사절</h4>
                  {sentence.adverbClauses.filter(ac => hasTwoOrMoreWords(ac.text)).map((ac, acIdx) => (
                    <div key={acIdx} className="clause-item">
                      <span className="clause-text">{ac.text}</span>
                      {ac.function && (
                        <span className="clause-function"> ({ac.function})</span>
                      )}
                      {ac.translation && (
                        <span className="clause-translation">: {ac.translation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.prepositions && sentence.prepositions.length > 0 && (
                <div className="prepositions">
                  <h4>전치사</h4>
                  {sentence.prepositions.map((prep, prepIdx) => (
                    <div key={prepIdx} className="preposition-item">
                      <span className="prep-word">{prep.word}</span>
                      {prep.object && (
                        <span className="prep-object"> + {prep.object}</span>
                      )}
                      {prep.function && (
                        <span className="prep-function"> ({prep.function})</span>
                      )}
                      {prep.translation && (
                        <span className="prep-translation">: {prep.translation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.conjunctions && sentence.conjunctions.length > 0 && (
                <div className="conjunctions">
                  <h4>접속사</h4>
                  {sentence.conjunctions.map((conj, conjIdx) => (
                    <div key={conjIdx} className="conjunction-item">
                      <span className="conj-word">{conj.word}</span>
                      {conj.type && (
                        <span className="conj-type"> ({conj.type})</span>
                      )}
                      {conj.function && (
                        <span className="conj-function"> - {conj.function}</span>
                      )}
                      {conj.connects && (
                        <span className="conj-connects">: {conj.connects}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.relativeClauses && sentence.relativeClauses.length > 0 && (
                <div className="relative-clauses">
                  <h4>관계절</h4>
                  {sentence.relativeClauses.map((rc, rcIdx) => (
                    <div key={rcIdx} className="relative-item">
                      <span className="rc-text">{rc.text}</span>
                      {rc.antecedent && (
                        <span className="rc-antecedent"> (선행사: {rc.antecedent})</span>
                      )}
                      {rc.translation && (
                        <span className="rc-translation">: {rc.translation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sentence.grammarNotes && (
                <div className="grammar-notes">
                  <h4>문법 설명</h4>
                  <p>{sentence.grammarNotes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grammar-analysis-viewer">
          <div className="error-message">
            분석 결과가 없습니다. AI 분석을 실행해주세요.
          </div>
        </div>
      )}
    </div>
  )
}

export default GrammarAnalysisViewer

