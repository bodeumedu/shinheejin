/** 시험지·통계용으로 표 데이터를 평탄화 (번호, 지문 제목, 영영 뜻, 정답 단어) */
export function flattenVocabularyForTest(vocabularyTable) {
  if (!vocabularyTable) return []

  if (vocabularyTable.mode === 'words') {
    return (vocabularyTable.entries || []).map((e, i) => ({
      num: i + 1,
      passageTitle: null,
      definition: (e.definition || '').trim(),
      answer: (e.word || '').trim(),
    }))
  }

  let num = 0
  const out = []
  for (const p of vocabularyTable.passages || []) {
    const title = (p.title || '').trim() || '—'
    for (const e of p.entries || []) {
      num++
      out.push({
        num,
        passageTitle: title,
        definition: (e.definition || '').trim(),
        answer: (e.word || '').trim(),
      })
    }
  }
  return out
}

/** 시험 문항으로 쓸 수 있는 줄 (영영 뜻이 있어야 함) */
export function countTestItems(vocabularyTable) {
  return flattenVocabularyForTest(vocabularyTable).filter((r) => r.definition).length
}
