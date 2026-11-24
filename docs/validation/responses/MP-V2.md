# MP-V2 · Product validation: Signing in with your wallet (Varial)

- **Issue:** #494
- **Country / general region:** Nigeria (West Africa)
- **Device, screen size and browser:** Desktop (Windows), 1920x1080, Google Chrome
- **App language you used:** English (tested `EN` / `ES` toggle)

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > Before clicking connect, I expected this login screen to work like any regular web3 dApp: click "Connect wallet", see a list of popular wallets to pick from (or even an email option), approve the connection, and immediately land on a personal dashboard. I expected MicoPay to be an online wallet interface or exchange where you manage balances.
- Who is it for?
  > I assumed it was for anyone who already uses crypto and wants a simple, password-free login using their existing wallet.
- What problem does it solve?
  > I expected it to solve the friction of traditional logins by using a crypto wallet as identity instead of creating an email and password.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I was surprised that the wallet popup only showed one single option: **Varial**, with an "Install" link. I thought I could use any Stellar wallet I already had. I was also surprised that when I installed Varial, it defaulted to mainnet, and MicoPay just failed to connect without telling me why. Finally, I didn't expect that after connecting the wallet, the app would ask me to pick a username and optional phone number.
- What is still unclear?
  > If I ever switch browsers, lose my device, or want to log in on my phone, is my MicoPay username permanently locked to this specific Varial address, or can other wallets be linked to the same account later?

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > 1. Clicked `Connect wallet` on `#/login`. A popup modal opened showing only `Varial` with an `Install ↗` link.
  > 2. Followed the link to the Varial website, installed the extension on Chrome, and created a new test account.
  > 3. Returned to MicoPay and clicked `Connect wallet`. The button said `Waiting for your wallet…` and then failed with a red alert: `Couldn't connect your wallet`.
  > 4. Realized Varial was set to mainnet by default. Opened the Varial extension, went into its settings, toggled it to Stellar Testnet, and clicked `Connect wallet` again.
  > 5. This time it connected immediately. The card changed to show my address, a `Username` field, and an optional `Phone` field.
  > 6. Entered my username, clicked `Create account`, and approved the signature popup in Varial to verify my account.
  > 7. The app accepted the signature and took me to the main home screen.
  > I stopped after completing the full sign-in and account creation flow and verifying the dashboard loaded properly.
- Where did you get stuck, even for a moment?
  > I got completely stuck on the first connection attempt because Varial was on mainnet. The app just displayed `Couldn't connect your wallet` in a red box, giving me zero clues about what went wrong. I had to guess that the network setting in the wallet extension was the problem.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **Which step was the hardest: the wallet, the network switch, connecting, or creating the account?**
  > The network switch was definitely the hardest part. Because a fresh install of Varial defaults to mainnet, the app refused to connect and only showed a generic `Couldn't connect your wallet` error. There was no hint telling me to switch the wallet to Testnet. Once I manually changed that inside the extension, entering a username and creating the account took less than thirty seconds.
- **When the app asked you to sign, did you understand what you were signing? Did it feel safe?**
  > Yes, I understood that it was just a login signature to prove I own the address, without spending any money. The sentence on the screen saying *"Your key stays in your wallet. MicoPay will ask you to sign and will never see it."* helped reassure me. But inside the wallet popup itself, the text to sign looks like a long raw string of characters, which looks intimidating. A small line in MicoPay saying *"This signature is free and does not transfer any money"* would make it feel much safer for less technical users.
- **What would have made it easier for someone new to crypto?**
  > 1. Explaining right on the login screen that Varial is currently required, and that it must be set to Testnet.
  > 2. Showing a clear error message like *"Your wallet is on Mainnet. Please switch Varial to Testnet"* instead of just *"Couldn't connect your wallet"*.
  > 3. Allowing people to connect with other popular wallets they already know and use.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria (West Africa)
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, because a lot of my online income is paid in crypto stablecoins, but everything in my daily life requires local cash or bank transfers. An easy, non-custodial way to get cash without dealing with the risks of current P2P channels would solve a real problem for me.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > Remote workers and freelancers like me, people receiving support from relatives living abroad, and local corner shops who want to earn extra income by acting as cash agents.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > I currently use Binance P2P or local crypto off-ramp apps when I need to cash out my USDC. It usually costs me around 2% to 3% in spreads and network fees. What is wrong with it is the anxiety: Nigerian commercial banks frequently flag and freeze accounts that receive funds from P2P traders, and sometimes you end up dealing with unresponsive buyers or payment disputes while your crypto is held.
- What would MicoPay need to change to work there?
  > It needs to support Nigerian Naira (NGN), have verified cash agents in accessible neighborhoods, and support common mobile wallets so people don't have to install a brand new browser extension.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > **4 / 5.** Using the wallet as the account is great because I don't have to remember passwords or worry about a central database being breached. It only loses one point because it is locked to Varial right now and the mainnet error was confusing.
- What is the most valuable part?
  > The simplicity of wallet authentication: one click to sign, and you are in, with your keys remaining strictly on your own device.
- What is missing?
  > Support for other wallets, and clear guidance when a wallet is on the wrong network.
- What would stop you from using it?
  > If I had to install a new, unfamiliar extension on every device just to log in, especially on mobile where browser extensions are hard to manage.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > - **The generic error on mainnet:** When Varial was on mainnet, clicking "Connect wallet" just showed `Couldn't connect your wallet`. I expected the app to detect that the network was wrong and tell me: *"Please switch your Varial wallet to Testnet."*
  > - **Single wallet choice:** The connect popup only listed Varial. I expected to see standard wallet options or at least a note explaining that this test version only works with Varial.
  > - **Top banner language:** The banner at the top (`Testnet: red de pruebas, sin dinero real`) remained in Spanish even when the language toggle was set to `EN`.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** Users get a generic error if their wallet is on mainnet and have no idea what went wrong. · **Idea:** Detect network mismatch and show a clear message: *"Your wallet is on Mainnet. Please switch it to Stellar Testnet to sign in."*
2. **Problem:** First-time crypto users are scared by technical signature popups. · **Idea:** Put a friendly notice right above the connect button: *"Signing in only verifies you own this address. It is completely free and cannot spend your funds."*
3. **Problem:** Many users don't want to install an unfamiliar wallet extension just to test an app. · **Idea:** Add support for other popular Stellar wallets so people can use what they already have installed.
