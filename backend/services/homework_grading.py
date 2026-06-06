"""Autograding for homework submissions.

Question types supported:
- mc_single: answer is the chosen option index; correct if matches the
  question's `correct` int.
- mc_multi: answer is a list/set of option indices; correct iff the set
  exactly matches `correct` — all-or-nothing scoring. Tutors who want
  partial credit can split into multiple mc_single questions.
- fill_blank: answer is a string; matched against `accepted_answers`
  with optional case insensitivity (default true) and Greek-style
  accent normalization (default true; toggleable per question).
- short_answer: never autograded — always flips needs_manual_review.

Each question has a `points` field (defaults to 1) that scales scoring.
"""

from __future__ import annotations

import json
import unicodedata
from typing import Any


def normalize_accents(text: str) -> str:
    """NFD-decompose then strip combining marks. Folds Greek breathings
    + acutes + diaereses into plain letters so `γειά σου` matches `γεια σου`.
    Latin diacritics also fold (è → e), useful for many languages."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _normalize_for_match(
    text: str, *, case_sensitive: bool, normalize_accents_flag: bool
) -> str:
    t = text.strip()
    if not case_sensitive:
        t = t.casefold()
    if normalize_accents_flag:
        t = normalize_accents(t)
    return t


def _grade_question(
    question: dict[str, Any], answer: Any
) -> tuple[bool, int, int, bool]:
    """Return (is_correct, points_earned, points_possible, needs_review).

    `needs_review` is True for short_answer (always) and for unknown types
    (defensive — don't auto-award points for things we don't understand).
    """
    qtype = question.get("type")
    points_possible = int(question.get("points", 1))

    if qtype == "mc_single":
        correct = question.get("correct")
        try:
            chosen = int(answer)
        except (TypeError, ValueError):
            return False, 0, points_possible, False
        is_correct = chosen == correct
        return is_correct, points_possible if is_correct else 0, points_possible, False

    if qtype == "mc_multi":
        expected = set(question.get("correct", []))
        if not isinstance(answer, list):
            return False, 0, points_possible, False
        try:
            got = {int(i) for i in answer}
        except (TypeError, ValueError):
            return False, 0, points_possible, False
        is_correct = got == expected
        return is_correct, points_possible if is_correct else 0, points_possible, False

    if qtype == "fill_blank":
        case_sensitive = bool(question.get("case_sensitive", False))
        normalize_flag = bool(question.get("normalize_accents", True))
        accepted = question.get("accepted_answers") or []
        if not isinstance(answer, str):
            return False, 0, points_possible, False
        student_norm = _normalize_for_match(
            answer,
            case_sensitive=case_sensitive,
            normalize_accents_flag=normalize_flag,
        )
        for candidate in accepted:
            if not isinstance(candidate, str):
                continue
            target_norm = _normalize_for_match(
                candidate,
                case_sensitive=case_sensitive,
                normalize_accents_flag=normalize_flag,
            )
            if student_norm == target_norm:
                return True, points_possible, points_possible, False
        return False, 0, points_possible, False

    if qtype == "translation":
        # Same matching logic as fill_blank, but semantically distinct in
        # the UI: the tutor sets a prompt sentence + a list of accepted
        # translations (synonyms). Optional `min_words`/`max_words` are
        # advisory only — we never penalise for length.
        case_sensitive = bool(question.get("case_sensitive", False))
        normalize_flag = bool(question.get("normalize_accents", True))
        accepted = question.get("accepted_answers") or []
        if not isinstance(answer, str):
            return False, 0, points_possible, False
        student_norm = _normalize_for_match(
            answer,
            case_sensitive=case_sensitive,
            normalize_accents_flag=normalize_flag,
        )
        for candidate in accepted:
            if not isinstance(candidate, str):
                continue
            target_norm = _normalize_for_match(
                candidate,
                case_sensitive=case_sensitive,
                normalize_accents_flag=normalize_flag,
            )
            if student_norm == target_norm:
                return True, points_possible, points_possible, False
        return False, 0, points_possible, False

    if qtype == "multi_blank":
        # A sentence with N blanks, each with its own accepted_answers list.
        # Answer is expected as {"0": "...", "1": "...", ...} keyed by blank
        # index. Scoring is per-blank: each correct blank gets
        # round(points_possible / N) — final remainder lands on the last
        # blank so totals always sum correctly.
        blanks = question.get("blanks") or []
        if not isinstance(blanks, list) or not blanks:
            return False, 0, points_possible, False
        case_sensitive = bool(question.get("case_sensitive", False))
        normalize_flag = bool(question.get("normalize_accents", True))
        ans_dict = answer if isinstance(answer, dict) else {}
        n = len(blanks)
        per_blank = points_possible // n
        earned = 0
        all_correct = True
        for idx, blank in enumerate(blanks):
            student = ans_dict.get(str(idx))
            if not isinstance(student, str):
                all_correct = False
                continue
            student_norm = _normalize_for_match(
                student,
                case_sensitive=case_sensitive,
                normalize_accents_flag=normalize_flag,
            )
            accepted = blank.get("accepted_answers") if isinstance(blank, dict) else []
            matched = False
            for candidate in accepted or []:
                if not isinstance(candidate, str):
                    continue
                target_norm = _normalize_for_match(
                    candidate,
                    case_sensitive=case_sensitive,
                    normalize_accents_flag=normalize_flag,
                )
                if student_norm == target_norm:
                    matched = True
                    break
            if matched:
                # Last blank absorbs any rounding remainder so the per-question
                # total can still reach points_possible exactly.
                if idx == n - 1:
                    earned += points_possible - per_blank * (n - 1)
                else:
                    earned += per_blank
            else:
                all_correct = False
        return all_correct, earned, points_possible, False

    if qtype == "short_answer":
        # No autograde — tutor reviews manually.
        return False, 0, points_possible, True

    # Unknown type — never auto-award.
    return False, 0, points_possible, True


def grade_submission(
    questions: list[dict[str, Any]], answers: dict[str, Any]
) -> dict[str, Any]:
    """Return a result dict:
    {
      "per_question": {qid: {correct, points_earned, points_possible, needs_review}},
      "auto_score": int,
      "max_score": int,
      "needs_manual_review": bool,
    }
    """
    per_question: dict[str, dict[str, Any]] = {}
    auto_score = 0
    max_score = 0
    needs_review = False
    for q in questions:
        qid = str(q.get("id"))
        answer = answers.get(qid)
        is_correct, earned, possible, qneeds = _grade_question(q, answer)
        per_question[qid] = {
            "correct": is_correct,
            "points_earned": earned,
            "points_possible": possible,
            "needs_review": qneeds,
        }
        auto_score += earned
        max_score += possible
        if qneeds:
            needs_review = True
    return {
        "per_question": per_question,
        "auto_score": auto_score,
        "max_score": max_score,
        "needs_manual_review": needs_review,
    }


def compute_max_score(questions: list[dict[str, Any]]) -> int:
    """Sum of `points` over all questions (defaulting to 1 per question)."""
    return sum(int(q.get("points", 1)) for q in questions)


def parse_questions(questions_json: str) -> list[dict[str, Any]]:
    """Decode + tolerate non-list input as empty."""
    try:
        data = json.loads(questions_json or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return data
