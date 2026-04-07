import { findTopicLabel, passageForMcqDisplay } from './grammarWorkbookUtils.js'
import { isEssayMode, isSingleColumnMode, isWritingMode } from './grammarWorkbookModes.js'

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

function escapeHtml(text) {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatSafeInlineMarkup(text) {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/&lt;(?:b|strong)&gt;([\s\S]*?)&lt;\/(?:b|strong)&gt;/gi, '<strong>$1</strong>')
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, '<u>$1</u>')
}

function formatDisplayHtml(text) {
  return formatSafeInlineMarkup(text).replace(/\n/g, '<br/>')
}

function pad2(n) {
  const x = Number(n) || 0
  return String(x).padStart(2, '0')
}

/** API 보기에 이미 ①~⑤가 붙어 있으면 PDF에서 한 번 더 붙지 않도록 제거 */
function stripLeadingCircledMarks(text) {
  let s = String(text).trimStart()
  const re = /^[①②③④⑤](?:\s|\.|\)|:|：)*/u
  while (re.test(s)) {
    s = s.replace(re, '').trimStart()
  }
  return s.length ? s : ' '
}

const WORKBOOK_WRITE_LINE_COUNT = 5
const ESSAY_WRITE_LINE_COUNT = 10

function renderEssayWritingPadHtml(lineCount = ESSAY_WRITE_LINE_COUNT) {
  const lines = Array.from(
    { length: lineCount },
    () => '<div class="mock-essay-line"></div>'
  ).join('')
  return `<div class="mock-essay-pad" aria-label="답안 작성란">${lines}</div>`
}

/** 시험지 본문 — 정답·해설은 포함하지 않음(해설지 섹션으로 분리) */
function renderQuestionBlockHtml(p, sections, writingMode, essayMode) {
  const no = p.no ?? p.number ?? 0
  const label = findTopicLabel(sections, p.topicId || '')
  const passageRaw = passageForMcqDisplay(p.passage || p.question || '', writingMode)
  const passage = formatDisplayHtml(passageRaw)

  let choicesHtml = ''
  if (!writingMode) {
    const choices = Array.isArray(p.choices) ? p.choices : []
    if (choices.length) {
      const marks = ['①', '②', '③', '④', '⑤']
      const cells = choices
        .slice(0, 5)
        .map((c, i) => {
          const body = formatDisplayHtml(stripLeadingCircledMarks(c))
          return `<div class="mock-choice"><span class="mock-choice-mark">${marks[i]}</span><span class="mock-choice-body">${body}</span></div>`
        })
        .join('')
      choicesHtml = `<div class="mock-choices">${cells}</div>`
    }
  }

  const essayPad = writingMode
    ? renderEssayWritingPadHtml(essayMode ? ESSAY_WRITE_LINE_COUNT : WORKBOOK_WRITE_LINE_COUNT)
    : ''

  return `<article class="mock-q">
    <div class="mock-q-head">
      <span class="mock-q-num">${pad2(no)}</span>
      <span class="mock-q-label">${escapeHtml(label)}</span>
    </div>
    <div class="mock-passage">${passage || ' '}</div>
    ${choicesHtml}
    ${essayPad}
  </article>`
}

function renderAnswerSheetHeaderHtml() {
  return `<article class="mock-q mock-answer-banner">
    <h2 class="mock-answer-title">해설지</h2>
    <p class="mock-answer-sub">정답 · 해설 · 서술형 모범 답안 (문항 번호 순)</p>
  </article>`
}

/** 객관식 정답 번호(0~4) — 저장 필드명 제각각 대응 */
function getAnswerChoiceIndex(p) {
  const raw =
    p.correctIndex ??
    p.answerIndex ??
    p.correctAnswerIndex ??
    p.correct_answer_index
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 4) return null
  return n
}

function getModelAnswerText(p) {
  if (p.modelAnswer != null && String(p.modelAnswer).trim()) return String(p.modelAnswer)
  if (p.model_answer != null && String(p.model_answer).trim()) return String(p.model_answer)
  return ''
}

/** 해설지용 — 문항별 정답·해설만 */
function renderAnswerBlockHtml(p, sections, writingMode) {
  const no = p.no ?? p.number ?? 0
  const label = findTopicLabel(sections, p.topicId || '')
  let body = ''
  const idx = getAnswerChoiceIndex(p)
  if (!writingMode && idx != null) {
    const mark = ['①', '②', '③', '④', '⑤'][idx]
    body += `<div class="mock-answer">정답: ${mark}</div>`
  } else if (!writingMode && Array.isArray(p.choices) && p.choices.length > 0) {
    body += `<div class="mock-answer mock-answer-missing">정답: (저장된 번호 없음 — 문제를 다시 생성하거나 JSON에 correctIndex를 확인하세요)</div>`
  }
  const expl = p.explanation != null ? String(p.explanation).trim() : ''
  if (expl) {
    body += `<div class="mock-expl">${formatDisplayHtml(expl)}</div>`
  }
  const modelAns = getModelAnswerText(p)
  if (writingMode && modelAns) {
    body += `<div class="mock-model"><strong>【모범 답안 예시】</strong><br/>${formatDisplayHtml(modelAns)}</div>`
  } else if (writingMode) {
    body += `<div class="mock-model mock-answer-missing">【모범 답안 예시】 저장값 없음</div>`
  }
  if (!body.trim()) return ''
  return `<article class="mock-q mock-q-answer">
    <div class="mock-q-head">
      <span class="mock-q-num">${pad2(no)}</span>
      <span class="mock-q-label">해설 — ${escapeHtml(label)}</span>
    </div>
    ${body}
  </article>`
}

const MOCK_EXAM_CSS = `
.mock-pdf-root, .mock-pdf-root * { box-sizing: border-box; }
.mock-pdf-root {
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  color: #0f172a;
  -webkit-font-smoothing: antialiased;
}
.mock-pdf-page {
  width: 210mm;
  min-height: 297mm;
  padding: 10mm 11mm 12mm;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.mock-header {
  display: flex;
  align-items: stretch;
  gap: 3mm;
  margin-bottom: 5mm;
  flex-shrink: 0;
}
.mock-badge {
  background: linear-gradient(160deg, #14b8a6 0%, #0d9488 55%, #0f766e 100%);
  color: #fff;
  padding: 2.5mm 4mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-width: 22mm;
  border-radius: 1mm;
}
.mock-badge-sub {
  font-size: 6pt;
  letter-spacing: 0.12em;
  font-weight: 700;
  opacity: 0.95;
}
.mock-badge-num {
  font-size: 22pt;
  font-weight: 800;
  line-height: 1;
  margin-top: 1mm;
}
.mock-title-box {
  flex: 1;
  border: 2px solid #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14pt;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.mock-time {
  font-size: 9pt;
  color: #334155;
  display: flex;
  align-items: center;
  padding: 0 3mm;
  white-space: nowrap;
}
.mock-time::before {
  content: "⏱";
  margin-right: 1.5mm;
  font-size: 11pt;
}
.mock-body-columns {
  display: flex;
  align-items: flex-start;
  gap: 0;
  flex: 1 1 auto;
  min-height: 220mm;
}
.mock-pdf-page-single .mock-body-columns {
  display: block;
}
.mock-col {
  flex: 1;
  width: 0;
  min-width: 0;
}
.mock-pdf-page-single .mock-col {
  width: 100%;
}
.mock-gutter {
  width: 1px;
  align-self: stretch;
  background: #cbd5e1;
  flex-shrink: 0;
  margin: 0 3.5mm;
}
.mock-pdf-page-single .mock-gutter {
  display: none;
}
.mock-footer {
  margin-top: auto;
  padding-top: 3mm;
  border-top: 1px solid #e2e8f0;
  font-size: 8.5pt;
  color: #64748b;
  flex-shrink: 0;
}
.mock-footer strong {
  color: #0f172a;
  margin-right: 2mm;
}
.mock-q {
  margin-bottom: 4mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.mock-q-head {
  display: flex;
  align-items: baseline;
  gap: 2mm;
  margin-bottom: 1.5mm;
}
.mock-q-num {
  font-size: 16pt;
  font-weight: 800;
  color: #0d9488;
  line-height: 1;
}
.mock-q-label {
  font-size: 7.5pt;
  color: #64748b;
  line-height: 1.3;
  flex: 1;
}
.mock-passage {
  border: 1px solid #cbd5e1;
  border-radius: 1mm;
  padding: 2.5mm 3mm;
  font-size: 9.5pt;
  line-height: 1.55;
  margin-bottom: 2mm;
  background: #fafafa;
}
.mock-choices {
  display: flex;
  flex-direction: column;
  gap: 1.2mm;
  font-size: 9pt;
  line-height: 1.45;
  width: 100%;
}
.mock-choice {
  display: flex;
  align-items: flex-start;
  gap: 1.5mm;
  width: 100%;
}
.mock-choice-mark {
  flex-shrink: 0;
  line-height: 1.45;
}
.mock-choice-body {
  flex: 1;
  min-width: 0;
  line-height: 1.45;
}
.mock-essay-pad {
  margin-top: 2mm;
  width: 100%;
}
.mock-essay-line {
  min-height: 6.5mm;
  border-bottom: 1px solid #94a3b8;
  box-sizing: border-box;
}
.mock-answer-banner {
  border: 2px solid #0d9488;
  border-radius: 1.5mm;
  padding: 3mm 3.5mm;
  background: linear-gradient(180deg, #ecfdf5 0%, #f0fdfa 100%);
  margin-bottom: 5mm;
  break-before: page;
  page-break-before: always;
}
.mock-answer-title {
  margin: 0 0 1mm 0;
  font-size: 13pt;
  font-weight: 800;
  color: #0f766e;
  letter-spacing: -0.02em;
}
.mock-answer-sub {
  margin: 0;
  font-size: 8pt;
  color: #64748b;
}
.mock-q-answer .mock-q-num {
  font-size: 13pt;
}
.mock-answer {
  margin-top: 1.5mm;
  font-size: 8.5pt;
  font-weight: 700;
  color: #b45309;
}
.mock-expl, .mock-model {
  margin-top: 1.5mm;
  font-size: 8pt;
  color: #475569;
  line-height: 1.45;
}
.mock-answer-missing {
  color: #b91c1c;
  font-weight: 600;
}
.mock-measure-shell {
  position: absolute;
  left: -9999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  width: 210mm;
}
.mock-measure-col {
  width: calc((210mm - 22mm - 7mm) / 2);
}
.mock-pdf-root[data-single-column="1"] .mock-measure-col {
  width: calc(210mm - 22mm);
}
`

function formatBadgeNumber(testNumber) {
  const t = String(testNumber ?? '01').trim()
  if (/^\d{1,2}$/.test(t)) return t.padStart(2, '0')
  const digits = t.replace(/\D/g, '') || '1'
  const n = Math.min(99, Math.max(1, parseInt(digits.slice(0, 2), 10) || 1))
  return String(n).padStart(2, '0')
}

/** PDF 저장명용: 보듬교육_문법test_{주제}_YYMMDD */
function formatPdfSaveDateYYMMDD(d = new Date()) {
  const y = String(d.getFullYear()).slice(-2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function sanitizeGrammarLabelForFilename(label, maxLen = 48) {
  let s = String(label ?? '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '')
  if (!s) s = '문법'
  return s.slice(0, maxLen)
}

/**
 * @param {object} opts
 * @param {object[]} opts.problems
 * @param {object[]} opts.sections
 * @param {string} opts.modeId
 * @param {string} [opts.testNumber]
 * @param {string} [opts.title]
 * @param {string} [opts.timeLimit]
 * @param {string} [opts.footerLabel]
 * @param {string} [opts.grammarLabel]
 */
export async function exportGrammarWorkbookMockExamPdf(opts) {
  const {
    problems,
    sections,
    modeId,
    testNumber = '01',
    title = '보듬교육 문법 TEST',
    timeLimit = '제한 시간 : 30분',
    footerLabel = '보듬교육 문법 TEST',
    grammarLabel = '문법',
  } = opts

  if (!Array.isArray(problems) || problems.length === 0) {
    throw new Error('PDF로보낼 문항이 없습니다. 먼저 문제를 생성해 주세요.')
  }

  await loadPdfLibraries()

  const blocksHtml = problems.map((p) => {
    const itemModeId = p.grammarWorkbookModeId || modeId
    return renderQuestionBlockHtml(
      p,
      sections,
      isWritingMode(itemModeId),
      isEssayMode(itemModeId)
    )
  })
  const answerBlocks = [
    renderAnswerSheetHeaderHtml(),
    ...problems.map((p) =>
      renderAnswerBlockHtml(p, sections, isWritingMode(p.grammarWorkbookModeId || modeId))
    ),
  ].filter((html) => html != null && String(html).trim() !== '')
  const allBlocks = [...blocksHtml, ...answerBlocks]
  /** 해설지(answerBlocks)는 항상 새 PDF 페이지부터 (문항 본문과 같은 페이지에 붙지 않음) */
  const answerStartIndex = blocksHtml.length
  const badgeDisplay = formatBadgeNumber(testNumber)
  const singleColumnLayout = problems.every((p) => isSingleColumnMode(p.grammarWorkbookModeId || modeId))

  const root = document.createElement('div')
  root.className = 'mock-pdf-root'
  root.setAttribute('data-grammar-mock-pdf', '1')
  if (singleColumnLayout) root.setAttribute('data-single-column', '1')

  const styleEl = document.createElement('style')
  styleEl.textContent = MOCK_EXAM_CSS
  root.appendChild(styleEl)

  const measureShell = document.createElement('div')
  measureShell.className = 'mock-measure-shell'
  root.appendChild(measureShell)

  document.body.appendChild(root)

  const buildPageDom = (pageIndex, leftHtml, rightHtml) => {
    const page = document.createElement('div')
    page.className = 'mock-pdf-page'
    if (singleColumnLayout) page.classList.add('mock-pdf-page-single')
    page.innerHTML = `
      <header class="mock-header">
        <div class="mock-badge">
          <span class="mock-badge-sub">ACTUAL TEST</span>
          <span class="mock-badge-num">${escapeHtml(badgeDisplay)}</span>
        </div>
        <div class="mock-title-box">${escapeHtml(title)}</div>
        <div class="mock-time">${escapeHtml(timeLimit)}</div>
      </header>
      <div class="mock-body-columns">
        <div class="mock-col">${leftHtml.join('')}</div>
        ${singleColumnLayout ? '' : '<div class="mock-gutter"></div><div class="mock-col">' + rightHtml.join('') + '</div>'}
      </div>
      <footer class="mock-footer"><strong>${pageIndex + 1}</strong> ${escapeHtml(footerLabel)}</footer>
    `
    return page
  }

  const gapPx = 16
  const heights = allBlocks.map((html) => {
    const col = document.createElement('div')
    col.className = 'mock-measure-col'
    col.innerHTML = html
    measureShell.appendChild(col)
    const h = col.offsetHeight
    measureShell.removeChild(col)
    return h + gapPx
  })

  const probePage = buildPageDom(0, [], [])
  probePage.style.visibility = 'hidden'
  root.appendChild(probePage)
  const bodyCol = probePage.querySelector('.mock-body-columns')
  let bodyBudget = bodyCol ? bodyCol.clientHeight - 48 : 900
  if (bodyBudget < 320) bodyBudget = 900
  root.removeChild(probePage)

  const pages = []
  let left = []
  let right = []
  let leftH = 0
  let rightH = 0

  const pushPage = () => {
    if (left.length || right.length) {
      pages.push({ left: [...left], right: [...right] })
    }
    left = []
    right = []
    leftH = 0
    rightH = 0
  }

  for (let i = 0; i < allBlocks.length; i++) {
    if (i === answerStartIndex) {
      pushPage()
    }
    const html = allBlocks[i]
    const h = heights[i]

    if (h > bodyBudget) {
      if (left.length || right.length) pushPage()
      left = [html]
      leftH = h
      pushPage()
      continue
    }

    if (leftH + h <= bodyBudget) {
      left.push(html)
      leftH += h
      continue
    }
    if (!singleColumnLayout && rightH + h <= bodyBudget) {
      right.push(html)
      rightH += h
      continue
    }
    pushPage()
    left.push(html)
    leftH = h
  }
  pushPage()

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidthMm = 210
  const pageHeightMm = 297

  try {
    for (let i = 0; i < pages.length; i++) {
      const { left: L, right: R } = pages[i]
      const pageDom = buildPageDom(i, L, R)
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
      let imgH = (canvas.height * pageWidthMm) / canvas.width
      let imgW = pageWidthMm
      if (imgH > pageHeightMm) {
        const scale = pageHeightMm / imgH
        imgH = pageHeightMm
        imgW = imgW * scale
      }

      if (i > 0) pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH, undefined, 'FAST')

      root.removeChild(pageDom)
    }
  } finally {
    document.body.removeChild(root)
  }

  const topicSeg = sanitizeGrammarLabelForFilename(grammarLabel)
  const dateSeg = formatPdfSaveDateYYMMDD()
  pdf.save(`보듬교육_문법test_${topicSeg}_${dateSeg}.pdf`)
}
