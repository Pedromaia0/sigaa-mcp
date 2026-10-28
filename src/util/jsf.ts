/**
 * Helpers for the JSF (JavaServer Faces) markup SIGAA renders.
 *
 * SIGAA navigation is POST-driven: "links" are actually JSF command links that
 * submit a form carrying the component id plus a `javax.faces.ViewState` token.
 * These helpers extract that state so later code can replay such POSTs (for
 * pagination now, and for writes later). See docs/SITE.md.
 */

import type { HTMLElement } from "node-html-parser";

/**
 * The `javax.faces.ViewState` value for a form. JSF requires the current
 * value to be echoed back on every POST or the server rejects it (ViewExpired).
 */
export function extractViewState(root: HTMLElement): string | null {
  const input = root.querySelector('input[name="javax.faces.ViewState"]');
  return input?.getAttribute("value") ?? null;
}

/**
 * A JSF command link's postback: the owning form id, the component id, and any
 * extra parameters. This mirrors what the inline `jsfcljs(...)` handler posts.
 */
export interface JsfPostback {
  formId: string;
  params: Record<string, string>;
}

/**
 * Parse the `onclick="...jsfcljs(document.getElementById('form'),{...},'')"`
 * handler SIGAA attaches to command links into the form id + the params it posts.
 * Returns null if the handler isn't a recognizable jsfcljs call.
 */
export function parseJsfLink(onclick: string | undefined): JsfPostback | null {
  if (!onclick) return null;

  const formMatch = onclick.match(/getElementById\('([^']+)'\)/);
  if (!formMatch?.[1]) return null;

  // The params object is the `{...}` between the form lookup and the trailing args.
  const objMatch = onclick.match(/\},\s*\{([^}]*)\}/);
  const params: Record<string, string> = {};
  if (objMatch?.[1]) {
    for (const pair of objMatch[1].matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)) {
      if (pair[1] !== undefined) params[pair[1]] = pair[2] ?? "";
    }
  }

  return { formId: formMatch[1], params };
}

/** Collapse whitespace and trim; `node-html-parser` already decodes entities. */
export function cleanText(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}
