let jsPDF
let html2canvas

async function loadPdfLibraries() {
  if (!jsPDF) jsPDF = (await import('jspdf')).default
  if (!html2canvas) html2canvas = (await import('html2canvas')).default
}

const PAGE_W_MM = 210
const PAGE_H_MM = 297
const FONT_STACK = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'

function escapeHtml(t) {
  if (t == null) return ''
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildBaseCss() {
  return `
.mg-root {
  position: absolute; left: -9999px; top: 0;
  font-family: ${FONT_STACK};
  color: #111;
  -webkit-font-smoothing: antialiased;
}
.mg-page {
  width: ${PAGE_W_MM}mm;
  min-height: ${PAGE_H_MM}mm;
  box-sizing: border-box;
  background: #fff;
  overflow: hidden;
}

/* ===== COVER ===== */
.mg-cover {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: ${PAGE_H_MM}mm; text-align: center; padding: 20mm;
}
.mg-cover-year { font-size: 22pt; font-weight: 700; color: #1a237e; letter-spacing: 6px; margin-bottom: 6mm; }
.mg-cover-title { font-size: 42pt; font-weight: 900; color: #0d47a1; letter-spacing: 4px; margin-bottom: 8mm; }
.mg-cover-sub { font-size: 14pt; font-weight: 600; color: #333; line-height: 1.6; }
.mg-cover-brand { font-size: 10pt; color: #999; margin-top: 20mm; }

/* ===== BLANK ===== */
.mg-blank { height: ${PAGE_H_MM}mm; background: #fff; }

/* ===== SECTION PAGES ===== */
.mg-section-page {
  padding: 10mm 10mm 8mm 10mm;
  display: flex; flex-direction: column;
}
.mg-header { margin-bottom: 3mm; }
.mg-header-top {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 8.5pt; color: #555; margin-bottom: 1.5mm;
  border-bottom: 1px solid #ccc; padding-bottom: 1mm;
}
.mg-header-tabs {
  display: flex; gap: 3mm; font-size: 7.5pt; color: #aaa; margin-bottom: 2mm;
}
.mg-header-tabs span { padding: 0.8mm 2mm; border-radius: 2px; }
.mg-tab-active { background: #1a237e; color: #fff !important; font-weight: 700; }
.mg-section-title {
  font-size: 18pt; font-weight: 800; color: #1a237e; margin-bottom: 3mm;
  letter-spacing: 2px;
}

/* ===== TWO-COLUMN VOCAB ===== */
.mg-vocab-body { display: flex; gap: 4mm; flex: 1; }
.mg-vocab-col { flex: 1; }
.mg-passage-group { margin-bottom: 2mm; }
.mg-passage-num {
  font-size: 9pt; font-weight: 800; color: #1a237e;
  padding: 0.5mm 0; border-bottom: 1.5px solid #1a237e; margin-bottom: 0.5mm;
}
.mg-word-row {
  display: flex; font-size: 8.5pt; line-height: 1.55;
  padding: 0.3mm 0; border-bottom: 0.5px dotted #ddd;
}
.mg-word-en { flex: 1; color: #222; padding-left: 2mm; }
.mg-word-kr { flex: 1; color: #444; }
.mg-word-blank { flex: 1; color: transparent; border-bottom: 0.5px solid #bbb; min-height: 1em; }

/* ===== TEXT SECTION ===== */
.mg-text-body { flex: 1; padding: 0 2mm; }
.mg-text-source {
  font-size: 12pt; font-weight: 800; color: #1a237e;
  margin-bottom: 4mm; padding-bottom: 1.5mm;
  border-bottom: 2px solid #1a237e;
}
.mg-sentence-pair { margin-bottom: 5mm; }
.mg-sentence-num {
  display: inline-block; width: 5mm; font-size: 8pt; font-weight: 700;
  color: #1a237e; vertical-align: top; flex-shrink: 0; text-align: center;
}
.mg-sentence-en {
  font-size: 9.5pt; font-weight: 600; color: #222; line-height: 1.6;
  margin-left: 6mm;
}
.mg-sentence-kr {
  font-size: 8.5pt; color: #666; line-height: 1.5;
  margin-left: 6mm; margin-top: 0.5mm;
}

/* ===== BRACKET [ / ] SECTION ===== */
.mg-bracket-body { display: flex; gap: 6mm; flex: 1; }
.mg-bracket-col { flex: 1; }
.mg-bracket-passage { }
.mg-bracket-passage-num {
  font-size: 10pt; font-weight: 800; color: #1a237e;
  padding: 1mm 0; border-bottom: 2px solid #1a237e; margin-bottom: 3mm;
}
.mg-bracket-en-text {
  font-size: 9pt; line-height: 1.75; color: #222;
  text-align: justify; margin-bottom: 4mm;
}
.mg-bracket-inline {
  font-weight: 700; color: #0d47a1;
}
.mg-bracket-sup {
  font-size: 6.5pt; font-weight: 700; color: #c62828;
  vertical-align: super; margin-left: 0.3mm;
}
.mg-bracket-kr-text {
  font-size: 8pt; line-height: 1.6; color: #555;
  text-align: justify;
}

/* ===== FILL-IN-BLANK ===== */
.mg-fill-body-2col { display: flex; gap: 5mm; flex: 1; }
.mg-fill-col { flex: 1; }
.mg-fill-col-inner { }
.mg-fill-source {
  font-size: 10pt; font-weight: 800; color: #1a237e;
  margin-bottom: 3mm; padding-bottom: 1mm;
  border-bottom: 2px solid #1a237e;
}
.mg-fill-text {
  font-size: 8pt; line-height: 1.85; color: #222;
  text-align: justify;
}
.mg-fill-blank {
  display: inline;
  font-weight: 700; color: #222;
  letter-spacing: -0.5px;
}
.mg-fill-sup {
  font-size: 6.5pt; font-weight: 700; color: #c62828;
  vertical-align: super; margin-left: 0.3mm;
}
.mg-fill-kr {
  font-size: 7pt; line-height: 1.5; color: #555;
  text-align: justify; margin-top: 3mm;
  padding-top: 2mm; border-top: 1px solid #ddd;
}

/* ===== ORDERING ===== */
.mg-order-body-2col { display: flex; gap: 5mm; flex: 1; }
.mg-order-col { flex: 1; }
.mg-order-num {
  font-size: 14pt; font-weight: 800; color: #1a237e;
  margin-bottom: 2mm;
}
.mg-order-intro-box {
  border: 1.5px solid #333; padding: 3mm;
  font-size: 8pt; line-height: 1.6; color: #222;
  text-align: justify; margin-bottom: 3mm;
}
.mg-order-part {
  margin-bottom: 2.5mm;
  font-size: 8pt; line-height: 1.6; color: #222;
  text-align: justify; text-indent: -4mm; padding-left: 4mm;
}
.mg-order-part-label {
  font-weight: 800; color: #1a237e; margin-right: 1mm;
}
.mg-order-choices {
  margin-top: 3mm; font-size: 8pt; line-height: 1.8; color: #333;
}
.mg-order-choice { margin-bottom: 0.5mm; }

/* ===== INSERTION ===== */
.mg-insert-body-2col { display: flex; gap: 5mm; flex: 1; }
.mg-insert-col { flex: 1; }
.mg-insert-q {
  font-size: 9pt; font-weight: 700; color: #333;
  margin-bottom: 2mm; line-height: 1.4;
}
.mg-insert-q-src { font-size: 7.5pt; color: #888; font-weight: 400; }
.mg-insert-box {
  border: 1.5px solid #333; padding: 2.5mm;
  font-size: 8pt; line-height: 1.6; color: #222;
  text-align: justify; margin-bottom: 3mm;
}
.mg-insert-text {
  font-size: 8pt; line-height: 1.7; color: #222;
  text-align: justify;
}
.mg-insert-marker {
  font-weight: 700; color: #1a237e; margin: 0 0.5mm;
}

/* ===== GRAMMAR QUIZ (4-per-page) ===== */
.mg-gq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; flex: 1; }
.mg-gq-cell { border: 0.5px solid #ddd; padding: 3mm; border-radius: 2px; }
.mg-gq-q {
  font-size: 8pt; font-weight: 700; color: #333;
  margin-bottom: 1.5mm; line-height: 1.3;
}
.mg-gq-q-src { font-size: 7pt; color: #888; font-weight: 400; }
.mg-gq-text {
  font-size: 7.5pt; line-height: 1.65; color: #222;
  text-align: justify; margin-bottom: 2mm;
}
.mg-gq-underline {
  text-decoration: underline; text-decoration-thickness: 1px;
  text-underline-offset: 1.5px;
}
.mg-gq-label {
  font-size: 6pt; font-weight: 700; color: #0d47a1;
  vertical-align: super; margin-left: 0.2mm;
}
.mg-gq-choices {
  font-size: 7.5pt; line-height: 1.6; color: #333;
}
.mg-gq-choice { margin-bottom: 0.3mm; }

/* ===== CORRECTION QUIZ (2-col) ===== */
.mg-cq-body-2col { display: flex; gap: 5mm; flex: 1; }
.mg-cq-col { flex: 1; }
.mg-cq-q {
  font-size: 8pt; font-weight: 700; color: #333;
  margin-bottom: 1.5mm; line-height: 1.3;
}
.mg-cq-q-src { font-size: 7pt; color: #888; font-weight: 400; }
.mg-cq-text {
  font-size: 7.5pt; line-height: 1.7; color: #222;
  text-align: justify; margin-bottom: 3mm;
}
.mg-cq-table { width: 100%; border-collapse: collapse; font-size: 7pt; }
.mg-cq-table th {
  background: #f5f5f5; font-weight: 700; color: #333;
  padding: 1mm 1.5mm; border: 0.5px solid #ccc; text-align: center;
}
.mg-cq-table td {
  padding: 1.2mm 1.5mm; border: 0.5px solid #ccc; text-align: center;
  height: 4.5mm;
}
.mg-cq-arrow { color: #999; font-size: 8pt; }

/* ===== QUIZ3 (topic / thirdWord / contentMatch) 2-col ===== */
.mg-q3-body-2col { display: flex; gap: 5mm; flex: 1; }
.mg-q3-col { flex: 1; }
.mg-q3-src {
  font-size: 10pt; font-weight: 800; color: #1a237e;
  margin-bottom: 2mm; padding-bottom: 1mm;
  border-bottom: 2px solid #1a237e;
}
.mg-q3-q {
  font-size: 8.5pt; font-weight: 700; color: #333;
  margin-bottom: 2mm; line-height: 1.3;
}
.mg-q3-text {
  font-size: 8pt; line-height: 1.7; color: #222;
  text-align: justify; margin-bottom: 3mm;
}
.mg-q3-choices {
  font-size: 8pt; line-height: 1.7; color: #333;
}
.mg-q3-choice { margin-bottom: 0.8mm; }

/* ===== QUIZ5 (topic sentence 주제문 배열) 2-col ===== */
.mg-q5-src {
  font-size: 10pt; font-weight: 800; color: #1a237e;
  margin-bottom: 2mm; padding-bottom: 1mm;
  border-bottom: 2px solid #1a237e;
}
.mg-q5-q {
  font-size: 8.5pt; font-weight: 700; color: #333;
  margin-bottom: 2mm; line-height: 1.3;
}
.mg-q5-text {
  font-size: 8pt; line-height: 1.7; color: #222;
  text-align: justify; margin-bottom: 3mm;
}
.mg-q5-prompt {
  font-size: 8.5pt; font-weight: 600; color: #222;
  margin-bottom: 3mm; line-height: 1.4;
}
.mg-q5-bank-box {
  border: 1.5px solid #333; padding: 2mm 3mm;
  margin-bottom: 2mm; border-radius: 2px;
}
.mg-q5-bank-label {
  font-size: 7.5pt; font-weight: 700; color: #555;
  margin-bottom: 1mm;
}
.mg-q5-bank-items {
  font-size: 8pt; line-height: 1.6; color: #222;
}
.mg-q5-cond-box {
  border: 1px solid #999; padding: 2mm 3mm;
  border-radius: 2px; background: #f9f9f9;
}
.mg-q5-cond-label {
  font-size: 7.5pt; font-weight: 700; color: #555;
  margin-bottom: 1mm;
}
.mg-q5-cond-text {
  font-size: 7.5pt; color: #444; line-height: 1.4;
}

/* ===== QUIZ5-2 (요약문 단어 채우기) 2-col ===== */
.mg-sf-src {
  font-size: 10pt; font-weight: 800; color: #1a237e;
  margin-bottom: 2mm; padding-bottom: 1mm;
  border-bottom: 2px solid #1a237e;
}
.mg-sf-q {
  font-size: 8.5pt; font-weight: 700; color: #333;
  margin-bottom: 2mm; line-height: 1.3;
}
.mg-sf-text {
  font-size: 8pt; line-height: 1.7; color: #222;
  text-align: justify; margin-bottom: 3mm;
}
.mg-sf-summary-box {
  border: 1.5px solid #333; padding: 2.5mm 3mm;
  border-radius: 2px; margin-top: 2mm;
  font-size: 8pt; line-height: 1.85; color: #222;
}
.mg-sf-summary-box sup {
  font-size: 6pt; font-weight: 700; color: #1a237e;
  vertical-align: super;
}

/* ===== QUIZ4 (복합 서술형) ===== */
.mg-q4-passage-header {
  font-size: 10pt; font-weight: 800; color: #1a237e;
  margin-bottom: 3mm; padding-bottom: 1mm;
  border-bottom: 2px solid #1a237e;
}
.mg-q4-src { font-size: 8pt; color: #888; font-weight: 400; }
.mg-q4-passage-text {
  font-size: 8.5pt; line-height: 1.85; color: #222;
  text-align: justify; margin-bottom: 4mm;
  border: 0.5px solid #ddd; padding: 3mm; border-radius: 2px;
}
.mg-q4-sup {
  font-size: 6pt; font-weight: 700; color: #c62828;
  vertical-align: super; margin: 0 0.3mm;
}
.mg-q4-hint {
  font-size: 6.5pt; color: #0d47a1; font-weight: 600;
}
.mg-q4-bracket-label {
  font-size: 9pt; font-weight: 800; color: #1a237e;
  margin-right: 1mm;
}
.mg-q4-ga-label {
  font-size: 9pt; font-weight: 800; color: #1a237e;
}
.mg-q4-question { margin-bottom: 3mm; }
.mg-q4-q-title {
  font-size: 8.5pt; font-weight: 700; color: #333;
  margin-bottom: 1.5mm; line-height: 1.4;
}
.mg-q4-ga-korean {
  font-size: 8pt; color: #333; margin-bottom: 2mm;
  font-weight: 600; line-height: 1.5;
}
.mg-q4-word-bank {
  font-size: 8pt; line-height: 1.6; color: #222;
  border: 1.5px solid #333; padding: 2.5mm;
}

/* ===== ANSWER KEY ===== */
.mg-answer-body { flex: 1; }
.mg-answer-section { margin-bottom: 5mm; }
.mg-answer-passage-num {
  font-size: 9pt; font-weight: 800; color: #1a237e;
  border-bottom: 1.5px solid #1a237e; padding-bottom: 0.5mm; margin-bottom: 2mm;
}
.mg-answer-grid {
  display: flex; flex-wrap: wrap; gap: 1.5mm 4mm;
}
.mg-answer-item {
  font-size: 8.5pt; color: #333; min-width: 30mm;
}
.mg-answer-item strong { color: #1a237e; }

.mg-footer {
  text-align: center; font-size: 7pt; color: #aaa; padding-top: 2mm;
  border-top: 0.5px solid #ddd; margin-top: auto;
}
`
}

function buildHeaderHtml(examInfo, activeTab, pageNum) {
  const title = examInfo.title || `${examInfo.year || '2026'}  고${examInfo.grade || 1}  ${examInfo.month || 3}월  내신용 변형문제집`
  const tabs = [
    { id: 'voca', label: '➊ voca' },
    { id: 'text', label: '➋ text' },
    { id: 'bracket', label: '➌ [ / ]' },
    { id: 'blank', label: '➍ _____' },
    { id: 'q1', label: '➎ quiz 1' },
    { id: 'q2', label: '➏ quiz 2' },
    { id: 'q3', label: '➐ quiz 3' },
    { id: 'q4', label: '➑ quiz 4' },
    { id: 'q5', label: '➒ quiz 5' },
  ]
  const tabsHtml = tabs.map(t =>
    `<span class="${t.id === activeTab ? 'mg-tab-active' : ''}">${escapeHtml(t.label)}</span>`
  ).join('')

  return `<div class="mg-header">
    <div class="mg-header-top">
      <span>${escapeHtml(title)}</span>
      <span>${pageNum}</span>
    </div>
    <div class="mg-header-tabs">${tabsHtml}</div>
  </div>`
}

function buildCoverDom(examInfo) {
  const page = document.createElement('div')
  page.className = 'mg-page mg-cover'
  const title = examInfo.title || `${examInfo.year || 2026} 고${examInfo.grade || 1} ${examInfo.month || 3}월 내신용 변형문제집`
  page.innerHTML = `
    <div class="mg-cover-year">${escapeHtml(title)}</div>
    <div class="mg-cover-title">WORK BOOK</div>
    <div class="mg-cover-sub">
      ${escapeHtml(title)} WorkBook &amp; 변형문제
    </div>
    <div class="mg-cover-brand">마이갓</div>
  `
  return page
}

function buildBlankDom() {
  const page = document.createElement('div')
  page.className = 'mg-page mg-blank'
  return page
}

function distributePassagesIntoPages(vocabData, maxRowsPerCol) {
  const pages = []
  let currentLeft = []
  let currentRight = []
  let leftRows = 0
  let rightRows = 0

  for (const passage of vocabData) {
    const rowsNeeded = passage.words.length + 1
    if (leftRows + rowsNeeded <= maxRowsPerCol) {
      currentLeft.push(passage)
      leftRows += rowsNeeded
    } else if (rightRows + rowsNeeded <= maxRowsPerCol) {
      currentRight.push(passage)
      rightRows += rowsNeeded
    } else {
      if (currentLeft.length || currentRight.length) {
        pages.push({ left: currentLeft, right: currentRight })
      }
      currentLeft = [passage]
      currentRight = []
      leftRows = rowsNeeded
      rightRows = 0
    }
  }
  if (currentLeft.length || currentRight.length) {
    pages.push({ left: currentLeft, right: currentRight })
  }
  return pages
}

function buildPassageGroupHtml(passage, mode) {
  let rows = ''
  for (const w of passage.words) {
    let enCell, krCell
    if (mode === 'full') {
      enCell = `<span class="mg-word-en">${escapeHtml(w.english)}</span>`
      krCell = `<span class="mg-word-kr">${escapeHtml(w.korean)}</span>`
    } else if (mode === 'en-only') {
      enCell = `<span class="mg-word-en">${escapeHtml(w.english)}</span>`
      krCell = `<span class="mg-word-blank"></span>`
    } else {
      enCell = `<span class="mg-word-blank"></span>`
      krCell = `<span class="mg-word-kr">${escapeHtml(w.korean)}</span>`
    }
    rows += `<div class="mg-word-row">${enCell}${krCell}</div>`
  }
  return `<div class="mg-passage-group">
    <div class="mg-passage-num">${escapeHtml(String(passage.passageNum))}</div>
    ${rows}
  </div>`
}

function buildColumnHtml(passages, mode) {
  return passages.map(p => buildPassageGroupHtml(p, mode)).join('')
}

function buildVocaSectionPages(vocabData, examInfo, mode, sectionTitle, activeTab, startPageNum) {
  const maxRowsPerCol = 28
  const pageLayouts = distributePassagesIntoPages(vocabData, maxRowsPerCol)
  const domPages = []

  for (let i = 0; i < pageLayouts.length; i++) {
    const { left, right } = pageLayouts[i]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, activeTab, startPageNum + i)}
      <div class="mg-section-title">${escapeHtml(sectionTitle)}</div>
      <div class="mg-vocab-body">
        <div class="mg-vocab-col">${buildColumnHtml(left, mode)}</div>
        <div class="mg-vocab-col">${buildColumnHtml(right, mode)}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }

  return domPages
}

const CIRCLED_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳']

function splitIntoSentences(text) {
  if (!text || !text.trim()) return []
  const raw = text.trim().replace(/\s+/g, ' ')
  const sentences = []
  let buf = ''
  for (let i = 0; i < raw.length; i++) {
    buf += raw[i]
    const ch = raw[i]
    const next = raw[i + 1]
    if ((ch === '.' || ch === '?' || ch === '!') && (!next || next === ' ' || next === '"' || next === '\'' || next === ')')) {
      if (ch === '.' && i >= 2) {
        const prev2 = raw.substring(Math.max(0, i - 3), i)
        if (/\b(Mr|Dr|Ms|Mrs|Jr|Sr|St|vs|etc|e\.g|i\.e)$/i.test(prev2)) continue
        if (/\d$/.test(raw[i - 1]) && next && /\d/.test(next)) continue
      }
      sentences.push(buf.trim())
      buf = ''
      if (next === ' ') i++
    }
  }
  if (buf.trim()) sentences.push(buf.trim())
  return sentences
}

function buildTextPageDom(passage, examInfo, pageNum) {
  const enSentences = splitIntoSentences(passage.english)
  const krSentences = splitIntoSentences(passage.korean)

  let pairsHtml = ''
  const count = Math.max(enSentences.length, krSentences.length)
  for (let i = 0; i < count; i++) {
    const num = CIRCLED_NUMS[i] || `(${i + 1})`
    const en = enSentences[i] || ''
    const kr = krSentences[i] || ''
    pairsHtml += `<div class="mg-sentence-pair">
      <div class="mg-sentence-en"><span class="mg-sentence-num">${num}</span> ${escapeHtml(en)}</div>
      <div class="mg-sentence-kr">${escapeHtml(kr)}</div>
    </div>`
  }

  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'text', pageNum)}
    <div class="mg-text-source">${escapeHtml(passage.source)}</div>
    <div class="mg-text-body">${pairsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function extractPeonaPairs(peonaRaw) {
  const regex = /\[([^/\]]+)\s*\/\s*([^\]]+)\]/g
  const pairs = []
  let m
  while ((m = regex.exec(peonaRaw)) !== null) {
    pairs.push({ correct: m[1].trim(), wrong: m[2].trim() })
  }
  return pairs
}

function flexEscape(text) {
  return text
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/['\u2018\u2019\u201A]/g, "['\u2018\u2019\u201A]")
    .replace(/["\u201C\u201D]/g, "[\"\\u201C\\u201D]")
    .replace(/[-\u2010\u2013\u2014\u2212]/g, "[-\u2010-\u2015\u2212]")
}

function applyBracketsToOriginal(originalEnglish, peonaPairs, maxChoices = 10) {
  if (!peonaPairs.length) return { html: escapeHtml(originalEnglish), answerKey: [] }

  const candidates = []
  for (const pair of peonaPairs) {
    const escaped = flexEscape(pair.correct)

    let found = false
    for (const pattern of [`\\b${escaped}\\b`, escaped]) {
      const re = new RegExp(pattern, 'gi')
      let hit
      while ((hit = re.exec(originalEnglish)) !== null) {
        candidates.push({
          correct: hit[0],
          wrong: pair.wrong,
          index: hit.index,
          len: hit[0].length,
        })
        found = true
      }
      if (found) break
    }
  }

  candidates.sort((a, b) => a.index - b.index)

  const noOverlap = []
  let lastEnd = 0
  const usedKey = new Set()
  for (const c of candidates) {
    const key = c.correct.toLowerCase()
    if (c.index >= lastEnd && !usedKey.has(key)) {
      noOverlap.push(c)
      lastEnd = c.index + c.len
      usedKey.add(key)
    }
  }

  const selected = noOverlap.length <= maxChoices
    ? noOverlap
    : [...noOverlap].sort(() => Math.random() - 0.5).slice(0, maxChoices).sort((a, b) => a.index - b.index)

  let html = ''
  let pos = 0
  let num = 0
  const answerKey = []

  for (const s of selected) {
    html += escapeHtml(originalEnglish.substring(pos, s.index))
    num++
    const swapped = Math.random() < 0.5
    const left = swapped ? s.wrong : s.correct
    const right = swapped ? s.correct : s.wrong
    html += `<span class="mg-bracket-inline">[ ${escapeHtml(left)} / ${escapeHtml(right)} ]</span><span class="mg-bracket-sup">${num})</span>`
    answerKey.push({ num, answer: s.correct })
    pos = s.index + s.len
  }
  html += escapeHtml(originalEnglish.substring(pos))

  return { html, answerKey }
}

function applyBlanksToOriginal(originalEnglish, keyWords) {
  if (!keyWords.length) return { html: escapeHtml(originalEnglish), answerKey: [] }

  const candidates = []
  for (const word of keyWords) {
    const escaped = flexEscape(word)
    let found = false
    for (const pattern of [`\\b${escaped}\\b`, escaped]) {
      const re = new RegExp(pattern, 'g')
      let hit
      while ((hit = re.exec(originalEnglish)) !== null) {
        if (/^[A-Z]/.test(hit[0])) continue
        candidates.push({ word: hit[0], index: hit.index, len: hit[0].length })
        found = true
      }
      if (found) break
    }
  }

  candidates.sort((a, b) => a.index - b.index)

  const noOverlap = []
  let lastEnd = 0
  const usedKey = new Set()
  for (const c of candidates) {
    const key = c.word.toLowerCase()
    if (c.index >= lastEnd && !usedKey.has(key)) {
      noOverlap.push(c)
      lastEnd = c.index + c.len
      usedKey.add(key)
    }
  }

  const selected = noOverlap.slice(0, 20)

  let html = ''
  let pos = 0
  let num = 0
  const answerKey = []

  for (const s of selected) {
    html += escapeHtml(originalEnglish.substring(pos, s.index))
    num++
    const firstLetter = s.word[0]
    html += `<span class="mg-fill-blank">${escapeHtml(firstLetter)}______________</span><span class="mg-fill-sup">${num})</span>`
    answerKey.push({ num, answer: s.word })
    pos = s.index + s.len
  }
  html += escapeHtml(originalEnglish.substring(pos))

  return { html, answerKey }
}

function buildFillColHtml(passage, fillData) {
  return `<div class="mg-fill-col-inner">
    <div class="mg-fill-source">${escapeHtml(passage.source)}</div>
    <div class="mg-fill-text">${fillData.html}</div>
    <div class="mg-fill-kr">${escapeHtml(passage.korean)}</div>
  </div>`
}

function buildFillBlankPages(passages, fillBlankData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < fillBlankData.length; i += 2) {
    const fd1 = fillBlankData[i]
    const fd2 = fillBlankData[i + 1]
    const p1 = passages.find(p => p.passageNum === fd1.passageNum) || passages[i]
    const p2 = fd2 ? (passages.find(p => p.passageNum === fd2.passageNum) || passages[i + 1]) : null

    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'blank', startPageNum + Math.floor(i / 2))}
      <div class="mg-section-title">빈칸 채우기</div>
      <div class="mg-fill-body-2col">
        <div class="mg-fill-col">${buildFillColHtml(p1, fd1)}</div>
        <div class="mg-fill-col">${p2 ? buildFillColHtml(p2, fd2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildFillAnswerPages(fillBlankData, examInfo, pageNum) {
  let sectionsHtml = ''
  for (const fd of fillBlankData) {
    let items = ''
    for (const a of fd.answerKey) {
      items += `<div class="mg-answer-item">${a.num}. <strong>${escapeHtml(a.answer)}</strong></div>`
    }
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${escapeHtml(String(fd.passageNum))}</div>
      <div class="mg-answer-grid">${items}</div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'blank', pageNum)}
    <div class="mg-section-title">빈칸 채우기 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function generateOrderingData(intro, parts) {
  const labels = ['(A)', '(B)', '(C)']
  const indices = [0, 1, 2]
  const shuffled = [...indices].sort(() => Math.random() - 0.5)
  const displayParts = shuffled.map((origIdx, i) => ({
    label: labels[i],
    text: parts[origIdx],
    origIdx,
  }))

  const correctLabels = indices.map(origIdx => {
    const dp = displayParts.find(d => d.origIdx === origIdx)
    return dp.label
  })
  const correctAnswer = correctLabels.join(' - ')

  const allPerms = []
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++)
      for (let c = 0; c < 3; c++)
        if (a !== b && b !== c && a !== c) allPerms.push([a, b, c])

  const choices = []
  const correctStr = correctLabels.map(l => labels.indexOf(l)).join(',')
  choices.push({ text: correctAnswer, isCorrect: true })

  const wrongPerms = allPerms.filter(p => p.join(',') !== correctStr)
  const shuffledWrong = wrongPerms.sort(() => Math.random() - 0.5).slice(0, 4)
  for (const p of shuffledWrong) {
    choices.push({ text: p.map(i => labels[i]).join(' - '), isCorrect: false })
  }
  choices.sort(() => Math.random() - 0.5)

  const correctIdx = choices.findIndex(c => c.isCorrect)

  return { displayParts, choices, correctIdx }
}

function buildOrderColHtml(passageNum, intro, orderData, questionNum) {
  const partsHtml = orderData.displayParts.map(d =>
    `<div class="mg-order-part"><span class="mg-order-part-label">${d.label}</span> ${escapeHtml(d.text)}</div>`
  ).join('')

  const nums = ['①', '②', '③', '④', '⑤']
  const choicesHtml = orderData.choices.map((c, i) =>
    `<div class="mg-order-choice">${nums[i]} ${escapeHtml(c.text)}</div>`
  ).join('')

  return `<div>
    <div class="mg-order-num">${questionNum}. 주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.</div>
    <div class="mg-order-intro-box">${escapeHtml(intro)}</div>
    ${partsHtml}
    ${choicesHtml}
  </div>`
}

function buildOrderingPages(orderingData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < orderingData.length; i += 2) {
    const left = orderingData[i]
    const right = orderingData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q1', startPageNum + Math.floor(i / 2))}
      <div class="mg-section-title">순서 배열</div>
      <div class="mg-order-body-2col">
        <div class="mg-order-col">${buildOrderColHtml(left.passageNum, left.intro, left.orderData, i + 1)}</div>
        <div class="mg-order-col">${right ? buildOrderColHtml(right.passageNum, right.intro, right.orderData, i + 2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildOrderAnswerPages(orderingData, examInfo, pageNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  let sectionsHtml = ''
  for (let i = 0; i < orderingData.length; i++) {
    const od = orderingData[i]
    const answerNum = nums[od.orderData.correctIdx] || '?'
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}번 (지문 ${escapeHtml(String(od.passageNum))})</div>
      <div class="mg-answer-grid"><div class="mg-answer-item">정답: <strong>${answerNum} ${escapeHtml(od.orderData.choices[od.orderData.correctIdx].text)}</strong></div></div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q1', pageNum)}
    <div class="mg-section-title">순서 배열 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function buildInsertColHtml(ins, questionNum) {
  const markers = ['①', '②', '③', '④', '⑤']
  let textHtml = ''
  const markerSet = new Set(ins.markerGaps)

  for (let i = 0; i < ins.remaining.length; i++) {
    textHtml += escapeHtml(ins.remaining[i])
    if (i < ins.remaining.length - 1 && markerSet.has(i)) {
      const mIdx = ins.markerGaps.indexOf(i)
      textHtml += ` <span class="mg-insert-marker">( ${markers[mIdx]} )</span> `
    } else if (i < ins.remaining.length - 1) {
      textHtml += ' '
    }
  }

  return `<div>
    <div class="mg-insert-q">${questionNum}. 글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은? <span class="mg-insert-q-src">${escapeHtml(String(ins.passageNum))}</span></div>
    <div class="mg-insert-box">${escapeHtml(ins.boxSentence)}</div>
    <div class="mg-insert-text">${textHtml}</div>
  </div>`
}

function buildInsertionPages(insertionData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < insertionData.length; i += 2) {
    const left = insertionData[i]
    const right = insertionData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q2', startPageNum + Math.floor(i / 2))}
      <div class="mg-section-title">문장 넣기</div>
      <div class="mg-insert-body-2col">
        <div class="mg-insert-col">${buildInsertColHtml(left, i + 1)}</div>
        <div class="mg-insert-col">${right ? buildInsertColHtml(right, i + 2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildInsertAnswerPages(insertionData, examInfo, pageNum) {
  const markers = ['①', '②', '③', '④', '⑤']
  let sectionsHtml = ''
  for (let i = 0; i < insertionData.length; i++) {
    const ins = insertionData[i]
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}번 (지문 ${escapeHtml(String(ins.passageNum))})</div>
      <div class="mg-answer-grid"><div class="mg-answer-item">정답: <strong>${markers[ins.correctMarker - 1] || '?'}</strong></div></div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q2', pageNum)}
    <div class="mg-section-title">문장 넣기 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

const CIRCLED_LOWER = ['ⓐ', 'ⓑ', 'ⓒ', 'ⓓ', 'ⓔ', 'ⓕ', 'ⓖ']

function generateGrammarQuizData(originalEnglish, peonaPairs) {
  const candidates = []
  for (const pair of peonaPairs) {
    const escaped = flexEscape(pair.correct)
    let found = false
    for (const pattern of [`\\b${escaped}\\b`, escaped]) {
      const re = new RegExp(pattern, 'gi')
      let hit
      while ((hit = re.exec(originalEnglish)) !== null) {
        candidates.push({ correct: hit[0], wrong: pair.wrong, index: hit.index, len: hit[0].length })
        found = true
      }
      if (found) break
    }
  }
  candidates.sort((a, b) => a.index - b.index)

  const noOverlap = []
  let lastEnd = 0
  const usedKey = new Set()
  for (const c of candidates) {
    const key = c.correct.toLowerCase()
    if (c.index >= lastEnd && !usedKey.has(key)) {
      noOverlap.push(c)
      lastEnd = c.index + c.len
      usedKey.add(key)
    }
  }

  if (noOverlap.length < 7) return null
  const picked = [...noOverlap].sort(() => Math.random() - 0.5).slice(0, 7).sort((a, b) => a.index - b.index)

  const wrongCount = 2 + Math.floor(Math.random() * 2)
  const wrongIndices = new Set()
  const idxPool = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5)
  for (let i = 0; i < wrongCount && i < idxPool.length; i++) wrongIndices.add(idxPool[i])

  let html = ''
  let pos = 0
  const items = []
  for (let i = 0; i < picked.length; i++) {
    const p = picked[i]
    html += escapeHtml(originalEnglish.substring(pos, p.index))
    const showWrong = wrongIndices.has(i)
    const displayWord = showWrong ? p.wrong : p.correct
    html += `<span class="mg-gq-underline">${escapeHtml(displayWord)}</span><span class="mg-gq-label">${CIRCLED_LOWER[i]}</span>`
    items.push({ label: CIRCLED_LOWER[i], isWrong: showWrong, correct: p.correct, wrong: p.wrong })
    pos = p.index + p.len
  }
  html += escapeHtml(originalEnglish.substring(pos))

  const correctSet = items.filter(it => it.isWrong).map(it => it.label)
  const correctText = correctSet.join(', ')

  const choices = [{ text: correctText, isCorrect: true }]
  const allLabels = CIRCLED_LOWER.slice(0, 7)
  const usedTexts = new Set([correctText])
  let attempts = 0
  while (choices.length < 5 && attempts < 50) {
    attempts++
    const cnt = 2 + Math.floor(Math.random() * 2)
    const shuffled = [...allLabels].sort(() => Math.random() - 0.5).slice(0, cnt).sort()
    const txt = shuffled.join(', ')
    if (!usedTexts.has(txt)) {
      usedTexts.add(txt)
      choices.push({ text: txt, isCorrect: false })
    }
  }
  choices.sort(() => Math.random() - 0.5)
  const correctIdx = choices.findIndex(c => c.isCorrect)

  return { html, choices, correctIdx }
}

function buildGrammarQuizCellHtml(gqData, passageNum, questionNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  const choicesHtml = gqData.choices.map((c, i) =>
    `<span class="mg-gq-choice">${nums[i]} ${escapeHtml(c.text)}&nbsp;&nbsp;</span>`
  ).join('')

  return `<div class="mg-gq-cell">
    <div class="mg-gq-q">${questionNum}. 밑줄 친 ⓐ~ⓖ 중 어법, 혹은 문맥상 어휘의 사용이 어색한 것끼리 짝지어진 것을 고르시오. <span class="mg-gq-q-src">${escapeHtml(String(passageNum))}</span></div>
    <div class="mg-gq-text">${gqData.html}</div>
    <div class="mg-gq-choices">${choicesHtml}</div>
  </div>`
}

function buildGrammarQuizPages(grammarQuizData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < grammarQuizData.length; i += 4) {
    const batch = grammarQuizData.slice(i, i + 4)
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    let cellsHtml = ''
    for (let j = 0; j < batch.length; j++) {
      cellsHtml += buildGrammarQuizCellHtml(batch[j].quizData, batch[j].passageNum, i + j + 1)
    }
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q2', startPageNum + Math.floor(i / 4))}
      <div class="mg-section-title">어법 · 어휘 퀴즈</div>
      <div class="mg-gq-grid">${cellsHtml}</div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildGrammarQuizAnswerPages(grammarQuizData, examInfo, pageNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  let sectionsHtml = ''
  for (let i = 0; i < grammarQuizData.length; i++) {
    const gq = grammarQuizData[i]
    const answerNum = nums[gq.quizData.correctIdx] || '?'
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}번 (지문 ${escapeHtml(String(gq.passageNum))})</div>
      <div class="mg-answer-grid"><div class="mg-answer-item">정답: <strong>${answerNum} ${escapeHtml(gq.quizData.choices[gq.quizData.correctIdx].text)}</strong></div></div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q2', pageNum)}
    <div class="mg-section-title">어법 · 어휘 퀴즈 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function generateCorrectionQuizData(originalEnglish, peonaPairs) {
  const candidates = []
  for (const pair of peonaPairs) {
    const escaped = flexEscape(pair.correct)
    let found = false
    for (const pattern of [`\\b${escaped}\\b`, escaped]) {
      const re = new RegExp(pattern, 'gi')
      let hit
      while ((hit = re.exec(originalEnglish)) !== null) {
        candidates.push({ correct: hit[0], wrong: pair.wrong, index: hit.index, len: hit[0].length })
        found = true
      }
      if (found) break
    }
  }
  candidates.sort((a, b) => a.index - b.index)

  const noOverlap = []
  let lastEnd = 0
  const usedKey = new Set()
  for (const c of candidates) {
    const key = c.correct.toLowerCase()
    if (c.index >= lastEnd && !usedKey.has(key)) {
      noOverlap.push(c)
      lastEnd = c.index + c.len
      usedKey.add(key)
    }
  }

  if (noOverlap.length < 10) return null
  const picked = [...noOverlap].sort(() => Math.random() - 0.5).slice(0, 10).sort((a, b) => a.index - b.index)

  const wrongIndices = new Set()
  const idxPool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5)
  for (let i = 0; i < 5; i++) wrongIndices.add(idxPool[i])

  let html = ''
  let pos = 0
  const items = []
  for (let i = 0; i < picked.length; i++) {
    const p = picked[i]
    html += escapeHtml(originalEnglish.substring(pos, p.index))
    const showWrong = wrongIndices.has(i)
    const displayWord = showWrong ? p.wrong : p.correct
    html += `<span class="mg-gq-underline">${escapeHtml(displayWord)}</span><span class="mg-gq-label">${CIRCLED_NUMS[i]}</span>`
    items.push({ num: i + 1, label: CIRCLED_NUMS[i], isWrong: showWrong, correct: p.correct, wrong: p.wrong, displayed: displayWord })
    pos = p.index + p.len
  }
  html += escapeHtml(originalEnglish.substring(pos))

  return { html, items }
}

function buildCorrectionColHtml(cqData, passageNum, questionNum) {
  let tableRows = ''
  for (let i = 0; i < 5; i++) {
    tableRows += `<tr>
      <td>(${'\u00a0\u00a0\u00a0'})</td>
      <td></td>
      <td class="mg-cq-arrow">→</td>
      <td></td>
    </tr>`
  }

  return `<div>
    <div class="mg-cq-q">${questionNum}. 밑줄 부분 중 어법, 혹은 문맥상 어휘의 쓰임이 어색한 것을 올바르게 고쳐 쓰시오. (5개) <span class="mg-cq-q-src">${escapeHtml(String(passageNum))}</span></div>
    <div class="mg-cq-text">${cqData.html}</div>
    <table class="mg-cq-table">
      <tr><th>기호</th><th>어색한 표현</th><th></th><th>올바른 표현</th></tr>
      ${tableRows}
    </table>
  </div>`
}

function buildCorrectionQuizPages(correctionData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < correctionData.length; i += 2) {
    const left = correctionData[i]
    const right = correctionData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q2', startPageNum + Math.floor(i / 2))}
      <div class="mg-section-title">어법 · 어휘 수정</div>
      <div class="mg-cq-body-2col">
        <div class="mg-cq-col">${buildCorrectionColHtml(left.quizData, left.passageNum, i + 1)}</div>
        <div class="mg-cq-col">${right ? buildCorrectionColHtml(right.quizData, right.passageNum, i + 2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildCorrectionAnswerPages(correctionData, examInfo, pageNum) {
  let sectionsHtml = ''
  for (let i = 0; i < correctionData.length; i++) {
    const cd = correctionData[i]
    const wrongs = cd.quizData.items.filter(it => it.isWrong)
    let items = ''
    for (const w of wrongs) {
      items += `<div class="mg-answer-item">${w.label} ${escapeHtml(w.displayed)} → <strong>${escapeHtml(w.correct)}</strong></div>`
    }
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}번 (지문 ${escapeHtml(String(cd.passageNum))})</div>
      <div class="mg-answer-grid">${items}</div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q2', pageNum)}
    <div class="mg-section-title">어법 · 어휘 수정 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function fisherYatesShuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function extractEnglishWords(text) {
  return text
    .replace(/[^a-zA-Z0-9\s'\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
}

function chunkWords(words) {
  const totalWords = words.length
  const chunkCount = 5
  const baseSize = Math.floor(totalWords / chunkCount)
  const remainder = totalWords % chunkCount
  const chunks = []
  let idx = 0
  for (let i = 0; i < chunkCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0)
    chunks.push(words.slice(idx, idx + size))
    idx += size
  }
  return chunks
}

function buildTopicQuizColHtml(td, passageNum, questionNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  const choicesHtml = td.options.map((opt, i) =>
    `<div class="mg-q3-choice">${nums[i]} ${escapeHtml(opt)}</div>`
  ).join('')

  return `<div>
    <div class="mg-q3-src">${escapeHtml(String(passageNum))}</div>
    <div class="mg-q3-q">${questionNum}. 다음 글의 주제로 가장 적절한 것은?</div>
    <div class="mg-q3-text">${escapeHtml(td.englishText)}</div>
    <div class="mg-q3-choices">${choicesHtml}</div>
  </div>`
}

function buildTopicQuizPages(topicData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < topicData.length; i += 2) {
    const left = topicData[i]
    const right = topicData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q3', startPageNum + Math.floor(i / 2))}
      <div class="mg-section-title">주제</div>
      <div class="mg-q3-body-2col">
        <div class="mg-q3-col">${buildTopicQuizColHtml(left, left.passageNum, i + 1)}</div>
        <div class="mg-q3-col">${right ? buildTopicQuizColHtml(right, right.passageNum, i + 2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildTopicAnswerPages(topicData, examInfo, pageNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  let sectionsHtml = ''
  for (let i = 0; i < topicData.length; i++) {
    const td = topicData[i]
    const answerNum = nums[td.correctIdx] || '?'
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}번 (지문 ${escapeHtml(String(td.passageNum))})</div>
      <div class="mg-answer-grid"><div class="mg-answer-item">정답: <strong>${answerNum} ${escapeHtml(td.options[td.correctIdx])}</strong></div></div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q3', pageNum)}
    <div class="mg-section-title">주제 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function buildThirdWordColHtml(tw, passageNum, questionNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  const choicesHtml = tw.shuffledChunks.map((chunk, i) =>
    `<div class="mg-q3-choice">${nums[i]} ${escapeHtml(chunk)}</div>`
  ).join('')

  return `<div>
    <div class="mg-q3-src">${escapeHtml(String(passageNum))}</div>
    <div class="mg-q3-q">${questionNum}. 요약문 중 세번째로 오는 부분은 몇 번인가?</div>
    <div class="mg-q3-text">${escapeHtml(tw.englishText)}</div>
    <div class="mg-q3-choices">${choicesHtml}</div>
  </div>`
}

function buildThirdWordPages(thirdWordData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < thirdWordData.length; i += 2) {
    const left = thirdWordData[i]
    const right = thirdWordData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q3', startPageNum + Math.floor(i / 2))}
      <div class="mg-section-title">세번째 단어</div>
      <div class="mg-q3-body-2col">
        <div class="mg-q3-col">${buildThirdWordColHtml(left, left.passageNum, i + 1)}</div>
        <div class="mg-q3-col">${right ? buildThirdWordColHtml(right, right.passageNum, i + 2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildThirdWordAnswerPages(thirdWordData, examInfo, pageNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  let sectionsHtml = ''
  for (let i = 0; i < thirdWordData.length; i++) {
    const tw = thirdWordData[i]
    const answerNum = nums[tw.correctIdx] || '?'
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}번 (지문 ${escapeHtml(String(tw.passageNum))})</div>
      <div class="mg-answer-grid"><div class="mg-answer-item">정답: <strong>${answerNum} ${escapeHtml(tw.shuffledChunks[tw.correctIdx])}</strong></div></div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q3', pageNum)}
    <div class="mg-section-title">세번째 단어 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function buildContentMatchColHtml(cm, passageNum, questionNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  const choicesHtml = cm.options.map((opt, i) =>
    `<div class="mg-q3-choice">${nums[i]} ${escapeHtml(opt)}</div>`
  ).join('')

  return `<div>
    <div class="mg-q3-src">${escapeHtml(String(passageNum))}</div>
    <div class="mg-q3-q">${questionNum}. 다음 글의 내용과 일치하지 않는 것은?</div>
    <div class="mg-q3-text">${escapeHtml(cm.englishText)}</div>
    <div class="mg-q3-choices">${choicesHtml}</div>
  </div>`
}

function buildContentMatchPages(contentMatchData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < contentMatchData.length; i += 2) {
    const left = contentMatchData[i]
    const right = contentMatchData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q3', startPageNum + Math.floor(i / 2))}
      <div class="mg-section-title">일치 / 불일치</div>
      <div class="mg-q3-body-2col">
        <div class="mg-q3-col">${buildContentMatchColHtml(left, left.passageNum, i + 1)}</div>
        <div class="mg-q3-col">${right ? buildContentMatchColHtml(right, right.passageNum, i + 2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildContentMatchAnswerPages(contentMatchData, examInfo, pageNum) {
  const nums = ['①', '②', '③', '④', '⑤']
  let sectionsHtml = ''
  for (let i = 0; i < contentMatchData.length; i++) {
    const cm = contentMatchData[i]
    const answerNum = nums[cm.correctIdx] || '?'
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}번 (지문 ${escapeHtml(String(cm.passageNum))})</div>
      <div class="mg-answer-grid"><div class="mg-answer-item">정답: <strong>${answerNum}</strong></div></div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q3', pageNum)}
    <div class="mg-section-title">일치 / 불일치 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function processThirdWordSummary(summary) {
  const words = extractEnglishWords(summary)
  const chunks = chunkWords(words)
  const chunkTexts = chunks.map(c => c.join(' '))
  const originalThird = chunkTexts[2]

  const indices = [0, 1, 2, 3, 4]
  const shuffledIndices = fisherYatesShuffle(indices)
  const shuffledChunks = shuffledIndices.map(i => chunkTexts[i])
  const correctIdx = shuffledIndices.indexOf(2)

  return { shuffledChunks, correctIdx }
}

function buildTopicSentenceColHtml(ts, passageNum, questionNum) {
  const bankStr = ts.shuffledChunks.map(c => escapeHtml(c)).join(' / ')
  return `<div>
    <div class="mg-q5-src">${escapeHtml(String(passageNum))}</div>
    <div class="mg-q5-q">${questionNum}. \ubc15\uc2a4 \uc548\uc758 \ubcf4\uae30\ub97c \uc7ac\ubc30\uc5f4\ud558\uc5ec \uc8fc\uc81c\ub97c \uc644\uc131\ud558\uc2dc\uc624.</div>
    <div class="mg-q5-text">${escapeHtml(ts.englishText)}</div>
    <div class="mg-q5-prompt">The passage suggests that ____________________.</div>
    <div class="mg-q5-bank-box">
      <div class="mg-q5-bank-label">&lt;\ubcf4\uae30&gt;</div>
      <div class="mg-q5-bank-items">${bankStr}</div>
    </div>
    <div class="mg-q5-cond-box">
      <div class="mg-q5-cond-label">&lt;\uc870\uac74&gt;</div>
      <div class="mg-q5-cond-text">\u2022 &lt;\ubcf4\uae30&gt;\uc5d0 \uc8fc\uc5b4\uc9c4 \ub2e8\uc5b4 \ubc0f \uc5b4\uad6c\ub9cc\uc744 \ubaa8\ub450 \ud55c\ubc88\uc529 \uc0ac\uc6a9\ud560 \uac83</div>
    </div>
  </div>`
}

function buildTopicSentencePages(topicSentenceData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < topicSentenceData.length; i += 2) {
    const left = topicSentenceData[i]
    const right = topicSentenceData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q5', startPageNum + domPages.length)}
      <div class="mg-section-title">\uc8fc\uc81c\ubb38 \ubc30\uc5f4 (Topic Sentence)</div>
      <div class="mg-q3-body-2col">
        <div class="mg-q3-col">${buildTopicSentenceColHtml(left, left.passageNum, i + 1)}</div>
        <div class="mg-q3-col">${right ? buildTopicSentenceColHtml(right, right.passageNum, i + 2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildTopicSentenceAnswerPages(topicSentenceData, examInfo, pageNum) {
  let sectionsHtml = ''
  for (let i = 0; i < topicSentenceData.length; i++) {
    const ts = topicSentenceData[i]
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}\ubc88 (\uc9c0\ubb38 ${escapeHtml(String(ts.passageNum))})</div>
      <div class="mg-answer-grid"><div class="mg-answer-item">${escapeHtml(ts.remaining)}</div></div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q5', pageNum)}
    <div class="mg-section-title">\uc8fc\uc81c\ubb38 \ubc30\uc5f4 (Topic Sentence) \u2014 \uc815\ub2f5</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function buildSummaryFillColHtml(sf, passageNum, questionNum) {
  return `<div>
    <div class="mg-sf-src">${escapeHtml(String(passageNum))}</div>
    <div class="mg-sf-q">${questionNum}. \ub2e4\uc74c \uae00\uc744 \uc694\uc57d\ud558\uace0\uc790 \ud55c\ub2e4. \ubcf8\ubb38\uc758 \ub2e8\uc5b4\ub97c \ud65c\uc6a9\ud558\uc5ec \ube48\uce78\uc5d0 \uc54c\ub9de\uc740 \ub9d0\uc744 \ucc44\uc6cc \ub123\uc73c\uc2dc\uc624. (\ub2e8, \ud544\uc694 \uc2dc \ud615\ud0dc\ub97c \ubcc0\ud654\uc2dc\ud0ac \uac83)</div>
    <div class="mg-sf-text">${escapeHtml(sf.englishText)}</div>
    <div class="mg-sf-summary-box">${sf.summaryHtml}</div>
  </div>`
}

function buildSummaryFillPages(summaryFillData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < summaryFillData.length; i += 2) {
    const left = summaryFillData[i]
    const right = summaryFillData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q5', startPageNum + domPages.length)}
      <div class="mg-section-title">\uc694\uc57d\ubb38 \ub2e8\uc5b4 \ucc44\uc6b0\uae30</div>
      <div class="mg-q3-body-2col">
        <div class="mg-q3-col">${buildSummaryFillColHtml(left, left.passageNum, i + 1)}</div>
        <div class="mg-q3-col">${right ? buildSummaryFillColHtml(right, right.passageNum, i + 2) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildSummaryFillAnswerPages(summaryFillData, examInfo, pageNum) {
  let sectionsHtml = ''
  for (let i = 0; i < summaryFillData.length; i++) {
    const sf = summaryFillData[i]
    const items = sf.answerKey.map(a =>
      `<span class="mg-answer-item">${a.num}) ${escapeHtml(a.word)}</span>`
    ).join(' &nbsp; ')
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}\ubc88 (\uc9c0\ubb38 ${escapeHtml(String(sf.passageNum))})</div>
      <div class="mg-answer-grid">${items}</div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q5', pageNum)}
    <div class="mg-section-title">\uc694\uc57d\ubb38 \ub2e8\uc5b4 \ucc44\uc6b0\uae30 \u2014 \uc815\ub2f5</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function parseComplexDescMarkers(englishText) {
  const markers = []
  let m
  const blankRe = /<([^/>]+)\/([^>]+)>/g
  while ((m = blankRe.exec(englishText)) !== null) {
    markers.push({ type: 'blank', hint: m[1].trim(), answer: m[2].trim(), index: m.index, len: m[0].length })
  }
  const bracketRe = /\[([^\]]+)\]/g
  while ((m = bracketRe.exec(englishText)) !== null) {
    markers.push({ type: 'bracket', sentence: m[1], index: m.index, len: m[0].length })
  }
  const wbRe = /\{([^}]+)\}/g
  while ((m = wbRe.exec(englishText)) !== null) {
    const content = m[1]
    const slashes = []
    for (let i = 0; i < content.length; i++) { if (content[i] === '/') slashes.push(i) }
    if (slashes.length >= 2) {
      const s2 = slashes[slashes.length - 2]
      const s1 = slashes[slashes.length - 1]
      markers.push({
        type: 'wordBank',
        bankText: content.substring(0, s2).trim(),
        correctText: content.substring(s2 + 1, s1).trim(),
        korean: content.substring(s1 + 1).trim(),
        index: m.index, len: m[0].length,
      })
    }
  }
  markers.sort((a, b) => a.index - b.index)
  return markers
}

function applyPeonaErrorsToSentence(sentence, peonaPairs) {
  if (!peonaPairs.length) return { html: escapeHtml(sentence), cleanHtml: escapeHtml(sentence), corrections: [] }
  const candidates = []
  for (const pair of peonaPairs) {
    const escaped = flexEscape(pair.correct)
    let found = false
    for (const pattern of [`\\b${escaped}\\b`, escaped]) {
      const re = new RegExp(pattern, 'gi')
      let hit
      while ((hit = re.exec(sentence)) !== null) {
        candidates.push({ correct: hit[0], wrong: pair.wrong, index: hit.index, len: hit[0].length })
        found = true
      }
      if (found) break
    }
  }
  candidates.sort((a, b) => a.index - b.index)
  const noOverlap = []
  let lastEnd = 0
  const usedKey = new Set()
  for (const c of candidates) {
    const key = c.correct.toLowerCase()
    if (c.index >= lastEnd && !usedKey.has(key)) {
      noOverlap.push(c)
      lastEnd = c.index + c.len
      usedKey.add(key)
    }
  }
  const picked = noOverlap.length <= 5
    ? noOverlap
    : [...noOverlap].sort(() => Math.random() - 0.5).slice(0, 5).sort((a, b) => a.index - b.index)
  let html = ''
  let cleanHtml = ''
  let pos = 0
  const corrections = []
  for (let i = 0; i < picked.length; i++) {
    const p = picked[i]
    const textBefore = escapeHtml(sentence.substring(pos, p.index))
    html += textBefore
    cleanHtml += textBefore
    html += `<span class="mg-gq-underline">${escapeHtml(p.wrong)}</span><sup>${CIRCLED_NUMS[i]}</sup>`
    cleanHtml += escapeHtml(p.wrong)
    corrections.push({ num: i + 1, label: CIRCLED_NUMS[i], wrong: p.wrong, correct: p.correct })
    pos = p.index + p.len
  }
  const textAfter = escapeHtml(sentence.substring(pos))
  html += textAfter
  cleanHtml += textAfter
  return { html, cleanHtml, corrections }
}

function buildComplexDescPages(complexDescData, examInfo, startPageNum) {
  const domPages = []
  for (let idx = 0; idx < complexDescData.length; idx++) {
    const item = complexDescData[idx]
    const markers = parseComplexDescMarkers(item.englishText)
    console.log(`[quiz4-render] 지문 ${item.passageNum}: ${markers.length} markers, types: ${markers.map(m => m.type).join(',')}`)

    if (markers.length === 0) {
      console.warn(`[quiz4-render] No markers in passage ${item.passageNum}. English starts: ${item.englishText.substring(0, 150)}`)
      const fallbackPage = document.createElement('div')
      fallbackPage.className = 'mg-page mg-section-page'
      fallbackPage.innerHTML = `
        ${buildHeaderHtml(examInfo, 'q4', startPageNum + domPages.length)}
        <div class="mg-section-title">복합 서술형</div>
        <div class="mg-q4-passage-header">\u25a3 다음 글을 읽고 물음에 답하시오. <span class="mg-q4-src">${escapeHtml(String(item.passageNum))}</span></div>
        <div class="mg-q4-passage-text">${escapeHtml(item.englishText)}</div>
        <div style="font-size:8pt;color:#c00;margin-top:4mm;">\u26a0 \ubcf5\ud569 \uc11c\uc220\ud615 \ub9c8\ucee4\uac00 \uac10\uc9c0\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4. &lt;\ud78c\ud2b8/\uc815\ub2f5&gt;, [\ubb38\uc7a5], {\ubcf4\uae30/\uc815\ub2f5/\ud574\uc11d} \ud615\uc2dd\uc744 \ud655\uc778\ud558\uc138\uc694.</div>
        <div class="mg-footer">www.englishmygod.com</div>
      `
      domPages.push(fallbackPage)
      continue
    }

    const blanks = markers.filter(mk => mk.type === 'blank')
    const bracketMarker = markers.find(mk => mk.type === 'bracket')
    const wbMarker = markers.find(mk => mk.type === 'wordBank')

    let bracketData = null
    if (bracketMarker && item.peonaPairs?.length) {
      bracketData = applyPeonaErrorsToSentence(bracketMarker.sentence, item.peonaPairs)
    }

    let wordBankData = null
    if (wbMarker) {
      const units = wbMarker.bankText.split(/\s+/).map(t =>
        t.includes('++') ? t.replace(/\+\+/g, ' ') : t
      )
      wordBankData = {
        shuffledUnits: fisherYatesShuffle(units),
        correctText: wbMarker.correctText,
        korean: wbMarker.korean,
      }
    }

    item._blanks = blanks
    item._bracketData = bracketData
    item._wordBankData = wordBankData

    let passHtml = ''
    let pos = 0
    let bNum = 0
    for (const mk of markers) {
      if (mk.index > pos) passHtml += escapeHtml(item.englishText.substring(pos, mk.index))
      if (mk.type === 'blank') {
        bNum++
        passHtml += `<span class="mg-q4-hint">${escapeHtml(mk.hint)}</span><span class="mg-q4-sup">${bNum})</span>_______________`
      } else if (mk.type === 'bracket') {
        const sentenceHtml = bracketData ? bracketData.cleanHtml : escapeHtml(mk.sentence)
        passHtml += `<span class="mg-q4-bracket-label">ⓐ</span> <u>${sentenceHtml}</u>`
      } else if (mk.type === 'wordBank') {
        passHtml += `<span class="mg-q4-ga-label">(가)</span> ________________________________________`
      }
      pos = mk.index + mk.len
    }
    if (pos < item.englishText.length) passHtml += escapeHtml(item.englishText.substring(pos))

    let qHtml = ''
    let qN = 1

    if (blanks.length > 0) {
      qHtml += `<div class="mg-q4-question"><div class="mg-q4-q-title">${qN}. 힌트를 참고하여 각 빈칸에 알맞은 단어를 쓰시오.</div></div>`
      qN++
    }

    if (bracketData?.corrections.length > 0) {
      const errCnt = bracketData.corrections.length
      const rows = bracketData.corrections.map((_, i) =>
        `<tr><td>${i + 1}</td><td></td><td class="mg-cq-arrow">\u2192</td><td></td></tr>`
      ).join('')
      qHtml += `<div class="mg-q4-question">
        <div class="mg-q4-q-title">${qN}. 밑줄 친 \u24d0에서, 어법 혹은 문맥상 어색한 부분을 ${errCnt}개 찾아 올바르게 고쳐 쓰시오.</div>
        <table class="mg-cq-table"><tr><th>번호</th><th>어색한 표현</th><th></th><th>바른 표현</th></tr>${rows}</table>
      </div>`
      qN++
    }

    if (wordBankData) {
      const unitStr = wordBankData.shuffledUnits.map(u => escapeHtml(u)).join(' / ')
      qHtml += `<div class="mg-q4-question">
        <div class="mg-q4-q-title">${qN}. 위 글에서 주어진 (가)의 한글과 같은 의미를 가지도록, 각각의 주어진 단어들을 알맞게 배열하시오.</div>
        <div class="mg-q4-ga-korean">(가) ${escapeHtml(wordBankData.korean)}</div>
        <div class="mg-q4-word-bank">(가) ${unitStr}</div>
      </div>`
    }

    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'q4', startPageNum + domPages.length)}
      <div class="mg-section-title">복합 서술형</div>
      <div class="mg-q4-passage-header">\u25a3 다음 글을 읽고 물음에 답하시오. <span class="mg-q4-src">${escapeHtml(String(item.passageNum))}</span></div>
      <div class="mg-q4-passage-text">${passHtml}</div>
      ${qHtml}
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildComplexDescAnswerPages(complexDescData, examInfo, pageNum) {
  let sectionsHtml = ''
  for (let i = 0; i < complexDescData.length; i++) {
    const item = complexDescData[i]
    if (!item._blanks && !item._bracketData && !item._wordBankData) continue
    let answers = ''

    if (item._blanks?.length > 0) {
      const items = item._blanks.map((b, j) =>
        `<div class="mg-answer-item">${j + 1}) <strong>${escapeHtml(b.answer)}</strong></div>`
      ).join('')
      answers += `<div style="margin-bottom:2mm"><strong>빈칸:</strong></div><div class="mg-answer-grid">${items}</div>`
    }
    if (item._bracketData?.corrections?.length > 0) {
      const items = item._bracketData.corrections.map(c =>
        `<div class="mg-answer-item">${c.label} ${escapeHtml(c.wrong)} \u2192 <strong>${escapeHtml(c.correct)}</strong></div>`
      ).join('')
      answers += `<div style="margin-bottom:2mm;margin-top:2mm"><strong>어법 어휘 수정:</strong></div><div class="mg-answer-grid">${items}</div>`
    }
    if (item._wordBankData) {
      answers += `<div style="margin-top:2mm"><strong>배열:</strong> ${escapeHtml(item._wordBankData.correctText)}</div>`
    }

    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${i + 1}번 (지문 ${escapeHtml(String(item.passageNum))})</div>
      ${answers}
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'q4', pageNum)}
    <div class="mg-section-title">복합 서술형 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

function buildBracketColHtml(bd) {
  return `<div class="mg-bracket-passage">
    <div class="mg-bracket-passage-num">${escapeHtml(String(bd.passageNum))}</div>
    <div class="mg-bracket-en-text">${bd.bracketHtml}</div>
    <div class="mg-bracket-kr-text">${escapeHtml(bd.korean)}</div>
  </div>`
}

function buildBracketPages(bracketData, examInfo, startPageNum) {
  const domPages = []
  for (let i = 0; i < bracketData.length; i += 2) {
    const left = bracketData[i]
    const right = bracketData[i + 1]
    const page = document.createElement('div')
    page.className = 'mg-page mg-section-page'
    page.innerHTML = `
      ${buildHeaderHtml(examInfo, 'bracket', startPageNum + Math.floor(i / 2))}
      <div class="mg-section-title">[ / ] 선택형</div>
      <div class="mg-bracket-body">
        <div class="mg-bracket-col">${buildBracketColHtml(left)}</div>
        <div class="mg-bracket-col">${right ? buildBracketColHtml(right) : ''}</div>
      </div>
      <div class="mg-footer">www.englishmygod.com</div>
    `
    domPages.push(page)
  }
  return domPages
}

function buildAnswerPages(bracketData, examInfo, pageNum) {
  let sectionsHtml = ''
  for (const bd of bracketData) {
    let items = ''
    for (const a of bd.answerKey) {
      items += `<div class="mg-answer-item">${a.num}. <strong>${escapeHtml(a.answer)}</strong></div>`
    }
    sectionsHtml += `<div class="mg-answer-section">
      <div class="mg-answer-passage-num">${escapeHtml(String(bd.passageNum))}</div>
      <div class="mg-answer-grid">${items}</div>
    </div>`
  }
  const page = document.createElement('div')
  page.className = 'mg-page mg-section-page'
  page.innerHTML = `
    ${buildHeaderHtml(examInfo, 'bracket', pageNum)}
    <div class="mg-section-title">[ / ] 선택형 — 정답</div>
    <div class="mg-answer-body">${sectionsHtml}</div>
    <div class="mg-footer">www.englishmygod.com</div>
  `
  return page
}

async function capturePageToPdf(pdf, pageDom, root, pageIndex) {
  root.appendChild(pageDom)

  await document.fonts.ready.catch(() => {})
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  const canvas = await html2canvas(pageDom, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: pageDom.offsetWidth,
    height: pageDom.offsetHeight,
  })

  const imgData = canvas.toDataURL('image/png', 1.0)
  let imgW = PAGE_W_MM
  let imgH = (canvas.height * PAGE_W_MM) / canvas.width
  if (imgH > PAGE_H_MM) {
    const scale = PAGE_H_MM / imgH
    imgH = PAGE_H_MM
    imgW *= scale
  }

  if (pageIndex > 0) pdf.addPage()
  pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH, undefined, 'FAST')

  root.removeChild(pageDom)
}

export { extractPeonaPairs, applyBracketsToOriginal, applyBlanksToOriginal, generateOrderingData, generateGrammarQuizData, generateCorrectionQuizData, processThirdWordSummary }

export async function generateMygodPdf(examInfo, vocabData, passages, sectionFlags, onProgress, bracketData, fillBlankData, orderingData, insertionData, grammarQuizData, correctionData, topicQuizData, thirdWordData, contentMatchData, complexDescData, topicSentenceData, summaryFillData) {
  await loadPdfLibraries()

  const report = (msg) => { if (onProgress) onProgress(msg) }
  const s = sectionFlags || { cover: true, blank: true, voca: true, vocaTestKr: true, vocaTestEn: true, text: true, bracket: false }

  const root = document.createElement('div')
  root.className = 'mg-root'
  const styleEl = document.createElement('style')
  styleEl.textContent = buildBaseCss()
  root.appendChild(styleEl)
  document.body.appendChild(root)

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  try {
    let pageIdx = 0
    let vocaPagesCount = 0
    let korTestPagesCount = 0

    if (s.cover) {
      report('표지 생성 중...')
      await capturePageToPdf(pdf, buildCoverDom(examInfo), root, pageIdx++)
    }

    if (s.blank) {
      report('빈 페이지 추가 중...')
      await capturePageToPdf(pdf, buildBlankDom(), root, pageIdx++)
    }

    if (s.voca) {
      report('단어장(Voca) 생성 중...')
      const vocaPages = buildVocaSectionPages(vocabData, examInfo, 'full', 'Voca', 'voca', pageIdx + 1)
      vocaPagesCount = vocaPages.length
      for (const p of vocaPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.vocaTestKr) {
      report('한글 쓰기 시험지 생성 중...')
      const korTestPages = buildVocaSectionPages(vocabData, examInfo, 'en-only', 'Voca Test', 'voca', pageIdx + 1)
      korTestPagesCount = korTestPages.length
      for (const p of korTestPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.vocaTestEn) {
      report('영어 쓰기 시험지 생성 중...')
      const engTestPages = buildVocaSectionPages(vocabData, examInfo, 'kr-only', 'Voca Test', 'voca', pageIdx + 1)
      for (const p of engTestPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.text) {
      report('본문(Text) 생성 중...')
      for (let i = 0; i < passages.length; i++) {
        report(`본문(Text) 생성 중... (${i + 1}/${passages.length})`)
        const textPage = buildTextPageDom(passages[i], examInfo, pageIdx + 1)
        await capturePageToPdf(pdf, textPage, root, pageIdx++)
      }
    }

    if (s.bracket && bracketData && bracketData.length > 0) {
      report('선택형 [ / ] 생성 중...')
      const bracketPages = buildBracketPages(bracketData, examInfo, pageIdx + 1)
      for (const p of bracketPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.fillBlank && fillBlankData && fillBlankData.length > 0) {
      report('빈칸 채우기 생성 중...')
      const fillPages = buildFillBlankPages(passages, fillBlankData, examInfo, pageIdx + 1)
      for (const p of fillPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.ordering && orderingData && orderingData.length > 0) {
      report('순서 배열 생성 중...')
      const orderPages = buildOrderingPages(orderingData, examInfo, pageIdx + 1)
      for (const p of orderPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.insertion && insertionData && insertionData.length > 0) {
      report('문장 넣기 생성 중...')
      const insertPages = buildInsertionPages(insertionData, examInfo, pageIdx + 1)
      for (const p of insertPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.grammarQuiz && grammarQuizData && grammarQuizData.length > 0) {
      report('어법 어휘 퀴즈 생성 중...')
      const gqPages = buildGrammarQuizPages(grammarQuizData, examInfo, pageIdx + 1)
      for (const p of gqPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.correctionQuiz && correctionData && correctionData.length > 0) {
      report('어법 어휘 수정 생성 중...')
      const cqPages = buildCorrectionQuizPages(correctionData, examInfo, pageIdx + 1)
      for (const p of cqPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.topicQuiz && topicQuizData && topicQuizData.length > 0) {
      report('주제 문제 생성 중...')
      const tqPages = buildTopicQuizPages(topicQuizData, examInfo, pageIdx + 1)
      for (const p of tqPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.thirdWord && thirdWordData && thirdWordData.length > 0) {
      report('세번째 단어 생성 중...')
      const twPages = buildThirdWordPages(thirdWordData, examInfo, pageIdx + 1)
      for (const p of twPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.contentMatch && contentMatchData && contentMatchData.length > 0) {
      report('일치/불일치 생성 중...')
      const cmPages = buildContentMatchPages(contentMatchData, examInfo, pageIdx + 1)
      for (const p of cmPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.complexDesc && complexDescData && complexDescData.length > 0) {
      report('복합 서술형 생성 중...')
      const cdPages = buildComplexDescPages(complexDescData, examInfo, pageIdx + 1)
      for (const p of cdPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.topicSentence && topicSentenceData && topicSentenceData.length > 0) {
      report('주제문 배열 생성 중...')
      const tsPages = buildTopicSentencePages(topicSentenceData, examInfo, pageIdx + 1)
      for (const p of tsPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    if (s.summaryFill && summaryFillData && summaryFillData.length > 0) {
      report('요약문 단어 채우기 생성 중...')
      const sfPages = buildSummaryFillPages(summaryFillData, examInfo, pageIdx + 1)
      for (const p of sfPages) {
        await capturePageToPdf(pdf, p, root, pageIdx++)
      }
    }

    report('답지 생성 중...')
    let hasAnswer = false
    if (s.bracket && bracketData?.length) {
      hasAnswer = true
      const answerPage = buildAnswerPages(bracketData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, answerPage, root, pageIdx++)
    }
    if (s.fillBlank && fillBlankData?.length) {
      hasAnswer = true
      const fillAnswerPage = buildFillAnswerPages(fillBlankData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, fillAnswerPage, root, pageIdx++)
    }
    if (s.ordering && orderingData?.length) {
      hasAnswer = true
      const orderAnswerPage = buildOrderAnswerPages(orderingData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, orderAnswerPage, root, pageIdx++)
    }
    if (s.insertion && insertionData?.length) {
      hasAnswer = true
      const insertAnswerPage = buildInsertAnswerPages(insertionData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, insertAnswerPage, root, pageIdx++)
    }
    if (s.grammarQuiz && grammarQuizData?.length) {
      hasAnswer = true
      const gqAnswerPage = buildGrammarQuizAnswerPages(grammarQuizData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, gqAnswerPage, root, pageIdx++)
    }
    if (s.correctionQuiz && correctionData?.length) {
      hasAnswer = true
      const cqAnswerPage = buildCorrectionAnswerPages(correctionData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, cqAnswerPage, root, pageIdx++)
    }
    if (s.topicQuiz && topicQuizData?.length) {
      hasAnswer = true
      const tqAnswerPage = buildTopicAnswerPages(topicQuizData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, tqAnswerPage, root, pageIdx++)
    }
    if (s.thirdWord && thirdWordData?.length) {
      hasAnswer = true
      const twAnswerPage = buildThirdWordAnswerPages(thirdWordData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, twAnswerPage, root, pageIdx++)
    }
    if (s.contentMatch && contentMatchData?.length) {
      hasAnswer = true
      const cmAnswerPage = buildContentMatchAnswerPages(contentMatchData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, cmAnswerPage, root, pageIdx++)
    }
    if (s.complexDesc && complexDescData?.length) {
      const hasData = complexDescData.some(d => d._blanks || d._bracketData || d._wordBankData)
      if (hasData) {
        hasAnswer = true
        const cdAnswerPage = buildComplexDescAnswerPages(complexDescData, examInfo, pageIdx + 1)
        await capturePageToPdf(pdf, cdAnswerPage, root, pageIdx++)
      }
    }
    if (s.topicSentence && topicSentenceData?.length) {
      hasAnswer = true
      const tsAnswerPage = buildTopicSentenceAnswerPages(topicSentenceData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, tsAnswerPage, root, pageIdx++)
    }
    if (s.summaryFill && summaryFillData?.length) {
      hasAnswer = true
      const sfAnswerPage = buildSummaryFillAnswerPages(summaryFillData, examInfo, pageIdx + 1)
      await capturePageToPdf(pdf, sfAnswerPage, root, pageIdx++)
    }

    report('PDF 저장 중...')
    const coverTitle = examInfo.title || `${examInfo.year || 2026} 고${examInfo.grade || 1} ${examInfo.month || 3}월 내신용 변형문제집`
    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const safeTitle = coverTitle.replace(/[\\/:*?"<>|]/g, '_')
    pdf.save(`${safeTitle}_${dateStr}.pdf`)
    report('완료!')
  } finally {
    document.body.removeChild(root)
  }
}
