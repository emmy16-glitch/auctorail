export interface ExecutionKillSwitch {
  isDisabled(): Promise<boolean>;
}

export interface MutableExecutionKillSwitch extends ExecutionKillSwitch {
  disable(reason: string): Promise<void>;
  enable(reason: string): Promise<void>;
}

export interface KillSwitchStateStore {
  read(): Promise<{ disabled: boolean; reason?: string }>;
  write(state: { disabled: boolean; reason: string }): Promise<void>;
}

/** A store failure is treated as disabled: availability never creates authority. */
export class DurableExecutionKillSwitch implements MutableExecutionKillSwitch {
  constructor(private readonly store: KillSwitchStateStore) {}

  async isDisabled(): Promise<boolean> {
    try {
      return (await this.store.read()).disabled;
    } catch {
      return true;
    }
  }

  async disable(reason: string): Promise<void> {
    await this.store.write({ disabled: true, reason });
  }

  async enable(reason: string): Promise<void> {
    await this.store.write({ disabled: false, reason });
  }
}
