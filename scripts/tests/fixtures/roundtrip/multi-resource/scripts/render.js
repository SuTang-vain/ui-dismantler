const sourceRoot = document.getElementById('app');
sourceRoot.className = 'feature-panel';
sourceRoot.innerHTML = '<h1 class="feature-title"></h1><button class="feature-action"></button>';
sourceRoot.querySelector('.feature-title').textContent = window.featureData.title;
sourceRoot.querySelector('.feature-action').textContent = window.featureData.action;
