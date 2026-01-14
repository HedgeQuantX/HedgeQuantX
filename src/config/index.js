/**
 * @fileoverview Configuration module exports
 * @module config
 */

const {
  PROPFIRMS,
  PROPFIRM_CHOICES,
  getPropFirm,
  getPropFirmById,
  getPropFirmsByPlatform,
} = require('./propfirms');

const {
  ACCOUNT_STATUS,
  ACCOUNT_TYPE,
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_SIDE,
  CONTRACT_DESCRIPTIONS,
  getContractDescription,
} = require('./constants');

const {
  TIMEOUTS,
  RATE_LIMITS,
  SECURITY,
  VALIDATION,
  HQX_SERVER,
  CACHE,
  DEBUG,
} = require('./settings');

module.exports = {
  // PropFirms
  PROPFIRMS,
  PROPFIRM_CHOICES,
  getPropFirm,
  getPropFirmById,
  getPropFirmsByPlatform,

  // Constants
  ACCOUNT_STATUS,
  ACCOUNT_TYPE,
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_SIDE,
  CONTRACT_DESCRIPTIONS,
  getContractDescription,

  // Settings
  TIMEOUTS,
  RATE_LIMITS,
  SECURITY,
  VALIDATION,
  HQX_SERVER,
  CACHE,
  DEBUG,
};
