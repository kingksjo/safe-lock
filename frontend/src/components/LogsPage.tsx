import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, Download, Eye, Calendar, UserCheck, AlertOctagon, UserX, X } from 'lucide-react';
import type { AccessLog, AnalyticsStats } from '../types';
import { HourlyChart } from './HourlyChart';

interface LogsPageProps {
  logs: AccessLog[];
  stats: AnalyticsStats;
}

export const LogsPage: React.FC<LogsPageProps> = ({ logs, stats }) => {
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const logsPerPage = 10;

  // Filter and search logic
  const filteredLogs = logs.filter(log => {
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    const searchString = search.toLowerCase();
    
    // Support searching by status, slot ID, or timestamp
    const matchesSearch = 
      log.status.toLowerCase().includes(searchString) ||
      (log.fp_slot_id !== null && log.fp_slot_id.toString().includes(searchString)) ||
      new Date(log.timestamp).toLocaleString().toLowerCase().includes(searchString);

    return matchesStatus && matchesSearch;
  });

  // Pagination logic
  const totalPages = Math.max(Math.ceil(filteredLogs.length / logsPerPage), 1);
  const paginatedLogs = filteredLogs.slice((page - 1) * logsPerPage, page * logsPerPage);

  const handlePrevPage = () => setPage(p => Math.max(p - 1, 1));
  const handleNextPage = () => setPage(p => Math.min(p + 1, totalPages));

  // CSV Export utility
  const exportToCSV = () => {
    const headers = ['ID', 'Timestamp', 'Status', 'User Name', 'Role', 'PIN Attempts', 'Fingerprint Attempts', 'Fingerprint Slot ID', 'Keypad Camera Capture File'];
    const rows = filteredLogs.map(log => [
      log.id,
      new Date(log.timestamp).toISOString(),
      log.status,
      log.user_name || 'Unknown',
      log.user_role || '-',
      log.pin_attempts,
      log.fp_attempts,
      log.fp_slot_id !== null ? log.fp_slot_id : 'NULL',
      log.image ? log.image.filename : 'None'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `safelock_telemetry_logs_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secure/15 text-secure border border-secure/30 text-[10px] font-bold tracking-wider uppercase">
            <span className="w-1 h-1 rounded-full bg-secure"></span>
            Granted
          </span>
        );
      case 'FAIL_PIN':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-lockout/15 text-lockout border border-lockout/20 text-[10px] font-bold tracking-wider uppercase">
            <span className="w-1 h-1 rounded-full bg-lockout"></span>
            Pin Fail
          </span>
        );
      case 'FAIL_FP':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-lockout/15 text-lockout border border-lockout/20 text-[10px] font-bold tracking-wider uppercase">
            <span className="w-1 h-1 rounded-full bg-lockout"></span>
            Biometrics Fail
          </span>
        );
      case 'LOCKOUT':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-lockout/20 text-lockout border border-lockout/40 text-[10px] font-bold tracking-wider uppercase animate-pulse">
            <span className="w-1 h-1 rounded-full bg-lockout animate-ping"></span>
            Lockout
          </span>
        );
      case 'KEYPAD_TOUCH':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 text-[10px] font-bold tracking-wider uppercase">
            <span className="w-1 h-1 rounded-full bg-primary animate-ping"></span>
            Keypad Touched
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant text-[10px] font-bold tracking-wider uppercase">
            <span className="w-1 h-1 rounded-full bg-outline"></span>
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Page Header */}
      <div className="flex justify-between items-center border-b border-outline-variant pb-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wider text-on-surface">Access logs & telemetry</h2>
          <p className="text-[10px] text-outline uppercase tracking-widest font-mono">Real-time system authentication audit</p>
        </div>

        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant hover:border-primary rounded text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* 1. Collapsible Metrics Card */}
      <div className="bg-surface border border-outline-variant rounded-lg overflow-hidden transition-all duration-300">
        <button
          onClick={() => setMetricsOpen(!metricsOpen)}
          className="w-full px-6 py-4 flex justify-between items-center hover:bg-surface-container-low transition border-b border-outline-variant/30"
        >
          <span className="text-xs uppercase font-bold text-on-surface tracking-wider">
            System Telemetry Indicators
          </span>
          {metricsOpen ? (
            <ChevronUp className="w-4 h-4 text-outline" />
          ) : (
            <ChevronDown className="w-4 h-4 text-outline" />
          )}
        </button>

        {metricsOpen && (
          <div className="p-6 space-y-6">
            {/* Metric Tiles Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Tile 1: Total Today */}
              <div className="bg-surface-container-low border border-outline-variant p-4 rounded flex items-center gap-4">
                <div className="p-2.5 bg-primary/10 rounded text-primary border border-primary/20">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-outline tracking-wider">Today's Attempts</span>
                  <span className="text-xl font-bold font-mono tracking-tight text-on-surface">{stats.total_today}</span>
                </div>
              </div>

              {/* Tile 2: Successes */}
              <div className="bg-surface-container-low border border-outline-variant p-4 rounded flex items-center gap-4">
                <div className="p-2.5 bg-secure/10 rounded text-secure border border-secure/20">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-outline tracking-wider">Access Granted</span>
                  <span className="text-xl font-bold font-mono tracking-tight text-on-surface">{stats.successes}</span>
                </div>
              </div>

              {/* Tile 3: Failures */}
              <div className="bg-surface-container-low border border-outline-variant p-4 rounded flex items-center gap-4">
                <div className="p-2.5 bg-lockout/10 rounded text-lockout border border-lockout/20">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-outline tracking-wider">Total Failures</span>
                  <span className="text-xl font-bold font-mono tracking-tight text-on-surface">{stats.failures}</span>
                </div>
              </div>

              {/* Tile 4: Failure Streak */}
              <div className="bg-surface-container-low border border-outline-variant p-4 rounded flex items-center gap-4">
                <div className="p-2.5 bg-lockout/15 rounded text-lockout border border-lockout/30 animate-pulse">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-outline tracking-wider">Max Fail Streak</span>
                  <span className="text-xl font-bold font-mono tracking-tight text-on-surface">{stats.streak}</span>
                </div>
              </div>
            </div>

            {/* Peak Hours Chart */}
            <HourlyChart data={stats.peak_hours} />
          </div>
        )}
      </div>

      {/* 2. Access Log Table Module */}
      <div className="bg-surface border border-outline-variant rounded-lg p-6 space-y-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-outline" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by status, slot, or timestamp..."
              className="w-full bg-background border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded py-1.5 pl-10 pr-4 text-xs text-on-surface outline-none transition placeholder:text-outline/40"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-background border border-outline-variant focus:border-primary rounded px-3 py-1.5 text-xs text-on-surface outline-none transition font-semibold"
            >
              <option value="all">All Event Codes</option>
              <option value="SUCCESS">Granted Only</option>
              <option value="FAIL_PIN">PIN Failures</option>
              <option value="FAIL_FP">Biometrics Failures</option>
              <option value="LOCKOUT">Lockouts Only</option>
              <option value="KEYPAD_TOUCH">Keypad Touched Only</option>
            </select>
          </div>
        </div>

        {/* Data Grid */}
        <div className="overflow-x-auto border border-outline-variant rounded">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant text-[10px] uppercase font-bold text-outline tracking-wider">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Event Code</th>
                <th className="px-4 py-3 text-center" title="Frame captured upon initial keypad touch (IDLE → PIN_ENTRY)">Keypad Camera Feed</th>
                <th className="px-4 py-3 text-center">PIN Fails</th>
                <th className="px-4 py-3 text-center">FP Fails</th>
                <th className="px-4 py-3 text-center">User / Identity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 text-xs">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-outline font-mono">
                    NO RECORD MATCHES FILTER SPECIFICATIONS
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-container/50 transition">
                    <td className="px-4 py-3.5 text-on-surface-variant font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="px-4 py-3.5 flex justify-center">
                      {log.image ? (
                        <button
                          onClick={() => setSelectedImage(log.image!.filepath)}
                          title="View camera frame captured at keypad touch"
                          className="flex items-center gap-1 text-[10px] uppercase font-semibold text-primary hover:text-primary-container px-2 py-1 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded transition"
                        >
                          <Eye className="w-3 h-3" />
                          View Feed
                        </button>
                      ) : (
                        <span className="text-[10px] text-outline uppercase font-mono tracking-wider">
                          No Frame
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center font-mono font-medium text-on-surface-variant">
                      {log.pin_attempts}
                    </td>
                    <td className="px-4 py-3.5 text-center font-mono font-medium text-on-surface-variant">
                      {log.fp_attempts}
                    </td>
                    <td className="px-4 py-3.5 text-center font-medium">
                      {log.user_name ? (
                        <div className="flex flex-col items-center justify-center">
                          <span className="font-bold text-on-surface tracking-wide">{log.user_name}</span>
                          <span className="text-[10px] text-outline font-mono">
                            {log.user_role ? `${log.user_role} · ` : ''}{log.fp_slot_id !== null && log.fp_slot_id > 0 ? `Slot #${log.fp_slot_id}` : log.fp_slot_id === 0 ? 'Remote/Override' : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono text-on-surface-variant">
                          {log.fp_slot_id !== null ? `Slot #${log.fp_slot_id}` : '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-outline-variant/20 pt-4 text-xs font-semibold uppercase tracking-wider text-outline">
          <span>
            Telemetry Grid {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={page === 1}
              className="px-3 py-1.5 bg-surface-container border border-outline-variant hover:border-primary disabled:hover:border-outline-variant text-[10px] rounded transition uppercase tracking-wider text-on-surface disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={page === totalPages}
              className="px-3 py-1.5 bg-surface-container border border-outline-variant hover:border-primary disabled:hover:border-outline-variant text-[10px] rounded transition uppercase tracking-wider text-on-surface disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Image Lightbox Overlay */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg bg-surface border border-outline-variant p-2 rounded shadow-2xl overflow-hidden">
            {/* Close Overlay button */}
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-1.5 bg-surface-container border border-outline-variant hover:border-primary text-on-surface rounded-full transition z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={selectedImage}
              alt="Hardware lock security camera feed frame"
              className="w-full h-auto max-h-[70vh] object-contain rounded bg-background"
            />
            <div className="p-3 text-center">
              <span className="text-[10px] uppercase font-bold text-outline tracking-wider font-mono">
                Frame Telemetry Capture — Captured at Keypad Touch Phase (IDLE → PIN_ENTRY)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
