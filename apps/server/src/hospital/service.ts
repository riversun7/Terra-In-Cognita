// 병원 치료 서비스(서버) — 기획 D-521(사용자 원문 "병원이 있어야만 낫는 부상은 없다 … 병원은 건물등급, 의사 스탯, 스킬에 따라 회복 속도 매우
// 빠르고 비용이 들게함")·D-311(치료 = 의사·병원, 유저 시설 요금은 유저 수입), docs/adr/2026-11-08-injury.md. 규칙은 @terra/sim society/injury.ts
// 한 벌이다(시뮬과 같다).
// - 병원 = 의료 단계 시설(팩 hospital). 누구의 병원이든 쓴다. 다 지었고 30% 이상일 때만 치료한다(건물 서비스 works).
// - 의사 = 그 병원에 직무 배치된 유닛(노동 계약 서비스 workersAt — 직무 배치·노동 계약, 채집 시설과 같은 길, 산출 없음). 배율에는 가장 나은
//   의사 하나가 든다: INT + WIS(입은 장비·버프 포함, 공방 장인과 같은 셈 holdings primariesOf) + 배운 치유 스킬(모양 heal) 가장 높은 등급.
//   의사가 없어도 레벨 배율로 치료한다(확인 대기 질문 692).
// - 치료: 내 유닛(포로 아님)이 다쳤고, 그 유닛이 선 칸의 도시 = 병원이 선 도시, 병원 배율이 지금 배율보다 빠를 때. 남은 치유 시간이 배율만큼 줄고
//   이후 단계도 그 배율로 지난다. 요금 = 남은 치유 날 × 하루 값 × 레벨 몫(설정 칸 N55), 남의 병원 = 주인 수입, 내 병원 = 소각 [임시](신전과 같은 셈).
// - 개발 시험(dev_injure_unit): 내 유닛에 단계 하나를 지금 준다(dev·admin — 게이트웨이가 본다).
// 명령 하나 = 읽기(DB, 쓰기 대기열이 따라잡은 뒤) → 다시 확인(메모리) → 한 번의 동기 처리 → 커밋 뒤 답(U2).
import type { HospitalResultCode } from "@terra/protocol";
import type {
  HospitalOverviewResponse,
  HospitalView,
  InjuredUnitView,
  InjuryStage,
  TreatmentOption,
} from "@terra/shared/hospital";
import {
  type HospitalInput,
  type InjuryCoefficients,
  type Primaries,
  hospitalSpeedPm,
  injuryGreenAtMs,
  treatInjury,
  treatmentQuote,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { buildingPlace } from "../facilities/places.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import type { LaborService } from "../labor/service.ts";
import { payServiceFee, serviceFacility, unitCity } from "../temple/places.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import { injure, injuryNowOf, injuryStateOf, withInjury } from "../world/unitCondition.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";

/** 의료 시설 단계(팩 FACILITY_STAGES) */
export const MEDICAL_STAGE = "medical";

export type HospitalCommandResult =
  | {
      readonly ok: true;
      readonly unitId: number;
      readonly stage: number;
      readonly untilMs?: number | undefined;
      readonly greenAtMs?: number | undefined;
      readonly paid?: string | undefined;
    }
  | { readonly ok: false; readonly code: HospitalResultCode };

export interface HospitalServiceOptions {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  readonly facilities: WorldFacilities;
  /** 의사(병원에 직무 배치된 유닛) */
  readonly labor: Pick<LaborService, "workersAt">;
  /** 유닛 1차 스탯(입은 장비·버프 포함) */
  readonly primaries: (unitId: number) => Primaries;
  /** 치유 스킬(모양 heal) ID — 실효 스킬 자료 */
  readonly healSkills: () => ReadonlySet<string>;
  readonly hasCyborg: (userId: string) => boolean;
  /** 부상 설정 칸(실효 값, 부를 때마다) */
  readonly rules: () => InjuryCoefficients;
  readonly now: () => number;
  readonly ready: () => boolean;
}

export interface HospitalService {
  overview(
    viewer: { readonly id: string; readonly devGrant: boolean },
    nowMs: number,
  ): Promise<HospitalOverviewResponse>;
  treat(
    userId: string,
    input: { readonly buildingId: number; readonly unit: number; readonly cost: string },
  ): Promise<HospitalCommandResult>;
  devInjure(
    userId: string,
    input: { readonly unit: number; readonly stage: number },
  ): Promise<HospitalCommandResult>;
}

const fail = (code: HospitalResultCode): HospitalCommandResult => ({ ok: false, code });

const stageOf = (stage: number): InjuryStage => (stage >= 3 ? 3 : stage === 2 ? 2 : stage === 1 ? 1 : 0);

/** 병원 하나의 계산 자료(의사·배율) */
interface HospitalSite {
  readonly view: HospitalView;
  readonly ownerId: number | null;
  readonly input: HospitalInput;
}

export function createHospitalService(o: HospitalServiceOptions): HospitalService {
  const { ledger, writer, settlement } = o;

  const unitOf = (unitId: number) => {
    for (const map of o.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return { map, info };
    }
    return undefined;
  };

  const ownerFor = (userId: string): { ownerId: number } | { fail: HospitalResultCode } => {
    if (!o.ready()) return { fail: "busy" };
    if (!o.hasCyborg(userId)) return { fail: "no_cyborg" };
    const ownerId = settlement.findOwnerOfUser(userId);
    return ownerId === undefined ? { fail: "no_cyborg" } : { ownerId };
  };

  /** 유닛들의 치유 스킬 가장 높은 등급(DB unit_skills) */
  const skillGrades = async (unitIds: readonly number[]): Promise<Map<number, number>> => {
    const out = new Map<number, number>();
    if (unitIds.length === 0) return out;
    const heal = o.healSkills();
    if (heal.size === 0) return out;
    const result = await o.pool.query(
      `select unit_id, skill_id, grade from unit_skills where unit_id = any($1::bigint[])`,
      [unitIds],
    );
    for (const row of result.rows) {
      if (!heal.has(String(row.skill_id))) continue;
      const unitId = Number(row.unit_id);
      out.set(unitId, Math.max(out.get(unitId) ?? 0, Number(row.grade)));
    }
    return out;
  };

  /** 병원 건물 ID 목록(의료 단계 시설 줄) */
  const hospitalIds = (): number[] => {
    const catalog = o.facilities.catalog();
    const out: number[] = [];
    for (const [buildingId, record] of o.facilities.service.facilities)
      if (catalog.facility(record.facilityId)?.stage === MEDICAL_STAGE) out.push(buildingId);
    return out.toSorted((a, b) => a - b);
  };

  /** 병원들의 계산 자료(의사 = 직무 배치된 유닛 가운데 INT + WIS + 스킬 몫이 가장 큰 하나). ownerId = 보는 주체 */
  const sitesOf = async (ids: readonly number[], viewer: number | undefined): Promise<HospitalSite[]> => {
    const c = o.rules();
    const doctors = new Map(ids.map((id) => [id, o.labor.workersAt(id).map((worker) => worker.unitId)]));
    const grades = await skillGrades([...new Set([...doctors.values()].flat())]);
    const out: HospitalSite[] = [];
    for (const buildingId of ids) {
      const record = o.facilities.service.facilities.get(buildingId);
      const def = record ? o.facilities.catalog().facility(record.facilityId) : undefined;
      const place = buildingPlace(o.facilities.service.places, buildingId);
      if (!record || !def || !place) continue;
      let best: { unitId: number; stat: number; skillGrade: number; speed: number } | null = null;
      for (const unitId of doctors.get(buildingId) ?? []) {
        if (!unitOf(unitId)) continue;
        const p = o.primaries(unitId);
        const stat = Math.max(0, Math.trunc(p.int + p.wis));
        const skillGrade = grades.get(unitId) ?? 0;
        const speed = hospitalSpeedPm(
          { level: Math.max(1, record.level), doctorStat: stat, doctorSkillGrade: skillGrade },
          c,
        );
        if (!best || speed > best.speed) best = { unitId, stat, skillGrade, speed };
      }
      const input: HospitalInput = {
        level: Math.max(1, record.level),
        doctorStat: best?.stat ?? 0,
        doctorSkillGrade: best?.skillGrade ?? 0,
      };
      out.push({
        ownerId: place.ownerId,
        input,
        view: {
          buildingId,
          mapKey: place.mapKey,
          cityId: place.cityId,
          own: viewer !== undefined && place.ownerId === viewer,
          level: record.level,
          works: record.level >= 1 && o.facilities.service.works(buildingId),
          slots: Math.max(0, record.level) * Math.max(0, def.slotsPerLevel),
          doctors: doctors.get(buildingId)?.length ?? 0,
          doctor: best ? { unitId: best.unitId, stat: best.stat, skillGrade: best.skillGrade } : null,
          speedPm: hospitalSpeedPm(input, c),
        },
      });
    }
    return out;
  };

  return {
    async overview(viewer, nowMs) {
      const c = o.rules();
      const ownerId = o.ready() ? settlement.findOwnerOfUser(viewer.id) : undefined;
      const sites = o.ready() ? await sitesOf(hospitalIds(), ownerId) : [];
      const balance = ownerId === undefined ? 0n : ledger.balanceOf(ownerId, ASSET_CREDIT);
      const units: InjuredUnitView[] = [];
      if (ownerId !== undefined)
        for (const map of o.maps.values())
          map.forEachUnit((unit) => {
            if (unit.ownerId !== ownerId) return;
            const info = map.unitInfo(unit.id);
            if (!info) return;
            const now = injuryNowOf(info.condition, nowMs);
            const greenAtMs = injuryGreenAtMs(now, nowMs, c);
            if (now.stage <= 0 || now.untilMs === null || greenAtMs === null) return;
            const cityId = unitCity(o.maps, o.facilities, unit.id, nowMs);
            const options: TreatmentOption[] = [];
            if (info.condition.heldBy === null && cityId !== null)
              for (const site of sites) {
                if (!site.view.works || site.view.cityId !== cityId) continue;
                const quote = treatmentQuote(now, nowMs, site.input, c);
                if (!quote) continue;
                options.push({
                  buildingId: site.view.buildingId,
                  speedPm: quote.speedPm,
                  greenAtMs: quote.greenAtMs,
                  cost: String(quote.cost),
                  affordable: balance >= quote.cost,
                });
              }
            units.push({
              unit: unit.id,
              cyborg: unit.kind === UNIT_KIND_CYBORG,
              stage: stageOf(now.stage),
              untilMs: now.untilMs,
              greenAtMs,
              healPm: now.healPm,
              captive: info.condition.heldBy !== null,
              cityId,
              options: options.toSorted((a, b) => b.speedPm - a.speedPm || a.buildingId - b.buildingId),
            });
          });
      return {
        status: o.ready() ? "ready" : "not_ready",
        devGrant: viewer.devGrant,
        generatedAt: nowMs,
        currency: ASSET_CREDIT,
        balance: String(balance),
        healMs: [...c.healMs],
        hospitals: sites.map((site) => site.view),
        units: units.toSorted((a, b) => Number(b.cyborg) - Number(a.cyborg) || a.unit - b.unit),
      };
    },

    async treat(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const first = unitOf(input.unit);
      if (!first || first.info.ownerId !== owner.ownerId) return fail("unknown_unit");
      const pre = serviceFacility(o.facilities, input.buildingId, MEDICAL_STAGE);
      if (!pre.ok) return fail(pre.reason === "closed" ? "hospital_closed" : "not_hospital");
      await writer.durable();
      // 의사 스킬은 DB에서 읽는다 → 읽은 뒤에는 기다림 없이 메모리로 다시 본다
      const [site] = await sitesOf([input.buildingId], owner.ownerId);
      const found = unitOf(input.unit);
      if (!found || found.info.ownerId !== owner.ownerId) return fail("unknown_unit");
      if (found.info.condition.heldBy !== null) return fail("captive");
      const hospital = serviceFacility(o.facilities, input.buildingId, MEDICAL_STAGE);
      if (!hospital.ok) return fail(hospital.reason === "closed" ? "hospital_closed" : "not_hospital");
      if (!site) return fail("not_hospital");
      const at = o.now();
      const c = o.rules();
      const now = injuryNowOf(found.info.condition, at);
      if (now.stage <= 0) return fail("not_injured");
      if (hospital.cityId === null || unitCity(o.maps, o.facilities, input.unit, at) !== hospital.cityId)
        return fail("wrong_city");
      const quote = treatmentQuote(now, at, site.input, c);
      if (!quote) return fail("not_faster");
      if (String(quote.cost) !== input.cost) return fail("cost_changed");
      if (ledger.balanceOf(owner.ownerId, ASSET_CREDIT) < quote.cost) return fail("insufficient_funds");
      payServiceFee(ledger, owner.ownerId, hospital.ownerId, quote.cost, at, "hospital_treat");
      const treated = treatInjury(injuryStateOf(found.info.condition), at, quote.speedPm, c);
      found.map.setCondition(input.unit, withInjury(found.info.condition, treated));
      await writer.durable();
      return {
        ok: true,
        unitId: input.unit,
        stage: treated.stage,
        ...(treated.untilMs === null ? {} : { untilMs: treated.untilMs }),
        greenAtMs: quote.greenAtMs,
        paid: String(quote.cost),
      };
    },

    async devInjure(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const found = unitOf(input.unit);
      if (!found || found.info.ownerId !== owner.ownerId) return fail("unknown_unit");
      const at = o.now();
      const next = injure(found.info.condition, input.stage, at);
      if (next !== found.info.condition) found.map.setCondition(input.unit, next);
      await writer.durable();
      const now = injuryNowOf(next, at);
      const green = injuryGreenAtMs(now, at, o.rules());
      return {
        ok: true,
        unitId: input.unit,
        stage: now.stage,
        ...(now.untilMs === null ? {} : { untilMs: now.untilMs }),
        ...(green === null ? {} : { greenAtMs: green }),
      };
    },
  };
}
