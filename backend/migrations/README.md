# Database migrations

Alembic owns schema changes from this point on. The baseline migration
(`20260605_baseline`) is intentionally empty — it's a stamp marker.

## Why an empty baseline?

CompInput (the original codebase) bootstrapped its schema via
`SQLModel.metadata.create_all()` at startup. There are existing databases
in the wild with data we don't want to lose. Rewriting the baseline as a
giant `op.create_table(...)` block would (a) duplicate every model
definition in Alembic syntax and (b) risk subtle drift from the actual
schema SQLModel created.

Instead:
- **Fresh database**: `create_db_and_tables()` at startup creates the
  schema, then `alembic stamp head` marks it as up-to-date.
- **Existing CompInput database**: `alembic stamp head` marks it as
  up-to-date, no DDL runs.
- **From here on**: every schema change is `alembic revision --autogenerate`
  and gets a real migration file. Alembic and the model definitions stay
  in sync.

The deploy wrapper (`entrypoint.sh`) handles the stamp-or-upgrade logic.

## Day-to-day workflow

When you change `backend/models.py`:

```bash
cd backend
alembic revision --autogenerate -m "add foo to bar"
# Review the generated file in migrations/versions/ — autogenerate is
# usually right but occasionally misses indexes or server defaults.
alembic upgrade head
```

Commit both the model change and the migration file together.

## Useful commands

```bash
# Show current revision
alembic current

# Show full history
alembic history --verbose

# Apply pending migrations
alembic upgrade head

# Downgrade one step (rare)
alembic downgrade -1

# Mark DB as up-to-date without running any DDL (for first-time setup of
# an existing database)
alembic stamp head
```

Run alembic from either the project root or from `backend/` — `env.py`
adjusts `sys.path` so `from backend import ...` works either way.
