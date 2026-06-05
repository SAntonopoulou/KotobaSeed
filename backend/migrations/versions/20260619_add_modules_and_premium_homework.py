"""Add lesson modules, module purchases, premium homework fields + table.

Three new tables (lesson_module, module_purchase, homework_purchase) and
three new columns on homework_template (is_premium, price_cents, currency).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260619_modules_and_premium"
down_revision: str | None = "20260618_placement_test"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # --- Premium homework: extend the existing template table -------
    with op.batch_alter_table("homework_template") as batch:
        batch.add_column(
            sa.Column(
                "is_premium", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        batch.add_column(
            sa.Column(
                "price_cents", sa.Integer(), nullable=False, server_default="0"
            )
        )
        batch.add_column(
            sa.Column(
                "currency", sa.String(length=3), nullable=False, server_default="eur"
            )
        )
    op.create_index(
        "ix_homework_template_is_premium", "homework_template", ["is_premium"]
    )

    op.create_table(
        "homework_purchase",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "platform_fee_cents", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column(
            "stripe_checkout_session_id", sa.String(length=128), nullable=True
        ),
        sa.Column("stripe_payment_intent_id", sa.String(length=128), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=False),
        sa.Column("refunded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["homework_template.id"]),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.UniqueConstraint(
            "template_id", "student_user_id", name="uq_homework_purchase_pair"
        ),
    )
    op.create_index("ix_homework_purchase_template", "homework_purchase", ["template_id"])
    op.create_index("ix_homework_purchase_tutor", "homework_purchase", ["tutor_id"])
    op.create_index("ix_homework_purchase_student", "homework_purchase", ["student_user_id"])
    op.create_index(
        "ix_homework_purchase_checkout",
        "homework_purchase",
        ["stripe_checkout_session_id"],
    )
    op.create_index(
        "ix_homework_purchase_payment_intent",
        "homework_purchase",
        ["stripe_payment_intent_id"],
    )

    # --- Lesson modules ------------------------------------------------
    op.create_table(
        "lesson_module",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("description", sa.String(length=4000), nullable=True),
        sa.Column("featured_image_url", sa.String(length=2048), nullable=True),
        sa.Column("items_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column(
            "is_published", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.UniqueConstraint("tutor_id", "slug", name="uq_lesson_module_tutor_slug"),
    )
    op.create_index("ix_lesson_module_tutor", "lesson_module", ["tutor_id"])
    op.create_index("ix_lesson_module_slug", "lesson_module", ["slug"])
    op.create_index("ix_lesson_module_published", "lesson_module", ["is_published"])

    op.create_table(
        "module_purchase",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("module_id", sa.Integer(), nullable=False),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "platform_fee_cents", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="eur"
        ),
        sa.Column(
            "stripe_checkout_session_id", sa.String(length=128), nullable=True
        ),
        sa.Column("stripe_payment_intent_id", sa.String(length=128), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=False),
        sa.Column("refunded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["module_id"], ["lesson_module.id"]),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutor.id"]),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"]),
        sa.UniqueConstraint(
            "module_id", "student_user_id", name="uq_module_purchase_pair"
        ),
    )
    op.create_index("ix_module_purchase_module", "module_purchase", ["module_id"])
    op.create_index("ix_module_purchase_tutor", "module_purchase", ["tutor_id"])
    op.create_index("ix_module_purchase_student", "module_purchase", ["student_user_id"])
    op.create_index(
        "ix_module_purchase_checkout", "module_purchase", ["stripe_checkout_session_id"]
    )
    op.create_index(
        "ix_module_purchase_payment_intent",
        "module_purchase",
        ["stripe_payment_intent_id"],
    )


def downgrade() -> None:
    for ix in (
        "ix_module_purchase_payment_intent",
        "ix_module_purchase_checkout",
        "ix_module_purchase_student",
        "ix_module_purchase_tutor",
        "ix_module_purchase_module",
    ):
        op.drop_index(ix, table_name="module_purchase")
    op.drop_table("module_purchase")
    for ix in (
        "ix_lesson_module_published",
        "ix_lesson_module_slug",
        "ix_lesson_module_tutor",
    ):
        op.drop_index(ix, table_name="lesson_module")
    op.drop_table("lesson_module")
    for ix in (
        "ix_homework_purchase_payment_intent",
        "ix_homework_purchase_checkout",
        "ix_homework_purchase_student",
        "ix_homework_purchase_tutor",
        "ix_homework_purchase_template",
    ):
        op.drop_index(ix, table_name="homework_purchase")
    op.drop_table("homework_purchase")
    op.drop_index("ix_homework_template_is_premium", table_name="homework_template")
    with op.batch_alter_table("homework_template") as batch:
        batch.drop_column("currency")
        batch.drop_column("price_cents")
        batch.drop_column("is_premium")
