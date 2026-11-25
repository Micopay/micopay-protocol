# MP-V8 · Product validation: Buy crypto with cash: code first, then cash

- **Issue:** #500
- **Country / general region:** West Africa (Nigeria)
- **Device, screen size and browser:** Android phone, ~6-inch screen, Chrome mobile
- **App language you used:** English

## 1. First look — what do you think it is?

*Written before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > A service that connects people who have cash with people who have crypto — and the other way around — through a local agent or peer. The landing screen and name suggest it is built around physical cash exchanges, not a traditional exchange order book.

- Who is it for?
  > People with physical cash who want digital funds, and people with digital funds who need cash — especially where banks are slow or unreliable.

- What problem does it solve?
  > The last-mile gap between holding stablecoins and being able to use or receive physical cash without a bank account.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I expected to pick an agent first, then get a code. The app does the opposite — you generate a code before looking for an agent. That is the right design for escrow, but I had mentally reversed the steps. It became clear after I read the screen label a second time.

- What is still unclear?
  > The code screen does not say "show this to the agent" or "do not hand over cash yet." I understood the intent, but that instruction is absent.

## 3. The task in your issue

- How far did you get? Where did you stop, and why?
  > Connected the Varial wallet on testnet, navigated to the deposit (buy crypto with cash) flow, generated the code, and reached the confirmation screen showing the escrow lock status and the "I paid and they didn't confirm" button. Stopped there — no agent is online on testnet, which is expected.

- Where did you get stuck, even for a moment?
  > Two moments: (1) the "code first" step — paused because it felt backwards; (2) the escrow status screen — the spinner indicator did not say whether it was waiting for the agent or for a network confirmation. A one-line label such as "Waiting for agent to confirm receipt" would remove that ambiguity.

## 4. Questions for your issue

**Is it clear when you should hand over the cash, and when you should not yet?**

> Mostly, but not completely. The code screen comes before cash changes hands — that sequencing is correct. But the screen does not say "Do not give cash yet — wait until the agent scans this and the app confirms the escrow is locked." A user standing in front of an agent could hand over cash the moment they see the code, before the escrow locks. One explicit instruction sentence would close that gap.

**What do you think happens if you press "I paid and they didn't confirm"? Does it give you confidence?**

> I expect it escalates to a dispute or starts a timeout — the protocol either releases funds automatically after a grace period or opens a support path. The button's presence does give confidence because it shows the app anticipated this scenario. What would increase that confidence: a brief note next to the button explaining the outcome, for example "Pressing this starts a 30-minute dispute window. If the agent does not respond, your funds are returned." Without that, it feels like a safety net whose size I cannot see.

**What would worry you about handing cash to a stranger, and what would calm you down?**

> Worry: the agent takes the cash, claims the app "didn't go through," and walks away with no recourse. The escrow mechanic addresses the financial side of that risk directly. What would calm me down further: (1) seeing the escrow locked on my screen before releasing the cash — the app already does this, which is the strongest reassurance; (2) a visible trade ID I can reference in a dispute; (3) the agent's completion rate or a "Trusted Agent" badge on the same screen as the code, so I know who I am dealing with before cash moves.

## 5. Your country

- Your country / general region (no city or address needed).
  > West Africa, Nigeria.

- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, significant potential. Nigeria has a large informal cash economy alongside a fast-growing crypto user base. Converting between the two is a constant friction point: P2P platforms exist but rely on personal trust that is slow to verify, and bank transfers are unreliable enough that many people avoid them for time-sensitive trades. MicoPay's escrow model directly targets the trust problem that makes person-to-person cash-to-crypto trades risky today.

- Who would use it there?
  > Freelancers paid in USDC or USDT who need local currency for daily expenses; people receiving remittances who want same-day cash without a bank; small traders who collect cash sales and want to digitize quickly; and anyone who has had a P2P transfer go wrong and wants a safer structured alternative.

- What exists today to swap crypto for cash where you live, and what is wrong with it?
  > The main options are P2P order books on centralized exchanges (Binance P2P being most common), informal WhatsApp and Telegram trading groups, and walk-in OTC desks in a few cities. Problems: counterparty risk on P2P with no escrow on many flows, disputes that take days to resolve, spreads of 3–6% or more on informal channels, and zero recourse if an individual trader disappears. OTC desks are geographically limited and require showing up with no price certainty until you are already there.

- What would MicoPay need to change to work there?
  > Support for USDT alongside USDC — USDT has deeper informal-market liquidity locally. A clearly visible dispute resolution path with an estimated resolution time. And enough active agents in enough neighborhoods that the nearest one is walkable — density is the hardest part, but it is what makes the product useful versus just theoretically sound.

## 6. Value

- **How useful does it look to you?** 4 out of 5. The escrow mechanic solves the core trust problem that makes crypto-to-cash trades stressful. The missing point is agent density — a great flow with no nearby agents online is not yet usable day-to-day.

- What is the most valuable part?
  > The escrow lock that happens before cash changes hands. That single mechanism removes the biggest risk in a stranger-to-stranger exchange: the other party taking the money before the transaction settles.

- What is missing?
  > Agent availability indicators (online now vs. offline), a one-line instruction on the code screen telling the user not to hand over cash until the escrow is locked, and a brief explanation of what the dispute button actually triggers.

- What would stop you from using it?
  > No agents online nearby, or no explanation of what happens if the button is pressed and the agent still does not respond. If the dispute path is opaque, the escrow guarantee feels weaker than it is.

## 7. What confused you

- The code screen does not say "do not hand over cash yet." On a small phone screen in front of an agent, the implicit sequencing is easy to miss. The label "Share this code with the agent" would need to be followed by "Only hand over cash after this screen confirms the escrow is locked."
- The spinner on the escrow status screen does not distinguish between "waiting for the agent" and "waiting for the blockchain." Those are two different waits and they create different levels of anxiety.

## 8. Ideas

1. **Problem:** User hands over cash before escrow is locked because the code screen has no explicit instruction. **Idea:** Add a single bold sentence to the code screen: "Do not hand over cash until this screen shows 'Escrow locked'." No new screen needed — one line of copy.

2. **Problem:** The "I paid and they didn't confirm" button gives no information about what happens next. **Idea:** Add a tooltip or inline note: "This opens a dispute. If the agent does not respond within [X] minutes, your funds are automatically returned." The specific time makes the guarantee concrete and removes the anxiety of pressing an unknown button.

3. **Problem:** No way to assess an agent's trustworthiness before handing over cash. **Idea:** Show the agent's completion rate and time on platform on the same screen as the code, so the user can decide whether to proceed before cash moves — not after.
