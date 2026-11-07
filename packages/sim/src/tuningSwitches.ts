// 운영자 시스템 온/오프 스위치 설정 칸 값 ↔ 계수표 — 기획 49 N53, D-513
// 운영자가 점검·단계적 오픈·비상 정지 때 서버 재시작 없이 켜고 끄는 런타임 스위치(0 = 꺼짐, 1 = 켜짐).
// 정원 세력 웨이브(n53_gardener_waves)는 기본 0(꺼짐), 거래소·환전소·생산·NPC AI는 기본 1(켜짐)이다.
import type { TuningKey } from "./tuning.ts";

export interface SystemSwitches {
  /** 정원 세력 웨이브 온/오프(0 = 꺼짐 기본, 1 = 켜짐 — 오염 층은 꺼져 있어도 쌓임, D-513) */
  readonly gardenerWaves: number;
  /** 물자 거래소 주문·체결 온/오프(1 = 켜짐 기본, 0 = 일시정지, D-513) */
  readonly marketEnabled: number;
  /** 화폐 환전소 온/오프(1 = 켜짐 기본, 0 = 일시정지, D-513) */
  readonly exchangeEnabled: number;
  /** 1차·가공 생산 루프 온/오프(1 = 켜짐 기본, 0 = 일시정지, D-513) */
  readonly productionEnabled: number;
  /** NPC 세력 자율 행동 AI 온/오프(1 = 켜짐 기본, 0 = 일시정지, D-513) */
  readonly npcAiEnabled: number;
}

export const TEST_SYSTEM_SWITCHES: SystemSwitches = {
  gardenerWaves: 0,
  marketEnabled: 1,
  exchangeEnabled: 1,
  productionEnabled: 1,
  npcAiEnabled: 1,
};

const k = (id: string, path: keyof SystemSwitches, ko: string, en: string): TuningKey => ({
  id,
  code: "N53",
  target: "society",
  path: `switches.${path}`,
  structural: false,
  ko,
  en,
});

export const SWITCH_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "n53_gardener_waves",
    "gardenerWaves",
    "운영 스위치: 정원 세력 웨이브(0=꺼짐, 1=켜짐)",
    "Operator switch: Gardener waves (0=off, 1=on)",
  ),
  k(
    "n53_market_enabled",
    "marketEnabled",
    "운영 스위치: 물자 거래소 주문·체결(0=일시정지, 1=켜짐)",
    "Operator switch: Commodity market orders & matching (0=paused, 1=on)",
  ),
  k(
    "n53_exchange_enabled",
    "exchangeEnabled",
    "운영 스위치: 화폐 환전소(0=일시정지, 1=켜짐)",
    "Operator switch: Currency exchange (0=paused, 1=on)",
  ),
  k(
    "n53_production_enabled",
    "productionEnabled",
    "운영 스위치: 1차·가공 생산 루프(0=일시정지, 1=켜짐)",
    "Operator switch: Primary & crafting production loop (0=paused, 1=on)",
  ),
  k(
    "n53_npc_ai_enabled",
    "npcAiEnabled",
    "운영 스위치: NPC 세력 자율 행동 AI(0=일시정지, 1=켜짐)",
    "Operator switch: NPC faction autonomous AI (0=paused, 1=on)",
  ),
];
