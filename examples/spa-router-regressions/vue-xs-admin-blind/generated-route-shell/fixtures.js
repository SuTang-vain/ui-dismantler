// Fixture registration skeleton. Response bodies stay in reviewed test fixtures.
export const fixtureDependencies = [
  {
    "method": "POST",
    "path": "/mock_api/getRoute",
    "binary": false
  }
];

export function registerFixtures(register) {
  if (typeof register !== "function") throw new TypeError("registerFixtures requires a function");
  for (const fixture of fixtureDependencies) register(fixture);
  return fixtureDependencies.length;
}
