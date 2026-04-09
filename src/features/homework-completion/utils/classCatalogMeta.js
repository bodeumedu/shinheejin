/** 반 만들기·출석체크 등에서 동일한 학교급·과목 판별 */

export const SUBJECT_OPTIONS = ['영어', '수학', '국어', '일본어', '중국어'];
export const SUBJECT_OPTIONS_BY_LENGTH = [...SUBJECT_OPTIONS].sort((a, b) => b.length - a.length);
export const SCHOOL_LEVEL_OPTIONS = ['전체', '중등', '고등'];

export function inferSchoolLevel(className) {
  const raw = String(className || '').replace(/\s+/g, '');
  if (!raw) return '';
  if (/중\d|중등|중학|중학생|초6/.test(raw)) return '중등';
  if (/고\d|고등|고교|고등부|수능/.test(raw)) return '고등';
  return '';
}

export function isHighMathTeacherClass(teacherName = '') {
  const compact = String(teacherName || '').replace(/\s+/g, '');
  if (!compact) return false;
  return compact.includes('이민하') || compact.includes('김지수');
}

export function isEnglishTeacherClass(teacherName = '') {
  const compact = String(teacherName || '').replace(/\s+/g, '').replace(/:/g, '');
  if (!compact) return false;
  return compact.includes('희진');
}

export function resolveClassSubject({ subject = '', teacher = '' }) {
  const normalizedSubject = String(subject || '').trim();
  if (normalizedSubject) return normalizedSubject;
  if (isHighMathTeacherClass(teacher)) return '수학';
  if (isEnglishTeacherClass(teacher)) return '영어';
  return '';
}

export function resolveSchoolLevelForEntry(entry) {
  if (isHighMathTeacherClass(entry?.teacher)) return '고등';
  return inferSchoolLevel(entry?.className);
}

export function parseClassNames(classNameStr) {
  if (!classNameStr || typeof classNameStr !== 'string') return [];
  return classNameStr
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseClassMetaFromKey(classKey) {
  const parts = String(classKey || '')
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean);
  const year = parts[0] || '';
  const teacher = parts[1] || '';

  if (parts.length === 5) {
    const mixedPart = parts[3] || '';
    const mixedSubject = SUBJECT_OPTIONS_BY_LENGTH.find((candidate) => mixedPart.includes(candidate));
    const mixedDay = mixedSubject ? mixedPart.replace(mixedSubject, '').replace(/\s+/g, '') : '';
    if (mixedSubject && /^[월화수목금토일]{1,7}$/.test(mixedDay)) {
      return {
        year,
        teacher,
        className: parts[2] || '',
        subject: mixedSubject,
        day: mixedDay,
        time: parts[4] || '',
      };
    }
    return {
      year,
      teacher,
      className: parts[2] || '',
      subject: '',
      day: parts[3] || '',
      time: parts[4] || '',
    };
  }

  if (parts.length === 6) {
    if (SUBJECT_OPTIONS.includes(parts[3] || '') && /^[월화수목금토일]{1,7}$/.test(parts[4] || '')) {
      return {
        year,
        teacher,
        className: parts[2] || '',
        subject: parts[3] || '',
        day: parts[4] || '',
        time: parts[5] || '',
      };
    }
    return {
      year,
      teacher,
      className: [parts[2] || '', parts[3] || ''].filter(Boolean).join(' ').trim(),
      subject: '',
      day: parts[4] || '',
      time: parts[5] || '',
    };
  }

  if (
    parts.length === 7 &&
    parts[2] === teacher &&
    /^[월화수목금토일]{1,7}$/.test(parts[4] || '') &&
    /^[월화수목금토일]{1,7}$/.test(parts[5] || '')
  ) {
    const classLabel = parts[3] || '';
    const foundSubject = SUBJECT_OPTIONS_BY_LENGTH.find((candidate) => classLabel.endsWith(candidate));
    if (foundSubject) {
      return {
        year,
        teacher,
        className: classLabel.slice(0, classLabel.length - foundSubject.length).trim(),
        subject: foundSubject,
        day: parts[4] || '',
        time: parts[6] || '',
      };
    }
  }

  const tail = parts.slice(2);
  const time = tail[tail.length - 1] || '';
  const day = tail[tail.length - 2] || '';
  const className = tail.slice(0, -2).join(' ').trim();
  return {
    year,
    teacher,
    className,
    subject: '',
    day,
    time,
  };
}

export function normalizeClassCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((key) => {
    const raw = value[key];
    const parsed = parseClassMetaFromKey(key);
    out[key] = {
      year: String(raw?.year || parsed.year || '').trim(),
      teacher: String(raw?.teacher || parsed.teacher || '').trim(),
      className: String(raw?.className || parsed.className || '').trim(),
      subject: resolveClassSubject({
        subject: String(raw?.subject || parsed.subject || '').trim(),
        teacher: String(raw?.teacher || parsed.teacher || '').trim(),
      }),
      hall: String(raw?.hall || '중앙관').trim(),
      day: String(raw?.day || parsed.day || '').trim(),
      time: String(raw?.time || parsed.time || '').trim(),
      room: String(raw?.room || '').trim(),
      tuition: String(raw?.tuition || '').trim(),
      newStudentNotice: String(raw?.newStudentNotice || '').trim(),
      monthlyCurriculum: String(raw?.monthlyCurriculum || '').trim(),
      createdAt: raw?.createdAt || '',
      updatedAt: raw?.updatedAt || '',
    };
  });
  return out;
}

/** 반 키에 대한 학교급·과목 (반 목록 필터용, HomeworkClassBuilder classEntries와 동일 기준) */
export function buildClassFilterEntry(classKey, normalizedCatalog = {}) {
  const catalogItem = normalizedCatalog[classKey] || {};
  const parsed = parseClassMetaFromKey(classKey);
  const teacher = String(catalogItem.teacher || parsed.teacher || '').trim();
  const className = String(catalogItem.className || parsed.className || classKey).trim();
  const subject = resolveClassSubject({
    subject: String(catalogItem.subject || parsed.subject || '').trim(),
    teacher,
  });
  const level = resolveSchoolLevelForEntry({ className, teacher });
  return { classKey, teacher, className, subject, level };
}
