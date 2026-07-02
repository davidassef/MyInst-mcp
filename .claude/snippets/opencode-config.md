{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/deepseek-v4-flash-free",
  "plugin": [
    [
      "file:///home/rhapp/.config/opencode/plugins/deploy-guard/index.js",
      {
        "stateDir": "/home/rhapp/.config/opencode/deploy-guard-state"
      }
    ],
    "oh-my-openagent"
  ],
  "agent": {
    "explore": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "librarian": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "oracle": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "general": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "metis": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "momus": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "plan": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "build": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "Sisyphus-Junior": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "multimodal-looker": {
      "model": "opencode-go/qwen3.6-plus",
      "variant": "max"
    },
    "vision-reader": {
      "model": "opencode-go/qwen3.6-plus",
      "variant": "max"
    },
    "code-simplifier": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "code-simplifier:code-simplifier": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "frontend-agent": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "backend-agent": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "reviewer-agent": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "agent-sdk-dev:agent-sdk-verifier-py": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "agent-sdk-dev:agent-sdk-verifier-ts": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "glm-plan-bug:case-feedback-agent": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    },
    "glm-plan-usage:usage-query-agent": {
      "model": "opencode/deepseek-v4-flash-free",
      "variant": "max"
    }
  },
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  },
  "watcher": {
    "ignore": [
      "node_modules/**",
      "dist/**",
      ".git/**",
      "*.log",
      ".next/**",
      "build/**",
      ".cache/**"
    ]
  },
  "skills": {
    "paths": [
      "/home/rhapp/Documentos/Replica ORA/.codex/skills",
      "/home/rhapp/Documentos/intra-connect-saas/.codex/skills",
      "/home/rhapp/Documentos/intrasign/.codex/skills",
      "/home/rhapp/.config/opencode/skills",
      "/home/rhapp/.codex/skills"
    ]
  },
  "instructions": [
    "/home/rhapp/.config/opencode/instructions/project-routing.md",
    "/home/rhapp/.config/opencode/instructions/replica-ora-routing.md",
    "/home/rhapp/.config/opencode/instructions/intra-connect-saas-53147030-routing.md",
    "/home/rhapp/.config/opencode/instructions/intrasign-routing.md"
  ],
  "mcp": {
    "Myinst": {
      "type": "local",
      "command": [
        "myinst-mcp"
      ],
      "enabled": true
    },
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true
    },
    "gh_grep": {
      "type": "remote",
      "url": "https://mcp.grep.app",
      "enabled": true
    }
  }
}
