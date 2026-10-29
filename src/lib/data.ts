/** Checking JSON the site writes into its own pages and files, before the browser scripts use it. */
import * as z from 'zod/mini';

/** `data` as `schema` describes it; throws naming `what` and every field that doesn't fit. */
export function parseData<T>(schema: z.ZodMiniType<T>, data: unknown, what: string): T {
  const result = z.safeParse(schema, data);
  if (!result.success) throw new Error(`${what} isn't in the expected shape:\n${z.prettifyError(result.error)}`);
  return result.data;
}
