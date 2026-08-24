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

## 2. Git-triggered builds: two secrets away

Cloudflare's own Git integration is **not available for this project** and no
dashboard click will change that. It was created as Direct Upload, and the API
is explicit:

    PATCH /accounts/{id}/pages/projects/vectormojo
    8000069 "You cannot update the `source` object in a Direct Uploads project."

Converting means deleting and recreating the project, which drops its
deployment history and risks losing the `vectormojo.pages.dev` subdomain while
the name is briefly free. Not worth it.

So the deploy lives in `.github/workflows/ci.yml` instead, as a `deploy` job
that runs after the tests on every push to `main`. It is already written and
already merged. It skips itself with a notice until these two repo secrets
exist, so CI stays green in the meantime:

1. Cloudflare dashboard, My Profile, API Tokens, Create Token.
2. Use the **Edit Cloudflare Workers** template, or a custom token with
   `Account / Cloudflare Pages / Edit`. Scope it to this account only.
3. GitHub, `LunarWerxs/VectorMojo`, Settings, Secrets and variables, Actions:
   - `CLOUDFLARE_API_TOKEN` = the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID` = the account id (the hex string in any Cloudflare
     dashboard URL). It is not a credential, but it is kept out of the public
     workflow file anyway.

Push anything to `main` afterwards and the deploy runs itself.

Until then, ship by hand:

    bun run build
    wrangler pages deploy dist --project-name=vectormojo --branch=main

**No local `wrangler login` is needed for that** (added 2026-08-24). The
Connections MCP leases the vaulted Cloudflare credential into a child process as
an env var, value-blind, so an agent can ship this site without the token ever
being visible to it:

    bun install --frozen-lockfile && bun run build \
      && CLOUDFLARE_ACCOUNT_ID=36d7c731fd0352ef08ea7e46d2d20793 \
         bunx wrangler pages deploy dist --project-name=vectormojo --branch=main

run inside `shell { secrets: [{ service: "cloudflare", as: "CLOUDFLARE_API_TOKEN" }] }`.
Done that way on 2026-08-24.

**Why that same token is not simply pasted into the repo secrets to finish step
2:** it is an *account* token that reaches four Cloudflare accounts, not just
this one, and it has no permission to mint a narrower one for itself. This repo
is public, so anyone with write access could exfiltrate it by adding a workflow.
Step 2 stays open until a Workers-and-Pages-only token scoped to this account
exists. Hand-shipping is the interim answer, not a blocker: every push still
reports honestly that it deployed nothing.
