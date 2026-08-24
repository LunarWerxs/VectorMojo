# VectorMojo - pricing

VectorMojo is free and open source. There is no paid tier.

## Plans

| Plan | Price | Currency | Limit | Sign-up required |
|---|---|---|---|---|
| Guest | 0 | USD | 10 conversions | No |
| Connections account (free) | 0 | USD | Unlimited conversions | Yes (free, no card) |

No subscription, no usage-based billing, no feature paywalled behind payment.

## License

- VectorMojo's own source: **MIT**, https://github.com/LunarWerxs/vectormojo/blob/main/LICENSE
- Bundled components under **AGPL**: MuPDF.js and Ghostscript WASM (used for PDF and EPS
  handling). Full license texts and a corresponding-source pointer ship in every public build,
  see https://vectormojo.lunarwerx.com/THIRD_PARTY_NOTICES.txt

## Costs the user actually bears

None. VectorMojo requires no API key, no metered third-party service, and no
bring-your-own-key setup; every conversion runs locally in the browser tab using JavaScript
and WebAssembly. The only account involved (Connections) is free to create and never asks for
payment details.

## Self-hosting

The source is public (MIT); anyone can clone, build, and run their own copy at zero cost
beyond their own hosting:

```
git clone https://github.com/LunarWerxs/vectormojo.git
cd vectormojo
bun install
bun run build
```

## Source

- Product: https://vectormojo.lunarwerx.com/
- Repository: https://github.com/LunarWerxs/vectormojo
- Full brief: https://vectormojo.lunarwerx.com/llms-full.txt

Last verified: 2026-08-23
