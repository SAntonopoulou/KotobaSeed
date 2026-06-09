// Block 2a — end-to-end Inbox coverage. Exercises the full chat
// surface: student-initiated gate, tutor first-reply unlock, undo
// window, block/unblock, report submission, and conversation search
// q= filter. API-driven so the spec stays fast and deterministic; the
// UI specs come later once the Inbox refactor lands.

import { test, expect } from '@playwright/test';
import { apiJson, registerStudent, registerTutor } from './helpers.js';

const auth = (token) => ({ Authorization: `Bearer ${token}` });

test.describe('Chat inbox hardening', () => {
  let tutorToken;
  let studentToken;
  let tutorUserId;
  let studentUserId;
  let conversationId;
  const tutorSlug = `t${Date.now().toString(36).slice(-6)}`;

  test.beforeAll(async ({ request }) => {
    const stamp = Date.now().toString(36).slice(-6);

    const tutor = await registerTutor(
      request,
      `tutor-${stamp}@example.com`,
      tutorSlug,
    );
    tutorToken = tutor.access_token;
    const tutorMe = await apiJson(request, '/users/me', { headers: auth(tutorToken) });
    tutorUserId = tutorMe.id;

    const student = await registerStudent(
      request,
      `student-${stamp}@example.com`,
    );
    studentToken = student.access_token;
    const studentMe = await apiJson(request, '/users/me', { headers: auth(studentToken) });
    studentUserId = studentMe.id;

    // Student initiates a direct conversation — this flips
    // student_initiated=true on the row.
    const conv = await apiJson(request, `/conversations/with/${tutorUserId}`, {
      method: 'POST',
      headers: auth(studentToken),
      data: {},
    });
    conversationId = conv.conversation_id;
  });

  test('student gets exactly one intro, second send blocked until tutor replies', async ({ request }) => {
    // First send — allowed.
    await apiJson(request, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: auth(studentToken),
      data: { content: 'Hi, I would love to learn from you!' },
    });

    // Second send before tutor replies — blocked.
    const second = await request.fetch(
      `/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth(studentToken) },
        data: { content: 'Are you there?' },
      },
    );
    expect(second.status()).toBe(403);
    const body = await second.json();
    expect(body.detail).toMatch(/wait for the tutor/i);

    // Tutor replies — should succeed and stamp the unlock.
    await apiJson(request, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: auth(tutorToken),
      data: { content: 'Hi! Yes, happy to help.' },
    });

    // Now the student can send freely.
    await apiJson(request, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: auth(studentToken),
      data: { content: 'Awesome! When can we start?' },
    });
  });

  test('undo retracts content + flips deleted_at', async ({ request }) => {
    // Send a message.
    const sent = await apiJson(
      request,
      `/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: auth(tutorToken),
        data: { content: 'Whoops, wrong message' },
      },
    );

    // Undo within the window — succeeds and clears content.
    const undone = await apiJson(
      request,
      `/conversations/${conversationId}/messages/${sent.id}/undo`,
      { method: 'POST', headers: auth(tutorToken) },
    );
    expect(undone.deleted_at).not.toBeNull();
    expect(undone.content).toBe('');

    // Second undo is idempotent (no error, same result).
    const again = await apiJson(
      request,
      `/conversations/${conversationId}/messages/${sent.id}/undo`,
      { method: 'POST', headers: auth(tutorToken) },
    );
    expect(again.deleted_at).not.toBeNull();
  });

  test('search filters conversations by participant name and content', async ({ request }) => {
    // Seed a distinctive last-message so the content filter has something
    // deterministic to match — earlier tests have churned the latest
    // message content (undo masks it).
    const marker = 'pineapples-marker-' + Date.now().toString(36);
    await apiJson(request, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: auth(tutorToken),
      data: { content: `Latest message contains ${marker}.` },
    });

    // No filter — at least our conversation is present.
    const all = await apiJson(request, '/conversations/', {
      headers: auth(tutorToken),
    });
    expect(all.length).toBeGreaterThan(0);

    // q matches the student's name (default "Test Student").
    const hit = await apiJson(request, '/conversations/?q=Test%20Student', {
      headers: auth(tutorToken),
    });
    expect(hit.find((c) => c.id === conversationId)).toBeTruthy();

    // q matches a substring of the latest message content.
    const byContent = await apiJson(
      request,
      `/conversations/?q=${encodeURIComponent(marker)}`,
      { headers: auth(tutorToken) },
    );
    expect(byContent.find((c) => c.id === conversationId)).toBeTruthy();

    // Garbage q — no matches.
    const empty = await apiJson(request, '/conversations/?q=zzzznomatch', {
      headers: auth(tutorToken),
    });
    expect(empty.length).toBe(0);
  });

  test('block prevents new sends in both directions', async ({ request }) => {
    // Tutor blocks the student.
    const blockRes = await apiJson(
      request,
      `/conversations/users/${studentUserId}/block`,
      { method: 'POST', headers: auth(tutorToken) },
    );
    expect(blockRes.blocked).toBe(true);

    // Student tries to send → 403.
    const blocked = await request.fetch(
      `/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth(studentToken) },
        data: { content: 'Can I still message?' },
      },
    );
    expect(blocked.status()).toBe(403);

    // Tutor tries to send → also 403 (symmetric).
    const tutorBlocked = await request.fetch(
      `/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth(tutorToken) },
        data: { content: 'reply' },
      },
    );
    expect(tutorBlocked.status()).toBe(403);

    // Unblock — sends work again.
    const unblockRes = await apiJson(
      request,
      `/conversations/users/${studentUserId}/block`,
      { method: 'DELETE', headers: auth(tutorToken) },
    );
    expect(unblockRes.blocked).toBe(false);
    await apiJson(request, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: auth(tutorToken),
      data: { content: 'OK, you can write again.' },
    });
  });

  test('report submission creates an open queue row', async ({ request }) => {
    const report = await apiJson(
      request,
      `/conversations/${conversationId}/report`,
      {
        method: 'POST',
        headers: auth(studentToken),
        data: { reason: 'spam', note: 'They sent ads.' },
      },
    );
    expect(report.status).toBe('open');
    expect(report.reason).toBe('spam');
    expect(report.reporter_user_id).toBe(studentUserId);
    expect(report.reported_user_id).toBe(tutorUserId);
  });
});
