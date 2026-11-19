import { css, html, LitElement, nothing, PropertyValues, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { UnsubscribeFunc } from 'home-assistant-js-websocket';
import { AlarmoEntity, AlarmoEvent } from '../types';
import { ActionToState, AlarmoEvents, AlarmStates, ArmActions, EVENT } from '../const';
import { SubscribeMixin } from '../subscribe-mixin';
import { HomeAssistant } from '../lib/types';
import { localize } from '../localize/localize';

type ValidHassDomEvent = keyof HASSDomEvents;

export interface HassDialog<T = HASSDomEvents[ValidHassDomEvent]> extends HTMLElement {
  showDialog(params: T);
  closeDialog?: () => boolean;
}

export interface CodeDialogParams {
  code_format: 'text' | 'number';
  area_id?: string | number | null;
  entity_id: string;
  action: ArmActions;
  armOptions: any;
  confirm?: (ev: AlarmoEvents) => void;
  cancel?: () => void;
}

@customElement('alarmo-code-dialog')
export class AlarmoCodeDialog extends SubscribeMixin(LitElement) implements HassDialog<CodeDialogParams> {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _params?: CodeDialogParams;

  @state() private _input = '';

  _codeClearTimer = 0;

  @state() private _submitted = false;

  @state() private _status = '';

  private _submitTimer = 0;

  public hassSubscribe(): Promise<UnsubscribeFunc>[] {
    return [
      this.hass!.connection.subscribeMessage((ev) => this._fetchData(ev as unknown as AlarmoEvent), { type: EVENT }),
    ];
  }

  private async _fetchData(ev: AlarmoEvent): Promise<void> {
    if (!this._params || String(ev.data.area_id ?? '') !== String(this._params.area_id ?? '')) return;
    switch (ev.data.event) {
      case AlarmoEvents.Disarm:
        this._confirm(ev.data.event);
        break;
      case AlarmoEvents.Arm:
        this._confirm(ev.data.event);
        break;
      case AlarmoEvents.Trigger:
        this._confirm(ev.data.event);
        break;
      case AlarmoEvents.InvalidCodeProvided:
      case AlarmoEvents.NoCodeProvided:
        this._finishSubmit();
        this._showCodeError();
        break;
      case AlarmoEvents.FailedToArm:
        this._confirm(ev.data.event);
        break;
      case AlarmoEvents.CommandNotAllowed:
        this._confirm(ev.data.event);
        break;
      case AlarmoEvents.TriggerTimeExpired:
        break;
      case AlarmoEvents.ReadyToArmModesChanged:
        break;
    }
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
    if (changedProps.has('_params') || !this._params) return true;
    else if (changedProps.has('_input') || changedProps.has('_submitted') || changedProps.has('_status')) return true;
    else if (!oldHass) return true;
    else if (oldHass.states[this._params!.entity_id] !== this.hass!.states[this._params!.entity_id]) {
      return true;
    }
    return false;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this._submitted || !this._params || !changedProps.has('hass')) return;
    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
    const oldState = oldHass?.states[this._params.entity_id]?.state;
    const entity = this.hass?.states[this._params.entity_id] as AlarmoEntity | undefined;
    if (!entity || oldState === entity.state) return;

    const target = ActionToState[this._params.action];
    if (entity.state === target) {
      this._confirm(this._params.action === ArmActions.Disarm ? AlarmoEvents.Disarm : AlarmoEvents.Arm);
    } else if (
      this._params.action !== ArmActions.Disarm &&
      entity.state === AlarmStates.Arming &&
      entity.attributes.arm_mode === target
    ) {
      this._confirm(AlarmoEvents.Arm);
    }
  }

  protected firstUpdated(changedProps) {
    super.firstUpdated(changedProps);
    this.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && this._input.length) {
        ev.preventDefault();
        this._submit();
      }
    });
  }

  public async showDialog(dialogParams: CodeDialogParams): Promise<void> {
    this._finishSubmit();
    this._cancelCodeClearTimer();
    this._params = dialogParams;
    this._input = '';
    await this.updateComplete;
  }

  public closeDialog() {
    this._params = undefined;
    this._finishSubmit();
    this._input = '';
    this._cancelCodeClearTimer();
    return true;
  }

  private _showCodeError() {
    const inputField = this.shadowRoot?.querySelector('#code');
    if (inputField) {
      inputField.classList.remove('error');
      inputField.classList.add('error');
      (inputField as any).hint = localize('errors.invalid_pin', this.hass!.language);
    }
  }

  private _clearCodeError() {
    const inputField = this.shadowRoot?.querySelector('#code');
    if (inputField && inputField.classList.contains('error')) {
      inputField.classList.remove('error');
      (inputField as any).hint = '';
      this._input = '';
      this._cancelCodeClearTimer();
    }
  }

  private _clearCode() {
    this._input = '';
    this._clearCodeError();
    this._cancelCodeClearTimer();
  }

  private _setCodeClearTimer() {
    this._cancelCodeClearTimer();
    if (this._input.length) {
      this._codeClearTimer = window.setTimeout(() => {
        this._clearCode();
      }, 120000); //clear code after 120 sec inactivity
    }
  }

  private _cancelCodeClearTimer() {
    if (this._codeClearTimer) {
      clearTimeout(this._codeClearTimer);
    }
  }

  private _finishSubmit(): void {
    this._submitted = false;
    this._status = '';
    window.clearTimeout(this._submitTimer);
    this._submitTimer = 0;
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._finishSubmit();
    this._cancelCodeClearTimer();
  }

  private async _submit(): Promise<void> {
    if (!this._params || this._submitted) return;
    const params = this._params;
    const code = this._input ?? '';
    this._clearCodeError();
    this._submitted = true;
    this._status = '';
    this._submitTimer = window.setTimeout(() => {
      this._finishSubmit();
      this._status = localize('code_dialog.no_confirmation', this.hass!.language);
    }, 20000);

    try {
      if (params.action === ArmActions.Disarm) {
        await this.hass!.callService('alarmo', 'disarm', {
          entity_id: params.entity_id,
          code,
        });
      } else {
        await this.hass!.callService('alarmo', 'arm', {
          ...params.armOptions,
          entity_id: params.entity_id,
          mode: ActionToState[params.action],
          code,
        });
      }
    } catch {
      if (this._params !== params || !this._submitted) return;
      this._finishSubmit();
      this._status = localize('code_dialog.submit_failed', this.hass!.language);
    }
  }

  private _confirm(ev: AlarmoEvents): void {
    const confirm = this._params?.confirm;
    this.closeDialog();
    confirm?.(ev);
  }

  private _cancel(): void {
    const cancel = this._params?.cancel;
    this.closeDialog();
    cancel?.();
  }

  protected render() {
    if (!this._params || !this.hass) {
      return nothing;
    }

    const isText = this._params.code_format === 'text';

    if (isText) {
      return html`
        <ha-dialog
          open
          type="alert"
          @closed=${this._cancel}
          header-title="${this.hass.localize('ui.dialogs.enter_code.title')}"
          width="small"
          class="code-dialog"
        >
          <ha-input
            class="input"
            autofocus
            .disabled=${this._submitted}
            .value=${this._input}
            id="code"
            .label=${this.hass.localize('ui.dialogs.enter_code.input_label')}
            type="password"
            inputmode="text"
            enterkeyhint="done"
            @input=${(ev: Event) => {
              this._clearCodeError();
              this._input = (ev.target as HTMLInputElement).value;
              this._setCodeClearTimer();
            }}
            @focus=${this._clearCodeError}
          ></ha-input>
          <p class="submit-status" role="status" aria-live="polite">
            ${this._submitted ? localize('code_dialog.submitting', this.hass.language) : this._status}
          </p>
          <ha-dialog-footer>
            <ha-button slot="secondaryAction" data-dialog="close" appearance="plain">
              ${this.hass.localize('ui.common.cancel')}
            </ha-button>
            <ha-button .disabled=${this._submitted} @click=${this._submit} slot="primaryAction">
              ${this.hass.localize('ui.common.submit')}
            </ha-button>
          </ha-dialog-footer>
        </ha-dialog>
      `;
    }

    return html`
      <ha-dialog
        open
        type="alert"
        header-title="${this.hass.localize('ui.dialogs.enter_code.title')}"
        @closed=${this._cancel}
        width="small"
        class="code-dialog"
      >
        <div class="container">
          <ha-input
            class="input"
            autofocus
            .disabled=${this._submitted}
            .value=${this._input}
            id="code"
            .label=${this.hass.localize('ui.dialogs.enter_code.input_label')}
            type="password"
            inputmode="numeric"
            enterkeyhint="done"
            @input=${(ev: Event) => {
              this._clearCodeError();
              this._input = (ev.target as HTMLInputElement).value;
              this._setCodeClearTimer();
            }}
            @focus=${this._clearCodeError}
          ></ha-input>
        </div>
        <p class="submit-status" role="status" aria-live="polite">
          ${this._submitted ? localize('code_dialog.submitting', this.hass.language) : this._status}
        </p>
        <ha-dialog-footer>
          <ha-button slot="secondaryAction" data-dialog="close" appearance="plain">
            ${this.hass.localize('ui.common.cancel')}
          </ha-button>
          <ha-button .disabled=${this._submitted} @click=${this._submit} slot="primaryAction">
            ${this.hass.localize('ui.common.submit')}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  static styles = css`
    ha-dialog {
      /* Place above other dialogs */
      --dialog-z-index: 104;
    }
    ha-dialog.code-dialog {
      --ha-dialog-border-radius: 24px;
      --ha-dialog-scrim-backdrop-filter: blur(4px);
      --dialog-backdrop-filter: blur(4px);
      --vertical-align-dialog: center;
      --dialog-container-padding: 16px;
      --ha-dialog-max-height: calc(100svh - 32px);
    }
    ha-input {
      width: 100%;
      max-width: 320px;
      margin: 16px auto;
      text-align: center;
      --ha-input-border-radius: 16px;
      --mdc-shape-small: 16px;
      --mdc-text-field-outlined-border-radius: 16px;
    }
    ha-input.error {
      animation: shake 0.2s ease-in-out 0s 2;
      margin-bottom: 0px;
      --ha-color-border-neutral-loud: var(--ha-color-on-danger-quiet);
    }
    ha-input.error:not([value='']) {
      --secondary-text-color: var(--ha-color-on-danger-quiet);
    }
    ha-input.error::part(wa-hint) {
      color: var(--ha-color-on-danger-quiet);
    }
    @keyframes shake {
      0% {
        transform: translateX(0);
      }
      25% {
        transform: translateX(10px);
      }
      75% {
        transform: translateX(-10px);
      }
      100% {
        transform: translateX(0);
      }
    }
    .submit-status {
      text-align: center;
      color: var(--secondary-text-color);
    }
    .container {
      display: flex;
      align-items: center;
      flex-direction: column;
    }
    .hidden {
      display: none;
    }
    .buttons {
      margin-top: 12px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'alarmo-code-dialog': AlarmoCodeDialog;
  }
}
