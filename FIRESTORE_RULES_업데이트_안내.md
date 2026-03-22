# Firestore 보안 규칙 업데이트 안내

클리닉 대장의 Firestore 동기화를 위해 다음 컬렉션에 대한 읽기/쓰기 권한을 추가해야 합니다.

## 업데이트할 보안 규칙

Firebase Console (https://console.firebase.google.com)에서 프로젝트를 선택하고, **Firestore Database > 규칙** 탭으로 이동한 후, 아래 규칙을 추가하세요:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 기존 규칙들...
    
    // 클리닉 대장 기록 (주차별)
    match /clinicLogRecords/{weekKey} {
      allow read, write: if true;
    }
    
    // 클리닉 대장 수동 등록 학생 (주차별)
    match /clinicLogCustoms/{weekKey} {
      allow read, write: if true;
    }
    
    // 클리닉 대장 카카오톡 전송 내역 (주차별)
    match /clinicKakaoHistory/{weekKey} {
      allow read, write: if true;
    }
    
    // 학생 전화번호 관리 (기존)
    match /studentPhoneNumbers/{document=**} {
      allow read, write: if true;
    }
    
    // 윈터스쿨 관리 (기존)
    match /winterSchoolPlanners/{date} {
      allow read, write: if true;
    }
  }
}
```

## 전체 규칙 예시

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 모든 컬렉션에 대한 읽기/쓰기 권한 허용
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**주의**: 위 규칙은 모든 사용자에게 모든 데이터에 대한 읽기/쓰기 권한을 부여합니다. 프로덕션 환경에서는 더 엄격한 규칙을 사용하는 것을 권장합니다.

## 규칙 적용 방법

1. Firebase Console에 로그인
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **Firestore Database** 클릭
4. **규칙** 탭 클릭
5. 위의 규칙을 입력
6. **게시** 버튼 클릭

규칙이 적용되면 클리닉 대장이 Firestore와 동기화됩니다.








