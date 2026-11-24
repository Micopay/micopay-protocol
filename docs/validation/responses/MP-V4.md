# MP-V4 · Product validation: Receiving: your address, your QR and USDC

- **Issue:** #496
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), 1920x1080, Google Chrome
- **App language you used:** English (tested `EN` / `ES` toggle)

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > Before opening the Receive screen, I expected it to look like a typical crypto deposit screen on any wallet or exchange: show me a clear QR code and an address I can copy, and automatically accept both XLM and USDC as soon as they are sent. I did not expect that I would have to manually "enable" USDC or hold extra XLM in reserve just to be able to receive it.
- Who is it for?
  > For myself to deposit crypto into the app, or to share with a client, platform, or friend who needs to send me funds.
- What problem does it solve?
  > Giving me a straightforward, reliable destination address and QR code so other people can pay me in crypto.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I was surprised that receiving USDC requires an extra step called "Enable USDC" and that it requires a 0.5 XLM reserve. When I first tested it on a brand-new account with zero balance, clicking the enable button simply failed. I had to go to the Stellar testnet friendbot to fund my account with test XLM before the app would let me activate USDC.
- What is still unclear?
  > It is still unclear whether a sender using a completely different wallet or exchange can scan this QR code directly, or whether their wallet will understand what token to send.

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. Signed in with Varial on testnet and navigated to the Receive tab (`#/receive`).
  > 2. Saw the large QR code in the middle of the screen and my Stellar address right below it. Clicked the `Copy` button, which changed to `Copied!` with a checkmark.
  > 3. Saw the `Accepts:` section with badges for `XLM` and `USDC`.
  > 4. Saw the message: *"To receive USDC, your account enables it once (0.5 XLM reserve)."* along with an `Enable USDC` button.
  > 5. Because my test account was new and had zero balance, I got test XLM from the Stellar testnet friendbot.
  > 6. Returned to the Receive screen and clicked `Enable USDC`. The button changed to `Enabling…`, and a popup from Varial asked me to approve the transaction.
  > 7. Approved the transaction in the wallet. Once it confirmed on the network, the button disappeared and USDC was enabled.
  > I stopped after successfully activating USDC and verifying that both my address and QR code were ready to receive funds.
- Where did you get stuck, even for a moment?
  > When I first clicked "Enable USDC" with an unfunded account, it failed because a new account needs an initial XLM balance to exist on the network and cover the 0.5 XLM reserve. The app did not tell me why it failed or that I needed XLM first.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **Was it clear which address and QR to share to receive funds?**
  > Yes, the QR code is centered and prominent, and the address is right beneath it with a clean Copy button. However, the screen does not explicitly say whether that single address receives both XLM and USDC. Because some networks require different addresses for different tokens, a short sentence like *"This address receives both XLM and USDC"* would eliminate any doubt.
- **Did you understand why USDC needs to be "activated" first?**
  > I understood it because the note under the badges explains: *"To receive USDC, your account enables it once (0.5 XLM reserve)."* But for someone who has never used Stellar, having to "activate" a coin before receiving it is confusing, especially if they have zero balance and the activation fails without explaining that they need XLM first.
- **What would you expect to see on this screen that is not there?**
  > 1. An option to enter a requested amount so the QR code encodes the exact amount for the sender.
  > 2. A direct "Share" button to send the address straight to messaging apps like WhatsApp or Telegram.
  > 3. A warning or link explaining how to fund the account with XLM if the balance is currently zero.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, definitely. Receiving USDC is how I get paid for almost all of my online work and bounties. Being able to receive that USDC in a self-custody app and then swap it directly for local cash would fit right into my everyday routine.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > Freelancers and developers who earn in stablecoins, people receiving remittances from relatives living abroad, and local shop owners who already act as cash agents in our neighborhoods.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > Right now, when I receive USDC, I transfer it to an exchange like Binance or Bybit and sell it through P2P for local bank transfer. It costs me around 2% to 3% in fees and exchange rate spreads. The biggest problem for me is the fear of bank account freezes: Nigerian banks frequently block accounts that receive funds from P2P buyers. If I could just meet a verified local agent and get cash safely via escrow, it would remove that risk completely.
- What would MicoPay need to change to work there?
  > It needs to support Nigerian Naira (NGN), have trusted cash agents on the ground, and make it clearer how the 0.5 XLM reserve works so new users don't get stuck with empty accounts.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **4 / 5.** The Receive screen is very clean and does exactly what it needs to do. It only loses a point because of the confusion around needing XLM before enabling USDC on a brand-new account.
- What is the most valuable part?
  > Having a single screen with a big QR code, a one-click copy button, and a simple one-tap button to enable USDC.
- What is missing?
  > An amount input for the QR code, a direct share button, and a helpful prompt explaining how to get the initial XLM reserve.
- What would stop you from using it?
  > If someone tries to send me USDC and the transaction fails because I didn't know I had to enable it first with an XLM reserve.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - **The "Enable USDC" failure when unfunded:** Clicking "Enable USDC" on a new account failed with an error because I had no XLM. I expected the app to tell me: *"You need at least 0.5 XLM in your account to enable USDC."*
  > - **No amount field:** The QR code only contains the address. I expected to be able to type in an amount so the sender doesn't have to enter it manually.
  > - **Top banner in Spanish:** The top black banner (`Testnet: red de pruebas, sin dinero real`) remained in Spanish even with English selected.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** Users with zero balance click "Enable USDC" and get an error without knowing why. · **Idea:** Check the XLM balance first; if it is zero, show a message: *"Your account needs 0.5 XLM to enable USDC"* along with instructions or a testnet faucet link.
2. **Problem:** Senders have to type in the payment amount by hand. · **Idea:** Add an optional "Amount" box on the Receive screen so the generated QR code pre-fills the amount in the sender's wallet.
3. **Problem:** Senders might be unsure if the address accepts USDC. · **Idea:** Put a small label directly under the address: *"This address receives both XLM and USDC"*.
