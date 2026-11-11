// 첫 접속 나라 고르기 카드의 자세한 정보 — docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (2026-11-11)".
// 사용자 요청(2026-11-11): "시작 세력 고를때 더 자세한 정보(인구수, 정책, 간단소개 등)를 제공하라."
// 서버가 이미 가진 값을 읽기만 한다(새 규칙 없음):
// - 팩 국가 프리셋(실효 값 — 편집기가 고치면 다음 조회부터): 국력 등급·화폐·지도자·마크·한 줄 소개·팩 거래세
// - NPC 사회 런타임 거울 세계: 체제·기술 단계·가진 도시 수·인구(그 나라 도시에 사는 휴먼 수 — 정부 판 government/reads.ts와 같은 셈)
// - 도시 경제 세율(돌고 있으면 그 값이 팩 거래세보다 먼저 — npc/currency.ts)
// 런타임이 없으면(NPC 사회 꺼짐·부팅 전) 거울 세계 칸은 null이고 프리셋 칸만 채운다. 프리셋도 거울 세계도 없는 코드는 정보 없음.
import type { CreationNationProfile } from "@terra/shared/cyborg";
import type { SimCity, SimFaction, SimUnit } from "@terra/sim";
import { type NationPreset, nationEmblemOf, presetOfCode } from "../npc/nations.ts";

/** 정보를 읽는 곳(world.ts가 잇는다, 시험은 가짜) */
export interface NationProfileSource {
  /** 실효 국가 프리셋(같은 배열을 제자리에서 바꾼다 — npc/presets.ts createLivePresets) */
  readonly presets: readonly NationPreset[];
  /** NPC 사회 런타임 거울 세계(없으면 undefined) */
  world():
    | {
        readonly factions: ReadonlyMap<
          number,
          Pick<SimFaction, "id" | "code" | "fixed" | "alive" | "regime" | "tech">
        >;
        readonly cities: ReadonlyMap<number, Pick<SimCity, "owner">>;
        readonly units: ReadonlyMap<number, Pick<SimUnit, "city">>;
      }
    | undefined;
  /** 도시 경제의 지금 거래세(만분율, 거울 세계 세력 ID). 경제가 없으면 undefined */
  taxOf?: ((simFactionId: number) => number | undefined) | undefined;
}

/**
 * 만들기 화면 자료 한 번마다 부른다: 거울 세계를 한 번 훑어 나라마다 도시·휴먼 수를 센 뒤 세력 코드 → 정보 함수를 돌려준다.
 * emblemUploads = 이 세계에 올린 국가 마크(프리셋 ID → 해시)
 */
export function nationProfilesOf(
  source: NationProfileSource,
  emblemUploads: ReadonlyMap<string, string> | undefined,
): (code: string) => CreationNationProfile | undefined {
  const world = source.world();
  const byCode = new Map<string, Pick<SimFaction, "id" | "code" | "fixed" | "alive" | "regime" | "tech">>();
  const citiesOf = new Map<number, number>();
  const humansOf = new Map<number, number>();
  if (world) {
    // 같은 코드가 여럿이면(반란 세력 등은 코드가 다르다) 살아 있는 고정 나라가 먼저
    for (const faction of world.factions.values()) {
      const seen = byCode.get(faction.code);
      if (!seen || (!(seen.fixed && seen.alive) && faction.fixed && faction.alive))
        byCode.set(faction.code, faction);
    }
    const ownerOfCity = new Map<number, number>();
    for (const [cityId, city] of world.cities) {
      ownerOfCity.set(cityId, city.owner);
      citiesOf.set(city.owner, (citiesOf.get(city.owner) ?? 0) + 1);
    }
    for (const unit of world.units.values()) {
      const owner = ownerOfCity.get(unit.city);
      if (owner !== undefined) humansOf.set(owner, (humansOf.get(owner) ?? 0) + 1);
    }
  }
  return (code) => {
    const preset = presetOfCode(code, source.presets);
    const faction = byCode.get(code);
    if (!preset && !faction) return undefined;
    const made = nationEmblemOf(code, source.presets);
    const tax = faction ? source.taxOf?.(faction.id) : undefined;
    return {
      tier: preset?.tier?.id ?? null,
      humans: faction ? (humansOf.get(faction.id) ?? 0) : null,
      cityCount: faction ? (citiesOf.get(faction.id) ?? 0) : null,
      regime: faction?.regime ?? null,
      tech: faction?.tech ?? null,
      taxBp: tax ?? preset?.tradeTaxBp ?? null,
      currency: preset?.currency
        ? {
            name: { ko: preset.currency.name.ko, en: preset.currency.name.en },
            symbol: preset.currency.symbol ?? null,
            ticker: preset.currency.ticker ?? null,
          }
        : null,
      leaderName: preset?.leaderName ? { ko: preset.leaderName.ko, en: preset.leaderName.en } : null,
      emblem: made
        ? { spec: made.spec, color: made.color, uploaded: emblemUploads?.get(made.preset) ?? null }
        : null,
      intro: preset?.intro ? { ko: preset.intro.ko, en: preset.intro.en } : null,
    };
  };
}
