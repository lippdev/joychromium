#!/usr/bin/env node
// Release notes from the Conventional Commits between the previous tag and this one.
//   git log --no-merges --pretty=format:%s v1.2.0..v1.3.0 | node app/scripts/release-notes.mjs v1.2.0 1.3.0
// The grouping is a pure function so it is unit tested; the CLI is only the file/stdin plumbing.
import { readFileSync } from "node:fs";

/** Types that get their own section, in the order they appear, with the heading the user reads. */
const SECTIONS = [
  { type: "feat", title: "Novidades" },
  { type: "fix", title: "Correções" },
  { type: "perf", title: "Desempenho" },
  { type: "refactor", title: "Por dentro" },
  { type: "docs", title: "Documentação" },
  { type: "build", title: "Empacotamento" },
  { type: "ci", title: "CI" },
  { type: "chore", title: "Manutenção" },
];

/** Commits that say nothing to someone reading a release. */
const HIDDEN = /^(chore\(deps\): bump |chore: release |Merge |Revert "?Merge )/;

/**
 * Splits `type(scope): subject` into its parts. Anything that does not follow Conventional Commits lands in "Outros",
 * because a release note that silently drops a commit is worse than one with an odd line.
 */
export function parseSubject(subject) {
  const raw = subject.trim();
  const match = /^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/.exec(raw);
  if (!match) return { type: "other", scope: undefined, breaking: false, text: raw, raw };
  return { type: match[1].toLowerCase(), scope: match[2], breaking: Boolean(match[3]), text: match[4], raw };
}

/** The markdown body for a release: sections per type, breaking changes first, plus the install footer. */
export function groupCommits(subjects, { previousTag, version } = {}) {
  const parsed = subjects.map((s) => s.trim()).filter(Boolean).map(parseSubject).filter((c) => !HIDDEN.test(c.raw));
  const breaking = parsed.filter((c) => c.breaking);
  const lines = [`## JoyChromium ${version ?? ""}`.trim(), ""];
  if (previousTag) lines.push(`Mudanças desde \`${previousTag}\`.`, "");

  if (breaking.length > 0) {
    lines.push("### Mudanças que quebram", "");
    for (const commit of breaking) lines.push(`- ${commit.text}`);
    lines.push("");
  }
  for (const section of SECTIONS) {
    const commits = parsed.filter((c) => c.type === section.type && !c.breaking);
    if (commits.length === 0) continue;
    lines.push(`### ${section.title}`, "");
    for (const commit of commits) lines.push(`- ${commit.scope ? `**${commit.scope}**: ` : ""}${commit.text}`);
    lines.push("");
  }
  // Anything that does not fit a section (an unfamiliar type, or a subject without the prefix) still shows up here.
  const rest = parsed.filter((c) => !c.breaking && !SECTIONS.some((s) => s.type === c.type));
  if (rest.length > 0) {
    lines.push("### Outros", "");
    for (const commit of rest) lines.push(`- ${commit.text}`);
    lines.push("");
  }

  lines.push(
    "### Instaladores",
    "",
    "Windows (`.exe`, x64 e arm64), macOS (`.dmg`/`.zip`, x64 e arm64) e Linux (`.AppImage`, `.deb`, `.rpm`, x64 e arm64).",
    "Os builds não são assinados (ADR-010): o Windows mostra o SmartScreen e o macOS recusa a instalação de um clique.",
    "",
    "**macOS:** a imagem de disco traz `LEIA-ME.txt` e `install-macos.command`. Abra o `.dmg` e dê dois cliques em `install-macos.command` — ele copia o app para Aplicativos e limpa a quarentena. Na mão: arraste o **JoyChromium** para Aplicativos e abra uma vez com botão direito → **Abrir**; se essa opção não aparecer, rode `xattr -dr com.apple.quarantine /Applications/JoyChromium.app`. O aviso \"Este Mac não conseguiu verificar o app\" é falta de notarização, não app danificado: `codesign --verify --deep --strict` passa neste build.",
    "",
    "As versões instaladas se atualizam sozinhas, exceto no macOS (o app avisa e abre esta página) e nas versões abaixo de 1.0, que saem como pré-release e se atualizam à mão.",
    "",
    "Guia de instalação: https://github.com/lippdev/joychromium/blob/main/docs/INSTALL.md",
  );
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("release-notes.mjs")) {
  const [, , previousTag, version] = process.argv;
  const subjects = readFileSync(0, "utf8").split("\n");
  process.stdout.write(`${groupCommits(subjects, { previousTag, version })}\n`);
}
