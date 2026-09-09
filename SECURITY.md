# Security Policy & Sensitive Areas

This document details security boundaries, sensitive zones, credential handling, and policies governing human contributors and AI agents.

---

## 1. Sensitive Areas (Strict Human Review Required)

AI coding agents and automated scripts **must never modify, bypass, or refactor code in the following sensitive areas without explicit human confirmation and code review**:

### 1.1 Authentication & Session Management
- **Paths:** `backend/app/auth/`, `backend/app/security/`, `frontend/src/context/AuthContext.tsx`
- **Rules:**
  - Do not modify session token generation, cookie attributes (`HttpOnly`, `SameSite`, `Secure`), or permission verification routines.
  - Do not bypass creator-versus-joiner authorization guards (joiners must not be able to trigger trip regeneration or deletion).

### 1.2 Secrets & Credential Management
- **Paths:** `.env*`, `backend/app/config.py`, `.github/workflows/`
- **Rules:**
  - Never commit real API keys, secrets, private keys, or credentials to version control.
  - All credentials must be read from environment variables or secret managers.
  - Agents must never print or log raw values of `GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `DATABASE_URL`.

### 1.3 Financial & Split Calculation Logic
- **Paths:** `backend/app/services/expense_service.py`, `backend/app/validators/budget_validator.py`
- **Rules:**
  - Settle-up and balance-splitting algorithms must preserve numerical precision and prevent negative or manipulated credit/debt allocations.
  - Any changes to mathematical distribution logic require explicit review and automated property-based test validation.

### 1.4 Personally Identifiable Information (PII)
- **Paths:** `backend/app/models/user.py`, `backend/app/models/constraint.py`
- **Rules:**
  - User names, email addresses, dietary constraints, and specific medical/mobility restrictions are considered private user data.
  - PII must not be sent to external LLM providers unless strictly necessary for schedule constraint solving, and must never be persisted in unauthenticated public debug endpoints.

---

## 2. Agent Constraints & Guardrails

All autonomous agents working on this repository must obey the following hard constraints:

1. **No Production Database Dropping:** Never execute `DROP TABLE`, `TRUNCATE`, or destructive migration down-revisions on production databases.
2. **No Blind Dependency Additions:** Do not introduce third-party packages or Docker base images without checking for existing alternatives and auditing for security advisories.
3. **No Network Bypass:** Never write code that opens arbitrary reverse tunnels, disables TLS verification (`verify=False` in Python requests/httpx), or permits permissive CORS (`AllowOrigins: ["*"]` in production).
4. **Credential Redaction:** If an agent encounters a secret in logs, errors, or files, it must immediately alert the user to rotate the key and ensure it is expunged from git history.

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability in this project:

1. **Do not create a public GitHub issue.**
2. Report the vulnerability privately to the maintainers at `security@example.com` (or the repository owner).
3. Include detailed steps to reproduce the issue, along with affected versions and potential mitigations.
4. Maintainers will acknowledge receipt within 48 hours and coordinate a fix prior to public disclosure.
