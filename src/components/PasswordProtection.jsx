import { useState, useEffect } from 'react'
import './PasswordProtection.css'

function getTodayAuthKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function PasswordProtection({
  onPasswordCorrect,
  onSelectPocketbook,
  onSelectDescriptiveProblemBuilder,
  onSelectKey,
  onSelectWordShuffler,
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    // 오늘 날짜와 일치할 때만 인증 유지
    const isAuthenticated = localStorage.getItem('pocketbook_authenticated')
    if (isAuthenticated === getTodayAuthKey()) {
      onPasswordCorrect()
    } else {
      localStorage.removeItem('pocketbook_authenticated')
      setIsChecking(false)
    }
  }, [onPasswordCorrect])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (password === '4420') {
      localStorage.setItem('pocketbook_authenticated', getTodayAuthKey())
      onPasswordCorrect()
    } else {
      setError('비밀번호가 올바르지 않습니다.')
      setPassword('')
    }
  }

  if (isChecking) {
    return (
      <div className="password-checking">
        <p>확인 중...</p>
      </div>
    )
  }

  return (
    <div className="password-protection-container">
      <div className="password-box">
        <h2>포켓북 만들기</h2>
        <p className="password-subtitle">by 신희진</p>
        <div className="password-quick-access">
          <div className="password-quick-access-title">비밀번호 없이 바로 사용</div>
          <div className="password-quick-access-buttons">
            <button type="button" className="password-quick-btn" onClick={onSelectPocketbook}>
              📖 포켓북 만들기
            </button>
            <button type="button" className="password-quick-btn" onClick={onSelectDescriptiveProblemBuilder}>
              🧩 서술형 문제 만들기
            </button>
            <button type="button" className="password-quick-btn" onClick={onSelectKey}>
              🔑 KEY
            </button>
            <button type="button" className="password-quick-btn" onClick={onSelectWordShuffler}>
              🔀 단어 섞기
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="password-form">
          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              autoFocus
              required
            />
            {error && (
              <div className="password-error">
                {error}
              </div>
            )}
          </div>
          <button type="submit" className="btn-password">
            확인
          </button>
        </form>
      </div>
    </div>
  )
}

export default PasswordProtection

