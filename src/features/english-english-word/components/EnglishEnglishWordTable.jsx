import './EnglishEnglishWordTable.css'

function cloneTable(t) {
  try {
    return structuredClone(t)
  } catch {
    return JSON.parse(JSON.stringify(t))
  }
}

function EnglishEnglishWordTable({ vocabularyTable, onChange }) {
  const readOnly = typeof onChange !== 'function'

  if (!vocabularyTable) return null

  const setTable = (updater) => {
    if (readOnly) return
    const next = typeof updater === 'function' ? updater(cloneTable(vocabularyTable)) : updater
    onChange(next)
  }

  if (vocabularyTable.mode === 'passages') {
    const passages = vocabularyTable.passages || []

    return (
      <div className="ee-word-table-wrap">
        {!readOnly && (
          <div className="ee-word-table__actions-bar">
            <button
              type="button"
              className="ee-word-table__mini-btn"
              onClick={() => {
                setTable((t) => {
                  t.passages = t.passages || []
                  t.passages.push({ title: `새 지문 ${t.passages.length + 1}`, entries: [{ word: '', definition: '' }] })
                  return t
                })
              }}
            >
              + 지문 추가
            </button>
          </div>
        )}
        <table className="ee-word-table ee-word-table--3col ee-word-table--editable">
          <thead>
            <tr>
              <th className="ee-word-table__col-title">제목</th>
              <th className="ee-word-table__col-word">단어</th>
              <th className="ee-word-table__col-def">영영 뜻</th>
              {!readOnly && <th className="ee-word-table__col-action">삭제</th>}
            </tr>
          </thead>
          <tbody>
            {passages.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 3 : 4} className="ee-word-table__def-cell">
                  표에 지문이 없습니다. 「+ 지문 추가」로 행을 만드세요.
                </td>
              </tr>
            ) : (
              passages.map((p, pi) => {
                const entries = p.entries || []
                if (!entries.length) {
                  return (
                    <tr key={`${pi}-empty`}>
                      <td className="ee-word-table__title-cell">
                        {readOnly ? (
                          <span className="ee-word-table__title-text">{p.title || '—'}</span>
                        ) : (
                          <textarea
                            className="ee-word-table__title-input"
                            value={p.title || ''}
                            onChange={(e) => {
                              setTable((t) => {
                                t.passages[pi].title = e.target.value
                                return t
                              })
                            }}
                            rows={4}
                            placeholder="제목"
                          />
                        )}
                      </td>
                      <td className="ee-word-table__word-cell">—</td>
                      <td className="ee-word-table__def-cell">(항목 없음)</td>
                      {!readOnly && (
                        <td className="ee-word-table__action-cell">
                          <button
                            type="button"
                            className="ee-word-table__mini-btn ee-word-table__mini-btn--block"
                            onClick={() => {
                              setTable((t) => {
                                t.passages[pi].entries = [{ word: '', definition: '' }]
                                return t
                              })
                            }}
                          >
                            + 행 추가
                          </button>
                          <button
                            type="button"
                            className="ee-word-table__del-btn"
                            onClick={() => {
                              setTable((t) => {
                                t.passages.splice(pi, 1)
                                return t
                              })
                            }}
                          >
                            지문 삭제
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                }
                const rowCount = entries.length
                return entries.map((e, ri) => (
                  <tr key={`${pi}-${ri}`}>
                    {ri === 0 ? (
                      <td className="ee-word-table__title-cell" rowSpan={rowCount}>
                        {readOnly ? (
                          <span className="ee-word-table__title-text">{p.title || '—'}</span>
                        ) : (
                          <textarea
                            className="ee-word-table__title-input"
                            value={p.title || ''}
                            onChange={(ev) => {
                              setTable((t) => {
                                t.passages[pi].title = ev.target.value
                                return t
                              })
                            }}
                            rows={Math.min(14, Math.max(4, rowCount + 2))}
                            placeholder="지문 제목"
                          />
                        )}
                      </td>
                    ) : null}
                    <td className="ee-word-table__word-cell">
                      {readOnly ? (
                        e.word
                      ) : (
                        <textarea
                          className="ee-word-table__cell-input ee-word-table__cell-input--word"
                          value={e.word || ''}
                          onChange={(ev) => {
                            setTable((t) => {
                              t.passages[pi].entries[ri].word = ev.target.value
                              return t
                            })
                          }}
                          rows={2}
                          placeholder="단어"
                        />
                      )}
                    </td>
                    <td className="ee-word-table__def-cell">
                      {readOnly ? (
                        e.definition
                      ) : (
                        <textarea
                          className="ee-word-table__cell-input"
                          value={e.definition || ''}
                          onChange={(ev) => {
                            setTable((t) => {
                              t.passages[pi].entries[ri].definition = ev.target.value
                              return t
                            })
                          }}
                          rows={3}
                          placeholder="영영 뜻"
                        />
                      )}
                    </td>
                    {!readOnly && (
                      <td className="ee-word-table__action-cell">
                        <button
                          type="button"
                          className="ee-word-table__del-btn"
                          onClick={() => {
                            setTable((t) => {
                              t.passages[pi].entries.splice(ri, 1)
                              if (t.passages[pi].entries.length === 0) {
                                t.passages.splice(pi, 1)
                              }
                              return t
                            })
                          }}
                        >
                          삭제
                        </button>
                        {ri === rowCount - 1 && (
                          <button
                            type="button"
                            className="ee-word-table__add-row-btn"
                            onClick={() => {
                              setTable((t) => {
                                t.passages[pi].entries.push({ word: '', definition: '' })
                                return t
                              })
                            }}
                          >
                            + 행
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              })
            )}
          </tbody>
        </table>
      </div>
    )
  }

  if (vocabularyTable.mode === 'words') {
    const entries = vocabularyTable.entries || []

    return (
      <div className="ee-word-table-wrap">
        {!readOnly && (
          <div className="ee-word-table__actions-bar">
            <button
              type="button"
              className="ee-word-table__mini-btn"
              onClick={() => {
                setTable((t) => {
                  t.entries = t.entries || []
                  t.entries.push({ word: '', definition: '' })
                  return t
                })
              }}
            >
              + 행 추가
            </button>
          </div>
        )}
        <table className="ee-word-table ee-word-table--2col ee-word-table--editable">
          <thead>
            <tr>
              <th className="ee-word-table__col-word">단어</th>
              <th className="ee-word-table__col-def">영영 뜻</th>
              {!readOnly && <th className="ee-word-table__col-action">삭제</th>}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 2 : 3} className="ee-word-table__def-cell">
                  표가 비었습니다. 「+ 행 추가」를 누르세요.
                </td>
              </tr>
            ) : (
              entries.map((e, i) => (
                <tr key={i}>
                  <td className="ee-word-table__word-cell">
                    {readOnly ? (
                      e.word
                    ) : (
                      <textarea
                        className="ee-word-table__cell-input ee-word-table__cell-input--word"
                        value={e.word || ''}
                        onChange={(ev) => {
                          setTable((t) => {
                            t.entries[i].word = ev.target.value
                            return t
                          })
                        }}
                        rows={2}
                        placeholder="단어"
                      />
                    )}
                  </td>
                  <td className="ee-word-table__def-cell">
                    {readOnly ? (
                      e.definition
                    ) : (
                      <textarea
                        className="ee-word-table__cell-input"
                        value={e.definition || ''}
                        onChange={(ev) => {
                          setTable((t) => {
                            t.entries[i].definition = ev.target.value
                            return t
                          })
                        }}
                        rows={3}
                        placeholder="영영 뜻"
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="ee-word-table__action-cell">
                      <button
                        type="button"
                        className="ee-word-table__del-btn"
                        onClick={() => {
                          setTable((t) => {
                            t.entries.splice(i, 1)
                            return t
                          })
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  return null
}

export default EnglishEnglishWordTable
