/** Where the songbook's content lives, relative to the project root. */
export const PUBLIC_DIR = 'public';
export const SONGS_DIR = 'src/content/songs';
/** A YAML file in src/data, keyed by id (themes, people, places, glossary). */
export const dataFile = (name: string) => `src/data/${name}.yaml`;
