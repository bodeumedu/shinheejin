/**
 * 캔버스(긴 지문 캡처)를 A4 세로 높이를 넘지 않도록 잘라 jsPDF에 순서대로 붙입니다.
 * 기존에는 imgHeight > 297mm 일 때 한 페이지에 addImage만 해서 하단이 잘렸습니다.
 */
export function addCanvasAcrossPdfPages(pdf, canvas, options = {}) {
  const pageWidthMm = options.pageWidthMm ?? 210
  const pageHeightMm = options.pageHeightMm ?? 297
  const x0 = options.x0 ?? 0
  const compress = options.compress ?? 'FAST'

  const imgWidthMm = pageWidthMm
  const imgHeightMm = (canvas.height / canvas.width) * pageWidthMm

  if (imgHeightMm <= pageHeightMm + 0.5) {
    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(imgData, 'PNG', x0, 0, imgWidthMm, imgHeightMm, undefined, compress)
    return
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
