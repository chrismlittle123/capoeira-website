import type { TaxonomyKey } from './facets';

export interface Ref {
  collection: TaxonomyKey | 'songs';
  id: string;
}

export interface BrokenRef extends Ref {
  song: string;
}

/** Every reference a song makes to an entry that doesn't exist. `known` holds every entry as "collection:id". */
export function brokenReferences(songs: { id: string; refs: Ref[] }[], known: Set<string>): BrokenRef[] {
  return songs.flatMap((s) => s.refs.filter((r) => !known.has(`${r.collection}:${r.id}`)).map((r) => ({ song: s.id, ...r })));
}
