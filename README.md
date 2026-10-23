# Alarmo Card Custom

![Alarmo Card Custom — a simpler Alarmo interface for Home Assistant](docs/banner.svg)

A fork of [nielsfaber/alarmo-card](https://github.com/nielsfaber/alarmo-card) with a simpler appearance and an updated code-entry popup for Home Assistant.

The original card and its functionality were created by [Niels Faber](https://github.com/nielsfaber). See the [upstream README](https://github.com/nielsfaber/alarmo-card#readme) for general features and configuration options. This README focuses on the changes in this fork.

## Changes in this fork

- **Compact countdown:** shows the remaining seconds above a small horizontal bar with rounded ends at the top left of the card during entry and exit delays. The bar shrinks as time runs out and disappears when the delay ends. The alarm icon still reflects the current state and pulses during delays. Clicking it during a delay still skips the delay.
- **Updated code popup:** uses Home Assistant’s dialog and password input components, with rounded corners and a centered layout. Numeric codes use an input that requests the device’s numeric keyboard instead of an on-screen keypad inside the popup.
- **Blurred popup background:** applies a subtle 4px blur behind both numeric and text code dialogs while keeping the popup clear.
- **Font and icon sizing:** adds `font_size` and `icon_size` settings, available in YAML and the visual editor.
- **Active-mode handling:** selecting the mode that is already active does not open another code prompt or send a redundant command.

The inline keypad remains available when popup code entry is disabled. The horizontal countdown bar replaces the original circular countdown ring.

## Screenshot

![Alarmo card state and configuration example](screenshots/state-config-example.png)

## Requirements

- Home Assistant **2026.5 or later**.
- The [Alarmo integration](https://github.com/nielsfaber/alarmo), installed and configured.
- An `alarm_control_panel` entity provided by Alarmo.

## Installation

Use the JavaScript bundle from **this fork**. The upstream download does not include these changes.

1. Download [dist/alarmo-card.js](https://github.com/juangiler/alarmo-card-custom/blob/main/dist/alarmo-card.js) using GitHub’s **Download raw file** button.
2. Copy it to `<Home Assistant config>/www/alarmo-card/alarmo-card.js`, creating the folders if needed.
3. Add the following dashboard resource as a JavaScript module:

   ```yaml
   url: /local/alarmo-card/alarmo-card.js?v=1
   type: module
   ```

4. Refresh Home Assistant in your browser or app.

If the original Alarmo Card is already installed, replace its resource with this fork’s resource. Load only one version: both register `custom:alarmo-card`.

To update, replace the JavaScript file and increase the resource URL’s version query, for example from `?v=1` to `?v=2`, then refresh.

## Configuration

The card keeps the original `custom:alarmo-card` type and entity configuration. Enable `use_code_dialog` to use the popup and its blurred background:

```yaml
type: custom:alarmo-card
entity: alarm_control_panel.alarmo
use_code_dialog: true
font_size: 16
icon_size: 24
```

| Setting           | Default | Description                                                                                              |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `font_size`       | `16`    | Base card text size in pixels, from 12 to 24.                                                            |
| `icon_size`       | `24`    | Base card icon size in pixels, from 16 to 40.                                                            |
| `use_code_dialog` | `false` | Request required codes in a popup. Leave `hide_keypad` and `keep_keypad_visible` disabled when using it. |

The background blur is enabled automatically for code popups and has no separate setting. Other inherited options are documented in the [upstream configuration reference](https://github.com/nielsfaber/alarmo-card#options).

## Build from source

From this repository, with Node.js and npm installed:

```sh
npm install
npm run build
```

The compiled bundle is written to `dist/alarmo-card.js`. Install or update it using the steps above.

## Code quality checks

GitHub Actions checks linting, TypeScript types, and formatting on pushes and pull requests. Run the same checks locally:

```sh
npm run lint
npm run typecheck
npm run format:check
```

These checks do not modify files. Use `npm run lint:fix` or `npm run format` to apply fixes. Formatting excludes generated bundles and the dependency lockfile.

To run all three checks automatically before each commit, enable the Bash hook once per clone:

```sh
npm run hooks:install
```

The hook checks the current working tree and blocks the commit if any check fails. It does not fix or stage files automatically.
