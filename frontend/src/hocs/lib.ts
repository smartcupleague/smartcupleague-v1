import { GearApi, decodeAddress } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { TransactionBuilder, getServiceNamePrefix, getFnNamePrefix, ZERO_ADDRESS } from 'sails-js';

export type ActorId = string;

export type ProcessState = 'Initial' | 'Registered' | 'InReview' | 'Preliminary' | 'Appeal' | 'Final' | 'Closed';

export interface ScholarshipProcess {
  matricula: bigint;
  checklist_validated: boolean;
  committee_reviewed: boolean;
  preliminary_result: boolean | null;
  appealed: boolean;
  final_result: boolean | null;
  docs: string[];
  closed: boolean;
  state: ProcessState;
}
export interface Income {
  rfc: string;
  amount: bigint;
  date: bigint;
}
export interface Expense {
  matricula: bigint;
  amount: bigint;
  date: bigint;
  clabe: string;
}
export interface IoScholarshipState {
  students: Student[];
  universities: University[];
  committees: Committee[];
  investors: Investor[];
  incomes: Income[];
  expenses: Expense[];
  processes: ScholarshipProcess[];
}
export interface Student {
  matricula: bigint;
  curp: string;
  birth_certificate: string;
  prior_certificate: string;
  address: string;
  clabe: string;
  docs: string[];
  state: ProcessState;
}
export interface University {
  university_id: bigint;
  rfc: string;
}
export interface Committee {
  matricula: bigint;
  curp: string;
}
export interface Investor {
  matricula: bigint;
  rfc: string;
  clabe: string;
}

export type ScholarshipEvent =
  | { StudentRegistered: bigint }
  | { UniversityRegistered: bigint }
  | { CommitteeRegistered: bigint }
  | { InvestorRegistered: bigint }
  | { IncomeAdded: { 0: string; 1: bigint } }
  | { ExpenseAdded: { 0: bigint; 1: bigint } }
  | { ProcessAdvanced: { 0: bigint; 1: ProcessState } }
  | { DocumentationAdded: bigint }
  | { ProcessClosed: bigint }
  | { Error: string };

const types = {
  ProcessState: { _enum: ['Initial', 'Registered', 'InReview', 'Preliminary', 'Appeal', 'Final', 'Closed'] },
  ScholarshipProcess: {
    matricula: 'u64',
    checklist_validated: 'bool',
    committee_reviewed: 'bool',
    preliminary_result: 'Option<bool>',
    appealed: 'bool',
    final_result: 'Option<bool>',
    docs: 'Vec<String>',
    closed: 'bool',
    state: 'ProcessState',
  },
  Income: {
    rfc: 'String',
    amount: 'u128',
    date: 'u64',
  },
  Expense: {
    matricula: 'u64',
    amount: 'u128',
    date: 'u64',
    clabe: 'String',
  },
  IoScholarshipState: {
    students: 'Vec<Student>',
    universities: 'Vec<University>',
    committees: 'Vec<Committee>',
    investors: 'Vec<Investor>',
    incomes: 'Vec<Income>',
    expenses: 'Vec<Expense>',
    processes: 'Vec<ScholarshipProcess>',
  },
  Student: {
    matricula: 'u64',
    curp: 'String',
    birth_certificate: 'String',
    prior_certificate: 'String',
    address: 'String',
    clabe: 'String',
    docs: 'Vec<String>',
    state: 'ProcessState',
  },
  University: {
    university_id: 'u64',
    rfc: 'String',
  },
  Committee: {
    matricula: 'u64',
    curp: 'String',
  },
  Investor: {
    matricula: 'u64',
    rfc: 'String',
    clabe: 'String',
  },
  IncomeAdded: { 0: 'String', 1: 'u128' },
  ExpenseAdded: { 0: 'u64', 1: 'u128' },
  ProcessAdvanced: { 0: 'u64', 1: 'ProcessState' },
  ScholarshipEvent: {
    _enum: {
      StudentRegistered: 'u64',
      UniversityRegistered: 'u64',
      CommitteeRegistered: 'u64',
      InvestorRegistered: 'u64',
      IncomeAdded: 'IncomeAdded',
      ExpenseAdded: 'ExpenseAdded',
      ProcessAdvanced: 'ProcessAdvanced',
      DocumentationAdded: 'u64',
      ProcessClosed: 'u64',
      Error: 'String',
    },
  },
};

const asJson = <T>(codec: { toJSON(): unknown }): T => codec.toJSON() as unknown as T;

function readTuple2<A, B>(codec: { toJSON(): unknown }): [A, B] {
  const j: any = codec.toJSON();
  if (Array.isArray(j)) return [j[0] as A, j[1] as B];
  return [j['0'] as A, j['1'] as B];
}

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

  newCtorFromCode(code: Uint8Array | Buffer): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'upload_program',
      'New',
      'String',
      'String',
      code,
    );
    this._programId = builder.programId;
    return builder;
  }

  newCtorFromCodeId(codeId: `0x${string}`): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'create_program',
      'New',
      'String',
      'String',
      codeId,
    );
    this._programId = builder.programId;
    return builder;
  }
}

export class Service {
  constructor(private _program: Program) {}

  public addDocumentation(matricula: bigint | number | string, document: string): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'AddDocumentation', matricula, document],
      '(String, String, u64, String)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public addExpense(
    matricula: bigint | number | string,
    amount: bigint | number | string,
    date: bigint | number | string,
    clabe: string,
  ): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'AddExpense', matricula, amount, date, clabe],
      '(String, String, u64, u128, u64, String)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public addIncome(
    rfc: string,
    amount: bigint | number | string,
    date: bigint | number | string,
  ): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'AddIncome', rfc, amount, date],
      '(String, String, String, u128, u64)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public advanceProcess(
    matricula: bigint | number | string,
    next_stage: ProcessState,
  ): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'AdvanceProcess', matricula, next_stage],
      '(String, String, u64, ProcessState)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public closeProcess(matricula: bigint | number | string): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'CloseProcess', matricula],
      '(String, String, u64)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public registerCommittee(curp: string, matricula: bigint | number | string): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'RegisterCommittee', curp, matricula],
      '(String, String, String, u64)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public registerInvestor(rfc: string, clabe: string): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'RegisterInvestor', rfc, clabe],
      '(String, String, String, String)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public registerStudent(
    curp: string,
    birth_certificate: string,
    prior_certificate: string,
    address: string,
    clabe: string,
  ): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'RegisterStudent', curp, birth_certificate, prior_certificate, address, clabe],
      '(String, String, String, String, String, String, String)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public registerUniversity(rfc: string): TransactionBuilder<ScholarshipEvent> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<ScholarshipEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['EduGrantsService', 'RegisterUniversity', rfc],
      '(String, String, String)',
      'ScholarshipEvent',
      this._program.programId,
    );
  }

  public async queryProcessState(
    matricula: bigint | number | string,
    originAddress?: string,
    value?: bigint | number | string,
    atBlock?: `0x${string}`,
  ): Promise<ScholarshipProcess | null> {
    const payload = this._program.registry
      .createType('(String, String, u64)', ['EduGrantsService', 'QueryProcessState', matricula])
      .toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Option<ScholarshipProcess>)', reply.payload);
    // toJSON() => ScholarshipProcess | null
    return asJson<ScholarshipProcess | null>(result[2]);
  }

  public async queryResourcesByMatricula(
    matricula: bigint | number | string,
    originAddress?: string,
    value?: bigint | number | string,
    atBlock?: `0x${string}`,
  ): Promise<{ incomes: Income[]; expenses: Expense[] }> {
    const payload = this._program.registry
      .createType('(String, String, u64)', ['EduGrantsService', 'QueryResourcesByMatricula', matricula])
      .toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, (Vec<Income>, Vec<Expense>))', reply.payload);

    const [incomes, expenses] = readTuple2<Income[], Expense[]>(result[2]); // ✅ sin quejarse TS
    return { incomes, expenses };
  }

  public async queryState(
    originAddress?: string,
    value?: bigint | number | string,
    atBlock?: `0x${string}`,
  ): Promise<IoScholarshipState> {
    const payload = this._program.registry.createType('(String, String)', ['EduGrantsService', 'QueryState']).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, IoScholarshipState)', reply.payload);

    return asJson<IoScholarshipState>(result[2]);
  }

  public async queryStudent(
    matricula: bigint | number | string,
    originAddress?: string,
    value?: bigint | number | string,
    atBlock?: `0x${string}`,
  ): Promise<Student | null> {
    const payload = this._program.registry
      .createType('(String, String, u64)', ['EduGrantsService', 'QueryStudent', matricula])
      .toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Option<Student>)', reply.payload);
    return asJson<Student | null>(result[2]);
  }

  public subscribeToStudentRegisteredEvent(callback: (data: bigint) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'StudentRegistered') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, u64)', message.payload)[2].toBigInt()),
        ).catch(console.error);
      }
    });
  }

  public subscribeToUniversityRegisteredEvent(callback: (data: bigint) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'UniversityRegistered') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, u64)', message.payload)[2].toBigInt()),
        ).catch(console.error);
      }
    });
  }

  public subscribeToCommitteeRegisteredEvent(callback: (data: bigint) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'CommitteeRegistered') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, u64)', message.payload)[2].toBigInt()),
        ).catch(console.error);
      }
    });
  }

  public subscribeToInvestorRegisteredEvent(callback: (data: bigint) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'InvestorRegistered') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, u64)', message.payload)[2].toBigInt()),
        ).catch(console.error);
      }
    });
  }

  public subscribeToIncomeAddedEvent(
    callback: (data: { 0: string; 1: bigint }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'IncomeAdded') {
        void Promise.resolve(
          callback(
            ((): { 0: string; 1: bigint } => {
              const [a, b] = readTuple2<string, bigint>(
                this._program.registry.createType('(String, String, IncomeAdded)', message.payload)[2],
              );

              return { 0: a, 1: b };
            })(),
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToExpenseAddedEvent(
    callback: (data: { 0: bigint; 1: bigint }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'ExpenseAdded') {
        void Promise.resolve(
          callback(
            ((): { 0: bigint; 1: bigint } => {
              const [a, b] = readTuple2<bigint, bigint>(
                this._program.registry.createType('(String, String, ExpenseAdded)', message.payload)[2],
              );
              return { 0: a, 1: b };
            })(),
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToProcessAdvancedEvent(
    callback: (data: { 0: bigint; 1: ProcessState }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'ProcessAdvanced') {
        void Promise.resolve(
          callback(
            ((): { 0: bigint; 1: ProcessState } => {
              const [a, b] = readTuple2<bigint, ProcessState>(
                this._program.registry.createType('(String, String, ProcessAdvanced)', message.payload)[2],
              );
              return { 0: a, 1: b };
            })(),
          ),
        ).catch(console.error);
      }
    });
  }

  public subscribeToDocumentationAddedEvent(callback: (data: bigint) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'DocumentationAdded') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, u64)', message.payload)[2].toBigInt()),
        ).catch(console.error);
      }
    });
  }

  public subscribeToProcessClosedEvent(callback: (data: bigint) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'ProcessClosed') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, u64)', message.payload)[2].toBigInt()),
        ).catch(console.error);
      }
    });
  }

  public subscribeToErrorEvent(callback: (data: string) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'EduGrantsService' && getFnNamePrefix(payload) === 'Error') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, String)', message.payload)[2].toString()),
        ).catch(console.error);
      }
    });
  }
}
