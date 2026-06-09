"""Drop orphan scaffolding tables: theme, tutor_branding, platform_subscription.

Three tables were scaffolded in earlier multi-tenant + billing refactors
but never wired up — the canonical fields ended up elsewhere:

- `theme` table: superseded by the static catalogue in
  `backend/services/themes.py` plus the `Tutor.theme` column.
- `tutor_branding` table: superseded by `Tutor.theme` (theme choice) and
  the TutorPageSection layer (per-section content overrides).
- `platform_subscription` table: superseded by `User.subscription_tier`
  + `Tutor.stripe_subscription_id` / `Tutor.stripe_customer_id` already
  on the Tutor row, populated by the subscription webhook.

Dropping here so the schema stays honest about what's live.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260611_drop_orphan_scaffolds"
down_revision: str | None = "20260608b_referrals"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Each table may not exist in older dev DBs (was added but never wired
    # up), so guard with IF EXISTS via batch_alter_table-equivalent: a
    # plain drop_table() with the engine-specific raw SQL pre-check.
    for table in ("platform_subscription", "tutor_branding", "theme"):
        op.execute(f"DROP TABLE IF EXISTS {table}")


def downgrade() -> None:
    # Re-creating dead scaffolds isn't useful; downgrade is a no-op.
    # If you genuinely need them back, restore the model classes from
    # git history at this revision and run alembic upgrade with --sql to
    # produce the DDL.
    pass
