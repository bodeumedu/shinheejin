import { useState, useCallback } from 'react'
import { parseInputText, extractVocabulary, extractKeyWords, splitPassageForOrdering, splitPassageForInsertion, generateSummaryWithBlanks } from '../utils/mygodVocabExtractor'
import { generateMygodPdf, extractPeonaPairs, applyBracketsToOriginal, applyBlanksToOriginal, generateOrderingData, generateGrammarQuizData, generateCorrectionQuizData, processThirdWordSummary } from '../utils/mygodPdfGenerator'
import { generatePeonaWorkbook } from '../../peona/utils/peonaGenerator'
import { generateKeyQuestion } from '../../key/utils/keyAnalyzer'
import { generateThirdWordSummary } from '../../third-word/utils/thirdWordAnalyzer'
import { generateContentMatchQuestion } from '../../content-match/utils/contentMatchAnalyzer'
import { processSingleText } from '../../complex-description/utils/complexDescriptionProcessor'
import { summarizeText as summarizeSum15 } from '../../sum15/utils/sum15Analyzer'
import './MygodBuilder.css'

function deriveExamTitle(passages) {
  if (!passages.length) return '내신용 변형문제집'
  const first = passages[0]
  if (first.examInfo.year && first.examInfo.grade && first.examInfo.month) {
    return `${first.examInfo.year} 고${first.examInfo.grade} ${first.examInfo.month}월 내신용 변형문제집`
  }
  if (passages.length === 1) return first.source
  const sources = passages.map(p => p.source)
  let prefix = sources[0]
  for (let i = 1; i < sources.length; i++) {
    while (!sources[i].startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1)
    }
  }
  return prefix.trim().replace(/[-_/\s]+$/, '') || first.source
}

const SECTIONS = [
  { id: 'cover', label: '표지 페이지' },
  { id: 'blank', label: '빈 페이지' },
  { id: 'voca', label: 'Voca 단어장 (영어+한글)' },
  { id: 'vocaTestKr', label: 'Voca Test (한글 쓰기)' },
  { id: 'vocaTestEn', label: 'Voca Test (영어 쓰기)' },
  { id: 'text', label: 'Text (본문 필기 공간)' },
  { id: 'bracket', label: '[ / ] 선택형 (피어나)' },
  { id: 'fillBlank', label: '빈칸 채우기 (첫 글자 힌트)' },
  { id: 'ordering', label: '순서 배열 (수능형)' },
  { id: 'insertion', label: '문장 넣기 (수능형)' },
  { id: 'grammarQuiz', label: '어법 · 어휘 퀴즈' },
  { id: 'correctionQuiz', label: '어법 · 어휘 수정 (서술형)' },
  { id: 'topicQuiz', label: '주제 (key)' },
  { id: 'thirdWord', label: '세번째 단어 (3rd word)' },
  { id: 'contentMatch', label: '일치 / 불일치 (객불)' },
  { id: 'complexDesc', label: '복합 서술형' },
  { id: 'topicSentence', label: '주제문 배열 (topic sentence)' },
  { id: 'summaryFill', label: '요약문 단어 채우기' },
]

const ALL_SECTION_IDS = SECTIONS.map(s => s.id)

function MygodBuilder({ apiKey }) {
  const [text, setText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [selectedSections, setSelectedSections] = useState(() => new Set(ALL_SECTION_IDS))

  const toggleSection = (id) => {
    setSelectedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedSections(prev =>
      prev.size === ALL_SECTION_IDS.length ? new Set() : new Set(ALL_SECTION_IDS)
    )
  }

  const needsVocab = selectedSections.has('voca') || selectedSections.has('vocaTestKr') || selectedSections.has('vocaTestEn')
  const needsPeona = selectedSections.has('bracket') || selectedSections.has('grammarQuiz') || selectedSections.has('correctionQuiz')
  const needsFillBlank = selectedSections.has('fillBlank')
  const needsTopicQuiz = selectedSections.has('topicQuiz')
  const needsThirdWord = selectedSections.has('thirdWord')
  const needsContentMatch = selectedSections.has('contentMatch')
  const needsComplexDesc = selectedSections.has('complexDesc')
  const needsTopicSentence = selectedSections.has('topicSentence')
  const needsSummaryFill = selectedSections.has('summaryFill')
  const needsApi = needsVocab || needsPeona || needsFillBlank || needsTopicQuiz || needsThirdWord || needsContentMatch || needsComplexDesc || needsTopicSentence || needsSummaryFill

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) { setError('지문을 입력해주세요.'); return }
    if (selectedSections.size === 0) { setError('최소 1개 섹션을 선택해주세요.'); return }
    if (needsApi && !apiKey) { setError('API 키가 필요한 섹션이 선택되어 있습니다.'); return }

    setIsProcessing(true)
    setError('')
    setStatus('입력 파싱 중...')

    try {
      console.log('[mygod] raw input (first 500):', text.substring(0, 500))
      const passages = parseInputText(text)
      console.log(`[mygod] parsed ${passages.length} passages`)
      passages.forEach((p, i) => console.log(`[mygod] passage ${i}: source="${p.source}", english length=${p.english.length}, korean length=${p.korean.length}`))
      if (passages.length === 0) {
        throw new Error('유효한 지문이 없습니다. 출처/영어원문/한글해석// 형식을 확인해주세요.')
      }

      const firstExamInfo = passages[0].examInfo
      const examInfo = {
        year: firstExamInfo.year || 2026,
        grade: firstExamInfo.grade || 1,
        month: firstExamInfo.month || 3,
        title: deriveExamTitle(passages),
      }

      let vocabData = []
      let bracketData = []
      let fillBlankData = []
      let orderingData = []
      let insertionData = []
      let grammarQuizData = []
      let correctionData = []
      let topicQuizData = []
      let thirdWordData = []
      let contentMatchData = []
      let complexDescData = []
      let topicSentenceData = []
      let summaryFillData = []

      const totalSteps = (needsVocab ? passages.length : 0) + (needsPeona ? passages.length : 0) + (needsFillBlank ? passages.length : 0) + (needsTopicQuiz ? passages.length : 0) + (needsThirdWord ? passages.length : 0) + (needsContentMatch ? passages.length : 0) + (needsComplexDesc ? passages.length : 0) + (needsTopicSentence ? passages.length : 0) + (needsSummaryFill ? passages.length : 0)
      let currentStep = 0

      if (needsVocab) {
        setProgress({ current: 0, total: totalSteps })
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`단어 추출 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })

          try {
            const words = await extractVocabulary(p.english, p.korean, p.passageNum, apiKey)
            vocabData.push({ passageNum: p.passageNum, words })
          } catch (err) {
            console.error(`지문 ${p.passageNum} 단어 추출 실패:`, err)
            vocabData.push({
              passageNum: p.passageNum,
              words: [{ english: `[오류: ${err.message}]`, korean: '' }],
            })
          }
        }
      }

      if (needsPeona) {
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`선택형 생성 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })

          try {
            const peonaResult = await generatePeonaWorkbook(p.english, p.source, apiKey, {
              korean: p.korean || '',
            })
            const pairs = extractPeonaPairs(peonaResult)

            if (selectedSections.has('bracket')) {
              const { html: bracketHtml, answerKey } = applyBracketsToOriginal(p.english, pairs, 10)
              if (answerKey.length < 10) console.warn(`지문 ${p.passageNum}: ${pairs.length}쌍 중 ${answerKey.length}개 매칭`)
              bracketData.push({ passageNum: p.passageNum, bracketHtml, korean: p.korean, answerKey })
            }

            if (selectedSections.has('grammarQuiz')) {
              const quizData = generateGrammarQuizData(p.english, pairs)
              if (quizData) grammarQuizData.push({ passageNum: p.passageNum, quizData })
            }
            if (selectedSections.has('correctionQuiz')) {
              const cqData = generateCorrectionQuizData(p.english, pairs)
              if (cqData) correctionData.push({ passageNum: p.passageNum, quizData: cqData })
            }
          } catch (err) {
            console.error(`지문 ${p.passageNum} 선택형/퀴즈 생성 실패:`, err)
            if (selectedSections.has('bracket')) {
              bracketData.push({
                passageNum: p.passageNum,
                bracketHtml: `<em>[오류: ${err.message}]</em>`,
                korean: p.korean,
                answerKey: [],
              })
            }
          }
        }
      }

      if (needsFillBlank) {
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`빈칸 채우기 생성 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })

          try {
            const keyWords = await extractKeyWords(p.english, p.passageNum, apiKey)
            const { html, answerKey } = applyBlanksToOriginal(p.english, keyWords)
            fillBlankData.push({ passageNum: p.passageNum, html, korean: p.korean, answerKey })
          } catch (err) {
            console.error(`지문 ${p.passageNum} 빈칸 생성 실패:`, err)
            fillBlankData.push({
              passageNum: p.passageNum,
              html: `<em>[오류: ${err.message}]</em>`,
              korean: p.korean,
              answerKey: [],
            })
          }
        }
      }

      if (needsTopicQuiz) {
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`주제 문제 생성 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })
          try {
            const qData = await generateKeyQuestion(p.english, apiKey)
            const shuffledOptions = [...qData.options]
            const correctText = shuffledOptions[qData.correctAnswerIndex]
            for (let j = shuffledOptions.length - 1; j > 0; j--) {
              const k = Math.floor(Math.random() * (j + 1))
              ;[shuffledOptions[j], shuffledOptions[k]] = [shuffledOptions[k], shuffledOptions[j]]
            }
            const correctIdx = shuffledOptions.indexOf(correctText)
            topicQuizData.push({ passageNum: p.passageNum, englishText: p.english, options: shuffledOptions, correctIdx })
          } catch (err) {
            console.error(`지문 ${p.passageNum} 주제 문제 생성 실패:`, err)
          }
        }
      }

      if (needsThirdWord) {
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`세번째 단어 생성 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })
          try {
            const summaryData = await generateThirdWordSummary(p.english, apiKey)
            const { shuffledChunks, correctIdx } = processThirdWordSummary(summaryData.summary)
            thirdWordData.push({ passageNum: p.passageNum, englishText: p.english, shuffledChunks, correctIdx })
          } catch (err) {
            console.error(`지문 ${p.passageNum} 세번째 단어 생성 실패:`, err)
          }
        }
      }

      if (needsContentMatch) {
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`일치/불일치 생성 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })
          try {
            const cmResult = await generateContentMatchQuestion(p.english, apiKey)
            contentMatchData.push({ passageNum: p.passageNum, englishText: p.english, options: cmResult.options, correctIdx: cmResult.correctAnswerIndex })
          } catch (err) {
            console.error(`지문 ${p.passageNum} 일치/불일치 생성 실패:`, err)
          }
        }
      }

      if (needsComplexDesc) {
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`복합 서술형 전처리 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })

          try {
            const processedEnglish = await processSingleText(p.english, apiKey)
            console.log(`[quiz4] 지문 ${p.passageNum} processed (first 300):`, processedEnglish.substring(0, 300))

            let peonaPairs = []
            const bracketMatch = processedEnglish.match(/\[([^\]]+)\]/)
            if (bracketMatch && apiKey) {
              try {
                setStatus(`복합 서술형 이택일 생성 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
                const peonaResult = await generatePeonaWorkbook(bracketMatch[1], p.source, apiKey, {
                  korean: '',
                })
                peonaPairs = extractPeonaPairs(peonaResult)
              } catch (err) {
                console.error(`지문 ${p.passageNum} 복합서술형 이택일 실패:`, err)
              }
            }

            complexDescData.push({
              passageNum: p.passageNum,
              source: p.source,
              englishText: processedEnglish,
              peonaPairs,
            })
          } catch (err) {
            console.error(`지문 ${p.passageNum} 복합서술형 전처리 실패:`, err)
            complexDescData.push({
              passageNum: p.passageNum,
              source: p.source,
              englishText: p.english,
              peonaPairs: [],
            })
          }
        }
      }

      if (needsTopicSentence) {
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`주제문 배열 생성 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })
          try {
            const summary = await summarizeSum15(p.english, apiKey)
            const PREFIX = 'The passage suggests that'
            let remaining = summary
            if (summary.toLowerCase().startsWith(PREFIX.toLowerCase())) {
              remaining = summary.substring(PREFIX.length).trim()
            }
            const words = remaining.split(/\s+/).filter(w => w.length > 0)
            const chunks = []
            for (let j = 0; j < words.length; j += 2) {
              chunks.push(words.slice(j, j + 2).join(' '))
            }
            const shuffled = [...chunks]
            for (let j = shuffled.length - 1; j > 0; j--) {
              const k = Math.floor(Math.random() * (j + 1))
              ;[shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]]
            }
            topicSentenceData.push({
              passageNum: p.passageNum,
              source: p.source,
              englishText: p.english,
              fullSummary: summary,
              remaining,
              shuffledChunks: shuffled,
            })
          } catch (err) {
            console.error(`지문 ${p.passageNum} 주제문 배열 생성 실패:`, err)
          }
        }
      }

      if (needsSummaryFill) {
        for (let i = 0; i < passages.length; i++) {
          const p = passages[i]
          currentStep++
          setStatus(`요약문 단어 채우기 생성 중... (${i + 1}/${passages.length}) - 지문 ${p.passageNum}`)
          setProgress({ current: currentStep, total: totalSteps })
          try {
            const result = await generateSummaryWithBlanks(p.english, apiKey)
            let blankHtml = result.summary
            const answerKey = []
            let blankNum = 0
            for (const word of result.blankWords) {
              const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
              const match = blankHtml.match(re)
              if (match) {
                blankNum++
                const firstLetter = match[0][0].toLowerCase()
                answerKey.push({ num: blankNum, word: match[0] })
                blankHtml = blankHtml.replace(re, `${firstLetter}______________ <sup>${blankNum})</sup>`)
              }
            }
            summaryFillData.push({
              passageNum: p.passageNum,
              source: p.source,
              englishText: p.english,
              summaryHtml: blankHtml,
              fullSummary: result.summary,
              answerKey,
            })
          } catch (err) {
            console.error(`지문 ${p.passageNum} 요약문 채우기 생성 실패:`, err)
          }
        }
      }

      if (selectedSections.has('ordering')) {
        setStatus('순서 배열 생성 중...')
        for (const p of passages) {
          const { intro, parts } = splitPassageForOrdering(p.english)
          if (parts.length >= 3) {
            const orderData = generateOrderingData(intro, parts.slice(0, 3))
            orderingData.push({ passageNum: p.passageNum, intro, orderData })
          }
        }
      }

      if (selectedSections.has('insertion')) {
        setStatus('문장 넣기 생성 중...')
        for (const p of passages) {
          const result = splitPassageForInsertion(p.english)
          if (result) {
            insertionData.push({ passageNum: p.passageNum, ...result })
          }
        }
      }

      setStatus('PDF 생성 중...')
      const sectionFlags = Object.fromEntries(ALL_SECTION_IDS.map(id => [id, selectedSections.has(id)]))
      await generateMygodPdf(examInfo, vocabData, passages, sectionFlags, setStatus, bracketData, fillBlankData, orderingData, insertionData, grammarQuizData, correctionData, topicQuizData, thirdWordData, contentMatchData, complexDescData, topicSentenceData, summaryFillData)
    } catch (err) {
      console.error('마이갓 생성 오류:', err)
      setError(err.message || '생성 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }, [text, apiKey, selectedSections, needsVocab, needsPeona, needsFillBlank, needsTopicQuiz, needsThirdWord, needsContentMatch, needsComplexDesc, needsApi])

  const progressPct = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div className="mygod-builder">
      <div className="mygod-top">
        <div className="mygod-input-area">
          <label>지문 입력 (출처/영어원문/한글해석// 형식)</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`26_H1_3_18\n/\nDear Connexa Point Table Tennis Center members...\n/\n친애하는 코넥사 포인트 탁구 센터 회원 여러분...\n//\n26_H1_3_19\n/\nIt was the first carnival...\n/\n네 살 된 소녀 캐시에게는...\n//`}
            disabled={isProcessing}
          />
          <small>
            형식: 출처(26_H1_3_18)/영어원문/한글해석// 으로 여러 지문 입력. 출처에서 학년/월/번호를 자동 파싱합니다.
          </small>
        </div>

        <div className="mygod-control-area">
          <label>마이갓 워크북 생성</label>
          <div className="mygod-info-box">
            <div className="mygod-section-header">
              <p>PDF 섹션 선택:</p>
              <button type="button" className="mygod-toggle-all" onClick={toggleAll} disabled={isProcessing}>
                {selectedSections.size === ALL_SECTION_IDS.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="mygod-section-checks">
              {SECTIONS.map((s, i) => (
                <label key={s.id} className="mygod-check-label">
                  <input
                    type="checkbox"
                    checked={selectedSections.has(s.id)}
                    onChange={() => toggleSection(s.id)}
                    disabled={isProcessing}
                  />
                  <span className="mygod-check-num">{i + 1}.</span>
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          {isProcessing && (
            <div className="mygod-progress">
              <div className="mygod-progress-bar">
                <div
                  className="mygod-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mygod-progress-text">{status}</div>
            </div>
          )}

          {error && <div className="mygod-error">{error}</div>}

          <div className="mygod-actions">
            <button
              className="mygod-btn mygod-btn-generate"
              onClick={handleGenerate}
              disabled={isProcessing || !text.trim() || (needsApi && !apiKey)}
            >
              {isProcessing ? status : 'PDF 생성하기'}
            </button>
            <button
              className="mygod-btn mygod-btn-reset"
              onClick={() => { setText(''); setError(''); setStatus(''); setProgress({ current: 0, total: 0 }) }}
              disabled={isProcessing}
            >
              초기화
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MygodBuilder
