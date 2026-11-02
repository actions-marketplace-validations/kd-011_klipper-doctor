import { configError } from './config.js';
import { mustHomeFirst, moveOutOfRange, stepcompressInternal } from './gcode.js';
import { heaterVerify } from './heater.js';
import { adcOutOfRange, commandRequest, connectFailed, lostCommunication, missedScheduling, protocolMismatch, spontaneousRestart, stepRate, timerTooClose, } from './mcu.js';
import { tmcComm, tmcReportsError } from './tmc.js';
/** Order matters only for the order findings are listed in. */
export const crashRules = [
    configError,
    protocolMismatch,
    connectFailed,
    lostCommunication,
    timerTooClose,
    missedScheduling,
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
];
