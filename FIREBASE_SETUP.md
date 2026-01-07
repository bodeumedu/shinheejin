# Firebase 설정 가이드

주간시간표 데이터를 인터넷에 저장하고 여러 기기에서 동기화하려면 Firebase를 설정해야 합니다.

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: `bodeum-pocketbook`)
4. Google Analytics 설정 (선택사항)
5. 프로젝트 생성 완료

## 2. Firestore 데이터베이스 생성

1. Firebase Console에서 프로젝트 선택
2. 왼쪽 메뉴에서 "Firestore Database" 클릭
3. "데이터베이스 만들기" 클릭
4. **프로덕션 모드** 또는 **테스트 모드** 선택
   - 테스트 모드: 30일간 모든 읽기/쓰기 허용
   - 프로덕션 모드: 보안 규칙 설정 필요
5. 위치 선택 (예: `asia-northeast3` - 서울)
6. "사용 설정" 클릭

## 3. Firebase 웹 앱 등록

1. Firebase Console에서 프로젝트 선택
2. 왼쪽 상단 톱니바퀴 아이콘 → "프로젝트 설정" 클릭
3. "내 앱" 섹션에서 웹 아이콘(</>) 클릭
4. 앱 닉네임 입력 (예: `pocketbook-web`)
5. "앱 등록" 클릭
6. **Firebase SDK 설정**에서 `firebaseConfig` 객체 확인

## 4. 환경 변수 설정

### 방법 1: Vercel 웹사이트에서 설정 (배포된 사이트용)

1. [Vercel 대시보드](https://vercel.com) 접속
2. 프로젝트 선택: `bodeum-shj-pocketbook`
3. **Settings** → **Environment Variables** 클릭
4. 다음 환경 변수들을 추가:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=bodeum-pocketbook.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=bodeum-pocketbook
VITE_FIREBASE_STORAGE_BUCKET=bodeum-pocketbook.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

각 변수의 값은 Firebase Console의 "프로젝트 설정" → "일반" 탭에서 확인할 수 있습니다.

5. **Environment**: Production, Preview, Development 모두 선택
6. "Save" 클릭
7. **재배포** 필요 (Deployments → 최신 배포의 "..." → "Redeploy")

### 방법 2: .env 파일 사용 (로컬 개발용)

프로젝트 루트(`pocketbook-dev/`)에 `.env` 파일 생성:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=bodeum-pocketbook.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=bodeum-pocketbook
VITE_FIREBASE_STORAGE_BUCKET=bodeum-pocketbook.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

**주의**: `.env` 파일은 `.gitignore`에 추가되어 있어야 합니다 (이미 추가되어 있음)

## 5. Firestore 보안 규칙 설정

Firebase Console → Firestore Database → "규칙" 탭에서 다음 규칙 설정:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 주간시간표 데이터 (모든 사용자 읽기/쓰기 허용)
    match /weeklySchedules/{document=**} {
      allow read, write: if true;
    }
    
    // 휴강 데이터 (모든 사용자 읽기/쓰기 허용)
    match /weeklyScheduleCancellations/{document=**} {
      allow read, write: if true;
    }
  }
}
```

**주의**: 이 규칙은 모든 사용자에게 읽기/쓰기 권한을 부여합니다. 프로덕션 환경에서는 더 엄격한 규칙을 설정하는 것을 권장합니다.

## 6. 확인 방법

1. 브라우저 개발자 도구(F12) → Console 탭 열기
2. 주간시간표 입력 후 "처리하기" 클릭
3. 콘솔에서 다음 메시지 확인:
   - `✅ Firebase에 주간시간표 저장 완료: weeklySchedule_...`
   - 또는 `⚠️ Firebase가 설정되지 않았습니다.` (설정 안 된 경우)

## 문제 해결

### "Firebase가 설정되지 않았습니다" 메시지가 나오는 경우

1. 환경 변수가 제대로 설정되었는지 확인
2. Vercel에 배포한 경우, 재배포가 완료되었는지 확인
3. 브라우저 콘솔에서 Firebase 설정 확인 메시지 확인

### "Missing or insufficient permissions" 에러가 나오는 경우

1. Firestore 보안 규칙이 올바르게 설정되었는지 확인
2. 규칙 저장 후 몇 분 기다려보기 (규칙 적용에 시간이 걸릴 수 있음)

### 데이터가 다른 기기에서 보이지 않는 경우

1. Firebase에 저장이 성공했는지 콘솔 로그 확인
2. 다른 기기에서도 Firebase 설정이 되어 있는지 확인
3. Firestore Console에서 데이터가 실제로 저장되었는지 확인
