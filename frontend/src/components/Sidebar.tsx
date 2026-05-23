import React from 'react';
import { Terminal, Database, Sliders, RefreshCw, LogOut } from 'lucide-react';
import type { DeviceStatus } from '../types';

interface SidebarProps {
  activeTab: 'logs' | 'controls';
  setActiveTab: (tab: 'logs' | 'controls') => void;
  deviceStatus: DeviceStatus;
  onRefreshStatus: () => void;
  onLockSession: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  deviceStatus,
  onRefreshStatus,
  onLockSession
}) => {
  
  const getStatusColor = () => {
    switch (deviceStatus.status) {
      case 'online':
        return 'bg-secure/15 text-secure border-secure/30';
      case 'locked_out':
        return 'bg-lockout/15 text-lockout border-lockout/30';
      case 'offline':
      default:
        return 'bg-pending/15 text-pending border-pending/30';
    }
  };

  const getStatusLabel = () => {
    switch (deviceStatus.status) {
      case 'online':
        return 'Online';
      case 'locked_out':
        return 'Locked Out';
      case 'offline':
      default:
        return 'Offline';
    }
  };

  return (
    <aside className="w-[260px] bg-surface border-r border-outline-variant min-h-screen flex flex-col justify-between shrink-0">
      <div>
        {/* Logo Section */}
        <div className="p-6 border-b border-outline-variant flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded border border-primary/20 text-primary">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-on-surface uppercase">SafeLock</h1>
            <p className="text-[9px] text-outline uppercase tracking-widest font-mono">Telemetry Node v1.1</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="mt-6 px-3 space-y-1">
          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs uppercase font-semibold tracking-wider rounded transition relative ${
              activeTab === 'logs'
                ? 'text-primary bg-primary/5 border-l-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border-l-2 border-transparent'
            }`}
          >
            <Database className="w-4 h-4" />
            Access Telemetry
          </button>

          <button
            onClick={() => setActiveTab('controls')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs uppercase font-semibold tracking-wider rounded transition relative ${
              activeTab === 'controls'
                ? 'text-primary bg-primary/5 border-l-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border-l-2 border-transparent'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Security Overrides
          </button>
        </nav>
      </div>

      {/* Device Status & Controls Telemetry Footer */}
      <div className="p-4 border-t border-outline-variant bg-surface-container-lowest/50 space-y-4">
        <div>
          <span className="block text-[10px] uppercase font-bold text-outline tracking-wider mb-2">
            Hardware Node
          </span>
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getStatusColor()}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                deviceStatus.status === 'online' ? 'bg-secure animate-pulse' :
                deviceStatus.status === 'locked_out' ? 'bg-lockout' : 'bg-pending'
              }`}></span>
              {getStatusLabel()}
            </div>
            
            <button
              onClick={onRefreshStatus}
              title="Poll hardware state"
              className="p-1.5 bg-surface-container border border-outline-variant hover:border-primary rounded text-on-surface-variant hover:text-primary transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="text-[10px] text-outline font-mono space-y-2">
          <div className="flex justify-between">
            <span>Last Sync:</span>
            <span className="text-on-surface-variant">
              {deviceStatus.last_seen 
                ? new Date(deviceStatus.last_seen).toLocaleTimeString() 
                : 'Never'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Host IP:</span>
            <span className="text-on-surface-variant">192.168.1.100</span>
          </div>
          
          <button
            onClick={onLockSession}
            className="w-full mt-2 flex items-center justify-center gap-2 py-1 bg-surface-container border border-outline-variant hover:border-lockout hover:text-lockout text-[10px] uppercase font-bold tracking-wider rounded transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Lock Session
          </button>
        </div>
      </div>
    </aside>
  );
};
