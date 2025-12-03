import { useState, useEffect, useMemo, useCallback } from 'react';
import './ClinicLog.css';
import { loadAllHomeworkStudents } from '../../../utils/firestoreUtils';

const dayOrder = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const attendanceOptions = ['', 'O', 'X', '결석'];
const messageOptions = ['', 'O', 'X'];

const defaultRecord = {
  day: '',
  time: '',
  attendance: '',
  assistant: '',
  arrival: '',
  departure: '',
  messageStatus: '',
  examStatus: '',
  notes: '',
};

const storageKeys = {
  records: 'clinicRecordValues',
  customs: 'clinicCustomEntries',
};

// 학생 타입: 'repeat' (2회 학생), 'return' (재등원 학생)

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

// 주차 목록 생성 (현재 주차 포함 최근 10주)
function getWeekOptions() {
  const options = [];
  const today = new Date();
  for (let i = 0; i < 10; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - (i * 7));
    const { year, week } = getWeekNumber(date);
    const weekKey = `${year}_week_${week}`;
    const monday = new Date(date);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    const mondayStr = `${monday.getMonth() + 1}/${monday.getDate()}`;
    options.push({
      key: weekKey,
      label: `${year}년 ${week}주차 (${mondayStr}~)`,
      isCurrent: i === 0,
    });
  }
  return options;
}

function getDayIndex(day) {
  const index = dayOrder.indexOf(day);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function parseTimeToMinutes(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const text = value.trim();
  if (!text) return Number.MAX_SAFE_INTEGER;

  let hours = 0;
  let minutes = 0;
  let meridian = null;

  if (text.includes('오전') || text.includes('오후')) {
    meridian = text.includes('오후') ? 'PM' : 'AM';
  }

  const match = text.match(/(\d{1,2})(?:시|:)?\s*(\d{1,2})?/);
  if (match) {
    hours = parseInt(match[1], 10);
    minutes = match[2] ? parseInt(match[2], 10) : 0;
  } else {
    return Number.MAX_SAFE_INTEGER;
  }

  if (meridian === 'PM' && hours < 12) hours += 12;
  if (meridian === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function mergeRecord(record) {
  return { ...defaultRecord, ...(record || {}) };
}

// 전화번호 포맷팅 함수 (010-1234-5678 형식)
function formatPhoneNumber(phone) {
  if (!phone) return '';
  const clean = phone.replace(/-/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }
  return phone; // 포맷팅 불가능하면 원본 반환
}

export default function ClinicLog() {
  // 현재 주차 키
  const currentWeekKey = getWeekKey();
  const weekOptions = getWeekOptions();
  
  // 선택된 주차 상태
  const [selectedWeek, setSelectedWeek] = useState(currentWeekKey);
  const isCurrentWeek = selectedWeek === currentWeekKey;
  
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentError, setStudentError] = useState(null);
  
  // 주차별 기록 불러오기
  const loadWeekRecords = useCallback((weekKey) => {
    try {
      const stored = localStorage.getItem(`${storageKeys.records}_${weekKey}`);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn(`주차 ${weekKey} 기록 불러오기 실패:`, error);
      return {};
    }
  }, []);
  
  // 주차별 기록 저장
  const saveWeekRecords = useCallback((weekKey, records) => {
    try {
      localStorage.setItem(`${storageKeys.records}_${weekKey}`, JSON.stringify(records));
    } catch (error) {
      console.warn(`주차 ${weekKey} 기록 저장 실패:`, error);
    }
  }, []);
  
  const [recordValues, setRecordValues] = useState(() => loadWeekRecords(selectedWeek));
  
  const [customEntries, setCustomEntries] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKeys.customs);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('수동 등록 불러오기 실패:', error);
      return [];
    }
  });
  const [manualForm, setManualForm] = useState({
    day: '월요일',
    time: '',
    school: '',
    grade: '',
    className: '',
    student: '',
    type: 'repeat', // 'repeat' (2회 학생) or 'return' (재등원 학생)
  });

  const refreshStudents = useCallback(async () => {
    if (!loadAllHomeworkStudents) {
      setStudentError('Firebase 연동이 필요합니다.');
      return;
    }
    setLoadingStudents(true);
    setStudentError(null);
    try {
      const data = await loadAllHomeworkStudents();
      setStudents(data);
      
      // 디버깅: 전화번호가 있는 학생 확인
      const studentsWithPhone = data.filter(s => s.phoneNumber);
      console.log('📞 [클리닉 대장] 전화번호가 등록된 학생:', studentsWithPhone.map(s => ({
        이름: s.student,
        전화번호: s.phoneNumber,
        학부모: s.parentPhoneNumber
      })));
    } catch (error) {
      console.error('학생 목록 불러오기 실패:', error);
      setStudentError('학생 데이터를 불러오지 못했습니다. Firebase 설정을 확인해주세요.');
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  // 주차 변경 시 기록 불러오기
  useEffect(() => {
    const weekRecords = loadWeekRecords(selectedWeek);
    setRecordValues(weekRecords);
    
    // customEntries도 주차별로 로드 (재등원 학생은 현재 주차가 아니면 제외)
    try {
      const stored = localStorage.getItem(`${storageKeys.customs}_${selectedWeek}`);
      if (stored) {
        const customs = JSON.parse(stored);
        if (!isCurrentWeek) {
          // 지난 주차는 재등원 학생 제외
          const filtered = customs.filter(entry => entry.type !== 'return');
          setCustomEntries(filtered);
        } else {
          setCustomEntries(customs);
        }
      } else if (isCurrentWeek) {
        // 현재 주차이고 저장된 데이터가 없으면 빈 배열
        setCustomEntries([]);
      }
    } catch (error) {
      console.warn('수동 학생 데이터 로드 실패:', error);
      if (isCurrentWeek) {
        setCustomEntries([]);
      }
    }
  }, [selectedWeek, loadWeekRecords, isCurrentWeek]);
  
  // 현재 주차일 때만 학생 불러오기
  useEffect(() => {
    if (isCurrentWeek) {
      refreshStudents();
    } else {
      // 지난 주차는 학생 목록 비우기 (기록만 표시)
      setStudents([]);
    }
  }, [isCurrentWeek, refreshStudents]);

  // 주차별 기록 저장
  useEffect(() => {
    saveWeekRecords(selectedWeek, recordValues);
  }, [recordValues, selectedWeek, saveWeekRecords]);

  // customEntries 주차별 저장 (재등원 학생은 현재 주차에만 저장)
  useEffect(() => {
    if (customEntries.length > 0) {
      const toSave = isCurrentWeek 
        ? customEntries 
        : customEntries.filter(entry => entry.type !== 'return');
      if (toSave.length > 0) {
        localStorage.setItem(`${storageKeys.customs}_${selectedWeek}`, JSON.stringify(toSave));
      }
    }
  }, [customEntries, selectedWeek, isCurrentWeek]);

  const combinedEntries = useMemo(() => {
    if (isCurrentWeek) {
      // 현재 주차: 학생 목록 기반
      const baseEntries = students.map((student) => {
        const entry = {
          key: `fs:${student.id}`,
          source: 'firestore',
          school: student.school,
          grade: student.grade,
          className: student.className,
          student: student.student,
          phoneNumber: (student.phoneNumber && student.phoneNumber.trim() !== '') ? student.phoneNumber : null, // 학생 전화번호
          parentPhoneNumber: (student.parentPhoneNumber && student.parentPhoneNumber.trim() !== '') ? student.parentPhoneNumber : null, // 학부모 전화번호
        };
        
        // 디버깅: 특정 학생의 전화번호 확인
        if (['권보나', '김민솔', '백채훈', '신은성'].includes(student.student)) {
          console.log(`📞 [combinedEntries] ${student.student}:`, {
            원본: student.phoneNumber,
            포함됨: entry.phoneNumber,
            원본학부모: student.parentPhoneNumber,
            포함됨학부모: entry.parentPhoneNumber
          });
        }
        
        return entry;
      });

      const manual = customEntries.map((entry) => ({
        key: entry.id,
        source: 'manual',
        school: entry.school,
        grade: entry.grade,
        className: entry.className,
        student: entry.student,
        type: entry.type || 'repeat', // 'repeat' or 'return'
      }));

      const all = [...baseEntries, ...manual];

      return all.sort((a, b) => {
        const recordA = mergeRecord(recordValues[a.key]);
        const recordB = mergeRecord(recordValues[b.key]);

        const dayDiff = getDayIndex(recordA.day) - getDayIndex(recordB.day);
        if (dayDiff !== 0) return dayDiff;

        return parseTimeToMinutes(recordA.time) - parseTimeToMinutes(recordB.time);
      });
    } else {
      // 지난 주차: 기록에 저장된 항목만 표시
      const archivedEntries = Object.keys(recordValues).map((key) => {
        const record = recordValues[key];
        // 기록에 학생 정보가 저장되어 있으면 사용, 없으면 기본값
        return {
          key,
          source: key.startsWith('fs:') ? 'firestore' : 'manual',
          school: record.school || '',
          grade: record.grade || '',
          className: record.className || '',
          student: record.student || '',
        };
      });

      return archivedEntries.sort((a, b) => {
        const recordA = mergeRecord(recordValues[a.key]);
        const recordB = mergeRecord(recordValues[b.key]);

        const dayDiff = getDayIndex(recordA.day) - getDayIndex(recordB.day);
        if (dayDiff !== 0) return dayDiff;

        return parseTimeToMinutes(recordA.time) - parseTimeToMinutes(recordB.time);
      });
    }
  }, [students, customEntries, recordValues, isCurrentWeek]);

  const handleRecordChange = (key, field, value, entry = null) => {
    setRecordValues((prev) => {
      const next = { ...prev };
      const currentRecord = mergeRecord(prev[key]);
      // 현재 주차일 때만 학생 정보를 기록에 포함
      if (isCurrentWeek && entry) {
        next[key] = {
          ...currentRecord,
          [field]: value,
          school: entry.school || currentRecord.school,
          grade: entry.grade || currentRecord.grade,
          className: entry.className || currentRecord.className,
          student: entry.student || currentRecord.student,
        };
      } else {
        next[key] = { ...currentRecord, [field]: value };
      }
      return next;
    });
  };

  const handleManualFormChange = (e) => {
    const { name, value } = e.target;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleManualAdd = (e, type) => {
    e.preventDefault();
    if (!manualForm.student.trim()) {
      alert('학생 이름을 입력해주세요.');
      return;
    }

    const newEntry = {
      id: `manual-${Date.now()}-${type}`,
      school: manualForm.school,
      grade: manualForm.grade,
      className: manualForm.className,
      student: manualForm.student.trim(),
      type: type, // 'repeat' or 'return'
    };

    setCustomEntries((prev) => [...prev, newEntry]);
    setRecordValues((prev) => ({
      ...prev,
      [newEntry.id]: {
        ...defaultRecord,
        day: manualForm.day,
        time: manualForm.time,
        school: manualForm.school,
        grade: manualForm.grade,
        className: manualForm.className,
        student: manualForm.student.trim(),
      },
    }));

    setManualForm({
      day: manualForm.day,
      time: '',
      school: '',
      grade: '',
      className: '',
      student: '',
      type: 'repeat',
    });
  };

  const handleResetRecord = (key) => {
    setRecordValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleRemoveManual = (id) => {
    if (!window.confirm('이 학생을 목록에서 제거할까요?')) return;
    setCustomEntries((prev) => prev.filter((entry) => entry.id !== id));
    handleResetRecord(id);
  };

  // 클리닉 대장 내용 포맷팅 함수
  const formatClinicContent = useCallback(() => {
    const currentWeekOption = weekOptions.find(opt => opt.key === selectedWeek);
    const weekLabel = currentWeekOption ? currentWeekOption.label : selectedWeek;

    let content = '';

    if (combinedEntries.length === 0) {
      content += '등록된 학생이 없습니다.\n';
    } else {
      // 요일별로 그룹화
      const entriesByDay = {};
      combinedEntries.forEach(entry => {
        const record = mergeRecord(recordValues[entry.key]);
        const day = record.day || '미지정';
        if (!entriesByDay[day]) {
          entriesByDay[day] = [];
        }
        entriesByDay[day].push({ entry, record });
      });

      // 요일 순서대로 정렬
      const sortedDays = Object.keys(entriesByDay).sort((a, b) => {
        const indexA = getDayIndex(a);
        const indexB = getDayIndex(b);
        return indexA - indexB;
      });

      sortedDays.forEach(day => {
        if (day !== '미지정') {
          content += `\n📅 ${day}\n`;
          content += '━━━━━━━━━━━━━━━━━━━━\n';
        }

        const dayEntries = entriesByDay[day];
        // 시간 순으로 정렬
        dayEntries.sort((a, b) => {
          return parseTimeToMinutes(a.record.time) - parseTimeToMinutes(b.record.time);
        });

        dayEntries.forEach(({ entry, record }) => {
          // 학교 약자
          const schoolAbbr = entry.school === '과천고등학교' ? '천' : 
                            entry.school === '과천중앙고등학교' ? '앙' : 
                            entry.school || '';

          // 기본 정보
          content += `\n👤 ${entry.student}`;
          if (entry.grade) {
            content += ` (${entry.grade}${schoolAbbr ? schoolAbbr : ''})`;
          }
          if (entry.className) {
            content += ` - ${entry.className}`;
          }
          content += '\n';

          // 시간 정보
          if (record.time) {
            content += `⏰ 시간: ${record.time}\n`;
          }

          // 출결
          if (record.attendance) {
            content += `✓ 출결: ${record.attendance}\n`;
          }

          // 담당 조교님
          if (record.assistant) {
            content += `👨‍🏫 담당 조교: ${record.assistant}\n`;
          }

          // 등원/하원 시간
          if (record.arrival || record.departure) {
            content += `🚪 등원: ${record.arrival || '-'} / 하원: ${record.departure || '-'}\n`;
          }

          // 문자 완료
          if (record.messageStatus) {
            content += `📱 문자 완료: ${record.messageStatus}\n`;
          }

          // 시험 확인
          if (record.examStatus) {
            content += `✅ 시험 확인: ${record.examStatus}\n`;
          }

          // 비고
          if (record.notes) {
            content += `📝 비고: ${record.notes}\n`;
          }

          content += '\n';
        });
      });
    }

    return { weekLabel, content };
  }, [combinedEntries, recordValues, selectedWeek]);

  // 카카오톡 전송 (클리닉 대장)
  const handleKakaoSend = async () => {
    if (combinedEntries.length === 0) {
      alert('등록된 학생이 없습니다.');
      return;
    }

    // 전화번호가 있는 학생만 필터링 (Firestore에서 불러온 학생만)
    const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
    const entriesWithPhone = combinedEntries.filter(entry => {
      // Firestore에서 불러온 학생만 전화번호 확인
      if (entry.source !== 'firestore') {
        return false; // 수동 추가 학생은 전화번호가 없음
      }
      const studentPhone = entry.phoneNumber;
      return studentPhone && phoneRegex.test(studentPhone.replace(/-/g, ''));
    });

    if (entriesWithPhone.length === 0) {
      alert('전화번호가 등록된 학생이 없습니다. 대시보드에서 학생 전화번호를 먼저 입력해주세요.');
      return;
    }

    // 템플릿 코드 입력 받기
    const savedTemplateCode = localStorage.getItem('clinicKakaoTemplateCode') || '';
    const promptMessage = savedTemplateCode 
      ? `카카오톡 템플릿 코드를 입력하세요:\n(이전 입력: ${savedTemplateCode})`
      : '카카오톡 템플릿 코드를 입력하세요:';
    
    const templateCode = prompt(promptMessage, savedTemplateCode);
    if (!templateCode || !templateCode.trim()) {
      return;
    }
    
    const trimmedTemplateCode = templateCode.trim();
    localStorage.setItem('clinicKakaoTemplateCode', trimmedTemplateCode);

    try {
      const { weekLabel, content } = formatClinicContent();
      const apiUrl = import.meta.env.PROD 
        ? `${window.location.origin}/api/send-kakao`
        : import.meta.env.VITE_API_URL || 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

      let successCount = 0;
      let failCount = 0;
      const errorMessages = [];

      // 전화번호가 있는 학생들에게만 발송
      for (const entry of entriesWithPhone) {
        const studentPhone = entry.phoneNumber.replace(/-/g, '');
        const parentPhone = entry.parentPhoneNumber ? entry.parentPhoneNumber.replace(/-/g, '') : null;
        
        // 학생 전화번호로 발송
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
                '주차정보': weekLabel,
                '클리닉내용': content,
              },
            }),
          });

          const result = await response.json();

          if (result.success) {
            successCount++;
            console.log(`✅ ${entry.student} 학생에게 카카오톡 발송 성공`);
          } else {
            throw new Error(result.error || '알 수 없는 오류');
          }
        } catch (error) {
          console.error(`${entry.student} 학생 카카오톡 전송 실패:`, error);
          failCount++;
          const errorMessage = error.message || '알 수 없는 오류';
          if (!errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }
        }

        // 학부모 전화번호가 있으면 학부모에게도 발송
        if (parentPhone && phoneRegex.test(parentPhone)) {
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
                  '주차정보': weekLabel,
                  '클리닉내용': content,
                },
              }),
            });

            const result = await response.json();

            if (result.success) {
              successCount++;
              console.log(`✅ ${entry.student} 학부모에게 카카오톡 발송 성공`);
            } else {
              throw new Error(result.error || '알 수 없는 오류');
            }
          } catch (error) {
            console.error(`${entry.student} 학부모 카카오톡 전송 실패:`, error);
            failCount++;
            const errorMessage = error.message || '알 수 없는 오류';
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
          }
        }
      }

      // 결과 알림
      if (errorMessages.length > 0) {
        alert(`❌ 카카오톡 발송 오류:\n${errorMessages.join('\n')}`);
      }
      
      if (successCount > 0) {
        alert(`✅ ${successCount}건의 카카오톡 메시지가 성공적으로 발송되었습니다!${failCount > 0 ? `\n❌ ${failCount}건 발송 실패` : ''}`);
      } else if (failCount > 0) {
        alert(`❌ 모든 카카오톡 발송 실패 (${failCount}건)`);
      }
    } catch (error) {
      console.error('카카오톡 발송 오류:', error);
      alert(`카카오톡 발송 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  return (
    <div className="clinic-log-page">
      <div className="clinic-log-container">
        <section className="clinic-log-section">
          <div className="clinic-log-header">
            <div>
              <h2>🗂️ 클리닉 대장</h2>
              <p className="section-description">
                주차를 선택하여 해당 주차의 기록을 확인하거나 수정할 수 있습니다. 현재 주차만 학생을 불러올 수 있습니다.
              </p>
            </div>
            <div className="clinic-log-header-actions">
              <label className="week-selector-label">
                주차 선택:
                <select
                  className="week-selector"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                >
                  {weekOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {isCurrentWeek && (
                <>
                  <button
                    type="button"
                    className="clinic-refresh-btn"
                    onClick={refreshStudents}
                    disabled={loadingStudents}
                  >
                    {loadingStudents ? '불러오는 중...' : '현재 학생 다시 불러오기'}
                  </button>
                  <span className="clinic-count">
                    불러온 학생: {students.length}명
                  </span>
                </>
              )}
              {!isCurrentWeek && (
                <span className="clinic-count read-only">
                  지난 주차 기록 (읽기 전용)
                </span>
              )}
            </div>
          </div>
          {studentError && <div className="clinic-warning">{studentError}</div>}

          {/* 카카오톡 전송 버튼 */}
          <div style={{ marginBottom: '20px', textAlign: 'right' }}>
            <button
              type="button"
              className="clinic-refresh-btn"
              onClick={handleKakaoSend}
              style={{ backgroundColor: '#FEE500', color: '#000', fontWeight: 'bold' }}
            >
              📱 카카오톡 전송
            </button>
          </div>

          {isCurrentWeek && (
            <>
            <form className="clinic-log-form" onSubmit={(e) => handleManualAdd(e, 'repeat')}>
            <h3>2회 학생 수동 추가</h3>
            <div className="form-row">
              <label>
                요일
                <select name="day" value={manualForm.day} onChange={handleManualFormChange}>
                  {dayOrder.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                시간
                <input
                  type="text"
                  name="time"
                  placeholder="예) 17시"
                  value={manualForm.time}
                  onChange={handleManualFormChange}
                />
              </label>
              <label>
                학교
                <input
                  type="text"
                  name="school"
                  placeholder="예) 과천중앙고등학교"
                  value={manualForm.school}
                  onChange={handleManualFormChange}
                />
              </label>
              <label>
                학년
                <input
                  type="text"
                  name="grade"
                  placeholder="예) 2학년"
                  value={manualForm.grade}
                  onChange={handleManualFormChange}
                />
              </label>
              <label>
                반
                <input
                  type="text"
                  name="className"
                  placeholder="예) 화목반"
                  value={manualForm.className}
                  onChange={handleManualFormChange}
                />
              </label>
              <label>
                이름
                <input
                  type="text"
                  name="student"
                  placeholder="예) 홍길동"
                  value={manualForm.student}
                  onChange={handleManualFormChange}
                  required
                />
              </label>
            </div>
            <button type="submit" className="clinic-save-btn">
              2회 학생 추가
            </button>
          </form>
          <form className="clinic-log-form" onSubmit={(e) => handleManualAdd(e, 'return')} style={{ marginTop: '20px' }}>
            <h3>재등원 학생 수동 추가</h3>
            <div className="form-row">
              <label>
                요일
                <select name="day" value={manualForm.day} onChange={handleManualFormChange}>
                  {dayOrder.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                시간
                <input
                  type="text"
                  name="time"
                  placeholder="예) 17시"
                  value={manualForm.time}
                  onChange={handleManualFormChange}
                />
              </label>
              <label>
                학교
                <input
                  type="text"
                  name="school"
                  placeholder="예) 과천중앙고등학교"
                  value={manualForm.school}
                  onChange={handleManualFormChange}
                />
              </label>
              <label>
                학년
                <input
                  type="text"
                  name="grade"
                  placeholder="예) 2학년"
                  value={manualForm.grade}
                  onChange={handleManualFormChange}
                />
              </label>
              <label>
                반
                <input
                  type="text"
                  name="className"
                  placeholder="예) 화목반"
                  value={manualForm.className}
                  onChange={handleManualFormChange}
                />
              </label>
              <label>
                이름
                <input
                  type="text"
                  name="student"
                  placeholder="예) 홍길동"
                  value={manualForm.student}
                  onChange={handleManualFormChange}
                  required
                />
              </label>
            </div>
            <button type="submit" className="clinic-save-btn" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              재등원 학생 추가
            </button>
          </form>
          </>
          )}
        </section>

        <section className="clinic-log-section">
          <h2>📋 요일 / 시간 순 목록</h2>
          {combinedEntries.length === 0 ? (
            <p className="empty-state">불러온 학생이 없습니다. 상단의 버튼으로 학생을 불러오거나 직접 추가하세요.</p>
          ) : (
            <div className="clinic-log-table-wrapper">
              <table className="clinic-log-table">
                <thead>
                  <tr>
                    <th>클리닉 시간</th>
                    <th>학년/반</th>
                    <th>이름</th>
                    <th>전화번호</th>
                    <th>출결</th>
                    <th>담당 조교님</th>
                    <th>등원/하원시간</th>
                    <th>문자 완료</th>
                    <th>시험 확인</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedEntries.map((entry) => {
                    const record = mergeRecord(recordValues[entry.key]);
                    const isManual = entry.source === 'manual';
                    const isReturnStudent = isManual && entry.type === 'return';
                    return (
                      <tr key={entry.key} className={isReturnStudent ? 'return-student-row' : ''}>
                        <td className="day-time-cell">
                          <select
                            value={record.day}
                            onChange={(e) => handleRecordChange(entry.key, 'day', e.target.value, entry)}
                            disabled={!isCurrentWeek}
                          >
                            <option value="">요일 선택</option>
                            {dayOrder.map((day) => (
                              <option key={day} value={day}>
                                {day}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="예) 17시"
                            value={record.time}
                            onChange={(e) => handleRecordChange(entry.key, 'time', e.target.value, entry)}
                            disabled={!isCurrentWeek}
                          />
                        </td>
                        <td>
                          <div className="grade-class-cell">
                            <div className="grade-row">
                              <strong>{entry.grade || '-'}</strong>
                              {entry.school && (
                                <span className="school-abbr">
                                  {entry.school === '과천고등학교' ? '천' : 
                                   entry.school === '과천중앙고등학교' ? '앙' : 
                                   entry.school}
                                </span>
                              )}
                            </div>
                            {entry.className && (
                              <div className="class-row">{entry.className}</div>
                            )}
                          </div>
                        </td>
                        <td>{entry.student}</td>
                        <td className="phone-number-cell">
                          {entry.phoneNumber || entry.parentPhoneNumber ? (
                            <div className="phone-display">
                              {entry.parentPhoneNumber && (
                                <div className="phone-parent">
                                  학부모: {formatPhoneNumber(entry.parentPhoneNumber)}
                                </div>
                              )}
                              {entry.phoneNumber && (
                                <div className="phone-student">
                                  학생: {formatPhoneNumber(entry.phoneNumber)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>등록 안됨</span>
                          )}
                        </td>
                        <td className="attendance-cell">
                        <select
                          className="clinic-select"
                          value={record.attendance}
                          onChange={(e) => handleRecordChange(entry.key, 'attendance', e.target.value, entry)}
                          disabled={!isCurrentWeek}
                        >
                          <option value="">-</option>
                          {attendanceOptions.slice(1).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        </td>
                        <td>
                          <input
                          className="clinic-input"
                            type="text"
                            value={record.assistant}
                          placeholder="조교명"
                            onChange={(e) => handleRecordChange(entry.key, 'assistant', e.target.value, entry)}
                            disabled={!isCurrentWeek}
                          />
                        </td>
                        <td>
                          <div className="arrival-departure-cell">
                            <div className="clinic-time-input">
                              <input
                                type="text"
                                value={record.arrival}
                                placeholder="등원시간"
                                onChange={(e) => handleRecordChange(entry.key, 'arrival', e.target.value, entry)}
                                disabled={!isCurrentWeek}
                              />
                              <span className="time-icon">⏱</span>
                            </div>
                            <div className="clinic-time-input">
                              <input
                                type="text"
                                value={record.departure}
                                placeholder="하원시간"
                                onChange={(e) => handleRecordChange(entry.key, 'departure', e.target.value, entry)}
                                disabled={!isCurrentWeek}
                              />
                              <span className="time-icon">⏱</span>
                            </div>
                          </div>
                        </td>
                        <td className="message-status-cell">
                        <select
                          className="clinic-select"
                          value={record.messageStatus}
                          onChange={(e) => handleRecordChange(entry.key, 'messageStatus', e.target.value, entry)}
                          disabled={!isCurrentWeek}
                        >
                          <option value="">-</option>
                          {messageOptions.slice(1).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        </td>
                        <td className="exam-status-cell">
                          <textarea
                            className="clinic-input"
                            value={record.examStatus || ''}
                            placeholder="시험 확인"
                            onChange={(e) => handleRecordChange(entry.key, 'examStatus', e.target.value, entry)}
                            disabled={!isCurrentWeek}
                            rows={5}
                          />
                        </td>
                        <td className="notes-cell">
                          <textarea
                            value={record.notes}
                          placeholder="비고"
                            onChange={(e) => handleRecordChange(entry.key, 'notes', e.target.value, entry)}
                            disabled={!isCurrentWeek}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

