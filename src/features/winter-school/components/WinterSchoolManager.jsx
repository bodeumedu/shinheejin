import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import { loadCentralPhoneNumbers } from '../../../utils/firestoreUtils';
import './WinterSchoolManager.css';

// 윈터스쿨 관리 컴포넌트
export default function WinterSchoolManager({ onClose }) {
  const [students, setStudents] = useState([]);
  const [studentInfo, setStudentInfo] = useState({}); // {학생명: {school, grade, className, winterSchool2026}}
  const [phoneNumbers, setPhoneNumbers] = useState({}); // {학생명: {student: '010...', parent: '010...'}}
  const [loading, setLoading] = useState(true);
  // 1월 12일부터 2월 28일까지 날짜 목록 생성
  const dateRange = useMemo(() => {
    const dates = [];
    const startDate = new Date('2026-01-12');
    const endDate = new Date('2026-02-28');
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().split('T')[0]);
    }
    return dates;
  }, []);

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    // 오늘이 범위 내에 있으면 오늘, 아니면 첫 번째 날짜
    if (dateRange.includes(todayStr)) {
      return todayStr;
    }
    return dateRange[0] || '2026-01-12';
  });
  
  // 시간대 목록 (9시부터 22시까지)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 9; hour <= 22; hour++) {
      let label = `${hour}시`;
      if (hour === 16) {
        label = '장기플랜';
      } else if (hour === 17) {
        label = '윈터 기간 내 결석 예정 일자';
      } else if (hour === 18) {
        label = '담당 선생님';
      } else if (hour === 19) {
        label = '추가 체크 사항';
      }
      slots.push({
        hour: hour,
        label: label,
        value: `${hour.toString().padStart(2, '0')}:00`,
      });
    }
    return slots;
  }, []);

  // 스터디 플래너 데이터 구조: {학생명: {날짜: {시간: {category: '대분류', detail: '상세내용', completed: boolean, repeatDays: {매일: boolean, 월: boolean, ...}}}}}}
  const [studyPlanners, setStudyPlanners] = useState({});
  const [sending, setSending] = useState(false);
  const [sendingStudent, setSendingStudent] = useState(null); // 현재 전송 중인 학생
  const [showPreview, setShowPreview] = useState(false); // 미리보기 표시 여부
  const [previewStudent, setPreviewStudent] = useState(null); // 미리보기할 학생 (null이면 전체)
  const [studentComments, setStudentComments] = useState({}); // {날짜: {학생명: '코멘트'}}
  const [studentMemos, setStudentMemos] = useState({}); // {날짜: {학생명: '메모'}} - 카카오톡에 포함되지 않음
  const [templateCode] = useState('KA01TP2601111513575357JZNDJgjYQU'); // 윈터자습관 고정 템플릿 코드
  const [sentStudents, setSentStudents] = useState({}); // {날짜: {학생명: number}} - 전송 횟수
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
  const [saving, setSaving] = useState(false); // 저장 중
  const [saveMessage, setSaveMessage] = useState(''); // 저장 메시지
  const saveTimeoutRef = useRef(null); // 저장 debounce용
  const lastSaveTimeRef = useRef(0); // 마지막 저장 시간
  const hasLoadedData = useRef(false); // 데이터 로드 완료 플래그
  const [expandedStudents, setExpandedStudents] = useState(new Set()); // 펼쳐진 학생 목록
  const [showAddStudentForm, setShowAddStudentForm] = useState(false); // 학생 추가 폼 표시 여부
  const [newStudentForm, setNewStudentForm] = useState({
    name: '',
    school: '',
    grade: '',
    className: '2026 윈터자습관',
    studentPhone: '',
    parentPhone: '',
  });
  
  // 요일 목록
  const weekDays = ['매일', '월', '화', '수', '목', '금'];

  // 2026 윈터 등록 학생 필터링 (반이름에 "2026 윈터자습관"이 포함된 학생)
  const winterStudents = useMemo(() => {
    return students.filter(student => {
      const info = studentInfo[student] || {};
      const className = info.className || '';
      // 반이름에 "2026 윈터자습관"이 포함되어 있는지 확인
      // 쉼표로 구분된 여러 반명 중 하나라도 포함되어 있으면 포함
      const classNames = className.split(',').map(c => c.trim());
      return classNames.some(cn => cn.includes('2026 윈터자습관') || cn.includes('2026윈터자습관'));
    }).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [students, studentInfo]);

  // Firestore 문서 참조 (날짜별로 저장)
  const plannerDocRef = useMemo(() => {
    if (!isFirebaseConfigured() || !db || !selectedDate) return null;
    return doc(db, 'winterSchoolPlanners', selectedDate);
  }, [selectedDate]);

  // 로컬 스토리지에서 스터디 플래너 불러오기
  const loadFromLocalStorage = useCallback((date) => {
    try {
      const saved = localStorage.getItem(`winterSchoolPlanner_${date}`);
      if (saved) {
        const data = JSON.parse(saved);
        return data;
      }
    } catch (error) {
      console.error('로컬 스토리지 불러오기 실패:', error);
    }
    return null;
  }, []);

  // 로컬 스토리지에 스터디 플래너 저장
  const saveToLocalStorage = useCallback((date, data) => {
    try {
      localStorage.setItem(`winterSchoolPlanner_${date}`, JSON.stringify(data));
    } catch (error) {
      console.error('로컬 스토리지 저장 실패:', error);
    }
  }, []);

  // Firestore에 스터디 플래너 저장 (전체 데이터 저장)
  const saveToFirestore = useCallback(async (date, data) => {
    if (!isFirebaseConfigured() || !db) {
      // Firebase가 없으면 로컬 스토리지만 저장 (모든 날짜 데이터 저장)
      dateRange.forEach(d => {
        if (data && Object.keys(data).length > 0) {
          // 해당 날짜의 데이터만 추출하여 저장
          const dateData = {};
          Object.keys(data).forEach(studentName => {
            if (data[studentName] && data[studentName][d]) {
              if (!dateData[studentName]) {
                dateData[studentName] = {};
              }
              dateData[studentName][d] = data[studentName][d];
            }
          });
          if (Object.keys(dateData).length > 0) {
            saveToLocalStorage(d, dateData);
          }
        }
      });
      return;
    }

    try {
      // 전체 studyPlanners 데이터를 날짜별로 저장
      dateRange.forEach(d => {
        if (data && Object.keys(data).length > 0) {
          // 해당 날짜의 데이터만 추출
          const dateData = {};
          Object.keys(data).forEach(studentName => {
            if (data[studentName] && data[studentName][d]) {
              if (!dateData[studentName]) {
                dateData[studentName] = {};
              }
              dateData[studentName][d] = data[studentName][d];
            }
          });
          
          if (Object.keys(dateData).length > 0) {
            const docRef = doc(db, 'winterSchoolPlanners', d);
            // 기존 데이터와 병합하기 위해 먼저 불러오기
            getDoc(docRef).then(docSnapshot => {
              const existingData = docSnapshot.exists() ? docSnapshot.data().planners || {} : {};
              // 기존 데이터와 새 데이터 병합
              const mergedData = { ...existingData };
              Object.keys(dateData).forEach(studentName => {
                if (!mergedData[studentName]) {
                  mergedData[studentName] = {};
                }
                mergedData[studentName] = {
                  ...mergedData[studentName],
                  ...dateData[studentName],
                };
              });
              
              // 날짜별 코멘트 및 메모 추출
              const dateComments = studentComments[d] || {};
              const dateMemos = studentMemos[d] || {};
              
              setDoc(docRef, {
                planners: mergedData,
                comments: dateComments,
                memos: dateMemos,
                lastUpdated: new Date().toISOString(),
              }, { merge: true });
              
              // 로컬 스토리지에도 백업
              saveToLocalStorage(d, mergedData);
            }).catch(err => {
              console.error(`Firestore 저장 실패 (${d}):`, err);
              // 실패 시 로컬 스토리지에만 저장
              if (Object.keys(dateData).length > 0) {
                saveToLocalStorage(d, dateData);
              }
            });
          }
        }
      });
      
      console.log(`✅ 전체 스터디 플래너 저장 완료`);
    } catch (error) {
      console.error('Firestore 저장 실패:', error);
      
      if (error.code === 'permission-denied') {
        setSaveMessage('⚠️ Firestore 권한이 없습니다. 데이터는 로컬에서만 사용 가능합니다.');
        // 권한 없을 때 로컬 스토리지만 저장
        dateRange.forEach(d => {
          if (data && Object.keys(data).length > 0) {
            const dateData = {};
            Object.keys(data).forEach(studentName => {
              if (data[studentName] && data[studentName][d]) {
                if (!dateData[studentName]) {
                  dateData[studentName] = {};
                }
                dateData[studentName][d] = data[studentName][d];
              }
            });
            if (Object.keys(dateData).length > 0) {
              saveToLocalStorage(d, dateData);
            }
          }
        });
      } else {
        setSaveMessage('⚠️ 저장 중 오류가 발생했습니다. 로컬에만 저장되었습니다.');
      }
      setTimeout(() => setSaveMessage(''), 3000);
    }
  }, [studentComments, studentMemos, saveToLocalStorage, dateRange, db]);

  // 스터디 플래너 데이터 불러오기 (날짜별 + 모든 날짜 데이터 통합) - 날짜 변경 시마다 로드
  useEffect(() => {
    if (!selectedDate) return;
    hasLoadedData.current = false; // 날짜 변경 시 데이터 다시 로드
    
    const loadPlannerData = async () => {
      // 전체 데이터를 로드하여 통합
      const allPlanners = {};
      
      // 먼저 모든 날짜의 로컬 스토리지에서 불러오기
      dateRange.forEach(d => {
        const localData = loadFromLocalStorage(d);
        if (localData) {
          // 로컬 데이터를 통합
          Object.keys(localData).forEach(studentName => {
            if (!allPlanners[studentName]) {
              allPlanners[studentName] = {};
            }
            if (localData[studentName] && localData[studentName][d]) {
              allPlanners[studentName][d] = localData[studentName][d];
            }
          });
        }
      });
      
      if (Object.keys(allPlanners).length > 0) {
        setStudyPlanners(allPlanners);
        console.log(`✅ 로컬 스토리지에서 전체 플래너 불러옴`);
      }

      // Firestore에서 모든 날짜 데이터 불러오기
      if (db) {
        try {
          const loadPromises = dateRange.map(async (d) => {
            const docRef = doc(db, 'winterSchoolPlanners', d);
            try {
              const docSnapshot = await getDoc(docRef);
              if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                const planners = data.planners || {};
                
                // 전체 데이터에 통합
                Object.keys(planners).forEach(studentName => {
                  if (!allPlanners[studentName]) {
                    allPlanners[studentName] = {};
                  }
                  if (planners[studentName] && planners[studentName][d]) {
                    allPlanners[studentName][d] = planners[studentName][d];
                  }
                });
                
                // 코멘트는 날짜별로 저장
                if (data.comments) {
                  setStudentComments(prev => ({
                    ...prev,
                    [d]: data.comments,
                  }));
                  // 코멘트 로컬 스토리지에 백업
                  try {
                    localStorage.setItem(`winterSchoolComments_${d}`, JSON.stringify(data.comments));
                  } catch (error) {
                    console.error('코멘트 로컬 저장 실패:', error);
                  }
                }
                
                // Firestore 데이터를 로컬 스토리지에 백업
                saveToLocalStorage(d, planners);
              }
            } catch (dateError) {
              console.error(`Firestore 불러오기 실패 (${d}):`, dateError);
            }
          });
          
          await Promise.all(loadPromises);
          
          if (Object.keys(allPlanners).length > 0) {
            setStudyPlanners(allPlanners);
            console.log(`✅ Firestore에서 전체 플래너 불러옴`);
          }
        } catch (error) {
          console.error('Firestore 불러오기 실패:', error);
        }
      }
      
      // 로컬 스토리지에서 모든 날짜의 코멘트 불러오기 (Firestore에 없을 경우)
      dateRange.forEach(d => {
        try {
          const savedComments = localStorage.getItem(`winterSchoolComments_${d}`);
          if (savedComments) {
            setStudentComments(prev => ({
              ...prev,
              [d]: JSON.parse(savedComments),
            }));
          }
        } catch (error) {
          console.error(`로컬 코멘트 불러오기 실패 (${d}):`, error);
        }
      });

      // 로컬 스토리지에서 모든 날짜의 메모 불러오기
      dateRange.forEach(d => {
        try {
          const savedMemos = localStorage.getItem(`winterSchoolMemos_${d}`);
          if (savedMemos) {
            setStudentMemos(prev => ({
              ...prev,
              [d]: JSON.parse(savedMemos),
            }));
          }
        } catch (error) {
          console.error(`로컬 메모 불러오기 실패 (${d}):`, error);
        }
      });
      
      hasLoadedData.current = true;
    };

    loadPlannerData();
  }, [selectedDate, plannerDocRef, loadFromLocalStorage, saveToLocalStorage, dateRange, db]);

  // 날짜 변경 시 데이터 로드 플래그 리셋 및 코멘트 초기화
  useEffect(() => {
    hasLoadedData.current = false;
    // 날짜가 바뀌면 미리보기 모달이 열려있을 경우 코멘트 입력 칸이 해당 날짜의 코멘트로 업데이트됨
    // (이미 studentComments[selectedDate]로 관리되므로 자동으로 해당 날짜의 코멘트만 표시됨)
  }, [selectedDate]);

  // 컴포넌트 언마운트 시 저장 타이머 정리
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // 학생 데이터 불러오기
  useEffect(() => {
    const loadData = async () => {
      if (!isFirebaseConfigured() || !db) {
        setLoading(false);
        return;
      }

      try {
        // 중앙 전화번호 저장소에서 데이터 불러오기
        const docRef = doc(db, 'studentPhoneNumbers', 'all');
        const docSnapshot = await getDoc(docRef);

        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const studentList = data.students || [];
          const infoData = data.studentInfo || {};

          setStudents(studentList);
          setStudentInfo(infoData);

          // 전화번호 데이터도 불러오기
          try {
            const phoneData = await loadCentralPhoneNumbers();
            console.log('🔍 전화번호 데이터 구조 확인:', {
              전체키수: Object.keys(phoneData).length,
              샘플데이터: Object.keys(phoneData).slice(0, 3).reduce((acc, key) => {
                acc[key] = phoneData[key];
                return acc;
              }, {}),
            });
            setPhoneNumbers(phoneData);
            console.log('✅ 전화번호 데이터 불러옴:', { 전화번호수: Object.keys(phoneData).length });
          } catch (phoneError) {
            console.error('전화번호 불러오기 실패:', phoneError);
          }

          // 윈터 등록 학생 수 계산
          const winterCount = studentList.filter(s => {
            const info = infoData[s] || {};
            const className = info.className || '';
            const classNames = className.split(',').map(c => c.trim());
            return classNames.some(cn => cn.includes('2026 윈터자습관') || cn.includes('2026윈터자습관'));
          }).length;
          
          console.log('✅ 학생 데이터 불러옴:', { 
            전체학생수: studentList.length,
            윈터등록학생수: winterCount
          });
        } else {
          // 로컬 스토리지에서 불러오기 시도
          try {
            const saved = localStorage.getItem('studentPhoneNumbers_backup');
            if (saved) {
              const localData = JSON.parse(saved);
              setStudents(localData.students || []);
              setStudentInfo(localData.studentInfo || {});
              setPhoneNumbers(localData.phoneNumbers || {});
              console.log('✅ 로컬 스토리지에서 학생 데이터 불러옴');
            }
          } catch (error) {
            console.error('로컬 스토리지 불러오기 실패:', error);
          }
        }
      } catch (error) {
        console.error('학생 데이터 불러오기 실패:', error);
        // 로컬 스토리지에서 불러오기 시도
        try {
          const saved = localStorage.getItem('studentPhoneNumbers_backup');
          if (saved) {
            const localData = JSON.parse(saved);
            setStudents(localData.students || []);
            setStudentInfo(localData.studentInfo || {});
            setPhoneNumbers(localData.phoneNumbers || {});
            console.log('✅ 로컬 스토리지에서 학생 데이터 불러옴');
          }
        } catch (localError) {
          console.error('로컬 스토리지 불러오기 실패:', localError);
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // 학생 아코디언 토글
  const toggleStudent = useCallback((studentName) => {
    setExpandedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentName)) {
        newSet.delete(studentName);
      } else {
        newSet.add(studentName);
      }
      return newSet;
    });
  }, []);

  // 학생 추가 핸들러
  const handleAddStudent = useCallback(async () => {
    if (!newStudentForm.name.trim()) {
      alert('학생 이름을 입력해주세요.');
      return;
    }

    const studentName = newStudentForm.name.trim();
    
    // 이미 존재하는 학생인지 확인
    if (students.includes(studentName)) {
      alert('이미 등록된 학생입니다.');
      return;
    }

    try {
      // 학생 목록에 추가
      const updatedStudents = [...students, studentName];
      setStudents(updatedStudents);

      // 학생 정보 추가
      const updatedStudentInfo = {
        ...studentInfo,
        [studentName]: {
          school: newStudentForm.school.trim() || '',
          grade: newStudentForm.grade.trim() || '',
          className: newStudentForm.className.trim() || '2026 윈터자습관',
        },
      };
      setStudentInfo(updatedStudentInfo);

      // 전화번호 추가
      const updatedPhoneNumbers = {
        ...phoneNumbers,
        [studentName]: {
          핸드폰: newStudentForm.studentPhone.trim() || null,
          부모핸드폰: newStudentForm.parentPhone.trim() || null,
          student: newStudentForm.studentPhone.trim() || null,
          parent: newStudentForm.parentPhone.trim() || null,
        },
      };
      setPhoneNumbers(updatedPhoneNumbers);

      // Firestore에 저장 시도
      if (isFirebaseConfigured() && db) {
        try {
          const docRef = doc(db, 'studentPhoneNumbers', 'all');
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            const currentStudents = data.students || [];
            const currentStudentInfo = data.studentInfo || {};
            const currentPhoneNumbers = data.phoneNumbers || {};

            // 중복 확인
            if (!currentStudents.includes(studentName)) {
              await setDoc(docRef, {
                students: [...currentStudents, studentName],
                studentInfo: {
                  ...currentStudentInfo,
                  [studentName]: updatedStudentInfo[studentName],
                },
                phoneNumbers: {
                  ...currentPhoneNumbers,
                  [studentName]: updatedPhoneNumbers[studentName],
                },
              }, { merge: true });
              console.log('✅ Firestore에 학생 추가 완료');
            }
          } else {
            // 문서가 없으면 새로 생성
            await setDoc(docRef, {
              students: [studentName],
              studentInfo: {
                [studentName]: updatedStudentInfo[studentName],
              },
              phoneNumbers: {
                [studentName]: updatedPhoneNumbers[studentName],
              },
            });
            console.log('✅ Firestore에 새 문서 생성 및 학생 추가 완료');
          }
        } catch (error) {
          console.error('Firestore 저장 실패:', error);
          // 로컬 스토리지에 백업
          try {
            const backup = {
              students: updatedStudents,
              studentInfo: updatedStudentInfo,
              phoneNumbers: updatedPhoneNumbers,
            };
            localStorage.setItem('studentPhoneNumbers_backup', JSON.stringify(backup));
          } catch (localError) {
            console.error('로컬 스토리지 백업 실패:', localError);
          }
        }
      } else {
        // Firebase가 없으면 로컬 스토리지만 저장
        try {
          const backup = {
            students: updatedStudents,
            studentInfo: updatedStudentInfo,
            phoneNumbers: updatedPhoneNumbers,
          };
          localStorage.setItem('studentPhoneNumbers_backup', JSON.stringify(backup));
        } catch (localError) {
          console.error('로컬 스토리지 저장 실패:', localError);
        }
      }

      // 폼 초기화
      setNewStudentForm({
        name: '',
        school: '',
        grade: '',
        className: '2026 윈터자습관',
        studentPhone: '',
        parentPhone: '',
      });
      setShowAddStudentForm(false);
      alert(`✅ ${studentName} 학생이 추가되었습니다.`);
    } catch (error) {
      console.error('학생 추가 실패:', error);
      alert(`❌ 학생 추가 중 오류가 발생했습니다: ${error.message}`);
    }
  }, [newStudentForm, students, studentInfo, phoneNumbers, db]);

  // 학생 삭제 핸들러
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

      // studyPlanners에서 제거
      const updatedStudyPlanners = { ...studyPlanners };
      delete updatedStudyPlanners[studentName];
      setStudyPlanners(updatedStudyPlanners);

      // Firestore에 저장
      if (isFirebaseConfigured() && db) {
        try {
          const docRef = doc(db, 'studentPhoneNumbers', 'all');
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            const currentStudents = data.students || [];
            const currentStudentInfo = data.studentInfo || {};
            const currentPhoneNumbers = data.phoneNumbers || {};

            await setDoc(docRef, {
              students: currentStudents.filter(s => s !== studentName),
              studentInfo: Object.fromEntries(
                Object.entries(currentStudentInfo).filter(([key]) => key !== studentName)
              ),
              phoneNumbers: Object.fromEntries(
                Object.entries(currentPhoneNumbers).filter(([key]) => key !== studentName)
              ),
            }, { merge: true });
            console.log('✅ Firestore에서 학생 삭제 완료');
          }
        } catch (error) {
          console.error('Firestore 삭제 실패:', error);
          // 로컬 스토리지에 백업
          try {
            const backup = {
              students: updatedStudents,
              studentInfo: updatedStudentInfo,
              phoneNumbers: updatedPhoneNumbers,
            };
            localStorage.setItem('studentPhoneNumbers_backup', JSON.stringify(backup));
          } catch (localError) {
            console.error('로컬 스토리지 백업 실패:', localError);
          }
        }
      } else {
        // Firebase가 없으면 로컬 스토리지만 저장
        try {
          const backup = {
            students: updatedStudents,
            studentInfo: updatedStudentInfo,
            phoneNumbers: updatedPhoneNumbers,
          };
          localStorage.setItem('studentPhoneNumbers_backup', JSON.stringify(backup));
        } catch (localError) {
          console.error('로컬 스토리지 저장 실패:', localError);
        }
      }

      // expandedStudents에서도 제거
      setExpandedStudents(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentName);
        return newSet;
      });

      alert(`✅ ${studentName} 학생이 삭제되었습니다.`);
    } catch (error) {
      console.error('학생 삭제 실패:', error);
      alert(`❌ 학생 삭제 중 오류가 발생했습니다: ${error.message}`);
    }
  }, [students, studentInfo, phoneNumbers, studyPlanners, db]);

  // 전화번호 업데이트 핸들러
  const updatePhoneNumber = useCallback(async (studentName, phoneType, phoneValue) => {
    const updatedPhoneNumbers = {
      ...phoneNumbers,
      [studentName]: {
        ...phoneNumbers[studentName],
        [phoneType]: phoneValue.trim() || null,
        // 영어 키도 함께 업데이트
        ...(phoneType === '핸드폰' && { student: phoneValue.trim() || null }),
        ...(phoneType === '부모핸드폰' && { parent: phoneValue.trim() || null }),
      },
    };
    
    setPhoneNumbers(updatedPhoneNumbers);
    
    // Firestore에 저장
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, 'studentPhoneNumbers', 'all');
        const docSnapshot = await getDoc(docRef);
        
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const currentPhoneNumbers = data.phoneNumbers || {};
          
          await setDoc(docRef, {
            phoneNumbers: {
              ...currentPhoneNumbers,
              [studentName]: updatedPhoneNumbers[studentName],
            },
          }, { merge: true });
          console.log(`✅ ${studentName} 전화번호 업데이트 완료`);
        }
      } catch (error) {
        console.error('전화번호 업데이트 실패:', error);
        // 로컬 스토리지에 백업
        try {
          const backup = {
            students,
            studentInfo,
            phoneNumbers: updatedPhoneNumbers,
          };
          localStorage.setItem('studentPhoneNumbers_backup', JSON.stringify(backup));
        } catch (localError) {
          console.error('로컬 스토리지 백업 실패:', localError);
        }
      }
    } else {
      // Firebase가 없으면 로컬 스토리지만 저장
      try {
        const backup = {
          students,
          studentInfo,
          phoneNumbers: updatedPhoneNumbers,
        };
        localStorage.setItem('studentPhoneNumbers_backup', JSON.stringify(backup));
      } catch (localError) {
        console.error('로컬 스토리지 저장 실패:', localError);
      }
    }
  }, [phoneNumbers, students, studentInfo, db]);

  // 대분류 업데이트
  const updateCategory = useCallback((studentName, timeSlot, category) => {
    setStudyPlanners(prev => {
      const newData = {
        ...prev,
        [studentName]: {
          ...prev[studentName],
          [selectedDate]: {
            ...(prev[studentName]?.[selectedDate] || {}),
            [timeSlot]: {
              ...(prev[studentName]?.[selectedDate]?.[timeSlot] || {}),
              category: category,
            },
          },
        },
      };
      
      // Debounce: 1초 후 저장
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveToFirestore(selectedDate, newData);
        lastSaveTimeRef.current = Date.now();
      }, 1000);
      
      return newData;
    });
  }, [selectedDate, saveToFirestore]);

  // 상세내용 업데이트
  const updateDetail = useCallback((studentName, timeSlot, detail) => {
    setStudyPlanners(prev => {
      const newData = {
        ...prev,
        [studentName]: {
          ...prev[studentName],
          [selectedDate]: {
            ...(prev[studentName]?.[selectedDate] || {}),
            [timeSlot]: {
              ...(prev[studentName]?.[selectedDate]?.[timeSlot] || {}),
              detail: detail,
            },
          },
        },
      };
      
      // Debounce: 1초 후 저장
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveToFirestore(selectedDate, newData);
        lastSaveTimeRef.current = Date.now();
      }, 1000);
      
      return newData;
    });
  }, [selectedDate, saveToFirestore]);

  // 반복 요일 업데이트
  const updateRepeatDay = useCallback((studentName, timeSlot, day, checked) => {
    setStudyPlanners(prev => {
      const currentSlot = prev[studentName]?.[selectedDate]?.[timeSlot] || {};
      const currentRepeatDays = currentSlot.repeatDays || {};
      const category = currentSlot.category || '';
      
      const newData = {
        ...prev,
        [studentName]: {
          ...prev[studentName],
          [selectedDate]: {
            ...(prev[studentName]?.[selectedDate] || {}),
            [timeSlot]: {
              ...currentSlot,
              repeatDays: {
                ...currentRepeatDays,
                [day]: checked,
              },
            },
          },
        },
      };
      
      // 반복 체크 시 해당 요일에 대분류만 복사
      if (checked && category) {
        // 요일 매핑
        const dayMap = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5 };
        
        // 해당 요일에 해당하는 모든 날짜에 대분류만 입력
        dateRange.forEach(date => {
          const dateObj = new Date(date);
          const dayOfWeek = dateObj.getDay(); // 0=일, 1=월, ..., 6=토
          
          let shouldApply = false;
          if (day === '매일') {
            shouldApply = true; // 매일은 모든 날짜에 적용
          } else if (dayMap[day] && dayMap[day] === dayOfWeek) {
            shouldApply = true; // 특정 요일과 일치하는 경우
          }
          
          if (shouldApply) {
            if (!newData[studentName]) {
              newData[studentName] = {};
            }
            if (!newData[studentName][date]) {
              newData[studentName][date] = {};
            }
            if (!newData[studentName][date][timeSlot]) {
              newData[studentName][date][timeSlot] = {};
            }
            
            // 기존 데이터 유지하면서 대분류만 업데이트
            const existingSlot = newData[studentName][date][timeSlot];
            const existingRepeatDays = existingSlot.repeatDays || {};
            newData[studentName][date][timeSlot] = {
              ...existingSlot,
              category: category, // 대분류만 복사
              // detail은 복사하지 않음 (기존 값 유지)
              repeatDays: {
                ...existingRepeatDays,
                [day]: checked,
              },
            };
          }
        });
      }
      
      // 반복 체크 시 즉시 모든 해당 날짜에 Firebase 저장 (실시간 동기화)
      if (checked && category) {
        const datesToSave = new Set([selectedDate]);
        dateRange.forEach(date => {
          const dateObj = new Date(date);
          const dayOfWeek = dateObj.getDay();
          const dayMap = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5 };
          
          let shouldSave = false;
          if (day === '매일') {
            shouldSave = true;
          } else if (dayMap[day] && dayMap[day] === dayOfWeek) {
            shouldSave = true;
          }
          
          if (shouldSave) {
            datesToSave.add(date);
          }
        });
        
        // 모든 해당 날짜에 즉시 Firebase 저장 (debounce 없이)
        datesToSave.forEach(date => {
          if (newData[studentName] && newData[studentName][date]) {
            saveToFirestore(date, {
              [studentName]: {
                [date]: newData[studentName][date],
              },
            });
          }
        });
        lastSaveTimeRef.current = Date.now();
      } else {
        // 반복 해제 시에는 debounce로 저장
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        
        saveTimeoutRef.current = setTimeout(() => {
          if (newData[studentName] && newData[studentName][selectedDate]) {
            saveToFirestore(selectedDate, {
              [studentName]: {
                [selectedDate]: newData[studentName][selectedDate],
              },
            });
          }
          lastSaveTimeRef.current = Date.now();
        }, 1000);
      }
      
      return newData;
    });
  }, [selectedDate, saveToFirestore, dateRange]);

  // 완료도 업데이트 (실시간 저장)
  const updateCompletion = useCallback((studentName, timeSlot, completed) => {
    setStudyPlanners(prev => {
      const newData = {
        ...prev,
        [studentName]: {
          ...prev[studentName],
          [selectedDate]: {
            ...(prev[studentName]?.[selectedDate] || {}),
            [timeSlot]: {
              ...(prev[studentName]?.[selectedDate]?.[timeSlot] || {}),
              completed: completed,
            },
          },
        },
      };
      
      // Debounce: 1초 후 저장
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveToFirestore(selectedDate, newData);
        lastSaveTimeRef.current = Date.now();
      }, 1000);
      
      return newData;
    });
  }, [selectedDate, saveToFirestore]);

  // 코멘트 업데이트 (날짜별 저장)
  const updateComment = useCallback((studentName, comment) => {
    setStudentComments(prev => {
      const newComments = {
        ...prev,
        [selectedDate]: {
          ...(prev[selectedDate] || {}),
          [studentName]: comment,
        },
      };
      
      // Debounce: 1초 후 저장
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(async () => {
        const dateComments = newComments[selectedDate] || {};
        const docRef = doc(db, 'winterSchoolPlanners', selectedDate);
        
        if (isFirebaseConfigured() && db) {
          try {
            const docSnapshot = await getDoc(docRef);
            const existingPlanners = docSnapshot.exists() ? (docSnapshot.data().planners || {}) : {};
            
            const dateMemos = studentMemos[selectedDate] || {};
            
            await setDoc(docRef, {
              comments: dateComments,
              memos: dateMemos,
              planners: existingPlanners,
              lastUpdated: new Date().toISOString(),
            }, { merge: true });
            console.log('✅ 코멘트 저장 완료');
          } catch (error) {
            console.error('코멘트 저장 실패:', error);
            // 로컬 스토리지에 백업
            try {
              localStorage.setItem(`winterSchoolComments_${selectedDate}`, JSON.stringify(dateComments));
            } catch (localError) {
              console.error('로컬 스토리지 저장 실패:', localError);
            }
          }
        } else {
          // Firebase가 없으면 로컬 스토리지만 저장
          try {
            localStorage.setItem(`winterSchoolComments_${selectedDate}`, JSON.stringify(dateComments));
          } catch (localError) {
            console.error('로컬 스토리지 저장 실패:', localError);
          }
        }
        lastSaveTimeRef.current = Date.now();
      }, 1000);
      
      return newComments;
    });
  }, [selectedDate, db]);

  // 카톡 미리보기 생성
  const generatePreview = useCallback(() => {
    const previewData = [];
    
    for (const student of winterStudents) {
      const dayPlanner = studyPlanners[student]?.[selectedDate];
      if (!dayPlanner) continue;
      
        // 시간대별 플래너를 정리된 형식으로 만들기
        // 16시, 17시, 18시, 19시는 완료/미완료 표시만 제거하고 내용은 그대로 보냄
        const plannerLines = timeSlots.map(slot => {
          const slotData = dayPlanner[slot.value];
          if (!slotData || (!slotData.category && !slotData.detail)) return null;
          const category = slotData.category || '';
          const detail = slotData.detail || '';
          const content = category && detail ? `${category}: ${detail}` : (category || detail);
          
          // 16시, 17시, 18시, 19시는 완료/미완료 표시 제외
          if ([16, 17, 18, 19].includes(slot.hour)) {
            return `${slot.label}: ${content}`;
          } else {
            const completed = slotData.completed ? '✅ 완료' : '🔺 미완료';
            return `${slot.label}: ${content}\n   (${completed})`;
          }
        }).filter(line => line !== null);
      
      if (plannerLines.length === 0) continue;
      
      const planner = plannerLines.join('\n');
      const comment = studentComments[selectedDate]?.[student] || '';
      const phoneData = phoneNumbers[student] || {};
      
      // 전화번호 추출: '핸드폰'이 학생, '부모핸드폰' 또는 '학부모핸드폰'이 학부모
      let studentPhone = null;
      let parentPhone = null;
      
      if (phoneData && typeof phoneData === 'object' && !Array.isArray(phoneData)) {
        studentPhone = phoneData.핸드폰 || phoneData.학생핸드폰 || phoneData.student || phoneData.학생 || null;
        parentPhone = phoneData.부모핸드폰 || phoneData.학부모핸드폰 || phoneData.parent || phoneData.학부모 || phoneData.부모 || null;
      } else if (typeof phoneData === 'string') {
        studentPhone = phoneData;
      }
      
      const dateObj = new Date(selectedDate);
      const month = dateObj.getMonth() + 1;
      const day = dateObj.getDate();
      const formattedDate = `${month}월 ${day}일`;
      
      previewData.push({
        student,
        phone: studentPhone ? String(studentPhone).replace(/-/g, '') : null,
        parentPhone: parentPhone ? String(parentPhone).replace(/-/g, '') : null,
        content: planner,
        comment: comment,
        formattedDate: formattedDate,
      });
    }
    
    return previewData;
  }, [winterStudents, studyPlanners, selectedDate, timeSlots, studentComments, phoneNumbers]);

  // 미리보기 열기 (전체 또는 특정 학생)
  const handleOpenPreview = useCallback((studentName = null) => {
    // 템플릿 코드는 고정값 사용 (KA01TP2601111513575357JZNDJgjYQU)
    setPreviewStudent(studentName);
    setShowPreview(true);
  }, []);

  // 특정 학생의 카톡 미리보기 생성
  const generateStudentPreview = useCallback((studentName) => {
    const dayPlanner = studyPlanners[studentName]?.[selectedDate];
    if (!dayPlanner) return null;
    
    const plannerLines = timeSlots.map(slot => {
      const slotData = dayPlanner[slot.value];
      if (!slotData || (!slotData.category && !slotData.detail)) return null;
      const category = slotData.category || '';
      const detail = slotData.detail || '';
      const content = category && detail ? `${category}: ${detail}` : (category || detail);
      
      // 16시, 17시, 18시, 19시는 완료/미완료 표시 제외
      if ([16, 17, 18, 19].includes(slot.hour)) {
        return `${slot.label}: ${content}`;
      } else {
        const completed = slotData.completed ? '✅ 완료' : '🔺 미완료';
        return `${slot.label}: ${content}\n   (${completed})`;
      }
    }).filter(line => line !== null);
    
    if (plannerLines.length === 0) return null;
    
    const planner = plannerLines.join('\n');
    const comment = studentComments[selectedDate]?.[studentName] || '';
    const phoneData = phoneNumbers[studentName] || {};
    
    let studentPhone = null;
    let parentPhone = null;
    
    if (phoneData && typeof phoneData === 'object' && !Array.isArray(phoneData)) {
      studentPhone = phoneData.핸드폰 || phoneData.학생핸드폰 || phoneData.student || phoneData.학생 || null;
      parentPhone = phoneData.부모핸드폰 || phoneData.학부모핸드폰 || phoneData.parent || phoneData.학부모 || phoneData.부모 || null;
    } else if (typeof phoneData === 'string') {
      studentPhone = phoneData;
    }
    
    const dateObj = new Date(selectedDate);
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const formattedDate = `${month}월 ${day}일`;
    
    return {
      student: studentName,
      phone: studentPhone ? String(studentPhone).replace(/-/g, '') : null,
      parentPhone: parentPhone ? String(parentPhone).replace(/-/g, '') : null,
      content: planner,
      comment: comment,
      formattedDate: formattedDate,
    };
  }, [studyPlanners, selectedDate, timeSlots, studentComments, phoneNumbers]);

  // 특정 학생에게 카톡 전송
  const sendKakaoToStudent = useCallback(async (studentName) => {
    const trimmedTemplateCode = templateCode.trim();
    const preview = generateStudentPreview(studentName);
    
    if (!preview) {
      alert('스터디 플래너가 없습니다. 먼저 플래너를 입력해주세요.');
      return;
    }
    
    const { phone: studentPhone, parentPhone, content: planner, comment, formattedDate } = preview;
    
    if (!studentPhone && !parentPhone) {
      alert('전화번호가 등록되지 않았습니다.');
      return;
    }
    
    setSendingStudent(studentName);
    
    try {
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      // 코멘트가 있으면 플래너에 추가
      const fullContent = comment ? `${planner}\n\n[코멘트]\n${comment}` : planner;
      let allSuccess = true;

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
                '날짜': formattedDate,
                '스터디플래너': fullContent,
              },
            }),
          });

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${studentName} 학생 카카오톡 전송 실패:`, error);
          allSuccess = false;
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
                '날짜': formattedDate,
                '스터디플래너': fullContent,
              },
            }),
          });

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${studentName} 학부모 카카오톡 전송 실패:`, error);
          allSuccess = false;
          alert(`❌ ${studentName} 학부모에게 카카오톡 발송 실패: ${error.message}`);
          return;
        }
      }

      // 전송 성공 시 상태 업데이트 (카운트 증가)
      if (allSuccess) {
        setSentStudents(prev => {
          const currentCount = prev[selectedDate]?.[studentName] || 0;
          return {
            ...prev,
            [selectedDate]: {
              ...(prev[selectedDate] || {}),
              [studentName]: currentCount + 1,
            },
          };
        });
        alert(`✅ ${studentName} 학생에게 카카오톡 발송 완료!`);
        setShowPreview(false);
      }
    } catch (error) {
      console.error('카카오톡 발송 중 오류:', error);
      alert(`❌ 카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSendingStudent(null);
    }
  }, [templateCode, generateStudentPreview, selectedDate, studentMemos]);

  // 카톡 전송 (전체 - 기존 함수 유지)
  const sendKakaoMessages = useCallback(async () => {
    const trimmedTemplateCode = templateCode.trim();
    
    setSending(true);
    
    try {
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      let successCount = 0;
      let failCount = 0;
      const errorMessages = [];
      const successfullySentStudents = new Set(); // 성공적으로 전송된 학생 추적

      const previewData = generatePreview();
      
      // 미리보기 데이터를 기반으로 발송
      for (const preview of previewData) {
        const { student, phone: studentPhone, parentPhone, content: planner, comment, formattedDate } = preview;
        
        // 코멘트가 있으면 플래너에 추가
        const fullContent = comment ? `${planner}\n\n[코멘트]\n${comment}` : planner;
        
        let studentSent = false; // 이 학생에게 전송 성공 여부

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
                  '날짜': formattedDate,
                  '스터디플래너': fullContent,
                },
              }),
            });

            const result = await response.json();

            if (result.success) {
              successCount++;
              studentSent = true;
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
                  '날짜': formattedDate,
                  '스터디플래너': fullContent,
                },
              }),
            });

            const result = await response.json();

            if (result.success) {
              successCount++;
              studentSent = true;
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
        
        // 학생 또는 학부모 중 하나라도 성공하면 카운트 증가
        if (studentSent) {
          successfullySentStudents.add(student);
        }
      }

      // 성공한 학생들의 전송 횟수 증가
      if (successfullySentStudents.size > 0) {
        setSentStudents(prev => {
          const updated = { ...prev };
          if (!updated[selectedDate]) {
            updated[selectedDate] = {};
          }
          successfullySentStudents.forEach(student => {
            const currentCount = updated[selectedDate][student] || 0;
            updated[selectedDate][student] = currentCount + 1;
          });
          return updated;
        });
      }
      
      // 결과 알림
      if (errorMessages.length > 0) {
        alert(`❌ 카카오톡 발송 오류:\n${errorMessages.join('\n')}`);
      }
      
      if (successCount > 0) {
        alert(`✅ ${successCount}건의 카카오톡 메시지가 성공적으로 발송되었습니다!${failCount > 0 ? `\n❌ ${failCount}건 발송 실패` : ''}`);
      } else {
        alert('❌ 발송된 메시지가 없습니다. 스터디 플래너를 입력하고 전화번호를 확인해주세요.');
      }
    } catch (error) {
      console.error('카카오톡 발송 중 오류:', error);
      alert(`❌ 카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setSending(false);
    }
  }, [winterStudents, phoneNumbers, studyPlanners, selectedDate, templateCode, generatePreview, studentMemos]);

  const sendScheduledKakao = useCallback(async (studentName = null) => {
    if (!scheduledSendAt) { alert('예약 발송 시간을 입력해주세요.'); return; }
    const scheduledDate = new Date(scheduledSendAt);
    if (Number.isNaN(scheduledDate.getTime())) { alert('예약 발송 시간이 올바르지 않습니다.'); return; }
    if (scheduledDate.getTime() <= Date.now() + 60 * 1000) { alert('예약 시간은 현재보다 1분 이상 이후로 설정해주세요.'); return; }

    const trimmedTemplateCode = templateCode.trim();
    const apiUrl = import.meta.env.PROD
      ? `${window.location.origin}/api/send-kakao`
      : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

    const previews = studentName
      ? [generateStudentPreview(studentName)].filter(Boolean)
      : generatePreview();

    if (previews.length === 0) { alert('전송할 대상이 없습니다.'); return; }

    setScheduleSending(true);
    let successCount = 0;
    let failCount = 0;
    const errorMessages = [];

    try {
      for (const preview of previews) {
        const { student, phone: sPhone, parentPhone, content: planner, comment, formattedDate } = preview;
        const fullContent = comment ? `${planner}\n\n[코멘트]\n${comment}` : planner;
        const phones = [];
        if (sPhone && /^010\d{8}$/.test(sPhone)) phones.push(sPhone);
        if (parentPhone && /^010\d{8}$/.test(parentPhone)) phones.push(parentPhone);

        for (const phone of phones) {
          try {
            const res = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phoneNumber: phone,
                templateCode: trimmedTemplateCode,
                variables: { '학생명': student, '날짜': formattedDate, '스터디플래너': fullContent },
                scheduleDate: scheduledDate.toISOString(),
              }),
            });
            const result = await res.json();
            if (res.ok && result.success) successCount++;
            else throw new Error(result.error || `HTTP ${res.status}`);
          } catch (err) {
            failCount++;
            const msg = err?.message || '알 수 없는 오류';
            if (!errorMessages.includes(msg)) errorMessages.push(msg);
          }
        }
      }

      if (errorMessages.length > 0) alert(`❌ 예약발송 오류:\n${errorMessages.join('\n')}`);
      if (successCount > 0) {
        alert(`✅ ${successCount}건 예약발송 접수 완료\n예약 시각: ${scheduledSendAt.replace('T', ' ')}${failCount > 0 ? `\n❌ ${failCount}건 접수 실패` : ''}`);
        setShowPreview(false);
      } else {
        alert('❌ 예약 접수된 메시지가 없습니다.');
      }
    } catch (error) {
      console.error('예약발송 오류:', error);
      alert(`❌ 예약발송 중 오류: ${error?.message || error}`);
    } finally {
      setScheduleSending(false);
    }
  }, [scheduledSendAt, templateCode, generatePreview, generateStudentPreview]);

  if (loading) {
    return (
      <div className="winter-school-page">
        <div className="winter-school-container">
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>데이터를 불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="winter-school-page">
      <div className="winter-school-container">
        <div className="winter-school-header">
          <div>
            <h2>❄️ 윈터스쿨 관리</h2>
            <div>
              <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                2026 윈터 등록 학생: {winterStudents.length}명
              </p>
              {saveMessage && (
                <p style={{ margin: '5px 0 0 0', color: '#f59e0b', fontSize: '0.85rem' }}>
                  {saveMessage}
                </p>
              )}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>닫기</button>
        </div>
        
        <div className="winter-school-content">
          <div className="date-selector-section">
            <label htmlFor="date-selector" style={{ marginRight: '10px', fontWeight: '600' }}>
              날짜 선택 (1월 12일 ~ 2월 28일):
            </label>
            <select
              id="date-selector"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                padding: '8px 15px',
                border: '2px solid #0ea5e9',
                borderRadius: '6px',
                fontSize: '1rem',
                minWidth: '200px',
              }}
            >
              {dateRange.map(date => {
                const dateObj = new Date(date);
                const month = dateObj.getMonth() + 1;
                const day = dateObj.getDate();
                const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
                return (
                  <option key={date} value={date}>
                    {month}월 {day}일 ({dayOfWeek})
                  </option>
                );
              })}
            </select>
          </div>

          {winterStudents.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', color: '#666' }}>
                2026 윈터자습관에 등록한 학생이 없습니다.
              </p>
              <p style={{ fontSize: '0.9rem', color: '#999', marginTop: '10px' }}>
                학생 전화번호 관리에서 학생의 반명에 "2026 윈터자습관"이 포함되어 있는지 확인해주세요.
              </p>
            </div>
          ) : (
            <>
              <div className="students-planner-list">
                {winterStudents.map((student, index) => {
                  const info = studentInfo[student] || {};
                  const phoneData = phoneNumbers[student] || {};
                  
                  // 디버깅: 전화번호 데이터 구조 확인
                  if (index === 0) {
                    console.log('🔍 첫 번째 학생 전화번호 데이터:', {
                      학생명: student,
                      phoneData: phoneData,
                      phoneData타입: typeof phoneData,
                      phoneData키: phoneData ? Object.keys(phoneData) : [],
                    });
                  }
                  
                  const formatPhone = (phone) => {
                    if (!phone) return '';
                    const cleaned = phone.replace(/[^0-9]/g, '');
                    if (cleaned.length === 11) {
                      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
                    }
                    return phone;
                  };
                  
                  // 전화번호 데이터 구조 확인 및 정리
                  let studentPhone = null;
                  let parentPhone = null;
                  
                  if (phoneData) {
                    if (typeof phoneData === 'object' && !Array.isArray(phoneData)) {
                      // 객체 형태: '핸드폰'이 학생, '부모핸드폰' 또는 '학부모핸드폰'이 학부모
                      studentPhone = phoneData.핸드폰 || phoneData.학생핸드폰 || phoneData.student || phoneData.학생 || null;
                      parentPhone = phoneData.부모핸드폰 || phoneData.학부모핸드폰 || phoneData.parent || phoneData.학부모 || phoneData.부모 || null;
                    } else if (typeof phoneData === 'string') {
                      // 문자열 형태: 학생 번호만 있는 경우
                      studentPhone = phoneData;
                    }
                  }
                  
                  const isExpanded = expandedStudents.has(student);
                  const sentCount = sentStudents[selectedDate]?.[student] || 0;
                  
                  return (
                    <div 
                      key={student} 
                      className="student-planner-card"
                      style={sentCount > 0 ? { backgroundColor: '#d1fae5' } : {}}
                    >
                      <div 
                        className="student-planner-header clickable"
                        onClick={() => toggleStudent(student)}
                      >
                        <div className="student-info-section">
                          <span className="student-number">{index + 1}</span>
                          <div className="student-details">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <h3 className="student-name" style={{ margin: 0 }}>
                                {student}
                                <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                              </h3>
                              <input
                                type="text"
                                value={studentMemos[selectedDate]?.[student] || ''}
                                onChange={(e) => {
                                  const newMemo = e.target.value;
                                  setStudentMemos(prev => ({
                                    ...prev,
                                    [selectedDate]: {
                                      ...(prev[selectedDate] || {}),
                                      [student]: newMemo,
                                    },
                                  }));
                                  
                                  // Debounce: 1초 후 저장
                                  if (saveTimeoutRef.current) {
                                    clearTimeout(saveTimeoutRef.current);
                                  }
                                  
                                  saveTimeoutRef.current = setTimeout(async () => {
                                    const dateMemos = {
                                      ...(studentMemos[selectedDate] || {}),
                                      [student]: newMemo,
                                    };
                                    
                                    // 로컬 스토리지에 저장
                                    try {
                                      localStorage.setItem(`winterSchoolMemos_${selectedDate}`, JSON.stringify(dateMemos));
                                    } catch (error) {
                                      console.error('메모 로컬 저장 실패:', error);
                                    }
                                    
                                    // Firestore에 저장
                                    if (isFirebaseConfigured() && db) {
                                      try {
                                        const docRef = doc(db, 'winterSchoolPlanners', selectedDate);
                                        const docSnapshot = await getDoc(docRef);
                                        const existingPlanners = docSnapshot.exists() ? (docSnapshot.data().planners || {}) : {};
                                        const dateComments = studentComments[selectedDate] || {};
                                        
                                        await setDoc(docRef, {
                                          comments: dateComments,
                                          memos: dateMemos,
                                          planners: existingPlanners,
                                          lastUpdated: new Date().toISOString(),
                                        }, { merge: true });
                                        console.log('✅ 메모 저장 완료');
                                      } catch (error) {
                                        console.error('메모 Firestore 저장 실패:', error);
                                      }
                                    }
                                    lastSaveTimeRef.current = Date.now();
                                  }, 1000);
                                }}
                                placeholder="메모 (카톡 미포함)"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.9rem',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  minWidth: '400px',
                                  width: '500px',
                                  flex: '0 1 auto',
                                }}
                              />
                            </div>
                            {info.className && (() => {
                              // 윈터자습관을 제외한 수강 과목만 표시
                              const classNames = info.className.split(',').map(c => c.trim()).filter(cn => 
                                !cn.includes('2026 윈터자습관') && !cn.includes('2026윈터자습관')
                              );
                              if (classNames.length > 0) {
                                return (
                                  <div className="student-classes">
                                    {classNames.map((className, idx) => (
                                      <span key={idx} className="class-badge">
                                        {className}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            <div className="student-meta">
                              <span>{info.school || '-'}</span>
                              <span>{info.grade || '-'}</span>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <label style={{ fontSize: '0.85rem', fontWeight: '600', minWidth: '40px' }}>학생:</label>
                                  <input
                                    type="text"
                                    value={studentPhone || ''}
                                    onChange={(e) => updatePhoneNumber(student, '핸드폰', e.target.value)}
                                    placeholder="010-1234-5678"
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '0.85rem',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px',
                                      width: '120px',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <label style={{ fontSize: '0.85rem', fontWeight: '600', minWidth: '40px' }}>학부모:</label>
                                  <input
                                    type="text"
                                    value={parentPhone || ''}
                                    onChange={(e) => updatePhoneNumber(student, '부모핸드폰', e.target.value)}
                                    placeholder="010-9876-5432"
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '0.85rem',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px',
                                      width: '120px',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="student-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(student)}
                            style={{
                              padding: '8px 16px',
                              fontSize: '0.9rem',
                              backgroundColor: '#10b981',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              marginRight: '8px',
                            }}
                          >
                            👁️ 미리보기
                          </button>
                          <button
                            type="button"
                            onClick={() => sendKakaoToStudent(student)}
                            disabled={sendingStudent === student}
                            style={{
                              padding: '8px 16px',
                              fontSize: '0.9rem',
                              backgroundColor: '#FEE500',
                              color: '#000',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: sendingStudent === student ? 'not-allowed' : 'pointer',
                              fontWeight: '600',
                              opacity: sendingStudent === student ? 0.6 : 1,
                              marginRight: '8px',
                            }}
                          >
                            {sendingStudent === student ? '전송 중...' : sentCount > 0 ? `📱 카톡 전송 (${sentCount}건)` : '📱 카톡 전송'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(student)}
                            style={{
                              padding: '8px 16px',
                              fontSize: '0.9rem',
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
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="time-slots-list">
                          {timeSlots.map(slot => {
                            const slotData = studyPlanners[student]?.[selectedDate]?.[slot.value] || {};
                            const category = slotData.category || '';
                            const detail = slotData.detail || '';
                            const completed = slotData.completed || false;
                            const repeatDays = slotData.repeatDays || {};
                            
                            return (
                              <div key={slot.value} className="time-slot-item">
                                <div className="time-slot-header">
                                  <span className="time-label">{slot.label}</span>
                                  {slot.hour !== 16 && slot.hour !== 17 && slot.hour !== 18 && slot.hour !== 19 && (
                                    <label className="completion-checkbox">
                                      <input
                                        type="checkbox"
                                        checked={completed}
                                        onChange={(e) => updateCompletion(student, slot.value, e.target.checked)}
                                      />
                                      <span className={completed ? 'completed' : 'not-completed'}>
                                        {completed ? '✅ 완료' : '⭕ 미완료'}
                                      </span>
                                    </label>
                                  )}
                                </div>
                                
                                <div className="planner-two-columns">
                                  <div className="planner-left-column">
                                    <label className="planner-label">대분류</label>
                                    <input
                                      type="text"
                                      value={category}
                                      onChange={(e) => updateCategory(student, slot.value, e.target.value)}
                                      placeholder="대분류를 입력하세요"
                                      className="category-input"
                                    />
                                    <div className="repeat-days">
                                      <span className="repeat-label">반복:</span>
                                      {weekDays.map(day => (
                                        <label key={day} className="repeat-checkbox">
                                          <input
                                            type="checkbox"
                                            checked={repeatDays[day] || false}
                                            onChange={(e) => updateRepeatDay(student, slot.value, day, e.target.checked)}
                                          />
                                          <span>{day}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                  
                                  <div className="planner-right-column">
                                    <label className="planner-label">상세내용</label>
                                    <textarea
                                      value={detail}
                                      onChange={(e) => updateDetail(student, slot.value, e.target.value)}
                                      placeholder="상세내용을 입력하세요"
                                      className="detail-textarea"
                                      rows={3}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 학생 추가 섹션 */}
              <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '2px solid #e0e0e0' }}>
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
                          반명
                        </label>
                        <input
                          type="text"
                          value={newStudentForm.className}
                          onChange={(e) => setNewStudentForm(prev => ({ ...prev, className: e.target.value }))}
                          placeholder="예) 2026 윈터자습관"
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
                          value={newStudentForm.studentPhone}
                          onChange={(e) => setNewStudentForm(prev => ({ ...prev, studentPhone: e.target.value }))}
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
                          value={newStudentForm.parentPhone}
                          onChange={(e) => setNewStudentForm(prev => ({ ...prev, parentPhone: e.target.value }))}
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
                    </div>
                    <div style={{ marginTop: '15px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={handleAddStudent}
                        disabled={!newStudentForm.name.trim()}
                        style={{
                          padding: '10px 20px',
                          fontSize: '1rem',
                          backgroundColor: newStudentForm.name.trim() ? '#0ea5e9' : '#9ca3af',
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

              {/* 카톡 전송 미리보기 모달 */}
              {showPreview && (
                <div className="preview-modal-overlay" onClick={() => setShowPreview(false)}>
                  <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="preview-modal-header">
                      <h3>📱 카카오톡 전송 미리보기</h3>
                      <button className="close-btn" onClick={() => setShowPreview(false)}>닫기</button>
                    </div>
                    
                    <div className="preview-template-section">
                      <label htmlFor="template-code" style={{ marginRight: '10px', fontWeight: '600' }}>
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
                          flex: 1,
                          maxWidth: '300px',
                          backgroundColor: '#f3f4f6',
                          color: '#6b7280',
                          cursor: 'not-allowed',
                        }}
                      />
                      <span style={{ marginLeft: '10px', fontSize: '0.85rem', color: '#6b7280' }}>
                        (고정값)
                      </span>
                    </div>

                    <div className="preview-list">
                      {(previewStudent 
                        ? (() => {
                            const studentPreview = generateStudentPreview(previewStudent);
                            return studentPreview ? [studentPreview] : [];
                          })()
                        : generatePreview()
                      ).map((preview, index) => (
                        <div key={preview.student} className="preview-item">
                          <div className="preview-item-header">
                            <span className="preview-student-name">{preview.student}</span>
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
                              <strong>스터디 플래너:</strong>
                              <pre className="preview-text">{preview.content}</pre>
                            </div>
                            
                            <div className="preview-comment-section">
                              <label htmlFor={`comment-${preview.student}`} style={{ fontWeight: '600', marginBottom: '5px', display: 'block' }}>
                                코멘트:
                              </label>
                              <textarea
                                id={`comment-${preview.student}`}
                                value={studentComments[selectedDate]?.[preview.student] || ''}
                                onChange={(e) => updateComment(preview.student, e.target.value)}
                                placeholder="학생별 코멘트를 입력하세요 (16시와 17시 사이에 표시됨)..."
                                className="comment-textarea"
                                rows={3}
                              />
                            </div>
                          </div>
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
                    </div>

                    <div className="preview-modal-actions">
                      {previewStudent ? (
                        <>
                          <button
                            className="send-kakao-btn"
                            onClick={() => sendKakaoToStudent(previewStudent)}
                            disabled={sendingStudent === previewStudent || scheduleSending}
                          >
                            {sendingStudent === previewStudent ? '전송 중...' : '📱 카톡으로 발송'}
                          </button>
                          <button
                            className="send-kakao-btn"
                            onClick={() => sendScheduledKakao(previewStudent)}
                            disabled={scheduleSending || sendingStudent === previewStudent}
                            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white' }}
                          >
                            {scheduleSending ? '예약 접수 중...' : '⏰ 예약발송'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="send-kakao-btn"
                            onClick={sendKakaoMessages}
                            disabled={sending || scheduleSending}
                          >
                            {sending ? '전송 중...' : '📱 카톡으로 발송'}
                          </button>
                          <button
                            className="send-kakao-btn"
                            onClick={() => sendScheduledKakao()}
                            disabled={scheduleSending || sending}
                            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white' }}
                          >
                            {scheduleSending ? '예약 접수 중...' : '⏰ 예약발송'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

