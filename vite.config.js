import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** 로컬 `npm run dev`에서 `/api/openai-chat` → OpenAI (CORS 없음) */
function openaiChatDevProxy() {
  return {
    name: 'openai-chat-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url || '').split('?')[0]
        if (pathOnly !== '/api/openai-chat' || req.method !== 'POST') {
          return next()
        }
        const chunks = []
        try {
          for await (const chunk of req) {
            chunks.push(chunk)
          }
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: '본문을 읽을 수 없습니다.' } }))
          return
        }
        let payload
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'JSON이 아닙니다.' } }))
          return
        }
        const { apiKey, ...openAiPayload } = payload
        if (!apiKey) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: 'API 키가 필요합니다.' } }))
          return
        }
        try {
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(openAiPayload),
          })
          const text = await r.text()
          res.statusCode = r.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(text)
        } catch (e) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: e.message || 'OpenAI 연결 실패' } }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), openaiChatDevProxy()],
})

