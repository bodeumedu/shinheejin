export const HELP_BOT_SUGGESTIONS = [
  '학생 등록은 어디서 하나요?',
  '반 만들기는 어떻게 해요?',
  '캘린더는 어떻게 보나요?',
  '전체 완성도와 테스트관리는 어떻게 써요?',
  '카카오톡 전송은 어디서 하나요?',
]

export const HELP_BOT_GUIDES = [
  {
    id: 'student-data',
    title: '학생 등록과 수정',
    keywords: ['학생', '등록', '학생등록', '학생 데이터', '학생데이터', '수정', '정보', '학년', '년생'],
    content:
      '학생 등록이나 학생 정보 수정은 메인 상단의 `학생 데이터`에서 진행합니다. 운영진 계정만 열 수 있습니다. 학생 데이터에서 이름, 연락처, 학년/년생, 반 정보 등을 관리하고, 수정하면 연결된 화면에 반영되도록 설계되어 있습니다.',
  },
  {
    id: 'class-builder',
    title: '반 만들기',
    keywords: ['반', '반만들기', '반 만들기', '분반', '수업', '클래스'],
    content:
      '새 반을 만들거나 기존 반 정보를 정리할 때는 메인 상단의 `반 만들기`를 사용합니다. 관, 과목, 요일, 시간, 선생님 정보를 기준으로 반을 구성하고, 이후 캘린더나 전체 완성도와 테스트관리에서 연결해서 사용합니다.',
  },
  {
    id: 'calendar',
    title: '캘린더 사용',
    keywords: ['캘린더', '시험', '휴강', '보강', '나의 캘린더', '일정'],
    content:
      '상단의 `캘린더` 버튼으로 시험 일정, 휴강, 직전보강, 선생님별 일정을 확인합니다. `나의 캘린더 보기`를 켜면 본인이나 연결된 선생님 기준 일정만 더 쉽게 볼 수 있습니다. 운영진은 일정 등록/수정 권한이 더 많습니다.',
  },
  {
    id: 'homework-dashboard',
    title: '전체 완성도와 테스트관리',
    keywords: ['완성도', '테스트관리', '전체 완성도와 테스트관리', '점수', '카카오', '카톡', '테스트', '평균', '석차'],
    content:
      '메인의 `전체 완성도와 테스트관리`에서 반별 과제 완료 상태와 테스트 점수를 관리합니다. 카테고리와 테스트 칸을 직접 추가할 수 있고, 점수 입력 후 카카오톡 미리보기/발송도 가능합니다. 필요하면 평균, 석차, 합산 결과까지 포함해 보낼 수 있습니다.',
  },
  {
    id: 'homework-completion',
    title: '숙제 과제 완료도',
    keywords: ['숙제', '과제 완료도', '완료도', '알림장', '개별 전송'],
    content:
      '메인의 `숙제 과제 완료도`에서는 날짜별 과제, 진도, 완료 체크, 개별 카카오 전송, 캘린더 연동 등을 관리합니다. 특정 날짜 기준 과제를 보고 저장하거나, 학생별/전체 발송 흐름을 사용할 수 있습니다.',
  },
  {
    id: 'clinic-log',
    title: '클리닉 대장',
    keywords: ['클리닉', '대장', '영어 클리닉', '수학 클리닉'],
    content:
      '클리닉 관련 발송이나 주간 이력은 `영어 클리닉 대장` 또는 수학 관련 관리 화면에서 확인합니다. 주차별 기록과 발송 내역을 기준으로 관리하는 흐름입니다.',
  },
  {
    id: 'weekly-schedule',
    title: '주간 시간표',
    keywords: ['주간 시간표', '시간표', '강의실', '교실'],
    content:
      '메인 상단의 `주간 시간표`에서 주별 수업 배정과 강의실 연결 정보를 확인합니다. 반 정보와 강의실을 함께 보려는 경우 이 화면을 사용합니다.',
  },
  {
    id: 'account',
    title: '계정과 권한',
    keywords: ['로그인', '회원가입', '권한', '운영진', '선생님', '직원', '계정'],
    content:
      '이 사이트는 선생님/직원/운영진 계정 체계를 사용합니다. 일부 화면은 운영진만 수정할 수 있고, 선생님은 본인 일정이나 수업 관련 화면 위주로 사용합니다. 계정 승인/활성 관리가 필요한 경우 관리자 페이지에서 처리합니다.',
  },
]

export function buildHelpBotKnowledgeText(guides = HELP_BOT_GUIDES) {
  return guides
    .map(
      (guide, index) =>
        `${index + 1}. ${guide.title}\n키워드: ${guide.keywords.join(', ')}\n설명: ${guide.content}`
    )
    .join('\n\n')
}

export function findRelevantGuides(question, limit = 4) {
  const text = String(question || '').trim().toLowerCase()
  if (!text) return HELP_BOT_GUIDES.slice(0, limit)

  const scored = HELP_BOT_GUIDES.map((guide) => {
    let score = 0
    guide.keywords.forEach((keyword) => {
      if (text.includes(String(keyword).toLowerCase())) score += 3
    })
    if (text.includes(guide.title.toLowerCase())) score += 4
    return { guide, score }
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.guide)

  return (scored.length > 0 ? scored : HELP_BOT_GUIDES).slice(0, limit)
}

export function buildLocalHelpBotAnswer(question) {
  const relevant = findRelevantGuides(question)
  if (!relevant.length) {
    return '이 기능은 사이트 사용법 질문 전용입니다. 예를 들어 `학생 등록`, `반 만들기`, `캘린더`, `카카오톡 전송`처럼 물어보시면 안내할 수 있어요.'
  }

  return [
    '다음 안내를 먼저 확인해보시면 됩니다.',
    '',
    ...relevant.map((guide) => `- ${guide.title}: ${guide.content}`),
    '',
    '원하시면 질문을 더 구체적으로 적어주세요. 예: `학생 등록은 어디서 해요?`, `반 만들기 후 캘린더 연결은 어떻게 해요?`',
  ].join('\n')
}
