// 건물 그리기 — S1 임시 도형(상자) 인스턴싱. 바닥 모양은 footprint.ts(직사각형, 90° 회전).
// 비탈에 놓이면 상자 밑을 가장 낮은 모서리보다 조금 아래까지 내린다(떠 보이지 않게). 앞면에 문(짙은 작은 상자)을 붙여 회전을 보인다.
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial } from "three";
import { type BuildingFootprint, footprintRect, frontDirection } from "./footprint.ts";

const DEFAULT_COLOR = 0xf3e3c3;
const DOOR_COLOR = 0x5b4636;
/** 문 크기(m) */
const DOOR_WIDTH_M = 1.6;
const DOOR_HEIGHT_M = 2.2;
const DOOR_DEPTH_M = 0.3;
/** 비탈에서 상자를 땅속으로 더 내리는 깊이(m) */
const SINK_M = 0.5;

export class BuildingView {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshLambertMaterial({ color: 0xffffff });
  private readonly doorMaterial = new MeshLambertMaterial({ color: DOOR_COLOR });
  private boxes: InstancedMesh | null = null;
  private doors: InstancedMesh | null = null;

  /** 건물 목록을 통째로 바꾼다(정적이라 행렬은 이때 한 번만 쓴다) */
  set(
    buildings: readonly BuildingFootprint[],
    cellM: number,
    groundAt: (wx: number, wz: number) => number,
  ): void {
    this.clear();
    if (buildings.length === 0) return;
    const boxes = new InstancedMesh(this.geometry, this.material, buildings.length);
    const doors = new InstancedMesh(this.geometry, this.doorMaterial, buildings.length);
    const matrix = new Matrix4();
    const color = new Color();
    buildings.forEach((building, index) => {
      const rect = footprintRect(building);
      const x0 = rect.x0 * cellM;
      const z0 = rect.y0 * cellM;
      const x1 = rect.x1 * cellM;
      const z1 = rect.y1 * cellM;
      const corners = [groundAt(x0, z0), groundAt(x1, z0), groundAt(x0, z1), groundAt(x1, z1)];
      const low = Math.min(...corners) - SINK_M;
      const high = Math.max(...corners) + building.heightM;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      matrix.makeScale(x1 - x0, high - low, z1 - z0).setPosition(cx, (low + high) / 2, cz);
      boxes.setMatrixAt(index, matrix);
      color.setHex(building.color ?? DEFAULT_COLOR);
      boxes.setColorAt(index, color);

      // 문: 앞면 가운데, 그 면의 땅 높이에 선다
      const front = frontDirection(building.rotation);
      const halfX = (x1 - x0) / 2;
      const halfZ = (z1 - z0) / 2;
      const dx = cx + front.x * (halfX + DOOR_DEPTH_M / 2);
      const dz = cz + front.y * (halfZ + DOOR_DEPTH_M / 2);
      const doorGround = groundAt(cx + front.x * halfX, cz + front.y * halfZ);
      const alongX = front.x === 0;
      matrix
        .makeScale(alongX ? DOOR_WIDTH_M : DOOR_DEPTH_M, DOOR_HEIGHT_M, alongX ? DOOR_DEPTH_M : DOOR_WIDTH_M)
        .setPosition(dx, doorGround + DOOR_HEIGHT_M / 2, dz);
      doors.setMatrixAt(index, matrix);
    });
    boxes.instanceMatrix.needsUpdate = true;
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
    doors.instanceMatrix.needsUpdate = true;
    // 움직이지 않으므로 경계 구를 한 번 계산해 화면 밖이면 거른다
    boxes.computeBoundingSphere();
    doors.computeBoundingSphere();
    this.boxes = boxes;
    this.doors = doors;
    this.group.add(boxes, doors);
  }

  get count(): number {
    return this.boxes?.count ?? 0;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.doorMaterial.dispose();
  }

  private clear(): void {
    for (const mesh of [this.boxes, this.doors]) {
      if (!mesh) continue;
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.boxes = null;
    this.doors = null;
  }
}
