/**
 * LiquidGlassSurface — A lightweight accent layer combining CSS glassmorphism
 * with a small animated canvas for dynamic light effects (caustics/refractions).
 * This is NOT a full WebGL FBO component like FluidGlass.tsx — it wraps any
 * DOM content and adds a "liquid glass" feel without heavy GPU cost.
 *
 * 阶段三（L2 导航层）性能纪律：
 * - 每个挂载的 <Canvas> = 1 个 WebGL context，全局常驻实例预算 ≤2（侧栏 + 命令面板）。
 * - Page Visibility 停环：窗口隐藏时 frameloop='never'（C7），context 保留不销毁。
 * - 屏外停渲染：IntersectionObserver 离屏即卸载 Canvas，释放 context。
 * - 降级：prefers-reduced-transparency / prefers-reduced-motion 命中则不挂 caustic，
 *   frosted 层退化为不透明实心底（C6），只保留布局不保留玻璃。
 */

import { memo, useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CSSProperties, ReactNode } from 'react';

/* ─── Props ──────────────────────────────────────────────────── */

export interface LiquidGlassSurfaceProps {
  /** Content to render inside the glass surface */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Light intensity 0-1 (default: 0.5) */
  intensity?: number;
  /** Tint color (default: 'rgba(180,210,255,0.08)') */
  tintColor?: string;
  /** Whether to animate the caustic pattern (default: true) */
  animated?: boolean;
  /** Whether to show the CSS frosted glass background (default: true) */
  frosted?: boolean;
}

/* ─── 停环与降级 hooks（阶段三 C6/C7） ─────────────────────────── */

/** 监听媒体查询；matchMedia 不可用时恒为 false（视为不命中，保持完整渲染） */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** C6：用户开启「减少透明度」→ 退化为不透明实心 surface，关闭 backdrop 玻璃 */
function useReducedTransparency(): boolean {
  return useMediaQuery('(prefers-reduced-transparency: reduce)');
}

/** §4 降级表：用户开启「减少动态」→ caustic 完全不挂（等价 animated=false） */
function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** C7：Page Visibility —— 窗口隐藏时把 R3F frameloop 切到 'never' 停环 */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

/** IntersectionObserver：元素离开视口时卸载 Canvas（屏外玻璃不渲染，省电近似）。
 *  IO 不可用或尚未回调前保持 true，保证正常渲染不被误杀。 */
function useInView(ref: { current: HTMLElement | null }): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      // 仅观察单个根节点，取首个条目即可
      setInView(entries[0]?.isIntersecting ?? true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return inView;
}

/* ─── Caustic shader ──────────────────────────────────────────── */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

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
`;

/* ─── Inner R3F scene ─────────────────────────────────────────── */

function CausticPlane({ intensity }: { intensity: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uResolution: { value: new THREE.Vector2(1, 1) },
    }),
    [intensity],
  );

  useFrame((_, delta) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value += delta;
    }
  });

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
  );
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
  const rootRef = useRef<HTMLDivElement>(null);

  // —— 性能门控（阶段三）——
  // 1) 屏外停渲染：IntersectionObserver 离屏即卸载 Canvas，释放 WebGL context
  const inView = useInView(rootRef);
  // 2) Page Visibility 停环：窗口隐藏时 frameloop='never'（context 保留，避免重建）
  const pageVisible = usePageVisible();
  // 3) 降级：减少透明度 / 减少动态 → caustic 完全不挂载
  const reducedTransparency = useReducedTransparency();
  const reducedMotion = useReducedMotion();

  // Canvas 挂载意图：调用方 animated=false（面板关闭/侧栏折叠）或降级命中 → 不挂载
  const showCaustic = animated && inView && !reducedTransparency && !reducedMotion;
  // 挂载期间的停环开关：仅窗口隐藏时停
  const frameloop = pageVisible ? 'always' : 'never';

  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`} style={style}>
      {/* Layer 1: Children (DOM content) */}
      <div className="relative z-[1]">{children}</div>

      {/* Layer 2: CSS 毛玻璃背景；减少透明度时退化为不透明实心底（C6 降级） */}
      {frosted && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={
            reducedTransparency
              ? {
                  // 不透明实心 surface：关闭 backdrop blur，仅保留布局。
                  // 颜色取 --color-surface-elevated；集成层（命令面板/侧栏）另有
                  // @media (prefers-reduced-transparency: reduce) 实心底保证整体不透明。
                  background: 'var(--color-surface-elevated, rgb(255 255 255))',
                }
              : {
                  background: `linear-gradient(135deg, ${tintColor} 0%, transparent 40%, ${tintColor} 100%)`,
                  backdropFilter: 'blur(12px) saturate(150%)',
                  WebkitBackdropFilter: 'blur(12px) saturate(150%)',
                }
          }
        />
      )}

      {/* Layer 3: 动态 caustic 画布 —— 每实例 1 个 WebGL context。
          仅 showCaustic 时挂载；挂载期间窗口隐藏则 frameloop='never' 停环（C7）。
          保留 dpr={[0.5,1]} 与 powerPreference:'low-power' 硬约束。 */}
      {showCaustic && (
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{ mixBlendMode: 'overlay' }}
        >
          <Canvas
            gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
            camera={{ position: [0, 0, 1], fov: 50 }}
            dpr={[0.5, 1]}
            frameloop={frameloop}
            style={{ background: 'transparent' }}
          >
            <CausticPlane intensity={intensity} />
          </Canvas>
        </div>
      )}
    </div>
  );
});

export default LiquidGlassSurface;
