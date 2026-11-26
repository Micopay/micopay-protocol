# MP-V8 · Product validation: Buy crypto with cash: code first, then cash

- **Issue:** #500
- **Country / general region:** West Africa (Nigeria)
- **Device, screen size and browser:** Android phone, ~6-inch screen, Chrome mobile
- **App language you used:** English

## 1. First look — what do you think it is?

*Written before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > The login screen shows the name MicoPay, a line that says "Connect your wallet", a small box warning me to keep my recovery phrase safe because MicoPay cannot restore it, and an orange "Connect wallet" button. That is everything on the screen. There is no description of what the app does, no mention of cash, no mention of agents, and no hint of what I will find after connecting. If I had arrived here without knowing anything about MicoPay, I would have assumed it was some kind of wallet manager or DeFi dashboard — not a cash exchange network.

- Who is it for?
  > From that screen alone, it feels like it is for people who already know what MicoPay is and have come specifically to log in. Someone discovering it cold would have no way to understand who it is built for.

- What problem does it solve?
  > I could not tell from that first screen. It only addresses security: it tells me my key stays in my wallet. It says nothing about the problem the product actually solves.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I was surprised to find, after signing in, that MicoPay is an in-person cash-to-crypto network with escrow and local agents. Nothing on that login screen hinted at physical cash or meeting someone nearby. I had guessed it was an online payment tool.

- What is still unclear?
  > The code screen does not say "show this to the agent" or "do not hand over cash yet." I understood the intent from context, but that instruction is absent from the screen itself.

## 3. The task in your issue

- How far did you get? Where did you stop, and why?
  > 1. Opened `https://app.micopay.com.mx` and noted my observations for Section 1 while looking at the login screen.
  > 2. Clicked "Connect wallet". A popup appeared listing only Varial with an external link. I already had Varial installed and switched to testnet.
  > 3. Connected successfully. The app asked me to sign with my wallet to verify my address, then took me to the home screen.
  > 4. Navigated to the "Buy crypto with cash" flow from the home screen.
  > 5. The app generated a code and displayed a screen asking me to find an agent and show them the code.
  > 6. I stopped there. The screen indicated I needed a cash agent to proceed, and the README confirms there are no agents online on testnet. There was no one to show the code to, so the trade could not advance.

- Where did you get stuck, even for a moment?
  > Two moments. First, the code generation step felt backwards — I expected to find an agent first and then get a code. The app does the opposite: you lock the escrow first, then find an agent. That is the right design, but I paused because it reversed my mental model. Second, the spinner on the escrow status screen did not say what it was waiting for. I could not tell whether it was waiting for an agent to scan the code or waiting for a network confirmation. Those are two different waits and they create different levels of concern.

## 4. Questions for your issue

**Is it clear when you should hand over the cash, and when you should not yet?**

> Mostly, but not completely. The code screen comes before cash changes hands — that sequencing is correct. But the screen does not say "Do not give cash yet — wait until the agent scans this and the app confirms the escrow is locked." A user standing in front of an agent could hand over cash the moment they see the code, before the escrow locks. One explicit instruction sentence would close that gap.

**What do you think happens if you press "I paid and they didn't confirm"? Does it give you confidence?**

> I did not reach that button — no agent was online, so the trade never got that far. From the screen I did see, I understood that the button would exist once an agent was involved. The presence of a dispute path in the design gives me confidence in principle, but I cannot say what it actually looks like or what it says because I never saw it.

**What would worry you about handing cash to a stranger, and what would calm you down?**

> Worry: the agent takes the cash, claims the app "didn't go through," and walks away with no recourse. The escrow mechanic addresses the financial side of that risk directly. What would calm me down further: (1) seeing the escrow locked on my screen before releasing the cash — the app already does this by generating the code first, which is the strongest reassurance I saw; (2) a visible trade ID I can reference if something goes wrong; (3) the agent's completion rate or a "Trusted Agent" badge on the same screen as the code, so I can assess who I am dealing with before cash moves.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa).

- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, I do. Almost all of my income from bounties, freelance work, and open source contributions arrives as USDC or USDT. Converting that to physical Naira for daily expenses — groceries, transport, rent — is something I deal with every week. The current options are slow, expensive, and sometimes risky. MicoPay's escrow approach directly targets the trust problem that makes person-to-person cash-to-crypto trades stressful here.

- Who would use it there?
  > People like me who get paid online in stablecoins and need to turn that into physical cash regularly. People receiving money from family abroad who want same-day cash without a bank. Local POS operators who already do cash-in and cash-out for everyone on the street and would naturally fit the agent role.

- What exists today to swap crypto for cash where you live, and what is wrong with it?
  > Binance P2P is what I use most. It costs me roughly 2–3% each time between the spread and withdrawal fees. The bigger problem is that Nigerian bank accounts frequently get flagged or frozen when banks suspect a P2P transfer, so there is constant anxiety around receiving funds that way. Informal WhatsApp and Telegram groups also exist, but there is zero recourse if a trader disappears. OTC desks are only in a few city areas and you have to show up without knowing the final rate.

- What would MicoPay need to change to work there?
  > USDT support alongside USDC, since USDT has deeper liquidity in the local informal market. A clearly visible dispute resolution path with an estimated resolution time, so the escrow guarantee feels concrete rather than theoretical. And enough active agents in enough neighborhoods that the nearest one is reachable on foot — agent density is what makes the product actually usable versus just conceptually sound.

## 6. Value

- **How useful does it look to you?** 4 out of 5. The escrow mechanic solves the core trust problem that makes crypto-to-cash trades stressful. The missing point is agent availability — a well-designed flow with no one online nearby is not yet usable day-to-day.

- What is the most valuable part?
  > The escrow lock that happens before cash changes hands. That single mechanic removes the biggest risk in a stranger-to-stranger exchange: the other party taking the money before the transaction settles.

- What is missing?
  > Agent availability indicators showing who is online now, a one-line instruction on the code screen telling the user not to hand over cash until the escrow is confirmed, and a brief explanation of what the dispute path actually does when it is triggered.

- What would stop you from using it?
  > No agents online nearby. If I cannot find an agent within a reasonable distance, the product does not work regardless of how good the escrow design is.

## 7. What confused you

- The code screen does not say "do not hand over cash yet." On a small phone screen in front of an agent, the implicit sequencing is easy to miss. "Share this code with the agent" needs to be followed by something like "Only hand over cash after this screen confirms the escrow is locked."
- The spinner on the escrow status screen does not distinguish between "waiting for the agent" and "waiting for the blockchain." Those are two different waits with different levels of urgency and anxiety.

## 8. Ideas

1. **Problem:** User hands over cash before escrow is locked because the code screen has no explicit instruction. **Idea:** Add a single bold sentence to the code screen: "Do not hand over cash until this screen shows 'Escrow locked'." No new screen needed — one line of copy.

2. **Problem:** The spinner on the escrow status screen gives no information about what it is waiting for. **Idea:** Replace the generic spinner label with a specific one: "Waiting for agent to confirm receipt" or "Waiting for network confirmation" depending on the actual state. The two waits are different and the user should know which one they are in.

3. **Problem:** No way to assess an agent's trustworthiness before handing over cash. **Idea:** Show the agent's completion rate and time on platform on the same screen as the code, so the user can decide whether to proceed before cash moves — not after.
