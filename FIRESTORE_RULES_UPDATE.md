# Firestore 보안 규칙 업데이트 가이드

영어/수학 과제 관리 대시보드가 분리되면서 새로운 Firestore 컬렉션이 생성되었습니다. 
다음 보안 규칙을 Firebase Console에 추가해야 합니다.

## 필요한 Firestore 보안 규칙

Firebase Console (https://console.firebase.google.com) → Firestore Database → 규칙 탭에서 다음 규칙을 추가하세요:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 기존 컬렉션
    match /homeworkProgress/{document} {
      allow read, write: if true;
    }
    
    // 영어 과제 관리 대시보드
    match /englishHomeworkProgress/{document} {
      allow read, write: if true;
    }
    
    // 수학 과제 관리 대시보드
    match /mathHomeworkProgress/{document} {
      allow read, write: if true;
    }
    
    // 기타 컬렉션들
    match /pocketbook/{document} {
      allow read, write: if true;
    }
    
    match /blank/{document} {
      allow read, write: if true;
    }
    
    match /sources/{document} {
      allow read, write: if true;
    }
  }
}
```

## 업데이트 방법

1. **Firebase Console 접속**
   - https://console.firebase.google.com 접속
   - 프로젝트 선택

2. **Firestore Database 메뉴**
   - 왼쪽 메뉴에서 "Firestore Database" 클릭
   - "규칙" 탭 클릭

3. **규칙 업데이트**
   - 위의 규칙을 복사하여 붙여넣기
   - "게시" 버튼 클릭
   - 규칙 업데이트 완료 확인

## 주의사항

⚠️ **보안 규칙은 프로덕션 환경에 따라 조정해야 합니다.**
- 현재 규칙(`allow read, write: if true;`)은 모든 사용자가 모든 데이터를 읽고 쓸 수 있도록 허용합니다.
- 프로덕션 환경에서는 인증된 사용자만 접근할 수 있도록 더 엄격한 규칙을 설정하는 것을 권장합니다.

## 문제 해결

### 오류 메시지: "Missing or insufficient permissions"
- 위의 보안 규칙이 제대로 추가되었는지 확인
- 컬렉션 이름이 정확한지 확인 (`englishHomeworkProgress`, `mathHomeworkProgress`)
- 규칙을 게시한 후 몇 분 정도 기다린 후 다시 시도

### 여전히 오류가 발생하는 경우
- 브라우저를 새로고침
- Firebase Console에서 규칙이 제대로 저장되었는지 확인
- 브라우저 개발자 도구의 콘솔에서 상세한 오류 메시지 확인



