import { useState, useEffect } from 'react';
import './SourceInputPopup.css';

/**
 * 출처 정보 입력 팝업 컴포넌트
 * @param {Object} sourceInfo - AI가 파싱한 출처 정보
 * @param {Function} onConfirm - 확인 시 호출되는 함수 (완성된 출처 정보 전달)
 * @param {Function} onCancel - 취소 시 호출되는 함수
 */
export default function SourceInputPopup({ sourceInfo, onConfirm, onCancel }) {
  const [formData, setFormData] = useState({
    type: 'book',
    bookName: '',
    chapter: '',
    mockGrade: '고1',
    mockYear: '',
    mockMonth: '',
    questionNumber: ''
  });

  useEffect(() => {
    // sourceInfo가 있으면 폼에 채우기
    if (sourceInfo) {
      setFormData(prev => ({
        ...prev,
        type: sourceInfo.type === 'mockExam' ? 'mockExam' : 'book',
        bookName: sourceInfo.bookName || '',
        chapter: sourceInfo.chapter || '',
        mockGrade: sourceInfo.grade || '고1',
        mockYear: sourceInfo.year || '',
        mockMonth: sourceInfo.month || '',
        questionNumber: sourceInfo.questionNumber || ''
      }));
    }
  }, [sourceInfo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let result;
    if (formData.type === 'book') {
      result = {
        type: 'book',
        bookName: formData.bookName.trim(),
        chapter: formData.chapter.trim(),
        questionNumber: formData.questionNumber.trim() || null,
        originalText: sourceInfo?.originalText || ''
      };
    } else {
      result = {
        type: 'mockExam',
        grade: formData.mockGrade,
        year: formData.mockYear.trim(),
        month: formData.mockMonth.trim(),
        questionNumber: formData.questionNumber.trim() || null,
        originalText: sourceInfo?.originalText || ''
      };
    }

    // 필수 필드 확인
    const missingFields = [];
    if (formData.type === 'book') {
      if (!formData.bookName.trim()) missingFields.push('책 이름');
      if (!formData.chapter.trim()) missingFields.push('챕터');
    } else {
      if (!formData.mockYear.trim()) missingFields.push('년도');
      if (!formData.mockMonth.trim()) missingFields.push('월');
    }

    if (missingFields.length > 0) {
      alert(`다음 필드를 입력해주세요: ${missingFields.join(', ')}`);
      return;
    }

    onConfirm(result);
  };

  return (
    <div className="source-popup-overlay">
      <div className="source-popup-container">
        <div className="source-popup-header">
          <h3>출처 정보 입력</h3>
          <button className="source-popup-close" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="source-popup-form">
          {/* 출처 타입 선택 */}
          <div className="source-popup-field">
            <label>출처 타입</label>
            <div className="source-popup-radio-group">
              <label>
                <input
                  type="radio"
                  name="type"
                  value="book"
                  checked={formData.type === 'book'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                />
                책
              </label>
              <label>
                <input
                  type="radio"
                  name="type"
                  value="mockExam"
                  checked={formData.type === 'mockExam'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                />
                모의고사
              </label>
            </div>
          </div>

          {/* 책 타입 입력 */}
          {formData.type === 'book' && (
            <>
              <div className="source-popup-field">
                <label>책 이름 *</label>
                <input
                  type="text"
                  value={formData.bookName}
                  onChange={(e) => setFormData({ ...formData, bookName: e.target.value })}
                  placeholder="예: 올림포스 영어 독해의 기본2"
                  required
                />
              </div>
              <div className="source-popup-field">
                <label>챕터 *</label>
                <input
                  type="text"
                  value={formData.chapter}
                  onChange={(e) => setFormData({ ...formData, chapter: e.target.value })}
                  placeholder="예: Ch05 Unit14"
                  required
                />
              </div>
            </>
          )}

          {/* 모의고사 타입 입력 */}
          {formData.type === 'mockExam' && (
            <>
              <div className="source-popup-field">
                <label>학년 *</label>
                <select
                  value={formData.mockGrade}
                  onChange={(e) => setFormData({ ...formData, mockGrade: e.target.value })}
                >
                  <option value="고1">고1</option>
                  <option value="고2">고2</option>
                  <option value="고3">고3</option>
                </select>
              </div>
              <div className="source-popup-field">
                <label>년도 *</label>
                <input
                  type="text"
                  value={formData.mockYear}
                  onChange={(e) => setFormData({ ...formData, mockYear: e.target.value })}
                  placeholder="예: 2024"
                  required
                />
              </div>
              <div className="source-popup-field">
                <label>월 *</label>
                <input
                  type="text"
                  value={formData.mockMonth}
                  onChange={(e) => setFormData({ ...formData, mockMonth: e.target.value })}
                  placeholder="예: 3월, 6월, 9월"
                  required
                />
              </div>
            </>
          )}

          {/* 문항번호 (선택사항) */}
          <div className="source-popup-field">
            <label>문항번호 (선택사항)</label>
            <input
              type="text"
              value={formData.questionNumber}
              onChange={(e) => setFormData({ ...formData, questionNumber: e.target.value })}
              placeholder="예: 18, 19"
            />
          </div>

          {/* 원본 텍스트 표시 */}
          {sourceInfo?.originalText && (
            <div className="source-popup-original">
              <label>원본 출처</label>
              <div className="source-popup-original-text">{sourceInfo.originalText}</div>
            </div>
          )}

          <div className="source-popup-actions">
            <button type="button" onClick={onCancel} className="source-popup-btn-cancel">
              취소
            </button>
            <button type="submit" className="source-popup-btn-confirm">
              확인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

