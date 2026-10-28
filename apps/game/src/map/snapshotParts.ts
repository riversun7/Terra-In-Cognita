// 스냅샷 조각 모으기 — 순수 코드(시험 대상). 규칙은 packages/protocol secondMap.ts:
// 조각은 끊기지 않고 차례로 온다. part 0이 오면 새로 모으기 시작하고, 같은 snapshotId의 조각(0 ~ parts − 1)을 모두 받으면 적용한다.
// 조각마다 머리 정보(snapshotId·parts·rev·지형 주소)는 같다. 다르거나 차례가 어긋나면 조각이 빠진 것이다.
import type { BuildingWire, ServerMessageOf, UnitMotionWire } from "@terra/protocol";

export interface AssembledSnapshot {
  snapshotId: number;
  parts: number;
  rev: number;
  terrainUrl: string;
  units: UnitMotionWire[];
  buildings: BuildingWire[];
  /** 받은 글자 수 합(= 바이트, ASCII JSON) */
  bytes: number;
}

export type PartResult =
  | { kind: "pending" }
  | { kind: "complete"; snapshot: AssembledSnapshot }
  /** 조각이 빠졌거나 다른 스냅샷의 조각이 끼었다 — 모은 것을 버렸다 */
  | { kind: "broken" };

export interface SnapshotAssembler {
  add(part: ServerMessageOf<"map_snapshot">, size: number): PartResult;
  /** 모으는 중인가(part 0을 받았고 아직 끝나지 않음) */
  readonly active: boolean;
  reset(): void;
}

export function createSnapshotAssembler(): SnapshotAssembler {
  let current: AssembledSnapshot | null = null;
  let next = 0;
  return {
    add(part, size) {
      if (part.part === 0) {
        current = {
          snapshotId: part.snapshotId,
          parts: part.parts,
          rev: part.rev,
          terrainUrl: part.terrain.url,
          units: [],
          buildings: [],
          bytes: 0,
        };
        next = 0;
      }
      const assembly = current;
      if (
        !assembly ||
        part.part !== next ||
        part.snapshotId !== assembly.snapshotId ||
        part.parts !== assembly.parts ||
        part.rev !== assembly.rev
      ) {
        current = null;
        return { kind: "broken" };
      }
      for (const unit of part.units) assembly.units.push(unit);
      for (const building of part.buildings) assembly.buildings.push(building);
      assembly.bytes += size;
      next += 1;
      if (next < assembly.parts) return { kind: "pending" };
      current = null;
      return { kind: "complete", snapshot: assembly };
    },
    get active() {
      return current !== null;
    },
    reset() {
      current = null;
    },
  };
}
