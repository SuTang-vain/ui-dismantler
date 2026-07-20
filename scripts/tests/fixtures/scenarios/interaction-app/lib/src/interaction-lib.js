window.InteractionLibrary = {
  mount(container) {
    container.innerHTML = `
      <main class="sg-app-shell">
        <nav class="sg-tabs" role="tablist">
          <button class="sg-tab active" data-panel="overview">Overview</button>
          <button class="sg-tab" data-panel="details">Details</button>
        </nav>
        <section class="sg-panel active" data-view="overview">Overview content</section>
        <section class="sg-panel" data-view="details" hidden>Details content</section>
        <form class="sg-profile-form">
          <label for="library-name">Display name</label>
          <input id="library-name" class="sg-name-input">
          <output class="sg-name-output">No name</output>
        </form>
        <button class="sg-open-dialog">Open dialog</button>
        <div class="sg-dialog-overlay" hidden>
          <section class="sg-dialog" role="dialog" aria-label="Confirmation">
            <p>Confirmation dialog</p>
            <button class="sg-close-dialog">Close</button>
          </section>
        </div>
        <p class="sg-layout-state"></p>
      </main>`;
    const tabs = [...container.querySelectorAll('.sg-tab')];
    tabs.forEach((tab) => tab.addEventListener('click', () => {
      tabs.forEach((item) => item.classList.toggle('active', item === tab));
      container.querySelectorAll('.sg-panel').forEach((panel) => {
        const active = panel.dataset.view === tab.dataset.panel;
        panel.hidden = !active;
        panel.classList.toggle('active', active);
      });
    }));
    const input = container.querySelector('.sg-name-input');
    input.addEventListener('input', () => {
      container.querySelector('.sg-name-output').textContent = input.value || 'No name';
    });
    const overlay = container.querySelector('.sg-dialog-overlay');
    container.querySelector('.sg-open-dialog').addEventListener('click', () => {
      overlay.hidden = false;
      overlay.classList.add('open');
    });
    container.querySelector('.sg-close-dialog').addEventListener('click', () => {
      overlay.hidden = true;
      overlay.classList.remove('open');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        overlay.hidden = true;
        overlay.classList.remove('open');
      }
    });
    container.querySelector('.sg-layout-state').textContent =
      window.matchMedia('(max-width: 500px)').matches ? 'mobile-state' : 'desktop-state';
  }
};
