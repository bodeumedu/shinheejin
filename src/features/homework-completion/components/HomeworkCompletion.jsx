import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';
import { loadCentralPhoneNumbers } from '../../../utils/firestoreUtils';
import './HomeworkCompletion.css';

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

// 숙제 과제 완료도 관리 컴포넌트
export default function HomeworkCompletion({ onClose }) {
  const [students, setStudents] = useState([]);
  const [studentInfo, setStudentInfo] = useState({}); // {학생명: {school, grade, className}}
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('all'); // 'all' 또는 특정 반명
  const [completionData, setCompletionData] = useState({}); // {학생명: {과제명: 완료여부}}

  // 중앙 전화번호 저장소에서 학생 데이터 불러오기
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
          console.log('✅ 학생 데이터 불러옴:', { 학생수: studentList.length });
        } else {
          // 로컬 스토리지에서 불러오기 시도
          try {
            const saved = localStorage.getItem('studentPhoneNumbers_backup');
            if (saved) {
              const localData = JSON.parse(saved);
              setStudents(localData.students || []);
              setStudentInfo(localData.studentInfo || {});
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

  // 모든 반명 추출 (중복 제거)
  const allClasses = useMemo(() => {
    const classSet = new Set();
    students.forEach(student => {
      const className = studentInfo[student]?.className || '';
      if (className) {
        const classes = parseClassNames(className);
        classes.forEach(c => classSet.add(c));
      }
    });
    return Array.from(classSet).sort();
  }, [students, studentInfo]);

  // 선택된 반의 학생들 필터링 및 정렬
  const filteredAndSortedStudents = useMemo(() => {
    let filtered = students;

    // 반별 필터링
    if (selectedClass !== 'all') {
      filtered = students.filter(student => {
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
  }, [students, studentInfo, selectedClass]);

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
        <div className="homework-completion-header">
          <div>
            <h2>📚 숙제 과제 완료도</h2>
            <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '0.9rem' }}>
              총 {students.length}명
              {selectedClass !== 'all' && ` (${selectedClass}: ${filteredAndSortedStudents.length}명)`}
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>닫기</button>
        </div>
        
        <div className="homework-completion-description">
          <div className="class-filter-section">
            <label htmlFor="class-filter" style={{ marginRight: '10px', fontWeight: '600' }}>
              반 선택:
            </label>
            <select
              id="class-filter"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="class-filter-select"
            >
              <option value="all">전체 ({students.length}명)</option>
              {allClasses.map(className => {
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
          </div>
          <p style={{ marginTop: '15px' }}>학생들의 숙제 및 과제 완료도를 관리합니다.</p>
          <p>반별로 학생을 확인하고, 완료 여부를 체크하여 추적할 수 있습니다.</p>
        </div>
        
        <div className="homework-completion-content">
          <div className="students-list">
            {filteredAndSortedStudents.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
                {selectedClass !== 'all' ? '선택한 반에 학생이 없습니다.' : '학생 데이터가 없습니다.'}
              </p>
            ) : (
              <div className="students-grid">
                {filteredAndSortedStudents.map((student, index) => {
                  const info = studentInfo[student] || {};
                  const classes = parseClassNames(info.className || '');
                  
                  return (
                    <div key={student} className="student-card">
                      <div className="student-card-header">
                        <span className="student-number">{index + 1}</span>
                        <span className="student-name">{student}</span>
                      </div>
                      <div className="student-card-info">
                        {info.school && (
                          <div className="info-item">
                            <span className="info-label">학교:</span>
                            <span className="info-value">{info.school}</span>
                          </div>
                        )}
                        {info.grade && (
                          <div className="info-item">
                            <span className="info-label">학년:</span>
                            <span className="info-value">{info.grade}</span>
                          </div>
                        )}
                        {classes.length > 0 && (
                          <div className="info-item">
                            <span className="info-label">반:</span>
                            <div className="info-value" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                              {classes.map((c, i) => {
                                const formatted = formatClassName(c);
                                return (
                                  <span key={i} className="class-badge" title={c}>
                                    {formatted}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="student-card-actions">
                        <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '10px' }}>
                          완료도 기능 개발 중...
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

