import { useEffect, useMemo, useRef, useState } from 'react'
import Sum15Viewer from './Sum15Viewer'
import { summarizeText, generateTitle10, generateTopic15, generateTopicSentence15, generateResponse20, generateInterview25Single, getBaseForms } from '../utils/sum15Analyzer'
import { exportSum15ToPdf } from '../utils/sum15PdfExporter'
import { SUM15_THEME_PRESETS, getSum15Theme } from '../utils/sum15Themes'
import Sum30Viewer from '../../sum30/components/Sum30Viewer'
import { summarizeText as summarizeSum30Text } from '../../sum30/utils/sum30Analyzer'
import { exportSum30ToPdf } from '../../sum30/utils/sum30PdfExporter'
import Sum40Viewer from '../../sum40/components/Sum40Viewer'
import { summarizeText as summarizeSum40Text, findWordMatches as findSum40WordMatches } from '../../sum40/utils/sum40Analyzer'
import { exportSum40ToPdf } from '../../sum40/utils/sum40PdfExporter'

const TYPE_GROUPS = [
  { id: 'sum15', label: 'SUM 15', transformedId: 'sum15', originalId: 'sum15Original', supportsTransform: true },
  { id: 'sum30', label: 'SUM 30', transformedId: 'sum30', originalId: null, supportsTransform: false },
  { id: 'sum40', label: 'SUM 40', transformedId: 'sum40', originalId: null, supportsTransform: false },
  { id: 'topic15', label: 'topic 15', transformedId: 'topic15', originalId: 'topic15Original', supportsTransform: true },
  { id: 'topicSentence15', label: 'topic sentence 15', transformedId: 'topicSentence15', originalId: 'topicSentence15Original', supportsTransform: true },
  { id: 'response20', label: 'response 20', transformedId: 'response20', originalId: 'response20Original', supportsTransform: true },
  { id: 'title10', label: 'title 10', transformedId: 'title10', originalId: null, supportsTransform: false },
  { id: 'interview25', label: 'interview 25', transformedId: 'interview25', originalId: 'interview25Original', supportsTransform: true },
]

const PROBLEM_TYPES = {
  sum15: {
    id: 'sum15',
    label: 'SUM 15 변형 있음',
    badge: '15단어 요약문 (변형 있음)',
    description:
      '지문 핵심을 15단어 요약문으로 만든 뒤, <보기>의 단어를 모두 사용해 빈칸을 완성하는 유형입니다. 필요하면 1~2개 단어의 형태를 바꾸게 만듭니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능)',
    promptLine: 'The passage suggests that ___________________________.',
    blankPrefix: 'The passage suggests that ',
    blankSuffix: '.',
    sample: {
      source: '2026 3월 교육청 29번',
      original:
        'Healthy communities grow when people share resources, protect local spaces, and cooperate to solve everyday problems together.',
      choices:
        'grow / local / communities / protect / people / problems / together / solve / healthy / spaces / resources / cooperate / share / when / everyday',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것',
    },
  },
  sum15Original: {
    id: 'sum15Original',
    label: 'SUM 15 변형 없음',
    badge: '15단어 요약문 (변형 없음)',
    description:
      '지문 핵심을 15단어 요약문으로 만든 뒤, <보기>의 단어를 그대로 모두 사용해 빈칸을 완성하는 유형입니다. 어법 변형 조건은 없습니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능)',
    promptLine: 'The passage suggests that ___________________________.',
    blankPrefix: 'The passage suggests that ',
    blankSuffix: '.',
    sample: {
      source: '2026 3월 교육청 29번',
      original:
        'Healthy communities grow when people share resources, protect local spaces, and cooperate to solve everyday problems together.',
      choices:
        'grow / local / communities / protect / people / problems / together / solve / healthy / spaces / resources / cooperate / share / when / everyday',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것',
    },
  },
  sum30: {
    id: 'sum30',
    label: 'SUM 30',
    badge: '30단어 요약문 (2단어쌍 배열)',
    description:
      '지문 핵심을 정확히 30단어 요약문으로 만든 뒤, 두 단어씩 묶인 <보기>를 모두 사용해 빈칸을 완성하는 유형입니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 보기는 2단어씩 고정 묶음',
    promptLine: '___________________________.',
    blankPrefix: '',
    blankSuffix: '.',
    viewerType: 'sum30',
    supportsCustomGrouping: false,
    sample: {
      source: '2026 6월 교육청 30번',
      original:
        'Successful communities grow through shared responsibility, practical cooperation, and consistent efforts to solve local problems with patience and trust.',
      choices:
        'Successful communities / grow through / shared responsibility, / practical cooperation, / and consistent / efforts to / solve local / problems with / patience and / trust.',
      condition:
        '<보기>에 주어진 단어 쌍들을 모두 한번씩 사용하여 빈칸을 채우시오.',
    },
  },
  sum40: {
    id: 'sum40',
    label: 'SUM 40',
    badge: '40단어 요약문 빈칸 완성',
    description:
      '지문 핵심을 약 40단어 요약문으로 만든 뒤, 원문과 매칭되는 핵심 단어 6개를 앞글자만 제시한 빈칸으로 바꾸고 나머지는 답지에서 확인하는 유형입니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 매칭 단어 6개를 빈칸 처리',
    promptLine: '▶ 다음 40단어 요약문의 빈칸을 완성하시오.',
    blankPrefix: '',
    blankSuffix: '',
    viewerType: 'sum40',
    supportsCustomGrouping: false,
    sample: {
      source: '2026 9월 교육청 29번',
      original:
        'Cooperative problem solving helps communities respond effectively to change because residents share information, combine resources, and develop practical solutions through trust and persistence.',
      blankedSummary:
        'Cooperative p______________ helps communities r______________ effectively to change because residents s______________ information, c______________ resources, and d______________ practical s______________ through trust and persistence.',
      answerLine: '1. problem solving / 2. respond / 3. share / 4. combine / 5. develop / 6. solutions',
      condition:
        '빈칸은 제시된 첫 글자를 참고하여 알맞은 단어를 쓰시오.',
    },
  },
  topic15: {
    id: 'topic15',
    label: 'topic 15 변형 있음',
    badge: '15단어 주제 구 (변형 있음)',
    description:
      '지문의 주제를 15단어 구(phrase)로 만든 뒤, <보기>의 단어를 모두 사용해 주제를 완성하는 유형입니다. 한 단어만 어법에 맞게 변형합니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 주제는 15단어 구(phrase)',
    promptLine: 'The topic of the passage is ___________________________.',
    blankPrefix: 'The topic of the passage is ',
    blankSuffix: '.',
    sample: {
      source: '2026 7월 교육청 33번',
      original:
        'Urban gardens strengthen neighborhoods by improving food access, encouraging cooperation, and turning unused spaces into shared community resources.',
      choices:
        'shared / strengthening / food / neighborhoods / cooperation / community / access / by / resources / improving / spaces / urban / gardens / unused / turning',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것',
    },
  },
  topic15Original: {
    id: 'topic15Original',
    label: 'topic 15 변형 없음',
    badge: '15단어 주제 구 (변형 없음)',
    description:
      '지문의 주제를 15단어 구(phrase)로 만든 뒤, <보기>의 단어를 그대로 모두 사용해 주제를 완성하는 유형입니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 주제는 15단어 구(phrase)',
    promptLine: 'The topic of the passage is ___________________________.',
    blankPrefix: 'The topic of the passage is ',
    blankSuffix: '.',
    sample: {
      source: '2026 7월 교육청 33번',
      original:
        'Urban gardens strengthen neighborhoods by improving food access, encouraging cooperation, and turning unused spaces into shared community resources.',
      choices:
        'shared / strengthen / food / neighborhoods / cooperation / community / access / by / resources / improving / spaces / urban / gardens / unused / turning',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것',
    },
  },
  topicSentence15: {
    id: 'topicSentence15',
    label: 'topic sentence 15 변형 있음',
    badge: '15단어 주제문 (변형 있음)',
    description:
      '지문의 핵심을 15단어 완전한 주제문으로 만든 뒤, <보기>의 단어를 모두 사용해 문장을 완성하는 유형입니다. 한 단어만 어법에 맞게 변형합니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 주제문은 정확히 15단어 문장',
    promptLine: 'The topic sentence of the passage is ___________________________.',
    blankPrefix: 'The topic sentence of the passage is ',
    blankSuffix: '.',
    sample: {
      source: '2026 9월 평가원 30번',
      original:
        'Creative collaboration grows when people trust one another, exchange ideas freely, and refine shared goals patiently.',
      choices:
        'creative / collaboration / grows / when / trusting / people / one / another, / exchange / ideas / freely, / and / refine / shared / goals',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것',
    },
  },
  topicSentence15Original: {
    id: 'topicSentence15Original',
    label: 'topic sentence 15 변형 없음',
    badge: '15단어 주제문 (변형 없음)',
    description:
      '지문의 핵심을 15단어 완전한 주제문으로 만든 뒤, <보기>의 단어를 그대로 모두 사용해 문장을 완성하는 유형입니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 주제문은 정확히 15단어 문장',
    promptLine: 'The topic sentence of the passage is ___________________________.',
    blankPrefix: 'The topic sentence of the passage is ',
    blankSuffix: '.',
    sample: {
      source: '2026 9월 평가원 30번',
      original:
        'Creative collaboration grows when people trust one another, exchange ideas freely, and refine shared goals patiently.',
      choices:
        'creative / collaboration / grows / when / people / trust / one / another, / exchange / ideas / freely, / and / refine / shared / goals',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것',
    },
  },
  response20: {
    id: 'response20',
    label: 'response 20 변형 있음',
    badge: '20단어 감상문 (변형 있음)',
    description:
      '독자가 글을 읽고 이해한 뒤 남기는 약 20단어 감상문을 만들고, <보기>의 단어를 모두 사용해 문장을 완성하는 유형입니다. 한 단어만 어법에 맞게 변형합니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 감상문은 약 20단어 문장',
    promptLine: 'I found it fascinating ___________________________.',
    blankPrefix: 'I found it fascinating ',
    blankSuffix: '.',
    sample: {
      source: '2026 10월 교육청 32번',
      original:
        'Shared reading deepens empathy because readers imagine unfamiliar experiences, compare perspectives, and rethink their own assumptions.',
      choices:
        'because / sharing / unfamiliar / experiences, / readers / imagine / compare / perspectives, / and / rethink / their / own / assumptions / more / deeply / today',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것',
    },
  },
  response20Original: {
    id: 'response20Original',
    label: 'response 20 변형 없음',
    badge: '20단어 감상문 (변형 없음)',
    description:
      '독자가 글을 읽고 이해한 뒤 남기는 약 20단어 감상문을 만들고, <보기>의 단어를 그대로 모두 사용해 문장을 완성하는 유형입니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 감상문은 약 20단어 문장',
    promptLine: 'I found it fascinating ___________________________.',
    blankPrefix: 'I found it fascinating ',
    blankSuffix: '.',
    sample: {
      source: '2026 10월 교육청 32번',
      original:
        'Shared reading deepens empathy because readers imagine unfamiliar experiences, compare perspectives, and rethink their own assumptions.',
      choices:
        'because / shared / reading / deepens / empathy / as / readers / imagine / unfamiliar / experiences, / compare / perspectives, / and / rethink / assumptions',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것',
    },
  },
  interview25: {
    id: 'interview25',
    label: 'interview 25 변형 있음',
    badge: '인터뷰 25단어 답변 1문항 (변형 있음)',
    description:
      '기자 질문 1개와 저자 답변 1개를 만들고, 답변은 약 25단어 한 문장으로 생성합니다. <보기>에서는 한 단어만 어법에 맞게 변형합니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 인터뷰는 질문 1개, 답변 1개',
    promptLine: 'Q1: How would you summarize your message?\n\nA1: ___________________________.',
    blankPrefix: 'A1: ',
    blankSuffix: '.',
    designMode: 'text',
    sample: {
      source: '2026 수능특강 인터뷰형 예시',
      original:
        'Communities become more resilient when citizens cooperate, share responsibility, and respond thoughtfully to common challenges.',
      previewText: 'Q1: How would you summarize your message?',
      choices:
        'communities / more / resilient / become / when / citizens / cooperate, / share / responsible / and / respond / thoughtfully / to / common / challenges',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것',
    },
  },
  interview25Original: {
    id: 'interview25Original',
    label: 'interview 25 변형 없음',
    badge: '인터뷰 25단어 답변 1문항 (변형 없음)',
    description:
      '기자 질문 1개와 저자 답변 1개를 만들고, 답변은 약 25단어 한 문장으로 생성합니다. <보기> 단어는 그대로 사용합니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 인터뷰는 질문 1개, 답변 1개',
    promptLine: 'Q1: How would you summarize your message?\n\nA1: ___________________________.',
    blankPrefix: 'A1: ',
    blankSuffix: '.',
    designMode: 'text',
    sample: {
      source: '2026 수능특강 인터뷰형 예시',
      original:
        'Communities become more resilient when citizens cooperate, share responsibility, and respond thoughtfully to common challenges.',
      previewText: 'Q1: How would you summarize your message?',
      choices:
        'communities / become / more / resilient / when / citizens / cooperate, / share / responsibility, / and / respond / thoughtfully / to / common / challenges',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것',
    },
  },
  title10: {
    id: 'title10',
    label: 'title 10',
    badge: '약 10단어 제목 만들기',
    description:
      '지문의 핵심을 약 10단어 제목으로 만들고, <보기>에 있는 단어를 모두 사용해 가장 적절한 제목을 재구성하는 유형입니다.',
    guide: '형식: 출처/영어원문/한글해석// (// 기준으로 여러 지문 입력 가능) · 제목은 약 8~12단어',
    promptLine: 'The best title for the passage is ___________________________.',
    blankPrefix: 'The best title for the passage is ',
    blankSuffix: '.',
    sample: {
      source: '2026 6월 평가원 31번',
      original:
        'Students build lasting confidence when teachers praise effort, model patience, and give feedback that encourages steady growth.',
      choices:
        'confidence / patient / steady / growth / when / feedback / effort / teachers / praise / encourages / students / lasting',
      condition:
        '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것',
    },
  },
}

function splitTextBlocks(inputText) {
  const textBlocks = []
  let currentBlock = ''

  for (let i = 0; i < inputText.length; i += 1) {
    const char = inputText[i]
    const nextChar = inputText[i + 1]

    if (char === '/' && nextChar === '/') {
      textBlocks.push(currentBlock)
      currentBlock = ''
      i += 1
    } else {
      currentBlock += char
    }
  }

  if (currentBlock.trim().length > 0) {
    textBlocks.push(currentBlock)
  }

  return textBlocks
}

function splitSingleBlock(block) {
  const parts = []
  let currentPart = ''

  for (let j = 0; j < block.length; j += 1) {
    const char = block[j]
    const prevChar = j > 0 ? block[j - 1] : ''
    const nextChar = j < block.length - 1 ? block[j + 1] : ''

    if (char === '/' && prevChar !== '/' && nextChar !== '/') {
      parts.push(currentPart)
      currentPart = ''
    } else {
      currentPart += char
    }
  }

  if (currentPart.length > 0) {
    parts.push(currentPart)
  }

  return {
    source: parts[0] || '',
    englishText: parts[1] || '',
    koreanTranslation: parts[2] || '',
  }
}

function glueArticlePairs(words) {
  const groupedWords = []
  for (let i = 0; i < words.length; i += 1) {
    const clean = String(words[i] || '').replace(/[.,!?;:]/g, '')
    if ((clean === 'The' || clean === 'a') && i < words.length - 1) {
      groupedWords.push(`${words[i]} ${words[i + 1]}`)
      i += 1
    } else {
      groupedWords.push(words[i])
    }
  }
  return groupedWords
}

function normalizeGroupSize(groupSize) {
  const n = Number(groupSize) || 1
  return Math.min(3, Math.max(1, n))
}

function buildWordBankUnits(tokens, groupSize = 1) {
  const size = normalizeGroupSize(groupSize)
  const cleanTokens = Array.isArray(tokens) ? tokens.filter(Boolean) : []
  const units = []

  for (let i = 0; i < cleanTokens.length; i += size) {
    units.push(cleanTokens.slice(i, i + size).join(' '))
  }

  return units
}

function shuffleArray(items) {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function buildGroupedDisplays(baseTokens, transformedTokens, boldTokens, groupSize = 1) {
  const baseGroups = buildWordBankUnits(baseTokens, groupSize)
  const transformedGroups = buildWordBankUnits(transformedTokens, groupSize)
  const boldGroups = buildWordBankUnits(boldTokens, groupSize)
  const order = shuffleArray(baseGroups.map((_, index) => index))

  return {
    shuffledWords: order.map((index) => baseGroups[index]),
    transformedShuffledWords: order.map((index) => transformedGroups[index]),
    boldedShuffledWords: order.map((index) => boldGroups[index]),
  }
}

function formatSampleChoices(choiceText, groupSize = 1) {
  const tokens = String(choiceText || '')
    .split(' / ')
    .map((token) => token.trim())
    .filter(Boolean)
  return buildWordBankUnits(tokens, groupSize).join(' / ')
}

function buildSum30WordPairs(words) {
  const pairs = []
  for (let i = 0; i < words.length; i += 2) {
    pairs.push(words.slice(i, i + 2).join(' '))
  }
  return pairs
}

const SUM40_BLANK_SUFFIX = '______________'

function normalizeSum40MatchedWords(words) {
  const seen = new Set()
  const result = []

  for (const word of words || []) {
    const trimmed = String(word || '').trim()
    const cleanedKey = trimmed.replace(/[^\w]/g, '').toLowerCase()
    if (!cleanedKey || seen.has(cleanedKey)) continue
    seen.add(cleanedKey)
    result.push(trimmed)
  }

  return result
}

function chooseSum40BlankTargets(words, count = 6) {
  return normalizeSum40MatchedWords(words)
    .filter((word) => word.replace(/[^\w]/g, '').length >= 4)
    .sort((a, b) => b.replace(/[^\w]/g, '').length - a.replace(/[^\w]/g, '').length)
    .slice(0, count)
}

function buildSum40BlankToken(word) {
  const token = String(word || '')
  const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9])([A-Za-z0-9'-]*)([^A-Za-z0-9]*)$/)
  if (!match) return token

  const [, prefix, firstChar, , suffix] = match
  return `${prefix}${firstChar}${SUM40_BLANK_SUFFIX}${suffix}`
}

function replaceSum40FirstToken(text, target, replacement) {
  if (!target) return text
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`)
  return text.replace(regex, replacement)
}

async function processSum30Texts(inputText, apiKey) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const summary = await summarizeSum30Text(englishText, apiKey)
      const words = summary.split(/\s+/).filter((w) => w.length > 0)
      const wordPairs = buildSum30WordPairs(words)
      const shuffledPairs = shuffleArray(wordPairs)

      results.push({
        source: source.trim(),
        original: englishText,
        summary,
        wordPairs,
        shuffledPairs,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const processedText = results
    .filter((r) => !r.error)
    .map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.original}\n▶ ${r.summary}`)
    .join('\n\n')

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += '___________________________.\n\n'
    formatted += `<보기>\n${(r.shuffledPairs || []).join(' / ')}\n\n`
    formatted += '<조건>\n<보기>에 주어진 단어 쌍들을 모두 한번씩 사용하여 빈칸을 채우시오.\n\n\n\n\n'

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    processed: processedText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processSum40Texts(inputText, apiKey) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const summary = await summarizeSum40Text(englishText, apiKey)

      let matchedWords = []
      try {
        matchedWords = await findSum40WordMatches(englishText, summary, apiKey)
      } catch (matchError) {
        console.error('SUM40 단어 매칭 오류:', matchError)
      }

      const blankTargets = chooseSum40BlankTargets(matchedWords, 6)
      let blankedSummary = summary
      blankTargets.forEach((word) => {
        blankedSummary = replaceSum40FirstToken(blankedSummary, word, buildSum40BlankToken(word))
      })

      results.push({
        source: source.trim(),
        original: englishText.trim(),
        summary,
        matchedWords,
        blankTargets,
        blankedSummary,
        answerLine: blankTargets.map((word, idx) => `${idx + 1}. ${word}`).join(' / '),
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText.trim(),
        summary: `[오류: ${error.message}]`,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n\n'
    formatted += `${r.original}\n\n`
    formatted += '▶ 다음 40단어 요약문의 빈칸을 완성하시오.\n'
    formatted += `${r.blankedSummary}\n\n`
    formatted += '<조건>\n빈칸은 제시된 첫 글자를 참고하여 알맞은 단어를 쓰시오.\n\n\n'

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    processed: formattedResults.map((r) => r.text).join(''),
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results
      .filter((r) => !r.error)
      .map((r, index) => `${r.source || `지문 ${index + 1}`}\n정답: ${r.answerLine || '-'}\n완성 요약문: ${r.summary}`)
      .join('\n\n'),
    results,
  }
}

async function processSum15Texts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const summary = await summarizeText(englishText, apiKey)
      const prefix = 'The passage suggests that'
      let remainingWords = summary
      if (summary.toLowerCase().startsWith(prefix.toLowerCase())) {
        remainingWords = summary.substring(prefix.length).trim()
      }

      const words = remainingWords.split(/\s+/).filter((w) => w.length > 0)
      const transformableCandidates = words
        .map((w, idx) => ({ word: w, index: idx }))
        .filter(({ word }) => {
          const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
          if (clean.length < 4) return false

          if (clean.endsWith('ing') || clean.endsWith('ed')) return true
          if (clean.endsWith('s')) {
            const excludedWords = ['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us']
            if (!excludedWords.includes(clean)) return true
          }
          if (clean.endsWith('ment') || clean.endsWith('tion') || clean.endsWith('sion') || clean.endsWith('ance') || clean.endsWith('ence')) return true
          if (clean.endsWith('ive') || clean.endsWith('able') || clean.endsWith('ible') || (clean.endsWith('al') && clean.length > 4)) return true
          return false
        })

      const sortedTransformable = transformableCandidates.sort((a, b) => {
        const aClean = a.word.replace(/[.,!?;:]/g, '').toLowerCase()
        const bClean = b.word.replace(/[.,!?;:]/g, '').toLowerCase()
        const aIsVerb = aClean.endsWith('ing') || aClean.endsWith('ed')
        const bIsVerb = bClean.endsWith('ing') || bClean.endsWith('ed')
        if (aIsVerb && !bIsVerb) return -1
        if (!aIsVerb && bIsVerb) return 1
        const aIsS = aClean.endsWith('s')
        const bIsS = bClean.endsWith('s')
        if (aIsS && !bIsS) return -1
        if (!aIsS && bIsS) return 1
        return 0
      })

      const verbForms = sortedTransformable.filter((item) => {
        const clean = item.word.replace(/[.,!?;:]/g, '').toLowerCase()
        const hasPeriod = /\./.test(item.word)
        return !hasPeriod && (clean.endsWith('ing') || clean.endsWith('ed') || clean.endsWith('s'))
      })

      const nounAdjForms = sortedTransformable.filter((item) => {
        const clean = item.word.replace(/[.,!?;:]/g, '').toLowerCase()
        const hasPeriod = /\./.test(item.word)
        return !hasPeriod && (
          clean.endsWith('ment') || clean.endsWith('tion') || clean.endsWith('sion') ||
          clean.endsWith('ance') || clean.endsWith('ence') || clean.endsWith('ive') ||
          clean.endsWith('able') || clean.endsWith('ible') || (clean.endsWith('al') && clean.length > 4)
        )
      })

      const selectedVerbs = verbForms.slice(0, 2)
      const baseFormsMap = {}
      const transformedWords = new Set()
      const boldIndices = new Set()

      if (selectedVerbs.length > 0) {
        const wordMapping = selectedVerbs.map((item) => {
          const cleanWord = item.word.replace(/[.,!?;:]/g, '')
          const punctuation = item.word.replace(/[^.,!?;:]/g, '')
          return {
            original: item.word,
            clean: cleanWord,
            punctuation,
            index: item.index,
          }
        })

        try {
          const baseFormsResponse = await getBaseForms(wordMapping.map((w) => w.clean), apiKey)
          wordMapping.forEach(({ original, clean, punctuation, index }) => {
            const baseForm = baseFormsResponse[clean] || clean
            const finalForm = baseForm + punctuation
            const originalClean = original.replace(/[.,!?;:]/g, '').toLowerCase()
            const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()
            if (originalClean !== finalClean) {
              baseFormsMap[original] = finalForm
              transformedWords.add(original)
              boldIndices.add(index)
            } else {
              baseFormsMap[original] = original
            }
          })
        } catch (error) {
          wordMapping.forEach(({ original }) => {
            baseFormsMap[original] = original
          })
        }
      }

      if (transformedWords.size === 1 && nounAdjForms.length > 0) {
        const remainingNounAdj = nounAdjForms.filter((item) => !selectedVerbs.some((v) => v.index === item.index))
        if (remainingNounAdj.length > 0) {
          const additionalWord = remainingNounAdj[0]
          const cleanWord = additionalWord.word.replace(/[.,!?;:]/g, '')
          const punctuation = additionalWord.word.replace(/[^.,!?;:]/g, '')
          try {
            const baseFormsResponse = await getBaseForms([cleanWord], apiKey)
            const baseForm = baseFormsResponse[cleanWord] || cleanWord
            const finalForm = baseForm + punctuation
            const originalClean = additionalWord.word.replace(/[.,!?;:]/g, '').toLowerCase()
            const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()
            if (originalClean !== finalClean) {
              baseFormsMap[additionalWord.word] = finalForm
              transformedWords.add(additionalWord.word)
              boldIndices.add(additionalWord.index)
            } else {
              baseFormsMap[additionalWord.word] = additionalWord.word
            }
          } catch (error) {
            baseFormsMap[additionalWord.word] = additionalWord.word
          }
        }
      }

      const transformedTokens = words.map((word, idx) => (
        boldIndices.has(idx) && transformedWords.has(word) ? (baseFormsMap[word] || word) : word
      ))

      const boldTokens = words.map((word, idx) => {
        if (boldIndices.has(idx) && transformedWords.has(word)) {
          return `<b>${baseFormsMap[word] || word}</b>`
        }
        return word
      })

      const transformedCount = transformedWords.size
      let conditionText = ''
      if (transformedCount === 0) {
        conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>필요한 경우</b> 어법에 맞게 그 형태를 바꿀 것'
      } else if (transformedCount === 1) {
        conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것'
      } else {
        conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>두 단어만</b> 어법에 맞게 그 형태를 바꿀 것'
      }

      const groupedDisplays = buildGroupedDisplays(words, transformedTokens, boldTokens, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary,
        remainingWords: words,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'The passage suggests that ___________________________.\n\n'
    formatted += `<보기>\n${(r.boldedShuffledWords ? r.boldedShuffledWords.join(' / ') : r.shuffledWords.join(' / '))}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processTitle10Texts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const title = await generateTitle10(englishText, apiKey)
      const words = (title || '').split(/\s+/).filter((w) => w.length > 0)
      const groupedWords = glueArticlePairs(words)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것'
      const groupedDisplays = buildGroupedDisplays(groupedWords, groupedWords, groupedWords, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary: title,
        remainingWords: groupedWords,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'The best title for the passage is ___________________________.\n\n'
    formatted += `<보기>\n${(r.shuffledWords || []).join(' / ')}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

function isTransformable(word) {
  const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
  if (clean.length < 4) return false
  if (clean.endsWith('ing') || clean.endsWith('ed')) return true
  if (clean.endsWith('s')) {
    const excluded = ['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us']
    if (!excluded.includes(clean)) return true
  }
  if (clean.endsWith('ment') || clean.endsWith('tion') || clean.endsWith('sion') || clean.endsWith('ance') || clean.endsWith('ence')) return true
  if (clean.endsWith('ive') || clean.endsWith('able') || clean.endsWith('ible') || (clean.endsWith('al') && clean.length > 4)) return true
  return false
}

async function processTopic15OriginalTexts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const topic = await generateTopic15(englishText, apiKey)
      const words = (topic || '').split(/\s+/).filter((w) => w.length > 0)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것'
      const groupedDisplays = buildGroupedDisplays(words, words, words, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary: topic,
        remainingWords: words,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'The topic of the passage is ___________________________.\n\n'
    formatted += `<보기>\n${(r.shuffledWords || []).join(' / ')}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processTopic15Texts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const topic = await generateTopic15(englishText, apiKey)
      const words = (topic || '').split(/\s+/).filter((w) => w.length > 0)
      const transformableList = words
        .map((w, idx) => ({ word: w, index: idx }))
        .filter(({ word }) => isTransformable(word))
      const verbFirst = transformableList.filter(({ word }) => {
        const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
        return clean.endsWith('ing') || clean.endsWith('ed') || (clean.endsWith('s') && !['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us'].includes(clean))
      })
      const toTransform = verbFirst.length > 0 ? verbFirst[0] : transformableList[0]

      let transformedTokens = [...words]
      let boldTokens = words.map((w) => w)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것'

      if (toTransform) {
        const cleanWord = toTransform.word.replace(/[.,!?;:]/g, '')
        const punctuation = toTransform.word.replace(/[^.,!?;:]/g, '')
        try {
          const baseFormsResponse = await getBaseForms([cleanWord], apiKey)
          const baseForm = baseFormsResponse[cleanWord] || cleanWord
          const finalForm = baseForm + punctuation
          const originalClean = toTransform.word.replace(/[.,!?;:]/g, '').toLowerCase()
          const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()
          if (originalClean !== finalClean) {
            transformedTokens[toTransform.index] = finalForm
            boldTokens[toTransform.index] = `<b>${finalForm}</b>`
          }
        } catch (error) {
          console.error('topic 15 어법 변형 오류:', error)
        }
      }

      const groupedDisplays = buildGroupedDisplays(words, transformedTokens, boldTokens, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary: topic,
        remainingWords: words,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'The topic of the passage is ___________________________.\n\n'
    formatted += `<보기>\n${(r.boldedShuffledWords || r.shuffledWords || []).join(' / ')}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processTopicSentence15OriginalTexts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const topicSentence = await generateTopicSentence15(englishText, apiKey)
      const words = (topicSentence || '').split(/\s+/).filter((w) => w.length > 0)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것'
      const groupedDisplays = buildGroupedDisplays(words, words, words, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary: topicSentence,
        remainingWords: words,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'The topic sentence of the passage is ___________________________.\n\n'
    formatted += `<보기>\n${(r.shuffledWords || []).join(' / ')}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processTopicSentence15Texts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const topicSentence = await generateTopicSentence15(englishText, apiKey)
      const words = (topicSentence || '').split(/\s+/).filter((w) => w.length > 0)
      const transformableList = words
        .map((w, idx) => ({ word: w, index: idx }))
        .filter(({ word }) => isTransformable(word))
      const verbFirst = transformableList.filter(({ word }) => {
        const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
        return clean.endsWith('ing') || clean.endsWith('ed') || (clean.endsWith('s') && !['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us'].includes(clean))
      })
      const toTransform = verbFirst.length > 0 ? verbFirst[0] : transformableList[0]

      let transformedTokens = [...words]
      let boldTokens = words.map((w) => w)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것'

      if (toTransform) {
        const cleanWord = toTransform.word.replace(/[.,!?;:]/g, '')
        const punctuation = toTransform.word.replace(/[^.,!?;:]/g, '')
        try {
          const baseFormsResponse = await getBaseForms([cleanWord], apiKey)
          const baseForm = baseFormsResponse[cleanWord] || cleanWord
          const finalForm = baseForm + punctuation
          const originalClean = toTransform.word.replace(/[.,!?;:]/g, '').toLowerCase()
          const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()
          if (originalClean !== finalClean) {
            transformedTokens[toTransform.index] = finalForm
            boldTokens[toTransform.index] = `<b>${finalForm}</b>`
          }
        } catch (error) {
          console.error('topic sentence 15 어법 변형 오류:', error)
        }
      }

      const groupedDisplays = buildGroupedDisplays(words, transformedTokens, boldTokens, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary: topicSentence,
        remainingWords: words,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'The topic sentence of the passage is ___________________________.\n\n'
    formatted += `<보기>\n${(r.boldedShuffledWords || r.shuffledWords || []).join(' / ')}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processResponse20OriginalTexts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const responseText = await generateResponse20(englishText, apiKey)
      const prefix = 'I found it fascinating '
      let remaining = String(responseText || '').trim()
      if (remaining.toLowerCase().startsWith(prefix.toLowerCase())) {
        remaining = remaining.substring(prefix.length).trim()
      }
      const words = remaining.split(/\s+/).filter((w) => w.length > 0)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것'
      const groupedDisplays = buildGroupedDisplays(words, words, words, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary: responseText,
        remainingWords: words,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'I found it fascinating ___________________________.\n\n'
    formatted += `<보기>\n${(r.shuffledWords || []).join(' / ')}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processResponse20Texts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const responseText = await generateResponse20(englishText, apiKey)
      const prefix = 'I found it fascinating '
      let remaining = String(responseText || '').trim()
      if (remaining.toLowerCase().startsWith(prefix.toLowerCase())) {
        remaining = remaining.substring(prefix.length).trim()
      }
      const words = remaining.split(/\s+/).filter((w) => w.length > 0)
      const transformableList = words
        .map((w, idx) => ({ word: w, index: idx }))
        .filter(({ word }) => isTransformable(word))
      const verbFirst = transformableList.filter(({ word }) => {
        const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
        return clean.endsWith('ing') || clean.endsWith('ed') || (clean.endsWith('s') && !['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us'].includes(clean))
      })
      const toTransform = verbFirst.length > 0 ? verbFirst[0] : transformableList[0]

      let transformedTokens = [...words]
      let boldTokens = words.map((w) => w)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것'

      if (toTransform) {
        const cleanWord = toTransform.word.replace(/[.,!?;:]/g, '')
        const punctuation = toTransform.word.replace(/[^.,!?;:]/g, '')
        try {
          const baseFormsResponse = await getBaseForms([cleanWord], apiKey)
          const baseForm = baseFormsResponse[cleanWord] || cleanWord
          const finalForm = baseForm + punctuation
          const originalClean = toTransform.word.replace(/[.,!?;:]/g, '').toLowerCase()
          const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()
          if (originalClean !== finalClean) {
            transformedTokens[toTransform.index] = finalForm
            boldTokens[toTransform.index] = `<b>${finalForm}</b>`
          }
        } catch (error) {
          console.error('response 20 어법 변형 오류:', error)
        }
      }

      const groupedDisplays = buildGroupedDisplays(words, transformedTokens, boldTokens, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary: responseText,
        remainingWords: words,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'I found it fascinating ___________________________.\n\n'
    formatted += `<보기>\n${(r.boldedShuffledWords || r.shuffledWords || []).join(' / ')}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processInterview25OriginalTexts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])
    if (!englishText.trim()) continue

    try {
      const { q1, a1 } = await generateInterview25Single(englishText, apiKey)
      const words = String(a1 || '').split(/\s+/).filter((w) => w.length > 0)
      const groupedDisplays = buildGroupedDisplays(words, words, words, groupSize)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것'
      const summaryBlock =
        `Q1: ${(q1 || '').trim()}\n\n` +
        'A1: ___________________________.\n\n' +
        `<보기>\n${groupedDisplays.shuffledWords.join(' / ')}\n\n` +
        `<조건>\n${conditionText}`

      results.push({
        source: source.trim(),
        original: englishText,
        summary: summaryBlock,
        answer1Sentence: a1,
        answerSentence: `A1: ${a1 || ''}`,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        answer1Sentence: '',
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }
    let formatted = `${r.source || `지문 ${index + 1}`}\n\n`
    formatted += `${r.original}\n\n\n`
    formatted += `${(r.summary || '').trim()}\n\n\n\n\n`
    return {
      text: formatted,
      summary: r.summary,
      answer1Sentence: r.answer1Sentence,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r) => `${r.source || ''}\nA1: ${r.answer1Sentence || ''}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processInterview25Texts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])
    if (!englishText.trim()) continue

    try {
      const { q1, a1 } = await generateInterview25Single(englishText, apiKey)
      const words = String(a1 || '').split(/\s+/).filter((w) => w.length > 0)
      const transformableList = words
        .map((w, idx) => ({ word: w, index: idx }))
        .filter(({ word }) => isTransformable(word))
      const verbFirst = transformableList.filter(({ word }) => {
        const clean = word.replace(/[.,!?;:]/g, '').toLowerCase()
        return clean.endsWith('ing') || clean.endsWith('ed') || (clean.endsWith('s') && !['has', 'is', 'was', 'his', 'its', 'this', 'plus', 'thus', 'yes', 'us'].includes(clean))
      })
      const toTransform = verbFirst.length > 0 ? verbFirst[0] : transformableList[0]

      let transformedTokens = [...words]
      let boldTokens = words.map((w) => w)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용하되, <b>한 단어만</b> 어법에 맞게 그 형태를 바꿀 것'

      if (toTransform) {
        const cleanWord = toTransform.word.replace(/[.,!?;:]/g, '')
        const punctuation = toTransform.word.replace(/[^.,!?;:]/g, '')
        try {
          const baseFormsResponse = await getBaseForms([cleanWord], apiKey)
          const baseForm = baseFormsResponse[cleanWord] || cleanWord
          const finalForm = baseForm + punctuation
          const originalClean = toTransform.word.replace(/[.,!?;:]/g, '').toLowerCase()
          const finalClean = finalForm.replace(/[.,!?;:]/g, '').toLowerCase()
          if (originalClean !== finalClean) {
            transformedTokens[toTransform.index] = finalForm
            boldTokens[toTransform.index] = `<b>${finalForm}</b>`
          }
        } catch (error) {
          console.error('interview 25 어법 변형 오류:', error)
        }
      }

      const groupedDisplays = buildGroupedDisplays(words, transformedTokens, boldTokens, groupSize)

      const summaryBlock =
        `Q1: ${(q1 || '').trim()}\n\n` +
        'A1: ___________________________.\n\n' +
        `<보기>\n${groupedDisplays.boldedShuffledWords.join(' / ')}\n\n` +
        `<조건>\n${conditionText}`

      results.push({
        source: source.trim(),
        original: englishText,
        summary: summaryBlock,
        answer1Sentence: a1,
        answerSentence: `A1: ${a1 || ''}`,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        answer1Sentence: '',
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }
    let formatted = `${r.source || `지문 ${index + 1}`}\n\n`
    formatted += `${r.original}\n\n\n`
    formatted += `${(r.summary || '').trim()}\n\n\n\n\n`
    return {
      text: formatted,
      summary: r.summary,
      answer1Sentence: r.answer1Sentence,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r) => `${r.source || ''}\nA1: ${r.answer1Sentence || ''}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

async function processSum15OriginalTexts(inputText, apiKey, groupSize = 1) {
  const textBlocks = splitTextBlocks(inputText)
  const results = []

  for (let i = 0; i < textBlocks.length; i += 1) {
    const { source, englishText, koreanTranslation } = splitSingleBlock(textBlocks[i])

    if (!englishText.trim()) {
      continue
    }

    try {
      const summary = await summarizeText(englishText, apiKey)
      const prefix = 'The passage suggests that'
      let remainingWords = summary
      if (summary.toLowerCase().startsWith(prefix.toLowerCase())) {
        remainingWords = summary.substring(prefix.length).trim()
      }

      const words = remainingWords.split(/\s+/).filter((w) => w.length > 0)
      const conditionText = '<보기>에 주어진 단어 및 어구만을 모두 한번씩 사용할 것'
      const groupedDisplays = buildGroupedDisplays(words, words, words, groupSize)

      results.push({
        source: source.trim(),
        original: englishText,
        summary,
        remainingWords: words,
        shuffledWords: groupedDisplays.shuffledWords,
        transformedShuffledWords: groupedDisplays.transformedShuffledWords,
        boldedShuffledWords: groupedDisplays.boldedShuffledWords,
        conditionText,
        koreanTranslation,
      })
    } catch (error) {
      results.push({
        source: source.trim(),
        original: englishText,
        summary: `[오류: ${error.message}]`,
        remainingWords: [],
        shuffledWords: [],
        koreanTranslation,
        error: error.message,
      })
    }
  }

  const formattedResults = results.map((r, index) => {
    if (r.error) {
      return {
        text: `${r.source}\n${r.original}\n\n[오류: ${r.error}]\n\n\n\n\n\n\n\n\n`,
        summary: null,
      }
    }

    let formatted = r.source || `지문 ${index + 1}`
    formatted += '\n'
    formatted += `${r.original}\n`
    formatted += `${r.summary}\n`
    formatted += 'The passage suggests that ___________________________.\n\n'
    formatted += `<보기>\n${(r.shuffledWords || []).join(' / ')}\n\n`
    formatted += `<조건>\n${r.conditionText}\n\n\n\n\n`

    return {
      text: formatted,
      summary: r.summary,
      source: r.source || `지문 ${index + 1}`,
    }
  })

  return {
    original: inputText,
    summary: formattedResults.map((r) => r.text).join(''),
    answerSheet: results.filter((r) => !r.error).map((r, index) => `${r.source || `지문 ${index + 1}`}\n${r.summary}`).join('\n\n'),
    questionParts: formattedResults,
    results,
  }
}

function buildEditableOutputText(data) {
  if (!data) return ''
  let fullText = data.summary || data.processed || ''
  fullText = fullText.replace(/<b>/g, '').replace(/<\/b>/g, '')
  if (data.answerSheet) fullText += `\n\n\n<답지>\n\n${data.answerSheet}`
  return fullText
}

function buildSamplePreviewData(config, groupSize) {
  if (config.viewerType === 'sum40') {
    return {
      original: config.sample.original,
      results: [
        {
          source: config.sample.source,
          original: config.sample.original,
          summary: '',
          blankedSummary: config.sample.blankedSummary,
          answerLine: config.sample.answerLine,
        },
      ],
    }
  }

  if (config.viewerType === 'sum30') {
    const choicePairs = String(config.sample.choices || '')
      .split(' / ')
      .map((part) => part.trim())
      .filter(Boolean)

    return {
      original: config.sample.original,
      results: [
        {
          source: config.sample.source,
          original: config.sample.original,
          summary: config.sample.previewText || '',
          shuffledPairs: choicePairs,
        },
      ],
    }
  }

  const choiceGroups = formatSampleChoices(config.sample.choices, groupSize)
    .split(' / ')
    .map((part) => part.trim())
    .filter(Boolean)

  return {
    original: config.sample.original,
    results: [
      {
        source: config.sample.source,
        original: config.sample.original,
        summary: config.sample.previewText || '',
        shuffledWords: choiceGroups,
        transformedShuffledWords: choiceGroups,
        boldedShuffledWords: choiceGroups,
        conditionText: config.sample.condition,
      },
    ],
  }
}

function PdfSamplePreview({ config, groupSize, theme }) {
  const sampleData = buildSamplePreviewData(config, groupSize)
  const choiceGroups = sampleData.results?.[0]?.shuffledWords || []
  const themeColors = getSum15Theme(theme).colors
  const previewScale = 0.42
  const previewFrameWidth = 834
  const previewFrameHeight = 1163

  if (config.designMode === 'text') {
    return (
      <div style={{ background: '#eef2f7', borderRadius: '16px', padding: '20px', border: '1px solid #dbe3ef' }}>
        <div style={{ marginBottom: '10px', fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>PDF 샘플 1페이지</div>
        <div style={{ overflow: 'hidden', borderRadius: '12px', border: '1px solid #dbe3ef', background: '#f8fafc' }}>
          <div style={{ width: `${previewFrameWidth * previewScale}px`, height: `${previewFrameHeight * previewScale}px`, margin: '0 auto', overflow: 'hidden' }}>
            <div style={{ width: `${previewFrameWidth}px`, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              <div style={{ width: '210mm', minHeight: '297mm', background: themeColors.pageBg, margin: '20px auto', padding: '25mm 20mm', boxShadow: themeColors.shadow, boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: '6px', height: '28px', backgroundColor: themeColors.sourceAccent, flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ width: '100%' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: themeColors.ink, margin: '0 0 16px 0', lineHeight: 1.3 }}>{config.sample.source}</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: themeColors.muted, lineHeight: 1.5 }}>Q. 다음 지문을 읽고 &lt;조건&gt; 에 맞게 글을 작성하시오.</div>
                    </div>
                  </div>
                  <div style={{ padding: '20px', background: `linear-gradient(135deg, ${themeColors.panelBgStart} 0%, ${themeColors.panelBgEnd} 100%)`, borderLeft: `5px solid ${themeColors.passageAccent}`, borderRadius: '8px', boxShadow: themeColors.panelShadow }}>
                    <pre style={{ margin: 0, color: themeColors.ink, fontSize: '0.95rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'inherit', textAlign: 'justify' }}>{config.sample.original}</pre>
                  </div>
                  <div style={{ padding: '20px', background: `linear-gradient(135deg, ${themeColors.panelBgStart} 0%, ${themeColors.panelBgEnd} 100%)`, borderLeft: `5px solid ${themeColors.interviewAccent}`, borderRadius: '8px', boxShadow: themeColors.panelShadow }}>
                    <pre style={{ margin: 0, color: themeColors.ink, fontSize: '0.95rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{config.sample.previewText || 'Q1: How would you summarize your message?'}</pre>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: themeColors.ink, padding: '16px', border: `1px solid ${themeColors.ink}`, borderRadius: '4px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    {config.blankPrefix}<span style={{ flex: 1, borderBottom: `2px solid ${themeColors.ink}`, minWidth: '200px', display: 'inline-block', height: '1.2em', margin: '0 4px' }}></span>{config.blankSuffix}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
                    <div style={{ padding: '16px', background: `linear-gradient(135deg, ${themeColors.choiceBgStart} 0%, ${themeColors.choiceBgEnd} 100%)`, border: `2px solid ${themeColors.panelBorder}`, borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.95rem', color: themeColors.ink, marginBottom: '12px', paddingBottom: '8px', borderBottom: `1px solid ${themeColors.ink}` }}>&lt;보기&gt;</div>
                      <div style={{ fontSize: '0.9rem', color: themeColors.ink, lineHeight: 1.5, wordSpacing: '4px' }}>{choiceGroups.join(' / ')}</div>
                    </div>
                    <div style={{ padding: '16px', background: `linear-gradient(135deg, ${themeColors.choiceBgStart} 0%, ${themeColors.choiceBgEnd} 100%)`, border: `2px solid ${themeColors.panelBorder}`, borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.95rem', color: themeColors.ink, marginBottom: '12px', paddingBottom: '8px', borderBottom: `1px solid ${themeColors.ink}` }}>&lt;조건&gt;</div>
                      <div style={{ fontSize: '0.9rem', color: themeColors.ink, lineHeight: 1.5, position: 'relative', paddingLeft: '1.5em' }} dangerouslySetInnerHTML={{ __html: config.sample.condition }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#eef2f7', borderRadius: '16px', padding: '20px', border: '1px solid #dbe3ef' }}>
      <div style={{ marginBottom: '10px', fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>PDF 샘플 1페이지</div>
      <div style={{ overflow: 'hidden', borderRadius: '12px', border: '1px solid #dbe3ef', background: '#f8fafc' }}>
        <div style={{ width: `${previewFrameWidth * previewScale}px`, height: `${previewFrameHeight * previewScale}px`, margin: '0 auto', overflow: 'hidden' }}>
          <div style={{ width: `${previewFrameWidth}px`, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
            {config.viewerType === 'sum40' ? (
              <Sum40Viewer
                data={sampleData}
                hideAnswerPage
                theme={theme}
                idPrefix="sum40-sample"
              />
            ) : config.viewerType === 'sum30' ? (
              <Sum30Viewer
                data={sampleData}
                hideAnswerPage
                theme={theme}
                idPrefix="sum30-sample"
              />
            ) : (
              <Sum15Viewer
                data={sampleData}
                blankPrefix={config.blankPrefix}
                blankSuffix={config.blankSuffix}
                hideAnswerPage
                theme={theme}
                idPrefix="sum15-sample"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DescriptiveProblemBuilder({ apiKey }) {
  const [text, setText] = useState('')
  const [selectedType, setSelectedType] = useState('sum15')
  const [useTransformation, setUseTransformation] = useState(true)
  const [shuffleGroupSize, setShuffleGroupSize] = useState(1)
  const [pdfTheme, setPdfTheme] = useState('classic')
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingPdf, setIsSavingPdf] = useState(false)
  const [error, setError] = useState('')
  const [resultData, setResultData] = useState(null)
  const [editedOutputText, setEditedOutputText] = useState('')
  const [showDesignPreview, setShowDesignPreview] = useState(false)
  const editedOutputRef = useRef(null)

  const selectedGroup = useMemo(
    () => TYPE_GROUPS.find((group) => group.id === selectedType) || TYPE_GROUPS[0],
    [selectedType]
  )
  const selectedConfigKey = useMemo(() => {
    if (!selectedGroup.supportsTransform) return selectedGroup.transformedId
    return useTransformation ? selectedGroup.transformedId : selectedGroup.originalId
  }, [selectedGroup, useTransformation])
  const selectedConfig = useMemo(() => PROBLEM_TYPES[selectedConfigKey], [selectedConfigKey])
  const activeTheme = useMemo(() => getSum15Theme(pdfTheme), [pdfTheme])
  const activeViewerType = selectedConfig.viewerType || 'sum15'
  const viewerProps = useMemo(() => {
    if (selectedConfigKey === 'interview25' || selectedConfigKey === 'interview25Original') {
      return {
        answerKey: 'answerSentence',
        showSummaryBeforeBlank: true,
        hideBlankLine: true,
      }
    }

    return {}
  }, [selectedConfigKey])

  useEffect(() => {
    setEditedOutputText(buildEditableOutputText(resultData))
  }, [resultData])

  useEffect(() => {
    if (!editedOutputRef.current) return
    editedOutputRef.current.style.height = 'auto'
    editedOutputRef.current.style.height = `${editedOutputRef.current.scrollHeight}px`
  }, [editedOutputText])

  const handleProcess = async () => {
    if (!text.trim()) {
      setError('지문을 입력해주세요.')
      return
    }
    if (!apiKey) {
      setError('API 키를 먼저 설정해주세요.')
      return
    }

    setIsLoading(true)
    setError('')
    setShowDesignPreview(false)

    try {
      let nextData
      if (selectedConfigKey === 'sum40') {
        nextData = await processSum40Texts(text, apiKey)
      } else if (selectedConfigKey === 'sum30') {
        nextData = await processSum30Texts(text, apiKey)
      } else if (selectedConfigKey === 'title10') {
        nextData = await processTitle10Texts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'response20') {
        nextData = await processResponse20Texts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'response20Original') {
        nextData = await processResponse20OriginalTexts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'interview25') {
        nextData = await processInterview25Texts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'interview25Original') {
        nextData = await processInterview25OriginalTexts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'topicSentence15') {
        nextData = await processTopicSentence15Texts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'topicSentence15Original') {
        nextData = await processTopicSentence15OriginalTexts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'topic15') {
        nextData = await processTopic15Texts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'topic15Original') {
        nextData = await processTopic15OriginalTexts(text, apiKey, shuffleGroupSize)
      } else if (selectedConfigKey === 'sum15Original') {
        nextData = await processSum15OriginalTexts(text, apiKey, shuffleGroupSize)
      } else {
        nextData = await processSum15Texts(text, apiKey, shuffleGroupSize)
      }
      setResultData(nextData)
    } catch (processError) {
      console.error('서술형 문제 처리 중 오류:', processError)
      setError(processError.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setText('')
    setError('')
    setResultData(null)
    setShowDesignPreview(false)
  }

  const handleCopy = () => {
    if (!editedOutputText.trim()) return
    navigator.clipboard.writeText(editedOutputText)
    alert('처리된 텍스트가 클립보드에 복사되었습니다.')
  }

  const handleSavePdf = async () => {
    if (!resultData) return

    setIsSavingPdf(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 50))
      if (activeViewerType === 'sum40') {
        await exportSum40ToPdf({
          filename: `${selectedConfig.label}.pdf`,
        })
      } else if (activeViewerType === 'sum30') {
        await exportSum30ToPdf({
          filename: `${selectedConfig.label}.pdf`,
        })
      } else {
        await exportSum15ToPdf({
          filename: `${selectedConfig.label}.pdf`,
        })
      }
    } catch (saveError) {
      alert(saveError.message || 'PDF 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSavingPdf(false)
    }
  }

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '24px 20px 60px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(420px, 1.1fr)', gap: '24px', alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: '18px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)', padding: '24px' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', marginBottom: '8px' }}>공통 입력</div>
          <div style={{ color: '#6b7280', lineHeight: 1.6, marginBottom: '18px' }}>
            입력 형식이 같은 유형들을 한곳에서 처리합니다. 먼저 왼쪽에 지문을 넣고, 오른쪽에서 원하는 출력 형식을 고른 뒤 실행하세요.
          </div>

          <label htmlFor="descriptive-problem-text" style={{ display: 'block', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>
            지문 입력
          </label>
          <textarea
            id="descriptive-problem-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="출처/영어원문/한글해석// 출처2/영어원문2/한글해석2// 형식으로 입력하세요."
            rows={18}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '2px solid #dbe3ef',
              fontSize: '0.98rem',
              lineHeight: 1.6,
              resize: 'vertical',
              minHeight: '360px',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ marginTop: '10px', color: '#6b7280', fontSize: '0.9rem' }}>{selectedConfig.guide}</div>

          {error && (
            <div style={{ marginTop: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '10px', padding: '12px 14px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleReset}
              disabled={isLoading}
              style={{ padding: '12px 18px', border: 'none', borderRadius: '10px', background: '#64748b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              입력 초기화
            </button>
            <button
              type="button"
              onClick={handleProcess}
              disabled={isLoading}
              style={{ padding: '12px 18px', border: 'none', borderRadius: '10px', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              {isLoading ? '처리 중...' : `${selectedConfig.label} 생성`}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ background: '#fff', borderRadius: '18px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)', padding: '24px' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', marginBottom: '14px' }}>출력 형식 선택</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {TYPE_GROUPS.map((type) => {
                const active = selectedType === type.id
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setSelectedType(type.id)
                      setUseTransformation(type.supportsTransform ? true : false)
                      setResultData(null)
                      setShowDesignPreview(false)
                      setError('')
                    }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '999px',
                      border: active ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                      background: active ? '#dbeafe' : '#fff',
                      color: active ? '#1d4ed8' : '#334155',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {type.label}
                  </button>
                )
              })}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0 16px', paddingTop: '16px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#475569', marginBottom: '10px' }}>세부 출력 옵션</div>
              {selectedGroup.supportsTransform && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>변형 여부</div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setUseTransformation(true)
                        setResultData(null)
                        setShowDesignPreview(false)
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '999px',
                        border: useTransformation ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                        background: useTransformation ? '#f3e8ff' : '#fff',
                        color: useTransformation ? '#6d28d9' : '#334155',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      변형 있음
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseTransformation(false)
                        setResultData(null)
                        setShowDesignPreview(false)
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '999px',
                        border: !useTransformation ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                        background: !useTransformation ? '#f3e8ff' : '#fff',
                        color: !useTransformation ? '#6d28d9' : '#334155',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      변형 없음
                    </button>
                  </div>
                </div>
              )}
              {selectedConfig.supportsCustomGrouping !== false && (
                <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>보기 묶음 단위</div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {[1, 2, 3].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setShuffleGroupSize(size)
                        setResultData(null)
                        setShowDesignPreview(false)
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '999px',
                        border: shuffleGroupSize === size ? '2px solid #0f766e' : '1px solid #cbd5e1',
                        background: shuffleGroupSize === size ? '#ccfbf1' : '#fff',
                        color: shuffleGroupSize === size ? '#0f766e' : '#334155',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {size}단어씩
                    </button>
                  ))}
                </div>
                </div>
              )}
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>PDF 색상 톤</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap', overflow: 'hidden', width: '100%' }}>
                  {SUM15_THEME_PRESETS.map((themeOption) => {
                    const active = pdfTheme === themeOption.id
                    return (
                      <button
                        key={themeOption.id}
                        type="button"
                        onClick={() => setPdfTheme(themeOption.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          justifyContent: 'center',
                          padding: '7px 8px',
                          borderRadius: '999px',
                          border: active ? `2px solid ${themeOption.swatch}` : '1px solid #cbd5e1',
                          background: active ? '#f8fafc' : '#fff',
                          color: '#334155',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          lineHeight: 1.1,
                          flex: '1 1 0',
                          minWidth: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: themeOption.swatch, border: '1px solid rgba(15, 23, 42, 0.12)', flexShrink: 0 }} />
                        {themeOption.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>{selectedConfig.badge}</div>
              <div style={{ color: '#475569', lineHeight: 1.7 }}>{selectedConfig.description}</div>
            </div>
          </div>

          <PdfSamplePreview config={selectedConfig} groupSize={shuffleGroupSize} theme={pdfTheme} />
        </div>
      </div>

      {resultData && (
        <div style={{ marginTop: '28px', background: '#fff', borderRadius: '18px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
            <div>
              <div style={{ fontSize: '1.18rem', fontWeight: 800, color: '#111827' }}>실제 출력 결과</div>
              <div style={{ color: '#6b7280', marginTop: '6px' }}>{selectedConfig.label} 형식으로 생성된 결과입니다.</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowDesignPreview((prev) => !prev)}
                style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                {showDesignPreview ? '텍스트 결과 보기' : 'PDF 형식 미리보기'}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                결과 복사하기
              </button>
              <button
                type="button"
                onClick={handleSavePdf}
                disabled={isSavingPdf}
                style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: '#059669', color: '#fff', fontWeight: 700, cursor: isSavingPdf ? 'default' : 'pointer', opacity: isSavingPdf ? 0.7 : 1 }}
              >
                {isSavingPdf ? 'PDF 저장 중...' : 'PDF 저장'}
              </button>
              <button
                type="button"
                onClick={() => setEditedOutputText(buildEditableOutputText(resultData))}
                style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: '#64748b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                처리 결과 되돌리기
              </button>
            </div>
          </div>

          {showDesignPreview ? (
            selectedConfig.designMode === 'text' ? (
              <div style={{ background: '#eef2f7', borderRadius: '16px', padding: '20px', border: '1px solid #dbe3ef' }}>
                <div style={{ maxWidth: '820px', margin: '0 auto', background: activeTheme.colors.pageBg, minHeight: '1100px', borderRadius: '8px', border: `1px solid ${activeTheme.colors.panelBorder}`, boxShadow: activeTheme.colors.shadow, padding: '28px', borderTop: `10px solid ${activeTheme.colors.sourceAccent}` }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.97rem', lineHeight: 1.75, color: activeTheme.colors.ink }}>
                    {editedOutputText}
                  </pre>
                </div>
              </div>
            ) : (
              activeViewerType === 'sum40' ? (
                <Sum40Viewer
                  data={resultData}
                  theme={pdfTheme}
                />
              ) : activeViewerType === 'sum30' ? (
                <Sum30Viewer
                  data={resultData}
                  theme={pdfTheme}
                />
              ) : (
                <Sum15Viewer
                  data={resultData}
                  blankPrefix={selectedConfig.blankPrefix}
                  blankSuffix={selectedConfig.blankSuffix}
                  theme={pdfTheme}
                  {...viewerProps}
                />
              )
            )
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
              <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>원본 텍스트</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.65, fontFamily: 'inherit', color: '#1f2937' }}>{resultData.original}</pre>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>처리된 텍스트</div>
                <div style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '12px' }}>
                  여기서 바로 수정한 뒤 복사할 수 있습니다.
                </div>
                <textarea
                  ref={editedOutputRef}
                  value={editedOutputText}
                  onChange={(e) => setEditedOutputText(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '520px',
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    lineHeight: 1.7,
                    resize: 'none',
                    overflow: 'hidden',
                    color: '#1f2937',
                    background: '#fff',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {resultData && (!showDesignPreview || selectedConfig.designMode === 'text') && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '0',
            pointerEvents: 'none',
            zIndex: -1,
            background: 'transparent',
          }}
        >
          {activeViewerType === 'sum40' ? (
            <Sum40Viewer
              data={resultData}
              theme={pdfTheme}
            />
          ) : activeViewerType === 'sum30' ? (
            <Sum30Viewer
              data={resultData}
              theme={pdfTheme}
            />
          ) : (
            <Sum15Viewer
              data={resultData}
              blankPrefix={selectedConfig.blankPrefix}
              blankSuffix={selectedConfig.blankSuffix}
              theme={pdfTheme}
              {...viewerProps}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default DescriptiveProblemBuilder
