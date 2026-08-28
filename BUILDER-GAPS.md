# What the scenario builder cannot do yet

A running list, kept from actually trying to build things with it rather than from reading the code.
That is the whole method: every item here was found by sitting down to build an exercise and being
unable to, and not one of them was found by reading a file.

The list has emptied three times now — at pull requests #14, #17 and #18 — and refilled every time
somebody tried to make something new with it. The third filling came from setting out to build a
named exercise rather than from riding one that felt wrong, and it is the one that has paid best:
the four walls it found were the exit, the stretch-kind switch, the graded lane change and the
missing look controls, and *Uitvoegen op de A12* now ships having been built through the form.

**The shakedown:** *"you are in rijstrook 1 at 105 behind three lorries doing 90, an exit is coming
up, rijstrook 2 is clear. Fall in behind them, do the checks, and be in the uitvoegstrook inside its
first fifth — rather than blasting past all three at 130 and cutting in halfway down."*

**Result: it can now be built end to end**, and was. The exported file went into `src/sim` unedited.
What follows is what the *second* half of that build ran into, after the road and the rule existed.

Every rule in every shipped scenario is missed by at least one deliberately sloppy rider, and
`discrimination.test.ts` asserts that with no exceptions list.

---

## Open

### A failing model rider does not say why it failed

The one that cost the most this round. The reeks was right, the road was right, and the panel said:

> *Een rijder die alles goed doet, haalt dit niet. 0/2/0 — Schouderblik rechts: **je ging van strook
> zonder dit eerst te controleren.***

Which is the sentence written for the *student*. The truth was that `driveExit` did its checks 120 m
before the strook and the rule's window was five seconds, and at ninety km/h those do not overlap —
the look happened, 5,8 s before the lane change, and the rule wanted it inside five. Nothing on the
screen could have told an author that. They see a look they know the rider did, reported as not
done, with no number anywhere near it.

What is missing is the author's version of that sentence: *the control was pressed at 12,4 s, the
lane change began at 18,2 s, the window is 5 s.* The data is all in the record; the panel simply
does not show it. Until it does, any rule with a temporal window is tuned by guessing, and the
obvious guess — widen it until the model rider passes — is exactly how a rule goes soft.

### A rule can point at nobody and score silently

A fresh Volgafstand rule arrives with `actorId: ''`. That is not a road user, so the rule measures
nothing, produces no row, and looks fine — the exercise just quietly has one fewer rule than it
appears to. Here it took the discrimination panel to notice, which caught it honestly enough
(*"ook een slordige rijder haalt dit"*) but named the symptom rather than the cause.

An unset target is not the same as a target that turns out not to matter, and the form should say so
before the ride does. It is the same class as the empty-extent bug: the case nobody looked at is the
default one.

### Small, found on the way

The **Invoegstrook** width field shows on a `doorgaand` road, which has no strook to widen. The
field is a real property of `MotorwayRoad` and it now means something on two of the three stretch
kinds, so this narrowed rather than closed: on a through road it is still a number that changes
nothing in front of you.

---

## What this list has taught

Seven things worth keeping. What the rest of the closed items taught is in `CLAUDE.md`, next to the
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
