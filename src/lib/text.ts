/** "1 song", "3 songs" */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
