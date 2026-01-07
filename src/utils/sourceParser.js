// 출처 파싱 및 AI 카테고리화 유틸리티

/**
 * AI를 사용하여 출처를 파싱하고 카테고리화
 * @param {string} sourceText - 원본 출처 텍스트
 * @param {string} apiKey - OpenAI API 키
 * @returns {Promise<Object>} - 파싱된 출처 정보
 */
export async function parseSourceWithAI(sourceText, apiKey) {
  if (!sourceText || !sourceText.trim()) {
    return { type: 'unknown', missingFields: ['source'] };
  }

  const prompt = `You are an assistant that categorizes Korean educational material sources.

Given a source text, categorize it into one of two types:

1. **책 (Book)**: Format should be "책이름_챕터_문항번호"
   - Example: "올림포스_영어 독해의 기본2_Ch05_Unit14" → { type: "book", bookName: "올림포스 영어 독해의 기본2", chapter: "Ch05 Unit14", questionNumber: null }

2. **모의고사 (Mock Exam)**: Format should be "모의고사_학년_년도_월_문항번호"
   - Example: "2024학년도 3월 고2 모의고사 18번" → { type: "mockExam", grade: "고2", year: "2024", month: "3월", questionNumber: "18" }

Analyze the following source text and return ONLY a valid JSON object with the following structure:

For Book:
{
  "type": "book",
  "bookName": "책 이름",
  "chapter": "챕터 정보",
  "questionNumber": "문항번호 or null",
  "missingFields": ["없는 필드들"]
}

For Mock Exam:
{
  "type": "mockExam",
  "grade": "학년 (고1/고2/고3)",
  "year": "년도 (YYYY)",
  "month": "월 (1월/3월/6월/9월/10월/11월 등)",
  "questionNumber": "문항번호 or null",
  "missingFields": ["없는 필드들"]
}

If information cannot be determined, include it in missingFields array.

Source text to analyze: "${sourceText}"

Return ONLY the JSON object, no additional text.`;

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
            content: 'You are a helpful assistant. Always respond with valid JSON only, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('AI 응답을 받을 수 없습니다.');
    }

    // JSON 파싱 (코드 블록 제거)
    const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonContent);

    return {
      originalText: sourceText,
      ...parsed,
      missingFields: parsed.missingFields || []
    };
  } catch (error) {
    console.error('출처 파싱 오류:', error);
    // 기본값 반환
    return {
      type: 'unknown',
      originalText: sourceText,
      missingFields: ['all']
    };
  }
}

/**
 * 출처 정보를 표준화된 문자열로 변환
 * @param {Object} sourceInfo - 파싱된 출처 정보
 * @returns {string} - 표준화된 출처 문자열
 */
export function formatSourceString(sourceInfo) {
  if (sourceInfo.type === 'book') {
    let str = sourceInfo.bookName || '';
    if (sourceInfo.chapter) {
      str += `_${sourceInfo.chapter}`;
    }
    if (sourceInfo.questionNumber) {
      str += `_${sourceInfo.questionNumber}`;
    }
    return str;
  } else if (sourceInfo.type === 'mockExam') {
    let str = `모의고사_${sourceInfo.grade || ''}_${sourceInfo.year || ''}_${sourceInfo.month || ''}`;
    if (sourceInfo.questionNumber) {
      str += `_${sourceInfo.questionNumber}`;
    }
    return str;
  }
  return sourceInfo.originalText || '';
}

/**
 * 출처 정보를 Firestore 문서 ID로 변환
 * @param {Object} sourceInfo - 파싱된 출처 정보
 * @returns {string} - 문서 ID
 */
export function getSourceDocumentId(sourceInfo) {
  if (sourceInfo.type === 'book') {
    return `book_${sourceInfo.bookName || 'unknown'}_${sourceInfo.chapter || 'unknown'}`;
  } else if (sourceInfo.type === 'mockExam') {
    return `mockExam_${sourceInfo.grade || 'unknown'}_${sourceInfo.year || 'unknown'}_${sourceInfo.month || 'unknown'}`;
  }
  return `unknown_${Date.now()}`;
}



