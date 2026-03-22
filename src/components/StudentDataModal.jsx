import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';
import './StudentDataModal.css';

const CLINIC_RECORDS_PREFIX = 'clinicRecordValues_english_';
const CLINIC_CUSTOMS_PREFIX = 'clinicCustomEntries_english_';
const HOMEWORK_PHONE_DOC = 'homeworkCompletionPhoneNumbers';
const HOMEWORK_PHONE_DOC_ID = 'all';
const WITHDRAWN_STORAGE_KEY = 'studentDataWithdrawnNames';
const KAKAO_HISTORY_COLLECTION = 'studentDataKakaoHistory';
const KAKAO_HISTORY_DOC_ID = 'all';
// 학생 데이터 개별 카톡 발송용 템플릿 (솔라피 검수 후 코드 교체) — 변수: 학생명, 학년, 반명, 공지
const STUDENT_DATA_KAKAO_TEMPLATE = 'KA01TP_STUDENT_DATA_INDIVIDUAL';

function loadWithdrawnNames() {
  try {
    const raw = localStorage.getItem(WITHDRAWN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWithdrawnNames(names) {
  try {
    localStorage.setItem(WITHDRAWN_STORAGE_KEY, JSON.stringify(names));
  } catch (e) {
    console.warn('퇴원 목록 저장 실패:', e);
  }
}

/**
 * 학년 문자열 → 출생 연도 (현재 **달력 연도** 기준, 일반적인 고교 내신 학년↔년생 대응)
 * 예: 2026년 기준 고2 → 2009년생(09년생), 고3 → 08년생, 고1 → 10년생
 */
function inferBirthYearFromGrade(gradeStr) {
  const raw = String(gradeStr || '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');

  const go = compact.match(/고(\d)/);
  if (go) {
    const g = parseInt(go[1], 10);
    if (g >= 1 && g <= 3) {
      const ac = new Date().getFullYear();
      return ac - 15 - g;
    }
  }
  const jung = compact.match(/중(\d)/);
  if (jung) {
    const g = parseInt(jung[1], 10);
    if (g >= 1 && g <= 3) {
      const ac = new Date().getFullYear();
      return ac - 12 - g;
    }
  }
  return null;
}

function birthYearToKoreanYearLabel(fullYear) {
  if (fullYear == null || !Number.isFinite(fullYear)) return null;
  const yy = fullYear % 100;
  return `${String(yy).padStart(2, '0')}년생`;
}

/** 숙제 완료도 반명 → 읽기 쉬운 표시 (년도_강사_수업이름_요일_시간) */
function formatHomeworkClassDisplay(className) {
  if (!className) return '';
  const parts = String(className).split('_');
  if (parts.length >= 5) {
    return `${parts[2]} (${parts[3]} ${parts[4]})`;
  }
  return String(className);
}

export default function StudentDataModal({ onClose }) {
  const [list, setList] = useState([]);
  const [withdrawnSet, setWithdrawnSet] = useState(() => new Set(loadWithdrawnNames()));
  const [studentDataTab, setStudentDataTab] = useState('list'); // 'list' | 'withdrawnByYear'
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [savingPhones, setSavingPhones] = useState(false);
  const [sendingKakaoFor, setSendingKakaoFor] = useState(null); // 카톡 발송 중인 학생명
  const [kakaoHistory, setKakaoHistory] = useState([]); // { studentName, date, message, timestamp }[]
  const [historyStudent, setHistoryStudent] = useState(null); // 이름 클릭 시 해당 학생 발송 이력 모달
  /** 숙제 완료도에서 반 삭제 시 누적된 이력 { [이름]: [{ className, removedAt }] } */
  const [studentClassHistoryMap, setStudentClassHistoryMap] = useState({});

  // 전화번호 수정 (목록 상태만 변경)
  const updatePhoneInList = useCallback((name, field, value) => {
    setList((prev) => prev.map((row) =>
      row.name === name ? { ...row, [field]: value } : row
    ));
  }, []);

  // 숙제 과제 완료도 Firestore에 전화번호 저장 (학생/학부모만)
  const savePhonesToFirebase = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) {
      alert('Firebase가 설정되지 않았습니다.');
      return;
    }
    setSavingPhones(true);
    try {
      const docRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
      const snap = await getDoc(docRef);
      const existing = snap.exists() ? snap.data() : {};
      const existingPhoneNumbers = existing.phoneNumbers || {};
      const merged = { ...existingPhoneNumbers };
      list.forEach((row) => {
        if (!row.name) return;
        merged[row.name] = {
          ...(merged[row.name] || {}),
          student: row.studentPhone != null ? String(row.studentPhone).trim() : (merged[row.name]?.student ?? ''),
          parent: row.parentPhone != null ? String(row.parentPhone).trim() : (merged[row.name]?.parent ?? ''),
        };
      });
      await setDoc(docRef, {
        ...existing,
        phoneNumbers: merged,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });
      alert('✅ 전화번호가 저장되었습니다.');
    } catch (e) {
      console.error('전화번호 저장 실패:', e);
      alert('전화번호 저장에 실패했습니다.');
    } finally {
      setSavingPhones(false);
    }
  }, [list]);

  const loadAllStudents = useCallback(async () => {
    setLoading(true);
    setStudentClassHistoryMap({});
    const byName = new Map(); // name -> { name, school, grade, className, studentPhone, parentPhone, parentPhone2 }

    // 1) 영어 클리닉 대장: localStorage 모든 주차
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(CLINIC_RECORDS_PREFIX)) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          let records = null;
          try {
            const parsed = JSON.parse(raw);
            records = parsed && typeof parsed === 'object' && parsed.records ? parsed.records : parsed;
          } catch (_) {
            continue;
          }
          if (!records || typeof records !== 'object') continue;
          Object.values(records).forEach((r) => {
            if (!r || typeof r !== 'object') return;
            const name = (r.student != null || r.studentName != null)
              ? String(r.student ?? r.studentName ?? '').trim()
              : '';
            if (!name) return;
            const cur = byName.get(name) || { name: name, school: '', grade: '', className: '', studentPhone: '', parentPhone: '', parentPhone2: '' };
            cur.name = name;
            if (r.school != null) cur.school = r.school;
            if (r.grade != null) cur.grade = r.grade;
            if (r.className != null) cur.className = r.className;
            if (r.phoneNumber != null) cur.studentPhone = r.phoneNumber;
            if (r.parentPhoneNumber != null) cur.parentPhone = r.parentPhoneNumber;
            if (r.parentPhoneNumber2 != null) cur.parentPhone2 = r.parentPhoneNumber2;
            byName.set(name, cur);
          });
        }
        if (key.startsWith(CLINIC_CUSTOMS_PREFIX)) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          let customs = null;
          try {
            const parsed = JSON.parse(raw);
            customs = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.customs) ? parsed.customs : []);
          } catch (_) {
            continue;
          }
          (customs || []).forEach((c) => {
            if (!c || typeof c !== 'object') return;
            const name = (c.student != null || c.studentName != null)
              ? String(c.student ?? c.studentName ?? '').trim()
              : '';
            if (!name) return;
            const cur = byName.get(name) || { name: name, school: '', grade: '', className: '', studentPhone: '', parentPhone: '', parentPhone2: '' };
            cur.name = name;
            if (c.school != null) cur.school = c.school;
            if (c.grade != null) cur.grade = c.grade;
            if (c.className != null) cur.className = c.className;
            byName.set(name, cur);
          });
        }
      }
    } catch (e) {
      console.warn('클리닉 데이터 수집 실패:', e);
    }

    // 2) 숙제 과제 완료도: Firestore
    // 반(반명)은 숙제 과제 완료도의 studentInfo를 기준으로 한다. (클리닉 반은 완료도에 학생이 있으면 사용하지 않음)
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, HOMEWORK_PHONE_DOC, HOMEWORK_PHONE_DOC_ID);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const hist = data.studentClassHistory;
          setStudentClassHistoryMap(
            hist && typeof hist === 'object' && !Array.isArray(hist) ? hist : {}
          );
          const students = data.students || [];
          const studentInfo = data.studentInfo || {};
          const phoneNumbers = data.phoneNumbers || {};

          const extractStudentName = (item) => {
            if (item == null) return '';
            if (typeof item === 'string') return String(item).trim();
            const raw = item.name || item.student;
            return raw != null ? String(raw).trim() : '';
          };

          const homeworkNames = new Set();
          students.forEach((item) => {
            const n = extractStudentName(item);
            if (n) homeworkNames.add(n);
          });
          Object.keys(studentInfo || {}).forEach((k) => {
            const t = String(k).trim();
            if (t) homeworkNames.add(t);
          });
          Object.keys(phoneNumbers || {}).forEach((k) => {
            const t = String(k).trim();
            if (t) homeworkNames.add(t);
          });

          homeworkNames.forEach((n) => {
            const info = studentInfo[n] || {};
            const phones = phoneNumbers[n] || {};
            const cur = byName.get(n) || { name: n, school: '', grade: '', className: '', studentPhone: '', parentPhone: '', parentPhone2: '' };
            cur.name = n;
            if (info.school != null && String(info.school).trim() !== '') cur.school = info.school;
            if (info.grade != null && String(info.grade).trim() !== '') cur.grade = info.grade;
            // 반: 완료도에만 반영(값 없으면 빈 칸·표시는 '-')
            const hwClassRaw = info.className;
            cur.className =
              hwClassRaw != null && String(hwClassRaw).trim() !== '' ? hwClassRaw : '';
            if (phones.student != null && String(phones.student).trim() !== '') {
              cur.studentPhone = cur.studentPhone || phones.student;
            }
            if (phones.parent != null && String(phones.parent).trim() !== '') {
              cur.parentPhone = cur.parentPhone || phones.parent;
            }
            byName.set(n, cur);
          });
        }
      } catch (e) {
        console.warn('숙제 완료도 데이터 수집 실패:', e);
      }
    }

    let arr = Array.from(byName.entries()).map(([keyName, row]) => {
      const displayName = (row.name && String(row.name).trim()) || (keyName && String(keyName).trim()) || '(이름 없음)';
      return { ...row, name: displayName };
    }).filter((row) => row.name && row.name !== '(이름 없음)');
    const withdrawn = loadWithdrawnNames();
    const withdrawnSetLocal = new Set(withdrawn);
    arr.sort((a, b) => {
      const aOut = withdrawnSetLocal.has(a.name);
      const bOut = withdrawnSetLocal.has(b.name);
      if (aOut !== bOut) return aOut ? 1 : -1;
      return (a.name || '').localeCompare(b.name || '');
    });
    setWithdrawnSet(withdrawnSetLocal);
    setList(arr);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAllStudents();
  }, [loadAllStudents]);

  // 학생 데이터 카톡 발송 이력 로드
  const loadKakaoHistory = useCallback(async () => {
    if (!isFirebaseConfigured() || !db) return;
    try {
      const ref = doc(db, KAKAO_HISTORY_COLLECTION, KAKAO_HISTORY_DOC_ID);
      const snap = await getDoc(ref);
      const entries = (snap.exists() && snap.data().entries) || [];
      setKakaoHistory(Array.isArray(entries) ? entries : []);
    } catch (e) {
      console.warn('카톡 발송 이력 로드 실패:', e);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadKakaoHistory();
  }, [loading, loadKakaoHistory]);

  const apiUrl = typeof window !== 'undefined' && window.location
    ? `${window.location.origin}/api/send-kakao`
    : 'https://bodeumshjpocketbook.vercel.app/api/send-kakao';

  const sendKakaoToStudent = useCallback(async (row) => {
    const trimmed = (messageText || '').trim();
    if (!trimmed) {
      alert('메시지 내용을 입력한 뒤 카톡 보내기를 눌러주세요.');
      return;
    }
    const phoneRegex = /^01[0-9]{1}[0-9]{7,8}$/;
    const studentPhone = (row.studentPhone || '').replace(/[^0-9]/g, '');
    const parentPhone = (row.parentPhone || '').replace(/[^0-9]/g, '');
    if (!studentPhone && !parentPhone) {
      alert('해당 학생의 학생 전화 또는 학부모 전화번호를 입력해주세요.');
      return;
    }
    setSendingKakaoFor(row.name);
    const variables = {
      학생명: row.name || '',
      학년: row.grade || '',
      반명: row.className || '',
      공지: trimmed,
    };
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    let success = 0;
    try {
      if (studentPhone && phoneRegex.test(studentPhone)) {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: studentPhone,
            templateCode: STUDENT_DATA_KAKAO_TEMPLATE,
            variables,
          }),
        });
        const data = await res.json();
        if (data && data.success) success++;
      }
      if (parentPhone && phoneRegex.test(parentPhone)) {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: parentPhone,
            templateCode: STUDENT_DATA_KAKAO_TEMPLATE,
            variables,
          }),
        });
        const data = await res.json();
        if (data && data.success) success++;
      }
      if (success > 0) {
        const entry = { studentName: row.name, date: today, message: trimmed, timestamp: now };
        setKakaoHistory((prev) => [...prev, entry]);
        if (isFirebaseConfigured() && db) {
          try {
            const ref = doc(db, KAKAO_HISTORY_COLLECTION, KAKAO_HISTORY_DOC_ID);
            const snap = await getDoc(ref);
            const existing = (snap.exists() && snap.data().entries) || [];
            await setDoc(ref, { entries: [...(Array.isArray(existing) ? existing : []), entry], lastUpdated: now }, { merge: true });
          } catch (err) {
            console.warn('발송 이력 저장 실패:', err);
          }
        }
        alert(`✅ ${row.name}님에게 카카오톡 ${success}건 발송되었습니다.`);
      } else {
        alert('발송에 실패했습니다. 전화번호와 솔라피 템플릿 코드를 확인해주세요.');
      }
    } catch (e) {
      console.error(e);
      alert('카카오톡 발송 중 오류가 발생했습니다.');
    } finally {
      setSendingKakaoFor(null);
    }
  }, [messageText, apiUrl]);

  const toggleWithdrawn = (name) => {
    const next = new Set(withdrawnSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setWithdrawnSet(next);
    saveWithdrawnNames(Array.from(next));
    setList((prev) => {
      const copy = [...prev];
      copy.sort((a, b) => {
        const aOut = next.has(a.name);
        const bOut = next.has(b.name);
        if (aOut !== bOut) return aOut ? 1 : -1;
        return (a.name || '').localeCompare(b.name || '');
      });
      return copy;
    });
  };

  const withdrawnByBirthYear = useMemo(() => {
    const rows = list.filter((r) => withdrawnSet.has(r.name));
    const map = new Map();
    for (const row of rows) {
      const fy = inferBirthYearFromGrade(row.grade);
      const label = fy != null ? birthYearToKoreanYearLabel(fy) : '학년 미인식';
      if (!map.has(label)) {
        map.set(label, { birthYear: fy, students: [] });
      }
      map.get(label).students.push(row);
    }
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const fa = a[1].birthYear;
      const fb = b[1].birthYear;
      if (fa == null && fb == null) return a[0].localeCompare(b[0]);
      if (fa == null) return 1;
      if (fb == null) return -1;
      return fa - fb;
    });
    entries.forEach(([, g]) => {
      g.students.sort((x, y) => (x.name || '').localeCompare(y.name || '', 'ko'));
    });
    return entries;
  }, [list, withdrawnSet]);

  const withdrawnCount = useMemo(
    () => list.filter((r) => withdrawnSet.has(r.name)).length,
    [list, withdrawnSet]
  );

  const historyStudentPastClasses = useMemo(() => {
    if (!historyStudent) return [];
    const raw = studentClassHistoryMap[historyStudent];
    const arr = Array.isArray(raw) ? [...raw] : [];
    arr.sort((a, b) => String(b.removedAt || '').localeCompare(String(a.removedAt || '')));
    return arr;
  }, [historyStudent, studentClassHistoryMap]);

  return (
    <div className="student-data-modal-overlay" onClick={onClose}>
      <div className="student-data-modal" onClick={(e) => e.stopPropagation()}>
        <div className="student-data-modal-header">
          <h2>👥 학생 데이터</h2>
          <button type="button" className="student-data-modal-close" onClick={onClose}>닫기</button>
        </div>
        {loading ? (
          <p className="student-data-loading">불러오는 중...</p>
        ) : (
          <>
            <div className="student-data-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={studentDataTab === 'list'}
                className={`student-data-tab ${studentDataTab === 'list' ? 'student-data-tab-active' : ''}`}
                onClick={() => setStudentDataTab('list')}
              >
                전체 명단
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={studentDataTab === 'withdrawnByYear'}
                className={`student-data-tab ${studentDataTab === 'withdrawnByYear' ? 'student-data-tab-active' : ''}`}
                onClick={() => setStudentDataTab('withdrawnByYear')}
              >
                퇴원생 (년생별){withdrawnCount > 0 ? ` · ${withdrawnCount}명` : ''}
              </button>
            </div>

            {studentDataTab === 'list' ? (
              <>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 10px 0' }}>
              <strong>반</strong> 열은 숙제 과제 완료도(Firestore)에 등록된 반명만 표시합니다. 완료도에 없는 학생만 영어 클리닉 대장의 반명이 쓰입니다.
            </p>
            <div className="student-data-table-wrap">
              <table className="student-data-table">
                <thead>
                  <tr>
                    <th>번호</th>
                    <th>학교</th>
                    <th>학년</th>
                    <th>반</th>
                    <th>이름</th>
                    <th>연락처 (학생/학부모)</th>
                    <th>구분</th>
                    <th>퇴원 처리</th>
                    <th>카톡 보내기</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row, idx) => (
                    <tr key={row.name} className={withdrawnSet.has(row.name) ? 'student-data-row-withdrawn' : ''}>
                      <td>{idx + 1}</td>
                      <td>{row.school || '-'}</td>
                      <td>{row.grade || '-'}</td>
                      <td>{row.className || '-'}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setHistoryStudent(row.name)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontWeight: '700',
                            color: '#1d4ed8',
                            textDecoration: 'underline',
                            fontSize: 'inherit',
                          }}
                        >
                          {row.name || '(이름 없음)'}
                        </button>
                      </td>
                      <td style={{ minWidth: '140px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <input
                            type="text"
                            value={row.studentPhone || ''}
                            onChange={(e) => updatePhoneInList(row.name, 'studentPhone', e.target.value)}
                            placeholder="학생 010-0000-0000"
                            className="student-data-phone-input"
                          />
                          <input
                            type="text"
                            value={row.parentPhone || ''}
                            onChange={(e) => updatePhoneInList(row.name, 'parentPhone', e.target.value)}
                            placeholder="학부모 010-0000-0000"
                            className="student-data-phone-input"
                          />
                          <input
                            type="text"
                            value={row.parentPhone2 || ''}
                            onChange={(e) => updatePhoneInList(row.name, 'parentPhone2', e.target.value)}
                            placeholder="학부모2 010-0000-0000"
                            className="student-data-phone-input"
                          />
                        </div>
                      </td>
                      <td>{withdrawnSet.has(row.name) ? '퇴원생' : '재원생'}</td>
                      <td>
                        <button
                          type="button"
                          className="student-data-toggle-withdrawn"
                          onClick={() => toggleWithdrawn(row.name)}
                        >
                          {withdrawnSet.has(row.name) ? '재원 전환' : '퇴원 처리'}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={sendingKakaoFor === row.name}
                          onClick={() => sendKakaoToStudent(row)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.85rem',
                            backgroundColor: sendingKakaoFor === row.name ? '#9ca3af' : '#FEE500',
                            color: '#000',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: sendingKakaoFor === row.name ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                          }}
                        >
                          {sendingKakaoFor === row.name ? '발송 중…' : '카톡 보내기'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            ) : (
              <div className="student-data-withdrawn-by-year">
                <p className="student-data-withdrawn-by-year-hint">
                  퇴원 처리된 학생만 표시합니다. <strong>년생</strong>은 표에 적힌 <strong>학년</strong>(고1·고2·고3, 중1~3)과{' '}
                  <strong>올해 연도({new Date().getFullYear()}년)</strong>를 기준으로 맞춥니다.
                  예: {new Date().getFullYear()}년 기준 <strong>고2 → 09년생</strong>, 고3 → 08년생, 고1 → 10년생.
                  학년 칸이 비었거나 인식할 수 없으면 「학년 미인식」으로 묶습니다.
                </p>
                {withdrawnCount === 0 ? (
                  <p className="student-data-withdrawn-empty">퇴원생이 없습니다. 전체 명단에서 「퇴원 처리」를 하면 여기에 모입니다.</p>
                ) : (
                  <div className="student-data-withdrawn-sections">
                    {withdrawnByBirthYear.map(([label, group]) => (
                      <section key={label} className="student-data-year-section">
                        <h3 className="student-data-year-section-title">
                          {label}
                          <span className="student-data-year-section-count">({group.students.length}명)</span>
                          {group.birthYear != null && (
                            <span className="student-data-year-section-meta"> · 출생 {group.birthYear}년</span>
                          )}
                        </h3>
                        <ul className="student-data-year-student-list">
                          {group.students.map((row) => (
                            <li key={row.name} className="student-data-year-student-item">
                              <span className="student-data-year-name">{row.name}</span>
                              <span className="student-data-year-meta">
                                {[row.school, row.grade, row.className]
                                  .map((s) => (s != null && String(s).trim() !== '' ? String(s).trim() : null))
                                  .filter(Boolean)
                                  .join(' · ') || '-'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={savePhonesToFirebase}
                disabled={savingPhones || list.length === 0}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.9rem',
                  backgroundColor: savingPhones || list.length === 0 ? '#9ca3af' : '#9b59b6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: savingPhones || list.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                }}
              >
                {savingPhones ? '저장 중…' : '전화번호 저장 (숙제 완료도 반영)'}
              </button>
            </div>
            <div className="student-data-message-section">
              <label className="student-data-message-label">개별 카톡 발송</label>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
                메시지를 입력한 뒤, <strong>전체 명단</strong> 탭에서 해당 학생 행의 「카톡 보내기」 버튼을 누르면 해당 학생·학부모 번호로 발송됩니다.
              </p>
              <textarea
                className="student-data-message-input"
                placeholder="보낼 메시지 내용을 입력하세요 (아래에서 학생별로 카톡 보내기 버튼 클릭)"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
              />
            </div>

            {/* 학생별 카톡 발송 이력 모달 */}
            {historyStudent && (
              <div
                className="student-data-modal-overlay"
                style={{ position: 'fixed', zIndex: 10001 }}
                onClick={() => setHistoryStudent(null)}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '480px',
                    width: '90%',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📋 {historyStudent}</h3>
                    <button
                      type="button"
                      onClick={() => setHistoryStudent(null)}
                      style={{
                        padding: '6px 12px',
                        background: '#6b7280',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                      }}
                    >
                      닫기
                    </button>
                  </div>
                  <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: '700', color: '#1e40af', marginBottom: '10px', fontSize: '0.95rem' }}>
                      📚 이전 수강 반 (삭제된 반)
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                      숙제 과제 완료도에서 「반 삭제」 후 <strong>저장</strong>하면 여기에 기록됩니다. 현재 수강 반은 표의 「반」 열을 보세요.
                    </p>
                    {historyStudentPastClasses.length === 0 ? (
                      <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.9rem' }}>기록된 삭제 반 내역이 없습니다.</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '18px' }}>
                        {historyStudentPastClasses.map((entry, i) => (
                          <li key={`${entry.className}-${entry.removedAt}-${i}`} style={{ marginBottom: '10px', fontSize: '0.88rem' }}>
                            <div style={{ fontWeight: '600', color: '#374151' }}>
                              {formatHomeworkClassDisplay(entry.className)}
                            </div>
                            <div style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: '2px' }}>
                              원문: <code style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>{entry.className}</code>
                            </div>
                            {entry.removedAt ? (
                              <div style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: '4px' }}>
                                삭제 기록 시각: {entry.removedAt.slice(0, 19).replace('T', ' ')}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div style={{ fontWeight: '700', color: '#374151', marginBottom: '10px', fontSize: '0.95rem' }}>📩 카톡 발송 이력</div>
                  {(() => {
                    const byStudent = kakaoHistory.filter((e) => e.studentName === historyStudent);
                    const byDate = {};
                    byStudent.forEach((e) => {
                      const d = e.date || e.timestamp?.slice(0, 10) || '';
                      if (!byDate[d]) byDate[d] = [];
                      byDate[d].push(e);
                    });
                    const dates = Object.keys(byDate).sort().reverse();
                    if (dates.length === 0) {
                      return <p style={{ color: '#6b7280', margin: 0 }}>아직 발송된 카톡이 없습니다.</p>;
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {dates.map((date) => (
                          <div key={date}>
                            <div style={{ fontWeight: '700', color: '#374151', marginBottom: '8px', fontSize: '0.95rem' }}>
                              {date}
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                              {(byDate[date] || []).map((entry, i) => (
                                <li key={i} style={{ marginBottom: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {entry.message || '(내용 없음)'}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
