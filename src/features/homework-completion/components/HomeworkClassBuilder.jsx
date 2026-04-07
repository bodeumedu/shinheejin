import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import {
  SUBJECT_OPTIONS,
  SUBJECT_OPTIONS_BY_LENGTH,
  SCHOOL_LEVEL_OPTIONS,
  parseClassNames,
  parseClassMetaFromKey,
  normalizeClassCatalog,
  resolveClassSubject,
  resolveSchoolLevelForEntry,
} from '../utils/classCatalogMeta';

const HOMEWORK_COMPLETION_PHONE_DOC = 'homeworkCompletionPhoneNumbers';
const HOMEWORK_COMPLETION_PHONE_DOC_ID = 'all';
const DATE_DATA_DOC = 'homeworkCompletionDateData';
const HALL_OPTIONS = ['중앙관', '별양관'];

function formatLocalYMD(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildCalendarDays(monthDate) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startWeekday = firstDay.getDay();
  const lastDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < startWeekday; i += 1) days.push(null);
  for (let day = 1; day <= lastDate; day += 1) {
    days.push(formatLocalYMD(new Date(monthDate.getFullYear(), monthDate.getMonth(), day)));
  }
  while (days.length < 42) days.push(null);
  return days;
}

function getDefaultYear() {
  return String(new Date().getFullYear()).slice(-2);
}

function buildInitialForm() {
  return {
    year: getDefaultYear(),
    className: '',
    subject: '',
    hall: '중앙관',
    teacher: '',
    day: '',
    startTime: '',
    endTime: '',
    room: '',
    tuition: '',
    newStudentNotice: '',
    monthlyCurriculum: '',
  };
}

function parseStoredTimeRange(value) {
  const raw = String(value || '').trim();
  if (!raw) return { startTime: '', endTime: '' };
  const rangeMatch = raw.match(/(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/);
  if (rangeMatch) {
    return { startTime: rangeMatch[1], endTime: rangeMatch[2] };
  }
  return { startTime: raw, endTime: '' };
}

function buildStoredTimeRange(startTime, endTime) {
  const start = String(startTime || '').trim();
  const end = String(endTime || '').trim();
  if (!start || !end) return '';
  return `${start}-${end}`;
}

function normalizeRoomValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('컨설팅')) return '컨설팅룸';
  if (raw.includes('상담')) return '상담실';
  const match = raw.match(/\d+/);
  if (!match) return raw;
  const roomNumber = parseInt(match[0], 10);
  return Number.isFinite(roomNumber) ? String(roomNumber) : raw;
}

function isValidRoomValue(value) {
  const normalized = normalizeRoomValue(value);
  if (!normalized) return false;
  if (normalized === '컨설팅룸' || normalized === '상담실') return true;
  const roomNumber = parseInt(normalized, 10);
  return Number.isFinite(roomNumber) && roomNumber >= 1 && roomNumber <= 22;
}

function buildClassKey({ year, teacher, className, day, time }) {
  return [year, teacher, className, day, time].map((value) => String(value || '').trim()).join('_');
}

function formatClassDisplay(classKey, catalogItem = null) {
  const base = parseClassMetaFromKey(classKey);
  const className = String(catalogItem?.className || base.className || classKey || '').trim();
  const subject = String(catalogItem?.subject || '').trim();
  const hall = String(catalogItem?.hall || '중앙관').trim();
  const day = String(catalogItem?.day || base.day || '').trim();
  const time = String(catalogItem?.time || base.time || '').trim();
  const title = subject ? `${className} · ${subject}` : className;
  if (title && day && time) return `${title} (${hall} · ${day} ${time})`;
  if (title) return `${title} (${hall})`;
  return String(classKey || '');
}

function replaceClassNameInJoinedList(classNameStr, oldClassName, newClassName) {
  const classes = parseClassNames(classNameStr);
  if (!classes.includes(oldClassName)) return classNameStr || '';
  return [...new Set(classes.map((item) => (item === oldClassName ? newClassName : item)))].join(',');
}

function removeClassNameFromJoinedList(classNameStr, classNameToRemove) {
  const classes = parseClassNames(classNameStr);
  if (!classes.includes(classNameToRemove)) return classNameStr || '';
  return classes.filter((item) => item !== classNameToRemove).join(',');
}

function mergeRenamedClassValue(existingValue, movedValue) {
  if (Array.isArray(existingValue) || Array.isArray(movedValue)) {
    return [
      ...(Array.isArray(existingValue) ? existingValue : []),
      ...(Array.isArray(movedValue) ? movedValue : []),
    ];
  }
  if (
    existingValue &&
    typeof existingValue === 'object' &&
    !Array.isArray(existingValue) &&
    movedValue &&
    typeof movedValue === 'object' &&
    !Array.isArray(movedValue)
  ) {
    return { ...existingValue, ...movedValue };
  }
  return movedValue !== undefined ? movedValue : existingValue;
}

function renameClassKey(obj, oldClassName, newClassName) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  if (!oldClassName || oldClassName === newClassName) return { ...obj };
  if (!(oldClassName in obj)) return { ...obj };
  const out = { ...obj };
  const movedValue = out[oldClassName];
  delete out[oldClassName];
  out[newClassName] = mergeRenamedClassValue(out[newClassName], movedValue);
  return out;
}

function renameClassKeyInDateTree(tree, oldClassName, newClassName) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return {};
  const out = {};
  Object.keys(tree).forEach((date) => {
    const day = tree[date];
    out[date] =
      day && typeof day === 'object' && !Array.isArray(day)
        ? renameClassKey(day, oldClassName, newClassName)
        : day;
  });
  return out;
}

function removeClassKeyFromDateTree(tree, className) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return {};
  const next = {};
  Object.keys(tree).forEach((date) => {
    const day = tree[date] || {};
    if (!(className in day)) {
      next[date] = tree[date];
      return;
    }
    const { [className]: removedClass, ...rest } = day;
    void removedClass;
    next[date] = rest;
  });
  return next;
}

export default function HomeworkClassBuilder({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedClassKey, setSelectedClassKey] = useState('');
  const [editingClassKey, setEditingClassKey] = useState('');
  const [classCatalog, setClassCatalog] = useState({});
  const [addedClassList, setAddedClassList] = useState([]);
  const [studentInfo, setStudentInfo] = useState({});
  const [students, setStudents] = useState([]);
  const [selectedHallTab, setSelectedHallTab] = useState('중앙관');
  const [selectedSchoolLevelFilter, setSelectedSchoolLevelFilter] = useState('전체');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('전체');
  const [dateHomeworkList, setDateHomeworkList] = useState({});
  const [dateProgressList, setDateProgressList] = useState({});
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(formatLocalYMD());
  const [form, setForm] = useState(buildInitialForm());

  useEffect(() => {
    if (!isFirebaseConfigured() || !db) {
      setLoading(false);
      return undefined;
    }

    const docRef = doc(db, HOMEWORK_COMPLETION_PHONE_DOC, HOMEWORK_COMPLETION_PHONE_DOC_ID);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setClassCatalog({});
          setAddedClassList([]);
          setStudentInfo({});
          setStudents([]);
          setLoading(false);
          return;
        }

        const data = snapshot.data() || {};
        setClassCatalog(normalizeClassCatalog(data.classCatalog || {}));
        setAddedClassList(
          Array.isArray(data.addedClassList)
            ? [...new Set(data.addedClassList.map((item) => String(item || '').trim()).filter(Boolean))]
            : []
        );
        setStudentInfo(data.studentInfo && typeof data.studentInfo === 'object' ? data.studentInfo : {});
        setStudents(Array.isArray(data.students) ? data.students : []);
        setLoading(false);
      },
      (error) => {
        console.error('반 목록 불러오기 실패:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured() || !db) return undefined;
    const dateRef = doc(db, DATE_DATA_DOC, 'all');
    const unsubscribe = onSnapshot(
      dateRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        setDateHomeworkList(data?.homeworkList && typeof data.homeworkList === 'object' ? data.homeworkList : {});
        setDateProgressList(data?.progressList && typeof data.progressList === 'object' ? data.progressList : {});
      },
      (error) => {
        console.error('반별 날짜 데이터 불러오기 실패:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  const classEntries = useMemo(() => {
    const classKeySet = new Set(addedClassList);
    Object.values(studentInfo || {}).forEach((info) => {
      parseClassNames(info?.className || '').forEach((classKey) => classKeySet.add(classKey));
    });
    Object.keys(classCatalog || {}).forEach((classKey) => classKeySet.add(classKey));

    return Array.from(classKeySet)
      .map((classKey) => {
        const parsed = parseClassMetaFromKey(classKey);
        const catalogItem = classCatalog[classKey] || {};
        const studentCount = students.filter((student) =>
          parseClassNames(studentInfo[student]?.className || '').includes(classKey)
        ).length;
        return {
          key: classKey,
          year: String(catalogItem.year || parsed.year || '').trim(),
          teacher: String(catalogItem.teacher || parsed.teacher || '').trim(),
          className: String(catalogItem.className || parsed.className || classKey).trim(),
          subject: resolveClassSubject({
            subject: String(catalogItem.subject || parsed.subject || '').trim(),
            teacher: String(catalogItem.teacher || parsed.teacher || '').trim(),
          }),
          hall: String(catalogItem.hall || '중앙관').trim(),
          day: String(catalogItem.day || parsed.day || '').trim(),
          time: String(catalogItem.time || parsed.time || '').trim(),
          room: String(catalogItem.room || '').trim(),
          tuition: String(catalogItem.tuition || '').trim(),
          newStudentNotice: String(catalogItem.newStudentNotice || '').trim(),
          monthlyCurriculum: String(catalogItem.monthlyCurriculum || '').trim(),
          studentCount,
        };
      })
      .sort((a, b) => {
        const teacherOrder = a.teacher.localeCompare(b.teacher, 'ko');
        if (teacherOrder !== 0) return teacherOrder;
        const nameOrder = a.className.localeCompare(b.className, 'ko');
        if (nameOrder !== 0) return nameOrder;
        const dayOrder = a.day.localeCompare(b.day, 'ko');
        if (dayOrder !== 0) return dayOrder;
        return a.time.localeCompare(b.time, 'ko');
      });
  }, [addedClassList, classCatalog, studentInfo, students]);

  const filteredClassEntries = useMemo(
    () => classEntries.filter((entry) => {
      const hallMatched = String(entry.hall || '중앙관').trim() === selectedHallTab;
      if (!hallMatched) return false;
      const level = resolveSchoolLevelForEntry(entry);
      const levelMatched = selectedSchoolLevelFilter === '전체' || level === selectedSchoolLevelFilter;
      const subjectMatched = selectedSubjectFilter === '전체' || String(entry.subject || '').trim() === selectedSubjectFilter;
      return levelMatched && subjectMatched;
    }),
    [classEntries, selectedHallTab, selectedSchoolLevelFilter, selectedSubjectFilter]
  );

  const selectedClassDateRows = useMemo(() => {
    if (!selectedClassKey) return [];
    const dateSet = new Set([
      ...Object.keys(dateHomeworkList || {}),
      ...Object.keys(dateProgressList || {}),
    ]);
    return Array.from(dateSet)
      .map((date) => ({
        date,
        homework: Array.isArray(dateHomeworkList?.[date]?.[selectedClassKey]) ? dateHomeworkList[date][selectedClassKey] : [],
        progress: Array.isArray(dateProgressList?.[date]?.[selectedClassKey]) ? dateProgressList[date][selectedClassKey] : [],
      }))
      .filter((entry) => entry.homework.length > 0 || entry.progress.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedClassKey, dateHomeworkList, dateProgressList]);

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

  const selectedCalendarDetail = useMemo(() => {
    if (!selectedClassKey || !selectedCalendarDate) return { homework: [], progress: [] };
    return {
      homework: Array.isArray(dateHomeworkList?.[selectedCalendarDate]?.[selectedClassKey]) ? dateHomeworkList[selectedCalendarDate][selectedClassKey] : [],
      progress: Array.isArray(dateProgressList?.[selectedCalendarDate]?.[selectedClassKey]) ? dateProgressList[selectedCalendarDate][selectedClassKey] : [],
    };
  }, [selectedCalendarDate, selectedClassKey, dateHomeworkList, dateProgressList]);

  const selectedClassDashboard = useMemo(() => {
    if (!selectedClassKey) return null;
    return (
      <div style={{ marginTop: '12px', padding: '16px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #ddd6fe' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '1.02rem', fontWeight: '700', color: '#0f172a' }}>반별 과제 / 진도 캘린더</div>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.88rem' }}>
              숙제 과제 완료도에 저장된 날짜별 과제/진도를 그대로 보여줍니다.
            </p>
          </div>
          <strong style={{ color: '#4c1d95' }}>{formatClassDisplay(selectedClassKey, classCatalog[selectedClassKey])}</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
            >
              이전달
            </button>
            <button
              type="button"
              onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
            >
              다음달
            </button>
          </div>
          <div style={{ fontWeight: '700', color: '#0f172a' }}>{formatMonthKey(calendarMonth)}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '8px', marginBottom: '16px' }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
            <div key={day} style={{ textAlign: 'center', fontWeight: '700', color: '#64748b', fontSize: '0.88rem' }}>{day}</div>
          ))}
          {calendarDays.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} style={{ minHeight: '94px', borderRadius: '12px', background: '#fff' }} />;
            }
            const homework = Array.isArray(dateHomeworkList?.[date]?.[selectedClassKey]) ? dateHomeworkList[date][selectedClassKey] : [];
            const progress = Array.isArray(dateProgressList?.[date]?.[selectedClassKey]) ? dateProgressList[date][selectedClassKey] : [];
            const isSelected = selectedCalendarDate === date;
            const hasData = homework.length > 0 || progress.length > 0;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedCalendarDate(date)}
                style={{
                  minHeight: '94px',
                  borderRadius: '12px',
                  border: isSelected ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                  background: isSelected ? '#faf5ff' : hasData ? '#eff6ff' : '#fff',
                  padding: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>{date.slice(-2)}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.5 }}>
                  <div>과제 {homework.length}개</div>
                  <div>진도 {progress.length}개</div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ padding: '16px', borderRadius: '14px', background: '#fff', marginBottom: '16px' }}>
          <div style={{ fontWeight: '700', color: '#0f172a', marginBottom: '10px' }}>
            {selectedCalendarDate} 상세
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div>
              <div style={{ fontWeight: '700', color: '#1d4ed8', marginBottom: '6px' }}>과제</div>
              {selectedCalendarDetail.homework.length === 0 ? (
                <div style={{ color: '#94a3b8' }}>등록된 과제가 없습니다.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {selectedCalendarDetail.homework.map((item) => (
                    <li key={`${selectedCalendarDate}-hw-${item}`}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div style={{ fontWeight: '700', color: '#7c3aed', marginBottom: '6px' }}>진도</div>
              {selectedCalendarDetail.progress.length === 0 ? (
                <div style={{ color: '#94a3b8' }}>등록된 진도가 없습니다.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {selectedCalendarDetail.progress.map((item) => (
                    <li key={`${selectedCalendarDate}-prog-${item}`}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: '700', color: '#0f172a', marginBottom: '10px' }}>날짜별 과제 / 진도 표</div>
          {selectedClassDateRows.length === 0 ? (
            <div style={{ color: '#94a3b8' }}>저장된 날짜별 과제/진도가 없습니다.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>날짜</th>
                    <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>과제</th>
                    <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e7eb' }}>진도</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClassDateRows.map((row) => (
                    <tr key={row.date}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>{row.date}</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>
                        {row.homework.length > 0 ? row.homework.join('\n') : '-'}
                      </td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>
                        {row.progress.length > 0 ? row.progress.join('\n') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }, [
    selectedClassKey,
    classCatalog,
    calendarMonth,
    calendarDays,
    dateHomeworkList,
    dateProgressList,
    selectedCalendarDate,
    selectedCalendarDetail,
    selectedClassDateRows,
  ]);

  const resetForm = useCallback(() => {
    setEditingClassKey('');
    setSelectedClassKey('');
    setForm(buildInitialForm());
  }, []);

  const handleSelectClass = useCallback((entry) => {
    const parsedTime = parseStoredTimeRange(entry.time || '');
    setSelectedClassKey(entry.key);
    setEditingClassKey(entry.key);
    const relatedDate = Array.from(
      new Set([...Object.keys(dateHomeworkList || {}), ...Object.keys(dateProgressList || {})])
    )
      .filter((date) =>
        (Array.isArray(dateHomeworkList?.[date]?.[entry.key]) && dateHomeworkList[date][entry.key].length > 0)
        || (Array.isArray(dateProgressList?.[date]?.[entry.key]) && dateProgressList[date][entry.key].length > 0)
      )
      .sort()
      .reverse()[0];
    const initialDate = relatedDate || formatLocalYMD();
    setSelectedCalendarDate(initialDate);
    setCalendarMonth(getMonthStart(new Date(`${initialDate}T00:00:00`)));
    setForm({
      year: entry.year || getDefaultYear(),
      className: entry.className || '',
      subject: entry.subject || '',
      hall: entry.hall || '중앙관',
      teacher: entry.teacher || '',
      day: entry.day || '',
      startTime: parsedTime.startTime,
      endTime: parsedTime.endTime,
      room: entry.room || '',
      tuition: entry.tuition || '',
      newStudentNotice: entry.newStudentNotice || '',
      monthlyCurriculum: entry.monthlyCurriculum || '',
    });
  }, [dateHomeworkList, dateProgressList]);

  const handleSubmit = useCallback(async () => {
    const storedTime = buildStoredTimeRange(form.startTime, form.endTime);
    const normalizedRoom = normalizeRoomValue(form.room);
    const rawSubject = String(form.subject || '').trim();
    const rawDay = String(form.day || '').trim();
    const mixedSubject = rawSubject || SUBJECT_OPTIONS_BY_LENGTH.find((candidate) => rawDay.includes(candidate)) || '';
    const normalizedDay = rawDay
      .replace(mixedSubject, '')
      .replace(/[()\s]/g, '')
      .trim();
    const normalizedForm = {
      year: String(form.year || getDefaultYear()).replace(/\D/g, '').slice(-2) || getDefaultYear(),
      className: String(form.className || '').trim(),
      subject: SUBJECT_OPTIONS.includes(mixedSubject) ? mixedSubject : '',
      hall: HALL_OPTIONS.includes(String(form.hall || '').trim()) ? String(form.hall || '').trim() : '중앙관',
      teacher: String(form.teacher || '').trim(),
      day: normalizedDay,
      time: storedTime,
      room: normalizedRoom,
      tuition: String(form.tuition || '').trim(),
      newStudentNotice: String(form.newStudentNotice || '').trim(),
      monthlyCurriculum: String(form.monthlyCurriculum || '').trim(),
    };

    if (!normalizedForm.className || !normalizedForm.teacher || !normalizedForm.day || !normalizedForm.time) {
      alert('반 이름, 담임 선생님, 요일, 시작 시간, 끝나는 시간은 꼭 입력해주세요.');
      return;
    }
    if (!isValidRoomValue(normalizedForm.room)) {
      alert('강의실은 1~22 사이 숫자이거나 컨설팅룸, 상담실만 입력할 수 있습니다.');
      return;
    }
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }

    const nextClassKey = buildClassKey(normalizedForm);
    if (!nextClassKey) {
      alert('반 정보를 다시 확인해주세요.');
      return;
    }

    setSaving(true);
    try {
      const phoneRef = doc(db, HOMEWORK_COMPLETION_PHONE_DOC, HOMEWORK_COMPLETION_PHONE_DOC_ID);
      const dateDataRef = doc(db, DATE_DATA_DOC, 'all');
      const [phoneSnap, dateSnap] = await Promise.all([getDoc(phoneRef), getDoc(dateDataRef)]);
      const phoneData = phoneSnap.exists() ? phoneSnap.data() : {};
      const baseStudentInfo = phoneData.studentInfo && typeof phoneData.studentInfo === 'object' ? { ...phoneData.studentInfo } : {};
      const baseAddedClassList = Array.isArray(phoneData.addedClassList)
        ? [...new Set(phoneData.addedClassList.map((item) => String(item || '').trim()).filter(Boolean))]
        : [];
      const baseClassCatalog = normalizeClassCatalog(phoneData.classCatalog || {});
      const existingClassKeys = new Set([...baseAddedClassList, ...Object.keys(baseClassCatalog)]);
      Object.values(baseStudentInfo).forEach((info) => {
        parseClassNames(info?.className || '').forEach((classKey) => existingClassKeys.add(classKey));
      });

      if (!editingClassKey && existingClassKeys.has(nextClassKey)) {
        alert('이미 등록된 반입니다.');
        return;
      }
      if (editingClassKey && nextClassKey !== editingClassKey) {
        existingClassKeys.delete(editingClassKey);
        if (existingClassKeys.has(nextClassKey)) {
          alert('같은 이름/요일/시간 조합의 반이 이미 있습니다.');
          return;
        }
      }

      const now = new Date().toISOString();
      const nextClassCatalog = { ...baseClassCatalog };
      const previousCreatedAt = editingClassKey ? baseClassCatalog[editingClassKey]?.createdAt : '';
      if (editingClassKey && nextClassKey !== editingClassKey) {
        delete nextClassCatalog[editingClassKey];
      }
      nextClassCatalog[nextClassKey] = {
        ...normalizedForm,
        createdAt: previousCreatedAt || now,
        updatedAt: now,
      };

      let nextStudentInfo = baseStudentInfo;
      let nextAddedClassList = baseAddedClassList;
      let nextDateHomeworkList = dateSnap.exists() ? dateSnap.data()?.homeworkList || {} : {};
      let nextDateProgressList = dateSnap.exists() ? dateSnap.data()?.progressList || {} : {};
      let nextDateCompletionData = dateSnap.exists() ? dateSnap.data()?.completionData || {} : {};
      let nextDateProgressData = dateSnap.exists() ? dateSnap.data()?.progressData || {} : {};
      let nextQuickMemoByClass = dateSnap.exists() ? dateSnap.data()?.quickMemoByClass || {} : {};
      let nextNotebookByClass = dateSnap.exists() ? dateSnap.data()?.notebookByClass || {} : {};

      if (!editingClassKey) {
        nextAddedClassList = [...new Set([...baseAddedClassList, nextClassKey])];
      } else if (nextClassKey === editingClassKey) {
        nextAddedClassList = [...new Set([...baseAddedClassList, nextClassKey])];
      } else {
        nextStudentInfo = { ...baseStudentInfo };
        Object.keys(nextStudentInfo).forEach((student) => {
          const currentClassName = nextStudentInfo[student]?.className || '';
          const updatedClassName = replaceClassNameInJoinedList(currentClassName, editingClassKey, nextClassKey);
          if (updatedClassName !== currentClassName) {
            nextStudentInfo[student] = {
              ...(nextStudentInfo[student] || {}),
              className: updatedClassName,
            };
          }
        });
        nextAddedClassList = [...new Set(baseAddedClassList.map((classKey) => (classKey === editingClassKey ? nextClassKey : classKey)).concat(nextClassKey))];
        nextDateHomeworkList = renameClassKeyInDateTree(nextDateHomeworkList, editingClassKey, nextClassKey);
        nextDateProgressList = renameClassKeyInDateTree(nextDateProgressList, editingClassKey, nextClassKey);
        nextDateCompletionData = renameClassKeyInDateTree(nextDateCompletionData, editingClassKey, nextClassKey);
        nextDateProgressData = renameClassKeyInDateTree(nextDateProgressData, editingClassKey, nextClassKey);
        nextQuickMemoByClass = renameClassKey(nextQuickMemoByClass, editingClassKey, nextClassKey);
        nextNotebookByClass = renameClassKey(nextNotebookByClass, editingClassKey, nextClassKey);
      }

      await setDoc(
        phoneRef,
        {
          studentInfo: nextStudentInfo,
          addedClassList: nextAddedClassList,
          classCatalog: nextClassCatalog,
          lastUpdated: now,
        },
        { merge: true }
      );

      if (editingClassKey && nextClassKey !== editingClassKey) {
        await setDoc(
          dateDataRef,
          {
            homeworkList: nextDateHomeworkList,
            progressList: nextDateProgressList,
            completionData: nextDateCompletionData,
            progressData: nextDateProgressData,
            quickMemoByClass: nextQuickMemoByClass,
            notebookByClass: nextNotebookByClass,
            lastUpdated: now,
          },
          { merge: true }
        );
      }

      setSelectedClassKey(nextClassKey);
      setEditingClassKey(nextClassKey);
      alert(editingClassKey ? '반 정보가 저장되었습니다.' : '새 반이 등록되었습니다.');
    } catch (error) {
      console.error('반 정보 저장 실패:', error);
      alert(`반 정보 저장에 실패했습니다. ${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  }, [editingClassKey, form]);

  const handleDeleteClass = useCallback(async () => {
    if (!selectedClassKey) {
      alert('삭제할 반을 먼저 선택해주세요.');
      return;
    }
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }

    const selectedEntry = classEntries.find((entry) => entry.key === selectedClassKey);
    const displayName = selectedEntry ? formatClassDisplay(selectedClassKey, selectedEntry) : formatClassDisplay(selectedClassKey);
    const studentCount = selectedEntry?.studentCount || 0;
    const message = studentCount > 0
      ? `"${displayName}" 반을 삭제하면 등록 학생 ${studentCount}명의 반 정보에서도 함께 제거됩니다. 계속할까요?`
      : `"${displayName}" 반을 삭제할까요?`;

    if (!window.confirm(message)) return;

    setSaving(true);
    try {
      const phoneRef = doc(db, HOMEWORK_COMPLETION_PHONE_DOC, HOMEWORK_COMPLETION_PHONE_DOC_ID);
      const dateDataRef = doc(db, DATE_DATA_DOC, 'all');
      const [phoneSnap, dateSnap] = await Promise.all([getDoc(phoneRef), getDoc(dateDataRef)]);
      const phoneData = phoneSnap.exists() ? phoneSnap.data() : {};
      const baseStudentInfo = phoneData.studentInfo && typeof phoneData.studentInfo === 'object' ? { ...phoneData.studentInfo } : {};
      const baseAddedClassList = Array.isArray(phoneData.addedClassList)
        ? phoneData.addedClassList.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const baseClassCatalog = normalizeClassCatalog(phoneData.classCatalog || {});
      const baseStudentClassHistory =
        phoneData.studentClassHistory && typeof phoneData.studentClassHistory === 'object' && !Array.isArray(phoneData.studentClassHistory)
          ? { ...phoneData.studentClassHistory }
          : {};
      const removedAt = new Date().toISOString();

      Object.keys(baseStudentInfo).forEach((student) => {
        const currentClassName = baseStudentInfo[student]?.className || '';
        const classes = parseClassNames(currentClassName);
        if (!classes.includes(selectedClassKey)) return;
        const history = Array.isArray(baseStudentClassHistory[student]) ? [...baseStudentClassHistory[student]] : [];
        history.push({ className: selectedClassKey, removedAt });
        baseStudentClassHistory[student] = history;
        baseStudentInfo[student] = {
          ...(baseStudentInfo[student] || {}),
          className: removeClassNameFromJoinedList(currentClassName, selectedClassKey),
        };
      });

      const nextAddedClassList = baseAddedClassList.filter((classKey) => classKey !== selectedClassKey);
      delete baseClassCatalog[selectedClassKey];

      const nextDateHomeworkList = removeClassKeyFromDateTree(dateSnap.exists() ? dateSnap.data()?.homeworkList || {} : {}, selectedClassKey);
      const nextDateProgressList = removeClassKeyFromDateTree(dateSnap.exists() ? dateSnap.data()?.progressList || {} : {}, selectedClassKey);
      const nextDateCompletionData = removeClassKeyFromDateTree(dateSnap.exists() ? dateSnap.data()?.completionData || {} : {}, selectedClassKey);
      const nextDateProgressData = removeClassKeyFromDateTree(dateSnap.exists() ? dateSnap.data()?.progressData || {} : {}, selectedClassKey);
      const nextQuickMemoByClass = { ...(dateSnap.exists() ? dateSnap.data()?.quickMemoByClass || {} : {}) };
      const nextNotebookByClass = { ...(dateSnap.exists() ? dateSnap.data()?.notebookByClass || {} : {}) };
      delete nextQuickMemoByClass[selectedClassKey];
      delete nextNotebookByClass[selectedClassKey];

      await setDoc(
        phoneRef,
        {
          studentInfo: baseStudentInfo,
          addedClassList: nextAddedClassList,
          classCatalog: baseClassCatalog,
          studentClassHistory: baseStudentClassHistory,
          lastUpdated: removedAt,
        },
        { merge: true }
      );

      await setDoc(
        dateDataRef,
        {
          homeworkList: nextDateHomeworkList,
          progressList: nextDateProgressList,
          completionData: nextDateCompletionData,
          progressData: nextDateProgressData,
          quickMemoByClass: nextQuickMemoByClass,
          notebookByClass: nextNotebookByClass,
          lastUpdated: removedAt,
        },
        { merge: true }
      );

      resetForm();
      alert('반이 삭제되었고 숙제 과제 완료도에서도 제거되었습니다.');
    } catch (error) {
      console.error('반 삭제 실패:', error);
      alert(`반 삭제에 실패했습니다. ${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  }, [classEntries, resetForm, selectedClassKey]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}>
          반 목록을 불러오는 중입니다...
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px' }}>
      <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>➕ 반 만들기</h1>
            <p style={{ margin: '8px 0 0', color: '#475569' }}>
              여기서 등록한 반만 앞으로 `숙제 과제 완료도`에 표시되고, 여기서 삭제하면 완료도에서도 함께 사라집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              border: 'none',
              background: '#334155',
              color: '#fff',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 440px) minmax(0, 1fr)', gap: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
                {editingClassKey ? '반 정보 수정' : '새 반 등록'}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                새로 입력
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>운영년도</label>
                <input
                  type="text"
                  value={form.year}
                  onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
                  maxLength={2}
                  className="student-data-phone-input"
                  placeholder="예: 26"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>반 이름</label>
                <input
                  type="text"
                  value={form.className}
                  onChange={(e) => setForm((prev) => ({ ...prev, className: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="예: 고2 심화"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>과목</label>
                <select
                  value={form.subject}
                  onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                  className="student-data-phone-input"
                >
                  <option value="">과목 선택</option>
                  {SUBJECT_OPTIONS.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>관</label>
                <select
                  value={form.hall}
                  onChange={(e) => setForm((prev) => ({ ...prev, hall: e.target.value }))}
                  className="student-data-phone-input"
                >
                  {HALL_OPTIONS.map((hall) => (
                    <option key={hall} value={hall}>{hall}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>반 담임 선생님</label>
                <input
                  type="text"
                  value={form.teacher}
                  onChange={(e) => setForm((prev) => ({ ...prev, teacher: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="예: 김경진"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>요일</label>
                <input
                  type="text"
                  value={form.day}
                  onChange={(e) => setForm((prev) => ({ ...prev, day: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="예: 월수"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>시간</label>
                <input
                  type="text"
                  value={form.startTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="시작 시간 예: 18:00"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>끝나는 시간</label>
                <input
                  type="text"
                  value={form.endTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="끝 시간 예: 20:00"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>강의실 번호</label>
                <input
                  type="text"
                  value={form.room}
                  onChange={(e) => setForm((prev) => ({ ...prev, room: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="예: 302호"
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>수강료</label>
                <input
                  type="text"
                  value={form.tuition}
                  onChange={(e) => setForm((prev) => ({ ...prev, tuition: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="예: 350,000원"
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>신규생 안내사항</label>
                <textarea
                  value={form.newStudentNotice}
                  onChange={(e) => setForm((prev) => ({ ...prev, newStudentNotice: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="신규생 공지, 준비물, 상담 안내 등을 입력"
                  rows={4}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>월별 커리큘럼</label>
                <textarea
                  value={form.monthlyCurriculum}
                  onChange={(e) => setForm((prev) => ({ ...prev, monthlyCurriculum: e.target.value }))}
                  className="student-data-phone-input"
                  placeholder="예: 4월 내신 대비 / 5월 모의고사 분석"
                  rows={6}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  flex: '1 1 180px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: saving ? '#94a3b8' : '#7c3aed',
                  color: '#fff',
                  fontWeight: '700',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '저장 중...' : editingClassKey ? '반 정보 저장' : '반 등록'}
              </button>
              <button
                type="button"
                onClick={handleDeleteClass}
                disabled={saving || !selectedClassKey}
                style={{
                  flex: '1 1 180px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: saving || !selectedClassKey ? '#cbd5e1' : '#ef4444',
                  color: '#fff',
                  fontWeight: '700',
                  cursor: saving || !selectedClassKey ? 'not-allowed' : 'pointer',
                }}
              >
                반 삭제
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '18px', padding: '20px', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>등록된 반 목록</h2>
                <div style={{ color: '#475569', fontSize: '0.92rem' }}>총 {filteredClassEntries.length}개 반</div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {HALL_OPTIONS.map((hall) => {
                  const isActive = selectedHallTab === hall;
                  return (
                    <button
                      key={hall}
                      type="button"
                      onClick={() => setSelectedHallTab(hall)}
                      style={{
                        padding: '9px 14px',
                        borderRadius: '999px',
                        border: isActive ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                        background: isActive ? '#f3e8ff' : '#fff',
                        color: isActive ? '#6b21a8' : '#334155',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      {hall}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <div style={{ minWidth: '150px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#475569' }}>
                    학교급
                  </label>
                  <select
                    value={selectedSchoolLevelFilter}
                    onChange={(e) => setSelectedSchoolLevelFilter(e.target.value)}
                    className="student-data-phone-input"
                  >
                    {SCHOOL_LEVEL_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: '150px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#475569' }}>
                    과목
                  </label>
                  <select
                    value={selectedSubjectFilter}
                    onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                    className="student-data-phone-input"
                  >
                    <option value="전체">전체</option>
                    {SUBJECT_OPTIONS.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredClassEntries.length === 0 ? (
                <div style={{ padding: '28px', borderRadius: '14px', background: '#f8fafc', color: '#64748b', textAlign: 'center' }}>
                  {selectedHallTab}에서 조건에 맞는 반이 없습니다.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredClassEntries.map((entry) => {
                    const isSelected = entry.key === selectedClassKey;
                    return (
                      <div key={entry.key}>
                        <button
                          type="button"
                          onClick={() => handleSelectClass(entry)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '16px',
                            borderRadius: '14px',
                            border: isSelected ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                            background: isSelected ? '#faf5ff' : '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <strong style={{ color: '#0f172a', fontSize: '1rem' }}>
                              {formatClassDisplay(entry.key, entry)}
                            </strong>
                            <span style={{ color: '#475569', fontSize: '0.9rem' }}>{entry.studentCount}명</span>
                          </div>
                          <div style={{ marginTop: '8px', color: '#334155', fontSize: '0.93rem', lineHeight: 1.6 }}>
                            관: {entry.hall || '중앙관'} | 과목: {entry.subject || '-'} | 담임: {entry.teacher || '-'} | 강의실: {entry.room || '-'} | 수강료: {entry.tuition || '-'}
                          </div>
                          {entry.newStudentNotice && (
                            <div style={{ marginTop: '8px', color: '#475569', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                              신규생 안내: {entry.newStudentNotice}
                            </div>
                          )}
                          {entry.monthlyCurriculum && (
                            <div style={{ marginTop: '8px', color: '#475569', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                              월별 커리큘럼: {entry.monthlyCurriculum}
                            </div>
                          )}
                        </button>
                        {isSelected ? selectedClassDashboard : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
