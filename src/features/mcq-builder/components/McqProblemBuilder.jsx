import { useState, useCallback } from 'react';
import { generateKeyQuestion, generateKeyExplanation } from '../../key/utils/keyAnalyzer';
import { generateClozeQuestion, generateClozeExplanation } from '../../csat-cloze/utils/csatClozeAnalyzer';
import { generateThirdWordSummary } from '../../third-word/utils/thirdWordAnalyzer';
import './McqProblemBuilder.css';

const NUMBER_SYMBOLS = ['①', '②', '③', '④', '⑤'];

const MODES = [
  { id: 'key', label: '🔑 KEY' },
  { id: 'csat-cloze', label: '📝 수능형 빈칸' },
  { id: 'third-word', label: '🔤 3rd Word' },
];

function parseEnglishFromBlock(block, index) {
  const parts = block.split('/').map((p) => p.trim());
  let source = '';
  let englishText = '';

  if (parts.length >= 3) {
    source = parts[0];
    englishText = parts[1];
  } else if (parts.length >= 2) {
    source = parts[0];
    englishText = parts[1];
  } else {
    source = `지문 ${index + 1}`;
    englishText = block;
  }

  englishText = englishText.replace(/\/해석[\s\S]*$/g, '').trim();
  englishText = englishText.replace(/\/해석[^\n]*/g, '').trim();

  const lines = englishText.split('\n');
  const englishLines = lines
    .map((line) => {
      const koreanMatch = line.match(/[가-힣]+/);
      if (koreanMatch) return line.substring(0, koreanMatch.index).trim();
      return line.trim();
    })
    .filter((line) => {
      if (!line || line.length === 0) return false;
      return (line.match(/[a-zA-Z]/g) || []).length >= 3;
    });

  englishText = englishLines.join('\n').trim();

  const englishCharCount = (englishText.match(/[a-zA-Z]/g) || []).length;
  if (!englishText || englishCharCount < 10) {
    throw new Error(`지문 ${index + 1}: 영어원문이 없거나 한글해석만 입력되었습니다.`);
  }

  return { source: source.trim(), englishText: englishText.trim() };
}

function fisherYatesShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractEnglishWords(text) {
  return text
    .replace(/[^a-zA-Z0-9\s'\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
}

function chunkWords(words) {
  const totalWords = words.length;
  const chunkCount = 5;
  const baseSize = Math.floor(totalWords / chunkCount);
  const remainder = totalWords % chunkCount;
  const chunks = [];
  let idx = 0;
  for (let i = 0; i < chunkCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    chunks.push(words.slice(idx, idx + size));
    idx += size;
  }
  return chunks;
}

async function processKey(englishText, apiKey) {
  const questionData = await generateKeyQuestion(englishText, apiKey);

  const shuffledOptions = [...questionData.options];
  const correctAnswerText = shuffledOptions[questionData.correctAnswerIndex];
  const shuffled = fisherYatesShuffle(shuffledOptions);
  const correctIdx = shuffled.findIndex((opt) => opt === correctAnswerText);
  const correctNum = correctIdx + 1;

  const explanation = await generateKeyExplanation(shuffled, correctNum, englishText, apiKey);

  const numberSymbols = ['①', '②', '③', '④', '⑤'];
  let cleanExplanation = explanation;
  shuffled.forEach((opt, idx) => {
    const wrongNumberPattern = new RegExp(
      `${numberSymbols[idx]}[^:：]*[:：]?\\s*${opt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'g'
    );
    cleanExplanation = cleanExplanation.replace(wrongNumberPattern, `${numberSymbols[idx]} ${opt}`);
  });

  let formatted = `[지문]\n${englishText}\n\n`;
  formatted += `[문제]\n${questionData.instruction}\n\n`;
  formatted += `[보기]\n`;
  shuffled.forEach((opt, idx) => {
    formatted += `${numberSymbols[idx]} ${opt}\n`;
  });
  formatted += `\n[정답] ${numberSymbols[correctIdx]}\n\n`;
  formatted += `[해설]\n${cleanExplanation}\n\n`;

  return formatted;
}

async function processCloze(englishText, apiKey) {
  const questionData = await generateClozeQuestion(englishText, apiKey);

  const shuffledOptions = [...questionData.options];
  const correctAnswerText = shuffledOptions[questionData.correctAnswerIndex];
  const shuffled = fisherYatesShuffle(shuffledOptions);
  const correctIdx = shuffled.findIndex((opt) => opt === correctAnswerText);
  const correctNum = correctIdx + 1;

  const explanation = await generateClozeExplanation(
    shuffled,
    correctNum,
    questionData.passageWithBlank,
    englishText,
    apiKey
  );

  let formatted = `[지문]\n${englishText}\n\n`;
  formatted += `[빈칸 지문]\n${questionData.passageWithBlank}\n\n`;
  formatted += `[보기]\n`;
  shuffled.forEach((opt, idx) => {
    formatted += `${NUMBER_SYMBOLS[idx]} ${opt}\n`;
  });
  formatted += `\n[정답] ${NUMBER_SYMBOLS[correctIdx]}\n\n`;
  formatted += `[해설]\n${explanation}\n\n`;

  return formatted;
}

async function processThirdWord(englishText, apiKey) {
  const summaryData = await generateThirdWordSummary(englishText, apiKey);
  let summarySentence = summaryData.summary?.trim() || '';
  const words = extractEnglishWords(summarySentence);
  const finalSummaryText = words.join(' ');
  const chunks = chunkWords(words);
  const chunkStrings = chunks.map((c) => c.join(' '));
  const thirdChunkIndex = Math.min(2, chunkStrings.length - 1);
  const thirdChunk = chunkStrings[thirdChunkIndex];
  const shuffledChunks = fisherYatesShuffle(chunkStrings);
  const correctOptionIndex = shuffledChunks.findIndex((c) => c === thirdChunk);
  const correctSymbol = NUMBER_SYMBOLS[correctOptionIndex];

  let formatted = `[지문]\n${englishText}\n\n`;
  formatted += `[문제]\n요약문 중 세번째로 오는 부분은 몇 번인가?\n\n`;
  formatted += `[보기]\n`;
  shuffledChunks.forEach((opt, idx) => {
    formatted += `${NUMBER_SYMBOLS[idx]} ${opt}\n`;
  });
  formatted += `\n[정답] ${correctSymbol} (${thirdChunk})\n\n`;
  formatted += `[요약] ${finalSummaryText}\n\n`;

  return formatted;
}

function McqProblemBuilder({ apiKey }) {
  const [text, setText] = useState('');
  const [selectedMode, setSelectedMode] = useState('key');
  const [results, setResults] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');

  const handleProcess = useCallback(async () => {
    if (!text || !text.trim()) {
      alert('지문을 입력해주세요.');
      return;
    }
    if (!apiKey) {
      alert('API 키를 먼저 설정해주세요.');
      return;
    }

    setIsProcessing(true);
    setError('');

    const modeLabel = MODES.find((m) => m.id === selectedMode)?.label || selectedMode;

    try {
      const textBlocks = text
        .split('//')
        .map((b) => b.trim())
        .filter((b) => b.length > 0);

      if (textBlocks.length === 0) {
        throw new Error('지문을 입력해주세요.');
      }

      const allFormatted = [];

      for (let i = 0; i < textBlocks.length; i++) {
        setProcessingStatus(`${modeLabel} — 지문 ${i + 1}/${textBlocks.length} 처리 중...`);
        const { source, englishText } = parseEnglishFromBlock(textBlocks[i], i);

        try {
          let formatted = '';
          if (selectedMode === 'key') {
            formatted = await processKey(englishText, apiKey);
          } else if (selectedMode === 'csat-cloze') {
            formatted = await processCloze(englishText, apiKey);
          } else if (selectedMode === 'third-word') {
            formatted = await processThirdWord(englishText, apiKey);
          }
          allFormatted.push(`── ${source} ──\n${formatted}`);
        } catch (err) {
          allFormatted.push(`── ${source} ──\n[오류: ${err.message}]\n\n`);
        }
      }

      const resultText = allFormatted.join('\n');
      setResults((prev) => ({ ...prev, [selectedMode]: resultText }));
    } catch (err) {
      setError(err.message || '처리 중 오류가 발생했습니다.');
      alert(err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [text, apiKey, selectedMode]);

  const currentResult = results[selectedMode] || '';

  return (
    <div className="mcq-builder">
      <div className="mcq-builder-top">
        <div className="mcq-builder-input-area">
          <label htmlFor="mcq-input">지문 입력</label>
          <textarea
            id="mcq-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`출처/영어원문/한글해석//\n출처2/영어원문2/한글해석2//\n\n(한글해석은 생략 가능)`}
            disabled={isProcessing}
          />
          <small>형식: 출처/영어원문/한글해석// (여러 지문 가능, 한글해석은 생략 가능)</small>
        </div>

        <div className="mcq-builder-mode-area">
          <label>문제 유형</label>
          <div className="mcq-mode-tabs">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`mcq-mode-tab ${selectedMode === m.id ? 'mcq-mode-tab-active' : ''}`}
                onClick={() => setSelectedMode(m.id)}
                disabled={isProcessing}
              >
                {m.label}
                {results[m.id] && <span className="mcq-mode-done">✓</span>}
              </button>
            ))}
          </div>

          <div className="mcq-mode-desc">
            {selectedMode === 'key' && '지문의 핵심 키워드를 찾는 5지선다 문제를 생성합니다.'}
            {selectedMode === 'csat-cloze' && '수능형 빈칸 추론 5지선다 문제를 생성합니다.'}
            {selectedMode === 'third-word' && '요약문의 세 번째 청크를 찾는 문제를 생성합니다.'}
          </div>

          <div className="mcq-action-buttons">
            <button
              type="button"
              className="mcq-btn mcq-btn-process"
              onClick={handleProcess}
              disabled={isProcessing || !text.trim()}
            >
              {isProcessing ? processingStatus || '처리 중...' : '생성하기'}
            </button>
            <button
              type="button"
              className="mcq-btn mcq-btn-reset"
              onClick={() => {
                setText('');
                setResults({});
                setError('');
              }}
              disabled={isProcessing}
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mcq-error">{error}</div>}

      {currentResult && (
        <div className="mcq-builder-result">
          <div className="mcq-result-header">
            <h3>{MODES.find((m) => m.id === selectedMode)?.label} 결과</h3>
            <button
              type="button"
              className="mcq-btn mcq-btn-copy"
              onClick={() => {
                navigator.clipboard.writeText(currentResult);
                alert('결과가 클립보드에 복사되었습니다.');
              }}
            >
              📋 복사
            </button>
          </div>
          <pre className="mcq-result-text">{currentResult}</pre>
        </div>
      )}
    </div>
  );
}

export default McqProblemBuilder;
