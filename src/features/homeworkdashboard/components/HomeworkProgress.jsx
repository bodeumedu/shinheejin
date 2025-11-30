import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import './HomeworkProgress.css';

// 과제 진행 상황 컴포넌트
export default function HomeworkProgress({ subject = 'english', school, grade, class: selectedClass, teacher, onClose }) {
  const [activeTab, setActiveTab] = useState('progress'); // 'progress', 'all'
  const [loading, setLoading] = useState(true);
  
  // Firestore 컬렉션명 결정
  const collectionName = useMemo(() => {
    return subject === 'math' ? 'mathHomeworkProgress' : 'englishHomeworkProgress';
  }, [subject]);
  
  // 기존 컬렉션명 (하위 호환성)
  const oldCollectionName = 'homeworkProgress';
  
  // Firestore 문서 ID 생성 (useMemo로 최적화)
  const docId = useMemo(() => {
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
  }, [subject, school, grade, selectedClass, teacher]);
  
  // 새 컬렉션 문서 참조
  const docRef = useMemo(() => {
    if (isFirebaseConfigured() && db) {
      return doc(db, collectionName, docId);
    }
    return null;
  }, [collectionName, docId]);
  
  // 기존 컬렉션 문서 참조 (하위 호환성)
  const oldDocRef = useMemo(() => {
    if (isFirebaseConfigured() && db && subject === 'english') {
      return doc(db, oldCollectionName, docId);
    }
    return null;
  }, [docId, subject]);
  
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
  
  // 템플릿 코드 저장 (localStorage에 저장하여 다음에도 사용)
  const [savedTemplateCode, setSavedTemplateCode] = useState(() => {
    try {
      return localStorage.getItem('kakaoTemplateCode') || '';
    } catch {
      return '';
    }
  });
  
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
      setPhoneNumbers(defaultData.phoneNumbers);
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
            
            // 필터링된 학생 목록에 맞춰 progressData, scores, phoneNumbers도 정리
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
                
                // 로컬에 없을 때만 Firestore 데이터 사용
                if (data.phoneNumbers && data.phoneNumbers[student]) {
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
          // 문서가 없고, 마이그레이션도 안 된 경우에만 기본 데이터로 초기화
          if (!isMigrated) {
            console.log('📝 문서가 없음. 기본 데이터로 초기화 중...');
            // 문서가 없으면 기본 데이터로 초기화
            const defaultData = getDefaultData();
            setStudents(defaultData.students);
            setProgressData(defaultData.progressData);
            setScores(defaultData.scores);
            setPhoneNumbers(defaultData.phoneNumbers);
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
  const saveData = useCallback(async (studentsData, progressData, scoresData, headerTextsData = null, phoneNumbersData = null) => {
    // Firebase가 설정되지 않은 경우 오류 표시
    if (!isFirebaseConfigured() || !db || !docRef) {
      console.error('Firebase가 설정되지 않아 데이터를 저장할 수 없습니다.');
      setFirebaseError('Firebase 설정 필요 - 데이터가 저장되지 않습니다');
      return;
    }
    
    try {
      // phoneNumbers에서 undefined 값 완전히 제거 및 정리
      const phoneNumbersToSave = phoneNumbersData !== null ? phoneNumbersData : phoneNumbers;
      const cleanedPhoneNumbers = {};
      
      if (phoneNumbersToSave && typeof phoneNumbersToSave === 'object') {
        Object.keys(phoneNumbersToSave).forEach(student => {
          const studentPhone = phoneNumbersToSave[student];
          
          // studentPhone이 undefined이거나 null이면 스킵
          if (studentPhone === undefined || studentPhone === null) return;
          
          // 객체 형태인 경우 (student, parent)
          if (typeof studentPhone === 'object' && !Array.isArray(studentPhone)) {
            const cleaned = {};
            
            // student 필드 처리
            if (studentPhone.student !== undefined && studentPhone.student !== null && studentPhone.student !== '') {
              const studentValue = String(studentPhone.student).trim();
              if (studentValue !== '') {
                cleaned.student = studentValue;
              }
            }
            
            // parent 필드 처리
            if (studentPhone.parent !== undefined && studentPhone.parent !== null && studentPhone.parent !== '') {
              const parentValue = String(studentPhone.parent).trim();
              if (parentValue !== '') {
                cleaned.parent = parentValue;
              }
            }
            
            // student와 parent 중 하나라도 유효한 값이 있으면 포함
            if (Object.keys(cleaned).length > 0) {
              cleanedPhoneNumbers[student] = cleaned;
            }
          } 
          // 문자열 형태인 경우 (하위 호환성)
          else if (typeof studentPhone === 'string' && studentPhone.trim() !== '') {
            cleanedPhoneNumbers[student] = studentPhone.trim();
          }
        });
      }
      
      // 최종적으로 JSON 직렬화/역직렬화로 undefined 완전히 제거
      const finalPhoneNumbers = JSON.parse(JSON.stringify(cleanedPhoneNumbers));
      
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
    }
  }, [docRef]);
  
  // students 상태가 변경될 때마다 studentsRef 업데이트
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);
  
  // 데이터가 변경될 때마다 저장 (debounce 적용) - 진도와 과제 데이터는 제외 (저장 버튼으로만 저장)
  // 전화번호는 별도로 저장하므로 여기서는 제외
  useEffect(() => {
    if (!loading && students.length > 0) {
      const timeoutId = setTimeout(() => {
        saveData(students, progressData, scores, headerTexts, phoneNumbers);
      }, 500); // 500ms 지연 후 저장 (debounce)
      
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, progressData, scores, headerTexts, saveData, loading]);
  // phoneNumbers는 의존성에서 제외 (별도 저장 로직 사용)
  
  // 전화번호 전용 저장 (더 짧은 debounce로 즉시 저장)
  const phoneSaveTimerRef = useRef(null);
  useEffect(() => {
    if (!loading && Object.keys(phoneNumbers).length > 0) {
      // 이전 타이머 취소
      if (phoneSaveTimerRef.current) {
        clearTimeout(phoneSaveTimerRef.current);
      }
      
      // 1초 후 저장 (입력이 완료된 후)
      phoneSaveTimerRef.current = setTimeout(() => {
        console.log('📞 전화번호 저장 시도:', phoneNumbers);
        saveData(students, progressData, scores, headerTexts, phoneNumbers)
          .then(() => {
            console.log('✅ 전화번호 저장 완료');
          })
          .catch(error => {
            console.error('❌ 전화번호 저장 실패:', error);
          });
      }, 1000);
      
      return () => {
        if (phoneSaveTimerRef.current) {
          clearTimeout(phoneSaveTimerRef.current);
        }
      };
    }
  }, [phoneNumbers, students, progressData, scores, headerTexts, saveData, loading]);
  
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

    // 템플릿 코드 입력 받기 (저장된 값이 있으면 제안)
    const defaultTemplateCode = savedTemplateCode || '';
    const promptMessage = defaultTemplateCode 
      ? `카카오톡 템플릿 코드를 입력하세요:\n(이전 입력: ${defaultTemplateCode})`
      : '카카오톡 템플릿 코드를 입력하세요:';
    
    const templateCode = prompt(promptMessage, defaultTemplateCode);
    if (!templateCode || !templateCode.trim()) {
      return;
    }
    
    const trimmedTemplateCode = templateCode.trim();
    
    // 입력한 템플릿 코드를 저장 (localStorage 및 state)
    setSavedTemplateCode(trimmedTemplateCode);
    try {
      localStorage.setItem('kakaoTemplateCode', trimmedTemplateCode);
    } catch (error) {
      console.warn('템플릿 코드를 localStorage에 저장하지 못했습니다:', error);
    }
  
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
      content += `📢 2학기 기말고사(4차고사) 전체 과제 완료도입니다.\n\n`;
      content += `1. 모든 과제는 선생님과 클리닉 선생님들께 검사를 받으면 됩니다.\n\n`;
      content += `2. 일부 완료는 완료로 체크되지 않습니다. 전체 완료만 완료입니다.\n\n`;
      content += `3. 완료하였는데 체크되지 않은 것이 있다면 채널로 알려주고 확인을 받아주세요.\n\n`;
      content += `4. 제출기간이 아닌 것은 아직 숙제로 나가지 않았지만, 과제로 나갈 예정인 과제입니다.\n\n\n\n`;
      
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
        
        // 올림포스2는 📖 아이콘 사용
        const icon = '📖';
        // 제출기간 아님(모든 학생이 미완료)인 경우 메시지에서 제외
        if (!allStudentsIncomplete) {
          if (isCompleted) {
            content += `${icon} ${mainTitle} ${chapterText}: 완료\n`;
          } else {
            content += `${icon} ${mainTitle} ${chapterText}: 미완료\n`;
          }
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
        
        // 보듬내신모의고사는 📝 아이콘 사용
        const bodeumIcon = '📝';
        // 제출기간 아님(모든 학생이 미완료)인 경우 메시지에서 제외
        if (!allStudentsIncomplete) {
          if (score) {
            // 점수가 있으면 "완료(점수)" 형태로 표시
            content += `${bodeumIcon} ${bodeumTitle} ${roundText}: 완료(${score}점)\n`;
          } else if (isCompleted) {
            content += `${bodeumIcon} ${bodeumTitle} ${roundText}: 완료\n`;
          } else {
            content += `${bodeumIcon} ${bodeumTitle} ${roundText}: 미완료\n`;
          }
        }
      }
      
      // 보듬교육의 시선
      for (let i = 1; i <= 4; i++) {
        const isCompleted = progressData[student]?.[`vision${i}`] || false;
        const roundText = headerTexts.vision?.[i] || `${i}회`;
        const visionTitle = headerTexts.visionTitle || '보듬교육의 시선';
        
        // 반 전체 학생이 모두 미완료인지 확인
        const allStudentsIncomplete = students.every(s => !progressData[s]?.[`vision${i}`]);
        
        // 보듬교육의 시선은 👁️ 아이콘 사용
        const visionIcon = '👁️';
        // 제출기간 아님(모든 학생이 미완료)인 경우 메시지에서 제외
        if (!allStudentsIncomplete) {
          if (isCompleted) {
            content += `${visionIcon} ${visionTitle} ${roundText}: 완료\n`;
          } else {
            content += `${visionIcon} ${visionTitle} ${roundText}: 미완료\n`;
          }
        }
      }
      
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
      templateCode,
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
    const title = getTitle();
    let successCount = 0;
    let failCount = 0;
    const errorMessages = []; // 오류 메시지 수집용
  
    for (const message of messages) {
      const { student, phones, content } = message;
      const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
      
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
    }
    
    // 모든 발송 시도 후 오류 메시지 한 번만 표시
    if (errorMessages.length > 0) {
      alert(`❌ 카카오톡 발송 오류:\n${errorMessages.join('\n')}`);
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
                  <button 
                    className="kakao-btn kakao-send-final-btn" 
                    onClick={handleKakaoSendConfirm}
                  >
                    ✅ 최종 카카오톡 발송하기
                  </button>
                </div>
              )}

              <div className="progress-table-wrapper">
                <table className="progress-table">
                  <thead>
                    <tr>
                      <th rowSpan="2" style={{ width: '90px', minWidth: '90px', maxWidth: '90px', padding: '12px 16px', boxSizing: 'border-box' }}>학생</th>
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
                      <th rowSpan="2" style={{ backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 'bold', width: '180px', minWidth: '180px', maxWidth: '180px', padding: '12px 16px', boxSizing: 'border-box' }}>
                        📱 전화번호<br/>
                        <span style={{ fontSize: '11px', fontWeight: 'normal' }}>(위: 학부모, 아래: 학생)</span>
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
