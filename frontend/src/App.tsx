import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { LogsPage } from './components/LogsPage';
import { ControlsPage } from './components/ControlsPage';
import { SetupScreen } from './components/SetupScreen';
import { LockScreen } from './components/LockScreen';
import type { AccessLog, Command, DeviceStatus, AnalyticsStats } from './types';
import './App.css';

// Helper to construct a clean ISO date offset by hours
const getDateOffset = (hoursAgo: number) => {
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
};

const INITIAL_MOCK_LOGS: AccessLog[] = [
  {
    id: 1,
    timestamp: getDateOffset(0.1),
    status: 'SUCCESS',
    pin_attempts: 1,
    fp_attempts: 1,
    fp_slot_id: 3,
    image_id: 1,
    image: { id: 1, filename: 'img_auth_ok.jpg', filepath: '/images/img_auth_ok.jpg', captured_at: getDateOffset(0.1) }
  },
  {
    id: 2,
    timestamp: getDateOffset(1.5),
    status: 'FAIL_FP',
    pin_attempts: 1,
    fp_attempts: 3,
    fp_slot_id: null,
    image_id: 2,
    image: { id: 2, filename: 'img_intruder_fp.jpg', filepath: '/images/img_intruder_fp.jpg', captured_at: getDateOffset(1.5) }
  },
  {
    id: 3,
    timestamp: getDateOffset(4.2),
    status: 'SUCCESS',
    pin_attempts: 1,
    fp_attempts: 1,
    fp_slot_id: 12,
    image_id: 3,
    image: { id: 3, filename: 'img_auth_ok_2.jpg', filepath: '/images/img_auth_ok_2.jpg', captured_at: getDateOffset(4.2) }
  },
  {
    id: 4,
    timestamp: getDateOffset(8.0),
    status: 'LOCKOUT',
    pin_attempts: 3,
    fp_attempts: 0,
    fp_slot_id: null,
    image_id: 4,
    image: { id: 4, filename: 'img_bruteforce_lock.jpg', filepath: '/images/img_bruteforce_lock.jpg', captured_at: getDateOffset(8.0) }
  },
  {
    id: 5,
    timestamp: getDateOffset(12.5),
    status: 'FAIL_PIN',
    pin_attempts: 2,
    fp_attempts: 0,
    fp_slot_id: null,
    image_id: 6,
    image: { id: 6, filename: 'img_pin_attempt_fail.jpg', filepath: '/images/img_pin_attempt_fail.jpg', captured_at: getDateOffset(12.5) }
  },
  {
    id: 6,
    timestamp: getDateOffset(26.0), // yesterday
    status: 'SUCCESS',
    pin_attempts: 1,
    fp_attempts: 1,
    fp_slot_id: 3,
    image_id: 5,
    image: { id: 5, filename: 'img_yesterday_ok.jpg', filepath: '/images/img_yesterday_ok.jpg', captured_at: getDateOffset(26.0) }
  },
  {
    id: 7,
    timestamp: getDateOffset(30.0),
    status: 'FAIL_PIN',
    pin_attempts: 1,
    fp_attempts: 0,
    fp_slot_id: null,
    image_id: 7,
    image: { id: 7, filename: 'img_keypad_aborted.jpg', filepath: '/images/img_keypad_aborted.jpg', captured_at: getDateOffset(30.0) }
  }
];

const INITIAL_MOCK_COMMANDS: Command[] = [
  {
    id: 1,
    command_type: 'UNLOCK',
    payload: null,
    status: 'DONE',
    created_at: getDateOffset(2.0),
    updated_at: getDateOffset(2.0)
  },
  {
    id: 2,
    command_type: 'LOCKOUT',
    payload: null,
    status: 'DONE',
    created_at: getDateOffset(8.0),
    updated_at: getDateOffset(8.0)
  }
];

function App() {
  const [setupRequired, setSetupRequired] = useState(() => !localStorage.getItem('admin_password_hash'));
  const [sessionActive, setSessionActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'controls'>('logs');

  // Core App states loaded from/initialized with Mock Telemetry Data
  const [logs, setLogs] = useState<AccessLog[]>(INITIAL_MOCK_LOGS);
  const [commands, setCommands] = useState<Command[]>(INITIAL_MOCK_COMMANDS);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({
    last_seen: getDateOffset(0.1),
    status: 'online'
  });
  
  // Custom Unlock Visual Timer Overlay State
  const [showUnlockOverlay, setShowUnlockOverlay] = useState(false);
  
  // Custom PIN Reset Visual Overlay State
  const [showPinResetOverlay, setShowPinResetOverlay] = useState(false);

  // Inactivity Auto-Lock Telemetry Loop
  useEffect(() => {
    if (!sessionActive || setupRequired) return;

    let timeoutId: number;
    const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setSessionActive(false);
      }, INACTIVITY_TIMEOUT_MS);
    };

    // Initialize timer
    resetTimer();

    // Telemetry activity events to monitor
    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'click', 'touchstart'];
    const handleActivity = () => resetTimer();

    events.forEach(evt => window.addEventListener(evt, handleActivity));

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach(evt => window.removeEventListener(evt, handleActivity));
    };
  }, [sessionActive, setupRequired]);

  // Live Backend Polling Loop (Logs, Commands, and Device Status)
  useEffect(() => {
    if (!sessionActive || setupRequired) return;

    const fetchTelemetry = async () => {
      try {
        const logsRes = await fetch('/api/logs?per_page=50');
        if (logsRes.ok) {
          const logsJson = await logsRes.json();
          if (logsJson && Array.isArray(logsJson.data)) {
            setLogs(logsJson.data);
          }
        }
        
        const cmdRes = await fetch('/api/commands');
        if (cmdRes.ok) {
          const cmdJson = await cmdRes.json();
          if (Array.isArray(cmdJson)) {
            setCommands(cmdJson);
          }
        }
        
        const devRes = await fetch('/api/device/status');
        if (devRes.ok) {
          const devJson = await devRes.json();
          if (devJson && devJson.status) {
            setDeviceStatus(devJson);
          }
        }
      } catch (err) {
        // Backend temporarily offline or proxy not running; retain existing state
        console.warn('Telemetry poll error:', err);
      }
    };

    // Initial fetch on session activation
    fetchTelemetry();

    // Poll every 5 seconds
    const intervalId = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(intervalId);
  }, [sessionActive, setupRequired]);

  // Compute stats dynamically based on current local logs state
  const getStats = (): AnalyticsStats => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const todayLogs = logs.filter(l => new Date(l.timestamp) >= todayMidnight);
    const successes = logs.filter(l => l.status === 'SUCCESS').length;
    const failures = logs.filter(l => ['FAIL_PIN', 'FAIL_FP', 'LOCKOUT'].includes(l.status)).length;
    const lockouts = logs.filter(l => l.status === 'LOCKOUT').length;

    // Peak access hours calculation
    const hourlyCounts = Array.from({ length: 24 }).map((_, h) => {
      const count = logs.filter(l => new Date(l.timestamp).getHours() === h).length;
      return { hour: h, count };
    });

    // Longest fail streak calculation
    const sortedLogs = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let maxStreak = 0;
    let currentStreak = 0;
    
    for (const log of sortedLogs) {
      if (['FAIL_PIN', 'FAIL_FP', 'LOCKOUT'].includes(log.status)) {
        currentStreak++;
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
        }
      } else if (log.status === 'SUCCESS') {
        currentStreak = 0;
      }
    }

    return {
      total_today: todayLogs.length,
      successes,
      failures,
      lockouts,
      peak_hours: hourlyCounts,
      streak: maxStreak
    };
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Returns the fetch URL + init for a given command type / payload. */
  const buildCommandRequest = (type: Command['command_type'], payload?: string): [string, RequestInit] => {
    const base = '/api/commands';
    const json = (body: object): RequestInit => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const post = (): RequestInit => ({ method: 'POST' });

    switch (type) {
      case 'UNLOCK':   return [`${base}/unlock`,   post()];
      case 'LOCKOUT':  return [`${base}/lockout`,  post()];
      case 'RESET':    return [`${base}/reset`,    post()];
      case 'ENROLL': {
        if (payload && payload.startsWith('{')) {
          try {
            return [`${base}/enroll`, json(JSON.parse(payload))];
          } catch {
            return [`${base}/enroll`, post()];
          }
        }
        return [`${base}/enroll`, post()];
      }
      case 'UNENROLL': return [`${base}/unenroll`, json({ slot_id: Number(payload) })];
      case 'PIN_RESET':return [`${base}/pin_reset`,json({ pin: payload })];
    }
  };

  /** Run the local mock lifecycle when the backend is unreachable. */
  const runMockLifecycle = (cmdId: number, type: Command['command_type'], payload?: string) => {
    setTimeout(() => progressCommandStatus(cmdId, 'RELAYED'),       800);
    setTimeout(() => progressCommandStatus(cmdId, 'ACKNOWLEDGED'), 1500);
    setTimeout(() => {
      progressCommandStatus(cmdId, 'DONE');

      if (type === 'LOCKOUT') {
        setDeviceStatus({ status: 'locked_out', last_seen: new Date().toISOString() });
        const lockoutLog: AccessLog = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          status: 'LOCKOUT',
          pin_attempts: 0,
          fp_attempts: 0,
          fp_slot_id: null,
          image_id: 100,
          image: { id: 100, filename: 'img_emergency_override.jpg', filepath: '/images/img_bruteforce_lock.jpg', captured_at: new Date().toISOString() }
        };
        setLogs(prev => [lockoutLog, ...prev]);

      } else if (type === 'RESET') {
        setDeviceStatus({ status: 'online', last_seen: new Date().toISOString() });
        setLogs([]);
        setCommands([]);

      } else if (type === 'UNLOCK') {
        const successLog: AccessLog = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          status: 'SUCCESS',
          pin_attempts: 0,
          fp_attempts: 0,
          fp_slot_id: 0,
          image_id: 101,
          image: { id: 101, filename: 'img_manual_override.jpg', filepath: '/images/img_auth_ok.jpg', captured_at: new Date().toISOString() }
        };
        setLogs(prev => [successLog, ...prev]);

      } else if (type === 'UNENROLL' && payload) {
        const targetSlot = parseInt(payload);
        setLogs(prev => prev.map(log =>
          log.fp_slot_id === targetSlot ? { ...log, fp_slot_id: null } : log
        ));

      } else if (type === 'PIN_RESET') {
        setShowPinResetOverlay(true);
        setTimeout(() => setShowPinResetOverlay(false), 4000);
      }
    }, 2300);
  };

  // ── Command Dispatcher ────────────────────────────────────────────────────

  /**
   * Queues a command:
   *  1. Optimistically inserts a PENDING entry in local state (instant UI feedback).
   *  2. POSTs to the real Flask API endpoint.
   *     • On success → backend sets status to RELAYED and broadcasts to ESP32 via WS.
   *       The 5-second polling loop will sync the live status automatically.
   *     • On failure → falls back to the local mock lifecycle so the UI keeps working
   *       when the backend is offline during development.
   */
  const handleQueueCommand = async (type: Command['command_type'], payload?: string) => {
    const timestampStr = new Date().toISOString();
    const localId = Date.now(); // temporary local ID until we get the real one from the server
    const newCmd: Command = {
      id: localId,
      command_type: type,
      payload: payload || null,
      status: 'PENDING',
      created_at: timestampStr,
      updated_at: timestampStr
    };

    // 1. Optimistic insert
    setCommands(prev => [newCmd, ...prev]);
    setDeviceStatus(prev => ({ status: prev.status, last_seen: timestampStr }));

    // Show the solenoid unlock overlay immediately for UNLOCK commands
    if (type === 'UNLOCK') {
      setShowUnlockOverlay(true);
      setTimeout(() => setShowUnlockOverlay(false), 5000);
    }

    // 2. Hit the real backend
    try {
      const [url, init] = buildCommandRequest(type, payload);
      const res = await fetch(url, init);

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const serverCmd: Command = await res.json();

      // Replace the local placeholder with the real server record
      setCommands(prev =>
        prev.map(c => (c.id === localId ? serverCmd : c))
      );

      // Backend already set the command to RELAYED and queued the WebSocket broadcast.
      // The 5-second polling loop on /api/commands will keep syncing status from here.
      console.log(`[CMD] ${type} dispatched → server id #${serverCmd.id}, status: ${serverCmd.status}`);

    } catch (err) {
      // Backend offline or returned an error — fall back to mock simulation
      console.warn(`[CMD] Backend unreachable for ${type}, running mock lifecycle:`, err);
      runMockLifecycle(localId, type, payload);
    }
  };

  const handleCancelCommand = async (id: number) => {
    try {
      const res = await fetch(`/api/commands/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'FAILED' }),
      });
      if (res.ok) {
        setCommands(prev =>
          prev.map(c => (c.id === id ? { ...c, status: 'FAILED', updated_at: new Date().toISOString() } : c))
        );
        console.log(`[CMD] Command #${id} cancelled successfully.`);
      } else {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err) {
      console.warn(`[CMD] Failed to cancel command #${id} on backend, falling back to local:`, err);
      setCommands(prev =>
        prev.map(c => (c.id === id ? { ...c, status: 'FAILED', updated_at: new Date().toISOString() } : c))
      );
    }
  };

  const progressCommandStatus = (id: number, status: Command['status']) => {
    setCommands(prev =>
      prev.map(c => (c.id === id ? { ...c, status, updated_at: new Date().toISOString() } : c))
    );
  };

  const handleRefreshStatus = async () => {
    try {
      const devRes = await fetch('/api/device/status');
      if (devRes.ok) {
        const devJson = await devRes.json();
        if (devJson && devJson.status) {
          setDeviceStatus(devJson);
          return;
        }
      }
    } catch (err) {
      console.warn('Refresh status poll error:', err);
    }
    setDeviceStatus(prev => ({
      status: prev.status === 'locked_out' ? 'locked_out' : 'online',
      last_seen: new Date().toISOString()
    }));
  };

  if (setupRequired) {
    return <SetupScreen onSetupComplete={() => setSetupRequired(false)} />;
  }

  if (!sessionActive) {
    return <LockScreen onUnlock={() => setSessionActive(true)} />;
  }

  return (
    <div className="flex bg-background text-on-surface h-screen w-screen relative overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        deviceStatus={deviceStatus}
        onRefreshStatus={handleRefreshStatus}
        onLockSession={() => setSessionActive(false)}
      />

      {/* Main Panel Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {activeTab === 'logs' ? (
          <LogsPage logs={logs} stats={getStats()} />
        ) : (
          <ControlsPage
            deviceStatus={deviceStatus}
            commands={commands}
            onQueueCommand={handleQueueCommand}
            onCancelCommand={handleCancelCommand}
            onRefreshStatus={handleRefreshStatus}
          />
        )}
      </main>

      {/* Modern High-Tech Solenoid Unlocking Feedback Frame */}
      {showUnlockOverlay && (
        <div className="absolute inset-0 bg-secure/10 backdrop-blur-xs flex items-center justify-center pointer-events-none z-40 transition duration-300">
          <div className="bg-surface border-2 border-secure/60 px-8 py-6 rounded-lg text-center shadow-2xl relative">
            <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-secure rounded-full animate-ping"></div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-secure animate-pulse">Solenoid Lock Disengaged</h2>
            <p className="text-[10px] text-outline uppercase tracking-wider font-mono mt-1">Actuator trigger fires. Relocking in 5 seconds.</p>
          </div>
        </div>
      )}

      {/* Modern High-Tech PIN Update Success Feedback Frame */}
      {showPinResetOverlay && (
        <div className="absolute inset-0 bg-primary/10 backdrop-blur-xs flex items-center justify-center pointer-events-none z-40 transition duration-300">
          <div className="bg-surface border-2 border-primary/60 px-8 py-6 rounded-lg text-center shadow-2xl relative">
            <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-primary rounded-full animate-ping"></div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary animate-pulse">Keypad PIN Updated</h2>
            <p className="text-[10px] text-outline uppercase tracking-wider font-mono mt-1">EEPROM memory rewritten successfully on physical Uno device.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
