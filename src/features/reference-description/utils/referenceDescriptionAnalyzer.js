/**
 * 지칭서술형(지칭 서술형) — 독해 시 꼭 체크할 가리키는 표현 분석
 */

/**
 * @param {string} englishText - 영어 원문
 * @param {string} apiKey - OpenAI API 키
 * @returns {Promise<{passageWithUnderlines: string, blocks: Array, answerSummary: string}>}
 */
export async function generateReferenceDescription(englishText, apiKey) {
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.')
  }

  const prompt = `You are an expert Korean English teacher. The student will READ the passage and learn to mark EVERY important referential expression (가리키는 표현) that they must NOT skip while reading.

INPUT: The English passage only (no Korean exam instructions).

YOUR OUTPUT FORMAT (strict):
1) First produce the FULL original passage again, but wrap EVERY referential expression that readers must check in HTML tags: <u>exact substring from the passage</u>.
   - Use the EXACT words from the passage inside <u>...</u> (same spelling, same spacing). Do not paraphrase.
   - Non-overlapping spans only. If needed, use a longer phrase (e.g. "its right hemisphere") so the referent is clear.
2) Then return a JSON object. The "blocks" array must have ONE object for EACH <u>...</u> in passageWithUnderlines, in LEFT-TO-RIGHT order of first appearance in the text.

WHAT TO UNDERLINE (be exhaustive — Korean high school reading / 수능-style referential reading):
- Pronouns: it, they, them, their, he, she, his, her, its, we, us, our, you, your, oneself, one (include cases where the referent is a whole preceding clause, situation, or implied idea — not only the nearest noun).
- Demonstratives: this, that, these, those (as determiners or pronouns); distinguish pointing to a noun phrase vs. summarizing a whole prior sentence or stretch of text.
- "such + noun / such a/an + noun": such problems, such behavior, such changes, such an idea — ties back to earlier specific content.
- "the + abstract noun" when anaphoric (points back): the experience, the process, the problem, the idea, the information, the change, the result, the fact, the issue, the situation, the approach, the decision, etc.
- Other high-frequency traps: do so / doing so / did so / does so; the former / the latter; which / who / whose clauses when the head is clearly picking up prior content; comparative "that" (so ... that ...) only when referential reading matters.
- Do NOT skip borderline cases: if a student could mis-link the referent on a test, underline and explain it.

DO NOT UNDERLINE (exclude from <u> — not "가리키는 표현" in the usual sense):
- Phrases that are **indefinite article + noun** introducing a **first mention** / new entity: **a** / **an** + noun (e.g. "a study", "an experiment", "a cup", "a difference"). Students should NOT treat these as pointing back to earlier text like "the" or "it".
- Do not wrap **a** or **an** by itself, and do not wrap **a/an + head noun** as a single underline target for ordinary indefinite NPs.
- EXCEPTIONS — still underline when clearly referential:
  - **such a / such an + noun** (and **such + noun**) as already required above.
  - Fixed quantifier / semi-fixed chunks only if the exam-style referent is clearly backward-pointing (rare for plain "a N" first mention).

STUDENT CHECK ROUTINE (embed these ideas in linesKo/linesEn when useful):
1) Locate the expression in the sentence.
2) Ask "what noun/idea in the previous sentence(s) does it hook to?"
3) If multiple candidates, say which one fits logic/grammar and which is the common wrong choice.
4) One-line Korean takeaway when helpful (e.g. "앞 문장 전체를 가리킴!!!").

For EACH block, write explanations for Korean high school teachers/students:
- "summaryKo": After "=" — short Korean label of what it refers to (e.g. "뇌의 구조", "music").
- "linesKo": array of 2–5 strings — each line is a full sentence or clause in Korean. These will be shown with "→" prefix. Cover: (a) what it points to in the text, (b) if it is a whole idea vs one noun, (c) links to earlier phrases like "have no special training" when relevant.
- "linesEn": array of 2–5 strings — same ideas in English, for lines after the Korean ones, each with "→" prefix.
- "doubleHeader": if true, the rendered output will show the <u>phrase</u> line twice before "=" (like a worksheet). If false, once.

Tone: clear, exam-prep style. You may end a line with "!!!" only when stressing a common exam mistake (sparingly).

Passage to analyze:
---
${englishText}
---

Return ONLY valid JSON with this exact shape:
{
  "passageWithUnderlines": "full passage with multiple <u>...</u> as described",
  "blocks": [
    {
      "underline": "exact inner text of one <u>...</u> span (must match one span exactly)",
      "summaryKo": "short Korean after =",
      "linesKo": ["한국어 설명1", "한국어 설명2"],
      "linesEn": ["English explanation 1", "English explanation 2"],
      "doubleHeader": true
    }
  ]
}

RULES:
- passageWithUnderlines must contain the same sentences as the input (only add <u> tags).
- blocks.length must equal the number of <u>...</u> spans in passageWithUnderlines.
- Order of blocks = order of <u> spans from start to end of the passage.
- Never use <u> for normal **a/an + noun** first-mention phrases (see DO NOT UNDERLINE).
- Do NOT include the old exam format (no "다음 글을 읽고 밑줄 친", no <조건>, no word limits, no single-answer-only mode).`

  const timeoutMs = 180000 // 긴 지문·다수 <u> 분석 대비 3분
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert English teacher for Korean students. Always return valid JSON only. Underline many referential expressions; explain each in Korean and English.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.55,
        response_format: { type: 'json_object' }
      })
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `AI 요청이 ${Math.round(timeoutMs / 60000)}분 안에 끝나지 않았습니다. 지문을 // 로 나누거나 짧게 해서 다시 시도해주세요.`
      )
    }
    throw new Error(`네트워크 오류: ${err.message || 'OpenAI에 연결하지 못했습니다.'}`)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`OpenAI API 오류: ${response.status} ${errorData.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('AI 응답이 비어있습니다.')
  }

  try {
    const result = JSON.parse(content)

    if (!result.passageWithUnderlines || !Array.isArray(result.blocks)) {
      throw new Error('AI 응답에 passageWithUnderlines 또는 blocks가 없습니다.')
    }

    const underlinePattern = /<u>([^<]+)<\/u>/gi
    const spans = []
    let m
    while ((m = underlinePattern.exec(result.passageWithUnderlines)) !== null) {
      spans.push(m[1].trim())
    }

    if (spans.length === 0) {
      throw new Error('밑줄(<u>)이 있는 지문이 없습니다.')
    }

    if (result.blocks.length !== spans.length) {
      console.warn(
        `블록 수 불일치: <u> 개수=${spans.length}, blocks=${result.blocks.length}. 그대로 반환합니다.`
      )
    }

    const answerSummary = result.blocks
      .map((b) => {
        const u = (b.underline || '').trim()
        const s = (b.summaryKo || '').trim()
        return u && s ? `${u} → ${s}` : s || u
      })
      .filter(Boolean)
      .join('\n')

    return {
      passageWithUnderlines: result.passageWithUnderlines.trim(),
      blocks: result.blocks,
      answerSummary
    }
  } catch (parseError) {
    console.error('JSON 파싱 오류:', parseError)
    console.error('응답 내용:', content)
    throw new Error(`AI 응답을 파싱할 수 없습니다: ${parseError.message}`)
  }
}

/**
 * 지칭 분석 결과를 복사/편집용 텍스트로 직렬화
 */
export function formatReferenceDescriptionAsText({ passageWithUnderlines, blocks }) {
  if (!passageWithUnderlines) return ''

  let out = passageWithUnderlines.trim() + '\n\n'

  const list = Array.isArray(blocks) ? blocks : []

  for (const b of list) {
    const phrase = (b.underline || '').trim()
    if (!phrase) continue

    const uLine = `<u>${phrase}</u>`
    const times = b.doubleHeader === false ? 1 : 2
    for (let i = 0; i < times; i++) {
      out += uLine + '\n'
    }

    const eq = (b.summaryKo || '').trim()
    if (eq) out += `= ${eq}\n`

    const ko = Array.isArray(b.linesKo) ? b.linesKo : []
    for (const line of ko) {
      const t = String(line).trim()
      if (t) out += `→ ${t}\n`
    }

    const en = Array.isArray(b.linesEn) ? b.linesEn : []
    for (const line of en) {
      const t = String(line).trim()
      if (t) out += `→ ${t}\n`
    }

    out += '\n'
  }

  return out.trimEnd() + '\n\n━━━━━━━━━━━━━━━━━━━━\n\n'
}
