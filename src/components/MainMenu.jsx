import './MainMenu.css'

function MainMenu({
  onSelectPocketbook,
  onSelectBlank,
  onSelectPreprocessor,
  onSelectComplexDescription,
  onSelectKoreanOrigin,
  onSelectParaphrasing,
  onSelectEnglishEnglishWord,
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
  onSelectGrammarToInfinitive,
}) {
  return (
    <div className="main-menu">
      <div className="main-menu-container">
        <h1 className="main-menu-title">포켓북 만들기</h1>
        <p className="main-menu-subtitle">by 신희진</p>
        
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
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectSum15Original}>
                📄 SUM15 원형
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectTitle10Original}>
                📄 시선 title 10 (원형)
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectTopic13Original}>
                📄 시선 topic (원형)
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectTopic13Transformed}>
                📄 시선 topic (변형)
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectResponse20Original}>
                📄 시선 response 20 (원형)
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectInterview25Transformed}>
                📄 시선 interview 25 (변형)
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectSum15}>
                📄 SUM15
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectSum30}>
                📄 SUM30
              </button>
              <button className="main-menu-btn main-menu-btn-primary" onClick={onSelectSum40}>
                📄 SUM40
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

            <h2 className="section-title">문법 문제 만들기</h2>
            <div className="main-menu-buttons">
              <button className="main-menu-btn main-menu-btn-grammar" onClick={onSelectGrammarToInfinitive}>
                📌 to부정사
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
                📚 영어 과제 관리
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
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectWeeklySchedule}>
                📅 주간 일정표
              </button>
              <button className="main-menu-btn main-menu-btn-secondary" onClick={onSelectNotes}>
                📝 노트
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
        <button
          type="button"
          className="main-menu-student-data-btn"
          onClick={onSelectStudentData}
        >
          👥 학생 데이터
        </button>
      </div>
    </div>
  )
}

export default MainMenu
