const SYSTEM_PROMPT = `You are an expert English vocabulary teacher for Korean high school students preparing for school exams (내신).
Given an English passage and its Korean translation, extract 15-20 important vocabulary words or phrases that students should study.
Always respond with valid JSON only. No additional text.`

function buildUserPrompt(englishText, koreanText, passageNumber) {
  return `Passage #${passageNumber}

[English]
${englishText}

[Korean Translation]
${koreanText}

Extract 15-20 important vocabulary words/phrases from this passage.
For each word, provide:
- "english": the English word or phrase (lemma form preferred, but keep multi-word expressions intact)
- "korean": the Korean meaning (concise, 1-3 words)

Rules:
1. Include a mix of single words and useful multi-word expressions/collocations.
2. Prioritize words that are important for the exam (not basic words like "the", "is", "have").
3. Korean meanings should match the context of this specific passage.
4. Order words roughly as they appear in the passage.
5. Do NOT include proper nouns (names of people, places) unless they are common vocabulary.

Output JSON format:
{
  "words": [
    { "english": "word", "korean": "뜻" },
    ...
  ]
}`
}

export async function extractVocabulary(englishText, koreanText, passageNumber, apiKey) {
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.')
  if (!englishText?.trim()) throw new Error('영어 지문이 비어 있습니다.')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(englishText, koreanText, passageNumber) },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenAI API 오류 (HTTP ${response.status})`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('AI 응답이 비어 있습니다.')

  const parsed = JSON.parse(content)
  const words = parsed.words || parsed.vocabulary || []

  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('단어를 추출할 수 없습니다.')
  }

  return words.map(w => ({
    english: String(w.english || '').trim(),
    korean: String(w.korean || '').trim(),
  })).filter(w => w.english && w.korean)
}

export async function extractKeyWords(englishText, passageNumber, apiKey) {
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.')
  if (!englishText?.trim()) throw new Error('영어 지문이 비어 있습니다.')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You select the 15 most contextually important single words from an English passage for a fill-in-the-blank test.
Rules:
- Pick exactly 20 words.
- Each word must be a SINGLE word that appears EXACTLY as-is in the passage (case-sensitive match).
- Do NOT pick common function words (the, a, an, is, are, was, were, be, to, of, in, on, at, for, and, but, or, it, he, she, they, we, this, that, with, from, by, as, not, no, do, did, has, had, have, will, can, may, so, if, its, his, her, our, their, my, your, all, who, what, which, than, up, out).
- Do NOT pick words that start with an uppercase letter in the passage (proper nouns, sentence starters). Only pick words that appear in lowercase in the passage.
- Prefer content-rich words: nouns, verbs, adjectives, adverbs that carry the passage's meaning.
- Order them as they appear in the passage.
- Always respond with valid JSON only.`,
        },
        {
          role: 'user',
          content: `Passage #${passageNumber}\n\n${englishText.trim()}\n\nReturn JSON: { "words": ["word1", "word2", ...] }`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenAI API 오류 (HTTP ${response.status})`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('AI 응답이 비어 있습니다.')

  const parsed = JSON.parse(content)
  const words = parsed.words || []

  if (!Array.isArray(words) || words.length === 0) throw new Error('키워드를 추출할 수 없습니다.')
  return words.map(w => String(w).trim()).filter(Boolean).slice(0, 20)
}

const CONNECTING_ADVERBS = [
  'So', 'However', 'In other words', 'Yet', 'Moreover', 'Furthermore',
  'Thus', 'Therefore', 'But', 'Also', 'Additionally', 'Meanwhile',
  'Nevertheless', 'Nonetheless', 'Still', 'Then', 'Hence', 'Consequently',
  'Accordingly', 'Similarly', 'Likewise', 'Instead', 'Rather', 'Otherwise',
  'On the other hand', 'For example', 'Another', 'The other',
]
const PRONOUNS = ['I', 'You', 'He', 'She', 'It', 'We', 'They', 'This', 'That', 'These', 'Those']
const DETERMINERS = ['a', 'an', 'the', 'this', 'that', 'these', 'those', 'some', 'any', 'no', 'every', 'each', 'either', 'neither', 'both', 'all', 'few', 'little', 'many', 'much', 'several']

function splitSentencesRaw(text) {
  const sentences = []
  const re = /[.!?]\s+/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    const s = text.substring(last, m.index + m[0].length).trim()
    if (s) sentences.push(s)
    last = m.index + m[0].length
  }
  const tail = text.substring(last).trim()
  if (tail) sentences.push(tail)
  return sentences
}

function sentencePriority(sentence) {
  const trimmed = sentence.trim()
  for (const adv of CONNECTING_ADVERBS) {
    const lower = trimmed.toLowerCase()
    if (lower.startsWith(adv.toLowerCase() + ' ') || lower.startsWith(adv.toLowerCase() + ',')) return 1
  }
  const escapedAdverbs = CONNECTING_ADVERBS.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
  for (const pat of escapedAdverbs) {
    if (new RegExp(`[;,]\\s*${pat}(?=\\s|[,;.!?]|$)`, 'i').test(trimmed)) return 1
  }
  if (/\bsuch\b(?!\s+as\b)/i.test(trimmed)) return 2
  for (const p of PRONOUNS) { if (new RegExp(`^${p}\\s+`, 'i').test(trimmed)) return 3 }
  for (const d of DETERMINERS) { if (new RegExp(`^${d}\\s+`, 'i').test(trimmed)) return 4 }
  return 999
}

export function splitPassageForOrdering(englishText) {
  const sentences = splitSentencesRaw(englishText)
  if (sentences.length < 4) {
    const third = Math.ceil(sentences.length / 3)
    return {
      intro: sentences[0] || '',
      parts: [
        sentences.slice(1, 1 + third).join(' '),
        sentences.slice(1 + third, 1 + third * 2).join(' '),
        sentences.slice(1 + third * 2).join(' '),
      ].filter(Boolean),
    }
  }

  const rest = sentences.slice(1)
  const candidates = rest.map((s, i) => ({ text: s, idx: i, priority: sentencePriority(s) }))
    .filter(c => c.priority < 999)
    .sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : a.idx - b.idx)

  let splitIndices
  if (candidates.length >= 2) {
    splitIndices = [candidates[0].idx, candidates[1].idx].sort((a, b) => a - b)
  } else if (candidates.length === 1) {
    const c = candidates[0].idx
    const mid = c < rest.length / 2
      ? Math.min(c + Math.ceil((rest.length - c) / 2), rest.length - 1)
      : Math.floor(c / 2)
    splitIndices = [Math.min(c, mid), Math.max(c, mid)]
  } else {
    const t = Math.ceil(rest.length / 3)
    splitIndices = [t, Math.min(t * 2, rest.length)]
  }

  if (splitIndices[0] < 1) splitIndices[0] = 1
  if (splitIndices[1] <= splitIndices[0]) splitIndices[1] = splitIndices[0] + 1
  if (splitIndices[1] >= rest.length) {
    splitIndices[1] = Math.max(splitIndices[0] + 1, rest.length - 1)
    if (splitIndices[0] >= splitIndices[1]) splitIndices[0] = Math.max(1, splitIndices[1] - 1)
  }

  return {
    intro: sentences[0],
    parts: [
      rest.slice(0, splitIndices[0]).join(' '),
      rest.slice(splitIndices[0], splitIndices[1]).join(' '),
      rest.slice(splitIndices[1]).join(' '),
    ],
  }
}

export function splitPassageForInsertion(englishText) {
  const sentences = splitSentencesRaw(englishText)
  if (sentences.length < 3) return null

  const candidates = sentences.map((s, i) => ({ text: s, idx: i, priority: sentencePriority(s) }))
    .filter(c => c.idx > 0 && c.priority < 999)
    .sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : a.idx - b.idx)

  if (candidates.length === 0) {
    const mid = Math.floor(sentences.length / 2)
    candidates.push({ text: sentences[mid], idx: mid, priority: 999 })
  }

  const extracted = candidates[0]
  const remaining = sentences.filter((_, i) => i !== extracted.idx)

  const totalGaps = remaining.length - 1
  const markerCount = 5
  const correctGap = Math.min(extracted.idx, remaining.length) - (extracted.idx > 0 ? 0 : 0)
  const actualCorrectGap = extracted.idx > 0 ? extracted.idx - 1 : 0

  let markerGaps
  if (totalGaps <= markerCount) {
    markerGaps = Array.from({ length: totalGaps }, (_, i) => i)
  } else {
    const step = totalGaps / (markerCount + 1)
    markerGaps = Array.from({ length: markerCount }, (_, i) => Math.round(step * (i + 1)) - 1)
    if (!markerGaps.includes(actualCorrectGap)) {
      let closest = 0
      let minDist = Math.abs(markerGaps[0] - actualCorrectGap)
      for (let i = 1; i < markerGaps.length; i++) {
        const dist = Math.abs(markerGaps[i] - actualCorrectGap)
        if (dist < minDist) { minDist = dist; closest = i }
      }
      markerGaps[closest] = actualCorrectGap
    }
    markerGaps.sort((a, b) => a - b)
  }

  const correctMarker = markerGaps.indexOf(actualCorrectGap) + 1

  return {
    boxSentence: extracted.text,
    remaining,
    markerGaps,
    correctMarker,
  }
}

export function parsePassageSource(source) {
  const m = source.match(/(\d{2})_H(\d)_(\d+)_(\d+)/)
  if (!m) {
    const numMatch = source.match(/(\d+)\s*$/)
    return {
      year: null,
      grade: null,
      month: null,
      passageNum: numMatch ? parseInt(numMatch[1], 10) : null,
      raw: source.trim(),
    }
  }
  return {
    year: 2000 + parseInt(m[1], 10),
    grade: parseInt(m[2], 10),
    month: parseInt(m[3], 10),
    passageNum: parseInt(m[4], 10),
    raw: source.trim(),
  }
}

export function parseInputText(inputText) {
  const textBlocks = []
  let currentBlock = ''
  for (let i = 0; i < inputText.length; i++) {
    const char = inputText[i]
    const nextChar = inputText[i + 1]
    if (char === '/' && nextChar === '/') {
      if (currentBlock.trim()) textBlocks.push(currentBlock)
      currentBlock = ''
      i++
    } else {
      currentBlock += char
    }
  }
  if (currentBlock.trim()) textBlocks.push(currentBlock)

  return textBlocks.map((block, idx) => {
    const parts = []
    let currentPart = ''
    let bracketDepth = 0
    for (let j = 0; j < block.length; j++) {
      const char = block[j]
      const prevChar = j > 0 ? block[j - 1] : ''
      const nextChar = j < block.length - 1 ? block[j + 1] : ''
      if (char === '<' || char === '[' || char === '{') bracketDepth++
      else if (char === '>' || char === ']' || char === '}') bracketDepth = Math.max(0, bracketDepth - 1)
      if (char === '/' && prevChar !== '/' && nextChar !== '/' && bracketDepth === 0) {
        parts.push(currentPart)
        currentPart = ''
      } else {
        currentPart += char
      }
    }
    if (currentPart.length > 0) parts.push(currentPart)

    const source = (parts[0] || '').trim()
    const english = (parts[1] || '').trim()
    const korean = (parts[2] || '').trim()
    const parsed = parsePassageSource(source)

    return {
      index: idx,
      source,
      english,
      korean,
      passageNum: parsed.passageNum || (idx + 1),
      examInfo: parsed,
    }
  }).filter(p => p.english)
}

export async function generateSummaryWithBlanks(englishText, apiKey) {
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an English teacher. Always respond with valid JSON only.' },
        {
          role: 'user',
          content: `Read the passage below and create a summary for a fill-in-the-blank exercise.

Rules:
1. Write a summary of 35-45 words that captures the main idea.
2. Use formal, academic language.
3. Select exactly 5 important content words in the summary that students should fill in.
4. The 5 words must be key vocabulary from the ORIGINAL passage (not new words).
5. Choose words that are meaningful (nouns, verbs, adjectives) — avoid articles, prepositions, pronouns.

Return ONLY valid JSON:
{
  "summary": "the full summary sentence with all words",
  "blankWords": ["word1", "word2", "word3", "word4", "word5"]
}

The blankWords must appear in the summary in order of appearance.

Passage:
${englishText}`
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `API 오류: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content
  if (!content) throw new Error('AI 응답이 비어있습니다.')

  const result = JSON.parse(content)
  if (!result.summary || !Array.isArray(result.blankWords) || result.blankWords.length === 0) {
    throw new Error('AI 응답에 summary 또는 blankWords가 없습니다.')
  }
  return result
}
