export interface CssRule {
  selector: string;
  declarations: Record<string, string>;
}

export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function extractRootVariables(css: string): Record<string, string> {
  const variables: Record<string, string> = {};
  const clean = stripCssComments(css);
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!match[1].split(",").some((selector) => selector.trim() === ":root" || selector.trim() === "html")) continue;
    for (const item of match[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) variables[item[1]] = item[2].trim();
  }
  return variables;
}

export function parseCssRules(css: string): CssRule[] {
  const clean = stripCssComments(css);
  const rules: CssRule[] = [];
  const stack: Array<{ prelude: string; start: number }> = [];
  let chunkStart = 0;
  let quote = "";
  let escaped = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") {
      stack.push({ prelude: clean.slice(chunkStart, i).trim(), start: i + 1 });
      chunkStart = i + 1;
      continue;
    }
    if (char !== "}" || stack.length === 0) continue;
    const block = stack.pop()!;
    const body = clean.slice(block.start, i);
    if (block.prelude && !block.prelude.startsWith("@")) {
      const declarations: Record<string, string> = {};
      for (const declaration of body.split(";")) {
        const colon = declaration.indexOf(":");
        if (colon <= 0 || declaration.includes("{")) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim();
        if (property && value) declarations[property] = value;
      }
      rules.push({ selector: block.prelude, declarations });
    }
    chunkStart = i + 1;
  }
  return rules;
}

export function extractMediaQueries(css: string): Array<{ query: string; minWidth: number | null; maxWidth: number | null }> {
  const result: Array<{ query: string; minWidth: number | null; maxWidth: number | null }> = [];
  for (const match of stripCssComments(css).matchAll(/@media\s*([^\{]+)\{/gi)) {
    const query = match[1].trim();
    const min = query.match(/min-width\s*:\s*(\d+(?:\.\d+)?)px/i);
    const max = query.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/i);
    result.push({
      query,
      minWidth: min ? Number(min[1]) : null,
      maxWidth: max ? Number(max[1]) : null,
    });
  }
  return result;
}

export function extractGradients(css: string): Array<{ type: string; value: string }> {
  const seen = new Set<string>();
  const values: Array<{ type: string; value: string }> = [];
  for (const match of css.matchAll(/((?:linear|radial|conic)-gradient\([^;{}]+\))/gi)) {
    const value = match[1].trim();
    if (seen.has(value)) continue;
    seen.add(value);
    values.push({ type: value.slice(0, value.indexOf("-gradient")), value });
  }
  return values;
}

export function inferVariableRoles(css: string, variableName: string): string[] {
  const roles = new Set<string>();
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`([\\w-]+)\\s*:[^;{}]*var\\(\\s*${escaped}(?:\\s*,[^)]*)?\\)`, "gi");
  for (const match of css.matchAll(pattern)) {
    const property = match[1].toLowerCase();
    if (property.includes("background")) roles.add("background");
    else if (property.includes("border") || property.includes("outline")) roles.add("border");
    else if (property === "color") roles.add("text");
    else if (property.includes("shadow")) roles.add("shadow");
    else if (property === "fill" || property === "stroke") roles.add("icon-fill");
  }
  return [...roles].sort();
}

export function normalizeTokenName(variableName: string): string {
  return variableName.replace(/^--/, "").replace(/_/g, "-").toLowerCase();
}
