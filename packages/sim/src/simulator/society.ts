// 시뮬레이터 세력·사회 — docs/adr/2026-10-31-faction-society-core.md "시뮬레이터"
// 진짜 규칙(society/*.ts)을 시뮬 세계에 붙인다: 도시 지분, 공성 결과 셋(D-520 약탈·점령·귀속·점령 상태, societyWar.ts) + 편입 제안,
// 하루마다 만족도(목표값으로 다가감)·수명·환생·상속(소유자에게만, D-469)·반란(전투가 켜져 있으면 도시 안 공성)·자본주의 독립·연구·기술 후퇴,
// 행정 건물 구인 카드(D-469 출생 없음: 인구는 구인으로만, societyRecruit.ts — 언제 살지는 NPC 규칙식 npc/policy.ts recruitPicks),
// 배당 주기마다 도시 세금 정산(D-304: 이자 → 운영비 → 남은 이익을 체제대로), 공물 주기마다 봉신 공물.
// 전쟁·강화(D-256·D-290·D-292): 선포 비용, 교전 시각, 백지 강화(S5), 강화 조약의 불가침(society/wars.ts).
// 무엇을 해 볼지(치기·마을·지분·연구·강화·봉신 독립)는 NPC 판단(npcRun.ts → npc/brain.ts), 고를 수 있는 칸(점령 처리·마을 체제·
// 편입 답·독립 찬성)은 NPC 규칙식(npc/policy.ts, docs/adr/2026-11-01-npc-brain-r5.md).
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import { type OccupationChoice, answerOffer, foundingChoice, independenceYes } from "../npc/policy.ts";
import { inheritTraits } from "../npc/traits.ts";
import { declareWar, endWar, endedWars, makePeace, recordFight, warCost } from "../society/wars.ts";
import { satisfactionTarget, satisfactionToward, shiftSatisfaction } from "../society/labor.ts";
import { NO_INJURY, injuryNow } from "../society/injury.ts";
import {
  type IncorporationOffer,
  makeOffers,
  occupationShifts,
  resolveOffer,
  settleShares,
} from "../society/occupation.ts";
import { deathFate, inherit, lifespanMs } from "../society/population.ts";
import {
  type RecruitCoefficients,
  type RecruitProfile,
  rollFoundingProfile,
} from "../society/recruitment.ts";
import {
  type Regime,
  holdingsOf,
  issueShares,
  shareAsset,
  totalShares,
  transferShares,
} from "../society/shares.ts";
import { advanceTech, techCeiling } from "../society/tech.ts";
import { capitalistIndependence, independenceAllowed, rebelsOf } from "../society/uprising.ts";
import { DAY_MS } from "./metrics.ts";
import { checkSociety } from "./societyCheck.ts";
import { createSocietyPayouts } from "./societyPayouts.ts";
import { createSocietyRecruit } from "./societyRecruit.ts";
import { createSocietyRuins } from "./societyRuins.ts";
import { createSocietyWar } from "./societyWar.ts";
import type { SocietyOptions, SocietyRun } from "./societyTypes.ts";
import {
  HOMELESS,
  STREAM_TRAITS,
  type SimCity,
  type SimFaction,
  type SimUnit,
  TEST_ASSET_CREDIT,
  newFaction,
  rulingFamilyOf,
  streamRng,
  transferAsset,
  transferCity,
} from "./world.ts";

/** 난수 흐름(세계 시드에서 갈라 쓴다): 세력·사회. 유닛마다 차례 0 = 나이·수명, 1 = 처음 인구 스탯(foundingProfileOf) */
export const STREAM_SOCIETY = 4;

/**
 * 처음부터 있던 휴먼의 스탯·속성(기획 답 774 나): (세계 시드, 유닛 ID)의 세력·사회 흐름 차례 1로 그 도시 행정 레벨 구인 카드 규칙을 굴린다
 * (rollFoundingProfile). 시뮬 처음 휴먼과 서버 처음 인구·옛 휴먼 채우기(apps/server/src/npc/runtime.ts)가 같은 값을 낸다
 */
export function foundingProfileOf(
  seed: number,
  unitId: number,
  adminLevel: number,
  c: RecruitCoefficients,
): RecruitProfile {
  return rollFoundingProfile(adminLevel, streamRng(seed, STREAM_SOCIETY, unitId, 1), c);
}
/** [임시] 휴먼 지갑의 원장 주체 ID = 이 값 + 유닛 ID(휴먼 주체 표가 생기기 전) */
export const WALLET_BASE = 1_000_000_000;

/** 휴먼 평균 만족도(밀리점) */
const average = (units: readonly SimUnit[]): number =>
  units.length === 0 ? 0 : Math.floor(units.reduce((sum, u) => sum + u.satisfactionMilli, 0) / units.length);

/** 날 수 주기(시뮬은 하루 끝에만 돈다: ms 주기를 날 수로 내림, 최소 하루) */
const periodDays = (ms: number): number => Math.max(1, Math.floor(ms / DAY_MS));

export function attachSociety(o: SocietyOptions, startMs: number): SocietyRun {
  const { world, c, recorder } = o;
  const book: LedgerBook = world.book;
  const s = o.settings;
  const counts = {
    deaths: 0,
    reborn: 0,
    deified: 0,
    won: 0,
    suppressed: 0,
    calmed: 0,
    independence: 0,
    founded: 0,
    loot: 0,
    integrate: 0,
    delisted: 0,
    accepted: 0,
    refused: 0,
    expired: 0,
    shareSales: 0,
    researchBuilt: 0,
    vassalBreaks: 0,
    warsDeclared: 0,
    treaties: 0,
    whitePeace: 0,
    stalled: 0,
    ruined: 0,
    occupied: 0,
    damaged: 0,
    fled: 0,
    homeless: 0,
    wandering: 0,
    dispersed: 0,
  };
  const offers: IncorporationOffer[] = [];
  let day = o.restoreDay ?? 0;

  const treasuryAsset = (f: SimFaction): string => o.hooks?.treasuryAsset(f) ?? TEST_ASSET_CREDIT;
  const payouts = createSocietyPayouts(world, c, o.hooks, treasuryAsset);
  const recruits = createSocietyRecruit({
    world,
    c,
    hooks: o.hooks,
    treasuryAsset,
    scheduleUnit: o.scheduleUnit,
  });
  const treasury = (f: SimFaction): bigint => book.balanceOf(f.id, treasuryAsset(f));
  const unitsByCity = (): Map<number, SimUnit[]> => {
    const map = new Map<number, SimUnit[]>();
    for (const unit of [...world.units.values()].toSorted((a, b) => a.id - b.id)) {
      const list = map.get(unit.city) ?? [];
      list.push(unit);
      map.set(unit.city, list);
    }
    return map;
  };
  const sortedCities = (): SimCity[] => [...world.cities.values()].toSorted((a, b) => a.id - b.id);

  // 차리기: 나이·수명 흩기, 처음 휴먼 스탯(774 나 — 그 도시 행정 레벨 구인 카드 규칙, 구인 카드 휴먼은 그대로), 도시마다 지분 1000주(D-130)를
  // 도시 주인에게, 기술 단계는 지상 상한 안. 이어 돌리기(서버)는 수명·스탯이 저장 값이고 지분은 없는 도시에만 낸다
  if (o.restoreDay === undefined)
    for (const unit of world.units.values()) {
      const rng = streamRng(world.seed, STREAM_SOCIETY, unit.id, 0);
      unit.lifespanMs = lifespanMs(rng.nextInt(10_000), c);
      unit.bornAtMs = startMs - Math.floor((unit.lifespanMs * rng.nextInt(10_000)) / 10_000);
      unit.recruit ??= foundingProfileOf(
        world.seed,
        unit.id,
        world.cities.get(unit.city)?.adminLevel ?? 1,
        c.recruit,
      );
    }
  for (const city of sortedCities())
    if (o.restoreDay === undefined || totalShares(book, city.id) === 0n)
      issueShares(book, city.id, [{ owner: city.owner, amount: BigInt(c.sharesPerCity) }], startMs);
  for (const faction of world.factions.values()) {
    faction.tech = Math.max(1, Math.min(c.techGroundMax, faction.tech));
    faction.research.blueprint = faction.tech;
  }

  const recordTech = (faction: SimFaction, nowMs: number, output: number, cause?: string): void => {
    const sites = [...faction.cities].flatMap((id) => {
      const city = world.cities.get(id);
      return city ? [{ researchLevel: city.researchLevel, development: city.development }] : [];
    });
    const state = {
      level: faction.tech,
      progress: faction.research.progress,
      blueprint: faction.research.blueprint,
    };
    for (const change of advanceTech(state, output, techCeiling(sites, c), c))
      recorder.tech(
        nowMs,
        faction.id,
        change.from,
        change.to,
        change.cause === "regression" ? (cause ?? "regression") : "research",
      );
    faction.tech = state.level;
    faction.research = { progress: state.progress, blueprint: state.blueprint };
  };

  /**
   * 도시가 없고 구성원(유닛)도 없으면 세력이 사라진다(D-294). 도시만 잃고 노숙 휴먼이 남으면 떠도는 세력으로 남는다(D-464 217).
   * 점령·반란·독립은 그 도시 유닛을 함께 옮기므로 마지막 도시를 잃으면 구성원도 없다
   */
  const dieIfEmpty = (
    faction: SimFaction,
    cause: string,
    into: SimFaction | undefined,
    nowMs: number,
  ): void => {
    if (!faction.alive || faction.cities.size > 0 || faction.units.size > 0) return;
    // 플레이어 가문은 도시 없는 세력으로 남는다(D-213·D-294 — 가문 행은 가문장이 해산한다)
    if (faction.player) return;
    if (into) {
      if (o.hooks) o.hooks.factionDied(faction, into, nowMs);
      else transferAsset(world, faction, into, TEST_ASSET_CREDIT, 1n, nowMs);
    }
    faction.alive = false;
    if (faction.eventId !== undefined) o.cancel(faction.eventId);
    faction.eventId = undefined;
    for (const other of world.factions.values()) {
      other.wars.delete(faction.id);
      other.lastFight.delete(faction.id);
      other.truces.delete(faction.id);
      if (other.overlord === faction.id) other.overlord = null;
    }
    recorder.died(nowMs, faction.id, cause, into ? { into: into.id } : {});
  };

  const spawnFaction = (
    parent: SimFaction,
    code: string,
    regime: Regime,
    overlord: number | null,
    nowMs: number,
  ) => {
    const id = world.nextFactionId();
    const child = newFaction(id, `${code}_${id}`, {
      fixed: false,
      tech: parent.tech,
      regime,
      settledAtMs: nowMs,
      overlord,
      // 유동 세력의 성향 = 부모 값 ± 폭(질문 192 가)
      traits: inheritTraits(parent.traits, streamRng(world.seed, STREAM_TRAITS, id, 0), c.npc),
    });
    child.research = { progress: 0, blueprint: parent.research.blueprint };
    child.bornOf = parent.id;
    world.factions.set(id, child);
    o.hooks?.factionBorn(child, parent);
    return child;
  };

  /** 새 세력은 태어날 때 자기 도시로 버틸 수 있는 단계에서 시작한다(후퇴로 세지 않는다) */
  const birthTech = (child: SimFaction): void => {
    const sites = [...child.cities].flatMap((id) => {
      const city = world.cities.get(id);
      return city ? [{ researchLevel: city.researchLevel, development: city.development }] : [];
    });
    child.tech = Math.min(child.tech, techCeiling(sites, c));
  };

  const moveCity = (cityId: number, from: SimFaction, to: SimFaction, nowMs: number): void => {
    o.hooks?.beforeCityTransfer(cityId, from, to, nowMs);
    transferCity(world, cityId, to, nowMs);
    payouts.cityMoved(cityId);
  };

  const removeUnit = (unit: SimUnit): void => {
    world.units.delete(unit.id);
    world.factions.get(unit.owner)?.units.delete(unit.id);
    if (unit.eventId !== undefined) o.cancel(unit.eventId);
    o.hooks?.unitsChanged?.(unit.city, -1);
  };

  const seizeShares = (cityId: number, from: number, to: number, nowMs: number): void => {
    const amount = book.balanceOf(from, shareAsset(cityId));
    if (amount <= 0n || from === to) return;
    book.post({
      kind: "transfer",
      atMs: nowMs,
      entries: [
        { account: book.ownerAccount(from, shareAsset(cityId)), amount: -amount },
        { account: book.ownerAccount(to, shareAsset(cityId)), amount },
      ],
    });
  };
  /**
   * 도시를 폐허로(웨이브 D-105·D-464 217 — 전쟁은 폐허를 만들지 않는다, D-520): 도시가 세계에서 빠지고 폐허로 남는다(D-510: 정부를 먼저 지은 쪽이 주인 → 복원
   * 사업, societyRuins.ts). 휴먼은 같은 세력의 가장 오래된 도시로 피난, 없으면 노숙(떠도는 세력). 도시 지분은 쓸모없는 채로 남는다(D-464 217).
   * 마지막 도시면 세력이 사라지거나(구성원도 없을 때 — cause·into) 떠돈다. 화폐 소멸(D-299)은 화폐를 찍는 세력만
   */
  const ruinCity = (
    city: SimCity,
    owner: SimFaction,
    nowMs: number,
    cause: string,
    into: SimFaction | undefined,
  ): void => {
    const cityId = city.id;
    o.hooks?.cityRuined?.(cityId, nowMs);
    ruins.record(city, nowMs);
    const refuge = [...owner.cities].filter((id) => id !== cityId).toSorted((a, b) => a - b)[0];
    for (const unit of [...world.units.values()].toSorted((a, b) => a.id - b.id)) {
      if (unit.city !== cityId) continue;
      if (refuge === undefined) {
        unit.city = HOMELESS;
        counts.homeless += 1;
      } else {
        unit.city = refuge;
        o.hooks?.unitsChanged?.(refuge, 1);
        counts.fled += 1;
      }
    }
    owner.cities.delete(cityId);
    world.cities.delete(cityId);
    payouts.cityMoved(cityId);
    recordTech(owner, nowMs, 0, "city_ruined");
    if (owner.cities.size === 0) {
      dieIfEmpty(owner, cause, into, nowMs);
      if (owner.alive) counts.wandering += 1;
      else counts.dispersed += 1;
    }
  };
  // 폐허 복원(D-510, societyRuins.ts): 폐허 기록·정부 짓기·모금·복원, 하루 끝(기한·사라진 세력), NPC "폐허 복원" 행동의 후보·실행
  const ruins = createSocietyRuins({
    world,
    c,
    hooks: o.hooks,
    treasuryAsset,
    onRestored: (faction, _city, nowMs) => recordTech(faction, nowMs, 0, "city_restored"),
  });
  // 공성 결과 셋(D-520·D-527, societyWar.ts): 약탈(정부 무너짐·꺼내 가기·재건)·점령 상태·점령·귀속 불이익
  const war = createSocietyWar({
    world,
    c,
    hooks: o.hooks,
    treasuryAsset,
    // 옛 세력이 정부를 재건하면 약탈 세력과 다시 전쟁(D-527). 선포 비용은 없다(재건이 전쟁을 되살린다)
    resumeWar: (owner, looter, nowMs) => {
      if (owner.wars.has(looter.id)) recordFight(owner, owner.id, looter, looter.id, nowMs);
      else declareWar(owner, owner.id, looter, looter.id, nowMs);
    },
    onEnd: o.onWarStateEnd,
  });

  return {
    ruins,
    occupy(attacker, target, cityId, decision: OccupationChoice, nowMs) {
      const city = world.cities.get(cityId);
      if (!city || city.start) return;
      // 점령자가 고른 결과(D-520 — NPC 규칙식 npc/policy.ts occupationChoice): 약탈 · 점령 상태 · 점령·귀속
      const { treatment, shares: choice } = decision;
      const cityUnits = (): SimUnit[] => [...world.units.values()].filter((unit) => unit.city === cityId);
      // 공성 승리는 교전이다(전쟁이 아니었으면 전쟁이 된다. 선포 비용은 판단이 선포할 때 냈다)
      const fight = (): void => {
        if (attacker.wars.has(target.id)) recordFight(attacker, attacker.id, target, target.id, nowMs);
        else declareWar(attacker, attacker.id, target, target.id, nowMs);
      };
      if (treatment === "loot") {
        // 약탈(D-527): 그 도시 정부가 무너진다. 소유는 원래 세력 그대로, 폐허가 되지 않는다. 옛 세력이 정부를 재건할 때까지 하루마다 금고·공공 창고를
        // 꺼내 간다(societyWar.ts). 공공 건물 일부가 부서진다(45 §10.4 — 연구 시설 −1)
        counts.loot += 1;
        const entry = war.raid(attacker, target, city, nowMs);
        const { satisfactionShift } = occupationShifts("loot", "keep", target.regime, target.regime, c);
        for (const unit of cityUnits())
          unit.satisfactionMilli = shiftSatisfaction(unit.satisfactionMilli, satisfactionShift);
        city.researchLevel = Math.max(0, city.researchLevel - 1);
        fight();
        recordTech(target, nowMs, 0, "raided");
        o.onWarOutcome?.({
          atMs: nowMs,
          city: cityId,
          attacker,
          target,
          outcome: "loot",
          taken: 0n,
          untilMs: entry.untilMs,
        });
        return;
      }
      if (treatment === "occupy") {
        // 점령 상태: 소유·체제는 그대로, 점령자가 세금 주기마다 그 도시 몫 세금을 거둔다(하루 끝, societyWar.ts). 정해진 끝은 없다(D-527)
        counts.occupied += 1;
        const entry = war.occupy(attacker, target, city, nowMs);
        for (const unit of cityUnits())
          unit.satisfactionMilli = shiftSatisfaction(unit.satisfactionMilli, -c.war.occupySatisfactionDrop);
        fight();
        o.onWarOutcome?.({
          atMs: nowMs,
          city: cityId,
          attacker,
          target,
          outcome: "occupy",
          taken: 0n,
          untilMs: entry.untilMs,
        });
        return;
      }
      // 점령·귀속: 도시를 가져간다(46 §5.1 ②~⑤) + 재건 비용(소각)·회복 불이익(societyWar.ts)
      const occupier = {
        treasury: attacker.id,
        regime: attacker.regime,
        rulingFamily: rulingFamilyOf(attacker),
      };
      const decided = settleShares(book, cityId, target.id, occupier, choice, nowMs, c);
      const shifts = occupationShifts("integrate", decided, target.regime, attacker.regime, c);
      for (const unit of cityUnits())
        unit.satisfactionMilli = shiftSatisfaction(unit.satisfactionMilli, shifts.satisfactionShift);
      counts.integrate += 1;
      if (decided === "delist") counts.delisted += 1;
      offers.push(...makeOffers(book, cityId, attacker.id, new Set([target.id]), nowMs, c));
      fight();
      moveCity(cityId, target, attacker, nowMs);
      const cost = war.annex(attacker, target, city, nowMs);
      o.onWarOutcome?.({
        atMs: nowMs,
        city: cityId,
        attacker,
        target,
        outcome: "integrate",
        shares: decided,
        taken: cost,
        untilMs: world.occupations.get(cityId)?.untilMs,
      });
      recordTech(target, nowMs, 0, "city_lost");
      dieIfEmpty(target, "conquered", attacker, nowMs);
    },

    found(parent, nowMs) {
      const byCity = unitsByCity();
      const crowded = [...parent.cities]
        .map((id) => world.cities.get(id))
        .find((city) => city && (byCity.get(city.id)?.length ?? 0) >= city.housing);
      const movers = crowded
        ? (byCity.get(crowded.id) ?? []).filter((u) => u.owner === parent.id).slice(-s.founders)
        : [];
      const asset = treasuryAsset(parent);
      if (!crowded || movers.length < s.founders || book.balanceOf(parent.id, asset) < s.foundCost) return;
      // 자리 검사(서버만: 다른 세력 영향권 밖의 빈 자리가 없으면 세우지 않는다)
      if (o.canFound && !o.canFound(parent, crowded.id, nowMs)) return;
      // [임시] 마을 세우기 값(가문 창설 비용 D-216 Step 5 전)
      book.post({
        kind: "burn",
        atMs: nowMs,
        entries: [
          { account: book.ownerAccount(parent.id, asset), amount: -s.foundCost },
          { account: book.systemAccount(`sink:${asset}`, asset), amount: s.foundCost },
        ],
      });
      // D-340: 세울 때 봉신 | 독립(+ 체제)을 고른다 — 세우는 가문(새 성향)의 규칙식(질문 198 가)
      const child = spawnFaction(parent, "house", parent.regime, null, nowMs);
      const plan = foundingChoice(child.traits, c.npc);
      const vassal = plan.vassal;
      if (plan.vassal) child.overlord = parent.id;
      else child.regime = plan.regime;
      const city: SimCity = {
        id: world.nextCityId(),
        owner: child.id,
        start: false,
        housing: crowded.housing,
        researchLevel: 0,
        // [임시] 새 마을 행정 건물 = Lv1(옛 마을회관, D-469). 올리는 길은 아직 없다
        adminLevel: 1,
        recruitDraw: null,
        development: 0,
        nextRebellionMs: nowMs,
      };
      world.cities.set(city.id, city);
      child.cities.add(city.id);
      for (const unit of movers) {
        parent.units.delete(unit.id);
        child.units.add(unit.id);
        o.hooks?.unitsChanged?.(unit.city, -1);
        unit.city = city.id;
        unit.owner = child.id;
      }
      o.hooks?.cityFounded?.(city.id, movers.length, nowMs);
      issueShares(book, city.id, [{ owner: child.id, amount: BigInt(c.sharesPerCity) }], nowMs);
      birthTech(child);
      counts.founded += 1;
      recorder.born(nowMs, child.id, "founding", {
        parent: parent.id,
        mode: vassal ? "vassal" : "independent",
        city: city.id,
      });
      o.scheduleFaction(child, nowMs);
    },

    sellShares(seller, cityId, nowMs) {
      if (!seller.cities.has(cityId)) return;
      // [임시] 사는 쪽 = 국고가 가장 많은 다른 살아 있는 세력, 수량·주당 값 = 설정 칸(d_share_sale_*, 출발값 100주·주당 10, 사는 쪽 국고 화폐)
      let buyer: SimFaction | undefined;
      for (const other of world.factions.values())
        if (other.alive && other.id !== seller.id && (!buyer || treasury(other) > treasury(buyer)))
          buyer = other;
      const amount = BigInt(c.shareSaleAmount);
      const price = amount * BigInt(c.shareSalePrice);
      if (!buyer || treasury(buyer) < price) return;
      const result = transferShares(
        book,
        { id: cityId, regime: seller.regime, ruler: seller.id },
        seller.id,
        buyer.id,
        amount,
        nowMs,
      );
      if (result !== "ok") return;
      const asset = treasuryAsset(buyer);
      book.post({
        kind: "transfer",
        atMs: nowMs,
        entries: [
          { account: book.ownerAccount(buyer.id, asset), amount: -price },
          { account: book.ownerAccount(seller.id, asset), amount: price },
        ],
      });
      counts.shareSales += 1;
    },

    buildResearch(faction, nowMs) {
      const city = [...faction.cities]
        .map((id) => world.cities.get(id))
        .filter((entry) => entry !== undefined && entry.researchLevel < c.techGroundMax)
        .toSorted((a, b) => (b?.development ?? 0) - (a?.development ?? 0) || (a?.id ?? 0) - (b?.id ?? 0))[0];
      if (!city) return;
      const asset = treasuryAsset(faction);
      const cost = s.researchBuildCost * BigInt(city.researchLevel + 1);
      if (book.balanceOf(faction.id, asset) < cost) return;
      book.post({
        kind: "burn",
        atMs: nowMs,
        entries: [
          { account: book.ownerAccount(faction.id, asset), amount: -cost },
          { account: book.systemAccount(`sink:${asset}`, asset), amount: cost },
        ],
      });
      city.researchLevel += 1;
      counts.researchBuilt += 1;
      payouts.spent(city.id, cost);
    },

    declareWar(attacker, target, nowMs) {
      if (!attacker.alive || !target.alive || attacker.wars.has(target.id)) return;
      // 무명분 선포 비용(S3, 질문 196 가): 국고의 만분율을 소각. 나에게서 떨어져 나간 반란 세력을 치는 것은 명분이 있다(D-290 해방)
      const asset = treasuryAsset(attacker);
      const cost = target.rebelOf === attacker.id ? 0n : warCost(book.balanceOf(attacker.id, asset), c.npc);
      if (cost > 0n)
        book.post({
          kind: "burn",
          atMs: nowMs,
          entries: [
            { account: book.ownerAccount(attacker.id, asset), amount: -cost },
            { account: book.systemAccount(`sink:${asset}`, asset), amount: cost },
          ],
        });
      declareWar(attacker, attacker.id, target, target.id, nowMs);
      counts.warsDeclared += 1;
    },

    makePeace(a, b, nowMs) {
      if (!a.wars.has(b.id)) return;
      makePeace(a, a.id, b, b.id, nowMs, c.npc);
      counts.treaties += 1;
    },

    ruin(cityId, nowMs) {
      // 웨이브 폐허(D-105·D-464 217): 시작 도시는 폐허가 되지 않는다(D-341)
      const city = world.cities.get(cityId);
      const owner = city ? world.factions.get(city.owner) : undefined;
      if (!city || !owner || city.start) return;
      counts.ruined += 1;
      ruinCity(city, owner, nowMs, "dispersed", undefined);
    },

    damage(cityId, nowMs) {
      // 시작 도시 건물 피해(D-341·D-464 217 가): 연구 시설 1레벨 내림 → 기술 상한이 내려가면 후퇴
      const city = world.cities.get(cityId);
      const owner = city ? world.factions.get(city.owner) : undefined;
      if (!city || !owner) return;
      city.researchLevel = Math.max(0, city.researchLevel - 1);
      counts.damaged += 1;
      recordTech(owner, nowMs, 0, "wave_damage");
    },

    breakVassal(faction) {
      // D-216: 독립 선언 = 상위 관계를 끊는 사건
      if (faction.overlord === null) return;
      faction.overlord = null;
      counts.vassalBreaks += 1;
    },

    recruitView: (hirer, cityId, nowMs) => recruits.view(hirer, cityId, nowMs),
    recruit: (hirer, cityId, slot, nowMs, guard, prepaid) =>
      recruits.hire(hirer, cityId, slot, nowMs, guard, prepaid),

    endOfDay(nowMs) {
      day += 1;
      recruits.rollDay();
      const rng = streamRng(world.seed, STREAM_SOCIETY, 0, day);
      // 노숙 휴먼(D-296): 세력에 도시가 있으면 가장 오래된 도시로 든다. 없으면 노숙인 채 만족도가 노숙 목표로 다가간다
      for (const unit of [...world.units.values()].toSorted((a, b) => a.id - b.id)) {
        if (unit.city !== HOMELESS) continue;
        const owner = world.factions.get(unit.owner);
        const shelter = owner ? [...owner.cities].toSorted((a, b) => a - b)[0] : undefined;
        if (shelter !== undefined) {
          unit.city = shelter;
          o.hooks?.unitsChanged?.(shelter, 1);
          continue;
        }
        const target = satisfactionTarget(
          {
            foodPm: 1000,
            housing: 0,
            wage: 0,
            topAverageWage: 0,
            faith: false,
            war: (owner?.wars.size ?? 0) > 0,
            injured: injuryNow(unit.injury ?? NO_INJURY, nowMs, c.injury).stage > 0,
          },
          c,
        );
        unit.satisfactionMilli = satisfactionToward(unit.satisfactionMilli, target, 1000, c);
      }
      let byCity = unitsByCity();
      for (const city of sortedCities()) {
        const owner = world.factions.get(city.owner);
        const units = byCity.get(city.id) ?? [];
        if (!owner) continue;
        // 만족도(D-433·D-438 5): 포만감 = 생필품 충족, 주거 = 주거 수 안이면 1등급, 넘으면 노숙, 전쟁
        // 경제가 없으면 생필품을 모델하지 않는다([임시] 충족으로 본다: S3 시험 유지비는 생필품이 아니다)
        const foodPm = o.hooks?.foodPmOf?.(city.id) ?? 1000;
        units.forEach((unit, index) => {
          const target = satisfactionTarget(
            {
              foodPm,
              housing: index < city.housing ? 1 : 0,
              wage: 0,
              topAverageWage: 0,
              faith: false,
              war: owner.wars.size > 0,
              injured: injuryNow(unit.injury ?? NO_INJURY, nowMs, c.injury).stage > 0,
            },
            c,
          );
          // 점령·귀속 회복 불이익(D-520): 오르는 빠르기만 느리다
          const dayPm = war.recoveryPm(city.id, unit.satisfactionMilli, target, nowMs);
          unit.satisfactionMilli = satisfactionToward(unit.satisfactionMilli, target, dayPm, c);
        });
        const avg = average(units);
        // [임시] 발전도(D-254 7요소 전): 만족도 몫(0~50) + 인구 몫(유닛 × 2, 30까지) + 연구 시설 Lv × 4 — 계수는 설정 칸(c.development)
        const dev = c.development;
        city.development = Math.min(
          dev.max,
          Math.floor(avg / dev.satisfactionDivisorMilli) +
            Math.min(dev.unitCap, units.length * dev.perUnit) +
            city.researchLevel * dev.perResearchLevel,
        );
      }

      // 수명(D-021·D-395): 환생 → 신격화 → 사망과 상속(D-469: 상속세는 도시 국고, 나머지는 소유자에게만. 자녀·배우자 없음)
      for (const unit of [...world.units.values()].toSorted((a, b) => a.id - b.id)) {
        if (unit.bornAtMs + unit.lifespanMs > nowMs) continue;
        const fate = deathFate(rng.nextInt(10_000), c);
        if (fate === "reborn") {
          unit.rebirths += 1;
          unit.bornAtMs = nowMs;
          unit.lifespanMs = lifespanMs(rng.nextInt(10_000), c);
          counts.reborn += 1;
          continue;
        }
        if (fate === "deified") counts.deified += 1;
        else {
          // 국고 = 사는 도시 주인(노숙이면 소유 세력), 소유자 = 그 휴먼의 주인(NPC 세력)
          const treasuryOwner = world.cities.get(unit.city)?.owner ?? unit.owner;
          inherit(book, WALLET_BASE + unit.id, unit.owner, treasuryOwner, nowMs, c);
          o.onDeath?.(unit, nowMs);
          counts.deaths += 1;
        }
        removeUnit(unit);
      }

      // 떠도는 세력은 구성원이 모두 떠나면(수명) 사라진다(D-294·D-464 217)
      for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
        if (!faction.alive || faction.cities.size > 0 || faction.units.size > 0 || faction.player) continue;
        counts.dispersed += 1;
        dieIfEmpty(faction, "dispersed", undefined, nowMs);
      }

      // 반란(D-253·D-256): 도시 평균 ≤ 문턱이면 문턱 이하 휴먼이 반란군. 시작 도시는 만족도 회복 사건(D-341)
      byCity = unitsByCity();
      for (const city of sortedCities()) {
        const parent = world.factions.get(city.owner);
        const units = byCity.get(city.id) ?? [];
        if (!parent?.alive || nowMs < city.nextRebellionMs) continue;
        const rebels = new Set(rebelsOf(units, c));
        if (rebels.size === 0) continue;
        city.nextRebellionMs = nowMs + s.rebellionCooldownDays * DAY_MS;
        const rebelUnits = units.filter((u) => rebels.has(u.id));
        const loyal = units.filter((u) => !rebels.has(u.id));
        const won = o.combat
          ? o.combat.rebellion(parent, rebelUnits, loyal, nowMs)
          : rebelUnits.length * 2 > units.length;
        if (!won) {
          counts.suppressed += 1;
          continue;
        }
        if (city.start) {
          counts.calmed += 1;
          for (const unit of units) unit.satisfactionMilli = Math.max(unit.satisfactionMilli, 60_000);
          continue;
        }
        const child = spawnFaction(parent, "rebel", parent.regime, null, nowMs);
        // 반란 세력은 원래 세력과 전쟁으로 시작한다(D-256, 선포 비용 없음). 정부는 소탕하려 한다(46 §2.4)
        // 반란의 반란이면 맨 처음 나라가 그대로 되찾으려 한다(빼앗긴 옛 도시 = 해방·종주권 명분, D-290)
        child.rebelOf = parent.rebelOf ?? parent.id;
        declareWar(child, child.id, parent, parent.id, nowMs);
        seizeShares(city.id, parent.id, child.id, nowMs);
        moveCity(city.id, parent, child, nowMs);
        birthTech(child);
        for (const unit of rebelUnits) unit.satisfactionMilli = Math.max(unit.satisfactionMilli, 50_000);
        counts.won += 1;
        recorder.born(nowMs, child.id, "rebellion", { parent: parent.id, tech: child.tech, city: city.id });
        o.scheduleFaction(child, nowMs);
        recordTech(parent, nowMs, 0, "city_lost");
        dieIfEmpty(parent, "rebellion", child, nowMs);
      }

      // 자본주의 독립(D-300·D-301): 지분 1위(지배 주체 아님)가 열고, 다른 주주는 규칙식으로 찬성(질문 198 가)
      for (const city of sortedCities()) {
        const parent = world.factions.get(city.owner);
        if (
          !parent?.alive ||
          parent.regime !== "capitalism" ||
          !independenceAllowed(parent.regime, city.start)
        )
          continue;
        const holdings = holdingsOf(book, city.id);
        const yes = new Set(
          holdings
            .map((h) => h.owner)
            .filter((owner) => {
              const holder = world.factions.get(owner);
              return (
                owner !== parent.id &&
                holder?.alive === true &&
                independenceYes(holder.traits, holder.wars.has(parent.id), c.npc)
              );
            }),
        );
        const vote = capitalistIndependence(holdings, parent.id, yes, c);
        if (vote.kind !== "declare" && vote.kind !== "passed") continue;
        const child = spawnFaction(parent, "free", "capitalism", null, nowMs);
        moveCity(city.id, parent, child, nowMs);
        birthTech(child);
        counts.independence += 1;
        recorder.born(nowMs, child.id, "independence", { parent: parent.id, city: city.id });
        o.scheduleFaction(child, nowMs);
        recordTech(parent, nowMs, 0, "city_lost");
        dieIfEmpty(parent, "independence", child, nowMs);
      }

      // 편입 제안: 받는 세력의 규칙식(질문 198 가), 기한이 지나면 만료 = 거부(D-347). 세력이 아닌 주인은 기한까지 답하지 않는다
      for (const offer of offers) {
        if (offer.state !== "pending") continue;
        const holder = world.factions.get(offer.owner);
        const answer =
          nowMs >= offer.deadlineMs
            ? "expired"
            : holder?.alive
              ? answerOffer(holder.traits, holder.wars.has(offer.occupier), c.npc)
              : undefined;
        if (answer === undefined) continue;
        resolveOffer(book, offer, answer, nowMs);
        counts[answer] += 1;
      }
      offers.splice(0, offers.length, ...offers.filter((offer) => offer.state === "pending"));

      // 백지 강화(D-292·S5, 질문 194 가): 마지막 교전부터 기간이 지난 전쟁은 끝난다(불가침 없음)
      for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
        if (!faction.alive) continue;
        for (const otherId of endedWars(faction, nowMs, c.npc)) {
          const other = world.factions.get(otherId);
          if (!other) continue;
          endWar(faction, faction.id, other, other.id);
          counts.whitePeace += 1;
        }
        for (const [otherId, until] of faction.truces) if (until <= nowMs) faction.truces.delete(otherId);
      }

      // 연구·기술(질문 121·D-396): 연구 시설 레벨 × 하루 작업량, 상한이 내려가면 바로 후퇴
      for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
        if (!faction.alive) continue;
        let output = 0;
        for (const id of faction.cities)
          output += (world.cities.get(id)?.researchLevel ?? 0) * s.researchPerLevelDaily;
        recordTech(faction, nowMs, output, "regression");
      }

      // 점령 상태 세금·끝, 회복 불이익 끝(D-520, societyWar.ts) — 배당 정산 전(점령자가 가져간 뒤 남은 국고로 정산)
      war.endOfDay(nowMs);
      if (day % periodDays(c.dividendEveryMs) === 0) payouts.settleDividends(nowMs);
      if (day % periodDays(c.tributeEveryMs) === 0) payouts.payTribute(nowMs);
      // 폐허 복원 NPC 규칙식(정부 짓기·넣기·투자, societyRuins.ts)
      ruins.endOfDay(nowMs);

      // 굶어 멈춤(D-220, 기술 정의): 국고 0 + 가장 모자란 도시의 생필품 충족 < 문턱이 며칠 이어짐. 처음 닿을 때 한 번 센다
      for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
        if (!faction.alive) continue;
        let food = 1000;
        for (const id of faction.cities) food = Math.min(food, o.hooks?.foodPmOf?.(id) ?? 1000);
        faction.stalledDays =
          treasury(faction) <= 0n && food < c.npc.stallFoodPm ? faction.stalledDays + 1 : 0;
        if (faction.stalledDays === c.npc.stallDays) counts.stalled += 1;
      }
    },

    dayFields(faction) {
      const units = [...faction.units].flatMap((id) => {
        const unit = world.units.get(id);
        return unit ? [unit] : [];
      });
      return {
        satisfaction: Math.floor(average(units) / 1000),
        regime: faction.regime,
        overlord: faction.overlord,
        recruited: recruits.dayCount(faction.id),
      };
    },

    check(nowMs) {
      return [...checkSociety(world, offers, c, nowMs), ...ruins.check(), ...war.check()];
    },
    currentDay: () => day,
    summary() {
      const units = [...world.units.values()];
      const spent: Record<string, string> = {};
      for (const asset of [...recruits.counts.spent.keys()].toSorted())
        spent[asset] = String(recruits.counts.spent.get(asset) ?? 0n);
      return {
        recruited: recruits.counts.recruited,
        recruitSpent: spent,
        deaths: counts.deaths,
        reborn: counts.reborn,
        deified: counts.deified,
        rebellions: { won: counts.won, suppressed: counts.suppressed, calmed: counts.calmed },
        independence: counts.independence,
        founded: counts.founded,
        occupations: {
          loot: counts.loot,
          integrate: counts.integrate,
          occupy: counts.occupied,
          delisted: counts.delisted,
          ...war.summary(),
        },
        offers: { accepted: counts.accepted, refused: counts.refused, expired: counts.expired },
        shareSales: counts.shareSales,
        researchBuilt: counts.researchBuilt,
        vassalBreaks: counts.vassalBreaks,
        dividends: {
          settlements: payouts.counts.settlements,
          payouts: payouts.counts.payouts,
          toTreasury: payouts.counts.toTreasury,
        },
        tributes: payouts.counts.tributes,
        wars: { declared: counts.warsDeclared, treaties: counts.treaties, whitePeace: counts.whitePeace },
        stalled: counts.stalled,
        ruins: {
          ruined: counts.ruined,
          damaged: counts.damaged,
          fled: counts.fled,
          homeless: counts.homeless,
          wandering: counts.wandering,
          dispersed: counts.dispersed,
          ...ruins.summary(),
        },
        satisfaction: Math.floor(average(units) / 1000),
      };
    },
  };
}

export type { SocietyOptions, SocietyRun, SocietySummary } from "./societyTypes.ts";
