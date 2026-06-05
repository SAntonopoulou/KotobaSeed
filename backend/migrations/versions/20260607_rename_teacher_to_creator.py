"""Rename UserRole.TEACHER → UserRole.CREATOR.

User-facing rename: same role, clearer name. "Teacher" was too close to
"Tutor" (which is a creator who also runs a one-to-one tutoring site).
Updates the value stored in `user.role` for existing rows from 'teacher'
to 'creator'. Internal table/class names (TeacherFollower,
TeacherVerification, teacher_id columns) stay for now — those don't
appear in the UI.
"""

from __future__ import annotations

from alembic import op

revision: str = "20260607_creator_rename"
down_revision: str | None = "20260607_booking"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # SQLAlchemy's Enum column stores enum NAMES by default (uppercase),
    # not values. Catch both cases so we work on production data (where
    # values were stored lowercased somewhere) AND dev data (uppercase).
    op.execute("UPDATE user SET role = 'CREATOR' WHERE role = 'TEACHER'")
    op.execute("UPDATE user SET role = 'CREATOR' WHERE role = 'teacher'")


def downgrade() -> None:
    op.execute("UPDATE user SET role = 'TEACHER' WHERE role = 'CREATOR'")
    op.execute("UPDATE user SET role = 'TEACHER' WHERE role = 'creator'")
