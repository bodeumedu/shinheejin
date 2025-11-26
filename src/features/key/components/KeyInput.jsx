import { useState } from 'react'
import { generateKeyQuestion, generateKeyExplanation } from '../utils/keyAnalyzer'
import './KeyInput.css'

function KeyInput({ text, setText, onProcess, apiKey }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)

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
        // 출처/영어원문/한글해석 형식 - 한글해석 제거
        source = parts[0]
        englishText = parts[1] // 영어원문만 (한글해석 제외)
      } else if (parts.length >= 2) {
        // 출처/영어원문 형식
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
        // 한글이 포함된 라인에서 영어 부분만 추출
        const koreanMatch = line.match(/[가-힣]+/)
        if (koreanMatch) {
          // 한글 부분 이전의 영어만 반환
          const englishPart = line.substring(0, koreanMatch.index).trim()
          return englishPart
        }
        return line.trim()
      }).filter(line => {
        // 빈 라인 제거
        if (!line || line.length === 0) return false
        
        // 영어 문자가 있는 라인만 유지 (최소 3자 이상의 영어)
        const englishChars = (line.match(/[a-zA-Z]/g) || []).length
        return englishChars >= 3
      })
      
      englishText = englishLines.join('\n').trim()
      
      // 영어원문이 비어있는지 확인 (최소 10자 이상의 영어 문자가 있어야 함)
      const englishCharCount = (englishText.match(/[a-zA-Z]/g) || []).length
      if (!englishText || englishText.length === 0 || englishCharCount < 10) {
        console.error('영어원문 추출 실패:', {
          originalBlock: block,
          parts: parts,
          extractedEnglish: englishText,
          englishCharCount: englishCharCount
        })
        throw new Error('영어원문이 없거나 한글해석만 입력되었습니다.')
      }

      try {
        // 1단계: AI가 보기 5개와 정답 내용 생성
        const questionData = await generateKeyQuestion(englishText, apiKey)
        
        // 2단계: 보기를 완전히 랜덤하게 섞기 (Fisher-Yates shuffle)
        const shuffledOptions = [...questionData.options]
        const correctAnswerText = shuffledOptions[questionData.correctAnswerIndex]
        
        // Fisher-Yates shuffle 알고리즘
        for (let i = shuffledOptions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]]
        }
        
        // 3단계: 섞인 보기에서 정답 위치 찾기
        const shuffledCorrectAnswerIndex = shuffledOptions.findIndex(opt => opt === correctAnswerText)
        const shuffledCorrectAnswerNumber = shuffledCorrectAnswerIndex + 1 // 1~5
        
        // 4단계: 섞인 보기 순서를 기준으로 해설 생성
        const explanation = await generateKeyExplanation(
          shuffledOptions,
          shuffledCorrectAnswerNumber,
          englishText,
          apiKey
        )
        
        results.push({
          source: source.trim(),
          original: englishText.trim(),
          instruction: questionData.instruction,
          options: shuffledOptions,
          correctAnswer: shuffledCorrectAnswerNumber,
          explanation: explanation
        })
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 중 오류:`, error)
        results.push({
          source: source.trim(),
          original: englishText.trim(),
          instruction: '[오류]',
          options: [],
          correctAnswer: 0,
          explanation: `[오류: ${error.message}]`,
          error: error.message
        })
      }
    }

    // 최종 검증 및 정리 함수
    const validateAndCleanResult = (result) => {
      const numberSymbols = ['①', '②', '③', '④', '⑤']
      let explanation = result.explanation
      let correctAnswerSymbol = numberSymbols[result.correctAnswer - 1]
      
      // 1. 해설에서 일반 숫자(1,2,3,4,5)를 원문자(①~⑤)로 변환
      // 패턴 매칭을 우선적으로 처리
      explanation = explanation.replace(/정답은 (\d+)번/g, (match, num) => {
        const n = parseInt(num)
        if (n >= 1 && n <= 5) {
          return `정답은 ${numberSymbols[n - 1]}번`
        }
        return match
      })
      explanation = explanation.replace(/정답 (\d+)번/g, (match, num) => {
        const n = parseInt(num)
        if (n >= 1 && n <= 5) {
          return `정답 ${numberSymbols[n - 1]}번`
        }
        return match
      })
      explanation = explanation.replace(/(\d+)번이 정답/g, (match, num) => {
        const n = parseInt(num)
        if (n >= 1 && n <= 5) {
          return `${numberSymbols[n - 1]}번이 정답`
        }
        return match
      })
      explanation = explanation.replace(/(\d+)번/g, (match, num) => {
        const n = parseInt(num)
        if (n >= 1 && n <= 5) {
          return `${numberSymbols[n - 1]}번`
        }
        return match
      })
      // 문맥상 보기 번호로 보이는 경우만 변환 (앞뒤로 특정 키워드가 있는 경우)
      explanation = explanation.replace(/([①②③④⑤]|보기|선택지|옵션|번)\s*([1-5])\s*(번|이|가|은|는|를|을|에|의)/g, (match, prefix, num, suffix) => {
        const n = parseInt(num)
        return `${prefix || ''}${numberSymbols[n - 1]}${suffix}`
      })
      explanation = explanation.replace(/([①②③④⑤]|보기|선택지|옵션|번)\s*([1-5])/g, (match, prefix, num) => {
        const n = parseInt(num)
        return `${prefix || ''}${numberSymbols[n - 1]}`
      })
      
      // 2. 해설에서 각 보기(①~⑤)가 언급되는지 확인하고 매칭 검증
      const mentionedOptions = []
      numberSymbols.forEach((symbol, idx) => {
        if (explanation.includes(symbol)) {
          mentionedOptions.push(idx + 1)
        }
      })
      
      // 정답이 해설에 언급되어 있는지 확인
      if (!explanation.includes(correctAnswerSymbol)) {
        console.warn(`정답 ${correctAnswerSymbol}이 해설에 언급되지 않음. 해설을 업데이트합니다.`)
        // 해설 끝에 정답 정보 추가
        if (!explanation.includes('정답은') && !explanation.includes('정답')) {
          explanation = `정답은 ${correctAnswerSymbol}번입니다. ${explanation}`
        } else {
          // 기존 정답 언급 부분을 업데이트
          explanation = explanation.replace(/정답은\s*[①②③④⑤]번/g, `정답은 ${correctAnswerSymbol}번`)
          explanation = explanation.replace(/정답\s*[①②③④⑤]번/g, `정답 ${correctAnswerSymbol}번`)
        }
      }
      
      // 각 보기가 해설에서 올바르게 언급되는지 확인
      result.options.forEach((option, idx) => {
        const optionSymbol = numberSymbols[idx]
        const optionNum = idx + 1
        
        // 해설에서 이 보기를 언급하는지 확인
        if (explanation.includes(optionSymbol)) {
          // 보기 내용의 주요 키워드를 추출하여 해설과 매칭 확인
          const optionKeywords = option
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3 && !['the', 'and', 'of', 'in', 'to', 'for', 'with'].includes(w))
            .slice(0, 3) // 상위 3개 키워드만 사용
          
          if (optionKeywords.length > 0) {
            // 해설에서 이 보기 주변 텍스트를 찾아 키워드 매칭 확인
            const symbolIndex = explanation.indexOf(optionSymbol)
            if (symbolIndex !== -1) {
              // 보기 번호 주변 100자 내에서 키워드 검색
              const contextStart = Math.max(0, symbolIndex - 50)
              const contextEnd = Math.min(explanation.length, symbolIndex + 150)
              const context = explanation.substring(contextStart, contextEnd).toLowerCase()
              
              const hasKeyword = optionKeywords.some(keyword => context.includes(keyword))
              if (!hasKeyword) {
                console.warn(`보기 ${optionSymbol}이 해설에 언급되었으나 내용 매칭이 명확하지 않음. 보기: "${option}"`)
              }
            }
          }
        }
      })
      
      // 최종 검증: 정답이 해설에 확실히 언급되어 있는지 재확인
      if (!explanation.includes(correctAnswerSymbol)) {
        // 맨 앞에 정답 정보 추가
        explanation = `정답은 ${correctAnswerSymbol}번입니다. ${explanation}`
      }
      
      return {
        ...result,
        explanation: explanation,
        correctAnswerSymbol: correctAnswerSymbol
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
      
      // 최종 검증 및 정리
      const validatedResult = validateAndCleanResult(r)
      
      let formatted = validatedResult.source || `지문 ${index + 1}`
      formatted += '\n\n' // 출처 다음 줄바꿈 2번 (한 줄 띄기)
      formatted += validatedResult.original + '\n\n' // 영어원문 + 줄바꿈 2번 (한 줄 띄기)
      formatted += validatedResult.instruction + '\n' // 지시문 + 줄바꿈
      
      // 보기 (①~⑤ 형식)
      validatedResult.options.forEach((option, idx) => {
        const number = ['①', '②', '③', '④', '⑤'][idx]
        formatted += `${number} ${option}\n`
      })
      
      formatted += '\n' // 보기 다음 줄바꿈
      formatted += `정답: ${validatedResult.correctAnswerSymbol}\n` // 정답 (①~⑤ 형식)
      
      // 해설에서 최종적으로 일반 숫자를 원문자로 변환
      let finalExplanation = validatedResult.explanation
      const numberSymbols = ['①', '②', '③', '④', '⑤']
      // 정답/해설 부분에서 남아있는 일반 숫자 변환
      finalExplanation = finalExplanation.replace(/정답[:\s]*(\d+)/g, (match, num) => {
        const n = parseInt(num)
        if (n >= 1 && n <= 5) {
          return `정답: ${numberSymbols[n - 1]}`
        }
        return match
      })
      finalExplanation = finalExplanation.replace(/(\d+)번/g, (match, num) => {
        const n = parseInt(num)
        if (n >= 1 && n <= 5) {
          return `${numberSymbols[n - 1]}번`
        }
        return match
      })
      
      formatted += `해설: ${finalExplanation}\n\n` // 해설 + 줄바꿈 2번
      
      return {
        text: formatted,
        summary: validatedResult.instruction,
        source: validatedResult.source || `지문 ${index + 1}`
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
    <div className="key-input-container">
      <div className="key-input-header">
        <h2>KEY - 수능 주제 문제 생성</h2>
        <p>영어 지문을 입력하면 수능 스타일의 주제 문제를 생성합니다.</p>
      </div>

      <div className="key-input-box">
        <label htmlFor="key-text-input">지문 입력 (출처/영어원문// 형식으로 구분)</label>
        <textarea
          id="key-text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="출처/영어원문//&#10;출처2/영어원문2//"
          className="key-textarea"
        />
      </div>

      {error && (
        <div className="key-error">
          오류: {error}
        </div>
      )}

      <div className="key-actions">
        <button
          onClick={handleProcess}
          disabled={isProcessing || !text}
          className="btn btn-primary"
        >
          {isProcessing ? '처리 중...' : '처리 실행'}
        </button>
      </div>
    </div>
  )
}

export default KeyInput

