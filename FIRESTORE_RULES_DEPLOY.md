# Firestore 규칙 배포 (권한 오류 시)

`Missing or insufficient permissions` 오류가 나면 **Firestore 규칙이 Firebase 서버에 반영되지 않은 상태**일 수 있습니다.

## 해결 방법

1. **Firebase CLI 로그인** (한 번만)
   ```bash
   firebase login
   ```

2. **프로젝트 폴더에서 규칙 배포**
   ```bash
   cd pocketbook-dev
   firebase deploy --only firestore:rules
   ```

3. 배포가 끝나면 브라우저에서 페이지를 **새로고침**한 뒤 다시 시도하세요.

## 규칙이 포함하는 컬렉션

- `homeworkCompletionPhoneNumbers` – 숙제 과제 완료도 학생/전화번호
- `homeworkCompletionSentCounts` – 전송 횟수
- `homeworkCompletionSendHistory` – 전송 이력
- `homeworkCompletionDateData` – 날짜별 완료도/과제
- 그 외 `firestore.rules`에 정의된 모든 컬렉션

배포 후에도 같은 오류가 나면 Firebase 콘솔 → Firestore Database → 규칙 탭에서 위 컬렉션에 대한 규칙이 실제로 적용돼 있는지 확인하세요.
