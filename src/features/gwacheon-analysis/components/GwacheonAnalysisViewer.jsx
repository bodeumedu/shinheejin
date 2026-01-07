import React from 'react';
import './GwacheonAnalysisViewer.css';

const GwacheonAnalysisViewer = ({ data }) => {
  if (!data) return null;

  const { year, examType, extractedText, parsedData, analysis, examScope } = data;

  // 문항 분류 계산
  const calculateQuestionClassification = () => {
    // analysis.questions 또는 parsedData.questions 사용
    const questions = analysis?.questions || parsedData?.questions || [];
    if (questions.length === 0) return null;

    const multipleChoice = questions.filter(q => q.questionType === '선택형' || q.type === '선택형');
    const shortAnswer = questions.filter(q => q.questionType === '서답형' || q.type === '서답형');
    
    // 출처별 분류
    const textbookQuestions = questions.filter(q => q.source === '교과서');
    const mockExamQuestions = questions.filter(q => q.source === '모의고사');
    const externalQuestions = questions.filter(q => q.source === '외부지문');

    return {
      multipleChoice: {
        count: multipleChoice.length,
        score: multipleChoice.reduce((sum, q) => sum + (parseInt(q.score) || 0), 0)
      },
      shortAnswer: {
        count: shortAnswer.length,
        score: shortAnswer.reduce((sum, q) => sum + (parseInt(q.score) || 0), 0)
      },
      bySource: {
        textbook: {
          total: textbookQuestions.length,
          multipleChoice: textbookQuestions.filter(q => q.type === '선택형').length,
          shortAnswer: textbookQuestions.filter(q => q.type === '서답형').length
        },
        mockExam: {
          total: mockExamQuestions.length,
          multipleChoice: mockExamQuestions.filter(q => q.type === '선택형').length,
          shortAnswer: mockExamQuestions.filter(q => q.type === '서답형').length
        },
        external: {
          total: externalQuestions.length,
          multipleChoice: externalQuestions.filter(q => q.type === '선택형').length,
          shortAnswer: externalQuestions.filter(q => q.type === '서답형').length
        }
      }
    };
  };

  const questionClassification = calculateQuestionClassification();

  return (
    <div className="gwacheon-analysis-viewer">
      <div className="viewer-header">
        <h2>[{year}년 {examType} 과천중앙고 1학년 내신분석]</h2>
      </div>

      {/* 출제범위 테이블 */}
      {examScope && (
        <div className="scope-section">
          <h3>출제범위</h3>
          <table className="scope-table">
            <thead>
              <tr>
                <th>교과서</th>
                <th>모의고사</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{examScope.textbook || '-'}</td>
                <td>{examScope.mockExam || '-'}</td>
              </tr>
              {examScope.externalPassage && (
                <tr>
                  <td className="external-label">외부지문</td>
                  <td>{examScope.externalPassage}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 문항분류 및 상세문향 분류 테이블 */}
      {questionClassification && (
        <div className="classification-section">
          <h3>문항분류 & 상세문향 분류</h3>
          <table className="classification-table">
            <thead>
              <tr>
                <th rowSpan="2">문항 유형</th>
                <th rowSpan="2">문항 수</th>
                <th rowSpan="2">배점</th>
                <th colSpan="3">상세문향 분류</th>
              </tr>
              <tr>
                <th>문항출처</th>
                <th>문항수</th>
                <th>문향 배분</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowSpan="3">선택형</td>
                <td rowSpan="3">{questionClassification.multipleChoice.count}개</td>
                <td rowSpan="3">{questionClassification.multipleChoice.score}</td>
                <td>교과서</td>
                <td>{questionClassification.bySource.textbook.multipleChoice}</td>
                <td>선택형 {questionClassification.bySource.textbook.multipleChoice}문항 / 서답형 {questionClassification.bySource.textbook.shortAnswer}문항</td>
              </tr>
              <tr>
                <td>모의고사</td>
                <td>{questionClassification.bySource.mockExam.multipleChoice}</td>
                <td>선택형 {questionClassification.bySource.mockExam.multipleChoice}문항 / 서답형 {questionClassification.bySource.mockExam.shortAnswer}문항</td>
              </tr>
              {questionClassification.bySource.external.total > 0 && (
                <tr>
                  <td>외부지문</td>
                  <td>{questionClassification.bySource.external.multipleChoice}</td>
                  <td>선택형 {questionClassification.bySource.external.multipleChoice}문항</td>
                </tr>
              )}
              <tr>
                <td>서답형</td>
                <td>{questionClassification.shortAnswer.count}개</td>
                <td>{questionClassification.shortAnswer.score}</td>
                <td colSpan="3">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 상세 문항 분석 테이블 */}
      {((analysis?.questions && analysis.questions.length > 0) || (parsedData?.questions && parsedData.questions.length > 0)) && (
        <div className="detailed-analysis-section">
          <h3>상세 문항 분석</h3>
          <table className="detailed-analysis-table">
            <thead>
              <tr>
                <th>문제 번호</th>
                <th>유형 (선택형/서답형)</th>
                <th>출처</th>
                <th>상세유형</th>
                <th>배점</th>
                <th>난이도</th>
              </tr>
            </thead>
            <tbody>
              {(analysis?.questions || parsedData?.questions || []).map((question, index) => (
                <tr key={index}>
                  <td>{question.number || index + 1}</td>
                  <td>{question.questionType || question.type || '-'}</td>
                  <td>{question.source || '-'}</td>
                  <td>{question.detailedType || question.type || '-'}</td>
                  <td>{question.score || '-'}</td>
                  <td>
                    {question.difficulty && (
                      <span className={`difficulty-badge difficulty-${question.difficulty}`}>
                        {question.difficulty}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 기존 분석 결과 (요약) */}
      {analysis && (
        <div className="analysis-section">
          {analysis.summary ? (
            <div className="analysis-box summary-box">
              <h4>전체 요약</h4>
              <p className="summary-text">{analysis.summary}</p>
            </div>
          ) : (
            <div className="analysis-box summary-box">
              <h4>전체 요약</h4>
              <p className="summary-text">
                {parsedData?.questions && parsedData.questions.length > 0 
                  ? `총 ${parsedData.questions.length}개의 문제가 파싱되었습니다. 상세 분석을 위해 OCR 텍스트를 확인해주세요.`
                  : '시험 문제 데이터가 없어 분석할 자료가 없습니다. OCR 텍스트를 확인해주세요.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 데이터가 전혀 없는 경우 */}
      {!analysis && !parsedData && extractedText && (
        <div className="analysis-section">
          <div className="analysis-box summary-box">
            <h4>전체 요약</h4>
            <p className="summary-text">
              시험 문제 데이터가 없어 분석할 자료가 없습니다. OCR 텍스트를 확인해주세요.
            </p>
          </div>
        </div>
      )}

      {/* 디버깅: 추출된 텍스트 표시 */}
      {extractedText && (
        <div className="extracted-text-section">
          <h3>📄 추출된 원본 텍스트 (디버깅용)</h3>
          <div className="extracted-text-box">
            <pre>{extractedText}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default GwacheonAnalysisViewer;
