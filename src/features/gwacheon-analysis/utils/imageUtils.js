// 이미지 유틸리티 함수

// 이미지 리사이즈 (너무 큰 이미지 처리)
export function resizeImage(imageData, maxWidth = 2000, maxHeight = 2000, quality = 0.9) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // 크기 조정 필요 여부 확인
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      
      // JPEG로 변환하여 파일 크기 줄이기
      const resizedImage = canvas.toDataURL('image/jpeg', quality);
      resolve(resizedImage);
    };
    img.onerror = () => resolve(imageData); // 오류 시 원본 반환
    img.src = imageData;
  });
}

// base64 이미지 크기 확인 (MB 단위)
export function getImageSizeMB(imageData) {
  if (!imageData) return 0;
  // base64 데이터 크기 계산 (약 4/3 비율)
  const base64Length = imageData.length - (imageData.indexOf(',') + 1);
  const sizeInBytes = (base64Length * 3) / 4;
  return sizeInBytes / (1024 * 1024); // MB로 변환
}

// base64 형식 검증
export function validateBase64Image(imageData) {
  if (!imageData) return false;
  // data:image 형식인지 확인
  return imageData.startsWith('data:image/');
}









