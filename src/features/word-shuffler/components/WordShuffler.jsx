import { useState, useEffect } from 'react'
import './WordShuffler.css'

function WordShuffler() {
  const [inputWords, setInputWords] = useState('')
  const [shuffledWords, setShuffledWords] = useState('')
  const [splitDelimiter, setSplitDelimiter] = useState(' ') // 기본값: 공백
  const [joinDelimiter, setJoinDelimiter] = useState('/') // 기본값: /
  const [tupleLength, setTupleLength] = useState(1) // 기본값: 1 (단어 단위)
  const [removeRepeated, setRemoveRepeated] = useState(false)
  const [removePunctuation, setRemovePunctuation] = useState(false)
  const [punctuationMarks, setPunctuationMarks] = useState('.,?!()"')

  // 파일에서 가져오기
  const handleImportFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          setInputWords(event.target.result)
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  // 파일로 저장
  const handleSaveAs = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // 클립보드에 복사 (수동 복사용 - 알림 표시)
  const handleCopyToClipboard = (text, showAlert = true) => {
    navigator.clipboard.writeText(text).then(() => {
      if (showAlert) {
        alert('클립보드에 복사되었습니다.')
      }
    }).catch(() => {
      if (showAlert) {
        alert('복사에 실패했습니다.')
      }
    })
  }

  // 체인 연결 (shuffled words를 input으로)
  const handleChain = () => {
    setInputWords(shuffledWords)
    setShuffledWords('')
  }

  // 구두점 제거
  const removePunctuationFromText = (text) => {
    if (!removePunctuation) return text
    const marks = punctuationMarks.split('').map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')
    const regex = new RegExp(`[${marks}]`, 'g')
    return text.replace(regex, '')
  }

  // 단어 섞기
  const shuffleArray = (array) => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // 단어 섞기 실행 (자동 실행용)
  const performShuffle = (inputText) => {
    if (!inputText || !inputText.trim()) {
      setShuffledWords('')
      return
    }

    let text = inputText

    // 구두점 제거
    if (removePunctuation) {
      text = removePunctuationFromText(text)
    }

    // 구분자로 분리
    let words
    if (splitDelimiter === '') {
      // 구분자가 없으면 글자 단위로 분리
      words = text.split('').filter(char => char.trim() !== '')
    } else {
      // 구분자로 분리
      const delimiter = splitDelimiter === '\\n' ? '\n' : splitDelimiter
      words = text.split(delimiter).filter(word => word.trim() !== '')
    }

    // 튜플 그룹화
    let groups = []
    if (tupleLength > 1) {
      for (let i = 0; i < words.length; i += tupleLength) {
        const tuple = words.slice(i, i + tupleLength)
        // 남은 단어들도 그대로 그룹으로 추가 (정확히 tupleLength만큼 없어도 포함)
        if (tuple.length > 0) {
          groups.push(tuple.join(splitDelimiter === '' ? '' : (splitDelimiter === '\\n' ? '\n' : splitDelimiter)))
        }
      }
    } else {
      groups = words
    }

    // 중복 제거
    if (removeRepeated) {
      const uniqueGroups = []
      const seen = new Set()
      for (const group of groups) {
        if (!seen.has(group)) {
          seen.add(group)
          uniqueGroups.push(group)
        }
      }
      groups = uniqueGroups
    }

    // 섞기
    const shuffled = shuffleArray(groups)

    // 조인 구분자로 합치기
    const joinDelim = joinDelimiter === '\\n' ? '\n' : joinDelimiter
    const result = shuffled.join(joinDelim)

    setShuffledWords(result)
    
    // 자동으로 클립보드에 복사
    if (result && result.trim()) {
      navigator.clipboard.writeText(result).catch(() => {
        // 복사 실패는 무시 (사용자에게 알리지 않음)
      })
    }
  }

  // 단어 섞기 실행 (버튼 클릭용)
  const handleReshuffle = () => {
    if (!inputWords.trim()) {
      alert('입력 단어를 입력해주세요.')
      return
    }
    performShuffle(inputWords)
  }

  // 입력 변경 시 자동 셔플
  useEffect(() => {
    const timer = setTimeout(() => {
      performShuffle(inputWords)
    }, 300) // 300ms 디바운스

    return () => clearTimeout(timer)
  }, [inputWords, splitDelimiter, joinDelimiter, tupleLength, removeRepeated, removePunctuation, punctuationMarks])

  return (
    <div className="word-shuffler-container">
      <div className="word-shuffler-header">
        <h1>Word Shuffler</h1>
      </div>

      <div className="word-shuffler-main">
        {/* Input Words Section */}
        <div className="word-shuffler-section">
          <div className="word-shuffler-section-header">
            <h2>Input Words</h2>
            <span className="help-icon" title="입력할 단어들을 입력하세요">?</span>
          </div>
          <textarea
            className="word-shuffler-textarea"
            value={inputWords}
            onChange={(e) => setInputWords(e.target.value)}
            placeholder="단어들을 입력하세요..."
          />
          <div className="word-shuffler-buttons">
            <button className="word-shuffler-btn" onClick={handleImportFile}>
              파일에서 가져오기
            </button>
            <button 
              className="word-shuffler-btn" 
              onClick={() => handleSaveAs(inputWords, 'input_words.txt')}
            >
              파일로 저장
            </button>
            <button 
              className="word-shuffler-btn" 
              onClick={() => handleCopyToClipboard(inputWords)}
            >
              클립보드에 복사
            </button>
          </div>
        </div>

        {/* Shuffled Words Section */}
        <div className="word-shuffler-section">
          <div className="word-shuffler-section-header">
            <h2>섞인 단어</h2>
          </div>
          <textarea
            className="word-shuffler-textarea"
            value={shuffledWords}
            onChange={(e) => setShuffledWords(e.target.value)}
            placeholder="섞인 단어들이 여기에 표시됩니다..."
            readOnly={false}
          />
          <div className="word-shuffler-buttons">
            <button 
              className="word-shuffler-btn" 
              onClick={handleChain}
            >
              입력으로 연결
            </button>
            <button 
              className="word-shuffler-btn" 
              onClick={() => handleSaveAs(shuffledWords, 'shuffled_words.txt')}
            >
              파일로 저장
            </button>
            <button 
              className="word-shuffler-btn" 
              onClick={() => handleCopyToClipboard(shuffledWords)}
            >
              클립보드에 복사
            </button>
          </div>
        </div>
      </div>

      {/* Reshuffle Button */}
      <div className="word-shuffler-reshuffle">
        <button 
          className="word-shuffler-btn word-shuffler-btn-primary" 
          onClick={handleReshuffle}
        >
          다시 섞기
        </button>
      </div>

      {/* Tool Options */}
      <div className="word-shuffler-options">
        <h3>옵션 설정</h3>
        <div className="word-shuffler-options-grid">
          {/* Word Delimiters */}
          <div className="word-shuffler-option-column">
            <h4>단어 구분자</h4>
            <div className="word-shuffler-option-item">
              <input
                type="text"
                className="word-shuffler-input"
                value={splitDelimiter}
                onChange={(e) => setSplitDelimiter(e.target.value)}
                placeholder=" "
              />
              <p className="word-shuffler-description">
                입력 데이터를 이 문자로 분리합니다. (비워두면 글자 단위로 섞습니다.)
              </p>
            </div>
            <div className="word-shuffler-option-item">
              <input
                type="text"
                className="word-shuffler-input"
                value={joinDelimiter}
                onChange={(e) => setJoinDelimiter(e.target.value)}
                placeholder="/"
              />
              <p className="word-shuffler-description">
                섞인 결과를 이 문자로 연결합니다. (줄바꿈은 \n을 사용하세요.)
              </p>
            </div>
          </div>

          {/* Groups and Copies */}
          <div className="word-shuffler-option-column">
            <h4>그룹 및 복사</h4>
            <div className="word-shuffler-option-item">
              <input
                type="number"
                className="word-shuffler-input"
                value={tupleLength}
                onChange={(e) => setTupleLength(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
              />
              <p className="word-shuffler-description">
                이 길이의 단어 그룹으로 섞습니다.
              </p>
            </div>
            <div className="word-shuffler-option-item">
              <label className="word-shuffler-checkbox">
                <input
                  type="checkbox"
                  checked={removeRepeated}
                  onChange={(e) => setRemoveRepeated(e.target.checked)}
                />
                <span>중복 단어 제거</span>
              </label>
              <p className="word-shuffler-description">
                중복된 단어(또는 그룹)를 건너뛰고 고유한 단어/그룹만 섞습니다.
              </p>
            </div>
          </div>

          {/* Punctuation Marks */}
          <div className="word-shuffler-option-column">
            <h4>구두점</h4>
            <div className="word-shuffler-option-item">
              <label className="word-shuffler-checkbox">
                <input
                  type="checkbox"
                  checked={removePunctuation}
                  onChange={(e) => setRemovePunctuation(e.target.checked)}
                />
                <span>구두점 제거</span>
              </label>
              <p className="word-shuffler-description">
                구두점 없이 단어를 섞습니다.
              </p>
            </div>
            <div className="word-shuffler-option-item">
              <input
                type="text"
                className="word-shuffler-input"
                value={punctuationMarks}
                onChange={(e) => setPunctuationMarks(e.target.value)}
                placeholder='.,?!()"'
              />
              <p className="word-shuffler-description">
                제거할 구두점 목록을 입력하세요.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WordShuffler

