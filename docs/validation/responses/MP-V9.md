# MP-V9 · Product validation: Being an agent in your country

- **Issue:** #501
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), 1920x1080 viewport, Chrome browser
- **App language you used:** English

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > Looking at the first screen, I see a clean card titled "MicoPay" asking me to "Connect your wallet". It shows a prominent "Connect wallet" button, security notices about keeping keys private in my wallet, and a warning that my recovery phrase must never be shared. From this landing screen alone, I think it is a non-custodial crypto wallet manager or decentralized portal, because there is no mention on this first page that it connects users to physical cash agents to exchange crypto for local banknotes.
- Who is it for?
  > It looks like it is built for crypto holders who already have a Web3 wallet and are used to signing blockchain transactions.
- What problem does it solve?
  > The first screen highlights self-custody and key privacy, so it seems focused on keeping crypto funds secure without giving a third party custody of user keys.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I completely missed in step 1 that MicoPay is about real physical cash handoffs with human agents nearby. When I went through the agent onboarding screens, I was surprised to learn that an agent does not need to own an official company or store—it can just be an individual, a stall, or a neighborhood shop. I was also surprised that you do not need a special separate app to be an agent; your same wallet can both cash out crypto and act as an agent when you have cash on hand.
- What is still unclear?
  > It is still not clear to me what happens if there is an in-person dispute during the cash handoff—for example, if someone gives me fake banknotes or claims I didn't hand them the full amount after the code is confirmed. It is also not clear whether an agent can accept or dispense local currencies other than Mexican Pesos (MXN).

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. I opened `https://app.micopay.com.mx` on my browser and saw the login screen. I clicked the language selector to set the app to English.
  > 2. I clicked "Connect wallet" and saw the wallet picker modal. The only wallet available was Varial on testnet, so I set up a testnet account and connected it.
  > 3. Once signed in, I went to my profile and opened the agent onboarding flow ("Join the MicoPay Network").
  > 4. I read through the 4 steps explaining the role: giving cash to people nearby in exchange for crypto plus a commission, having cash ready, and meeting only in safe, busy public spots.
  > 5. I reached the requirements checklist screen which lists: identity verification, configuring limits, and activating the agent profile.
  > 6. I stopped at the identity verification step because completing full legal KYC on the live provider was as far as I could proceed on the testnet setup without real-world identity processing. I did not unlock the final live "Rate, limits and location" settings screen in the app interface since it requires completed verification first.
- Where did you get stuck, even for a moment?
  > When I clicked "Connect wallet", only one specific wallet (Varial) was offered. Since I did not have Varial installed initially, I had to stop and look for the extension before I could enter the app.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **Would you become an agent where you live? Why or why not?**
  > Yes, I would definitely consider becoming an agent, provided I can operate during the daytime in busy, well-lit places like a local supermarket or a shopping mall. Around my area, POS cash withdrawal spots are everywhere, so people are already very comfortable getting cash from independent operators. Earning extra income through crypto commissions would be attractive to me, but personal safety and being able to check for genuine banknotes would be my main requirements before accepting a meetup.
- **Do people near you need to swap USDC or other crypto for cash? Who?**
  > Yes, myself and many friends around me need this regularly. I do freelance technical work and receive earnings in crypto/USDC, and my developer colleagues also get paid in stablecoins or Web3 grants. Because local shops, public transport, and neighborhood markets only take cash or local bank transfers, we constantly need to turn our crypto into local cash for daily food, transportation, and family expenses.
- **What would stop you: safety, the law, having enough cash, the fee, something else?**
  > The biggest thing that would stop me is physical safety and the risk of counterfeit cash—meeting strangers with large amounts of physical bills carries real risk. The second obstacle is cash float: having enough physical paper cash ready in my wallet every day to fulfill requests without tying up all my personal money.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, I see great potential because cash agents are already part of daily life here. Bank ATMs frequently break down or have long lines, so I and most people I know already walk up to neighborhood cash kiosks several times a week to get cash. Being able to do that directly with crypto instead of routing through complex bank hoops would fit naturally into our routine.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > I would use it as a freelancer paid in stablecoins. Many friends receiving small remittances from family abroad would use it, and small shop owners who already hold cash could easily use it to earn commissions by serving as neighborhood cash points.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > Today, I use peer-to-peer (P2P) trading on centralized exchanges or ask friends directly for cash. The problems I personally face are:
  > - Bank accounts sometimes get flagged or temporarily restricted when receiving transfers linked to peer-to-peer crypto trades.
  > - P2P exchange spreads and fees take around 1.5% to 3%, and there is always anxiety about whether a counterparty will send the money promptly or try to appeal maliciously.
- What would MicoPay need to change to work there?
  > - It must support our local currency (Nigerian Naira) and local exchange rates, not just Mexican Pesos (MXN).
  > - It should support more widely used Stellar wallets (such as Freighter or LOBSTR) so users aren't restricted to a single browser wallet.
  > - It would help to allow bank transfers or mobile payments as an option alongside physical bills, since carrying large amounts of physical cash on the street can be dangerous.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **4 / 5.** The concept of having funds locked safely in escrow until you meet in person gives peace of mind, and exchanging directly in the community cuts out the headache of traditional exchange off-ramps.
- What is the most valuable part?
  > The escrow protection—knowing the crypto is held safely until the cash is physically handed over and verified.
- What is missing?
  > Support for my local currency, a clear way to report or handle disputes if something goes wrong during the cash exchange, and a way to see an agent's past successful transactions or community trust rating.
- What would stop you from using it?
  > If there are no active agents near where I live, or if it only supports Mexican Pesos.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - On the first login screen, there is no explanation of what MicoPay actually does. I only saw "Connect your wallet" and key security notices. I expected a short sentence like "Exchange crypto for cash with trusted agents near you".
  > - The wallet modal only allows Varial. I expected to see other common Stellar wallets like Freighter or an option to test a demo mode.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** Meeting a stranger in an unfamiliar place with cash creates safety concerns for both the agent and the user.  
   **Idea:** Allow agents and users to pick from suggested, well-known public meetup locations (such as inside a supermarket, a busy shopping center, or near a bank security post) rather than open street corners.
2. **Problem:** People in my country cannot use the service because everything is denominated in Mexican Pesos (MXN).  
   **Idea:** Let users choose their local currency so agents can quote their cash limits and receive requests in the money they actually carry.
3. **Problem:** New users visiting the website for the first time don't understand that the app is for in-person cash exchange.  
   **Idea:** Add a simple 3-step visual banner on the landing page explaining: "1. Request cash, 2. Meet an agent nearby, 3. Receive your cash safely".
