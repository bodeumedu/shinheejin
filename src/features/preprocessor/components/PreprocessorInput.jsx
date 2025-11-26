import { useState } from 'react'
import './PreprocessorInput.css'

function PreprocessorInput({ text, setText, onProcess }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 연결부사 목록
  const connectingAdverbs = [
    'So', 'However', 'In other words', 'Yet', 'Moreover', 'Furthermore', 
    'Thus', 'Therefore', 'But', 'Also', 'Additionally', 'Meanwhile',
    'Nevertheless', 'Nonetheless', 'Still', 'Then', 'Hence', 'Consequently',
    'Accordingly', 'Similarly', 'Likewise', 'Instead', 'Rather', 'Otherwise',
    'On the other hand', 'For example', 'Another', 'The other'
  ]

  // 대명사 목록
  const pronouns = [
    'I', 'You', 'He', 'She', 'It', 'We', 'They',
    'This', 'That', 'These', 'Those'
  ]

  // 한정사 목록
  const determiners = [
    'a', 'an', 'the', 'this', 'that', 'these', 'those',
    'some', 'any', 'no', 'every', 'each', 'either', 'neither',
    'both', 'all', 'few', 'little', 'many', 'much', 'several'
  ]

  // 문장을 나누는 함수 (원문 기준 인덱스 반환)
  const splitSentences = (text) => {
    const sentences = []
    // 문장 끝 패턴: . ! ? 뒤에 공백이나 줄바꿈
    const sentenceEndRegex = /[.!?]\s+/g
    let lastIndex = 0
    let match

    while ((match = sentenceEndRegex.exec(text)) !== null) {
      const sentenceEnd = match.index + 1 // . ! ? 위치
      const sentence = text.substring(lastIndex, sentenceEnd + match[0].length - 1) // 공백 포함
      if (sentence.trim()) {
        sentences.push({
          text: sentence,
          startIndex: lastIndex,
          endIndex: sentenceEnd + match[0].length - 1
        })
      }
      lastIndex = match.index + match[0].length
    }

    // 마지막 문장 처리
    if (lastIndex < text.length) {
      const remaining = text.substring(lastIndex)
      if (remaining.trim()) {
        sentences.push({
          text: remaining,
          startIndex: lastIndex,
          endIndex: text.length
        })
      }
    }

    return sentences
  }

  // 문장이 연결부사를 포함하는지 확인하고 위치 반환
  const findConnectingAdverb = (sentence) => {
    // 원본 문장 사용 (trim 하지 않음)
    for (const adverb of connectingAdverbs) {
      // 대소문자 구분 없이 검색
      const lowerSentence = sentence.toLowerCase()
      const lowerAdverb = adverb.toLowerCase()
      
      // 문장 시작 부분에 연결부사가 있는지 확인
      const trimmed = sentence.trim()
      if (trimmed.toLowerCase().startsWith(lowerAdverb + ' ') || trimmed.toLowerCase().startsWith(lowerAdverb + ',')) {
        return { found: true, position: 'start', adverb }
      }
      
      // 문장 중간에 연결부사가 있는지 확인 (원본 문장에서 직접 검색)
      const escapedAdverb = adverb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 여러 단어인 경우 (예: "on the other hand") 공백을 포함한 정확한 매칭
      const adverbPattern = escapedAdverb.replace(/\s+/g, '\\s+')
      
      // 패턴 1: 앞에 구두점이 있는 경우
      const regex1 = new RegExp(`([;,]\\s*)${adverbPattern}(?=\\s|[,;.!?]|$)`, 'i')
      // 패턴 2: 앞에 공백만 있는 경우 (문장 중간)
      const regex2 = new RegExp(`(\\s+)${adverbPattern}(?=\\s|[,;.!?]|$)`, 'i')
      
      const match1 = sentence.match(regex1)
      if (match1) {
        return { found: true, position: 'middle', adverb, matchIndex: match1.index + match1[1].length }
      }
      
      const match2 = sentence.match(regex2)
      if (match2 && match2.index > 0) { // 문장 시작이 아닌 경우만
        return { found: true, position: 'middle', adverb, matchIndex: match2.index + match2[1].length }
      }
    }
    return { found: false }
  }

  // 문장이 연결부사를 포함하는지 확인 (기존 호환성)
  const hasConnectingAdverb = (sentence) => {
    return findConnectingAdverb(sentence).found
  }

  // 문장에 "such"가 포함되어 있는지 확인 ("such as"는 제외)
  const hasSuch = (sentence) => {
    // "such as"를 제외하고 "such"만 찾기
    const regex = /\bsuch\b(?!\s+as\b)/i
    return regex.test(sentence)
  }

  // 문장이 대명사로 시작하는지 확인
  const startsWithPronoun = (sentence) => {
    const trimmed = sentence.trim()
    for (const pronoun of pronouns) {
      const regex = new RegExp(`^${pronoun}\\s+`, 'i')
      if (regex.test(trimmed)) {
        return true
      }
    }
    return false
  }

  // 문장이 한정사로 시작하는지 확인
  const startsWithDeterminer = (sentence) => {
    const trimmed = sentence.trim()
    for (const determiner of determiners) {
      const regex = new RegExp(`^${determiner}\\s+`, 'i')
      if (regex.test(trimmed)) {
        return true
      }
    }
    return false
  }

  // 문장의 첫 대문자 위치 찾기
  const findFirstCapital = (sentence) => {
    const match = sentence.match(/[A-Z]/)
    return match ? sentence.indexOf(match[0]) : -1
  }

  // 전처리 함수
  const preprocessText = (inputText) => {
    // // 기준으로 지문 나누기 (줄바꿈과 공백 모두 보존)
    const blocks = []
    const parts = inputText.split(/(\/\/)/)
    
    let currentBlock = { text: '', separator: '' }
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      
      if (part === '//') {
        // // 구분자 발견 - 현재 블록 저장하고 새 블록 시작
        if (currentBlock.text.trim().length > 0) {
          blocks.push({ ...currentBlock, separator: currentBlock.separator + '//' })
        }
        currentBlock = { text: '', separator: '//' }
      } else {
        // // 뒤의 내용인지 확인
        if (currentBlock.separator.includes('//') && !currentBlock.separator.endsWith('//')) {
          // 이미 separator에 내용이 있음 (이전 // 뒤의 내용)
          currentBlock.separator += part
        } else if (currentBlock.separator === '//') {
          // // 바로 뒤의 내용
          const nextSlashIndex = part.indexOf('//')
          if (nextSlashIndex >= 0) {
            // 다음 // 가 있음
            currentBlock.separator += part.substring(0, nextSlashIndex + 2)
            currentBlock.text = part.substring(nextSlashIndex + 2)
          } else {
            // 마지막 지문
            currentBlock.text = part
            currentBlock.separator = ''
          }
        } else {
          // 첫 지문 또는 지문 내용
          currentBlock.text += part
        }
      }
    }
    
    // 마지막 블록 처리
    if (currentBlock.text.trim().length > 0) {
      blocks.push(currentBlock)
    }
    
    // // 가 없어서 블록이 없는 경우
    if (blocks.length === 0 && inputText.trim().length > 0) {
      blocks.push({ text: inputText, separator: '' })
    }

    const results = []

    blocks.forEach((blockInfo, blockIndex) => {
      const textBlock = blockInfo.text
      const sentences = splitSentences(textBlock)
      const candidates = []

      // 각 문장을 우선순위에 따라 분류
      sentences.forEach((sentence, sentenceIndex) => {
        const sentenceText = sentence.text.trim()
        let priority = 999
        let reason = ''

        // 우선순위 1: 연결부사
        if (hasConnectingAdverb(sentence.text)) {
          priority = 1
          reason = 'connecting-adverb'
        }
        // 우선순위 2: such
        else if (hasSuch(sentenceText)) {
          priority = 2
          reason = 'such'
        }
        // 우선순위 3: 대명사
        else if (startsWithPronoun(sentenceText)) {
          priority = 3
          reason = 'pronoun'
        }
        // 우선순위 4: 한정사
        else if (startsWithDeterminer(sentenceText)) {
          priority = 4
          reason = 'determiner'
        }

        if (priority < 999) {
          candidates.push({
            sentence,
            priority,
            reason,
            sentenceIndex
          })
        }
      })

      // 우선순위 순으로 정렬하고 상위 2개만 선택
      candidates.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority
        }
        return a.sentenceIndex - b.sentenceIndex
      })

      const selected = candidates.slice(0, 2)
      const slashCount = selected.length

      // 원문을 그대로 유지하면서 슬래시만 추가
      // 역순으로 처리하여 인덱스 오프셋 문제 방지
      const insertions = selected.map(({ sentence, reason }) => {
        // 연결부사든 다른 조건이든 모두 문장의 첫 번째 단어 앞에 슬래시 추가
        if (reason === 'connecting-adverb') {
          // 연결부사가 문장 중간에 있어도 문장의 첫 번째 단어 앞에 추가
          const firstCapitalIndex = findFirstCapital(sentence.text)
          if (firstCapitalIndex >= 0) {
            return sentence.startIndex + firstCapitalIndex
          }
        } else if (reason === 'determiner') {
          // 한정사인 경우: 첫 대문자 앞에 추가
          const firstCapitalIndex = findFirstCapital(sentence.text)
          if (firstCapitalIndex >= 0) {
            return sentence.startIndex + firstCapitalIndex
          }
        } else {
          // such나 대명사인 경우: 첫 대문자 앞에 추가
          const firstCapitalIndex = findFirstCapital(sentence.text)
          if (firstCapitalIndex >= 0) {
            return sentence.startIndex + firstCapitalIndex
          }
        }
        return -1
      }).filter(idx => idx >= 0).sort((a, b) => b - a) // 내림차순 정렬

      let processedText = textBlock
      insertions.forEach(insertIndex => {
        processedText = processedText.substring(0, insertIndex) + '///' + processedText.substring(insertIndex)
      })

      results.push({
        original: textBlock,
        processed: processedText,
        separator: blockInfo.separator,
        slashCount,
        isValid: slashCount === 2
      })
    })

    // 전체 결과 조합 (원본의 줄바꿈과 // 구분자 보존)
    let finalProcessed = ''
    let charOffset = 0
    
    results.forEach((result, idx) => {
      if (idx > 0) {
        finalProcessed += result.separator
        charOffset += result.separator.length
      }
      finalProcessed += result.processed
      charOffset += result.processed.length
    })

    const allValid = results.every(r => r.isValid)

    return {
      original: inputText,
      processed: finalProcessed,
      results,
      allValid
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setError('')
    
    try {
      const result = preprocessText(text)
      onProcess(result)
    } catch (error) {
      console.error('전처리 중 오류 발생:', error)
      setError(error.message || '전처리 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="preprocessor-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label htmlFor="text">지문 입력 *</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="영어 지문을 입력하세요. // 기준으로 지문을 나누고, 각 지문당 슬래시 2개가 추가됩니다."
            rows="12"
            required
            disabled={isLoading}
          />
          <small>
            전처리 규칙:<br/>
            1. // 기준으로 지문 나누기<br/>
            2. 각 지문당 슬래시(///) 2개만 추가 (우선순위: 연결부사 → such → 대명사)<br/>
            3. 원문은 절대 변경하지 않고 슬래시만 추가
          </small>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <button type="submit" className="btn-submit" disabled={isLoading}>
          {isLoading ? '전처리 중...' : '전처리 실행'}
        </button>
      </form>
    </div>
  )
}

export default PreprocessorInput
