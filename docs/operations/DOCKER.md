# Local PostgreSQL and backup stack

The root `docker-compose.yml` is an optional local operations stack. It does
not run the MicoPay API or frontend. Application processes run separately from
`micopay/backend` and `micopay/frontend`.

## Services

| Service | Port | Purpose |
| --- | --- | --- |
| PostgreSQL | 5432 | Local MicoPay database |
| MinIO | 9000 / 9001 | S3-compatible local backup storage and console |
| pgBackRest | internal | Encrypted PostgreSQL backups |
| backup-scheduler | internal | Periodic backup checks |

## Start

```sh
cp .env.example .env
docker compose up -d
docker compose ps
```

Replace every example password before using the stack outside an isolated
developer machine. The application backend still needs its own environment
configuration in `micopay/backend`.

## Common operations

```sh
docker compose logs -f postgres pgbackrest backup-scheduler
docker compose restart postgres
docker compose down
```

`docker compose down -v` deletes the local database and backup volumes. Use it
only when loss of all local data is intentional.

Production runs on AWS; this compose file is not a production deployment
manifest. See the current AWS operations documents in this directory.
