// 유닛·사이보그 화면 자료 서비스 — tRPC 맥락의 roster(units.list·cyborg.get). 앱을 만들 때 한 번 만든다(trpc/createContext.ts).
// 실제 자료(세계 유닛·화물·포로, 계정 이름)에 시안 자료(preview, dev·admin만: 프로시저가 권한을 본 뒤 true)를 더한다.
// 응답의 이름 표는 응답에 나온 ID만 담는다(catalog.ts namesFor).
import {
  type CyborgBody,
  type CyborgGetResponse,
  type CyborgRanking,
  PRIMARY_STATS,
  type PrimaryStat,
  type RosterCondition,
  type RosterPrisoner,
  type RosterUnit,
  type UnitsListResponse,
} from "@terra/shared/roster";
import { type ConditionParts, HOME_HOUSING } from "@terra/sim";
import type { WorkerConditionView } from "../labor/condition.ts";
import type { HomeQuery, RosterServices, Viewer } from "../trpc/context.ts";
import type { CyborgService } from "../cyborg/service.ts";
import { cyborgLookOf } from "../cyborg/state.ts";
import { realCyborgBody } from "./cyborgBody.ts";
import { type GatherSheetSource, gatherSheetOf } from "./gatherSheet.ts";
import { type UnitGuideSource, unitGuideOf } from "./guide.ts";
import { type RosterCatalog, namesFor, testRosterCatalog } from "./catalog.ts";
import {
  FATIGUE_MAX,
  previewAuction,
  previewBases,
  previewCyborg,
  previewParties,
  previewPresets,
  previewPrisoners,
  previewUnits,
} from "./preview.ts";
import { BASELINE_BASE, NO_GEAR, type UnitGear, effectiveView } from "./unitBody.ts";
import { EMPTY_WORLD_ROSTER, type WorldRosterRow, type WorldRosterSource } from "./worldUnits.ts";

const worldId = (id: number): string => `w${id}`;

/** 유닛 컨디션을 읽는 곳(건물 서비스 facilities/world.ts condition, 세계가 준비된 뒤). 모르면 undefined */
export type ConditionReader = (unitId: number) => WorkerConditionView | ConditionParts | undefined;

/** 서버 컨디션 → 화면 한 줄(상한 = 설정 칸 condition_cap). 선호(D-535 1151 나)가 있으면 선호 몫·이름도 */
export function rosterConditionOf(
  parts: WorkerConditionView | ConditionParts | undefined,
  cap: number,
): RosterCondition | undefined {
  if (!parts) return undefined;
  const view = "preferences" in parts ? parts : undefined;
  const housing = view?.preferences.housing;
  return {
    total: parts.total,
    housing: parts.housing,
    food: parts.food,
    cap,
    preferredGrade: parts.preferredGrade,
    housingGrade: parts.housingGrade,
    housingPrefer: parts.housingPrefer,
    foodPrefer: parts.foodPrefer,
    ...(view?.favoriteFoodName ? { favoriteFood: view.favoriteFoodName } : {}),
    ...(housing === HOME_HOUSING
      ? { preferredHousing: "home" as const }
      : view?.preferredHousingName
        ? { preferredHousing: view.preferredHousingName }
        : {}),
  };
}

/** 유닛이 지닌 것을 읽는 곳(보유 물건 서비스, 세계가 준비된 뒤). 유닛 ID·시각 → 입은 물건·걸린 효과 */
export type GearReader = (unitId: number, nowMs: number) => UnitGear;

/**
 * 실제 세계 유닛 → 화면 한 줄. 이름·레벨이 아직 없다. 스탯 = [임시] 기본 몸 + 입은 장비·1차 스탯 버프(사이보그 화면·세계 전투 시작과
 * 같은 unitBody.ts, docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07 …)")
 */
export function realUnit(
  catalog: RosterCatalog,
  row: WorldRosterRow,
  gear: UnitGear = NO_GEAR,
  condition?: RosterCondition,
): RosterUnit {
  return {
    id: worldId(row.id),
    name: null,
    type: row.type,
    level: null,
    rebirths: 0,
    place: { planetId: row.planetId, mapKey: String(row.mapKey), domain: row.domain, base: null },
    job: row.job,
    energy: { kind: "fatigue", value: row.fatigue, max: FATIGUE_MAX },
    injury: row.injury,
    captive: row.captive,
    moving: row.moving,
    cargo: row.cargo,
    satisfaction: null,
    ...(condition ? { condition } : {}),
    party: null,
    ...effectiveView(catalog, BASELINE_BASE, gear),
    preview: false,
  };
}

/** 내가 잡은 실제 포로 → 화면 한 줄. 원래 주인의 로그인 아이디는 다른 플레이어에게 보이지 않는다(users.name) */
export function realPrisoner(row: WorldRosterRow): RosterPrisoner {
  return {
    id: worldId(row.id),
    type: row.type,
    name: null,
    owner: null,
    injury: row.injury,
    marketValue: null,
    preview: false,
  };
}

function usedNames(catalog: RosterCatalog, units: readonly RosterUnit[]) {
  const stats = new Set<string>();
  const items = new Set<string>();
  const skills = new Set<string>();
  const facilities = new Set<string>();
  const planets = new Set<string>();
  for (const unit of units) {
    if (unit.place) planets.add(unit.place.planetId);
    for (const row of unit.stats.secondary) stats.add(row.id);
    for (const slot of unit.slots) if (slot.item) items.add(slot.item.id);
    for (const cargo of unit.cargo) items.add(cargo.asset);
    for (const skill of unit.skills.list) skills.add(skill.id);
    if (unit.job?.kind === "facility") facilities.add(unit.job.facility);
  }
  return namesFor(catalog, { stats, items, skills, facilities, planets });
}

export function createRosterServices(
  options: {
    catalog?: RosterCatalog | undefined;
    world?: WorldRosterSource | undefined;
    /** 만든 사이보그(세계가 준비되면, docs/adr/2026-11-01-first-login-cyborg.md). 없으면 본체는 시안만 */
    cyborgs?: (() => Pick<CyborgService, "record" | "livingUnpaid"> | undefined) | undefined;
    /** 유닛이 입은 물건·걸린 효과(세계가 준비되면 보유 물건 서비스). 없으면 빈 몸 */
    gear?: (() => GearReader | undefined) | undefined;
    /** 사이보그 화면 랭킹 칸(경로마다 내 자리, docs/adr/2026-11-07-ranking.md). 없으면 빈 칸 */
    rankings?: ((userId: string) => Promise<CyborgRanking[]>) | undefined;
    /** 유닛 추천 표의 출처(실효 팩 + 분류 문턱, roster/guide.ts). 없으면 빈 표 */
    guide?: (() => UnitGuideSource | undefined) | undefined;
    /** 유닛 컨디션(D-534, 세계가 준비되면 건물 서비스)과 지금 상한(설정 칸 condition_cap). 없으면 화면에 컨디션 없음 */
    condition?: (() => { readonly read: ConditionReader; readonly cap: number } | undefined) | undefined;
    /** 사이보그 판 원자재별 채집 예상의 출처(실효 팩 채집 시설·티어 구간·중분류 이름, 2026-11-12). 없으면 줄 없음 */
    gatherSheet?: (() => GatherSheetSource | undefined) | undefined;
  } = {},
): RosterServices {
  const catalog = options.catalog ?? testRosterCatalog();
  const world = options.world ?? EMPTY_WORLD_ROSTER;
  const gearOf = (unitId: number | null, nowMs: number): UnitGear => {
    const read = options.gear?.();
    return read && unitId !== null ? read(unitId, nowMs) : NO_GEAR;
  };
  /** 본체 컨디션 칸(세계가 준비되지 않았거나 본체가 2차맵에 없으면 칸 없음) */
  const cyborgConditionOf = (unitId: number | null): { condition?: RosterCondition } => {
    const condition = options.condition?.();
    if (!condition || unitId === null) return {};
    const view = rosterConditionOf(condition.read(unitId), condition.cap);
    return view ? { condition: view } : {};
  };
  return {
    async units(viewer: Viewer, query: HomeQuery): Promise<UnitsListResponse> {
      const real = await world.read(viewer.id, query.now);
      const condition = options.condition?.();
      const units = real.units.map((row) =>
        realUnit(
          catalog,
          row,
          gearOf(row.id, query.now),
          condition ? rosterConditionOf(condition.read(row.id), condition.cap) : undefined,
        ),
      );
      const prisoners = real.prisoners.map(realPrisoner);
      if (query.preview) {
        units.push(...previewUnits(catalog, query.now));
        prisoners.push(...previewPrisoners(query.now));
      }
      return {
        units,
        prisoners,
        parties: query.preview ? previewParties() : [],
        presets: query.preview ? previewPresets() : [],
        bases: query.preview ? previewBases() : [],
        auction: query.preview ? previewAuction(query.now) : [],
        names: usedNames(catalog, units),
        preview: query.preview,
        generatedAt: query.now,
      };
    },
    guide(now: number) {
      return unitGuideOf(options.guide?.(), now);
    },
    async cyborg(viewer: Viewer, query: HomeQuery): Promise<CyborgGetResponse> {
      const unitCount = await world.count(viewer.id, query.now);
      const cyborgs = options.cyborgs?.();
      const record = cyborgs?.record(viewer.id);
      // 시안을 켜면 시안 본체(화면 검토용), 아니면 만든 사이보그의 본체(생활비를 못 냈으면 효율 불이익, D-453)
      let body: CyborgBody | null = query.preview
        ? previewCyborg(catalog)
        : record
          ? {
              ...realCyborgBody(
                catalog,
                record,
                cyborgs?.livingUnpaid(viewer.id) ?? false,
                gearOf(record.unitId, query.now),
                query.now,
              ),
              rankings: (await options.rankings?.(viewer.id)) ?? [],
              ...cyborgConditionOf(record.unitId),
            }
          : null;
      // 원자재별 채집 예상(효율 묶음, 2026-11-12): 1차 값(몸 + 장비·버프)과 컨디션으로 판정과 같은 함수(gatherSheet.ts)
      const sheetSource = body ? options.gatherSheet?.() : undefined;
      if (body && sheetSource) {
        const primaries = body.stats.primaries;
        const stats = PRIMARY_STATS.reduce<Record<PrimaryStat, number>>(
          (out, stat) => {
            const { base, bonus } = primaries[stat];
            out[stat] = base + bonus;
            return out;
          },
          { str: 0, vit: 0, int: 0, wis: 0, dex: 0, agi: 0 },
        );
        body = {
          ...body,
          gather: gatherSheetOf(
            sheetSource,
            stats,
            body.condition?.total ?? 0,
            catalog.society,
            query.preview ? null : (record?.unitId ?? null),
          ),
        };
      }
      const names = body
        ? namesFor(catalog, {
            stats: body.stats.secondary.map((row) => row.id),
            items: [
              ...body.slots.flatMap((slot) => (slot.item ? [slot.item.id] : [])),
              ...body.inventory.map((item) => item.id),
            ],
            skills: body.skills.list.map((skill) => skill.id),
            facilities: [],
          })
        : namesFor(catalog, { stats: [], items: [], skills: [], facilities: [] });
      const cyborgRules = catalog.society.cyborg;
      return {
        // 다른 사람에게 보이는 이름은 사이보그 이름뿐이다(D-134). 만들기 전에는 계정 이름(본인만 본다)
        name: record?.name ?? viewer.loginId,
        // 3D 외형과 한 번 고르기(질문 961 나): 서버가 옛 2D에서 넘겨 채운 사이보그만 고를 수 있다(시안 자료는 고르지 않는다).
        // 옛 2D 칸 appearance는 뺐다(D-560 1421)
        look: record ? cyborgLookOf(record) : null,
        lookPick: record !== undefined && record.lookAuto && !query.preview,
        // 환생 조건·비용은 설정값이라 본체가 없어도(플레이어) 보낸다(D-440·D-441, N7·N34). 분포는 생성 때처럼 다시 굴린다:
        // 다시 굴리기 횟수 = 생성과 같은 N9 값(D-444 164)
        rebirth: {
          maxLevel: cyborgRules.maxLevel,
          faith: cyborgRules.rebirthFaith,
          currency: String(cyborgRules.rebirthCurrency),
          rerolls: cyborgRules.initialRerolls,
        },
        body,
        unitCount,
        names,
        preview: query.preview,
        generatedAt: query.now,
      };
    },
  };
}
