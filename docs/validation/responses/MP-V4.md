# MP-V4 · Product validation: Receiving: your address, your QR and USDC

- **Issue:** #496
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), 1920x1080 display, Google Chrome
- **App language you used:** English (tested `EN` / `ES` toggle)

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > From the initial screen (`https://app.micopay.com.mx/#/login`), the page displays the heading `MicoPay`, a subtitle `Connect your wallet`, security text stating `"Your key stays in your wallet. MicoPay will ask you to sign and will never see it."`, a recovery phrase warning box, and an orange `Connect wallet` button. Based only on this landing view, it appears to be a non-custodial crypto portal on Stellar testnet (`Testnet: red de pruebas, sin dinero real` in the top bar), but it does not specify what actions or transactions users can perform.
- Who is it for?
  > For crypto users who already hold self-custody wallets, understand key management, and know how to sign transactions.
- What problem does it solve?
  > The first screen explains only self-custodial key safety without describing the real-world problem or service it provides.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I assumed I would be able to preview the navigation or see the Receive and Cash-out screens before connecting a wallet, but any direct route (such as `#/receive` or `#/cashout`) immediately redirected back to `#/login`. Once connected, I realized MicoPay is an in-person, escrow-based cash-in/cash-out protocol. I was also surprised that receiving USDC requires an explicit "Enable USDC" trustline step rather than working automatically like native XLM.
- What is still unclear?
  > It is unclear whether the QR code on the Receive screen uses a standard Stellar payment URI format (like SEP-0007) so third-party external wallets can scan it, and whether senders must already have a trustline established on their side as well.

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. Completed Section 1 from `#/login` before connecting a wallet.
  > 2. Connected Varial wallet on Stellar testnet and entered the app dashboard.
  > 3. Clicked on the `Receive` button in the navigation to open `#/receive`.
  > 4. Viewed the central QR code (`QRCodeSVG`) and the `Your Stellar address` card. Tested the `Copy` button, which copied the address and briefly showed `Copied!`.
  > 5. Funded the testnet account using the Stellar testnet friendbot to supply test XLM for account reserves and transaction fees.
  > 6. On the Receive screen, under the `Accepts:` section displaying `XLM` and `USDC` chips, I saw: *"To receive USDC, your account enables it once (0.5 XLM reserve)."* and clicked the `Enable USDC` button.
  > 7. The button updated to `Enabling…` and prompted Varial to sign a `changeTrust` transaction.
  > 8. Once approved, the transaction confirmed on Horizon, the enable button disappeared, and the USDC trustline became active.
  > I stopped after successfully activating the USDC trustline and verifying the address and QR display, as there are no live peer cash agents on testnet to conduct an in-person trade.
- Where did you get stuck, even for a moment?
  > Before funding the test account with XLM from the friendbot, the account was unfunded on Horizon. Attempting to interact or enable USDC gave an error because a brand-new Stellar account requires a minimum XLM balance before any trustline operation can succeed.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **Was it clear which address and QR to share to receive funds?**
  > Yes. The QR code is displayed prominently in the center of the card, and directly beneath it is a section titled `"Your Stellar address"` showing the full public key with a dedicated `"Copy"` button that changes to `"Copied!"` upon clicking. However, it would help to include a short caption directly under the address stating: *"Share this address or QR to receive both XLM and USDC"*, because users from other blockchain ecosystems may wonder whether a separate address is required for tokens versus native coins.
- **Did you understand why USDC needs to be "activated" first?**
  > Yes, because Stellar requires establishing a trustline (`changeTrust` operation) with a 0.5 XLM reserve requirement before an account can hold non-native issued assets like USDC. The explanation under the badges (*"To receive USDC, your account enables it once (0.5 XLM reserve)."*) explains the reserve requirement well. However, someone completely new to Stellar won't know why this is necessary or that having 0 XLM prevents activation.
- **What would you expect to see on this screen that is not there?**
  > 1. An option to request a specific amount (e.g. "Request amount" field that encodes amount into a payment QR code).
  > 2. A direct "Share" button for mobile/desktop to share via messaging apps or clipboard.
  > 3. A visible network indicator (e.g. "Stellar Testnet") next to the address to prevent accidental mainnet transfers.
  > 4. A helper link or tip on how to fund the initial XLM reserve if the account has a zero balance.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, strong potential. Nigeria has widespread crypto adoption, with many developers, freelancers, and remote workers receiving earnings in stablecoins (USDC/USDT) to avoid local currency depreciation. Physical cash remains essential for daily expenses (local markets, transport, neighbourhood shops). An escrow-protected cash-out network could offer a safer alternative to current peer-to-peer off-ramps.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > Freelancers and tech contractors paid in USDC, recipients of remittances from family abroad, and existing neighbourhood POS/agency banking operators who could register as cash agents to earn transaction fees.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > Today, people rely on centralized P2P exchange desks (e.g., Binance, Bybit) and local crypto fintech apps. Fees and spreads typically range from 1% to 3.5%. The major risks are commercial bank accounts getting flagged or suspended due to P2P transactions, counterparty payment delays, and occasional fraud.
- What would MicoPay need to change to work there?
  > 1. Support Nigerian Naira (NGN) and local cash-out channels (such as local POS agent networks).
  > 2. Support widely adopted Stellar/EVM wallets rather than exclusively Varial.
  > 3. Provide educational tooltips explaining trustlines and reserves so users with new wallets do not get stuck.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **4 / 5.** The ability to receive USDC and cash out with non-custodial security is high value. It loses one point only because wallet choices are currently restricted to Varial and there are no live agents yet on testnet.
- What is the most valuable part?
  > The non-custodial model: funds remain under user control in their wallet, and the Receive interface makes generating an address and activating USDC straightforward with a single click.
- What is missing?
  > An option to generate an amount-specific QR code, a native share sheet button, and support for additional wallets.
- What would stop you from using it?
  > Having no active agents in my local area, or fees exceeding standard P2P rates.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - **The "Enable USDC" failure when unfunded:** When testing with a zero-balance account, clicking "Enable USDC" failed without clearly explaining that the account must first hold XLM to cover the 0.5 XLM reserve. I expected an explanatory message: *"Account needs at least 0.5 XLM reserve to enable USDC."*
  > - **Top testnet banner language:** The banner at the top of the screen (`Testnet: red de pruebas, sin dinero real`) remains in Spanish even when the application language is switched to English (`EN`).
  > - **Network clarification:** The address is labeled `"Your Stellar address"`, but does not mention whether this address is valid for both XLM and USDC.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** Users with zero XLM balance encounter failures when attempting to enable USDC without understanding why. · **Idea:** Check the XLM balance before displaying the "Enable USDC" button; if balance is below 0.5 XLM, show an informative banner: *"You need 0.5 XLM to enable USDC"* along with instructions or a testnet faucet button.
2. **Problem:** Senders must manually enter payment amounts because the QR code only contains the raw address. · **Idea:** Add an optional "Enter amount" input on the Receive screen that generates a SEP-0007 / Stellar payment URI QR code with the pre-filled amount.
3. **Problem:** Senders unfamiliar with Stellar might hesitate over whether USDC can be sent to the same address as XLM. · **Idea:** Add a note directly beneath the address box: *"This address receives both XLM and USDC on the Stellar network."*
