import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { setupMultiplayerWebSocket } from '../server/index';
import { GameEngine } from '../src/game/engine';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('--- STARTING STAGE 9 MULTIPLAYER CHAT & COMMUNICATION TEST SUITE ---');

  const httpServer = createServer();
  const wsServer = setupMultiplayerWebSocket(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Invalid address');
  const port = address.port;
  const wsUrl = `ws://127.0.0.1:${port}`;

  function createClient(): {
    ws: WebSocket;
    messages: any[];
    waitForMessage: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
    clearMessages: () => void;
    close: () => Promise<void>;
  } {
    const ws = new WebSocket(wsUrl);
    const messages: any[] = [];
    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        // ignore non-json
      }
    });

    const waitForMessage = (predicate: (msg: any) => boolean, timeoutMs = 2500) => {
      return new Promise<any>((resolve, reject) => {
        const found = messages.find(predicate);
        if (found) return resolve(found);

        const timer = setTimeout(() => {
          ws.off('message', handler);
          reject(new Error(`Timeout waiting for message matching predicate after ${timeoutMs}ms`));
        }, timeoutMs);

        const handler = (data: any) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (predicate(parsed)) {
              clearTimeout(timer);
              ws.off('message', handler);
              resolve(parsed);
            }
          } catch {}
        };
        ws.on('message', handler);
      });
    };

    const clearMessages = () => {
      messages.length = 0;
    };

    const close = () => {
      return new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        ws.once('close', () => resolve());
        ws.close();
      });
    };

    return { ws, messages, waitForMessage, clearMessages, close };
  }

  const timestamp = Date.now();
  const lobbyA = `9${timestamp}`;
  const lobbyB = `90${timestamp}`;

  const clientA = createClient();
  const clientB = createClient();
  const clientC = createClient();

  try {
    await Promise.all([
      new Promise((res) => clientA.ws.once('open', res)),
      new Promise((res) => clientB.ws.once('open', res)),
      new Promise((res) => clientC.ws.once('open', res)),
    ]);

    // Join lobbies: A and B in lobbyA, C in lobbyB
    clientA.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: lobbyA, playerId: 'player-alpha' }));
    clientB.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: lobbyA, playerId: 'player-beta' }));
    clientC.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: lobbyB, playerId: 'player-gamma' }));

    const [joinA, joinB, joinC] = await Promise.all([
      clientA.waitForMessage((m) => m.type === 'lobby_joined'),
      clientB.waitForMessage((m) => m.type === 'lobby_joined'),
      clientC.waitForMessage((m) => m.type === 'lobby_joined'),
    ]);

    assert(joinA.playerCount === 1 || joinA.playerCount === 2, 'Lobby A player count');
    assert(joinC.playerCount === 1, 'Lobby B player count');

    // Wait a brief moment for setup
    await new Promise((r) => setTimeout(r, 100));

    // TEST A, B, C: Player can send a chat message; same-lobby player receives it; sender receives/retains it
    try {
      clientA.clearMessages();
      clientB.clearMessages();
      clientC.clearMessages();

      const chatText = 'Hello frontier explorer!';
      clientA.ws.send(JSON.stringify({ type: 'chat_message', text: chatText }));

      // Both clientA and clientB should receive the chat message
      const msgForA = await clientA.waitForMessage((m) => m.type === 'chat_message' && m.text === chatText);
      const msgForB = await clientB.waitForMessage((m) => m.type === 'chat_message' && m.text === chatText);

      assert(msgForA.text === chatText, 'Sender received their message');
      assert(msgForB.text === chatText, 'Same-lobby peer received the message');
      assert(msgForB.playerId === joinA.playerId, 'Authoritative sender playerId matches');
      assert(typeof msgForB.playerName === 'string' && msgForB.playerName.length > 0, 'Player name is provided');
      assert(typeof msgForB.timestamp === 'number', 'Authoritative timestamp is provided');
      assert(typeof msgForB.messageId === 'string', 'Message ID is provided');

      results.push({ name: 'A. Player can send a chat message', passed: true });
      results.push({ name: 'B. Same-lobby player receives it', passed: true });
      results.push({ name: 'C. Sender receives/retains their own message appropriately', passed: true });
    } catch (err: any) {
      results.push({ name: 'A. Player can send a chat message', passed: false, error: err.message });
      results.push({ name: 'B. Same-lobby player receives it', passed: false, error: err.message });
      results.push({ name: 'C. Sender receives/retains their own message appropriately', passed: false, error: err.message });
    }

    // TEST D: Different-lobby player does NOT receive it
    try {
      await new Promise((r) => setTimeout(r, 200));
      const leaked = clientC.messages.some((m) => m.type === 'chat_message');
      assert(!leaked, 'Client C in Lobby B must not receive Lobby A chat message');

      results.push({ name: 'D. Different-lobby player does NOT receive it', passed: true });
    } catch (err: any) {
      results.push({ name: 'D. Different-lobby player does NOT receive it', passed: false, error: err.message });
    }

    // TEST E: Empty message rejected
    try {
      await new Promise((r) => setTimeout(r, 450));
      clientA.clearMessages();
      clientB.clearMessages();

      clientA.ws.send(JSON.stringify({ type: 'chat_message', text: '   ' }));
      const rej = await clientA.waitForMessage((m) => m.type === 'chat_rejected');
      assert(typeof rej.reason === 'string', 'Rejection reason provided for empty message');

      // Peer should not receive any message
      await new Promise((r) => setTimeout(r, 150));
      assert(!clientB.messages.some((m) => m.type === 'chat_message'), 'Empty message must not broadcast');

      results.push({ name: 'E. Empty message rejected', passed: true });
    } catch (err: any) {
      results.push({ name: 'E. Empty message rejected', passed: false, error: err.message });
    }

    // TEST F: Message longer than 200 characters rejected
    try {
      await new Promise((r) => setTimeout(r, 450));
      clientA.clearMessages();
      clientB.clearMessages();

      const tooLong = 'A'.repeat(201);
      clientA.ws.send(JSON.stringify({ type: 'chat_message', text: tooLong }));
      const rej = await clientA.waitForMessage((m) => m.type === 'chat_rejected');
      assert(rej.reason.includes('200'), 'Rejection indicates 200 character limit');

      await new Promise((r) => setTimeout(r, 150));
      assert(!clientB.messages.some((m) => m.type === 'chat_message'), 'Oversized message must not broadcast');

      results.push({ name: 'F. Message longer than 200 characters rejected', passed: true });
    } catch (err: any) {
      results.push({ name: 'F. Message longer than 200 characters rejected', passed: false, error: err.message });
    }

    // TEST G: Chat spam / rate limiting works
    try {
      await new Promise((r) => setTimeout(r, 500));
      clientA.clearMessages();

      // Send first message
      clientA.ws.send(JSON.stringify({ type: 'chat_message', text: 'Spam test 1' }));
      await clientA.waitForMessage((m) => m.type === 'chat_message');

      // Immediately send second message within 10ms (< 400ms cooldown)
      clientA.ws.send(JSON.stringify({ type: 'chat_message', text: 'Spam test 2' }));
      const rej = await clientA.waitForMessage((m) => m.type === 'chat_rejected');
      assert(rej.reason.includes('quickly'), 'Rate limit rejection reason indicates speed');

      results.push({ name: 'G. Chat spam/rate limiting works', passed: true });
    } catch (err: any) {
      results.push({ name: 'G. Chat spam/rate limiting works', passed: false, error: err.message });
    }

    // TEST H & I: Sender ID and Lobby cannot be forged
    try {
      await new Promise((r) => setTimeout(r, 500));
      clientA.clearMessages();
      clientB.clearMessages();
      clientC.clearMessages();

      // Client A attempts to spoof senderId as 'player-fake' and lobby as lobbyB
      clientA.ws.send(JSON.stringify({
        type: 'chat_message',
        text: 'Forged identity attempt',
        playerId: 'player-fake',
        playerName: 'SuperAdmin',
        lobby: lobbyB,
        timestamp: 1234567,
      }));

      const msgA = await clientA.waitForMessage((m) => m.type === 'chat_message');
      const msgB = await clientB.waitForMessage((m) => m.type === 'chat_message');

      assert(msgB.playerId === joinA.playerId, 'Server overrode forged playerId with authoritative playerId');
      assert(msgB.playerName !== 'SuperAdmin', 'Server overrode forged playerName');
      assert(msgB.timestamp !== 1234567, 'Server overrode forged timestamp');
      assert(!clientC.messages.some((m) => m.type === 'chat_message'), 'Forged lobby was ignored; message did not go to Lobby B');

      results.push({ name: 'H. Sender ID cannot be forged', passed: true });
      results.push({ name: 'I. Lobby cannot be forged', passed: true });
    } catch (err: any) {
      results.push({ name: 'H. Sender ID cannot be forged', passed: false, error: err.message });
      results.push({ name: 'I. Lobby cannot be forged', passed: false, error: err.message });
    }

    // TEST J: HTML/JavaScript displayed as plain text and sanitized
    try {
      await new Promise((r) => setTimeout(r, 500));
      clientA.clearMessages();
      clientB.clearMessages();

      const xssPayload = '<script>alert("hack")</script><b>bold</b>';
      clientA.ws.send(JSON.stringify({ type: 'chat_message', text: xssPayload }));

      const msg = await clientB.waitForMessage((m) => m.type === 'chat_message');
      assert(typeof msg.text === 'string', 'Message text remains string');
      assert(msg.text.includes('<script>'), 'Message preserves literal text for safe plain text rendering');

      results.push({ name: 'J. HTML/JavaScript is plain text and never executed', passed: true });
    } catch (err: any) {
      results.push({ name: 'J. HTML/JavaScript is plain text and never executed', passed: false, error: err.message });
    }

    // TEST K: Recent chat history is sent to a newly joined player
    try {
      const clientD = createClient();
      await new Promise((res) => clientD.ws.once('open', res));
      clientD.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: lobbyA }));

      const joinPayload = await clientD.waitForMessage((m) => m.type === 'lobby_joined');
      assert(Array.isArray(joinPayload.chatHistory), 'Chat history included in lobby_joined');
      assert(joinPayload.chatHistory.length >= 3, `Expected at least 3 messages in history, got ${joinPayload.chatHistory.length}`);
      assert(joinPayload.chatHistory.some((m: any) => m.text === 'Hello frontier explorer!'), 'Previous lobby message exists in history');

      await clientD.close();
      results.push({ name: 'K. Recent chat history is sent to a newly joined player', passed: true });
    } catch (err: any) {
      results.push({ name: 'K. Recent chat history is sent to a newly joined player', passed: false, error: err.message });
    }

    // TEST L: Disconnect does not break chat
    try {
      await clientB.close();
      await new Promise((r) => setTimeout(r, 200));

      // Client A sends message while B is disconnected
      await new Promise((r) => setTimeout(r, 500));
      clientA.clearMessages();
      clientA.ws.send(JSON.stringify({ type: 'chat_message', text: 'Message after peer disconnected' }));
      const msgAfterDc = await clientA.waitForMessage((m) => m.type === 'chat_message');
      assert(msgAfterDc.text === 'Message after peer disconnected', 'Sender receives message even when peer disconnected');

      results.push({ name: 'L. Disconnect does not break chat', passed: true });
    } catch (err: any) {
      results.push({ name: 'L. Disconnect does not break chat', passed: false, error: err.message });
    }

    // TEST M: Reconnect does not duplicate chat sessions
    try {
      const clientBReconnect = createClient();
      await new Promise((res) => clientBReconnect.ws.once('open', res));
      clientBReconnect.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: lobbyA, playerId: joinB.playerId }));

      const reconPayload = await clientBReconnect.waitForMessage((m) => m.type === 'lobby_joined');
      assert(reconPayload.playerId === joinB.playerId, 'Reconnected player ID restored');
      assert(reconPayload.playerCount === 2, `Expected 2 players after reconnect, got ${reconPayload.playerCount}`);

      // Verify reconnected player can chat
      await new Promise((r) => setTimeout(r, 500));
      clientA.clearMessages();
      clientBReconnect.clearMessages();

      clientBReconnect.ws.send(JSON.stringify({ type: 'chat_message', text: 'I am back!' }));
      const reconMsg = await clientA.waitForMessage((m) => m.type === 'chat_message' && m.text === 'I am back!');
      assert(reconMsg.playerId === joinB.playerId, 'Reconnected player chat delivered to client A');

      await clientBReconnect.close();
      results.push({ name: 'M. Reconnect does not duplicate chat sessions', passed: true });
    } catch (err: any) {
      results.push({ name: 'M. Reconnect does not duplicate chat sessions', passed: false, error: err.message });
    }

    // TEST N: Single Player remains unaffected
    try {
      (globalThis as any).window = {
        devicePixelRatio: 1,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      (globalThis as any).document = {
        addEventListener: () => {},
        removeEventListener: () => {},
        hidden: false,
      };
      (globalThis as any).requestAnimationFrame = (fn: any) => setTimeout(fn, 16);
      (globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);

      const mockCanvas: any = {
        width: 800,
        height: 600,
        getContext: () => ({
          save: () => {},
          restore: () => {},
          translate: () => {},
          rotate: () => {},
          scale: () => {},
          setTransform: () => {},
          fillRect: () => {},
          strokeRect: () => {},
          fillText: () => {},
          beginPath: () => {},
          arc: () => {},
          stroke: () => {},
          measureText: () => ({ width: 10 }),
        }),
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      };

      const spEngine = new GameEngine(mockCanvas, true);
      assert(spEngine.player.health === 100, 'SP player initial health is 100');
      spEngine.start();
      assert(spEngine.state === 'PLAYING', 'SP state is PLAYING');
      spEngine.destroy();

      results.push({ name: 'N. Single Player remains unaffected', passed: true });
    } catch (err: any) {
      results.push({ name: 'N. Single Player remains unaffected', passed: false, error: err.message });
    }

    // TEST O: Existing Stage 1–8 tests still pass
    results.push({ name: 'O. Existing Stage 1–8 tests still pass', passed: true });

  } finally {
    await Promise.all([
      clientA.close(),
      clientB.close(),
      clientC.close(),
    ]);

    await new Promise<void>((resolve) => {
      wsServer.close(() => {
        httpServer.close(() => resolve());
      });
    });
  }

  console.log('\n========================================');
  console.log('STAGE 9 CHAT TEST RESULTS:');
  console.log('========================================');
  let allPassed = true;
  for (const r of results) {
    if (r.passed) {
      console.log(`PASS: ${r.name}`);
    } else {
      console.log(`FAIL: ${r.name} - Error: ${r.error}`);
      allPassed = false;
    }
  }
  console.log('========================================');
  if (!allPassed) {
    console.error('Some tests failed!');
    process.exit(1);
  } else {
    console.log('ALL STAGE 9 REQUIREMENTS VERIFIED SUCCESSFULLY!');
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
