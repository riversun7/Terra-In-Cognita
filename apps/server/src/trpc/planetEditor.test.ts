// planetEditor 라우터의 기기 쪽 타입 약속 — 게임 앱(WP-D 화면)이 AppRouter에서 추론하는 입력·출력·오류 모양.
// 동작은 DB 통합 시험(src/planetEditor/*.db.test.ts)이 본다. 여기서는 타입이 바뀌면 화면 연결이 깨진다는 것을 먼저 알린다.
import type { inferRouterError, inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { describe, expectTypeOf, it } from "vitest";
import type {
  PlanetDraftBase,
  PlanetDraftRevisionInfo,
  PlanetDraftSaved,
  PlanetDraftView,
  PlanetEditorDefinitions,
} from "../planetEditor/types.ts";
import type { AppRouter } from "./router.ts";

type Inputs = inferRouterInputs<AppRouter>["planetEditor"];
type Outputs = inferRouterOutputs<AppRouter>["planetEditor"];

describe("planetEditor 타입 약속", () => {
  it("출력: 정의 조회·초안·판 목록·저장·되돌리기·지우기", () => {
    expectTypeOf<Outputs["definitions"]>().toEqualTypeOf<PlanetEditorDefinitions>();
    expectTypeOf<Outputs["drafts"]["get"]>().toEqualTypeOf<PlanetDraftView | null>();
    expectTypeOf<Outputs["drafts"]["revisions"]>().toEqualTypeOf<PlanetDraftRevisionInfo[]>();
    expectTypeOf<Outputs["drafts"]["save"]>().toEqualTypeOf<PlanetDraftSaved>();
    expectTypeOf<Outputs["drafts"]["restore"]>().toEqualTypeOf<PlanetDraftView>();
    expectTypeOf<Outputs["drafts"]["remove"]>().toEqualTypeOf<{ removed: boolean }>();
  });

  it("입력: 행성 ID로 고른다. 저장은 항목(검사 전)·기준·기대 판", () => {
    expectTypeOf<Inputs["drafts"]["get"]>().toEqualTypeOf<{ planetId: string }>();
    expectTypeOf<Inputs["drafts"]["revisions"]>().toEqualTypeOf<{ planetId: string }>();
    expectTypeOf<Inputs["drafts"]["save"]>().toEqualTypeOf<{
      planetId: string;
      entry: unknown;
      base: PlanetDraftBase | null;
      expectedRevision: number;
    }>();
    expectTypeOf<Inputs["drafts"]["restore"]>().toEqualTypeOf<{ planetId: string; revision: number }>();
    expectTypeOf<Inputs["drafts"]["remove"]>().toEqualTypeOf<{ planetId: string }>();
  });

  it("오류 data에 이유 코드(reason)가 있다(없으면 undefined)", () => {
    expectTypeOf<inferRouterError<AppRouter>["data"]["reason"]>().toEqualTypeOf<string | undefined>();
  });
});
