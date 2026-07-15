// Kept deliberately simple: a clear, single sound/action that's easy to act
// out with just a disguised voice and easy for guessers to recognize —
// not a multi-part scenario that needs visual context to make sense.
export const PROMPTS = [
  'Sneezing really loudly',
  'Ordering pizza on the phone',
  'Laughing at a bad joke',
  'Crying over spilled milk',
  'Yawning in a boring meeting',
  'Cheering at a football game',
  'Complaining about the weather',
  'Singing in the shower',
  'Snoring loudly',
  'Coughing',
  'Whispering a secret',
  'Screaming on a rollercoaster',
  'Arguing with a GPS',
  'Praising a delicious meal',
  'Complaining about slow wifi',
  'Trying not to laugh',
  'Pretending to be asleep',
  'Talking with your mouth full',
  'Reacting to a jump scare',
  'Giving a weather forecast',
  'Hosting a cooking show',
  'An auctioneer selling something',
  'Reading the news',
  'Reading a bedtime story',
  'Losing an argument',
  'Winning the lottery',
  'Stepping on a Lego',
  'A drill sergeant yelling orders',
  'Ordering fast food through a broken speaker',
  'A baby crying for milk',
  'Complaining to customer service',
  'A toast at a wedding',
  'Rage-quitting a video game',
  'A sports commentator getting excited',
  'Answering the phone half asleep',
  'Counting sheep to fall asleep',
];

export function createPromptDeck() {
  const deck = [...PROMPTS];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
