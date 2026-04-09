/**
 * OpenAI Chat Completions — 브라우저 직접 호출은 CORS로 차단되므로
 * 같은 출처 `/api/openai-chat`(Vercel 함수 또는 Vite 개발 미들웨어)로 보냅니다.
 *
 * @param {string} apiKey
 * @param {Record<string, unknown>} openAiBody - model, messages, temperature, max_tokens, response_format 등 (apiKey 제외)
 * @returns {Promise<object>} OpenAI JSON 본문
 */
export async function openAiChatCompletions(apiKey, openAiBody) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const res = await fetch('/api/openai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, ...openAiBody }),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg =
      data.error?.message ||
      (typeof data.error === 'string' ? data.error : null) ||
      `API 오류: ${res.status}`
    throw new Error(msg)
  }

  return data
}
