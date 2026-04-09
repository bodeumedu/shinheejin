/**
 * Vercel Serverless — POST /api/openai-chat
 * 클라이언트에서 넘긴 apiKey로 OpenAI chat/completions 호출 (CORS 우회)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  try {
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}')
      } catch {
        return res.status(400).json({ error: { message: 'Invalid JSON' } })
      }
    }
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: { message: 'Invalid body' } })
    }

    const { apiKey, ...openAiPayload } = body
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: { message: 'API 키가 필요합니다.' } })
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openAiPayload),
    })

    const text = await openaiRes.text()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(openaiRes.status)
    return res.end(text)
  } catch (e) {
    console.error('openai-chat proxy:', e)
    return res.status(500).json({ error: { message: e.message || '프록시 오류' } })
  }
}
