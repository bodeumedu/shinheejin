import { useMemo, useState } from 'react'
import { flattenVocabularyForTest } from '../utils/englishEnglishWordTestUtils'
import { exportEnglishTestPdf } from '../utils/englishEnglishWordPdfExport'
import './EnglishEnglishWordTestSheet.css'

function EnglishEnglishWordTestSheet({ vocabularyTable, onClose }) {
  const [pdfLoading, setPdfLoading] = useState(false)

  const rows = useMemo(() => {
    const withDef = flattenVocabularyForTest(vocabularyTable).filter((r) => r.definition)
    return withDef.map((r, i) => ({ ...r, num: i + 1 }))
  }, [vocabularyTable])

  const handlePrint = () => {
    window.print()
  }

  const handlePdf = async () => {
    if (!rows.length) {
      alert('PDF로 만들 항목이 없습니다.')
      return
    }
    setPdfLoading(true)
    try {
      await exportEnglishTestPdf(vocabularyTable)
    } catch (e) {
      alert(e.message || 'PDF 저장에 실패했습니다.')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="ee-test-sheet">
      <div className="ee-test-sheet__toolbar no-print">
        <button type="button" className="btn btn-primary" onClick={handlePrint}>
          인쇄하기
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handlePdf}
          disabled={pdfLoading || !rows.length}
        >
          {pdfLoading ? 'PDF 만드는 중...' : '테스트 PDF (A4)'}
        </button>
        {onClose && (
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            시험지 닫기
          </button>
        )}
      </div>

      <div className="ee-test-sheet__paper">
        <header className="ee-test-sheet__header">
          <h2 className="ee-test-sheet__title">영영 단어 테스트</h2>
          <p className="ee-test-sheet__meta">
            이름: <span className="ee-test-sheet__blankline">________________</span> &nbsp; 번호:{' '}
            <span className="ee-test-sheet__blankline">__________</span>
          </p>
          <p className="ee-test-sheet__instr">아래 영영 뜻을 읽고, 빈칸에 알맞은 단어(또는 표현)를 영어로 쓰시오.</p>
        </header>

        <div className="ee-test-sheet__list">
          {rows.map((row, index) => {
            const prevTitle = index > 0 ? rows[index - 1].passageTitle : null
            const showSection = row.passageTitle && row.passageTitle !== prevTitle

            return (
              <div key={`${row.num}-${index}`} className="ee-test-sheet__item">
                {showSection && (
                  <div className="ee-test-sheet__section no-print-break">{row.passageTitle}</div>
                )}
                <div className="ee-test-sheet__def">
                  <span className="ee-test-sheet__num">{row.num}.</span> {row.definition || '(뜻 없음)'}
                </div>
                <div className="ee-test-sheet__answerline">
                  단어:{' '}
                  <span className="ee-test-sheet__write">____________________________________________</span>
                </div>
              </div>
            )
          })}
        </div>

        {rows.length === 0 && (
          <p className="ee-test-sheet__empty">표에 단어·뜻이 없습니다. 단어장을 채운 뒤 다시 시도하세요.</p>
        )}

        {rows.length > 0 && (
          <section className="ee-test-sheet__answers">
            <h3 className="ee-test-sheet__answers-title">정답</h3>
            <ol className="ee-test-sheet__answers-list">
              {rows.map((row) => (
                <li key={row.num}>
                  <strong>{row.num}.</strong> {row.answer || '(없음)'}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

export default EnglishEnglishWordTestSheet
