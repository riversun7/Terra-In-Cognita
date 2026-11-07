// 유전자 명령(서버) — 기획 D-478(수명이 다한 휴먼·크리쳐의 스탯·스킬이 유전자로 남음, 스킬 유전자는 주입, 스탯 유전자는 인큐베이터),
// D-481(조합 속성 = 평균 + 오차), D-516(스탯 유전자 = 총합·분포·속성 인스턴스, 총합·주력 스탯 골라 적용, 합성은 확률로 오름·내림·그대로),
// D-099(사망은 수명이 다했을 때만), docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)". 판정은 @terra/sim society/genes.ts 한 벌이다.
// - 수명(expireDue·devExpire): 유저 휴먼(유닛 종류 4)의 태어난 시각 + 수명 ≤ 지금이면 1분 안에 수명이 다한다 → 그 유닛의 스탯 유전자 하나
//   (총합·분포·속성)와 배운 스킬마다 스킬 유전자 하나를 소유자에게 남기고, 지닌 물건·화물을 소유자에게 옮긴 뒤 유닛이 떠난다(지워진다).
//   [임시] 남는 곳 = 소유자 사이보그 본체가 듦(창고 자리는 질문 361). NPC 세력 휴먼은 유전자를 남기지 않는다(쓰는 곳이 없다, 질문).
// - 합성(synthesize): 같은 종 스탯 유전자 둘 → 새 스탯 유전자 하나(둘 다 사라짐). 시드 굴림 하나.
// - 주입(inject): 스킬 유전자 하나 → 내 휴먼이 그 스킬을 등급 1로 배운다(스킬 칸 규칙 = 팩 unit_kinds skillSlots, 이미 배운 스킬은 거절).
// - 인큐베이터(incubate): 휴먼 스탯 유전자 하나 → 새 휴먼(유닛 종류 4) 하나가 사이보그 본체 둘레에 태어난다(총합 또는 주력 스탯 적용, 속성은
//   유전자 값, 수명 T4 굴림). 팩에 인큐베이터 시설이 없어 개발 시험(dev·admin, gateway.ts)으로만 연다. 비용 없음 [임시](질문).
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
import type { Settlement } from "../world/settlement.ts";
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
}

export interface GeneCommands {
  synthesize(userId: string, input: { readonly a: number; readonly b: number }): Promise<GeneCommandResult>;
  inject(userId: string, input: { readonly gene: number; readonly unit: number }): Promise<GeneCommandResult>;
  incubate(
    userId: string,
    input: { readonly gene: number; readonly apply: GeneApply },
  ): Promise<GeneCommandResult>;
  devGrantGene(
    userId: string,
    input: { readonly kind: "stat" | "skill"; readonly skill?: string | undefined },
  ): Promise<GeneCommandResult>;
  devExpire(userId: string, input: { readonly unit: number }): Promise<GeneCommandResult>;
  /** 수명이 다한 유저 휴먼을 처리한다(1분마다). 처리한 휴먼 수 */
  expireDue(nowMs: number): Promise<number>;
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
   * 수명이 다한 휴먼 하나(한 번의 동기 처리): 유전자를 남기고, 지닌 것·화물을 소유자에게 옮기고, 유닛이 떠난다. 남은 유전자 칸 ID.
   * 메모리 유닛이 이미 없거나 휴먼이 아니거나 주인이 바뀌었으면 아무것도 하지 않는다(undefined)
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
    writer.remove("humans", { unit_id: human.unitId });
    found.map.removeUnit(human.unitId);
    return created;
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
      const cyborg = cyborgUnitOf(owner.ownerId);
      const motion = cyborg?.map.unitInfo(cyborg.id)?.motion;
      if (!cyborg || !motion) return fail("no_cyborg");
      const society = o.rules();
      const stats = incubateStats(statGeneOfPayload(record.gene), input.apply, society.fusion);
      const at = o.now();
      const point = positionAt(motion, at);
      const center = { x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) };
      // 한 번의 동기 처리: 유닛 → 유전자 지우기 → 휴먼 행(같은 커밋)
      const unitId = o.nextUnitId();
      let placed = false;
      for (const cell of spiralCells(center.x, center.y, PLACE_RADIUS)) {
        if (
          cyborg.map.addUnit({
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
      holdings.remove(record.id);
      const rng = createRng(o.seed());
      writer.upsert("humans", {
        unit_id: unitId,
        // [임시] 사는 도시 없음(노숙): 인큐베이터 시설·도시가 정해지지 않았다(질문)
        city_id: null,
        satisfaction_milli: START_SATISFACTION,
        born_at_ms: at,
        lifespan_ms: lifespanMs(rng.nextInt(10_000), society),
        rebirths: 0,
        level: 1,
        stats,
        elements: [...record.gene.elements],
      });
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
        const due = await o.pool.query(
          `select ${HUMAN_COLUMNS}, u.owner_id from world_humans h join world_units u on u.id = h.unit_id
            where u.kind = $1 and h.born_at_ms + h.lifespan_ms <= $2 order by h.unit_id limit $3`,
          [UNIT_KIND_HUMAN, nowMs, EXPIRE_BATCH],
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
  };
}
