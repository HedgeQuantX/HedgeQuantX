/**
 * @fileoverview Latency tracking and adaptive heartbeat
 * @module services/hqx-server/latency
 */

/**
 * Latency tracker with adaptive heartbeat
 */
class LatencyTracker {
  constructor() {
    this.latency = 0;
    this.minLatency = Infinity;
    this.maxLatency = 0;
    this.avgLatency = 0;
    this.latencySamples = [];
    this.adaptiveHeartbeat = 1000;
  }

  /**
   * Update latency with new sample
   * @param {number} latency - Latency in ms
   */
  update(latency) {
    this.latency = latency;
    this.minLatency = Math.min(this.minLatency, latency);
    this.maxLatency = Math.max(this.maxLatency, latency);
    
    // Rolling average (last 100 samples)
    this.latencySamples.push(latency);
    if (this.latencySamples.length > 100) {
      this.latencySamples.shift();
    }
    this.avgLatency = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
    
    this._adaptHeartbeat();
  }

  /**
   * Adapt heartbeat interval based on connection quality
   * @private
   */
  _adaptHeartbeat() {
    if (this.avgLatency < 10) {
      this.adaptiveHeartbeat = 2000;  // <10ms: 2s heartbeat
    } else if (this.avgLatency < 50) {
      this.adaptiveHeartbeat = 1000;  // <50ms: 1s heartbeat
    } else if (this.avgLatency < 100) {
      this.adaptiveHeartbeat = 500;   // <100ms: 500ms heartbeat
    } else {
      this.adaptiveHeartbeat = 250;   // High latency: 250ms heartbeat
    }
  }

  /**
   * Get latency statistics
   * @returns {Object}
   */
  getStats() {
    return {
      current: this.latency,
      min: this.minLatency === Infinity ? 0 : this.minLatency,
      max: this.maxLatency,
      avg: this.avgLatency,
      samples: this.latencySamples.length,
    };
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.latency = 0;
    this.minLatency = Infinity;
    this.maxLatency = 0;
    this.avgLatency = 0;
    this.latencySamples = [];
    this.adaptiveHeartbeat = 1000;
  }
}

module.exports = { LatencyTracker };
