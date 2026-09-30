// Shared data from the Sky Circuit modeling spec: world palette, teams,
// tire compounds, drivers and pit stop timing. Everything here is plain data
// so game logic and tests can import it without touching three.js.

export const PALETTE = {
  asphalt: '#3A3D42',
  kerbRed: '#D8312B',
  kerbWhite: '#F2F2EE',
  grass: '#6DB34A',
  cliff: '#A0714A',
  barrier: '#2B2F36',
  canopy: '#F4F5F7',
  carbon: '#1C1D20',
};

// Scenery palette: muted, painterly tones (warm haze, olive greens, dark
// earth) so the bright team liveries pop against it.
export const SCENERY = {
  skyTop: '#3E9BE6',
  skyMid: '#74BDF0',
  skyLow: '#A6D6F7',
  fog: '#8CCAF3',
  grassDark: '#4F7534',
  grass: '#6A9243',
  grassLight: '#8AAA57',
  meadow: '#9DB266',
  soil: '#5E4330',
  cliff: '#6E5039',
  cliffDark: '#35261C',
};

export const COMPOUNDS = {
  soft: { name: 'Soft', band: 'Red', hex: '#E03A3A' },
  medium: { name: 'Medium', band: 'Yellow', hex: '#F5C518' },
  hard: { name: 'Hard', band: 'White', hex: '#F2F2F2' },
  intermediate: { name: 'Intermediate', band: 'Green', hex: '#35B04A' },
  wet: { name: 'Wet', band: 'Blue', hex: '#2D7FF9' },
};

export const TEAMS = [
  {
    id: 'solaris',
    name: 'Solaris Racing',
    primary: '#F26B1D',
    secondary: '#25272B',
    accent: '#F4E9D8',
    numbers: [4, 17],
    motif: 'rays',
    launch: true,
  },
  {
    id: 'nordlys',
    name: 'Nordlys GP',
    primary: '#1FB5B0',
    secondary: '#F5FAFA',
    accent: '#0E2A47',
    numbers: [8, 21],
    motif: 'waves',
    launch: true,
  },
  {
    id: 'kestrel',
    name: 'Kestrel Motorsport',
    primary: '#5B2BB5',
    secondary: '#B7E23A',
    accent: '#151515',
    numbers: [11, 30],
    motif: 'chevrons',
    launch: true,
  },
  {
    id: 'ironbark',
    name: 'Ironbark Racing',
    primary: '#7A1F2B',
    secondary: '#EFE6D2',
    accent: '#B8893A',
    numbers: [6, 26],
    motif: 'pinstripes',
    launch: true,
  },
  {
    id: 'meridian',
    name: 'Meridian Works',
    primary: '#1E4FD8',
    secondary: '#C9CED6',
    accent: '#FFD23F',
    numbers: [3, 9],
    motif: 'grid',
    launch: false,
  },
];

export const teamById = (id) => TEAMS.find((t) => t.id === id);
// The four teams racing: a garage, two cars, drivers and a full crew each.
export const GRID = TEAMS.filter((t) => t.launch);

// Helmet: base color + one of the 8 shared patterns + pattern color.
export const DRIVERS = [
  { number: 4, name: 'Inés Calder', team: 'solaris', from: 'Spain', helmet: { base: '#25272B', pattern: 'rays', ink: '#F26B1D' }, line: 'Calm, precise, hates wasted laps', celebration: 'Slow bow to the grandstand', emote: 'bow' },
  { number: 17, name: 'Dario Veltri', team: 'solaris', from: 'Italy', helmet: { base: '#F4E9D8', pattern: 'split', ink: '#F26B1D' }, line: 'Loud, funny, crowd favorite', celebration: 'Air guitar on the car nose', emote: 'air_guitar' },
  { number: 8, name: 'Sigrid Holm', team: 'nordlys', from: 'Norway', helmet: { base: '#1FB5B0', pattern: 'waves', ink: '#F5FAFA' }, line: 'Quiet strategist, loves rain races', celebration: 'Points to the sky', emote: 'point_sky' },
  { number: 21, name: 'Ren Akimoto', team: 'nordlys', from: 'Japan', helmet: { base: '#F5FAFA', pattern: 'grid', ink: '#0E2A47' }, line: 'Data nerd, speaks in lap times', celebration: 'Bows, then a small fist pump', emote: 'bow' },
  { number: 11, name: 'Amara Okafor', team: 'kestrel', from: 'Nigeria', helmet: { base: '#5B2BB5', pattern: 'chevrons', ink: '#B7E23A' }, line: 'Fearless late braker', celebration: 'Standing jump on the podium', emote: 'jump' },
  { number: 30, name: 'Jonah Reyes', team: 'kestrel', from: 'Mexico', helmet: { base: '#151515', pattern: 'stars', ink: '#B7E23A' }, line: 'Rookie, wide eyed, eager', celebration: 'Hugs every crew member', emote: 'wave' },
  { number: 6, name: 'Oliver Bramwell', team: 'ironbark', from: 'United Kingdom', helmet: { base: '#7A1F2B', pattern: 'pinstripes', ink: '#EFE6D2' }, line: 'Old school, polite, dry humor', celebration: 'Tips an imaginary cap', emote: 'cap_tip' },
  { number: 26, name: 'Priya Raman', team: 'ironbark', from: 'India', helmet: { base: '#EFE6D2', pattern: 'checks', ink: '#B8893A' }, line: 'Methodical, loves setup work', celebration: 'Salutes the garage', emote: 'salute' },
  { number: 3, name: 'Luka Petrović', team: 'meridian', from: 'Croatia', helmet: { base: '#1E4FD8', pattern: 'grid', ink: '#FFD23F' }, line: 'Aggressive qualifier', celebration: 'Knee slide on the grass', emote: 'jump' },
  { number: 9, name: 'Noor Haddad', team: 'meridian', from: 'Lebanon', helmet: { base: '#C9CED6', pattern: 'split', ink: '#1E4FD8' }, line: 'Consistent, clever tire saver', celebration: 'Heart hands to the fans', emote: 'wave' },
];

export const driverByNumber = (n) => DRIVERS.find((d) => d.number === n);
export const surname = (name) => name.split(' ').slice(-1)[0];

export const HELMET_PATTERNS = ['rays', 'waves', 'chevrons', 'stars', 'pinstripes', 'checks', 'grid', 'split'];

// Pit stop beats in game seconds (spec: "Pit stop choreography").
export const PIT = {
  target: 2.4,
  jackLift: 0.2,
  liftHeight: 0.12,
  cornerDuration: 1.2, // tap -> gun loosened, tire pulled, new tire fitted, gun tightened
  jackDrop: 0.2,
  releaseDelay: 0.1,
  wrongTapPenalty: 0.3,
};

export const CORNERS = ['FL', 'FR', 'RL', 'RR'];
