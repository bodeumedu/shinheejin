import { useState, useMemo, useEffect } from 'react'
import './WeeklyScheduleViewer.css'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../../../utils/firebase'
import * as XLSX from 'xlsx'

// 요일 헤더
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const WEEKDAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7]

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

// localStorage에서 입력된 모든 주차 키 추출
function getStoredWeekKeys() {
  const weekKeys = new Set();
  try {
    // localStorage의 모든 키를 순회
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('weeklySchedule_')) {
        // weeklySchedule_2025_week_50_고2 형식에서 weekKey 추출
        const match = key.match(/weeklySchedule_(\d{4}_week_\d+)_(초6|중1|중2|중3|고1|고2|고3|학년무관|)$/);
        if (match && match[1]) {
          weekKeys.add(match[1]); // 2025_week_50
        }
      }
    }
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

// 주차 목록 생성 (입력된 주차 + 전 20주 + 현재 주차 + 앞 20주)
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

// 시간대 생성 (08:00 ~ 23:00, 30분 단위)
const generateTimeSlots = () => {
  const slots = []
  for (let hour = 8; hour <= 23; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`)
    if (hour < 23) {
      slots.push(`${String(hour).padStart(2, '0')}:30`)
    }
  }
  return slots
}

// 색상 팔레트 (다양한 수업 구분 - 연한 색상)
const COLOR_PALETTE = [
  '#FFE5F0', // Very light pink
  '#E0F4FF', // Very light sky blue
  '#E8F8E8', // Very light green
  '#FFF8E0', // Very light yellow
  '#F0E8FF', // Very light purple
  '#FFE8E0', // Very light salmon
  '#E0F5F5', // Very light sea green
  '#FFFACD', // Very light gold
  '#FFE0F0', // Very light hot pink
  '#E0F8F8', // Very light turquoise
  '#FFE0D0', // Very light tomato
  '#E8F8E0', // Very light lime green
  '#E0F0FF', // Very light dodger blue
  '#FFE0F5', // Very light deep pink
  '#E0F8E8', // Very light spring green
  '#F0E8F8', // Very light purple
  '#FFE8D0', // Very light orange
  '#E0F5FF', // Very light sky blue
  '#FFE8E0', // Very light orange red
  '#E8F8E8', // Very light sea green
  '#F5E8FF', // Very light orchid
  '#FFE8E0', // Very light coral
  '#E0E8F8', // Very light steel blue
  '#FFE0E0', // Very light crimson
  '#E0F8E8', // Very light sea green
  '#F0E0FF', // Very light blue violet
  '#FFE0E0', // Very light indian red
  '#E0E8FF', // Very light royal blue
  '#FFE8D0', // Very light orange
  '#E0F8F8', // Very light turquoise
]

// 표 데이터를 파싱하는 함수 (WeeklyScheduleInput과 동일한 로직)
const parseTableData = (text) => {
  const lines = text.split('\n').filter(line => line.trim())
  const classes = []

  for (const line of lines) {
    let parts = line.split('\t')
    while (parts.length < 12) {
      parts.push('')
    }
    parts = parts.map(p => (p || '').trim())
    
    // 최소한 과목, 학년, 강사가 있어야 함 (캠퍼스, 요일, 시간은 선택사항)
    const hasRequiredFields = parts[0] && parts[1] && parts[2]
    
    if (hasRequiredFields) {
      const classData = {
        subject: parts[0] || '',
        grade: parts[1] || '',
        instructor: parts[2] || '',
        campus: parts[3] || '',
        days: parts[4] || '',
        time: parts[5] || '',
        courseName: parts[6] || parts[0] || '',
        description: parts[7] || '',
        startDate: parts[8] || '',
        classroom: parts[9] || '',
        tuition: parts[10] || '',
        note: parts[11] || ''
      }
      
      const timePattern = /\d{1,2}:\d{2}\s*[-~]\s*\d{1,2}:\d{2}/
      const hasValidTime = classData.time && timePattern.test(classData.time.trim())
      const hasRequiredInfo = classData.subject && classData.grade && classData.instructor
      
      // 시간 형식이 맞거나, 필수 정보가 있으면 포함 (학년은 "중등" 같은 값도 허용)
      if (hasValidTime || hasRequiredInfo) {
        classes.push(classData)
      }
    }
  }
  return classes
}

// 시간 문자열을 시작/종료 시간으로 변환
const parseTimeRange = (timeStr) => {
  if (!timeStr) return null
  let match = timeStr.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/)
  if (!match) {
    match = timeStr.match(/(\d{1,2}):(\d{2})[-~](\d{1,2}):(\d{2})/)
  }
  if (match) {
    return {
      start: `${match[1].padStart(2, '0')}:${match[2]}`,
      end: `${match[3].padStart(2, '0')}:${match[4]}`
    }
  }
  return null
}

// 요일 문자열을 배열로 변환
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

// 시간 문자열을 여러 개의 시간으로 파싱
const parseTimeRanges = (timeStr) => {
  if (!timeStr) return []
  // 시간 패턴: "18:00-20:00 13:00~15:00" 같은 형식
  const timePattern = /(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/g
  const times = []
  let match
  while ((match = timePattern.exec(timeStr)) !== null) {
    times.push({
      start: `${match[1].padStart(2, '0')}:${match[2]}`,
      end: `${match[3].padStart(2, '0')}:${match[4]}`,
      original: match[0]
    })
  }
  return times
}


function WeeklyScheduleViewer({ scheduleData, weekKey: initialWeekKey }) {
  const [selectedDay, setSelectedDay] = useState(1) // 월요일부터 시작
  const [hoveredClass, setHoveredClass] = useState(null) // 호버된 수업 정보
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 }) // 툴팁 위치
  const [allScheduleData, setAllScheduleData] = useState([]) // 모든 학년 데이터 합친 결과
  const [cancelledClasses, setCancelledClasses] = useState(new Set()) // 휴강된 수업 ID들
  const [showActionModal, setShowActionModal] = useState(false) // 액션 모달 표시 여부
  const [selectedClass, setSelectedClass] = useState(null) // 선택된 수업 정보
  const [isSendingKakao, setIsSendingKakao] = useState(false) // 카카오톡 전송 중 여부
  const [showStudentUploadModal, setShowStudentUploadModal] = useState(false) // 학생 정보 업로드 모달
  const [showTemplateCodeModal, setShowTemplateCodeModal] = useState(false) // 카카오톡 템플릿 코드 입력 모달
  const [templateCode, setTemplateCode] = useState('') // 카카오톡 템플릿 코드
  const [studentData, setStudentData] = useState([]) // 학생 정보 목록
  const [selectedWeekKey, setSelectedWeekKey] = useState(initialWeekKey || getWeekKey()) // 선택된 주차
  const [weekOptions, setWeekOptions] = useState(() => getWeekOptions()) // 주차 옵션 목록
  const timeSlots = useMemo(() => generateTimeSlots(), [])
  const currentWeekKey = useMemo(() => getWeekKey(), [])
  
  // 주차 옵션 업데이트 함수
  const updateWeekOptions = () => {
    const newOptions = getWeekOptions();
    setWeekOptions(newOptions);
  };
  
  // 주차 옵션 업데이트 (localStorage 변경 시)
  useEffect(() => {
    updateWeekOptions();
    const interval = setInterval(updateWeekOptions, 3000); // 3초마다 업데이트
    return () => clearInterval(interval);
  }, []);
  
  // 카카오톡 템플릿 코드 불러오기
  useEffect(() => {
    const stored = localStorage.getItem('weeklyScheduleKakaoTemplateCode') || '';
    setTemplateCode(stored);
  }, []);
  
  // 주차 변경 시 초기 weekKey 업데이트
  useEffect(() => {
    if (initialWeekKey) {
      setSelectedWeekKey(initialWeekKey);
    }
  }, [initialWeekKey]);
  
  // 카카오톡 템플릿 코드 저장
  const handleSaveTemplateCode = () => {
    localStorage.setItem('weeklyScheduleKakaoTemplateCode', templateCode.trim());
    alert('✅ 카카오톡 템플릿 코드가 저장되었습니다.');
    setShowTemplateCodeModal(false);
  };
  
  // 학생 정보 불러오기
  useEffect(() => {
    try {
      const stored = localStorage.getItem('weeklyScheduleStudents');
      if (stored) {
        const data = JSON.parse(stored);
        setStudentData(data);
        console.log('학생 정보 불러오기:', data.length, '명');
      }
    } catch (error) {
      console.warn('학생 정보 불러오기 실패:', error);
    }
  }, []);
  
  // 휴강 데이터 실시간 동기화
  useEffect(() => {
    if (selectedWeekKey === currentWeekKey) {
      // 먼저 로컬 스토리지에서 불러오기
      try {
        const localKey = `weeklyScheduleCancellations_${currentWeekKey}`;
        const localData = localStorage.getItem(localKey);
        if (localData) {
          const parsed = JSON.parse(localData);
          setCancelledClasses(new Set(parsed.cancelledClassIds || []));
        }
      } catch (error) {
        console.warn('로컬 스토리지에서 휴강 데이터 불러오기 실패:', error);
      }
      
      // Firebase 실시간 리스너 설정
      if (isFirebaseConfigured() && db) {
        const docRef = doc(db, 'weeklyScheduleCancellations', currentWeekKey);
        
        // 실시간 리스너 등록
        const unsubscribe = onSnapshot(
          docRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              setCancelledClasses(new Set(data.cancelledClassIds || []));
              // 로컬 스토리지에도 저장
              const localKey = `weeklyScheduleCancellations_${currentWeekKey}`;
              localStorage.setItem(localKey, JSON.stringify(data));
              console.log('휴강 데이터 실시간 업데이트:', data);
            } else {
              // 문서가 없으면 빈 Set으로 설정
              setCancelledClasses(new Set());
            }
          },
          (error) => {
            // 권한 오류는 무시 (로컬 스토리지 사용)
            if (error.code !== 'permission-denied') {
              console.warn('Firebase 실시간 리스너 오류:', error);
            }
          }
        );
        
        // 컴포넌트 언마운트 시 리스너 해제
        return () => {
          unsubscribe();
        };
      }
    }
  }, [selectedWeekKey, currentWeekKey]);

  // 주차별 모든 학년 데이터 불러오기 및 합치기 (실시간 동기화)
  useEffect(() => {
    if (!selectedWeekKey) {
      // weekKey가 없으면 기존 scheduleData만 사용
      setAllScheduleData(scheduleData || [])
      return
    }
    
    const requiredGrades = ['초6', '중1', '중2', '중3', '고1', '고2', '고3', '학년무관'];
    // 학년별로 데이터를 Map에 저장 (같은 학년이면 덮어쓰기)
    const gradeDataMap = new Map();
    const unsubscribes = [];
    
    // 데이터를 합치고 업데이트하는 함수
    const updateAllScheduleData = () => {
      // scheduleData가 있으면 해당 학년의 데이터를 대체
      if (scheduleData && scheduleData.length > 0) {
        const currentGrade = scheduleData[0]?.grade;
        if (currentGrade) {
          const scheduleDataWithIds = scheduleData.map(cls => ({
            ...cls,
            classId: cls.classId || `${cls.classroomNum}_${cls.timeRange?.start}_${cls.days?.join(',')}_${cls.subject}_${cls.instructor}`
          }));
          gradeDataMap.set(currentGrade, scheduleDataWithIds);
        }
      }
      
      // Map의 모든 값을 배열로 합치기
      const allData = [];
      gradeDataMap.forEach((classes, grade) => {
        console.log(`[${grade}] 학년별 수업 개수: ${classes.length}개`);
        allData.push(...classes);
      });
      
      console.log(`[전체] 3단계 - 모든 학년 합친 데이터: ${allData.length}개`);
      
      // 중복 제거: 같은 강의실, 시간, 요일, 과목이면 하나만 유지 (과목이 다르면 별도 표시)
      // "학년무관" 데이터는 여러 학년에 중복으로 들어가 있어도 한 번만 표시
      const uniqueDataMap = new Map();
      const duplicateKeys = [];
      allData.forEach(cls => {
        // 과목명 구분: courseName이 있으면 courseName 사용, 없으면 subject 사용
        // "미적분1+ 대수"와 "미적분1 +확통"처럼 같은 subject지만 다른 courseName인 경우를 구분
        const subjectKey = cls.courseName && cls.courseName !== cls.subject ? cls.courseName : cls.subject;
        // 과목(subject/courseName)도 키에 포함하여 같은 강의실/시간/요일이어도 과목이 다르면 별도로 표시
        // "학년무관"의 경우 학년 정보를 무시하고 중복 제거
        const isGradeIrrelevant = cls.grade === '학년무관';
        const key = `${cls.classroomNum}_${cls.timeRange?.start}_${cls.days?.sort().join(',')}_${subjectKey || ''}`;
        
        if (!uniqueDataMap.has(key)) {
          uniqueDataMap.set(key, cls);
        } else {
          const existing = uniqueDataMap.get(key);
          // "학년무관" 데이터가 이미 있으면 유지, 새로 들어온 것도 "학년무관"이면 무시
          if (isGradeIrrelevant && existing.grade === '학년무관') {
            // 둘 다 "학년무관"이면 기존 것 유지
            duplicateKeys.push({
              key,
              기존: existing,
              중복: cls,
              처리: '학년무관 중복 제거'
            });
          } else if (isGradeIrrelevant && existing.grade !== '학년무관') {
            // 기존 것은 특정 학년, 새로 들어온 것은 "학년무관"이면 "학년무관"으로 교체 (모든 학년에 표시)
            uniqueDataMap.set(key, cls);
            duplicateKeys.push({
              key,
              기존: existing,
              중복: cls,
              처리: '학년무관으로 교체'
            });
          } else if (!isGradeIrrelevant && existing.grade === '학년무관') {
            // 기존 것은 "학년무관", 새로 들어온 것은 특정 학년이면 기존 것 유지
            duplicateKeys.push({
              key,
              기존: existing,
              중복: cls,
              처리: '학년무관 유지'
            });
          } else {
            // 둘 다 특정 학년이면 기존 것 유지
            duplicateKeys.push({
              key,
              기존: existing,
              중복: cls,
              처리: '중복 제거'
            });
          }
        }
      });
      
      if (duplicateKeys.length > 0) {
        console.log(`[전체] 4단계 - 중복 제거: ${duplicateKeys.length}개 중복 발견`, duplicateKeys);
      }
      
      const uniqueData = Array.from(uniqueDataMap.values());
      console.log(`[전체] 5단계 - 최종 표시될 수업: ${uniqueData.length}개 (중복 제거 후)`);
      setAllScheduleData(uniqueData);
    };
    
    // 각 학년별로 데이터 파싱하는 함수
    const parseGradeData = (grade, gradeData) => {
      if (gradeData && gradeData.tableData && gradeData.tableData.trim()) {
        const parsedClasses = parseTableData(gradeData.tableData);
        console.log(`[${grade}] 1단계 - 파싱된 원본 데이터: ${parsedClasses.length}개`);
        
        const filteredStats = {
          noTimeRange: 0,
          noDays: 0,
          invalidClassroom: 0,
          valid: 0
        };
        
        // 요일과 시간을 매칭하여 여러 개의 수업으로 분리
        const scheduleClasses = [];
        
        parsedClasses.forEach((cls, clsIdx) => {
          const days = parseDays(cls.days);
          const timeRanges = parseTimeRanges(cls.time);
          const classroomMatch = cls.classroom.match(/\d+/);
          const classroomNum = classroomMatch ? parseInt(classroomMatch[0]) : 0;
          
          // 요일과 시간 개수가 다르면 순서대로 매칭
          // 예: "금일" (2개 요일) + "18:00-20:00 13:00~15:00" (2개 시간)
          // → 금요일+18:00-20:00, 일요일+13:00~15:00
          const maxCount = Math.max(days.length, timeRanges.length);
          
          if (maxCount === 0) {
            // 요일이나 시간이 없으면 필터링 통계만 수집
            if (days.length === 0) {
              filteredStats.noDays++;
              console.warn(`[${grade}] 요일 파싱 실패:`, {
                subject: cls.subject,
                days: cls.days,
                instructor: cls.instructor
              });
            }
            if (timeRanges.length === 0) {
              filteredStats.noTimeRange++;
              console.warn(`[${grade}] 시간 파싱 실패:`, {
                subject: cls.subject,
                time: cls.time,
                instructor: cls.instructor
              });
            }
            return;
          }
          
          // 요일과 시간을 순서대로 매칭
          for (let i = 0; i < maxCount; i++) {
            const day = days[i] || days[0]; // 요일이 부족하면 첫 번째 요일 사용
            const timeRange = timeRanges[i] || timeRanges[0]; // 시간이 부족하면 첫 번째 시간 사용
            
            if (!day || !timeRange) continue;
            
            const classId = `${classroomNum}_${timeRange.start}_${day}_${cls.subject}_${cls.instructor}_${i}`;
            
            // 필터링 통계 수집
            if (classroomNum <= 0 || classroomNum > 22) {
              filteredStats.invalidClassroom++;
              console.warn(`[${grade}] 강의실 번호 잘못됨:`, {
                subject: cls.subject,
                classroom: cls.classroom,
                classroomNum: classroomNum,
                instructor: cls.instructor
              });
            }
            if (day && timeRange && classroomNum > 0 && classroomNum <= 22) {
              filteredStats.valid++;
            }
            
            scheduleClasses.push({
              ...cls,
              timeRange: {
                start: timeRange.start,
                end: timeRange.end
              },
              days: [day], // 단일 요일 배열
              classroomNum,
              classId,
              displayClassroom: (classroomNum > 0 && classroomNum <= 22) ? classroomNum : null
            });
          }
        });
        
        const validClasses = scheduleClasses.filter(cls => cls.displayClassroom !== null);
        
        console.log(`[${grade}] 2단계 - 필터링 결과:`, {
          전체: parsedClasses.length,
          시간없음: filteredStats.noTimeRange,
          요일없음: filteredStats.noDays,
          강의실번호_잘못됨: filteredStats.invalidClassroom,
          유효한_수업: filteredStats.valid,
          최종_표시될_수업: validClasses.length
        });
        
        // 필터링된 항목 상세 로그
        const filteredOut = scheduleClasses.filter(cls => cls.displayClassroom === null);
        if (filteredOut.length > 0) {
          console.warn(`[${grade}] 필터링된 수업 (${filteredOut.length}개):`, filteredOut.map(cls => ({
            subject: cls.subject,
            instructor: cls.instructor,
            grade: cls.grade,
            time: cls.time,
            days: cls.days,
            classroom: cls.classroom,
            classroomNum: cls.classroomNum,
            timeRange: cls.timeRange,
            parsedDays: cls.days,
            필터링_이유: !cls.timeRange ? '시간 파싱 실패' : 
                        (!cls.days || cls.days.length === 0) ? '요일 파싱 실패' :
                        (cls.classroomNum <= 0 || cls.classroomNum > 22) ? '강의실 번호 범위 초과' : '알 수 없음'
          })));
        }
        
        // 특정 수업 검색 (디버깅용)
        const searchClasses = scheduleClasses.filter(cls => 
          cls.subject === '국어' && 
          cls.instructor === '전재림' &&
          cls.grade === '고2'
        );
        if (searchClasses.length > 0) {
          console.log(`[${grade}] 국어 전재림 고2 수업 발견:`, searchClasses.map(cls => ({
            subject: cls.subject,
            instructor: cls.instructor,
            grade: cls.grade,
            time: cls.time,
            timeRange: cls.timeRange,
            days: cls.days,
            parsedDays: cls.days,
            classroom: cls.classroom,
            classroomNum: cls.classroomNum,
            displayClassroom: cls.displayClassroom,
            유효성: cls.displayClassroom !== null ? '유효' : '필터링됨'
          })));
        }
        
        gradeDataMap.set(grade, validClasses);
        updateAllScheduleData();
      } else {
        console.log(`[${grade}] 저장된 데이터 없음`);
        gradeDataMap.set(grade, []);
        updateAllScheduleData();
      }
    };
    
    // 먼저 localStorage에서 모든 학년 데이터 불러오기
    requiredGrades.forEach(grade => {
      const gradeStorageKey = `weeklySchedule_${selectedWeekKey}_${grade}`;
      try {
        const stored = localStorage.getItem(gradeStorageKey);
        if (stored) {
          const gradeData = JSON.parse(stored);
          parseGradeData(grade, gradeData);
        }
      } catch (error) {
        console.warn(`로컬 스토리지에서 학년 ${grade} 데이터 불러오기 실패:`, error);
      }
    });
    
    // Firebase 실시간 리스너 설정 (각 학년별로)
    if (isFirebaseConfigured() && db) {
      requiredGrades.forEach(grade => {
        const firestoreDocId = `weeklySchedule_${selectedWeekKey}_${grade}`;
        const docRef = doc(db, 'weeklySchedules', firestoreDocId);
        
        const unsubscribe = onSnapshot(
          docRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const firestoreData = docSnap.data();
              const gradeData = { tableData: firestoreData.tableData };
              
              // localStorage에도 저장
              const gradeStorageKey = `weeklySchedule_${selectedWeekKey}_${grade}`;
              localStorage.setItem(gradeStorageKey, JSON.stringify(gradeData));
              
              // 데이터 파싱 및 업데이트
              parseGradeData(grade, gradeData);
              console.log(`[실시간] 학년 ${grade} 데이터 업데이트`);
            }
          },
          (error) => {
            if (error.code !== 'permission-denied') {
              console.warn(`Firebase 실시간 리스너 오류 (학년 ${grade}):`, error);
            }
          }
        );
        
        unsubscribes.push(unsubscribe);
      });
    }
    
    // 컴포넌트 언마운트 시 모든 리스너 해제
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [selectedWeekKey, scheduleData]);
  
  // 강의실 번호 및 특수 공간 (1-4, 컨설팅룸, 5-7, 상담실, 8-22)
  const classrooms = useMemo(() => {
    const rooms = []
    // 1-4 강의실
    for (let i = 1; i <= 4; i++) {
      rooms.push(i)
    }
    // 컨설팅룸
    rooms.push('컨설팅룸')
    // 5-7 강의실
    for (let i = 5; i <= 7; i++) {
      rooms.push(i)
    }
    // 상담실
    rooms.push('상담실')
    // 8-22 강의실
    for (let i = 8; i <= 22; i++) {
      rooms.push(i)
    }
    return rooms
  }, [])

  // 전체 표시되는 수업 개수 계산 (디버깅용)
  useEffect(() => {
    if (allScheduleData.length > 0) {
      const totalDisplayed = classrooms.reduce((sum, room) => {
        if (typeof room === 'string') return sum;
        return sum + getClassesForDayAndRoom(selectedDay, room).length;
      }, 0);
      
      console.log(`[화면표시] 선택된 요일(${selectedDay})에 표시되는 총 수업 개수: ${totalDisplayed}개`);
      console.log(`[화면표시] allScheduleData 총 개수: ${allScheduleData.length}개`);
      
      // 요일별 통계
      const dayStats = {};
      for (let day = 1; day <= 7; day++) {
        const dayCount = allScheduleData.filter(cls => cls.days && cls.days.includes(day)).length;
        dayStats[day] = dayCount;
      }
      console.log(`[화면표시] 요일별 수업 개수:`, dayStats);
    }
  }, [allScheduleData, selectedDay, classrooms]);

  // 시간 범위가 겹치는지 확인
  const isTimeOverlapping = (timeRange1, timeRange2) => {
    if (!timeRange1 || !timeRange2) return false
    const start1 = getTimeSlotIndex(timeRange1.start)
    const end1 = getTimeSlotIndex(timeRange1.end)
    const start2 = getTimeSlotIndex(timeRange2.start)
    const end2 = getTimeSlotIndex(timeRange2.end)
    
    // 겹치는 경우: start1 < end2 && start2 < end1
    return start1 < end2 && start2 < end1
  }

  // 특정 요일과 강의실의 수업 찾기 및 겹침 처리
  const getClassesForDayAndRoom = (day, room) => {
    // 특수 공간(컨설팅룸, 상담실)은 수업이 없음
    if (typeof room === 'string') {
      return []
    }
    const classes = allScheduleData.filter(cls => {
      if (!cls.days || !cls.days.includes(day)) return false
      if (!cls.classroomNum || cls.classroomNum !== room) return false
      return true
    })
    
    // 시간순으로 정렬
    const sortedClasses = classes.sort((a, b) => {
      if (!a.timeRange || !b.timeRange) return 0
      const startA = getTimeSlotIndex(a.timeRange.start)
      const startB = getTimeSlotIndex(b.timeRange.start)
      return startA - startB
    })
    
    // 겹치는 수업 그룹 찾기
    const groups = []
    const processed = new Set()
    
    sortedClasses.forEach((cls, idx) => {
      if (processed.has(idx)) return
      
      const group = [cls]
      processed.add(idx)
      
      // 이 수업과 겹치는 다른 수업 찾기
      sortedClasses.forEach((otherCls, otherIdx) => {
        if (idx === otherIdx || processed.has(otherIdx)) return
        if (cls.timeRange && otherCls.timeRange && isTimeOverlapping(cls.timeRange, otherCls.timeRange)) {
          group.push(otherCls)
          processed.add(otherIdx)
        }
      })
      
      groups.push(group)
    })
    
    // 각 그룹에 위치 정보 추가
    const result = []
    groups.forEach((group, groupIdx) => {
      const groupSize = group.length
      group.forEach((cls, clsIdx) => {
        result.push({
          ...cls,
          overlapGroup: groupIdx,
          overlapIndex: clsIdx,
          overlapTotal: groupSize
        })
      })
    })
    
    return result
  }

  // 시간 슬롯 인덱스 계산
  const getTimeSlotIndex = (timeStr) => {
    const [hour, minute] = timeStr.split(':').map(Number)
    const startHour = 8
    const startMinute = 0
    const totalMinutes = (hour - startHour) * 60 + (minute - startMinute)
    return Math.floor(totalMinutes / 30)
  }

  // 시간 블록의 높이와 위치 계산 (겹침 처리 포함)
  const calculateBlockStyle = (timeRange, overlapInfo) => {
    if (!timeRange) {
      // timeRange가 없으면 기본 위치에 작은 블록으로 표시
      return {
        position: 'absolute',
        top: '0px',
        height: '30px', // 기본 높이
        width: 'calc(100% - 4px)',
        margin: '2px',
        borderRadius: '2px',
        padding: '1px',
        fontSize: '0.4rem',
        overflow: 'hidden',
        boxSizing: 'border-box',
        opacity: 0.7 // 약간 투명하게 표시
      }
    }
    
    const startIdx = getTimeSlotIndex(timeRange.start)
    const endIdx = getTimeSlotIndex(timeRange.end)
    const slotHeight = 15 // 각 시간 슬롯의 높이 (px)
    const blockHeight = Math.max((endIdx - startIdx) * slotHeight, 30) // 최소 30px
    const topOffset = startIdx * slotHeight

    // 겹치는 경우 나란히 배치
    let width = 'calc(100% - 4px)'
    let left = '2px'
    
    if (overlapInfo && overlapInfo.overlapTotal > 1) {
      // 겹치는 수업이 여러 개면 나란히 배치
      const totalOverlaps = overlapInfo.overlapTotal
      const overlapIndex = overlapInfo.overlapIndex
      // 각 블록의 너비 계산 (여백 포함)
      const marginBetween = 2 // 블록 사이 간격
      const sideMargin = 2 // 양쪽 여백
      const totalMargin = sideMargin * 2 + marginBetween * (totalOverlaps - 1)
      width = `calc((100% - ${totalMargin}px) / ${totalOverlaps})`
      // left 위치 계산: 각 블록의 시작 위치를 퍼센트로 계산
      const blockWidthPercent = 100 / totalOverlaps
      const leftPercent = overlapIndex * blockWidthPercent
      left = `calc(${leftPercent}% + ${sideMargin}px + ${overlapIndex * marginBetween}px)`
    }

    return {
      position: 'absolute',
      top: `${topOffset}px`,
      height: `${blockHeight}px`,
      width: width,
      left: left,
      margin: '2px',
      borderRadius: '3px',
      padding: '2px',
      fontSize: '0.5rem',
      overflow: 'hidden',
      boxSizing: 'border-box',
      zIndex: overlapInfo && overlapInfo.overlapTotal > 1 ? 10 + overlapInfo.overlapIndex : 1
    }
  }

  // 강사 이름 정규화 (순서 무관하게 같은 강사 조합으로 인식)
  const normalizeInstructorName = (instructor) => {
    if (!instructor) return ''
    // 한글 이름 패턴 추출 (2-3글자 이름)
    const namePattern = /[가-힣]{2,3}/g
    const names = instructor.match(namePattern) || []
    if (names.length >= 2) {
      // 두 명 이상의 이름이 있으면 정렬해서 조합
      return names.sort().join('')
    }
    return instructor
  }

  // 강사 이름에서 개별 강사 이름 추출
  const extractInstructorNames = (instructor) => {
    if (!instructor) return []
    const namePattern = /[가-힣]{2,3}/g
    const names = instructor.match(namePattern) || []
    return names.length >= 2 ? names : [instructor]
  }

  // 수업 색상 할당 (강사별로 일관된 색상 사용)
  const getClassColor = (instructor, index) => {
    if (!instructor) return COLOR_PALETTE[0]
    
    // 정규화된 강사 이름으로 색상 계산
    const normalized = normalizeInstructorName(instructor)
    let hash = 0
    for (let i = 0; i < normalized.length; i++) {
      hash = normalized.charCodeAt(i) + ((hash << 5) - hash)
    }
    const colorIndex = Math.abs(hash) % COLOR_PALETTE.length
    return COLOR_PALETTE[colorIndex]
  }

  // 두 강사가 섞인 경우 그라데이션 색상 생성
  const getGradientColor = (instructor) => {
    const names = extractInstructorNames(instructor)
    if (names.length < 2) {
      // 한 명만 있으면 단색 반환
      return getClassColor(instructor, 0)
    }
    
    // 각 강사의 색상 가져오기
    const color1 = getClassColor(names[0], 0)
    const color2 = getClassColor(names[1], 0)
    
    // 그라데이션 CSS 생성
    return `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`
  }

  // 배경색이 그라데이션인지 확인
  const isGradient = (instructor) => {
    const names = extractInstructorNames(instructor)
    return names.length >= 2
  }

  // 엑셀 파일 업로드 처리
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // 첫 번째 시트 읽기
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // JSON으로 변환
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // 헤더 찾기 (첫 번째 행)
        const headers = jsonData[0] || [];
        console.log('엑셀 헤더:', headers);
        
        // 데이터 파싱 (헤더 다음부터)
        const students = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          // 헤더를 키로 사용하여 객체 생성
          const student = {};
          headers.forEach((header, idx) => {
            if (header) {
              student[header] = row[idx] || '';
            }
          });
          
          // 빈 행 제외
          if (Object.values(student).some(val => val && val.toString().trim())) {
            students.push(student);
          }
        }
        
        console.log('파싱된 학생 정보:', students.length, '명');
        console.log('샘플 데이터:', students[0]);
        
        // 학생 정보 저장
        setStudentData(students);
        localStorage.setItem('weeklyScheduleStudents', JSON.stringify(students));
        
        alert(`✅ 학생 정보 업로드 완료\n\n총 ${students.length}명의 정보가 저장되었습니다.`);
        setShowStudentUploadModal(false);
      } catch (error) {
        console.error('엑셀 파일 파싱 오류:', error);
        alert(`❌ 파일 읽기 실패\n\n${error.message}`);
      }
    };
    
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="weekly-schedule-viewer">
      <div className="viewer-header">
        <h2>주간시간표</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: '500' }}>주차 선택:</label>
            <select
              value={selectedWeekKey}
              onChange={(e) => setSelectedWeekKey(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: '0.9rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer',
                minWidth: '200px'
              }}
            >
              {weekOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            className="day-btn"
            onClick={() => setShowTemplateCodeModal(true)}
            style={{ background: '#3498db', color: 'white', border: 'none' }}
          >
            카카오톡 템플릿 코드 설정
          </button>
          <button
            className="day-btn"
            onClick={() => setShowStudentUploadModal(true)}
            style={{ background: '#27ae60', color: 'white', border: 'none' }}
          >
            학생 정보 업로드
          </button>
          <div className="day-selector">
            {WEEKDAY_NUMBERS.map((dayNum) => (
              <button
                key={dayNum}
                className={`day-btn ${selectedDay === dayNum ? 'active' : ''}`}
                onClick={() => setSelectedDay(dayNum)}
              >
                {WEEKDAYS[dayNum - 1]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="schedule-grid-container">
        <div className="schedule-grid">
          {/* 시간 열 */}
          <div className="time-column">
            {timeSlots.map((time, idx) => (
              <div key={idx} className="time-slot">
                {time}
              </div>
            ))}
          </div>

          {/* 강의실 열들 */}
          {classrooms.map((room) => {
            const classes = getClassesForDayAndRoom(selectedDay, room)
            const isRoom12 = room === 12
            const isClinicRoom = room === 13 || room === 16 || room === 22
            const isConsultingRoom = room === '컨설팅룸'
            const isCounselingRoom = room === '상담실'
            
            return (
              <div key={room} className="classroom-column">
                <div className="classroom-header">
                  {isRoom12 ? '' : (typeof room === 'string' ? room : room)}
                  {typeof room === 'number' && (room === 1 || room === 6 || room === 9 || room === 10 || room === 11) ? ' (Beam)' : ''}
                </div>
                <div 
                  className={`classroom-schedule ${isRoom12 ? 'room-12' : ''} ${isClinicRoom ? 'room-13' : ''} ${isConsultingRoom ? 'room-consulting' : ''} ${isCounselingRoom ? 'room-counseling' : ''}`}
                  style={{ position: 'relative', height: '100%' }}
                >
                  {isRoom12 && (
                    <div className="room-label room-12-label">
                      보듬책방
                    </div>
                  )}
                  {isClinicRoom && (
                    <div className="room-label room-13-label">
                      클리닉
                    </div>
                  )}
                  {isConsultingRoom && (
                    <div className="room-label room-consulting-label">
                      컨설팅룸
                    </div>
                  )}
                  {isCounselingRoom && (
                    <div className="room-label room-counseling-label">
                      상담실
                    </div>
                  )}
                  {classes.map((cls, idx) => {
                    const overlapInfo = cls.overlapTotal > 1 ? {
                      overlapGroup: cls.overlapGroup,
                      overlapIndex: cls.overlapIndex,
                      overlapTotal: cls.overlapTotal
                    } : null
                    const blockStyle = calculateBlockStyle(cls.timeRange, overlapInfo)
                    const hasGradient = isGradient(cls.instructor)
                    const color = hasGradient ? getGradientColor(cls.instructor) : getClassColor(cls.instructor, idx)
                    const baseColor = hasGradient ? getClassColor(extractInstructorNames(cls.instructor)[0], 0) : color
                    
                    // 휴강 체크 (이번 주만)
                    const isCurrentWeek = selectedWeekKey === currentWeekKey;
                    const isCancelled = isCurrentWeek && cls.classId && cancelledClasses.has(cls.classId);
                    
                    const handleMouseEnter = (e) => {
                      setHoveredClass(cls)
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltipPosition({
                        x: rect.right + 10, // 블록 오른쪽에 10px 간격
                        y: rect.top
                      })
                    }

                    const handleMouseLeave = () => {
                      setHoveredClass(null)
                    }
                    
                    // 클릭 시 팝업 표시
                    const handleClick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      if (!isCurrentWeek) {
                        alert(`이번 주가 아닙니다.\n현재 주차: ${currentWeekKey}\n선택된 주차: ${selectedWeekKey}`);
                        return;
                      }
                      
                      if (!cls.classId) {
                        alert('수업 ID가 없습니다. 수업 정보를 확인해주세요.');
                        return;
                      }
                      
                      // 선택된 수업 정보 저장하고 모달 표시
                      setSelectedClass(cls);
                      setShowActionModal(true);
                    };

                    // 테두리 색상 계산
                    const borderColor = typeof baseColor === 'string' && baseColor.startsWith('#') 
                      ? baseColor.replace(/^#(.{2})(.{2})(.{2})$/, (_, r, g, b) => {
                          const darken = (hex) => Math.max(0, parseInt(hex, 16) - 30).toString(16).padStart(2, '0')
                          return `#${darken(r)}${darken(g)}${darken(b)}`
                        })
                      : '#ccc'

                    // 배경색 스타일 객체 생성 (background와 backgroundColor를 동시에 사용하지 않음)
                    const backgroundStyle = !isCancelled 
                      ? (hasGradient 
                          ? { background: color }
                          : { backgroundColor: color })
                      : {};

                    return (
                      <div
                        key={idx}
                        className="schedule-block"
                        style={{
                          ...blockStyle,
                          ...backgroundStyle,
                          opacity: isCancelled ? 0.3 : 1,
                          border: `1px solid ${borderColor}`,
                          cursor: isCurrentWeek ? 'pointer' : 'default',
                          userSelect: 'none'
                        }}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        onClick={handleClick}
                        onMouseDown={(e) => {
                          if (isCurrentWeek) {
                            e.preventDefault();
                          }
                        }}
                        title={isCurrentWeek ? (isCancelled ? '클릭하여 휴강 해제' : '클릭하여 휴강 체크') : ''}
                      >
                        <div className="block-content">
                          <div className="block-course-name">{cls.courseName || cls.subject}</div>
                          {cls.instructor && (
                            <div className="block-instructor">{cls.instructor}</div>
                          )}
                          {cls.days && cls.days.length > 0 && (
                            <div className="block-days">
                              ({cls.days.map(d => WEEKDAYS[d - 1]).join('')})
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

        </div>
      </div>

      {/* 범례 (강사별 색상) */}
      <div className="schedule-legend">
        <h3>범례</h3>
        <div className="legend-items">
          {Array.from(new Set(allScheduleData.map(cls => normalizeInstructorName(cls.instructor)))).map((normalizedInstructor, idx) => {
            const sampleClass = allScheduleData.find(cls => normalizeInstructorName(cls.instructor) === normalizedInstructor)
            const originalInstructor = sampleClass?.instructor || normalizedInstructor
            const hasGradient = isGradient(originalInstructor)
            const color = hasGradient ? getGradientColor(originalInstructor) : (sampleClass ? getClassColor(originalInstructor, 0) : COLOR_PALETTE[idx % COLOR_PALETTE.length])
            
            return (
              <div key={normalizedInstructor} className="legend-item">
                <div 
                  className="legend-color" 
                  style={hasGradient 
                    ? { background: color }
                    : { backgroundColor: color }
                  }
                ></div>
                <span>{originalInstructor}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 툴팁 (모든 정보) */}
      {hoveredClass && (
        <div 
          className="schedule-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            zIndex: 1000
          }}
        >
          {hoveredClass.subject && (
            <div className="tooltip-item">
              <span className="tooltip-label">과목:</span>
              <span className="tooltip-value">{hoveredClass.subject}</span>
            </div>
          )}
          {hoveredClass.grade && (
            <div className="tooltip-item">
              <span className="tooltip-label">학년:</span>
              <span className="tooltip-value">{hoveredClass.grade}</span>
            </div>
          )}
          {hoveredClass.instructor && (
            <div className="tooltip-item">
              <span className="tooltip-label">강사:</span>
              <span className="tooltip-value">{hoveredClass.instructor}</span>
            </div>
          )}
          {hoveredClass.campus && (
            <div className="tooltip-item">
              <span className="tooltip-label">캠퍼스:</span>
              <span className="tooltip-value">{hoveredClass.campus}</span>
            </div>
          )}
          {hoveredClass.days && hoveredClass.days.length > 0 && (
            <div className="tooltip-item">
              <span className="tooltip-label">요일:</span>
              <span className="tooltip-value">{hoveredClass.days.map(d => WEEKDAYS[d - 1]).join(', ')}</span>
            </div>
          )}
          {hoveredClass.timeRange && (
            <div className="tooltip-item">
              <span className="tooltip-label">시간:</span>
              <span className="tooltip-value">{hoveredClass.timeRange.start} ~ {hoveredClass.timeRange.end}</span>
            </div>
          )}
          {hoveredClass.time && !hoveredClass.timeRange && (
            <div className="tooltip-item">
              <span className="tooltip-label">시간:</span>
              <span className="tooltip-value">{hoveredClass.time}</span>
            </div>
          )}
          {hoveredClass.courseName && hoveredClass.courseName !== hoveredClass.subject && (
            <div className="tooltip-item">
              <span className="tooltip-label">강좌명:</span>
              <span className="tooltip-value">{hoveredClass.courseName}</span>
            </div>
          )}
          {hoveredClass.description && (
            <div className="tooltip-item">
              <span className="tooltip-label">설명:</span>
              <span className="tooltip-value">{hoveredClass.description}</span>
            </div>
          )}
          {hoveredClass.startDate && (
            <div className="tooltip-item">
              <span className="tooltip-label">개강 날짜:</span>
              <span className="tooltip-value">{hoveredClass.startDate}</span>
            </div>
          )}
          {hoveredClass.classroom && (
            <div className="tooltip-item">
              <span className="tooltip-label">강의실:</span>
              <span className="tooltip-value">{hoveredClass.classroom}</span>
            </div>
          )}
              {hoveredClass.tuition && (
                <div className="tooltip-item">
                  <span className="tooltip-label">교습비:</span>
                  <span className="tooltip-value">{hoveredClass.tuition}</span>
                </div>
              )}
              {hoveredClass.note && (
                <div className="tooltip-item">
                  <span className="tooltip-label">비고:</span>
                  <span className="tooltip-value">{hoveredClass.note}</span>
                </div>
              )}
        </div>
      )}

      {/* 카카오톡 템플릿 코드 입력 모달 */}
      {showTemplateCodeModal && (
        <div className="action-modal-overlay" onClick={() => setShowTemplateCodeModal(false)}>
          <div className="action-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="action-modal-header">
              <h3>카카오톡 템플릿 코드 설정</h3>
              <button className="action-modal-close" onClick={() => setShowTemplateCodeModal(false)}>×</button>
            </div>
            <div className="action-modal-content">
              <div style={{ marginBottom: '20px' }}>
                <p style={{ marginBottom: '10px', color: '#666' }}>
                  카카오톡 알림톡 템플릿 코드를 입력하세요.
                </p>
                <p style={{ marginBottom: '15px', fontSize: '0.85rem', color: '#999' }}>
                  템플릿 코드는 카카오톡 비즈니스 채널에서 발급받을 수 있습니다.
                </p>
                <input
                  type="text"
                  value={templateCode}
                  onChange={(e) => setTemplateCode(e.target.value)}
                  placeholder="템플릿 코드를 입력하세요"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '1rem'
                  }}
                />
                {templateCode && (
                  <p style={{ marginTop: '10px', fontSize: '0.85rem', color: '#27ae60' }}>
                    현재 설정된 템플릿 코드: {templateCode}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  className="action-btn action-btn-cancel"
                  onClick={() => setShowTemplateCodeModal(false)}
                >
                  취소
                </button>
                <button
                  className="action-btn action-btn-makeup"
                  onClick={handleSaveTemplateCode}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 학생 정보 업로드 모달 */}
      {showStudentUploadModal && (
        <div className="action-modal-overlay" onClick={() => setShowStudentUploadModal(false)}>
          <div className="action-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="action-modal-header">
              <h3>학생 정보 업로드</h3>
              <button className="action-modal-close" onClick={() => setShowStudentUploadModal(false)}>×</button>
            </div>
            <div className="action-modal-content">
              <div style={{ marginBottom: '20px' }}>
                <p style={{ marginBottom: '10px', color: '#666' }}>
                  엑셀 파일을 업로드하여 학생 정보를 등록하세요.
                </p>
                <p style={{ marginBottom: '15px', fontSize: '0.9rem', color: '#999' }}>
                  엑셀 파일 형식: 첫 번째 행은 헤더(학생이름, 학년, 전화번호, 학부모전화번호, 과목, 강사 등)
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelUpload}
                  style={{ width: '100%', padding: '10px', border: '2px dashed #ddd', borderRadius: '8px', cursor: 'pointer' }}
                />
              </div>
              {studentData.length > 0 && (
                <div style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '10px' }}>저장된 학생 정보: {studentData.length}명</div>
                  <div style={{ fontSize: '0.85rem', color: '#666', maxHeight: '200px', overflowY: 'auto' }}>
                    {studentData.slice(0, 5).map((student, idx) => (
                      <div key={idx} style={{ marginBottom: '5px' }}>
                        {Object.entries(student).slice(0, 3).map(([key, value]) => (
                          <span key={key} style={{ marginRight: '10px' }}>
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    ))}
                    {studentData.length > 5 && <div>... 외 {studentData.length - 5}명</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 액션 모달 */}
      {showActionModal && selectedClass && (
        <ActionModal
          classInfo={selectedClass}
          isCancelled={cancelledClasses.has(selectedClass.classId)}
          onClose={() => {
            setShowActionModal(false);
            setSelectedClass(null);
          }}
          onAction={async (actionType) => {
            setIsSendingKakao(true);
            try {
              const result = await handleAction(actionType, selectedClass, cancelledClasses, setCancelledClasses, currentWeekKey, isFirebaseConfigured, db, studentData);
              // handleAction이 false를 반환하면 모달을 닫지 않음 (템플릿 코드 없음 등)
              if (result !== false) {
                setShowActionModal(false);
                setSelectedClass(null);
              }
            } catch (error) {
              console.error('액션 처리 실패:', error);
              alert(`오류가 발생했습니다: ${error.message}`);
            } finally {
              setIsSendingKakao(false);
            }
          }}
          isSending={isSendingKakao}
        />
      )}
    </div>
  )
}

// 액션 처리 함수
async function handleAction(actionType, classInfo, cancelledClasses, setCancelledClasses, currentWeekKey, isFirebaseConfigured, db, studentData = []) {
  const apiUrl = import.meta.env.PROD 
    ? `${window.location.origin}/api/send-kakao`
    : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

  // 카카오톡 템플릿 코드 (localStorage에서 가져오거나 기본값 사용)
  const templateCode = localStorage.getItem('weeklyScheduleKakaoTemplateCode') || '';
  
  if (!templateCode) {
    alert('카카오톡 템플릿 코드가 설정되지 않았습니다.\n설정에서 템플릿 코드를 입력해주세요.');
    return false; // 모달을 닫지 않도록 false 반환
  }

  // 수업 정보 포맷팅
  const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
  const days = classInfo.days ? classInfo.days.map(d => dayNames[d - 1]).join(', ') : '';
  const time = classInfo.timeRange 
    ? `${classInfo.timeRange.start} ~ ${classInfo.timeRange.end}`
    : classInfo.time || '';
  const classroom = classInfo.classroomNum || classInfo.classroom || '';
  const subject = classInfo.courseName || classInfo.subject || '';

  // 액션 타입에 따른 메시지 내용
  let actionMessage = '';
  switch (actionType) {
    case 'cancel':
      actionMessage = '휴강 안내';
      break;
    case 'change':
      actionMessage = '일정 변경 안내';
      break;
    case 'makeup':
      actionMessage = '보강 일정 안내';
      break;
  }

  // 학생 전화번호 목록 가져오기 (엑셀에서 업로드한 데이터에서 매칭)
  const getStudentPhoneNumbers = (classInfo, allStudents) => {
    if (!allStudents || allStudents.length === 0) {
      // studentData가 없으면 localStorage에서 가져오기
      try {
        const stored = localStorage.getItem('weeklyScheduleStudents');
        if (!stored) return [];
        allStudents = JSON.parse(stored);
      } catch (error) {
        console.error('학생 정보 불러오기 실패:', error);
        return [];
      }
    }
    
    const phoneNumbers = [];
    
    // 수업 정보와 매칭되는 학생 찾기
    // 매칭 조건: 과목, 학년, 강사가 일치하는 학생
    const subject = (classInfo.courseName || classInfo.subject || '').trim();
    const grade = (classInfo.grade || '').trim();
    const instructor = (classInfo.instructor || '').trim();
    
    console.log('수업 정보 매칭:', { subject, grade, instructor });
    
    allStudents.forEach((student, idx) => {
      // 엑셀 헤더 이름에 따라 유연하게 매칭
      const studentSubject = (student['과목'] || student['수강과목'] || student['subject'] || '').toString().trim();
      const studentGrade = (student['학년'] || student['grade'] || '').toString().trim();
      const studentInstructor = (student['강사'] || student['선생님'] || student['instructor'] || '').toString().trim();
      const phoneNumber = student['전화번호'] || student['학생전화번호'] || student['phone'] || student['phoneNumber'] || '';
      const parentPhone = student['학부모전화번호'] || student['부모전화번호'] || student['parentPhone'] || student['parentPhoneNumber'] || '';
      
      // 매칭 로직: 과목, 학년, 강사가 일치하거나 부분 일치
      const subjectMatch = !subject || !studentSubject || 
        subject.includes(studentSubject) || studentSubject.includes(subject) ||
        subject.toLowerCase().includes(studentSubject.toLowerCase()) || studentSubject.toLowerCase().includes(subject.toLowerCase());
      const gradeMatch = !grade || !studentGrade || grade === studentGrade;
      const instructorMatch = !instructor || !studentInstructor || 
        instructor.includes(studentInstructor) || studentInstructor.includes(instructor) ||
        instructor.toLowerCase().includes(studentInstructor.toLowerCase()) || studentInstructor.toLowerCase().includes(instructor.toLowerCase());
      
      if (subjectMatch && gradeMatch && instructorMatch && phoneNumber) {
        // 전화번호 형식 정리 (하이픈 제거)
        const cleanPhone = phoneNumber.toString().replace(/-/g, '').trim();
        if (cleanPhone && cleanPhone.length >= 10) {
          phoneNumbers.push(cleanPhone);
          console.log(`매칭된 학생 ${idx + 1}:`, { studentSubject, studentGrade, studentInstructor, phoneNumber: cleanPhone });
        }
        
        // 학부모 전화번호도 추가
        if (parentPhone) {
          const cleanParentPhone = parentPhone.toString().replace(/-/g, '').trim();
          if (cleanParentPhone && cleanParentPhone.length >= 10) {
            phoneNumbers.push(cleanParentPhone);
          }
        }
      }
    });
    
    console.log('매칭된 전화번호 개수:', phoneNumbers.length);
    
    // 중복 제거
    return [...new Set(phoneNumbers)];
  };

  const studentPhoneNumbers = getStudentPhoneNumbers(classInfo, studentData);

  if (studentPhoneNumbers.length === 0) {
    alert('해당 수업에 등록된 학생 전화번호가 없습니다.\n\n학생 정보를 업로드하거나, 엑셀 파일의 과목/학년/강사 정보가 수업 정보와 일치하는지 확인해주세요.');
    return false; // 모달을 닫지 않음
  }
  
  console.log('전송할 전화번호:', studentPhoneNumbers);

  let successCount = 0;
  let failCount = 0;

  // 각 학생에게 카카오톡 전송
  for (const phoneNumber of studentPhoneNumbers) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber.replace(/-/g, ''),
          templateCode: templateCode.trim(),
          variables: {
            '과목': subject,
            '학년': classInfo.grade || '',
            '강사': classInfo.instructor || '',
            '요일': days,
            '시간': time,
            '강의실': classroom,
            '안내내용': actionMessage,
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
      console.error(`카카오톡 전송 실패 (${phoneNumber}):`, error);
      failCount++;
    }
  }

  // 휴강인 경우 휴강 상태 업데이트
  if (actionType === 'cancel') {
    const newCancelledClasses = new Set(cancelledClasses);
    if (cancelledClasses.has(classInfo.classId)) {
      newCancelledClasses.delete(classInfo.classId);
    } else {
      newCancelledClasses.add(classInfo.classId);
    }
    setCancelledClasses(newCancelledClasses);

    // 로컬 스토리지에 저장
    try {
      const localKey = `weeklyScheduleCancellations_${currentWeekKey}`;
      localStorage.setItem(localKey, JSON.stringify({
        cancelledClassIds: Array.from(newCancelledClasses),
        updatedAt: new Date().toISOString()
      }));
    } catch (localError) {
      console.warn('로컬 스토리지 저장 실패:', localError);
    }

    // Firebase에 저장
    if (isFirebaseConfigured && isFirebaseConfigured() && db) {
      try {
        // 이미 import된 doc, setDoc 사용 (상단에서 import됨)
        const docRef = doc(db, 'weeklyScheduleCancellations', currentWeekKey);
        await setDoc(docRef, {
          cancelledClassIds: Array.from(newCancelledClasses),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.warn('Firebase 저장 실패:', error);
      }
    }
  }

  // 결과 알림
  if (studentPhoneNumbers.length === 0) {
    alert(`✅ ${actionMessage} 처리 완료\n\n(전화번호 목록이 비어있어 카카오톡은 전송되지 않았습니다.)`);
  } else if (failCount === 0) {
    alert(`✅ 카카오톡 전송 완료\n\n성공: ${successCount}명`);
  } else {
    alert(`⚠️ 카카오톡 전송 결과\n\n성공: ${successCount}명\n실패: ${failCount}명`);
  }
  
  return true; // 정상 완료 시 true 반환
}

// 액션 모달 컴포넌트
function ActionModal({ classInfo, isCancelled, onClose, onAction, isSending }) {
  const formatClassInfo = () => {
    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    const days = classInfo.days ? classInfo.days.map(d => dayNames[d - 1]).join(', ') : '';
    const time = classInfo.timeRange 
      ? `${classInfo.timeRange.start} ~ ${classInfo.timeRange.end}`
      : classInfo.time || '';
    const classroom = classInfo.classroomNum || classInfo.classroom || '';
    
    return {
      subject: classInfo.courseName || classInfo.subject || '',
      grade: classInfo.grade || '',
      instructor: classInfo.instructor || '',
      days,
      time,
      classroom
    };
  };

  const info = formatClassInfo();

  return (
    <div className="action-modal-overlay" onClick={onClose}>
      <div className="action-modal" onClick={(e) => e.stopPropagation()}>
        <div className="action-modal-header">
          <h3>수업 안내</h3>
          <button className="action-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="action-modal-content">
          <div className="action-modal-class-info">
            <div><strong>과목:</strong> {info.subject}</div>
            <div><strong>학년:</strong> {info.grade}</div>
            <div><strong>강사:</strong> {info.instructor}</div>
            <div><strong>요일:</strong> {info.days}</div>
            <div><strong>시간:</strong> {info.time}</div>
            <div><strong>강의실:</strong> {info.classroom}</div>
          </div>
          <div className="action-modal-buttons">
            <button
              className="action-btn action-btn-cancel"
              onClick={() => onAction('cancel')}
              disabled={isSending}
            >
              {isCancelled ? '휴강 해제' : '휴강'}
            </button>
            <button
              className="action-btn action-btn-change"
              onClick={() => onAction('change')}
              disabled={isSending}
            >
              이 일정만 변경
            </button>
            <button
              className="action-btn action-btn-makeup"
              onClick={() => onAction('makeup')}
              disabled={isSending}
            >
              보강잡기
            </button>
          </div>
          {isSending && (
            <div className="action-modal-loading">
              카카오톡 전송 중...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WeeklyScheduleViewer

