/**
 * 캔버스(긴 지문 캡처)를 A4 세로 높이를 넘지 않도록 잘라 jsPDF에 순서대로 붙입니다.
 * 기존에는 imgHeight > 297mm 일 때 한 페이지에 addImage만 해서 하단이 잘렸습니다.
 *
 * 본문 글씨 축소 후 높이가 A4를 살짝 넘는 경우(반올림·여백), 두 번째 슬라이스가 거의 비어
 * 빈 페이지처럼 보일 수 있어, "의미 있는 두 번째 장"이 아니면 한 장에 세로만 살짝 맞춰 넣습니다.
 */
export function addCanvasAcrossPdfPages(pdf, canvas, options = {}) {
  const pageWidthMm = options.pageWidthMm ?? 210
  const pageHeightMm = options.pageHeightMm ?? 297
  const x0 = options.x0 ?? 0
  const compress = options.compress ?? 'FAST'
  /** 단일 페이지로 취급할 때 허용 초과(mm) — 부동소수·캔버스 반올림 */
  const PAGE_EPS_MM = 1.2
  /**
   * 2페이지로 나눌 때 두 번째 장 높이가 이 값(mm) 미만이면 사실상 빈 페이지로 보고
   * 전체를 1페이지 높이에 맞게 세로 스케일(미세 압축)합니다.
   */
  const MIN_MEANINGFUL_SECOND_PAGE_MM = 22

  const imgWidthMm = pageWidthMm
  const imgHeightMm = (canvas.height / canvas.width) * pageWidthMm

  if (imgHeightMm <= pageHeightMm + PAGE_EPS_MM) {
    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(imgData, 'PNG', x0, 0, imgWidthMm, imgHeightMm, undefined, compress)
    return
  }

  // 딱 2장 분량인데 두 번째가 너무 얇음 → 빈 페이지 방지
  if (imgHeightMm < pageHeightMm * 2 - PAGE_EPS_MM) {
    const tailMm = imgHeightMm - pageHeightMm
    if (tailMm < MIN_MEANINGFUL_SECOND_PAGE_MM) {
      const imgData = canvas.toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', x0, 0, imgWidthMm, pageHeightMm, undefined, compress)
      return
    }
  }

  let yConsumedMm = 0
  let first = true
  while (yConsumedMm < imgHeightMm - 0.01) {
    if (!first) pdf.addPage()
    first = false
    const sliceMm = Math.min(pageHeightMm, imgHeightMm - yConsumedMm)
    const srcY = (yConsumedMm / imgHeightMm) * canvas.height
    const srcH = (sliceMm / imgHeightMm) * canvas.height
    const sh = Math.max(1, Math.ceil(srcH))

    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = canvas.width
    sliceCanvas.height = sh
    const sctx = sliceCanvas.getContext('2d')
    sctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)

    const sliceData = sliceCanvas.toDataURL('image/png')
    pdf.addImage(sliceData, 'PNG', x0, 0, imgWidthMm, sliceMm, undefined, compress)
    yConsumedMm += sliceMm
  }
}
