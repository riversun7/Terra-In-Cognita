// 엔진 덧그림 층 — 2차맵 엔진 장면에 붙이는 일반 층(전투 효과 등). docs/adr/2026-11-01-battle-replay.md 6절.
// 한 프레임 차례: before(시각) → 카메라·유닛 → after(보기) → 그리기. before가 true면 다음 프레임도 그린다.
// 층은 리플레이 형식을 몰라도 된다(엔진은 그릴 것만 받는다). secondMapEngine.ts가 쓴다(파일 크기를 나눈 것).
import { type Camera, type Object3D, type Scene, Vector3 } from "three";

/** after()가 받는 보기: 땅 높이·배치 칸 → 화면 좌표(CSS 픽셀) 투영 */
export interface EngineLayerView {
  /** 배치 칸 한 변(m) */
  readonly cellM: number;
  /** 목표점에서 1m의 CSS 픽셀 */
  readonly pixelsPerMetre: number;
  /** 화면 크기(CSS 픽셀) */
  readonly width: number;
  readonly height: number;
  /** 땅 높이(m, 세계 좌표 x·z) */
  groundAt(worldX: number, worldZ: number): number;
  /** 배치 칸 (x, y) 땅 위 liftM(m) 점의 화면 좌표. 카메라 뒤·너무 멀면 null(묶지 않은 함수로 넘겨도 된다) */
  readonly project: (cellX: number, cellY: number, liftM: number) => { x: number; y: number } | null;
}

export interface EngineLayer {
  /** 장면에 붙일 물체(없으면 그리지 않는 층: 시계·HTML 덧층만) */
  readonly object?: Object3D | undefined;
  /** 프레임 처음(카메라·유닛 전). 유닛 자리·카메라 목표를 여기서 바꾸면 같은 프레임에 든다. 계속 그려야 하면 true */
  before?(timeMs: number): boolean;
  /** 카메라·유닛을 맞춘 뒤, 그리기 전 */
  after?(view: EngineLayerView): void;
}

/** 엔진 상태를 읽는 보기(프레임마다 만들지 않는다: 값은 부를 때 읽는다) */
export function createLayerView(deps: {
  readonly camera: Camera;
  readonly cellM: () => number;
  readonly pixelsPerMetre: () => number;
  readonly viewport: () => { readonly width: number; readonly height: number };
  readonly groundAt: (worldX: number, worldZ: number) => number;
}): EngineLayerView {
  const point = new Vector3();
  return {
    get cellM() {
      return deps.cellM();
    },
    get pixelsPerMetre() {
      return deps.pixelsPerMetre();
    },
    get width() {
      return deps.viewport().width;
    },
    get height() {
      return deps.viewport().height;
    },
    groundAt: deps.groundAt,
    project: (cellX, cellY, liftM) => {
      const cell = deps.cellM();
      const wx = cellX * cell;
      const wz = cellY * cell;
      point.set(wx, deps.groundAt(wx, wz) + liftM, wz).project(deps.camera);
      if (point.z < -1 || point.z > 1) return null;
      const { width, height } = deps.viewport();
      return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
    },
  };
}

export class EngineLayers {
  private readonly layers: EngineLayer[] = [];
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  add(layer: EngineLayer): () => void {
    this.layers.push(layer);
    if (layer.object) this.scene.add(layer.object);
    return () => {
      const index = this.layers.indexOf(layer);
      if (index < 0) return;
      this.layers.splice(index, 1);
      layer.object?.removeFromParent();
    };
  }

  before(timeMs: number): boolean {
    let busy = false;
    for (const layer of this.layers) if (layer.before?.(timeMs)) busy = true;
    return busy;
  }

  after(view: EngineLayerView): void {
    for (const layer of this.layers) layer.after?.(view);
  }

  clear(): void {
    for (const layer of this.layers) layer.object?.removeFromParent();
    this.layers.length = 0;
  }
}
