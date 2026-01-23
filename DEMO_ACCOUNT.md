## Demo tenant (read-only) setup

This repo supports a **read-only demo tenant** you can share publicly so people can “look around” without being able to change data or connect integrations.

### 1) Create/seed the demo tenant in the production database

Run (from your machine) with **production** `DATABASE_URL`:

```bash
DATABASE_URL="..." npx ts-node scripts/create-demo-tenant.ts
```

The script prints:
- `DEMO_EMAIL`
- `DEMO_MEMBERSHIP_ID` (important: this is the “tenantId” used in the OTP login flow)
- `DEMO_OTP_CODE`

### 2) Set Vercel env vars (Production)

Add these environment variables:

- `DEMO_EMAIL` (e.g. `demo@studiio.au`)
- `DEMO_MEMBERSHIP_ID` (printed by the script)
- `DEMO_OTP_CODE` (recommend `000000`)

### 3) Share the login

Tell testers:
- Go to `/login`
- Enter the demo email
- Select the demo workspace
- Enter code `000000`

### Safety controls

When `readOnlyDemo` is enabled on the membership permissions:
- Non-GET requests are blocked at middleware level (prevents Server Actions / form submits)
- Dropbox / Google Drive connect endpoints are blocked
- `/tenant/settings` is blocked

