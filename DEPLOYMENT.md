# 배포 가이드

## 배포 방법

이 프로젝트는 Vite + React로 구성되어 있으며, 여러 플랫폼에 배포할 수 있습니다.

### 방법 1: Vercel 배포 (추천)

Vercel은 Vite 프로젝트를 자동으로 감지하고 배포합니다.

#### GitHub를 통한 배포 (권장)

1. **GitHub에 코드 푸시**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Vercel에 배포**
   - [Vercel](https://vercel.com)에 가입/로그인
   - "New Project" 클릭
   - GitHub 저장소 선택
   - 프로젝트 설정:
     - Framework Preset: Vite
     - Build Command: `npm run build`
     - Output Directory: `dist`
   - "Deploy" 클릭

#### Vercel CLI를 통한 배포

1. **Vercel CLI 설치**
   ```bash
   npm install -g vercel
   ```

2. **배포**
   ```bash
   vercel
   ```
   - 처음 실행 시 로그인 필요
   - 프로젝트 설정 질문에 답변
   - 배포 완료!

### 방법 2: Netlify 배포

1. **Netlify에 가입/로그인**
   - [Netlify](https://www.netlify.com) 접속

2. **GitHub 연동 또는 드래그 앤 드롭**
   - GitHub 저장소 연결 또는 `dist` 폴더 직접 업로드

3. **빌드 설정**
   - Build command: `npm run build`
   - Publish directory: `dist`

### 방법 3: GitHub Pages 배포

1. **vite.config.js 수정**
   ```javascript
   import { defineConfig } from 'vite'
   import react from '@vitejs/plugin-react'

   export default defineConfig({
     plugins: [react()],
     base: '/your-repo-name/' // GitHub 저장소 이름으로 변경
   })
   ```

2. **GitHub Actions 설정**
   - `.github/workflows/deploy.yml` 파일 생성
   - GitHub Actions로 자동 배포 설정

### 로컬 빌드 테스트

배포 전에 로컬에서 빌드가 제대로 되는지 확인:

```bash
npm run build
npm run preview
```

`dist` 폴더가 생성되고, `http://localhost:4173`에서 미리보기를 확인할 수 있습니다.

## 주의사항

- **API 키**: 이 애플리케이션은 클라이언트 사이드에서 OpenAI API를 직접 호출합니다.
  - API 키는 사용자의 브라우저에만 저장되며 서버로 전송되지 않습니다.
  - 배포 후에도 각 사용자가 자신의 API 키를 입력해야 합니다.

- **CORS**: OpenAI API는 CORS를 지원하므로 브라우저에서 직접 호출 가능합니다.

- **비용**: OpenAI API 사용 시 비용이 발생할 수 있습니다. 사용자에게 API 키를 입력하도록 안내하세요.

## 배포 후 확인사항

1. ✅ 빌드가 성공적으로 완료되는지 확인
2. ✅ 사이트가 정상적으로 로드되는지 확인
3. ✅ API 키 입력 기능이 작동하는지 확인
4. ✅ 이미지 생성이 정상적으로 작동하는지 확인
5. ✅ PDF 저장 기능이 정상적으로 작동하는지 확인

