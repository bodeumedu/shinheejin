import { useState } from 'react'
import TextInput from './features/pocketbook/components/TextInput'
import TextOrganizer from './features/pocketbook/components/TextOrganizer'
import ApiKeyInput from './components/ApiKeyInput'
import PasswordProtection from './components/PasswordProtection'
import MainMenu from './components/MainMenu'
import BlankMaker from './features/blank/components/BlankMaker'
import BlankGenerator from './features/blank/components/BlankGenerator'
import PreprocessorInput from './features/preprocessor/components/PreprocessorInput'
import ComplexDescriptionInput from './features/complex-description/components/ComplexDescriptionInput'
import ParaphrasingInput from './features/paraphrasing/components/ParaphrasingInput'
import Sum15Input from './features/sum15/components/Sum15Input'
import Sum15Viewer from './features/sum15/components/Sum15Viewer'
import Sum40Input from './features/sum40/components/Sum40Input'
import KoreanSummaryInput from './features/korean-summary/components/KoreanSummaryInput'
import KoreanSummaryViewer from './features/korean-summary/components/KoreanSummaryViewer'
import KeyInput from './features/key/components/KeyInput'
import CsatClozeInput from './features/csat-cloze/components/CsatClozeInput'
import ThirdWordInput from './features/third-word/components/ThirdWordInput'
import OcrInput from './features/ocr/components/OcrInput'
import ReferenceDescriptionInput from './features/reference-description/components/ReferenceDescriptionInput'
import ReferenceDescriptionViewer from './features/reference-description/components/ReferenceDescriptionViewer'
import { exportReferenceDescriptionToPdf } from './features/reference-description/utils/referenceDescriptionPdfExporter'
import HomeworkDashboard from './features/homeworkdashboard/components/HomeworkDashboard'
import HomeworkProgress from './features/homeworkdashboard/components/HomeworkProgress'
import ClinicLog from './features/clinic-log/components/ClinicLog'
import { exportToPdf } from './features/pocketbook/utils/pdfExporter'
import { exportBlankToPdf } from './features/blank/utils/blankPdfExporter'
import { exportSum15ToPdf } from './features/sum15/utils/sum15PdfExporter'
import { exportKoreanSummaryToPdf } from './features/korean-summary/utils/koreanSummaryPdfExporter'
import './App.css'
import { analyzeText } from './features/pocketbook/utils/textAnalyzer'
import { saveTextResult, generateTextId, saveSourceInfo, getSourceDocumentId } from './utils/firestoreUtils'
import { parseSourceWithAI, formatSourceString } from './utils/sourceParser'
import SourceInputPopup from './components/SourceInputPopup'
import SourceLoader from './components/SourceLoader'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [mode, setMode] = useState('main') // 'main', 'pocketbook', 'blank', 'preprocessor', 'complex-description', 'paraphrasing', 'sum15', 'clinic-log'
  const [text, setText] = useState('')
  const [organizedData, setOrganizedData] = useState(null) // 배열로 관리: [{title,korean,english,analyzed}]
  const [parsedTexts, setParsedTexts] = useState(null) // 지문 나누기 결과 [{title,english,korean}]
  const [pocketbookTextId, setPocketbookTextId] = useState(null) // 포켓북 세션 고유 ID
  const [selectedTexts, setSelectedTexts] = useState(new Set()) // 선택된 지문 인덱스 Set
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzingProgress, setAnalyzingProgress] = useState({ current: 0, total: 0 }) // 분석 진행 상황
  const [sourcePopup, setSourcePopup] = useState(null) // 출처 입력 팝업 상태 { visible: true, sourceInfo: {...} }
  const [showSourceLoader, setShowSourceLoader] = useState(false) // 저장된 출처 불러오기 팝업
  const [currentSourceInfo, setCurrentSourceInfo] = useState(null) // 현재 세션의 출처 정보
  const [saveStatus, setSaveStatus] = useState({ saved: 0, failed: 0, total: 0 }) // 저장 상태 추적
  const [blankData, setBlankData] = useState(null)
  const [blankTextId, setBlankTextId] = useState(null) // 빈칸 세션 고유 ID
  const [selectedBlankTexts, setSelectedBlankTexts] = useState(new Set()) // 선택된 빈칸 지문 인덱스 Set
  const [blankSourceInfo, setBlankSourceInfo] = useState(null) // 빈칸 출처 정보
  const [blankSourcePopup, setBlankSourcePopup] = useState(null) // 빈칸 출처 입력 팝업
  const [showBlankSourceLoader, setShowBlankSourceLoader] = useState(false) // 빈칸 저장된 출처 불러오기 팝업
  const [preprocessorData, setPreprocessorData] = useState(null) // 전처리 결과
  const [complexDescriptionData, setComplexDescriptionData] = useState(null) // 복합서술형 결과
  const [paraphrasingData, setParaphrasingData] = useState(null) // Paraphrasing 결과
  const [sum15Data, setSum15Data] = useState(null) // SUM15 결과
  const [showSum15Design, setShowSum15Design] = useState(false) // SUM15 디자인 페이지 표시 여부
  const [sum40Data, setSum40Data] = useState(null) // SUM40 결과
  const [koreanSummaryData, setKoreanSummaryData] = useState(null) // 요약문 한글 결과
  const [koreanSummaryProcessedText, setKoreanSummaryProcessedText] = useState('') // 요약문 한글 처리된 텍스트 (수정 가능)
  const [showKoreanSummaryDesign, setShowKoreanSummaryDesign] = useState(false) // 요약문 한글 디자인 페이지 표시 여부
  const [keyData, setKeyData] = useState(null) // KEY 결과
  const [csatClozeData, setCsatClozeData] = useState(null) // 빈칸 수능문제 결과
  const [thirdWordData, setThirdWordData] = useState(null) // Third Word 결과
  const [ocrData, setOcrData] = useState(null) // OCR 결과
  const [referenceDescriptionData, setReferenceDescriptionData] = useState(null) // 지칭서술형 결과
  const [referenceDescriptionProcessedText, setReferenceDescriptionProcessedText] = useState('') // 지칭서술형 처리된 텍스트
  const [showReferenceDescriptionDesign, setShowReferenceDescriptionDesign] = useState(false) // 지칭서술형 디자인 페이지 표시 여부
  const [homeworkProgressData, setHomeworkProgressData] = useState(null) // 과제 진행 데이터
  const [apiKey, setApiKey] = useState('')
  const [isSavingPdf, setIsSavingPdf] = useState(false)

  const handleAnalyze = (data) => {
    // data: 분석 결과 배열 [{title,korean,english,analyzed}]
    setOrganizedData(data)
  }

  const handleDivide = (parsed) => {
    // 지문 나누기를 할 때는 이전 분석 상태를 모두 초기화
    setOrganizedData(null)
    setParsedTexts(parsed)
    setPocketbookTextId(null)
    setSelectedTexts(new Set())
    setIsAnalyzing(false)
    setAnalyzingProgress({ current: 0, total: 0 })
    setSourcePopup(null)
    setCurrentSourceInfo(null)
    setSaveStatus({ saved: 0, failed: 0, total: 0 })
  }

  const startPocketbook = async () => {
    if (!parsedTexts || parsedTexts.length === 0) return
    if (!apiKey) {
      alert('API 키를 먼저 설정해주세요.')
      return
    }
    
    // 첫 번째 지문의 제목에서 출처 파싱
    if (parsedTexts[0] && parsedTexts[0].title) {
      console.log('출처 파싱 시작:', parsedTexts[0].title);
      const parsedSource = await parseSourceWithAI(parsedTexts[0].title, apiKey);
      
      // 부족한 필드가 있으면 팝업 표시
      if (parsedSource.missingFields && parsedSource.missingFields.length > 0) {
        setSourcePopup({ visible: true, sourceInfo: parsedSource });
        return; // 사용자가 출처 정보를 입력할 때까지 대기
      }
      
      setCurrentSourceInfo(parsedSource);
    }
    
    // 출처 정보가 확정되면 분석 시작
    await startPocketbookAnalysis();
  }

  const handleSourceConfirm = async (confirmedSourceInfo) => {
    setCurrentSourceInfo(confirmedSourceInfo);
    setSourcePopup(null);
    // 출처 정보 확정 후 분석 시작
    await startPocketbookAnalysis();
  }

  const startPocketbookAnalysis = async () => {
    if (!parsedTexts || parsedTexts.length === 0) return
    
    // 고유 텍스트 ID 생성 (이 세션의 모든 지문을 묶는 ID)
    const textId = generateTextId()
    setPocketbookTextId(textId)
    setSelectedTexts(new Set(Array.from({length: parsedTexts.length}, (_, i) => i))) // 처음에는 모두 선택
    
    setIsAnalyzing(true)
    setAnalyzingProgress({ current: 0, total: parsedTexts.length })
    
    try {
      const results = []
      
      // 저장 상태 초기화
      setSaveStatus({ saved: 0, failed: 0, total: parsedTexts.length })
      
      const savePromises = [] // 저장 Promise 추적
      
      for (let i = 0; i < parsedTexts.length; i++) {
        const block = parsedTexts[i]
        setAnalyzingProgress({ current: i + 1, total: parsedTexts.length })
        
        console.log(`지문 ${i + 1}/${parsedTexts.length} 분석 시작...`)
        
        // 타임아웃 설정 (60초)
        const analyzePromise = analyzeText(block.english, apiKey)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`지문 ${i + 1} 분석 타임아웃 (60초 초과)`)), 60000)
        )
        
        let analyzed
        try {
          analyzed = await Promise.race([analyzePromise, timeoutPromise])
        } catch (error) {
          console.error(`지문 ${i + 1} 분석 실패:`, error)
          alert(`지문 ${i + 1} 분석 중 오류가 발생했습니다: ${error.message}\n\n나머지 지문은 계속 분석합니다.`)
          continue // 다음 지문으로 계속 진행
        }
        
        // 문항번호 추출
        let questionNumber = null;
        
        // 1. 제목에서 문항번호 추출
        if (block.title) {
          // 숫자 번호 추출 (예: "18번", "18", "문항18" 등)
          const numberMatch = block.title.match(/(\d+)번?$/);
          if (numberMatch) {
            questionNumber = numberMatch[1];
          } else {
            // 텍스트 문항번호 추출 (예: "Analysis", "Review" 등)
            // 제목의 마지막 부분이 숫자가 아닌 텍스트인 경우
            const parts = block.title.split(/[_\s]+/);
            if (parts.length > 0) {
              const lastPart = parts[parts.length - 1];
              // 숫자가 아닌 텍스트이고, 일반적인 단어가 아닌 경우 문항번호로 간주
              if (!/^\d+$/.test(lastPart) && 
                  lastPart.length > 0 && 
                  /^[A-Za-z]+$/.test(lastPart)) {
                // "Analysis", "Review" 같은 특정 키워드만 추출
                const textKeywords = ['Analysis', 'Review', 'Summary', 'Exercise', 'Practice'];
                if (textKeywords.some(keyword => lastPart.includes(keyword) || keyword.includes(lastPart))) {
                  questionNumber = lastPart;
                } else if (lastPart.length > 2 && /^[A-Z]/.test(lastPart)) {
                  // 대문자로 시작하는 3글자 이상의 텍스트는 문항번호로 간주
                  questionNumber = lastPart;
                }
              }
            }
          }
        }
        
        // 2. 첫 번째 지문이고 출처 정보에 문항번호가 있으면 사용
        if (i === 0 && currentSourceInfo && currentSourceInfo.questionNumber && !questionNumber) {
          questionNumber = currentSourceInfo.questionNumber;
        }
        
        const result = { ...block, analyzed, index: i, questionNumber }
        results.push(result)
        
        // Firebase 저장 (Promise 추적)
        const savePromise = saveTextResult('pocketbook', textId, i, {
          title: block.title,
          korean: block.korean,
          english: block.english,
          analyzed: analyzed,
          index: i,
          questionNumber: questionNumber,
          sourceInfo: currentSourceInfo,
        }).then(() => {
          console.log(`✅ 지문 ${i + 1} 저장 완료`)
          setSaveStatus(prev => ({ ...prev, saved: prev.saved + 1 }))
        }).catch(error => {
          console.error(`❌ 지문 ${i + 1} Firebase 저장 실패:`, error)
          setSaveStatus(prev => ({ ...prev, failed: prev.failed + 1 }))
        })
        
        savePromises.push(savePromise)
        console.log(`지문 ${i + 1}/${parsedTexts.length} 분석 완료`)
      }
      
      if (results.length === 0) {
        alert('모든 지문 분석에 실패했습니다. 다시 시도해주세요.')
        setIsAnalyzing(false)
        return
      }
      
      setOrganizedData(results)
      console.log(`총 ${results.length}개 지문 분석 완료`)
      
      // 출처 정보 저장 (백그라운드) - 모든 문항번호 수집
      // 출처 정보가 없어도 첫 번째 지문의 제목에서 출처 정보 추출 시도
      let sourceInfoToSave = currentSourceInfo;
      
      if (!sourceInfoToSave && results.length > 0 && results[0].title) {
        // 출처 정보가 없으면 첫 번째 지문 제목에서 다시 시도
        console.log('출처 정보가 없어서 첫 번째 지문 제목에서 다시 파싱 시도:', results[0].title);
        try {
          const parsedSource = await parseSourceWithAI(results[0].title, apiKey);
          if (parsedSource && !parsedSource.missingFields?.length) {
            sourceInfoToSave = parsedSource;
            setCurrentSourceInfo(parsedSource);
            console.log('✅ 출처 정보 파싱 성공:', parsedSource);
          }
        } catch (error) {
          console.warn('출처 정보 파싱 실패 (지문은 저장됨):', error);
        }
      }
      
      if (sourceInfoToSave) {
        // 모든 지문의 문항번호 수집
        const allQuestionNumbers = results
          .map(r => r.questionNumber)
          .filter(q => q !== null && q !== undefined)
          .filter((q, idx, arr) => arr.indexOf(q) === idx); // 중복 제거
        
        const sourceInfoWithQuestions = {
          ...sourceInfoToSave,
          questionNumbers: allQuestionNumbers
        };
        
        saveSourceInfo(sourceInfoWithQuestions, textId)
          .then(() => {
            console.log('✅ 출처 정보 저장 완료:', getSourceDocumentId(sourceInfoWithQuestions));
            console.log('저장된 출처:', sourceInfoWithQuestions);
          })
          .catch(error => {
            console.error('❌ 출처 정보 저장 실패:', error);
            console.error('오류 상세:', error.message);
            alert('출처 정보 저장 중 오류가 발생했습니다. 지문은 저장되었지만 출처 정보는 저장되지 않았습니다.\n\n콘솔을 확인해주세요.');
          })
      } else {
        console.warn('⚠️ 출처 정보가 없어서 출처 정보는 저장되지 않았습니다. 지문 데이터는 저장되었습니다.');
      }
      
      // Firebase 저장 완료 대기 (모든 저장 완료까지 기다림)
      console.log('저장 완료 대기 중...')
      const saveResults = await Promise.allSettled(savePromises)
      
      // 저장 결과 요약
      const successful = saveResults.filter(r => r.status === 'fulfilled').length
      const failed = saveResults.filter(r => r.status === 'rejected').length
      
      console.log(`저장 완료: 성공 ${successful}개, 실패 ${failed}개`)
      
      if (failed > 0) {
        alert(`⚠️ 저장 완료\n성공: ${successful}개, 실패: ${failed}개\n\n실패한 지문은 브라우저 콘솔(F12)을 확인해주세요.`)
      } else {
        alert(`✅ 모든 지문이 성공적으로 저장되었습니다! (${successful}개)`)
      }
      
    } catch (e) {
      console.error('분석 전체 오류:', e)
      alert(e.message || '분석 중 오류가 발생했습니다.')
    } finally {
      setIsAnalyzing(false)
      setAnalyzingProgress({ current: 0, total: 0 })
    }
  }

  const handleReset = () => {
    setText('')
    setOrganizedData(null)
    setParsedTexts(null)
    setPocketbookTextId(null)
    setSelectedTexts(new Set())
    setBlankData(null)
    setPreprocessorData(null)
    setComplexDescriptionData(null)
    setParaphrasingData(null)
    setSum15Data(null)
    setShowSum15Design(false)
    setSum40Data(null)
    setKoreanSummaryData(null)
    setKoreanSummaryProcessedText('')
    setShowKoreanSummaryDesign(false)
    setKeyData(null)
    setCsatClozeData(null)
    setThirdWordData(null)
    setOcrData(null)
    setHomeworkProgressData(null)
    setMode('main')
  }
  
  const handleBackToMain = () => {
    // 모든 상태 완전 초기화
    setText('')
    setOrganizedData(null)
    setParsedTexts(null)
    setPocketbookTextId(null)
    setSelectedTexts(new Set())
    setIsAnalyzing(false)
    setAnalyzingProgress({ current: 0, total: 0 })
    setSourcePopup(null)
    setCurrentSourceInfo(null)
    setSaveStatus({ saved: 0, failed: 0, total: 0 })
    setShowSourceLoader(false)
    setBlankData(null)
    setPreprocessorData(null)
    setComplexDescriptionData(null)
    setParaphrasingData(null)
    setSum15Data(null)
    setShowSum15Design(false)
    setSum40Data(null)
    setKoreanSummaryData(null)
    setKoreanSummaryProcessedText('')
    setShowKoreanSummaryDesign(false)
    setKeyData(null)
    setCsatClozeData(null)
    setThirdWordData(null)
    setOcrData(null)
    setHomeworkProgressData(null)
    setMode('main')
  }
  
  const handleSelectPocketbook = () => {
    // 포켓북 만들기를 시작할 때 모든 포켓북 관련 상태 초기화
    setText('')
    setOrganizedData(null)
    setParsedTexts(null)
    setPocketbookTextId(null)
    setSelectedTexts(new Set())
    setIsAnalyzing(false)
    setAnalyzingProgress({ current: 0, total: 0 })
    setSourcePopup(null)
    setCurrentSourceInfo(null)
    setSaveStatus({ saved: 0, failed: 0, total: 0 })
    setShowSourceLoader(false)
    setMode('pocketbook')
  }
  
  const handleSelectBlank = () => {
    // 빈칸 만들기를 시작할 때 모든 빈칸 관련 상태 초기화
    setText('')
    setBlankData(null)
    setBlankTextId(null)
    setSelectedBlankTexts(new Set())
    setBlankSourceInfo(null)
    setBlankSourcePopup(null)
    setShowBlankSourceLoader(false)
    setMode('blank')
  }
  
  const handleBlankGenerate = (blankResults) => {
    // 빈칸 생성 완료 시 textId 생성 및 초기 선택 설정
    const textId = generateTextId()
    setBlankTextId(textId)
    setSelectedBlankTexts(new Set(Array.from({length: blankResults.length}, (_, i) => i))) // 처음에는 모두 선택
    setBlankData(blankResults)
    
    // 출처 파싱 시도
    if (blankResults.length > 0 && blankResults[0].title) {
      parseSourceWithAI(blankResults[0].title, apiKey).then(parsedSource => {
        if (parsedSource && parsedSource.missingFields && parsedSource.missingFields.length > 0) {
          setBlankSourcePopup({ visible: true, sourceInfo: parsedSource })
        } else {
          setBlankSourceInfo(parsedSource)
        }
      }).catch(error => {
        console.warn('빈칸 출처 파싱 실패:', error)
      })
    }
  }
  
  const handleBlankSourceConfirm = async (confirmedSourceInfo) => {
    setBlankSourceInfo(confirmedSourceInfo)
    setBlankSourcePopup(null)
  }
  
  const handleSaveBlank = async () => {
    if (!blankData || !blankTextId || selectedBlankTexts.size === 0) {
      alert('저장할 빈칸이 선택되지 않았습니다.')
      return
    }
    
    const confirmed = confirm(`선택한 ${selectedBlankTexts.size}개 빈칸을 Firebase에 저장하시겠습니까?`)
    if (!confirmed) return
    
    let saved = 0
    let failed = 0
    let offlineCount = 0
    
    for (const idx of selectedBlankTexts) {
      const item = blankData[idx]
      try {
        // 문항번호 추출 (포켓북과 동일한 로직)
        let questionNumber = null
        if (item.title) {
          const numberMatch = item.title.match(/(\d+)번?$/)
          if (numberMatch) {
            questionNumber = numberMatch[1]
          } else {
            const parts = item.title.split(/[_\s]+/)
            if (parts.length > 0) {
              const lastPart = parts[parts.length - 1]
              const textKeywords = ['Analysis', 'Review', 'Summary', 'Exercise', 'Practice']
              if (textKeywords.some(keyword => lastPart.includes(keyword) || keyword.includes(lastPart))) {
                questionNumber = lastPart
              } else if (lastPart.length > 2 && /^[A-Z]/.test(lastPart)) {
                questionNumber = lastPart
              }
            }
          }
        }
        
        const saveData = {
          title: item.title || '',
          english: item.english || '',
          korean: item.korean || '',
          textWithBlanks: item.textWithBlanks || '',
          answers: Array.isArray(item.answers) ? item.answers : [],
          blankCount: item.blankCount || 0,
          blankType: item.blankType || 'nouns',
          highlights: Array.isArray(item.highlights) ? item.highlights : [],
          index: idx,
          questionNumber: questionNumber || null,
          sourceInfo: blankSourceInfo || null,
        }
        
        // undefined 필드 제거 (Firebase는 undefined를 지원하지 않음)
        Object.keys(saveData).forEach(key => {
          if (saveData[key] === undefined) {
            delete saveData[key]
          }
        })
        
        console.log(`💾 빈칸 ${idx + 1} 저장 데이터:`, {
          title: saveData.title,
          questionNumber: saveData.questionNumber,
          sourceInfo: saveData.sourceInfo
        });
        
        await saveTextResult('blank', blankTextId, idx, saveData)
        saved++
      } catch (error) {
        // 오프라인 오류인 경우
        if (error.code === 'unavailable' || error.message?.includes('offline')) {
          console.warn(`⚠️ 빈칸 ${idx + 1} 오프라인 상태: Firebase가 온라인 상태가 되면 자동으로 저장됩니다.`);
          offlineCount++
          saved++ // 오프라인은 성공으로 처리 (Firebase가 자동 재시도)
        } else {
          console.error(`❌ 빈칸 ${idx + 1} 저장 실패:`, error);
          failed++
        }
      }
    }
    
    // 출처 정보 저장 (출처 정보가 없으면 첫 번째 지문 제목에서 파싱 시도)
    let sourceInfoToSave = blankSourceInfo;
    
    if (!sourceInfoToSave && saved > 0 && blankData.length > 0 && blankData[0].title) {
      // 출처 정보가 없으면 첫 번째 지문 제목에서 다시 시도
      console.log('빈칸 출처 정보가 없어서 첫 번째 지문 제목에서 다시 파싱 시도:', blankData[0].title);
      try {
        const parsedSource = await parseSourceWithAI(blankData[0].title, apiKey);
        if (parsedSource && (!parsedSource.missingFields || parsedSource.missingFields.length === 0)) {
          sourceInfoToSave = parsedSource;
          setBlankSourceInfo(parsedSource);
          console.log('✅ 빈칸 출처 정보 파싱 성공:', parsedSource);
        } else {
          console.warn('⚠️ 빈칸 출처 정보 파싱 실패 또는 필수 필드 부족:', parsedSource);
        }
      } catch (error) {
        console.warn('빈칸 출처 정보 파싱 실패:', error);
      }
    }
    
    if (sourceInfoToSave && saved > 0) {
      const allQuestionNumbers = Array.from(selectedBlankTexts)
        .map(idx => {
          const item = blankData[idx]
          if (item.title) {
            const numberMatch = item.title.match(/(\d+)번?$/)
            if (numberMatch) return numberMatch[1]
            const parts = item.title.split(/[_\s]+/)
            if (parts.length > 0) {
              const lastPart = parts[parts.length - 1]
              const textKeywords = ['Analysis', 'Review', 'Summary', 'Exercise', 'Practice']
              if (textKeywords.some(keyword => lastPart.includes(keyword) || keyword.includes(lastPart))) {
                return lastPart
              }
            }
          }
          return null
        })
        .filter(q => q !== null)
        .filter((q, idx, arr) => arr.indexOf(q) === idx)
      
      const sourceInfoWithQuestions = {
        ...sourceInfoToSave,
        questionNumbers: allQuestionNumbers
      }
      
      console.log('💾 빈칸 출처 정보 저장 시도:', sourceInfoWithQuestions);
      saveSourceInfo(sourceInfoWithQuestions, blankTextId)
        .then(() => {
          console.log('✅ 빈칸 출처 정보 저장 완료:', getSourceDocumentId(sourceInfoWithQuestions));
        })
        .catch(error => {
          console.error('❌ 빈칸 출처 정보 저장 실패:', error);
          alert('출처 정보 저장 중 오류가 발생했습니다. 지문은 저장되었지만 출처 정보는 저장되지 않았습니다.\n\n콘솔을 확인해주세요.');
        })
    } else {
      console.warn('⚠️ 빈칸 출처 정보가 없어서 출처 정보는 저장되지 않았습니다. 지문 데이터는 저장되었습니다.');
    }
    
    if (failed === 0) {
      if (offlineCount > 0) {
        alert(`✅ 모든 빈칸이 저장되었습니다! (${saved}개)\n\n⚠️ 현재 오프라인 상태입니다. Firebase가 온라인 상태가 되면 자동으로 동기화됩니다.`)
      } else {
        alert(`✅ 모든 빈칸이 저장되었습니다! (${saved}개)`)
      }
    } else {
      if (offlineCount > 0) {
        alert(`⚠️ 저장 완료\n성공: ${saved}개 (오프라인 ${offlineCount}개 포함), 실패: ${failed}개\n\n오프라인 상태: Firebase가 온라인 상태가 되면 자동으로 동기화됩니다.`)
      } else {
        alert(`⚠️ 저장 완료\n성공: ${saved}개, 실패: ${failed}개`)
      }
    }
  }
  
  const handleSelectPreprocessor = () => {
    setMode('preprocessor')
  }
  
  const handleSelectComplexDescription = () => {
    setMode('complex-description')
  }
  
  const handleSelectParaphrasing = () => {
    setMode('paraphrasing')
  }
  
  const handleSelectSum15 = () => {
    setMode('sum15')
  }
  
  const handleSelectSum40 = () => {
    setMode('sum40')
  }
  
  const handleSelectKoreanSummary = () => {
    setMode('korean-summary')
  }
  
  const handleSelectKey = () => {
    setMode('key')
  }

  const handleSelectCsatCloze = () => {
    setMode('csat-cloze')
  }
  
  const handleSelectThirdWord = () => {
    setMode('third-word')
  }

  const handleSelectReferenceDescription = () => {
    setMode('reference-description')
    setText('')
    setReferenceDescriptionData(null)
    setReferenceDescriptionProcessedText('')
  }
  
  const handleSelectOcr = () => {
    setMode('ocr')
  }
  
  const handleSelectEnglishHomeworkDashboard = () => {
    setMode('english-homework-dashboard')
  }

  const handleSelectMathHomeworkDashboard = () => {
    setMode('math-homework-dashboard')
  }

  const handleSelectClinicLog = () => {
    setMode('clinic-log')
  }
  
  const handlePreprocessorProcess = (data) => {
    setPreprocessorData(data)
  }
  
  const handleComplexDescriptionProcess = (data) => {
    setComplexDescriptionData(data)
  }
  
  const handleParaphrasingProcess = (data) => {
    setParaphrasingData(data)
  }
  
  const handleSum15Process = (data) => {
    setSum15Data(data)
  }
  
  const handleSum40Process = (data) => {
    setSum40Data(data)
  }
  
  const handleKoreanSummaryProcess = (data) => {
    setKoreanSummaryData(data)
    setKoreanSummaryProcessedText(data.processed || data.summary || '')
  }
  
  const handleKeyProcess = (data) => {
    setKeyData(data)
  }
  
  const handleCsatClozeProcess = (data) => {
    setCsatClozeData(data)
  }
  
  const handleThirdWordProcess = (data) => {
    setThirdWordData(data)
  }

  const handleReferenceDescriptionProcess = (data, processedText) => {
    setReferenceDescriptionData(data)
    setReferenceDescriptionProcessedText(processedText || '')
  }
  
  const handleApiKeySet = (key) => {
    setApiKey(key)
  }

  const handleSavePdf = async () => {
    setIsSavingPdf(true)
    try {
      if (mode === 'blank' && blankData && selectedBlankTexts.size > 0) {
        // 선택된 빈칸만 PDF 저장
        await exportBlankToPdf(Array.from(selectedBlankTexts))
      } else if (mode === 'sum15' && sum15Data) {
        await exportSum15ToPdf()
      } else if (mode === 'pocketbook' && organizedData && selectedTexts.size > 0) {
        // 포켓북 모드: 선택한 지문만 PDF 저장
        await exportToPdf(Array.from(selectedTexts))
      } else {
        await exportToPdf()
      }
    } catch (error) {
      alert(error.message || 'PDF 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSavingPdf(false)
    }
  }

  // 비밀번호 확인 전에는 비밀번호 화면만 표시
  if (!isAuthenticated) {
    return <PasswordProtection onPasswordCorrect={() => setIsAuthenticated(true)} />
  }

  // 메인 메뉴 표시
  if (mode === 'main') {
    return (
      <div className="app">
        <MainMenu 
          onSelectPocketbook={handleSelectPocketbook}
          onSelectBlank={handleSelectBlank}
          onSelectPreprocessor={handleSelectPreprocessor}
          onSelectComplexDescription={handleSelectComplexDescription}
          onSelectParaphrasing={handleSelectParaphrasing}
          onSelectSum15={handleSelectSum15}
          onSelectSum40={handleSelectSum40}
          onSelectKoreanSummary={handleSelectKoreanSummary}
          onSelectKey={handleSelectKey}
          onSelectCsatCloze={handleSelectCsatCloze}
          onSelectThirdWord={handleSelectThirdWord}
          onSelectReferenceDescription={handleSelectReferenceDescription}
          onSelectOcr={handleSelectOcr}
          onSelectEnglishHomeworkDashboard={handleSelectEnglishHomeworkDashboard}
          onSelectMathHomeworkDashboard={handleSelectMathHomeworkDashboard}
          onSelectClinicLog={handleSelectClinicLog}
        />
      </div>
    )
  }

  // 클리닉 대장 모드
  if (mode === 'clinic-log') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>🗂️ 클리닉 대장</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <div className="main-content">
          <ClinicLog />
        </div>
      </div>
    )
  }

  // OCR 모드
  if (mode === 'ocr') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>📷 사진 텍스트 추출</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        <div className="main-content">
          <OcrInput apiKey={apiKey} />
        </div>
      </div>
    )
  }

  // 과제 관리 대시보드 모드
  if (mode === 'english-homework-dashboard') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>📚 영어 과제관리 대시보드</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <HomeworkDashboard 
            subject="english"
            onClose={handleBackToMain} 
            onShowRoster={(data, subjectType) => {
              setHomeworkProgressData({ ...data, subject: subjectType || 'english' });
            }}
          />

          {homeworkProgressData && (
            <div className="homework-roster-section">
              <div className="homework-roster-header">
                <h3>
                  {homeworkProgressData.grade || ''}
                  {homeworkProgressData.teacher ? ` ${homeworkProgressData.teacher} 선생님` : ''}
                  {homeworkProgressData.class ? ` ${homeworkProgressData.class}` : ''}
                </h3>
                <button 
                  className="roster-hide-btn"
                  onClick={() => setHomeworkProgressData(null)}
                >
                  닫기
                </button>
              </div>
              <HomeworkProgress
                subject="english"
                school={homeworkProgressData.school}
                grade={homeworkProgressData.grade}
                class={homeworkProgressData.class}
                teacher={homeworkProgressData.teacher}
                onClose={() => setHomeworkProgressData(null)}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (mode === 'math-homework-dashboard') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>📚 수학 과제관리 대시보드</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <HomeworkDashboard 
            subject="math"
            onClose={handleBackToMain} 
            onShowRoster={(data, subjectType) => {
              setHomeworkProgressData({ ...data, subject: subjectType || 'english' });
            }}
          />

          {homeworkProgressData && (
            <div className="homework-roster-section">
              <div className="homework-roster-header">
                <h3>
                  {homeworkProgressData.grade || ''}
                  {homeworkProgressData.teacher ? ` ${homeworkProgressData.teacher} 선생님` : ''}
                  {homeworkProgressData.class ? ` ${homeworkProgressData.class}` : ''}
                </h3>
                <button 
                  className="roster-hide-btn"
                  onClick={() => setHomeworkProgressData(null)}
                >
                  닫기
                </button>
              </div>
              <HomeworkProgress
                subject="math"
                school={null}
                grade={homeworkProgressData.grade}
                class={homeworkProgressData.class}
                teacher={homeworkProgressData.teacher}
                onClose={() => setHomeworkProgressData(null)}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  // 빈칸 만들기 모드
  if (mode === 'blank') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>빈칸 만들기</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!blankData ? (
          <>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <button 
                onClick={() => setShowBlankSourceLoader(true)}
                className="btn btn-secondary"
                style={{ fontSize: '0.9rem', padding: '8px 16px' }}
              >
                📚 저장된 출처 불러오기
              </button>
            </div>
            <BlankMaker
              text={text}
              setText={setText}
              onGenerate={handleBlankGenerate}
              apiKey={apiKey}
            />
          </>
        ) : (
          <div className="result-container">
            <div className="result-actions" style={{ marginBottom: '20px' }}>
              <button onClick={() => { 
                setBlankData(null)
                setText('')
                setBlankTextId(null)
                setSelectedBlankTexts(new Set())
                setBlankSourceInfo(null)
                setBlankSourcePopup(null)
              }} className="btn btn-secondary">
                새로 만들기
              </button>
              <button 
                onClick={() => setShowBlankSourceLoader(true)}
                className="btn btn-secondary"
                style={{ fontSize: '0.9rem', padding: '8px 16px' }}
              >
                저장된 출처 불러오기
              </button>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  onClick={() => {
                    if (selectedBlankTexts.size === blankData.length) {
                      setSelectedBlankTexts(new Set())
                    } else {
                      setSelectedBlankTexts(new Set(blankData.map((_, i) => i)))
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.9rem', padding: '8px 16px' }}
                >
                  {selectedBlankTexts.size === blankData.length ? '전체 해제' : '전체 선택'}
                </button>
                <span style={{ color: '#6c757d', fontSize: '0.9rem' }}>
                  선택: {selectedBlankTexts.size} / {blankData.length}
                </span>
              </div>
              <button 
                onClick={handleSaveBlank} 
                className="btn btn-secondary"
                disabled={selectedBlankTexts.size === 0}
              >
                💾 선택한 빈칸 저장
              </button>
              <button 
                onClick={handleSavePdf} 
                className="btn btn-primary" 
                disabled={isSavingPdf || selectedBlankTexts.size === 0}
              >
                {isSavingPdf ? 'PDF 저장 중...' : `PDF 저장`}
              </button>
              <button onClick={() => window.print()} className="btn btn-primary">
                인쇄하기
              </button>
            </div>
            {blankData && blankData.length > 0 && (
              <>
                {/* 체크박스 선택 UI */}
                <div className="multiple-results" style={{ marginBottom: '20px' }}>
                  {blankData.map((item, idx) => {
                    const isSelected = selectedBlankTexts.has(idx)
                    return (
                      <div key={idx} className="result-item" style={{ 
                        opacity: isSelected ? 1 : 0.6,
                        border: isSelected ? '2px solid #2563eb' : '1px solid #e0e0e0',
                        borderRadius: '8px',
                        padding: '16px',
                        transition: 'all 0.2s',
                        background: isSelected ? '#ffffff' : '#f8f9fa',
                        marginBottom: '16px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newSelected = new Set(selectedBlankTexts)
                              if (e.target.checked) {
                                newSelected.add(idx)
                              } else {
                                newSelected.delete(idx)
                              }
                              setSelectedBlankTexts(newSelected)
                            }}
                            style={{
                              width: '20px',
                              height: '20px',
                              cursor: 'pointer',
                              accentColor: '#2563eb',
                              flexShrink: 0
                            }}
                          />
                          <div style={{ 
                            margin: 0,
                            flex: 1,
                            fontWeight: isSelected ? '600' : '500',
                            fontSize: '1.1rem',
                            color: isSelected ? '#1f2937' : '#6b7280'
                          }}>
                            {item.title || `지문 ${idx + 1}`}
                          </div>
                        </div>
                        {!isSelected && (
                          <div style={{ 
                            marginTop: '8px', 
                            padding: '12px', 
                            background: '#f3f4f6', 
                            borderRadius: '6px',
                            color: '#6b7280',
                            fontSize: '0.9rem'
                          }}>
                            체크박스를 선택하면 빈칸 내용이 표시됩니다.
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                
                {/* 선택된 모든 빈칸을 종류별로 모아서 표시 */}
                {selectedBlankTexts.size > 0 && (() => {
                  // 선택된 빈칸 데이터 수집
                  const selectedBlanks = Array.from(selectedBlankTexts)
                    .map(idx => blankData[idx])
                    .filter(item => item)
                  
                  if (selectedBlanks.length === 0) return null
                  
                  // 모든 빈칸이 같은 타입인지 확인
                  const blankType = selectedBlanks[0]?.blankType || 'nouns'
                  
                  return (
                    <BlankGenerator 
                      blankData={selectedBlanks}
                      blankType={blankType}
                      baseIndex={0}
                    />
                  )
                })()}
              </>
            )}
            
            {/* 답지 페이지 - 선택된 모든 빈칸의 답지를 마지막에 한꺼번에 표시 */}
            {blankData && blankData.length > 0 && selectedBlankTexts.size > 0 && (() => {
              // 선택된 빈칸들의 답지 수집
              const allAnswersByText = Array.from(selectedBlankTexts)
                .map(idx => blankData[idx])
                .map((data, index) => {
                  const text = data.textWithBlanks || ''
                  const boldMatches = [...text.matchAll(/<b>(.*?)<\/b>/gi)]
                  const wordsFromBold = boldMatches.map(m => (m[1] || '').trim()).filter(Boolean)
                  
                  const answersUsed = (wordsFromBold.length > 0
                    ? wordsFromBold
                    : (Array.isArray(data.answers) ? data.answers.map(a => a?.word ?? '') : [])
                  ).map((w, i) => ({
                    number: i + 1,
                    word: w
                  }))
                  
                  return {
                    title: data.title || `지문 ${index + 1}`,
                    answers: answersUsed,
                    total: answersUsed.length,
                    blankType: data.blankType
                  }
                })
                .filter(textData => textData.answers && textData.answers.length > 0)
              
              if (allAnswersByText.length === 0) return null
              
              const getBlankTypeKorean = (type) => {
                const types = {
                  'nouns': '명사',
                  'verbs': '동사',
                  'adjectives': '형용사'
                }
                return types[type] || '빈칸'
              }
              
              const getDesignClass = (type) => {
                const designs = {
                  'nouns': 'blank-design-nouns',
                  'verbs': 'blank-design-verbs',
                  'adjectives': 'blank-design-adjectives'
                }
                return designs[type] || 'blank-design-nouns'
              }
              
              // 첫 번째 빈칸 타입 사용 (모두 같은 타입이어야 함)
              const blankType = blankData[0]?.blankType || 'nouns'
              
              return (
                <div className={`answer-page ${getDesignClass(blankType)}`} id="answer-page-all" style={{ marginTop: '40px' }}>
                  <div className="answer-page-header">
                    <h2 className="answer-title">
                      {getBlankTypeKorean(blankType)} 하이라이트 답지 (전체)
                    </h2>
                  </div>
                  
                  <div className="answer-content">
                    {allAnswersByText.map((textData, textIndex) => (
                      <div key={textIndex} className="answer-text-group">
                        <h3 className="answer-text-title">{textData.title} (총 {textData.total}개)</h3>
                        <div className="answer-grid">
                          {textData.answers.map((answer, ansIndex) => (
                            <div key={ansIndex} className="answer-item">
                              <span className="answer-number">{answer.number}.</span>
                              <span className="answer-word">{answer.word}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
        
        {/* 빈칸 출처 입력 팝업 */}
        {blankSourcePopup && blankSourcePopup.visible && (
          <SourceInputPopup
            sourceInfo={blankSourcePopup.sourceInfo}
            onConfirm={handleBlankSourceConfirm}
            onCancel={() => setBlankSourcePopup(null)}
          />
        )}
        
        {/* 빈칸 저장된 출처 불러오기 팝업 */}
        {showBlankSourceLoader && (
          <SourceLoader
            featureType="blank"
            onLoad={(loadedTexts) => {
              if (loadedTexts && loadedTexts.length > 0) {
                // 1단계에서 불러온 경우: 텍스트 형식으로 변환하여 입력
                if (!blankData) {
                  // 지문 나누기 형식으로 변환: "제목 / 영어원문 / 한글원문 // ..."
                  const formattedText = loadedTexts
                    .map(item => {
                      const title = item.title || ''
                      const english = item.english || ''
                      const korean = item.korean || ''
                      return `${title} / ${english} / ${korean}`
                    })
                    .join(' // ')
                  setText(formattedText)
                  setShowBlankSourceLoader(false)
                } else {
                  // 2단계 이후에서 불러온 경우: 바로 데이터로 사용
                  const textId = generateTextId()
                  setBlankTextId(textId)
                  setSelectedBlankTexts(new Set(Array.from({length: loadedTexts.length}, (_, i) => i)))
                  setBlankData(loadedTexts)
                  setShowBlankSourceLoader(false)
                }
              }
            }}
            onClose={() => setShowBlankSourceLoader(false)}
          />
        )}
      </div>
    )
  }

  // 문장 넣기 전처리 모드
  if (mode === 'preprocessor') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>문장 넣기 전처리</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        {!preprocessorData ? (
          <PreprocessorInput
            text={text}
            setText={setText}
            onProcess={handlePreprocessorProcess}
          />
        ) : (
          <div className="result-container">
            <div className="result-actions">
              <button onClick={() => { setPreprocessorData(null); setText('') }} className="btn btn-secondary">
                다시 처리하기
              </button>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(preprocessorData.processed)
                  alert('전처리된 텍스트가 클립보드에 복사되었습니다.')
                }} 
                className="btn btn-primary"
              >
                결과 복사하기
              </button>
            </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                전처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {preprocessorData.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>전처리된 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    {(() => {
                      // 슬래시 부족한 지문 부분만 빨간색으로 표시
                      if (!preprocessorData.results || preprocessorData.results.length === 0) {
                        return (
                          <pre style={{ 
                            margin: 0, 
                            color: '#2c3e50', 
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'inherit',
                            fontSize: '0.95rem',
                            lineHeight: '1.6'
                          }}>
                            {preprocessorData.processed}
                          </pre>
                        )
                      }

                      // 전체 텍스트를 지문별로 나누어 색상 적용
                      let processedText = preprocessorData.processed
                      let charIndex = 0
                      const elements = []
                      
                      preprocessorData.results.forEach((result, idx) => {
                        const startIndex = charIndex
                        let blockText = result.processed
                        
                        // separator 추가 (첫 번째가 아니면)
                        if (idx > 0) {
                          blockText = result.separator + blockText
                        }
                        
                        const endIndex = startIndex + blockText.length
                        const textColor = result.isValid ? '#2c3e50' : '#e74c3c'
                        
                        elements.push(
                          <span key={idx} style={{ color: textColor }}>
                            {blockText}
                          </span>
                        )
                        
                        charIndex = endIndex
                      })
                      
                      return (
                        <pre style={{ 
                          margin: 0, 
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'inherit',
                          fontSize: '0.95rem',
                          lineHeight: '1.6'
                        }}>
                          {elements}
                        </pre>
                      )
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 빈칸 수능문제 출제기 모드
  if (mode === 'csat-cloze') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>빈칸 수능문제 출제기</h1>
          <p>출처/영어원문/한글해석// 형식의 지문을 자동으로 나눕니다.</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!csatClozeData ? (
          <CsatClozeInput
            text={text}
            setText={setText}
            onProcess={handleCsatClozeProcess}
            apiKey={apiKey}
          />
        ) : (
          <div className="result-container">
            <div className="result-actions">
              <button 
                onClick={() => { 
                  setCsatClozeData(null); 
                  setText(''); 
                }} 
                className="btn btn-secondary"
              >
                모두 삭제하고 처음부터
              </button>
              <button 
                onClick={() => {
                  let fullText = csatClozeData.processed || csatClozeData.original
                  navigator.clipboard.writeText(fullText)
                  alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                }} 
                className="btn btn-primary"
              >
                결과 복사하기
              </button>
            </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '800px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {csatClozeData.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>처리된 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '800px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.8'
                    }}>
                      {csatClozeData.processed || csatClozeData.original}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {csatClozeData && csatClozeData.results && csatClozeData.results.length > 0 && (
          <div className="result-container" style={{ marginTop: '20px' }}>
            <div className="csat-cloze-summary" style={{
              padding: '16px 20px',
              borderRadius: '12px',
              background: '#f4f9ff',
              border: '1px solid #d6e9ff',
              color: '#2c3e50',
              fontWeight: 600
            }}>
              총 {csatClozeData.results.length}개의 지문이 분리되었습니다. (지문 당 2페이지 생성 예정)
            </div>
          </div>
        )}
      </div>
    )
  }

  // 복합서술형 모드
  if (mode === 'complex-description') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>복합서술형</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!complexDescriptionData ? (
          <ComplexDescriptionInput
            text={text}
            setText={setText}
            onProcess={handleComplexDescriptionProcess}
            apiKey={apiKey}
          />
        ) : (
          <div className="result-container">
            <div className="result-actions">
              <button 
                onClick={() => { 
                  setComplexDescriptionData(null); 
                  setText(''); 
                }} 
                className="btn btn-secondary"
              >
                모두 삭제하고 처음부터
              </button>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(complexDescriptionData.processed)
                  alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                }} 
                className="btn btn-primary"
              >
                결과 복사하기
              </button>
            </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {complexDescriptionData.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>처리된 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {complexDescriptionData.processed}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Paraphrasing 모드
  if (mode === 'paraphrasing') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Paraphrasing</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!paraphrasingData ? (
          <ParaphrasingInput
            text={text}
            setText={setText}
            onProcess={handleParaphrasingProcess}
            apiKey={apiKey}
          />
        ) : (
          <div className="result-container">
            <div className="result-actions">
              <button 
                onClick={() => { 
                  setParaphrasingData(null); 
                  setText(''); 
                }} 
                className="btn btn-secondary"
              >
                모두 삭제하고 처음부터
              </button>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(paraphrasingData.paraphrased || paraphrasingData.processed)
                  alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                }} 
                className="btn btn-primary"
              >
                결과 복사하기
              </button>
            </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {paraphrasingData.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>처리된 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {paraphrasingData.paraphrased || paraphrasingData.processed}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // SUM15 모드
  if (mode === 'sum15') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>SUM15</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!sum15Data ? (
          <Sum15Input
            text={text}
            setText={setText}
            onProcess={handleSum15Process}
            apiKey={apiKey}
          />
        ) : (
          <div className="result-container">
            {showSum15Design ? (
              // 디자인된 페이지 모드
              <>
                <div className="result-actions">
                  <button 
                    onClick={() => setShowSum15Design(false)} 
                    className="btn btn-secondary"
                  >
                    텍스트 보기로 돌아가기
                  </button>
                  <button 
                    onClick={handleSavePdf}
                    className="btn btn-primary"
                    disabled={isSavingPdf}
                  >
                    {isSavingPdf ? 'PDF 저장 중...' : 'PDF 저장'}
                  </button>
                  <button 
                    onClick={() => { 
                      setSum15Data(null); 
                      setText('');
                      setShowSum15Design(false);
                    }} 
                    className="btn btn-secondary"
                  >
                    모두 삭제하고 처음부터
                  </button>
                </div>
                
                {/* A4 페이지 형식으로 문제 출력 */}
                <Sum15Viewer data={sum15Data} />
              </>
            ) : (
              // 원래 텍스트 결과 모드
              <>
                <div className="result-actions">
                  <button 
                    onClick={() => { 
                      setSum15Data(null); 
                      setText(''); 
                    }} 
                    className="btn btn-secondary"
                  >
                    모두 삭제하고 처음부터
                  </button>
                  <button 
                    onClick={() => {
                      let fullText = sum15Data.summary || sum15Data.processed
                      
                      // HTML 태그 제거 (볼드는 텍스트로 변환)
                      fullText = fullText.replace(/<b>/g, '').replace(/<\/b>/g, '')
                      
                      if (sum15Data.answerSheet) {
                        fullText += '\n\n\n<답지>\n\n' + sum15Data.answerSheet
                      }
                      
                      if (sum15Data.summaryOnly) {
                        fullText += '\n\n\n' + sum15Data.summaryOnly
                      }
                      
                      navigator.clipboard.writeText(fullText)
                      alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                    }} 
                    className="btn btn-primary"
                  >
                    결과 복사하기
                  </button>
                </div>
                
                <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {sum15Data.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>처리된 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <div style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {(() => {
                        let text = sum15Data.summary || sum15Data.processed
                        
                        // HTML 형식의 볼드 처리된 보기 적용
                        if (sum15Data.results) {
                          sum15Data.results.forEach((r) => {
                            if (r.boldedShuffledWords && !r.error) {
                              const oldBold = '<보기>\n' + r.shuffledWords.join(' / ')
                              const newBold = '<보기>\n' + r.boldedShuffledWords.join(' / ')
                              text = text.replace(oldBold, newBold)
                            }
                          })
                        }
                        
                        // 답지 부분 추가
                        let finalText = text
                        if (sum15Data.answerSheet) {
                          finalText += '\n\n\n<답지>\n\n' + sum15Data.answerSheet
                        }
                        
                        return <span dangerouslySetInnerHTML={{ __html: finalText.replace(/\n/g, '<br>') }} />
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 디자인 추가 버튼 */}
              <div style={{ marginTop: '30px', textAlign: 'center', padding: '20px' }}>
                <button 
                  onClick={() => setShowSum15Design(true)}
                  className="btn btn-primary"
                  style={{ 
                    fontSize: '1.1rem', 
                    padding: '12px 30px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)'
                  }}
                >
                  디자인 추가
                </button>
              </div>
            </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // SUM40 모드
  if (mode === 'sum40') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>SUM40</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!sum40Data ? (
          <Sum40Input
            text={text}
            setText={setText}
            onProcess={handleSum40Process}
            apiKey={apiKey}
          />
        ) : (
          <div className="result-container">
            <div className="result-actions">
              <button 
                onClick={() => { 
                  setSum40Data(null)
    setKoreanSummaryData(null); 
                  setText(''); 
                }} 
                className="btn btn-secondary"
              >
                모두 삭제하고 처음부터
              </button>
              <button 
                onClick={() => {
                  let fullText = sum40Data.summary || sum40Data.processed
                  navigator.clipboard.writeText(fullText)
                  alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                }} 
                className="btn btn-primary"
              >
                결과 복사하기
              </button>
            </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {sum40Data.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px', textAlign: 'right' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>처리된 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto',
                    textAlign: 'left'
                  }}>
                    <div style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}
                    dangerouslySetInnerHTML={{ 
                      __html: (sum40Data.summary || sum40Data.processed).replace(/\n/g, '<br>')
                    }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 요약문 한글 모드
  if (mode === 'korean-summary') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>요약문 한글</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!koreanSummaryData ? (
          <KoreanSummaryInput
            text={text}
            setText={setText}
            onProcess={handleKoreanSummaryProcess}
            apiKey={apiKey}
          />
        ) : showKoreanSummaryDesign ? (
          <div className="result-container">
            <div className="result-actions">
              <button 
                onClick={() => setShowKoreanSummaryDesign(false)} 
                className="btn btn-secondary"
              >
                텍스트 모드로 돌아가기
              </button>
              <button 
                onClick={async () => {
                  try {
                    await exportKoreanSummaryToPdf()
                  } catch (error) {
                    alert('PDF 저장 중 오류가 발생했습니다: ' + error.message)
                  }
                }} 
                className="btn btn-primary"
              >
                PDF 저장하기
              </button>
              <button 
                onClick={() => { 
                  setKoreanSummaryData(null); 
                  setKoreanSummaryProcessedText('')
                  setShowKoreanSummaryDesign(false)
                  setText(''); 
                }} 
                className="btn btn-secondary"
              >
                모두 삭제하고 처음부터
              </button>
            </div>
            
            {/* A4 페이지 형식으로 문제 출력 */}
            <KoreanSummaryViewer data={koreanSummaryData} processedText={koreanSummaryProcessedText} />
          </div>
        ) : (
          <div className="result-container">
            <div className="result-actions">
              <button 
                onClick={() => { 
                  setKoreanSummaryData(null); 
                  setKoreanSummaryProcessedText('')
                  setShowKoreanSummaryDesign(false)
                  setText(''); 
                }} 
                className="btn btn-secondary"
              >
                모두 삭제하고 처음부터
              </button>
              <button 
                onClick={() => {
                  let fullText = koreanSummaryProcessedText || koreanSummaryData.summary || koreanSummaryData.processed
                  navigator.clipboard.writeText(fullText)
                  alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                }} 
                className="btn btn-primary"
              >
                결과 복사하기
              </button>
            </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {koreanSummaryData.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px', textAlign: 'right' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>처리된 텍스트 (수정 가능)</h4>
                  <textarea
                    value={koreanSummaryProcessedText}
                    onChange={(e) => setKoreanSummaryProcessedText(e.target.value)}
                    style={{ 
                      width: '100%',
                      minHeight: '400px',
                      padding: '12px', 
                      background: 'white', 
                      borderRadius: '4px',
                      border: '1px solid #e0e0e0',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      textAlign: 'left'
                    }}
                  />
                </div>
              </div>
              
              {/* 디자인 추가 버튼 */}
              <div style={{ marginTop: '30px', textAlign: 'center', padding: '20px' }}>
                <button 
                  onClick={() => setShowKoreanSummaryDesign(true)}
                  className="btn btn-primary"
                  style={{ 
                    fontSize: '1.1rem', 
                    padding: '12px 30px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)'
                  }}
                >
                  디자인 추가
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Third Word 모드
  if (mode === 'third-word') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Third Word</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!thirdWordData ? (
          <ThirdWordInput
            text={text}
            setText={setText}
            onProcess={handleThirdWordProcess}
            apiKey={apiKey}
          />
        ) : (
          <div className="result-container">
            <div className="result-actions">
              <button 
                onClick={() => { 
                  setThirdWordData(null); 
                  setText(''); 
                }} 
                className="btn btn-secondary"
              >
                모두 삭제하고 처음부터
              </button>
              <button 
                onClick={() => {
                  let fullText = thirdWordData.processed || thirdWordData.original
                  navigator.clipboard.writeText(fullText)
                  alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                }} 
                className="btn btn-primary"
              >
                결과 복사하기
              </button>
            </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '800px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {thirdWordData.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>처리된 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '800px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.8'
                    }}>
                      {thirdWordData.processed || thirdWordData.original}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 지칭서술형 모드
  if (mode === 'reference-description') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>지칭서술형(지문 안에서,어형변화무)</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!referenceDescriptionData ? (
          <ReferenceDescriptionInput
            text={text}
            setText={setText}
            onProcess={handleReferenceDescriptionProcess}
            apiKey={apiKey}
          />
        ) : (
          <div className="result-container">
            {showReferenceDescriptionDesign ? (
              // 디자인된 페이지 모드
              <>
                <div className="result-actions">
                  <button 
                    onClick={() => setShowReferenceDescriptionDesign(false)} 
                    className="btn btn-secondary"
                  >
                    텍스트 보기로 돌아가기
                  </button>
                  <button 
                    onClick={async () => {
                      setIsSavingPdf(true)
                      try {
                        await exportReferenceDescriptionToPdf()
                      } catch (error) {
                        alert(error.message || 'PDF 저장 중 오류가 발생했습니다.')
                      } finally {
                        setIsSavingPdf(false)
                      }
                    }}
                    className="btn btn-primary"
                    disabled={isSavingPdf}
                  >
                    {isSavingPdf ? 'PDF 저장 중...' : 'PDF 저장'}
                  </button>
                  <button 
                    onClick={() => { 
                      setReferenceDescriptionData(null); 
                      setReferenceDescriptionProcessedText('');
                      setText('');
                      setShowReferenceDescriptionDesign(false);
                    }} 
                    className="btn btn-secondary"
                  >
                    모두 삭제하고 처음부터
                  </button>
                </div>
                
                {/* A4 페이지 형식으로 문제 출력 */}
                <ReferenceDescriptionViewer data={referenceDescriptionData} />
              </>
            ) : (
              // 원래 텍스트 결과 모드
              <>
                <div className="result-actions">
                  <button 
                    onClick={() => { 
                      setReferenceDescriptionData(null); 
                      setReferenceDescriptionProcessedText('');
                      setText(''); 
                    }} 
                    className="btn btn-secondary"
                  >
                    모두 삭제하고 처음부터
                  </button>
                  <button 
                    onClick={() => {
                      let fullText = referenceDescriptionProcessedText || referenceDescriptionData.processed || referenceDescriptionData.original
                      navigator.clipboard.writeText(fullText)
                      alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                    }} 
                    className="btn btn-primary"
                  >
                    결과 복사하기
                  </button>
                  <button 
                    onClick={() => setShowReferenceDescriptionDesign(true)} 
                    className="btn btn-primary"
                    style={{ marginLeft: '10px' }}
                  >
                    디자인 추가
                  </button>
                </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              
              {/* 문제가 있는 항목이 있는 경우 경고 표시 */}
              {referenceDescriptionData && Array.isArray(referenceDescriptionData) && referenceDescriptionData.some(r => (r.needsManualCheck || (!r.hasUnderline || !r.hasAnswer))) && (
                <div style={{
                  marginBottom: '20px',
                  padding: '15px',
                  backgroundColor: '#fff3cd',
                  border: '2px solid #ffc107',
                  borderRadius: '8px',
                  color: '#856404',
                  fontSize: '14px',
                  lineHeight: '1.6'
                }}>
                  <strong>⚠️ 주의:</strong> 밑줄이 없거나 답이 없는 항목이 있습니다. 처리된 텍스트에서 <strong>[⚠️ 수동 확인 필요]</strong>로 표시된 부분을 찾아 수정해주세요.
                  <ul style={{ marginTop: '10px', marginLeft: '20px', paddingLeft: '0' }}>
                    {referenceDescriptionData.filter(r => (r.needsManualCheck || (!r.hasUnderline || !r.hasAnswer))).map((r, idx) => (
                      <li key={idx} style={{ marginBottom: '5px' }}>
                        지문 {r.index + 1}: {!r.hasUnderline && '밑줄 없음'} {!r.hasUnderline && !r.hasAnswer && ', '} {!r.hasAnswer && '답 없음'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div>
                  <h3 style={{ marginBottom: '10px', color: '#333' }}>원문</h3>
                  <div style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '15px',
                    backgroundColor: '#f9f9f9',
                    maxHeight: '600px',
                    overflowY: 'auto'
                  }}>
                    {Array.isArray(referenceDescriptionData) ? (
                      <div>
                        {referenceDescriptionData.map((result, idx) => (
                          <div key={idx} style={{
                            marginBottom: '20px',
                            padding: '10px',
                            backgroundColor: (result.needsManualCheck || (!result.hasUnderline || !result.hasAnswer)) ? '#fff3cd' : 'transparent',
                            border: (result.needsManualCheck || (!result.hasUnderline || !result.hasAnswer)) ? '2px solid #ffc107' : 'none',
                            borderRadius: '6px'
                          }}>
                            <div style={{ marginBottom: '5px', fontWeight: 'bold', color: '#856404' }}>
                              {result.needsManualCheck || (!result.hasUnderline || !result.hasAnswer) ? '⚠️ ' : ''}지문 {result.index + 1}
                            </div>
                            <pre style={{ 
                              margin: 0, 
                              color: '#2c3e50', 
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'inherit',
                              fontSize: '0.95rem',
                              lineHeight: '1.8'
                            }}>
                              {result.original}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <pre style={{ 
                        margin: 0, 
                        color: '#2c3e50', 
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit',
                        fontSize: '0.95rem',
                        lineHeight: '1.8'
                      }}>
                        {referenceDescriptionData?.original || ''}
                      </pre>
                    )}
                  </div>
                </div>
                <div>
                  <h3 style={{ marginBottom: '10px', color: '#333' }}>처리된 텍스트 (수정 가능)</h3>
                  <textarea
                    value={referenceDescriptionProcessedText || ''}
                    onChange={(e) => setReferenceDescriptionProcessedText(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '600px',
                      padding: '15px',
                      border: '2px solid #ddd',
                      borderRadius: '8px',
                      backgroundColor: '#fff',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.8',
                      resize: 'vertical',
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word'
                    }}
                    placeholder="처리된 텍스트가 여기에 표시됩니다. 수정할 수 있습니다."
                  />
                  <div style={{
                    marginTop: '10px',
                    fontSize: '12px',
                    color: '#666'
                  }}>
                    💡 텍스트를 직접 수정할 수 있습니다. 문제가 있는 부분은 <strong>[⚠️ 수동 확인 필요]</strong>로 표시되어 있습니다.
                  </div>
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // KEY 모드

  if (mode === 'key') {
    return (
      <div className="app">
        <header className="app-header">
          <h1>KEY</h1>
          <p>by 신희진</p>
          <button 
            onClick={handleBackToMain} 
            className="btn btn-secondary" 
            style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
          >
            메인 메뉴로 돌아가기
          </button>
        </header>

        <ApiKeyInput onApiKeySet={handleApiKeySet} />

        {!keyData ? (
          <KeyInput
            text={text}
            setText={setText}
            onProcess={handleKeyProcess}
            apiKey={apiKey}
          />
        ) : (
          <div className="result-container">
            <div className="result-actions">
              <button 
                onClick={() => { 
                  setKeyData(null); 
                  setText(''); 
                }} 
                className="btn btn-secondary"
              >
                모두 삭제하고 처음부터
              </button>
              <button 
                onClick={() => {
                  let fullText = keyData.processed || keyData.original
                  navigator.clipboard.writeText(fullText)
                  alert('처리된 텍스트가 클립보드에 복사되었습니다.')
                }} 
                className="btn btn-primary"
              >
                결과 복사하기
              </button>
            </div>
            <div className="multiple-results">
              <div style={{ marginBottom: '20px', color: '#6c757d' }}>
                처리가 완료되었습니다. 아래 결과를 확인하세요.
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>원본 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {keyData.original}
                    </pre>
                  </div>
                </div>
                <div className="text-box" style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2c3e50', fontWeight: '600' }}>처리된 텍스트</h4>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '500px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      color: '#2c3e50', 
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.95rem',
                      lineHeight: '1.6'
                    }}>
                      {keyData.processed || keyData.original}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 포켓북 만들기 모드
  return (
    <div className="app">
      <header className="app-header">
        <h1>포켓북 만들기</h1>
        <p>by 신희진</p>
        <button 
          onClick={handleBackToMain} 
          className="btn btn-secondary" 
          style={{ marginTop: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
        >
          메인 메뉴로 돌아가기
        </button>
      </header>

      <ApiKeyInput onApiKeySet={handleApiKeySet} />

      {!organizedData && !parsedTexts ? (
        <>
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <button
              onClick={() => setShowSourceLoader(true)}
              className="btn btn-secondary"
              style={{ padding: '10px 20px', fontSize: '0.95rem' }}
            >
              📚 저장된 출처 불러오기
            </button>
          </div>
          <TextInput 
            text={text} 
            setText={setText} 
            onDivide={handleDivide}
            apiKey={apiKey}
          />
        </>
      ) : !organizedData && parsedTexts ? (
        <div className="result-container">
          <div className="result-actions">
            <button onClick={() => {
              // 다시 나누기를 할 때도 모든 상태 초기화
              setOrganizedData(null)
              setParsedTexts(null)
              setPocketbookTextId(null)
              setSelectedTexts(new Set())
              setIsAnalyzing(false)
              setAnalyzingProgress({ current: 0, total: 0 })
              setSourcePopup(null)
              setCurrentSourceInfo(null)
              setSaveStatus({ saved: 0, failed: 0, total: 0 })
            }} className="btn btn-secondary">
              다시 나누기
            </button>
            <button onClick={startPocketbook} className="btn btn-primary" disabled={isAnalyzing}>
              {isAnalyzing 
                ? `분석 중... (${analyzingProgress.current}/${analyzingProgress.total})` 
                : '포켓북 제작하기 start'}
            </button>
          </div>
          <div className="multiple-results">
            <div style={{ marginBottom: '10px', color: '#6c757d' }}>
              총 {parsedTexts.length}개의 지문이 나뉘었습니다.
            </div>
            {parsedTexts.map((item, idx) => (
              <div key={idx} className="result-item">
                <div className="result-item-title">{item.title || `지문 ${idx + 1}`}</div>
                {/* 제목 아래에 영어/한글 본문을 각 칸에 표시 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px'
                }}>
                  <div className="text-box" style={{ padding: '12px', background: '#f8f9fa' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#2c3e50' }}>영어 본문</h4>
                    <p style={{ margin: 0, color: '#2c3e50', whiteSpace: 'pre-wrap' }}>
                      {(item.english || '').trim()}
                    </p>
                  </div>
                  <div className="text-box" style={{ padding: '12px', background: '#f8f9fa' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#2c3e50' }}>한글 본문</h4>
                    <p style={{ margin: 0, color: '#2c3e50', whiteSpace: 'pre-wrap' }}>
                      {(item.korean || '').trim()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="result-container">
          <div className="result-actions" style={{ marginBottom: '20px' }}>
            <button onClick={handleReset} className="btn btn-secondary">
              새로 만들기
            </button>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                onClick={() => {
                  if (selectedTexts.size === organizedData.length) {
                    setSelectedTexts(new Set());
                  } else {
                    setSelectedTexts(new Set(organizedData.map((_, i) => i)));
                  }
                }}
                className="btn btn-secondary"
                style={{ fontSize: '0.9rem', padding: '8px 16px' }}
              >
                {selectedTexts.size === organizedData.length ? '전체 해제' : '전체 선택'}
              </button>
              <span style={{ color: '#6c757d', fontSize: '0.9rem' }}>
                선택: {selectedTexts.size} / {organizedData.length}
              </span>
            </div>
            <button 
              onClick={handleSavePdf} 
              className="btn btn-primary" 
              disabled={isSavingPdf || selectedTexts.size === 0}
            >
              {isSavingPdf ? 'PDF 저장 중...' : `PDF 저장 (${selectedTexts.size * 2}페이지)`}
            </button>
            <button 
              onClick={async () => {
                if (!pocketbookTextId) {
                  alert('저장할 세션 정보가 없습니다. 다시 분석해주세요.')
                  return
                }
                const confirmed = confirm(`선택한 ${selectedTexts.size}개 지문을 Firebase에 저장하시겠습니까?`)
                if (!confirmed) return
                
                let saved = 0
                let failed = 0
                
                for (const idx of selectedTexts) {
                  const item = organizedData[idx]
                  try {
                    await saveTextResult('pocketbook', pocketbookTextId, idx, {
                      title: item.title,
                      korean: item.korean,
                      english: item.english,
                      analyzed: item.analyzed,
                      index: idx,
                      questionNumber: item.questionNumber || null,
                      sourceInfo: currentSourceInfo,
                    })
                    saved++
                  } catch (error) {
                    console.error(`지문 ${idx + 1} 저장 실패:`, error)
                    failed++
                  }
                }
                
                if (failed === 0) {
                  alert(`✅ 모든 지문이 저장되었습니다! (${saved}개)`)
                } else {
                  alert(`⚠️ 저장 완료\n성공: ${saved}개, 실패: ${failed}개`)
                }
              }}
              className="btn btn-secondary"
              disabled={selectedTexts.size === 0}
            >
              💾 선택한 지문 다시 저장
            </button>
            <button onClick={() => window.print()} className="btn btn-primary">
              인쇄하기
            </button>
          </div>
          {/* 지문별로 2페이지 세트 렌더 */}
          <div className="multiple-results">
            {organizedData.map((item, idx) => {
              const isSelected = selectedTexts.has(idx);
              return (
                <div key={idx} className="result-item" style={{ 
                  opacity: isSelected ? 1 : 0.6,
                  border: isSelected ? '2px solid #2563eb' : '1px solid #e0e0e0',
                  borderRadius: '8px',
                  padding: '16px',
                  transition: 'all 0.2s',
                  background: isSelected ? '#ffffff' : '#f8f9fa'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: isSelected ? '12px' : '0' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const newSelected = new Set(selectedTexts);
                        if (e.target.checked) {
                          newSelected.add(idx);
                        } else {
                          newSelected.delete(idx);
                        }
                        setSelectedTexts(newSelected);
                      }}
                      style={{
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                        accentColor: '#2563eb',
                        flexShrink: 0
                      }}
                    />
                    <div className="result-item-title" style={{ 
                      margin: 0,
                      flex: 1,
                      fontWeight: isSelected ? '600' : '500',
                      fontSize: '1.1rem',
                      color: isSelected ? '#1f2937' : '#6b7280'
                    }}>
                      {item.title || `지문 ${idx + 1}`}
                    </div>
                  </div>
                  {isSelected && (
                    <div style={{ marginTop: '12px' }}>
                      <TextOrganizer
                        data={item.analyzed}
                        originalText={item.english}
                        originalKorean={item.korean}
                        title={item.title}
                        pageIndex={idx}
                        apiKey={apiKey}
                        onSavePdf={handleSavePdf}
                      />
                    </div>
                  )}
                  {!isSelected && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '12px', 
                      background: '#f3f4f6', 
                      borderRadius: '6px',
                      color: '#6b7280',
                      fontSize: '0.9rem'
                    }}>
                      체크박스를 선택하면 지문 내용이 표시됩니다.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 출처 입력 팝업 */}
      {sourcePopup && sourcePopup.visible && (
        <SourceInputPopup
          sourceInfo={sourcePopup.sourceInfo}
          onConfirm={handleSourceConfirm}
          onCancel={() => setSourcePopup(null)}
        />
      )}

      {/* 저장된 출처 불러오기 팝업 */}
      {showSourceLoader && (
        <SourceLoader
          featureType="pocketbook"
          onLoad={(loadedData) => {
            setOrganizedData(loadedData);
            setShowSourceLoader(false);
            setSelectedTexts(new Set(Array.from({length: loadedData.length}, (_, i) => i)));
          }}
          onClose={() => setShowSourceLoader(false)}
        />
      )}
    </div>
  )
}

export default App

