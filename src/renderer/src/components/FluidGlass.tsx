import * as THREE from 'three';
import { useRef, useMemo, useState, useEffect, memo, Suspense, type ReactNode } from 'react';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import {
  useFBO,
  useGLTF,
  Image,
  Scroll,
  useScroll,
  Preload,
  ScrollControls,
  MeshTransmissionMaterial,
  Text,
} from '@react-three/drei';
import { easing } from 'maath';

/* ───────────────────────────────────────────────────────────────
 *  Types
 * ─────────────────────────────────────────────────────────────── */

type Mode = 'lens' | 'bar' | 'cube';

export interface FluidGlassProps {
  /** Glass shape mode — 'lens' (cylinder), 'cube', or 'bar' (fixed bottom bar) */
  mode?: Mode;
  /** 第三层材质覆盖（作用于 lens 模式） */
  lensProps?: GlassMaterialOverrides;
  /** 第三层材质覆盖（作用于 bar 模式） */
  barProps?: GlassMaterialOverrides;
  /** 第三层材质覆盖（作用于 cube 模式） */
  cubeProps?: GlassMaterialOverrides;
  backgroundColor?: string;
  /** 3D 标题与 bar 导航文字颜色（固定深色画布上的浅色文字） */
  textColor?: string;
  /** bar 模式下的 3D 导航标签（需经 i18n 处理后传入） */
  navItems?: string[];
  className?: string;
  style?: React.CSSProperties;
}

/* ───────────────────────────────────────────────────────────────
 *  Constants
 * ─────────────────────────────────────────────────────────────── */

/** 演示图片已本地化到 public/assets/demo/（离线可用，避免 Unsplash 拉取黑图） */
const IMAGE_URLS = [
  '/assets/demo/ds1.webp',
  '/assets/demo/ds2.webp',
  '/assets/demo/ds3.webp',
  '/assets/demo/ds4.webp',
  '/assets/demo/ds5.webp',
];

const GLB_PATHS: Record<Mode, string> = {
  lens: '/assets/3d/lens.glb',
  cube: '/assets/3d/cube.glb',
  bar: '/assets/3d/bar.glb',
};

// 模块顶层预加载：进入页面前就把三个 GLB 拉进缓存，切模式时不再走网络
useGLTF.preload(GLB_PATHS.lens);
useGLTF.preload(GLB_PATHS.cube);
useGLTF.preload(GLB_PATHS.bar);

/**
 * 玻璃材质基础预设（三层合并的第 1 层）。
 *
 * 参数依据：
 * - 不用 `backside`：参考实现本就不开背面渲染，可省掉一半采样开销。
 * - `temporalDistortion: 0` + `anisotropy: 0.01`（原为 0.1/0.1）：这两项随时间
 *   持续注入扰动，会让玻璃永远缓慢蠕动；归零后恢复苹果液态玻璃那种清澈静止的质感。
 * - `ior: 1.15`、`thickness: 2`：折射温和，透过玻璃仍能辨认背后内容。
 * - `chromaticAberration: 0.05`：只留一点点色散做玻璃边缘的彩边，过大会发糊。
 * - `samples: 6` / `resolution: 256`：画质与开销的平衡点。
 */
const GLASS_BASE_PRESETS = {
  samples: 6,
  resolution: 256,
  transmission: 1,
  roughness: 0,
  ior: 1.15,
  thickness: 2,
  chromaticAberration: 0.05,
  anisotropy: 0.01,
  distortion: 0,
  distortionScale: 0.2,
  temporalDistortion: 0,
  clearcoat: 1,
  attenuationDistance: 0.5,
  // 注：这两个是 three.js MeshTransmissionMaterial 的材质属性，由 THREE.Color 解析，
  // 无法识别 CSS var()，且白色是玻璃的物理中性色（不随主题变化），故保留字面量
  attenuationColor: '#ffffff',
  color: '#ffffff',
};

/** 玻璃材质可覆盖参数（第 2、3 层共用同一形状） */
export type GlassMaterialOverrides = Partial<typeof GLASS_BASE_PRESETS>;

/**
 * 按模式的材质覆盖（第 2 层）。
 * bar 是贴底导航条：加厚到 10、衰减距离压到 0.25，让条带更「厚玻璃」更有体积感；
 * ior 沿用基础值 1.15，保证条上的导航文字不至于被过度折射。
 */
const MODE_OVERRIDES: Record<Mode, GlassMaterialOverrides> = {
  lens: {},
  cube: {},
  bar: { thickness: 10, ior: 1.15, attenuationDistance: 0.25 },
};

/** 三层合并：基础预设 → 模式覆盖 → 用户覆盖（props） */
function buildGlassMaterialProps(
  mode: Mode,
  userOverrides?: GlassMaterialOverrides,
): GlassMaterialOverrides {
  return { ...GLASS_BASE_PRESETS, ...MODE_OVERRIDES[mode], ...userOverrides };
}

/* ───────────────────────────────────────────────────────────────
 *  Helpers
 * ─────────────────────────────────────────────────────────────── */

/** 提取 GLB 场景中的首个 mesh 几何体 */
function extractGeometry(scene: THREE.Group): THREE.BufferGeometry | null {
  let found: THREE.BufferGeometry | null = null;
  scene.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) {
      found = child.geometry.clone();
    }
  });
  return found;
}

/** 视口档位：mobile ≤639 / tablet ≤1023 / desktop >1023 */
type ViewportClass = 'mobile' | 'tablet' | 'desktop';

function getViewportClass(): ViewportClass {
  const w = window.innerWidth;
  if (w <= 639) return 'mobile';
  if (w <= 1023) return 'tablet';
  return 'desktop';
}

/** 监听窗口尺寸变化，返回当前视口档位（用于 3D 文字的响应式字号与间距） */
function useViewportClass(): ViewportClass {
  const [cls, setCls] = useState<ViewportClass>(() => getViewportClass());
  useEffect(() => {
    const onResize = () => setCls(getViewportClass());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cls;
}

/** 大标题字号：移动端 0.2 / 平板 0.4 / 桌面 0.6 */
const TITLE_FONT_SIZE: Record<ViewportClass, number> = {
  mobile: 0.2,
  tablet: 0.4,
  desktop: 0.6,
};

/** bar 导航项水平间距：移动端 0.2 / 平板 0.24 / 桌面 0.3 */
const NAV_SPACING: Record<ViewportClass, number> = {
  mobile: 0.2,
  tablet: 0.24,
  desktop: 0.3,
};

/** 3D 文字统一样式：白字 + 外扩柔化描边，保证在亮暗内容上都能读 */
const TEXT_OUTLINE_PROPS = {
  letterSpacing: -0.05,
  anchorX: 'center',
  anchorY: 'middle',
  outlineWidth: 0,
  outlineBlur: '20%',
  outlineColor: '#000',
  outlineOpacity: 0.5,
} as const;

/* ───────────────────────────────────────────────────────────────
 *  Typography — 3D 大标题（渲染进离屏场景，透过玻璃看折射）
 * ─────────────────────────────────────────────────────────────── */

function Typography({ textColor }: { textColor: string }) {
  const cls = useViewportClass();
  return (
    <Text position={[0, 0, 12]} fontSize={TITLE_FONT_SIZE[cls]} color={textColor} {...TEXT_OUTLINE_PROPS}>
      WorkPulse
    </Text>
  );
}

/* ───────────────────────────────────────────────────────────────
 *  NavItems — bar 模式的 3D 导航文字（贴在玻璃条前方）
 * ─────────────────────────────────────────────────────────────── */

const NavItems = memo(function NavItems({
  items,
  textColor,
}: {
  items: string[];
  textColor: string;
}) {
  const navRef = useRef<THREE.Group>(null);
  const cls = useViewportClass();
  const spacing = NAV_SPACING[cls];

  useFrame(({ viewport, camera }) => {
    if (!navRef.current) return;
    const view = viewport.getCurrentViewport(camera, [0, 0, 15]);
    navRef.current.position.set(0, -view.height / 2 + 0.2, 15.1);
    navRef.current.children.forEach((child, index) => {
      child.position.x = (index - (items.length - 1) / 2) * spacing;
    });
  });

  return (
    <group ref={navRef}>
      {items.map((label, index) => (
        <Text
          key={`${index}-${label}`}
          fontSize={0.035}
          color={textColor}
          renderOrder={10}
          {...TEXT_OUTLINE_PROPS}
        >
          {label}
        </Text>
      ))}
    </group>
  );
});

/* ───────────────────────────────────────────────────────────────
 *  Content — scrollable image grid (rendered to FBO)
 * ─────────────────────────────────────────────────────────────── */

/** drei 的 imageMaterial 带一个可动态写入的 `zoom` uniform */
type ZoomMaterial = THREE.MeshBasicMaterial & { zoom: number };

function Content() {
  const group = useRef<THREE.Group>(null);
  const data = useScroll();

  // 滚动驱动的缩放：前两张与后三张分组错峰 zoom，制造滚动节奏感
  useFrame(() => {
    const children = group.current?.children;
    if (!children || children.length < 5) return;
    const zoom = (index: number, value: number) => {
      ((children[index] as THREE.Mesh).material as ZoomMaterial).zoom = value;
    };
    zoom(0, 1 + data.range(0, 1 / 3) / 3);
    zoom(1, 1 + data.range(0, 1 / 3) / 3);
    zoom(2, 1 + data.range(1.15 / 3, 1 / 3) / 2);
    zoom(3, 1 + data.range(1.15 / 3, 1 / 3) / 2);
    zoom(4, 1 + data.range(1.15 / 3, 1 / 3) / 2);
  });

  return (
    <group ref={group}>
      {IMAGE_URLS.map((url, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const x = (col - 0.5) * 3.2;
        const y = -row * 4.2;
        // z 拉深到 i * 2：让前后图片在透视下产生明显纵深，玻璃扫过时折射位移更丰富
        return <Image key={url} url={url} position={[x, y, i * 2]} scale={2.8} />;
      })}
    </group>
  );
}

/* ───────────────────────────────────────────────────────────────
 *  GlassMesh — GLB geometry + MeshTransmissionMaterial
 * ─────────────────────────────────────────────────────────────── */

/** Fallback geometry when GLB is still loading or unavailable */
function GlassFallbackGeometry({ mode }: { mode: Mode }) {
  if (mode === 'lens') return <cylinderGeometry args={[1.2, 1.2, 0.5, 64]} />;
  if (mode === 'cube') return <boxGeometry args={[2, 2, 2]} />;
  return <boxGeometry args={[8, 0.8, 0.3]} />;
}

/**
 * 只加载当前模式对应的 GLB（模块顶层已 preload 其余两个），
 * 再从中提取首个 mesh 几何体渲染折射材质。
 *
 * 由父级 Suspense 包裹，加载期间回退到 GlassFallbackGeometry。
 */
function GlassGLBInner({
  mode,
  materialProps,
}: {
  mode: Mode;
  materialProps: GlassMaterialOverrides;
}) {
  const gltf = useGLTF(GLB_PATHS[mode]);
  const geometry = useMemo(() => extractGeometry(gltf.scene), [gltf.scene]);

  if (!geometry) return <GlassFallbackGeometry mode={mode} />;

  return (
    <mesh geometry={geometry}>
      <MeshTransmissionMaterial {...materialProps} />
    </mesh>
  );
}

/**
 * GlassMesh — follows pointer (lens / cube) or stays fixed (bar).
 * Wraps GLB loading in Suspense so the component works while models load.
 */
const GlassMesh = memo(function GlassMesh({
  mode,
  pointerNDC,
  materialProps,
}: {
  mode: Mode;
  pointerNDC: React.RefObject<THREE.Vector2>;
  materialProps: GlassMaterialOverrides;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // 以玻璃所在深度（z = 15）的视口换算目标位置，避免写死 x*8 / y*5 / y=-7
    const view = state.viewport.getCurrentViewport(state.camera, [0, 0, 15]);

    if (mode === 'bar') {
      // Bar 贴在该深度视口的底部
      groupRef.current.position.set(0, -view.height / 2 + 0.2, 15);
      return;
    }

    // Lens / cube 跟随指针，0.15 的阻尼带出液态惯性（原 0.4 太跟手）
    const destX = pointerNDC.current.x * (view.width / 2);
    const destY = pointerNDC.current.y * (view.height / 2);
    easing.damp3(groupRef.current.position, [destX, destY, 15], 0.15, delta);
  });

  return (
    <group ref={groupRef}>
      <Suspense
        fallback={
          <mesh>
            <GlassFallbackGeometry mode={mode} />
            <MeshTransmissionMaterial {...materialProps} />
          </mesh>
        }
      >
        <GlassGLBInner mode={mode} materialProps={materialProps} />
      </Suspense>
    </group>
  );
});

/* ───────────────────────────────────────────────────────────────
 *  ModeWrapper — FBO rendering + glass overlay (memo'd)
 * ─────────────────────────────────────────────────────────────── */

/**
 * 通过 createPortal 把 children 放进离屏场景，每帧用**主透视相机**渲到 FBO，
 * 再以 FBO 纹理贴到 z = 0 的全视口平面上；玻璃 mesh 覆盖在 z = 15。
 *
 * 用主透视相机（而非正交相机）才能保留纵深视差，也让 z = 12 的 3D 标题可见。
 * 同时在 window 上监听 pointermove：ScrollControls 的滚动层盖住 canvas，
 * pointermove 打不到 canvas，R3F 的 state.pointer 因此失效。
 */
const ModeWrapper = memo(function ModeWrapper({
  mode,
  children,
  textColor,
  materialProps,
  navItems,
}: {
  mode: Mode;
  children: ReactNode;
  textColor: string;
  materialProps: GlassMaterialOverrides;
  navItems?: string[];
}) {
  const gl = useThree((s) => s.gl);
  const viewport = useThree((s) => s.viewport);
  const fbo = useFBO();

  // 指针 NDC（由 window 事件驱动，不依赖 R3F 的 state.pointer）
  const pointerNDC = useRef(new THREE.Vector2(0, 0));

  // 离屏场景（只在 FBO 里出现，不进主场景）
  const isolatedScene = useMemo(() => new THREE.Scene(), []);

  // 1.1 全局指针跟踪：按 canvas 的实际位置换算 NDC
  useEffect(() => {
    const canvas = gl.domElement;
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pointerNDC.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [gl]);

  // 1.3 每帧把离屏场景渲到 FBO（用 R3F 传入的主透视相机）
  useFrame((state) => {
    gl.setRenderTarget(fbo);
    gl.render(isolatedScene, state.camera);
    gl.setRenderTarget(null);
  });

  const showNav = mode === 'bar' && !!navItems && navItems.length > 0;

  return (
    <>
      {/* Portal：children 落在离屏场景里（ScrollControls 的 context 可穿透 portal） */}
      {createPortal(
        <>
          {/* 3D 标题固定不滚动，正好落在玻璃后方 */}
          <Typography textColor={textColor} />
          {/* 滚动组：滚轮驱动整块图片网格上下移动 */}
          <Scroll>{children}</Scroll>
        </>,
        isolatedScene,
      )}

      {/* FBO 纹理铺满 z = 0 的整块视口平面 */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={fbo.texture} toneMapped={false} />
      </mesh>

      {/* 玻璃层（z = 15） */}
      <GlassMesh mode={mode} pointerNDC={pointerNDC} materialProps={materialProps} />

      {/* bar 模式的 3D 导航文字 */}
      {showNav && navItems ? <NavItems items={navItems} textColor={textColor} /> : null}
    </>
  );
});

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
  lensProps,
  barProps,
  cubeProps,
  backgroundColor = 'transparent',
  // 固定深色画布上的浅色文字：--color-text-inverse 会随 .dark 翻转为近黑，不适配；无对应恒定 token，保留 hex
  textColor = '#ffffff',
  navItems,
  className,
  style,
}: FluidGlassProps) {
  const userOverrides =
    mode === 'lens' ? lensProps : mode === 'bar' ? barProps : cubeProps;

  // 三层材质合并随模式与用户覆盖变化，缓存避免每帧重建
  const materialProps = useMemo(
    () => buildGlassMaterialProps(mode, userOverrides),
    [mode, userOverrides],
  );

  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    >
      <Canvas
        gl={{
          alpha: true,
          toneMapping: THREE.NoToneMapping,
        }}
        camera={{
          position: [0, 0, 20],
          fov: 15,
          near: 0.1,
          far: 100,
        }}
        style={{ background: backgroundColor }}
      >
        <ScrollControls pages={3} damping={0.25}>
          <ModeWrapper
            mode={mode}
            textColor={textColor}
            materialProps={materialProps}
            navItems={navItems}
          >
            <Content />
          </ModeWrapper>
        </ScrollControls>
        <Preload all />
      </Canvas>
    </div>
  );
}
