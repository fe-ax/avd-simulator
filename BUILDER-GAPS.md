# What the scenario builder cannot do yet

A running list, kept from actually trying to build things with it rather than from reading the code.
That is the whole method: every item here was found by sitting down to build an exercise and being
unable to, and not one of them was found by reading a file.

Two things are open. Everything else that was ever on this list is closed — the history is in
`git log` and in pull requests #6 to #12, which is a better home for it than a document whose job is
to say what is still wrong.

Every rule in every shipped scenario is now missed by at least one deliberately sloppy rider, and
`discrimination.test.ts` asserts it with no exceptions list.

---

## Open

### A speedBand's middle rungs cannot be edited

The recipe writes two bands and the editor exposes the outer edges, keeping the shared boundary in
step so the two can never cross. The Dutch on each rung, and any third rung, still needs a text
editor. Not blocking — a two-band speed rule is a usable speed rule — but it is the one rule kind
whose data is richer than its form.

### The approach headway is not measured on the motorway

`scoreHeadway` only measures once the rider has changed lane, because before that "the gap is not a
following distance, it is just two vehicles on different bits of road" — true on the oprit, where
the traffic is on a different carriageway. On the open motorway it is false: sitting on the bumper
of the lorry you are waiting to pass is a real fault, the exam looks for it, and there is a
`tailgate` rider ready to catch it. Nothing measures it.

Making the gate scenario-controlled rather than universal would fix it. That is a scoring change
affecting both motorways and wants its own before-and-after.

## What this list has taught

Four things worth keeping. What the rest of the closed items taught is in `CLAUDE.md`, next to the
code it applies to.

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

**A rule that cannot be failed is more often a missing rider than a bad rule.** Three rules on the
A12 sat on this list for two rounds under a confident explanation of why they were unfixable — the
prerequisite made the mistake impossible, the anchor was wrong, they were belt-and-braces. All three
were wrong. The schouderblik rules are about looking *too early*, which nothing did; the gap rule
needed a weaver that actually fits between the lorries, and `cutInEarly` demanded sixty-five metres
of clearance to enter a forty-three metre gap, so it cleared both and cut in front instead. Check
that the mistake is really being made before concluding it cannot be.
