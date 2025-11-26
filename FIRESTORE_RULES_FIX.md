# Firestore 연결 타임아웃 해결 방법

## 문제 상황
- ✅ Firebase 초기화 성공
- ❌ Firestore 연결 타임아웃 발생
- 데이터가 실시간으로 동기화되지 않음

## 원인
가장 흔한 원인은 **Firestore 보안 규칙**이 제대로 설정되지 않은 경우입니다.

## 해결 방법

### 1. Firebase Console 접속
1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택 (heejinooding)

### 2. Firestore Database 열기
1. 왼쪽 메뉴에서 **"Firestore Database"** 클릭
2. 상단 탭에서 **"규칙"** 클릭

### 3. 보안 규칙 설정
다음 규칙을 복사하여 붙여넣기:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 과제 진행 상황 컬렉션
    match /homeworkProgress/{document} {
      // 모든 사용자가 읽고 쓸 수 있음 (공개 데이터)
      allow read, write: if true;
    }
  }
}
```

### 4. 규칙 게시
1. 규칙 입력 후 **"게시"** 버튼 클릭
2. 확인 메시지에서 **"게시"** 클릭

### 5. 확인
1. 브라우저 페이지 새로고침
2. 브라우저 콘솔(F12)에서 다음 메시지 확인:
   - ✅ `Firestore 연결 성공!`
   - ✅ `Firestore에서 데이터 불러옴`
   - ✅ `기본 데이터 저장 완료!`

## 보안 주의사항
⚠️ 현재 규칙은 모든 사용자가 읽고 쓸 수 있습니다.
- 개발/테스트 단계에서는 문제없습니다
- 나중에 인증을 추가하여 특정 사용자만 접근하도록 변경할 수 있습니다

## 추가 확인 사항
만약 보안 규칙을 설정했는데도 여전히 타임아웃이 발생한다면:

1. **Firestore 데이터베이스가 생성되었는지 확인**
   - Firebase Console → Firestore Database → 데이터 탭
   - 데이터베이스가 없으면 생성

2. **네트워크 연결 확인**
   - 인터넷 연결 상태 확인
   - 방화벽이나 VPN이 Firestore 접근을 차단하지 않는지 확인

3. **브라우저 콘솔의 오류 메시지 확인**
   - F12 → Console 탭
   - 구체적인 오류 코드와 메시지 확인
   - `permission-denied` 오류 → 보안 규칙 문제
   - 다른 오류 → 해당 오류 코드로 검색

## 성공 확인
다음과 같이 나타나면 성공입니다:

### 브라우저 콘솔:
```
✅ Firebase 초기화 성공
🔄 Firestore 연결 시도 중...
✅ Firestore 연결 성공!
📥 Firestore에서 데이터 불러옴
```

### 웹 페이지:
- "Firebase 설정 필요" 경고 메시지가 사라짐
- 학생 목록이 정상적으로 표시됨
- 학생 추가/체크박스 변경 시 즉시 저장됨

