import { GearApi, decodeAddress } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { TransactionBuilder, getServiceNamePrefix, getFnNamePrefix, ZERO_ADDRESS } from 'sails-js';

export type ActorId = string;

export interface Score {
  home: number;
  away: number;
}

export type PenaltyWinner = 'Home' | 'Away';

export interface UserBetView {
  match_id: number | string | bigint;
  score: Score;
  penalty_winner: PenaltyWinner | null;
  stake_in_match_pool: number | string | bigint;
  claimed: boolean;
}

export interface Match {
  match_id: number | string | bigint;
  phase: string;
  home: string;
  away: string;
  kick_off: number | string | bigint;
  result: ResultStatus;
  match_prize_pool: number | string | bigint;
  has_bets: boolean;
  participants: Array<ActorId>;
  total_winner_stake: number | string | bigint;
  total_claimed: number | string | bigint;
  settlement_prepared: boolean;
  dust_swept: boolean;
}

export type ResultStatus =
  | 'Unresolved'
  | {
      Proposed: {
        score: Score;
        penalty_winner: PenaltyWinner | null;
        oracle: ActorId;
      };
    }
  | {
      Finalized: {
        score: Score;
        penalty_winner: PenaltyWinner | null;
      };
    };

export interface IoSmartCupState {
  admin: ActorId;
  final_prize_distributor: ActorId;
  protocol_fee_accumulated: number | string | bigint;
  final_prize_accumulated: number | string | bigint;
  matches: Array<Match>;
  phases: Array<PhaseConfig>;
  user_points: Array<[ActorId, number]>;
  podium_finalized: boolean;
  r32_lock_time: number | string | bigint | null;
}

export interface PhaseConfig {
  name: string;
  start_time: number | string | bigint;
  end_time: number | string | bigint;
  points_weight: number;
}

export interface WalletClaimStatus {
  wallet: ActorId;
  amount_claimable: number | string | bigint;
  already_claimed: boolean;
}

export type SmartCupEvent =
  | { PhaseRegistered: string }
  | {
      MatchRegistered: [
        number | string | bigint,
        string,
        string,
        string,
        number | string | bigint,
      ];
    }
  | { OracleAuthorized: [ActorId, boolean] }
  | {
      BetAccepted: [
        ActorId,
        number | string | bigint,
        Score,
        PenaltyWinner | null,
        number | string | bigint,
      ];
    }
  | {
      ResultProposed: [
        number | string | bigint,
        Score,
        PenaltyWinner | null,
        ActorId,
      ];
    }
  | {
      ResultFinalized: [
        number | string | bigint,
        Score,
        PenaltyWinner | null,
      ];
    }
  | { SettlementPrepared: [number | string | bigint, number | string | bigint] }
  | { PointsAwarded: [ActorId, number | string | bigint, number] }
  | { MatchRewardClaimed: [number | string | bigint, ActorId, number | string | bigint] }
  | { MatchDustSwept: [number | string | bigint, number | string | bigint] }
  | { PodiumPickSubmitted: [ActorId, string, string, string] }
  | { PodiumFinalized: [string, string, string] }
  | { PodiumBonusAwarded: [ActorId, number] }
  | { FinalPrizeSent: [number | string | bigint, ActorId] }
  | { ProtocolFeesWithdrawn: [number | string | bigint, ActorId] };

const types = {
  Score: {
    home: 'u8',
    away: 'u8',
  },
  PenaltyWinner: { _enum: ['Home', 'Away'] },
  UserBetView: {
    match_id: 'u64',
    score: 'Score',
    penalty_winner: 'Option<PenaltyWinner>',
    stake_in_match_pool: 'u128',
    claimed: 'bool',
  },
  Match: {
    match_id: 'u64',
    phase: 'String',
    home: 'String',
    away: 'String',
    kick_off: 'u64',
    result: 'ResultStatus',
    match_prize_pool: 'u128',
    has_bets: 'bool',
    participants: 'Vec<[u8;32]>',
    total_winner_stake: 'u128',
    total_claimed: 'u128',
    settlement_prepared: 'bool',
    dust_swept: 'bool',
  },
  ResultStatus: {
    _enum: {
      Unresolved: 'Null',
      Proposed:
        '{"score":"Score","penalty_winner":"Option<PenaltyWinner>","oracle":"[u8;32]"}',
      Finalized: '{"score":"Score","penalty_winner":"Option<PenaltyWinner>"}',
    },
  },
  IoSmartCupState: {
    admin: '[u8;32]',
    final_prize_distributor: '[u8;32]',
    protocol_fee_accumulated: 'u128',
    final_prize_accumulated: 'u128',
    matches: 'Vec<Match>',
    phases: 'Vec<PhaseConfig>',
    user_points: 'Vec<([u8;32], u32)>',
    podium_finalized: 'bool',
    r32_lock_time: 'Option<u64>',
  },
  PhaseConfig: {
    name: 'String',
    start_time: 'u64',
    end_time: 'u64',
    points_weight: 'u32',
  },
  WalletClaimStatus: {
    wallet: '[u8;32]',
    amount_claimable: 'u128',
    already_claimed: 'bool',
  },
  PhaseRegistered: 'String',
  MatchRegistered: '(u64, String, String, String, u64)',
  OracleAuthorized: '([u8;32], bool)',
  BetAccepted: '([u8;32], u64, Score, Option<PenaltyWinner>, u128)',
  ResultProposed: '(u64, Score, Option<PenaltyWinner>, [u8;32])',
  ResultFinalized: '(u64, Score, Option<PenaltyWinner>)',
  SettlementPrepared: '(u64, u128)',
  PointsAwarded: '([u8;32], u64, u32)',
  MatchRewardClaimed: '(u64, [u8;32], u128)',
  MatchDustSwept: '(u64, u128)',
  PodiumPickSubmitted: '([u8;32], String, String, String)',
  PodiumFinalized: '(String, String, String)',
  PodiumBonusAwarded: '([u8;32], u32)',
  FinalPrizeSent: '(u128, [u8;32])',
  ProtocolFeesWithdrawn: '(u128, [u8;32])',
  SmartCupEvent: {
    _enum: {
      PhaseRegistered: 'PhaseRegistered',
      MatchRegistered: 'MatchRegistered',
      OracleAuthorized: 'OracleAuthorized',
      BetAccepted: 'BetAccepted',
      ResultProposed: 'ResultProposed',
      ResultFinalized: 'ResultFinalized',
      SettlementPrepared: 'SettlementPrepared',
      PointsAwarded: 'PointsAwarded',
      MatchRewardClaimed: 'MatchRewardClaimed',
      MatchDustSwept: 'MatchDustSwept',
      PodiumPickSubmitted: 'PodiumPickSubmitted',
      PodiumFinalized: 'PodiumFinalized',
      PodiumBonusAwarded: 'PodiumBonusAwarded',
      FinalPrizeSent: 'FinalPrizeSent',
      ProtocolFeesWithdrawn: 'ProtocolFeesWithdrawn',
    },
  },
};

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

  newCtorFromCode(code: Uint8Array | Buffer, final_prize_distributor: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'upload_program',
      ['New', final_prize_distributor],
      '(String, [u8;32])',
      'String',
      code,
    );
    this._programId = builder.programId;
    return builder;
  }

  newCtorFromCodeId(codeId: `0x${string}`, final_prize_distributor: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'create_program',
      ['New', final_prize_distributor],
      '(String, [u8;32])',
      'String',
      codeId,
    );
    this._programId = builder.programId;
    return builder;
  }
}

export class Service {
  constructor(private _program: Program) {}

  public claimMatchReward(match_id: number | string | bigint): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ClaimMatchReward', match_id],
      '(String, String, u64)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public finalizePodium(
    champion: string,
    runner_up: string,
    third_place: string,
  ): TransactionBuilder<SmartCupEvent[]> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent[]>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'FinalizePodium', champion, runner_up, third_place],
      '(String, String, String, String, String)',
      'Vec<SmartCupEvent>',
      this._program.programId,
    );
  }

  public finalizeResult(match_id: number | string | bigint): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'FinalizeResult', match_id],
      '(String, String, u64)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public placeBet(
    match_id: number | string | bigint,
    predicted_score: Score,
    predicted_penalty_winner: PenaltyWinner | null,
  ): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'PlaceBet', match_id, predicted_score, predicted_penalty_winner],
      '(String, String, u64, Score, Option<PenaltyWinner>)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public prepareMatchSettlement(match_id: number | string | bigint): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'PrepareMatchSettlement', match_id],
      '(String, String, u64)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public proposeResult(
    match_id: number | string | bigint,
    final_score: Score,
    penalty_winner: PenaltyWinner | null,
  ): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ProposeResult', match_id, final_score, penalty_winner],
      '(String, String, u64, Score, Option<PenaltyWinner>)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public registerMatch(
    phase: string,
    home: string,
    away: string,
    kick_off: number | string | bigint,
  ): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RegisterMatch', phase, home, away, kick_off],
      '(String, String, String, String, String, u64)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public registerPhase(
    phase_name: string,
    start_time: number | string | bigint,
    end_time: number | string | bigint,
    points_weight: number,
  ): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RegisterPhase', phase_name, start_time, end_time, points_weight],
      '(String, String, String, u64, u64, u32)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public sendFinalPrize(): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SendFinalPrize'],
      '(String, String)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public setOracleAuthorized(oracle: ActorId, authorized: boolean): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetOracleAuthorized', oracle, authorized],
      '(String, String, [u8;32], bool)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public submitPodiumPick(
    champion: string,
    runner_up: string,
    third_place: string,
  ): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SubmitPodiumPick', champion, runner_up, third_place],
      '(String, String, String, String, String)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public sweepMatchDustToFinalPrize(match_id: number | string | bigint): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SweepMatchDustToFinalPrize', match_id],
      '(String, String, u64)',
      'SmartCupEvent',
      this._program.programId,
    );
  }

  public withdrawProtocolFees(): TransactionBuilder<SmartCupEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<SmartCupEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'WithdrawProtocolFees'],
      '(String, String)',
      'SmartCupEvent',
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
      at: atBlock ?? undefined,
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Vec<UserBetView>)', reply.payload);
    return result[2].toJSON() as unknown as UserBetView[];
  }

  public async queryMatch(
    match_id: number | string | bigint,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<Match | null> {
    const payload = this._program.registry
      .createType('(String, String, u64)', ['Service', 'QueryMatch', match_id])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Option<Match>)', reply.payload);
    return result[2].toJSON() as unknown as Match | null;
  }

  public async queryMatchesByPhase(
    phase: string,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<Match[]> {
    const payload = this._program.registry
      .createType('(String, String, String)', ['Service', 'QueryMatchesByPhase', phase])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Vec<Match>)', reply.payload);
    return result[2].toJSON() as unknown as Match[];
  }

  public async queryState(
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<IoSmartCupState> {
    const payload = this._program.registry.createType('(String, String)', ['Service', 'QueryState']).toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, IoSmartCupState)', reply.payload);
    return result[2].toJSON() as unknown as IoSmartCupState;
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
      at: atBlock ?? undefined,
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, u32)', reply.payload);
    return result[2].toNumber();
  }

  public async queryWalletClaimStatus(
    wallet: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<WalletClaimStatus> {
    const payload = this._program.registry
      .createType('(String, String, [u8;32])', ['Service', 'QueryWalletClaimStatus', wallet])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, WalletClaimStatus)', reply.payload);
    return result[2].toJSON() as unknown as WalletClaimStatus;
  }

  public subscribeToPhaseRegisteredEvent(callback: (data: string) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PhaseRegistered') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, PhaseRegistered)', message.payload)[2].toString()),
        ).catch(console.error);
      }
    });
  }

  public subscribeToMatchRegisteredEvent(
    callback: (data: [number | string | bigint, string, string, string, number | string | bigint]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchRegistered') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, MatchRegistered)', message.payload)[2].toJSON() as unknown as [
              number | string | bigint,
              string,
              string,
              string,
              number | string | bigint,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToOracleAuthorizedEvent(
    callback: (data: [ActorId, boolean]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'OracleAuthorized') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, OracleAuthorized)', message.payload)[2].toJSON() as unknown as [
              ActorId,
              boolean,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToBetAcceptedEvent(
    callback: (
      data: [ActorId, number | string | bigint, Score, PenaltyWinner | null, number | string | bigint],
    ) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'BetAccepted') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, BetAccepted)', message.payload)[2].toJSON() as unknown as [
              ActorId,
              number | string | bigint,
              Score,
              PenaltyWinner | null,
              number | string | bigint,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToResultProposedEvent(
    callback: (data: [number | string | bigint, Score, PenaltyWinner | null, ActorId]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultProposed') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, ResultProposed)', message.payload)[2].toJSON() as unknown as [
              number | string | bigint,
              Score,
              PenaltyWinner | null,
              ActorId,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToResultFinalizedEvent(
    callback: (data: [number | string | bigint, Score, PenaltyWinner | null]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultFinalized') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, ResultFinalized)', message.payload)[2].toJSON() as unknown as [
              number | string | bigint,
              Score,
              PenaltyWinner | null,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToSettlementPreparedEvent(
    callback: (data: [number | string | bigint, number | string | bigint]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'SettlementPrepared') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, SettlementPrepared)', message.payload)[2].toJSON() as unknown as [
              number | string | bigint,
              number | string | bigint,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToPointsAwardedEvent(
    callback: (data: [ActorId, number | string | bigint, number]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PointsAwarded') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, PointsAwarded)', message.payload)[2].toJSON() as unknown as [
              ActorId,
              number | string | bigint,
              number,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToMatchRewardClaimedEvent(
    callback: (data: [number | string | bigint, ActorId, number | string | bigint]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchRewardClaimed') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, MatchRewardClaimed)', message.payload)[2].toJSON() as unknown as [
              number | string | bigint,
              ActorId,
              number | string | bigint,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToMatchDustSweptEvent(
    callback: (data: [number | string | bigint, number | string | bigint]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchDustSwept') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, MatchDustSwept)', message.payload)[2].toJSON() as unknown as [
              number | string | bigint,
              number | string | bigint,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToPodiumPickSubmittedEvent(
    callback: (data: [ActorId, string, string, string]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PodiumPickSubmitted') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, PodiumPickSubmitted)', message.payload)[2].toJSON() as unknown as [
              ActorId,
              string,
              string,
              string,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToPodiumFinalizedEvent(
    callback: (data: [string, string, string]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PodiumFinalized') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, PodiumFinalized)', message.payload)[2].toJSON() as unknown as [
              string,
              string,
              string,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToPodiumBonusAwardedEvent(
    callback: (data: [ActorId, number]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PodiumBonusAwarded') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, PodiumBonusAwarded)', message.payload)[2].toJSON() as unknown as [
              ActorId,
              number,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToFinalPrizeSentEvent(
    callback: (data: [number | string | bigint, ActorId]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'FinalPrizeSent') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, FinalPrizeSent)', message.payload)[2].toJSON() as unknown as [
              number | string | bigint,
              ActorId,
            ],
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToProtocolFeesWithdrawnEvent(
    callback: (data: [number | string | bigint, ActorId]) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ProtocolFeesWithdrawn') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, ProtocolFeesWithdrawn)', message.payload)[2].toJSON() as unknown as [
              number | string | bigint,
              ActorId,
            ],
          ),
        ).catch(console.error);
      }
    });
  }
}
