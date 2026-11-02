// 2단계 뒤 시설 건설 재료 검사 — 49 M14·D-508(docs/adr/2026-11-02-building-editor.md).
// - 구간(facilities.build.levels): 첫 구간 from 1(build_levels_start), from이 늘어나기만(build_levels_order), 최고 레벨(maxLevel,
//   없으면 5) 이하(build_level_max). 레벨 L은 from ≤ L인 마지막 구간을 쓴다(@terra/shared/facilityBuild).
// - 한 구간 안에서 같은 아이템은 한 줄(build_material_duplicate — 옛 raw는 재료 코드마다 한 칸이었다).
// - 켜진 시설의 처음 짓기 구간(Lv1)에 꺼진 아이템이 있으면 알림(build_material_disabled, 오류 아님 — 켬·끔은 개발자 페이지에서 바꾼다,
//   D-398). D-508: 처음 건물은 1차 원자재로 지어 초기 발전이 막히지 않아야 한다. 위 구간(가공품)의 꺼진 재료는 알리지 않는다: 판자·벽돌처럼
//   아직 켜지 않은 가공품을 미리 적어 두는 것이 정상이고, 건물 편집기 레벨 표가 레벨마다 꺼진 재료를 보인다. 꺼진 시설도 알리지 않는다.
// 참조가 없는 경우는 참조 단계가 알린다. 항목은 스키마를 통과한 파싱 결과(참조 = ContentRef)다(items.ts와 같은 방식).
import { FACILITY_LEVEL_MAX } from "@terra/shared/facilityBuild";
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";
import { ContentRef } from "../schema/common.ts";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

export function checkFacilities(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const error = (
    id: string,
    path: string,
    code: string,
    message: string,
    params: Record<string, string | number> = {},
  ) =>
    issues.push({
      stage: "references",
      level: "error",
      file: "facilities.json",
      id,
      path,
      message,
      code,
      params,
    });
  const enabledOf = new Map((pack.entries.get("items") ?? []).map((item) => [item.id, get(item, "enabled")]));

  for (const facility of pack.entries.get("facilities") ?? []) {
    const build = get(facility, "build");
    if (build === undefined) continue;
    const maxLevel = get(facility, "maxLevel");
    const top = typeof maxLevel === "number" ? maxLevel : FACILITY_LEVEL_MAX;
    let previous = 0;
    list(get(build, "levels")).forEach((band, index) => {
      const from = get(band, "from");
      const at = `build.levels[${index}]`;
      if (typeof from === "number") {
        if (index === 0 && from !== 1)
          error(facility.id, `${at}.from`, "build_levels_start", "첫 구간은 레벨 1(from 1)에서 시작합니다.");
        else if (index > 0 && from <= previous)
          error(
            facility.id,
            `${at}.from`,
            "build_levels_order",
            `구간은 from이 늘어나는 차례로 적습니다(앞 구간 ${previous}).`,
            { previous },
          );
        if (from > top)
          error(
            facility.id,
            `${at}.from`,
            "build_level_max",
            `구간 시작 레벨(${from})이 최고 레벨(${top})보다 큽니다.`,
            { max: top },
          );
        previous = from;
      }
      const seen = new Set<string>();
      list(get(band, "materials")).forEach((stack, line) => {
        const item = get(stack, "item");
        if (!(item instanceof ContentRef)) return;
        const path = `${at}.materials[${line}].item`;
        if (seen.has(item.id))
          error(
            facility.id,
            path,
            "build_material_duplicate",
            `한 구간에 ${item.id}가 두 줄입니다. 수량을 한 줄로 합치세요.`,
            { item: item.id },
          );
        seen.add(item.id);
        if (index === 0 && get(facility, "enabled") === true && enabledOf.get(item.id) === false)
          issues.push({
            stage: "references",
            level: "warning",
            file: "facilities.json",
            id: facility.id,
            path,
            message: `처음 짓기(Lv1) 재료 ${item.id}가 꺼져 있습니다. 그 아이템을 켜거나 재료를 바꾸세요(꺼진 동안 이 시설을 지을 수 없다).`,
            code: "build_material_disabled",
            params: { item: item.id },
          });
      });
    });
  }
  return issues;
}
