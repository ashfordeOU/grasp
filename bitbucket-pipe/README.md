# Grasp Architecture Check — Bitbucket Pipe

Run [Grasp](https://github.com/ashfordeOU/grasp) architecture analysis as a step in your Bitbucket Pipelines workflow. The pipe analyses your repository's health grade and fails the build if the grade falls below the configured threshold.

## Usage

Add the pipe to your `bitbucket-pipelines.yml`:

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: Grasp Architecture Check
          script:
            - pipe: ashfordeou/grasp-pipe:1.0.0
              variables:
                THRESHOLD: 'C'
                BITBUCKET_TOKEN: $BITBUCKET_TOKEN
```

### Minimal example (default threshold D)

```yaml
pipelines:
  default:
    - step:
        name: Architecture check
        script:
          - pipe: ashfordeou/grasp-pipe:1.0.0
```

## Variables

| Variable          | Required | Default | Description                                             |
|-------------------|----------|---------|---------------------------------------------------------|
| `THRESHOLD`       | No       | `D`     | Minimum health grade (A–F). Fails if grade is below.   |
| `BITBUCKET_TOKEN` | No       | —       | Bitbucket App Password for posting PR comments.        |

## Grades

Grades run from **A** (best) to **F** (worst). Setting `THRESHOLD: B` means grades A and B pass; C, D, and F fail.

## Building the pipe image locally

```bash
cd bitbucket-pipe
docker build -t ashfordeou/grasp-pipe:latest .
docker run --rm -e THRESHOLD=C ashfordeou/grasp-pipe:latest
```

## License

MIT — see [LICENSE](../LICENSE).
