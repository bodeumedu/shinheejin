import { useState } from 'react'
import { createBlank } from '../utils/blankAnalyzer'
import './BlankMaker.css'

function BlankMaker({ text, setText, onGenerate, apiKey }) {
  const [dividedTexts, setDividedTexts] = useState([])
  const [selectedBlankType, setSelectedBlankType] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 지문 나누기 함수 (슬래시 기준)
  const handleDivide = () => {
    if (!text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }

    // 슬래시(/) 기준으로 나누기
    // 형식: "제목 / 영어원문 / 한글원문 // 제목2 / 영어원문2 / 한글원문2 //"
    const texts = text.split('//').map(t => t.trim()).filter(t => t.length > 0)
    
    const divided = texts.map(textBlock => {
      const parts = textBlock.split('/').map(p => p.trim())
      return {
        title: parts[0] || '',
        english: parts[1] || '',
        korean: parts[2] || ''
      }
    })

    setDividedTexts(divided)
    setError('')
  }

  // 빈칸 생성 함수
  const handleGenerateBlank = async (blankType) => {
    if (dividedTexts.length === 0) {
      setError('먼저 지문을 나누어주세요.')
      return
    }

    if (!apiKey) {
      setError('API 키를 먼저 설정해주세요.')
      return
    }

    setIsLoading(true)
    setError('')
    setSelectedBlankType(blankType)

    try {
      const results = []
      const parseErrors = [] // 파싱 오류 모음
      
      for (let i = 0; i < dividedTexts.length; i++) {
        const textBlock = dividedTexts[i]
        if (!textBlock.english.trim()) {
          console.warn(`지문 ${i + 1}: 영어 원문이 비어있어 건너뜁니다.`)
          continue
        }

        // 파싱 오류 재시도 로직
        const maxRetries = 3
        let lastError = null
        let success = false

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            // 하이라이트 모드: AI에게 해당 품사 15개를 <b>로 강조한 텍스트를 요청
            const blankResult = await createBlank(textBlock.english, blankType, apiKey)

            if (!blankResult.textWithBlanks) {
              throw new Error('하이라이트 결과가 비어 있습니다.')
            }

            // 성공한 경우
            results.push({
              ...textBlock,
              ...blankResult,
              blankType: blankType
            })
            success = true
            break // 재시도 종료
          } catch (error) {
            lastError = error
            const isParseError = error.message && error.message.includes('파싱할 수 없습니다')
            
            if (isParseError && attempt < maxRetries) {
              // 파싱 오류이고 재시도 가능한 경우
              console.warn(`지문 ${i + 1}: 파싱 오류 발생 (시도 ${attempt}/${maxRetries}). 재시도 중...`)
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // 재시도 전 대기 (1초, 2초, 3초)
              continue // 재시도
            } else if (isParseError && attempt === maxRetries) {
              // 파싱 오류이고 재시도 모두 실패한 경우
              console.error(`지문 ${i + 1}: 파싱 오류 재시도 모두 실패 (${maxRetries}회 시도)`)
              // 에러는 표시하되 저장하지 않음
              parseErrors.push(`지문 ${i + 1} (${textBlock.title || '제목 없음'}): ${error.message}`)
              break // 다음 지문으로 진행
            } else {
              // 파싱 오류가 아닌 다른 오류인 경우
              console.error(`지문 ${i + 1} 빈칸 생성 중 오류:`, error)
              // 다른 오류는 에러 표시와 함께 포함
              results.push({
                ...textBlock,
                textWithBlanks: `[오류: ${error.message}]`,
                answers: [],
                blankCount: 0,
                blankType: blankType,
                error: error.message
              })
              success = true // 오류 표시용으로 추가했으므로 다음 지문으로
              break
            }
          }
        }

        // 파싱 오류로 최종 실패한 경우 (이미 에러 표시됨)
        if (!success && lastError && lastError.message && lastError.message.includes('파싱할 수 없습니다')) {
          continue // 다음 지문으로 진행
        }
      }

      // 파싱 오류가 있으면 표시
      if (parseErrors.length > 0) {
        setError(`다음 지문에서 파싱 오류가 발생하여 저장하지 않았습니다:\n${parseErrors.join('\n')}`)
      }

      if (results.length === 0) {
        throw new Error('빈칸 생성에 실패했습니다.')
      }

      console.log(`총 ${results.length}개 지문의 빈칸 생성 완료`)
      if (parseErrors.length > 0) {
        console.warn(`파싱 오류로 저장되지 않은 지문: ${parseErrors.length}개`)
      }
      onGenerate(results)
    } catch (error) {
      console.error('빈칸 생성 중 오류 발생:', error)
      setError(error.message || '빈칸 생성 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="blank-maker-container">
      <div className="blank-maker-header">
        <h2>1단계: 지문 입력 및 나누기</h2>
        <p>형식: "제목 / 영어원문 / 한글원문 // 제목2 / 영어원문2 / 한글원문2 //"</p>
      </div>

      <div className="blank-maker-input-section">
        <div className="form-section">
          <label htmlFor="blank-text">지문 입력 *</label>
          <textarea
            id="blank-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="제목 / 영어원문 / 한글원문 // 제목2 / 영어원문2 / 한글원문2 //"
            rows="12"
            disabled={isLoading}
          />
        </div>

        <button 
          onClick={handleDivide} 
          className="btn-divide"
          disabled={isLoading || !text.trim()}
        >
          지문 나누기
        </button>

        {dividedTexts.length > 0 && (
          <div className="divided-texts-info">
            <p>총 {dividedTexts.length}개의 지문이 나뉘었습니다.</p>
          </div>
        )}
      </div>

      {dividedTexts.length > 0 && (
        <div className="blank-maker-options">
          <h2>2단계: 빈칸 타입 선택</h2>
          <div className="blank-type-buttons">
            <button
              onClick={() => handleGenerateBlank('nouns')}
              className="blank-type-btn blank-type-nouns"
              disabled={isLoading || !apiKey}
            >
              중요 명사 빈칸
            </button>
            <button
              onClick={() => handleGenerateBlank('verbs')}
              className="blank-type-btn blank-type-verbs"
              disabled={isLoading || !apiKey}
            >
              중요 동사 빈칸
            </button>
            <button
              onClick={() => handleGenerateBlank('adjectives')}
              className="blank-type-btn blank-type-adjectives"
              disabled={isLoading || !apiKey}
            >
              중요 형용사 빈칸
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="loading-message">
          AI가 빈칸을 생성하고 있습니다... (시간이 다소 걸릴 수 있습니다)
        </div>
      )}
    </div>
  )
}

export default BlankMaker

