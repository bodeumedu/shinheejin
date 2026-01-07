import './MainMenu.css'

function MainMenu({ onSelectPocketbook, onSelectBlank, onSelectPreprocessor, onSelectComplexDescription, onSelectParaphrasing, onSelectSum15, onSelectSum30, onSelectSum40, onSelectKoreanSummary, onSelectKey, onSelectCsatCloze, onSelectThirdWord, onSelectOcr, onSelectEnglishHomeworkDashboard, onSelectMathHomeworkDashboard, onSelectClinicLog, onSelectStudentPhoneManager, onSelectHomeworkCompletion, onSelectReferenceDescription, onSelectGrammarAnalysis, onSelectWeeklySchedule, onSelectNotes, onSelectWordShuffler, onSelectGwacheonCentralHigh1 }) {
  return (
    <div className="main-menu">
      <div className="main-menu-container">
        <h1 className="main-menu-title">코딩 실험과 공부</h1>
        <p className="main-menu-subtitle">by 신희진</p>
        
        <div className="main-menu-layout">
          {/* 왼쪽: 마이갓 제작 전처리 */}
          <div className="main-menu-left">
            <h2 className="section-title">마이갓 제작 전처리</h2>
            <div className="main-menu-buttons">
              <button 
                onClick={onSelectPreprocessor} 
                className="main-menu-btn main-menu-btn-tertiary"
              >
                문장 넣기 전처리
              </button>
              
              <button 
                onClick={onSelectComplexDescription} 
                className="main-menu-btn main-menu-btn-quaternary"
              >
                복합서술형
              </button>
              
              <button 
                onClick={onSelectParaphrasing} 
                className="main-menu-btn main-menu-btn-quinary"
              >
                Paraphrasing
              </button>
              
              <button 
                onClick={onSelectKey} 
                className="main-menu-btn main-menu-btn-octonary"
              >
                KEY
              </button>

              <button 
                onClick={onSelectThirdWord} 
                className="main-menu-btn main-menu-btn-denary"
              >
                Third Word
              </button>
              
              <button 
                onClick={onSelectSum40} 
                className="main-menu-btn main-menu-btn-septenary"
              >
                SUM40
              </button>
            </div>
          </div>

          {/* 중간: 내신 추가 자료 만들기 */}
          <div className="main-menu-center">
            <h2 className="section-title">내신 추가 자료 만들기</h2>
            <div className="main-menu-buttons">
              <button 
                onClick={onSelectBlank} 
                className="main-menu-btn main-menu-btn-secondary"
              >
                빈칸 만들기
              </button>

              <button 
                onClick={onSelectCsatCloze} 
                className="main-menu-btn main-menu-btn-nonary"
              >
                빈칸 수능문제 출제기
              </button>

              <button 
                onClick={onSelectReferenceDescription} 
                className="main-menu-btn main-menu-btn-ternary"
              >
                지칭서술형(지문 안에서,어형변화무)
              </button>

              <button 
                onClick={onSelectGrammarAnalysis} 
                className="main-menu-btn main-menu-btn-grammar"
              >
                분석지 만들기
              </button>

              <button 
                onClick={onSelectPocketbook} 
                className="main-menu-btn main-menu-btn-primary"
              >
                포켓북 만들기
              </button>
              
              <button 
                onClick={onSelectSum15} 
                className="main-menu-btn main-menu-btn-senary"
              >
                SUM15 <span className="btn-subtitle">(The passage suggests that ~ ) (ing/p.p. 위주 변환 두개)</span>
              </button>
              
              <button 
                onClick={onSelectSum30} 
                className="main-menu-btn main-menu-btn-senary"
              >
                SUM30 (2학년)
              </button>
              
              <button 
                onClick={onSelectKoreanSummary} 
                className="main-menu-btn main-menu-btn-septenary"
              >
                요약문 한글
              </button>
            </div>
          </div>

          {/* 오른쪽: 운영 TOOL 및 유용한 기능 */}
          <div className="main-menu-right">
            <h2 className="section-title">운영 TOOL</h2>
            <div className="main-menu-buttons">
              <button 
                onClick={onSelectWeeklySchedule} 
                className="main-menu-btn main-menu-btn-schedule"
              >
                📅 영어과제관리 주간시간표
              </button>

              <button 
                onClick={onSelectEnglishHomeworkDashboard} 
                className="main-menu-btn main-menu-btn-duodenary"
              >
                📚 대시보드
              </button>

              <button 
                onClick={onSelectMathHomeworkDashboard} 
                className="main-menu-btn main-menu-btn-duodenary"
              >
                📚 수학 과제관리 대시보드
              </button>

              <button 
                onClick={onSelectClinicLog} 
                className="main-menu-btn main-menu-btn-clinic"
              >
                🗂️ 클리닉 대장
              </button>

              <button 
                onClick={onSelectStudentPhoneManager} 
                className="main-menu-btn main-menu-btn-phone"
              >
                📞 학생 전화번호 관리
              </button>

              <button 
                onClick={onSelectHomeworkCompletion} 
                className="main-menu-btn main-menu-btn-completion"
              >
                📚 숙제 과제 완료도
              </button>
            </div>

            <h2 className="section-title">유용한 기능</h2>
            <div className="main-menu-buttons">
              <button 
                onClick={onSelectWordShuffler} 
                className="main-menu-btn main-menu-btn-shuffler"
              >
                🔀 Word Shuffler
              </button>

              <button 
                onClick={onSelectOcr} 
                className="main-menu-btn main-menu-btn-undenary"
              >
                📷 사진 텍스트 추출
              </button>
            </div>

            <h2 className="section-title" style={{ marginTop: '40px' }}>과천 지역 내신 상세 분석</h2>
            <div className="main-menu-buttons">
              <button 
                onClick={onSelectGwacheonCentralHigh1} 
                className="main-menu-btn main-menu-btn-primary"
              >
                과천중앙고1학년
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainMenu

