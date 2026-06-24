# Wave 6 — Research Issues (ready to publish on Drips)

> **Qué es esto:** el texto completo de los 5 issues de validación de mercado/usuario
> (V-1…V-5) listo para **copiar y pegar como issues de GitHub**. Son los primeros que
> subimos: no llevan código ni PR, son los más sencillos de completar.
>
> **Fuente:** §7 de [`AUDIT_APK_WAVE6.md`](./AUDIT_APK_WAVE6.md). Los aprendizajes se
> resumen de forma **agregada** en [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md).
>
> **Idioma:** el texto está en inglés (issues públicos para audiencia Drips). Las
> respuestas se aceptan en **español o inglés**.

---

## Antes de publicar (checklist)

1. **Crear el label `research`** en el repo (es el único nuevo). Color sugerido: morado.
   `gh label create research --description "Market/user validation — no code, no PR" --color 8957e5`
2. Confirmar que existen los labels: `wave:docs`, `complexity: low`, `Stellar Wave`.
3. Publicar los 5 issues con el cuerpo de abajo. No requieren milestone.
4. No asignar a un solo contribuidor de forma exclusiva: cada respuesta estructurada es válida.

---

## Principio de privacidad (va en CADA issue)

> ⚠️ **Privacy-first — do not share personal or sensitive data.** No real names, phone
> numbers, addresses, wallet addresses, private keys, documents, receipts, transaction
> hashes, or financial details. **We do not ask for any amounts of money** — please don't
> share income, balances, or transaction sizes (not even as ranges). Share only a
> **general country/region** and **anonymized** stories. Answers that include sensitive
> data will be edited or removed.

---

# V-1 · [Research] Market validation: cash-out context

**Labels:** `research` · `wave:docs` · `complexity: low` · `Stellar Wave`
**Type:** Research issue — no code, no pull request.

### Objective
Understand whether converting digital balance (remittance / crypto / digital money) into
**physical cash** is a real, recurring problem worth solving.

### What to answer (copy this template into a comment and fill it in)
```
- Country / general region:
- How often you (or people you know) need to turn digital money into cash: (e.g. weekly / monthly / rarely)
- Current method you use: (ATM, exchange, a person, a shop, Western Union, etc.)
- Main friction today: (fee / time / trust / liquidity / safety / availability)
- One short anonymized story of a time this was painful:
```

### Acceptance criteria
- A complete, structured answer following the template above.
- No sensitive personal data (see privacy principle).
- Tagged for aggregate analysis (maintainer adds friction/trust notes on close).

### Out of scope
- Specific product feedback (that's V-4 / V-5).
- Any personal identifiers or amounts of money.

---

# V-2 · [Research] Market validation: cash-in / deposit context

**Labels:** `research` · `wave:docs` · `complexity: low` · `Stellar Wave`
**Type:** Research issue — no code, no pull request.

### Objective
Understand whether putting **physical cash into a digital wallet / balance** solves a real
pain — the reverse direction of V-1.

### What to answer (copy this template into a comment and fill it in)
```
- Country / general region:
- Use case where you'd want to deposit cash into a wallet: (top up, save, pay online, send to family, etc.)
- Current method you use today (if any):
- How often: (weekly / monthly / rarely)
- Trust barriers: what would make you hesitate to hand cash to an agent/shop?
- Availability: are there nearby people/shops you'd trust for this? (yes / no / not sure)
```

### Acceptance criteria
- A complete, structured answer following the template above.
- No sensitive personal data (see privacy principle).
- Tagged for aggregate analysis.

### Out of scope
- Specific product UI feedback (that's V-4 / V-5).
- Any personal identifiers or amounts of money.

---

# V-3 · [Research] Market validation: liquidity provider perspective

**Labels:** `research` · `wave:docs` · `complexity: low` · `Stellar Wave`
**Type:** Research issue — no code, no pull request.

> Context: MicoPay is **role-agnostic** — any user can act as a liquidity provider (the
> person who hands over cash and earns a commission), there is no separate "merchant" app.

### Objective
Validate whether a regular user or a small business would be willing to act as a
**liquidity provider** (the human cash point).

### What to answer (copy this template into a comment and fill it in)
```
- Country / general region:
- Would you consider providing liquidity (giving cash, receiving digital balance)? (yes / no / maybe)
- If a small business: general type (shop, pharmacy, food, services…). If an individual: skip.
- Main motivation: (extra income, foot traffic, helping neighbors, curiosity…)
- Perceived risks: (fake payment, robbery, legal, not getting paid, reputation…)
- Commission you'd expect to charge: (as a %, e.g. 1–3%)
- What would make you trust the system enough to try it once:
```

### Acceptance criteria
- A complete, structured answer following the template above.
- No sensitive personal data (see privacy principle).
- Tagged for aggregate analysis.

### Out of scope
- Onboarding UX feedback (that's V-4).
- Any personal identifiers or amounts of money.

---

# V-4 · [Research] Product validation: non-custodial wallet onboarding

**Labels:** `research` · `wave:docs` · `complexity: low` · `Stellar Wave`
**Type:** Research issue — no code, no pull request.

> Context: MicoPay is **non-custodial**. The wallet (a Stellar keypair) is created on the
> user's own device; the private key never leaves the phone. The user is responsible for
> backing up their key.

### Objective
Validate whether a typical user understands **creating/importing a wallet** and the
**responsibility of backing it up**, and what would make that step feel trustworthy.

### How to participate
Look at the onboarding/registration flow (or the description above) and answer below. If you
run the app locally, do **not** share your real keys, addresses, or screenshots containing them.

### What to answer (copy this template into a comment and fill it in)
```
- Is it clear that YOU hold the key and YOU must back it up? (clear / confusing / why)
- Biggest doubt or fear about a non-custodial wallet:
- What text, step, or reassurance would make you trust this onboarding:
- Preference: create a new wallet vs import an existing Stellar key — which and why:
- Should backing up the key be mandatory during sign-up, or optional? Why:
```

### Acceptance criteria
- Actionable feedback following the template above.
- No keys, personal addresses, or screenshots with sensitive data.
- Tagged for aggregate analysis.

### Out of scope
- The cash-in/cash-out flow trust (that's V-5).
- Backend/auth implementation details.

---

# V-5 · [Research] Product validation: trust in the cash-in/cash-out flow

**Labels:** `research` · `wave:docs` · `complexity: low` · `Stellar Wave`
**Type:** Research issue — no code, no pull request.

### Objective
Validate whether a user would **trust** the core flow: pick a liquidity provider, see the
commission, use a QR/receipt, and complete the operation.

### How to participate
Walk through the flow (choose provider → see fee → QR/receipt → complete) in the app or from
the description, and answer below.

### What to answer (copy this template into a comment and fill it in)
```
- At which point would you trust the flow most? Least?
- Minimum information you need to SEE before handing over money/cash:
- Signals that would make a provider feel "verified" and trustworthy:
- What support/help would you expect if something goes wrong mid-operation:
- Top reason you might ABANDON the flow before finishing:
```

### Acceptance criteria
- Actionable feedback following the template above, with friction/trust points identified.
- No sensitive personal data (see privacy principle).
- Tagged for aggregate analysis.

### Out of scope
- Wallet onboarding (that's V-4).
- Pricing/economics model design.

---

## After answers come in

Each issue is closed once a complete, structured, privacy-safe answer is recorded. Summarize
learnings **in aggregate** in [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md) — never copy
personal data or anything that could identify a participant.
