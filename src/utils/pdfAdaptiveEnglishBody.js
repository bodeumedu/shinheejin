/**
 * 서술형 PDF(html2canvas) 캡처 전, 한 A4(297mm)를 넘기면 영어 본문만 조정합니다.
 * 1) 글자 1pt씩 축소(최소 8pt까지) → 2) 줄간격 0.08씩 축소(최소 1.06까지).
 * 캡처 후 restore()로 스타일을 되돌립니다.
 */

const PT_TO_PX = 96 / 72
/** 본문 최소 글자 크기(pt) — 이보다 작으면 가독성이 크게 떨어짐 */
const MIN_PASSAGE_FONT_PT = 8
const MIN_PASSAGE_FONT_PX = MIN_PASSAGE_FONT_PT * PT_TO_PX
/** 줄간격(배수) 하한 */
const MIN_LINE_HEIGHT_RATIO = 1.06
const MAX_FONT_SHRINK_STEPS = 24
const MAX_LINE_SHRINK_STEPS = 30
/** 8pt까지 줄여도 한 장 초과 시에만, 최소 6.5pt까지 추가 1pt씩(최대 4회) */
const EMERGENCY_MIN_FONT_PT = 6.5
const EMERGENCY_MIN_FONT_PX = EMERGENCY_MIN_FONT_PT * PT_TO_PX
const MAX_EMERGENCY_FONT_STEPS = 4

function isAnswerPdfPage(pageEl) {
  if (!pageEl?.classList) return false
  return (
    pageEl.classList.contains('sum15-answer-page') ||
    pageEl.classList.contains('sum30-answer-page') ||
    pageEl.classList.contains('sum40-answer-page')
  )
}

function findEnglishPassageElement(pageEl) {
  if (!pageEl?.querySelector) return null
  let el = pageEl.querySelector('.sum15-original:not(.sum15-interview-text) .sum15-original-text')
  if (el) return el
  el = pageEl.querySelector('.sum30-original-text')
  if (el) return el
  el = pageEl.querySelector('.sum40-original-text')
  return el
}

function canvasPdfPageCount(canvas, pageWidthMm, pageHeightMm) {
  const imgHeightMm = (canvas.height / canvas.width) * pageWidthMm
  if (imgHeightMm <= pageHeightMm + 0.5) return 1
  let n = 0
  let y = 0
  while (y < imgHeightMm - 0.01) {
    n += 1
    y += Math.min(pageHeightMm, imgHeightMm - y)
  }
  return n
}

/**
 * @param {HTMLElement} pageEl - sum15/sum30/sum40 .sum*-page
 * @param {typeof import('html2canvas').default} html2canvas
 * @param {object} baseOpts - html2canvas options (scale, width, height, …)
 * @param {{ pageWidthMm?: number, pageHeightMm?: number }} metrics
 * @returns {Promise<{ canvas: HTMLCanvasElement, restore: () => void }>}
 */
export async function capturePdfPageWithAdaptiveEnglish(pageEl, html2canvas, baseOpts, metrics = {}) {
  const pageWidthMm = metrics.pageWidthMm ?? 210
  const pageHeightMm = metrics.pageHeightMm ?? 297

  const passageEl = findEnglishPassageElement(pageEl)
  if (!passageEl || isAnswerPdfPage(pageEl)) {
    const canvas = await html2canvas(pageEl, baseOpts)
    return { canvas, restore: () => {} }
  }

  const saved = {
    fontSize: passageEl.style.fontSize,
    lineHeight: passageEl.style.lineHeight,
  }

  const restore = () => {
    passageEl.style.fontSize = saved.fontSize
    passageEl.style.lineHeight = saved.lineHeight
  }

  const captureOnce = async () => {
    await new Promise((r) => setTimeout(r, 80))
    return html2canvas(pageEl, baseOpts)
  }

  let canvas = await captureOnce()
  let pages = canvasPdfPageCount(canvas, pageWidthMm, pageHeightMm)

  let fontSteps = 0
  while (pages > 1 && fontSteps < MAX_FONT_SHRINK_STEPS) {
    const cs = window.getComputedStyle(passageEl)
    const fsPx = parseFloat(cs.fontSize)
    if (Number.isNaN(fsPx)) break
    if (fsPx <= MIN_PASSAGE_FONT_PX + 0.25) break
    const nextPx = Math.max(MIN_PASSAGE_FONT_PX, fsPx - PT_TO_PX)
    passageEl.style.fontSize = `${nextPx}px`
    fontSteps += 1
    canvas = await captureOnce()
    pages = canvasPdfPageCount(canvas, pageWidthMm, pageHeightMm)
  }

  let lhSteps = 0
  while (pages > 1 && lhSteps < MAX_LINE_SHRINK_STEPS) {
    const cs = window.getComputedStyle(passageEl)
    const fsPx = parseFloat(cs.fontSize)
    const lhRaw = cs.lineHeight
    let ratio
    if (lhRaw.endsWith('px')) {
      ratio = parseFloat(lhRaw) / (Number.isNaN(fsPx) ? 16 : fsPx)
    } else {
      ratio = parseFloat(lhRaw)
    }
    if (Number.isNaN(ratio)) ratio = 1.8
    const nextRatio = Math.max(MIN_LINE_HEIGHT_RATIO, Math.round((ratio - 0.08) * 100) / 100)
    if (nextRatio >= ratio - 0.001) break
    passageEl.style.lineHeight = String(nextRatio)
    lhSteps += 1
    canvas = await captureOnce()
    pages = canvasPdfPageCount(canvas, pageWidthMm, pageHeightMm)
  }

  let emergSteps = 0
  while (pages > 1 && emergSteps < MAX_EMERGENCY_FONT_STEPS) {
    const cs = window.getComputedStyle(passageEl)
    const fsPx = parseFloat(cs.fontSize)
    if (Number.isNaN(fsPx) || fsPx <= EMERGENCY_MIN_FONT_PX + 0.2) break
    const nextPx = Math.max(EMERGENCY_MIN_FONT_PX, fsPx - PT_TO_PX)
    passageEl.style.fontSize = `${nextPx}px`
    emergSteps += 1
    canvas = await captureOnce()
    pages = canvasPdfPageCount(canvas, pageWidthMm, pageHeightMm)
  }

  return { canvas, restore }
}
