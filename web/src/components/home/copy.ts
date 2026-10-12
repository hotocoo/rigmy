import { featuredPreset } from '@/lib/content';
import type { Data } from '@/lib/data';
import { pluralWord } from '@/lib/format';
import type { Build } from '@/lib/types';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** "six", "13" … — the home copy spells small counts out. */
export const numWord = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "six shops", "one retailer". */
export const countWords = (n: number, one: string, many?: string) => numWord(n) + ' ' + pluralWord(n, one, many);

/** Number of categories the user has picked a part for. */
export const pickedCount = (d: Data, build: Build) => d.categories.filter((c) => build[c.id]).length;

/** What the home story shows: the user's build, or the featured preset when they have not picked anything yet. */
export function homeBuild(d: Data, build: Build): Build {
  return pickedCount(d, build) ? build : featuredPreset(d)?.build || {};
}
