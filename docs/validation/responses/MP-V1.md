# MP-V1 · Product validation: First look: what do you think MicoPay is?

- **Issue:** #493
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), 1920x1080, Google Chrome
- **App language you used:** English (tested `EN` / `ES` toggle)

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > When I first opened `https://app.micopay.com.mx`, my honest reaction was that it looks like an unfinished login wall. All I saw was the name `MicoPay`, a short line saying `Connect your wallet`, a small security box about keeping my recovery phrase safe, and an orange `Connect wallet` button. There was nothing explaining what the app actually does, what services it offers, or why I should connect.
- Who is it for?
  > It felt like it was built only for people who already know about MicoPay from somewhere else and already have a wallet ready to connect. If I shared this link with a friend or colleague, they would have no idea what it is.
- What problem does it solve?
  > From that first screen, I could not tell what problem it solves. It only talks about security—telling me that my key stays in my wallet and that MicoPay never sees it. It does not mention cash, trading, or payments anywhere.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I was surprised to find out that MicoPay is actually an in-person, cash-in and cash-out network using local agents and escrow. In step 1, I assumed it was either an online crypto payment processor or a DeFi swap. Nothing on that front screen gave any hint about physical cash or meeting someone nearby.
- What is still unclear?
  > How agents are found in practice, what the exchange rate is compared to the regular market rate, and whether there will ever be agents outside Mexico.

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. Opened `https://app.micopay.com.mx` and wrote down my thoughts for Section 1 while looking at the login card.
  > 2. Tested the `ES` / `EN` toggle at the top of the card. The card text switched cleanly between English and Spanish, but the black banner at the top (`Testnet: red de pruebas, sin dinero real`) stayed in Spanish.
  > 3. Clicked `Connect wallet`, connected my Varial wallet on testnet, and signed in.
  > 4. Read through the Welcome guide slides, which explained how cash agents, escrow, and meeting someone work.
  > 5. Looked around the rest of the app: checked the Home balance screen, Explore map, and Profile.
  > I stopped after exploring the screens because this is on testnet and there are no real cash agents near me to do an actual trade with.
- Where did you get stuck, even for a moment?
  > Before connecting, I tried typing other paths like `#/explore` and `#/cashout` in the browser bar to see if I could preview the app without a wallet, but it kept bouncing me straight back to `#/login`. You cannot see anything about the product until you connect.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **What did the first screen tell you, and what did it leave out?**
  > It told me the name MicoPay, that I need to connect a wallet, that my key stays on my device, and that I need to guard my recovery phrase because MicoPay cannot restore it. It left out everything that matters to a user: that it is for turning crypto into physical cash, that local agents exist, what currencies it supports, and how it works.
- **What word or sentence made the product click for you, if any?**
  > In the welcome guide, under "How you exchange cash", the sentence: *"In MicoPay, the one who gives or takes your cash is another person: a MicoPay Network agent. It can be a shop, a stall or an individual near you."* followed by *"Cash out: you hand over crypto and the agent gives you bills."* That was the exact moment the whole concept made sense to me.
- **What would you put on the first screen to explain MicoPay in five seconds?**
  > Headline: *"Turn your crypto into physical cash with trusted local agents."*
  > Sub-headline: *"Cash out USDC or buy crypto in minutes. Non-custodial, protected by escrow."*

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, I do. Almost all of the money I earn online from bounties, development work, and freelance tasks comes in as USDC or USDT. Getting that money out into physical cash to pay for daily things like groceries, transport, or bills is something I deal with every week.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > People like me who work online and get paid in stablecoins, people receiving money from family members abroad, and the local POS (Point of Sale) shop operators on almost every street corner who already do cash deposits and withdrawals for everyone.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > What I use today is Binance P2P or local exchange apps to sell my crypto for Naira. Between the exchange spread and withdrawal fees, it costs me about 2% to 3% every time I cash out. What really bothers me is the stress: local bank accounts here frequently get flagged or frozen if a bank suspects a transfer is from crypto P2P. On top of that, sometimes you get stuck waiting 20 to 30 minutes for a buyer to actually send the money.
- What would MicoPay need to change to work there?
  > It needs to support Nigerian Naira (NGN), have verified cash agents in local neighborhoods, and allow normal wallets that people already have instead of requiring Varial.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **4 / 5.** The idea of being able to swap my crypto directly for cash through an escrow system is very useful to me. I only took off one point because the first screen does not explain anything and I had to install a new wallet just to see it.
- What is the most valuable part?
  > The escrow protection: knowing that the crypto is held safely until cash changes hands in person, and that if the person doesn't show up, the funds can be refunded.
- What is missing?
  > An explainer on the homepage before connecting, support for my local currency, and support for more wallets.
- What would stop you from using it?
  > If there are no active agents near where I live, or if the fees turn out to be much higher than regular P2P.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - **The login screen:** It felt like an internal tool login rather than a consumer product. I expected a short 1-2-3 explanation of the app before being asked to connect a wallet.
  > - **The top banner:** Even when I clicked the English toggle (`EN`), the top banner (`Testnet: red de pruebas, sin dinero real`) stayed in Spanish.
  > - **The wallet choice:** Clicking "Connect wallet" only gave me Varial with an external link arrow. I expected either multiple wallets or a note beforehand telling me Varial was required.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** People opening the site for the first time don't know what it is and will just close the tab. · **Idea:** Put a simple 3-step visual guide on the login screen showing how MicoPay works before the connect button.
2. **Problem:** You can't see the app or the agent map without connecting a wallet first. · **Idea:** Add a "Browse without wallet" button so visitors can view the map and see how cash-out works before installing anything.
3. **Problem:** The top testnet banner stays in Spanish in English mode. · **Idea:** Translate that banner when switching to English so the page feels fully finished.
