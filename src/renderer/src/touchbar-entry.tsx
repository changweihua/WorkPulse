import { createRoot } from 'react-dom/client';
import TouchBar from './components/TouchBar';
import './touchbar-only.css';

const container = document.getElementById('touchbar-root');
if (container) {
  createRoot(container).render(<TouchBar />);
}
