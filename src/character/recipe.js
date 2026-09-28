// Character options, the five presets and the saved recipe. No three.js here,
// so pages that only read the saved character (the cards) stay light.

export const SUITS = {
  stripes: 'Team stripes',
  classic: 'Classic',
  star: 'Star slash',
  diamond: 'Diamond',
};
export const GLOVES = { dark: 'Dark mitts', star: 'Star (dark)', starInverse: 'Star (team)', bare: 'Bare hands' };
export const BROWS = { angled: 'Determined', straight: 'Straight', arched: 'Arched', none: 'None' };
export const MOUTHS = { smile: 'Smile', grin: 'Big grin', flat: 'Serious', smirk: 'Smirk' };
export const PROPS = { none: 'Nothing', tablet: 'Tablet', wheelgun: 'Wheel gun' };
export const VISORS = { '#16171a': 'Black', '#C9A646': 'Gold', '#2D7FF9': 'Blue', '#E03A3A': 'Red' };
export const SKINS = ['#F1CFB3', '#E8B48F', '#D19A6E', '#A86C45', '#7B4A2D', '#5A3520'];
export const SWATCHES = [
  '#1FB5B0', '#D8312B', '#F26B1D', '#F5C518', '#35B04A', '#2D7FF9', '#1E4FD8', '#5B2BB5',
  '#7A1F2B', '#E85D9A', '#B7E23A', '#8A9BB0', '#FFFFFF', '#EFE6D2', '#25272B', '#16171a',
];

// The five preset characters from the reference sheet.
export const PRESETS = {
  ace: {
    label: 'The Ace', role: 'Driver', pose: 'akimbo',
    recipe: { suit: 'stripes', primary: '#1FB5B0', secondary: '#FFFFFF', accent: '#1FB5B0', gloves: 'dark', skin: SKINS[4], brows: 'angled', mouth: 'smirk', visorDown: false, prop: 'none', name: 'Ace' },
  },
  engineer: {
    label: 'Race Engineer', role: 'Engineer', pose: 'tablet',
    recipe: { suit: 'stripes', primary: '#1FB5B0', secondary: '#FFFFFF', accent: '#1FB5B0', gloves: 'bare', skin: SKINS[4], brows: 'angled', mouth: 'flat', visorDown: false, prop: 'tablet', name: 'Engineer' },
  },
  rookie: {
    label: 'The Rookie', role: 'Driver', pose: 'wave',
    recipe: { suit: 'stripes', primary: '#1FB5B0', secondary: '#FFFFFF', accent: '#1FB5B0', gloves: 'bare', skin: SKINS[2], brows: 'none', mouth: 'grin', visorDown: true, prop: 'none', name: 'Rookie' },
  },
  gunner: {
    label: 'Wheel Gunner', role: 'Pit crew', pose: 'action',
    recipe: { suit: 'stripes', primary: '#1FB5B0', secondary: '#FFFFFF', accent: '#1FB5B0', gloves: 'bare', skin: SKINS[3], brows: 'angled', mouth: 'grin', visorDown: false, prop: 'wheelgun', name: 'Gunner' },
  },
  veteran: {
    label: 'The Veteran', role: 'Driver', pose: 'crossed',
    recipe: { suit: 'stripes', primary: '#1FB5B0', secondary: '#FFFFFF', accent: '#1FB5B0', gloves: 'bare', skin: SKINS[3], brows: 'none', mouth: 'smile', visorDown: true, prop: 'none', name: 'Veteran' },
  },
};

export const DEFAULT_RECIPE = {
  preset: 'ace',
  pose: 'akimbo',
  ...PRESETS.ace.recipe,
  visor: '#16171a',
  number: 12,
};

// Players' own characters are saved here.
export const RECIPE_KEY = 'skycircuit.character';
export function loadRecipe() {
  try {
    const r = JSON.parse(localStorage.getItem(RECIPE_KEY) || 'null');
    return r && r.recipe ? r : null;
  } catch {
    return null;
  }
}
export function saveRecipe(recipe, snapshot) {
  try {
    localStorage.setItem(RECIPE_KEY, JSON.stringify({ recipe, snapshot, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}
