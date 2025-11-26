import React, { useState } from 'react';
import './KoreanTranslationPopup.css';

const KoreanTranslationPopup = ({ isOpen, onClose, onConfirm, englishText, apiKey }) => {
  const [hasKorean, setHasKorean] = useState('');
  const [koreanText, setKoreanText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  const handleConfirm = async () => {
    if (hasKorean === 'yes') {
      if (!koreanText.trim()) {
        alert('한글 해석을 입력해주세요.');
        return;
      }
      onConfirm(koreanText);
    } else if (hasKorean === 'no') {
      // AI 자동 번역
      setIsTranslating(true);
      try {
        const translation = await generateKoreanTranslation(englishText, apiKey);
        onConfirm(translation);
      } catch (error) {
        alert('번역 중 오류가 발생했습니다: ' + error.message);
        setIsTranslating(false);
        return;
      }
      setIsTranslating(false);
    } else {
      alert('한글 해석 여부를 선택해주세요.');
      return;
    }
    
    handleReset();
  };

  const generateKoreanTranslation = async (text, apiKey) => {
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
            content: `다음 영어 텍스트를 자연스러운 한국어로 번역해주세요. 편지나 이메일 형식의 글이라면 한국어 편지/이메일 형식에 맞게 번역해주세요:

${text}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`번역 API 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  };

  const handleReset = () => {
    setHasKorean('');
    setKoreanText('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="korean-popup-overlay">
      <div className="korean-popup">
        <div className="korean-popup-header">
          <h3>🇰🇷 한글 해석 확인</h3>
          <button className="korean-popup-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="korean-popup-content">
          <div className="korean-question">
            <p>한글 해석이 있나요?</p>
          </div>

          <div className="korean-options">
            <label className="korean-option">
              <input
                type="radio"
                name="hasKorean"
                value="yes"
                checked={hasKorean === 'yes'}
                onChange={(e) => setHasKorean(e.target.value)}
              />
              <span>네, 있습니다</span>
            </label>

            <label className="korean-option">
              <input
                type="radio"
                name="hasKorean"
                value="no"
                checked={hasKorean === 'no'}
                onChange={(e) => setHasKorean(e.target.value)}
              />
              <span>아니요, AI로 자동 번역해주세요</span>
            </label>
          </div>

          {hasKorean === 'yes' && (
            <div className="korean-input-section">
              <label>한글 해석을 입력해주세요:</label>
              <textarea
                value={koreanText}
                onChange={(e) => setKoreanText(e.target.value)}
                className="korean-textarea"
                placeholder="한글 해석을 입력하세요..."
                rows={6}
              />
            </div>
          )}

          {hasKorean === 'no' && (
            <div className="korean-auto-info">
              <p>💡 AI가 자동으로 한국어 번역을 생성합니다.</p>
            </div>
          )}
        </div>

        <div className="korean-popup-footer">
          <button className="korean-btn korean-btn-cancel" onClick={handleClose}>
            취소
          </button>
          <button 
            className="korean-btn korean-btn-confirm" 
            onClick={handleConfirm}
            disabled={isTranslating}
          >
            {isTranslating ? '번역 중...' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default KoreanTranslationPopup;
