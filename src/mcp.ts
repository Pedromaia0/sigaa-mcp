#!/usr/bin/env node
/**
 * MCP (Model Context Protocol) server for SIGAA.
 *
 * Exposes the read-only SIGAA web client as MCP tools over stdio, so any
 * MCP-capable harness (Claude Code, Claude Desktop, Codex, Cursor, …) can
 * connect to it. Credentials come from the environment and the server logs in
 * once on first use, reusing the session.
 *
 *   SIGAA_USERNAME, SIGAA_PASSWORD   (required)
 *   SIGAA_BASE_URL, SIGAA_AUTH_BASE_URL   (optional overrides)
 *   SIGAA_DOWNLOAD_DIR   (optional; where download_file saves, default: temp)
 *
 * Run: node dist/mcp.js   (or `npx sigaa-mcp`)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { SigaaSession } from "./auth/session.ts";
import {
  fetchPortal,
  fetchAllClasses,
  fetchTurmaFull,
  downloadTurmaFile,
} from "./portal/portal.ts";

// --- lazy, auto-login session (one per server process) --------------------

let sessionPromise: Promise<SigaaSession> | null = null;

function getSession(): Promise<SigaaSession> {
  if (sessionPromise) return sessionPromise;

  const username = process.env.SIGAA_USERNAME;
  const password = process.env.SIGAA_PASSWORD;
  if (!username || !password) {
    return Promise.reject(
      new Error("SIGAA_USERNAME and SIGAA_PASSWORD must be set in the server environment"),
    );
  }

  sessionPromise = (async () => {
    const session = new SigaaSession({
      baseUrl: process.env.SIGAA_BASE_URL,
      authBaseUrl: process.env.SIGAA_AUTH_BASE_URL,
    });
    await session.login(username, password);
    return session;
  })();

  // Let a failed login be retried on the next call.
  sessionPromise.catch(() => {
    sessionPromise = null;
  });
  return sessionPromise;
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// --- server ----------------------------------------------------------------

const server = new McpServer({ name: "sigaa-mcp", version: "0.0.1" });

server.registerTool(
  "get_portal",
  {
    title: "Portal do discente",
    description:
      "Student info plus enrolled classes (with decoded schedules), the per-class " +
      "updates feed, upcoming activities (tasks/exams), institutional news, and " +
      "course-forum topics. Each enrolled class has a `frontEndIdTurma` used by the " +
      "other tools.",
    inputSchema: {},
  },
  async () => {
    try {
      return json(await fetchPortal(await getSession()));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "get_all_classes",
  {
    title: "Histórico de turmas",
    description: "All enrolled classes, current and past, grouped by period (Ver turmas anteriores).",
    inputSchema: {},
  },
  async () => {
    try {
      return json(await fetchAllClasses(await getSession()));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "get_turma",
  {
    title: "Turma completa",
    description:
      "Everything readable in a turma's virtual classroom: lesson topics (with " +
      "materials), participants, the student's grades, attendance, tasks, assessments, " +
      "class news, forums, references, file list, questionnaires/polls and the course " +
      "plan. Pass the `frontEndIdTurma` from get_portal.",
    inputSchema: {
      frontEndIdTurma: z.string().describe("The turma handle from get_portal's enrolledClasses[].frontEndIdTurma"),
    },
  },
  async ({ frontEndIdTurma }) => {
    try {
      return json(await fetchTurmaFull(await getSession(), frontEndIdTurma));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "download_file",
  {
    title: "Baixar arquivo da turma",
    description:
      "Download a file published in a turma (a lesson-topic material or an Arquivos " +
      "entry) by its fileId. Saves it locally and returns the path, filename, content " +
      "type and size. fileIds come from get_turma (topics[].materials[].fileId or " +
      "files[].fileId).",
    inputSchema: {
      frontEndIdTurma: z.string().describe("The turma handle from get_portal"),
      fileId: z.string().describe("The file id from get_turma"),
    },
  },
  async ({ frontEndIdTurma, fileId }) => {
    try {
      const file = await downloadTurmaFile(await getSession(), frontEndIdTurma, fileId);
      const dir = process.env.SIGAA_DOWNLOAD_DIR || join(tmpdir(), "sigaa-downloads");
      mkdirSync(dir, { recursive: true });
      const path = join(dir, file.filename);
      writeFileSync(path, file.bytes);
      return json({
        path,
        filename: file.filename,
        contentType: file.contentType,
        bytes: file.bytes.length,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
