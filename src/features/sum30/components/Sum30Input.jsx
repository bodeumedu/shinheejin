import { useState } from 'react'
import './Sum30Input.css'
import { summarizeText } from '../utils/sum30Analyzer'

function Sum30Input({ text, setText, onProcess, apiKey }) {
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
    const summaries = []

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
        // 영어원문 summary 생성 (30단어)
        const summary = await summarizeText(englishText, apiKey)
        
        // 요약문을 두 단어씩 묶어서 처리
        const words = summary.split(/\s+/).filter(w => w.length > 0)
        const wordPairs = []
        
        // 두 단어씩 묶기
        for (let j = 0; j < words.length; j += 2) {
          if (j + 1 < words.length) {
            wordPairs.push(words[j] + ' ' + words[j + 1])
          } else {
            // 홀수 개인 경우 마지막 단어만
            wordPairs.push(words[j])
          }
        }
        
        // 두 단어씩 묶인 것들을 셔플
        const shuffledPairs = [...wordPairs].sort(() => Math.random() - 0.5)
        
        results.push({
          source: source.trim(),
          original: englishText,
          summary: summary,
          wordPairs: wordPairs, // 원본 순서
          shuffledPairs: shuffledPairs, // 셔플된 순서
          koreanTranslation
        })
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 중 오류:`, error)
        results.push({
          source: source.trim(),
          original: englishText,
          summary: `[오류: ${error.message}]`,
          koreanTranslation,
          error: error.message
        })
      }
    }

    // 처리된 텍스트: 각 지문의 영어원문 + ▶ summary 형식
    const processedText = results
      .filter(r => !r.error)
      .map((r, index) => {
        const sourceLabel = r.source || `지문 ${index + 1}`
        return `${sourceLabel}\n${r.original}\n▶ ${r.summary}`
      })
      .join('\n\n')
    
    // 문제 형식으로 포맷팅 (SUM15와 유사)
    const formattedResults = results.map((r, index) => {
      if (r.error) {
        return {
          text: r.source + '\n' + r.original + '\n\n[오류: ' + r.error + ']\n\n\n\n\n\n\n\n\n',
          summary: null
        }
      }
      
      let formatted = r.source || `지문 ${index + 1}`
      formatted += '\n' // 출처 다음 줄바꿈
      formatted += r.original + '\n' // 영어원문 + 줄바꿈 1줄
      formatted += '___________________________.\n\n' // 빈칸 문장 + 줄바꿈 2번
      // 보기: 셔플된 두 단어 쌍들
      formatted += '<보기>\n' + (r.shuffledPairs ? r.shuffledPairs.join(' / ') : '') + '\n\n' // 보기 + 줄바꿈 2번
      formatted += '<조건>\n<보기>에 주어진 단어 쌍들을 모두 한번씩 사용하여 빈칸을 채우시오.\n\n\n\n\n' // 조건 + 줄바꿈 5번
      
      return {
        text: formatted,
        summary: r.summary,
        source: r.source || `지문 ${index + 1}`
      }
    })

    // 문제 텍스트 결합
    const questionText = formattedResults.map(r => r.text).join('')
    
    // 답지 부분 (출처와 AI 요약문만)
    const answerSheet = results
      .filter(r => !r.error)
      .map((r, index) => {
        return (r.source || `지문 ${index + 1}`) + '\n' + r.summary
      })
      .join('\n\n')

    return {
      original: inputText,
      processed: processedText,
      summary: questionText, // 문제 부분
      answerSheet: answerSheet, // 답지 부분
      questionParts: formattedResults, // 문제 부분 상세 정보
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
    <div className="sum30-input-container">
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

export default Sum30Input

