const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]

/** Small counts as words, larger ones as figures — the usual rule for prose. */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}
