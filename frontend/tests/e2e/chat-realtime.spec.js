// Block 1 regression: a chat message must reach the OTHER party's
// global WebSocket when they're NOT viewing the per-conversation room.
// Previously the recipient (a teacher with /messages open but no thread
// selected) saw nothing in real time because the NEW_MESSAGE_ALERT
// payload was empty AND the InboxContext handler dropped the event.
//
// We exercise the bug end-to-end at the protocol layer: the teacher
// opens a global WebSocket inside a real browser context and we
// assert the alert arrives with the new {conversation_id, sender_id}
// fields the frontend now needs to refresh the inbox list.

import { test, expect } from '@playwright/test';
import { apiJson, registerStudent, registerTutor } from './helpers.js';

test.describe('Chat realtime fan-out', () => {
  let tutorToken;
  let studentToken;
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
    const tutorMe = await apiJson(request, '/users/me', {
      headers: { Authorization: `Bearer ${tutorToken}` },
    });
    const tutorUserId = tutorMe.id;

    const student = await registerStudent(
      request,
      `student-${stamp}@example.com`,
    );
    studentToken = student.access_token;
    const studentMe = await apiJson(request, '/users/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    studentUserId = studentMe.id;

    // Student opens a direct conversation with the tutor.
    const conv = await apiJson(request, `/conversations/with/${tutorUserId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {},
    });
    conversationId = conv.conversation_id;
  });

  test('teacher global WS receives NEW_MESSAGE_ALERT with conversation + sender ids', async ({ page }) => {
    // Land on a page so window.location resolves correctly for the WS URL.
    await page.goto('/login');

    const received = await page.evaluate(
      async ({ tutorToken, studentToken, conversationId }) => {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${proto}://${window.location.host}/api/conversations/ws?token=${tutorToken}`;
        const ws = new WebSocket(wsUrl);
        const messages = [];
        const open = new Promise((res, rej) => {
          ws.onopen = () => res();
          ws.onerror = (e) => rej(new Error('ws errored'));
          setTimeout(() => rej(new Error('ws open timed out')), 5000);
        });
        ws.onmessage = (e) => {
          try {
            messages.push(JSON.parse(e.data));
          } catch (_) {
            messages.push({ raw: e.data });
          }
        };
        await open;

        // Student sends through the normal HTTP endpoint — this is the
        // path the bug was hiding in.
        const sendRes = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${studentToken}`,
            },
            body: JSON.stringify({ content: 'hello from playwright' }),
          },
        );
        if (!sendRes.ok) {
          const body = await sendRes.text();
          ws.close();
          throw new Error(`send failed: ${sendRes.status} ${body}`);
        }

        // Wait up to 3s for the alert to land.
        const start = Date.now();
        while (Date.now() - start < 3000) {
          const hit = messages.find((m) => m.type === 'NEW_MESSAGE_ALERT');
          if (hit) {
            ws.close();
            return { alert: hit, all: messages };
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        ws.close();
        return { alert: null, all: messages };
      },
      { tutorToken, studentToken, conversationId },
    );

    expect(received.alert).toBeTruthy();
    expect(received.alert.type).toBe('NEW_MESSAGE_ALERT');
    expect(received.alert.conversation_id).toBe(conversationId);
    expect(received.alert.sender_id).toBe(studentUserId);
  });
});
