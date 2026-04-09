import { useState } from 'react';
import { runPeonaOnDoubleSlashInput } from '../utils/peonaGenerator';
import './PeonaInput.css';

function PeonaInput({ text, setText, onProcess, apiKey, geminiApiKey = '' }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!text || !text.trim()) {
      setError('지문을 입력해주세요.');
      return;
    }
    const hasOpenAi = apiKey && apiKey.trim()
    const hasGemini = geminiApiKey && geminiApiKey.trim()
    if (!hasOpenAi && !hasGemini) {
      setError('OpenAI 또는 Gemini API 키를 먼저 설정해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const finalResult = await runPeonaOnDoubleSlashInput(text, apiKey, {
        geminiApiKey: hasGemini ? geminiApiKey.trim() : '',
      });
      onProcess(finalResult);
    } catch (err) {
      setError(err.message || '처리 중 오류가 발생했습니다.');
      alert(err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="peona-input-container">
      <form onSubmit={handleSubmit} className="input-form">
        <div className="form-section">
          <label htmlFor="peona-text">지문 입력 *</label>
          <textarea
            id="peona-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`출처/영어/한글//

출처2/영어2/한글2//

(전처리 후 이어하기 시 출처\\n/\\n영어 형태도 됩니다)`}
            rows="12"
            required
            disabled={isLoading}
          />
          <small>
            형식: 출처/영어/한글// 로 지문 구분. 전처리 통합 이어하기(출처\\n/\\n영어)도 동일하게 인식합니다. 출력: 출처 / 영어 전체 한 블록(다수 [정답/오답]) / 한글(입력 그대로) // — 문장마다 1,2,3… 으로 쪼개지 않습니다.
          </small>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="button-group">
          <button
            type="button"
            onClick={() => {
              setText('');
              setError('');
            }}
            className="btn btn-reset"
            disabled={isLoading}
          >
            입력 초기화
          </button>
          <button type="submit" className="btn btn-submit" disabled={isLoading}>
            {isLoading ? '생성 중...' : '피어나 생성'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PeonaInput;
