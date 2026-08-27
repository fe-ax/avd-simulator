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

## Fixed in the second pass

### 20. ~~The builder cannot ride the *wrong* line~~

It rides it several wrong ways now, one mistake at a time, and reports which rules caught which
mistake. Mutation testing, pointed at an exercise: a rule no sloppy rider fails is a rule that
teaches nothing, and the panel says so while you are still editing it.

**One mistake at a time is load-bearing.** The first overtake rider skipped the mirror *and* the
schouderblik together and the whole looking reeks came back un-missable — because without the
schouderblik the richtingaanwijzer prerequisite refuses the manoeuvre, the rider never changes
lane, and every rule about how they did it produces no row at all. Split in two, the mirror rules
fail as they should. Two mistakes can hide each other.

Adding seven rides per keystroke on top of the six already there needed the rides consolidated
first, so `analyseScenario` runs each distinct plan once and answers all three questions from one
cache.

### 21. ~~Nothing says how a rule is measured~~

Every kind carries one sentence saying what it looks at, beside the rule rather than in a tooltip,
and for all nine kinds rather than the four the menu offers — a derived scenario inherits kinds the
menu cannot add, and those are the ones nobody can reason about.

### 22. ~~The reveal table gives motorway advice at a junction~~

It reads each row now. The one warning it still gives is the narrow one that is never wrong: when
no way of riding changes *when* you see somebody, no rule about looking at them can teach anything.
Equal mirror columns at a crossroads are stated as what they are — the car comes in through the
windscreen — instead of being reported as a mistake.

### 23. ~~The export is machine-shaped~~

Speeds go out as `70 / 3.6`, guarded by an exact-equality check so nothing is rounded; a disabled
`keepInBlindSpot` is left out entirely; and a file opens on `id`, `title`, `briefing` and `world`
rather than on look-discipline thresholds.

There was a real bug underneath. `ActorList` held `KMH = 1 / 3.6` and multiplied, and
`70 * (1/3.6)` is a *different double* from `70 / 3.6`. Every speed the builder wrote was one ulp
away from the same speed written by hand — invisible, harmless, and enough to stop the exporter
recognising seventy as seventy.

### 24. ~~No way to say "this run cannot be animated here"~~

Never a builder gap. It is in CLAUDE.md, where it belongs, and is gone from here.

### 25. ~~`speedAtMost` was gameable~~

Found while reading the scoring to fix 21, not by using the builder. It read one sample — the one
nearest the window's end — so a rider could hold fifty the whole way, brake across the window's
edge, and pass. Same hole the headway rule closed, same fix: the lowest speed actually held for
half a second.

`gearAtMost` has the same shape and is deliberately left alone. You sit in a gear rather than blip
one, so there is no cheat to refuse.

---

# What the check found the moment it existed, and what came of it

Five rules that no sloppy rider missed. Four are closed; the score is now **13/13, 2/2, 8/8 and
8/11**, and the remainder are pinned in `discrimination.test.ts` with the reason.

### 26. ~~My own "ride on afterwards" rule teaches nothing~~

`auto-van-rechts-v1 / regel-2`, and it was mine, written the week before and shipped. Closed by
giving the crossroads driver a rider who genuinely dawdles.

That took two goes and both are worth recording. `pullAway: false` withheld a throttle press, which
does nothing at a straight-through crossing because the machine climbs back to its set speed by
itself — there is no press to withhold. Modelled as *staying on the brake* it works. But without a
speed floor that rider brakes through the Kerkstraat's turn, never completes the manoeuvre, and
every rule anchored to the manoeuvre vanishes rather than failing — so the check reported those
rules as untestable when the truth was that the harness had fallen over. **A sloppy rider has to be
sloppy in one specific way and otherwise competent**, or it stops being a measurement.

### 27. ~~Nothing tailgates~~

Closed for the merge by a `tailgate` flag: a rider who sits at about half a second and stays there.
`invoegen-snelweg-v1 / volgafstand-auto` is caught now.

It did **not** close `inhalen-snelweg-v1 / afstand-vrachtwagen-1`, and the reason is worth having
found. `scoreHeadway` measures from `manoeuvreCompletedAt` — the *first* lane change — by which
point the rider is already left of that lorry. The ride the rule was written to catch is caught
anyway, and hard: `cutInEarly` scores gezakt on an incident plus `afstand-vrachtwagen-2`, because
tucking in between two lorries puts you close in front of the one *behind*, not close behind the one
ahead. Anchoring the measurement to the last lane change instead would be the real fix and would
change scoring for the merge too, so it is not a change to make in passing.

### 28. ~~Measured is not the same as failed~~

`RuleDiscrimination` carries `testedBy` as well as `failedBy`, and the panel says two different
things. Soft: *"ook een slordige rijder haalt dit — de grens of het venster is te ruim."* Untested:
*"geen enkele slordige rit werd hierop gemeten — wie de fout maakt, komt niet eens aan deze regel
toe."* The first wants sharpening; the second cannot be sharpened into usefulness at all, and is
usually a rule that is doubling up on a prerequisite.

### 29. ~~The recipe menu still offers four kinds of nine~~

All nine now, with editors for `laneChange`, `beforeLaneChange` and `speedBand`. A scenario built
from a blank motorway can express its own reeks.

### 30. ~~A rule cannot be pointed at a different actor~~

Mostly a misreading of my own: `headway` is the only kind that names an actor, and it always had a
picker. The real hole underneath was a headway rule pointing at *nobody* — added before there was
any traffic, scoring silently returns no row, and it sits in the list looking like a rule for ever.
It says so now.

---

# Found while closing those

### 32. ~~The anticipating rider strobed its brake twenty-five times a second~~

Both times in the closing test shift every frame — the rider's because it is slowing, the other's
because it is braking — so a single threshold had the difference crossing it back and forth. One
approach left **214 brake events** in the record. The average deceleration was about right, which is
why it survived: nobody had looked at the events, only at the speed. Hysteresis, and it is 10 now.

Every saved run of that scenario carries those events, and a debrief timeline would draw them.

### 33. ~~The builder told you the road ran out when it had not~~

`extentOf` frames the *picture*: the conflict point and a stretch either side. The validator asked
"is there road under the whole ride?" with those bounds, so any ride longer than the frame reported
its own tail as verge. A blank motorway — nine hundred metres of ride, a hundred and seventy metres
of frame — opened with **"de weg houdt op, 383 punten"**, which is the first thing anybody starting
a motorway scenario would have seen.

The shipped motorways hid it: their traffic starts far enough up the road to stretch the frame past
the ride. It only ever showed on the empty starter, which is the one case nobody had looked at.

The road is generated over everywhere the machine actually went now. `starters.test.ts` asks about
the ridden line as well as the route, which is the check that would have caught it.

---

# Still open

### 34. The overtake's three soft rules

Both `schouderblik` rules are belt-and-braces over `controlPrerequisites` and cannot be missed by
omission; `afstand-vrachtwagen-1` is anchored to the wrong lane change (see 27). All three are
understood, pinned, and defensible — but none of them is confirmed to do work of its own.

### 35. A speedBand's middle rungs cannot be edited

The recipe writes two bands and the editor exposes the outer edges. The Dutch on each rung, and any
third rung, still needs a text editor.

### 36. Instructors have no URL

Not a builder gap, and the largest thing between this tool and the people it is for. There is no CI
and no deploy: using it means cloning the repository and running `npm install`. Everything else on
this list is about making a good exercise; this one is about whether anybody gets to make one at all.
