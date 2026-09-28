// Builds each team's garage contents: cars, drivers and the 16 person crew.
// Launch teams (Solaris, Nordlys) are fully staffed; the other three show a
// static display car in their garage.

import * as THREE from 'three';
import { createCar } from '../car/car.js';
import { createPerson, SKIN, HAIR } from '../people/person.js';
import { Actor } from '../people/actor.js';
import { bevelBox, merge, rod, tint } from '../geo.js';
import { TEAMS, DRIVERS, surname, CORNERS } from '../data.js';
import { GARAGE_X, PIT_Z, GARAGE_FRONT_Z, DECK_X, DECK_Z } from './layout.js';
import { buildPitWallDeck, seatPos } from '../world/pitwall.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GARAGE_CAR_Z = GARAGE_FRONT_Z - 4.6;

// Car-local (x = left, z = forward) to world, for a car boxed at bx facing +X.
export const boxToWorld = (bx, lx, lz) => V(bx + lz, 0, PIT_Z - lx);
export const boxHeading = (localHeading) => localHeading + Math.PI / 2;

// Seeded variety for faces and hair.
let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function crewPerson(team, outfit, extra = {}) {
  return createPerson({
    colors: team,
    outfit,
    female: rnd() < 0.4,
    skin: pick(SKIN),
    hair: pick(HAIR),
    hairStyle: Math.floor(rnd() * 6),
    build: pick(['slim', 'standard', 'standard', 'broad']),
    ...extra,
  });
}

function jackProp(team) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    merge([tint(bevelBox(0.5, 0.12, 0.35, 0.03).translate(0, 0.1, 0), team.primary), tint(bevelBox(0.4, 0.06, 0.12, 0.02).translate(0, 0.22, 0.12), '#1b1c1f')], { color: true }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })
  );
  body.castShadow = true;
  const lever = new THREE.Group();
  lever.position.set(0, 0.16, -0.15);
  const bar = new THREE.Mesh(merge([rod(V(0, 0, 0), V(0, 0, -1.3), 0.025), bevelBox(0.4, 0.05, 0.05, 0.015).translate(0, 0, -1.3)]), new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.7, roughness: 0.3 }));
  bar.castShadow = true;
  lever.add(bar);
  lever.rotation.x = -0.55;
  g.add(body, lever);
  g.userData.lever = lever;
  return g;
}

function releaseBoxProp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(rod(V(0, 0, 0), V(0, 2.3, 0), 0.03), new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.6, roughness: 0.3 }));
  const box = new THREE.Mesh(bevelBox(0.3, 0.5, 0.2, 0.03).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.5 }));
  const lightMat = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 2 });
  const light = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), lightMat);
  light.position.set(0, 2.5, 0.101);
  g.add(pole, box, light);
  g.traverse((o) => (o.castShadow = true));
  g.userData.setGreen = (on) => {
    lightMat.color.set(on ? '#35d45a' : '#ff3b30');
    lightMat.emissive.set(on ? '#35d45a' : '#ff3b30');
  };
  return g;
}

export function buildTeams(scene, { track, pit }) {
  const teams = [];
  TEAMS.forEach((t, i) => {
    const gx = GARAGE_X[i];
    const team = { data: t, gx, box: V(gx, 0, PIT_Z), cars: [], drivers: [], crew: {}, crewList: [], launch: t.launch };
    teams.push(team);

    // Garage car (display car for non launch teams).
    const garageCar = createCar({ team: t, number: t.numbers[0], compound: 'soft' });
    garageCar.root.position.set(gx, 0, GARAGE_CAR_Z);
    garageCar.setGarage(true);
    scene.add(garageCar.root);
    garageCar.home = { pos: garageCar.root.position.clone(), heading: 0 };
    team.cars.push(garageCar);
    team.garageCar = garageCar;
    garageCar.teamRef = team;
    if (!t.launch) {
      garageCar.display = true;
      return;
    }

    // Lapping car with a seated driver.
    const trackCar = createCar({ team: t, number: t.numbers[1], compound: 'medium' });
    scene.add(trackCar.root);
    trackCar.teamRef = team;
    team.cars.push(trackCar);

    // Drivers: one standing next to the garage car, one seated in the track car.
    for (const car of [garageCar, trackCar]) {
      const d = DRIVERS.find((x) => x.number === car.number);
      const helmet = { ...d.helmet, number: d.number, name: surname(d.name) };
      const look = { colors: t, outfit: 'race', helmet, female: ['Inés Calder', 'Sigrid Holm', 'Amara Okafor', 'Priya Raman', 'Noor Haddad'].includes(d.name), skin: pick(SKIN), hair: pick(HAIR), hairStyle: Math.floor(rnd() * 6), build: 'slim' };
      const standing = new Actor(createPerson({ ...look, name: `driver_${d.number}` }), { role: 'driver', info: d });
      const seated = createPerson({ ...look, name: `driver_${d.number}_seated` });
      const seatedActor = new Actor(seated, { base: 'drive_seated_loop' });
      seated.root.scale.setScalar(0.82);
      seated.root.position.set(0, -0.62, -0.12);
      car.nodes.seat.add(seated.root);
      const driver = { data: d, team, car, standing, seated: seatedActor, inCar: car === trackCar };
      standing.place(V(gx + (car === garageCar ? 2.3 : -2.4), 0, GARAGE_FRONT_Z - 1.2), 0.2);
      scene.add(standing.root);
      standing.root.visible = !driver.inCar;
      seated.root.visible = driver.inCar;
      car.driver = driver;
      team.drivers.push(driver);
    }

    // Crew: 16 people from the modular kit.
    const crew = team.crew;
    const add = (key, actor, pos, heading) => {
      actor.place(pos, heading);
      scene.add(actor.root);
      crew[key] = actor;
      team.crewList.push(actor);
      return actor;
    };
    const eng = crewPerson(t, 'polo', { props: [{ kind: 'tablet', socket: 'handR', pos: [0, -0.02, 0.06], rot: [0.3, 0, 0] }, { kind: 'headset', socket: 'head' }] });
    add('engineer', new Actor(eng, { base: 'radio_talk_loop', role: 'engineer' }), V(gx + 4.3, 0, GARAGE_FRONT_Z - 0.6), 0.3);
    const strat = crewPerson(t, 'jacket', { props: [{ kind: 'glasses', socket: 'head', pos: [0, 0.03, 0.125] }, { kind: 'headset', socket: 'head' }] });
    add('strategist', new Actor(strat, { base: 'typing_loop', role: 'strategist' }), V(gx - 3.9, 0, GARAGE_FRONT_Z - 2.3), -Math.PI / 2);
    const boss = crewPerson(t, 'jacket', { props: [{ kind: 'cap', socket: 'head', pos: [0, 0.02, 0] }, { kind: 'headset', socket: 'head' }] });
    add('principal', new Actor(boss, { base: 'arms_crossed_loop', role: 'principal' }), V(gx + 4.6, 0, GARAGE_FRONT_Z - 5.6), -Math.PI / 2);
    for (let m = 0; m < 2; m++) {
      const mech = crewPerson(t, 'overalls', { props: [{ kind: 'cap', socket: 'head' }, { kind: 'wrench', socket: 'handR', pos: [0, -0.05, 0.05], rot: [Math.PI / 2, 0, 0] }] });
      add(`mechanic${m}`, new Actor(mech, { base: m ? 'crouch_inspect' : 'wrench_loop', role: 'mechanic' }), m ? V(gx + 1.6, 0, GARAGE_CAR_Z + 1.6) : V(gx - 1.5, 0, GARAGE_CAR_Z - 1.5), m ? -Math.PI / 2 : Math.PI / 2);
    }

    // Pit crew: lined up along the garage sides until a stop is called.
    const homes = [];
    for (let k = 0; k < 11; k++) {
      const side = k % 2 ? 1 : -1;
      homes.push({ pos: V(gx + side * (2.9 + (k % 4 > 1 ? 0.9 : 0)), 0, GARAGE_FRONT_Z - 5.4 - Math.floor(k / 2) * 0.55 + (k % 4 > 1 ? 1.8 : 0)), heading: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    let h = 0;
    const pitCrew = (key, outfit, props, role, kneePads = false) => {
      const p = crewPerson(t, outfit, { crewHelmet: true, props, kneePads });
      const home = homes[h++];
      return add(key, new Actor(p, { role }), home.pos, home.heading);
    };
    pitCrew('frontJack', 'fire', [], 'front_jack');
    pitCrew('rearJack', 'fire', [], 'rear_jack');
    for (const c of CORNERS) pitCrew(`gun_${c}`, 'fire', [{ kind: 'wheelgun', socket: 'handR', pos: [0, -0.04, 0.12], rot: [Math.PI / 2, 0, 0] }], 'wheel_gunner', true);
    for (const c of CORNERS) pitCrew(`tire_${c}`, 'fire', [], 'tire_changer');
    pitCrew('release', 'fire', [], 'release');
    team.pitCrew = ['frontJack', 'rearJack', ...CORNERS.map((c) => `gun_${c}`), ...CORNERS.map((c) => `tire_${c}`), 'release'].map((k) => crew[k]);

    // Pit props, shown when the crew goes out.
    team.jackF = jackProp(t);
    team.jackR = jackProp(t);
    team.releaseBox = releaseBoxProp();
    const bx = gx;
    team.jackF.position.copy(boxToWorld(bx, 0, 2.95));
    team.jackF.rotation.y = boxHeading(0);
    team.jackR.position.copy(boxToWorld(bx, 0, -2.75));
    team.jackR.rotation.y = boxHeading(Math.PI);
    team.releaseBox.position.copy(boxToWorld(bx, -2.6, 1.6));
    team.releaseBox.rotation.y = boxHeading(Math.PI / 2);
    for (const p of [team.jackF, team.jackR, team.releaseBox]) {
      p.visible = false;
      scene.add(p);
    }

    team.trackCar = trackCar;
  });

  // Pit wall decks for the first four teams, side by side. Launch teams seat
  // their race engineer, strategist and team principal there; everyone else
  // on the decks is a data engineer.
  teams.slice(0, DECK_X.length).forEach((team, k) => {
    const t = team.data;
    const deck = buildPitWallDeck(t);
    deck.position.set(DECK_X[k], 0, DECK_Z);
    scene.add(deck);
    team.desk = deck;
    team.deckCrew = [];
    const roles = ['data', 'engineer', 'principal', 'strategist', 'data'];
    roles.forEach((role, i) => {
      let actor = team.crew[role];
      if (!actor) {
        const p = crewPerson(t, i % 2 ? 'jacket' : 'polo', { props: [{ kind: 'headset', socket: 'head' }] });
        actor = new Actor(p, { base: 'typing_loop', role: 'data_engineer' });
        team.deckCrew.push(actor);
      }
      const s = seatPos(i);
      // Hips sit on the stool top.
      const hipH = actor.person.bones.hips.position.y * actor.root.scale.y;
      actor.place(V(DECK_X[k] + s.x, s.y + 0.06 - hipH, DECK_Z + s.z), 0);
      actor.anim.params.seated = true;
      actor.anim.snap();
      scene.add(actor.root);
    });
  });
  return teams;
}

// Where each pit crew member stands for a stop, as car-local positions.
export function pitStations(team) {
  const bx = team.gx;
  const st = {};
  const at = (lx, lz, lh) => ({ pos: boxToWorld(bx, lx, lz), heading: boxHeading(lh) });
  st.frontJack = { ...at(0, 3.6, Math.PI), clip: 'jack_ready_loop' };
  st.rearJack = { ...at(0, -3.45, 0), clip: 'jack_ready_loop' };
  st.release = { ...at(-2.25, 1.25, Math.PI / 2), clip: 'watch_loop' };
  for (const c of CORNERS) {
    const s = c[1] === 'L' ? 1 : -1;
    const z = c[0] === 'F' ? 1.5 : -1.5;
    st[`gun_${c}`] = { ...at(s * 1.45, z, -s * Math.PI / 2), clip: 'kneel_ready_loop' };
    const cz = z + (z > 0 ? 0.75 : -0.75);
    st[`tire_${c}`] = { ...at(s * 1.75, cz, Math.atan2(-s * 0.85, z - cz)), clip: 'idle_loop', side: s, z: cz };
  }
  return st;
}
