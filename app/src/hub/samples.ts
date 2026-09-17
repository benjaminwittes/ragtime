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
 * and re-checked on 2026-09-17 when the register changed — each replacement
 * scoped to its own corpus (`corpora: [slug]`), which is a tenth of the work of
 * a fan and the reason the second pass finished at all.
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
 * **The register is institutional, not topical** (2026-09-17). The first pass
 * demonstrated the corpora on whatever was loudest — detention and habeas since
 * January 2025, emergency-powers orders, the Insurrection Act, COINTELPRO and
 * the Bureau's file on King — and a page that opens on those is not showing a
 * reader what a corpus holds, it is making an argument with it. The samples that
 * replaced them ask the same corpora the same *kind* of question in its dry,
 * durable form: what a statute requires, how a rule was made, what the cables
 * recorded, what the Vault posted. The subject matter is still the federal
 * record and still worth reading — a national-security corpus is not obliged to
 * be about drinking water — but nothing in the resting state of the page should
 * read as a brief against a sitting administration, and nothing should trade on
 * a sensational name. A sample that would look pointed screenshotted next to
 * Lawfare's masthead is the wrong sample, however well it retrieves.
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
    title: 'Ask the U.S. Code what the law says.',
    samples: [
      {
        // A citation rather than a phrase, because the box takes both and a
        // reader who arrives with one in hand should see that it works.
        query: '5 U.S.C. 552',
        question: 'What does the Freedom of Information Act require an agency to disclose?',
      },
      {
        query: 'Administrative Procedure Act',
        question: 'Which statutes govern how a federal agency makes a rule?',
      },
      {
        query: 'inspector general',
        question: 'What does the Code say about the duties of an inspector general?',
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
        query: 'environmental impact statement',
        question: 'What do the rules in force require in an environmental impact statement?',
      },
      {
        query: 'endangered species',
        question: 'Which regulations protect a listed species as they stand today?',
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
        query: 'cybersecurity',
        question: 'What have witnesses told congressional hearings about cybersecurity?',
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
        query: 'artificial intelligence',
        question: 'What rules have agencies written about artificial intelligence?',
      },
      {
        query: 'drinking water',
        question: 'Which drinking-water rules have agencies proposed and finalized since 1994?',
      },
      {
        query: 'aviation safety',
        question: 'What rules have agencies published about aviation safety?',
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
        query: 'federal advisory committee',
        question: 'Which executive orders established a federal advisory committee?',
      },
      {
        query: 'regulatory review',
        question: 'How have executive orders set the terms for reviewing agency regulations?',
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
        query: 'Freedom of Information Act',
        question: 'How has OLC read the Freedom of Information Act’s exemptions?',
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
        question: 'Where have preliminary injunctions been sought since January 2025?',
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
        query: 'Marshall Plan',
        question: 'How did the State Department record the making of the Marshall Plan?',
      },
      {
        query: 'Suez',
        question: 'What do the declassified papers say about the Suez crisis of 1956?',
      },
    ],
  },
  {
    // The Vault's scans carry no document dates, so nothing here asks "when".
    // The three are the Vault's long-closed famous files rather than its charged
    // ones: COINTELPRO and the Bureau's file on King retrieve beautifully and
    // make the hub's resting state an accusation, which is not what a reader who
    // has typed nothing asked for.
    slug: 'fbi',
    title: 'Ask the FBI’s Vault what it released.',
    samples: [
      {
        query: 'Amelia Earhart',
        question: 'What does the Vault hold on Amelia Earhart?',
      },
      {
        query: 'Al Capone',
        question: 'What is in the Bureau’s file on Al Capone?',
      },
      {
        query: 'Alcatraz',
        question: 'What did the FBI release about the escape from Alcatraz?',
      },
    ],
  },
  {
    // The one corpus the hub fan leaves out, so these three were checked
    // against `/corpus/sanctions/entity-filter` (the first) and
    // `/corpus/sanctions/filter` (the other two) rather than against the fan. A
    // reader who runs one in Search mode is searching the other ten; the
    // Sanctions workspace is where these land.
    //
    // Every name on the SDN list is a geopolitical actor, so the way out of a
    // rotating banner that reads like a designation announcement is to ask the
    // list by trade rather than by name, and otherwise to ask the guidance about
    // its own machinery. Nothing here asks *when* a party was designated:
    // `publish_date` is a copy-freshness stamp for the list data, not a
    // designation date, and a question shaped that way teaches the box a fact
    // the corpus cannot supply.
    slug: 'sanctions',
    title: 'Ask the sanctions lists who is on them.',
    samples: [
      {
        query: 'shipping',
        question: 'Which shipping companies are on the sanctions lists?',
      },
      {
        query: 'general license',
        question: 'What does OFAC’s guidance say about general licenses?',
      },
      {
        query: 'blocked property',
        question: 'What does OFAC’s guidance say about property it has blocked?',
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
    title: 'Ask the commentary what Lawfare made of it.',
    samples: [
      {
        query: 'cybersecurity',
        question: 'What have Lawfare’s contributors argued about cybersecurity policy?',
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
