// 유닛·사이보그 화면 자료 서비스 — tRPC 맥락의 roster(units.list·cyborg.get). 앱을 만들 때 한 번 만든다(trpc/createContext.ts).
// 실제 자료(세계 유닛·화물·포로, 계정 이름)에 시안 자료(preview, dev·admin만: 프로시저가 권한을 본 뒤 true)를 더한다.
// 응답의 이름 표는 응답에 나온 ID만 담는다(catalog.ts namesFor).
import type { CyborgGetResponse, RosterPrisoner, RosterUnit, UnitsListResponse } from "@terra/shared/roster";
import type { HomeQuery, RosterServices, Viewer } from "../trpc/context.ts";
import { baselineBody } from "./body.ts";
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
import { EMPTY_WORLD_ROSTER, type WorldRosterRow, type WorldRosterSource } from "./worldUnits.ts";

const worldId = (id: number): string => `w${id}`;

/** 실제 세계 유닛 → 화면 한 줄. 이름·레벨·장비가 아직 없다(스탯은 [임시] 기본값) */
export function realUnit(catalog: RosterCatalog, row: WorldRosterRow): RosterUnit {
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
    party: null,
    ...baselineBody(catalog),
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
  options: { catalog?: RosterCatalog | undefined; world?: WorldRosterSource | undefined } = {},
): RosterServices {
  const catalog = options.catalog ?? testRosterCatalog();
  const world = options.world ?? EMPTY_WORLD_ROSTER;
  return {
    async units(viewer: Viewer, query: HomeQuery): Promise<UnitsListResponse> {
      const real = await world.read(viewer.id, query.now);
      const units = real.units.map((row) => realUnit(catalog, row));
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
    async cyborg(viewer: Viewer, query: HomeQuery): Promise<CyborgGetResponse> {
      const unitCount = await world.count(viewer.id, query.now);
      const body = query.preview ? previewCyborg(catalog) : null;
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
        name: viewer.loginId,
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
