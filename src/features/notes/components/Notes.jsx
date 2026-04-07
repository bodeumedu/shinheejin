import { useMemo, useState, useEffect } from 'react'
import './Notes.css'

const STORAGE_KEY = 'suggestionNotes'
const MAX_LENGTH = 300

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Notes() {
  const [notes, setNotes] = useState([])
  const [noteContent, setNoteContent] = useState('')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setNotes(Array.isArray(parsed) ? parsed : [])
      }
    } catch (error) {
      console.warn('수정 제안 불러오기 실패:', error)
    }
  }, [])

  const saveNotes = (newNotes) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newNotes))
      setNotes(newNotes)
    } catch (error) {
      console.error('수정 제안 저장 실패:', error)
      alert('수정 제안 저장에 실패했습니다.')
    }
  }

  const remainingCount = useMemo(() => MAX_LENGTH - noteContent.length, [noteContent.length])

  const handleSaveNote = () => {
    const trimmed = noteContent.trim()
    if (!trimmed) {
      alert('수정 제안을 입력해주세요.')
      return
    }

    const now = new Date().toISOString()
    const newNote = {
      id: Date.now().toString(),
      content: trimmed,
      createdAt: now,
      updatedAt: now,
    }

    saveNotes([newNote, ...notes].slice(0, 100))
    setNoteContent('')
    alert('수정 제안이 저장되었습니다.')
  }

  const handleDeleteNote = (noteId) => {
    if (!confirm('이 수정 제안을 삭제하시겠습니까?')) return
    saveNotes(notes.filter((note) => note.id !== noteId))
  }

  return (
    <div className="notes-container">
      <div className="notes-main notes-suggestion-board">
        <div className="notes-suggestion-header">
          <h2>짧게 남겨주세요</h2>
          <p>누가 남겼는지 따로 표시되지 않으니 걱정하지 말고 편하게 적어주세요.</p>
          <p>시작해본 김에 괜찮은 프로그램을 만들고 싶으니 마구마구 제안해주세요.</p>
        </div>

        <div className="notes-quick-form">
          <textarea
            className="notes-content-textarea"
            placeholder="예: 버튼 위치가 헷갈려요 / 글씨가 너무 작아요 / 이 화면도 저장되면 좋겠어요"
            value={noteContent}
            maxLength={MAX_LENGTH}
            onChange={(event) => setNoteContent(event.target.value)}
          />
          <div className="notes-quick-form-footer">
            <span className="notes-count">{remainingCount}자 남음</span>
            <button className="notes-btn notes-btn-save" onClick={handleSaveNote}>
              추가
            </button>
          </div>
        </div>

        <div className="notes-list">
          {notes.length === 0 ? (
            <div className="notes-empty">아직 등록된 수정 제안이 없습니다.</div>
          ) : (
            notes.map((note, index) => (
              <div key={note.id} className="notes-item notes-suggestion-item">
                <div className="notes-suggestion-item-header">
                  <div className="notes-item-title">수정 제안 {notes.length - index}</div>
                  <button className="notes-btn notes-btn-delete" onClick={() => handleDeleteNote(note.id)}>
                    삭제
                  </button>
                </div>
                <div className="notes-item-date">{formatDateTime(note.createdAt || note.updatedAt)}</div>
                <div className="notes-content-display">
                  <pre className="notes-content-text">{note.content}</pre>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Notes


