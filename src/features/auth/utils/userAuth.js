import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../../../utils/firebase'

const USER_COLLECTION = 'pocketbookUsers'
const ACCESS_CONTROL_COLLECTION = 'pocketbookAccessControl'
const ACCESS_CONTROL_DOC_ID = 'all'
const SESSION_KEY = 'pocketbook_current_user'
export const PRIMARY_ADMIN_NAME = '신희진'

export const USER_ROLES = [
  { value: 'teacher', label: '선생님' },
  { value: 'staff', label: '직원' },
  { value: 'executive', label: '운영진' },
]

export function normalizePhoneNumber(value = '') {
  return String(value).replace(/\D/g, '')
}

export function normalizeUserName(value = '') {
  return String(value || '').trim().replace(/\s+/g, '')
}

export function isPrimaryAdminUser(userOrName) {
  const rawName = typeof userOrName === 'string' ? userOrName : userOrName?.name
  return normalizeUserName(rawName) === normalizeUserName(PRIMARY_ADMIN_NAME)
}

function getUserDocRef(phoneNumber) {
  return doc(db, USER_COLLECTION, normalizePhoneNumber(phoneNumber))
}

async function sha256Hex(text) {
  if (!window?.crypto?.subtle) {
    throw new Error('이 브라우저는 비밀번호 암호화를 지원하지 않습니다.')
  }

  const data = new TextEncoder().encode(text)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function sanitizeUser(userData = {}) {
  return {
    name: userData.name || '',
    phoneNumber: userData.phoneNumber || '',
    role: userData.role || 'teacher',
    linkedTeacherNames: Array.isArray(userData.linkedTeacherNames)
      ? [...new Set(userData.linkedTeacherNames.map((item) => String(item || '').trim()).filter(Boolean))]
      : (userData.name ? [String(userData.name).trim()] : []),
    isActive: userData.isActive !== false,
    createdAt: userData.createdAt || null,
    updatedAt: userData.updatedAt || null,
  }
}

export function getStoredSessionUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (error) {
    console.warn('로그인 세션 복원 실패:', error)
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function clearStoredSessionUser() {
  localStorage.removeItem(SESSION_KEY)
}

function persistSessionUser(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

function sanitizeApprovedMember(entry = {}) {
  const name = String(entry.name || '').trim()
  const phoneNumber = normalizePhoneNumber(entry.phoneNumber || '')
  const role = USER_ROLES.some((item) => item.value === entry.role) ? entry.role : 'teacher'
  const linkedTeacherNames = Array.isArray(entry.linkedTeacherNames)
    ? [...new Set(entry.linkedTeacherNames.map((item) => String(item || '').trim()).filter(Boolean))]
    : (name ? [name] : [])

  return {
    name,
    phoneNumber,
    role,
    linkedTeacherNames,
    note: String(entry.note || '').trim(),
  }
}

function sanitizeSignupRequest(entry = {}) {
  const name = String(entry.name || '').trim()
  const phoneNumber = normalizePhoneNumber(entry.phoneNumber || '')
  const role = USER_ROLES.some((item) => item.value === entry.role) ? entry.role : 'teacher'
  const linkedTeacherNames = Array.isArray(entry.linkedTeacherNames)
    ? [...new Set(entry.linkedTeacherNames.map((item) => String(item || '').trim()).filter(Boolean))]
    : (name ? [name] : [])

  return {
    name,
    phoneNumber,
    role,
    linkedTeacherNames,
    note: String(entry.note || '').trim(),
    passwordHash: String(entry.passwordHash || ''),
    requestedAt: entry.requestedAt || null,
  }
}

function buildSessionUser(nextUser = {}) {
  const sessionUser = sanitizeUser(nextUser)
  persistSessionUser(sessionUser)
  return sessionUser
}

export async function loadPocketbookAccessControl() {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase 설정이 없어 접근 제어 목록을 불러올 수 없습니다.')
  const snap = await getDoc(doc(db, ACCESS_CONTROL_COLLECTION, ACCESS_CONTROL_DOC_ID))
  const data = snap.exists() ? (snap.data() || {}) : {}
  const approvedMembers = Array.isArray(data.approvedMembers)
    ? data.approvedMembers.map(sanitizeApprovedMember).filter((item) => item.name && item.phoneNumber)
    : []
  const signupRequests = Array.isArray(data.signupRequests)
    ? data.signupRequests.map(sanitizeSignupRequest).filter((item) => item.name && item.phoneNumber)
    : []
  return {
    approvedMembers,
    signupRequests,
    updatedAt: data.updatedAt || null,
  }
}

export async function savePocketbookAccessControl({ approvedMembers = [], signupRequests = [] }) {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase 설정이 없어 접근 제어 목록을 저장할 수 없습니다.')
  const deduped = []
  const seen = new Set()
  approvedMembers
    .map(sanitizeApprovedMember)
    .filter((item) => item.name && item.phoneNumber)
    .forEach((item) => {
      const key = `${normalizeUserName(item.name)}::${item.phoneNumber}`
      if (seen.has(key)) return
      seen.add(key)
      deduped.push(item)
    })

  const dedupedRequests = []
  const requestSeen = new Set()
  signupRequests
    .map(sanitizeSignupRequest)
    .filter((item) => item.name && item.phoneNumber && item.passwordHash)
    .forEach((item) => {
      const key = `${normalizeUserName(item.name)}::${item.phoneNumber}`
      if (requestSeen.has(key)) return
      requestSeen.add(key)
      dedupedRequests.push(item)
    })

  await setDoc(
    doc(db, ACCESS_CONTROL_COLLECTION, ACCESS_CONTROL_DOC_ID),
    {
      approvedMembers: deduped,
      signupRequests: dedupedRequests,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function listPocketbookUsers() {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase 설정이 없어 가입 계정을 불러올 수 없습니다.')
  const snap = await getDocs(collection(db, USER_COLLECTION))
  return snap.docs
    .map((item) => sanitizeUser(item.data() || {}))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'))
}

export async function signUpPocketbookUser({ name, phoneNumber, password, role }) {
  const cleanPhoneNumber = normalizePhoneNumber(phoneNumber)
  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw new Error('이름을 입력해주세요.')
  if (!cleanPhoneNumber) throw new Error('전화번호를 입력해주세요.')
  if (!password || password.length < 4) throw new Error('비밀번호는 4자 이상 입력해주세요.')
  if (!USER_ROLES.some((item) => item.value === role)) throw new Error('권한을 다시 선택해주세요.')
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase 설정이 없어 회원가입을 진행할 수 없습니다.')

  const userRef = getUserDocRef(cleanPhoneNumber)
  const existingSnapshot = await getDoc(userRef)
  if (existingSnapshot.exists()) {
    throw new Error('이미 가입된 전화번호입니다.')
  }

  const { approvedMembers, signupRequests } = await loadPocketbookAccessControl()
  const approvedMember = approvedMembers.find((item) =>
    item.phoneNumber === cleanPhoneNumber && normalizeUserName(item.name) === normalizeUserName(trimmedName),
  )
  const passwordHash = await sha256Hex(password)
  const pendingRequest = signupRequests.find((item) =>
    item.phoneNumber === cleanPhoneNumber && normalizeUserName(item.name) === normalizeUserName(trimmedName),
  )
  if (pendingRequest) {
    throw new Error('이미 가입 요청이 접수되어 있습니다. 승인 후 로그인해주세요.')
  }

  if (!approvedMember && !isPrimaryAdminUser(trimmedName)) {
    const nextRequests = [
      ...signupRequests,
      {
        name: trimmedName,
        phoneNumber: cleanPhoneNumber,
        role,
        linkedTeacherNames: [trimmedName],
        passwordHash,
        requestedAt: new Date().toISOString(),
      },
    ]
    await savePocketbookAccessControl({ approvedMembers, signupRequests: nextRequests })
    return {
      requestSubmitted: true,
      name: trimmedName,
      phoneNumber: cleanPhoneNumber,
    }
  }

  const nextUser = {
    name: trimmedName,
    phoneNumber: cleanPhoneNumber,
    role: approvedMember?.role || role,
    linkedTeacherNames: approvedMember?.linkedTeacherNames?.length ? approvedMember.linkedTeacherNames : [trimmedName],
    isActive: true,
    passwordHash,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(userRef, nextUser)
  return buildSessionUser(nextUser)
}

export async function signInPocketbookUser({ phoneNumber, password }) {
  const cleanPhoneNumber = normalizePhoneNumber(phoneNumber)
  if (!cleanPhoneNumber) throw new Error('전화번호를 입력해주세요.')
  if (!password) throw new Error('비밀번호를 입력해주세요.')
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase 설정이 없어 로그인을 진행할 수 없습니다.')

  const userSnapshot = await getDoc(getUserDocRef(cleanPhoneNumber))
  if (!userSnapshot.exists()) {
    throw new Error('가입된 계정을 찾을 수 없습니다.')
  }

  const userData = userSnapshot.data() || {}
  if (userData.isActive === false) {
    throw new Error('비활성화된 계정입니다. 운영진에게 문의해주세요.')
  }

  const passwordHash = await sha256Hex(password)
  if (userData.passwordHash !== passwordHash) {
    throw new Error('비밀번호가 올바르지 않습니다.')
  }

  return buildSessionUser(userData)
}

export async function deactivatePocketbookUser(phoneNumber) {
  const cleanPhoneNumber = normalizePhoneNumber(phoneNumber)
  if (!cleanPhoneNumber) throw new Error('전화번호가 올바르지 않습니다.')
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase 설정이 없어 계정 상태를 변경할 수 없습니다.')

  const userRef = getUserDocRef(cleanPhoneNumber)
  const userSnapshot = await getDoc(userRef)
  if (!userSnapshot.exists()) {
    throw new Error('계정을 찾을 수 없습니다.')
  }

  await setDoc(userRef, { isActive: false, updatedAt: serverTimestamp() }, { merge: true })
}

export async function setPocketbookUserActive(phoneNumber, isActive) {
  const cleanPhoneNumber = normalizePhoneNumber(phoneNumber)
  if (!cleanPhoneNumber) throw new Error('전화번호가 올바르지 않습니다.')
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase 설정이 없어 계정 상태를 변경할 수 없습니다.')

  const userRef = getUserDocRef(cleanPhoneNumber)
  const userSnapshot = await getDoc(userRef)
  if (!userSnapshot.exists()) {
    throw new Error('계정을 찾을 수 없습니다.')
  }

  await setDoc(userRef, { isActive: isActive !== false, updatedAt: serverTimestamp() }, { merge: true })
}

export async function approvePocketbookSignupRequest(phoneNumber) {
  const cleanPhoneNumber = normalizePhoneNumber(phoneNumber)
  if (!cleanPhoneNumber) throw new Error('전화번호가 올바르지 않습니다.')
  const { approvedMembers, signupRequests } = await loadPocketbookAccessControl()
  const request = signupRequests.find((item) => item.phoneNumber === cleanPhoneNumber)
  if (!request) throw new Error('승인 대기 요청을 찾지 못했습니다.')

  const userRef = getUserDocRef(cleanPhoneNumber)
  const existingSnapshot = await getDoc(userRef)
  if (existingSnapshot.exists()) {
    throw new Error('이미 가입된 계정입니다.')
  }

  const nextUser = {
    name: request.name,
    phoneNumber: request.phoneNumber,
    role: request.role,
    linkedTeacherNames: request.linkedTeacherNames?.length ? request.linkedTeacherNames : [request.name],
    isActive: true,
    passwordHash: request.passwordHash,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(userRef, nextUser)
  await savePocketbookAccessControl({
    approvedMembers: [
      ...approvedMembers,
      {
        name: request.name,
        phoneNumber: request.phoneNumber,
        role: request.role,
        linkedTeacherNames: request.linkedTeacherNames,
      },
    ],
    signupRequests: signupRequests.filter((item) => item.phoneNumber !== cleanPhoneNumber),
  })
}

export async function rejectPocketbookSignupRequest(phoneNumber) {
  const cleanPhoneNumber = normalizePhoneNumber(phoneNumber)
  if (!cleanPhoneNumber) throw new Error('전화번호가 올바르지 않습니다.')
  const { approvedMembers, signupRequests } = await loadPocketbookAccessControl()
  await savePocketbookAccessControl({
    approvedMembers,
    signupRequests: signupRequests.filter((item) => item.phoneNumber !== cleanPhoneNumber),
  })
}
