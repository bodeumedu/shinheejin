# Vercel 환경 변수 설정 가이드

## 기본 API 키 설정하기

친구들이 API 키를 입력하지 않고 바로 사용할 수 있도록 기본 API 키를 설정할 수 있습니다.

### 방법 1: Vercel 웹사이트에서 설정 (권장)

1. **Vercel 대시보드 접속**
   - [vercel.com](https://vercel.com) 로그인
   - 프로젝트 선택: `bodeum-shj-pocketbook`

2. **환경 변수 설정**
   - Settings → Environment Variables 클릭
   - "Add New" 클릭
   - 다음 정보 입력:
     - **Name**: `VITE_DEFAULT_API_KEY`
     - **Value**: 본인의 OpenAI API 키 (예: `sk-...`)
     - **Environment**: Production, Preview, Development 모두 선택
   - "Save" 클릭

3. **재배포**
   - Deployments 탭으로 이동
   - 최신 배포의 "..." 메뉴 → "Redeploy" 클릭
   - 또는 코드를 다시 푸시하면 자동 재배포

### 방법 2: Vercel CLI로 설정

```bash
# 환경 변수 추가
vercel env add VITE_DEFAULT_API_KEY

# 질문에 답변:
# - Value: 본인의 API 키 입력
# - Environment: production, preview, development 모두 선택
```

### 방법 3: .env 파일 사용 (로컬 개발용)

프로젝트 루트에 `.env` 파일 생성:

```env
VITE_DEFAULT_API_KEY=sk-your-api-key-here
```

**주의**: `.env` 파일은 `.gitignore`에 추가되어 있어야 합니다 (이미 추가되어 있음)

## 동작 방식

1. **기본 키가 설정된 경우**
   - 사용자가 처음 접속하면 자동으로 기본 API 키 사용
   - "✓ API 키가 설정되었습니다" 메시지 표시
   - 사용자는 "변경" 버튼으로 자신의 키로 변경 가능

2. **기본 키가 없는 경우**
   - 기존처럼 API 키 입력 화면 표시

## 보안 주의사항

⚠️ **중요**: 
- Vite의 환경 변수는 클라이언트 사이드 코드에 포함됩니다
- 브라우저 개발자 도구에서 확인 가능합니다
- 따라서 API 키가 노출될 수 있습니다

**권장 사항**:
- API 키 사용량을 모니터링하세요
- 필요시 OpenAI에서 API 키를 회전(재발급)하세요
- 친구들과 사용량을 공유한다는 점을 고려하세요

## API 키 변경하기

기본 키를 변경하려면:
1. Vercel 환경 변수에서 `VITE_DEFAULT_API_KEY` 수정
2. 재배포

또는 사용자가 각자 자신의 키로 변경할 수 있습니다.

