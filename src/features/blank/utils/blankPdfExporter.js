// 빈칸 PDF 내보내기 유틸리티

let jsPDF, html2canvas

// 동적 import로 변경
async function loadPdfLibraries() {
  if (!jsPDF) {
    jsPDF = (await import('jspdf')).default
  }
  if (!html2canvas) {
    html2canvas = (await import('html2canvas')).default
  }
}

export async function exportBlankToPdf(selectedIndices = null) {
  try {
    // 라이브러리 로드
    await loadPdfLibraries()
  } catch (error) {
    throw new Error('PDF 라이브러리를 로드할 수 없습니다. 패키지를 설치해주세요: npm install jspdf html2canvas')
  }

  // 선택된 인덱스가 있으면 해당 항목만 필터링, 없으면 모두 포함
  let blankPageGroups = Array.from(document.querySelectorAll('[id^="blank-page-group-"]'))
  let answerPages = Array.from(document.querySelectorAll('[id^="answer-page-"]'))
  
  if (selectedIndices && selectedIndices.length > 0) {
    // 선택된 인덱스에 해당하는 페이지만 필터링
    // blank-page-group ID에서 인덱스 추출 (예: "blank-page-group-0" -> 0)
    blankPageGroups = blankPageGroups.filter((group) => {
      const idMatch = group.id.match(/blank-page-group-(\d+)(?:-copy)?$/)
      if (idMatch) {
        const groupIndex = parseInt(idMatch[1])
        // 원본만 필터링 (복사본은 자동 포함)
        return !group.id.includes('-copy') && selectedIndices.includes(groupIndex)
      }
      return false
    })
    // 복사본도 포함
    const copyGroups = Array.from(document.querySelectorAll('[id^="blank-page-group-"][id$="-copy"]')).filter((group) => {
      const idMatch = group.id.match(/blank-page-group-(\d+)-copy$/)
      if (idMatch) {
        const groupIndex = parseInt(idMatch[1])
        return selectedIndices.includes(groupIndex)
      }
      return false
    })
    blankPageGroups = [...blankPageGroups, ...copyGroups]
    
    // 답지 페이지 필터링 (ID에서 인덱스 추출)
    answerPages = answerPages.filter((page) => {
      const idMatch = page.id.match(/answer-page-(\d+)$/)
      if (idMatch) {
        const pageIndex = parseInt(idMatch[1])
        return selectedIndices.includes(pageIndex)
      }
      return false
    })
  }
  
  if (blankPageGroups.length === 0 && answerPages.length === 0) {
    throw new Error('PDF로 변환할 내용을 찾을 수 없습니다.')
  }

  try {
    // A4 세로 사이즈 (mm 단위)
    const pdfWidth = 210 // A4 portrait width in mm
    const pdfHeight = 297 // A4 portrait height in mm

    // PDF 생성 (세로 방향)
    const pdf = new jsPDF('p', 'mm', 'a4')

    // 이미지를 base64로 변환하는 함수 (프록시 사용)
    const convertImageToBase64 = async (img) => {
      return new Promise(async (resolve) => {
        if (img.src.startsWith('data:')) {
          resolve()
          return
        }

        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(img.src)}`
          
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'image/*'
            }
          })
          
          if (!response.ok) {
            throw new Error('프록시를 통한 이미지 로드 실패')
          }
          
          const blob = await response.blob()
          const reader = new FileReader()
          reader.onloadend = () => {
            img.src = reader.result
            const checkImg = new Image()
            checkImg.onload = () => resolve()
            checkImg.onerror = () => resolve()
            checkImg.src = reader.result
          }
          reader.onerror = () => {
            console.warn('이미지 변환 실패:', img.src)
            resolve()
          }
          reader.readAsDataURL(blob)
        } catch (error) {
          console.warn('이미지 가져오기 실패:', img.src, error)
          resolve()
        }
      })
    }

    // 이미지 로드 및 변환 대기 함수
    const waitForImages = async (element) => {
      const images = element.querySelectorAll('img')
      if (images.length === 0) {
        return
      }
      
      await Promise.all(Array.from(images).map(img => convertImageToBase64(img)))
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // 모바일 감지
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768)
    
    // 페이지를 순서대로 처리하는 함수
    const processPage = async (pageElement, isFirstPage) => {
      // 이미지 로드 대기
      await waitForImages(pageElement)
      
      // 페이지 변환
      const canvas = await html2canvas(pageElement, {
        scale: isMobile ? 1.5 : 2,
        useCORS: false,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        width: pageElement.scrollWidth,
        height: pageElement.scrollHeight,
        windowWidth: pageElement.scrollWidth,
        windowHeight: pageElement.scrollHeight,
        imageTimeout: 15000,
        removeContainer: false,
        preserveDrawingBuffer: true
      })

      const imgData = canvas.toDataURL('image/png', 1.0)
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      
      // 페이지 전체를 채우도록 비율 계산 (비율 유지)
      const pxToMm = 0.264583
      const imgWidthMm = imgWidth * pxToMm
      const imgHeightMm = imgHeight * pxToMm
      
      // 비율을 유지하면서 페이지에 맞추기
      const widthRatio = pdfWidth / imgWidthMm
      const heightRatio = pdfHeight / imgHeightMm
      const ratio = Math.min(widthRatio, heightRatio)
      
      const finalWidth = imgWidthMm * ratio
      const finalHeight = imgHeightMm * ratio
      
      // 중앙 정렬
      const xOffset = (pdfWidth - finalWidth) / 2
      const yOffset = (pdfHeight - finalHeight) / 2

      // 첫 페이지가 아니면 새 페이지 추가
      if (!isFirstPage) {
        pdf.addPage()
      }
      
      // 페이지 추가
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight)
    }

    // 페이지 정렬 함수
    const sortPages = (pages, prefix) => {
      return Array.from(pages).sort((a, b) => {
        const aNum = a.id.replace(prefix, '') || '0'
        const bNum = b.id.replace(prefix, '') || '0'
        const aIndex = parseInt(aNum) || 0
        const bIndex = parseInt(bNum) || 0
        return aIndex - bIndex
      })
    }

    const sortedBlankPageGroups = sortPages(blankPageGroups, 'blank-page-group-')
    const sortedAnswerPages = sortPages(answerPages, 'answer-page-')
    
    // 모든 빈칸 페이지 그룹을 순서대로 처리
    let isFirst = true
    
    for (let i = 0; i < sortedBlankPageGroups.length; i++) {
      if (sortedBlankPageGroups[i]) {
        await processPage(sortedBlankPageGroups[i], isFirst)
        isFirst = false
      }
    }
    
    // 모든 답지 페이지를 마지막에 처리 (한꺼번에)
    for (let i = 0; i < sortedAnswerPages.length; i++) {
      if (sortedAnswerPages[i]) {
        await processPage(sortedAnswerPages[i], isFirst)
        isFirst = false
      }
    }

    // 파일 저장
    try {
      pdf.save('blank-exercise.pdf')
    } catch (error) {
      console.warn('pdf.save() 실패, blob URL 방식으로 시도:', error)
      try {
        const pdfBlob = pdf.output('blob')
        const url = URL.createObjectURL(pdfBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'blank-exercise.pdf'
        link.style.display = 'none'
        document.body.appendChild(link)
        
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        })
        link.dispatchEvent(clickEvent)
        
        setTimeout(() => {
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
        }, 100)
      } catch (blobError) {
        console.error('blob URL 방식도 실패:', blobError)
        throw new Error('PDF 저장에 실패했습니다. 브라우저를 확인해주세요.')
      }
    }
  } catch (error) {
    console.error('PDF 생성 오류:', error)
    if (error.message.includes('라이브러리')) {
      throw error
    }
    throw new Error('PDF 생성 중 오류가 발생했습니다: ' + error.message)
  }
}

