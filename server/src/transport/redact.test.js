import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSnapshotFor } from './redact.js';

function baseSnapshot(overrides = {}) {
  return {
    state: 'ACTOR_RECORDING',
    actorId: 'actor',
    chainOrder: [],
    currentPrompt: 'Popcorn popping',
    promptOptions: [{ text: 'Popcorn popping', synonyms: [] }],
    ...overrides,
  };
}

test('non-chain mode: only the actor sees the prompt before reveal', () => {
  const snapshot = baseSnapshot();
  assert.equal(redactSnapshotFor(snapshot, 'actor').currentPrompt, 'Popcorn popping');
  assert.equal(redactSnapshotFor(snapshot, 'someone-else').currentPrompt, null);
});

test('non-chain mode: promptOptions are only the actor\'s business', () => {
  const snapshot = baseSnapshot();
  assert.deepEqual(redactSnapshotFor(snapshot, 'actor').promptOptions, snapshot.promptOptions);
  assert.deepEqual(redactSnapshotFor(snapshot, 'someone-else').promptOptions, []);
});

test('non-chain mode: everyone sees the prompt once revealed', () => {
  const snapshot = baseSnapshot({ state: 'ROUND_REVEAL' });
  assert.equal(redactSnapshotFor(snapshot, 'someone-else').currentPrompt, 'Popcorn popping');
});

test('TELEPHONE mode: only the originator sees the prompt, even as actorId moves through the chain', () => {
  const snapshot = baseSnapshot({ actorId: 'relayer2', chainOrder: ['originator', 'relayer1', 'relayer2'] });
  assert.equal(redactSnapshotFor(snapshot, 'originator').currentPrompt, 'Popcorn popping', 'originator always sees it');
  assert.equal(redactSnapshotFor(snapshot, 'relayer2').currentPrompt, null, 'current relayer (actorId) must NOT see it');
  assert.equal(redactSnapshotFor(snapshot, 'relayer1').currentPrompt, null);
});

test('TELEPHONE mode: promptOptions are only ever the originator\'s business', () => {
  const snapshot = baseSnapshot({ actorId: 'relayer1', chainOrder: ['originator', 'relayer1'] });
  assert.deepEqual(redactSnapshotFor(snapshot, 'relayer1').promptOptions, []);
  assert.deepEqual(redactSnapshotFor(snapshot, 'originator').promptOptions, snapshot.promptOptions);
});

test('TELEPHONE mode: everyone sees the prompt once revealed, same as normal modes', () => {
  const snapshot = baseSnapshot({
    state: 'ROUND_REVEAL',
    actorId: 'relayer1',
    chainOrder: ['originator', 'relayer1'],
  });
  assert.equal(redactSnapshotFor(snapshot, 'relayer1').currentPrompt, 'Popcorn popping');
  assert.equal(redactSnapshotFor(snapshot, 'some-guesser').currentPrompt, 'Popcorn popping');
});

test('PERFORMANCE mode: individual star ratings are hidden from everyone — actor included — before reveal', () => {
  const snapshot = baseSnapshot({
    state: 'RATING_ACTIVE',
    ratings: [{ playerId: 'rater1', stars: 5 }],
  });
  assert.deepEqual(redactSnapshotFor(snapshot, 'actor').ratings, []);
  assert.deepEqual(redactSnapshotFor(snapshot, 'rater1').ratings, []);
});

test('PERFORMANCE mode: ratings are shown in full to everyone once revealed', () => {
  const snapshot = baseSnapshot({
    state: 'ROUND_REVEAL',
    ratings: [{ playerId: 'rater1', stars: 5 }, { playerId: 'rater2', stars: 3 }],
  });
  assert.deepEqual(redactSnapshotFor(snapshot, 'actor').ratings, snapshot.ratings);
  assert.deepEqual(redactSnapshotFor(snapshot, 'rater1').ratings, snapshot.ratings);
});
