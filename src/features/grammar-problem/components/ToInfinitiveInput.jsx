import { useState } from 'react'
import './ToInfinitiveInput.css'

const PROBLEM_TYPES = [
  { value: 'usage', label: 'to부정사 용법 구분' },
  { value: 'blank', label: '빈칸 채우기' },
  { value: 'order', label: '순서 배열' },
  { value: 'sentence', label: '문장 완성' },
]

const DIFFICULTY_GRADES = [
  { value: '초6', label: '초6' },
  { value: '중1', label: '중1' },
  { value: '중2', label: '중2' },
  { value: '중3', label: '중3' },
  { value: '고1', label: '고1' },
  { value: '고2', label: '고2' },
  { value: '고3', label: '고3' },
]

const PROBLEM_COUNTS = [5, 10, 15, 20, 25, 30]

export default function ToInfinitiveInput({ onClose }) {
  const [problemType, setProblemType] = useState('usage')
  const [difficulty, setDifficulty] = useState('중1')
  const [count, setCount] = useState(10)

  return (
    <div className="to-infinitive-container">
      <div className="to-infinitive-header">
        <h2>to부정사 - 문법 문제 만들기</h2>
        <p>to부정사 유형의 문법 문제를 만드는 코너입니다. (초6 ~ 고3)</p>
      </div>

      <div className="to-infinitive-options">
        <div className="to-infinitive-option">
          <label htmlFor="problem-type">문제의 종류</label>
          <select
            id="problem-type"
            value={problemType}
            onChange={(e) => setProblemType(e.target.value)}
            className="to-infinitive-select"
          >
            {PROBLEM_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="to-infinitive-option">
          <label htmlFor="difficulty">문제의 난이도</label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="to-infinitive-select"
          >
            {DIFFICULTY_GRADES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="to-infinitive-option">
          <label htmlFor="count">문제의 개수</label>
          <select
            id="count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="to-infinitive-select"
          >
            {PROBLEM_COUNTS.map((n) => (
              <option key={n} value={n}>{n}문항</option>
            ))}
          </select>
        </div>
      </div>

      <div className="to-infinitive-content">
        <p className="to-infinitive-placeholder">준비 중입니다. 곧 이용하실 수 있습니다.</p>
      </div>
      {onClose && (
        <div className="to-infinitive-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            메인 메뉴로 돌아가기
          </button>
        </div>
      )}
    </div>
  )
}
