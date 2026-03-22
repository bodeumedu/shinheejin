import { useState } from 'react'
import './Sum15Input.css'
import { generateTopic13, getBaseForms } from '../utils/sum15Analyzer'

// 변형 가능한 단어인지 판별 (동사형 -ing/-ed/-s, 명사/형용사형)
function isTransformable(word) {
  const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
  if (clean.length < 4) return false
  if (clean.endsWith('ing') || clean.endsWith('ed')) return true
  if (clean.endsWith('s')) {
    const excluded = ['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us']
    if (!excluded.includes(clean)) return true
  }
  if (clean.endsWith('ment') || clean.endsWith('tion') || clean.endsWith('sion') ||
      clean.endsWith('ance') || clean.endsWith('ence')) return true
  if (clean.endsWith('ive') || clean.endsWith('able') || clean.endsWith('ible') ||
      (clean.endsWith('al') && clean.length > 4)) return true
  return false
}

// 시선 topic (변형): 시선 topic (원형)과 동일하되 답에서 한 단어만 어법 형태 변형 (SUM15는 두 단어, 여기는 한 단어)
function Topic13TransformedInput({ text, setText, onProcess, apiKey }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const processAllTexts = async (inputText, apiKey) => {
    const textBlocks = []
    let currentBlock = ''

    for (let i = 0; i < inputText.length; i++) {
      const char = inputText[i]
      const nextChar = inputText[i + 1]
      if (char === '/' && nextChar === '/') {
        textBlocks.push(currentBlock)
        currentBlock = ''
        i++
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
      const parts = []
      let currentPart = ''
      for (let j = 0; j < block.length; j++) {
        const char = block[j]
        const prevChar = j > 0 ? block[j - 1] : ''
        const nextChar = j < block.length - 1 ? block[j + 1] : ''
        if (char === '/' && prevChar !== '/' && nextChar !== '/') {
          parts.push(currentPart)
          currentPart = ''
        } else {
          currentPart += char
        }
      }
      if (currentPart.length > 0) parts.push(currentPart)

      const source = parts[0] || ''
      const englishText = parts[1] || ''
      const koreanTranslation = parts[2] || ''

      if (!englishText.trim()) {
        console.warn(`지문 ${i + 1}: 영어원문이 없어 건너뜁니다.`)
        continue
      }

      try {
        const topic = await generateTopic13(englishText, apiKey)
        const words = (topic || '').split(/\s+/).filter(w => w.length > 0)
        const shuffledWords = [...words].sort(() => Math.random() - 0.5)

        // 변형 가능한 단어만 (셔플된 순서에서)
        const transformableList = shuffledWords
          .map((w, idx) => ({ word: w, index: idx }))
          .filter(({ word }) => isTransformable(word))
        // 동사형 우선 (ing/ed/s)
        const verbFirst = transformableList.filter(({ word }) => {
          const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
          return clean.endsWith('ing') || clean.endsWith('ed') || (clean.endsWith('s') && !['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us'].includes(clean))
        })
        const toTransform = (verbFirst.length > 0 ? verbFirst[0] : transformableList[0])

        let baseFormsMap = {}
        let transformedShuffledWords = [...shuffledWords]
        let boldedShuffledWords = shuffledWords.map(w => w)
        const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것'

        if (toTransform) {
          const cleanWord = toTransform.word.replace(/[.,!?;:]/g, '')
          const punctuation = toTransform.word.replace(/[^.,!?;:]/g, '')
          try {
            const baseFormsResponse = await getBaseForms([cleanWord], apiKey)
            const baseForm = baseFormsResponse[cleanWord] || cleanWord
            const finalForm = baseForm + punctuation
            const originalClean = toTransform.word.replace(/[.,!?;:]/g, '').toLowerCase()
            const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()

            if (originalClean !== finalClean) {
              baseFormsMap[toTransform.word] = finalForm
              transformedShuffledWords[toTransform.index] = finalForm
              boldedShuffledWords[toTransform.index] = `<b>${finalForm}</b>`
            }
          } catch (err) {
            console.error('어법 변형 오류:', err)
          }
        }

        results.push({
          source: source.trim(),
          original: englishText,
          summary: topic,
          remainingWords: words,
          shuffledWords: shuffledWords,
          transformedShuffledWords: transformedShuffledWords,
          boldedShuffledWords: boldedShuffledWords,
          conditionText,
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

    const formattedResults = results.map((r, index) => {
      if (r.error) {
        return {
          text: r.source + '\n' + r.original + '\n\n[오류: ' + r.error + ']\n\n\n\n\n\n\n\n\n',
          summary: null
        }
      }
      const 보기문자열 = (r.boldedShuffledWords || r.shuffledWords || []).join(' / ')
      let formatted = r.source || `지문 ${index + 1}`
      formatted += '\n'
      formatted += r.original + '\n'
      formatted += r.summary + '\n'
      formatted += 'The topic of the passage is ___________________________.\n\n'
      formatted += '<보기>\n' + 보기문자열 + '\n\n'
      formatted += '<조건>\n' + (r.conditionText || '') + '\n\n\n\n\n'
      return {
        text: formatted,
        summary: r.summary,
        source: r.source || `지문 ${index + 1}`
      }
    })

    const questionText = formattedResults.map(r => r.text).join('')
    const answerSheet = results
      .filter(r => !r.error)
      .map((r) => (r.source || '') + '\n' + r.summary)
      .join('\n\n')

    return {
      original: inputText,
      summary: questionText,
      answerSheet: answerSheet,
      questionParts: formattedResults,
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
          <small>형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 글의 주제 구(phrase) 약 13단어, 한 단어만 어법 변형</small>
        </div>
        {error && <div className="error-message">{error}</div>}
        <div className="button-group">
          <button type="button" onClick={() => { setText(''); setError(''); }} className="btn btn-reset" disabled={isLoading}>
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

export default Topic13TransformedInput
