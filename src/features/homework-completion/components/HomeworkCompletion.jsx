import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import ApiKeyInput from '../../../components/ApiKeyInput';
import './HomeworkCompletion.css';

const HOMEWORK_COMPLETION_PHONE_DOC = 'homeworkCompletionPhoneNumbers';
const HOMEWORK_COMPLETION_PHONE_DOC_ID = 'all';
const SEND_HISTORY_COLLECTION = 'homeworkCompletionSendHistory';

/**
 * { 날짜: { 반명: 값 } } 형태 — 비동기 Firestore 로드가 늦게 도착해도 이미 편집한 날짜/반 데이터가 덮어쓰이지 않도록 병합.
 * 값이 객체면 얕게 병합(로컬 키 우선), 배열이면 로컬 배열로 대체.
 */
function mergeDateClassKeyed(prevLocal, server) {
  const out = server && typeof server === 'object' ? JSON.parse(JSON.stringify(server)) : {};
  if (!prevLocal || typeof prevLocal !== 'object') return out;
  Object.keys(prevLocal).forEach((date) => {
    const lDay = prevLocal[date];
    if (!lDay || typeof lDay !== 'object') return;
    out[date] = out[date] || {};
    Object.keys(lDay).forEach((cls) => {
      const lVal = lDay[cls];
      const sVal = out[date][cls];
      if (Array.isArray(lVal)) {
        out[date][cls] = lVal.slice();
      } else if (lVal && typeof lVal === 'object' && !Array.isArray(lVal)) {
        out[date][cls] = { ...(sVal && typeof sVal === 'object' && !Array.isArray(sVal) ? sVal : {}), ...lVal };
      } else {
        out[date][cls] = lVal;
      }
    });
  });
  return out;
}

/** 로컬(기기) 기준 YYYY-MM-DD. toISOString()은 UTC라 한국 자정 전후에 캘린더·날짜 입력과 저장 키가 어긋날 수 있음 */
function formatLocalYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLocalYearMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** StudentDataModal과 동일 키 — 완료도에서 학생 삭제 시 학생 데이터 화면 퇴원 목록에 반영 */
const STUDENT_DATA_WITHDRAWN_STORAGE_KEY = 'studentDataWithdrawnNames';
const ENGLISH_HOMEWORK_PROGRESS_COLLECTION = 'englishHomeworkProgress';

function addStudentNameToWithdrawnLocalStorage(studentName) {
  const trimmed = String(studentName || '').trim();
  if (!trimmed) return;
  try {
    const raw = localStorage.getItem(STUDENT_DATA_WITHDRAWN_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return;
    if (!arr.includes(trimmed)) {
      arr.push(trimmed);
      localStorage.setItem(STUDENT_DATA_WITHDRAWN_STORAGE_KEY, JSON.stringify(arr));
    }
  } catch (e) {
    console.warn('학생 데이터 퇴원 목록(localStorage) 반영 실패:', e);
  }
}

async function removeStudentFromEnglishHomeworkProgressDocs(dbInstance, studentName) {
  const trimmed = String(studentName || '').trim();
  if (!trimmed || !dbInstance) return;
  const collRef = collection(dbInstance, ENGLISH_HOMEWORK_PROGRESS_COLLECTION);
  const snap = await getDocs(collRef);
  for (const d of snap.docs) {
    const data = d.data() || {};
    const studs = Array.isArray(data.students) ? data.students : [];
    if (!studs.includes(trimmed)) continue;
    const newStudents = studs.filter((s) => s !== trimmed);
    const progressData =
      data.progressData && typeof data.progressData === 'object' && !Array.isArray(data.progressData)
        ? { ...data.progressData }
        : {};
    delete progressData[trimmed];
    const scores =
      data.scores && typeof data.scores === 'object' && !Array.isArray(data.scores) ? { ...data.scores } : {};
    delete scores[trimmed];
    const phoneNumbers =
      data.phoneNumbers && typeof data.phoneNumbers === 'object' && !Array.isArray(data.phoneNumbers)
        ? { ...data.phoneNumbers }
        : {};
    delete phoneNumbers[trimmed];
    const progressDetailData =
      data.progressDetailData &&
      typeof data.progressDetailData === 'object' &&
      !Array.isArray(data.progressDetailData)
        ? { ...data.progressDetailData }
        : {};
    delete progressDetailData[trimmed];
    await setDoc(
      doc(dbInstance, ENGLISH_HOMEWORK_PROGRESS_COLLECTION, d.id),
      {
        students: newStudents,
        progressData,
        scores,
        phoneNumbers,
        progressDetailData,
        lastUpdated: new Date().toISOString(),
      },
      { merge: true }
    );
  }
}

/** 날짜→반→학생명 트리에서 목록에 없는 학생 키 제거 (삭제 학생이 서버 완료도에 남는 문제 방지) */
function pruneRemovedStudentsFromDateTree(blob, validStudentSet) {
  if (!blob || typeof blob !== 'object') return;
  Object.keys(blob).forEach((date) => {
    const day = blob[date];
    if (!day || typeof day !== 'object') return;
    Object.keys(day).forEach((cls) => {
      const row = day[cls];
      if (!row || typeof row !== 'object' || Array.isArray(row)) return;
      Object.keys(row).forEach((nm) => {
        if (!validStudentSet.has(nm)) delete row[nm];
      });
    });
  });
}

// 전송 이력 저장: Firestore에서 현재 이력 읽기 → 새 항목 병합 → 저장 (덮어쓰기 방지)
const saveSendHistoryToFirestore = async (dbInstance, date, entriesToAdd) => {
  const docRef = doc(dbInstance, SEND_HISTORY_COLLECTION, 'all');
  const snap = await getDoc(docRef);
  const existing = snap.exists() ? (snap.data().history || {}) : {};
  const entries = Array.isArray(entriesToAdd) ? entriesToAdd : [entriesToAdd];
  const merged = {
    ...existing,
    [date]: [...(existing[date] || []), ...entries],
  };
  const stripUndefined = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripUndefined).filter(v => v !== undefined);
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = typeof v === 'object' && v !== null ? stripUndefined(v) : v;
    }
    return out;
  };
  await setDoc(docRef, {
    history: stripUndefined(merged),
    lastUpdated: new Date().toISOString(),
  }, { merge: true });
  return merged;
};

// 반명 파싱 (여러 반 구분: "26_김지수_미적분1 특강_월금_14:30,26_신희진팀_고2통합 영어 겨울_수토_17:30")
// 형식: 년도_강사_수업이름_요일_시간
const parseClassNames = (classNameStr) => {
  if (!classNameStr || typeof classNameStr !== 'string') return [];
  // 쉼표로 구분 (반리스트 형식)
  return classNameStr
    .split(',')
    .map(c => c.trim())
    .filter(c => c !== '');
};

// 반명을 읽기 쉽게 포맷팅 (년도_강사_수업이름_요일_시간 → 수업이름 (요일 시간))
const formatClassName = (className) => {
  if (!className) return className;
  const parts = className.split('_');
  if (parts.length >= 5) {
    // 년도_강사_수업이름_요일_시간 형식
    const courseName = parts[2];
    const day = parts[3];
    const time = parts[4];
    return `${courseName} (${day} ${time})`;
  }
  return className;
};

// sendHistory에 진도목록이 없을 때, 저장된 진도상황 문자열에서 항목명만 추출 (예: "1강: 완료" → "1강")
const parseProgressLabelsFromSituation = (text) => {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  const seen = new Set();
  text.split('\n').forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const i = t.indexOf(':');
    if (i <= 0) return;
    const label = t.slice(0, i).trim();
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  });
  return out;
};

// 숙제 과제 완료도 관리 컴포넌트
export default function HomeworkCompletion({ onClose, apiKey, onApiKeySet }) {
  const [students, setStudents] = useState([]);
  const [commentAiLoading, setCommentAiLoading] = useState(null);
  const [studentInfo, setStudentInfo] = useState({}); // {학생명: {school, grade, className}}
  const [phoneNumbers, setPhoneNumbers] = useState({}); // {학생명: {student: '010...', parent: '010...'}}
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // 학생 데이터 불러오기 실패 시 메시지
  const [saving, setSaving] = useState(false); // 저장 버튼으로 Firebase 저장 중
  const [selectedTeacher, setSelectedTeacher] = useState(''); // 선생님 선택 (빈 값이면 미선택)
  const [selectedClass, setSelectedClass] = useState('all'); // 'all' 또는 특정 반명
  const [completionData, setCompletionData] = useState({}); // {반명: {학생명: {과제명: {completed: boolean, percentage: string(메모)}}}}
  const [homeworkName, setHomeworkName] = useState(''); // 과제명 입력
  const [sending, setSending] = useState(false); // 카톡 전송 중
  const [homeworkList, setHomeworkList] = useState({}); // {반명: [과제목록]}
  const [newHomeworkName, setNewHomeworkName] = useState(''); // 새 과제명 입력
  const [newProgressName, setNewProgressName] = useState(''); // 새 진도 항목 입력
  const [showPreview, setShowPreview] = useState(false); // 미리보기 표시 여부
  const [previewSendType, setPreviewSendType] = useState(null); // 'notice' 또는 'completion' 또는 null (일반 미리보기)
  const [showAddStudentForm, setShowAddStudentForm] = useState(false); // 학생 추가 폼 표시 여부
  const [newStudentForm, setNewStudentForm] = useState({
    name: '',
    school: '',
    grade: '',
    className: '',
    studentPhone: '',
    parentPhone: '',
  });
  const [sentCounts, setSentCounts] = useState({}); // {날짜: {반명: {학생명: {notice: 숫자, completion: 숫자}}}}
  const [sendHistory, setSendHistory] = useState({}); // {날짜: [{반명, 학생명, 과제목록, 타입(notice/completion), 시간}]}
  // 학생 이름 클릭 시 표시할 카카오톡 전송 이력 모달
  const [studentKakaoHistoryOpen, setStudentKakaoHistoryOpen] = useState(false)
  const [studentKakaoHistoryTarget, setStudentKakaoHistoryTarget] = useState(null)
  const [studentKakaoHistoryEntries, setStudentKakaoHistoryEntries] = useState([]) // [{date, 반명, 학생명, 과제목록, 타입, 시간}]
  const [currentDate, setCurrentDate] = useState(formatLocalYMD()); // YYYY-MM-DD 형식 (로컬)
  const [showCalendar, setShowCalendar] = useState(true); // 캘린더 표시 여부 (기본값: true)
  const [selectedMonth, setSelectedMonth] = useState(formatLocalYearMonth()); // YYYY-MM 형식 (로컬)
  const [selectedDateDetail, setSelectedDateDetail] = useState(null); // 선택한 날짜의 상세 정보
  const [selectedDateForCompletion, setSelectedDateForCompletion] = useState(null); // 완료도 입력을 위한 선택한 날짜
  const [selectedDateForHomework, setSelectedDateForHomework] = useState(null); // 과제 입력을 위한 선택한 날짜
  const [dateHomeworkInput, setDateHomeworkInput] = useState(''); // 날짜별 과제 입력 필드
  const [dateProgressInput, setDateProgressInput] = useState(''); // 날짜별 진도 입력 필드
  const [dateCompletionData, setDateCompletionData] = useState({}); // {날짜: {반명: {학생명: {과제명: {completed: boolean, percentage: string(메모)}}}}}
  const [dateHomeworkList, setDateHomeworkList] = useState({}); // {날짜: {반명: [과제목록]}}
  const [progressList, setProgressList] = useState({}); // {반명: [진도항목목록]}
  const [dateProgressList, setDateProgressList] = useState({}); // {날짜: {반명: [진도항목목록]}}
  const [progressData, setProgressData] = useState({}); // {반명: {학생명: {진도항목: string}}}
  const [dateProgressData, setDateProgressData] = useState({}); // {날짜: {반명: {학생명: {진도항목: string}}}}
  const [tableDisplayDate, setTableDisplayDate] = useState(() => formatLocalYMD()); // 표에 표시할 과제 날짜 (캘린더·input type=date와 동일 로컬 기준)
  const [showAddClassForm, setShowAddClassForm] = useState(false); // 반 추가 폼 표시 여부
  const [newClassForm, setNewClassForm] = useState({
    year: new Date().getFullYear().toString().slice(-2), // 현재 년도 2자리
    teacher: '',
    courseName: '',
    day: '',
    time: '',
  });
  const [addedClassList, setAddedClassList] = useState([]); // 반 추가 폼으로만 추가한 반(학생 0명일 수 있음)
  /** 삭제된 반 이력: { [학생명]: [{ className, removedAt }] } — 학생 데이터에서 이전 수강 반 표시용 */
  const [studentClassHistory, setStudentClassHistory] = useState({});

  // 학생 이름 클릭: 해당 학생에게 보내진 카톡 전송 이력을 모달로 표시
  const handleStudentNameClick = useCallback((studentName) => {
    if (!studentName) return

    const entries = []
    const historyObj = sendHistory || {}

    for (const [date, items] of Object.entries(historyObj)) {
      const dayItems = Array.isArray(items) ? items : []
      dayItems.forEach((item) => {
        const raw = item?.학생명
        const itemNames =
          typeof raw === 'string' && raw.includes(',')
            ? raw.split(',').map((n) => n.trim()).filter(Boolean)
            : [raw].filter(Boolean)

        if (itemNames.includes(studentName)) {
          entries.push({
            date,
            반명: item?.반명,
            학생명: studentName,
            과제목록: item?.과제목록,
            타입: item?.타입,
            시간: item?.시간,
          })
        }
      })
    }

    entries.sort((a, b) => {
      const ta = new Date(a.시간 || a.date).getTime()
      const tb = new Date(b.시간 || b.date).getTime()
      return tb - ta
    })

    setStudentKakaoHistoryTarget(studentName)
    setStudentKakaoHistoryEntries(entries)
    setStudentKakaoHistoryOpen(true)
  }, [sendHistory])

  // 숙제 과제 완료도 전용 전화번호/학생 데이터 불러오기 (다른 메뉴와 분리)
  useEffect(() => {
    const loadData = async () => {
      if (!isFirebaseConfigured() || !db) {
        setLoading(false);
        return;
      }

      try {
        setLoadError(null);
        const docRef = doc(db, HOMEWORK_COMPLETION_PHONE_DOC, HOMEWORK_COMPLETION_PHONE_DOC_ID);
        const docSnapshot = await getDoc(docRef);

        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const studentList = data.students || [];
          const infoData = data.studentInfo || {};
          const phoneData = data.phoneNumbers || {};
          const savedAddedClasses = data.addedClassList || [];

          setStudents(studentList);
          setStudentInfo(infoData);
          setPhoneNumbers(phoneData);
          setAddedClassList(Array.isArray(savedAddedClasses) ? savedAddedClasses : []);
          const hist = data.studentClassHistory;
          setStudentClassHistory(hist && typeof hist === 'object' && !Array.isArray(hist) ? hist : {});
          console.log('✅ 숙제 과제 완료도 학생/전화번호 불러옴:', { 학생수: studentList.length, 전화번호수: Object.keys(phoneData).length, 추가반: savedAddedClasses.length });
        }
      } catch (error) {
        console.error('학생 데이터 불러오기 실패:', error);
        const isPermission = error?.code === 'permission-denied' || error?.message?.includes('permission');
        if (isPermission) {
          setLoadError('Firestore 권한 오류입니다. 규칙을 배포해주세요: 터미널에서 "firebase deploy --only firestore:rules" 실행 (FIRESTORE_RULES_DEPLOY.md 참고)');
        } else {
          setLoadError(error?.message || '데이터를 불러오지 못했습니다.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // 저장 버튼: 학생·연락처·추가반은 화면 상태를 기준으로 저장(삭제 유지). 완료도·과제는 현재 선택한 반만 병합.
  const saveAllToFirebase = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않아 저장할 수 없습니다.');
      return;
    }
    setSaving(true);
    try {
      const phoneRef = doc(db, HOMEWORK_COMPLETION_PHONE_DOC, HOMEWORK_COMPLETION_PHONE_DOC_ID);
      const phoneSnap = await getDoc(phoneRef);
      const existingPhone = phoneSnap.exists() ? phoneSnap.data() : {};
      const serverStudentInfo = existingPhone.studentInfo || {};
      const serverPhoneNumbers = existingPhone.phoneNumbers || {};
      // 삭제한 학생이 서버 목록과 다시 합쳐져 복구되지 않도록: 현재 students 배열만 저장
      const mergedStudents = [...students];
      const mergedStudentInfo = {};
      const mergedPhoneNumbers = {};
      students.forEach((name) => {
        mergedStudentInfo[name] =
          studentInfo[name] !== undefined ? studentInfo[name] : serverStudentInfo[name] || {};
        mergedPhoneNumbers[name] =
          phoneNumbers[name] !== undefined ? phoneNumbers[name] : serverPhoneNumbers[name] || {};
      });
      const mergedAddedClassList = [...new Set(addedClassList)];
      const serverHist = existingPhone.studentClassHistory && typeof existingPhone.studentClassHistory === 'object' && !Array.isArray(existingPhone.studentClassHistory)
        ? existingPhone.studentClassHistory
        : {};
      const mergedStudentClassHistory = {};
      students.forEach((name) => {
        const a = Array.isArray(serverHist[name]) ? serverHist[name] : [];
        const b = Array.isArray(studentClassHistory?.[name]) ? studentClassHistory[name] : [];
        const sig = new Set();
        const merged = [];
        for (const e of [...a, ...b]) {
          if (!e || typeof e !== 'object') continue;
          const k = `${e.className}|${e.removedAt || ''}`;
          if (sig.has(k)) continue;
          sig.add(k);
          merged.push({ className: e.className, removedAt: e.removedAt || '' });
        }
        merged.sort((x, y) => String(y.removedAt || '').localeCompare(String(x.removedAt || '')));
        mergedStudentClassHistory[name] = merged;
      });
      await setDoc(phoneRef, {
        students: mergedStudents,
        studentInfo: mergedStudentInfo,
        phoneNumbers: mergedPhoneNumbers,
        addedClassList: mergedAddedClassList,
        studentClassHistory: mergedStudentClassHistory,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });
      setStudentClassHistory(mergedStudentClassHistory);

      const dateDataRef = doc(db, 'homeworkCompletionDateData', 'all');
      const dateSnap = await getDoc(dateDataRef);
      let existingCompletion = (dateSnap.exists() ? dateSnap.data().completionData : null) || {};
      let existingHomeworkList = (dateSnap.exists() ? dateSnap.data().homeworkList : null) || {};
      let existingProgressList = (dateSnap.exists() ? dateSnap.data().progressList : null) || {};
      let existingProgressData = (dateSnap.exists() ? dateSnap.data().progressData : null) || {};

      const validStudentSet = new Set(students);
      pruneRemovedStudentsFromDateTree(existingCompletion, validStudentSet);
      pruneRemovedStudentsFromDateTree(existingProgressData, validStudentSet);

      if (selectedClass !== 'all') {
        Object.keys(dateCompletionData).forEach(date => {
          if (!existingCompletion[date]) existingCompletion[date] = {};
          const val = dateCompletionData[date]?.[selectedClass] ?? existingCompletion[date][selectedClass];
          existingCompletion[date][selectedClass] = val !== undefined ? val : {};
        });
        Object.keys(dateHomeworkList).forEach(date => {
          if (!existingHomeworkList[date]) existingHomeworkList[date] = {};
          const val = dateHomeworkList[date]?.[selectedClass] ?? existingHomeworkList[date][selectedClass];
          existingHomeworkList[date][selectedClass] = val !== undefined ? val : [];
        });
        Object.keys(dateProgressList).forEach(date => {
          if (!existingProgressList[date]) existingProgressList[date] = {};
          const val = dateProgressList[date]?.[selectedClass] ?? existingProgressList[date][selectedClass];
          existingProgressList[date][selectedClass] = val !== undefined ? val : [];
        });
        Object.keys(dateProgressData).forEach(date => {
          if (!existingProgressData[date]) existingProgressData[date] = {};
          const val = dateProgressData[date]?.[selectedClass] ?? existingProgressData[date][selectedClass];
          existingProgressData[date][selectedClass] = val !== undefined ? val : {};
        });
        const stripUndefined = (obj) => {
          if (obj === null || typeof obj !== 'object') return obj;
          const out = Array.isArray(obj) ? [] : {};
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (v === undefined) continue;
            out[k] = typeof v === 'object' && v !== null ? stripUndefined(v) : v;
          }
          return out;
        };
        await setDoc(dateDataRef, {
          completionData: stripUndefined(existingCompletion),
          homeworkList: stripUndefined(existingHomeworkList),
          progressList: stripUndefined(existingProgressList),
          progressData: stripUndefined(existingProgressData),
          lastUpdated: new Date().toISOString(),
        }, { merge: true });
        alert(`✅ 저장되었습니다. (학생·연락처·추가반 반영 + "${formatClassName(selectedClass)}" 반 완료도·과제만 반영)`);
      } else {
        const stripUndefined = (obj) => {
          if (obj === null || typeof obj !== 'object') return obj;
          const out = Array.isArray(obj) ? [] : {};
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (v === undefined) continue;
            out[k] = typeof v === 'object' && v !== null ? stripUndefined(v) : v;
          }
          return out;
        };
        await setDoc(
          dateDataRef,
          {
            completionData: stripUndefined(existingCompletion),
            progressData: stripUndefined(existingProgressData),
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        );
        alert(
          '✅ 학생·연락처·추가반이 저장되었습니다. 삭제한 학생의 완료도·진도 기록도 서버에서 정리했습니다.\n반을 선택한 뒤 저장하면 해당 반의 과제·진도 목록까지 함께 저장됩니다.'
        );
      }
    } catch (error) {
      console.error('저장 실패:', error);
      alert(`❌ 저장 실패: ${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  }, [students, studentInfo, phoneNumbers, addedClassList, studentClassHistory, dateCompletionData, dateHomeworkList, dateProgressList, dateProgressData, selectedClass, db]);

  // 현재 날짜 확인 및 초기화
  useEffect(() => {
    setCurrentDate(formatLocalYMD());
  }, []);

  // 전송 횟수 실시간 업데이트 (Firestore에서) - 날짜별로 관리
  useEffect(() => {
    if (!isFirebaseConfigured() || !db) return;

    const docRef = doc(db, 'homeworkCompletionSentCounts', 'all');
    
    // 실시간 리스너 설정
    const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const allCounts = data.counts || {};
        
        // 오늘 날짜의 전송 횟수만 가져오기
        const today = formatLocalYMD();
        setSentCounts({
          [today]: allCounts[today] || {},
        });
        console.log('✅ 전송 횟수 실시간 업데이트:', allCounts[today]);
      } else {
        // 문서가 없으면 오늘 날짜로 초기화
        const today = formatLocalYMD();
        setSentCounts({
          [today]: {},
        });
      }
    }, (error) => {
      console.error('전송 횟수 실시간 업데이트 실패:', error);
    });

    // 컴포넌트 언마운트 시 리스너 해제
    return () => unsubscribe();
  }, [db]);

  // 전송 이력 실시간 업데이트 (Firestore에서)
  useEffect(() => {
    if (!isFirebaseConfigured() || !db) return;

    const docRef = doc(db, 'homeworkCompletionSendHistory', 'all');
    
    // 실시간 리스너 설정
    const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setSendHistory(data.history || {});
        console.log('✅ 전송 이력 실시간 업데이트:', data.history);
      }
    }, (error) => {
      console.error('전송 이력 실시간 업데이트 실패:', error);
    });

    // 컴포넌트 언마운트 시 리스너 해제
    return () => unsubscribe();
  }, [db]);

  // 날짜별 과제/완료도 최초 1회 로드 (저장 버튼으로만 반영하므로 실시간 구독 제거 → 동시 사용 시 덮어쓰기 방지)
  useEffect(() => {
    if (!isFirebaseConfigured() || !db) return;

    const docRef = doc(db, 'homeworkCompletionDateData', 'all');
    getDoc(docRef).then((docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setDateHomeworkList((prev) => mergeDateClassKeyed(prev, data.homeworkList || {}));
        setDateCompletionData((prev) => mergeDateClassKeyed(prev, data.completionData || {}));
        setDateProgressList((prev) => mergeDateClassKeyed(prev, data.progressList || {}));
        setDateProgressData((prev) => mergeDateClassKeyed(prev, data.progressData || {}));
        const today = formatLocalYMD();
        const todayData = (data.homeworkList || {})[today] || {};
        setHomeworkList(prev => ({ ...prev, ...todayData }));
        const todayProgressData = (data.progressList || {})[today] || {};
        setProgressList(prev => ({ ...prev, ...todayProgressData }));
        console.log('✅ 날짜별 과제/완료도/진도 로드:', { completionData: Object.keys(data.completionData || {}).length });
      }
    }).catch(error => console.error('날짜별 과제/완료도 로드 실패:', error));
  }, [db]);

  // 선생님별로 반 그룹화 (학생 데이터에서 추출)
  const classesByTeacher = useMemo(() => {
    const teacherMap = new Map(); // {선생님명: [반명들]}
    
    students.forEach(student => {
      const className = studentInfo[student]?.className || '';
      if (className) {
        const classes = parseClassNames(className);
        classes.forEach(classFullName => {
          const parts = classFullName.split('_');
          if (parts.length >= 5) {
            const teacher = parts[1];
            if (!teacherMap.has(teacher)) teacherMap.set(teacher, []);
            if (!teacherMap.get(teacher).includes(classFullName)) teacherMap.get(teacher).push(classFullName);
          } else {
            if (!teacherMap.has('기타')) teacherMap.set('기타', []);
            if (!teacherMap.get('기타').includes(classFullName)) teacherMap.get('기타').push(classFullName);
          }
        });
      }
    });
    
    const sortedTeachers = Array.from(teacherMap.keys()).sort();
    const result = new Map();
    sortedTeachers.forEach(teacher => {
      result.set(teacher, [...(teacherMap.get(teacher) || [])].sort());
    });
    return result;
  }, [students, studentInfo]);

  // 반 추가 폼으로 추가한 반까지 합친 선생님별 반 목록 (학생이 없어도 반이 보이도록)
  const mergedClassesByTeacher = useMemo(() => {
    const merged = new Map(classesByTeacher);
    addedClassList.forEach(classFullName => {
      const parts = String(classFullName).split('_');
      if (parts.length >= 5) {
        const teacher = parts[1];
        if (!merged.has(teacher)) merged.set(teacher, []);
        if (!merged.get(teacher).includes(classFullName)) merged.get(teacher).push(classFullName);
      } else {
        if (!merged.has('기타')) merged.set('기타', []);
        if (!merged.get('기타').includes(classFullName)) merged.get('기타').push(classFullName);
      }
    });
    const sorted = new Map();
    Array.from(merged.keys()).sort().forEach(teacher => {
      sorted.set(teacher, [...(merged.get(teacher) || [])].sort());
    });
    return sorted;
  }, [classesByTeacher, addedClassList]);
  
  // 선택된 선생님의 반 목록만 (추가한 반 포함)
  const classesForSelectedTeacher = useMemo(() => {
    if (!selectedTeacher) return [];
    return mergedClassesByTeacher.get(selectedTeacher) || [];
  }, [mergedClassesByTeacher, selectedTeacher]);

  // 선생님 변경 시 현재 선택 반이 해당 선생님 반이 아니면 반 선택 초기화
  useEffect(() => {
    if (!selectedTeacher || selectedClass === 'all') return;
    const allowed = mergedClassesByTeacher.get(selectedTeacher) || [];
    if (!allowed.includes(selectedClass)) setSelectedClass('all');
  }, [selectedTeacher, selectedClass, mergedClassesByTeacher]);

  // 모든 반명 추출 (중복 제거) - 하위 호환성을 위해 유지
  const allClasses = useMemo(() => {
    const classSet = new Set();
    mergedClassesByTeacher.forEach((classes) => {
      classes.forEach(c => classSet.add(c));
    });
    return Array.from(classSet).sort();
  }, [mergedClassesByTeacher]);

  // 선택된 반의 학생들 필터링 및 정렬 (선생님 선택 → 반 선택 → 해당 반 아이들)
  const filteredAndSortedStudents = useMemo(() => {
    if (!selectedTeacher) return []; // 선생님 선택 전에는 목록 비움

    let filtered = students;
    const teacherClasses = mergedClassesByTeacher.get(selectedTeacher) || [];
    filtered = students.filter(student => {
      const className = studentInfo[student]?.className || '';
      const classes = parseClassNames(className);
      return classes.some(c => teacherClasses.includes(c));
    });

    if (selectedClass !== 'all') {
      filtered = filtered.filter(student => {
        const className = studentInfo[student]?.className || '';
        const classes = parseClassNames(className);
        return classes.includes(selectedClass);
      });
    }

    // 학교 → 반명 → 이름 순으로 정렬
    return filtered.sort((a, b) => {
      const infoA = studentInfo[a] || {};
      const infoB = studentInfo[b] || {};
      
      // 1. 학교로 비교
      const schoolA = infoA.school || '';
      const schoolB = infoB.school || '';
      if (schoolA !== schoolB) {
        return schoolA.localeCompare(schoolB, 'ko');
      }
      
      // 2. 학교가 같으면 반명으로 비교
      const classA = infoA.className || '';
      const classB = infoB.className || '';
      const classesA = parseClassNames(classA);
      const classesB = parseClassNames(classB);
      
      const firstClassA = classesA[0] || '';
      const firstClassB = classesB[0] || '';
      
      if (firstClassA !== firstClassB) {
        return firstClassA.localeCompare(firstClassB, 'ko');
      }
      
      // 3. 반명도 같으면 이름으로 정렬
      return a.localeCompare(b, 'ko');
    });
  }, [students, studentInfo, selectedClass, selectedTeacher, mergedClassesByTeacher]);

  // 표에 표시할 과제 목록 (캘린더 날짜별 과제 우선, 없으면 상단 과제 추가에서 입력한 것)
  const displayHomeworkList = useMemo(() => {
    if (selectedClass === 'all') return [];
    const dateHomework = dateHomeworkList[tableDisplayDate]?.[selectedClass];
    if (dateHomework && dateHomework.length > 0) return dateHomework;
    return homeworkList[selectedClass] || [];
  }, [selectedClass, tableDisplayDate, dateHomeworkList, homeworkList]);

  // 표가 날짜별 과제를 표시 중인지 (날짜별 완료도 사용)
  const isTableShowingDateHomework = useMemo(() => {
    if (selectedClass === 'all') return false;
    const dateHomework = dateHomeworkList[tableDisplayDate]?.[selectedClass];
    return dateHomework && dateHomework.length > 0;
  }, [selectedClass, tableDisplayDate, dateHomeworkList]);

  // 표에 표시할 진도 목록 (캘린더 날짜별 진도 우선, 없으면 상단 진도 추가에서 입력한 것)
  const displayProgressList = useMemo(() => {
    if (selectedClass === 'all') return [];
    const dateProgress = dateProgressList[tableDisplayDate]?.[selectedClass];
    if (dateProgress && dateProgress.length > 0) return dateProgress;
    return progressList[selectedClass] || [];
  }, [selectedClass, tableDisplayDate, dateProgressList, progressList]);

  // 표가 날짜별 진도를 표시 중인지
  const isTableShowingDateProgress = useMemo(() => {
    if (selectedClass === 'all') return false;
    const dateProgress = dateProgressList[tableDisplayDate]?.[selectedClass];
    return dateProgress && dateProgress.length > 0;
  }, [selectedClass, tableDisplayDate, dateProgressList]);

  // 과제 완료도 업데이트 (반별)
  const updateCompletion = useCallback((studentName, hwName, completed) => {
    if (selectedClass === 'all') return;
    setCompletionData(prev => ({
      ...prev,
      [selectedClass]: {
        ...(prev[selectedClass] || {}),
        [studentName]: {
          ...(prev[selectedClass]?.[studentName] || {}),
          [hwName]: {
            ...(prev[selectedClass]?.[studentName]?.[hwName] || {}),
            completed: completed,
          },
        },
      },
    }));
  }, [selectedClass]);

  // 과제별 메모(자유 입력) 업데이트 (반별). 기존 percentage 필드에 문자열 저장
  const updatePercentage = useCallback((studentName, hwName, value) => {
    if (selectedClass === 'all') return;
    const textValue = value == null ? '' : String(value);
    setCompletionData(prev => ({
      ...prev,
      [selectedClass]: {
        ...(prev[selectedClass] || {}),
        [studentName]: {
          ...(prev[selectedClass]?.[studentName] || {}),
          [hwName]: {
            ...(prev[selectedClass]?.[studentName]?.[hwName] || {}),
            percentage: textValue,
          },
        },
      },
    }));
  }, [selectedClass]);

  // 날짜별 과제 완료도 업데이트 (반별로 분리)
  const updateDateCompletion = useCallback((date, studentName, hwName, completed) => {
    if (selectedClass === 'all') return;
    
    setDateCompletionData(prev => {
      const newData = {
        ...prev,
        [date]: {
          ...(prev[date] || {}),
          [selectedClass]: {
            ...(prev[date]?.[selectedClass] || {}),
            [studentName]: {
              ...(prev[date]?.[selectedClass]?.[studentName] || {}),
              [hwName]: {
                ...(prev[date]?.[selectedClass]?.[studentName]?.[hwName] || {}),
                completed: completed,
              },
            },
          },
        },
      };
      return newData;
    });
  }, [selectedClass]);

  // 날짜별 과제 메모(자유 입력) 업데이트 (반별). 기존 percentage 필드에 문자열 저장
  const updateDatePercentage = useCallback((date, studentName, hwName, value) => {
    if (selectedClass === 'all') return;
    const textValue = value == null ? '' : String(value);
    setDateCompletionData(prev => {
      const newData = {
        ...prev,
        [date]: {
          ...(prev[date] || {}),
          [selectedClass]: {
            ...(prev[date]?.[selectedClass] || {}),
            [studentName]: {
              ...(prev[date]?.[selectedClass]?.[studentName] || {}),
              [hwName]: {
                ...(prev[date]?.[selectedClass]?.[studentName]?.[hwName] || {}),
                percentage: textValue,
              },
            },
          },
        },
      };
      return newData;
    });
  }, [selectedClass]);

  const COMMENT_KEY = '__comment__';
  // 날짜별 학생 코멘트 업데이트 (반별로 분리). '전체' 선택 시 해당 선생님 소속 해당 학생의 모든 반에 동일 코멘트 반영
  const updateDateComment = useCallback((date, studentName, value) => {
    const targetClasses = selectedClass === 'all'
      ? parseClassNames(studentInfo[studentName]?.className || '').filter(c => classesForSelectedTeacher.includes(c))
      : [selectedClass];
    if (targetClasses.length === 0) return;
    setDateCompletionData(prev => {
      const next = { ...prev };
      targetClasses.forEach(cls => {
        next[date] = next[date] || {};
        next[date][cls] = next[date][cls] || {};
        next[date][cls][studentName] = { ...(next[date][cls][studentName] || {}), [COMMENT_KEY]: value };
      });
      return next;
    });
  }, [selectedClass, studentInfo, classesForSelectedTeacher]);
  // 비날짜용 학생 코멘트 업데이트 (반별). '전체' 선택 시 해당 선생님 소속 해당 학생의 모든 반에 동일 코멘트 반영
  const updateCompletionComment = useCallback((studentName, value) => {
    const targetClasses = selectedClass === 'all'
      ? parseClassNames(studentInfo[studentName]?.className || '').filter(c => classesForSelectedTeacher.includes(c))
      : [selectedClass];
    if (targetClasses.length === 0) return;
    setCompletionData(prev => {
      const next = { ...prev };
      targetClasses.forEach(cls => {
        next[cls] = next[cls] || {};
        next[cls][studentName] = { ...(next[cls][studentName] || {}), [COMMENT_KEY]: value };
      });
      return next;
    });
  }, [selectedClass, studentInfo, classesForSelectedTeacher]);

  // 전화번호 수정 (학생/학부모)
  const updatePhoneNumber = useCallback((studentName, field, value) => {
    setPhoneNumbers(prev => ({
      ...prev,
      [studentName]: {
        ...(prev[studentName] || {}),
        [field]: value,
      },
    }));
  }, []);

  const rewriteCommentWithAI = useCallback(async (studentName, shortComment) => {
    if (!apiKey?.trim()) {
      alert('API 키가 없습니다. 메인 화면에서 OpenAI API 키를 설정해주세요.');
      return;
    }
    const trimmed = (shortComment || '').trim();
    if (!trimmed) {
      alert('코멘트를 먼저 간단히 입력한 뒤 사용해주세요.');
      return;
    }
    setCommentAiLoading(studentName);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `당신은 학생을 지도하는 선생님입니다. 짧은 메모를 받으면, 학부모님께 보낼 문자/알림 멘트로 바꿔주세요.

[톤·형식]
- "안녕하세요, ○○ 학부모님."으로 시작하는 학부모 대상 어투.
- 수업 태도/이해도 칭찬 + 다음 과제·복습 안내를 한 흐름으로.
- 과제·암기 부족은 부드럽게 전달하고, "이번 주는 ~하도록 하겠습니다"처럼 구체적 다음 단계 제시.
- 결석·인강 대체 상황이면 시청·복습 확인과 이번 주 계획을 짧게.
- 시험·성적 관련이면 "현재 페이스면 충분히 끌어올릴 수 있습니다"처럼 희망적인 한 줄을 꼭 넣기.
- 문장은 2~4문장 정도로, 진심이 느껴지는 따뜻하고 신뢰감 있는 톤. 다른 설명 없이 멘트만 출력하세요.`,
            },
            {
              role: 'user',
              content: `학생 이름: ${studentName}\n\n다음 메모를 이 학생 학부모님께 보낼 선생님 멘트로 바꿔주세요. "안녕하세요, ${studentName} 학부모님."으로 시작하고, 칭찬/안내/다음 계획과 희망적인 한 줄을 넣어주세요.\n\n메모: ${trimmed}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 280,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 오류: ${response.status}`);
      }
      const data = await response.json();
      const rewritten = (data.choices?.[0]?.message?.content || '').trim();
      if (!rewritten) throw new Error('AI 응답이 비어 있습니다.');
      if (isTableShowingDateHomework) {
        updateDateComment(tableDisplayDate, studentName, rewritten);
      } else {
        updateCompletionComment(studentName, rewritten);
      }
    } catch (e) {
      console.error(e);
      alert(`AI 멘트 변환 실패: ${e?.message || e}`);
    } finally {
      setCommentAiLoading(null);
    }
  }, [apiKey, selectedClass, tableDisplayDate, isTableShowingDateHomework, updateDateComment, updateCompletionComment]);

  // 과제 추가 (반별로 분리)
  const addHomework = useCallback(() => {
    if (selectedClass === 'all') {
      alert('반을 선택한 후 과제를 추가할 수 있습니다.');
      return;
    }
    if (!newHomeworkName.trim()) {
      alert('과제명을 입력해주세요.');
      return;
    }
    const currentClassHomework = homeworkList[selectedClass] || [];
    if (currentClassHomework.includes(newHomeworkName.trim())) {
      alert('이미 존재하는 과제명입니다.');
      return;
    }
    
    const newHomework = newHomeworkName.trim();
    const updatedHomeworkList = [...currentClassHomework, newHomework];
    setHomeworkList(prev => ({
      ...prev,
      [selectedClass]: updatedHomeworkList,
    }));
    setNewHomeworkName('');
    
    // 오늘 날짜의 캘린더에 과제 목록 저장 (로컬만, 저장 버튼으로 반영)
    const today = formatLocalYMD();
    setDateHomeworkList(prev => ({
      ...prev,
      [today]: {
        ...(prev[today] || {}),
        [selectedClass]: [...updatedHomeworkList],
      },
    }));
  }, [newHomeworkName, homeworkList, selectedClass]);

  // 과제 삭제
  const removeHomework = useCallback((hwName) => {
    if (confirm(`"${hwName}" 과제를 삭제하시겠습니까?`)) {
      // 해당 과제의 완료 데이터도 삭제 (반별로 분리)
      if (selectedClass !== 'all') {
        // completionData에서 삭제
        setCompletionData(prev => {
          const newData = { ...prev };
          if (newData[selectedClass]) {
            Object.keys(newData[selectedClass]).forEach(student => {
              if (newData[selectedClass][student][hwName] !== undefined) {
                const { [hwName]: removed, ...rest } = newData[selectedClass][student];
                newData[selectedClass][student] = rest;
              }
            });
          }
          return newData;
        });
        
        // homeworkList에서 삭제
        setHomeworkList(prev => ({
          ...prev,
          [selectedClass]: (prev[selectedClass] || []).filter(hw => hw !== hwName),
        }));
      }
    }
  }, [selectedClass]);

  // 진도 항목 추가 (반별, 과제와 동일하게 캘린더 오늘 날짜에도 반영)
  const addProgress = useCallback(() => {
    if (selectedClass === 'all') {
      alert('반을 선택한 후 진도를 추가할 수 있습니다.');
      return;
    }
    if (!newProgressName.trim()) {
      alert('진도 항목명을 입력해주세요.');
      return;
    }
    const currentClassProgress = progressList[selectedClass] || [];
    if (currentClassProgress.includes(newProgressName.trim())) {
      alert('이미 존재하는 진도 항목입니다.');
      return;
    }
    const newProgress = newProgressName.trim();
    const updatedProgressList = [...currentClassProgress, newProgress];
    setProgressList(prev => ({ ...prev, [selectedClass]: updatedProgressList }));
    setNewProgressName('');
    const today = formatLocalYMD();
    setDateProgressList(prev => ({
      ...prev,
      [today]: {
        ...(prev[today] || {}),
        [selectedClass]: [...updatedProgressList],
      },
    }));
  }, [newProgressName, progressList, selectedClass]);

  // 진도 항목 삭제
  const removeProgress = useCallback((progressName) => {
    if (confirm(`"${progressName}" 진도 항목을 삭제하시겠습니까?`)) {
      if (selectedClass !== 'all') {
        setProgressData(prev => {
          const newData = { ...prev };
          if (newData[selectedClass]) {
            Object.keys(newData[selectedClass]).forEach(student => {
              if (newData[selectedClass][student][progressName] !== undefined) {
                const { [progressName]: removed, ...rest } = newData[selectedClass][student];
                newData[selectedClass][student] = rest;
              }
            });
          }
          return newData;
        });
        setProgressList(prev => ({
          ...prev,
          [selectedClass]: (prev[selectedClass] || []).filter(p => p !== progressName),
        }));
      }
    }
  }, [selectedClass]);

  // 진도 값 업데이트 (반별)
  const updateProgress = useCallback((studentName, progressName, value) => {
    if (selectedClass === 'all') return;
    const textValue = value == null ? '' : String(value);
    setProgressData(prev => ({
      ...prev,
      [selectedClass]: {
        ...(prev[selectedClass] || {}),
        [studentName]: {
          ...(prev[selectedClass]?.[studentName] || {}),
          [progressName]: textValue,
        },
      },
    }));
  }, [selectedClass]);

  // 날짜별 진도 값 업데이트 (반별)
  const updateDateProgress = useCallback((date, studentName, progressName, value) => {
    if (selectedClass === 'all') return;
    const textValue = value == null ? '' : String(value);
    setDateProgressData(prev => ({
      ...prev,
      [date]: {
        ...(prev[date] || {}),
        [selectedClass]: {
          ...(prev[date]?.[selectedClass] || {}),
          [studentName]: {
            ...(prev[date]?.[selectedClass]?.[studentName] || {}),
            [progressName]: textValue,
          },
        },
      },
    }));
  }, [selectedClass]);

  // 학생 삭제
  const handleDeleteStudent = useCallback(async (studentName) => {
    if (!window.confirm(`정말로 ${studentName} 학생을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    try {
      // students 배열에서 제거
      const updatedStudents = students.filter(s => s !== studentName);
      setStudents(updatedStudents);

      // studentInfo에서 제거
      const updatedStudentInfo = { ...studentInfo };
      delete updatedStudentInfo[studentName];
      setStudentInfo(updatedStudentInfo);

      // phoneNumbers에서 제거
      const updatedPhoneNumbers = { ...phoneNumbers };
      delete updatedPhoneNumbers[studentName];
      setPhoneNumbers(updatedPhoneNumbers);

      // completionData에서 제거 (반별로 분리)
      setCompletionData(prev => {
        const newData = { ...prev };
        Object.keys(newData).forEach(className => {
          if (newData[className] && newData[className][studentName]) {
            const { [studentName]: removed, ...rest } = newData[className];
            newData[className] = rest;
          }
        });
        return newData;
      });

      // progressData에서 제거 (반별로 분리)
      setProgressData(prev => {
        const newData = { ...prev };
        Object.keys(newData).forEach(className => {
          if (newData[className] && newData[className][studentName]) {
            const { [studentName]: removed, ...rest } = newData[className];
            newData[className] = rest;
          }
        });
        return newData;
      });

      setDateProgressData(prev => {
        const newData = { ...prev };
        Object.keys(newData).forEach(date => {
          if (newData[date]) {
            Object.keys(newData[date]).forEach(className => {
              if (newData[date][className] && newData[date][className][studentName]) {
                const { [studentName]: r, ...rest } = newData[date][className];
                newData[date] = { ...newData[date], [className]: rest };
              }
            });
          }
        });
        return newData;
      });

      setDateCompletionData(prev => {
        const newData = { ...prev };
        Object.keys(newData).forEach(date => {
          if (newData[date]) {
            Object.keys(newData[date]).forEach(className => {
              if (newData[date][className] && newData[date][className][studentName]) {
                const { [studentName]: r, ...rest } = newData[date][className];
                newData[date] = { ...newData[date], [className]: rest };
              }
            });
          }
        });
        return newData;
      });

      addStudentNameToWithdrawnLocalStorage(studentName);
      if (isFirebaseConfigured() && db) {
        try {
          await removeStudentFromEnglishHomeworkProgressDocs(db, studentName);
        } catch (e) {
          console.warn('영어 과제 관리에서 학생 제거 실패:', e);
        }
      }

      alert(
        `✅ ${studentName} 학생이 삭제되었습니다.\n· 학생 데이터(퇴원 목록)에 반영했습니다.\n· 영어 과제 관리 Firestore 명단에서도 제거했습니다(연결된 경우).\n· 숙제 완료도 학생·연락처·완료도는 저장 버튼으로 Firebase에 올려주세요.`
      );
    } catch (error) {
      console.error('학생 삭제 실패:', error);
      alert(`❌ 학생 삭제 중 오류가 발생했습니다: ${error.message}`);
    }
  }, [students, studentInfo, phoneNumbers, db]);

  // 학생 추가
  const handleAddStudent = useCallback(async () => {
    if (!newStudentForm.name.trim()) {
      alert('학생 이름을 입력해주세요.');
      return;
    }

    if (selectedClass === 'all') {
      alert('반을 선택해주세요.');
      return;
    }

    const studentName = newStudentForm.name.trim();
    const isNewStudent = !students.includes(studentName);

    try {
      if (isNewStudent) {
        setStudents(prev => [...prev, studentName]);
      }

      const existingClasses = parseClassNames(studentInfo[studentName]?.className || '');
      const finalClassName = existingClasses.includes(selectedClass)
        ? (studentInfo[studentName]?.className || '')
        : [...existingClasses, selectedClass].join(',');

      setStudentInfo(prev => ({
        ...prev,
        [studentName]: {
          school: newStudentForm.school.trim() || (prev[studentName]?.school || ''),
          grade: newStudentForm.grade.trim() || (prev[studentName]?.grade || ''),
          className: finalClassName,
        },
      }));

      const newStudentPhone = newStudentForm.studentPhone.trim() || null;
      const newParentPhone = newStudentForm.parentPhone.trim() || null;
      setPhoneNumbers(prev => ({
        ...prev,
        [studentName]: {
          ...(prev[studentName] || {}),
          student: newStudentPhone || prev[studentName]?.student || null,
          parent: newParentPhone || prev[studentName]?.parent || null,
          핸드폰: newStudentPhone || prev[studentName]?.핸드폰 || null,
          부모핸드폰: newParentPhone || prev[studentName]?.부모핸드폰 || null,
        },
      }));

      setNewStudentForm({
        name: '',
        school: '',
        grade: '',
        className: '',
        studentPhone: '',
        parentPhone: '',
      });
      setShowAddStudentForm(false);
      alert(isNewStudent ? `✅ ${studentName} 학생이 추가되었습니다. 저장 버튼을 누르면 반영됩니다.` : `✅ ${studentName} 학생이 이 반에 추가되었습니다. 저장 버튼을 누르면 반영됩니다.`);
    } catch (error) {
      console.error('학생 추가 실패:', error);
      alert(`❌ 학생 추가 중 오류가 발생했습니다: ${error.message}`);
    }
  }, [newStudentForm, students, studentInfo, phoneNumbers, selectedClass, db]);

  // 반 추가
  const handleAddClass = useCallback(() => {
    if (!newClassForm.teacher.trim() || !newClassForm.courseName.trim() || !newClassForm.day.trim() || !newClassForm.time.trim()) {
      alert('모든 필드를 입력해주세요. (년도, 선생님, 수업이름, 요일, 시간)');
      return;
    }

    const newClassName = `${newClassForm.year}_${newClassForm.teacher}_${newClassForm.courseName}_${newClassForm.day}_${newClassForm.time}`;
    
    const fromStudents = Array.from(classesByTeacher.values()).flat();
    if (fromStudents.includes(newClassName) || addedClassList.includes(newClassName)) {
      alert('이미 존재하는 반입니다.');
      return;
    }

    setAddedClassList(prev => [...prev, newClassName]);
    setSelectedTeacher(newClassForm.teacher.trim());
    setSelectedClass(newClassName);
    
    setNewClassForm({
      year: new Date().getFullYear().toString().slice(-2),
      teacher: '',
      courseName: '',
      day: '',
      time: '',
    });
    setShowAddClassForm(false);
    
    alert(`✅ "${formatClassName(newClassName)}" 반이 추가되었습니다. 이제 이 반에 학생을 추가할 수 있습니다.`);
  }, [newClassForm, classesByTeacher, addedClassList]);

  // 반 삭제
  const handleDeleteClass = useCallback(() => {
    if (selectedClass === 'all') {
      alert('삭제할 반을 먼저 선택해주세요.');
      return;
    }
    const studentCount = students.filter(s => parseClassNames(studentInfo[s]?.className || '').includes(selectedClass)).length;
    const msg = studentCount > 0
      ? `"${formatClassName(selectedClass)}" 반을 삭제하면 이 반에 등록된 학생 ${studentCount}명의 반 배정에서도 제거됩니다. 계속할까요?`
      : `"${formatClassName(selectedClass)}" 반을 삭제할까요?`;
    if (!confirm(msg)) return;

    const removedAt = new Date().toISOString();
    setStudentClassHistory((prev) => {
      const next = { ...prev };
      students.forEach((student) => {
        const classes = parseClassNames(studentInfo[student]?.className || '');
        if (!classes.includes(selectedClass)) return;
        const arr = Array.isArray(next[student]) ? [...next[student]] : [];
        arr.push({ className: selectedClass, removedAt });
        next[student] = arr;
      });
      return next;
    });

    setAddedClassList(prev => prev.filter(c => c !== selectedClass));
    const nextStudentInfo = { ...studentInfo };
    students.forEach(student => {
      const classes = parseClassNames(nextStudentInfo[student]?.className || '');
      if (!classes.includes(selectedClass)) return;
      const newClasses = classes.filter(c => c !== selectedClass);
      const newClassName = newClasses.join(',');
      nextStudentInfo[student] = { ...(nextStudentInfo[student] || {}), className: newClassName };
    });
    setStudentInfo(nextStudentInfo);

    setDateCompletionData(prev => {
      const next = {};
      Object.keys(prev).forEach(date => {
        const day = prev[date] || {};
        if (!(selectedClass in day)) { next[date] = prev[date]; return; }
        const { [selectedClass]: _, ...rest } = day;
        next[date] = rest;
      });
      return next;
    });
    setDateHomeworkList(prev => {
      const next = {};
      Object.keys(prev).forEach(date => {
        const day = prev[date] || {};
        if (!(selectedClass in day)) { next[date] = prev[date]; return; }
        const { [selectedClass]: _, ...rest } = day;
        next[date] = rest;
      });
      return next;
    });
    setDateProgressList(prev => {
      const next = {};
      Object.keys(prev).forEach(date => {
        const day = prev[date] || {};
        if (!(selectedClass in day)) { next[date] = prev[date]; return; }
        const { [selectedClass]: _, ...rest } = day;
        next[date] = rest;
      });
      return next;
    });
    setDateProgressData(prev => {
      const next = {};
      Object.keys(prev).forEach(date => {
        const day = prev[date] || {};
        if (!(selectedClass in day)) { next[date] = prev[date]; return; }
        const { [selectedClass]: _, ...rest } = day;
        next[date] = rest;
      });
      return next;
    });
    setHomeworkList(prev => {
      const { [selectedClass]: _, ...rest } = prev;
      return rest;
    });
    setProgressList(prev => {
      const { [selectedClass]: _, ...rest } = prev;
      return rest;
    });
    setCompletionData(prev => {
      const { [selectedClass]: _, ...rest } = prev;
      return rest;
    });
    setProgressData(prev => {
      const { [selectedClass]: _, ...rest } = prev;
      return rest;
    });

    setSelectedClass('all');
    alert(`✅ "${formatClassName(selectedClass)}" 반이 삭제되었습니다. 저장 버튼을 누르면 서버에 반영됩니다.`);
  }, [selectedClass, students, studentInfo]);

  // 카톡 미리보기 생성
  const generatePreview = useCallback((sendType = null) => {
    const previewData = [];
    const previewStudent = sessionStorage.getItem('previewSendStudent'); // 개별 전송인 경우
    const previewSendDate = sessionStorage.getItem('previewSendDate'); // 날짜별 완료도 전송인 경우
    const previewSendHomework = previewSendDate ? JSON.parse(sessionStorage.getItem('previewSendHomework') || '[]') : null;
    
    // 알림장은 항상 전체, 완료도는 개별/전체 모두 가능
    const studentsToPreview = (sendType === 'notice' || !previewStudent)
      ? filteredAndSortedStudents
      : filteredAndSortedStudents.filter(s => s === previewStudent);
    
    for (const student of studentsToPreview) {
      const phoneData = phoneNumbers[student];
      if (!phoneData) continue;

      const studentPhone = phoneData.student ? phoneData.student.replace(/-/g, '') : null;
      const parentPhone = phoneData.parent ? phoneData.parent.replace(/-/g, '') : null;
      
      // 알림장 전송인 경우 완료 상태 없이, 완료도 전송인 경우 완료 상태 포함
      let homeworkStatus = '';
      // 표에 표시된 과제 사용 (캘린더 날짜 우선)
      const dateHw = selectedClass !== 'all' ? (dateHomeworkList[tableDisplayDate]?.[selectedClass] || []) : [];
      const displayList = (dateHw.length > 0) ? dateHw : (homeworkList[selectedClass] || []);
      const currentHomeworkList = previewSendHomework || displayList;
      const hwListToUse = currentHomeworkList;
      
      if (sendType === 'completion') {
        const classKey = selectedClass !== 'all' ? selectedClass : '';
        if (previewSendDate) {
          // 날짜별 완료도 데이터 사용 (반별로 분리)
          homeworkStatus = hwListToUse.map(hw => {
            const hwData = dateCompletionData[previewSendDate]?.[classKey]?.[student]?.[hw];
            const completed = hwData?.completed || false;
            const note = (hwData?.percentage !== undefined && hwData?.percentage !== null && hwData?.percentage !== '') ? String(hwData.percentage) : '';
            return note ? `${hw}: ${completed ? '완료' : '미완료'} (${note})` : `${hw}: ${completed ? '완료' : '미완료'}`;
          }).join('\n');
          const comment = classKey ? (dateCompletionData[previewSendDate]?.[classKey]?.[student]?.[COMMENT_KEY] ?? '') : '';
          if (comment) homeworkStatus += '\n\n코멘트: ' + comment;
        } else {
          // 일반 완료도 데이터 사용 - 표에 표시된 것과 동일 (캘린더 날짜 우선)
          const completionSource = (dateHw.length > 0)
            ? (dateCompletionData[tableDisplayDate]?.[classKey] || {})
            : (completionData[classKey] || {});
          homeworkStatus = hwListToUse.map(hw => {
            const hwData = completionSource[student]?.[hw];
            const completed = hwData?.completed || false;
            const note = (hwData?.percentage !== undefined && hwData?.percentage !== null && hwData?.percentage !== '') ? String(hwData.percentage) : '';
            return note ? `${hw}: ${completed ? '완료' : '미완료'} (${note})` : `${hw}: ${completed ? '완료' : '미완료'}`;
          }).join('\n');
          const comment = classKey ? (completionSource[student]?.[COMMENT_KEY] ?? '') : '';
          if (comment) homeworkStatus += '\n\n코멘트: ' + comment;
        }
      } else if (sendType === 'notice') {
        // 알림장은 과제 목록만
        homeworkStatus = hwListToUse.join('\n');
      } else {
        // 일반 미리보기 (완료 상태 포함) - 표에 표시된 것과 동일 (캘린더 날짜 우선)
        const classKey = selectedClass !== 'all' ? selectedClass : '';
        const completionSource = (dateHw.length > 0)
          ? (dateCompletionData[tableDisplayDate]?.[classKey] || {})
          : (completionData[classKey] || {});
        homeworkStatus = hwListToUse.map(hw => {
          const hwData = completionSource[student]?.[hw];
          const completed = hwData?.completed || false;
          const note = (hwData?.percentage !== undefined && hwData?.percentage !== null && hwData?.percentage !== '') ? String(hwData.percentage) : '';
          return note ? `${hw}: ${completed ? '완료' : '미완료'} (${note})` : `${hw}: ${completed ? '완료' : '미완료'}`;
        }).join('\n');
        const comment = classKey ? (completionSource[student]?.[COMMENT_KEY] ?? '') : '';
        if (comment) homeworkStatus += '\n\n코멘트: ' + comment;
      }

      // 진도 목록·값 (캘린더 날짜 우선)
      const dateProg = selectedClass !== 'all' ? (dateProgressList[previewSendDate || tableDisplayDate]?.[selectedClass] || []) : [];
      const progressListToUse = (dateProg.length > 0) ? dateProg : (progressList[selectedClass] || []);
      const progressSource = (dateProg.length > 0)
        ? (dateProgressData[previewSendDate || tableDisplayDate]?.[selectedClass] || {})
        : (progressData[selectedClass] || {});
      const progressText = progressListToUse.length > 0
        ? progressListToUse.map(p => `${p}: ${(progressSource[student]?.[p] ?? '').trim() || '-'}`).join('\n')
        : '';

      const info = studentInfo[student] || {};
      const grade = info.grade || '';
      const className = selectedClass !== 'all' ? formatClassName(selectedClass) : '';

      previewData.push({
        student,
        phone: studentPhone,
        parentPhone: parentPhone,
        homeworkList: hwListToUse.join('\n'),
        homeworkStatus: homeworkStatus,
        progressStatus: progressText,
        grade: grade,
        className: className,
      });
    }
    
    return previewData;
  }, [filteredAndSortedStudents, phoneNumbers, completionData, dateCompletionData, dateHomeworkList, dateProgressList, dateProgressData, tableDisplayDate, homeworkList, progressList, progressData, studentInfo, selectedClass]);

  // 미리보기 열기
  const handleOpenPreview = useCallback(() => {
    if (selectedClass === 'all') {
      alert('반을 선택해주세요. 전체 학생에게는 발송할 수 없습니다.');
      return;
    }
    const dateHw = dateHomeworkList[tableDisplayDate]?.[selectedClass];
    const currentHomeworkList = (dateHw && dateHw.length > 0) ? dateHw : (homeworkList[selectedClass] || []);
    if (currentHomeworkList.length === 0) {
      alert('과제를 추가하거나 캘린더 날짜를 선택해주세요.');
      return;
    }
    setShowPreview(true);
  }, [selectedClass, homeworkList, dateHomeworkList, tableDisplayDate]);

  // 개별 학생에게 카톡 전송
  const sendKakaoToStudent = useCallback(async (studentName) => {
    if (selectedClass === 'all') {
      alert('반을 선택해주세요. 전체 학생에게는 발송할 수 없습니다.');
      return;
    }
    // 카톡 전송 전 현재 완료도·메모·진도·코멘트를 Firebase에 저장
    try { await saveAllToFirebase(); } catch (e) { console.error('전송 전 저장 실패', e); }
    // 표에 표시된 과제/완료도 사용 (캘린더 날짜 또는 상단 과제)
    const dateHw = dateHomeworkList[tableDisplayDate]?.[selectedClass];
    const currentHomeworkList = (dateHw && dateHw.length > 0) ? dateHw : (homeworkList[selectedClass] || []);
    const completionSource = (dateHw && dateHw.length > 0)
      ? (dateCompletionData[tableDisplayDate]?.[selectedClass] || {})
      : (completionData[selectedClass] || {});
    if (currentHomeworkList.length === 0) {
      alert('과제를 추가하거나 캘린더 날짜를 선택해주세요.');
      return;
    }

    const trimmedTemplateCode = 'KA01TP260119030638192BnlwNmKPy78';
    const phoneData = phoneNumbers[studentName];
    if (!phoneData) {
      alert('전화번호가 등록되지 않았습니다.');
      return;
    }

    const studentPhone = phoneData.student ? phoneData.student.replace(/-/g, '') : null;
    const parentPhone = phoneData.parent ? phoneData.parent.replace(/-/g, '') : null;
    
    // 학생 정보 가져오기
    const info = studentInfo[studentName] || {};
    const grade = info.grade || '';
    const className = selectedClass !== 'all' ? formatClassName(selectedClass) : '';
    
    // 모든 과제의 완료 상태를 문자열로 만들기 (표시된 과제/완료도 사용, 메모는 자유 입력)
    let homeworkStatus = currentHomeworkList.map(hw => {
      const hwData = completionSource[studentName]?.[hw];
      const completed = hwData?.completed || false;
      const note = (hwData?.percentage !== undefined && hwData?.percentage !== null && hwData?.percentage !== '') ? String(hwData.percentage) : '';
      return note ? `${hw}: ${completed ? '완료' : '미완료'} (${note})` : `${hw}: ${completed ? '완료' : '미완료'}`;
    }).join('\n');
    const comment = completionSource[studentName]?.[COMMENT_KEY] ?? '';
    if (comment) homeworkStatus += '\n\n코멘트: ' + comment;

    // 진도 상황 문자열 (표에 표시된 진도 목록 기준)
    const dateProg = dateProgressList[tableDisplayDate]?.[selectedClass] || [];
    const currentProgressList = (dateProg.length > 0) ? dateProg : (progressList[selectedClass] || []);
    const progressSource = (dateProg.length > 0)
      ? (dateProgressData[tableDisplayDate]?.[selectedClass] || {})
      : (progressData[selectedClass] || {});
    const progressText = currentProgressList.length > 0
      ? currentProgressList.map(p => `${p}: ${(progressSource[studentName]?.[p] ?? '').trim() || '-'}`).join('\n')
      : '';

    setSending(true);
    
    try {
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      const baseVariables = {
        '학생명': studentName,
        '과제목록': currentHomeworkList.join('\n'),
        '과제완료상태': homeworkStatus,
        '진도상황': progressText,
      };

      let successCount = 0;
      let failCount = 0;

      // 학생 전화번호로 발송
      if (studentPhone && /^010\d{8}$/.test(studentPhone)) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phoneNumber: studentPhone,
              templateCode: trimmedTemplateCode,
              variables: baseVariables,
            }),
          });

          const result = await response.json();

          if (result.success) {
            successCount++;
          } else {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${studentName} 학생 카카오톡 전송 실패:`, error);
          failCount++;
          alert(`❌ ${studentName} 학생에게 카카오톡 발송 실패: ${error.message}`);
          return;
        }
      }

      // 학부모 전화번호로 발송
      if (parentPhone && /^010\d{8}$/.test(parentPhone)) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phoneNumber: parentPhone,
              templateCode: trimmedTemplateCode,
              variables: {
                ...baseVariables,
                '학년': grade,
                '반명': className,
              },
            }),
          });

          const result = await response.json();

          if (result.success) {
            successCount++;
          } else {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${studentName} 학부모 카카오톡 전송 실패:`, error);
          failCount++;
          alert(`❌ ${studentName} 학부모에게 카카오톡 발송 실패: ${error.message}`);
          return;
        }
      }

      if (successCount > 0) {
        const today = formatLocalYMD();
        const now = new Date().toISOString();
        
        // 전송 횟수 업데이트 (날짜별)
        setSentCounts(prev => {
          const newCounts = {
            ...prev,
            [today]: {
              ...(prev[today] || {}),
              [selectedClass]: {
                ...(prev[today]?.[selectedClass] || {}),
                [studentName]: {
                  ...(prev[today]?.[selectedClass]?.[studentName] || {}),
                  completion: (prev[today]?.[selectedClass]?.[studentName]?.completion || 0) + successCount,
                },
              },
            },
          };
          
          // Firestore에 저장
          if (isFirebaseConfigured() && db) {
            const docRef = doc(db, 'homeworkCompletionSentCounts', 'all');
            getDoc(docRef).then(docSnapshot => {
              const existingCounts = docSnapshot.exists() ? (docSnapshot.data().counts || {}) : {};
              const updatedCounts = {
                ...existingCounts,
                [today]: newCounts[today],
              };
              setDoc(docRef, { counts: updatedCounts, lastUpdated: new Date().toISOString() }, { merge: true })
                .catch(error => console.error('전송 횟수 저장 실패:', error));
            });
          }
          
          return newCounts;
        });
        
        // 전송 이력 저장 (Firestore 읽기→병합→저장)
        const completionEntry = {
          반명: selectedClass,
          학생명: studentName,
          과제목록: [...currentHomeworkList],
          진도목록: [...currentProgressList],
          ...(progressText ? { 진도상황: progressText } : {}),
          타입: '완료도',
          시간: now,
        };
        if (isFirebaseConfigured() && db) {
          saveSendHistoryToFirestore(db, today, completionEntry)
            .then(merged => setSendHistory(merged))
            .catch(e => {
              console.error('전송 이력 저장 실패:', e);
              alert('보내진 알림장 정리 달력 저장에 실패했습니다. ' + (e?.message || e));
            });
        } else {
          setSendHistory(prev => ({
            ...prev,
            [today]: [...(prev[today] || []), completionEntry],
          }));
        }
        try { await saveAllToFirebase(); } catch (e) { console.error('자동 저장 실패', e); }
        alert(`✅ ${studentName} 학생에게 카카오톡 발송 완료!`);
      } else {
        alert('❌ 발송된 메시지가 없습니다. 전화번호를 확인해주세요.');
      }
    } catch (error) {
      console.error('카카오톡 발송 중 오류:', error);
      alert(`❌ 카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSending(false);
    }
  }, [selectedClass, homeworkList, progressList, phoneNumbers, completionData, progressData, dateCompletionData, dateProgressData, dateHomeworkList, dateProgressList, tableDisplayDate, studentInfo, db, saveAllToFirebase]);

  // 날짜별 완료도 카톡 전송 (단체)
  const sendDateCompletionMessages = useCallback(async (date) => {
    if (selectedClass === 'all') {
      alert('반을 선택해주세요. 전체 학생에게는 발송할 수 없습니다.');
      return;
    }
    // 카톡 전송 전 현재 완료도·메모·진도·코멘트를 Firebase에 저장
    try { await saveAllToFirebase(); } catch (e) { console.error('전송 전 저장 실패', e); }

    const homeworkArray = JSON.parse(sessionStorage.getItem('previewSendHomework') || '[]');
    if (homeworkArray.length === 0) {
      alert('과제가 없습니다.');
      return;
    }

    // 해당 날짜에 전송된 학생 목록 가져오기
    const dayHistory = sendHistory[date] || [];
    const dateStudents = new Set();
    dayHistory.forEach(item => {
      if (typeof item.학생명 === 'string' && item.학생명.includes(',')) {
        item.학생명.split(',').forEach(name => dateStudents.add(name.trim()));
      } else {
        dateStudents.add(item.학생명);
      }
    });
    const studentsToSend = Array.from(dateStudents).filter(s => filteredAndSortedStudents.includes(s));

    if (studentsToSend.length === 0) {
      alert('해당 날짜에 전송된 학생이 없습니다.');
      return;
    }

    setSending(true);
    
    try {
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      const trimmedTemplateCode = 'KA01TP260119030638192BnlwNmKPy78';
      let successCount = 0;
      let failCount = 0;

      const progressListForHistory = dateProgressList[date]?.[selectedClass] || [];

      for (const studentName of studentsToSend) {
        const phoneData = phoneNumbers[studentName];
        if (!phoneData || !phoneData.parent) {
          console.warn(`${studentName} 학생의 학부모 전화번호가 없습니다.`);
          continue;
        }

        const parentPhone = phoneData.parent.replace(/-/g, '');
        
        // 학생 정보 가져오기
        const info = studentInfo[studentName] || {};
        const grade = info.grade || '';
        const className = selectedClass !== 'all' ? formatClassName(selectedClass) : '';
        
        // 날짜별 완료도 데이터 사용 (반별로 분리, 메모는 자유 입력)
        let homeworkStatus = homeworkArray.map(hw => {
          const hwData = dateCompletionData[date]?.[selectedClass]?.[studentName]?.[hw];
          const completed = hwData?.completed || false;
          const note = (hwData?.percentage !== undefined && hwData?.percentage !== null && hwData?.percentage !== '') ? String(hwData.percentage) : '';
          return note ? `${hw}: ${completed ? '완료' : '미완료'} (${note})` : `${hw}: ${completed ? '완료' : '미완료'}`;
        }).join('\n');
        const comment = dateCompletionData[date]?.[selectedClass]?.[studentName]?.[COMMENT_KEY] ?? '';
        if (comment) homeworkStatus += '\n\n코멘트: ' + comment;

        const progressArray = dateProgressList[date]?.[selectedClass] || [];
        const dateProgSource = dateProgressData[date]?.[selectedClass] || {};
        const progressText = progressArray.length > 0
          ? progressArray.map(p => `${p}: ${(dateProgSource[studentName]?.[p] ?? '').trim() || '-'}`).join('\n')
          : '';

        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              templateCode: trimmedTemplateCode,
              phone: parentPhone,
              variables: {
                '학생명': studentName,
                '학년': grade,
                '반명': className,
                '과제목록': homeworkArray.join('\n'),
                '과제완료상태': homeworkStatus,
                '진도상황': progressText,
              },
            }),
          });

          const result = await response.json();

          if (result.success) {
            successCount++;
          } else {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${studentName} 학부모 카카오톡 전송 실패:`, error);
          failCount++;
          alert(`❌ ${studentName} 학부모에게 카카오톡 발송 실패: ${error.message}`);
          return;
        }
      }

      if (successCount > 0) {
        const today = formatLocalYMD();
        const now = new Date().toISOString();
        
        // 전송 횟수 업데이트 (날짜별)
        setSentCounts(prev => {
          const newCounts = {
            ...prev,
            [today]: {
              ...(prev[today] || {}),
              [selectedClass]: {
                ...(prev[today]?.[selectedClass] || {}),
                ...filteredAndSortedStudents.reduce((acc, studentName) => {
                  acc[studentName] = {
                    ...(prev[today]?.[selectedClass]?.[studentName] || {}),
                    completion: (prev[today]?.[selectedClass]?.[studentName]?.completion || 0) + 1,
                  };
                  return acc;
                }, {}),
              },
            },
          };
          
          // Firestore에 저장
          if (isFirebaseConfigured() && db) {
            const docRef = doc(db, 'homeworkCompletionSentCounts', 'all');
            getDoc(docRef).then(docSnapshot => {
              const existingCounts = docSnapshot.exists() ? (docSnapshot.data().counts || {}) : {};
              const updatedCounts = {
                ...existingCounts,
                [today]: newCounts[today],
              };
              setDoc(docRef, { counts: updatedCounts, lastUpdated: new Date().toISOString() }, { merge: true })
                .catch(error => console.error('전송 횟수 저장 실패:', error));
            });
          }
          
          return newCounts;
        });
        
        // 전송 이력 저장 (Firestore 읽기→병합→저장)
        const completionEntry = {
          반명: selectedClass,
          학생명: studentsToSend.join(', '),
          과제목록: [...homeworkArray],
          진도목록: [...progressListForHistory],
          타입: '완료도',
          시간: now,
        };
        if (isFirebaseConfigured() && db) {
          saveSendHistoryToFirestore(db, today, completionEntry)
            .then(merged => setSendHistory(merged))
            .catch(e => {
              console.error('전송 이력 저장 실패:', e);
              alert('보내진 알림장 정리 달력 저장에 실패했습니다. ' + (e?.message || e));
            });
        } else {
          setSendHistory(prev => ({ ...prev, [today]: [...(prev[today] || []), completionEntry] }));
        }
        try { await saveAllToFirebase(); } catch (e) { console.error('자동 저장 실패', e); }
        alert(`✅ ${successCount}명에게 카카오톡 발송 완료!`);
      } else {
        alert('❌ 발송된 메시지가 없습니다. 전화번호를 확인해주세요.');
      }
    } catch (error) {
      console.error('카카오톡 발송 중 오류:', error);
      alert(`❌ 카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSending(false);
    }
  }, [selectedClass, filteredAndSortedStudents, phoneNumbers, dateCompletionData, dateProgressList, dateProgressData, studentInfo, sendHistory, db, saveAllToFirebase]);

  // 과제 알림장 카톡 전송 (개별) - 완료/미완료 상태 없이 과제 목록만 전송
  const sendHomeworkNoticeToStudent = useCallback(async (studentName) => {
    if (selectedClass === 'all') {
      alert('반을 선택해주세요. 전체 학생에게는 발송할 수 없습니다.');
      return;
    }
    // 카톡 전송 전 현재 완료도·메모·진도·코멘트를 Firebase에 저장
    try { await saveAllToFirebase(); } catch (e) { console.error('전송 전 저장 실패', e); }
    const currentHomeworkList = selectedClass !== 'all' ? (homeworkList[selectedClass] || []) : [];
    if (currentHomeworkList.length === 0) {
      alert('과제를 추가해주세요.');
      return;
    }

    const trimmedTemplateCode = 'KA01TP260318145508902GuVLeuxXXlc'; // 과제 알림장 전용 템플릿
    const phoneData = phoneNumbers[studentName];
    if (!phoneData) {
      alert('전화번호가 등록되지 않았습니다.');
      return;
    }

    const studentPhone = phoneData.student ? phoneData.student.replace(/-/g, '') : null;
    const parentPhone = phoneData.parent ? phoneData.parent.replace(/-/g, '') : null;
    
    // 학생 정보 가져오기
    const info = studentInfo[studentName] || {};
    const grade = info.grade || '';
    const className = selectedClass !== 'all' ? formatClassName(selectedClass) : '';
    
    // 과제 목록만 전송 (완료/미완료 상태 없음)
    const homeworkListText = currentHomeworkList.join('\n');
    const dateProg = dateProgressList[tableDisplayDate]?.[selectedClass] || [];
    const currentProgressListNotice = (dateProg.length > 0) ? dateProg : (progressList[selectedClass] || []);
    const progressSourceNotice = (dateProg.length > 0)
      ? (dateProgressData[tableDisplayDate]?.[selectedClass] || {})
      : (progressData[selectedClass] || {});
    const progressTextNotice = currentProgressListNotice.length > 0
      ? currentProgressListNotice.map(p => `${p}: ${(progressSourceNotice[studentName]?.[p] ?? '').trim() || '-'}`).join('\n')
      : '';

    setSending(true);
    
    try {
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      let successCount = 0;
      let failCount = 0;

      // 학생 전화번호로 발송
      if (studentPhone && /^010\d{8}$/.test(studentPhone)) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phoneNumber: studentPhone,
              templateCode: trimmedTemplateCode,
              variables: {
                '학생명': studentName,
                '학년': grade,
                '반명': className,
                '과제목록': currentHomeworkList.join('\n'),
                '과제완료상태': homeworkListText, // 완료/미완료 없이 과제 목록만
                '진도상황': progressTextNotice,
              },
            }),
          });

          const result = await response.json();

          if (result.success) {
            successCount++;
          } else {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${studentName} 학생 카카오톡 전송 실패:`, error);
          failCount++;
          alert(`❌ ${studentName} 학생에게 카카오톡 발송 실패: ${error.message}`);
          return;
        }
      }

      // 학부모 전화번호로 발송
      if (parentPhone && /^010\d{8}$/.test(parentPhone)) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phoneNumber: parentPhone,
              templateCode: trimmedTemplateCode,
              variables: {
                '학생명': studentName,
                '학년': grade,
                '반명': className,
                '과제목록': currentHomeworkList.join('\n'),
                '과제완료상태': homeworkListText, // 완료/미완료 없이 과제 목록만
                '진도상황': progressTextNotice,
              },
            }),
          });

          const result = await response.json();

          if (result.success) {
            successCount++;
          } else {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${studentName} 학부모 카카오톡 전송 실패:`, error);
          failCount++;
          alert(`❌ ${studentName} 학부모에게 카카오톡 발송 실패: ${error.message}`);
          return;
        }
      }

      if (successCount > 0) {
        const today = formatLocalYMD();
        const now = new Date().toISOString();
        
        // 전송 횟수 업데이트 (날짜별)
        setSentCounts(prev => {
          const newCounts = {
            ...prev,
            [today]: {
              ...(prev[today] || {}),
              [selectedClass]: {
                ...(prev[today]?.[selectedClass] || {}),
                [studentName]: {
                  ...(prev[today]?.[selectedClass]?.[studentName] || {}),
                  notice: (prev[today]?.[selectedClass]?.[studentName]?.notice || 0) + successCount,
                },
              },
            },
          };
          
          // Firestore에 저장
          if (isFirebaseConfigured() && db) {
            const docRef = doc(db, 'homeworkCompletionSentCounts', 'all');
            getDoc(docRef).then(docSnapshot => {
              const existingCounts = docSnapshot.exists() ? (docSnapshot.data().counts || {}) : {};
              const updatedCounts = {
                ...existingCounts,
                [today]: newCounts[today],
              };
              setDoc(docRef, { counts: updatedCounts, lastUpdated: new Date().toISOString() }, { merge: true })
                .catch(error => console.error('전송 횟수 저장 실패:', error));
            });
          }
          
          return newCounts;
        });
        
        // 전송 이력 저장
        const noticeEntry = {
          반명: selectedClass,
          학생명: studentName,
          과제목록: [...currentHomeworkList],
          진도목록: [...currentProgressListNotice],
          ...(progressTextNotice ? { 진도상황: progressTextNotice } : {}),
          타입: '알림장',
          시간: now,
        };
        if (isFirebaseConfigured() && db) {
          saveSendHistoryToFirestore(db, today, noticeEntry)
            .then(merged => setSendHistory(merged))
            .catch(e => {
              console.error('전송 이력 저장 실패:', e);
              alert('보내진 알림장 정리 달력 저장에 실패했습니다. ' + (e?.message || e));
            });
        } else {
          setSendHistory(prev => ({ ...prev, [today]: [...(prev[today] || []), noticeEntry] }));
        }
        try { await saveAllToFirebase(); } catch (e) { console.error('자동 저장 실패', e); }
        alert(`✅ ${studentName} 학생에게 과제 알림장 카카오톡 발송 완료!`);
      } else {
        alert('❌ 발송된 메시지가 없습니다. 전화번호를 확인해주세요.');
      }
    } catch (error) {
      console.error('카카오톡 발송 중 오류:', error);
      alert(`❌ 카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSending(false);
    }
  }, [selectedClass, homeworkList, progressList, dateHomeworkList, dateProgressList, dateProgressData, progressData, tableDisplayDate, phoneNumbers, studentInfo, db, saveAllToFirebase]);

  // 과제 알림장 카톡 전송 (단체) - 완료/미완료 상태 없이 과제 목록만 전송
  const sendHomeworkNotices = useCallback(async () => {
    if (selectedClass === 'all') {
      alert('반을 선택해주세요. 전체 학생에게는 발송할 수 없습니다.');
      return;
    }
    // 카톡 전송 전 현재 완료도·메모·진도·코멘트를 Firebase에 저장
    try { await saveAllToFirebase(); } catch (e) { console.error('전송 전 저장 실패', e); }
    const dateHw = dateHomeworkList[tableDisplayDate]?.[selectedClass];
    const currentHomeworkList = (dateHw && dateHw.length > 0) ? dateHw : (homeworkList[selectedClass] || []);
    const dateProgNotice = dateProgressList[tableDisplayDate]?.[selectedClass] || [];
    const currentProgressListNotices = (dateProgNotice.length > 0) ? dateProgNotice : (progressList[selectedClass] || []);
    const progressSourceNotices = (dateProgNotice.length > 0)
      ? (dateProgressData[tableDisplayDate]?.[selectedClass] || {})
      : (progressData[selectedClass] || {});
    if (currentHomeworkList.length === 0) {
      alert('과제를 추가하거나 캘린더 날짜를 선택해주세요.');
      return;
    }

    // 과제 알림장용 템플릿 코드 (솔라피 검수 후 코드 입력 필요)
    // TODO: 솔라피 검수 완료 후 실제 템플릿 코드로 교체
    // 임시로 완료도 템플릿 코드 사용 (테스트용)
    const noticeTemplateCode = 'KA01TP260318145508902GuVLeuxXXlc'; // 과제 알림장 전용 템플릿
    const trimmedTemplateCode = noticeTemplateCode;
    
    setSending(true);
    
    try {
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      let successCount = 0;
      let failCount = 0;
      const errorMessages = [];

      // 과제 목록만 전송 (완료/미완료 상태 없음) - 이미 위에서 currentHomeworkList 설정됨
      const homeworkListText = currentHomeworkList.join('\n');

      // 전화번호가 있는 학생들에게만 발송
      const studentSuccessCounts = {}; // {학생명: 성공횟수}
      
      for (const student of filteredAndSortedStudents) {
        const phoneData = phoneNumbers[student];
        if (!phoneData) continue;

        const studentPhone = phoneData.student ? phoneData.student.replace(/-/g, '') : null;
        const parentPhone = phoneData.parent ? phoneData.parent.replace(/-/g, '') : null;
        
        // 학생 정보 가져오기
        const info = studentInfo[student] || {};
        const grade = info.grade || '';
        const className = selectedClass !== 'all' ? formatClassName(selectedClass) : '';
        const progressTextNotices = currentProgressListNotices.length > 0
          ? currentProgressListNotices.map(p => `${p}: ${(progressSourceNotices[student]?.[p] ?? '').trim() || '-'}`).join('\n')
          : '';

        let studentSuccess = 0;

        // 학생 전화번호로 발송
        if (studentPhone && /^010\d{8}$/.test(studentPhone)) {
          try {
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                phoneNumber: studentPhone,
                templateCode: trimmedTemplateCode,
                variables: {
                  '학생명': student,
                  '학년': grade,
                  '반명': className,
                  '과제목록': currentHomeworkList.join('\n'),
                  '진도상황': progressTextNotices,
                },
              }),
            });

            const result = await response.json();

            if (!response.ok) {
              throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            if (result.success) {
              successCount++;
              studentSuccess++;
              console.log(`✅ ${student} 학생에게 과제 알림장 카카오톡 발송 성공`);
            } else {
              throw new Error(result.error || '알 수 없는 오류');
            }
          } catch (error) {
            console.error(`${student} 학생 카카오톡 전송 실패:`, error);
            failCount++;
            const errorMessage = error.message || '알 수 없는 오류';
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
          }
        }

        // 학부모 전화번호로 발송
        if (parentPhone && /^010\d{8}$/.test(parentPhone)) {
          try {
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                phoneNumber: parentPhone,
                templateCode: trimmedTemplateCode,
                variables: {
                  '학생명': student,
                  '학년': grade,
                  '반명': className,
                  '과제목록': currentHomeworkList.join('\n'),
                  '진도상황': progressTextNotices,
                },
              }),
            });

            const result = await response.json();

            if (!response.ok) {
              throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            if (result.success) {
              successCount++;
              studentSuccess++;
              console.log(`✅ ${student} 학부모에게 과제 알림장 카카오톡 발송 성공`);
            } else {
              throw new Error(result.error || '알 수 없는 오류');
            }
          } catch (error) {
            console.error(`${student} 학부모 카카오톡 전송 실패:`, error);
            failCount++;
            const errorMessage = error.message || '알 수 없는 오류';
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
          }
        }
        
        if (studentSuccess > 0) {
          studentSuccessCounts[student] = studentSuccess;
        }
      }
      
      // 각 학생별로 전송 횟수 업데이트 (날짜별)
      if (Object.keys(studentSuccessCounts).length > 0) {
        const today = formatLocalYMD();
        const now = new Date().toISOString();
        
        setSentCounts(prev => {
          const newCounts = {
            ...prev,
            [today]: {
              ...(prev[today] || {}),
              [selectedClass]: {
                ...(prev[today]?.[selectedClass] || {}),
              },
            },
          };
          
          Object.keys(studentSuccessCounts).forEach(student => {
            if (!newCounts[today][selectedClass][student]) {
              newCounts[today][selectedClass][student] = {};
            }
            newCounts[today][selectedClass][student] = {
              ...newCounts[today][selectedClass][student],
              notice: (newCounts[today][selectedClass][student].notice || 0) + studentSuccessCounts[student],
            };
          });
          
          // Firestore에 저장
          if (isFirebaseConfigured() && db) {
            const docRef = doc(db, 'homeworkCompletionSentCounts', 'all');
            getDoc(docRef).then(docSnapshot => {
              const existingCounts = docSnapshot.exists() ? (docSnapshot.data().counts || {}) : {};
              const updatedCounts = {
                ...existingCounts,
                [today]: newCounts[today],
              };
              setDoc(docRef, { counts: updatedCounts, lastUpdated: new Date().toISOString() }, { merge: true })
                .catch(error => console.error('전송 횟수 저장 실패:', error));
            });
          }
          
          return newCounts;
        });
        
        // 전송 이력 저장 (Firestore 읽기→병합→저장, 즉시 캘린더 반영)
        if (Object.keys(studentSuccessCounts).length > 0) {
          const noticeEntry = {
            반명: selectedClass,
            학생명: Object.keys(studentSuccessCounts).join(', '),
            과제목록: [...currentHomeworkList],
            진도목록: [...currentProgressListNotices],
            타입: '알림장',
            시간: now,
          };
          if (isFirebaseConfigured() && db) {
            saveSendHistoryToFirestore(db, today, noticeEntry)
              .then(merged => {
                setSendHistory(merged);
                console.log('✅ 과제 알림장 전송 이력이 캘린더에 반영되었습니다.');
              })
              .catch(e => {
                console.error('전송 이력 저장 실패:', e);
                alert('보내진 알림장 정리 달력 저장에 실패했습니다. ' + (e?.message || e));
              });
          } else {
            setSendHistory(prev => ({
              ...prev,
              [today]: [...(prev[today] || []), noticeEntry],
            }));
          }
        }

        // 날짜별 과제 목록 저장 (반별로 분리)
        setDateHomeworkList(prev => ({
          ...prev,
          [today]: {
            ...(prev[today] || {}),
            [selectedClass]: [...currentHomeworkList],
          },
        }));
      }

      // 결과 알림
      if (errorMessages.length > 0) {
        alert(`❌ 카카오톡 발송 오류:\n${errorMessages.join('\n')}`);
      }
      
      if (successCount > 0) {
        try { await saveAllToFirebase(); } catch (e) { console.error('자동 저장 실패', e); }
        alert(`✅ ${successCount}건의 과제 알림장 카카오톡 메시지가 성공적으로 발송되었습니다!${failCount > 0 ? `\n❌ ${failCount}건 발송 실패` : ''}`);
      } else {
        alert('❌ 발송된 메시지가 없습니다. 전화번호를 확인해주세요.');
      }
    } catch (error) {
      console.error('카카오톡 발송 중 오류:', error);
      alert(`❌ 카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSending(false);
    }
  }, [selectedClass, filteredAndSortedStudents, phoneNumbers, homeworkList, progressList, dateHomeworkList, dateProgressList, dateProgressData, progressData, tableDisplayDate, studentInfo, saveAllToFirebase]);

  // 카톡 전송 (단체)
  const sendKakaoMessages = useCallback(async () => {
    if (selectedClass === 'all') {
      alert('반을 선택해주세요. 전체 학생에게는 발송할 수 없습니다.');
      return;
    }
    // 카톡 전송 전 현재 완료도·메모·진도·코멘트를 Firebase에 저장
    try { await saveAllToFirebase(); } catch (e) { console.error('전송 전 저장 실패', e); }
    const dateHw = dateHomeworkList[tableDisplayDate]?.[selectedClass];
    const currentHomeworkList = (dateHw && dateHw.length > 0) ? dateHw : (homeworkList[selectedClass] || []);
    const completionSource = (dateHw && dateHw.length > 0)
      ? (dateCompletionData[tableDisplayDate]?.[selectedClass] || {})
      : (completionData[selectedClass] || {});
    const dateProg = dateProgressList[tableDisplayDate]?.[selectedClass] || [];
    const currentProgressListBulk = (dateProg.length > 0) ? dateProg : (progressList[selectedClass] || []);
    const progressSourceBulk = (dateProg.length > 0)
      ? (dateProgressData[tableDisplayDate]?.[selectedClass] || {})
      : (progressData[selectedClass] || {});
    if (currentHomeworkList.length === 0) {
      alert('과제를 추가하거나 캘린더 날짜를 선택해주세요.');
      return;
    }

    const trimmedTemplateCode = 'KA01TP260119030638192BnlwNmKPy78';
    
    setSending(true);
    
    try {
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      let successCount = 0;
      let failCount = 0;
      const errorMessages = [];

      // 전화번호가 있는 학생들에게만 발송 (모든 과제에 대해)
      const studentSuccessCounts = {}; // {학생명: 성공횟수}
      
      for (const student of filteredAndSortedStudents) {
        const phoneData = phoneNumbers[student];
        if (!phoneData) continue;

        const studentPhone = phoneData.student ? phoneData.student.replace(/-/g, '') : null;
        const parentPhone = phoneData.parent ? phoneData.parent.replace(/-/g, '') : null;
        
        // 학생 정보 가져오기
        const info = studentInfo[student] || {};
        const grade = info.grade || '';
        const className = selectedClass !== 'all' ? formatClassName(selectedClass) : '';
        
        // 모든 과제의 완료 상태를 문자열로 만들기 (표시된 과제/완료도 사용, 메모는 자유 입력)
        let homeworkStatus = currentHomeworkList.map(hw => {
          const hwData = completionSource[student]?.[hw];
          const completed = hwData?.completed || false;
          const note = (hwData?.percentage !== undefined && hwData?.percentage !== null && hwData?.percentage !== '') ? String(hwData.percentage) : '';
          return note ? `${hw}: ${completed ? '완료' : '미완료'} (${note})` : `${hw}: ${completed ? '완료' : '미완료'}`;
        }).join('\n');
        const comment = completionSource[student]?.[COMMENT_KEY] ?? '';
        if (comment) homeworkStatus += '\n\n코멘트: ' + comment;

        const progressTextBulk = currentProgressListBulk.length > 0
          ? currentProgressListBulk.map(p => `${p}: ${(progressSourceBulk[student]?.[p] ?? '').trim() || '-'}`).join('\n')
          : '';

        let studentSuccess = 0;

        // 학생 전화번호로 발송
        if (studentPhone && /^010\d{8}$/.test(studentPhone)) {
          try {
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                phoneNumber: studentPhone,
                templateCode: trimmedTemplateCode,
                variables: {
                  '학생명': student,
                  '학년': grade,
                  '반명': className,
                  '과제목록': currentHomeworkList.join('\n'),
                  '과제완료상태': homeworkStatus,
                  '진도상황': progressTextBulk,
                },
              }),
            });

            const result = await response.json();

            if (result.success) {
              successCount++;
              studentSuccess++;
              console.log(`✅ ${student} 학생에게 카카오톡 발송 성공`);
            } else {
              throw new Error(result.error || '알 수 없는 오류');
            }
          } catch (error) {
            console.error(`${student} 학생 카카오톡 전송 실패:`, error);
            failCount++;
            const errorMessage = error.message || '알 수 없는 오류';
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
          }
        }

        // 학부모 전화번호로 발송
        if (parentPhone && /^010\d{8}$/.test(parentPhone)) {
          try {
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                phoneNumber: parentPhone,
                templateCode: trimmedTemplateCode,
                variables: {
                  '학생명': student,
                  '학년': grade,
                  '반명': className,
                  '과제목록': currentHomeworkList.join('\n'),
                  '과제완료상태': homeworkStatus,
                  '진도상황': progressTextBulk,
                },
              }),
            });

            const result = await response.json();

            if (result.success) {
              successCount++;
              studentSuccess++;
              console.log(`✅ ${student} 학부모에게 카카오톡 발송 성공`);
            } else {
              throw new Error(result.error || '알 수 없는 오류');
            }
          } catch (error) {
            console.error(`${student} 학부모 카카오톡 전송 실패:`, error);
            failCount++;
            const errorMessage = error.message || '알 수 없는 오류';
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
          }
        }
        
        if (studentSuccess > 0) {
          studentSuccessCounts[student] = studentSuccess;
        }
      }
      
      // 각 학생별로 전송 횟수 업데이트 (날짜별)
      if (Object.keys(studentSuccessCounts).length > 0) {
        const today = formatLocalYMD();
        const now = new Date().toISOString();
        
        setSentCounts(prev => {
          const newCounts = {
            ...prev,
            [today]: {
              ...(prev[today] || {}),
              [selectedClass]: {
                ...(prev[today]?.[selectedClass] || {}),
              },
            },
          };
          
          Object.keys(studentSuccessCounts).forEach(student => {
            if (!newCounts[today][selectedClass][student]) {
              newCounts[today][selectedClass][student] = {};
            }
            newCounts[today][selectedClass][student] = {
              ...newCounts[today][selectedClass][student],
              completion: (newCounts[today][selectedClass][student].completion || 0) + studentSuccessCounts[student],
            };
          });
          
          // Firestore에 저장
          if (isFirebaseConfigured() && db) {
            const docRef = doc(db, 'homeworkCompletionSentCounts', 'all');
            getDoc(docRef).then(docSnapshot => {
              const existingCounts = docSnapshot.exists() ? (docSnapshot.data().counts || {}) : {};
              const updatedCounts = {
                ...existingCounts,
                [today]: newCounts[today],
              };
              setDoc(docRef, { counts: updatedCounts, lastUpdated: new Date().toISOString() }, { merge: true })
                .catch(error => console.error('전송 횟수 저장 실패:', error));
            });
          }
          
          return newCounts;
        });
        
        // 전송 이력 저장 (Firestore 읽기→병합→저장)
        const completionEntries = Object.keys(studentSuccessCounts).map(student => ({
          반명: selectedClass,
          학생명: student,
          과제목록: [...currentHomeworkList],
          진도목록: [...currentProgressListBulk],
          타입: '완료도',
          시간: now,
        }));
        if (completionEntries.length > 0 && isFirebaseConfigured() && db) {
          saveSendHistoryToFirestore(db, today, completionEntries)
            .then(merged => setSendHistory(merged))
            .catch(e => {
              console.error('전송 이력 저장 실패:', e);
              alert('보내진 알림장 정리 달력 저장에 실패했습니다. ' + (e?.message || e));
            });
        } else if (completionEntries.length > 0) {
          setSendHistory(prev => ({
            ...prev,
            [today]: [...(prev[today] || []), ...completionEntries],
          }));
        }
      }

      // 결과 알림
      if (errorMessages.length > 0) {
        alert(`❌ 카카오톡 발송 오류:\n${errorMessages.join('\n')}`);
      }
      
      if (successCount > 0) {
        try { await saveAllToFirebase(); } catch (e) { console.error('자동 저장 실패', e); }
        alert(`✅ ${successCount}건의 카카오톡 메시지가 성공적으로 발송되었습니다!${failCount > 0 ? `\n❌ ${failCount}건 발송 실패` : ''}`);
      } else {
        alert('❌ 발송된 메시지가 없습니다. 전화번호를 확인해주세요.');
      }
    } catch (error) {
      console.error('카카오톡 발송 중 오류:', error);
      alert(`❌ 카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSending(false);
    }
  }, [selectedClass, filteredAndSortedStudents, phoneNumbers, completionData, progressData, dateCompletionData, dateProgressData, homeworkList, progressList, dateHomeworkList, dateProgressList, tableDisplayDate, studentInfo, db, saveAllToFirebase]);

  if (loading) {
    return (
      <div className="homework-completion-page">
        <div className="homework-completion-container">
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>데이터를 불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="homework-completion-page">
      <div className="homework-completion-container">
        {loadError && (
          <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#fef2f2', border: '2px solid #ef4444', borderRadius: '8px', color: '#b91c1c' }}>
            <strong>⚠️ {loadError}</strong>
          </div>
        )}
        <div className="homework-completion-header">
          <div>
            <h2>📚 숙제 과제 완료도</h2>
            <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '0.9rem' }}>
              총 {students.length}명
              {selectedClass !== 'all' && ` (${selectedClass}: ${filteredAndSortedStudents.length}명)`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {onApiKeySet && <ApiKeyInput onApiKeySet={onApiKeySet} />}
            <button className="close-btn" onClick={onClose}>닫기</button>
          </div>
        </div>
        
        <div className="homework-completion-description">
          <div className="class-filter-section" style={{ marginBottom: '15px' }}>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontWeight: '600', marginRight: '10px' }}>선생님 선택:</span>
              {Array.from(mergedClassesByTeacher.keys()).length === 0 ? (
                <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>등록된 반이 없습니다. 반을 추가한 뒤 학생을 추가해주세요.</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                  {Array.from(mergedClassesByTeacher.entries()).map(([teacher, classes]) => {
                    const count = classes.length;
                    const isSelected = selectedTeacher === teacher;
                    return (
                      <button
                        key={teacher}
                        type="button"
                        onClick={() => {
                          setSelectedTeacher(teacher);
                          setSelectedClass('all');
                        }}
                        style={{
                          padding: '8px 14px',
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          border: `2px solid ${isSelected ? '#9b59b6' : '#d1d5db'}`,
                          borderRadius: '8px',
                          backgroundColor: isSelected ? '#f3e8ff' : '#fff',
                          color: isSelected ? '#6b21a8' : '#374151',
                          cursor: 'pointer',
                        }}
                      >
                        👨‍🏫 {teacher} ({count}반)
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label htmlFor="class-filter" style={{ fontWeight: '600' }}>
                반 선택:
              </label>
              <select
                id="class-filter"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="class-filter-select"
                style={{ minWidth: '280px', padding: '8px 12px' }}
                disabled={!selectedTeacher}
              >
                <option value="all">
                  {selectedTeacher
                    ? `전체 (${students.filter(s => parseClassNames(studentInfo[s]?.className || '').some(c => classesForSelectedTeacher.includes(c))).length}명)`
                    : '선생님을 먼저 선택하세요'}
                </option>
                {classesForSelectedTeacher.map(className => {
                  const count = students.filter(s => {
                    const cn = studentInfo[s]?.className || '';
                    return parseClassNames(cn).includes(className);
                  }).length;
                  const formatted = formatClassName(className);
                  return (
                    <option key={className} value={className}>
                      {formatted} ({count}명)
                    </option>
                  );
                })}
              </select>
              {selectedClass !== 'all' && (
                <button
                  type="button"
                  onClick={handleDeleteClass}
                  title="선택한 반 삭제 (해당 반 학생 배정에서 제거)"
                  style={{
                    padding: '8px 14px',
                    fontSize: '0.9rem',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  🗑️ 반 삭제
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginBottom: '15px' }}>
            <button
              type="button"
              onClick={() => setShowAddClassForm(!showAddClassForm)}
              style={{
                padding: '8px 16px',
                fontSize: '0.9rem',
                backgroundColor: showAddClassForm ? '#ef4444' : '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              {showAddClassForm ? '취소' : '➕ 반 추가'}
            </button>
          </div>

          {/* 반 추가 폼 */}
          {showAddClassForm && (
            <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '2px solid #0ea5e9' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>➕ 새 반 추가</h3>
              <form onSubmit={(e) => { e.preventDefault(); handleAddClass(); }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                      년도 (2자리) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={newClassForm.year}
                      onChange={(e) => setNewClassForm(prev => ({ ...prev, year: e.target.value }))}
                      placeholder="예) 26"
                      maxLength={2}
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
                      선생님 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={newClassForm.teacher}
                      onChange={(e) => setNewClassForm(prev => ({ ...prev, teacher: e.target.value }))}
                      placeholder="예) 김지수"
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
                      수업이름 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={newClassForm.courseName}
                      onChange={(e) => setNewClassForm(prev => ({ ...prev, courseName: e.target.value }))}
                      placeholder="예) 미적분1 특강"
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
                      요일 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={newClassForm.day}
                      onChange={(e) => setNewClassForm(prev => ({ ...prev, day: e.target.value }))}
                      placeholder="예) 월금"
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
                      시간 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={newClassForm.time}
                      onChange={(e) => setNewClassForm(prev => ({ ...prev, time: e.target.value }))}
                      placeholder="예) 14:30"
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
                </div>
                <div style={{ marginTop: '15px', textAlign: 'right' }}>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
                      fontSize: '1rem',
                      backgroundColor: '#0ea5e9',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    반 추가하기
                  </button>
                </div>
              </form>
            </div>
          )}

          <p style={{ marginTop: '15px' }}>학생들의 숙제 및 과제 완료도를 관리합니다.</p>
          <p>반별로 학생을 확인하고, 완료 여부를 체크하여 추적할 수 있습니다.</p>
        </div>
        
        <div className="homework-completion-content">
          {selectedClass === 'all' ? (
            <div style={{ 
              padding: '40px', 
              textAlign: 'center', 
              backgroundColor: '#f0f0f0', 
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <p style={{ color: '#666', fontSize: '1rem', margin: 0 }}>
                반을 선택하면 과제를 추가할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="homework-input-section" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor="new-homework-name" style={{ fontWeight: '600' }}>
                  과제 추가:
                </label>
                <input
                  id="new-homework-name"
                  type="text"
                  value={newHomeworkName}
                  onChange={(e) => setNewHomeworkName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addHomework()}
                  placeholder="예: 수학 문제집 1-10번"
                  style={{
                    padding: '8px 15px',
                    border: '2px solid #9b59b6',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    flex: 1,
                    minWidth: '200px',
                    color: '#000',
                    backgroundColor: '#fff',
                  }}
                />
                <button
                  onClick={addHomework}
                  style={{
                    padding: '8px 20px',
                    background: '#9b59b6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  추가
                </button>
              </div>
              {(selectedClass !== 'all' && (homeworkList[selectedClass] || []).length > 0) && (
                <div style={{ marginTop: '15px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(homeworkList[selectedClass] || []).map(hw => (
                    <span
                      key={hw}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: '#f0f0f0',
                        borderRadius: '6px',
                        fontSize: '0.9rem',
                      }}
                    >
                      {hw}
                      <button
                        onClick={() => removeHomework(hw)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                          padding: 0,
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="삭제"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor="new-progress-name" style={{ fontWeight: '600' }}>
                  진도 추가:
                </label>
                <input
                  id="new-progress-name"
                  type="text"
                  value={newProgressName}
                  onChange={(e) => setNewProgressName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addProgress()}
                  placeholder="예: 동사의 모든것 p.10"
                  style={{
                    padding: '8px 15px',
                    border: '2px solid #0d9488',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    flex: 1,
                    minWidth: '200px',
                    color: '#000',
                    backgroundColor: '#fff',
                  }}
                />
                <button
                  onClick={addProgress}
                  style={{
                    padding: '8px 20px',
                    background: '#0d9488',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  추가
                </button>
              </div>
              {(selectedClass !== 'all' && (progressList[selectedClass] || []).length > 0) && (
                <div style={{ marginTop: '15px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(progressList[selectedClass] || []).map(p => (
                    <span
                      key={p}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: '#ccfbf1',
                        borderRadius: '6px',
                        fontSize: '0.9rem',
                      }}
                    >
                      {p}
                      <button
                        onClick={() => removeProgress(p)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                          padding: 0,
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="삭제"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="students-list">
            {/* 학생 추가 섹션 (반별, 첫 번째 학생 위) */}
            {selectedClass !== 'all' && (
              <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '2px solid #e0e0e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, color: '#2c3e50' }}>➕ 학생 추가 ({formatClassName(selectedClass)})</h3>
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
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '15px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                          학생 이름 <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={newStudentForm.name}
                          onChange={(e) => setNewStudentForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="학생 이름"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '2px solid #9b59b6',
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
                            border: '2px solid #9b59b6',
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
                            border: '2px solid #9b59b6',
                            borderRadius: '6px',
                            fontSize: '1rem',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
                          추가 반명 (선택)
                        </label>
                        <input
                          type="text"
                          value={newStudentForm.className}
                          onChange={(e) => setNewStudentForm(prev => ({ ...prev, className: e.target.value }))}
                          placeholder="다른 반명이 있으면 입력"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '2px solid #9b59b6',
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
                          value={newStudentForm.studentPhone}
                          onChange={(e) => setNewStudentForm(prev => ({ ...prev, studentPhone: e.target.value }))}
                          placeholder="예) 010-1234-5678"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '2px solid #9b59b6',
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
                          value={newStudentForm.parentPhone}
                          onChange={(e) => setNewStudentForm(prev => ({ ...prev, parentPhone: e.target.value }))}
                          placeholder="예) 010-9876-5432"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '2px solid #9b59b6',
                            borderRadius: '6px',
                            fontSize: '1rem',
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '15px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={handleAddStudent}
                        disabled={!newStudentForm.name.trim()}
                        style={{
                          padding: '10px 20px',
                          fontSize: '1rem',
                          backgroundColor: newStudentForm.name.trim() ? '#9b59b6' : '#9ca3af',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: newStudentForm.name.trim() ? 'pointer' : 'not-allowed',
                          fontWeight: '600',
                        }}
                      >
                        추가하기
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {filteredAndSortedStudents.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
                {selectedClass !== 'all' ? '선택한 반에 학생이 없습니다.' : '학생 데이터가 없습니다.'}
              </p>
            ) : (
              <div className="completion-table-wrapper">
                {/* 표에 표시할 과제 날짜 선택 (캘린더 연동) */}
                {selectedClass !== 'all' && (
                  <div style={{
                    marginBottom: '16px',
                    padding: '12px 16px',
                    backgroundColor: isTableShowingDateHomework ? '#e0f2fe' : '#f8f9fa',
                    borderRadius: '8px',
                    border: `2px solid ${isTableShowingDateHomework ? '#0ea5e9' : '#e5e7eb'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ fontWeight: '600', color: '#374151' }}>📅 표에 표시할 과제 날짜:</span>
                    <input
                      type="date"
                      value={tableDisplayDate}
                      onChange={(e) => setTableDisplayDate(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '2px solid #9b59b6',
                        borderRadius: '6px',
                        fontSize: '0.95rem',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setTableDisplayDate(formatLocalYMD())}
                      style={{
                        padding: '8px 14px',
                        backgroundColor: '#9b59b6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      오늘
                    </button>
                    {isTableShowingDateHomework && (
                      <span style={{ fontSize: '0.9rem', color: '#0ea5e9', fontWeight: '600' }}>
                        ✓ 캘린더에 입력한 과제 표시 중
                      </span>
                    )}
                  </div>
                )}
                <table className="completion-table">
                  <thead>
                    <tr>
                      <th rowSpan="2" style={{ minWidth: '80px' }}>번호</th>
                      <th rowSpan="2" style={{ minWidth: '120px' }}>학생명</th>
                      <th rowSpan="2" style={{ minWidth: '150px' }}>학교</th>
                      <th rowSpan="2" style={{ minWidth: '80px' }}>학년</th>
                      <th rowSpan="2" style={{ minWidth: '180px' }}>전화번호</th>
                      {(selectedClass !== 'all' && displayProgressList.length > 0) && (
                        <th colSpan={displayProgressList.length} style={{ background: '#ccfbf1', color: '#000' }}>
                          진도 {isTableShowingDateProgress && `(${tableDisplayDate})`}
                        </th>
                      )}
                      {(selectedClass !== 'all' && displayHomeworkList.length > 0) && (
                        <th colSpan={displayHomeworkList.length} style={{ background: '#f8f9fa', color: '#000' }}>
                          과제 완료도 {isTableShowingDateHomework && `(${tableDisplayDate})`}
                        </th>
                      )}
                      <th rowSpan="2" style={{ minWidth: '160px' }}>코멘트</th>
                      <th rowSpan="2" style={{ minWidth: '120px' }}>완료도 전송</th>
                      <th rowSpan="2" style={{ minWidth: '80px' }}>삭제</th>
                    </tr>
                    {(selectedClass !== 'all' && (displayHomeworkList.length > 0 || displayProgressList.length > 0)) && (
                      <tr>
                        {displayProgressList.map(p => (
                          <th key={p} style={{ minWidth: '120px', background: '#ccfbf1', color: '#000' }}>
                            {p}
                          </th>
                        ))}
                        {displayHomeworkList.map(hw => (
                          <th key={hw} style={{ minWidth: '120px', background: '#f8f9fa', color: '#000' }}>
                            {hw}
                          </th>
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filteredAndSortedStudents.map((student, index) => {
                      const info = studentInfo[student] || {};
                      const phoneData = phoneNumbers[student] || {};
                      const formatPhone = (phone) => {
                        if (!phone) return '';
                        const cleaned = phone.replace(/[^0-9]/g, '');
                        if (cleaned.length === 11) {
                          return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
                        }
                        return phone;
                      };
                      
                      const today = formatLocalYMD();
                      const noticeCount = sentCounts[today]?.[selectedClass]?.[student]?.notice || 0;
                      const completionCount = sentCounts[today]?.[selectedClass]?.[student]?.completion || 0;
                      const hasSent = noticeCount > 0 || completionCount > 0;
                      
                      return (
                        <tr key={student} style={{ backgroundColor: hasSent ? '#d1fae5' : 'transparent' }}>
                          <td style={{ textAlign: 'center', fontWeight: '600' }}>{index + 1}</td>
                          <td style={{ fontWeight: '600', color: '#2c3e50' }}>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={() => handleStudentNameClick(student)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') handleStudentNameClick(student)
                              }}
                              style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              {student}
                            </span>
                            {noticeCount > 0 && <span style={{ marginLeft: '8px', fontSize: '0.85rem', color: '#10b981' }}>(알림장 {noticeCount}건)</span>}
                            {completionCount > 0 && <span style={{ marginLeft: '8px', fontSize: '0.85rem', color: '#9b59b6' }}>(완료도 {completionCount}건)</span>}
                          </td>
                          <td>{info.school || '-'}</td>
                          <td style={{ textAlign: 'center' }}>{info.grade || '-'}</td>
                          <td style={{ minWidth: '180px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                              <div>
                                <span style={{ color: '#666', display: 'block', marginBottom: '2px' }}>학생</span>
                                <input
                                  type="text"
                                  value={phoneData.student || ''}
                                  onChange={(e) => updatePhoneNumber(student, 'student', e.target.value)}
                                  placeholder="010-0000-0000"
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                  }}
                                />
                              </div>
                              <div>
                                <span style={{ color: '#666', display: 'block', marginBottom: '2px' }}>학부모</span>
                                <input
                                  type="text"
                                  value={phoneData.parent || ''}
                                  onChange={(e) => updatePhoneNumber(student, 'parent', e.target.value)}
                                  placeholder="010-0000-0000"
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          {displayProgressList.map(prog => {
                            const progValue = isTableShowingDateProgress
                              ? (dateProgressData[tableDisplayDate]?.[selectedClass]?.[student]?.[prog] ?? '')
                              : (progressData[selectedClass]?.[student]?.[prog] ?? '');
                            return (
                              <td key={prog} style={{ textAlign: 'center', padding: '4px' }}>
                                <input
                                  type="text"
                                  value={progValue}
                                  onChange={(e) => isTableShowingDateProgress
                                    ? updateDateProgress(tableDisplayDate, student, prog, e.target.value)
                                    : updateProgress(student, prog, e.target.value)}
                                  placeholder="진도"
                                  style={{
                                    width: '100%',
                                    minWidth: '80px',
                                    padding: '6px 8px',
                                    fontSize: '0.85rem',
                                    border: '1px solid #99f6e4',
                                    borderRadius: '4px',
                                    boxSizing: 'border-box',
                                  }}
                                />
                              </td>
                            );
                          })}
                          {displayHomeworkList.map(hw => {
                            const hwData = isTableShowingDateHomework
                              ? (dateCompletionData[tableDisplayDate]?.[selectedClass]?.[student]?.[hw] || {})
                              : (completionData[selectedClass]?.[student]?.[hw] || {});
                            const completed = hwData.completed || false;
                            const note = hwData.percentage !== undefined && hwData.percentage !== null ? String(hwData.percentage) : '';
                            return (
                              <td key={hw} style={{ textAlign: 'center' }}>
                                <div className="completion-cell">
                                  <label className="table-completion-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={completed}
                                      onChange={(e) => isTableShowingDateHomework
                                        ? updateDateCompletion(tableDisplayDate, student, hw, e.target.checked)
                                        : updateCompletion(student, hw, e.target.checked)}
                                    />
                                    <span className={completed ? 'completed' : 'not-completed'}>
                                      {completed ? '완료' : '미완료'}
                                    </span>
                                  </label>
                                  <div className="percentage-input-wrapper">
                                    <input
                                      type="text"
                                      value={note}
                                      onChange={(e) => isTableShowingDateHomework
                                        ? updateDatePercentage(tableDisplayDate, student, hw, e.target.value)
                                        : updatePercentage(student, hw, e.target.value)}
                                      placeholder="메모"
                                      className="percentage-input"
                                    />
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td style={{ verticalAlign: 'middle', padding: '4px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <input
                                type="text"
                                value={(() => {
                                  if (selectedClass !== 'all') {
                                    return isTableShowingDateHomework
                                      ? (dateCompletionData[tableDisplayDate]?.[selectedClass]?.[student]?.[COMMENT_KEY] ?? '')
                                      : (completionData[selectedClass]?.[student]?.[COMMENT_KEY] ?? '');
                                  }
                                  const studentClasses = parseClassNames(studentInfo[student]?.className || '').filter(c => classesForSelectedTeacher.includes(c));
                                  const first = studentClasses[0];
                                  if (!first) return '';
                                  return isTableShowingDateHomework
                                    ? (dateCompletionData[tableDisplayDate]?.[first]?.[student]?.[COMMENT_KEY] ?? '')
                                    : (completionData[first]?.[student]?.[COMMENT_KEY] ?? '');
                                })()}
                                onChange={(e) => isTableShowingDateHomework
                                  ? updateDateComment(tableDisplayDate, student, e.target.value)
                                  : updateCompletionComment(student, e.target.value)}
                                placeholder="학생별 코멘트"
                                style={{
                                  flex: 1,
                                  minWidth: '100px',
                                  padding: '6px 8px',
                                  fontSize: '0.85rem',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  boxSizing: 'border-box',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const currentComment = selectedClass !== 'all'
                                    ? (isTableShowingDateHomework
                                        ? (dateCompletionData[tableDisplayDate]?.[selectedClass]?.[student]?.[COMMENT_KEY] ?? '')
                                        : (completionData[selectedClass]?.[student]?.[COMMENT_KEY] ?? ''))
                                    : (() => {
                                        const studentClasses = parseClassNames(studentInfo[student]?.className || '').filter(c => classesForSelectedTeacher.includes(c));
                                        const first = studentClasses[0];
                                        return !first ? '' : (isTableShowingDateHomework
                                          ? (dateCompletionData[tableDisplayDate]?.[first]?.[student]?.[COMMENT_KEY] ?? '')
                                          : (completionData[first]?.[student]?.[COMMENT_KEY] ?? ''));
                                      })();
                                  rewriteCommentWithAI(student, currentComment);
                                }}
                                disabled={commentAiLoading === student}
                                title="간단한 코멘트를 따뜻한 멘트로 바꿔줍니다 (API 키 필요)"
                                style={{
                                  padding: '6px 10px',
                                  fontSize: '0.8rem',
                                  whiteSpace: 'nowrap',
                                  backgroundColor: commentAiLoading === student ? '#9ca3af' : '#8b5cf6',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: commentAiLoading === student ? 'wait' : 'pointer',
                                  fontWeight: '600',
                                }}
                              >
                                {commentAiLoading === student ? '변환 중...' : 'AI로 다듬기'}
                              </button>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedClass === 'all') {
                                  alert('반을 선택해야 전송할 수 있습니다.');
                                  return;
                                }
                                if (displayHomeworkList.length === 0) {
                                  alert('과제를 추가하거나 캘린더 날짜를 선택해주세요.');
                                  return;
                                }
                                setPreviewSendType('completion');
                                setShowPreview(true);
                                // 미리보기에서 전송할 학생 정보 저장
                                sessionStorage.setItem('previewSendStudent', student);
                              }}
                              disabled={sending || selectedClass === 'all'}
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.85rem',
                                backgroundColor: selectedClass === 'all' ? '#9ca3af' : '#9b59b6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: selectedClass === 'all' ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                transition: 'background 0.2s',
                              }}
                              title={selectedClass === 'all' ? '반을 선택해야 전송할 수 있습니다' : '완료도 전송'}
                            >
                              완료도 전송
                            </button>
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteStudent(student)}
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.85rem',
                                backgroundColor: '#ef4444',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={(e) => e.target.style.backgroundColor = '#dc2626'}
                              onMouseLeave={(e) => e.target.style.backgroundColor = '#ef4444'}
                            >
                              🗑️ 삭제
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {filteredAndSortedStudents.length > 0 && (selectedClass !== 'all' && displayHomeworkList.length > 0) && selectedClass !== 'all' && (
            <div className="class-modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleOpenPreview}
                style={{
                  padding: '12px 30px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
              >
                👁️ 미리보기
              </button>
              <button
                onClick={() => {
                  if (selectedClass === 'all') {
                    alert('반을 선택해주세요. 전체 학생에게는 발송할 수 없습니다.');
                    return;
                  }
                  if (displayHomeworkList.length === 0) {
                    alert('과제를 추가하거나 캘린더 날짜를 선택해주세요.');
                    return;
                  }
                  setPreviewSendType('notice');
                  setShowPreview(true);
                  sessionStorage.removeItem('previewSendStudent'); // 전체 전송
                }}
                disabled={(selectedClass !== 'all' && displayHomeworkList.length === 0) || filteredAndSortedStudents.length === 0 || sending}
                style={{
                  padding: '12px 30px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  opacity: ((selectedClass !== 'all' && displayHomeworkList.length === 0) || filteredAndSortedStudents.length === 0 || sending) ? 0.6 : 1,
                }}
              >
                📋 과제 알림장 발송
              </button>
              <button
                className="send-kakao-btn"
                onClick={sendKakaoMessages}
                disabled={displayHomeworkList.length === 0 || filteredAndSortedStudents.length === 0 || sending}
                style={{
                  padding: '12px 30px',
                  background: '#9b59b6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {sending ? '전송 중...' : '완료도 전송'}
              </button>
            </div>
          )}

          {/* 저장 버튼 - 달력 위에 크게 */}
          <div style={{ marginTop: '32px', marginBottom: '24px', textAlign: 'center', padding: '24px', backgroundColor: '#ecfdf5', borderRadius: '12px', border: '2px solid #10b981' }}>
            <button
              type="button"
              onClick={saveAllToFirebase}
              disabled={saving}
              title="학생 목록은 항상 병합 저장, 선택한 반의 과제·완료도·코멘트·전화번호만 해당 반에 반영됩니다."
              style={{
                padding: '18px 48px',
                fontSize: '1.35rem',
                fontWeight: '700',
                backgroundColor: saving ? '#9ca3af' : '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: saving ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.4)',
              }}
            >
              {saving ? '저장 중...' : '💾 숙제·완료도 저장'}
            </button>
            <p style={{ margin: '12px 0 0 0', fontSize: '0.9rem', color: '#6b7280' }}>선택한 반만 저장·누적 (동시 사용 시 본인 반만 반영)</p>
          </div>

          {/* 전송 이력 캘린더 */}
          <div style={{ marginTop: '24px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '2px solid #e0e0e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>📅 보내진 알림장 정리 달력</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('캘린더의 모든 과제 데이터를 삭제하시겠습니까?\n(과제 목록 및 완료도 데이터가 모두 삭제됩니다)')) {
                      return;
                    }
                    
                    if (isFirebaseConfigured() && db) {
                      try {
                        const docRef = doc(db, 'homeworkCompletionDateData', 'all');
                        
                        // 먼저 현재 데이터 확인
                        const currentDoc = await getDoc(docRef);
                        console.log('🗑️ 삭제 전 데이터:', currentDoc.exists() ? currentDoc.data() : '없음');
                        
                        // merge 옵션 없이 완전히 덮어쓰기
                        await setDoc(docRef, {
                          completionData: {},
                          homeworkList: {},
                          lastUpdated: new Date().toISOString(),
                        });
                        
                        // 삭제 확인
                        const afterDelete = await getDoc(docRef);
                        const afterData = afterDelete.exists() ? afterDelete.data() : null;
                        console.log('🗑️ 삭제 후 데이터:', afterData);
                        
                        // 로컬 state도 즉시 초기화 (강제 업데이트)
                        setDateCompletionData({});
                        setDateHomeworkList({});
                        
                        // state 강제 업데이트를 위해 약간의 지연 후 다시 확인
                        setTimeout(() => {
                          setDateCompletionData({});
                          setDateHomeworkList({});
                        }, 100);
                        
                        // 삭제 확인
                        const completionDataEmpty = !afterData?.completionData || Object.keys(afterData.completionData).length === 0;
                        const homeworkListEmpty = !afterData?.homeworkList || Object.keys(afterData.homeworkList).length === 0;
                        
                        if (completionDataEmpty && homeworkListEmpty) {
                          console.log('✅ 캘린더 데이터 삭제 완료');
                          alert('✅ 캘린더의 모든 과제 데이터가 삭제되었습니다.\n\n캘린더가 즉시 업데이트됩니다.');
                        } else {
                          console.warn('⚠️ 삭제 후에도 데이터가 남아있음:', afterData);
                          alert('⚠️ 데이터 삭제가 완료되었지만, 일부 데이터가 남아있을 수 있습니다. 페이지를 새로고침해주세요.');
                        }
                      } catch (error) {
                        console.error('캘린더 데이터 삭제 실패:', error);
                        alert('❌ 데이터 삭제 중 오류가 발생했습니다: ' + error.message);
                      }
                    } else {
                      alert('❌ Firebase가 설정되지 않았습니다.');
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.9rem',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  🗑️ 캘린더 데이터 삭제
                </button>
                <button
                  type="button"
                  onClick={() => setShowCalendar(!showCalendar)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.9rem',
                    backgroundColor: showCalendar ? '#ef4444' : '#0ea5e9',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  {showCalendar ? '숨기기' : '보이기'}
                </button>
              </div>
            </div>

            {showCalendar && (() => {
              // 선택한 월의 첫 날과 마지막 날 계산
              const [year, month] = selectedMonth.split('-').map(Number);
              const firstDay = new Date(year, month - 1, 1);
              const lastDay = new Date(year, month, 0);
              const daysInMonth = lastDay.getDate();
              const startDayOfWeek = firstDay.getDay(); // 0(일요일) ~ 6(토요일)
              
              // 캘린더 날짜 배열 생성
              const calendarDays = [];
              
              // 첫 주의 빈 칸 (이전 달)
              for (let i = 0; i < startDayOfWeek; i++) {
                calendarDays.push(null);
              }
              
              // 현재 달의 날짜들
              for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                calendarDays.push(dateStr);
              }
              
              // 마지막 주의 빈 칸 (다음 달)
              const remainingCells = 42 - calendarDays.length; // 6주 x 7일 = 42
              for (let i = 0; i < remainingCells; i++) {
                calendarDays.push(null);
              }
              
              return (
                <div>
                  {/* 월 선택 */}
                  <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const [y, m] = selectedMonth.split('-').map(Number);
                        const prevMonth = m === 1 ? 12 : m - 1;
                        const prevYear = m === 1 ? y - 1 : y;
                        setSelectedMonth(`${prevYear}-${String(prevMonth).padStart(2, '0')}`);
                        setSelectedDateDetail(null);
                      }}
                      style={{
                        padding: '8px 16px',
                        fontSize: '1rem',
                        backgroundColor: '#0ea5e9',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                      }}
                    >
                      ← 이전 달
                    </button>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        setSelectedDateDetail(null);
                      }}
                      style={{
                        padding: '8px 12px',
                        border: '2px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const [y, m] = selectedMonth.split('-').map(Number);
                        const nextMonth = m === 12 ? 1 : m + 1;
                        const nextYear = m === 12 ? y + 1 : y;
                        setSelectedMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
                        setSelectedDateDetail(null);
                      }}
                      style={{
                        padding: '8px 16px',
                        fontSize: '1rem',
                        backgroundColor: '#0ea5e9',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                      }}
                    >
                      다음 달 →
                    </button>
                  </div>

                  {/* 캘린더 그리드 */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(7, 1fr)', 
                    gap: '4px',
                    marginBottom: '20px',
                  }}>
                    {/* 요일 헤더 */}
                    {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                      <div
                        key={day}
                        style={{
                          padding: '10px',
                          textAlign: 'center',
                          fontWeight: '600',
                          backgroundColor: day === '일' ? '#fee2e2' : day === '토' ? '#dbeafe' : '#f3f4f6',
                          color: day === '일' ? '#dc2626' : day === '토' ? '#2563eb' : '#374151',
                          borderRadius: '4px',
                        }}
                      >
                        {day}
                      </div>
                    ))}
                    
                    {/* 날짜 셀 */}
                    {calendarDays.map((date, index) => {
                      if (!date) {
                        return (
                          <div
                            key={`empty-${index}`}
                            style={{
                              aspectRatio: '1',
                              backgroundColor: '#f9fafb',
                              borderRadius: '4px',
                            }}
                          />
                        );
                      }
                      
                      // 저장된 날짜별 과제·진도 목록 우선 사용 (반별로 분리)
                      const savedHomework = dateHomeworkList[date] || {};
                      const savedProgress = dateProgressList[date] || {};
                      const allSavedHomework = new Set();
                      const allSavedProgress = new Set();
                      if (selectedClass !== 'all' && savedHomework[selectedClass]) {
                        if (Array.isArray(savedHomework[selectedClass])) {
                          savedHomework[selectedClass].forEach(hw => allSavedHomework.add(hw));
                        }
                      }
                      if (selectedClass !== 'all' && savedProgress[selectedClass]) {
                        if (Array.isArray(savedProgress[selectedClass])) {
                          savedProgress[selectedClass].forEach(p => allSavedProgress.add(p));
                        }
                      }

                      // 캘린더 누락 복구:
                      // dateHomeworkList/dateProgressList에 없더라도, sendHistory에는 전송된 과제목록이 남아있을 수 있음.
                      // 그 경우 sendHistory에서 과제목록을 가져와 캘린더 표시를 채운다.
                      if (selectedClass !== 'all') {
                        const dayHistory = sendHistory?.[date] || [];
                        const dayClassHistory = Array.isArray(dayHistory)
                          ? dayHistory.filter((item) => item?.반명 === selectedClass)
                          : [];
                        dayClassHistory.forEach((item) => {
                          const list = item?.과제목록;
                          if (Array.isArray(list)) {
                            list.forEach((hw) => allSavedHomework.add(hw));
                          }
                          const progList = item?.진도목록;
                          if (Array.isArray(progList)) {
                            progList.forEach((p) => allSavedProgress.add(p));
                          } else if (item?.진도상황 && typeof item.진도상황 === 'string') {
                            parseProgressLabelsFromSituation(item.진도상황).forEach((p) => allSavedProgress.add(p));
                          }
                        });
                      }

                      const allHomework = allSavedHomework;
                      const allProgress = allSavedProgress;
                      const hasHistory = allHomework.size > 0 || allProgress.size > 0;
                      const isToday = date === formatLocalYMD();
                      const dayNumber = parseInt(date.split('-')[2]);
                      
                      return (
                        <div
                          key={date}
                          onClick={() => {
                            if (selectedClass === 'all') {
                              alert('반을 선택한 후 날짜를 클릭해주세요.');
                              return;
                            }
                            setSelectedDateForHomework(date);
                            setTableDisplayDate(date); // 표에 표시할 과제 날짜도 클릭한 날짜로 연동
                            setSelectedDateDetail(null);
                            let existingHomework = dateHomeworkList[date]?.[selectedClass] || [];
                            // 저장된 과제 목록이 비어있으면, sendHistory에서 가져와 입력값도 채움
                            if (Array.isArray(existingHomework) && existingHomework.length === 0 && selectedClass !== 'all') {
                              const dayHistory = sendHistory?.[date] || [];
                              const dayClassHistory = Array.isArray(dayHistory)
                                ? dayHistory.filter((item) => item?.반명 === selectedClass)
                                : [];
                              const hwSet = new Set();
                              dayClassHistory.forEach((item) => {
                                const list = item?.과제목록;
                                if (Array.isArray(list)) {
                                  list.forEach((hw) => hwSet.add(hw));
                                }
                              });
                              existingHomework = Array.from(hwSet);
                            }
                            setDateHomeworkInput((existingHomework || []).join('\n'));
                            let existingProgress = dateProgressList[date]?.[selectedClass] || [];
                            if (Array.isArray(existingProgress) && existingProgress.length === 0 && selectedClass !== 'all') {
                              const dayHistoryP = sendHistory?.[date] || [];
                              const dayClassHistoryP = Array.isArray(dayHistoryP)
                                ? dayHistoryP.filter((item) => item?.반명 === selectedClass)
                                : [];
                              const pSet = new Set();
                              dayClassHistoryP.forEach((item) => {
                                const plist = item?.진도목록;
                                if (Array.isArray(plist)) {
                                  plist.forEach((p) => pSet.add(p));
                                } else if (item?.진도상황 && typeof item.진도상황 === 'string') {
                                  parseProgressLabelsFromSituation(item.진도상황).forEach((p) => pSet.add(p));
                                }
                              });
                              existingProgress = Array.from(pSet);
                            }
                            setDateProgressInput((existingProgress || []).join('\n'));
                          }}
                          style={{
                            aspectRatio: '1',
                            padding: '8px',
                            backgroundColor: hasHistory 
                              ? (isToday ? '#d1fae5' : '#e0f2fe') 
                              : (isToday ? '#fef3c7' : '#fff'),
                            border: isToday ? '2px solid #f59e0b' : hasHistory ? '2px solid #0ea5e9' : '1px solid #e5e7eb',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            minHeight: '100px',
                          }}
                        >
                          <div style={{
                            fontWeight: isToday ? '700' : '600',
                            fontSize: '0.9rem',
                            color: isToday ? '#92400e' : '#374151',
                            marginBottom: '4px',
                          }}>
                            {dayNumber}
                          </div>
                          {hasHistory && (
                            <div style={{
                              fontSize: '0.8rem',
                              color: '#000',
                              textAlign: 'center',
                              lineHeight: '1.2',
                              width: '100%',
                              maxHeight: '120px',
                              overflowY: 'auto',
                              overflowX: 'hidden',
                              flex: 1,
                            }}>
                              {Array.from(allProgress).map((p, idx) => (
                                <div key={`p-${idx}`} style={{ color: '#0d9488', marginBottom: '2px', wordBreak: 'break-word', fontWeight: '700' }}>
                                  📖 {p}
                                </div>
                              ))}
                              {Array.from(allHomework).map((hw, idx) => (
                                <div key={`hw-${idx}`} style={{ color: '#000', marginBottom: '2px', wordBreak: 'break-word', fontWeight: '500' }}>
                                  {hw}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 선택한 날짜의 상세 정보 */}
                  {selectedDateDetail && sendHistory[selectedDateDetail] && (
                    <div style={{
                      marginTop: '20px',
                      padding: '20px',
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      border: '2px solid #0ea5e9',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h4 style={{ margin: 0, color: '#2c3e50', fontSize: '1.2rem' }}>
                          📅 {new Date(selectedDateDetail).getFullYear()}년 {new Date(selectedDateDetail).getMonth() + 1}월 {new Date(selectedDateDetail).getDate()}일
                        </h4>
                        <button
                          type="button"
                          onClick={() => setSelectedDateDetail(null)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.9rem',
                            backgroundColor: '#6b7280',
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
                      
                      {(() => {
                        const dayHistory = sendHistory[selectedDateDetail] || [];
                        const groupedByClass = {};
                        dayHistory.forEach(item => {
                          const key = `${item.반명}_${item.타입}`;
                          if (!groupedByClass[key]) {
                            groupedByClass[key] = {
                              반명: item.반명,
                              타입: item.타입,
                              학생들: new Set(),
                              과제목록: new Set(),
                            };
                          }
                          // 학생명이 쉼표로 구분되어 있을 수 있음
                          if (typeof item.학생명 === 'string' && item.학생명.includes(',')) {
                            item.학생명.split(',').forEach(name => groupedByClass[key].학생들.add(name.trim()));
                          } else {
                            groupedByClass[key].학생들.add(item.학생명);
                          }
                          item.과제목록.forEach(hw => groupedByClass[key].과제목록.add(hw));
                        });
                        
                        return Object.values(groupedByClass).map((group, idx) => (
                          <div key={idx} style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>
                            <div style={{ fontWeight: '600', marginBottom: '8px', color: '#0ea5e9' }}>
                              {formatClassName(group.반명)} - {group.타입}
                            </div>
                            <div style={{ fontSize: '0.9rem', marginBottom: '5px' }}>
                              <strong>학생:</strong> {Array.from(group.학생들).join(', ')}
                            </div>
                            <div style={{ fontSize: '0.9rem' }}>
                              <strong>과제:</strong> {Array.from(group.과제목록).join('\n')}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  
                  {Object.keys(sendHistory).length === 0 && (
                    <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
                      아직 전송된 이력이 없습니다.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 학생 이름 클릭 시 표시하는 전송 이력 모달 */}
          {studentKakaoHistoryOpen && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.35)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
              }}
              onClick={() => setStudentKakaoHistoryOpen(false)}
            >
              <div
                style={{
                  width: 'min(900px, 100%)',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  background: '#fff',
                  borderRadius: '10px',
                  border: '2px solid #0ea5e9',
                  padding: '18px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '1.2rem' }}>
                    👤 {studentKakaoHistoryTarget} 학생에게 보내진 카톡 이력
                  </h3>
                  <button
                    type="button"
                    onClick={() => setStudentKakaoHistoryOpen(false)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.9rem',
                      backgroundColor: '#6b7280',
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

                {studentKakaoHistoryEntries.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#999', padding: '24px' }}>
                    아직 전송된 이력이 없습니다.
                  </p>
                ) : (
                  <div>
                    {(() => {
                      const groupedByDate = {}
                      studentKakaoHistoryEntries.forEach((entry) => {
                        if (!groupedByDate[entry.date]) groupedByDate[entry.date] = []
                        groupedByDate[entry.date].push(entry)
                      })
                      const dates = Object.keys(groupedByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

                      return dates.map((date) => (
                        <div key={date} style={{ marginBottom: '14px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
                          <div style={{ fontWeight: '700', color: '#0ea5e9', marginBottom: '10px' }}>
                            📅 {date}
                          </div>
                          {groupedByDate[date].map((entry, idx) => (
                            <div key={`${date}-${idx}`} style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#2c3e50', marginBottom: '6px' }}>
                                {entry.반명 ? formatClassName(entry.반명) : entry.반명} - {entry.타입}
                                {entry.시간 ? (
                                  <span style={{ fontWeight: '500', color: '#6b7280', marginLeft: '10px', fontSize: '0.85rem' }}>
                                    {new Date(entry.시간).toLocaleString()}
                                  </span>
                                ) : null}
                              </div>
                              <div style={{ fontSize: '0.9rem', color: '#374151' }}>
                                <div style={{ fontWeight: '600', marginBottom: '4px' }}>과제:</div>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                                  {(Array.isArray(entry.과제목록) ? entry.과제목록 : []).join('\n')}
                                </pre>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 날짜별 완료도 입력 섹션 */}
          {selectedDateForCompletion && (() => {
            const selectedDate = selectedDateForCompletion;
            const dayHistory = sendHistory[selectedDate] || [];
            
            // 반이 선택되지 않은 경우 안내
            if (selectedClass === 'all') {
              return (
                <div style={{
                  marginTop: '40px',
                  padding: '20px',
                  backgroundColor: '#fff',
                  borderRadius: '8px',
                  border: '2px solid #fbbf24',
                  textAlign: 'center',
                }}>
                  <p style={{ color: '#92400e', fontSize: '1rem', margin: 0 }}>
                    반을 선택한 후 날짜를 클릭해주세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedDateForCompletion(null)}
                    style={{
                      marginTop: '15px',
                      padding: '8px 16px',
                      fontSize: '0.9rem',
                      backgroundColor: '#6b7280',
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
              );
            }
            
            // 저장된 날짜별 과제 목록 우선 사용 (반별로 분리), 없으면 전송 이력에서 수집
            let homeworkArray = dateHomeworkList[selectedDate]?.[selectedClass] || [];
            if (homeworkArray.length === 0) {
              const dateHomework = new Set();
              dayHistory.forEach(item => {
                // 해당 반의 과제만 수집
                if (item.반명 === selectedClass) {
                  item.과제목록.forEach(hw => dateHomework.add(hw));
                }
              });
              homeworkArray = Array.from(dateHomework);
            }
            
            // 해당 날짜에 전송된 학생 목록 수집 (선택한 반의 학생만)
            const dateStudents = new Set();
            
            dayHistory.forEach(item => {
              // 해당 반의 학생만 수집
              if (item.반명 === selectedClass) {
                if (typeof item.학생명 === 'string' && item.학생명.includes(',')) {
                  item.학생명.split(',').forEach(name => dateStudents.add(name.trim()));
                } else {
                  dateStudents.add(item.학생명);
                }
              }
            });
            
            const studentsArray = Array.from(dateStudents).sort();
            
            return (
              <div style={{
                marginTop: '40px',
                padding: '20px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '2px solid #9b59b6',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, color: '#2c3e50' }}>
                    📝 {new Date(selectedDate).getFullYear()}년 {new Date(selectedDate).getMonth() + 1}월 {new Date(selectedDate).getDate()}일 과제 완료도 입력
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSelectedDateForCompletion(null)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '0.9rem',
                      backgroundColor: '#6b7280',
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

                {homeworkArray.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    해당 날짜에 전송된 과제가 없습니다.
                  </p>
                ) : (
                  <>
                    <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '8px', color: '#0ea5e9' }}>
                        반: {formatClassName(selectedClass)}
                      </div>
                      <div style={{ fontWeight: '600', marginBottom: '8px', color: '#0ea5e9' }}>
                        전송된 과제: {homeworkArray.join('\n')}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#666' }}>
                        학생 수: {studentsArray.length}명
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb', minWidth: '100px' }}>학생명</th>
                            {homeworkArray.map(hw => (
                              <th key={hw} style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb', minWidth: '150px', color: '#000' }}>
                                {hw}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {studentsArray.map(student => (
                            <tr key={student}>
                              <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: '600' }}>
                                {student}
                              </td>
                              {homeworkArray.map(hw => {
                                const hwData = dateCompletionData[selectedDate]?.[selectedClass]?.[student]?.[hw] || {};
                                const completed = hwData.completed || false;
                                const note = hwData.percentage !== undefined && hwData.percentage !== null ? String(hwData.percentage) : '';
                                
                                return (
                                  <td key={hw} style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                        <input
                                          type="checkbox"
                                          checked={completed}
                                          onChange={(e) => updateDateCompletion(selectedDate, student, hw, e.target.checked)}
                                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '0.85rem', color: completed ? '#10b981' : '#6b7280' }}>
                                          {completed ? '완료' : '미완료'}
                                        </span>
                                      </label>
                                      <input
                                        type="text"
                                        value={note}
                                        onChange={(e) => updateDatePercentage(selectedDate, student, hw, e.target.value)}
                                        placeholder="메모"
                                        style={{
                                          minWidth: '80px',
                                          padding: '4px 8px',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '4px',
                                          fontSize: '0.85rem',
                                        }}
                                      />
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: '20px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={async () => {
                          if (selectedClass === 'all') {
                            alert('반을 선택해주세요.');
                            return;
                          }
                          if (homeworkArray.length === 0) {
                            alert('과제가 없습니다.');
                            return;
                          }
                          
                          // 해당 날짜의 완료도 전송
                          setPreviewSendType('completion');
                          setShowPreview(true);
                          sessionStorage.setItem('previewSendDate', selectedDate);
                          sessionStorage.setItem('previewSendHomework', JSON.stringify(homeworkArray));
                        }}
                        disabled={selectedClass === 'all' || homeworkArray.length === 0}
                        style={{
                          padding: '12px 30px',
                          fontSize: '1.1rem',
                          backgroundColor: selectedClass === 'all' || homeworkArray.length === 0 ? '#9ca3af' : '#9b59b6',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: selectedClass === 'all' || homeworkArray.length === 0 ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                        }}
                      >
                        📱 완료도 전송
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* 날짜별 과제 입력 모달 */}
        {selectedDateForHomework && selectedClass !== 'all' && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
            }}
            onClick={() => {
              setSelectedDateForHomework(null);
              setDateHomeworkInput('');
              setDateProgressInput('');
            }}
          >
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '30px',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '1.5rem' }}>
                  📅 {selectedDateForHomework} 과제 입력
                </h2>
                <button
                  onClick={() => {
                    setSelectedDateForHomework(null);
                    setDateHomeworkInput('');
                    setDateProgressInput('');
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                  }}
                >
                  닫기
                </button>
              </div>

              <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>
                <div style={{ fontWeight: '600', marginBottom: '5px', color: '#0ea5e9' }}>
                  반: {formatClassName(selectedClass)}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#666' }}>
                  날짜: {selectedDateForHomework}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                  과제 목록 (한 줄에 하나씩 입력)
                </label>
                <textarea
                  value={dateHomeworkInput}
                  onChange={(e) => setDateHomeworkInput(e.target.value)}
                  placeholder="예:&#10;동사의 모든것 1,2,3&#10;전환의모든것 1,2"
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px',
                    border: '2px solid #0ea5e9',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    lineHeight: '1.6',
                  }}
                />
                <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#666' }}>
                  💡 한 줄에 하나씩 과제를 입력하세요. 줄바꿈으로 구분됩니다.
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                  진도 목록 (한 줄에 하나씩 입력, 과제와 동일하게 표·캘린더에 표시)
                </label>
                <textarea
                  value={dateProgressInput}
                  onChange={(e) => setDateProgressInput(e.target.value)}
                  placeholder="예:&#10;동사의 모든것 p.10&#10;전환의모든것 1단원"
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px',
                    border: '2px solid #0d9488',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    lineHeight: '1.6',
                  }}
                />
                <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#666' }}>
                  💡 한 줄에 하나씩 진도 항목을 입력하세요. 표에서 학생별로 진도 값을 입력할 수 있습니다.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setSelectedDateForHomework(null);
                    setDateHomeworkInput('');
                    setDateProgressInput('');
                  }}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#9ca3af',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                  }}
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    // 줄바꿈으로 구분된 과제 목록을 배열로 변환 (비어 있으면 빈 배열로 저장)
                    const homeworkArray = (dateHomeworkInput || '')
                      .split('\n')
                      .map(hw => hw.trim())
                      .filter(hw => hw !== '');

                    // dateHomeworkList 업데이트 (내용 없으면 해당 날짜·반 과제를 비움)
                    setDateHomeworkList(prev => ({
                      ...prev,
                      [selectedDateForHomework]: {
                        ...(prev[selectedDateForHomework] || {}),
                        [selectedClass]: homeworkArray,
                      },
                    }));

                    const progressArray = (dateProgressInput || '')
                      .split('\n')
                      .map(p => p.trim())
                      .filter(p => p !== '');
                    setDateProgressList(prev => ({
                      ...prev,
                      [selectedDateForHomework]: {
                        ...(prev[selectedDateForHomework] || {}),
                        [selectedClass]: progressArray,
                      },
                    }));

                    alert(`✅ ${selectedDateForHomework} 날짜의 과제·진도가 저장되었습니다. 저장 버튼을 누르면 Firebase에 반영됩니다.`);
                    setTableDisplayDate(selectedDateForHomework); // 표에 해당 날짜 과제 표시
                    setSelectedDateForHomework(null);
                    setDateHomeworkInput('');
                    setDateProgressInput('');
                  }}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                  }}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 카톡 전송 미리보기 모달 */}
        {showPreview && (
          <div className="preview-modal-overlay" onClick={() => setShowPreview(false)}>
            <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="preview-modal-header">
                <h3>📱 카카오톡 전송 미리보기</h3>
                <button className="close-btn" onClick={() => {
                  setShowPreview(false);
                  setPreviewSendType(null);
                  sessionStorage.removeItem('previewSendStudent');
                }}>닫기</button>
              </div>
              
              <div className="preview-template-section">
                <label htmlFor="template-code" style={{ marginRight: '10px', fontWeight: '600' }}>
                  템플릿 코드:
                </label>
                <input
                  id="template-code"
                  type="text"
                  value={previewSendType === 'notice' ? 'KA01TP260318145508902GuVLeuxXXlc' : 'KA01TP260119030638192BnlwNmKPy78'}
                  readOnly
                  style={{
                    padding: '8px 15px',
                    border: '2px solid #9b59b6',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    backgroundColor: '#f0f0f0',
                    color: '#666',
                    flex: 1,
                    maxWidth: '400px',
                  }}
                />
              </div>

              <div className="preview-list" style={{ padding: '20px 30px', overflowY: 'auto', flex: 1 }}>
                {generatePreview(previewSendType).map((preview, index) => (
                  <div key={preview.student} className="preview-item">
                    <div className="preview-item-header">
                      <span className="preview-student-name">
                        {preview.student}
                        {preview.grade && ` (${preview.grade})`}
                        {preview.className && ` - ${preview.className}`}
                      </span>
                      <div className="preview-phones">
                        {preview.phone && (
                          <span className="phone-badge">학생: {preview.phone}</span>
                        )}
                        {preview.parentPhone && (
                          <span className="phone-badge">학부모: {preview.parentPhone}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="preview-content-section">
                      <div className="preview-content">
                        <strong>과제 목록:</strong>
                        <pre className="preview-text">{preview.homeworkList}</pre>
                      </div>
                      
                      {previewSendType === 'completion' && (
                        <div className="preview-content">
                          <strong>과제 완료 상태:</strong>
                          <pre className="preview-text">{preview.homeworkStatus}</pre>
                        </div>
                      )}
                      {previewSendType === 'notice' && (
                        <div className="preview-content">
                          <strong>과제 목록 (완료도 없음):</strong>
                          <pre className="preview-text">{preview.homeworkStatus}</pre>
                        </div>
                      )}
                      {!previewSendType && (
                        <div className="preview-content">
                          <strong>과제 완료 상태:</strong>
                          <pre className="preview-text">{preview.homeworkStatus}</pre>
                        </div>
                      )}
                      {preview.progressStatus && (
                        <div className="preview-content">
                          <strong>진도 상황:</strong>
                          <pre className="preview-text">{preview.progressStatus}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="preview-modal-actions">
                {previewSendType === 'notice' && (
                  <button
                    className="send-kakao-btn"
                    onClick={async () => {
                      setShowPreview(false);
                      // 과제 알림장은 항상 단체 전송
                      await sendHomeworkNotices();
                      setPreviewSendType(null);
                      sessionStorage.removeItem('previewSendStudent');
                    }}
                    disabled={sending}
                    style={{
                      padding: '12px 30px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {sending ? '전송 중...' : '📋 과제 알림장 발송'}
                  </button>
                )}
                {previewSendType === 'completion' && (
                  <button
                    className="send-kakao-btn"
                    onClick={async () => {
                      setShowPreview(false);
                      const previewStudent = sessionStorage.getItem('previewSendStudent');
                      const previewSendDate = sessionStorage.getItem('previewSendDate');
                      
                      if (previewSendDate) {
                        // 날짜별 완료도 전송
                        await sendDateCompletionMessages(previewSendDate);
                        sessionStorage.removeItem('previewSendDate');
                        sessionStorage.removeItem('previewSendHomework');
                      } else if (previewStudent) {
                        // 개별 전송
                        await sendKakaoToStudent(previewStudent);
                        sessionStorage.removeItem('previewSendStudent');
                      } else {
                        // 전체 전송
                        await sendKakaoMessages();
                      }
                      setPreviewSendType(null);
                    }}
                    disabled={sending}
                    style={{
                      padding: '12px 30px',
                      background: '#9b59b6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {sending ? '전송 중...' : '완료도 전송'}
                  </button>
                )}
                {!previewSendType && (
                  <button
                    className="send-kakao-btn"
                    onClick={() => {
                      setShowPreview(false);
                      sendKakaoMessages();
                    }}
                    disabled={sending}
                    style={{
                      padding: '12px 30px',
                      background: '#9b59b6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {sending ? '전송 중...' : '📱 카톡으로 발송'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowPreview(false);
                    setPreviewSendType(null);
                    sessionStorage.removeItem('previewSendStudent');
                  }}
                  style={{
                    padding: '12px 30px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    marginLeft: '10px',
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

