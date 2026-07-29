import { createRouter } from "/generated-route-shell/router.js";

const app = document.querySelector("#app");
const router = createRouter({
  onRoute(path, route) {
    document.documentElement.dataset.route = route?.route ?? "unresolved";
    app.dataset.route = path;
  },
});
window.addEventListener("pagehide", () => router.dispose(), { once: true });
