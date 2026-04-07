import './MainMenu.css'
import UsageQuestionBot from '../features/help-bot/components/UsageQuestionBot'

function MainMenu({
  currentUser,
  onLogout,
  helpBotApiKey,
  onSelectCalendar,
  onSelectAttendanceCheck,
  onSelectPocketbook,
  onSelectBlank,
  onSelectPreprocessor,
  onSelectComplexDescription,
  onSelectKoreanOrigin,
  onSelectParaphrasing,
  onSelectEnglishEnglishWord,
  onSelectDescriptiveProblemBuilder,
  onSelectSum15Original,
  onSelectTitle10Original,
  onSelectTopic13Original,
  onSelectTopic13Transformed,
  onSelectResponse20Original,
  onSelectInterview25Transformed,
  onSelectSum15,
  onSelectSum30,
  onSelectSum40,
  onSelectKoreanSummary,
  onSelectKey,
  onSelectCsatCloze,
  onSelectThirdWord,
  onSelectReferenceDescription,
  onSelectGrammarAnalysis,
  onSelectContentMatch,
  onSelectOcr,
  onSelectEnglishHomeworkDashboard,
  onSelectMathHomeworkDashboard,
  onSelectClinicLog,
  onSelectHomeworkCompletion,
  onSelectWinterSchool,
  onSelectWeeklySchedule,
  onSelectNotes,
  onSelectWordShuffler,
  onSelectGwacheonCentralHigh1,
  onSelectStudentData,
  onSelectAdminPage,
  onSelectHomeworkClassBuilder,
  onSelectGrammarWorkbook,
  onSelectParallelMockExam,
}) {
  const isExecutive = currentUser?.role === 'executive'

  return (
    <div className="main-menu">
      <div className="main-menu-container">
        <h1 className="main-menu-title">포켓북 만들기</h1>
        <p className="main-menu-subtitle">by 신희진</p>
        <div className="main-menu-user-bar">
          <div className="main-menu-user-section">
            <div className="main-menu-user-info">
              <strong>{currentUser?.name || '미로그인'}</strong>
              <span>{currentUser?.role === 'executive' ? '운영진' : currentUser?.role === 'staff' ? '직원' : '선생님'}</span>
            </div>
            <button type="button" className="main-menu-suggestion-btn" onClick={onSelectNotes}>
              수정 제안
            </button>
          </div>
          <button type="button" className="main-menu-logout-btn" onClick={onLogout}>
            로그아웃
          </button>
        </div>
        <div className="main-menu-top-actions">
          <UsageQuestionBot apiKey={helpBotApiKey} />
          <button
            type="button"
            className="main-menu-calendar-btn"
            onClick={onSelectCalendar}
          >
            🗓️ 캘린더
          </button>
          <button type="button" className="main-menu-attendance-btn" onClick={onSelectAttendanceCheck}>
            ✅ 출석체크
          </button>
          <button
            type="button"
            className="main-menu-student-data-btn"
            onClick={onSelectStudentData}
            disabled={!isExecutive}
            title={isExecutive ? '' : '운영진만 사용할 수 있습니다.'}
          >
            👥 학생 데이터
          </button>
          <button
            type="button"
            className="main-menu-class-builder-btn"
            onClick={onSelectHomeworkClassBuilder}
            disabled={!isExecutive}
            title={isExecutive ? '' : '운영진만 사용할 수 있습니다.'}
          >
            ➕ 반 만들기
          </button>
          <button
            type="button"
            className="main-menu-weekly-schedule-btn"
            onClick={onSelectWeeklySchedule}
          >
            📅 주간 시간표
          </button>
          <button
            type="button"
            className="main-menu-admin-btn"
            onClick={onSelectAdminPage}
            disabled={!isExecutive}
            title={isExecutive ? '' : '운영진만 사용할 수 있습니다.'}
          >
            🟣 관리자 페이지
          </button>
        </div>
        
        <div className="main-menu-layout">
          <div className="main-menu-left">
            <h2 className="section-title">기본 기능</h2>
            <div className="main-menu-buttons">
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectPocketbook}>
                📖 포켓북 만들기
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectBlank}>
                📝 빈칸 만들기
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectPreprocessor}>
                🔧 전처리
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectComplexDescription}>
                📋 복합서술형
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectKoreanOrigin}>
                📄 한글원문생성
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectParaphrasing}>
                ✏️ Paraphrasing
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectEnglishEnglishWord}>
                📖 영영 단어
              </button>
            </div>
          </div>
          
          <div className="main-menu-center">
            <h2 className="section-title">문제 만들기</h2>
            <div className="main-menu-buttons">
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectDescriptiveProblemBuilder}>
                🧩 서술형 문제 만들기
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectKoreanSummary}>
                📝 요약문 한글
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectKey}>
                🔑 KEY
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectCsatCloze}>
                📝 빈칸 수능문제
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectThirdWord}>
                📝 Third Word
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectReferenceDescription}>
                📝 지칭서술형
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectGrammarAnalysis}>
                📚 문법 분석
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectContentMatch}>
                📋 일치불일치 (객불)
              </button>
            </div>

            <h2 className="section-title">문법 워크북</h2>
            <div className="main-menu-buttons">
              <button className="main-menu-btn main-menu-btn-grammar" onClick={onSelectGrammarWorkbook}>
                📘 문법 워크북 생성기
              </button>
              <button className="main-menu-btn main-menu-btn-grammar" onClick={onSelectParallelMockExam}>
                📋 동형모의고사 만들기
              </button>
            </div>
          </div>
          
          <div className="main-menu-right">
            <h2 className="section-title">기타 기능</h2>
            <div className="main-menu-buttons">
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectOcr}>
                📷 OCR
              </button>
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectEnglishHomeworkDashboard}>
                📚 전체 완성도와 테스트관리
              </button>
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectMathHomeworkDashboard}>
                📐 수학 클리닉 대장
              </button>
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectClinicLog}>
                📋 영어 클리닉 대장
              </button>
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectHomeworkCompletion}>
                📚 숙제 과제 완료도
              </button>
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectWinterSchool}>
                ❄️ 윈터스쿨 관리
              </button>
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectWordShuffler}>
                🔀 단어 섞기
              </button>
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectGwacheonCentralHigh1}>
                🏫 과천중앙고 1학년
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainMenu
