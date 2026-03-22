import { useState } from 'react'
import './Sum15Input.css'
import { generateInterview25, getBaseForms } from '../utils/sum15Analyzer'

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

// 한 문장을 단어로 셔플하고 한 단어만 어법 변형한 보기 문자열 반환
async function shuffleAndTransformOne(sentence, apiKey) {
  const words = (sentence || '').split(/\s+/).filter(w => w.length > 0)
  const shuffledWords = [...words].sort(() => Math.random() - 0.5)
  const transformableList = shuffledWords
    .map((w, idx) => ({ word: w, index: idx }))
    .filter(({ word }) => isTransformable(word))
  const verbFirst = transformableList.filter(({ word }) => {
    const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
    return clean.endsWith('ing') || clean.endsWith('ed') || (clean.endsWith('s') && !['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us'].includes(clean))
  })
  const toTransform = (verbFirst.length > 0 ? verbFirst[0] : transformableList[0])
  let transformedShuffledWords = [...shuffledWords]
  let boldedShuffledWords = shuffledWords.map(w => w)
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
        transformedShuffledWords[toTransform.index] = finalForm
        boldedShuffledWords[toTransform.index] = `<b>${finalForm}</b>`
      }
    } catch (err) {
      console.error('어법 변형 오류:', err)
    }
  }
  return { transformedShuffledWords, boldedShuffledWords }
}

// 시선 interview 25 (변형): 지문 기반 기자-저자 인터뷰 2질문·답변 각 25단어, 두 답 각각 셔플·각 한 단어 어법 변형, <보기> 두 개
function Interview25TransformedInput({ text, setText, onProcess, apiKey }) {
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
        const { q1, a1, q2, a2 } = await generateInterview25(englishText, apiKey)
        const { transformedShuffledWords: t1, boldedShuffledWords: b1 } = await shuffleAndTransformOne(a1, apiKey)
        const { transformedShuffledWords: t2, boldedShuffledWords: b2 } = await shuffleAndTransformOne(a2, apiKey)

        const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것'
        const 보기1문자열 = (b1 || t1 || []).join(' / ')
        const 보기2문자열 = (b2 || t2 || []).join(' / ')

        // Q1, A1 빈칸, <보기>1, Q2, A2 빈칸, <보기>2, <조건> 한 블록으로
        const summaryBlock =
          'Q1: ' + (q1 || '').trim() + '\n\n' +
          'A1: ___________________________.\n\n' +
          '<보기>\n' + 보기1문자열 + '\n\n' +
          'Q2: ' + (q2 || '').trim() + '\n\n' +
          'A2: ___________________________.\n\n' +
          '<보기>\n' + 보기2문자열 + '\n\n' +
          '<조건>\n' + conditionText

        results.push({
          source: source.trim(),
          original: englishText,
          summary: summaryBlock,
          answer1Sentence: a1,
          answer2Sentence: a2,
          answerSentence: 'A1: ' + (a1 || '') + '\nA2: ' + (a2 || ''),
          shuffledWords: [],
          transformedShuffledWords: [],
          boldedShuffledWords: [],
          conditionText,
          koreanTranslation
        })
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 중 오류:`, error)
        results.push({
          source: source.trim(),
          original: englishText,
          summary: `[오류: ${error.message}]`,
          answer1Sentence: '',
          answer2Sentence: '',
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
      let formatted = (r.source || `지문 ${index + 1}`) + '\n\n'
      formatted += r.original + '\n\n\n'
      formatted += (r.summary || '').trim() + '\n\n\n\n\n'
      return {
        text: formatted,
        summary: r.summary,
        answer1Sentence: r.answer1Sentence,
        answer2Sentence: r.answer2Sentence,
        source: r.source || `지문 ${index + 1}`
      }
    })

    const questionText = formattedResults.map(r => r.text).join('')
    const answerSheet = results
      .filter(r => !r.error)
      .map((r) => (r.source || '') + '\nA1: ' + (r.answer1Sentence || '') + '\nA2: ' + (r.answer2Sentence || ''))
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
          <small>형식: 출처/영어원문/한글해석// · 기자-저자 인터뷰 2질문, 두 답 각각 25단어 셔플·{'<보기>'} 따로, 어법 변형 각 한 단어</small>
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

export default Interview25TransformedInput
