/** Python's float() accepts neither a blank nor hex, unlike Number(). NaN when Klipper would not read it. */
export function configNumber(value) {
    if (value === undefined || !/^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(value))
        return NaN;
    return Number(value);
}
export const KLIPPER_DOCS = 'https://www.klipper3d.org/';
export const KLIPPER_SRC = 'https://github.com/Klipper3d/klipper/blob/master/';
