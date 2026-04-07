import { geminiGenerateContent } from '../../../utils/geminiClient'
import {
  buildHelpBotKnowledgeText,
  buildLocalHelpBotAnswer,
  findRelevantGuides,
} from '../data/helpBotKnowledge'

const DEFAULT_HELP_BOT_API_KEY = import.meta.env.VITE_DEFAULT_GEMINI_API_KEY || ''

export async function answerUsageQuestion(apiKey, question) {
  const trimmedQuestion = String(question || '').trim()
  if (!trimmedQuestion) {
    throw new Error('질문을 입력해주세요.')
  }

  const relevantGuides = findRelevantGuides(trimmedQuestion)
  const fallbackAnswer = buildLocalHelpBotAnswer(trimmedQuestion)
  const resolvedApiKey = String(apiKey || DEFAULT_HELP_BOT_API_KEY).trim()

  if (!resolvedApiKey) {
    return {
      answer: fallbackAnswer,
      references: relevantGuides.map((guide) => guide.title),
      usedAi: false,
    }
  }

  try {
    const knowledgeText = buildHelpBotKnowledgeText(relevantGuides)
    const result = await geminiGenerateContent({
      apiKey: resolvedApiKey,
      model: 'gemini-3.1-pro-preview',
      temperature: 0.2,
      maxOutputTokens: 900,
      timeoutMs: 45000,
      systemInstruction:
        '당신은 포켓북 사이트 내부 사용법을 설명하는 도우미입니다. 반드시 한국어로 짧고 실용적으로 답하세요. 제공된 참고자료 범위 안에서만 안내하고, 모르면 추측하지 말고 어디 화면에서 확인해야 하는지 말하세요. 코드나 개발 설명보다 사용자가 실제로 눌러야 하는 메뉴와 순서를 우선 설명하세요.',
      userContent: [
        `사용자 질문:\n${trimmedQuestion}`,
        '',
        '참고 가능한 사이트 사용법 자료:',
        knowledgeText,
        '',
        '답변 규칙:',
        '- 4~8문장 정도로 간단히 답할 것',
        '- 실제로 눌러야 할 메뉴 이름을 포함할 것',
        '- 제공된 자료로 확실하지 않으면 추측하지 말 것',
      ].join('\n'),
    })

    const answer = String(result?.text || '').trim()
    return {
      answer: answer || fallbackAnswer,
      references: relevantGuides.map((guide) => guide.title),
      usedAi: Boolean(answer),
    }
  } catch (error) {
    return {
      answer: fallbackAnswer,
      references: relevantGuides.map((guide) => guide.title),
      usedAi: false,
      errorMessage: error?.message || 'AI 답변 생성 실패',
    }
  }
}
