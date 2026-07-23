# Qinshihuang TypeScript dispatch experiment

A six-component TypeScript implementation generated from the component planning report. The example uses ES modules compiled into `lib/src/` and reuses the verified CSS/assets from the Gold+ baseline.

```html
<link rel="stylesheet" href="../src/qinshihuang.css">
<script type="module">
  import { mount } from "../src/index.js";
  mount(document.getElementById("mount"));
</script>
```
