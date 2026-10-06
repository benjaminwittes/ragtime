/**
 * RAGtime privacy policy — canonical text, kept in-repo so it's version-
 * controlled and rendered by the in-app /privacy page (PrivacyPolicy.tsx).
 *
 * Source of truth: signed off by counsel (Scott Anderson) + Ben, 2026-06-08.
 * Updated 2026-10-04 for Google sign-in, organisation accounts, connected AI
 * assistants, and the planned saved-items and usage-history features (each
 * described as not yet on, with consent to be asked again at launch). Every
 * section now ends with an "In plain terms" reading of itself. Counsel's
 * 2026-06-08 wording is kept wherever the facts did not change.
 * When the policy changes, edit this file and bump LAST_UPDATED; the deploy
 * publishes it. Keep this in sync with the canonical .docx if one is maintained.
 *
 * Data-request contact is the lawfarewebevents@lawfaremedia.org inbox (not an
 * individual), per Ben 2026-06-08.
 */

export const LAST_UPDATED = 'October 4, 2026'

export const PRIVACY_POLICY_MD = `
## How to read this page

RAGtime exists to help people read the law. This page is written in the same spirit. Every section says what we do in the words a policy has to use, and then says it again in plain terms. The plain-terms reading is not a different promise; it is the same one, said simply. If the two ever seem to disagree, tell us at lawfarewebevents@lawfaremedia.org and we will fix the wording.

If you are reading this because you want to know the most private way to use RAGtime: **use it without an account.** Local search and bring-your-own-key mode need no email address, and we keep no record of who you are.

## 1. About RAGtime and this policy

RAGtime is a public research tool for searching and analyzing collections of public-interest records (e.g., federal court litigation documents, Department of Justice Office of Legal Counsel opinions, State Department historical records, with more to be added over time). This policy explains what personal information we handle, how, and what we do not do with it.

Your data footprint depends on how you use RAGtime. There are three modes, and they differ significantly:

| Mode | Account / email required? | Who runs the AI | What we collect |
| --- | --- | --- | --- |
| Local search only | No | No AI used | Minimal — request/technical data only |
| Bring your own API key | No | Your AI provider (Anthropic, OpenAI, or Google), via our proxy | Minimal — request/technical data; your key is passed through, not stored |
| Sign in with Lawfare (paid) | Yes — an email link or a Google account | Anthropic, billed by Lawfare | Email, account, and billing/usage records; name and profile picture if you sign in with Google |

> **In plain terms.** You choose how much we know about you. Search without signing in and we know nothing about who you are. Bring your own AI key and the same is true. Sign in, and we know your email address, what you have paid, and how much AI you have used — but still not what you searched for.

## 2. Information we collect

**a. Account information (paid mode only).** When you sign in with Lawfare, you use either a passwordless "magic link" sent to your email address or your Google account. We store your email and a user ID to maintain your account and session. If you sign in with Google, Google also gives us the name and profile picture on that account and an identifier for it, which are stored with your account. We do not receive anything else from your Google account — no mail, contacts, files, or calendar — and we do not set or store a password. A person who already has an account under the same email address gets the same account whichever way they sign in.

**b. Billing and usage records (paid mode only).** For prepaid credit we store, in addition to the associated email and user ID: a Stripe customer identifier, your current balance, a per-query spending cap, and a ledger of transactions. Each ledger entry records the amount, type (purchase / query charge / refund / adjustment), timestamp, and technical metadata about the query that generated a charge — specifically the AI model used and the number of input/output tokens, plus Stripe transaction identifiers. The ledger does not contain the text of your queries or their results.

**c. Payment information.** Card payments are processed by Stripe. We never receive or store your full card number. Stripe collects and holds your payment details directly under Stripe's own privacy policy.

**d. Technical and usage data (all modes).** Like any web service, our infrastructure processes your IP address and standard request data to deliver the service. We use IP addresses transiently for rate-limiting and abuse prevention — counters are stored briefly (on the order of seconds to two minutes) and expire automatically. Our front-end is served via GitHub Pages and our API runs on Cloudflare, both of which process request metadata to operate.

**e. Your research queries and AI features.** When you use an AI feature (asking a question, having the tool generate a search, or summarizing/analyzing records), your query and the relevant records are sent to an AI provider to generate a response:

- In paid mode, the provider is Anthropic, under Lawfare's commercial account.
- In bring-your-own-key mode, the provider is the one you chose (Anthropic, OpenAI, or Google), under your account and that provider's terms.

We do not store the text of your queries, the generated searches, or the AI responses in our databases, and our code does not log them. They are processed in transit only — sent to the AI provider to generate your result, and not retained on our side. The one exception is internal: Lawfare staff testing the tool under a shared internal password have their queries recorded for tuning. That path is not reachable from a public account, a paid account, or your own key.

**f. Organisation accounts.** Some accounts belong to an organisation on RAGtime — today, only Lawfare's own staff. For such an account we store a membership record (which organisation, since when, and whether it has been revoked), and the organisation pays for the account's AI use from its own allowance rather than from a personal balance. We count the organisation's AI calls per day to apply that allowance; the count is not a record of what was asked. An organisation can require its members to sign in with Google (Lawfare does, for lawfaremedia.org addresses), because a Google Workspace account can be closed centrally when someone leaves.

**g. Connecting an AI assistant.** You may connect RAGtime to an AI assistant you already use (such as Claude), so that the assistant can search and ask RAGtime on your behalf. When you do, we show you a page that names the assistant and asks you to approve it. If you approve, we issue that assistant a credential that acts as you until you revoke it, and we record which assistant you approved and when. Your questions then reach us through the assistant, and what the assistant keeps of your conversation is governed by its own privacy terms, not this policy. We do not tell the assistant anything about you beyond what the feature needs.

> **In plain terms.** Signed in, we hold: your email; your name and picture if you came in through Google; what you paid and how much AI you used (not what you asked); and, for Lawfare staff, the fact that Lawfare pays. Your questions and the answers pass through us to the AI company and are not written down on our side — except for Lawfare's own staff testing the tool internally. If you connect an assistant like Claude, it sees your questions because you asked it to; what it remembers is its business, and you can cut it off.

## 3. What we do not do

- We do not sell your personal information.
- We do not use your data for advertising.
- We do not publish, or attach your identity to, your research queries.
- We do not store your payment card numbers.
- We do not require an account to use local search or your own API key.
- We do not read your Google mail, contacts, files, or calendar, and we do not ask Google for permission to.
- We do not turn on a feature that keeps records about you without first telling you here and asking you (Section 6).

> **In plain terms.** No ads, no selling, no card numbers, no snooping in your Google account, and no quiet changes.

## 4. Third parties who process data for us (subprocessors)

| Provider | Role | Data involved |
| --- | --- | --- |
| Supabase | Database + authentication | Email, account, billing/usage ledger, organisation membership (paid mode) |
| Google | Sign-in, if you choose it | Email, name, profile picture |
| Resend | Delivery of sign-in emails | Your email address and the sign-in link |
| Cloudflare | API hosting, rate-limiting, logs | Request data; IP (transient) |
| Stripe | Payment processing | Payment/billing details (paid mode) |
| Anthropic | AI provider (paid mode) | Query + records sent for AI features |
| OpenAI / Google | AI provider (only if you choose bring-your-own-key) | Query + records sent for AI features |
| GitHub (Pages) | Front-end hosting | Request metadata; IP |

This overview is current as of this policy and based on publicly available information provided by these third-party companies. These companies may change their internal policies at any time. Lawfare is responsible neither for the accuracy of their public representations nor for their compliance with their own policies.

> **In plain terms.** We do not run everything ourselves. These are the companies whose computers our service runs on or passes through, and what each one sees. The AI company sees your question, because it has to answer it. Nobody else on this list sees your question.

## 5. How we use information

We use the information above only to: operate and secure RAGtime; authenticate paid users; process payments and maintain accurate prepaid balances; apply an organisation's allowance to its members; prevent abuse and enforce rate limits; and respond to support requests.

> **In plain terms.** We use what we hold to run the service and to bill correctly. That is the whole list.

## 6. What is planned, and not yet on

RAGtime is still being built. Two features we intend to add would change what we keep, so we describe them now, before they exist. **Neither is active today.** Before either becomes active, we will update this policy to describe exactly what is collected and how, give notice, and ask for your explicit permission inside the feature itself before it keeps anything about you.

**Saved items.** We intend to let a signed-in person save records and citations into lists, keep them private, or share them with their organisation. Saved items would be stored in our database with your account, visible to you and to anyone you share them with, and deleted when your account is deleted. The lists are yours; we would store them only to show them back to you.

**Usage history and dataset improvements.** We intend to let a signed-in person keep a history of their own questions and answers, and separately to study patterns across many users' queries — in the aggregate, not tied to your identity — to improve the underlying collections (for example, by deriving topic classifications or summaries). Today the commitment in Section 2(e) describes how the service operates: your queries are not kept. Any history would be kept only for people who turn it on, and any material derived from queries and incorporated into the datasets will be de-identified.

> **In plain terms.** Two things are coming that would mean we keep more: your saved lists, and (if you want it) a history of what you asked. Neither exists yet. When each one arrives, it will be off until you say yes to it, and this page will say what it keeps.

## 7. Cookies and local storage

RAGtime uses browser local storage to keep you signed in (paid mode) and to remember interface preferences. We do not use third-party advertising or tracking cookies.

> **In plain terms.** Your browser remembers that you are signed in and how you like the page set up. Nothing follows you around the web.

## 8. Data retention

- **Rate-limiting counters:** transient (seconds to ~2 minutes), then auto-deleted.
- **Account, balance, and transaction ledger (paid mode):** retained while your account is active and as needed for financial record-keeping.
- **Name and profile picture from Google, organisation membership, and approved assistants:** retained while your account is active; deleted with it.
- **Query/response content:** not retained by us (see §2e).
- **Operational logs (Cloudflare/GitHub):** per those providers' retention.

> **In plain terms.** Account details stay as long as you have an account, and payment records as long as accounting requires. Your questions are not kept at all.

## 9. Requests for your data from governments, courts, and others

Because we keep so little, there is little we could be made to produce. For a signed-in person, what exists is listed in Section 2: an email address, a Google name and picture if used, payment and usage amounts, organisation membership, and any assistant you approved. For a person who is not signed in, nothing identifies you to us beyond the transient technical data in Section 2(d). We do not hold the text of anyone's queries. We will disclose personal information only when required by valid legal process, and, where the law allows, we will tell you before we do.

> **In plain terms.** If someone came to us with a court order asking what you searched for, the honest answer is that we do not have it. What we could be made to hand over is the short list above, and we would tell you if we were allowed to.

## 10. Your choices and rights

You can use RAGtime without an account (local search or your own key). Paid users can request access to or deletion of their account and associated data by contacting lawfarewebevents@lawfaremedia.org. If you signed in with Google, you can also withdraw RAGtime's access from your Google account's security settings; what we already stored stays until you ask us to delete it. An assistant you approved can be disconnected from that assistant's own settings. Lawfare is committed to respecting your data privacy rights, including those provided by the General Data Protection Regulation and applicable California state laws, as applicable.

> **In plain terms.** You can stay anonymous, and if you did sign in you can ask us to delete everything. One email does it.

### Rights Under the General Data Protection Regulation (EU) 2016/679

If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, you have the following rights regarding your personal data:

**Right of Access (Article 15):** You have the right to obtain confirmation of whether we process your personal data and, if so, to receive a copy of that data along with information about how it is processed, including the purposes, categories of data, recipients, and retention periods.

**Right to Rectification (Article 16):** You have the right to request correction of inaccurate personal data and completion of incomplete personal data without undue delay.

**Right to Erasure / "Right to Be Forgotten" (Article 17):** You may request that we delete your personal data where: (i) it is no longer necessary for the purposes for which it was collected; (ii) you withdraw consent and no other legal basis applies; (iii) you object to processing and no overriding legitimate grounds exist; (iv) the data has been unlawfully processed; or (v) erasure is required for legal compliance. This right is subject to exceptions, including where processing is necessary for legal claims or compliance with a legal obligation.

**Right to Restriction of Processing (Article 18):** You have the right to request that we restrict the processing of your personal data in circumstances where: (i) you contest the accuracy of the data; (ii) processing is unlawful but you oppose erasure; (iii) we no longer need the data but you require it for legal claims; or (iv) you have objected to processing pending verification of legitimate grounds.

**Right to Data Portability (Article 20):** Where processing is based on consent or contract and carried out by automated means, you have the right to receive your personal data in a structured, commonly used, and machine-readable format, and to transmit that data to another controller where technically feasible.

**Right to Object (Article 21):** You have the right to object at any time to processing of your personal data based on legitimate interests or for direct marketing purposes. Where you object to direct marketing, we will cease processing for that purpose immediately. For other objections, we will cease processing unless we demonstrate compelling legitimate grounds that override your interests or the processing is necessary for legal claims.

**Rights Related to Automated Decision-Making and Profiling (Article 22):** You have the right not to be subject to a decision based solely on automated processing, including profiling, that produces legal or similarly significant effects, except where: (i) necessary for a contract; (ii) authorized by applicable law; or (iii) based on your explicit consent.

**How to Exercise Your Rights:** To submit a request, contact lawfarewebevents@lawfaremedia.org. We will not charge a fee for reasonable requests; manifestly unfounded or excessive requests may be subject to a reasonable charge or refusal.

**Right to Lodge a Complaint:** You have the right to lodge a complaint with your local supervisory authority. A list of EEA supervisory authorities is available at https://edpb.europa.eu.

> **In plain terms.** European law gives you the right to see, correct, delete, carry away, or object to what we hold about you, and to complain to a regulator. The list above is that law, article by article. In practice, every one of those rights is exercised with the same email to us.

### Rights Under the California Consumer Privacy Act (Cal. Civ. Code §1798.100 et seq.) and the California Privacy Rights Act

If you are a California resident, you have the following rights:

**Right to Know (§1798.100 / §1798.110 / §1798.115):** You have the right to request that we disclose: (i) the categories and specific pieces of personal information we have collected about you; (ii) the categories of sources from which it was collected; (iii) the business or commercial purposes for collection, selling, or sharing; and (iv) the categories of third parties to whom we disclose personal information.

**Right to Delete (§1798.105):** You have the right to request deletion of personal information we have collected from you, subject to certain exceptions. We may deny deletion requests where retention is necessary to: complete a transaction; detect security incidents; debug errors; exercise free speech; comply with legal obligations; engage in research in the public interest; or enable solely internal uses reasonably aligned with your expectations.

**Right to Correct (§1798.106):** You have the right to request correction of inaccurate personal information we maintain about you, taking into account the nature of the information and the purposes of processing.

**Right to Opt-Out of Sale or Sharing (§1798.120 / §1798.121):** You have the right to direct us not to sell or share your personal information with third parties. Lawfare will not do so.

**Right to Limit Use of Sensitive Personal Information (§1798.121):** You have the right to direct us to limit our use and disclosure of sensitive personal information — including government IDs, financial account credentials, precise geolocation, health data, and biometric data — to purposes necessary to perform the services you requested.

**Right to Non-Discrimination (§1798.125):** We will not discriminate against you for exercising any of your CCPA/CPRA rights. We will not deny goods or services, charge different prices, provide a different quality of service, or suggest you will receive different treatment for exercising your privacy rights.

**Authorized Agent:** You may designate an authorized agent to submit requests on your behalf by providing written permission or a power of attorney. We may require verification of your identity directly before processing requests submitted by an agent.

**How to Submit a Request:** Submit a verifiable consumer request to lawfarewebevents@lawfaremedia.org.

> **In plain terms.** California law gives Californians much the same rights, under different section numbers: know what we hold, have it deleted or corrected, refuse to be sold (we never sell), and not be treated worse for asking.

## 11. Security

We protect your data with the following measures: all traffic is encrypted in transit (HTTPS/TLS). Sensitive credentials — including our AI-provider keys, payment keys, and database service credentials — exist only as server-side configuration on our API and are never exposed to your browser. All billing and access controls are enforced on the server, not in the front-end. Sign-in is passwordless — a one-time "magic link" or your Google account — so we do not store passwords, and there is no RAGtime password to be stolen. Card payments are handled by Stripe, and we never receive your full card number. No system is perfectly secure, but the security and protection of user data are our highest priority.

> **In plain terms.** Everything travels encrypted, the keys stay on our servers, there is no password of yours for anyone to steal from us, and we never see your card. We will not promise perfection, because nobody honestly can.

## 12. Children

RAGtime is intended for adult researchers and is not directed to children under the age of 18. We do not knowingly collect personal information from children without verifiable parental or guardian consent. By using this application, you represent that you are at least 18 years of age, or are using this application with the involvement and consent of a parent or legal guardian who has reviewed and agreed to these terms on your behalf.

> **In plain terms.** This is a tool for adults. If you are under 18, use it with a parent or guardian who has read this.

## 13. A note on the records in RAGtime

The collections RAGtime makes searchable are public records (e.g., court filings, government opinions). These may themselves contain personal information about third parties, as published in the public record. That content is part of the source material, not information we collect about you as a user.

> **In plain terms.** The documents you search are public records, and public records name people. That is the record, not something we gathered about you.

## 14. Changes and contact

We will post changes here and update the "last updated" date. Questions: lawfarewebevents@lawfaremedia.org.

> **In plain terms.** When this page changes, the date at the top changes with it. Questions go to the address above.
`
