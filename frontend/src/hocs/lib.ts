import { GearApi, decodeAddress } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { TransactionBuilder, getServiceNamePrefix, getFnNamePrefix, ZERO_ADDRESS } from 'sails-js';

export type ActorId = string;

export type Outcome = 'Home' | 'Draw' | 'Away';

export interface UserBetView {
  match_id: number | string | bigint;
  selected: Outcome;
  amount: number | string | bigint;
  paid: boolean;
}

export interface MatchInfo {
  match_id: number | string | bigint;
  phase: string;
  home: string;
  away: string;
  kick_off: number | string | bigint;
  result: ResultStatus;
  pool_home: number | string | bigint;
  pool_draw: number | string | bigint;
  pool_away: number | string | bigint;
  has_bets: boolean;
  participants: ActorId[];
}

export type ResultStatus =
  | { Unresolved: null }
  | { Proposed: { outcome: Outcome; oracle: ActorId } }
  | { Finalized: { outcome: Outcome } };

export interface IoBolaoState {
  owner: ActorId;
  kyc_contract: ActorId;
  final_prize_distributor: ActorId;
  fee_accum: number | string | bigint;
  final_prize_accum: number | string | bigint;
  matches: MatchInfo[];
  phases: MatchPhase[];
  user_points: Array<[ActorId, number]>;
}

export interface MatchPhase {
  name: string;
  start_time: number | string | bigint;
  end_time: number | string | bigint;
}

export type PhaseRegisteredEvent = string;

export type MatchRegisteredEvent = [number | string | bigint, string, string, string, number | string | bigint];

export interface BetAcceptedEvent {
  actor_id: ActorId;
  match_id: number | string | bigint;
  selected: Outcome;
  amount: number | string | bigint;
}

export interface ResultProposedEvent {
  match_id: number | string | bigint;
  outcome: Outcome;
  oracle: ActorId;
}

export interface ResultFinalizedEvent {
  match_id: number | string | bigint;
  outcome: Outcome;
}

export interface WinnerPaidEvent {
  match_id: number | string | bigint;
  winner: ActorId;
  amount: number | string | bigint;
}

export interface FinalPrizeSentEvent {
  amount: number | string | bigint;
  recipient: ActorId;
}

export interface FeeWithdrawnEvent {
  amount: number | string | bigint;
  recipient: ActorId;
}

const types = {
  Outcome: { _enum: ['Home', 'Draw', 'Away'] },
  UserBetView: {
    match_id: 'u64',
    selected: 'Outcome',
    amount: 'u128',
    paid: 'bool',
  },
  MatchInfo: {
    match_id: 'u64',
    phase: 'String',
    home: 'String',
    away: 'String',
    kick_off: 'u64',
    result: 'ResultStatus',
    pool_home: 'u128',
    pool_draw: 'u128',
    pool_away: 'u128',
    has_bets: 'bool',
    participants: 'Vec<[u8;32]>',
  },
  ResultStatus: {
    _enum: {
      Unresolved: 'Null',
      Proposed: '{"outcome":"Outcome","oracle":"[u8;32]"}',
      Finalized: '{"outcome":"Outcome"}',
    },
  },
  IoBolaoState: {
    owner: '[u8;32]',
    kyc_contract: '[u8;32]',
    final_prize_distributor: '[u8;32]',
    fee_accum: 'u128',
    final_prize_accum: 'u128',
    matches: 'Vec<MatchInfo>',
    phases: 'Vec<MatchPhase>',
    user_points: 'Vec<([u8;32], u32)>',
  },
  MatchPhase: {
    name: 'String',
    start_time: 'u64',
    end_time: 'u64',
  },
  BetAccepted: {
    actor_id: '[u8;32]',
    match_id: 'u64',
    selected: 'Outcome',
    amount: 'u128',
  },
  ResultProposed: {
    match_id: 'u64',
    outcome: 'Outcome',
    oracle: '[u8;32]',
  },
  ResultFinalized: {
    match_id: 'u64',
    outcome: 'Outcome',
  },
  WinnerPaid: {
    match_id: 'u64',
    winner: '[u8;32]',
    amount: 'u128',
  },
  FinalPrizeSent: {
    amount: 'u128',
    recipient: '[u8;32]',
  },
  FeeWithdrawn: {
    amount: 'u128',
    recipient: '[u8;32]',
  },
  MatchRegistered: '(u64, String, String, String, u64)',
  PhaseRegistered: 'String',
  BolaoEvent: {
    _enum: {
      PhaseRegistered: 'PhaseRegistered',
      MatchRegistered: 'MatchRegistered',
      BetAccepted: 'BetAccepted',
      ResultProposed: 'ResultProposed',
      ResultFinalized: 'ResultFinalized',
      WinnerPaid: 'WinnerPaid',
      FinalPrizeSent: 'FinalPrizeSent',
      FeeWithdrawn: 'FeeWithdrawn',
    },
  },
};

export type BolaoEvent =
  | { PhaseRegistered: PhaseRegisteredEvent }
  | { MatchRegistered: MatchRegisteredEvent }
  | { BetAccepted: BetAcceptedEvent }
  | { ResultProposed: ResultProposedEvent }
  | { ResultFinalized: ResultFinalizedEvent }
  | { WinnerPaid: WinnerPaidEvent }
  | { FinalPrizeSent: FinalPrizeSentEvent }
  | { FeeWithdrawn: FeeWithdrawnEvent };

const withAt = (atBlock?: `0x${string}`) => (atBlock ? { at: atBlock } : {});

export class Program {
  public readonly registry: TypeRegistry;
  public readonly service: Service;

  constructor(public api: GearApi, private _programId?: `0x${string}`) {
    this.registry = new TypeRegistry();
    this.registry.setKnownTypes({ types });
    this.registry.register(types);
    this.service = new Service(this);
  }

  public get programId(): `0x${string}` {
    if (!this._programId) throw new Error('Program ID is not set');
    return this._programId;
  }

  newCtorFromCode(code: Uint8Array | Buffer, kyc_contract: ActorId, final_prize_distributor: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'upload_program',
      ['New', kyc_contract, final_prize_distributor],
      '(String, [u8;32], [u8;32])',
      'String',
      code,
    );
    this._programId = builder.programId;
    return builder;
  }

  newCtorFromCodeId(codeId: `0x${string}`, kyc_contract: ActorId, final_prize_distributor: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'create_program',
      ['New', kyc_contract, final_prize_distributor],
      '(String, [u8;32], [u8;32])',
      'String',
      codeId,
    );
    this._programId = builder.programId;
    return builder;
  }
}

export class Service {
  constructor(private _program: Program) {}

  public bet(match_id: number | string | bigint, selected: Outcome): TransactionBuilder<BolaoEvent> {
    return new TransactionBuilder<BolaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'Bet', match_id, selected],
      '(String, String, u64, Outcome)',
      'BolaoEvent',
      this._program.programId,
    );
  }

  public finalizeResult(match_id: number | string | bigint): TransactionBuilder<BolaoEvent> {
    return new TransactionBuilder<BolaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'FinalizeResult', match_id],
      '(String, String, u64)',
      'BolaoEvent',
      this._program.programId,
    );
  }

  public payoutWinners(match_id: number | string | bigint): TransactionBuilder<BolaoEvent[]> {
    return new TransactionBuilder<BolaoEvent[]>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'PayoutWinners', match_id],
      '(String, String, u64)',
      'Vec<BolaoEvent>',
      this._program.programId,
    );
  }

  public proposeResult(match_id: number | string | bigint, outcome: Outcome): TransactionBuilder<BolaoEvent> {
    return new TransactionBuilder<BolaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ProposeResult', match_id, outcome],
      '(String, String, u64, Outcome)',
      'BolaoEvent',
      this._program.programId,
    );
  }

  public registerMatch(
    phase: string,
    home: string,
    away: string,
    kick_off: number | string | bigint,
  ): TransactionBuilder<BolaoEvent> {
    return new TransactionBuilder<BolaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RegisterMatch', phase, home, away, kick_off],
      '(String, String, String, String, String, u64)',
      'BolaoEvent',
      this._program.programId,
    );
  }

  public registerPhase(
    phase_name: string,
    start_time: number | string | bigint,
    end_time: number | string | bigint,
  ): TransactionBuilder<BolaoEvent> {
    return new TransactionBuilder<BolaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RegisterPhase', phase_name, start_time, end_time],
      '(String, String, String, u64, u64)',
      'BolaoEvent',
      this._program.programId,
    );
  }

  public sendFinalPrize(): TransactionBuilder<BolaoEvent> {
    return new TransactionBuilder<BolaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SendFinalPrize'],
      '(String, String)',
      'BolaoEvent',
      this._program.programId,
    );
  }

  public withdrawFees(): TransactionBuilder<BolaoEvent> {
    return new TransactionBuilder<BolaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'WithdrawFees'],
      '(String, String)',
      'BolaoEvent',
      this._program.programId,
    );
  }

  public async queryBetsByUser(
    user: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<UserBetView[]> {
    const payload = this._program.registry
      .createType('(String, String, [u8;32])', ['Service', 'QueryBetsByUser', user])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock),
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Vec<UserBetView>)', reply.payload);
    return result[2].toJSON() as unknown as UserBetView[]; // ✅
  }

  public async queryMatch(
    match_id: number | string | bigint,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<MatchInfo | null> {
    const payload = this._program.registry
      .createType('(String, String, u64)', ['Service', 'QueryMatch', match_id])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock),
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Option<MatchInfo>)', reply.payload);
    return result[2].toJSON() as unknown as MatchInfo | null; // ✅
  }

  public async queryMatchesByPhase(
    phase: string,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<MatchInfo[]> {
    const payload = this._program.registry
      .createType('(String, String, String)', ['Service', 'QueryMatchesByPhase', phase])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock),
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Vec<MatchInfo>)', reply.payload);
    return result[2].toJSON() as unknown as MatchInfo[]; // ✅
  }

  public async queryState(
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<IoBolaoState> {
    const payload = this._program.registry
      .createType('(String, String)', ['Service', 'QueryState'])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock),
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, IoBolaoState)', reply.payload);
    return result[2].toJSON() as unknown as IoBolaoState; // ✅
  }

  public async queryUserPoints(
    user: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<number> {
    const payload = this._program.registry
      .createType('(String, String, [u8;32])', ['Service', 'QueryUserPoints', user])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock),
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, u32)', reply.payload);
    return result[2].toNumber();
  }

  public subscribeToPhaseRegisteredEvent(
    callback: (data: PhaseRegisteredEvent) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PhaseRegistered') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, PhaseRegistered)', message.payload)[2].toJSON() as unknown as PhaseRegisteredEvent
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToMatchRegisteredEvent(
    callback: (data: MatchRegisteredEvent) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchRegistered') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, MatchRegistered)', message.payload)[2].toJSON() as unknown as MatchRegisteredEvent
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToBetAcceptedEvent(
    callback: (data: BetAcceptedEvent) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'BetAccepted') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, BetAccepted)', message.payload)[2].toJSON() as unknown as BetAcceptedEvent
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToResultProposedEvent(
    callback: (data: ResultProposedEvent) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultProposed') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, ResultProposed)', message.payload)[2].toJSON() as unknown as ResultProposedEvent
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToResultFinalizedEvent(
    callback: (data: ResultFinalizedEvent) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultFinalized') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, ResultFinalized)', message.payload)[2].toJSON() as unknown as ResultFinalizedEvent
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToWinnerPaidEvent(
    callback: (data: WinnerPaidEvent) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'WinnerPaid') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, WinnerPaid)', message.payload)[2].toJSON() as unknown as WinnerPaidEvent
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToFinalPrizeSentEvent(
    callback: (data: FinalPrizeSentEvent) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'FinalPrizeSent') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, FinalPrizeSent)', message.payload)[2].toJSON() as unknown as FinalPrizeSentEvent
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToFeeWithdrawnEvent(
    callback: (data: FeeWithdrawnEvent) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'FeeWithdrawn') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, FeeWithdrawn)', message.payload)[2].toJSON() as unknown as FeeWithdrawnEvent
          ),
        ).catch(console.error);
      }
    });
  }
}
