"""Browser-side initialization script for runtime observation.

This JS is injected into the headless browser by the runtime observer to
track addEventListener registrations, on* property handlers, and candidate
elements. It exposes window.__uiirRuntime with prepare/candidates/state/
snapshot/exercise methods.
"""

INIT_SCRIPT = r"""
(() => {
  const records = [];
  const errors = [];
  const propertyKeys = new Set();
  let nextId = 1;
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  const listenerMaps = new WeakMap();

  function stackLocation() {
    const stack = String(new Error().stack || '').split('\n');
    for (const line of stack) {
      if (line.includes('__uiirRuntime') || line.includes('stackLocation')) continue;
      const match = line.match(/((?:file|https?):\/\/[^\s)]+):(\d+):(\d+)/);
      if (match) return {url: match[1], line: Number(match[2]), column: Number(match[3])};
    }
    return null;
  }

  function selectorFor(target) {
    if (target === window) return 'window';
    if (target === document) return 'document';
    if (!(target instanceof Element)) return target && target.constructor ? target.constructor.name : 'unknown';
    if (target.id) return '#' + CSS.escape(target.id);
    for (const name of ['data-testid', 'data-key', 'data-p', 'data-id']) {
      const value = target.getAttribute(name);
      if (value) return '[' + name + '="' + String(value).replace(/"/g, '\\"') + '"]';
    }
    const classes = Array.from(target.classList || []).filter(Boolean).slice(0, 3);
    let selector = target.tagName.toLowerCase() + classes.map(value => '.' + CSS.escape(value)).join('');
    if (target.parentElement) {
      const peers = Array.from(target.parentElement.children).filter(node => node.tagName === target.tagName);
      if (peers.length > 1) selector += ':nth-of-type(' + (peers.indexOf(target) + 1) + ')';
    }
    return selector;
  }

  function optionView(options) {
    if (typeof options === 'boolean') return {capture: options};
    if (!options || typeof options !== 'object') return {};
    return {capture: !!options.capture, once: !!options.once, passive: !!options.passive};
  }

  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (!listener) return originalAdd.call(this, type, listener, options);
    const record = {
      id: nextId++, target: this, event: String(type), api: 'addEventListener',
      options: optionView(options), location: stackLocation(), invocationCount: 0
    };
    records.push(record);
    let wrapped = listener;
    if (typeof listener === 'function') {
      wrapped = function(...args) {
        record.invocationCount += 1;
        return listener.apply(this, args);
      };
    } else if (listener && typeof listener.handleEvent === 'function') {
      wrapped = {handleEvent(...args) {
        record.invocationCount += 1;
        return listener.handleEvent.apply(listener, args);
      }};
    }
    let entries = listenerMaps.get(this);
    if (!entries) { entries = []; listenerMaps.set(this, entries); }
    entries.push({type: String(type), listener, wrapped, capture: !!(typeof options === 'boolean' ? options : options && options.capture)});
    return originalAdd.call(this, type, wrapped, options);
  };

  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    const capture = !!(typeof options === 'boolean' ? options : options && options.capture);
    const entries = listenerMaps.get(this) || [];
    const found = entries.find(entry => entry.type === String(type) && entry.listener === listener && entry.capture === capture);
    return originalRemove.call(this, type, found ? found.wrapped : listener, options);
  };

  originalAdd.call(window, 'error', event => {
    errors.push(String(event.error && event.error.message || event.message || event));
  });
  originalAdd.call(window, 'unhandledrejection', event => {
    errors.push(String(event.reason && event.reason.message || event.reason || event));
  });

  function refreshPropertyRecords() {
    const roots = [window, document, ...document.querySelectorAll('*')];
    for (const target of roots) {
      const names = [];
      if (target instanceof Element) {
        for (const attr of target.getAttributeNames()) if (attr.startsWith('on')) names.push(attr);
      }
      for (const event of ['click','change','input','submit','focus','blur','keydown','keyup','touchstart','touchend']) {
        const name = 'on' + event;
        try { if (typeof target[name] === 'function') names.push(name); } catch (_) {}
      }
      for (const name of new Set(names)) {
        const event = name.slice(2);
        const selector = selectorFor(target);
        const key = selector + '\u0000' + event + '\u0000property-handler';
        if (propertyKeys.has(key)) continue;
        propertyKeys.add(key);
        records.push({
          id: nextId++, target, event, api: 'property-handler', options: {},
          location: null, invocationCount: 0, propertyName: name, wrappedProperty: null
        });
      }
    }
  }

  function preparePropertyTracking() {
    refreshPropertyRecords();
    for (const record of records) {
      if (record.api !== 'property-handler' || !record.propertyName) continue;
      let current;
      try { current = record.target[record.propertyName]; } catch (_) { continue; }
      if (current === record.wrappedProperty || typeof current !== 'function') continue;
      const original = current;
      const wrapped = function(...args) {
        record.invocationCount += 1;
        return original.apply(this, args);
      };
      try {
        record.target[record.propertyName] = wrapped;
        if (record.target[record.propertyName] === wrapped) record.wrappedProperty = wrapped;
      } catch (_) {}
    }
  }

  function isVisible(target) {
    if (!(target instanceof Element) || !target.isConnected || target.hidden) return false;
    const style = getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collectCandidates(limit) {
    refreshPropertyRecords();
    const targets = new Set(document.querySelectorAll(
      'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="checkbox"],[onclick]'
    ));
    for (const record of records) {
      if (record.target instanceof Element && record.target.isConnected) targets.add(record.target);
    }
    const output = [];
    for (const target of targets) {
      if (output.length >= limit) break;
      const tag = target.tagName.toLowerCase();
      const type = String(target.getAttribute('type') || '').toLowerCase();
      const role = String(target.getAttribute('role') || '').toLowerCase();
      let action = 'click';
      if (tag === 'select') action = 'select';
      else if (tag === 'textarea' || (tag === 'input' && !['button','submit','reset','checkbox','radio','file','image'].includes(type))) action = 'fill';
      else if (tag === 'input' && ['checkbox','radio'].includes(type)) action = 'check';
      const events = Array.from(new Set(records.filter(record => record.target === target).map(record => record.event))).sort();
      const navigationRisk = tag === 'a' || type === 'submit' || !!target.closest('form') && action === 'click';
      output.push({
        selector: selectorFor(target), action, tag, type, role,
        visible: isVisible(target),
        disabled: !!target.disabled || target.getAttribute('aria-disabled') === 'true',
        requiresInput: action === 'fill' || action === 'select',
        sensitiveInput: type === 'password',
        navigationRisk,
        events,
        inlineHandler: target.hasAttribute('onclick') || target.hasAttribute('onchange') || target.hasAttribute('oninput')
      });
    }
    return output;
  }

  function runtimeState(limit) {
    const candidates = collectCandidates(limit);
    const elements = new Map(candidates.map(item => [item.selector, document.querySelector(item.selector)]));
    const selected = predicate => candidates.filter(item => {
      const target = elements.get(item.selector);
      return target && predicate(target, item);
    }).map(item => item.selector).sort();
    return {
      locationHash: location.hash || '',
      active: document.activeElement instanceof Element ? selectorFor(document.activeElement) : '',
      visible: candidates.filter(item => item.visible).map(item => item.selector).sort(),
      checked: selected(target => !!target.checked),
      disabled: candidates.filter(item => item.disabled).map(item => item.selector).sort(),
      expanded: selected(target => target.getAttribute('aria-expanded') === 'true')
    };
  }

  window.__uiirRuntime = {
    records, errors, selectorFor,
    prepare() { preparePropertyTracking(); return records.length; },
    candidates(limit) { return collectCandidates(Math.max(0, Number(limit) || 0)); },
    state(limit) { return runtimeState(Math.max(0, Number(limit) || 0)); },
    snapshot(limit) {
      refreshPropertyRecords();
      const output = records.map(record => ({
        id: record.id,
        selector: selectorFor(record.target),
        event: record.event,
        api: record.api,
        options: record.options,
        location: record.location,
        invocationCount: record.invocationCount
      }));
      const boundedLimit = Math.max(0, Number(limit) || 0);
      return {
        registrations: output,
        candidates: collectCandidates(boundedLimit),
        state: runtimeState(boundedLimit),
        errors: [...errors],
        domCount: document.querySelectorAll('*').length
      };
    },
    exercise(limit) {
      preparePropertyTracking();
      const allowed = new Set(['click','change','input','focus','blur','keydown','keyup','touchstart','touchend']);
      let count = 0;
      const exercised = new Set();
      for (const record of records) {
        if (count >= limit || !allowed.has(record.event)) continue;
        if (!(record.target instanceof Element) || !record.target.isConnected) continue;
        if (record.target.matches('a[href], form, input[type="submit"], button[type="submit"], :disabled, [aria-disabled="true"], [hidden], [inert]')) continue;
        const key = selectorFor(record.target) + '\u0000' + record.event;
        if (exercised.has(key)) continue;
        exercised.add(key);
        let event;
        if (record.event === 'click') event = new MouseEvent('click', {bubbles: true, cancelable: true});
        else if (record.event.startsWith('key')) event = new KeyboardEvent(record.event, {bubbles: true, cancelable: true, key: 'Enter'});
        else event = new Event(record.event, {bubbles: true, cancelable: true});
        try { record.target.dispatchEvent(event); count += 1; }
        catch (error) { errors.push(String(error && error.message || error)); }
      }
      return count;
    }
  };
})();
"""
