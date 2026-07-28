import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeSpaAuthResponsibilities } from "../planning/spa-auth-responsibility.js";

test("SPA auth responsibility links query storage bearer header and reviewed 401 redirect without identifier whitelists", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-auth-"));
  try {
    mkdirSync(join(root, "src", "api"), { recursive: true });
    writeFileSync(join(root, "src", "api", "client.js"), `
      const incoming = new URLSearchParams(window.location.search).get('access_key');
      if (incoming) sessionStorage.setItem('reviewed_credential', incoming);
      client.interceptors.request.use((config) => {
        const credential = sessionStorage.getItem('reviewed_credential');
        if (credential) config.headers.Authorization = \`Bearer \${credential}\`;
        return config;
      });
      client.interceptors.response.use((response) => response, (error) => {
        if (error.response?.status === 401) {
          const nextLocation = error.response.data?.redirectLocation;
          if (nextLocation) window.location.href = nextLocation;
        }
        return Promise.reject(error);
      });
    `);
    const graph = analyzeSpaAuthResponsibilities(root);
    assert.equal(graph.metrics.filesScanned, 1);
    assert.equal(graph.metrics.completeQueryStorageAuthorizationChains, 1);
    assert.deepEqual(graph.contracts.queryToStorage, [{ queryKey: "access_key", storage: "sessionStorage", storageKey: "reviewed_credential", files: ["src/api/client.js"] }]);
    assert.deepEqual(graph.contracts.storageToAuthorization, [{ storage: "sessionStorage", storageKey: "reviewed_credential", header: "Authorization", files: ["src/api/client.js"] }]);
    assert.equal(graph.contracts.unauthorizedRedirect[0].status, 401);
    assert.equal(graph.contracts.unauthorizedRedirect[0].redirectProperty, "redirectLocation");
    assert.equal(graph.contracts.freshAuthenticationRequired, true);
    assert.equal(graph.contracts.crossRunPersistenceAllowed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
