import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';
import './StudentDataModal.css';

const CLINIC_RECORDS_PREFIX = 'clinicRecordValues_english_';
const CLINIC_CUSTOMS_PREFIX = 'clinicCustomEntries_english_';
const HOMEWORK_PHONE_DOC = 'homeworkCompletionPhoneNumbers';
const HOMEWORK_PHONE_DOC_ID = 'all';
const BACKUP_PHONE_DOC = 'studentPhoneNumbers';
const BACKUP_PHONE_DOC_ID = 'all';
const WITHDRAWN_STORAGE_KEY = 'studentDataWithdrawnNames';
const WITHDRAWN_NAMES_FIELD = 'withdrawnNames';
const CLINIC_ACTIVE_ROSTER_COLLECTION = 'clinicLogRoster_english';
const CLINIC_ACTIVE_ROSTER_DOC_ID = 'all';
const CLINIC_ACTIVE_ROSTER_STORAGE_KEY = 'clinicActiveRoster_english';
const KAKAO_HISTORY_COLLECTION = 'studentDataKakaoHistory';
const KAKAO_HISTORY_DOC_ID = 'all';
const STUDENT_SCORE_COLLECTION = 'studentDataScores';
const STUDENT_SCORE_DOC_ID = 'all';
const STUDENT_ACTIVITY_COLLECTION = 'studentDataActivityRecords';
const STUDENT_ACTIVITY_DOC_ID = 'all';
const HOMEWORK_SEND_HISTORY_COLLECTION = 'homeworkCompletionSendHistory';
const HOMEWORK_SEND_HISTORY_DOC_ID = 'all';
const HOMEWORK_SENT_COUNTS_DOC = 'homeworkCompletionSentCounts';
const HOMEWORK_SENT_COUNTS_DOC_ID = 'all';
const HOMEWORK_DATE_DATA_COLLECTION = 'homeworkCompletionDateData';
const HOMEWORK_DATE_DATA_DOC_ID = 'all';
const ENGLISH_HOMEWORK_PROGRESS_COLLECTION = 'englishHomeworkProgress';
const MATH_HOMEWORK_PROGRESS_COLLECTION = 'mathHomeworkProgress';
const CLINIC_KAKAO_HISTORY_COLLECTIONS = [
  { collectionName: 'clinicKakaoHistory_english', sourceLabel: '영어 클리닉' },
  { collectionName: 'clinicKakaoHistory_math', sourceLabel: '수학 클리닉' },
];
// 학생 데이터 개별 카톡 발송용 템플릿 (솔라피 검수 후 코드 교체) — 변수: 학생명, 학년, 반명, 공지
const STUDENT_DATA_KAKAO_TEMPLATE = 'KA01TP_STUDENT_DATA_INDIVIDUAL';
const SCHOOL_SCORE_SUBJECTS = ['국어', '영어', '수학', '과학', '사회', '역사'];
const MOCK_SCORE_SUBJECTS = ['국어', '영어', '수학', '한국사', '탐구1', '탐구2'];

const SCHOOL_GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];
const SCHOOL_EXAM_LABELS = [
  { key: '1_mid', label: '1학기 중간' },
  { key: '1_final', label: '1학기 기말' },
  { key: '2_mid', label: '2학기 중간' },
  { key: '2_final', label: '2학기 기말' },
];
const MOCK_YEARS = Array.from({ length: 2026 - 2018 + 1 }, (_, i) => String(2018 + i));
const MOCK_GRADES = ['고1', '고2', '고3'];
const MOCK_MONTHS = ['3월', '6월', '9월', '10월'];
const STUDENT_SCHOOL_OPTIONS = ['중앙고', '과천고', '과천외고', '과천여고', '인덕원고', '문원중', '과천중', '율목중', '갈현초', '청계초', '과천초', '기타'];

function buildSchoolScoreSlots() {
  return SCHOOL_GRADES.flatMap((grade) =>
    SCHOOL_EXAM_LABELS.map((exam) => ({
      key: `${grade}_${exam.key}`,
      grade,
      label: exam.label,
    }))
  );
}

function buildMockScoreSlots() {
  return MOCK_YEARS.flatMap((year) =>
    MOCK_GRADES.flatMap((grade) =>
      MOCK_MONTHS.map((month) => ({
        key: `${year}_${grade}_${month}`,
        year,
        grade,
        month,
      }))
    )
  );
}

function formatBirthYearLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.endsWith('년생')) return raw;
  const digitsOnly = raw.replace(/\D/g, '');
  if (/^\d{4}$/.test(digitsOnly)) return `${digitsOnly.slice(-2)}년생`;
  if (/^\d{2}$/.test(digitsOnly)) return `${digitsOnly}년생`;
  return raw;
}

function parseBirthYearValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const digitsOnly = raw.replace(/\D/g, '');
  if (/^\d{4}$/.test(digitsOnly)) return Number(digitsOnly);
  if (/^\d{2}$/.test(digitsOnly)) {
    const yy = Number(digitsOnly);
    return yy >= 50 ? 1900 + yy : 2000 + yy;
  }
  return null;
}

function inferSchoolLevelFromSchoolName(schoolName) {
  const raw = String(schoolName || '').replace(/\s+/g, '');
  if (!raw) return '';
  if (/외고|고등|여고|남고|중앙고|과천고|인덕원고|고$/.test(raw)) return '고';
  if (/중학교|여중|남중|문원중|과천중|율목중|중$/.test(raw)) return '중';
  if (/초등|청계초|갈현초|과천초|초$/.test(raw)) return '초';
  if (raw.includes('고')) return '고';
  if (raw.includes('중')) return '중';
  if (raw.includes('초')) return '초';
  return '';
}

function normalizeGradeLabel(value, schoolName = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '');
  const levelFromSchool = inferSchoolLevelFromSchoolName(schoolName);

  const directMatch = compact.match(/^(초|중|고)(\d)$/);
  if (directMatch) return `${directMatch[1]}${directMatch[2]}`;

  const gradeMatch = compact.match(/^(\d)학년$/);
  if (gradeMatch) {
    return levelFromSchool ? `${levelFromSchool}${gradeMatch[1]}` : `${gradeMatch[1]}학년`;
  }

  if (/^\d$/.test(compact)) {
    return levelFromSchool ? `${levelFromSchool}${compact}` : `${compact}학년`;
  }

  return raw;
}

function inferGradeFromBirthYear(birthYear, schoolName = '') {
  if (birthYear == null || !Number.isFinite(birthYear)) return '';
  const ac = new Date().getFullYear();
  const level = inferSchoolLevelFromSchoolName(schoolName);
  if (level === '고') {
    const grade = ac - 15 - birthYear;
    return grade >= 1 && grade <= 3 ? `고${grade}` : '';
  }
  if (level === '중') {
    const grade = ac - 12 - birthYear;
    return grade >= 1 && grade <= 3 ? `중${grade}` : '';
  }
  if (level === '초') {
    const grade = ac - 8 - birthYear;
    return grade >= 1 && grade <= 6 ? `초${grade}` : '';
  }
  return '';
}

function resolveStudentGrade({ school = '', birthYear = '', gradeOverride = '', grade = '' }) {
  const normalizedOverride = normalizeGradeLabel(gradeOverride, school);
  if (normalizedOverride) return normalizedOverride;

  const parsedBirthYear = parseBirthYearValue(birthYear || grade);
  const inferred = inferGradeFromBirthYear(parsedBirthYear, school);
  if (inferred) return inferred;

  if (String(grade || '').includes('년생')) return '';
  return normalizeGradeLabel(grade, school);
}

const SCHOOL_SCORE_SLOTS = buildSchoolScoreSlots();
const MOCK_SCORE_SLOTS = buildMockScoreSlots();

function loadWithdrawnNames() {
  try {
    const raw = localStorage.getItem(WITHDRAWN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWithdrawnNames(names) {
  try {
    localStorage.setItem(WITHDRAWN_STORAGE_KEY, JSON.stringify(names));
  } catch (e) {
    console.warn('퇴원 목록 저장 실패:', e);
  }
}

function normalizeWithdrawnNames(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
}

/**
 * 학년 문자열 → 출생 연도 (현재 **달력 연도** 기준, 일반적인 고교 내신 학년↔년생 대응)
 * 예: 2026년 기준 고2 → 2009년생(09년생), 고3 → 08년생, 고1 → 10년생
 */
function inferBirthYearFromGrade(gradeStr) {
  const raw = String(gradeStr || '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');

  const go = compact.match(/고(\d)/);
  if (go) {
    const g = parseInt(go[1], 10);
    if (g >= 1 && g <= 3) {
      const ac = new Date().getFullYear();
      return ac - 15 - g;
    }
  }
  const jung = compact.match(/중(\d)/);
  if (jung) {
    const g = parseInt(jung[1], 10);
    if (g >= 1 && g <= 3) {
      const ac = new Date().getFullYear();
      return ac - 12 - g;
    }
  }
  return null;
}

function birthYearToKoreanYearLabel(fullYear) {
  if (fullYear == null || !Number.isFinite(fullYear)) return null;
  const yy = fullYear % 100;
  return `${String(yy).padStart(2, '0')}년생`;
}

function deriveAcademicFields({ school = '', birthYear = '', gradeInput = '', gradeOverride = '' }) {
  const normalizedSchool = String(school || '').trim();
  const normalizedGradeInput = normalizeGradeLabel(gradeInput || gradeOverride, normalizedSchool);
  const explicitBirthYear = formatBirthYearLabel(birthYear);
  const inferredBirthYear = normalizedGradeInput ? birthYearToKoreanYearLabel(inferBirthYearFromGrade(normalizedGradeInput)) || '' : '';
  const normalizedBirthYear = explicitBirthYear || inferredBirthYear;
  const displayGrade = resolveStudentGrade({
    school: normalizedSchool,
    birthYear: normalizedBirthYear,
    gradeOverride: normalizedGradeInput,
    grade: normalizedGradeInput,
  });

  return {
    normalizedBirthYear,
    normalizedGradeInput,
    inferredBirthYear,
    displayGrade,
  };
}

/** 숙제 완료도 반명 → 읽기 쉬운 표시 (년도_강사_수업이름_요일_시간) */
function formatHomeworkClassDisplay(className) {
  if (!className) return '';
  const parts = String(className).split('_');
  if (parts.length >= 5) {
    return `${parts[2]} (${parts[3]} ${parts[4]})`;
  }
  return String(className);
}

function formatHomeworkClassDisplayList(classNameValue) {
  const raw = String(classNameValue || '').trim();
  if (!raw) return '';

  const parts = raw
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (parts.length === 0) return '';

  return parts.map(formatHomeworkClassDisplay).join(', ');
}

function getHomeworkClassDisplayRows(classNameValue) {
  const raw = String(classNameValue || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map(formatHomeworkClassDisplay);
}

function parseClassNames(classNameStr) {
  if (!classNameStr || typeof classNameStr !== 'string') return [];
  return classNameStr.split(',').map((item) => item.trim()).filter(Boolean);
}

function buildActivityRecordId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getTodayDateText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeStudentActivityRecords(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((studentName) => {
    const raw = value[studentName];
    out[studentName] = {
      classEvents: Array.isArray(raw?.classEvents) ? raw.classEvents : [],
      payments: Array.isArray(raw?.payments) ? raw.payments : [],
      counseling: Array.isArray(raw?.counseling) ? raw.counseling : [],
    };
  });
  return out;
}

function joinClassNames(classNames) {
  return [...new Set((classNames || []).map((item) => String(item || '').trim()).filter(Boolean))].join(',');
}

function createEmptyStudentForm() {
  return {
    name: '',
    school: '',
    birthYear: '',
    gradeInput: '',
    classNameText: '',
    studentPhone: '',
    parentPhone: '',
    parentPhone2: '',
  };
}

function buildStudentFormFromRow(row) {
  return {
    name: String(row?.name || '').trim(),
    school: String(row?.school || '').trim(),
    birthYear: formatBirthYearLabel(row?.birthYear || ''),
    gradeInput: resolveStudentGrade({
      school: row?.school || '',
      birthYear: row?.birthYear || '',
      gradeOverride: row?.gradeOverride || '',
      grade: row?.grade || '',
    }),
    classNameText: String(row?.className || '').trim(),
    studentPhone: String(row?.studentPhone || '').trim(),
    parentPhone: String(row?.parentPhone || '').trim(),
    parentPhone2: String(row?.parentPhone2 || '').trim(),
  };
}

function normalizePhoneValue(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function normalizePhoneEntry(entry) {
  const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const student = normalizePhoneValue(
    source.핸드폰 || source.학생핸드폰 || source.student || source.학생 || source.phoneNumber
  );
  const parent = normalizePhoneValue(
    source.부모핸드폰 || source.학부모핸드폰 || source.parent || source.학부모 || source.부모 || source.parentPhoneNumber
  );
  return {
    ...source,
    student,
    parent,
    핸드폰: student || null,
    부모핸드폰: parent || null,
  };
}

function normalizePhoneMap(phoneMap) {
  if (!phoneMap || typeof phoneMap !== 'object' || Array.isArray(phoneMap)) return {};
  const out = {};
  Object.keys(phoneMap).forEach((name) => {
    out[name] = normalizePhoneEntry(phoneMap[name]);
  });
  return out;
}

function repairPhoneEntryFromBackup(currentEntry, backupEntry) {
  const current = normalizePhoneEntry(currentEntry);
  const backup = normalizePhoneEntry(backupEntry);
  const currentStudent = normalizePhoneValue(current.student);
  const currentParent = normalizePhoneValue(current.parent);
  const backupStudent = normalizePhoneValue(backup.student);
  const backupParent = normalizePhoneValue(backup.parent);

  if (
    currentStudent &&
    currentParent &&
    currentStudent === currentParent &&
    backupStudent &&
    backupParent &&
    backupStudent !== backupParent &&
    (backupStudent !== currentStudent || backupParent !== currentParent)
  ) {
    return backup;
  }

  return current;
}

const STUDENT_KEY_PHONE_SUFFIX_REGEX = /\s+\((\d{4}(?:-\d+)?)\)$/;

function getStudentBaseName(name) {
  return String(name || '').trim().replace(STUDENT_KEY_PHONE_SUFFIX_REGEX, '');
}

function buildStudentKeyWithPhone(name, phoneDigits, existingNames = []) {
  const base = String(name || '').trim();
  const last4 = String(phoneDigits || '').slice(-4) || 'new';
  let candidate = `${base} (${last4})`;
  let suffix = 2;
  const existingSet = new Set(existingNames || []);
  while (existingSet.has(candidate)) {
    candidate = `${base} (${last4}-${suffix})`;
    suffix += 1;
  }
  return candidate;
}

function renameStudentKeyInObjectMap(value, oldKey, newKey) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (!oldKey || !newKey || oldKey === newKey) return { ...source };
  const out = { ...source };
  if (!(oldKey in out)) return out;
  out[newKey] = out[oldKey];
  delete out[oldKey];
  return out;
}

function renameStudentInDateTree(tree, oldKey, newKey) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return {};
  if (!oldKey || !newKey || oldKey === newKey) return JSON.parse(JSON.stringify(tree));
  const next = JSON.parse(JSON.stringify(tree));
  Object.keys(next).forEach((date) => {
    const day = next[date];
    if (!day || typeof day !== 'object' || Array.isArray(day)) return;
    Object.keys(day).forEach((className) => {
      const row = day[className];
      if (!row || typeof row !== 'object' || Array.isArray(row) || !(oldKey in row)) return;
      row[newKey] = row[oldKey];
      delete row[oldKey];
    });
  });
  return next;
}

function renameStudentInSentCounts(counts, oldKey, newKey) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return {};
  if (!oldKey || !newKey || oldKey === newKey) return JSON.parse(JSON.stringify(counts));
  const next = JSON.parse(JSON.stringify(counts));
  Object.keys(next).forEach((date) => {
    const day = next[date];
    if (!day || typeof day !== 'object' || Array.isArray(day)) return;
    Object.keys(day).forEach((className) => {
      const classCounts = day[className];
      if (!classCounts || typeof classCounts !== 'object' || Array.isArray(classCounts) || !(oldKey in classCounts)) return;
      classCounts[newKey] = classCounts[oldKey];
      delete classCounts[oldKey];
    });
  });
  return next;
}

function replaceStudentNameTokens(value, oldName, newName) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  return raw
    .split(',')
    .map((item) => {
      const trimmed = String(item || '').trim();
      return trimmed === oldName ? newName : trimmed;
    })
    .join(', ');
}

function renameStudentInSendHistory(history, oldKey, newKey) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) return {};
  if (!oldKey || !newKey || oldKey === newKey) return JSON.parse(JSON.stringify(history));
  const next = {};
  Object.keys(history).forEach((date) => {
    next[date] = Array.isArray(history[date])
      ? history[date].map((entry) => {
          const item = entry && typeof entry === 'object' ? { ...entry } : entry;
          if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
          if (item.studentName === oldKey) item.studentName = newKey;
          if (item['학생명'] != null) item['학생명'] = replaceStudentNameTokens(item['학생명'], oldKey, newKey);
          return item;
        })
      : [];
  });
  return next;
}

function studentNamesLikelyMatch(targetName, candidateName) {
  const left = String(targetName || '').trim();
  const right = String(candidateName || '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return getStudentBaseName(left) === getStudentBaseName(right);
}

function historyEntryTargetsStudent(rawValue, studentName) {
  const targets = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  return targets.some((candidate) => studentNamesLikelyMatch(studentName, candidate));
}

function formatHistoryDateLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16).replace('T', ' ');
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildHomeworkCompletionHistoryContent(entry) {
  const lines = [];
  if (entry?.타입) lines.push(`유형: ${entry.타입}`);
  if (entry?.반명) lines.push(`반: ${entry.반명}`);
  const homeworkList = Array.isArray(entry?.과제목록)
    ? entry.과제목록.join('\n')
    : String(entry?.과제목록 || '').trim();
  if (homeworkList) lines.push(`과제\n${homeworkList}`);
  const progressList = Array.isArray(entry?.진도목록)
    ? entry.진도목록.join('\n')
    : String(entry?.진도목록 || '').trim();
  if (progressList) lines.push(`진도\n${progressList}`);
  const progressText = String(entry?.진도상황 || '').trim();
  if (progressText) lines.push(`진도 상황\n${progressText}`);
  return lines.join('\n\n').trim();
}

function mergeClinicRowsIntoMap(byName, rows) {
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const name = String(row.name || row.student || '').trim();
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
    if (row.school != null) current.school = row.school;
    if (row.grade != null) current.grade = row.grade;
    if (row.className != null) current.className = row.className;
    if (row.studentPhone != null) current.studentPhone = row.studentPhone;
    if (row.parentPhone != null) current.parentPhone = row.parentPhone;
    if (row.parentPhone2 != null) current.parentPhone2 = row.parentPhone2;
    byName.set(name, current);
  });
}

export default function StudentDataModal({ onClose, fullScreen = false }) {
  const [list, setList] = useState([]);
  const [registeredClassList, setRegisteredClassList] = useState([]);
  const [withdrawnSet, setWithdrawnSet] = useState(() => new Set(loadWithdrawnNames()));
  const [studentDataTab, setStudentDataTab] = useState('list'); // 'list' | 'withdrawnByYear'
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [savingRoster, setSavingRoster] = useState(false);
  const [registryForm, setRegistryForm] = useState(createEmptyStudentForm);
  const [messageText, setMessageText] = useState('');
  const [savingPhones, setSavingPhones] = useState(false);
  const [sendingKakaoFor, setSendingKakaoFor] = useState(null); // 카톡 발송 중인 학생명
  const [kakaoHistory, setKakaoHistory] = useState([]); // { studentName, date, message, timestamp }[]
  const [historyStudent, setHistoryStudent] = useState(null); // 이름 클릭 시 해당 학생 발송 이력 모달
  const [studentMessageHistory, setStudentMessageHistory] = useState([]);
  const [studentMessageHistoryLoading, setStudentMessageHistoryLoading] = useState(false);
  const [selectedMessageHistoryId, setSelectedMessageHistoryId] = useState('');
  const [editingStudentKey, setEditingStudentKey] = useState('');
  const [editStudentForm, setEditStudentForm] = useState(createEmptyStudentForm);
  const [scoreRecords, setScoreRecords] = useState({});
  const [studentActivityRecords, setStudentActivityRecords] = useState({});
  const [savingActivity, setSavingActivity] = useState(false);
  const [savingScoresFor, setSavingScoresFor] = useState(null);
  const [scoreGradeFilter, setScoreGradeFilter] = useState('all');
  const [mockYearFilter, setMockYearFilter] = useState(String(new Date().getFullYear()));
  const [mockGradeFilter, setMockGradeFilter] = useState('고1');
  const [classAssignmentForm, setClassAssignmentForm] = useState({ className: '', note: '' });
  const [paymentForm, setPaymentForm] = useState({ date: getTodayDateText(), amount: '', method: '', note: '' });
  const [counselForm, setCounselForm] = useState({ date: getTodayDateText(), category: '', note: '' });
  /** 숙제 완료도에서 반 삭제 시 누적된 이력 { [이름]: [{ className, removedAt }] } */
  const [studentClassHistoryMap, setStudentClassHistoryMap] = useState({});

  // 전화번호 수정 (목록 상태만 변경)
  const updatePhoneInList = useCallback((name, field, value) => {
    setList((prev) => prev.map((row) =>
      row.name === name ? { ...row, [field]: value } : row
    ));
  }, []);

  // 숙제 과제 완료도 Firestore에 전화번호 저장 (학생/학부모만)
  const savePhonesToFirebase = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }
    setSavingPhones(true);
    try {
      const docRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
      const backupRef = doc(db, BACKUP_PHONE_DOC, BACKUP_PHONE_DOC_ID);
      const [snap, backupSnap] = await Promise.all([getDoc(docRef), getDoc(backupRef)]);
      const existing = snap.exists() ? snap.data() : {};
      const existingPhoneNumbers = normalizePhoneMap(existing.phoneNumbers || {});
      const backupPhoneNumbers = normalizePhoneMap(
        backupSnap.exists() && backupSnap.data()?.phoneNumbers ? backupSnap.data().phoneNumbers : {}
      );
      const merged = { ...existingPhoneNumbers };
      list.forEach((row) => {
        if (!row.name) return;
        merged[row.name] = normalizePhoneEntry({
          ...(merged[row.name] || {}),
          student: row.studentPhone != null ? String(row.studentPhone).trim() : (merged[row.name]?.student ?? ''),
          parent: row.parentPhone != null ? String(row.parentPhone).trim() : (merged[row.name]?.parent ?? ''),
          핸드폰: row.studentPhone != null ? String(row.studentPhone).trim() : (merged[row.name]?.핸드폰 ?? ''),
          부모핸드폰: row.parentPhone != null ? String(row.parentPhone).trim() : (merged[row.name]?.부모핸드폰 ?? ''),
        });
        merged[row.name] = repairPhoneEntryFromBackup(merged[row.name], backupPhoneNumbers[row.name]);
      });
      await setDoc(docRef, {
        ...existing,
        phoneNumbers: merged,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });
      await setDoc(backupRef, {
        phoneNumbers: merged,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });
      alert('✅ 전화번호가 저장되었습니다.');
    } catch (e) {
      console.error('전화번호 저장 실패:', e);
      alert('전화번호 저장에 실패했습니다.');
    } finally {
      setSavingPhones(false);
    }
  }, [list]);

  const loadAllStudents = useCallback(async () => {
    setLoading(true);
    setStudentClassHistoryMap({});
    const byName = new Map(); // name -> { name, school, grade, birthYear, gradeOverride, className, studentPhone, parentPhone, parentPhone2 }

    // 1) 영어 클리닉 대장: 활성 명단 문서 우선, 없으면 예전 localStorage 스캔으로 한 번만 폴백
    let clinicRosterLoaded = false;
    if (isFirebaseConfigured() && db) {
      try {
        const rosterSnap = await getDoc(doc(db, CLINIC_ACTIVE_ROSTER_COLLECTION, CLINIC_ACTIVE_ROSTER_DOC_ID));
        if (rosterSnap.exists()) {
          mergeClinicRowsIntoMap(byName, rosterSnap.data()?.students || []);
          clinicRosterLoaded = true;
        }
      } catch (e) {
        console.warn('클리닉 활성 명단 로드 실패:', e);
      }
    }

    if (!clinicRosterLoaded) {
      try {
        const rosterRaw = localStorage.getItem(CLINIC_ACTIVE_ROSTER_STORAGE_KEY);
        if (rosterRaw) {
          mergeClinicRowsIntoMap(byName, JSON.parse(rosterRaw));
          clinicRosterLoaded = true;
        }
      } catch (e) {
        console.warn('클리닉 활성 명단 localStorage 로드 실패:', e);
      }
    }

    if (!clinicRosterLoaded) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.startsWith(CLINIC_RECORDS_PREFIX)) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            let records = null;
            try {
              const parsed = JSON.parse(raw);
              records = parsed && typeof parsed === 'object' && parsed.records ? parsed.records : parsed;
            } catch (_) {
              continue;
            }
            if (!records || typeof records !== 'object') continue;
            Object.values(records).forEach((r) => {
              if (!r || typeof r !== 'object') return;
              const name = (r.student != null || r.studentName != null)
                ? String(r.student ?? r.studentName ?? '').trim()
                : '';
              if (!name) return;
              const cur = byName.get(name) || { name: name, school: '', grade: '', birthYear: '', gradeOverride: '', className: '', studentPhone: '', parentPhone: '', parentPhone2: '' };
              cur.name = name;
              if (r.school != null) cur.school = r.school;
              if (r.grade != null) cur.grade = r.grade;
              if (r.className != null) cur.className = r.className;
              if (r.phoneNumber != null) cur.studentPhone = r.phoneNumber;
              if (r.parentPhoneNumber != null) cur.parentPhone = r.parentPhoneNumber;
              if (r.parentPhoneNumber2 != null) cur.parentPhone2 = r.parentPhoneNumber2;
              byName.set(name, cur);
            });
          }
          if (key.startsWith(CLINIC_CUSTOMS_PREFIX)) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            let customs = null;
            try {
              const parsed = JSON.parse(raw);
              customs = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.customs) ? parsed.customs : []);
            } catch (_) {
              continue;
            }
            (customs || []).forEach((c) => {
              if (!c || typeof c !== 'object') return;
              const name = (c.student != null || c.studentName != null)
                ? String(c.student ?? c.studentName ?? '').trim()
                : '';
              if (!name) return;
              const cur = byName.get(name) || { name: name, school: '', grade: '', birthYear: '', gradeOverride: '', className: '', studentPhone: '', parentPhone: '', parentPhone2: '' };
              cur.name = name;
              if (c.school != null) cur.school = c.school;
              if (c.grade != null) cur.grade = c.grade;
              if (c.className != null) cur.className = c.className;
              byName.set(name, cur);
            });
          }
        }
      } catch (e) {
        console.warn('클리닉 데이터 수집 실패:', e);
      }
    }

    // 2) 숙제 과제 완료도: Firestore
    // 반(반명)은 숙제 과제 완료도의 studentInfo를 기준으로 한다. (클리닉 반은 완료도에 학생이 있으면 사용하지 않음)
    let serverWithdrawnNames = [];
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
        const backupRef = doc(db, BACKUP_PHONE_DOC, BACKUP_PHONE_DOC_ID);
        const [snap, backupSnap] = await Promise.all([getDoc(docRef), getDoc(backupRef)]);
        if (snap.exists()) {
          const data = snap.data();
          serverWithdrawnNames = normalizeWithdrawnNames(data?.[WITHDRAWN_NAMES_FIELD]);
          const hist = data.studentClassHistory;
          setRegisteredClassList(
            Array.isArray(data.addedClassList)
              ? [...new Set(data.addedClassList.map((item) => String(item || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
              : []
          );
          setStudentClassHistoryMap(
            hist && typeof hist === 'object' && !Array.isArray(hist) ? hist : {}
          );
          const students = data.students || [];
          const studentInfo = data.studentInfo || {};
          const phoneNumbers = normalizePhoneMap(data.phoneNumbers || {});
          const backupPhoneNumbers = normalizePhoneMap(
            backupSnap.exists() && backupSnap.data()?.phoneNumbers ? backupSnap.data().phoneNumbers : {}
          );

          const extractStudentName = (item) => {
            if (item == null) return '';
            if (typeof item === 'string') return String(item).trim();
            const raw = item.name || item.student;
            return raw != null ? String(raw).trim() : '';
          };

          const homeworkNames = new Set();
          students.forEach((item) => {
            const n = extractStudentName(item);
            if (n) homeworkNames.add(n);
          });
          Object.keys(studentInfo || {}).forEach((k) => {
            const t = String(k).trim();
            if (t) homeworkNames.add(t);
          });
          Object.keys(phoneNumbers || {}).forEach((k) => {
            const t = String(k).trim();
            if (t) homeworkNames.add(t);
          });

          homeworkNames.forEach((n) => {
            const info = studentInfo[n] || {};
            const phones = repairPhoneEntryFromBackup(phoneNumbers[n] || {}, backupPhoneNumbers[n] || {});
            const cur = byName.get(n) || { name: n, school: '', grade: '', birthYear: '', gradeOverride: '', className: '', studentPhone: '', parentPhone: '', parentPhone2: '' };
            cur.name = n;
            if (info.school != null && String(info.school).trim() !== '') cur.school = info.school;
            if (info.birthYear != null && String(info.birthYear).trim() !== '') cur.birthYear = info.birthYear;
            if (info.gradeOverride != null && String(info.gradeOverride).trim() !== '') cur.gradeOverride = info.gradeOverride;
            const resolvedGrade = resolveStudentGrade({
              school: info.school ?? cur.school,
              birthYear: info.birthYear,
              gradeOverride: info.gradeOverride,
              grade: info.grade,
            });
            if (resolvedGrade) cur.grade = resolvedGrade;
            // 반: 완료도에만 반영(값 없으면 빈 칸·표시는 '-')
            const hwClassRaw = info.className;
            cur.className =
              hwClassRaw != null && String(hwClassRaw).trim() !== '' ? hwClassRaw : '';
            if (phones.student != null && String(phones.student).trim() !== '') {
              cur.studentPhone = cur.studentPhone || phones.student;
            }
            if (phones.parent != null && String(phones.parent).trim() !== '') {
              cur.parentPhone = cur.parentPhone || phones.parent;
            }
            byName.set(n, cur);
          });
        }
        else {
          setRegisteredClassList([]);
        }
      } catch (e) {
        console.warn('숙제 완료도 데이터 수집 실패:', e);
      }
    }

    let arr = Array.from(byName.entries()).map(([keyName, row]) => {
      const displayName = (row.name && String(row.name).trim()) || (keyName && String(keyName).trim()) || '(이름 없음)';
      const resolvedGrade = resolveStudentGrade(row);
      return {
        ...row,
        name: displayName,
        birthYear: formatBirthYearLabel(row.birthYear || row.grade),
        gradeOverride: normalizeGradeLabel(row.gradeOverride, row.school),
        grade: resolvedGrade || row.grade || '',
      };
    }).filter((row) => row.name && row.name !== '(이름 없음)');
    const localWithdrawnNames = loadWithdrawnNames();
    const mergedWithdrawnNames = normalizeWithdrawnNames([...serverWithdrawnNames, ...localWithdrawnNames]);
    const withdrawnSetLocal = new Set(mergedWithdrawnNames);
    arr.sort((a, b) => {
      const aOut = withdrawnSetLocal.has(a.name);
      const bOut = withdrawnSetLocal.has(b.name);
      if (aOut !== bOut) return aOut ? 1 : -1;
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });
    saveWithdrawnNames(mergedWithdrawnNames);
    setWithdrawnSet(withdrawnSetLocal);
    setList(arr);

    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
        const snap = await getDoc(docRef);
        const existing = snap.exists() ? snap.data() : {};
        const existingWithdrawnNames = normalizeWithdrawnNames(existing?.[WITHDRAWN_NAMES_FIELD]);
        if (JSON.stringify(existingWithdrawnNames) !== JSON.stringify(mergedWithdrawnNames)) {
          await setDoc(docRef, {
            [WITHDRAWN_NAMES_FIELD]: mergedWithdrawnNames,
            lastUpdated: new Date().toISOString(),
          }, { merge: true });
        }
      } catch (e) {
        console.warn('퇴원 목록 공용 동기화 실패:', e);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadAllStudents();
  }, [loadAllStudents]);

  const availableClassOptions = useMemo(() => {
    const set = new Set();
    registeredClassList.forEach((className) => set.add(className));
    list.forEach((row) => {
      parseClassNames(row.className || '').forEach((className) => set.add(className));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [list, registeredClassList]);

  const appendClassToRegistryForm = useCallback((className) => {
    setRegistryForm((prev) => {
      const next = joinClassNames([...parseClassNames(prev.classNameText), className]);
      return { ...prev, classNameText: next };
    });
  }, []);

  const handleRegisterStudent = useCallback(async () => {
    const name = String(registryForm.name || '').trim();
    if (!name) {
      alert('학생 이름을 입력해주세요.');
      return;
    }

    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }

    setSavingRoster(true);
    try {
      const docRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
      const backupRef = doc(db, BACKUP_PHONE_DOC, BACKUP_PHONE_DOC_ID);
      const [snap, backupSnap] = await Promise.all([getDoc(docRef), getDoc(backupRef)]);
      const existing = snap.exists() ? snap.data() : {};
      const backupPhoneNumbers = normalizePhoneMap(
        backupSnap.exists() && backupSnap.data()?.phoneNumbers ? backupSnap.data().phoneNumbers : {}
      );

      const existingStudents = Array.isArray(existing.students) ? existing.students.map((item) => String(item || '').trim()).filter(Boolean) : [];
      const existingStudentInfo = existing.studentInfo && typeof existing.studentInfo === 'object' ? existing.studentInfo : {};
      const existingPhoneNumbers = normalizePhoneMap(existing.phoneNumbers || {});
      const existingAddedClassList = Array.isArray(existing.addedClassList)
        ? existing.addedClassList.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

      const incomingStudentPhoneDigits = normalizePhoneDigits(registryForm.studentPhone);
      const incomingParentPhoneDigits = normalizePhoneDigits(registryForm.parentPhone);
      const incomingPhoneCandidates = [incomingStudentPhoneDigits, incomingParentPhoneDigits].filter(Boolean);
      const { normalizedBirthYear, normalizedGradeInput } = deriveAcademicFields({
        school: registryForm.school,
        birthYear: registryForm.birthYear,
        gradeInput: registryForm.gradeInput,
      });
      const sameNameStudentKeys = existingStudents.filter((key) => getStudentBaseName(key) === name);
      const matchedExistingKey = sameNameStudentKeys.find((key) => {
        const phone = normalizePhoneEntry(existingPhoneNumbers[key] || {});
        const digits = [normalizePhoneDigits(phone.student), normalizePhoneDigits(phone.parent)].filter(Boolean);
        return incomingPhoneCandidates.length > 0 && digits.some((digit) => incomingPhoneCandidates.includes(digit));
      });

      if (sameNameStudentKeys.length > 0 && !matchedExistingKey && incomingPhoneCandidates.length === 0) {
        alert('같은 이름 학생이 이미 있습니다. 학생 또는 학부모 번호를 입력하면 같은 학생/다른 학생을 구분할 수 있습니다.');
        return;
      }

      const resolvedKey = matchedExistingKey
        || (sameNameStudentKeys.length > 0
          ? buildStudentKeyWithPhone(name, incomingStudentPhoneDigits || incomingParentPhoneDigits, existingStudents)
          : name);

      const incomingClasses = parseClassNames(registryForm.classNameText || '');
      const mergedClasses = joinClassNames([
        ...parseClassNames(existingStudentInfo[resolvedKey]?.className || ''),
        ...incomingClasses,
      ]);
      const nextAddedClassList = [...new Set([...existingAddedClassList, ...incomingClasses])].sort((a, b) => a.localeCompare(b, 'ko'));

      const nextStudents = existingStudents.includes(resolvedKey) ? existingStudents : [...existingStudents, resolvedKey];
      const nextStudentInfo = {
        ...existingStudentInfo,
        [resolvedKey]: {
          ...(existingStudentInfo[resolvedKey] || {}),
          school: registryForm.school.trim() || existingStudentInfo[resolvedKey]?.school || '',
          birthYear: normalizedBirthYear || existingStudentInfo[resolvedKey]?.birthYear || '',
          gradeOverride: normalizedGradeInput || existingStudentInfo[resolvedKey]?.gradeOverride || '',
          grade: resolveStudentGrade({
            school: registryForm.school.trim() || existingStudentInfo[resolvedKey]?.school || '',
            birthYear: normalizedBirthYear || existingStudentInfo[resolvedKey]?.birthYear || '',
            gradeOverride: normalizedGradeInput || existingStudentInfo[resolvedKey]?.gradeOverride || '',
            grade: existingStudentInfo[resolvedKey]?.grade || '',
          }),
          className: mergedClasses,
          displayName: name,
        },
      };
      const nextPhoneNumbers = {
        ...existingPhoneNumbers,
        [resolvedKey]: repairPhoneEntryFromBackup(
          normalizePhoneEntry({
            ...(existingPhoneNumbers[resolvedKey] || {}),
            student: registryForm.studentPhone.trim() || existingPhoneNumbers[resolvedKey]?.student || '',
            parent: registryForm.parentPhone.trim() || existingPhoneNumbers[resolvedKey]?.parent || '',
            parentPhoneNumber2: registryForm.parentPhone2.trim() || existingPhoneNumbers[resolvedKey]?.parentPhoneNumber2 || '',
            핸드폰: registryForm.studentPhone.trim() || existingPhoneNumbers[resolvedKey]?.핸드폰 || '',
            부모핸드폰: registryForm.parentPhone.trim() || existingPhoneNumbers[resolvedKey]?.부모핸드폰 || '',
          }),
          backupPhoneNumbers[resolvedKey] || {}
        ),
      };

      await setDoc(docRef, {
        ...existing,
        students: nextStudents,
        studentInfo: nextStudentInfo,
        phoneNumbers: nextPhoneNumbers,
        addedClassList: nextAddedClassList,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });

      await setDoc(backupRef, {
        phoneNumbers: nextPhoneNumbers,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });

      setRegistryForm(createEmptyStudentForm());
      setShowRegisterForm(false);
      await loadAllStudents();
      alert(matchedExistingKey ? '✅ 같은 학생 정보가 업데이트되었습니다.' : '✅ 학생 신규 등록이 완료되었습니다.');
    } catch (e) {
      console.error('학생 데이터 등록 실패:', e);
      alert(`학생 데이터 등록에 실패했습니다. ${e?.message || ''}`.trim());
    } finally {
      setSavingRoster(false);
    }
  }, [registryForm, loadAllStudents]);

  // 학생 데이터 카톡 발송 이력 로드
  const loadKakaoHistory = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) return;
    try {
      const ref = doc(db, KAKAO_HISTORY_COLLECTION, KAKAO_HISTORY_DOC_ID);
      const snap = await getDoc(ref);
      const entries = (snap.exists() && snap.data().entries) || [];
      setKakaoHistory(Array.isArray(entries) ? entries : []);
    } catch (e) {
      console.warn('카톡 발송 이력 로드 실패:', e);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadKakaoHistory();
  }, [loading, loadKakaoHistory]);

  const loadScoreRecords = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) return;
    try {
      const ref = doc(db, STUDENT_SCORE_COLLECTION, STUDENT_SCORE_DOC_ID);
      const snap = await getDoc(ref);
      const records = snap.exists() ? snap.data()?.records : {};
      setScoreRecords(records && typeof records === 'object' ? records : {});
    } catch (e) {
      console.warn('학생 성적 데이터 로드 실패:', e);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadScoreRecords();
  }, [loading, loadScoreRecords]);

  const loadStudentActivityRecords = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) return;
    try {
      const ref = doc(db, STUDENT_ACTIVITY_COLLECTION, STUDENT_ACTIVITY_DOC_ID);
      const snap = await getDoc(ref);
      setStudentActivityRecords(normalizeStudentActivityRecords(snap.exists() ? snap.data()?.records : {}));
    } catch (e) {
      console.warn('학생 활동 이력 로드 실패:', e);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadStudentActivityRecords();
  }, [loading, loadStudentActivityRecords]);

  const apiUrl = typeof window !== 'undefined' && window.location
    ? `${window.location.origin}/api/send-kakao`
    : 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

  const sendKakaoToStudent = useCallback(async (row) => {
    const trimmed = (messageText || '').trim();
    if (!trimmed) {
      alert('메시지 내용을 입력한 뒤 카톡 보내기를 눌러주세요.');
      return;
    }
    const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
    const studentPhone = (row.studentPhone || '').replace(/[^0-9]/g, '');
    const parentPhone = (row.parentPhone || '').replace(/[^0-9]/g, '');
    if (!studentPhone && !parentPhone) {
      alert('해당 학생의 학생 전화 또는 학부모 전화번호를 입력해주세요.');
      return;
    }
    setSendingKakaoFor(row.name);
    const variables = {
      학생명: row.name || '',
      학년: row.grade || '',
      반명: row.className || '',
      공지: trimmed,
    };
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    let success = 0;
    try {
      if (studentPhone && phoneRegex.test(studentPhone)) {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: studentPhone,
            templateCode: STUDENT_DATA_KAKAO_TEMPLATE,
            variables,
          }),
        });
        const data = await res.json();
        if (data && data.success) success++;
      }
      if (parentPhone && phoneRegex.test(parentPhone)) {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: parentPhone,
            templateCode: STUDENT_DATA_KAKAO_TEMPLATE,
            variables,
          }),
        });
        const data = await res.json();
        if (data && data.success) success++;
      }
      if (success > 0) {
        const entry = { studentName: row.name, date: today, message: trimmed, timestamp: now };
        setKakaoHistory((prev) => [...prev, entry]);
        if (isFirebaseConfigured() && db) {
          try {
            const ref = doc(db, KAKAO_HISTORY_COLLECTION, KAKAO_HISTORY_DOC_ID);
            const snap = await getDoc(ref);
            const existing = (snap.exists() && snap.data().entries) || [];
            await setDoc(ref, { entries: [...(Array.isArray(existing) ? existing : []), entry], lastUpdated: now }, { merge: true });
          } catch (err) {
            console.warn('발송 이력 저장 실패:', err);
          }
        }
        alert(`✅ ${row.name}님에게 카카오톡 ${success}건 발송되었습니다.`);
      } else {
        alert('발송에 실패했습니다. 전화번호와 솔라피 템플릿 코드를 확인해주세요.');
      }
    } catch (e) {
      console.error(e);
      alert('카카오톡 발송 중 오류가 발생했습니다.');
    } finally {
      setSendingKakaoFor(null);
    }
  }, [messageText, apiUrl]);

  const toggleWithdrawn = useCallback(async (name) => {
    const next = new Set(withdrawnSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const nextNames = normalizeWithdrawnNames(Array.from(next));
    setWithdrawnSet(new Set(nextNames));
    saveWithdrawnNames(nextNames);
    setList((prev) => {
      const copy = [...prev];
      copy.sort((a, b) => {
        const aOut = next.has(a.name);
        const bOut = next.has(b.name);
        if (aOut !== bOut) return aOut ? 1 : -1;
        return (a.name || '').localeCompare(b.name || '', 'ko');
      });
      return copy;
    });
    if (!isFirebaseConfigured() || !db) return;
    try {
      await setDoc(
        doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID),
        {
          [WITHDRAWN_NAMES_FIELD]: nextNames,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('퇴원 상태 저장 실패:', e);
      alert(`퇴원 상태 저장에 실패했습니다. ${e?.message || ''}`.trim());
    }
  }, [withdrawnSet]);

  const withdrawnByBirthYear = useMemo(() => {
    const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
    const rows = list.filter((r) => {
      if (!withdrawnSet.has(r.name)) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        r.name,
        r.school,
        r.grade,
        formatHomeworkClassDisplayList(r.className),
        r.studentPhone,
        r.parentPhone,
      ]
        .map((item) => String(item || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedQuery);
    });
    const map = new Map();
    for (const row of rows) {
      const fy = parseBirthYearValue(row.birthYear) ?? inferBirthYearFromGrade(row.grade);
      const label = fy != null ? birthYearToKoreanYearLabel(fy) : '학년 미인식';
      if (!map.has(label)) {
        map.set(label, { birthYear: fy, students: [] });
      }
      map.get(label).students.push(row);
    }
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const fa = a[1].birthYear;
      const fb = b[1].birthYear;
      if (fa == null && fb == null) return a[0].localeCompare(b[0]);
      if (fa == null) return 1;
      if (fb == null) return -1;
      return fa - fb;
    });
    entries.forEach(([, g]) => {
      g.students.sort((x, y) => (x.name || '').localeCompare(y.name || '', 'ko'));
    });
    return entries;
  }, [list, withdrawnSet]);

  const filteredList = useMemo(() => {
    const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
    if (!normalizedQuery) return list;
    return list.filter((row) => {
      const haystack = [
        row.name,
        row.school,
        row.grade,
        formatHomeworkClassDisplayList(row.className),
        row.studentPhone,
        row.parentPhone,
      ]
        .map((item) => String(item || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedQuery);
    });
  }, [list, searchQuery]);

  const withdrawnCount = useMemo(
    () => filteredList.filter((r) => withdrawnSet.has(r.name)).length,
    [filteredList, withdrawnSet]
  );

  const selectedScoreRecord = useMemo(() => {
    if (!historyStudent) return { schoolExamScores: {}, mockExamScores: {}, trendNote: '' };
    return scoreRecords[historyStudent] || { schoolExamScores: {}, mockExamScores: {}, trendNote: '' };
  }, [historyStudent, scoreRecords]);

  const visibleSchoolScoreSlots = useMemo(() => {
    if (scoreGradeFilter === 'all') return SCHOOL_SCORE_SLOTS;
    return SCHOOL_SCORE_SLOTS.filter((slot) => slot.grade === scoreGradeFilter);
  }, [scoreGradeFilter]);

  const visibleMockScoreSlots = useMemo(() => {
    return MOCK_SCORE_SLOTS.filter((slot) => {
      if (mockYearFilter !== 'all' && slot.year !== mockYearFilter) return false;
      if (mockGradeFilter !== 'all' && slot.grade !== mockGradeFilter) return false;
      return true;
    });
  }, [mockYearFilter, mockGradeFilter]);

  const updateStudentTrendNote = useCallback((studentName, value) => {
    setScoreRecords((prev) => ({
      ...prev,
      [studentName]: {
        ...(prev[studentName] || {}),
        schoolExamScores: prev[studentName]?.schoolExamScores || {},
        mockExamScores: prev[studentName]?.mockExamScores || {},
        trendNote: value,
      },
    }));
  }, []);

  const updateStudentScoreValue = useCallback((studentName, section, slotKey, subject, value) => {
    setScoreRecords((prev) => {
      const prevStudent = prev[studentName] || {};
      const targetKey = section === 'school' ? 'schoolExamScores' : 'mockExamScores';
      const targetSection = prevStudent[targetKey] || {};
      return {
        ...prev,
        [studentName]: {
          ...prevStudent,
          schoolExamScores: prevStudent.schoolExamScores || {},
          mockExamScores: prevStudent.mockExamScores || {},
          [targetKey]: {
            ...targetSection,
            [slotKey]: {
              ...(targetSection[slotKey] || {}),
              [subject]: value,
            },
          },
        },
      };
    });
  }, []);

  const saveStudentScores = useCallback(async (studentName) => {
    if (!studentName) return;
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }
    setSavingScoresFor(studentName);
    try {
      await setDoc(
        doc(db, STUDENT_SCORE_COLLECTION, STUDENT_SCORE_DOC_ID),
        {
          records: {
            ...scoreRecords,
            [studentName]: {
              ...(scoreRecords[studentName] || {}),
              lastUpdated: new Date().toISOString(),
            },
          },
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );
      alert(`✅ ${studentName} 성적이 저장되었습니다.`);
    } catch (e) {
      console.error('학생 성적 저장 실패:', e);
      const isPermission = e?.code === 'permission-denied' || String(e?.message || '').includes('permission');
      alert(
        isPermission
          ? '학생 성적 저장 권한이 아직 적용되지 않았습니다. Firestore 규칙 배포가 필요합니다.'
          : `학생 성적 저장에 실패했습니다. ${e?.message || ''}`.trim()
      );
    } finally {
      setSavingScoresFor(null);
    }
  }, [scoreRecords]);

  const selectedActivityRecord = useMemo(() => {
    if (!historyStudent) return { classEvents: [], payments: [], counseling: [] };
    return studentActivityRecords[historyStudent] || { classEvents: [], payments: [], counseling: [] };
  }, [historyStudent, studentActivityRecords]);

  const historyStudentRow = useMemo(
    () => list.find((item) => item.name === historyStudent) || null,
    [historyStudent, list]
  );

  const historyStudentCurrentClasses = useMemo(
    () => parseClassNames(historyStudentRow?.className || ''),
    [historyStudentRow]
  );

  const handleOpenStudentEdit = useCallback(() => {
    if (!historyStudentRow) return;
    setEditingStudentKey(historyStudent);
    setEditStudentForm(buildStudentFormFromRow(historyStudentRow));
  }, [historyStudent, historyStudentRow]);

  const handleCancelStudentEdit = useCallback(() => {
    setEditingStudentKey('');
    setEditStudentForm(createEmptyStudentForm());
  }, []);

  const handleSaveStudentEdit = useCallback(async () => {
    if (!historyStudent) return;
    const desiredName = String(editStudentForm.name || '').trim();
    if (!desiredName) {
      alert('학생 이름을 입력해주세요.');
      return;
    }
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }

    setSavingRoster(true);
    try {
      const phoneRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
      const backupRef = doc(db, BACKUP_PHONE_DOC, BACKUP_PHONE_DOC_ID);
      const scoreRef = doc(db, STUDENT_SCORE_COLLECTION, STUDENT_SCORE_DOC_ID);
      const activityRef = doc(db, STUDENT_ACTIVITY_COLLECTION, STUDENT_ACTIVITY_DOC_ID);
      const kakaoRef = doc(db, KAKAO_HISTORY_COLLECTION, KAKAO_HISTORY_DOC_ID);
      const dateDataRef = doc(db, HOMEWORK_DATE_DATA_COLLECTION, HOMEWORK_DATE_DATA_DOC_ID);
      const sendHistoryRef = doc(db, HOMEWORK_SEND_HISTORY_COLLECTION, HOMEWORK_SEND_HISTORY_DOC_ID);
      const sentCountsRef = doc(db, HOMEWORK_SENT_COUNTS_DOC, HOMEWORK_SENT_COUNTS_DOC_ID);

      const [phoneSnap, backupSnap, scoreSnap, activitySnap, kakaoSnap, dateDataSnap, sendHistorySnap, sentCountsSnap] =
        await Promise.all([
          getDoc(phoneRef),
          getDoc(backupRef),
          getDoc(scoreRef),
          getDoc(activityRef),
          getDoc(kakaoRef),
          getDoc(dateDataRef),
          getDoc(sendHistoryRef),
          getDoc(sentCountsRef),
        ]);

      const phoneData = phoneSnap.exists() ? phoneSnap.data() : {};
      const backupData = backupSnap.exists() ? backupSnap.data() : {};
      const existingStudents = Array.isArray(phoneData.students)
        ? phoneData.students.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const existingStudentInfo = phoneData.studentInfo && typeof phoneData.studentInfo === 'object' ? phoneData.studentInfo : {};
      const existingPhoneNumbers = normalizePhoneMap(phoneData.phoneNumbers || {});
      const existingClassHistory =
        phoneData.studentClassHistory && typeof phoneData.studentClassHistory === 'object' && !Array.isArray(phoneData.studentClassHistory)
          ? phoneData.studentClassHistory
          : {};
      const existingWithdrawnNames = normalizeWithdrawnNames(phoneData?.[WITHDRAWN_NAMES_FIELD]);
      const backupPhoneNumbers = normalizePhoneMap(backupData.phoneNumbers || {});

      const currentPhoneEntry = normalizePhoneEntry(existingPhoneNumbers[historyStudent] || {});
      const phoneDigitsForKey =
        normalizePhoneDigits(editStudentForm.studentPhone)
        || normalizePhoneDigits(editStudentForm.parentPhone)
        || normalizePhoneDigits(editStudentForm.parentPhone2)
        || normalizePhoneDigits(currentPhoneEntry.student)
        || normalizePhoneDigits(currentPhoneEntry.parent);

      const otherStudents = existingStudents.filter((key) => key !== historyStudent);
      const sameBaseStudents = otherStudents.filter((key) => getStudentBaseName(key) === desiredName);
      let nextStudentKey = desiredName;
      if (sameBaseStudents.length > 0) {
        if (!phoneDigitsForKey) {
          alert('같은 이름 학생이 이미 있습니다. 학생 또는 학부모 번호가 있어야 구분용 이름으로 저장할 수 있습니다.');
          return;
        }
        nextStudentKey = buildStudentKeyWithPhone(desiredName, phoneDigitsForKey, otherStudents);
      }
      if (nextStudentKey !== historyStudent && otherStudents.includes(nextStudentKey)) {
        alert('같은 이름 학생이 이미 있습니다. 이름 또는 전화번호를 다시 확인해주세요.');
        return;
      }

      const { normalizedBirthYear, normalizedGradeInput } = deriveAcademicFields({
        school: editStudentForm.school,
        birthYear: editStudentForm.birthYear,
        gradeInput: editStudentForm.gradeInput,
      });
      const prevStudentInfo = existingStudentInfo[historyStudent] || {};
      const prevPhoneEntry = normalizePhoneEntry(existingPhoneNumbers[historyStudent] || {});
      const backupPhoneEntry = normalizePhoneEntry(backupPhoneNumbers[historyStudent] || {});
      const hasRenamedStudent = nextStudentKey !== historyStudent;

      const nextStudents = [...new Set(existingStudents.map((name) => (name === historyStudent ? nextStudentKey : name)).filter(Boolean))];
      const nextStudentInfo = renameStudentKeyInObjectMap(existingStudentInfo, historyStudent, nextStudentKey);
      nextStudentInfo[nextStudentKey] = {
        ...(nextStudentInfo[nextStudentKey] || {}),
        ...prevStudentInfo,
        school: String(editStudentForm.school || '').trim(),
        birthYear: normalizedBirthYear,
        gradeOverride: normalizedGradeInput,
        grade: resolveStudentGrade({
          school: String(editStudentForm.school || '').trim(),
          birthYear: normalizedBirthYear,
          gradeOverride: normalizedGradeInput,
          grade: prevStudentInfo.grade,
        }),
      };

      const nextPhoneNumbers = renameStudentKeyInObjectMap(existingPhoneNumbers, historyStudent, nextStudentKey);
      nextPhoneNumbers[nextStudentKey] = normalizePhoneEntry({
        ...(nextPhoneNumbers[nextStudentKey] || {}),
        ...(prevPhoneEntry || {}),
        student: String(editStudentForm.studentPhone || '').trim(),
        parent: String(editStudentForm.parentPhone || '').trim(),
        parentPhoneNumber2: String(editStudentForm.parentPhone2 || '').trim(),
        핸드폰: String(editStudentForm.studentPhone || '').trim(),
        부모핸드폰: String(editStudentForm.parentPhone || '').trim(),
      });

      const nextBackupPhoneNumbers = renameStudentKeyInObjectMap(backupPhoneNumbers, historyStudent, nextStudentKey);
      nextBackupPhoneNumbers[nextStudentKey] = normalizePhoneEntry({
        ...(nextBackupPhoneNumbers[nextStudentKey] || {}),
        ...(backupPhoneEntry || {}),
        student: String(editStudentForm.studentPhone || '').trim(),
        parent: String(editStudentForm.parentPhone || '').trim(),
        parentPhoneNumber2: String(editStudentForm.parentPhone2 || '').trim(),
        핸드폰: String(editStudentForm.studentPhone || '').trim(),
        부모핸드폰: String(editStudentForm.parentPhone || '').trim(),
      });

      const nextStudentClassHistory = hasRenamedStudent
        ? renameStudentKeyInObjectMap(existingClassHistory, historyStudent, nextStudentKey)
        : existingClassHistory;
      const nextScoreRecords = hasRenamedStudent
        ? renameStudentKeyInObjectMap(
            scoreSnap.exists() && scoreSnap.data()?.records && typeof scoreSnap.data().records === 'object' ? scoreSnap.data().records : {},
            historyStudent,
            nextStudentKey
          )
        : null;
      const nextActivityRecords = hasRenamedStudent
        ? renameStudentKeyInObjectMap(
            normalizeStudentActivityRecords(activitySnap.exists() ? activitySnap.data()?.records : {}),
            historyStudent,
            nextStudentKey
          )
        : null;
      const nextKakaoEntries = hasRenamedStudent && Array.isArray(kakaoSnap.exists() ? kakaoSnap.data()?.entries : [])
        ? (kakaoSnap.data()?.entries || []).map((entry) =>
            entry && typeof entry === 'object' && entry.studentName === historyStudent
              ? { ...entry, studentName: nextStudentKey }
              : entry
          )
        : null;
      const nextDateCompletionData = hasRenamedStudent && dateDataSnap.exists()
        ? renameStudentInDateTree(dateDataSnap.data()?.completionData || {}, historyStudent, nextStudentKey)
        : null;
      const nextDateProgressData = hasRenamedStudent && dateDataSnap.exists()
        ? renameStudentInDateTree(dateDataSnap.data()?.progressData || {}, historyStudent, nextStudentKey)
        : null;
      const nextSendHistory = hasRenamedStudent && sendHistorySnap.exists()
        ? renameStudentInSendHistory(sendHistorySnap.data()?.history || {}, historyStudent, nextStudentKey)
        : null;
      const nextSentCounts = hasRenamedStudent && sentCountsSnap.exists()
        ? renameStudentInSentCounts(sentCountsSnap.data()?.counts || {}, historyStudent, nextStudentKey)
        : null;
      const nextWithdrawnNames = normalizeWithdrawnNames(
        existingWithdrawnNames.map((name) => (name === historyStudent ? nextStudentKey : name))
      );

      await Promise.all([
        setDoc(
          phoneRef,
          {
            students: nextStudents,
            studentInfo: nextStudentInfo,
            phoneNumbers: nextPhoneNumbers,
            studentClassHistory: nextStudentClassHistory,
            [WITHDRAWN_NAMES_FIELD]: nextWithdrawnNames,
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        ),
        setDoc(
          backupRef,
          {
            phoneNumbers: nextBackupPhoneNumbers,
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        ),
        hasRenamedStudent
          ? setDoc(
              scoreRef,
              {
                records: nextScoreRecords,
                lastUpdated: new Date().toISOString(),
              },
              { merge: true }
            )
          : Promise.resolve(),
        hasRenamedStudent
          ? setDoc(
              activityRef,
              {
                records: normalizeStudentActivityRecords(nextActivityRecords),
                lastUpdated: new Date().toISOString(),
              },
              { merge: true }
            )
          : Promise.resolve(),
        hasRenamedStudent
          ? setDoc(
              kakaoRef,
              {
                entries: nextKakaoEntries,
                lastUpdated: new Date().toISOString(),
              },
              { merge: true }
            )
          : Promise.resolve(),
        hasRenamedStudent && dateDataSnap.exists()
          ? setDoc(
              dateDataRef,
              {
                completionData: nextDateCompletionData,
                progressData: nextDateProgressData,
                lastUpdated: new Date().toISOString(),
              },
              { merge: true }
            )
          : Promise.resolve(),
        hasRenamedStudent && sendHistorySnap.exists()
          ? setDoc(
              sendHistoryRef,
              {
                history: nextSendHistory,
                lastUpdated: new Date().toISOString(),
              },
              { merge: true }
            )
          : Promise.resolve(),
        hasRenamedStudent && sentCountsSnap.exists()
          ? setDoc(
              sentCountsRef,
              {
                counts: nextSentCounts,
                lastUpdated: new Date().toISOString(),
              },
              { merge: true }
            )
          : Promise.resolve(),
      ]);

      saveWithdrawnNames(nextWithdrawnNames);
      setWithdrawnSet(new Set(nextWithdrawnNames));
      await Promise.all([loadAllStudents(), loadKakaoHistory(), loadScoreRecords(), loadStudentActivityRecords()]);
      setHistoryStudent(nextStudentKey);
      handleCancelStudentEdit();
      alert('학생 정보 수정이 완료되었습니다.');
    } catch (e) {
      console.error('학생 정보 수정 실패:', e);
      alert(`학생 정보 수정에 실패했습니다. ${e?.message || ''}`.trim());
    } finally {
      setSavingRoster(false);
    }
  }, [
    historyStudent,
    editStudentForm,
    db,
    loadAllStudents,
    loadKakaoHistory,
    loadScoreRecords,
    loadStudentActivityRecords,
    handleCancelStudentEdit,
  ]);

  const saveStudentActivityRecords = useCallback(async (nextRecords) => {
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return false;
    }
    setSavingActivity(true);
    try {
      const normalized = normalizeStudentActivityRecords(nextRecords);
      await setDoc(
        doc(db, STUDENT_ACTIVITY_COLLECTION, STUDENT_ACTIVITY_DOC_ID),
        {
          records: normalized,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );
      setStudentActivityRecords(normalized);
      return true;
    } catch (e) {
      console.error('학생 활동 이력 저장 실패:', e);
      alert(`학생 활동 이력 저장에 실패했습니다. ${e?.message || ''}`.trim());
      return false;
    } finally {
      setSavingActivity(false);
    }
  }, []);

  const handleRegisterClassForStudent = useCallback(async () => {
    if (!historyStudent) return;
    const targetClassName = String(classAssignmentForm.className || '').trim();
    if (!targetClassName) {
      alert('등록할 반을 선택해주세요.');
      return;
    }
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }
    if (historyStudentCurrentClasses.includes(targetClassName)) {
      alert('이미 등록된 반입니다.');
      return;
    }

    try {
      const phoneRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
      const snap = await getDoc(phoneRef);
      const existing = snap.exists() ? snap.data() : {};
      const existingStudentInfo = existing.studentInfo && typeof existing.studentInfo === 'object' ? existing.studentInfo : {};
      const nextStudentInfo = {
        ...existingStudentInfo,
        [historyStudent]: {
          ...(existingStudentInfo[historyStudent] || {}),
          className: joinClassNames([...(parseClassNames(existingStudentInfo[historyStudent]?.className || '')), targetClassName]),
        },
      };
      await setDoc(phoneRef, {
        studentInfo: nextStudentInfo,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });

      const nextRecords = normalizeStudentActivityRecords(studentActivityRecords);
      const current = nextRecords[historyStudent] || { classEvents: [], payments: [], counseling: [] };
      nextRecords[historyStudent] = {
        ...current,
        classEvents: [
          ...current.classEvents,
          {
            id: buildActivityRecordId('classreg'),
            type: 'register',
            className: targetClassName,
            note: String(classAssignmentForm.note || '').trim(),
            timestamp: new Date().toISOString(),
          },
        ],
      };
      const ok = await saveStudentActivityRecords(nextRecords);
      if (!ok) return;
      await loadAllStudents();
      setClassAssignmentForm({ className: '', note: '' });
      alert('반 등록이 완료되었습니다.');
    } catch (e) {
      console.error('학생 반 등록 실패:', e);
      alert(`반 등록에 실패했습니다. ${e?.message || ''}`.trim());
    }
  }, [historyStudent, classAssignmentForm, historyStudentCurrentClasses, studentActivityRecords, saveStudentActivityRecords, loadAllStudents]);

  const handleWithdrawClassForStudent = useCallback(async (className) => {
    if (!historyStudent || !className) return;
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }
    if (!window.confirm(`${formatHomeworkClassDisplay(className)} 반에서 퇴원 처리할까요?`)) return;

    try {
      const phoneRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
      const snap = await getDoc(phoneRef);
      const existing = snap.exists() ? snap.data() : {};
      const existingStudentInfo = existing.studentInfo && typeof existing.studentInfo === 'object' ? existing.studentInfo : {};
      const existingClassHistory =
        existing.studentClassHistory && typeof existing.studentClassHistory === 'object' && !Array.isArray(existing.studentClassHistory)
          ? existing.studentClassHistory
          : {};

      const currentClassName = existingStudentInfo[historyStudent]?.className || '';
      const nextStudentInfo = {
        ...existingStudentInfo,
        [historyStudent]: {
          ...(existingStudentInfo[historyStudent] || {}),
          className: parseClassNames(currentClassName).filter((item) => item !== className).join(','),
        },
      };
      const nextHistory = {
        ...existingClassHistory,
        [historyStudent]: [
          ...(Array.isArray(existingClassHistory[historyStudent]) ? existingClassHistory[historyStudent] : []),
          { className, removedAt: new Date().toISOString() },
        ],
      };

      await setDoc(phoneRef, {
        studentInfo: nextStudentInfo,
        studentClassHistory: nextHistory,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });

      const nextRecords = normalizeStudentActivityRecords(studentActivityRecords);
      const current = nextRecords[historyStudent] || { classEvents: [], payments: [], counseling: [] };
      nextRecords[historyStudent] = {
        ...current,
        classEvents: [
          ...current.classEvents,
          {
            id: buildActivityRecordId('classout'),
            type: 'withdraw',
            className,
            note: '학생 데이터에서 퇴원 처리',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      const ok = await saveStudentActivityRecords(nextRecords);
      if (!ok) return;
      await loadAllStudents();
      setStudentClassHistoryMap((prev) => ({
        ...prev,
        [historyStudent]: nextHistory[historyStudent],
      }));
      alert('퇴원 처리가 완료되었습니다.');
    } catch (e) {
      console.error('학생 반 퇴원 실패:', e);
      alert(`퇴원 처리에 실패했습니다. ${e?.message || ''}`.trim());
    }
  }, [historyStudent, studentActivityRecords, saveStudentActivityRecords, loadAllStudents]);

  const handleAddPaymentRecord = useCallback(async () => {
    if (!historyStudent) return;
    const amount = String(paymentForm.amount || '').trim();
    if (!amount) {
      alert('결제 금액을 입력해주세요.');
      return;
    }
    const nextRecords = normalizeStudentActivityRecords(studentActivityRecords);
    const current = nextRecords[historyStudent] || { classEvents: [], payments: [], counseling: [] };
    nextRecords[historyStudent] = {
      ...current,
      payments: [
        ...current.payments,
        {
          id: buildActivityRecordId('payment'),
          date: String(paymentForm.date || getTodayDateText()).trim(),
          amount,
          method: String(paymentForm.method || '').trim(),
          note: String(paymentForm.note || '').trim(),
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const ok = await saveStudentActivityRecords(nextRecords);
    if (!ok) return;
    setPaymentForm({ date: getTodayDateText(), amount: '', method: '', note: '' });
    alert('결제 내역이 저장되었습니다.');
  }, [historyStudent, paymentForm, studentActivityRecords, saveStudentActivityRecords]);

  const handleAddCounselRecord = useCallback(async () => {
    if (!historyStudent) return;
    const note = String(counselForm.note || '').trim();
    if (!note) {
      alert('상담 내용을 입력해주세요.');
      return;
    }
    const nextRecords = normalizeStudentActivityRecords(studentActivityRecords);
    const current = nextRecords[historyStudent] || { classEvents: [], payments: [], counseling: [] };
    nextRecords[historyStudent] = {
      ...current,
      counseling: [
        ...current.counseling,
        {
          id: buildActivityRecordId('counsel'),
          date: String(counselForm.date || getTodayDateText()).trim(),
          category: String(counselForm.category || '').trim(),
          note,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const ok = await saveStudentActivityRecords(nextRecords);
    if (!ok) return;
    setCounselForm({ date: getTodayDateText(), category: '', note: '' });
    alert('상담 내역이 저장되었습니다.');
  }, [historyStudent, counselForm, studentActivityRecords, saveStudentActivityRecords]);

  const historyStudentPastClasses = useMemo(() => {
    if (!historyStudent) return [];
    const raw = studentClassHistoryMap[historyStudent];
    const arr = Array.isArray(raw) ? [...raw] : [];
    arr.sort((a, b) => String(b.removedAt || '').localeCompare(String(a.removedAt || '')));
    return arr;
  }, [historyStudent, studentClassHistoryMap]);

  const historyStudentClassTimeline = useMemo(() => {
    const manualEvents = (selectedActivityRecord.classEvents || []).map((entry) => ({
      id: entry.id || buildActivityRecordId('class'),
      type: entry.type || 'register',
      className: entry.className || '',
      note: entry.note || '',
      timestamp: entry.timestamp || entry.date || '',
      source: 'manual',
    }));
    const removedEvents = historyStudentPastClasses.map((entry, index) => ({
      id: `removed_${entry.className || 'class'}_${entry.removedAt || index}`,
      type: 'withdraw',
      className: entry.className || '',
      note: '반 삭제로 자동 기록',
      timestamp: entry.removedAt || '',
      source: 'system',
    }));
    return [...manualEvents, ...removedEvents].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  }, [selectedActivityRecord.classEvents, historyStudentPastClasses]);

  useEffect(() => {
    if (!historyStudent) return;
    const rawGrade = String(historyStudentRow?.grade || '').replace(/\s+/g, '');
    if (SCHOOL_GRADES.includes(rawGrade)) {
      setScoreGradeFilter(rawGrade);
    }
    if (MOCK_GRADES.includes(rawGrade)) {
      setMockGradeFilter(rawGrade);
    }
  }, [historyStudent, historyStudentRow]);

  useEffect(() => {
    if (!historyStudent) return;
    setClassAssignmentForm({ className: '', note: '' });
    setPaymentForm({ date: getTodayDateText(), amount: '', method: '', note: '' });
    setCounselForm({ date: getTodayDateText(), category: '', note: '' });
  }, [historyStudent]);

  useEffect(() => {
    if (historyStudent) return;
    handleCancelStudentEdit();
  }, [historyStudent, handleCancelStudentEdit]);

  useEffect(() => {
    if (!historyStudent || !isFirebaseConfigured() || !db) {
      setStudentMessageHistory([]);
      setSelectedMessageHistoryId('');
      return;
    }

    let active = true;
    const loadStudentMessageHistory = async () => {
      setStudentMessageHistoryLoading(true);
      try {
        const [
          studentDataHistorySnap,
          homeworkCompletionHistorySnap,
          englishHomeworkSnaps,
          mathHomeworkSnaps,
          ...clinicHistorySnaps
        ] = await Promise.all([
          getDoc(doc(db, KAKAO_HISTORY_COLLECTION, KAKAO_HISTORY_DOC_ID)),
          getDoc(doc(db, HOMEWORK_SEND_HISTORY_COLLECTION, HOMEWORK_SEND_HISTORY_DOC_ID)),
          getDocs(collection(db, ENGLISH_HOMEWORK_PROGRESS_COLLECTION)),
          getDocs(collection(db, MATH_HOMEWORK_PROGRESS_COLLECTION)),
          ...CLINIC_KAKAO_HISTORY_COLLECTIONS.map(({ collectionName }) => getDocs(collection(db, collectionName))),
        ]);

        const nextEntries = [];

        const studentDataEntries = Array.isArray(studentDataHistorySnap.data()?.entries) ? studentDataHistorySnap.data().entries : [];
        studentDataEntries.forEach((entry, index) => {
          if (!studentNamesLikelyMatch(historyStudent, entry?.studentName)) return;
          nextEntries.push({
            id: `student-data-${entry?.timestamp || entry?.date || index}`,
            sentAt: String(entry?.timestamp || entry?.date || '').trim(),
            sourceLabel: '학생 데이터',
            sourceDetail: '개별 발송',
            content: String(entry?.message || '').trim(),
          });
        });

        const homeworkHistory = homeworkCompletionHistorySnap.data()?.history || {};
        Object.entries(homeworkHistory).forEach(([date, items]) => {
          (Array.isArray(items) ? items : []).forEach((entry, index) => {
            if (!historyEntryTargetsStudent(entry?.학생명, historyStudent)) return;
            nextEntries.push({
              id: `homework-completion-${date}-${index}`,
              sentAt: String(entry?.시간 || date || '').trim(),
              sourceLabel: '숙제 과제 완료도',
              sourceDetail: `${entry?.타입 || '카톡'}${entry?.반명 ? ` · ${entry.반명}` : ''}`,
              content: buildHomeworkCompletionHistoryContent(entry),
            });
          });
        });

        const appendHomeworkDashboardEntries = (snapshot, sourceLabel) => {
          snapshot.forEach((docSnap) => {
            const entries = Array.isArray(docSnap.data()?.kakaoSendHistory) ? docSnap.data().kakaoSendHistory : [];
            entries.forEach((entry, index) => {
              if (!studentNamesLikelyMatch(historyStudent, entry?.student)) return;
              nextEntries.push({
                id: `${sourceLabel}-${docSnap.id}-${entry?.id || index}`,
                sentAt: String(entry?.sentAt || '').trim(),
                sourceLabel,
                sourceDetail: String(entry?.title || docSnap.id || '').trim(),
                content: String(entry?.content || '').trim(),
              });
            });
          });
        };

        appendHomeworkDashboardEntries(englishHomeworkSnaps, '영어 과제 관리');
        appendHomeworkDashboardEntries(mathHomeworkSnaps, '수학 과제 관리');

        clinicHistorySnaps.forEach((snapshot, snapshotIndex) => {
          const sourceLabel = CLINIC_KAKAO_HISTORY_COLLECTIONS[snapshotIndex]?.sourceLabel || '클리닉';
          snapshot.forEach((docSnap) => {
            const history = docSnap.data()?.history || {};
            Object.entries(history).forEach(([studentName, entries]) => {
              if (!studentNamesLikelyMatch(historyStudent, studentName)) return;
              (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
                nextEntries.push({
                  id: `${sourceLabel}-${docSnap.id}-${index}`,
                  sentAt: String(entry?.date || '').trim(),
                  sourceLabel,
                  sourceDetail: String(entry?.weekLabel || docSnap.id || '').trim(),
                  content: String(entry?.content || '').trim(),
                });
              });
            });
          });
        });

        nextEntries.sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
        if (!active) return;
        setStudentMessageHistory(nextEntries);
        setSelectedMessageHistoryId((prev) => (prev && nextEntries.some((entry) => entry.id === prev) ? prev : nextEntries[0]?.id || ''));
      } catch (error) {
        console.warn('학생별 통합 카톡 이력 로드 실패:', error);
        if (!active) return;
        setStudentMessageHistory([]);
        setSelectedMessageHistoryId('');
      } finally {
        if (active) setStudentMessageHistoryLoading(false);
      }
    };

    loadStudentMessageHistory();
    return () => {
      active = false;
    };
  }, [historyStudent]);

  const selectedMessageHistoryEntry = useMemo(
    () => studentMessageHistory.find((entry) => entry.id === selectedMessageHistoryId) || null,
    [studentMessageHistory, selectedMessageHistoryId]
  );

  return (
    <div
      className={fullScreen ? 'student-data-page-shell' : 'student-data-modal-overlay'}
      onClick={fullScreen ? undefined : onClose}
    >
      <div
        className={fullScreen ? 'student-data-modal student-data-modal-fullscreen' : 'student-data-modal'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="student-data-modal-header">
          <h2>👥 학생 데이터</h2>
          <button type="button" className="student-data-modal-close" onClick={onClose}>
            {fullScreen ? '메인 메뉴로' : '닫기'}
          </button>
        </div>
        {loading ? (
          <p className="student-data-loading">불러오는 중...</p>
        ) : (
          <>
            <div style={{ marginBottom: '16px', padding: '18px', borderRadius: '12px', background: '#f8fafc', border: '2px solid #dbeafe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: '700', color: '#1e3a8a', marginBottom: '4px' }}>학생 신규 등록</div>
                  <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                    새 학생은 여기서 상세 등록하고, 숙제 과제 완료도에서는 등록된 학생만 반으로 불러와 사용합니다.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRegisterForm((prev) => !prev)}
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    background: showRegisterForm ? '#ef4444' : '#2563eb',
                    color: '#fff',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  {showRegisterForm ? '닫기' : '학생 신규 등록 열기'}
                </button>
              </div>
              {showRegisterForm && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <input type="text" value={registryForm.name} onChange={(e) => setRegistryForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="학생 이름 *" className="student-data-phone-input" />
                    <select value={registryForm.school} onChange={(e) => setRegistryForm((prev) => ({ ...prev, school: e.target.value }))} className="student-data-phone-input">
                      <option value="">학교 선택</option>
                      {STUDENT_SCHOOL_OPTIONS.map((school) => (
                        <option key={school} value={school}>{school}</option>
                      ))}
                    </select>
                    <input type="text" value={registryForm.birthYear} onChange={(e) => setRegistryForm((prev) => ({ ...prev, birthYear: e.target.value }))} placeholder="년생 (예: 08년생)" className="student-data-phone-input" />
                    <input type="text" value={registryForm.gradeInput} onChange={(e) => setRegistryForm((prev) => ({ ...prev, gradeInput: e.target.value }))} placeholder="학년 (예: 고2, 중3, 2학년)" className="student-data-phone-input" />
                    <input type="text" value={registryForm.studentPhone} onChange={(e) => setRegistryForm((prev) => ({ ...prev, studentPhone: e.target.value }))} placeholder="학생 전화번호" className="student-data-phone-input" />
                    <input type="text" value={registryForm.parentPhone} onChange={(e) => setRegistryForm((prev) => ({ ...prev, parentPhone: e.target.value }))} placeholder="학부모 전화번호" className="student-data-phone-input" />
                    <input type="text" value={registryForm.parentPhone2} onChange={(e) => setRegistryForm((prev) => ({ ...prev, parentPhone2: e.target.value }))} placeholder="학부모 전화번호 2" className="student-data-phone-input" />
                  </div>
                  <div style={{ marginTop: '10px', color: '#64748b', fontSize: '0.85rem' }}>
                    자동 년생: <strong>{deriveAcademicFields({ school: registryForm.school, birthYear: registryForm.birthYear, gradeInput: registryForm.gradeInput }).normalizedBirthYear || '년생 또는 학년 입력 시 자동 계산'}</strong>
                    {' · '}
                    표시 학년: <strong>{deriveAcademicFields({ school: registryForm.school, birthYear: registryForm.birthYear, gradeInput: registryForm.gradeInput }).displayGrade || '학교/년생/학년 입력 시 자동 계산'}</strong>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#334155' }}>수강 반 / 과목</label>
                    <input
                      type="text"
                      value={registryForm.classNameText}
                      onChange={(e) => setRegistryForm((prev) => ({ ...prev, classNameText: e.target.value }))}
                      placeholder="쉼표(,)로 여러 반 입력 가능"
                      className="student-data-phone-input"
                    />
                    {availableClassOptions.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {availableClassOptions.map((className) => (
                          <button
                            key={className}
                            type="button"
                            onClick={() => appendClassToRegistryForm(className)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '999px',
                              border: '1px solid #93c5fd',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                            }}
                          >
                            {formatHomeworkClassDisplay(className)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: '14px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={handleRegisterStudent}
                      disabled={savingRoster || !registryForm.name.trim()}
                      style={{
                        padding: '10px 18px',
                        border: 'none',
                        borderRadius: '8px',
                        background: savingRoster || !registryForm.name.trim() ? '#9ca3af' : '#7c3aed',
                        color: '#fff',
                        fontWeight: '700',
                        cursor: savingRoster || !registryForm.name.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {savingRoster ? '저장 중…' : '학생 신규 등록'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="student-data-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={studentDataTab === 'list'}
                className={`student-data-tab ${studentDataTab === 'list' ? 'student-data-tab-active' : ''}`}
                onClick={() => setStudentDataTab('list')}
              >
                전체 명단
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={studentDataTab === 'withdrawnByYear'}
                className={`student-data-tab ${studentDataTab === 'withdrawnByYear' ? 'student-data-tab-active' : ''}`}
                onClick={() => setStudentDataTab('withdrawnByYear')}
              >
                퇴원생 (학년 기준 출생연도){withdrawnCount > 0 ? ` · ${withdrawnCount}명` : ''}
              </button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="학생 검색: 이름, 학교, 학년, 반, 전화번호"
                className="student-data-phone-input"
                style={{ width: '100%', maxWidth: '520px' }}
              />
            </div>

            {studentDataTab === 'list' ? (
              <>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 10px 0' }}>
              <strong>반</strong> 열은 숙제 과제 완료도(Firestore)에 등록된 반명만 표시합니다. 완료도에 없는 학생만 영어 클리닉 대장의 반명이 쓰입니다.
            </p>
            <div className="student-data-table-wrap">
              <table className="student-data-table">
                <thead>
                  <tr>
                    <th>번호</th>
                    <th>이름</th>
                    <th>학교</th>
                    <th>학년</th>
                    <th>반/과목</th>
                    <th>연락처 (학생/학부모)</th>
                    <th>구분</th>
                    <th>퇴원 처리</th>
                    <th>카톡 보내기</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((row, idx) => (
                    <tr key={row.name} className={withdrawnSet.has(row.name) ? 'student-data-row-withdrawn' : ''}>
                      <td>{idx + 1}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setHistoryStudent(row.name)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontWeight: '700',
                            color: '#1d4ed8',
                            textDecoration: 'underline',
                            fontSize: 'inherit',
                          }}
                        >
                          {row.name || '(이름 없음)'}
                        </button>
                      </td>
                      <td>{row.school || '-'}</td>
                      <td>{row.grade || '-'}</td>
                      <td style={{ minWidth: '180px' }}>
                        {getHomeworkClassDisplayRows(row.className).length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {getHomeworkClassDisplayRows(row.className).map((classLabel) => (
                              <div key={`${row.name}-${classLabel}`}>{classLabel}</div>
                            ))}
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ minWidth: '140px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <input
                            type="text"
                            value={row.studentPhone || ''}
                            onChange={(e) => updatePhoneInList(row.name, 'studentPhone', e.target.value)}
                            placeholder="학생 010-0000-0000"
                            className="student-data-phone-input"
                          />
                          <input
                            type="text"
                            value={row.parentPhone || ''}
                            onChange={(e) => updatePhoneInList(row.name, 'parentPhone', e.target.value)}
                            placeholder="학부모 010-0000-0000"
                            className="student-data-phone-input"
                          />
                          <input
                            type="text"
                            value={row.parentPhone2 || ''}
                            onChange={(e) => updatePhoneInList(row.name, 'parentPhone2', e.target.value)}
                            placeholder="학부모2 010-0000-0000"
                            className="student-data-phone-input"
                          />
                        </div>
                      </td>
                      <td>{withdrawnSet.has(row.name) ? '퇴원생' : '재원생'}</td>
                      <td>
                        <button
                          type="button"
                          className="student-data-toggle-withdrawn"
                          onClick={() => toggleWithdrawn(row.name)}
                        >
                          {withdrawnSet.has(row.name) ? '재원 전환' : '퇴원 처리'}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={sendingKakaoFor === row.name}
                          onClick={() => sendKakaoToStudent(row)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.85rem',
                            backgroundColor: sendingKakaoFor === row.name ? '#9ca3af' : '#FEE500',
                            color: '#000',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: sendingKakaoFor === row.name ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                          }}
                        >
                          {sendingKakaoFor === row.name ? '발송 중…' : '카톡 보내기'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            ) : (
              <div className="student-data-withdrawn-by-year">
                <p className="student-data-withdrawn-by-year-hint">
                  퇴원 처리된 학생만 표시합니다. 내부에 저장된 <strong>년생</strong>이 있으면 그 값을 우선 쓰고,
                  없으면 표에 적힌 <strong>학년</strong>과 <strong>올해 연도({new Date().getFullYear()}년)</strong>를 기준으로 출생연도를 계산합니다.
                  예외 학생은 신규 등록 때 <strong>학년 예외 입력</strong>으로 따로 지정할 수 있습니다.
                </p>
                {withdrawnCount === 0 ? (
                  <p className="student-data-withdrawn-empty">퇴원생이 없습니다. 전체 명단에서 「퇴원 처리」를 하면 여기에 모입니다.</p>
                ) : (
                  <div className="student-data-withdrawn-sections">
                    {withdrawnByBirthYear.map(([label, group]) => (
                      <section key={label} className="student-data-year-section">
                        <h3 className="student-data-year-section-title">
                          {label}
                          <span className="student-data-year-section-count">({group.students.length}명)</span>
                          {group.birthYear != null && (
                            <span className="student-data-year-section-meta"> · 출생 {group.birthYear}년</span>
                          )}
                        </h3>
                        <ul className="student-data-year-student-list">
                          {group.students.map((row) => (
                            <li key={row.name} className="student-data-year-student-item">
                              <span className="student-data-year-name">{row.name}</span>
                              <span className="student-data-year-meta">
                                {[row.school, row.grade]
                                  .map((s) => (s != null && String(s).trim() !== '' ? String(s).trim() : null))
                                  .filter(Boolean)
                                  .join(' · ') || '-'}
                                {getHomeworkClassDisplayRows(row.className).length > 0 && (
                                  <span style={{ display: 'block', marginTop: '4px' }}>
                                    {getHomeworkClassDisplayRows(row.className).map((classLabel) => (
                                      <span key={`${row.name}-withdrawn-${classLabel}`} style={{ display: 'block' }}>
                                        {classLabel}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={savePhonesToFirebase}
                disabled={savingPhones || list.length === 0}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.9rem',
                  backgroundColor: savingPhones || list.length === 0 ? '#9ca3af' : '#9b59b6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: savingPhones || list.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                }}
              >
                {savingPhones ? '저장 중…' : '전화번호 저장 (숙제 완료도 반영)'}
              </button>
            </div>
            <div className="student-data-message-section">
              <label className="student-data-message-label">개별 카톡 발송</label>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
                메시지를 입력한 뒤, <strong>전체 명단</strong> 탭에서 해당 학생 행의 「카톡 보내기」 버튼을 누르면 해당 학생·학부모 번호로 발송됩니다.
              </p>
              <textarea
                className="student-data-message-input"
                placeholder="보낼 메시지 내용을 입력하세요 (아래에서 학생별로 카톡 보내기 버튼 클릭)"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
              />
            </div>

            {/* 학생별 카톡 발송 이력 모달 */}
            {historyStudent && (
              <div
                className="student-data-modal-overlay"
                style={{ position: 'fixed', zIndex: 10001 }}
                onClick={() => setHistoryStudent(null)}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '1200px',
                    width: '94%',
                    maxHeight: '88vh',
                    overflow: 'auto',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📋 {historyStudent}</h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleOpenStudentEdit}
                        style={{
                          padding: '6px 12px',
                          background: '#2563eb',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '600',
                        }}
                      >
                        학생 정보 수정
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryStudent(null)}
                        style={{
                          padding: '6px 12px',
                          background: '#6b7280',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '600',
                        }}
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                  <div className="student-score-modal-grid">
                    <div className="student-score-side-card">
                      {editingStudentKey === historyStudent && (
                        <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                          <div style={{ fontWeight: '700', color: '#1d4ed8', marginBottom: '10px', fontSize: '0.95rem' }}>
                            ✏️ 학생 기본 정보 수정
                          </div>
                          <div style={{ display: 'grid', gap: '8px' }}>
                            <input
                              type="text"
                              value={editStudentForm.name}
                              onChange={(e) => setEditStudentForm((prev) => ({ ...prev, name: e.target.value }))}
                              placeholder="학생 이름"
                              className="student-data-phone-input"
                            />
                            <select
                              value={editStudentForm.school}
                              onChange={(e) => setEditStudentForm((prev) => ({ ...prev, school: e.target.value }))}
                              className="student-data-phone-input"
                            >
                              <option value="">학교 선택</option>
                              {STUDENT_SCHOOL_OPTIONS.map((school) => (
                                <option key={school} value={school}>{school}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editStudentForm.birthYear}
                              onChange={(e) => setEditStudentForm((prev) => ({ ...prev, birthYear: e.target.value }))}
                              placeholder="년생"
                              className="student-data-phone-input"
                            />
                            <input
                              type="text"
                              value={editStudentForm.gradeInput}
                              onChange={(e) => setEditStudentForm((prev) => ({ ...prev, gradeInput: e.target.value }))}
                              placeholder="학년 (예: 고2)"
                              className="student-data-phone-input"
                            />
                            <input
                              type="text"
                              value={editStudentForm.studentPhone}
                              onChange={(e) => setEditStudentForm((prev) => ({ ...prev, studentPhone: e.target.value }))}
                              placeholder="학생 전화번호"
                              className="student-data-phone-input"
                            />
                            <input
                              type="text"
                              value={editStudentForm.parentPhone}
                              onChange={(e) => setEditStudentForm((prev) => ({ ...prev, parentPhone: e.target.value }))}
                              placeholder="학부모 전화번호"
                              className="student-data-phone-input"
                            />
                            <input
                              type="text"
                              value={editStudentForm.parentPhone2}
                              onChange={(e) => setEditStudentForm((prev) => ({ ...prev, parentPhone2: e.target.value }))}
                              placeholder="학부모 전화번호 2"
                              className="student-data-phone-input"
                            />
                          </div>
                          <div style={{ marginTop: '10px', color: '#475569', fontSize: '0.85rem' }}>
                            자동 년생: <strong>{deriveAcademicFields({ school: editStudentForm.school, birthYear: editStudentForm.birthYear, gradeInput: editStudentForm.gradeInput }).normalizedBirthYear || '년생 또는 학년 입력 시 자동 계산'}</strong>
                            {' · '}
                            표시 학년: <strong>{deriveAcademicFields({ school: editStudentForm.school, birthYear: editStudentForm.birthYear, gradeInput: editStudentForm.gradeInput }).displayGrade || '학교/년생/학년 입력 시 자동 계산'}</strong>
                          </div>
                          <div style={{ marginTop: '10px', color: '#64748b', fontSize: '0.82rem', lineHeight: 1.5 }}>
                            반 변경은 아래의 <strong>반 관리</strong>에서 계속 해주세요. 여기서 저장하면 학생 정보와 연결된 이력 이름도 함께 바뀝니다.
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              disabled={savingRoster || !editStudentForm.name.trim()}
                              onClick={handleSaveStudentEdit}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: savingRoster || !editStudentForm.name.trim() ? '#cbd5e1' : '#2563eb',
                                color: '#fff',
                                fontWeight: '700',
                                cursor: savingRoster || !editStudentForm.name.trim() ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {savingRoster ? '저장 중…' : '수정 저장'}
                            </button>
                            <button
                              type="button"
                              disabled={savingRoster}
                              onClick={handleCancelStudentEdit}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: '#fff',
                                color: '#334155',
                                fontWeight: '700',
                                cursor: savingRoster ? 'not-allowed' : 'pointer',
                              }}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )}
                      <div style={{ fontWeight: '700', color: '#1e40af', marginBottom: '10px', fontSize: '0.95rem' }}>
                        🎓 현재 수강 반 / 반 관리
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {historyStudentCurrentClasses.length === 0 ? (
                          <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.9rem' }}>현재 등록된 반이 없습니다.</p>
                        ) : (
                          historyStudentCurrentClasses.map((className) => (
                            <div
                              key={`${historyStudent}-current-${className}`}
                              style={{
                                padding: '10px',
                                borderRadius: '10px',
                                border: '1px solid #dbeafe',
                                background: '#eff6ff',
                              }}
                            >
                              <div style={{ fontWeight: '600', color: '#1e3a8a' }}>{formatHomeworkClassDisplay(className)}</div>
                              <button
                                type="button"
                                disabled={savingActivity}
                                onClick={() => handleWithdrawClassForStudent(className)}
                                style={{
                                  marginTop: '8px',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  background: savingActivity ? '#cbd5e1' : '#ef4444',
                                  color: '#fff',
                                  fontWeight: '700',
                                  cursor: savingActivity ? 'not-allowed' : 'pointer',
                                }}
                              >
                                반 퇴원
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ fontWeight: '700', color: '#374151', marginBottom: '8px', fontSize: '0.92rem' }}>반 등록</div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <select
                            value={classAssignmentForm.className}
                            onChange={(e) => setClassAssignmentForm((prev) => ({ ...prev, className: e.target.value }))}
                            className="student-data-phone-input"
                          >
                            <option value="">등록할 반 선택</option>
                            {availableClassOptions
                              .filter((className) => !historyStudentCurrentClasses.includes(className))
                              .map((className) => (
                                <option key={className} value={className}>{formatHomeworkClassDisplay(className)}</option>
                              ))}
                          </select>
                          <input
                            type="text"
                            value={classAssignmentForm.note}
                            onChange={(e) => setClassAssignmentForm((prev) => ({ ...prev, note: e.target.value }))}
                            className="student-data-phone-input"
                            placeholder="등록 메모 (선택)"
                          />
                          <button
                            type="button"
                            disabled={savingActivity || !classAssignmentForm.className}
                            onClick={handleRegisterClassForStudent}
                            style={{
                              padding: '9px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              background: savingActivity || !classAssignmentForm.className ? '#cbd5e1' : '#2563eb',
                              color: '#fff',
                              fontWeight: '700',
                              cursor: savingActivity || !classAssignmentForm.className ? 'not-allowed' : 'pointer',
                            }}
                          >
                            반 등록
                          </button>
                        </div>
                      </div>

                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ fontWeight: '700', color: '#374151', marginBottom: '8px', fontSize: '0.92rem' }}>반 등록 / 퇴원 이력</div>
                        {historyStudentClassTimeline.length === 0 ? (
                          <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.9rem' }}>기록된 반 변동 이력이 없습니다.</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {historyStudentClassTimeline.map((entry) => (
                              <li key={entry.id} style={{ marginBottom: '10px', fontSize: '0.88rem' }}>
                                <div style={{ fontWeight: '600', color: entry.type === 'withdraw' ? '#b91c1c' : '#065f46' }}>
                                  {entry.type === 'withdraw' ? '퇴원' : '반 등록'} · {formatHomeworkClassDisplay(entry.className)}
                                </div>
                                {entry.note ? (
                                  <div style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: '2px', whiteSpace: 'pre-wrap' }}>
                                    {entry.note}
                                  </div>
                                ) : null}
                                {entry.timestamp ? (
                                  <div style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: '4px' }}>
                                    {String(entry.timestamp).slice(0, 19).replace('T', ' ')}
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="student-score-main-card">
                      <div className="student-score-section">
                        <div className="student-score-title" style={{ fontSize: '1rem' }}>💳 결제 내역</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                          <input type="date" className="student-score-input" value={paymentForm.date} onChange={(e) => setPaymentForm((prev) => ({ ...prev, date: e.target.value }))} />
                          <input type="text" className="student-score-input" value={paymentForm.amount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="금액" />
                          <input type="text" className="student-score-input" value={paymentForm.method} onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))} placeholder="결제 수단" />
                          <input type="text" className="student-score-input" value={paymentForm.note} onChange={(e) => setPaymentForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="메모" />
                        </div>
                        <button
                          type="button"
                          disabled={savingActivity}
                          onClick={handleAddPaymentRecord}
                          className="student-score-save-btn"
                          style={{ marginBottom: '12px' }}
                        >
                          {savingActivity ? '저장 중…' : '결제 내역 저장'}
                        </button>
                        {(selectedActivityRecord.payments || []).length === 0 ? (
                          <p style={{ color: '#6b7280', margin: 0 }}>등록된 결제 내역이 없습니다.</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {[...(selectedActivityRecord.payments || [])]
                              .sort((a, b) => String(b.date || b.timestamp || '').localeCompare(String(a.date || a.timestamp || '')))
                              .map((entry) => (
                                <li key={entry.id} style={{ marginBottom: '8px' }}>
                                  <strong>{entry.date || '-'}</strong> · {entry.amount || '-'}
                                  {entry.method ? ` · ${entry.method}` : ''}
                                  {entry.note ? ` · ${entry.note}` : ''}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>

                      <div className="student-score-section">
                        <div className="student-score-title" style={{ fontSize: '1rem' }}>🗣️ 상담 내역</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                          <input type="date" className="student-score-input" value={counselForm.date} onChange={(e) => setCounselForm((prev) => ({ ...prev, date: e.target.value }))} />
                          <input type="text" className="student-score-input" value={counselForm.category} onChange={(e) => setCounselForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="상담 구분" />
                          <input type="text" className="student-score-input" value={counselForm.note} onChange={(e) => setCounselForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="상담 내용" />
                        </div>
                        <button
                          type="button"
                          disabled={savingActivity}
                          onClick={handleAddCounselRecord}
                          className="student-score-save-btn"
                          style={{ marginBottom: '12px' }}
                        >
                          {savingActivity ? '저장 중…' : '상담 내역 저장'}
                        </button>
                        {(selectedActivityRecord.counseling || []).length === 0 ? (
                          <p style={{ color: '#6b7280', margin: 0 }}>등록된 상담 내역이 없습니다.</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {[...(selectedActivityRecord.counseling || [])]
                              .sort((a, b) => String(b.date || b.timestamp || '').localeCompare(String(a.date || a.timestamp || '')))
                              .map((entry) => (
                                <li key={entry.id} style={{ marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                                  <strong>{entry.date || '-'}</strong>
                                  {entry.category ? ` · ${entry.category}` : ''}
                                  {entry.note ? ` · ${entry.note}` : ''}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>

                      <div className="student-score-section-header">
                        <div>
                          <div className="student-score-title">성적 입력</div>
                          <p className="student-score-subtitle">
                            내신은 중1~고3 4회 시험, 모의고사는 2018~2026년 고1~고3 3월/6월/9월/10월까지 과목별로 입력할 수 있습니다.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="student-score-save-btn"
                          disabled={savingScoresFor === historyStudent}
                          onClick={() => saveStudentScores(historyStudent)}
                        >
                          {savingScoresFor === historyStudent ? '저장 중…' : '성적 저장'}
                        </button>
                      </div>

                      <div className="student-score-section">
                        <div className="student-score-filter-row">
                          <label className="student-score-filter-label">
                            내신 학년
                            <select value={scoreGradeFilter} onChange={(e) => setScoreGradeFilter(e.target.value)}>
                              <option value="all">전체</option>
                              {SCHOOL_GRADES.map((grade) => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="student-score-table-wrap">
                          <table className="student-score-table">
                            <thead>
                              <tr>
                                <th>구분</th>
                                {SCHOOL_SCORE_SUBJECTS.map((subject) => (
                                  <th key={subject}>{subject}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleSchoolScoreSlots.map((slot) => (
                                <tr key={slot.key}>
                                  <td>{slot.grade} · {slot.label}</td>
                                  {SCHOOL_SCORE_SUBJECTS.map((subject) => (
                                    <td key={`${slot.key}-${subject}`}>
                                      <input
                                        type="text"
                                        className="student-score-input"
                                        value={selectedScoreRecord.schoolExamScores?.[slot.key]?.[subject] || ''}
                                        onChange={(e) => updateStudentScoreValue(historyStudent, 'school', slot.key, subject, e.target.value)}
                                        placeholder="-"
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="student-score-section">
                        <div className="student-score-filter-row">
                          <label className="student-score-filter-label">
                            모의고사 연도
                            <select value={mockYearFilter} onChange={(e) => setMockYearFilter(e.target.value)}>
                              <option value="all">전체</option>
                              {MOCK_YEARS.map((year) => (
                                <option key={year} value={year}>{year}</option>
                              ))}
                            </select>
                          </label>
                          <label className="student-score-filter-label">
                            학년
                            <select value={mockGradeFilter} onChange={(e) => setMockGradeFilter(e.target.value)}>
                              <option value="all">전체</option>
                              {MOCK_GRADES.map((grade) => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="student-score-table-wrap">
                          <table className="student-score-table">
                            <thead>
                              <tr>
                                <th>구분</th>
                                {MOCK_SCORE_SUBJECTS.map((subject) => (
                                  <th key={subject}>{subject}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleMockScoreSlots.map((slot) => (
                                <tr key={slot.key}>
                                  <td>{slot.year} · {slot.grade} · {slot.month}</td>
                                  {MOCK_SCORE_SUBJECTS.map((subject) => (
                                    <td key={`${slot.key}-${subject}`}>
                                      <input
                                        type="text"
                                        className="student-score-input"
                                        value={selectedScoreRecord.mockExamScores?.[slot.key]?.[subject] || ''}
                                        onChange={(e) => updateStudentScoreValue(historyStudent, 'mock', slot.key, subject, e.target.value)}
                                        placeholder="-"
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="student-score-section">
                        <div className="student-score-title" style={{ fontSize: '1rem' }}>성적 추이 메모</div>
                        <textarea
                          className="student-score-trend-input"
                          rows={5}
                          placeholder="예: 중3 2학기부터 영어 상승, 2025 9월 모의고사 이후 수학 약세..."
                          value={selectedScoreRecord.trendNote || ''}
                          onChange={(e) => updateStudentTrendNote(historyStudent, e.target.value)}
                        />
                      </div>

                      <div className="student-score-section">
                        <div style={{ fontWeight: '700', color: '#374151', marginBottom: '10px', fontSize: '0.95rem' }}>📩 카톡 발송 이력</div>
                        {studentMessageHistoryLoading ? (
                          <p style={{ color: '#6b7280', margin: 0 }}>카톡 이력을 불러오는 중입니다...</p>
                        ) : studentMessageHistory.length === 0 ? (
                          <p style={{ color: '#6b7280', margin: 0 }}>아직 발송된 카톡이 없습니다.</p>
                        ) : (
                          <div style={{ display: 'grid', gap: '12px' }}>
                            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
                                <thead>
                                  <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem' }}>날짜</th>
                                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem' }}>전송 위치</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {studentMessageHistory.map((entry) => (
                                    <tr
                                      key={entry.id}
                                      onClick={() => setSelectedMessageHistoryId(entry.id)}
                                      style={{
                                        cursor: 'pointer',
                                        background: selectedMessageHistoryId === entry.id ? '#eff6ff' : '#fff',
                                      }}
                                    >
                                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontSize: '0.88rem' }}>
                                        {formatHistoryDateLabel(entry.sentAt)}
                                      </td>
                                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.88rem' }}>
                                        <div style={{ fontWeight: '600', color: '#1f2937' }}>{entry.sourceLabel}</div>
                                        {entry.sourceDetail ? (
                                          <div style={{ color: '#6b7280', marginTop: '2px' }}>{entry.sourceDetail}</div>
                                        ) : null}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: '10px', padding: '14px' }}>
                              <div style={{ fontWeight: '700', color: '#1d4ed8', marginBottom: '8px' }}>선택한 카톡 내용</div>
                              {selectedMessageHistoryEntry ? (
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', lineHeight: 1.6, color: '#1f2937' }}>
                                  {selectedMessageHistoryEntry.content || '(내용 없음)'}
                                </pre>
                              ) : (
                                <p style={{ margin: 0, color: '#6b7280' }}>표에서 이력을 클릭하면 내용이 보입니다.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
