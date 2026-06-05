"""Normalize stale `subscription_tier` values to FREE.

The Step 11 pricing migration collapsed the SubscriptionTier enum to
FREE/PLUS/PRO/BUSINESS, but any rows that existed with the old NONE /
PREMIUM values were never rewritten. SQLAlchemy raises LookupError on
read when it can't map the DB value back to the enum, which 500s any
endpoint that joins User rows.

Map every non-current value to FREE: anyone on the legacy NONE wasn't
paying us anything; anyone on the legacy PREMIUM was a CompInput tier
that no longer maps cleanly and the safest default is FREE (they'll
re-upgrade if they want).
"""

from __future__ import annotations

from alembic import op

revision: str = "20260617_normalize_subscription_tier"
down_revision: str | None = "20260617_homework"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE "user"
           SET subscription_tier = 'FREE'
         WHERE subscription_tier NOT IN ('FREE', 'PLUS', 'PRO', 'BUSINESS')
        """
    )


def downgrade() -> None:
    # No-op — we don't reconstruct what the original stale values were.
    pass
