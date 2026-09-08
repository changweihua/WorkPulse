/* eslint-disable react/no-unknown-property */

/**
 * LiquidGlassSurface — A lightweight accent layer combining CSS glassmorphism
 * with a small animated canvas for dynamic light effects (caustics/refractions).
 * This is NOT a full WebGL FBO component like FluidGlass.tsx — it wraps any
 * DOM content and adds a "liquid glass" feel without heavy GPU cost.
 */

import { memo, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CSSProperties, ReactNode } from 'react'

/* ─── Props ──────────────────────────────────────────────────── */

export interface LiquidGlassSurfaceProps {
  /** Content to render inside the glass surface */
  children: ReactNode
  /** Additional CSS classes */
  className?: string
  /** Additional inline styles */
  style?: CSSProperties
  /** Light intensity 0-1 (default: 0.5) */
  intensity?: number
  /** Tint color (default: 'rgba(180,210,255,0.08)') */
  tintColor?: string
  /** Whether to animate the caustic pattern (default: true) */
  animated?: boolean
  /** Whether to show the CSS frosted glass background (default: true) */
  frosted?: boolean
}

/* ─── Caustic shader ──────────────────────────────────────────── */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec2 uResolution;

  varying vec2 vUv;

  float caustic(vec2 uv, float t) {
    float c = 0.0;
    // Layer 1: large waves
    c += sin(uv.x * 3.0 + t * 0.7) * sin(uv.y * 2.5 - t * 0.5) * 0.5;
    // Layer 2: medium waves
    c += sin(uv.x * 5.5 - t * 1.1 + 1.3) * sin(uv.y * 4.8 + t * 0.8) * 0.3;
    // Layer 3: fine detail
    c += sin(uv.x * 8.2 + t * 1.5 + 2.7) * sin(uv.y * 7.1 - t * 1.2 + 0.5) * 0.2;
    return c;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.3;

    float c = caustic(uv, t);
    c = c * 0.5 + 0.5; // remap to 0-1

    // Soft white-blue caustic color
    vec3 color = mix(
      vec3(0.95, 0.97, 1.0),
      vec3(0.85, 0.90, 1.0),
      c
    );

    // Alpha: very subtle — just enough to create shimmer
    float alpha = c * uIntensity * 0.15;

    gl_FragColor = vec4(color, alpha);
  }
`

/* ─── Inner R3F scene ─────────────────────────────────────────── */

function CausticPlane({ intensity }: { intensity: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null!)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uResolution: { value: new THREE.Vector2(1, 1) },
    }),
    [intensity],
  )

  useFrame((_, delta) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value += delta
    }
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ─── Main component ──────────────────────────────────────────── */

export const LiquidGlassSurface = memo(function LiquidGlassSurface({
  children,
  className = '',
  style,
  intensity = 0.5,
  tintColor = 'rgba(180,210,255,0.08)',
  animated = true,
  frosted = true,
}: LiquidGlassSurfaceProps) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {/* Layer 1: Children (DOM content) */}
      <div className="relative z-[1]">{children}</div>

      {/* Layer 2: CSS frosted glass background */}
      {frosted && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${tintColor} 0%, transparent 40%, ${tintColor} 100%)`,
            backdropFilter: 'blur(12px) saturate(150%)',
            WebkitBackdropFilter: 'blur(12px) saturate(150%)',
          }}
        />
      )}

      {/* Layer 3: Animated caustic canvas overlay */}
      {animated && (
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{ mixBlendMode: 'overlay' }}
        >
          <Canvas
            gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
            camera={{ position: [0, 0, 1], fov: 50 }}
            dpr={[0.5, 1]}
            style={{ background: 'transparent' }}
          >
            <CausticPlane intensity={intensity} />
          </Canvas>
        </div>
      )}
    </div>
  )
})

export default LiquidGlassSurface
