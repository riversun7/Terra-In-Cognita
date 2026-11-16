// 사이보그 유닛 융합·유전자 서비스(서버) — 기획 D-470·D-478·D-481·D-516, 49 N46·N47, docs/adr/2026-11-07-cyborg-fusion-genes.md.
// 규칙(섞기·보너스, 유전자 합성·인큐베이터)은 @terra/sim society/fusion.ts·genes.ts 한 벌이다. 여기는 소유·종류·잔고 확인, 저장, 화면 자료.
// - 융합(옛 craftCyborg): 내가 고용한 휴먼(유닛 종류 4) + 기계 부품(부품 쪽 스탯 = 설정 칸 n46_parts_stat — 서버에 안드로이드 유닛이
//   아직 없다, 370 가: 안드로이드 유닛이 생기면 단추 하나 더함) + 화폐(시험 화폐 [임시]) + 재료(티타늄 괴·마이크로칩, 장부 물자). 같은 유닛이
//   사이보그 유닛(종류 5)이 된다: 화물·지닌 물건·생명 수치·노동 계약이 따라온다. 휴먼 행(수명)은 지우고 사이보그 유닛 행을 넣는다. 휴먼
//   지갑은 서버에 아직 없어 상속할 것이 없다(D-470 "지갑은 상속처럼" — 휴먼 지갑이 생기면 이 자리에서 @terra/sim inherit를 부른다).
// - 유전자(D-516): 수명·합성·주입·인큐베이터·개발 시험은 geneCommands.ts. 유전자 하나하나는 보유 물건 인스턴스(item_holdings.gene)다.
// - 신전·종교(src/temple/, docs/adr/2026-11-07-temple-religion.md, D-517): 수명이 다한 휴먼은 비활성(1분 타이머가 비활성 표를 다시 만든다)
//   이고, 신전에서 환생·신격화하거나 생명과학 연구소에서 유전자로 바꾼다(geneCommands.ts convert). 비활성은 융합·주입을 받지 않는다(wrong_kind).
//   옛 유전자 환생(조각마다 무작위 +1)은 D-516으로 지웠다(유전자는 환생 재료가 아니다, D-441).
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
  inactiveWindow,
  partsDonorStats,
  sixStats,
  skillSlotCount,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { HoldingService } from "../holdings/service.ts";
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
import type { CyborgService } from "../cyborg/service.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import { serviceFacilityViews } from "../temple/overview.ts";
import { BIOTECH_STAGE } from "../temple/places.ts";
import { type TempleService, createTempleService } from "../temple/service.ts";
import { type GeneCatalog, type GeneCommands, createGeneCommands } from "./geneCommands.ts";
import { burnGoods, geneViewOf, goodsAsset, issueGoods } from "./genes.ts";
import { HUMAN_COLUMNS, HUMAN_SPECIES, humanOf, intArray, readHuman, readSkills } from "./humans.ts";

/** [임시] 융합하는 곳(옛 고급 연구소·사이보그 공장). 서버에 유저 시설 배치가 없어 보이기만 한다(팩 시설 ID) */
export const FUSION_FACILITY = "workshop";
/** 수명이 다한 유저 휴먼을 보는 간격(ms) */
const EXPIRE_SWEEP_MS = 60_000;
/** 융합 재료(옛 티타늄·마이크로칩). 수량은 설정 칸 N46. 팩에 없거나 꺼진 재료는 건너뛴다(옛 코드도 템플릿이 없으면 건너뜀) */
const MATERIALS: readonly { readonly item: string; readonly qty: (c: FusionCoefficients) => number }[] = [
  { item: "titanium_ingot", qty: (c) => c.titaniumQty },
  { item: "microchip", qty: (c) => c.microchipQty },
];

export { HUMAN_SPECIES } from "./humans.ts";
export type { GeneCatalog } from "./geneCommands.ts";

export type FusionCommandResult =
  | {
      readonly ok: true;
      readonly unitId?: number;
      readonly stats?: number[];
      readonly bonusPm?: number;
      readonly gene?: number;
      readonly genes?: number[];
      readonly outcome?: "up" | "down" | "keep";
      readonly total?: number;
      readonly skill?: string;
    }
  | { readonly ok: false; readonly code: FusionResultCode };

export interface FusionContent {
  readonly items: readonly ItemEntry[];
}

/** 스킬 자료가 없을 때(시험 세계): 스킬 없음 */
const NO_SKILLS: GeneCatalog = { skills: [], skillName: () => undefined, skillSlots: () => undefined };

export interface FusionServiceOptions {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  /** 보유 물건(유전자 인스턴스가 사는 곳, D-516) */
  readonly holdings: HoldingService;
  /** 사이보그가 있는지(유닛 소유자 = 사이보그, D-469) */
  readonly hasCyborg: (userId: string) => boolean;
  /** 설정 칸 실효 값(부를 때마다 읽는다: N46·N47·수명 T4) */
  readonly rules: () => SocietyCoefficients;
  /** 실효 팩 아이템(재료·유전자, 아이템 편집기 덮어쓰기가 바로 든다) */
  readonly content: () => FusionContent;
  /** 실효 스킬 자료(켜진 스킬·이름·스킬 칸 규칙). 없으면 스킬 없음 */
  readonly catalog?: (() => GeneCatalog) | undefined;
  /** 새 유닛 ID(인큐베이터) */
  readonly nextUnitId: () => number;
  readonly now: () => number;
  /** 굴림 시드(운영: crypto, 시험: 고정) */
  readonly seed: () => number;
  readonly ready: () => boolean;
  readonly log?: { warn(obj: object, message: string): void; error(obj: object, message: string): void };
  /** 수명 타이머를 돌리지 않는다(시험이 expireDue를 직접 부른다) */
  readonly manual?: boolean | undefined;
  /** 건물(신전 시설 줄·일함·도시 자리). 없으면 신전이 없다 */
  readonly facilities?: WorldFacilities | undefined;
  /** 사이보그(신전 기도·헌금이 본체 신앙도를 올린다) */
  readonly cyborgs?: CyborgService | undefined;
  /**
   * 개발 시험 화폐 받기가 기준 통화와 함께 주는 화폐(그 유저 나라의 화폐 — 폐허 모금 화폐, 질문 546). 없거나 기준 통화와 같으면 기준 통화만
   */
  readonly devExtraCurrency?: ((userId: string) => string | undefined) | undefined;
  /** 인큐베이터 휴먼을 만든 사람의 가문에 적는다(질문 1847 답, geneCommands.ts) */
  readonly assignHouse?: ((unitId: number, userId: string, nowMs: number) => void) | undefined;
}

export interface FusionService extends Omit<GeneCommands, "expireDue"> {
  /** 신전·종교(비활성 표·기도·헌금·환생·신격화) */
  readonly temple: TempleService;
  overview(viewer: { id: string; devGrant: boolean }, nowMs: number): Promise<FusionOverviewResponse>;
  fuse(
    userId: string,
    input: { readonly human: number; readonly cost: string },
  ): Promise<FusionCommandResult>;
  devGrant(
    userId: string,
    input: { readonly item: string; readonly quantity: number },
  ): Promise<FusionCommandResult>;
  /** 비활성 표를 다시 만든 뒤 상한(설정 칸, 0 = 없음)이 지난 유저 휴먼을 유전자로 바꿔 떠나보낸다(타이머가 1분마다). 떠난 휴먼 수 */
  expireDue(nowMs: number): Promise<number>;
  stop(): void;
}

const fail = (code: FusionResultCode): FusionCommandResult => ({ ok: false, code });

const num = (value: unknown): number => Number(value);

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
  const catalog = (): GeneCatalog => o.catalog?.() ?? NO_SKILLS;
  const { expireDue, ...genes } = createGeneCommands({
    ...o,
    items: () => o.content().items,
    catalog,
  });
  const temple = createTempleService(o);
  /** 1분마다: 비활성 표(새 비활성은 노동 계약이 끝난다) → 상한이 지난 휴먼 떠남(상한이 없으면 아무도) */
  const lifespanSweep = async (nowMs: number): Promise<number> => {
    await temple.sweep(nowMs);
    return expireDue(nowMs);
  };

  /** 메모리의 유닛(2차맵에 있는 것): 주인·종류·포로 */
  const unitOf = (unitId: number) => {
    for (const map of o.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return { map, info };
    }
    return undefined;
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

  const timer = o.manual
    ? undefined
    : setInterval(() => {
        lifespanSweep(o.now()).catch((error: unknown) => {
          o.log?.error({ err: error }, "genes: lifespan sweep failed");
        });
      }, EXPIRE_SWEEP_MS);
  timer?.unref();

  return {
    ...genes,
    temple,
    expireDue: lifespanSweep,

    async overview(viewer, nowMs) {
      const c = o.rules().fusion;
      const items = o.content().items;
      const byId = new Map(items.map((item) => [item.id, item]));
      const ownerId = o.settlement.findOwnerOfUser(viewer.id);
      const donorStats = partsDonorStats(c);
      const skillCatalog = catalog();
      const balanceOf = (asset: string): bigint =>
        ownerId === undefined ? 0n : ledger.balanceOf(ownerId, asset);
      const materials: FusionMaterialView[] = materialsOf(items, c).map((material) => ({
        item: material.item,
        name: nameOf(material.entry, material.item),
        qty: material.qty,
        have: String(balanceOf(goodsAsset(material.item))),
      }));
      const geneViews: FusionGeneView[] =
        ownerId === undefined
          ? []
          : o.holdings.list(ownerId, nowMs).holdings.flatMap((record) => {
              const view = geneViewOf(record, {
                item: (id) => {
                  const entry = byId.get(id);
                  return entry ? nameOf(entry, id) : undefined;
                },
                skill: (id) => skillCatalog.skillName(id),
              });
              return view ? [view] : [];
            });
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
          genes: {
            upPm: c.geneUpPm,
            downPm: c.geneDownPm,
            keepPm: c.geneKeepPm,
            stepPm: c.geneStepPm,
            totalMax: c.geneTotalMax,
            elementVariance: c.geneElementVariance,
            incubateBase: c.incubateBaseStat,
            incubateCurrency: String(Math.max(0, c.incubateCurrency)),
            facility: BIOTECH_STAGE,
          },
        },
        genes: geneViews,
        // 인큐베이터를 여는 생명과학 연구소(누구의 것이든, 459 가)
        labs: serviceFacilityViews(o.maps, o.facilities, ownerId, new Map()).labs,
        devGrant: viewer.devGrant,
        generatedAt: nowMs,
      };
      if (!o.ready() || ownerId === undefined)
        return { ...base, status: o.ready() ? "ready" : "not_ready", humans: [], cyborgUnits: [] };
      await writer.durable();
      const [humanRows, cyborgRows] = await Promise.all([
        o.pool.query(
          `select ${HUMAN_COLUMNS}
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
      const parsed = humanRows.rows.map((row) => humanOf(row));
      const learned = await readSkills(
        o.pool,
        parsed.map((human) => human.unitId),
      );
      const rule = skillCatalog.skillSlots(HUMAN_SPECIES);
      const humans: FusionHumanView[] = parsed.map((human) => ({
        unitId: human.unitId,
        level: human.level,
        rebirths: human.rebirths,
        stats: human.stats,
        fused: fuseStatRange(human.stats, donorStats, c),
        lifespanEndsAtMs: human.bornAtMs + human.lifespanMs,
        departsAtMs: inactiveWindow(human.bornAtMs, human.lifespanMs, o.rules().temple).departsAtMs,
        captive: (unitOf(human.unitId)?.info.condition.heldBy ?? null) !== null,
        skills: (learned.get(human.unitId) ?? []).map((id) => ({
          id,
          name: skillCatalog.skillName(id) ?? null,
        })),
        skillSlots: rule ? skillSlotCount(rule.base, human.rebirths * rule.perRebirth, rule.max) : 0,
      }));
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
      await writer.durable();
      const human = await readHuman(o.pool, input.human);
      if (!human) return fail("unknown_unit");
      // 비활성(수명이 다한 휴먼, D-517)은 일하지 않는다 — 융합해 수명을 피하지 못한다(docs/adr/2026-11-07-temple-religion.md)
      if (human.bornAtMs + human.lifespanMs <= o.now()) return fail("wrong_kind");
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
      // 한 번의 동기 처리: 값 소각 → 재료 소각 → 유닛 종류 → 휴먼 행 지우기 → 사이보그 유닛 행(같은 커밋).
      // 배운 스킬(unit_skills)은 같은 유닛이라 그대로 남는다
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
        const extra = o.devExtraCurrency?.(userId);
        if (extra !== undefined && extra !== ASSET_CREDIT)
          ledger.post({
            kind: "dev_grant",
            atMs: at,
            entries: [
              { account: ledger.systemAccount(`issue:${extra}`, extra), amount: -quantity },
              { account: ledger.ownerAccount(owner.id, extra), amount: quantity },
            ],
          });
      } else {
        // 쌓이는 물자만(장비·신선도·사용 효과는 보유 물건 dev_grant_item, 유전자는 값이 있는 인스턴스라 dev_grant_gene)
        const entry = o.content().items.find((item) => item.id === input.item && item.enabled);
        if (!entry || entry.equip || entry.perish || entry.use || entry.gene) return fail("unknown_item");
        issueGoods(ledger, owner.id, input.item, quantity, at, "dev_grant");
      }
      await writer.durable();
      return { ok: true };
    },

    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
