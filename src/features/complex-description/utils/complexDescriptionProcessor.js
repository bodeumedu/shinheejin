import { findKeySentence, findComplexSentence, findDifficultWords, translateSentence } from './complexDescriptionAnalyzer'

function replaceArticleSpace(sentence) {
  let result = sentence.replace(/\b(a|an|the)\s+([a-zA-Z])/g, '$1++$2')
  const conjunctions = [
    'and', 'or', 'but', 'so', 'because', 'although', 'if', 'when', 'while',
    'since', 'until', 'before', 'after', 'that', 'which', 'who', 'where',
    'how', 'why', 'what', 'whether', 'as', 'than', 'though', 'once', 'unless',
    'whenever', 'therefore', 'thus', 'hence', 'consequently', 'accordingly',
    'furthermore', 'moreover', 'additionally', 'besides', 'also', 'too',
    'even though', 'in order that', 'so that', 'such that', 'now that',
    'as long as', 'as soon as', 'provided that'
  ]
  const sorted = conjunctions.sort((a, b) => b.length - a.length)
  for (const conj of sorted) {
    const escaped = conj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\s+([a-zA-Z])`, 'gi')
    result = result.replace(regex, `${conj}++$1`)
  }
  return result
}

function findSentencePosition(text, sentence) {
  let index = text.indexOf(sentence)
  if (index === -1) {
    index = text.toLowerCase().indexOf(sentence.toLowerCase())
  }
  if (index === -1) return null

  let start = index
  while (start > 0 && text[start - 1] !== '.' && text[start - 1] !== '!' && text[start - 1] !== '?' && text[start - 1] !== '\n') {
    start--
  }
  let end = index + sentence.length
  if (end < text.length && text[end - 1] !== '.') {
    const periodIndex = text.indexOf('.', index)
    if (periodIndex !== -1) end = periodIndex + 1
  }
  return { start, end }
}

export async function processSingleText(englishText, apiKey) {
  let keySentence = await findKeySentence(englishText, apiKey)
  let keyPos = findSentencePosition(englishText, keySentence)

  if (!keyPos) {
    const sentences = englishText.match(/[^.!?]+[.!?]+/g) || []
    if (sentences.length > 0) {
      keySentence = sentences[0].trim()
      keyPos = findSentencePosition(englishText, keySentence)
    }
    if (!keyPos) {
      const firstSentenceMatch = englishText.match(/^[^.!?\n]+[.!?]+/)
      if (firstSentenceMatch) {
        keySentence = firstSentenceMatch[0].trim()
        keyPos = { start: 0, end: firstSentenceMatch[0].length }
      } else {
        throw new Error('처리할 수 있는 문장을 찾을 수 없습니다.')
      }
    }
  }

  let processed = englishText

  const keySentenceText = processed.substring(keyPos.start, keyPos.end)
  const beforeKey = processed.substring(0, keyPos.start)
  const afterKey = processed.substring(keyPos.end)
  const trimmedKey = keySentenceText.trim()
  const firstWordStart = keySentenceText.indexOf(trimmedKey[0])
  const keyWithBrace = keySentenceText.substring(0, firstWordStart) + '{' + keySentenceText.substring(firstWordStart)
  processed = beforeKey + keyWithBrace + afterKey

  const braceIndex = processed.indexOf('{', keyPos.start)
  const periodInBrace = processed.indexOf('.', braceIndex)
  if (periodInBrace !== -1) {
    const sentenceInBrace = processed.substring(braceIndex + 1, periodInBrace + 1)
    const replacedSentence = replaceArticleSpace(sentenceInBrace)
    processed = processed.substring(0, braceIndex + 1) + replacedSentence + processed.substring(periodInBrace + 1)
  }

  const periodAfterBrace = processed.indexOf('.', braceIndex)
  if (periodAfterBrace !== -1) {
    processed = processed.substring(0, periodAfterBrace + 1) + '/' + processed.substring(periodAfterBrace + 1)
  }

  const firstSlashIndex = processed.indexOf('/', braceIndex)
  if (firstSlashIndex !== -1) {
    const originalSentence = keySentenceText.trim()
    processed = processed.substring(0, firstSlashIndex + 1) + originalSentence + processed.substring(firstSlashIndex + 1)
  }

  const copiedPeriodIndex = processed.indexOf('.', firstSlashIndex + 1)
  if (copiedPeriodIndex !== -1) {
    const afterPeriod = processed.substring(copiedPeriodIndex + 1)
    if (!afterPeriod.trim().startsWith('/')) {
      processed = processed.substring(0, copiedPeriodIndex + 1) + '/' + afterPeriod
    }
  }

  if (copiedPeriodIndex !== -1) {
    const secondSlashAfterCopy = processed.indexOf('/', copiedPeriodIndex + 1)
    if (secondSlashAfterCopy !== -1) {
      const copiedSentenceForTranslation = processed.substring(firstSlashIndex + 1, copiedPeriodIndex + 1)
      const koreanTranslation = await translateSentence(copiedSentenceForTranslation.trim(), apiKey)
      processed = processed.substring(0, secondSlashAfterCopy + 1) + koreanTranslation + processed.substring(secondSlashAfterCopy + 1)
    }

    const koreanSlashIndex = processed.indexOf('/', copiedPeriodIndex + 1)
    if (koreanSlashIndex !== -1) {
      const koreanPeriodIndex = processed.indexOf('.', koreanSlashIndex)
      if (koreanPeriodIndex !== -1) {
        const afterKorean = processed.substring(koreanPeriodIndex + 1)
        if (!afterKorean.trim().startsWith('}')) {
          processed = processed.substring(0, koreanPeriodIndex + 1) + '}' + afterKorean
        }
      }
    }
  }

  const braceStart = processed.indexOf('{')
  const braceEnd = processed.indexOf('}', braceStart)
  const excludeRanges = [{ start: braceStart, end: braceEnd }]

  const complexSentence = await findComplexSentence(englishText, excludeRanges, apiKey)
  const complexPos = findSentencePosition(processed, complexSentence)

  if (complexPos) {
    const isInBrace = complexPos.start >= braceStart && complexPos.end <= braceEnd
    if (!isInBrace) {
      const complexSentenceText = processed.substring(complexPos.start, complexPos.end)
      let beforeComplex = processed.substring(0, complexPos.start)
      const afterComplex = processed.substring(complexPos.end)
      if (beforeComplex.trim().endsWith('.')) beforeComplex = beforeComplex.trim() + ' '
      const complexPeriodIndex = complexSentenceText.lastIndexOf('.')
      if (complexPeriodIndex !== -1) {
        const beforePeriod = complexSentenceText.substring(0, complexPeriodIndex + 1)
        const afterPeriod = complexSentenceText.substring(complexPeriodIndex + 1)
        processed = beforeComplex + '[' + beforePeriod.trim() + ']' + afterPeriod + afterComplex
      }
    }
  }

  const bracketStart = processed.indexOf('[')
  const bracketEnd = processed.indexOf(']', bracketStart)
  const updatedExcludeRanges = [...excludeRanges]
  if (bracketStart !== -1 && bracketEnd !== -1) {
    updatedExcludeRanges.push({ start: bracketStart, end: bracketEnd + 1 })
  }

  const finalBraceStart = processed.indexOf('{')
  const finalBraceEnd = processed.indexOf('}', finalBraceStart)
  if (finalBraceStart !== -1 && finalBraceEnd !== -1) {
    updatedExcludeRanges[0] = { start: finalBraceStart, end: finalBraceEnd + 1 }
  }

  const difficultWords = await findDifficultWords(processed, updatedExcludeRanges, apiKey)
  const sortedWords = []
  for (const wordInfo of difficultWords) {
    let searchIndex = 0
    while (true) {
      const wordIndex = processed.indexOf(wordInfo.word, searchIndex)
      if (wordIndex === -1) break
      let isExcluded = false
      for (const range of updatedExcludeRanges) {
        if (wordIndex >= range.start && wordIndex + wordInfo.word.length <= range.end) {
          isExcluded = true
          break
        }
      }
      if (!isExcluded) {
        sortedWords.push({ ...wordInfo, index: wordIndex })
        break
      }
      searchIndex = wordIndex + 1
    }
  }
  sortedWords.sort((a, b) => b.index - a.index)

  for (const wordInfo of sortedWords) {
    const beforeWord = processed.substring(0, wordInfo.index)
    const afterWord = processed.substring(wordInfo.index + wordInfo.word.length)
    processed = beforeWord + '<' + wordInfo.korean + '/' + wordInfo.word + '>' + afterWord
  }

  return processed
}

export async function processAllTexts(inputText, apiKey) {
  const textBlocks = []
  let currentBlock = ''

  for (let i = 0; i < inputText.length; i++) {
    const char = inputText[i]
    const nextChar = inputText[i + 1]
    if (char === '/' && nextChar === '/') {
      textBlocks.push(currentBlock)
      currentBlock = ''
      i++
    } else {
      currentBlock += char
    }
  }
  if (currentBlock.trim().length > 0) textBlocks.push(currentBlock)

  const results = []

  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i]
    const parts = []
    let currentPart = ''
    for (let j = 0; j < block.length; j++) {
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
    if (currentPart.length > 0) parts.push(currentPart)

    const source = parts[0] || ''
    const englishText = parts[1] || ''

    if (!englishText.trim()) {
      console.warn(`지문 ${i + 1}: 영어원문이 없어 건너뜁니다.`)
      continue
    }

    try {
      const processedEnglish = await processSingleText(englishText, apiKey)
      const firstSlashIndex = block.indexOf('/')
      const afterFirstSlash = block.substring(firstSlashIndex + 1)
      const secondSlashIndex = afterFirstSlash.indexOf('/')

      if (secondSlashIndex !== -1) {
        const englishStart = firstSlashIndex + 1
        let beforeEnglish = block.substring(0, englishStart)
        const afterEnglish = block.substring(firstSlashIndex + 1 + secondSlashIndex)
        if (!beforeEnglish.endsWith('\n') && !beforeEnglish.endsWith('/\n')) {
          if (beforeEnglish.endsWith('/')) beforeEnglish = beforeEnglish + '\n'
        }
        results.push({
          source: source.trim(),
          original: englishText,
          processed: beforeEnglish + processedEnglish + afterEnglish,
          originalBlock: block
        })
      } else {
        results.push({
          source: source.trim(),
          original: englishText,
          processed: block.substring(0, firstSlashIndex + 1) + processedEnglish,
          originalBlock: block
        })
      }
    } catch (error) {
      console.error(`지문 ${i + 1} 처리 중 오류:`, error)
      results.push({
        source: source.trim(),
        original: englishText,
        processed: `[오류: ${error.message}]`,
        error: error.message,
        originalBlock: block
      })
    }
  }

  const finalProcessed = results.map((r) => {
    let processedBlock = r.processed
    processedBlock = processedBlock.replace(/\n+$/, '')
    processedBlock = processedBlock + '\n//'
    return processedBlock
  }).join('')

  return { original: inputText, processed: finalProcessed, results }
}
