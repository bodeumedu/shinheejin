import { useState } from 'react'
import './ReferenceDescriptionInput.css'
import { generateReferenceDescription, formatReferenceDescriptionAsText } from '../utils/referenceDescriptionAnalyzer'

function ReferenceDescriptionInput({ text, setText, onProcess, apiKey }) {
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
        // 지칭서술형 문제 생성
        const result = await generateReferenceDescription(englishText, apiKey)
        
        const passage = result.passageWithUnderlines || ''
        const hasUnderline = passage.includes('<u>')
        const blockCount = Array.isArray(result.blocks) ? result.blocks.length : 0
        const hasAnalysis = blockCount > 0

        results.push({
          index: i,
          source: source.trim(),
          original: englishText.trim(),
          koreanTranslation: koreanTranslation.trim(),
          passageWithUnderlines: passage,
          blocks: result.blocks || [],
          answerSummary: result.answerSummary || '',
          hasUnderline,
          hasAnalysis,
          needsManualCheck: !hasUnderline || !hasAnalysis
        })
      } catch (error) {
        console.error(`지문 ${i + 1} 처리 오류:`, error)
        results.push({
          index: i,
          source: source.trim(),
          original: englishText.trim(),
          koreanTranslation: koreanTranslation.trim(),
          error: error.message || '처리 중 오류가 발생했습니다.'
        })
      }
    }

    return results
  }

  const handleProcess = async () => {
    if (!text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }

    if (!apiKey) {
      setError('API 키가 설정되지 않았습니다.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const results = await processAllTexts(text, apiKey)
      
      // 결과를 처리된 텍스트 형식으로 변환
      let processedText = ''
      
      for (const result of results) {
        if (result.error) {
          processedText += `[오류] ${result.error}\n\n`
          continue
        }

        const hasUnderline = result.passageWithUnderlines && result.passageWithUnderlines.includes('<u>')
        const hasAnalysis = Array.isArray(result.blocks) && result.blocks.length > 0
        const needsCheck = !hasUnderline || !hasAnalysis

        const errorClass = needsCheck ? ' class="reference-description-error"' : ''

        if (needsCheck) {
          const warnings = []
          if (!hasUnderline) warnings.push('밑줄 없음')
          if (!hasAnalysis) warnings.push('해설 블록 없음')
          processedText += `<span${errorClass}>[⚠️ 수동 확인 필요: ${warnings.join(', ')}]</span>\n\n`
        }

        processedText += formatReferenceDescriptionAsText({
          passageWithUnderlines: result.passageWithUnderlines,
          blocks: result.blocks
        })
      }

      if (onProcess) {
        onProcess(results, processedText)
      }
    } catch (err) {
      console.error('처리 오류:', err)
      setError(err.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="reference-description-input">
      <div className="input-header">
        <h2>지칭서술형(지문 안에서,어형변화무)</h2>
        <p className="input-description">
          지문 전체에 독해 시 꼭 체크해야 할 가리키는 표현(대명사, 지시어, such+명사, the+추상명사 등)을 &lt;u&gt;로 표시하고, 각 표현마다 한·영 해설 블록을 생성합니다. (첫 소개용 <strong>a/an + 명사</strong>는 밑줄 대상에서 제외)
        </p>
      </div>

      <div className="input-container">
        <label htmlFor="text-input">지문 입력 (출처/영어원문/한글해석//)</label>
        <textarea
          id="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="출처/영어원문/한글해석//&#10;출처/영어원문/한글해석//"
          rows={15}
          disabled={isLoading}
        />
        <div className="input-hint">
          💡 여러 지문을 입력하려면 // 로 구분하세요.
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="button-container">
        <button
          onClick={handleProcess}
          disabled={isLoading || !text.trim() || !apiKey}
          className="process-button"
        >
          {isLoading ? '처리 중...' : '처리 실행'}
        </button>
      </div>

      {isLoading && (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>AI가 가리키는 표식(&lt;u&gt;)과 해설을 만들고 있습니다...</p>
        </div>
      )}
    </div>
  )
}

export default ReferenceDescriptionInput

