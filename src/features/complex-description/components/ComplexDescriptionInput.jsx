import { useState } from 'react'
import './ComplexDescriptionInput.css'
import { findKeySentence, findComplexSentence, findDifficultWords, translateSentence } from '../utils/complexDescriptionAnalyzer'

function ComplexDescriptionInput({ text, setText, onProcess, apiKey }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 관사와 다음 단어 사이, 접속사와 뒷단어 사이 스페이스를 ++로 치환
  const replaceArticleSpace = (sentence) => {
    // 관사: a, an, the
    let result = sentence.replace(/\b(a|an|the)\s+([a-zA-Z])/g, '$1++$2')
    
    // 접속사와 뒷단어 사이 스페이스를 ++로 치환
    // 일반 접속사: and, or, but, so, because, although, if, when, while, since, until, before, after, that, which, who, where, how, why, what, whether, as, than, though
    // 복합 접속사: even though, in order that, so that, such that, now that, as long as, as soon as, provided that
    // 부사적 접속사: therefore, thus, hence, consequently, accordingly, furthermore, moreover, additionally, besides, also, too
    const conjunctions = [
      'and', 'or', 'but', 'so', 'because', 'although', 'if', 'when', 'while', 
      'since', 'until', 'before', 'after', 'that', 'which', 'who', 'where', 
      'how', 'why', 'what', 'whether', 'as', 'than', 'though', 'once', 'unless',
      'whenever', 'therefore', 'thus', 'hence', 'consequently', 'accordingly', 
      'furthermore', 'moreover', 'additionally', 'besides', 'also', 'too',
      'even though', 'in order that', 'so that', 'such that', 'now that',
      'as long as', 'as soon as', 'provided that'
    ]
    
    // 긴 접속사부터 처리 (복합 접속사 우선)
    const sortedConjunctions = conjunctions.sort((a, b) => b.length - a.length)
    
    // 접속사와 뒷단어 사이 스페이스를 ++로 치환
    for (const conj of sortedConjunctions) {
      const escapedConj = conj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escapedConj}\\s+([a-zA-Z])`, 'gi')
      result = result.replace(regex, `${conj}++$1`)
    }
    
    return result
  }

  // ++를 스페이스로 되돌리기
  const restoreSpaces = (sentence) => {
    return sentence.replace(/\+\+/g, ' ')
  }

  // 문장의 위치 찾기 (시작 인덱스, 끝 인덱스)
  const findSentencePosition = (text, sentence) => {
    let index = text.indexOf(sentence)
    
    if (index === -1) {
      const lowerText = text.toLowerCase()
      const lowerSentence = sentence.toLowerCase()
      index = lowerText.indexOf(lowerSentence)
    }

    if (index === -1) return null

    // 문장 시작 찾기
    let start = index
    while (start > 0 && 
           text[start - 1] !== '.' && 
           text[start - 1] !== '!' && 
           text[start - 1] !== '?' &&
           text[start - 1] !== '\n') {
      start--
    }

    // 문장 끝 찾기 (온점 포함)
    let end = index + sentence.length
    if (end < text.length && text[end - 1] !== '.') {
      const periodIndex = text.indexOf('.', index)
      if (periodIndex !== -1) {
        end = periodIndex + 1
      }
    }

    return { start, end }
  }

  // 복합서술형 처리 함수 (단일 지문)
  const processSingleText = async (englishText, apiKey) => {
    // 1. 주제 문장 찾기 (시험에서 가장 의미있는 문장)
    let keySentence = await findKeySentence(englishText, apiKey)
    let keyPos = findSentencePosition(englishText, keySentence)
    
    // 주제 문장을 찾지 못한 경우, 대체 문장 선택
    if (!keyPos) {
      // 문장들을 분리하여 첫 번째 의미있는 문장 선택
      const sentences = englishText.match(/[^.!?]+[.!?]+/g) || []
      if (sentences.length > 0) {
        // 가장 긴 문장이나 첫 번째 문장 선택
        keySentence = sentences[0].trim()
        keyPos = findSentencePosition(englishText, keySentence)
      }
      
      // 여전히 찾지 못하면 원문의 첫 부분 사용
      if (!keyPos) {
        const firstSentenceMatch = englishText.match(/^[^.!?\n]+[.!?]+/)
        if (firstSentenceMatch) {
          keySentence = firstSentenceMatch[0].trim()
          keyPos = { start: 0, end: firstSentenceMatch[0].length }
        } else {
          throw new Error('처리할 수 있는 문장을 찾을 수 없습니다.')
        }
      }
    }

    let processed = englishText

    // 2. 주제 문장 첫 단어 앞에 { 추가
    const keySentenceText = processed.substring(keyPos.start, keyPos.end)
    const beforeKey = processed.substring(0, keyPos.start)
    const afterKey = processed.substring(keyPos.end)
    
    // 첫 단어 찾기 (공백 제거 후)
    const trimmedKey = keySentenceText.trim()
    const firstWordStart = keySentenceText.indexOf(trimmedKey[0])
    const keyWithBrace = keySentenceText.substring(0, firstWordStart) + 
                        '{' + 
                        keySentenceText.substring(firstWordStart)
    
    processed = beforeKey + keyWithBrace + afterKey
    const newKeyPos = { start: keyPos.start, end: keyPos.end + 1 } // { 추가로 길이 +1

    // 3. 주제 문장에서 관사와 관사 다음 단어 사이 스페이스를 ++로 치환
    const braceIndex = processed.indexOf('{', newKeyPos.start)
    const periodInBrace = processed.indexOf('.', braceIndex)
    
    if (periodInBrace !== -1) {
      const sentenceInBrace = processed.substring(braceIndex + 1, periodInBrace + 1)
      const replacedSentence = replaceArticleSpace(sentenceInBrace)
      processed = processed.substring(0, braceIndex + 1) + 
                  replacedSentence + 
                  processed.substring(periodInBrace + 1)
    }

    // 4. 주제 문장 끝(온점) 뒤에 / 추가
    const periodAfterBrace = processed.indexOf('.', braceIndex)
    if (periodAfterBrace !== -1) {
      processed = processed.substring(0, periodAfterBrace + 1) + 
                  '/' + 
                  processed.substring(periodAfterBrace + 1)
    }

    // 5. / 뒤에 주제 문장 복사 (원본 문장 그대로, 치환 없이)
    const firstSlashIndex = processed.indexOf('/', braceIndex)
    if (firstSlashIndex !== -1) {
      // 원본 문장 복사 (치환되지 않은 원본)
      const originalSentence = keySentenceText.trim()
      processed = processed.substring(0, firstSlashIndex + 1) + 
                  originalSentence + 
                  processed.substring(firstSlashIndex + 1)
    }

    // 6. 복사한 문장 끝(온점) 뒤에 / 추가
    const copiedPeriodIndex = processed.indexOf('.', firstSlashIndex + 1)
    if (copiedPeriodIndex !== -1) {
      const afterPeriod = processed.substring(copiedPeriodIndex + 1)
      if (!afterPeriod.trim().startsWith('/')) {
        processed = processed.substring(0, copiedPeriodIndex + 1) + 
                    '/' + 
                    afterPeriod
      }
    }

    // 8. / 뒤에 한글 해석 추가
    if (copiedPeriodIndex !== -1) {
      const secondSlashAfterCopy = processed.indexOf('/', copiedPeriodIndex + 1)
      if (secondSlashAfterCopy !== -1) {
        // 복사한 문장 가져오기 (++ 제거된 버전, 즉 두 번째 / 전의 문장)
        const copiedSentenceForTranslation = processed.substring(firstSlashIndex + 1, copiedPeriodIndex + 1)
        const koreanTranslation = await translateSentence(copiedSentenceForTranslation.trim(), apiKey)
        
        processed = processed.substring(0, secondSlashAfterCopy + 1) + 
                    koreanTranslation + 
                    processed.substring(secondSlashAfterCopy + 1)
      }

      // 9. 한글 해석 끝(온점) 뒤에 } 추가
      // 한글 해석이 추가된 위치 찾기 (두 번째 / 뒤)
      const koreanSlashIndex = processed.indexOf('/', copiedPeriodIndex + 1)
      if (koreanSlashIndex !== -1) {
        const koreanPeriodIndex = processed.indexOf('.', koreanSlashIndex)
        if (koreanPeriodIndex !== -1) {
          const afterKorean = processed.substring(koreanPeriodIndex + 1)
          if (!afterKorean.trim().startsWith('}')) {
            processed = processed.substring(0, koreanPeriodIndex + 1) + 
                        '}' + 
                        afterKorean
          }
        }
      }
    }

    // 10. 문법적으로 가장 복잡한 문장 찾기 ({ } 안 제외)
    const braceStart = processed.indexOf('{')
    const braceEnd = processed.indexOf('}', braceStart)
    const excludeRanges = [{ start: braceStart, end: braceEnd }]
    
    const complexSentence = await findComplexSentence(englishText, excludeRanges, apiKey)
    const complexPos = findSentencePosition(processed, complexSentence)
    
    if (complexPos) {
      // { } 안에 있는지 확인
      const isInBrace = complexPos.start >= braceStart && complexPos.end <= braceEnd
      
      if (!isInBrace) {
        // 복잡한 문장 앞에 [ 추가, 온점 뒤에 스페이스 추가
        const complexSentenceText = processed.substring(complexPos.start, complexPos.end)
        let beforeComplex = processed.substring(0, complexPos.start)
        const afterComplex = processed.substring(complexPos.end)
        
        // beforeComplex 끝이 온점이면 스페이스 추가
        if (beforeComplex.trim().endsWith('.')) {
          beforeComplex = beforeComplex.trim() + ' '
        }
        
        const complexPeriodIndex = complexSentenceText.lastIndexOf('.')
        if (complexPeriodIndex !== -1) {
          const beforePeriod = complexSentenceText.substring(0, complexPeriodIndex + 1)
          const afterPeriod = complexSentenceText.substring(complexPeriodIndex + 1)
          // 형식: 문장. [문장.] (온점 뒤에 스페이스)
          processed = beforeComplex + 
                      '[' + 
                      beforePeriod.trim() + 
                      ']' + 
                      afterPeriod + 
                      afterComplex
        }
      }
    }

    // 11. 고난이도 단어 6개 찾기 ({ } 와 [ ] 안 제외)
    const bracketStart = processed.indexOf('[')
    const bracketEnd = processed.indexOf(']', bracketStart)
    const updatedExcludeRanges = [...excludeRanges]
    if (bracketStart !== -1 && bracketEnd !== -1) {
      updatedExcludeRanges.push({ start: bracketStart, end: bracketEnd + 1 })
    }
    
    // { } 와 [ ] 범위 업데이트
    const finalBraceStart = processed.indexOf('{')
    const finalBraceEnd = processed.indexOf('}', finalBraceStart)
    if (finalBraceStart !== -1 && finalBraceEnd !== -1) {
      updatedExcludeRanges[0] = { start: finalBraceStart, end: finalBraceEnd + 1 }
    }
    
    const difficultWords = await findDifficultWords(processed, updatedExcludeRanges, apiKey)
    
    // 단어들을 역순으로 추가 (뒤에서부터 추가하여 인덱스 변화 방지)
    const sortedWords = []
    for (const wordInfo of difficultWords) {
      // 단어의 모든 위치 찾기 (같은 단어가 여러 번 나올 수 있음)
      let searchIndex = 0
      while (true) {
        const wordIndex = processed.indexOf(wordInfo.word, searchIndex)
        if (wordIndex === -1) break
        
        // { } 또는 [ ] 안에 있는지 확인
        let isExcluded = false
        for (const range of updatedExcludeRanges) {
          if (wordIndex >= range.start && wordIndex + wordInfo.word.length <= range.end) {
            isExcluded = true
            break
          }
        }
        
        if (!isExcluded) {
          sortedWords.push({ ...wordInfo, index: wordIndex })
          break // 첫 번째로 나오는 제외되지 않은 단어만 사용
        }
        
        searchIndex = wordIndex + 1
      }
    }
    
    // 역순 정렬
    sortedWords.sort((a, b) => b.index - a.index)
    
    for (const wordInfo of sortedWords) {
      // 단어 앞에 < 추가, 뒤에 /한글뜻/영어단어> 추가
      const beforeWord = processed.substring(0, wordInfo.index)
      const afterWord = processed.substring(wordInfo.index + wordInfo.word.length)
      processed = beforeWord + 
                  '<' + 
                  wordInfo.korean + 
                  '/' + 
                  wordInfo.word + 
                  '>' + 
                  afterWord
    }

    return processed
  }

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
        // 영어원문 처리 (줄바꿈은 그대로 유지)
        const processedEnglish = await processSingleText(englishText, apiKey)
        
        // 원본 블록에서 영어원문 부분만 처리된 텍스트로 교체
        // 구조: 출처(줄바꿈)/(줄바꿈)처리된영어원문(줄바꿈)/(줄바꿈)한글해석(줄바꿈)
        const firstSlashIndex = block.indexOf('/')
        const afterFirstSlash = block.substring(firstSlashIndex + 1)
        const secondSlashIndex = afterFirstSlash.indexOf('/')
        
        if (secondSlashIndex !== -1) {
          // 영어원문 시작 위치 (첫 번째 / 뒤)
          const englishStart = firstSlashIndex + 1
          // 영어원문 끝 위치 (두 번째 / 전)
          const englishEnd = firstSlashIndex + 1 + secondSlashIndex
          
          // 원본 블록에서 영어원문 부분만 처리된 텍스트로 교체
          // 한글해석 부분은 그대로 유지
          let beforeEnglish = block.substring(0, englishStart) // 출처 + /
          const afterEnglish = block.substring(englishEnd) // 두 번째 / 이후 전체 (한글해석 포함)
          
          // 첫 번째 / 뒤에 줄바꿈 추가 (없는 경우만)
          if (!beforeEnglish.endsWith('\n') && !beforeEnglish.endsWith('/\n')) {
            // / 뒤에 줄바꿈이 없으면 추가
            if (beforeEnglish.endsWith('/')) {
              beforeEnglish = beforeEnglish + '\n'
            }
          }
          
          // 처리된 블록 생성: 출처 + / + 줄바꿈 + 처리된영어원문 + / + 한글해석
          const processedBlock = beforeEnglish + processedEnglish + afterEnglish
          
          results.push({
            source: source.trim(),
            original: englishText,
            processed: processedBlock,
            originalBlock: block
          })
        } else {
          // 두 번째 /가 없는 경우 (형식 오류)
          results.push({
            source: source.trim(),
            original: englishText,
            processed: block.substring(0, firstSlashIndex + 1) + processedEnglish,
            originalBlock: block
          })
        }
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 중 오류:`, error)
        results.push({
          source: source.trim(),
          original: englishText,
          processed: `[오류: ${error.message}]`,
          error: error.message,
          originalBlock: block
        })
      }
    }

    // 모든 결과를 원본 구조 유지하며 조합
    // 형식: 출처\n\n\n/\n처리된텍스트\n/\n한글해석\n//
    const finalProcessed = results.map((r, index) => {
      // 각 지문의 처리된 결과에서 마지막 줄바꿈 정리
      let processedBlock = r.processed
      
      // 마지막에 연속된 줄바꿈을 제거하고 // 추가
      // 한글해석 끝의 줄바꿈만 유지
      processedBlock = processedBlock.replace(/\n+$/, '') // 모든 마지막 줄바꿈 제거
      processedBlock = processedBlock + '\n//' // 줄바꿈 + // 추가
      
      return processedBlock
    }).join('')

    return {
      original: inputText,
      processed: finalProcessed,
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
    <div className="complex-description-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label htmlFor="text">지문 입력 *</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="출처/영어원문// 출처2/영어원문2// 형식으로 입력하세요. (한글해석은 자동 생성됩니다)"
            rows="12"
            required
            disabled={isLoading}
          />
          <small>형식: 출처/영어원문// (// 기준으로 여러 지문 입력 가능)</small>
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

export default ComplexDescriptionInput
