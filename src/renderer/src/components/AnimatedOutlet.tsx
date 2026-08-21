import { useRef, useLayoutEffect, useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

export default function AnimatedOutlet(): ReactNode {
  const location = useLocation()
  const [displayPath, setDisplayPath] = useState(location.pathname)
  const [key, setKey] = useState(0)
  const prevPath = useRef(location.pathname)

  useLayoutEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname
      setDisplayPath(location.pathname)
      setKey((k) => k + 1)
    }
  }, [location.pathname])

  return (
    <div key={key} className="h-full route-transition">
      <Outlet />
    </div>
  )
}
