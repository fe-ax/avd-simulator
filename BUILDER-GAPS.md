# What the scenario builder cannot do yet

A running list, kept from actually trying to build things with it rather than from reading the code.
That is the whole method: every item here was found by sitting down to build an exercise and being
unable to, and not one of them was found by reading a file.

The list has emptied twice — at pull request #14 and again at #17 — and refilled both times the
moment somebody tried to make something new with it. This is the third filling, and the first that
came from setting out to build a named exercise rather than from riding one that felt wrong.

**The shakedown:** *"you are in rijstrook 1 at 105 behind three lorries doing 90, an exit is coming
up, rijstrook 2 is clear. Fall in behind them, do the checks, and be in the uitvoegstrook inside its
first fifth — rather than blasting past all three at 130 and cutting in halfway down."*

**Result: not possible, and it stops early.** Three lorries can be put on a `doorgaand` road and
that is as far as it goes. There is no exit to aim at and no way to say a lane change belongs in a
particular stretch of road, which between them are the whole exercise.

Every rule in every shipped scenario is missed by at least one deliberately sloppy rider, and
`discrimination.test.ts` asserts that with no exceptions list.

---

## Open

### There is no exit

`MotorwayStretch` is `oprit | doorgaand`. An `oprit` is a slip road you join *from*; nothing
anywhere describes one you leave *by*. So the central object of the exercise — an uitvoegstrook
opening on the right, which you have to be in and be in early — cannot be placed on any road the
simulator can build.

The lane geometry is closer than it looks: `motorwayLanes` already returns a lane to the right of
rijstrook 1 with its blokmarkering band, because that is how the invoegstrook is built. What is
missing is a stretch that puts one *there*, a route that can reach it, and surfaces that draw it.

### The kind of motorway cannot be changed

Found while looking for somewhere to put the exit, and it is the more general problem. The road
form has fields for whichever stretch the base happens to be — a `doorgaand` road offers Start and
Einde, an `oprit` offers the ramp and the strook — and **no control anywhere switches between
them**. The kind is decided entirely by which scenario you derived from.

So even the two kinds that already exist are only reachable by starting from the right base, and
adding a third would not by itself make it reachable at all. A `Nieuwe snelweg` starter can never
become an oprit, and a scenario about an exit would need a shipped scenario about an exit to derive
from before anybody could build a second one.

### A lane change cannot be told where to happen

`laneChange` asks only whether a change in that direction ever happened. It is handed a window and
ignores it, and the builder says so in the sentence under the rule: *"Of je die kant op één keer van
rijstrook wisselt. Geen venster."*

The whole lesson here is *where* — first fifth of the strook good, middle a remark, past halfway a
fault. None of that is expressible, and the difference between a clean exit and the fault being
taught is invisible to the scoring.

It wants the shape `speedBand` and `headway` already use: an ordered list of ranges to outcomes,
first match wins, anything outside falling through to `missed`. `BandEditor` already draws exactly
that, which is a good sign for it and the reason this is smaller than it sounds.

### Small, found on the way

The **Invoegstrook** width field shows on a `doorgaand` road, which has no invoegstrook. It is a
real property of `MotorwayRoad` and it does nothing there, so the form offers a number that changes
nothing on the road in front of you.

---

## What this list has taught

Six things worth keeping. What the rest of the closed items taught is in `CLAUDE.md`, next to the
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
tests. Same shape as the reveal table in `CLAUDE.md` having gone stale for exactly one scenario: the
interesting case is the one that is not like the others.

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
