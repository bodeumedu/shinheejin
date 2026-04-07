import { useMemo, useState } from 'react'
import './AuthScreen.css'
import {
  normalizePhoneNumber,
  signInPocketbookUser,
  signUpPocketbookUser,
  USER_ROLES,
} from '../utils/userAuth'

const DEFAULT_SIGNUP_FORM = {
  name: '',
  phoneNumber: '',
  password: '',
  role: 'teacher',
}

export default function AuthScreen({ onAuthenticated }) {
  const [tab, setTab] = useState('signin')
  const [loginForm, setLoginForm] = useState({ phoneNumber: '', password: '' })
  const [signupForm, setSignupForm] = useState(DEFAULT_SIGNUP_FORM)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const roleOptions = useMemo(() => USER_ROLES, [])

  const handleLoginChange = (field, value) => {
    setLoginForm((prev) => ({
      ...prev,
      [field]: field === 'phoneNumber' ? normalizePhoneNumber(value) : value,
    }))
  }

  const handleSignupChange = (field, value) => {
    setSignupForm((prev) => ({
      ...prev,
      [field]: field === 'phoneNumber' ? normalizePhoneNumber(value) : value,
    }))
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      const user = await signInPocketbookUser(loginForm)
      onAuthenticated?.(user)
    } catch (signInError) {
      setError(signInError?.message || '로그인에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignUp = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      const user = await signUpPocketbookUser(signupForm)
      setSignupForm(DEFAULT_SIGNUP_FORM)
      if (user?.requestSubmitted) {
        setTab('signin')
        setNotice('가입 요청이 접수되었습니다. 신희진 승인 후 로그인할 수 있습니다.')
        return
      }
      onAuthenticated?.(user)
    } catch (signUpError) {
      setError(signUpError?.message || '회원가입에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen-card">
        <div className="auth-screen-header">
          <h1>포켓북</h1>
          <p>직원/선생님/운영진 로그인과 캘린더 기능을 위한 계정 시스템입니다.</p>
          <p>회원가입은 관리자에게 승인된 학원 구성원만 가능합니다.</p>
        </div>

        <div className="auth-screen-tabs">
          <button
            type="button"
            className={tab === 'signin' ? 'active' : ''}
            onClick={() => {
              setTab('signin')
              setError('')
              setNotice('')
            }}
          >
            로그인
          </button>
          <button
            type="button"
            className={tab === 'signup' ? 'active' : ''}
            onClick={() => {
              setTab('signup')
              setError('')
              setNotice('')
            }}
          >
            회원가입
          </button>
        </div>

        {tab === 'signin' ? (
          <form className="auth-screen-form" onSubmit={handleSignIn}>
            <label>
              전화번호
              <input
                type="text"
                value={loginForm.phoneNumber}
                onChange={(event) => handleLoginChange('phoneNumber', event.target.value)}
                placeholder="01012345678"
                autoComplete="username"
                required
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => handleLoginChange('password', event.target.value)}
                placeholder="비밀번호"
                autoComplete="current-password"
                required
              />
            </label>
            {notice ? <div className="auth-screen-success">{notice}</div> : null}
            {error ? <div className="auth-screen-error">{error}</div> : null}
            <button type="submit" className="auth-screen-submit" disabled={isSubmitting}>
              {isSubmitting ? '로그인 중...' : '로그인'}
            </button>
          </form>
        ) : (
          <form className="auth-screen-form" onSubmit={handleSignUp}>
            <label>
              이름
              <input
                type="text"
                value={signupForm.name}
                onChange={(event) => handleSignupChange('name', event.target.value)}
                placeholder="이름"
                autoComplete="name"
                required
              />
            </label>
            <label>
              전화번호
              <input
                type="text"
                value={signupForm.phoneNumber}
                onChange={(event) => handleSignupChange('phoneNumber', event.target.value)}
                placeholder="01012345678"
                autoComplete="username"
                required
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={signupForm.password}
                onChange={(event) => handleSignupChange('password', event.target.value)}
                placeholder="4자 이상"
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              역할
              <select
                value={signupForm.role}
                onChange={(event) => handleSignupChange('role', event.target.value)}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {notice ? <div className="auth-screen-success">{notice}</div> : null}
            {error ? <div className="auth-screen-error">{error}</div> : null}
            <button type="submit" className="auth-screen-submit" disabled={isSubmitting}>
              {isSubmitting ? '요청 중...' : '회원가입 승인 요청'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
