// Suppressions are for config findings only. A crash finding says why a session died, and an
// unusable-input finding says nothing was checked, so hiding either would make a failed run look clean.
export const NEVER_SUPPRESSED = new Set(['unusable-input']);
// "# klipper-doctor: ignore rule-id, other-rule", the way ShellCheck reads "# shellcheck disable=SC2086".
// Klipper strips everything after a "#" before it reads a line (klippy/configfile.py), so this is
// found in the raw text, before the config parser has removed it.
const DIRECTIVE = /#\s*klipper-doctor:\s*ignore\s+([a-z0-9_-]+(?:\s*,\s*[a-z0-9_-]+)*)/i;
export function parseIgnoreList(value) {
    const out = new Set();
    if (!Array.isArray(value))
        return out;
    for (const v of value)
        if (typeof v === 'string' && v.trim())
            out.add(v.trim());
    return out;
}
/** Rule ids named by directives, by 1-based line number, and which lines hold nothing but a comment. */
function scanDirectives(lines) {
    const named = new Map();
    const commentOnly = new Set();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('#'))
            continue;
        if (line.trimStart().startsWith('#'))
            commentOnly.add(i + 1);
        const m = DIRECTIVE.exec(line);
        if (m)
            named.set(i + 1, new Set(m[1].split(',').map((s) => s.trim().toLowerCase())));
    }
    return { named, commentOnly };
}
/**
 * Drops config findings named in `ignore`, and, when `lines` is given, those with a directive comment
 * on one of their evidence lines or in the block of comment lines directly above it.
 */
export function suppress(findings, ignore, lines) {
    const dir = lines && lines.length > 0 ? scanDirectives(lines) : undefined;
    const hasDirectives = !!dir && dir.named.size > 0;
    if (ignore.size === 0 && !hasDirectives)
        return { kept: findings, count: 0 };
    const covers = (line, id) => {
        if (!dir)
            return false;
        if (dir.named.get(line)?.has(id))
            return true;
        for (let n = line - 1; n >= 1 && dir.commentOnly.has(n); n--)
            if (dir.named.get(n)?.has(id))
                return true;
        return false;
    };
    const kept = [];
    for (const f of findings) {
        const hidden = !NEVER_SUPPRESSED.has(f.id) &&
            (ignore.has(f.id) || (hasDirectives && f.evidence.some((e) => covers(e.line, f.id))));
        if (!hidden)
            kept.push(f);
    }
    return { kept, count: findings.length - kept.length };
}
