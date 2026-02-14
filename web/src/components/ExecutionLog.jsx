import { useRef, useEffect } from 'react';
import { formatTime } from '../utils/format';

function typeColor(type) {
  switch (type?.toLowerCase()) {
    case 'signal':
      return 'text-warning';
    case 'fill':
    case 'filled':
      return 'text-accent';
    case 'error':
    case 'risk':
      return 'text-pink';
    case 'bracket':
    case 'order':
      return 'text-warning';
    case 'cancel':
      return 'text-text-dim';
    default:
      return 'text-text-muted';
  }
}

function typeBg(type) {
  switch (type?.toLowerCase()) {
    case 'signal':
      return 'bg-warning-dim';
    case 'fill':
    case 'filled':
      return 'bg-accent-dim';
    case 'error':
    case 'risk':
      return 'bg-pink-dim';
    case 'bracket':
    case 'order':
      return 'bg-warning-dim';
    default:
      return 'bg-bg-card-hover';
  }
}

export default function ExecutionLog({ events = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (!events.length) {
    return (
      <div className="bg-bg-card border border-border-default rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">Execution Log</h3>
        <p className="text-text-muted text-xs">No events yet</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-4">
      <h3 className="text-sm font-medium text-text-primary mb-3">Execution Log</h3>
      <div ref={scrollRef} className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {events.map((event, i) => (
          <div
            key={event.id || i}
            className="flex items-start gap-2 text-xs animate-fade-in"
          >
            <span className="font-mono-nums text-text-dim shrink-0 mt-0.5">
              {formatTime(event.timestamp)}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase shrink-0 ${typeColor(event.type)} ${typeBg(event.type)}`}
            >
              {event.type || 'info'}
            </span>
            <span className="text-text-primary break-words">{event.message || 'N/A'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
