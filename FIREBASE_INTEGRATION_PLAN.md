# 전체 사이트 Firebase 통합 계획

## 현재 상태
- ✅ Firebase 초기화: 전역으로 설정됨 (`src/utils/firebase.js`)
- ✅ HomeworkProgress: Firebase Firestore 사용 중
- ❌ 다른 기능들: 로컬 state만 사용 (새로고침하면 사라짐)

## 통합 계획

### 1. 저장할 데이터 종류

#### A. 포켓북 (Pocketbook)
- **저장할 것**: 분석 결과, 생성된 포켓북
- **구조**: 
  ```
  pocketbooks/
    {userId}/
      {timestamp}/
        - title
        - texts: [{title, english, korean, analyzed}]
        - createdAt
        - updatedAt
  ```

#### B. 빈칸 만들기 (Blank Maker)
- **저장할 것**: 생성된 빈칸 문제, 정답
- **구조**:
  ```
  blanks/
    {userId}/
      {timestamp}/
        - type: 'noun' | 'verb' | 'adjective'
        - texts: [...]
        - blanks: [...]
        - answers: [...]
        - createdAt
  ```

#### C. SUM15, SUM40, KEY, CSAT Cloze 등
- 각 기능별로 생성된 결과 저장
- 구조는 각 기능에 맞게

#### D. OCR 결과
- 추출된 텍스트 저장
- 재사용 가능하도록

### 2. 구현 방법

#### 옵션 1: 자동 저장 (추천)
- 사용자가 결과를 생성하면 자동으로 Firebase에 저장
- "내 포켓북 목록", "내 빈칸 문제 목록" 등의 기능 추가
- 이전에 만든 것들을 다시 불러올 수 있음

#### 옵션 2: 수동 저장
- "저장하기" 버튼 추가
- 원할 때만 Firebase에 저장

#### 옵션 3: 실시간 동기화
- 여러 사용자가 동시에 작업할 때 실시간으로 공유
- 예: 팀 프로젝트, 공동 작업

### 3. Firebase 보안 규칙 확장

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 과제 진행 상황 (공개)
    match /homeworkProgress/{document} {
      allow read, write: if true;
    }
    
    // 포켓북 (개인별)
    match /pocketbooks/{userId}/{document=**} {
      allow read, write: if true; // 나중에 인증 추가
    }
    
    // 빈칸 만들기 (개인별)
    match /blanks/{userId}/{document=**} {
      allow read, write: if true;
    }
    
    // 기타 기능들...
  }
}
```

## 다음 단계

어떤 방식으로 진행할지 결정해야 합니다:

1. **어떤 데이터를 저장하고 싶으신가요?**
   - 포켓북 분석 결과?
   - 빈칸 만들기 결과?
   - 모든 기능?

2. **저장 방식을 선택해주세요:**
   - 자동 저장 (생성 시 자동)
   - 수동 저장 (버튼 클릭)
   - 실시간 동기화

3. **공유 방식을 선택해주세요:**
   - 개인만 (본인만 볼 수 있음)
   - 공개 (모든 사용자가 볼 수 있음)
   - 링크 공유 (특정 링크를 가진 사람만)

선택해주시면 그에 맞게 구현하겠습니다!

