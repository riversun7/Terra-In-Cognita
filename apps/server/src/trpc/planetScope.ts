// planetScope 라우터 — 편집기·모니터링의 범위 줄(행성 고르기)이 읽는 행성 목록(docs/adr/2026-11-11-planet-scope.md).
// - list: 이 세계의 플레이 행성(대표가 맨 앞). 개발·운영 역할(gm·dev·admin)은 팩에만 있는 편집 전용 행성도 받는다.
//   이름·면 레벨은 콘텐츠 팩에 이미 공개된 값이다(비밀값 없음). 보관함 행성(팀이 저장한 초안)은 행성 편집기 목록(planetEditor.library)이 따로 준다.
// 읽기만 한다. 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지)
import type { PlanetScopeResponse } from "@terra/shared/planetScope";
import { planetScopeList } from "../world/playablePlanets.ts";
import { router, signedInProcedure } from "./init.ts";

export const planetScopeRouter = router({
  list: signedInProcedure.query(
    ({ ctx }): PlanetScopeResponse =>
      planetScopeList(ctx.planetScope?.() ?? [], {
        includeEditorOnly: ctx.viewer.roles.some((role) => role !== "player"),
        nowMs: ctx.now(),
      }),
  ),
});
