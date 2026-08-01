import { parse } from "acorn";

export interface ParsedJavaScriptProgram {
  readonly program: any;
  readonly source: string;
  readonly mode: "javascript" | "typescript-erasure";
}

function preserveLines(value: string): string {
  return value.replace(/[^\n]/g, " ");
}

function eraseGenericCallTypeArguments(source: string): string {
  const chars = [...source];
  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index] !== "<" || index === 0 || !/[\w$)\]]/.test(chars[index - 1] ?? "")) continue;
    let depth = 0, quote = "", escaped = false, end = -1;
    for (let cursor = index; cursor < chars.length; cursor += 1) {
      const char = chars[cursor];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
      if (char === "<") depth += 1;
      else if (char === ">") {
        depth -= 1;
        if (depth === 0) { end = cursor; break; }
      }
    }
    if (end < 0) continue;
    let next = end + 1;
    while (/\s/.test(chars[next] ?? "")) next += 1;
    if (chars[next] !== "(") continue;
    for (let cursor = index; cursor <= end; cursor += 1) if (chars[cursor] !== "\n") chars[cursor] = " ";
    index = end;
  }
  return chars.join("");
}

export function eraseTypeScriptSyntax(source: string): string {
  return eraseGenericCallTypeArguments(source)
    .replace(/\bimport\s+type\s+[^;\n]+;?/g, preserveLines)
    .replace(/(\b(?:let|var)\s+[A-Za-z_$][\w$]*)\s*:\s*([^{};=\n]+)(?=\s*(?:;|\n|$))/g, (value, prefix: string) => `${prefix}${preserveLines(value.slice(prefix.length))}`)
    .replace(/([,{]\s*)type\s+[A-Za-z_$][\w$]*(\s*,?)/g, (value, prefix: string) => `${prefix}${preserveLines(value.slice(prefix.length))}`)
    .replace(/\bexport\s+type\s+[^;]+;/g, preserveLines)
    .replace(/\b(?:export\s+)?interface\s+[A-Za-z_$][\w$]*(?:\s+extends\s+[^\{]+)?\s*\{[^}]*\}/gs, preserveLines)
    .replace(/\btype\s+[A-Za-z_$][\w$]*(?:\s*<[^;={}]+>)?\s*=\s*[^;]+;/g, preserveLines)
    .replace(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*<[^;(){}]*>\s*(?=\()/g, "$1")
    .replace(/\s+as\s+(?:const|[A-Za-z_$][\w$]*(?:\s*<[^;=(){}]+>)?(?:\[\])?(?:\s*\|\s*(?:null|undefined|[A-Za-z_$][\w$]*))*)/g, (value) => preserveLines(value))
    .replace(/([A-Za-z_$][\w$]*)\s*\??:\s*\{[A-Za-z0-9_$?:,\s\[\]|]*(?:\{[A-Za-z0-9_$?:,\s\[\]|]*\}[A-Za-z0-9_$?:,\s\[\]|]*)*\}(?=\s*[,)=])/g, (value, prefix: string) => `${prefix}${preserveLines(value.slice(prefix.length))}`)
    .replace(/([A-Za-z_$][\w$]*|\))\s*\??:\s*(?:[A-Za-z_$][\w$]*(?:\s*<[^;=(){}]+>)?(?:\[\])?(?:\s*\|\s*(?:null|undefined|[A-Za-z_$][\w$]*))*)(?=\s*(?:=(?!>)|=>|[,;){}]))/g, (value, prefix: string) => `${prefix}${preserveLines(value.slice(prefix.length))}`)
    .replace(/([A-Za-z_$][\w$]*)\s*\??:\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*(?:\[\])?(?=\s*=)/g, (value, prefix: string) => `${prefix}${preserveLines(value.slice(prefix.length))}`)
    .replace(/(\))\s*:\s*(?:[A-Za-z_$][\w$]*(?:\s*<[^;=(){}]+>)?(?:\[\])?(?:\s*\|\s*(?:null|undefined|[A-Za-z_$][\w$]*))*)\s*(?=\{)/g, (value, prefix: string) => `${prefix}${preserveLines(value.slice(prefix.length))}`)
    .replace(/\s+satisfies\s+[A-Za-z_$][\w$]*(?:\s*<[^;=(){}]+>)?/g, preserveLines);
}

export function parseJavaScriptOrTypeScriptErased(source: string): ParsedJavaScriptProgram {
  try {
    return {
      program: parse(source, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true }) as any,
      source,
      mode: "javascript",
    };
  } catch (javascriptError) {
    const erased = eraseTypeScriptSyntax(source);
    try {
      return {
        program: parse(erased, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true }) as any,
        source: erased,
        mode: "typescript-erasure",
      };
    } catch (erasedError) {
      throw new SyntaxError(`TypeScript erasure parse failed after Acorn parse error: ${javascriptError instanceof Error ? javascriptError.message : String(javascriptError)}; ${erasedError instanceof Error ? erasedError.message : String(erasedError)}`);
    }
  }
}
