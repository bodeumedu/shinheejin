// 문법 분석 유틸리티 - 문장별 개별 AI 분석
import nlp from 'compromise'

/**
 * 텍스트를 문장으로 분리
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') {
    return []
  }

  try {
    const doc = nlp(text)
    const sentences = doc.sentences().json()
    return sentences.map((s, idx) => ({
      index: idx + 1,
      text: s.text.trim()
    }))
  } catch (error) {
    console.error('문장 분리 오류:', error)
    // fallback: 간단한 문장 분리
    return text
      .split(/[.!?]+\s+/)
      .filter(s => s.trim().length > 0)
      .map((s, idx) => ({
        index: idx + 1,
        text: s.trim()
      }))
  }
}

/**
 * 단일 문장을 AI로 분석
 */
async function analyzeSingleSentence(sentence, sentenceIndex, apiKey) {
  const prompt = `You are an expert English grammar teacher. Analyze the following sentence in detail, providing word-by-word grammatical analysis.

[Sentence ${sentenceIndex}]
${sentence.text}

Provide a comprehensive analysis including:

1. **Word-by-word analysis**: A table with each word showing Word, Part of speech, and Grammatical function. Exclude articles (a, an, the) from the word analysis.
2. **Sentence Structure Identification**: Type (simple/compound/complex/compound-complex), dependent/independent clauses, main subject and predicate
3. **SVOC Structure**: Subject, Verb, Object, Complement (clearly distinguish each component)
4. **Noun Phrases**: Phrases that function as nouns with their function
5. **Noun Clauses**: Clauses that function as nouns with their function and Korean translation
6. **Adjective Phrases**: Phrases that function as adjectives with what they modify
7. **Adjective Clauses (Relative Clauses)**: Clauses that function as adjectives with antecedent, function, and Korean translation
8. **Adverb Phrases**: Phrases that function as adverbs with what they modify and their function
9. **Adverb Clauses**: Clauses that function as adverbs with their function and Korean translation
10. **Prepositions**: All prepositions with their objects and functions
11. **Conjunctions**: Coordinating, subordinating, and correlative conjunctions with their function
12. **Korean Translation**: Accurate and natural Korean translation of the entire sentence
13. **Grammar Notes**: Detailed explanation of complex structures

Return as JSON:
{
  "sentences": [
    {
      "index": ${sentenceIndex},
      "original": "${sentence.text.replace(/"/g, '\\"').replace(/\n/g, ' ')}",
      "wordAnalysis": [
        {
          "word": "단어",
          "partOfSpeech": "품사",
          "grammaticalFunction": "문법적 기능"
        }
      ],
      "sentenceStructure": {
        "type": "complex",
        "description": "문장 구조 설명",
        "dependentClauses": ["종속절"],
        "independentClauses": ["독립절"],
        "mainSubject": "주어",
        "mainPredicate": "서술어"
      },
      "svoc": {
        "subject": "주어",
        "verb": "동사",
        "object": "목적어",
        "complement": "보어"
      },
      "nounPhrases": [
        {
          "text": "명사구",
          "function": "기능",
          "translation": "한국어 번역"
        }
      ],
      "nounClauses": [
        {
          "text": "명사절",
          "function": "기능",
          "translation": "한국어 번역"
        }
      ],
      "adjectivePhrases": [
        {
          "text": "형용사구",
          "modifies": "수식하는 대상",
          "translation": "한국어 번역"
        }
      ],
      "adjectiveClauses": [
        {
          "text": "형용사절",
          "antecedent": "선행사",
          "function": "기능",
          "translation": "한국어 번역"
        }
      ],
      "adverbPhrases": [
        {
          "text": "부사구",
          "modifies": "수식하는 대상",
          "function": "기능",
          "translation": "한국어 번역"
        }
      ],
      "adverbClauses": [
        {
          "text": "부사절",
          "function": "기능",
          "translation": "한국어 번역"
        }
      ],
      "prepositions": [
        {
          "word": "전치사",
          "object": "목적어",
          "function": "기능",
          "translation": "한국어 번역"
        }
      ],
      "conjunctions": [
        {
          "word": "접속사",
          "type": "등위/종속/상관",
          "function": "기능",
          "connects": "연결하는 요소"
        }
      ],
      "koreanTranslation": "한국어 번역",
      "grammarNotes": "문법 설명"
    }
  ]
}

Return ONLY valid JSON.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert English grammar teacher. Always respond in valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`API 오류: ${response.status} - ${errorData.error?.message || ''}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(content)
    
    if (parsed.sentences && parsed.sentences.length > 0) {
      return parsed.sentences[0]
    }
    
    throw new Error('응답 형식 오류')
  } catch (error) {
    console.error(`문장 ${sentenceIndex} 분석 실패:`, error)
    // 실패 시 기본 구조 반환
    return {
      index: sentenceIndex,
      original: sentence.text,
      error: error.message,
      koreanTranslation: ''
    }
  }
}

/**
 * 전체 텍스트를 문장별로 개별 분석
 */
export async function analyzeGrammarHybrid(text, apiKey) {
  if (!apiKey) {
    return {
      error: 'API 키가 필요합니다.',
      hasAIReview: false
    }
  }

  try {
    // 1. 텍스트를 문장으로 분리
    const sentences = splitIntoSentences(text)
    const sentenceCount = sentences.length
    
    if (sentenceCount === 0) {
      return {
        error: '분석할 문장을 찾을 수 없습니다.',
        hasAIReview: false
      }
    }
    
    console.log(`📊 총 ${sentenceCount}개 문장 발견. 문장별 개별 분석 시작...`)
    
    // 2. 모든 문장을 순차적으로 개별 분석
    const aiSentenceResults = []
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i]
      console.log(`📝 문장 ${i + 1}/${sentenceCount} 분석 중...`)
      
      const result = await analyzeSingleSentence(sentence, sentence.index, apiKey)
      aiSentenceResults.push(result)
      
      // Rate limit 방지를 위한 짧은 지연
      if (i < sentences.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    console.log(`✅ 모든 문장(${sentenceCount}개) 분석 완료!`)
    
    const aiReview = {
      sentences: aiSentenceResults.sort((a, b) => (a.index || 0) - (b.index || 0))
    }

    return {
      aiReview: aiReview,
      hasAIReview: true
    }
  } catch (error) {
    console.error('문법 분석 오류:', error)
    return {
      error: error.message,
      hasAIReview: false
    }
  }
}
