# Grasp Architecture Check — CircleCI Orb

Run [Grasp](https://github.com/ashfordeOU/grasp) architecture analysis in your CircleCI pipeline. The orb provides a reusable `analyze` job and a `check` command that fail the build when your repository's health grade drops below the configured threshold.

## Usage

### Add the orb and job

```yaml
version: 2.1

orbs:
  grasp: ashfordeou/grasp@1.0.0

workflows:
  build-and-analyse:
    jobs:
      - grasp/analyze:
          threshold: C
```

### Use the command inside an existing job

```yaml
version: 2.1

orbs:
  grasp: ashfordeou/grasp@1.0.0

jobs:
  my-job:
    docker:
      - image: cimg/base:stable
    steps:
      - checkout
      - grasp/check:
          threshold: B
          repo: myorg/myrepo

workflows:
  ci:
    jobs:
      - my-job
```

## Parameters

### `grasp/analyze` job

| Parameter   | Type   | Default                                          | Description                        |
|-------------|--------|--------------------------------------------------|------------------------------------|
| `threshold` | string | `D`                                              | Minimum health grade (A–F)         |
| `repo`      | string | `${CIRCLE_PROJECT_USERNAME}/${CIRCLE_PROJECT_REPONAME}` | Repository to analyse |

### `grasp/check` command

| Parameter   | Type   | Default                                          | Description                        |
|-------------|--------|--------------------------------------------------|------------------------------------|
| `threshold` | string | `D`                                              | Minimum health grade (A–F)         |
| `repo`      | string | `${CIRCLE_PROJECT_USERNAME}/${CIRCLE_PROJECT_REPONAME}` | Repository to analyse |

## Grades

Grades run from **A** (best) to **F** (worst). Setting `threshold: B` means grades A and B pass; C, D, and F fail.

## Publishing the orb

```bash
# Validate
circleci orb validate circleci-orb/orb.yml

# Publish (requires CircleCI CLI and namespace ownership)
circleci orb publish circleci-orb/orb.yml ashfordeou/grasp@1.0.0
```

## License

MIT — see [LICENSE](../LICENSE).
