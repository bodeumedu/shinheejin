import React, { useState, useRef, useEffect } from 'react';
import SourcePopup from './SourcePopup';
import KoreanTranslationPopup from './KoreanTranslationPopup';
import './OcrInput.css';

const OcrInput = ({ apiKey }) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [formattedText, setFormattedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showSourcePopup, setShowSourcePopup] = useState(false);
  const [showKoreanPopup, setShowKoreanPopup] = useState(false);
  const [currentSource, setCurrentSource] = useState('');
  const [currentEnglishText, setCurrentEnglishText] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const pasteAreaRef = useRef(null);

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
      setError('');
    }
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  // 클립보드에서 이미지 붙여넣기 처리
  const handlePaste = async (event) => {
    event.preventDefault();
    const items = event.clipboardData?.items;
    
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          setSelectedImage(file);
          const reader = new FileReader();
          reader.onload = (e) => {
            setImagePreview(e.target.result);
          };
          reader.readAsDataURL(file);
          setError('');
          break;
        }
      }
    }
  };

  // 전역 붙여넣기 이벤트 처리
  const handleGlobalPaste = async (event) => {
    // 팝업이 열려있으면 붙여넣기 무시
    if (showSourcePopup || showKoreanPopup) return;
    
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.type.indexOf('image') !== -1) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setSelectedImage(file);
          const reader = new FileReader();
          reader.onload = (e) => {
            setImagePreview(e.target.result);
          };
          reader.readAsDataURL(file);
          setError('');
          break;
        }
      }
    }
  };

  // 컴포넌트 마운트 시 이벤트 리스너 추가
  useEffect(() => {
    // 전역 paste 이벤트 리스너 추가
    document.addEventListener('paste', handleGlobalPaste);
    
    return () => {
      document.removeEventListener('paste', handleGlobalPaste);
    };
  }, [showSourcePopup, showKoreanPopup]);

  const extractTextFromImage = async () => {
    if (!selectedImage || !apiKey) {
      setError('이미지와 API 키가 필요합니다.');
      return;
    }

    // 먼저 출처 입력 팝업 표시
    setShowSourcePopup(true);
  };

  const handleSourceConfirm = async (source) => {
    setCurrentSource(source);
    setShowSourcePopup(false);
    
    // 실제 OCR 처리 시작
    setIsProcessing(true);
    setError('');

    try {
      // Convert image to base64
      const base64Image = await convertToBase64(selectedImage);
      
      // Use OpenAI Vision API to extract text
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
                  text: '이미지에서 텍스트를 정확히 추출해주세요. 영어와 한국어 텍스트를 모두 인식하고, 원본 텍스트의 줄바꿈과 구조를 최대한 보존해주세요. 텍스트만 출력하고 다른 설명은 하지 마세요.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: base64Image
                  }
                }
              ]
            }
          ],
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`API 요청 실패: ${response.status}`);
      }

      const data = await response.json();
      const extractedText = data.choices[0].message.content.trim();
      setExtractedText(extractedText);
      
      // 18번 문제 유형 확인 및 처리
      await processExtractedText(extractedText, source);

    } catch (error) {
      console.error('텍스트 추출 오류:', error);
      setError('텍스트 추출 중 오류가 발생했습니다: ' + error.message);
      setIsProcessing(false);
    }
  };

  // 18번 문제 유형 확인 및 처리
  const processExtractedText = async (text, source) => {
    try {
      // 도표 포함 여부 확인 (25번 도표 문제 제외)
      const hasChart = await checkChartIncluded(text);
      if (hasChart) {
        setError('도표가 포함된 문제는 처리하지 않습니다. (25번 도표 문제 제외)');
        setIsProcessing(false);
        return;
      }

      // 27번, 28번 문제 확인 (안내문 그림 포함 문제 제외)
      const isExcludedQuestion = await checkExcludedQuestion(text);
      if (isExcludedQuestion) {
        setError('안내문 그림이 포함된 문제는 처리하지 않습니다. (27번, 28번 문제 제외)');
        setIsProcessing(false);
        return;
      }

      // 18번~26번 문제 유형인지 확인
      const isSpecialType = await checkSpecialQuestionType(text);
      
      let englishText = text;
      
        if (isSpecialType) {
        // 18번~26번 유형이면 보기 제거하고 영어 텍스트만 추출
        englishText = await extractSpecialQuestionText(text);
      } else {
        // 일반적인 영어 텍스트 추출
        englishText = await extractEnglishText(text);
      }
      
      setCurrentEnglishText(englishText);
      
      // 한글 해석 확인
      const hasKorean = await checkKoreanTranslation(text);
      
      if (hasKorean) {
        // 한글이 있으면 바로 포맷팅
        const koreanText = await extractKoreanText(text);
        await finalizeFormatting(source, englishText, koreanText);
      } else {
        // 한글이 없으면 팝업 표시
        setShowKoreanPopup(true);
      }
      
    } catch (error) {
      console.error('텍스트 처리 오류:', error);
      setError('텍스트 처리 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 27번, 28번 문제 확인 (안내문 그림 포함)
  const checkExcludedQuestion = async (text) => {
    try {
      // 먼저 텍스트에서 27번, 28번 패턴 확인
      const has27or28 = /27\s*번|28\s*번|27\.|28\./i.test(text);
      if (has27or28) {
        return true;
      }

      // AI로 안내문 그림 포함 여부 확인
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
              content: `다음 텍스트가 27번 또는 28번 문제이거나, 안내문 그림이 포함된 문제인지 확인해주세요:

${text}

27번, 28번 문제의 특징:
1. 안내문, 공지사항, 안내 그림이 포함됨
2. "notice", "announcement", "information", "guide", "instruction" 등의 단어가 포함될 수 있음
3. 그림이나 이미지가 텍스트와 함께 설명됨
4. 실용적인 안내나 공지 형식

"YES" 또는 "NO"로만 답변해주세요.`
            }
          ],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        throw new Error(`제외 문제 확인 실패: ${response.status}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content.trim().toUpperCase();
      return result === 'YES';
    } catch (error) {
      console.error('제외 문제 확인 오류:', error);
      return false; // 오류 시 처리 계속 진행
    }
  };

  // 도표 포함 여부 확인
  const checkChartIncluded = async (text) => {
    try {
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
              content: `다음 텍스트에 도표, 그래프, 차트, 표가 포함되어 있는지 확인해주세요:

${text}

도표/그래프/차트/표의 특징:
1. 막대 그래프 (bar chart), 선 그래프 (line graph), 원 그래프 (pie chart) 등
2. 표 (table) 형태의 데이터
3. "graph", "chart", "table", "bar", "percentage", "axis", "legend" 등의 단어가 포함될 수 있음
4. 숫자 데이터와 함께 시각적 표현이 언급됨
5. "The above graph", "The chart shows", "According to the table" 등의 표현

"YES" 또는 "NO"로만 답변해주세요.`
            }
          ],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        throw new Error(`도표 확인 실패: ${response.status}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content.trim().toUpperCase();
      return result === 'YES';
    } catch (error) {
      console.error('도표 확인 오류:', error);
      return false; // 오류 시 처리 계속 진행
    }
  };

  // 18번~26번 문제 유형 확인
  const checkSpecialQuestionType = async (text) => {
    try {
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
              content: `다음 텍스트가 18번~26번 문제 유형인지 확인해주세요:

${text}

18번 유형의 특징:
1. 편지나 이메일 형식 (Dear, Hi, Hello 등으로 시작)
2. 목적을 묻는 문제 (글의 목적, 글쓴이의 의도 등)

19번 유형의 특징:
1. 일반적인 영어 지문 (소설, 에세이 등)
2. 심경이나 분위기를 묻는 문제
3. 등장인물의 감정 상태나 상황의 분위기 파악

20번 유형의 특징:
1. 일반적인 영어 지문 (에세이, 설명문 등)
2. 글의 주장이나 요지를 묻는 문제
3. 글쓴이의 주요 논점이나 핵심 메시지 파악

21번 유형의 특징:
1. 일반적인 영어 지문 (에세이, 설명문 등)
2. 추론 문제 (글에서 추론할 수 있는 내용)
3. 밑줄 친 부분이 있을 수 있음
4. 글의 내용을 바탕으로 한 논리적 추론

22번 유형의 특징:
1. 일반적인 영어 지문 (에세이, 설명문 등)
2. 글의 요지를 묻는 문제
3. 글의 핵심 내용이나 중심 생각 파악

23번 유형의 특징:
1. 일반적인 영어 지문 (에세이, 설명문 등)
2. 글의 주제를 묻는 문제
3. 글의 전체적인 화제나 소재 파악

24번 유형의 특징:
1. 일반적인 영어 지문 (에세이, 설명문 등)
2. 글의 제목을 묻는 문제
3. 글의 내용을 가장 잘 나타내는 제목 선택

26번 유형의 특징:
1. 일반적인 영어 지문 (에세이, 설명문 등)
2. 보기가 있는 문제
3. 제시문과 보기를 구분해야 함

공통점:
- 보기가 있음 (①, ②, ③, ④, ⑤)
- 문항 번호가 있을 수 있음 (18번~26번 등, 25번 도표 제외)
- 제시문과 보기를 구분해야 함

"YES" 또는 "NO"로만 답변해주세요.`
            }
          ],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        throw new Error(`특수 문제 유형 확인 실패: ${response.status}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content.trim().toUpperCase();
      return result === 'YES';
    } catch (error) {
      console.error('특수 문제 유형 확인 오류:', error);
      return false;
    }
  };

  // 18번~26번 유형 영어 텍스트 추출 (보기 제거)
  const extractSpecialQuestionText = async (text) => {
    try {
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
              content: `다음 텍스트에서 보기(①, ②, ③, ④, ⑤)를 제거하고 제시문만 추출해주세요:

${text}

규칙:
1. 문항 번호(18번~26번 등, 25번 제외)는 제거
2. 문제 설명 부분 제거 (예: "다음 글의 목적으로 가장 적절한 것은?", "다음 글에 드러난 'I'의 심경 변화로 가장 적절한 것은?", "다음 글에서 필자가 주장하는 바로 가장 적절한 것은?", "다음 글의 요지로 가장 적절한 것은?", "다음 글에서 추론할 수 있는 것은?", "다음 글의 주제로 가장 적절한 것은?", "다음 글의 제목으로 가장 적절한 것은?" 등)
3. 보기(①~⑤)와 선택지들은 모두 제거
4. 영어 제시문(본문)만 그대로 유지
5. 줄바꿈과 구조는 원본 그대로 보존
6. 밑줄 친 부분이 있다면 그대로 유지

18번 유형: 편지/이메일 본문만 추출
19번 유형: 심경/분위기 관련 영어 지문만 추출
20번 유형: 주장/요지 관련 영어 지문만 추출
21번 유형: 추론 관련 영어 지문만 추출 (밑줄 포함)
22번 유형: 요지 관련 영어 지문만 추출
23번 유형: 주제 관련 영어 지문만 추출
24번 유형: 제목 관련 영어 지문만 추출
26번 유형: 보기 제거 후 영어 지문만 추출

영어 제시문만 출력해주세요:`
            }
          ],
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`특수 문제 텍스트 추출 실패: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('특수 문제 텍스트 추출 오류:', error);
      return text; // 실패시 원본 반환
    }
  };

  // 일반 영어 텍스트 추출
  const extractEnglishText = async (text) => {
    try {
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
              content: `다음 텍스트에서 영어 부분만 추출해주세요:

${text}

영어 텍스트만 출력하고, 줄바꿈과 구조는 원본 그대로 보존해주세요.`
            }
          ],
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`영어 텍스트 추출 실패: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('영어 텍스트 추출 오류:', error);
      return text; // 실패시 원본 반환
    }
  };

  // 한글 번역 존재 확인
  const checkKoreanTranslation = async (text) => {
    try {
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
              content: `다음 텍스트에 한국어 번역이나 해석이 포함되어 있는지 확인해주세요:

${text}

"YES" 또는 "NO"로만 답변해주세요.`
            }
          ],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        throw new Error(`한글 확인 실패: ${response.status}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content.trim().toUpperCase();
      return result === 'YES';
    } catch (error) {
      console.error('한글 확인 오류:', error);
      return false;
    }
  };

  // 한글 텍스트 추출
  const extractKoreanText = async (text) => {
    try {
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
              content: `다음 텍스트에서 한국어 번역/해석 부분만 추출해주세요:

${text}

한국어 텍스트만 출력하고, 줄바꿈과 구조는 원본 그대로 보존해주세요.`
            }
          ],
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`한글 텍스트 추출 실패: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('한글 텍스트 추출 오류:', error);
      return '';
    }
  };

  // 한글 해석 팝업 확인 후 처리
  const handleKoreanConfirm = async (koreanText) => {
    setShowKoreanPopup(false);
    await finalizeFormatting(currentSource, currentEnglishText, koreanText);
  };

  // 최종 포맷팅
  const finalizeFormatting = async (source, englishText, koreanText) => {
    const formatted = `${source}/${englishText}/${koreanText}//`;
    setFormattedText(formatted);
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const handleReset = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setExtractedText('');
    setFormattedText('');
    setError('');
    setShowSourcePopup(false);
    setShowKoreanPopup(false);
    setCurrentSource('');
    setCurrentEnglishText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handlePasteClick = () => {
    // 클립보드 읽기 권한 요청 및 처리
    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard.read().then(async (clipboardItems) => {
        for (const clipboardItem of clipboardItems) {
          for (const type of clipboardItem.types) {
            if (type.startsWith('image/')) {
              const blob = await clipboardItem.getType(type);
              const file = new File([blob], 'pasted-image.png', { type: blob.type });
              setSelectedImage(file);
              const reader = new FileReader();
              reader.onload = (e) => {
                setImagePreview(e.target.result);
              };
              reader.readAsDataURL(file);
              setError('');
              return;
            }
          }
        }
        alert('클립보드에 이미지가 없습니다. Ctrl+V를 사용해보세요.');
      }).catch((err) => {
        console.error('클립보드 읽기 실패:', err);
        alert('클립보드 접근 권한이 필요합니다. Ctrl+V를 사용해보세요.');
      });
    } else {
      alert('이 브라우저에서는 클립보드 API를 지원하지 않습니다. Ctrl+V를 사용해보세요.');
    }
  };

  const handleCopyResult = () => {
    if (formattedText) {
      navigator.clipboard.writeText(formattedText);
      alert('결과가 클립보드에 복사되었습니다!');
    }
  };

  return (
    <div className="ocr-container">
      <div className="ocr-header">
        <h2>사진에서 텍스트 추출</h2>
        <p>사진을 업로드하거나 촬영하여 "출처/영어원문/한글해석//" 형식으로 변환합니다.</p>
        <div className="ocr-support-info">
          <strong>✨ 자동 지원:</strong> 18번(편지/이메일), 19번(심경/분위기), 20번(주장/요지), 21번(추론), 22번(요지), 23번(주제), 24번(제목), 26번 문제 유형 자동 인식 및 보기 제거
        </div>
      </div>

      <div className="ocr-upload-section">
        <div className="ocr-buttons">
          <button 
            className="ocr-btn ocr-btn-upload" 
            onClick={handleFileUpload}
            disabled={isProcessing}
          >
            📁 파일 업로드
          </button>
          <button 
            className="ocr-btn ocr-btn-camera" 
            onClick={handleCameraCapture}
            disabled={isProcessing}
          >
            📷 사진 촬영
          </button>
          <button 
            className="ocr-btn ocr-btn-paste" 
            onClick={handlePasteClick}
            disabled={isProcessing}
          >
            📋 이미지 붙여넣기
          </button>
          <button 
            className="ocr-btn ocr-btn-reset" 
            onClick={handleReset}
            disabled={isProcessing}
          >
            🔄 초기화
          </button>
        </div>

        <div className="ocr-paste-instruction">
          💡 <strong>Ctrl+V</strong>를 눌러서 캡처한 이미지를 바로 붙여넣을 수 있습니다!
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />

        {imagePreview && (
          <div className="ocr-image-preview">
            <img src={imagePreview} alt="선택된 이미지" />
          </div>
        )}

        {selectedImage && (
          <button 
            className="ocr-btn ocr-btn-process" 
            onClick={extractTextFromImage}
            disabled={isProcessing || !apiKey}
          >
            {isProcessing ? '처리 중...' : '텍스트 추출하기'}
          </button>
        )}
      </div>

      {error && (
        <div className="ocr-error">
          {error}
        </div>
      )}

      {extractedText && (
        <div className="ocr-result-section">
          <h3>추출된 원본 텍스트:</h3>
          <div className="ocr-text-box">
            <pre>{extractedText}</pre>
          </div>
        </div>
      )}

      {formattedText && (
        <div className="ocr-result-section">
          <h3>변환된 텍스트:</h3>
          <div className="ocr-text-box ocr-formatted">
            <pre>{formattedText}</pre>
          </div>
          <button 
            className="ocr-btn ocr-btn-copy" 
            onClick={handleCopyResult}
          >
            📋 결과 복사하기
          </button>
        </div>
      )}

      {/* 출처 입력 팝업 */}
      <SourcePopup
        isOpen={showSourcePopup}
        onClose={() => setShowSourcePopup(false)}
        onConfirm={handleSourceConfirm}
      />

      {/* 한글 해석 확인 팝업 */}
      <KoreanTranslationPopup
        isOpen={showKoreanPopup}
        onClose={() => setShowKoreanPopup(false)}
        onConfirm={handleKoreanConfirm}
        englishText={currentEnglishText}
        apiKey={apiKey}
      />
    </div>
  );
};

export default OcrInput;
