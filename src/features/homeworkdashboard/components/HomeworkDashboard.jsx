import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';

const HOMEWORK_COMPLETION_PHONE_DOC = 'homeworkCompletionPhoneNumbers';
const HOMEWORK_COMPLETION_PHONE_DOC_ID = 'all';
const ENGLISH_PROGRESS_COLLECTION = 'englishHomeworkProgress';

function parseClassNames(classNameStr) {
  if (!classNameStr || typeof classNameStr !== 'string') return [];
  return classNameStr.split(',').map((c) => c.trim()).filter((c) => c !== '');
}

// Firestore 문서 ID에는 / 사용 불가(경로로 해석됨). 슬래시를 언더스코어로 치환
function sanitizeDocId(id) {
  if (id == null || typeof id !== 'string') return '';
  return id.replace(/\//g, '_').trim() || '';
}

// 반 이름(docId)에서 학교·학년 그룹 라벨 추출 (이동된 반 목록을 학교/학년별로 묶어 표시)
function getSchoolGradeGroup(docId) {
  const s = String(docId || '').replace(/\s/g, '');
  if (/중앙고\s*1|중앙고1/.test(s)) return '과천중앙고 1학년';
  if (/중앙고\s*2|중앙고2/.test(s)) return '과천중앙고 2학년';
  if (/중앙고\s*3|중앙고3/.test(s)) return '과천중앙고 3학년';
  if (/과천고\s*1|과천고1|과고\s*1|과고1|^고1[_\s]|고1$/.test(s)) return '과천고 1학년';
  if (/과천고\s*2|과천고2|과고\s*2|과고2|^고2[_\s]|고2$/.test(s)) return '과천고 2학년';
  if (/과천고\s*3|과천고3|과고\s*3|과고3|^고3[_\s]|고3$/.test(s)) return '과천고 3학년';
  if (/중1\b|중\s*1[_\s]|_중1$|^중1_/.test(s)) return '중학교 1학년';
  if (/중2\b|중\s*2[_\s]|_중2$|^중2_/.test(s)) return '중학교 2학년';
  if (/중3\b|중\s*3[_\s]|_중3$|^중3_/.test(s)) return '중학교 3학년';
  if (/외고\s*1|외고1/.test(s)) return '과천외고 1학년';
  if (/외고\s*2|외고2/.test(s)) return '과천외고 2학년';
  if (/외고\s*3|외고3/.test(s)) return '과천외고 3학년';
  if (/여고\s*1|여고1/.test(s)) return '과천여고 1학년';
  if (/여고\s*2|여고2/.test(s)) return '과천여고 2학년';
  if (/여고\s*3|여고3/.test(s)) return '과천여고 3학년';
  if (/외고/.test(s)) return '과천외고';
  if (/여고/.test(s)) return '과천여고';
  if (/초6|초등\s*6/.test(s)) return '초등학교 6학년';
  return '기타';
}

// 그룹 정렬 순서 (학교·학년별 리스트 표시용)
const SCHOOL_GRADE_ORDER = [
  '중학교 1학년', '중학교 2학년', '중학교 3학년',
  '과천고 1학년', '과천고 2학년', '과천고 3학년',
  '과천중앙고 1학년', '과천중앙고 2학년', '과천중앙고 3학년',
  '과천외고 1학년', '과천외고 2학년', '과천외고 3학년', '과천외고',
  '과천여고 1학년', '과천여고 2학년', '과천여고 3학년', '과천여고',
  '초등학교 6학년', '기타',
];

import * as XLSX from 'xlsx';
import './HomeworkDashboard.css';

// 과제 관리 대시보드 컴포넌트
export default function HomeworkDashboard({ subject = 'english', onClose, onShowRoster }) {
  // 수학 과제 관리용 학년 목록
  const mathGrades = [
    '초등학교 6학년',
    '중학교 1학년',
    '중학교 2학년',
    '중학교 3학년',
    '고등학교 1학년',
    '고등학교 2학년',
    '고등학교 3학년',
  ];
  
  // 영어 과제 관리용 학교 목록
  const schools = [
    '과천고등학교',
    '과천중앙고등학교',
    '과천외고',
    '과천여고',
    '중학교 1학년',
    '중학교 2학년',
    '중학교 3학년',
    '초등학교 6학년',
  ];

  // 수학 과제 관리용 초기값
  const [selectedMathGrade, setSelectedMathGrade] = useState(subject === 'math' ? '초등학교 6학년' : '');
  const [selectedMathTeacher, setSelectedMathTeacher] = useState('이민하');
  const [selectedMathClass, setSelectedMathClass] = useState('월금반');
  
  // 영어 과제 관리용 초기값
  const [selectedSchool, setSelectedSchool] = useState(subject === 'english' ? '과천고등학교' : '');
  const [selectedGrade, setSelectedGrade] = useState(subject === 'english' ? '1학년' : '');
  const [selectedTeacher, setSelectedTeacher] = useState('김서연'); // 중학교 1학년용
  const [selectedClass, setSelectedClass] = useState('화목 4시반 정규');
  
  // 수학 과제 관리용 선생님 목록
  const mathTeachers = ['이민하', '임예희', '김지수', '신화정'];
  
  // 수학 과제 관리용 반 목록
  const mathClasses = ['월금반', '화목반', '월수금반', '수토반'];
  
  // 영어 과제 관리용 선생님 목록
  const teachers = ['김서연', '한유빈', '이예지'];

  // 학년별 반 목록 (학교와 학년에 따라 동적으로 생성)
  const classOptions = useMemo(() => {
    // 중학교 1학년 - 김서연 선생님
    if (selectedSchool === '중학교 1학년' && selectedTeacher === '김서연') {
      return ['화목 4시반 정규', '월금 4시 정규', '수토 4시 정규'];
    }
    // 과천고등학교
    if (selectedSchool === '과천고등학교' && selectedGrade === '1학년') {
      return ['화목반', '수토반', '일요일반'];
    }
    if (selectedSchool === '과천고등학교' && selectedGrade === '2학년') {
      return ['화요일반', '수요일반', '금요일반', '일요일반'];
    }
    if (selectedSchool === '과천고등학교' && selectedGrade === '3학년') {
      return ['금요일반', '일요일반'];
    }
    // 과천중앙고등학교
    if (selectedSchool === '과천중앙고등학교' && selectedGrade === '1학년') {
      return ['화목반', '월금반', '일요일반'];
    }
    if (selectedSchool === '과천중앙고등학교' && selectedGrade === '2학년') {
      return ['월요일반', '화요일반', '금요일반', '일요일반'];
    }
    if (selectedSchool === '과천중앙고등학교' && selectedGrade === '3학년') {
      return ['금요일반', '일요일반'];
    }
    // 과천외고
    if (selectedSchool === '과천외고' && selectedGrade === '1학년') {
      return ['공통 토요일반', '공통 일요일반'];
    }
    if (selectedSchool === '과천외고' && selectedGrade === '2학년') {
      return ['중일프독영 토요일반', '중일프독영 일요일반'];
    }
    if (selectedSchool === '과천외고' && selectedGrade === '3학년') {
      return ['금요일반', '일요일반'];
    }
    // 과천여고
    if (selectedSchool === '과천여고' && selectedGrade === '1학년') {
      return ['화목반', '금요일반'];
    }
    if (selectedSchool === '과천여고' && selectedGrade === '2학년') {
      return ['월요일반', '토요일반'];
    }
    if (selectedSchool === '과천여고' && selectedGrade === '3학년') {
      return ['금요일반', '일요일반'];
    }
    // 다른 학교의 경우 기본 반 목록
    const baseClasses = ['토요반', '일반반', '특별반'];
    return baseClasses.map((cls) => `${selectedGrade} ${cls}`);
  }, [selectedSchool, selectedGrade, selectedTeacher]);

  // 학교나 학년, 선생님이 변경되면 반 선택을 자동으로 업데이트
  useEffect(() => {
    if (selectedSchool === '중학교 1학년') {
      // 중학교 1학년에서 김서연 선생님 선택 시 반 선택 표시
      if (selectedTeacher === '김서연' && classOptions.length > 0) {
        if (!classOptions.includes(selectedClass)) {
          setSelectedClass(classOptions[0]);
        }
      } else {
        setSelectedClass('');
      }
      return;
    }
    
    if (classOptions.length > 0) {
      // 현재 선택된 반이 새로운 목록에 없으면 첫 번째 항목으로 변경
      if (!classOptions.includes(selectedClass)) {
        setSelectedClass(classOptions[0]);
      }
    } else {
      setSelectedClass('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchool, selectedGrade, selectedTeacher, classOptions]);
  
  // 중학교 1학년 선택 시 학년 초기화
  useEffect(() => {
    if (selectedSchool === '중학교 1학년') {
      setSelectedGrade('');
    } else if (!selectedGrade) {
      setSelectedGrade('1학년');
    }
  }, [selectedSchool, selectedGrade]);

  // 영어 과제 관리 전용: 전화번호 엑셀 업로드 (선택한 반에만 적용)
  const [phoneUploading, setPhoneUploading] = useState(false);
  // 숙제 완료도 → 영어 과제 이전: 이동된 반 목록 (doc id 목록)
  const [migratedDocIds, setMigratedDocIds] = useState([]);
  const [migrationLoading, setMigrationLoading] = useState(false);

  // 숙제 완료도에서 이전한 반만 표시 (옛날 영어 과제 관리로 만든 문서 제외)
  const loadMigratedDocIds = useCallback(async () => {
    if (!isFirebaseConfigured() || !db || subject !== 'english') return;
    try {
      const snap = await getDocs(collection(db, ENGLISH_PROGRESS_COLLECTION));
      const ids = snap.docs
        .filter((d) => d.data()?.migratedFromCompletion === true)
        .map((d) => d.id);
      setMigratedDocIds(ids);
    } catch (e) {
      console.warn('이동된 반 목록 로드 실패:', e);
    }
  }, [subject]);

  useEffect(() => {
    if (subject === 'english') loadMigratedDocIds();
  }, [subject, loadMigratedDocIds]);

  // 이동된 반을 학교·학년별로 그룹화 (반 이름 기준)
  const migratedBySchoolGrade = useMemo(() => {
    const map = new Map();
    for (const id of migratedDocIds) {
      const group = getSchoolGradeGroup(id);
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(id);
    }
    const order = SCHOOL_GRADE_ORDER.filter((g) => map.has(g));
    const rest = [...map.keys()].filter((g) => !SCHOOL_GRADE_ORDER.includes(g));
    return [...order, ...rest].map((group) => ({ group, ids: map.get(group) }));
  }, [migratedDocIds]);

  const runMigrationFromCompletion = useCallback(async () => {
    if (subject !== 'english' || !isFirebaseConfigured() || !db) return;
    if (!window.confirm('영어 과제 관리의 현재 데이터를 모두 지우고, 숙제 과제 완료도에 있는 반을 전부 가져옵니다. 계속할까요?')) return;
    setMigrationLoading(true);
    try {
      const phoneRef = doc(db, HOMEWORK_COMPLETION_PHONE_DOC, HOMEWORK_COMPLETION_PHONE_DOC_ID);
      const phoneSnap = await getDoc(phoneRef);
      if (!phoneSnap.exists()) {
        alert('숙제 과제 완료도 데이터가 없습니다.');
        setMigrationLoading(false);
        return;
      }
      const data = phoneSnap.data();
      const students = data.students || [];
      const studentInfo = data.studentInfo || {};
      const phoneNumbers = data.phoneNumbers || {};
      const addedClassList = Array.isArray(data.addedClassList) ? data.addedClassList : [];
      const allClassNames = new Set(addedClassList);
      students.forEach((name) => {
        const className = studentInfo[name]?.className || '';
        parseClassNames(className).forEach((c) => allClassNames.add(c));
      });
      const classList = Array.from(allClassNames).filter(Boolean);
      if (classList.length === 0) {
        alert('숙제 과제 완료도에 반이 없습니다.');
        setMigrationLoading(false);
        return;
      }
      const collRef = collection(db, ENGLISH_PROGRESS_COLLECTION);
      const existingSnap = await getDocs(collRef);
      for (const d of existingSnap.docs) {
        await deleteDoc(doc(db, ENGLISH_PROGRESS_COLLECTION, d.id));
      }
      for (const className of classList) {
        const studentList = students.filter((name) => parseClassNames(studentInfo[name]?.className || '').includes(className));
        const ph = {};
        studentList.forEach((name) => {
          const p = phoneNumbers[name];
          if (p && (p.student || p.parent)) ph[name] = { student: p.student || '', parent: p.parent || '' };
        });
        const safeDocId = sanitizeDocId(className);
        if (!safeDocId) continue;
        await setDoc(doc(db, ENGLISH_PROGRESS_COLLECTION, safeDocId), {
          students: studentList,
          phoneNumbers: ph,
          progressData: {},
          scores: {},
          lastUpdated: new Date().toISOString(),
          migratedFromCompletion: true, // 이전으로 만든 반만 "이동된 반" 목록에 표시
        }, { merge: true });
      }
      await loadMigratedDocIds();
      alert(`✅ 이전 완료. 영어 과제 데이터를 비우고, 숙제 완료도 반 ${classList.length}개를 가져왔습니다. 아래 "이동된 반"에서 반을 선택해 명단을 보세요.`);
    } catch (e) {
      console.error(e);
      alert('이전 중 오류가 발생했습니다: ' + (e?.message || e));
    } finally {
      setMigrationLoading(false);
    }
  }, [subject, loadMigratedDocIds]);

  const handleDeleteMigratedClass = useCallback(async (docId) => {
    if (subject !== 'english' || !isFirebaseConfigured() || !db) return;
    if (!window.confirm(`"${docId}" 반을 삭제할까요? (Firestore에서 제거됩니다)`)) return;
    try {
      await deleteDoc(doc(db, ENGLISH_PROGRESS_COLLECTION, docId));
      await loadMigratedDocIds();
    } catch (e) {
      console.error(e);
      alert('삭제 중 오류: ' + (e?.message || e));
    }
  }, [subject, loadMigratedDocIds]);

  const getEnglishDocId = useCallback(() => {
    if (selectedSchool === '중학교 1학년' && selectedTeacher) {
      return `homework_progress_${selectedSchool}_${selectedTeacher}`;
    }
    if (selectedGrade && selectedClass) {
      return `homework_progress_${selectedSchool}_${selectedGrade}_${selectedClass}`;
    }
    return `homework_progress_${selectedSchool}`;
  }, [selectedSchool, selectedGrade, selectedClass, selectedTeacher]);

  const handlePhoneExcelUpload = useCallback(async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || subject !== 'english') return;
    if (selectedSchool === '중학교 1학년' && selectedTeacher !== '김서연') {
      alert('반을 선택할 수 있는 선생님을 선택한 후 업로드해주세요.');
      e.target.value = '';
      return;
    }
    if (selectedSchool !== '중학교 1학년' && (!selectedGrade || !selectedClass)) {
      alert('학년과 반을 선택한 후 업로드해주세요.');
      e.target.value = '';
      return;
    }
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
        const colCount = row.filter(c => c !== '').length;
        if (colCount < 2) continue;
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
      /** 셀 값에서 010으로 시작하는 11자리 번호만 추출 (한 칸에 여러 번호 가능) */
      const extract010Phones = (val) => {
        if (val == null || val === '') return [];
        let s = typeof val === 'number' ? String(Math.floor(val)) : String(val);
        if (typeof val === 'number' && s.length === 10 && s.startsWith('10')) s = '0' + s;
        s = s.replace(/\D/g, '');
        const matches = s.match(/010\d{8}/g) || [];
        return [...new Set(matches)];
      };
      let newStudents = [];
      let newPhones = {};
      let groupedByDocId = {};
      sheetLoop: for (let sheetIndex = 0; sheetIndex < wb.SheetNames.length; sheetIndex++) {
        const ws = wb.Sheets[wb.SheetNames[sheetIndex]];
        for (const rawMode of [true, false]) {
          const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: rawMode });
          if (jsonData.length < 2) {
            if (sheetIndex === 0 && rawMode) {
              alert('엑셀에 헤더와 데이터 행이 필요합니다.');
              setPhoneUploading(false);
              e.target.value = '';
              return;
            }
            continue;
          }
          const headerRowIndex = findHeaderRow(jsonData);
          const headers = (jsonData[headerRowIndex] || []).map(h => String(h || '').trim());
          const nameIdx = findCol(headers, ['학생명', '이름', '성명', '학생', 'name']);
          if (nameIdx === -1) {
            if (sheetIndex === 0 && rawMode) {
              alert('엑셀에서 이름 컬럼을 찾을 수 없습니다. 컬럼명이 "학생명", "이름", "성명", "학생" 중 하나인지 확인해주세요.');
              setPhoneUploading(false);
              e.target.value = '';
              return;
            }
            continue;
          }
          const dataStartRow = headerRowIndex + 1;
          const numCols = Math.max(headers.length, ...jsonData.slice(dataStartRow).map(r => (r || []).length), 1);
          const schoolIdx = findCol(headers, ['학교', 'school']);
          const gradeIdx = findCol(headers, ['학년', 'grade']);
          const classIdx = findCol(headers, ['반', '요일', 'class']);
          const teacherIdx = findCol(headers, ['선생님', 'teacher']);
          const getDocIdForRow = (schoolVal, gradeVal, classVal, teacherVal) => {
            const s = String(schoolVal ?? '').trim() || selectedSchool;
            const g = String(gradeVal ?? '').trim() || selectedGrade;
            const c = String(classVal ?? '').trim() || selectedClass;
            const t = String(teacherVal ?? '').trim() || selectedTeacher;
            if (s === '중학교 1학년' && t) return `homework_progress_중학교 1학년_${t}`;
            if (g && c) return `homework_progress_${s}_${g}_${c}`;
            if (s) return `homework_progress_${s}`;
            return getEnglishDocId();
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
          const buildGroupedByExcel = (sIdx, pIdx) => {
            const grouped = {};
            for (let i = dataStartRow; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const name = String(row[nameIdx] ?? '').trim();
              if (!name) continue;
              const studentCol = sIdx >= 0 ? extract010Phones(row[sIdx]) : [];
              const parentCol = pIdx >= 0 ? extract010Phones(row[pIdx]) : [];
              const student = studentCol[0] ?? parentCol[0] ?? null;
              const parent = parentCol[0] ?? studentCol[1] ?? null;
              if (!student && !parent) continue;
              const docId = getDocIdForRow(
                schoolIdx >= 0 ? row[schoolIdx] : null,
                gradeIdx >= 0 ? row[gradeIdx] : null,
                classIdx >= 0 ? row[classIdx] : null,
                teacherIdx >= 0 ? row[teacherIdx] : null
              );
              if (!grouped[docId]) grouped[docId] = { students: [], phoneNumbers: {} };
              if (!grouped[docId].students.includes(name)) grouped[docId].students.push(name);
              grouped[docId].phoneNumbers[name] = { student: student || null, parent: parent || null };
            }
            return grouped;
          };
          let grouped = buildGroupedByExcel(studentPhoneIdx, parentPhoneIdx);
          if (Object.keys(grouped).length === 0 || Object.values(grouped).every(g => Object.keys(g.phoneNumbers).length === 0)) {
            grouped = buildGroupedByExcel(6, 8);
          }
          const totalPhones = Object.values(grouped).reduce((sum, g) => sum + Object.keys(g.phoneNumbers).length, 0);
          if (totalPhones === 0) {
            if (sheetIndex === 0 && rawMode) {
              alert('엑셀에서 전화번호를 찾을 수 없습니다.\n\n010으로 시작하는 11자리 번호가 있는 열(핸드폰/전화번호 등)인지 확인해주세요.');
              setPhoneUploading(false);
              e.target.value = '';
              return;
            }
            continue;
          }
          groupedByDocId = grouped;
          newStudents = [];
          newPhones = {};
          Object.values(grouped).forEach(g => {
            newStudents = [...new Set([...newStudents, ...g.students])];
            Object.assign(newPhones, g.phoneNumbers);
          });
          break sheetLoop;
        }
      }
      if (Object.keys(groupedByDocId).length === 0) {
        alert('엑셀에서 전화번호를 찾을 수 없습니다.\n\n010으로 시작하는 11자리 번호가 있는 열(핸드폰/전화번호 등)인지 확인해주세요. 한 칸에 여러 번호가 있어도 인식합니다.\n\n전화번호가 G 열(7번째), I 열(9번째)에 있는 경우도 있습니다.');
        setPhoneUploading(false);
        e.target.value = '';
        return;
      }
      if (!isFirebaseConfigured() || !db) {
        alert('Firebase가 설정되지 않아 저장할 수 없습니다.');
        setPhoneUploading(false);
        e.target.value = '';
        return;
      }
      const summary = [];
      for (const [docId, { students: addStudents, phoneNumbers: addPhones }] of Object.entries(groupedByDocId)) {
        const docRef = doc(db, 'englishHomeworkProgress', docId);
        const snap = await getDoc(docRef);
        const existing = snap.exists() ? snap.data() : {};
        const existingStudents = existing.students || [];
        const existingPhones = existing.phoneNumbers || {};
        const mergedStudents = [...new Set([...existingStudents, ...addStudents])];
        const mergedPhones = { ...existingPhones };
        Object.keys(addPhones).forEach(n => { mergedPhones[n] = addPhones[n]; });
        await setDoc(docRef, {
          ...existing,
          students: mergedStudents,
          phoneNumbers: mergedPhones,
          lastUpdated: new Date().toISOString(),
        }, { merge: true });
        const label = docId.replace(/^homework_progress_/, '').replace(/_/g, ' ');
        summary.push(`${label}: ${Object.keys(addPhones).length}명`);
      }
      alert(`✅ 업로드 완료 (학교·학년·반별로 분류 저장)\n\n${summary.join('\n')}`);
    } catch (err) {
      console.error(err);
      alert('엑셀 처리 중 오류가 났습니다.');
    } finally {
      setPhoneUploading(false);
      e.target.value = '';
    }
  }, [subject, selectedSchool, selectedGrade, selectedClass, selectedTeacher, getEnglishDocId]);

  const handleShowRoster = () => {
    let info;
    
    if (subject === 'math') {
      // 수학 과제 관리
      info = {
        grade: selectedMathGrade,
        teacher: selectedMathTeacher,
        class: selectedMathClass,
      };
    } else {
      // 영어 과제 관리
      info = selectedSchool === '중학교 1학년' 
        ? {
            school: selectedSchool,
            teacher: selectedTeacher,
            class: selectedTeacher === '김서연' ? selectedClass : null,
          }
        : {
            school: selectedSchool,
            grade: selectedGrade,
            class: selectedClass,
          };
    }
    
    if (onShowRoster) {
      onShowRoster(info, subject);
    }
  };

  return (
    <div className="homework-dashboard-page">
      <div className="homework-dashboard-container">
        <div className="homework-dashboard-content">
          <div className="homework-dashboard-grid">
            {subject === 'math' ? (
              // 수학 과제 관리 UI
              <>
                {/* 왼쪽: 학년 선택 */}
                <div className="school-selection">
                  <h3>학년 선택</h3>
                  <div className="radio-group">
                    {mathGrades.map((grade) => (
                      <label key={grade} className="radio-label">
                        <input
                          type="radio"
                          name="mathGrade"
                          value={grade}
                          checked={selectedMathGrade === grade}
                          onChange={(e) => setSelectedMathGrade(e.target.value)}
                        />
                        <span>{grade}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 오른쪽: 선생님 및 반 선택 */}
                <div className="selection-info">
                  <div className="selected-school">
                    <h4>선택된 학년</h4>
                    <p className="school-name">{selectedMathGrade}</p>
                  </div>

                  <div className="teacher-selection">
                    <h4>선생님 선택</h4>
                    <div className="radio-group">
                      {mathTeachers.map((teacher) => (
                        <label key={teacher} className="radio-label">
                          <input
                            type="radio"
                            name="mathTeacher"
                            value={teacher}
                            checked={selectedMathTeacher === teacher}
                            onChange={(e) => setSelectedMathTeacher(e.target.value)}
                          />
                          <span>{teacher}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="class-selection">
                    <h4>반 선택</h4>
                    <div className="radio-group">
                      {mathClasses.map((classOption) => (
                        <label key={classOption} className="radio-label">
                          <input
                            type="radio"
                            name="mathClass"
                            value={classOption}
                            checked={selectedMathClass === classOption}
                            onChange={(e) => setSelectedMathClass(e.target.value)}
                          />
                          <span>{classOption}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button className="proceed-btn" onClick={handleShowRoster}>
                    명단 보기
                  </button>
                </div>
              </>
            ) : (
              // 영어 과제 관리 UI: 이전 블록만 전체 가로 사용
              <>
                {/* 데이터 이전: 숙제 완료도 반 → 영어 과제 */}
                {subject === 'english' && (
                  <div style={{ gridColumn: '1 / -1', marginBottom: '20px', padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '2px solid #f59e0b' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#92400e' }}>📥 데이터 이전 (숙제 과제 완료도 → 영어 과제 관리)</h4>
                    <p style={{ fontSize: '0.9rem', color: '#78350f', margin: '0 0 10px 0' }}>
                      영어 과제 관리의 현재 데이터를 모두 지운 뒤, 숙제 과제 완료도에 있는 반·학생·전화번호를 전부 가져옵니다.
                    </p>
                    <button
                      type="button"
                      disabled={migrationLoading}
                      onClick={runMigrationFromCompletion}
                      style={{
                        padding: '10px 20px',
                        fontSize: '0.95rem',
                        fontWeight: '600',
                        backgroundColor: migrationLoading ? '#9ca3af' : '#f59e0b',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: migrationLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {migrationLoading ? '이전 중…' : '영어 과제 데이터 지우고 숙제 완료도 반 전부 가져오기'}
                    </button>
                    {migratedBySchoolGrade.length > 0 && (
                      <div style={{ marginTop: '14px', width: '100%' }}>
                        <div style={{ fontWeight: '600', marginBottom: '8px', color: '#78350f' }}>이동된 반 (클릭 시 명단 보기)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                          {migratedBySchoolGrade.map(({ group, ids }) => (
                            <div key={group} style={{ width: '100%' }}>
                              <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#92400e', marginBottom: '4px' }}>{group}</div>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                  gap: '6px 8px',
                                  width: '100%',
                                }}
                              >
                                {ids.map((id) => (
                                  <span
                                    key={id}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      minWidth: 0,
                                      backgroundColor: '#fef9c3',
                                      border: '1px solid #f59e0b',
                                      borderRadius: '6px',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => onShowRoster && onShowRoster({ docId: id, class: id }, 'english')}
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        padding: '6px 8px 6px 10px',
                                        fontSize: '0.8rem',
                                        backgroundColor: 'transparent',
                                        color: '#78350f',
                                        border: 'none',
                                        cursor: 'pointer',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        textAlign: 'left',
                                      }}
                                    >
                                      {id}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteMigratedClass(id); }}
                                      title="반 삭제"
                                      style={{
                                        flexShrink: 0,
                                        padding: '4px 6px',
                                        fontSize: '0.75rem',
                                        lineHeight: 1,
                                        backgroundColor: 'transparent',
                                        color: '#b45309',
                                        border: 'none',
                                        borderLeft: '1px solid #f59e0b',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* 영어: 이동된 반만 사용하므로 학교/학년/반 선택 숨김 */}
                {subject !== 'english' && (
                <>
                {/* 왼쪽: 학교 선택 */}
                <div className="school-selection">
                  <h3>학교 선택</h3>
                  <div className="radio-group">
                    {schools.map((school) => (
                      <label key={school} className="radio-label">
                        <input
                          type="radio"
                          name="school"
                          value={school}
                          checked={selectedSchool === school}
                          onChange={(e) => setSelectedSchool(e.target.value)}
                        />
                        <span>{school}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 오른쪽: 선택된 정보 및 학년/반 선택 */}
                <div className="selection-info">
                  <div className="selected-school">
                    <h4>선택된 학교</h4>
                    <p className="school-name">{selectedSchool}</p>
                  </div>

              {selectedSchool === '중학교 1학년' ? (
                <>
                  {/* 중학교 1학년: 선생님 선택 */}
                  <div className="teacher-selection">
                    <h4>선생님 선택</h4>
                    <div className="radio-group">
                      {teachers.map((teacher) => (
                        <label key={teacher} className="radio-label">
                          <input
                            type="radio"
                            name="teacher"
                            value={teacher}
                            checked={selectedTeacher === teacher}
                            onChange={(e) => setSelectedTeacher(e.target.value)}
                          />
                          <span>{teacher}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* 김서연 선생님 선택 시 반 선택 표시 */}
                  {selectedTeacher === '김서연' && (
                    <div className="class-selection">
                      <h4>반 선택</h4>
                      <div className="radio-group">
                        {classOptions.length > 0 ? (
                          classOptions.map((classOption) => (
                            <label key={classOption} className="radio-label">
                              <input
                                type="radio"
                                name="class"
                                value={classOption}
                                checked={selectedClass === classOption}
                                onChange={(e) => setSelectedClass(e.target.value)}
                              />
                              <span>{classOption}</span>
                            </label>
                          ))
                        ) : (
                          <p className="no-class">반 목록이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grade-selection">
                    <h4>학년 선택</h4>
                    <div className="radio-group">
                      {['1학년', '2학년', '3학년'].map((grade) => (
                        <label key={grade} className="radio-label">
                          <input
                            type="radio"
                            name="grade"
                            value={grade}
                            checked={selectedGrade === grade}
                            onChange={(e) => setSelectedGrade(e.target.value)}
                          />
                          <span>{grade}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="class-selection">
                    <h4>반 선택</h4>
                    <div className="radio-group">
                      {classOptions.length > 0 ? (
                        classOptions.map((classOption) => (
                          <label key={classOption} className="radio-label">
                            <input
                              type="radio"
                              name="class"
                              value={classOption}
                              checked={selectedClass === classOption}
                              onChange={(e) => setSelectedClass(e.target.value)}
                            />
                            <span>{classOption}</span>
                          </label>
                        ))
                      ) : (
                        <p className="no-class">반 목록이 없습니다.</p>
                      )}
                    </div>
                  </div>
                </>
              )}

                  {/* 영어 과제 관리: 전화번호 엑셀 업로드 (선택한 반에만 적용) */}
                  {subject === 'english' && (selectedSchool === '중학교 1학년' ? selectedTeacher === '김서연' : selectedClass) && (
                    <div className="phone-upload-section" style={{ marginTop: '16px', marginBottom: '16px', padding: '14px', backgroundColor: '#e0f2fe', borderRadius: '8px', border: '2px solid #0ea5e9' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#0c4a6e' }}>📤 전화번호 엑셀 업로드</h4>
                      <p style={{ fontSize: '0.9rem', color: '#0369a1', margin: '0 0 10px 0' }}>
                        선택한 반에 전화번호를 일괄 반영합니다. (이 메뉴에서만 사용)
                      </p>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: phoneUploading ? 'not-allowed' : 'pointer', opacity: phoneUploading ? 0.7 : 1 }}>
                        <input type="file" accept=".xlsx,.xls" onChange={handlePhoneExcelUpload} disabled={phoneUploading} style={{ fontSize: '0.9rem' }} />
                        <span style={{ padding: '8px 16px', background: '#0ea5e9', color: '#fff', borderRadius: '6px', fontWeight: '600' }}>{phoneUploading ? '처리 중...' : '엑셀 선택'}</span>
                      </label>
                    </div>
                  )}

                  <button className="proceed-btn" onClick={handleShowRoster}>
                    명단 보기
                  </button>
                </div>
              </>
            )}
                </>
                )}
          </div>
        </div>
      </div>
    </div>
  );
}
