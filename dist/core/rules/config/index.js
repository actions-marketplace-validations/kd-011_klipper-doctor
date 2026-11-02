import { deprecatedOption, removedOption } from './removed.js';
import { endstopRange, missingRequired, safeZHomeConflict } from './required.js';
import { duplicateOption, duplicateSection, gcodeUnindented, includesNotRead, saveConfigDuplicate, unparseableLine, } from './structure.js';
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
    tmcStealthchopThreshold,
    noInputShaper,
    includesNotRead,
];
