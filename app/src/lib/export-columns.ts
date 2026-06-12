/**
 * Per-corpus CSV column maps for dataset export.
 *
 * Each map mirrors the columns the corresponding spoke's results table shows,
 * plus the audit identifiers (ids, canonical source URLs) that make the export
 * useful as a dataset. Litigation's dynamic annotation/verdict columns are
 * appended at the call site (they depend on the operation that produced the
 * page); the base columns live here.
 */
import type { CsvColumn } from './export-csv'
import type {
  CaseDisplayRow,
  CfrSectionDisplayRow,
  ClemencyGrantDisplayRow,
  FrusDocumentDisplayRow,
  LawfareArticleDisplayRow,
  OlcOpinionDisplayRow,
  PresidentialDocumentDisplayRow,
  UscSectionDisplayRow,
} from './worker-client'

export const LITIGATION_BASE_COLUMNS: CsvColumn<CaseDisplayRow>[] = [
  { header: 'cl_id', value: (r) => r.cl_id },
  { header: 'case_name', value: (r) => r.case_name },
  { header: 'docket_number', value: (r) => r.docket_number },
  { header: 'court', value: (r) => r.court },
  { header: 'date_filed', value: (r) => r.date_filed },
  { header: 'date_terminated', value: (r) => r.date_terminated },
  { header: 'judge', value: (r) => r.judge },
  { header: 'nature_of_suit', value: (r) => r.nature_of_suit },
  { header: 'cause', value: (r) => r.cause },
  { header: 'entry_count', value: (r) => r.entry_count },
  { header: 'courtlistener_url', value: (r) => r.cl_url },
]

export const USC_COLUMNS: CsvColumn<UscSectionDisplayRow>[] = [
  { header: 'citation', value: (r) => r.citation },
  { header: 'heading', value: (r) => r.heading },
  { header: 'title_num', value: (r) => r.title_num },
  { header: 'title_name', value: (r) => r.title_name },
  { header: 'section_identifier', value: (r) => r.section_identifier },
  { header: 'is_positive_law', value: (r) => r.is_positive_law },
  { header: 'status', value: (r) => r.status },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const CFR_COLUMNS: CsvColumn<CfrSectionDisplayRow>[] = [
  { header: 'citation', value: (r) => r.citation },
  { header: 'heading', value: (r) => r.heading },
  { header: 'title_num', value: (r) => r.title_num },
  { header: 'title_name', value: (r) => r.title_name },
  { header: 'section_identifier', value: (r) => r.section_identifier },
  { header: 'reserved', value: (r) => r.reserved },
  { header: 'source', value: (r) => r.source },
  { header: 'up_to_date_as_of', value: (r) => r.up_to_date_as_of },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const OLC_COLUMNS: CsvColumn<OlcOpinionDisplayRow>[] = [
  { header: 'title', value: (r) => r.title },
  { header: 'author', value: (r) => r.author },
  { header: 'date_issued', value: (r) => r.date_issued },
  { header: 'source', value: (r) => r.source },
  { header: 'source_url_doj', value: (r) => r.source_url_doj },
  { header: 'source_url_knight', value: (r) => r.source_url_knight },
  { header: 'page_count', value: (r) => r.page_count },
  { header: 'ocr_quality', value: (r) => r.ocr_quality },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const LAWFARE_COLUMNS: CsvColumn<LawfareArticleDisplayRow>[] = [
  { header: 'title', value: (r) => r.title },
  { header: 'authors', value: (r) => r.author_names.join('; ') },
  { header: 'published_date', value: (r) => r.published_date },
  { header: 'content_type', value: (r) => r.content_type },
  { header: 'series', value: (r) => r.series },
  { header: 'topics', value: (r) => r.topic_names.join('; ') },
  { header: 'canonical_url', value: (r) => r.canonical_url },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const FRUS_COLUMNS: CsvColumn<FrusDocumentDisplayRow>[] = [
  { header: 'title', value: (r) => r.title },
  { header: 'doc_date', value: (r) => r.doc_date },
  { header: 'volume_id', value: (r) => r.volume_id },
  { header: 'place_name', value: (r) => r.place_name },
  { header: 'classification', value: (r) => r.classification },
  { header: 'source_url', value: (r) => r.source_url },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const PRESIDENTIAL_COLUMNS: CsvColumn<PresidentialDocumentDisplayRow>[] = [
  { header: 'citation', value: (r) => r.display_citation },
  { header: 'title', value: (r) => r.title },
  { header: 'doc_type', value: (r) => r.doc_type },
  { header: 'president', value: (r) => r.president_name },
  { header: 'signing_date', value: (r) => r.signing_date },
  { header: 'publication_date', value: (r) => r.publication_date },
  { header: 'fr_citation', value: (r) => r.fr_citation },
  { header: 'eo_number', value: (r) => r.eo_number },
  { header: 'proclamation_number', value: (r) => r.proclamation_number },
  { header: 'agencies', value: (r) => (r.agencies ?? []).join('; ') },
  { header: 'text_quality', value: (r) => r.text_quality },
  { header: 'federalregister_url', value: (r) => r.html_url },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const CLEMENCY_COLUMNS: CsvColumn<ClemencyGrantDisplayRow>[] = [
  { header: 'recipient', value: (r) => r.person_name },
  { header: 'clemency_type', value: (r) => r.clemency_type },
  { header: 'president', value: (r) => r.president_name },
  { header: 'grant_date', value: (r) => r.grant_date },
  { header: 'district', value: (r) => r.district },
  { header: 'offense', value: (r) => r.offense },
  { header: 'topic', value: (r) => r.topic },
  { header: 'relationship', value: (r) => r.relationship },
  { header: 'provenance', value: (r) => r.provenance },
  { header: 'has_reoffended', value: (r) => r.has_reoffended },
  { header: 'forgiven_amount', value: (r) => r.forgiven_amount },
  { header: 'warrant_url', value: (r) => r.warrant_url },
  { header: 'pardon_id', value: (r) => r.pardon_id },
]
