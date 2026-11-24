# MP-V9 · Product validation: Being an agent in your country

- **Issue:** #501
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), 1920x1080 viewport, Chromium browser
- **App language you used:** English (tested with English and Spanish toggle)

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > Looking at the first screen (`#/login`), it presents as a non-custodial crypto wallet sign-in interface. The page displays the "MicoPay" brand title, "Connect your wallet", key custody security notices ("Your key stays in your wallet. MicoPay will ask you to sign and will never see it"), recovery phrase safety warnings, and a "Connect wallet" button. Based solely on this screen, it looks like a decentralized crypto app / Web3 portal, but does not explicitly indicate on the front page that its primary utility is peer-to-peer cash-out / cash-in via local physical agents.
- Who is it for?
  > It looks targeted at crypto users who hold non-custodial Web3 wallets and are familiar with signing blockchain transactions.
- What problem does it solve?
  > The initial screen emphasizes transaction privacy and self-custody security, without directly explaining the real-world cash exchange or off-ramp problem it solves.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > In step 1, I did not realize that MicoPay is fundamentally a local cash-to-crypto / crypto-to-cash network powered by human agents in the community ("Agents are what make cash available in MicoPay"). I was surprised to see that becoming an agent does not require having an official registered business or commercial premises ("You don't need to have a business. It can be a store, a stall, or an individual"). I was also surprised that being an agent does not lock you into a separate merchant app or separate account—you remain a normal user who can also request cash-outs at any time.
- What is still unclear?
  > It is still unclear how physical safety and fraud disputes are handled in person if an agent hands over counterfeit local bills or if a client claims they never received the cash in person after code verification. Additionally, it is unclear whether agent settlement and matching support local currencies outside Mexico (MXN), such as NGN in West Africa.

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. Visited `https://app.micopay.com.mx` and arrived at `#/login`. Evaluated the landing card and tested the `ES` / `EN` language selector.
  > 2. Explored the wallet connection flow via Stellar Wallets Kit (`Connect wallet` modal). Reviewed the wallet requirement (**Varial** wallet on Stellar testnet).
  > 3. Reviewed the onboarding and agent flow under **Join the MicoPay Network** (`#/agent/join` / Profile):
  >    - Read the 4 onboarding steps:
  >      - **What it is:** "Give cash to people who need it and earn a commission for doing so. When someone near you wants to convert crypto to bills, you hand them the cash and receive crypto plus your commission."
  >      - **What it involves:** Mandatory identity verification ("handling cash in exchange for digital assets requires it by law from the first peso"), area disclosure ("We'll publish your area, not your address"), having cash available, and meeting in public busy places.
  >      - **Checklist:** Identity verification (via Didit KYC), configuration, and activation.
  >      - **Activation:** "You're an agent! ... You choose when to start. When you have cash on hand, make yourself available from your profile."
  > 4. Examined the agent configuration screen (**Rate, limits and location** / `MerchantSettings`):
  >    - Agent fee percentage: `Tasa del agente (%) · máximo 5%` (default configured rate with slider/input).
  >    - Trade limits: `Monto mínimo por operación (MXN)`, `Monto máximo por operación (MXN)`, and `Tope diario (MXN)`.
  >    - Availability controls: Single-tap toggle between `Disponible` (online) and `Pausar` (paused).
  >    - Location setup: Map pin location selector, device geolocation (`Usar mi ubicación actual`), and public meeting area description.
  > 5. Stopped before completing live fiat cash trades because the network is currently on testnet with mock liquidity and no live physical agents in my local area yet.
- Where did you get stuck, even for a moment?
  > In the `MerchantSettings` screen, several configuration field labels (such as `Tasa del agente (%)`, `Tope diario (MXN)`, and pause/resume button labels `Reanudar` / `Pausar`) remained in Spanish even when the application language was switched to English.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **Would you become an agent where you live? Why or why not?**
  > Yes, under the right conditions (safe public meeting spots, verified users, and decent commission volume). In Nigeria, the POS (Point-of-Sale) / cash agent business model is already widespread and highly popular for banking cash withdrawals and deposits. Becoming a crypto cash agent would be an attractive income stream for tech-savvy individuals or existing mobile money kiosk operators. However, I would only do it during daytime hours in high-traffic commercial spaces.
- **Do people near you need to swap USDC or other crypto for cash? Who?**
  > Yes, absolutely. Nigeria has one of the highest crypto adoption rates globally. Freelancers, software engineers, and remote workers receiving foreign pay in USDC/USDT constantly need to off-ramp to local fiat (NGN) for daily expenses, groceries, and bills. Web3 contributors earning bounty payouts (like Drips Wave grants) also need seamless conversion without jumping through complex exchange hoops.
- **What would stop you: safety, the law, having enough cash, the fee, something else?**
  > The primary concerns that would hesitate me are:
  > 1. **Physical Safety & Counterfeits:** Meeting unknown persons with physical cash carries personal security risks unless restricted to verified public spots or kiosks, and checking for counterfeit currency is a practical challenge.
  > 2. **Regulatory & Bank Scrutiny:** Local banking regulations and currency restrictions around cryptocurrency transactions require clarity on how agent cash-handling complies with local monetary authorities.
  > 3. **Liquidity / Cash Float:** Maintaining sufficient physical cash on hand at all times requires working capital.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, massive potential. Cash agency banking (POS agents) is a standard everyday payment rail in Nigeria because traditional bank ATMs frequently run out of cash or have long queues. Extending this model to crypto (swapping USDC directly for local cash with a nearby trusted agent) directly fits existing consumer behavior.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > Remote workers and freelancers paid in USDC/USDT; families receiving remittances from relatives abroad; crypto traders cashing out profits; and local neighborhood shops that want to earn extra commission by serving as neighborhood cash points.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > People currently use P2P platforms on centralized exchanges, OTC cash desks, or fintech virtual accounts. Common issues include:
  > - Counterparty fraud or chargeback attempts on bank transfers.
  > - Bank accounts occasionally getting flagged or frozen by traditional banks when transacting with third parties using crypto-related references.
  > - FX spread fees (typically 1.5% to 3.5%) and fluctuating parallel market rates.
- What would MicoPay need to change to work there?
  > - Add support for the local currency (NGN) alongside MXN.
  > - Integrate with local mobile banking / instant bank transfer rails or POS terminal integrations so agents don't have to carry only physical paper notes.
  > - Expand wallet connection options beyond Varial (e.g., support popular Stellar wallets like Freighter, LOBSTR, or Web3 connect standards).
  > - Fully complete the English translation across all agent management and onboarding screens.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **4 / 5.** The peer-to-peer agent cash model with on-chain smart contract escrow solves the biggest pain point of crypto off-ramping: eliminating middleman exchange custody while retaining escrow security.
- What is the most valuable part?
  > The smart contract escrow protection (`"Funds are held in escrow until you complete the meetup"`) combined with the agent privacy model (displaying only general area on the map until trade confirmation).
- What is missing?
  > Multi-currency support (supporting regions outside Mexico), integration with popular Web3 wallets, in-app dispute mediation workflow details, and reputation/review ratings for active agents.
- What would stop you from using it?
  > Lack of active liquidity or agents in my immediate geographic area, or remaining locked to a single wallet extension.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - **Merchant Settings Translation:** On the `Rate, limits and location` screen, the daily cap label (`Tope diario (MXN)`), rate fee label (`Tasa del agente (%) · máximo 5%`), and pause toggle (`Pausar` / `Reanudar`) remained in Spanish even when English was selected. I expected all labels to render in English.
  > - **Initial Landing Page (`#/login`):** The initial landing page only asks to connect a wallet without presenting what MicoPay actually does (agent cash exchange). I expected a clear introductory heading explaining the cash-to-crypto agent network.
  > - **Wallet Selection Gate:** In the wallet connection modal, only **Varial** is available, and users without Varial are directed off-site to install it. I expected standard multi-wallet options or a demo walkthrough mode.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** Agents and customers transacting in person need assurance against counterfeit bills and physical security risks.  
   **Idea:** Introduce a "Verified Safe Zones" feature for agents (partnering with recognized commercial centers, supermarkets, or registered POS kiosks) and provide an in-app verification checklist for physical cash inspection prior to releasing the cryptographic QR code.
2. **Problem:** Contributors and agents outside Mexico cannot utilize the app due to hardcoded MXN denominations.  
   **Idea:** Enable multi-currency support (e.g. NGN, USD, BRL) with dynamic FX oracle feeds and local payment methods (such as direct instant bank transfer alongside physical cash).
3. **Problem:** Incomplete localization in the agent dashboard (`MerchantSettings.tsx`) causes confusion for non-Spanish speaking agents.  
   **Idea:** Migrate hardcoded strings like `Tope diario`, `Tasa del agente`, and `Reanudar / Pausar` into `i18n/en.json` and `i18n/es.json` so the entire agent management lifecycle is fully multilingual.
