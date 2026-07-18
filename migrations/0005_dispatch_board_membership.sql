-- Dispatch-board membership override per user.
-- null = role default (tech/supervisor on the board, others off),
-- true/false forces membership on/off (owner override).
ALTER TABLE "crm_users" ADD COLUMN IF NOT EXISTS "on_dispatch_board" boolean;

-- Sales users were previously always on the board; keep them there so the
-- board doesn't change until the owner opts them out.
UPDATE "crm_users" SET "on_dispatch_board" = true WHERE "role" = 'sales' AND "is_active" = true;
