import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';
import './AdminPage.css';

const PHONE_DOC = 'homeworkCompletionPhoneNumbers';
const PHONE_DOC_ID = 'all';
const DATE_DATA_DOC = 'homeworkCompletionDateData';
const SEND_HISTORY_COLLECTION = 'homeworkCompletionSendHistory';
const SENT_COUNTS_DOC = 'homeworkCompletionSentCounts';
const INDIVIDUAL_HOMEWORK_KEY = '__individual_homework_text__';
const INDIVIDUAL_PROGRESS_KEY = '__individual_progress_text__';
const COMMENT_KEY = '__comment__';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_INDEX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

function extractDayToken(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const matches = Array.from(raw.matchAll(/(?:^|[\s_()])([월화수목금토일]{1,3})(?=$|[\s_()0-9])/g));
  if (matches.length === 0) return '';
  return matches[matches.length - 1]?.[1] || '';
}

function formatLocalYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseClassNames(classNameStr) {
  if (!classNameStr || typeof classNameStr !== 'string') return [];
  return classNameStr.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseClassMeta(className) {
  const raw = String(className || '').trim();
  const parts = raw.split('_').filter(Boolean);
  const teacher = parts[1] || '';
  let dayIndex = -1;
  let timeIndex = -1;

  parts.forEach((part, index) => {
    const token = String(part || '').trim();
    if (dayIndex === -1 && /^[월화수목금토일]{1,3}$/.test(token)) dayIndex = index;
    if (timeIndex === -1 && /^\d{1,2}:\d{2}$/.test(token)) timeIndex = index;
  });

  const endCandidates = [dayIndex, timeIndex].filter((index) => index >= 2);
  const courseEnd = endCandidates.length > 0 ? Math.min(...endCandidates) : parts.length;
  const courseName = parts.slice(2, courseEnd).join(' ').trim() || parts[2] || raw;
  const day = dayIndex >= 0 ? parts[dayIndex] : extractDayToken(raw) || extractDayToken(courseName);
  const time = timeIndex >= 0 ? parts[timeIndex] : '';
  const courseNameAlreadyHasDay = day ? courseName.includes(day) : false;
  const displayClassName = day && time
    ? (courseNameAlreadyHasDay ? `${courseName} (${time})` : `${courseName} (${day} ${time})`)
    : day
      ? (courseNameAlreadyHasDay ? courseName : `${courseName} (${day})`)
      : courseName;

  return {
    raw,
    teacher,
    courseName,
    day,
    time,
    displayClassName,
  };
}

function formatClassName(className) {
  return parseClassMeta(className).displayClassName || String(className || '');
}

function getWeekdayLabel(dateText) {
  if (!dateText) return '';
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return WEEKDAY_LABELS[date.getDay()] || '';
}

function shiftDateText(dateText, diffDays) {
  if (!dateText) return '';
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + diffDays);
  return formatLocalYMD(date);
}

function getClassWeekdayIndexes(dayText) {
  return [...new Set(String(dayText || '').split('').map((char) => WEEKDAY_INDEX[char]).filter((value) => value !== undefined))];
}

function getPreviousClassDate(dateText, dayText) {
  const targetDate = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(targetDate.getTime())) return '';
  const weekdayIndexes = getClassWeekdayIndexes(dayText);
  if (weekdayIndexes.length === 0) return '';
  for (let diff = 1; diff <= 7; diff += 1) {
    const probe = new Date(targetDate);
    probe.setDate(targetDate.getDate() - diff);
    if (weekdayIndexes.includes(probe.getDay())) {
      return formatLocalYMD(probe);
    }
  }
  return '';
}

function formatShortDate(dateText) {
  if (!dateText) return '-';
  const [year, month, day] = String(dateText).split('-');
  if (!year || !month || !day) return dateText;
  return `${month}-${day}`;
}

function classMatchesWeekday(className, weekday) {
  if (!weekday) return false;
  const meta = parseClassMeta(className);
  return Boolean(meta.day && meta.day.includes(weekday));
}

function normalizeStudentNames(raw) {
  if (!raw) return [];
  if (typeof raw !== 'string') return [];
  if (raw.includes(',')) {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [raw.trim()].filter(Boolean);
}

function extractStudentName(item) {
  if (item == null) return '';
  if (typeof item === 'string') return String(item).trim();
  if (typeof item === 'object') {
    const raw = item.name || item.student || item.studentName;
    return raw != null ? String(raw).trim() : '';
  }
  return '';
}

export default function AdminPage({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState([]);
  const [studentInfo, setStudentInfo] = useState({});
  const [addedClassList, setAddedClassList] = useState([]);
  const [dateData, setDateData] = useState({
    completionData: {},
    homeworkList: {},
    progressList: {},
    progressData: {},
  });
  const [sendHistory, setSendHistory] = useState({});
  const [sentCounts, setSentCounts] = useState({});
  const [selectedDate, setSelectedDate] = useState(formatLocalYMD());
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [sendDetailModal, setSendDetailModal] = useState(null);

  const loadAdminData = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) {
      setError('Firebase가 설정되지 않았습니다.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [phoneSnap, dateSnap, historySnap, countsSnap] = await Promise.all([
        getDoc(doc(db, PHONE_DOC, PHONE_DOC_ID)),
        getDoc(doc(db, DATE_DATA_DOC, 'all')),
        getDoc(doc(db, SEND_HISTORY_COLLECTION, 'all')),
        getDoc(doc(db, SENT_COUNTS_DOC, 'all')),
      ]);

      const phoneData = phoneSnap.exists() ? phoneSnap.data() : {};
      const dateBlob = dateSnap.exists() ? dateSnap.data() : {};
      const historyData = historySnap.exists() ? historySnap.data() : {};
      const countsData = countsSnap.exists() ? countsSnap.data() : {};

      setStudents(Array.isArray(phoneData.students) ? phoneData.students : []);
      setStudentInfo(phoneData.studentInfo && typeof phoneData.studentInfo === 'object' ? phoneData.studentInfo : {});
      setAddedClassList(Array.isArray(phoneData.addedClassList) ? phoneData.addedClassList : []);
      setDateData({
        completionData: dateBlob.completionData && typeof dateBlob.completionData === 'object' ? dateBlob.completionData : {},
        homeworkList: dateBlob.homeworkList && typeof dateBlob.homeworkList === 'object' ? dateBlob.homeworkList : {},
        progressList: dateBlob.progressList && typeof dateBlob.progressList === 'object' ? dateBlob.progressList : {},
        progressData: dateBlob.progressData && typeof dateBlob.progressData === 'object' ? dateBlob.progressData : {},
      });
      setSendHistory(historyData.history && typeof historyData.history === 'object' ? historyData.history : {});
      setSentCounts(countsData.counts && typeof countsData.counts === 'object' ? countsData.counts : {});
    } catch (e) {
      console.error('관리자 페이지 로드 실패:', e);
      setError(e?.message || '관리자 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const activeStudents = useMemo(
    () => [...new Set((Array.isArray(students) ? students : []).map(extractStudentName).filter(Boolean))],
    [students]
  );

  const classOptions = useMemo(() => {
    const set = new Set();
    activeStudents.forEach((student) => {
      parseClassNames(studentInfo[student]?.className || '').forEach((className) => set.add(className));
    });
    addedClassList.forEach((className) => {
      if (className) set.add(className);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [activeStudents, studentInfo, addedClassList]);

  const selectedWeekday = useMemo(() => getWeekdayLabel(selectedDate), [selectedDate]);

  const suggestedClasses = useMemo(
    () => classOptions.filter((className) => classMatchesWeekday(className, selectedWeekday)),
    [classOptions, selectedWeekday]
  );

  useEffect(() => {
    setSelectedClasses(suggestedClasses);
  }, [suggestedClasses]);

  const classOptionsWithMeta = useMemo(
    () =>
      classOptions
        .map((className) => ({
          className,
          ...parseClassMeta(className),
          matchesSelectedWeekday: classMatchesWeekday(className, selectedWeekday),
        }))
        .sort((a, b) => (a.teacher || '').localeCompare(b.teacher || '', 'ko') || a.displayClassName.localeCompare(b.displayClassName, 'ko')),
    [classOptions, selectedWeekday]
  );

  const toggleClassSelection = useCallback((className) => {
    setSelectedClasses((prev) =>
      prev.includes(className) ? prev.filter((item) => item !== className) : [...prev, className]
    );
  }, []);

  const reportClassGroups = useMemo(() => {
    const dayHistory = Array.isArray(sendHistory[selectedDate]) ? sendHistory[selectedDate] : [];

    return [...selectedClasses]
      .map((className) => {
        const meta = parseClassMeta(className);
        const classStudents = activeStudents
          .filter((student) => parseClassNames(studentInfo[student]?.className || '').includes(className))
          .sort((a, b) => a.localeCompare(b, 'ko'));

        const noticeDate = selectedDate;
        const completionSourceDate = getPreviousClassDate(selectedDate, meta.day);
        const noticeHomeworkList = dateData.homeworkList?.[noticeDate]?.[className] || [];
        const noticeProgressList = dateData.progressList?.[noticeDate]?.[className] || [];
        const completionHomeworkList = completionSourceDate ? (dateData.homeworkList?.[completionSourceDate]?.[className] || []) : [];
        const completionProgressList = completionSourceDate ? (dateData.progressList?.[completionSourceDate]?.[className] || []) : [];
        const completionDataRowByStudent = completionSourceDate ? (dateData.completionData?.[completionSourceDate]?.[className] || {}) : {};
        const progressDataRowByStudent = completionSourceDate ? (dateData.progressData?.[completionSourceDate]?.[className] || {}) : {};

        const rows = classStudents.map((student) => {
          const completionRow = completionDataRowByStudent?.[student] || {};
          const progressRow = progressDataRowByStudent?.[student] || {};
          const individualHomework = String(completionRow?.[INDIVIDUAL_HOMEWORK_KEY] || '').trim();
          const individualProgress = String(progressRow?.[INDIVIDUAL_PROGRESS_KEY] || '').trim();
          const comment = String(completionRow?.[COMMENT_KEY] || '').trim();
          const homeworkChecks = Object.keys(completionRow).filter(
            (key) =>
              ![INDIVIDUAL_HOMEWORK_KEY, COMMENT_KEY].includes(key) &&
              completionRow[key] &&
              typeof completionRow[key] === 'object'
          );
          const progressValues = Object.keys(progressRow).filter(
            (key) => key !== INDIVIDUAL_PROGRESS_KEY && String(progressRow[key] || '').trim() !== ''
          );

          const shouldSendNotice =
            noticeHomeworkList.length > 0 ||
            noticeProgressList.length > 0;
          const shouldSendCompletion =
            completionHomeworkList.length > 0 ||
            completionProgressList.length > 0 ||
            individualHomework !== '' ||
            individualProgress !== '' ||
            homeworkChecks.length > 0 ||
            progressValues.length > 0 ||
            comment !== '';

          const matchedHistory = dayHistory.filter((entry) => {
            if (entry?.반명 !== className) return false;
            return normalizeStudentNames(entry?.학생명).includes(student);
          });
          const noticeHistory = matchedHistory.filter((entry) => entry?.타입 === '알림장');
          const completionHistory = matchedHistory.filter((entry) => entry?.타입 === '완료도');
          const counts = sentCounts?.[selectedDate]?.[className]?.[student] || {};

          return {
            student,
            shouldSendNotice,
            shouldSendCompletion,
            noticeSent: noticeHistory.length > 0 || (counts.notice || 0) > 0,
            completionSent: completionHistory.length > 0 || (counts.completion || 0) > 0,
            noticeCount: counts.notice || 0,
            completionCount: counts.completion || 0,
            noticeDate,
            completionSourceDate,
            individualHomework,
            individualProgress,
            comment,
            homeworkChecksCount: homeworkChecks.length,
            progressValuesCount: progressValues.length,
          };
        });

        return {
          className,
          teacher: meta.teacher || '-',
          displayClassName: meta.displayClassName || className,
          day: meta.day || '',
          rows,
          rowSpan: rows.length,
          homeworkList: noticeHomeworkList,
          progressList: noticeProgressList,
        };
      })
      .sort((a, b) => a.teacher.localeCompare(b.teacher, 'ko') || a.displayClassName.localeCompare(b.displayClassName, 'ko'));
  }, [selectedClasses, selectedDate, sendHistory, activeStudents, studentInfo, dateData, sentCounts]);

  const teacherGroups = useMemo(() => {
    const groups = [];
    reportClassGroups.forEach((classGroup) => {
      const lastTeacherGroup = groups[groups.length - 1];
      if (lastTeacherGroup && lastTeacherGroup.teacher === classGroup.teacher) {
        lastTeacherGroup.classes.push(classGroup);
        lastTeacherGroup.rowSpan += classGroup.rowSpan;
      } else {
        groups.push({
          teacher: classGroup.teacher,
          classes: [classGroup],
          rowSpan: classGroup.rowSpan,
        });
      }
    });
    return groups;
  }, [reportClassGroups]);

  const reportRows = useMemo(
    () => reportClassGroups.flatMap((group) => group.rows),
    [reportClassGroups]
  );

  const summary = useMemo(() => {
    const noticeTargets = reportRows.filter((row) => row.shouldSendNotice);
    const completionTargets = reportRows.filter((row) => row.shouldSendCompletion);
    return {
      noticeTargetCount: noticeTargets.length,
      noticeMissingCount: noticeTargets.filter((row) => !row.noticeSent).length,
      completionTargetCount: completionTargets.length,
      completionMissingCount: completionTargets.filter((row) => !row.completionSent).length,
    };
  }, [reportRows]);

  const selectedClassHints = useMemo(
    () =>
      reportClassGroups.map((group) => ({
        key: group.className,
        label: `${group.displayClassName} · 학생 ${group.rows.length}명`,
        homework: group.homeworkList,
        progress: group.progressList,
      })),
    [reportClassGroups]
  );

  const buildSendPreviewText = useCallback((className, studentName, sendType, sourceDate) => {
    const completionRow = dateData.completionData?.[sourceDate]?.[className]?.[studentName] || {};
    const progressRow = dateData.progressData?.[sourceDate]?.[className]?.[studentName] || {};
    const homeworkList = dateData.homeworkList?.[sourceDate]?.[className] || [];
    const progressList = dateData.progressList?.[sourceDate]?.[className] || [];
    const comment = String(completionRow?.[COMMENT_KEY] || '').trim();

    if (sendType === '알림장') {
      return [
        homeworkList.length > 0 ? `과제\n${homeworkList.join('\n')}` : '',
        progressList.length > 0 ? `진도\n${progressList.join('\n')}` : '',
      ].filter(Boolean).join('\n\n') || '저장된 발송 내용을 찾지 못했습니다.';
    }

    const homeworkStatus = homeworkList
      .map((hw) => {
        const hwData = completionRow?.[hw] || {};
        const completed = hwData?.completed ? '완료' : '미완료';
        const note = hwData?.percentage != null && String(hwData.percentage).trim() !== '' ? ` (${String(hwData.percentage).trim()})` : '';
        return `${hw}: ${completed}${note}`;
      })
      .join('\n');

    const progressText = progressList
      .map((prog) => `${prog}: ${String(progressRow?.[prog] || '').trim() || '-'}`)
      .join('\n');

    return [
      homeworkStatus ? `과제 완료 상태\n${homeworkStatus}` : '',
      progressText ? `진도 상황\n${progressText}` : '',
      comment ? `코멘트\n${comment}` : '',
    ].filter(Boolean).join('\n\n') || '저장된 발송 내용을 찾지 못했습니다.';
  }, [dateData]);

  const openSendDetailModal = useCallback((className, studentName, sendType, sourceDate, historyDate) => {
    const dayHistory = Array.isArray(sendHistory[historyDate]) ? sendHistory[historyDate] : [];
    const entries = dayHistory
      .filter((entry) => {
        if (entry?.반명 !== className) return false;
        if (entry?.타입 !== sendType) return false;
        return normalizeStudentNames(entry?.학생명).includes(studentName);
      })
      .sort((a, b) => String(b?.시간 || '').localeCompare(String(a?.시간 || '')));

    setSendDetailModal({
      className,
      studentName,
      sendType,
      sourceDate,
      historyDate,
      entries,
      previewText: buildSendPreviewText(className, studentName, sendType, sourceDate),
    });
  }, [buildSendPreviewText, sendHistory]);

  return (
    <div className="admin-page">
      <div className="admin-page-card">
        <div className="admin-page-header">
          <div>
            <h1>🟣 관리자 페이지</h1>
            <p>숙제 과제 완료도에서 날짜별로 반별 발송 누락을 학생 단위로 확인합니다.</p>
          </div>
          <div className="admin-page-actions">
            <button type="button" className="admin-page-refresh" onClick={loadAdminData}>
              새로고침
            </button>
            <button type="button" className="admin-page-close" onClick={onClose}>
              메인 메뉴로
            </button>
          </div>
        </div>

        {loading ? <p className="admin-page-state">불러오는 중...</p> : null}
        {!loading && error ? <p className="admin-page-error">{error}</p> : null}

        {!loading && !error ? (
          <>
            <div className="admin-page-filters">
              <label>
                날짜
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              </label>
              <div className="admin-page-weekday-card">
                <strong>{selectedDate}</strong>
                <span>{selectedWeekday ? `${selectedWeekday}요일 등원 반 자동 선택` : '요일 확인 불가'}</span>
              </div>
            </div>

            <div className="admin-page-class-selector">
              <div className="admin-page-class-selector-header">
                <strong>등원 반 선택</strong>
                <div className="admin-page-class-selector-actions">
                  <button type="button" onClick={() => setSelectedClasses(suggestedClasses)}>
                    요일 반 다시 선택
                  </button>
                  <button type="button" onClick={() => setSelectedClasses([])}>
                    전체 해제
                  </button>
                </div>
              </div>
              <div className="admin-page-class-grid">
                {classOptionsWithMeta.map((item) => (
                  <label key={item.className} className={`admin-page-class-option ${selectedClasses.includes(item.className) ? 'admin-page-class-option-selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedClasses.includes(item.className)}
                      onChange={() => toggleClassSelection(item.className)}
                    />
                    <div>
                      <div className="admin-page-class-option-title">{item.displayClassName}</div>
                      <div className="admin-page-class-option-meta">
                        {item.teacher || '-'}{item.day ? ` · ${item.day}` : ''}
                        {item.matchesSelectedWeekday ? ' · 자동 선택' : ''}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="admin-page-summary">
              <div className="admin-page-summary-card">
                <strong>알림장</strong>
                <span>완료 {summary.noticeTargetCount - summary.noticeMissingCount}명</span>
                <span>누락 {summary.noticeMissingCount}명</span>
              </div>
              <div className="admin-page-summary-card">
                <strong>완료도</strong>
                <span>완료 {summary.completionTargetCount - summary.completionMissingCount}명</span>
                <span>누락 {summary.completionMissingCount}명</span>
              </div>
              <div className="admin-page-summary-card">
                <strong>선택 반</strong>
                <span>{selectedClasses.length}개</span>
                <span>{selectedWeekday ? `${selectedWeekday}요일` : selectedDate}</span>
              </div>
            </div>

            <div className="admin-page-hints">
              {selectedClassHints.length === 0 ? (
                <div>선택된 반이 없습니다.</div>
              ) : (
                selectedClassHints.map((item) => (
                  <div key={item.key}>
                    <strong>{item.label}</strong>
                    {' · '}
                    과제: {item.homework.length > 0 ? item.homework.join(', ') : '없음'}
                    {' · '}
                    진도: {item.progress.length > 0 ? item.progress.join(', ') : '없음'}
                  </div>
                ))
              )}
            </div>

            <div className="admin-page-table-wrap">
              <table className="admin-page-table">
                <thead>
                  <tr>
                    <th>선생님</th>
                    <th>반명</th>
                    <th>학생</th>
                    <th>알림장 발송</th>
                    <th>완료도 발송</th>
                    <th>입력 현황</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-page-empty">
                        선택된 반이 없거나, 선택한 반에 학생이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    teacherGroups.map((teacherGroup) =>
                      teacherGroup.classes.map((classGroup, classIdx) =>
                        classGroup.rows.map((row, rowIdx) => (
                          <tr key={`${classGroup.className}-${row.student}`}>
                            {classIdx === 0 && rowIdx === 0 ? (
                              <td rowSpan={teacherGroup.rowSpan} className="admin-page-merged-cell">
                                {teacherGroup.teacher}
                              </td>
                            ) : null}
                            {rowIdx === 0 ? (
                              <td rowSpan={classGroup.rowSpan} className="admin-page-merged-cell">
                                {classGroup.displayClassName}
                              </td>
                            ) : null}
                            <td>{row.student}</td>
                            <td className={row.shouldSendNotice && !row.noticeSent ? 'admin-page-missing' : ''}>
                              {row.noticeSent ? (
                                <button
                                  type="button"
                                  className="admin-page-link-button"
                                  onClick={() => openSendDetailModal(classGroup.className, row.student, '알림장', row.noticeDate, selectedDate)}
                                >
                                  {`${formatShortDate(row.noticeDate)} 완료 (${row.noticeCount})`}
                                </button>
                              ) : row.shouldSendNotice ? '누락' : '-'}
                            </td>
                            <td className={row.shouldSendCompletion && !row.completionSent ? 'admin-page-missing' : ''}>
                              {row.completionSent ? (
                                <button
                                  type="button"
                                  className="admin-page-link-button"
                                  onClick={() => openSendDetailModal(classGroup.className, row.student, '완료도', row.completionSourceDate, selectedDate)}
                                >
                                  {`${formatShortDate(row.completionSourceDate)} 완료 (${row.completionCount})`}
                                </button>
                              ) : row.shouldSendCompletion ? '누락' : '-'}
                            </td>
                            <td>
                              {[
                                row.homeworkChecksCount > 0 ? `완료도 ${row.homeworkChecksCount}개` : null,
                                row.progressValuesCount > 0 ? `진도 ${row.progressValuesCount}개` : null,
                                row.individualHomework ? '개별 숙제' : null,
                                row.individualProgress ? '개별 진도' : null,
                                row.comment ? '코멘트' : null,
                              ].filter(Boolean).join(' / ') || '-'}
                            </td>
                          </tr>
                        ))
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>

            {sendDetailModal ? (
              <div className="admin-page-modal-overlay" onClick={() => setSendDetailModal(null)}>
                <div className="admin-page-modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="admin-page-modal-header">
                    <div>
                      <h3>{sendDetailModal.studentName} · {sendDetailModal.sendType}</h3>
                      <p>
                        {formatClassName(sendDetailModal.className)}
                        {sendDetailModal.sendType === '알림장'
                          ? ` · 기준 날짜 ${sendDetailModal.sourceDate || '-'}`
                          : ` · 과제 기준 ${sendDetailModal.sourceDate || '-'} · 전송 확인 ${sendDetailModal.historyDate || '-'}`
                        }
                      </p>
                    </div>
                    <button type="button" className="admin-page-close" onClick={() => setSendDetailModal(null)}>
                      닫기
                    </button>
                  </div>

                  <div className="admin-page-modal-section">
                    <strong>보낸 내용</strong>
                    <pre className="admin-page-modal-pre">{sendDetailModal.previewText}</pre>
                  </div>

                  <div className="admin-page-modal-section">
                    <strong>전송 이력</strong>
                    {sendDetailModal.entries.length === 0 ? (
                      <div className="admin-page-modal-empty">저장된 전송 이력이 없습니다.</div>
                    ) : (
                      <div className="admin-page-modal-entry-list">
                        {sendDetailModal.entries.map((entry, index) => (
                          <div key={`${entry.시간 || 'no-time'}-${index}`} className="admin-page-modal-entry">
                            <div className="admin-page-modal-entry-time">{entry.시간 ? new Date(entry.시간).toLocaleString() : '-'}</div>
                            <div>학생: {entry.학생명 || '-'}</div>
                            <div>과제: {Array.isArray(entry.과제목록) ? entry.과제목록.join(', ') : '-'}</div>
                            <div>진도: {Array.isArray(entry.진도목록) ? entry.진도목록.join(', ') : (entry.진도상황 || '-')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
