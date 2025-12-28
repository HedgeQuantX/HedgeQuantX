/**
 * @fileoverview Configuration module exports
 * @module config
 */

const { 
  PROPFIRMS, 
  PROPFIRM_CHOICES, 
  getPropFirm, 
  getPropFirmById,
  getPropFirmsByPlatform 
} = require('./propfirms');

const {
  ACCOUNT_STATUS,
  ACCOUNT_TYPE,
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_SIDE,
  FUTURES_SYMBOLS
} = require('./constants');

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
  FUTURES_SYMBOLS
};
