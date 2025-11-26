# Firebase 설정 가이드 ⚠️ 필수

**실시간 동기화를 사용하려면 Firebase 설정이 필수입니다.**

과제 진행 상황을 모든 사용자가 실시간으로 공유할 수 있도록 Firebase Firestore를 사용합니다.

## 1. Firebase 프로젝트 생성

1. **Firebase 콘솔 접속**
   - [Firebase Console](https://console.firebase.google.com/) 접속
   - Google 계정으로 로그인

2. **프로젝트 추가**
   - "프로젝트 추가" 클릭
   - 프로젝트 이름 입력 (예: `bodeum-homework-progress`)
   - Google Analytics 설정 (선택사항)
   - "프로젝트 만들기" 클릭

3. **Firestore 데이터베이스 생성**
   - 왼쪽 메뉴에서 "Firestore Database" 클릭
   - "데이터베이스 만들기" 클릭
   - "테스트 모드에서 시작" 선택 (나중에 보안 규칙 설정)
   - 위치 선택 (예: `asia-northeast3` - 서울)
   - "사용 설정" 클릭

## 2. Firebase 웹 앱 설정

1. **웹 앱 추가**
   - 프로젝트 개요 페이지에서 `</>` (웹) 아이콘 클릭
   - 앱 닉네임 입력 (예: `Homework Progress`)
   - "앱 등록" 클릭

2. **Firebase 설정 정보 복사**
   - 표시되는 `firebaseConfig` 객체의 값들을 복사
   - 다음 정보가 필요합니다:
     - `apiKey`
     - `authDomain`
     - `projectId`
     - `storageBucket`
     - `messagingSenderId`
     - `appId`

## 3. 환경 변수 설정

### 방법 1: Vercel 웹사이트에서 설정 (권장)

1. **Vercel 대시보드 접속**
   - [vercel.com](https://vercel.com) 로그인
   - 프로젝트 선택

2. **환경 변수 추가**
   - Settings → Environment Variables 클릭
   - 다음 환경 변수들을 추가:

   ```
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=your-app-id
   ```

   - 각 환경 변수에 대해:
     - **Name**: 위의 이름 그대로 입력
     - **Value**: Firebase에서 복사한 값 입력
     - **Environment**: Production, Preview, Development 모두 선택
   - "Save" 클릭

3. **재배포**
   - Deployments 탭으로 이동
   - 최신 배포의 "..." 메뉴 → "Redeploy" 클릭

### 방법 2: .env 파일 사용 (로컬 개발용)

프로젝트 루트에 `.env` 파일 생성:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id
```

**주의**: `.env` 파일은 `.gitignore`에 추가되어 있어야 합니다.

## 4. Firestore 보안 규칙 설정

Firebase 콘솔에서 Firestore 보안 규칙을 설정해야 합니다.

1. **Firestore Database → 규칙 탭 이동**

2. **다음 규칙 적용**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 과제 진행 상황 컬렉션 (공개)
    match /homeworkProgress/{document} {
      allow read, write: if true;
    }
    
    // 포켓북 컬렉션 (개인별 저장, 공개 접근)
    match /pocketbook/{document} {
      allow read, write: if true;
    }
    
    // 빈칸 만들기 컬렉션
    match /blank/{document} {
      allow read, write: if true;
    }
    
    // SUM15 컬렉션
    match /sum15/{document} {
      allow read, write: if true;
    }
    
    // SUM40 컬렉션
    match /sum40/{document} {
      allow read, write: if true;
    }
    
    // KEY 컬렉션
    match /key/{document} {
      allow read, write: if true;
    }
    
    // CSAT Cloze 컬렉션
    match /csatCloze/{document} {
      allow read, write: if true;
    }
    
    // Third Word 컬렉션
    match /thirdWord/{document} {
      allow read, write: if true;
    }
    
    // OCR 컬렉션
    match /ocr/{document} {
      allow read, write: if true;
    }
    
    // 나머지 컬렉션은 차단 (보안)
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. **"게시" 클릭**

**참고**: 현재는 모든 사용자가 읽고 쓸 수 있도록 설정되어 있습니다. 
나중에 인증을 추가하여 특정 사용자만 접근할 수 있도록 변경할 수 있습니다.

## 5. 테스트

1. **로컬에서 테스트**
   ```bash
   npm run dev
   ```
   - 과제 진행 페이지 접속
   - 학생 추가/체크박스 변경 시도
   - 다른 브라우저나 시크릿 모드에서도 같은 데이터가 보이는지 확인

2. **배포 후 테스트**
   - Vercel에 배포
   - 여러 기기/브라우저에서 접속
   - 한 곳에서 변경한 내용이 다른 곳에서도 실시간으로 반영되는지 확인

## 6. 데이터 구조

Firestore의 `homeworkProgress` 컬렉션에 다음과 같은 구조로 저장됩니다:

```
homeworkProgress/
  └── homework_progress_과천고등학교_1학년_화목반/
      ├── students: ["김은수", "민성원", ...]
      ├── progressData: {
      │     "김은수": {
      │       "mockExam9": false,
      │       "bodeum1": false,
      │       ...
      │     },
      │     ...
      │   }
      ├── scores: {
      │     "김은수": {
      │       "bodeum1": "85",
      │       ...
      │     },
      │     ...
      │   }
      └── lastUpdated: "2024-01-01T00:00:00.000Z"
```

## 7. 문제 해결

### 데이터가 저장되지 않는 경우
- Firebase 환경 변수가 올바르게 설정되었는지 확인
- 브라우저 콘솔에서 오류 메시지 확인
- Firestore 보안 규칙이 올바르게 설정되었는지 확인

### 실시간 동기화가 작동하지 않는 경우
- Firebase 프로젝트가 올바르게 설정되었는지 확인
- 네트워크 연결 확인
- 브라우저 콘솔에서 Firebase 관련 오류 확인

### 비용 관련
- Firestore 무료 티어:
  - 읽기: 50,000회/일
  - 쓰기: 20,000회/일
  - 저장: 1GB
- 사용량이 많을 경우 Firebase 콘솔에서 모니터링 가능

