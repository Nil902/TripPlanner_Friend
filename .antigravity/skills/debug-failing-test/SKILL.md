---
name: debug-failing-test
description: Use when the user asks to investigate, diagnose, or fix a failing unit, integration, or property test in the backend or frontend.
---

# Workflow: Debug a Failing Test

Follow this procedure whenever diagnosing and resolving a test failure.

## Step-by-Step Procedure

1. **Reproduce and Isolate Failure:**
   - Run the failing test in isolation to capture detailed failure output:
     - For Backend:
       ```bash
       cd backend && source .venv/bin/activate
       pytest tests/path/to/test_file.py::test_function_name -vv -s --tb=short
       ```
     - For Frontend:
       ```bash
       cd frontend
       npm run test -- -t "test description snippet"
       ```

2. **Analyze Failure Output & Root Cause:**
   - Identify the exact point of divergence:
     - Is it an assertion failure (e.g., expected `valid` got `partial`)?
     - Is it an unexpected exception or 500 error (traceback)?
     - Is it an asynchronous race condition or unawaited promise?
     - Is it a schema validation error (`pydantic.ValidationError` or TypeScript type mismatch)?
   - State the hypothesized root cause before altering any source code.

3. **Check Regression Risk:**
   - Check if the failing test was newly added or was previously passing.
   - Inspect recent git commits or related changes in `git log -n 5` to identify what introduced the divergence.

4. **Implement Minimal Targeted Fix:**
   - Modify only the specific logic responsible for the failure.
   - Do NOT weaken test assertions, comment out tests, or use skip markers (`@pytest.mark.skip`, `it.skip`) unless explicitly instructed by the user.

5. **Verify Fix & Broader Test Suite:**
   - Rerun the isolated test to verify it passes.
   - Run the entire test suite to guarantee no regressions were introduced:
     ```bash
     # Backend
     cd backend && pytest -v
     
     # Frontend
     cd frontend && npm run test
     ```

6. **Confirm Lint & Types:**
   - Ensure the fix passes all static analysis:
     ```bash
     cd backend && ruff check . && mypy app
     cd frontend && npm run lint && npm run typecheck
     ```
