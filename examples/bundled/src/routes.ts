// Each route returns its markup. Declared targets exist only while their route is shown.
export const routes: Record<string, () => string> = {
  "/": () => `
    <h1>Dashboard</h1>
    <section class="card">
      <h2>This month</h2>
      <p>12 active projects, 5 seats used.</p>
      <p class="note">No declared targets on this route: <code>tour_list_targets</code> is not registered here, but the agent can still point by text.</p>
      <button type="button">View report</button>
    </section>`,

  "/projects": () => `
    <h1>Projects</h1>
    <section class="card">
      <p><button type="button" class="primary" data-tour-id="new-project"
        data-tour-description="Creates an empty project. You can invite people afterwards.">New project</button></p>
      <table>
        <thead><tr><th>Name</th><th>Owner</th><th></th></tr></thead>
        <tbody>
          <tr><td>Website relaunch</td><td>Ana Costa</td><td><button type="button">Archive</button></td></tr>
          <tr><td>Mobile app</td><td>Lee Park</td><td><button type="button">Archive</button></td></tr>
        </tbody>
      </table>
      <p class="note">Open Settings to see the declared targets change.</p>
    </section>`,

  "/settings": () => `
    <h1>Settings</h1>
    <section class="card">
      <h2>API access</h2>
      <details>
        <summary>Developer options</summary>
        <p><button type="button" data-tour-id="api-token"
          data-tour-description="Creates a personal API token. It is shown once, so copy it straight away."
          data-tour-reveal="Open Settings, then expand Developer options.">Create API token</button></p>
      </details>
    </section>
    <section class="card">
      <h2>Notifications</h2>
      <label><input type="checkbox" checked data-tour-id="email-digest"
        data-tour-description="Sends one summary email a day instead of one email per event."> Daily email digest</label>
      <label><input type="checkbox"> Product news</label>
    </section>
    <section class="card">
      <button type="button" class="danger" data-tour-exclude>Delete workspace</button>
      <span class="note">Marked <code>data-tour-exclude</code>: never pointed at.</span>
    </section>`,
};
