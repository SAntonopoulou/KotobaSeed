"""Add Testimonial.submitted_by_user_id.

Tracks who submitted a testimonial through the public form (POST
/testimonials/submit). Tutor-typed rows leave this null. Indexed so
the dashboard's "pending submissions" view can filter cheaply.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260632_testimonial_submitter"
down_revision: str | None = "20260631_tutor_show_kotobaseed_link"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("testimonial") as batch:
        batch.add_column(
            sa.Column(
                "submitted_by_user_id",
                sa.Integer(),
                nullable=True,
            )
        )
        batch.create_foreign_key(
            "fk_testimonial_submitter_user",
            "user",
            ["submitted_by_user_id"],
            ["id"],
        )
    op.create_index(
        "ix_testimonial_submitted_by_user_id",
        "testimonial",
        ["submitted_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_testimonial_submitted_by_user_id", table_name="testimonial")
    with op.batch_alter_table("testimonial") as batch:
        batch.drop_constraint("fk_testimonial_submitter_user", type_="foreignkey")
        batch.drop_column("submitted_by_user_id")
