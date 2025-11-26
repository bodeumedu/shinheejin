import { useState } from 'react'
import './Sum15Input.css'
import { summarizeText, getBaseForms } from '../utils/sum15Analyzer'

function Sum15Input({ text, setText, onProcess, apiKey }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 전체 텍스트 처리 (여러 지문)
  const processAllTexts = async (inputText, apiKey) => {
    // // 기준으로 지문 나누기 (줄바꿈 보존)
    const textBlocks = []
    let currentBlock = ''
    
    for (let i = 0; i < inputText.length; i++) {
      const char = inputText[i]
      const nextChar = inputText[i + 1]
      
      if (char === '/' && nextChar === '/') {
        // // 발견 - 현재 블록 저장하고 새 블록 시작
        textBlocks.push(currentBlock)
        currentBlock = ''
        i++ // 다음 / 건너뛰기
      } else {
        currentBlock += char
      }
    }
    
    if (currentBlock.trim().length > 0) {
      textBlocks.push(currentBlock)
    }
    
    const results = []

    for (let i = 0; i < textBlocks.length; i++) {
      const block = textBlocks[i]
      
      // / 기준으로 출처/영어원문/한글해석 분리 (줄바꿈 보존)
      const parts = []
      let currentPart = ''
      
      for (let j = 0; j < block.length; j++) {
        const char = block[j]
        const prevChar = j > 0 ? block[j - 1] : ''
        const nextChar = j < block.length - 1 ? block[j + 1] : ''
        
        if (char === '/' && prevChar !== '/' && nextChar !== '/') {
          // 단일 / 발견 (//가 아닌 경우만)
          parts.push(currentPart)
          currentPart = ''
        } else {
          currentPart += char
        }
      }
      
      if (currentPart.length > 0) {
        parts.push(currentPart)
      }
      
      const source = parts[0] || ''
      const englishText = parts[1] || ''
      const koreanTranslation = parts[2] || ''

      if (!englishText.trim()) {
        console.warn(`지문 ${i + 1}: 영어원문이 없어 건너뜁니다.`)
        continue
      }

      try {
        // 영어원문 summary 생성 (15단어, "The passage suggests that"으로 시작)
        const summary = await summarizeText(englishText, apiKey)
        
        // "The passage suggests that" 제거하고 나머지 단어 추출
        const prefix = "The passage suggests that"
        let remainingWords = summary
        if (summary.toLowerCase().startsWith(prefix.toLowerCase())) {
          remainingWords = summary.substring(prefix.length).trim()
        }
        
        // 단어 분리 (구두점 제거하지 않고 분리)
        const words = remainingWords.split(/\s+/).filter(w => w.length > 0)
        
        // 변환 대상 단어 찾기: 동사형(ing/-ed/-s), 명사형(-ment/-tion 등), 형용사형(-ive/-able 등)
        const transformableWords = words
          .map((w, idx) => ({ word: w, index: idx }))
          .filter(({ word }) => {
            const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
            if (clean.length < 4) return false // 너무 짧은 단어 제외
            
            // 동사형: -ing, -ed, -s
            if (clean.endsWith('ing') || clean.endsWith('ed')) {
              return true
            }
            if (clean.endsWith('s')) {
              const excludedWords = ['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us']
              if (!excludedWords.includes(clean)) {
                return true
              }
            }
            
            // 명사형: -ment, -tion, -sion, -ance, -ence
            if (clean.endsWith('ment') || clean.endsWith('tion') || clean.endsWith('sion') || 
                clean.endsWith('ance') || clean.endsWith('ence')) {
              return true
            }
            
            // 형용사형: -ive, -able, -ible, -al
            if (clean.endsWith('ive') || clean.endsWith('able') || clean.endsWith('ible') || 
                (clean.endsWith('al') && clean.length > 4)) {
              return true
            }
            
            return false
          })
        
        // 단어 셔플
        const shuffledWords = [...words].sort(() => Math.random() - 0.5)
        
        // 셔플된 배열에서 변환 가능한 형태 찾기
        const shuffledTransformable = shuffledWords
          .map((w, idx) => ({ word: w, index: idx }))
          .filter(({ word }) => {
            const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
            if (clean.length < 4) return false
            
            // 동사형
            if (clean.endsWith('ing') || clean.endsWith('ed')) {
              return true
            }
            if (clean.endsWith('s')) {
              const excludedWords = ['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us']
              if (!excludedWords.includes(clean)) {
                return true
              }
            }
            
            // 명사형
            if (clean.endsWith('ment') || clean.endsWith('tion') || clean.endsWith('sion') || 
                clean.endsWith('ance') || clean.endsWith('ence')) {
              return true
            }
            
            // 형용사형
            if (clean.endsWith('ive') || clean.endsWith('able') || clean.endsWith('ible') || 
                (clean.endsWith('al') && clean.length > 4)) {
              return true
            }
            
            return false
          })
        
        // 변환 가능한 형태 분류
        const sortedTransformable = shuffledTransformable.sort((a, b) => {
          const aClean = a.word.replace(/[.,!?;:]/g, '').toLowerCase()
          const bClean = b.word.replace(/[.,!?;:]/g, '').toLowerCase()
          
          // ing/-ed 형태를 최우선 (변환 성공률 높음)
          const aIsVerb = aClean.endsWith('ing') || aClean.endsWith('ed')
          const bIsVerb = bClean.endsWith('ing') || bClean.endsWith('ed')
          if (aIsVerb && !bIsVerb) return -1
          if (!aIsVerb && bIsVerb) return 1
          
          // -s 형태를 두 번째 우선
          const aIsS = aClean.endsWith('s')
          const bIsS = bClean.endsWith('s')
          if (aIsS && !bIsS) return -1
          if (!aIsS && bIsS) return 1
          
          return 0
        })
        
        // 동사형과 명사형/형용사형 분리 (온점 없는 것만)
        const verbForms = sortedTransformable.filter(item => {
          const clean = item.word.replace(/[.,!?;:]/g, '').toLowerCase()
          const hasPeriod = /\./.test(item.word)
          return !hasPeriod && (clean.endsWith('ing') || clean.endsWith('ed') || clean.endsWith('s'))
        })
        
        const nounAdjForms = sortedTransformable.filter(item => {
          const clean = item.word.replace(/[.,!?;:]/g, '').toLowerCase()
          const hasPeriod = /\./.test(item.word)
          return !hasPeriod && (
            clean.endsWith('ment') || clean.endsWith('tion') || clean.endsWith('sion') ||
            clean.endsWith('ance') || clean.endsWith('ence') ||
            clean.endsWith('ive') || clean.endsWith('able') || clean.endsWith('ible') ||
            (clean.endsWith('al') && clean.length > 4)
          )
        })
        
        // 먼저 동사형만 변환 시도 (최대 2개)
        const selectedVerbs = verbForms.slice(0, 2)
        let baseFormsMap = {}
        let transformedWords = new Set()
        let boldIndices = new Set()
        
        if (selectedVerbs.length > 0) {
          // 원본 단어와 구두점 분리하여 저장
          const wordMapping = selectedVerbs.map(item => {
            const cleanWord = item.word.replace(/[.,!?;:]/g, '')
            const punctuation = item.word.replace(/[^.,!?;:]/g, '')
            return {
              original: item.word,
              clean: cleanWord,
              punctuation: punctuation,
              index: item.index
            }
          })
          
          // AI에게는 순수 단어만 전달
          const cleanWordsToConvert = wordMapping.map(w => w.clean)
          try {
            const baseFormsResponse = await getBaseForms(cleanWordsToConvert, apiKey)
            
            wordMapping.forEach(({ original, clean, punctuation }) => {
              const baseForm = baseFormsResponse[clean] || clean
              const finalForm = baseForm + punctuation
              
              const originalClean = original.replace(/[.,!?;:]/g, '').toLowerCase()
              const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()
              
              if (originalClean !== finalClean) {
                baseFormsMap[original] = finalForm
                transformedWords.add(original)
                boldIndices.add(selectedVerbs.find(v => v.word === original)?.index)
              } else {
                baseFormsMap[original] = original
              }
            })
          } catch (error) {
            console.error('동사원형 변환 오류:', error)
            wordMapping.forEach(({ original }) => {
              baseFormsMap[original] = original
            })
          }
        }
        
        // 동사형이 1개만 변환되었고, 명사형/형용사형이 있다면 추가로 선택
        if (transformedWords.size === 1 && nounAdjForms.length > 0) {
          // 이미 선택된 동사형 제외
          const remainingNounAdj = nounAdjForms.filter(item => 
            !selectedVerbs.some(v => v.index === item.index)
          )
          
          if (remainingNounAdj.length > 0) {
            const additionalWord = remainingNounAdj[0] // 1개만 추가 선택
            
            const cleanWord = additionalWord.word.replace(/[.,!?;:]/g, '')
            const punctuation = additionalWord.word.replace(/[^.,!?;:]/g, '')
            
            try {
              const baseFormsResponse = await getBaseForms([cleanWord], apiKey)
              const baseForm = baseFormsResponse[cleanWord] || cleanWord
              const finalForm = baseForm + punctuation
              
              const originalClean = additionalWord.word.replace(/[.,!?;:]/g, '').toLowerCase()
              const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()
              
              if (originalClean !== finalClean) {
                // 실제로 변환된 경우만
                baseFormsMap[additionalWord.word] = finalForm
                transformedWords.add(additionalWord.word)
                boldIndices.add(additionalWord.index)
              } else {
                baseFormsMap[additionalWord.word] = additionalWord.word
              }
            } catch (error) {
              console.error('명사/형용사형 변환 오류:', error)
              baseFormsMap[additionalWord.word] = additionalWord.word
            }
          }
        }
        
        // 변환된 단어 배열 생성 (볼드 태그 없이, 변환된 형태 유지)
        const transformedShuffledWords = shuffledWords.map((word, idx) => {
          if (boldIndices.has(idx) && transformedWords.has(word)) {
            // 실제로 변환된 단어는 변환된 형태 사용
            return baseFormsMap[word] || word
          }
          return word
        })
        
        // 볼드 처리된 보기 생성 (실제로 변환된 단어만 볼드 처리)
        const boldedShuffledWords = shuffledWords.map((word, idx) => {
          if (boldIndices.has(idx)) {
            // 실제로 변환된 단어만 볼드 처리
            if (transformedWords.has(word)) {
              const baseForm = baseFormsMap[word] || word
              return `<b>${baseForm}</b>`
            } else {
              // 변환되지 않은 경우 (예: 명사 복수형) - 볼드 처리하지 않음
              return word
            }
          }
          return word
        })
        
        // 실제 변환된 단어 개수에 따라 조건 문구 생성
        const transformedCount = transformedWords.size
        let conditionText = ''
        if (transformedCount === 0) {
          conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>필요한 경우</b> 어법에 맞게 그 형태를 바꿀 것'
        } else if (transformedCount === 1) {
          conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것'
        } else {
          conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>두 단어만</b> 어법에 맞게 그 형태를 바꿀 것'
        }
        
        results.push({
          source: source.trim(),
          original: englishText,
          summary: summary,
          remainingWords: words,
          shuffledWords: shuffledWords, // 원본 단어들
          transformedShuffledWords: transformedShuffledWords, // 변환된 단어들 (볼드 없음)
          boldedShuffledWords: boldedShuffledWords, // HTML 형식 (볼드 포함)
          conditionText: conditionText, // 조건 문구 (실제 변환된 개수 기준)
          koreanTranslation
        })
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 중 오류:`, error)
        results.push({
          source: source.trim(),
          original: englishText,
          summary: `[오류: ${error.message}]`,
          remainingWords: [],
          shuffledWords: [],
          koreanTranslation,
          error: error.message
        })
      }
    }

    // 결과 포맷팅 (문제 부분) - 요약문은 별도로 저장
    const formattedResults = results.map((r, index) => {
      if (r.error) {
        return {
          text: r.source + '\n' + r.original + '\n\n[오류: ' + r.error + ']\n\n\n\n\n\n\n\n\n',
          summary: null
        }
      }
      
      let formatted = r.source || `지문 ${index + 1}`
      formatted += '\n' // 출처 다음 줄바꿈
      formatted += r.original + '\n' // 영어원문 + 줄바꿈 1줄 (요약문 앞)
      formatted += r.summary + '\n' // 요약문 + 줄바꿈 1번
      formatted += 'The passage suggests that ___________________________.\n\n' // 빈칸 문장 + 줄바꿈 2번
      // 보기: 볼드체 포함 (처리된 텍스트용)
      formatted += '<보기>\n' + (r.boldedShuffledWords ? r.boldedShuffledWords.join(' / ') : r.shuffledWords.join(' / ')) + '\n\n' // 보기 + 줄바꿈 2번
      formatted += '<조건>\n' + (r.conditionText || '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>필요한 경우</b> 어법에 맞게 그 형태를 바꿀 것') + '\n\n\n\n\n' // 조건 + 줄바꿈 1줄 + 조건문 + 줄바꿈 5번
      
      return {
        text: formatted,
        summary: r.summary,
        source: r.source || `지문 ${index + 1}`
      }
    })

    // 문제 텍스트 결합
    const questionText = formattedResults.map(r => r.text).join('')
    
    // 답지 부분 (출처와 AI 요약문만 검은색으로)
    const answerSheet = results
      .filter(r => !r.error)
      .map((r, index) => {
        return (r.source || `지문 ${index + 1}`) + '\n' + r.summary
      })
      .join('\n\n')

    return {
      original: inputText,
      summary: questionText, // 문제 부분
      answerSheet: answerSheet, // 답지 부분
      questionParts: formattedResults, // 문제 부분 상세 정보 (요약문 위치 추적용)
      results
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }

    if (!apiKey) {
      setError('API 키를 먼저 설정해주세요.')
      return
    }

    setIsLoading(true)
    setError('')
    
    try {
      const result = await processAllTexts(text, apiKey)
      onProcess(result)
    } catch (error) {
      console.error('처리 중 오류 발생:', error)
      setError(error.message || '처리 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="sum15-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label htmlFor="text">지문 입력 *</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="출처/영어원문/한글해석// 출처2/영어원문2/한글해석2// 형식으로 입력하세요."
            rows="12"
            required
            disabled={isLoading}
          />
          <small>형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능)</small>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="button-group">
          <button 
            type="button" 
            onClick={() => {
              setText('')
              setError('')
            }}
            className="btn btn-reset"
            disabled={isLoading}
          >
            입력 초기화
          </button>
          <button type="submit" className="btn btn-submit" disabled={isLoading}>
            {isLoading ? '처리 중...' : '처리 실행'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Sum15Input

