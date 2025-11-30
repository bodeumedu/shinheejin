// 요약문 한글 PDF 내보내기 유틸리티

let jsPDF, html2canvas

// 동적 import로 변경 (패키지가 없을 경우를 대비)
async function loadPdfLibraries() {
  if (!jsPDF) {
    jsPDF = (await import('jspdf')).default
  }
  if (!html2canvas) {
    html2canvas = (await import('html2canvas')).default
  }
}

export async function exportKoreanSummaryToPdf() {
  try {
    // 라이브러리 로드
    await loadPdfLibraries()
  } catch (error) {
    throw new Error('PDF 라이브러리를 로드할 수 없습니다. 패키지를 설치해주세요: npm install jspdf html2canvas')
  }

  // 모든 요약문 한글 페이지 찾기
  const questionPages = Array.from(document.querySelectorAll('[id^="korean-summary-page-"]'))
    .filter(el => !el.id.includes('answer'))
    .sort((a, b) => {
      const aIdx = parseInt(a.id.replace('korean-summary-page-', ''), 10)
      const bIdx = parseInt(b.id.replace('korean-summary-page-', ''), 10)
      return aIdx - bIdx
    })
  
  const answerPage = document.getElementById('korean-summary-answer-page')

  const pages = [...questionPages]
  if (answerPage) {
    pages.push(answerPage)
  }

  if (pages.length === 0) {
    throw new Error('PDF로 변환할 페이지를 찾을 수 없습니다.')
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // A4 크기 (mm)
  const pageWidth = 210
  const pageHeight = 297

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    
    try {
      // 이미지 로드 대기
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: page.offsetWidth,
        height: page.offsetHeight
      })

      const imgData = canvas.toDataURL('image/png')
      
      // PDF 페이지 크기에 맞게 조정
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * pageWidth) / canvas.width

      // 새 페이지 추가 (첫 페이지 제외)
      if (i > 0) {
        pdf.addPage()
      }

      // 이미지 추가
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
      
    } catch (error) {
      console.error(`페이지 ${i + 1} 변환 중 오류:`, error)
      // 오류가 있어도 계속 진행
    }
  }

  // PDF 저장
  pdf.save('요약문_한글_문제지.pdf')
}

