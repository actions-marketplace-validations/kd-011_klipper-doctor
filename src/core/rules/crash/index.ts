import type { CrashRule } from '../types.js';
import { commandError } from './commandError.js';
import { configError } from './config.js';
import { extrudeCold, extrudeCrossSection, extrudeOnlyTooLong } from './extruder.js';
import { mustHomeFirst, moveOutOfRange, stepcompressInternal } from './gcode.js';
import { heaterVerify } from './heater.js';
import { bltouchVerify, homingCommTimeout, homingNoTrigger, homingStillTriggered, probeTriggeredEarly } from './homing.js';
import {
  adcOutOfRange,
  canUuidInvalid,
  commandRequest,
  configWhileShutdown,
  connectFailed,
  linuxBusOpen,
  lostCommunication,
  maxDuration,
  missedScheduling,
  protocolMismatch,
  resetFailed,
  spontaneousRestart,
  stepRate,
  thermocoupleFault,
  timerTooClose,
} from './mcu.js';
import { tmcComm, tmcReportsError } from './tmc.js';

/** Order matters only for the order findings are listed in. */
export const crashRules: CrashRule[] = [
  configError,
  protocolMismatch,
  connectFailed,
  configWhileShutdown,
  resetFailed,
  canUuidInvalid,
  linuxBusOpen,
  lostCommunication,
  timerTooClose,
  missedScheduling,
  maxDuration,
  stepRate,
  adcOutOfRange,
  thermocoupleFault,
  commandRequest,
  spontaneousRestart,
  heaterVerify,
  tmcComm,
  tmcReportsError,
  stepcompressInternal,
  moveOutOfRange,
  mustHomeFirst,
  homingNoTrigger,
  homingStillTriggered,
  probeTriggeredEarly,
  homingCommTimeout,
  bltouchVerify,
  extrudeCold,
  extrudeOnlyTooLong,
  extrudeCrossSection,
  commandError,
];
