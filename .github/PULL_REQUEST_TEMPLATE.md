---
name: Pull Request
about: Submit a pull request to Procly
---

## Pull Request Checklist

- [ ] I have tested my changes thoroughly (backend & frontend).
- [ ] No API keys (including Gemini) or sensitive credentials are present in the code, comments, or commit history.
- [ ] UI changes follow Ant Design patterns and components for consistency.
- [ ] All new features or fixes are documented in the README or relevant docs.
- [ ] Code is linted and passes all tests.
- [ ] I have reviewed the security implications of my changes.

## Description
Provide a concise summary of the changes and motivation.

## Related Issues
Link related issues or discussion threads.

## Screenshots / UI Notes
Include screenshots or notes explaining UI changes and Ant Design component usage.

## Security Checklist

- Confirm no API keys or secrets were added.
- Confirm no secrets appear in diffs, comments, or commit messages.
- If the change touches authentication or key handling, include a short security rationale.

---
**Security Reminder:**

- Never commit or expose API keys (Gemini or others). Use environment variables, secrets managers, or localStorage for BYOK on the frontend as appropriate.
- PRs will be reviewed for security and compliance.
