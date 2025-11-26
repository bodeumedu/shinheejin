import { useState, useEffect } from 'react'
import './ApiKeyInput.css'

function ApiKeyInput({ onApiKeySet }) {
  const [apiKey, setApiKey] = useState('')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // 저장된 API 키 불러오기
    const savedKey = localStorage.getItem('openai_api_key')
    if (savedKey) {
      setApiKey(savedKey)
      onApiKeySet(savedKey)
    } else {
      // 저장된 키가 없으면 환경 변수에서 기본 키 사용
      const defaultKey = import.meta.env.VITE_DEFAULT_API_KEY
      if (defaultKey) {
        setApiKey(defaultKey)
        onApiKeySet(defaultKey)
        // 기본 키도 로컬 스토리지에 저장 (사용자가 변경할 수 있도록)
        localStorage.setItem('openai_api_key', defaultKey)
      } else {
        setIsVisible(true)
      }
    }
  }, [onApiKeySet])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (apiKey.trim()) {
      localStorage.setItem('openai_api_key', apiKey.trim())
      onApiKeySet(apiKey.trim())
      setIsVisible(false)
    }
  }

  const handleChange = () => {
    setIsVisible(true)
    setApiKey('')
    localStorage.removeItem('openai_api_key')
    onApiKeySet('')
  }

  if (!isVisible && apiKey) {
    return (
      <div className="api-key-status">
        <span>✓ API 키가 설정되었습니다</span>
        <button onClick={handleChange} className="btn-change-key">
          변경
        </button>
      </div>
    )
  }

  return (
    <div className="api-key-input-container">
      <form onSubmit={handleSubmit} className="api-key-form">
        <div className="api-key-info">
          <h3>OpenAI API 키 설정</h3>
          <p>영어 지문을 분석하기 위해 OpenAI API 키가 필요합니다.</p>
          <p className="api-key-link">
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              API 키 발급받기 →
            </a>
          </p>
        </div>
        <div className="form-section">
          <label htmlFor="apiKey">OpenAI API Key *</label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            required
          />
          <small>API 키는 브라우저에만 저장되며 서버로 전송되지 않습니다.</small>
        </div>
        <button type="submit" className="btn-save-key">
          저장하기
        </button>
      </form>
    </div>
  )
}

export default ApiKeyInput

