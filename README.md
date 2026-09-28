# Sky Circuit

A toy-scale racing diorama on floating islands, built procedurally in three.js
from the *Sky Circuit: Cars, Drivers & Crew Modeling Spec*. All teams, drivers
and branding are original.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest: pit stop rules, track/pit geometry, spec data
npm run build    # static site in dist/
```

## What's in this build

Covers build-order steps 1 to 3 and most of 4 and 5 from the spec:

- **World**: the main circuit island (443 m lap, kerbs, tire walls, grid, start line),
  pit lane with box marks, pit building with five team garages, grandstand with
  an animated crowd, a podium island on a bridge, drifting islands and clouds.
  Warm key light with soft shadows, sky fill, tilt-shift blur and a light grade
  for the miniature look.
- **Cars**: one procedural single seater (4.8 m, 1.9 m wide, 3.0 m wheelbase,
  0.84 m wheels) with the spec's rig: `car_root` > body, axles, wings, with
  steer, wheel, flap and rain light nodes as the only animated parts. Liveries
  for all five teams are painted into one atlas per car through shared zone
  masks. Tire compound bands, tire blankets and stands for the garage state.
- **Car states**: rolling (wheel spin, steering up to 25°, 2° pitch and roll),
  boost (rear flap to 60° on straights), rain (4 Hz rain light, spray), garage,
  pit stop (0.12 m lift, wheels off and on).
- **People**: one modular kit (rigidly skinned, Mixamo bone names) for drivers,
  engineers and crew; helmets from base color + one of 8 patterns + chin number
  + surname. 30+ procedural clips (idle, walk, wave, helmet on/off, seated
  driving, kneel, gun on/off, tire pull/fit, jack lift, radio talk, typing,
  trophy lift, champagne spray and more).
- **Launch teams**: Solaris Racing and Nordlys GP with 2 drivers and 16 crew
  each. Kestrel, Ironbark and Meridian cars sit in their garages as display pieces.
- **Pit stop challenge**: the car boxes, you tap the four corners in the shown
  order, the crew plays the 2.4 s choreography, jacks drop and the release light
  goes green. Wrong corners cost a 0.3 s fumble. Best time is saved locally and
  there's a shareable result card (holo border under 2.4 s).
- **Interactions**: every asset has hover (2 px rim in the team accent, 150 ms
  fade), click (0.8 s eased camera move plus an info card) and a deeper action:
  livery viewer and *Take it out* for cars, emotes and helmet off for drivers,
  pit challenge from engineers and crew, live timing and tire choice from
  strategists, podium picks with champagne. Tab/Enter/Escape work everywhere,
  touch uses tap and long press, and reduced motion swaps glides for fades.

## Not yet done

- Character creator, glTF export and LODs (build step 6).
- Performance pass: the scene is about 290k triangles, under the 400k target,
  but still around 300 draw calls against the target of 100. Instancing the crew
  and crowd and adding LODs is the next step.
- The spec's open questions (working title, phones from day one, launch pair)
  are still open. The layout already works at phone width.

## Layout

```
src/data.js            palette, teams, compounds, drivers, pit timing
src/car/               car mesh + rig, livery atlas painter
src/people/            person kit, helmets, animation clips, walking actors
src/world/world.js     islands, track surfaces, buildings, trees, clouds, sky
src/game/              layout, paths and speed profile, driving, paddock,
                       pit stop rules and challenge, game controller
src/fx/                post stack (outline, tilt-shift, grade), particles, rain
src/camera.js          orbit rig with eased glides
src/interact.js        hover, click, keyboard and touch
```
