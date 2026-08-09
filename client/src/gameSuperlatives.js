// Lightweight post-game "superlatives" shown on GameOverView. Purely derived
// from data useGameRoom.js already collects client-side (roundHistory +
// final players) — no server changes, nothing persisted beyond the game.
//
// roundHistory entries only ever record who performed and who guessed
// *correctly* each round (see useGameRoom.buildHistoryEntry) — there's no
// record of who guessed wrong or who was still spectating that round. The
// streak reconstruction below approximates "was eligible but missed" as
// "in the final players list, wasn't a performer that round, and isn't in
// that round's correct-guesser list" — close enough for a lighthearted stat,
// not wired into actual scoring.
export function computeSuperlatives(roundHistory, players) {
  const guessingRounds = roundHistory.filter((r) => r.mode !== 'PERFORMANCE');

  const firstGuessCounts = new Map();
  const totalGuessCounts = new Map();
  for (const round of guessingRounds) {
    round.correctGuesserNames.forEach((name, i) => {
      totalGuessCounts.set(name, (totalGuessCounts.get(name) ?? 0) + 1);
      if (i === 0) firstGuessCounts.set(name, (firstGuessCounts.get(name) ?? 0) + 1);
    });
  }

  const currentStreaks = new Map();
  const bestStreaks = new Map();
  for (const round of guessingRounds) {
    const performers = new Set(round.performerNames);
    for (const player of players) {
      if (performers.has(player.name)) continue; // streak carries over untouched, same as Room._updateStreaks
      const hit = round.correctGuesserNames.includes(player.name);
      const next = hit ? (currentStreaks.get(player.name) ?? 0) + 1 : 0;
      currentStreaks.set(player.name, next);
      bestStreaks.set(player.name, Math.max(bestStreaks.get(player.name) ?? 0, next));
    }
  }

  const ratingTotals = new Map(); // name -> { sum, count }
  const performanceCounts = new Map();
  for (const round of roundHistory) {
    round.performerNames.forEach((name) => {
      performanceCounts.set(name, (performanceCounts.get(name) ?? 0) + 1);
    });
    for (const { name, stars } of round.ratings) {
      const totals = ratingTotals.get(name) ?? { sum: 0, count: 0 };
      totals.sum += stars;
      totals.count += 1;
      ratingTotals.set(name, totals);
    }
  }

  const superlatives = [];

  const fastest = topEntry(firstGuessCounts);
  if (fastest && fastest.value > 0) {
    superlatives.push({
      key: 'fastest',
      emoji: '⚡',
      title: 'Fastest Fingers',
      name: fastest.name,
      detail: `first to guess ${fastest.value} time${fastest.value === 1 ? '' : 's'}`,
    });
  }

  const sharpshooter = topEntry(totalGuessCounts);
  if (sharpshooter && sharpshooter.value > 0) {
    superlatives.push({
      key: 'sharpshooter',
      emoji: '🎯',
      title: 'Sharpshooter',
      name: sharpshooter.name,
      detail: `${sharpshooter.value} correct guess${sharpshooter.value === 1 ? '' : 'es'}`,
    });
  }

  const streak = topEntry(bestStreaks);
  if (streak && streak.value > 1) {
    superlatives.push({
      key: 'streak',
      emoji: '🔥',
      title: 'Hot Streak',
      name: streak.name,
      detail: `${streak.value} rounds in a row`,
    });
  }

  const ratedNames = [...ratingTotals.entries()].map(([name, { sum, count }]) => ({ name, value: sum / count }));
  const crowdFavorite = topEntry(new Map(ratedNames.map(({ name, value }) => [name, value])));
  if (crowdFavorite) {
    superlatives.push({
      key: 'crowd',
      emoji: '🎭',
      title: 'Crowd Favorite',
      name: crowdFavorite.name,
      detail: `${crowdFavorite.value.toFixed(1)}★ average`,
    });
  } else {
    const mostPerformances = topEntry(performanceCounts);
    if (mostPerformances && mostPerformances.value > 0) {
      superlatives.push({
        key: 'crowd',
        emoji: '🎭',
        title: 'Center Stage',
        name: mostPerformances.name,
        detail: `performed ${mostPerformances.value} time${mostPerformances.value === 1 ? '' : 's'}`,
      });
    }
  }

  return superlatives;
}

function topEntry(counts) {
  let best = null;
  for (const [name, value] of counts) {
    if (!best || value > best.value) best = { name, value };
  }
  return best;
}
