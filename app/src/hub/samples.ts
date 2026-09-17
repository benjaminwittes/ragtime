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
 * (`/corpus/hub/keyword`), checked against the live worker when it was written.
 * A sample that finds nothing is worse than no sample at all: it is the surface
 * demonstrating its own failure with copy the page chose itself. Sanctions is
 * the one corpus the fan leaves out (`HUB_KEYWORD_SPOKES`), so its three were
 * checked against its own entity and guidance filters instead.
 *
 * **Every `question` is answerable from what its spoke says it holds.** The
 * coverage lines in `spokes/<slug>/index.ts` are the authority: litigation
 * starts at the beginning of 2025, the CFR is the current state and not a
 * history, Congress reaches 1789 only for public laws, the Federal Register's
 * notices are still loading in waves, the Vault's scans carry no dates at all.
 * A sample that asks past the edge of a corpus is a promise the corpus cannot
 * keep.
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
   * Three rules hold for all of them. Each begins "Ask", because the page is one
   * gesture repeated and the first word is where the eye is when the rest
   * changes. Each is honest to the spoke's declared coverage — "since 2025" on
   * the courts is the litigation floor, and the regulations are asked what they
   * *require* rather than what they used to. And each fits one line at 1100px in
   * the title's face; at 390 they wrap to two and none of them to three, which
   * was measured rather than hoped.
   *
   * `'all'` is exactly the Explorer's empty-state heading, word for word. Those
   * two are the halves of one `surface-intro` morph, and a paraphrase would
   * turn a sentence travelling between two surfaces into two sentences
   * dissolving into each other.
   */
  title: string
  samples: readonly [Sample, Sample, Sample]
}

export const SAMPLES: readonly SampleSet[] = [
  {
    // The whole, which is where the cycle opens and closes. The three questions
    // are the Explorer's own examples (`explorer/model/examples.ts`), word for
    // word: the reader who crosses into the Explorer with one of them should
    // find the surface there saying the same thing, not a paraphrase of it.
    slug: 'all',
    title: 'Ask the federal record a question.',
    samples: [
      {
        query: 'Youngstown',
        question:
          'What has the Office of Legal Counsel said about presidential emergency powers over communications networks? List the opinions.',
      },
      {
        query: 'International Emergency Economic Powers Act',
        question:
          'How many executive orders since January 2025 invoke the International Emergency Economic Powers Act?',
      },
      {
        query: 'habeas corpus',
        question:
          'How have federal courts handled habeas petitions from immigration detainees since January 2025? A short narrative with citations.',
      },
    ],
  },

  /* ---- The law --------------------------------------------------------- */
  {
    slug: 'usc',
    title: 'Ask the U.S. Code what the law says.',
    samples: [
      {
        query: '50 U.S.C. 1702',
        question:
          'What powers does the International Emergency Economic Powers Act give the President?',
      },
      {
        query: 'habeas corpus',
        question:
          'Which statutes say when a federal court may grant a writ of habeas corpus?',
      },
      {
        query: 'posse comitatus',
        question:
          'What does the Code say about using the armed forces for law enforcement inside the United States?',
      },
    ],
  },
  {
    // Current state only — the CFR spoke tracks one edition and says so, so
    // nothing here may ask how a rule changed.
    slug: 'cfr',
    title: 'Ask the regulations what the agencies require.',
    samples: [
      {
        query: 'credible fear',
        question: 'What do the rules in force require in a credible-fear screening?',
      },
      {
        query: 'expedited removal',
        question: 'Which regulations govern expedited removal as they stand today?',
      },
      {
        query: 'national security information',
        question:
          'What do the current regulations say about handling classified national security information?',
      },
    ],
  },
  {
    // Five collections with five coverage floors. Public laws are the only one
    // that reaches 1789; hearings begin in 1933.
    slug: 'congress',
    title: 'Ask Congress what it passed, and what it heard.',
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
        query: 'Guantanamo',
        question: 'What have witnesses told congressional hearings about detention at Guantanamo?',
      },
    ],
  },
  {
    // Rules and proposed rules are complete from 1994; notices are still
    // arriving in waves, so these three ask about rules.
    slug: 'fr',
    title: 'Ask the Federal Register which rules changed.',
    samples: [
      {
        query: 'asylum',
        question: 'Which asylum rules have agencies proposed and finalized since 1994?',
      },
      {
        query: 'artificial intelligence',
        question: 'What rules have agencies written about artificial intelligence?',
      },
      {
        query: 'national emergency',
        question:
          'Which rules did agencies publish under a declared national emergency?',
      },
    ],
  },
  {
    // "Ordered" covers what this corpus is: executive orders back to 1940, and
    // the proclamations, memoranda and determinations from 1994 — instruments
    // the President signs, rather than the office as an institution. The three
    // samples stay on the orders, which is the part that reaches furthest back.
    slug: 'presidential',
    title: 'Ask the presidency what it ordered.',
    samples: [
      {
        query: 'International Emergency Economic Powers Act',
        question: 'Which executive orders invoke the International Emergency Economic Powers Act?',
      },
      {
        query: 'national emergency',
        question:
          'Which executive orders declared a national emergency, and which later orders revoked them?',
      },
      {
        query: 'classified national security information',
        question:
          'How have executive orders since 1940 changed the rules for classifying national security information?',
      },
    ],
  },

  /* ---- As read --------------------------------------------------------- */
  {
    slug: 'olc',
    title: 'Ask the OLC what the executive may do.',
    samples: [
      {
        query: 'war powers',
        question:
          'What has OLC said about the President’s authority to use military force without Congress?',
      },
      {
        query: 'executive privilege',
        question: 'How has OLC described executive privilege over White House communications?',
      },
      {
        query: 'appointments clause',
        question: 'What has OLC concluded about appointing officials without Senate confirmation?',
      },
    ],
  },
  {
    // The floor is 2025-01-20 and the keyword index runs over docket-entry
    // descriptions, so the words here are the words a docket uses.
    slug: 'litigation',
    title: 'Ask the federal courts what was filed since 2025.',
    samples: [
      {
        query: 'temporary restraining order',
        question: 'Which cases since January 2025 opened with a temporary restraining order?',
      },
      {
        query: 'preliminary injunction',
        question:
          'Where have preliminary injunctions been sought against federal agencies since January 2025?',
      },
      {
        query: 'notice of appeal',
        question: 'What has been appealed to the circuits since the start of 2025?',
      },
    ],
  },

  /* ---- The record ------------------------------------------------------ */
  {
    // Published volumes run to the end of the Cold War, so every question here
    // is a historical one. "The cables" is what the record mostly is — telegrams,
    // memoranda of conversation, the paper a decision left behind — and it gives
    // the sentence a subject; "how it was decided" had no "it" to point to.
    slug: 'frus',
    title: 'Ask the diplomatic record what the cables said.',
    samples: [
      {
        query: 'Berlin',
        question: 'What does the diplomatic record show about the decisions behind the Berlin airlift?',
      },
      {
        query: 'Vietnam',
        question: 'How did the State Department record the decision to escalate in Vietnam?',
      },
      {
        query: 'Suez',
        question: 'What do the declassified papers say about the Suez crisis of 1956?',
      },
    ],
  },
  {
    // The Vault's scans carry no document dates, so nothing here asks "when".
    slug: 'fbi',
    title: 'Ask the FBI’s Vault what it released.',
    samples: [
      {
        query: 'COINTELPRO',
        question: 'What is in the Bureau’s COINTELPRO files?',
      },
      {
        query: 'Martin Luther King',
        question: 'What did the FBI release about its surveillance of Martin Luther King Jr.?',
      },
      {
        query: 'Unabomber',
        question: 'What does the Vault hold on the Unabomber investigation?',
      },
    ],
  },
  {
    // The one corpus the hub fan leaves out, so these three were checked
    // against `/corpus/sanctions/entity-filter` and `/corpus/sanctions/filter`
    // rather than against the fan. A reader who runs one in Search mode is
    // searching the other ten; the Sanctions workspace is where these land.
    slug: 'sanctions',
    title: 'Ask the sanctions lists who is on them.',
    samples: [
      {
        query: 'Hezbollah',
        question: 'Which entities on the sanctions lists are designated in connection with Hezbollah?',
      },
      {
        query: 'general license',
        question: 'What does OFAC’s guidance say about general licenses?',
      },
      {
        query: 'Wagner Group',
        question: 'Has OFAC designated the Wagner Group, and under which program?',
      },
    ],
  },

  /* ---- Commentary ------------------------------------------------------ */
  {
    // Two publications and no others, which is what the questions name.
    slug: 'commentary',
    title: 'Ask the commentary what Lawfare made of it.',
    samples: [
      {
        query: 'Insurrection Act',
        question: 'What have Lawfare’s contributors argued about the Insurrection Act?',
      },
      {
        query: 'Section 702',
        question: 'What has been written about reauthorizing Section 702?',
      },
      {
        query: 'emergency powers',
        question:
          'What have Bauer and Goldsmith written about the presidency’s emergency powers?',
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
