import { TO_INFINITIVE_SECTIONS } from './toInfinitiveTopics.js'

/** @typedef {import('./grammarWorkbookUtils.js').GrammarSection} GrammarSection */

/** @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   promptSubject: string,
 *   promptFocus: string,
 *   sections: GrammarSection[],
 * }} GrammarWorkbookType */

/** 동명사 */
export const GERUND_SECTIONS = [
  {
    id: 'I',
    title: 'Ⅰ. 동명사의 개념과 형태',
    topics: [
      { id: 'g1-1', label: '1-1. 동명사의 정의와 특징' },
      { id: 'g1-2', label: '1-2. 동사원형 + -ing의 형태' },
      { id: 'g1-3', label: '1-3. 준동사로서 동명사' },
      { id: 'g1-4', label: '1-4. 문장에서의 역할 개요' },
    ],
  },
  {
    id: 'II',
    title: 'Ⅱ. 동명사의 명사적 용법',
    topics: [
      { id: 'g2-1', label: '2-1. 주어로 쓰인 동명사' },
      { id: 'g2-2', label: '2-2. 보어로 쓰인 동명사' },
      { id: 'g2-3', label: '2-3. 목적어로 쓰인 동명사' },
      { id: 'g2-4', label: '2-4. 전치사의 목적어' },
      { id: 'g2-5', label: '2-5. 동명사 앞의 소유격·목적격' },
    ],
  },
  {
    id: 'III',
    title: 'Ⅲ. 관용 구문과 It 가주어',
    topics: [
      { id: 'g3-1', label: '3-1. It is no use ~ing / worthless ~ing' },
      { id: 'g3-2', label: '3-2. There is no ~ing' },
      { id: 'g3-3', label: '3-3. It goes without saying that ~' },
      { id: 'g3-4', label: '3-4. What about / How about ~ing' },
    ],
  },
  {
    id: 'IV',
    title: 'Ⅳ. 의미상 주어와 논리적 주어',
    topics: [
      { id: 'g4-1', label: '4-1. 소유격 + 동명사' },
      { id: 'g4-2', label: '4-2. 목적격 + 동명사 (구어체)' },
      { id: 'g4-3', label: '4-3. 전치사 for / of + 동명사' },
      { id: 'g4-4', label: '4-4. 의미상 주어 생략·일치' },
    ],
  },
  {
    id: 'V',
    title: 'Ⅴ. 동명사와 to부정사의 선택',
    topics: [
      { id: 'g5-1', label: '5-1. 목적어로 둘 다 가능한 동사' },
      { id: 'g5-2', label: '5-2. forget, remember, regret' },
      { id: 'g5-3', label: '5-3. try, stop, mean' },
      { id: 'g5-4', label: '5-4. want, need, require + 동명사 수동적 의미' },
      { id: 'g5-5', label: '5-5. 시험 빈출 혼동 쌍' },
    ],
  },
  {
    id: 'VI',
    title: 'Ⅵ. 심화·실전',
    topics: [
      { id: 'g6-1', label: '6-1. 의문사 + 동명사 (how to와 비교)' },
      { id: 'g6-2', label: '6-2. 동명사 관용 표현' },
      { id: 'g6-3', label: '6-3. 문장 내 용법 판별' },
      { id: 'g6-4', label: '6-4. 어법·서술형 포인트' },
    ],
  },
]

/** 분사 */
export const PARTICIPLE_SECTIONS = [
  {
    id: 'I',
    title: 'Ⅰ. 분사의 개념과 형태',
    topics: [
      { id: 'p1-1', label: '1-1. 현재분사와 능동·진행의 의미' },
      { id: 'p1-2', label: '1-2. 과거분사와 수동·완료의 의미' },
      { id: 'p1-3', label: '1-3. 분사와 형용사의 구별' },
      { id: 'p1-4', label: '1-4. 분사구의 기본 이해' },
    ],
  },
  {
    id: 'II',
    title: 'Ⅱ. 관계사절의 축약',
    topics: [
      { id: 'p2-1', label: '2-1. 주격관계대명사 + 능동 → 현재분사' },
      { id: 'p2-2', label: '2-2. 주격관계대명사 + 수동 → 과거분사' },
      { id: 'p2-3', label: '2-3. 목적격 관계대명사 생략과 분사' },
      { id: 'p2-4', label: '2-4. 접속사 when, while과 분사' },
    ],
  },
  {
    id: 'III',
    title: 'Ⅲ. 분사구문 (부사적)',
    topics: [
      { id: 'p3-1', label: '3-1. 시간을 나타내는 분사구문' },
      { id: 'p3-2', label: '3-2. 이유를 나타내는 분사구문' },
      { id: 'p3-3', label: '3-3. 조건·양보의 분사구문' },
      { id: 'p3-4', label: '3-4. 동시동작·부가정보' },
      { id: 'p3-5', label: '3-5. Being, Having p.p. 도입' },
    ],
  },
  {
    id: 'IV',
    title: 'Ⅳ. 독립분사구문',
    topics: [
      { id: 'p4-1', label: '4-1. 독립분사구문의 구조' },
      { id: 'p4-2', label: '4-2. 의미상 주어의 명시' },
      { id: 'p4-3', label: '4-3. 관용적 독립분사 (generally speaking 등)' },
      { id: 'p4-4', label: '4-4. with + 목적어 + 분사' },
    ],
  },
  {
    id: 'V',
    title: 'Ⅴ. 분사의 수식 관계와 해석',
    topics: [
      { id: 'p5-1', label: '5-1. 수식 대상과 분사의 논리적 관계' },
      { id: 'p5-2', label: '5-2. 과거분사 위치와 의미' },
      { id: 'p5-3', label: '5-3. 분사 vs 관계사절 선택' },
      { id: 'p5-4', label: '5-4. 오역하기 쉬운 분사구' },
    ],
  },
  {
    id: 'VI',
    title: 'Ⅵ. 심화·실전',
    topics: [
      { id: 'p6-1', label: '6-1. 준동사 복합 (분사·부정사·동명사)' },
      { id: 'p6-2', label: '6-2. 문장 변환' },
      { id: 'p6-3', label: '6-3. 어법 문제 총정리' },
      { id: 'p6-4', label: '6-4. 수능·내신 빈출 유형' },
    ],
  },
]

/** 관계사 */
export const RELATIVE_SECTIONS = [
  {
    id: 'I',
    title: 'Ⅰ. 관계사의 개념',
    topics: [
      { id: 'r1-1', label: '1-1. 선행사와 관계사' },
      { id: 'r1-2', label: '1-2. 관계대명사·관계부사 개요' },
      { id: 'r1-3', label: '1-3. 제한적·비제한적 용법 개요' },
      { id: 'r1-4', label: '1-4. 쉼표와 관계절' },
    ],
  },
  {
    id: 'II',
    title: 'Ⅱ. 관계대명사 (격)',
    topics: [
      { id: 'r2-1', label: '2-1. 주격 who, which, that' },
      { id: 'r2-2', label: '2-2. 목격 whom, which, that (생략)' },
      { id: 'r2-3', label: '2-3. 소유격 whose' },
      { id: 'r2-4', label: '2-4. 전치사 + whom / which' },
    ],
  },
  {
    id: 'III',
    title: 'Ⅲ. that과 what',
    topics: [
      { id: 'r3-1', label: '3-1. that의 다양한 쓰임' },
      { id: 'r3-2', label: '3-2. what = the thing which' },
      { id: 'r3-3', label: '3-3. 선행사 유무와 what/that' },
      { id: 'r3-4', label: '3-4. 시험 빈출 구별' },
    ],
  },
  {
    id: 'IV',
    title: 'Ⅳ. 관계부사',
    topics: [
      { id: 'r4-1', label: '4-1. where, when, why' },
      { id: 'r4-2', label: '4-2. how와 관계부사' },
      { id: 'r4-3', label: '4-3. 사전적 선행사와 관계부사' },
      { id: 'r4-4', label: '4-4. 관계대명사+전치사와 치환' },
    ],
  },
  {
    id: 'V',
    title: 'Ⅴ. 복합관계사',
    topics: [
      { id: 'r5-1', label: '5-1. whoever, whatever, whichever' },
      { id: 'r5-2', label: '5-2. whenever, wherever, however' },
      { id: 'r5-3', label: '5-3. 명사절로서의 복합관계사' },
      { id: 'r5-4', label: '5-4. no matter wh-와 비교' },
    ],
  },
  {
    id: 'VI',
    title: 'Ⅵ. 심화·실전',
    topics: [
      { id: 'r6-1', label: '6-1. 수일치·시제 일치' },
      { id: 'r6-2', label: '6-2. 관계사 생략 조건' },
      { id: 'r6-3', label: '6-3. 어법·순서·삽입' },
      { id: 'r6-4', label: '6-4. 총정리' },
    ],
  },
]

/** 가정법 */
export const SUBJUNCTIVE_SECTIONS = [
  {
    id: 'I',
    title: 'Ⅰ. 가정법의 기본',
    topics: [
      { id: 's1-1', label: '1-1. 가정법의 의미와 종류' },
      { id: 's1-2', label: '1-2. if절과 주절의 시제 대응' },
      { id: 's1-3', label: '1-3. 현재 사실에 반대 (과거형)' },
      { id: 's1-4', label: '1-4. 과거 사실에 반대 (과거완료)' },
    ],
  },
  {
    id: 'II',
    title: 'Ⅱ. 미래에 대한 가정·추측',
    topics: [
      { id: 's2-1', label: '2-1. should / were to + 동사원형' },
      { id: 's2-2', label: '2-2. If it should rain 등' },
      { id: 's2-3', label: '2-3. 혼합 가정법 개요' },
      { id: 's2-4', label: '2-4. if 생략과 도치' },
    ],
  },
  {
    id: 'III',
    title: 'Ⅲ. I wish / If only / would rather',
    topics: [
      { id: 's3-1', label: '3-1. I wish + 과거/과거완료' },
      { id: 's3-2', label: '3-2. If only' },
      { id: 's3-3', label: '3-3. would rather + 절' },
      { id: 's3-4', label: '3-4. It’s (high) time that ~ 과거' },
    ],
  },
  {
    id: 'IV',
    title: 'Ⅳ. 명사절·접속사와 가정',
    topics: [
      { id: 's4-1', label: '4-1. suggest, insist, demand + (should) 동사원형' },
      { id: 's4-2', label: '4-2. It is important that ~ (should)' },
      { id: 's4-3', label: '4-3. lest, in case, for fear that' },
      { id: 's4-4', label: '4-4. as if / as though' },
    ],
  },
  {
    id: 'V',
    title: 'Ⅴ. 혼합·도치·관용',
    topics: [
      { id: 's5-1', label: '5-1. 혼합 가정법 (시간 교차)' },
      { id: 's5-2', label: '5-2. Had I known 도치' },
      { id: 's5-3', label: '5-3. Without / But for' },
      { id: 's5-4', label: '5-4. Otherwise, or 등 가정의 대용' },
    ],
  },
  {
    id: 'VI',
    title: 'Ⅵ. 심화·실전',
    topics: [
      { id: 's6-1', label: '6-1. 문맥상 가정법 판별' },
      { id: 's6-2', label: '6-2. 시제 선택 어법' },
      { id: 's6-3', label: '6-3. 서술형 답안 포인트' },
      { id: 's6-4', label: '6-4. 총정리' },
    ],
  },
]

/** 비교 */
export const COMPARISON_SECTIONS = [
  {
    id: 'I',
    title: 'Ⅰ. 비교의 형태',
    topics: [
      { id: 'c1-1', label: '1-1. 원급·비교급·최상급의 형태' },
      { id: 'c1-2', label: '1-2. 부사의 비교' },
      { id: 'c1-3', label: '1-3. 이웃한 형용사의 비교급' },
      { id: 'c1-4', label: '1-4. more / most와 단음절 형용사' },
    ],
  },
  {
    id: 'II',
    title: 'Ⅱ. as ··· as / not so ··· as',
    topics: [
      { id: 'c2-1', label: '2-1. as ~ as 긍정' },
      { id: 'c2-2', label: '2-2. not so/as ~ as 부정' },
      { id: 'c2-3', label: '2-3. as much as, as many as' },
      { id: 'c2-4', label: '2-4. 배수사와 as ~ as' },
    ],
  },
  {
    id: 'III',
    title: 'Ⅲ. 비교급·최상급 + than / in / of',
    topics: [
      { id: 'c3-1', label: '3-1. 비교급 + than' },
      { id: 'c3-2', label: '3-2. any other / no other' },
      { id: 'c3-3', label: '3-3. 최상급 + in / of' },
      { id: 'c3-4', label: '3-4. one of the + 최상급' },
    ],
  },
  {
    id: 'IV',
    title: 'Ⅳ. the more ···, the more ···',
    topics: [
      { id: 'c4-1', label: '4-1. 비례비교의 기본형' },
      { id: 'c4-2', label: '4-2. 시제와 어순' },
      { id: 'c4-3', label: '4-3. the + 비교급, 주어 동사' },
      { id: 'c4-4', label: '4-4. 변형 표현' },
    ],
  },
  {
    id: 'V',
    title: 'Ⅴ. 배수사법·부정 비교',
    topics: [
      { id: 'c5-1', label: '5-1. twice as ~ as 등' },
      { id: 'c5-2', label: '5-2. no less than, no more than' },
      { id: 'c5-3', label: '5-3. comparative + and + comparative' },
      { id: 'c5-4', label: '5-4. by far, much, even 등 강조' },
    ],
  },
  {
    id: 'VI',
    title: 'Ⅵ. 심화·실전',
    topics: [
      { id: 'c6-1', label: '6-1. to me than 등 특수 구조' },
      { id: 'c6-2', label: '6-2. 비교 대상 생략·함축' },
      { id: 'c6-3', label: '6-3. 어법 빈출' },
      { id: 'c6-4', label: '6-4. 총정리' },
    ],
  },
]

/** @type {GrammarWorkbookType[]} */
export const GRAMMAR_WORKBOOK_TYPES = [
  {
    id: 'to-infinitive',
    label: 'to부정사',
    description: '개념·명사적·형용사적·부사적 용법, 의미상 주어, 시제·태, 동명사와의 비교 등',
    promptSubject: 'the English infinitive ("to-infinitive")',
    promptFocus:
      'Focus on to-infinitive vs gerund vs bare infinitive where relevant. Use Korean high-school 수능·내신 style.',
    sections: TO_INFINITIVE_SECTIONS,
  },
  {
    id: 'gerund',
    label: '동명사',
    description: '명사적 용법, 관용구문, 의미상 주어, to부정사와의 선택',
    promptSubject: 'English gerunds (verb + -ing as noun)',
    promptFocus:
      'Include contrasts with infinitives where appropriate (forget, remember, try, stop, etc.).',
    sections: GERUND_SECTIONS,
  },
  {
    id: 'participle',
    label: '분사',
    description: '현재·과거분사, 관계사절 축약, 분사구문, 독립분사구문',
    promptSubject: 'English participles (present and past participles, participle clauses)',
    promptFocus:
      'Include reduced relative clauses, dangling participle traps, and absolute constructions.',
    sections: PARTICIPLE_SECTIONS,
  },
  {
    id: 'relative',
    label: '관계사',
    description: '관계대명사·관계부사, that/what, 복합관계사',
    promptSubject: 'English relative clauses (relative pronouns and relative adverbs)',
    promptFocus:
      'Test case (nominative/accusative/genitive), omission rules, what vs that, and compound relatives.',
    sections: RELATIVE_SECTIONS,
  },
  {
    id: 'subjunctive',
    label: '가정법',
    description: '과거·과거완료·미래 가정, I wish, as if, 혼합·도치',
    promptSubject: 'English subjunctive and unreal conditionals (if-clauses, wish, etc.)',
    promptFocus:
      'Include if-clause tense sequence, inverted conditionals, suggest/insist that-clauses, and as if.',
    sections: SUBJUNCTIVE_SECTIONS,
  },
  {
    id: 'comparison',
    label: '비교',
    description: '원급·비교급·최상급, as···as, the more the more, 배수사법',
    promptSubject: 'English comparison (comparatives, superlatives, proportional comparison)',
    promptFocus:
      'Include than-clauses, correlative comparison, and multiple as structures.',
    sections: COMPARISON_SECTIONS,
  },
]

export function getGrammarWorkbookType(id) {
  return GRAMMAR_WORKBOOK_TYPES.find((g) => g.id === id) || GRAMMAR_WORKBOOK_TYPES[0]
}
