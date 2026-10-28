-- 감사 기록(audit_log)은 추가만 한다: UPDATE·DELETE·TRUNCATE를 DB가 거절한다 (docs/adr/2026-10-28-auth-and-accounts.md)
-- 문장 단위 트리거라 지울 행이 없어도 거절한다. 트리거를 지우려면 새 마이그레이션 + ADR이 필요하다.
CREATE FUNCTION "audit_log_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % rejected', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_reject_change"();
