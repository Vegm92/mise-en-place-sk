-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  user_restaurants.user_id: text → uuid                                     ║
-- ║                                                                            ║
-- ║  The column was text because it originally held Supabase auth.uid()        ║
-- ║  values (0000_baseline). Since 0027_auth_tables the app owns users.id as   ║
-- ║  a uuid, leaving membership rows comparable to users only via an explicit  ║
-- ║  cast — any query that forgot one failed with 42883 (text = uuid).         ║
-- ║                                                                            ║
-- ║  Every value written since 0027 is a uuid string, and Supabase auth ids    ║
-- ║  were uuids too, so the cast below is expected to be total. If any row     ║
-- ║  holds a non-uuid, the USING cast raises 22P02 and the whole migration     ║
-- ║  rolls back — no partial conversion, no data loss. That is the intended    ║
-- ║  failure mode: fix the offending rows, then re-run.                        ║
-- ║                                                                            ║
-- ║  Rollback: ALTER TABLE user_restaurants                                    ║
-- ║              ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;  ║
-- ║  (uuid → text always succeeds, so the reverse is unconditionally safe.)    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE "user_restaurants" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;
