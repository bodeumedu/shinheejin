import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../../../utils/firebase'
import {
  SCHOOL_LEVEL_OPTIONS,
  SUBJECT_OPTIONS,
  normalizeClassCatalog,
  buildClassFilterEntry,
} from '../../homework-completion/utils/classCatalogMeta'
import './AttendanceCheckPage.css'

const PHONE_DOC = 'homeworkCompletionPhoneNumbers'
const PHONE_DOC_ID = 'all'
const DATE_DATA_DOC = 'homeworkCompletionDateData'
const DATE_DATA_ID = 'all'
const WITHDRAWN_NAMES_FIELD = 'withdrawnNames'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const STATUS_OPTIONS = ['출석', '결석', '지각', '조퇴', '보강']

function formatLocalYMD(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseClassNames(classNameStr) {
  if (!classNameStr || typeof classNameStr !== 'string') return []
  return classNameStr.split(',').map((item) => item.trim()).filter(Boolean)
}

function normalizeWithdrawnNames(raw) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((n) => String(n || '').trim()).filter(Boolean))]
}

function extractStudentName(item) {
  if (item == null) return ''
  if (typeof item === 'string') return String(item).trim()
  if (typeof item === 'object') {
    const raw = item.name || item.student || item.studentName
    return raw != null ? String(raw).trim() : ''
  }
  return ''
}

function shiftDateYmd(ymd, deltaDays) {
  const d = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ymd
  d.setDate(d.getDate() + deltaDays)
  return formatLocalYMD(d)
}

function weekdayLabelForYmd(ymd) {
  const d = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return WEEKDAY_LABELS[d.getDay()] || ''
}

function countByStatus(map, students) {
  const counts = { 출석: 0, 결석: 0, 지각: 0, 조퇴: 0, 보강: 0 }
  students.forEach((name) => {
    const s = map[name]
    if (s && counts[s] !== undefined) counts[s] += 1
  })
  return counts
}

/** selectedDate가 속한 달의 모든 YYYY-MM-DD */
function listDatesInMonth(ymd) {
  const parts = String(ymd || '').split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  if (!y || !m) return []
  const last = new Date(y, m, 0).getDate()
  return Array.from({ length: last }, (_, i) => {
    const d = i + 1
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  })
}

function monthTitleFromYmd(ymd) {
  const parts = String(ymd || '').split('-')
  const y = parts[0]
  const m = Number(parts[1])
  if (!y || !m) return ''
  return `${y}년 ${m}월`
}

/** O / ✕ / △ — 보강·지각·조퇴는 △ + title로 구분 */
function statusToMark(status) {
  if (status === '출석') return { mark: 'O', className: 'attendance-month-mark--o', title: '출석' }
  if (status === '결석') return { mark: '✕', className: 'attendance-month-mark--x', title: '결석' }
  if (status === '보강') return { mark: '△', className: 'attendance-month-mark--tri', title: '보강' }
  if (status === '지각') return { mark: '△', className: 'attendance-month-mark--tri', title: '지각' }
  if (status === '조퇴') return { mark: '△', className: 'attendance-month-mark--tri', title: '조퇴' }
  return { mark: '', className: 'attendance-month-mark--empty', title: '' }
}

export default function AttendanceCheckPage({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [students, setStudents] = useState([])
  const [studentInfo, setStudentInfo] = useState({})
  const [addedClassList, setAddedClassList] = useState([])
  const [withdrawnNames, setWithdrawnNames] = useState([])
  const [classCatalog, setClassCatalog] = useState({})
  const [attendanceData, setAttendanceData] = useState({})

  const [selectedDate, setSelectedDate] = useState(() => formatLocalYMD())
  const [includeWithdrawn, setIncludeWithdrawn] = useState(false)
  const [schoolLevelFilter, setSchoolLevelFilter] = useState('전체')
  const [subjectFilter, setSubjectFilter] = useState('전체')
  const [view, setView] = useState('classes')
  const [selectedClass, setSelectedClass] = useState(null)
  const [localByStudent, setLocalByStudent] = useState({})
  const [sendSmsHint, setSendSmsHint] = useState(false)
  const [saving, setSaving] = useState(false)
  const draftDirtyRef = useRef(false)

  useEffect(() => {
    if (!isFirebaseConfigured() || !db) {
      setError('Firebase가 설정되지 않았습니다.')
      setLoading(false)
      return undefined
    }
    setLoading(true)
    setError('')
    const unsubPhone = onSnapshot(
      doc(db, PHONE_DOC, PHONE_DOC_ID),
      (snap) => {
        const data = snap.exists() ? snap.data() : {}
        setStudents(Array.isArray(data.students) ? data.students : [])
        setStudentInfo(data.studentInfo && typeof data.studentInfo === 'object' ? data.studentInfo : {})
        setAddedClassList(Array.isArray(data.addedClassList) ? data.addedClassList : [])
        setClassCatalog(normalizeClassCatalog(data.classCatalog || {}))
        setWithdrawnNames(normalizeWithdrawnNames(data[WITHDRAWN_NAMES_FIELD]))
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError(e?.message || '학생/반 정보를 불러오지 못했습니다.')
        setLoading(false)
      },
    )
    const unsubDate = onSnapshot(
      doc(db, DATE_DATA_DOC, DATE_DATA_ID),
      (snap) => {
        const data = snap.exists() ? snap.data() : {}
        const raw = data.attendanceData && typeof data.attendanceData === 'object' ? data.attendanceData : {}
        setAttendanceData(JSON.parse(JSON.stringify(raw)))
      },
      (e) => console.error('출석 데이터 구독 오류:', e),
    )
    return () => {
      unsubPhone()
      unsubDate()
    }
  }, [])

  const withdrawnSet = useMemo(() => new Set(withdrawnNames), [withdrawnNames])

  const rosterStudents = useMemo(() => {
    const names = [...new Set((Array.isArray(students) ? students : []).map(extractStudentName).filter(Boolean))]
    if (includeWithdrawn) return names
    return names.filter((n) => !withdrawnSet.has(n))
  }, [students, includeWithdrawn, withdrawnSet])

  const classOptions = useMemo(() => {
    const set = new Set()
    rosterStudents.forEach((student) => {
      parseClassNames(studentInfo[student]?.className || '').forEach((cn) => set.add(cn))
    })
    addedClassList.forEach((cn) => {
      if (cn) set.add(cn)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [rosterStudents, studentInfo, addedClassList])

  const filteredClasses = useMemo(() => {
    return classOptions
      .filter((classKey) => {
        const meta = buildClassFilterEntry(classKey, classCatalog)
        const levelOk = schoolLevelFilter === '전체' || meta.level === schoolLevelFilter
        const subjectOk = subjectFilter === '전체' || meta.subject === subjectFilter
        return levelOk && subjectOk
      })
      .sort((a, b) => a.localeCompare(b, 'ko'))
  }, [classOptions, classCatalog, schoolLevelFilter, subjectFilter])

  const classStudents = useMemo(() => {
    if (!selectedClass) return []
    return rosterStudents
      .filter((student) => parseClassNames(studentInfo[student]?.className || '').includes(selectedClass))
      .sort((a, b) => a.localeCompare(b, 'ko'))
  }, [rosterStudents, studentInfo, selectedClass])

  const serverSlice = useMemo(() => {
    if (!selectedDate || !selectedClass) return {}
    const day = attendanceData[selectedDate]
    if (!day || typeof day !== 'object') return {}
    const row = day[selectedClass]
    return row && typeof row === 'object' && !Array.isArray(row) ? row : {}
  }, [attendanceData, selectedDate, selectedClass])

  useEffect(() => {
    if (view !== 'check' || !selectedClass) return
    if (draftDirtyRef.current) return
    const next = {}
    classStudents.forEach((name) => {
      const v = serverSlice[name]
      next[name] = STATUS_OPTIONS.includes(v) ? v : ''
    })
    setLocalByStudent(next)
  }, [view, selectedClass, selectedDate, classStudents, serverSlice])

  const counts = useMemo(() => countByStatus(localByStudent, classStudents), [localByStudent, classStudents])

  const monthDateList = useMemo(() => listDatesInMonth(selectedDate), [selectedDate])

  /** 항상 1~31일 열 (해당 월에 없는 날은 빈 칸) */
  const monthDayColumns = useMemo(() => {
    const dim = monthDateList.length
    return Array.from({ length: 31 }, (_, i) => {
      const dayNum = i + 1
      if (dayNum > dim) {
        return { dayNum, dateYmd: null, weekday: '' }
      }
      const dateYmd = monthDateList[dayNum - 1]
      return {
        dayNum,
        dateYmd,
        weekday: weekdayLabelForYmd(dateYmd),
      }
    })
  }, [monthDateList])

  const monthStudentRows = useMemo(() => {
    if (!selectedClass || classStudents.length === 0) return []

    const resolveStatus = (dateYmd, student) => {
      if (!dateYmd) return ''
      let status = ''
      if (dateYmd === selectedDate) {
        const local = localByStudent[student]
        if (STATUS_OPTIONS.includes(local)) status = local
      }
      if (!status) {
        const dayBlob = attendanceData[dateYmd]
        const classBlob =
          dayBlob && typeof dayBlob === 'object' && !Array.isArray(dayBlob) ? dayBlob[selectedClass] : null
        const v = classBlob && typeof classBlob === 'object' ? classBlob[student] : ''
        if (STATUS_OPTIONS.includes(v)) status = v
      }
      return status
    }

    return classStudents.map((student) => ({
      student,
      cells: monthDayColumns.map((col) => {
        if (!col.dateYmd) {
          return {
            isPlaceholder: true,
            mark: '',
            className: 'attendance-month-mark--na',
            title: '',
            isToday: false,
          }
        }
        const status = resolveStatus(col.dateYmd, student)
        const { mark, className, title } = statusToMark(status)
        return {
          isPlaceholder: false,
          dateYmd: col.dateYmd,
          status,
          mark,
          className,
          title,
          isToday: col.dateYmd === selectedDate,
        }
      }),
    }))
  }, [monthDayColumns, selectedClass, classStudents, attendanceData, selectedDate, localByStudent])

  const openClass = useCallback((className) => {
    draftDirtyRef.current = false
    setSelectedClass(className)
    setView('check')
  }, [])

  const goBackToClasses = useCallback(() => {
    draftDirtyRef.current = false
    setView('classes')
    setSelectedClass(null)
  }, [])

  const setStudentStatus = useCallback((student, status) => {
    draftDirtyRef.current = true
    setLocalByStudent((prev) => ({
      ...prev,
      [student]: prev[student] === status ? '' : status,
    }))
  }, [])

  const handleAllPresent = useCallback(() => {
    draftDirtyRef.current = true
    setLocalByStudent((prev) => {
      const next = { ...prev }
      classStudents.forEach((name) => {
        next[name] = '출석'
      })
      return next
    })
  }, [classStudents])

  const handleSave = useCallback(async () => {
    if (!isFirebaseConfigured() || !db || !selectedDate || !selectedClass) return
    setSaving(true)
    setError('')
    try {
      const ref = doc(db, DATE_DATA_DOC, DATE_DATA_ID)
      const snap = await getDoc(ref)
      const data = snap.exists() ? snap.data() : {}
      const prevRoot =
        data.attendanceData && typeof data.attendanceData === 'object' && !Array.isArray(data.attendanceData)
          ? { ...data.attendanceData }
          : {}
      const prevDay = { ...(prevRoot[selectedDate] && typeof prevRoot[selectedDate] === 'object' ? prevRoot[selectedDate] : {}) }
      const prevClass =
        prevDay[selectedClass] && typeof prevDay[selectedClass] === 'object' && !Array.isArray(prevDay[selectedClass])
          ? { ...prevDay[selectedClass] }
          : {}
      const mergedClass = { ...prevClass }
      classStudents.forEach((name) => {
        const v = localByStudent[name]
        if (v && STATUS_OPTIONS.includes(v)) mergedClass[name] = v
        else delete mergedClass[name]
      })
      prevDay[selectedClass] = mergedClass
      prevRoot[selectedDate] = prevDay
      await setDoc(ref, { attendanceData: prevRoot }, { merge: true })
      draftDirtyRef.current = false
    } catch (e) {
      console.error(e)
      setError(e?.message || '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }, [selectedDate, selectedClass, classStudents, localByStudent])

  const handleDismissalSms = useCallback(() => {
    if (!sendSmsHint) {
      window.alert('먼저 「문자발송」을 선택해 주세요.')
      return
    }
    window.alert('하원 문자 발송은 별도 연동 전까지 이 버튼은 안내용입니다.')
  }, [sendSmsHint])

  if (loading) {
    return (
      <div className="attendance-page">
        <div className="attendance-page-inner attendance-page-loading">불러오는 중…</div>
      </div>
    )
  }

  return (
    <div className="attendance-page">
      <div className="attendance-page-inner">
        <header className="attendance-header">
          {view === 'check' ? (
            <button type="button" className="attendance-back" onClick={goBackToClasses} aria-label="뒤로">
              ←
            </button>
          ) : (
            <span className="attendance-back-spacer" />
          )}
          <h1 className="attendance-title">{view === 'check' ? '출석 체크' : '출석부'}</h1>
          <button type="button" className="attendance-close" onClick={onClose}>
            닫기
          </button>
        </header>

        {error ? <div className="attendance-error">{error}</div> : null}

        {view === 'classes' ? (
          <>
            <div className="attendance-date-row">
              <button type="button" className="attendance-date-nav" onClick={() => setSelectedDate((d) => shiftDateYmd(d, -1))}>
                ‹
              </button>
              <span className="attendance-date-label">
                {selectedDate} ({weekdayLabelForYmd(selectedDate)})
              </span>
              <button type="button" className="attendance-date-nav" onClick={() => setSelectedDate((d) => shiftDateYmd(d, 1))}>
                ›
              </button>
              <label className="attendance-calendar-pick">
                📅
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value || formatLocalYMD())}
                />
              </label>
            </div>

            <div className="attendance-withdrawn-row">
              <span className="attendance-withdrawn-label">퇴원생 표시</span>
              <label className="attendance-checkbox">
                <input
                  type="checkbox"
                  checked={includeWithdrawn}
                  onChange={(e) => setIncludeWithdrawn(e.target.checked)}
                />
                퇴원생 포함
              </label>
            </div>

            <div className="attendance-filter-row">
              <div className="attendance-field attendance-field--grow">
                <label className="attendance-field-label">학교급</label>
                <select
                  className="attendance-select"
                  value={schoolLevelFilter}
                  onChange={(e) => setSchoolLevelFilter(e.target.value)}
                >
                  {SCHOOL_LEVEL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="attendance-field attendance-field--grow">
                <label className="attendance-field-label">과목</label>
                <select
                  className="attendance-select"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                >
                  <option value="전체">전체</option>
                  {SUBJECT_OPTIONS.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="attendance-class-list-head">반목록 ({filteredClasses.length}개)</div>
            <ul className="attendance-class-list">
              {filteredClasses.length === 0 ? (
                <li className="attendance-class-empty">조건에 맞는 반이 없습니다.</li>
              ) : (
                filteredClasses.map((cn) => (
                  <li key={cn}>
                    <button type="button" className="attendance-class-item" onClick={() => openClass(cn)}>
                      {cn}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="attendance-check-meta">
              <div>
                {selectedDate} ({weekdayLabelForYmd(selectedDate)})
              </div>
              <div className="attendance-check-class-name">{selectedClass}</div>
            </div>

            <div className="attendance-summary" role="status">
              <span className="attendance-summary-item attendance-summary-present">출석 {counts.출석}</span>
              <span className="attendance-summary-item attendance-summary-absent">결석 {counts.결석}</span>
              <span className="attendance-summary-item attendance-summary-late">지각 {counts.지각}</span>
              <span className="attendance-summary-item attendance-summary-early">조퇴 {counts.조퇴}</span>
              <span className="attendance-summary-item attendance-summary-makeup">보강 {counts.보강}</span>
            </div>

            <div className="attendance-toolbar">
              <label className="attendance-checkbox attendance-toolbar-sms">
                <input type="checkbox" checked={sendSmsHint} onChange={(e) => setSendSmsHint(e.target.checked)} />
                문자발송
              </label>
              <button type="button" className="attendance-btn attendance-btn-secondary" onClick={handleAllPresent}>
                전체출석
              </button>
              <button type="button" className="attendance-btn attendance-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>

            <div className="attendance-table-wrap">
              <div className="attendance-table-head">
                <span>학생</span>
                <span>출결사항</span>
              </div>
              <ul className="attendance-student-list">
                {classStudents.map((student) => (
                  <li key={student} className="attendance-student-row">
                    <div className="attendance-student-name">{student}</div>
                    <div className="attendance-status-btns">
                      {STATUS_OPTIONS.map((st) => (
                        <button
                          key={st}
                          type="button"
                          className={
                            localByStudent[student] === st ? 'attendance-status-btn is-active' : 'attendance-status-btn'
                          }
                          onClick={() => setStudentStatus(student, st)}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <footer className="attendance-footer">
              <span className="attendance-footer-count">총원 {classStudents.length}명</span>
              <button type="button" className="attendance-btn attendance-btn-primary" onClick={handleDismissalSms}>
                하원문자발송
              </button>
            </footer>

            <section className="attendance-month-section" aria-label="이번 달 출결 표">
              <h2 className="attendance-month-heading">{monthTitleFromYmd(selectedDate)} 출결 한눈에 보기</h2>
              <p className="attendance-month-legend">
                <span>왼쪽은 학생 이름, 오른쪽 1~31일 열이 해당 월 날짜입니다.</span>
                <span>
                  <strong className="attendance-month-mark attendance-month-mark--o">O</strong> 출석
                </span>
                <span>
                  <strong className="attendance-month-mark attendance-month-mark--x">✕</strong> 결석
                </span>
                <span>
                  <strong className="attendance-month-mark attendance-month-mark--tri">△</strong> 지각·조퇴·보강 (칸에 마우스를 올리면 구분)
                </span>
              </p>
              <div className="attendance-month-scroll">
                <table className="attendance-month-table attendance-month-table--by-student">
                  <thead>
                    <tr>
                      <th scope="col" className="attendance-month-th-name-corner">
                        학생
                      </th>
                      {monthDayColumns.map((col) => (
                        <th
                          key={col.dayNum}
                          scope="col"
                          className={
                            !col.dateYmd
                              ? 'attendance-month-th-day attendance-month-th-day--na'
                              : col.dateYmd === selectedDate
                                ? 'attendance-month-th-day attendance-month-th-day--today'
                                : 'attendance-month-th-day'
                          }
                          title={col.dateYmd ? `${col.dateYmd} (${col.weekday})` : '해당 월 없음'}
                        >
                          {col.dateYmd ? (
                            <>
                              <span className="attendance-month-day-num">{col.dayNum}</span>
                              <span className="attendance-month-day-wd">{col.weekday}</span>
                            </>
                          ) : (
                            <span className="attendance-month-day-num attendance-month-day-num--na">{col.dayNum}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthStudentRows.map((row) => (
                      <tr key={row.student}>
                        <th scope="row" className="attendance-month-th-student-name" title={row.student}>
                          <span className="attendance-month-th-student-name-inner">{row.student}</span>
                        </th>
                        {row.cells.map((cell, idx) => (
                          <td
                            key={`${row.student}-${monthDayColumns[idx].dayNum}`}
                            className={
                              cell.isPlaceholder
                                ? 'attendance-month-td attendance-month-td--na'
                                : cell.isToday
                                  ? 'attendance-month-td attendance-month-td--today'
                                  : 'attendance-month-td'
                            }
                          >
                            {cell.isPlaceholder ? (
                              <span className="attendance-month-mark attendance-month-mark--na" aria-hidden>
                                {' '}
                              </span>
                            ) : cell.mark ? (
                              <span
                                className={`attendance-month-mark ${cell.className}`}
                                title={cell.title || cell.status}
                              >
                                {cell.mark}
                              </span>
                            ) : (
                              <span className="attendance-month-mark attendance-month-mark--empty">·</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
