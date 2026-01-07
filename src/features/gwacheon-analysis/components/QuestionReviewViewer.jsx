import React from 'react';
import './QuestionReviewViewer.css';

const QuestionReviewViewer = ({ questionData, onConfirm, onBack }) => {
  if (!questionData || !questionData.questions || questionData.questions.length === 0) {
    return null;
  }

  const { questions, fullImage } = questionData;

  return (
    <div className="question-review-viewer">
      <div className="review-header">
        <h2>문제별 OCR 결과 확인</h2>
        <p>각 문제의 이미지와 추출된 텍스트를 확인하고 수정할 수 있습니다.</p>
      </div>

      <div className="questions-review-list">
        {questions.map((question, index) => (
          <div key={index} className="question-review-item">
            <div className="question-review-header">
              <h3>문제 {question.number || index + 1}</h3>
            </div>
            
            <div className="question-review-content">
              {/* 왼쪽: 문제 이미지 */}
              <div className="question-image-section">
                <h4>문제 이미지</h4>
                {question.image ? (
                  <div className="question-image-container">
                    <img 
                      src={question.image} 
                      alt={`문제 ${question.number || index + 1}`}
                      className="question-image"
                    />
                  </div>
                ) : (
                  <div className="no-image">이미지 없음</div>
                )}
              </div>

              {/* 오른쪽: 추출된 텍스트 */}
              <div className="question-text-section">
                <h4>추출된 텍스트</h4>
                <div className="question-text-container">
                  <pre className="question-text">{question.extractedText || '텍스트 추출 실패'}</pre>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="review-actions">
        <button className="btn-back" onClick={onBack}>
          뒤로 가기
        </button>
        <button className="btn-confirm" onClick={onConfirm}>
          확인하고 분석 진행
        </button>
      </div>
    </div>
  );
};

export default QuestionReviewViewer;


