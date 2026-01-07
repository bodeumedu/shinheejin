import { useState, useEffect, useMemo } from 'react'
import './WeeklyScheduleInput.css'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../../../utils/firebase'

// 월요일 기준으로 주차 계산 (연도와 주차 번호)
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
  return { year, week: weekNumber };
}

// 주차 키 생성 (예: "2024_week_1")
function getWeekKey(date = new Date()) {
  const { year, week } = getWeekNumber(date);
  return `${year}_week_${week}`;
}

// 주차 키에서 다음 주차 키 계산 (다음 8주차까지)
function getNextWeekKeys(weekKey, count = 8) {
  const match = weekKey.match(/(\d{4})_week_(\d+)/);
  if (!match) return [];
  
  const year = parseInt(match[1]);
  let week = parseInt(match[2]);
  const nextWeekKeys = [];
  
  for (let i = 1; i <= count; i++) {
    week += 1;
    // 52주차를 넘어가면 다음 해 1주차로
    if (week > 52) {
      week = 1;
      const nextYear = year + 1;
      nextWeekKeys.push(`${nextYear}_week_${week}`);
    } else {
      nextWeekKeys.push(`${year}_week_${week}`);
    }
  }
  
  return nextWeekKeys;
}

// localStorage에서 입력된 모든 주차 키 추출
function getStoredWeekKeys() {
  const weekKeys = new Set();
  try {
    // localStorage의 모든 키를 순회
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('weeklySchedule_')) {
        // weeklySchedule_2025_week_50_고2 형식에서 weekKey 추출
        // 또는 weeklySchedule_2025_week_50_ 형식도 처리
        const match = key.match(/weeklySchedule_(\d{4}_week_\d+)_(초6|중1|중2|중3|고1|고2|고3|학년무관|)$/);
        if (match && match[1]) {
          weekKeys.add(match[1]); // 2025_week_50
        }
      }
    }
    console.log('📋 저장된 주차 키:', Array.from(weekKeys));
  } catch (error) {
    console.warn('저장된 주차 키 추출 실패:', error);
  }
  return Array.from(weekKeys);
}

// 주차 키에서 날짜 정보 추출
function getWeekInfoFromKey(weekKey) {
  const match = weekKey.match(/(\d{4})_week_(\d+)/);
  if (!match) return null;
  
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  
  // 해당 주차의 월요일 날짜 계산
  const jan1 = new Date(year, 0, 1);
  const daysOffset = (week - 1) * 7;
  const monday = new Date(jan1);
  monday.setDate(jan1.getDate() + daysOffset - jan1.getDay() + 1);
  
  return {
    year,
    week,
    monday,
    weekKey
  };
}

// 주차 목록 생성 (입력된 주차 + 전 4주 + 현재 주차 + 앞 12주)
function getWeekOptions() {
  const options = [];
  const today = new Date();
  const weekKeySet = new Set();
  
  // 1. 입력된 주차 추가 (localStorage에서 추출)
  const storedWeekKeys = getStoredWeekKeys();
  storedWeekKeys.forEach(weekKey => {
    const weekInfo = getWeekInfoFromKey(weekKey);
    if (weekInfo) {
      const mondayStr = `${weekInfo.monday.getMonth() + 1}/${weekInfo.monday.getDate()}`;
      options.push({
        key: weekKey,
        label: `${weekInfo.year}년 ${weekInfo.week}주차 (${mondayStr}~) [저장됨]`,
        isCurrent: false,
        isStored: true,
        date: weekInfo.monday
      });
      weekKeySet.add(weekKey);
    }
  });
  
  // 2. 전 20주 (과거) - 더 넓은 범위로 확장
  for (let i = 20; i >= 1; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - (i * 7));
    const { year, week } = getWeekNumber(date);
    const weekKey = `${year}_week_${week}`;
    
    // 이미 추가된 주차는 건너뛰기
    if (weekKeySet.has(weekKey)) continue;
    
    const monday = new Date(date);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    const mondayStr = `${monday.getMonth() + 1}/${monday.getDate()}`;
    options.push({
      key: weekKey,
      label: `${year}년 ${week}주차 (${mondayStr}~)`,
      isCurrent: false,
      isStored: false,
      date: monday
    });
    weekKeySet.add(weekKey);
  }
  
  // 3. 현재 주차
  const { year, week } = getWeekNumber(today);
  const weekKey = `${year}_week_${week}`;
  if (!weekKeySet.has(weekKey)) {
    const monday = new Date(today);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    const mondayStr = `${monday.getMonth() + 1}/${monday.getDate()}`;
    options.push({
      key: weekKey,
      label: `${year}년 ${week}주차 (${mondayStr}~) [현재]`,
      isCurrent: true,
      isStored: false,
      date: monday
    });
    weekKeySet.add(weekKey);
  }
  
  // 4. 앞 20주 (미래) - 더 넓은 범위로 확장
  for (let i = 1; i <= 20; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + (i * 7));
    const { year: futureYear, week: futureWeek } = getWeekNumber(date);
    const futureWeekKey = `${futureYear}_week_${futureWeek}`;
    
    // 이미 추가된 주차는 건너뛰기
    if (weekKeySet.has(futureWeekKey)) continue;
    
    const futureMonday = new Date(date);
    const futureDay = futureMonday.getDay();
    const futureDiff = futureMonday.getDate() - futureDay + (futureDay === 0 ? -6 : 1);
    futureMonday.setDate(futureDiff);
    const futureMondayStr = `${futureMonday.getMonth() + 1}/${futureMonday.getDate()}`;
    options.push({
      key: futureWeekKey,
      label: `${futureYear}년 ${futureWeek}주차 (${futureMondayStr}~)`,
      isCurrent: false,
      isStored: false,
      date: futureMonday
    });
    weekKeySet.add(futureWeekKey);
  }
  
  // 날짜 순으로 정렬
  options.sort((a, b) => {
    if (a.date && b.date) {
      return a.date.getTime() - b.date.getTime();
    }
    return 0;
  });
  
  return options;
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const GRADE_OPTIONS = ['', '초6', '중1', '중2', '중3', '고1', '고2', '고3'];

function WeeklyScheduleInput({ onProcess }) {
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  
  // 현재 주차 키
  const currentWeekKey = getWeekKey();
  const [weekOptions, setWeekOptions] = useState(() => getWeekOptions());
  const [selectedWeek, setSelectedWeek] = useState(currentWeekKey);
  const [selectedGrade, setSelectedGrade] = useState(''); // 선택된 학년
  
  // 주차 옵션 업데이트 함수
  const updateWeekOptions = () => {
    const newOptions = getWeekOptions();
    setWeekOptions(newOptions);
    console.log('📅 주차 옵션 업데이트:', newOptions.length, '개');
  };
  
  // 주차 옵션 업데이트 (localStorage 변경 시)
  useEffect(() => {
    // 컴포넌트 마운트 시 및 주기적으로 업데이트
    updateWeekOptions();
    const interval = setInterval(updateWeekOptions, 3000); // 3초마다 업데이트
    
    return () => clearInterval(interval);
  }, []);
  
  // 주차별 학년별 데이터 저장 키
  const storageKey = `weeklySchedule_${selectedWeek}_${selectedGrade}`;

  // 표 데이터를 파싱하는 함수
  const parseTableData = (text) => {
    const lines = text.split('\n').filter(line => line.trim())
    const classes = []

    // 각 줄을 파싱하여 클래스 정보 추출
    for (const line of lines) {
      // 탭으로 분리 (표 데이터는 탭으로 구분됨)
      let parts = line.split('\t')
      
      // 빈 항목도 포함하여 항상 12개 열 유지
      while (parts.length < 12) {
        parts.push('')
      }
      
      // trim 처리 (빈 문자열도 유지)
      parts = parts.map(p => (p || '').trim())
      
      // 최소한 과목, 학년, 강사, 캠퍼스, 요일, 시간이 있어야 함
      const hasRequiredFields = parts[0] && parts[1] && parts[2] && parts[3] && parts[4] && parts[5]
      
      if (hasRequiredFields) {
        // 과목, 학년, 강사, 캠퍼스, 요일, 시간, 강좌명, 설명, 개강 날짜, 강의실, 교습비, 비고
        const classData = {
          subject: parts[0] || '',
          grade: parts[1] || '',
          instructor: parts[2] || '',
          campus: parts[3] || '',
          days: parts[4] || '',
          time: parts[5] || '',
          courseName: parts[6] || parts[0] || '', // 강좌명이 없으면 과목명 사용
          description: parts[7] || '',
          startDate: parts[8] || '',
          classroom: parts[9] || '',
          tuition: parts[10] || '', // 교습비
          note: parts[11] || '' // 비고
        }
        
        // 시간 형식 확인 (더 유연하게 처리: - 또는 ~, 공백 유무 상관없이)
        // 패턴: "13:00~14:30" 또는 "13:00-14:30" 또는 "13:00 ~ 14:30" 등 모든 형식 허용
        // \s*는 0개 이상의 공백을 의미하므로 공백이 없어도 매칭됨
        const timePattern = /\d{1,2}:\d{2}\s*[-~]\s*\d{1,2}:\d{2}/
        
        // 시간 형식 검증 (trim 처리)
        const hasValidTime = classData.time && timePattern.test(classData.time.trim())
        
        // 기본 필수 정보 확인 (과목, 학년, 강사) - 요일은 필수가 아님
        // 학년은 "중등" 같은 값도 허용
        const hasRequiredInfo = classData.subject && classData.grade && classData.instructor
        
        // 시간 형식이 맞거나, 필수 정보가 있으면 포함 (학년은 "중등" 같은 값도 허용)
        if (hasValidTime || hasRequiredInfo) {
          classes.push(classData)
          if (!hasValidTime && classData.time) {
            console.warn('시간 형식이 정확하지 않지만 포함:', {
              time: classData.time,
              timePatternTest: timePattern.test(classData.time.trim()),
              classData
            })
          }
        } else {
          console.warn('파싱 제외된 데이터 (필수 정보 부족):', {
            subject: classData.subject,
            grade: classData.grade,
            instructor: classData.instructor,
            fullData: classData
          })
        }
      }
    }

    console.log(`파싱된 수업 개수: ${classes.length}개`)
    return classes
  }

  // 시간 문자열을 시작/종료 시간으로 변환 (예: "15:30-17:30" 또는 "13:00~14:30" -> {start: "15:30", end: "17:30"})
  const parseTimeRange = (timeStr) => {
    if (!timeStr) return null
    
    // - 또는 ~ 구분자 허용 (공백 없이도 처리)
    // 먼저 공백 포함 패턴 시도
    let match = timeStr.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/)
    
    // 공백 포함 패턴이 안 되면 공백 없이 시도
    if (!match) {
      match = timeStr.match(/(\d{1,2}):(\d{2})[-~](\d{1,2}):(\d{2})/)
    }
    
    if (match) {
      return {
        start: `${match[1].padStart(2, '0')}:${match[2]}`,
        end: `${match[3].padStart(2, '0')}:${match[4]}`
      }
    }
    
    console.warn('시간 범위 파싱 실패:', timeStr)
    return null
  }

  // 요일 문자열을 배열로 변환 (예: "월금" -> ["월", "금"])
  const parseDays = (daysStr) => {
    const dayMap = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 7 }
    const days = []
    for (const char of daysStr) {
      if (dayMap[char]) {
        days.push(dayMap[char])
      }
    }
    return days
  }

  const extractTableData = () => {
    // contentEditable 테이블에서 데이터 추출
    const table = document.querySelector('.schedule-input-table')
    if (!table) return ''
    
    const rows = table.querySelectorAll('tbody tr')
    const data = Array.from(rows)
      .filter(row => {
        // 빈 행 제외 (모든 셀이 비어있지 않은 행만)
        const cells = row.querySelectorAll('td')
        return Array.from(cells).some(cell => {
          const select = cell.querySelector('select');
          if (select) {
            return select.value.trim().length > 0;
          }
          return cell.textContent.trim().length > 0;
        })
      })
      .map(row => {
        const cells = row.querySelectorAll('td')
        // 항상 12개 열을 유지하면서 빈 값도 포함
        const cellValues = Array.from(cells).map((cell) => {
          // 셀 내용에서 줄바꿈을 공백으로 치환 (탭 구분 데이터 형식 유지)
          let cellText = cell.textContent || '';
          // 줄바꿈 문자를 공백으로 치환 (여러 줄바꿈도 하나의 공백으로)
          cellText = cellText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
          return cellText;
        });
        while (cellValues.length < 12) {
          cellValues.push('')
        }
        return cellValues.slice(0, 12).join('\t')
      })
      .join('\n')
    
    console.log('추출된 테이블 데이터:', data)
    console.log('행 개수:', data.split('\n').length)
    return data
  }

  // 주차별 학년별 데이터 불러오기
  useEffect(() => {
    if (!selectedGrade) {
      // 학년이 선택되지 않았으면 빈 표만 표시
      const tbody = document.querySelector('.schedule-input-table tbody');
      if (tbody) {
        tbody.innerHTML = '';
        const emptyRow = document.createElement('tr');
        for (let i = 0; i < 12; i++) {
          const cell = document.createElement('td');
          cell.className = 'empty-cell';
          emptyRow.appendChild(cell);
        }
        tbody.appendChild(emptyRow);
      }
      return;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        // 저장된 테이블 데이터를 표에 복원
        if (data.tableData) {
          const tbody = document.querySelector('.schedule-input-table tbody');
          if (tbody) {
            tbody.innerHTML = '';
            const lines = data.tableData.split('\n').filter(line => line.trim());
            lines.forEach((line) => {
              // 탭으로 분리할 때 줄바꿈이 포함된 경우를 처리
              const cells = line.split('\t').map(cell => {
                // 셀 내용에서 줄바꿈을 공백으로 치환
                return cell.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
              });
              const newRow = document.createElement('tr');
              
              for (let i = 0; i < 12; i++) {
                const cell = document.createElement('td');
                if (cells[i]) {
                  cell.textContent = cells[i];
                }
                newRow.appendChild(cell);
              }
              
              tbody.appendChild(newRow);
            });
            
            // 빈 행 하나 추가
            if (lines.length === 0) {
              const emptyRow = document.createElement('tr');
              for (let i = 0; i < 12; i++) {
                const cell = document.createElement('td');
                cell.className = 'empty-cell';
                emptyRow.appendChild(cell);
              }
              tbody.appendChild(emptyRow);
            }
          }
        }
      } else {
        // 저장된 데이터가 없으면 빈 행 하나만 표시
        const tbody = document.querySelector('.schedule-input-table tbody');
        if (tbody) {
          tbody.innerHTML = '';
          const emptyRow = document.createElement('tr');
          for (let i = 0; i < 12; i++) {
            const cell = document.createElement('td');
            cell.className = 'empty-cell';
            emptyRow.appendChild(cell);
          }
          tbody.appendChild(emptyRow);
        }
      }
    } catch (error) {
      console.warn('주차별 학년별 데이터 불러오기 실패:', error);
    }
  }, [selectedWeek, selectedGrade, storageKey]);

  // 주차/학년 변경 시 자동 저장
  useEffect(() => {
    if (!selectedGrade) return;
    const tableData = extractTableData();
    if (tableData.trim()) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ tableData }));
      } catch (error) {
        console.warn('주차별 학년별 데이터 저장 실패:', error);
      }
    }
  }, [selectedWeek, selectedGrade, storageKey]);

  // 모든 학년이 입력되었는지 확인
  const checkAllGradesCompleted = () => {
    const requiredGrades = ['초6', '중1', '중2', '중3', '고1', '고2', '고3'];
    const weekKey = selectedWeek;
    
    for (const grade of requiredGrades) {
      const gradeStorageKey = `weeklySchedule_${weekKey}_${grade}`;
      const stored = localStorage.getItem(gradeStorageKey);
      if (!stored) {
        return false;
      }
      try {
        const data = JSON.parse(stored);
        if (!data.tableData || !data.tableData.trim()) {
          return false;
        }
        const lines = data.tableData.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          return false;
        }
      } catch (error) {
        return false;
      }
    }
    return true;
  };

  const handleProcess = async () => {
    if (!selectedGrade) {
      alert('학년을 선택해주세요.')
      return
    }

    // 표에서 데이터 추출
    const tableData = extractTableData()
    
    if (!tableData.trim() || tableData.split('\n').filter(line => line.trim()).length === 0) {
      alert('시간표 데이터를 입력해주세요.')
      return
    }

    setIsProcessing(true)
    try {
      // 주차별 학년별 데이터 저장 (localStorage + Firebase)
      try {
        // 현재 주차 저장
        localStorage.setItem(storageKey, JSON.stringify({ tableData }));
        console.log('✅ localStorage에 저장 완료:', storageKey);
        
        // 다음 8주차까지 자동 복사 (현재 주차에 입력된 모든 학년 데이터를 각각 복사)
        const nextWeekKeys = getNextWeekKeys(selectedWeek, 8);
        const allGrades = ['초6', '중1', '중2', '중3', '고1', '고2', '고3'];
        let totalCopiedCount = 0;
        let totalSkippedCount = 0;
        
        // 현재 주차에 입력된 모든 학년 데이터 확인
        const currentWeekData = {};
        for (const grade of allGrades) {
          const currentStorageKey = `weeklySchedule_${selectedWeek}_${grade}`;
          const currentData = localStorage.getItem(currentStorageKey);
          if (currentData) {
            try {
              const parsed = JSON.parse(currentData);
              if (parsed.tableData && parsed.tableData.trim()) {
                currentWeekData[grade] = parsed.tableData;
                console.log(`📋 현재 주차 ${selectedWeek} ${grade} 데이터 확인됨`);
              }
            } catch (error) {
              console.warn(`현재 주차 ${grade} 데이터 파싱 실패:`, error);
            }
          }
        }
        
        // 현재 입력한 학년 데이터도 포함
        if (tableData && tableData.trim()) {
          currentWeekData[selectedGrade] = tableData;
        }
        
        // 다음 주차에 각 학년별로 복사
        for (const nextWeekKey of nextWeekKeys) {
          for (const grade of allGrades) {
            // 현재 주차에 해당 학년 데이터가 없으면 건너뛰기
            if (!currentWeekData[grade]) {
              continue;
            }
            
            const nextStorageKey = `weeklySchedule_${nextWeekKey}_${grade}`;
            // 이미 데이터가 있는 주차는 건너뛰기 (덮어쓰지 않음)
            const existingData = localStorage.getItem(nextStorageKey);
            if (existingData) {
              console.log(`⏭️ ${nextWeekKey} 주차 ${grade}는 이미 데이터가 있어 건너뜀`);
              totalSkippedCount++;
              continue;
            }
            
            // 다음 주차에 같은 학년 데이터 복사
            localStorage.setItem(nextStorageKey, JSON.stringify({ tableData: currentWeekData[grade] }));
            console.log(`📋 ${nextWeekKey} 주차 ${grade}에 복사 완료`);
            totalCopiedCount++;
          }
        }
        
        if (totalCopiedCount > 0) {
          console.log(`✅ 다음 ${nextWeekKeys.length}개 주차에 총 ${totalCopiedCount}개 학년 데이터 자동 복사 완료`);
        }
        if (totalSkippedCount > 0) {
          console.log(`⏭️ ${totalSkippedCount}개 학년 데이터는 이미 있어 건너뜀`);
        }
        
        // Firebase에도 저장 (누구나 볼 수 있게)
        console.log('🔍 Firebase 설정 확인 중...');
        console.log('  - isFirebaseConfigured():', isFirebaseConfigured());
        console.log('  - db:', db ? '존재' : '없음');
        
        if (isFirebaseConfigured() && db) {
          // 현재 주차 Firebase 저장
          const firestoreDocId = `weeklySchedule_${selectedWeek}_${selectedGrade}`;
          const docRef = doc(db, 'weeklySchedules', firestoreDocId);
          
          console.log('📤 Firebase에 저장 시도:', firestoreDocId);
          
          try {
            await setDoc(docRef, {
              weekKey: selectedWeek,
              grade: selectedGrade,
              tableData: tableData,
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString()
            }, { merge: true });
            console.log('✅ Firebase에 주간시간표 저장 완료:', firestoreDocId);
            
            // 다음 8주차까지 Firebase에도 복사 (현재 주차에 입력된 모든 학년 데이터를 각각 복사)
            let firebaseCopiedCount = 0;
            for (const nextWeekKey of nextWeekKeys) {
              for (const grade of allGrades) {
                // 현재 주차에 해당 학년 데이터가 없으면 건너뛰기
                if (!currentWeekData[grade]) {
                  continue;
                }
                
                const nextFirestoreDocId = `weeklySchedule_${nextWeekKey}_${grade}`;
                const nextDocRef = doc(db, 'weeklySchedules', nextFirestoreDocId);
                
                // Firebase에서 기존 데이터 확인
                const existingDoc = await getDoc(nextDocRef);
                if (existingDoc.exists()) {
                  console.log(`⏭️ Firebase ${nextWeekKey} 주차 ${grade}는 이미 데이터가 있어 건너뜀`);
                  continue;
                }
                
                // 다음 주차에 같은 학년 데이터 복사
                await setDoc(nextDocRef, {
                  weekKey: nextWeekKey,
                  grade: grade,
                  tableData: currentWeekData[grade],
                  updatedAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                  copiedFrom: selectedWeek // 복사된 주차 정보 저장
                }, { merge: true });
                console.log(`📋 Firebase ${nextWeekKey} 주차 ${grade}에 복사 완료`);
                firebaseCopiedCount++;
              }
            }
            
            if (firebaseCopiedCount > 0) {
              console.log(`✅ Firebase 다음 ${nextWeekKeys.length}개 주차에 총 ${firebaseCopiedCount}개 학년 데이터 자동 복사 완료`);
            }
            
            const message = totalCopiedCount > 0 || firebaseCopiedCount > 0
              ? `✅ 저장 완료!\n- 로컬 저장: 성공\n- Firebase 저장: 성공\n- 다음 ${nextWeekKeys.length}개 주차에 총 ${totalCopiedCount}개 학년 데이터 자동 복사 완료\n\n다른 기기에서도 확인할 수 있습니다.`
              : `✅ 저장 완료!\n- 로컬 저장: 성공\n- Firebase 저장: 성공\n\n다른 기기에서도 확인할 수 있습니다.`;
            alert(message);
            // 저장 완료 후 주차 옵션 업데이트 (새로 입력된 주차가 드롭다운에 표시되도록)
            updateWeekOptions();
          } catch (firebaseError) {
            console.error('❌ Firebase 저장 실패:', firebaseError);
            console.error('  - 에러 코드:', firebaseError.code);
            console.error('  - 에러 메시지:', firebaseError.message);
            const message = totalCopiedCount > 0
              ? `⚠️ 저장 완료 (일부 실패)\n- 로컬 저장: 성공\n- 다음 ${nextWeekKeys.length}개 주차에 총 ${totalCopiedCount}개 학년 데이터 자동 복사 완료\n- Firebase 저장: 실패\n\n에러: ${firebaseError.message}\n\n이 컴퓨터에서만 저장되었습니다.`
              : `⚠️ 저장 완료 (일부 실패)\n- 로컬 저장: 성공\n- Firebase 저장: 실패\n\n에러: ${firebaseError.message}\n\n이 컴퓨터에서만 저장되었습니다.`;
            alert(message);
            // 저장 완료 후 주차 옵션 업데이트 (새로 입력된 주차가 드롭다운에 표시되도록)
            updateWeekOptions();
          }
        } else {
          console.warn('⚠️ Firebase가 설정되지 않았습니다.');
          console.warn('  - 환경 변수를 확인하세요:');
          console.warn('    VITE_FIREBASE_API_KEY');
          console.warn('    VITE_FIREBASE_AUTH_DOMAIN');
          console.warn('    VITE_FIREBASE_PROJECT_ID');
          const message = totalCopiedCount > 0
            ? `⚠️ Firebase 설정이 없습니다.\n\n로컬 저장만 완료되었습니다.\n다음 ${nextWeekKeys.length}개 주차에 총 ${totalCopiedCount}개 학년 데이터 자동 복사 완료.\n다른 기기에서 보려면 Firebase 환경 변수를 설정해야 합니다.`
            : `⚠️ Firebase 설정이 없습니다.\n\n로컬 저장만 완료되었습니다.\n다른 기기에서 보려면 Firebase 환경 변수를 설정해야 합니다.`;
          alert(message);
          // 저장 완료 후 주차 옵션 업데이트 (새로 입력된 주차가 드롭다운에 표시되도록)
          updateWeekOptions();
        }
      } catch (error) {
        console.error('❌ 주차별 학년별 데이터 저장 실패:', error);
        alert(`❌ 저장 실패: ${error.message}`);
      }

      const classes = parseTableData(tableData)
      
      if (classes.length === 0) {
        alert('시간표 데이터를 파싱할 수 없습니다. 탭으로 구분된 표 형식을 확인해주세요.')
        setIsProcessing(false)
        return
      }

      // 각 클래스를 처리하여 시간표 그리드용 데이터로 변환
      const scheduleData = classes.map(cls => {
        const timeRange = parseTimeRange(cls.time)
        const days = parseDays(cls.days)
        // 강의실 번호 추출 (숫자만 추출)
        const classroomMatch = cls.classroom.match(/\d+/)
        const classroomNum = classroomMatch ? parseInt(classroomMatch[0]) : 0

        return {
          ...cls,
          timeRange,
          days,
          classroomNum,
          // 강의실 번호가 1-21 범위에 있어야 함
          displayClassroom: (classroomNum > 0 && classroomNum <= 21) ? classroomNum : null
        }
      }).filter(cls => cls.displayClassroom !== null) // 유효한 강의실이 있는 수업만 포함

      // 모든 학년이 완료되었는지 확인
      if (checkAllGradesCompleted()) {
        alert('✅ 완료!\n초6, 중1, 중2, 중3, 고1, 고2, 고3 모든 학년의 시간표가 입력되었습니다!')
      }

      // 주차 정보와 함께 전달
      onProcess(scheduleData, selectedGrade, selectedWeek)
    } catch (error) {
      console.error('시간표 처리 오류:', error)
      alert('시간표 처리 중 오류가 발생했습니다: ' + error.message)
    } finally {
      setIsProcessing(false)
    }
  }


  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain')
    
    // HTML 테이블 데이터인 경우 파싱
    if (pastedData.includes('<table') || pastedData.includes('<TABLE')) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(pastedData, 'text/html')
      const table = doc.querySelector('table')
      
      if (table) {
        const rows = table.querySelectorAll('tbody tr, tr')
        const tbody = document.querySelector('.schedule-input-table tbody')
        
        if (tbody) {
          tbody.innerHTML = '' // 기존 행 제거
          
          rows.forEach((row, rowIdx) => {
            // 헤더 행은 제외
            if (row.parentElement?.tagName === 'THEAD') return
            
            const cells = row.querySelectorAll('td, th')
            const newRow = document.createElement('tr')
            
            // 12개 열 생성
            for (let i = 0; i < 12; i++) {
              const cell = document.createElement('td')
              if (cells[i]) {
                cell.textContent = cells[i].textContent.trim();
              }
              newRow.appendChild(cell)
            }
            
            tbody.appendChild(newRow)
          })
          
          // inputText 상태 업데이트 (표시용)
          const newTableData = extractTableData()
          setInputText(newTableData)
          handleTableChange();
        }
        return
      }
    }
    
    // 일반 텍스트인 경우 (탭으로 구분된 데이터)
    const textData = e.clipboardData.getData('text/plain')
    const lines = textData.split('\n').filter(line => line.trim())
    const tbody = document.querySelector('.schedule-input-table tbody')
    
    if (tbody) {
      tbody.innerHTML = '' // 기존 행 제거
      
      lines.forEach((line) => {
        // 탭으로 분리할 때 줄바꿈이 포함된 경우를 처리
        const cells = line.split('\t').map(cell => {
          // 셀 내용에서 줄바꿈을 공백으로 치환
          return cell.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
        });
        const newRow = document.createElement('tr')
        
        // 12개 열 생성
        for (let i = 0; i < 12; i++) {
          const cell = document.createElement('td')
          if (cells[i]) {
            cell.textContent = cells[i];
          }
          newRow.appendChild(cell)
        }
        
        tbody.appendChild(newRow)
      })
      
      setInputText(textData)
      handleTableChange();
    }
  }

  // 테이블 데이터 변경 시 자동 저장
  const handleTableChange = () => {
    const tableData = extractTableData();
    if (tableData.trim()) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ tableData }));
      } catch (error) {
        console.warn('주차별 데이터 저장 실패:', error);
      }
    }
  };

  return (
    <div className="weekly-schedule-input">
      <div className="input-header">
        <h2>주간시간표 만들기</h2>
        <p className="input-description">
          주차를 선택하고 표를 복사하여 아래 입력란에 붙여넣으세요. (Ctrl+V 또는 Cmd+V)
        </p>
        <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontWeight: '600', fontSize: '1rem' }}>
              주차 선택:
            </label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '1rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              {weekOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontWeight: '600', fontSize: '1rem' }}>
              학년 선택:
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '1rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="">학년 선택</option>
              {GRADE_OPTIONS.slice(1).map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="input-section">
        <div className="table-input-container">
          <table 
            className="schedule-input-table" 
            contentEditable 
            suppressContentEditableWarning 
            onPaste={handlePaste} 
            onInput={handleTableChange}
          >
            <thead>
              <tr>
                <th>과목</th>
                <th>학년</th>
                <th>강사</th>
                <th>캠퍼스</th>
                <th>요일</th>
                <th>시간</th>
                <th>강좌명</th>
                <th>설명</th>
                <th>개강 날짜</th>
                <th>강의실</th>
                <th>교습비</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {Array.from({ length: 12 }, (_, idx) => (
                  <td key={idx} className="empty-cell"></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="input-actions">
        <button
          className="process-btn"
          onClick={handleProcess}
          disabled={isProcessing}
        >
          {isProcessing ? '처리 중...' : '시간표 생성'}
        </button>
      </div>
    </div>
  )
}

export default WeeklyScheduleInput

