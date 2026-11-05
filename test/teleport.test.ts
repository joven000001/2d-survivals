import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { setupMultiplayerWebSocket } from '../server/index';

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
  console.log('--- STARTING PLAYER-TO-PLAYER TELEPORTATION TEST SUITE ---');

  const httpServer = createServer();
  const wsServer = setupMultiplayerWebSocket(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Invalid address');
  const port = address.port;
  const wsUrl = `ws://127.0.0.1:${port}`;
  const createdClients: Array<{ close: () => Promise<void> }> = [];

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

    const waitForMessage = (predicate: (msg: any) => boolean, timeoutMs = 3000) => {
      return new Promise<any>((resolve, reject) => {
        const found = messages.find(predicate);
        if (found) return resolve(found);

        const timer = setTimeout(() => {
          ws.off('message', handler);
          reject(new Error(`Timeout (${timeoutMs}ms) waiting for message`));
        }, timeoutMs);

        const handler = (data: any) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (predicate(parsed)) {
              clearTimeout(timer);
              ws.off('message', handler);
              resolve(parsed);
            }
          } catch {
            // ignore
          }
        };

        ws.on('message', handler);
      });
    };

    const clearMessages = () => {
      messages.length = 0;
    };

    const close = () => {
      return new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.on('close', () => resolve());
          ws.close();
        } else {
          resolve();
        }
      });
    };

    const client = { ws, messages, waitForMessage, clearMessages, close };
    createdClients.push(client);
    return client;
  }

  const lobbyName = '999888';

  try {
    // 1. Connect Player A and Player B to the same lobby
    const playerA = createClient();
    const playerB = createClient();

    await new Promise<void>((resolve) => playerA.ws.on('open', () => resolve()));
    await new Promise<void>((resolve) => playerB.ws.on('open', () => resolve()));

    playerA.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName, displayName: 'Alice' }));
    const aJoined = await playerA.waitForMessage((m) => m.type === 'lobby_joined');
    assert(aJoined.success, 'Player A must successfully join lobby');
    const playerAId = aJoined.playerId;

    playerB.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName, displayName: 'Bob' }));
    const bJoined = await playerB.waitForMessage((m) => m.type === 'lobby_joined');
    assert(bJoined.success, 'Player B must successfully join lobby');
    const playerBId = bJoined.playerId;

    results.push({ name: '1. Players connect and join shared lobby', passed: true });

    // 2. Player A sends teleport request to Player B
    const req1Id = 'req_test_001_abcd1234';
    playerA.clearMessages();
    playerB.clearMessages();

    playerA.ws.send(JSON.stringify({
      type: 'teleport_request',
      requestId: req1Id,
      targetPlayerId: playerBId,
    }));

    const aSent = await playerA.waitForMessage((m) => m.type === 'teleport_request_sent' && m.requestId === req1Id);
    assert(aSent.targetPlayerId === playerBId, 'teleport_request_sent must confirm target');

    const bReceived = await playerB.waitForMessage((m) => m.type === 'teleport_request_received' && m.requestId === req1Id);
    assert(bReceived.requesterPlayerId === playerAId, 'teleport_request_received must include requester ID');
    assert(bReceived.expiresInMs === 15000, 'expiresInMs must be 15 seconds');

    results.push({ name: '2. Teleport request delivered to Player B with 15s expiry', passed: true });

    // 3. Duplicate request prevention
    const reqDupId = 'req_test_dup_99998888';
    playerA.ws.send(JSON.stringify({
      type: 'teleport_request',
      requestId: reqDupId,
      targetPlayerId: playerBId,
    }));
    const dupFailed = await playerA.waitForMessage((m) => m.type === 'teleport_request_failed' && m.requestId === reqDupId);
    assert(dupFailed.reason.includes('already'), 'Duplicate request must be rejected');

    results.push({ name: '3. Duplicate request from same requester prevented', passed: true });

    // 4. Player B cancels/rejects the request -> Player A receives "Teleport request cancelled."
    playerA.clearMessages();
    playerB.ws.send(JSON.stringify({
      type: 'teleport_request_response',
      requestId: req1Id,
      accept: false,
    }));

    const aCancelled = await playerA.waitForMessage((m) => m.type === 'teleport_request_result' && m.requestId === req1Id);
    assert(aCancelled.accepted === false, 'Result must be rejected');
    assert(aCancelled.reason === 'Teleport request cancelled.', `Expected "Teleport request cancelled.", got "${aCancelled.reason}"`);

    results.push({ name: '4. Player B cancels request -> Player A receives "Teleport request cancelled."', passed: true });

    // 5. Acceptance flow: Player B moves, Player A requests, Player B accepts
    playerB.ws.send(JSON.stringify({
      type: 'player_move',
      x: 320,
      y: 160,
      facingRight: true,
    }));
    await new Promise((r) => setTimeout(r, 60));

    const req2Id = 'req_test_002_accept123';
    playerA.clearMessages();
    playerB.clearMessages();

    playerA.ws.send(JSON.stringify({
      type: 'teleport_request',
      requestId: req2Id,
      targetPlayerId: playerBId,
    }));

    await playerB.waitForMessage((m) => m.type === 'teleport_request_received' && m.requestId === req2Id);

    playerB.ws.send(JSON.stringify({
      type: 'teleport_request_response',
      requestId: req2Id,
      accept: true,
    }));

    const aResult = await playerA.waitForMessage((m) => m.type === 'teleport_request_result' && m.requestId === req2Id);
    assert(aResult.accepted === true, 'Teleport must be accepted');
    assert(aResult.x === 320 && aResult.y === 160, 'Teleport result must provide Player B coordinates');

    results.push({ name: '5. Player B accepts -> Player A receives Player B coordinates', passed: true });

    // 6. Test safety: only Player B can respond to request intended for Player B
    const playerC = createClient();
    await new Promise<void>((resolve) => playerC.ws.on('open', () => resolve()));
    playerC.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName, displayName: 'Charlie' }));
    await playerC.waitForMessage((m) => m.type === 'lobby_joined');

    const req3Id = 'req_test_003_secure123';
    playerA.clearMessages();
    playerA.ws.send(JSON.stringify({
      type: 'teleport_request',
      requestId: req3Id,
      targetPlayerId: playerBId,
    }));
    await playerB.waitForMessage((m) => m.type === 'teleport_request_received' && m.requestId === req3Id);

    // Player C attempts to accept request meant for Player B
    playerC.ws.send(JSON.stringify({
      type: 'teleport_request_response',
      requestId: req3Id,
      accept: true,
    }));

    // Verify Player A does not get accepted by Charlie
    await new Promise((r) => setTimeout(r, 200));
    assert(!playerA.messages.some((m) => m.type === 'teleport_request_result' && m.accepted === true), 'Only target can respond');

    // Clean up req3 by having Player B cancel it
    playerB.ws.send(JSON.stringify({
      type: 'teleport_request_response',
      requestId: req3Id,
      accept: false,
    }));
    await playerA.waitForMessage((m) => m.type === 'teleport_request_result' && m.requestId === req3Id);

    results.push({ name: '6. Only target player can accept or reject the request', passed: true });

  } catch (err: any) {
    results.push({ name: 'Unexpected test failure', passed: false, error: err.message });
  } finally {
    await Promise.all(createdClients.map((client) => client.close()));
    await new Promise<void>((resolve) => {
      wsServer.close(() => {
        httpServer.close(() => resolve());
      });
    });
  }

  console.log('\n========================================');
  console.log('TELEPORT TEST RESULTS:');
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
    process.exit(1);
  } else {
    console.log('ALL TELEPORT REQUIREMENTS VERIFIED SUCCESSFULLY!');
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
