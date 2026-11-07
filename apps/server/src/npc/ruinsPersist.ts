// 폐허·복원 사업의 바뀜 저장(NPC 사회 런타임 persist.ts가 만든다) — docs/adr/2026-11-07-ruins-restoration.md
// 거울 세계의 폐허(world.ruins)를 마지막으로 저장한 모습과 견줘 바뀐 것만 쓰기 대기열에 넣는다(동기). NPC 처리 뒤 persist.flush가 부르고,
// 유저 명령(정부 짓기·모금 열기·넣기)은 명령과 같은 동기 처리에서 바로 부른다(원장 거래와 같은 쓰기 묶음 = 같은 커밋, S3 U2).
// - 폐허가 사라졌고 같은 ID 도시가 있으면 복원이다: 도시 행을 먼저 쓰고(saveCity, 자리의 세운 시각 = 복원 시각) 무너지기 전 이름을 되찾고
//   (기획 답 552 다, 폐허 줄의 name → world_cities.name — 이름이 없던 폐허는 지금 주인이 따르는 나라 목록에서, 601 나) 낸 값·폐허 줄을 지운다.
// - 폐허 줄에는 무너지기 전 도시 이름(자리 places의 name)을 남긴다.
// - 세력은 세력 행 ID로 적는다(rowOf). 자리가 없는 폐허(띄우지 않은 2차맵)는 쓰지 않는다.
import type { SimRuin, SimWorld } from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { CityPlace } from "./persist.ts";

export interface RuinsPersist {
  /** 지금 모습을 저장한 모습으로 친다(부팅 때 DB에서 읽은 그대로) */
  markSaved(): void;
  /** 바뀐 폐허·낸 값·복원한 도시 행을 쓰기 대기열에 넣는다. 쓴 행 수 */
  flush(nowMs: number): number;
}

export interface RuinsPersistOptions {
  readonly world: SimWorld;
  readonly writer: WorldWriter;
  readonly places: Map<number, CityPlace>;
  readonly rowOf: ReadonlyMap<number, number>;
  /** 도시 행 하나를 쓴다(바뀌었을 때만, persist.ts). 쓴 행 수 */
  readonly saveCity: (cityId: number) => number;
  /** 이름 없는 도시에 주인이 따르는 나라 목록의 이름을 붙인다(기획 답 601 나, persist.ts — 다음 saveCity가 이름 칸도 쓴다) */
  readonly nameCity?: ((cityId: number) => void) | undefined;
}

const sigOf = (ruin: SimRuin): string =>
  JSON.stringify([
    ruin.formerOwner,
    ruin.ruinedAtMs,
    ruin.housing,
    ruin.claimant,
    ruin.joinFaction,
    ruin.claimedAtMs,
    ruin.building,
    String(ruin.goal),
    ruin.currency,
    ruin.open,
    ruin.deadlineMs,
  ]);

export function createRuinsPersist(o: RuinsPersistOptions): RuinsPersist {
  const { world, writer, places } = o;
  const saved = new Map<number, string>();
  const savedPaid = new Map<number, Map<number, bigint>>();

  const ruinRow = (ruin: SimRuin, place: CityPlace) => {
    const claimed = ruin.claimant !== null && ruin.joinFaction !== null;
    return {
      id: ruin.id,
      planet_id: place.planetId,
      map_key: place.mapKey,
      cell_x: place.cellX,
      cell_y: place.cellY,
      former_faction_id: o.rowOf.get(ruin.formerOwner) ?? null,
      ruined_at_ms: ruin.ruinedAtMs,
      housing: ruin.housing,
      claimant_owner_id: claimed ? ruin.claimant : null,
      join_faction_id: claimed ? (o.rowOf.get(ruin.joinFaction ?? -1) ?? null) : null,
      claimed_at_ms: claimed ? ruin.claimedAtMs : null,
      government_building_id: claimed ? ruin.building : null,
      goal: claimed ? ruin.goal : null,
      currency: claimed ? ruin.currency : null,
      open: claimed && ruin.open,
      deadline_ms: claimed && ruin.deadlineMs > 0 ? ruin.deadlineMs : null,
      name: place.name ?? null,
    };
  };

  return {
    markSaved() {
      for (const ruin of world.ruins.values()) {
        saved.set(ruin.id, sigOf(ruin));
        savedPaid.set(ruin.id, new Map(ruin.contributions));
      }
    },
    flush(nowMs) {
      let rows = 0;
      for (const ruin of [...world.ruins.values()].toSorted((a, b) => a.id - b.id)) {
        const place = places.get(ruin.id);
        if (!place) continue;
        const row = ruinRow(ruin, place);
        // 도시가 드는 세력의 행을 아직 모르면(예비 행을 늦게 넣는 중) 다음 저장에 쓴다
        if (ruin.joinFaction !== null && row.join_faction_id === null) continue;
        const sig = sigOf(ruin);
        if (saved.get(ruin.id) !== sig) {
          writer.upsert("ruins", row);
          saved.set(ruin.id, sig);
          rows += 1;
        }
        const before = savedPaid.get(ruin.id) ?? new Map<number, bigint>();
        for (const [owner, amount] of ruin.contributions) {
          if (before.get(owner) === amount) continue;
          writer.upsert("restorationContributions", { ruin_id: ruin.id, owner_id: owner, amount });
          rows += 1;
        }
        for (const owner of before.keys()) {
          if (ruin.contributions.has(owner)) continue;
          writer.remove("restorationContributions", { ruin_id: ruin.id, owner_id: owner });
          rows += 1;
        }
        savedPaid.set(ruin.id, new Map(ruin.contributions));
      }
      // Map을 돌면서 지금 항목을 지워도 된다(남은 항목은 그대로 돈다)
      for (const id of saved.keys()) {
        if (world.ruins.has(id)) continue;
        // 복원: 도시 행을 먼저(쓰기 대기열은 고치기 → 지우기 차례), 세운 시각 = 복원 시각
        if (world.cities.has(id)) {
          const place = places.get(id);
          if (place) places.set(id, { ...place, foundedAtMs: nowMs });
          // 이름이 없던 도시는 지금 주인이 따르는 나라 목록에서 새 이름(601 나 — saveCity가 함께 쓴다)
          if (place?.name === undefined) o.nameCity?.(id);
          rows += o.saveCity(id);
          // 무너지기 전 이름을 되찾는다(552 다)
          if (place?.name !== undefined) {
            writer.upsert("cityNames", { id, name: place.name });
            rows += 1;
          }
        }
        for (const owner of savedPaid.get(id)?.keys() ?? []) {
          writer.remove("restorationContributions", { ruin_id: id, owner_id: owner });
          rows += 1;
        }
        writer.remove("ruins", { id });
        saved.delete(id);
        savedPaid.delete(id);
        rows += 1;
      }
      return rows;
    },
  };
}
