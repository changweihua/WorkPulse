import React from 'react';
import ReactDOM from 'react-dom/client';
import { RadialMenu } from './components/RadialMenu';
import './radial-only.css'; // Minimal styles for the radial widget
import './floating-liquid-glass.css'; // 悬浮窗液态玻璃饰面（径向 + Touch Bar 共用）

ReactDOM.createRoot(document.getElementById('radial-root')!).render(
  <React.StrictMode>
    <RadialMenu />
  </React.StrictMode>,
);
