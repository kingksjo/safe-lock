import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { LogsPage } from './components/LogsPage';
import { ControlsPage } from './components/ControlsPage';
import { SetupScreen } from './components/SetupScreen';
import { LockScreen } from './components/LockScreen';
import type { AccessLog, Command, DeviceStatus, AnalyticsStats } from './types';
import './App.css';

// SVG Views Telemetry Data URIs
const MOCK_SCANNER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%230c0e14"/><path d="M40 40 L80 40 M40 40 L40 80" stroke="%230ea5e9" stroke-width="2" fill="none"/><path d="M360 40 L320 40 M360 40 L360 80" stroke="%230ea5e9" stroke-width="2" fill="none"/><path d="M40 260 L80 260 M40 260 L40 220" stroke="%230ea5e9" stroke-width="2" fill="none"/><path d="M360 260 L320 260 M360 260 L360 220" stroke="%230ea5e9" stroke-width="2" fill="none"/><circle cx="200" cy="150" r="50" stroke="%2314b8a6" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/><path d="M120 150 L280 150" stroke="%23ef4444" stroke-width="1" stroke-dasharray="2 2"/><text x="200" y="270" fill="%2388929b" font-family="monospace" font-size="10" text-anchor="middle" letter-spacing="2">GRANTEE VERIFIED - AUTH 200</text></svg>`;

const MOCK_INTRUDER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%230c0e14"/><path d="M40 40 L80 40 M40 40 L40 80" stroke="%23ef4444" stroke-width="2" fill="none"/><path d="M360 40 L320 40 M360 40 L360 80" stroke="%23ef4444" stroke-width="2" fill="none"/><path d="M40 260 L80 260 M40 260 L40 220" stroke="%23ef4444" stroke-width="2" fill="none"/><path d="M360 260 L320 260 M360 260 L360 220" stroke="%23ef4444" stroke-width="2" fill="none"/><circle cx="200" cy="150" r="60" stroke="%23ef4444" stroke-width="2" fill="none"/><path d="M150 100 L250 200 M250 100 L150 200" stroke="%23ef4444" stroke-width="1.5"/><text x="200" y="270" fill="%23ef4444" font-family="monospace" font-size="10" text-anchor="middle" letter-spacing="2">INTRUDER DISCOVERED - STATE LOCK</text></svg>`;

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
    image: { id: 1, filename: 'img_auth_ok.jpg', filepath: MOCK_SCANNER_SVG, captured_at: getDateOffset(0.1) }
  },
  {
    id: 2,
    timestamp: getDateOffset(1.5),
    status: 'FAIL_FP',
    pin_attempts: 1,
    fp_attempts: 3,
    fp_slot_id: null,
    image_id: 2,
    image: { id: 2, filename: 'img_intruder_fp.jpg', filepath: MOCK_INTRUDER_SVG, captured_at: getDateOffset(1.5) }
  },
  {
    id: 3,
    timestamp: getDateOffset(4.2),
    status: 'SUCCESS',
    pin_attempts: 1,
    fp_attempts: 1,
    fp_slot_id: 12,
    image_id: 3,
    image: { id: 3, filename: 'img_auth_ok_2.jpg', filepath: MOCK_SCANNER_SVG, captured_at: getDateOffset(4.2) }
  },
  {
    id: 4,
    timestamp: getDateOffset(8.0),
    status: 'LOCKOUT',
    pin_attempts: 3,
    fp_attempts: 0,
    fp_slot_id: null,
    image_id: 4,
    image: { id: 4, filename: 'img_bruteforce_lock.jpg', filepath: MOCK_INTRUDER_SVG, captured_at: getDateOffset(8.0) }
  },
  {
    id: 5,
    timestamp: getDateOffset(12.5),
    status: 'FAIL_PIN',
    pin_attempts: 2,
    fp_attempts: 0,
    fp_slot_id: null,
    image_id: null,
    image: null
  },
  {
    id: 6,
    timestamp: getDateOffset(26.0), // yesterday
    status: 'SUCCESS',
    pin_attempts: 1,
    fp_attempts: 1,
    fp_slot_id: 3,
    image_id: 5,
    image: { id: 5, filename: 'img_yesterday_ok.jpg', filepath: MOCK_SCANNER_SVG, captured_at: getDateOffset(26.0) }
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
  const [setupRequired, setSetupRequired] = useState(true);
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

  // Check if admin password setup has been completed
  useEffect(() => {
    const hash = localStorage.getItem('admin_password_hash');
    if (hash) {
      setSetupRequired(false);
    }
  }, []);

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

  // Mock Command Lifecycle Dispatcher
  const handleQueueCommand = (type: Command['command_type'], payload?: string) => {
    const timestampStr = new Date().toISOString();
    const newCmd: Command = {
      id: commands.length > 0 ? Math.max(...commands.map(c => c.id)) + 1 : 1,
      command_type: type,
      payload: payload || null,
      status: 'PENDING',
      created_at: timestampStr,
      updated_at: timestampStr
    };

    setCommands(prev => [newCmd, ...prev]);
    setDeviceStatus(prev => ({
      status: prev.status,
      last_seen: timestampStr
    }));

    // Trigger visual Unlock countdown frame
    if (type === 'UNLOCK') {
      setShowUnlockOverlay(true);
      setTimeout(() => setShowUnlockOverlay(false), 5000);
    }

    // Simulate lifecycle progress on the command:
    // PENDING -> RELAYED (800ms) -> ACKNOWLEDGED (1500ms) -> DONE (2300ms)
    setTimeout(() => {
      progressCommandStatus(newCmd.id, 'RELAYED');
    }, 800);

    setTimeout(() => {
      progressCommandStatus(newCmd.id, 'ACKNOWLEDGED');
    }, 1500);

    setTimeout(() => {
      progressCommandStatus(newCmd.id, 'DONE');
      
      // Update local states dynamically depending on action
      if (type === 'LOCKOUT') {
        setDeviceStatus({
          status: 'locked_out',
          last_seen: new Date().toISOString()
        });
        
        // Append a lockout event log to telemetry list
        const lockoutLog: AccessLog = {
          id: logs.length > 0 ? Math.max(...logs.map(l => l.id)) + 1 : 1,
          timestamp: new Date().toISOString(),
          status: 'LOCKOUT',
          pin_attempts: 0,
          fp_attempts: 0,
          fp_slot_id: null,
          image_id: 100,
          image: { id: 100, filename: 'img_emergency_override.jpg', filepath: MOCK_INTRUDER_SVG, captured_at: new Date().toISOString() }
        };
        setLogs(prev => [lockoutLog, ...prev]);

      } else if (type === 'RESET') {
        // Factory reset: restore default hardware statuses and empty log lists
        setDeviceStatus({
          status: 'online',
          last_seen: new Date().toISOString()
        });
        setLogs([]);
        setCommands([]);
      } else if (type === 'UNLOCK') {
        // Mock unlock action adds a successful access log entry to telemetry
        const successLog: AccessLog = {
          id: logs.length > 0 ? Math.max(...logs.map(l => l.id)) + 1 : 1,
          timestamp: new Date().toISOString(),
          status: 'SUCCESS',
          pin_attempts: 0,
          fp_attempts: 0,
          fp_slot_id: 0, // slot 0 represents physical key/override
          image_id: 101,
          image: { id: 101, filename: 'img_manual_override.jpg', filepath: MOCK_SCANNER_SVG, captured_at: new Date().toISOString() }
        };
        setLogs(prev => [successLog, ...prev]);
      } else if (type === 'UNENROLL' && payload) {
        // Remove templates from log lists
        const targetSlot = parseInt(payload);
        setLogs(prev => prev.map(log => {
          if (log.fp_slot_id === targetSlot) {
            return { ...log, fp_slot_id: null };
          }
          return log;
        }));
      }
    }, 2300);
  };

  const progressCommandStatus = (id: number, status: Command['status']) => {
    setCommands(prev =>
      prev.map(c => (c.id === id ? { ...c, status, updated_at: new Date().toISOString() } : c))
    );
  };

  const handleRefreshStatus = () => {
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
    </div>
  );
}

export default App;
