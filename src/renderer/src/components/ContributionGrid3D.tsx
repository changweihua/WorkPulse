import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, ContactShadows } from '@react-three/drei'
import { Color, Object3D, InstancedMesh, MeshPhysicalMaterial } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useI18n } from '../stores/languageStore'

interface DailyStats {
  date: string
  log_count: number
  task_completed: number
}

const SPACING = 1.2
const CELL = 0.92
const MAX_HEIGHT = 6.5
const DURATION = 0.9
const STAGGER = 0.02

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function colorForCell(count: number, normalizedPosition: number, isDark: boolean): string {
  if (count === 0) return isDark ? '#1c1c2e' : '#e8e8ed'
  if (normalizedPosition < 0.12) return isDark ? '#5a5a6a' : '#b8b8c0'
  if (normalizedPosition < 0.28) return '#d4a0c8'
  if (normalizedPosition < 0.42) return '#ecd860'
  if (normalizedPosition < 0.62) return '#3cc060'
  if (normalizedPosition < 0.78) return '#ecd860'
  return isDark ? '#5a5a6a' : '#b8b8c0'
}

interface Cell {
  x: number
  z: number
  targetHeight: number
  color: Color
  delay: number
  count: number
  date: string
}

function Grid({
  cells,
  isDark
}: {
  cells: Cell[]
  isDark: boolean
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const [hovered, setHovered] = useState<number | null>(null)
  const startRef = useRef(0)
  const settledRef = useRef(false)
  const { t } = useI18n()

  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 4, 0.12), [])
  const material = useMemo(
    () =>
      new MeshPhysicalMaterial({
        roughness: 0.32,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.2
      }),
    []
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    cells.forEach((cell, i) => mesh.setColorAt(i, cell.color))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [cells])

  // 数据/主题变化时重新播放生长动画（自管理时间线，不依赖已弃用的 THREE.Clock）
  useEffect(() => {
    startRef.current = performance.now()
    settledRef.current = false
  }, [cells])

  // 悬停指针
  useEffect(() => {
    document.body.style.cursor = hovered !== null ? 'pointer' : 'auto'
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [hovered])

  const totalTime = useMemo(
    () => cells.reduce((m, c) => Math.max(m, c.delay), 0) + DURATION,
    [cells]
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || settledRef.current || cells.length === 0) return
    const t = (performance.now() - startRef.current) / 1000
    let allDone = true
    cells.forEach((cell, i) => {
      const local = Math.min(Math.max((t - cell.delay) / DURATION, 0), 1)
      if (local < 1) allDone = false
      const eased = 1 - Math.pow(1 - local, 3)
      const h = Math.max(cell.targetHeight * eased, 0.001)
      dummy.position.set(cell.x, h / 2, cell.z)
      dummy.scale.set(CELL, h, CELL)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (allDone && t >= totalTime) settledRef.current = true
  })

  const hoverCell = hovered !== null ? cells[hovered] : null

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, cells.length]}
        onPointerMove={(e) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) setHovered(e.instanceId)
        }}
        onPointerOut={() => setHovered(null)}
      />
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.35}
        scale={Math.max(cells.length / 7, 7) * SPACING * 2.5}
        blur={2.5}
        far={12}
        color={isDark ? '#000000' : '#1f2937'}
      />
      {hoverCell && (
        <Html position={[hoverCell.x, hoverCell.targetHeight + 0.7, hoverCell.z]} center>
          <div
            style={{
              background: isDark ? 'rgba(20,20,30,0.95)' : 'rgba(255,255,255,0.95)',
              color: isDark ? '#e5e7eb' : '#111827',
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 12,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              pointerEvents: 'none'
            }}
          >
            <div style={{ fontWeight: 600 }}>{hoverCell.date}</div>
            <div>{t('stats.activities', { count: hoverCell.count })}</div>
          </div>
        </Html>
      )}
    </>
  )
}

export default function ContributionGrid3D({ data }: { data: DailyStats[] }) {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    return () => obs.disconnect()
  }, [])

  const { cells, cols } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dataMap = new Map(data.map((d) => [d.date, d.log_count + d.task_completed]))

    const startDay = new Date(today)
    startDay.setDate(startDay.getDate() - 83)
    startDay.setDate(startDay.getDate() - startDay.getDay())

    const days: { date: Date; count: number }[] = []
    for (let d = new Date(startDay); d <= today; d.setDate(d.getDate() + 1)) {
      const ds = formatLocalDate(d)
      days.push({ date: new Date(d), count: dataMap.get(ds) || 0 })
    }

    const colCount = Math.max(1, Math.ceil(days.length / 7))
    const maxCount = Math.max(1, ...days.map((d) => d.count))
    const total = Math.max(1, days.length - 1)

    const built: Cell[] = days.map((day, i) => {
      const col = Math.floor(i / 7)
      const row = i % 7
      const count = day.count
      const normalizedPosition = i / total
      const targetHeight =
        count === 0 ? 0.12 : 0.35 + Math.pow(count / maxCount, 0.6) * MAX_HEIGHT
      return {
        x: (col - (colCount - 1) / 2) * SPACING,
        z: (row - 3) * SPACING,
        targetHeight,
        color: new Color(colorForCell(count, normalizedPosition, isDark)),
        delay: (col + row) * STAGGER,
        count,
        date: formatLocalDate(day.date)
      }
    })

    return { cells: built, cols: colCount }
  }, [data, isDark])

  // fov 28（低畸变近轴测视角）相比默认 75 需要约 3 倍距离才能容纳相同宽度
  const camDist = Math.max(cols, 7) * SPACING * 3.4

  return (
    <div className="h-[480px] w-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
        style={{ background: 'transparent' }}
        camera={{
          position: [camDist * 0.95, camDist * 1.2, camDist * 0.95],
          fov: 28,
          zoom: 3.5,
          near: 0.1,
          far: 2000
        }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 14, 5]} intensity={1.2} />
        <directionalLight position={[-6, 6, -4]} intensity={0.4} />
        <Grid cells={cells} isDark={isDark} />
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enablePan
          enableZoom
          enableRotate
          minZoom={0.15}
          maxZoom={8}
          minPolarAngle={Math.PI / 8}
          maxPolarAngle={Math.PI / 2.1}
          minAzimuthAngle={-Math.PI / 3}
          maxAzimuthAngle={Math.PI / 3}
          zoomSpeed={1.2}
          rotateSpeed={0.5}
        />
      </Canvas>
    </div>
  )
}
