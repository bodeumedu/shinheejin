// 지칭서술형 PDF 내보내기 유틸리티

let jsPDF, html2canvas

// 동적 import로 변경 (패키지가 없을 경우를 대비)
async function loadPdfLibraries() {
  try {
    if (!jsPDF) {
      const jsPDFModule = await import('jspdf')
      jsPDF = jsPDFModule.default
      if (!jsPDF) {
        throw new Error('jspdf 모듈을 찾을 수 없습니다. 패키지가 제대로 설치되었는지 확인해주세요.')
      }
    }
    if (!html2canvas) {
      const html2canvasModule = await import('html2canvas')
      html2canvas = html2canvasModule.default
      if (!html2canvas) {
        throw new Error('html2canvas 모듈을 찾을 수 없습니다. 패키지가 제대로 설치되었는지 확인해주세요.')
      }
    }
  } catch (error) {
    console.error('PDF 라이브러리 로드 오류:', error)
    if (error.message && error.message.includes('Failed to fetch')) {
      throw new Error('PDF 라이브러리를 로드할 수 없습니다. 개발 서버를 재시작해주세요.')
    }
    throw error
  }
}

export async function exportReferenceDescriptionToPdf() {
  try {
    // 라이브러리 로드
    await loadPdfLibraries()
    
    // 라이브러리가 제대로 로드되었는지 확인
    if (!jsPDF || !html2canvas) {
      throw new Error('PDF 라이브러리가 제대로 로드되지 않았습니다.')
    }
  } catch (error) {
    console.error('PDF 라이브러리 로드 실패:', error)
    const errorMessage = error.message || '알 수 없는 오류'
    throw new Error(`PDF 라이브러리를 로드할 수 없습니다: ${errorMessage}\n\n패키지 설치: npm install jspdf html2canvas\n개발 서버 재시작이 필요할 수 있습니다.`)
  }

  // 모든 지칭서술형 페이지 찾기
  const pages = Array.from(document.querySelectorAll('[id^="reference-description-page-"]'))
    .sort((a, b) => {
      const aIdx = parseInt(a.id.replace('reference-description-page-', ''), 10)
      const bIdx = parseInt(b.id.replace('reference-description-page-', ''), 10)
      return aIdx - bIdx
    })

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
    const pageEl = pages[i]

    try {
      // html2canvas로 페이지를 캔버스로 변환
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      })

      const imgData = canvas.toDataURL('image/png')

      // PDF에 이미지 추가
      if (i > 0) {
        pdf.addPage()
      }

      // 이미지 크기 계산 (A4 비율 맞춤)
      const imgWidth = pageWidth - 40 // 좌우 여백
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const yPosition = (pageHeight - imgHeight) / 2

      pdf.addImage(imgData, 'PNG', 20, yPosition > 0 ? yPosition : 10, imgWidth, imgHeight)
    } catch (error) {
      console.error(`페이지 ${i + 1} 변환 오류:`, error)
      throw new Error(`페이지 ${i + 1}를 PDF로 변환하는 중 오류가 발생했습니다: ${error.message}`)
    }
  }

  // PDF 저장
  pdf.save('지칭서술형_문제.pdf')
}

