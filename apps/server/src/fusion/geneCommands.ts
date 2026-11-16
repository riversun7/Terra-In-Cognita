// 유전자 명령(서버) — 기획 D-478(수명이 다한 휴먼·크리쳐의 스탯·스킬이 유전자로 남음, 스킬 유전자는 주입, 스탯 유전자는 인큐베이터),
// D-481(조합 속성 = 평균 + 오차), D-516(스탯 유전자 = 총합·분포·속성 인스턴스, 총합·주력 스탯 골라 적용, 합성은 확률로 오름·내림·그대로),
// D-099(사망은 수명이 다했을 때만), docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)". 판정은 @terra/sim society/genes.ts 한 벌이다.
// - 수명(D-517, docs/adr/2026-11-07-temple-religion.md): 유저 휴먼(유닛 종류 4)은 수명이 다하면 비활성이 되고(일하지 않음, src/temple/),
//   고르지 않으면 그대로 남는다. 바뀌는 길은 둘: 신전 환생·신격화(src/temple/service.ts) 또는 생명과학 연구소 유전자 변환(convert) → 그 유닛의
//   스탯 유전자 하나(총합·분포·속성)와 배운 스킬마다 스킬 유전자 하나를 소유자에게 남기고, 지닌 물건·화물을 소유자에게 옮긴 뒤 유닛이 떠난다
//   (지워진다). [임시] 남는 곳 = 소유자 사이보그 본체가 듦(창고 자리는 질문 396). 비활성 상한(설정 칸, 출발값 없음 = 상한 없음)을 두면
//   수명 끝 + 상한에 같은 변환으로 떠난다(expireDue, [임시] 질문). 신격화는 떠나지 않고 수호신 유닛이 된다(기획 답 456 가, src/temple/).
//   NPC 세력 휴먼은 유전자를 남기지 않는다(쓰는 곳이 없다, 질문 397). devExpire = 개발 시험 바로 변환(연구소·비활성·값 없이).
// - 합성(synthesize): 같은 종 스탯 유전자 둘 → 새 스탯 유전자 하나(둘 다 사라짐). 시드 굴림 하나.
// - 주입(inject): 스킬 유전자 하나 → 내 휴먼이 그 스킬을 등급 1로 배운다(스킬 칸 규칙 = 팩 unit_kinds skillSlots, 이미 배운 스킬은 거절).
// - 인큐베이터(incubate): 휴먼 스탯 유전자 하나 → 새 휴먼(유닛 종류 4) 하나(총합 또는 주력 스탯 적용, 속성은 유전자 값, 수명 T4 굴림).
//   기획 답 459 가: 생명과학 연구소(생명공학 단계, Lv1부터 — 다 지음·30% 이상)에서 플레이어 명령으로 연다. 비용 = 화폐(설정 칸
//   n47_incubate_currency [임시], 남의 연구소 = 주인 수입·내 연구소 = 소각, 454 가), 재료 없음. 새 휴먼은 연구소 둘레에 태어나고 사는 도시 =
//   연구소 도시. 연구소 없이 여는 것은 개발 시험(dev·admin, gateway.ts — 사이보그 본체 둘레·사는 도시 없음·값 없음)이다. 새 휴먼은 만든 사람의
//   가문에 든다(질문 1847 답 — D-569 고용과 같다, house_units. 가문이 없으면 무소속).
// - 개발 시험(dev·admin): 시험 유전자 받기(devGrantGene), 수명 끝내기(devExpire).
// 명령 하나 = 읽기(DB, 쓰기 대기열이 따라잡은 뒤) → 다시 확인(메모리) → 한 번의 동기 처리 → 커밋 뒤 답(U2).
import type { ItemEntry } from "@terra/content";
import type { FusionResultCode } from "@terra/protocol";
import { createRng } from "@terra/shared";
import type { LocalizedName } from "@terra/shared/roster";
import {
  CELL_UNITS,
  type GeneApply,
  type SocietyCoefficients,
  WALK_SPEED,
  geneItemOf,
  incubateStats,
  lifespanMs,
  positionAt,
  skillSlotCount,
  statGeneOf,
  synthesizeStatGenes,
} from "@terra/sim";
import { spiralCells } from "../cyborg/service.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { GenePayload } from "../holdings/genePayload.ts";
import type { HoldingService } from "../holdings/service.ts";
import { carriedBy } from "../holdings/state.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import { buildingCell } from "../facilities/places.ts";
import { BIOTECH_STAGE, payServiceFee, serviceFacility, unitCity } from "../temple/places.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { geneItemsOf, statGeneOfPayload } from "./genes.ts";
import { HUMAN_COLUMNS, HUMAN_SPECIES, type HumanRow, humanOf, readHuman, readSkills } from "./humans.ts";

/** 인큐베이터 휴먼을 세울 빈 칸을 찾는 반지름(칸, 구인과 같다) */
const PLACE_RADIUS = 24;
/** 인큐베이터 휴먼의 처음 만족도(밀리점, 구인과 같다) */
const START_SATISFACTION = 60_000;
/** 한 번에 수명을 끝내는 휴먼 수(밀리면 다음 분에 이어서) */
const EXPIRE_BATCH = 100;
/** [임시] 개발 시험 스탯 유전자의 칸마다 값 범위(5~20) */
const DEV_STAT_MIN = 5;
const DEV_STAT_SPAN = 16;

export type GeneCommandResult =
  | {
      readonly ok: true;
      readonly unitId?: number;
      readonly stats?: number[];
      readonly gene?: number;
      readonly genes?: number[];
      readonly outcome?: "up" | "down" | "keep";
      readonly total?: number;
      readonly skill?: string;
    }
  | { readonly ok: false; readonly code: FusionResultCode };

/** 스킬 자료(실효 팩: 켜진 스킬·이름·유닛 종류 스킬 칸 규칙) */
export interface GeneCatalog {
  /** 켜진 스킬 ID(팩 차례) */
  readonly skills: readonly string[];
  skillName(id: string): LocalizedName | undefined;
  /** 유닛 종류(팩 unit_kinds ID)의 스킬 칸 규칙 */
  skillSlots(
    kind: string,
  ): { readonly base: number; readonly perRebirth: number; readonly max: number } | undefined;
}

export interface GeneCommandOptions {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  readonly holdings: HoldingService;
  readonly hasCyborg: (userId: string) => boolean;
  readonly rules: () => SocietyCoefficients;
  readonly items: () => readonly ItemEntry[];
  readonly catalog: () => GeneCatalog;
  readonly nextUnitId: () => number;
  readonly now: () => number;
  readonly seed: () => number;
  readonly ready: () => boolean;
  readonly log?: { warn(obj: object, message: string): void } | undefined;
  /** 건물(생명과학 연구소 시설 줄·일함·도시 자리, D-517 변환). 없으면 연구소가 없다 */
  readonly facilities?: WorldFacilities | undefined;
  /** 인큐베이터 휴먼을 만든 사람의 가문에 적는다(질문 1847 답 — 고용과 같다, world/houseTies.ts assignUnit). 없으면 적지 않는다 */
  readonly assignHouse?: ((unitId: number, userId: string, nowMs: number) => void) | undefined;
}

export interface GeneCommands {
  synthesize(userId: string, input: { readonly a: number; readonly b: number }): Promise<GeneCommandResult>;
  inject(userId: string, input: { readonly gene: number; readonly unit: number }): Promise<GeneCommandResult>;
  /** lab = 생명과학 연구소와 기기가 본 인큐베이터 화폐(없으면 개발 시험 — 권한은 게이트웨이가 본다) */
  incubate(
    userId: string,
    input: {
      readonly gene: number;
      readonly apply: GeneApply;
      readonly lab?: { readonly buildingId: number; readonly cost: string } | undefined;
    },
  ): Promise<GeneCommandResult>;
  devGrantGene(
    userId: string,
    input: { readonly kind: "stat" | "skill"; readonly skill?: string | undefined },
  ): Promise<GeneCommandResult>;
  devExpire(userId: string, input: { readonly unit: number }): Promise<GeneCommandResult>;
  /**
   * 비활성인 내 휴먼을 그 생명과학 연구소에서 유전자로 바꾼다(D-517): 연구소(생명공학 단계, 다 지음·30% 이상)·그 유닛이 선 도시 = 연구소 도시·
   * 본 값 = 변환 화폐(설정 칸 n47_convert_currency [임시]) → 화폐(남의 연구소 = 주인 수입, 내 연구소 = 소각) → 유전자를 남기고 떠남
   */
  convert(
    userId: string,
    input: { readonly buildingId: number; readonly unit: number; readonly cost: string },
  ): Promise<GeneCommandResult>;
  /** 비활성 상한(설정 칸, 0 = 상한 없음)이 지난 유저 휴먼을 유전자로 바꿔 떠나보낸다(1분마다). 처리한 휴먼 수 */
  readonly expireDue: (nowMs: number) => Promise<number>;
}

const fail = (code: FusionResultCode): GeneCommandResult => ({ ok: false, code });

export function createGeneCommands(o: GeneCommandOptions): GeneCommands {
  const { holdings, writer, ledger } = o;

  const unitOf = (unitId: number) => {
    for (const map of o.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return { map, info };
    }
    return undefined;
  };

  /** 소유 주체의 사이보그 본체 유닛(유전자·떠난 유닛의 물건이 가는 곳 [임시]) */
  const cyborgUnitOf = (ownerId: number): { readonly id: number; readonly map: SecondMap } | undefined => {
    for (const map of o.maps.values()) {
      let found: number | undefined;
      map.forEachUnit((unit) => {
        if (found === undefined && unit.ownerId === ownerId && unit.kind === UNIT_KIND_CYBORG)
          found = unit.id;
      });
      if (found !== undefined) return { id: found, map };
    }
    return undefined;
  };

  /** 공통 확인: 준비·사이보그·소유 주체 */
  const ownerFor = (userId: string): { ownerId: number } | { fail: FusionResultCode } => {
    if (!o.ready()) return { fail: "busy" };
    if (!o.hasCyborg(userId)) return { fail: "no_cyborg" };
    const ownerId = o.settlement.findOwnerOfUser(userId);
    return ownerId === undefined ? { fail: "no_cyborg" } : { ownerId };
  };

  /** 내 휴먼(종류 4, 포로 아님) */
  const myHuman = (ownerId: number, unitId: number): FusionResultCode | undefined => {
    const found = unitOf(unitId);
    if (!found || found.info.ownerId !== ownerId) return "unknown_unit";
    if (found.info.kind !== UNIT_KIND_HUMAN) return "wrong_kind";
    if (found.info.condition.heldBy !== null) return "captive";
    return undefined;
  };

  /**
   * 떠나는 휴먼 하나(한 번의 동기 처리): 유전자를 남기고, 지닌 것·화물을 소유자에게 옮기고, 유닛이 떠난다. 남은 유전자 칸 ID. 메모리 유닛이
   * 이미 없거나 휴먼이 아니거나 주인이 바뀌었으면 아무것도 하지 않는다(undefined)
   */
  const retire = (
    ownerId: number,
    human: HumanRow,
    skills: readonly string[],
    atMs: number,
  ): number[] | undefined => {
    const found = unitOf(human.unitId);
    if (!found || found.info.kind !== UNIT_KIND_HUMAN || found.info.ownerId !== ownerId) return undefined;
    const genes = geneItemsOf(o.items());
    const cyborg = cyborgUnitOf(ownerId);
    const created: number[] = [];
    if (cyborg) {
      const place = carriedBy(cyborg.id);
      const origin = { species: HUMAN_SPECIES, from: human.unitId, level: human.level };
      const statItem = geneItemOf(genes, HUMAN_SPECIES, "stat", "death");
      const skillItem = geneItemOf(genes, HUMAN_SPECIES, "skill", "death");
      const add = (item: string | undefined, gene: GenePayload): void => {
        if (item === undefined) return;
        const id = holdings.addGene({ ownerId, item, location: place, gene, atMs, source: "lifespan" });
        if (id !== undefined) created.push(id);
      };
      add(statItem, { kind: "stat", ...statGeneOf(human.stats, human.elements), generation: 0, ...origin });
      for (const skill of skills) add(skillItem, { kind: "skill", skill, ...origin });
      holdings.moveCarried(human.unitId, place);
    } else {
      o.log?.warn({ unitId: human.unitId, ownerId }, "genes: owner has no cyborg unit; no genes left");
    }
    // 화물(원장 위치 = −유닛)은 소유자 장부 계정으로(D-332 상속자 = 소유자, 지갑 상속세는 휴먼 지갑이 생기면)
    const cargo = [...ledger.accounts()].filter(
      (account) => account.ownerId === ownerId && account.location === -human.unitId && account.balance > 0n,
    );
    for (const account of cargo)
      ledger.post({
        kind: "lifespan_cargo",
        atMs,
        entries: [
          { account: account.id, amount: -account.balance },
          { account: ledger.ownerAccount(ownerId, account.asset), amount: account.balance },
        ],
      });
    for (const skill of skills) writer.remove("unitSkills", { unit_id: human.unitId, skill_id: skill });
    writer.remove("unitFaith", { unit_id: human.unitId });
    writer.remove("humans", { unit_id: human.unitId });
    found.map.removeUnit(human.unitId);
    return created;
  };

  /** 생명과학 연구소 확인(생명공학 단계 시설, 다 지었고 30% 이상) */
  const labOf = (
    buildingId: number,
  ):
    | { readonly ok: true; readonly cityId: number | null; readonly ownerId: number | null }
    | { readonly ok: false; readonly code: FusionResultCode } => {
    const found = serviceFacility(o.facilities, buildingId, BIOTECH_STAGE);
    if (found.ok) return found;
    return { ok: false, code: found.reason === "closed" ? "lab_closed" : "not_lab" };
  };

  let expiring = false;

  return {
    async synthesize(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      if (input.a === input.b) return fail("same_gene");
      const a = holdings.geneOf(owner.ownerId, input.a);
      const b = holdings.geneOf(owner.ownerId, input.b);
      if (!a?.gene || !b?.gene) return fail("unknown_gene");
      if (a.gene.kind !== "stat" || b.gene.kind !== "stat" || a.gene.species !== b.gene.species)
        return fail("wrong_gene");
      const result = synthesizeStatGenes(
        statGeneOfPayload(a.gene),
        statGeneOfPayload(b.gene),
        createRng(o.seed()),
        o.rules().fusion,
      );
      const at = o.now();
      // 한 번의 동기 처리: 새 유전자(a 자리) → 두 유전자 지우기
      const id = holdings.addGene({
        ownerId: owner.ownerId,
        item: a.itemId,
        location: a.location,
        gene: {
          kind: "stat",
          ...result.gene,
          generation: Math.max(a.gene.generation, b.gene.generation) + 1,
          species: a.gene.species,
          from: null,
          level: null,
        },
        atMs: at,
        source: "synthesis",
      });
      if (id === undefined) return fail("no_gene");
      holdings.remove(a.id);
      holdings.remove(b.id);
      await writer.durable();
      return { ok: true, gene: id, outcome: result.outcome, total: result.gene.total };
    },

    async inject(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const first = myHuman(owner.ownerId, input.unit);
      if (first) return fail(first);
      await writer.durable();
      const human = await readHuman(o.pool, input.unit);
      if (!human) return fail("unknown_unit");
      // 비활성(수명이 다한 휴먼, D-517)은 일하지 않는다 — 주입도 받지 않는다(docs/adr/2026-11-07-temple-religion.md)
      if (human.bornAtMs + human.lifespanMs <= o.now()) return fail("wrong_kind");
      const learned = (await readSkills(o.pool, [input.unit])).get(input.unit) ?? [];
      // 읽는 동안 바뀌었을 수 있다 → 메모리로 다시 본다. 여기부터 커밋 전까지 기다림이 없다
      const again = myHuman(owner.ownerId, input.unit);
      if (again) return fail(again);
      const record = holdings.geneOf(owner.ownerId, input.gene);
      if (!record?.gene) return fail("unknown_gene");
      if (record.gene.kind !== "skill" || record.gene.species !== HUMAN_SPECIES) return fail("wrong_gene");
      const catalog = o.catalog();
      const skill = record.gene.skill;
      if (!catalog.skills.includes(skill)) return fail("unknown_skill");
      if (learned.includes(skill)) return fail("skill_known");
      const rule = catalog.skillSlots(HUMAN_SPECIES);
      const slots = rule ? skillSlotCount(rule.base, human.rebirths * rule.perRebirth, rule.max) : 0;
      if (learned.length >= slots) return fail("no_skill_slot");
      // 한 번의 동기 처리: 유전자 지우기 → 배운 스킬(등급 1)
      holdings.remove(record.id);
      writer.upsert("unitSkills", {
        unit_id: input.unit,
        skill_id: skill,
        grade: 1,
        source: "gene",
        learned_at_ms: o.now(),
      });
      await writer.durable();
      return { ok: true, unitId: input.unit, skill };
    },

    async incubate(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const record = holdings.geneOf(owner.ownerId, input.gene);
      if (!record?.gene) return fail("unknown_gene");
      // 크리쳐는 바탕 개체(포획·알)가 종을 정한다(D-481) — 바탕 개체 고르기는 크리쳐 줄기에서
      if (record.gene.kind !== "stat" || record.gene.species !== HUMAN_SPECIES) return fail("wrong_gene");
      const society = o.rules();
      const at = o.now();
      // 태어나는 자리: 연구소면 그 건물 기준 칸 둘레·사는 도시 = 연구소 도시(459 가), 개발 시험이면 사이보그 본체 둘레·노숙
      let birth: {
        readonly map: SecondMap;
        readonly x: number;
        readonly y: number;
        readonly cityId: number | null;
      };
      let fee:
        | { readonly to: number | null; readonly buildingId: number; readonly amount: bigint }
        | undefined;
      if (input.lab) {
        const lab = labOf(input.lab.buildingId);
        if (!lab.ok) return fail(lab.code);
        const cell = buildingCell(o.maps, input.lab.buildingId);
        const map = cell ? o.maps.get(cell.mapKey) : undefined;
        if (!cell || !map) return fail("not_lab");
        const amount = BigInt(Math.max(0, society.fusion.incubateCurrency));
        if (String(amount) !== input.lab.cost) return fail("cost_changed");
        if (ledger.balanceOf(owner.ownerId, ASSET_CREDIT) < amount) return fail("insufficient_funds");
        birth = { map, x: cell.x, y: cell.y, cityId: lab.cityId };
        fee = { to: lab.ownerId, buildingId: input.lab.buildingId, amount };
      } else {
        const cyborg = cyborgUnitOf(owner.ownerId);
        const motion = cyborg?.map.unitInfo(cyborg.id)?.motion;
        if (!cyborg || !motion) return fail("no_cyborg");
        const point = positionAt(motion, at);
        birth = {
          map: cyborg.map,
          x: Math.floor(point.x / CELL_UNITS),
          y: Math.floor(point.y / CELL_UNITS),
          cityId: null,
        };
      }
      const stats = incubateStats(statGeneOfPayload(record.gene), input.apply, society.fusion);
      // 한 번의 동기 처리: 유닛 → 요금 → 유전자 지우기 → 휴먼 행(같은 커밋)
      const unitId = o.nextUnitId();
      let placed = false;
      for (const cell of spiralCells(birth.x, birth.y, PLACE_RADIUS)) {
        if (
          birth.map.addUnit({
            id: unitId,
            size: 1,
            speed: WALK_SPEED,
            cellX: cell.x,
            cellY: cell.y,
            ownerId: owner.ownerId,
            kind: UNIT_KIND_HUMAN,
          })
        ) {
          placed = true;
          break;
        }
      }
      if (!placed) return fail("no_room");
      if (fee)
        payServiceFee(
          o.facilities,
          ledger,
          owner.ownerId,
          { ownerId: fee.to, buildingId: fee.buildingId },
          fee.amount,
          at,
          "gene_incubate",
        );
      holdings.remove(record.id);
      const rng = createRng(o.seed());
      writer.upsert("humans", {
        unit_id: unitId,
        // 사는 도시 = 연구소 도시(459 가). 개발 시험은 노숙(도시 없음)
        city_id: birth.cityId,
        satisfaction_milli: START_SATISFACTION,
        born_at_ms: at,
        lifespan_ms: lifespanMs(rng.nextInt(10_000), society),
        rebirths: 0,
        level: 1,
        stats,
        elements: [...record.gene.elements],
      });
      // 만든 사람의 가문(질문 1847 답 — D-569 고용과 같이 house_units, 같은 커밋). 가문이 없으면 무소속
      o.assignHouse?.(unitId, userId, at);
      await writer.durable();
      return { ok: true, unitId, stats };
    },

    async devGrantGene(userId, input) {
      if (!o.ready()) return fail("busy");
      const at = o.now();
      const ownerId = o.settlement.ownerOfUser(userId, at).id;
      const cyborg = cyborgUnitOf(ownerId);
      if (!cyborg) return fail("no_cyborg");
      const item = geneItemOf(geneItemsOf(o.items()), HUMAN_SPECIES, input.kind);
      if (item === undefined) return fail("no_gene");
      const origin = { species: HUMAN_SPECIES, from: null, level: null };
      let gene: GenePayload;
      if (input.kind === "skill") {
        const skills = o.catalog().skills;
        const skill = input.skill ?? skills[0];
        if (skill === undefined || !skills.includes(skill)) return fail("unknown_skill");
        gene = { kind: "skill", skill, ...origin };
      } else {
        const rng = createRng(o.seed());
        const stats = Array.from({ length: 6 }, () => DEV_STAT_MIN + rng.nextInt(DEV_STAT_SPAN));
        const elements = Array.from({ length: 12 }, () => 0);
        elements[rng.nextInt(12)] = 1 + rng.nextInt(10);
        gene = { kind: "stat", ...statGeneOf(stats, elements), generation: 0, ...origin };
      }
      const id = holdings.addGene({
        ownerId,
        item,
        location: carriedBy(cyborg.id),
        gene,
        atMs: at,
        source: "dev_grant",
      });
      if (id === undefined) return fail("no_gene");
      await writer.durable();
      return { ok: true, gene: id };
    },

    async devExpire(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const first = myHuman(owner.ownerId, input.unit);
      if (first && first !== "captive") return fail(first);
      await writer.durable();
      const human = await readHuman(o.pool, input.unit);
      if (!human) return fail("unknown_unit");
      const skills = (await readSkills(o.pool, [input.unit])).get(input.unit) ?? [];
      const genes = retire(owner.ownerId, human, skills, o.now());
      if (!genes) return fail("unknown_unit");
      await writer.durable();
      return { ok: true, unitId: input.unit, genes };
    },

    async expireDue(nowMs) {
      if (!o.ready() || expiring) return 0;
      expiring = true;
      try {
        await writer.durable();
        // 비활성 상한(설정 칸, 부를 때마다 읽는다)이 있을 때만: 수명 끝 + 상한이 지난 휴먼이 떠난다. 0 = 상한 없음(D-517 "고르지 않으면 남음")
        const wait = o.rules().temple.inactiveCapMs;
        if (wait <= 0) return 0;
        const due = await o.pool.query(
          `select ${HUMAN_COLUMNS}, u.owner_id from world_humans h join world_units u on u.id = h.unit_id
            where u.kind = $1 and h.born_at_ms + h.lifespan_ms + $4 <= $2 order by h.unit_id limit $3`,
          [UNIT_KIND_HUMAN, nowMs, EXPIRE_BATCH, wait],
        );
        if (due.rows.length === 0) return 0;
        const humans = due.rows.map((row) => ({ ownerId: Number(row.owner_id), human: humanOf(row) }));
        const skills = await readSkills(
          o.pool,
          humans.map((entry) => entry.human.unitId),
        );
        let done = 0;
        for (const entry of humans)
          if (retire(entry.ownerId, entry.human, skills.get(entry.human.unitId) ?? [], o.now())) done += 1;
        await writer.durable();
        return done;
      } finally {
        expiring = false;
      }
    },

    async convert(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const first = myHuman(owner.ownerId, input.unit);
      if (first) return fail(first);
      const lab = labOf(input.buildingId);
      if (!lab.ok) return fail(lab.code);
      await writer.durable();
      const human = await readHuman(o.pool, input.unit);
      if (!human) return fail("unknown_unit");
      const skills = (await readSkills(o.pool, [input.unit])).get(input.unit) ?? [];
      // 읽는 동안 바뀌었을 수 있다 → 메모리로 다시 본다. 여기부터 커밋 전까지 기다림이 없다
      const again = myHuman(owner.ownerId, input.unit);
      if (again) return fail(again);
      const checked = labOf(input.buildingId);
      if (!checked.ok) return fail(checked.code);
      const at = o.now();
      if (human.bornAtMs + human.lifespanMs > at) return fail("not_inactive");
      if (checked.cityId === null || unitCity(o.maps, o.facilities, input.unit, at) !== checked.cityId)
        return fail("wrong_city");
      const cost = BigInt(Math.max(0, o.rules().fusion.geneConvertCurrency));
      if (String(cost) !== input.cost) return fail("cost_changed");
      if (ledger.balanceOf(owner.ownerId, ASSET_CREDIT) < cost) return fail("insufficient_funds");
      payServiceFee(
        o.facilities,
        ledger,
        owner.ownerId,
        { ownerId: checked.ownerId, buildingId: input.buildingId },
        cost,
        at,
        "gene_convert",
      );
      const genes = retire(owner.ownerId, human, skills, at);
      if (!genes) return fail("unknown_unit");
      await writer.durable();
      return { ok: true, unitId: input.unit, genes };
    },
  };
}
