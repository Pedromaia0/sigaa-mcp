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

  // jsfcljs(document.getElementById('form'),{ ...params... },''): the params
  // object is the `{...}` right after the form lookup.
  const objMatch = onclick.match(/getElementById\('[^']+'\)\s*,\s*\{([^}]*)\}/);
  const params: Record<string, string> = {};
  if (objMatch?.[1]) {
    for (const pair of objMatch[1].matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)) {
      if (pair[1] !== undefined) params[pair[1]] = pair[2] ?? "";
    }
  }

  return { formId: formMatch[1], params };
}

/**
 * Build the `application/x-www-form-urlencoded` body for submitting a JSF form.
 *
 * Gathers every successful control inside the form (hidden inputs, selects,
 * checked radios/checkboxes, text inputs with a value) — crucially including
 * `javax.faces.ViewState` — then layers the clicked command link's params on
 * top. This reproduces what the browser's `jsfcljs(...)` serializer posts.
 */
export function buildFormBody(
  root: HTMLElement,
  formId: string,
  extraParams: Record<string, string> = {},
): URLSearchParams {
  const body = new URLSearchParams();
  const form = root.querySelector(`#${cssEscape(formId)}`);

  if (form) {
    for (const input of form.querySelectorAll("input")) {
      const name = input.getAttribute("name");
      if (!name) continue;
      const type = (input.getAttribute("type") ?? "text").toLowerCase();
      if (type === "submit" || type === "button" || type === "image") continue;
      if ((type === "checkbox" || type === "radio") && input.getAttribute("checked") === null) {
        continue;
      }
      body.set(name, input.getAttribute("value") ?? "");
    }
    for (const select of form.querySelectorAll("select")) {
      const name = select.getAttribute("name");
      if (!name) continue;
      const selected =
        select.querySelector("option[selected]") ?? select.querySelector("option");
      body.set(name, selected?.getAttribute("value") ?? cleanText(selected?.text));
    }
  }

  for (const [k, v] of Object.entries(extraParams)) body.set(k, v);
  return body;
}

/** Escape a raw JSF id (which contains ':') for use in a CSS id selector. */
export function cssEscape(id: string): string {
  return id.replace(/([:.\[\]])/g, "\\$1");
}

/** Collapse whitespace and trim; `node-html-parser` already decodes entities. */
export function cleanText(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}
