import { createRoot } from 'react-dom/client';
import TouchBar from './components/TouchBar';
import './touchbar-only.css';
import './floating-liquid-glass.css'; // 悬浮窗液态玻璃饰面（径向 + Touch Bar 共用）

const container = document.getElementById('touchbar-root');
if (container) {
  createRoot(container).render(<TouchBar />);
}
