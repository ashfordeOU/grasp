import { validateMcpConfig } from "../shared/mcp-compat-test";
import * as path from "path";

test("roo-code mcp.json is valid", () => {
  const result = validateMcpConfig(path.join(__dirname, "mcp.json"));
  expect(result).toEqual({ valid: true, serverCount: 1 });
});
