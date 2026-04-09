/**
 * 서술형 PDF(html2canvas) 캡처 전, 한 페이지 A4 높이를 넘으면 영어 본문만
 * 글자 크기 1pt씩 최대 2회 축소 후, 줄간격을 0.1씩 줄여 재캡처합니다.
 * 캡처 후 restore()로 스타일을 되돌립니다.
 */

const PT_TO_PX = 96 / 72

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
  while (pages > 1 && fontSteps < 2) {
    const cs = window.getComputedStyle(passageEl)
    const fsPx = parseFloat(cs.fontSize)
    if (Number.isNaN(fsPx)) break
    const nextPx = Math.max(10 * PT_TO_PX, fsPx - PT_TO_PX)
    passageEl.style.fontSize = `${nextPx}px`
    fontSteps += 1
    canvas = await captureOnce()
    pages = canvasPdfPageCount(canvas, pageWidthMm, pageHeightMm)
  }

  let lhSteps = 0
  while (pages > 1 && lhSteps < 12) {
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
    const nextRatio = Math.max(1.12, Math.round((ratio - 0.1) * 100) / 100)
    passageEl.style.lineHeight = String(nextRatio)
    lhSteps += 1
    canvas = await captureOnce()
    pages = canvasPdfPageCount(canvas, pageWidthMm, pageHeightMm)
  }

  return { canvas, restore }
}
