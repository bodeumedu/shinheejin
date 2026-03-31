/**
 * to부정사 문법 — 대단원(로마 숫자) + 세부 주제(id: 1-1 … 16-4)
 * UI·생성 프롬프트에서 공통 사용
 */
export const TO_INFINITIVE_SECTIONS = [
  {
    id: 'I',
    title: 'Ⅰ. to부정사의 개념과 형태',
    topics: [
      { id: '1-1', label: '1-1. to부정사란 무엇인가' },
      { id: '1-2', label: '1-2. 기본 형태: to + 동사원형' },
      { id: '1-3', label: '1-3. 준동사로서의 특징' },
      { id: '1-4', label: '1-4. 문장 안에서의 역할 개요' },
    ],
  },
  {
    id: 'II',
    title: 'Ⅱ. 명사적 용법',
    topics: [
      { id: '2-1', label: '2-1. 주어 역할' },
      { id: '2-2', label: '2-2. 보어 역할' },
      { id: '2-3', label: '2-3. 목적어 역할' },
      { id: '2-4', label: '2-4. 가주어 it을 이용한 문장' },
      { id: '2-5', label: '2-5. 의문사 + to부정사' },
    ],
  },
  {
    id: 'III',
    title: 'Ⅲ. 형용사적 용법',
    topics: [
      { id: '3-1', label: '3-1. 명사를 뒤에서 수식하는 역할' },
      { id: '3-2', label: '3-2. 해석 방법' },
      { id: '3-3', label: '3-3. 목적격 관계대명사와의 관련성' },
      { id: '3-4', label: '3-4. 수식 받는 명사와 의미 관계 파악' },
    ],
  },
  {
    id: 'IV',
    title: 'Ⅳ. 부사적 용법',
    topics: [
      { id: '4-1', label: '4-1. 목적: ~하기 위해' },
      { id: '4-2', label: '4-2. 원인: ~해서' },
      { id: '4-3', label: '4-3. 결과: ~하여 결국' },
      { id: '4-4', label: '4-4. 판단의 근거' },
      { id: '4-5', label: '4-5. 감정의 원인' },
      { id: '4-6', label: '4-6. 조건·가정에 가까운 해석' },
    ],
  },
  {
    id: 'V',
    title: 'Ⅴ. 의미상 주어·시제·태·부정',
    topics: [
      { id: '5-1', label: '5-1. for + 목적격 + to부정사' },
      { id: '5-2', label: '5-2. of + 목적격 + to부정사' },
      { id: '5-3', label: '5-3. 의미상 주어가 생략되는 경우' },
      { id: '5-4', label: '5-4. 일반 주어와 의미상 주어 구별' },
      { id: '6-1', label: '6-1. 단순형: to do' },
      { id: '6-2', label: '6-2. 완료형: to have p.p.' },
      { id: '6-3', label: '6-3. 수동형: to be p.p.' },
      { id: '6-4', label: '6-4. 완료수동형: to have been p.p.' },
      { id: '7-1', label: '7-1. not to부정사' },
      { id: '7-2', label: '7-2. never to부정사' },
      { id: '7-3', label: '7-3. 부분 부정과 전체 부정' },
    ],
  },
  {
    id: 'VI',
    title: 'Ⅵ. 중요 구문과 실전 문제',
    topics: [
      { id: '8-1', label: '8-1. to부정사 뒤 목적어가 오는 경우' },
      { id: '8-2', label: '8-2. 보어를 필요로 하는 동사' },
      { id: '8-3', label: '8-3. 5형식과 to부정사' },
      { id: '8-4', label: '8-4. ask, want, tell, allow 등의 구조' },
      { id: '9-1', label: '9-1. want + 목적어 + to부정사' },
      { id: '9-2', label: '9-2. tell + 목적어 + to부정사' },
      { id: '9-3', label: '9-3. advise, encourage, force, allow 등' },
      { id: '9-4', label: '9-4. 지각동사·사역동사와의 비교' },
      { id: '10-1', label: '10-1. too ~ to 용법' },
      { id: '10-2', label: '10-2. enough to 용법' },
      { id: '10-3', label: '10-3. 의미상 주어와 함께 쓰기' },
      { id: '10-4', label: '10-4. 자주 나오는 변형 표현' },
      { id: '11-1', label: '11-1. 사역동사 make, have, let' },
      { id: '11-2', label: '11-2. 지각동사 see, hear, feel' },
      { id: '11-3', label: '11-3. help 뒤의 to 생략' },
      { id: '11-4', label: '11-4. why not + 동사원형' },
      { id: '12-1', label: '12-1. in order to / so as to' },
      { id: '12-2', label: '12-2. only to' },
      { id: '12-3', label: '12-3. too ~ to / enough to' },
      { id: '12-4', label: '12-4. be to 용법' },
      { id: '12-5', label: '12-5. come to / grow up to / live to' },
      { id: '13-1', label: '13-1. 목적어로 둘 다 가능한 동사' },
      { id: '13-2', label: '13-2. 의미 차이가 생기는 동사' },
      { id: '13-3', label: '13-3. forget, remember, try, stop 등' },
      { id: '13-4', label: '13-4. 시험에 자주 나오는 포인트' },
      { id: '14-1', label: '14-1. 독립부정사' },
      { id: '14-2', label: '14-2. 의문사 + to부정사' },
      { id: '14-3', label: '14-3. seem, appear + to부정사' },
      { id: '14-4', label: '14-4. be likely to / be sure to / be ready to' },
      { id: '14-5', label: '14-5. 명사 + to부정사 구조 심화' },
      { id: '15-1', label: '15-1. 문장 속 용법 판별' },
      { id: '15-2', label: '15-2. 해석 순서 연습' },
      { id: '15-3', label: '15-3. 어법 문제 포인트' },
      { id: '15-4', label: '15-4. 서술형 대비 핵심 정리' },
      { id: '16-1', label: '16-1. 핵심 개념 한눈에 보기' },
      { id: '16-2', label: '16-2. 용법 비교표' },
      { id: '16-3', label: '16-3. 자주 틀리는 표현' },
      { id: '16-4', label: '16-4. 내신·수능형 문제 적용' },
    ],
  },
]

export function getAllTopicIds() {
  const ids = []
  for (const sec of TO_INFINITIVE_SECTIONS) {
    for (const t of sec.topics) ids.push(t.id)
  }
  return ids
}

export function getTopicLabelById(topicId) {
  for (const sec of TO_INFINITIVE_SECTIONS) {
    const t = sec.topics.find((x) => x.id === topicId)
    if (t) return `${sec.title} — ${t.label}`
  }
  return topicId
}
