import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../../../utils/firebase'
import { deactivatePocketbookUser, normalizePhoneNumber } from '../../auth/utils/userAuth'
import './ExamCalendarPage.css'

const EXAM_DOC_PATH = ['academicCalendar', 'examSchedules']
const EVENT_DOC_PATH = ['academicCalendar', 'teacherEvents']
const CLASS_CATALOG_DOC_PATH = ['homeworkCompletionPhoneNumbers', 'all']
const SCHOOL_OPTIONS = [
  '중앙고',
  '과천고',
  '과천외고',
  '과천여고',
  '인덕원고',
  '문원중',
  '과천중',
  '율목중',
  '갈현초',
  '청계초',
  '과천초',
  '기타',
]
const SUBJECT_OPTIONS = ['영어', '수학', '국어', '일본어', '중국어', '기타']

const DEFAULT_EXAM_FORM = {
  schoolName: SCHOOL_OPTIONS[0],
  customSchoolName: '',
  grade: '1학년',
  subject: SUBJECT_OPTIONS[0],
  examDate: '',
  rangeText: '',
  ocrRawText: '',
  teacherNames: [],
}

const DEFAULT_EVENT_FORM = {
  title: '',
  date: '',
  type: '휴강',
  teacherName: '',
  teacherNames: [],
  className: '',
  note: '',
}

function buildDefaultEventForm(userName = '', date = getTodayKey()) {
  return {
    ...DEFAULT_EVENT_FORM,
    teacherName: userName || '',
    teacherNames: userName ? [userName] : [],
    date,
  }
}

function getDocRef(pathParts) {
  return doc(db, ...pathParts)
}

function getSchoolName(form) {
  return form.schoolName === '기타' ? form.customSchoolName.trim() : form.schoolName
}

function formatRoleLabel(role) {
  if (role === 'executive') return '운영진'
  if (role === 'staff') return '직원'
  return '선생님'
}

function getMonthKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function formatLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayKey() {
  return formatLocalDateKey(new Date())
}

function formatDateLabel(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

function normalizeTeacherNames(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  }
  if (!value) return []
  return [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))]
}

function simplifyTeacherName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/선생님|쌤|강사|팀/gi, '')
    .replace(/[Tt]$/g, '')
}

function teacherNamesLikelyMatch(a, b) {
  const left = simplifyTeacherName(a)
  const right = simplifyTeacherName(b)
  if (!left || !right) return false
  return left === right
}

function resolveCurrentUserTeacherNames(currentUser, teacherOptions = []) {
  const baseNames = normalizeTeacherNames(currentUser?.linkedTeacherNames)
  if (currentUser?.name) baseNames.push(String(currentUser.name).trim())
  const uniqueBaseNames = [...new Set(baseNames.filter(Boolean))]
  const matchedTeacherOptions = teacherOptions.filter((teacherName) =>
    uniqueBaseNames.some((baseName) => teacherNamesLikelyMatch(baseName, teacherName)),
  )
  return [...new Set([...uniqueBaseNames, ...matchedTeacherOptions])]
}

function extractTeacherNameFromClassKey(classKey) {
  const parts = String(classKey || '').split('_')
  return String(parts[1] || '').trim()
}

function extractDayToken(value) {
  const matches = String(value || '').match(/[일월화수목금토]{1,7}/g)
  if (!matches?.length) return ''
  return matches[matches.length - 1]
}

function buildTeacherOptionsFromHomeworkData(rawData = {}) {
  const names = new Set()

  const classCatalog = rawData?.classCatalog || {}
  Object.entries(classCatalog).forEach(([classKey, item]) => {
    const keyTeacher = extractTeacherNameFromClassKey(classKey)
    const teacher = String(item?.teacher || keyTeacher || '').trim()
    if (teacher) names.add(teacher)
  })

  const addedClassList = Array.isArray(rawData?.addedClassList) ? rawData.addedClassList : []
  addedClassList.forEach((classKey) => {
    const teacher = extractTeacherNameFromClassKey(classKey)
    if (teacher) names.add(teacher)
  })

  const studentInfo = rawData?.studentInfo && typeof rawData.studentInfo === 'object' ? rawData.studentInfo : {}
  Object.values(studentInfo).forEach((info) => {
    String(info?.className || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((classKey) => {
        const teacher = extractTeacherNameFromClassKey(classKey)
        if (teacher) names.add(teacher)
      })
  })

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ko'))
}

function formatTeacherNames(value) {
  const teachers = normalizeTeacherNames(value)
  return teachers.length ? teachers.join(', ') : ''
}

function buildMonthCells(monthKey) {
  const [yearText, monthText] = monthKey.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1
  const firstDay = new Date(year, monthIndex, 1)
  const lastDate = new Date(year, monthIndex + 1, 0).getDate()
  const startWeekday = firstDay.getDay()
  const cells = []

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, monthIndex, day)
    cells.push(formatLocalDateKey(date))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function parseClassMetaFromKey(classKey) {
  const parts = String(classKey || '')
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean)
  const year = String(parts[0] || '').trim()
  const teacher = String(parts[1] || '').trim()
  const tail = parts.slice(2)

  if (tail.length === 0) {
    return {
      year,
      teacher,
      className: '',
      subject: '',
      day: '',
      time: '',
    }
  }

  let time = ''
  const lastPart = String(tail[tail.length - 1] || '').trim()
  const timeMatch = lastPart.match(/(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)$/)
  if (timeMatch) {
    time = timeMatch[1]
    const withoutTime = lastPart.slice(0, timeMatch.index).trim()
    if (withoutTime) {
      tail[tail.length - 1] = withoutTime
    } else {
      tail.pop()
    }
  }

  let day = ''
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    const part = String(tail[index] || '').trim()
    const detectedDay = extractDayToken(part)
    if (!detectedDay) continue
    day = detectedDay
    const withoutDay = part.replace(detectedDay, '').trim()
    if (withoutDay) {
      tail[index] = withoutDay
    } else {
      tail.splice(index, 1)
    }
    break
  }

  if (tail.length >= 2 && tail[0] === teacher) {
    tail.shift()
  }

  const className = String(tail[0] || '').trim()
  const subject = tail.slice(1).join(' ').trim()

  return {
    year,
    teacher,
    className,
    subject,
    day,
    time,
  }
}

function normalizeClassCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  Object.entries(value).forEach(([classKey, raw]) => {
    const parsed = parseClassMetaFromKey(classKey)
    out[classKey] = {
      classKey,
      year: String(raw?.year || parsed.year || '').trim(),
      teacher: String(raw?.teacher || parsed.teacher || '').trim(),
      className: String(raw?.className || parsed.className || '').trim(),
      subject: String(raw?.subject || '').trim(),
      hall: String(raw?.hall || '').trim(),
      day: String(raw?.day || parsed.day || '').trim(),
      time: String(raw?.time || parsed.time || '').trim(),
      room: String(raw?.room || '').trim(),
    }
  })
  return out
}

function buildRegularClassEntriesFromHomeworkData(rawData = {}) {
  const classCatalog = normalizeClassCatalog(rawData?.classCatalog || {})
  const classKeySet = new Set(Object.keys(classCatalog))

  const addedClassList = Array.isArray(rawData?.addedClassList) ? rawData.addedClassList : []
  addedClassList.forEach((classKey) => {
    const trimmed = String(classKey || '').trim()
    if (trimmed) classKeySet.add(trimmed)
  })

  const studentInfo = rawData?.studentInfo && typeof rawData.studentInfo === 'object' ? rawData.studentInfo : {}
  Object.values(studentInfo).forEach((info) => {
    String(info?.className || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((classKey) => classKeySet.add(classKey))
  })

  return Array.from(classKeySet)
    .map((classKey) => {
      const parsed = parseClassMetaFromKey(classKey)
      const item = classCatalog[classKey] || {}
      return {
        classKey,
        year: String(item.year || parsed.year || '').trim(),
        teacher: String(item.teacher || parsed.teacher || '').trim(),
        className: String(item.className || parsed.className || '').trim(),
        subject: String(item.subject || parsed.subject || '').trim(),
        hall: String(item.hall || '').trim(),
        day: String(item.day || parsed.day || '').trim(),
        time: String(item.time || parsed.time || '').trim(),
        room: String(item.room || '').trim(),
      }
    })
    .filter((item) => item.className && item.teacher && item.day && item.time)
}

function getWeekdayIndexesFromDayText(dayText) {
  const weekdayMap = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }
  return [...new Set(String(dayText || '').split('').map((char) => weekdayMap[char]).filter((value) => value !== undefined))]
}

async function extractExamTextFromImage(file, apiKey) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('이미지 읽기에 실패했습니다.'))
    reader.readAsDataURL(file)
  })

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '학교 시험범위표 또는 시험일정표 이미지입니다. 한글 표 구조를 최대한 유지해서 OCR 텍스트만 추출해주세요. 날짜, 학교명, 학년, 과목, 범위 문구를 빠뜨리지 말고 그대로 적어주세요.',
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 2500,
    }),
  })

  if (!response.ok) {
    throw new Error(`OCR 요청 실패 (${response.status})`)
  }

  const payload = await response.json()
  return payload?.choices?.[0]?.message?.content?.trim() || ''
}

async function parseExamScheduleWithAI(apiKey, rawText, fallbackSchoolName = '', teacherOptions = []) {
  const currentYear = new Date().getFullYear()
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You extract Korean school exam schedule data from OCR text. Return valid JSON only.',
        },
        {
          role: 'user',
          content:
            `다음 OCR 텍스트를 읽고 시험 일정을 구조화해주세요.\n` +
            `반드시 JSON만 반환하고 형식은 {"items":[...]} 로 맞춰주세요.\n` +
            `각 item 필드: schoolName, grade, subject, examDate, rangeText, teacherNames.\n` +
            `examDate는 반드시 YYYY-MM-DD 형식으로 맞춰주세요. 연도가 없으면 ${currentYear}년으로 추정하세요.\n` +
            `teacherNames는 배열이며, OCR에 담당 선생님이 없으면 빈 배열로 두세요.\n` +
            `학교명이 명확하지 않으면 기본 학교명 "${fallbackSchoolName || ''}"을 우선 사용하세요.\n` +
            `가능한 과목은 ${SUBJECT_OPTIONS.join(', ')} 입니다.\n` +
            `참고 가능한 선생님 목록: ${teacherOptions.join(', ') || '없음'}\n\n` +
            `[OCR 원문 시작]\n${rawText}\n[OCR 원문 끝]`,
        },
      ],
      max_tokens: 2200,
    }),
  })

  if (!response.ok) {
    throw new Error(`AI 파싱 요청 실패 (${response.status})`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content?.trim() || '{}'
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    throw new Error('AI 파싱 결과를 읽지 못했습니다.')
  }

  return Array.isArray(parsed?.items) ? parsed.items : []
}

export default function ExamCalendarPage({ onClose, currentUser, apiKey }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [monthKey, setMonthKey] = useState(getMonthKey(new Date()))
  const [selectedSchool, setSelectedSchool] = useState('전체')
  const [selectedDate, setSelectedDate] = useState(getTodayKey())
  const [showMineOnly, setShowMineOnly] = useState(false)
  const [examSchedules, setExamSchedules] = useState([])
  const [teacherEvents, setTeacherEvents] = useState([])
  const [teacherOptions, setTeacherOptions] = useState([])
  const [regularClassEntries, setRegularClassEntries] = useState([])
  const [parsedExamCandidates, setParsedExamCandidates] = useState([])
  const [deactivatePhone, setDeactivatePhone] = useState('')
  const [examForm, setExamForm] = useState(DEFAULT_EXAM_FORM)
  const [editingTeacherEventId, setEditingTeacherEventId] = useState('')
  const [eventForm, setEventForm] = useState(buildDefaultEventForm(currentUser?.name || '', getTodayKey()))

  const isExecutive = currentUser?.role === 'executive'
  const currentUserTeacherNames = useMemo(
    () => resolveCurrentUserTeacherNames(currentUser, teacherOptions),
    [currentUser, teacherOptions],
  )

  const visibleExamSchedules = useMemo(() => {
    return examSchedules.filter((item) => {
      if (selectedSchool !== '전체' && item.schoolName !== selectedSchool) return false
      const itemTeachers = normalizeTeacherNames(item.teacherNames || item.teacherName)
      if (showMineOnly && itemTeachers.length === 0) return false
      if (
        showMineOnly &&
        itemTeachers.length &&
        !itemTeachers.some((teacherName) =>
          currentUserTeacherNames.some((userTeacherName) => teacherNamesLikelyMatch(userTeacherName, teacherName)),
        )
      ) {
        return false
      }
      return true
    })
  }, [examSchedules, selectedSchool, showMineOnly, currentUserTeacherNames])

  const visibleTeacherEvents = useMemo(() => {
    return teacherEvents.filter((item) => {
      const itemTeachers = normalizeTeacherNames(item.teacherNames || item.teacherName)
      if (showMineOnly && itemTeachers.length === 0) return false
      if (
        showMineOnly &&
        itemTeachers.length &&
        !itemTeachers.some((teacherName) =>
          currentUserTeacherNames.some((userTeacherName) => teacherNamesLikelyMatch(userTeacherName, teacherName)),
        )
      ) {
        return false
      }
      return true
    })
  }, [teacherEvents, showMineOnly, currentUserTeacherNames])

  const schoolOptions = useMemo(() => {
    const dynamicSchools = [...new Set(examSchedules.map((item) => item.schoolName).filter(Boolean))]
    return ['전체', ...new Set([...SCHOOL_OPTIONS.filter((item) => item !== '기타'), ...dynamicSchools])]
  }, [examSchedules])

  const availableTeacherOptions = useMemo(() => {
    const combined = new Set(teacherOptions)
    currentUserTeacherNames.forEach((name) => combined.add(name))
    examSchedules.forEach((item) => normalizeTeacherNames(item.teacherNames).forEach((name) => combined.add(name)))
    teacherEvents.forEach((item) => normalizeTeacherNames(item.teacherNames || item.teacherName).forEach((name) => combined.add(name)))
    return Array.from(combined).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [teacherOptions, currentUserTeacherNames, examSchedules, teacherEvents])

  const myRegularClasses = useMemo(() => {
    return regularClassEntries.filter((item) => {
      const teacherNames = normalizeTeacherNames(item.teacher || extractTeacherNameFromClassKey(item.classKey))
      if (teacherNames.length === 0) return false
      return teacherNames.some((teacherName) =>
        currentUserTeacherNames.some((userTeacherName) => teacherNamesLikelyMatch(userTeacherName, teacherName)),
      )
    })
  }, [regularClassEntries, currentUserTeacherNames])

  const monthCells = useMemo(() => buildMonthCells(monthKey), [monthKey])

  const eventsByDate = useMemo(() => {
    const map = new Map()
    for (const exam of visibleExamSchedules) {
      if (!exam.examDate) continue
      const list = map.get(exam.examDate) || []
      list.push({
        id: exam.id,
        date: exam.examDate,
        type: '시험',
        title: `${exam.schoolName} ${exam.grade} ${exam.subject}`,
        description: [exam.rangeText, formatTeacherNames(exam.teacherNames)].filter(Boolean).join(' / 담당: '),
      })
      map.set(exam.examDate, list)
    }

    for (const event of visibleTeacherEvents) {
      if (!event.date) continue
      const list = map.get(event.date) || []
      list.push({
        id: event.id,
        date: event.date,
        type: event.type || '일정',
        title: event.title || event.className || '일정',
        description: [formatTeacherNames(event.teacherNames || event.teacherName), event.className, event.note].filter(Boolean).join(' / '),
        source: 'teacherEvent',
        raw: event,
      })
      map.set(event.date, list)
    }

    if (showMineOnly) {
      monthCells.forEach((dateKey) => {
        if (!dateKey) return
        const weekday = new Date(`${dateKey}T00:00:00`).getDay()
        myRegularClasses.forEach((classItem) => {
          if (!getWeekdayIndexesFromDayText(classItem.day).includes(weekday)) return
          const list = map.get(dateKey) || []
          const titleParts = [classItem.className, classItem.subject].filter(Boolean)
          const detailParts = [classItem.time, classItem.hall, classItem.room ? `${classItem.room}강의실` : ''].filter(Boolean)
          list.push({
            id: `regular_${classItem.classKey}_${dateKey}`,
            date: dateKey,
            type: '정규수업',
            title: titleParts.join(' · ') || classItem.classKey || '수업',
            description: detailParts.join(' / '),
            source: 'regularClass',
            raw: classItem,
          })
          map.set(dateKey, list)
        })
      })
    }

    return map
  }, [visibleExamSchedules, visibleTeacherEvents, showMineOnly, monthCells, myRegularClasses])

  const selectedDateEvents = eventsByDate.get(selectedDate) || []

  useEffect(() => {
    setLoading(true)
    setError('')

    if (!isFirebaseConfigured() || !db) {
      setError('Firebase 설정이 없어 캘린더 데이터를 불러올 수 없습니다.')
      setLoading(false)
      return undefined
    }

    const loaded = {
      exam: false,
      event: false,
      classCatalog: false,
    }

    const markLoaded = (key) => {
      loaded[key] = true
      if (loaded.exam && loaded.event && loaded.classCatalog) {
        setLoading(false)
      }
    }

    const handleSnapshotError = (label, snapshotError, key) => {
      console.error(`${label} 로드 실패:`, snapshotError)
      setError(snapshotError?.message || `${label} 데이터를 불러오지 못했습니다.`)
      markLoaded(key)
    }

    const unsubscribeExam = onSnapshot(
      getDocRef(EXAM_DOC_PATH),
      (snapshot) => {
        const loadedExamSchedules = Array.isArray(snapshot.data()?.items)
          ? snapshot.data().items.map((item) => ({
              ...item,
              teacherNames: normalizeTeacherNames(item.teacherNames || item.teacherName),
            }))
          : []
        setExamSchedules(loadedExamSchedules)
        markLoaded('exam')
      },
      (snapshotError) => handleSnapshotError('시험 일정', snapshotError, 'exam'),
    )

    const unsubscribeEvent = onSnapshot(
      getDocRef(EVENT_DOC_PATH),
      (snapshot) => {
        const loadedTeacherEvents = Array.isArray(snapshot.data()?.items)
          ? snapshot.data().items.map((item) => ({
              ...item,
              teacherNames: normalizeTeacherNames(item.teacherNames || item.teacherName),
            }))
          : []
        setTeacherEvents(loadedTeacherEvents)
        markLoaded('event')
      },
      (snapshotError) => handleSnapshotError('교사 일정', snapshotError, 'event'),
    )

    const unsubscribeClassCatalog = onSnapshot(
      getDocRef(CLASS_CATALOG_DOC_PATH),
      (snapshot) => {
        const loadedHomeworkData = snapshot.data() || {}
        setTeacherOptions(buildTeacherOptionsFromHomeworkData(loadedHomeworkData))
        setRegularClassEntries(buildRegularClassEntriesFromHomeworkData(loadedHomeworkData))
        markLoaded('classCatalog')
      },
      (snapshotError) => handleSnapshotError('반 정보', snapshotError, 'classCatalog'),
    )

    return () => {
      unsubscribeExam()
      unsubscribeEvent()
      unsubscribeClassCatalog()
    }
  }, [])

  const handleExamFormChange = (field, value) => {
    setExamForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleEventFormChange = (field, value) => {
    setEventForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleExamTeacherToggle = (teacherName) => {
    setExamForm((prev) => {
      const current = normalizeTeacherNames(prev.teacherNames)
      return {
        ...prev,
        teacherNames: current.includes(teacherName)
          ? current.filter((item) => item !== teacherName)
          : [...current, teacherName],
      }
    })
  }

  const handleEventTeacherToggle = (teacherName) => {
    setEventForm((prev) => {
      const current = normalizeTeacherNames(prev.teacherNames)
      const nextTeacherNames = current.includes(teacherName)
        ? current.filter((item) => item !== teacherName)
        : [...current, teacherName]
      return {
        ...prev,
        teacherNames: nextTeacherNames,
        teacherName: nextTeacherNames.join(', '),
      }
    })
  }

  const handleCandidateChange = (candidateId, field, value) => {
    setParsedExamCandidates((prev) =>
      prev.map((item) => (item.id === candidateId ? { ...item, [field]: value } : item)),
    )
  }

  const handleCandidateTeacherToggle = (candidateId, teacherName) => {
    setParsedExamCandidates((prev) =>
      prev.map((item) => {
        if (item.id !== candidateId) return item
        const current = normalizeTeacherNames(item.teacherNames)
        return {
          ...item,
          teacherNames: current.includes(teacherName)
            ? current.filter((entry) => entry !== teacherName)
            : [...current, teacherName],
        }
      }),
    )
  }

  const handleApplyCandidateToForm = (candidate) => {
    setExamForm({
      schoolName: SCHOOL_OPTIONS.includes(candidate.schoolName) ? candidate.schoolName : '기타',
      customSchoolName: SCHOOL_OPTIONS.includes(candidate.schoolName) ? '' : candidate.schoolName || '',
      grade: candidate.grade || '1학년',
      subject: SUBJECT_OPTIONS.includes(candidate.subject) ? candidate.subject : '기타',
      examDate: candidate.examDate || '',
      rangeText: candidate.rangeText || '',
      ocrRawText: examForm.ocrRawText || '',
      teacherNames: normalizeTeacherNames(candidate.teacherNames),
    })
  }

  const handleParseOcrToCandidates = async (rawText) => {
    if (!apiKey) {
      alert('AI 파싱을 쓰려면 먼저 OpenAI API 키를 입력해주세요.')
      return
    }

    const trimmedRawText = String(rawText || '').trim()
    if (!trimmedRawText) {
      alert('먼저 OCR 원문이 있어야 합니다.')
      return
    }

    setAiParsing(true)
    setError('')
    try {
      const schoolName = getSchoolName(examForm)
      const parsedItems = await parseExamScheduleWithAI(apiKey, trimmedRawText, schoolName, availableTeacherOptions)
      const normalizedItems = parsedItems
        .map((item, index) => ({
          id: `${Date.now()}_${index}`,
          schoolName: String(item.schoolName || schoolName || '').trim(),
          grade: String(item.grade || '').trim(),
          subject: String(item.subject || '').trim(),
          examDate: String(item.examDate || '').trim(),
          rangeText: String(item.rangeText || '').trim(),
          teacherNames: normalizeTeacherNames(item.teacherNames),
        }))
        .filter((item) => item.schoolName && item.subject && item.examDate)

      setParsedExamCandidates(normalizedItems)
      if (normalizedItems[0]) {
        handleApplyCandidateToForm(normalizedItems[0])
      }
      if (!normalizedItems.length) {
        setError('AI가 일정 후보를 찾지 못했습니다. OCR 원문을 조금 수정한 뒤 다시 파싱해보세요.')
      }
    } catch (parseError) {
      console.error('시험 일정 AI 파싱 실패:', parseError)
      setError(parseError?.message || 'AI 파싱에 실패했습니다.')
    } finally {
      setAiParsing(false)
    }
  }

  const handleExamImageUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!apiKey) {
      alert('OCR을 쓰려면 먼저 OpenAI API 키를 입력해주세요.')
      return
    }

    setOcrLoading(true)
    setError('')
    try {
      const ocrText = await extractExamTextFromImage(file, apiKey)
      setExamForm((prev) => ({
        ...prev,
        rangeText: prev.rangeText ? prev.rangeText : ocrText,
        ocrRawText: ocrText,
      }))
      await handleParseOcrToCandidates(ocrText)
    } catch (ocrError) {
      console.error('시험 일정 OCR 실패:', ocrError)
      setError(ocrError?.message || 'OCR 처리에 실패했습니다.')
    } finally {
      setOcrLoading(false)
      event.target.value = ''
    }
  }

  const handleSaveExam = async (event) => {
    event.preventDefault()
    if (!isExecutive) {
      alert('시험 일정 등록은 운영진만 가능합니다.')
      return
    }

    const schoolName = getSchoolName(examForm)
    if (!schoolName) {
      alert('학교명을 입력해주세요.')
      return
    }
    if (!examForm.examDate) {
      alert('시험 날짜를 입력해주세요.')
      return
    }

    const nextItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      schoolName,
      grade: examForm.grade.trim(),
      subject: examForm.subject.trim(),
      examDate: examForm.examDate,
      rangeText: examForm.rangeText.trim(),
      ocrRawText: examForm.ocrRawText.trim(),
      teacherNames: normalizeTeacherNames(examForm.teacherNames),
      createdBy: currentUser?.name || '',
      createdAt: new Date().toISOString(),
    }

    const nextItems = [nextItem, ...examSchedules].sort((a, b) => (a.examDate < b.examDate ? -1 : 1))
    setSaving(true)
    try {
      await setDoc(
        getDocRef(EXAM_DOC_PATH),
        {
          items: nextItems,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setExamSchedules(nextItems)
      setMonthKey(nextItem.examDate.slice(0, 7))
      setSelectedDate(nextItem.examDate)
      setExamForm(DEFAULT_EXAM_FORM)
      setParsedExamCandidates([])
    } catch (saveError) {
      console.error('시험 일정 저장 실패:', saveError)
      alert(saveError?.message || '시험 일정 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTeacherEvent = async (event) => {
    event.preventDefault()
    if (!isExecutive) {
      alert('휴강/직전보강 등록은 운영진만 가능합니다.')
      return
    }
    if (!eventForm.title.trim() || !eventForm.date) {
      alert('일정명과 날짜를 입력해주세요.')
      return
    }

    const nextItem = {
      id: editingTeacherEventId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: eventForm.title.trim(),
      date: eventForm.date,
      type: eventForm.type,
      teacherName: formatTeacherNames(eventForm.teacherNames || eventForm.teacherName),
      teacherNames: normalizeTeacherNames(eventForm.teacherNames || eventForm.teacherName),
      className: eventForm.className.trim(),
      note: eventForm.note.trim(),
      createdBy: teacherEvents.find((item) => item.id === editingTeacherEventId)?.createdBy || currentUser?.name || '',
      createdAt: teacherEvents.find((item) => item.id === editingTeacherEventId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const nextItems = [
      ...teacherEvents.filter((item) => item.id !== editingTeacherEventId),
      nextItem,
    ].sort((a, b) => (a.date < b.date ? -1 : 1))
    setSaving(true)
    try {
      await setDoc(
        getDocRef(EVENT_DOC_PATH),
        {
          items: nextItems,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setTeacherEvents(nextItems)
      setSelectedDate(nextItem.date)
      setMonthKey(nextItem.date.slice(0, 7))
      setEditingTeacherEventId('')
      setEventForm(buildDefaultEventForm(currentUser?.name || '', nextItem.date))
    } catch (saveError) {
      console.error('교사 일정 저장 실패:', saveError)
      alert(saveError?.message || '교사 일정 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleEditTeacherEvent = (eventItem) => {
    setEditingTeacherEventId(eventItem.id || '')
    setEventForm({
      ...DEFAULT_EVENT_FORM,
      title: String(eventItem.title || '').trim(),
      date: String(eventItem.date || '').trim(),
      type: String(eventItem.type || '휴강').trim(),
      teacherName: formatTeacherNames(eventItem.teacherNames || eventItem.teacherName),
      teacherNames: normalizeTeacherNames(eventItem.teacherNames || eventItem.teacherName),
      className: String(eventItem.className || '').trim(),
      note: String(eventItem.note || '').trim(),
    })
    setSelectedDate(String(eventItem.date || '').trim() || selectedDate)
  }

  const handleCancelTeacherEventEdit = () => {
    setEditingTeacherEventId('')
    setEventForm(buildDefaultEventForm(currentUser?.name || '', selectedDate || getTodayKey()))
  }

  const handleSaveParsedCandidates = async () => {
    if (!isExecutive) {
      alert('시험 일정 등록은 운영진만 가능합니다.')
      return
    }
    if (!parsedExamCandidates.length) {
      alert('먼저 AI 파싱 후보를 만들어주세요.')
      return
    }

    const validCandidates = parsedExamCandidates
      .map((item) => ({
        ...item,
        schoolName: String(item.schoolName || '').trim(),
        grade: String(item.grade || '').trim(),
        subject: String(item.subject || '').trim(),
        examDate: String(item.examDate || '').trim(),
        rangeText: String(item.rangeText || '').trim(),
        teacherNames: normalizeTeacherNames(item.teacherNames),
      }))
      .filter((item) => item.schoolName && item.subject && item.examDate)

    if (!validCandidates.length) {
      alert('저장할 수 있는 시험 일정 후보가 없습니다.')
      return
    }

    const nextItems = [
      ...validCandidates.map((item) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        schoolName: item.schoolName,
        grade: item.grade,
        subject: item.subject,
        examDate: item.examDate,
        rangeText: item.rangeText,
        ocrRawText: examForm.ocrRawText.trim(),
        teacherNames: item.teacherNames,
        createdBy: currentUser?.name || '',
        createdAt: new Date().toISOString(),
      })),
      ...examSchedules,
    ].sort((a, b) => (a.examDate < b.examDate ? -1 : 1))

    setSaving(true)
    try {
      await setDoc(
        getDocRef(EXAM_DOC_PATH),
        { items: nextItems, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setExamSchedules(nextItems)
      setSelectedDate(validCandidates[0].examDate)
      setMonthKey(validCandidates[0].examDate.slice(0, 7))
      setParsedExamCandidates([])
      setExamForm(DEFAULT_EXAM_FORM)
    } catch (saveError) {
      console.error('AI 파싱 시험 일정 저장 실패:', saveError)
      alert(saveError?.message || '시험 일정 일괄 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivateUser = async (event) => {
    event.preventDefault()
    if (!isExecutive) {
      alert('계정 비활성화는 운영진만 가능합니다.')
      return
    }
    if (!deactivatePhone) {
      alert('전화번호를 입력해주세요.')
      return
    }

    const confirmed = window.confirm(`${deactivatePhone} 계정을 비활성화할까요?`)
    if (!confirmed) return

    setSaving(true)
    try {
      await deactivatePocketbookUser(deactivatePhone)
      alert('계정이 비활성화되었습니다.')
      setDeactivatePhone('')
    } catch (deactivateError) {
      console.error('계정 비활성화 실패:', deactivateError)
      alert(deactivateError?.message || '계정 비활성화에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="exam-calendar-page">
      <header className="exam-calendar-header">
        <div>
          <h1>캘린더</h1>
          <p>
            {currentUser?.name} · {formatRoleLabel(currentUser?.role)}
          </p>
        </div>
        <div className="exam-calendar-header-actions">
          <button type="button" onClick={() => setShowMineOnly((prev) => !prev)}>
            {showMineOnly ? '전체 캘린더 보기' : '나의 캘린더 보기'}
          </button>
          <button type="button" onClick={onClose}>
            메인 메뉴로 돌아가기
          </button>
        </div>
      </header>

      <section className="exam-calendar-toolbar">
        <div className="exam-calendar-month-picker">
          <button
            type="button"
            onClick={() => {
              const [year, month] = monthKey.split('-').map(Number)
              const prevDate = new Date(year, month - 2, 1)
              setMonthKey(getMonthKey(prevDate))
            }}
          >
            이전 달
          </button>
          <strong>{monthKey.replace('-', '년 ')}월</strong>
          <button
            type="button"
            onClick={() => {
              const [year, month] = monthKey.split('-').map(Number)
              const nextDate = new Date(year, month, 1)
              setMonthKey(getMonthKey(nextDate))
            }}
          >
            다음 달
          </button>
        </div>
        <div className="exam-calendar-school-filters">
          {schoolOptions.map((school) => (
            <button
              key={school}
              type="button"
              className={selectedSchool === school ? 'active' : ''}
              onClick={() => setSelectedSchool(school)}
            >
              {school}
            </button>
          ))}
        </div>
      </section>

      {error ? <div className="exam-calendar-error">{error}</div> : null}

      <div className="exam-calendar-layout">
        <section className="exam-calendar-grid-card">
          {loading ? (
            <div className="exam-calendar-empty">캘린더를 불러오는 중입니다...</div>
          ) : (
            <>
              <div className="exam-calendar-weekdays">
                {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => (
                  <div key={weekday}>{weekday}</div>
                ))}
              </div>
              <div className="exam-calendar-grid">
                {monthCells.map((dateKey, index) => {
                  if (!dateKey) {
                    return <div key={`empty_${index}`} className="exam-calendar-cell exam-calendar-cell-empty" />
                  }

                  const dayEvents = eventsByDate.get(dateKey) || []
                  const isSelected = selectedDate === dateKey
                  const isToday = dateKey === getTodayKey()

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      className={[
                        'exam-calendar-cell',
                        isSelected ? 'selected' : '',
                        isToday ? 'today' : '',
                      ].join(' ').trim()}
                      onClick={() => setSelectedDate(dateKey)}
                    >
                      <span className="exam-calendar-day-number">{Number(dateKey.slice(-2))}</span>
                      <div className="exam-calendar-day-events">
                        {dayEvents.slice(0, 3).map((item) => (
                          <span key={item.id} className={`event-chip type-${item.type}`}>
                            {item.type === '시험' ? item.title : `${item.type} ${item.title}`}
                          </span>
                        ))}
                        {dayEvents.length > 3 ? <span className="event-chip more">+{dayEvents.length - 3}건</span> : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <aside className="exam-calendar-side-card">
          <h2>{formatDateLabel(selectedDate)}</h2>
          {selectedDateEvents.length ? (
            <div className="exam-calendar-event-list">
              {selectedDateEvents.map((item) => (
                <div key={item.id} className="exam-calendar-event-item">
                  <strong>{item.type}</strong>
                  <div>{item.title}</div>
                  {item.description ? <p>{item.description}</p> : null}
                  {isExecutive && item.source === 'teacherEvent' ? (
                    <div className="exam-calendar-event-actions">
                      <button type="button" onClick={() => handleEditTeacherEvent(item.raw)}>
                        수정
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="exam-calendar-empty">이 날짜에 등록된 일정이 없습니다.</div>
          )}
        </aside>
      </div>

      <section className="exam-calendar-bottom">
        <div className="exam-calendar-panel">
          <h2>학교 시험 일정</h2>
          <p>모든 선생님이 전체 학교 시험 범위와 날짜를 볼 수 있습니다.</p>
          {isExecutive ? (
            <form className="exam-calendar-form" onSubmit={handleSaveExam}>
              <div className="form-row">
                <label>
                  학교
                  <select
                    value={examForm.schoolName}
                    onChange={(event) => handleExamFormChange('schoolName', event.target.value)}
                  >
                    {SCHOOL_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                {examForm.schoolName === '기타' ? (
                  <label>
                    기타 학교명
                    <input
                      type="text"
                      value={examForm.customSchoolName}
                      onChange={(event) => handleExamFormChange('customSchoolName', event.target.value)}
                      placeholder="학교명 입력"
                    />
                  </label>
                ) : null}
                <label>
                  학년
                  <input
                    type="text"
                    value={examForm.grade}
                    onChange={(event) => handleExamFormChange('grade', event.target.value)}
                    placeholder="1학년"
                  />
                </label>
                <label>
                  과목
                  <select
                    value={examForm.subject}
                    onChange={(event) => handleExamFormChange('subject', event.target.value)}
                  >
                    {SUBJECT_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  시험 날짜
                  <input
                    type="date"
                    value={examForm.examDate}
                    onChange={(event) => handleExamFormChange('examDate', event.target.value)}
                  />
                </label>
              </div>
              <label>
                시험 범위
                <textarea
                  value={examForm.rangeText}
                  onChange={(event) => handleExamFormChange('rangeText', event.target.value)}
                  placeholder="예: 교과서 3단원~5단원, 부교재 45쪽까지"
                  rows={4}
                />
              </label>
              <label>
                OCR 원문
                <textarea
                  value={examForm.ocrRawText}
                  onChange={(event) => handleExamFormChange('ocrRawText', event.target.value)}
                  placeholder="이미지 업로드 시 자동으로 채워집니다."
                  rows={5}
                />
              </label>
              <div className="exam-calendar-teacher-section">
                <strong>담당 선생님 체크</strong>
                <div className="exam-calendar-teacher-help">
                  시험 일정 확인이 필요한 선생님을 체크해두면 `나의 캘린더 보기`에서 더 쉽게 걸러볼 수 있습니다.
                </div>
                <div className="exam-calendar-checklist">
                  {availableTeacherOptions.length ? (
                    availableTeacherOptions.map((teacherName) => (
                      <label key={teacherName} className="exam-calendar-check-item">
                        <input
                          type="checkbox"
                          checked={normalizeTeacherNames(examForm.teacherNames).includes(teacherName)}
                          onChange={() => handleExamTeacherToggle(teacherName)}
                        />
                        <span>{teacherName}</span>
                      </label>
                    ))
                  ) : (
                    <div className="exam-calendar-readonly">반 정보에서 불러온 선생님 목록이 아직 없습니다.</div>
                  )}
                </div>
              </div>
              <div className="exam-calendar-form-actions">
                <label className="upload-button">
                  {ocrLoading ? 'OCR 처리 중...' : '시험표 이미지 업로드 후 OCR'}
                  <input type="file" accept="image/*" onChange={handleExamImageUpload} disabled={ocrLoading} />
                </label>
                <button
                  type="button"
                  onClick={() => handleParseOcrToCandidates(examForm.ocrRawText)}
                  disabled={aiParsing || !examForm.ocrRawText.trim()}
                >
                  {aiParsing ? 'AI 파싱 중...' : 'OCR 원문 AI 정리'}
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? '저장 중...' : '시험 일정 저장'}
                </button>
              </div>
              {parsedExamCandidates.length ? (
                <div className="exam-calendar-ai-result">
                  <div className="exam-calendar-ai-header">
                    <strong>AI가 정리한 시험 일정 후보 {parsedExamCandidates.length}건</strong>
                    <button type="button" onClick={handleSaveParsedCandidates} disabled={saving}>
                      {saving ? '저장 중...' : '후보 전체 저장'}
                    </button>
                  </div>
                  <div className="exam-calendar-ai-list">
                    {parsedExamCandidates.map((candidate) => (
                      <div key={candidate.id} className="exam-calendar-ai-item">
                        <div className="form-row">
                          <label>
                            학교
                            <input
                              type="text"
                              value={candidate.schoolName}
                              onChange={(event) => handleCandidateChange(candidate.id, 'schoolName', event.target.value)}
                            />
                          </label>
                          <label>
                            학년
                            <input
                              type="text"
                              value={candidate.grade}
                              onChange={(event) => handleCandidateChange(candidate.id, 'grade', event.target.value)}
                            />
                          </label>
                          <label>
                            과목
                            <input
                              type="text"
                              value={candidate.subject}
                              onChange={(event) => handleCandidateChange(candidate.id, 'subject', event.target.value)}
                            />
                          </label>
                          <label>
                            시험 날짜
                            <input
                              type="date"
                              value={candidate.examDate}
                              onChange={(event) => handleCandidateChange(candidate.id, 'examDate', event.target.value)}
                            />
                          </label>
                        </div>
                        <label>
                          시험 범위
                          <textarea
                            rows={3}
                            value={candidate.rangeText}
                            onChange={(event) => handleCandidateChange(candidate.id, 'rangeText', event.target.value)}
                          />
                        </label>
                        <div className="exam-calendar-checklist">
                          {availableTeacherOptions.map((teacherName) => (
                            <label key={`${candidate.id}_${teacherName}`} className="exam-calendar-check-item">
                              <input
                                type="checkbox"
                                checked={normalizeTeacherNames(candidate.teacherNames).includes(teacherName)}
                                onChange={() => handleCandidateTeacherToggle(candidate.id, teacherName)}
                              />
                              <span>{teacherName}</span>
                            </label>
                          ))}
                        </div>
                        <div className="exam-calendar-form-actions">
                          <button type="button" onClick={() => handleApplyCandidateToForm(candidate)}>
                            이 후보를 단일 입력칸으로 가져오기
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </form>
          ) : (
            <div className="exam-calendar-readonly">
              운영진만 시험 일정과 OCR 결과를 등록할 수 있습니다.
            </div>
          )}
        </div>

        <div className="exam-calendar-panel">
          <h2>휴강 / 직전보강 입력</h2>
          <p>시험 전날부터 종료일까지 변동되는 수업은 운영진이 수동으로 입력합니다.</p>
          {isExecutive ? (
            <form className="exam-calendar-form" onSubmit={handleSaveTeacherEvent}>
              {editingTeacherEventId ? (
                <div className="exam-calendar-edit-banner">
                  <strong>직보/휴강 수정 중</strong>
                  <button type="button" onClick={handleCancelTeacherEventEdit}>
                    새로 입력
                  </button>
                </div>
              ) : null}
              <div className="form-row">
                <label>
                  일정 종류
                  <select
                    value={eventForm.type}
                    onChange={(event) => handleEventFormChange('type', event.target.value)}
                  >
                    <option value="휴강">휴강</option>
                    <option value="직전보강">직전보강</option>
                    <option value="기타">기타</option>
                  </select>
                </label>
                <label>
                  날짜
                  <input
                    type="date"
                    value={eventForm.date}
                    onChange={(event) => handleEventFormChange('date', event.target.value)}
                  />
                </label>
                <label>
                  반 이름
                  <input
                    type="text"
                    value={eventForm.className}
                    onChange={(event) => handleEventFormChange('className', event.target.value)}
                    placeholder="예: 과천고1 영어 월금"
                  />
                </label>
              </div>
              <label>
                일정명
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(event) => handleEventFormChange('title', event.target.value)}
                  placeholder="예: 과천고1 영어 직전보강 1회"
                />
              </label>
              <label>
                메모
                <textarea
                  value={eventForm.note}
                  onChange={(event) => handleEventFormChange('note', event.target.value)}
                  rows={4}
                  placeholder="휴강 사유, 보강 시간, 전달 메모 등을 적어주세요."
                />
              </label>
              <div className="exam-calendar-teacher-section">
                <strong>담당 선생님 체크</strong>
                <div className="exam-calendar-checklist">
                  {availableTeacherOptions.length ? (
                    availableTeacherOptions.map((teacherName) => (
                      <label key={`event_${teacherName}`} className="exam-calendar-check-item">
                        <input
                          type="checkbox"
                          checked={normalizeTeacherNames(eventForm.teacherNames).includes(teacherName)}
                          onChange={() => handleEventTeacherToggle(teacherName)}
                        />
                        <span>{teacherName}</span>
                      </label>
                    ))
                  ) : (
                    <div className="exam-calendar-readonly">반 정보에서 불러온 선생님 목록이 아직 없습니다.</div>
                  )}
                </div>
              </div>
              <div className="exam-calendar-form-actions">
                <button type="submit" disabled={saving}>
                  {saving ? '저장 중...' : editingTeacherEventId ? '교사 일정 수정 저장' : '교사 일정 저장'}
                </button>
              </div>
            </form>
          ) : (
            <div className="exam-calendar-readonly">
              운영진만 휴강/직전보강을 등록할 수 있습니다. 선생님은 `나의 캘린더 보기`로 배정된 일정만 확인하면 됩니다.
            </div>
          )}

          <div className="exam-calendar-divider" />

          <h2>계정 비활성화</h2>
          <p>퇴사한 직원/선생님은 전화번호 기준으로 비활성화할 수 있습니다.</p>
          {isExecutive ? (
            <form className="exam-calendar-form" onSubmit={handleDeactivateUser}>
              <label>
                비활성화할 전화번호
                <input
                  type="text"
                  value={deactivatePhone}
                  onChange={(event) => setDeactivatePhone(normalizePhoneNumber(event.target.value))}
                  placeholder="01012345678"
                />
              </label>
              <div className="exam-calendar-form-actions">
                <button type="submit" disabled={saving}>
                  {saving ? '처리 중...' : '계정 비활성화'}
                </button>
              </div>
            </form>
          ) : (
            <div className="exam-calendar-readonly">
              운영진만 계정을 비활성화할 수 있습니다.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
