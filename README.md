<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/readme/wordmark-dark.png" />
    <img src="branding/readme/wordmark-light.png" alt="TUIFT Code" width="440" />
  </picture>
</p>

<h3 align="center">All your coding agents in one local desktop app.</h3>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-F9670E?style=flat-square&labelColor=141414" alt="Apache License 2.0" /></a>
  <a href="#get-it"><img src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS-F9670E?style=flat-square&labelColor=141414" alt="Windows and macOS" /></a>
  <a href="#get-it"><img src="https://img.shields.io/badge/version-0.5.1%20beta-F9670E?style=flat-square&labelColor=141414" alt="Version 0.5.1, early beta" /></a>
  <a href="#credits-and-license"><img src="https://img.shields.io/badge/based%20on-TasteCode-F9670E?style=flat-square&labelColor=141414" alt="Based on TasteCode" /></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#get-it">Get it</a> ·
  <a href="#run-from-source">Run from source</a> ·
  <a href="#credits-and-license">Credits</a> ·
  <a href="../../issues">Issues</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/readme/produto-dark.webp" />
    <img src="branding/readme/produto-light.webp" alt="TUIFT Code showing a finished Claude Code chat, the project sidebar and the prompt bar with Full access, Design and Motion" width="100%" />
  </picture>
</p>

## What it is

One desktop app for your coding agents. Codex, Claude Code and Grok run side by side, each on your own provider subscription, and you pick the model that fits each task. Orchestration, project state, terminal, diffs, checkpoints and history stay on your machine: it is local-first.

## Features

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="branding/readme/feature-agentes.webp" alt="Settings, Providers: Claude Code, Codex and Grok, each with its access and context settings" /><br />
      <b>Every agent, one window</b><br />
      <sub>Codex, Claude Code and Grok in one sidebar, each on your own subscription. Pick the model and the reasoning effort per chat.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="branding/readme/feature-design.webp" alt="The prompt bar with Design mode switched on" /><br />
      <b>Design Mode</b><br />
      <sub>Switch Design on in the prompt bar to build and review web interfaces with the agent you picked.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="branding/readme/feature-mcp.webp" alt="MCP servers page with one card per server and its connection status" /><br />
      <b>MCP servers as cards</b><br />
      <sub>One card per server, with its status at a glance. Add, edit, sign in or turn servers off per provider and project.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="branding/readme/feature-skills.webp" alt="Skills page listing global skills, each with an on and off switch" /><br />
      <b>Skills in one list</b><br />
      <sub>Global, project and built-in skills side by side, each with its own switch.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="branding/readme/feature-arquivos.webp" alt="The Files panel next to the chat, with a CSS file open and the project tree" /><br />
      <b>Files beside the chat</b><br />
      <sub>Files, terminal, browser and diff review open in a side panel next to the conversation. You do not have to leave the app.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="branding/readme/feature-idioma.webp" alt="Settings, General, with the language menu open: Portuguese (Brazil) and English" /><br />
      <b>Português or English</b><br />
      <sub>Pick the interface language in Settings. Translation starts with Settings and grows screen by screen; chats and what the AI writes are never translated.</sub>
    </td>
  </tr>
</table>

## Get it

<p align="center">
  <a href="../../releases">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="branding/readme/banner-dark.webp" />
      <img src="branding/readme/banner-light.webp" alt="Every coding agent. One desktop app. Windows and macOS builds will be published in Releases." width="100%" />
    </picture>
  </a>
</p>

**Early beta.** Builds will be published in [Releases](../../releases); there is none yet. Expect bugs and rough edges, and report them in [Issues](../../issues).

- Windows 10/11 x64 or macOS on Apple Silicon
- at least one supported provider CLI installed and signed in
- Git for project checkpoints and worktree features

## Run from source

Install Node 24 LTS and pnpm, then:

```text
pnpm install
pnpm dev
```

Provider processes run on your machine, and credentials stay with the provider or the operating-system credential store. See [SECURITY.md](./SECURITY.md) and [rules/security.md](./rules/security.md).

## Credits and license

TUIFT Code is based on [TasteCode](https://github.com/Leonxlnx/tastecode) by Leonxlnx and Blueemi, licensed under the Apache License 2.0, with our own name and icon. Interface, features and behavior follow TasteCode; changes are listed in [branding/README.md](./branding/README.md). "TasteCode" and its logo belong to their authors; TUIFT Code is not affiliated with or endorsed by them.

Licensed under the [Apache License 2.0](./LICENSE), like TasteCode. See [NOTICE](./NOTICE), [CREDITS.md](./CREDITS.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
