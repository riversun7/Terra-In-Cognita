// 보유 물건 조회(tRPC holdings.list) — docs/adr/2026-11-03-item-holdings.md 4절. 로그인한 본인의 소유 주체 물건과 그 주체 유닛에
// 걸린 효과. 메모리 표(원본의 캐시)에서 읽고, 신선도·썩는 시각은 서버가 셈해 보낸다(기기는 셈하지 않는다).
import type { HoldingView, HoldingsListResponse, UnitEffectView } from "@terra/shared/holdings";
import { holdingKindOf } from "@terra/sim";
import type { Viewer } from "../trpc/context.ts";
import type { HoldingsAccess } from "./gateway.ts";
import type { HoldingContent } from "./service.ts";
import { carrierOf } from "./state.ts";

export interface HoldingsReadServices {
  list(viewer: Viewer, nowMs: number): HoldingsListResponse;
}

const EMPTY: HoldingsListResponse = { hasOwner: false, holdings: [], effects: [], cooldowns: [] };

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
      const effectNames = new Map(
        (options.content()?.effects ?? []).map((effect) => [effect.id, effect.name]),
      );
      const { holdings, effects, cooldowns } = access.service.list(ownerId, nowMs);
      return {
        hasOwner: true,
        holdings: holdings.map((record): HoldingView => {
          const def = access.service.defOf(record.itemId);
          const fresh = access.service.freshnessOf(record, nowMs);
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
            createdAt: record.createdAtMs,
            source: record.source,
          };
        }),
        effects: effects.map(
          (entry): UnitEffectView => ({
            unit: entry.unitId,
            effect: entry.effect,
            name: effectNames.get(entry.effect) ?? null,
            value: entry.value,
            until: entry.untilMs,
            exclusive: entry.group,
            item: entry.item,
          }),
        ),
        cooldowns: cooldowns.map((entry) => ({ unit: entry.unitId, kind: entry.kind, until: entry.untilMs })),
      };
    },
  };
}
