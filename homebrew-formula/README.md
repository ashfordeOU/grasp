# Grasp Homebrew Formula

Install Grasp via Homebrew:

```bash
brew tap ashfordeou/grasp
brew install grasp
```

Or install directly without tapping:

```bash
brew install ashfordeou/grasp/grasp
```

## Manual update

The formula is auto-updated by a GitHub Actions workflow when a new version of `grasp-mcp-server` is published to npm. To update manually:

1. Get the new tarball SHA256: `curl -s https://registry.npmjs.org/grasp-mcp-server/3.X.Y | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['dist']['shasum'])"`
2. Update the `sha256` in `grasp.rb`
3. Update the `url` version
4. Open a PR to the `homebrew-grasp` tap repo
