// 로컬 문법 분석 유틸리티 - compromise.js 사용
import nlp from 'compromise'

/**
 * 로컬에서 문법 구조 분석
 * @param {string} text - 분석할 영어 텍스트
 * @returns {Object} 분석 결과
 */
export function analyzeGrammarLocal(text) {
  if (!text || typeof text !== 'string') {
    return { error: '텍스트가 올바르지 않습니다.' }
  }

  try {
    const doc = nlp(text)
    const sentences = doc.sentences().json()
    
    // 디버깅: 문장 수 확인
    console.log(`📊 로컬 분석: 총 ${sentences.length}개 문장 발견`)
    
    const analysis = {
      sentences: sentences.map((sentence, idx) => {
        const sentDoc = nlp(sentence.text)
        const sentenceText = sentence.text.trim()
        return {
          index: idx + 1,
          text: sentenceText,
          // 품사 분석
          nouns: sentDoc.nouns().out('array'),
          verbs: sentDoc.verbs().out('array'),
          adjectives: sentDoc.adjectives().out('array'),
          adverbs: sentDoc.adverbs().out('array'),
          // 문장 구조 정보
          subject: extractSubject(sentDoc),
          predicate: extractPredicate(sentDoc),
          object: extractObject(sentDoc),
          // 추가 정보
          clauses: extractClauses(sentDoc),
          prepositionalPhrases: extractPrepositionalPhrases(sentDoc),
          tags: sentDoc.out('tags')
        }
      }),
      // 전체 통계
      stats: {
        totalSentences: sentences.length,
        totalNouns: doc.nouns().length,
        totalVerbs: doc.verbs().length,
        totalAdjectives: doc.adjectives().length
      }
    }

    return analysis
  } catch (error) {
    console.error('로컬 문법 분석 오류:', error)
    return { error: '문법 분석 중 오류가 발생했습니다.' }
  }
}

/**
 * 주어 추출 (간단한 휴리스틱)
 */
function extractSubject(doc) {
  const nouns = doc.nouns()
  const firstNoun = nouns.first()
  
  if (firstNoun && firstNoun.out('array').length > 0) {
    // 주어는 보통 문장 앞부분에 있음
    const text = firstNoun.out('text')
    const match = doc.match(text)
    if (match.out('text')) {
      return match.out('text')
    }
  }
  
  return null
}

/**
 * 서술어(동사) 추출
 */
function extractPredicate(doc) {
  const verbs = doc.verbs()
  if (verbs.length > 0) {
    return verbs.first().out('text')
  }
  return null
}

/**
 * 목적어 추출
 */
function extractObject(doc) {
  const nouns = doc.nouns()
  // 첫 번째 명사 이후의 명사를 목적어로 간주 (간단한 휴리스틱)
  const nounArray = nouns.out('array')
  if (nounArray.length > 1) {
    return nounArray.slice(1).join(' ')
  }
  return null
}

/**
 * 절(clause) 추출
 */
function extractClauses(doc) {
  const clauses = []
  
  // 관계절 찾기 (who, which, that 등)
  const relativeClauses = doc.match('#Noun+ (that|which|who|whom|whose)')
  if (relativeClauses.length > 0) {
    relativeClauses.forEach(clause => {
      clauses.push({
        type: 'relative',
        text: clause.out('text')
      })
    })
  }
  
  return clauses
}

/**
 * 전치사구 추출
 */
function extractPrepositionalPhrases(doc) {
  const phrases = []
  
  // 전치사로 시작하는 구문 찾기
  const prepMatches = doc.match('#Preposition+ #Noun+')
  if (prepMatches.length > 0) {
    prepMatches.forEach(match => {
      const text = match.out('text')
      if (text && text.trim()) {
        phrases.push(text.trim())
      }
    })
  }
  
  // #Noun+ #Preposition+ #Noun+ 패턴 (예: "in the morning")
  const nounPrepMatches = doc.match('#Noun+ #Preposition+ #Noun+')
  if (nounPrepMatches.length > 0) {
    nounPrepMatches.forEach(match => {
      const text = match.out('text')
      if (text && text.trim() && !phrases.includes(text.trim())) {
        phrases.push(text.trim())
      }
    })
  }
  
  return [...new Set(phrases)] // 중복 제거
}

/**
 * 문장을 분석 가능한 형태로 포맷팅
 */
export function formatAnalysisForDisplay(localAnalysis) {
  if (localAnalysis.error) {
    return { error: localAnalysis.error }
  }

  let formatted = ''
  
  localAnalysis.sentences.forEach((sentence, idx) => {
    formatted += `[문장 ${sentence.index}]\n`
    formatted += `${sentence.text}\n\n`
    
    // SVOC 구조
    formatted += `[구조]\n`
    if (sentence.subject) {
      formatted += `주어(S): ${sentence.subject}\n`
    }
    if (sentence.predicate) {
      formatted += `서술어(V): ${sentence.predicate}\n`
    }
    if (sentence.object) {
      formatted += `목적어(O): ${sentence.object}\n`
    }
    
    // 전치사구
    if (sentence.prepositionalPhrases && sentence.prepositionalPhrases.length > 0) {
      formatted += `\n[전치사구]\n`
      sentence.prepositionalPhrases.forEach(pp => {
        formatted += `- ${pp}\n`
      })
    }
    
    // 관계절
    if (sentence.clauses && sentence.clauses.length > 0) {
      formatted += `\n[관계절]\n`
      sentence.clauses.forEach(clause => {
        formatted += `- ${clause.text}\n`
      })
    }
    
    formatted += `\n${'='.repeat(50)}\n\n`
  })
  
  return formatted
}

