// world 라우터 — 지도 흐름 조회(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1·§7.1). 응답 타입은 @terra/shared/worldMap이다.
// - cities: 1차맵에 그릴 도시·국가(색·이름)·영토 껍질, 도시마다 시작 도시 여부·둘레 땅(행성 값)·띄운 맵인지·내가 볼 수 있는지.
// - myPosition: 내 사이보그 본체가 있는 2차맵·배치 칸(2차맵 화면이 그 맵을 열고 카메라를 맞춘다), 없으면 띄운 첫 2차맵.
// - travelPlan·travels(WP9·WP11 2차맵 사이 이동): 1차맵 명령 판의 확인 단계(지나는 2차맵·거리·걸리는 시간·위험 구간)와 내 유닛의 가는 중인 길·최근 도착.
// - mapUnits: 2차맵 화면의 내 유닛 목록(사이보그 본체 먼저, 명령할 수 없는 까닭)과 운영자 권한(docs/adr/2026-11-07-unit-control.md).
//   응답 타입은 @terra/shared/mapUnits. 명령(옮기기·멈추기)은 WebSocket move_unit·stop_unit. 다른 곳 내 유닛 수·카메라 범위(기획 답 632 다·630).
// - unitGlance: 누른 남의 유닛의 세력·종류(기획 답 636 나) — 지금 내 시야 안일 때만, 아니면 glance null.
// - unitLooks: 그 2차맵에서 내가 보는 사이보그 본체·NPC 지도자의 3D 외형(docs/adr/2026-11-11-character-3d.md 5절)과 보는 유닛의 나라(질문 963 나).
// - government: 2차맵에서 누른 행정 건물의 정부 판(도시·주인 나라·지도자·세율·행정 레벨·휴먼 수, "WP-NPC"). 모르는 도시면 unknown_building.
//   도시 하루 값(만족도·발전도·생필품 충족, 743 나 "WP-NPC3")도 함께.
// - leaderGovernment: 2차맵에서 누른 NPC 국가 지도자의 정부 판(742 나 — 지도자 = 정부 창구, 그 나라 수도 행정 건물 판). 시야 밖이면 unknown_unit.
// - naturalization: 그 행정 건물에서 귀화하는 조건(값·지원금 반환·쉬는 날·막는 까닭, docs/adr/2026-11-08-citizenship.md). 신청은 WebSocket
//   nationality_change.
// 읽기만 한다. 게임 상태를 바꾸는 명령은 WebSocket이다(AGENTS 4장 — 보내기·멈추기는 travel_start·travel_cancel).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), BAD_REQUEST(틀린 입력). 세계(DB)가 없거나 부팅 복구 전이면 status "not_ready"(빈 목록)
import type {
  WorldCitiesResponse,
  WorldPositionResponse,
  WorldTravelPlanResponse,
  WorldTravelsResponse,
} from "@terra/shared/worldMap";
import type { MapUnitGlanceResponse, MapUnitLooksResponse, MapUnitsResponse } from "@terra/shared/mapUnits";
import type { GovernmentResponse } from "@terra/shared/government";
import type { NaturalizationResponse } from "@terra/shared/citizenship";
import { z } from "zod";
import { canCommandAnyUnit } from "../world/unitControl.ts";
import { router, signedInProcedure } from "./init.ts";

/** 확인 단계 입력: 목적 2차맵 키(셀 키 검사는 서버 길 찾기가 한다)·배치 칸, 보낼 유닛(없으면 내 사이보그 본체) */
const travelPlanInput = z.object({
  mapKey: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(255),
  unitId: z.number().int().positive().max(0xffff_ffff).optional(),
});

/** 내 유닛 목록 입력: 2차맵 키(셀 키가 아니거나 띄우지 않은 맵이면 빈 목록 loaded false) */
const mapUnitsInput = z.object({ mapKey: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });

/** 정부 판 입력: 2차맵 건물 ID */
const governmentInput = z.object({ buildingId: z.number().int().positive().max(0xffff_ffff) });

/** 남의 유닛 한눈 정보 입력: 2차맵 키·유닛 ID */
const unitGlanceInput = mapUnitsInput.extend({ unitId: z.number().int().positive().max(0xffff_ffff) });

/** 정부 판 준비 전 답(세계·NPC 사회 런타임 전) */
const notReadyGovernment = (buildingId: number, nowMs: number): GovernmentResponse => ({
  status: "not_ready",
  buildingId,
  city: null,
  nation: null,
  leader: null,
  building: null,
  mayor: null,
  generatedAt: nowMs,
});

const notReadyCities = (nowMs: number): WorldCitiesResponse => ({
  status: "not_ready",
  planetId: "",
  faceLevel: 0,
  factions: [],
  cities: [],
  hulls: [],
  milliPerRadian: 0,
  myFactionId: null,
  generatedAt: nowMs,
});

const notReadyPosition = (nowMs: number): WorldPositionResponse => ({
  status: "not_ready",
  position: null,
  fallbackMapKey: null,
  generatedAt: nowMs,
});

export const worldRouter = router({
  /** 1차맵 도시·국가·영토 껍질과 도시마다 둘레 땅·들어가기 가능 여부 */
  cities: signedInProcedure.query(async ({ ctx }) => {
    const services = ctx.worldMap?.();
    return services ? services.cities(ctx.viewer, ctx.now()) : notReadyCities(ctx.now());
  }),
  /** 내 사이보그 자리(2차맵 키·배치 칸·위도·경도) */
  myPosition: signedInProcedure.query(({ ctx }) => {
    const services = ctx.worldMap?.();
    return services ? services.position(ctx.viewer, ctx.now()) : notReadyPosition(ctx.now());
  }),
  /** 2차맵 사이 이동 확인 단계(보내지 않는다) */
  travelPlan: signedInProcedure
    .input(travelPlanInput)
    .query(async ({ ctx, input }): Promise<WorldTravelPlanResponse> => {
      const services = ctx.worldMap?.();
      return services?.travelPlan
        ? services.travelPlan(ctx.viewer, input, ctx.now())
        : { status: "not_ready", plan: null, problem: null, generatedAt: ctx.now() };
    }),
  /** 그 2차맵의 내 유닛(사이보그 본체 먼저)·명령할 수 없는 까닭·운영자 권한 */
  mapUnits: signedInProcedure.input(mapUnitsInput).query(({ ctx, input }): MapUnitsResponse => {
    const services = ctx.worldMap?.();
    return services?.mapUnits
      ? services.mapUnits(ctx.viewer, input.mapKey, ctx.now())
      : {
          status: "not_ready",
          mapKey: input.mapKey,
          loaded: false,
          units: [],
          elsewhere: 0,
          view: { unitRadius: 0, buildingRadius: 0, buildings: [] },
          operator: canCommandAnyUnit(ctx.viewer.roles),
          generatedAt: ctx.now(),
        };
  }),
  /** 누른 남의 유닛의 세력·종류(지금 내 시야 안일 때만) */
  unitGlance: signedInProcedure
    .input(unitGlanceInput)
    .query(async ({ ctx, input }): Promise<MapUnitGlanceResponse> => {
      const services = ctx.worldMap?.();
      return services?.unitGlance
        ? services.unitGlance(ctx.viewer, input.mapKey, input.unitId, ctx.now())
        : { status: "not_ready", glance: null, generatedAt: ctx.now() };
    }),
  /** 그 2차맵에서 내가 보는 사이보그 본체·NPC 지도자의 3D 외형(docs/adr/2026-11-11-character-3d.md 5절, 읽기만) */
  unitLooks: signedInProcedure
    .input(mapUnitsInput)
    .query(async ({ ctx, input }): Promise<MapUnitLooksResponse> => {
      const services = ctx.worldMap?.();
      return services?.unitLooks
        ? services.unitLooks(ctx.viewer, input.mapKey, ctx.now())
        : { status: "not_ready", mapKey: input.mapKey, units: [], generatedAt: ctx.now() };
    }),
  /** 2차맵 행정 건물의 정부 판(읽기만 — 고용은 WebSocket recruit_hire) */
  government: signedInProcedure
    .input(governmentInput)
    .query(async ({ ctx, input }): Promise<GovernmentResponse> => {
      const services = ctx.worldMap?.();
      return services?.government
        ? services.government(ctx.viewer, input.buildingId, ctx.now())
        : {
            status: "not_ready",
            buildingId: input.buildingId,
            city: null,
            nation: null,
            leader: null,
            building: null,
            mayor: null,
            generatedAt: ctx.now(),
          };
    }),
  /** 2차맵에서 누른 NPC 국가 지도자의 정부 판(지도자 = 정부 창구 742 나, 지금 내 시야 안일 때만) */
  leaderGovernment: signedInProcedure
    .input(unitGlanceInput)
    .query(async ({ ctx, input }): Promise<GovernmentResponse> => {
      const services = ctx.worldMap?.();
      return services?.governmentOfLeader
        ? services.governmentOfLeader(ctx.viewer, input.mapKey, input.unitId, ctx.now())
        : notReadyGovernment(0, ctx.now());
    }),
  /** 그 행정 건물에서 귀화하는 조건(읽기만 — 신청은 WebSocket nationality_change) */
  naturalization: signedInProcedure
    .input(governmentInput)
    .query(async ({ ctx, input }): Promise<NaturalizationResponse> => {
      const services = ctx.worldMap?.();
      return services?.naturalization
        ? services.naturalization(ctx.viewer, input.buildingId, ctx.now())
        : { status: "not_ready", buildingId: input.buildingId, terms: null, generatedAt: ctx.now() };
    }),
  /** 내 유닛의 길(가는 중 + 최근 끝난 것) */
  travels: signedInProcedure.query(({ ctx }): WorldTravelsResponse => {
    const services = ctx.worldMap?.();
    return services?.travels
      ? services.travels(ctx.viewer, ctx.now())
      : { status: "not_ready", travels: [], generatedAt: ctx.now() };
  }),
});
