// 측정 방식 2·3: WebGPURenderer + TSL(three의 셰이더 언어). 지연 조각 하나로만 들어온다.
// `three/webgpu`·`three/tsl`만 가져온다(`three` = WebGL 렌더러는 가져오지 않는다).
// - WebGPU: 기본. 브라우저에 WebGPU가 없거나 어댑터를 못 얻으면 three가 스스로 WebGL2 백엔드로 바꾼다(대체).
// - WebGL2: forceWebGL — 같은 TSL을 GLSL로 바꿔 WebGL2로 그린다(WebGPU가 없는 기기가 쓰는 길).
// 셰이더 식은 GLSL 방식(gpuBenchGlsl.ts)과 같다. TSL 코드는 실행 중에 WGSL·GLSL 글로 바뀐다(그 시간도 컴파일 시간에 든다).
// 카메라 기준 좌표(ADR 36): highPrecision을 켜서 모델뷰 행렬을 CPU에서 64비트로 곱한다(WebGLRenderer와 같은 일).
// 끄면(three 기본) 셰이더가 cameraViewMatrix × modelWorldMatrix를 GPU에서 32비트로 곱한다(ModelNode.js mediumpModelViewMatrix).
import { dot, float, max, normalView, uniform, vec3, vec4, vertexColor } from "three/tsl";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicNodeMaterial,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGPURenderer,
} from "three/webgpu";
import { type GpuDoneTracker, webglDoneTracker, webgpuDoneTracker } from "./gpuBenchGpuDone.ts";
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

/** 렌더러가 넘기는 오류·잃어버림 정보에서 짧은 문장을 꺼낸다 */
function describe(info: unknown): string {
  if (typeof info === "string") return info.slice(0, 160);
  if (info && typeof info === "object" && "message" in info && typeof info.message === "string") {
    return info.message.slice(0, 160);
  }
  return "unknown";
}

export const createSession: CreateSession = async ({ canvas, width, height, pixelRatio, forceWebGL }) => {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    depth: true,
    forceWebGL: forceWebGL === true,
  });
  // 셰이더를 만들기 전에 켠다(만들어지는 셰이더가 바뀐다). 렌더러 전체 설정이라 InstancedMesh·SkinnedMesh와는
  // 함께 쓸 수 없다(three 설명). 측정 장면에는 둘 다 없다. 재질마다 켜는 길은 조사 문서 2장
  renderer.highPrecision = true;
  // 색 공간 변환·톤 매핑을 끈다 → 중간 버퍼 없이 화면에 바로 그린다(GLSL 방식과 같은 일)
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.setClearColor(new Color(...SPACE_COLOR));
  let lost: string | null = null;
  let error: string | null = null;
  renderer.onDeviceLost = (info) => {
    lost = describe(info);
  };
  renderer.onError = (info: unknown) => {
    error ??= describe(info);
  };
  // 어댑터·장치(WebGPU) 또는 컨텍스트(WebGL2)를 만든다. WebGPU가 안 되면 여기서 WebGL2로 바뀐다
  await renderer.init();
  const backend = renderer.backend;
  const isWebGpu = "isWebGPUBackend" in backend && backend.isWebGPUBackend === true;
  // 호환 모드(three 타입에는 없는 값): 핵심 기능이 없는 어댑터. three가 MSAA를 끈다
  const compatibility = "compatibilityMode" in backend && backend.compatibilityMode === true;
  // WebGL2 백엔드의 컨텍스트(버릴 때 바로 돌려준다)
  const gl = !isWebGpu && "gl" in backend && backend.gl instanceof WebGL2RenderingContext ? backend.gl : null;
  // WebGPU 장치(GPU 완료 재기). GPUDevice는 WebGPU가 있는 브라우저에만 있다
  const device =
    isWebGpu && typeof GPUDevice !== "undefined" && "device" in backend && backend.device instanceof GPUDevice
      ? backend.device
      : null;
  const gpuDone: GpuDoneTracker | null = device
    ? webgpuDoneTracker(device)
    : gl
      ? webglDoneTracker(gl)
      : null;

  const lightView = new Vector3(0, 0, 1);
  const lightNode = uniform(lightView);
  const lighting = float(AMBIENT).add(max(dot(normalView, lightNode), 0).mul(DIFFUSE));
  const tileMaterial = new MeshBasicNodeMaterial();
  tileMaterial.colorNode = vec4(vertexColor().xyz.mul(lighting), 1);
  const seaMaterial = new MeshBasicNodeMaterial();
  seaMaterial.colorNode = vec4(vec3(...SEA_COLOR).mul(lighting), 1);
  let bench: BenchScene | null = null;
  const requireScene = (): BenchScene => {
    if (!bench) throw new Error("scene_missing");
    return bench;
  };

  return {
    info: {
      backend: isWebGpu ? "webgpu" : "webgl2",
      samples: renderer.samples,
      glRenderer: null,
      compatibilityMode: isWebGpu ? compatibility : null,
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
      const { scene, camera } = requireScene();
      await renderer.compileAsync(scene, camera);
    },
    render(timeSec): FrameCost {
      const { scene, camera, update } = requireScene();
      update(timeSec);
      const start = performance.now();
      renderer.render(scene, camera);
      const cpuMs = performance.now() - start;
      // 그리기 수는 three의 프레임 반복이 프레임마다 0으로 돌린다(info.autoReset)
      return { cpuMs, drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
    },
    setLoop(callback) {
      void renderer.setAnimationLoop(callback);
    },
    lostReason: () => lost,
    firstError: () => error,
    async dispose() {
      void renderer.setAnimationLoop(null);
      gpuDone?.dispose();
      bench?.dispose();
      bench = null;
      tileMaterial.dispose();
      seaMaterial.dispose();
      // WebGPU 장치는 three가 destroy한다(직접 만든 장치가 아니면). WebGL2 백엔드는 컨텍스트를 바로 돌려준다
      await renderer.dispose();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      // 장치가 정말 없어질 때까지(최대 1.5초) 기다린다. 안 기다리면 다음 측정의 초기화 시간에 정리 시간이 섞인다
      // (Xvfb + SwiftShader에서 WebGPU 뒤 WebGL2 초기화가 0.3~0.8초로 늘었다)
      if (device) {
        await Promise.race([device.lost, new Promise((resolve) => setTimeout(resolve, 1_500))]);
      }
    },
  };
};
