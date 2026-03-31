/**
 * 동형·변형 모의고사 생성 텍스트 → B4 시험지형 PDF (2단·머리말·각주 — 문법 모의 PDF와 동일한 배치 원리)
 */

let jsPDF
let html2canvas

async function loadPdfLibraries() {
  if (!jsPDF) {
    jsPDF = (await import('jspdf')).default
  }
  if (!html2canvas) {
    html2canvas = (await import('html2canvas')).default
  }
}

/** JIS B4 (mm) — 국내 시험지·교재에서 많이 쓰는 규격 */
export const SCHOOL_MOCK_B4_MM = { w: 257, h: 364 }

/** 시험지 PDF 상단 큰 제목 */
export const SCHOOL_MOCK_PDF_BRAND_TITLE = '보듬교육 동형모의고사'

function escapeHtml(text) {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 생성 결과를 문항 덩어리로 나눔 (===== 로 시작하는 줄 기준)
 * @param {string} raw
 * @returns {string[]}
 */
export function splitSchoolMockResultIntoBlocks(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return []
  const parts = s.split(/\n(?=====)/)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/**
 * 정답표 블록을 항상 맨 뒤로 (PDF 말미 표 배치용)
 * @param {string[]} parts
 * @returns {string[]}
 */
export function reorderAnswerTableBlockLast(parts) {
  const arr = [...parts]
  const idx = arr.findIndex((p) => /^=====?\s*정답표/i.test(String(p).trim()))
  if (idx === -1) return arr
  const [block] = arr.splice(idx, 1)
  return [...arr, block]
}

/** 기출 PDF 파일명(라벨) → 머리말용 가독 문자열 */
export function humanizeReferenceFileLabel(s) {
  return String(s ?? '')
    .replace(/\.pdf$/i, '')
    .replace(/_보기수정$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 학생용 PDF: 문항 블록에서 「정답」「해설」 이후 잘라 냄 (말미 정답표에만 두기)
 * @param {string} raw
 */
export function stripAnswerKeyFromQuestionBlock(raw) {
  const lines = String(raw ?? '').split(/\r?\n/)
  const cut = lines.findIndex((line) => {
    const t = line.trim()
    if (!t) return false
    if (/^(정답|해설|【정답】|〈정답〉|Answer)\s*[:：]?/i.test(t)) return true
    if (/^\*\*정답\*\*/.test(t)) return true
    if (/^\*\*해설\*\*/.test(t)) return true
    if (/^※\s*해설/.test(t)) return true
    if (/^-\s*정답\b/.test(t)) return true
    if (/^【\s*해설】/.test(t)) return true
    if (/^\[해설\]/.test(t)) return true
    if (/^풀이\s*[:：]/.test(t)) return true
    return false
  })
  if (cut === -1) return String(raw ?? '').trimEnd()
  return lines.slice(0, cut).join('\n').replace(/\s+$/, '').trimEnd()
}

function renderExamInlineMarkup(text) {
  let html = escapeHtml(text)
  html = html.replace(
    /\*\*__([^_\n](?:.*?[^_\n])?)__\*\*/g,
    '<strong class="sm-inline-strong sm-inline-under">$1</strong>'
  )
  html = html.replace(
    /__\*\*([^*\n](?:.*?[^*\n])?)\*\*__/g,
    '<strong class="sm-inline-strong sm-inline-under">$1</strong>'
  )
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="sm-inline-strong">$1</strong>')
  html = html.replace(/__([^_\n](?:.*?[^_\n])?)__/g, '<span class="sm-inline-under">$1</span>')
  return html
}

/** @param {string} line */
function renderExamLineHtml(line) {
  let html = renderExamInlineMarkup(line)
  const m = html.match(/^(\s*)(\d+)\.\s(?!\d)/)
  if (m) {
    const rest = html.slice(m[0].length)
    html = `${m[1]}<span class="sm-q-lead-num">${m[2]}.</span> ${rest}`
  }
  return html
}

function shouldAutoBoxLine(trimmed) {
  return /^요약\s*[:：]/.test(trimmed) || /^주어진 문장\s*[:：]/.test(trimmed) || /^제시문\s*[:：]/.test(trimmed)
}

function getAutoBoxLineText(trimmed) {
  if (/^주어진 문장\s*[:：]/.test(trimmed) || /^제시문\s*[:：]/.test(trimmed)) {
    return trimmed.replace(/^(주어진 문장|제시문)\s*[:：]\s*/u, '').trim()
  }
  return trimmed
}

/** @param {string} rawText */
function decorateExamBodyHtml(rawText) {
  const lines = String(rawText ?? '').split(/\r?\n/)
  const rendered = []
  let boxLines = []
  let inBox = false

  const flushBox = () => {
    if (!boxLines.length) return
    rendered.push(
      `<div class="sm-sentence-box">${boxLines.map((line) => renderExamLineHtml(line)).join('<br/>')}</div>`
    )
    boxLines = []
  }

  for (const line of lines) {
    const trimmed = String(line ?? '').trim()
    if (trimmed === '[BOX]') {
      flushBox()
      inBox = true
      continue
    }
    if (trimmed === '[/BOX]') {
      inBox = false
      flushBox()
      continue
    }
    if (inBox) {
      boxLines.push(line)
      continue
    }
    if (shouldAutoBoxLine(trimmed)) {
      flushBox()
      rendered.push(`<div class="sm-sentence-box">${renderExamLineHtml(getAutoBoxLineText(trimmed))}</div>`)
      continue
    }
    rendered.push(renderExamLineHtml(line))
  }

  if (boxLines.length) flushBox()
  return rendered.join('<br/>')
}

function buildSchoolMockCss(pageWmm, pageHmm) {
  const innerPad = Math.max(10, Math.round(pageWmm * 0.045))
  const colGap = Math.max(5, Math.round(pageWmm * 0.024))
  const pad2 = innerPad * 2
  const gutterMargins = colGap * 2
  return `
.sm-pdf-root, .sm-pdf-root * { box-sizing: border-box; }
.sm-pdf-root {
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  color: #111;
  -webkit-font-smoothing: antialiased;
}
.sm-pdf-page {
  width: ${pageWmm}mm;
  height: ${pageHmm}mm;
  padding: ${innerPad}mm ${innerPad}mm ${innerPad + 2}mm;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sm-exam-topline {
  font-size: 10pt;
  text-align: right;
  color: #555;
  margin-bottom: 1.5mm;
  letter-spacing: 0.02em;
}
.sm-exam-banner {
  border: 1.5px solid #111;
  padding: 3.2mm 4mm 3mm;
  margin-bottom: 3mm;
  text-align: center;
  flex-shrink: 0;
  background: #fff;
}
.sm-exam-banner-brand {
  font-size: 20pt;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #0a0a0a;
  margin-bottom: 2.5mm;
  line-height: 1.2;
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
}
.sm-exam-banner-kicker {
  font-size: 10.5pt;
  font-weight: 700;
  color: #333;
  margin-bottom: 1.5mm;
  letter-spacing: 0.12em;
}
.sm-exam-banner-main {
  font-family: "Batang", "BatangChe", "Times New Roman", "Malgun Gothic", serif;
  font-size: 13.5pt;
  font-weight: 700;
  line-height: 1.38;
  letter-spacing: -0.02em;
  color: #000;
}
.sm-exam-banner-sub {
  font-size: 12pt;
  font-weight: 700;
  margin-top: 2mm;
  color: #111;
  font-family: "Batang", "BatangChe", "Malgun Gothic", serif;
}
.sm-exam-banner-note {
  font-size: 9.5pt;
  color: #666;
  margin-top: 2mm;
  line-height: 1.45;
}
.sm-exam-meta-row {
  display: flex;
  justify-content: flex-end;
  gap: 5mm;
  font-size: 10.5pt;
  color: #333;
  margin-bottom: 2.5mm;
  flex-shrink: 0;
}
.sm-exam-meta-row span {
  white-space: nowrap;
}
.sm-body-columns {
  display: flex;
  align-items: flex-start;
  gap: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.sm-col {
  flex: 1;
  width: 0;
  min-width: 0;
  overflow: hidden;
}
.sm-gutter {
  width: 1px;
  align-self: stretch;
  background: #999;
  flex-shrink: 0;
  margin: 0 ${colGap}mm;
}
.sm-footer-mock {
  margin-top: auto;
  padding-top: 2mm;
  border-top: 1px solid #222;
  font-size: 11pt;
  font-family: "Batang", "BatangChe", "Malgun Gothic", serif;
  text-align: center;
  color: #111;
  flex-shrink: 0;
  line-height: 1.4;
}
.sm-q-num-row {
  margin: 0 0 2mm 0;
  padding: 0;
}
.sm-q-num-tnr {
  font-family: "Times New Roman", Times, serif;
  font-size: 17pt;
  font-weight: 700;
  color: #000;
  line-height: 1.15;
}
.sm-q-lead-num {
  font-weight: 800;
  font-size: 1.06em;
  color: #000;
  margin-right: 0.12em;
  font-family: "Times New Roman", Times, "Malgun Gothic", sans-serif;
}
.sm-inline-strong {
  font-weight: 800;
}
.sm-inline-under {
  text-decoration: underline;
  text-decoration-thickness: 1.4px;
  text-underline-offset: 0.11em;
}
.sm-sentence-box {
  border: 1.2px solid #111;
  padding: 2mm 2.4mm;
  margin: 0 0 2.4mm;
  background: #fff;
  line-height: 1.5;
}
.sm-block-exam-q .sm-block-body {
  background: #fff;
  border: none;
  border-radius: 0;
  padding: 1mm 0 2mm;
  line-height: 1.55;
  font-size: 12pt;
  font-family: "Times New Roman", "Batang", "Malgun Gothic", serif;
}
.sm-block {
  margin-bottom: 3.5mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.sm-block-body {
  border: 1px solid #ccc;
  border-radius: 0.8mm;
  padding: 2.5mm 2.8mm;
  font-size: 12pt;
  line-height: 1.52;
  text-align: justify;
  word-break: break-word;
  background: #fafafa;
}
.sm-block-body-table {
  text-align: left;
}
.sm-block-answer .sm-block-body-table {
  background: #fff;
  border: 1px solid #cbd5e1;
}
.sm-block-answer .sm-answer-title {
  font-weight: 800;
  font-size: 12.5pt;
  margin-bottom: 2mm;
  color: #0f172a;
}
.sm-answer-note {
  font-size: 10.5pt;
  color: #475569;
  margin: 0 0 2.5mm;
  line-height: 1.45;
}
.sm-answer-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5pt;
  line-height: 1.4;
}
.sm-answer-table th,
.sm-answer-table td {
  border: 1px solid #94a3b8;
  padding: 1.8mm 2.2mm;
  text-align: center;
  vertical-align: middle;
}
.sm-answer-table th {
  background: #f1f5f9;
  font-weight: 700;
  color: #0f172a;
}
.sm-measure-shell {
  position: absolute;
  left: -9999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  width: ${pageWmm}mm;
}
.sm-measure-col {
  width: calc((${pageWmm}mm - ${pad2}mm - ${gutterMargins}mm - 1px) / 2);
}
`
}

function blockToHtml(block) {
  const body = escapeHtml(block).replace(/\n/g, '<br/>')
  return `<article class="sm-block"><div class="sm-block-body">${body || ' '}</div></article>`
}

/**
 * ===== 문항 n … 블록인지 (좌단 1문항 규칙용)
 * @param {string} raw
 */
export function isSchoolMockQuestionBlock(raw) {
  return /^=====?\s*문항\s*\d+/i.test(String(raw ?? '').trim())
}

/**
 * @param {string} raw
 */
function isSchoolMockAnswerBlock(raw) {
  return /^=====?\s*정답표/i.test(String(raw ?? '').trim())
}

/**
 * 첫 줄 `===== 문항 n …` 제거. 본문 첫 줄이 같은 `n.` 이면 한 번 제거(15pt 번호와 중복 방지)
 * @param {string} raw
 * @returns {{ num: string | null, bodyLines: string[] }}
 */
function extractQuestionNumberAndBodyLines(raw) {
  const lines = String(raw ?? '').split(/\r?\n/)
  if (lines.length === 0) return { num: null, bodyLines: [] }
  const first = lines[0].trim()
  const m = first.match(/^=====?\s*문항\s*(\d+)\b/i)
  if (!m) return { num: null, bodyLines: lines }
  const num = m[1]
  let bodyLines = lines.slice(1)
  if (bodyLines.length) {
    const top = bodyLines[0]
    const t = top.trim()
    const dup = t.match(new RegExp(`^${num}\\.\\s*(.*)$`))
    if (dup) {
      const leadWs = top.match(/^\s*/)?.[0] || ''
      bodyLines = [...bodyLines]
      bodyLines[0] = leadWs + dup[1]
    }
  }
  return { num, bodyLines }
}

function questionBlockToHtml(raw) {
  const stripped = stripAnswerKeyFromQuestionBlock(raw)
  const { num, bodyLines } = extractQuestionNumberAndBodyLines(stripped)
  const bodyText = bodyLines.join('\n')
  const body = decorateExamBodyHtml(bodyText)
  const numHtml =
    num != null
      ? `<div class="sm-q-num-row"><span class="sm-q-num-tnr">${escapeHtml(num)}.</span></div>`
      : ''
  return `<article class="sm-block sm-block-exam-q">${numHtml}<div class="sm-block-body">${body || ' '}</div></article>`
}

/** @param {string} line */
function splitTableRowCells(line) {
  const t = String(line ?? '').trim()
  if (!t) return null
  if (t.includes('\t')) return t.split('\t').map((c) => c.trim())
  if (t.includes('|')) {
    const pipe = t
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
    if (pipe.length >= 2) return pipe
  }
  return null
}

/**
 * 정답표 블록 → HTML table (탭·파이프 구분 행)
 * @param {string} block
 */
function parseAnswerTableBlock(block) {
  const lines = String(block).split(/\r?\n/)
  let titleText = '정답표 (PDF 말미)'
  const subtitleLines = []
  const dataRows = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (/^=====.*정답표/i.test(t)) {
      const inner = t.replace(/^=+\s*/, '').replace(/\s*=+$/, '').trim()
      if (inner) titleText = inner
      continue
    }
    if (t.startsWith('※')) {
      subtitleLines.push(t)
      continue
    }
    const cells = splitTableRowCells(t)
    if (cells && cells.length >= 2) dataRows.push(cells)
  }
  if (dataRows.length === 0) return null

  const first = dataRows[0]
  const looksLikeHeader = /문항|번호|정답|배점|문제|선지|점수/.test(first.join('\t'))
  let bodyRows = dataRows
  let headerRow = null
  if (looksLikeHeader) {
    headerRow = first
    bodyRows = dataRows.slice(1)
  }
  return { titleText, subtitleLines, headerRow, bodyRows }
}

function buildAnswerTableHtml(parsed, rows, continued = false) {
  const thead = parsed.headerRow
    ? `<thead><tr>${parsed.headerRow.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`
    : ''
  const tbody =
    rows.length > 0
      ? `<tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody>`
      : '<tbody></tbody>'

  const subHtml =
    !continued && parsed.subtitleLines.length > 0
      ? parsed.subtitleLines.map((s) => `<p class="sm-answer-note">${escapeHtml(s)}</p>`).join('')
      : ''

  const title = continued ? `${parsed.titleText} (계속)` : parsed.titleText
  return `<article class="sm-block sm-block-answer"><div class="sm-block-body sm-block-body-table"><div class="sm-answer-title">${escapeHtml(
    title
  )}</div>${subHtml}<table class="sm-answer-table">${thead}${tbody}</table></div></article>`
}

function answerTableBlockToHtml(block) {
  const parsed = parseAnswerTableBlock(block)
  if (!parsed) return blockToHtml(block)
  return buildAnswerTableHtml(parsed, parsed.bodyRows, false)
}

function blockToHtmlForPdf(block) {
  const b = String(block ?? '').trim()
  if (isSchoolMockAnswerBlock(b)) return answerTableBlockToHtml(b)
  if (isSchoolMockQuestionBlock(b)) return questionBlockToHtml(b)
  return blockToHtml(block)
}

function sanitizeFilenamePart(s, maxLen = 40) {
  let t = String(s ?? '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
  if (!t) t = 'school'
  return t.slice(0, maxLen)
}

function formatYYMMDD(d = new Date()) {
  const y = String(d.getFullYear()).slice(-2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/**
 * @param {object} opts
 * @param {string} opts.bodyText — 생성 결과 전체
 * @param {string} opts.schoolName
 * @param {string} [opts.examTitle]
 * @param {string} [opts.timeLimit]
 * @param {{ widthMm?: number, heightMm?: number, pageCount?: number, fileLabel?: string } | null} [opts.referencePdf]
 * @param {string} [opts.referenceFileLabel] — 기출 PDF 등록 시 파일명에서 딴 라벨(머리말 본문)
 */
export async function exportSchoolMockExamPdfB4(opts) {
  const {
    bodyText,
    schoolName,
    examTitle = '동형 · 변형 모의고사 (영어)',
    timeLimit = '제한 시간 : 시험 규정에 따름',
    referencePdf = null,
    referenceFileLabel = '',
  } = opts

  const text = String(bodyText ?? '').trim()
  if (!text) {
    throw new Error('PDF로보낼 생성 결과가 없습니다. 먼저 「동형·변형 모의고사 만들기」를 실행해 주세요.')
  }

  await loadPdfLibraries()

  const pageWmm = SCHOOL_MOCK_B4_MM.w
  const pageHmm = SCHOOL_MOCK_B4_MM.h
  const school = String(schoolName ?? '').trim() || '고등학교'

  const rawParts = reorderAnswerTableBlockLast(splitSchoolMockResultIntoBlocks(text))
  const partList = rawParts.length > 0 ? rawParts : [text]

  const fileLabelRaw = String(referenceFileLabel || referencePdf?.fileLabel || '').trim()
  const fileLabelHuman = humanizeReferenceFileLabel(fileLabelRaw)
  const bannerMain = fileLabelHuman || `${school} 고교 영어 지필평가 (동형·변형)`
  const refDimLine =
    referencePdf && referencePdf.widthMm > 0 && referencePdf.heightMm > 0
      ? `등록 기출 PDF 첫 쪽 약 ${referencePdf.widthMm}×${referencePdf.heightMm}mm`
      : ''
  const bannerNote = [refDimLine, `본 PDF JIS B4 ${pageWmm}×${pageHmm}mm · 2단`].filter(Boolean).join(' · ')

  const root = document.createElement('div')
  root.className = 'sm-pdf-root'
  root.setAttribute('data-school-mock-pdf', '1')

  const styleEl = document.createElement('style')
  styleEl.textContent = buildSchoolMockCss(pageWmm, pageHmm)
  root.appendChild(styleEl)

  const measureShell = document.createElement('div')
  measureShell.className = 'sm-measure-shell'
  root.appendChild(measureShell)

  document.body.appendChild(root)

  const buildPageDom = (pageIndex, leftHtml, rightHtml, totalPages) => {
    const tp = Math.max(1, Number(totalPages) || 1)
    const footerLine = `${tp}쪽 중 - ${pageIndex + 1}쪽 ( ${school} · 영어 )`
    const page = document.createElement('div')
    page.className = 'sm-pdf-page'
    page.innerHTML = `
      <div class="sm-exam-topline">${escapeHtml(school)} · 영어 · 동형·변형</div>
      <div class="sm-exam-banner">
        <div class="sm-exam-banner-brand">${escapeHtml(SCHOOL_MOCK_PDF_BRAND_TITLE)}</div>
        <div class="sm-exam-banner-kicker">※ 등록하신 기출 PDF 제목(파일명)을 참고한 머리말</div>
        <div class="sm-exam-banner-main">${escapeHtml(bannerMain)}</div>
        <div class="sm-exam-banner-sub">${escapeHtml(examTitle)}</div>
        <div class="sm-exam-banner-note">${escapeHtml(bannerNote)}</div>
      </div>
      <div class="sm-exam-meta-row">
        <span>${escapeHtml(timeLimit)}</span>
        <span>학년 · 반 · 번호 : ________</span>
        <span>성명 : ________</span>
      </div>
      <div class="sm-body-columns">
        <div class="sm-col">${leftHtml.join('')}</div>
        <div class="sm-gutter"></div>
        <div class="sm-col">${rightHtml.join('')}</div>
      </div>
      <footer class="sm-footer-mock">${escapeHtml(footerLine)}</footer>
    `
    return page
  }

  const probePage = buildPageDom(0, [], [], 1)
  probePage.style.visibility = 'hidden'
  root.appendChild(probePage)
  const bodyCol = probePage.querySelector('.sm-body-columns')
  let bodyBudget = bodyCol ? Math.floor(bodyCol.getBoundingClientRect().height) - 12 : 980
  if (bodyBudget < 320) bodyBudget = 980
  root.removeChild(probePage)

  const gapPx = 5
  const measureHtmlHeight = (html) => {
    const col = document.createElement('div')
    col.className = 'sm-measure-col'
    col.innerHTML = html
    measureShell.appendChild(col)
    const h = col.offsetHeight
    measureShell.removeChild(col)
    return h + gapPx
  }

  const splitAnswerTableBlockForColumns = (raw) => {
    const parsed = parseAnswerTableBlock(raw)
    if (!parsed) {
      return [{ raw, html: blockToHtml(raw), isAnswer: false, isQuestion: false }]
    }
    if (parsed.bodyRows.length === 0) {
      return [{ raw, html: buildAnswerTableHtml(parsed, [], false), isAnswer: false, isQuestion: false }]
    }
    const chunks = []
    let currentRows = []
    const pushChunk = (rows) => {
      if (!rows.length) return
      const continued = chunks.length > 0
      chunks.push({
        raw,
        html: buildAnswerTableHtml(parsed, rows, continued),
        isAnswer: false,
        isQuestion: false,
      })
    }
    for (const row of parsed.bodyRows) {
      const candidate = [...currentRows, row]
      const continued = chunks.length > 0
      const candidateHeight = measureHtmlHeight(buildAnswerTableHtml(parsed, candidate, continued))
      if (currentRows.length > 0 && candidateHeight > bodyBudget) {
        pushChunk(currentRows)
        currentRows = [row]
        continue
      }
      currentRows = candidate
    }
    pushChunk(currentRows)
    return chunks
  }

  const blockMetas = []
  for (const raw of partList) {
    const r = String(raw ?? '').trim()
    if (isSchoolMockAnswerBlock(r)) {
      blockMetas.push(...splitAnswerTableBlockForColumns(r))
      continue
    }
    blockMetas.push({
      raw: r,
      html: blockToHtmlForPdf(r),
      isAnswer: false,
      isQuestion: isSchoolMockQuestionBlock(r),
    })
  }

  const heights = blockMetas.map((meta) => measureHtmlHeight(meta.html))

  const pages = []
  let left = []
  let right = []
  let leftH = 0
  let rightH = 0
  /** 한 페이지의 좌측 단에는 「===== 문항 n」블록을 최대 1개만 (내신 2단 시험지 관례) */
  let leftQuestionSlotUsed = false

  const pushPage = () => {
    if (left.length || right.length) {
      pages.push({ left: [...left], right: [...right] })
    }
    left = []
    right = []
    leftH = 0
    rightH = 0
    leftQuestionSlotUsed = false
  }

  for (let i = 0; i < blockMetas.length; i++) {
    const { html, isQuestion } = blockMetas[i]
    const h = heights[i]

    if (h > bodyBudget) {
      if (left.length || right.length) pushPage()
      left = [html]
      leftH = h
      leftQuestionSlotUsed = isQuestion
      pushPage()
      continue
    }

    if (isQuestion) {
      if (!leftQuestionSlotUsed) {
        if (leftH + h <= bodyBudget) {
          left.push(html)
          leftH += h
          leftQuestionSlotUsed = true
          continue
        }
        if (left.length || right.length) {
          pushPage()
          i--
          continue
        }
      }
      if (rightH + h <= bodyBudget) {
        right.push(html)
        rightH += h
        continue
      }
      pushPage()
      i--
      continue
    }

    if (leftH + h <= bodyBudget) {
      left.push(html)
      leftH += h
      continue
    }
    if (rightH + h <= bodyBudget) {
      right.push(html)
      rightH += h
      continue
    }
    pushPage()
    i--
  }
  pushPage()

  const totalPdfPages = pages.length

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWmm, pageHmm],
  })

  try {
    for (let i = 0; i < pages.length; i++) {
      const { left: L, right: R } = pages[i]
      const pageDom = buildPageDom(i, L, R, totalPdfPages)
      root.appendChild(pageDom)

      await document.fonts.ready.catch(() => {})
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

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
      let imgH = (canvas.height * pageWmm) / canvas.width
      let imgW = pageWmm
      if (imgH > pageHmm) {
        const scale = pageHmm / imgH
        imgH = pageHmm
        imgW = imgW * scale
      }

      if (i > 0) pdf.addPage([pageWmm, pageHmm])
      pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH, undefined, 'FAST')

      root.removeChild(pageDom)
    }
  } finally {
    document.body.removeChild(root)
  }

  const nameSeg = sanitizeFilenamePart(school)
  pdf.save(`${nameSeg}_동형모의_B4_${formatYYMMDD()}.pdf`)
}
