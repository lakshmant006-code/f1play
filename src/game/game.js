// Sky Circuit game controller: builds the world, wires every interactive asset
// (hover / click / deeper interaction from the spec) and runs the frame loop.
// Core loop: explore the islands, meet a team, run a pit stop, take the car
// out, celebrate on the podium.

import * as THREE from 'three';
import { buildTrackMeshes, buildPitBuilding, buildClouds, buildSky } from '../world/world.js';
import { buildRaisedPodium, PODIUM_HEIGHT } from '../world/podium.js';
import { buildIslandShapes, buildIslands, buildBridges, buildGrandstandHD, buildWatchTower, buildStartGantry, buildTrackBoards, LANDMARKS } from '../world/circuit.js';
import { buildTrack, buildPitLane, PIT_WIDTH, GARAGE_FRONT_Z, GARAGE_DEPTH } from './layout.js';
import { buildTeams } from './paddock.js';
import { CarDriver } from './driving.js';
import { PitChallenge, loadBest } from './pitstop.js';
import { Interactions } from '../interact.js';
import { Particles, Rain } from '../fx/particles.js';
import { createPerson, SKIN, HAIR, attachProp, setHelmet } from '../people/person.js';
import { Actor } from '../people/actor.js';
import { COMPOUNDS, DRIVERS, teamById, driverByNumber, surname, PIT } from '../data.js';
import { h } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import { Explorer, PLACES } from '../explore.js';
import { SoundScape } from '../audio.js';
import { PlayerDrive } from '../drive.js';
import { EngineerMode } from './engineer.js';
import { RolePlay } from './roles.js';
import { buildCharacter, animateCharacter, setPose, loadRecipe, EMOTES, PRESETS, SUITS, GLOVES, BROWS, MOUTHS, SKINS, SWATCHES } from '../character/blocky.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;

const TIPS = [
  'Track temp is climbing. Softs will drop off after six laps, so plan the stop early.',
  'Undercut window is open. Box this lap and we jump them in the pit lane.',
  'Rain in ten minutes on the radar. Inters on standby.',
  'Front left is the limiting tire. Save it through the long right hander.',
  'Target 2.4 in the box. Every tenth is a place on track.',
];

export class Game {
  constructor({ renderer, scene, camera, post, rig, ui }) {
    Object.assign(this, { renderer, scene, camera, post, rig, ui });
    this.time = 0;
    this.actors = [];
    this.drivers = [];
    this.nextCompound = { solaris: 'soft', nordlys: 'soft' };
    this.rain = false;
    this.focus = null;
    this.unlocked = loadUnlocked();
    this.lastCelebration = null;
    this.podiumActors = new Map();
    this.timers = [];

    this.buildWorld();
    this.teams = buildTeams(scene, { track: this.track, pit: this.pit });
    this.setupCars();
    this.pitChallenge = new PitChallenge(this);
    this.onPitResult = (r) => {
      // A strong stop wins the celebration for that car's driver.
      if (r.time < PIT.target) this.lastWinner = r.number;
    };
    this.particles = new Particles();
    scene.add(this.particles.points);
    this.rainFx = new Rain();
    scene.add(this.rainFx.lines);

    this.interactions = new Interactions({
      camera,
      dom: renderer.domElement,
      post,
      onHover: (e, source) => this.onHover(e, source),
      onEscape: () => (this.explorer.active || this.player.active || this.engineer?.active || this.pitChallenge?.fp ? null : this.ui.modal.hidden ? this.goHome() : this.ui.closeModal()),
    });
    this.addMyCharacter();
    this.registerInteractions();
    this.explorer = new Explorer(this);
    this.audio = new SoundScape(this);
    this.player = new PlayerDrive(this);
    this.engineer = new EngineerMode(this);
    this.roles = new RolePlay(this);
    this.bindUI();
  }

  // ---- World ---------------------------------------------------------------

  buildWorld() {
    const s = this.scene;
    this.track = buildTrack();
    this.pit = buildPitLane(this.track);

    // Four islands carved around the track, joined by track bridges.
    const L = LANDMARKS;
    const pitLaneExtras = [];
    for (let i = 0; i < this.pit.n; i += 3) pitLaneExtras.push({ shape: 'circle', x: this.pit.pos[i].x, z: this.pit.pos[i].z, r: PIT_WIDTH / 2 + 5, island: 0 });
    const extras = [
      { shape: 'rect', x0: -44, x1: 44, z0: GARAGE_FRONT_Z - GARAGE_DEPTH - 6, z1: -40, island: 0 },
      ...pitLaneExtras,
      { shape: 'rect', x0: L.grandstand.x - L.grandstand.len / 2 - 9, x1: L.grandstand.x + L.grandstand.len / 2 + 9, z0: L.grandstand.z - 15, z1: L.grandstand.z + 5, island: 1 },
      { shape: 'circle', x: L.tower.x, z: L.tower.z, r: 13, island: 2 },
      { shape: 'rect', x0: L.podium.x - 14, x1: -67, z0: L.podium.z - 15, z1: L.podium.z + 15, island: 3 },
    ];
    const shapes = buildIslandShapes(this.track, this.pit, extras);
    this.onIsland = shapes.onIsland;
    this.islands = buildIslands(shapes.outlines);
    s.add(this.islands);
    s.add(buildTrackMeshes(this.track, this.pit, this.onIsland));
    s.add(buildBridges(this.track, this.onIsland));
    s.add(buildPitBuilding());
    s.add(buildStartGantry(-10, -35));
    s.add(buildTrackBoards(this.track, [[20, 110, 1], [190, 225, -1], [270, 305, 1], [345, 380, -1]], this.onIsland));

    this.grandstand = buildGrandstandHD({ len: L.grandstand.len });
    this.grandstand.position.set(L.grandstand.x, 0, L.grandstand.z);
    this.grandstand.rotation.y = L.grandstand.rot;
    s.add(this.grandstand);

    this.tower = buildWatchTower();
    this.tower.position.set(L.tower.x, 0, L.tower.z);
    this.tower.rotation.y = Math.PI * 0.85; // timing board faces the pit straight side
    s.add(this.tower);

    this.podium = buildRaisedPodium();
    this.podium.position.set(L.podium.x, 0, L.podium.z);
    this.podium.rotation.y = L.podium.rot;
    s.add(this.podium);

    this.clouds = buildClouds();
    s.add(this.clouds);
    s.add(buildSky());

    // Lights: one warm key with soft shadows, a sky fill.
    this.hemi = new THREE.HemisphereLight('#F3EEE3', '#6B7A45', 1.05);
    s.add(this.hemi);
    const sun = new THREE.DirectionalLight('#FFE6C2', 2.6);
    sun.position.set(110, 140, 90);
    sun.target.position.set(0, 0, -5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -140;
    sc.right = 140;
    sc.top = 140;
    sc.bottom = -140;
    sc.near = 20;
    sc.far = 420;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    s.add(sun, sun.target);
    this.sun = sun;
  }

  setupCars() {
    const n = this.teams.filter((t) => t.launch).length;
    let k = 0;
    for (const team of this.teams) {
      this.actors.push(...(team.deckCrew || []));
      if (!team.launch) continue;
      const tc = team.trackCar;
      tc.drive = new CarDriver(tc, this.track, this.pit, { s: 60 + (k * this.track.length) / n, pace: 1 });
      k++;
      const gc = team.garageCar;
      gc.drive = new CarDriver(gc, this.track, this.pit);
      gc.drive.park(gc.home.pos, 0);
      for (const d of team.drivers) {
        this.drivers.push(d);
        this.actors.push(d.standing, d.seated);
      }
      this.actors.push(...team.crewList);
    }
  }

  // The player's own character from the creator, standing by the first team's garage.
  addMyCharacter() {
    const saved = loadRecipe();
    if (!saved?.recipe) return;
    const team = this.teams.find((t) => t.launch);
    const r = saved.recipe;
    const me = buildCharacter(r);
    me.position.set(team.garageCar.root.position.x + 3.6, 0, GARAGE_FRONT_Z - 2.6);
    me.rotation.y = -0.25;
    me.traverse((o) => o.isMesh && (o.castShadow = true));
    this.scene.add(me);
    this.me = { root: me, recipe: r };
    const hit = new THREE.Group();
    Interactions.proxy(hit, 0.8, 1.8, 0.8);
    me.add(hit);
    this.interactions.add({
      id: 'me',
      kind: 'driver',
      hit,
      outline: [me],
      accent: r.primary,
      anchor: me.userData.joints.head,
      label: () => `<span class="num" style="background:${r.primary}">${r.number}</span>${esc(r.name)} · you`,
      pulse: true,
      onClick: () => this.focusMe(),
    });
  }

  focusMe() {
    const { root, recipe: r } = this.me;
    this.focus = { kind: 'me' };
    const head = root.userData.joints.head.getWorldPosition(V(0, 0, 0));
    this.focusView(head.clone().add(V(0, -0.35, 0)), { distance: 3.6, elevation: 16, azimuth: root.rotation.y + 0.35, minEl: 8 });
    this.ui.showCard({
      kicker: `#${r.number} · ${PRESETS[r.preset]?.role || 'Driver'} · Sky Circuit`,
      title: r.name,
      accent: r.primary,
      body: '<p>Your character from the creator.</p>',
      actions: [
        ...['wave', 'thumbs', 'jump', 'akimbo'].map((id) => ({ label: EMOTES[id], onClick: () => setPose(root, id) })),
        { label: '✏️ Edit character', primary: true, onClick: () => (location.href = '/creator/') },
        { label: 'Back', onClick: () => this.goHome() },
      ],
    });
  }

  // ---- Interactions -------------------------------------------------------------

  registerInteractions() {
    const I = this.interactions;
    for (const team of this.teams) {
      const t = team.data;
      // Cars.
      for (const car of team.cars) {
        const hit = new THREE.Group();
        Interactions.proxy(hit, 2.0, 1.1, 5.0, 0.55);
        car.root.add(hit);
        I.add({
          id: `car_${car.number}`,
          kind: 'car',
          hit,
          outline: [car.root],
          accent: t.accent === '#151515' ? t.secondary : t.accent,
          anchor: car.nodes.body,
          label: () => `<span class="num" style="background:${t.primary}">${car.number}</span>${t.name}`,
          onClick: () => this.focusCar(car),
        });
      }
      if (!team.launch) continue;
      // Drivers (standing).
      for (const d of team.drivers) {
        const hit = new THREE.Group();
        Interactions.proxy(hit, 0.8, 1.8, 0.8);
        d.standing.root.add(hit);
        I.add({
          id: `driver_${d.data.number}`,
          kind: 'driver',
          hit,
          outline: [d.standing.root],
          accent: t.primary,
          anchor: d.standing.person.sockets.head,
          label: () => `<span class="num" style="background:${t.primary}">${d.data.number}</span>${d.data.name}`,
          enabled: () => d.standing.root.visible,
          onClick: () => this.focusDriver(d),
        });
      }
      // Race engineer.
      const eng = team.crew.engineer;
      const eh = new THREE.Group();
      Interactions.proxy(eh, 0.8, 1.8, 0.8);
      eng.root.add(eh);
      I.add({
        id: `engineer_${t.id}`,
        kind: 'engineer',
        hit: eh,
        outline: [eng.root],
        accent: t.primary,
        anchor: eng.person.sockets.head,
        label: () => `<span class="icon">🎧</span> Race engineer · ${t.name}`,
        pulse: true,
        onClick: () => this.focusEngineer(team),
      });
      // Pit crew: one proxy per member, one shared entry, so the whole crew highlights together.
      const crewHits = team.pitCrew.map((a) => {
        const p = new THREE.Group();
        Interactions.proxy(p, 0.8, 1.8, 0.8);
        a.root.add(p);
        return p;
      });
      const crewEntry = {
        id: `crew_${t.id}`,
        kind: 'crew',
        hit: new THREE.Group(),
        outline: team.pitCrew.map((a) => a.root),
        accent: t.primary,
        anchor: team.crew.gun_FL.person.sockets.head,
        label: () => `Pit crew · ${t.name}`,
        onClick: () => this.focusCrew(team),
      };
      crewHits.forEach((p) => p.traverse((o) => (o.userData.interact = crewEntry)));
      I.entries.push(crewEntry);
      I.proxies.push(...crewHits);
      // Strategist and pit wall desk.
      const st = team.crew.strategist;
      const sh = new THREE.Group();
      Interactions.proxy(sh, 1.6, 1.8, 2.4);
      team.desk.add(sh);
      I.add({
        id: `strategist_${t.id}`,
        kind: 'strategist',
        hit: sh,
        outline: [st.root, team.desk],
        accent: t.primary,
        anchor: st.person.sockets.head,
        label: () => `<span class="icon">📊</span> Strategist · ${t.name}`,
        onClick: () => this.focusStrategist(team),
      });
    }
    const notWalking = () => !this.explorer?.active;
    // Clicking anywhere on an island's ground walks you into that island.
    const placeOf = { pit: 'pit', grandstand: 'grandstand', tower: 'tower', podium: 'podium' };
    for (const isl of this.islands.children) {
      const id = placeOf[isl.userData.islandId];
      if (!id) continue;
      I.add({
        id: `island_${id}`,
        kind: 'island',
        hit: isl,
        outline: [isl],
        accent: '#F5C518',
        anchor: isl.userData.anchor,
        label: () => `🚶 ${PLACES[id].name} · click to walk in`,
        enabled: notWalking,
        onClick: () => this.walkInto(id),
      });
    }
    // Grandstand island (the whole stand).
    const gh = new THREE.Group();
    Interactions.proxy(gh, 31, 10, 13, 5).position.z = -5;
    this.grandstand.add(gh);
    I.add({
      id: 'grandstand',
      kind: 'place',
      hit: gh,
      outline: [this.grandstand],
      accent: '#F5C518',
      anchor: this.grandstand,
      label: () => '🏟 Grandstand · click to walk in',
      enabled: notWalking,
      onClick: () => this.walkInto('grandstand'),
    });
    // Pit building (upper floor and roof, so garages below stay clickable).
    const pitHit = new THREE.Group();
    pitHit.position.set(0, 0, GARAGE_FRONT_Z - GARAGE_DEPTH / 2);
    Interactions.proxy(pitHit, 68, 4.5, GARAGE_DEPTH + 2, 7.6);
    this.scene.add(pitHit);
    I.add({
      id: 'pitbuilding',
      kind: 'place',
      hit: pitHit,
      outline: [],
      accent: '#F5C518',
      anchor: pitHit,
      label: () => '🔧 Pit building · click to walk in',
      enabled: notWalking,
      onClick: () => this.walkInto('pit'),
    });
    // Watch tower.
    const th = new THREE.Group();
    Interactions.proxy(th, 12, 34, 12, 17);
    this.tower.add(th);
    I.add({
      id: 'tower',
      kind: 'tower',
      hit: th,
      outline: [this.tower],
      accent: '#F5C518',
      anchor: this.tower,
      label: () => '🗼 Watch tower · click to walk in',
      enabled: notWalking,
      onClick: () => this.walkInto('tower'),
    });
    // Podium.
    const ph = new THREE.Group();
    Interactions.proxy(ph, 17, 12, 13, 6).position.z = -3;
    this.podium.add(ph);
    I.add({
      id: 'podium',
      kind: 'podium',
      hit: ph,
      outline: [this.podium],
      accent: '#F5C518',
      anchor: this.podium,
      label: () => '🏆 Podium · click to walk in',
      enabled: notWalking,
      onClick: () => this.walkInto('podium'),
    });
  }

  onHover(e, source) {
    this.hoverEntry = e;
    // Strategist screens glow on hover.
    for (const t of this.teams) if (t.desk) t.desk.userData.screenMat.emissiveIntensity = e?.kind === 'strategist' && e.id.endsWith(t.data.id) ? 1.4 : 0.35;
    if (!e) {
      this.ui.hideTag();
      return;
    }
    const p = this.toScreen(e.anchor.getWorldPosition(V(0, 0, 0)).add(V(0, e.kind === 'car' ? 1.2 : 0.45, 0)));
    this.ui.showTag(e.label(), p.x, p.y, { accent: e.accent, pulse: !!e.pulse });
    if (e.kind === 'podium') this.sparkle();
    if (source === 'long') {
      // Long press shows the hover card without committing to a camera move.
      e.onClick?.();
    }
  }

  // ---- Focus views ----------------------------------------------------------------

  // Extra things to do in an area, shown in the walking panel.
  placeActions(id) {
    if (id === 'pit') {
      const launch = this.teams.filter((t) => t.launch);
      return [
        ...launch.map((t) => ({ label: `🏎 Drive #${t.garageCar.number}`, onClick: () => this.driveCar(t) })),
        ...launch.map((t) => ({ label: `Pit stop · ${t.data.name.split(' ')[0]}`, onClick: () => { this.explorer.exit(); this.after(1, () => this.pitChallenge.start(t)); } })),
      ];
    }
    if (id === 'tower') {
      return [{ label: 'Live timing', onClick: () => this.showTimingModal() }];
    }
    if (id === 'podium') {
      return [
        { label: 'Choose the podium', onClick: () => this.choosePodium() },
        ...(this.lastCelebration ? [{ label: 'Replay celebration', onClick: () => this.celebrate(this.lastCelebration) }] : []),
      ];
    }
    return [];
  }

  showTimingModal() {
    const rows = this.standings();
    this.ui.openModal(
      h(
        'div',
        {},
        h('h2', {}, 'Live timing'),
        h('ol', {}, rows.length ? rows.map((c) => h('li', {}, `#${c.number} ${c.driver ? c.driver.data.name : ''} · ${c.drive.lastLap ? c.drive.lastLap.toFixed(2) + ' s' : 'out lap'}`)) : h('li', {}, 'No cars running')),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.ui.closeModal() }, 'Close'))
      )
    );
  }

  driveCar(team) {
    if (this.player.active) return;
    if (team.garageCar.drive?.mode !== 'parked') {
      this.ui.toast('That car is already out. Try the other one.', { icon: '⏳' });
      return;
    }
    this.ui.closeModal();
    this.ui.hideCard();
    this.ui.hideTag();
    this.interactions.setHover(null);
    this.interactions.enabled = false;
    this.player.start(team);
  }

  walkInto(id) {
    this.ui.hideCard();
    this.ui.hideTag();
    this.explorer.enter(id);
  }

  focusView(target, { distance, elevation, azimuth, follow = null, minEl = 15, maxEl = 60 }) {
    if (this.explorer?.active || this.player?.active) return; // walking or driving: the camera stays with you
    this.rig.setElevationRange(minEl, maxEl);
    this.rig.goTo({ target, distance, elevation: deg(elevation), azimuth, offset: V(0, 0.5, 0) }, { follow });
    this.ui.back.hidden = false;
  }

  goHome() {
    this.focus = null;
    this.ui.hideCard();
    this.ui.back.hidden = true;
    this.rig.back();
    if (this.liveryView) this.exitLiveryView();
  }

  focusCar(car) {
    this.focus = { kind: 'car', car };
    const team = car.teamRef;
    const t = team.data;
    const moving = car.drive && !['parked'].includes(car.drive.mode);
    const heading = car.root.rotation.y;
    this.focusView(car.root.position.clone().add(V(0, 0.5, 0)), { distance: moving ? 14 : 8.5, elevation: moving ? 32 : 28, azimuth: heading + 0.75, follow: moving ? car.root : null });
    this.showCarCard(car);
  }

  showCarCard(car) {
    const team = car.teamRef;
    const t = team.data;
    const d = car.driver?.data;
    const tire = COMPOUNDS[car.compounds.FL];
    const mode = car.drive?.mode;
    const status = car.display ? 'Display car in the garage' : mode === 'parked' ? 'In the garage on stands' : mode === 'track' ? 'On track' : mode === 'boxed' ? 'In the pit box' : 'In the pit lane';
    const actions = [];
    const canView = car.display || mode === 'parked';
    if (canView) actions.push({ label: this.liveryView === car ? 'Exit livery viewer' : 'Livery viewer', onClick: () => (this.liveryView === car ? this.exitLiveryView() : this.enterLiveryView(car)) });
    if (!car.display && mode === 'parked' && car.driver) {
      actions.push({ label: '🏎 Drive it', primary: true, onClick: () => this.driveCar(team) });
      actions.push({ label: 'Watch a lap', onClick: () => this.takeItOut(car) });
    }
    if (mode === 'track' && team.trackCar === car) actions.push({ label: 'Pit stop challenge', primary: true, onClick: () => this.pitChallenge.start(team) });
    actions.push({ label: 'Back', onClick: () => this.goHome() });
    this.ui.showCard({
      kicker: `${t.name} · ${status}`,
      title: `Car #${car.number}`,
      accent: t.primary,
      body: `<p>${d ? `Driver: <b>${d.name}</b> (${d.from})` : 'Garage display piece'}.</p>
        <p>Tires: <span class="chip" style="box-shadow: inset 0 0 0 2px ${tire.hex}">${tire.name}</span> · Livery: ${motifName(t.motif)}</p>
        <div class="swatches" aria-label="Team colors">${[t.primary, t.secondary, t.accent].map((c) => `<span class="swatch" style="background:${c}" title="${c}"></span>`).join('')}</div>
        ${car.drive?.lastLap ? `<p>Last lap <b>${car.drive.lastLap.toFixed(2)} s</b></p>` : ''}`,
      actions,
    });
  }

  enterLiveryView(car) {
    this.liveryView = car;
    this.rig.setElevationRange(8, 70);
    this.rig.goTo({ target: car.root.position.clone().add(V(0, 0.5, 0)), distance: 6.5, elevation: deg(22), azimuth: car.root.rotation.y + 0.9 });
    const flapOpen = () => car.nodes.flapR.rotation.x > 0.1;
    const compounds = Object.keys(COMPOUNDS);
    const rebuild = () => {
      const tire = COMPOUNDS[car.compounds.FL];
      this.ui.showCard({
        kicker: `${car.teamRef.data.name} · Livery viewer`,
        title: `Car #${car.number}`,
        accent: car.teamRef.data.primary,
        body: '<p>Drag to orbit, scroll or pinch to zoom.</p>',
        actions: [
          { label: flapOpen() ? 'Close rear flap' : 'Open rear flap', pressed: flapOpen(), onClick: () => { car.nodes.flapR.rotation.x = flapOpen() ? 0 : deg(60); rebuild(); } },
          { label: `Tires: ${tire.name}`, onClick: () => { car.setAllCompounds(compounds[(compounds.indexOf(car.compounds.FL) + 1) % compounds.length]); rebuild(); } },
          { label: car.root.getObjectByName('car_stands').visible ? 'Off the stands' : 'On the stands', onClick: () => { car.setGarage(!car.root.getObjectByName('car_stands').visible); rebuild(); } },
          { label: 'Exit viewer', onClick: () => this.exitLiveryView() },
        ],
      });
    };
    rebuild();
  }

  exitLiveryView() {
    const car = this.liveryView;
    this.liveryView = null;
    if (!car) return;
    car.nodes.flapR.rotation.x = 0;
    if (car.drive?.mode === 'parked' || car.display) car.setGarage(true);
    if (this.focus?.car === car) this.focusCar(car);
  }

  takeItOut(car) {
    const team = car.teamRef;
    const d = car.driver;
    if (!d || car.drive.mode !== 'parked') return;
    this.ui.hideCard();
    // Driver walks to the cockpit and climbs in.
    const side = car.root.position.clone().add(V(-1.2, 0, 0.4));
    d.standing.walkTo(side, Math.PI / 2, {
      onArrive: () => {
        d.standing.root.visible = false;
        d.seated.root.visible = true;
        d.inCar = true;
        car.drive.launchFromGarage(team.gx, () => {
          // One lap from pit exit round to pit entry, then back to the garage.
          const start = car.drive.time;
          car.drive.requestPit(team.gx, () => {
            car.stint = car.drive.time - start;
            this.returnToGarage(car);
          });
        });
        this.ui.toast(`<b>${d.data.name}</b> is heading out for a lap.`, { icon: '🏁', accent: team.data.primary });
        this.focusView(car.root.position.clone(), { distance: 14, elevation: 32, azimuth: car.root.rotation.y + 0.75, follow: car.root });
        this.showCarCard(car);
      },
    });
  }

  returnToGarage(car) {
    const d = car.driver;
    const team = car.teamRef;
    this.after(0.9, () => {
      car.drive.moveTo(car.home.pos, 0, 2.6, () => {
        car.drive.mode = 'parked';
        car.setGarage(true);
        d.seated.root.visible = false;
        d.inCar = false;
        d.standing.root.visible = true;
        d.standing.root.position.copy(car.root.position.clone().add(V(-1.2, 0, 0.3)));
        d.standing.goHome();
        const lap = car.stint ? ` Out-and-in lap: ${car.stint.toFixed(2)} s.` : '';
        this.ui.toast(`<b>${d.data.name}</b> is back in the garage.${lap}`, { icon: '🏁', accent: team.data.primary });
        if (this.focus?.car === car) this.showCarCard(car);
      });
    });
  }

  focusDriver(d) {
    this.focus = { kind: 'driver', d };
    const a = d.standing;
    const head = a.person.sockets.head.getWorldPosition(V(0, 0, 0));
    this.focusView(head.clone().add(V(0, -0.35, 0)), { distance: 3.6, elevation: 16, azimuth: a.root.rotation.y + 0.35, minEl: 8 });
    this.showDriverCard(d);
  }

  showDriverCard(d) {
    const t = d.team.data;
    const helmetOn = d.standing.person.helmetGroup?.visible;
    const unlocked = this.unlocked.includes(d.data.number);
    const emote = (name) => () => d.standing.anim.play(name);
    this.ui.showCard({
      kicker: `#${d.data.number} · ${t.name} · ${d.data.from}`,
      title: d.data.name,
      accent: t.primary,
      body: `<p><i>“${d.data.line}.”</i></p>
        <p>Signature celebration: <b>${d.data.celebration}</b> ${unlocked ? '' : '<span class="chip">🔒 unlocks after a podium</span>'}</p>`,
      actions: [
        { label: '👋 Wave', onClick: emote('wave') },
        { label: '🎨 Style', primary: true, onClick: () => this.showStyler([d.standing.person, d.seated.person], { title: d.data.name, kicker: `#${d.data.number} · ${t.name}`, accent: t.primary, back: () => this.showDriverCard(d), focus: () => this.focusDriver(d) }) },
        {
          label: helmetOn ? '⛑ Helmet off' : '⛑ Helmet on',
          onClick: () => {
            const a = d.standing;
            a.anim.onEvent = (ev) => {
              if (ev === 'helmet_toggle') {
                setHelmet(a.person, !a.person.helmetGroup.visible);
                this.showDriverCard(d);
              }
            };
            a.anim.play(helmetOn ? 'helmet_off' : 'helmet_on');
          },
        },
        {
          label: '✋ High five',
          onClick: () => {
            d.standing.anim.play('high_five');
            const eng = d.team.crew.engineer;
            eng.anim.play('high_five');
          },
        },
        ...(unlocked ? [{ label: `★ ${d.data.celebration}`, primary: true, onClick: emote(d.data.emote) }] : []),
        { label: 'Back', onClick: () => this.goHome() },
      ],
    });
  }

  focusEngineer(team) {
    this.focus = { kind: 'engineer', team };
    const e = team.crew.engineer;
    this.focusView(e.root.position.clone().add(V(0, 1.2, 0)), { distance: 6, elevation: 22, azimuth: e.root.rotation.y + 0.4 });
    e.anim.play('point_at_screen');
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    this.ui.toast(`<b>Engineer:</b> ${tip}`, { icon: '🎧', accent: team.data.primary, duration: 5000 });
    this.ui.showCard({
      kicker: `${team.data.name} · Race engineer`,
      title: 'On the radio',
      accent: team.data.primary,
      body: `<p>${tip}</p><p>Next stop: <b>${COMPOUNDS[this.nextCompound[team.data.id]].name}</b> tires. Car #${team.trackCar.number} is on track.</p>`,
      actions: [
        { label: 'Start pit stop challenge', primary: true, onClick: () => this.pitChallenge.start(team) },
        { label: '🎨 Style', onClick: () => this.showStyler([e.person], { title: 'Race engineer', kicker: team.data.name, accent: team.data.primary, back: () => this.focusEngineer(team) }) },
        { label: 'Back', onClick: () => this.goHome() },
      ],
    });
  }

  // Live character styling: every change rebuilds the person on the spot and
  // is saved in this browser. `people` share the look (a driver standing and
  // seated, or a whole pit crew wearing the team kit).
  showStyler(people, { title, kicker = '', accent, back, focus = null, kit = false }) {
    const r = people[0].recipe;
    const apply = (patch) => {
      people.forEach((p) => {
        const own = /_seated$/.test(p.root.name) ? Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'helmet' && k !== 'visorDown')) : patch;
        p.restyle(own, { save: true });
      });
      this.showStyler(people, { title, kicker, accent, back, focus, kit });
    };
    const chips = (label, options, current, key, { swatch = false, map = (v) => v } = {}) =>
      h(
        'div',
        { class: 'sty-row' },
        h('span', { class: 'sty-label' }, label),
        h(
          'div',
          { class: 'sty-opts', role: 'radiogroup', 'aria-label': label },
          Object.entries(options).map(([v, l]) =>
            h(
              'button',
              {
                class: swatch ? 'sty-swatch' : '',
                role: 'radio',
                'aria-checked': String(String(current) === String(v)),
                'aria-label': l,
                title: l,
                style: swatch ? { background: v } : undefined,
                onclick: () => apply({ [key]: map(v) }),
              },
              swatch ? '' : l
            )
          )
        )
      );
    const asMap = (arr) => Object.fromEntries(arr.map((c) => [c, c]));
    const helmetOn = r.helmet !== false;
    const rows = [
      chips('Suit', SUITS, r.suit, 'suit'),
      chips('Team colour', asMap(SWATCHES.slice(0, 12)), r.primary, 'primary', { swatch: true }),
      chips('Gloves', GLOVES, r.gloves, 'gloves'),
    ];
    if (!kit) {
      rows.push(
        chips('Skin', asMap(SKINS), r.skin, 'skin', { swatch: true }),
        chips('Eyebrows', BROWS, r.brows, 'brows'),
        chips('Mouth', MOUTHS, r.mouth, 'mouth'),
        chips('Helmet', { true: 'On', false: 'Off' }, helmetOn, 'helmet', { map: (v) => v === 'true' })
      );
      if (helmetOn) rows.push(chips('Visor', { false: 'Up', true: 'Down' }, !!r.visorDown, 'visorDown', { map: (v) => v === 'true' }), chips('Helmet colour', asMap(SWATCHES.slice(0, 12)), r.helmetColor || r.primary, 'helmetColor', { swatch: true }));
      else rows.push(chips('Hair', asMap(HAIR), r.hair, 'hair', { swatch: true }));
    }
    focus?.();
    this.ui.showCard({
      kicker: `${kicker} · Style`,
      title,
      accent,
      body: '<p>Changes show up right away and stay in this browser.</p>',
      extra: h('div', { class: 'styler' }, rows),
      actions: [{ label: 'Done', primary: true, onClick: back }],
    });
  }

  focusCrew(team) {
    this.focus = { kind: 'crew', team };
    const gx = team.gx;
    this.focusView(V(gx, 1, GARAGE_FRONT_Z + 1.5), { distance: 14, elevation: 25, azimuth: 0.15 });
    if (!this.pitChallenge.active) {
      // Crew lines up in front of the garage and waves.
      team.pitCrew.forEach((a, i) => {
        const x = gx - 5 + i;
        a.walkTo(V(x, 0, GARAGE_FRONT_Z + 1.3 + (i % 2) * 0.6), 0.1, {
          clip: 'idle_loop',
          onArrive: () =>
            this.after(i * 0.09, () => {
              a.anim.play('wave');
              this.after(3.5, () => !this.pitChallenge.active && a.goHome({ clip: 'idle_loop' }));
            }),
        });
      });
    }
    this.ui.showCard({
      kicker: `${team.data.name} · 11 on the pit crew`,
      title: 'Pit crew',
      accent: team.data.primary,
      body: '<p>Front and rear jack, four wheel gunners, four tire changers and a release controller. Their whole job is 2.4 seconds.</p>',
      actions: [
        { label: 'Pit stop challenge', primary: true, onClick: () => this.pitChallenge.start(team) },
        { label: '🎨 Team kit', onClick: () => this.showStyler(team.pitCrew.map((a) => a.person), { title: 'Pit crew kit', kicker: team.data.name, accent: team.data.primary, back: () => this.focusCrew(team), kit: true }) },
        { label: 'Back', onClick: () => this.goHome() },
      ],
    });
  }

  focusStrategist(team) {
    this.focus = { kind: 'strategist', team };
    const st = team.crew.strategist;
    this.focusView(st.root.position.clone().add(V(0, 1.1, 0.4)), { distance: 5.5, elevation: 24, azimuth: st.root.rotation.y + 0.5 });
    st.anim.play('lean_to_screen');
    this.showStrategistCard(team);
  }

  showStrategistCard(team) {
    const cars = this.teams.flatMap((t) => t.cars).filter((c) => c.drive && ['track', 'pit', 'pit_exit', 'boxed'].includes(c.drive.mode));
    const rows = cars
      .map((c) => {
        const d = c.drive;
        const last = d.lastLap ? `${d.lastLap.toFixed(2)} s` : 'out lap';
        return `<tr><td><span class="chip" style="background:${c.teamRef.data.primary};color:#fff">${c.number}</span> ${c.driver ? surname(c.driver.data.name) : ''}</td><td>${last}</td><td>${Math.round(d.v * 3.6)} km/h</td></tr>`;
      })
      .join('');
    const cur = this.nextCompound[team.data.id];
    this.ui.showCard({
      kicker: `${team.data.name} · Strategist`,
      title: 'Live timing',
      accent: team.data.primary,
      body: `<table aria-label="Lap times of cars on track"><tbody>${rows || '<tr><td>No cars on track</td></tr>'}</tbody></table><p style="margin-top:10px">Tire for the next stop:</p>`,
      actions: [
        ...Object.entries(COMPOUNDS).map(([id, c]) => ({ label: c.name, pressed: id === cur, onClick: () => { this.nextCompound[team.data.id] = id; this.showStrategistCard(team); } })),
        { label: '🎨 Style', onClick: () => this.showStyler([team.crew.strategist.person], { title: 'Strategist', kicker: team.data.name, accent: team.data.primary, back: () => this.showStrategistCard(team) }) },
        { label: 'Back', onClick: () => this.goHome() },
      ],
    });
    clearTimeout(this.stratTimer);
    this.stratTimer = setTimeout(() => this.focus?.kind === 'strategist' && this.focus.team === team && this.showStrategistCard(team), 1000);
  }

  focusBox(team) {
    this.focus = { kind: 'box', team };
    this.ui.hideCard();
    this.focusView(team.box.clone().add(V(0, 0.4, 0)), { distance: 13, elevation: 40, azimuth: 0.35, minEl: 30, maxEl: 55 });
  }

  // Cars on track ordered by laps and distance, for the tower's timing board.
  standings() {
    const cars = this.teams.flatMap((t) => t.cars).filter((c) => c.drive && c.drive.mode !== 'parked');
    return cars.sort((a, b) => (b.drive.time - (b.drive.lapStart ?? b.drive.time)) - (a.drive.time - (a.drive.lapStart ?? a.drive.time)) || a.number - b.number);
  }

  // Card for an area with a Walk in button.
  focusPlace(id) {
    const place = PLACES[id];
    this.focus = { kind: 'place', id };
    const target = id === 'grandstand' ? this.grandstand.position.clone().add(V(0, 3, -4)) : V(0, 3, GARAGE_FRONT_Z);
    this.focusView(target, { distance: id === 'pit' ? 70 : 48, elevation: 26, azimuth: id === 'pit' ? 0.2 : 0.35 });
    this.ui.showCard({
      kicker: 'Area',
      title: place.name,
      accent: '#F5C518',
      body: `<p>${place.blurb}</p>`,
      actions: [
        { label: '🚶 Walk in', primary: true, onClick: () => this.explorer.enter(id) },
        ...(id === 'pit' ? this.teams.filter((t) => t.launch).map((t) => ({ label: `${t.data.name} crew`, onClick: () => this.focusCrew(t) })) : []),
        { label: 'Back', onClick: () => this.goHome() },
      ],
    });
  }

  focusTower() {
    this.focus = { kind: 'tower' };
    this.focusView(this.tower.position.clone().add(V(0, 17, 0)), { distance: 85, elevation: 22, azimuth: this.tower.rotation.y + 0.3, minEl: 10 });
    const rows = this.standings()
      .map((c, i) => `<tr><td>${i + 1}. <span class="chip" style="background:${c.teamRef.data.primary};color:#fff">${c.number}</span> ${c.driver ? c.driver.data.name : ''}</td><td>${c.drive.lastLap ? c.drive.lastLap.toFixed(2) + ' s' : 'out lap'}</td></tr>`)
      .join('');
    this.ui.showCard({
      kicker: 'Watch tower · Race control',
      title: 'Live timing',
      accent: '#0E1B2B',
      body: `<table aria-label="Running order"><tbody>${rows || '<tr><td>No cars running</td></tr>'}</tbody></table>`,
      actions: [
        { label: '🚶 Walk in', primary: true, onClick: () => this.explorer.enter('tower') },
        { label: 'View from the tower', onClick: () => { this.rig.setElevationRange(10, 70); this.rig.goTo({ target: V(0, 0, -5), distance: 70, elevation: deg(38), azimuth: this.tower.rotation.y + Math.PI }); } },
        { label: 'Back', onClick: () => this.goHome() },
      ],
    });
  }

  // ---- Podium ---------------------------------------------------------------------

  focusPodium() {
    this.focus = { kind: 'podium' };
    if (this.explorer?.active) return;
    this.focusView(this.podium.position.clone().add(V(0, PODIUM_HEIGHT - 1, 0)), { distance: 30, elevation: 14, azimuth: this.podium.rotation.y - 0.35, minEl: 5 });
    const last = this.lastCelebration;
    this.ui.showCard({
      kicker: 'Podium',
      title: 'Celebrate',
      accent: '#F5C518',
      body: `<p>${last ? `Last podium: ${last.map((n, i) => `${i + 1}. ${driverByNumber(n).name}`).join(' · ')}` : 'Pick who stands on steps 1 to 3. The winner sprays champagne.'}</p>`,
      actions: [
        { label: '🚶 Walk in', primary: true, onClick: () => this.explorer.enter('podium') },
        { label: 'Choose the podium', onClick: () => this.choosePodium() },
        ...(last ? [{ label: 'Replay celebration', onClick: () => this.celebrate(last) }] : []),
        { label: 'Back', onClick: () => this.goHome() },
      ],
    });
  }

  choosePodium() {
    const def = this.lastCelebration || [this.lastWinner || 17, 8, 4].filter((v, i, a) => a.indexOf(v) === i).concat([21]).slice(0, 3);
    const selects = [0, 1, 2].map((i) =>
      h('select', { id: `pod-${i}`, 'aria-label': `Step ${i + 1}` }, DRIVERS.map((d) => { const o = h('option', { value: d.number }, `#${d.number} ${d.name} · ${teamById(d.team).name}`); if (d.number === def[i]) o.selected = true; return o; }))
    );
    const err = h('p', { style: { color: '#c0392b', fontWeight: 800 } });
    const content = h(
      'div',
      {},
      h('h2', {}, 'Who is on the podium?'),
      ...selects.flatMap((s, i) => [h('label', { for: s.id }, `Step ${i + 1}`), s]),
      err,
      h(
        'div',
        { class: 'row' },
        h('button', {
          class: 'primary',
          onclick: () => {
            const order = selects.map((s) => +s.value);
            if (new Set(order).size < 3) {
              err.textContent = 'Pick three different drivers.';
              return;
            }
            this.ui.closeModal();
            this.celebrate(order);
          },
        }, 'Celebrate'),
        h('button', { onclick: () => this.ui.closeModal() }, 'Cancel')
      )
    );
    this.ui.openModal(content);
  }

  podiumActor(number) {
    if (this.podiumActors.has(number)) return this.podiumActors.get(number);
    const d = driverByNumber(number);
    const t = teamById(d.team);
    const female = ['Inés Calder', 'Sigrid Holm', 'Amara Okafor', 'Priya Raman', 'Noor Haddad'].includes(d.name);
    const p = createPerson({ colors: t, outfit: 'race', female, skin: SKIN[(number * 7) % SKIN.length], hair: HAIR[number % HAIR.length], hairStyle: number % 6, build: 'slim', name: `podium_${number}` });
    attachProp(p, 'headset', 'head').visible = false;
    const a = new Actor(p, { info: d });
    a.trophy = attachProp(p, 'trophy', 'handR', [0, -0.02, 0.05]);
    a.bottle = attachProp(p, 'bottle', 'handL', [0, 0, 0.05], [Math.PI / 2, 0, 0]);
    this.scene.add(p.root);
    this.podiumActors.set(number, a);
    this.actors.push(a);
    return a;
  }

  celebrate(order) {
    this.lastCelebration = order;
    this.focusPodium();
    for (const a of this.podiumActors.values()) a.root.visible = false;
    order.forEach((n, i) => {
      const a = this.podiumActor(n);
      a.root.visible = true;
      const top = this.podium.userData.stepTop(i + 1).applyMatrix4(this.podium.matrixWorld);
      a.place(top, this.podium.rotation.y); // face out over the step numbers
      a.trophy.visible = false;
      a.bottle.visible = false;
      a.anim.setBase('idle_loop');
      a.anim.play(i === 0 ? 'jump' : 'applause');
    });
    const winner = this.podiumActor(order[0]);
    const wd = driverByNumber(order[0]);
    this.confetti(winner.root.position);
    this.celebrating = { winner, t: 0, stage: 0, emote: wd.emote };
    if (!this.unlocked.includes(order[0])) {
      this.unlocked.push(order[0]);
      saveUnlocked(this.unlocked);
      this.ui.toast(`Signature celebration unlocked for <b>${wd.name}</b>: ${wd.celebration}.`, { icon: '★', accent: teamById(wd.team).primary });
    }
  }

  updateCelebration(dt) {
    const c = this.celebrating;
    if (!c) return;
    c.t += dt;
    const w = c.winner;
    if (c.stage === 0 && c.t > 1.3) {
      c.stage = 1;
      w.anim.play(c.emote);
    } else if (c.stage === 1 && c.t > 3.4) {
      c.stage = 2;
      w.trophy.visible = true;
      w.anim.play('trophy_lift', { hold: true });
      this.confetti(w.root.position);
    } else if (c.stage === 2 && c.t > 5.6) {
      c.stage = 3;
      w.trophy.visible = false;
      w.bottle.visible = true;
      w.anim.setBase('champagne_spray_loop');
      w.anim.play('champagne_spray_loop');
    } else if (c.stage === 3) {
      const b = w.bottle.getWorldPosition(V(0, 0, 0));
      const fwd = V(0, 0, 1).applyQuaternion(w.root.quaternion);
      this.particles.emit({ pos: b.add(V(0, 0.15, 0)), vel: fwd.multiplyScalar(4).add(V(0, 3.5, 0)), color: ['#fff6d5', '#ffe9a8', '#ffffff'], life: 1.1, size: 0.12, gravity: -6, spread: 1.4, count: 6 });
      if (c.t > 12) {
        c.stage = 4;
        w.anim.setBase('idle_loop');
        w.bottle.visible = false;
        this.celebrating = null;
      }
    }
  }

  confetti(at) {
    const colors = ['#F26B1D', '#1FB5B0', '#5B2BB5', '#FFD23F', '#E03A3A', '#ffffff', '#35B04A'];
    for (let k = 0; k < 6; k++) {
      this.particles.emit({ pos: at.clone().add(V((Math.random() - 0.5) * 6, 5, (Math.random() - 0.5) * 3)), vel: V(0, 2, 0), color: colors, life: 3.2, size: 0.16, gravity: -1.6, drag: 1.4, spread: 5, count: 45, jitter: 1.5 });
    }
  }

  sparkle() {
    const at = this.podium.position.clone().add(V(0, PODIUM_HEIGHT + 2.2, 0));
    this.particles.emit({ pos: at, vel: V(0, 1.2, 0), color: ['#FFD23F', '#ffffff', '#F26B1D'], life: 1.2, size: 0.12, gravity: -0.8, drag: 1.5, spread: 3, count: 40, jitter: 4 });
  }

  // ---- UI buttons ------------------------------------------------------------------

  bindUI() {
    const launch = this.teams.filter((t) => t.launch);
    document.getElementById('btn-pit').addEventListener('click', () => {
      if (this.pitChallenge.active) return;
      const content = h(
        'div',
        {},
        h('h2', {}, 'Pit stop challenge'),
        h('p', {}, `The car boxes, then tap the four corners in the order shown. Guns off, tires swapped, guns on, jacks down, green light. Beat ${PIT.target.toFixed(1)} s.`),
        loadBest() ? h('p', {}, `Your best: ${loadBest().time.toFixed(2)} s`) : null,
        h('div', { class: 'row' }, launch.map((t) => h('button', { class: 'primary', style: { background: t.data.primary, borderColor: t.data.primary }, onclick: () => { this.ui.closeModal(); this.pitChallenge.start(t); } }, t.data.name)), h('button', { onclick: () => this.ui.closeModal() }, 'Cancel'))
      );
      this.ui.openModal(content);
    });
    document.getElementById('btn-podium').addEventListener('click', () => this.focusPodium());
    document.getElementById('btn-play')?.addEventListener('click', () => this.roles.open());
    const rainBtn = document.getElementById('btn-rain');
    rainBtn.addEventListener('click', () => {
      this.setRain(!this.rain);
      rainBtn.setAttribute('aria-pressed', String(this.rain));
    });
    document.getElementById('btn-drive').addEventListener('click', () => {
      if (this.player.active) return;
      const launch = this.teams.filter((t) => t.launch);
      const content = h(
        'div',
        {},
        h('h2', {}, 'Drive a car'),
        h('p', {}, 'Take a car out for a lap from the cockpit. W/↑ go, S/↓ brake, A/D steer, Space for DRS, C to change camera.'),
        h('div', { class: 'place-list' }, launch.map((t) => h('button', { class: 'place', style: { borderLeft: `6px solid ${t.data.primary}` }, onclick: () => this.driveCar(t) }, h('b', {}, `#${t.garageCar.number} ${t.garageCar.driver.data.name}`), h('span', {}, t.data.name)))),
        h('div', { class: 'row' }, h('button', { onclick: () => this.ui.closeModal() }, 'Cancel'))
      );
      this.ui.openModal(content);
    });
    document.getElementById('btn-explore').addEventListener('click', () => {
      const content = h(
        'div',
        {},
        h('h2', {}, 'Walk in'),
        h('p', {}, 'Pick an island to explore on foot.'),
        h('div', { class: 'place-list' }, Object.entries(PLACES).map(([id, p]) => h('button', { class: 'place', onclick: () => { this.ui.closeModal(); this.explorer.enter(id); } }, h('b', {}, p.name), h('span', {}, p.blurb)))),
        h('div', { class: 'row' }, h('button', { onclick: () => this.ui.closeModal() }, 'Cancel'))
      );
      this.ui.openModal(content);
    });
    // View controls: rotate the islands, tilt, turntable, reset.
    // Same icon style as the top bar: solid icons, tooltips, grey square when on.
    const ib = (name, label, onclick, extra = {}) => {
      const b = h('button', { 'aria-label': label, 'data-tip': label, onclick, ...extra });
      b.innerHTML = `<span class="ico" aria-hidden="true">${icon(name)}</span>`;
      return b;
    };
    const autoBtn = ib('spin', 'Turntable', () => this.rig.setAutoRotate(!this.rig.controls.autoRotate), { 'aria-pressed': 'false' });
    this.rig.onAutoRotate = (on) => autoBtn.setAttribute('aria-pressed', String(on));
    const view = h(
      'div',
      { class: 'view-ctl', role: 'group', 'aria-label': 'Rotate the islands' },
      ib('rotateLeft', 'Rotate left', () => this.rig.rotateBy(-Math.PI / 4)),
      ib('rotateRight', 'Rotate right', () => this.rig.rotateBy(Math.PI / 4)),
      ib('up', 'Look from higher', () => this.rig.tiltBy(deg(15))),
      ib('down', 'Look from lower', () => this.rig.tiltBy(deg(-15))),
      autoBtn,
      ib('recenter', 'Reset view', () => this.goHome())
    );
    this.ui.root.append(view);
    this.viewCtl = view;
    document.getElementById('btn-help').addEventListener('click', () => {
      this.ui.openModal(
        h(
          'div',
          {},
          h('h2', {}, 'How to play'),
          h('ul', {}, [
            'Drag to rotate the islands, scroll or pinch to zoom, right drag to pan. Use the ↺ ↻ ▲ ▼ buttons or ⟳ Auto for a turntable.',
            'Press 🏎 Drive to take a car out from the cockpit: W/↑ go, S/↓ brake, A/D steer, Space DRS, C camera, Esc leave.',
            'Click any island, the grandstand, pit building, watch tower or podium to walk straight in (WASD or arrows, drag to look, Esc to leave).',
            'Hover or long press anything to see who it is; click or tap to visit.',
            'Tab cycles through cars, drivers and crew; Enter selects; Escape goes back.',
            'Talk to a race engineer or the pit crew to start the pit stop challenge.',
            'Strategists show live lap times and pick the next tire.',
            'Take a garage car out for a lap, then celebrate on the podium.',
          ].map((t) => h('li', {}, t))),
          h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.ui.closeModal() }, 'Got it'))
        )
      );
    });
    this.ui.back.addEventListener('click', () => this.goHome());
  }

  setRain(on) {
    this.rain = on;
    this.rainFx.lines.visible = on;
    for (const t of this.teams) for (const c of t.cars) if (c.drive) c.drive.rain = on;
    this.hemi.intensity = on ? 0.75 : 1.05;
    this.sun.intensity = on ? 1.3 : 2.6;
    this.post.grade.uniforms.saturation.value = on ? 0.88 : 1.02;
    if (on) {
      for (const t of this.teams.filter((x) => x.launch)) this.nextCompound[t.data.id] = 'intermediate';
      this.ui.toast('Rain! Strategists switched the next stop to intermediates.', { icon: '🌧', accent: '#2D7FF9' });
    }
  }

  // ---- Frame ------------------------------------------------------------------------

  // Run fn after `sec` seconds of game time (keeps scripted beats in sync with the sim).
  after(sec, fn) {
    this.timers.push({ at: this.time + sec, fn });
  }

  toScreen(v) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (p.x * 0.5 + 0.5) * r.width + r.left, y: (-p.y * 0.5 + 0.5) * r.height + r.top };
  }

  update(dt) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      due.forEach((t) => t.fn());
    }
    for (const t of this.teams) for (const c of t.cars) c.drive?.update(dt);
    for (const d of this.drivers) {
      if (d.inCar && d.car.drive) d.seated.anim.params.lean = THREE.MathUtils.clamp((d.car.drive.smp.curv || 0) * 8, -1, 1);
    }
    for (const a of this.actors) if (a.root.visible) a.update(dt);
    if (this.me) animateCharacter(this.me.root, dt);
    this.pitChallenge.update(dt);
    this.engineer.update(dt);
    this.explorer.update(dt);
    this.audio.update(this.explorer.active || this.player.active || this.engineer.active || !!this.pitChallenge.fp);
    this.updateCelebration(dt);
    this.particles.update(dt);
    this.rainFx.update(dt, this.rig.controls.target);
    this.grandstand.userData.update(this.time, this.celebrating ? 1 : this.pitChallenge.phase === 'running' ? 0.6 : 0);
    this.podium.userData.update(this.time, this.celebrating ? 1 : 0);
    this.clouds.userData.update(this.time);
    this.tower.userData.update(this.time);
    if (this.time - (this.boardDrawn ?? -9) > 1) {
      this.boardDrawn = this.time;
      this.tower.userData.drawBoard(this.standings().map((c) => ({ label: `${c.number} ${c.driver ? surname(c.driver.data.name).toUpperCase() : c.teamRef.data.name.split(' ')[0].toUpperCase()}`, color: c.teamRef.data.primary })));
    }

    // Rain spray off the rear tires of moving cars.
    if (this.rain) {
      for (const t of this.teams) for (const c of t.cars) {
        const d = c.drive;
        if (!d || d.v < 5) continue;
        for (const k of ['RL', 'RR']) {
          const p = c.wheels[k].getWorldPosition(V(0, 0, 0));
          const back = V(-Math.sin(c.root.rotation.y), 0.6, -Math.cos(c.root.rotation.y)).multiplyScalar(d.v * 0.25);
          this.particles.emit({ pos: p.add(V(0, -0.2, 0)), vel: back, color: '#e8f2fb', life: 0.7, size: 0.35, gravity: -3, drag: 2, spread: 2, count: 2 });
        }
      }
    }

    // Keep the hover tag on its asset.
    if (this.hoverEntry) {
      const e = this.hoverEntry;
      const p = this.toScreen(e.anchor.getWorldPosition(V(0, 0, 0)).add(V(0, e.kind === 'car' ? 1.2 : 0.45, 0)));
      this.ui.moveTag(p.x, p.y);
    }
  }
}

function motifName(m) {
  return { rays: 'Sun rays', waves: 'Aurora wave', chevrons: 'Feather chevrons', pinstripes: 'Pinstripes and roundel', grid: 'Technical grid' }[m] || m;
}

function loadUnlocked() {
  try {
    return JSON.parse(localStorage.getItem('skycircuit.unlocked') || '[]');
  } catch {
    return [];
  }
}
function saveUnlocked(v) {
  try {
    localStorage.setItem('skycircuit.unlocked', JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}
