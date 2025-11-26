import { useState, useEffect } from 'react';
import { loadAllSources, loadSourceTexts, getSourceDocumentId } from '../utils/firestoreUtils';
import './SourceLoader.css';

/**
 * 저장된 출처 불러오기 컴포넌트
 * @param {string} featureType - 기능 타입 ('pocketbook', 'blank' 등)
 */
export default function SourceLoader({ featureType = 'pocketbook', onLoad, onClose }) {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [availableChapters, setAvailableChapters] = useState([]);
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingTexts, setLoadingTexts] = useState(false);

  useEffect(() => {
    loadSources();
  }, [featureType]);

  const loadSources = async () => {
    setLoading(true);
    try {
      console.log(`📚 출처 불러오기 시작 (featureType: ${featureType})`);
      const allSources = await loadAllSources(featureType);
      console.log(`📚 불러온 출처 수: ${allSources.length}`, allSources);
      setSources(allSources);
      if (allSources.length === 0) {
        console.warn('⚠️ 저장된 출처가 없습니다. Firestore에 출처 데이터가 저장되었는지 확인하세요.');
      }
    } catch (error) {
      console.error('❌ 출처 목록 불러오기 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSourceSelect = (sourceId) => {
    const source = sources.find(s => s.id === sourceId);
    console.log('선택된 출처:', source);
    console.log('출처의 chapters:', source?.chapters);
    
    setSelectedSource(source);
    setSelectedChapter('');
    setSelectedQuestions(new Set());
    
    // 책인 경우 사용 가능한 챕터 목록 추출
    if (source && source.type === 'book') {
      if (source.chapters && Object.keys(source.chapters).length > 0) {
        const chapters = Object.keys(source.chapters).sort();
        console.log('추출된 챕터 목록:', chapters);
        setAvailableChapters(chapters);
      } else {
        console.warn('출처에 chapters가 없습니다:', source);
        setAvailableChapters([]);
      }
    } else {
      setAvailableChapters([]);
    }
  };

  const handleChapterSelect = (chapter) => {
    setSelectedChapter(chapter);
    setSelectedQuestions(new Set()); // 챕터 변경 시 문항번호 초기화
  };

  const handleQuestionToggle = (questionNum) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(questionNum)) {
      newSelected.delete(questionNum);
    } else {
      newSelected.add(questionNum);
    }
    setSelectedQuestions(newSelected);
  };

  const handleLoad = async () => {
    if (!selectedSource) {
      alert('출처를 선택해주세요.');
      return;
    }

    // 책인 경우 챕터 선택 확인
    if (selectedSource.type === 'book' && !selectedChapter) {
      alert('챕터를 선택해주세요.');
      return;
    }

    if (selectedQuestions.size === 0) {
      alert('문항번호를 최소 1개 이상 선택해주세요.');
      return;
    }

    setLoadingTexts(true);
    try {
      // 책인 경우 챕터와 함께, 모의고사인 경우 챕터 없이 호출
      const texts = await loadSourceTexts(
        featureType,
        selectedSource.id, 
        selectedSource.type === 'book' ? selectedChapter : null,
        Array.from(selectedQuestions)
      );
      
      if (texts.length === 0) {
        alert('선택한 문항번호에 해당하는 지문을 찾을 수 없습니다.');
        return;
      }

      // featureType에 따라 다른 형태로 변환
      if (featureType === 'blank') {
        // 빈칸 형태로 변환
        const blankData = texts.map(text => ({
          title: text.title || '',
          korean: text.korean || '',
          english: text.english || '',
          textWithBlanks: text.textWithBlanks || '',
          answers: text.answers || [],
          blankCount: text.blankCount || 0,
          blankType: text.blankType || 'nouns',
          highlights: text.highlights || [],
          index: text.index || 0,
          questionNumber: text.questionNumber
        }));
        onLoad(blankData);
      } else {
        // 포켓북 형태로 변환
        const organizedData = texts.map(text => ({
          title: text.title || '',
          korean: text.korean || '',
          english: text.english || '',
          analyzed: text.analyzed || {},
          index: text.index || 0,
          questionNumber: text.questionNumber
        }));
        onLoad(organizedData);
      }
    } catch (error) {
      console.error('지문 불러오기 실패:', error);
      alert('지문을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingTexts(false);
    }
  };

  const formatSourceDisplay = (source) => {
    if (source.type === 'book') {
      return source.bookName || '알 수 없음';
    } else if (source.type === 'mockExam') {
      return `${source.grade || ''} ${source.year || ''} ${source.month || ''} 모의고사`;
    }
    return source.originalText || '알 수 없음';
  };

  // 선택된 챕터의 문항번호 목록 가져오기
  const getQuestionNumbers = () => {
    if (!selectedSource || !selectedChapter) return [];
    
    if (selectedSource.type === 'book' && selectedSource.chapters && selectedSource.chapters[selectedChapter]) {
      return selectedSource.chapters[selectedChapter].questionNumbers || [];
    }
    
    // 모의고사 또는 기존 방식
    return selectedSource.questionNumbers || [];
  };

  return (
    <div className="source-loader-overlay">
      <div className="source-loader-container">
        <div className="source-loader-header">
          <h3>저장된 출처 불러오기</h3>
          <button className="source-loader-close" onClick={onClose}>✕</button>
        </div>

        <div className="source-loader-content">
          {loading ? (
            <div className="source-loader-loading">출처 목록을 불러오는 중...</div>
          ) : sources.length === 0 ? (
            <div className="source-loader-empty">저장된 출처가 없습니다.</div>
          ) : (
            <>
              {/* 1단계: 출처 선택 */}
              <div className="source-loader-section">
                <label>출처 선택 *</label>
                <select
                  value={selectedSource?.id || ''}
                  onChange={(e) => handleSourceSelect(e.target.value)}
                  className="source-loader-select"
                >
                  <option value="">-- 출처를 선택하세요 --</option>
                  {sources.map(source => (
                    <option key={source.id} value={source.id}>
                      {formatSourceDisplay(source)}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2단계: 챕터 선택 (책인 경우만) */}
              {selectedSource && selectedSource.type === 'book' && availableChapters.length > 0 && (
                <div className="source-loader-section">
                  <label>챕터 선택 *</label>
                  <select
                    value={selectedChapter}
                    onChange={(e) => handleChapterSelect(e.target.value)}
                    className="source-loader-select"
                  >
                    <option value="">-- 챕터를 선택하세요 --</option>
                    {availableChapters.map(chapter => (
                      <option key={chapter} value={chapter}>
                        {chapter}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3단계: 문항번호 선택 */}
              {selectedSource && (selectedSource.type !== 'book' || selectedChapter) && (
                <div className="source-loader-section">
                  <label>문항번호 선택 * (다중 선택 가능)</label>
                  <div className="source-loader-questions">
                    {(() => {
                      const questionNumbers = getQuestionNumbers();
                      return questionNumbers.length > 0 ? (
                        questionNumbers.map((qNum, idx) => (
                          <label key={idx} className="source-loader-question-item">
                            <input
                              type="checkbox"
                              checked={selectedQuestions.has(qNum)}
                              onChange={() => handleQuestionToggle(qNum)}
                            />
                            <span>
                              {(() => {
                                // 숫자인지 확인 (정수 또는 소수)
                                const isNumber = !isNaN(qNum) && !isNaN(parseFloat(qNum));
                                if (isNumber) {
                                  // 숫자면 "번" 붙이기
                                  return `${qNum}번`;
                                } else {
                                  // 텍스트면 그대로 표시 (Analysis 등)
                                  return qNum;
                                }
                              })()}
                            </span>
                          </label>
                        ))
                      ) : (
                        <div className="source-loader-empty">저장된 문항번호가 없습니다.</div>
                      );
                    })()}
                  </div>
                  <div className="source-loader-selected-count">
                    선택: {selectedQuestions.size}개
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="source-loader-actions">
          <button onClick={onClose} className="source-loader-btn-cancel">
            취소
          </button>
          <button
            onClick={handleLoad}
            disabled={
              !selectedSource || 
              (selectedSource?.type === 'book' && !selectedChapter) ||
              selectedQuestions.size === 0 || 
              loadingTexts
            }
            className="source-loader-btn-load"
          >
            {loadingTexts ? '불러오는 중...' : '불러오기'}
          </button>
        </div>
      </div>
    </div>
  );
}

