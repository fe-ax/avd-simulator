# What the scenario builder cannot do yet

A running list, kept from actually trying to build things with it rather than from reading the code.

**The shakedown:** build *"approaching a junction, a car comes from the right far too fast, stands on
its brakes and stops short; you should brake too and then carry on"* — using the builder in the
browser only, no editing files.

**Result: not possible.** What the builder produced was scenario 1 with the snorfiets moved onto the
side road and sped up to 70. The road is right, the traffic is in the right place, and none of the
rest of the exercise exists.

---

## Blocking — the exercise cannot be expressed at all

### 1. No scripted actor behaviour

The car has to brake **of its own accord**, because the whole lesson is that it made the mistake and
you have to read it. Today an actor brakes only when the *rider* creates a conflict — `actorConflicts`
and the blind-spot director in `engine.ts` — so the only way to make anything brake is to ride at it.

There is no way to say "at this point on its path, this vehicle brakes hard". This is the deepest gap
on the list: it is a new idea in the simulation, not a missing form field.

### 2. No reeks editing

"Brake, then continue" needs an expectation — speed at or below something, over a window near the
junction — and the nine inherited steps about turning right across a fietspad need to go. There is no
UI for expected actions at all, so a built scenario is always judged on its parent's reeks.

### 3. No briefing editing

The assignment still reads *"Sla bij het eerstvolgende kruispunt rechtsaf, de Kerkstraat in."* A
scenario that tells the student to do something other than what it scores is worse than no scenario.

### 4. The route is always a right turn

`buildRoutes` for `urbanCrossing` builds approach → arc → side road, and `conflictX` anchors every
window to the fietspad crossing. "Approach a junction and carry straight on through it" cannot be
expressed, and that is the shape of most hazard-anticipation exercises.

### 5. No adding or removing actors, and no changing what one *is*

The scenario inherits exactly the actors its parent had. There is no `kind` control, so the car in
this exercise is a snorfiets: drawn as a scooter in both views, and doing 70 km/h on a main road.

---

## Wrong, but not blocking

### 6. No actor label

It still reads "Snorfiets op het fietspad", and that string goes into the debrief the student reads.

### 7. The fietspad cannot be removed

`urbanCrossingSurfaces` always lays one. It can be narrowed but not deleted, so this junction has a
bike path that plays no part in the exercise and a set of haaientanden explaining a priority rule
that is not the one being taught.

---

## Bugs found on the way, independent of this exercise

### 8. A stale draft crashes the builder to a white screen — and there is no way out

`loadDraft` checks only that a scenario id is present, not that the shape still fits. A draft saved
before `world.stretch` was introduced still has `world.ramp` at the top level, so `StretchFields`
reads `undefined.kind` and the whole app dies. Nothing renders, so nothing can clear it: recovery
needs devtools.

A saved draft outlives the code that made it, exactly like a saved run — and runs already have a
migration in `recorder.ts`. Drafts need the same, plus a hard validation that discards anything it
cannot understand.

### 9. The actor handles are off-screen when the builder opens

The default framing is the conflict point ±85 m, but an actor can start far outside it — scenario 1's
snorfiets begins 131 m back. Both its handles project outside the canvas (y = 837 and y = −222 on a
617-pixel canvas) while the sidebar says "sleep de stippen in beeld". You have to know to zoom out
before the thing you are told to drag exists.

### 10. The zoom floor is too high to see a long path and the road at once

Zooming out far enough to reach both handles hits `MIN_SCALE` at 1.2 px/m, where the whole
carriageway is eighteen pixels across. You can see the dots or you can see the road.

### 11. The validator reports a false green

After moving the traffic onto the side road, the panel still says **"Een rijder die alles goed doet,
haalt dit. 0/0/0"** — because it is answering "does the inherited reeks still pass", not "does this
exercise work". The car from the right is not scored at all, and the model rider is being marked on a
right turn nobody asked for.

This is the worst item on the list. A validator that goes green on a scenario that tests nothing is
worse than no validator, because the whole point of it is to be trusted.

---

# The plan

Decided after the shakedown. Bugs first, because they are cheap next to the features and the draft
crash bites hardest during exactly the kind of work that follows.

## Phase 1 — the four bugs

| | |
|---|---|
| **Draft crash** | `loadDraft` validates by *trying the draft*: build its routes and surfaces, and discard it if anything throws. A schema would go stale; actually using it cannot. Plus an error boundary around the builder, so no future shape change can white-screen the app again. |
| **Off-screen handles** | The default fit includes every actor's `from` point. They were filtered out for being outside the framed stretch, which is exactly backwards: where a road user starts is a placement you chose and need to see. `to` stays excluded — on the A12 it is nine hundred metres away and means "and then it carries on". |
| **Zoom floor** | `MIN_SCALE` drops so a three-hundred-metre span and a fifteen-metre road can be on screen together. |
| **False green** | The validator says *what it validated*. After the model ride it checks whether each actor appears in any scored rule or causes any incident, and says so plainly when one does not: an actor nothing is measured against is a hazard the exercise is not actually about. It also states that the reeks is inherited unchanged, so "0/0/0" can never again be read as "this exercise works". |

## Phase 2 — scripted actor cues

`ActorSpec.cues`: a list of things a vehicle does at a given distance **along its own path**, not at
a time and not in reaction to the rider. Anchored that way it fires in the same place every run, so
the hazard stays the other driver's mistake rather than a response to yours.

```ts
cues: [{ atDist: 120, action: 'brake', forSeconds: 2.5 }, { atDist: 160, action: 'resume' }]
```

Applied in `stepActors`, which already tracks `dist` per actor. Generalises later to indicating,
stopping and pulling away without changing shape.

## Phase 3 — a plain junction world

A new `ScenarioWorld` kind: two crossing roads, no fietspad, and the manoeuvre — straight on, left or
right — as scenario data. A separate generator rather than more options on `urbanCrossing`, whose
geometry is the Kerkstraat's and whose route is always a right turn.

Straight-through is the shape most hazard-anticipation exercises take, and none of them are
expressible today.

## Phase 4 — the builder catches up

Actors: add, remove, set kind and label, and edit the cues from phase 2. The reeks: add steps from a
menu of the rule kinds that already exist, edit their numbers and their Dutch. The briefing:
situation, assignment and hints.

## Phase 5 — build the shakedown scenario in the browser, and only in the browser

The test is the same one that failed: *a car comes from the right far too fast, stands on its brakes
and stops short; you brake too and carry on.* You have priority — haaientanden on the side road — and
the car is the one at fault. Doing it right means slowing markedly while it is still a threat and
then continuing, not stopping dead.

If any of it still needs a text editor, that goes at the top of this file rather than into a
commit message.
