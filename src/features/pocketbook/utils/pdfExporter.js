// PDF 내보내기 유틸리티

let jsPDF, html2canvas

// 동적 import로 변경 (패키지가 없을 경우를 대비)
async function loadPdfLibraries() {
  try {
    if (!jsPDF) {
      const jsPDFModule = await import('jspdf')
      // jspdf 2.x는 default export 사용
      jsPDF = jsPDFModule.default
      if (!jsPDF) {
        throw new Error('jspdf 모듈을 찾을 수 없습니다. 패키지가 제대로 설치되었는지 확인해주세요.')
      }
    }
    if (!html2canvas) {
      const html2canvasModule = await import('html2canvas')
      // html2canvas는 default export 사용
      html2canvas = html2canvasModule.default
      if (!html2canvas) {
        throw new Error('html2canvas 모듈을 찾을 수 없습니다. 패키지가 제대로 설치되었는지 확인해주세요.')
      }
    }
  } catch (error) {
    console.error('PDF 라이브러리 로드 오류:', error)
    // 더 자세한 오류 정보 제공
    if (error.message && error.message.includes('Failed to fetch')) {
      throw new Error('PDF 라이브러리를 로드할 수 없습니다. 개발 서버를 재시작해주세요.')
    }
    throw error
  }
}

export async function exportToPdf(selectedIndices = null) {
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

  // 단일 페이지(레거시)와 다중 페이지(id에 인덱스 포함) 모두 지원
  const page1Nodes = Array.from(document.querySelectorAll('[id^="pdf-page-1-"]'))
  const page2Nodes = Array.from(document.querySelectorAll('[id^="pdf-page-2-"]'))
  const legacyPage1 = document.getElementById('pdf-page-1')
  const legacyPage2 = document.getElementById('pdf-page-2')

  let pages = []
  if (page1Nodes.length > 0 || page2Nodes.length > 0) {
    // 다중 페이지: 인덱스 기준으로 정렬 후 1→2 순서로 모두 추가
    const parseIndex = (el, prefix) => {
      const id = el.id || ''
      const idx = id.replace(prefix, '')
      const n = parseInt(idx, 10)
      return isNaN(n) ? 0 : n
    }
    let sorted1 = page1Nodes.sort((a, b) => parseIndex(a, 'pdf-page-1-') - parseIndex(b, 'pdf-page-1-'))
    let sorted2 = page2Nodes.sort((a, b) => parseIndex(a, 'pdf-page-2-') - parseIndex(b, 'pdf-page-2-'))
    
    // 선택한 인덱스가 있으면 필터링
    if (selectedIndices && selectedIndices.length > 0) {
      const selectedSet = new Set(selectedIndices)
      sorted1 = sorted1.filter(el => {
        const idx = parseIndex(el, 'pdf-page-1-')
        return selectedSet.has(idx)
      })
      sorted2 = sorted2.filter(el => {
        const idx = parseIndex(el, 'pdf-page-2-')
        return selectedSet.has(idx)
      })
    }
    
    // 선택된 지문들을 인덱스 순서대로 정렬
    const selectedSet = selectedIndices ? new Set(selectedIndices) : null
    const filteredAndSorted = []
    if (selectedIndices) {
      // 선택한 인덱스 순서대로 정렬
      const sortedIndices = [...selectedIndices].sort((a, b) => a - b)
      for (const idx of sortedIndices) {
        const page1 = sorted1.find(el => parseIndex(el, 'pdf-page-1-') === idx)
        const page2 = sorted2.find(el => parseIndex(el, 'pdf-page-2-') === idx)
        if (page1) filteredAndSorted.push(page1)
        if (page2) filteredAndSorted.push(page2)
      }
      pages = filteredAndSorted
    } else {
      // 선택한 인덱스가 없으면 기존 방식 (모두 저장)
      const maxLen = Math.max(sorted1.length, sorted2.length)
      for (let i = 0; i < maxLen; i++) {
        if (sorted1[i]) pages.push(sorted1[i])
        if (sorted2[i]) pages.push(sorted2[i])
      }
    }
  } else if (legacyPage1 && legacyPage2) {
    // 레거시 2페이지만 있는 경우
    pages = [legacyPage1, legacyPage2]
  }

  if (pages.length === 0) {
    throw new Error('PDF로 변환할 내용을 찾을 수 없습니다.')
  }

  try {
    // A4 가로 사이즈 (mm 단위)
    const pdfWidth = 297 // A4 landscape width in mm
    const pdfHeight = 210 // A4 landscape height in mm

    // PDF 생성 (가로 방향)
    const pdf = new jsPDF('l', 'mm', 'a4')

    // 이미지를 base64로 변환하는 함수 (프록시 사용)
    const convertImageToBase64 = async (img) => {
      return new Promise(async (resolve) => {
        // 이미 이미 base64인 경우
        if (img.src.startsWith('data:')) {
          resolve()
          return
        }

        try {
          // CORS 프록시를 통한 이미지 가져오기 시도
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
          
          // blob을 base64로 변환
          const reader = new FileReader()
          reader.onloadend = () => {
            img.src = reader.result // base64로 교체
            // 이미지가 로드될 때까지 대기
            const checkImg = new Image()
            checkImg.onload = () => resolve()
            checkImg.onerror = () => resolve()
            checkImg.src = reader.result
          }
          reader.onerror = () => {
            console.warn('이미지 변환 실패:', img.src)
            // 직접 fetch 시도
            fetch(img.src, { mode: 'no-cors' })
              .then(res => res.blob())
              .then(blob => {
                const reader2 = new FileReader()
                reader2.onloadend = () => {
                  img.src = reader2.result
                  resolve()
                }
                reader2.readAsDataURL(blob)
              })
              .catch(() => resolve())
          }
          reader.readAsDataURL(blob)
        } catch (error) {
          console.warn('이미지 가져오기 실패:', img.src, error)
          // canvas를 사용한 대체 방법 시도
          try {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            const newImg = new Image()
            
            newImg.crossOrigin = 'anonymous'
            newImg.onload = () => {
              try {
                canvas.width = newImg.naturalWidth
                canvas.height = newImg.naturalHeight
                ctx.drawImage(newImg, 0, 0)
                const dataURL = canvas.toDataURL('image/png')
                img.src = dataURL
                resolve()
              } catch (e) {
                console.warn('Canvas 변환 실패:', e)
                resolve()
              }
            }
            newImg.onerror = () => {
              console.warn('이미지 로드 실패:', img.src)
              resolve()
            }
            newImg.src = img.src
          } catch (e) {
            console.warn('대체 방법 실패:', e)
            resolve()
          }
        }
      })
    }

    // 이미지 로드 및 변환 대기 함수
    const waitForImages = async (element) => {
      const images = element.querySelectorAll('img')
      if (images.length === 0) {
        return
      }
      // CORS 안전을 위해 모든 이미지에 crossOrigin 지정
      images.forEach((img) => {
        try {
          img.crossOrigin = 'anonymous'
        } catch (_) { /* noop */ }
      })
      
      // 모든 이미지를 base64로 변환
      await Promise.all(Array.from(images).map(img => convertImageToBase64(img)))
      
      // 추가 렌더링 대기 (이미지가 DOM에 반영될 시간)
      await new Promise(resolve => setTimeout(resolve, 2500))
    }

    // 모바일 감지
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768)
    const pxToMm = 0.264583 // 1px = 0.264583mm

    let isFirst = true
    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i]
      await waitForImages(pageEl)
      const canvas = await html2canvas(pageEl, {
        scale: isMobile ? 1.5 : 2,
        useCORS: true,          // 외부 이미지 CORS 허용
        allowTaint: true,       // base64 변환된 이미지 허용
        logging: false,
        backgroundColor: '#ffffff',
        width: pageEl.scrollWidth,
        height: pageEl.scrollHeight,
        windowWidth: pageEl.scrollWidth,
        windowHeight: pageEl.scrollHeight,
        imageTimeout: 15000,
        removeContainer: false,
        preserveDrawingBuffer: true
      })
      const imgData = canvas.toDataURL('image/png', 1.0)
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const imgWidthMm = imgWidth * pxToMm
      const imgHeightMm = imgHeight * pxToMm
      const widthRatio = pdfWidth / imgWidthMm
      const heightRatio = pdfHeight / imgHeightMm
      const ratio = Math.min(widthRatio, heightRatio)
      const finalWidth = imgWidthMm * ratio
      const finalHeight = imgHeightMm * ratio
      const xOffset = (pdfWidth - finalWidth) / 2
      const yOffset = (pdfHeight - finalHeight) / 2
      if (!isFirst) {
        pdf.addPage()
      }
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight)
      isFirst = false
    }
    // 파일 저장 (모바일/데스크톱 모두 동일한 방식)
    try {
      // 모든 플랫폼에서 동일한 방식으로 저장
      pdf.save('english-text-summary.pdf')
    } catch (error) {
      // pdf.save()가 실패하면 blob URL 방식으로 시도
      console.warn('pdf.save() 실패, blob URL 방식으로 시도:', error)
      try {
        const pdfBlob = pdf.output('blob')
        const url = URL.createObjectURL(pdfBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'english-text-summary.pdf'
        link.style.display = 'none'
        document.body.appendChild(link)
        
        // iOS Safari 대응: 강제 클릭
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        })
        link.dispatchEvent(clickEvent)
        
        // 약간의 지연 후 정리
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

