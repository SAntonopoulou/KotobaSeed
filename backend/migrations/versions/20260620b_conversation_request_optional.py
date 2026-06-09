"""Make `conversation.request_id` nullable so two users can open a
direct conversation without going through a marketplace Request.

The Conversation row already carries `teacher_id` and `student_id` —
the request was always optional metadata, not a data invariant. Loosen
the constraint so direct DMs from the booking dashboard work.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260620b_conv_optional_request"
down_revision: str | None = "20260620a_min_booking_lead"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("conversation") as batch:
        batch.alter_column("request_id", nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("conversation") as batch:
        batch.alter_column("request_id", nullable=False)
