/* eslint-disable react/no-unknown-property */
import * as THREE from 'three'
import { useRef, useMemo, memo, Suspense, type ReactNode } from 'react'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import {
  useFBO,
  useGLTF,
  Image,
  Scroll,
  Preload,
  ScrollControls,
  MeshTransmissionMaterial
} from '@react-three/drei'
import { easing } from 'maath'

/* ───────────────────────────────────────────────────────────────
 *  Types
 * ─────────────────────────────────────────────────────────────── */

type Mode = 'lens' | 'bar' | 'cube'

interface NavItem {
  label: string
  link: string
}

type ModeProps = Record<string, unknown>

export interface FluidGlassProps {
  /** Glass shape mode — 'lens' (cylinder), 'cube', or 'bar' (fixed bottom bar) */
  mode?: Mode
  lensProps?: ModeProps
  barProps?: ModeProps
  cubeProps?: ModeProps
  backgroundColor?: string
  textColor?: string
  children?: ReactNode
  className?: string
  style?: React.CSSProperties
}

/* ───────────────────────────────────────────────────────────────
 *  Constants
 * ─────────────────────────────────────────────────────────────── */

const IMAGE_URLS = [
  'https://images.unsplash.com/photo-1783394327207-acf441e37dda?w=900&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1782977389500-dd7adad33ebe?w=900&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1782094002386-7d9ae1f49f50?w=900&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1781242629922-6f39cc3671cd?w=900&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1779684474703-5c0519bcf7e8?w=900&auto=format&fit=crop&q=60'
]

const GLB_PATHS: Record<Mode, string> = {
  lens: '/assets/3d/lens.glb',
  cube: '/assets/3d/cube.glb',
  bar: '/assets/3d/bar.glb'
}

const GLASS_MATERIAL_PROPS = {
  backside: true,
  samples: 6,
  resolution: 256,
  transmission: 1,
  roughness: 0.0,
  thickness: 0.5,
  ior: 1.5,
  chromaticAberration: 0.06,
  anisotropy: 0.1,
  distortion: 0.0,
  distortionScale: 0.2,
  temporalDistortion: 0.1,
  clearcoat: 1,
  attenuationDistance: 0.5,
  attenuationColor: '#ffffff',
  color: '#ffffff'
} as const

/* ───────────────────────────────────────────────────────────────
 *  Helpers
 * ─────────────────────────────────────────────────────────────── */

/** Extract the first mesh geometry from a GLB scene */
function extractGeometry(scene: THREE.Group): THREE.BufferGeometry | null {
  let found: THREE.BufferGeometry | null = null
  scene.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) {
      found = child.geometry.clone()
    }
  })
  return found
}

/* ───────────────────────────────────────────────────────────────
 *  Content — scrollable image grid (rendered to FBO)
 * ─────────────────────────────────────────────────────────────── */

function Content() {
  return (
    <group position={[0, 0, 0]}>
      {IMAGE_URLS.map((url, i) => {
        const row = Math.floor(i / 2)
        const col = i % 2
        const x = (col - 0.5) * 3.2
        const y = -row * 4.2
        return (
          <Image
            key={url}
            url={url}
            position={[x, y, i * 0.3]}
            scale={2.8}
          />
        )
      })}
    </group>
  )
}

/* ───────────────────────────────────────────────────────────────
 *  GlassMesh — GLB geometry + MeshTransmissionMaterial
 * ─────────────────────────────────────────────────────────────── */

/** Fallback geometry when GLB is still loading or unavailable */
function GlassFallbackGeometry({ mode }: { mode: Mode }) {
  if (mode === 'lens') return <cylinderGeometry args={[1.2, 1.2, 0.5, 64]} />
  if (mode === 'cube') return <boxGeometry args={[2, 2, 2]} />
  return <boxGeometry args={[8, 0.8, 0.3]} />
}

/**
 * Inner component that loads all three GLBs, extracts geometry for the active
 * mode, and renders a mesh with MeshTransmissionMaterial.
 *
 * Wrapped in Suspense by the parent so fallback geometry is shown during loading.
 */
function GlassGLBInner({ mode }: { mode: Mode }) {
  const lensGltf = useGLTF(GLB_PATHS.lens)
  const cubeGltf = useGLTF(GLB_PATHS.cube)
  const barGltf = useGLTF(GLB_PATHS.bar)

  const geometries = useMemo(
    () => ({
      lens: extractGeometry(lensGltf.scene),
      cube: extractGeometry(cubeGltf.scene),
      bar: extractGeometry(barGltf.scene)
    }),
    [lensGltf.scene, cubeGltf.scene, barGltf.scene]
  )

  const geometry = geometries[mode]

  if (!geometry) return <GlassFallbackGeometry mode={mode} />

  return (
    <mesh geometry={geometry}>
      <MeshTransmissionMaterial {...GLASS_MATERIAL_PROPS} />
    </mesh>
  )
}

/**
 * GlassMesh — follows pointer (lens / cube) or stays fixed (bar).
 * Wraps GLB loading in Suspense so the component works while models load.
 */
const GlassMesh = memo(function GlassMesh({
  mode,
  pointer
}: {
  mode: Mode
  pointer: React.RefObject<THREE.Vector2>
}) {
  const groupRef = useRef<THREE.Group>(null!)

  useFrame((_, delta) => {
    if (!groupRef.current) return

    if (mode === 'bar') {
      // Bar stays fixed at the bottom of the viewport
      groupRef.current.position.set(0, -7, 15)
      return
    }

    // Lens and cube follow the pointer with smooth damping
    const targetX = pointer.current.x * 8
    const targetY = pointer.current.y * 5
    easing.damp3(groupRef.current.position, [targetX, targetY, 15], 0.4, delta)
  })

  return (
    <group ref={groupRef}>
      <Suspense fallback={<mesh><GlassFallbackGeometry mode={mode} /><MeshTransmissionMaterial {...GLASS_MATERIAL_PROPS} /></mesh>}>
        <GlassGLBInner mode={mode} />
      </Suspense>
    </group>
  )
})

/* ───────────────────────────────────────────────────────────────
 *  ModeWrapper — FBO rendering + glass overlay (memo'd)
 * ─────────────────────────────────────────────────────────────── */

/**
 * Creates an isolated scene via createPortal, renders children to an FBO,
 * and displays the result as a textured plane + glass mesh overlay.
 *
 * Content lives at Z = 0–12, glass mesh at Z = 15.
 */
const ModeWrapper = memo(function ModeWrapper({
  mode,
  children,
  backgroundColor
}: {
  mode: Mode
  children: ReactNode
  backgroundColor?: string
}) {
  const { viewport } = useThree()
  const fbo = useFBO()
  const pointer = useRef(new THREE.Vector2(0, 0))

  // Isolated scene + orthographic camera for FBO capture
  const isolatedScene = useMemo(() => new THREE.Scene(), [])
  const orthoCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(
      -viewport.width / 2,
      viewport.width / 2,
      viewport.height / 2,
      -viewport.height / 2,
      0.1,
      100
    )
    cam.position.z = 10
    return cam
  }, [viewport.width, viewport.height])

  // Track pointer in normalized device coords for glass following
  useFrame((state) => {
    pointer.current.copy(state.pointer)
  })

  // Render the isolated content scene to FBO every frame
  useFrame(({ gl }) => {
    gl.setRenderTarget(fbo)
    gl.render(isolatedScene, orthoCamera)
    gl.setRenderTarget(null)
  })

  return (
    <>
      {/* Portal: renders children into the isolated scene (not the root scene) */}
      {createPortal(children, isolatedScene)}

      {/* FBO texture displayed as a full-viewport plane */}
      <mesh position={[0, 0, 14]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial
          map={fbo.texture}
          toneMapped={false}
        />
      </mesh>

      {/* Glass overlay mesh at Z = 15 */}
      <GlassMesh mode={mode} pointer={pointer} />
    </>
  )
})

/* ───────────────────────────────────────────────────────────────
 *  FluidGlass — default export
 * ─────────────────────────────────────────────────────────────── */

/**
 * FluidGlass — adapted from react-bits for WorkPulse (Electron desktop).
 *
 * Renders scrollable content through a refractive glass overlay.
 * Three modes available:
 * - `lens`: cylinder GLB that follows the pointer
 * - `cube`: cube GLB that follows the pointer
 * - `bar`: fixed bottom bar
 *
 * GLB models expected at:
 * - `/assets/3d/lens.glb`
 * - `/assets/3d/cube.glb`
 * - `/assets/3d/bar.glb`
 *
 * (relative to Vite public root — `public/` in dev, `out/renderer/` in production)
 */
export default function FluidGlass({
  mode = 'lens',
  backgroundColor = 'transparent',
  textColor = '#ffffff',
  className,
  style
}: FluidGlassProps) {
  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    >
      <Canvas
        gl={{
          alpha: true,
          toneMapping: THREE.NoToneMapping
        }}
        camera={{
          position: [0, 0, 20],
          fov: 15,
          near: 0.1,
          far: 100
        }}
        style={{ background: backgroundColor }}
      >
        <ScrollControls pages={3} damping={0.25}>
          <ModeWrapper mode={mode} backgroundColor={backgroundColor}>
            <Content />
          </ModeWrapper>
          <Scroll html>
            {/* Scrollable HTML layer — content passes through the glass */}
          </Scroll>
        </ScrollControls>
        <Preload all />
      </Canvas>
    </div>
  )
}
