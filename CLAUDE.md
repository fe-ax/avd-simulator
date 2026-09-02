# AVD Simulator

A first-person rehearsal tool for the **AVD** (*verkeersdeelneming*) part of the Dutch motorcycle
practical exam. It is not a driving game: it exists so a student can rehearse **the timing of
looking and acting in traffic**, and then see afterwards exactly when they looked versus when they
should have.

Eight scenarios:

1. *Rechtsaf de Kerkstraat in* — a right turn across a vrijliggend fietspad, with a snorfiets
   coming up the inside. Teaches the look sequence and the dode hoek.
2. *Auto van rechts remt* — a plain crossroads, straight on, with priority; a car arrives from the
   right far too fast and stops with its front wheels over the haaientanden. **Without that
   emergency stop it would hit you** — `zicht.test.ts` takes the cue away and checks the two bodies
   genuinely overlap — so the rider who reads it and eases off is the only reason it is dull.
   Teaches that having priority is not the same as being given it. Built in the scenario builder;
   the provenance and what has been hand-edited since are in the header of
   `scenario.auto-van-rechts.ts`.
3. *Invoegen op de A12* — a motorway merge from an on-ramp into a gap between a car ahead and a
   truck coming up behind. Teaches speed matching and following distance.
4. *Inhalen op de A12* — open motorway, two lorries nose to tail at 90, busy left lane. Teaches
   waiting for a gap, and **not** tucking back in between the lorries.
5. *Uitvoegen op de A12* — three lorries nose to tail at 90, a clear left lane, and an afrit whose
   uitvoegstrook you are meant to be in inside its first fifth. Teaches that the fast, available,
   obviously-fun option — past all three at 130, back across, into the strook halfway down — is the
   fault being taught, and that sitting behind a wall of lorry is the answer. The approach is 620 m
   with the convoy 80 m ahead, and those two numbers are the exercise: **hold 105 and you reach the
   back of the lorry before you reach the exit.** Shorter, and you could ignore the whole lesson and
   still pass. **Built entirely in the scenario builder** and exported unedited, like scenario 2.

6. *Linksaf de Molenweg in* — a left turn on a voorrangsweg across an oncoming car that is not
   going to yield. The first exercise that turns left and the first where the rider gives way, and
   between them they turned up four places that quietly assumed a right turn onto a road where
   somebody else waits — including that **no junction scenario could raise an incident at all**.
   Teaches that priority over the side road is not priority over the tegenligger.
7. *Voorrang van rechts* — a gelijkwaardig kruispunt, the deliberate inverse of 2 on the same
   crossroads. Nothing painted, nothing signed, and the car takes what is its. The pair is the
   point: two roads that look identical from the saddle, opposite obligations, and the only thing
   telling them apart is what is *not* on the tarmac.
8. *Voorrang verlenen op de zijweg* — the rider behind the haaientanden for once, with the car
   coming from the **left**, directly after 7 has taught them to look right. Teaches that teeth
   mean give way to that road, and a road has two directions. Its reveal table is flat for a reason
   worth reading — see below.

The UI is Dutch. Code, comments and commit messages are English.

---

## Commands

```bash
npm run dev      # vite dev server; :5173 by default, next free port if taken
npm test         # vitest run — two projects: `sim` in node, `ui` in jsdom
                 #   npx vitest run --project sim   the simulation, no DOM, ~2s
npm run build    # tsc -b && vite build
```

Node version is pinned in `.nvmrc` (24.x, the current LTS line). The two test projects are defined
under `test.projects` in `vite.config.ts` — they lived in `vitest.workspace.ts` until Vitest 4
removed `defineWorkspace`, and that removal is quiet in the worst way: the file is simply ignored,
so every UI test runs in Node and reports `document is not defined` as though the tests were wrong.
`npm run build` is the only typecheck that covers everything;
`npx tsc -b --noEmit` is the quick version.

**Always run `npm test` and `npm run build` before committing, and `rm -rf dist` after building.**

**GitHub work on this repo runs as `fe-ax`.** The machine's default `gh` account is
enterprise-managed and fails there with *"Unauthorized: As an Enterprise Managed User"* — which
reads like a broken command rather than the wrong identity, and costs you a while. `gh auth status`
says which is active:

```bash
gh auth switch --user fe-ax
```

Git itself pushes over SSH and does not care; this is only `gh`.

---

## The one idea

**Perception is a consequence of geometry, not a model of it.**

An earlier version of this had six hand-authored gaze cones and a `perceived` flag that a button
press flipped. Every round of tuning was an argument about where to put the edge of an abstraction.
The blind spot was the gap between two numbers.

Now there is one forward view — the camera's own field — and two mirrors that are real cameras
rendering real reflections. An actor is perceived when it is genuinely on screen. The dode hoek is
simply where those three fields stop reaching. **No line of code names it.**

The numbers in `src/sim/perception.ts` (`FORWARD_VIEW`, `MIRROR_VIEW`) are **measurements of the
rendered scene, not choices**. When the scene changes, re-measure and update them — do not tune
them to make a test pass. `mirrors.ts:warnIfModelDrifted()` shouts in dev if the rendered geometry
and the model part company on aim, half-field or pitch.

The load-bearing consequence, which nothing declares and which you should re-measure after any
change to the view:

```
scenario 1        full reeks        snorfiets first seen at   8.1s   (right mirror, step 4)
                  no mirrors                                 15.5s   (schouderblik, step 8)
                  no looks at all                            16.9s   (once it has overtaken)

scenario 2        full reeks        car from the right at      3.4s   (through the windscreen)
                  no mirrors                                  3.4s   (mirrors cannot see it)
                  no looks at all                             7.7s   (as it arrives)

scenario 3        full reeks        truck first seen at        3.8s   (left mirror)
                  no mirror                                   never   (see below)
                  no looks at all                             never   (see below)

scenario 4        every column identical: lorries at 0.0s and 4.8s, cars at 3.0s and 6.0s

scenario 5        every column identical: all three lorries at 0.0s

scenario 6        every column identical: tegenligger at 4,4s (see below)

scenario 7        full reeks        car from the right at      2,1s   (looking right, step 2)
                  no mirrors                                  2,1s   (no mirror points there)
                  no looks at all                            13,8s   (once it is nearly on you)

scenario 8        every column identical: car from the left at 11,8s (see below, and it is a bug
                  in the look vocabulary rather than in the scenario)
```

**Perception has no occlusion.** `perception.ts` is purely angular — bearing, distance, a frustum —
so a house standing between the rider and an actor is something the screen shows and the model does
not know about. Nothing in the suite notices, because every check downstream of perception believes
it. On scenario 2 that gap *was* the exercise: the terraces hid the car until 7,4 s, it started
braking at 6,5 s, and the model credited the look at 3,4 s. A trick question that measured as a
clean ride. The junction's `openCorners` is the answer for now — the sight line as scenario data,
per corner, so opening the one the rider must look into does not flatten the other three — and
`zicht.test.ts` traces the actual line and fails if the two drift apart again. Real occlusion in
`perception.ts` would be the proper fix and is a much bigger change.

Scenario 2's flat mirror column is not a bug: the car comes from the right, through the windscreen,
so no mirror can reach it and the two columns *should* agree. The column that carries the lesson
there is the third one — 3,4s against 7,9s is what looking buys you. The builder's reveal table now
reads each row and says which of these it is rather than assuming the motorway case.

Scenario 4's flat table is not a bug either, and it is a different flatness from scenario 3's
`never`. Everything there is ahead of you or comes past you, so the forward view finds all of it at
the same moment whatever you do with your head. What the mirrors change is not *when you see* the
traffic but *whether you know it is safe to move* — which is why that scenario's proof is the
incident tests (`ignoreTraffic` puts two cars on the brakes) rather than this table.

Scenario 6 is flat for scenario 2's reason and more so: the tegenligger comes straight at you down
your own road, so no mirror can reach it and no head movement changes when the forward view finds
it. The 4,4 s is purely `FORWARD_VIEW.maxDist` — 253 m of closing gap at a combined 27,8 m/s leaves
130 m at 4,42 s. The reeks there is about the traffic *behind* you and the exercise is about the car
in front; the lesson is carried by the incident, not by this table.

Scenario 7 is the first row in this project whose three columns genuinely differ, and it is what a
scenario about looking is supposed to look like. The car sits ~44° off the nose on the approach and
the forward view reaches 31°, so riding in staring straight ahead really does hide it for eleven and
a half seconds.

**Scenario 8 is flat for a third reason, and it is the one worth chasing.** Not scenario 4's
everything-is-ahead-of-you and not scenario 2's no-mirror-reaches-it: here there is something to
look at and *no look this tool has reaches it*. `EYE_LEFT` turns the head 25° and the forward view
adds 31°, so a glance covers to 56° off the nose; at the haaientanden the car is 87 m away and 72,9°
off it. Worse, a car near enough to sit inside 56° at the line is within 35 m of the junction — 2,6 s
away at fifty — while the rider still needs 5,8 s to cover the last 24 m. **The two requirements are
geometrically incompatible**, so no retiming of the traffic fixes it. The scenario still teaches and
still discriminates, but `wasPerceived` is `false` on its incident, which is the same finding wearing
different clothes: everywhere else here a kritiek means the rider saw the hazard and went anyway. The
missing piece is a look between the 25° glance and the 102° schouderblik; `BUILDER-GAPS.md` has it.
Reaching for `SHOULDER_LEFT` to close it would teach a student something false.

Scenario 5 is flat for scenario 4's reason, and completely so: the convoy sits close enough that
even the lead lorry's tail is inside `FORWARD_VIEW.maxDist` from the first frame. It was not always
— the first build put the convoy 160 m out, and that showed here as a lone 5,2 s while the exercise
itself was broken. **A row that is the odd one out is worth chasing before you explain it.** Holding
105 reached the exit with room to spare and scored *geslaagd*, so the rider could ignore the entire
lesson and pass; the approach is now 620 m and the convoy 80 m ahead, which means the road runs out
before the exit does. `uitvoegen.test.ts` asserts that contact happens while `d > 0`.

Its proof is the lane-change bands rather than this table — four tests ride it deliberately badly
and check which band catches them.

If those move, something about the view changed. That is either the point of your change or a bug;
know which.

That `never` is not a bug and is worth understanding before you "fix" it. Ride scenario 3 properly
and the truck is still three seconds back when you merge — seventy-odd metres, nowhere near the
blind spot — so the schouderblik genuinely cannot reveal it. Unlike scenario 1, the mirror is what
finds the hazard there. The check is still required, for the reason an examiner gives: no mirror
covers the strook beside you. A road user that really does sit in the dode hoek on that stretch
would be a good third actor and is the obvious next thing to add.

**The teller always shows what the machine is aiming for**, as `WorldView.targetSpeedKmh` — blue
while it is still climbing there, grey once it has arrived. Always, not only after a `SET_SPEED`:
a readout that stays blank until you happen to use one particular control looks broken rather than
empty, and is one nobody learns to read.

**A set speed is a fixed timespan, not a fixed acceleration.** `SET_SPEED` ramps linearly from
whatever you are doing to what you asked for in `SPEED_RAMP_S`, however big the jump. That is
unusual and deliberate: a rider practising a merge wants to know *when* they will be at speed, and
tying it to a rate makes the answer depend on where they started. The throttle steps keep the
ordinary physics — this is the cruise control, not the wrist, and the brake or the throttle
cancels it. A press with no value means the road's limit, because the keyboard cannot carry one and
falling through to zero would stop the machine dead on a motorway.

**A long vehicle is drawn corner by corner, not under one transform.** `withPose` takes the depth
at a sprite's centre and draws the whole thing at that one scale, which is right for a snorfiets
and wrong for a 16.5 m truck: its ends sit at different depths, so it has to come out as a
trapezoid lying on the road rather than a rectangle pasted on it. Vehicle bodies go through
`worldBox`, which projects each corner the way the road surfaces always have. Note the local frame
is **x forward, y to the vehicle's *right*** — despite what the older comment said, and it is the
axis that inverted the blinker once.

**Perception tests a vehicle's nose, middle and tail, not its centre.** It tested only the centre
until a 16.5 m truck existed, at which point a truck filling the whole of a shoulder check counted
as unseen until the rider drew level with the middle of the trailer.

---

## Layout

```
src/
  sim/          the simulation. View-agnostic. Imports NOTHING from render/ or scene/
    types.ts               every shared shape, including WorldView (the renderer's input)
    engine.ts              120 Hz fixed step, one dispatch() door, actor director
    perception.ts          the view frusta; measurements of the scene
    scoring.ts             pure. scoreRun + the sequence, prerequisite and incident rules
    route.ts               the racing line, as arcs and straights
    roadSurfaces.ts        the vocabulary, and dispatch on the kind of world
    surfaces/              one generator per kind of road; pure (layout, extent) -> Surface[]
    surfaces/signs.ts      road signs: posts, plate sizes, and how legs group into one sign
    scenarios.ts           the registry: the ones that ship, plus whatever this browser saved
    library.ts             scenarios somebody made, in localStorage
    scenarioFile.ts        a scenario or a ride as a file you can email
    starters.ts            empty scenarios, one per kind of road; what the builder derives from
    steering.ts            what the sturen controls mean; ONE body of that rule
    scenario.*.ts          pure data
    testDriver.ts          headless rider: drives the real engine through the real dispatch
    referenceRide.ts       what a model rider makes of a scenario — the builder's safety net
    validate.ts            geometry checks; shared by the tests and the builder
    scenarioExport.ts      a built scenario, as a file you can drop back into src/sim
    drafts.ts              builder autosave; validates a draft by trying to use it
    replay.ts / recorder.ts
    __tests__/
  scene/        three.js — the riding view
    Stage.ts               renderer, lights, camera rig, sync(view, head), render()
    buildWorld.ts          roadSurfaces -> meshes; houses, roofs, frontages, lamp posts
    rider.ts               the cockpit, and EYE_HEIGHT (the riding position lives here)
    mirrors.ts             two render targets, two reflected cameras, the focus haze
    signFaces.ts           sign faces drawn to canvas textures, cached by what they say
    head.ts                pointer lock, yaw/pitch limits, drag fallback
    gazeTargets.ts         dwell state machine; regions -> ControlId events
    gazeOverlay.ts         the DOM dots and reticle
    instrument.ts          the binnacle: speed, gear, indicator telltales
    actors3d.ts, coords.ts
  render/       the top-down canvas renderer — the review view, and the builder's
    camera.ts              ViewCamera (the interface) + the projective chase camera
    planCamera.ts          flat, north-up, invertible: the one the builder edits through
    builderOverlay.ts      route line, actor paths, drag handles
  ui/           React. RideView hosts three.js; MapView hosts the canvas
    files.ts               Blob out, file input in — the DOM half of scenarioFile.ts
    __tests__/             jsdom + Testing Library; the only part of the tree that needs a DOM
    builder/               the scenario builder: plan view, forms, validator, export
public/dev-driver.js       dev-only scripted rider, loaded by hand from the console
```

### Rules about the layout

1. **`src/sim/` must not import from `src/render/` or `src/scene/`.** It is the reason the
   renderer could be swapped wholesale without retyping the engine. If you need a type in both,
   it goes in `sim/types.ts`.
2. **`roadSurfaces.ts` is the single definition of where anything on the road is.** Both renderers
   read it. Do not put a marking's position in a renderer — the two views would eventually
   disagree, which is exactly the class of bug this seam exists to make impossible.
3. **Every input goes through `engine.dispatch(control, phase, source)`.** Clicking a button,
   pressing a key and resting your gaze on a dot all enter there. That single door is what makes
   the recording complete and the replay faithful. Never mutate engine state from the UI.
4. **`WorldView` is the whole contract between sim and any renderer.** If a renderer needs to know
   something, add it to `WorldView` and supply it from *both* `App.getLiveView()` and
   `ReplayPlayer.scene()` — otherwise the feature silently works live and breaks in replay.
5. **`Scenario.world` is tagged, and it tags the road *and* the route anchors together.** Tagging
   only the road would leave a motorway scenario supplying a dummy `approach`, and `buildRoutes`
   would throw inside the engine constructor. Pure data that lies is the one thing the eventual
   scenario editor must not be able to produce. Both `roadSurfaces()` and `buildRoutes()` dispatch
   on that single tag.
6. Scenarios and runs are **pure data**. Drag-and-drop scenario editing and post-editing of
   recordings are the stated future direction; nothing may become un-serialisable. Thresholds a
   teacher might disagree with — window bounds, headway bands — belong in the scenario, not in
   `scoring.ts`.
7. **A saved run outlives the code that made it.** `RunRecord` is persisted to localStorage, so a
   renamed field needs a migration in `recorder.ts` (there is one) and every replay must resolve
   its scenario through `scenarios.ts` by `record.scenarioId`, never from whatever is on screen.
8. **A scenario can also arrive from storage or from a file, and the ones that ship always win.**
   `scenarioById` looks in `ALL_SCENARIOS` before the library, so nothing a user saved or imported
   can redefine `rechtsaf-fietspad-v1` — a student's run of the real Kerkstraat replays against the
   real Kerkstraat whatever is in localStorage. `library.ts` refuses to save a shipped id, but a
   hand-edited file does not go through that door, so the ordering is the actual guarantee.
   Anything arriving from outside is checked with `isRideable()`, which answers by *building* the
   thing rather than by validating a schema that would go stale.

---

## Coordinates — read this before touching geometry

```
sim world:    x east, y north, heading in radians, 0 = east, +90° = north
three.js:     y up; the ground is xz;  sim (x, y) -> scene (x, height, −y)
a mesh modelled facing −z needs rotation.y = heading − π/2
```

`src/scene/coords.ts` holds the helpers and the reasoning. Use them.

**The trap:** `ExtrudeGeometry` builds in xy and grows along +z, so a single `rotateX(-π/2)` both
lays the footprint flat *and* stands the extrusion up *and* already lands world y on scene −z. An
extra `scale(1, 1, -1)` "to fix the handedness" is not a correction — it mirrors the whole world
and inverts every face. This went unnoticed for a while because a repeating terrace looks much the
same mirrored; it only surfaced when roofs, built correctly, landed on the wrong houses.

Cockpit-local: **−z is forward**, +y is up, +x is the rider's right. After a sprite rotation in the
top-down renderer, local +y is the rider's right — which is how the blinker ended up inverted once.

---

## Invariants worth protecting

These are pinned by tests in `src/sim/__tests__/route.test.ts` and `looking.test.ts`. If you break
one, the test tells you; if you change one deliberately, update the test *and* say why in the
commit.

- **There is road under the whole ride.** `findOffRoad` in `validate.ts`. Ask it about a *recorded
  ride* (`riddenPath`), not the route: the route is the spine, the machine is metres left of it
  after a lane change, and the invoegstrook now ends in a puntstuk — so the spine leaves the tarmac
  exactly where it should. This exists because it
  happened: the motorway's oprit was described in `buildRoutes` and not in `motorwaySurfaces`, so
  the first forty metres of scenario 2 were ridden across the verge — carriageway off to the left,
  trees going past, no tarmac at all — and every test passed, because nothing had thought to ask.
- **Nothing standing up intersects the route.** The turn cuts the corner well before the mouth of
  the side road, so kerbs and hedges must stop short of it (`KERB_JUNCTION_GAP = 8.5`,
  `HEDGE_GAP = 4.5`). A hedge that looks fine in plan view because the road is painted over it is
  a green wall across the road you are turning into.
- **Four lamp posts, one per quadrant**, clear of both the fietspad and the side road.
- **The junction's corners are a kerb radius, not squares.** `KERB_RADIUS` in `surfaces/junction.ts`
  is tangent to both kerb lines, so the straights stop exactly where the arc meets them. They were
  four squares out to `CORNER_GAP` with the kerbs simply stopping short, which meant two six-metre
  roads met in a seventeen-metre paved area with no edge anywhere in it — invisible from the saddle,
  and a car park from above. A turn still has to have tarmac under it: `findOffRoad` over the
  *ridden* path, for all three manoeuvres, is what caught the arc being wrong the first time.
- **The fietspad red stops at the crossing** and blokmarkering takes over, same number of blocks
  on each edge.
- **Haaientanden go in the lane that is arriving, with the apex pointing outwards.** Both halves of
  that were wrong from the day the junction was written: the rows sat in the lanes *leaving* the
  junction, aimed at the traffic with priority. Nothing noticed, because teeth are paint — no test
  about routes, obstructions or tarmac ever looks at them, and from the saddle a row a metre out of
  place still reads as a row. `haaientanden.test.ts` derives the correct lane from `junctionLanes`
  rather than hardcoding a sign, so it stays true if the traffic ever changes sides.
- **The mirror glass tilt is derived from `EYE_HEIGHT`**, not a constant. See below.
- **A clean ride scores Geslaagd 0/0/0**, in every scenario — `referenceRide` is asked this for
  all of them. Anything else means the windows or the targets moved, not the rules.
- **Following distance is a same-lane thing.** `headwaySeconds` skips any sample where the other
  vehicle is more than half a lane off your line. Overtaking means spending seconds level with a
  lorry, where the distance measured along the heading is nearly nothing — without the gate, the
  rule marks every successful overtake as tailgating, and the better the overtake the closer the
  "gap" it reports. A headway with nothing to measure returns **no row at all**: it is not
  applicable, and the thing that actually went wrong has a row of its own.
- **And that lateral test is the *only* gate on it.** There was a second one — measure only after
  the manoeuvre — which said the same thing about the oprit, since being on it is exactly what
  "more than half a lane off your line" means. Agreeing made it invisible, and it was not free: on
  an open motorway there is no manoeuvre to wait for, so sitting on the bumper of the lorry you are
  waiting to pass went unmeasured entirely. Removing it left every row on the merge identical,
  which is the proof it had never done anything there. **Two checks that agree are one check and a
  trap.**
- **Not every exercise has a conflict point.** The first two happen somewhere and their windows are
  metres before that place. An overtake happens wherever the rider decides, so scenario 3's reeks
  hangs off the manoeuvre instead — `beforeLaneChange` asks whether a look happened in the seconds
  before the machine moved. Anchor that to a milepost and you score the rider's choice of milepost.
- **Following distance is a state, not an event.** The headway rule scores the lowest gap actually
  *held* for half a second, never the gap at one instant. Sampling the moment of the merge is
  gameable in the obvious direction: drop in three seconds clear, bank the credit, then close right
  up and never be measured again. Two tests in `invoegen.test.ts` pin this.
- **Engine constants that are really facts about one scenario belong in the scenario.** `MAX_SPEED`
  was 60 km/h, which read as a fact about motorcycles and was a fact about a 30-zone; it made a
  motorway literally unrideable. Speed ceiling, throttle step and steering mode are scenario data.

**A sign is derived, never authored.** Signs are the only object here that states a rule in words,
which makes them the only one that can *lie* — a 50 on a road scored against 30, a give-way plate on
the arm with priority. So none of them is placed: the A1 comes from `speedLimitKmh`, the B1 and B6
both come off `giveWay` (the same field the haaientanden come off, so paint and plate cannot tell
opposite stories), and the G11 exists because the world has a fietspad. The single exception is the
afrit's `destination`, because no geometry implies "Deventer" — and it is required rather than
optional for the usual reason.

`roadSurfaces` takes the limit as an **optional** third argument, since it is handed a
`ScenarioWorld` and the limit lives on `Scenario`. Omitting it emits no A1 rather than inventing a
number. That optionality is also how the plan view silently lost its speed sign for an hour: the
compiler forces `Record<SurfaceKind, …>` to gain an entry but cannot force an argument to be passed.
`drawRoad` now takes the whole `WorldView` so there is nothing left to forget.

**Sign posts are not occluders.** `findHiddenReveals` treats anything over two metres as a box that
hides a car, which is right for houses and a wood and wrong for a plate on a pole. A four-metre exit
board left in that set reports the lorry beyond it as standing behind a building.

### Derived, not guessed

`mirrors.ts:glassTilt()` computes the glass angle from where the eye actually is. It used to be a
hand-picked `0.09`, which silently assumed an eye height — raise the rider 10 cm and the same piece
of glass points 6° further down, at the tarmac instead of the traffic on it. Since the entire
premise is that perception credits what the glass really shows, that coupling had to be explicit.

**Generalise the lesson:** if a constant here was arrived at by adjusting it until the picture
looked right, it probably depends on something else in the scene. Find out what, and derive it.

---

## How to verify things here

Screenshots lie, especially in a 550-px pane where a geometrically correct cockpit looks huge.
What has actually worked:

- **Test the panel's wording, not just its numbers.** `src/ui/__tests__` runs under jsdom and
  asserts the distinctions the panels draw — soft rule against untested rule, mirrors-add-nothing
  against nobody-sees-this. Those were checked by driving a browser and reading, which works once
  and does not survive the next edit. Assert the meaning, not the phrasing.
- **Read the geometry, not the picture.** Walk a mesh's `position` attribute and assert on world
  coordinates. That is how the crossing gap and the lamp positions were confirmed.
- **Read canvas pixels.** `instrument.texture.image.getContext('2d').getImageData(...)` proves a
  telltale is `#3fbf76` on the correct side. Projecting to NDC and sampling the render works for
  the main canvas.
- **Sweep exhaustively.** To find what a mirror covers, step an actor through following distances
  and record SEEN/blind. To check two gaze dots do not overlap, sweep the head across the whole
  travel.
- **Drive it headless.** `driveRun(scenario, plan)` for the crossroads and `driveMerge(scenario,
  plan)` for the motorway, both in `testDriver.ts`, run the real engine, perception and scoring
  with the clock advanced by hand. Their plans have flags for most of the interesting mistakes
  (`shoulderTooFarBack`, `swapLookOrder`, `chaseAfterMerge`, …). Prefer this over clicking through
  a 20-second approach.
- **Spike the design before building the world.** Scenario 2's whole premise was wrong on first
  specification — with the truck ahead, "get up to speed" and "keep two seconds" cannot both hold,
  and the rider who never accelerates scores best. Eighty lines of standalone kinematics found that
  in one run, before there was a motorway to look at. When a scenario's difficulty depends on
  several tuned numbers at once, prove the bands are separable first.

**A hidden browser pane throttles `requestAnimationFrame`**, so a scene will look frozen and mirror
cameras will read as un-aimed. Force frames with `__frames3d(n)` before measuring anything. It also
lays the canvas out at zero height, so a ride started there stays on the countdown for ever: drive
it with `engine.paused = true` and `engine.advance()` instead.

Three things about driving the first-person view by hand, each of which looks like a bug the first
time:

- **`engine.advance(s)` is clamped per call.** Ask for 7.6 seconds and you get a fraction of it.
  Loop until `engine.t` is where you want it.
- **`Stage.sync` reads the head from `view.head`, not from the controller.** Mutating
  `__head.pose.yaw` changes nothing until the engine produces a new view, so nudge the clock after
  setting it.
- **Yaw's sign is the opposite of the world bearing**, because `head.rotation.y` is a right-handed
  rotation about +Y: looking *right* (towards +x) is a *negative* yaw. Do not derive it — sweep the
  yaw, project the target with `Object3D.project`, and keep the angle that centres it. Note that
  `camera.updateMatrixWorld(true)` will not do: the yaw lives on `stage.head`, the camera's parent,
  so update from `stage.scene` and re-invert `camera.matrixWorldInverse` yourself.

### Dev handles (dev build only, never imported by the app)

| Handle | What |
|---|---|
| `__avd` | `{ engine, scenario, start(), record, routes }` |
| `__stage` | the `Stage`: `scene`, `camera`, `bike`, `head`, `mirrors`, `instrument`, `world` |
| `__head`, `__gaze` | the head controller and gaze dwell machine |
| `__frames3d(n, dt)` | render n frames synchronously, ignoring rAF |
| `__sync` | `await import('/dev-driver.js')`, then `__sync.install(); __sync.run(20, {mirrors: 0})` |

`engine.paused` plus `engine.advance(seconds)` steps the clock by hand — this is the **pause**
debug tool, and it is how the mirrored-world bug was finally cornered after three plausible
theories about it were all wrong.

---

## The scenario builder

`#bouwen`, or the button at the foot of the sidebar. You start from a scenario that ships, change
the road's numbers, drag the traffic, and export a TypeScript file that **derives** from the base
rather than flattening it — so the base keeps its Dutch prose as the source of truth and the diff
is small enough to read.

Three things make it cheap, and all three are worth preserving:

- **The preview is `drawScene`**, given an orthographic camera and a `WorldView` from a
  `ReplayPlayer` over the reference ride. What you edit is drawn by exactly the code that draws it
  when it is ridden, so the two cannot drift.
- **`referenceRide()` runs the real engine in the browser.** A full ride is a few milliseconds, so
  it re-rides after every edit and says what a model rider made of it. **A scenario a model rider
  fails is usually a broken scenario** — that check is the reason the builder exists, and it earned
  itself the day it was written by finding that scenario 2's car was forty metres too close.
- **Dependent values are derived, never typed in.** `buildRoutes` throws when
  `turnInY + turnRadius !== sideLaneCenterY`, which an editor would violate on every keystroke — so
  the side road's lane centre is computed from the other two. Unrepresentable beats reported.

The reeks, the briefing and the traffic are all editable, and a scripted actor can be told to brake
or stop at a given distance along **its own** path — so the hazard is the other driver's mistake
rather than a reaction to yours. *Auto van rechts remt* was built this way start to finish and
ships unedited; it is the proof that the loop closes.

**A banded rule is edited as a ladder, and the order is the semantics.** `speedBand` and `headway`
are ordered lists of range → outcome, and both scorers take the *first* band that matches — so
moving a rung changes what the rule means, and the arrows in `BandEditor` are not a convenience.
Anything matching no rung at all falls through to the rule's own `missed`, which the editor shows as
a final rung nobody wrote rather than leaving invisible.

**The validator asks what perception cannot.** `findHiddenReveals` traces the line of sight from
rider to actor against anything tall enough to hide a car, and says when the model credits a look
at something standing behind a house. That question lives in `validate.ts` rather than in
`perception.ts` on purpose: making perception itself occlude would change what every existing
scenario scores, while a check that changes nothing and tells the author the truth costs nothing.
It is the check that would have caught *Auto van rechts remt* being a trick question, and closing
that scenario's open corner in the builder makes it fire.

**And the loop now closes without a compiler.** `Bewaar` puts a scenario in the browser's library,
where it appears in the ride picker beside the four that ship, marked as your own. `Download` writes
a small `.avd.json` you can email to another instructor; `Open bestand` reads one back. A ride
exports the same way and **carries its scenario inside it**, because a `RunRecord` stores only
`scenarioId` and the whole reason to send somebody a ride is that they were not there. The
TypeScript export is still how a scenario graduates into this repo; it is no longer the only door
out of the builder, which it was for as long as the only user had a checkout.

**It rides the wrong line too.** `analyseScenario` rides the exercise several deliberately sloppy
ways — one mistake at a time — and reports which rules caught which mistake. A rule no sloppy rider
fails is a rule that teaches nothing, and the panel says so. That check found, on its first run,
that a rule in a scenario shipped the week before was earned by a rider who did nothing right.

**One mistake at a time is load-bearing, not tidiness.** A rider who skipped the mirror *and* the
schouderblik made the whole overtake reeks look un-missable, because without the schouderblik the
richtingaanwijzer prerequisite refuses the manoeuvre — so the rider never changes lane and every
rule about how they did it produces no row at all. Two mistakes hide each other.

**Missed and measured are different questions.** A rule no sloppy rider *failed* is soft — the
threshold or the window is too kind. A rule no sloppy rider was *measured against* is one whose
mistake removes the rider from its scope: skip the schouderblik on the overtake and the
richtingaanwijzer prerequisite refuses the manoeuvre, so there is no lane change and every rule
about the lane change returns no row rather than a miss. Sharpening the second kind changes nothing.

`BUILDER-GAPS.md` is the running list of what it still cannot do, and it is kept from building
things rather than from reading code. Every rule in every shipped scenario is missed by at least one
sloppy rider, and `discrimination.test.ts` asserts that with no exceptions list — so a rule going
soft, or a rider losing the ability to make its mistake, both turn it red.

**A rule nothing can fail is more often a missing rider than a bad rule.** Three rules on the A12
sat unfixed under a confident explanation of why they could not be fixed, and all of it was wrong:
the schouderblik rules are about looking *too early*, which no rider did, and the weaver demanded
sixty-five metres of clearance to enter a forty-three metre gap, so it never once tucked in between
the lorries the scenario is about. Check that the mistake is actually being made before concluding
the rule cannot catch it.

## Scoring, briefly

Windows are **anchored in metres before the conflict point**, not in seconds, and converted to
per-run seconds afterwards via the run's own `s(t)`. A cautious rider arrives later and must not be
punished for it.

Three gradations — `opmerking` → `fout` → `kritiek` (another road user had to intervene). One
critical or three ordinary faults means *gezakt*. **The ride never aborts.**

**A look that happened is a look that happened.** Looks are discarded before crediting only once a
run is scanning outright — `lookDiscipline.faultAt` violations, the scenario's own declaration of
where looking stops. Below that they all count, and over-looking earns the remark it deserves and
nothing more. Discarding every local burst-breaker instead closed a real loophole (mashing every
control hits every window by accident) by a means that also erased ordinary brisk riding: the
Kerkstraat's reeks is six looks, and doing it half a second apart rather than a second and a quarter
lost three of them. An instructor who checked the dode hoek twice — the habit being taught — was
told *je keek niet in je rechterspiegel*, as a fout, about a mirror they had just used. Prerequisites
produce a `rejected` event rather than silence (the richtingaanwijzer does nothing before the first
schouderblik, and says why).

---

## Conventions

- **Comments explain why, not what.** Most comments here record a decision or a trap — that a
  number is a measurement, that an obvious-looking simplification is wrong. Match that density and
  register; do not add restating comments.
- **Commit messages are prose**, present tense, explaining the reasoning and stating what was
  measured. Look at `git log` before writing one.
- Dutch for anything the student reads; English for everything else. **Prose the student reads must
  come from the scenario or be derived from its world** — never written into a component. The
  debrief described every window as "vóór het fietspad", on roads that have no fietspad, because
  one scenario had one when the line was written. `conflictPointName` in `route.ts` lives next to
  the code that decides where that point is.
- `src/palette.ts` holds every colour both renderers share.
- Keep `README.md` (Dutch, written for the student and for a future maintainer) current when
  behaviour changes.

---

## Known limitations

- The bundle is ~1,09 MB (326 kB gzipped): three.js ships whole, plus the sky and the post chain.
- Houses are detached boxes with gaps and staggered depths, not a true terrace with shared walls.
- Long-range junction legibility is still weak; kerbs, lamp posts and the crossing markings help.
- Touch is out of scope — looking needs a mouse. Pointer lock silently fails in some environments,
  so drag-to-look is always available as a fallback.
