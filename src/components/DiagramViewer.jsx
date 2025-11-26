import './DiagramViewer.css'

function DiagramViewer({ content, isEnglish = false }) {
  // 텍스트를 파싱하여 계층 구조 추출
  const parseDiagram = (text) => {
    if (!text) return []
    
    const lines = text.split('\n').filter(line => line.trim())
    const structure = []
    let currentLevel = 0
    const stack = []
    
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) return
      
      // 들여쓰기 레벨 계산 (탭 또는 공백)
      const indent = line.match(/^(\s*)/)[1]
      const level = Math.floor(indent.length / 2) // 2칸 = 1레벨
      
      const item = {
        id: index,
        text: trimmed.replace(/^[-•*]\s*/, ''), // 불릿 제거
        level: level,
        children: []
      }
      
      // 스택을 사용하여 부모 찾기
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }
      
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(item)
      } else {
        structure.push(item)
      }
      
      stack.push(item)
    })
    
    return structure.length > 0 ? structure : [{ id: 0, text: content, level: 0, children: [] }]
  }

  const diagramData = parseDiagram(content)

  const renderBox = (item, isRoot = false) => {
    return (
      <div key={item.id} className={`diagram-box-item ${isRoot ? 'root-box' : ''}`}>
        <div className="diagram-box-content">
          {item.text}
        </div>
        {item.children.length > 0 && (
          <div className="diagram-children">
            {item.children.map((child) => (
              <div key={child.id} className="diagram-child-wrapper">
                {renderBox(child)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (diagramData.length === 0) {
    return (
      <div className="diagram-container">
        <pre className="diagram-fallback">{content}</pre>
      </div>
    )
  }

  return (
    <div className="diagram-container">
      {diagramData.map((item, idx) => (
        <div key={item.id} className="diagram-root">
          {renderBox(item, true)}
          {idx < diagramData.length - 1 && <div className="diagram-separator"></div>}
        </div>
      ))}
    </div>
  )
}

export default DiagramViewer

