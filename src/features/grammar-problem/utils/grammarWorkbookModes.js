/** 문법 워크북 — 문제 유형 탭 (UI + 프롬프트) */

export const GRAMMAR_WORKBOOK_MODES = [
  {
    id: 'concept',
    label: '1. 개념',
    shortTitle: '개념',
    description: '개념 빈칸, O/X 이유, 문장 성분 분석, 용법 매칭, 개념 비교처럼 이해도를 확인하는 개념형 문제',
  },
  {
    id: 'workbook',
    label: '2. 워크북',
    shortTitle: '워크북',
    description: '형태 고르기, 단순 변형, 문장 결합, 문장 전환, 청크 배열처럼 반복 연습하는 워크북형 문제',
  },
  {
    id: 'mcq',
    label: '3. 객관식',
    shortTitle: '객관식',
    description: '밑줄 오류, A/B/C 조합, 올바른 문장, 용법 구별, 오류 개수처럼 시험형 객관식 문제',
  },
  {
    id: 'essay',
    label: '4. 서술형',
    shortTitle: '서술형',
    description:
      '오류 수정, 조건 영작, 문장 전환, 해석, 요약 영작처럼 답안 작성과 채점이 가능한 서술형 문제',
  },
]

export function getGrammarWorkbookMode(id) {
  return GRAMMAR_WORKBOOK_MODES.find((m) => m.id === id) || GRAMMAR_WORKBOOK_MODES[0]
}

/** @param {string} modeId */
export function isEssayMode(modeId) {
  return modeId === 'essay'
}

/** @param {string} modeId */
export function isWritingMode(modeId) {
  return modeId !== 'mcq'
}

/** @param {string} modeId */
export function isSingleColumnMode(modeId) {
  return modeId !== 'mcq'
}
