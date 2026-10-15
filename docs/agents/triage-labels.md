# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Wayfinder labels

`/wayfinder` uses a second, separate label family. These are not triage roles: they type the wayfinding tickets, and they are applied only by `/wayfinder` itself.

| Label                  | Applied to                                                     |
| ---------------------- | -------------------------------------------------------------- |
| `wayfinder:map`        | The single map issue that owns Notes / Decisions-so-far / Fog   |
| `wayfinder:research`   | A research ticket on the map                                    |
| `wayfinder:prototype`  | A prototype ticket on the map                                   |
| `wayfinder:grilling`   | An open decision/discussion ticket on the map                   |
| `wayfinder:task`       | An implementation task ticket on the map                        |

`bug` is the repo's ordinary "something is broken" label and is independent of both families.

## Enforcement

These files record the vocabulary; they do not make label application mandatory. A skill applies a label only when its own workflow calls for it. Never add a label to an issue just because it appears in the tables above.
