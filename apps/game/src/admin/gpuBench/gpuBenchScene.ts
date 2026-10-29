// 측정 장면 — 두 방식(WebGLRenderer + GLSL, WebGPURenderer + TSL)이 같은 장면을 쓰게 한다.
// three의 클래스는 방식 모듈이 넘긴다(kit). `three`(WebGL)와 `three/webgpu`는 같은 핵심 코드(three.core)를 쓰므로
// 클래스는 같다. 이 파일은 three를 타입으로만 가져와서 어느 방식의 묶음에도 다른 쪽 렌더러 코드를 끌어오지 않는다.
// - 타일마다 메시 하나(그리기 1번) + 바다 구 1개. 시야 밖 거르기를 끈다 → 그리기 수 = 타일 수 + 1로 늘 같다.
//   (실제 렌더러는 자기가 보이는 타일만 고른다. 측정은 "보이는 타일 N개"를 그리는 비용을 잰다)
// - 타일은 원점 = 메시 위치(실수 64비트), 꼭짓점 = 원점 기준. 모델뷰 행렬은 three가 CPU에서 64비트로 곱한다(ADR 36)
import type {
  BufferAttribute,
  BufferGeometry,
  Material,
  Mesh,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import { BENCH_LIGHT, type BenchWorkload, PLANET_RADIUS_M, cameraPose } from "./gpuBenchWorkload.ts";

/** 방식 모듈이 넘기는 three 클래스 */
export interface SceneKit {
  BufferAttribute: typeof BufferAttribute;
  BufferGeometry: typeof BufferGeometry;
  Mesh: typeof Mesh;
  PerspectiveCamera: typeof PerspectiveCamera;
  Scene: typeof Scene;
  SphereGeometry: typeof SphereGeometry;
}

/** 조명 값 — 두 방식 셰이더가 같은 식을 쓴다: 색 × (주변광 + 확산광 × max(0, 법선·빛)) */
export const AMBIENT = 0.32;
export const DIFFUSE = 0.78;
/** 바다 색(0~1) */
export const SEA_COLOR: readonly [number, number, number] = [0.12, 0.33, 0.58];
/** 우주 배경색(0~1) */
export const SPACE_COLOR: readonly [number, number, number] = [0.03, 0.05, 0.1];
/** 바다 구 가로·세로 나눔 수(삼각형 약 9,200개) */
const SEA_SEGMENTS = { width: 96, height: 48 };
/** 세로 시야각(도) */
const FOV_DEG = 45;

export interface BenchScene {
  scene: Scene;
  camera: PerspectiveCamera;
  /** timeSec초의 카메라로 옮기고, 화면 좌표계의 빛 방향(lightView)을 맞춘다 */
  update: (timeSec: number) => void;
  /** 지오메트리를 버린다(재질은 방식 모듈이 버린다) */
  dispose: () => void;
}

/**
 * 장면을 만든다. lightView는 셰이더가 읽는 화면(뷰) 좌표계 빛 방향이다 — update가 매 프레임 고쳐 쓴다.
 * 지오메트리는 workload의 배열을 그대로 감싼다(복사 없음). 같은 배열을 다른 방식이 다시 쓸 수 있다.
 */
export function buildBenchScene(
  kit: SceneKit,
  workload: BenchWorkload,
  materials: { tile: Material; sea: Material },
  lightView: Vector3,
  aspect: number,
): BenchScene {
  const scene = new kit.Scene();
  scene.matrixWorldAutoUpdate = true;
  const index = new kit.BufferAttribute(workload.index, 1);
  const geometries: BufferGeometry[] = [];
  for (const tile of workload.tiles) {
    const geometry = new kit.BufferGeometry();
    geometry.setIndex(index);
    geometry.setAttribute("position", new kit.BufferAttribute(tile.positions, 3));
    geometry.setAttribute("normal", new kit.BufferAttribute(tile.normals, 3));
    geometry.setAttribute("color", new kit.BufferAttribute(tile.colors, 3));
    geometries.push(geometry);
    const mesh = new kit.Mesh(geometry, materials.tile);
    mesh.position.set(tile.originX, tile.originY, tile.originZ);
    mesh.frustumCulled = false;
    // 움직이지 않는다: 행렬을 한 번만 만든다
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
  }
  const seaGeometry = new kit.SphereGeometry(PLANET_RADIUS_M, SEA_SEGMENTS.width, SEA_SEGMENTS.height);
  geometries.push(seaGeometry);
  const sea = new kit.Mesh(seaGeometry, materials.sea);
  sea.frustumCulled = false;
  sea.matrixAutoUpdate = false;
  sea.updateMatrix();
  scene.add(sea);

  const camera = new kit.PerspectiveCamera(FOV_DEG, aspect, 1_000, PLANET_RADIUS_M * 4);
  const update = (timeSec: number): void => {
    const pose = cameraPose(timeSec);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.near = pose.near;
    camera.far = pose.far;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // 빛 방향(세계) → 화면 좌표계: 카메라 역행렬의 회전 부분만 곱한다
    const e = camera.matrixWorldInverse.elements;
    const [lx, ly, lz] = BENCH_LIGHT;
    lightView
      .set(
        (e[0] ?? 0) * lx + (e[4] ?? 0) * ly + (e[8] ?? 0) * lz,
        (e[1] ?? 0) * lx + (e[5] ?? 0) * ly + (e[9] ?? 0) * lz,
        (e[2] ?? 0) * lx + (e[6] ?? 0) * ly + (e[10] ?? 0) * lz,
      )
      .normalize();
  };
  update(0);

  return {
    scene,
    camera,
    update,
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      scene.clear();
    },
  };
}
