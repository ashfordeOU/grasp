# Grasp Docker Image

Run Grasp analysis without installing anything locally.

## Quick start

```bash
# Analyse a GitHub repo
docker run ashfordeou/grasp analyze owner/repo

# With GitHub token (for private repos)
docker run -e GITHUB_TOKEN=ghp_... ashfordeou/grasp analyze owner/repo

# Analyse a local directory
docker run -v $(pwd):/workspace ashfordeou/grasp analyze /workspace
```

## Image tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable release |
| `3.5.2` | Specific version |

Available on:
- Docker Hub: `ashforde/grasp`
- GitHub Container Registry: `ghcr.io/ashfordeou/grasp`

## Build locally

```bash
docker build -t grasp-local docker/
docker run grasp-local --version
```
