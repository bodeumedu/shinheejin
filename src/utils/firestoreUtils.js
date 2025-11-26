import { collection, doc, setDoc, getDocs, getDoc, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

/**
 * 포켓북 지문의 고유 ID 생성 (출처+챕터+문항번호 조합)
 * @param {Object} data - 저장할 데이터
 * @returns {string} - 고유 문서 ID
 */
function getPocketbookUniqueId(data) {
  const sourceInfo = data.sourceInfo;
  if (!sourceInfo || sourceInfo.type !== 'book') {
    // 모의고사나 출처 정보가 없으면 기존 방식 사용
    return null;
  }
  
  const bookName = (sourceInfo.bookName || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9가-힣_]/g, '');
  const chapter = (sourceInfo.chapter || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9가-힣_]/g, '');
  const questionNumber = (data.questionNumber || '').toString().replace(/\s+/g, '_');
  
  if (!bookName || !chapter || !questionNumber) {
    return null; // 필수 정보가 없으면 기존 방식 사용
  }
  
  return `book_${bookName}_${chapter}_${questionNumber}`;
}

/**
 * 지문별 데이터를 Firestore에 저장
 * @param {string} featureType - 기능 타입 ('pocketbook', 'blank', 'sum15' 등)
 * @param {string} textId - 텍스트 고유 ID (또는 타임스탬프)
 * @param {number} index - 지문 인덱스 (0부터 시작)
 * @param {Object} data - 저장할 데이터
 * @returns {Promise<void>}
 */
export async function saveTextResult(featureType, textId, index, data, retryCount = 0) {
  const maxRetries = 3;
  const retryDelay = 2000; // 2초
  
  if (!isFirebaseConfigured() || !db) {
    console.warn('Firebase가 설정되지 않아 로컬에만 저장됩니다.');
    // 로컬 스토리지에 백업 저장
    const key = `${featureType}_${textId}_${index}`;
    localStorage.setItem(key, JSON.stringify(data));
    return;
  }

  try {
    // 포켓북인 경우 출처+챕터+문항번호 조합으로 고유 ID 생성 (중복 방지)
    let docId;
    if (featureType === 'pocketbook') {
      const uniqueId = getPocketbookUniqueId(data);
      if (uniqueId) {
        docId = uniqueId;
        console.log(`포켓북 고유 ID 사용: ${docId} (출처: ${data.sourceInfo?.bookName}, 챕터: ${data.sourceInfo?.chapter}, 문항: ${data.questionNumber})`);
      } else {
        // 고유 ID를 생성할 수 없으면 기존 방식 사용
        docId = `${textId}_${index}`;
        console.log(`포켓북 일반 ID 사용: ${docId}`);
      }
    } else {
      // 다른 기능은 기존 방식 유지
      docId = `${textId}_${index}`;
    }
    
    const docRef = doc(db, featureType, docId);
    
    // 기존 문서 확인 (오프라인 오류 처리)
    let existingDoc = null;
    try {
      existingDoc = await getDoc(docRef);
      if (existingDoc.exists()) {
        console.log(`⚠️ 이미 존재하는 지문 발견: ${docId}, 업데이트합니다.`);
      }
    } catch (getDocError) {
      // 오프라인 상태에서 getDoc 실패해도 계속 진행 (기존 문서 없음으로 간주)
      if (getDocError.code === 'unavailable' || getDocError.message?.includes('offline')) {
        console.warn(`⚠️ 오프라인 상태: 기존 문서 확인 불가 (${docId}), 새 문서로 저장합니다.`);
        existingDoc = null;
      } else {
        throw getDocError; // 다른 오류는 다시 던짐
      }
    }
    
    // setDoc 실행 (오프라인 상태에서도 호출 가능)
    await setDoc(docRef, {
      ...data,
      featureType,
      textId,
      index,
      savedAt: existingDoc?.exists() ? existingDoc.data().savedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // 오프라인 상태 표시
      _isPending: true, // 저장 대기 중 표시
    });
    
    // 오프라인 상태에서도 성공으로 처리 (Firebase가 자동으로 동기화)
    console.log(`✅ ${featureType} 지문 ${index + 1} ${existingDoc?.exists() ? '업데이트' : '저장'} 완료 (오프라인 상태에서는 자동 동기화 대기 중)`);
  } catch (error) {
    // 오프라인 오류인 경우 재시도
    if ((error.code === 'unavailable' || error.message?.includes('offline')) && retryCount < maxRetries) {
      console.warn(`⚠️ 오프라인 상태 감지, ${retryDelay / 1000}초 후 재시도 (${retryCount + 1}/${maxRetries})... (${featureType} 지문 ${index + 1})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return saveTextResult(featureType, textId, index, data, retryCount + 1);
    } else if (error.code === 'unavailable' || error.message?.includes('offline')) {
      // 최대 재시도 횟수 초과 - Firebase가 자동으로 재시도할 것임
      console.warn(`⚠️ 최대 재시도 횟수 초과. Firebase가 온라인 상태가 되면 자동으로 저장됩니다. (${featureType} 지문 ${index + 1})`);
      // setDoc은 오프라인에서도 호출하면 Firebase가 자동으로 재시도하므로, 여기서는 오류를 던지지 않음
      // 하지만 로컬 스토리지에도 백업 저장
      const key = `${featureType}_${textId}_${index}`;
      localStorage.setItem(key, JSON.stringify(data));
      return; // 성공으로 처리 (Firebase가 자동 재시도)
    }
    
    console.error(`❌ ${featureType} 지문 ${index + 1} 저장 실패:`, error);
    // 오류 발생 시 로컬 스토리지에 백업
    const key = `${featureType}_${textId}_${index}`;
    localStorage.setItem(key, JSON.stringify(data));
    throw error; // 다른 오류는 다시 던짐
  }
}

/**
 * 특정 textId의 모든 지문 결과 불러오기
 * @param {string} featureType - 기능 타입
 * @param {string} textId - 텍스트 고유 ID
 * @returns {Promise<Array>} - 정렬된 지문 결과 배열
 */
export async function loadTextResults(featureType, textId) {
  if (!isFirebaseConfigured() || !db) {
    console.warn('Firebase가 설정되지 않아 로컬에서 불러옵니다.');
    // 로컬 스토리지에서 불러오기
    const results = [];
    let index = 0;
    while (true) {
      const key = `${featureType}_${textId}_${index}`;
      const saved = localStorage.getItem(key);
      if (!saved) break;
      results.push(JSON.parse(saved));
      index++;
    }
    return results.sort((a, b) => (a.index || 0) - (b.index || 0));
  }

  try {
    const q = query(
      collection(db, featureType),
      where('textId', '==', textId),
      where('featureType', '==', featureType),
      orderBy('index', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const results = [];
    querySnapshot.forEach((doc) => {
      results.push({ id: doc.id, ...doc.data() });
    });
    
    return results.sort((a, b) => (a.index || 0) - (b.index || 0));
  } catch (error) {
    console.error(`❌ ${featureType} 결과 불러오기 실패:`, error);
    return [];
  }
}

/**
 * 특정 지문 결과 삭제
 * @param {string} featureType - 기능 타입
 * @param {string} textId - 텍스트 고유 ID
 * @param {number} index - 지문 인덱스
 * @returns {Promise<void>}
 */
export async function deleteTextResult(featureType, textId, index) {
  if (!isFirebaseConfigured() || !db) {
    // 로컬 스토리지에서 삭제
    const key = `${featureType}_${textId}_${index}`;
    localStorage.removeItem(key);
    return;
  }

  try {
    const docRef = doc(db, featureType, `${textId}_${index}`);
    await deleteDoc(docRef);
    console.log(`✅ ${featureType} 지문 ${index} 삭제 완료`);
  } catch (error) {
    console.error(`❌ ${featureType} 지문 ${index} 삭제 실패:`, error);
  }
}

/**
 * 고유 텍스트 ID 생성 (타임스탬프 기반)
 * @returns {string}
 */
export function generateTextId() {
  return `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function parseHomeworkDocMeta(docId, dataMeta = {}) {
  if (dataMeta && (dataMeta.school || dataMeta.grade || dataMeta.className)) {
    return {
      school: dataMeta.school || '',
      grade: dataMeta.grade || '',
      className: dataMeta.className || '',
      teacher: dataMeta.teacher || '',
    };
  }

  const prefix = 'homework_progress_';
  if (!docId.startsWith(prefix)) {
    return { school: '', grade: '', className: '', teacher: '' };
  }

  const remainder = docId.slice(prefix.length);
  const parts = remainder.split('_');
  const [school = '', gradeOrTeacher = '', ...classParts] = parts;
  const className = classParts.join('_');

  if (school === '중학교 1학년' && !className) {
    return {
      school,
      grade: '',
      className: '',
      teacher: gradeOrTeacher,
    };
  }

  return {
    school,
    grade: gradeOrTeacher,
    className: className || '',
    teacher: '',
  };
}

export async function loadAllHomeworkStudents() {
  if (!isFirebaseConfigured() || !db) {
    console.warn('Firebase 설정이 없어 학생 데이터를 불러올 수 없습니다.');
    return [];
  }

  try {
    const snapshot = await getDocs(collection(db, 'homeworkProgress'));
    const students = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const meta = parseHomeworkDocMeta(docSnap.id, data.meta);
      const list = data.students || [];

      list.forEach((studentName) => {
        students.push({
          id: `${docSnap.id}__${studentName}`,
          student: studentName,
          school: meta.school || '',
          grade: meta.grade || '',
          className: meta.className || meta.teacher || '',
          teacher: meta.teacher || '',
          docId: docSnap.id,
        });
      });
    });

    console.log(`✅ 클리닉 대장 학생 ${students.length}명 불러옴`);
    return students;
  } catch (error) {
    console.error('❌ 학생 목록 불러오기 실패:', error);
    return [];
  }
}

/**
 * 출처 정보를 Firestore에 저장
 * @param {Object} sourceInfo - 출처 정보
 * @param {string} textId - 텍스트 ID
 * @returns {Promise<void>}
 */
export async function saveSourceInfo(sourceInfo, textId, retryCount = 0) {
  if (!isFirebaseConfigured() || !db) {
    return;
  }

  const maxRetries = 3;
  const retryDelay = 2000; // 2초

  try {
    const docId = getSourceDocumentId(sourceInfo);
    const docRef = doc(db, 'sources', docId);
    
    // 기존 출처 정보 불러오기 (오프라인 상태에서도 작동하도록)
    let existingData = {};
    try {
      const existingDocSnap = await getDoc(docRef);
      existingData = existingDocSnap.exists() ? existingDocSnap.data() : {};
    } catch (readError) {
      // 읽기 실패 시 빈 객체로 시작 (오프라인 상태일 수 있음)
      console.warn('기존 출처 정보 읽기 실패, 새로 생성:', readError.message);
      existingData = {};
    }
    
    // 책인 경우 챕터별 구조로 저장
    if (sourceInfo.type === 'book' && sourceInfo.chapter) {
      const chapters = existingData.chapters || {};
      const chapterKey = sourceInfo.chapter;
      
      // 해당 챕터의 데이터 가져오기 또는 초기화
      const chapterData = chapters[chapterKey] || { textIds: [], questionNumbers: [] };
      
      // textIds 추가
      if (!chapterData.textIds.includes(textId)) {
        chapterData.textIds.push(textId);
      }
      
      // 문항번호 추가
      if (sourceInfo.questionNumbers && Array.isArray(sourceInfo.questionNumbers)) {
        chapterData.questionNumbers = [...new Set([...chapterData.questionNumbers, ...sourceInfo.questionNumbers])];
      } else if (sourceInfo.questionNumber && !chapterData.questionNumbers.includes(sourceInfo.questionNumber)) {
        chapterData.questionNumbers.push(sourceInfo.questionNumber);
      }
      
      // 문항번호 정렬
      chapterData.questionNumbers.sort((a, b) => {
        const numA = parseInt(a) || 0;
        const numB = parseInt(b) || 0;
        return numA - numB;
      });
      
      // 챕터 데이터 업데이트
      chapters[chapterKey] = chapterData;
      
      // 오프라인 상태에서도 저장 시도 (Firebase가 자동으로 재시도)
      await setDoc(docRef, {
        ...sourceInfo,
        chapters: chapters,
        lastUpdated: new Date().toISOString(),
        createdAt: existingData.createdAt || new Date().toISOString(),
      }, { merge: true });
    } else {
      // 모의고사 또는 기타 경우 기존 로직 유지
      const textIds = existingData.textIds || [];
      if (!textIds.includes(textId)) {
        textIds.push(textId);
      }
      
      let questionNumbers = existingData.questionNumbers || [];
      if (sourceInfo.questionNumbers && Array.isArray(sourceInfo.questionNumbers)) {
        questionNumbers = [...new Set([...questionNumbers, ...sourceInfo.questionNumbers])];
      } else if (sourceInfo.questionNumber && !questionNumbers.includes(sourceInfo.questionNumber)) {
        questionNumbers.push(sourceInfo.questionNumber);
      }
      
      await setDoc(docRef, {
        ...sourceInfo,
        textIds: textIds,
        questionNumbers: questionNumbers.sort((a, b) => {
          const numA = parseInt(a) || 0;
          const numB = parseInt(b) || 0;
          return numA - numB;
        }),
        lastUpdated: new Date().toISOString(),
        createdAt: existingData.createdAt || new Date().toISOString(),
      }, { merge: true });
    }
    
    console.log('✅ 출처 정보 저장 완료:', docId);
  } catch (error) {
    // 오프라인 오류인 경우 재시도
    if (error.code === 'unavailable' || error.message?.includes('offline')) {
      if (retryCount < maxRetries) {
        console.warn(`⚠️ 오프라인 상태 감지, ${retryDelay / 1000}초 후 재시도 (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return saveSourceInfo(sourceInfo, textId, retryCount + 1);
      } else {
        console.warn('⚠️ 최대 재시도 횟수 초과. Firebase가 온라인 상태가 되면 자동으로 저장됩니다.');
        // 오프라인 상태에서도 setDoc을 호출하면 Firebase가 자동으로 재시도
        // 여기서는 오류를 던지지 않고 성공으로 처리
        return;
      }
    }
    
    console.error('❌ 출처 정보 저장 실패:', error);
    throw error; // 다른 오류는 다시 던짐
  }
}

/**
 * 출처 문서 ID 생성 (책 이름만으로 생성, 챕터는 별도 구조)
 */
export function getSourceDocumentId(sourceInfo) {
  if (sourceInfo.type === 'book') {
    // 책 이름만으로 ID 생성 (챕터는 chapters 객체 내부에 저장)
    return `book_${(sourceInfo.bookName || 'unknown').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9가-힣_]/g, '')}`;
  } else if (sourceInfo.type === 'mockExam') {
    return `mockExam_${sourceInfo.grade || 'unknown'}_${sourceInfo.year || 'unknown'}_${(sourceInfo.month || 'unknown').replace(/[^0-9]/g, '')}`;
  }
  return `unknown_${Date.now()}`;
}

/**
 * 저장된 모든 출처 목록 불러오기 (책 이름별로 그룹화)
 * @param {string} featureType - 기능 타입 ('pocketbook', 'blank' 등). 특정 기능의 출처만 필터링하려면 제공
 * @returns {Promise<Array>} - 출처 목록 (책 이름만, 중복 제거)
 */
export async function loadAllSources(featureType = null) {
  if (!isFirebaseConfigured() || !db) {
    console.warn('⚠️ Firebase가 설정되지 않았습니다.');
    return [];
  }

  try {
    // featureType이 제공되면 해당 기능의 출처만 필터링 (sources 컬렉션은 모든 기능 공유)
    // 현재는 모든 출처를 반환 (featureType은 나중에 필요시 필터링에 사용)
    const q = query(collection(db, 'sources'), orderBy('lastUpdated', 'desc'));
    const querySnapshot = await getDocs(q);
    const sourcesMap = new Map(); // 책 이름별로 그룹화
    
    console.log(`📚 총 출처 문서 수: ${querySnapshot.size} (featureType: ${featureType || 'all'})`);
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      if (data.type === 'book') {
        const bookName = data.bookName || '알 수 없음';
        const sourceId = doc.id;
        
        // 문서 ID에서 기존 형식 (book_책이름_챕터)인지 확인
        const oldFormatMatch = sourceId.match(/^book_([^_]+(?:_[^_]+)*)_(.+)$/);
        let chapterFromId = null;
        if (oldFormatMatch && oldFormatMatch[2] && oldFormatMatch[2] !== 'unknown') {
          chapterFromId = oldFormatMatch[2].replace(/_/g, ' ');
        }
        
        // 이미 존재하는 책이면 chapters 병합
        if (sourcesMap.has(bookName)) {
          const existing = sourcesMap.get(bookName);
          const mergedChapters = { ...(existing.chapters || {}) };
          
          // 새 데이터의 chapters 병합
          if (data.chapters) {
            Object.assign(mergedChapters, data.chapters);
          }
          
          // 기존 형식 변환: chapter 필드 또는 문서 ID에서 챕터 추출
          const chapterKey = data.chapter || chapterFromId;
          if (chapterKey) {
            if (!mergedChapters[chapterKey]) {
              mergedChapters[chapterKey] = {
                questionNumbers: data.questionNumbers || [],
                textIds: data.textIds || []
              };
            } else {
              // 기존 챕터와 병합
              const existingQNums = mergedChapters[chapterKey].questionNumbers || [];
              const newQNums = data.questionNumbers || [];
              mergedChapters[chapterKey].questionNumbers = [...new Set([...existingQNums, ...newQNums])].sort((a, b) => {
                const numA = parseInt(a) || 0;
                const numB = parseInt(b) || 0;
                return numA - numB;
              });
              
              const existingTextIds = mergedChapters[chapterKey].textIds || [];
              const newTextIds = data.textIds || [];
              mergedChapters[chapterKey].textIds = [...new Set([...existingTextIds, ...newTextIds])];
            }
          }
          
          // 더 최신 lastUpdated 사용
          const mergedLastUpdated = new Date(data.lastUpdated) > new Date(existing.lastUpdated) 
            ? data.lastUpdated 
            : existing.lastUpdated;
          
          sourcesMap.set(bookName, {
            id: sourceId,
            ...existing,
            ...data,
            chapters: mergedChapters,
            lastUpdated: mergedLastUpdated
          });
        } else {
          // 새 책 추가
          let chapters = data.chapters || {};
          
          // 기존 형식 변환: chapter 필드 또는 문서 ID에서 챕터 추출
          const chapterKey = data.chapter || chapterFromId;
          if (chapterKey && !chapters[chapterKey]) {
            chapters[chapterKey] = {
              questionNumbers: data.questionNumbers || [],
              textIds: data.textIds || []
            };
          }
          
          sourcesMap.set(bookName, {
            id: sourceId,
            ...data,
            chapters: chapters
          });
        }
      } else {
        // 모의고사는 기존 방식 유지
        sourcesMap.set(doc.id, {
          id: doc.id,
          ...data
        });
      }
    });
    
    const result = Array.from(sourcesMap.values());
    console.log('그룹화된 출처 목록:', result);
    result.forEach(source => {
      if (source.type === 'book') {
        console.log(`책: ${source.bookName}, 챕터 수: ${source.chapters ? Object.keys(source.chapters).length : 0}`, source.chapters);
      }
    });
    
    return result;
  } catch (error) {
    console.error('❌ 출처 목록 불러오기 실패:', error);
    return [];
  }
}

/**
 * 특정 출처의 특정 챕터 지문 불러오기
 * @param {string} featureType - 기능 타입 ('pocketbook', 'blank' 등)
 * @param {string} sourceId - 출처 문서 ID
 * @param {string} chapter - 챕터 이름 (예: "Ch05 Unit14")
 * @param {Array} selectedQuestions - 선택된 문항번호 배열
 * @returns {Promise<Array>} - 지문 결과 배열
 */
export async function loadSourceTexts(featureType = 'pocketbook', sourceId, chapter = null, selectedQuestions = []) {
  if (!isFirebaseConfigured() || !db) {
    console.warn('⚠️ Firebase가 설정되지 않았습니다.');
    return [];
  }

  try {
    console.log(`🔍 지문 검색 시작: featureType=${featureType}, sourceId=${sourceId}, chapter=${chapter}, questions=${selectedQuestions.join(',')}`);
    
    // 출처 정보 불러오기
    const sourceDocRef = doc(db, 'sources', sourceId);
    const sourceDocSnap = await getDoc(sourceDocRef);
    
    if (!sourceDocSnap.exists()) {
      console.warn(`⚠️ 출처 문서가 존재하지 않습니다: ${sourceId}`);
      return [];
    }
    
    const sourceData = sourceDocSnap.data();
    console.log('📚 출처 정보:', sourceData);
    
    // 책이고 챕터가 지정된 경우
    if (sourceData.type === 'book' && chapter && sourceData.chapters && sourceData.chapters[chapter]) {
      const chapterData = sourceData.chapters[chapter];
      const textIds = chapterData.textIds || [];
      const questionNumbers = chapterData.questionNumbers || [];
      
      // featureType에 맞는 컬렉션에서 출처 정보와 문항번호로 직접 검색
      // textIds는 참고용으로만 사용 (포켓북과 빈칸이 다른 textId를 사용할 수 있음)
      const allTexts = [];
      
      // 방법 1: textIds를 사용하여 검색 (해당 featureType 컬렉션에 존재하는 경우)
      for (const textId of textIds) {
        try {
          const q = query(
            collection(db, featureType),
            where('textId', '==', textId),
            orderBy('index', 'asc')
          );
          
          const querySnapshot = await getDocs(q);
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            // 출처 정보 일치 확인
            const matchesSource = (
              (data.sourceInfo?.bookName === sourceData.bookName) &&
              (data.sourceInfo?.chapter === chapter || data.chapter === chapter)
            );
            
            if (matchesSource) {
              // 문항번호 필터링
              const qNum = String(data.questionNumber || '');
              const selectedQs = selectedQuestions.map(q => String(q));
              
              if (selectedQuestions.length === 0 || selectedQs.includes(qNum)) {
                allTexts.push({
                  id: doc.id,
                  ...data,
                  sourceInfo: sourceData,
                  chapter: chapter
                });
              }
            }
          });
        } catch (error) {
          // textId로 검색 실패 시 무시하고 계속 진행
          console.warn(`textId ${textId}로 검색 실패:`, error.message);
        }
      }
      
      // 방법 2: textIds로 찾지 못한 경우, 출처 정보와 문항번호로 직접 검색
      // textIds가 비어있거나 결과가 없으면 항상 직접 검색
      if (allTexts.length === 0) {
        console.log(`⚠️ textIds로 찾지 못함 (${allTexts.length}개, textIds: ${textIds.length}개). 출처 정보와 문항번호로 직접 검색 시도...`);
        console.log(`🔍 검색 조건: bookName="${sourceData.bookName}", chapter="${chapter}", questions=[${selectedQuestions.join(', ')}]`);
        
        const q = query(
          collection(db, featureType),
          orderBy('index', 'asc')
        );
        
        const querySnapshot = await getDocs(q);
        console.log(`📦 ${featureType} 컬렉션의 전체 문서 수: ${querySnapshot.size}`);
        
        const selectedQs = selectedQuestions.length > 0 ? selectedQuestions.map(q => String(q)) : [];
        let checkedCount = 0;
        let matchedBookNameCount = 0;
        let matchedChapterCount = 0;
        let matchedQuestionCount = 0;
        
        querySnapshot.forEach((doc) => {
          checkedCount++;
          const data = doc.data();
          
          // 디버깅: 처음 몇 개만 상세 로그
          if (checkedCount <= 5) {
            console.log(`📄 문서 ${checkedCount}:`, {
              id: doc.id,
              title: data.title?.substring(0, 30),
              questionNumber: data.questionNumber,
              sourceInfo: data.sourceInfo ? {
                bookName: data.sourceInfo.bookName,
                chapter: data.sourceInfo.chapter
              } : null
            });
          }
          
          // 출처 정보 일치 확인 (더 유연하게)
          const dataBookName = data.sourceInfo?.bookName || '';
          const sourceBookName = sourceData.bookName || '';
          const matchesBookName = dataBookName === sourceBookName;
          
          if (matchesBookName) {
            matchedBookNameCount++;
            
            const dataChapter = data.sourceInfo?.chapter || data.chapter || '';
            const matchesChapter = !chapter || dataChapter === chapter || dataChapter.includes(chapter) || chapter.includes(dataChapter);
            
            if (matchesChapter) {
              matchedChapterCount++;
              
              // 문항번호 필터링
              const qNum = String(data.questionNumber || '');
              if (selectedQuestions.length === 0 || selectedQs.includes(qNum)) {
                matchedQuestionCount++;
                console.log(`✅ 매칭된 지문:`, {
                  id: doc.id,
                  title: data.title,
                  questionNumber: qNum,
                  bookName: dataBookName,
                  chapter: dataChapter
                });
                
                allTexts.push({
                  id: doc.id,
                  ...data,
                  sourceInfo: sourceData,
                  chapter: chapter
                });
              } else if (checkedCount <= 10) {
                console.log(`❌ 문항번호 불일치: "${qNum}" not in [${selectedQs.join(', ')}]`);
              }
            } else if (checkedCount <= 10) {
              console.log(`❌ 챕터 불일치: "${dataChapter}" !== "${chapter}"`);
            }
          }
        });
        
        console.log(`📊 검색 결과: 전체 ${checkedCount}개 중 책 이름 일치 ${matchedBookNameCount}개, 챕터 일치 ${matchedChapterCount}개, 문항번호 일치 ${matchedQuestionCount}개, 최종 선택 ${allTexts.length}개`);
      }
      
      const sortedTexts = allTexts.sort((a, b) => (a.index || 0) - (b.index || 0));
      console.log(`📋 최종 결과: ${sortedTexts.length}개 지문 반환`);
      return sortedTexts;
    } else {
      // 모의고사 또는 기존 방식
      const textIds = sourceData.textIds || [];
      const allTexts = [];
      
      // 방법 1: textIds를 사용하여 검색
      for (const textId of textIds) {
        try {
          const q = query(
            collection(db, featureType),
            where('textId', '==', textId),
            orderBy('index', 'asc')
          );
          
          const querySnapshot = await getDocs(q);
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            // 출처 정보 일치 확인
            const matchesSource = (
              data.sourceInfo &&
              ((sourceData.type === 'mockExam' && 
                data.sourceInfo.grade === sourceData.grade &&
                data.sourceInfo.year === sourceData.year &&
                data.sourceInfo.month === sourceData.month) ||
               (sourceData.type === 'book' && 
                data.sourceInfo.bookName === sourceData.bookName))
            );
            
            if (matchesSource) {
              const qNum = String(data.questionNumber || '');
              const selectedQs = selectedQuestions.map(q => String(q));
              
              if (selectedQuestions.length === 0 || selectedQs.includes(qNum)) {
                allTexts.push({
                  id: doc.id,
                  ...data,
                  sourceInfo: sourceData
                });
              }
            }
          });
        } catch (error) {
          console.warn(`textId ${textId}로 검색 실패:`, error.message);
        }
      }
      
      // 방법 2: textIds로 찾지 못한 경우, 출처 정보와 문항번호로 직접 검색
      if (allTexts.length === 0 && selectedQuestions.length > 0) {
        console.log(`⚠️ textIds로 찾지 못함 (${allTexts.length}개). 출처 정보와 문항번호로 직접 검색 시도...`);
        
        const q = query(
          collection(db, featureType),
          orderBy('index', 'asc')
        );
        
        const querySnapshot = await getDocs(q);
        console.log(`📦 ${featureType} 컬렉션의 전체 문서 수: ${querySnapshot.size}`);
        
        const selectedQs = selectedQuestions.map(q => String(q));
        let checkedCount = 0;
        let matchedCount = 0;
        
        querySnapshot.forEach((doc) => {
          checkedCount++;
          const data = doc.data();
          
          // 출처 정보 일치 확인
          let matchesSource = false;
          if (sourceData.type === 'mockExam' && data.sourceInfo) {
            matchesSource = (
              data.sourceInfo.grade === sourceData.grade &&
              data.sourceInfo.year === sourceData.year &&
              data.sourceInfo.month === sourceData.month
            );
          } else if (sourceData.type === 'book' && data.sourceInfo) {
            matchesSource = (data.sourceInfo.bookName === sourceData.bookName);
            if (matchesSource && chapter) {
              matchesSource = (data.sourceInfo.chapter === chapter || data.chapter === chapter);
            }
          }
          
          if (matchesSource) {
            matchedCount++;
            console.log(`✅ 출처 일치 지문 발견:`, {
              id: doc.id,
              title: data.title,
              questionNumber: data.questionNumber
            });
            
            const qNum = String(data.questionNumber || '');
            if (selectedQs.includes(qNum)) {
              console.log(`✅ 문항번호 일치: ${qNum}`);
              allTexts.push({
                id: doc.id,
                ...data,
                sourceInfo: sourceData
              });
            } else {
              console.log(`❌ 문항번호 불일치: ${qNum} not in [${selectedQs.join(', ')}]`);
            }
          }
        });
        
        console.log(`검색 결과: 전체 ${checkedCount}개 중 출처 일치 ${matchedCount}개, 최종 선택 ${allTexts.length}개`);
      }
      
      const sortedTexts = allTexts.sort((a, b) => (a.index || 0) - (b.index || 0));
      console.log(`📋 최종 결과: ${sortedTexts.length}개 지문 반환`);
      return sortedTexts;
    }
  } catch (error) {
    console.error('❌ 출처 지문 불러오기 실패:', error);
    return [];
  }
}

