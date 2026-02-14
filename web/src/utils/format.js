export function formatCurrency(value, decimals = 2) {
  if (value == null || isNaN(value)) return 'N/A';
  const num = Number(value);
  const prefix = num >= 0 ? '+' : '';
  return `${prefix}$${Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatBalance(value, decimals = 2) {
  if (value == null || isNaN(value)) return 'N/A';
  return `$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatPercent(value, decimals = 1) {
  if (value == null || isNaN(value)) return 'N/A';
  return `${Number(value).toFixed(decimals)}%`;
}

export function formatTime(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(timestamp) {
  if (!timestamp) return 'N/A';
  return `${formatDate(timestamp)} ${formatTime(timestamp)}`;
}

export function formatNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return 'N/A';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function pnlColor(value) {
  if (value == null || isNaN(value)) return 'text-[#8888aa]';
  const num = Number(value);
  if (num > 0) return 'text-[#00e5ff]';
  if (num < 0) return 'text-[#d4006a]';
  return 'text-[#8888aa]';
}

export function pnlBg(value) {
  if (value == null || isNaN(value)) return 'bg-bg-card';
  const num = Number(value);
  if (num > 0) return 'bg-[#00e5ff]/10';
  if (num < 0) return 'bg-[#d4006a]/10';
  return 'bg-bg-card';
}
