/** 문법 워크북 — 문제 유형 탭 (UI + 프롬프트) */

export const GRAMMAR_WORKBOOK_MODES = [
  {
    id: 'concept',
    label: '1. 개념',
    shortTitle: '개념',
    description: '한글로 문법 개념을 확인하는 문제 (정의·용어·구별·판단 등)',
  },
  {
    id: 'workbook',
    label: '2. 워크북',
    shortTitle: '워크북',
    description: '용법 고르기, 빈칸, 짧은 문장 완성 등 기초 문제',
  },
  {
    id: 'mcq',
    label: '3. 객관식',
    shortTitle: '객관식',
    description: '틀린 어법, 다른 용법 찾기, 옳은 문장 개수, 옳은 문장 모두 고르기 등',
  },
  {
    id: 'essay',
    label: '4. 서술형',
    shortTitle: '서술형',
    description:
      '【한글 해석】으로 문법 포인트가 드러나는 뜻을 주고, 【영작에 사용할 단어】를 제시한 뒤 영어로 쓰게 하는 영작형',
  },
]

export function getGrammarWorkbookMode(id) {
  return GRAMMAR_WORKBOOK_MODES.find((m) => m.id === id) || GRAMMAR_WORKBOOK_MODES[0]
}

/** @param {string} modeId */
export function isEssayMode(modeId) {
  return modeId === 'essay'
}
