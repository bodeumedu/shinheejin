function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(.+?);base64,(.+)$/)
  if (!match) {
    throw new Error('Gemini 이미지 입력은 base64 data URL 형식이어야 합니다.')
  }
  return {
    mimeType: match[1],
    data: match[2],
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryDelayMs(message, attempt) {
  const text = String(message || '')
  const secMatch = text.match(/retry in\s+([\d.]+)s/i)
  if (secMatch) {
    return Math.max(1000, Math.ceil(Number(secMatch[1]) * 1000))
  }
  return Math.min(12000, 1500 * attempt)
}

function normalizeTextPart(value) {
  const text = String(value ?? '')
  return text ? [{ text }] : []
}

function normalizeOpenAiContentToGeminiParts(content) {
  if (Array.isArray(content)) {
    return content.flatMap((part) => {
      if (typeof part === 'string') return normalizeTextPart(part)
      if (!part || typeof part !== 'object') return []
      if (part.type === 'text') return normalizeTextPart(part.text)
      if (part.type === 'image_url' && part.image_url?.url) {
        const inlineData = parseDataUrl(part.image_url.url)
        return [{ inlineData }]
      }
      return normalizeTextPart(part.text || '')
    })
  }
  return normalizeTextPart(content)
}

function collectSystemInstruction(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((msg) => msg?.role === 'system')
    .flatMap((msg) => normalizeOpenAiContentToGeminiParts(msg.content))
    .map((part) => part.text || '')
    .filter(Boolean)
    .join('\n\n')
}

function collectUserParts(messages) {
  const nonSystem = (Array.isArray(messages) ? messages : []).filter((msg) => msg?.role !== 'system')
  const parts = []
  nonSystem.forEach((msg) => {
    const normalizedParts = normalizeOpenAiContentToGeminiParts(msg.content)
    if (msg?.role === 'assistant') {
      const assistantText = normalizedParts.map((part) => part.text || '').filter(Boolean).join('\n')
      if (assistantText) parts.push({ text: `[이전 응답 참고]\n${assistantText}` })
      return
    }
    parts.push(...normalizedParts)
  })
  return parts
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

export function cleanGeminiTextOutput(text) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json|text|plaintext)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export function extractJsonObjectText(text) {
  const cleaned = cleanGeminiTextOutput(text)
  if (!cleaned) return '{}'
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1)
  }
  return cleaned
}

export async function geminiGenerateContent({
  apiKey,
  model = 'gemini-3.1-pro-preview',
  systemInstruction = '',
  userContent = '',
  temperature = 0.2,
  maxOutputTokens,
  responseMimeType = 'text/plain',
  timeoutMs = 180000,
}) {
  const key = String(apiKey || '').trim()
  if (!key) {
    throw new Error('Gemini API 키가 필요합니다.')
  }

  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: systemInstruction
              ? {
                  parts: [{ text: systemInstruction }],
                }
              : undefined,
            contents: [
              {
                role: 'user',
                parts: normalizeOpenAiContentToGeminiParts(userContent),
              },
            ],
            generationConfig: {
              temperature,
              maxOutputTokens,
              responseMimeType,
            },
          }),
          signal: controller.signal,
        }
      )

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = data?.error?.message || `Gemini API 오류: ${response.status}`
        const retryable = response.status === 429 || response.status >= 500
        if (retryable && attempt < maxAttempts) {
          await sleep(parseRetryDelayMs(message, attempt))
          continue
        }
        throw new Error(message)
      }

      const text = extractGeminiText(data)
      if (!text && attempt < maxAttempts) {
        await sleep(parseRetryDelayMs('empty response', attempt))
        continue
      }
      return {
        text,
        finishReason: data?.candidates?.[0]?.finishReason || 'STOP',
        raw: data,
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        throw new Error(`요청 시간 초과(${Math.round(timeoutMs / 1000)}초)`)
      }
      const message = String(e?.message || e)
      const retryable = /quota exceeded|resource exhausted|temporar|unavailable|retry in/i.test(message)
      if (retryable && attempt < maxAttempts) {
        await sleep(parseRetryDelayMs(message, attempt))
        continue
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('Gemini 요청 재시도에 모두 실패했습니다.')
}

export async function geminiGenerateFromOpenAiChatBody(body, apiKey, timeoutMs = 180000) {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const responseMimeType =
    body?.response_format?.type === 'json_object' ? 'application/json' : 'text/plain'

  return geminiGenerateContent({
    apiKey,
    model: body?.model || 'gemini-3.1-pro-preview',
    systemInstruction: collectSystemInstruction(messages),
    userContent: collectUserParts(messages),
    temperature: body?.temperature ?? 0.2,
    maxOutputTokens: body?.max_tokens,
    responseMimeType,
    timeoutMs,
  })
}

export function buildOpenAiLikeChatResponse(text, finishReason = 'STOP') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: { content: text },
          finish_reason: finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
        },
      ],
    }),
  }
}
