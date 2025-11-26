import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// Firebase 설정
// 환경 변수에서 가져오거나, 직접 설정할 수 있습니다
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "your-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "your-project-id",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "your-project.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "your-app-id"
};

// Firebase 설정 확인
const isFirebaseConfigured = () => {
  const configured = firebaseConfig.apiKey !== "your-api-key" &&
         firebaseConfig.apiKey !== undefined &&
         firebaseConfig.apiKey !== "" &&
         firebaseConfig.projectId !== "your-project-id" &&
         firebaseConfig.projectId !== undefined &&
         firebaseConfig.projectId !== "" &&
         firebaseConfig.authDomain !== "your-project.firebaseapp.com" &&
         firebaseConfig.authDomain !== undefined &&
         firebaseConfig.authDomain !== "";
  
  // 디버깅 정보 출력
  if (!configured) {
    console.warn('Firebase 설정 확인:', {
      apiKey: firebaseConfig.apiKey ? '설정됨' : '미설정',
      projectId: firebaseConfig.projectId ? '설정됨' : '미설정',
      authDomain: firebaseConfig.authDomain ? '설정됨' : '미설정',
      env: {
        VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY ? '존재' : '없음',
        VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID ? '존재' : '없음',
        VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? '존재' : '없음',
      }
    });
  }
  
  return configured;
};

// Firebase 초기화
let app = null;
let db = null;

try {
  if (isFirebaseConfigured()) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    
    // 오프라인 지속성 활성화 (오프라인에서도 저장 가능)
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('⚠️ Firebase 오프라인 지속성: 여러 탭이 열려있습니다. 한 탭에서만 사용 가능합니다.');
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Firebase 오프라인 지속성: 브라우저가 지원하지 않습니다.');
      } else {
        console.warn('⚠️ Firebase 오프라인 지속성 활성화 실패:', err);
      }
    });
    
    console.log('✅ Firebase 초기화 성공', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain
    });
  } else {
    console.error('❌ Firebase 환경 변수가 설정되지 않았습니다.');
    console.error('필요한 환경 변수:');
    console.error('- VITE_FIREBASE_API_KEY');
    console.error('- VITE_FIREBASE_AUTH_DOMAIN');
    console.error('- VITE_FIREBASE_PROJECT_ID');
    console.error('- VITE_FIREBASE_STORAGE_BUCKET');
    console.error('- VITE_FIREBASE_MESSAGING_SENDER_ID');
    console.error('- VITE_FIREBASE_APP_ID');
  }
} catch (error) {
  console.error('❌ Firebase 초기화 실패:', error);
  console.error('오류 상세:', error.message);
}

export { db, isFirebaseConfigured };
export default app;

