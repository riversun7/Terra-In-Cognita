// 2단계 뒤 시설 건설 재료 검사 — 49 M14·D-508(docs/adr/2026-11-02-building-editor.md).
// - 구간(facilities.build.levels): 첫 구간 from 1(build_levels_start), from이 늘어나기만(build_levels_order), 최고 레벨(maxLevel,
//   없으면 5) 이하(build_level_max). 레벨 L은 from ≤ L인 마지막 구간을 쓴다(@terra/shared/facilityBuild).
// - 한 구간 안에서 같은 아이템은 한 줄(build_material_duplicate — 옛 raw는 재료 코드마다 한 칸이었다).
// - 시설의 처음 짓기 구간(Lv1)에 꺼진 아이템이 있으면 알림(build_material_disabled, 오류 아님). D-508: 처음 건물은 1차 원자재로 지어 초기
//   발전이 막히지 않아야 한다. 시설은 켬·끔이 없어(늘 켜짐, 팩 core@32·사용자 답 2026-11-03) 모든 시설을 본다. 아이템을 끄는 길은 아이템
//   편집기의 끄기(은퇴 대신)만 남았다. 위 구간의 꺼진 재료는 알리지 않는다(건물 편집기 레벨 표가 레벨마다 꺼진 재료를 보인다).
// - 배 시설(harbor, docs/adr/2026-11-15-shipyard-harbor.md): 교통 단계 + 물가 조건이 있어야 하고(harbor_needs_transport), 배 종류 표(boats)는
//   조선소에만 있고 조선소에는 꼭 있다(harbor_boats_shipyard_only·harbor_shipyard_no_boats).
// - 거래소(exchange, docs/adr/2026-11-16-exchange-buildings.md): 거래소 종류는 상업 단계에만(exchange_needs_commerce), 상업 단계는 종류가 있어야 한다
//   (commerce_needs_exchange).
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
    checkHarbor(facility, error);
    checkExchange(facility, error);
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
        if (index === 0 && enabledOf.get(item.id) === false)
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

/** 거래소 칸 검사(docs/adr/2026-11-16-exchange-buildings.md): 거래소 종류는 상업 단계에만, 상업 단계는 거래소 종류가 있어야 한다 */
function checkExchange(
  facility: { readonly id: string },
  error: (id: string, path: string, code: string, message: string) => void,
): void {
  const kind = get(facility, "exchange");
  const commerce = get(facility, "stage") === "commerce";
  if (kind !== undefined && !commerce)
    error(
      facility.id,
      "exchange",
      "exchange_needs_commerce",
      "거래소 종류(exchange)는 상업 단계(commerce) 시설에만 둡니다.",
    );
  if (commerce && kind === undefined)
    error(
      facility.id,
      "exchange",
      "commerce_needs_exchange",
      "상업 단계(commerce) 시설에는 거래소 종류(exchange)를 적습니다.",
    );
}

/** 배 시설 칸 검사(역할 ↔ 단계·물가 조건·배 종류 표) */
function checkHarbor(
  facility: { readonly id: string },
  error: (id: string, path: string, code: string, message: string) => void,
): void {
  const role = get(facility, "harbor");
  const boats = get(facility, "boats");
  if (
    role !== undefined &&
    (get(facility, "stage") !== "transport" || get(facility, "needsWaterWithin") === undefined)
  )
    error(
      facility.id,
      "harbor",
      "harbor_needs_transport",
      "배 시설(harbor)은 교통 단계(transport)이고 물가 조건(needsWaterWithin)이 있어야 합니다.",
    );
  if (boats !== undefined && role !== "shipyard")
    error(
      facility.id,
      "boats",
      "harbor_boats_shipyard_only",
      "배 종류 표(boats)는 조선소(harbor shipyard)에만 둡니다.",
    );
  if (role === "shipyard" && boats === undefined)
    error(
      facility.id,
      "boats",
      "harbor_shipyard_no_boats",
      "조선소에는 배 종류 표(boats)가 하나 이상 있어야 합니다.",
    );
}
