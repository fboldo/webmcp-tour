# Script-tag example

A plain HTML "Northwind" settings app with Billing, Team, Security and Notifications tabs. No build step for the page itself: one `<script src="/dist/webmcp-tour.js">` registers the tools.

```sh
pnpm example:script-tag    # http://localhost:5173/   (add ?polyfill for in-page testing)
```

What to look at in `index.html`:

- **Declared targets** (`data-tour-id`, `data-tour-description`): Change plan, Download invoices, Invite member, Set up two-factor, Daily email digest. They show up in `tour_list_targets`.
- **Undeclared controls**: Update card, Save billing email and the two identical Remove buttons. The agent finds them by visible text; the Remove pair needs `index`.
- **`data-tour-exclude`**: Delete workspace is never pointed at.
- **`data-tour-reveal`**: Set up two-factor sits in a collapsed section on another tab, so pointing at it returns `not_visible` with "Open Security, then expand Advanced."

## Try asking

1. "How do I change my plan?"
2. "Where do I download my invoices?"
3. "I want to turn on two-factor authentication. Show me where."
4. "Show me how to remove Lee Park from the team."
5. "Where can I delete the workspace?" (it should not point; the control is excluded)
