import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import { loadCentralPhoneNumbers } from '../../../utils/firestoreUtils';
import './ClinicLog.css';

const dayOrder = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const attendanceOptions = ['', 'O', 'X', '결석'];

const defaultRecord = {
  day: '',
  time: '',
  attendance: '',
  assistant: '',
  arrival: '',
  departure: '',
  messageStatus: '',
  examStatus: '',
  notes: '',
  phoneNumber: '',
  parentPhoneNumber: '',
  parentPhoneNumber2: '',
  // 수학 클리닉 대장 전용 필드
  activityType: '', // 과제/클리닉/테스트
  materialType: '', // 교재/학습지/실전기출
  // 복사 기능을 위한 배열 (과목/교재/시험확인/비고 세트)
  activitySets: [], // [{ activityType, materialType, examStatus, notes }, ...]
};

const storageKeys = {
  records: 'clinicRecordValues',
  customs: 'clinicCustomEntries',
};
const ACTIVE_ROSTER_STORAGE_KEY = 'clinicActiveRoster';
const ACTIVE_ROSTER_DOC_ID = 'all';
const HOMEWORK_PHONE_DOC = 'homeworkCompletionPhoneNumbers';
const HOMEWORK_PHONE_DOC_ID = 'all';

// 학생 타입: 'repeat' (2회 학생), 'return' (재등원 학생)

function parseClassNameList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeRosterKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^0-9A-Za-z가-힣_-]/g, '');
}

function isKnownMathTeacher(value) {
  const compact = String(value || '').replace(/\s+/g, '');
  if (!compact) return false;
  return compact.includes('이민하') || compact.includes('김지수');
}

function isMathClassCatalogItem(classKey, item) {
  const subject = String(item?.subject || '').trim();
  if (subject === '수학') return true;
  if (isKnownMathTeacher(item?.teacher)) return true;
  const haystack = [classKey, item?.className, item?.teacher].join(' ');
  return /중등수학/.test(haystack);
}

function readPhoneField(entry, key) {
  const value = entry?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function extractActiveMathClinicStudents(data = {}) {
  const studentInfo = data?.studentInfo && typeof data.studentInfo === 'object' ? data.studentInfo : {};
  const classCatalog = data?.classCatalog && typeof data.classCatalog === 'object' ? data.classCatalog : {};
  const phoneNumbers = data?.phoneNumbers && typeof data.phoneNumbers === 'object' ? data.phoneNumbers : {};
  const withdrawnNames = new Set(
    (Array.isArray(data?.withdrawnNames) ? data.withdrawnNames : [])
      .map((name) => String(name || '').trim())
      .filter(Boolean)
  );

  const mathClassKeys = new Set(
    Object.entries(classCatalog)
      .filter(([classKey, item]) => isMathClassCatalogItem(classKey, item))
      .map(([classKey]) => classKey)
  );

  return Object.entries(studentInfo)
    .map(([studentName, info]) => {
      const normalizedName = String(studentName || '').trim();
      if (!normalizedName || withdrawnNames.has(normalizedName)) return null;

      const classKeys = parseClassNameList(info?.className);
      const matchedMathClasses = classKeys.filter((classKey) => mathClassKeys.has(classKey));
      if (matchedMathClasses.length === 0) return null;

      const phoneEntry = phoneNumbers[normalizedName];
      const studentPhone =
        typeof phoneEntry === 'string'
          ? phoneEntry.trim()
          : readPhoneField(phoneEntry, 'student');
      const parentPhone = readPhoneField(phoneEntry, 'parent');
      const parentPhone2 = readPhoneField(phoneEntry, 'parent2') || readPhoneField(phoneEntry, 'parentPhone2');

      const classLabels = matchedMathClasses.map((classKey) => {
        const catalogItem = classCatalog[classKey] || {};
        return String(catalogItem.className || classKey || '').trim();
      }).filter(Boolean);

      return {
        student: normalizedName,
        school: String(info?.school || '').trim(),
        grade: String(info?.grade || '').trim(),
        className: classLabels.join(', '),
        phoneNumber: studentPhone || '',
        parentPhoneNumber: parentPhone || '',
        parentPhoneNumber2: parentPhone2 || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.student || '').localeCompare(String(b.student || ''), 'ko'));
}

function syncMathClinicRecords(prevRecords = {}, roster = []) {
  const rosterByStudent = new Map(
    roster.map((entry) => [String(entry.student || '').trim(), entry])
  );
  const nextRecords = {};
  const preservedStudents = new Set();

  Object.entries(prevRecords || {}).forEach(([key, rawRecord]) => {
    const record = mergeRecord(rawRecord);
    const student = String(record.student || '').trim();

    if (key.startsWith('manual-')) {
      nextRecords[key] = record;
      return;
    }

    if (!student) return;

    const rosterEntry = rosterByStudent.get(student);
    if (!rosterEntry) return;

    preservedStudents.add(student);
    nextRecords[key] = {
      ...record,
      school: rosterEntry.school || record.school || '',
      grade: rosterEntry.grade || record.grade || '',
      className: rosterEntry.className || record.className || '',
      student,
      phoneNumber: rosterEntry.phoneNumber || record.phoneNumber || '',
      parentPhoneNumber: rosterEntry.parentPhoneNumber || record.parentPhoneNumber || '',
      parentPhoneNumber2: rosterEntry.parentPhoneNumber2 || record.parentPhoneNumber2 || '',
    };
  });

  roster.forEach((entry) => {
    const student = String(entry.student || '').trim();
    if (!student || preservedStudents.has(student)) return;
    const key = `math-roster-${sanitizeRosterKey(student)}`;
    nextRecords[key] = {
      ...defaultRecord,
      ...entry,
      type: 'repeat',
    };
  });

  return nextRecords;
}

function recordMapsEqual(left = {}, right = {}) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// 월요일 기준으로 주차 계산 (연도와 주차 번호)
// 주의 시작: 월요일, 주의 끝: 일요일
function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // 월요일로 시작하도록 조정 (일요일 = 0, 월요일 = 1)
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 월요일로 조정
  const monday = new Date(d.setDate(diff));
  const year = monday.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((monday - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return { year, week: weekNumber, monday };
}

// 주차 키 생성 (예: "2024_week_1")
function getWeekKey(date = new Date()) {
  const { year, week } = getWeekNumber(date);
  return `${year}_week_${week}`;
}

// 주차 키로부터 월요일과 일요일 날짜 계산
function getWeekDateRange(weekKey) {
  const match = weekKey.match(/(\d+)_week_(\d+)/);
  if (!match) {
    // 기본값: 현재 주차
    const today = new Date();
    const { monday } = getWeekNumber(today);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { monday, sunday };
  }
  
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  
  // 해당 연도의 1월 1일 찾기
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  // 1월 1일이 속한 주의 월요일 계산
  const firstMonday = new Date(jan1);
  const diff = jan1Day === 0 ? -6 : 1 - jan1Day;
  firstMonday.setDate(1 + diff);
  
  // 해당 주차의 월요일 계산
  const targetMonday = new Date(firstMonday);
  targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
  
  // 일요일 계산
  const targetSunday = new Date(targetMonday);
  targetSunday.setDate(targetMonday.getDate() + 6);
  
  return { monday: targetMonday, sunday: targetSunday };
}

// 날짜를 "0000년 0월 00일" 형식으로 포맷팅
function formatDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}년 ${month}월 ${day}일`;
}

// 주차 목록 생성 (현재 주차 기준 뒤 8주, 앞 4주)
function getWeekOptions() {
  const options = [];
  const today = new Date();
  
  // 뒤로 8주 (과거)
  for (let i = 8; i > 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - (i * 7));
    const { year, week } = getWeekNumber(date);
    const weekKey = `${year}_week_${week}`;
    const monday = new Date(date);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    const mondayStr = `${monday.getMonth() + 1}/${monday.getDate()}`;
    options.push({
      key: weekKey,
      label: `${year}년 ${week}주차 (${mondayStr}~)`,
      isCurrent: false,
    });
  }
  
  // 현재 주차
  const { year: currentYear, week: currentWeek } = getWeekNumber(today);
  const currentWeekKey = `${currentYear}_week_${currentWeek}`;
  const currentMonday = new Date(today);
  const currentDay = currentMonday.getDay();
  const currentDiff = currentMonday.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  currentMonday.setDate(currentDiff);
  const currentMondayStr = `${currentMonday.getMonth() + 1}/${currentMonday.getDate()}`;
  options.push({
    key: currentWeekKey,
    label: `${currentYear}년 ${currentWeek}주차 (${currentMondayStr}~)`,
    isCurrent: true,
  });
  
  // 앞으로 4주 (미래)
  for (let i = 1; i <= 4; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + (i * 7));
    const { year, week } = getWeekNumber(date);
    const weekKey = `${year}_week_${week}`;
    const monday = new Date(date);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    const mondayStr = `${monday.getMonth() + 1}/${monday.getDate()}`;
    options.push({
      key: weekKey,
      label: `${year}년 ${week}주차 (${mondayStr}~)`,
      isCurrent: false,
    });
  }
  
  return options;
}

function getDayIndex(day) {
  const index = dayOrder.indexOf(day);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function parseTimeToMinutes(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const text = value.trim();
  if (!text) return Number.MAX_SAFE_INTEGER;

  let hours = 0;
  let minutes = 0;
  let meridian = null;

  if (text.includes('오전') || text.includes('오후')) {
    meridian = text.includes('오후') ? 'PM' : 'AM';
  }

  const match = text.match(/(\d{1,2})(?:시|:)?\s*(\d{1,2})?/);
  if (match) {
    hours = parseInt(match[1], 10);
    minutes = match[2] ? parseInt(match[2], 10) : 0;
  } else {
    return Number.MAX_SAFE_INTEGER;
  }

  if (meridian === 'PM' && hours < 12) hours += 12;
  if (meridian === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function mergeRecord(record) {
  return { ...defaultRecord, ...(record || {}) };
}

function buildActiveRosterFromRecords(recordValues) {
  const byName = new Map();
  Object.values(recordValues || {}).forEach((raw) => {
    const record = mergeRecord(raw);
    const name = String(record.student || '').trim();
    if (!name) return;

    const current = byName.get(name) || {
      name,
      school: '',
      grade: '',
      className: '',
      studentPhone: '',
      parentPhone: '',
      parentPhone2: '',
    };

    current.name = name;
    if (String(record.school || '').trim()) current.school = record.school;
    if (String(record.grade || '').trim()) current.grade = record.grade;
    if (String(record.className || '').trim()) current.className = record.className;
    if (String(record.phoneNumber || '').trim()) current.studentPhone = record.phoneNumber;
    if (String(record.parentPhoneNumber || '').trim()) current.parentPhone = record.parentPhoneNumber;
    if (String(record.parentPhoneNumber2 || '').trim()) current.parentPhone2 = record.parentPhoneNumber2;
    byName.set(name, current);
  });
  return Array.from(byName.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

// 전화번호 포맷팅 함수 (010-1234-5678 형식)
function formatPhoneNumber(phone) {
  if (!phone) return '';
  const clean = phone.replace(/-/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }
  return phone; // 포맷팅 불가능하면 원본 반환
}

// ClinicLog 컴포넌트에 subject prop 추가 (기본값: 'english')
export default function ClinicLog({ subject = 'english' }) {
  // 현재 주차 키만 사용 (주차 선택 없음)
  const currentWeekKey = getWeekKey();
  const [selectedWeek, setSelectedWeek] = useState(currentWeekKey);
  
  // 주차 변경 감지를 위한 ref
  const lastWeekKeyRef = useRef(currentWeekKey);
  
  // 주차별 기록 불러오기: Firestore 우선, 실패/미설정 시 localStorage 폴백
  const loadWeekRecords = useCallback(async (weekKey) => {
    if (isFirebaseConfigured() && db) {
      try {
        const collectionName = `clinicLogRecords_${subject}`;
        const docRef = doc(db, collectionName, weekKey);
        const docSnapshot = await getDoc(docRef);
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const records = data.records || {};
          const recordCount = Object.keys(records).length;
          console.log(`📥 [Firestore 로드] 주차: ${weekKey}, 레코드 수: ${recordCount}`);
          try {
            localStorage.setItem(`${storageKeys.records}_${subject}_${weekKey}`, JSON.stringify(records));
          } catch (e) {
            console.warn('localStorage 백업 실패:', e);
          }
          return records;
        }
      } catch (error) {
        if (error.code !== 'permission-denied') {
          console.warn(`⚠️ [Firestore 오류] 주차 ${weekKey} 기록 불러오기 실패:`, error);
        }
      }
    }

    try {
      const stored = localStorage.getItem(`${storageKeys.records}_${subject}_${weekKey}`);
      if (stored) {
        const records = JSON.parse(stored);
        const recordCount = Object.keys(records).length;
        console.log(`💾 [localStorage 폴백 로드] 주차: ${weekKey}, 레코드 수: ${recordCount}`);
        return records;
      }
    } catch (error) {
      console.warn(`⚠️ [localStorage 오류] 주차 ${weekKey} 기록 불러오기 실패:`, error);
    }

    console.log(`📭 [로드] 주차 ${weekKey} 데이터 없음`);
    return {};
  }, [db, subject]);
  
  // 주차별 기록 저장 (Firestore 우선, localStorage 백업)
  const saveWeekRecords = useCallback(async (weekKey, records) => {
    const recordCount = Object.keys(records).length;
    console.log(`💾 [저장 시작] 주차: ${weekKey}, 레코드 수: ${recordCount}`);
    
    // localStorage에 먼저 백업 (subject 포함)
    try {
      localStorage.setItem(`${storageKeys.records}_${subject}_${weekKey}`, JSON.stringify(records));
      console.log(`✅ [localStorage 저장 완료] 주차: ${weekKey}`);
    } catch (error) {
      console.warn(`⚠️ [localStorage 백업 실패]:`, error);
    }
    
    // Firestore에 저장
    if (isFirebaseConfigured() && db) {
      try {
        // 영어/수학 구분을 위해 컬렉션명에 subject 포함
        const collectionName = `clinicLogRecords_${subject}`;
        const docRef = doc(db, collectionName, weekKey);
        await setDoc(docRef, {
          records: records,
          lastUpdated: new Date().toISOString(),
        }, { merge: true });
        console.log(`✅ [Firestore 저장 완료] 주차: ${weekKey}, 레코드 수: ${recordCount}`);
      } catch (error) {
        // 권한 오류는 조용히 처리 (localStorage에 이미 백업됨)
        if (error.code !== 'permission-denied') {
          console.warn(`⚠️ [Firestore 저장 실패]:`, error);
        } else {
          console.log(`🔒 [Firestore 권한] 주차 ${weekKey} 저장 권한 없음, localStorage만 사용`);
        }
      }
    } else {
      console.log(`ℹ️ [Firebase 미설정] 주차 ${weekKey}, localStorage만 사용`);
    }
  }, [db, subject]);

  // 주차별 customEntries 저장 (삭제 시 즉시 저장용)
  const saveWeekCustoms = useCallback(async (weekKey, customs) => {
    try {
      localStorage.setItem(`${storageKeys.customs}_${subject}_${weekKey}`, JSON.stringify(customs));
    } catch (e) {
      console.warn('localStorage 백업 실패:', e);
    }
    if (isFirebaseConfigured() && db) {
      try {
        const collectionName = `clinicLogCustoms_${subject}`;
        const docRef = doc(db, collectionName, weekKey);
        await setDoc(docRef, {
          customs: customs,
          lastUpdated: new Date().toISOString(),
        }, { merge: true });
      } catch (error) {
        console.warn('Firestore 저장 실패:', error);
      }
    }
  }, [db, subject]);

  const [recordValues, setRecordValues] = useState({});
  const [loadingRecords, setLoadingRecords] = useState(true);
  
  const [customEntries, setCustomEntries] = useState([]);
  const [loadingCustoms, setLoadingCustoms] = useState(true);
  const [memo, setMemo] = useState(''); // 메모장 상태
  const [showAddStudentForm, setShowAddStudentForm] = useState(false); // 학생 추가 폼 표시 여부
  const [newStudentForm, setNewStudentForm] = useState({
    day: '',
    time: '',
    school: '',
    grade: '',
    className: '',
    student: '',
    phoneNumber: '',
    parentPhoneNumber: '',
    parentPhoneNumber2: '',
  });
  
  const [showPreview, setShowPreview] = useState(false); // 미리보기 표시 여부
  const [previewEntry, setPreviewEntry] = useState(null); // 미리보기할 학생 entry
  // 과목별 템플릿 코드 고정
  const [templateCode] = useState(
    subject === 'math'
      ? 'KA01TP260114030811110oPYh6DtRLkE' // 수학 클리닉 대장 (기존)
      : 'KA01TP2603181458587664RNF9zfYCCD' // 영어 클리닉 대장 확인
  );
  const [weekVariableName, setWeekVariableName] = useState('클리닉날짜'); // 주차정보 변수명 (템플릿: #{클리닉날짜})
  const [contentVariableName, setContentVariableName] = useState('클리닉학습'); // 클리닉내용 변수명 (템플릿: #{클리닉학습})
  const [previewSelectedWeek, setPreviewSelectedWeek] = useState(null); // 미리보기에서 선택한 주차
  const [sendHistory, setSendHistory] = useState({}); // {주차: {학생명: [{date, content, recipients}]}}
  const [showHistory, setShowHistory] = useState(false); // 전송 내역 모달 표시 여부
  const [selectedHistoryStudent, setSelectedHistoryStudent] = useState(null); // 전송 내역 볼 학생

  const syncMathRosterIntoRecords = useCallback((homeworkData, baseRecords = {}) => {
    if (subject !== 'math') return baseRecords;
    const roster = extractActiveMathClinicStudents(homeworkData);
    return syncMathClinicRecords(baseRecords, roster);
  }, [subject]);

  // 학생 수동 추가
  const handleAddStudent = useCallback(() => {
    if (!newStudentForm.student.trim()) {
      alert('학생 이름을 입력해주세요.');
      return;
    }

    const newKey = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newEntry = {
      id: newKey,
      school: newStudentForm.school.trim(),
      grade: newStudentForm.grade.trim(),
      className: newStudentForm.className.trim(),
      student: newStudentForm.student.trim(),
      type: 'repeat', // 기본값은 repeat
    };

    setCustomEntries((prev) => [...prev, newEntry]);
    setRecordValues((prev) => ({
      ...prev,
      [newKey]: {
        ...defaultRecord,
        day: newStudentForm.day,
        time: newStudentForm.time,
        school: newStudentForm.school.trim(),
        grade: newStudentForm.grade.trim(),
        className: newStudentForm.className.trim(),
        student: newStudentForm.student.trim(),
        phoneNumber: newStudentForm.phoneNumber.trim() || '',
        parentPhoneNumber: newStudentForm.parentPhoneNumber.trim() || '',
        parentPhoneNumber2: newStudentForm.parentPhoneNumber2.trim() || '',
      },
    }));

    // 폼 초기화
    setNewStudentForm({
      day: '',
      time: '',
      school: '',
      grade: '',
      className: '',
      student: '',
      phoneNumber: '',
      parentPhoneNumber: '',
      parentPhoneNumber2: '',
    });
    setShowAddStudentForm(false);
  }, [newStudentForm]);

  // 이전 주차 키 계산
  const getPreviousWeekKey = useCallback((weekKey) => {
    const match = weekKey.match(/(\d+)_week_(\d+)/);
    if (!match) return null;
    
    const year = parseInt(match[1]);
    let week = parseInt(match[2]);
    
    if (week > 1) {
      week -= 1;
    } else {
      // 작년 마지막 주
      const lastWeekOfYear = 52; // 대략적인 주차 수
      return `${year - 1}_week_${lastWeekOfYear}`;
    }
    
    return `${year}_week_${week}`;
  }, []);

  // 주차별 customEntries 불러오기: Firestore 우선, 실패/미설정 시 localStorage 폴백
  const loadWeekCustoms = useCallback(async (weekKey) => {
    if (isFirebaseConfigured() && db) {
      try {
        const collectionName = `clinicLogCustoms_${subject}`;
        const docRef = doc(db, collectionName, weekKey);
        const docSnapshot = await getDoc(docRef);
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const customs = data.customs || [];
          try {
            localStorage.setItem(`${storageKeys.customs}_${subject}_${weekKey}`, JSON.stringify(customs));
          } catch (e) {
            console.warn('localStorage 백업 실패:', e);
          }
          return customs;
        }
      } catch (error) {
        if (error.code !== 'permission-denied') {
          console.warn(`Firestore에서 주차 ${weekKey} customs 불러오기 실패:`, error);
        }
      }
    }

    try {
      const stored = localStorage.getItem(`${storageKeys.customs}_${subject}_${weekKey}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn(`주차 ${weekKey} customs 불러오기 실패:`, error);
    }

    return [];
  }, [db, subject]);

  const saveActiveRoster = useCallback(async (rows) => {
    const storageKey = `${ACTIVE_ROSTER_STORAGE_KEY}_${subject}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(rows));
    } catch (error) {
      console.warn('클리닉 활성 명단 localStorage 저장 실패:', error);
    }

    if (!isFirebaseConfigured() || !db) return;

    try {
      const collectionName = `clinicLogRoster_${subject}`;
      await setDoc(
        doc(db, collectionName, ACTIVE_ROSTER_DOC_ID),
        {
          students: rows,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.warn('클리닉 활성 명단 Firestore 저장 실패:', error);
    }
  }, [db, subject]);
  
  // 다음 주 초기화: 일요일 데이터를 다음주 월요일로 복사, 출결/담당 선생님/등원하원시간/시험확인은 지우기
  const initializeNextWeek = useCallback(async (prevWeekKey, currentWeekKey) => {
    try {
      console.log(`🔄 [복사 시작] ${prevWeekKey} → ${currentWeekKey}`);
      const prevRecords = await loadWeekRecords(prevWeekKey);
      const prevCustoms = await loadWeekCustoms(prevWeekKey);
      
      const prevRecordCount = Object.keys(prevRecords).length;
      const prevCustomCount = prevCustoms.length;
      console.log(`📊 [이전 주차 데이터] 레코드: ${prevRecordCount}개, 커스텀: ${prevCustomCount}개`);
      
      // 모든 학생 복사 (재등원/2회차 구분 없이 모두 복사)
      const allCustoms = prevCustoms; // 모든 customs 복사
      console.log(`👥 [전체 학생 복사] 전체: ${prevCustomCount}개 복사`);
      
      const newRecords = {};
      
      // 이전 주의 모든 기록 복사 (모든 학생 복사)
      // Object.keys를 사용하여 순서 보장 (삽입 순서 유지)
      const prevRecordKeys = Object.keys(prevRecords);
      prevRecordKeys.forEach((key) => {
        const prevRecord = prevRecords[key];
        
        // prevRecord를 mergeRecord로 병합하여 모든 필드 보장
        const mergedRecord = mergeRecord(prevRecord);
        
        // 요일 그대로 복사: prevRecord.day 값을 그대로 복사
        // '요일 선택', 빈 문자열, 또는 실제 요일이든 그대로 복사
        const newDay = prevRecord && prevRecord.hasOwnProperty('day') ? prevRecord.day : '';
        
        // 클리닉 시간/학년반이름/전화번호/비고는 그대로 복사
        // prevRecord에서 직접 가져와서 확실하게 복사
        newRecords[key] = {
          ...defaultRecord,
          day: newDay,
          time: prevRecord?.time ?? '',
          school: prevRecord?.school ?? '',
          grade: prevRecord?.grade ?? '',
          className: prevRecord?.className ?? '',
          student: prevRecord?.student ?? '',
          phoneNumber: prevRecord?.phoneNumber ?? '',
          parentPhoneNumber: prevRecord?.parentPhoneNumber ?? '',
          parentPhoneNumber2: prevRecord?.parentPhoneNumber2 ?? '',
          notes: prevRecord?.notes ?? '', // 비고는 유지
          // 출결/담당 선생님/등원하원시간/시험확인은 초기화
          attendance: '',
          assistant: '',
          arrival: '',
          departure: '',
          messageStatus: '',
          examStatus: '',
          // 수학 클리닉 대장 전용 필드도 초기화
          activityType: '',
          materialType: '',
          activitySets: [],
        };
      });
      
      const newRecordCount = Object.keys(newRecords).length;
      console.log(`📝 [복사된 레코드] ${newRecordCount}개 생성 완료`);
      
      // 새 주차에 기록 저장 (localStorage와 Firestore 모두)
      console.log(`💾 [저장 시작] 주차: ${currentWeekKey}`);
      await saveWeekRecords(currentWeekKey, newRecords);
      console.log(`✅ [저장 완료] 주차: ${currentWeekKey}, 레코드 수: ${newRecordCount}`);
      
      // 모든 학생 저장 (재등원/2회차 구분 없이 모두 저장)
      // localStorage에 백업 (subject 포함)
      try {
        localStorage.setItem(`${storageKeys.customs}_${subject}_${currentWeekKey}`, JSON.stringify(allCustoms));
      } catch (error) {
        console.warn('localStorage 백업 실패:', error);
      }
      
      // Firestore에 저장
      if (isFirebaseConfigured() && db) {
        try {
          // 영어/수학 구분을 위해 컬렉션명에 subject 포함
          const collectionName = `clinicLogCustoms_${subject}`;
          const docRef = doc(db, collectionName, currentWeekKey);
          await setDoc(docRef, {
            customs: allCustoms,
            lastUpdated: new Date().toISOString(),
          }, { merge: true });
          console.log(`✅ [Firestore 저장 완료] customs: ${allCustoms.length}개`);
        } catch (error) {
          console.warn('⚠️ [Firestore 저장 실패] customs:', error);
        }
      }
      
      setCustomEntries(allCustoms);
      
      // 디버깅: 요일이 빈 문자열인 기록 확인
      const emptyDayRecords = Object.entries(newRecords).filter(([key, record]) => !record.day || record.day === '');
      console.log('✅ [다음 주 초기화 완료]:', {
        이전주차: prevWeekKey,
        현재주차: currentWeekKey,
        복사된기록수: newRecordCount,
        복사된전체학생수: allCustoms.length,
        요일선택상태인학생수: emptyDayRecords.length,
        요일선택상태인학생들: emptyDayRecords.map(([key, record]) => record.student).slice(0, 5),
      });
      
      // 저장된 데이터를 직접 반환 (불필요한 Firestore 요청 방지)
      return { records: newRecords, customs: allCustoms };
    } catch (error) {
      console.error('❌ [다음 주 초기화 실패]:', error);
      throw error; // 에러를 다시 throw하여 호출자가 처리할 수 있도록
    }
  }, [loadWeekRecords, loadWeekCustoms, saveWeekRecords, db, subject]);

  // 주차 변경 감지 및 데이터 초기화 (컴포넌트 마운트 시)
  useEffect(() => {
    const loadData = async () => {
      try {
        const currentWeekKey = getWeekKey();
        console.log(`🔍 [데이터 로드 시작] 현재 주차: ${currentWeekKey}, 과목: ${subject}`);
        setLoadingRecords(true);
        setLoadingCustoms(true);
        
        // 현재 주차 데이터 로드
        const currentWeekData = await loadWeekRecords(currentWeekKey);
        const hasCurrentWeekData = Object.keys(currentWeekData).length > 0;
        console.log(`📊 [현재 주차 데이터 확인] 주차: ${currentWeekKey}, 데이터 존재: ${hasCurrentWeekData}, 레코드 수: ${Object.keys(currentWeekData).length}`);
        
        if (!hasCurrentWeekData) {
          // 현재 주차에 데이터가 없으면, 이전 주차에서 복사
          const prevWeekKey = getPreviousWeekKey(currentWeekKey);
          console.log(`🔙 [이전 주차 확인] 이전 주차: ${prevWeekKey}`);
          
          if (prevWeekKey) {
            const prevWeekData = await loadWeekRecords(prevWeekKey);
            const hasPrevWeekData = Object.keys(prevWeekData).length > 0;
            console.log(`📊 [이전 주차 데이터 확인] 주차: ${prevWeekKey}, 데이터 존재: ${hasPrevWeekData}, 레코드 수: ${Object.keys(prevWeekData).length}`);
            
            if (hasPrevWeekData) {
              // 이전 주차 데이터가 있으면 복사
              console.log(`📋 [데이터 복사 시작] ${prevWeekKey} → ${currentWeekKey}`);
              const result = await initializeNextWeek(prevWeekKey, currentWeekKey);
              
              // 저장된 데이터를 직접 사용 (불필요한 Firestore 요청 방지)
              if (result && result.records) {
                const newRecordsCount = Object.keys(result.records).length;
                console.log(`✅ [데이터 복사 완료] 복사된 레코드 수: ${newRecordsCount}`);
                let nextRecords = result.records;
                if (subject === 'math' && isFirebaseConfigured() && db) {
                  const homeworkSnap = await getDoc(doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID));
                  nextRecords = syncMathRosterIntoRecords(homeworkSnap.exists() ? homeworkSnap.data() : {}, nextRecords);
                }
                setRecordValues(nextRecords);
                setCustomEntries(result.customs || []);
              } else {
                // 결과가 없으면 localStorage에서 로드 (Firestore 요청 최소화)
                console.log(`ℹ️ [정보] 저장된 데이터를 localStorage에서 로드합니다.`);
                let newRecords = await loadWeekRecords(currentWeekKey);
                const newCustoms = await loadWeekCustoms(currentWeekKey);
                if (subject === 'math' && isFirebaseConfigured() && db) {
                  const homeworkSnap = await getDoc(doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID));
                  newRecords = syncMathRosterIntoRecords(homeworkSnap.exists() ? homeworkSnap.data() : {}, newRecords);
                }
                setRecordValues(newRecords);
                setCustomEntries(newCustoms);
              }
              
              setLoadingRecords(false);
              setLoadingCustoms(false);
              lastWeekKeyRef.current = currentWeekKey;
              setSelectedWeek(currentWeekKey);
              return; // 복사 완료
            } else {
              console.log(`ℹ️ [정보] 이전 주차(${prevWeekKey})에도 데이터가 없습니다.`);
            }
          } else {
            console.log(`ℹ️ [정보] 이전 주차 키를 계산할 수 없습니다.`);
          }
          
          // 이전 주차에도 데이터가 없으면 빈 상태로 초기화
          let emptyRecords = {};
          if (subject === 'math' && isFirebaseConfigured() && db) {
            const homeworkSnap = await getDoc(doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID));
            emptyRecords = syncMathRosterIntoRecords(homeworkSnap.exists() ? homeworkSnap.data() : {}, {});
          }
          setRecordValues(emptyRecords);
          setCustomEntries([]);
        } else {
          // 현재 주차에 데이터가 있으면 그대로 로드
          console.log(`✅ [현재 주차 데이터 로드] 레코드 수: ${Object.keys(currentWeekData).length}`);
          let nextRecords = currentWeekData;
          if (subject === 'math' && isFirebaseConfigured() && db) {
            const homeworkSnap = await getDoc(doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID));
            nextRecords = syncMathRosterIntoRecords(homeworkSnap.exists() ? homeworkSnap.data() : {}, nextRecords);
          }
          setRecordValues(nextRecords);
          const newCustoms = await loadWeekCustoms(currentWeekKey);
          setCustomEntries(newCustoms);
        }
        
        setLoadingRecords(false);
        setLoadingCustoms(false);
        // 주차 키 업데이트
        lastWeekKeyRef.current = currentWeekKey;
        setSelectedWeek(currentWeekKey);
      } catch (error) {
        console.error('❌ [데이터 로드 중 오류]:', error);
        // 에러 발생 시에도 로딩 상태 해제
        setLoadingRecords(false);
        setLoadingCustoms(false);
        // 빈 상태로 초기화
        setRecordValues({});
        setCustomEntries([]);
      }
    };
    
    loadData();
    
    // 전송 내역도 Firestore에서 로드
    const loadHistory = async () => {
      try {
        const currentWeekKey = getWeekKey();
        
        // Firestore에서 먼저 시도
        if (isFirebaseConfigured() && db) {
          try {
            // 영어/수학 구분을 위해 컬렉션명에 subject 포함
            const collectionName = `clinicKakaoHistory_${subject}`;
            const docRef = doc(db, collectionName, currentWeekKey);
            const docSnapshot = await getDoc(docRef);
            if (docSnapshot.exists()) {
              const data = docSnapshot.data();
              const history = data.history || {};
              setSendHistory({ [currentWeekKey]: history });
              
              // localStorage에도 백업
              try {
                localStorage.setItem(`clinicKakaoHistory_${subject}_${currentWeekKey}`, JSON.stringify(history));
              } catch (e) {
                console.warn('localStorage 백업 실패:', e);
              }
              return;
            }
      } catch (error) {
        // 권한 오류는 조용히 처리 (localStorage로 폴백)
        if (error.code !== 'permission-denied') {
          console.warn('Firestore에서 전송 내역 불러오기 실패:', error);
        }
      }
        }
        
        // Firestore 실패 시 localStorage에서 로드
        try {
          const stored = localStorage.getItem(`clinicKakaoHistory_${subject}_${currentWeekKey}`);
          if (stored) {
            const history = JSON.parse(stored);
            setSendHistory({ [currentWeekKey]: history });
          }
        } catch (error) {
          console.warn('localStorage에서 전송 내역 불러오기 실패:', error);
        }
      } catch (error) {
        console.error('전송 내역 로드 중 오류:', error);
      }
    };
    
    loadHistory();
  }, [loadWeekRecords, loadWeekCustoms, getPreviousWeekKey, initializeNextWeek, db, subject, syncMathRosterIntoRecords]); // 컴포넌트 마운트 시 한 번만 실행

  useEffect(() => {
    if (subject !== 'math') return undefined;
    if (!isFirebaseConfigured() || !db) return undefined;
    if (selectedWeek !== getWeekKey()) return undefined;

    const homeworkRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
    const unsubscribe = onSnapshot(
      homeworkRef,
      (snapshot) => {
        setRecordValues((prev) => {
          const synced = syncMathRosterIntoRecords(snapshot.exists() ? snapshot.data() : {}, prev);
          if (!recordMapsEqual(prev, synced)) {
            console.log(`🔄 [수학 클리닉 명단 동기화] ${Object.keys(synced).length}명 반영`);
            return synced;
          }
          return prev;
        });
      },
      (error) => {
        console.warn('수학 클리닉 명단 실시간 동기화 실패:', error);
      }
    );

    return () => unsubscribe();
  }, [db, selectedWeek, subject, syncMathRosterIntoRecords]);

  // 주차별 기록 저장 (debounce)
  const saveTimeoutRef = useRef(null);
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveWeekRecords(selectedWeek, recordValues);
    }, 1000); // 1초 debounce
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [recordValues, selectedWeek, saveWeekRecords]);

  // customEntries 주차별 저장 (debounce)
  const saveCustomsTimeoutRef = useRef(null);
  useEffect(() => {
    if (saveCustomsTimeoutRef.current) {
      clearTimeout(saveCustomsTimeoutRef.current);
    }
    
    saveCustomsTimeoutRef.current = setTimeout(async () => {
      // localStorage에 백업 (subject 포함)
      try {
        localStorage.setItem(`${storageKeys.customs}_${subject}_${selectedWeek}`, JSON.stringify(customEntries));
      } catch (error) {
        console.warn('localStorage 백업 실패:', error);
      }
      
      // Firestore에 저장
      if (isFirebaseConfigured() && db) {
        try {
          // 영어/수학 구분을 위해 컬렉션명에 subject 포함
          const collectionName = `clinicLogCustoms_${subject}`;
          const docRef = doc(db, collectionName, selectedWeek);
          await setDoc(docRef, {
            customs: customEntries,
            lastUpdated: new Date().toISOString(),
          }, { merge: true });
        } catch (error) {
          console.warn('Firestore 저장 실패:', error);
        }
      }
    }, 1000); // 1초 debounce
    
    return () => {
      if (saveCustomsTimeoutRef.current) {
        clearTimeout(saveCustomsTimeoutRef.current);
      }
    };
  }, [customEntries, selectedWeek, db]);

  const currentWeekRosterSaveRef = useRef(null);
  useEffect(() => {
    if (currentWeekRosterSaveRef.current) {
      clearTimeout(currentWeekRosterSaveRef.current);
    }

    if (loadingRecords || loadingCustoms) return;
    if (selectedWeek !== getWeekKey()) return;

    currentWeekRosterSaveRef.current = setTimeout(() => {
      const activeRoster = buildActiveRosterFromRecords(recordValues);
      saveActiveRoster(activeRoster);
    }, 1000);

    return () => {
      if (currentWeekRosterSaveRef.current) {
        clearTimeout(currentWeekRosterSaveRef.current);
      }
    };
  }, [recordValues, selectedWeek, loadingRecords, loadingCustoms, saveActiveRoster]);

  const combinedEntries = useMemo(() => {
    // recordValues에서 학생 정보 추출
    const entries = Object.keys(recordValues).map((key) => {
      const record = recordValues[key];
      return {
        key,
        source: key.startsWith('manual-') ? 'manual' : 'record',
        school: record.school || '',
        grade: record.grade || '',
        className: record.className || '',
        student: record.student || '',
        phoneNumber: record.phoneNumber || null,
        parentPhoneNumber: record.parentPhoneNumber || null,
        parentPhoneNumber2: record.parentPhoneNumber2 || null,
        type: record.type || 'repeat', // 'repeat' or 'return'
      };
    });

    return entries.sort((a, b) => {
      const recordA = mergeRecord(recordValues[a.key]);
      const recordB = mergeRecord(recordValues[b.key]);

      const dayDiff = getDayIndex(recordA.day) - getDayIndex(recordB.day);
      if (dayDiff !== 0) return dayDiff;

      return parseTimeToMinutes(recordA.time) - parseTimeToMinutes(recordB.time);
    });
  }, [recordValues]);

  const handleRecordChange = (key, field, value, entry = null) => {
    setRecordValues((prev) => {
      const next = { ...prev };
      const currentRecord = mergeRecord(prev[key]);
      
      // 전화번호 필드는 직접 입력한 값을 우선 사용
      const phoneNumber = field === 'phoneNumber' 
        ? value 
        : (entry?.phoneNumber || currentRecord.phoneNumber || '');
      const parentPhoneNumber = field === 'parentPhoneNumber' 
        ? value 
        : (entry?.parentPhoneNumber || currentRecord.parentPhoneNumber || '');
      const parentPhoneNumber2 = field === 'parentPhoneNumber2' 
        ? value 
        : (entry?.parentPhoneNumber2 || currentRecord.parentPhoneNumber2 || '');
      
      next[key] = {
        ...currentRecord,
        [field]: value,
        school: entry?.school ?? currentRecord.school,
        grade: entry?.grade ?? currentRecord.grade,
        className: field === 'className' ? value : (entry?.className ?? currentRecord.className),
        student: entry?.student ?? currentRecord.student,
        phoneNumber: phoneNumber,
        parentPhoneNumber: parentPhoneNumber,
        parentPhoneNumber2: parentPhoneNumber2,
      };
      return next;
    });
  };

  // 학생 복사 기능
  const handleCopyStudent = (key) => {
    const record = mergeRecord(recordValues[key]);
    
    // 새로운 키 생성
    const newKey = `copy-${Date.now()}-${key}-${Math.random().toString(36).substr(2, 9)}`;
    
    // recordValues에 복사된 학생 추가 (customEntries에는 추가하지 않음)
    setRecordValues((prev) => ({
      ...prev,
      [newKey]: {
        ...record,
        // 출결/담당 선생님/등원하원시간/시험확인은 초기화
        attendance: '',
        assistant: '',
        arrival: '',
        departure: '',
        messageStatus: '',
        examStatus: '',
        // 수학 클리닉 대장 전용 필드도 초기화
        activityType: '',
        materialType: '',
        activitySets: [],
      },
    }));
  };

  // 학생 삭제 기능 (삭제 즉시 localStorage 동기 저장 + Firestore 비동기 저장 → 재진입 시 안 나타남)
  const handleDeleteStudent = (key) => {
    if (!window.confirm('이 학생을 삭제하시겠습니까?')) return;

    const nextRecords = { ...recordValues };
    delete nextRecords[key];
    const nextCustoms = customEntries.filter((entry) => entry.id !== key);

    // 즉시 localStorage에 동기 저장 (메인 갔다 와도 이 데이터로 로드됨)
    try {
      localStorage.setItem(`${storageKeys.records}_${subject}_${selectedWeek}`, JSON.stringify(nextRecords));
      localStorage.setItem(`${storageKeys.customs}_${subject}_${selectedWeek}`, JSON.stringify(nextCustoms));
    } catch (e) {
      console.warn('삭제 후 localStorage 저장 실패:', e);
    }

    setRecordValues(nextRecords);
    setCustomEntries(nextCustoms);

    saveWeekRecords(selectedWeek, nextRecords).catch((err) => console.warn('삭제 후 기록 저장 실패:', err));
    saveWeekCustoms(selectedWeek, nextCustoms).catch((err) => console.warn('삭제 후 customs 저장 실패:', err));
  };

  // 수학 클리닉 대장: 과목/교재/시험확인/비고 세트 추가
  const handleAddActivitySet = (key) => {
    setRecordValues((prev) => {
      const next = { ...prev };
      const currentRecord = mergeRecord(prev[key]);
      const currentSets = currentRecord.activitySets || [];
      
      // 현재 입력된 값들을 새 세트로 추가
      const newSet = {
        activityType: currentRecord.activityType || '',
        materialType: currentRecord.materialType || '',
        examStatus: currentRecord.examStatus || '',
        notes: currentRecord.notes || '',
      };
      
      next[key] = {
        ...currentRecord,
        activitySets: [...currentSets, newSet],
        // 기존 값들은 초기화 (다음 입력을 위해)
        activityType: '',
        materialType: '',
        examStatus: '',
        notes: '',
      };
      return next;
    });
  };

  // 수학 클리닉 대장: 특정 세트 삭제
  const handleDeleteActivitySet = (key, index) => {
    setRecordValues((prev) => {
      const next = { ...prev };
      const currentRecord = mergeRecord(prev[key]);
      const currentSets = currentRecord.activitySets || [];
      const newSets = currentSets.filter((_, i) => i !== index);
      
      next[key] = {
        ...currentRecord,
        activitySets: newSets,
      };
      return next;
    });
  };

  // 수학 클리닉 대장: 특정 세트의 필드 변경
  const handleActivitySetChange = (key, index, field, value) => {
    setRecordValues((prev) => {
      const next = { ...prev };
      const currentRecord = mergeRecord(prev[key]);
      const currentSets = currentRecord.activitySets || [];
      const newSets = [...currentSets];
      
      if (newSets[index]) {
        newSets[index] = {
          ...newSets[index],
          [field]: value,
        };
      }
      
      next[key] = {
        ...currentRecord,
        activitySets: newSets,
      };
      return next;
    });
  };


  const handleResetRecord = (key) => {
    setRecordValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleRemoveManual = (id) => {
    if (!window.confirm('이 학생을 목록에서 제거할까요?')) return;
    setCustomEntries((prev) => prev.filter((entry) => entry.id !== id));
    handleResetRecord(id);
  };

  // 클리닉 대장 내용 포맷팅 함수
  const formatClinicContent = useCallback(() => {
    const weekOptions = getWeekOptions();
    const currentWeekOption = weekOptions.find(opt => opt.key === selectedWeek);
    const weekLabel = currentWeekOption ? currentWeekOption.label : selectedWeek;

    let content = '';

    if (combinedEntries.length === 0) {
      content += '등록된 학생이 없습니다.\n';
    } else {
      // 요일별로 그룹화
      const entriesByDay = {};
      combinedEntries.forEach(entry => {
        const record = mergeRecord(recordValues[entry.key]);
        const day = record.day || '미지정';
        if (!entriesByDay[day]) {
          entriesByDay[day] = [];
        }
        entriesByDay[day].push({ entry, record });
      });

      // 요일 순서대로 정렬
      const sortedDays = Object.keys(entriesByDay).sort((a, b) => {
        const indexA = getDayIndex(a);
        const indexB = getDayIndex(b);
        return indexA - indexB;
      });

      sortedDays.forEach(day => {
        if (day !== '미지정') {
          content += `\n📅 ${day}\n`;
          content += '━━━━━━━━━━━━━━━━━━━━\n';
        }

        const dayEntries = entriesByDay[day];
        // 시간 순으로 정렬
        dayEntries.sort((a, b) => {
          return parseTimeToMinutes(a.record.time) - parseTimeToMinutes(b.record.time);
        });

        dayEntries.forEach(({ entry, record }) => {
          // 학교 약자
          const schoolAbbr = entry.school === '과천고등학교' ? '천' : 
                            entry.school === '과천중앙고등학교' ? '앙' : 
                            entry.school || '';

          // 기본 정보
          content += `\n👤 ${entry.student}`;
          if (entry.grade) {
            content += ` (${entry.grade}${schoolAbbr ? schoolAbbr : ''})`;
          }
          if (entry.className) {
            content += ` - ${entry.className}`;
          }
          content += '\n';

          // 시간 정보
          if (record.time) {
            content += `⏰ 시간: ${record.time}\n`;
          }

          // 출결
          if (record.attendance) {
            content += `✓ 출결: ${record.attendance}\n`;
          }

          // 담당 선생님
          if (record.assistant) {
            content += `👨‍🏫 담당 선생님: ${record.assistant}\n`;
          }

          // 등원/하원 시간
          if (record.arrival || record.departure) {
            content += `🚪 등원: ${record.arrival || '-'} / 하원: ${record.departure || '-'}\n`;
          }

          // 문자 완료
          if (record.messageStatus) {
            content += `📱 문자 완료: ${record.messageStatus}\n`;
          }

          // 시험 확인
          if (record.examStatus) {
            content += `✅ 시험 확인: ${record.examStatus}\n`;
          }

          // 비고
          if (record.notes) {
            content += `📝 비고: ${record.notes}\n`;
          }

          content += '\n';
        });
      });
    }

    return { weekLabel, content };
  }, [combinedEntries, recordValues, selectedWeek]);

  // 특정 학생의 클리닉 내용만 포맷팅
  const formatClinicContentForStudent = useCallback((targetEntry, weekKey = null) => {
    const weekOptions = getWeekOptions();
    const weekToUse = weekKey || selectedWeek;
    const currentWeekOption = weekOptions.find(opt => opt.key === weekToUse);
    const weekLabel = currentWeekOption ? currentWeekOption.label : weekToUse;

    if (!targetEntry) {
      return { weekLabel, content: '학생 정보가 없습니다.' };
    }

    const record = mergeRecord(recordValues[targetEntry.key]);
    const day = record.day || '미지정';
    
    // 학교 약자
    const schoolAbbr = targetEntry.school === '과천고등학교' ? '천' : 
                        targetEntry.school === '과천중앙고등학교' ? '앙' : 
                        targetEntry.school || '';

    let content = '';
    
    if (day !== '미지정') {
      content += `📅 ${day}\n`;
      content += '━━━━━━━━━━━━━━━━━━━━\n';
    }

    // 기본 정보
    content += `\n👤 ${targetEntry.student}`;
    if (targetEntry.grade) {
      content += ` (${targetEntry.grade}${schoolAbbr ? schoolAbbr : ''})`;
    }
    if (targetEntry.className) {
      content += ` - ${targetEntry.className}`;
    }
    content += '\n';

    // 시간 정보
    if (record.time) {
      content += `⏰ 시간: ${record.time}\n`;
    }

    // 출결
    if (record.attendance) {
      content += `✓ 출결: ${record.attendance}\n`;
    }

    // 담당 선생님
    if (record.assistant) {
      content += `👨‍🏫 담당 선생님: ${record.assistant}\n`;
    }

    // 등원/하원 시간
    if (record.arrival || record.departure) {
      content += `🚪 등원: ${record.arrival || '-'} / 하원: ${record.departure || '-'}\n`;
    }

    // 문자 완료
    if (record.messageStatus) {
      content += `📱 문자 완료: ${record.messageStatus}\n`;
    }

    // 수학 클리닉 대장: 과목/교재/시험확인/비고를 한 줄에 표시
    if (subject === 'math') {
      const activityParts = [];
      if (record.activityType) activityParts.push(`과목: ${record.activityType}`);
      if (record.materialType) activityParts.push(`교재: ${record.materialType}`);
      if (record.examStatus) activityParts.push(`시험: ${record.examStatus}`);
      if (record.notes) activityParts.push(`비고: ${record.notes}`);
      
      if (activityParts.length > 0) {
        content += `📚 ${activityParts.join(' / ')}\n`;
      }
      
      // 저장된 세트들도 표시
      if (record.activitySets && record.activitySets.length > 0) {
        record.activitySets.forEach((set, idx) => {
          const setParts = [];
          if (set.activityType) setParts.push(`과목: ${set.activityType}`);
          if (set.materialType) setParts.push(`교재: ${set.materialType}`);
          if (set.examStatus) setParts.push(`시험: ${set.examStatus}`);
          if (set.notes) setParts.push(`비고: ${set.notes}`);
          
          if (setParts.length > 0) {
            content += `📚 ${setParts.join(' / ')}\n`;
          }
        });
      }
    } else {
      // 영어 클리닉 대장: 시험 확인만 표시, 비고는 제외
      if (record.examStatus) {
        content += `✅ 시험 확인: ${record.examStatus}\n`;
      }
    }

    return { weekLabel, content };
  }, [recordValues, selectedWeek, subject]);

  // 카카오톡 미리보기 열기
  const handleOpenPreview = (entry) => {
    if (!entry) {
      alert('학생 정보가 없습니다.');
      return;
    }

    const record = mergeRecord(recordValues[entry.key]);
    const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
    const studentPhone = record.phoneNumber || entry.phoneNumber;

    if (!studentPhone || !phoneRegex.test(studentPhone.replace(/-/g, ''))) {
      alert('학생 전화번호가 올바르지 않습니다. 전화번호를 입력해주세요.');
      return;
    }

    // 템플릿 코드는 고정값 사용 (클리닉 대장 확인)
    const savedWeekVariable = localStorage.getItem('clinicWeekVariableName') || '클리닉날짜';
    const savedContentVariable = localStorage.getItem('clinicContentVariableName') || '클리닉학습';
    setWeekVariableName(savedWeekVariable);
    setContentVariableName(savedContentVariable);
    setPreviewSelectedWeek(selectedWeek); // 현재 주차로 초기화
    
    // record에서 최신 전화번호 정보를 가진 entry 생성
    const updatedEntry = {
      ...entry,
      phoneNumber: record.phoneNumber || entry.phoneNumber,
      parentPhoneNumber: record.parentPhoneNumber || entry.parentPhoneNumber,
      parentPhoneNumber2: record.parentPhoneNumber2 || entry.parentPhoneNumber2,
    };
    
    setPreviewEntry(updatedEntry);
    setShowPreview(true);
  };

  // 카카오톡 전송 (개별 학생)
  const handleKakaoSend = async (entry, template) => {
    if (!entry) {
      alert('학생 정보가 없습니다.');
      return;
    }

    const record = mergeRecord(recordValues[entry.key]);
    const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
    const studentPhone = record.phoneNumber || entry.phoneNumber;
    const parentPhone = record.parentPhoneNumber || entry.parentPhoneNumber;

    if (!studentPhone || !phoneRegex.test(studentPhone.replace(/-/g, ''))) {
      alert('학생 전화번호가 올바르지 않습니다. 전화번호를 입력해주세요.');
      return;
    }

    // 템플릿 코드는 고정값 사용 (클리닉 대장 확인)
    const trimmedTemplateCode = template || templateCode.trim();

    try {
      // record에서 최신 전화번호 정보를 가진 entry 생성
      const updatedEntry = {
        ...entry,
        phoneNumber: record.phoneNumber || entry.phoneNumber,
        parentPhoneNumber: record.parentPhoneNumber || entry.parentPhoneNumber,
        parentPhoneNumber2: record.parentPhoneNumber2 || entry.parentPhoneNumber2,
      };
      
      // 해당 학생의 클리닉 내용만 생성 (미리보기에서 선택한 주차 사용)
      const weekToUse = previewSelectedWeek || selectedWeek;
      const { weekLabel, content } = formatClinicContentForStudent(updatedEntry, weekToUse);
      
      // 디버깅: 전송할 내용 확인
      console.log('📤 카카오톡 전송 데이터:', {
        weekLabel,
        content,
        contentLength: content?.length || 0,
        student: entry.student,
      });
      
      // content가 비어있는지 확인
      if (!content || content.trim().length === 0) {
        alert('클리닉 내용이 비어있습니다. 내용을 확인해주세요.');
        return;
      }
      
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      const sendTime = new Date().toISOString();
      const historyEntry = {
        date: sendTime,
        content: content,
        weekLabel: weekLabel,
        recipients: [],
      };

      // 변수 객체 생성 (사용자가 입력한 변수명 사용)
      // localStorage에서 변수명 가져오기 (미리보기 모달에서 설정한 값)
      const savedWeekVar = localStorage.getItem('clinicWeekVariableName') || weekVariableName.trim() || '클리닉날짜';
      const savedContentVar = localStorage.getItem('clinicContentVariableName') || contentVariableName.trim() || '클리닉학습';
      const variables = {
        학생명: entry.student || '',
        반: entry.className || '',
        학년: entry.grade || '',
        [savedWeekVar]: weekLabel || '',
        [savedContentVar]: content || '',
      };
      
      console.log('📤 전송할 variables:', variables);

      // 학생 전화번호로 발송
      try {
        const cleanedStudentPhone = studentPhone.replace(/-/g, '');
        const requestBody = {
          phoneNumber: cleanedStudentPhone,
          templateCode: trimmedTemplateCode.trim(),
          variables: variables,
        };
        
        console.log('📤 API 요청 본문:', JSON.stringify(requestBody, null, 2));
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const result = await response.json();

        if (result.success) {
          historyEntry.recipients.push({
            type: '학생',
            phone: studentPhone,
            status: '성공',
          });
          // 문자완료 필드 업데이트
          handleRecordChange(entry.key, 'messageStatus', '카톡 발신 완료', entry);
          console.log(`✅ ${entry.student} 학생에게 카카오톡 발송 성공`);
        } else {
          throw new Error(result.error || '알 수 없는 오류');
        }
      } catch (error) {
        console.error(`${entry.student} 학생 카카오톡 전송 실패:`, error);
        historyEntry.recipients.push({
          type: '학생',
          phone: studentPhone,
          status: `실패: ${error.message}`,
        });
        alert(`❌ ${entry.student} 학생에게 카카오톡 발송 실패: ${error.message}`);
        return;
      }

      // 학부모 전화번호가 있으면 학부모에게도 발송
      if (parentPhone && phoneRegex.test(parentPhone.replace(/-/g, ''))) {
        try {
          const cleanedParentPhone = parentPhone.replace(/-/g, '');
          const requestBody = {
            phoneNumber: cleanedParentPhone,
            templateCode: trimmedTemplateCode.trim(),
            variables: variables,
          };
          
          console.log('📤 학부모 API 요청 본문:', JSON.stringify(requestBody, null, 2));
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          const result = await response.json();

          if (result.success) {
            historyEntry.recipients.push({
              type: '학부모',
              phone: parentPhone,
              status: '성공',
            });
            console.log(`✅ ${entry.student} 학부모에게 카카오톡 발송 성공`);
          } else {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${entry.student} 학부모 카카오톡 전송 실패:`, error);
          historyEntry.recipients.push({
            type: '학부모',
            phone: parentPhone,
            status: `실패: ${error.message}`,
          });
        }
      }

      // 전송 내역 저장
      setSendHistory(prev => {
        const weekHistory = prev[selectedWeek] || {};
        const studentHistory = weekHistory[entry.student] || [];
        const updatedWeekHistory = {
          ...weekHistory,
          [entry.student]: [...studentHistory, historyEntry],
        };
        
        const updated = {
          ...prev,
          [selectedWeek]: updatedWeekHistory,
        };
        
        // localStorage에 백업
        try {
          localStorage.setItem(`clinicKakaoHistory_${subject}_${selectedWeek}`, JSON.stringify(updatedWeekHistory));
        } catch (error) {
          console.error('localStorage 백업 실패:', error);
        }
        
        // Firestore에 저장 (비동기로 처리, await 없이)
        if (isFirebaseConfigured() && db) {
          // 영어/수학 구분을 위해 컬렉션명에 subject 포함
          const collectionName = `clinicKakaoHistory_${subject}`;
          setDoc(doc(db, collectionName, selectedWeek), {
            history: updatedWeekHistory,
            lastUpdated: new Date().toISOString(),
          }, { merge: true }).catch(error => {
            console.warn('Firestore 저장 실패:', error);
          });
        }
        
        return updated;
      });

      alert(`✅ ${entry.student} 학생에게 카카오톡 발송 완료!`);
      setShowPreview(false);
    } catch (error) {
      console.error('카카오톡 발송 오류:', error);
      alert(`카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  // 학생 이름 클릭 시 전송 내역 보기
  const handleStudentNameClick = (studentName) => {
    setSelectedHistoryStudent(studentName);
    setShowHistory(true);
  };

  // 전송 내역 가져오기
  const getStudentHistory = useCallback((studentName) => {
    const weekHistory = sendHistory[selectedWeek] || {};
    return weekHistory[studentName] || [];
  }, [sendHistory, selectedWeek]);

  // 주차 변경 핸들러
  const handleWeekChange = useCallback(async (newWeekKey) => {
    try {
      setLoadingRecords(true);
      setLoadingCustoms(true);
      
      // 선택한 주차의 데이터 로드
      const weekRecords = await loadWeekRecords(newWeekKey);
      const weekCustoms = await loadWeekCustoms(newWeekKey);
      
      // 데이터가 없으면 이전 주차에서 복사
      const hasData = Object.keys(weekRecords).length > 0;
      if (!hasData) {
        const prevWeekKey = getPreviousWeekKey(newWeekKey);
        if (prevWeekKey) {
          const prevWeekData = await loadWeekRecords(prevWeekKey);
          if (Object.keys(prevWeekData).length > 0) {
            // 이전 주차 데이터가 있으면 복사
            const result = await initializeNextWeek(prevWeekKey, newWeekKey);
            
            // 저장된 데이터를 직접 사용 (불필요한 Firestore 요청 방지)
            if (result && result.records) {
              setRecordValues(result.records);
              setCustomEntries(result.customs || []);
            } else {
              // 결과가 없으면 localStorage에서 로드 (Firestore 요청 최소화)
              const newRecords = await loadWeekRecords(newWeekKey);
              const newCustoms = await loadWeekCustoms(newWeekKey);
              setRecordValues(newRecords);
              setCustomEntries(newCustoms);
            }
            
            setLoadingRecords(false);
            setLoadingCustoms(false);
            lastWeekKeyRef.current = newWeekKey;
            setSelectedWeek(newWeekKey);
            return;
          }
        }
        
        // 이전 주차에도 데이터가 없으면 빈 상태로 초기화
        setRecordValues({});
        setCustomEntries([]);
      } else {
        // 데이터가 있으면 그대로 로드
        setRecordValues(weekRecords);
        setCustomEntries(weekCustoms);
      }
      
      // 주차 키 업데이트
      lastWeekKeyRef.current = newWeekKey;
      setSelectedWeek(newWeekKey);
      
      setLoadingRecords(false);
      setLoadingCustoms(false);
    } catch (error) {
      console.error('주차 변경 중 오류:', error);
      setLoadingRecords(false);
      setLoadingCustoms(false);
    }
  }, [loadWeekRecords, loadWeekCustoms, getPreviousWeekKey, initializeNextWeek]);

  // 현재 주차의 날짜 범위 계산
  const weekDateRange = useMemo(() => {
    return getWeekDateRange(selectedWeek);
  }, [selectedWeek]);

  // 로딩 중일 때 표시
  if (loadingRecords || loadingCustoms) {
    return (
      <div className="clinic-log-page">
        <div className="clinic-log-container" style={{ textAlign: 'center', padding: '50px' }}>
          <div style={{ fontSize: '1.5rem', color: '#0ea5e9' }}>⏳ 데이터를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="clinic-log-page">
      <div className="clinic-log-container">
        {/* 주차 선택 및 날짜 표시 */}
        <div style={{
          marginBottom: '20px',
          padding: '15px 20px',
          backgroundColor: '#f0f9ff',
          border: '2px solid #0ea5e9',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontWeight: '600', fontSize: '1rem', color: '#0c4a6e' }}>
              주차 선택:
            </label>
            <select
              value={selectedWeek}
              onChange={(e) => handleWeekChange(e.target.value)}
              style={{
                padding: '8px 15px',
                border: '2px solid #0ea5e9',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                backgroundColor: '#fff',
                cursor: 'pointer',
                minWidth: '250px'
              }}
            >
              {getWeekOptions().map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {weekDateRange && (
            <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#0c4a6e' }}>
              📅 {formatDate(weekDateRange.monday)} ~ {formatDate(weekDateRange.sunday)}
            </div>
          )}
        </div>
        <section className="clinic-log-section">
          <div className="clinic-log-header">
            <div>
              <h2>🗂️ 클리닉 대장</h2>
              <p className="section-description">
                주차를 선택하여 해당 주차의 기록을 확인하거나 수정할 수 있습니다. 다음 주로 이동하면 일요일 데이터가 월요일로 복사되고, 출결/담당 선생님/등원하원시간/시험확인은 초기화됩니다.
              </p>
            </div>
          </div>

          <>
            {/* 주차 선택 드롭다운 */}
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontWeight: '600', fontSize: '1rem' }}>
                주차 선택:
              </label>
              <select
                value={selectedWeek}
                onChange={(e) => handleWeekChange(e.target.value)}
                style={{
                  padding: '8px 15px',
                  border: '2px solid #0ea5e9',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  minWidth: '250px'
                }}
              >
                {getWeekOptions().map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              {weekDateRange && (
                <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                  ({formatDate(weekDateRange.monday)} ~ {formatDate(weekDateRange.sunday)})
                </span>
              )}
            </div>

            <div className="clinic-log-form" style={{ marginTop: '20px' }}>
              <h3>📝 메모장</h3>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모를 입력하세요..."
                style={{
                  width: '100%',
                  minHeight: '150px',
                  padding: '12px',
                  fontSize: '1rem',
                  border: '2px solid #0ea5e9',
                  borderRadius: '6px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </>
        </section>

        <section className="clinic-log-section">
          <h2>📋 요일 / 시간 순 목록</h2>
          
          {/* 학생 추가 섹션 (첫 번째 학생 위) */}
          <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '2px solid #e0e0e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>➕ 학생 추가</h3>
              <button
                type="button"
                onClick={() => setShowAddStudentForm(!showAddStudentForm)}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.9rem',
                  backgroundColor: showAddStudentForm ? '#ef4444' : '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                {showAddStudentForm ? '취소' : '학생 추가'}
              </button>
            </div>

            {showAddStudentForm && (
              <form onSubmit={(e) => { e.preventDefault(); handleAddStudent(); }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginTop: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      요일
                    </label>
                    <select
                      value={newStudentForm.day}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, day: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    >
                      <option value="">요일 선택</option>
                      {dayOrder.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      시간
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.time}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, time: e.target.value }))}
                      placeholder="예) 17시"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      학교
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.school}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, school: e.target.value }))}
                      placeholder="예) 과천중앙고등학교"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      학년
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.grade}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, grade: e.target.value }))}
                      placeholder="예) 2학년"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      반
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.className}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, className: e.target.value }))}
                      placeholder="예) 화목반"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      이름 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.student}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, student: e.target.value }))}
                      placeholder="예) 홍길동"
                      required
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      학생 전화번호
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.phoneNumber}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                      placeholder="예) 010-1234-5678"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      학부모 전화번호
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.parentPhoneNumber}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, parentPhoneNumber: e.target.value }))}
                      placeholder="예) 010-9876-5432"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      학부모 전화번호 2
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.parentPhoneNumber2}
                      onChange={(e) => setNewStudentForm(prev => ({ ...prev, parentPhoneNumber2: e.target.value }))}
                      placeholder="예) 010-1234-5678"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '15px', textAlign: 'right' }}>
                  <button
                    type="submit"
                    disabled={!newStudentForm.student.trim()}
                    style={{
                      padding: '10px 20px',
                      fontSize: '1rem',
                      backgroundColor: newStudentForm.student.trim() ? '#0ea5e9' : '#9ca3af',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: newStudentForm.student.trim() ? 'pointer' : 'not-allowed',
                      fontWeight: '600',
                    }}
                  >
                    추가하기
                  </button>
                </div>
              </form>
            )}
          </div>

          {combinedEntries.length === 0 ? (
            <p className="empty-state">등록된 학생이 없습니다. 위의 학생 추가 폼을 사용하여 학생을 추가하세요.</p>
          ) : (
            <div className="clinic-log-table-wrapper">
              <table className="clinic-log-table" data-subject={subject}>
                <colgroup>
                  <col style={{ width: '105px' }} />
                  <col style={{ width: '150px' }} />
                  <col style={{ width: '220px' }} />
                  {subject === 'math' ? (
                    <>
                      <col style={{ width: '120px' }} />
                      <col style={{ width: '170px' }} />
                      <col style={{ width: '170px' }} />
                    </>
                  ) : (
                    <>
                      <col style={{ width: '72px' }} />
                      <col style={{ width: '90px' }} />
                      <col style={{ width: '150px' }} />
                      <col style={{ width: '225px' }} />
                    </>
                  )}
                </colgroup>
                <thead>
                  <tr>
                    <th>클리닉 시간</th>
                    <th className="grade-name-col">학년/반 · 이름</th>
                    <th>전화번호</th>
                    {subject === 'math' ? (
                      <th colSpan={3} className="merged-four-col">출결 / 담당 / 등원·하원 / 과목·교재 / 시험 확인 / 비고</th>
                    ) : (
                      <>
                        <th colSpan={4} className="merged-four-col">출결 / 담당 / 등원·하원 / 시험 확인 / 비고</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {combinedEntries.map((entry) => {
                    const record = mergeRecord(recordValues[entry.key]);
                    const isManual = entry.source === 'manual';
                    const isReturnStudent = isManual && entry.type === 'return';
                    const isKakaoSent = record.messageStatus === '카톡 발신 완료';
                    return (
                      <React.Fragment key={entry.key}>
                        <tr 
                          className={isReturnStudent ? 'return-student-row' : ''}
                          style={isKakaoSent ? { backgroundColor: '#d1fae5' } : {}}
                        >
                        <td className="day-time-cell">
                          <select
                            value={record.day}
                            onChange={(e) => handleRecordChange(entry.key, 'day', e.target.value, entry)}
                          >
                            <option value="">요일 선택</option>
                            {dayOrder.map((day) => (
                              <option key={day} value={day}>
                                {day}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="예) 17시"
                            value={record.time}
                            onChange={(e) => handleRecordChange(entry.key, 'time', e.target.value, entry)}
                          />
                        </td>
                        <td className="grade-name-cell">
                          <div className="grade-class-cell">
                            <div className="grade-row">
                              <strong>{entry.grade || '-'}</strong>
                              {entry.school && (
                                <span className="school-abbr">
                                  {entry.school === '과천고등학교' ? '천' : 
                                   entry.school === '과천중앙고등학교' ? '앙' : 
                                   entry.school}
                                </span>
                              )}
                            </div>
                            <div className="class-row">
                              <input
                                type="text"
                                className="clinic-input"
                                placeholder="수강반"
                                value={record.className ?? entry.className ?? ''}
                                onChange={(e) => handleRecordChange(entry.key, 'className', e.target.value, entry)}
                                style={{
                                  width: '100%',
                                  padding: '4px 8px',
                                  fontSize: '0.9rem',
                                  marginTop: '2px',
                                }}
                              />
                            </div>
                          </div>
                          <div className="student-name-in-cell">
                          <span
                            className="student-name-text"
                            onClick={() => handleStudentNameClick(entry.student)}
                            style={{
                              cursor: 'pointer',
                              color: '#0ea5e9',
                              textDecoration: 'underline',
                              fontWeight: '600',
                            }}
                            title="클릭하여 전송 내역 보기"
                          >
                            {entry.student}
                          </span>
                          {getStudentHistory(entry.student).length > 0 && (
                            <span style={{ marginLeft: '5px', fontSize: '0.8rem', color: '#10b981' }}>
                              ({getStudentHistory(entry.student).length}건)
                            </span>
                          )}
                          </div>
                          <div className="student-actions-in-cell">
                            <button
                              type="button"
                              onClick={() => handleCopyStudent(entry.key)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.8rem',
                                backgroundColor: '#10b981',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                width: '100%',
                              }}
                              onMouseEnter={(e) => { e.target.style.backgroundColor = '#059669'; }}
                              onMouseLeave={(e) => { e.target.style.backgroundColor = '#10b981'; }}
                            >
                              복사
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStudent(entry.key)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.8rem',
                                backgroundColor: '#ef4444',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                width: '100%',
                              }}
                              onMouseEnter={(e) => { e.target.style.backgroundColor = '#dc2626'; }}
                              onMouseLeave={(e) => { e.target.style.backgroundColor = '#ef4444'; }}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                        <td className="phone-number-cell">
                          <div className="phone-display">
                            <div className="phone-input-row">
                              <label style={{ fontSize: '0.85rem', fontWeight: '600', marginRight: '5px' }}>학생:</label>
                              <input
                                type="text"
                                className="clinic-input"
                                placeholder="학생 전화번호"
                                value={record.phoneNumber || ''}
                                onChange={(e) => handleRecordChange(entry.key, 'phoneNumber', e.target.value, entry)}
                                style={{
                                  width: '100%',
                                  padding: '4px 8px',
                                  fontSize: '0.9rem',
                                  marginBottom: '5px',
                                }}
                              />
                            </div>
                            <div className="phone-input-row">
                              <label style={{ fontSize: '0.85rem', fontWeight: '600', marginRight: '5px' }}>학부모:</label>
                              <input
                                type="text"
                                className="clinic-input"
                                placeholder="학부모 전화번호"
                                value={record.parentPhoneNumber || ''}
                                onChange={(e) => handleRecordChange(entry.key, 'parentPhoneNumber', e.target.value, entry)}
                                style={{
                                  width: '100%',
                                  padding: '4px 8px',
                                  fontSize: '0.9rem',
                                  marginBottom: '5px',
                                }}
                              />
                            </div>
                            <div className="phone-input-row">
                              <label style={{ fontSize: '0.85rem', fontWeight: '600', marginRight: '5px' }}>학부모2:</label>
                              <input
                                type="text"
                                className="clinic-input"
                                placeholder="학부모 전화번호 2"
                                value={record.parentPhoneNumber2 || ''}
                                onChange={(e) => handleRecordChange(entry.key, 'parentPhoneNumber2', e.target.value, entry)}
                                style={{
                                  width: '100%',
                                  padding: '4px 8px',
                                  fontSize: '0.9rem',
                                  marginBottom: '5px',
                                }}
                              />
                            </div>
                            {(record.phoneNumber || entry.phoneNumber) && (
                              <button
                                type="button"
                                onClick={() => handleOpenPreview(entry)}
                                style={{
                                  marginTop: '5px',
                                  padding: '5px 10px',
                                  fontSize: '0.85rem',
                                  backgroundColor: '#10b981',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  width: '100%',
                                }}
                              >
                                👁️ 미리보기
                              </button>
                            )}
                          </div>
                        </td>
                        {subject === 'math' ? (
                          <td colSpan={3} className="merged-four-cell merged-four-vertical math-detail-cell">
                            <div className="merged-four-stack">
                              <div className="merged-three-in-row">
                                <div className="merged-four-item">
                                  <span className="merged-four-label">출결</span>
                                  <select
                                    className="clinic-select"
                                    value={record.attendance}
                                    onChange={(e) => handleRecordChange(entry.key, 'attendance', e.target.value, entry)}
                                    style={{ width: '100%', fontSize: '0.85rem', padding: '4px 6px' }}
                                  >
                                    <option value="">-</option>
                                    {attendanceOptions.slice(1).map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="merged-four-item">
                                  <span className="merged-four-label">담당 선생님</span>
                                  <input
                                    className="clinic-input"
                                    type="text"
                                    value={record.assistant}
                                    placeholder="담당자"
                                    onChange={(e) => handleRecordChange(entry.key, 'assistant', e.target.value, entry)}
                                    style={{ width: '100%', fontSize: '0.85rem', padding: '4px 6px' }}
                                  />
                                </div>
                                <div className="merged-four-item">
                                  <span className="merged-four-label">등원/하원</span>
                                  <div className="clinic-time-input">
                                    <input
                                      type="text"
                                      value={record.arrival}
                                      placeholder="등원"
                                      onChange={(e) => handleRecordChange(entry.key, 'arrival', e.target.value, entry)}
                                      style={{ fontSize: '0.8rem', padding: '2px 4px' }}
                                    />
                                    <span className="time-icon">⏱</span>
                                  </div>
                                  <div className="clinic-time-input">
                                    <input
                                      type="text"
                                      value={record.departure}
                                      placeholder="하원"
                                      onChange={(e) => handleRecordChange(entry.key, 'departure', e.target.value, entry)}
                                      style={{ fontSize: '0.8rem', padding: '2px 4px' }}
                                    />
                                    <span className="time-icon">⏱</span>
                                  </div>
                                </div>
                              </div>
                              <div className="merged-four-item">
                                <span className="merged-four-label">과목 / 교재</span>
                                <div className="math-activity-card">
                                  <div className="math-activity-inline-grid">
                                    <select
                                      className="clinic-select"
                                      value={record.activityType || ''}
                                      onChange={(e) => handleRecordChange(entry.key, 'activityType', e.target.value, entry)}
                                      style={{ fontSize: '0.85rem', padding: '4px 6px', width: '100%' }}
                                    >
                                      <option value="">과목 선택</option>
                                      <option value="과제">과제</option>
                                      <option value="클리닉">클리닉</option>
                                      <option value="테스트">테스트</option>
                                    </select>
                                    <select
                                      className="clinic-select"
                                      value={record.materialType || ''}
                                      onChange={(e) => handleRecordChange(entry.key, 'materialType', e.target.value, entry)}
                                      style={{ fontSize: '0.85rem', padding: '4px 6px', width: '100%' }}
                                    >
                                      <option value="">교재 선택</option>
                                      <option value="교재">교재</option>
                                      <option value="학습지">학습지</option>
                                      <option value="실전기출">실전기출</option>
                                    </select>
                                  </div>
                                  <button
                                    type="button"
                                    className="math-activity-add-btn"
                                    onClick={() => handleAddActivitySet(entry.key)}
                                  >
                                    + 추가
                                  </button>
                                </div>
                                {(record.activitySets || []).map((set, idx) => (
                                  <div key={idx} className="math-activity-card">
                                    <div className="math-activity-card-header">
                                      <span>세트 {idx + 1}</span>
                                      <button
                                        type="button"
                                        className="math-activity-remove-btn"
                                        onClick={() => handleDeleteActivitySet(entry.key, idx)}
                                      >
                                        삭제
                                      </button>
                                    </div>
                                    <div className="math-activity-inline-grid">
                                      <select
                                        className="clinic-select"
                                        value={set.activityType || ''}
                                        onChange={(e) => handleActivitySetChange(entry.key, idx, 'activityType', e.target.value)}
                                        style={{ fontSize: '0.85rem', padding: '4px 6px', width: '100%' }}
                                      >
                                        <option value="">과목 선택</option>
                                        <option value="과제">과제</option>
                                        <option value="클리닉">클리닉</option>
                                        <option value="테스트">테스트</option>
                                      </select>
                                      <select
                                        className="clinic-select"
                                        value={set.materialType || ''}
                                        onChange={(e) => handleActivitySetChange(entry.key, idx, 'materialType', e.target.value)}
                                        style={{ fontSize: '0.85rem', padding: '4px 6px', width: '100%' }}
                                      >
                                        <option value="">교재 선택</option>
                                        <option value="교재">교재</option>
                                        <option value="학습지">학습지</option>
                                        <option value="실전기출">실전기출</option>
                                      </select>
                                    </div>
                                    <textarea
                                      className="clinic-input"
                                      value={set.examStatus || ''}
                                      placeholder="세트 시험 확인"
                                      onChange={(e) => handleActivitySetChange(entry.key, idx, 'examStatus', e.target.value)}
                                      rows={2}
                                      style={{ width: '100%', fontSize: '0.85rem', minHeight: '40px', resize: 'vertical' }}
                                    />
                                    <textarea
                                      className="clinic-input"
                                      value={set.notes || ''}
                                      placeholder="세트 비고"
                                      onChange={(e) => handleActivitySetChange(entry.key, idx, 'notes', e.target.value)}
                                      rows={2}
                                      style={{ width: '100%', fontSize: '0.85rem', minHeight: '52px', resize: 'vertical' }}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="merged-four-item">
                                <span className="merged-four-label">시험 확인</span>
                                <textarea
                                  className="clinic-input"
                                  value={record.examStatus || ''}
                                  placeholder="시험 확인"
                                  onChange={(e) => handleRecordChange(entry.key, 'examStatus', e.target.value, entry)}
                                  rows={2}
                                  style={{ width: '100%', fontSize: '0.85rem', minHeight: '40px', resize: 'vertical' }}
                                />
                              </div>
                              <div className="merged-four-item merged-notes-item">
                                <span className="merged-four-label">📝 비고</span>
                                <textarea
                                  className="clinic-input"
                                  value={record.notes || ''}
                                  placeholder="비고를 입력하세요"
                                  onChange={(e) => handleRecordChange(entry.key, 'notes', e.target.value, entry)}
                                  rows={3}
                                  style={{ width: '100%', fontSize: '0.85rem', minHeight: '60px', resize: 'vertical', padding: '8px' }}
                                />
                              </div>
                            </div>
                          </td>
                        ) : (
                          <td colSpan={4} className="merged-four-cell merged-four-vertical">
                            <div className="merged-four-stack">
                              <div className="merged-three-in-row">
                                <div className="merged-four-item">
                                  <span className="merged-four-label">출결</span>
                                  <select
                                    className="clinic-select"
                                    value={record.attendance}
                                    onChange={(e) => handleRecordChange(entry.key, 'attendance', e.target.value, entry)}
                                    style={{ width: '100%', fontSize: '0.85rem', padding: '4px 6px' }}
                                  >
                                    <option value="">-</option>
                                    {attendanceOptions.slice(1).map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="merged-four-item">
                                  <span className="merged-four-label">담당 선생님</span>
                                  <input
                                    className="clinic-input"
                                    type="text"
                                    value={record.assistant}
                                    placeholder="조교명"
                                    onChange={(e) => handleRecordChange(entry.key, 'assistant', e.target.value, entry)}
                                    style={{ width: '100%', fontSize: '0.85rem', padding: '4px 6px' }}
                                  />
                                </div>
                                <div className="merged-four-item">
                                  <span className="merged-four-label">등원/하원</span>
                                  <div className="clinic-time-input">
                                    <input
                                      type="text"
                                      value={record.arrival}
                                      placeholder="등원"
                                      onChange={(e) => handleRecordChange(entry.key, 'arrival', e.target.value, entry)}
                                      style={{ fontSize: '0.8rem', padding: '2px 4px' }}
                                    />
                                    <span className="time-icon">⏱</span>
                                  </div>
                                  <div className="clinic-time-input">
                                    <input
                                      type="text"
                                      value={record.departure}
                                      placeholder="하원"
                                      onChange={(e) => handleRecordChange(entry.key, 'departure', e.target.value, entry)}
                                      style={{ fontSize: '0.8rem', padding: '2px 4px' }}
                                    />
                                    <span className="time-icon">⏱</span>
                                  </div>
                                </div>
                              </div>
                              <div className="merged-four-item">
                                <span className="merged-four-label">시험 확인</span>
                                <textarea
                                  className="clinic-input"
                                  value={record.examStatus || ''}
                                  placeholder="시험 확인"
                                  onChange={(e) => handleRecordChange(entry.key, 'examStatus', e.target.value, entry)}
                                  rows={2}
                                  style={{ width: '100%', fontSize: '0.85rem', minHeight: '40px', resize: 'vertical' }}
                                />
                              </div>
                              <div className="merged-four-item merged-notes-item">
                                <span className="merged-four-label">📝 비고</span>
                                <textarea
                                  className="clinic-input"
                                  value={record.notes || ''}
                                  placeholder="비고를 입력하세요"
                                  onChange={(e) => handleRecordChange(entry.key, 'notes', e.target.value, entry)}
                                  rows={3}
                                  style={{ width: '100%', fontSize: '0.85rem', minHeight: '60px', resize: 'vertical', padding: '8px' }}
                                />
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 카카오톡 전송 미리보기 모달 */}
        {showPreview && previewEntry && (
          <div className="preview-modal-overlay" onClick={() => setShowPreview(false)}>
            <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="preview-modal-header">
                <h3>📱 카카오톡 전송 미리보기 - {previewEntry.student}</h3>
                <button className="close-btn" onClick={() => setShowPreview(false)}>닫기</button>
              </div>
              
              <div className="preview-template-section">
                <div style={{ marginBottom: '15px' }}>
                  <label htmlFor="preview-week-select" style={{ marginRight: '10px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>
                    주차 선택:
                  </label>
                  <select
                    id="preview-week-select"
                    value={previewSelectedWeek || selectedWeek}
                    onChange={(e) => setPreviewSelectedWeek(e.target.value)}
                    style={{
                      padding: '8px 15px',
                      border: '2px solid #0ea5e9',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      width: '100%',
                      maxWidth: '400px',
                      backgroundColor: '#fff',
                    }}
                  >
                    {getWeekOptions().map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label} {option.isCurrent ? '(현재)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label htmlFor="template-code" style={{ marginRight: '10px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>
                    템플릿 코드:
                  </label>
                  <input
                    id="template-code"
                    type="text"
                    value={templateCode}
                    readOnly
                    disabled
                    style={{
                      padding: '8px 15px',
                      border: '2px solid #9ca3af',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      width: '100%',
                      maxWidth: '400px',
                      backgroundColor: '#f3f4f6',
                      color: '#6b7280',
                      cursor: 'not-allowed',
                    }}
                  />
                  <span style={{ marginLeft: '10px', fontSize: '0.85rem', color: '#6b7280' }}>
                    (고정값)
                  </span>
                </div>
              </div>

              <div className="preview-content-section">
                {(() => {
                  // 해당 학생의 클리닉 내용만 생성 (선택한 주차 사용)
                  const weekToUse = previewSelectedWeek || selectedWeek;
                  const { weekLabel, content } = formatClinicContentForStudent(previewEntry, weekToUse);
                  return (
                    <>
                      <div className="preview-content">
                        <strong>주차 정보:</strong>
                        <p>{weekLabel}</p>
                      </div>
                      
                      <div className="preview-content">
                        <strong>클리닉 내용:</strong>
                        <pre className="preview-text">{content}</pre>
                      </div>
                      
                      <div className="preview-phones">
                        {previewEntry.phoneNumber && (
                          <div className="phone-badge">학생: {formatPhoneNumber(previewEntry.phoneNumber)}</div>
                        )}
                        {previewEntry.parentPhoneNumber && (
                          <div className="phone-badge">학부모: {formatPhoneNumber(previewEntry.parentPhoneNumber)}</div>
                        )}
                        {previewEntry.parentPhoneNumber2 && (
                          <div className="phone-badge">학부모2: {formatPhoneNumber(previewEntry.parentPhoneNumber2)}</div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="preview-modal-actions">
                <button
                  className="send-kakao-btn"
                  onClick={() => handleKakaoSend(previewEntry, templateCode)}
                  disabled={!templateCode.trim()}
                  style={{ backgroundColor: '#FEE500', color: '#000', fontWeight: 'bold' }}
                >
                  📱 카카오톡 발송
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 전송 내역 모달 */}
        {showHistory && selectedHistoryStudent && (
          <div className="preview-modal-overlay" onClick={() => setShowHistory(false)}>
            <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="preview-modal-header">
                <h3>📋 전송 내역 - {selectedHistoryStudent}</h3>
                <button className="close-btn" onClick={() => setShowHistory(false)}>닫기</button>
              </div>
              
              <div className="preview-list">
                {getStudentHistory(selectedHistoryStudent).length === 0 ? (
                  <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    전송 내역이 없습니다.
                  </p>
                ) : (
                  getStudentHistory(selectedHistoryStudent).map((history, index) => {
                    const sendDate = new Date(history.date);
                    const formattedDate = `${sendDate.getFullYear()}-${String(sendDate.getMonth() + 1).padStart(2, '0')}-${String(sendDate.getDate()).padStart(2, '0')} ${String(sendDate.getHours()).padStart(2, '0')}:${String(sendDate.getMinutes()).padStart(2, '0')}`;
                    
                    return (
                      <div key={index} className="preview-item">
                        <div className="preview-item-header">
                          <span className="preview-student-name">{formattedDate}</span>
                          <span style={{ color: '#666', fontSize: '0.9rem' }}>{history.weekLabel}</span>
                        </div>
                        
                        <div className="preview-content-section">
                          <div className="preview-content">
                            <strong>수신자:</strong>
                            <div style={{ marginTop: '8px' }}>
                              {history.recipients.map((recipient, idx) => (
                                <div key={idx} style={{ marginBottom: '4px' }}>
                                  <span className="phone-badge">{recipient.type}: {formatPhoneNumber(recipient.phone)}</span>
                                  <span style={{ marginLeft: '8px', color: recipient.status === '성공' ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                                    {recipient.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          <div className="preview-content">
                            <strong>클리닉 내용:</strong>
                            <pre className="preview-text">{history.content}</pre>
                          </div>
                        </div>
                      </div>
                    );
                  }).reverse() // 최신순으로 표시
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

