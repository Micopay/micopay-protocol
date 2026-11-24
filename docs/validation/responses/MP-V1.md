# MP-V1 · Product validation: First look: what do you think MicoPay is?

- **Issue:** #493
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), 1920x1080 display, Google Chrome
- **App language you used:** English (tested `EN` / `ES` toggle)

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > Looking strictly at the initial landing screen (`https://app.micopay.com.mx/#/login`), the page presents the title `MicoPay`, a subtitle `Connect your wallet`, security guidance stating `"Your key stays in your wallet. MicoPay will ask you to sign and will never see it."`, a warning box advising users to keep their recovery phrase safe, and a `Connect wallet` button. Based on this screen alone, MicoPay looks like a web3 decentralized application login portal on Stellar testnet (`Testnet: red de pruebas, sin dinero real`), but it does not specify what the app does, what financial services it provides, or why someone should connect their wallet.
- Who is it for?
  > It looks like it is built for experienced crypto users who already have a compatible non-custodial wallet installed and know how to sign transactions.
- What problem does it solve?
  > The first screen explains only self-custodial key safety without describing the real-world problem or service it provides.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > In step 1, I assumed MicoPay was either a standard online crypto payment gateway (like a merchant checkout button) or a decentralized token swap. I was surprised to discover after signing in and viewing the welcome tour that MicoPay is actually an in-person, escrow-protected cash-in/cash-out protocol that connects individuals with local physical cash agents.
- What is still unclear?
  > It remains unclear how agent liquidity is guaranteed in practice, how dispute resolution operates if an agent disputes cash receipt during an in-person meeting, and whether local fiat currencies outside Mexico (`.com.mx`) will be supported.

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. Opened `https://app.micopay.com.mx`, which redirected to `#/login`. Evaluated the initial view and recorded my first impressions in Section 1 before connecting.
  > 2. Tested the `ES` / `EN` toggle in the top-right corner; the card text translated between English and Spanish, while the top testnet bar remained in Spanish.
  > 3. Clicked `Connect wallet`, selected Varial wallet on testnet, approved the connection, and created a test account by entering a username.
  > 4. Explored the app for several minutes: navigated through the Welcome tour, the main dashboard (`Home`), the `Explore` map, the `Pay` / `Receive` screens, and the `Profile` tab.
  > 5. Stopped after thoroughly reviewing the navigation, screens, and copy, as there are no live physical cash agents on testnet to complete a real-world cash exchange.
- Where did you get stuck, even for a moment?
  > When first opening the site, I tried to access other routes (such as `#/cashout` or `#/explore`) to inspect the app features before connecting a wallet, but the app forcibly redirected every route back to `#/login`. Without connecting a wallet first, the entire product is invisible.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **What did the first screen tell you, and what did it leave out?**
  > - **What it told me:** It stated the platform name (`MicoPay`), showed that authentication is wallet-based (`Connect your wallet`), explained that keys remain on the user device (`"Your key stays in your wallet. MicoPay will ask you to sign and will never see it."`), and warned that lost recovery phrases cannot be restored by MicoPay.
  > - **What it left out:** It completely omitted what MicoPay actually does: no mention of cashing out crypto, buying crypto with physical cash, finding local cash agents, escrow protection, or supported fiat currencies.
- **What word or sentence made the product click for you, if any?**
  > The sentence in the Welcome guide under *How you exchange cash*: `"In MicoPay, the one who gives or takes your cash is another person: a MicoPay Network agent. It can be a shop, a stall or an individual near you."` alongside `"Cash out: you hand over crypto and the agent gives you bills."` That immediately made the entire concept click as a decentralized local cash-ramp.
- **What would you put on the first screen to explain MicoPay in five seconds?**
  > A clear hero heading and sub-headline:
  > **"Turn crypto into physical cash with trusted local agents."**
  > Sub-headline: *"Cash out USDC or buy crypto in minutes. Non-custodial, protected by escrow."*

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, substantial potential. Nigeria has one of the highest peer-to-peer crypto trading volumes globally, with freelancers, software developers, and remote workers earning in stablecoins (USDC/USDT). Cash remains essential for daily living expenses, groceries, and local transport. A trustless, escrow-backed cash ramp connecting users with neighborhood agents would address a major daily need.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > Remote workers and freelancers paid in crypto, individuals receiving family remittances from abroad, and existing agency banking/POS shop operators who already provide cash deposit and withdrawal services throughout neighborhoods.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > People currently use centralized P2P exchange platforms (e.g. Binance, Bybit) and local crypto fintech apps. Total spreads and fees typically range from 1% to 3.5%. The major risks include commercial bank accounts being frozen or restricted due to P2P bank transfers, counterparty delays, and peer-to-peer payment fraud.
- What would MicoPay need to change to work there?
  > 1. Support Nigerian Naira (NGN) and integrate with local cash agent networks (such as POS operators).
  > 2. Support multi-chain or popular Stellar wallets (such as Lobstr) in addition to Varial.
  > 3. Provide a clear, public-facing landing page explaining the cash-out mechanism before requiring wallet connection.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **4 / 5.** The core concept of an escrow-protected, peer-to-peer crypto-to-cash ramp is extremely valuable in cash-heavy emerging markets. It is not a 5 yet because the entry screen provides no explanation of the service and wallet choices are currently restricted to Varial.
- What is the most valuable part?
  > The escrow mechanism: smart contracts holding funds until both parties verify physical cash exchange via QR scan, with an automatic timeout refund protecting users if an agent fails to meet.
- What is missing?
  > A public landing preview explaining the service before login, support for multiple fiat currencies (including NGN), and support for mainstream wallets.
- What would stop you from using it?
  > An absence of verified, nearby cash agents in my area, or excessive agent fees compared to standard exchange rates.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - **The landing screen (`#/login`):** It resembles an internal login modal rather than a consumer homepage. I expected a introductory banner or 3-step graphic explaining how MicoPay works before the "Connect wallet" button.
  > - **The top testnet banner:** The black top banner (`Testnet: red de pruebas, sin dinero real`) remains in Spanish even when the language is switched to English (`EN`).
  > - **Wallet modal:** Clicking "Connect wallet" opens a modal showing only "Varial" (`Install ↗`), without having informed the user beforehand that Varial is the only supported wallet.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** First-time visitors arrive at `#/login` and cannot tell what MicoPay does, causing high bounce rates. · **Idea:** Add a concise 3-step visual summary on the login screen: *"1. Connect wallet -> 2. Meet local agent -> 3. Receive physical cash protected by escrow."*
2. **Problem:** Users who do not have Varial installed cannot see how the app looks or operates. · **Idea:** Add a "Explore demo / view agent map" link on `#/login` allowing read-only access to the map and interface without requiring an immediate wallet connection.
3. **Problem:** English-speaking users see untranslated Spanish in the top banner and parts of the interface. · **Idea:** Fully localize the top testnet banner and any alert messages when toggling between `EN` and `ES`.
