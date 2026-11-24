# MP-V2 · Product validation: Signing in with your wallet (Varial)

- **Issue:** #494
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), 1920x1080 display, Google Chrome
- **App language you used:** English (tested `EN` / `ES` toggle)

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > From the first view at `https://app.micopay.com.mx/#/login`, the interface displays the brand name `MicoPay`, a heading `Connect your wallet`, security text explaining that `"Your key stays in your wallet. MicoPay will ask you to sign and will never see it."`, a warning card about protecting the wallet recovery phrase, and an orange `Connect wallet` button. Judging solely by this page, it looks like a web3 gateway on Stellar testnet (`Testnet: red de pruebas, sin dinero real`), but it gives no details about what actions users can execute once inside.
- Who is it for?
  > For individuals who already own a compatible web3 wallet, understand non-custodial key safety, and know how to sign blockchain transactions.
- What problem does it solve?
  > The screen explains only how user keys are protected (non-custodial self-custody), without indicating what problem the service solves or why someone needs to connect.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > In step 1, I assumed clicking "Connect wallet" would present a selection of popular crypto wallets. I was surprised that the Stellar Wallets Kit modal only offered **Varial** (`Install ↗`), requiring me to install a specific browser extension. I was also surprised that after connecting, the app prompted me to register a MicoPay username (and optional phone number), which binds my Stellar public key to an in-app profile.
- What is still unclear?
  > It is still unclear whether an account profile (username, phone hash, activity) can be migrated or linked to a different wallet in the future, or whether losing access to that single wallet key permanently locks out the profile.

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. Wrote Section 1 before installing or connecting a wallet.
  > 2. Clicked `Connect wallet` on `#/login`. The Stellar Wallets Kit modal opened listing only `Varial` with an `Install ↗` link.
  > 3. Installed the Varial wallet extension from `https://varialwallet.com/`, created a test wallet account, and switched the network toggle in Varial to Stellar Testnet.
  > 4. Returned to `https://app.micopay.com.mx`, clicked `Connect wallet`, and approved the connection prompt in Varial.
  > 5. The screen transitioned into the registration state, displaying my Stellar public key in a monospace box, a `Username` input field ("Use 3 to 30 letters, numbers or underscores."), and an optional `Phone` input field ("The number is never sent to the server").
  > 6. Entered a username and clicked `Create account`. The button updated to `Waiting for your wallet…` while Varial presented a SEP-10 authentication signature challenge.
  > 7. Approved the signature in Varial; the app verified the challenge, stored the session token, and redirected to the main dashboard.
  > I stopped after completing the full wallet onboarding, account registration, and initial dashboard exploration.
- Where did you get stuck, even for a moment?
  > The most friction occurred when realizing Varial was set to Stellar Mainnet by default. The initial connection attempt failed with a generic alert (`Couldn't connect your wallet`) until I opened the Varial extension settings and manually switched the network toggle to Testnet.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **Which step was the hardest: the wallet, the network switch, connecting, or creating the account?**
  > The network switch inside the wallet was the hardest step. When Varial was freshly installed, it defaulted to Stellar Mainnet. When clicking "Connect wallet", the app simply showed the red alert `Couldn't connect your wallet` without explaining that the network was mismatched. Once I manually switched Varial to Testnet, connecting and creating the account (entering a username) was very fast, clear, and seamless.
- **When the app asked you to sign, did you understand what you were signing? Did it feel safe?**
  > As an experienced crypto user, I understood that the signature was a standard SEP-10 web authentication challenge used to verify wallet ownership without transferring funds. The reassurance on the login screen (*"Your key stays in your wallet. MicoPay will ask you to sign and will never see it."*) provided good trust. However, the cryptographic string displayed inside the wallet signature popup can look alarming to beginners. Adding an explanatory notice in MicoPay saying *"This signature is only used to verify your identity; it is free and does not move any funds"* would make it feel completely safe for everyone.
- **What would have made it easier for someone new to crypto?**
  > 1. A 3-step setup guide directly on the login card: *"1. Install Varial -> 2. Switch to Testnet in Varial -> 3. Click Connect"*.
  > 2. Specific error detection: replacing the generic `Couldn't connect your wallet` message with *"Please switch your wallet network to Stellar Testnet"*.
  > 3. Supporting multiple well-known Stellar wallets (like Lobstr or Freighter) so users don't necessarily have to install an unfamiliar extension.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, significant potential. Nigeria is one of the largest peer-to-peer crypto markets globally. Countless tech workers, remote employees, and creatives earn in stablecoins (USDC/USDT). At the same time, cash is essential for day-to-day living expenses and informal commerce. A secure, escrow-backed cash-ramp model that connects users directly with neighborhood agents solves real daily friction.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > Freelancers and contractors paid in stablecoins, people receiving overseas remittances, and neighbourhood agency banking / POS operators who already provide cash-in and cash-out services in local communities.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > Most people use centralized exchange P2P markets (Binance, Bybit) and local crypto fintech apps. Spreads and fees typically range between 1% and 3.5%. The major problems are commercial bank accounts being flagged or frozen following P2P transfers, payment delays by counterparties, and occasional fraudulent chargebacks.
- What would MicoPay need to change to work there?
  > 1. Support Nigerian Naira (NGN) and local agency banking/POS networks.
  > 2. Expand wallet support beyond Varial to include popular multi-chain or Stellar mobile wallets.
  > 3. Provide upfront product education and onboarding guidance for first-time visitors.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **4 / 5.** The non-custodial wallet sign-in model is very convenient: there are no centralized passwords to create or remember, and the user retains full custody. It is rated 4 instead of 5 because wallet choices are currently limited to Varial and switching networks manually can confuse users.
- What is the most valuable part?
  > Passwordless self-custody: logging in with cryptographic proof while ensuring MicoPay never holds or sees user private keys.
- What is missing?
  > Support for additional Stellar wallets, automatic network detection prompts, and a clear explanation of what the SEP-10 login signature does.
- What would stop you from using it?
  > Hesitation to install an unfamiliar wallet extension just to test a single web app, or having no local agents nearby.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - **Generic error on network mismatch:** When Varial was set to Mainnet, clicking "Connect wallet" failed with `Couldn't connect your wallet` without indicating that the network was wrong. I expected: *"Please switch your Varial wallet to Stellar Testnet."*
  > - **Single wallet option:** The Stellar Wallets Kit modal only showed Varial (`Install ↗`). I expected either multiple wallet choices or a note on the login card explaining that Varial is currently the required wallet.
  > - **Top testnet banner:** The black top banner (`Testnet: red de pruebas, sin dinero real`) remains in Spanish even when the language toggle is set to English (`EN`).

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** Users get stuck when their wallet is on Mainnet because the app only displays a generic "Couldn't connect your wallet" error. · **Idea:** Detect network state during connection and display a dedicated prompt: *"Your wallet is on Mainnet. Please switch Varial to Stellar Testnet."*
2. **Problem:** Newcomers are afraid of signing cryptographic messages in their wallet extension. · **Idea:** Add a note directly above the connect/login button explaining: *"Signing in is free and only verifies your wallet ownership. It cannot spend funds or approve transfers."*
3. **Problem:** Requiring Varial exclusively creates friction for users with existing wallets. · **Idea:** Enable Freighter and Lobstr in Stellar Wallets Kit so users can sign in with existing Stellar wallets.
