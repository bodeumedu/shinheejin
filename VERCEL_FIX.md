# PowerShell 실행 정책 오류 해결 방법

## 문제
PowerShell에서 `vercel login` 실행 시 보안 오류 발생

## 해결 방법 3가지

### 방법 1: npx 사용 (가장 간단, 추천)

전역 설치 없이 `npx`로 실행:

```bash
npx vercel login
```

또는 배포도:
```bash
npx vercel
```

### 방법 2: cmd(Command Prompt) 사용

1. PowerShell 대신 **cmd** 열기
   - Windows 키 + R
   - `cmd` 입력 후 Enter

2. 프로젝트 폴더로 이동
   ```cmd
   cd C:\Users\jin12\Downloads\pocketbook
   ```

3. Vercel 명령어 실행
   ```cmd
   npx vercel login
   ```

### 방법 3: PowerShell 실행 정책 변경 (관리자 권한 필요)

1. PowerShell을 **관리자 권한**으로 실행
   - Windows 키 검색 → "PowerShell" → 우클릭 → "관리자 권한으로 실행"

2. 실행 정책 확인
   ```powershell
   Get-ExecutionPolicy
   ```

3. 실행 정책 변경
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

4. 확인 질문에 **Y** 입력

5. 다시 시도
   ```powershell
   vercel login
   ```

## 추천: 방법 1 (npx 사용)

가장 간단하고 안전한 방법입니다.

