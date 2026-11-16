// 짓는 중 알박기 고르기 바꾸기(WebSocket facility_claim, 프로토콜 54) — 기획 D-577(사용자 답 2241 "정부 건물 완성 때 발효. 건설을 시작할 때 경고 문구를
// 보이고 그 자리에서 미리 고르게, 완성 전에는 언제든 바꿀 수 있게. 아무것도 고르지 않고 완성되면 소속 국가 귀속").
// - 대상: 빈 2차맵에 짓는 중인 내 정부(행정) 건물 = 짓기 때 고르기를 받은 시설 줄(record.claim이 있음 — ruins/landClaim.ts "알박기 중").
// - 바꿀 수 있을 때: 레벨 0(다 짓기 전)이고 짓기 작업이 걸려 있으며 그 2차맵에 아직 도시가 없다. 다 지었거나 남의 도시가 먼저 서서 멈췄으면
//   not_buildable, 알박기 정부가 아니면 not_facility. 다 지어질 때 그때의 고르기로 도시가 선다(landClaim.foundPending — 이미 시설 줄 claim을 읽는다).
// - 저장은 시설 줄 world_facilities.claim_choice(쓰기 대기열, plots.ts와 같은 save). 재료·시간은 그대로다.
import type { LandClaimChoice } from "@terra/shared/facilities";
import type { PlotDeps, PlotFacility, PlotResult } from "./plots.ts";

/** 판정에 보는 시설 정의 칸(팩 stage) */
export interface ClaimFacility extends PlotFacility {
  readonly stage?: string | undefined;
}

/** 건물 서비스의 고르기 바꾸기 명령(FacilityService가 잇는다) */
export interface ClaimCommands {
  claimChoice(userId: string, buildingId: number, claim: LandClaimChoice): Promise<PlotResult>;
}

export function chooseClaim<D extends ClaimFacility>(
  deps: PlotDeps<D>,
  userId: string,
  buildingId: number,
  claim: LandClaimChoice,
): PlotResult {
  const me = deps.ownerFor(userId, deps.now());
  if (me === undefined) return { ok: false, code: "busy" };
  const found = deps.myFacility(me, buildingId);
  if (typeof found === "string") return { ok: false, code: found };
  const { record, def } = found;
  if (def.stage !== "government" || record.claim === undefined) return { ok: false, code: "not_facility" };
  if (record.level >= 1 || record.cityId !== null || !deps.jobRunning(buildingId))
    return { ok: false, code: "not_buildable" };
  // 체제는 독립일 때만(1인 독재 도시는 늘 독재 — 세울 때 landClaim이 정한다)
  record.claim = { mode: claim.mode, regime: claim.mode === "independent" ? claim.regime : null };
  deps.save(record);
  return { ok: true };
}
