import * as fs from "fs";

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

interface ValidResult {
  valid: true;
  serverCount: number;
}

interface InvalidResult {
  valid: false;
  error: string;
}

type ValidationResult = ValidResult | InvalidResult;

/**
 * Validates an MCP config object or JSON file.
 * Accepts either a file path (string) or an in-memory config object.
 */
export function validateMcpConfig(
  configPath: string | object
): ValidationResult {
  let config: unknown;

  if (typeof configPath === "string") {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      config = JSON.parse(raw);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Failed to read config file: ${message}` };
    }
  } else {
    config = configPath;
  }

  // Must be a non-null object
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { valid: false, error: "Config must be a non-null object" };
  }

  const cfg = config as Record<string, unknown>;

  // Must have mcpServers key
  if (!("mcpServers" in cfg)) {
    return { valid: false, error: 'Config is missing required "mcpServers" key' };
  }

  const mcpServers = cfg["mcpServers"];

  if (
    typeof mcpServers !== "object" ||
    mcpServers === null ||
    Array.isArray(mcpServers)
  ) {
    return {
      valid: false,
      error: '"mcpServers" must be a non-null object (map of server configs)',
    };
  }

  const servers = mcpServers as Record<string, unknown>;

  // Validate each server entry
  for (const [name, serverConfig] of Object.entries(servers)) {
    if (
      typeof serverConfig !== "object" ||
      serverConfig === null ||
      Array.isArray(serverConfig)
    ) {
      return {
        valid: false,
        error: `Server "${name}" config must be a non-null object`,
      };
    }

    const sc = serverConfig as Record<string, unknown>;

    // command is required and must be a string
    if (!("command" in sc)) {
      return {
        valid: false,
        error: `Server "${name}" is missing required "command" field`,
      };
    }
    if (typeof sc["command"] !== "string") {
      return {
        valid: false,
        error: `Server "${name}" "command" must be a string`,
      };
    }

    // args is required and must be an array of strings
    if (!("args" in sc)) {
      return {
        valid: false,
        error: `Server "${name}" is missing required "args" field`,
      };
    }
    if (!Array.isArray(sc["args"])) {
      return {
        valid: false,
        error: `Server "${name}" "args" must be an array`,
      };
    }
    for (const arg of sc["args"] as unknown[]) {
      if (typeof arg !== "string") {
        return {
          valid: false,
          error: `Server "${name}" "args" must be an array of strings`,
        };
      }
    }

    // env is optional — if present, must be a Record<string, string>
    if ("env" in sc) {
      const env = sc["env"];
      if (typeof env !== "object" || env === null || Array.isArray(env)) {
        return {
          valid: false,
          error: `Server "${name}" "env" must be a non-null object if provided`,
        };
      }
      for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
        if (typeof v !== "string") {
          return {
            valid: false,
            error: `Server "${name}" env["${k}"] must be a string`,
          };
        }
      }
    }
  }

  return { valid: true, serverCount: Object.keys(servers).length };
}

// ---------------------------------------------------------------------------
// Parameterised test suite
// ---------------------------------------------------------------------------

describe("validateMcpConfig", () => {
  test("validates grasp-mcp-server config", () => {
    const config = {
      mcpServers: {
        grasp: {
          command: "npx",
          args: ["-y", "grasp-mcp-server"],
        },
      },
    };
    const result = validateMcpConfig(config);
    expect(result).toEqual({ valid: true, serverCount: 1 });
  });

  test("rejects config missing mcpServers", () => {
    const config = {};
    const result = validateMcpConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
  });

  test("rejects server missing command", () => {
    const config = {
      mcpServers: {
        grasp: {
          args: [],
        },
      },
    };
    const result = validateMcpConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("command");
    }
  });

  test("accepts optional env field", () => {
    const config = {
      mcpServers: {
        grasp: {
          command: "npx",
          args: [],
          env: { KEY: "val" },
        },
      },
    };
    const result = validateMcpConfig(config);
    expect(result).toEqual({ valid: true, serverCount: 1 });
  });
});
