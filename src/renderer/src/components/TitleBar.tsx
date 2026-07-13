import { useState } from 'react'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  const handleMinimize = () => {
    ;(window.api as any).window.minimize()
  }

  const handleMaximize = () => {
    ;(window.api as any).window.maximize()
    setIsMaximized(!isMaximized)
  }

  const handleClose = () => {
    ;(window.api as any).window.close()
  }

  return (
    <div
      style={
        {
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          backgroundColor: 'rgba(24, 24, 27, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitAppRegion: 'drag',
          flexShrink: 0,
          userSelect: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        } as React.CSSProperties
      }
    >
      <div
        style={{
          display: 'flex',
          gap: '8px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <button
          onClick={handleClose}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#ff5f57',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label="Close"
        />
        <button
          onClick={handleMinimize}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#ffbd2e',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label="Minimize"
        />
        <button
          onClick={handleMaximize}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#28c840',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label="Maximize"
        />
      </div>

      <span
        style={{
          flex: 1,
          textAlign: 'center',
          fontSize: '13px',
          color: 'rgba(255,255,255,0.7)',
          fontWeight: 500,
          letterSpacing: '0.3px',
        }}
      >
        WorkPulse
      </span>

      <div style={{ width: '56px' }} />
    </div>
  )
}