let jsPDF
let html2canvas

async function loadPdfLibraries() {
  if (!jsPDF) {
    jsPDF = (await import('jspdf')).default
  }
  if (!html2canvas) {
    html2canvas = (await import('html2canvas')).default
  }
}

export async function exportSum40ToPdf(options = {}) {
  try {
    await loadPdfLibraries()
  } catch (error) {
    throw new Error('PDF 라이브러리를 로드할 수 없습니다. 패키지를 설치해주세요: npm install jspdf html2canvas')
  }

  const questionPages = Array.from(document.querySelectorAll('[id^="sum40-page-"]'))
    .filter((el) => !el.id.includes('answer'))
    .sort((a, b) => {
      const aIdx = parseInt(a.id.replace('sum40-page-', ''), 10)
      const bIdx = parseInt(b.id.replace('sum40-page-', ''), 10)
      return aIdx - bIdx
    })

  const answerPages = Array.from(document.querySelectorAll('[id^="sum40-answer-page-"]'))
    .sort((a, b) => {
      const aIdx = parseInt(a.id.replace('sum40-answer-page-', ''), 10)
      const bIdx = parseInt(b.id.replace('sum40-answer-page-', ''), 10)
      return aIdx - bIdx
    })
  const pages = [...questionPages]
  if (answerPages.length > 0) pages.push(...answerPages)

  if (pages.length === 0) {
    throw new Error('PDF로 변환할 페이지를 찾을 수 없습니다.')
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = 210

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]

    try {
      await new Promise((resolve) => setTimeout(resolve, 500))

      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: page.offsetWidth,
        height: page.offsetHeight,
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * pageWidth) / canvas.width

      if (i > 0) {
        pdf.addPage()
      }

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
    } catch (error) {
      console.error(`SUM40 페이지 ${i + 1} 변환 중 오류:`, error)
    }
  }

  pdf.save(options.filename || 'SUM40_문제지.pdf')
}
