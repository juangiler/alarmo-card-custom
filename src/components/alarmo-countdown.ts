import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { PENDING_STATES } from '../const';
import { fetchCountdown } from '../data/websockets';
import { HomeAssistant } from '../lib/types';

@customElement('alarmo-countdown')
export class AlarmoCountdown extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @property() entity!: string;

  @state() private _remaining = 0;
  private _duration = 0;
  private _deadline = 0;
  private _interval?: number;
  private _request = 0;

  connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated) this._syncCountdown();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopCountdown();
  }

  protected updated(changed: PropertyValues) {
    this.toggleAttribute('active', this._remaining > 0);
    const previousHass = changed.get('hass') as HomeAssistant | undefined;
    const previous = previousHass?.states[this.entity];
    const current = this.hass?.states[this.entity];
    if (
      changed.has('entity') ||
      (changed.has('hass') &&
        (!previous ||
          previous.state !== current?.state ||
          previous.last_changed !== current?.last_changed ||
          previous.attributes.delay !== current?.attributes.delay ||
          previous.attributes.expiration !== current?.attributes.expiration))
    ) {
      this._syncCountdown();
    }
  }

  private _stopCountdown() {
    this._request++;
    window.clearInterval(this._interval);
    this._interval = undefined;
    this._remaining = 0;
  }

  private async _syncCountdown() {
    this._stopCountdown();
    const entity = this.hass?.states[this.entity];
    if (!this.isConnected || !entity || !PENDING_STATES.includes(entity.state)) return;
    const request = this._request;
    const started = performance.now();
    try {
      const countdown = await fetchCountdown(this.hass, this.entity);
      if (request !== this._request || !this.isConnected) return;
      if (!Number.isFinite(countdown.delay) || !Number.isFinite(countdown.remaining) || countdown.delay <= 0) return;
      this._duration = countdown.delay;
      this._deadline = started + Math.min(countdown.delay, Math.max(0, countdown.remaining)) * 1000;
      this._tick();
      if (this._remaining > 0) this._interval = window.setInterval(() => this._tick(), 100);
    } catch {
      // Keep the card usable if countdown data is temporarily unavailable.
    }
  }

  private _tick() {
    this._remaining = Math.max(0, (this._deadline - performance.now()) / 1000);
    if (!this._remaining) {
      window.clearInterval(this._interval);
      this._interval = undefined;
    }
  }

  protected render() {
    if (this._remaining <= 0) return html``;
    const seconds = Math.ceil(this._remaining);
    return html`
      <div class="countdown">
        <div class="seconds">${seconds}<span>s</span></div>
        <div
          class="track"
          role="progressbar"
          aria-label=${this.hass.localize('ui.panel.lovelace.editor.card.alarm_control_panel.name') || 'Alarm'}
          aria-valuemin="0"
          aria-valuemax=${this._duration}
          aria-valuenow=${Math.min(seconds, this._duration)}
          aria-valuetext=${`${seconds}s`}
        >
          <div class="fill" style="width: ${(this._remaining / this._duration) * 100}%"></div>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: none;
    }
    :host([active]) {
      display: block;
      flex: 0 1 80px;
      min-width: 40px;
    }
    .countdown {
      color: var(--alarm-state-color, var(--primary-color));
    }
    .seconds {
      text-align: center;
      font-size: calc(var(--alarmo-card-font-size, 16px) * 0.75);
      font-variant-numeric: tabular-nums;
      line-height: 1.5;
      font-weight: 500;
    }
    .seconds span {
      margin-left: 2px;
    }
    .track {
      height: 6px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--divider-color, rgba(127, 127, 127, 0.2));
      direction: ltr;
    }
    .fill {
      height: 100%;
      border-radius: inherit;
      background: currentColor;
      transition: width 100ms linear;
    }
    @media (prefers-reduced-motion: reduce) {
      .fill {
        transition: none;
      }
    }
  `;
}
