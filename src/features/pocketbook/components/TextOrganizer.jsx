import { useState, useEffect } from 'react'
import DiagramViewer from '../../../components/DiagramViewer'
import './TextOrganizer.css'

function TextOrganizer({ data, originalText, apiKey, onSavePdf, originalKorean, title, pageIndex = 0 }) {
  const [mainImage, setMainImage] = useState(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [isCompact, setIsCompact] = useState(false)
  const leftRef = useState(null)[0]

  useEffect(() => {
    // 메인 이미지 자동 생성
    const generateImage = async () => {
      if (!data.mainImageDescription || !apiKey) return
      
      setIsGeneratingImage(true)
      try {
        const { generateMainImage } = await import('../utils/imageGenerator')
        const imageUrl = await generateMainImage(data.mainImageDescription, apiKey)
        console.log('이미지 URL 생성됨:', imageUrl)
        
        // 간단하게 원본 URL로 바로 설정
        setMainImage(imageUrl)
        setIsGeneratingImage(false)
      } catch (error) {
        console.error('메인 이미지 생성 오류:', error)
        setIsGeneratingImage(false)
      }
    }

    generateImage()
  }, [data.mainImageDescription, apiKey])

  // 왼쪽 컬럼(1~5번)이 페이지를 넘치면 컴팩트 모드로 전환하여 간격/행간/패딩 축소
  useEffect(() => {
    const el = leftRef
    if (!el) return
    const checkOverflow = () => {
      if (!el) return
      const over = el.scrollHeight > el.clientHeight
      setIsCompact(over)
    }
    // 다음 틱에 계산
    setTimeout(checkOverflow, 0)
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [leftRef, data, originalText])

  // 페이지 id를 다중 출력 대비 고유화
  const page1Id = `pdf-page-1-${pageIndex}`
  const page2Id = `pdf-page-2-${pageIndex}`

  return (
    <>
      {/* 첫 번째 페이지: 1-7번 내용 */}
      <div className="text-organizer print-page landscape" id={page1Id}>
        {/* 페이지 좌상단 제목 표시 */}
        {title && (
          <div className="page-title-header">
            <img
              src="/logo.png"
              alt="logo"
              className="page-title-logo"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
            <h2 className="page-title-text">{title}</h2>
          </div>
        )}
        <div className="organizer-header">
          <h2 className="korean-topic">{data.koreanTopic}</h2>
          <h3 className="english-title">{data.englishTitle}</h3>
        </div>

        <div className="organizer-content">
          {/* 왼쪽: 1-5번 내용 */}
          <div className={`left-content${isCompact ? ' compact' : ''}`} ref={(n) => { if (n) { /* keep ref */ } }}>
            {/* 1. 한글 주제문 */}
            <div className="content-section korean-topic-section">
              <h3>1. 한글 주제문</h3>
              <div className="text-box">
                <p>{data.koreanTopic}</p>
              </div>
            </div>

            {/* 2. 영어 제목 */}
            <div className="content-section english-title-section">
              <h3>2. 영어 제목</h3>
              <div className="text-box">
                <p className="english-text">{data.englishTitle}</p>
              </div>
            </div>

            {/* 3. 주제가 가장 잘 보이는 문장 */}
            <div className="content-section key-sentence">
              <h3>3. 주제가 가장 잘 보이는 문장</h3>
              <div className="text-box highlight-box">
                <p className="english-text">{data.keySentence}</p>
              </div>
            </div>

            {/* 4. 영어 요약문 (지문 내 단어 이용) */}
            <div className="content-section summary-in-text">
              <h3>4. 영어 요약문 (지문 내 단어 이용)</h3>
              <div className="text-box">
                <p className="english-text" dangerouslySetInnerHTML={{ __html: data.summaryWithTextWords }}></p>
              </div>
            </div>

            {/* 5. 영어 요약문 (지문 이외 단어 이용) */}
            <div className="content-section summary-new-words">
              <h3>5. 영어 요약문 (지문 이외 단어 이용)</h3>
              <div className="text-box">
                <p className="english-text" dangerouslySetInnerHTML={{ __html: data.summaryWithNewWords }}></p>
              </div>
            </div>
          </div>

          {/* 오른쪽: 이미지 */}
          <div className="right-content">
            {/* 메인 이미지 */}
            <div className="content-section main-image-section-page1">
              <h3>주요 소재 이미지</h3>
              {isGeneratingImage ? (
                <div className="image-loading">
                  <p>이미지 생성 중...</p>
                </div>
              ) : mainImage ? (
                <div className="main-image-box">
                  <img 
                    src={mainImage} 
                    alt="Main theme illustration"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    className="main-image"
                    onLoad={() => {
                      console.log('이미지 로드 성공')
                    }}
                    onError={async (e) => {
                      console.error('이미지 로드 실패, 프록시로 재시도:', mainImage)
                      const imgEl = e.target
                      const showError = () => {
                        imgEl.style.display = 'none'
                        const errorMsg = imgEl.nextElementSibling
                        if (errorMsg) { errorMsg.style.display = 'block' }
                      }
                      try {
                        // 1) AllOrigins 프록시로 가져오기
                        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(mainImage)}`
                        const res = await fetch(proxyUrl, { method: 'GET' })
                        if (!res.ok) throw new Error('proxy fetch failed')
                        const blob = await res.blob()
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          imgEl.src = reader.result // base64로 교체
                          imgEl.style.display = 'block'
                          const errorMsg = imgEl.nextElementSibling
                          if (errorMsg) { errorMsg.style.display = 'none' }
                        }
                        reader.onerror = showError
                        reader.readAsDataURL(blob)
                      } catch (err) {
                        console.warn('프록시 변환 실패:', err)
                        showError()
                      }
                    }}
                  />
                  <p className="image-error" style={{display: 'none'}}>
                    이미지를 불러올 수 없습니다.
                  </p>
                </div>
              ) : (
                <div className="image-placeholder">
                  <p>이미지가 생성되지 않았습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 두 번째 페이지: 원문 + 글의 구성 + 해석 + 단어장 */}
      <div className="text-organizer print-page landscape" id={page2Id}>
        <div className="page-two-content">
          {/* 원문 (왼쪽) */}
          <div className="original-text-section">
            <h3>원문</h3>
            <div className="text-box original-text-box">
              <p className="english-text original-text-content">{originalText}</p>
            </div>
          </div>

          {/* 오른쪽 컬럼: 글의 구성(영어만) + 해석 */}
          <div className="right-column-wrapper">
            <div className="diagram-section-page2">
              <h3>글의 구성 (단계별 설명)</h3>
              <div className="diagram-wrapper-page2 english-diagram-page2">
                <DiagramViewer content={data.englishDiagram} isEnglish={true} />
              </div>
            </div>

            {/* 해석(오른쪽 아래) */}
            {originalKorean && originalKorean.trim() && (
              <div className="korean-translation-right">
                <h4 className="korean-translation-title-right">해석</h4>
                <div className="korean-translation-box-right">
                  <p className="korean-text-right">{originalKorean}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 단어장 (2페이지 하단) */}
        {data.vocabulary && Array.isArray(data.vocabulary) && data.vocabulary.length > 0 && (
          <div className="vocabulary-section-page2">
            <h3 className="vocabulary-title-page2">단어장</h3>
            <div className="vocabulary-grid-page2">
              {data.vocabulary.slice(0, 20).map((item, index) => (
                <div key={index} className="vocabulary-item-page2">
                  <span className="vocabulary-word-page2">{item.word}</span>
                  <span className="vocabulary-meaning-page2">{item.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default TextOrganizer

