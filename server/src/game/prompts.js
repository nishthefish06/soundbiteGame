export const PromptCategory = Object.freeze({
  SOUND_EFFECT: 'SOUND_EFFECT',
  CHARACTER: 'CHARACTER',
});

// A prompt's `text` is both what the actor sees to act out and the primary
// accepted guess. `synonyms` covers other short phrasings a guesser would
// genuinely type instead — e.g. "slot machine jackpot" could reasonably be
// guessed as "slot machine" or just "jackpot". Keep text itself as short as
// the actual expected guess: a full descriptive sentence ("A dial-up modem
// connecting") is what the actor is told to *perform*, not what anyone
// actually types back, so the display/guess gap is the bug, not the fix.
function p(text, ...synonyms) {
  return { text, synonyms };
}

const OBJECT_SOUNDS = [
  p('Dial-up modem', 'dial up', 'modem connecting'),
  p('Car that won’t start', 'car engine', 'engine won’t start'),
  p('Doorbell'),
  p('Breaking glass', 'glass shattering'),
  p('Vacuum cleaner'),
  p('Dripping faucet', 'leaky faucet'),
  p('Alarm clock'),
  p('Phone ringing', 'old phone ringing'),
  p('Blender'),
  p('Zipper'),
  p('Creaky door', 'squeaky door'),
  p('Fire truck siren', 'siren', 'fire truck'),
  p('Camera shutter', 'camera click'),
  p('Bubble wrap'),
  p('Dial tone'),
  p('Microwave beeping'),
  p('Washing machine'),
  p('Velcro'),
  p('Cork popping', 'popping a cork'),
  p('Typewriter'),
  p('Coffee maker brewing', 'coffee machine'),
  p('Toaster popping', 'toast popping up'),
  p('Ice cubes in a glass', 'ice in a drink'),
  p('Soda can opening', 'cracking open a soda', 'can opening'),
  p('Static on an old TV', 'tv static'),
  p('Cash register', 'register', 'cha ching'),
  p('Keyboard typing', 'typing'),
  p('Car horn', 'honking', 'car horn honking'),
  p('Windshield wipers'),
  p('Pinball machine', 'pinball'),
  p('Referee’s whistle', 'referee whistle', 'whistle blowing'),
  p('Bike bell', 'bicycle bell'),
  p('Elevator ding', 'elevator'),
  p('Popcorn popping', 'popcorn'),
];

const MOVIE_SOUNDS = [
  p('Lightsaber', 'lightsaber turning on'),
  p('Explosion'),
  p('Jaws theme', 'shark music', 'dun dun dun dun'),
  p('Record scratch'),
  p('Drumroll'),
  p('Mario coin sound', 'coin sound', 'video game coin'),
  p('Slot machine jackpot', 'slot machine', 'jackpot'),
  p('Superhero landing'),
  p('Magic spell', 'wizard spell'),
  p('Cowboy whistle', 'western whistle'),
  p('Computer booting up', 'computer starting up'),
  p('Game show buzzer', 'wrong answer buzzer'),
  p('Anvil dropping', 'anvil falling'),
  p('UFO landing', 'flying saucer'),
  p('Time machine'),
  p('Cartoon boing', 'spring boing'),
  p('Movie trailer voice', 'in a world'),
  p('Evil laugh', 'villain laugh'),
  p('Kung fu yell', 'karate yell'),
  p('Countdown beeping', 'bomb countdown'),
  p('Sword clash', 'sword fight', 'swords clashing'),
  p('Cannon fire', 'cannon', 'cannon blast'),
  p('Dinosaur roar', 'dinosaur', 't rex roar'),
  p('Robot transforming', 'transformer', 'transforming robot'),
  p('Ghost saying boo', 'ghost boo', 'haunted ghost'),
  p('Werewolf howl', 'werewolf howling'),
  p('Zombie groan', 'zombie moan', 'zombie groaning'),
  p('Pac-Man chomping sound', 'pac man', 'pacman'),
  p('8-bit game over sound', 'game over sound'),
  p('Spaceship taking off', 'rocket ship launch'),
  p('Dragon roar', 'dragon roaring'),
  p('Paparazzi camera flash', 'camera flash', 'paparazzi'),
  p('Dramatic orchestra sting', 'dramatic sting', 'orchestra hit'),
];

const ACTION_SOUNDS = [
  p('Sneeze', 'sneezing'),
  p('Snoring'),
  p('Burp', 'burping'),
  p('Laughing', 'laughing hysterically'),
  p('Crying'),
  p('Karate chop', 'hiya'),
  p('Slow clap', 'applause'),
  p('Chugging a drink'),
  p('Yawning'),
  p('Cracking knuckles'),
  p('Hiccups', 'getting the hiccups'),
  p('Screaming on a rollercoaster'),
  p('Chattering teeth'),
  p('Gasping', 'startled gasp'),
  p('Talking with your mouth full'),
  p('Whistling'),
  p('Blowing a raspberry'),
  p('Falling down the stairs'),
  p('Waking up and stretching', 'morning groan'),
  p('Crunching chips', 'eating chips loudly'),
  p('Clapping'),
  p('Stomping your feet', 'stomping'),
  p('Kissing sound', 'a kiss', 'smooch'),
  p('Slurping noodles', 'slurping'),
  p('Coughing'),
  p('Snapping your fingers', 'finger snap', 'snapping fingers', 'snapping', 'finger snapping'),
  p('Humming a tune', 'humming'),
  p('Gargling mouthwash', 'gargling'),
  p('Sighing heavily', 'sighing'),
  p('Panting after running', 'panting', 'out of breath'),
  p('Growling angrily', 'growling'),
  p('Purring like a cat', 'cat purring'),
  p('Barking like a dog', 'dog barking'),
];

const SOUND_EFFECT_PROMPTS = [...OBJECT_SOUNDS, ...MOVIE_SOUNDS, ...ACTION_SOUNDS];

// Real, widely-known characters with genuinely distinct, commonly-impersonated
// voices — the whole point is that a disguised-voice impression of these is
// actually attemptable and actually recognizable, unlike a generic archetype
// ("a pirate") that has no one specific voice to land. synonyms cover the
// short name people actually say instead of the full one.
const CHARACTER_PROMPTS = [
  p('Darth Vader', 'vader'),
  p('Yoda'),
  p('SpongeBob SquarePants', 'spongebob'),
  p('Homer Simpson', 'homer'),
  p('Kermit the Frog', 'kermit'),
  p('Mickey Mouse', 'mickey'),
  p('Donald Duck', 'donald'),
  p('Scooby-Doo', 'scooby'),
  p('Shrek'),
  p('Elmo'),
  p('Cookie Monster'),
  p('Peter Griffin', 'peter'),
  p('Bugs Bunny', 'bugs'),
  p('Daffy Duck', 'daffy'),
  p('Popeye'),
  p('Goofy'),
  p('Patrick Star', 'patrick'),
  p('Winnie the Pooh', 'pooh', 'pooh bear'),
  p('Gollum'),
  p('The Joker', 'joker'),
  p('Dora the Explorer', 'dora'),
  p('Tony the Tiger', 'tony'),
  p('Yogi Bear', 'yogi'),
  p('Stitch'),
  p('Woody'),
  p('Buzz Lightyear', 'buzz'),
  p('Mater'),
  p('Lightning McQueen', 'mcqueen'),
  p('Olaf'),
  p('Genie'),
  p('Simba'),
  p('Timon'),
  p('Scar'),
  p('Ursula'),
  p('Baloo'),
  p('Dory'),
  p('Nemo'),
  p('Sulley', 'sully'),
  p('Mike Wazowski', 'mike'),
  p('Remy'),
  p('WALL-E', 'walle'),
  p('Jack Sparrow', 'captain jack sparrow', 'captain jack'),
  p('C-3PO', 'c3po', '3po'),
  p('Chewbacca', 'chewy', 'chewie'),
  p('Elsa'),
  p('Baymax'),
  p('Groot', 'i am groot'),
  p('Rocket Raccoon', 'rocket'),
  p('Po'),
  p('Donkey'),
  p('Puss in Boots', 'puss'),
  p('Gru'),
  p('Minion', 'minions'),
  p('Squidward'),
  p('Mr. Krabs'),
  p('Plankton'),
  p('Dexter'),
  p('Johnny Bravo', 'johnny'),
  p('Jake the Dog', 'jake'),
  p('Elmer Fudd', 'elmer'),
  p('Tweety Bird', 'tweety'),
  p('Sylvester the Cat', 'sylvester'),
  p('Porky Pig', 'porky'),
  p('Wile E. Coyote', 'the coyote'),
  p('Foghorn Leghorn', 'foghorn'),
  p('Pepe Le Pew', 'pepe'),
  p('Yosemite Sam'),
  p('Marvin the Martian', 'marvin'),
  p('Fred Flintstone', 'fred'),
  p('Miss Piggy', 'piggy'),
  p('Fozzie Bear', 'fozzie'),
  p('Gonzo'),
  p('Big Bird'),
  p('Bert'),
  p('Ernie'),
  p('Oscar the Grouch', 'oscar'),
  p('Grover'),
  p('Batman'),
  p('Hulk', 'the hulk', 'incredible hulk'),
  p('Deadpool'),
  p('Freddy Krueger', 'freddy'),
  p('Dracula', 'count dracula'),
  p('The Grinch', 'grinch'),
  p('Mario', 'super mario'),
  p('Luigi'),
  p('Sonic the Hedgehog', 'sonic'),
  p('Pikachu'),
  p('Kirby'),
  p('Bart Simpson', 'bart'),
  p('Ned Flanders', 'ned', 'flanders'),
  p('Mr. Burns', 'montgomery burns'),
  p('Stewie Griffin', 'stewie'),
  p('Santa Claus', 'santa', 'father christmas'),
  p('The Cat in the Hat', 'cat in the hat'),
  p('Alvin', 'alvin and the chipmunks'),
  p('Charlie Brown', 'charlie'),
  p('Shaggy'),
  p('The Terminator', 'terminator'),
  p('Rocky Balboa', 'rocky'),
  p('Forrest Gump', 'forrest'),
];

const PROMPTS_BY_CATEGORY = {
  [PromptCategory.SOUND_EFFECT]: SOUND_EFFECT_PROMPTS,
  [PromptCategory.CHARACTER]: CHARACTER_PROMPTS,
};

// Game modes are 1:1 with prompt categories — picking a mode just picks which
// pool a round's prompts come from. Kept as its own export (rather than reusing
// PromptCategory directly at call sites) so a future mode that isn't just "a
// category" doesn't require touching every import.
export const GAME_MODES = Object.values(PromptCategory);

// Each mode keeps its own shuffled deck so, e.g., exhausting Sound Effect
// prompts doesn't affect the Character pool. Deals { text, synonyms } objects
// through to Room — text is shown/selected on, synonyms only ever matter for
// matching a guess once that prompt is actually chosen.
export function createPromptDeck(category) {
  const deck = [...PROMPTS_BY_CATEGORY[category]];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function createPromptDecks() {
  return Object.fromEntries(GAME_MODES.map((mode) => [mode, createPromptDeck(mode)]));
}
