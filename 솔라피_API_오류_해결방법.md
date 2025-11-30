# 솔라피 API 키 오류 해결 방법

"솔라피 API 키가 설정되지 않았습니다" 오류가 발생하는 경우, 다음 항목을 순서대로 확인하세요.

## ✅ 체크리스트

### 1. 환경 변수 추가 확인
- [ ] Vercel Dashboard에 로그인했는지 확인
- [ ] 올바른 프로젝트를 선택했는지 확인
- [ ] Settings → Environment Variables에서 다음 환경 변수들이 모두 추가되었는지 확인:
  - `SOLAPI_API_KEY`
  - `SOLAPI_API_SECRET`
  - `SOLAPI_PF_ID`

### 2. 환경 변수 이름 확인
- [ ] 환경 변수 이름이 **정확히** 다음과 같은지 확인 (대소문자 구분 필수):
  - `SOLAPI_API_KEY` (대문자)
  - `SOLAPI_API_SECRET` (대문자)
  - `SOLAPI_PF_ID` (대문자)
- [ ] 앞뒤 공백이 없는지 확인
- [ ] 오타가 없는지 확인

### 3. 환경 변수 값 확인
- [ ] 각 환경 변수에 **값이 입력**되어 있는지 확인 (빈 값 아님)
- [ ] 값에 앞뒤 공백이 없는지 확인
- [ ] 특수문자가 올바르게 입력되었는지 확인

### 4. 환경 설정 확인
- [ ] 환경 변수 추가 시 **Production, Preview, Development 모두 체크**했는지 확인
- [ ] 일부 환경만 체크했다면, 모든 환경에 다시 설정

### 5. 재배포 확인 ⚠️ **가장 중요**
- [ ] 환경 변수를 추가한 **이후에** 재배포했는지 확인
- [ ] Vercel Dashboard → Deployments → 최신 배포 확인
- [ ] 최신 배포가 환경 변수 추가 **이후**에 생성된 것인지 확인
- [ ] 그렇지 않다면: 최신 배포 → ... (세 점) → **Redeploy** 클릭

### 6. 배포 환경 확인
- [ ] 현재 접속 중인 URL이 **프로덕션 URL**인지 확인
  - ✅ 올바른 URL: `https://bodeumshjpocketbook.vercel.app`
  - ❌ 잘못된 URL: `http://localhost:5173` (로컬 개발 환경)
- [ ] 로컬 개발 환경에서는 Vercel 환경 변수가 로드되지 않습니다

### 7. Vercel 로그 확인
환경 변수가 제대로 로드되었는지 확인:
1. Vercel Dashboard → 프로젝트 선택
2. Deployments → 최신 배포 클릭
3. **Functions** 탭 클릭
4. `/api/send-kakao` 함수 클릭
5. 로그에서 "환경 변수 상태:" 메시지 확인
6. 모든 환경 변수가 "설정됨"으로 표시되는지 확인

## 🔍 단계별 문제 해결

### Step 1: 환경 변수 다시 확인

1. **Vercel Dashboard 접속**
   - https://vercel.com/dashboard
   - 프로젝트 선택

2. **환경 변수 목록 확인**
   - Settings → Environment Variables
   - 다음 3개가 모두 있는지 확인:
     - `SOLAPI_API_KEY`
     - `SOLAPI_API_SECRET`
     - `SOLAPI_PF_ID`

3. **각 환경 변수 편집하여 확인**
   - 각 환경 변수를 클릭하여 값이 제대로 입력되어 있는지 확인
   - 앞뒤 공백이 없는지 확인

### Step 2: 환경 변수 재설정 (필요한 경우)

만약 환경 변수가 없다면:

1. **Add New** 클릭
2. Name 입력: `SOLAPI_API_KEY`
3. Value 입력: 솔라피 API Key
4. Environment: **Production, Preview, Development 모두 체크**
5. **Save** 클릭
6. 나머지 환경 변수도 동일하게 추가

### Step 3: 반드시 재배포

환경 변수를 추가하거나 수정했다면:

1. **Deployments** 탭으로 이동
2. 최신 배포 항목 찾기
3. **...** (세 점) 메뉴 클릭
4. **Redeploy** 선택
5. 재배포 완료까지 대기 (약 1-2분)

### Step 4: 배포 로그 확인

재배포 후:

1. Deployments → 최신 배포 클릭
2. 로그 확인:
   - ✅ "Build successful" 메시지 확인
   - ❌ 빌드 오류가 있다면 해결

### Step 5: 함수 로그 확인

1. Deployments → 최신 배포 → **Functions** 탭
2. `/api/send-kakao` 클릭
3. 로그에서 환경 변수 상태 확인:
   ```
   환경 변수 상태: {
     SOLAPI_API_KEY: '설정됨',
     SOLAPI_API_SECRET: '설정됨',
     SOLAPI_PF_ID: '설정됨'
   }
   ```
4. 모든 항목이 "설정됨"으로 표시되어야 합니다

## 🚨 자주 발생하는 실수

1. **재배포를 하지 않음** ⚠️
   - 환경 변수를 추가했지만 재배포하지 않으면 적용되지 않습니다
   - 반드시 재배포해야 합니다!

2. **환경 변수 이름 오타**
   - `SOLAPI_API_KEY` (올바름)
   - `solapi_api_key` (틀림 - 소문자)
   - `SOLAPI_APIKEY` (틀림 - 언더스코어 누락)

3. **일부 환경만 체크**
   - Production만 체크하고 Preview/Development는 체크하지 않음
   - 모든 환경에 체크해야 합니다

4. **로컬 환경에서 테스트**
   - `localhost:5173`에서 테스트하면 Vercel 환경 변수가 로드되지 않습니다
   - 프로덕션 URL에서 테스트해야 합니다

5. **값이 비어있음**
   - 환경 변수를 추가했지만 값(Value)을 입력하지 않음
   - 반드시 값을 입력해야 합니다

## 📝 추가 확인 사항

### 솔라피 API 키 확인
1. [솔라피 대시보드](https://solapi.com) 로그인
2. API 인증정보에서 API Key와 API Secret 복사
3. Vercel 환경 변수에 정확히 붙여넣기

### 플러스친구 ID 확인
1. [솔라피 대시보드](https://solapi.com) → 카카오톡 → 채널 관리
2. 플러스친구 ID 복사 (예: `@보듬교육`)
3. Vercel 환경 변수에 입력

## 💡 여전히 해결되지 않는 경우

1. **Vercel 지원팀에 문의**
   - Vercel Dashboard → Help → Support
   - 환경 변수 설정 문제로 문의

2. **솔라피 고객센터에 문의**
   - API 키 발급 문제 확인
   - 채널 연동 상태 확인

3. **임시 해결책**
   - API 파일을 수정하여 환경 변수를 하드코딩 (보안상 권장하지 않음)
   - 테스트 목적으로만 사용

## 📚 참고 문서

- `VERCEL_SOLAPI_ENV_SETUP.md` - 환경 변수 설정 가이드
- `플러스친구_ID_확인방법.md` - 플러스친구 ID 확인 방법
- `SOLAPI_SETUP.md` - 솔라피 연동 전체 가이드

