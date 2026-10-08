# Price sync

Live at **[prices.tasti.io](https://prices.tasti.io)**. Part of the
[Tasti.io demos](https://demo.tasti.io).

A price lives in five places: the till, the website and three delivery apps,
each with its own markup. This shows every price on every channel against the
group's own rule, what each sale actually leaves after food, packaging and the
channel's cut, and lets an owner make one change as a rule, approve it, send it
everywhere, and see whether it really landed.

## The one rule

**Saying is not doing. A change is not reported as done until it has been seen.**

Each channel in `lib/channels-sim.js` has two faces, kept apart on purpose:

- `publish()`: what the channel *says* when it is sent a change
- `verify()`: a separate read afterwards, comparing every intended price with
  what the channel now shows

The demo plants the two ways a handoff fails quietly. Uber Eats accepts a bulk
update and leaves items that carry modifier groups at their old price; re-sent
one at a time, they move. SkipTheDishes refuses an item whose name nobody has
confirmed as matching a menu item. A tool that trusts the first answer reports a
clean run on both. These are illustrations of failure modes, not a description
of how either app's real API behaves.

The fixes are deliberately human-sized. Re-sending one item at a time is a
button. An unmatched name is confirmed by a person, once; the tool never guesses
which listing is which, because a guessed match changes the price of the wrong
thing.

## The flow

1. **Menu** (`/`): every item, every channel, against Harbour's rule (apps sit
   15% above the till, rounded up to .49 or .99), with drift and unconfirmed
   names marked.
2. **Margins** (`/margins`): what one sale leaves on each channel. Deliberately
   not called profit, because labour and rent still come out of it.
3. **Change** (`/change`): write a rule ("+$1 on bowls", "plates to 30% food
   cost"). `preview()` turns it into concrete prices per channel, says in advance
   which will be refused, and what it moves a week if volume holds. Nothing is
   sent from this page.
4. **Approve** (`/approve`): a person approves; each channel is sent its part and
   then read again.
5. **Log** (`/log`): every change, what each channel showed when checked, retry
   and roll back. A rollback is itself checked.

All arithmetic lives in `lib/pricing.js`: till prices move in quarters and are
never rounded down, over-policy prices are listed but not counted as a loss, and
a month is 52 weeks over 12, not four weeks.

## Running it safely in public

There is no database. The visitor's browser keeps the list of pushes it has made,
the names it has confirmed and the changes it has proposed. Every request sends
that list back, and the server rebuilds every channel by replaying it from
Harbour's starting menu. Nothing a visitor does is seen by anybody else, and
"Reset the demo" puts everything back.

Because the history comes from a browser, it is not trusted. `checkHistory()`
refuses a malformed history whole rather than applying part of it: unknown
channels or items, prices outside $1 to $100 or not in whole cents, more than 80
pushes or 60 operations per push. `checkRule()` bounds every kind of change.
`lib/http.js` accepts POST only, caps the body at 64 KB, and turns a bad body
into a 400 rather than a crash.

**What is simulated.** All five channels. There is no connection to Square,
DoorDash, Uber Eats, SkipTheDishes or any website. Harbour & Co is the fictional
group from [harbour-data](https://github.com/Tasti-io/harbour-data), vendored
under `lib/harbour` with a `VERSION` hash the self-test checks, so a build never
has to fetch a second repo. Prices, recipes, volumes and commission rates are
invented and describe a fictional operator. On a real account the till would be
the POS's own API and the apps reached directly or through ordering middleware;
the rule, preview, approval, second look and log stay the same.

## Layout

```
api/state.js           every channel's menu, drift against the rule, margins
api/preview.js         a rule in, the concrete change out; nothing is changed
api/publish.js         send one channel its part, report what it said
api/verify.js          read the channel back and compare every intended price
lib/channels-sim.js    the five simulated channels, history replay, input checks
lib/pricing.js         margins, drift, rule validation, preview
lib/http.js            POST-only JSON endpoint wrapper with a body cap
lib/harbour/           vendored Harbour & Co dataset (menu, ingredients, channels)
public/                the five pages and their scripts
scripts/dev.mjs        local server using the same handlers
scripts/selftest.mjs   44 checks, no network
```

## Run

```bash
npm run check   # self-test, no network or API key needed
npm run dev     # local server on http://localhost:3050
```

No npm dependencies.
