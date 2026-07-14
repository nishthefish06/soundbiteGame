export const PROMPTS = [
  'A lightsaber malfunctioning',
  'A dial-up modem connecting',
  'A dragon ordering coffee',
  'A robot learning to dance',
  'A ghost haunting a vending machine',
  'A pirate sneezing',
  'A vampire at the dentist',
  'An alien trying human food for the first time',
  'A knight losing a sword fight to a squirrel',
  'A wizard whose spell backfires',
  'A dinosaur stuck in traffic',
  'A superhero who is afraid of heights',
  'A zombie doing yoga',
  'A mermaid on a first date',
  'A cowboy at a karaoke bar',
  'A snowman melting dramatically',
  'A cat pretending to be a lion',
  'A grandpa winning an arm wrestling match',
  'A baby dragon learning to breathe fire',
  'A detective interrogating a houseplant',
];

export function createPromptDeck() {
  const deck = [...PROMPTS];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
