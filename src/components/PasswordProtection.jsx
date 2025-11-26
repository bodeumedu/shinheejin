import { useState, useEffect } from 'react'
import './PasswordProtection.css'

function PasswordProtection({ onPasswordCorrect }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    // 저장된 비밀번호 확인 상태 확인
    const isAuthenticated = localStorage.getItem('pocketbook_authenticated')
    if (isAuthenticated === 'true') {
      onPasswordCorrect()
    } else {
      setIsChecking(false)
    }
  }, [onPasswordCorrect])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (password === '4420') {
      localStorage.setItem('pocketbook_authenticated', 'true')
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

