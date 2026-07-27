// Fixture registration skeleton. Response bodies stay in reviewed test fixtures.
export const fixtureDependencies = [
  {
    "method": "GET",
    "path": "/api/personal_fm",
    "binary": false
  },
  {
    "method": "GET",
    "path": "/api/top/playlist",
    "binary": false
  },
  {
    "method": "GET",
    "path": "/api/search",
    "binary": false
  },
  {
    "method": "GET",
    "path": "/31049/1618983297-powered-by-vercel.svg",
    "responseContentType": "image/svg+xml",
    "binary": false
  }
];

export function registerFixtures(register) {
  if (typeof register !== "function") throw new TypeError("registerFixtures requires a function");
  for (const fixture of fixtureDependencies) register(fixture);
  return fixtureDependencies.length;
}
