window.FeatureLibrary = {
  mount(container, data) {
    container.innerHTML = '<main class="sg-feature-panel"><h1 class="sg-feature-title"></h1><button class="sg-feature-action"></button></main>';
    container.querySelector('.sg-feature-title').textContent = data.title;
    container.querySelector('.sg-feature-action').textContent = data.action;
  }
};
