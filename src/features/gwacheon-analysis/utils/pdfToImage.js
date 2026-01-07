// PDF를 이미지로 변환하는 유틸리티

// pdf.js를 동적으로 로드
async function loadPdfJs() {
  if (window.pdfjsLib) {
    return window.pdfjsLib;
  }

  return new Promise((resolve, reject) => {
    // pdf.js가 이미 로드되어 있는지 확인
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }

    // pdf.js 스크립트 로드
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      // Worker 설정
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('PDF.js를 로드할 수 없습니다.'));
      }
    };
    script.onerror = () => {
      reject(new Error('PDF.js 스크립트를 로드할 수 없습니다.'));
    };
    document.head.appendChild(script);
  });
}

// 모든 페이지를 개별 이미지 배열로 반환
export async function convertPdfToImages(file) {
  try {
    // pdf.js 로드
    const pdfjsLib = await loadPdfJs();
    
    // PDF 파일을 ArrayBuffer로 읽기
    const arrayBuffer = await file.arrayBuffer();
    
    // PDF 로드
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // 모든 페이지를 이미지로 변환
    const images = [];
    const numPages = pdf.numPages;
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      
      // 뷰포트 설정 (고해상도)
      const viewport = page.getViewport({ scale: 2.0 });
      
      // Canvas 생성
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // PDF 페이지를 Canvas에 렌더링
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      
      // Canvas를 이미지로 변환
      const imageData = canvas.toDataURL('image/png');
      images.push(imageData);
    }
    
    return images;
  } catch (error) {
    console.error('PDF 변환 오류:', error);
    throw new Error('PDF를 이미지로 변환하는데 실패했습니다: ' + error.message);
  }
}

// 단일 이미지로 합치기 (기존 호환성 유지)
export async function convertPdfToImage(file) {
  const images = await convertPdfToImages(file);
  return images[0]; // 첫 번째 페이지만 반환 (기존 코드 호환성)
}

// PDF 파일인지 확인
export function isPdfFile(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

