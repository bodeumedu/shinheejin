// 영영 단어장 / 테스트 시험지 A4 PDF

import { flattenVocabularyForTest } from './englishEnglishWordTestUtils'

let jsPDF, html2canvas

async function loadPdfLibraries() {
  if (!jsPDF) {
    const m = await import('jspdf')
    jsPDF = m.default
  }
  if (!html2canvas) {
    const m = await import('html2canvas')
    html2canvas = m.default
  }
}

/** px 높이의 캔버스 조각 → mm 높이 (너비는 contentWidthMm 고정) */
function canvasSliceToMmHeight(sliceHeightPx, canvasWidthPx, contentWidthMm) {
  return (sliceHeightPx / canvasWidthPx) * contentWidthMm
}

/**
 * 캔버스를 A4 세로 여러 페이지에 걸쳐 그림 (첫 페이지는 pdf에 이미 있을 수 있음 → append만)
 */
function addCanvasToPdf(pdf, canvas, marginMm, isFirstChunk) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - marginMm * 2
  const contentHeight = pageHeight - marginMm * 2

  const imgWidthMm = contentWidth
  const imgHeightMm = (canvas.height / canvas.width) * imgWidthMm

  let yPx = 0
  let first = isFirstChunk

  while (yPx < canvas.height) {
    if (!first) {
      pdf.addPage()
    }
    first = false

    const sliceHeightPx = Math.min(
      Math.max(1, Math.ceil((contentHeight / imgHeightMm) * canvas.height)),
      canvas.height - yPx
    )

    const sub = document.createElement('canvas')
    sub.width = canvas.width
    sub.height = sliceHeightPx
    const ctx = sub.getContext('2d')
    ctx.drawImage(canvas, 0, yPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

    const sliceHeightMm = canvasSliceToMmHeight(sliceHeightPx, canvas.width, imgWidthMm)
    const imgData = sub.toDataURL('image/png', 1.0)
    pdf.addImage(imgData, 'PNG', marginMm, marginMm, imgWidthMm, sliceHeightMm)

    yPx += sliceHeightPx
  }
}

async function elementToPdfA4(element, filename) {
  await loadPdfLibraries()
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })

  addCanvasToPdf(pdf, canvas, margin, true)
  pdf.save(filename)
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 표 PDF용 — 스킨케어 비교표 느낌의 파스텔 핑크 톤 */
const EE_PDF = {
  primary: '#D98C9B',
  secondary: '#F4B3C2',
  pageBg: '#FFF3F5',
  text: '#5c3d45',
  white: '#ffffff',
}

function buildVocabularyTableElement(vocabularyTable) {
  const { primary, secondary, pageBg, text, white } = EE_PDF

  const wrap = document.createElement('div')
  wrap.style.cssText = `width:794px;box-sizing:border-box;padding:28px 26px 32px;background:${pageBg};font-family:'Malgun Gothic','Apple SD Gothic Neo',Montserrat,Segoe UI,sans-serif;font-size:13px;color:${text};line-height:1.5;-webkit-font-smoothing:antialiased;`

  const head = document.createElement('div')
  head.style.cssText = 'text-align:center;margin:0 0 22px;'
  head.innerHTML = `
    <div style="margin-bottom:6px;">
      <span style="font-family:'Segoe Script','Brush Script MT',cursive;font-size:34px;color:${primary};letter-spacing:0.04em;">영영</span>
      <span style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:20px;font-weight:800;color:${text};margin-left:6px;letter-spacing:0.12em;">단어장</span>
    </div>
    <div style="font-size:11px;font-weight:700;letter-spacing:0.35em;color:${text};opacity:0.85;text-transform:uppercase;">VOCABULARY SHEET</div>
  `
  wrap.appendChild(head)

  if (!vocabularyTable) {
    const p = document.createElement('p')
    p.textContent = '내용 없음'
    p.style.cssText = `text-align:center;color:${text};opacity:0.75;`
    wrap.appendChild(p)
    return wrap
  }

  const thBase = `background:${primary};color:#fff;font-weight:700;padding:14px 12px;text-align:center;border-radius:12px;border:2px solid ${primary};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;box-shadow:0 1px 0 rgba(255,255,255,0.35) inset;`
  const tdTitle = `background:${secondary};color:${text};font-weight:700;padding:14px 10px;text-align:center;vertical-align:middle;border-radius:12px;border:2px solid ${primary};writing-mode:vertical-rl;text-orientation:mixed;`
  const tdWord = `background:${white};color:${text};padding:12px 14px;text-align:center;font-weight:600;border-radius:10px;border:2px solid ${primary};`
  const tdDef = `background:${white};color:${text};padding:12px 14px;text-align:left;border-radius:10px;border:2px solid ${primary};line-height:1.55;`

  const table = document.createElement('table')
  table.style.cssText = `width:100%;border-collapse:separate;border-spacing:10px;table-layout:fixed;background:transparent;`

  if (vocabularyTable.mode === 'passages') {
    const thead = document.createElement('thead')
    thead.innerHTML =
      `<tr><th style="${thBase}width:15%;">제목</th>` +
      `<th style="${thBase}width:22%;">단어</th>` +
      `<th style="${thBase}">영영 뜻</th></tr>`
    table.appendChild(thead)
    const tbody = document.createElement('tbody')
    for (const p of vocabularyTable.passages || []) {
      const entries = p.entries || []
      const title = escapeHtml(p.title || '—')
      if (!entries.length) {
        const tr = document.createElement('tr')
        tr.innerHTML = `<td style="${tdTitle}">` + title + `</td><td style="${tdWord}">—</td><td style="${tdDef}">(항목 없음)</td>`
        tbody.appendChild(tr)
        continue
      }
      entries.forEach((e, ri) => {
        const tr = document.createElement('tr')
        const titleCell =
          ri === 0 ? `<td rowspan="${entries.length}" style="${tdTitle}">` + title + `</td>` : ''
        tr.innerHTML =
          titleCell +
          `<td style="${tdWord}">${escapeHtml(e.word)}</td>` +
          `<td style="${tdDef}">${escapeHtml(e.definition)}</td>`
        tbody.appendChild(tr)
      })
    }
    table.appendChild(tbody)
  } else if (vocabularyTable.mode === 'words') {
    const thead = document.createElement('thead')
    thead.innerHTML =
      `<tr><th style="${thBase}width:30%;">단어</th>` + `<th style="${thBase}">영영 뜻</th></tr>`
    table.appendChild(thead)
    const tbody = document.createElement('tbody')
    for (const e of vocabularyTable.entries || []) {
      const tr = document.createElement('tr')
      tr.innerHTML =
        `<td style="${tdWord}">${escapeHtml(e.word)}</td>` + `<td style="${tdDef}">${escapeHtml(e.definition)}</td>`
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
  }

  wrap.appendChild(table)
  return wrap
}

function buildTestQuestionElement(rows) {
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'width:794px;box-sizing:border-box;padding:20px 28px;background:#fff;font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;font-size:13px;color:#111;line-height:1.55;'

  wrap.innerHTML = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;text-align:center;border-bottom:2px solid #000;padding-bottom:12px;">영영 단어 테스트</h1>
    <p style="margin:0 0 16px;font-size:13px;">이름: ${'&nbsp;'.repeat(40)} &nbsp; 번호: ${'&nbsp;'.repeat(24)}</p>
    <p style="margin:0 0 18px;font-size:12.5px;color:#333;">아래 영영 뜻을 읽고, 빈칸에 알맞은 단어(또는 표현)를 <strong>영어</strong>로 쓰시오.</p>
  `

  const body = document.createElement('div')
  body.style.cssText = 'margin:0;padding:0;'

  let prevTitle = null
  rows.forEach((row) => {
    if (row.passageTitle && row.passageTitle !== prevTitle) {
      const div = document.createElement('div')
      div.style.cssText =
        'margin:18px 0 10px 0;padding:8px 10px;background:#f0f4f8;border-left:4px solid #3498db;font-weight:700;font-size:13px;'
      div.textContent = row.passageTitle
      body.appendChild(div)
      prevTitle = row.passageTitle
    }
    const block = document.createElement('div')
    block.style.cssText = 'margin-bottom:20px;padding-left:4px;'
    block.innerHTML = `
      <div style="margin-bottom:6px;"><strong>${row.num}.</strong> ${escapeHtml(row.definition)}</div>
      <div style="margin-left:1.2em;font-size:12.5px;">단어: _____________________________________________________________________________</div>
    `
    body.appendChild(block)
  })

  wrap.appendChild(body)
  return wrap
}

function buildTestAnswerElement(rows) {
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'width:794px;box-sizing:border-box;padding:24px 28px;background:#fff;font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;font-size:13px;color:#111;line-height:1.6;'

  const h = document.createElement('h2')
  h.textContent = '정답'
  h.style.cssText = 'margin:0 0 16px;font-size:17px;font-weight:700;text-align:center;border-bottom:2px solid #c0392b;padding-bottom:10px;color:#922b21;'
  wrap.appendChild(h)

  const ol = document.createElement('ol')
  ol.style.cssText = 'margin:0;padding-left:22px;'
  rows.forEach((row) => {
    const li = document.createElement('li')
    li.style.cssText = 'margin-bottom:10px;'
    li.innerHTML = `<strong>${row.num}.</strong> ${escapeHtml(row.answer || '(없음)')}`
    ol.appendChild(li)
  })
  wrap.appendChild(ol)
  return wrap
}

export async function exportVocabularyTablePdf(vocabularyTable) {
  const el = buildVocabularyTableElement(vocabularyTable)
  el.style.position = 'fixed'
  el.style.left = '-10000px'
  el.style.top = '0'
  document.body.appendChild(el)
  try {
    await elementToPdfA4(el, '영영단어장_A4.pdf')
  } finally {
    document.body.removeChild(el)
  }
}

export async function exportEnglishTestPdf(vocabularyTable) {
  await loadPdfLibraries()
  const rows = flattenVocabularyForTest(vocabularyTable)
    .filter((r) => r.definition)
    .map((r, i) => ({ ...r, num: i + 1 }))

  if (!rows.length) {
    throw new Error('PDF로 만들 항목이 없습니다. 영영 뜻이 있는 줄을 한 개 이상 넣어 주세요.')
  }

  const qEl = buildTestQuestionElement(rows)
  const aEl = buildTestAnswerElement(rows)
  qEl.style.position = 'fixed'
  qEl.style.left = '-10000px'
  qEl.style.top = '0'
  aEl.style.position = 'fixed'
  aEl.style.left = '-10000px'
  aEl.style.top = '0'
  document.body.appendChild(qEl)
  document.body.appendChild(aEl)

  try {
    const canvasQ = await html2canvas(qEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: qEl.scrollWidth,
      windowHeight: qEl.scrollHeight,
    })
    const canvasA = await html2canvas(aEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: aEl.scrollWidth,
      windowHeight: aEl.scrollHeight,
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const margin = 14
    addCanvasToPdf(pdf, canvasQ, margin, true)
    pdf.addPage()
    addCanvasToPdf(pdf, canvasA, margin, true)
    pdf.save('영영단어_테스트_A4.pdf')
  } finally {
    document.body.removeChild(qEl)
    document.body.removeChild(aEl)
  }
}
