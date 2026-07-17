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
  CongressBillDisplayRow,
  CongressCollection,
  CongressHearingDisplayRow,
  CongressLawDisplayRow,
  CongressRecordDisplayRow,
  CongressTestimonyDisplayRow,
  CommentaryDisplayRow,
  FrDocumentDisplayRow,
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

export const COMMENTARY_COLUMNS: CsvColumn<CommentaryDisplayRow>[] = [
  { header: 'publication', value: (r) => r.publication },
  { header: 'title', value: (r) => r.title },
  { header: 'authors', value: (r) => (r.authors ?? []).join('; ') },
  { header: 'published_date', value: (r) => r.published_date },
  { header: 'post_type', value: (r) => r.post_type },
  { header: 'series', value: (r) => r.series },
  { header: 'topics', value: (r) => (r.topic_names ?? []).join('; ') },
  { header: 'source_url', value: (r) => r.source_url },
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

export const FR_COLUMNS: CsvColumn<FrDocumentDisplayRow>[] = [
  { header: 'fr_citation', value: (r) => r.fr_citation },
  { header: 'title', value: (r) => r.title },
  { header: 'doc_type', value: (r) => r.doc_type },
  { header: 'document_number', value: (r) => r.document_number },
  { header: 'agencies', value: (r) => (r.agency_names ?? []).join('; ') },
  { header: 'significant', value: (r) => r.significant },
  { header: 'rin', value: (r) => (r.regulation_id_numbers ?? []).join('; ') },
  { header: 'publication_date', value: (r) => r.publication_date },
  { header: 'effective_on', value: (r) => r.effective_on },
  { header: 'comments_close_on', value: (r) => r.comments_close_on },
  { header: 'federalregister_url', value: (r) => r.html_url },
  { header: 'pdf_url', value: (r) => r.pdf_url },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const CONGRESS_LAWS_COLUMNS: CsvColumn<CongressLawDisplayRow>[] = [
  { header: 'pl_number', value: (r) => r.pl_number },
  { header: 'title', value: (r) => r.title },
  { header: 'law_kind', value: (r) => r.law_kind },
  { header: 'congress', value: (r) => r.congress },
  { header: 'approved_date', value: (r) => r.approved_date },
  { header: 'statute_citation', value: (r) => r.statute_citation },
  { header: 'provenance', value: (r) => r.provenance },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const CONGRESS_BILLS_COLUMNS: CsvColumn<CongressBillDisplayRow>[] = [
  { header: 'source_key', value: (r) => r.source_key },
  { header: 'congress', value: (r) => r.congress },
  { header: 'bill_type', value: (r) => r.bill_type },
  { header: 'bill_number', value: (r) => r.bill_number },
  { header: 'title', value: (r) => r.title },
  { header: 'origin_chamber', value: (r) => r.origin_chamber },
  { header: 'sponsors', value: (r) => (r.sponsor_names ?? []).join('; ') },
  { header: 'cosponsor_count', value: (r) => r.cosponsor_count },
  { header: 'committees', value: (r) => (r.committee_names ?? []).join('; ') },
  { header: 'policy_area', value: (r) => r.policy_area },
  { header: 'introduced_date', value: (r) => r.introduced_date },
  { header: 'latest_action_date', value: (r) => r.latest_action_date },
  { header: 'latest_action_text', value: (r) => r.latest_action_text },
  { header: 'became_law', value: (r) => r.became_law },
  { header: 'law_refs', value: (r) => (r.law_refs ?? []).join('; ') },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const CONGRESS_HEARINGS_COLUMNS: CsvColumn<CongressHearingDisplayRow>[] = [
  { header: 'source_key', value: (r) => r.source_key },
  { header: 'title', value: (r) => r.title },
  { header: 'congress', value: (r) => r.congress },
  { header: 'chamber', value: (r) => r.chamber },
  { header: 'held_date', value: (r) => r.held_date },
  { header: 'committees', value: (r) => (r.committee_names ?? []).join('; ') },
  { header: 'witnesses', value: (r) => (r.witness_names ?? []).join('; ') },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const CONGRESS_RECORD_COLUMNS: CsvColumn<CongressRecordDisplayRow>[] = [
  { header: 'source_key', value: (r) => r.source_key },
  { header: 'title', value: (r) => r.title },
  { header: 'granule_class', value: (r) => r.granule_class },
  { header: 'record_date', value: (r) => r.record_date },
  { header: 'member_count', value: (r) => (r.member_names ?? []).length },
  { header: 'bill_refs', value: (r) => (r.bill_refs ?? []).join('; ') },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

export const CONGRESS_TESTIMONY_COLUMNS: CsvColumn<CongressTestimonyDisplayRow>[] = [
  { header: 'source_key', value: (r) => r.source_key },
  { header: 'witness', value: (r) => r.witness },
  { header: 'doc_type', value: (r) => r.doc_type },
  { header: 'congress', value: (r) => r.congress },
  { header: 'committee_code', value: (r) => r.committee_code },
  { header: 'statement_date', value: (r) => r.statement_date },
  { header: 'url', value: (r) => r.url },
  { header: 'text_length', value: (r) => r.text_length },
  { header: 'id', value: (r) => r.id },
]

/** Congress exports are keyed by the active collection — five row shapes
 * share one spoke, so the shell looks the column set up at download time. */
export const CONGRESS_COLUMNS_BY_COLLECTION: {
  [C in CongressCollection]: readonly CsvColumn<never>[]
} = {
  laws: CONGRESS_LAWS_COLUMNS,
  bills: CONGRESS_BILLS_COLUMNS,
  hearings: CONGRESS_HEARINGS_COLUMNS,
  record: CONGRESS_RECORD_COLUMNS,
  testimony: CONGRESS_TESTIMONY_COLUMNS,
}

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
