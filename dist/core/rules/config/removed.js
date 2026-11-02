import { KLIPPER_DOCS } from '../types.js';
// Every entry below is a line from docs/Config_Changes.md (https://www.klipper3d.org/Config_Changes.html).
// "removed" is the date on the entry that says the option or value was removed. Klipper then no longer
// reads it, and klippy/configfile.py ConfigValidate.check_unused() stops startup with
// "Option '<name>' is not valid in section '<section>'".
const CHANGES = KLIPPER_DOCS + 'Config_Changes.html';
const REMOVED = [
    { section: /^(stepper_\w+|extruder\d*|manual_stepper .+|extruder_stepper .+)$/, option: 'step_distance', removed: '2021-11-02', use: 'Use rotation_distance instead (see Rotation_Distance).' },
    { section: /^mcu( .+)?$/, option: 'pin_map', removed: '2021-11-02', use: 'Use the real pin names, or the sample-aliases.cfg file in the Klipper config folder.' },
    { section: /^(extruder\d*|heater_bed|heater_generic .+)$/, option: 'pid_integral_max', removed: '2021-11-02', use: 'Delete the line.' },
    { section: /^temperature_fan .+$/, option: 'pid_integral_max', removed: '2022-04-07', use: 'Delete the line.' },
    { section: /^gcode_macro .+$/, option: 'default_parameter_', prefix: true, removed: '2021-11-02', use: 'Read parameters from params inside the macro, for example {% set NAME = params.NAME|default(VALUE)|float %}.' },
    { section: /^extruder\d*$/, option: 'shared_heater', removed: '2024-02-15', use: 'Use an [extruder_stepper] section and SYNC_EXTRUDER_MOTION instead.' },
    { section: /^bed_mesh( .+)?$/, option: 'relative_reference_index', removed: '2024-02-15', use: 'Use zero_reference_position (see Bed_Mesh).' },
    { section: /^printer$/, option: 'buffer_time_low', removed: '2023-12-07', use: 'Delete the line.' },
    { section: /^printer$/, option: 'buffer_time_high', removed: '2023-12-07', use: 'Delete the line.' },
    { section: /^printer$/, option: 'buffer_time_start', removed: '2023-12-07', use: 'Delete the line.' },
    { section: /^printer$/, option: 'move_flush_time', removed: '2023-12-07', use: 'Delete the line.' },
    { section: /^output_pin .+$/, option: 'static_value', removed: '2024-09-12', use: 'Use value and shutdown_value instead.' },
    { section: /^output_pin .+$/, option: 'maximum_mcu_duration', removed: '2024-09-12', use: 'Use a [pwm_tool] section instead.' },
    { section: /^printer$/, option: 'max_accel_to_decel', removed: '2025-08-11', use: 'Use minimum_cruise_ratio instead.' },
    { section: /^(pca9632|mcp4018) .+$/, option: 'scl_pin', removed: '2025-07-21', use: 'Use i2c_software_scl_pin instead.' },
    { section: /^(pca9632|mcp4018) .+$/, option: 'sda_pin', removed: '2025-07-21', use: 'Use i2c_software_sda_pin instead.' },
    { section: /^printer$/, option: 'max_stepper_error', removed: '2025-10-03', use: 'Delete the line.' },
    { section: /.*/, option: 'sensor_type', value: 'NTC 100K beta 3950', removed: '2024-02-15', use: 'Use "Generic 3950", or define your own [thermistor] with temperature1: 25, resistance1: 100000 and beta: 3950.' },
    { section: /.*/, option: 'sensor_type', value: 'rpi_temperature', removed: '2021-11-02', use: 'Use sensor_type: temperature_host.' },
    { section: /^endstop_phase .+$/, option: 'endstop_phase', removed: '2020-12-18', use: 'Use trigger_phase, and run ENDSTOP_PHASE_CALIBRATE again.' },
    { section: /^neopixel .+$/, option: 'color_order_grb', removed: '2020-10-29', use: 'Use color_order (RGB, GRB, RGBW or GRBW).' },
    { section: /^servo .+$/, option: 'enable', removed: '2020-07-25', use: 'Delete the line. To disable a servo use SET_SERVO SERVO=name WIDTH=0.' },
    { section: /^bed_mesh$/, option: 'min_point', removed: '2020-01-09', use: 'Use mesh_min.' },
    { section: /^bed_mesh$/, option: 'max_point', removed: '2020-01-09', use: 'Use mesh_max.' },
    { section: /^bed_mesh$/, option: 'bed_radius', removed: '2020-01-09', use: 'Use mesh_radius.' },
    { section: /.*/, option: 'lcd_type', value: 'st7567', removed: '2019-12-18', use: 'Use lcd_type: uc1701, rename rs_pin to rst_pin, and add contrast: 60 if needed.' },
    { section: /^extruder\d*$/, option: 'activate_gcode', removed: '2019-12-10', use: 'Use a [gcode_macro T0] style macro that calls ACTIVATE_EXTRUDER.' },
    { section: /^extruder\d*$/, option: 'deactivate_gcode', removed: '2019-12-10', use: 'Use a [gcode_macro T0] style macro that calls ACTIVATE_EXTRUDER.' },
    { section: /^extruder\d*$/, option: 'pressure_advance_lookahead_time', removed: '2019-11-21', use: 'Delete the line, and see the extruder options in Config_Reference.' },
    // Config_Changes says [firmware_retract]; the section Klipper reads is [firmware_retraction].
    { section: /^firmware_retract(ion)?$/, option: 'z_hop', removed: '2019-07-10', use: 'Delete the line.' },
    { section: /^skew_correction$/, option: '', prefix: true, removed: '2019-06-28', use: 'Delete the option and set the skew with SET_SKEW (see Skew_Correction).' },
    { section: /^(delta_calibrate|bed_tilt|bed_mesh|screws_tilt_adjust|z_tilt|quad_gantry_level)$/, option: 'samples', removed: '2019-06-06', use: 'Move it to the [probe] section.' },
    { section: /^(delta_calibrate|bed_tilt|bed_mesh|screws_tilt_adjust|z_tilt|quad_gantry_level)$/, option: 'samples_result', removed: '2019-06-06', use: 'Move it to the [probe] section.' },
    { section: /^(delta_calibrate|bed_tilt|bed_mesh|screws_tilt_adjust|z_tilt|quad_gantry_level)$/, option: 'sample_retract_dist', removed: '2019-06-06', use: 'Move it to the [probe] section.' },
    { section: /^sx1509 .+$/, option: 'address', removed: '2019-04-04', use: 'Use i2c_address, as a decimal number (62, not 0x3E).' },
    { section: /^tmc2660 .+$/, option: 'driver_vsense', removed: '2019-03-22', use: 'Delete the line. Klipper works it out from run_current.' },
    { section: /^tmc(2130|2208) .+$/, option: 'driver_blank_time_select', removed: '2019-03-08', use: 'Use driver_TBL.' },
    { section: /^bed_mesh$/, option: 'bed_shape', removed: '2019-02-24', use: 'Delete the line. A round bed sets mesh_radius and round_probe_count.' },
    { section: /^bed_mesh$/, option: 'radius', removed: '2019-02-24', use: 'Use mesh_radius.' },
];
// Release dates from the same page ("Klipper v0.12.0 released" entries). A version string such as
// v0.12.0-250-gabc1234 is at least as new as its base tag, so the tag's date is a lower bound.
const RELEASES = [
    ['v0.7.0', '2018-12-20'],
    ['v0.8.0', '2019-10-21'],
    ['v0.9.0', '2020-10-20'],
    ['v0.10.0', '2021-09-29'],
    ['v0.11.0', '2022-11-28'],
    ['v0.12.0', '2023-11-10'],
    ['v0.13.0', '2025-04-11'],
];
export function versionNotOlderThan(version) {
    if (!version)
        return undefined;
    const m = /^v(\d+\.\d+\.\d+)/.exec(version);
    if (!m)
        return undefined;
    return RELEASES.find(([tag]) => tag === 'v' + m[1])?.[1];
}
/** Used by the crash rules to explain "Option 'x' is not valid in section 'y'". */
export function findRemoved(section, option) {
    for (const r of REMOVED) {
        if (r.value !== undefined || !r.section.test(section))
            continue;
        if (r.prefix ? option.startsWith(r.option) : option === r.option)
            return { removed: r.removed, use: r.use };
    }
    return undefined;
}
export const removedOption = {
    id: 'removed-option',
    scope: 'any',
    severity: 'warning',
    title: 'Option or value removed from Klipper',
    detail: 'Klipper no longer reads this option, and current releases stop at startup with "Option ... is not valid in section ...".',
    fix: 'Delete the option, or switch to its replacement.',
    docs: CHANGES,
    check({ cfg, lineText, klipperVersion }) {
        const hits = [];
        const lowerBound = versionNotOlderThan(klipperVersion);
        for (const s of cfg.sections) {
            for (const o of s.options) {
                for (const r of REMOVED) {
                    if (!r.section.test(s.name))
                        continue;
                    if (r.value !== undefined) {
                        if (o.name !== r.option || o.value !== r.value)
                            continue;
                    }
                    else if (r.prefix ? !o.name.startsWith(r.option) : o.name !== r.option) {
                        continue;
                    }
                    const what = r.value !== undefined ? `${o.name}: ${r.value}` : o.name;
                    const sure = lowerBound !== undefined && lowerBound >= r.removed;
                    hits.push({
                        severity: sure ? 'error' : 'warning',
                        title: `${what} was removed from Klipper in [${s.name}]`,
                        detail: `Config_Changes lists ${what} as removed on ${r.removed}. ${sure
                            ? `This log's Klipper (${klipperVersion}) is newer than that, so it rejects the option.`
                            : 'Klipper releases after that date refuse to start with it in the file.'} ${r.use}`,
                        fix: r.use,
                        evidence: [{ line: o.line, text: lineText(o.line) }],
                    });
                    break;
                }
            }
        }
        return hits;
    },
};
// klippy/extras/probe_eddy_current.py: config.deprecate('z_offset') when descend_z is not set;
// Config_Changes 2026-03-18: "z_offset has been renamed to descend_z. Using the old name is deprecated".
export const deprecatedOption = {
    id: 'deprecated-option',
    scope: 'any',
    severity: 'warning',
    title: 'Option renamed and deprecated',
    detail: 'Klipper still accepts the old name but prints a deprecation warning and plans to remove it.',
    fix: 'Use the new option name.',
    docs: CHANGES,
    check({ cfg, lineText }) {
        const hits = [];
        for (const s of cfg.sections) {
            if (!/^probe_eddy_current( .+)?$/.test(s.name))
                continue;
            if (cfg.option(s.name, 'descend_z'))
                continue;
            const o = s.options.find((x) => x.name === 'z_offset');
            if (!o)
                continue;
            hits.push({
                title: `z_offset in [${s.name}] is deprecated, use descend_z`,
                detail: `Config_Changes (2026-03-18) renamed [probe_eddy_current] z_offset to descend_z. Klipper still reads z_offset, with a deprecation warning, and will remove it.`,
                fix: 'Rename z_offset to descend_z.',
                evidence: [{ line: o.line, text: lineText(o.line) }],
            });
        }
        return hits;
    },
};
