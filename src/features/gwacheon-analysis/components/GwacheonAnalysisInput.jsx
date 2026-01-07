import React, { useState, useRef, useEffect } from 'react';
import './GwacheonAnalysisInput.css';
import { convertPdfToImages, isPdfFile } from '../utils/pdfToImage';
import { detectAndRotateImage, rotateImage } from '../utils/imageOrientation';
import { extractTextFromImage } from '../utils/ocrExtractor';

// 이미지가 세로 방향(B4)인지 확인하고, 가로면 90도 회전
const ensurePortraitOrientation = async (imageData) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      
      console.log(`이미지 크기: ${width} x ${height}`);
      
      // 가로(landscape)면 90도 회전하여 세로(portrait)로 만들기
      if (width > height) {
        console.log('가로 방향 감지 → 90도 회전하여 세로로 변환');
        try {
          const rotated = await rotateImage(imageData, 90);
          resolve(rotated);
        } catch (error) {
          console.error('세로 변환 오류:', error);
          resolve(imageData); // 실패 시 원본 반환
        }
      } else {
        console.log('이미 세로 방향');
        resolve(imageData);
      }
    };
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = imageData;
  });
};

const GwacheonAnalysisInput = ({ apiKey }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [pdfPages, setPdfPages] = useState([]); // PDF 모든 페이지 이미지 배열 (회전 후)
  const [ocrResults, setOcrResults] = useState([]); // 각 페이지의 OCR 결과 [{page: 1, image: '...', text: '...'}, ...]
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setError('');
    setOcrResults([]);
    
    // PDF 파일만 허용
    if (!isPdfFile(file)) {
      setError('PDF 파일만 업로드 가능합니다.');
      return;
    }

    try {
      setIsConvertingPdf(true);
      // PDF를 이미지 배열로 변환
      const imageDataArray = await convertPdfToImages(file);
      
      if (imageDataArray.length === 0) {
        throw new Error('PDF에서 이미지를 추출할 수 없습니다.');
      }

      // 모든 페이지에 대해 회전 처리 (API 키가 있으면)
      const rotatedPages = [];
      if (apiKey) {
        setIsRotating(true);
        setError('');
        console.log('📄 모든 페이지 방향 감지 및 회전 중...');
        
        for (let i = 0; i < imageDataArray.length; i++) {
          try {
            const pageNumber = i + 1;
            console.log(`페이지 ${pageNumber}/${imageDataArray.length} 처리 중...`);
            
            let imageToProcess = imageDataArray[i];
            
            // 모든 페이지에 대해 "공통영어2" 감지 회전 수행
            if (apiKey) {
              console.log(`페이지 ${pageNumber} → "공통영어2" 감지 회전 수행`);
              const { rotatedImage, rotation } = await detectAndRotateImage(imageDataArray[i], apiKey);
              imageToProcess = rotatedImage;
              if (rotation !== 0) {
                console.log(`페이지 ${pageNumber}: ${rotation}도 회전됨 (공통영어2 기준)`);
              }
            }
            
            // 추가: 세로 방향(B4)으로 만들기 - 가로면 90도 회전
            let portraitImage = await ensurePortraitOrientation(imageToProcess);
            
            // 홀수 페이지만 추가로 180도 회전
            if (pageNumber % 2 === 1) {
              console.log(`페이지 ${pageNumber}는 홀수 페이지 → 180도 추가 회전`);
              portraitImage = await rotateImage(portraitImage, 180);
            } else {
              console.log(`페이지 ${pageNumber}는 짝수 페이지 → 180도 추가 회전 없음 (이미 올바른 방향)`);
            }
            
            rotatedPages.push(portraitImage);
          } catch (rotationError) {
            console.error(`페이지 ${i + 1} 회전 오류:`, rotationError);
            // 회전 실패 시에도 세로 방향 확인
            try {
              let finalImage = await ensurePortraitOrientation(imageDataArray[i]);
              
              // 홀수 페이지만 추가로 180도 회전
              const pageNumber = i + 1;
              if (pageNumber % 2 === 1) {
                console.log(`페이지 ${pageNumber}는 홀수 페이지 → 180도 추가 회전`);
                finalImage = await rotateImage(finalImage, 180);
              }
              
              rotatedPages.push(finalImage);
            } catch (e) {
              rotatedPages.push(imageDataArray[i]); // 최종 실패 시 원본 사용
            }
          }
        }
        setIsRotating(false);
      } else {
        // API 키가 없어도 세로 방향으로 만들기
        console.log('⚠️ API 키가 없어 방향 감지는 건너뜁니다. 세로 방향으로 변환 중...');
        for (let i = 0; i < imageDataArray.length; i++) {
          try {
            const pageNumber = i + 1;
            let finalImage = await ensurePortraitOrientation(imageDataArray[i]);
            
            // 홀수 페이지는 추가로 180도 회전
            if (pageNumber % 2 === 1) {
              console.log(`페이지 ${pageNumber}는 홀수 페이지 → 180도 추가 회전`);
              finalImage = await rotateImage(finalImage, 180);
            }
            
            rotatedPages.push(finalImage);
          } catch (e) {
            rotatedPages.push(imageDataArray[i]); // 실패 시 원본 사용
          }
        }
      }
      
      setPdfPages(rotatedPages);
      setIsConvertingPdf(false);
    } catch (error) {
      console.error('PDF 처리 오류:', error);
      setError('PDF를 처리하는데 실패했습니다: ' + error.message);
      setIsConvertingPdf(false);
      setIsRotating(false);
    }
  };

  const handleExtractAllPages = async () => {
    if (!pdfPages || pdfPages.length === 0) {
      setError('PDF를 먼저 업로드해주세요.');
      return;
    }

    if (!apiKey) {
      setError('API 키를 먼저 설정해주세요.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setOcrResults([]);

    try {
      const results = [];
      
      for (let i = 0; i < pdfPages.length; i++) {
        console.log(`페이지 ${i + 1}/${pdfPages.length} OCR 처리 중...`);
        
        try {
          // OCR로 텍스트 추출
          const text = await extractTextFromImage(pdfPages[i], apiKey);
          console.log(`페이지 ${i + 1} 텍스트 추출 완료`);
          
          results.push({
            page: i + 1,
            image: pdfPages[i],
            text: text
          });
        } catch (ocrError) {
          console.error(`페이지 ${i + 1} OCR 오류:`, ocrError);
          results.push({
            page: i + 1,
            image: pdfPages[i],
            text: `OCR 오류: ${ocrError.message}`
          });
        }
      }
      
      setOcrResults(results);
      setIsProcessing(false);
      console.log('모든 페이지 OCR 완료');
      console.log('OCR 결과:', results);
      console.log('OCR 결과 개수:', results.length);
    } catch (error) {
      console.error('OCR 처리 오류:', error);
      setError('OCR 처리 중 오류가 발생했습니다: ' + error.message);
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPdfPages([]);
    setOcrResults([]);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="gwacheon-analysis-input">
      <div className="input-container">
        <h2>과천중앙고 1학년 내신 분석</h2>
        
        <div className="file-upload-section">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn-upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing || isConvertingPdf}
          >
            {isConvertingPdf ? 'PDF 변환 중...' : 'PDF 업로드'}
          </button>
        </div>

        {pdfPages.length > 0 && (
          <div className="preview-section">
            <h3>PDF 페이지 미리보기 ({pdfPages.length}페이지) {isRotating && '(회전 중...)'}</h3>
            
            {/* PDF 페이지 미리보기 */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
              gap: '20px',
              marginBottom: '30px',
              marginTop: '20px'
            }}>
              {pdfPages.map((pageImage, index) => (
                <div key={index} style={{
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  padding: '10px',
                  backgroundColor: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ 
                    textAlign: 'center', 
                    marginBottom: '10px', 
                    fontWeight: 'bold',
                    fontSize: '16px',
                    color: '#333'
                  }}>
                    페이지 {index + 1}
                  </div>
                  <img 
                    src={pageImage} 
                    alt={`페이지 ${index + 1}`}
                    style={{ 
                      maxWidth: '100%', 
                      height: 'auto',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      display: 'block',
                      margin: '0 auto'
                    }} 
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-extract"
              onClick={handleExtractAllPages}
              disabled={isProcessing || !apiKey || isRotating}
              style={{ marginBottom: '20px', padding: '12px 24px', fontSize: '16px' }}
            >
              {isProcessing ? `OCR 처리 중... (${ocrResults.length}/${pdfPages.length})` : '전체 페이지 OCR 처리하기'}
            </button>
          </div>
        )}

        {ocrResults.length > 0 && (
          <div className="ocr-results-section" style={{ marginTop: '30px' }}>
            <h3>OCR 결과 ({ocrResults.length}페이지)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '10px', border: '1px solid #ddd', width: '50%' }}>페이지 이미지</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd', width: '50%' }}>추출된 텍스트</th>
                </tr>
              </thead>
              <tbody>
                {ocrResults.map((result, index) => (
                  <tr key={index}>
                    <td style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' }}>
                      <div style={{ textAlign: 'center', marginBottom: '10px', fontWeight: 'bold' }}>
                        페이지 {result.page}
                      </div>
                      <img 
                        src={result.image} 
                        alt={`페이지 ${result.page}`}
                        style={{ 
                          maxWidth: '100%', 
                          height: 'auto',
                          border: '1px solid #ccc',
                          borderRadius: '4px'
                        }} 
                      />
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #ddd', verticalAlign: 'top' }}>
                      <div style={{ 
                        whiteSpace: 'pre-wrap', 
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        maxHeight: '600px',
                        overflowY: 'auto',
                        padding: '10px',
                        backgroundColor: '#f9f9f9',
                        borderRadius: '4px'
                      }}>
                        {result.text}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn-reset"
            onClick={handleReset}
            disabled={isProcessing || isConvertingPdf}
          >
            초기화
          </button>
        </div>
      </div>
    </div>
  );
};

export default GwacheonAnalysisInput;
