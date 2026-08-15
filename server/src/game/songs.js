// Curated song pool for the song-recreation game mode (working name TBD —
// not yet wired into Room.js/RoomManager). Each entry needs both title and
// artist since they're scored independently — see the composer-prototype
// design notes. Mostly late-2010s/2020s hits plus hip-hop/R&B and well-known
// indie, so they're recognizable to the game's players, with a short list of
// only the most universally-known classics (not deep cuts). Skips
// duets/multi-headliner tracks (e.g. "Stay", "APT.") and explicit-titled
// songs to keep artist-matching unambiguous and the pool broadly shareable.

function s(title, artist) {
  return { title, artist };
}

const CLASSIC_ROCK_AND_POP = [
  s('Bohemian Rhapsody', 'Queen'),
  s('Billie Jean', 'Michael Jackson'),
  s('Thriller', 'Michael Jackson'),
  s("Don't Stop Believin'", 'Journey'),
  s("Livin' on a Prayer", 'Bon Jovi'),
  s('Dancing Queen', 'ABBA'),
  s('Hotel California', 'Eagles'),
  s('Smells Like Teen Spirit', 'Nirvana'),
  s('I Wanna Dance with Somebody', 'Whitney Houston'),
  s('Eye of the Tiger', 'Survivor'),
  s('Rolling in the Deep', 'Adele'),
  s('Uptown Funk', 'Bruno Mars'),
  s('Poker Face', 'Lady Gaga'),
  s('Roar', 'Katy Perry'),
  s('Umbrella', 'Rihanna'),
  s('Toxic', 'Britney Spears'),
  s('Since U Been Gone', 'Kelly Clarkson'),
  s('Party in the U.S.A.', 'Miley Cyrus'),
  s('I Want It That Way', 'Backstreet Boys'),
  s('Wannabe', 'Spice Girls'),
  s('Call Me Maybe', 'Carly Rae Jepsen'),
  s('Shake It Off', 'Taylor Swift'),
  s('Firework', 'Katy Perry'),
];

const CLASSIC_HIP_HOP_AND_RNB = [
  s('Lose Yourself', 'Eminem'),
  s('In Da Club', '50 Cent'),
  s('No Scrubs', 'TLC'),
  s('Crazy in Love', 'Beyoncé'),
  s('Hey Ya!', 'OutKast'),
  s('Gold Digger', 'Kanye West'),
  s('Empire State of Mind', 'Jay-Z'),
  s('I Will Always Love You', 'Whitney Houston'),
  s('I Gotta Feeling', 'The Black Eyed Peas'),
  s('Ms. Jackson', 'OutKast'),
];

const POP_2017_2025 = [
  s('Shape of You', 'Ed Sheeran'),
  s('Havana', 'Camila Cabello'),
  s('Perfect', 'Ed Sheeran'),
  s("God's Plan", 'Drake'),
  s('Sicko Mode', 'Travis Scott'),
  s('Sunflower', 'Post Malone'),
  s('Old Town Road', 'Lil Nas X'),
  s('Bad Guy', 'Billie Eilish'),
  s('Truth Hurts', 'Lizzo'),
  s('Someone You Loved', 'Lewis Capaldi'),
  s('Circles', 'Post Malone'),
  s('Dance Monkey', 'Tones and I'),
  s('Blinding Lights', 'The Weeknd'),
  s('Watermelon Sugar', 'Harry Styles'),
  s('Levitating', 'Dua Lipa'),
  s('Drivers License', 'Olivia Rodrigo'),
  s('Good 4 U', 'Olivia Rodrigo'),
  s('Montero', 'Lil Nas X'),
  s('Peaches', 'Justin Bieber'),
  s('Industry Baby', 'Lil Nas X'),
  s('Easy On Me', 'Adele'),
  s('As It Was', 'Harry Styles'),
  s('Anti-Hero', 'Taylor Swift'),
  s('About Damn Time', 'Lizzo'),
  s('Flowers', 'Miley Cyrus'),
  s('Cruel Summer', 'Taylor Swift'),
  s('Vampire', 'Olivia Rodrigo'),
  s('Kill Bill', 'SZA'),
  s('Paint The Town Red', 'Doja Cat'),
  s('Espresso', 'Sabrina Carpenter'),
  s('Please Please Please', 'Sabrina Carpenter'),
  s('Not Like Us', 'Kendrick Lamar'),
  s('Birds of a Feather', 'Billie Eilish'),
  s('Texas Hold Em', 'Beyoncé'),
  s('Good Luck, Babe!', 'Chappell Roan'),
];

const HIP_HOP_AND_RNB_2017_2025 = [
  s('HUMBLE.', 'Kendrick Lamar'),
  s('In My Feelings', 'Drake'),
  s('Hotline Bling', 'Drake'),
  s('Rockstar', 'Post Malone'),
  s('Bad and Boujee', 'Migos'),
  s('Mask Off', 'Future'),
  s('XO Tour Llif3', 'Lil Uzi Vert'),
  s('Panda', 'Desiigner'),
  s('Bodak Yellow', 'Cardi B'),
  s('Say So', 'Doja Cat'),
  s('Savage', 'Megan Thee Stallion'),
  s('Formation', 'Beyoncé'),
  s('Halo', 'Beyoncé'),
  s('One Dance', 'Drake'),
  s("Can't Feel My Face", 'The Weeknd'),
  s('Starboy', 'The Weeknd'),
  s('Super Bass', 'Nicki Minaj'),
  s('Anaconda', 'Nicki Minaj'),
  s('7 Rings', 'Ariana Grande'),
  s('Thank U, Next', 'Ariana Grande'),
  s('Into You', 'Ariana Grande'),
  s('Redbone', 'Childish Gambino'),
  s('This Is America', 'Childish Gambino'),
  s('Stronger', 'Kanye West'),
];

const WELL_KNOWN_INDIE = [
  s('Mr. Brightside', 'The Killers'),
  s('Seven Nation Army', 'The White Stripes'),
  s('Kids', 'MGMT'),
  s('505', 'Arctic Monkeys'),
  s('Dog Days Are Over', 'Florence + the Machine'),
  s('Pumped Up Kicks', 'Foster the People'),
  s('Riptide', 'Vance Joy'),
  s('Somebody That I Used to Know', 'Gotye'),
];

// TV/movie theme songs — mostly instrumental, which is a natural fit for
// this mode since there's no vocal melody to worry about recreating, just
// the theme itself. Unlike every other bucket, "well-known" here has to hold
// for BOTH halves independently (title recognition from the melody doesn't
// carry over to knowing who wrote it) — so this trims hard to only themes
// whose composer/artist is itself a broadly recognized name (John Williams,
// Hans Zimmer, John Carpenter, Will Smith), not just genre-canon-famous
// (Lalo Schifrin, Ramin Djawadi, Bill Conti, John Barry, Henry Mancini, Gary
// Portnoy, The Rembrandts) or a title-only obscure/mismatched name (Danny
// Elfman for The Simpsons — well known for other work, not that credit).
// Also drops Stranger Things (Kyle Dixon & Michael Stein) for being a
// two-person credit, same duet/multi-headliner exclusion every other bucket
// already applies.
const THEME_SONGS = [
  s('Fresh Prince of Bel-Air', 'Will Smith'),
  s('Star Wars Main Theme', 'John Williams'),
  s('Jaws Theme', 'John Williams'),
  s('Jurassic Park Theme', 'John Williams'),
  s('Raiders March', 'John Williams'),
  s('He’s a Pirate', 'Hans Zimmer'),
  s('Halloween Theme', 'John Carpenter'),
  s('The Mandalorian Theme', 'Ludwig Göransson'),
];

// Video game music — kept to only the handful with real mainstream
// crossover (not just fame within gaming culture), per the lesson learned
// from indie/hip-hop picks earlier: genre-canon iconic isn't the same bar
// as broadly recognizable. Flagged for a recognizability check.
const VIDEO_GAME_THEMES = [
  s('Super Mario Bros. Theme', 'Koji Kondo'),
  s('The Legend of Zelda Theme', 'Koji Kondo'),
  s('Tetris Theme', 'Hirokazu Tanaka'),
  s('Pokémon Theme', 'Jason Paige'),
  s('Sweden', 'C418'),
  s('Megalovania', 'Toby Fox'),
  s('Still Alive', 'Jonathan Coulton'),
  s('Halo Theme', 'Martin O’Donnell'),
];

export const SONGS = [
  ...CLASSIC_ROCK_AND_POP,
  ...CLASSIC_HIP_HOP_AND_RNB,
  ...POP_2017_2025,
  ...HIP_HOP_AND_RNB_2017_2025,
  ...WELL_KNOWN_INDIE,
  ...THEME_SONGS,
  ...VIDEO_GAME_THEMES,
];
