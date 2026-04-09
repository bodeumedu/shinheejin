/**
 * 서술형 PDF(html2canvas) 캡처 전, 한 A4(297mm)를 넘기면 영어 본문만 살짝 조정합니다.
 * - 글자: 1pt씩 최대 몇 번만(가독성 우선), 하한 10pt
 * - 줄간격: 소폭만 축소, 하한 1.28
 * 그래도 넘치면 **여러 PDF 페이지**로 나뉘어도 되며, 글씨를 과도하게 줄이지 않습니다.
 * 캡처 후 restore()로 스타일을 되돌립니다.
 */

const PT_TO_PX = 96 / 72
/** 이 밑으로는 너무 작아 보이므로 더 줄이지 않음 */
const MIN_PASSAGE_FONT_PT = 10
const MIN_PASSAGE_FONT_PX = MIN_PASSAGE_FONT_PT * PT_TO_PX
/** 기본(약 11~12pt)에서 최대 몇 pt만 줄일지 — 한 장 억지 맞춤 방지 */
const MAX_FONT_PT_DROPS = 3
/** 줄간격(배수) 하한 — 1.06까지 쓰면 인쇄물이 답답해 보임 */
const MIN_LINE_HEIGHT_RATIO = 1.28
const MAX_LINE_SHRINK_STEPS = 10
const LINE_STEP = 0.06

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
  while (pages > 1 && fontSteps < MAX_FONT_PT_DROPS) {
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
    const nextRatio = Math.max(MIN_LINE_HEIGHT_RATIO, Math.round((ratio - LINE_STEP) * 100) / 100)
    if (nextRatio >= ratio - 0.001) break
    passageEl.style.lineHeight = String(nextRatio)
    lhSteps += 1
    canvas = await captureOnce()
    pages = canvasPdfPageCount(canvas, pageWidthMm, pageHeightMm)
  }

  return { canvas, restore }
}
