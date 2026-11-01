// 판정 코드가 ID로 쓰는 팩 아이템 — 아이템 편집기의 코드 참조 표(docs/adr/2026-11-01-item-editor.md 3절, 설계안 3.6).
// 이 아이템을 끄거나 칸·무기 칸을 바꾸면 시뮬 유닛·정원사 마법형 웨이브·전투 다시보기 시범이 그 칸을 비우거나 대신 것을 쓴다.
// 편집기는 끄기·칸 바꾸기에 확인 창을 띄운다. 나중에 이 묶음들을 팩 자료로 옮긴다(설계안 WP-8).
import { DEMO_ITEMS } from "./combat/replayDemo.ts";
import { SIM_COMBAT_ITEMS } from "./simulator/combatRun.ts";
import { MAGIC_WEAPON } from "./simulator/waveBattle.ts";

export const SIM_ITEM_REFS: Readonly<Record<"sim_combat" | "sim_wave" | "replay_demo", readonly string[]>> = {
  /** 시뮬레이터 유닛 장비(packages/sim/src/simulator/combatRun.ts) */
  sim_combat: SIM_COMBAT_ITEMS,
  /** 정원사 마법형 크리쳐 무기(packages/sim/src/simulator/waveBattle.ts) */
  sim_wave: [MAGIC_WEAPON],
  /** 전투 다시보기 시범 6 대 6(packages/sim/src/combat/replayDemo.ts) */
  replay_demo: DEMO_ITEMS,
};
