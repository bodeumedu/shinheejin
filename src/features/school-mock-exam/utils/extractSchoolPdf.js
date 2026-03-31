import * as pdfjsLib from 'pdfjs-dist'

let workerConfigured = false

function ensureWorker() {
  if (!workerConfigured) {
    const v = pdfjsLib.version || '4.10.38'
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`
    workerConfigured = true
  }
}

/**
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function readFileArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('파일 읽기 실패'))
    r.readAsArrayBuffer(file)
  })
}

/**
 * PDF에서 페이지별 텍스트 추출
 * @param {ArrayBuffer} data
 * @param {string} fileName
 */
export async function extractPdfTextByPage(data, fileName = '') {
  ensureWorker()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
  const pageCount = pdf.numPages
  const pages = []
  let fullText = ''
  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const strings = tc.items.map((it) => ('str' in it ? it.str : '')).filter(Boolean)
    const text = strings.join(' ').replace(/\s+/g, ' ').trim()
    pages.push({ page: p, text })
    if (text) fullText += `\n\n--- PDF ${fileName} p.${p} ---\n${text}`
  }
  return { fileName, pageCount, pages, fullText: fullText.trim() }
}

/**
 * @param {ArrayBuffer} data
 * @param {{ maxPages?: number, scale?: number, jpegQuality?: number }} opts
 */
export async function renderPdfPagesToJpegDataUrls(data, opts = {}) {
  ensureWorker()
  const maxPages = Math.min(99, Math.max(1, opts.maxPages ?? 14))
  const scale = opts.scale ?? 1.35
  const jpegQuality = opts.jpegQuality ?? 0.68

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
  const n = Math.min(pdf.numPages, maxPages)
  const images = []

  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) break
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality)
    images.push({ page: p, dataUrl })
  }

  return { pageCount: pdf.numPages, images }
}

/**
 * @param {File} file
 */
export async function extractPdfTextFromFile(file) {
  const buf = await readFileArrayBuffer(file)
  return extractPdfTextByPage(buf, file.name || 'upload.pdf')
}

/**
 * @param {File} file
 * @param {object} [renderOpts]
 */
export async function renderPdfFileToImages(file, renderOpts) {
  const buf = await readFileArrayBuffer(file)
  return renderPdfPagesToJpegDataUrls(buf, renderOpts)
}

const PT_TO_MM = 25.4 / 72

/**
 * 기출 PDF 첫 페이지 크기(mm) — 생성 PDF 레이아웃·안내에 참고
 * @param {File} file
 * @returns {Promise<{ widthMm: number, heightMm: number, widthPt: number, heightPt: number, pageCount: number }>}
 */
export async function getPdfFirstPageSizeMm(file) {
  const buf = await readFileArrayBuffer(file)
  ensureWorker()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
  const page = await pdf.getPage(1)
  const vp = page.getViewport({ scale: 1 })
  const widthPt = vp.width
  const heightPt = vp.height
  return {
    widthMm: Math.round(widthPt * PT_TO_MM * 100) / 100,
    heightMm: Math.round(heightPt * PT_TO_MM * 100) / 100,
    widthPt,
    heightPt,
    pageCount: pdf.numPages,
  }
}
