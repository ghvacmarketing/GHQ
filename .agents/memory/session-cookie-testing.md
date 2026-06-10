---
name: Session cookie testing over HTTP
description: Why curl/localhost-http login tests show no Set-Cookie and appear "unauthenticated"
---

The Express session cookie (server/routes.ts session config) is `secure: true` + `sameSite: 'none'`.

**Rule:** When testing any login/session flow, plain `http://localhost:5000` curl will NOT receive or send the session cookie, so `/me`-style follow-up requests look Unauthorized even when login itself succeeded. This is expected, not a bug.

**Why:** `secure: true` makes the browser/curl drop the cookie over non-HTTPS. The deployed/preview app runs over HTTPS so sessions work there.

**How to apply:** Validate login *logic* by asserting the login response body (success vs rejection for good/bad/unknown credentials). Don't conclude sessions are broken just because a follow-up authenticated curl over http returns 401.
