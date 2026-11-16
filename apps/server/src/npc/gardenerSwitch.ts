// 정원사 웨이브 스위치 — 사용자 결정(2026-11-01 "합치되 웨이브 끔"), D-513 운영자 온/오프 스위치 49 N53 `n53_gardener_waves`.
// NPC 사회 런타임(runtime.ts)이 쓴다(그 파일 줄 수 때문에 따로 둔다).
import type { GardenerCoefficients } from "@terra/sim";

/**
 * 웨이브를 끄면 도시 웨이브 확률 상한(chanceMaxPm)과 보호 레이드 세기 배율(raidStrengthPm, D-500)을 0으로 둔다: 굴림은 돌지만 늘
 * 실패하고 레이드는 생기지 않으며, 오염 층·관계도는 그대로 돈다.
 * 사용자 결정(2026-11-01 "합치되 웨이브 끔", D-513 운영자 온/오프 스위치 49 N53 `n53_gardener_waves`), GARDENER_WAVES
 */
export function gardenerRulesOf(rules: GardenerCoefficients, wavesOn: boolean): GardenerCoefficients {
  return wavesOn ? rules : { ...rules, chanceMaxPm: 0, raidStrengthPm: 0 };
}

/**
 * 운영자 스위치(n53_gardener_waves = 1)가 켜져 있으면 환경변수(기본 false)가 꺼져 있어도 웨이브를 켠다.
 * 환경변수를 주지 않은 시험(undefined)은 스위치가 기본값(0)이어도 기존 시험처럼 켜 둔다.
 */
export function gardenerWavesEnabled(envFlag: boolean | undefined, switchValue: number | undefined): boolean {
  if (switchValue === 1) return true;
  if (envFlag === undefined) return true;
  return envFlag;
}
