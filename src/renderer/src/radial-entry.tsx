import React from 'react'
import ReactDOM from 'react-dom/client'
import { RadialMenu } from './components/RadialMenu'
import './radial-only.css' // Minimal styles for the radial widget

ReactDOM.createRoot(document.getElementById('radial-root')!).render(
  <React.StrictMode>
    <RadialMenu />
  </React.StrictMode>
)
