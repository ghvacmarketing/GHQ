---
name: CRM role/permission real-time propagation
description: How a CRM user's role change reaches their other devices/sessions without websockets
---

There is no websocket/SSE infra for the CRM. A user's role/permissions come from
the `["/api/crm/auth/me"]` React Query cache, which every permission consumer
shares. The server's `/api/crm/auth/me` (`getCurrentCrmUser` → `getCrmUserById`)
always reads the role fresh from the DB (the session cookie only stores userId),
so the only staleness is client-side caching.

Role changes propagate because the two always-mounted access gates poll auth/me:
`client/src/components/crm/crm-route-guard.tsx` (desktop CRM) and
`client/src/pages/mobile/mobile-shell.tsx` (mobile) both use
`refetchInterval: 30s` + `refetchIntervalInBackground: true` + `staleTime: 30s`.
Because all consumers share the query key, polling on the gate refreshes the
cache for the whole app within ~30s.

**Why:** an admin changing a tech to supervisor wasn't reflected on the tech's
device until reload (old staleTime was 5–10 min, refetchInterval was false).
**How to apply:** if you add new role-gated surfaces, read role from the shared
`["/api/crm/auth/me"]` query — do NOT cache role separately or it won't update.
If true real-time (<30s) is ever required, that's when to add websockets.
