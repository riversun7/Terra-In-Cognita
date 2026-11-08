// 보유 물건 조회(tRPC holdings.list) — docs/adr/2026-11-03-item-holdings.md 4절. 로그인한 본인의 소유 주체 물건과 그 주체 유닛에
// 걸린 효과. 메모리 표(원본의 캐시)에서 읽고, 신선도·썩는 시각은 서버가 셈해 보낸다(기기는 셈하지 않는다).
// 화면(사이보그 화면 인벤토리, ADR "바뀜 (화면)")이 칸 번호를 칸 종류로 읽게 내 사이보그·물건을 든 유닛의 칸 배치, 물건마다 입는 칸·쓰기 쿨
// 종류·쓰는 효과(이름·지속)도 보낸다. 판정은 여전히 서버 명령이 한다(기기는 버튼을 고르는 데만 쓴다).
import type {
  HoldingUnitView,
  HoldingView,
  HoldingsListResponse,
  UnitEffectView,
} from "@terra/shared/holdings";
import { holdingKindOf } from "@terra/sim";
import type { Viewer } from "../trpc/context.ts";
import type { HoldingsAccess } from "./gateway.ts";
import type { HoldingContent } from "./service.ts";
import { carrierOf } from "./state.ts";

export interface HoldingsReadServices {
  list(viewer: Viewer, nowMs: number): HoldingsListResponse;
}

const EMPTY: HoldingsListResponse = {
  hasOwner: false,
  holdings: [],
  effects: [],
  cooldowns: [],
  cyborgUnit: null,
  units: [],
};

/** 월드가 없거나 준비 전이면 늘 빈 목록 */
export const NO_HOLDINGS: HoldingsReadServices = { list: () => EMPTY };

export function createHoldingsReads(options: {
  /** 세계가 준비되면 접근(없으면 빈 목록) */
  readonly access: () => HoldingsAccess | undefined;
  readonly content: () => HoldingContent | undefined;
}): HoldingsReadServices {
  return {
    list(viewer, nowMs) {
      const access = options.access();
      const ownerId = access?.ownerOf(viewer.id);
      if (!access || ownerId === undefined) return EMPTY;
      const effectDefs = new Map((options.content()?.effects ?? []).map((effect) => [effect.id, effect]));
      const { service } = access;
      const { holdings, effects, cooldowns } = service.list(ownerId, nowMs);
      const cyborgUnit = access.cyborgUnitOf(viewer.id) ?? null;
      const unitIds = new Set<number>(cyborgUnit === null ? [] : [cyborgUnit]);
      for (const record of holdings) {
        const unit = carrierOf(record.location);
        if (unit !== null) unitIds.add(unit);
      }
      const units = [...unitIds]
        .toSorted((a, b) => a - b)
        .flatMap((unit): HoldingUnitView[] => {
          const layout = service.unitLayout(unit);
          return layout ? [{ unit, kind: layout.kind, slots: [...layout.slots] }] : [];
        });
      return {
        hasOwner: true,
        cyborgUnit,
        units,
        holdings: holdings.map((record): HoldingView => {
          const def = service.defOf(record.itemId);
          const fresh = service.freshnessOf(record, nowMs);
          return {
            id: record.id,
            item: record.itemId,
            name: def?.name ?? null,
            kind: def ? holdingKindOf(def) : null,
            quantity: record.quantity,
            unit: carrierOf(record.location),
            place: record.location > 0 ? record.location : null,
            slot: record.slot,
            stats: record.stats.map((entry) => ({ ...entry })),
            scorePm: record.scorePm,
            durability: record.durability,
            maxDurability: record.maxDurability,
            freshnessPm: fresh?.freshnessPm ?? null,
            spoilsAt: fresh?.spoilsAt ?? null,
            // 식품 포장 상태(D-524, 신선도 묶음만)
            packed: fresh === null ? null : record.packed === true,
            createdAt: record.createdAtMs,
            source: record.source,
            equipSlot: def?.equip?.slot ?? null,
            useCooldown: service.useCooldownOf(record.itemId),
            uses: (def?.use?.effects ?? []).map((line) => {
              const effect = effectDefs.get(line.effect);
              return {
                effect: line.effect,
                name: effect?.name ?? null,
                durationMs: line.durationMs ?? effect?.durationMs ?? 0,
              };
            }),
          };
        }),
        effects: effects.map(
          (entry): UnitEffectView => ({
            unit: entry.unitId,
            effect: entry.effect,
            name: effectDefs.get(entry.effect)?.name ?? null,
            value: entry.value,
            until: entry.untilMs,
            exclusive: entry.group,
            item: entry.item,
            valueMode: effectDefs.get(entry.effect)?.valueMode ?? "flat",
          }),
        ),
        cooldowns: cooldowns.map((entry) => ({ unit: entry.unitId, kind: entry.kind, until: entry.untilMs })),
      };
    },
  };
}
