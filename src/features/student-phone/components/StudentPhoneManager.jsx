import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import * as XLSX from 'xlsx';
import './StudentPhoneManager.css';

// 전화번호 관리 컴포넌트
export default function StudentPhoneManager({ onClose }) {
  const [students, setStudents] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState({}); // {학생명: {student: '01012345678', parent: '01012345678'}}
  const [studentInfo, setStudentInfo] = useState({}); // {학생명: {school: '과천중앙고등학교', grade: '1학년'}}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentSchool, setNewStudentSchool] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('');
  const [newStudentClassName, setNewStudentClassName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const fileInputRefLoading = useRef(null);
  const permissionErrorLogged = useRef(false);
  const hasLoadedData = useRef(false); // 데이터 로드 완료 플래그
  
  // Firestore 문서 참조 (중앙 전화번호 저장소) - useMemo로 고정
  const docRef = useMemo(() => {
    return isFirebaseConfigured() && db ? doc(db, 'studentPhoneNumbers', 'all') : null;
  }, []);
  
  // 전화번호 포맷팅 (010-1234-5678)
  const formatPhoneNumber = (value) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    if (cleaned.length <= 11) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };
  
  // 로컬 스토리지에서 데이터 불러오기
  const loadFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem('studentPhoneNumbers_backup');
      if (saved) {
        const data = JSON.parse(saved);
        setPhoneNumbers(data.phoneNumbers || {});
        setStudents(data.students || []);
        setStudentInfo(data.studentInfo || {});
        console.log('✅ 로컬 스토리지에서 전화번호 데이터 불러옴');
        
        // 강동원, 권순범 확인
        const localStudents = data.students || [];
        const hasGang = localStudents.some(s => s.includes('강동원'));
        const hasKwon = localStudents.some(s => s.includes('권순범'));
        console.log('🔍 로컬 스토리지에서 특정 학생 확인:', {
          강동원: hasGang ? '✅ 있음' : '❌ 없음',
          권순범: hasKwon ? '✅ 있음' : '❌ 없음',
          강동원상세: localStudents.filter(s => s.includes('강동원')),
          권순범상세: localStudents.filter(s => s.includes('권순범')),
          전체학생수: localStudents.length,
        });
        
        return true;
      }
    } catch (error) {
      console.error('로컬 스토리지 불러오기 실패:', error);
    }
    return false;
  };

  // 로컬 스토리지에 데이터 저장
  const saveToLocalStorage = (studentsData, phoneNumbersData, studentInfoData) => {
    try {
      const dataToSave = {
        students: studentsData,
        phoneNumbers: phoneNumbersData,
        studentInfo: studentInfoData,
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem('studentPhoneNumbers_backup', JSON.stringify(dataToSave));
      console.log('✅ 로컬 스토리지에 백업 저장 완료');
    } catch (error) {
      console.error('로컬 스토리지 저장 실패:', error);
    }
  };

  // Firestore에서 데이터 불러오기 (한 번만 불러오기)
  useEffect(() => {
    // 이미 데이터를 불러왔으면 재시도하지 않음
    if (hasLoadedData.current) {
      return;
    }
    
    // 먼저 로컬 스토리지에서 불러오기 시도
    const hasLocalData = loadFromLocalStorage();
    
    if (!isFirebaseConfigured() || !db || !docRef) {
      setLoading(false);
      hasLoadedData.current = true;
      return;
    }
    
    // 이미 권한 오류가 발생했으면 재시도하지 않음
    if (permissionErrorLogged.current) {
      setLoading(false);
      hasLoadedData.current = true;
      return;
    }
    
    setLoading(true);
    
    const loadData = async () => {
      try {
        const docSnapshot = await getDoc(docRef);
        
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const phoneData = data.phoneNumbers || {};
          const studentList = data.students || [];
          const infoData = data.studentInfo || {}; // 학교, 학년 정보
          
          setPhoneNumbers(phoneData);
          setStudents(studentList);
          setStudentInfo(infoData);
          
          // Firestore 데이터를 로컬 스토리지에 백업
          saveToLocalStorage(studentList, phoneData, infoData);
          
          console.log('✅ 전화번호 데이터 불러옴:', { 학생수: studentList.length, 전화번호수: Object.keys(phoneData).length });
          
          // 강동원, 권순범 확인
          const hasGang = studentList.some(s => s.includes('강동원'));
          const hasKwon = studentList.some(s => s.includes('권순범'));
          console.log('🔍 Firestore에서 특정 학생 확인:', {
            강동원: hasGang ? '✅ 있음' : '❌ 없음',
            권순범: hasKwon ? '✅ 있음' : '❌ 없음',
            강동원상세: studentList.filter(s => s.includes('강동원')),
            권순범상세: studentList.filter(s => s.includes('권순범')),
            전체학생수: studentList.length,
          });
        } else {
          // 문서가 없으면 로컬 스토리지 데이터가 있으면 유지, 없으면 빈 상태
          if (!hasLocalData) {
            setPhoneNumbers({});
            setStudents([]);
            setStudentInfo({});
            // 로그는 한 번만 출력
            if (!hasLoadedData.current) {
              console.log('📝 전화번호 문서가 없음. 새로 생성합니다.');
            }
          }
        }
        hasLoadedData.current = true;
      } catch (error) {
        // 권한 오류는 한 번만 로그 출력
        if (error.code === 'permission-denied') {
          if (!permissionErrorLogged.current) {
            permissionErrorLogged.current = true;
            console.warn('⚠️ Firestore 권한이 없습니다. 로컬 스토리지에 백업 저장됩니다.');
          }
          // 로컬 스토리지 데이터가 있으면 유지
          if (!hasLocalData) {
            setPhoneNumbers({});
            setStudents([]);
            setStudentInfo({});
          }
        } else {
          // 다른 오류는 한 번만 로그 출력
          if (!hasLoadedData.current) {
            console.error('❌ 전화번호 데이터 불러오기 실패:', error);
          }
          if (!hasLocalData) {
            setPhoneNumbers({});
            setStudents([]);
            setStudentInfo({});
          }
        }
        hasLoadedData.current = true;
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [docRef]);
  
  // 전화번호 변경 핸들러
  const handlePhoneNumberChange = (student, phoneNumber, type = 'student') => {
    const formatted = formatPhoneNumber(phoneNumber);
    const cleanedPhone = formatted.replace(/-/g, '').trim();
    
    setPhoneNumbers(prev => {
      const currentStudentPhone = prev[student] || {};
      const updated = {
        ...prev,
        [student]: {
          ...(typeof currentStudentPhone === 'object' ? currentStudentPhone : {}),
        },
      };
      
      // 필드명 매핑: 'student' -> '핸드폰', 'parent' -> '부모핸드폰'
      const fieldName = type === 'student' ? '핸드폰' : (type === 'parent' ? '부모핸드폰' : type);
      
      // 빈 전화번호는 객체에서 제거
      if (cleanedPhone === '' || cleanedPhone === null) {
        if (updated[student] && typeof updated[student] === 'object') {
          delete updated[student][fieldName];
          // 하위 호환성: 기존 'student', 'parent' 필드도 제거
          if (type === 'student') {
            delete updated[student].student;
          } else if (type === 'parent') {
            delete updated[student].parent;
          }
          
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
        updated[student][fieldName] = cleanedPhone;
        // 하위 호환성: 기존 필드명도 유지
        if (type === 'student') {
          updated[student].student = cleanedPhone;
        } else if (type === 'parent') {
          updated[student].parent = cleanedPhone;
        }
      }
      
      return updated;
    });
  };
  
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
    
    const studentName = newStudentName.trim();
    setStudents(prev => [...prev, studentName]);
    
    // 학교, 학년, 반명 정보도 함께 저장
    if (newStudentSchool.trim() || newStudentGrade.trim() || newStudentClassName.trim()) {
      setStudentInfo(prev => ({
        ...prev,
        [studentName]: {
          school: newStudentSchool.trim() || '',
          grade: newStudentGrade.trim() || '',
          className: newStudentClassName.trim() || '',
        }
      }));
    }
    
    setNewStudentName('');
    setNewStudentSchool('');
    setNewStudentGrade('');
    setNewStudentClassName('');
  };
  
  // 학생 제거
  const handleRemoveStudent = (student) => {
    if (window.confirm(`${student} 학생을 삭제하시겠습니까?`)) {
      setStudents(prev => prev.filter(s => s !== student));
      
      // 해당 학생의 전화번호도 제거
      setPhoneNumbers(prev => {
        const updated = { ...prev };
        delete updated[student];
        return updated;
      });
      
      // 해당 학생의 학교/학년 정보도 제거
      setStudentInfo(prev => {
        const updated = { ...prev };
        delete updated[student];
        return updated;
      });
    }
  };
  
  // 학교/학년 정보 변경
  const handleStudentInfoChange = (student, field, value) => {
    setStudentInfo(prev => ({
      ...prev,
      [student]: {
        ...(prev[student] || {}),
        [field]: value.trim(),
      }
    }));
  };
  
  // 엑셀 파일 업로드 및 처리
  const handleExcelUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.');
      return;
    }
    
    setUploading(true);
    setSaveMessage('엑셀 파일을 읽는 중...');
    
    try {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // 첫 번째 시트 읽기
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          
          // 디버깅: 파일 구조 확인
          console.log('📊 엑셀 파일 구조 분석:');
          console.log('전체 행 수:', jsonData.length);
          console.log('처음 10행:', jsonData.slice(0, 10));
          
          // 헤더 행 찾기 (학생명, 학생핸드폰, 부모핸드폰 등의 키워드로 검색)
          let headerRowIndex = -1;
          let headers = null;
          
          // 1행부터 10행까지 검색
          for (let i = 0; i < Math.min(10, jsonData.length); i++) {
            const row = jsonData[i];
            if (Array.isArray(row)) {
              // 학생명, 학생핸드폰, 부모핸드폰 등의 키워드가 있는지 확인
              const rowStr = row.map(cell => String(cell || '')).join('|');
              if (rowStr.includes('학생명') || (rowStr.includes('학생') && rowStr.includes('이름'))) {
                headerRowIndex = i;
                headers = row;
                console.log(`✅ 헤더 행 발견: ${i + 1}행`, headers);
                console.log(`📋 헤더 상세:`, headers.map((h, idx) => `${String.fromCharCode(65 + idx)}열(${idx}): "${String(h || '').trim()}"`));
                break;
              }
            }
          }
          
          if (headerRowIndex === -1 || !headers) {
            alert('엑셀 파일에서 헤더 행을 찾을 수 없습니다.\n"학생명" 또는 "학생 이름" 컬럼이 있는 행을 찾을 수 없습니다.');
            console.error('헤더를 찾을 수 없음. 처음 10행:', jsonData.slice(0, 10));
            setUploading(false);
            setSaveMessage('');
            return;
          }
          
          // 헤더에서 컬럼 인덱스 찾기 (띄어쓰기 무시)
          const findColumnIndex = (keywords) => {
            for (let i = 0; i < headers.length; i++) {
              const header = String(headers[i] || '').trim();
              // 띄어쓰기 제거한 헤더 (비교용)
              const headerNoSpace = header.replace(/\s+/g, '');
              
              for (const keyword of keywords) {
                // 띄어쓰기 제거한 키워드로 비교
                const keywordNoSpace = keyword.replace(/\s+/g, '');
                // 정확히 일치하거나 포함하는지 확인 (띄어쓰기 무시)
                if (header && (headerNoSpace === keywordNoSpace || headerNoSpace.includes(keywordNoSpace))) {
                  const colLetter = String.fromCharCode(65 + i); // A, B, C, ...
                  console.log(`✅ 컬럼 찾음: "${keyword}" → ${colLetter}열(인덱스 ${i}) - 헤더: "${header}"`);
                  return i;
                }
              }
            }
            console.warn(`⚠️ 컬럼을 찾을 수 없음:`, keywords);
            console.warn(`   사용 가능한 헤더:`, headers.map((h, idx) => `${String.fromCharCode(65 + idx)}열: "${String(h || '').trim()}"`));
            return -1;
          };
          
          const nameColIndex = findColumnIndex(['학생명', '학생 이름', '이름', 'name']);
          // 학교 컬럼 찾기 (더 많은 키워드 추가)
          let schoolColIndex = findColumnIndex(['학교', 'school', '소속학교', '학교명']);
          const gradeColIndex = findColumnIndex(['학년', 'grade']);
          const classNameColIndex = findColumnIndex(['반명', '반', 'class', 'class name']);
          // 반리스트는 SMS 컬럼에서 찾기 (26_김지수_미적분1 특강_월금_14:30 형식)
          const classListColIndex = findColumnIndex(['반리스트', 'SMS', 'sms', '반 목록']);
          // 학생 전화번호: I열(인덱스 8)의 '핸드폰' 컬럼 우선 확인
          let studentPhoneColIndex = -1;
          if (headers.length > 8) {
            const iColHeader = String(headers[8] || '').trim().replace(/\s+/g, '');
            if (iColHeader.includes('핸드폰') && !iColHeader.includes('부모') && !iColHeader.includes('학부모')) {
              studentPhoneColIndex = 8;
              console.log(`✅ I열(인덱스 8)에서 학생 핸드폰 컬럼 발견: "${headers[8]}"`);
            }
          }
          // I열에서 찾지 못한 경우 다른 키워드로 검색
          if (studentPhoneColIndex === -1) {
            studentPhoneColIndex = findColumnIndex(['학생핸드폰', '학생 전화', '학생전화', '핸드폰', 'student phone', '학생 핸드폰']);
          }
          
          // 학부모 전화번호: "부모핸드폰" 또는 "학부모핸드폰" 컬럼
          const parentPhoneColIndex = findColumnIndex(['부모핸드폰', '학부모핸드폰', '부모 전화', '부모전화', '학부모 전화', 'parent phone', '부모 핸드폰']);
          
          console.log('📋 컬럼 인덱스:', {
            학생명: nameColIndex !== -1 ? `${String.fromCharCode(65 + nameColIndex)}열(${nameColIndex})` : '찾을 수 없음',
            학교: schoolColIndex !== -1 ? `${String.fromCharCode(65 + schoolColIndex)}열(${schoolColIndex})` : '찾을 수 없음',
            학년: gradeColIndex !== -1 ? `${String.fromCharCode(65 + gradeColIndex)}열(${gradeColIndex})` : '찾을 수 없음',
            반명: classNameColIndex !== -1 ? `${String.fromCharCode(65 + classNameColIndex)}열(${classNameColIndex})` : '찾을 수 없음',
            반리스트: classListColIndex !== -1 ? `${String.fromCharCode(65 + classListColIndex)}열(${classListColIndex})` : '찾을 수 없음',
            학생핸드폰: studentPhoneColIndex !== -1 ? `${String.fromCharCode(65 + studentPhoneColIndex)}열(${studentPhoneColIndex})` : '찾을 수 없음',
            부모핸드폰: parentPhoneColIndex !== -1 ? `${String.fromCharCode(65 + parentPhoneColIndex)}열(${parentPhoneColIndex})` : '찾을 수 없음',
          });
          
          // 학교 컬럼을 찾지 못한 경우 E열(인덱스 4)을 직접 확인
          if (schoolColIndex === -1 && headers.length > 4) {
            const eColValue = String(headers[4] || '').trim();
            console.warn(`⚠️ 학교 컬럼을 찾지 못했습니다. E열(인덱스 4)의 헤더 값: "${eColValue}"`);
            // E열의 헤더가 비어있지 않으면 E열을 학교로 사용
            if (eColValue) {
              console.log(`✅ E열(인덱스 4)을 학교 컬럼으로 사용합니다.`);
              schoolColIndex = 4;
            }
          }
          
          if (nameColIndex === -1) {
            alert('엑셀 파일에서 "학생명" 또는 "학생 이름" 컬럼을 찾을 수 없습니다.');
            console.error('헤더 행:', headers);
            setUploading(false);
            setSaveMessage('');
            return;
          }
          
          // 데이터 행 처리 (헤더 다음 행부터 시작)
          const newStudents = [];
          const newPhoneNumbers = {};
          const newStudentInfo = {};
          const processedStudents = new Set(); // 이미 처리된 학생 추적
          
          for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            const studentName = row[nameColIndex];
            
            // 디버깅: 강동원, 권순범 추적
            const rawName = String(studentName || '').trim();
            if (rawName.includes('강동원') || rawName.includes('권순범')) {
              console.log(`🔍 특정 학생 발견 (${i + 1}행):`, {
                원본값: studentName,
                처리된값: rawName,
                nameColIndex: nameColIndex,
                전체행: row,
                학생명컬럼값: row[nameColIndex],
              });
            }
            
            if (!studentName || String(studentName).trim() === '') {
              // 빈 행도 로그 (처음 몇 개만)
              if (i < headerRowIndex + 5) {
                console.log(`⚠️ 빈 학생명 행 (${i + 1}행):`, row);
              }
              continue;
            }
            
            const name = String(studentName).trim();
            
            // 처음 나오는 학생만 리스트에 추가
            if (!processedStudents.has(name)) {
              newStudents.push(name);
              processedStudents.add(name);
              
              // 디버깅: 강동원, 권순범 추가 확인
              if (name.includes('강동원') || name.includes('권순범')) {
                console.log(`✅ 학생 추가됨: "${name}" (${i + 1}행)`);
              }
            } else {
              // 디버깅: 중복 학생 (강동원, 권순범)
              if (name.includes('강동원') || name.includes('권순범')) {
                console.log(`🔄 중복 학생 발견 (${i + 1}행): "${name}" - 반명 병합 진행`);
              }
            }
            
            // 학교 정보
            if (schoolColIndex !== -1) {
              const schoolValue = row[schoolColIndex];
              if (schoolValue !== undefined && schoolValue !== null && String(schoolValue).trim() !== '') {
                const schoolStr = String(schoolValue).trim();
                newStudentInfo[name] = {
                  ...(newStudentInfo[name] || {}),
                  school: schoolStr,
                };
                // 첫 번째 학생의 학교 정보 디버깅
                if (newStudents.length === 1) {
                  console.log(`📚 첫 학생 학교 정보:`, {
                    학생명: name,
                    학교컬럼인덱스: schoolColIndex,
                    학교값: schoolValue,
                    학교문자열: schoolStr,
                    전체행: row,
                  });
                }
              }
            } else {
              // 첫 번째 학생에서 학교 컬럼을 찾지 못한 경우 디버깅
              if (newStudents.length === 1) {
                console.warn(`⚠️ 학교 컬럼을 찾을 수 없음. 헤더:`, headers);
              }
            }
            
            // 학년 정보
            if (gradeColIndex !== -1 && row[gradeColIndex]) {
              const gradeValue = String(row[gradeColIndex]).trim();
              if (gradeValue) {
                newStudentInfo[name] = {
                  ...(newStudentInfo[name] || {}),
                  grade: gradeValue,
                };
              }
            }
            
            // 반명 정보 (반명 컬럼 우선, 없으면 반리스트에서 추출)
            let classNameValue = '';
            if (classNameColIndex !== -1 && row[classNameColIndex]) {
              classNameValue = String(row[classNameColIndex]).trim();
            } else if (classListColIndex !== -1 && row[classListColIndex]) {
              // 반리스트에서 반명 추출 (26_김지수_미적분1 특강_월금_14:30 형식)
              const classListStr = String(row[classListColIndex]).trim();
              // SMS 형식에서 반리스트 부분만 추출 (발송 26_... 형식일 수 있음)
              const classListMatch = classListStr.match(/(?:발송\s*)?(.+)/);
              if (classListMatch) {
                classNameValue = classListMatch[1].trim();
              } else {
                classNameValue = classListStr;
              }
            }
            
            // 반명이 있으면 기존 반명과 병합 (같은 학생이 여러 행에 있을 수 있음)
            if (classNameValue) {
              const existingClassName = newStudentInfo[name]?.className || '';
              if (existingClassName) {
                // 기존 반명과 새 반명을 합치기 (중복 제거)
                const existingClasses = existingClassName.split(',').map(c => c.trim()).filter(c => c);
                const newClasses = classNameValue.split(',').map(c => c.trim()).filter(c => c);
                const allClasses = [...new Set([...existingClasses, ...newClasses])]; // 중복 제거
                classNameValue = allClasses.join(',');
              }
              
              newStudentInfo[name] = {
                ...(newStudentInfo[name] || {}),
                className: classNameValue,
              };
            }
            
            // 전화번호 정보
            const phoneData = {};
            
            // 학생 전화번호: '핸드폰' 필드로 저장
            if (row[studentPhoneColIndex]) {
              const phone = String(row[studentPhoneColIndex]).trim().replace(/[^0-9]/g, '');
              if (phone && phone.length >= 10) {
                phoneData.핸드폰 = phone;
                // 하위 호환성: student 필드도 유지
                phoneData.student = phone;
              }
            }
            
            // 부모 전화번호: '부모핸드폰' 필드로 저장
            if (row[parentPhoneColIndex]) {
              const parentPhoneStr = String(row[parentPhoneColIndex]).trim();
              if (parentPhoneStr) {
                // 부/모 전화번호 분리
                const phoneParts = parentPhoneStr.split(/\s+/);
                let parentPhone = null;
                
                // "모"가 포함된 전화번호 우선 사용, 없으면 첫 번째 전화번호 사용
                for (const part of phoneParts) {
                  const phone = part.replace(/[^0-9]/g, '');
                  if (phone && phone.length >= 10) {
                    if (part.includes('모')) {
                      parentPhone = phone;
                      break;
                    } else if (!parentPhone) {
                      parentPhone = phone;
                    }
                  }
                }
                
                if (parentPhone) {
                  phoneData.부모핸드폰 = parentPhone;
                  // 하위 호환성: parent 필드도 유지
                  phoneData.parent = parentPhone;
                }
              }
            }
            
            if (Object.keys(phoneData).length > 0) {
              newPhoneNumbers[name] = phoneData;
            }
          }
          
          if (newStudents.length === 0) {
            alert('엑셀 파일에서 학생 데이터를 찾을 수 없습니다.');
            setUploading(false);
            setSaveMessage('');
            return;
          }
          
          // 디버깅: 강동원, 권순범 확인
          const hasGang = newStudents.some(s => s.includes('강동원'));
          const hasKwon = newStudents.some(s => s.includes('권순범'));
          console.log('🔍 특정 학생 확인:', {
            강동원: hasGang ? '✅ 있음' : '❌ 없음',
            권순범: hasKwon ? '✅ 있음' : '❌ 없음',
            강동원상세: newStudents.filter(s => s.includes('강동원')),
            권순범상세: newStudents.filter(s => s.includes('권순범')),
            전체학생수: newStudents.length,
            처음10명: newStudents.slice(0, 10),
          });
          
          // 기존 데이터와 병합
          setStudents(prev => {
            const merged = [...new Set([...prev, ...newStudents])];
            return merged;
          });
          
          setPhoneNumbers(prev => ({
            ...prev,
            ...newPhoneNumbers,
          }));
          
          setStudentInfo(prev => ({
            ...prev,
            ...newStudentInfo,
          }));
          
          // 로컬 스토리지에 즉시 저장
          const mergedStudents = [...new Set([...students, ...newStudents])];
          const mergedPhoneNumbers = { ...phoneNumbers, ...newPhoneNumbers };
          const mergedStudentInfo = { ...studentInfo, ...newStudentInfo };
          saveToLocalStorage(mergedStudents, mergedPhoneNumbers, mergedStudentInfo);
          
          setSaveMessage(`✅ ${newStudents.length}명의 학생 데이터를 불러왔습니다.`);
          setTimeout(() => setSaveMessage(''), 3000);
          
        } catch (error) {
          console.error('엑셀 파일 처리 오류:', error);
          alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + (error?.message || String(error)));
          setSaveMessage('');
        } finally {
          setUploading(false);
          // 파일 input 초기화
          event.target.value = '';
        }
      };
      
      reader.onerror = () => {
        alert('파일을 읽는 중 오류가 발생했습니다.');
        setUploading(false);
        setSaveMessage('');
        event.target.value = '';
      };
      
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('엑셀 업로드 오류:', error);
      alert('엑셀 파일 업로드 중 오류가 발생했습니다: ' + (error?.message || String(error)));
      setUploading(false);
      setSaveMessage('');
      if (event.target) {
        event.target.value = '';
      }
    }
  }, []);
  
  // 데이터 저장
  const handleSave = useCallback(async () => {
    if (!isFirebaseConfigured() || !db || !docRef) {
      alert('Firebase가 설정되지 않아 저장할 수 없습니다.');
      return;
    }
    
    setSaving(true);
    setSaveMessage('저장 중...');
    
    try {
      // phoneNumbers에서 undefined 값 완전히 제거 및 정리
      const cleanedPhoneNumbers = {};
      
      Object.keys(phoneNumbers).forEach(student => {
        const studentPhone = phoneNumbers[student];
        
        if (studentPhone === undefined || studentPhone === null) return;
        
        // 객체 형태인 경우 ('핸드폰', '부모핸드폰' 필드 사용)
        if (typeof studentPhone === 'object' && !Array.isArray(studentPhone)) {
          const cleaned = {};
          
          // 학생 전화번호: '핸드폰' 필드 우선, 없으면 'student' 필드 (하위 호환성)
          const studentValue = studentPhone.핸드폰 || studentPhone.학생핸드폰 || studentPhone.student || studentPhone.학생;
          if (studentValue !== undefined && studentValue !== null && String(studentValue).trim() !== '') {
            const cleanedValue = String(studentValue).trim();
            if (cleanedValue !== '') {
              cleaned.핸드폰 = cleanedValue;
              // 하위 호환성: student 필드도 유지
              cleaned.student = cleanedValue;
            }
          }
          
          // 학부모 전화번호: '부모핸드폰' 필드 우선, 없으면 'parent' 필드 (하위 호환성)
          const parentValue = studentPhone.부모핸드폰 || studentPhone.학부모핸드폰 || studentPhone.parent || studentPhone.학부모 || studentPhone.부모;
          if (parentValue !== undefined && parentValue !== null && String(parentValue).trim() !== '') {
            const cleanedValue = String(parentValue).trim();
            if (cleanedValue !== '') {
              cleaned.부모핸드폰 = cleanedValue;
              // 하위 호환성: parent 필드도 유지
              cleaned.parent = cleanedValue;
            }
          }
          
          if (Object.keys(cleaned).length > 0) {
            cleanedPhoneNumbers[student] = cleaned;
          }
        } 
        // 문자열 형태인 경우 (하위 호환성)
        else if (typeof studentPhone === 'string' && studentPhone.trim() !== '') {
          cleanedPhoneNumbers[student] = studentPhone.trim();
        }
      });
      
      // 최종적으로 JSON 직렬화/역직렬화로 undefined 완전히 제거
      const finalPhoneNumbers = JSON.parse(JSON.stringify(cleanedPhoneNumbers));
      
      // studentInfo에서 빈 값 제거
      const cleanedStudentInfo = {};
      Object.keys(studentInfo).forEach(student => {
        const info = studentInfo[student];
        if (info && (info.school || info.grade || info.className)) {
          cleanedStudentInfo[student] = {
            school: info.school || '',
            grade: info.grade || '',
            className: info.className || '',
          };
        }
      });
      
      // Firestore에 저장 시도
      try {
        await setDoc(docRef, {
          students: students,
          phoneNumbers: finalPhoneNumbers,
          studentInfo: cleanedStudentInfo,
          lastUpdated: new Date().toISOString(),
        }, { merge: true });
        
        console.log('✅ Firestore 저장 완료:', { 
          학생수: students.length, 
          전화번호수: Object.keys(finalPhoneNumbers).length,
          학생정보수: Object.keys(cleanedStudentInfo).length
        });
        
        // Firestore 저장 성공 시 로컬 스토리지에도 백업
        saveToLocalStorage(students, finalPhoneNumbers, cleanedStudentInfo);
        
        setSaveMessage('✅ 저장 완료!');
        setTimeout(() => setSaveMessage(''), 2000);
      } catch (firestoreError) {
        // Firestore 저장 실패 시 로컬 스토리지에만 저장
        if (firestoreError.code === 'permission-denied') {
          permissionErrorLogged.current = true;
          
          // 로컬 스토리지에 백업 저장
          saveToLocalStorage(students, finalPhoneNumbers, cleanedStudentInfo);
          
          setSaveMessage('⚠️ Firestore 권한이 없어 로컬 스토리지에만 저장되었습니다. 페이지를 새로고침해도 데이터가 유지됩니다.');
          setTimeout(() => setSaveMessage(''), 5000);
        } else {
          throw firestoreError; // 다른 오류는 다시 throw
        }
      }
    } catch (error) {
      console.error('전화번호 저장 실패:', error);
      
      // 로컬 스토리지에라도 백업 저장 시도
      try {
        saveToLocalStorage(students, finalPhoneNumbers, cleanedStudentInfo);
        setSaveMessage('⚠️ Firestore 저장 실패. 로컬 스토리지에 백업 저장되었습니다.');
        setTimeout(() => setSaveMessage(''), 5000);
      } catch (localError) {
        setSaveMessage('❌ 저장 실패: ' + (error.message || '알 수 없는 오류'));
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } finally {
      setSaving(false);
    }
  }, [students, phoneNumbers, studentInfo, docRef]);
  
  // 자동 저장 (debounce) - 권한 오류가 있으면 저장 시도하지 않음
  useEffect(() => {
    if (!loading && students.length > 0 && !permissionErrorLogged.current) {
      const timeoutId = setTimeout(() => {
        handleSave();
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [students, phoneNumbers, studentInfo, loading, handleSave]);
  
  if (loading) {
    return (
      <div className="student-phone-manager-page">
        <div className="student-phone-manager-container">
          <div className="student-phone-manager-header">
            <h2>📞 학생 전화번호 관리</h2>
            <button className="close-btn" onClick={onClose}>닫기</button>
          </div>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>데이터를 불러오는 중...</p>
            <div className="excel-upload-section" style={{ marginTop: '30px' }}>
              <input
                ref={fileInputRefLoading}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="excel-upload-btn"
                onClick={() => {
                  if (!uploading && fileInputRefLoading.current) {
                    fileInputRefLoading.current.click();
                  }
                }}
                disabled={uploading}
              >
                📂 엑셀 파일 업로드
              </button>
              <span className="excel-upload-note">
                엑셀 파일 형식: 5행이 헤더(학생명, 학교, 학년, 학생핸드폰, 부모핸드폰 등), 6행부터 데이터
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="student-phone-manager-page">
      <div className="student-phone-manager-container">
        <div className="student-phone-manager-header">
          <div>
            <h2>📞 학생 전화번호 관리</h2>
            <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '0.9rem' }}>
              총 {students.length}명
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>닫기</button>
        </div>
        
        <div className="student-phone-manager-description">
          <div className="excel-upload-section" style={{ marginBottom: '20px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="excel-upload-btn"
              onClick={() => {
                if (!uploading && fileInputRef.current) {
                  fileInputRef.current.click();
                }
              }}
              disabled={uploading}
            >
              {uploading ? '📂 엑셀 파일 읽는 중...' : '📂 엑셀 파일 업로드'}
            </button>
            <span className="excel-upload-note">
              엑셀 파일 형식: 헤더 행에 "학생명" 또는 "학생 이름" 컬럼이 있어야 합니다.
            </span>
          </div>
          {permissionErrorLogged.current && (
            <div className="save-message warning" style={{ marginBottom: '15px' }}>
              ⚠️ Firestore 권한이 없습니다. 데이터는 로컬 스토리지에 저장되며, 페이지를 새로고침해도 유지됩니다.
            </div>
          )}
          <p>전체 학원 인원의 전화번호를 중앙에서 관리합니다.</p>
          <p>여기서 입력한 전화번호는 대시보드와 클리닉 대장에서 자동으로 불러와집니다.</p>
          {saveMessage && (
            <div className={`save-message ${saveMessage.includes('✅') ? 'success' : saveMessage.includes('❌') ? 'error' : saveMessage.includes('⚠️') ? 'warning' : 'info'}`}>
              {saveMessage}
            </div>
          )}
        </div>
        
        <div className="student-phone-table-wrapper">
          <table className="student-phone-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>번호</th>
                <th>학생 이름</th>
                <th>학교</th>
                <th>학년</th>
                <th>반명</th>
                <th>학생 전화번호</th>
                <th>학부모 전화번호</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => (
                <tr key={student}>
                  <td style={{ textAlign: 'center', fontWeight: '600', color: '#555' }}>
                    {index + 1}
                  </td>
                  <td className="student-name">{student}</td>
                  <td className="school-cell">
                    <input
                      type="text"
                      className="info-input"
                      placeholder="예) 과천중앙고등학교"
                      value={studentInfo[student]?.school || ''}
                      onChange={(e) => handleStudentInfoChange(student, 'school', e.target.value)}
                    />
                  </td>
                  <td className="grade-cell">
                    <input
                      type="text"
                      className="info-input"
                      placeholder="예) 1학년"
                      value={studentInfo[student]?.grade || ''}
                      onChange={(e) => handleStudentInfoChange(student, 'grade', e.target.value)}
                    />
                  </td>
                  <td className="class-cell">
                    <input
                      type="text"
                      className="info-input"
                      placeholder="예) A반"
                      value={studentInfo[student]?.className || ''}
                      onChange={(e) => handleStudentInfoChange(student, 'className', e.target.value)}
                    />
                  </td>
                  <td className="phone-number-cell">
                    <input
                      type="tel"
                      className="phone-input"
                      placeholder="010-1234-5678"
                      value={(() => {
                        const phone = phoneNumbers[student]?.핸드폰 || phoneNumbers[student]?.학생핸드폰 || phoneNumbers[student]?.student || (typeof phoneNumbers[student] === 'string' ? phoneNumbers[student] : '');
                        return phone ? formatPhoneNumber(phone) : '';
                      })()}
                      onChange={(e) => handlePhoneNumberChange(student, e.target.value, 'student')}
                      maxLength="13"
                    />
                  </td>
                  <td className="phone-number-cell">
                    <input
                      type="tel"
                      className="phone-input"
                      placeholder="010-1234-5678"
                      value={(() => {
                        const phone = phoneNumbers[student]?.부모핸드폰 || phoneNumbers[student]?.학부모핸드폰 || phoneNumbers[student]?.parent || '';
                        return phone ? formatPhoneNumber(phone) : '';
                      })()}
                      onChange={(e) => handlePhoneNumberChange(student, e.target.value, 'parent')}
                      maxLength="13"
                    />
                  </td>
                  <td className="remove-student-cell">
                    <button
                      className="remove-btn"
                      onClick={() => handleRemoveStudent(student)}
                      title="삭제"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {/* 학생 추가 행 */}
              <tr className="add-student-row">
                <td style={{ textAlign: 'center', color: '#999' }}>
                  {students.length + 1}
                </td>
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
                <td>
                  <input
                    type="text"
                    className="new-student-input"
                    placeholder="학교"
                    value={newStudentSchool}
                    onChange={(e) => setNewStudentSchool(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddStudent();
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="new-student-input"
                    placeholder="학년"
                    value={newStudentGrade}
                    onChange={(e) => setNewStudentGrade(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddStudent();
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="new-student-input"
                    placeholder="반명"
                    value={newStudentClassName}
                    onChange={(e) => setNewStudentClassName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddStudent();
                      }
                    }}
                  />
                </td>
                <td colSpan="3">
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
        
        <div className="student-phone-manager-footer">
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '저장 중...' : '💾 저장하기'}
          </button>
          <p className="footer-note">
            * 변경사항은 자동으로 저장됩니다. 수동 저장 버튼은 즉시 저장이 필요할 때 사용하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

