import './MainMenu.css'

function MainMenu({ onSelectPocketbook, onSelectBlank, onSelectPreprocessor, onSelectComplexDescription, onSelectParaphrasing, onSelectSum15, onSelectSum40, onSelectKey, onSelectCsatCloze, onSelectThirdWord, onSelectOcr, onSelectHomeworkDashboard, onSelectClinicLog }) {
  return (
    <div className="main-menu">
      <div className="main-menu-container">
        <h1 className="main-menu-title">코딩 실험과 공부</h1>
        <p className="main-menu-subtitle">by 신희진</p>
        
        <div className="main-menu-buttons">
          <button 
            onClick={onSelectPocketbook} 
            className="main-menu-btn main-menu-btn-primary"
          >
            포켓북 만들기
          </button>
          
          <button 
            onClick={onSelectBlank} 
            className="main-menu-btn main-menu-btn-secondary"
          >
            빈칸 만들기
          </button>
          
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
            onClick={onSelectSum15} 
            className="main-menu-btn main-menu-btn-senary"
          >
            SUM15 <span className="btn-subtitle">(The passage suggests that ~ ) (ing/p.p. 위주 변환 두개)</span>
          </button>
          
          <button 
            onClick={onSelectSum40} 
            className="main-menu-btn main-menu-btn-septenary"
          >
            SUM40
          </button>
          
          <button 
            onClick={onSelectKey} 
            className="main-menu-btn main-menu-btn-octonary"
          >
            KEY
          </button>

          <button 
            onClick={onSelectCsatCloze} 
            className="main-menu-btn main-menu-btn-nonary"
          >
            빈칸 수능문제 출제기
          </button>

          <button 
            onClick={onSelectThirdWord} 
            className="main-menu-btn main-menu-btn-denary"
          >
            Third Word
          </button>

          <button 
            onClick={onSelectOcr} 
            className="main-menu-btn main-menu-btn-undenary"
          >
            📷 사진 텍스트 추출
          </button>

          <button 
            onClick={onSelectHomeworkDashboard} 
            className="main-menu-btn main-menu-btn-duodenary"
          >
            📚 과제 관리 대시보드
          </button>

          <button 
            onClick={onSelectClinicLog} 
            className="main-menu-btn main-menu-btn-clinic"
          >
            🗂️ 클리닉 대장
          </button>
        </div>
      </div>
    </div>
  )
}

export default MainMenu

