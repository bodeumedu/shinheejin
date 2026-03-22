// 영영 단어장 — 지문/단어 목록 → 표용 JSON (OpenAI)

const LEVEL_PROMPT = {
  hs1:
    'The source text is at Korean **high school grade 1** level. Write every definition in **English only**, using vocabulary and sentence complexity fit for **Korean grades 1–2** high school students: clear, concrete wording; avoid rare jargon inside definitions.',
  hs2:
    'The source text is at Korean **high school grade 2** level. Write every definition in **English only**, using vocabulary fit for **Korean grades 2–3** high school students: still clear, but may use slightly more natural connectors than for grade 1.',
}

/**
 * // 로 지문 블록 분리. 각 블록: 첫 줄 = 제목, 나머지 = 영어 지문.
 * 줄이 하나뿐이면 제목은 "지문 n", 본문은 그 줄.
 */
export function splitPassageBlocks(raw) {
  const blocks = String(raw)
    .split(/\s*\/\/\s*/)
    .map((b) => b.trim())
    .filter(Boolean)

  return blocks
    .map((block, i) => {
      const lines = block.split(/\r?\n/).map((l) => l.trimEnd())
      const nonEmpty = lines.filter((l) => l.length > 0)
      if (nonEmpty.length === 0) return null
      if (nonEmpty.length === 1) {
        return { title: `지문 ${i + 1}`, body: nonEmpty[0] }
      }
      return { title: nonEmpty[0], body: nonEmpty.slice(1).join('\n').trim() }
    })
    .filter(Boolean)
}

/**
 * 줄바꿈·쉼표 등으로 나열된 단어 분리 (순서 유지, 대소문자 무시 중복 제거)
 */
export function parseWordListInput(raw) {
  if (!raw || !String(raw).trim()) return []
  const parts = String(raw)
    .split(/[\n\r,，;；、\t]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const seen = new Set()
  const out = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

async function callOpenAIJson(system, user, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.35,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `API 오류: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content
  if (!content) {
    throw new Error('AI 응답이 비어있습니다.')
  }

  try {
    return JSON.parse(content)
  } catch {
    throw new Error('AI 응답을 해석할 수 없습니다. 다시 시도해 주세요.')
  }
}

/**
 * 여러 지문 → 각 지문마다 5~10 키워드, 영영 정의 (표 3열: 제목 | 단어 | 뜻)
 * @param {Array<{title:string, body:string}>} passages
 * @param {'hs1'|'hs2'} level
 */
export async function buildPassageVocabularyTables(passages, level, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }
  if (!passages?.length) {
    throw new Error('지문이 없습니다.')
  }
  for (const p of passages) {
    if (!p.body || !String(p.body).trim()) {
      throw new Error(`「${p.title}」본문이 비어 있습니다.`)
    }
  }

  const system = `You are an English vocabulary expert for Korean high school students. You MUST output valid JSON only, matching the schema in the user message. All definitions MUST be in English only (no Korean).`

  const user = `${LEVEL_PROMPT[level]}

Task: For EACH passage object below, choose **between 5 and 10** of the most important words or short fixed phrases for understanding that passage.

Strict rules:
1. **Coverage**: Exactly one JSON object per input passage; keep the same \`title\` string as given.
2. **Polysemy**: If a word has multiple meanings, give **only the meaning used in this passage** — not a full dictionary entry.
3. **Word form**: If the passage uses an inflected verb (e.g. pursuing, pursued) or other inflected form, put the **base lemma** (e.g. pursue) in the \`word\` field. Same idea for nouns/adjectives when a clear dictionary headword exists (use the headword students would look up).
4. **Definitions**: One clear English definition per word, similar style to learner dictionaries (e.g. "famine: a serious lack of food in a large area for a long time").
5. **Quantity**: Between 5 and 10 entries per passage (inclusive). Prefer academic / passage-critical items over trivial words.

Output JSON shape (and nothing else):
{
  "passages": [
    {
      "title": "string (must match input title exactly)",
      "entries": [
        { "word": "string", "definition": "string (English only, no 'word:' prefix inside definition)" }
      ]
    }
  ]
}

Input passages (JSON array):
${JSON.stringify(passages, null, 2)}`

  const parsed = await callOpenAIJson(system, user, apiKey)
  if (!parsed.passages || !Array.isArray(parsed.passages)) {
    throw new Error('AI 결과 형식이 올바르지 않습니다.')
  }

  // 입력 블록 수·제목 기준으로 항상 정렬 (AI가 블록 수를 놓쳐도 행 누락 최소화)
  const merged = passages.map((src, i) => {
    const p = parsed.passages[i] || {}
    const entries = Array.isArray(p.entries) ? p.entries : []
    return {
      title: src.title,
      entries,
    }
  })

  return { mode: 'passages', passages: merged }
}

/**
 * 단어 목록만 → 2열 표 (단어 | 영영 뜻), 출처 열 없음
 */
export async function buildWordListVocabularyTable(words, level, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }
  if (!words.length) {
    throw new Error('인식할 단어가 없습니다.')
  }

  const system = `You are an English vocabulary expert for Korean high school students. Output valid JSON only. Definitions in English only (no Korean).`

  const listText = words.map((w, i) => `${i + 1}. ${w}`).join('\n')

  const user = `${LEVEL_PROMPT[level]}

The student listed these headwords (keep order; use each as the \`word\` field — normalize to a sensible lemma if the item is clearly inflected, otherwise use as given):

${listText}

For EVERY item, output one definition: clear English, learner-dictionary style.

Output JSON shape:
{
  "entries": [
    { "word": "string", "definition": "string" }
  ]
}

There must be exactly ${words.length} entries in the same order as the list.`

  const parsed = await callOpenAIJson(system, user, apiKey)
  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    throw new Error('AI 결과 형식이 올바르지 않습니다.')
  }

  // 표 첫 열은 사용자가 입력한 표기(순서)를 유지하고, 뜻만 AI 결과를 순서대로 맞춤
  const entries = words.map((w, i) => ({
    word: w,
    definition: (parsed.entries[i] && parsed.entries[i].definition) || '',
  }))

  return { mode: 'words', entries }
}

/** 클립보드용 TSV (엑셀 붙여넣기) */
export function vocabularyTableToTsv(table) {
  if (!table) return ''
  const lines = []
  if (table.mode === 'passages' && table.passages) {
    lines.push('제목\t단어\t영영 뜻')
    for (const p of table.passages) {
      const title = p.title || ''
      const entries = p.entries || []
      entries.forEach((e, i) => {
        lines.push(`${i === 0 ? title : ''}\t${e.word ?? ''}\t${(e.definition ?? '').replace(/\t/g, ' ')}`)
      })
    }
  } else if (table.mode === 'words' && table.entries) {
    lines.push('단어\t영영 뜻')
    for (const e of table.entries) {
      lines.push(`${e.word ?? ''}\t${(e.definition ?? '').replace(/\t/g, ' ')}`)
    }
  }
  return lines.join('\n')
}
