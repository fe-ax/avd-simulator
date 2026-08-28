# What the scenario builder cannot do yet

A running list, kept from actually trying to build things with it rather than from reading the code.
That is the whole method: every item here was found by sitting down to build an exercise and being
unable to, and not one of them was found by reading a file.

**Nothing is open.** The list has emptied twice now — at pull request #14, and again here — and
both times it refilled because somebody rode a scenario and said it felt wrong, which is the only
way it ever has. It will refill again the same way. Sit down and make an exercise you have not made
before, a roundabout or a pedestrian crossing or something at night, and write down what you could
not do. Reading the code will not produce the next entry.

Every rule in every shipped scenario is missed by at least one deliberately sloppy rider, and
`discrimination.test.ts` asserts that with no exceptions list.

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
