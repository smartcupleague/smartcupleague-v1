
import { GearApi } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { TransactionBuilder } from 'sails-js';

export type ActorId = `0x${string}`;

/**
 * Minimal BolaoCore-Program client for oracle-server usage.
 * Only exposes the methods needed by the oracle bridge.
 */
export class BolaoProgram {
  public readonly registry: TypeRegistry;
  public readonly service: BolaoService;

  constructor(
    public api: GearApi,
    private _programId?: ActorId,
  ) {
    this.registry = new TypeRegistry();
    // Register only the types needed for propose_from_oracle
    const types = {
      PenaltyWinner: { _enum: ['Home', 'Away'] },
    };
    this.registry.setKnownTypes({ types });
    this.registry.register(types);
    this.service = new BolaoService(this);
  }

  public get programId(): ActorId {
    if (!this._programId) throw new Error('BolaoCore Program ID is not set');
    return this._programId;
  }
}

export class BolaoService {
  constructor(private _program: BolaoProgram) {}

  /**
   * Triggers BolaoCore to pull the finalized result directly from Oracle-Program.
   * BolaoCore independently verifies the result on-chain — no result data is sent here.
   *
   * @param match_id       - Match ID registered in BolaoCore
   * @param oracle_program_id - ActorId of the authorized Oracle-Program on Vara
   */
  public proposeFromOracle(
    match_id: number | string | bigint,
    oracle_program_id: ActorId,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ProposeFromOracle', match_id, oracle_program_id],
      '(String, String, u64, [u8;32])',
      'Null',
      this._program.programId,
    );
  }
}
