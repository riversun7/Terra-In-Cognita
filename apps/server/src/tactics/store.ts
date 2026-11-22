// 유닛 AI 작전 저장소 — 기획 D-5039·D-5040(7항목 슬라이더 + 4프리셋, 파티 단위, NPC도 같음), 질문 2021·2023 답(encounter-4: 플레이어 유닛의
// 조우 판단 입력 = AI 작전), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (encounter-4)". 값 모양·프리셋은 @terra/shared/aiTactics.
// - 표 unit_tactics(유닛당 한 줄)를 세계가 준비된 뒤 한 번 읽어 메모리에 들고(조우 틱은 동기로 묻는다), 저장은 메모리 + 월드 쓰기 대기열.
// - 저장(프로토콜 50 unit_tactics → travel/gateway.ts): 로그인한 사용자의 판단하는 유닛(사이보그 본체·휴먼·사이보그 유닛)만. 띄운 2차맵 위 유닛과
//   좌표 유닛(띄우지 않은 2차맵) 모두.
// - [임시] 세계에는 아직 파티(분대) 묶음이 없어 유닛마다 저장한다(질문 2131). 저장한 줄이 없으면 기본 프리셋(균형 — 질문 2132).
// 세계 저장 층마다 하나(WeakMap — world/houseTies.ts와 같은 틀).
import { type AiTactics, isAiTactics } from "@terra/shared/aiTactics";
import type { TravelResultCode } from "@terra/protocol";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import {
  UNIT_KIND_CYBORG,
  UNIT_KIND_CYBORG_UNIT,
  UNIT_KIND_HUMAN,
  isGuardianUnit,
} from "../world/unitKinds.ts";

/** AI 작전을 가질 수 있는 유닛 종류(조우에서 판단하는 유닛 — travel/encounterWorld.ts DECIDER_KINDS와 같다) */
export const TACTICS_KINDS: ReadonlySet<number> = new Set([
  UNIT_KIND_CYBORG,
  UNIT_KIND_HUMAN,
  UNIT_KIND_CYBORG_UNIT,
]);

export type TacticsSetResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: TravelResultCode };

export interface UnitTacticsStore {
  /** 저장한 작전(없으면 undefined — 부르는 쪽이 기본 프리셋) */
  get(unitId: number): AiTactics | undefined;
  /** 내 유닛의 작전을 저장한다(소유·종류 검사) */
  set(userId: string, unitId: number, tactics: AiTactics): TacticsSetResult;
  /** 표를 다 읽었을 때 끝난다(시험) */
  readonly loaded: Promise<void>;
}

/** 저장소가 읽는 세계 몫(world.ts World의 일부) */
export interface TacticsWorld {
  readonly maps: ReadonlyMap<number, Pick<SecondMap, "unitInfo">>;
  readonly persistence:
    | {
        readonly pool: QueryPool;
        readonly writer: Pick<WorldWriter, "upsert">;
        readonly settlement: { findOwnerOfUser(userId: string): number | undefined };
        readonly travel: {
          coordinateUnits(ownerIds: ReadonlySet<number> | null): readonly {
            readonly unitId: number;
            readonly ownerId: number;
            readonly kind: number;
          }[];
        };
      }
    | undefined;
  readonly now: () => number;
}

const stores = new WeakMap<object, UnitTacticsStore>();

/** 세계 저장 층에 붙은 저장소(없으면 undefined) */
export function unitTacticsOf(persistence: object | undefined): UnitTacticsStore | undefined {
  return persistence ? stores.get(persistence) : undefined;
}

/** DB 한 줄 → 작전(모양이 틀리면 undefined) */
export function tacticsOfRow(row: Readonly<Record<string, unknown>>): AiTactics | undefined {
  const value = {
    preset: row["preset"],
    engage: Number(row["engage"]),
    pursue: Number(row["pursue"]),
    cover: Number(row["cover"]),
    escort: Number(row["escort"]),
    saveSkill: Number(row["save_skill"]),
    spread: Number(row["spread"]),
    retreatPct: Number(row["retreat_pct"]),
    target: row["target"],
  };
  return isAiTactics(value) ? value : undefined;
}

/** 저장소를 만들어 세계 저장 층에 붙인다(이미 있으면 그것). 세계 저장 층이 없으면 undefined */
export function attachUnitTactics(
  world: TacticsWorld,
  log?: { error(obj: object, message: string): void },
  /** 저장소를 붙일 세계 저장 층(world.persistence — 게이트웨이·로스터가 unitTacticsOf로 찾는다). 없으면 world.persistence */
  key?: object,
): UnitTacticsStore | undefined {
  const persistence = world.persistence;
  if (!persistence) return undefined;
  const owner = key ?? persistence;
  const known = stores.get(owner);
  if (known) return known;
  const table = new Map<number, AiTactics>();
  /** 읽는 동안 저장한 유닛(읽은 옛 줄로 덮지 않는다) */
  const touched = new Set<number>();
  const loaded = persistence.pool
    .query(
      `select unit_id, preset, engage, pursue, cover, escort, save_skill, spread, retreat_pct, target from unit_tactics`,
    )
    .then((result) => {
      for (const row of result.rows) {
        const unitId = Number(row.unit_id);
        const tactics = tacticsOfRow(row);
        if (tactics && !touched.has(unitId)) table.set(unitId, tactics);
      }
    })
    .catch((error: unknown) => log?.error({ err: error }, "tactics: load failed"));

  /** 그 사용자의 유닛 종류(띄운 2차맵 → 좌표 유닛). 내 것이 아니거나 수호신 상태면(판단하지 않는다 — D-589) null, 없으면 undefined */
  const kindOf = (ownerId: number, unitId: number): number | null | undefined => {
    for (const map of world.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.ownerId === ownerId && !isGuardianUnit(info) ? info.kind : null;
    }
    const parked = persistence.travel
      .coordinateUnits(new Set([ownerId]))
      .find((unit) => unit.unitId === unitId);
    return parked?.kind;
  };

  const store: UnitTacticsStore = {
    get: (unitId) => table.get(unitId),
    set(userId, unitId, tactics) {
      if (!isAiTactics(tactics)) return { ok: false, code: "forbidden" };
      const ownerId = persistence.settlement.findOwnerOfUser(userId);
      if (ownerId === undefined) return { ok: false, code: "unknown_unit" };
      const kind = kindOf(ownerId, unitId);
      if (kind === undefined) return { ok: false, code: "unknown_unit" };
      if (kind === null || !TACTICS_KINDS.has(kind)) return { ok: false, code: "forbidden" };
      const value: AiTactics = {
        preset: tactics.preset,
        engage: tactics.engage,
        pursue: tactics.pursue,
        cover: tactics.cover,
        escort: tactics.escort,
        saveSkill: tactics.saveSkill,
        spread: tactics.spread,
        retreatPct: tactics.retreatPct,
        target: tactics.target,
      };
      table.set(unitId, value);
      touched.add(unitId);
      persistence.writer.upsert("unitTactics", {
        unit_id: unitId,
        preset: value.preset,
        engage: value.engage,
        pursue: value.pursue,
        cover: value.cover,
        escort: value.escort,
        save_skill: value.saveSkill,
        spread: value.spread,
        retreat_pct: value.retreatPct,
        target: value.target,
        updated_at_ms: world.now(),
      });
      return { ok: true };
    },
    loaded: loaded.then(() => undefined),
  };
  stores.set(owner, store);
  return store;
}
