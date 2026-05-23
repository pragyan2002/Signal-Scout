import type { Prospect } from '../types.js';
import { BlueskySource } from './BlueskySource.js';
import { MockTwitterSource } from './MockTwitterSource.js';
import type { SignalSource } from './SignalSource.js';

export interface DispatchConfig {
  fixturesRoot: string;
}

export function createDispatcher(config: DispatchConfig): (prospect: Prospect) => SignalSource {
  const mock = new MockTwitterSource(config.fixturesRoot);
  const bsky = new BlueskySource();
  return (prospect) => {
    switch (prospect.platform) {
      case 'twitter':
      case 'linkedin':
        return mock;
      case 'bluesky':
        return bsky;
    }
  };
}
