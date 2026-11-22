// 병원 서비스를 월드에 잇는다(app.ts가 부른다) — docs/adr/2026-11-08-injury.md. 세계가 준비된 뒤(DB가 있는 월드만) 처음 부를 때 만들고 다시 쓴다.
// 월드 파일(world/world.ts)을 키우지 않으려고 월드 밖에서 잇는다: 쓰는 것은 모두 월드 저장 층(persistence)에 이미 있다.
// 관리인 부상 자율 치료(league-2 — labor/stewardCare.ts)도 여기서 2차맵 모음에 붙인다(관리인 살피기가 부른다).
import type { SkillData } from "@terra/sim";
import { attachStewardCare, createStewardCare } from "../labor/stewardCare.ts";
import { injuryRules } from "../world/unitCondition.ts";
import type { World } from "../world/world.ts";
import { type HospitalService, createHospitalService } from "./service.ts";

export function hospitalServiceOf(
  world: World | undefined,
  options: {
    /** 실효 스킬 자료(치유 스킬 = 모양 heal). 없으면 의사 스킬 몫이 없다 */
    readonly skills?: (() => readonly Pick<SkillData, "id" | "shape">[]) | undefined;
    readonly now: () => number;
  },
): () => HospitalService | undefined {
  let built: { persistence: object; service: HospitalService } | undefined;
  const get = (): HospitalService | undefined => {
    if (!world || world.status().state !== "ready") return undefined;
    const p = world.persistence;
    if (!p) return undefined;
    if (built?.persistence === p) return built.service;
    const service = createHospitalService({
      maps: world.maps,
      settlement: p.settlement,
      ledger: p.ledger,
      writer: p.writer,
      pool: p.pool,
      facilities: p.facilities,
      labor: p.labor,
      primaries: (unitId) => p.holdings.primariesOf(unitId),
      healSkills: () =>
        new Set(
          (options.skills?.() ?? []).filter((skill) => skill.shape === "heal").map((skill) => skill.id),
        ),
      hasCyborg: (userId) => p.cyborgs.record(userId) !== undefined,
      rules: injuryRules,
      now: options.now,
      ready: () => world.status().state === "ready",
    });
    built = { persistence: p, service };
    return service;
  };
  // 관리인이 맡은 다친 유닛의 자율 치료(league-2, D-590 2507 가 — labor/stewardCare.ts): 관리인과 같은 2차맵 모음에 붙인다
  if (world) attachStewardCare(world.maps, createStewardCare({ maps: world.maps, hospital: get }));
  return get;
}
