import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { tool } from "@opencode-ai/plugin/tool";

const CONFIG_NAME = ".codex/deploy-guard.json";
const DEFAULT_TTL_MINUTES = 120;
const DEFAULT_STATE_DIR = path.join(process.env.HOME || ".", ".config", "opencode", "deploy-guard-state");
const MUTATING_COMMAND_PATTERNS = [
  /\bgit\s+push\b/i,
  /\bgit\s+pull\b/i,
  /\bdocker\s+compose\s+(up|restart|down|stop|start|rm|pull|build)\b/i,
  /\bdocker\s+(restart|stop|start|rm|kill|compose)\b/i,
  /\b(systemctl|service)\s+(restart|start|stop)\b/i,
  /\bpm2\s+(restart|start|stop|delete)\b/i,
  /\bvercel\b.*\b(--prod|deploy)\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\brsync\b/i,
  /\bkubectl\s+(apply|rollout|delete|set|scale|patch)\b/i,
  /\bhelm\s+(upgrade|install|rollback|uninstall)\b/i,
  /(^|\s)(make\s+deploy|deploy\.sh|deploy_|rollback)(\s|$)/i,
];

function slug(input) {
  return String(input)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "workspace";
}

function hashProject(projectRoot) {
  return crypto.createHash("sha1").update(projectRoot).digest("hex").slice(0, 12);
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findProjectRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (await exists(path.join(current, CONFIG_NAME))) {
      return current;
    }
    if (await exists(path.join(current, "AGENTS.md")) || await exists(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

async function loadGuardConfig(projectRoot) {
  const configPath = path.join(projectRoot, CONFIG_NAME);
  if (!(await exists(configPath))) {
    return null;
  }
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    configPath,
    projectRoot,
  };
}

function collectStrings(value, acc = []) {
  if (typeof value === "string") {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, acc);
  }
  return acc;
}

function joinRelevantArgs(args) {
  return collectStrings(args).join(" \n");
}

function isSensitiveCommand(commandText, config) {
  const patterns = [
    ...MUTATING_COMMAND_PATTERNS,
    ...((config?.additionalSensitivePatterns || []).map((pattern) => new RegExp(pattern, "i"))),
  ];
  return patterns.some((pattern) => pattern.test(commandText));
}

function resolveExpected(config, environment, surface) {
  const envConfig = config?.environments?.[environment];
  if (!envConfig) {
    throw new Error(`Ambiente '${environment}' não está configurado em ${config.configPath}.`);
  }
  const surfaceConfig = envConfig?.[surface];
  if (!surfaceConfig) {
    throw new Error(`Superfície '${surface}' não está configurada para '${environment}' em ${config.configPath}.`);
  }
  return {
    branch: envConfig.branch,
    requiredSkill: config.requiredSkill,
    requiredDocs: config.requiredDocs || [],
    ...surfaceConfig,
  };
}

function normalizeValue(value) {
  return String(value || "").trim();
}

function assertExact(label, actual, expected) {
  if (normalizeValue(actual) !== normalizeValue(expected)) {
    throw new Error(`${label} inválido. Esperado '${expected}' e recebido '${actual || ""}'.`);
  }
}

async function ensureStateDir(stateDir) {
  await fs.mkdir(stateDir, { recursive: true });
}

function stateFilePath(stateDir, sessionID, projectRoot) {
  return path.join(stateDir, `${sessionID}-${slug(path.basename(projectRoot))}-${hashProject(projectRoot)}.json`);
}

async function readUnlockState(stateDir, sessionID, projectRoot) {
  const target = stateFilePath(stateDir, sessionID, projectRoot);
  if (!(await exists(target))) {
    return null;
  }
  const raw = await fs.readFile(target, "utf8");
  return JSON.parse(raw);
}

async function writeUnlockState(stateDir, sessionID, projectRoot, payload) {
  await ensureStateDir(stateDir);
  const target = stateFilePath(stateDir, sessionID, projectRoot);
  await fs.writeFile(target, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return target;
}

function isUnlockFresh(state, ttlMinutes) {
  if (!state?.unlockedAt) return false;
  const unlockedAt = Date.parse(state.unlockedAt);
  if (Number.isNaN(unlockedAt)) return false;
  return Date.now() - unlockedAt <= ttlMinutes * 60 * 1000;
}

function buildBlockMessage(config) {
  const docs = [config.requiredSkill, ...(config.requiredDocs || [])]
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
  return [
    "Deploy bloqueado pelo guard rail do OpenCode.",
    `Leia primeiro a skill e os documentos obrigatórios deste workspace:`,
    docs || "- .codex/skills/deploy do projeto",
    "",
    "Depois disso, use a tool `deploy_guard_unlock` informando exatamente:",
    "- environment",
    "- surface",
    "- branch",
    "- deployMethod",
    "- publicHost",
    "- checkout (quando backend exigir)",
    "- requiredSkill",
    "",
    `Fonte local de política: ${config.configPath}`,
  ].join("\n");
}

export const server = async (input, options = {}) => {
  const projectRoot = await findProjectRoot(input.worktree || input.directory);
  const stateDir = options.stateDir || DEFAULT_STATE_DIR;

  return {
    tool: {
      deploy_guard_unlock: tool({
        description:
          "Libera temporariamente comandos sensíveis de deploy na sessão atual, validando as respostas contra a política local do projeto.",
        args: {
          environment: tool.schema.string().describe("Ambiente exato, por exemplo homologacao ou producao"),
          surface: tool.schema.string().describe("Superfície do deploy, por exemplo backend ou frontend"),
          branch: tool.schema.string().describe("Branch permitida para o deploy"),
          deployMethod: tool.schema.string().describe("Método oficial de deploy definido pelo projeto"),
          publicHost: tool.schema.string().describe("Host público usado na validação final"),
          checkout: tool.schema.string().optional().describe("Checkout ou diretório do servidor, quando aplicável"),
          requiredSkill: tool.schema.string().describe("Caminho exato da skill obrigatória de deploy do projeto"),
        },
        async execute(args, ctx) {
          const config = await loadGuardConfig(projectRoot);
          if (!config) {
            throw new Error(
              `Não existe ${CONFIG_NAME} em ${projectRoot}. Crie a política local de deploy antes de tentar liberar deploy neste projeto.`,
            );
          }

          const environment = normalizeValue(args.environment);
          const surface = normalizeValue(args.surface);
          const expected = resolveExpected(config, environment, surface);

          assertExact("Branch", args.branch, expected.branch);
          assertExact("Método de deploy", args.deployMethod, expected.deployMethod);
          assertExact("Host público", args.publicHost, expected.publicHost);
          assertExact("Skill obrigatória", args.requiredSkill, expected.requiredSkill);

          if (expected.checkout) {
            assertExact("Checkout", args.checkout, expected.checkout);
          }

          const now = new Date().toISOString();
          const state = {
            sessionID: ctx.sessionID,
            projectRoot,
            environment,
            surface,
            branch: expected.branch,
            deployMethod: expected.deployMethod,
            publicHost: expected.publicHost,
            checkout: expected.checkout || null,
            requiredSkill: expected.requiredSkill,
            configPath: config.configPath,
            unlockedAt: now,
          };
          const target = await writeUnlockState(stateDir, ctx.sessionID, projectRoot, state);
          return [
            "Deploy liberado para esta sessão.",
            `Sessão: ${ctx.sessionID}`,
            `Projeto: ${projectRoot}`,
            `Ambiente: ${environment}`,
            `Superfície: ${surface}`,
            `Estado salvo em: ${target}`,
          ].join("\n");
        },
      }),
      deploy_guard_status: tool({
        description: "Mostra o estado atual do deploy guard para a sessão e o projeto corrente.",
        args: {},
        async execute(_args, ctx) {
          const config = await loadGuardConfig(projectRoot);
          const state = await readUnlockState(stateDir, ctx.sessionID, projectRoot);
          if (!config) {
            return `Sem política local de deploy em ${projectRoot}. Esperado: ${path.join(projectRoot, CONFIG_NAME)}`;
          }
          if (!state) {
            return `Deploy guard ativo e bloqueando comandos sensíveis. Política: ${config.configPath}`;
          }
          return JSON.stringify(
            {
              configPath: config.configPath,
              state,
            },
            null,
            2,
          );
        },
      }),
    },
    "tool.execute.before": async (hookInput, output) => {
      const toolName = hookInput.tool || "";
      const args = output.args || {};
      if (!/bash|shell/i.test(toolName)) {
        return;
      }

      const config = await loadGuardConfig(projectRoot);
      if (!config) {
        const commandText = joinRelevantArgs(args);
        if (isSensitiveCommand(commandText, null)) {
          throw new Error(
            `Deploy bloqueado: falta ${CONFIG_NAME} no projeto ${projectRoot}. Documente a política local antes de executar comandos sensíveis.`,
          );
        }
        return;
      }

      const commandText = joinRelevantArgs(args);
      if (!isSensitiveCommand(commandText, config)) {
        return;
      }

      const ttlMinutes = Number(config.unlockTtlMinutes || DEFAULT_TTL_MINUTES);
      const state = await readUnlockState(stateDir, hookInput.sessionID, projectRoot);
      if (!isUnlockFresh(state, ttlMinutes)) {
        throw new Error(buildBlockMessage(config));
      }
    },
  };
};

export default {
  id: "deploy-guard",
  server,
};
