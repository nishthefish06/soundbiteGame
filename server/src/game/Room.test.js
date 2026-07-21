import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import {
  GameState,
  PROMPT_OPTIONS_COUNT,
  VALID_ROUND_COUNTS,
  GUESSING_DURATION_MS,
  MAX_SPEED_BONUS,
  STREAK_BONUS_PER_LEVEL,
  MAX_STREAK_LEVEL,
  POINTS_PER_STAR,
} from './constants.js';
import { GAME_MODES } from './prompts.js';

function makeRoom(playerCount = 3) {
  const room = new Room('TEST');
  for (let i = 0; i < playerCount; i += 1) {
    room.addPlayer(`p${i}`, `Player${i}`);
  }
  return room;
}

// Starts a game and picks the first offered prompt for the current round,
// returning the prompt text.
function pickPrompt(room) {
  const prompt = room.promptOptions[0].text;
  room.selectPrompt(room.actorId, prompt);
  return prompt;
}

function startGameAndPickPrompt(room, rounds = 3, mode = GAME_MODES[0]) {
  room.startGame(room.hostId, rounds, mode);
  return pickPrompt(room);
}

test('starts in LOBBY with no players', () => {
  const room = new Room('TEST');
  assert.equal(room.state, GameState.LOBBY);
  assert.equal(room.playerCount, 0);
});

test('startGame rejects below MIN_PLAYERS', () => {
  const room = makeRoom(2);
  assert.throws(() => room.startGame(room.hostId, 3, GAME_MODES[0]), /NOT_ENOUGH_PLAYERS/);
});

test('startGame rejects an invalid round count', () => {
  const room = makeRoom(3);
  assert.throws(() => room.startGame(room.hostId, 4, GAME_MODES[0]), /INVALID_ROUND_COUNT/);
});

test('startGame rejects an invalid mode', () => {
  const room = makeRoom(3);
  assert.throws(() => room.startGame(room.hostId, VALID_ROUND_COUNTS[0], 'NOT_A_MODE'), /INVALID_MODE/);
});

test('startGame in CUSTOM mode rejects too few custom prompts', () => {
  const room = makeRoom(3);
  assert.throws(() => room.startGame(room.hostId, 3, 'CUSTOM', ['only', 'two']), /NOT_ENOUGH_CUSTOM_PROMPTS/);
  assert.throws(() => room.startGame(room.hostId, 3, 'CUSTOM'), /NOT_ENOUGH_CUSTOM_PROMPTS/, 'missing array entirely');
});

test('startGame in CUSTOM mode deals rounds from the submitted prompt list', () => {
  const room = makeRoom(3);
  const submitted = ['Dad joke', 'Inside joke', 'Road trip story'];
  room.startGame(room.hostId, 3, 'CUSTOM', submitted);

  assert.equal(room.state, GameState.PROMPT_SELECTION);
  assert.equal(room.currentMode, 'CUSTOM');
  assert.equal(room.promptOptions.length, PROMPT_OPTIONS_COUNT);
  for (const option of room.promptOptions) {
    assert.ok(submitted.includes(option.text), 'every option should come from the submitted list');
    assert.deepEqual(option.synonyms, []);
  }
});

test('startGame in CUSTOM mode reshuffles the submitted list once it runs out', () => {
  const room = makeRoom(3);
  const submitted = ['Only', 'Three', 'Prompts']; // exactly PROMPT_OPTIONS_COUNT — every round exhausts and must reshuffle
  room.startGame(room.hostId, 5, 'CUSTOM', submitted);

  for (let round = 0; round < 5; round += 1) {
    assert.equal(room.promptOptions.length, PROMPT_OPTIONS_COUNT, `round ${round + 1} should still offer a full set of options`);
    for (const option of room.promptOptions) {
      assert.ok(submitted.includes(option.text));
    }
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    if (round < 4) room.finishReveal();
  }
});

test('startGame configures totalRounds/mode and deals the first round\'s prompts', () => {
  const room = makeRoom(3);
  const [mode] = GAME_MODES;
  room.startGame(room.hostId, 5, mode);

  assert.equal(room.state, GameState.PROMPT_SELECTION);
  assert.equal(room.totalRounds, 5);
  assert.equal(room.currentMode, mode);
  assert.equal(room.roundNumber, 1);
  assert.equal(room.promptOptions.length, PROMPT_OPTIONS_COUNT);
  for (const option of room.promptOptions) {
    assert.equal(typeof option.text, 'string');
    assert.ok(Array.isArray(option.synonyms));
  }
  const texts = room.promptOptions.map((o) => o.text);
  assert.equal(new Set(texts).size, PROMPT_OPTIONS_COUNT, 'options should be distinct');
});

test('startGame resets everyone\'s score for the new game', () => {
  const room = makeRoom(3);
  const [firstId] = room.playerList.map((p) => p.id);
  room.players.get(firstId).score = 999;

  room.startGame(room.hostId, 3, GAME_MODES[0]);
  assert.equal(room.players.get(firstId).score, 0);
});

test('selectPrompt rejects a choice that was not offered', () => {
  const room = makeRoom(3);
  room.startGame(room.hostId, 3, GAME_MODES[0]);
  assert.throws(() => room.selectPrompt(room.actorId, 'not a real option'), /INVALID_PROMPT_CHOICE/);
});

test('selectPrompt rejects a non-actor', () => {
  const room = makeRoom(3);
  room.startGame(room.hostId, 3, GAME_MODES[0]);
  const [otherId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  assert.throws(() => room.selectPrompt(otherId, room.promptOptions[0].text), /NOT_ACTOR/);
});

test('finishReveal moves to the next turn, staying in the same round until everyone has acted', () => {
  const room = makeRoom(3);
  const [mode] = GAME_MODES;
  startGameAndPickPrompt(room, 5, mode);
  const firstActor = room.actorId;
  room.submitRecording(firstActor, 'ROBOT');
  room.endGuessing(); // force straight to reveal

  room.finishReveal();

  assert.equal(room.state, GameState.PROMPT_SELECTION);
  assert.notEqual(room.actorId, firstActor, "rotates to the next player's turn");
  assert.equal(room.roundNumber, 1, 'still round 1 — not everyone has had a turn yet');
  assert.equal(room.currentMode, mode, 'mode stays fixed for the whole game');
});

test('a round ends and the next one begins only once every player has had a turn', () => {
  const room = makeRoom(3);
  room.startGame(room.hostId, 5, GAME_MODES[0]);
  const firstActor = room.actorId;

  // Play out the other 2 players' turns — still round 1 the whole time.
  for (let i = 0; i < 2; i += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }
  assert.equal(room.roundNumber, 1, 'everyone in a 3-player room needs 3 turns to complete round 1');

  // The 3rd turn completes round 1 and rolls into round 2.
  pickPrompt(room);
  room.submitRecording(room.actorId, 'ROBOT');
  room.endGuessing();
  room.finishReveal();

  assert.equal(room.roundNumber, 2, 'round 2 begins once everyone has gone once');
  assert.equal(room.actorId, firstActor, 'the rotation wraps back around to whoever went first');
});

test('every player gets exactly one turn per round, in rotation, regardless of room size', () => {
  const room = makeRoom(5);
  room.startGame(room.hostId, 3, GAME_MODES[0]);

  const actorsSeenThisRound = [];
  for (let turn = 0; turn < 5; turn += 1) {
    actorsSeenThisRound.push(room.actorId);
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }

  assert.equal(room.roundNumber, 2, 'round 1 took exactly 5 turns for 5 players');
  assert.deepEqual(
    [...actorsSeenThisRound].sort(),
    room.playerList.map((p) => p.id).sort(),
    'every player acted exactly once during round 1',
  );
});

test('finishReveal ends the game after the last round (every player has acted totalRounds times)', () => {
  const room = makeRoom(3);
  const totalRounds = 3;
  room.startGame(room.hostId, totalRounds, GAME_MODES[0]);

  const totalTurns = totalRounds * room.playerCount; // everyone acts once per round
  for (let turn = 1; turn <= totalTurns; turn += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }

  assert.equal(room.state, GameState.GAME_OVER);
  assert.equal(room.roundNumber, totalRounds);
});

test('returnToLobby resets game state so a new game can be configured', () => {
  const room = makeRoom(3);
  const totalRounds = 3;
  room.startGame(room.hostId, totalRounds, GAME_MODES[0]);
  const totalTurns = totalRounds * room.playerCount;
  for (let turn = 1; turn <= totalTurns; turn += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }
  assert.equal(room.state, GameState.GAME_OVER);

  room.returnToLobby();

  assert.equal(room.state, GameState.LOBBY);
  assert.equal(room.totalRounds, 0);
  assert.equal(room.currentMode, null);
  assert.equal(room.roundNumber, 0);

  // A new game can be started right away.
  room.startGame(room.hostId, 5, GAME_MODES[1]);
  assert.equal(room.state, GameState.PROMPT_SELECTION);
  assert.equal(room.totalRounds, 5);
  assert.equal(room.currentMode, GAME_MODES[1]);
});

test('full round happy path: PROMPT_SELECTION -> ACTOR_RECORDING -> GUESSING_ACTIVE -> ROUND_REVEAL', () => {
  const room = makeRoom(3);

  const prompt = startGameAndPickPrompt(room, 3);
  assert.equal(room.state, GameState.ACTOR_RECORDING);
  assert.ok(room.actorId);
  assert.equal(room.currentPrompt, prompt);

  room.submitRecording(room.actorId, 'ROBOT');
  assert.equal(room.state, GameState.GUESSING_ACTIVE);

  const guesserIds = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  assert.equal(guesserIds.length, 2);

  room.submitGuess(guesserIds[0], room.currentPrompt);
  assert.equal(room.state, GameState.GUESSING_ACTIVE, 'not everyone guessed yet');

  room.submitGuess(guesserIds[1], room.currentPrompt);
  assert.equal(room.state, GameState.ROUND_REVEAL, 'last guesser triggers reveal');
});

test('correct guess awards points to guesser and actor', () => {
  const room = makeRoom(3);
  const actorId = (startGameAndPickPrompt(room, 3), room.actorId);
  room.submitRecording(actorId, 'DEMON');
  // Backdate guessingStartedAt past the window so the speed bonus is zeroed
  // out — this test is about the base award, not the timing bonus.
  room.guessingStartedAt = Date.now() - GUESSING_DURATION_MS;

  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== actorId);
  room.submitGuess(guesserId, room.currentPrompt);

  assert.equal(room.players.get(guesserId).score, 100);
  assert.equal(room.players.get(actorId).score, 25);
});

test('a fast correct guess earns a speed bonus on top of the base points', () => {
  const room = makeRoom(3);
  const actorId = (startGameAndPickPrompt(room, 3), room.actorId);
  room.submitRecording(actorId, 'DEMON'); // sets guessingStartedAt to now

  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== actorId);
  room.submitGuess(guesserId, room.currentPrompt);

  const score = room.players.get(guesserId).score;
  assert.ok(score > 100, `expected a speed bonus on top of 100, got ${score}`);
  assert.ok(score <= 100 + MAX_SPEED_BONUS, `speed bonus should never exceed ${MAX_SPEED_BONUS}`);
});

test('a correct guess earns no speed bonus once the guessing window has fully elapsed', () => {
  const room = makeRoom(3);
  const actorId = (startGameAndPickPrompt(room, 3), room.actorId);
  room.submitRecording(actorId, 'DEMON');
  room.guessingStartedAt = Date.now() - GUESSING_DURATION_MS;

  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== actorId);
  room.submitGuess(guesserId, room.currentPrompt);

  assert.equal(room.players.get(guesserId).score, 100, 'no speed bonus left once the window has elapsed');
});

test('guessing correctly in consecutive rounds builds a streak bonus', () => {
  // 4 players, 3 rounds: join-order actor rotation makes p0/p1/p2 the actors
  // across these rounds and p3 never comes up — p3 gets to guess every round.
  const room = makeRoom(4);
  room.startGame(room.hostId, 3, GAME_MODES[0]);
  const guesserId = 'p3';

  const scoresByRound = [];
  for (let round = 0; round < 3; round += 1) {
    pickPrompt(room);
    assert.notEqual(room.actorId, guesserId, 'fixture assumption: p3 should never be the actor here');
    room.submitRecording(room.actorId, 'ROBOT');
    room.guessingStartedAt = Date.now() - GUESSING_DURATION_MS; // neutralize speed bonus for a clean streak-only comparison
    room.submitGuess(guesserId, room.currentPrompt);
    room.endGuessing(); // force reveal without waiting on the other two guessers
    scoresByRound.push(room.players.get(guesserId).score);
    room.finishReveal(); // updates streaks and advances to the next round
  }

  // Each subsequent round's gain should grow by STREAK_BONUS_PER_LEVEL as the streak builds.
  for (let i = 1; i < scoresByRound.length; i += 1) {
    const gain = scoresByRound[i] - scoresByRound[i - 1];
    const expectedGain = 100 + Math.min(i, MAX_STREAK_LEVEL) * STREAK_BONUS_PER_LEVEL;
    assert.equal(gain, expectedGain, `round ${i + 1}'s gain should reflect a streak of ${i}`);
  }
});

test('incorrect guess does not award points or change state', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, 'definitely not the prompt');
  assert.equal(guess.correct, false);
  assert.equal(room.players.get(guesserId).score, 0);
  assert.equal(room.state, GameState.GUESSING_ACTIVE);
});

test('guess matching is case/punctuation/whitespace insensitive', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  room.currentPrompt = 'A Lightsaber, Malfunctioning!';
  room.currentPromptAnswers = ['A Lightsaber, Malfunctioning!'];
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, '  a lightsaber malfunctioning  ');
  assert.equal(guess.correct, true);
});

test('guess matching treats hyphens as word separators', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  room.currentPrompt = 'Dial-up modem';
  room.currentPromptAnswers = ['Dial-up modem'];
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, 'dial up modem');
  assert.equal(guess.correct, true);
});

test('guess matching accepts a listed synonym, not just the exact prompt text', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  room.currentPrompt = 'Slot machine jackpot';
  room.currentPromptAnswers = ['Slot machine jackpot', 'slot machine', 'jackpot'];
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, 'jackpot');
  assert.equal(guess.correct, true, 'a synonym should count as correct even though it is not the full prompt text');
});

test('selectPrompt populates currentPromptAnswers from the chosen option\'s text and synonyms', () => {
  const room = makeRoom(3);
  room.startGame(room.hostId, 3, GAME_MODES[0]);
  const [chosen] = room.promptOptions;

  room.selectPrompt(room.actorId, chosen.text);

  assert.deepEqual(room.currentPromptAnswers, [chosen.text, ...chosen.synonyms]);
});

test('actor cannot submit a guess', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  assert.throws(() => room.submitGuess(room.actorId, 'anything'), /ACTOR_CANNOT_GUESS/);
});

test('a player cannot guess correctly twice', () => {
  const room = makeRoom(4);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  room.submitGuess(guesserId, room.currentPrompt);
  assert.throws(() => room.submitGuess(guesserId, room.currentPrompt), /ALREADY_GUESSED_CORRECTLY/);
});

test('non-actor cannot submit the recording', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  const [otherId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  assert.throws(() => room.submitRecording(otherId, 'ROBOT'), /NOT_ACTOR/);
});

test('invalid voice modifier is rejected', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  assert.throws(() => room.submitRecording(room.actorId, 'BANANA'), /INVALID_MODIFIER/);
});

test('actor rotates across rounds', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 5);
  const firstActor = room.actorId;
  room.submitRecording(firstActor, 'ROBOT');
  room.endGuessing();
  room.finishReveal();

  assert.notEqual(room.actorId, firstActor);
});

test('actor leaving mid-turn skips to the next turn rather than ending the game', () => {
  const room = makeRoom(4);
  startGameAndPickPrompt(room, 5);
  const actorId = room.actorId;
  room.submitRecording(actorId, 'ROBOT');

  room.removePlayer(actorId);

  assert.equal(room.state, GameState.PROMPT_SELECTION, 'game continues into the next turn');
  assert.equal(room.roundNumber, 1, 'still round 1 — only one of four players has gone so far');
  assert.notEqual(room.actorId, actorId);
});

test('actor leaving on the very last turn of the game ends it, rather than trying to start a round that does not exist', () => {
  const room = makeRoom(3);
  room.startGame(room.hostId, 1, GAME_MODES[0]); // 1 round == each of the 3 players gets exactly one turn

  // Play out everyone's turn except the very last player's.
  for (let turn = 0; turn < 2; turn += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }
  assert.equal(room.roundNumber, 1, 'still mid-round — not everyone has gone yet');

  // The final player's turn — they leave before it finishes.
  const lastActorId = room.actorId;
  room.removePlayer(lastActorId);

  assert.equal(
    room.state,
    GameState.GAME_OVER,
    'that was the last turn of the last round; the game should end, not try to start a nonexistent round',
  );
});

test('endGuessing forces reveal on timeout even if not everyone guessed', () => {
  const room = makeRoom(4);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  room.endGuessing();
  assert.equal(room.state, GameState.ROUND_REVEAL);
});

test('stateChange and playersChanged events fire', () => {
  const room = makeRoom(3);
  const events = [];
  room.on('stateChange', (e) => events.push(['stateChange', e.next]));
  room.on('playersChanged', () => events.push(['playersChanged']));

  room.startGame(room.hostId, 3, GAME_MODES[0]);
  // startGame resets scores (playersChanged) before dealing the first round (stateChange).
  assert.deepEqual(events[0], ['playersChanged']);
  assert.deepEqual(events[1], ['stateChange', GameState.PROMPT_SELECTION]);
});

// ---------- TELEPHONE mode ----------

test('TELEPHONE mode chain length scales with room size, always leaving at least one guesser', () => {
  const expected = { 3: 2, 4: 2, 5: 3, 6: 3, 8: 4 };
  for (const [size, chainLength] of Object.entries(expected)) {
    const room = makeRoom(Number(size));
    room.startGame(room.hostId, 1, 'TELEPHONE');
    assert.equal(room.chainOrder.length, chainLength, `room of ${size} should have a chain of ${chainLength}`);
    assert.ok(room.chainOrder.length < room.playerCount, 'at least one guesser must remain');
  }
});

test('TELEPHONE mode forces the DISTORT modifier and rejects any other', () => {
  const room = makeRoom(4);
  room.startGame(room.hostId, 3, 'TELEPHONE');
  pickPrompt(room);
  assert.throws(() => room.submitRecording(room.actorId, 'ROBOT'), /INVALID_MODIFIER/);
  room.submitRecording(room.actorId, 'DISTORT'); // should not throw
  assert.equal(room.state, GameState.RELAY_RECORDING);
});

test('TELEPHONE mode relays through the whole chain before opening guessing', () => {
  const room = makeRoom(4); // chain length 2
  room.startGame(room.hostId, 3, 'TELEPHONE');
  const [originator, relayer] = room.chainOrder;

  pickPrompt(room);
  assert.equal(room.actorId, originator);

  room.submitRecording(originator, 'DISTORT');
  assert.equal(room.state, GameState.RELAY_RECORDING, 'more hops remain');
  assert.equal(room.actorId, relayer);

  room.submitRecording(relayer, 'DISTORT');
  assert.equal(room.state, GameState.GUESSING_ACTIVE, 'last hop opens guessing');
});

test('TELEPHONE mode: no chain member can guess, only outsiders can', () => {
  const room = makeRoom(4); // chain length 2 -> 2 guessers
  room.startGame(room.hostId, 3, 'TELEPHONE');
  const [originator, relayer] = room.chainOrder;
  const guessers = room.playerList.map((p) => p.id).filter((id) => !room.chainOrder.includes(id));
  assert.equal(guessers.length, 2);

  pickPrompt(room);
  room.submitRecording(originator, 'DISTORT');
  room.submitRecording(relayer, 'DISTORT');

  assert.throws(() => room.submitGuess(originator, room.currentPrompt), /ACTOR_CANNOT_GUESS/);
  assert.throws(() => room.submitGuess(relayer, room.currentPrompt), /ACTOR_CANNOT_GUESS/);

  const res = room.submitGuess(guessers[0], room.currentPrompt);
  assert.equal(res.correct, true);
});

test('TELEPHONE mode splits the actor-bonus among every chain member on a correct guess', () => {
  const room = makeRoom(4);
  room.startGame(room.hostId, 3, 'TELEPHONE');
  const [originator, relayer] = room.chainOrder;
  const guesser = room.playerList.map((p) => p.id).find((id) => !room.chainOrder.includes(id));

  pickPrompt(room);
  room.submitRecording(originator, 'DISTORT');
  room.submitRecording(relayer, 'DISTORT');
  room.submitGuess(guesser, room.currentPrompt);

  assert.equal(room.players.get(originator).score, 25);
  assert.equal(room.players.get(relayer).score, 25);
});

test('TELEPHONE mode requires everyone outside the chain to guess correctly before revealing', () => {
  const room = makeRoom(4); // chain length 2 -> 2 guessers
  room.startGame(room.hostId, 3, 'TELEPHONE');
  const [originator, relayer] = room.chainOrder;
  const [guesser1, guesser2] = room.playerList.map((p) => p.id).filter((id) => !room.chainOrder.includes(id));

  pickPrompt(room);
  room.submitRecording(originator, 'DISTORT');
  room.submitRecording(relayer, 'DISTORT');

  room.submitGuess(guesser1, room.currentPrompt);
  assert.equal(room.state, GameState.GUESSING_ACTIVE, 'one guesser left');

  room.submitGuess(guesser2, room.currentPrompt);
  assert.equal(room.state, GameState.ROUND_REVEAL, 'last guesser triggers reveal');
});

test('TELEPHONE mode rotates who starts the chain round to round', () => {
  const room = makeRoom(4);
  room.startGame(room.hostId, 3, 'TELEPHONE');
  const firstChain = [...room.chainOrder];

  pickPrompt(room);
  room.submitRecording(room.actorId, 'DISTORT');
  room.submitRecording(room.actorId, 'DISTORT'); // last hop -> GUESSING_ACTIVE
  room.endGuessing();
  room.finishReveal();

  assert.notDeepEqual(room.chainOrder, firstChain, 'the next round should draw a different chain');
});

test('TELEPHONE mode: any chain member disconnecting (not just the current relayer) aborts the round', () => {
  const room = makeRoom(6); // chain length 3
  room.startGame(room.hostId, 3, 'TELEPHONE');
  assert.equal(room.chainOrder.length, 3);
  const [originator, relayer1, relayer2] = room.chainOrder;

  pickPrompt(room);
  room.submitRecording(originator, 'DISTORT');
  assert.equal(room.actorId, relayer1);
  assert.equal(room.state, GameState.RELAY_RECORDING);

  room.removePlayer(relayer2); // not currently active, but still in the chain
  assert.equal(room.state, GameState.PROMPT_SELECTION, 'round should abort rather than get stuck on a departed relayer');
  assert.equal(room.roundNumber, 1, 'still the same round — only one of six players has gone so far');
});

// ---------- PERFORMANCE mode ----------

test('PERFORMANCE mode: after recording, moves to RATING_ACTIVE instead of GUESSING_ACTIVE', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  room.submitRecording(room.actorId, 'ROBOT');
  assert.equal(room.state, GameState.RATING_ACTIVE);
});

test('PERFORMANCE mode: the actor cannot rate their own performance', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  const actorId = room.actorId;
  room.submitRecording(actorId, 'ROBOT');
  assert.throws(() => room.submitRating(actorId, 5), /ACTOR_CANNOT_RATE/);
});

test('PERFORMANCE mode: rejects out-of-range or non-integer ratings', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  room.submitRecording(room.actorId, 'ROBOT');
  const [rater] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  assert.throws(() => room.submitRating(rater, 0), /INVALID_RATING/);
  assert.throws(() => room.submitRating(rater, 6), /INVALID_RATING/);
  assert.throws(() => room.submitRating(rater, 3.5), /INVALID_RATING/);
});

test('PERFORMANCE mode: rejects a second rating from the same player', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  room.submitRecording(room.actorId, 'ROBOT');
  const [rater] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  room.submitRating(rater, 4);
  assert.throws(() => room.submitRating(rater, 2), /ALREADY_RATED/);
});

test('PERFORMANCE mode: awards the actor the rounded average stars once everyone has rated, and auto-reveals', () => {
  const room = makeRoom(3); // 1 actor, 2 raters
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  const actorId = room.actorId;
  room.submitRecording(actorId, 'ROBOT');
  const [rater1, rater2] = room.playerList.map((p) => p.id).filter((id) => id !== actorId);

  room.submitRating(rater1, 5);
  assert.equal(room.state, GameState.RATING_ACTIVE, 'one rater left');
  room.submitRating(rater2, 3);

  assert.equal(room.state, GameState.ROUND_REVEAL, 'last rater triggers reveal');
  assert.equal(room.players.get(actorId).score, 4 * POINTS_PER_STAR); // average of 5 and 3
});

test('PERFORMANCE mode: endRating() force-finishes with whatever ratings are in (timeout backstop)', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  const actorId = room.actorId;
  room.submitRecording(actorId, 'ROBOT');
  const [rater1] = room.playerList.map((p) => p.id).filter((id) => id !== actorId);

  room.submitRating(rater1, 5); // only one of two raters votes in time
  room.endRating();

  assert.equal(room.state, GameState.ROUND_REVEAL);
  assert.equal(room.players.get(actorId).score, 5 * POINTS_PER_STAR);
});

test('PERFORMANCE mode: endRating() with zero ratings scores nothing rather than throwing', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  const actorId = room.actorId;
  room.submitRecording(actorId, 'ROBOT');

  room.endRating();

  assert.equal(room.state, GameState.ROUND_REVEAL);
  assert.equal(room.players.get(actorId).score, 0);
});

test('PERFORMANCE mode: streaks are not tracked — everyone stays at 0 after reveal', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  const actorId = room.actorId;
  room.submitRecording(actorId, 'ROBOT');
  const raters = room.playerList.map((p) => p.id).filter((id) => id !== actorId);
  for (const rater of raters) room.submitRating(rater, 4);

  room.finishReveal();

  for (const player of room.playerList) {
    assert.equal(player.streak, 0);
  }
});

test('PERFORMANCE mode: a round ends and the next begins only once every player has performed once', () => {
  const room = makeRoom(3);
  room.startGame(room.hostId, 5, 'PERFORMANCE');
  const firstActor = room.actorId;

  for (let i = 0; i < 2; i += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    const raters = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
    for (const rater of raters) room.submitRating(rater, 3);
    room.finishReveal();
  }
  assert.equal(room.roundNumber, 1, 'everyone in a 3-player room needs 3 turns to complete round 1');

  pickPrompt(room);
  room.submitRecording(room.actorId, 'ROBOT');
  const raters = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  for (const rater of raters) room.submitRating(rater, 3);
  room.finishReveal();

  assert.equal(room.roundNumber, 2, 'round 2 begins once everyone has performed once');
  assert.equal(room.actorId, firstActor, 'the rotation wraps back around to whoever went first');
});

// ---------- host controls ----------

test('the first player added becomes host', () => {
  const room = new Room('TEST');
  assert.equal(room.hostId, null, 'no host until someone joins');
  room.addPlayer('p0', 'Player0');
  assert.equal(room.hostId, 'p0');
  room.addPlayer('p1', 'Player1');
  assert.equal(room.hostId, 'p0', 'later joiners do not take over host');
});

test('host reassigns to whoever is left when the host leaves deliberately', () => {
  const room = makeRoom(3);
  assert.equal(room.hostId, 'p0');
  room.removePlayer('p0');
  assert.equal(room.hostId, 'p1', 'reassigns to the next player in the roster');
});

test('host reassigns even when the host leaving mid-round also aborts the round', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  const hostId = room.hostId;
  assert.equal(room.actorId, hostId, "round 1's actor is the host (first player, first turn)");
  room.submitRecording(hostId, 'ROBOT');

  room.removePlayer(hostId);

  assert.notEqual(room.hostId, hostId);
  assert.equal(room.state, GameState.PROMPT_SELECTION, 'round aborts and moves on as usual');
});

test('hostId is unaffected by a non-host leaving', () => {
  const room = makeRoom(3);
  room.removePlayer('p1');
  assert.equal(room.hostId, 'p0');
});

test('a banned (kicked) player cannot rejoin the room', () => {
  const room = makeRoom(3);
  room.kickPlayer('p0', 'p1');
  assert.throws(() => room.addPlayer('p1', 'Player1'), /KICKED/);
});

test('startGame rejects a non-host requester', () => {
  const room = makeRoom(3);
  assert.throws(() => room.startGame('p1', 3, GAME_MODES[0]), /NOT_HOST/);
  assert.equal(room.state, GameState.LOBBY, 'rejected start leaves the room untouched');
});

test('kickPlayer removes the target and prevents them from acting again', () => {
  const room = makeRoom(3);
  room.kickPlayer(room.hostId, 'p1');
  assert.equal(room.players.has('p1'), false);
  assert.equal(room.playerCount, 2);
});

test('kickPlayer rejects a non-host requester', () => {
  const room = makeRoom(3);
  assert.throws(() => room.kickPlayer('p1', 'p2'), /NOT_HOST/);
});

test('kickPlayer rejects the host trying to kick themselves', () => {
  const room = makeRoom(3);
  assert.throws(() => room.kickPlayer(room.hostId, room.hostId), /CANNOT_KICK_SELF/);
});

test('kickPlayer rejects an unknown target', () => {
  const room = makeRoom(3);
  assert.throws(() => room.kickPlayer(room.hostId, 'not-a-real-id'), /UNKNOWN_PLAYER/);
});

test('transferHost moves hostId to the target', () => {
  const room = makeRoom(3);
  room.transferHost(room.hostId, 'p1');
  assert.equal(room.hostId, 'p1');
});

test('transferHost rejects a non-host requester', () => {
  const room = makeRoom(3);
  assert.throws(() => room.transferHost('p1', 'p2'), /NOT_HOST/);
});

test('transferHost rejects transferring to the current host', () => {
  const room = makeRoom(3);
  assert.throws(() => room.transferHost(room.hostId, room.hostId), /ALREADY_HOST/);
});

test('transferHost rejects an unknown target', () => {
  const room = makeRoom(3);
  assert.throws(() => room.transferHost(room.hostId, 'not-a-real-id'), /UNKNOWN_PLAYER/);
});

test('host persists across returnToLobby/startGame (a new game in the same room keeps the same host)', () => {
  const room = makeRoom(3);
  const hostId = room.hostId;
  const totalTurns = 3 * room.playerCount;
  room.startGame(hostId, 3, GAME_MODES[0]);
  for (let turn = 1; turn <= totalTurns; turn += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }
  assert.equal(room.state, GameState.GAME_OVER);

  room.returnToLobby();

  assert.equal(room.hostId, hostId, 'host carries over into the reconfigured game');
});

// -- spectators (mid-game joins) --

test('joining during LOBBY or GAME_OVER is a normal (non-spectating) join', () => {
  const lobbyRoom = makeRoom(2);
  lobbyRoom.addPlayer('joiner', 'Joiner');
  assert.equal(lobbyRoom.players.get('joiner').spectating, false);
  assert.ok(lobbyRoom.actorOrder.includes('joiner'));

  const room = makeRoom(3);
  room.startGame(room.hostId, 1, GAME_MODES[0]);
  for (let turn = 0; turn < 3; turn += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }
  assert.equal(room.state, GameState.GAME_OVER);
  room.addPlayer('joiner2', 'Joiner2');
  assert.equal(room.players.get('joiner2').spectating, false);
  assert.ok(room.actorOrder.includes('joiner2'));
});

test('joining mid-game marks the player as spectating and keeps them out of the actor rotation', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.addPlayer('latecomer', 'Latecomer');

  const player = room.players.get('latecomer');
  assert.equal(player.spectating, true);
  assert.ok(!room.actorOrder.includes('latecomer'), 'not in the rotation yet');
});

test('a spectator cannot guess', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.addPlayer('latecomer', 'Latecomer');
  room.submitRecording(room.actorId, 'ROBOT');

  assert.throws(() => room.submitGuess('latecomer', room.currentPrompt), /SPECTATING/);
});

test('a spectator cannot rate in PERFORMANCE mode', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  room.addPlayer('latecomer', 'Latecomer');
  room.submitRecording(room.actorId, 'ROBOT');

  assert.throws(() => room.submitRating('latecomer', 4), /SPECTATING/);
});

test('a round completes via everyoneGuessed without waiting on a spectator to guess', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.addPlayer('latecomer', 'Latecomer');
  room.submitRecording(room.actorId, 'ROBOT');

  const guessers = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId && id !== 'latecomer');
  assert.equal(guessers.length, 2);

  room.submitGuess(guessers[0], room.currentPrompt);
  assert.equal(room.state, GameState.GUESSING_ACTIVE, 'still waiting on the second eligible guesser');

  room.submitGuess(guessers[1], room.currentPrompt);
  assert.equal(
    room.state,
    GameState.ROUND_REVEAL,
    'round ends once both eligible guessers got it — the spectator is not counted in the denominator',
  );
});

test('PERFORMANCE mode: rating finishes without waiting on a spectator to rate', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3, 'PERFORMANCE');
  room.addPlayer('latecomer', 'Latecomer');
  room.submitRecording(room.actorId, 'ROBOT');

  const raters = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId && id !== 'latecomer');
  assert.equal(raters.length, 2);

  room.submitRating(raters[0], 4);
  assert.equal(room.state, GameState.RATING_ACTIVE);

  room.submitRating(raters[1], 5);
  assert.equal(
    room.state,
    GameState.ROUND_REVEAL,
    'finishes once both eligible raters voted — the spectator is not counted in the denominator',
  );
});

test('TELEPHONE mode chain length is unaffected by a mid-round spectator', () => {
  const room = makeRoom(4); // chain length 2 with no spectators
  room.startGame(room.hostId, 3, 'TELEPHONE');
  const [originator, relayer] = room.chainOrder;
  pickPrompt(room);
  room.submitRecording(originator, 'DISTORT');
  room.submitRecording(relayer, 'DISTORT'); // opens guessing; round 1 not done (2 of 4 have gone)

  room.addPlayer('latecomer', 'Latecomer'); // joins as a spectator mid-round, not in actorOrder

  room.endGuessing();
  room.finishReveal(); // starts round 1's next turn

  assert.equal(
    room.chainOrder.length,
    2,
    'chain length still derived from the 4 active rotation members, not inflated by the spectator',
  );
  assert.ok(!room.chainOrder.includes('latecomer'), 'spectator never dealt into the chain');
});

test('a spectator is promoted into the rotation at the next round boundary', () => {
  const room = makeRoom(3);
  room.startGame(room.hostId, 3, GAME_MODES[0]);
  room.addPlayer('latecomer', 'Latecomer'); // joins during round 1, before anyone's turn is done

  for (let turn = 1; turn <= 3; turn += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }

  const player = room.players.get('latecomer');
  assert.equal(player.spectating, false, 'promoted once round 1 finished and round 2 began');
  assert.ok(room.actorOrder.includes('latecomer'));
});

test('a spectator who joins during the final round is promoted once the room returns to LOBBY', () => {
  const room = makeRoom(3);
  room.startGame(room.hostId, 1, GAME_MODES[0]); // 1 round == 3 turns, so this is already the final round

  // Play out the first two turns normally.
  for (let i = 0; i < 2; i += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }

  // Spectator joins during the third and final turn — no future round
  // boundary will ever come along in this game to promote them via
  // _startNextTurn's usual path.
  pickPrompt(room);
  room.addPlayer('latecomer', 'Latecomer');
  room.submitRecording(room.actorId, 'ROBOT');
  room.endGuessing();
  room.finishReveal();

  assert.equal(room.state, GameState.GAME_OVER);
  assert.equal(
    room.players.get('latecomer').spectating,
    true,
    'still benched at GAME_OVER — no round boundary occurred',
  );

  room.returnToLobby();

  assert.equal(room.players.get('latecomer').spectating, false, 'promoted once back in LOBBY');
  assert.ok(room.actorOrder.includes('latecomer'));
});
