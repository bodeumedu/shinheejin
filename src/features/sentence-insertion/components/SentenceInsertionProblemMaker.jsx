import { useState, useEffect } from 'react'
import './SentenceInsertionProblemMaker.css'

function SentenceInsertionProblemMaker({ preprocessorData }) {
  const [inputText, setInputText] = useState('')
  const [processedPassages, setProcessedPassages] = useState([])
  const [problems, setProblems] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)

  // 전처리 데이터가 있으면 자동으로 로드하고 전처리 실행
  useEffect(() => {
    if (preprocessorData && preprocessorData.processed) {
      const processedText = preprocessorData.processed
      setInputText(processedText)
      
      // 자동으로 전처리 실행
      setIsProcessing(true)
      
      try {
        const passages = splitPassages(processedText)
        const processed = passages.map(passage => {
          const markedSentences = findMarkedSentences(passage.content)
          return {
            ...passage,
            markedSentences,
            contentWithoutMarks: passage.content.replace(/\/\/\//g, '').trim()
          }
        })

        setProcessedPassages(processed)
      } catch (error) {
        console.error('전처리 오류:', error)
        alert('전처리 중 오류가 발생했습니다.')
      } finally {
        setIsProcessing(false)
      }
    }
  }, [preprocessorData])

  // 지문 나누기: "출처/영어지문/한글해석//" 구조
  const splitPassages = (text) => {
    const passages = []
    
    // "//"로 지문 구분
    const passageBlocks = text.split(/\n\/\/\s*\n?/).filter(block => block.trim())
    
    for (const block of passageBlocks) {
      const parts = block.split(/\n\/\s*\n?/).filter(part => part.trim())
      
      if (parts.length >= 2) {
        const source = parts[0].trim() // 출처
        const englishText = parts[1].trim() // 영어 지문
        const koreanText = parts.length > 2 ? parts[2].trim() : '' // 한글 해석 (선택)
        
        // 영어 지문에 /// 표시가 있는 경우만 처리
        if (englishText.includes('///')) {
          passages.push({
            title: source, // 출처를 제목으로
            content: englishText, // 영어 지문만 사용
            koreanText: koreanText // 한글 해석은 별도 저장
          })
        }
      }
    }

    console.log('splitPassages 결과:', passages.length, '개 지문')
    passages.forEach((p, idx) => {
      console.log(`지문 ${idx}: 출처="${p.title}", 영어지문 길이=${p.content.length}, /// 포함=${p.content.includes('///')}`)
    })
    return passages
  }

  // /// 표시된 문장 찾기 (문장 머리에 ///가 있는 문장만)
  const findMarkedSentences = (text) => {
    const sentences = []
    console.log('findMarkedSentences 호출, 텍스트:', text.substring(0, 100))
    
    // 문장을 나누기
    const allSentences = splitIntoSentences(text)
    
    // 각 문장을 확인하여 ///로 시작하는 문장 찾기
    for (const sentence of allSentences) {
      const trimmed = sentence.trim()
      if (trimmed.startsWith('///')) {
        // /// 제거하고 문장만 추출
        const sentenceText = trimmed.replace(/^\/\/\//, '').trim()
        if (sentenceText) {
          sentences.push({
            text: sentenceText,
            fullMatch: `///${sentenceText}`
          })
          console.log('표시된 문장 찾음 (///로 시작):', sentenceText.substring(0, 50))
        }
      }
    }

    console.log('총 표시된 문장 개수:', sentences.length)
    return sentences
  }

  // 문장을 나누기
  const splitIntoSentences = (text) => {
    // 문장 끝 패턴: . ! ? 뒤에 공백이나 줄바꿈
    const sentenceEndRegex = /[.!?]\s+/g
    const sentences = []
    let lastIndex = 0
    let match

    while ((match = sentenceEndRegex.exec(text)) !== null) {
      const sentenceEnd = match.index + 1
      const sentence = text.substring(lastIndex, sentenceEnd + match[0].length - 1)
      if (sentence.trim()) {
        sentences.push(sentence.trim())
      }
      lastIndex = match.index + match[0].length
    }

    // 마지막 문장 처리
    if (lastIndex < text.length) {
      const remaining = text.substring(lastIndex).trim()
      if (remaining) {
        sentences.push(remaining)
      }
    }

    return sentences
  }

  // 문장삽입 보기 생성 (수능형: 정답 1개 + 오답 4개 = 총 5개)
  const generateChoices = (passageText, targetSentence) => {
    const sentences = splitIntoSentences(passageText)
    const choices = []
    
    // 정답 위치 찾기 (targetSentence가 들어갈 위치)
    let correctPosition = -1
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].includes(targetSentence) || targetSentence.includes(sentences[i])) {
        correctPosition = i
        break
      }
    }

    // 보기 생성: 정답 1개 + 오답 4개
    if (correctPosition >= 0) {
      // 정답: targetSentence
      choices.push({
        text: targetSentence,
        isCorrect: true,
        position: correctPosition
      })

      // 오답 생성: 다른 문장들 중에서 선택 (4개 필요)
      const wrongAnswers = sentences.filter((s, i) => i !== correctPosition && s.length > 20)
      for (let i = 0; i < Math.min(4, wrongAnswers.length); i++) {
        choices.push({
          text: wrongAnswers[i],
          isCorrect: false,
          position: -1
        })
      }
    } else {
      // 정답 위치를 찾지 못한 경우
      choices.push({
        text: targetSentence,
        isCorrect: true,
        position: 0
      })
      
      // 오답은 지문의 다른 문장들 사용 (4개 필요)
      const wrongAnswers = sentences.filter(s => s.length > 20 && !s.includes(targetSentence))
      for (let i = 0; i < Math.min(4, wrongAnswers.length); i++) {
        choices.push({
          text: wrongAnswers[i],
          isCorrect: false,
          position: -1
        })
      }
    }

    // 보기 섞기
    const shuffled = [...choices]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return shuffled
  }

  // 지문에 위치 번호 삽입 (수능형: ① ② ③ ④ ⑤)
  // targetSentence는 정답 문장, originalCorrectIndex는 원본 지문에서의 정답 문장 인덱스
  const insertPositionNumbers = (passageText, targetSentence, originalCorrectIndex) => {
    const sentences = splitIntoSentences(passageText)
    const positionNumbers = ['①', '②', '③', '④', '⑤']
    
    // 원본에서의 정답 위치를 문장 제거 후 지문에서의 위치로 변환
    // 보기 번호는 문장 뒤에 삽입되므로, 원본 인덱스가 3이면 인덱스 2 문장 뒤에 번호가 붙어야 함
    // (인덱스 2와 3 사이에 삽입되어야 하므로)
    let correctPosition = originalCorrectIndex - 1
    if (correctPosition < 0) {
      correctPosition = 0
    }
    if (correctPosition >= sentences.length) {
      correctPosition = sentences.length - 1
    }

    // 지문에 위치 번호 삽입
    let result = passageText
    const positions = []
    
    // 5개 위치 선택 (정답 위치 포함, 첫 문장부터 시작)
    if (correctPosition >= 0 && correctPosition < sentences.length) {
      // 정답 위치 포함하여 5개 위치 선택
      // 첫 문장부터 시작하여 정답 위치 주변에서 선택
      const allPositions = []
      for (let i = 0; i < sentences.length; i++) {
        allPositions.push(i)
      }
      
      // 정답 위치를 중심으로 앞뒤에서 선택
      positions.push(correctPosition)
      
      // 정답 앞에서 선택 (최대 2개)
      const beforePositions = []
      for (let i = correctPosition - 1; i >= 0 && beforePositions.length < 2; i--) {
        beforePositions.push(i)
      }
      beforePositions.reverse() // 순서대로 정렬
      
      // 정답 뒤에서 선택 (최대 2개)
      const afterPositions = []
      for (let i = correctPosition + 1; i < sentences.length && afterPositions.length < 2; i++) {
        afterPositions.push(i)
      }
      
      // 앞뒤 위치 합치기
      const selected = [...beforePositions, ...afterPositions]
      
      // 부족하면 나머지 위치에서 채우기
      while (positions.length + selected.length < 5 && allPositions.length > positions.length + selected.length) {
        for (let i = 0; i < allPositions.length; i++) {
          const pos = allPositions[i]
          if (!positions.includes(pos) && !selected.includes(pos)) {
            selected.push(pos)
            break
          }
        }
      }
      
      // 정답 위치와 선택된 위치 합치기
      positions.push(...selected.slice(0, 4))
      positions.sort((a, b) => a - b) // 위치 순서대로 정렬
      
      // 첫 문장이 포함되지 않았으면 첫 문장 추가
      if (positions[0] !== 0 && positions.length < 5) {
        positions.unshift(0)
        positions.sort((a, b) => a - b)
        positions.pop() // 5개 유지
      }
    } else {
      // 정답 위치를 찾지 못한 경우, 처음 5개 위치 사용
      for (let i = 0; i < Math.min(5, sentences.length); i++) {
        positions.push(i)
      }
    }

    // 각 위치에 번호 삽입 (역순으로 삽입하여 인덱스 오류 방지)
    // positions는 이미 오름차순으로 정렬되어 있음
    const positionToNumber = {} // 위치 인덱스 -> 번호 매핑
    // 문장 순서대로 ①, ②, ③, ④, ⑤ 할당
    for (let i = 0; i < positions.length && i < 5; i++) {
      const pos = positions[i]
      positionToNumber[pos] = positionNumbers[i]
    }
    
    // 역순으로 삽입하여 인덱스 오류 방지
    const sortedPositions = [...positions].sort((a, b) => b - a)
    for (let i = sortedPositions.length - 1; i >= 0; i--) {
      const pos = sortedPositions[i]
      const sentence = sentences[pos]
      if (sentence) {
        // 문장 끝에 번호 삽입 (정확한 매칭을 위해)
        const escapedSentence = sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`(${escapedSentence})(?=\\s|$)`, 'g')
        const number = positionToNumber[pos]
        result = result.replace(regex, `$1 ( ${number} )`)
      }
    }

    // 정답 번호 찾기: correctPosition에 해당하는 번호
    const correctNumber = positionToNumber[correctPosition] || positionNumbers[0]
    
    console.log('원본 인덱스:', originalCorrectIndex)
    console.log('보기 번호 삽입 위치 (correctPosition):', correctPosition)
    console.log('선택된 위치들:', positions)
    console.log('위치 매핑:', positionToNumber)
    console.log('정답 번호:', correctNumber)

    return { passage: result, correctNumber }
  }

  // 전처리 실행
  const handlePreprocess = () => {
    if (!inputText.trim()) {
      alert('지문을 입력해주세요.')
      return
    }

    setIsProcessing(true)
    
    try {
      const passages = splitPassages(inputText)
      console.log('splitPassages 결과:', passages)
      
      const processed = passages.map((passage, idx) => {
        console.log(`지문 ${idx} 처리:`, passage.title, 'content 길이:', passage.content.length)
        const markedSentences = findMarkedSentences(passage.content)
        console.log(`지문 ${idx} 표시된 문장:`, markedSentences.length, '개')
        
        const result = {
          ...passage,
          markedSentences,
          contentWithoutMarks: passage.content.replace(/\/\/\//g, '').trim()
        }
        console.log(`지문 ${idx} 결과:`, result)
        return result
      })

      console.log('전처리 완료, processed:', processed)
      setProcessedPassages(processed)
      
      const totalMarked = processed.reduce((sum, p) => sum + p.markedSentences.length, 0)
      alert(`전처리 완료: ${processed.length}개의 지문을 찾았습니다. (표시된 문장: ${totalMarked}개)`)
    } catch (error) {
      console.error('전처리 오류:', error)
      alert('전처리 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  // 문제 생성
  const handleGenerateProblems = () => {
    if (processedPassages.length === 0) {
      alert('먼저 전처리를 실행해주세요.')
      return
    }

    console.log('문제 생성 시작, processedPassages:', processedPassages)
    setIsProcessing(true)

    try {
      const generatedProblems = []
      let problemNumber = 1

      for (const passage of processedPassages) {
        console.log('지문 처리:', passage.title, 'markedSentences:', passage.markedSentences.length)
        if (passage.markedSentences.length === 0) {
          console.log('표시된 문장이 없어서 건너뜀')
          continue
        }

        // ///가 여러 개면 각각 문제 생성
        for (const markedSentence of passage.markedSentences) {
          console.log('표시된 문장 처리:', markedSentence.text)
          
          // 원문에서 해당 문장 제거 (/// 표시 포함)
          // 원본 지문에서 /// 위치 찾기
          const originalContent = passage.content
          let passageWithoutSentence = passage.contentWithoutMarks
          
          // 원본에서 ///로 시작하는 문장 찾기 및 정답 위치 계산
          const originalSentences = splitIntoSentences(originalContent)
          let sentenceIndexInOriginal = -1
          
          for (let i = 0; i < originalSentences.length; i++) {
            const sentence = originalSentences[i].trim()
            // ///로 시작하는 문장인지 확인
            if (sentence.startsWith('///')) {
              const sentenceWithoutMark = sentence.replace(/^\/\/\//, '').trim()
              // 표시된 문장과 일치하는지 확인
              if (sentenceWithoutMark === markedSentence.text.trim() || 
                  sentenceWithoutMark.includes(markedSentence.text.trim()) ||
                  markedSentence.text.trim().includes(sentenceWithoutMark)) {
                // 원본에서의 문장 인덱스 저장 (이게 정답 위치)
                sentenceIndexInOriginal = i
                // contentWithoutMarks에서 해당 문장 제거
                const escapedSentence = sentenceWithoutMark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const regex = new RegExp(`\\s*${escapedSentence}\\s*`, 'g')
                passageWithoutSentence = passageWithoutSentence.replace(regex, ' ').replace(/\s+/g, ' ').trim()
                break
              }
            }
          }
          
          console.log('원본에서의 문장 인덱스:', sentenceIndexInOriginal)
          console.log('문장 제거 후 지문:', passageWithoutSentence.substring(0, 100))

          // 지문에 위치 번호 삽입 (수능형: ① ② ③ ④ ⑤)
          // 원본에서의 문장 인덱스를 정답 위치로 전달
          const result = insertPositionNumbers(passageWithoutSentence, markedSentence.text, sentenceIndexInOriginal)
          const passageWithNumbers = result.passage
          const correctAnswerNumber = result.correctNumber
          
          console.log('위치 번호 삽입 완료, 정답:', correctAnswerNumber)
          
          // 위치 번호 배열 추출 (보기용)
          const positionNumbers = ['①', '②', '③', '④', '⑤']
          const positions = []
          const matches = passageWithNumbers.match(/\( (①|②|③|④|⑤) \)/g)
          if (matches) {
            matches.forEach(match => {
              const num = match.match(/(①|②|③|④|⑤)/)[0]
              if (!positions.includes(num)) {
                positions.push(num)
              }
            })
          }
          // 5개가 안 되면 채우기
          while (positions.length < 5) {
            for (const num of positionNumbers) {
              if (!positions.includes(num)) {
                positions.push(num)
                break
              }
            }
          }

          console.log('생성된 문제:', {
            title: passage.title,
            targetSentence: markedSentence.text,
            correctAnswerNumber,
            positions: positions.slice(0, 5)
          })

          generatedProblems.push({
            title: passage.title,
            passage: passageWithNumbers,
            correctAnswerNumber: correctAnswerNumber,
            targetSentence: markedSentence.text,
            problemNumber: problemNumber++,
            positions: positions.slice(0, 5) // 최대 5개
          })
        }
      }

      console.log('생성된 문제 개수:', generatedProblems.length)
      setProblems(generatedProblems)
      if (generatedProblems.length > 0) {
        alert(`문제 생성 완료: ${generatedProblems.length}개의 문제를 생성했습니다.`)
      } else {
        alert('생성된 문제가 없습니다. /// 표시가 있는 문장이 있는지 확인해주세요.')
      }
    } catch (error) {
      console.error('문제 생성 오류:', error)
      console.error('오류 스택:', error.stack)
      alert(`문제 생성 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // HWP 다운로드 (일단 HTML로 생성)
  const handleDownloadHWP = () => {
    if (problems.length === 0) {
      alert('생성된 문제가 없습니다.')
      return
    }

    try {
      let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>문장삽입 문제</title>
  <style>
    body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; padding: 40px; line-height: 1.8; }
    .problem { margin-bottom: 40px; page-break-after: always; }
    .title { font-size: 18px; font-weight: bold; margin-bottom: 20px; }
    .sentence-box { 
      border: 2px solid #333; 
      padding: 15px; 
      margin: 20px 0; 
      background: #f9f9f9; 
      font-weight: 500;
      line-height: 1.8;
    }
    .passage { margin-bottom: 20px; line-height: 2; }
    .question-text {
      margin: 20px 0 15px 0;
      font-weight: 600;
      font-size: 1.1rem;
      color: #2c3e50;
    }
    .choices { margin-left: 20px; }
    .choice { margin-bottom: 10px; }
    .choice-number { font-weight: bold; margin-right: 10px; }
    .correct { color: red; font-weight: bold; }
  </style>
</head>
<body>
`

      problems.forEach((problem, index) => {
        htmlContent += `
  <div class="problem">
    <div class="title">□ 다음 글을 읽고 물음에 답하시오. (${problem.problemNumber || index + 1})</div>
    <div class="sentence-box">
      ${problem.targetSentence}
    </div>
    <div class="passage">${problem.passage}</div>
    <div class="question-text">글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?</div>
    <div class="choices">
`
        // 보기는 위치 번호로 표시 (① ② ③ ④ ⑤)
        if (problem.positions && problem.positions.length > 0) {
          problem.positions.forEach((pos, idx) => {
            const isCorrect = pos === problem.correctAnswerNumber
            htmlContent += `      <div class="choice ${isCorrect ? 'correct' : ''}">
        <span class="choice-number">${idx + 1}.</span> ${pos}
      </div>
`
          })
        }
        htmlContent += `    </div>
    <div style="margin-top: 20px; color: #666;">정답: ${problem.correctAnswerNumber}</div>
  </div>
`
      })

      htmlContent += `
</body>
</html>
`

      // HTML 파일 다운로드
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = '문장삽입_문제.html'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      alert('HTML 파일로 다운로드되었습니다. 한글 프로그램에서 열어 HWP로 저장할 수 있습니다.')
    } catch (error) {
      console.error('다운로드 오류:', error)
      alert('다운로드 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="sentence-insertion-container">
      <div className="sentence-insertion-header">
        <h1>수능 영어 문장삽입 문제 생성기</h1>
        <p>지문에 /// 표시를 넣어 문장삽입 문제를 자동으로 생성합니다.</p>
      </div>

      <div className="sentence-insertion-main">
        {/* 전처리 결과 */}
        {processedPassages.length > 0 ? (
          <div className="sentence-insertion-section">
            <h2>전처리 결과</h2>
            <div className="processed-passages">
              {processedPassages.map((passage, index) => (
                <div key={index} className="passage-item">
                  <h3><strong>{passage.title || `지문 ${index + 1}`}</strong></h3>
                  <p className="passage-content">{passage.contentWithoutMarks}</p>
                  {passage.markedSentences.length > 0 && (
                    <div className="marked-sentences">
                      <strong>표시된 문장 ({passage.markedSentences.length}개):</strong>
                      {passage.markedSentences.map((s, i) => (
                        <div key={i} className="marked-sentence">• {s.text}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="sentence-insertion-buttons">
              <button 
                className="sentence-insertion-btn primary"
                onClick={handleGenerateProblems}
                disabled={isProcessing}
              >
                {isProcessing ? '생성 중...' : '문제 생성'}
              </button>
            </div>
          </div>
        ) : (
          <div className="sentence-insertion-section">
            <h2>전처리 결과 대기 중</h2>
            <p>전처리 결과가 로드되면 자동으로 표시됩니다.</p>
          </div>
        )}

        {/* 생성된 문제 */}
        {problems.length > 0 && (
          <div className="sentence-insertion-section">
            <h2>생성된 문제 ({problems.length}개)</h2>
            <div className="problems-list">
              {problems.map((problem, index) => {
                return (
                  <div key={index} className="problem-item">
                    <h3>□ 다음 글을 읽고 물음에 답하시오. ({problem.problemNumber || index + 1})</h3>
                    <div className="problem-sentence-box">
                      {problem.targetSentence}
                    </div>
                    <div className="problem-passage">{problem.passage}</div>
                    <div className="problem-question-text">
                      글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?
                    </div>
                    <div className="problem-choices">
                      {problem.positions && problem.positions.map((pos, posIndex) => {
                        const isCorrect = pos === problem.correctAnswerNumber
                        return (
                          <div 
                            key={posIndex} 
                            className={`problem-choice ${isCorrect ? 'correct' : ''}`}
                          >
                            <span className="choice-number">{posIndex + 1}.</span> {pos}
                            {isCorrect && <span className="correct-badge">정답</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="sentence-insertion-buttons">
              <button 
                className="sentence-insertion-btn success"
                onClick={handleDownloadHWP}
              >
                HWP 다운로드 (HTML 형식)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SentenceInsertionProblemMaker

