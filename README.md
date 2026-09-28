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

- **World**: the circuit is split across four floating islands, joined by
  track bridges (concrete deck, jersey barriers, catch fencing, lamp posts and
  steel arches underneath):
  - **Pit island**: main straight, start-light gantry, pit lane with box marks,
    pit building with five team garages.
  - **Grandstand island**: covered grandstand with team-colored seat blocks, a
    seated crowd that cheers, team flags and a video screen.
  - **Watch tower island**: race-control tower with a glass lobby, observation
    pod, beacon mast and a live timing board.
  - **Podium island**: a raised balcony podium, after the Monza one. It sits
    7 m up on a base building and overhangs a standing crowd waving flags. It has
    a curved branded front band, a glass balustrade, steps 1 to 3, a curved LED
    backdrop and staircases on both sides.

  Island shapes follow the track, and the undersides are layered soil and rock.
  The palette is warm and hazy, with olive greens and soft clouds, plus
  tilt-shift for the miniature look.
- **Cars**: one procedural single seater (4.8 m, 1.9 m wide, 3.0 m wheelbase,
  0.84 m wheels) with the spec's rig: `car_root` > body, axles, wings, with
  steer, wheel, flap and rain light nodes as the only animated parts. Liveries
  for all five teams are painted into one atlas per car through shared zone
  masks. Tire compound bands, tire blankets and stands for the garage state.
- **Car states**: rolling (wheel spin, steering up to 25°, 2° pitch and roll),
  boost (rear flap to 60° on straights), rain (4 Hz rain light, spray), garage,
  pit stop (0.12 m lift, wheels off and on).
- **People**: every driver, engineer, strategist, principal and crew member is
  a card character (the same blocky model as the creator), built from their
  team colors and outfit: team stripes for drivers, classic suits and visor-down
  helmets for the pit crew, hair and headsets for the pit wall. Each one is
  baked into a single skinned mesh with a shared texture atlas (one or two
  draw calls a person) at a lighter game detail level, and driven by the same
  30+ procedural clips (idle, walk, wave, helmet on/off, seated driving, kneel,
  gun on/off, tire pull/fit, jack lift, radio talk, typing, trophy lift,
  champagne spray and more).
- **Live styling**: 🎨 Style on a driver, the race engineer or the strategist
  changes suit, team colour, gloves, skin, eyebrows, mouth, helmet on/off,
  visor, helmet colour or hair on the spot; 🎨 Team kit restyles a whole pit
  crew. Looks are saved in this browser.
- **Launch teams**: Solaris Racing and Nordlys GP with 2 drivers and 16 crew
  each. Kestrel, Ironbark and Meridian cars sit in their garages as display pieces.
- **Pit stop challenge**: the car boxes, you tap the four corners in the shown
  order, the crew plays the 2.4 s choreography, jacks drop and the release light
  goes green. Wrong corners cost a 0.3 s fumble. Best time is saved locally and
  there's a shareable result card (holo border under 2.4 s).
- **Rotate the islands**: drag to orbit all the way round, from nearly level to
  overhead (8° to 85°), and scroll or pinch to zoom. The ↺ ↻ ▲ ▼ buttons step
  the view, ⟳ Auto turns it like a turntable, and ⌂ resets it.
- **Drive**: take Calder's #4 or Holm's #8 out yourself from the *Drive* button,
  a garage car's card, or the pit island's walking panel.
  - **Cockpit view** like an F1 onboard shot: the halo and centre pillar, and a
    steering wheel that turns with the front wheels. Its screen shows gear,
    speed and lap time, with rev LEDs and buttons.
  - **Other cameras**: C switches to the T-cam or a chase camera.
  - **Handling**: real-time vehicle dynamics. A bicycle model with slip-angle
    tires and a friction circle per axle, downforce, rear-wheel drive with
    traction control, front/rear brake balance and a handbrake (Shift or X).
    The car slides, drifts, understeers on the brakes and needs countersteer;
    grass and rain cut grip. Tire smoke and a drift-angle readout show the
    slide. DRS on the straights (Space). Walls sit at the track edge and
    tighter barriers on the bridges; sliding along a wall doesn't stop you.
  - **Lap timing** with a best lap saved on this device.
  - **Controls**: W/↑ throttle, S/↓ brake and reverse, A/D or ←/→ to steer,
    Shift/X handbrake, Esc to leave. Phones get on-screen pedals, steering and
    a Drift button.
- **Pit wall**: four team decks side by side between the pit wall and the pit
  lane, with the race engineer, team principal, strategist and data engineers
  seated facing the track.
- **Walk in**: one click on the grandstand, pit building, watch tower, podium, or
  anywhere on an island's ground takes you straight in to explore it on foot at
  eye level. You can also use the *Walk in* button. WASD or
  arrows walk, Shift runs, Q/E or ←/→ turn, drag looks around, and phones get
  a joystick. You can climb the grandstand rows and the podium staircases onto
  the balcony, take the lift up the tower to the observation deck, or jump to
  the pit wall, the start line or either launch team's garage. The walking panel
  also has each area's actions: a pit stop challenge for either launch team,
  live timing at the tower, and podium picks and replays. Engines are
  positioned in 3D and pitch up with speed; the crowd gets louder near the stands.
- **Interactions**: every asset has hover (2 px rim in the team accent, 150 ms
  fade), click (0.8 s eased camera move plus an info card) and a deeper action:
  livery viewer and *Take it out* for cars, emotes and helmet off for drivers,
  pit challenge from engineers and crew, live timing and tire choice from
  strategists, podium picks with champagne. Tab/Enter/Escape work everywhere,
  touch uses tap and long press, and reduced motion swaps glides for fades.

## Driver cards

`/card/` is a collectible card page built from the Figma export (`card/css/main.css`
and `card/index.html`). It keeps the export's structure, class names and card
sizes. Each card shows one team's garage-car driver, with art rendered from the
game.

The card has a parallax tilt that follows the mouse, or the phone's tilt:
- the glow, face, art, name and details sit at different depths;
- the art slides inside its panel;
- a shine follows the pointer, and a rainbow hologram foil slides across the card as it tilts (it drifts slowly when the card is at rest);
- the circuit background drifts the other way.

Use ‹ › or the arrow keys to switch cards. The tilt switches off when the
system is set to reduce motion.

## Character creator

`/creator/` lets players make their own blocky low-poly character, built from
the character reference sheet:

- five presets: The Ace (hands on hips), Race Engineer (tablet), The Rookie
  (waving, visor down), Wheel Gunner (crouched with a wheel gun) and The
  Veteran (arms crossed, visor down);
- suit (team stripes, classic, star slash, diamond), team colour, suit base,
  gloves (dark mitts, star, star in team colour, bare hands), skin tone,
  eyebrows (determined, straight, arched, none), mouth (smile, big grin,
  serious, smirk), visor up or down, visor tint, held prop, name and number;
- poses: hands on hips, check the tablet, wave, ready stance, arms crossed,
  thumbs up, jump.

The suits carry an original Sky Circuit stripe mark, not a real series logo.
The name must be 3 to 16 characters. The number must be 2 to 99 and can't be a
team driver's number. The character stands on a green winner's podium. Saving keeps the character in
this browser. It then shows up, head to toe on the podium, as the first card on
`/card/` ("My card", with a rainbow holo rim and a gold tag) and stands in the paddock next to
the first team's garage. Click it there to play a pose or edit it.

## Learn

`/learn/` shows a 2026-style car in 3D (the uploaded FBX, converted to a
meshopt-compressed GLB in real meters: 29.7 MB FBX → 2.3 MB GLB, simplified
from 1.47M triangles). Eight numbered hotspots cover what the 2026 rules
change: size and weight, active front and rear wings, the half-electric power
unit, the overtaking boost, the simpler floor, narrower tyres, and the halo
and crash structures. Picking one flies the camera there and shows notes with
key figures. You can repaint the bodywork, spin the car and take a four
question quick check.

## Not yet done

- glTF export and LODs (build step 6).
- Performance pass: the scene is about 400k triangles, right at the 400k target,
  and still around 420 draw calls against the target of 100. Instancing the crew
  and crowd and adding LODs is the next step.
- The spec's open questions (working title, phones from day one, launch pair)
  are still open. The layout already works at phone width.

## Layout

```
src/data.js            palette, teams, compounds, drivers, pit timing
src/car/               car mesh + rig, livery atlas painter
src/people/            person kit, helmets, animation clips, walking actors
src/world/world.js     island builder, track surfaces, pit building, clouds, sky
src/world/podium.js    raised balcony podium and standing crowd
src/world/circuit.js   four-island layout, track bridges, grandstand, watch tower,
                       start gantry, trackside boards
src/game/              layout, paths and speed profile, driving, paddock,
                       pit stop rules and challenge, game controller
src/fx/                post stack (outline, tilt-shift, grade), particles, rain
src/camera.js          orbit rig with eased glides, rotate/tilt/turntable
card/                  Figma card page: index.html, css/main.css, js/card.js, images/
creator/               character creator page: index.html, creator.css, creator.js
src/character/         blocky character: recipe.js (options, presets, saving), blocky.js (model, poses)
src/drive.js           drive mode: physics, cockpit/T-cam/chase cameras, wheel display, laps
src/explore.js         walk mode: places, viewpoints, walkable surfaces, collisions
src/audio.js           procedural engine and crowd sound
src/interact.js        hover, click, keyboard and touch
```
