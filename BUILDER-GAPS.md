# What the scenario builder cannot do yet

A running list, kept from actually trying to build things with it rather than from reading the code.
That is the whole method: every item here was found by sitting down to build an exercise and being
unable to, and not one of them was found by reading a file.

Two things are open. Everything that was ever on this list is closed — the history is in `git log`
and in pull requests #6 to #10, which is a better home for it than a document whose job is to say
what is still wrong.

---

## Open

### The overtake's three soft rules

`inhalen-snelweg-v1` has three rules that no deliberately sloppy rider misses:
`schouderblik-links`, `schouderblik-rechts` and `afstand-vrachtwagen-1`. They are pinned in
`discrimination.test.ts` so the list cannot grow in silence.

**The two schouderblik rules cannot be missed by omission.** `controlPrerequisites` refuses the
richtingaanwijzer without a schouderblik, so a rider who skips it never changes lane at all, and
every rule about how they changed lane produces no row rather than a miss. A rider who skips only
the mirror does look over their shoulder, and passes. So those rules are measured and never failed.
They are belt-and-braces over the prerequisite, which is a defensible thing to be — but nothing here
can confirm they do any work of their own.

**`afstand-vrachtwagen-1` is anchored to the wrong lane change.** `scoreHeadway` measures from
`manoeuvreCompletedAt`, which is the *first* lane change — by which point the rider is already left
of that lorry. The ride the rule was written to catch is caught anyway, and hard: `cutInEarly`
scores gezakt on an incident plus `afstand-vrachtwagen-2`, because tucking in between two lorries
puts you close in front of the one *behind*, not close behind the one ahead.

Measuring from the *last* lane change instead is the real fix. It changes scoring for the merge
scenario too, so it is not a change to make in passing, and it wants a before-and-after on both
motorways.

### A speedBand's middle rungs cannot be edited

The recipe writes two bands and the editor exposes the outer edges, keeping the shared boundary in
step so the two can never cross. The Dutch on each rung, and any third rung, still needs a text
editor. Not blocking — a two-band speed rule is a usable speed rule — but it is the one rule kind
whose data is richer than its form.

---

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
