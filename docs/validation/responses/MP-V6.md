# MP-V6 · Product validation: Finding an agent: map, offers and fees

- **Issue:** #498
- **Country / general region:** Nigeria
- **Device, screen size and browser:** Desktop Linux, about 800x600 viewport, Google Chrome
- **App language you used:** English

## 1. First look — what do you think it is?

*Open https://app.micopay.com.mx and write this before signing in or reading anything else.*

- What does MicoPay do, in your own words?
  > The first screen only shows "MicoPay", "Connect your wallet" and the line "Your key stays in your wallet. MicoPay will ask you to sign and will never see it." From that alone I would guess it is a wallet-based service that asks me to sign something, but I cannot tell yet what the service actually does. The strip at the top says "Testnet: red de pruebas, sin dinero real", so I know I am in a test environment.
- Who is it for?
  > I cannot tell from this screen. It appears to be for people who already have a wallet, because the only action is "Connect wallet", and the notice about the recovery phrase assumes I already own one.
- What problem does it solve?
  > Nothing is explained on this screen, so I cannot say. There is no sentence here about cash, agents, a map or a fee. The only promise is that my key stays in my wallet.

## 2. After trying it — what did you get wrong?

- What did you misunderstand in step 1, or what surprised you?
  > I guessed it might be a generic signing service because the first screen only talks about connecting a wallet and signing. After I clicked "Connect wallet", the modal was a Stellar wallet picker titled "Connect Wallet" with a single row for "Varial", so MicoPay is specifically a web app entered through a Stellar wallet. I was also surprised by the Varial unlock page, which says "Freighter is now Varial" above the "Unlock" button; I did not expect that name change inside the wallet flow.
- What is still unclear?
  > I still do not know what an agent is, why an agent charges a fee, or what I would see after connecting. None of the screens I managed to open mention cash, a map, offers or a percentage. I could not verify the fee explanation because I never reached the offers.

## 3. The task in your issue

*Do the task described in your issue. For each step, say what you did and what happened.*

- How far did you get? Where did you stop, and why?
  > I wrote step 1, then clicked "Connect wallet" on the first screen. The "Connect Wallet" modal opened with one row, "Varial". I selected it and Varial opened a page with "Welcome back", "Freighter is now Varial", an "Unlock" button and "Forgot password". That is where I stopped: unlocking the wallet needs the wallet holder to enter their password, and the issue tells me to stop when a step needs another person. I did not continue past that point. I never opened the map or the list of agents, I did not choose an agent, and no testnet transaction was started.
- Where did you get stuck, even for a moment?
  > I got stuck twice. First, the Varial row in the "Connect Wallet" modal showed the word "Install" while the extension was not detected, so I could not tell whether the row was usable. Later, after the extension was detected and the "Install" label disappeared, selecting Varial opened the "Unlock" page instead of connecting, which is the point where I stopped.

## 4. Questions for your issue

*Copy the questions from your issue here and answer them.*

- **Is it clear what an agent is and why they charge a fee?**
  > Not from what I could see. The first screen and the "Connect Wallet" modal do not contain the word "agent" or any mention of a fee, so I had nothing to base an answer on before signing in. I could not check the map or the offer cards, so I cannot say whether the fee is explained there.
- **With what you see, would you pick an agent? What would you need to trust one?**
  > I cannot pick one: no agent offer was visible in the flow I completed. Before I could pick one, I would want to see who the person is, whether other people have completed trades with them, what the total cost is as a percentage, and what happens if the cash handover does not happen. I did not see any of that on the screens I reached, but I also cannot claim the app never shows it, because I never reached the offers.
- **What information about an agent is missing?**
  > On the screens I reached, all information about agents is missing, including any profile, reputation or fee breakdown. The issue says there are no cash agents online yet, so I expected the list might be empty, but I could not confirm that in the app because sign-in stopped at the Varial "Unlock" page.

## 5. Your country

- Your country / general region (no city or address needed).
  > Nigeria.
- Do you see potential for MicoPay in your country? Why or why not?
  > Yes, I see potential. In my own view, a way to turn crypto into cash through a local person could be useful where bank and card rails do not always connect cleanly with crypto. My confidence is limited because I could not inspect the offers or the fee screen in this test.
- Who would use it there? (freelancers paid in crypto, people receiving remittances, shops, people without a bank account…)
  > I think freelancers paid in crypto and people receiving remittances would be the first groups I would expect to try it, because both end up needing cash rather than a token. I also think small shops could use the cash side if the fee and the trust information are easy to understand. This is my own assessment, not a survey.
- What exists today to swap crypto for cash where you live, and what is wrong with it? A fee percentage is fine; no amounts of money.
  > From my own experience, people use P2P marketplaces and person-to-person arrangements made through messaging. The problems I run into are having to judge the other person myself, a final cost that is not always clear before agreeing, and having to coordinate the handover manually.
- What would MicoPay need to change to work there?
  > Based on this test, it would need to explain the agent and the fee before asking me to connect a wallet, and it would need to work with wallets people here actually use: the "Connect Wallet" modal offered only Varial. I would also need the trust information on the offer itself to be visible before committing.

## 6. Value

- **How useful does it look to you?** 1 (not at all) – 5 (very). Why?
  > 3. The idea of a local cash handover is useful to me, but the product is not explained on the first screen and I could not get far enough to judge the offers or the fee.
- What is the most valuable part?
  > The clearest part for me was the sentence on the first screen: "Your key stays in your wallet. MicoPay will ask you to sign and will never see it." It answers a security question before I connect anything.
- What is missing?
  > A plain explanation of what an agent does and how the fee is built, before the "Connect wallet" button. I also could not preview the map or offers without connecting a wallet.
- What would stop you from using it?
  > Having to unlock Varial before I can see any agent or fee information, and not being able to tell from the first screen what service I am signing into.

## 7. What confused you

- Which screen, button, step or term confused you, and what did you expect instead?
  > The "Connect Wallet" modal: while Varial was not detected, its row showed "Install" even though the row still looked clickable, so I expected either a clear disabled state or a sentence telling me what to do next. The first screen also confused me: under "MicoPay" I expected one sentence saying what the service does, not only "Connect your wallet" and wallet-safety notices. The Varial page saying "Freighter is now Varial" above "Unlock" was unexpected, but it is inside the wallet, not MicoPay.

## 8. Ideas

Up to 3. For each one: the problem it solves, then the idea.

1. **Problem:** The first screen explains wallet safety but not the product. · **Idea:** Add one sentence under "Connect your wallet" saying that MicoPay matches you with a local person who gives or takes cash, and that this person sets a fee.
2. **Problem:** I could not see any fee or agent information before signing in. · **Idea:** Let visitors preview a sample offer card with a clearly labelled total fee percentage before the "Connect wallet" step.
3. **Problem:** The "Install" label in the "Connect Wallet" modal did not tell me what to do. · **Idea:** Add a short hint next to it, such as "Enable the Varial extension, then reload this page", so the row is not ambiguous.
