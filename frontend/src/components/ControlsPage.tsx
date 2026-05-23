import React, { useState } from 'react';
import { KeyRound, AlertTriangle, Trash2, ShieldAlert, RotateCcw, Unlock, CheckCircle2, Clock, Play } from 'lucide-react';
import type { Command, DeviceStatus } from '../types';
import { PasswordModal } from './PasswordModal';

interface ControlsPageProps {
  deviceStatus: DeviceStatus;
  commands: Command[];
  onQueueCommand: (type: Command['command_type'], payload?: string) => void;
  onRefreshStatus: () => void;
}

export const ControlsPage: React.FC<ControlsPageProps> = ({
  deviceStatus,
  commands,
  onQueueCommand,
  onRefreshStatus
}) => {
  const [resetConfirm, setResetConfirm] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(0);
  
  // Security Modal Orchestration State
  const [secModalOpen, setSecModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: Command['command_type'];
    payload?: string;
    title: string;
  } | null>(null);

  const triggerSecurityChallenge = (type: Command['command_type'], payload?: string, title = '') => {
    setPendingAction({ type, payload, title });
    setSecModalOpen(true);
  };

  const handleSecuritySuccess = () => {
    if (pendingAction) {
      onQueueCommand(pendingAction.type, pendingAction.payload);
      if (pendingAction.type === 'RESET') {
        setResetConfirm('');
      }
      setPendingAction(null);
    }
  };

  const getCommandStatusBadge = (status: Command['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-pending/10 text-pending border border-pending/20 text-[9px] font-bold uppercase tracking-wider">
            <Clock className="w-2.5 h-2.5" />
            Pending
          </span>
        );
      case 'RELAYED':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[9px] font-bold uppercase tracking-wider">
            <Play className="w-2.5 h-2.5 animate-pulse" />
            Relayed
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary-container/10 text-secondary border border-secondary-container/20 text-[9px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping"></span>
            Acked
          </span>
        );
      case 'DONE':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secure/15 text-secure border border-secure/30 text-[9px] font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Success
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-lockout/15 text-lockout border border-lockout/30 text-[9px] font-bold uppercase tracking-wider">
            <AlertTriangle className="w-2.5 h-2.5" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const activeEnrollCommand = commands.find(c => c.command_type === 'ENROLL' && ['PENDING', 'RELAYED', 'ACKNOWLEDGED'].includes(c.status));

  return (
    <div className="flex-1 p-6 flex flex-col lg:flex-row gap-6 overflow-y-auto">
      {/* 1. Left Column: Action Overrides Panels */}
      <div className="flex-1 space-y-6">
        <div className="border-b border-outline-variant pb-4">
          <h2 className="text-lg font-bold uppercase tracking-wider text-on-surface">Security Command Center</h2>
          <p className="text-[10px] text-outline uppercase tracking-widest font-mono">Hardware override and biometrics configuration</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Remote Unlock Control */}
          <div className="bg-surface border border-outline-variant p-5 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] uppercase font-bold text-outline tracking-wider">Override Actuator</span>
                <Unlock className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-on-surface uppercase mb-1">Instant Unlock</h3>
              <p className="text-xs text-on-surface-variant leading-normal">
                Instructs the physical Uno controller to fire the relay trigger and open the solenoid lock for 5 seconds.
              </p>
            </div>
            <button
              onClick={() => triggerSecurityChallenge('UNLOCK', undefined, 'Remote unlock physical safe')}
              className="mt-6 w-full py-1.5 bg-primary-container hover:bg-primary-container/90 text-on-primary-container text-xs font-bold uppercase tracking-wider rounded transition"
            >
              Fire Relay
            </button>
          </div>

          {/* Card 2: Biometrics Enrollment */}
          <div className="bg-surface border border-outline-variant p-5 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] uppercase font-bold text-outline tracking-wider">AS608 Module</span>
                <KeyRound className="w-4 h-4 text-secure" />
              </div>
              <h3 className="text-sm font-semibold text-on-surface uppercase mb-1">Enroll Fingerprint</h3>
              <p className="text-xs text-on-surface-variant leading-normal">
                Puts the safe into learning mode to scan and save a new fingerprint pattern onto the next available slot.
              </p>
            </div>
            {activeEnrollCommand ? (
              <div className="mt-6 flex items-center justify-center gap-2 py-1.5 bg-surface-container border border-outline-variant text-[11px] font-semibold text-primary rounded font-mono">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                {activeEnrollCommand.status === 'PENDING' ? 'QUEUEING NODE...' : 'WAITING FOR PHYSICAL SCAN...'}
              </div>
            ) : (
              <button
                onClick={() => triggerSecurityChallenge('ENROLL', undefined, 'Enroll new fingerprint template')}
                className="mt-6 w-full py-1.5 bg-surface-container border border-outline-variant hover:border-primary text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-primary rounded transition"
              >
                Scan Fingerprint
              </button>
            )}
          </div>

          {/* Card 3: Fingerprint Template Deletion */}
          <div className="bg-surface border border-outline-variant p-5 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] uppercase font-bold text-outline tracking-wider">Template Removal</span>
                <Trash2 className="w-4 h-4 text-lockout" />
              </div>
              <h3 className="text-sm font-semibold text-on-surface uppercase mb-1">Unenroll Slot</h3>
              <p className="text-xs text-on-surface-variant leading-normal mb-3">
                Removes the biometrics template registered in the database and sensor's internal memory slot.
              </p>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-outline font-semibold uppercase">Slot ID:</span>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(parseInt(e.target.value))}
                  className="bg-background border border-outline-variant focus:border-primary rounded px-2 py-1 text-xs text-on-surface outline-none transition font-semibold"
                >
                  {Array.from({ length: 128 }).map((_, idx) => (
                    <option key={idx} value={idx}>
                      Slot {idx.toString().padStart(3, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={() => triggerSecurityChallenge('UNENROLL', selectedSlot.toString(), `Delete fingerprint template at Slot ${selectedSlot}`)}
              className="mt-6 w-full py-1.5 bg-surface-container border border-outline-variant hover:border-lockout hover:text-lockout hover:bg-lockout/5 text-xs font-bold uppercase tracking-wider text-on-surface-variant rounded transition"
            >
              Delete Template
            </button>
          </div>

          {/* Card 4: Lockout Override */}
          <div className="bg-surface border border-outline-variant p-5 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] uppercase font-bold text-outline tracking-wider">System State Override</span>
                <ShieldAlert className="w-4 h-4 text-lockout" />
              </div>
              <h3 className="text-sm font-semibold text-on-surface uppercase mb-1">Force System Lockout</h3>
              <p className="text-xs text-on-surface-variant leading-normal">
                Instantly locks out all physical inputs (keypad PINs, fingerprint scans) and triggers alarm indicators.
              </p>
            </div>
            {deviceStatus.status === 'locked_out' ? (
              <button
                onClick={() => triggerSecurityChallenge('RESET', undefined, 'Clear active safe lockout')}
                className="mt-6 w-full py-1.5 bg-secure hover:bg-secure/95 text-background text-xs font-bold uppercase tracking-wider rounded transition"
              >
                Clear Lockout
              </button>
            ) : (
              <button
                onClick={() => triggerSecurityChallenge('LOCKOUT', undefined, 'Trigger hardware emergency lockout')}
                className="mt-6 w-full py-1.5 bg-lockout hover:bg-lockout/90 text-on-surface text-xs font-bold uppercase tracking-wider rounded transition"
              >
                Trigger Lockout
              </button>
            )}
          </div>
        </div>

        {/* Card 5: Danger Zone Full Reset */}
        <div className="bg-surface border border-lockout/20 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-lockout/10 pb-3">
            <div className="p-1.5 bg-lockout/10 rounded text-lockout border border-lockout/20">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-lockout">System Factory Reset</h3>
              <p className="text-[10px] text-outline uppercase tracking-widest font-mono">Restricted emergency procedure</p>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant leading-normal">
            Clears the entire database (erases access logs, command queues, camera images) and instructs the microcontroller memory buffer to restore all factory defaults.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[9px] uppercase font-bold text-outline tracking-wider mb-1.5">
                Type "RESET" to confirm:
              </label>
              <input
                type="text"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="RESET"
                className="w-full bg-background border border-outline-variant focus:border-lockout focus:ring-1 focus:ring-lockout rounded py-1 px-3 text-xs text-on-surface placeholder:text-outline/20 outline-none transition font-mono"
              />
            </div>
            <button
              disabled={resetConfirm !== 'RESET'}
              onClick={() => triggerSecurityChallenge('RESET', undefined, 'Execute factory database and system reset')}
              className="px-5 py-1.5 bg-surface-container border border-outline-variant hover:border-lockout hover:text-lockout hover:bg-lockout/5 disabled:hover:bg-surface-container disabled:hover:border-outline-variant disabled:hover:text-outline/40 disabled:opacity-20 text-xs font-bold uppercase tracking-wider text-on-surface-variant rounded transition disabled:cursor-not-allowed shrink-0"
            >
              Execute Reset
            </button>
          </div>
        </div>
      </div>

      {/* 2. Right Column: Command Queue History Telemetry Log */}
      <div className="w-full lg:w-[350px] bg-surface border border-outline-variant p-5 rounded-lg flex flex-col justify-between shrink-0 h-[calc(100vh-120px)] lg:h-auto overflow-hidden">
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex justify-between items-center border-b border-outline-variant pb-3 mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">Command Dispatch</h3>
              <p className="text-[9px] text-outline uppercase tracking-widest font-mono">Live hardware queue history</p>
            </div>
            <button
              onClick={onRefreshStatus}
              title="Refresh queue"
              className="p-1 text-[10px] font-semibold text-primary hover:text-primary-container uppercase transition"
            >
              Refresh
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {commands.length === 0 ? (
              <div className="h-full flex items-center justify-center text-outline text-xs font-mono py-12">
                QUEUE IS CURRENTLY EMPTY
              </div>
            ) : (
              commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="bg-surface-container-low border border-outline-variant p-3 rounded flex flex-col gap-2 relative overflow-hidden"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[11px] font-bold text-on-surface uppercase font-mono tracking-wide">
                        {cmd.command_type}
                      </span>
                      {cmd.payload && (
                        <span className="ml-2 px-1 py-0.5 bg-background border border-outline-variant rounded font-mono text-[9px] text-outline">
                          ID {cmd.payload.padStart(3, '0')}
                        </span>
                      )}
                    </div>
                    {getCommandStatusBadge(cmd.status)}
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-outline font-mono mt-1">
                    <span>Sent: {new Date(cmd.created_at).toLocaleTimeString()}</span>
                    <span>Sync: {new Date(cmd.updated_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Global Security Prompt Gate */}
      <PasswordModal
        isOpen={secModalOpen}
        onClose={() => {
          setSecModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={handleSecuritySuccess}
        actionTitle={pendingAction?.title}
      />
    </div>
  );
};
