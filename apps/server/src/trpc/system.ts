// system 라우터 — 서버 버전과 시각 조회.
// /health와 WebSocket welcome이 이미 공개하는 값만 돌려준다(비밀값 없음).
import { PROTOCOL_VERSION } from "@terra/protocol";
import { SIM_VERSION } from "../config.ts";
import { publicProcedure, router } from "./init.ts";

export const systemRouter = router({
  info: publicProcedure.query(({ ctx }) => ({
    protocolVersion: PROTOCOL_VERSION,
    simVersion: SIM_VERSION,
    contentVersion: ctx.contentVersion,
    serverTime: ctx.now(),
  })),
});
