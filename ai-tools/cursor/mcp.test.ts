import { validateMcpConfig } from "../shared/mcp-compat-test";
import * as path from "path";

test("cursor mcp.json is valid", () => {
  const configPath = path.join(__dirname, "mcp.json");
  const result = validateMcpConfig(configPath);
  expect(result).toEqual({ valid: true, serverCount: 1 });
});
