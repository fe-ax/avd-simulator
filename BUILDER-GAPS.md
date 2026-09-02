# What the scenario builder cannot do yet

A running list, kept from actually trying to build things with it rather than from reading the code.
That is the whole method: every item here was found by sitting down to build an exercise and being
unable to, and not one of them was found by reading a file.

The list has emptied four times now — at pull requests #14, #17, #18 and #20 — and refilled every
time somebody tried to make something new with it. The third filling came from setting out to build
a named exercise rather than from riding one that felt wrong, and it is the one that has paid best:
the four walls it found were the exit, the stretch-kind switch, the graded lane change and the
missing look controls, and *Uitvoegen op de A12* now ships having been built through the form.

**The shakedown:** *"you are in rijstrook 1 at 105 behind three lorries doing 90, an exit is coming
up, rijstrook 2 is clear. Fall in behind them, do the checks, and be in the uitvoegstrook inside its
first fifth — rather than blasting past all three at 130 and cutting in halfway down."*

**Result: it can now be built end to end**, and was. The exported file went into `src/sim` unedited.
The *second* half of that build — writing the reeks, rather than the road — found two more, and both
are closed below.

Every rule in every shipped scenario is missed by at least one deliberately sloppy rider, and
`discrimination.test.ts` asserts that with no exceptions list.

---

## Open

**Nothing.** Emptied again by the two items the *second* half of the exit build ran into — and by
one that turned out not to be a gap at all, which is recorded below because the mistake is more
useful than the entry was.

### Closed this round

**A failing model rider now says why it failed.** The one that cost the most. The reeks was right,
the road was right, and the panel said *"je ging van strook zonder dit eerst te controleren"* — the
sentence written for the **student**. The truth was arithmetic: the model rider's schouderblik
happened 5,8 s before the lane change and the rule allowed 5. Nothing on the screen carried a number
that would have said so.

A missed rule now carries a `MissReason` alongside the student's prose, and the builder prints it
underneath: *"Schouderblik rechts gebeurde wél, op 13,0s, maar de strookwissel was op 17,6s — 4,6s
ertussen, en deze regel staat 1,0s toe."* Four causes that produce **identical** debriefs are kept
apart, because their fixes are opposites: a look that was too early is a window to widen or a rider
to move, a look on the wrong side of the anchor is a reeks in the wrong order, a look that was
*refused by a prerequisite* is a reeks in the wrong order for a different reason, and a look that
never happened is none of those. Both anchors are covered — a lane change and a completed manoeuvre
— and the reason carries which one it hangs off, so the sentence names the right thing. That last
part is not fussiness: the debrief once described every window as "vóór het fietspad", on roads
that have no fietspad.

Note which way it was fixed when it fired for real. The obvious repair is to widen the window until
the model rider passes, and that is how a rule quietly stops catching anybody — so the panel prints
the gap and the allowance side by side and leaves the author to decide which of the two is wrong.

**The Invoegstrook field is gone from roads that have no strook**, and named for the road it is on:
*Invoegstrook* on an oprit, *Uitvoegstrook* on an afrit, and absent on a through road. One field on
`MotorwayRoad`, three meanings, and on a doorgaand stretch it was a number that changed nothing in
front of you — which teaches an author to distrust the whole form.

### Withdrawn: "a rule can point at nobody and score silently"

Written down after the exit build, where a Volgafstand rule sat with `actorId: ''` and measured
nothing. A panel was built to report it. It was then deleted before shipping, because the builder
**already** does this in three places and had all along: the recipe points a new rule at the first
road user, `removeActor` deletes any rule aimed at one it removes, and the rule's own form says
*"Deze regel wijst naar een weggebruiker die er niet is"* right beside the chooser that fixes it.
Building both meant watching two notices appear at the same instant, saying the same thing, one of
them further from the control that resolves it.

What actually happened during the build is that the rule was created before the lorries existed, and
the complaint that reached me was the discrimination panel's — *"ook een slordige rijder haalt dit"*
— because I was reading the validation column and not the rule. The tool was right and the reader
was in the wrong place.

`findDanglingTargets` survives in `validate.ts` for the question those three do not answer: a
scenario arriving from a file or from localStorage has never been through the form. A sweep asserts
no shipped scenario has one, which is worth having — a rule that measures nothing is silent by
construction and would pass every other check in the suite.

---

## What this list has taught

Eight things worth keeping. What the rest of the closed items taught is in `CLAUDE.md`, next to the
code it applies to — these are the ones about *finding* the problem rather than about the code that
had it.

**A gap is invisible while the author and the user are the same person.** For its first three rounds
every item here was about whether an exercise was any *good*. Not one noticed that an exercise could
not be *used* — that the builder's closing instruction was "put this file in `src/sim/` and add a
line to `ALL_SCENARIOS`", which is a fine thing to tell somebody with a checkout and a wall to
anybody else. It took knowing that instructors would have it. Ask who is holding the thing, not only
whether it works.

**A sloppy rider has to be sloppy in one specific way and otherwise competent.** The dawdling rider
first braked so hard it never completed the Kerkstraat's turn, and every rule anchored to the
manoeuvre then *vanished* rather than failing — so the check reported those rules as untestable when
the truth was that the harness had fallen over. A mutation that breaks the ride measures nothing.
Its cousin — that two mistakes can mask each other — is in `CLAUDE.md`.

**Ask the question with the bounds the question needs.** The validator asked "is there road under
the whole ride?" using the extent that frames the *picture*, so any ride longer than the frame
reported its own tail as verge. A blank motorway opened with "de weg houdt op, 383 punten".

**The case nobody has looked at is where the bug is.** That one survived as long as it did because
every shipped motorway has traffic far enough up the road to stretch the frame past the ride. It
showed only on the empty starter — the first thing a new author sees and the last thing anybody
tests. Same shape as the reveal table in `CLAUDE.md` having gone stale for exactly one scenario, and
the same shape again as a headway rule whose default target is nobody: the interesting case is the
one that is not like the others.

**Two checks that agree are one check and a trap.** The headway rule had a temporal gate — measure
only after the manoeuvre — and a lateral one, refuse anything more than half a lane off your line.
They were saying the same thing about the oprit, so the temporal one looked free. It was not: on an
open motorway there is no manoeuvre to wait for, so sitting on the bumper of the lorry you are
waiting to pass went unmeasured entirely. Removing it left every row on the merge scenario
identical, which is the proof it had never been doing anything there.

**A model that cannot see what the screen shows will be believed anyway.** Perception is angular
and knows nothing about buildings, so *Auto van rechts remt* shipped crediting a look at a car four
seconds before a terrace stopped hiding it — a trick question that measured as a clean ride, and
that every check downstream of perception agreed with. The fix was not to make perception occlude,
which would change what every existing scenario scores; it was to let the *validator* ask the
question and tell the author. A check that changes nothing and says something true beats a change
to the thing everybody trusts.

**A rule that cannot be failed is more often a missing rider than a bad rule.** Three rules on the
A12 sat on this list for two rounds under a confident explanation of why they were unfixable — the
prerequisite made the mistake impossible, the anchor was wrong, they were belt-and-braces. All three
were wrong. The schouderblik rules are about looking *too early*, which nothing did; the gap rule
needed a weaver that actually fits between the lorries, and `cutInEarly` demanded sixty-five metres
of clearance to enter a forty-three metre gap, so it cleared both and cut in front instead. Check
that the mistake is really being made before concluding it cannot be.

**The tool's own error message is written for the wrong reader.** Every sentence in the debrief is
addressed to a student, and the builder reuses them to tell an *author* why their scenario does not
work. It reads as a bug in the ride rather than a mismatch in the reeks, and it sends the author
looking in the wrong place — as it did for most of an afternoon here. An authoring tool needs its
own register: numbers, not encouragement.

**Re-check an item before you fix it, not only before you write it.** The entry above was true of
the afternoon it came from and false of the tool by the time anybody read it — the builder had
covered it in three places, and one of those notices was on the screen at the moment I decided it
was missing. The habit that keeps this file honest is trying to *reproduce* the gap first, from a
clean draft, rather than trusting the note. Every wall in this round's list survived that test.
The one that did not was the one written from memory.

**There is no look between the glance and the schouderblik.** `EYE_LEFT` turns the head 25° and the
forward view reaches 31° beyond it, so a glance covers to 56° off the nose; the next thing available
is `SHOULDER_LEFT` at 102°. Nothing in between — and a rider stopped at haaientanden looking along a
priority road turns their head about 70°, which is precisely the hole.

*Voorrang verlenen op de zijweg* is built on that hole and says so in its own header. Its last look
was meant to be the one that finds the car; at the give-way line the car is 87 m away and **72,9°
off the nose**, so the glance cannot reach it and all three columns of its reveal table read the
same. Working it backwards is worse than the measurement: a car near enough to sit inside 56° at the
line is within 35 m of the junction, which at fifty is 2,6 s away, and the rider still needs 5,8 s
to cover the last 24 m. **The two requirements are geometrically incompatible**, so no amount of
retiming the traffic fixes it.

The tempting patch is to score `SHOULDER_LEFT` there, and it is worse than the gap. A schouderblik
is for the blind spot beside you; asking for one at a stop line teaches a student something false,
and this project's whole claim is that what it says is right. The real fix is a `HEAD_LEFT` /
`HEAD_RIGHT` pair at about 70° with the gaze targets and instrument dots to match — a change to the
look vocabulary, which is why it is here rather than done.

Note what carried the scenario anyway: the rules still discriminate and the incident still fires, so
a rider who crosses meets the car at 2,4 m and takes a `kritiek`. But `wasPerceived` is **false** on
that incident, which is the same finding wearing different clothes — everywhere else in this project
a kritiek means the rider saw the hazard and went anyway. Worth reading as a signal, not a detail.
