# 로컬 영어 문법 분석 기능 추가 방법

현재 프로젝트에 인터넷 없이 작동하는 영어 문법 분석 기능을 추가할 수 있습니다.

## 추천 라이브러리

### 1. **compromise.js** (가장 추천)
- 📦 용량: 약 300KB
- ⚡ 빠른 속도
- 🎯 문법 분석, 품사 태깅, 문장 구조 파악
- 💻 브라우저와 Node.js 모두 지원

### 2. **natural**
- 📦 용량: 약 500KB
- 🔍 형태소 분석, 품사 태깅
- 📝 텍스트 분류, 토큰화

## 설치 방법

```bash
npm install compromise
# 또는
npm install natural
```

## 사용 예시 (Compromise.js)

```javascript
import nlp from 'compromise'

// 문장 구조 분석
const doc = nlp('The quick brown fox jumps over the lazy dog.')

// 품사 태깅
doc.match('#Noun') // 명사 찾기
doc.match('#Verb') // 동사 찾기
doc.match('#Adjective') // 형용사 찾기

// 문장 구조 파악
doc.sentences() // 문장 단위로 분리
doc.verbs() // 동사 추출
doc.nouns() // 명사 추출
doc.adjectives() // 형용사 추출

// 문법 정보
doc.out('tags') // 모든 품사 태그
doc.out('terms') // 모든 단어 정보
```

## 가능한 기능

1. **품사 분석** - 명사, 동사, 형용사 등 추출
2. **문장 구조 파악** - 주어, 서술어, 목적어 등
3. **문법 패턴 인식** - 관계절, 분사구문, 가정법 등
4. **문장 복잡도 분석**
5. **문법 오류 검사** (기본적인 수준)

## 제한사항

- OpenAI API처럼 완벽하지 않음
- 복잡한 문법 분석은 제한적
- 규칙 기반이라 예외 케이스 처리 부족
- 다중 문장/문단 분석은 추가 로직 필요

## 프로젝트 통합 방법

새로운 유틸리티 파일을 만들어서 사용:

```javascript
// src/utils/localGrammarAnalyzer.js
import nlp from 'compromise'

export function analyzeGrammarLocal(text) {
  const doc = nlp(text)
  
  return {
    sentences: doc.sentences().out('array'),
    nouns: doc.nouns().out('array'),
    verbs: doc.verbs().out('array'),
    adjectives: doc.adjectives().out('array'),
    tags: doc.out('tags'),
    // 추가 분석...
  }
}
```

## 권장사항

- **간단한 분석**: compromise.js 사용 (가볍고 빠름)
- **고급 분석**: OpenAI API + 로컬 라이브러리 혼합 사용
- **오프라인 모드**: compromise.js로 기본 분석 제공



