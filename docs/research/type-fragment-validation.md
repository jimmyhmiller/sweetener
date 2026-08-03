# Type and TSX Fragment Validation

Status: experiment complete

Decision target: `OPEN-EXP-001`

The experiment compares two uses of the pinned TypeScript parser:

1. parse every protected fragment inside a minimal type-alias or expression
   wrapper;
2. concatenate protected fragments into one synthetic file per script kind and
   parse each file once.

Run `pnpm benchmark:fragments` to regenerate
`artifacts/fragment-validation.json`. The benchmark records parser calls, input
bytes, allocated AST nodes, elapsed time over 200 passes, diagnostic codes, and
whether each diagnostic starts inside its original fragment region.

## Result

Full-file validation uses two parser calls per pass, compared with seven wrapper
calls for the current mixed type/TSX corpus. It also shares source-file and EOF
nodes. Wrapper validation retains the cleaner failure boundary: every diagnostic
already belongs to one fragment and its position needs only a constant prefix
offset. Full-file validation must maintain a region table, and recovery from one
malformed fragment can influence later parse structure.

Use full-file parsing as the normal validation gate after expansion. Use wrapper
parsing for an isolated protected fragment when a consumer mismatch needs a
precise local diagnostic before a complete file exists. Both strategies use the
same pinned TypeScript version, and neither strategy defines macro extent.
