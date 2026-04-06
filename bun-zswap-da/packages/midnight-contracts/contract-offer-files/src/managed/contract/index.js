import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.15.0');

const _descriptor_0 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

const _descriptor_1 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_2 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

class _ShieldedCoinInfo_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_1.alignment().concat(_descriptor_0.alignment()));
  }
  fromValue(value_0) {
    return {
      nonce: _descriptor_1.fromValue(value_0),
      color: _descriptor_1.fromValue(value_0),
      value: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.nonce).concat(_descriptor_1.toValue(value_0.color).concat(_descriptor_0.toValue(value_0.value)));
  }
}

const _descriptor_3 = new _ShieldedCoinInfo_0();

class _ContractAddress_0 {
  alignment() {
    return _descriptor_1.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.bytes);
  }
}

const _descriptor_4 = new _ContractAddress_0();

class _ZswapCoinPublicKey_0 {
  alignment() {
    return _descriptor_1.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.bytes);
  }
}

const _descriptor_5 = new _ZswapCoinPublicKey_0();

const _descriptor_6 = __compactRuntime.CompactTypeBoolean;

class _Either_0 {
  alignment() {
    return _descriptor_6.alignment().concat(_descriptor_5.alignment().concat(_descriptor_4.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_6.fromValue(value_0),
      left: _descriptor_5.fromValue(value_0),
      right: _descriptor_4.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_6.toValue(value_0.is_left).concat(_descriptor_5.toValue(value_0.left).concat(_descriptor_4.toValue(value_0.right)));
  }
}

const _descriptor_7 = new _Either_0();

const _descriptor_8 = __compactRuntime.CompactTypeField;

const _descriptor_9 = new __compactRuntime.CompactTypeBytes(21);

class _CoinPreimage_0 {
  alignment() {
    return _descriptor_9.alignment().concat(_descriptor_3.alignment().concat(_descriptor_6.alignment().concat(_descriptor_1.alignment())));
  }
  fromValue(value_0) {
    return {
      domain_sep: _descriptor_9.fromValue(value_0),
      info: _descriptor_3.fromValue(value_0),
      dataType: _descriptor_6.fromValue(value_0),
      data: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_9.toValue(value_0.domain_sep).concat(_descriptor_3.toValue(value_0.info).concat(_descriptor_6.toValue(value_0.dataType).concat(_descriptor_1.toValue(value_0.data))));
  }
}

const _descriptor_10 = new _CoinPreimage_0();

const _descriptor_11 = new __compactRuntime.CompactTypeVector(2, _descriptor_1);

class _Either_1 {
  alignment() {
    return _descriptor_6.alignment().concat(_descriptor_1.alignment().concat(_descriptor_1.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_6.fromValue(value_0),
      left: _descriptor_1.fromValue(value_0),
      right: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_6.toValue(value_0.is_left).concat(_descriptor_1.toValue(value_0.left).concat(_descriptor_1.toValue(value_0.right)));
  }
}

const _descriptor_12 = new _Either_1();

const _descriptor_13 = new __compactRuntime.CompactTypeVector(3, _descriptor_8);

class _UserAddress_0 {
  alignment() {
    return _descriptor_1.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.bytes);
  }
}

const _descriptor_14 = new _UserAddress_0();

class _Either_2 {
  alignment() {
    return _descriptor_6.alignment().concat(_descriptor_4.alignment().concat(_descriptor_14.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_6.fromValue(value_0),
      left: _descriptor_4.fromValue(value_0),
      right: _descriptor_14.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_6.toValue(value_0.is_left).concat(_descriptor_4.toValue(value_0.left).concat(_descriptor_14.toValue(value_0.right)));
  }
}

const _descriptor_15 = new _Either_2();

const _descriptor_16 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      mint_shielded: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`mint_shielded: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const domain_sep_0 = args_1[1];
        const amount_0 = args_1[2];
        const nonce_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('mint_shielded',
                                     'argument 1 (as invoked from Typescript)',
                                     'offer-files.compact line 14 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(domain_sep_0.buffer instanceof ArrayBuffer && domain_sep_0.BYTES_PER_ELEMENT === 1 && domain_sep_0.length === 32)) {
          __compactRuntime.typeError('mint_shielded',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'offer-files.compact line 14 char 1',
                                     'Bytes<32>',
                                     domain_sep_0)
        }
        if (!(typeof(amount_0) === 'bigint' && amount_0 >= 0n && amount_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('mint_shielded',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'offer-files.compact line 14 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount_0)
        }
        if (!(typeof(nonce_0) === 'bigint' && nonce_0 >= 0n && nonce_0 <= 340282366920938463463374607431768211455n)) {
          __compactRuntime.typeError('mint_shielded',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'offer-files.compact line 14 char 1',
                                     'Uint<0..340282366920938463463374607431768211456>',
                                     nonce_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(domain_sep_0).concat(_descriptor_2.toValue(amount_0).concat(_descriptor_0.toValue(nonce_0))),
            alignment: _descriptor_1.alignment().concat(_descriptor_2.alignment().concat(_descriptor_0.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._mint_shielded_0(context,
                                               partialProofData,
                                               domain_sep_0,
                                               amount_0,
                                               nonce_0);
        partialProofData.output = { value: _descriptor_3.toValue(result_0), alignment: _descriptor_3.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      mint_unshielded: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`mint_unshielded: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const domainSep_0 = args_1[1];
        const amount_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('mint_unshielded',
                                     'argument 1 (as invoked from Typescript)',
                                     'offer-files.compact line 27 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(domainSep_0.buffer instanceof ArrayBuffer && domainSep_0.BYTES_PER_ELEMENT === 1 && domainSep_0.length === 32)) {
          __compactRuntime.typeError('mint_unshielded',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'offer-files.compact line 27 char 1',
                                     'Bytes<32>',
                                     domainSep_0)
        }
        if (!(typeof(amount_0) === 'bigint' && amount_0 >= 0n && amount_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('mint_unshielded',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'offer-files.compact line 27 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(domainSep_0).concat(_descriptor_2.toValue(amount_0)),
            alignment: _descriptor_1.alignment().concat(_descriptor_2.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._mint_unshielded_0(context,
                                                 partialProofData,
                                                 domainSep_0,
                                                 amount_0);
        partialProofData.output = { value: _descriptor_1.toValue(result_0), alignment: _descriptor_1.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      incrementNoun: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`incrementNoun: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('incrementNoun',
                                     'argument 1 (as invoked from Typescript)',
                                     'offer-files.compact line 36 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._incrementNoun_0(context, partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      }
    };
    this.impureCircuits = {
      mint_shielded: this.circuits.mint_shielded,
      mint_unshielded: this.circuits.mint_unshielded,
      incrementNoun: this.circuits.incrementNoun
    };
    this.provableCircuits = {
      mint_shielded: this.circuits.mint_shielded,
      mint_unshielded: this.circuits.mint_unshielded,
      incrementNoun: this.circuits.incrementNoun
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('mint_shielded', new __compactRuntime.ContractOperation());
    state_0.setOperation('mint_unshielded', new __compactRuntime.ContractOperation());
    state_0.setOperation('incrementNoun', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext(__compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_16.toValue(0n),
                                                                                              alignment: _descriptor_16.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _left_0(value_0) {
    return { is_left: true, left: value_0, right: { bytes: new Uint8Array(32) } };
  }
  _left_1(value_0) {
    return { is_left: true, left: value_0, right: { bytes: new Uint8Array(32) } };
  }
  _left_2(value_0) {
    return { is_left: true, left: value_0, right: new Uint8Array(32) };
  }
  _tokenType_0(domain_sep_0, contractAddress_0) {
    return this._persistentCommit_0([domain_sep_0, contractAddress_0.bytes],
                                    new Uint8Array([109, 105, 100, 110, 105, 103, 104, 116, 58, 100, 101, 114, 105, 118, 101, 95, 116, 111, 107, 101, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  }
  _mintShieldedToken_0(context,
                       partialProofData,
                       domain_sep_0,
                       value_0,
                       nonce_0,
                       recipient_0)
  {
    const coin_0 = { nonce: nonce_0,
                     color:
                       this._tokenType_0(domain_sep_0,
                                         _descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                   partialProofData,
                                                                                                   [
                                                                                                    { dup: { n: 2 } },
                                                                                                    { idx: { cached: true,
                                                                                                             pushPath: false,
                                                                                                             path: [
                                                                                                                    { tag: 'value',
                                                                                                                      value: { value: _descriptor_16.toValue(0n),
                                                                                                                               alignment: _descriptor_16.alignment() } }] } },
                                                                                                    { popeq: { cached: true,
                                                                                                               result: undefined } }]).value)),
                     value: value_0 };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { swap: { n: 0 } },
                                       { idx: { cached: true,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_16.toValue(4n),
                                                                  alignment: _descriptor_16.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(domain_sep_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { dup: { n: 1 } },
                                       { dup: { n: 1 } },
                                       'member',
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(value_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { swap: { n: 0 } },
                                       'neg',
                                       { branch: { skip: 4 } },
                                       { dup: { n: 2 } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: true,
                                                pushPath: false,
                                                path: [ { tag: 'stack' }] } },
                                       'add',
                                       { ins: { cached: true, n: 2 } },
                                       { swap: { n: 0 } }]);
    this._createZswapOutput_0(context, partialProofData, coin_0, recipient_0);
    const cm_0 = this._coinCommitment_0(coin_0, recipient_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { swap: { n: 0 } },
                                       { idx: { cached: true,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_16.toValue(2n),
                                                                  alignment: _descriptor_16.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(cm_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: true, n: 2 } },
                                       { swap: { n: 0 } }]);
    if (!recipient_0.is_left
        &&
        this._equal_0(recipient_0.right.bytes,
                      _descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                partialProofData,
                                                                                [
                                                                                 { dup: { n: 2 } },
                                                                                 { idx: { cached: true,
                                                                                          pushPath: false,
                                                                                          path: [
                                                                                                 { tag: 'value',
                                                                                                   value: { value: _descriptor_16.toValue(0n),
                                                                                                            alignment: _descriptor_16.alignment() } }] } },
                                                                                 { popeq: { cached: true,
                                                                                            result: undefined } }]).value).bytes))
    {
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { swap: { n: 0 } },
                                         { idx: { cached: true,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_16.toValue(1n),
                                                                    alignment: _descriptor_16.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(cm_0),
                                                                                                alignment: _descriptor_1.alignment() }).encode() } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: true, n: 2 } },
                                         { swap: { n: 0 } }]);
    }
    return coin_0;
  }
  _evolveNonce_0(index_0, nonce_0) {
    return this._upgradeFromTransient_0(this._transientHash_0([__compactRuntime.convertBytesToField(28,
                                                                                                    new Uint8Array([109, 105, 100, 110, 105, 103, 104, 116, 58, 107, 101, 114, 110, 101, 108, 58, 110, 111, 110, 99, 101, 95, 101, 118, 111, 108, 118, 101]),
                                                                                                    '<standard library>'),
                                                               index_0,
                                                               this._degradeToTransient_0(nonce_0)]));
  }
  _coinCommitment_0(coin_0, recipient_0) {
    return this._persistentHash_0({ domain_sep:
                                      new Uint8Array([109, 105, 100, 110, 105, 103, 104, 116, 58, 122, 115, 119, 97, 112, 45, 99, 99, 91, 118, 49, 93]),
                                    info: coin_0,
                                    dataType: recipient_0.is_left,
                                    data:
                                      recipient_0.is_left ?
                                      recipient_0.left.bytes :
                                      recipient_0.right.bytes });
  }
  _mintUnshieldedToken_0(context,
                         partialProofData,
                         domainSep_0,
                         amount_0,
                         recipient_0)
  {
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { swap: { n: 0 } },
                                       { idx: { cached: true,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_16.toValue(5n),
                                                                  alignment: _descriptor_16.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(domainSep_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { dup: { n: 1 } },
                                       { dup: { n: 1 } },
                                       'member',
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(amount_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { swap: { n: 0 } },
                                       'neg',
                                       { branch: { skip: 4 } },
                                       { dup: { n: 2 } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: true,
                                                pushPath: false,
                                                path: [ { tag: 'stack' }] } },
                                       'add',
                                       { ins: { cached: true, n: 2 } },
                                       { swap: { n: 0 } }]);
    const color_0 = this._tokenType_0(domainSep_0,
                                      _descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                partialProofData,
                                                                                                [
                                                                                                 { dup: { n: 2 } },
                                                                                                 { idx: { cached: true,
                                                                                                          pushPath: false,
                                                                                                          path: [
                                                                                                                 { tag: 'value',
                                                                                                                   value: { value: _descriptor_16.toValue(0n),
                                                                                                                            alignment: _descriptor_16.alignment() } }] } },
                                                                                                 { popeq: { cached: true,
                                                                                                            result: undefined } }]).value));
    const tmp_0 = this._left_2(color_0);
    const tmp_1 = amount_0;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { swap: { n: 0 } },
                                       { idx: { cached: true,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_16.toValue(8n),
                                                                  alignment: _descriptor_16.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell(__compactRuntime.alignedConcat(
                                                                                              { value: _descriptor_12.toValue(tmp_0),
                                                                                                alignment: _descriptor_12.alignment() },
                                                                                              { value: _descriptor_15.toValue(recipient_0),
                                                                                                alignment: _descriptor_15.alignment() }
                                                                                            )).encode() } },
                                       { dup: { n: 1 } },
                                       { dup: { n: 1 } },
                                       'member',
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_1),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { swap: { n: 0 } },
                                       'neg',
                                       { branch: { skip: 4 } },
                                       { dup: { n: 2 } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: true,
                                                pushPath: false,
                                                path: [ { tag: 'stack' }] } },
                                       'add',
                                       { ins: { cached: true, n: 2 } },
                                       { swap: { n: 0 } }]);
    if (recipient_0.is_left
        &&
        this._equal_1(recipient_0.left.bytes,
                      _descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                partialProofData,
                                                                                [
                                                                                 { dup: { n: 2 } },
                                                                                 { idx: { cached: true,
                                                                                          pushPath: false,
                                                                                          path: [
                                                                                                 { tag: 'value',
                                                                                                   value: { value: _descriptor_16.toValue(0n),
                                                                                                            alignment: _descriptor_16.alignment() } }] } },
                                                                                 { popeq: { cached: true,
                                                                                            result: undefined } }]).value).bytes))
    {
      const tmp_2 = this._left_2(color_0);
      const tmp_3 = amount_0;
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { swap: { n: 0 } },
                                         { idx: { cached: true,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_16.toValue(6n),
                                                                    alignment: _descriptor_16.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_12.toValue(tmp_2),
                                                                                                alignment: _descriptor_12.alignment() }).encode() } },
                                         { dup: { n: 1 } },
                                         { dup: { n: 1 } },
                                         'member',
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_3),
                                                                                                alignment: _descriptor_0.alignment() }).encode() } },
                                         { swap: { n: 0 } },
                                         'neg',
                                         { branch: { skip: 4 } },
                                         { dup: { n: 2 } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: true,
                                                  pushPath: false,
                                                  path: [ { tag: 'stack' }] } },
                                         'add',
                                         { ins: { cached: true, n: 2 } },
                                         { swap: { n: 0 } }]);
    }
    return color_0;
  }
  _receiveUnshielded_0(context, partialProofData, color_0, amount_0) {
    const tmp_0 = this._left_2(color_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { swap: { n: 0 } },
                                       { idx: { cached: true,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_16.toValue(6n),
                                                                  alignment: _descriptor_16.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_12.toValue(tmp_0),
                                                                                              alignment: _descriptor_12.alignment() }).encode() } },
                                       { dup: { n: 1 } },
                                       { dup: { n: 1 } },
                                       'member',
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(amount_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { swap: { n: 0 } },
                                       'neg',
                                       { branch: { skip: 4 } },
                                       { dup: { n: 2 } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: true,
                                                pushPath: false,
                                                path: [ { tag: 'stack' }] } },
                                       'add',
                                       { ins: { cached: true, n: 2 } },
                                       { swap: { n: 0 } }]);
    return [];
  }
  _transientHash_0(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_13, value_0);
    return result_0;
  }
  _persistentHash_0(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_10, value_0);
    return result_0;
  }
  _persistentCommit_0(value_0, rand_0) {
    const result_0 = __compactRuntime.persistentCommit(_descriptor_11,
                                                       value_0,
                                                       rand_0);
    return result_0;
  }
  _degradeToTransient_0(x_0) {
    const result_0 = __compactRuntime.degradeToTransient(x_0);
    return result_0;
  }
  _upgradeFromTransient_0(x_0) {
    const result_0 = __compactRuntime.upgradeFromTransient(x_0);
    return result_0;
  }
  _ownPublicKey_0(context, partialProofData) {
    const result_0 = __compactRuntime.ownPublicKey(context);
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_5.toValue(result_0),
      alignment: _descriptor_5.alignment()
    });
    return result_0;
  }
  _createZswapOutput_0(context, partialProofData, coin_0, recipient_0) {
    const result_0 = __compactRuntime.createZswapOutput(context,
                                                        coin_0,
                                                        recipient_0);
    partialProofData.privateTranscriptOutputs.push({
      value: [],
      alignment: []
    });
    return result_0;
  }
  _mint_shielded_0(context, partialProofData, domain_sep_0, amount_0, nonce_0) {
    return this._mintShieldedToken_0(context,
                                     partialProofData,
                                     domain_sep_0,
                                     amount_0,
                                     this._evolveNonce_0(nonce_0, domain_sep_0),
                                     this._left_0(this._ownPublicKey_0(context,
                                                                       partialProofData)));
  }
  _mint_unshielded_0(context, partialProofData, domainSep_0, amount_0) {
    const color_0 = this._mintUnshieldedToken_0(context,
                                                partialProofData,
                                                domainSep_0,
                                                amount_0,
                                                this._left_1(_descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                                       partialProofData,
                                                                                                                       [
                                                                                                                        { dup: { n: 2 } },
                                                                                                                        { idx: { cached: true,
                                                                                                                                 pushPath: false,
                                                                                                                                 path: [
                                                                                                                                        { tag: 'value',
                                                                                                                                          value: { value: _descriptor_16.toValue(0n),
                                                                                                                                                   alignment: _descriptor_16.alignment() } }] } },
                                                                                                                        { popeq: { cached: true,
                                                                                                                                   result: undefined } }]).value)));
    this._receiveUnshielded_0(context, partialProofData, color_0, amount_0);
    return color_0;
  }
  _incrementNoun_0(context, partialProofData) {
    const tmp_0 = ((t1) => {
                    if (t1 > 340282366920938463463374607431768211455n) {
                      throw new __compactRuntime.CompactError('offer-files.compact line 37 char 13: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 340282366920938463463374607431768211455');
                    }
                    return t1;
                  })(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                               partialProofData,
                                                                               [
                                                                                { dup: { n: 0 } },
                                                                                { idx: { cached: false,
                                                                                         pushPath: false,
                                                                                         path: [
                                                                                                { tag: 'value',
                                                                                                  value: { value: _descriptor_16.toValue(0n),
                                                                                                           alignment: _descriptor_16.alignment() } }] } },
                                                                                { popeq: { cached: false,
                                                                                           result: undefined } }]).value)
                     +
                     1n);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_16.toValue(0n),
                                                                                              alignment: _descriptor_16.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _equal_0(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_1(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()),
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    get counter() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_16.toValue(0n),
                                                                                                   alignment: _descriptor_16.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    }
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({ });
export const pureCircuits = {};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
//# sourceMappingURL=index.js.map
