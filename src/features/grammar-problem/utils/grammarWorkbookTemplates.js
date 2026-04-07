const TEMPLATE_GROUPS = {
  concept: [
    {
      id: 'concept-rule-fill',
      label: '[개념] 빈칸 채우기',
      role: '당신은 고등학교 영어 교사입니다. 학생의 개념 이해도를 묻는 빈칸 문제를 출제합니다.',
      objective:
        '[목표 문법]의 핵심 규칙을 설명하는 한국어 문장 3개를 만들고, 가장 중요한 핵심어에 빈칸(____)을 뚫으세요.',
      outputFormat: `### **[개념] 빈칸 채우기**
1. [문장 1 (____)]
2. [문장 2 (____)]
3. [문장 3 (____)]
---
### **[정답 및 해설]**
1. [정답] - [해설]`,
      example: '계속적 용법은 선행사 뒤에 ( ____ )을 찍어 부연 설명한다. / 정답: 콤마(,)',
    },
    {
      id: 'concept-true-false-reason',
      label: '[개념] O/X 판단 및 이유',
      role: '당신은 고등학교 영어 교사입니다. 개념의 참/거짓을 묻는 문제를 출제합니다.',
      objective:
        '[목표 문법] 설명 3개를 만들되, 1개는 올바른 설명(O), 2개는 교묘하게 틀린 설명(X)으로 만드세요.',
      outputFormat: `### **[개념] O/X 판단 및 이유**
다음 설명이 맞으면 O, 틀리면 X를 고르고 틀린 경우 이유를 쓰시오.
1. [설명 문장] ( O / X ) -> 이유: ________
---
### **[정답 및 해설]**
1. [정답(O/X)] - [정확한 문법 규칙 해설]`,
      example: '사역동사 make의 목적격 보어로는 항상 to부정사가 온다. ( O / X ) / 정답: X',
    },
    {
      id: 'concept-parsing-labeling',
      label: '[개념] 문장 성분 분석',
      role: '당신은 고등학교 영어 교사입니다. 구문 분석 능력을 묻는 문제를 출제합니다.',
      objective:
        '[목표 문법]이 포함된 [타겟 난이도] 영어 문장 2개를 만들고, S/V를 찾고 타겟 문법을 표시하도록 지시하세요.',
      outputFormat: `### **[개념] 문장 성분 분석**
다음 문장의 주어(S)와 동사(V)를 찾아 밑줄을 긋고, [목표 문법]에 동그라미 치시오.
1. [영어 문장]
---
### **[정답 및 해설]**
1. S: [주어], V: [동사] / [목표 문법 해설]`,
      example: 'It is important to read books. / 정답: S: It(가주어), V: is, 진주어: to read books',
    },
    {
      id: 'concept-term-example-matching',
      label: '[개념] 용법 연결하기',
      role: '당신은 고등학교 영어 교사입니다. 개념과 예시를 짝지어 확인하는 문제를 출제합니다.',
      objective:
        '[목표 문법]의 서로 다른 용법/형태 3개를 제시하고, 순서를 섞은 예문 3개를 알맞게 연결하게 하세요.',
      outputFormat: `### **[개념] 용법 연결하기**
다음 문법 용어(용법)와 알맞은 예문을 연결하시오.
(A) [용법 1] - (1) [예문]
(B) [용법 2] - (2) [예문]
(C) [용법 3] - (3) [예문]
---
### **[정답 및 해설]**
[정답 매핑 결과 및 해설]`,
      example: '(A) 명사적 용법 - (2) I want to go home. / 정답: (A)-(2)',
    },
    {
      id: 'concept-compare-contrast',
      label: '[개념] 차이점 서술하기',
      role: '당신은 고등학교 영어 교사입니다. 혼동하기 쉬운 문법 개념 비교 문제를 출제합니다.',
      objective:
        '[목표 문법]과 가장 헷갈리기 쉬운 유사 문법 요소를 비교하여 차이점을 한 줄로 설명하게 하세요.',
      outputFormat: `### **[개념] 차이점 서술하기**
다음 두 문법 개념의 차이점을 문장 내 역할이나 형태를 중심으로 한 줄로 서술하시오.
* [목표 문법] vs [유사 문법]
답안: ____________________________
---
### **[정답 및 해설]**
[모범 답안 및 상세 해설]`,
      example: '현재분사는 형용사 역할, 동명사는 명사 역할을 합니다.',
    },
  ],
  workbook: [
    {
      id: 'workbook-binary-choice',
      label: '[워크북] 알맞은 형태 고르기',
      role: '당신은 고등학교 영어 교사입니다. 형태 체화를 위한 A or B 문제를 출제합니다.',
      objective:
        '[목표 문법]이 적용된 문장 5개를 만들고, 핵심 문법 자리에 [정답 / 오답] 형태를 제시하세요.',
      outputFormat: `### **[워크북] 알맞은 형태 고르기**
1. [문장 일부] [ 정답 / 오답 ] [문장 나머지].
---
### **[정답 및 해설]**
1. [정답] - [1줄 해설]`,
      example: 'The letter was [ written / wrote ] by him. / 정답: written',
    },
    {
      id: 'workbook-simple-form-change',
      label: '[워크북] 알맞은 형태로 바꾸기',
      role: '당신은 고등학교 영어 교사입니다. 단어 형태 변형 워크북을 출제합니다.',
      objective:
        '[목표 문법]이 적용된 문장 5개를 만들고, 핵심 동사/단어의 원형을 괄호에 주어 알맞은 형태로 쓰게 하세요.',
      outputFormat: `### **[워크북] 알맞은 형태로 바꾸기**
1. [문장 일부] _______ (동사원형) [문장 나머지].
---
### **[정답 및 해설]**
1. [정답] - [해설]`,
      example: 'If I _______ (be) a bird, I would fly to you. / 정답: were',
    },
    {
      id: 'workbook-sentence-combining',
      label: '[워크북] 두 문장 합치기',
      role: '당신은 고등학교 영어 교사입니다. 문장 결합 훈련 워크북을 출제합니다.',
      objective:
        '[목표 문법]을 활용해 두 개의 단문을 하나의 복문으로 합치는 문제를 3개 만드세요.',
      outputFormat: `### **[워크북] 두 문장 합치기**
1. [단문 1]. + [단문 2].
-> ___________________________
---
### **[정답 및 해설]**
1. [완성된 복문] - [해설]`,
      example: 'I have a friend. + He lives in NY. -> I have a friend who lives in NY.',
    },
    {
      id: 'workbook-type-transformation',
      label: '[워크북] 문장 구조 바꾸기',
      role: '당신은 고등학교 영어 교사입니다. 문형 구조 전환 훈련 워크북을 출제합니다.',
      objective:
        '원본 문장을 제시하고, 이를 [목표 문법] 구조로 바꾸도록 지시하는 문제를 만드세요.',
      outputFormat: `### **[워크북] 문장 구조 바꾸기**
주어진 지시사항에 맞게 문장을 다시 쓰시오.
1. [원본 문장] -> ([목표 문법]을 사용하여 다시 쓰기)
---
### **[정답 및 해설]**
1. [정답] - [해설]`,
      example: 'I met him yesterday. (yesterday 강조) -> It was yesterday that I met him.',
    },
    {
      id: 'workbook-chunk-unscramble',
      label: '[워크북] 덩어리 배열하기',
      role: '당신은 고등학교 영어 교사입니다. 청크 배열 워크북을 출제합니다.',
      objective:
        '[목표 문법]이 포함된 영어 문장을 3~4개의 의미 덩어리로 나누고 순서를 섞어 배열하게 하세요.',
      outputFormat: `### **[워크북] 덩어리 배열하기**
1. [우리말 해석]
( [Chunk 1] / [Chunk 2] / [Chunk 3] )
---
### **[정답 및 해설]**
1. [완성된 영어 문장]`,
      example: '( for you / is hard / to solve the problem / It ) -> It is hard for you to solve the problem.',
    },
  ],
  mcq: [
    {
      id: 'mcq-underlined-error',
      label: '[객관식] 어법상 틀린 것 고르기',
      role: '당신은 수능 및 내신 영어 어법 객관식 출제 위원입니다.',
      objective:
        '[목표 문법]이 포함된 지문 또는 긴 문장 하나를 제시하고, 5군데 밑줄 중 단 1개만 오류로 만드세요.',
      outputFormat: `### **[객관식] 어법상 틀린 것 고르기**
다음 중 밑줄 친 부분의 어법이 틀린 것은?
[지문 텍스트 내에 ①~⑤ 밑줄 삽입]
---
### **[정답 및 해설]**
정답: [X]번
해설: [오답 수정 및 상세 해설]`,
      example: 'The list of items ① are on the desk. / 정답: ①',
    },
    {
      id: 'mcq-abc-box-choice',
      label: '[객관식] 알맞은 어법 조합 고르기',
      role: '당신은 수능 및 내신 영어 어법 객관식 출제 위원입니다.',
      objective:
        '[목표 문법]이 포함된 지문을 제시하고, (A)(B)(C)에 두 가지 선택지를 주어 올바른 조합을 찾게 하세요.',
      outputFormat: `### **[객관식] 알맞은 어법 조합 고르기**
다음 (A), (B), (C)의 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?
[지문 텍스트 내에 (A)[선택/지], (B)[선택/지], (C)[선택/지] 삽입]
---
### **[정답 및 해설]**
정답: (A) [ ], (B) [ ], (C) [ ]
해설: [각 네모칸 해설]`,
      example: '(A), (B), (C)의 조합을 고르는 유형으로 출제',
    },
    {
      id: 'mcq-correct-sentence',
      label: '[객관식] 올바른 문장 찾기',
      role: '당신은 수능 및 내신 영어 어법 객관식 출제 위원입니다.',
      objective:
        '[목표 문법]이 포함된 5개의 보기 문장을 만들고, 1개만 완벽한 문장(또는 1개만 틀린 문장)으로 만드세요.',
      outputFormat: `### **[객관식] 올바른 문장 찾기**
다음 중 어법상 가장 올바른 문장은?
① [문장 1] ... ⑤ [문장 5]
---
### **[정답 및 해설]**
정답: [X]번
해설: [각 보기별 분석]`,
      example: '①~⑤ 중 하나만 정확한 문장으로 구성',
    },
    {
      id: 'mcq-identify-usage',
      label: '[객관식] 용법 구별하기',
      role: '당신은 수능 및 내신 영어 어법 객관식 출제 위원입니다.',
      objective:
        '형태는 같으나 용법이 여러 개인 [목표 문법]을 선정하고, 기준 문장과 보기 5개를 주어 쓰임이 같은/다른 것을 찾게 하세요.',
      outputFormat: `### **[객관식] 용법 구별하기**
다음 밑줄 친 부분과 쓰임이 같은(또는 다른) 것은?
[기준 문장]
① [보기 1] ... ⑤ [보기 5]
---
### **[정답 및 해설]**
정답: [X]번
해설: [모든 보기의 구체적 용법]`,
      example: 'that, -ing, to부정사 등 용법 구별형',
    },
    {
      id: 'mcq-count-errors',
      label: '[객관식] 틀린 개수 고르기',
      role: '당신은 수능 및 내신 영어 어법 객관식 출제 위원입니다.',
      objective:
        '[목표 문법]이 포함된 문장 5개를 제시하고, 2~3개를 교묘하게 틀리게 만들어 틀린 개수를 묻게 하세요.',
      outputFormat: `### **[객관식] 틀린 개수 고르기**
다음 <보기> 중 어법상 틀린 문장의 개수는?
ⓐ [문장 1] ... ⓔ [문장 5]
① 1개 ② 2개 ③ 3개 ④ 4개 ⑤ 5개
---
### **[정답 및 해설]**
정답: [X]번 ([N]개)
해설: [틀린 문장 수정 및 이유]`,
      example: '틀린 문장 수를 세어 정답을 고르는 유형',
    },
  ],
  essay: [
    {
      id: 'essay-find-correct-explain',
      label: '[서술형] 오류 수정 및 이유 서술',
      role: '당신은 고등학교 내신 서술형 출제 위원입니다.',
      objective:
        '[목표 문법]이 포함된 짧은 단락을 만들고, 한 문장에만 오류를 넣어 학생이 찾고 고친 뒤 이유를 쓰게 하세요.',
      outputFormat: `### **[서술형] 오류 수정 및 이유 서술**
[지문]
* 틀린 부분: _____
* 바르게 고친 형태: _____
* 이유: ___________________
---
### **[정답 및 해설]**
[모범 답안 제공]`,
      example: '오류 찾기 + 수정 + 이유 서술형',
    },
    {
      id: 'essay-conditional-writing',
      label: '[서술형] 조건에 맞게 영작하기',
      role: '당신은 고등학교 내신 서술형 출제 위원입니다.',
      objective:
        '[목표 문법]을 모두 포함하여 주어진 우리말을 영작하게 하고, 제시어의 어형 변화 및 단어 추가를 허용하세요.',
      outputFormat: `### **[서술형] 조건에 맞게 영작하기**
[우리말]
* 조건: [목표 문법] 포함, 필요시 어형 변화 및 단어 추가
* 제시어: ( [단어들 섞어서 제시] )
답안: ___________________________
---
### **[정답 및 해설]**
정답: [완벽한 영문] / [어순 및 문법 적용 해설]`,
      example: '조건과 제시어를 모두 만족하는 영작형',
    },
    {
      id: 'essay-clause-phrase-conversion',
      label: '[서술형] 문장 전환 빈칸 채우기',
      role: '당신은 고등학교 내신 서술형 출제 위원입니다.',
      objective:
        '[목표 문법]을 활용하여 복문을 의미가 같은 단문으로(또는 반대로) 전환하는 빈칸형 서술 문제를 출제하세요.',
      outputFormat: `### **[서술형] 문장 전환 빈칸 채우기**
다음 두 문장의 의미가 같도록 빈칸을 채우시오.
1. [원본 문장]
-> [전환 문장 앞부분] ____________________.
---
### **[정답 및 해설]**
정답: [빈칸 내용] / [전환 원리 해설]`,
      example: 'He is so young that he cannot drive. -> He is too young to drive.',
    },
    {
      id: 'essay-precise-translation',
      label: '[서술형] 구조 분석 및 해석',
      role: '당신은 고등학교 내신 서술형 출제 위원입니다.',
      objective:
        '[목표 문법]이 복잡하게 얽힌 [타겟 난이도]의 긴 문장 1개를 제시하고, 구조에 맞게 정확히 해석하도록 하세요.',
      outputFormat: `### **[서술형] 구조 분석 및 해석**
다음 문장을 구조에 맞게 우리말로 정확히 해석하시오.
[영어 문장]
해석: ___________________________
---
### **[정답 및 해설]**
모범 해석: [한국어 문장]
분석: [문법 반영 해설]`,
      example: '복합 문장 해석 + 구조 분석형',
    },
    {
      id: 'essay-summary-fill',
      label: '[서술형] 지문 요약 영작하기',
      role: '당신은 고등학교 내신 서술형 출제 위원입니다.',
      objective:
        '[타겟 난이도]의 4~5문장 영어 지문을 만들고, 요약문 빈칸을 [목표 문법]과 제시어를 활용해 영작하게 하세요.',
      outputFormat: `### **[서술형] 지문 요약 영작하기**
다음 글을 읽고, 내용에 맞게 요약문의 빈칸을 완성하시오.
[지문 텍스트]
<요약> The passage shows that ____________________.
* 조건: [목표 문법] 사용, 주어진 단어 활용(어형 변화 가능)
* 제시어: ( [단어들] )
---
### **[정답 및 해설]**
정답: [빈칸 영작 답안] / [해설]`,
      example: '지문 요약 영작형',
    },
  ],
}

function randomShuffle(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function interpolate(text, grammarLabel, difficulty) {
  return String(text || '')
    .replace(/\[목표 문법\]/g, grammarLabel)
    .replace(/\[타겟 난이도\]/g, difficulty)
}

export function getGrammarPromptTemplates(modeId) {
  return TEMPLATE_GROUPS[modeId] || []
}

export function buildTemplatePlan(modeId, count) {
  const templates = getGrammarPromptTemplates(modeId)
  const size = Math.max(0, Number(count) || 0)
  if (!templates.length || size <= 0) return []
  if (size <= templates.length) return randomShuffle(templates).slice(0, size)
  const out = []
  while (out.length < size) out.push(...randomShuffle(templates))
  return out.slice(0, size)
}

export function buildTemplateCatalogPromptBlock(modeId, grammarLabel, difficulty) {
  const templates = getGrammarPromptTemplates(modeId)
  if (!templates.length) return ''
  return `\nRECOMMENDED TEMPLATE CATALOG (${modeId}):
${templates
  .map((template) => `- ${template.id}: ${template.label}
  Role: ${interpolate(template.role, grammarLabel, difficulty)}
  Objective: ${interpolate(template.objective, grammarLabel, difficulty)}
  Output Format:
${interpolate(template.outputFormat, grammarLabel, difficulty)
  .split('\n')
  .map((line) => `    ${line}`)
  .join('\n')}
  Example: ${interpolate(template.example, grammarLabel, difficulty)}`)
  .join('\n')}`
}

export function buildTemplatePlanPromptBlock(templatePlan = [], grammarLabel, difficulty) {
  if (!templatePlan.length) return ''
  return `\nSUGGESTED TEMPLATE MIX (reference only):
${templatePlan.map((template, index) => `- no ${index + 1}: ${template.id} (${template.label})`).join('\n')}
- 위 배정은 강제가 아니라 참고용입니다.
- 실제 생성에서는 문법 포인트와 난이도에 따라 더 자연스러운 유형을 스스로 추천·선택해도 됩니다.
- 다만 Role / Objective / Output Format의 큰 방향은 참고하여 학교 시험/문제집 톤을 유지하세요.
- [목표 문법]은 ${grammarLabel}, [타겟 난이도]는 ${difficulty}로 반영합니다.`
}
