"""Phase B — extend CustomTheme for the scalable upload-driven system.

Adds:
  * theme_key — the slug the frontend matches against Tutor.theme to
    decide whether to mount the v2 runtime renderer.
  * palette_json — CSS-variable dict injected as inline styles by the
    runtime.
  * fonts_json — Google Fonts URL + per-role family names.
  * preview_image_url — the screenshot shown on the tutor's picker.
  * is_public_catalogue — when true, every tutor sees this theme.

All columns are additive with safe defaults. Older bespoke themes
(Vasso's existing one) continue to work — their `theme_key` stays null
and they keep rendering through the React component path.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "20260633_custom_theme_v2"
down_revision: str | None = "20260632_testimonial_submitter"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table("custom_theme") as batch:
        batch.add_column(sa.Column("theme_key", sa.String(length=64), nullable=True))
        batch.add_column(
            sa.Column(
                "palette_json",
                sa.String(length=8000),
                nullable=False,
                server_default="{}",
            )
        )
        batch.add_column(
            sa.Column(
                "fonts_json",
                sa.String(length=2000),
                nullable=False,
                server_default="{}",
            )
        )
        batch.add_column(
            sa.Column("preview_image_url", sa.String(length=2048), nullable=True)
        )
        batch.add_column(
            sa.Column(
                "is_public_catalogue",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    op.create_index("ix_custom_theme_theme_key", "custom_theme", ["theme_key"])
    op.create_index(
        "ix_custom_theme_is_public_catalogue",
        "custom_theme",
        ["is_public_catalogue"],
    )


def downgrade() -> None:
    op.drop_index("ix_custom_theme_is_public_catalogue", table_name="custom_theme")
    op.drop_index("ix_custom_theme_theme_key", table_name="custom_theme")
    with op.batch_alter_table("custom_theme") as batch:
        batch.drop_column("is_public_catalogue")
        batch.drop_column("preview_image_url")
        batch.drop_column("fonts_json")
        batch.drop_column("palette_json")
        batch.drop_column("theme_key")
