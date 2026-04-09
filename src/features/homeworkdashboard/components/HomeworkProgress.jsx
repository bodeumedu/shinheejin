import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import * as XLSX from 'xlsx';
import './HomeworkProgress.css';

// Firestore 문서 ID에는 / 사용 불가. 슬래시를 언더스코어로 치환
function sanitizeDocId(id) {
  if (id == null || typeof id !== 'string') return '';
  return id.replace(/\//g, '_').trim() || '';
}

function normalizeKakaoSendHistoryEntries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => ({
      id: String(entry.id || `${entry.student || 'unknown'}_${entry.sentAt || index}`),
      student: String(entry.student || '').trim(),
      title: String(entry.title || '').trim(),
      content: String(entry.content || '').trim(),
      templateCode: String(entry.templateCode || '').trim(),
      sentAt: String(entry.sentAt || '').trim(),
      status: String(entry.status || 'sent').trim(),
      snapshot: entry?.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : null,
      recipients: Array.isArray(entry.recipients)
        ? entry.recipients.map((recipient) => ({
            type: String(recipient?.type || '').trim(),
            phone: String(recipient?.phone || '').trim(),
          }))
        : [],
    }))
    .filter((entry) => entry.student && entry.content)
    .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
}

function getHistoryDateKey(sentAt) {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return String(sentAt || '').trim().slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatHistoryDateLabel(dateKey) {
  if (!dateKey) return '날짜 미상';
  const [year, month, day] = String(dateKey).split('-');
  if (!year || !month || !day) return dateKey;
  return `${year}.${month}.${day}`;
}

function getSnapshotRecoveryWeight(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  let weight = 0;

  (Array.isArray(snapshot.chapters) ? snapshot.chapters : []).forEach((chapter) => {
    if (chapter?.completed) weight += 1;
    if (String(chapter?.score || '').trim()) weight += 2;
  });

  if (snapshot?.vocabulary?.completed) weight += 1;

  (Array.isArray(snapshot.testGroups) ? snapshot.testGroups : []).forEach((group) => {
    (Array.isArray(group?.items) ? group.items : []).forEach((item) => {
      if (item?.completed) weight += 1;
      if (String(item?.score || '').trim()) weight += 3;
    });
  });

  return weight;
}

function parseScoreNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatScoreStat(value) {
  if (!Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildScoreStatMap(students = [], scores = {}) {
  const statMap = new Map();
  const fieldKeys = new Set();

  students.forEach((student) => {
    Object.keys(scores?.[student] || {}).forEach((fieldKey) => fieldKeys.add(fieldKey));
  });

  fieldKeys.forEach((fieldKey) => {
    const values = students.map((student) => ({
      student,
      value: parseScoreNumber(scores?.[student]?.[fieldKey]),
    }));
    const allFilled = values.length > 0 && values.every((entry) => entry.value !== null);
    if (!allFilled) return;

    const numericValues = values.map((entry) => entry.value);
    const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    const sortedValues = [...numericValues].sort((a, b) => b - a);
    const rankMap = new Map();
    sortedValues.forEach((value, index) => {
      if (!rankMap.has(value)) rankMap.set(value, index + 1);
    });

    statMap.set(fieldKey, {
      average,
      totalCount: numericValues.length,
      rankByStudent: new Map(values.map((entry) => [entry.student, rankMap.get(entry.value)])),
    });
  });

  return statMap;
}

function buildGroupAggregateStatMap(students = [], scores = {}, groups = []) {
  const statMap = new Map();

  groups.forEach((group) => {
    const items = Array.isArray(group?.items) ? group.items : [];
    if (items.length < 2) return;

    const totals = students.map((student) => {
      const values = items.map((item) => parseScoreNumber(scores?.[student]?.[item.id]));
      if (values.some((value) => value === null)) {
        return { student, total: null };
      }
      return { student, total: values.reduce((sum, value) => sum + value, 0) };
    });

    const allFilled = totals.length > 0 && totals.every((entry) => entry.total !== null);
    if (!allFilled) return;

    const numericTotals = totals.map((entry) => entry.total);
    const average = numericTotals.reduce((sum, value) => sum + value, 0) / numericTotals.length;
    const sortedTotals = [...numericTotals].sort((a, b) => b - a);
    const rankMap = new Map();
    sortedTotals.forEach((value, index) => {
      if (!rankMap.has(value)) rankMap.set(value, index + 1);
    });

    const maxScores = items.map((item) => parseScoreNumber(item?.maxScore));
    const maxTotal = maxScores.every((value) => value !== null)
      ? maxScores.reduce((sum, value) => sum + value, 0)
      : null;

    statMap.set(group.id, {
      average,
      totalCount: numericTotals.length,
      maxTotal,
      totalByStudent: new Map(totals.map((entry) => [entry.student, entry.total])),
      rankByStudent: new Map(totals.map((entry) => [entry.student, rankMap.get(entry.total)])),
    });
  });

  return statMap;
}

const LEGACY_TEST_GROUP_CONFIG = [
  { id: 'bodeum', defaultTitle: '', legacyCount: 10 },
  { id: 'vision', defaultTitle: '보듬교육의 시선', legacyCount: 4 },
];
const HOMEWORK_PROGRESS_FIXED_TEMPLATE_CODE = 'KA01TP251128032646018yKogg613GWY';

function buildEmptyTestGroups() {
  return LEGACY_TEST_GROUP_CONFIG.map((group) => ({
    id: group.id,
    title: group.defaultTitle,
    items: [],
  }));
}

function createDynamicGroupItem(groupId, label = '', maxScore = '') {
  return {
    id: `${groupId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: String(label || ''),
    maxScore: String(maxScore || '').trim(),
  };
}

function hasLegacyFieldData(fieldKey, progressData = {}, scores = {}) {
  return Object.values(progressData || {}).some((row) => Boolean(row?.[fieldKey])) ||
    Object.values(scores || {}).some((row) => String(row?.[fieldKey] || '').trim() !== '');
}

function buildLegacyGroupItems(groupId, legacyCount, labels, progressData, scores) {
  const items = [];
  for (let index = 1; index <= legacyCount; index += 1) {
    const fieldKey = `${groupId}${index}`;
    const label = String(labels?.[index] || '').trim();
    const defaultLabel = `${index}회`;
    const hasData = hasLegacyFieldData(fieldKey, progressData, scores);
    const isCustomLabel = label && label !== defaultLabel;
    if (!hasData && !isCustomLabel) continue;
    items.push({ id: fieldKey, label: isCustomLabel ? label : '', maxScore: '' });
  }
  return items;
}

function normalizeTestGroups(rawHeaderTexts = {}, progressData = {}, scores = {}) {
  const savedGroups = Array.isArray(rawHeaderTexts?.testGroups) ? rawHeaderTexts.testGroups : null;
  if (savedGroups) {
    const normalizedMap = new Map();
    savedGroups.forEach((group, groupIndex) => {
      const base = LEGACY_TEST_GROUP_CONFIG.find((entry) => entry.id === group?.id);
      const groupId = String(group?.id || base?.id || `group_${groupIndex}`).trim();
      const title = String(group?.title ?? base?.defaultTitle ?? '').trim();
      const rawItems = Array.isArray(group?.items) ? group.items : [];
      const items = rawItems
        .map((item, itemIndex) => ({
          id: String(item?.id || `${groupId}_${itemIndex + 1}`).trim(),
          label: String(item?.label || '').trim(),
          maxScore: String(item?.maxScore || '').trim(),
        }))
        .filter((item) => item.id);
      normalizedMap.set(groupId, { id: groupId, title, items });
    });
    LEGACY_TEST_GROUP_CONFIG.forEach((group) => {
      if (!normalizedMap.has(group.id)) {
        normalizedMap.set(group.id, { id: group.id, title: group.defaultTitle, items: [] });
      }
    });
    return Array.from(normalizedMap.values());
  }

  return LEGACY_TEST_GROUP_CONFIG.map((group) => ({
    id: group.id,
    title: String(rawHeaderTexts?.[`${group.id}Title`] ?? group.defaultTitle).trim(),
    items: buildLegacyGroupItems(
      group.id,
      group.legacyCount,
      rawHeaderTexts?.[group.id],
      progressData,
      scores
    ),
  }));
}

// 과제 진행 상황 컴포넌트 (docIdOverride: 숙제 완료도에서 이전한 반을 열 때 문서 ID 직접 지정)
export default function HomeworkProgress({ subject = 'english', school, grade, class: selectedClass, teacher, docIdOverride, onClose }) {
  const [activeTab, setActiveTab] = useState('progress'); // 'progress', 'all'
  const [loading, setLoading] = useState(true);
  
  // Firestore 컬렉션명 결정
  const collectionName = useMemo(() => {
    return subject === 'math' ? 'mathHomeworkProgress' : 'englishHomeworkProgress';
  }, [subject]);
  
  // 기존 컬렉션명 (하위 호환성)
  const oldCollectionName = 'homeworkProgress';
  
  // Firestore 문서 ID 생성 (useMemo로 최적화). docIdOverride 있으면 그대로 사용 (숙제 완료도에서 이전한 반)
  const docId = useMemo(() => {
    if (docIdOverride && String(docIdOverride).trim()) return String(docIdOverride).trim();
    if (subject === 'math') {
      // 수학 과제 관리: 학년_선생님_반
      if (grade && teacher && selectedClass) {
        return `homework_progress_${grade}_${teacher}_${selectedClass}`;
      }
      return `homework_progress_${grade || 'unknown'}`;
    }
    
    // 영어 과제 관리 (기존 로직)
    if (school === '중학교 1학년' && teacher) {
      return `homework_progress_${school}_${teacher}`;
    }
    if (grade && selectedClass) {
      return `homework_progress_${school}_${grade}_${selectedClass}`;
    }
    return `homework_progress_${school}`;
  }, [subject, school, grade, selectedClass, teacher, docIdOverride]);
  
  // 문서 ID 정규화 (반명에 / 가 들어간 경우 Firestore 경로 오류 방지)
  const safeDocId = useMemo(() => sanitizeDocId(docId), [docId]);
  
  // 새 컬렉션 문서 참조
  const docRef = useMemo(() => {
    if (isFirebaseConfigured() && db && safeDocId) {
      return doc(db, collectionName, safeDocId);
    }
    return null;
  }, [collectionName, safeDocId]);
  
  // 기존 컬렉션 문서 참조 (하위 호환성)
  const oldDocRef = useMemo(() => {
    if (isFirebaseConfigured() && db && subject === 'english' && safeDocId) {
      return doc(db, oldCollectionName, safeDocId);
    }
    return null;
  }, [safeDocId, subject]);
  
  // 기본 데이터 생성 - 학교/학년별 강의 목록
  const chapterConfig = useMemo(() => {
    if (school === '과천고등학교') {
      if (grade === '1학년') {
        return {
          chapters: [9, 10, 11, 12, 13, 14, 15, 16],
          title: '올림포스2',
          fieldPrefix: 'olympus'
        };
      } else if (grade === '2학년') {
        return {
          chapters: [1, 2, 5, 6, 9],
          title: '수특라이트 영독연',
          fieldPrefix: 'sutuk'
        };
      }
    } else if (school === '과천중앙고등학교') {
      if (grade === '1학년') {
        return {
          chapters: [9, 10],
          title: '고1모의고사',
          fieldPrefix: 'mock1'
        };
      } else if (grade === '2학년') {
        return {
          chapters: [9, 10],
          title: '고2모의고사',
          fieldPrefix: 'mock2'
        };
      }
    }
    // 기본값 (올림포스2)
    return {
      chapters: [9, 10, 11, 12, 13, 14, 15, 16],
      title: '올림포스2',
      fieldPrefix: 'olympus'
    };
  }, [school, grade]);

  const getDefaultChapterLabel = useCallback((chapter) => {
    return chapterConfig.fieldPrefix.startsWith('mock') ? `${chapter}월` : `${chapter}강`;
  }, [chapterConfig.fieldPrefix]);

  const getDefaultVisibleChapters = useCallback(() => {
    return chapterConfig.chapters.length > 0 ? [chapterConfig.chapters[0]] : [];
  }, [chapterConfig.chapters]);

  const buildDefaultHeaderTexts = useCallback(() => {
    const defaultHeaders = {
      mainTitle: '',
      visibleChapters: chapterConfig.chapters.length > 0 ? [chapterConfig.chapters[0]] : [],
      chapters: {},
      testGroups: buildEmptyTestGroups(),
    };
    chapterConfig.chapters.forEach(chapter => {
      defaultHeaders.chapters[chapter] = getDefaultChapterLabel(chapter);
    });
    return defaultHeaders;
  }, [chapterConfig.chapters, getDefaultChapterLabel]);

  const getDefaultData = () => {
    // 기본 학생 목록 제거 - 0명에서 시작
    const defaultStudents = [];
    const defaultProgressData = {};
    const defaultScores = {};
    const defaultPhoneNumbers = {};
    
    return {
      students: defaultStudents,
      progressData: defaultProgressData,
      scores: defaultScores,
      phoneNumbers: defaultPhoneNumbers,
    };
  };
  
  // 학생 목록 (동적 관리)
  const [students, setStudents] = useState([]);
  // 표시용 가나다순 정렬 (ㄱ~ㅎ)
  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => (a || '').localeCompare(b || '', 'ko-KR')),
    [students]
  );

  // 과제 진행 상태 관리
  const [progressData, setProgressData] = useState({});
  
  // 점수 데이터 관리
  const [scores, setScores] = useState({});
  
  // 전화번호 데이터 관리 (학생, 학부모)
  const [phoneNumbers, setPhoneNumbers] = useState({}); // {학생명: {student: '01012345678', parent: '01012345678'}}
  
  // 전화번호 입력 중인 학생 추적 (입력 중에는 Firestore 업데이트 무시)
  const phoneInputInProgressRef = useRef(new Set());
  
  // 카카오톡 전송 미리보기 상태
  // { templateCode: string, messages: [{ student, phones: [{phone,type}], content }] }
  const [kakaoPreview, setKakaoPreview] = useState(null);
  const [kakaoSendHistory, setKakaoSendHistory] = useState([]);
  const [selectedHistoryStudent, setSelectedHistoryStudent] = useState(null);
  const [scheduledSendAt, setScheduledSendAt] = useState(() => {
    const base = new Date(Date.now() + 10 * 60 * 1000);
    base.setSeconds(0, 0);
    const y = base.getFullYear();
    const mo = String(base.getMonth() + 1).padStart(2, '0');
    const d = String(base.getDate()).padStart(2, '0');
    const h = String(base.getHours()).padStart(2, '0');
    const mi = String(base.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${d}T${h}:${mi}`;
  });
  const [scheduleSending, setScheduleSending] = useState(false);
  
  const savedTemplateCode = HOMEWORK_PROGRESS_FIXED_TEMPLATE_CODE;
  const [includeScoreStatsInKakao, setIncludeScoreStatsInKakao] = useState(() => {
    try {
      return localStorage.getItem('homeworkProgress_includeScoreStatsInKakao') === '1';
    } catch {
      return false;
    }
  });
  const [includeAggregateScoreSummaryInKakao, setIncludeAggregateScoreSummaryInKakao] = useState(() => {
    try {
      return localStorage.getItem('homeworkProgress_includeAggregateScoreSummaryInKakao') === '1';
    } catch {
      return false;
    }
  });
  
  // 진도와 과제 데이터 관리 (날짜별)
  const [progressDetailData, setProgressDetailData] = useState({});
  
  // 헤더 텍스트 관리 (2행 헤더 편집용)
  const [headerTexts, setHeaderTexts] = useState(() => {
    return buildDefaultHeaderTexts();
  });

  const visibleChapters = useMemo(() => {
    const raw = Array.isArray(headerTexts.visibleChapters) ? headerTexts.visibleChapters : [];
    const filtered = raw.filter((chapter) => chapterConfig.chapters.includes(chapter));
    return filtered.length > 0 ? filtered : getDefaultVisibleChapters();
  }, [chapterConfig.chapters, getDefaultVisibleChapters, headerTexts.visibleChapters]);

  const testGroups = useMemo(
    () => normalizeTestGroups(headerTexts, progressData, scores),
    [headerTexts, progressData, scores]
  );

  const visibleTestGroupItems = useMemo(
    () =>
      testGroups.map((group) => ({
        ...group,
        items: Array.isArray(group.items) ? group.items : [],
      })),
    [testGroups]
  );

  const totalVisibleTestColumns = useMemo(
    () => visibleTestGroupItems.reduce((sum, group) => sum + Math.max(1, group.items.length), 0),
    [visibleTestGroupItems]
  );
  const scoreStatMap = useMemo(() => buildScoreStatMap(students, scores), [students, scores]);
  const groupAggregateStatMap = useMemo(
    () => buildGroupAggregateStatMap(students, scores, visibleTestGroupItems),
    [students, scores, visibleTestGroupItems]
  );
  
  // 진도와 과제 입력 중인 날짜 추적 (다른 사용자의 업데이트가 덮어쓰지 않도록)
  const dirtyDetailDatesRef = useRef(new Set());
  
  // 초기 로드 플래그 및 마지막 저장 시간 추적
  const isInitialLoadRef = useRef(true);
  const lastSaveTimeRef = useRef(0);
  
  // 로컬 students 상태를 ref로도 추적 (onSnapshot에서 참조하기 위해)
  const studentsRef = useRef([]);
  
  // headerTexts가 Firestore에서 불러와졌는지 추적
  const headerTextsLoadedFromFirestoreRef = useRef(false);
  
  // 이전 docId 추적 (docId 변경 감지용)
  const prevDocIdRef = useRef(docId);
  
  // 저장 상태 관리
  const [savingDetail, setSavingDetail] = useState(false);
  const [saveDetailMessage, setSaveDetailMessage] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);
  const [saveProgressMessage, setSaveProgressMessage] = useState('');
  const [hasUnsavedProgress, setHasUnsavedProgress] = useState(false);
  const [hasUnsavedDetail, setHasUnsavedDetail] = useState(false);
  const hasUnsavedProgressRef = useRef(false);

  const markProgressPageDirty = useCallback(() => {
    hasUnsavedProgressRef.current = true;
    setHasUnsavedProgress(true);
  }, []);

  const clearProgressPageDirty = useCallback(() => {
    hasUnsavedProgressRef.current = false;
    setHasUnsavedProgress(false);
  }, []);

  const markDetailPageDirty = useCallback(() => {
    setHasUnsavedDetail(true);
  }, []);

  const clearDetailPageDirty = useCallback(() => {
    dirtyDetailDatesRef.current.clear();
    setHasUnsavedDetail(false);
  }, []);

  const buildSanitizedPhoneNumbers = useCallback((phoneNumbersToSave) => {
    const cleanedPhoneNumbers = {};

    if (phoneNumbersToSave && typeof phoneNumbersToSave === 'object') {
      Object.keys(phoneNumbersToSave).forEach(student => {
        const studentPhone = phoneNumbersToSave[student];
        if (studentPhone === undefined || studentPhone === null) return;

        if (typeof studentPhone === 'object' && !Array.isArray(studentPhone)) {
          const cleaned = {};

          if (studentPhone.student !== undefined && studentPhone.student !== null && studentPhone.student !== '') {
            const studentValue = String(studentPhone.student).trim();
            if (studentValue !== '') cleaned.student = studentValue;
          }

          if (studentPhone.parent !== undefined && studentPhone.parent !== null && studentPhone.parent !== '') {
            const parentValue = String(studentPhone.parent).trim();
            if (parentValue !== '') cleaned.parent = parentValue;
          }

          if (Object.keys(cleaned).length > 0) {
            cleanedPhoneNumbers[student] = cleaned;
          }
        } else if (typeof studentPhone === 'string' && studentPhone.trim() !== '') {
          cleanedPhoneNumbers[student] = studentPhone.trim();
        }
      });
    }

    return JSON.parse(JSON.stringify(cleanedPhoneNumbers));
  }, []);

  // 진도와 과제 데이터 즉시 저장
  const handleSaveProgressDetail = useCallback(async () => {
    if (!isFirebaseConfigured() || !db || !docRef) {
      setSaveDetailMessage('⚠️ Firebase가 설정되지 않아 저장할 수 없습니다.');
      setTimeout(() => setSaveDetailMessage(''), 3000);
      return;
    }
    
    setSavingDetail(true);
    setSaveDetailMessage('저장 중...');
    
    try {
      await setDoc(docRef, {
        progressDetailData,
        detailPageUpdatedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      }, { merge: true });
      
      // 저장 완료 후 입력 중 표시 초기화
      clearDetailPageDirty();
      
      setSaveDetailMessage('✅ 저장 완료!');
      setTimeout(() => setSaveDetailMessage(''), 2000);
    } catch (error) {
      console.error('진도와 과제 데이터 저장 실패:', error);
      setSaveDetailMessage('❌ 저장 실패: ' + (error.message || '알 수 없는 오류'));
      setTimeout(() => setSaveDetailMessage(''), 3000);
    } finally {
      setSavingDetail(false);
    }
  }, [clearDetailPageDirty, docRef, progressDetailData]);
  
  // 11월과 12월의 화요일과 목요일 날짜 계산
  const getTuesdayThursdayDates = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const dates = [];
    
    // 11월과 12월
    for (let month = 11; month <= 12; month++) {
      // 해당 월의 첫 날
      const firstDay = new Date(currentYear, month - 1, 1);
      // 해당 월의 마지막 날
      const lastDay = new Date(currentYear, month, 0);
      
      // 첫 날부터 마지막 날까지 반복
      for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(currentYear, month - 1, day);
        const dayOfWeek = date.getDay(); // 0: 일요일, 1: 월요일, 2: 화요일, 4: 목요일
        
        // 화요일(2) 또는 목요일(4)인 경우
        if (dayOfWeek === 2 || dayOfWeek === 4) {
          dates.push({
            date: date,
            dateString: `${month}월 ${day}일`,
            fullDateString: `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            dayOfWeek: dayOfWeek === 2 ? '화요일' : '목요일',
          });
        }
      }
    }
    
    return dates;
  }, []);
  
  // Firebase 설정 오류 상태
  const [firebaseError, setFirebaseError] = useState(null);

  const selectedStudentHistoryEntries = useMemo(() => {
    if (!selectedHistoryStudent) return [];
    return kakaoSendHistory.filter((entry) => entry.student === selectedHistoryStudent);
  }, [kakaoSendHistory, selectedHistoryStudent]);
  
  // localStorage에서 데이터 불러오기 (Firebase 미설정 시)
  const loadDataFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem(docId);
      if (saved) {
        const data = JSON.parse(saved);
        return {
          students: data.students || [],
          progressData: data.progressData || {},
          scores: data.scores || {},
        };
      }
    } catch (error) {
      console.error('localStorage 데이터 불러오기 실패:', error);
    }
    return null;
  };

  // localStorage에 데이터 저장하기 (Firebase 미설정 시)
  const saveDataToLocalStorage = useCallback((studentsData, progressData, scoresData) => {
    try {
      const dataToSave = {
        students: studentsData,
        progressData: progressData,
        scores: scoresData,
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem(docId, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('localStorage 데이터 저장 실패:', error);
    }
  }, [docId]);

  // Firestore에서 데이터 불러오기 및 실시간 동기화
  useEffect(() => {
    // docId가 변경되었는지 확인
    const docIdChanged = prevDocIdRef.current !== docId;
    prevDocIdRef.current = docId;
    
    // docId가 변경될 때마다 초기 로드 플래그 리셋
    if (docIdChanged) {
      isInitialLoadRef.current = true;
      lastSaveTimeRef.current = 0;
      headerTextsLoadedFromFirestoreRef.current = false; // docId 변경 시 플래그 리셋
      clearProgressPageDirty();
      clearDetailPageDirty();
      setSaveProgressMessage('');
      setSaveDetailMessage('');
      
      setHeaderTexts(buildDefaultHeaderTexts());
    }
    
    setLoading(true);
    setFirebaseError(null);
    
    // Firebase가 설정되지 않은 경우 오류 표시
    if (!isFirebaseConfigured()) {
      console.error('❌ Firebase 환경 변수가 설정되지 않았습니다.');
      setFirebaseError('Firebase 환경 변수 설정 필요 - Vercel 또는 .env 파일에 설정하세요');
      const defaultData = getDefaultData();
      setStudents(defaultData.students);
      setProgressData(defaultData.progressData);
      setScores(defaultData.scores);
      setPhoneNumbers(defaultData.phoneNumbers);
      setKakaoSendHistory([]);
      setProgressDetailData({});
      dirtyDetailDatesRef.current.clear();
      setLoading(false);
      return;
    }
    
    if (!db || !docRef) {
      console.error('❌ Firebase 초기화 실패 또는 db/docRef가 null입니다.');
      setFirebaseError('Firebase 초기화 실패 - 브라우저 콘솔을 확인하세요');
      const defaultData = getDefaultData();
      setStudents(defaultData.students);
      setProgressData(defaultData.progressData);
      setScores(defaultData.scores);
      setPhoneNumbers(defaultData.phoneNumbers);
      setKakaoSendHistory([]);
      setProgressDetailData({});
      dirtyDetailDatesRef.current.clear();
      setLoading(false);
      return;
    }
    
    // 타임아웃 설정 (20초 후에도 로딩이 안 끝나면 기본 데이터 사용)
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ Firestore 연결 타임아웃 (20초): 기본 데이터 사용');
      console.warn('Firestore 보안 규칙을 확인하세요: Firebase Console → Firestore Database → 규칙');
      const defaultData = getDefaultData();
      setStudents(defaultData.students);
      setProgressData(defaultData.progressData);
      setScores(defaultData.scores);
      setPhoneNumbers(defaultData.phoneNumbers);
      setProgressDetailData({});
      dirtyDetailDatesRef.current.clear();
      setFirebaseError('Firestore 연결 타임아웃 - 보안 규칙을 확인하세요');
      setLoading(false);
    }, 20000);
    
    // 실시간 리스너 설정 (기존 컬렉션도 확인 - 하위 호환성)
    console.log('🔄 Firestore 연결 시도 중...', { docId, collectionName });
    
    const unsubscribe = onSnapshot(
      docRef,
      async (docSnapshot) => {
        clearTimeout(timeoutId);
        console.log('✅ Firestore 연결 성공!', { 
          exists: docSnapshot.exists(),
          docId,
          collectionName
        });
        
        // 새 컬렉션에 데이터가 없고, 기존 컬렉션이 있다면 마이그레이션 시도
        let dataToLoad = null;
        let isMigrated = false;
        
        if (!docSnapshot.exists() && subject === 'english' && oldDocRef) {
          try {
            const oldDocSnap = await getDoc(oldDocRef);
            if (oldDocSnap.exists()) {
              console.log('📦 기존 homeworkProgress 컬렉션에서 데이터 발견! 자동 마이그레이션 시작...');
              dataToLoad = oldDocSnap.data();
              isMigrated = true;
              
              // 새 컬렉션으로 데이터 복사
              await setDoc(docRef, {
                ...dataToLoad,
                migratedFrom: 'homeworkProgress',
                migratedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
              }, { merge: true });
              
              console.log('✅ 기존 데이터를 새 컬렉션으로 마이그레이션 완료!');
            }
          } catch (error) {
            console.warn('기존 컬렉션 확인 중 오류:', error);
          }
        }
        
        // 새 컬렉션에 데이터가 있으면 사용
        if (docSnapshot.exists()) {
          dataToLoad = docSnapshot.data();
        }
        
        if (dataToLoad) {
          const data = dataToLoad;
          const now = Date.now();
          const isInitialLoad = isInitialLoadRef.current;
          const localStudents = studentsRef.current; // 현재 로컬 students 상태
          
          // 기본 학생 4명 제거 (기존 데이터에 포함되어 있을 수 있음)
          const defaultStudentNames = ['김은수', '민성원', '신정원', '유영채'];
          const existingStudents = data.students || [];
          const filteredStudents = existingStudents.filter(name => !defaultStudentNames.includes(name));
          
          const firestoreCount = filteredStudents.length;
          const localCount = localStudents.length;
          
          // 필터링된 progress/scores는 아래 '기본 학생 제거 후 저장'에서도 사용하므로 바깥에서 선언
          const filteredProgressData = {};
          const filteredScores = {};
          const filteredPhoneNumbers = {};
          filteredStudents.forEach(student => {
            if (data.progressData && data.progressData[student]) {
              filteredProgressData[student] = data.progressData[student];
            }
            if (data.scores && data.scores[student]) {
              filteredScores[student] = data.scores[student];
            }
          });
          
          console.log('📥 Firestore에서 데이터 불러옴:', { 
            firestoreCount,
            localCount,
            isInitialLoad,
            timeSinceLastSave: now - lastSaveTimeRef.current
          });
          setKakaoSendHistory(normalizeKakaoSendHistoryEntries(data.kakaoSendHistory || []));
          
          // 로컬에 더 많은 학생이 있으면 (방금 추가한 학생이 있으면) 로컬 상태 유지
          if (!isInitialLoad && localCount > firestoreCount) {
            console.log('⏸️ 로컬 변경사항 보존 (로컬 학생 수가 더 많음)', { localCount, firestoreCount });
            setLoading(false);
            return;
          }
          
          const shouldPreserveUnsavedProgress = !isInitialLoad && hasUnsavedProgressRef.current;

          // 초기 로드이거나, 최근 저장 후 2초 이내가 아닐 때만 Firestore 데이터로 업데이트
          if (shouldPreserveUnsavedProgress) {
            console.log('⏸️ 저장 전 progress 페이지 로컬 변경사항 보존');
          } else if (isInitialLoad || (now - lastSaveTimeRef.current > 2000)) {
            console.log('✅ Firestore 데이터로 상태 업데이트', { isInitialLoad, timeSinceLastSave: now - lastSaveTimeRef.current });
            
            setStudents(filteredStudents);
            setProgressData(filteredProgressData);
            setScores(filteredScores);
            
            // 전화번호는 항상 현재 로컬 상태를 우선 (입력 중인 값 보호)
            // 최근 저장 후 5초 이내이면 전화번호는 업데이트하지 않음 (입력 중일 수 있음)
            const shouldPreservePhoneNumbers = (now - lastSaveTimeRef.current < 5000);
            
            setPhoneNumbers(prev => {
              // 최근 저장 후 5초 이내이거나 입력 중인 전화번호가 있으면 로컬 상태 유지
              if (shouldPreservePhoneNumbers || phoneInputInProgressRef.current.size > 0) {
                console.log('📞 전화번호 로컬 상태 보존:', { 
                  timeSinceSave: now - lastSaveTimeRef.current,
                  inputInProgress: Array.from(phoneInputInProgressRef.current)
                });
                return prev; // 로컬 상태 그대로 유지
              }
              
              // Firestore에서 불러온 전화번호 데이터 준비
              filteredStudents.forEach(student => {
                // 입력 중인 학생은 항상 로컬 값 유지
                if (phoneInputInProgressRef.current.has(student)) {
                  return;
                }
                
                // 로컬에 이미 값이 있으면 항상 유지 (Firestore로 덮어쓰지 않음)
                if (prev[student]) {
                  return;
                }
                
                // 로컬에 없을 때만 Firestore 문서의 phoneNumbers 사용 (영어 과제 관리 전용)
                if (data.phoneNumbers && data.phoneNumbers[student] && !prev[student]) {
                  const phoneData = data.phoneNumbers[student];
                  
                  // undefined 값 제거 및 정리
                  if (typeof phoneData === 'string' && phoneData.trim() !== '') {
                    filteredPhoneNumbers[student] = { student: phoneData };
                  } else if (typeof phoneData === 'object' && phoneData !== null) {
                    const cleaned = {};
                    if (phoneData.student !== undefined && phoneData.student !== null && phoneData.student !== '') {
                      cleaned.student = phoneData.student;
                    }
                    if (phoneData.parent !== undefined && phoneData.parent !== null && phoneData.parent !== '') {
                      cleaned.parent = phoneData.parent;
                    }
                    if (Object.keys(cleaned).length > 0) {
                      filteredPhoneNumbers[student] = cleaned;
                    }
                  }
                }
              });
              
              // 로컬 전화번호(prev)와 Firestore 전화번호(filteredPhoneNumbers) 병합
              // 로컬 값이 항상 우선
              const merged = { ...prev };
              
              // Firestore에서 불러온 데이터 중 로컬에 없는 것만 추가
              Object.keys(filteredPhoneNumbers).forEach(student => {
                // 입력 중이 아니고 로컬에 없을 때만 추가
                if (!phoneInputInProgressRef.current.has(student) && !merged[student]) {
                  merged[student] = filteredPhoneNumbers[student];
                }
              });
              
              // undefined 값 제거
              Object.keys(merged).forEach(student => {
                const phone = merged[student];
                if (phone && typeof phone === 'object') {
                  const cleaned = {};
                  if (phone.student !== undefined && phone.student !== null && phone.student !== '') {
                    cleaned.student = phone.student;
                  }
                  if (phone.parent !== undefined && phone.parent !== null && phone.parent !== '') {
                    cleaned.parent = phone.parent;
                  }
                  if (Object.keys(cleaned).length > 0) {
                    merged[student] = cleaned;
                  } else {
                    delete merged[student];
                  }
                } else if (!phone || (typeof phone === 'string' && phone.trim() === '')) {
                  delete merged[student];
                }
              });
              
              return merged;
            });
            
            // 헤더 텍스트 불러오기
            if (data.headerTexts) {
              const loadedHeaders = { ...data.headerTexts };
              // chapters가 비어있거나 일부만 있으면 기본값으로 채우기
              if (!loadedHeaders.chapters || Object.keys(loadedHeaders.chapters).length === 0) {
                loadedHeaders.chapters = {};
              }
              chapterConfig.chapters.forEach(chapter => {
                if (!loadedHeaders.chapters[chapter]) {
                  loadedHeaders.chapters[chapter] = getDefaultChapterLabel(chapter);
                }
              });
              loadedHeaders.mainTitle = typeof loadedHeaders.mainTitle === 'string' ? loadedHeaders.mainTitle : '';
              const loadedVisible = Array.isArray(loadedHeaders.visibleChapters)
                ? loadedHeaders.visibleChapters.filter((chapter) => chapterConfig.chapters.includes(chapter))
                : [];
              loadedHeaders.visibleChapters = loadedVisible.length > 0 ? loadedVisible : getDefaultVisibleChapters();
              loadedHeaders.testGroups = normalizeTestGroups(loadedHeaders, filteredProgressData, filteredScores);
              setHeaderTexts(loadedHeaders);
              headerTextsLoadedFromFirestoreRef.current = true;
            } else {
              // Firestore에 headerTexts가 없으면 기본값 사용
              headerTextsLoadedFromFirestoreRef.current = false;
            }
            
            isInitialLoadRef.current = false;
          } else {
            console.log('⏸️ 로컬 변경사항 보존 (최근 저장 후 2초 이내)');
            // 로컬 상태 유지 - 아무것도 하지 않음
          }
          
          // 기본 학생이 제거되었고 데이터가 변경되었다면 Firestore에 저장
          if (existingStudents.length !== filteredStudents.length) {
            console.log('🔄 기본 학생 제거 후 Firestore 업데이트 중...');
            setDoc(docRef, {
              students: filteredStudents,
              progressData: filteredProgressData,
              scores: filteredScores,
              progressDetailData: data.progressDetailData || {},
              lastUpdated: new Date().toISOString(),
            }, { merge: true }).catch(error => {
              console.error('기본 학생 제거 후 저장 실패:', error);
            });
          }
          const firebaseDetailData = data.progressDetailData || {};
          setProgressDetailData(prev => {
            const merged = { ...firebaseDetailData };
            dirtyDetailDatesRef.current.forEach((dirtyKey) => {
              if (prev[dirtyKey]) {
                merged[dirtyKey] = prev[dirtyKey];
              }
            });
            return merged;
          });
          setFirebaseError(null); // 성공 시 오류 메시지 제거
        } else {
          // 문서가 없고, 마이그레이션도 안 된 경우에만 기본 데이터로 초기화
          if (!isMigrated) {
            console.log('📝 문서가 없음. 기본 데이터로 초기화 중...');
            // 문서가 없으면 기본 데이터로 초기화
            const defaultData = getDefaultData();
            setStudents(defaultData.students);
            setProgressData(defaultData.progressData);
            setScores(defaultData.scores);
            setPhoneNumbers(defaultData.phoneNumbers);
            setKakaoSendHistory([]);
            setProgressDetailData({});
            dirtyDetailDatesRef.current.clear();
            // Firestore에 기본 데이터 저장
            console.log('💾 Firestore에 기본 데이터 저장 중...');
            setDoc(docRef, { ...defaultData, progressDetailData: {} })
              .then(() => {
                console.log('✅ 기본 데이터 저장 완료!');
                setFirebaseError(null);
              })
              .catch(error => {
                console.error('❌ 기본 데이터 저장 실패:', error);
                setFirebaseError(`데이터 저장 실패: ${error.message || error.code}`);
              });
          } else {
            console.log('⏳ 마이그레이션 완료. 데이터는 마이그레이션된 내용을 사용합니다.');
          }
        }
        setLoading(false);
      },
      (error) => {
        clearTimeout(timeoutId);
        console.error('❌ Firestore 데이터 불러오기 실패:', error);
        console.error('오류 코드:', error.code);
        console.error('오류 메시지:', error.message);
        
        // 권한 오류인 경우 특별 안내
        if (error.code === 'permission-denied') {
          setFirebaseError(`Firestore 보안 규칙 오류 - ${collectionName} 컬렉션에 대한 권한이 없습니다.`);
          console.error('🔒 Firestore 보안 규칙을 확인하세요:');
          console.error('Firebase Console → Firestore Database → 규칙');
          console.error('다음 규칙이 필요합니다:');
          console.error(`match /${collectionName}/{document} {`);
          console.error('  allow read, write: if true;');
          console.error('}');
          console.error('\n📋 전체 보안 규칙 가이드는 FIRESTORE_RULES_UPDATE.md 파일을 참고하세요.');
        } else {
          setFirebaseError(`Firebase 연결 오류: ${error.message || error.code || '알 수 없는 오류'}`);
        }
        
        // 기본 데이터 사용
        const defaultData = getDefaultData();
        setStudents(defaultData.students);
        setProgressData(defaultData.progressData);
        setScores(defaultData.scores);
        setPhoneNumbers(defaultData.phoneNumbers);
        setKakaoSendHistory([]);
          setProgressDetailData({});
          dirtyDetailDatesRef.current.clear();
        setLoading(false);
      }
    );
    
    // 컴포넌트 언마운트 시 리스너 해제
    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [
    buildDefaultHeaderTexts,
    chapterConfig,
    clearDetailPageDirty,
    clearProgressPageDirty,
    collectionName,
    docId,
    docRef,
    getDefaultVisibleChapters,
    oldDocRef,
    subject,
  ]);
  
  // Firestore에 데이터 저장하기
  const saveData = useCallback(async (studentsData, progressData, scoresData, headerTextsData = null, phoneNumbersData = null) => {
    // Firebase가 설정되지 않은 경우 오류 표시
    if (!isFirebaseConfigured() || !db || !docRef) {
      console.error('Firebase가 설정되지 않아 데이터를 저장할 수 없습니다.');
      setFirebaseError('Firebase 설정 필요 - 데이터가 저장되지 않습니다');
      throw new Error('Firebase가 설정되지 않아 데이터를 저장할 수 없습니다.');
    }
    
    try {
      // phoneNumbers에서 undefined 값 완전히 제거 및 정리
      const phoneNumbersToSave = phoneNumbersData !== null ? phoneNumbersData : phoneNumbers;
      const finalPhoneNumbers = buildSanitizedPhoneNumbers(phoneNumbersToSave);
      
      const dataToSave = {
        students: studentsData,
        progressData: progressData,
        scores: scoresData,
        phoneNumbers: finalPhoneNumbers, // 정리되고 undefined가 완전히 제거된 전화번호 저장
        lastUpdated: new Date().toISOString(),
      };
      
      // 저장 전 최종 검증: undefined 값이 있는지 확인
      const hasUndefined = JSON.stringify(dataToSave).includes('undefined');
      if (hasUndefined) {
        console.error('⚠️ 저장할 데이터에 undefined 값이 포함되어 있습니다:', dataToSave);
        // JSON 직렬화/역직렬화로 undefined 제거
        const sanitizedData = JSON.parse(JSON.stringify(dataToSave, (key, value) => {
          return value === undefined ? null : value;
        }));
        // null도 제거
        Object.keys(sanitizedData.phoneNumbers || {}).forEach(student => {
          if (sanitizedData.phoneNumbers[student]) {
            Object.keys(sanitizedData.phoneNumbers[student]).forEach(type => {
              if (sanitizedData.phoneNumbers[student][type] === null) {
                delete sanitizedData.phoneNumbers[student][type];
              }
            });
            if (Object.keys(sanitizedData.phoneNumbers[student]).length === 0) {
              delete sanitizedData.phoneNumbers[student];
            }
          }
        });
        Object.assign(dataToSave, sanitizedData);
      }
      
      // headerTexts가 제공되면 포함
      if (headerTextsData !== null) {
        dataToSave.headerTexts = headerTextsData;
      }
      
      await setDoc(docRef, dataToSave, { merge: true });
      lastSaveTimeRef.current = Date.now(); // 저장 시간 업데이트
      setFirebaseError(null); // 저장 성공 시 오류 메시지 제거
      console.log('✅ 데이터 저장 완료:', { studentsCount: studentsData.length, saveTime: lastSaveTimeRef.current });
    } catch (error) {
      console.error('Firestore 데이터 저장 실패:', error);
      console.error('오류 코드:', error.code);
      console.error('오류 메시지:', error.message);
      
      // 권한 오류인 경우 특별 안내
      if (error.code === 'permission-denied') {
        setFirebaseError(`데이터 저장 실패: ${collectionName} 컬렉션에 대한 권한이 없습니다. Firestore 보안 규칙을 확인하고 게시 버튼을 눌러주세요.`);
        console.error('🔒 Firestore 보안 규칙을 확인하세요:');
        console.error('Firebase Console → Firestore Database → 규칙');
        console.error('다음 규칙이 필요합니다:');
        console.error(`match /${collectionName}/{document} {`);
        console.error('  allow read, write: if true;');
        console.error('}');
        console.error('⚠️ 중요: 규칙을 작성한 후 반드시 "게시" 버튼을 눌러야 적용됩니다!');
        console.error('\n📋 전체 보안 규칙 가이드는 FIRESTORE_RULES_UPDATE.md 파일을 참고하세요.');
      } else {
        setFirebaseError(`데이터 저장 실패: ${error.message || error.code || '알 수 없는 오류'}`);
      }
      throw error;
    }
  }, [buildSanitizedPhoneNumbers, collectionName, docRef, phoneNumbers]);

  const saveKakaoHistoryEntries = useCallback(async (entriesToAdd) => {
    if (!docRef || !Array.isArray(entriesToAdd) || entriesToAdd.length === 0) return;

    const docSnapshot = await getDoc(docRef);
    const existingData = docSnapshot.exists() ? docSnapshot.data() : {};
    const existingEntries = normalizeKakaoSendHistoryEntries(existingData.kakaoSendHistory || []);
    const mergedMap = new Map();
    [...existingEntries, ...entriesToAdd].forEach((entry, index) => {
      const normalized = normalizeKakaoSendHistoryEntries([entry])[0];
      if (!normalized) return;
      const key = normalized.id || `${normalized.student || 'unknown'}_${normalized.sentAt || index}`;
      mergedMap.set(key, normalized);
    });
    const mergedEntries = Array.from(mergedMap.values()).sort((a, b) =>
      String(b.sentAt || '').localeCompare(String(a.sentAt || ''))
    );

    await setDoc(docRef, {
      kakaoSendHistory: mergedEntries,
      lastUpdated: new Date().toISOString(),
    }, { merge: true });

    setKakaoSendHistory(mergedEntries);
  }, [docRef]);

  const buildStudentSendSnapshot = useCallback((student) => ({
    mainTitle: String(headerTexts.mainTitle || '').trim(),
    chapters: visibleChapters.map((chapter) => ({
      fieldKey: `${chapterConfig.fieldPrefix}${chapter}`,
      label: String(headerTexts.chapters?.[chapter] || getDefaultChapterLabel(chapter)).trim(),
      completed: Boolean(progressData[student]?.[`${chapterConfig.fieldPrefix}${chapter}`]),
      score: '',
    })),
    vocabulary: {
      completed: Boolean(progressData[student]?.vocabulary),
    },
    testGroups: visibleTestGroupItems.map((group) => ({
      id: group.id,
      title: String(group.title || '').trim(),
      items: group.items.map((item, index) => ({
        fieldKey: item.id,
        label: String(item.label || '').trim() || `${index + 1}회`,
          maxScore: String(item.maxScore || '').trim(),
        completed: Boolean(progressData[student]?.[item.id]),
        score: String(scores[student]?.[item.id] || '').trim(),
      })),
    })),
  }), [
    chapterConfig.fieldPrefix,
    getDefaultChapterLabel,
    headerTexts,
    progressData,
    scores,
    visibleChapters,
    visibleTestGroupItems,
  ]);

  const handleSaveProgressPage = useCallback(async () => {
    if (!isFirebaseConfigured() || !db || !docRef) {
      setSaveProgressMessage('⚠️ Firebase가 설정되지 않아 저장할 수 없습니다.');
      setTimeout(() => setSaveProgressMessage(''), 3000);
      return;
    }

    setSavingProgress(true);
    setSaveProgressMessage('저장 중...');

    try {
      await saveData(students, progressData, scores, headerTexts, phoneNumbers);
      clearProgressPageDirty();
      setSaveProgressMessage('✅ 전체 과제 상황 저장 완료!');
      setTimeout(() => setSaveProgressMessage(''), 2000);
    } catch (error) {
      console.error('전체 과제 상황 저장 실패:', error);
      setSaveProgressMessage('❌ 저장 실패: ' + (error.message || '알 수 없는 오류'));
      setTimeout(() => setSaveProgressMessage(''), 3000);
    } finally {
      setSavingProgress(false);
    }
  }, [clearProgressPageDirty, docRef, headerTexts, phoneNumbers, progressData, saveData, scores, students]);

  useEffect(() => {
    if (!hasUnsavedProgress || !docRef || savingProgress) return undefined;
    const timeoutId = setTimeout(() => {
      handleSaveProgressPage();
    }, 1200);
    return () => clearTimeout(timeoutId);
  }, [docRef, handleSaveProgressPage, hasUnsavedProgress, savingProgress]);

  useEffect(() => {
    if (!hasUnsavedDetail || !docRef || savingDetail) return undefined;
    const timeoutId = setTimeout(() => {
      handleSaveProgressDetail();
    }, 1200);
    return () => clearTimeout(timeoutId);
  }, [docRef, handleSaveProgressDetail, hasUnsavedDetail, savingDetail]);
  
  // students 상태가 변경될 때마다 studentsRef 업데이트
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'homeworkProgress_includeScoreStatsInKakao',
        includeScoreStatsInKakao ? '1' : '0'
      );
    } catch {
      // ignore localStorage failures
    }
  }, [includeScoreStatsInKakao]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'homeworkProgress_includeAggregateScoreSummaryInKakao',
        includeAggregateScoreSummaryInKakao ? '1' : '0'
      );
    } catch {
      // ignore localStorage failures
    }
  }, [includeAggregateScoreSummaryInKakao]);
  
  // chapterConfig 변경 시 headerTexts의 chapters 부분 업데이트
  // (Firestore에서 불러온 값이 없을 때만 기본값으로 채우기)
  useEffect(() => {
    // Firestore에서 불러온 값이 있으면 업데이트하지 않음
    if (headerTextsLoadedFromFirestoreRef.current) {
      return;
    }
    
    setHeaderTexts(prev => {
      const updated = { ...prev };
      const newChapters = {};
      chapterConfig.chapters.forEach(chapter => {
        // 기존 값이 있으면 유지, 없으면 기본값 사용
        newChapters[chapter] = prev.chapters?.[chapter] || getDefaultChapterLabel(chapter);
      });
      updated.chapters = newChapters;
      const nextVisible = Array.isArray(prev.visibleChapters)
        ? prev.visibleChapters.filter((chapter) => chapterConfig.chapters.includes(chapter))
        : [];
      updated.visibleChapters = nextVisible.length > 0 ? nextVisible : getDefaultVisibleChapters();
      return updated;
    });
  }, [chapterConfig, getDefaultChapterLabel, getDefaultVisibleChapters]);
  
  // 새 학생 이름 입력 상태
  const [newStudentName, setNewStudentName] = useState('');
  const [phoneUploading, setPhoneUploading] = useState(false);
  const handlePhoneExcelUpload = useCallback(async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const findCol = (headers, keywords) => {
      const idx = headers.findIndex(h => {
        const v = String(h || '').trim().replace(/\s+/g, '');
        return keywords.some(k => v.includes(k));
      });
      return idx >= 0 ? idx : -1;
    };
    const findHeaderRow = (jsonData) => {
      const maxSearch = Math.min(10, jsonData.length);
      for (let r = 0; r < maxSearch; r++) {
        const row = (jsonData[r] || []).map(h => String(h || '').trim());
        if (row.filter(c => c !== '').length < 2) continue;
        if (findCol(row, ['학생명', '이름', '성명', '학생', 'name']) >= 0 || findCol(row, ['핸드폰', '전화번호']) >= 0) {
          return r;
        }
      }
      return 0;
    };
    setPhoneUploading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (jsonData.length < 2) {
        alert('엑셀에 헤더와 데이터 행이 필요합니다.');
        setPhoneUploading(false);
        return;
      }
      const headerRowIndex = findHeaderRow(jsonData);
      const headers = (jsonData[headerRowIndex] || []).map(h => String(h || '').trim());
      const nameIdx = findCol(headers, ['학생명', '이름', '성명', '학생', 'name']);
      if (nameIdx === -1) {
        alert('엑셀에서 이름 컬럼을 찾을 수 없습니다. 컬럼명이 "학생명", "이름", "성명", "학생" 중 하나인지 확인해주세요.');
        setPhoneUploading(false);
        return;
      }
      const dataStartRow = headerRowIndex + 1;
      const numCols = Math.max(headers.length, ...jsonData.slice(dataStartRow).map(r => (r || []).length), 1);
      const extract010Phones = (val) => {
        if (val == null || val === '') return [];
        let s = typeof val === 'number' ? String(Math.floor(val)) : String(val);
        if (typeof val === 'number' && s.length === 10 && s.startsWith('10')) s = '0' + s;
        s = s.replace(/\D/g, '');
        const matches = s.match(/010\d{8}/g) || [];
        return [...new Set(matches)];
      };
      let studentPhoneIdx = findCol(headers, ['핸드폰', '휴대폰', '전화번호', '연락처', '학생핸드폰', '학생전화', '번호', 'student phone', 'student']);
      let parentPhoneIdx = findCol(headers, ['부모핸드폰', '학부모핸드폰', '학부모전화', '학부모', '부모전화', '부모', 'parent']);
      const countDigitsInCol = (colIdx) => {
        let count = 0;
        for (let i = dataStartRow; i < jsonData.length; i++) {
          if (extract010Phones((jsonData[i] || [])[colIdx]).length >= 1) count++;
        }
        return count;
      };
      if (studentPhoneIdx === -1) {
        let best = 0;
        for (let c = 0; c < numCols; c++) {
          if (c === nameIdx) continue;
          const cnt = countDigitsInCol(c);
          if (cnt > best) { best = cnt; studentPhoneIdx = c; }
        }
      }
      if (parentPhoneIdx === -1 && studentPhoneIdx >= 0) {
        let best = 0;
        for (let c = 0; c < numCols; c++) {
          if (c === nameIdx || c === studentPhoneIdx) continue;
          const cnt = countDigitsInCol(c);
          if (cnt > best) { best = cnt; parentPhoneIdx = c; }
        }
      }
      if (studentPhoneIdx === -1) {
        studentPhoneIdx = 6;
        parentPhoneIdx = 8;
      }
      const buildPhones = (sIdx, pIdx) => {
        const st = [];
        const out = {};
        for (let i = dataStartRow; i < jsonData.length; i++) {
          const row = jsonData[i] || [];
          const name = String(row[nameIdx] ?? '').trim();
          if (!name) continue;
          if (!st.includes(name)) st.push(name);
          const studentCol = sIdx >= 0 ? extract010Phones(row[sIdx]) : [];
          const parentCol = pIdx >= 0 ? extract010Phones(row[pIdx]) : [];
          const student = studentCol[0] ?? parentCol[0] ?? null;
          const parent = parentCol[0] ?? studentCol[1] ?? null;
          if (student || parent) {
            out[name] = {
              student: student || (phoneNumbers[name]?.student || null),
              parent: parent || (phoneNumbers[name]?.parent || null),
            };
          }
        }
        return { newStudents: st, newPhones: out };
      };
      let result = buildPhones(studentPhoneIdx, parentPhoneIdx);
      let newStudents = result.newStudents;
      let newPhones = result.newPhones;
      if (Object.keys(newPhones).length === 0) {
        result = buildPhones(6, 8);
        newStudents = result.newStudents;
        newPhones = result.newPhones;
      }
      const mergedStudents = [...new Set([...students, ...newStudents])];
      const mergedPhones = { ...phoneNumbers };
      Object.keys(newPhones).forEach(n => { mergedPhones[n] = newPhones[n]; });
      setStudents(mergedStudents);
      setPhoneNumbers(mergedPhones);
      await saveData(mergedStudents, progressData, scores, headerTexts, mergedPhones);
      clearProgressPageDirty();
      alert(`✅ 업로드 완료 (${Object.keys(newPhones).length}명 전화번호 반영). 전체 완성도와 테스트관리에서만 사용됩니다.`);
    } catch (err) {
      console.error(err);
      alert('엑셀 처리 중 오류가 났습니다.');
    } finally {
      setPhoneUploading(false);
      e.target.value = '';
    }
  }, [clearProgressPageDirty, students, progressData, scores, headerTexts, phoneNumbers, saveData]);

  const handleCheckboxChange = (student, assignment) => {
    markProgressPageDirty();
    setProgressData(prev => ({
      ...prev,
      [student]: {
        ...(prev[student] || {}),
        [assignment]: !(prev[student]?.[assignment] || false),
      },
    }));
  };
  
  const handleScoreChange = (student, assignment, value) => {
    markProgressPageDirty();
    setScores(prev => ({
      ...prev,
      [student]: {
        ...(prev[student] || {}),
        [assignment]: value,
      },
    }));
  };

  const handleAddChapterColumn = useCallback(() => {
    const nextChapter = chapterConfig.chapters.find((chapter) => !visibleChapters.includes(chapter));
    if (nextChapter == null) return;

    markProgressPageDirty();
    setHeaderTexts(prev => ({
      ...prev,
      visibleChapters: [...visibleChapters, nextChapter],
      chapters: {
        ...(prev.chapters || {}),
        [nextChapter]: prev.chapters?.[nextChapter] || getDefaultChapterLabel(nextChapter),
      },
    }));
  }, [chapterConfig.chapters, getDefaultChapterLabel, markProgressPageDirty, visibleChapters]);
  
  // 학생 추가
  const handleAddStudent = () => {
    if (!newStudentName.trim()) {
      alert('학생 이름을 입력해주세요.');
      return;
    }
    
    if (students.includes(newStudentName.trim())) {
      alert('이미 존재하는 학생입니다.');
      return;
    }
    
    // chapterConfig 확인
    if (!chapterConfig || !chapterConfig.chapters || !chapterConfig.fieldPrefix) {
      console.error('chapterConfig가 올바르게 설정되지 않았습니다:', { school, grade, chapterConfig });
      alert('설정 오류가 발생했습니다. 페이지를 새로고침해주세요.');
      return;
    }
    
    const studentName = newStudentName.trim();
    markProgressPageDirty();
    const newStudents = [...students, studentName];
    setStudents(newStudents);
    
    // 새 학생의 진행 상태 초기화
    const studentProgressData = {
      vocabulary: false,
      bodeum1: false,
      bodeum2: false,
      bodeum3: false,
      bodeum4: false,
      bodeum5: false,
      bodeum6: false,
      bodeum7: false,
      bodeum8: false,
      bodeum9: false,
      bodeum10: false,
      vision1: false,
      vision2: false,
      vision3: false,
      vision4: false,
    };
    
    // 강 추가 (학교/학년별)
    try {
      chapterConfig.chapters.forEach(chapter => {
        studentProgressData[`${chapterConfig.fieldPrefix}${chapter}`] = false;
      });
    } catch (error) {
      console.error('학생 진행 상태 초기화 중 오류:', error, { chapterConfig, studentName });
      alert('학생 추가 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
      return;
    }
    
    const newProgressData = {
      ...progressData,
      [studentName]: studentProgressData,
    };
    setProgressData(newProgressData);
    
    // 새 학생의 점수 초기화
    const studentScores = {
      bodeum1: '',
      bodeum2: '',
      bodeum3: '',
      bodeum4: '',
      bodeum5: '',
      bodeum6: '',
      bodeum7: '',
      bodeum8: '',
      bodeum9: '',
      bodeum10: '',
      vision1: '',
      vision2: '',
      vision3: '',
      vision4: '',
    };
    
    // 강별 점수 초기화 (학교/학년별)
    try {
      chapterConfig.chapters.forEach(chapter => {
        studentScores[`${chapterConfig.fieldPrefix}${chapter}`] = '';
      });
    } catch (error) {
      console.error('학생 점수 초기화 중 오류:', error, { chapterConfig, studentName });
    }
    
    const newScores = {
      ...scores,
      [studentName]: studentScores,
    };
    setScores(newScores);
    
    console.log('학생 추가 완료:', { studentName, school, grade, selectedClass, chapterConfig, studentProgressData, studentScores });
    
    setNewStudentName('');
  };

  // 학생 제거 (퇴원)
  const handleRemoveStudent = (student) => {
    if (window.confirm(`${student} 학생을 퇴원 처리하시겠습니까?`)) {
      markProgressPageDirty();
      const newStudents = students.filter(s => s !== student);
      setStudents(newStudents);
      
      // 해당 학생의 데이터 제거
      const newProgressData = { ...progressData };
      delete newProgressData[student];
      setProgressData(newProgressData);
      
      const newScores = { ...scores };
      delete newScores[student];
      setScores(newScores);
      
      // 해당 학생의 전화번호 제거
      const newPhoneNumbers = { ...phoneNumbers };
      delete newPhoneNumbers[student];
      setPhoneNumbers(newPhoneNumbers);
    }
  };
  
  // 전화번호 포맷팅 (010-1234-5678)
  const formatPhoneNumber = (value) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    if (cleaned.length <= 11) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };

  // 전화번호 변경 핸들러 (학생/학부모 구분)
  const handlePhoneNumberChange = (student, phoneNumber, type = 'student') => {
    const formatted = formatPhoneNumber(phoneNumber);
    const cleanedPhone = formatted.replace(/-/g, '').trim();
    markProgressPageDirty();
    
    // 입력 중 플래그 설정
    phoneInputInProgressRef.current.add(student);
    
    // 즉시 상태 업데이트
    setPhoneNumbers(prev => {
      const currentStudentPhone = prev[student] || {};
      const updated = {
        ...prev,
        [student]: {
          ...(typeof currentStudentPhone === 'object' ? currentStudentPhone : {}),
        },
      };
      
      // 빈 전화번호는 객체에서 제거 (undefined로 두지 않음)
      if (cleanedPhone === '' || cleanedPhone === null) {
        // 해당 타입의 전화번호 제거
        if (updated[student] && typeof updated[student] === 'object') {
          delete updated[student][type];
          
          // 모든 전화번호가 비어있으면 해당 학생 객체 삭제
          if (Object.keys(updated[student]).length === 0) {
            delete updated[student];
          }
        } else {
          delete updated[student];
        }
      } else {
        // 유효한 전화번호인 경우에만 설정
        if (!updated[student] || typeof updated[student] !== 'object') {
          updated[student] = {};
        }
        updated[student][type] = cleanedPhone;
      }
      
      return updated;
    });
    
    // 5초 후 입력 중 플래그 제거 (입력이 끝났다고 가정)
    setTimeout(() => {
      phoneInputInProgressRef.current.delete(student);
    }, 5000);
  };
  
  // 학생 전화번호만 변경하는 헬퍼 함수 (하위 호환성)
  const handleStudentPhoneChange = (student, phoneNumber) => {
    handlePhoneNumberChange(student, phoneNumber, 'student');
  };
  
  // 학부모 전화번호만 변경하는 헬퍼 함수
  const handleParentPhoneChange = (student, phoneNumber) => {
    handlePhoneNumberChange(student, phoneNumber, 'parent');
  };
  
  // 헤더 텍스트 변경 핸들러
  const handleHeaderTextChange = (type, key, value) => {
    markProgressPageDirty();
    setHeaderTexts(prev => {
      if (type === 'mainTitle') {
        return {
          ...prev,
          [type]: value,
        };
      }
      return {
        ...prev,
        [type]: {
          ...prev[type],
          [key]: value,
        },
      };
    });
  };

  const handleTestGroupTitleChange = useCallback((groupId, value) => {
    markProgressPageDirty();
    setHeaderTexts((prev) => ({
      ...prev,
      testGroups: normalizeTestGroups(prev, progressData, scores).map((group) =>
        group.id === groupId ? { ...group, title: value } : group
      ),
    }));
  }, [markProgressPageDirty, progressData, scores]);

  const handleTestGroupItemLabelChange = useCallback((groupId, itemId, value) => {
    markProgressPageDirty();
    setHeaderTexts((prev) => ({
      ...prev,
      testGroups: normalizeTestGroups(prev, progressData, scores).map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map((item) => (item.id === itemId ? { ...item, label: value } : item)),
            }
          : group
      ),
    }));
  }, [markProgressPageDirty, progressData, scores]);

  const handleTestGroupItemMaxScoreChange = useCallback((groupId, itemId, value) => {
    const cleanedValue = String(value || '').replace(/[^0-9.]/g, '');
    markProgressPageDirty();
    setHeaderTexts((prev) => ({
      ...prev,
      testGroups: normalizeTestGroups(prev, progressData, scores).map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map((item) =>
                item.id === itemId ? { ...item, maxScore: cleanedValue } : item
              ),
            }
          : group
      ),
    }));
  }, [markProgressPageDirty, progressData, scores]);

  const handleAddTestGroupItem = useCallback((groupId) => {
    markProgressPageDirty();
    setHeaderTexts((prev) => ({
      ...prev,
      testGroups: normalizeTestGroups(prev, progressData, scores).map((group) =>
        group.id === groupId
          ? { ...group, items: [...group.items, createDynamicGroupItem(groupId)] }
          : group
      ),
    }));
  }, [markProgressPageDirty, progressData, scores]);

  const handleRemoveTestGroupItem = useCallback((groupId, itemId) => {
    markProgressPageDirty();
    setHeaderTexts((prev) => ({
      ...prev,
      testGroups: normalizeTestGroups(prev, progressData, scores).map((group) =>
        group.id === groupId
          ? { ...group, items: group.items.filter((item) => item.id !== itemId) }
          : group
      ),
    }));
  }, [markProgressPageDirty, progressData, scores]);

  const handleRestoreFromLatestKakaoSnapshot = useCallback(async () => {
    const snapshotEntries = kakaoSendHistory.filter((entry) => entry?.snapshot && typeof entry.snapshot === 'object');
    if (snapshotEntries.length === 0) {
      alert('이 반에는 복구에 사용할 카카오톡 스냅샷 이력이 없습니다.');
      return;
    }

    const entriesByDate = new Map();
    snapshotEntries.forEach((entry) => {
      const dateKey = getHistoryDateKey(entry.sentAt) || 'unknown';
      if (!entriesByDate.has(dateKey)) entriesByDate.set(dateKey, []);
      entriesByDate.get(dateKey).push(entry);
    });

    const dateOptions = Array.from(entriesByDate.entries()).sort(([a], [b]) => String(b).localeCompare(String(a)));
    let selectedDateKey = dateOptions[0]?.[0] || '';

    if (dateOptions.length > 1) {
      const selectionMessage = [
        '복구할 카카오톡 스냅샷 날짜를 선택하세요.',
        '가장 최근 날짜가 기본값입니다.',
        '',
        ...dateOptions.map(([dateKey, entries], index) => {
          const studentCount = new Set(entries.map((entry) => entry.student).filter(Boolean)).size;
          return `${index + 1}. ${formatHistoryDateLabel(dateKey)} (${studentCount}명, ${entries.length}건)`;
        }),
        '',
        '번호를 입력하세요.',
      ].join('\n');
      const rawSelection = window.prompt(selectionMessage, '1');
      if (rawSelection === null) return;
      const selectedIndex = Number.parseInt(String(rawSelection).trim(), 10);
      if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > dateOptions.length) {
        alert('올바른 번호를 입력해주세요.');
        return;
      }
      selectedDateKey = dateOptions[selectedIndex - 1][0];
    }

    const selectedEntries = entriesByDate.get(selectedDateKey) || snapshotEntries;

    const latestByStudent = new Map();
    selectedEntries.forEach((entry) => {
      const studentName = String(entry.student || '').trim();
      if (!studentName) return;
      const prev = latestByStudent.get(studentName);
      const currentWeight = getSnapshotRecoveryWeight(entry.snapshot);
      const prevWeight = getSnapshotRecoveryWeight(prev?.snapshot);
      if (
        !prev ||
        currentWeight > prevWeight ||
        (currentWeight === prevWeight && String(prev.sentAt || '') < String(entry.sentAt || ''))
      ) {
        latestByStudent.set(studentName, entry);
      }
    });

    if (latestByStudent.size === 0) {
      alert('선택한 날짜에 복구 가능한 학생별 카카오톡 스냅샷이 없습니다.');
      return;
    }

    if (
      !window.confirm(
        `${formatHistoryDateLabel(selectedDateKey)} 카카오톡 발송 이력 스냅샷으로 이 반의 진행 데이터 일부를 복구할까요? 현재 값 위에 덮어씁니다.`
      )
    ) {
      return;
    }

    const nextProgressData = JSON.parse(JSON.stringify(progressData || {}));
    const nextScores = JSON.parse(JSON.stringify(scores || {}));
    let nextHeaderTexts = {
      ...headerTexts,
      testGroups: normalizeTestGroups(headerTexts, progressData, scores),
    };

    const firstSnapshot = Array.from(latestByStudent.values()).find((entry) => entry?.snapshot);
    if (firstSnapshot?.snapshot) {
      const snapshot = firstSnapshot.snapshot;
      const nextChapters = { ...(nextHeaderTexts.chapters || {}) };
      const nextVisible = [];
      (Array.isArray(snapshot.chapters) ? snapshot.chapters : []).forEach((chapter) => {
        const fieldKey = String(chapter?.fieldKey || '').trim();
        const prefix = `${chapterConfig.fieldPrefix}`;
        if (fieldKey.startsWith(prefix)) {
          const chapterNo = Number(fieldKey.slice(prefix.length));
          if (!Number.isNaN(chapterNo) && chapterConfig.chapters.includes(chapterNo)) {
            if (!nextVisible.includes(chapterNo)) nextVisible.push(chapterNo);
            nextChapters[chapterNo] = String(chapter?.label || nextChapters[chapterNo] || '').trim();
          }
        }
      });

      nextHeaderTexts = {
        ...nextHeaderTexts,
        mainTitle: String(snapshot.mainTitle || nextHeaderTexts.mainTitle || '').trim(),
        chapters: nextChapters,
        visibleChapters: nextVisible.length > 0 ? nextVisible : nextHeaderTexts.visibleChapters,
        testGroups: Array.isArray(snapshot.testGroups)
          ? snapshot.testGroups.map((group) => ({
              id: String(group?.id || '').trim(),
              title: String(group?.title || '').trim(),
              items: Array.isArray(group?.items)
                ? group.items
                    .map((item) => ({
                      id: String(item?.fieldKey || item?.id || '').trim(),
                      label: String(item?.label || '').trim(),
                      maxScore: String(item?.maxScore || '').trim(),
                    }))
                    .filter((item) => item.id)
                : [],
            }))
          : nextHeaderTexts.testGroups,
      };
    }

    latestByStudent.forEach((entry, studentName) => {
      const snapshot = entry?.snapshot;
      if (!snapshot || typeof snapshot !== 'object') return;
      const nextStudentProgress = { ...(nextProgressData[studentName] || {}) };
      const nextStudentScores = { ...(nextScores[studentName] || {}) };

      (Array.isArray(snapshot.chapters) ? snapshot.chapters : []).forEach((chapter) => {
        const fieldKey = String(chapter?.fieldKey || '').trim();
        if (!fieldKey) return;
        nextStudentProgress[fieldKey] = Boolean(chapter?.completed);
      });

      if (snapshot.vocabulary) {
        nextStudentProgress.vocabulary = Boolean(snapshot.vocabulary.completed);
      }

      (Array.isArray(snapshot.testGroups) ? snapshot.testGroups : []).forEach((group) => {
        (Array.isArray(group?.items) ? group.items : []).forEach((item) => {
          const fieldKey = String(item?.fieldKey || item?.id || '').trim();
          if (!fieldKey) return;
          nextStudentProgress[fieldKey] = Boolean(item?.completed);
          const score = String(item?.score || '').trim();
          if (score) nextStudentScores[fieldKey] = score;
        });
      });

      nextProgressData[studentName] = nextStudentProgress;
      nextScores[studentName] = nextStudentScores;
    });

    setHeaderTexts(nextHeaderTexts);
    setProgressData(nextProgressData);
    setScores(nextScores);
    markProgressPageDirty();

    try {
      setSavingProgress(true);
      setSaveProgressMessage(`${formatHistoryDateLabel(selectedDateKey)} 카카오톡 스냅샷 복구 저장 중...`);
      await saveData(students, nextProgressData, nextScores, nextHeaderTexts, phoneNumbers);
      clearProgressPageDirty();
      setSaveProgressMessage(`✅ ${formatHistoryDateLabel(selectedDateKey)} 카카오톡 스냅샷 기준으로 복구 저장 완료!`);
      setTimeout(() => setSaveProgressMessage(''), 2500);
    } catch (error) {
      console.error('카카오톡 스냅샷 복구 실패:', error);
      setSaveProgressMessage('❌ 카카오톡 스냅샷 복구 실패');
      setTimeout(() => setSaveProgressMessage(''), 3000);
    } finally {
      setSavingProgress(false);
    }
  }, [
    chapterConfig.chapters,
    chapterConfig.fieldPrefix,
    clearProgressPageDirty,
    headerTexts,
    kakaoSendHistory,
    markProgressPageDirty,
    phoneNumbers,
    progressData,
    saveData,
    scores,
    students,
  ]);

  // 카카오톡 전송 미리보기 생성 (솔라피 API 사용 전 단계)
  const handleKakaoSend = async () => {
    if (students.length === 0) {
      alert('학생이 없습니다.');
      return;
    }

    // 전화번호가 없는 학생 체크 (학생 전화번호 필수)
    const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
    const studentsWithoutPhone = students.filter(student => {
      const phoneData = phoneNumbers[student];
      // 기존 형식 (문자열) 호환
      const studentPhone = typeof phoneData === 'string' ? phoneData : phoneData?.student;
      return !studentPhone || studentPhone.length < 10 || !phoneRegex.test(studentPhone);
    });

    // 전화번호가 없는 학생이 있으면 먼저 안내
    if (studentsWithoutPhone.length > 0) {
      const missingPhoneList = studentsWithoutPhone.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
      const alertMessage = `학생 전화번호가 입력되지 않은 학생이 ${studentsWithoutPhone.length}명 있습니다:\n\n${missingPhoneList}\n\n위 학생들의 전화번호를 테이블의 "전화번호" 열에서 먼저 입력해주세요.\n\n(학생 전화번호는 필수이며, 학부모 전화번호는 선택사항입니다)\n\n입력 후 다시 카카오톡 전송 버튼을 눌러주세요.`;
      alert(alertMessage);
      return;
    }

    const trimmedTemplateCode = savedTemplateCode;
  
    // 미리보기용 메시지 배열 생성
    const title = getTitle(); // 모든 학생에게 동일하게 사용
    const messages = [];
  
    for (const student of students) {
      // 저장된 전화번호 확인
      const phoneData = phoneNumbers[student];
      // 기존 형식 (문자열) 호환
      const studentPhone = typeof phoneData === 'string' ? phoneData : phoneData?.student;
      const parentPhone = typeof phoneData === 'string' ? null : phoneData?.parent;
      
      // 학생 전화번호 형식 최종 검증
      const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
      if (!studentPhone || !phoneRegex.test(studentPhone)) {
        // 이 단계까지 오면 거의 없겠지만, 안전하게 한 번 더 검증
        console.warn(`${student} 학생: 전화번호 형식 오류로 미리보기에서 제외됩니다.`);
        continue;
      }
  
      // 해당 학생의 메시지 생성 (한 번만)
      let content = '';
      
      // 공지 문구 추가 (모든 학생 메시지에 포함)
      content += `📢 내신대비 전체 과제 완료도입니다.\n\n`;
      content += `1. 모든 과제는 선생님과 클리닉 선생님들께 검사를 받으면 됩니다.\n\n`;
      content += `2. 일부 완료는 완료로 체크되지 않습니다. 전체 완료만 완료입니다.\n\n`;
      content += `3. 완료하였는데 체크되지 않은 것이 있다면 채널로 알려주고 확인을 받아주세요.\n\n`;
      content += `4. 제출기간이 아닌 것은 아직 숙제로 나가지 않았지만, 과제로 나갈 예정인 과제입니다.\n\n\n\n`;
      
      // 해당 학생의 진행 상황만 표시
      content += `👤 ${student}\n\n`;
        
      // 강별(모의고사) 체크
      visibleChapters.forEach(chapter => {
        const field = `${chapterConfig.fieldPrefix}${chapter}`;
        const isCompleted = progressData[student]?.[field] || false;
        const chapterText = headerTexts.chapters?.[chapter] || getDefaultChapterLabel(chapter);
        const mainTitle = String(headerTexts.mainTitle || '').trim();
        
        // 반 전체 학생이 모두 미완료인지 확인
        const allStudentsIncomplete = students.every(s => !progressData[s]?.[field]);
        
        // 올림포스2는 📖 아이콘 사용
        const icon = '📖';
        // 제출기간 아님(모든 학생이 미완료)인 경우 메시지에서 제외
        if (!allStudentsIncomplete) {
          if (isCompleted) {
            content += `${icon} ${mainTitle ? `${mainTitle} ` : ''}${chapterText}: 완료\n`;
          } else {
            content += `${icon} ${mainTitle ? `${mainTitle} ` : ''}${chapterText}: 미완료\n`;
          }
        }
      });
      
      visibleTestGroupItems.forEach((group) => {
        const groupTitle = String(group.title || '').trim() || '카테고리';
        const groupIcon = group.id === 'vision' ? '👁️' : '📝';
        const groupLines = [];

        group.items.forEach((item, itemIndex) => {
          const fieldKey = item.id;
          const isCompleted = progressData[student]?.[fieldKey] || false;
          const score = scores[student]?.[fieldKey];
          const itemLabel = String(item.label || '').trim() || `${itemIndex + 1}회`;
          const allStudentsIncomplete = students.every(
            (s) => !progressData[s]?.[fieldKey] && !String(scores[s]?.[fieldKey] || '').trim()
          );
          if (allStudentsIncomplete) return;

          if (String(score || '').trim() !== '') {
            const scoreStats = includeScoreStatsInKakao ? scoreStatMap.get(fieldKey) : null;
            const maxScore = parseScoreNumber(item?.maxScore);
            const detailParts = [];
            if (maxScore !== null) detailParts.push(`${formatScoreStat(maxScore)}점 만점`);
            if (scoreStats) detailParts.push(`평균 ${formatScoreStat(scoreStats.average)}점`);
            const detailSuffix = detailParts.length > 0 ? ` (${detailParts.join(', ')})` : '';
            const detailInlineSuffix = detailParts.length > 0 ? `, ${detailParts.join(', ')}` : '';

            if (includeAggregateScoreSummaryInKakao && group.items.length > 1) {
              groupLines.push(`${itemIndex + 1}) ${itemLabel} : ${score}점${detailSuffix}`);
            } else {
              content += `${groupIcon} ${groupTitle} ${itemLabel}: 완료(${score}점${detailInlineSuffix})\n`;
            }
          } else if (includeAggregateScoreSummaryInKakao && group.items.length > 1) {
            groupLines.push(`${itemIndex + 1}) ${itemLabel} : 미입력`);
          } else if (isCompleted) {
            content += `${groupIcon} ${groupTitle} ${itemLabel}: 완료\n`;
          } else {
            content += `${groupIcon} ${groupTitle} ${itemLabel}: 미완료\n`;
          }
        });

        if (includeAggregateScoreSummaryInKakao && groupLines.length > 0 && group.items.length > 1) {
          content += `\n${groupTitle}\n\n`;
          content += `${groupLines.join('\n')}\n\n`;

          const aggregateStats = groupAggregateStatMap.get(group.id);
          const totalScore = aggregateStats?.totalByStudent?.get(student);
          const totalRank = aggregateStats?.rankByStudent?.get(student);

          if (totalScore !== undefined && totalScore !== null) {
            const aggregateParts = [];
            if (aggregateStats?.maxTotal !== null && aggregateStats?.maxTotal !== undefined) {
              aggregateParts.push(`${formatScoreStat(aggregateStats.maxTotal)}점 만점`);
            }
            if (aggregateStats) {
              aggregateParts.push(`평균 ${formatScoreStat(aggregateStats.average)}점`);
            }
            content += `◈ 합산 결과 : ${formatScoreStat(totalScore)}점`;
            if (aggregateParts.length > 0) {
              content += ` (${aggregateParts.join(', ')})`;
            }
            content += `\n`;
          }

          if (aggregateStats && totalRank) {
            content += `◈ 석차 : ${totalRank}등 (${aggregateStats.totalCount}명 응시)\n`;
          }
        }
      });
      
      // 어휘워크북
      const isVocabularyCompleted = progressData[student]?.vocabulary || false;
      const allStudentsIncompleteVocabulary = students.every(s => !progressData[s]?.vocabulary);
      
      // 어휘워크북은 📚 아이콘 사용
      const vocabularyIcon = '📚';
      // 제출기간 아님(모든 학생이 미완료)인 경우 메시지에서 제외
      if (!allStudentsIncompleteVocabulary) {
        if (isVocabularyCompleted) {
          content += `${vocabularyIcon} 어휘워크북: 완료\n`;
        } else {
          content += `${vocabularyIcon} 어휘워크북: 미완료\n`;
        }
      }
  
      // 발송할 전화번호 목록 (학생 필수, 학부모 선택)
      const phonesToSend = [{ phone: studentPhone, type: '학생' }];
      if (parentPhone && phoneRegex.test(parentPhone)) {
        phonesToSend.push({ phone: parentPhone, type: '학부모' });
      }
  
      messages.push({
        student,
        phones: phonesToSend,
        content,
      });
    }
    
    if (messages.length === 0) {
      alert('전송할 수 있는 카카오톡 메시지가 없습니다. 전화번호와 데이터를 다시 확인해주세요.');
      return;
    }
  
    setKakaoPreview({
      templateCode: savedTemplateCode,
      messages,
    });
  
    alert('카카오톡 전송 미리보기가 아래에 준비되었습니다. 내용을 확인한 후 "최종 카카오톡 발송하기" 버튼을 눌러주세요.');
  };
  
  // 카카오톡 실제 전송 - 미리보기 확정 후 실행
  const handleKakaoSendConfirm = async () => {
    console.log('🔵 handleKakaoSendConfirm 함수 호출됨');
    console.log('🔵 kakaoPreview 상태:', kakaoPreview);
    
    if (!kakaoPreview || !kakaoPreview.messages || kakaoPreview.messages.length === 0) {
      alert('먼저 "카카오톡 전송 미리보기" 버튼을 눌러 미리보기를 생성해주세요.');
      return;
    }
  
    // 미리보기에서 저장된 템플릿 코드와 메시지 사용 (다시 입력받지 않음)
    // ⚠️ 여기서는 prompt를 호출하지 않습니다!
    const { templateCode, messages } = kakaoPreview;
    
    if (!templateCode) {
      alert('템플릿 코드가 없습니다. 미리보기를 다시 생성해주세요.');
      return;
    }
    
    console.log('✅ 최종 발송 시작 - 템플릿 코드:', templateCode, '메시지 개수:', messages.length);
    console.log('✅ prompt를 호출하지 않습니다. 저장된 템플릿 코드를 사용합니다.');
    try {
      await saveData(students, progressData, scores, headerTexts, phoneNumbers);
      clearProgressPageDirty();
    } catch (error) {
      console.error('카카오톡 발송 전 데이터 저장 실패:', error);
    }
    const title = getTitle();
    let successCount = 0;
    let failCount = 0;
    const errorMessages = []; // 오류 메시지 수집용
    const sentAt = new Date().toISOString();
    const historyEntriesByStudent = new Map(
      messages.map((message) => [
        message.student,
        {
          id: `${message.student}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          student: message.student,
          title,
          content: message.content,
          templateCode,
          sentAt,
          status: 'pending',
          recipients: [],
          snapshot: buildStudentSendSnapshot(message.student),
        },
      ])
    );

    try {
      await saveKakaoHistoryEntries(Array.from(historyEntriesByStudent.values()));
    } catch (error) {
      console.error('카카오톡 발송 전 스냅샷 저장 실패:', error);
    }
  
    for (const message of messages) {
      const { student, phones, content } = message;
      const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
      const sentRecipients = [];
      
      for (const { phone, type } of phones) {
        const phoneNumber = phone;
        if (!phoneNumber || !phoneRegex.test(phoneNumber)) {
          console.warn(`${student} ${type} 전화번호 형식 오류로 발송에서 제외됩니다.`);
          failCount++;
          continue;
        }
  
        try {
          // API URL 설정 (로컬 개발 환경에서는 프로덕션 URL 사용)
          const apiUrl = import.meta.env.PROD 
            ? `${window.location.origin}/api/send-kakao`
            : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phoneNumber: phoneNumber.replace(/-/g, ''),
              templateCode: templateCode,
              variables: {
                '과제제목': title,
                '과제내용': content,
              },
            }),
          });
          
          // 응답 본문 읽기 (상태 코드와 관계없이)
          const responseText = await response.text();
          
          // 응답 상태 확인
          if (!response.ok) {
            // 오류 응답도 JSON일 수 있으므로 파싱 시도
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            if (responseText) {
              try {
                const errorResult = JSON.parse(responseText);
                errorMessage = errorResult.error || errorResult.message || errorMessage;
                if (errorResult.details) {
                  errorMessage += ` (${errorResult.details})`;
                }
              } catch (e) {
                // JSON이 아니면 텍스트 그대로 사용
                errorMessage = responseText || errorMessage;
              }
            }
            throw new Error(errorMessage);
          }
          
          // 응답 본문이 비어있는지 확인
          if (!responseText || responseText.trim() === '') {
            throw new Error('서버 응답이 비어있습니다.');
          }
          
          // JSON 파싱 시도
          let result;
          try {
            result = JSON.parse(responseText);
          } catch (parseError) {
            console.error('JSON 파싱 실패. 응답 내용:', responseText);
            throw new Error(`서버 응답 형식 오류: ${parseError.message}`);
          }
          
          if (result.success) {
            successCount++;
            console.log(`✅ ${student} 학생 ${type}에게 카카오톡 발송 성공`);
            sentRecipients.push({ type, phone: phoneNumber });
          } else {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${student} 학생 ${type} 카카오톡 전송 실패:`, error);
          failCount++;
          const errorMessage = error.message || '알 수 없는 오류';
          // 오류 메시지 수집 (중복 제거)
          if (!errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }
        }
      }

      const historyEntry = historyEntriesByStudent.get(student);
      if (historyEntry) {
        historyEntriesByStudent.set(student, {
          ...historyEntry,
          recipients: sentRecipients,
          status:
            sentRecipients.length === phones.length
              ? 'sent'
              : sentRecipients.length > 0
                ? 'partial'
                : 'failed',
        });
      }
    }
    
    // 모든 발송 시도 후 오류 메시지 한 번만 표시
    if (errorMessages.length > 0) {
      alert(`❌ 카카오톡 발송 오류:\n${errorMessages.join('\n')}`);
    }
    
    try {
      await saveKakaoHistoryEntries(Array.from(historyEntriesByStudent.values()));
    } catch (error) {
      console.error('카카오톡 전송 이력 저장 실패:', error);
      if (successCount > 0) {
        alert(`⚠️ 카카오톡은 발송됐지만 전송 이력 저장에 실패했습니다: ${error.message}`);
      }
    }

    if (successCount > 0) {
      alert(`✅ ${successCount}건의 카카오톡 메시지가 성공적으로 발송되었습니다!${failCount > 0 ? `\n❌ ${failCount}건 발송 실패` : ''}`);
      // 발송 성공 후 미리보기 상태 유지 (같은 내용으로 다시 발송 가능)
    } else if (failCount > 0 && errorMessages.length === 0) {
      // 오류 메시지가 없으면 일반 실패 메시지 표시
      alert(`❌ 모든 카카오톡 발송 실패 (${failCount}건)`);
    }
    
    // 템플릿 코드는 kakaoPreview에서 가져온 것을 사용하므로 다시 물어보지 않음
    console.log('카카오톡 발송 완료. 사용된 템플릿 코드:', templateCode);
  };

  const handleScheduledKakaoSend = async () => {
    if (!kakaoPreview || !kakaoPreview.messages || kakaoPreview.messages.length === 0) {
      alert('먼저 "카카오톡 전송 미리보기" 버튼을 눌러 미리보기를 생성해주세요.');
      return;
    }
    if (!scheduledSendAt) {
      alert('예약 발송 시간을 입력해주세요.');
      return;
    }
    const scheduledDate = new Date(scheduledSendAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      alert('예약 발송 시간이 올바르지 않습니다.');
      return;
    }
    if (scheduledDate.getTime() <= Date.now() + 60 * 1000) {
      alert('예약 시간은 현재보다 1분 이상 이후로 설정해주세요.');
      return;
    }

    const { templateCode, messages } = kakaoPreview;
    if (!templateCode) {
      alert('템플릿 코드가 없습니다. 미리보기를 다시 생성해주세요.');
      return;
    }

    try {
      await saveData(students, progressData, scores, headerTexts, phoneNumbers);
      clearProgressPageDirty();
    } catch (e) {
      console.error('예약 전 저장 실패', e);
    }

    setScheduleSending(true);
    const title = getTitle();
    let successCount = 0;
    let failCount = 0;
    const errorMessages = [];

    try {
      const apiUrl = import.meta.env.PROD
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      for (const message of messages) {
        const { phones, content } = message;
        const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;

        for (const { phone } of phones) {
          if (!phone || !phoneRegex.test(phone)) continue;
          try {
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phoneNumber: phone.replace(/-/g, ''),
                templateCode,
                variables: { '과제제목': title, '과제내용': content },
                scheduleDate: scheduledDate.toISOString(),
              }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || `HTTP ${response.status}`);
            successCount++;
          } catch (error) {
            failCount++;
            const msg = error?.message || '알 수 없는 오류';
            if (!errorMessages.includes(msg)) errorMessages.push(msg);
          }
        }
      }

      if (errorMessages.length > 0) {
        alert(`❌ 예약발송 오류:\n${errorMessages.join('\n')}`);
      }
      if (successCount > 0) {
        alert(`✅ ${successCount}건 예약발송 접수 완료\n예약 시각: ${scheduledSendAt.replace('T', ' ')}${failCount > 0 ? `\n❌ ${failCount}건 접수 실패` : ''}`);
      } else {
        alert('❌ 예약 접수된 메시지가 없습니다. 전화번호와 예약 시간을 확인해주세요.');
      }
    } catch (error) {
      console.error('예약발송 처리 중 오류:', error);
      alert(`❌ 예약발송 중 오류가 발생했습니다: ${error?.message || error}`);
    } finally {
      setScheduleSending(false);
    }
  };
  
  // 제목 생성 (학교명 없이 반/학년만 표시)
  const getTitle = () => {
    if (docIdOverride) {
      return `${docIdOverride} 전체 완성도와 테스트관리`;
    }
    if (school === '중학교 1학년') {
      if (teacher) {
        return `${school} ${teacher} 선생님 전체 완성도와 테스트관리`;
      }
      return `${school} 전체 완성도와 테스트관리`;
    }
    if (grade && selectedClass) {
      return `${grade} ${selectedClass} 전체 완성도와 테스트관리`;
    }
    if (grade) return `${grade} 전체 완성도와 테스트관리`;
    if (selectedClass) return `${selectedClass} 전체 완성도와 테스트관리`;
    return '전체 완성도와 테스트관리';
  };
  
  return (
    <div className="homework-progress-page">
      <div className="homework-progress-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>데이터를 불러오는 중...</p>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              Firebase에서 실시간 데이터를 동기화하고 있습니다.
            </p>
          </div>
        ) : (
          <>
            <div className="homework-progress-header">
              <h2>{getTitle()}</h2>
              <button className="close-btn" onClick={onClose}>닫기</button>
            </div>
            
            <div className="homework-progress-tabs">
              <button 
                className={`tab-btn ${activeTab === 'progress' ? 'active' : ''}`}
                onClick={() => setActiveTab('progress')}
              >
                전체 과제 상황
              </button>
              <button 
                className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                진도와 과제
              </button>
            </div>
            
            <div className="homework-progress-content">
          {activeTab === 'progress' && (
            <div className="progress-section">
              <div className="section-header">
                <h3>전체 과제 상황</h3>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {saveProgressMessage && (
                    <span className={`save-detail-message ${saveProgressMessage.includes('✅') ? 'success' : saveProgressMessage.includes('❌') ? 'error' : 'info'}`}>
                      {saveProgressMessage}
                    </span>
                  )}
                  <button
                    className="save-detail-btn"
                    onClick={handleSaveProgressPage}
                    disabled={savingProgress}
                  >
                    {savingProgress ? '저장 중...' : hasUnsavedProgress ? '💾 전체 과제 상황 저장' : '저장됨'}
                  </button>
                  {firebaseError && (
                    <div style={{ 
                      background: '#fee', 
                      color: '#c33', 
                      padding: '8px 12px', 
                      borderRadius: '6px',
                      fontSize: '12px',
                      maxWidth: '400px'
                    }}>
                      ⚠️ {firebaseError}
                      <br />
                      <a 
                        href="https://console.firebase.google.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#0066cc', textDecoration: 'underline', fontSize: '11px' }}
                      >
                        Firebase 설정 가이드 보기
                      </a>
                    </div>
                  )}
                  <label className="kakao-option-toggle">
                    <input
                      type="checkbox"
                      checked={includeScoreStatsInKakao}
                      onChange={(e) => setIncludeScoreStatsInKakao(e.target.checked)}
                    />
                    <span>점수 입력 완료 시 평균/석차 포함</span>
                  </label>
                  <label className="kakao-option-toggle">
                    <input
                      type="checkbox"
                      checked={includeAggregateScoreSummaryInKakao}
                      onChange={(e) => setIncludeAggregateScoreSummaryInKakao(e.target.checked)}
                    />
                    <span>테스트 여러 개면 합산 결과로 보내기</span>
                  </label>
                  <button className="kakao-btn" onClick={handleKakaoSend}>
                    <span className="kakao-icon">💬</span>
                    카카오톡 전송 미리보기
                  </button>
                </div>
              </div>
              
              {kakaoPreview && kakaoPreview.messages && kakaoPreview.messages.length > 0 && (
                <div className="kakao-preview-panel">
                  <h4>카카오톡 전송 미리보기</h4>
                  <p className="kakao-preview-subtitle">
                    템플릿 코드: <span className="kakao-preview-code">{kakaoPreview.templateCode}</span>
                  </p>
                  <div className="kakao-preview-list">
                    {kakaoPreview.messages.map((msg) => (
                      <div key={msg.student} className="kakao-preview-item">
                        <div className="kakao-preview-item-header">
                          <span className="kakao-preview-student">👤 {msg.student}</span>
                          <span className="kakao-preview-phones">
                            {msg.phones.map(({ phone, type }, idx) => (
                              <span key={`${msg.student}-${type}-${idx}`}>
                                {idx > 0 && ' / '}
                                {type}: {formatPhoneNumber(phone)}
                              </span>
                            ))}
                          </span>
                        </div>
                        <pre className="kakao-preview-content">
{msg.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: '#fffbeb', borderRadius: '8px', margin: '12px 0', flexWrap: 'wrap' }}>
                    <label style={{ fontWeight: 700, color: '#9a3412' }}>예약 발송 시간</label>
                    <input
                      type="datetime-local"
                      value={scheduledSendAt}
                      onChange={(e) => setScheduledSendAt(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid #fdba74', borderRadius: '8px', background: 'white' }}
                    />
                    <span style={{ color: '#7c2d12', fontSize: '0.9rem' }}>예약 시 같은 내용을 지정 시간에 발송합니다.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button 
                      className="kakao-btn kakao-send-final-btn" 
                      onClick={handleKakaoSendConfirm}
                      disabled={scheduleSending}
                    >
                      ✅ 최종 카카오톡 발송하기
                    </button>
                    <button
                      className="kakao-btn"
                      onClick={handleScheduledKakaoSend}
                      disabled={scheduleSending}
                      style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white' }}
                    >
                      {scheduleSending ? '예약 접수 중...' : '⏰ 예약발송'}
                    </button>
                  </div>
                </div>
              )}

              <div className="progress-table-wrapper">
                <table className="progress-table">
                  <thead>
                    <tr>
                      <th rowSpan="2" className="student-sticky-cell" style={{ width: '90px', minWidth: '90px', maxWidth: '90px', padding: '12px 16px', boxSizing: 'border-box' }}>학생</th>
                      <th colSpan={Math.max(1, visibleChapters.length)}>
                        <div className="header-main-group">
                          <input
                            type="text"
                            className="header-input main-header-input"
                            value={headerTexts.mainTitle || ''}
                            onChange={(e) => handleHeaderTextChange('mainTitle', 'title', e.target.value)}
                            placeholder="교재명"
                          />
                          <button
                            type="button"
                            className="chapter-add-btn"
                            onClick={handleAddChapterColumn}
                            disabled={visibleChapters.length >= chapterConfig.chapters.length}
                            title="강 추가"
                          >
                            +
                          </button>
                        </div>
                      </th>
                      <th rowSpan="2">어휘워크북</th>
                      {visibleTestGroupItems.map((group) => (
                        <th key={`group-top-${group.id}`} colSpan={Math.max(1, group.items.length)}>
                          <div className="header-main-group">
                            <input
                              type="text"
                              className="header-input main-header-input"
                              value={group.title || ''}
                              onChange={(e) => handleTestGroupTitleChange(group.id, e.target.value)}
                              placeholder="카테고리명"
                            />
                            <button
                              type="button"
                              className="chapter-add-btn"
                              onClick={() => handleAddTestGroupItem(group.id)}
                              title="카테고리 칸 추가"
                            >
                              +
                            </button>
                          </div>
                        </th>
                      ))}
                      <th rowSpan="2" style={{ backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 'bold', width: '180px', minWidth: '180px', maxWidth: '180px', padding: '12px 16px', boxSizing: 'border-box' }}>
                        📱 전화번호<br/>
                        <span style={{ fontSize: '11px', fontWeight: 'normal' }}>(위: 학부모, 아래: 학생)</span>
                      </th>
                      <th rowSpan="2">퇴원</th>
                    </tr>
                    <tr>
                      {visibleChapters.map((chapter) => {
                        const defaultValue = getDefaultChapterLabel(chapter);
                        const currentValue = headerTexts.chapters?.[chapter];
                        return (
                          <th key={`${chapterConfig.fieldPrefix}-h-${chapter}`} className="header-input-cell">
                            <div className="dynamic-header-cell">
                              <input
                                type="text"
                                className="header-input"
                                value={currentValue || defaultValue}
                                onChange={(e) => handleHeaderTextChange('chapters', chapter, e.target.value)}
                                placeholder={defaultValue}
                              />
                              <div className="header-action-buttons">
                                <button
                                  type="button"
                                  className="header-inline-add-btn"
                                  onClick={handleAddChapterColumn}
                                  title="강 칸 추가"
                                  disabled={visibleChapters.length >= chapterConfig.chapters.length}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </th>
                        );
                      })}
                      {visibleTestGroupItems.map((group) =>
                        group.items.length > 0 ? (
                          group.items.map((item, index) => (
                            <th key={`${group.id}-${item.id}`} className="header-input-cell">
                              <div className="dynamic-header-cell">
                                <input
                                  type="text"
                                  className="header-input"
                                  value={item.label || ''}
                                  onChange={(e) => handleTestGroupItemLabelChange(group.id, item.id, e.target.value)}
                                  placeholder={`${index + 1}회`}
                                />
                                <div className="test-item-meta-row">
                                  <input
                                    type="text"
                                    className="test-item-max-score-input"
                                    value={item.maxScore || ''}
                                    onChange={(e) => handleTestGroupItemMaxScoreChange(group.id, item.id, e.target.value)}
                                    placeholder="만점"
                                    inputMode="decimal"
                                  />
                                </div>
                                <div className="header-action-buttons">
                                  <button
                                    type="button"
                                    className="header-inline-add-btn"
                                    onClick={() => handleAddTestGroupItem(group.id)}
                                    title="칸 추가"
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    className="header-remove-btn"
                                    onClick={() => handleRemoveTestGroupItem(group.id, item.id)}
                                    title="칸 삭제"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            </th>
                          ))
                        ) : (
                          <th key={`${group.id}-empty`} className="header-input-cell header-empty-cell">
                            <button
                              type="button"
                              className="header-empty-add-btn"
                              onClick={() => handleAddTestGroupItem(group.id)}
                            >
                              +
                            </button>
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStudents.map((student) => (
                        <tr key={student}>
                        <td className="student-name">
                          <button
                            type="button"
                            className="student-history-btn"
                            onClick={() => setSelectedHistoryStudent(student)}
                          >
                            {student}
                          </button>
                        </td>
                        {visibleChapters.map((chapter) => (
                          <td key={`${chapterConfig.fieldPrefix}-${student}-${chapter}`}>
                            <input
                              type="checkbox"
                              checked={progressData[student]?.[`${chapterConfig.fieldPrefix}${chapter}`] || false}
                              onChange={() => handleCheckboxChange(student, `${chapterConfig.fieldPrefix}${chapter}`)}
                            />
                          </td>
                        ))}
                        {/* 어휘워크북 */}
                        <td>
                          <input
                            type="checkbox"
                            checked={progressData[student]?.vocabulary || false}
                            onChange={() => handleCheckboxChange(student, 'vocabulary')}
                          />
                        </td>
                        {visibleTestGroupItems.map((group) =>
                          group.items.length > 0 ? (
                            group.items.map((item) => (
                              <td key={`${student}-${item.id}`}>
                                <div className="assignment-cell">
                                  <input
                                    type="checkbox"
                                    checked={progressData[student]?.[item.id] || false}
                                    onChange={() => handleCheckboxChange(student, item.id)}
                                  />
                                  <input
                                    type="text"
                                    className="score-input"
                                    placeholder="점수"
                                    value={scores[student]?.[item.id] || ''}
                                    onChange={(e) => handleScoreChange(student, item.id, e.target.value)}
                                  />
                                </div>
                              </td>
                            ))
                          ) : (
                            <td key={`${student}-${group.id}-empty`} className="assignment-empty-cell"></td>
                          )
                        )}
                        <td className="phone-number-cell">
                          <div className="phone-input-container">
                            <input
                              type="tel"
                              className="phone-input phone-input-parent"
                              placeholder="학부모: 010-1234-5678"
                              value={phoneNumbers[student]?.parent ? formatPhoneNumber(phoneNumbers[student].parent) : ''}
                              onChange={(e) => handleParentPhoneChange(student, e.target.value)}
                              maxLength="13"
                            />
                            <input
                              type="tel"
                              className="phone-input phone-input-student"
                              placeholder="학생: 010-1234-5678"
                              value={phoneNumbers[student]?.student ? formatPhoneNumber(phoneNumbers[student].student) : (typeof phoneNumbers[student] === 'string' ? formatPhoneNumber(phoneNumbers[student]) : '')}
                              onChange={(e) => handleStudentPhoneChange(student, e.target.value)}
                              maxLength="13"
                            />
                          </div>
                        </td>
                        <td className="remove-student-cell">
                          <button
                            className="remove-btn"
                            onClick={() => handleRemoveStudent(student)}
                            title="퇴원"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* 학생 추가 행 */}
                    <tr className="add-student-row">
                      <td>
                        <input
                          type="text"
                          className="new-student-input"
                          placeholder="학생 이름"
                          value={newStudentName}
                          onChange={(e) => setNewStudentName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleAddStudent();
                            }
                          }}
                        />
                      </td>
                      <td colSpan={visibleChapters.length + 1 + totalVisibleTestColumns + 2}>
                        <button
                          className="add-student-btn"
                          onClick={handleAddStudent}
                        >
                          + 학생 추가
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {activeTab === 'all' && (
            <div className="all-assignment-section">
              <div className="progress-detail-header">
                <h3>진도와 과제</h3>
                <div className="progress-detail-actions">
                  {saveDetailMessage && (
                    <span className={`save-detail-message ${saveDetailMessage.includes('✅') ? 'success' : saveDetailMessage.includes('❌') ? 'error' : 'info'}`}>
                      {saveDetailMessage}
                    </span>
                  )}
                  <button
                    className="save-detail-btn"
                    onClick={handleSaveProgressDetail}
                    disabled={savingDetail}
                  >
                    {savingDetail ? '저장 중...' : hasUnsavedDetail ? '💾 진도와 과제 저장' : '저장됨'}
                  </button>
                </div>
              </div>
              <div className="progress-detail-table-wrapper">
                <table className="progress-detail-table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>진도</th>
                      <th>과제</th>
                      <th>태도</th>
                      <th>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getTuesdayThursdayDates.map((dateInfo) => {
                      const dateKey = dateInfo.fullDateString;
                      const record = progressDetailData[dateKey] || { progress: '', assignment: '', attitude: '', notes: '' };
                      
                      return (
                        <tr key={dateKey}>
                          <td className="date-cell">
                            <div className="date-display">
                              <span className="date-day">{dateInfo.dayOfWeek}</span>
                              <span className="date-string">{dateInfo.dateString}</span>
                            </div>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="detail-input"
                              value={record.progress || ''}
                              onChange={(e) => {
                                dirtyDetailDatesRef.current.add(dateKey);
                                markDetailPageDirty();
                                setProgressDetailData(prev => ({
                                  ...prev,
                                  [dateKey]: {
                                    ...(prev[dateKey] || {}),
                                    progress: e.target.value,
                                  }
                                }));
                              }}
                              placeholder="진도 입력"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="detail-input"
                              value={record.assignment || ''}
                              onChange={(e) => {
                                dirtyDetailDatesRef.current.add(dateKey);
                                markDetailPageDirty();
                                setProgressDetailData(prev => ({
                                  ...prev,
                                  [dateKey]: {
                                    ...(prev[dateKey] || {}),
                                    assignment: e.target.value,
                                  }
                                }));
                              }}
                              placeholder="과제 입력"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="detail-input"
                              value={record.attitude || ''}
                              onChange={(e) => {
                                dirtyDetailDatesRef.current.add(dateKey);
                                markDetailPageDirty();
                                setProgressDetailData(prev => ({
                                  ...prev,
                                  [dateKey]: {
                                    ...(prev[dateKey] || {}),
                                    attitude: e.target.value,
                                  }
                                }));
                              }}
                              placeholder="태도 입력"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="detail-input"
                              value={record.notes || ''}
                              onChange={(e) => {
                                dirtyDetailDatesRef.current.add(dateKey);
                                markDetailPageDirty();
                                setProgressDetailData(prev => ({
                                  ...prev,
                                  [dateKey]: {
                                    ...(prev[dateKey] || {}),
                                    notes: e.target.value,
                                  }
                                }));
                              }}
                              placeholder="비고 입력"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
            </div>
          </>
        )}
      </div>
      {selectedHistoryStudent && (
        <div className="student-history-modal-overlay" onClick={() => setSelectedHistoryStudent(null)}>
          <div className="student-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="student-history-modal-header">
              <h3>{selectedHistoryStudent} 카카오톡 이력</h3>
              <button className="close-btn" onClick={() => setSelectedHistoryStudent(null)}>닫기</button>
            </div>
            <div className="student-history-modal-body">
              {selectedStudentHistoryEntries.length === 0 ? (
                <div className="student-history-empty">저장된 카카오톡 전송 이력이 없습니다.</div>
              ) : (
                selectedStudentHistoryEntries.map((entry) => (
                  <div key={entry.id} className="student-history-entry">
                    <div className="student-history-entry-time">
                      {entry.sentAt ? new Date(entry.sentAt).toLocaleString() : '-'}
                    </div>
                    <div className="student-history-entry-meta">
                      <strong>{entry.title || '전체 완성도와 테스트관리'}</strong>
                      <span>템플릿: {entry.templateCode || '-'}</span>
                      <span>
                        수신자: {entry.recipients.length > 0
                          ? entry.recipients.map((recipient) => `${recipient.type} ${recipient.phone}`).join(', ')
                          : '-'}
                      </span>
                    </div>
                    <pre className="student-history-entry-content">{entry.content}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
