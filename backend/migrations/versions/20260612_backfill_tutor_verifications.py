"""Backfill TutorVerification from legacy TeacherVerification rows.

The old verification flow stored language-proficiency claims against
User.id (TeacherVerification.teacher_id). The new flow stores all kinds
against Tutor.id (TutorVerification.tutor_id) and supports teaching
credentials + identity in addition to language proficiency.

For every APPROVED TeacherVerification whose teacher has a Tutor row, we
copy it into TutorVerification so the tutor doesn't lose their badge when
the dashboard switches over. PENDING / REJECTED rows are left where they
are — tutors can re-submit via the new flow if they still need them.
"""

from __future__ import annotations

from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "20260612_backfill_tutor_verifications"
down_revision: str | None = "20260611_drop_orphan_scaffolds"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    # Both tables may not exist on every dev DB — guard so the migration
    # is safe to run anywhere.
    inspector = sa.inspect(conn)
    table_names = set(inspector.get_table_names())
    if "teacher_verification" not in table_names:
        return
    if "tutor_verification" not in table_names:
        return

    rows = conn.execute(
        sa.text(
            """
            SELECT tv.id, tv.teacher_id, tv.language, tv.document_url,
                   tv.created_at, t.id AS tutor_id
            FROM teacher_verification tv
            JOIN tutor t ON t.user_id = tv.teacher_id
            WHERE tv.status = 'APPROVED'
            """
        )
    ).fetchall()

    if not rows:
        return

    now = datetime.now(UTC).isoformat(sep=" ")
    for row in rows:
        # Skip if a matching TutorVerification already exists (idempotent).
        existing = conn.execute(
            sa.text(
                """
                SELECT 1 FROM tutor_verification
                WHERE tutor_id = :tutor_id
                  AND kind = 'LANGUAGE_PROFICIENCY'
                  AND language = :language
                LIMIT 1
                """
            ),
            {"tutor_id": row.tutor_id, "language": row.language},
        ).first()
        if existing is not None:
            continue

        conn.execute(
            sa.text(
                """
                INSERT INTO tutor_verification (
                    tutor_id, kind, description, language,
                    evidence_file_path, status, reviewed_at, review_notes,
                    created_at, updated_at
                ) VALUES (
                    :tutor_id, 'LANGUAGE_PROFICIENCY', :description, :language,
                    :evidence, 'APPROVED', :now, 'Backfilled from legacy verification.',
                    :created_at, :now
                )
                """
            ),
            {
                "tutor_id": row.tutor_id,
                "description": f"{row.language} (verified, legacy import)",
                "language": row.language,
                "evidence": row.document_url,
                "now": now,
                "created_at": (
                    row.created_at.isoformat(sep=" ")
                    if hasattr(row.created_at, "isoformat")
                    else (row.created_at or now)
                ),
            },
        )


def downgrade() -> None:
    # Drop only rows whose review_notes match the backfill signature so we
    # don't take out organic submissions.
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "tutor_verification" not in set(inspector.get_table_names()):
        return
    conn.execute(
        sa.text(
            "DELETE FROM tutor_verification "
            "WHERE review_notes = 'Backfilled from legacy verification.'"
        )
    )
