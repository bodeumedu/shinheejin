import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';
import {
  approvePocketbookSignupRequest,
  isPrimaryAdminUser,
  listPocketbookUsers,
  loadPocketbookAccessControl,
  normalizePhoneNumber,
  rejectPocketbookSignupRequest,
  savePocketbookAccessControl,
  setPocketbookUserActive,
} from '../features/auth/utils/userAuth';
import './AdminPage.css';

const PHONE_DOC = 'homeworkCompletionPhoneNumbers';
const PHONE_DOC_ID = 'all';
const DATE_DATA_DOC = 'homeworkCompletionDateData';
const SEND_HISTORY_COLLECTION = 'homeworkCompletionSendHistory';
const SENT_COUNTS_DOC = 'homeworkCompletionSentCounts';
const CLINIC_SUBJECTS = [
  { id: 'english', label: '영어' },
  { id: 'math', label: '수학' },
];
const INDIVIDUAL_HOMEWORK_KEY = '__individual_homework_text__';
const INDIVIDUAL_PROGRESS_KEY = '__individual_progress_text__';
const COMMENT_KEY = '__comment__';
const ATTENDANCE_STATUS_OPTIONS = ['출석', '결석', '지각', '조퇴', '보강'];

function attendanceStatusTextClass(status) {
  const map = { 출석: 'present', 결석: 'absent', 지각: 'late', 조퇴: 'early', 보강: 'makeup' };
  return map[status] || 'none';
}
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_INDEX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

function extractDayToken(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const matches = Array.from(raw.matchAll(/(?:^|[\s_()])([월화수목금토일]{1,3})(?=$|[\s_()0-9])/g));
  if (matches.length === 0) return '';
  return matches[matches.length - 1]?.[1] || '';
}

function formatLocalYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const year = monday.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((monday - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return { year, week: weekNumber };
}

function getClinicWeekKey(dateText) {
  const baseDate = dateText ? new Date(`${dateText}T00:00:00`) : new Date();
  const safeDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const { year, week } = getWeekNumber(safeDate);
  return `${year}_week_${week}`;
}

function getClinicWeekKeys(dateText) {
  const currentWeekKey = getClinicWeekKey(dateText);
  const previousWeekKey = getClinicWeekKey(shiftDateText(dateText || formatLocalYMD(), -7));
  return [...new Set([currentWeekKey, previousWeekKey].filter(Boolean))];
}

function mergeClinicRecordDocs(...docs) {
  const merged = {};
  docs.forEach((docData, docIndex) => {
    const records = docData && typeof docData === 'object' ? docData : {};
    Object.entries(records).forEach(([key, value], recordIndex) => {
      merged[`${docIndex}_${key}_${recordIndex}`] = value;
    });
  });
  return merged;
}

function mergeClinicHistoryDocs(...docs) {
  const merged = {};
  docs.forEach((docData) => {
    const history = docData && typeof docData === 'object' ? docData : {};
    Object.entries(history).forEach(([studentName, entries]) => {
      if (!Array.isArray(entries) || entries.length === 0) return;
      merged[studentName] = [...(merged[studentName] || []), ...entries];
    });
  });
  return merged;
}

function normalizeMatchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s()_\-]+/g, '');
}

function classNamesLikelyMatch(a, b) {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function parseClassNames(classNameStr) {
  if (!classNameStr || typeof classNameStr !== 'string') return [];
  return classNameStr.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseClassMeta(className) {
  const raw = String(className || '').trim();
  const parts = raw.split('_').filter(Boolean);
  const teacher = parts[1] || '';
  let dayIndex = -1;
  let timeIndex = -1;

  parts.forEach((part, index) => {
    const token = String(part || '').trim();
    if (dayIndex === -1 && /^[월화수목금토일]{1,3}$/.test(token)) dayIndex = index;
    if (timeIndex === -1 && /^\d{1,2}:\d{2}$/.test(token)) timeIndex = index;
  });

  const endCandidates = [dayIndex, timeIndex].filter((index) => index >= 2);
  const courseEnd = endCandidates.length > 0 ? Math.min(...endCandidates) : parts.length;
  const courseName = parts.slice(2, courseEnd).join(' ').trim() || parts[2] || raw;
  const day = dayIndex >= 0 ? parts[dayIndex] : extractDayToken(raw) || extractDayToken(courseName);
  const time = timeIndex >= 0 ? parts[timeIndex] : '';
  const courseNameAlreadyHasDay = day ? courseName.includes(day) : false;
  const displayClassName = day && time
    ? (courseNameAlreadyHasDay ? `${courseName} (${time})` : `${courseName} (${day} ${time})`)
    : day
      ? (courseNameAlreadyHasDay ? courseName : `${courseName} (${day})`)
      : courseName;

  return {
    raw,
    teacher,
    courseName,
    day,
    time,
    displayClassName,
  };
}

function formatClassName(className) {
  return parseClassMeta(className).displayClassName || String(className || '');
}

function getWeekdayLabel(dateText) {
  if (!dateText) return '';
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return WEEKDAY_LABELS[date.getDay()] || '';
}

function shiftDateText(dateText, diffDays) {
  if (!dateText) return '';
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + diffDays);
  return formatLocalYMD(date);
}

function getClassWeekdayIndexes(dayText) {
  return [...new Set(String(dayText || '').split('').map((char) => WEEKDAY_INDEX[char]).filter((value) => value !== undefined))];
}

function getPreviousClassDate(dateText, dayText) {
  const targetDate = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(targetDate.getTime())) return '';
  const weekdayIndexes = getClassWeekdayIndexes(dayText);
  if (weekdayIndexes.length === 0) return '';
  for (let diff = 1; diff <= 7; diff += 1) {
    const probe = new Date(targetDate);
    probe.setDate(targetDate.getDate() - diff);
    if (weekdayIndexes.includes(probe.getDay())) {
      return formatLocalYMD(probe);
    }
  }
  return '';
}

function formatShortDate(dateText) {
  if (!dateText) return '-';
  const [year, month, day] = String(dateText).split('-');
  if (!year || !month || !day) return dateText;
  return `${month}-${day}`;
}

function formatDateTimeText(dateText) {
  if (!dateText) return '-';
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return String(dateText);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function classMatchesWeekday(className, weekday) {
  if (!weekday) return false;
  const meta = parseClassMeta(className);
  return Boolean(meta.day && meta.day.includes(weekday));
}

function normalizeStudentNames(raw) {
  if (!raw) return [];
  if (typeof raw !== 'string') return [];
  if (raw.includes(',')) {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [raw.trim()].filter(Boolean);
}

function extractStudentName(item) {
  if (item == null) return '';
  if (typeof item === 'string') return String(item).trim();
  if (typeof item === 'object') {
    const raw = item.name || item.student || item.studentName;
    return raw != null ? String(raw).trim() : '';
  }
  return '';
}

export default function AdminPage({ currentUser, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState([]);
  const [studentInfo, setStudentInfo] = useState({});
  const [addedClassList, setAddedClassList] = useState([]);
  const [dateData, setDateData] = useState({
    completionData: {},
    homeworkList: {},
    progressList: {},
    progressData: {},
    attendanceData: {},
  });
  const [sendHistory, setSendHistory] = useState({});
  const [sentCounts, setSentCounts] = useState({});
  const [selectedDate, setSelectedDate] = useState(formatLocalYMD());
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [isClassSelectorCollapsed, setIsClassSelectorCollapsed] = useState(true);
  const [sendDetailModal, setSendDetailModal] = useState(null);
  const [clinicRecords, setClinicRecords] = useState({ english: {}, math: {} });
  const [clinicHistory, setClinicHistory] = useState({ english: {}, math: {} });
  const [clinicDetailModal, setClinicDetailModal] = useState(null);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [approvedMembers, setApprovedMembers] = useState([]);
  const [signupRequests, setSignupRequests] = useState([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [approvalForm, setApprovalForm] = useState({ name: '', phoneNumber: '', role: 'teacher', note: '' });
  const isPrimaryAdmin = isPrimaryAdminUser(currentUser);

  const loadAdminData = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) {
      setError('Firebase가 설정되지 않았습니다.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const clinicWeekKeys = getClinicWeekKeys(selectedDate);
      const [phoneSnap, dateSnap, historySnap, countsSnap, ...clinicSnaps] = await Promise.all([
        getDoc(doc(db, PHONE_DOC, PHONE_DOC_ID)),
        getDoc(doc(db, DATE_DATA_DOC, 'all')),
        getDoc(doc(db, SEND_HISTORY_COLLECTION, 'all')),
        getDoc(doc(db, SENT_COUNTS_DOC, 'all')),
        ...clinicWeekKeys.flatMap((weekKey) => [
          getDoc(doc(db, 'clinicLogRecords_english', weekKey)),
          getDoc(doc(db, 'clinicLogRecords_math', weekKey)),
          getDoc(doc(db, 'clinicKakaoHistory_english', weekKey)),
          getDoc(doc(db, 'clinicKakaoHistory_math', weekKey)),
        ]),
      ]);

      const phoneData = phoneSnap.exists() ? phoneSnap.data() : {};
      const dateBlob = dateSnap.exists() ? dateSnap.data() : {};
      const historyData = historySnap.exists() ? historySnap.data() : {};
      const countsData = countsSnap.exists() ? countsSnap.data() : {};

      const clinicDocsByWeek = clinicWeekKeys.map((weekKey, index) => {
        const baseIndex = index * 4;
        return {
          weekKey,
          englishRecords: clinicSnaps[baseIndex],
          mathRecords: clinicSnaps[baseIndex + 1],
          englishHistory: clinicSnaps[baseIndex + 2],
          mathHistory: clinicSnaps[baseIndex + 3],
        };
      });

      setStudents(Array.isArray(phoneData.students) ? phoneData.students : []);
      setStudentInfo(phoneData.studentInfo && typeof phoneData.studentInfo === 'object' ? phoneData.studentInfo : {});
      setAddedClassList(Array.isArray(phoneData.addedClassList) ? phoneData.addedClassList : []);
      setDateData({
        completionData: dateBlob.completionData && typeof dateBlob.completionData === 'object' ? dateBlob.completionData : {},
        homeworkList: dateBlob.homeworkList && typeof dateBlob.homeworkList === 'object' ? dateBlob.homeworkList : {},
        progressList: dateBlob.progressList && typeof dateBlob.progressList === 'object' ? dateBlob.progressList : {},
        progressData: dateBlob.progressData && typeof dateBlob.progressData === 'object' ? dateBlob.progressData : {},
        attendanceData: dateBlob.attendanceData && typeof dateBlob.attendanceData === 'object' ? dateBlob.attendanceData : {},
      });
      setSendHistory(historyData.history && typeof historyData.history === 'object' ? historyData.history : {});
      setSentCounts(countsData.counts && typeof countsData.counts === 'object' ? countsData.counts : {});
      setClinicRecords({
        english: mergeClinicRecordDocs(
          ...clinicDocsByWeek.map((item) => (item.englishRecords?.exists() ? (item.englishRecords.data()?.records || {}) : {}))
        ),
        math: mergeClinicRecordDocs(
          ...clinicDocsByWeek.map((item) => (item.mathRecords?.exists() ? (item.mathRecords.data()?.records || {}) : {}))
        ),
      });
      setClinicHistory({
        english: mergeClinicHistoryDocs(
          ...clinicDocsByWeek.map((item) => (item.englishHistory?.exists() ? (item.englishHistory.data()?.history || {}) : {}))
        ),
        math: mergeClinicHistoryDocs(
          ...clinicDocsByWeek.map((item) => (item.mathHistory?.exists() ? (item.mathHistory.data()?.history || {}) : {}))
        ),
      });
    } catch (e) {
      console.error('관리자 페이지 로드 실패:', e);
      setError(e?.message || '관리자 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const loadAccountAdminData = useCallback(async () => {
    if (!isPrimaryAdmin) return;
    setAccountLoading(true);
    setAccountError('');
    try {
      const [users, accessControl] = await Promise.all([
        listPocketbookUsers(),
        loadPocketbookAccessControl(),
      ]);
      setRegisteredUsers(users);
      setApprovedMembers(accessControl.approvedMembers || []);
      setSignupRequests(accessControl.signupRequests || []);
    } catch (e) {
      console.error('계정 관리 데이터 로드 실패:', e);
      setAccountError(e?.message || '계정 관리 데이터를 불러오지 못했습니다.');
    } finally {
      setAccountLoading(false);
    }
  }, [isPrimaryAdmin]);

  useEffect(() => {
    loadAccountAdminData();
  }, [loadAccountAdminData]);

  const handleApprovalFormChange = useCallback((field, value) => {
    setApprovalForm((prev) => ({
      ...prev,
      [field]: field === 'phoneNumber' ? normalizePhoneNumber(value) : value,
    }));
  }, []);

  const handleAddApprovedMember = useCallback(() => {
    const nextName = String(approvalForm.name || '').trim();
    const nextPhone = normalizePhoneNumber(approvalForm.phoneNumber || '');
    if (!nextName || !nextPhone) {
      alert('이름과 전화번호를 입력해주세요.');
      return;
    }
    const alreadyExists = approvedMembers.some((item) =>
      normalizePhoneNumber(item.phoneNumber) === nextPhone && String(item.name || '').trim() === nextName,
    );
    if (alreadyExists) {
      alert('이미 등록된 승인 대상입니다.');
      return;
    }
    setApprovedMembers((prev) => [
      ...prev,
      {
        name: nextName,
        phoneNumber: nextPhone,
        role: approvalForm.role || 'teacher',
        note: String(approvalForm.note || '').trim(),
        linkedTeacherNames: [nextName],
      },
    ].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko')));
    setApprovalForm({ name: '', phoneNumber: '', role: 'teacher', note: '' });
  }, [approvalForm, approvedMembers]);

  const handleRemoveApprovedMember = useCallback((phoneNumber) => {
    setApprovedMembers((prev) => prev.filter((item) => normalizePhoneNumber(item.phoneNumber) !== normalizePhoneNumber(phoneNumber)));
  }, []);

  const handleSaveApprovedMembers = useCallback(async () => {
    setAccountSaving(true);
    setAccountError('');
    try {
      await savePocketbookAccessControl({ approvedMembers, signupRequests });
      await loadAccountAdminData();
      alert('승인 대상 목록이 저장되었습니다.');
    } catch (e) {
      console.error('승인 대상 저장 실패:', e);
      setAccountError(e?.message || '승인 대상 목록 저장에 실패했습니다.');
    } finally {
      setAccountSaving(false);
    }
  }, [approvedMembers, signupRequests, loadAccountAdminData]);

  const handleToggleAccountActive = useCallback(async (phoneNumber, nextIsActive) => {
    const question = nextIsActive ? '이 계정을 다시 활성화할까요?' : '이 계정을 비활성화할까요?';
    if (!window.confirm(question)) return;
    setAccountSaving(true);
    setAccountError('');
    try {
      await setPocketbookUserActive(phoneNumber, nextIsActive);
      await loadAccountAdminData();
    } catch (e) {
      console.error('계정 상태 변경 실패:', e);
      setAccountError(e?.message || '계정 상태 변경에 실패했습니다.');
    } finally {
      setAccountSaving(false);
    }
  }, [loadAccountAdminData]);

  const handleApproveSignupRequest = useCallback(async (phoneNumber) => {
    if (!window.confirm('이 가입 요청을 승인할까요? 승인되면 바로 로그인할 수 있습니다.')) return;
    setAccountSaving(true);
    setAccountError('');
    try {
      await approvePocketbookSignupRequest(phoneNumber);
      await loadAccountAdminData();
    } catch (e) {
      console.error('가입 요청 승인 실패:', e);
      setAccountError(e?.message || '가입 요청 승인에 실패했습니다.');
    } finally {
      setAccountSaving(false);
    }
  }, [loadAccountAdminData]);

  const handleRejectSignupRequest = useCallback(async (phoneNumber) => {
    if (!window.confirm('이 가입 요청을 반려할까요?')) return;
    setAccountSaving(true);
    setAccountError('');
    try {
      await rejectPocketbookSignupRequest(phoneNumber);
      await loadAccountAdminData();
    } catch (e) {
      console.error('가입 요청 반려 실패:', e);
      setAccountError(e?.message || '가입 요청 반려에 실패했습니다.');
    } finally {
      setAccountSaving(false);
    }
  }, [loadAccountAdminData]);

  const activeStudents = useMemo(
    () => [...new Set((Array.isArray(students) ? students : []).map(extractStudentName).filter(Boolean))],
    [students]
  );

  const classOptions = useMemo(() => {
    const set = new Set();
    activeStudents.forEach((student) => {
      parseClassNames(studentInfo[student]?.className || '').forEach((className) => set.add(className));
    });
    addedClassList.forEach((className) => {
      if (className) set.add(className);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [activeStudents, studentInfo, addedClassList]);

  const selectedWeekday = useMemo(() => getWeekdayLabel(selectedDate), [selectedDate]);

  const suggestedClasses = useMemo(
    () => classOptions.filter((className) => classMatchesWeekday(className, selectedWeekday)),
    [classOptions, selectedWeekday]
  );

  useEffect(() => {
    setSelectedClasses(suggestedClasses);
  }, [suggestedClasses]);

  const classOptionsWithMeta = useMemo(
    () =>
      classOptions
        .map((className) => ({
          className,
          ...parseClassMeta(className),
          matchesSelectedWeekday: classMatchesWeekday(className, selectedWeekday),
        }))
        .sort((a, b) => (a.teacher || '').localeCompare(b.teacher || '', 'ko') || a.displayClassName.localeCompare(b.displayClassName, 'ko')),
    [classOptions, selectedWeekday]
  );

  const toggleClassSelection = useCallback((className) => {
    setSelectedClasses((prev) =>
      prev.includes(className) ? prev.filter((item) => item !== className) : [...prev, className]
    );
  }, []);

  const reportClassGroups = useMemo(() => {
    const dayHistory = Array.isArray(sendHistory[selectedDate]) ? sendHistory[selectedDate] : [];
    const clinicEntries = CLINIC_SUBJECTS.flatMap(({ id, label }) =>
      Object.values(clinicRecords[id] || {}).map((raw) => ({
        student: extractStudentName(raw),
        className: String(raw?.className || '').trim(),
        subjectLabel: label,
        sent: String(raw?.messageStatus || '').trim() === '카톡 발신 완료',
      }))
    ).filter((entry) => entry.student);

    return [...selectedClasses]
      .map((className) => {
        const meta = parseClassMeta(className);
        const classStudents = activeStudents
          .filter((student) => parseClassNames(studentInfo[student]?.className || '').includes(className))
          .sort((a, b) => a.localeCompare(b, 'ko'));

        const noticeDate = selectedDate;
        const completionSourceDate = getPreviousClassDate(selectedDate, meta.day);
        const noticeHomeworkList = dateData.homeworkList?.[noticeDate]?.[className] || [];
        const noticeProgressList = dateData.progressList?.[noticeDate]?.[className] || [];
        const completionHomeworkList = completionSourceDate ? (dateData.homeworkList?.[completionSourceDate]?.[className] || []) : [];
        const completionProgressList = completionSourceDate ? (dateData.progressList?.[completionSourceDate]?.[className] || []) : [];
        const completionDataRowByStudent = completionSourceDate ? (dateData.completionData?.[completionSourceDate]?.[className] || {}) : {};
        const progressDataRowByStudent = completionSourceDate ? (dateData.progressData?.[completionSourceDate]?.[className] || {}) : {};

        const rows = classStudents.map((student) => {
          const completionRow = completionDataRowByStudent?.[student] || {};
          const progressRow = progressDataRowByStudent?.[student] || {};
          const individualHomework = String(completionRow?.[INDIVIDUAL_HOMEWORK_KEY] || '').trim();
          const individualProgress = String(progressRow?.[INDIVIDUAL_PROGRESS_KEY] || '').trim();
          const comment = String(completionRow?.[COMMENT_KEY] || '').trim();
          const homeworkChecks = Object.keys(completionRow).filter(
            (key) =>
              ![INDIVIDUAL_HOMEWORK_KEY, COMMENT_KEY].includes(key) &&
              completionRow[key] &&
              typeof completionRow[key] === 'object'
          );
          const progressValues = Object.keys(progressRow).filter(
            (key) => key !== INDIVIDUAL_PROGRESS_KEY && String(progressRow[key] || '').trim() !== ''
          );

          const shouldSendNotice =
            noticeHomeworkList.length > 0 ||
            noticeProgressList.length > 0;
          const shouldSendCompletion =
            completionHomeworkList.length > 0 ||
            completionProgressList.length > 0 ||
            individualHomework !== '' ||
            individualProgress !== '' ||
            homeworkChecks.length > 0 ||
            progressValues.length > 0 ||
            comment !== '';

          const matchedHistory = dayHistory.filter((entry) => {
            if (entry?.반명 !== className) return false;
            return normalizeStudentNames(entry?.학생명).includes(student);
          });
          const noticeHistory = matchedHistory.filter((entry) => entry?.타입 === '알림장');
          const completionHistory = matchedHistory.filter((entry) => entry?.타입 === '완료도');
          const counts = sentCounts?.[selectedDate]?.[className]?.[student] || {};
          const clinicEntriesForStudent = clinicEntries.filter((entry) => entry.student === student);
          const clinicEntriesMatchedByClass = clinicEntriesForStudent.filter((entry) =>
            classNamesLikelyMatch(entry.className, className)
          );
          const matchedClinicEntries = clinicEntriesMatchedByClass.length > 0
            ? clinicEntriesMatchedByClass
            : clinicEntriesForStudent;
          const clinicSentEntries = matchedClinicEntries.filter((entry) => entry.sent);
          const clinicSubjectLabels = [...new Set(
            (clinicSentEntries.length > 0 ? clinicSentEntries : matchedClinicEntries).map((entry) => entry.subjectLabel)
          )];
          const clinicHistoryBySubject = CLINIC_SUBJECTS.map(({ id, label }) => {
            const rawEntries = Array.isArray(clinicHistory[id]?.[student]) ? clinicHistory[id][student] : [];
            const normalizedEntries = rawEntries
              .filter((entry) => entry && typeof entry === 'object')
              .map((entry) => ({
                date: String(entry.date || '').trim(),
                content: String(entry.content || '').trim(),
                weekLabel: String(entry.weekLabel || '').trim(),
                recipients: Array.isArray(entry.recipients) ? entry.recipients : [],
              }))
              .filter((entry) => entry.date || entry.content || entry.recipients.length > 0)
              .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
            const dateGroupsMap = new Map();
            normalizedEntries.forEach((entry) => {
              const key = String(entry.date || '').slice(0, 10) || '날짜 미상';
              const current = dateGroupsMap.get(key) || [];
              current.push(entry);
              dateGroupsMap.set(key, current);
            });
            const dateGroups = Array.from(dateGroupsMap.entries())
              .map(([dateKey, entries]) => ({
                dateKey,
                count: entries.length,
                entries,
              }))
              .sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));
            return {
              id,
              label,
              entries: normalizedEntries,
              dateGroups,
            };
          }).filter((item) => item.entries.length > 0);
          const clinicSentCount = clinicHistoryBySubject.reduce((sum, item) => sum + item.entries.length, 0);

          const attendanceRaw = dateData.attendanceData?.[noticeDate]?.[className]?.[student];
          const attendanceStatus =
            typeof attendanceRaw === 'string' && ATTENDANCE_STATUS_OPTIONS.includes(attendanceRaw) ? attendanceRaw : '';

          return {
            student,
            shouldSendNotice,
            shouldSendCompletion,
            attendanceStatus,
            noticeSent: noticeHistory.length > 0 || (counts.notice || 0) > 0,
            completionSent: completionHistory.length > 0 || (counts.completion || 0) > 0,
            noticeCount: counts.notice || 0,
            completionCount: counts.completion || 0,
            noticeDate,
            completionSourceDate,
            individualHomework,
            individualProgress,
            comment,
            homeworkChecksCount: homeworkChecks.length,
            progressValuesCount: progressValues.length,
            clinicTracked: matchedClinicEntries.length > 0,
            clinicSent: clinicSentEntries.length > 0 || clinicSentCount > 0,
            clinicSubjectLabels,
            clinicSentCount,
            clinicHistoryBySubject,
          };
        });

        return {
          className,
          teacher: meta.teacher || '-',
          displayClassName: meta.displayClassName || className,
          day: meta.day || '',
          rows,
          rowSpan: rows.length,
          homeworkList: noticeHomeworkList,
          progressList: noticeProgressList,
        };
      })
      .sort((a, b) => a.teacher.localeCompare(b.teacher, 'ko') || a.displayClassName.localeCompare(b.displayClassName, 'ko'));
  }, [selectedClasses, selectedDate, sendHistory, activeStudents, studentInfo, dateData, sentCounts, clinicRecords, clinicHistory]);

  const teacherGroups = useMemo(() => {
    const groups = [];
    reportClassGroups.forEach((classGroup) => {
      const lastTeacherGroup = groups[groups.length - 1];
      if (lastTeacherGroup && lastTeacherGroup.teacher === classGroup.teacher) {
        lastTeacherGroup.classes.push(classGroup);
        lastTeacherGroup.rowSpan += classGroup.rowSpan;
      } else {
        groups.push({
          teacher: classGroup.teacher,
          classes: [classGroup],
          rowSpan: classGroup.rowSpan,
        });
      }
    });
    return groups;
  }, [reportClassGroups]);

  const reportRows = useMemo(
    () => reportClassGroups.flatMap((group) => group.rows),
    [reportClassGroups]
  );

  const summary = useMemo(() => {
    const noticeTargets = reportRows.filter((row) => row.shouldSendNotice);
    const completionTargets = reportRows.filter((row) => row.shouldSendCompletion);
    const clinicTargets = reportRows.filter((row) => row.clinicTracked);
    return {
      noticeTargetCount: noticeTargets.length,
      noticeMissingCount: noticeTargets.filter((row) => !row.noticeSent).length,
      completionTargetCount: completionTargets.length,
      completionMissingCount: completionTargets.filter((row) => !row.completionSent).length,
      clinicTargetCount: clinicTargets.length,
      clinicMissingCount: clinicTargets.filter((row) => !row.clinicSent).length,
    };
  }, [reportRows]);

  const selectedClassHints = useMemo(
    () =>
      reportClassGroups.map((group) => ({
        key: group.className,
        label: `${group.displayClassName} · 학생 ${group.rows.length}명`,
        homework: group.homeworkList,
        progress: group.progressList,
      })),
    [reportClassGroups]
  );

  const buildSendPreviewText = useCallback((className, studentName, sendType, sourceDate) => {
    const completionRow = dateData.completionData?.[sourceDate]?.[className]?.[studentName] || {};
    const progressRow = dateData.progressData?.[sourceDate]?.[className]?.[studentName] || {};
    const homeworkList = dateData.homeworkList?.[sourceDate]?.[className] || [];
    const progressList = dateData.progressList?.[sourceDate]?.[className] || [];
    const comment = String(completionRow?.[COMMENT_KEY] || '').trim();

    if (sendType === '알림장') {
      return [
        homeworkList.length > 0 ? `과제\n${homeworkList.join('\n')}` : '',
        progressList.length > 0 ? `진도\n${progressList.join('\n')}` : '',
      ].filter(Boolean).join('\n\n') || '저장된 발송 내용을 찾지 못했습니다.';
    }

    const homeworkStatus = homeworkList
      .map((hw) => {
        const hwData = completionRow?.[hw] || {};
        const completed = hwData?.completed ? '완료' : '미완료';
        const note = hwData?.percentage != null && String(hwData.percentage).trim() !== '' ? ` (${String(hwData.percentage).trim()})` : '';
        return `${hw}: ${completed}${note}`;
      })
      .join('\n');

    const progressText = progressList
      .map((prog) => `${prog}: ${String(progressRow?.[prog] || '').trim() || '-'}`)
      .join('\n');

    return [
      homeworkStatus ? `과제 완료 상태\n${homeworkStatus}` : '',
      progressText ? `진도 상황\n${progressText}` : '',
      comment ? `코멘트\n${comment}` : '',
    ].filter(Boolean).join('\n\n') || '저장된 발송 내용을 찾지 못했습니다.';
  }, [dateData]);

  const openSendDetailModal = useCallback((className, studentName, sendType, sourceDate, historyDate) => {
    const dayHistory = Array.isArray(sendHistory[historyDate]) ? sendHistory[historyDate] : [];
    const entries = dayHistory
      .filter((entry) => {
        if (entry?.반명 !== className) return false;
        if (entry?.타입 !== sendType) return false;
        return normalizeStudentNames(entry?.학생명).includes(studentName);
      })
      .sort((a, b) => String(b?.시간 || '').localeCompare(String(a?.시간 || '')));

    setSendDetailModal({
      className,
      studentName,
      sendType,
      sourceDate,
      historyDate,
      entries,
      previewText: buildSendPreviewText(className, studentName, sendType, sourceDate),
    });
  }, [buildSendPreviewText, sendHistory]);

  const openClinicDetailModal = useCallback((className, studentName, subjectLabel, dateKey, entries) => {
    setClinicDetailModal({
      className,
      studentName,
      subjectLabel,
      dateKey,
      entries: Array.isArray(entries) ? entries : [],
    });
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page-card">
        <div className="admin-page-header">
          <div>
            <h1>🟣 관리자 페이지</h1>
            <p>숙제 과제 완료도에서 날짜별로 반별 발송 누락을 학생 단위로 확인합니다.</p>
          </div>
          <div className="admin-page-actions">
            <button type="button" className="admin-page-refresh" onClick={loadAdminData}>
              새로고침
            </button>
            <button type="button" className="admin-page-close" onClick={onClose}>
              메인 메뉴로
            </button>
          </div>
        </div>

        {loading ? <p className="admin-page-state">불러오는 중...</p> : null}
        {!loading && error ? <p className="admin-page-error">{error}</p> : null}

        {!loading && !error ? (
          <>
            {isPrimaryAdmin ? (
              <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #d8b4fe', borderRadius: '14px', background: '#faf5ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1rem', color: '#581c87' }}>신희진 전용 계정 관리</strong>
                    <span style={{ fontSize: '0.88rem', color: '#6b7280' }}>승인된 학원 구성원만 회원가입할 수 있고, 가입된 계정 상태도 여기서 관리합니다.</span>
                  </div>
                  <button type="button" className="admin-page-refresh" onClick={loadAccountAdminData} disabled={accountLoading || accountSaving}>
                    계정 새로고침
                  </button>
                </div>

                {accountError ? (
                  <div style={{ marginBottom: '12px', color: '#b91c1c', fontSize: '0.9rem', fontWeight: 600 }}>{accountError}</div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.4fr)', gap: '16px' }}>
                  <section style={{ background: '#fff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '10px', color: '#4c1d95' }}>가입 요청 대기</div>
                    {signupRequests.length === 0 ? (
                      <div className="admin-page-empty" style={{ marginBottom: '16px' }}>현재 대기 중인 가입 요청이 없습니다.</div>
                    ) : (
                      <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'grid', gap: '8px', marginBottom: '16px' }}>
                        {signupRequests.map((item) => (
                          <div key={`request-${item.phoneNumber}-${item.name}`} style={{ padding: '10px 12px', border: '1px solid #ede9fe', borderRadius: '10px', background: '#fff' }}>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            <div style={{ fontSize: '0.84rem', color: '#6b7280' }}>{item.phoneNumber} · {item.role === 'executive' ? '운영진' : item.role === 'staff' ? '직원' : '선생님'}</div>
                            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
                              요청 시각: {item.requestedAt ? new Date(item.requestedAt).toLocaleString() : '-'}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                              <button type="button" className="admin-page-refresh" onClick={() => handleApproveSignupRequest(item.phoneNumber)} disabled={accountSaving}>
                                승인
                              </button>
                              <button type="button" className="admin-page-close" onClick={() => handleRejectSignupRequest(item.phoneNumber)} disabled={accountSaving}>
                                반려
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ fontWeight: 700, marginBottom: '10px', color: '#4c1d95' }}>회원가입 승인 대상</div>
                    <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
                      <input type="text" value={approvalForm.name} onChange={(e) => handleApprovalFormChange('name', e.target.value)} placeholder="이름" className="week-selector" style={{ minWidth: 0 }} />
                      <input type="text" value={approvalForm.phoneNumber} onChange={(e) => handleApprovalFormChange('phoneNumber', e.target.value)} placeholder="전화번호 (숫자만)" className="week-selector" style={{ minWidth: 0 }} />
                      <select value={approvalForm.role} onChange={(e) => handleApprovalFormChange('role', e.target.value)} className="week-selector" style={{ minWidth: 0 }}>
                        <option value="teacher">선생님</option>
                        <option value="staff">직원</option>
                        <option value="executive">운영진</option>
                      </select>
                      <input type="text" value={approvalForm.note} onChange={(e) => handleApprovalFormChange('note', e.target.value)} placeholder="메모 (선택)" className="week-selector" style={{ minWidth: 0 }} />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="admin-page-refresh" onClick={handleAddApprovedMember} disabled={accountSaving}>승인 대상 추가</button>
                        <button type="button" className="admin-page-close" onClick={handleSaveApprovedMembers} disabled={accountSaving}>
                          {accountSaving ? '저장 중...' : '승인 목록 저장'}
                        </button>
                      </div>
                    </div>
                    <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'grid', gap: '8px' }}>
                      {approvedMembers.length === 0 ? (
                        <div className="admin-page-empty">아직 승인된 사람이 없습니다.</div>
                      ) : (
                        approvedMembers.map((item) => (
                          <div key={`${item.phoneNumber}-${item.name}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', padding: '10px 12px', border: '1px solid #ede9fe', borderRadius: '10px', background: '#fafafa' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700 }}>{item.name}</div>
                              <div style={{ fontSize: '0.84rem', color: '#6b7280' }}>{item.phoneNumber} · {item.role === 'executive' ? '운영진' : item.role === 'staff' ? '직원' : '선생님'}</div>
                              {item.note ? <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>{item.note}</div> : null}
                            </div>
                            <button type="button" className="admin-page-close" onClick={() => handleRemoveApprovedMember(item.phoneNumber)} disabled={accountSaving}>
                              제거
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section style={{ background: '#fff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '10px', color: '#4c1d95' }}>가입된 계정 목록</div>
                    {accountLoading ? (
                      <div className="admin-page-state">계정 불러오는 중...</div>
                    ) : registeredUsers.length === 0 ? (
                      <div className="admin-page-empty">가입된 계정이 없습니다.</div>
                    ) : (
                      <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'grid', gap: '8px' }}>
                        {registeredUsers.map((user) => (
                          <div key={`${user.phoneNumber}-${user.name}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', padding: '12px', border: '1px solid #ede9fe', borderRadius: '10px', background: '#fff' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700 }}>{user.name}</div>
                              <div style={{ fontSize: '0.84rem', color: '#6b7280' }}>{user.phoneNumber}</div>
                              <div style={{ fontSize: '0.82rem', color: user.isActive === false ? '#b91c1c' : '#047857' }}>
                                {user.role === 'executive' ? '운영진' : user.role === 'staff' ? '직원' : '선생님'} · {user.isActive === false ? '비활성화' : '활성'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="admin-page-refresh"
                              onClick={() => handleToggleAccountActive(user.phoneNumber, user.isActive === false)}
                              disabled={accountSaving}
                            >
                              {user.isActive === false ? '활성화' : '비활성화'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            ) : null}

            <div className="admin-page-filters">
              <label>
                날짜
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              </label>
              <div className="admin-page-weekday-card">
                <strong>{selectedDate}</strong>
                <span>{selectedWeekday ? `${selectedWeekday}요일 등원 반 자동 선택` : '요일 확인 불가'}</span>
              </div>
            </div>

            <div className="admin-page-class-selector">
              <div className="admin-page-class-selector-header">
                <div className="admin-page-class-selector-title">
                  <strong>등원 반 선택</strong>
                  <span>{selectedClasses.length}개 선택</span>
                </div>
                <div className="admin-page-class-selector-actions">
                  <button type="button" onClick={() => setIsClassSelectorCollapsed((prev) => !prev)}>
                    {isClassSelectorCollapsed ? '펼치기' : '접기'}
                  </button>
                  <button type="button" onClick={() => setSelectedClasses(suggestedClasses)}>
                    요일 반 다시 선택
                  </button>
                  <button type="button" onClick={() => setSelectedClasses([])}>
                    전체 해제
                  </button>
                </div>
              </div>
              {!isClassSelectorCollapsed ? (
                <div className="admin-page-class-grid">
                  {classOptionsWithMeta.map((item) => (
                    <label key={item.className} className={`admin-page-class-option ${selectedClasses.includes(item.className) ? 'admin-page-class-option-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedClasses.includes(item.className)}
                        onChange={() => toggleClassSelection(item.className)}
                      />
                      <div>
                        <div className="admin-page-class-option-title">{item.displayClassName}</div>
                        <div className="admin-page-class-option-meta">
                          {item.teacher || '-'}{item.day ? ` · ${item.day}` : ''}
                          {item.matchesSelectedWeekday ? ' · 자동 선택' : ''}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="admin-page-summary">
              <div className="admin-page-summary-card">
                <strong>알림장</strong>
                <span>완료 {summary.noticeTargetCount - summary.noticeMissingCount}명</span>
                <span>누락 {summary.noticeMissingCount}명</span>
              </div>
              <div className="admin-page-summary-card">
                <strong>완료도</strong>
                <span>완료 {summary.completionTargetCount - summary.completionMissingCount}명</span>
                <span>누락 {summary.completionMissingCount}명</span>
              </div>
              <div className="admin-page-summary-card">
                <strong>클리닉 발송</strong>
                <span>완료 {summary.clinicTargetCount - summary.clinicMissingCount}명</span>
                <span>누락 {summary.clinicMissingCount}명</span>
              </div>
              <div className="admin-page-summary-card">
                <strong>선택 반</strong>
                <span>{selectedClasses.length}개</span>
                <span>{selectedWeekday ? `${selectedWeekday}요일` : selectedDate}</span>
              </div>
            </div>

            <div className="admin-page-hints">
              {selectedClassHints.length === 0 ? (
                <div>선택된 반이 없습니다.</div>
              ) : (
                selectedClassHints.map((item) => (
                  <div key={item.key}>
                    <strong>{item.label}</strong>
                    {' · '}
                    과제: {item.homework.length > 0 ? item.homework.join(', ') : '없음'}
                    {' · '}
                    진도: {item.progress.length > 0 ? item.progress.join(', ') : '없음'}
                  </div>
                ))
              )}
            </div>

            <div className="admin-page-table-wrap">
              <table className="admin-page-table">
                <thead>
                  <tr>
                    <th>선생님</th>
                    <th>반명</th>
                    <th>학생</th>
                    <th>출결</th>
                    <th>알림장 발송</th>
                    <th>완료도 발송</th>
                    <th>클리닉 발송</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-page-empty">
                        선택된 반이 없거나, 선택한 반에 학생이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    teacherGroups.map((teacherGroup) =>
                      teacherGroup.classes.map((classGroup, classIdx) =>
                        classGroup.rows.map((row, rowIdx) => (
                          <tr key={`${classGroup.className}-${row.student}`}>
                            {classIdx === 0 && rowIdx === 0 ? (
                              <td rowSpan={teacherGroup.rowSpan} className="admin-page-merged-cell">
                                {teacherGroup.teacher}
                              </td>
                            ) : null}
                            {rowIdx === 0 ? (
                              <td rowSpan={classGroup.rowSpan} className="admin-page-merged-cell">
                                {classGroup.displayClassName}
                              </td>
                            ) : null}
                            <td>{row.student}</td>
                            <td className="admin-page-attendance-text-cell">
                              {row.attendanceStatus ? (
                                <span
                                  className={`admin-page-attendance-text admin-page-attendance-text--${attendanceStatusTextClass(row.attendanceStatus)}`}
                                >
                                  {row.attendanceStatus}
                                </span>
                              ) : (
                                <span className="admin-page-attendance-text-none">—</span>
                              )}
                            </td>
                            <td className={row.shouldSendNotice && !row.noticeSent ? 'admin-page-missing' : ''}>
                              {row.noticeSent ? (
                                <button
                                  type="button"
                                  className="admin-page-link-button"
                                  onClick={() =>
                                    openSendDetailModal(classGroup.className, row.student, '알림장', row.noticeDate, selectedDate)
                                  }
                                >
                                  {`${formatShortDate(row.noticeDate)} 완료 (${row.noticeCount})`}
                                </button>
                              ) : row.shouldSendNotice ? (
                                '누락'
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className={row.shouldSendCompletion && !row.completionSent ? 'admin-page-missing' : ''}>
                              {row.completionSent ? (
                                <button
                                  type="button"
                                  className="admin-page-link-button"
                                  onClick={() => openSendDetailModal(classGroup.className, row.student, '완료도', row.completionSourceDate, selectedDate)}
                                >
                                  {`${formatShortDate(row.completionSourceDate)} 완료 (${row.completionCount})`}
                                </button>
                              ) : row.shouldSendCompletion ? '누락' : '-'}
                            </td>
                            <td className={row.clinicTracked && !row.clinicSent ? 'admin-page-missing' : row.clinicSent ? 'admin-page-complete' : ''}>
                              {row.clinicTracked ? (
                                row.clinicHistoryBySubject.length > 0 ? (
                                  <div className="admin-page-clinic-cell">
                                    {row.clinicHistoryBySubject.map((subjectItem) => (
                                      <div key={subjectItem.id} className="admin-page-clinic-block">
                                        <div className="admin-page-clinic-summary">
                                          {subjectItem.label} 완료 ({subjectItem.entries.length}건)
                                        </div>
                                        <div className="admin-page-clinic-dates">
                                          {subjectItem.dateGroups.map((group) => (
                                            <button
                                              key={`${subjectItem.id}-${group.dateKey}`}
                                              type="button"
                                              className="admin-page-link-button"
                                              onClick={() => openClinicDetailModal(classGroup.className, row.student, subjectItem.label, group.dateKey, group.entries)}
                                            >
                                              {`${formatShortDate(group.dateKey)} (${group.count}건)`}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  `${row.clinicSubjectLabels.join('/')} 미발송`
                                )
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>

            {sendDetailModal ? (
              <div className="admin-page-modal-overlay" onClick={() => setSendDetailModal(null)}>
                <div className="admin-page-modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="admin-page-modal-header">
                    <div>
                      <h3>{sendDetailModal.studentName} · {sendDetailModal.sendType}</h3>
                      <p>
                        {formatClassName(sendDetailModal.className)}
                        {sendDetailModal.sendType === '알림장'
                          ? ` · 기준 날짜 ${sendDetailModal.sourceDate || '-'}`
                          : ` · 과제 기준 ${sendDetailModal.sourceDate || '-'} · 전송 확인 ${sendDetailModal.historyDate || '-'}`
                        }
                      </p>
                    </div>
                    <button type="button" className="admin-page-close" onClick={() => setSendDetailModal(null)}>
                      닫기
                    </button>
                  </div>

                  <div className="admin-page-modal-section">
                    <strong>보낸 내용</strong>
                    <pre className="admin-page-modal-pre">{sendDetailModal.previewText}</pre>
                  </div>

                  <div className="admin-page-modal-section">
                    <strong>전송 이력</strong>
                    {sendDetailModal.entries.length === 0 ? (
                      <div className="admin-page-modal-empty">저장된 전송 이력이 없습니다.</div>
                    ) : (
                      <div className="admin-page-modal-entry-list">
                        {sendDetailModal.entries.map((entry, index) => (
                          <div key={`${entry.시간 || 'no-time'}-${index}`} className="admin-page-modal-entry">
                            <div className="admin-page-modal-entry-time">{entry.시간 ? new Date(entry.시간).toLocaleString() : '-'}</div>
                            <div>학생: {entry.학생명 || '-'}</div>
                            <div>과제: {Array.isArray(entry.과제목록) ? entry.과제목록.join(', ') : '-'}</div>
                            <div>진도: {Array.isArray(entry.진도목록) ? entry.진도목록.join(', ') : (entry.진도상황 || '-')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            {clinicDetailModal ? (
              <div className="admin-page-modal-overlay" onClick={() => setClinicDetailModal(null)}>
                <div className="admin-page-modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="admin-page-modal-header">
                    <div>
                      <h3>{clinicDetailModal.studentName} · {clinicDetailModal.subjectLabel} 클리닉</h3>
                      <p>
                        {formatClassName(clinicDetailModal.className)} · {clinicDetailModal.dateKey || '-'}
                      </p>
                    </div>
                    <button type="button" className="admin-page-close" onClick={() => setClinicDetailModal(null)}>
                      닫기
                    </button>
                  </div>

                  <div className="admin-page-modal-section">
                    <strong>전송 이력</strong>
                    {clinicDetailModal.entries.length === 0 ? (
                      <div className="admin-page-modal-empty">저장된 전송 이력이 없습니다.</div>
                    ) : (
                      <div className="admin-page-modal-entry-list">
                        {clinicDetailModal.entries.map((entry, index) => (
                          <div key={`${entry.date || 'no-date'}-${index}`} className="admin-page-modal-entry">
                            <div className="admin-page-modal-entry-time">{formatDateTimeText(entry.date)}</div>
                            <div>주차: {entry.weekLabel || '-'}</div>
                            <div style={{ marginTop: '8px' }}>
                              수신자: {entry.recipients.length > 0
                                ? entry.recipients.map((recipient) => `${recipient.type || '-'} ${recipient.status || '-'}`).join(', ')
                                : '-'}
                            </div>
                            <pre className="admin-page-modal-pre">{entry.content || '저장된 내용이 없습니다.'}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
