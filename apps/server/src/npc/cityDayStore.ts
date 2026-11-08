// 도시 하루 생필품 충족(저장) — 기획 정리 781 나(정부 판 생필품 충족 = 만족도·발전도와 같은 날의 값), docs/adr/2026-11-07-play-flow.md
// "WP-NPC4". 하루 끝(UTC 0시, NPC 사회 런타임 endOfDay)에 도시 경제가 그날 셈한 생필품 충족 ‰(시뮬 foodPmOf — 하루 끝 만족도가 포만감으로 쓰는
// 바로 그 값, D-438 5)을 도시마다 하나 적고 world_cities.necessities_pm에 쓴다(쓰기 표 cityDay — 도시 행 쓰기와 따로라 직전 판 앱이 도시 행을
// 써도 지워지지 않는다). 다시 켜도 같은 값이 보인다. 하루 동안 흔들리지 않는다(다음 하루 끝까지 그대로).
// 처음 하루 끝 전(이 판으로 처음 켠 날)은 값이 없다(null — 화면 "—").
import type { WorldWriter } from "../world/persist/writer.ts";

/** 켤 때 읽은 도시 줄의 칸 */
export interface CityDayRow {
  readonly id: number;
  readonly necessitiesPm: number | null;
}

export interface CityDayStore {
  /** 그 도시의 지난 하루 끝 생필품 충족 ‰(없으면 undefined) */
  necessitiesOf(cityId: number): number | undefined;
  /** 하루 끝: 도시마다 그날 값을 적는다(없는 도시는 잊는다). 값은 0~1000으로 자른다 */
  record(values: ReadonlyMap<number, number>): void;
  /** 바뀐 도시만 쓰기 대기열에 넣는다(도시 줄 다음 차례). 쓴 줄 수 */
  flush(): number;
}

const clampPm = (value: number): number => Math.max(0, Math.min(1000, Math.round(value)));

export function createCityDayStore(o: {
  readonly writer: Pick<WorldWriter, "upsert">;
  readonly rows: readonly CityDayRow[];
}): CityDayStore {
  const values = new Map<number, number>();
  const saved = new Map<number, number | null>();
  for (const row of o.rows) {
    if (row.necessitiesPm !== null) values.set(row.id, row.necessitiesPm);
    saved.set(row.id, row.necessitiesPm);
  }
  return {
    necessitiesOf: (cityId) => values.get(cityId),
    record(next) {
      for (const [cityId, value] of next) values.set(cityId, clampPm(value));
    },
    flush() {
      let rows = 0;
      for (const [cityId, value] of [...values].toSorted((a, b) => a[0] - b[0])) {
        if (saved.get(cityId) === value) continue;
        o.writer.upsert("cityDay", { id: cityId, necessities_pm: value });
        saved.set(cityId, value);
        rows += 1;
      }
      return rows;
    },
  };
}
