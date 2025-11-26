import React, { useState } from 'react';
import './SourcePopup.css';

const SourcePopup = ({ isOpen, onClose, onConfirm }) => {
  const [sourceType, setSourceType] = useState('');
  const [year, setYear] = useState('');
  const [grade, setGrade] = useState('');
  const [month, setMonth] = useState('');
  const [questionNumber, setQuestionNumber] = useState('');
  const [bookName, setBookName] = useState('');
  const [chapter, setChapter] = useState('');
  const [bookQuestionNumber, setBookQuestionNumber] = useState('');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2009 }, (_, i) => 2010 + i);
  const grades = ['고1', '고2', '고3'];
  const months = ['3월', '4월', '6월', '7월', '9월', '10월', '11월', '12월', '수능'];

  const handleConfirm = () => {
    let source = '';
    
    if (sourceType === 'mock') {
      if (!year || !grade || !month) {
        alert('모든 필드를 입력해주세요.');
        return;
      }
      source = `${year}년 ${grade} ${month} ${questionNumber}번`;
    } else if (sourceType === 'book') {
      if (!bookName || !chapter || !bookQuestionNumber) {
        alert('모든 필드를 입력해주세요.');
        return;
      }
      source = `${bookName} ${chapter}강 ${bookQuestionNumber}번`;
    } else {
      alert('출처 유형을 선택해주세요.');
      return;
    }

    onConfirm(source);
    handleReset();
  };

  const handleReset = () => {
    setSourceType('');
    setYear('');
    setGrade('');
    setMonth('');
    setQuestionNumber('');
    setBookName('');
    setChapter('');
    setBookQuestionNumber('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="source-popup-overlay">
      <div className="source-popup">
        <div className="source-popup-header">
          <h3>📝 출처 입력</h3>
          <button className="source-popup-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="source-popup-content">
          <div className="source-field">
            <label>출처 유형</label>
            <select 
              value={sourceType} 
              onChange={(e) => setSourceType(e.target.value)}
              className="source-select"
            >
              <option value="">선택하세요</option>
              <option value="mock">모의고사</option>
              <option value="book">일반책</option>
            </select>
          </div>

          {sourceType === 'mock' && (
            <div className="source-mock-fields">
              <div className="source-field-row">
                <div className="source-field">
                  <label>연도</label>
                  <select 
                    value={year} 
                    onChange={(e) => setYear(e.target.value)}
                    className="source-select"
                  >
                    <option value="">선택</option>
                    {years.map(y => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                </div>

                <div className="source-field">
                  <label>학년</label>
                  <select 
                    value={grade} 
                    onChange={(e) => setGrade(e.target.value)}
                    className="source-select"
                  >
                    <option value="">선택</option>
                    {grades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="source-field-row">
                <div className="source-field">
                  <label>월</label>
                  <select 
                    value={month} 
                    onChange={(e) => setMonth(e.target.value)}
                    className="source-select"
                  >
                    <option value="">선택</option>
                    {months.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="source-field">
                  <label>문항 번호</label>
                  <input
                    type="text"
                    value={questionNumber}
                    onChange={(e) => setQuestionNumber(e.target.value)}
                    className="source-input"
                    placeholder="18, 19, 20, 21, 22, 23, 24, 26 등"
                  />
                </div>
              </div>
            </div>
          )}

          {sourceType === 'book' && (
            <div className="source-book-fields">
              <div className="source-field">
                <label>책 이름</label>
                <input
                  type="text"
                  value={bookName}
                  onChange={(e) => setBookName(e.target.value)}
                  className="source-input"
                  placeholder="예: 수능완성, EBS 수특 등"
                />
              </div>

              <div className="source-field-row">
                <div className="source-field">
                  <label>강</label>
                  <input
                    type="text"
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                    className="source-input"
                    placeholder="예: 1, 2, 3..."
                  />
                </div>

                <div className="source-field">
                  <label>문항 번호</label>
                  <input
                    type="text"
                    value={bookQuestionNumber}
                    onChange={(e) => setBookQuestionNumber(e.target.value)}
                    className="source-input"
                    placeholder="예: 1, 2, 3..."
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="source-popup-footer">
          <button className="source-btn source-btn-cancel" onClick={handleClose}>
            취소
          </button>
          <button className="source-btn source-btn-confirm" onClick={handleConfirm}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default SourcePopup;
