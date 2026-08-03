# Phase 2 Grammar-Consumer Placeholders

PAT-008 initially used three fixed consumers to isolate structural macro matching
from the TypeScript grammar work scheduled for Phase 4. ENF-003 replaced the
expression placeholder with the production Pratt consumer. Tests load the machine-readable
ledger at `fixtures/phase-02/structural-examples/placeholders.json` and reject
an untracked placeholder.

| Class     | Phase 2 behavior                | Replacement |
| --------- | ------------------------------- | ----------- |
| `binding` | consume one identifier token    | `ENF-005`   |
| `type`    | consume one balanced token tree | `ENF-006`   |

The remaining fixture syntax avoids claims about full binding or type extent.
Phase 4 replaces those consumers before expansion acceptance tests use
production source.
