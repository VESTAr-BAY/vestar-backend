Product URL : https://boisterous-sfogliatella-3e55f2.netlify.app/vote/

GitHub Repository :

https://github.com/VESTAr-BAY/vestar-backend

https://github.com/VESTAr-BAY/vestar-frontend

https://github.com/VESTAr-BAY/vestar-contracts

# Project Description

K-pop voting suffers from **two core problems**: **lack of transparency** and **severe fragmentation.** Today, fans are forced to move across many competing apps and regional restrictions, while centralized operators continue to face manipulation controversies that damage trust. Blockchain can solve the trust problem, but existing solutions often introduce new friction through gas fees and complex identity tools.

**VESTAr solves both issues at once**. Built on **Status Network**, VESTAr provides a unified, mobile-first voting platform where users can create and participate in K-pop votes with **gasless** transactions. It also uses **Karma**, a non-transferable reputation system, to provide sybil resistance without requiring heavy identity verification. As a result, voting becomes both verifiable and easy to use.

To support private live voting, VESTAr introduces a **commitment-verified key reveal system**. The public key is published onchain, while the private key remains offchain during the voting period. After voting ends, the backend **automatically reveals the private key onchain through gasless execution**, allowing anyone to decrypt and verify the final result. This design preserves temporary privacy during live voting while guaranteeing full transparency afterward.

**All core voting logic runs onchain**, while an indexer makes the data fast and user-friendly to query in the app. In the end, VESTAr creates a win-win ecosystem for voters, organizers, and advertisers by turning transparency into a scalable and sustainable business model. **Our vision is simple: to make VESTAr the standard for K-pop voting, where transparency is no longer optional, but expected.**

# Architecture

/home/sp/VESTAr/vestar-frontend/readme_img/Architecture.png

VESTAr is built around a hybrid Web3 architecture that combines on-chain trust with a user-friendly application layer.

The frontend, built with React, provides both the main voting experience and a public verification portal.

Core voting logic lives in VESTAr election contracts on Status Network, which handle vote state, tallying, commitment-verified key reveal, karma-based sybil resistance, and paid voting settlement. Metadata and images are stored on IPFS, while a NestJS + PostgreSQL backend indexes contract events, synchronizes election state, and delivers indexed metadata to the app.

For private votes, a commitment-verified key reveal engine automates the final key release flow through gasless execution, allowing temporary privacy during live voting before full result disclosure.


# **Notice**

At the time of submission, due to an issue on Status Chain, gasless execution is not being applied, so a paid gas fee warning modal appears before every transaction.

# Vote Flow

/home/sp/VESTAr/vestar-frontend/readme_img/Vote Flow 1.png

1. **Mint MockUSDT**

/home/sp/VESTAr/vestar-frontend/readme_img/Vote Flow 2.png

1. **Enjoy voting**

/home/sp/VESTAr/vestar-frontend/readme_img/Vote Flow 3.png

# Create Vote P**olicy**

## Visibility

VESTAr lets organizers choose visibility, voting policy, and payment rules based on the purpose of the vote.

/home/sp/VESTAr/vestar-frontend/readme_img/Visibility.png

### **Open / Private**

Open votes show results in real time and are suitable when transparency during voting is important.

Private votes keep ballots encrypted during the voting period. After voting ends, the Commitment-Verified Key Reveal Engine automatically reveals the committed key, so the final result can be decrypted and publicly verified. This is **useful for live programs, suspense-based voting, and temporary result privacy**.

## **Ballot Policy**

/home/sp/VESTAr/vestar-frontend/readme_img/Ballot Policy.png

### **One per Election / One per Interval / Unlimited Paid Voting**

One per election allows one vote per wallet for the entire election.

One per interval resets voting rights after a fixed time window.

Unlimited paid allows repeated voting by paying per ballot.

## Payment

/home/sp/VESTAr/vestar-frontend/readme_img/Payment.png

### **Free / Paid**

Free votes maximize fan participation while making the experience more engaging by encouraging friendly competition among different fanbases.

Paid votes bring the familiar paid voting model from traditional broadcast programs onchain. **Instead of telecom-based paid voting, VESTAr enables the same per-ballot payment structure directly onchain in a more transparent and verifiable way**.

# Try Verification

VESTAr gives even non-crypto users a way to experience onchain verification in a simple and approachable way. The interface explains difficult blockchain concepts in plain language so anyone can understand what is being verified.

/home/sp/VESTAr/vestar-frontend/readme_img/Try Verification 1.png

/home/sp/VESTAr/vestar-frontend/readme_img/Try Verification 2.png

/home/sp/VESTAr/vestar-frontend/readme_img/Try Verification 3.png

For open votes, users can immediately review onchain records and confirm how the result was formed. 

/home/sp/VESTAr/vestar-frontend/readme_img/Try Verification 4.png

For private votes, the backend’s Commitment-Verified Key Reveal Engine automatically triggers key reveal on the contract when the reveal time arrives. **This automation is possible because Status Network supports gasless execution.** As a result, users can verify both transparent live voting and privacy-preserving voting through the same user-friendly portal.

/home/sp/VESTAr/vestar-frontend/readme_img/Try Verification 5.png
/home/sp/VESTAr/vestar-frontend/readme_img/Try Verification 6.png