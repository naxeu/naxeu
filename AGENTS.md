# AGENTS.md

Guidance for AI agents working in this repository.

## Repository status

As of the initial setup, this workspace contains only `LICENSE` (GNU AGPL v3). There is no application source, dependency manifests, CI configuration, or runnable services yet.

## Cursor Cloud specific instructions

- **Update script**: No dependency refresh is required until manifests such as `package.json`, `pyproject.toml`, or `go.mod` are added. The VM update script is a no-op (`true`).
- **Services**: None defined. Do not expect dev servers, databases, or Docker Compose stacks until they are added to the repo.
- **Lint / test / build / run**: Not applicable until code and tooling are introduced. After code lands, document commands here and in the root README rather than duplicating them in multiple places.
- **Git**: Default branch is `main`. Remote is `https://github.com/naxeu/naxeu`.

When application code is added, update this section with non-obvious startup caveats (ports, env vars, hot-reload quirks, etc.) and point the update script at the real install command (for example `npm install` or `uv sync`).
