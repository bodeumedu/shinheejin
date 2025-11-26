import { useState } from 'react'
import './BlankGenerator.css'

function BlankGenerator({ blankData, blankType, baseIndex = 0 }) {
  // 점수 입력 상태 (맞은 개수는 비워둠)
  const [scores, setScores] = useState(
    blankData.map(() => ({ total: 0, correct: '' }))
  )

  const handleScoreChange = (index, field, value) => {
    const newScores = [...scores]
    if (field === 'correct') {
      // 맞은 개수는 빈 문자열 또는 숫자 허용
      newScores[index] = {
        ...newScores[index],
        [field]: value === '' ? '' : (parseInt(value) || '')
      }
    } else {
      const numValue = parseInt(value) || 0
      newScores[index] = {
        ...newScores[index],
        [field]: numValue
      }
    }
    setScores(newScores)
  }

  const getBlankTypeKorean = (type) => {
    const types = {
      'nouns': '명사',
      'verbs': '동사',
      'adjectives': '형용사'
    }
    return types[type] || '빈칸'
  }

  const getDesignClass = (type) => {
    const designs = {
      'nouns': 'blank-design-nouns',
      'verbs': 'blank-design-verbs',
      'adjectives': 'blank-design-adjectives'
    }
    return designs[type] || 'blank-design-nouns'
  }

  // 지문을 2개씩 그룹화
  const groupedBlanks = []
  for (let i = 0; i < blankData.length; i += 2) {
    groupedBlanks.push(blankData.slice(i, i + 2))
  }

  // 답지를 지문별로 그룹화 (본문의 빈칸 수와 번호를 최대한 일치)
  const answersByText = blankData.map((data, index) => {
    // 렌더된 텍스트 기준으로 <b>...</b> 개수를 정확히 집계하여 표시/답지 동기화
    const text = data.textWithBlanks || ''
    const boldMatches = [...text.matchAll(/<b>(.*?)<\/b>/gi)]
    const wordsFromBold = boldMatches.map(m => (m[1] || '').trim()).filter(Boolean)

    // 우선순위: 실제 볼드 텍스트 → AI answers 보조
    const answersUsed = (wordsFromBold.length > 0
      ? wordsFromBold
      : (Array.isArray(data.answers) ? data.answers.map(a => a?.word ?? '') : [])
    ).map((w, i) => ({
      number: i + 1,
      word: w
    }))

    return {
      title: data.title || `지문 ${index + 1}`,
      answers: answersUsed,
      total: answersUsed.length
    }
  })
  const hasAnyAnswers = answersByText.some(a => a.answers && a.answers.length > 0)

  // 페이지 렌더링 헬퍼 함수
  const renderPageGroup = (group, groupIndex, isCopy = false) => {
    return (
      <div key={`${groupIndex}-${isCopy ? 'copy' : 'orig'}`} className="blank-page-group" id={`blank-page-group-${baseIndex + groupIndex}${isCopy ? '-copy' : ''}`}>
        {group.map((data, itemIndex) => {
          const globalIndex = groupIndex * 2 + itemIndex
          return (
            <div key={`${globalIndex}-${isCopy ? 'copy' : 'orig'}`} className="blank-item-half">
              {/* 헤더: 제목(왼쪽) + 점수(오른쪽) */}
              <div className="blank-page-header">
                <div className="blank-title-left">
                  <h2 className="blank-title-text">{data.title || `지문 ${globalIndex + 1}`}</h2>
                </div>
                <div className="blank-score-right">
                  <div className="score-box">
                    <label className="score-label">
                      맞은 개수: 
                      <input
                        type="number"
                        min="0"
                        max={(answersByText[globalIndex]?.total ?? data.blankCount ?? 0)}
                        value={scores[globalIndex].correct === '' ? '' : scores[globalIndex].correct}
                        onChange={(e) => handleScoreChange(globalIndex, 'correct', e.target.value)}
                        className="score-input"
                        placeholder=""
                      />
                    </label>
                    <label className="score-label">
                      전체: 
                      <span className="score-total">{answersByText[globalIndex]?.total ?? 0}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 본문 */}
              <div className="blank-content">
                <div className="blank-text-box">
                  <p className="blank-text">
                    {data.error ? (
                      <span style={{ color: 'red' }}>{data.textWithBlanks || `[오류: ${data.error}]`}</span>
                    ) : data.textWithBlanks ? (
                      <>
                        {(() => {
                          // 디버깅: textWithBlanks 확인
                          const hasBoldTags = /<b>.*?<\/b>/i.test(data.textWithBlanks);
                          if (!hasBoldTags) {
                            console.warn(`지문 ${globalIndex + 1}${isCopy ? ' (복사본)' : ''}: <b> 태그가 없습니다.`, data.textWithBlanks.substring(0, 100));
                          }
                          return (
                            <span dangerouslySetInnerHTML={{ __html: data.textWithBlanks }} />
                          );
                        })()}
                      </>
                    ) : (
                      <span style={{ color: 'red' }}>빈칸 생성 실패: textWithBlanks가 없습니다.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={`blank-generator-container ${getDesignClass(blankType)}`}>
      {/* 1단계: 투명 글씨 페이지들 (복사본) 먼저 모두 모아서 표시 */}
      {groupedBlanks.map((group, groupIndex) => 
        renderPageGroup(group, groupIndex, true) // isCopy = true
      )}
      
      {/* 2단계: 글자 보이는 페이지들 (원본) 그 다음에 모두 모아서 표시 */}
      {groupedBlanks.map((group, groupIndex) => 
        renderPageGroup(group, groupIndex, false) // isCopy = false
      )}
    </div>
  )
}

export default BlankGenerator

