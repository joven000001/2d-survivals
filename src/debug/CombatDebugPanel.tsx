import { useEffect, useState } from 'react';

type DebugMessage = {
  time: string;
  message: string;
};

export default function CombatDebugPanel() {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const handleDebug = (event: Event) => {
      const customEvent = event as CustomEvent<{
        message?: string;
      }>;

      const message = customEvent.detail?.message;

      if (!message) return;

      setMessages((old) => [
        ...old.slice(-99),
        {
          time: new Date().toLocaleTimeString(),
          message,
        },
      ]);
    };

    window.addEventListener('combat-debug', handleDebug);

    return () => {
      window.removeEventListener('combat-debug', handleDebug);
    };
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 12,
          bottom: 12,
          zIndex: 99999,
          padding: '8px 12px',
          background: '#111827',
          color: 'white',
          border: '1px solid #4b5563',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        🛠️ Debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        width: 420,
        maxHeight: 300,
        zIndex: 99999,
        background: 'rgba(10, 15, 20, 0.95)',
        color: '#d1fae5',
        border: '1px solid #374151',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,.5)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: '#1f2937',
          color: 'white',
          fontWeight: 'bold',
        }}
      >
        <span>🛠️ COMBAT DEBUG</span>

        <div>
          <button
            onClick={() => setMessages([])}
            style={{
              marginRight: 6,
              background: '#374151',
              color: 'white',
              border: 0,
              padding: '3px 7px',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>

          <button
            onClick={() => setOpen(false)}
            style={{
              background: '#7f1d1d',
              color: 'white',
              border: 0,
              padding: '3px 7px',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div
        style={{
          padding: 8,
          maxHeight: 250,
          overflowY: 'auto',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: '#9ca3af' }}>
            Waiting for combat events...
          </div>
        ) : (
          messages.map((item, index) => (
            <div key={index} style={{ marginBottom: 5 }}>
              <span style={{ color: '#6b7280' }}>
                [{item.time}]
              </span>{' '}
              {item.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}