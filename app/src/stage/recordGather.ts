import {
  corpusLongLabel,
  runCfrFilter,
  runCommentaryFilter,
  runFrFilter,
  runFrusFilter,
  runManualFilter,
  runOlcFilter,
  runPresidentialFilter,
  runUscFilter,
  type CorpusSlug,
} from '@lawfare/ragtime-client'

import {
  ON_STAGE,
  caseDoc,
  cfrDoc,
  commentaryDoc,
  frDoc,
  frusDoc,
  olcDoc,
  presidentialDoc,
  uscDoc,
  type Axis,
  type Legend,
  type RecordScene,
  type StageDoc,
} from './record.ts'

/**
 * Bringing a search on: one request, made by the presenter's browser, to the same filter
 * endpoint the collection's own page uses. One, because the service allows ten a minute
 * from an address that is not signed in — which is also why the audience makes none: the
 * documents this returns travel to them inside the scene.
 *
 * What a collection's row carries decides what its objects can show, so each collection
 * says here what its dimensions mean (`record.ts` has the mappers). A collection is on
 * this list only when its rows have enough to stand on a floor honestly.
 */
type Collection = {
  axis: Axis
  unit: string | null
  legend: Legend
  run: (search: string) => Promise<{ docs: StageDoc[]; total: number }>
}

const TIME: Axis = { kind: 'time' }
const TITLES: Axis = { kind: 'ordinal', label: 'Title' }

const take = <Row>(rows: Row[], map: (row: Row) => StageDoc) => rows.slice(0, ON_STAGE).map(map)

const COLLECTIONS: Record<string, Collection> = {
  olc: {
    axis: TIME,
    unit: 'pages',
    legend: {
      height: 'length of the opinion',
      along: 'the date it was issued',
      rough: 'released under a FOIA suit, not published by the Department',
      film: 'a poor scan: its text was read with errors',
      open: 'its length is not recorded',
    },
    run: async (search) => {
      const got = await runOlcFilter({ search })
      return { docs: take(got.display_rows, olcDoc), total: got.count }
    },
  },
  fr: {
    axis: TIME,
    unit: null,
    legend: {
      height: 'length of the document',
      along: 'the date it was published',
      rows: 'what kind of document it is',
      hatched: 'proposed, not final',
      uncapped: 'still open for comment',
      marked: 'designated significant',
      family: 'one rulemaking, followed by its RIN',
      open: 'no text held',
    },
    run: async (search) => {
      const today = new Date().toISOString().slice(0, 10)
      const got = await runFrFilter({ search })
      return { docs: take(got.display_rows, (row) => frDoc(row, today)), total: got.count }
    },
  },
  presidential: {
    axis: TIME,
    unit: null,
    legend: {
      height: 'length of the document',
      along: 'the date it was signed',
      rows: 'what kind of instrument it is',
      open: 'only its citation is held, not its text',
      film: 'text supplied from a secondary source',
    },
    run: async (search) => {
      const got = await runPresidentialFilter({ search })
      return { docs: take(got.display_rows, presidentialDoc), total: got.count }
    },
  },
  litigation: {
    axis: TIME,
    unit: 'entries',
    legend: {
      height: 'how many entries are on the docket',
      along: 'the date the case was filed',
      rows: 'which level of court',
      uncapped: 'still open: not terminated',
      open: 'its docket has not been counted',
    },
    run: async (search) => {
      const got = await runManualFilter({ search })
      return { docs: take(got.display_rows, caseDoc), total: got.count }
    },
  },
  frus: {
    axis: TIME,
    unit: null,
    legend: {
      height: 'length of the document',
      along: 'the date of the document',
      rows: 'the classification it carried',
      family: 'one volume of the series',
      open: 'no text held',
    },
    run: async (search) => {
      const got = await runFrusFilter({ search })
      return { docs: take(got.display_rows, frusDoc), total: got.count }
    },
  },
  usc: {
    axis: TITLES,
    unit: null,
    legend: {
      height: 'length of the section',
      along: 'its title of the Code, 1 to 54',
      rows: 'whether its title is enacted as positive law',
      hatched: 'not in force: repealed, omitted or transferred',
      open: 'no text held',
    },
    run: async (search) => {
      const got = await runUscFilter({ search })
      return { docs: take(got.display_rows, uscDoc), total: got.count }
    },
  },
  cfr: {
    axis: TITLES,
    unit: null,
    legend: {
      height: 'length of the section',
      along: 'its title of the Code of Federal Regulations',
      open: 'reserved: a number with no rule under it',
    },
    run: async (search) => {
      const got = await runCfrFilter({ search })
      return { docs: take(got.display_rows, cfrDoc), total: got.count }
    },
  },
  commentary: {
    axis: TIME,
    unit: null,
    legend: {
      height: 'length of the piece',
      along: 'the date it was published',
      rows: 'which publication',
      family: 'one series',
      open: 'no text held',
    },
    run: async (search) => {
      const got = await runCommentaryFilter({ search })
      return { docs: take(got.display_rows, commentaryDoc), total: got.count }
    },
  },
}

/** The collections that can be brought on, for the console's list. */
export const STAGEABLE: { slug: string; label: string }[] = Object.keys(COLLECTIONS).map((slug) => ({
  slug,
  label: corpusLongLabel(slug as CorpusSlug),
}))

/** The scene before the answer: the floor, up and empty, with the question on the wall. */
export function pendingRecord(corpus: string, query: string): RecordScene | null {
  const collection = Object.hasOwn(COLLECTIONS, corpus) ? COLLECTIONS[corpus] : undefined
  if (!collection) return null
  return {
    kind: 'record',
    corpus,
    label: corpusLongLabel(corpus as CorpusSlug),
    query,
    total: 0,
    docs: [],
    axis: collection.axis,
    unit: collection.unit,
    legend: collection.legend,
    pending: true,
  }
}

/** Ask, and return the scene with its documents on. Throws what the request throws. */
export async function gatherRecord(pending: RecordScene): Promise<RecordScene> {
  const got = await COLLECTIONS[pending.corpus].run(pending.query)
  return { ...pending, docs: got.docs, total: got.total, pending: false }
}
