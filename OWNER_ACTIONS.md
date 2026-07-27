# Owner actions

Two dashboard-only steps remain from NEXT_STEPS.md. Both require Cloudflare
account access this agent does not have.

## 1. Custom domain

1. Cloudflare dashboard, Workers & Pages, `vectormojo` project.
2. Custom domains tab, Set up a custom domain.
3. Enter the domain, e.g. `vectormojo.lunarwerx.com`, Continue.
4. Cloudflare shows the DNS record it needs. For a subdomain like the example
   above, add in the DNS zone for `lunarwerx.com`:
   - Type: `CNAME`
   - Name: `vectormojo`
   - Target: `vectormojo.pages.dev`
   - Proxy status: Proxied (orange cloud)
5. Save, then Activate domain in the Pages dashboard. Propagation is usually
   under a few minutes since the zone is already on Cloudflare.

## 2. Git-triggered builds

1. Cloudflare dashboard, Workers & Pages, `vectormojo` project.
2. Settings tab, Builds, Connect to Git (or "Manage repository").
3. Authorize GitHub if prompted, select `LunarWerxs/vectormojo`, branch `main`.
4. Build settings to enter:
   - Build command: `bun run build`
   - Build output directory: `dist`
   - Root directory: `/`
5. Environment variables, add:
   - `BUN_VERSION` = `1.3.14`
6. Save and deploy. The repo now also carries `package.json` `engines`
   (`bun >=1.3.14`, `node >=20`) and a `.node-version` file (`22`), so the
   build image should detect Bun correctly even without the env var; keep
   the var set anyway as a pin against future default-version drift.
