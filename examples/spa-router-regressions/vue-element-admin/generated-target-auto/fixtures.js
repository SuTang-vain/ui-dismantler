// Fixture registration skeleton. Response bodies stay in reviewed test fixtures.
export const fixtureDependencies = [
  {
    "method": "GET",
    "hostname": "wpimg.wallstcn.com",
    "path": "/f778738c-e4f8-4870-b634-56703b4acafe.gif",
    "resourceType": "image",
    "responseContentType": "image/gif",
    "binary": true
  },
  {
    "method": "GET",
    "hostname": "wpimg.wallstcn.com",
    "path": "/e7d23d71-cf19-4b90-a1cc-f56af8c0903d.png",
    "resourceType": "image",
    "responseContentType": "image/png",
    "binary": true
  }
];

export function registerFixtures(register) {
  if (typeof register !== "function") throw new TypeError("registerFixtures requires a function");
  for (const fixture of fixtureDependencies) register(fixture);
  return fixtureDependencies.length;
}
