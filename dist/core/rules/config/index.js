import { kinematicsMissingSection, pinUsedTwice, tmcMicrosteps, tmcStepperMissing } from './hardware.js';
import { deprecatedOption, removedOption } from './removed.js';
import { endstopRange, missingRequired, safeZHomeConflict } from './required.js';
import { configFragment, duplicateOption, duplicateSection, gcodeUnindented, includesNotRead, saveConfigDuplicate, unparseableLine, } from './structure.js';
import { noInputShaper, tmcStealthchopThreshold } from './tuning.js';
export const configRules = [
    unparseableLine,
    gcodeUnindented,
    duplicateOption,
    duplicateSection,
    saveConfigDuplicate,
    removedOption,
    deprecatedOption,
    missingRequired,
    endstopRange,
    safeZHomeConflict,
    kinematicsMissingSection,
    pinUsedTwice,
    tmcMicrosteps,
    tmcStepperMissing,
    tmcStealthchopThreshold,
    noInputShaper,
    includesNotRead,
    configFragment,
];
