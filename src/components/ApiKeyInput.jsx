import { useState, useEffect } from 'react'
import './ApiKeyInput.css'

function ApiKeyInput({
  onApiKeySet,
  storageKey = 'openai_api_key',
  defaultEnvKeyName = 'VITE_DEFAULT_API_KEY',
  title = 'OpenAI API 키 설정',
  description = '영어 지문을 분석하기 위해 OpenAI API 키가 필요합니다.',
  docsUrl = 'https://platform.openai.com/api-keys',
  label = 'OpenAI API Key *',
  placeholder = 'sk-...',
  statusText = '✓ API 키가 설정되었습니다',
}) {
  const [apiKey, setApiKey] = useState('')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // 저장된 API 키 불러오기
    const savedKey = localStorage.getItem(storageKey)
    if (savedKey) {
      setApiKey(savedKey)
      onApiKeySet(savedKey)
    } else {
      // 저장된 키가 없으면 환경 변수에서 기본 키 사용
      const defaultKey = import.meta.env[defaultEnvKeyName]
      if (defaultKey) {
        setApiKey(defaultKey)
        onApiKeySet(defaultKey)
        // 기본 키도 로컬 스토리지에 저장 (사용자가 변경할 수 있도록)
        localStorage.setItem(storageKey, defaultKey)
      } else {
        setIsVisible(true)
      }
    }
  }, [onApiKeySet, storageKey, defaultEnvKeyName])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (apiKey.trim()) {
      localStorage.setItem(storageKey, apiKey.trim())
      onApiKeySet(apiKey.trim())
      setIsVisible(false)
    }
  }

  const handleChange = () => {
    setIsVisible(true)
    setApiKey('')
    localStorage.removeItem(storageKey)
    onApiKeySet('')
  }

  if (!isVisible && apiKey) {
    return (
      <div className="api-key-status">
        <span>{statusText}</span>
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
          <h3>{title}</h3>
          <p>{description}</p>
          <p className="api-key-link">
            <a href={docsUrl} target="_blank" rel="noopener noreferrer">
              API 키 발급받기 →
            </a>
          </p>
        </div>
        <div className="form-section">
          <label htmlFor="apiKey">{label}</label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={placeholder}
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

