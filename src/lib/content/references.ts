/** Finding song references to themes, people, places or songs that don't exist. */
import type { CollectionEntry } from 'astro:content';
import type { TaxonomyKey } from './facets.ts';

/** A reference as a song's frontmatter holds it: to a theme, person, place or related song. */
export type Ref = CollectionEntry<'songs'>['data'][TaxonomyKey | 'related'][number];

export type BrokenRef = Ref & { song: string };

/** Every reference a song makes to an entry that doesn't exist. `known` holds every entry as "collection:id". */
export function brokenReferences(songs: { id: string; refs: Ref[] }[], known: Set<string>): BrokenRef[] {
  return songs.flatMap((s) => s.refs.filter((r) => !known.has(`${r.collection}:${r.id}`)).map((r) => ({ song: s.id, ...r })));
}

/**
 * `check`, run once per build however often it's called, but on every call in dev
 * (`isBuild` false), so a new typo or a fix shows up without restarting the server.
 */
export function oncePerBuild(check: () => Promise<void>, isBuild: () => boolean): () => Promise<void> {
  let done: Promise<void> | undefined;
  return () => {
    if (!isBuild()) return check();
    done ??= check();
    return done;
  };
}
