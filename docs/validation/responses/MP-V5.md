# MP-V5 · Drips USDC to cash & MicoPay potential

- **Issue:** #497
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), standard desktop viewport, Chromium-based browser
- **App language you used:** English (also tested switching to Spanish with the `ES` button)

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > From the first screen (`#/login`), it is honestly hard to tell what MicoPay actually does. The screen only shows the `MicoPay` heading, `Connect your wallet`, a note saying `"Your key stays in your wallet. MicoPay will ask you to sign and will never see it."`, a warning box about keeping my recovery phrase safe, and the `Connect wallet` button. Based on that alone, I can only tell it is a non-custodial crypto web app on a testnet (`Testnet: red de pruebas, sin dinero real` in the top banner), not that it is for cashing out crypto.
- Who is it for?
  > It looks like it is for people who already have a crypto wallet and know how to manage recovery phrases and sign transactions.
- What problem does it solve?
  > The landing screen does not state the problem it solves—it only explains wallet security (that MicoPay never sees my key and cannot recover my account).

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I was surprised that I could not preview the app or see how a cash-out works at all before connecting a wallet. Trying to open `#/` or `#/cashout` redirected straight back to `#/login`. I was also surprised that clicking `Connect wallet` opened the `Connect Wallet` modal (powered by Stellar Wallets Kit) with only a single wallet option: **Varial** (`Install ↗`), which redirected to `https://varialwallet.com/`. Clicking the `?` help button inside the modal was the first place I saw Stellar mentioned (`"What is Stellar?"`).
- What is still unclear?
  > Because I could not see past the `#/login` screen without installing and setting up Varial first, it is still unclear how the cash-out flow works in detail, how cash agents are matched, what fees or exchange rates apply, and whether local currencies outside Mexico (`.com.mx`) are supported.

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. Opened `https://app.micopay.com.mx` and was redirected to `https://app.micopay.com.mx/#/login`. I wrote Section 1 from this screen before clicking anything.
  > 2. Tested the `ES` / `EN` language toggle in the top-right corner of the card; the card text switched cleanly between English and Spanish, while the black top banner (`Testnet: red de pruebas, sin dinero real`) stayed in Spanish.
  > 3. Clicked `Connect wallet`. The button changed to `Waiting for your wallet…` and the Stellar Wallets Kit `Connect Wallet` modal opened showing only `Varial` with an `Install ↗` label.
  > 4. Clicked `?` in the modal header and read the `What is a wallet?` and `What is Stellar?` help text, then clicked `Varial` (`Install ↗`), which opened `https://varialwallet.com/` in a popup window.
  > 5. Closed the modal (`×`) without connecting; the app showed the red-bordered alert `Couldn't connect your wallet`.
  > I stopped at the Varial wallet installation/sign-in gate because I do not have the Varial wallet set up on testnet yet, so I could not reach the post-login cash-out screen.
- Where did you get stuck, even for a moment?
  > I got stuck immediately at the `Connect Wallet` modal because only **Varial** is listed and it is not a wallet I already use. There is no read-only demo or preview of the cash-out flow before installing a new wallet.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **Today, how do you turn your Drips USDC into money you can spend? (exchange, P2P, a friend, you keep it in crypto…)**
  > I mostly keep it in crypto right now rather than cashing it out right away.
- **What does that cost you as a percentage, how long does it take, and what annoys you about it? No amounts of money.**
  > Keeping it in crypto costs me 0% in off-ramp fees, which is part of why I leave it there. When I do need to convert to NGN, going through P2P or an off-ramp typically costs around 1%–3% in spread/fees and takes 5 to 30 minutes. What annoys me is having to deal with P2P counterparties, unfavorable FX spreads, and the worry of bank delays or flagged transfers whenever I actually want spendable cash.
- **Would you use MicoPay for this? What would it need to have?**
  > I would consider trying it if it works reliably in Nigeria and supports NGN cash-out or bank transfer. To use it regularly, it would need: (1) support for more common wallets (or a much smoother onboarding flow than requiring a brand-new wallet upfront), (2) transparent fees and exchange rates shown before signing in or starting a trade, (3) verified, trustworthy local agents/liquidity in Nigeria, and (4) clear dispute/escrow protection so I am not exposed to counterparty risk.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, there is real potential. Many people in Nigeria earn in stablecoins (USDC/USDT) from remote work, open-source grants, or freelancing, and converting crypto to spendable Naira safely and cheaply is still a daily friction point. If MicoPay can make crypto-to-cash simple and trustworthy, people would try it.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > Freelancers, developers, and open-source contributors paid in USDC/USDT; people receiving remittances from abroad; and small merchants or young adults who already use mobile money/POS agents for everyday cash.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > Most people use P2P marketplaces on major exchanges, local crypto-to-NGN off-ramp apps, or trusted OTC vendors. Typical total cost is around 1%–3% (mostly hidden in the exchange rate spread). The main problems are counterparty risk on P2P, occasional bank transfer delays or frozen accounts from flagged third-party senders, and inconsistent exchange rates.
- What would MicoPay need to change to work there?
  > Support NGN and local payout methods (local bank transfer / mobile money / verified local cash agents), explain the product clearly in English on the first screen (including translating the top banner), support wallets people already use instead of only Varial, and clearly show how escrow and agent verification protect users.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **3 / 5.** The idea of turning Drips USDC into local cash is very useful to me, but right now the app's first screen does not explain what it does, requires installing a single specific wallet (Varial) before showing anything, and has no local agents yet.
- What is the most valuable part?
  > Keeping custody of my own keys (`"Your key stays in your wallet. MicoPay will ask you to sign and will never see it."`) while aiming to bridge stablecoins directly to local cash.
- What is missing?
  > A clear explanation of what MicoPay does on `#/login`, a preview of the cash-out flow and rates before connecting a wallet, broader wallet support beyond Varial, and NGN/Nigeria support.
- What would stop you from using it?
  > Having to install an unfamiliar wallet just to see the app, lack of trusted local agents/liquidity in Nigeria, or higher fees/spreads than existing P2P/off-ramp options.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - **Landing screen (`#/login`):** It jumps straight into `"Connect your wallet"` and recovery-phrase warnings without explaining what MicoPay is or how a cash-out works. I expected a short 1–2 sentence description of MicoPay and a preview of the cash-out flow.
  > - **Top banner (`Testnet: red de pruebas, sin dinero real`):** Even when the app language is set to English, this banner stays in Spanish. I expected it to switch to English when English is active.
  > - **`Couldn't connect your wallet` alert:** When I closed the `Connect Wallet` modal (`×`) and then clicked `ES` to switch languages, the card text switched to Spanish but the alert box stayed in English (`Couldn't connect your wallet`).
  > - **Single wallet option (`Varial`):** Clicking `Connect wallet` only showed `Varial` (`Install ↗`), with no explanation on the login screen beforehand that Varial is required.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** First-time visitors on `#/login` cannot tell what MicoPay does or whether it supports their country before installing a wallet. · **Idea:** Add a short value proposition, supported countries/currencies, and a read-only preview of the cash-out flow on the `#/login` screen before asking users to click `Connect wallet`.
2. **Problem:** Requiring only the Varial wallet creates high drop-off for contributors who already use other wallets. · **Idea:** Mention upfront on `#/login` that Varial on Stellar testnet is required for the beta (with a direct setup guide), and add support for additional Stellar/EVM wallets later.
3. **Problem:** Mixed-language UI in English mode (the Spanish testnet banner and stale-language error alert after toggling `ES`/`EN`) makes the app feel unfinished. · **Idea:** Localize the top testnet banner and make active error alerts (`Couldn't connect your wallet`) re-render in the newly selected language immediately when toggling `ES`/`EN`.
