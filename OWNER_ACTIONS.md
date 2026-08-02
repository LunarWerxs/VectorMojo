# Owner actions

One dashboard-only step remains from NEXT_STEPS.md.

## 1. Custom domain: DONE 2026-08-02

`vectormojo.lunarwerx.com` is live and its certificate is active. Done over the
API rather than the dashboard: the custom domain was added to the Pages project,
and the zone got a proxied `CNAME vectormojo -> vectormojo.pages.dev`.

The site's own URLs moved with it (canonical, Open Graph, Twitter card), and it
now carries robots.txt, sitemap.xml, its own analytics site, and the
back-to-studio link every product site has.

One thing this does NOT do, and Cloudflare Pages gives no setting for: the old
`vectormojo.pages.dev` keeps serving the same pages rather than redirecting.
The canonical tag names `vectormojo.lunarwerx.com`, which is what search engines
consolidate on, so this is untidy rather than harmful. Redirecting it properly
would mean adding a Pages Function to this direct-upload project purely to
inspect the Host header, which is not worth it today.

**This project is direct-upload, not Git-connected** (see step 2 below), so a
push to GitHub does NOT deploy. Ship changes with:

    bun run build
    wrangler pages deploy dist --project-name=vectormojo --branch=main

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
