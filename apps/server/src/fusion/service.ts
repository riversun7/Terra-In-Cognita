// 사이보그 유닛 융합·유전자 환생 서비스(서버) — 기획 D-470·D-478·D-481, 49 N46·N47, docs/adr/2026-11-07-cyborg-fusion-genes.md.
// 규칙(섞기·보너스·조각 수·조각 보너스)은 @terra/sim society/fusion.ts 한 벌이다. 여기는 소유·종류·잔고 확인, 저장, 화면 자료.
// - 융합(옛 craftCyborg): 내가 고용한 휴먼(유닛 종류 4) + 기계 부품(부품 쪽 스탯 = 설정 칸 n46_parts_stat — 서버에 안드로이드 유닛이
//   아직 없다) + 화폐(시험 화폐 [임시]) + 재료(티타늄 괴·마이크로칩, 장부 물자). 같은 유닛이 사이보그 유닛(종류 5)이 된다: 화물·지닌 물건·
//   생명 수치·노동 계약이 따라온다. 휴먼 행(수명)은 지우고 사이보그 유닛 행을 넣는다. 휴먼 지갑은 서버에 아직 없어 상속할 것이 없다
//   (D-470 "지갑은 상속처럼" — 휴먼 지갑이 생기면 이 자리에서 @terra/sim inherit를 부른다).
// - 유전자 환생(옛 reincarnate): 수명이 다한 내 휴먼 + 그 종(휴먼)의 스탯 유전자 조각 max(최소, ⌈레벨 ÷ 나눗수⌉)개 → 레벨 1·수명 다시·
//   환생 횟수 +1·조각마다 무작위 칸 +1. [임시] 신앙도·종교 시설 조건은 서버에 휴먼 신앙·시설 배치가 없어 보지 않는다.
// - 사망 조각(옛 LifeEngine): NPC 사회 런타임이 수명으로 죽은 휴먼을 알리면 소유자(그 세력)에게 그 종의 조각(genes.ts).
// - 명령 하나 = 읽기(DB, 쓰기 대기열이 따라잡은 뒤) → 다시 확인(메모리) → 한 번의 동기 처리(원장·유닛·행) → 커밋 뒤 답(U2).
import { DEV_GRANT_CURRENCY, type FusionResultCode } from "@terra/protocol";
import { createRng } from "@terra/shared";
import type {
  FusionCyborgUnitView,
  FusionGeneView,
  FusionHumanView,
  FusionMaterialView,
  FusionOverviewResponse,
} from "@terra/shared/fusion";
import type { LocalizedName } from "@terra/shared/roster";
import type { ItemEntry } from "@terra/content";
import {
  type FusionCoefficients,
  type SocietyCoefficients,
  fuseStatRange,
  fuseStats,
  fusionBonusPm,
  geneRebirthBonus,
  geneRebirthCost,
  lifespanMs,
  partsDonorStats,
  rebirthGeneOf,
  sixStats,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import {
  ASSET_CREDIT,
  SYSTEM_ISSUE_CREDIT,
  SYSTEM_SINK_CREDIT,
  type Settlement,
} from "../world/settlement.ts";
import { UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { burnGoods, dropGenesOnDeath, geneItemsOf, goodsAsset, issueGoods } from "./genes.ts";

/** [임시] 융합하는 곳(옛 고급 연구소·사이보그 공장). 서버에 유저 시설 배치가 없어 보이기만 한다(팩 시설 ID) */
export const FUSION_FACILITY = "workshop";
/** 융합 재료(옛 티타늄·마이크로칩). 수량은 설정 칸 N46. 팩에 없거나 꺼진 재료는 건너뛴다(옛 코드도 템플릿이 없으면 건너뜀) */
const MATERIALS: readonly { readonly item: string; readonly qty: (c: FusionCoefficients) => number }[] = [
  { item: "titanium_ingot", qty: (c) => c.titaniumQty },
  { item: "microchip", qty: (c) => c.microchipQty },
];
/** 휴먼 종(팩 unit_kinds ID). 유저 휴먼·NPC 휴먼 모두 */
export const HUMAN_SPECIES = "human";
/** 바탕 휴먼에 스탯이 없을 때(처음부터 있던 휴먼) [임시] 1차 스탯 — 유닛 화면 기본 몸과 같은 10 */
const BASELINE_STAT = 10;

export type FusionCommandResult =
  | {
      readonly ok: true;
      readonly unitId?: number;
      readonly stats?: number[];
      readonly bonusPm?: number;
      readonly shards?: number;
    }
  | { readonly ok: false; readonly code: FusionResultCode };

export interface FusionContent {
  readonly items: readonly ItemEntry[];
}

export interface FusionServiceOptions {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  /** 사이보그가 있는지(유닛 소유자 = 사이보그, D-469) */
  readonly hasCyborg: (userId: string) => boolean;
  /** 설정 칸 실효 값(부를 때마다 읽는다: N46·N47·수명 T4) */
  readonly rules: () => SocietyCoefficients;
  /** 실효 팩 아이템(재료·유전자 조각, 아이템 편집기 덮어쓰기가 바로 든다) */
  readonly content: () => FusionContent;
  readonly now: () => number;
  /** 굴림 시드(운영: crypto, 시험: 고정) */
  readonly seed: () => number;
  readonly ready: () => boolean;
}

export interface FusionService {
  overview(viewer: { id: string; devGrant: boolean }, nowMs: number): Promise<FusionOverviewResponse>;
  fuse(
    userId: string,
    input: { readonly human: number; readonly cost: string },
  ): Promise<FusionCommandResult>;
  rebirth(
    userId: string,
    input: { readonly unit: number; readonly shards: number },
  ): Promise<FusionCommandResult>;
  devGrant(
    userId: string,
    input: { readonly item: string; readonly quantity: number },
  ): Promise<FusionCommandResult>;
  /** 수명으로 죽은 휴먼의 소유자에게 그 종의 조각(NPC 사회 런타임이 부른다, 동기). 준 아이템 ID */
  dropOnDeath(ownerId: number, species: string, atMs: number): string[];
}

const fail = (code: FusionResultCode): FusionCommandResult => ({ ok: false, code });

const num = (value: unknown): number => Number(value);
const intArray = (value: unknown): number[] | null =>
  Array.isArray(value) ? value.map((entry) => Number(entry)) : null;

/** DB 휴먼 한 줄(유저가 고용한 휴먼) */
interface HumanRow {
  readonly unitId: number;
  readonly level: number;
  readonly rebirths: number;
  readonly stats: number[];
  readonly elements: number[] | null;
  readonly bornAtMs: number;
  readonly lifespanMs: number;
  /** 사는 도시(null = 노숙)·만족도(밀리점): 환생이 그대로 다시 쓴다 */
  readonly cityId: number | null;
  readonly satisfactionMilli: number;
}

function humanOf(row: Record<string, unknown>): HumanRow {
  const stats = intArray(row.stats);
  return {
    cityId: row.city_id === null || row.city_id === undefined ? null : num(row.city_id),
    satisfactionMilli: num(row.satisfaction_milli ?? 0),
    unitId: num(row.unit_id),
    level: num(row.level),
    rebirths: num(row.rebirths),
    stats: stats ? sixStats(stats) : Array.from({ length: 6 }, () => BASELINE_STAT),
    elements: intArray(row.elements),
    bornAtMs: num(row.born_at_ms),
    lifespanMs: num(row.lifespan_ms),
  };
}

const nameOf = (entry: ItemEntry | undefined, id: string): LocalizedName =>
  entry ? { ko: entry.name.ko, en: entry.name.en } : { ko: id, en: id };

/** 켜진 재료(설정 칸 수량, 팩에 있는 것만) */
function materialsOf(items: readonly ItemEntry[], c: FusionCoefficients) {
  return MATERIALS.flatMap((material) => {
    const entry = items.find((item) => item.id === material.item && item.enabled);
    const qty = material.qty(c);
    return entry && qty > 0 ? [{ item: material.item, qty, entry }] : [];
  });
}

export function createFusionService(o: FusionServiceOptions): FusionService {
  const { ledger, writer } = o;

  /** 메모리의 유닛(2차맵에 있는 것): 주인·종류·포로 */
  const unitOf = (unitId: number) => {
    for (const map of o.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return { map, info };
    }
    return undefined;
  };

  /** 내 휴먼 행 하나(쓰기 대기열이 따라잡은 뒤 DB에서). 없으면 undefined */
  const readHuman = async (unitId: number): Promise<HumanRow | undefined> => {
    await writer.durable();
    const result = await o.pool.query(
      `select unit_id, city_id, satisfaction_milli, level, rebirths, stats, elements, born_at_ms, lifespan_ms
         from world_humans where unit_id = $1`,
      [unitId],
    );
    const row = result.rows[0];
    return row ? humanOf(row) : undefined;
  };

  /** 명령 공통 확인: 준비·사이보그·내 휴먼(종류 4)·포로 아님. 통과하면 소유 주체와 2차맵 */
  const checkHuman = (userId: string, unitId: number) => {
    if (!o.ready()) return { fail: "busy" as const };
    if (!o.hasCyborg(userId)) return { fail: "no_cyborg" as const };
    const ownerId = o.settlement.findOwnerOfUser(userId);
    const found = unitOf(unitId);
    if (ownerId === undefined || !found || found.info.ownerId !== ownerId)
      return { fail: "unknown_unit" as const };
    if (found.info.kind !== UNIT_KIND_HUMAN) return { fail: "wrong_kind" as const };
    if (found.info.condition.heldBy !== null) return { fail: "captive" as const };
    return { ownerId, map: found.map };
  };

  return {
    async overview(viewer, nowMs) {
      const c = o.rules().fusion;
      const items = o.content().items;
      const byId = new Map(items.map((item) => [item.id, item]));
      const ownerId = o.settlement.findOwnerOfUser(viewer.id);
      const donorStats = partsDonorStats(c);
      const balanceOf = (asset: string): bigint =>
        ownerId === undefined ? 0n : ledger.balanceOf(ownerId, asset);
      const materials: FusionMaterialView[] = materialsOf(items, c).map((material) => ({
        item: material.item,
        name: nameOf(material.entry, material.item),
        qty: material.qty,
        have: String(balanceOf(goodsAsset(material.item))),
      }));
      const genes: FusionGeneView[] = geneItemsOf(items).map((gene) => ({
        item: gene.item,
        name: nameOf(byId.get(gene.item), gene.item),
        kind: gene.kind,
        species: gene.species,
        drops: gene.drops,
        qty: String(balanceOf(goodsAsset(gene.item))),
      }));
      const base = {
        hasCyborg: o.hasCyborg(viewer.id),
        balance: String(balanceOf(ASSET_CREDIT)),
        rules: {
          currency: String(Math.max(0, c.currency)),
          materials,
          donorStats,
          physicalDonorPm: c.physicalDonorPm,
          mentalHumanPm: c.mentalHumanPm,
          bonusMinPm: c.bonusMinPm,
          bonusMaxPm: c.bonusMaxPm,
          upkeepPm: c.upkeepPm,
          facility: FUSION_FACILITY,
          geneLevelDivisor: c.geneLevelDivisor,
          geneMin: c.geneMin,
          genePoints: c.genePoints,
        },
        genes,
        devGrant: viewer.devGrant,
        generatedAt: nowMs,
      };
      if (!o.ready() || ownerId === undefined)
        return { ...base, status: o.ready() ? "ready" : "not_ready", humans: [], cyborgUnits: [] };
      await writer.durable();
      const [humanRows, cyborgRows] = await Promise.all([
        o.pool.query(
          `select h.unit_id, h.level, h.rebirths, h.stats, h.elements, h.born_at_ms, h.lifespan_ms
             from world_humans h join world_units u on u.id = h.unit_id
            where u.owner_id = $1 and u.kind = $2 order by h.unit_id`,
          [ownerId, UNIT_KIND_HUMAN],
        ),
        o.pool.query(
          `select c.unit_id, c.level, c.stats, c.human_stats, c.donor, c.bonus_pm, c.fused_at_ms
             from cyborg_units c join world_units u on u.id = c.unit_id
            where u.owner_id = $1 order by c.unit_id`,
          [ownerId],
        ),
      ]);
      const humans: FusionHumanView[] = humanRows.rows.map((row) => {
        const human = humanOf(row);
        return {
          unitId: human.unitId,
          level: human.level,
          rebirths: human.rebirths,
          stats: human.stats,
          fused: fuseStatRange(human.stats, donorStats, c),
          lifespanEndsAtMs: human.bornAtMs + human.lifespanMs,
          captive: (unitOf(human.unitId)?.info.condition.heldBy ?? null) !== null,
          rebirthShards: geneRebirthCost(human.level, c),
        };
      });
      const cyborgUnits: FusionCyborgUnitView[] = cyborgRows.rows.map((row) => ({
        unitId: num(row.unit_id),
        level: num(row.level),
        stats: sixStats(intArray(row.stats) ?? []),
        humanStats: sixStats(intArray(row.human_stats) ?? []),
        donor: row.donor === "android" ? "android" : "parts",
        bonusPm: num(row.bonus_pm),
        fusedAtMs: num(row.fused_at_ms),
      }));
      return { ...base, status: "ready", humans, cyborgUnits };
    },

    async fuse(userId, input) {
      const first = checkHuman(userId, input.human);
      if ("fail" in first) return fail(first.fail);
      const human = await readHuman(input.human);
      if (!human) return fail("unknown_unit");
      // 읽는 동안 바뀌었을 수 있다(다른 연결의 융합) → 메모리로 다시 본다. 여기부터 커밋 전까지 기다림이 없다
      const checked = checkHuman(userId, input.human);
      if ("fail" in checked) return fail(checked.fail);
      // 이 명령은 시작할 때 받은 설정 칸 값 한 벌만 쓴다
      const c = o.rules().fusion;
      const cost = BigInt(Math.max(0, c.currency));
      if (String(cost) !== input.cost) return fail("cost_changed");
      const { ownerId, map } = checked;
      if (ledger.balanceOf(ownerId, ASSET_CREDIT) < cost) return fail("insufficient_funds");
      const materials = materialsOf(o.content().items, c);
      for (const material of materials)
        if (ledger.balanceOf(ownerId, goodsAsset(material.item)) < BigInt(material.qty))
          return fail("insufficient_materials");
      const at = o.now();
      const donor = partsDonorStats(c);
      const bonusPm = fusionBonusPm(createRng(o.seed()), c);
      const stats = fuseStats(human.stats, donor, bonusPm, c);
      // 한 번의 동기 처리: 값 소각 → 재료 소각 → 유닛 종류 → 휴먼 행 지우기 → 사이보그 유닛 행(같은 커밋)
      if (cost > 0n)
        ledger.post({
          kind: "fusion",
          atMs: at,
          entries: [
            { account: ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: -cost },
            { account: ledger.systemAccount(SYSTEM_SINK_CREDIT, ASSET_CREDIT), amount: cost },
          ],
        });
      for (const material of materials)
        burnGoods(ledger, ownerId, material.item, BigInt(material.qty), at, "fusion");
      map.setKind(input.human, UNIT_KIND_CYBORG_UNIT);
      writer.remove("humans", { unit_id: input.human });
      writer.upsert("cyborgUnits", {
        unit_id: input.human,
        level: 1,
        stats,
        elements: human.elements,
        human_stats: human.stats,
        donor: "parts",
        bonus_pm: bonusPm,
        fused_at_ms: at,
      });
      await writer.durable();
      return { ok: true, unitId: input.human, stats, bonusPm };
    },

    async rebirth(userId, input) {
      const first = checkHuman(userId, input.unit);
      if ("fail" in first) return fail(first.fail);
      const human = await readHuman(input.unit);
      if (!human) return fail("unknown_unit");
      const checked = checkHuman(userId, input.unit);
      if ("fail" in checked) return fail(checked.fail);
      const society = o.rules();
      const c = society.fusion;
      const at = o.now();
      if (human.bornAtMs + human.lifespanMs > at) return fail("alive");
      const shards = geneRebirthCost(human.level, c);
      if (shards !== input.shards) return fail("cost_changed");
      const gene = rebirthGeneOf(geneItemsOf(o.content().items), HUMAN_SPECIES);
      if (!gene) return fail("no_gene");
      const { ownerId } = checked;
      if (ledger.balanceOf(ownerId, goodsAsset(gene)) < BigInt(shards)) return fail("insufficient_genes");
      const rng = createRng(o.seed());
      const result = geneRebirthBonus(human.stats, shards, rng, c);
      // 한 번의 동기 처리: 조각 소각 → 휴먼 행(레벨 1·수명 다시·환생 +1·스탯 + 조각 보너스)
      burnGoods(ledger, ownerId, gene, BigInt(shards), at, "gene_rebirth");
      writer.upsert("humans", {
        unit_id: input.unit,
        // 사는 도시·만족도는 그대로
        city_id: human.cityId,
        satisfaction_milli: human.satisfactionMilli,
        born_at_ms: at,
        lifespan_ms: lifespanMs(rng.nextInt(10_000), society),
        rebirths: human.rebirths + 1,
        level: 1,
        stats: result.stats,
        elements: human.elements,
      });
      await writer.durable();
      return { ok: true, unitId: input.unit, stats: result.stats, shards };
    },

    async devGrant(userId, input) {
      if (!o.ready()) return fail("busy");
      const at = o.now();
      const owner = o.settlement.ownerOfUser(userId, at);
      const quantity = BigInt(input.quantity);
      if (input.item === DEV_GRANT_CURRENCY) {
        ledger.post({
          kind: "dev_grant",
          atMs: at,
          entries: [
            { account: ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -quantity },
            { account: ledger.ownerAccount(owner.id, ASSET_CREDIT), amount: quantity },
          ],
        });
      } else {
        // 쌓이는 물자만(장비·신선도·사용 효과가 있는 것은 보유 물건 dev_grant_item)
        const entry = o.content().items.find((item) => item.id === input.item && item.enabled);
        if (!entry || entry.equip || entry.perish || entry.use) return fail("unknown_item");
        issueGoods(ledger, owner.id, input.item, quantity, at, "dev_grant");
      }
      await writer.durable();
      return { ok: true };
    },

    dropOnDeath(ownerId, species, atMs) {
      const c = o.rules().fusion;
      return dropGenesOnDeath(
        ledger,
        geneItemsOf(o.content().items),
        ownerId,
        species,
        c.geneDeathDrop,
        atMs,
      );
    },
  };
}
