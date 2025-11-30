# Vercel 솔라피 환경 변수 설정 가이드

## 빠른 설정 방법

### 1. Vercel 대시보드 접속
1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. 로그인 후 프로젝트 선택 (`bodeum-shj-pocketbook` 또는 프로젝트 이름)

### 2. 환경 변수 추가
1. 프로젝트 페이지에서 **Settings** 탭 클릭
2. 왼쪽 메뉴에서 **Environment Variables** 클릭
3. **Add New** 버튼 클릭

### 3. 다음 환경 변수들을 각각 추가

#### 필수 환경 변수 1: 솔라피 API Key
- **Name**: `SOLAPI_API_KEY`
- **Value**: 솔라피 대시보드에서 복사한 API Key
- **Environment**: Production, Preview, Development 모두 체크
- **Save** 클릭

#### 필수 환경 변수 2: 솔라피 API Secret
- **Name**: `SOLAPI_API_SECRET`
- **Value**: 솔라피 대시보드에서 복사한 API Secret
- **Environment**: Production, Preview, Development 모두 체크
- **Save** 클릭

#### 필수 환경 변수 3: 플러스친구 ID
- **Name**: `SOLAPI_PF_ID`
- **Value**: 카카오톡 비즈니스 채널의 플러스친구 ID
- **Environment**: Production, Preview, Development 모두 체크
- **Save** 클릭

#### 선택 환경 변수: 발신번호
- **Name**: `SOLAPI_SENDER_NUMBER`
- **Value**: 솔라피에 등록한 발신번호 (예: 01012345678)
- **Environment**: Production, Preview, Development 모두 체크
- **Save** 클릭

### 4. 재배포
환경 변수를 추가한 후에는 **반드시 재배포**해야 합니다:
1. **Deployments** 탭으로 이동
2. 최신 배포 항목의 **...** (세 점) 메뉴 클릭
3. **Redeploy** 선택
4. 재배포 완료까지 대기 (약 1-2분)

### 5. 확인
재배포 후 다시 카카오톡 전송을 시도해보세요.

## 솔라피 API 키 확인 방법

1. [솔라피 대시보드](https://solapi.com) 로그인
2. 상단 메뉴에서 **API 인증정보** 클릭
3. **API Key**와 **API Secret** 복사

## 플러스친구 ID 확인 방법

### 방법 1: 솔라피 대시보드에서 확인 (추천)
1. [솔라피 대시보드](https://solapi.com) 로그인
2. 좌측 메뉴에서 **"카카오톡"** 클릭
3. **"채널 관리"** 또는 **"채널 목록"** 클릭
4. 연동된 채널의 **"플러스친구 ID"** 또는 **"PF ID"** 확인
5. 형식: `@보듬교육` 또는 `@채널이름` 형태 (전체 문자열 복사)

### 방법 2: 카카오톡 비즈니스 센터에서 확인
1. [카카오톡 비즈니스 센터](https://business.kakao.com) 로그인
2. 연동하려는 비즈니스 채널 선택
3. **"채널 설정"** 또는 **"기본 설정"** 클릭
4. **"플러스친구 ID"** 또는 **"채널 ID"** 확인

**자세한 내용**: `플러스친구_ID_확인방법.md` 파일 참고

## 문제 해결

### 여전히 "솔라피 API 키가 설정되지 않았습니다" 오류가 발생하는 경우

1. **환경 변수 이름 확인**
   - 정확히 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_PF_ID`로 입력했는지 확인
   - 대소문자 구분 필수

2. **재배포 확인**
   - 환경 변수 추가 후 반드시 재배포해야 적용됩니다
   - 최신 배포가 환경 변수 추가 후에 이루어진 것인지 확인

3. **Environment 선택 확인**
   - Production, Preview, Development 모두에 환경 변수가 설정되어 있는지 확인

4. **Vercel 로그 확인**
   - Vercel Dashboard → Deployments → 최신 배포 → Functions 탭
   - 로그에서 환경 변수 로드 오류 확인

## 주의사항

- 환경 변수 값에 공백이나 특수문자가 포함되지 않도록 주의
- API 키는 절대 공개하지 마세요
- 환경 변수 추가 후 반드시 재배포가 필요합니다

