---
type: adr
status: accepted
decided: 2026-08-06
issues: [21, 43, 68]
---

# ADR-0017 — A probe authenticates from the environment, over an empty home

The measurement design asks the isolation probe to run in a redirected home.
A redirected home holds no credentials, so the harness refused to run and
answered that it was not logged in. Both arms recorded that answer, and the
probe never reached the question it asks.

Copying a credential into the home was the obvious repair, and it does not
work here. This platform keeps its token in the keychain and has no credential
file to copy. The only home-side candidate carries servers, project history,
and account state in one file, and that content shapes behaviour, which is
what a pristine control exists to exclude.

**Decision.** A probe run authenticates from `ANTHROPIC_API_KEY` in the
environment, over a home that stays empty. The owner sets the key. The
collector reads its presence and refuses to run without it, and no part of
this repository reads, writes, prints, or records the value. The environment
class in the identity tuple is `empty-home`, named for the home rather than for
the credential, because a home that held a credential would be a different
environment and needs a different name to compare as one. `check:probes`
refuses a record carrying anything shaped like a key, since a record is
committed and a leaked key would be published.

**Consequences.** The probe reaches its question, and every arm runs over a
home with nothing in it, which is the strongest form of the pristine class the
design describes. Probe runs bill the API rather than a subscription, until the
amendment below lands, and the design already prices installed delivery as
publication-tier work. A
representative-stack probe stays unbuilt, and the collector refuses to label a
record with a class it did not construct.

Decided 2026-08-06, on issue #68. The mechanism is the measurement design,
section 4.

Amended 2026-08-06, by owner directive. The API key is one route and not the
only one. A subscription token reaches an arm the same way, as environment over
an empty home, so the environment class and the isolation design are unchanged.
`CLAUDE_CODE_OAUTH_TOKEN` becomes first class beside `ANTHROPIC_API_KEY`, the
subscription route wins when both are set, and the missing-credential refusal
names both. Issue #77 carries the implementation and the open question of
whether a record names the route it authenticated by. Until #77 lands, the
collector reads the API key alone.

Amended again on 2026-08-06, closing that open question. **A record names the
route, and the route is not part of the identity tuple.** It is provenance,
beside the flags and the planted nonce.

Two routes can bill, rate-limit, and tier a request differently, and any of
those could move what a harness returns. A record that stayed silent would
leave a reader unable to ask whether it mattered, which is the failure the
whole design exists to prevent. So the route is recorded, and `check:probes`
refuses a record without it.

It stays out of the tuple because the tuple is defined once, in section 4.1 of
the measurement design, and nothing generalises across any element of it.
Adding an element would split probe coverage in two overnight, so that a
subscription probe stopped covering an API-key study, on a suspicion nobody has
measured. The evidence for that split does not exist yet. Recording the route
is what makes gathering it possible: when two probes differ only by route and
their bytes disagree, the tuple gains an element and this note is the thing
that gets amended. Silence would have made that comparison impossible to run.

That flip condition says "differ only by route", and it is worth nothing unless
something makes it true. A shell can set a base URL, an auth token, or a
provider switch, and any of them changes what a request meets on the way out.
So the arm's environment is built from an allowlist rather than by removing the
variables this repository happens to know: an arm inherits a named set, one
credential, and a redirected home, and nothing else. A shell that configures a
route the collector does not model is refused by name rather than guessed at.
Until that held, two probes could differ by a great deal while their records
differed only by route, and the comparison this note promises would have
compared the wrong thing.

The class named `api-key-empty-home` was the same mistake in the other
direction. Both routes build the same environment, so a class named for one of
them put the route inside the tuple by the back door, and every subscription
run carried a false class while the check said nothing. It is `empty-home`, and
a home that HELD a credential would be a different class.

The credential itself never enters a record. `check:probes` refuses anything
shaped like one, by either route, and every message it prints is redacted at
the point of emission rather than message by message — the refusal for a bad
flag once quoted that flag's value, one line above the refusal promising
nothing is quoted.
