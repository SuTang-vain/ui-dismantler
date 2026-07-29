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

test("SPA auth responsibility links imported storage wrapper login role dynamic routes and router guard without case identifiers", () => {
  const root = mkdtempSync(join(tmpdir(), "ui-dismantler-auth-guard-"));
  try {
    mkdirSync(join(root, "src", "views"), { recursive: true });
    mkdirSync(join(root, "src", "api"), { recursive: true });
    mkdirSync(join(root, "public"), { recursive: true });
    mkdirSync(join(root, "node_modules", "@generic", "vault", "es", "window", "storage"), { recursive: true });
    writeFileSync(join(root, "public", "runtime.json"), JSON.stringify({ title: "BlindApp", StorageConfig: { expire: 0 } }));
    writeFileSync(join(root, "node_modules", "@generic", "vault", "es", "window", "storage", "index.mjs"), `
      class Storage {
        setStorage(key, value, expire = 0, type = 'localStorage') { window[type].setItem(key, value) }
        getStorage(key, type = 'localStorage') { return window[type].getItem(key) }
        removeStorage(key, type = 'localStorage') { window[type].removeItem(key) }
      }
    `);
    writeFileSync(join(root, "src", "config.js"), `import { vault } from '@generic/vault'; const cfg={title:'BlindApp',StorageConfig:{}}; vault.setStorageConfig({...cfg.StorageConfig,prefix:cfg.title});`);
    writeFileSync(join(root, "src", "store.js"), `
      import { vault } from '@generic/vault';
      export const useVault = () => ({
        identity: vault.getStorage('identity_record'),
        scope: 'operator',
        acceptIdentity(value) { vault.setStorage('identity_record', value); this.identity=value; this.scope=value.scope },
        clearIdentity() { vault.removeStorage('identity_record'); this.identity=null }
      });
    `);
    writeFileSync(join(root, "src", "api", "identity.js"), `export const requestIdentity = (account, secret) => client.post({url:'/identity/session',data:{account,secret}});`);
    writeFileSync(join(root, "src", "routes.js"), `
      export async function hydratePaths(scope) { const rows=await requestPaths(scope); attachPaths(rows); updateMenus(rows); return rows }
      function attachPaths(rows) { rows.forEach(row => router.addRoute(row)) }
      function requestPaths(scope) { return Promise.resolve(scope ? [{path:'/workspace'}] : []) }
      function updateMenus(rows) { return rows }
    `);
    writeFileSync(join(root, "src", "router.js"), `
      import { useVault } from './store.js'; import { hydratePaths } from './routes.js';
      router.beforeEach((to,from,next)=>{const gate=useVault();if(gate.identity){if(to.path==='/signin'){next({path:from.path});return}if(from.name){next()}else{hydratePaths(gate.scope).then(rows=>{if(rows.length){router.push({path:to.path})}else{gate.clearIdentity();router.push('/signin')}})}}else{if(to.path!=='/signin')next({path:'/signin'});else next()}})
    `);
    writeFileSync(join(root, "src", "views", "signin.vue"), `
      <script setup>
      import { requestIdentity } from '../api/identity.js'; import { hydratePaths } from '../routes.js'; import { useVault } from '../store.js';
      const account={name:'',secret:''};
      const authenticate=async()=>{const reply=await requestIdentity(account.name,account.secret);if(reply.ok===true){useVault().acceptIdentity(reply.data);await hydratePaths(reply.data.scope);router.push('/')}};
      const submit=()=>authenticate();
      </script><template><button @click="submit">Sign in</button></template>
    `);
    const graph = analyzeSpaAuthResponsibilities(root);
    assert.equal(graph.schemaVersion, "1.1");
    assert.equal(graph.metrics.storageAdapters, 1);
    assert.equal(graph.metrics.resolvedStorageAdapters, 1);
    assert.equal(graph.metrics.dynamicRouteInitializers, 1);
    assert.equal(graph.metrics.completeDynamicRouteInitializers, 1);
    assert.equal(graph.metrics.guardRegistrations, 1);
    assert.equal(graph.metrics.completeRouteGuards, 1);
    assert.equal(graph.metrics.loginFlows, 1);
    assert.equal(graph.metrics.completeLoginFlows, 1);
    assert.deepEqual(graph.contracts.storageAdapters[0].keys.find((item) => item.logicalKey === "identity_record"), {
      logicalKey: "identity_record", effectiveKey: "BlindApp_identity_record", reads: 1, writes: 1, removes: 1, files: ["src/store.js"],
    });
    assert.equal(graph.contracts.storageAdapters[0].storage, "localStorage");
    assert.equal(graph.contracts.routeGuards[0].authenticatedStatePath, "gate.identity");
    assert.equal(graph.contracts.routeGuards[0].freshLoadRouteInitialization, "hydratePaths");
    assert.equal(graph.contracts.routeGuards[0].dynamicRouteMutation, "addRoute");
    assert.equal(graph.contracts.loginFlows[0].endpoint?.path, "/identity/session");
    assert.equal(graph.contracts.loginFlows[0].identityWrite?.storageKey, "identity_record");
    assert.equal(graph.contracts.loginFlows[0].rolePath, "reply.data.scope");
    assert.deepEqual(graph.contracts.loginFlows[0].triggerHandlers, ["authenticate", "submit"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
