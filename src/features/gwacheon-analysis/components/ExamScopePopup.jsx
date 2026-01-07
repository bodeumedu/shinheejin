import React, { useState } from 'react';
import './ExamScopePopup.css';

const ExamScopePopup = ({ isOpen, onClose, onConfirm }) => {
  const [textbook, setTextbook] = useState('');
  const [mockExam, setMockExam] = useState('');
  const [externalPassage, setExternalPassage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm({
      textbook: textbook.trim(),
      mockExam: mockExam.trim(),
      externalPassage: externalPassage.trim()
    });
  };

  if (!isOpen) return null;

  return (
    <div className="exam-scope-popup-overlay">
      <div className="exam-scope-popup">
        <h3>시험범위 입력</h3>
        <p className="popup-description">시험 범위를 입력해주세요. (선택사항)</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="textbook">교과서</label>
            <input
              id="textbook"
              type="text"
              value={textbook}
              onChange={(e) => setTextbook(e.target.value)}
              placeholder="예: 동아(권) 5-6과 / 어법, 어휘 프린트물"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="mockExam">모의고사</label>
            <input
              id="mockExam"
              type="text"
              value={mockExam}
              onChange={(e) => setMockExam(e.target.value)}
              placeholder="예: 2023.3월 고2 모의고사 (25,27,28번 제외)"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="externalPassage">외부지문</label>
            <input
              id="externalPassage"
              type="text"
              value={externalPassage}
              onChange={(e) => setExternalPassage(e.target.value)}
              placeholder="예: TED (교과서 IoT관련)"
              className="form-input"
            />
          </div>

          <div className="popup-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              건너뛰기
            </button>
            <button type="submit" className="btn-confirm">
              확인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExamScopePopup;


