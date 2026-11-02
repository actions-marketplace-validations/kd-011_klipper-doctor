import { rulesMetadata } from './core/index.js';
import { OPTIONS, SHELLS } from './options.js';
const name = (o) => o.flags[0];
const quote = (s) => `'${s.replace(/'/g, "'\\''")}'`;
function offered(o, rules) {
    return o.offers === 'rules' ? rules : [...(o.offers ?? [])];
}
function bash(rules) {
    const flags = OPTIONS.flatMap((o) => o.flags).join(' ');
    const valued = OPTIONS.filter((o) => o.offers).map((o) => {
        const words = offered(o, rules).join(' ');
        if (o.offers === 'rules') {
            return `    ${name(o)})
      local head="" last="$cur" id
      if [[ "$cur" == *,* ]]; then head="\${cur%,*},"; last="\${cur##*,}"; fi
      for id in $(compgen -W "${words}" -- "$last"); do COMPREPLY+=("$head$id"); done
      return;;`;
        }
        return `    ${name(o)}) COMPREPLY=($(compgen -W "${words}" -- "$cur")); return;;`;
    });
    const wantsValue = OPTIONS.filter((o) => o.value && !o.offers && name(o) !== '--api-key').map(name);
    return `# bash completion for klipper-doctor
# Add to ~/.bashrc:  source <(klipper-doctor completions bash)
_klipper_doctor() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [[ "$prev" == "=" ]]; then prev="\${COMP_WORDS[COMP_CWORD-2]}"; fi
  if [[ "$cur" == "=" ]]; then cur=""; fi
  COMPREPLY=()
  if [[ "\${COMP_WORDS[1]}" == "completions" ]]; then
    if [[ $COMP_CWORD -eq 2 ]]; then COMPREPLY=($(compgen -W "${SHELLS.join(' ')}" -- "$cur")); fi
    return
  fi
  case "$prev" in
${valued.join('\n')}
    ${wantsValue.join('|')}) return;;
  esac
  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "${flags}" -- "$cur"))
    return
  fi
  if [[ $COMP_CWORD -eq 1 ]]; then COMPREPLY=($(compgen -W "completions" -- "$cur")); fi
  COMPREPLY+=($(compgen -f -- "$cur"))
}
complete -o filenames -F _klipper_doctor klipper-doctor
`;
}
function zsh(rules) {
    const specs = OPTIONS.map((o) => {
        const desc = o.description.replace(/[[\]:']/g, ' ');
        const names = o.flags.length > 1 ? `{${o.flags.join(',')}}` : name(o);
        if (!o.value)
            return `    ${o.flags.length > 1 ? `'(${o.flags.join(' ')})'` : ''}${names}${quote(`[${desc}]`)} \\`;
        if (o.offers === 'rules')
            return `    ${quote(`*${name(o)}=[${desc}]:rule id:_values -s , "rule id" $rules`)} \\`;
        if (o.offers)
            return `    ${quote(`${name(o)}=[${desc}]:${name(o).slice(2)}:(${offered(o, rules).join(' ')})`)} \\`;
        return `    ${quote(`${name(o)}=${o.value.startsWith('[') ? '-' : ''}[${desc}]:${o.value.replace(/[[\]=]/g, '')}:`)} \\`;
    });
    return `#compdef klipper-doctor
# zsh completion for klipper-doctor
# Add to ~/.zshrc (after compinit):  source <(klipper-doctor completions zsh)
_klipper_doctor() {
  local -a rules
  rules=(${rules.join(' ')})
  if [[ $words[2] == completions ]]; then
    _values 'shell' ${SHELLS.join(' ')}
    return
  fi
  _arguments -s \\
${specs.join('\n')}
    '*:file:_files'
}
compdef _klipper_doctor klipper-doctor
`;
}
function fish(rules) {
    const lines = OPTIONS.map((o) => {
        const parts = ['complete -c klipper-doctor'];
        for (const f of o.flags)
            parts.push(f.startsWith('--') ? `-l ${f.slice(2)}` : `-s ${f.slice(1)}`);
        if (o.offers)
            parts.push('-x', `-a ${quote(offered(o, rules).join(' '))}`);
        else if (o.value && name(o) === '--timeout')
            parts.push('-x');
        parts.push(`-d ${quote(o.description)}`);
        return parts.join(' ');
    });
    return `# fish completion for klipper-doctor
# Save as ~/.config/fish/completions/klipper-doctor.fish:  klipper-doctor completions fish > that file
${lines.join('\n')}
complete -c klipper-doctor -n '__fish_use_subcommand' -a completions -d 'print a shell completion script'
complete -c klipper-doctor -n '__fish_seen_subcommand_from completions' -f -a '${SHELLS.join(' ')}'
`;
}
/** A completion script. The --ignore choices are the config rules the engine can suppress. */
export function completionScript(shell) {
    const rules = rulesMetadata().filter((r) => r.suppressible).map((r) => r.id);
    return shell === 'bash' ? bash(rules) : shell === 'zsh' ? zsh(rules) : fish(rules);
}
