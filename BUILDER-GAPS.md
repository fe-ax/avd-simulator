# What the scenario builder cannot do yet

A running list, kept from actually trying to build things with it rather than from reading the code.

**The shakedown:** build *"approaching a junction, a car comes from the right far too fast, stands on
its brakes and stops short; you should brake too and then carry on"* — using the builder in the
browser only, no editing files.

**Result on the first attempt: not possible.** What the builder produced was scenario 1 with the
snorfiets moved onto the side road and sped up to 70. The road was right, the traffic was in the
right place, and none of the rest of the exercise existed.

**Result now: possible, and done.** Everything struck through below was fixed in the five phases at
the bottom of this file, and the scenario ships as
[scenario.auto-van-rechts.ts](src/sim/scenario.auto-van-rechts.ts). What is still open is listed
under *Found while building the shakedown scenario*.

---

## Blocking — the exercise could not be expressed at all · all fixed

### 1. ~~No scripted actor behaviour~~

The car has to brake **of its own accord**, because the whole lesson is that it made the mistake and
you have to read it. Today an actor brakes only when the *rider* creates a conflict — `actorConflicts`
and the blind-spot director in `engine.ts` — so the only way to make anything brake is to ride at it.

There is no way to say "at this point on its path, this vehicle brakes hard". This is the deepest gap
on the list: it is a new idea in the simulation, not a missing form field.

### 2. ~~No reeks editing~~

"Brake, then continue" needs an expectation — speed at or below something, over a window near the
junction — and the nine inherited steps about turning right across a fietspad need to go. There is no
UI for expected actions at all, so a built scenario is always judged on its parent's reeks.

### 3. ~~No briefing editing~~

The assignment still reads *"Sla bij het eerstvolgende kruispunt rechtsaf, de Kerkstraat in."* A
scenario that tells the student to do something other than what it scores is worse than no scenario.

### 4. ~~The route is always a right turn~~

`buildRoutes` for `urbanCrossing` builds approach → arc → side road, and `conflictX` anchors every
window to the fietspad crossing. "Approach a junction and carry straight on through it" cannot be
expressed, and that is the shape of most hazard-anticipation exercises.

### 5. ~~No adding or removing actors, and no changing what one *is*~~

The scenario inherits exactly the actors its parent had. There is no `kind` control, so the car in
this exercise is a snorfiets: drawn as a scooter in both views, and doing 70 km/h on a main road.

---

## Wrong, but not blocking · all fixed

### 6. ~~No actor label~~

It still reads "Snorfiets op het fietspad", and that string goes into the debrief the student reads.

### 7. ~~The fietspad cannot be removed~~

`urbanCrossingSurfaces` always lays one. It can be narrowed but not deleted, so this junction has a
bike path that plays no part in the exercise and a set of haaientanden explaining a priority rule
that is not the one being taught.

---

## Bugs found on the way, independent of this exercise

**All six of these are fixed.** Two of them (12 and 13) only turned up while fixing the others.

### 8. ~~A stale draft crashes the builder to a white screen — and there is no way out~~

`loadDraft` checks only that a scenario id is present, not that the shape still fits. A draft saved
before `world.stretch` was introduced still has `world.ramp` at the top level, so `StretchFields`
reads `undefined.kind` and the whole app dies. Nothing renders, so nothing can clear it: recovery
needs devtools.

A saved draft outlives the code that made it, exactly like a saved run — and runs already have a
migration in `recorder.ts`. Drafts need the same, plus a hard validation that discards anything it
cannot understand.

### 9. ~~The actor handles are off-screen when the builder opens~~

The default framing is the conflict point ±85 m, but an actor can start far outside it — scenario 1's
snorfiets begins 131 m back. Both its handles project outside the canvas (y = 837 and y = −222 on a
617-pixel canvas) while the sidebar says "sleep de stippen in beeld". You have to know to zoom out
before the thing you are told to drag exists.

### 10. ~~The zoom floor is too high to see a long path and the road at once~~

Zooming out far enough to reach both handles hits `MIN_SCALE` at 1.2 px/m, where the whole
carriageway is eighteen pixels across. You can see the dots or you can see the road.

### 11. ~~The validator reports a false green~~

After moving the traffic onto the side road, the panel still says **"Een rijder die alles goed doet,
haalt dit. 0/0/0"** — because it is answering "does the inherited reeks still pass", not "does this
exercise work". The car from the right is not scored at all, and the model rider is being marked on a
right turn nobody asked for.

This is the worst item on the list. A validator that goes green on a scenario that tests nothing is
worse than no validator, because the whole point of it is to be trusted.

### 12. ~~The opening frame could be skipped entirely~~

Found while fixing 9. `BuilderView` decided "this is the first measurement, so fit now" from the
camera having no width — but a first measurement can arrive with a real width and **no height**, from
a container that has not laid out vertically yet. That reading used up the one chance to fit while
`fit` quietly refused for want of a height, and the builder opened at the default zoom with the
handles below the bottom of the canvas. `fit` reports whether it applied now, and the view keeps
trying until one takes.

### 13. ~~Actor end points were framed out, so the second handle was always off-screen~~

Found while fixing 9 as well, and it is the opposite mistake: `to` was excluded from the framing
because on the A12 it is nine hundred metres away and squeezes the exercise into a thread. On a
junction it is forty metres past the conflict, and excluding it put the second of an actor's two
handles off the top of the screen. It is included now when it is within sixty metres of everything
else, and ignored when it is not.

---

# The plan, and what happened

Decided after the shakedown. Bugs first, because they are cheap next to the features and the draft
crash bites hardest during exactly the kind of work that follows.

**All five phases are done, and the shakedown scenario now ships.** It is
[scenario.auto-van-rechts.ts](src/sim/scenario.auto-van-rechts.ts) — built in the browser, validated
against the model rider there, exported, and dropped into `src/sim` unedited apart from its header
comment. Nobody wrote it by hand.

## Phase 1 — the four bugs · done

| | |
|---|---|
| **Draft crash** | `loadDraft` validates by *trying the draft*: build its routes and surfaces, and discard it if anything throws. A schema would go stale; actually using it cannot. Plus an error boundary around the builder, so no future shape change can white-screen the app again. |
| **Off-screen handles** | The default fit includes every actor's `from` point. `to` is included too when it is within sixty metres of everything else, and ignored when it is not. |
| **Zoom floor** | `MIN_SCALE` dropped to 0.45, so a three-hundred-metre span and a fifteen-metre road fit on screen together. |
| **False green** | The validator says *what it validated*: after the model ride it names any actor that no rule measures and no incident involves. |

## Phase 2 — scripted actor cues · done

`ActorSpec.cues`, anchored to distance along the actor's **own** path, so the hazard fires in the
same place every run whether the rider is early, late, or never turns up.

## Phase 3 — a plain junction world · done

`world.kind: 'junction'` — two crossing roads, no fietspad, and the manoeuvre as scenario data.

## Phase 4 — the builder catches up · done

Actors (add, remove, kind, label, cues), the reeks, and the briefing all editable.

## Phase 5 — build it in the browser, and only in the browser · done

**No API call was needed.** The scenario was built entirely through the UI, and the only
non-pointer scripting used was aiming synthetic pointer events at the plan canvas — which a human
does by eye.

Two things had to be fixed mid-build to get there, and both are listed below.

---

# Found while building the shakedown scenario

## Fixed

### 14. Handles alone cannot place traffic that starts far up the road

The car starts 170 m east of the junction. Dragging is right for something you can see and useless
for that: you have to zoom out until the carriageway is a thread before the handle is on screen at
all, and then a pixel is two metres. Actors now have numeric x/y fields as well as handles.

### 15. The model rider was Kerkstraat-shaped

`actorPast` assumed the hazard crosses north–south, so on a junction scenario the model rider never
registered the car clearing the conflict and sat at the 90 s cap with the machine stationary. It now
measures along the actor's own heading.

### 16. `driveRun` crashed on a road with no traffic

It read `engine.actors[0]` unguarded — so the moment you picked a blank starter and pressed nothing,
the validator threw instead of saying "there is no traffic here".

### 17. The validator called a scripted car decor

`unscoredActors` looked for rules and incidents naming an actor. A car whose whole job is to brake
of its own accord has neither, so the panel reported the hazard as scenery. A road user with cues is
deliberate by definition, and now counts as such.

### 18. The model rider could not anticipate

It braked for what was already in its way and nothing else, so no scenario about *reading* another
road user could ever go green. `RidePlan.anticipate` closes the gap: it compares its own time to the
conflict point against each moving actor's, and backs off when those coincide.

### 19. `forSeconds` survived switching a cue away from braking

The field hides when you pick Stoppen and its value stays on the object, so the export carried a
duration nobody chose. The action buttons now drop it.

## Open

### 20. The builder cannot ride the *wrong* line

This is the biggest one left. The validator rides a model rider who does everything right, which
answers "is this exercise possible?" — but not "is it about anything?". A rule that a careless rider
also passes teaches nothing, and the panel goes green either way.

Both my rules passed on the first model ride. Only a headless test riding it a second time with
`anticipate: false` showed that rule 1 discriminates — and that test is in the repo now precisely
because the browser could not answer the question. The builder wants a second column: **a rider who
ignores the hazard**, with the same green/red treatment. A rule both riders pass is a rule to
delete.

### 21. Nothing says how a rule is measured

`speedAtMost` reads the speed at **one** sample — the one nearest the window's `to` — not across the
window. I set `to: 0` meaning "be slow at the junction", and the model rider failed, because by then
it had correctly decided the car was stopping and was already accelerating away. The fix was to end
the window at 20 m, while the car is still a threat.

That was several tuning cycles spent on a definition the UI never states. Each rule kind needs one
sentence next to it saying what it looks at.

### 22. The reveal table gives motorway advice at a junction

It warns that if a road user is spotted equally early with and without mirrors, "die spiegel leert
niets en staat het verkeer op de verkeerde plek". For a car arriving from the right through the
windscreen that is simply what the geometry is, and the mirror column *should* read the same. The
column that matters there is "niet kijken" — 3,4 s against 7,9 s in this scenario. The note needs to
know which world it is in.

### 23. The export is machine-shaped

Three things, all cosmetic and all making a generated scenario read worse than a hand-written one
sitting beside it:

- speeds come out as `19.444444444444446` rather than `70 / 3.6`
- `keepInBlindSpot` is emitted in full even when `enabled: false`
- `id`, `title` and `briefing` land *after* the reeks, because the base is spread first

### 24. No way to say "this run cannot be animated here"

Not a builder gap, but worth recording next to the rest: the browser pane throttles `requestAnimationFrame`
when it is not the front window, and lays the canvas out at zero height. The scene renders one frame
and freezes on the countdown. Every behavioural claim in this file was verified headlessly for that
reason — `npm test`, not screenshots.
