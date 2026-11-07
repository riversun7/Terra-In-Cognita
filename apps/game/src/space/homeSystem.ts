// [임시] 1차맵 항성계 보기의 자료 — 게임 행성의 항성계 자료(콘텐츠 팩·서버)가 아직 없어 기기에 둔다(ADR 2026-11-07-planet-view 3절,
// 확인 대기: 질문 650). 판정·게임 실행에는 쓰지 않는다(화면 그림).
// - 기획: 출시 = 지구 + 모항 연출, 처음 항성계 = 태양계(47 §2·§3, D-360·D-372), 별칭 = D-5067 8개(화면은 "별칭(실명)", D-366),
//   위성은 따로 천체(D-383, 큰 위성은 나중에). 지금 1차맵 행성은 지구 자리다(1:12 지구, PLAN).
// - 거리는 실제 태양계 궤도 긴반지름(AU, 세 자리). 공전은 없다(D-381 101: 늘 같은 그림).
// 콘텐츠 팩에 항성계 분류(정의 판 2, ADR 2026-10-31-space-layer-data-model)가 생기면 이 파일을 지우고 그 자료를 쓴다.
import type { StarTypeId } from "@terra/shared";
import type { SystemBodyKind } from "./StarSystemView.tsx";

/** 태양계 천체 ID(화면 이름은 spaceMessages.ts) */
export type HomeBodyId =
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "asteroid_belt"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

/** 위성 ID */
export type HomeMoonId = "moon";

export interface HomeBody {
  readonly id: HomeBodyId;
  readonly kind: SystemBodyKind;
  readonly distanceAu: number;
  readonly moons: readonly HomeMoonId[];
  /** 지금 1차맵 행성 */
  readonly current: boolean;
}

export interface HomeSystem {
  readonly star: StarTypeId;
  readonly bodies: readonly HomeBody[];
}

const body = (
  id: HomeBodyId,
  kind: SystemBodyKind,
  distanceAu: number,
  moons: readonly HomeMoonId[] = [],
): HomeBody => ({ id, kind, distanceAu, moons, current: id === "earth" });

/** 태양계(가까운 궤도부터) */
export const HOME_SYSTEM: HomeSystem = {
  star: "g2v",
  bodies: [
    body("mercury", "planet", 0.387),
    body("venus", "planet", 0.723),
    body("earth", "planet", 1, ["moon"]),
    body("mars", "planet", 1.524),
    body("asteroid_belt", "asteroid_belt", 2.77),
    body("jupiter", "gas_giant", 5.203),
    body("saturn", "gas_giant", 9.537),
    body("uranus", "gas_giant", 19.19),
    body("neptune", "gas_giant", 30.07),
  ],
};

/** 지금 행성의 차례(없으면 null) */
export function currentBodyIndex(system: HomeSystem): number | null {
  const index = system.bodies.findIndex((item) => item.current);
  return index >= 0 ? index : null;
}
