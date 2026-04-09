import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../../utils/firebase';

export const SUGGESTION_NOTES_COLLECTION = 'pocketbookSuggestionNotes';

/**
 * 로그인 세션이 있으면 제출자 식별용 메타(관리자 모아보기 전용)
 */
export async function submitSuggestionNoteToFirestore(payload) {
  if (!isFirebaseConfigured() || !db) return { ok: false, reason: 'no_firebase' };
  const content = String(payload?.content || '').trim();
  if (!content) return { ok: false, reason: 'empty' };

  try {
    const ref = await addDoc(collection(db, SUGGESTION_NOTES_COLLECTION), {
      content: content.slice(0, 500),
      localId: String(payload?.localId || ''),
      submitterName: String(payload?.submitterName || '').trim() || null,
      submitterPhone: String(payload?.submitterPhone || '').replace(/\D/g, '') || null,
      submitterRole: String(payload?.submitterRole || '').trim() || null,
      createdAt: serverTimestamp(),
      resolved: false,
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    console.warn('수정 제안 Firestore 저장 실패:', e);
    return { ok: false, reason: 'write_error', error: e };
  }
}

/** 관리자: 수정 제안 반영 완료 표시 (제출자 화면에 동기화) */
export async function markSuggestionNoteResolved(noteFirestoreId, resolved = true) {
  if (!isFirebaseConfigured() || !db) return { ok: false, reason: 'no_firebase' };
  const id = String(noteFirestoreId || '').trim();
  if (!id) return { ok: false, reason: 'bad_id' };
  try {
    if (resolved) {
      await updateDoc(doc(db, SUGGESTION_NOTES_COLLECTION, id), {
        resolved: true,
        resolvedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, SUGGESTION_NOTES_COLLECTION, id), {
        resolved: false,
        resolvedAt: deleteField(),
      });
    }
    return { ok: true };
  } catch (e) {
    console.warn('수정 제안 완료 표시 실패:', e);
    return { ok: false, reason: 'update_error', error: e };
  }
}

function formatSuggestionTime(ts) {
  if (!ts) return '';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** 관리자 페이지용: 최신순 목록 */
export async function fetchSuggestionNotesForAdmin(max = 300) {
  if (!isFirebaseConfigured() || !db) {
    return { ok: false, items: [], error: 'Firebase가 설정되지 않았습니다.' };
  }
  try {
    const q = query(
      collection(db, SUGGESTION_NOTES_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(Math.min(Math.max(max, 1), 500))
    );
    const snap = await getDocs(q);
    const items = snap.docs.map((docSnap) => {
      const d = docSnap.data() || {};
      return {
        id: docSnap.id,
        content: String(d.content || '').trim(),
        createdAtLabel: formatSuggestionTime(d.createdAt),
        submitterName: d.submitterName ? String(d.submitterName) : '',
        submitterPhone: d.submitterPhone ? String(d.submitterPhone) : '',
        submitterRole: d.submitterRole ? String(d.submitterRole) : '',
        localId: d.localId ? String(d.localId) : '',
        resolved: d.resolved === true,
        resolvedAtLabel: formatSuggestionTime(d.resolvedAt),
      };
    });
    return { ok: true, items };
  } catch (e) {
    console.error('수정 제안 목록 로드 실패:', e);
    return { ok: false, items: [], error: e?.message || '목록을 불러오지 못했습니다.' };
  }
}
