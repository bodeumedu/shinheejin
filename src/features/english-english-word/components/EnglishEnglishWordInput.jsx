import { useState } from 'react'
import '../../paraphrasing/components/ParaphrasingInput.css'
import {
  buildPassageVocabularyTables,
  buildWordListVocabularyTable,
  parseWordListInput,
  splitPassageBlocks,
  vocabularyTableToTsv,
} from '../utils/englishEnglishWordAnalyzer'

const modeToggleStyle = {
  display: 'flex',
  gap: '0',
  marginBottom: '16px',
  borderRadius: '8px',
  overflow: 'hidden',
  border: '2px solid #e0e0e0',
  maxWidth: '100%',
}

const modeBtnBase = {
  flex: 1,
  padding: '12px 16px',
  fontSize: '1rem',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.2s, color 0.2s',
}

function EnglishEnglishWordInput({ onProcess, apiKey }) {
  const [inputMode, setInputMode] = useState('passage')
  const [gradeLevel, setGradeLevel] = useState('hs1') // hs1 | hs2
  const [passage, setPassage] = useState('')
  const [wordsRaw, setWordsRaw] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!apiKey) {
      setError('API 키를 먼저 설정해주세요.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      if (inputMode === 'passage') {
        if (!passage.trim()) {
          setError('지문을 입력해주세요.')
          setIsLoading(false)
          return
        }
        const blocks = splitPassageBlocks(passage.trim())
        if (!blocks.length) {
          setError('지문 블록을 인식할 수 없습니다.')
          setIsLoading(false)
          return
        }
        const vocabularyTable = await buildPassageVocabularyTables(blocks, gradeLevel, apiKey)
        const glossary = vocabularyTableToTsv(vocabularyTable)
        onProcess({
          original: passage.trim(),
          glossary,
          inputKind: 'passage',
          gradeLevel,
          vocabularyTable,
        })
      } else {
        const words = parseWordListInput(wordsRaw)
        if (!words.length) {
          setError('단어를 입력해주세요. (줄바꿈 또는 쉼표로 여러 개 구분)')
          setIsLoading(false)
          return
        }
        const vocabularyTable = await buildWordListVocabularyTable(words, gradeLevel, apiKey)
        const glossary = vocabularyTableToTsv(vocabularyTable)
        onProcess({
          original: wordsRaw.trim(),
          glossary,
          inputKind: 'words',
          gradeLevel,
          vocabularyTable,
          parsedWords: words,
        })
      }
    } catch (err) {
      console.error(err)
      setError(err.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const clearInputs = () => {
    setPassage('')
    setWordsRaw('')
    setError('')
  }

  return (
    <div className="paraphrasing-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label>입력 방식</label>
          <div style={modeToggleStyle} role="group" aria-label="입력 방식 선택">
            <button
              type="button"
              style={{
                ...modeBtnBase,
                background: inputMode === 'passage' ? '#3498db' : '#f4f6f8',
                color: inputMode === 'passage' ? '#fff' : '#2c3e50',
              }}
              onClick={() => {
                setInputMode('passage')
                setError('')
              }}
              disabled={isLoading}
            >
              영어 지문으로 넣기
            </button>
            <button
              type="button"
              style={{
                ...modeBtnBase,
                background: inputMode === 'words' ? '#3498db' : '#f4f6f8',
                color: inputMode === 'words' ? '#fff' : '#2c3e50',
              }}
              onClick={() => {
                setInputMode('words')
                setError('')
              }}
              disabled={isLoading}
            >
              단어로 넣기
            </button>
          </div>
        </div>

        <div className="form-section">
          <label>지문·단어 난이도 (영영 해설 기준)</label>
          <div style={modeToggleStyle} role="group" aria-label="난이도">
            <button
              type="button"
              style={{
                ...modeBtnBase,
                background: gradeLevel === 'hs1' ? '#27ae60' : '#f4f6f8',
                color: gradeLevel === 'hs1' ? '#fff' : '#2c3e50',
              }}
              onClick={() => setGradeLevel('hs1')}
              disabled={isLoading}
            >
              고1 수준 (해설: 고1~2 어휘)
            </button>
            <button
              type="button"
              style={{
                ...modeBtnBase,
                background: gradeLevel === 'hs2' ? '#27ae60' : '#f4f6f8',
                color: gradeLevel === 'hs2' ? '#fff' : '#2c3e50',
              }}
              onClick={() => setGradeLevel('hs2')}
              disabled={isLoading}
            >
              고2 수준 (해설: 고2~3 어휘)
            </button>
          </div>
          <small>
            고1: 지문이 고1 정도일 때 해설 영어를 조금 더 쉽게. 고2: 지문이 고2 정도일 때 해설 영어를 한 단계 높여 작성합니다. 다의어는 문맥 뜻만,
            동사는 원형(lemma)으로 적습니다.
          </small>
        </div>

        {inputMode === 'passage' ? (
          <div className="form-section">
            <label htmlFor="english-english-passage">영어 지문 *</label>
            <textarea
              id="english-english-passage"
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              placeholder={`첫 줄: 지문 제목 (예: EBS 지문 1)\n둘째 줄부터: 영어 지문 본문\n\n여러 지문은 빈 줄 사이에 // 로 구분\n\n//\n\nEBS 지문 2\n(두 번째 지문...)`}
              rows="14"
              disabled={isLoading}
            />
            <small>
              지문마다 <strong>첫 줄은 제목</strong>(표 왼쪽 열), 그 아래가 본문입니다. 지문이 하나뿐이어도 첫 줄을 제목으로 두는 것을 권장합니다. 여러
              지문은 <code>//</code> 로 나눕니다.
            </small>
          </div>
        ) : (
          <div className="form-section">
            <label htmlFor="english-english-words">단어 목록 *</label>
            <textarea
              id="english-english-words"
              value={wordsRaw}
              onChange={(e) => setWordsRaw(e.target.value)}
              placeholder={`예시:\napple, banana, resilient\nfamine\n\n줄바꿈 또는 쉼표(,·，)·세미콜론으로 구분하면 각각 인식합니다.\n결과는 제목 없이 2열 표(단어 | 영영 뜻)로 만듭니다.`}
              rows="12"
              disabled={isLoading}
            />
            <small>
              한 줄에 하나씩 또는 <code>word1, word2</code> 형식. 결과는 <strong>출처 열 없이</strong> 단어·뜻만 표로 표시됩니다.
            </small>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <div className="button-group">
          <button type="button" onClick={clearInputs} className="btn btn-reset" disabled={isLoading}>
            입력 초기화
          </button>
          <button type="submit" className="btn btn-submit" disabled={isLoading}>
            {isLoading ? '단어장 작성 중...' : '영영 단어장 작성'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default EnglishEnglishWordInput
