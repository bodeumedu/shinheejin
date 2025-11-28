import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import './HomeworkProgress.css';

// 과제 진행 상황 컴포넌트
export default function HomeworkProgress({ school, grade, class: selectedClass, teacher, onClose }) {
  const [activeTab, setActiveTab] = useState('progress'); // 'progress', 'all'
  const [loading, setLoading] = useState(true);
  
  // Firestore 문서 ID 생성 (useMemo로 최적화)
  const docId = useMemo(() => {
    if (school === '중학교 1학년' && teacher) {
      return `homework_progress_${school}_${teacher}`;
    }
    if (grade && selectedClass) {
      return `homework_progress_${school}_${grade}_${selectedClass}`;
    }
    return `homework_progress_${school}`;
  }, [school, grade, selectedClass, teacher]);
  
  const docRef = useMemo(() => {
    if (isFirebaseConfigured() && db) {
      return doc(db, 'homeworkProgress', docId);
    }
    return null;
  }, [docId]);
  
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

  const getDefaultData = () => {
    // 기본 학생 목록 제거 - 0명에서 시작
    const defaultStudents = [];
    const defaultProgressData = {};
    const defaultScores = {};
    
    return {
      students: defaultStudents,
      progressData: defaultProgressData,
      scores: defaultScores,
    };
  };
  
  // 학생 목록 (동적 관리)
  const [students, setStudents] = useState([]);
  
  // 과제 진행 상태 관리
  const [progressData, setProgressData] = useState({});
  
  // 점수 데이터 관리
  const [scores, setScores] = useState({});
  
  // 진도와 과제 데이터 관리 (날짜별)
  const [progressDetailData, setProgressDetailData] = useState({});
  
  // 헤더 텍스트 관리 (2행 헤더 편집용)
  const [headerTexts, setHeaderTexts] = useState(() => {
    // 기본값 설정
    const defaultHeaders = {
      mainTitle: chapterConfig.title,
      bodeumTitle: '보듬내신모의고사',
      visionTitle: '보듬교육의 시선',
      chapters: {},
      bodeum: { 1: '1회', 2: '2회', 3: '3회', 4: '4회', 5: '5회', 6: '6회', 7: '7회', 8: '8회', 9: '9회', 10: '10회' },
      vision: { 1: '1회', 2: '2회', 3: '3회', 4: '4회' },
    };
    chapterConfig.chapters.forEach(chapter => {
      defaultHeaders.chapters[chapter] = chapterConfig.fieldPrefix.startsWith('mock') ? `${chapter}월` : `${chapter}강`;
    });
    return defaultHeaders;
  });
  
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
        students,
        progressData,
        scores,
        progressDetailData,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });
      
      // 저장 완료 후 입력 중 표시 초기화
      dirtyDetailDatesRef.current.clear();
      
      setSaveDetailMessage('✅ 저장 완료!');
      setTimeout(() => setSaveDetailMessage(''), 2000);
    } catch (error) {
      console.error('진도와 과제 데이터 저장 실패:', error);
      setSaveDetailMessage('❌ 저장 실패: ' + (error.message || '알 수 없는 오류'));
      setTimeout(() => setSaveDetailMessage(''), 3000);
    } finally {
      setSavingDetail(false);
    }
  }, [students, progressData, scores, progressDetailData, docRef]);
  
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
      
      // docId 변경 시 headerTexts를 기본값으로 초기화 (Firestore에서 불러올 때까지)
      const defaultHeaders = {
        mainTitle: chapterConfig.title,
        bodeumTitle: '보듬내신모의고사',
        visionTitle: '보듬교육의 시선',
        chapters: {},
        bodeum: { 1: '1회', 2: '2회', 3: '3회', 4: '4회', 5: '5회', 6: '6회', 7: '7회', 8: '8회', 9: '9회', 10: '10회' },
        vision: { 1: '1회', 2: '2회', 3: '3회', 4: '4회' },
      };
      chapterConfig.chapters.forEach(chapter => {
        defaultHeaders.chapters[chapter] = chapterConfig.fieldPrefix.startsWith('mock') ? `${chapter}월` : `${chapter}강`;
      });
      setHeaderTexts(defaultHeaders);
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
      setProgressDetailData({});
      dirtyDetailDatesRef.current.clear();
      setFirebaseError('Firestore 연결 타임아웃 - 보안 규칙을 확인하세요');
      setLoading(false);
    }, 20000);
    
    // 실시간 리스너 설정
    console.log('🔄 Firestore 연결 시도 중...', { docId });
    const unsubscribe = onSnapshot(
      docRef,
      (docSnapshot) => {
        clearTimeout(timeoutId);
        console.log('✅ Firestore 연결 성공!', { 
          exists: docSnapshot.exists(),
          docId 
        });
        
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const now = Date.now();
          const isInitialLoad = isInitialLoadRef.current;
          const localStudents = studentsRef.current; // 현재 로컬 students 상태
          
          // 기본 학생 4명 제거 (기존 데이터에 포함되어 있을 수 있음)
          const defaultStudentNames = ['김은수', '민성원', '신정원', '유영채'];
          const existingStudents = data.students || [];
          const filteredStudents = existingStudents.filter(name => !defaultStudentNames.includes(name));
          
          const firestoreCount = filteredStudents.length;
          const localCount = localStudents.length;
          
          console.log('📥 Firestore에서 데이터 불러옴:', { 
            firestoreCount,
            localCount,
            isInitialLoad,
            timeSinceLastSave: now - lastSaveTimeRef.current
          });
          
          // 로컬에 더 많은 학생이 있으면 (방금 추가한 학생이 있으면) 로컬 상태 유지
          if (!isInitialLoad && localCount > firestoreCount) {
            console.log('⏸️ 로컬 변경사항 보존 (로컬 학생 수가 더 많음)', { localCount, firestoreCount });
            // 로컬 상태 유지 - 아무것도 하지 않음
            return;
          }
          
          // 초기 로드이거나, 최근 저장 후 2초 이내가 아닐 때만 Firestore 데이터로 업데이트
          if (isInitialLoad || (now - lastSaveTimeRef.current > 2000)) {
            console.log('✅ Firestore 데이터로 상태 업데이트', { isInitialLoad, timeSinceLastSave: now - lastSaveTimeRef.current });
            
            // 필터링된 학생 목록에 맞춰 progressData와 scores도 정리
            const filteredProgressData = {};
            const filteredScores = {};
            filteredStudents.forEach(student => {
              if (data.progressData && data.progressData[student]) {
                filteredProgressData[student] = data.progressData[student];
              }
              if (data.scores && data.scores[student]) {
                filteredScores[student] = data.scores[student];
              }
            });
            
            setStudents(filteredStudents);
            setProgressData(filteredProgressData);
            setScores(filteredScores);
            
            // 헤더 텍스트 불러오기
            if (data.headerTexts) {
              const loadedHeaders = { ...data.headerTexts };
              // chapters가 비어있거나 일부만 있으면 기본값으로 채우기
              if (!loadedHeaders.chapters || Object.keys(loadedHeaders.chapters).length === 0) {
                loadedHeaders.chapters = {};
              }
              chapterConfig.chapters.forEach(chapter => {
                if (!loadedHeaders.chapters[chapter]) {
                  loadedHeaders.chapters[chapter] = chapterConfig.fieldPrefix.startsWith('mock') ? `${chapter}월` : `${chapter}강`;
                }
              });
              // mainTitle이 없으면 기본값 설정
              if (!loadedHeaders.mainTitle) {
                loadedHeaders.mainTitle = chapterConfig.title;
              }
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
          console.log('📝 문서가 없음. 기본 데이터로 초기화 중...');
          // 문서가 없으면 기본 데이터로 초기화
          const defaultData = getDefaultData();
          setStudents(defaultData.students);
          setProgressData(defaultData.progressData);
          setScores(defaultData.scores);
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
          setFirebaseError('Firestore 보안 규칙 오류 - Firebase Console에서 규칙을 확인하세요');
          console.error('🔒 Firestore 보안 규칙을 확인하세요:');
          console.error('Firebase Console → Firestore Database → 규칙');
          console.error('다음 규칙이 필요합니다:');
          console.error('match /homeworkProgress/{document} {');
          console.error('  allow read, write: if true;');
          console.error('}');
        } else {
          setFirebaseError(`Firebase 연결 오류: ${error.message || error.code || '알 수 없는 오류'}`);
        }
        
        // 기본 데이터 사용
        const defaultData = getDefaultData();
        setStudents(defaultData.students);
        setProgressData(defaultData.progressData);
        setScores(defaultData.scores);
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
  }, [docRef, docId, chapterConfig]);
  
  // Firestore에 데이터 저장하기
  const saveData = useCallback(async (studentsData, progressData, scoresData, headerTextsData = null) => {
    // Firebase가 설정되지 않은 경우 오류 표시
    if (!isFirebaseConfigured() || !db || !docRef) {
      console.error('Firebase가 설정되지 않아 데이터를 저장할 수 없습니다.');
      setFirebaseError('Firebase 설정 필요 - 데이터가 저장되지 않습니다');
      return;
    }
    
    try {
      const dataToSave = {
        students: studentsData,
        progressData: progressData,
        scores: scoresData,
        lastUpdated: new Date().toISOString(),
      };
      
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
      setFirebaseError(`데이터 저장 실패: ${error.message || error.code || '알 수 없는 오류'}`);
    }
  }, [docRef]);
  
  // students 상태가 변경될 때마다 studentsRef 업데이트
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);
  
  // 데이터가 변경될 때마다 저장 (debounce 적용) - 진도와 과제 데이터는 제외 (저장 버튼으로만 저장)
  useEffect(() => {
    if (!loading && students.length > 0) {
      const timeoutId = setTimeout(() => {
        saveData(students, progressData, scores, headerTexts);
      }, 500); // 500ms 지연 후 저장 (debounce)
      
      return () => clearTimeout(timeoutId);
    }
  }, [students, progressData, scores, headerTexts, saveData, loading]);
  
  // 헤더 텍스트 변경 시 저장
  useEffect(() => {
    if (!loading) {
      const timeoutId = setTimeout(() => {
        saveData(students, progressData, scores, headerTexts);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [headerTexts, loading, students, progressData, scores, saveData]);
  
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
        newChapters[chapter] = prev.chapters?.[chapter] || 
          (chapterConfig.fieldPrefix.startsWith('mock') ? `${chapter}월` : `${chapter}강`);
      });
      updated.chapters = newChapters;
      // mainTitle도 업데이트 (기존 값이 없으면 기본값 사용)
      if (!prev.mainTitle) {
        updated.mainTitle = chapterConfig.title;
      }
      return updated;
    });
  }, [chapterConfig]);
  
  // 새 학생 이름 입력 상태
  const [newStudentName, setNewStudentName] = useState('');
  
  const handleCheckboxChange = (student, assignment) => {
    setProgressData(prev => ({
      ...prev,
      [student]: {
        ...(prev[student] || {}),
        [assignment]: !(prev[student]?.[assignment] || false),
      },
    }));
  };
  
  const handleScoreChange = (student, assignment, value) => {
    setScores(prev => ({
      ...prev,
      [student]: {
        ...(prev[student] || {}),
        [assignment]: value,
      },
    }));
  };
  
  // 로딩 중 표시
  if (loading) {
    return (
      <div className="homework-progress-page">
        <div className="homework-progress-container">
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>데이터를 불러오는 중...</p>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              Firebase에서 실시간 데이터를 동기화하고 있습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
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
      const newStudents = students.filter(s => s !== student);
      setStudents(newStudents);
      
      // 해당 학생의 데이터 제거
      const newProgressData = { ...progressData };
      delete newProgressData[student];
      setProgressData(newProgressData);
      
      const newScores = { ...scores };
      delete newScores[student];
      setScores(newScores);
    }
  };
  
  // 헤더 텍스트 변경 핸들러
  const handleHeaderTextChange = (type, key, value) => {
    setHeaderTexts(prev => {
      // mainTitle, bodeumTitle, visionTitle 같은 단일 값 처리
      if (type === 'mainTitle' || type === 'bodeumTitle' || type === 'visionTitle') {
        return {
          ...prev,
          [type]: value,
        };
      }
      // chapters, bodeum, vision 같은 객체 값 처리
      return {
        ...prev,
        [type]: {
          ...prev[type],
          [key]: value,
        },
      };
    });
  };
  
  // 카카오톡 전송 (솔라피 API 사용) - 학생별 개별 발송
  const handleKakaoSend = async () => {
    if (students.length === 0) {
      alert('학생이 없습니다.');
      return;
    }

    // 학생 목록 미리보기
    const studentList = students.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
    const confirmMessage = `다음 ${students.length}명의 학생에게 개별 발송합니다:\n\n${studentList}\n\n계속하시겠습니까?`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 템플릿 코드 입력 받기
    const templateCode = prompt('카카오톡 템플릿 코드를 입력하세요:');
    if (!templateCode) {
      return;
    }

    // 각 학생별로 전화번호 입력받고 발송
    let successCount = 0;
    let failCount = 0;

    for (const student of students) {
      const phoneNumber = prompt(`${student} 학생의 전화번호를 입력하세요 (예: 01012345678, 취소하려면 취소 버튼):`);
      if (!phoneNumber) {
        continue; // 취소하면 다음 학생으로
      }
      
      // 전화번호 형식 검증
      const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
      if (!phoneRegex.test(phoneNumber.replace(/-/g, ''))) {
        alert(`${student} 학생: 올바른 전화번호 형식이 아닙니다. (예: 01012345678)`);
        failCount++;
        continue;
      }

      try {
        // 해당 학생의 메시지 생성
        const title = getTitle(); // 원래 제목 사용
        let content = '';
        
        // 해당 학생의 진행 상황만 표시
        content += `👤 ${student}\n\n`;
        
        // 강별(모의고사) 체크
        chapterConfig.chapters.forEach(chapter => {
          const field = `${chapterConfig.fieldPrefix}${chapter}`;
          const isCompleted = progressData[student]?.[field] || false;
          const chapterText = headerTexts.chapters?.[chapter] || 
            (chapterConfig.fieldPrefix.startsWith('mock') ? `${chapter}월` : `${chapter}강`);
          const mainTitle = headerTexts.mainTitle || chapterConfig.title;
          
          // 반 전체 학생이 모두 미완료인지 확인
          const allStudentsIncomplete = students.every(s => !progressData[s]?.[field]);
          
          if (allStudentsIncomplete) {
            content += `✅ ${mainTitle} ${chapterText}: 제출기간 아님.\n`;
          } else if (isCompleted) {
            content += `✅ ${mainTitle} ${chapterText}: 완료\n`;
          } else {
            content += `✅ ${mainTitle} ${chapterText}: 미완료\n`;
          }
        });
        
        // 보듬내신모의고사
        for (let i = 1; i <= 10; i++) {
          const isCompleted = progressData[student]?.[`bodeum${i}`] || false;
          const score = scores[student]?.[`bodeum${i}`];
          const roundText = headerTexts.bodeum?.[i] || `${i}회`;
          const bodeumTitle = headerTexts.bodeumTitle || '보듬내신모의고사';
          
          // 반 전체 학생이 모두 미완료인지 확인
          const allStudentsIncomplete = students.every(s => !progressData[s]?.[`bodeum${i}`] && !scores[s]?.[`bodeum${i}`]);
          
          if (score) {
            content += `📊 ${bodeumTitle} ${roundText}: ${score}점\n`;
          } else if (allStudentsIncomplete) {
            content += `✅ ${bodeumTitle} ${roundText}: 제출기간 아님.\n`;
          } else if (isCompleted) {
            content += `✅ ${bodeumTitle} ${roundText}: 완료\n`;
          } else {
            content += `✅ ${bodeumTitle} ${roundText}: 미완료\n`;
          }
        }
        
        // 보듬교육의 시선
        for (let i = 1; i <= 4; i++) {
          const isCompleted = progressData[student]?.[`vision${i}`] || false;
          const roundText = headerTexts.vision?.[i] || `${i}회`;
          const visionTitle = headerTexts.visionTitle || '보듬교육의 시선';
          
          // 반 전체 학생이 모두 미완료인지 확인
          const allStudentsIncomplete = students.every(s => !progressData[s]?.[`vision${i}`]);
          
          if (allStudentsIncomplete) {
            content += `✅ ${visionTitle} ${roundText}: 제출기간 아님.\n`;
          } else if (isCompleted) {
            content += `✅ ${visionTitle} ${roundText}: 완료\n`;
          } else {
            content += `✅ ${visionTitle} ${roundText}: 미완료\n`;
          }
        }
        
        // 어휘워크북
        const isVocabularyCompleted = progressData[student]?.vocabulary || false;
        const allStudentsIncompleteVocabulary = students.every(s => !progressData[s]?.vocabulary);
        
        if (allStudentsIncompleteVocabulary) {
          content += `✅ 어휘워크북: 제출기간 아님.\n`;
        } else if (isVocabularyCompleted) {
          content += `✅ 어휘워크북: 완료\n`;
        } else {
          content += `✅ 어휘워크북: 미완료\n`;
        }
        
        // 솔라피 API 호출
        const apiUrl = import.meta.env.PROD 
          ? `${window.location.origin}/api/send-kakao`
          : '/api/send-kakao';
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phoneNumber: phoneNumber.replace(/-/g, ''),
            templateCode: templateCode,
            variables: {
              title: title,
              content: content,
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
        console.error(`${student} 학생 카카오톡 전송 실패:`, error);
        failCount++;
        alert(`${student} 학생 발송 실패: ${error.message || '알 수 없는 오류'}`);
      }
    }
    
    // 결과 알림
    if (successCount > 0) {
      alert(`✅ ${successCount}명에게 카카오톡 메시지가 성공적으로 발송되었습니다!${failCount > 0 ? `\n❌ ${failCount}명 발송 실패` : ''}`);
    } else if (failCount > 0) {
      alert(`❌ 모든 학생 발송 실패 (${failCount}명)`);
    }
  };
  
  // 제목 생성
  const getTitle = () => {
    if (school === '중학교 1학년') {
      if (teacher) {
        return `${school} ${teacher} 선생님 과제 진행상황`;
      }
      return `${school} 과제 진행상황`;
    }
    if (grade && selectedClass) {
      return `${school} ${grade} ${selectedClass} 과제 진행상황`;
    }
    return `${school} 과제 진행상황`;
  };
  
  return (
    <div className="homework-progress-page">
      <div className="homework-progress-container">
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
                  <button className="kakao-btn" onClick={handleKakaoSend}>
                    <span className="kakao-icon">💬</span>
                    카카오톡 전송
                  </button>
                </div>
              </div>
              
              <div className="progress-table-wrapper">
                <table className="progress-table">
                  <thead>
                    <tr>
                      <th rowSpan="2">학생</th>
                      <th colSpan={chapterConfig.chapters.length}>
                        <input
                          type="text"
                          className="header-input main-header-input"
                          value={headerTexts.mainTitle || chapterConfig.title}
                          onChange={(e) => handleHeaderTextChange('mainTitle', 'title', e.target.value)}
                          placeholder={chapterConfig.title}
                        />
                      </th>
                      <th rowSpan="2">어휘워크북</th>
                      <th colSpan="10">
                        <input
                          type="text"
                          className="header-input main-header-input"
                          value={headerTexts.bodeumTitle || '보듬내신모의고사'}
                          onChange={(e) => handleHeaderTextChange('bodeumTitle', 'title', e.target.value)}
                          placeholder="보듬내신모의고사"
                        />
                      </th>
                      <th colSpan="4">
                        <input
                          type="text"
                          className="header-input main-header-input"
                          value={headerTexts.visionTitle || '보듬교육의 시선'}
                          onChange={(e) => handleHeaderTextChange('visionTitle', 'title', e.target.value)}
                          placeholder="보듬교육의 시선"
                        />
                      </th>
                      <th rowSpan="2">퇴원</th>
                    </tr>
                    <tr>
                      {chapterConfig.chapters.map((chapter) => {
                        const defaultValue = chapterConfig.fieldPrefix.startsWith('mock') ? `${chapter}월` : `${chapter}강`;
                        const currentValue = headerTexts.chapters?.[chapter];
                        return (
                          <th key={`${chapterConfig.fieldPrefix}-h-${chapter}`} className="header-input-cell">
                            <input
                              type="text"
                              className="header-input"
                              value={currentValue || defaultValue}
                              onChange={(e) => handleHeaderTextChange('chapters', chapter, e.target.value)}
                              placeholder={defaultValue}
                            />
                          </th>
                        );
                      })}
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                        const defaultValue = `${num}회`;
                        const currentValue = headerTexts.bodeum?.[num];
                        return (
                          <th key={`bodeum-h-${num}`} className="header-input-cell">
                            <input
                              type="text"
                              className="header-input"
                              value={currentValue || defaultValue}
                              onChange={(e) => handleHeaderTextChange('bodeum', num, e.target.value)}
                              placeholder={defaultValue}
                            />
                          </th>
                        );
                      })}
                      {[1, 2, 3, 4].map((num) => {
                        const defaultValue = `${num}회`;
                        const currentValue = headerTexts.vision?.[num];
                        return (
                          <th key={`vision-h-${num}`} className="header-input-cell">
                            <input
                              type="text"
                              className="header-input"
                              value={currentValue || defaultValue}
                              onChange={(e) => handleHeaderTextChange('vision', num, e.target.value)}
                              placeholder={defaultValue}
                            />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student}>
                        <td className="student-name">{student}</td>
                        {chapterConfig.chapters.map((chapter) => (
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
                        {/* 보듬내신모의고사 1-10회 */}
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <td key={num}>
                            <div className="assignment-cell">
                              <input
                                type="checkbox"
                                checked={progressData[student]?.[`bodeum${num}`] || false}
                                onChange={() => handleCheckboxChange(student, `bodeum${num}`)}
                              />
                              <input
                                type="text"
                                className="score-input"
                                placeholder="점수"
                                value={scores[student]?.[`bodeum${num}`] || ''}
                                onChange={(e) => handleScoreChange(student, `bodeum${num}`, e.target.value)}
                              />
                            </div>
                          </td>
                        ))}
                        {/* 보듬교육의 시선 1-4회 */}
                        {[1, 2, 3, 4].map((num) => (
                          <td key={`vision${num}`}>
                            <div className="assignment-cell">
                              <input
                                type="checkbox"
                                checked={progressData[student]?.[`vision${num}`] || false}
                                onChange={() => handleCheckboxChange(student, `vision${num}`)}
                              />
                              <input
                                type="text"
                                className="score-input"
                                placeholder="점수"
                                value={scores[student]?.[`vision${num}`] || ''}
                                onChange={(e) => handleScoreChange(student, `vision${num}`, e.target.value)}
                              />
                            </div>
                          </td>
                        ))}
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
                      <td colSpan="17">
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
                    {savingDetail ? '저장 중...' : '💾 저장하기'}
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
      </div>
    </div>
  );
}
