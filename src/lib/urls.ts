/** The site's URLs, built in one place (safe to import in the browser). */
import type { TaxonomyKey } from './songs';

/** The fixed pages. */
export const PAGES = { home: '/', songs: '/songs/', browse: '/browse/', glossary: '/glossary/', about: '/about/' } as const;

/** Every song as open data. */
export const SONGS_JSON_URL = '/api/songs.json';
/** Themes, people, places and the glossary as open data. */
export const ONTOLOGY_JSON_URL = '/api/ontology.json';

export const songUrl = (id: string) => `${PAGES.songs}${id}/`;

/** A facet's index page, or one of its entries. */
export const facetUrl = (key: TaxonomyKey, id?: string) => `/${key}/${id ? `${id}/` : ''}`;

/** The glossary, or one word in it. */
export const glossaryUrl = (id?: string) => (id ? `${PAGES.glossary}#${id}` : PAGES.glossary);
