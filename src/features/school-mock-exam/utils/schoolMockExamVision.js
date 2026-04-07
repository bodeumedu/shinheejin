import { geminiGenerateContent } from '../../../utils/geminiClient.js'

const VISION_MODEL = 'gemini-3-flash-preview'

/**
 * 모델이 정책상 거절할 때 자주 쓰는 영어 문구(전사 결과에 섞이면 저장하면 안 됨)
 * @param {string} text
 */
function looksLikeModelRefusal(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  const head = t.slice(0, 800).toLowerCase()
  if (/^as an ai\b/i.test(t)) return true
  if (head.includes("i'm sorry") && (head.includes("can't") || head.includes('cannot'))) return true
  if (head.includes('cannot assist') || head.includes("can't assist")) return true
  if (head.includes('unable to assist') || head.includes('not able to assist')) return true
  if (head.includes('refuse to') && head.includes('transcrib')) return true
  return false
}

/**
 * @param {string} apiKey
 * @param {Array<{ type: string, text?: string, image_url?: { url: string, detail: string } }>} content
 * @param {number} timeoutMs
 */
async function openAiVisionOnce(apiKey, content, timeoutMs = 120000) {
  try {
    const out = await geminiGenerateContent({
      apiKey,
      model: VISION_MODEL,
      systemInstruction:
        'You are an OCR-style transcriber only. The images are from exam papers that the user is authorized to digitize (e.g. their own school materials for archival, accessibility, or internal prep). Your job is to copy visible printed text into plain text—like scanning—not to solve questions, give answers, or tutor. Never refuse to transcribe visible text for this purpose. Output plain text only: preserve question numbers, points, Korean directions, English passages, and choice labels as visible. If illegible, write [판독불가]. Do not apologize or explain refusals; always output transcription or [판독불가] for unreadable parts.',
      userContent: content,
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: 'text/plain',
      timeoutMs,
    })
    const raw = out.text || ''
    if (looksLikeModelRefusal(raw)) {
      throw new Error(
        'Vision 모델이 시험지 이미지 전사를 거절한 응답을 반환했습니다. (정책·오인 차단 등) 같은 PDF를 글자 선택·복사가 되는 버전으로 다시 저장해 올리거나, 다른 페이지만 나눠 시도해 보세요. 계속되면 API 제공사 정책 변경일 수 있습니다.'
      )
    }
    return raw
  } catch (e) {
    if (String(e?.message || '').includes('요청 시간 초과')) {
      throw new Error(`Vision 요청 시간 초과(${Math.round(timeoutMs / 1000)}초)`)
    }
    throw e
  }
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * 스캔 PDF 페이지 이미지들을 배치로 전사
 * @param {string} apiKey
 * @param {{ page: number, dataUrl: string }[]} images
 * @param {string} setLabel 예: "필기 제거본"
 */
export async function transcribeExamPageImages(apiKey, images, setLabel) {
  if (!images.length) return ''
  const batches = chunk(images, 3)
  const parts = []
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const intro = {
      type: 'text',
      text: `[${setLabel}] 시험지 PDF 페이지 이미지 일부 (${b + 1}/${batches.length}). 교사·학교가 보관·출제 준비용으로 자체 시험지를 디지털화하는 단계입니다. 보이는 인쇄 글자만 OCR처럼 그대로 옮기세요(문제 풀이·정답 제시·요약 금지). 문항 번호·배점·선지 기호를 유지하세요.`,
    }
    const imgs = batch.map((im) => ({
      type: 'image_url',
      image_url: { url: im.dataUrl, detail: 'low' },
    }))
    const text = await openAiVisionOnce(apiKey, [intro, ...imgs], 180000)
    parts.push(`--- ${setLabel} 이미지 배치 ${b + 1} (페이지 ${batch.map((x) => x.page).join(',')}) ---\n${text}`)
  }
  return parts.join('\n\n')
}
