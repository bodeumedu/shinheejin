import React, { useState } from 'react';
import './EraseAnnotationsViewer.css';

// Canvas를 사용하여 필기 제거
const removeAnnotationsWithCanvas = async (imageData, annotations) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      
      // 원본 이미지 그리기
      ctx.drawImage(img, 0, 0);
      
      // 각 필기 영역을 흰색으로 덮기
      annotations.forEach(annotation => {
        if (annotation.x !== undefined && annotation.y !== undefined && 
            annotation.width !== undefined && annotation.height !== undefined) {
          // 필기 영역을 흰색으로 덮기
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
        }
      });
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(imageData);
    img.src = imageData;
  });
};

const EraseAnnotationsViewer = ({ pdfPages, pageRotations, onConfirm, onBack, apiKey }) => {
  const [processedPages, setProcessedPages] = useState(pdfPages);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPage, setProcessingPage] = useState(null);
  const [error, setError] = useState('');

  if (!pdfPages || pdfPages.length === 0) {
    return null;
  }

  const eraseAnnotationsFromPage = async (pageData, pageIndex) => {
    try {
      setProcessingPage(pageIndex);
      
      // AI를 사용하여 필기 위치 감지
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `이 시험지 이미지에서 학생이 작성한 모든 필기(펜으로 쓴 글씨, 밑줄, 체크 표시, 답안, 계산 과정 등)의 위치를 정확히 파악해주세요.

필기의 특징:
- 손으로 쓴 글씨 (답안, 계산 등)
- 체크 표시 (O, X, ✓ 등)
- 밑줄
- 낙서나 메모
- 펜이나 연필로 그린 선

유지해야 할 것:
- 인쇄된 문제 텍스트
- 인쇄된 보기
- 인쇄된 그림이나 도표
- 문제 번호

각 필기 영역의 위치를 이미지 좌표로 정확히 제공해주세요. 이미지 크기를 기준으로 픽셀 좌표를 사용하세요.
JSON 형식으로 응답해주세요:
{
  "annotations": [
    {
      "type": "handwriting" | "underline" | "checkmark" | "answer",
      "x": 시작 x 좌표,
      "y": 시작 y 좌표,
      "width": 너비,
      "height": 높이,
      "description": "필기 설명"
    }
  ]
}

필기가 없으면 빈 배열을 반환하세요.`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: pageData
                  }
                }
              ]
            }
          ],
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`필기 감지 실패: ${response.status}`);
      }

      const data = await response.json();
      const jsonText = data.choices[0].message.content.trim();
      
      let annotationData;
      try {
        annotationData = JSON.parse(jsonText);
      } catch (e) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          annotationData = JSON.parse(jsonMatch[0]);
        } else {
          // 필기 감지 실패 시 원본 반환
          return pageData;
        }
      }

      // 필기가 없으면 원본 반환
      if (!annotationData.annotations || annotationData.annotations.length === 0) {
        return pageData;
      }

      // Canvas를 사용하여 필기 제거
      return await removeAnnotationsWithCanvas(pageData, annotationData.annotations);
    } catch (error) {
      console.error(`페이지 ${pageIndex + 1} 필기 제거 오류:`, error);
      return pageData; // 오류 시 원본 반환
    } finally {
      setProcessingPage(null);
    }
  };

  const handleEraseAnnotations = async () => {
    if (!apiKey) {
      setError('API 키를 먼저 설정해주세요.');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      // 각 페이지의 필기 제거
      const cleanedPages = [];
      for (let i = 0; i < pdfPages.length; i++) {
        const cleanedPage = await eraseAnnotationsFromPage(pdfPages[i], i);
        cleanedPages.push(cleanedPage);
      }

      setProcessedPages(cleanedPages);
      onConfirm(cleanedPages);
    } catch (error) {
      console.error('필기 제거 오류:', error);
      setError('필기 제거 중 오류가 발생했습니다: ' + error.message);
      // 오류 시 원본 사용
      onConfirm(pdfPages);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="erase-annotations-viewer">
      <div className="viewer-header">
        <h2>필기 제거 확인</h2>
        <p>각 페이지의 필기를 확인하고 제거할 수 있습니다.</p>
        <p className="info-text">현재는 원본 이미지를 그대로 사용합니다. 필기 제거 기능은 추후 추가 예정입니다.</p>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="pages-preview">
        {pdfPages.map((pageData, index) => {
          const rotation = pageRotations[index] || 0;
          const isProcessed = processedPages[index] && processedPages[index] !== pageData;
          return (
            <div key={index} className="page-preview-item">
              <div className="page-preview-header">
                <span className="page-number">페이지 {index + 1}</span>
                {processingPage === index && (
                  <span className="processing-badge">처리 중...</span>
                )}
                {isProcessed && processingPage !== index && (
                  <span className="processed-badge">필기 제거됨</span>
                )}
              </div>
              <div className="page-preview-image">
                <img
                  src={isProcessed ? processedPages[index] : pageData}
                  alt={`페이지 ${index + 1}`}
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    maxWidth: '100%',
                    height: 'auto',
                    display: 'block',
                    margin: '0 auto'
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="viewer-actions">
        <button className="btn-back" onClick={onBack}>
          뒤로 가기
        </button>
        <button 
          className="btn-confirm" 
          onClick={handleEraseAnnotations}
          disabled={isProcessing}
        >
          {isProcessing ? '처리 중...' : '확인하고 다음 단계로'}
        </button>
      </div>
    </div>
  );
};

export default EraseAnnotationsViewer;

