import type { CrashRule } from '../types.js';
import { configError } from './config.js';
import { extrudeCold, extrudeCrossSection, extrudeOnlyTooLong } from './extruder.js';
import { mustHomeFirst, moveOutOfRange, stepcompressInternal } from './gcode.js';
import { heaterVerify } from './heater.js';
import { bltouchVerify, homingCommTimeout, homingNoTrigger, homingStillTriggered, probeTriggeredEarly } from './homing.js';
import {
  adcOutOfRange,
  canUuidInvalid,
  commandRequest,
  connectFailed,
  linuxBusOpen,
  lostCommunication,
  maxDuration,
  missedScheduling,
  protocolMismatch,
  spontaneousRestart,
  stepRate,
  timerTooClose,
} from './mcu.js';
import { tmcComm, tmcReportsError } from './tmc.js';

/** Order matters only for the order findings are listed in. */
export const crashRules: CrashRule[] = [
  configError,
  protocolMismatch,
  connectFailed,
  canUuidInvalid,
  linuxBusOpen,
  lostCommunication,
  timerTooClose,
  missedScheduling,
  maxDuration,
  stepRate,
  adcOutOfRange,
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
];
