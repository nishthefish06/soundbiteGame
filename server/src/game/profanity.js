import { Filter } from 'bad-words';

const filter = new Filter();

export function isProfane(text) {
  return filter.isProfane(text);
}
