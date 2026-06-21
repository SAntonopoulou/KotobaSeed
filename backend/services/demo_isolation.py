"""Foundational split between the demo site and the real site.

The "demo site" (demo.kotobaseed.net) and the "real site"
(kotobaseed.net) run separate stacks against separate databases, but
each database can contain accounts flagged via ``User.is_demo_account``:

- Demo accounts are created by the ``/try`` onboarding flow on either
  environment (someone tries the demo while on prod, for example).
- Real accounts are anyone who registered through ``/register``.

Without an explicit filter, both kinds of accounts surface their
content (articles, modules, profiles) through the public discovery
endpoints — so a demo tutor's "Welcome to my course" article shows on
the prod Discover page next to real tutors' work, and vice versa.

This module is the single place every public listing endpoint reaches
to scope its query to the correct half:

- On ``production``, demo accounts are hidden — only real content
  surfaces on the real site.
- On ``staging`` (which hosts the demo experience at
  demo.kotobaseed.net), real accounts are hidden — the demo sandbox
  shows ONLY demo content, so demo students can't book real tutors by
  accident and real tutors don't appear on a sandbox without consent.
- On ``dev`` and ``test``, nothing is filtered — developers see every
  account so they can debug both sides.

Usage::

    from sqlmodel import select
    from ..services.demo_isolation import exclude_cross_env_users

    stmt = select(Article, Tutor, User).join(Tutor).join(User).where(...)
    stmt = exclude_cross_env_users(stmt)
    rows = session.exec(stmt).all()

The helper appends a single indexed-column WHERE clause; cost is one
b-tree lookup per row at most.
"""

from __future__ import annotations

from typing import TypeVar

from ..config import get_settings
from ..models import User

S = TypeVar("S")  # SelectOfScalar | Select — any sqlmodel select-like


def exclude_cross_env_users(stmt: S, user_cls: type[User] = User) -> S:
    """Add an environment-appropriate `User.is_demo_account` filter.

    ``stmt`` must already join (or alias) the ``User`` table — pass the
    aliased class as ``user_cls`` if you joined under an alias.
    """
    env = get_settings().environment
    if env == "production":
        return stmt.where(user_cls.is_demo_account == False)  # noqa: E712
    if env == "staging":
        return stmt.where(user_cls.is_demo_account == True)  # noqa: E712
    # dev / test: no filter — both kinds of accounts visible.
    return stmt


def is_user_visible_in_env(user: User | None) -> bool:
    """Convenience for code paths that already have a User object in hand
    (rather than a query). Same semantics as ``exclude_cross_env_users``:
    True if the user is allowed to surface in the current environment.
    """
    if user is None:
        return False
    env = get_settings().environment
    if env == "production":
        return not user.is_demo_account
    if env == "staging":
        return bool(user.is_demo_account)
    return True
