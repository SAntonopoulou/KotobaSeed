"""Per-tutor email templates with platform defaults.

Each transactional email has:
- A `template_key` (the database row's identifier)
- A default subject + markdown body in DEFAULTS below
- A list of placeholders the tutor can use (the `placeholders` field)

Send-time flow:
1. Look up the tutor's override for the template_key (if any)
2. Substitute placeholders via str.format_map with SafePlaceholderDict so
   typos in the tutor's template show literally (`{custome_name}`) rather
   than crashing the send with KeyError
3. Render the markdown body to HTML
4. Wrap in the brand frame from services.email._wrap
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session, select

from ..models import Tutor, TutorEmailTemplate


@dataclass(frozen=True)
class TemplateDefinition:
    key: str
    label: str  # human label for the dashboard editor
    description: str  # one-liner explaining when it fires
    default_subject: str
    default_body_markdown: str
    placeholders: tuple[str, ...]  # available `{name}` keys


# Common placeholders most emails accept. Listed per-template for the
# dashboard so the tutor sees exactly what each context provides.
_COMMON_BOOKING_PLACEHOLDERS = (
    "student_name",
    "tutor_name",
    "when",
    "duration_minutes",
    "pack_name",
    "classroom_url",
)

_TUTOR_SIDE_PLACEHOLDERS = (
    "student_name",
    "tutor_name",
    "when",
    "duration_minutes",
    "pack_name",
    "dashboard_url",
)


DEFAULTS: dict[str, TemplateDefinition] = {
    "booking_confirmation_student": TemplateDefinition(
        key="booking_confirmation_student",
        label="Booking confirmation (student)",
        description="Sent to the student when a paid booking is confirmed.",
        default_subject="Your lesson with {tutor_name} is confirmed",
        default_body_markdown=(
            "Hi {student_name},\n\n"
            "Your lesson with **{tutor_name}** is confirmed for **{when}** "
            "({duration_minutes} minutes).\n\n"
            "**Pack:** {pack_name}\n\n"
            "[Join the classroom]({classroom_url})\n\n"
            "The classroom opens 15 minutes before your lesson. "
            "I'll send a reminder a day before too.\n\n"
            "See you then!"
        ),
        placeholders=_COMMON_BOOKING_PLACEHOLDERS,
    ),
    "trial_welcome_student": TemplateDefinition(
        key="trial_welcome_student",
        label="Free trial confirmation (student)",
        description="Sent when a student books a free trial lesson.",
        default_subject="Your free trial with {tutor_name} is booked",
        default_body_markdown=(
            "Hi {student_name},\n\n"
            "Your free trial with **{tutor_name}** is booked for **{when}** "
            "({duration_minutes} minutes).\n\n"
            "[Join the classroom]({classroom_url})\n\n"
            "The classroom opens 15 minutes before your lesson. "
            "If you click with the lesson, you can book a paid one directly afterwards. "
            "Either way — no card needed today.\n\n"
            "See you then!"
        ),
        placeholders=_COMMON_BOOKING_PLACEHOLDERS,
    ),
    "booking_reminder_student": TemplateDefinition(
        key="booking_reminder_student",
        label="24h reminder (student)",
        description="Sent ~24 hours before each lesson as a reminder.",
        default_subject="Tomorrow: your lesson with {tutor_name}",
        default_body_markdown=(
            "Hi {student_name},\n\n"
            "Quick reminder — you have a lesson with **{tutor_name}** at "
            "**{when}** ({duration_minutes} minutes).\n\n"
            "[Join the classroom]({classroom_url})\n\n"
            "The classroom opens 15 minutes before the lesson starts."
        ),
        placeholders=_COMMON_BOOKING_PLACEHOLDERS,
    ),
    "booking_confirmation_tutor": TemplateDefinition(
        key="booking_confirmation_tutor",
        label="New booking notification (tutor)",
        description="Sent to you when a student books a lesson.",
        default_subject="New lesson booked: {student_name}, {when}",
        default_body_markdown=(
            "Hi {tutor_name},\n\n"
            "**{student_name}** booked a lesson with you for **{when}** "
            "({duration_minutes} minutes).\n\n"
            "**Pack:** {pack_name}\n\n"
            "[Open your dashboard]({dashboard_url})\n\n"
            "The classroom opens 15 minutes before the lesson."
        ),
        placeholders=_TUTOR_SIDE_PLACEHOLDERS,
    ),
    "booking_reminder_tutor": TemplateDefinition(
        key="booking_reminder_tutor",
        label="24h reminder (tutor)",
        description="Sent to you ~24 hours before each lesson.",
        default_subject="Tomorrow: lesson with {student_name}",
        default_body_markdown=(
            "Hi {tutor_name},\n\n"
            "You have a lesson with **{student_name}** at **{when}** "
            "({duration_minutes} minutes).\n\n"
            "[Open your dashboard]({dashboard_url})"
        ),
        placeholders=_TUTOR_SIDE_PLACEHOLDERS,
    ),
    "booking_cancelled_student": TemplateDefinition(
        key="booking_cancelled_student",
        label="Cancellation confirmation (student)",
        description=(
            "Sent when a student cancels a booking. Includes refund details "
            "when the cancellation refunded a paid lesson — falls back to a "
            "simple cancellation note for pending-payment slots."
        ),
        default_subject="Cancelled: your lesson with {tutor_name}",
        default_body_markdown=(
            "Hi {student_name},\n\n"
            "Your lesson with **{tutor_name}** on **{when}** is cancelled.\n\n"
            "{refund_note}\n\n"
            "If anything changes, you're welcome to book again any time."
        ),
        placeholders=(
            "student_name",
            "tutor_name",
            "when",
            "duration_minutes",
            "pack_name",
            "refund_note",
        ),
    ),
}


class SafePlaceholderDict(dict):
    """Dict that returns the key wrapped in braces when missing — so a
    tutor's typo like `{custome_name}` shows literally in their email
    rather than blowing up the send with KeyError."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def render(
    template_key: str,
    context: dict[str, object],
    *,
    session: Session,
    tutor: Tutor | None = None,
) -> tuple[str, str]:
    """Return (subject, html_body) for the given template + context.

    Looks up the tutor's override if one exists, else falls back to the
    platform default. Renders the markdown body via a minimal converter
    (paragraphs + bold + italic + links) suitable for transactional mail.
    """
    definition = DEFAULTS.get(template_key)
    if definition is None:
        raise ValueError(f"Unknown email template key: {template_key}")

    override: TutorEmailTemplate | None = None
    if tutor is not None:
        override = session.exec(
            select(TutorEmailTemplate).where(
                TutorEmailTemplate.tutor_id == tutor.id,
                TutorEmailTemplate.template_key == template_key,
            )
        ).first()

    subject_template = override.subject if override else definition.default_subject
    body_template = (
        override.body_markdown
        if override and override.body_markdown
        else definition.default_body_markdown
    )

    safe_ctx = SafePlaceholderDict(context)
    subject = subject_template.format_map(safe_ctx)
    body_filled = body_template.format_map(safe_ctx)
    html_body = _markdown_to_html(body_filled)
    return subject, html_body


# --- Minimal markdown → HTML --------------------------------------------
#
# We don't pull a full markdown library on the backend — these templates
# only need paragraphs, bold (`**text**`), italic (`*text*`), and links
# (`[text](url)`). Anything fancier the tutor wants, they can hand-write
# in HTML — Resend renders raw HTML fine.

import html as _html  # noqa: E402
import re as _re  # noqa: E402

_LINK_RE = _re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD_RE = _re.compile(r"\*\*([^*]+)\*\*")
_ITALIC_RE = _re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")


def _inline_markdown(text: str) -> str:
    """Apply inline transforms (links/bold/italic). Escape HTML first so
    a tutor pasting `<script>` doesn't slip through."""
    escaped = _html.escape(text)
    escaped = _LINK_RE.sub(
        lambda m: f'<a href="{_html.escape(m.group(2), quote=True)}" '
        'style="color:#2a6e3f;">'
        f"{m.group(1)}</a>",
        escaped,
    )
    escaped = _BOLD_RE.sub(r"<strong>\1</strong>", escaped)
    escaped = _ITALIC_RE.sub(r"<em>\1</em>", escaped)
    return escaped


def _markdown_to_html(markdown: str) -> str:
    """Split on blank lines for paragraphs; preserve single newlines as
    `<br>` so the tutor's line breaks survive."""
    paragraphs = []
    for chunk in markdown.split("\n\n"):
        if not chunk.strip():
            continue
        inlined = _inline_markdown(chunk).replace("\n", "<br>")
        paragraphs.append(f"<p>{inlined}</p>")
    return "\n".join(paragraphs)
