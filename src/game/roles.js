// "Play as": the player's own character (from the creator) takes a job in the
// team, each in first person:
//   driver    drives the team's garage car from the cockpit;
//   mechanic  works the front-left wheel gun in a pit stop (the crew does the rest);
//   engineer  runs the lapping car from the pit wall over the radio.

import { h } from '../ui/ui.js';
import { loadRecipe, DEFAULT_RECIPE, PRESETS } from '../character/recipe.js';

export const ROLES = {
  driver: { icon: '🏎', label: 'Driver', blurb: 'Drive the car from the cockpit. You are in the seat in every camera.' },
  mechanic: { icon: '🔧', label: 'Mechanic', blurb: 'Pit stops only. You are the front-left wheel gunner: gun off, then tighten when the new tyre is on.' },
  engineer: { icon: '🎧', label: 'Race engineer', blurb: 'Radio only. From the pit wall, call the pace, the tyres and the stops.' },
};

export class RolePlay {
  constructor(game) {
    this.game = game;
    this.role = null;
  }

  character() {
    const saved = loadRecipe();
    return { recipe: { ...DEFAULT_RECIPE, ...(saved?.recipe || {}) }, snapshot: saved?.snapshot || null, saved: !!saved };
  }

  busy() {
    const g = this.game;
    return g.player.active || g.pitChallenge.active || g.engineer.active || g.explorer.active;
  }

  open(role = null) {
    const g = this.game;
    const ch = this.character();
    const launch = g.teams.filter((t) => t.launch);
    let team = launch[0];
    const teamRow = h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Team' });
    const renderTeams = () =>
      teamRow.replaceChildren(
        ...launch.map((t) =>
          h('button', { role: 'radio', 'aria-checked': String(team === t), style: team === t ? { background: t.data.primary, borderColor: t.data.primary, color: '#fff' } : null, onclick: () => ((team = t), renderTeams()) }, t.data.name)
        )
      );
    renderTeams();
    const who = h(
      'div',
      { class: 'play-who' },
      ch.snapshot ? h('img', { src: ch.snapshot, alt: `${ch.recipe.name}, your character` }) : h('div', { class: 'play-noimg', 'aria-hidden': 'true' }, '🧑'),
      h(
        'div',
        {},
        h('b', {}, ch.saved ? `#${ch.recipe.number} ${ch.recipe.name}` : 'No character yet'),
        h('a', { href: '/creator/', class: 'play-edit' }, ch.saved ? '✏️ Edit character' : '✏️ Make your character')
      )
    );
    const roles = h(
      'div',
      { class: 'place-list' },
      Object.entries(ROLES).map(([id, r]) =>
        h('button', { class: 'place', 'aria-pressed': role === id ? 'true' : null, onclick: () => this.play(id, team) }, h('b', {}, `${r.icon} ${r.label}`))
      )
    );
    g.ui.openModal(h('div', {}, h('h2', {}, 'Play as'), who, h('p', { class: 'play-label' }, 'Team'), teamRow, h('p', { class: 'play-label' }, 'Track'), g.trackPicker(), h('p', { class: 'play-label' }, 'Job'), roles, h('div', { class: 'row' }, h('button', { onclick: () => g.ui.closeModal() }, 'Cancel'))));
  }

  play(role, team = this.game.teams.find((t) => t.launch)) {
    const g = this.game;
    if (this.busy()) {
      g.ui.toast('Finish what you are doing first.', { icon: '⏳' });
      return;
    }
    g.ui.closeModal();
    const { recipe } = this.character();
    this.role = role;
    if (role === 'driver') this.playDriver(team, recipe);
    else if (role === 'mechanic') this.playMechanic(team, recipe);
    else if (role === 'engineer') this.playEngineer(team, recipe);
  }

  // Our character sits in the car (seen in the T-cam and chase views).
  playDriver(team, recipe) {
    const g = this.game;
    const d = team.garageCar.driver;
    const seat = d.seated.person;
    const old = { ...seat.recipe };
    seat.restyle({ ...recipe, helmet: true, visorDown: true, helmetColor: recipe.primary, name: old.name });
    g.player.onStop = () => {
      seat.restyle(old);
      g.player.onStop = null;
      this.role = null;
    };
    g.driveCar(team, g.trackChoice);
    if (!g.player.active) g.player.onStop();
  }

  // Our character is the front-left gunner (hidden in first person).
  playMechanic(team, recipe) {
    const g = this.game;
    const me = team.crew.gun_FL.person;
    const old = { ...me.recipe };
    me.restyle({ ...recipe, helmet: true, visorDown: true, name: old.name });
    g.pitChallenge.start(team, {
      mechanic: true,
      recipe,
      onExit: () => {
        me.restyle(old);
        this.role = null;
      },
    });
  }

  playEngineer(team, recipe) {
    const g = this.game;
    g.engineer.onExit = () => (this.role = null);
    g.engineer.start(team, recipe);
  }
}
