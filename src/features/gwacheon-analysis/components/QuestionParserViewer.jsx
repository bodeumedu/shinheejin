import React from 'react';
import './QuestionParserViewer.css';

const QuestionParserViewer = ({ questions, onClose }) => {
  return (
    <div className="question-parser-viewer-overlay">
      <div className="question-parser-viewer-container">
        <div className="question-parser-viewer-header">
          <h2>추출된 문제 목록</h2>
          <button className="close-button" onClick={onClose}>닫기</button>
        </div>
        
        <div className="question-parser-viewer-content">
          {questions && questions.length > 0 ? (
            <div className="questions-grid">
              {questions.map((question, index) => (
                <div key={index} className="question-item">
                  <div className="question-number">문제 {question.number}</div>
                  <div className="question-image-container">
                    <img 
                      src={question.image} 
                      alt={`문제 ${question.number}`}
                      className="question-image"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-questions">추출된 문제가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuestionParserViewer;


