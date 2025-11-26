# Vercel CLI 배포 상세 가이드

## 사전 준비

1. **Node.js 설치 확인**
   ```bash
   node --version
   npm --version
   ```
   - Node.js v16 이상 필요

2. **프로젝트 빌드 테스트**
   ```bash
   npm run build
   ```
   - `dist` 폴더가 생성되면 성공
   - 에러가 나면 먼저 수정 필요

## 단계별 배포 가이드

### 1단계: Vercel CLI 설치

**전역 설치 (권장)**
```bash
npm install -g vercel
```

**설치 확인**
```bash
vercel --version
```
- 버전이 표시되면 설치 완료

**참고**: 전역 설치가 안 되면 (권한 오류 등)
```bash
npx vercel
```
- 매번 `npx`를 앞에 붙여서 실행

### 2단계: Vercel 계정 준비

1. **Vercel 계정 생성**
   - 브라우저에서 [vercel.com](https://vercel.com) 접속
   - "Sign Up" 클릭
   - GitHub, GitLab, Bitbucket 중 하나로 가입 (추천: GitHub)

2. **이메일로 가입도 가능**
   - 이메일 주소 입력
   - 확인 이메일 받기

### 3단계: Vercel 로그인

**터미널에서 로그인**
```bash
vercel login
```

**로그인 과정:**
1. 명령어 실행 후 브라우저가 자동으로 열림
   - 브라우저가 안 열리면 표시된 URL을 복사해서 브라우저에 붙여넣기
2. Vercel 웹사이트에서 "Authorize Vercel CLI" 클릭
3. 로그인 완료 메시지 확인
4. 터미널로 돌아가면 로그인 완료

**로그인 확인**
```bash
vercel whoami
```
- 이메일 주소가 표시되면 로그인 성공

### 4단계: 프로젝트 디렉토리로 이동

```bash
cd C:\Users\jin12\Downloads\pocketbook
```

현재 위치 확인:
```bash
pwd  # 또는 Windows에서는: cd
```

### 5단계: 배포 실행

**첫 번째 배포**
```bash
vercel
```

**질문과 답변:**

1. **Set up and deploy "C:\Users\jin12\Downloads\pocketbook"?**
   ```
   ? Set up and deploy "C:\Users\jin12\Downloads\pocketbook"? [Y/n]
   ```
   → **Y** 입력 (또는 Enter)

2. **Which scope do you want to deploy to?**
   ```
   ? Which scope do you want to deploy to?
   > Your Name (your-email@example.com)
   ```
   → 본인 계정 선택 (Enter)

3. **Link to existing project?**
   ```
   ? Link to existing project? [y/N]
   ```
   → **N** 입력 (처음 배포이므로)

4. **What's your project's name?**
   ```
   ? What's your project's name? pocketbook
   ```
   → 원하는 이름 입력 (또는 Enter로 기본값 사용)
   - 예: `english-text-organizer`, `pocketbook` 등

5. **In which directory is your code located?**
   ```
   ? In which directory is your code located? ./
   ```
   → **./** 입력 (현재 디렉토리, Enter)

6. **Want to override the settings?**
   ```
   ? Want to override the settings? [y/N]
   ```
   → **N** 입력 (기본 설정 사용)

**빌드 및 배포 진행:**
- 자동으로 `npm install` 실행
- 자동으로 `npm run build` 실행
- 배포 진행 상황 표시

### 6단계: 배포 완료

**성공 메시지 예시:**
```
✅ Production: https://your-project.vercel.app [copied to clipboard]
```

**배포 정보:**
- **Production URL**: 실제 사이트 주소
- **Preview URL**: 프리뷰 주소 (있는 경우)

### 7단계: 사이트 확인

1. 브라우저에서 Production URL 접속
2. 사이트가 정상적으로 로드되는지 확인
3. API 키 입력 기능 테스트
4. 영어 지문 분석 기능 테스트

## 추가 명령어

### 프로덕션 배포 (업데이트)
```bash
vercel --prod
```
또는
```bash
vercel -p
```

### 프리뷰 배포
```bash
vercel
```
- 기본값은 프리뷰 배포

### 배포 목록 확인
```bash
vercel ls
```

### 배포 상세 정보 확인
```bash
vercel inspect
```

### 환경 변수 설정 (필요한 경우)
```bash
vercel env add VARIABLE_NAME
```

### 프로젝트 설정 확인
```bash
vercel project ls
```

## 문제 해결

### 1. 빌드 에러 발생 시

**에러 확인:**
```bash
npm run build
```

**일반적인 해결 방법:**
- `node_modules` 삭제 후 재설치:
  ```bash
  rm -rf node_modules
  npm install
  ```

### 2. 로그인 문제

**로그아웃 후 재로그인:**
```bash
vercel logout
vercel login
```

### 3. 배포 취소

**마지막 배포 취소:**
```bash
vercel remove
```

### 4. 도메인 설정

**커스텀 도메인 추가:**
1. Vercel 웹사이트 접속
2. 프로젝트 선택
3. Settings → Domains
4. 도메인 추가

## 배포 후 확인사항

- [ ] 사이트가 정상적으로 로드됨
- [ ] API 키 입력 화면이 표시됨
- [ ] 영어 지문 입력 및 분석 기능 작동
- [ ] 이미지 생성 기능 작동
- [ ] PDF 저장 기능 작동
- [ ] 모바일에서도 정상 작동

## 다음 단계

1. **GitHub 연동** (선택사항)
   - GitHub 저장소와 연결하면 자동 배포 가능
   - 코드 푸시 시 자동으로 재배포

2. **커스텀 도메인 설정** (선택사항)
   - 자신의 도메인 연결 가능

3. **환경 변수 설정** (필요한 경우)
   - Vercel 대시보드에서 설정

## 참고

- Vercel은 무료 플랜 제공 (제한 있음)
- 프로젝트당 무료 도메인 제공 (`.vercel.app`)
- 자동 HTTPS 지원
- 전 세계 CDN으로 빠른 로딩

