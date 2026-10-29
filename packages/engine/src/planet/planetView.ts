// 1차맵 장면 — three.js 물체를 만들고 놓는다(타일 메시, 바탕 구, 대기 띠, 카메라).
// 카메라 기준 좌표(ADR 36, PLAN 5.7): three 카메라는 원점에 두고 회전만 준다. 타일은 position = 타일 원점 − 카메라 위치(실수 64비트로 뺀다).
// three는 모델뷰 = 보기 회전 × 이동을 실수 64비트(JS 수)로 곱한 뒤 32비트로 올린다 → 가까운 타일의 이동 값이 작아 떨림이 없다.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type ShaderMaterial,
  Sphere,
  SphereGeometry,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from "three";
import { cameraRelative } from "./cameraRelative.ts";
import type { GlobePose } from "./globeCamera.ts";
import {
  DEBUG_CRACK_COLOR,
  type SharedTileUniforms,
  createAtmosphereMaterial,
  createBaseGlobeMaterial,
  createCellTexture,
  createSharedTileUniforms,
  createTileMaterial,
} from "./planetMaterials.ts";
import type { PickedCell } from "./planetTypes.ts";
import { type TileMeshArrays, tileGpuBytes, tileIndices } from "./tileMesh.ts";
import type { GpuTile } from "./tilePipeline.ts";
import { tileShape } from "./tileShape.ts";
import { type TileNode, nodeSTRange } from "./tileTree.ts";
import { type Vec3, dot } from "./vec3.ts";

/** 우주(행성 밖) 색 — 세계 색은 화면 테마와 상관없다(D-070). 달은 켜지는 동안 이 색에서 나타난다 */
export const SPACE_COLOR = 0x1e2a4a;
/** 바탕 구는 해수면보다 이만큼 아래(타일이 있으면 늘 가린다) */
const BASE_GLOBE_DEPTH_M = 1500;
/** 대기 띠 두께(반지름 비). 달 보임 판정은 이 원판을 행성으로 본다(띠 바깥쪽은 거의 불투명하게 빛난다) */
export const ATMOSPHERE_SCALE = 1.018;

/**
 * 숨긴 채 만든 하늘 물체(달·구름)의 셰이더를 미리 컴파일한다(처음 보일 때 멈칫하지 않게). three 0.186.1 compile은 숨긴 메시의
 * 재질도 모은다. 병렬 컴파일 확장(KHR_parallel_shader_compile)이 있으면 기다리지 않고, 없으면 바로 컴파일한다
 * (없을 때 compileAsync는 콘솔 경고를 남긴다 — 헤드리스 SwiftShader에서 확인)
 */
export function precompile(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
  if (renderer.extensions.has("KHR_parallel_shader_compile")) {
    renderer.compileAsync(scene, camera).catch(() => undefined);
  } else {
    renderer.compile(scene, camera);
  }
}

export interface PlanetTileGpu extends GpuTile {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly origin: Vec3;
}

export class PlanetView {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly shared: SharedTileUniforms;
  private readonly tiles = new Group();
  private readonly baseGlobe: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly atmosphere: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly index: BufferAttribute;
  /**
   * 함께 쓰는 인덱스를 들고 있는 보이지 않는 메시. 타일 지오메트리는 버리기 전에 인덱스를 뗀다(three는 지오메트리를 버릴 때
   * 그 인덱스 버퍼도 지운다). 이 메시는 늘 장면에 있어 three가 알고 있으므로, 화면을 닫을 때 이것을 버리면 인덱스 버퍼가 지워진다.
   */
  private readonly indexKeeper: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly debug: boolean;
  private readonly radiusM: number;
  private readonly basis = new Matrix4();
  private readonly shown = new Set<PlanetTileGpu>();

  /** skirtDepthM = 치마 바닥 깊이(tileShape.ts skirtDepthM, 모든 타일이 같이 쓴다) */
  constructor(
    radiusM: number,
    biomeColors: readonly number[],
    fovRad: number,
    skirtDepthM: number,
    debugCracks: boolean,
  ) {
    this.radiusM = radiusM;
    this.debug = debugCracks;
    this.scene.background = new Color(debugCracks ? DEBUG_CRACK_COLOR : SPACE_COLOR);
    this.camera = new PerspectiveCamera((fovRad * 180) / Math.PI, 1, 1, 10);
    this.camera.matrixAutoUpdate = true;
    this.shared = createSharedTileUniforms(biomeColors, skirtDepthM);
    this.index = new BufferAttribute(tileIndices(32), 1);
    const keeperGeometry = new BufferGeometry();
    keeperGeometry.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
    keeperGeometry.setIndex(this.index);
    this.indexKeeper = new Mesh(keeperGeometry, new MeshBasicMaterial({ visible: false }));
    this.indexKeeper.frustumCulled = false;
    this.baseGlobe = new Mesh(
      new SphereGeometry(radiusM - BASE_GLOBE_DEPTH_M, 96, 48),
      createBaseGlobeMaterial(this.shared, debugCracks),
    );
    this.baseGlobe.frustumCulled = false;
    this.atmosphere = new Mesh(
      new SphereGeometry(radiusM * ATMOSPHERE_SCALE, 96, 48),
      createAtmosphereMaterial(),
    );
    this.atmosphere.frustumCulled = false;
    this.atmosphere.visible = !debugCracks;
    // 그리는 차례: 타일(가까운 것 먼저) → 바탕 구 → 대기 띠(투명)
    this.baseGlobe.renderOrder = 1_000_000;
    this.scene.add(this.tiles, this.baseGlobe, this.atmosphere, this.indexKeeper);
  }

  /** 카메라: 원점에 두고 회전만. near·far는 엔진이 정한다 */
  applyCamera(pose: GlobePose, aspect: number, near: number, far: number): void {
    const camera = this.camera;
    camera.position.set(0, 0, 0);
    this.basis.makeBasis(
      new Vector3(pose.right[0], pose.right[1], pose.right[2]),
      new Vector3(pose.up[0], pose.up[1], pose.up[2]),
      new Vector3(pose.back[0], pose.back[1], pose.back[2]),
    );
    camera.quaternion.setFromRotationMatrix(this.basis);
    camera.aspect = aspect;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    // 바탕 구·대기 띠의 원점 = 행성 중심
    const center = cameraRelative([0, 0, 0], pose.position);
    this.baseGlobe.position.set(center[0], center[1], center[2]);
    this.atmosphere.position.set(center[0], center[1], center[2]);
  }

  /** 대기 띠를 보일지(가까우면 끈다) */
  setAtmosphere(visible: boolean): void {
    this.atmosphere.visible = visible && !this.debug;
  }

  /**
   * 하늘 빛(프레임마다 한 번, ADR 2026-10-29-primary-map-sky 4절): blend 0 = 지금 빛(카메라), 1 = 항성 낮밤, 사이 = 켜지는 중.
   * sun = 항성 방향(행성 좌표, 단위), strength = 낮밤 세기. 보기 공간 방향 = 카메라 축(오른쪽·위·뒤)과의 내적(카메라는 회전만 있다).
   * 틈 찾기는 늘 지금 빛이다.
   */
  setSkyLight(blend: number, sun: Vec3, strength: number, pose: GlobePose): void {
    const u = this.shared;
    u.uSkyBlend.value = this.debug ? 0 : blend;
    u.uSunDir.value.set(sun[0], sun[1], sun[2]);
    u.uSunDirView.value.set(dot(sun, pose.right), dot(sun, pose.up), dot(sun, pose.back));
    u.uNight.value.w = this.debug ? 0 : strength;
  }

  /** 그릴 타일을 놓는다(나머지는 숨긴다). order = 가까운 것 먼저 */
  showTiles(tiles: readonly PlanetTileGpu[], cameraPosition: Vec3): void {
    for (const gpu of this.shown) gpu.mesh.visible = false;
    this.shown.clear();
    tiles.forEach((gpu, order) => {
      const relative = cameraRelative(gpu.origin, cameraPosition);
      gpu.mesh.position.set(relative[0], relative[1], relative[2]);
      gpu.mesh.renderOrder = order;
      gpu.mesh.visible = true;
      this.shown.add(gpu);
    });
  }

  /** 고도 과장(셰이더 uniform 하나). 치마 바닥은 과장과 상관없어 타일마다 고칠 것이 없다 */
  setExaggeration(value: number): void {
    this.shared.uExaggeration.value = value;
  }

  setLayer(layer: "terrain" | "climate"): void {
    this.shared.uLayer.value = layer === "climate" ? 1 : 0;
  }

  /** 고른 칸 표시(없으면 지운다) */
  setPick(cell: PickedCell | null): void {
    if (!cell) {
      this.shared.uPick.value.set(0, 0, 0, -1);
      return;
    }
    const n = 2 ** cell.mapLevel;
    this.shared.uPick.value.set(cell.i / n, cell.j / n, 1 / n, cell.face);
  }

  createTile(mesh: TileMeshArrays, node: TileNode): PlanetTileGpu {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("grad", new BufferAttribute(mesh.grads, 3));
    geometry.setAttribute("hs", new BufferAttribute(mesh.heights, 2));
    geometry.setAttribute("uv", new BufferAttribute(mesh.uvs, 2, true));
    // 인덱스는 모든 타일이 하나를 함께 쓴다(GPU 버퍼 하나). 32마디가 아니면(큰 타일) 따로 만든다
    geometry.setIndex(mesh.segments === 32 ? this.index : new BufferAttribute(tileIndices(mesh.segments), 1));
    const shape = tileShape(node, this.radiusM);
    geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), shape.angularRadius * this.radiusM * 1.5);
    const cellTexture = createCellTexture(mesh.cellData, mesh.cells, 4);
    const extraTexture = createCellTexture(mesh.cellExtra, mesh.cells, 2);
    const { s0, t0, span } = nodeSTRange(node);
    const material = createTileMaterial(this.shared, cellTexture, extraTexture, mesh.cells, mesh.origin, [
      s0,
      t0,
      span,
      node.face,
    ]);
    const object = new Mesh(geometry, material);
    object.frustumCulled = false;
    object.visible = false;
    object.matrixAutoUpdate = true;
    this.tiles.add(object);
    const textures: Texture[] = [cellTexture, extraTexture];
    const shared = this.index;
    const bytes = tileGpuBytes(mesh);
    const gpu: PlanetTileGpu = {
      mesh: object,
      origin: mesh.origin,
      bytes,
      // three는 올린 뒤에도 속성·텍스처 배열(= 메시 배열)을 들고 있다(컨텍스트를 잃었다가 복구되면 그것으로 다시 올린다)
      retainedBytes: bytes,
      dispose: () => {
        object.removeFromParent();
        this.shown.delete(gpu);
        // 함께 쓰는 인덱스는 떼고 버린다(지오메트리를 버리면 three가 인덱스 버퍼도 지운다)
        if (geometry.index === shared) geometry.setIndex(null);
        geometry.dispose();
        material.dispose();
        for (const texture of textures) texture.dispose();
      },
    };
    return gpu;
  }

  /** 타일은 먼저(파이프라인이) 버린다. 그다음 장면과 함께 쓰는 자원을 버린다 */
  dispose(): void {
    this.scene.clear();
    this.indexKeeper.geometry.dispose();
    this.indexKeeper.material.dispose();
    this.baseGlobe.geometry.dispose();
    this.baseGlobe.material.dispose();
    this.atmosphere.geometry.dispose();
    this.atmosphere.material.dispose();
    this.shared.uPalette.value.dispose();
  }
}
