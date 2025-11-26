# 카카오톡 알림톡 템플릿 테스트 가이드

템플릿 검수 전에 메시지가 제대로 오는지 테스트하는 방법입니다.

## 방법 1: 솔라피에서 직접 테스트 (가장 확실한 방법)

### 1. 솔라피 대시보드 접속
1. [솔라피](https://solapi.com) 로그인
2. **메시지 → 알림톡 → 템플릿 목록** 또는 **테스트 발송** 메뉴

### 2. 템플릿 테스트 발송
1. 테스트 발송 기능 사용
2. 템플릿 코드 입력
3. 변수 값 입력:
   ```json
   {
     "title": "테스트 제목",
     "content": "테스트 내용입니다.\n\n학생별 진행 상황..."
   }
   ```
4. 본인 전화번호 입력
5. 발송하여 실제 수신 확인

## 방법 2: 브라우저 콘솔에서 테스트 (로컬 테스트)

개발자 도구(F12)를 열고 콘솔에서 실행:

```javascript
// 1. 메시지 내용 미리보기
const testTitle = "과천중앙고등학교 2학년 월요일반 과제 진행상황";
const testContent = `[고2모의고사]
9월 10월 

[보듬내신모의고사]
1회 2회 3회 

━━━━━━━━━━━━━━━━━━━━

👤 홍길동
✅ 고2모의고사: 9월, 10월
✅ 보듬내신모의고사: 1회, 2회`;

// 템플릿 형식으로 포맷팅
const template = `📋 과제 진행 상황 안내

${testTitle}

━━━━━━━━━━━━━━━━━━━━

${testContent}

━━━━━━━━━━━━━━━━━━━━

자세한 내용은 학원에서 확인해주세요.

보듬교육`;

console.log('템플릿 미리보기:');
console.log(template);
console.log('\n변수 값:');
console.log(JSON.stringify({
  title: testTitle,
  content: testContent
}, null, 2));
```

## 방법 3: API 테스트 페이지 만들기

로컬에서 직접 테스트할 수 있는 HTML 페이지를 만들어 드립니다.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>카카오톡 템플릿 테스트</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
        }
        .section {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, textarea {
            width: 100%;
            padding: 10px;
            margin-bottom: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        textarea {
            height: 200px;
            font-family: monospace;
        }
        button {
            background-color: #FEE500;
            color: #000;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
        }
        button:hover {
            background-color: #FFE500;
        }
        .preview {
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            white-space: pre-wrap;
            font-family: monospace;
            margin-top: 10px;
        }
        .success {
            color: green;
            font-weight: bold;
        }
        .error {
            color: red;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <h1>📱 카카오톡 알림톡 템플릿 테스트</h1>

    <!-- 1. 변수 입력 -->
    <div class="section">
        <h2>1. 변수 값 입력</h2>
        <label for="title">제목 (${title}):</label>
        <input type="text" id="title" value="과천중앙고등학교 2학년 월요일반 과제 진행상황" placeholder="제목을 입력하세요">
        
        <label for="content">내용 (${content}):</label>
        <textarea id="content" placeholder="내용을 입력하세요">[고2모의고사]
9월 10월 

[보듬내신모의고사]
1회 2회 3회 

━━━━━━━━━━━━━━━━━━━━

👤 홍길동
✅ 고2모의고사: 9월, 10월
✅ 보듬내신모의고사: 1회, 2회
📊 점수: 고2모의고사 9월 (80점)</textarea>
    </div>

    <!-- 2. 템플릿 미리보기 -->
    <div class="section">
        <h2>2. 템플릿 미리보기</h2>
        <button onclick="updatePreview()">미리보기 업데이트</button>
        <div id="preview" class="preview"></div>
    </div>

    <!-- 3. 실제 발송 테스트 -->
    <div class="section">
        <h2>3. 실제 발송 테스트</h2>
        <label for="phone">전화번호:</label>
        <input type="text" id="phone" placeholder="01012345678" value="">
        
        <label for="templateCode">템플릿 코드:</label>
        <input type="text" id="templateCode" placeholder="TL-1234567890" value="">
        
        <button onclick="sendTest()">테스트 발송</button>
        <div id="result"></div>
    </div>

    <script>
        // 템플릿 형식
        const templateFormat = `📋 과제 진행 상황 안내

\${title}

━━━━━━━━━━━━━━━━━━━━

\${content}

━━━━━━━━━━━━━━━━━━━━

자세한 내용은 학원에서 확인해주세요.

보듬교육`;

        function updatePreview() {
            const title = document.getElementById('title').value;
            const content = document.getElementById('content').value;
            
            const preview = templateFormat
                .replace('${title}', title)
                .replace('${content}', content);
            
            document.getElementById('preview').textContent = preview;
        }

        async function sendTest() {
            const phone = document.getElementById('phone').value;
            const templateCode = document.getElementById('templateCode').value;
            const title = document.getElementById('title').value;
            const content = document.getElementById('content').value;
            
            if (!phone || !templateCode) {
                document.getElementById('result').innerHTML = 
                    '<span class="error">전화번호와 템플릿 코드를 입력해주세요.</span>';
                return;
            }

            document.getElementById('result').innerHTML = '발송 중...';

            try {
                const response = await fetch('/api/send-kakao', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        phoneNumber: phone.replace(/-/g, ''),
                        templateCode: templateCode,
                        variables: {
                            title: title,
                            content: content
                        }
                    }),
                });

                const result = await response.json();

                if (result.success) {
                    document.getElementById('result').innerHTML = 
                        '<span class="success">✅ 발송 성공! 카카오톡을 확인해주세요.</span>';
                } else {
                    document.getElementById('result').innerHTML = 
                        `<span class="error">❌ 발송 실패: ${result.error}</span>`;
                }
            } catch (error) {
                document.getElementById('result').innerHTML = 
                    `<span class="error">❌ 오류: ${error.message}</span>`;
            }
        }

        // 페이지 로드 시 미리보기 업데이트
        updatePreview();
    </script>
</body>
</html>
```

## 방법 4: Postman 또는 curl로 테스트

```bash
curl -X POST https://your-domain.vercel.app/api/send-kakao \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "01012345678",
    "templateCode": "TL-1234567890",
    "variables": {
      "title": "과천중앙고등학교 2학년 월요일반 과제 진행상황",
      "content": "[고2모의고사]\n9월 10월\n\n[보듬내신모의고사]\n1회 2회"
    }
  }'
```

## 방법 5: 카카오톡 개발자 콘솔에서 미리보기

1. 카카오톡 개발자 콘솔 → 메시지 템플릿 상세
2. 템플릿 작성 시 **미리보기** 기능 사용
3. 변수 값을 입력하여 실제 메시지 확인

## 주의사항

1. **검수 전 발송 제한**: 
   - 템플릿이 검수 승인되지 않으면 실제 발송이 실패할 수 있습니다
   - 테스트 발송도 검수 승인된 템플릿만 가능할 수 있습니다

2. **템플릿 코드 확인**:
   - 검수 승인 후 솔라피에서 템플릿 코드를 확인해야 합니다
   - 검수 전에는 템플릿 코드가 없을 수 있습니다

3. **변수 형식**:
   - 변수는 `${변수명}` 형식으로 정확히 일치해야 합니다
   - 대소문자 구분합니다

## 빠른 체크리스트

- [ ] 템플릿 내용이 올바르게 입력되었는지 확인
- [ ] 변수명이 정확한지 확인 (${title}, ${content})
- [ ] 변수 값이 올바르게 포맷팅되었는지 확인
- [ ] 템플릿 미리보기로 실제 모습 확인
- [ ] 검수 승인 후 실제 발송 테스트

