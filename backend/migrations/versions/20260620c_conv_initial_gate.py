"""Track student-initiated direct conversations + tutor-first-response gate.

When a student opens a conversation by booking with a tutor or messaging
them from the My Tutors page, they get one initial message. The tutor
must respond at least once before the student can send a second message.

`student_initiated` flags conversations that follow this rule;
`tutor_first_responded_at` is stamped on the tutor's first message and
unlocks the conversation for free-form back-and-forth.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260620c_conv_initial_gate"
down_revision: str | None = "20260620b_conv_optional_request"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("conversation") as batch:
        batch.add_column(
            sa.Column(
                "student_initiated",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            )
        )
        batch.add_column(
            sa.Column("tutor_first_responded_at", sa.DateTime(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("conversation") as batch:
        batch.drop_column("tutor_first_responded_at")
        batch.drop_column("student_initiated")
