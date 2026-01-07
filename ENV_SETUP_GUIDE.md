# 로컬 개발 환경 변수 설정 가이드

## 문제 상황
- Vercel에는 Firebase 환경 변수가 설정되어 있음 ✅
- 하지만 로컬 개발 환경(`npm run dev`)에서는 `.env` 파일이 필요함
- Vercel의 환경 변수는 배포 환경에서만 사용됨

## 해결 방법

### 1. Vercel에서 환경 변수 값 확인
1. Vercel 대시보드 → 프로젝트 → Settings → Environment Variables
2. 각 Firebase 환경 변수의 눈 아이콘 클릭하여 값 확인
3. 다음 변수들의 값을 복사:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

### 2. 로컬 .env 파일에 값 입력
`pocketbook-dev` 폴더의 `.env` 파일을 열고 다음 형식으로 입력:

```env
VITE_FIREBASE_API_KEY=복사한-api-key-값
VITE_FIREBASE_AUTH_DOMAIN=복사한-auth-domain-값
VITE_FIREBASE_PROJECT_ID=복사한-project-id-값
VITE_FIREBASE_STORAGE_BUCKET=복사한-storage-bucket-값
VITE_FIREBASE_MESSAGING_SENDER_ID=복사한-messaging-sender-id-값
VITE_FIREBASE_APP_ID=복사한-app-id-값
```

### 3. 개발 서버 재시작
```powershell
# 현재 실행 중이면 Ctrl+C로 중지 후
npm run dev
```

### 4. 확인
브라우저 콘솔(F12)에서 다음 메시지 확인:
- ✅ `Firebase 초기화 성공` → 성공!
- ❌ `Firebase 환경 변수가 설정되지 않았습니다` → .env 파일 확인 필요

## 주의사항
- `.env` 파일은 Git에 커밋되지 않습니다 (보안상 올바름)
- Vercel의 환경 변수와 로컬 `.env` 파일의 값은 동일해야 합니다
- 값 변경 후에는 반드시 개발 서버를 재시작해야 합니다



