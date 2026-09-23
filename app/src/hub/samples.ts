import type { CorpusSlug } from '@lawfare/ragtime-client'

/**
 * What the hub shows a reader who has typed nothing.
 *
 * The page used to answer that question twice and badly: a fixed title naming
 * nothing in particular, and a row of example links under the box that a reader
 * either pressed or read past. This is the answer instead — the title asks one
 * corpus at a time, and the box types out something you could ask *that* corpus.
 * The examples are not a row of controls any more; they are the page's resting
 * state, and the only control is Tab.
 *
 * Two phrasings of one topic per sample, because the box has two modes and they
 * want different sentences. `query` is what a reader types into a keyword search
 * — a phrase, a name, a citation — and `question` is the same topic asked in the
 * reader's own words, which is what the Explorer takes. Showing an Explorer
 * question under a keyword box would teach the box wrong, and vice versa.
 *
 * **Every `query` here returned hits in its own corpus through the hub fan**
 * (`/corpus/hub/keyword`), checked against the live worker when it was written
 * and re-checked every time the register moved, most recently on 2026-09-18 —
 * each replacement scoped to its own corpus (`corpora: [slug]`), which is a
 * tenth of the work of a fan and the reason a whole pass fits inside the
 * worker's ten-requests-a-minute limit.
 * A sample that finds nothing is worse than no sample at all: it is the surface
 * demonstrating its own failure with copy the page chose itself. Sanctions is
 * the one corpus the fan leaves out (`HUB_KEYWORD_SPOKES`), so its three were
 * checked against its own entity and guidance filters instead.
 *
 * **A count is not evidence.** These indexes match loosely, and a query can
 * return hundreds of documents with nothing to do with it — see the litigation
 * and presidential set comments for the two that were caught doing exactly that
 * after a first pass had "verified" them on counts alone. Every `query` here is
 * checked by reading the titles that come back.
 *
 * **Every `question` is answerable from what its spoke says it holds.** The
 * coverage lines in `spokes/<slug>/index.ts` are the authority: litigation
 * starts at the beginning of 2025, the CFR is the current state and not a
 * history, Congress reaches 1789 only for public laws, the Federal Register's
 * notices are still loading in waves, the Vault's scans carry no dates at all.
 * A sample that asks past the edge of a corpus is a promise the corpus cannot
 * keep.
 *
 * **The register is topical, and institutional about it** (2026-09-18). The
 * first pass demonstrated the corpora on whatever was loudest and read as a
 * brief; the second overcorrected into the archive, and a page that opens on
 * drinking water and federal advisory committees is not sober, it is a records
 * portal. Lawfare is a sharp, topical, news-aware institution, and the resting
 * state of this page is the subtlest branding the app has. So the axis is not
 * how recent the subject is — it is what the sample asks of it. Ask what an
 * authority requires, what a court ordered, which order it runs under, what the
 * record shows: those questions stay right however live the subject, and they
 * are what a working journalist types. A sample that delivers a verdict on a
 * person or a party is the wrong sample however dry its vocabulary. The old
 * test survives in that narrower form — if it would look *pointed* next to
 * Lawfare's masthead it is wrong, but if it merely looks *current*, that is the
 * brand.
 *
 * **Two audiences, and they are not equal.** First, journalists working a story
 * that is live today — they are why each set leads on questions the federal
 * record can actually settle. Second, and genuinely second, readers who came
 * because the Vault has a file on D.B. Cooper. A famous or frankly salacious
 * holding earns the third slot as the hook, never the lead, and only where the
 * corpus actually has one — the Code and the CFR have no scandals and get none.
 * It is checked like every other sample.
 *
 * The order is the registry's order — the whole first, then The law, As read,
 * The record, Commentary — because the rotation walks the same path the page
 * below it is laid out in.
 */

/** One topic, said the two ways the two modes need it said. */
export type Sample = {
  /** Keyword mode: the words a reader would actually type. */
  query: string
  /** Explorer mode: the question in the reader's own words. */
  question: string
}

export type SampleSet = {
  /** The corpus these samples belong to, or `'all'` for the whole federal record. */
  slug: CorpusSlug | 'all'
  /**
   * The hub's h1 while this corpus is up — a whole sentence, not a name dropped
   * into a slot. One template with the corpus swapped in read as a form letter
   * by the third rotation, and it made the page ask the U.S. Code and the FBI's
   * Vault for the same thing, which is precisely what they are not for. So each
   * corpus gets its own sentence, and the sentence says what that corpus can
   * actually be asked: the courts were filed in, the lists have people on them,
   * the commentary made something of it.
   *
   * **One sentence per mode** (2026-09-17, Thomas's ruling). The h1 used to open
   * "Ask" in both modes, which meant the largest type on the page told a reader
   * to ask a question while the box under it wanted keywords — the page's own
   * biggest voice arguing against its own field. The verb now carries the
   * difference: `explorer` asks, `search` searches, and the object says what the
   * box takes in that corpus (a section, a part, a docket, a name). This is the
   * *big* half of the signal; the small half is the caption under each tab,
   * which carries the axis a sentence cannot — free versus spends.
   *
   * Four rules hold for all of them. Each begins with its mode's verb, because
   * the page is one gesture repeated and the first word is where the eye is when
   * the rest changes. Each is honest to the spoke's declared coverage — "since
   * 2025" on the courts is the litigation floor, and the regulations are asked
   * what they *require* rather than what they used to. Each names something the
   * corpus genuinely has: `search` promises a *section* to the Code and a *part*
   * to the CFR because those are its units, and promises no date anywhere the
   * corpus has no dates. And each fits one line at 1100px in the title's face;
   * at 390 they wrap to two and none of them to three, which was measured rather
   * than hoped — the `explorer` twelve when they were written, and both
   * twenty-four again when `search` was added.
   *
   * `explorer` on `'all'` is exactly the Explorer's empty-state heading, word
   * for word. Those two are the halves of one `surface-intro` morph, and a
   * paraphrase would turn a sentence travelling between two surfaces into two
   * sentences dissolving into each other. The `search` sentence is under no such
   * constraint: the box in that mode does not cross to the Explorer.
   */
  titles: { search: string; explorer: string }
  samples: readonly [Sample, Sample, Sample]
}

export const SAMPLES: readonly SampleSet[] = [
  {
    // The whole, which is where the cycle opens and closes. The three questions
    // are the Explorer's own examples (`explorer/model/examples.ts`), word for
    // word: the reader who crosses into the Explorer with one of them should
    // find the surface there saying the same thing, not a paraphrase of it.
    slug: 'all',
    titles: {
      search: 'Search the federal record for a phrase.',
      explorer: 'Ask the federal record a question.',
    },
    samples: [
      {
        query: 'Freedom of Information Act',
        question:
          'What has the Office of Legal Counsel said about the Freedom of Information Act’s exemptions? List the opinions.',
      },
      {
        query: 'artificial intelligence',
        question:
          'How many rules and proposed rules about artificial intelligence has the Federal Register published since 1994?',
      },
      {
        query: 'Administrative Procedure Act',
        question:
          'How have federal courts handled challenges to agency rulemaking since January 2025? A short narrative with citations.',
      },
    ],
  },

  /* ---- The law --------------------------------------------------------- */
  {
    slug: 'usc',
    titles: {
      search: 'Search the U.S. Code for a section or a term.',
      explorer: 'Ask the U.S. Code what the law says.',
    },
    samples: [
      {
        // A citation rather than a phrase, because the box takes both and a
        // reader who arrives with one in hand should see that it works.
        query: '8 U.S.C. 1225',
        question: 'What does the law require before someone is removed without a hearing?',
      },
      {
        query: 'insurrection',
        question: 'Which statutes let the President use the armed forces against an insurrection?',
      },
      {
        query: 'inspector general',
        question: 'What must the President tell Congress before removing an inspector general?',
      },
    ],
  },
  {
    // Current state only — the CFR spoke tracks one edition and says so, so
    // nothing here may ask how a rule changed.
    slug: 'cfr',
    titles: {
      search: 'Search the regulations for a part or a term.',
      explorer: 'Ask the regulations what the agencies require.',
    },
    samples: [
      {
        query: 'reduction in force',
        question: 'What do the regulations in force require before an agency cuts federal jobs?',
      },
      {
        query: 'asylum',
        question: 'What do the current rules require of someone applying for asylum?',
      },
      {
        query: 'security clearance',
        question: 'What do the regulations require before an agency grants a security clearance?',
      },
    ],
  },
  {
    // Five collections with five coverage floors. Public laws are the only one
    // that reaches 1789; hearings begin in 1933.
    slug: 'congress',
    titles: {
      search: 'Search Congress for a law, a bill, a hearing.',
      explorer: 'Ask Congress what it passed, and what it heard.',
    },
    samples: [
      {
        query: 'War Powers Resolution',
        question: 'Which public law is the War Powers Resolution, and what does it require?',
      },
      {
        query: 'Foreign Intelligence Surveillance Act',
        question:
          'Which public laws have amended the Foreign Intelligence Surveillance Act?',
      },
      {
        query: 'impoundment',
        question: 'What have witnesses told congressional hearings about impounded funds?',
      },
    ],
  },
  {
    // Rules and proposed rules are complete from 1994; notices are still
    // arriving in waves, so these three ask about rules.
    slug: 'fr',
    titles: {
      search: 'Search the Federal Register for a rule.',
      explorer: 'Ask the Federal Register which rules changed.',
    },
    samples: [
      {
        query: 'cyber incident reporting',
        question: 'Which rules require a company to report a cyber incident to the government?',
      },
      {
        query: 'semiconductor export controls',
        question: 'What rules control the export of semiconductor manufacturing equipment?',
      },
      {
        query: 'immigration detention',
        question: 'What rules have agencies written about immigration detention since 1994?',
      },
    ],
  },
  {
    // "Ordered" covers what this corpus is: executive orders back to 1940, and
    // the proclamations, memoranda and determinations from 1994 — instruments
    // the President signs, rather than the office as an institution. The three
    // samples stay on the orders: two on the authority a sitting President is
    // signing under this year, and one on declassification. That third slot used
    // to ask about the classification system, and "classified" and
    // "classification" are both words this index answers wrongly — it matches
    // loosely, and "classification" lands on *tariff* classification, so its 219
    // hits open on "Adjusting Imports of Polysilicon". "declassification" (33)
    // returns the order on the Kennedy and King records and the September 11
    // declassification reviews, which is what the question asks for. A query
    // here is checked by reading the order titles it returns, not by its count.
    slug: 'presidential',
    titles: {
      search: 'Search the presidency’s orders for a name.',
      explorer: 'Ask the presidency what it ordered.',
    },
    samples: [
      {
        query: 'International Emergency Economic Powers Act',
        question: 'Which executive orders invoke the International Emergency Economic Powers Act?',
      },
      {
        query: 'national emergency',
        question: 'Which national emergencies has the President declared, and under what authority?',
      },
      {
        query: 'declassification',
        question: 'Which executive orders have directed agencies to declassify records?',
      },
    ],
  },

  /* ---- As read --------------------------------------------------------- */
  {
    slug: 'olc',
    titles: {
      search: 'Search the OLC’s opinions for a phrase.',
      explorer: 'Ask the OLC what the executive may do.',
    },
    samples: [
      {
        query: 'war powers',
        question: 'How has OLC read the President’s power to use military force without Congress?',
      },
      {
        query: 'executive privilege',
        question: 'How has OLC described executive privilege over White House communications?',
      },
      {
        query: 'recess appointments',
        question: 'What has OLC concluded about the President’s power to make recess appointments?',
      },
    ],
  },
  {
    // The floor is 2025-01-20, and the keyword index runs over docket-entry
    // descriptions — short strings, matched loosely. **A multi-word subject
    // phrase returns near-random cases here, and the count will not tell you**:
    // "Alien Enemies Act" retrieves 493 dockets and not one of them is an Alien
    // Enemies Act case, and "tariffs" retrieves 568 by matching "tariff" in its
    // shipping and utility rate-schedule sense. Single distinctive words work —
    // "deportation", "habeas" and "FOIA" each return the cases a reader would
    // expect — so the query half is one word, and the question half carries the
    // subject, which is free because the Explorer routes semantically and never
    // touches this index. Check a candidate by reading the case names that come
    // back, never by its count.
    slug: 'litigation',
    titles: {
      search: 'Search the dockets for a case or a party.',
      explorer: 'Ask the federal courts what was filed since 2025.',
    },
    samples: [
      {
        query: 'deportation',
        question: 'What has been filed in the deportation cases since January 2025?',
      },
      {
        query: 'habeas',
        question: 'What have habeas petitions asked the courts to do since January 2025?',
      },
      {
        query: 'FOIA',
        question: 'Who has sued a federal agency for its records since January 2025?',
      },
    ],
  },

  /* ---- The record ------------------------------------------------------ */
  {
    // Published volumes run to the end of the Cold War, so every question here
    // is a historical one. "The cables" is what the record mostly is — telegrams,
    // memoranda of conversation, the paper a decision left behind — and it gives
    // the sentence a subject; "how it was decided" had no "it" to point to.
    // The third is this corpus's hook: the 1953 coup in Iran is the most famous
    // thing the published record holds, and it is in here as cables rather than
    // as a leak.
    slug: 'frus',
    titles: {
      search: 'Search the cables for a place or a name.',
      explorer: 'Ask the diplomatic record what the cables said.',
    },
    samples: [
      {
        query: 'Berlin',
        question: 'What does the diplomatic record show about the decisions behind the Berlin airlift?',
      },
      {
        query: 'Marshall Plan',
        question: 'How did the State Department record the making of the Marshall Plan?',
      },
      {
        query: 'Mossadegh',
        question: 'What do the declassified cables say about the 1953 coup in Iran?',
      },
    ],
  },
  {
    // The Vault's scans carry no document dates, so nothing here asks "when".
    // Two leads on what the Bureau has published about the fights of the last
    // ten years, and then the hook — the Vault's D.B. Cooper file is why a good
    // share of its visitors ever arrive, and it earns the third slot for that
    // and not the first. The name is typed here the way a reader types it: the
    // collections typeahead stores "D-B-Cooper " with the periods stripped and a
    // trailing space, and matches nothing on "D.B. Cooper", but keyword search
    // takes it plainly.
    slug: 'fbi',
    titles: {
      search: 'Search the FBI’s Vault for a name or a file.',
      explorer: 'Ask the FBI’s Vault what it released.',
    },
    samples: [
      {
        query: 'Capitol violence',
        question: 'What is in the Vault’s file on the January 6 Capitol violence?',
      },
      {
        query: 'Mueller',
        question: 'What did the Bureau release from the Special Counsel Mueller investigation?',
      },
      {
        query: 'D.B. Cooper',
        question: 'What does the Vault hold on the D.B. Cooper hijacking?',
      },
    ],
  },
  {
    // The one corpus the hub fan leaves out, so these three were checked
    // against `/corpus/sanctions/entity-filter` (the first two) and
    // `/corpus/sanctions/filter` (the third) rather than against the fan. A
    // reader who runs one in Search mode is searching the other ten; the
    // Sanctions workspace is where these land.
    //
    // Naming an entity is back in bounds (2026-09-18). Asking which Gazprom
    // companies are listed is a question about the list; it is not an
    // announcement about Gazprom, and asking the list by trade instead — the
    // older dodge — cost the samples their subject and bought nothing. What
    // stays out is *when* a party was designated: `publish_date` is a
    // copy-freshness stamp for the list data, not a designation date, and a
    // question shaped that way teaches the box a fact the corpus cannot supply.
    slug: 'sanctions',
    titles: {
      search: 'Search the sanctions lists for a name.',
      explorer: 'Ask the sanctions lists who is on them.',
    },
    samples: [
      {
        query: 'Gazprom',
        question: 'Which Gazprom companies are on the sanctions lists?',
      },
      {
        query: 'Islamic Revolutionary Guard Corps',
        question: 'Who is listed in connection with the Islamic Revolutionary Guard Corps?',
      },
      {
        query: 'general license',
        question: 'What does OFAC’s guidance say about general licenses?',
      },
    ],
  },

  /* ---- Commentary ------------------------------------------------------ */
  {
    // Two publications and no others — Lawfare federated with Executive
    // Functions. The questions name the publication rather than an author now:
    // naming one is a promise that the corpus holds them, and it is the kind of
    // promise that rots quietly when the federation changes.
    slug: 'commentary',
    titles: {
      search: 'Search the commentary for a phrase or a name.',
      explorer: 'Ask the commentary what Lawfare made of it.',
    },
    samples: [
      {
        query: 'Insurrection Act',
        question: 'What has Lawfare published about the Insurrection Act?',
      },
      {
        query: 'Section 702',
        question: 'What has been written about reauthorizing Section 702?',
      },
      {
        query: 'export controls',
        question: 'What has been written about export controls and national security?',
      },
    ],
  },
]

/** One tick of the rotation: which set is in the title, and which of its three samples is in the box. */
export type Tick = { set: SampleSet; sample: Sample }

/**
 * The cycle, flattened.
 *
 * Every set holds the title for three ticks and spends them on its own three
 * samples, so the sentence and the placeholder are never describing two
 * different corpora. Built once at module load — it is a fold over a constant,
 * and recomputing it per render would be work to produce the same array.
 */
export const TICKS: readonly Tick[] = SAMPLES.flatMap((set) =>
  set.samples.map((sample) => ({ set, sample })),
)
