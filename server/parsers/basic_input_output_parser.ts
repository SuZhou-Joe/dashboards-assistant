/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IInput, IOutput } from '../../common/types/chat_saved_object_attributes';
import { Interaction } from '../types';

export const BasicInputOutputParser = {
  order: 0,
  id: 'output_message',
  async parserProvider(interaction: Interaction) {
    const inputItem: IInput = {
      type: 'input',
      contentType: 'text',
      content: interaction.input,
    };
    const outputItems: IOutput[] = [
      {
        type: 'output',
        contentType: 'markdown',
        content: interaction.response,
        traceId: interaction.parent_interaction_id,
      },
    ];
    return [inputItem, ...outputItems];
  },
};
