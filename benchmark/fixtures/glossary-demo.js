/*
 * Benchmark-only reviewed fixture for the Technical Glossary Explorer.
 *
 * This file is intentionally outside benchmark/lib/src. It is test/demo input,
 * not part of the reusable component package.
 */
(function (global) {
  'use strict';
  global.GlossaryDemoFixture = {
    ariaLabel: 'Technical Glossary Explorer',
    tablistLabel: 'Glossary sections',
    tabs: [
      { id: 'quiz', label: 'Quiz' },
      { id: 'comparison', label: 'Compare' },
      { id: 'graph', label: 'Graph' },
      { id: 'nav', label: 'Topics' },
      { id: 'cause', label: 'Causal' }
    ],
    splash: {
      eyebrow: 'Glossary Explorer',
      title: 'Master Technical Concepts',
      sub: 'Interactive quizzes, comparisons, and relationship maps',
      question: 'Which area interests you most?',
      options: [
        { value: 0, label: 'Frontend Patterns' },
        { value: 1, label: 'Data Structures' },
        { value: 2, label: 'Algorithms' }
      ],
      cta: 'Start Exploring',
      hint: 'Choose a topic or just start exploring'
    },
    quiz: {
      title: 'Concept Quiz',
      sub: 'Test your understanding of frontend patterns',
      nextLabel: 'Next Question',
      resultMessage: 'You completed the quiz!',
      correctPrefix: 'Correct! ',
      wrongPrefix: 'Not quite. The answer is: ',
      questionPrefix: 'Question ',
      questionSeparator: ' of ',
      scoreSeparator: ' / ',
      questions: [
        { q: 'What does CSS specificity determine?',
          opts: ['Which property value wins when multiple rules apply', 'The rendering order of CSS files', 'Whether a selector is valid', 'The performance cost of a rule'],
          correct: 0 },
        { q: 'Which CSS property creates a stacking context?',
          opts: ['z-index (always)', 'position + z-index', 'opacity < 1', 'Both B and C'],
          correct: 3 },
        { q: "What does 'cascade' mean in CSS?",
          opts: ['Styles flow top-down', 'Multiple rules can apply to one element', 'CSS files must be ordered', 'Inheritance is automatic'],
          correct: 1 }
      ]
    },
    comparison: {
      title: 'Pattern Comparison',
      sub: 'Compare real-world vs alternative approaches',
      toggleLabel: 'Switch perspective',
      cards: [
        { variant: 'real', tag: 'Real', title: 'CSS Custom Properties',
          desc: 'Runtime-evaluated variables defined in :root. Inherited, overridable, and JavaScript-accessible.' },
        { variant: 'alt', tag: 'Alternative', title: 'Sass Variables',
          desc: 'Compile-time substitution. No runtime overhead but cannot be changed dynamically or accessed via JS.' }
      ]
    },
    graph: {
      title: 'Concept Relationship Map',
      sub: 'Click a node to learn more',
      info: 'Click a node to see details',
      viewBox: '0 0 600 300',
      edgeColor: '#e5e7eb',
      edgeWidth: 2,
      nodes: [
        { id: 'css', label: 'CSS', x: 300, y: 150, r: 40, fill: '#4f46e5', center: true, desc: 'The core styling language of the web' },
        { id: 'specificity', label: 'Specificity', x: 150, y: 60, r: 32, fill: '#fff', desc: 'Determines which rule wins when multiple apply' },
        { id: 'variables', label: 'Variables', x: 450, y: 60, r: 32, fill: '#fff', desc: 'Custom properties evaluated at runtime' },
        { id: 'flexbox', label: 'Flexbox', x: 120, y: 240, r: 32, fill: '#fff', desc: 'One-dimensional layout model' },
        { id: 'grid', label: 'Grid', x: 480, y: 240, r: 32, fill: '#fff', desc: 'Two-dimensional layout system' }
      ],
      edges: [
        { x1: 300, y1: 150, x2: 150, y2: 60 },
        { x1: 300, y1: 150, x2: 450, y2: 60 },
        { x1: 300, y1: 150, x2: 120, y2: 240 },
        { x1: 300, y1: 150, x2: 480, y2: 240 }
      ]
    },
    nav: {
      title: 'Topic Navigator',
      sub: 'Browse related concepts',
      items: [
        { id: 'p1', label: 'Layout', heading: 'Layout Systems', desc: 'Flexbox for 1D, Grid for 2D, both designed for responsive design from the ground up.' },
        { id: 'p2', label: 'Colors', heading: 'Color Models', desc: 'Hex, RGB, HSL, LCH. Modern CSS also supports color-mix() and relative color syntax.' },
        { id: 'p3', label: 'Typography', heading: 'Type Systems', desc: 'Variable fonts, font-display, clamp() for fluid typography, and logical properties.' }
      ]
    },
    causeChain: {
      title: 'Causal Chain: CSS Evolution',
      sub: 'How CSS problems led to new features',
      whatifQuestion: 'What if floats never existed?',
      whatifResult: 'Without floats, early web would have relied entirely on tables and positioning, delaying CSS-based layouts by years.',
      events: [
        { title: 'Float Era', desc: 'Before flexbox, layouts used floats and clearfix hacks, causing fragile code.' },
        { title: 'Flexbox', desc: 'Solved 1D layout problems: alignment, distribution, reordering.' },
        { title: 'Grid', desc: 'Brought native 2D layout to CSS, replacing frameworks for many use cases.' },
        { title: 'Container Queries', desc: 'Components can respond to their container size, not just viewport.' }
      ]
    },
    theme: {},
    state: { status: 'ready', message: '' }
  };
})(window);
