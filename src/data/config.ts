import {
  AlarmStates,
  minButtonScale,
  maxButtonScale,
  minFontSize,
  maxFontSize,
  minIconSize,
  maxIconSize,
} from '../const';
import { CardConfig, StateConfig } from '../types';
import { isDefined } from '../helpers';
import { computeDomain } from '../lib/compute-domain';

export const validateConfig = (config?: Partial<CardConfig> & { button_scale?: any }) => {
  if (!config || !config.entity || computeDomain(config.entity) !== 'alarm_control_panel') {
    throw new Error('Invalid configuration provided for entity');
  } else if (
    isDefined(config.button_scale_keypad) &&
    (typeof config.button_scale_keypad !== 'number' ||
      config.button_scale_keypad < minButtonScale ||
      config.button_scale_keypad > maxButtonScale)
  ) {
    throw new Error('Invalid configuration provided for button_scale_keypad');
  } else if (
    isDefined(config.button_scale_actions) &&
    (typeof config.button_scale_actions !== 'number' ||
      config.button_scale_actions < minButtonScale ||
      config.button_scale_actions > maxButtonScale)
  ) {
    throw new Error('Invalid configuration provided for button_scale_actions');
  } else if (
    isDefined(config.font_size) &&
    (typeof config.font_size !== 'number' || config.font_size < minFontSize || config.font_size > maxFontSize)
  ) {
    throw new Error('Invalid configuration provided for font_size');
  } else if (
    isDefined(config.icon_size) &&
    (typeof config.icon_size !== 'number' || config.icon_size < minIconSize || config.icon_size > maxIconSize)
  ) {
    throw new Error('Invalid configuration provided for icon_size');
  }
};

export const calcStateConfig = (state: AlarmStates, config: Partial<CardConfig>) => {
  let result: Partial<StateConfig> = {
    hide: false,
  };

  if ((config.states || {}).hasOwnProperty(state)) result = { ...result, ...config.states![state] };

  return result;
};
