import { findTopicLabel } from './grammarWorkbookUtils.js'

/**
 * 문항 수 n을 pool의 topicId에 무작위로 배분 (합 = n)
 * @param {number} n
 * @param {string[]} pool
 * @returns {Record<string, number>}
 */
export function buildRandomQuotaObject(n, pool) {
  if (n <= 0 || !pool || pool.length === 0) return {}
  const o = {}
  for (let i = 0; i < n; i++) {
    const id = pool[Math.floor(Math.random() * pool.length)]
    o[id] = (o[id] || 0) + 1
  }
  return o
}

export function sumQuota(quota) {
  if (!quota || typeof quota !== 'object') return 0
  return Object.values(quota).reduce((a, b) => a + (Number(b) || 0), 0)
}

/**
 * total을 가중치 비율로 정수 배분 (합 = total). 최대 잔여 분수 우선으로 +1.
 * @param {number} total
 * @param {{ id: string, w: number }[]} entries
 * @returns {Record<string, number>}
 */
export function allocateCountsByWeights(total, entries) {
  const filtered = entries.filter((e) => e.w > 0)
  if (filtered.length === 0 || total <= 0) return {}
  if (filtered.length === 1) return { [filtered[0].id]: total }
  const sumW = filtered.reduce((a, e) => a + e.w, 0)
  const parts = filtered.map((e) => {
    const exact = (total * e.w) / sumW
    return { id: e.id, floor: Math.floor(exact), frac: exact - Math.floor(exact) }
  })
  const sumFloor = parts.reduce((a, p) => a + p.floor, 0)
  let rem = total - sumFloor
  parts.sort((a, b) => b.frac - a.frac)
  for (let i = 0; i < rem; i++) parts[i].floor++
  const out = {}
  for (const p of parts) out[p.id] = p.floor
  return out
}

/**
 * pool 안의 topicId만 두고 합이 targetTotal이 되도록 무작위로 증감 (편집 후 합 맞추기)
 * @param {Record<string, number>} quota
 * @param {string[]} pool
 * @param {number} targetTotal
 * @returns {Record<string, number>}
 */
export function normalizeQuotaToTotal(quota, pool, targetTotal) {
  if (!pool?.length || targetTotal < 0) return {}
  const q = {}
  for (const id of pool) {
    const v = Math.max(0, Math.floor(Number(quota[id]) || 0))
    q[id] = v
  }
  let sum = sumQuota(q)
  while (sum < targetTotal) {
    const id = pool[Math.floor(Math.random() * pool.length)]
    q[id] = (q[id] || 0) + 1
    sum++
  }
  while (sum > targetTotal) {
    const candidates = pool.filter((id) => (q[id] || 0) > 0)
    if (candidates.length === 0) break
    const id = candidates[Math.floor(Math.random() * candidates.length)]
    q[id]--
    sum--
  }
  const out = {}
  for (const [k, v] of Object.entries(q)) {
    if (v > 0) out[k] = v
  }
  return out
}

function planToQuota(plan) {
  const o = {}
  for (const id of plan) {
    o[id] = (o[id] || 0) + 1
  }
  return o
}

function buildShuffledPlanFromQuota(quota) {
  const plan = []
  for (const [id, c] of Object.entries(quota)) {
    const cnt = Number(c) || 0
    for (let i = 0; i < cnt; i++) plan.push(id)
  }
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[plan[i], plan[j]] = [plan[j], plan[i]]
  }
  return plan
}

/**
 * quota를 섞인 순서로 펼친 뒤 partLengths대로 잘라 각각 quota 객체로 반환 (합이 sumQuota와 같아야 함)
 * @param {Record<string, number>} quota
 * @param {number[]} partLengths
 * @returns {Record<string, number>[]}
 */
export function splitQuotaIntoParts(quota, partLengths) {
  const total = sumQuota(quota)
  const sumParts = partLengths.reduce((a, b) => a + b, 0)
  if (sumParts !== total) {
    throw new Error(`splitQuotaIntoParts: 합 불일치 (${sumParts} !== ${total})`)
  }
  const plan = buildShuffledPlanFromQuota(quota)
  const out = []
  let o = 0
  for (const len of partLengths) {
    out.push(planToQuota(plan.slice(o, o + len)))
    o += len
  }
  return out
}

/**
 * quota를 실제 순서 배열로 펼친 뒤 섞어, 앞 chunk / 뒤 chunk로 나눠 각각 quota 객체로 반환
 * @returns {[Record<string, number>, Record<string, number>]}
 */
export function splitQuotaIntoTwoHalves(quota, firstLen, secondLen) {
  const plan = buildShuffledPlanFromQuota(quota)
  const p1 = plan.slice(0, firstLen)
  const p2 = plan.slice(firstLen, firstLen + secondLen)
  return [planToQuota(p1), planToQuota(p2)]
}

/** 프롬프트용: topicId별 필수 문항 수 */
export function formatQuotaForPrompt(quota, sections) {
  const lines = []
  for (const [id, c] of Object.entries(quota)) {
    const cnt = Number(c) || 0
    if (cnt <= 0) continue
    const lbl = findTopicLabel(sections, id)
    lines.push(`- topicId "${id}" → exactly ${cnt} problem(s). Reference: ${lbl}`)
  }
  lines.sort((a, b) => a.localeCompare(b, 'ko'))
  return lines.join('\n')
}

/** 응답 검증: topicId별 개수가 quota와 일치하는지 */
export function countProblemsByTopicId(problems) {
  const m = new Map()
  for (const p of problems) {
    const id = String(p.topicId || '').trim()
    if (!id) continue
    m.set(id, (m.get(id) || 0) + 1)
  }
  return m
}

export function assertQuotaMatch(problems, quota, label = '') {
  const got = countProblemsByTopicId(problems)
  const keys = new Set([...Object.keys(quota), ...got.keys()])
  for (const id of keys) {
    const need = Number(quota[id]) || 0
    const g = got.get(id) || 0
    if (need !== g) {
      throw new Error(
        `${label}topicId "${id}" 문항 수 불일치: 할당 ${need}개, 응답 ${g}개. 다시 생성해 주세요.`
      )
    }
  }
}
