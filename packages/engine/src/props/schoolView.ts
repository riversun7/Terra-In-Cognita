// 움직이는 어군(물고기 떼·고래 무리) 그리기 — 기획 D-536 "심해는 배로 이동하여 어군같이 물고기떼". 서버 채집 오브젝트(gather_objects
// source "school")의 길을 받아 프레임마다 @terra/shared/fishSchool schoolPosition(서버와 같은 함수)으로 자리를 내고, 떼 하나를 물고기 몸
// 여럿으로 그린다. 몸 = 늘인 팔면체 하나(삼각형 8)라 InstancedMesh 하나(그리기 호출 1번)에 모든 떼가 든다.
// - 자리 = 길 위 지금 자리(서버 시각) + 떼 안 물고기마다 작은 원 둘레(시간에 따라 돈다). 높이 = 수면(물 위 소품과 같은 surfaceAt).
// - 가까이(화면 1m에 SCHOOL_MIN_PX_PER_M 화소 이상)에서만 그린다. 그릴 때는 프레임마다 다시 그려야 해서 update가 true를 낸다.
// 장식이라 Math를 써도 된다(판정은 서버가 정수 함수로 한다).
import { MAP_PROP_ARTS } from "@terra/shared";
import { SCHOOL_POSITION_SCALE, type SchoolRoute, schoolPosition } from "@terra/shared/fishSchool";
import {
  Color,
  type Frustum,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  Sphere,
  Vector3,
} from "three";

/** 어군 하나(엔진 입력): 그림 번호(@terra/shared MAP_PROP_ARTS)와 길 */
export interface SchoolInput extends SchoolRoute {
  readonly id: number;
  readonly art: number;
}

/** 떼 모양: 몸 수·몸 길이(m)·떼 반지름(m)·색 */
interface SchoolLook {
  readonly count: number;
  readonly lengthM: number;
  readonly radiusM: number;
  readonly color: Color;
}

const LOOKS: Readonly<Record<string, SchoolLook>> = {
  fish_school: { count: 9, lengthM: 0.7, radiusM: 2.2, color: new Color(0.62, 0.7, 0.78) },
  fish_school_big: { count: 12, lengthM: 1.4, radiusM: 4, color: new Color(0.42, 0.5, 0.62) },
  whale_pod: { count: 3, lengthM: 9, radiusM: 9, color: new Color(0.26, 0.3, 0.36) },
};

/** 이보다 멀리(화면 1m가 이 화소 아래)서는 그리지 않는다 */
export const SCHOOL_MIN_PX_PER_M = 1.2;
/** 한 번에 그리는 몸 상한 */
const MAX_FISH = 1_024;
/** 떼가 도는 빠르기(라디안 ÷ 초) */
const SWIRL_PER_S = 0.6;

export class SchoolView {
  readonly mesh: InstancedMesh;
  private schools: readonly SchoolInput[] = [];
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly bounds = new Sphere();
  private drawnSchools = 0;

  constructor() {
    // 몸: 앞뒤로 늘인 팔면체(x축이 앞)
    const body = new OctahedronGeometry(0.5, 0).scale(1, 0.32, 0.26);
    this.mesh = new InstancedMesh(body, new MeshLambertMaterial(), MAX_FISH);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** 그린 떼 수(HUD·시험) */
  get drawn(): number {
    return this.mesh.visible ? this.drawnSchools : 0;
  }

  set(schools: readonly SchoolInput[]): void {
    this.schools = schools.filter((school) => LOOKS[MAP_PROP_ARTS[school.art] ?? ""] !== undefined);
    if (this.schools.length === 0) {
      this.mesh.count = 0;
      this.mesh.visible = false;
    }
  }

  /**
   * 프레임마다: 서버 시각 nowMs, 배치 칸 크기(m), 수면 높이, 보는 절두체, 화면 1m 화소. 그렸으면 true(다음 프레임도 그려야 움직인다)
   */
  update(
    nowMs: number,
    cellM: number,
    surfaceAt: (x: number, z: number) => number,
    frustum: Frustum,
    pixelsPerMetre: number,
  ): boolean {
    if (this.schools.length === 0 || pixelsPerMetre < SCHOOL_MIN_PX_PER_M) {
      this.mesh.visible = false;
      this.drawnSchools = 0;
      return false;
    }
    let index = 0;
    let shown = 0;
    const seconds = nowMs / 1000;
    for (const school of this.schools) {
      const look = LOOKS[MAP_PROP_ARTS[school.art] ?? ""];
      if (!look) continue;
      const here = schoolPosition(school, nowMs);
      const ahead = schoolPosition(school, nowMs + 1500);
      const x = (here.x / SCHOOL_POSITION_SCALE + 0.5) * cellM;
      const z = (here.y / SCHOOL_POSITION_SCALE + 0.5) * cellM;
      const base = surfaceAt(x, z);
      // 절두체 밖이면(떼 반지름만큼 넉넉히) 건너뛴다
      this.bounds.center.set(x, base, z);
      this.bounds.radius = look.radiusM + look.lengthM;
      if (!frustum.intersectsSphere(this.bounds)) continue;
      const heading = Math.atan2(-(ahead.y - here.y), ahead.x - here.x);
      shown += 1;
      for (let k = 0; k < look.count && index < MAX_FISH; k++) {
        const phase = (k * Math.PI * 2) / look.count + seconds * SWIRL_PER_S * (k % 2 === 0 ? 1 : -1);
        const ring = look.radiusM * (0.35 + 0.65 * (((k * 7) % look.count) / look.count));
        const fx = x + Math.cos(phase) * ring;
        const fz = z + Math.sin(phase) * ring;
        // 등이 수면에 살짝 보이게(고래는 천천히 오르내린다)
        const bob = Math.sin(seconds * 1.7 + k) * look.lengthM * 0.05;
        this.position.set(fx, Math.max(base, surfaceAt(fx, fz)) - look.lengthM * 0.04 + bob, fz);
        this.rotation.setFromAxisAngle(this.up, heading + Math.sin(seconds * 2 + k) * 0.25);
        const s = look.lengthM * (0.8 + 0.4 * (((k * 5) % look.count) / look.count));
        this.scale.set(s, s, s);
        this.matrix.compose(this.position, this.rotation, this.scale);
        this.mesh.setMatrixAt(index, this.matrix);
        this.mesh.setColorAt(index, look.color);
        index += 1;
      }
    }
    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = index > 0;
    this.drawnSchools = shown;
    return index > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    if (!Array.isArray(this.mesh.material)) this.mesh.material.dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
