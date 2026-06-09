"""Add custom_theme + custom_theme_order tables.

Plus the FK Tutor.active_theme_id → custom_theme.id (the FK was deferred
when the column was first added in the team-protection migration).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260617_custom_themes"
down_revision: str | None = "20260616_admin_grants"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = set(inspector.get_table_names())

    if "custom_theme" not in existing:
        op.create_table(
            "custom_theme",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_user_id", sa.Integer(), nullable=True),
            sa.Column("owner_team_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("design_payload_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
            sa.Column("source_order_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["owner_user_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["owner_team_id"], ["tutor_team.id"]),
        )
        op.create_index("ix_custom_theme_owner_user_id", "custom_theme", ["owner_user_id"])
        op.create_index("ix_custom_theme_owner_team_id", "custom_theme", ["owner_team_id"])
        op.create_index("ix_custom_theme_status", "custom_theme", ["status"])

    if "custom_theme_order" not in existing:
        op.create_table(
            "custom_theme_order",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("ordering_user_id", sa.Integer(), nullable=False),
            sa.Column("target_tutor_id", sa.Integer(), nullable=False),
            sa.Column("target_team_id", sa.Integer(), nullable=True),
            sa.Column("package", sa.String(length=32), nullable=False, server_default="standard"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
            sa.Column("deposit_cents", sa.Integer(), nullable=False),
            sa.Column("final_cents", sa.Integer(), nullable=False),
            sa.Column("discount_percent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="eur"),
            sa.Column("brief_payload_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("concept_previews_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("selected_concept_index", sa.Integer(), nullable=True),
            sa.Column("revision_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("revision_notes_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("designer_notes", sa.String(length=2000), nullable=True),
            sa.Column("stripe_deposit_session_id", sa.String(length=255), nullable=True),
            sa.Column("stripe_deposit_payment_intent_id", sa.String(length=255), nullable=True),
            sa.Column("stripe_final_session_id", sa.String(length=255), nullable=True),
            sa.Column("stripe_final_payment_intent_id", sa.String(length=255), nullable=True),
            sa.Column("delivered_theme_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deposit_paid_at", sa.DateTime(), nullable=True),
            sa.Column("concepts_ready_at", sa.DateTime(), nullable=True),
            sa.Column("approved_at", sa.DateTime(), nullable=True),
            sa.Column("final_paid_at", sa.DateTime(), nullable=True),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["ordering_user_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["target_tutor_id"], ["tutor.id"]),
            sa.ForeignKeyConstraint(["target_team_id"], ["tutor_team.id"]),
            sa.ForeignKeyConstraint(["delivered_theme_id"], ["custom_theme.id"]),
        )
        op.create_index(
            "ix_custom_theme_order_ordering_user_id",
            "custom_theme_order",
            ["ordering_user_id"],
        )
        op.create_index(
            "ix_custom_theme_order_target_tutor_id",
            "custom_theme_order",
            ["target_tutor_id"],
        )
        op.create_index(
            "ix_custom_theme_order_target_team_id",
            "custom_theme_order",
            ["target_team_id"],
        )
        op.create_index(
            "ix_custom_theme_order_status",
            "custom_theme_order",
            ["status"],
        )

    # Late-binding the source_order_id FK on custom_theme — we created
    # the column above but couldn't FK it then because custom_theme_order
    # didn't yet exist. Postgres lets us add this now via ALTER; SQLite
    # silently keeps the column without enforcing the FK, which is fine.
    if conn.dialect.name == "postgresql":
        try:
            op.execute(
                "ALTER TABLE custom_theme "
                "ADD CONSTRAINT fk_custom_theme_source_order "
                "FOREIGN KEY (source_order_id) REFERENCES custom_theme_order(id)"
            )
        except Exception:
            # Constraint may already exist (re-run) — swallow.
            pass


def downgrade() -> None:
    import contextlib

    if op.get_bind().dialect.name == "postgresql":
        with contextlib.suppress(Exception):
            op.execute("ALTER TABLE custom_theme DROP CONSTRAINT fk_custom_theme_source_order")
    with contextlib.suppress(Exception):
        op.drop_table("custom_theme_order")
    with contextlib.suppress(Exception):
        op.drop_table("custom_theme")
