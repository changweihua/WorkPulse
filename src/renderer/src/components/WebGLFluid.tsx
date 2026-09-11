import { useEffect, useRef, useCallback } from 'react'

interface WebGLFluidProps {
  className?: string
  opacity?: number
  speed?: number
}

// ── Vertex Shader ───────────────────────────────────────────────────────────
const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// ── Fragment Shader ─────────────────────────────────────────────────────────
// Noise-based fluid: hash → value noise → FBM → organic slow flow
const FRAG = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_hover;       // 0–1 hover intensity
uniform float u_opacity;
uniform float u_speed;

// ── Hash: pseudo-random per-cell ──
vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// ── Gradient noise with smooth interpolation ──
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);  // smoothstep

  return mix(mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                 dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                 dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

// ── FBM: layered noise for organic flow ──
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  // 5 octaves — enough detail without GPU strain
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  // Normalised coordinates (aspect-corrected)
  vec2 p = uv;
  p.x *= aspect;

  float t = u_time * u_speed;

  // Domain warp: offset UVs through FBM for fluid distortion
  float n1 = fbm(p * 2.0 + vec2(t * 0.17, t * 0.09));
  float n2 = fbm(p * 2.4 + vec2(-t * 0.12, t * 0.14) + n1 * 1.6);

  // Third warp layer — subtle organic curl
  float n3 = fbm(p * 1.8 + vec2(t * 0.08, -t * 0.06) + n2 * 1.2);

  // Map noise to a subtle colour palette (blue/purple tones)
  float v = n3 * 0.5 + 0.5;  // remap to 0–1

  // Blue → purple gradient based on noise
  vec3 colA = vec3(0.38, 0.51, 1.0);  // blue  (#6382FF)
  vec3 colB = vec3(0.66, 0.39, 1.0);  // purple (#A864FF)
  vec3 col  = mix(colA, colB, smoothstep(0.2, 0.8, v));

  // Brightness pulse from noise
  float brightness = 0.6 + 0.4 * v;

  // Hover activation: intensify when hovered
  float hoverBoost = 1.0 + u_hover * 1.5;

  // Final alpha: very low for ambient-only effect
  float alpha = u_opacity * hoverBoost * brightness;

  gl_FragColor = vec4(col * brightness, alpha);
}
`

// ── Helpers ─────────────────────────────────────────────────────────────────

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('WebGLFluid: shader compile error', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  if (!vs || !fs) return null

  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('WebGLFluid: link error', gl.getProgramInfoLog(prog))
    gl.deleteProgram(prog)
    return null
  }

  // Shaders are linked into the program; originals can be released
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return prog
}

// ── Component ───────────────────────────────────────────────────────────────

export default function WebGLFluid({
  className,
  opacity = 0.05,
  speed = 0.3,
}: WebGLFluidProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const stateRef = useRef({
    gl: null as WebGLRenderingContext | null,
    program: null as WebGLProgram | null,
    uniforms: {
      u_resolution: null as WebGLUniformLocation | null,
      u_time: null as WebGLUniformLocation | null,
      u_hover: null as WebGLUniformLocation | null,
      u_opacity: null as WebGLUniformLocation | null,
      u_speed: null as WebGLUniformLocation | null,
    },
    hoverT: 0,          // current hover intensity 0→1
    hoverDir: 0,        // +1 entering, -1 leaving
    running: false,
    rafId: 0,
    startTime: 0,
    propsRef: { opacity, speed },
  })

  // Keep props accessible inside the rAF loop without re-creating it
  stateRef.current.propsRef = { opacity, speed }

  const resize = useCallback(() => {
    const s = stateRef.current
    const canvas = canvasRef.current
    const gl = s.gl
    if (!canvas || !gl) return

    const dpr = Math.min(window.devicePixelRatio || 1, 1) // cap at 1× for perf
    const w = window.innerWidth
    const h = window.innerHeight

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    gl.viewport(0, 0, canvas.width, canvas.height)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ── WebGL init ──
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      // preserveDrawingBuffer intentionally omitted (false = default, better perf)
    })
    if (!gl) {
      console.warn('WebGLFluid: WebGL not available')
      return
    }

    const program = createProgram(gl, VERT, FRAG)
    if (!program) return

    gl.useProgram(program)

    // Full-screen quad (two triangles)
    const posBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
    // Two triangles covering clip space
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const aPos = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    // Uniforms
    const uniforms = {
      u_resolution: gl.getUniformLocation(program, 'u_resolution'),
      u_time: gl.getUniformLocation(program, 'u_time'),
      u_hover: gl.getUniformLocation(program, 'u_hover'),
      u_opacity: gl.getUniformLocation(program, 'u_opacity'),
      u_speed: gl.getUniformLocation(program, 'u_speed'),
    }

    const s = stateRef.current
    s.gl = gl
    s.program = program
    s.uniforms = uniforms
    s.startTime = performance.now() / 1000

    resize()
    window.addEventListener('resize', resize)

    // ── Hover tracking ──
    const onEnter = () => { s.hoverDir = 1 }
    const onLeave = () => { s.hoverDir = -1 }

    // Attach to window so we don't need a wrapper div capturing events
    window.addEventListener('mouseenter', onEnter)
    window.addEventListener('mouseleave', onLeave)

    // ── Render loop (only runs when hovered or easing out) ──
    const tick = () => {
      const now = performance.now() / 1000
      const { gl: g, uniforms: u, propsRef } = s
      if (!g) return

      // Ease hoverT toward target
      const target = s.hoverDir > 0 ? 1 : 0
      s.hoverT += (target - s.hoverT) * 0.04
      if (s.hoverT < 0.001) s.hoverT = 0

      g.clearColor(0, 0, 0, 0)
      g.clear(g.COLOR_BUFFER_BIT)

      g.uniform2f(u.u_resolution, g.canvas.width, g.canvas.height)
      g.uniform1f(u.u_time, now - s.startTime)
      g.uniform1f(u.u_hover, s.hoverT)
      g.uniform1f(u.u_opacity, propsRef.opacity)
      g.uniform1f(u.u_speed, propsRef.speed)

      g.drawArrays(g.TRIANGLES, 0, 6)

      // Keep rAF alive while hoverT > 0 (entering, fully in, or easing out)
      if (s.hoverT > 0.001) {
        s.rafId = requestAnimationFrame(tick)
        s.running = true
      } else {
        s.running = false
      }
    }

    // Start idle — no rAF yet. Kick off on first hover.
    // But render one frame so there's a baseline image ready.
    s.running = true
    s.hoverT = 0
    s.rafId = requestAnimationFrame(tick)

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(s.rafId)
      s.running = false
      window.removeEventListener('resize', resize)
      window.removeEventListener('mouseenter', onEnter)
      window.removeEventListener('mouseleave', onLeave)
      if (s.program) {
        gl.deleteProgram(s.program)
        s.program = null
      }
    }
  }, [resize])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  )
}
