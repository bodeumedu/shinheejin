# Firestore 보안 규칙 - 주간시간표

주간시간표 기능을 사용하려면 Firestore 보안 규칙을 업데이트해야 합니다.

## Firebase 콘솔에서 규칙 업데이트

1. [Firebase Console](https://console.firebase.google.com) 접속
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **Firestore Database** 클릭
4. **규칙** 탭 클릭
5. 다음 규칙을 추가:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 기존 규칙들...
    
    // 주간시간표 데이터 (누구나 읽기/쓰기 가능)
    match /weeklySchedules/{document=**} {
      allow read, write: if true;
    }
    
    // 주간시간표 휴강 정보 (누구나 읽기/쓰기 가능)
    match /weeklyScheduleCancellations/{document=**} {
      allow read, write: if true;
    }
  }
}
```

6. **게시** 버튼 클릭

## 보안 고려사항

현재 규칙은 누구나 읽기/쓰기가 가능하도록 설정되어 있습니다. 
더 안전하게 사용하려면 인증을 추가하거나 특정 조건을 추가할 수 있습니다.

## 규칙 적용 확인

규칙을 업데이트한 후 브라우저를 새로고침하고 휴강 체크 기능을 다시 시도해보세요.


