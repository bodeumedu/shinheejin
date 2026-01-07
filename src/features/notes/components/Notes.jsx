import { useState, useEffect } from 'react'
import './Notes.css'

function Notes() {
  const [notes, setNotes] = useState([])
  const [selectedNote, setSelectedNote] = useState(null)
  const [noteContent, setNoteContent] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // localStorage에서 노트 불러오기
  useEffect(() => {
    try {
      const stored = localStorage.getItem('notes')
      if (stored) {
        const parsed = JSON.parse(stored)
        setNotes(parsed)
      }
    } catch (error) {
      console.warn('노트 불러오기 실패:', error)
    }
  }, [])

  // 노트 목록 저장
  const saveNotes = (newNotes) => {
    try {
      localStorage.setItem('notes', JSON.stringify(newNotes))
      setNotes(newNotes)
    } catch (error) {
      console.error('노트 저장 실패:', error)
      alert('노트 저장에 실패했습니다.')
    }
  }

  // 새 노트 만들기
  const handleNewNote = () => {
    setSelectedNote(null)
    setNoteTitle('')
    setNoteContent('')
    setIsEditing(true)
  }

  // 노트 선택
  const handleSelectNote = (note) => {
    setSelectedNote(note)
    setNoteTitle(note.title)
    setNoteContent(note.content)
    setIsEditing(false)
  }

  // 노트 저장
  const handleSaveNote = () => {
    if (!noteTitle.trim()) {
      alert('제목을 입력해주세요.')
      return
    }

    const now = new Date().toISOString()
    const newNote = {
      id: selectedNote ? selectedNote.id : Date.now().toString(),
      title: noteTitle.trim(),
      content: noteContent.trim(),
      updatedAt: now,
      createdAt: selectedNote ? selectedNote.createdAt : now
    }

    let newNotes
    if (selectedNote) {
      // 기존 노트 수정
      newNotes = notes.map(note => 
        note.id === selectedNote.id ? newNote : note
      )
    } else {
      // 새 노트 추가
      newNotes = [...notes, newNote]
    }

    // 제목순으로 정렬
    newNotes.sort((a, b) => a.title.localeCompare(b.title))

    saveNotes(newNotes)
    setSelectedNote(newNote)
    setIsEditing(false)
    alert('저장되었습니다.')
  }

  // 노트 삭제
  const handleDeleteNote = () => {
    if (!selectedNote) return
    
    if (!confirm(`"${selectedNote.title}" 노트를 삭제하시겠습니까?`)) {
      return
    }

    const newNotes = notes.filter(note => note.id !== selectedNote.id)
    saveNotes(newNotes)
    setSelectedNote(null)
    setNoteTitle('')
    setNoteContent('')
    setIsEditing(false)
  }

  // 노트 편집 모드
  const handleEditNote = () => {
    setIsEditing(true)
  }

  // 취소
  const handleCancel = () => {
    if (selectedNote) {
      setNoteTitle(selectedNote.title)
      setNoteContent(selectedNote.content)
    } else {
      setNoteTitle('')
      setNoteContent('')
    }
    setIsEditing(false)
  }

  return (
    <div className="notes-container">
      <div className="notes-sidebar">
        <div className="notes-sidebar-header">
          <h2>노트 목록</h2>
          <button 
            className="notes-btn notes-btn-new"
            onClick={handleNewNote}
          >
            + 새 노트
          </button>
        </div>
        
        <div className="notes-list">
          {notes.length === 0 ? (
            <div className="notes-empty">노트가 없습니다.</div>
          ) : (
            notes.map(note => (
              <div
                key={note.id}
                className={`notes-item ${selectedNote?.id === note.id ? 'active' : ''}`}
                onClick={() => handleSelectNote(note)}
              >
                <div className="notes-item-title">{note.title}</div>
                <div className="notes-item-date">
                  {new Date(note.updatedAt).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="notes-main">
        {selectedNote || isEditing ? (
          <div className="notes-editor">
            <div className="notes-editor-header">
              {isEditing ? (
                <>
                  <input
                    type="text"
                    className="notes-title-input"
                    placeholder="제목을 입력하세요"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                  />
                  <div className="notes-editor-actions">
                    <button
                      className="notes-btn notes-btn-save"
                      onClick={handleSaveNote}
                    >
                      저장
                    </button>
                    <button
                      className="notes-btn notes-btn-cancel"
                      onClick={handleCancel}
                    >
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="notes-title">{selectedNote?.title}</h2>
                  <div className="notes-editor-actions">
                    <button
                      className="notes-btn notes-btn-edit"
                      onClick={handleEditNote}
                    >
                      수정
                    </button>
                    <button
                      className="notes-btn notes-btn-delete"
                      onClick={handleDeleteNote}
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <div className="notes-editor-content">
              {isEditing ? (
                <textarea
                  className="notes-content-textarea"
                  placeholder="내용을 입력하세요..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                />
              ) : (
                <div className="notes-content-display">
                  {selectedNote?.content ? (
                    <pre className="notes-content-text">{selectedNote.content}</pre>
                  ) : (
                    <div className="notes-empty-content">내용이 없습니다.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="notes-welcome">
            <h2>노트를 선택하거나 새로 만들어주세요</h2>
            <p>왼쪽에서 노트를 선택하거나 "새 노트" 버튼을 클릭하세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Notes


