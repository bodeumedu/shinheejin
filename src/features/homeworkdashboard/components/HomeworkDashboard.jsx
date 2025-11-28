import { useState, useEffect, useMemo } from 'react';
import './HomeworkDashboard.css';

// 과제 관리 대시보드 컴포넌트
export default function HomeworkDashboard({ subject = 'english', onClose, onShowRoster }) {
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

  const [selectedSchool, setSelectedSchool] = useState('과천고등학교');
  const [selectedGrade, setSelectedGrade] = useState('1학년');
  const [selectedTeacher, setSelectedTeacher] = useState('김서연'); // 중학교 1학년용
  const [selectedClass, setSelectedClass] = useState('화목 4시반 정규');
  
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

  const handleShowRoster = () => {
    const info = selectedSchool === '중학교 1학년' 
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
    
    if (onShowRoster) {
      onShowRoster(info);
    }
  };

  return (
    <div className="homework-dashboard-page">
      <div className="homework-dashboard-container">
        <div className="homework-dashboard-content">
          <div className="homework-dashboard-grid">
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

              <button className="proceed-btn" onClick={handleShowRoster}>
                명단 보기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
