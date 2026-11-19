# Writing agent-facing text

Agents read `data-tour-label`, `data-tour-description` and `data-tour-reveal` (through `tour_list_targets`) and usually show the description as the card text. Treat them as the product's voice and as untrusted-by-default data surfaces: no secrets.

- **Description**: 1–2 sentences, at most 500 characters, plain text. Say what the control does and what comes next: "Opens the plan picker. Choose Team or Business, then confirm on the next screen."
- **Label**: what a person would call it, matching or clarifying the visible text ("Download invoices"). Use it for icon-only buttons.
- **Reveal**: the path to make it visible: "Open Security, then expand Advanced."
- **Ids**: stable and semantic (`two-factor`, `change-plan`), not positional (`btn-3`). Unique per document.
- **Disambiguate** repeated controls (two "Remove" buttons) with a `data-tour-label` that includes the row ("Remove Lee Park").
- **Describe consequences** of irreversible steps in the description ("Deletes the project for everyone"), and point at them only when asked; consider `data-tour-exclude` if an agent must never suggest them.
- Do not repeat the page title, do not address the agent ("you should call…"), do not include URLs, tokens, emails or personal data.
- Localise descriptions and `labels` together.

For an app's own WebMCP tools: say in the tool description that it stages the action and highlights the control the user must click, and return `{ staged: true, pointed: step.ok }`.
