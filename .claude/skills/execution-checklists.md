# Execution Checklists

## Incident Checklist

- Capture the exact symptom and where it appears.
- Reduce the problem to the smallest failing request, command, or interaction.
- Trace the request across boundaries one hop at a time.
- Collect one concrete signal per boundary before moving on.
- Reject weak hypotheses quickly.
- Apply the smallest defensible correction.
- Re-run the original failing path and one adjacent smoke test.

## Deploy Checklist

- Read the project's local deploy skill or deploy manual first.
- Confirm branch, remote sync state, and target environment.
- Confirm env, secrets, migrations, and dependencies required by the documented flow.
- Confirm rollback path before changing state.
- Execute only the documented deploy path for that project.
- Validate with explicit post-deploy checks.

## Verification Checklist

- Run the narrowest command that proves the claim.
- Prefer checks that measure user-visible behavior.
- Record status code, header, log line, test result, or health output that proves the result.
- If verification is partial, say exactly what is and is not validated.

## Closeout Checklist

- State the observed cause, not only the fix.
- State the evidence used.
- State the exact change made.
- State how the result was verified.
- State residual risk or remaining manual follow-up.
