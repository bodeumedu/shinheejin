import { useState } from 'react'
import { generateClozeQuestion, generateClozeExplanation } from '../utils/csatClozeAnalyzer'
import './CsatClozeInput.css'

function CsatClozeInput({ text, setText, onProcess, apiKey }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)

  const parseInput = (inputText) => {
    const blocks = inputText
      .split('//')
      .map(block => block.trim())
      .filter(block => block.length > 0)

    if (blocks.length === 0) {
      throw new Error('지문을 입력해주세요. (출처/영어원문/한글해석// 형식)')
    }

    return blocks.map((block, index) => {
      const parts = block.split('/').map(part => part.trim())
      if (parts.length < 3) {
        throw new Error(`지문 ${index + 1} 형식이 올바르지 않습니다. 출처/영어원문/한글해석// 순서를 확인해주세요.`)
      }

      const source = parts[0]
      const korean = parts[parts.length - 1]
      const english = parts.slice(1, -1).join('/')

      if (!source || !english || !korean) {
        throw new Error(`지문 ${index + 1}에 비어있는 항목이 있습니다.`)
      }

      return {
        id: index + 1,
        source,
        english,
        korean
      }
    })
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
      const result = await processAllTexts(text, apiKey)
      onProcess(result)
    } catch (err) {
      setError(err.message || '처리 중 오류가 발생했습니다.')
      alert(err.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  const processAllTexts = async (inputText, apiKey) => {
    // 텍스트를 //로 분리
    const textBlocks = inputText.split('//').filter(block => block.trim().length > 0)
    const results = []

    for (let i = 0; i < textBlocks.length; i++) {
      const block = textBlocks[i].trim()
      
      // 출처/영어원문/한글해석 형식 파싱
      const parts = block.split('/').map(p => p.trim())
      let source = ''
      let englishText = ''

      if (parts.length >= 3) {
        source = parts[0]
        englishText = parts[1] // 영어원문만
      } else if (parts.length >= 2) {
        source = parts[0]
        englishText = parts[1]
      } else {
        source = `지문 ${i + 1}`
        englishText = block
      }
      
      // 추가로 한글해석 제거 (혹시 남아있는 경우)
      englishText = englishText.replace(/\/해석[\s\S]*$/g, '').trim()
      englishText = englishText.replace(/\/해석[^\n]*/g, '').trim()
      
      // 한글이 포함된 라인에서 영어 부분만 추출
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
      
      // 영어원문이 비어있는지 확인
      const englishCharCount = (englishText.match(/[a-zA-Z]/g) || []).length
      if (!englishText || englishText.length === 0 || englishCharCount < 10) {
        throw new Error(`지문 ${i + 1}: 영어원문이 없거나 한글해석만 입력되었습니다.`)
      }

      try {
        // 1단계: AI가 빈칸 문제 생성
        const questionData = await generateClozeQuestion(englishText, apiKey)
        
        // 2단계: 보기를 완전히 랜덤하게 섞기 (Fisher-Yates shuffle)
        const shuffledOptions = [...questionData.options]
        const correctAnswerText = shuffledOptions[questionData.correctAnswerIndex]
        
        // Fisher-Yates shuffle 알고리즘
        for (let j = shuffledOptions.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1))
          ;[shuffledOptions[j], shuffledOptions[k]] = [shuffledOptions[k], shuffledOptions[j]]
        }
        
        // 3단계: 섞인 보기에서 정답 위치 찾기
        const shuffledCorrectAnswerIndex = shuffledOptions.findIndex(opt => opt === correctAnswerText)
        const shuffledCorrectAnswerNumber = shuffledCorrectAnswerIndex + 1 // 1~5
        
        // 4단계: 섞인 보기 순서를 기준으로 해설 생성
        const explanation = await generateClozeExplanation(
          shuffledOptions,
          shuffledCorrectAnswerNumber,
          questionData.passageWithBlank,
          englishText,
          apiKey
        )
        
        results.push({
          source: source.trim(),
          original: englishText.trim(),
          passageWithBlank: questionData.passageWithBlank,
          options: shuffledOptions,
          correctAnswer: shuffledCorrectAnswerNumber,
          explanation: explanation
        })
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 중 오류:`, error)
        results.push({
          source: source.trim(),
          original: englishText.trim(),
          passageWithBlank: '[오류]',
          options: [],
          correctAnswer: 0,
          explanation: `[오류: ${error.message}]`,
          error: error.message
        })
      }
    }

    // 결과 포맷팅
    const formattedResults = results.map((r, index) => {
      if (r.error) {
        return {
          text: r.source + '\n' + r.original + '\n\n[오류: ' + r.error + ']\n\n',
          summary: null
        }
      }
      
      let formatted = '[문제 유형: 빈칸 추론]\n'
      formatted += '다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.\n\n'
      formatted += r.source || `지문 ${index + 1}`
      formatted += '\n\n'
      formatted += r.passageWithBlank + '\n\n'
      
      // 보기 (①~⑤ 형식)
      r.options.forEach((option, idx) => {
        const number = ['①', '②', '③', '④', '⑤'][idx]
        formatted += `${number} ${option}\n`
      })
      
      formatted += '\n'
      const correctAnswerSymbol = ['①', '②', '③', '④', '⑤'][r.correctAnswer - 1]
      formatted += `정답: ${correctAnswerSymbol}\n`
      formatted += `해설: ${r.explanation}\n\n`
      
      return {
        text: formatted,
        summary: r.passageWithBlank,
        source: r.source || `지문 ${index + 1}`
      }
    })

    const allText = formattedResults.map(r => r.text).join('')

    return {
      original: inputText,
      processed: allText,
      summary: allText,
      results: results
    }
  }

  return (
    <div className="csat-cloze-container">
      <div className="csat-cloze-header">
        <h2>빈칸 수능문제 출제기</h2>
        <p>입력 형식: <strong>출처/영어원문/한글해석//</strong> (여러 지문 입력 가능)</p>
      </div>

      <div className="csat-cloze-input-box">
        <label htmlFor="csat-cloze-input">지문 입력</label>
        <textarea
          id="csat-cloze-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="출처/영어원문/한글해석//&#10;출처2/영어원문2/한글해석2//"
          className="csat-cloze-textarea"
        />
      </div>

      {error && (
        <div className="csat-cloze-error">
          오류: {error}
        </div>
      )}

      <div className="csat-cloze-actions">
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

export default CsatClozeInput


