import React from 'react'
import ReactDOM from 'react-dom/client'
import { RadialMenu } from './components/RadialMenu'
import './index.css' // Reuse existing styles

ReactDOM.createRoot(document.getElementById('radial-root')!).render(
  <React.StrictMode>
    <RadialMenu />
  </React.StrictMode>
)
