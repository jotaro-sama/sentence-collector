import tokenizeWords from 'talisman/tokenizers/words';

// Minimum of words that qualify as a sentence.
const MIN_WORDS = 1;

// Maximum of words allowed per sentence to keep recordings in a manageable duration.
const MAX_WORDS = 20;

// Numbers that are not allowed in a sentence depending on the language. For
// English this is 0-9 once or multiple times after each other.
const NUMBERS_REGEX = /[0-9]+/;

// Some languages want to check the structure, this is what this REGEX is for. For English
// (and by extend as default) we're not currently using it.
/* eslint-disable-next-line no-unused-vars */
const STRUCTURE_REGEX = undefined;

// The following symbols are disallowed, please update here as well and not just the regex
// to make it easier to read:
// < > + * \ # @ ^ [ ] ( ) /
/* eslint-disable-next-line no-useless-escape */
const SYMBOL_REGEX = /[<>\+\*\\#@\^\[\]\(\)\/]/;
// Any words consisting of uppercase letters or uppercase letters with a period
// inbetween are considered abbreviations or acronyms.
// This currently also matches fooBAR but we most probably don't want that either
// as users wouldn't know how to pronounce the uppercase letters.
const ABBREVIATION_REGEX = /[A-Z]{2,}|[A-Z]+\.*[A-Z]+/;

export function filterNumbers(sentence) {
  return !sentence.match(NUMBERS_REGEX);
}

export function filterAbbreviations(sentence) {
  return !sentence.match(ABBREVIATION_REGEX);
}

export function filterSymbols(sentence) {
  return !sentence.match(SYMBOL_REGEX);
}

/* eslint-disable-next-line no-unused-vars */
export function filterStructure(sentence) {
  return true;
}

export function filterLength(sentence) {
  const words = tokenizeWords(sentence);
  return words.length >= MIN_WORDS &&
    words.length <= MAX_WORDS;
}
