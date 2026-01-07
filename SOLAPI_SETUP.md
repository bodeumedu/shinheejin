# 솔라피(Solapi) 카카오톡 알림톡 연동 가이드

## 1. 솔라피 계정 및 서비스 준비

### 1.1 솔라피 가입
1. [솔라피 홈페이지](https://solapi.com)에 가입
2. 인증 완료 후 대시보드 접속

### 1.2 카카오톡 비즈니스 채널 준비
1. 카카오톡 비즈니스 계정 생성
2. 플러스친구 등록 및 검수 완료
3. 알림톡 템플릿 등록 (카카오톡 비즈니스 센터에서)

### 1.3 솔라피에서 카카오톡 서비스 활성화
1. 솔라피 대시보드 → 서비스 관리 → 카카오톡 활성화
2. 카카오톡 비즈니스 채널 연동
3. 플러스친구 ID 확인

## 2. 솔라피 API 키 발급

1. 솔라피 대시보드 → API 인증정보
2. API Key와 API Secret 복사 (나중에 사용)

## 3. 알림톡 템플릿 등록

### 3.1 카카오톡 비즈니스 센터에서 템플릿 등록
1. [카카오톡 비즈니스 센터](https://business.kakao.com) 접속
2. 알림톡 → 템플릿 만들기
3. 템플릿 내용 작성 (변수 사용 가능: #{변수명})
4. 검수 신청 및 승인 대기

### 3.2 솔라피에서 템플릿 코드 확인
1. 솔라피 대시보드 → 알림톡 → 템플릿 목록
2. 승인된 템플릿의 템플릿 코드 복사

## 4. 환경 변수 설정

### 4.1 로컬 개발 환경 (.env 파일)
프로젝트 루트에 `.env` 파일 생성:

```env
SOLAPI_API_KEY=your_api_key_here
SOLAPI_API_SECRET=your_api_secret_here
SOLAPI_PF_ID=your_plus_friend_id_here
SOLAPI_SENDER_NUMBER=01012345678
SOLAPI_TEMPLATE_CODE=your_template_code_here
```

### 4.2 Vercel 환경 변수 설정
1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. 프로젝트 선택 → Settings → Environment Variables
3. 다음 환경 변수 추가:
   - `SOLAPI_API_KEY`: 솔라피 API Key
   - `SOLAPI_API_SECRET`: 솔라피 API Secret
   - `SOLAPI_PF_ID`: 플러스친구 ID
   - `SOLAPI_SENDER_NUMBER`: 발신번호 (등록된 번호)
   - `SOLAPI_TEMPLATE_CODE`: 알림톡 템플릿 코드

4. Production, Preview, Development 모두에 적용
5. 저장 후 재배포 필요

## 5. 알림톡 템플릿 예시

### 기본 템플릿 구조
```
[과제 진행 상황 안내]

#{title}

#{content}

자세한 내용은 학원에서 확인해주세요.
```

### 템플릿 변수
- `#{title}`: 제목 (학교/학년/반)
- `#{content}`: 과제 상황 내용

## 6. 사용 방법

1. "카카오톡 전송" 버튼 클릭
2. 전화번호 입력 (예: 01012345678)
3. 자동으로 알림톡 발송

## 7. 테스트

### 7.1 로컬 테스트
```bash
npm run dev
```

### 7.2 API 엔드포인트 테스트
```bash
curl -X POST http://localhost:3000/api/send-kakao \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "01012345678",
    "templateCode": "YOUR_TEMPLATE_CODE",
    "variables": {
      "title": "테스트 제목",
      "content": "테스트 내용"
    }
  }'
```

## 8. 주의사항

1. **비용**: 솔라피는 유료 서비스입니다. 알림톡 발송 시 건당 비용이 발생합니다.
2. **템플릿 검수**: 카카오톡 알림톡 템플릿은 검수를 거쳐야 승인됩니다.
3. **발신번호 등록**: 솔라피에 발신번호를 등록해야 합니다.
4. **플러스친구**: 플러스친구 검수 완료 후 연동 가능합니다.
5. **API 키 보안**: API 키는 절대 공개하지 마세요. 환경 변수로만 관리하세요.

## 9. 문제 해결

### 9.1 발송 실패 시
- 솔라피 대시보드 → 발송 내역에서 오류 확인
- 환경 변수 설정 확인
- 템플릿 코드 확인
- 플러스친구 연동 상태 확인

### 9.2 템플릿 변수 오류
- 템플릿에 등록된 변수명과 일치하는지 확인
- 변수명은 대소문자 구분

### 9.3 Vercel 배포 후 오류
- 환경 변수가 제대로 설정되었는지 확인
- 재배포 필요

## 10. 솔라피 문의

- 솔라피 고객센터: [문의하기](https://solapi.com/contact)
- 솔라피 API 문서: [API 문서](https://docs.solapi.com)



