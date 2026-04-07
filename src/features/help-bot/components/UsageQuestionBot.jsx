import { useMemo, useState } from 'react'
import './UsageQuestionBot.css'
import { HELP_BOT_SUGGESTIONS } from '../data/helpBotKnowledge'
import { answerUsageQuestion } from '../utils/helpBotAi'

export default function UsageQuestionBot({ apiKey = '' }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: '사이트 사용법 질문을 받습니다. 예: 학생 등록, 반 만들기, 캘린더 보기, 카카오톡 전송',
      references: [],
    },
  ])

  const quickQuestions = useMemo(() => HELP_BOT_SUGGESTIONS.slice(0, 5), [])

  const handleAsk = async (rawQuestion) => {
    const trimmed = String(rawQuestion || question).trim()
    if (!trimmed || loading) return

    setMessages((prev) => [
      ...prev,
      { id: `user_${Date.now()}`, role: 'user', text: trimmed, references: [] },
    ])
    setQuestion('')
    setLoading(true)

    try {
      const result = await answerUsageQuestion(apiKey, trimmed)
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          text: result.answer,
          references: result.references || [],
        },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant_error_${Date.now()}`,
          role: 'assistant',
          text: error?.message || '답변을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.',
          references: [],
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="main-menu-help-bot-btn"
        onClick={() => setOpen(true)}
      >
        ❓ 쓰는법 질문
      </button>

      {open && (
        <div className="usage-help-bot-overlay" onClick={() => setOpen(false)}>
          <div className="usage-help-bot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="usage-help-bot-header">
              <div>
                <h3>쓰는법 질문</h3>
                <p>포켓북 사이트 사용법을 물어보세요.</p>
              </div>
              <button type="button" className="usage-help-bot-close" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>

            <div className="usage-help-bot-suggestions">
              {quickQuestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="usage-help-bot-suggestion"
                  onClick={() => handleAsk(item)}
                  disabled={loading}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="usage-help-bot-messages">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`usage-help-bot-message usage-help-bot-message-${message.role}`}
                >
                  <div className="usage-help-bot-message-text">{message.text}</div>
                  {message.references?.length > 0 && (
                    <div className="usage-help-bot-references">
                      참고: {message.references.join(', ')}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="usage-help-bot-message usage-help-bot-message-assistant">
                  <div className="usage-help-bot-message-text">답변을 정리하는 중입니다...</div>
                </div>
              )}
            </div>

            <div className="usage-help-bot-input-row">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="예: 학생 등록은 어디서 해요?"
                rows={3}
              />
              <button
                type="button"
                className="usage-help-bot-send"
                onClick={() => handleAsk()}
                disabled={loading || !question.trim()}
              >
                보내기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
