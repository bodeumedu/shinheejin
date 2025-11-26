import { useState } from 'react'
import { generateThirdWordSummary } from '../utils/thirdWordAnalyzer'
import './ThirdWordInput.css'

const NUMBER_SYMBOLS = ['①', '②', '③', '④', '⑤']

function ThirdWordInput({ text, setText, onProcess, apiKey }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)

  const sanitizeSummary = (summary) => {
    return summary
      .replace(/[^a-zA-Z0-9\s'\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  const extractEnglishWords = (text) => {
    return text
      .replace(/[^a-zA-Z0-9\s'\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
  }

  const ensureWordRange = (words, englishText, min = 10, max = 15) => {
    let processed = [...words]

    if (processed.length > max) {
      processed = processed.slice(0, max)
    } else if (processed.length < min) {
      const englishWords = extractEnglishWords(englishText)
      const existing = new Set(processed)

      for (const word of englishWords) {
        if (processed.length >= min) break
        if (!existing.has(word)) {
          processed.push(word)
          existing.add(word)
        }
      }

      while (processed.length < min) {
        processed.push(processed[processed.length - 1] || 'content')
      }
    }

    return processed
  }

  const chunkWords = (words) => {
    const totalWords = words.length
    const chunksNeeded = 5
    const chunks = []
    let index = 0

    for (let i = 0; i < chunksNeeded; i++) {
      const remainingWords = totalWords - index
      const remainingChunks = chunksNeeded - i
      let chunkSize = 2

      if (remainingWords > remainingChunks * 2) {
        chunkSize = 3
      }

      const chunk = words.slice(index, index + chunkSize)
      if (chunk.length === 0) {
        chunk.push('key', 'point', `${i + 1}`)
      }
      chunks.push(chunk)
      index += chunkSize
    }

    return chunks
  }

  const shuffleArray = (array) => {
    const arr = [...array]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  const parseEnglishFromBlock = (block, index) => {
    const parts = block.split('/').map(part => part.trim())
    let source = ''
    let englishText = ''

    if (parts.length >= 3) {
      source = parts[0]
      englishText = parts[1]
    } else if (parts.length >= 2) {
      source = parts[0]
      englishText = parts[1]
    } else {
      source = `지문 ${index + 1}`
      englishText = block
    }

    englishText = englishText.replace(/\/해석[\s\S]*$/g, '').trim()
    englishText = englishText.replace(/\/해석[^\n]*/g, '').trim()

    // Remove lines that are mostly Korean
    const lines = englishText.split('\n')
    const englishLines = lines.map(line => {
      const koreanMatch = line.match(/[가-힣]+/)
      if (koreanMatch) {
        const englishPart = line.substring(0, koreanMatch.index).trim()
        return englishPart
      }
      return line.trim()
    }).filter(line => {
      if (!line || line.length === 0) return false
      const englishChars = (line.match(/[a-zA-Z]/g) || []).length
      return englishChars >= 3
    })

    englishText = englishLines.join('\n').trim()

    const englishCharCount = (englishText.match(/[a-zA-Z]/g) || []).length
    if (!englishText || englishText.length === 0 || englishCharCount < 10) {
      throw new Error(`지문 ${index + 1}: 영어원문이 없거나 한글해석만 입력되었습니다.`)
    }

    return { source: source.trim(), englishText: englishText.trim() }
  }

  const formatResultText = (source, englishText, questionText, options, correctSymbol, correctChunk, summaryText) => {
    let formatted = `[지문]\n${englishText.trim()}\n\n`
    formatted += `[문제]\n${questionText}\n\n`
    formatted += `[보기]\n`
    options.forEach((opt, idx) => {
      formatted += `${NUMBER_SYMBOLS[idx]} ${opt}\n`
    })
    formatted += `\n[정답] ${correctSymbol} (${correctChunk})\n\n`
    formatted += `[요약] ${summaryText}\n\n`
    return formatted
  }

  const handleProcess = async () => {
    if (!text || text.trim().length === 0) {
      alert('지문을 입력해주세요.')
      return
    }

    if (!apiKey) {
      alert('API 키를 설정해주세요.')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      const textBlocks = text.split('//').map(block => block.trim()).filter(block => block.length > 0)
      if (textBlocks.length === 0) {
        throw new Error('지문을 입력해주세요. (출처/영어원문/한글해석// 형식)')
      }

      const results = []

      for (let i = 0; i < textBlocks.length; i++) {
        const block = textBlocks[i]
        const { source, englishText } = parseEnglishFromBlock(block, i)

        try {
          const summaryData = await generateThirdWordSummary(englishText, apiKey)
          let summarySentence = summaryData.summary?.trim() || ''
          
          // 요약문을 그대로 사용 (AI가 생성한 완전한 문장 유지)
          // 단어 추출 시 아포스트로피 유지
          let words = extractEnglishWords(summarySentence)
          
          // 단어 수 확인: 10-15 범위가 아니면 경고만 하고 원본 사용
          if (words.length < 10 || words.length > 15) {
            console.warn(`요약문 단어 수가 범위를 벗어남: ${words.length}단어. 원본 요약문을 사용합니다.`)
            // 원본 요약문을 그대로 사용 (자르지 않음)
            const summaryWords = extractEnglishWords(summarySentence)
            words = summaryWords
          }
          
          // 요약문 재구성 (원본 단어 순서 유지, 아포스트로피 포함)
          const finalSummaryText = words.join(' ')
          const chunks = chunkWords(words)
          const chunkStrings = chunks.map((chunk) => chunk.join(' '))
          const thirdChunkIndex = Math.min(2, chunkStrings.length - 1)
          const thirdChunk = chunkStrings[thirdChunkIndex]

          const shuffledChunks = shuffleArray(chunkStrings)
          const questionText = '요약문 중 세번째로 오는 부분은 몇 번인가?'
          const correctOptionIndex = shuffledChunks.findIndex(chunk => chunk === thirdChunk)
          const correctSymbol = NUMBER_SYMBOLS[correctOptionIndex]

          const formattedText = formatResultText(
            source,
            englishText,
            questionText,
            shuffledChunks,
            correctSymbol,
            thirdChunk,
            finalSummaryText
          )

          results.push({
            source,
            original: englishText,
            processedText: formattedText,
            summary: finalSummaryText,
            question: questionText,
            options: shuffledChunks,
            correctSymbol,
            correctChunk: thirdChunk
          })
        } catch (err) {
          console.error(`지문 ${i + 1} 처리 중 오류:`, err)
          results.push({
            source,
            original: englishText,
            processedText: `[지문]\n${englishText}\n\n[오류: ${err.message}]\n\n`,
            summary: '',
            question: '',
            options: [],
            correctSymbol: '-',
            correctChunk: '',
            error: err.message
          })
        }
      }

      const formattedResults = results.map((r, index) => ({
        text: `[지문 ${index + 1}]\n${r.processedText}`,
        summary: r.summary,
        source: r.source || `지문 ${index + 1}`
      }))

      const allText = formattedResults.map(r => r.text).join('\n')

      onProcess({
        original: text,
        processed: allText,
        summary: allText,
        results
      })
    } catch (err) {
      setError(err.message || '처리 중 오류가 발생했습니다.')
      alert(err.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="third-word-container">
      <div className="third-word-header">
        <h2>Third Word</h2>
        <p>입력 형식: <strong>출처/영어원문/한글해석//</strong> (여러 지문 입력 가능)</p>
      </div>

      <div className="third-word-input-box">
        <label htmlFor="third-word-input">지문 입력</label>
        <textarea
          id="third-word-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="출처/영어원문/한글해석//&#10;출처2/영어원문2/한글해석2//"
          className="third-word-textarea"
        />
      </div>

      {error && (
        <div className="third-word-error">
          오류: {error}
        </div>
      )}

      <div className="third-word-actions">
        <button
          onClick={handleProcess}
          disabled={isProcessing || !text || !apiKey}
          className="btn btn-primary"
        >
          {isProcessing ? '처리 중...' : '처리 실행'}
        </button>
      </div>
    </div>
  )
}

export default ThirdWordInput

