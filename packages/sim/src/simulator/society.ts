// 시뮬레이터 세력·사회 — docs/adr/2026-10-31-faction-society-core.md "시뮬레이터"
// 진짜 규칙(society/*.ts)을 시뮬 세계에 붙인다: 도시 지분, 점령(대리 판단이 고른 약탈·통합·지분 처리) + 편입 제안,
// 하루마다 만족도(목표값으로 다가감)·출생·수명·환생·상속·반란(전투가 켜져 있으면 도시 안 공성)·자본주의 독립·연구·기술 후퇴,
// 배당 주기마다 도시 세금 정산(D-304: 이자 → 운영비 → 남은 이익을 체제대로), 공물 주기마다 봉신 공물.
// 무엇을 해 볼지(치기·마을 세우기·지분 팔기·연구 시설·봉신 독립)는 대리 판단(stubRules.ts, R5가 대신).
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import { JOB_GATHER, PHASE_WORK } from "../settle/settle.ts";
import { satisfactionTarget, satisfactionToward, shiftSatisfaction } from "../society/labor.ts";
import {
  type IncorporationOffer,
  makeOffers,
  occupationShifts,
  resolveOffer,
  settleShares,
} from "../society/occupation.ts";
import { birthRoll, canBirth, deathFate, inherit, lifespanMs } from "../society/population.ts";
import { type Regime, holdingsOf, issueShares, shareAsset, transferShares } from "../society/shares.ts";
import { advanceTech, techCeiling } from "../society/tech.ts";
import { capitalistIndependence, independenceAllowed, rebelsOf } from "../society/uprising.ts";
import { DAY_MS } from "./metrics.ts";
import { checkSociety } from "./societyCheck.ts";
import { createSocietyPayouts } from "./societyPayouts.ts";
import type { SocietyOptions, SocietyRun } from "./societyTypes.ts";
import {
  type SimCity,
  type SimFaction,
  type SimUnit,
  TEST_ASSET_CREDIT,
  newFaction,
  streamRng,
  transferAsset,
  transferCity,
} from "./world.ts";

/** 난수 흐름(세계 시드에서 갈라 쓴다): 세력·사회 */
export const STREAM_SOCIETY = 4;
/** [임시] 휴먼 지갑의 원장 주체 ID = 이 값 + 유닛 ID(휴먼 주체 표가 생기기 전) */
export const WALLET_BASE = 1_000_000_000;
const REGIMES: readonly Regime[] = ["dictatorship", "democracy", "capitalism"];

/** 휴먼 평균 만족도(밀리점) */
const average = (units: readonly SimUnit[]): number =>
  units.length === 0 ? 0 : Math.floor(units.reduce((sum, u) => sum + u.satisfactionMilli, 0) / units.length);

/** 날 수 주기(시뮬은 하루 끝에만 돈다: ms 주기를 날 수로 내림, 최소 하루) */
const periodDays = (ms: number): number => Math.max(1, Math.floor(ms / DAY_MS));

export function attachSociety(o: SocietyOptions, startMs: number): SocietyRun {
  const { world, c, recorder } = o;
  const book: LedgerBook = world.book;
  const s = o.scenario.society;
  const counts = {
    births: 0,
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
  };
  const offers: IncorporationOffer[] = [];
  let day = 0;

  const treasuryAsset = (f: SimFaction): string => o.hooks?.treasuryAsset(f) ?? TEST_ASSET_CREDIT;
  const payouts = createSocietyPayouts(world, c, o.hooks, treasuryAsset);
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

  // 차리기: 나이·수명 흩기, 도시마다 지분 1000주(D-130)를 도시 주인에게, 기술 단계는 지상 상한 안
  for (const unit of world.units.values()) {
    const rng = streamRng(world.seed, STREAM_SOCIETY, unit.id, 0);
    unit.lifespanMs = lifespanMs(rng.nextInt(10_000), c);
    unit.bornAtMs = startMs - Math.floor((unit.lifespanMs * rng.nextInt(10_000)) / 10_000);
  }
  for (const city of sortedCities())
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

  /** 도시가 없고 유닛도 없으면 세력이 사라진다(D-294) */
  const dieIfEmpty = (
    faction: SimFaction,
    cause: string,
    into: SimFaction | undefined,
    nowMs: number,
  ): void => {
    if (!faction.alive || faction.cities.size > 0) return;
    if (into) {
      if (o.hooks) o.hooks.factionDied(faction, into, nowMs);
      else transferAsset(world, faction, into, TEST_ASSET_CREDIT, 1n, nowMs);
    }
    faction.alive = false;
    if (faction.eventId !== undefined) o.cancel(faction.eventId);
    faction.eventId = undefined;
    for (const other of world.factions.values()) {
      other.wars.delete(faction.id);
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
    });
    child.research = { progress: 0, blueprint: parent.research.blueprint };
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

  return {
    occupy(attacker, target, cityId, rolls, nowMs) {
      const city = world.cities.get(cityId);
      if (!city || city.start) return;
      // [임시] 대리 판단: 약탈·통합 반반, 상장폐지 3분의 1
      const treatment = (rolls[0] ?? 0) % 2 === 0 ? "loot" : "integrate";
      const choice = (rolls[1] ?? 0) % 3 === 0 ? "delist" : "keep";
      const decided = settleShares(book, cityId, target.id, attacker.id, attacker.regime, choice, nowMs, c);
      const shifts = occupationShifts(treatment, decided, target.regime, attacker.regime, c);
      for (const unit of world.units.values())
        if (unit.city === cityId)
          unit.satisfactionMilli = shiftSatisfaction(unit.satisfactionMilli, shifts.satisfactionShift);
      if (treatment === "loot") {
        counts.loot += 1;
        city.researchLevel = Math.max(0, city.researchLevel - 1);
        // 약탈: 도시 금고 몫(국고 ÷ 도시 수 × 만분율)을 가져간다(D-186)
        const share =
          (treasury(target) * BigInt(c.lootTakeBp)) / 10_000n / BigInt(Math.max(1, target.cities.size));
        if (share > 0n)
          book.post({
            kind: "loot",
            atMs: nowMs,
            entries: [
              { account: book.ownerAccount(target.id, treasuryAsset(target)), amount: -share },
              { account: book.ownerAccount(attacker.id, treasuryAsset(target)), amount: share },
            ],
          });
      } else counts.integrate += 1;
      if (decided === "delist") counts.delisted += 1;
      offers.push(...makeOffers(book, cityId, attacker.id, new Set([target.id]), nowMs, c));
      attacker.wars.add(target.id);
      target.wars.add(attacker.id);
      moveCity(cityId, target, attacker, nowMs);
      recordTech(target, nowMs, 0, "city_lost");
      dieIfEmpty(target, "conquered", attacker, nowMs);
    },

    found(parent, roll, nowMs) {
      const byCity = unitsByCity();
      const crowded = [...parent.cities]
        .map((id) => world.cities.get(id))
        .find((city) => city && (byCity.get(city.id)?.length ?? 0) >= city.housing);
      const movers = crowded
        ? (byCity.get(crowded.id) ?? []).filter((u) => u.owner === parent.id).slice(-s.founders)
        : [];
      const asset = treasuryAsset(parent);
      if (!crowded || movers.length < s.founders || book.balanceOf(parent.id, asset) < s.foundCost) return;
      // [임시] 마을 세우기 값(가문 창설 비용 D-216 Step 5 전)
      book.post({
        kind: "burn",
        atMs: nowMs,
        entries: [
          { account: book.ownerAccount(parent.id, asset), amount: -s.foundCost },
          { account: book.systemAccount(`sink:${asset}`, asset), amount: s.foundCost },
        ],
      });
      // D-340: 세울 때 봉신 | 독립(+ 체제)을 고른다. [임시] 대리 판단 반반
      const vassal = roll % 2 === 0;
      const regime = vassal ? parent.regime : (REGIMES[(roll >> 1) % REGIMES.length] ?? "democracy");
      const child = spawnFaction(parent, "house", regime, vassal ? parent.id : null, nowMs);
      const city: SimCity = {
        id: world.nextCityId(),
        owner: child.id,
        start: false,
        housing: crowded.housing,
        researchLevel: 0,
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

    sellShares(seller, roll, nowMs) {
      const cities = [...seller.cities].filter((id) => book.balanceOf(seller.id, shareAsset(id)) > 0n);
      const cityId = cities[roll % Math.max(1, cities.length)];
      if (cityId === undefined) return;
      // [임시] 사는 쪽 = 국고가 가장 많은 다른 살아 있는 세력, 값 = 주당 10(사는 쪽 국고 화폐)
      let buyer: SimFaction | undefined;
      for (const other of world.factions.values())
        if (other.alive && other.id !== seller.id && (!buyer || treasury(other) > treasury(buyer)))
          buyer = other;
      const amount = 100n;
      const price = amount * 10n;
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

    breakVassal(faction) {
      // D-216: 독립 선언 = 상위 관계를 끊는 사건
      if (faction.overlord === null) return;
      faction.overlord = null;
      counts.vassalBreaks += 1;
    },

    endOfDay(nowMs) {
      day += 1;
      const rng = streamRng(world.seed, STREAM_SOCIETY, 0, day);
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
              injured: false,
            },
            c,
          );
          unit.satisfactionMilli = satisfactionToward(unit.satisfactionMilli, target, 1000, c);
        });
        const avg = average(units);
        // [임시] 발전도(D-254 7요소 전): 만족도 몫(0~50) + 인구 몫(유닛 × 2, 30까지) + 연구 시설 Lv × 4
        city.development = Math.min(
          100,
          Math.floor(avg / 2000) + Math.min(30, units.length * 2) + city.researchLevel * 4,
        );
        // 출생(질문 120): 하루에 출생 주기 수만큼 굴린다
        let population = units.length;
        for (let k = 0; k < Math.floor(DAY_MS / c.birthEveryMs); k++) {
          const roll = rng.nextInt(10_000);
          if (!canBirth(population, city.housing, avg, c) || !birthRoll(roll, c)) continue;
          const parents =
            units.length >= 2 ? [units[rng.nextInt(units.length)]?.id ?? 0, units[0]?.id ?? 0] : [];
          const unit: SimUnit = {
            id: world.nextUnitId(),
            city: city.id,
            owner: owner.id,
            job: { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 },
            pos: { x: rng.nextInt(0x4_0000), y: rng.nextInt(0x4_0000) },
            tripStep: 0,
            eventId: undefined,
            satisfactionMilli: avg,
            bornAtMs: nowMs,
            lifespanMs: lifespanMs(rng.nextInt(10_000), c),
            parents,
            rebirths: 0,
          };
          world.units.set(unit.id, unit);
          owner.units.add(unit.id);
          o.hooks?.unitsChanged?.(city.id, 1);
          o.scheduleUnit(unit.id, nowMs);
          population += 1;
          counts.births += 1;
        }
      }

      // 수명(D-021·D-395): 환생 → 신격화 → 사망과 상속(D-332)
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
          const heirs: number[] = [];
          for (const other of world.units.values())
            if (other.id !== unit.id && other.parents.includes(unit.id)) heirs.push(WALLET_BASE + other.id);
          const owner = world.cities.get(unit.city)?.owner ?? unit.owner;
          inherit(
            book,
            WALLET_BASE + unit.id,
            heirs.toSorted((a, b) => a - b),
            owner,
            nowMs,
            c,
          );
          counts.deaths += 1;
        }
        removeUnit(unit);
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
        child.wars.add(parent.id);
        parent.wars.add(child.id);
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

      // 자본주의 독립(D-300·D-301): 지분 1위(지배 주체 아님)가 열고, 다른 주주는 찬성([임시] 대리 판단)
      for (const city of sortedCities()) {
        const parent = world.factions.get(city.owner);
        if (
          !parent?.alive ||
          parent.regime !== "capitalism" ||
          !independenceAllowed(parent.regime, city.start)
        )
          continue;
        const holdings = holdingsOf(book, city.id);
        const yes = new Set(holdings.map((h) => h.owner).filter((owner) => owner !== parent.id));
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

      // 편입 제안: 대리 판단(반반 수락), 기한이 지나면 만료 = 거부(D-347)
      for (const offer of offers) {
        if (offer.state !== "pending") continue;
        const answer = nowMs >= offer.deadlineMs ? "expired" : rng.nextInt(2) === 0 ? "accepted" : "refused";
        resolveOffer(book, offer, answer, nowMs);
        counts[answer] += 1;
      }
      offers.splice(0, offers.length, ...offers.filter((offer) => offer.state === "pending"));

      // 연구·기술(질문 121·D-396): 연구 시설 레벨 × 하루 작업량, 상한이 내려가면 바로 후퇴
      for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
        if (!faction.alive) continue;
        let output = 0;
        for (const id of faction.cities)
          output += (world.cities.get(id)?.researchLevel ?? 0) * s.researchPerLevelDaily;
        recordTech(faction, nowMs, output, "regression");
      }

      if (day % periodDays(c.dividendEveryMs) === 0) payouts.settleDividends(nowMs);
      if (day % periodDays(c.tributeEveryMs) === 0) payouts.payTribute(nowMs);
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
      };
    },

    check(nowMs) {
      return checkSociety(world, offers, c, nowMs);
    },
    summary() {
      const units = [...world.units.values()];
      return {
        births: counts.births,
        deaths: counts.deaths,
        reborn: counts.reborn,
        deified: counts.deified,
        rebellions: { won: counts.won, suppressed: counts.suppressed, calmed: counts.calmed },
        independence: counts.independence,
        founded: counts.founded,
        occupations: { loot: counts.loot, integrate: counts.integrate, delisted: counts.delisted },
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
        satisfaction: Math.floor(average(units) / 1000),
      };
    },
  };
}

export type { SocietyOptions, SocietyRun, SocietySummary } from "./societyTypes.ts";
