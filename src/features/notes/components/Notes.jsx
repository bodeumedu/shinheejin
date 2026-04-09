import { useMemo, useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getStoredSessionUser } from '../../auth/utils/userAuth'
import { db, isFirebaseConfigured } from '../../../utils/firebase'
import {
  submitSuggestionNoteToFirestore,
  SUGGESTION_NOTES_COLLECTION,
} from '../utils/suggestionNotesFirestore'
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

function persistNotesList(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (error) {
    console.error('수정 제안 저장 실패:', error)
    throw error
  }
}

function Notes() {
  const [notes, setNotes] = useState([])
  const [noteContent, setNoteContent] = useState('')

  const firestoreIdsKey = useMemo(() => {
    const ids = notes.map((n) => n.firestoreId).filter(Boolean)
    return [...new Set(ids)].sort().join(',')
  }, [notes])

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
      persistNotesList(newNotes)
      setNotes(newNotes)
    } catch {
      alert('수정 제안 저장에 실패했습니다.')
    }
  }

  useEffect(() => {
    if (!isFirebaseConfigured() || !db || !firestoreIdsKey) return undefined
    const ids = firestoreIdsKey.split(',').filter(Boolean)
    const unsubs = ids.map((fid) =>
      onSnapshot(doc(db, SUGGESTION_NOTES_COLLECTION, fid), (snap) => {
        if (!snap.exists()) return
        const d = snap.data() || {}
        const resolved = d.resolved === true
        let resolvedAtIso = null
        if (d.resolvedAt && typeof d.resolvedAt.toDate === 'function') {
          resolvedAtIso = d.resolvedAt.toDate().toISOString()
        }
        setNotes((prev) => {
          const idx = prev.findIndex((item) => item.firestoreId === fid)
          if (idx < 0) return prev
          const p = prev[idx]
          const nextResolvedAt = resolved ? (resolvedAtIso ?? p.resolvedAt) : null
          if (p.resolved === resolved && p.resolvedAt === nextResolvedAt) return prev
          const next = [...prev]
          next[idx] = { ...p, resolved, resolvedAt: nextResolvedAt }
          try {
            persistNotesList(next)
          } catch (e) {
            console.warn('수정 제안 동기화 저장 실패:', e)
          }
          return next
        })
      })
    )
    return () => unsubs.forEach((u) => u())
  }, [firestoreIdsKey])

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

    const nextLocal = [newNote, ...notes].slice(0, 100)
    saveNotes(nextLocal)
    setNoteContent('')

    const session = getStoredSessionUser()
    void submitSuggestionNoteToFirestore({
      content: trimmed,
      localId: newNote.id,
      submitterName: session?.name,
      submitterPhone: session?.phoneNumber,
      submitterRole: session?.role,
    }).then((r) => {
      if (!r.ok && r.reason !== 'no_firebase') {
        console.warn('수정 제안 서버 동기화 실패:', r.reason, r.error)
        return
      }
      if (r.ok && r.id) {
        setNotes((prev) => {
          const next = prev.map((n) => (n.id === newNote.id ? { ...n, firestoreId: r.id } : n))
          try {
            persistNotesList(next)
          } catch (e) {
            console.warn('Firestore ID 저장 실패:', e)
          }
          return next
        })
      }
    })

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
          <p>이 화면에는 누가 남겼는지 표시되지 않습니다. 로그인한 상태로 남기면 관리자만 출처를 볼 수 있습니다.</p>
          <p>Firebase로 올라간 제안은 관리자가 「수정 완료」로 표시하면, 여기 목록에 <strong>반영 완료</strong>로 보입니다.</p>
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
              <div
                key={note.id}
                className={`notes-item notes-suggestion-item${note.resolved ? ' notes-suggestion-item--resolved' : ''}`}
              >
                <div className="notes-suggestion-item-header">
                  <div className="notes-item-title">수정 제안 {notes.length - index}</div>
                  <div className="notes-suggestion-item-header-actions">
                    {note.resolved ? (
                      <span className="notes-resolved-badge" title={note.resolvedAt ? formatDateTime(note.resolvedAt) : ''}>
                        반영 완료
                      </span>
                    ) : note.firestoreId ? (
                      <span className="notes-pending-badge">처리 대기</span>
                    ) : null}
                    <button className="notes-btn notes-btn-delete" onClick={() => handleDeleteNote(note.id)}>
                      삭제
                    </button>
                  </div>
                </div>
                <div className="notes-item-date">
                  {formatDateTime(note.createdAt || note.updatedAt)}
                  {note.resolved && note.resolvedAt ? (
                    <span className="notes-resolved-date"> · 반영 {formatDateTime(note.resolvedAt)}</span>
                  ) : null}
                </div>
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


