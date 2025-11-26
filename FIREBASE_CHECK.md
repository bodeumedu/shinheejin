# Firebase 연동 확인 체크리스트

## ✅ 코드 레벨 확인 완료

### 1. Firebase SDK 설치
- ✅ `package.json`에 `firebase: ^12.6.0` 설치 확인
- ✅ `node_modules`에 Firebase 패키지 존재 확인

### 2. Firebase 설정 파일
- ✅ `src/utils/firebase.js` 파일 생성 확인
- ✅ `initializeApp` 및 `getFirestore` import 확인
- ✅ 환경 변수 사용 구조 확인

### 3. HomeworkProgress 컴포넌트 연동
- ✅ Firestore import 확인 (`doc`, `getDoc`, `setDoc`, `onSnapshot`)
- ✅ 실시간 리스너 설정 확인
- ✅ 데이터 저장 로직 확인
- ✅ 에러 핸들링 확인
- ✅ 로딩 상태 관리 확인

### 4. App.jsx 통합
- ✅ HomeworkProgress 컴포넌트 import 확인
- ✅ homework-progress 모드 라우팅 확인
- ✅ props 전달 확인 (school, grade, class, teacher)

## ⚠️ 확인 필요 사항

### 1. 환경 변수 설정
다음 환경 변수들이 설정되어 있는지 확인하세요:

```env
VITE_FIREBASE_API_KEY=your-actual-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id
```

**확인 방법:**
- Vercel: Settings → Environment Variables에서 확인
- 로컬: `.env` 파일에서 확인

### 2. Firestore 보안 규칙
Firebase 콘솔에서 다음 규칙이 설정되어 있는지 확인:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /homeworkProgress/{document} {
      allow read, write: if true;
    }
  }
}
```

**확인 방법:**
- Firebase Console → Firestore Database → 규칙 탭

### 3. Firestore 컬렉션 생성
`homeworkProgress` 컬렉션이 자동으로 생성되지만, 수동으로 확인 가능:

**확인 방법:**
- Firebase Console → Firestore Database → 데이터 탭
- `homeworkProgress` 컬렉션이 있는지 확인

## 🧪 테스트 방법

### 1. 로컬 테스트
```bash
cd C:\Users\user\Downloads\pocketbook\pocketbook-dev
npm run dev
```

1. 브라우저에서 `http://localhost:5173` 접속
2. 비밀번호 입력
3. "📚 과제 관리 대시보드" 클릭
4. 학교/학년/반 선택
5. 과제 진행 페이지 접속
6. 브라우저 콘솔(F12) 열기
7. 다음을 확인:
   - Firebase 연결 오류가 없는지
   - "데이터를 불러오는 중..." 메시지가 나타났다가 사라지는지
   - 학생 목록이 표시되는지

### 2. 데이터 저장 테스트
1. 학생 추가
2. 체크박스 체크
3. 점수 입력
4. 브라우저 콘솔에서 오류 확인
5. Firebase Console → Firestore Database → 데이터 탭에서 데이터 확인

### 3. 실시간 동기화 테스트
1. 두 개의 브라우저 창 열기 (또는 시크릿 모드)
2. 같은 학교/학년/반 선택
3. 한 창에서 학생 추가 또는 체크박스 변경
4. 다른 창에서 실시간으로 반영되는지 확인

## 🔍 문제 해결

### 문제 1: "데이터를 불러오는 중..."이 계속 표시됨
**원인:**
- Firebase 환경 변수가 설정되지 않음
- Firestore 보안 규칙이 잘못 설정됨
- 네트워크 연결 문제

**해결:**
1. 브라우저 콘솔에서 오류 메시지 확인
2. 환경 변수 재확인
3. Firestore 보안 규칙 확인

### 문제 2: "FirebaseError: Missing or insufficient permissions"
**원인:**
- Firestore 보안 규칙이 읽기/쓰기를 허용하지 않음

**해결:**
- Firebase Console → Firestore Database → 규칙 탭
- 위의 보안 규칙 코드 적용

### 문제 3: 데이터가 저장되지 않음
**원인:**
- Firebase 환경 변수가 잘못 설정됨
- Firestore 보안 규칙 문제

**해결:**
1. 브라우저 콘솔에서 오류 확인
2. Firebase 설정 정보 재확인
3. Firestore 보안 규칙 확인

### 문제 4: 실시간 동기화가 작동하지 않음
**원인:**
- `onSnapshot` 리스너가 제대로 설정되지 않음
- 네트워크 문제

**해결:**
1. 브라우저 콘솔에서 Firebase 관련 오류 확인
2. 네트워크 탭에서 Firestore 요청 확인
3. 페이지 새로고침

## 📊 예상 동작

### 정상 동작 시:
1. 페이지 로드 → "데이터를 불러오는 중..." 표시 (1-2초)
2. 데이터 로드 완료 → 학생 목록 표시
3. 학생 추가/체크박스 변경 → 500ms 후 자동 저장
4. 다른 사용자가 접속 → 같은 데이터 표시
5. 한 사용자가 변경 → 다른 사용자에게 실시간 반영

### Firestore 데이터 구조:
```
homeworkProgress/
  └── homework_progress_과천고등학교_1학년_화목반/
      ├── students: ["김은수", "민성원", ...]
      ├── progressData: {...}
      ├── scores: {...}
      └── lastUpdated: "2024-01-01T00:00:00.000Z"
```

## ✅ 최종 확인 사항

- [ ] Firebase 환경 변수 설정 완료
- [ ] Firestore 보안 규칙 설정 완료
- [ ] 로컬에서 테스트 완료
- [ ] 데이터 저장 테스트 완료
- [ ] 실시간 동기화 테스트 완료
- [ ] 배포 후 테스트 완료

