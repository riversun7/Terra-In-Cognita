import { ROUTES, type RouteId } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { isDevSurfaceRoute } from "../shell/devSurface.ts";
import { routeScope } from "./scopeRoutes.ts";

const ROUTE_IDS = Object.keys(ROUTES).filter((id): id is RouteId => Object.hasOwn(ROUTES, id));

describe("화면마다 범위", () => {
  it("개발·운영 화면은 개발자 홈·크리쳐 편집기만 빼고 모두 범위가 있고, 게임 화면에는 없다", () => {
    for (const id of ROUTE_IDS) {
      const scope = routeScope(id);
      if (!isDevSurfaceRoute(id) || id === "dev" || id === "dev_creatures") expect(scope, id).toBeNull();
      else {
        expect(scope, id).not.toBeNull();
        expect(scope?.note(), id).not.toBe("");
      }
    }
  });

  it("행성을 고르는 화면은 묶음이 있고, 나머지는 없다", () => {
    for (const id of ROUTE_IDS) {
      const scope = routeScope(id);
      if (scope === null) continue;
      if (scope.kind === "planet") expect(scope.group, id).toBeDefined();
      else expect(scope.group, id).toBeUndefined();
    }
  });

  it("규칙 편집기는 모든 행성 공통, 세계 자료 화면은 행성 하나, 모니터링은 전체를 고를 수 있다", () => {
    expect(routeScope("dev_tuning")?.kind).toBe("common");
    expect(routeScope("dev_items")?.kind).toBe("common");
    expect(routeScope("dev_world_layout")).toMatchObject({ kind: "planet", group: "edit" });
    expect(routeScope("dev_second_map")).toMatchObject({ kind: "planet", group: "lab" });
    expect(routeScope("ops")).toMatchObject({ kind: "planet", group: "monitor" });
    expect(routeScope("dev_planet_editor")?.kind).toBe("library");
    expect(routeScope("dev_star_system")?.kind).toBe("system");
    expect(routeScope("admin")?.kind).toBe("none");
  });
});
