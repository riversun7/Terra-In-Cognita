// 측정 방식 1: WebGLRenderer + GLSL(ShaderMaterial) — 지금 엔진(packages/engine)과 같은 길. 지연 조각 하나로만 들어온다.
// `three`(three.module.js = WebGL 렌더러 + 공용 핵심)만 가져온다. `three/webgpu`는 가져오지 않는다.
// 셰이더 식은 TSL 방식(gpuBenchTsl.ts)과 같다: 색 × (주변광 + 확산광 × max(0, 법선·빛)), 화면 좌표계에서 계산.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LinearSRGBColorSpace,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { webglDoneTracker } from "./gpuBenchGpuDone.ts";
import {
  AMBIENT,
  type BenchScene,
  DIFFUSE,
  SEA_COLOR,
  SPACE_COLOR,
  type SceneKit,
  buildBenchScene,
} from "./gpuBenchScene.ts";
import type { CreateSession, FrameCost } from "./gpuBenchTypes.ts";

const KIT: SceneKit = { BufferAttribute, BufferGeometry, Mesh, PerspectiveCamera, Scene, SphereGeometry };

// three가 앞에 붙이는 것: position·normal·(vertexColors면) color 속성, modelViewMatrix·projectionMatrix·normalMatrix
const VERTEX_SHADER = /* glsl */ `
uniform vec3 uColor;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
#ifdef USE_COLOR
  vColor = color;
#else
  vColor = uColor;
#endif
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uLightDir;
uniform float uAmbient;
uniform float uDiffuse;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  float light = uAmbient + uDiffuse * max(dot(normalize(vNormal), uLightDir), 0.0);
  gl_FragColor = vec4(vColor * light, 1.0);
}
`;

/** GPU 이름(WebGL 렌더러 문자열). 숨긴 브라우저는 일반 이름을 준다 */
function readGlRenderer(gl: WebGL2RenderingContext): string | null {
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const value: unknown = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  return typeof value === "string" ? value.slice(0, 160) : null;
}

export const createSession: CreateSession = async ({ canvas, width, height, pixelRatio }) => {
  // 엔진(sharedRenderer.ts)과 같은 설정: MSAA, 불투명, 스텐실 없음, 색 공간 변환 없음
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    depth: true,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.setClearColor(new Color(...SPACE_COLOR));
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext)) throw new Error("webgl2_unavailable");

  let lost: string | null = null;
  canvas.addEventListener("webglcontextlost", () => {
    lost = "webglcontextlost";
  });

  const lightView = new Vector3(0, 0, 1);
  const shared = {
    uLightDir: { value: lightView },
    uAmbient: { value: AMBIENT },
    uDiffuse: { value: DIFFUSE },
  };
  const tileMaterial = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: { ...shared, uColor: { value: new Vector3(1, 1, 1) } },
    vertexColors: true,
  });
  const seaMaterial = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: { ...shared, uColor: { value: new Vector3(...SEA_COLOR) } },
  });
  let bench: BenchScene | null = null;
  const requireScene = (): BenchScene => {
    if (!bench) throw new Error("scene_missing");
    return bench;
  };
  const gpuDone = webglDoneTracker(gl);

  return {
    info: {
      backend: "webgl2",
      samples: Number(gl.getParameter(gl.SAMPLES)) || 0,
      glRenderer: readGlRenderer(gl),
      compatibilityMode: null,
    },
    gpuDone,
    setScene(workload) {
      bench = buildBenchScene(
        KIT,
        workload,
        { tile: tileMaterial, sea: seaMaterial },
        lightView,
        width / height,
      );
    },
    async compile() {
      const active = requireScene();
      // 장면에는 재질마다 하나(첫 타일 + 바다)만 있다. 나머지 타일은 같은 프로그램을 쓴다(gpuBenchScene.ts)
      await renderer.compileAsync(active.scene, active.camera);
      // KHR_parallel_shader_compile이 없으면 compileAsync는 10ms 뒤 "준비됨"으로 풀리고, 링크 확인(LINK_STATUS)과
      // uniform 위치 읽기는 첫 그리기에서 멈춰 기다린다(three WebGLProgram isReady·onFirstUse). TSL의 WebGL2 백엔드는
      // 같은 일을 compileAsync 안에서 끝낸다. 여기서 끝내야 두 방식의 "컴파일"이 같은 일을 잰다(리뷰 지적, 2026-10-29)
      for (const program of renderer.info.programs ?? []) program.getUniforms();
      active.fill();
    },
    render(timeSec): FrameCost {
      const { scene, camera, update, fill } = requireScene();
      fill();
      update(timeSec);
      const start = performance.now();
      renderer.render(scene, camera);
      const cpuMs = performance.now() - start;
      return { cpuMs, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    setLoop(callback) {
      renderer.setAnimationLoop(callback);
    },
    lostReason: () => lost,
    firstError: () => null,
    async dispose() {
      renderer.setAnimationLoop(null);
      gpuDone.dispose();
      bench?.dispose();
      bench = null;
      tileMaterial.dispose();
      seaMaterial.dispose();
      renderer.dispose();
      // 컨텍스트를 바로 돌려준다(측정마다 새 캔버스를 쓰므로 쌓이지 않게)
      renderer.forceContextLoss();
    },
  };
};
