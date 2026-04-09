const connectingAdverbs = [
  'So', 'However', 'In other words', 'Yet', 'Moreover', 'Furthermore',
  'Thus', 'Therefore', 'But', 'Also', 'Additionally', 'Meanwhile',
  'Nevertheless', 'Nonetheless', 'Still', 'Then', 'Hence', 'Consequently',
  'Accordingly', 'Similarly', 'Likewise', 'Instead', 'Rather', 'Otherwise',
  'On the other hand', 'For example', 'Another', 'The other'
]

const pronouns = [
  'I', 'You', 'He', 'She', 'It', 'We', 'They',
  'This', 'That', 'These', 'Those'
]

const determiners = [
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'some', 'any', 'no', 'every', 'each', 'either', 'neither',
  'both', 'all', 'few', 'little', 'many', 'much', 'several'
]

function splitSentences(text) {
  const sentences = []
  const sentenceEndRegex = /[.!?]\s+/g
  let lastIndex = 0
  let match

  while ((match = sentenceEndRegex.exec(text)) !== null) {
    const sentenceEnd = match.index + 1
    const sentence = text.substring(lastIndex, sentenceEnd + match[0].length - 1)
    if (sentence.trim()) {
      sentences.push({
        text: sentence,
        startIndex: lastIndex,
        endIndex: sentenceEnd + match[0].length - 1
      })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex)
    if (remaining.trim()) {
      sentences.push({
        text: remaining,
        startIndex: lastIndex,
        endIndex: text.length
      })
    }
  }

  return sentences
}

function findConnectingAdverb(sentence) {
  for (const adverb of connectingAdverbs) {
    const lowerAdverb = adverb.toLowerCase()
    const trimmed = sentence.trim()
    if (trimmed.toLowerCase().startsWith(lowerAdverb + ' ') || trimmed.toLowerCase().startsWith(lowerAdverb + ',')) {
      return { found: true, position: 'start', adverb }
    }
    const escapedAdverb = adverb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const adverbPattern = escapedAdverb.replace(/\s+/g, '\\s+')
    const regex1 = new RegExp(`([;,]\\s*)${adverbPattern}(?=\\s|[,;.!?]|$)`, 'i')
    const regex2 = new RegExp(`(\\s+)${adverbPattern}(?=\\s|[,;.!?]|$)`, 'i')
    const match1 = sentence.match(regex1)
    if (match1) {
      return { found: true, position: 'middle', adverb, matchIndex: match1.index + match1[1].length }
    }
    const match2 = sentence.match(regex2)
    if (match2 && match2.index > 0) {
      return { found: true, position: 'middle', adverb, matchIndex: match2.index + match2[1].length }
    }
  }
  return { found: false }
}

function hasConnectingAdverb(sentence) {
  return findConnectingAdverb(sentence).found
}

function hasSuch(sentence) {
  const regex = /\bsuch\b(?!\s+as\b)/i
  return regex.test(sentence)
}

function startsWithPronoun(sentence) {
  const trimmed = sentence.trim()
  for (const pronoun of pronouns) {
    const regex = new RegExp(`^${pronoun}\\s+`, 'i')
    if (regex.test(trimmed)) return true
  }
  return false
}

function startsWithDeterminer(sentence) {
  const trimmed = sentence.trim()
  for (const determiner of determiners) {
    const regex = new RegExp(`^${determiner}\\s+`, 'i')
    if (regex.test(trimmed)) return true
  }
  return false
}

function findFirstCapital(sentence) {
  const match = sentence.match(/[A-Z]/)
  return match ? sentence.indexOf(match[0]) : -1
}

function classifySentences(sentences) {
  const candidates = []
  sentences.forEach((sentence, sentenceIndex) => {
    const sentenceText = sentence.text.trim()
    let priority = 999
    let reason = ''
    if (hasConnectingAdverb(sentence.text)) { priority = 1; reason = 'connecting-adverb' }
    else if (hasSuch(sentenceText)) { priority = 2; reason = 'such' }
    else if (startsWithPronoun(sentenceText)) { priority = 3; reason = 'pronoun' }
    else if (startsWithDeterminer(sentenceText)) { priority = 4; reason = 'determiner' }
    if (priority < 999 && sentenceIndex > 0) {
      candidates.push({ sentence, priority, reason, sentenceIndex })
    }
  })
  candidates.sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : a.sentenceIndex - b.sentenceIndex)
  return candidates.slice(0, 2)
}

function computeInsertions(selected) {
  return selected.map(({ sentence }) => {
    const idx = findFirstCapital(sentence.text)
    return idx >= 0 ? sentence.startIndex + idx : -1
  }).filter(i => i >= 0).sort((a, b) => b - a)
}

/**
 * 출처·영어·한글 구분 (표준: 출처/영어/한글// … 영어 안에 / 가 있어도 됨)
 * - 줄바꿈 + / + 줄바꿈 (기존 다줄)
 * - 한 줄: parts[0] / parts[1..-2] 합침 / parts[-1] = 한글
 */
function parseSourceEnglishKorean(textBlock) {
  const trimmed = textBlock.trim()
  if (!trimmed) return null

  const byNewline = textBlock.split(/\n\/\s*\n?/).map((p) => p.trim()).filter(Boolean)
  if (byNewline.length >= 2) {
    return {
      source: byNewline[0],
      english: byNewline[1],
      korean: byNewline[2] || '',
    }
  }

  const segs = trimmed.split('/').map((s) => s.trim())
  if (segs.length >= 3) {
    return {
      source: segs[0],
      english: segs.slice(1, -1).join('/'),
      korean: segs[segs.length - 1],
    }
  }
  if (segs.length === 2) {
    return { source: segs[0], english: segs[1], korean: '' }
  }

  return null
}

export function preprocessText(inputText) {
  const blocks = []
  const parts = inputText.split(/(\/\/)/)
  let currentBlock = { text: '', separator: '' }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === '//') {
      if (currentBlock.text.trim().length > 0) {
        blocks.push({ ...currentBlock, separator: currentBlock.separator + '//' })
      }
      currentBlock = { text: '', separator: '//' }
    } else {
      if (currentBlock.separator.includes('//') && !currentBlock.separator.endsWith('//')) {
        currentBlock.separator += part
      } else if (currentBlock.separator === '//') {
        const nextSlashIndex = part.indexOf('//')
        if (nextSlashIndex >= 0) {
          currentBlock.separator += part.substring(0, nextSlashIndex + 2)
          currentBlock.text = part.substring(nextSlashIndex + 2)
        } else {
          currentBlock.text = part
          currentBlock.separator = ''
        }
      } else {
        currentBlock.text += part
      }
    }
  }

  if (currentBlock.text.trim().length > 0) blocks.push(currentBlock)

  const lastSeparator = inputText.trim().endsWith('//') ? '//' : ''
  if (blocks.length > 0 && lastSeparator) {
    blocks[blocks.length - 1].separator = lastSeparator
  }

  if (blocks.length === 0 && inputText.trim().length > 0) {
    blocks.push({ text: inputText, separator: '' })
  }

  const results = []

  blocks.forEach((blockInfo) => {
    const textBlock = blockInfo.text
    const parsed = parseSourceEnglishKorean(textBlock)

    if (parsed && parsed.english && String(parsed.english).trim()) {
      const source = parsed.source
      const englishText = parsed.english.trim()
      const koreanText = (parsed.korean || '').trim()

      const sentences = splitSentences(englishText)
      const selected = classifySentences(sentences)
      const slashCount = selected.length
      const insertions = computeInsertions(selected)

      let processedEnglishText = englishText
      insertions.forEach((insertIndex) => {
        processedEnglishText =
          processedEnglishText.substring(0, insertIndex) +
          '///' +
          processedEnglishText.substring(insertIndex)
      })

      let processedText = source.trim()
        ? `${source.trim()}\n/\n${processedEnglishText}`
        : processedEnglishText
      if (koreanText) {
        processedText += '\n/\n' + koreanText
      }

      results.push({
        original: textBlock,
        processed: processedText,
        separator: blockInfo.separator,
        slashCount,
        isValid: slashCount === 2,
      })
    } else {
      const sentences = splitSentences(textBlock)
      const selected = classifySentences(sentences)
      const slashCount = selected.length
      const insertions = computeInsertions(selected)

      let processedText = textBlock
      insertions.forEach((insertIndex) => {
        processedText =
          processedText.substring(0, insertIndex) + '///' + processedText.substring(insertIndex)
      })

      results.push({
        original: textBlock,
        processed: processedText,
        separator: blockInfo.separator,
        slashCount,
        isValid: slashCount === 2,
      })
    }
  })

  let finalProcessed = ''
  results.forEach((result, idx) => {
    if (idx > 0) {
      if (!finalProcessed.endsWith('\n') && !finalProcessed.endsWith('\r\n')) finalProcessed += '\n'
      finalProcessed += result.separator
      if (!result.separator.endsWith('\n') && !result.separator.endsWith('\r\n')) finalProcessed += '\n'
    }
    finalProcessed += result.processed
    if (idx === results.length - 1 && result.separator) {
      if (!finalProcessed.endsWith('\n') && !finalProcessed.endsWith('\r\n')) finalProcessed += '\n'
      finalProcessed += result.separator
    }
  })

  return {
    original: inputText,
    processed: finalProcessed,
    results,
    allValid: results.every(r => r.isValid)
  }
}
