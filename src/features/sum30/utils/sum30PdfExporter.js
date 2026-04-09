// SUM30 PDF 내보내기 유틸리티

import { addCanvasAcrossPdfPages } from '../../../utils/addCanvasAcrossPdfPages'
import { capturePdfPageWithAdaptiveEnglish } from '../../../utils/pdfAdaptiveEnglishBody'

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

export async function exportSum30ToPdf(options = {}) {
  try {
    // 라이브러리 로드
    await loadPdfLibraries()
  } catch (error) {
    throw new Error('PDF 라이브러리를 로드할 수 없습니다. 패키지를 설치해주세요: npm install jspdf html2canvas')
  }

  // 모든 SUM30 페이지 찾기
  const questionPages = Array.from(document.querySelectorAll('[id^="sum30-page-"]'))
    .filter(el => !el.id.includes('answer'))
    .sort((a, b) => {
      const aIdx = parseInt(a.id.replace('sum30-page-', ''), 10)
      const bIdx = parseInt(b.id.replace('sum30-page-', ''), 10)
      return aIdx - bIdx
    })
  
  const answerPages = Array.from(document.querySelectorAll('[id^="sum30-answer-page-"]'))
    .sort((a, b) => {
      const aIdx = parseInt(a.id.replace('sum30-answer-page-', ''), 10)
      const bIdx = parseInt(b.id.replace('sum30-answer-page-', ''), 10)
      return aIdx - bIdx
    })

  const pages = [...questionPages]
  if (answerPages.length > 0) {
    pages.push(...answerPages)
  }

  if (pages.length === 0) {
    throw new Error('PDF로 변환할 페이지를 찾을 수 없습니다.')
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = 210
  const pageHeight = 297

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 500))

      const baseOpts = {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: page.offsetWidth,
        height: page.offsetHeight,
      }

      const { canvas, restore } = await capturePdfPageWithAdaptiveEnglish(page, html2canvas, baseOpts, {
        pageWidthMm: pageWidth,
        pageHeightMm: pageHeight,
      })

      try {
        if (i > 0) {
          pdf.addPage()
        }
        addCanvasAcrossPdfPages(pdf, canvas, { pageWidthMm: pageWidth, pageHeightMm: pageHeight })
      } finally {
        restore()
      }
    } catch (error) {
      console.error(`페이지 ${i + 1} 변환 중 오류:`, error)
      // 오류가 있어도 계속 진행
    }
  }

  // PDF 저장
  pdf.save(options.filename || 'SUM30_문제지.pdf')
}



