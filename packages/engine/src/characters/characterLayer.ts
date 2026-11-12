// 2차맵 캐릭터 층 — 외형이 붙은 유닛을 가까우면 로우폴리 모델로 그린다. docs/adr/2026-11-11-character-3d.md 4절.
// - 프레임마다: 외형이 있는 유닛 가운데 화면 안·가시거리 안인 것을 가까운 차례로 상한까지 고른다. 고른 유닛은 캡슐 대신 모델로 그리고
//   (drawn[칸] = 1 가까운 단계, 2 먼 단계 — 유닛 그림 unitView.ts가 그 칸의 캡슐을 건너뛴다), 나머지는 지금처럼 캡슐이다.
// - 단계: 점(아이콘) 표현이면 모델 없음. 키 1.8m가 화면 MODEL_MIN_PX보다 작으면 모델 없음(돌아올 때는 MODEL_RETURN_PX — 깜박임 방지).
//   키가 LOD0_MIN_PX 이상이고 가까운 차례로 LOD0 상한 안이면 가까운 단계(자세한 모델), 아니면 먼 단계.
// - 상한은 가시거리 단계(render/viewDistance.ts, 프레임 시간 여유로 자동)에 묶는다(CHARACTER_BUDGETS).
// - 방향·걸음: 유닛 자리의 프레임 사이 변화로 정한다(걷는 유닛만 팔다리를 흔든다. 서 있으면 멈춘 자세 — 그리기를 쉬는 규칙을 지킨다).
// - 메시는 도형마다 하나다(characterMeshes.ts). 유닛이 1,000개여도 그리기 호출은 늘지 않는다.
// 바뀜(2026-11-12, 사용자 지적 "큰 유닛들은 캐릭터가 없는 문제" — ADR "바뀜 (2026-11-12, 유닛 겉모습)"): 유닛마다 배율(큰 유닛은 키에 맞춰 늘린
// 캐릭터)과 사람꼴이 아닌 몸(짐승·탈것, unitBodies.ts)도 받는다. 같은 조각·같은 메시라 그리기 호출은 그대로다. 탈것은 걷는 자세가 없다.
import { type CharacterLook, isCharacterLook } from "@terra/shared/characterLook";
import { type Frustum, Sphere } from "three";
import { CharacterCache, type CharacterPose, type CompiledCharacter, REST_POSE } from "./characterCompile.ts";
import { CharacterMeshes } from "./characterMeshes.ts";
import { UNIT_BODY_KINDS, type UnitBody, isRigidBody } from "./unitBodies.ts";

/** 가시거리 단계 하나의 캐릭터 상한: 화면 가운데 땅에서 모델을 그리는 거리(m), 모델 수, 가까운 단계(LOD0) 수 */
export interface CharacterBudget {
  readonly reachM: number;
  readonly maxModels: number;
  readonly maxLod0: number;
}

/** 가시거리 단계(0~4)마다. 가장 나쁜 경우 삼각형 = 32 × 600 + 96 × 150 = 33,600 */
export const CHARACTER_BUDGETS: readonly CharacterBudget[] = [
  { reachM: 60, maxModels: 32, maxLod0: 8 },
  { reachM: 80, maxModels: 48, maxLod0: 12 },
  { reachM: 110, maxModels: 64, maxLod0: 16 },
  { reachM: 140, maxModels: 96, maxLod0: 24 },
  { reachM: 180, maxModels: 128, maxLod0: 32 },
];

/** 기준 유닛 키(m) — 아이콘 전환과 같은 기준 */
const REFERENCE_HEIGHT_M = 1.8;
/** 모델로 그리는 가장 작은 화면 키(CSS px)와 캡슐에서 돌아올 때의 키 */
export const MODEL_MIN_PX = 9;
export const MODEL_RETURN_PX = 10;
/** 가까운 단계(LOD0)로 그리는 가장 작은 화면 키(CSS px) */
export const LOD0_MIN_PX = 28;
/** 모델로 그린 유닛의 몸 위 누르기 반 너비(m) — 팔까지의 보통 폭(캡슐 반지름 0.3m보다 넓다) */
export const CHARACTER_PICK_HALF_WIDTH_M = 0.45;
/** 화면 밖 거르기 경계 구 반지름(m): 키·팔·등 장식을 넉넉히. 사람꼴이 아닌 몸(탈것 — 길다)은 BODY_CULL_FACTOR배 */
const CULL_RADIUS_M = 1.4;
const BODY_CULL_FACTOR = 4.5;
/** 걸음 한 바퀴(두 걸음)의 길이(m)와 다리 흔들림 크기(라디안)·몸 위아래(m) */
const STRIDE_M = 1.5;
const SWING_RAD = 0.6;
const BOB_M = 0.035;
/** 방향을 돌리는 빠르기(ms, 지수 감쇠 시간) */
const TURN_SMOOTH_MS = 90;
/** 처음 방향: 화면 쪽(남쪽, +z) */
const DEFAULT_YAW = 0;

/** 유닛 하나의 모델: 사람꼴 외형(look) 또는 사람꼴이 아닌 몸(body — 있으면 이것), 배율(없으면 1 — 모델 그대로) */
export interface UnitModel {
  readonly id: number;
  readonly look?: CharacterLook | undefined;
  readonly body?: UnitBody | undefined;
  readonly scale?: number | undefined;
}

/** 배율 범위(키 12m 유닛 = 사람 모델 약 7배) */
const MIN_SCALE = 0.25;
const MAX_SCALE = 10;

/** 층이 칸마다 들고 있는 모델 값(외형·몸 가운데 하나) */
interface SlotModel {
  readonly look: CharacterLook | null;
  readonly body: UnitBody | null;
  readonly scale: number;
  readonly rigid: boolean;
}

/** 받은 모델을 다시 본다(맞지 않는 외형·몸·배율은 버린다) */
function slotModelOf(model: UnitModel): SlotModel | null {
  const raw = model.scale ?? 1;
  const scale = Number.isFinite(raw) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw)) : 1;
  const body = model.body;
  if (body && UNIT_BODY_KINDS.includes(body.kind) && Number.isFinite(body.seed))
    return { look: null, body, scale, rigid: isRigidBody(body.kind) };
  if (body === undefined && isCharacterLook(model.look))
    return { look: model.look, body: null, scale, rigid: false };
  return null;
}

/** 층이 프레임마다 읽는 유닛 값(유닛 명단·움직임 저장소) */
export interface CharacterLayerView {
  /** 유닛 칸 수와 칸마다 자리(배치 칸)·가는 중인지 */
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly moving: Uint8Array;
  readonly cellM: number;
  readonly groundAt: (wx: number, wz: number) => number;
  readonly frustum: Frustum;
  /** 화면 가운데 땅(카메라 목표점, m) */
  readonly targetX: number;
  readonly targetZ: number;
  /** 목표점에서 1m의 CSS 픽셀 */
  readonly pixelsPerMetre: number;
  /** 유닛 표현 단계가 점(아이콘)인가 */
  readonly icons: boolean;
  /** 가시거리 단계 번호(0부터) */
  readonly level: number;
  /** 지난 프레임부터 흐른 시간(ms, 방향 돌리기) */
  readonly deltaMs: number;
}

export class CharacterLayer {
  private readonly meshes = new CharacterMeshes();
  readonly group = this.meshes.group;
  /** 칸마다 이번 프레임에 모델로 그렸는가(0 = 아님, 1 = 가까운 단계, 2 = 먼 단계) */
  readonly drawn: Uint8Array;
  /** 마지막 프레임에 그린 모델 수·가까운 단계 수 */
  models = 0;
  lod0 = 0;
  private readonly capacity: number;
  private readonly cache = new CharacterCache();
  private looks = new Map<number, SlotModel>();
  /** 칸마다 모델 값(없으면 null)과 그 유닛 ID */
  private slotLooks: (SlotModel | null)[] = [];
  private slotIds: (number | null)[] = [];
  private bound = 0;
  private anyLook = false;
  /** 칸마다 방향(라디안)·걸음 위상·지난 자리(배치 칸, NaN = 모름) */
  private readonly yaw: Float32Array;
  private readonly phase: Float32Array;
  private readonly lastX: Float32Array;
  private readonly lastY: Float32Array;
  /** 고르기 버퍼: 후보 칸과 거리² */
  private readonly candidates: Int32Array;
  private readonly distance2: Float32Array;
  private candidateCount = 0;
  private active = false;
  private readonly sphere = new Sphere();
  private readonly root = new Float32Array(16);
  /** 걷는 자세(프레임마다 객체를 만들지 않게 다시 쓴다) */
  private readonly pose = { swing: 0, bob: 0 };

  constructor(capacity: number) {
    this.capacity = capacity;
    this.drawn = new Uint8Array(capacity);
    this.yaw = new Float32Array(capacity);
    this.phase = new Float32Array(capacity);
    this.lastX = new Float32Array(capacity).fill(Number.NaN);
    this.lastY = new Float32Array(capacity).fill(Number.NaN);
    this.candidates = new Int32Array(capacity);
    this.distance2 = new Float32Array(capacity);
    this.root[15] = 1;
    this.root[5] = 1;
  }

  /** 유닛 모델 목록을 통째로 바꾼다(유닛 ID → 외형·몸·배율). 맞지 않는 것은 버린다. 그 뒤 bind를 다시 부른다 */
  setLooks(models: readonly UnitModel[]): void {
    const next = new Map<number, SlotModel>();
    for (const model of models) {
      const slot = slotModelOf(model);
      if (slot) next.set(model.id, slot);
    }
    this.looks = next;
  }

  /** 유닛 명단이 바뀌었을 때: 칸 ↔ 유닛 ID를 다시 잇는다. 방향·걸음은 유닛 ID로 이어 간다 */
  bind(count: number, idAt: (slot: number) => number | null): void {
    const n = Math.min(count, this.capacity);
    const keep = new Map<number, readonly [number, number, number, number]>();
    for (let slot = 0; slot < this.bound; slot++) {
      const id = this.slotIds[slot];
      if (id === null || id === undefined || !this.slotLooks[slot]) continue;
      keep.set(id, [
        this.yaw[slot] ?? 0,
        this.phase[slot] ?? 0,
        this.lastX[slot] ?? Number.NaN,
        this.lastY[slot] ?? Number.NaN,
      ]);
    }
    this.slotLooks = [];
    this.slotIds = [];
    this.anyLook = false;
    for (let slot = 0; slot < n; slot++) {
      const id = idAt(slot);
      const look = id === null ? null : (this.looks.get(id) ?? null);
      this.slotIds.push(id);
      this.slotLooks.push(look);
      if (look) this.anyLook = true;
      const kept = id === null ? undefined : keep.get(id);
      this.yaw[slot] = kept?.[0] ?? DEFAULT_YAW;
      this.phase[slot] = kept?.[1] ?? 0;
      this.lastX[slot] = kept?.[2] ?? Number.NaN;
      this.lastY[slot] = kept?.[3] ?? Number.NaN;
    }
    this.bound = n;
  }

  /** 그 칸의 유닛에 외형이 있는가 */
  hasLook(slot: number): boolean {
    return (
      slot >= 0 && slot < this.bound && this.slotLooks[slot] !== null && this.slotLooks[slot] !== undefined
    );
  }

  /** 그 칸을 마지막 프레임에 어떻게 그렸나(0 = 모델 아님) */
  drawnAs(slot: number): number {
    return slot >= 0 && slot < this.bound ? (this.drawn[slot] ?? 0) : 0;
  }

  /** 그 칸을 모델로 그렸을 때 몸 위 누르기 반 너비(m). 모델이 아니면 0 */
  pickHalfWidth(slot: number): number {
    if (this.drawnAs(slot) === 0) return 0;
    const model = this.slotLooks[slot];
    if (!model) return 0;
    if (!model.body) return CHARACTER_PICK_HALF_WIDTH_M * model.scale;
    return this.cache.getBody(model.body, 1).halfWidthM * model.scale;
  }

  get triangles(): number {
    return this.meshes.triangles;
  }

  get drawCalls(): number {
    return this.meshes.drawCalls;
  }

  /** 지금 캐시에 든 모델 수(외형 × 단계) */
  get cached(): number {
    return this.cache.size;
  }

  setNightLift(value: number): void {
    this.meshes.setNightLift(value);
  }

  /** 한 프레임: 모델로 그릴 유닛을 고르고 인스턴스를 채운다. 유닛 그림(unitView)보다 먼저 부른다 */
  update(view: CharacterLayerView): void {
    const n = Math.min(view.count, this.bound);
    this.drawn.fill(0, 0, Math.max(n, this.bound));
    this.meshes.begin();
    this.models = 0;
    this.lod0 = 0;
    const heightPx = REFERENCE_HEIGHT_M * view.pixelsPerMetre;
    if (this.active ? heightPx < MODEL_MIN_PX : heightPx < MODEL_RETURN_PX) this.active = false;
    else this.active = true;
    if (!this.anyLook || view.icons || !this.active || n === 0) {
      this.meshes.end();
      return;
    }
    const budget = CHARACTER_BUDGETS[Math.min(CHARACTER_BUDGETS.length - 1, Math.max(0, view.level))];
    if (!budget) {
      this.meshes.end();
      return;
    }
    this.collect(view, n, budget.reachM);
    const chosen = Math.min(this.candidateCount, budget.maxModels);
    const lod0Limit = heightPx >= LOD0_MIN_PX ? budget.maxLod0 : 0;
    const turn = 1 - Math.exp(-Math.max(0, view.deltaMs) / TURN_SMOOTH_MS);
    for (let rank = 0; rank < chosen; rank++) {
      const slot = this.candidates[rank] ?? 0;
      const model = this.slotLooks[slot];
      if (!model) continue;
      const lod = rank < lod0Limit ? 0 : 1;
      const walk = this.advance(slot, view, turn, model.scale);
      const pose = model.rigid ? REST_POSE : walk;
      const wx = (view.x[slot] ?? 0) * view.cellM;
      const wz = (view.y[slot] ?? 0) * view.cellM;
      this.writeRoot(wx, view.groundAt(wx, wz), wz, this.yaw[slot] ?? 0, model.scale);
      this.meshes.add(this.compiled(model, lod), this.root, pose);
      this.drawn[slot] = lod + 1;
      if (lod === 0) this.lod0 += 1;
    }
    this.models = this.meshes.characters;
    this.meshes.end();
  }

  dispose(): void {
    this.meshes.dispose();
    this.cache.clear();
  }

  private compiled(model: SlotModel, lod: 0 | 1): CompiledCharacter {
    if (model.body) return this.cache.getBody(model.body, lod);
    if (model.look) return this.cache.get(model.look, lod);
    throw new RangeError("slot model without look or body");
  }

  /** 후보(외형 있음·가시거리 안·화면 안)를 모아 가까운 차례로 늘어놓는다 */
  private collect(view: CharacterLayerView, n: number, reachM: number): void {
    const reach2 = reachM * reachM;
    let count = 0;
    for (let slot = 0; slot < n; slot++) {
      const model = this.slotLooks[slot];
      if (!model) continue;
      const wx = (view.x[slot] ?? 0) * view.cellM;
      const wz = (view.y[slot] ?? 0) * view.cellM;
      const dx = wx - view.targetX;
      const dz = wz - view.targetZ;
      const d2 = dx * dx + dz * dz;
      if (d2 > reach2) continue;
      this.sphere.center.set(wx, view.groundAt(wx, wz) + (REFERENCE_HEIGHT_M / 2) * model.scale, wz);
      // 탈것은 사람보다 길다(차 3.6m) — 거르기 구를 넉넉히
      this.sphere.radius = CULL_RADIUS_M * model.scale * (model.body ? BODY_CULL_FACTOR : 1);
      if (!view.frustum.intersectsSphere(this.sphere)) continue;
      this.candidates[count] = slot;
      this.distance2[slot] = d2;
      count += 1;
    }
    this.candidateCount = count;
    if (count > 1) {
      const d2 = this.distance2;
      // 가까운 차례(같으면 칸 번호 차례 — 프레임마다 같은 유닛이 뽑힌다)
      this.candidates.subarray(0, count).sort((a, b) => (d2[a] ?? 0) - (d2[b] ?? 0) || a - b);
    }
  }

  /** 방향·걸음을 한 프레임 나아가게 하고 자세를 돌려준다(배율이 크면 걸음도 길다) */
  private advance(slot: number, view: CharacterLayerView, turn: number, scale: number): CharacterPose {
    const x = view.x[slot] ?? 0;
    const y = view.y[slot] ?? 0;
    const px = this.lastX[slot] ?? Number.NaN;
    const py = this.lastY[slot] ?? Number.NaN;
    this.lastX[slot] = x;
    this.lastY[slot] = y;
    if (view.moving[slot] !== 1) {
      this.phase[slot] = 0;
      return REST_POSE;
    }
    if (!Number.isNaN(px) && !Number.isNaN(py)) {
      const dx = (x - px) * view.cellM;
      const dz = (y - py) * view.cellM;
      const step = Math.hypot(dx, dz);
      // 한 프레임에 아주 멀리 갔으면(명단 다시 넣기·순간 이동) 방향·걸음에 넣지 않는다
      if (step > 1e-4 && step < 8) {
        const want = Math.atan2(dx, dz);
        const current = this.yaw[slot] ?? 0;
        let diff = want - current;
        diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2;
        this.yaw[slot] = current + diff * turn;
        this.phase[slot] =
          ((this.phase[slot] ?? 0) + (step / (STRIDE_M * scale)) * Math.PI * 2) % (Math.PI * 2);
      }
    }
    const phase = this.phase[slot] ?? 0;
    this.pose.swing = Math.sin(phase) * SWING_RAD;
    this.pose.bob = Math.abs(Math.sin(phase)) * BOB_M;
    return this.pose;
  }

  /** 뿌리 행렬(세로축 돌림 · 고른 배율 + 자리, 열 우선) */
  private writeRoot(x: number, y: number, z: number, yaw: number, scale: number): void {
    const c = Math.cos(yaw) * scale;
    const s = Math.sin(yaw) * scale;
    const m = this.root;
    m[0] = c;
    m[2] = -s;
    m[5] = scale;
    m[8] = s;
    m[10] = c;
    m[12] = x;
    m[13] = y;
    m[14] = z;
  }
}
