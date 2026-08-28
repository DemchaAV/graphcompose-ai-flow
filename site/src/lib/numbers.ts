// Small counts read as words in prose — "Four packs ship" rather than "4 packs
// ship". The counts themselves are generated from the repository, so this only
// decides how a generated number is spoken, never what it is.
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Spell `n` out when English usually would, otherwise return the numeral. */
export function spell(n: number): string {
  return WORDS[n] ?? String(n);
}

/** `spell`, capitalised — for the start of a sentence or a heading. */
export function Spell(n: number): string {
  const word = spell(n);
  return word.charAt(0).toUpperCase() + word.slice(1);
}
