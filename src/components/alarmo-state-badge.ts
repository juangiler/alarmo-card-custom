import { LitElement, html, css, PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { ICONS, PENDING_STATES } from '../const';
import { HomeAssistant } from '../lib/types';
import { fireEvent } from '../lib/fire-event';

class AlarmoStateBadge extends LitElement {
  @property()
  hass!: HomeAssistant;

  @property()
  entity!: string;

  private _delayActive = false;

  private _touchStarted = false;

  @state()
  public _hover = false;

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!changedProps.size) return true;
    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
    if (!oldHass || oldHass.themes !== this.hass!.themes || oldHass.language !== this.hass!.language) return true;
    if (
      oldHass.states[this.entity].state !== this.hass.states[this.entity].state ||
      oldHass.states[this.entity].attributes.delay !== this.hass.states[this.entity].attributes.delay
    ) {
      const oldState = oldHass.states[this.entity].state;
      const newState = this.hass.states[this.entity].state;
      if (PENDING_STATES.includes(newState)) this.startTimer();
      else if (PENDING_STATES.includes(oldState)) this.stopTimer();
      return true;
    }

    return false;
  }

  firstUpdated() {
    const state = this.hass.states[this.entity].state;
    if (PENDING_STATES.includes(state)) this.startTimer();

    this.addEventListener('click', this.handleClick);
    this.addEventListener('touchstart', () => {
      this._touchStarted = true;
    });
    this.addEventListener('touchend', () => {
      setTimeout(() => {
        this._touchStarted = false;
      }, 10);
    });
    this.addEventListener('mouseenter', () => {
      if (this._touchStarted) return;
      this._hover = true;
    });
    this.addEventListener('mouseleave', () => {
      this._hover = false;
    });
  }

  startTimer() {
    this._delayActive = true;
  }

  stopTimer() {
    this._delayActive = false;
  }

  private _stateValue(state: string) {
    if (this._hover && PENDING_STATES.includes(state) && this._delayActive) {
      return html` <ha-icon icon="mdi:skip-forward"></ha-icon> `;
    } else {
      return html` <ha-icon .icon=${ICONS[state]}></ha-icon> `;
    }
  }

  handleClick() {
    const state = this.hass.states[this.entity].state;
    if (PENDING_STATES.includes(state) && this._delayActive) {
      this.hass!.callService('alarmo', 'skip_delay', {
        entity_id: this.entity,
      });
    } else {
      fireEvent(this, 'hass-more-info', { entityId: this.entity });
    }
  }

  render() {
    const stateObj = this.hass.states[this.entity];

    return html`
      <div class="overlay ${stateObj.state.split('_').shift()}">
        <div class="value">${this._stateValue(stateObj.state)}</div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host {
        width: calc(var(--alarmo-card-icon-size, 24px) * 2.5);
        height: calc(var(--alarmo-card-icon-size, 24px) * 2.5);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .overlay {
        width: 100%;
        height: 100%;
        display: flex;
      }
      .value {
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
        color: var(--alarm-state-color);
        display: flex;
        flex: 1;
        height: 100%;
        align-items: center;
        justify-content: center;
        font-weight: 500;
      }
      .value ha-icon {
        --mdc-icon-size: calc(var(--alarmo-card-icon-size, 24px) * 1.25);
      }
      .disarmed,
      .armed {
        animation: none;
      }
      .triggered,
      .arming,
      .pending {
        animation: pulse 1s infinite;
      }
      @keyframes pulse {
        0% {
          opacity: 1;
        }
        50% {
          opacity: 0;
        }
        100% {
          opacity: 1;
        }
      }
    `;
  }
}
customElements.define('alarmo-state-badge', AlarmoStateBadge);
