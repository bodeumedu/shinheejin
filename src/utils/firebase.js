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

// Firebase 설정 확인 (로그는 한 번만 출력)
let hasLoggedConfig = false;
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
  
  // 로그는 한 번만 출력 (초기화 시에만)
  if (!hasLoggedConfig) {
    hasLoggedConfig = true;
    if (configured) {
      console.log('✅ Firebase 설정 확인 완료:', {
        projectId: firebaseConfig.projectId,
        authDomain: firebaseConfig.authDomain,
      });
    } else {
      console.warn('⚠️ Firebase가 제대로 설정되지 않았습니다.');
    }
  }
  
  return configured;
};

// Firebase 초기화
let app = null;
let db = null;

try {
  if (isFirebaseConfigured()) {
    console.log('🚀 Firebase 초기화 시도 중...');
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
    
    console.log('✅ Firebase 초기화 성공!', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      db: db ? '생성됨' : '생성 실패'
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
    console.error('');
    console.error('💡 Vercel에 환경 변수를 설정한 경우, 재배포가 필요합니다.');
  }
} catch (error) {
  console.error('❌ Firebase 초기화 실패:', error);
  console.error('오류 상세:', error.message);
  console.error('스택:', error.stack);
}

export { db, isFirebaseConfigured };
export default app;

