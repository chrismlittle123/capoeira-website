import type { CollectionEntry } from 'astro:content';

/** Each browsable facet of the ontology: its key is its collection, its URL segment and the song field that references it. */
export const FACETS = {
  themes: { label: 'Themes', blurb: 'What the songs sing about.' },
  people: { label: 'People', blurb: 'Mestres, legends and figures named in the songs.' },
  places: { label: 'Places', blurb: 'Where the songs take us.' },
} as const;

export type TaxonomyKey = keyof typeof FACETS;
export const TAXONOMY_KEYS = Object.keys(FACETS) as TaxonomyKey[];

type PersonKind = CollectionEntry<'people'>['data']['kind'];
type TaxonomyData = CollectionEntry<TaxonomyKey>['data'];

const KIND_NAMES: Record<PersonKind, string> = {
  mestre: 'Mestre',
  historical: 'Historical figure',
  legendary: 'Legend',
  religious: 'Religious figure',
  other: '',
};

/** Short facts about a taxonomy entry (kind, dates, region) for its cards and page. */
export function entryFacts(data: TaxonomyData): string[] {
  const out: string[] = [];
  if ('kind' in data && KIND_NAMES[data.kind]) out.push(KIND_NAMES[data.kind]);
  if ('lived' in data && data.lived) out.push(data.lived);
  if ('region' in data && data.region) out.push(data.region);
  return out;
}
