import { t as toUtf8Bytes, h as hexlify, c as concat, H as HashZero, a as arrayify, b as toUtf8String, d as toUtf8CodePoints, U as UnicodeNormalizationForm, _ as _toUtf8String, e as Utf8ErrorFuncs, f as Utf8ErrorReason, g as _toEscapedUtf8String, i as decode, j as encode, T as TypedDataEncoder, k as dnsEncode, l as ensNormalize, m as hashMessage, n as id, o as isValidName, p as messagePrefix, q as namehash, A as AbiCoder, C as ConstructorFragment, E as ErrorFragment, r as EventFragment, F as FormatTypes, s as Fragment, u as FunctionFragment, I as Indexed, v as Interface, L as LogDescription, P as ParamType, w as TransactionDescription, x as checkResultErrors, y as defaultAbiCoder, S as SupportedAlgorithm, z as computeHmac, B as ripemd160, D as sha256$1, G as sha512, J as randomBytes, K as shuffled, M as keccak256$1, N as Logger, O as BigNumber, Q as zeroPad, R as getAugmentedNamespace, V as lib_esm$7, W as lib_esm$8, X as lib_esm$9, Y as lib_esm$a, Z as lib_esm$b, $ as lib_esm$c, a0 as lib_esm$d, a1 as lib_esm$e, a2 as lib_esm$f, a3 as lib_esm$g, a4 as lib_esm$h, a5 as lib_esm$i, a6 as lib_esm$j, a7 as lib_esm$k, a8 as EventEmitter$1, a9 as _defineProperty, aa as _classPrivateFieldInitSpec, ab as _classPrivateFieldSet, ac as _classPrivateFieldGet, ad as getChainProvider, ae as Signer, af as getDefaultGasOverrides } from './index-B5nhZq78.js';

function formatBytes32String(text) {
    // Get the bytes
    const bytes = toUtf8Bytes(text);
    // Check we have room for null-termination
    if (bytes.length > 31) {
        throw new Error("bytes32 string must be less than 32 bytes");
    }
    // Zero-pad (implicitly null-terminates)
    return hexlify(concat([bytes, HashZero]).slice(0, 32));
}
function parseBytes32String(bytes) {
    const data = arrayify(bytes);
    // Must be 32 bytes with a null-termination
    if (data.length !== 32) {
        throw new Error("invalid bytes32 - not 32 bytes long");
    }
    if (data[31] !== 0) {
        throw new Error("invalid bytes32 string - no null terminator");
    }
    // Find the null termination
    let length = 31;
    while (data[length - 1] === 0) {
        length--;
    }
    // Determine the string value
    return toUtf8String(data.slice(0, length));
}

function bytes2(data) {
    if ((data.length % 4) !== 0) {
        throw new Error("bad data");
    }
    let result = [];
    for (let i = 0; i < data.length; i += 4) {
        result.push(parseInt(data.substring(i, i + 4), 16));
    }
    return result;
}
function createTable(data, func) {
    if (!func) {
        func = function (value) { return [parseInt(value, 16)]; };
    }
    let lo = 0;
    let result = {};
    data.split(",").forEach((pair) => {
        let comps = pair.split(":");
        lo += parseInt(comps[0], 16);
        result[lo] = func(comps[1]);
    });
    return result;
}
function createRangeTable(data) {
    let hi = 0;
    return data.split(",").map((v) => {
        let comps = v.split("-");
        if (comps.length === 1) {
            comps[1] = "0";
        }
        else if (comps[1] === "") {
            comps[1] = "1";
        }
        let lo = hi + parseInt(comps[0], 16);
        hi = parseInt(comps[1], 16);
        return { l: lo, h: hi };
    });
}
function matchMap(value, ranges) {
    let lo = 0;
    for (let i = 0; i < ranges.length; i++) {
        let range = ranges[i];
        lo += range.l;
        if (value >= lo && value <= lo + range.h && ((value - lo) % (range.d || 1)) === 0) {
            if (range.e && range.e.indexOf(value - lo) !== -1) {
                continue;
            }
            return range;
        }
    }
    return null;
}
const Table_A_1_ranges = createRangeTable("221,13-1b,5f-,40-10,51-f,11-3,3-3,2-2,2-4,8,2,15,2d,28-8,88,48,27-,3-5,11-20,27-,8,28,3-5,12,18,b-a,1c-4,6-16,2-d,2-2,2,1b-4,17-9,8f-,10,f,1f-2,1c-34,33-14e,4,36-,13-,6-2,1a-f,4,9-,3-,17,8,2-2,5-,2,8-,3-,4-8,2-3,3,6-,16-6,2-,7-3,3-,17,8,3,3,3-,2,6-3,3-,4-a,5,2-6,10-b,4,8,2,4,17,8,3,6-,b,4,4-,2-e,2-4,b-10,4,9-,3-,17,8,3-,5-,9-2,3-,4-7,3-3,3,4-3,c-10,3,7-2,4,5-2,3,2,3-2,3-2,4-2,9,4-3,6-2,4,5-8,2-e,d-d,4,9,4,18,b,6-3,8,4,5-6,3-8,3-3,b-11,3,9,4,18,b,6-3,8,4,5-6,3-6,2,3-3,b-11,3,9,4,18,11-3,7-,4,5-8,2-7,3-3,b-11,3,13-2,19,a,2-,8-2,2-3,7,2,9-11,4-b,3b-3,1e-24,3,2-,3,2-,2-5,5,8,4,2,2-,3,e,4-,6,2,7-,b-,3-21,49,23-5,1c-3,9,25,10-,2-2f,23,6,3,8-2,5-5,1b-45,27-9,2a-,2-3,5b-4,45-4,53-5,8,40,2,5-,8,2,5-,28,2,5-,20,2,5-,8,2,5-,8,8,18,20,2,5-,8,28,14-5,1d-22,56-b,277-8,1e-2,52-e,e,8-a,18-8,15-b,e,4,3-b,5e-2,b-15,10,b-5,59-7,2b-555,9d-3,5b-5,17-,7-,27-,7-,9,2,2,2,20-,36,10,f-,7,14-,4,a,54-3,2-6,6-5,9-,1c-10,13-1d,1c-14,3c-,10-6,32-b,240-30,28-18,c-14,a0,115-,3,66-,b-76,5,5-,1d,24,2,5-2,2,8-,35-2,19,f-10,1d-3,311-37f,1b,5a-b,d7-19,d-3,41,57-,68-4,29-3,5f,29-37,2e-2,25-c,2c-2,4e-3,30,78-3,64-,20,19b7-49,51a7-59,48e-2,38-738,2ba5-5b,222f-,3c-94,8-b,6-4,1b,6,2,3,3,6d-20,16e-f,41-,37-7,2e-2,11-f,5-b,18-,b,14,5-3,6,88-,2,bf-2,7-,7-,7-,4-2,8,8-9,8-2ff,20,5-b,1c-b4,27-,27-cbb1,f7-9,28-2,b5-221,56,48,3-,2-,3-,5,d,2,5,3,42,5-,9,8,1d,5,6,2-2,8,153-3,123-3,33-27fd,a6da-5128,21f-5df,3-fffd,3-fffd,3-fffd,3-fffd,3-fffd,3-fffd,3-fffd,3-fffd,3-fffd,3-fffd,3-fffd,3,2-1d,61-ff7d");
// @TODO: Make this relative...
const Table_B_1_flags = "ad,34f,1806,180b,180c,180d,200b,200c,200d,2060,feff".split(",").map((v) => parseInt(v, 16));
const Table_B_2_ranges = [
    { h: 25, s: 32, l: 65 },
    { h: 30, s: 32, e: [23], l: 127 },
    { h: 54, s: 1, e: [48], l: 64, d: 2 },
    { h: 14, s: 1, l: 57, d: 2 },
    { h: 44, s: 1, l: 17, d: 2 },
    { h: 10, s: 1, e: [2, 6, 8], l: 61, d: 2 },
    { h: 16, s: 1, l: 68, d: 2 },
    { h: 84, s: 1, e: [18, 24, 66], l: 19, d: 2 },
    { h: 26, s: 32, e: [17], l: 435 },
    { h: 22, s: 1, l: 71, d: 2 },
    { h: 15, s: 80, l: 40 },
    { h: 31, s: 32, l: 16 },
    { h: 32, s: 1, l: 80, d: 2 },
    { h: 52, s: 1, l: 42, d: 2 },
    { h: 12, s: 1, l: 55, d: 2 },
    { h: 40, s: 1, e: [38], l: 15, d: 2 },
    { h: 14, s: 1, l: 48, d: 2 },
    { h: 37, s: 48, l: 49 },
    { h: 148, s: 1, l: 6351, d: 2 },
    { h: 88, s: 1, l: 160, d: 2 },
    { h: 15, s: 16, l: 704 },
    { h: 25, s: 26, l: 854 },
    { h: 25, s: 32, l: 55915 },
    { h: 37, s: 40, l: 1247 },
    { h: 25, s: -119711, l: 53248 },
    { h: 25, s: -119763, l: 52 },
    { h: 25, s: -119815, l: 52 },
    { h: 25, s: -119867, e: [1, 4, 5, 7, 8, 11, 12, 17], l: 52 },
    { h: 25, s: -119919, l: 52 },
    { h: 24, s: -119971, e: [2, 7, 8, 17], l: 52 },
    { h: 24, s: -120023, e: [2, 7, 13, 15, 16, 17], l: 52 },
    { h: 25, s: -120075, l: 52 },
    { h: 25, s: -120127, l: 52 },
    { h: 25, s: -120179, l: 52 },
    { h: 25, s: -120231, l: 52 },
    { h: 25, s: -120283, l: 52 },
    { h: 25, s: -120335, l: 52 },
    { h: 24, s: -119543, e: [17], l: 56 },
    { h: 24, s: -119601, e: [17], l: 58 },
    { h: 24, s: -119659, e: [17], l: 58 },
    { h: 24, s: -119717, e: [17], l: 58 },
    { h: 24, s: -119775, e: [17], l: 58 }
];
const Table_B_2_lut_abs = createTable("b5:3bc,c3:ff,7:73,2:253,5:254,3:256,1:257,5:259,1:25b,3:260,1:263,2:269,1:268,5:26f,1:272,2:275,7:280,3:283,5:288,3:28a,1:28b,5:292,3f:195,1:1bf,29:19e,125:3b9,8b:3b2,1:3b8,1:3c5,3:3c6,1:3c0,1a:3ba,1:3c1,1:3c3,2:3b8,1:3b5,1bc9:3b9,1c:1f76,1:1f77,f:1f7a,1:1f7b,d:1f78,1:1f79,1:1f7c,1:1f7d,107:63,5:25b,4:68,1:68,1:68,3:69,1:69,1:6c,3:6e,4:70,1:71,1:72,1:72,1:72,7:7a,2:3c9,2:7a,2:6b,1:e5,1:62,1:63,3:65,1:66,2:6d,b:3b3,1:3c0,6:64,1b574:3b8,1a:3c3,20:3b8,1a:3c3,20:3b8,1a:3c3,20:3b8,1a:3c3,20:3b8,1a:3c3");
const Table_B_2_lut_rel = createTable("179:1,2:1,2:1,5:1,2:1,a:4f,a:1,8:1,2:1,2:1,3:1,5:1,3:1,4:1,2:1,3:1,4:1,8:2,1:1,2:2,1:1,2:2,27:2,195:26,2:25,1:25,1:25,2:40,2:3f,1:3f,33:1,11:-6,1:-9,1ac7:-3a,6d:-8,1:-8,1:-8,1:-8,1:-8,1:-8,1:-8,1:-8,9:-8,1:-8,1:-8,1:-8,1:-8,1:-8,b:-8,1:-8,1:-8,1:-8,1:-8,1:-8,1:-8,1:-8,9:-8,1:-8,1:-8,1:-8,1:-8,1:-8,1:-8,1:-8,9:-8,1:-8,1:-8,1:-8,1:-8,1:-8,c:-8,2:-8,2:-8,2:-8,9:-8,1:-8,1:-8,1:-8,1:-8,1:-8,1:-8,1:-8,49:-8,1:-8,1:-4a,1:-4a,d:-56,1:-56,1:-56,1:-56,d:-8,1:-8,f:-8,1:-8,3:-7");
const Table_B_2_complex = createTable("df:00730073,51:00690307,19:02BC006E,a7:006A030C,18a:002003B9,16:03B903080301,20:03C503080301,1d7:05650582,190f:00680331,1:00740308,1:0077030A,1:0079030A,1:006102BE,b6:03C50313,2:03C503130300,2:03C503130301,2:03C503130342,2a:1F0003B9,1:1F0103B9,1:1F0203B9,1:1F0303B9,1:1F0403B9,1:1F0503B9,1:1F0603B9,1:1F0703B9,1:1F0003B9,1:1F0103B9,1:1F0203B9,1:1F0303B9,1:1F0403B9,1:1F0503B9,1:1F0603B9,1:1F0703B9,1:1F2003B9,1:1F2103B9,1:1F2203B9,1:1F2303B9,1:1F2403B9,1:1F2503B9,1:1F2603B9,1:1F2703B9,1:1F2003B9,1:1F2103B9,1:1F2203B9,1:1F2303B9,1:1F2403B9,1:1F2503B9,1:1F2603B9,1:1F2703B9,1:1F6003B9,1:1F6103B9,1:1F6203B9,1:1F6303B9,1:1F6403B9,1:1F6503B9,1:1F6603B9,1:1F6703B9,1:1F6003B9,1:1F6103B9,1:1F6203B9,1:1F6303B9,1:1F6403B9,1:1F6503B9,1:1F6603B9,1:1F6703B9,3:1F7003B9,1:03B103B9,1:03AC03B9,2:03B10342,1:03B1034203B9,5:03B103B9,6:1F7403B9,1:03B703B9,1:03AE03B9,2:03B70342,1:03B7034203B9,5:03B703B9,6:03B903080300,1:03B903080301,3:03B90342,1:03B903080342,b:03C503080300,1:03C503080301,1:03C10313,2:03C50342,1:03C503080342,b:1F7C03B9,1:03C903B9,1:03CE03B9,2:03C90342,1:03C9034203B9,5:03C903B9,ac:00720073,5b:00B00063,6:00B00066,d:006E006F,a:0073006D,1:00740065006C,1:0074006D,124f:006800700061,2:00610075,2:006F0076,b:00700061,1:006E0061,1:03BC0061,1:006D0061,1:006B0061,1:006B0062,1:006D0062,1:00670062,3:00700066,1:006E0066,1:03BC0066,4:0068007A,1:006B0068007A,1:006D0068007A,1:00670068007A,1:00740068007A,15:00700061,1:006B00700061,1:006D00700061,1:006700700061,8:00700076,1:006E0076,1:03BC0076,1:006D0076,1:006B0076,1:006D0076,1:00700077,1:006E0077,1:03BC0077,1:006D0077,1:006B0077,1:006D0077,1:006B03C9,1:006D03C9,2:00620071,3:00632215006B0067,1:0063006F002E,1:00640062,1:00670079,2:00680070,2:006B006B,1:006B006D,9:00700068,2:00700070006D,1:00700072,2:00730076,1:00770062,c723:00660066,1:00660069,1:0066006C,1:006600660069,1:00660066006C,1:00730074,1:00730074,d:05740576,1:05740565,1:0574056B,1:057E0576,1:0574056D", bytes2);
const Table_C_ranges = createRangeTable("80-20,2a0-,39c,32,f71,18e,7f2-f,19-7,30-4,7-5,f81-b,5,a800-20ff,4d1-1f,110,fa-6,d174-7,2e84-,ffff-,ffff-,ffff-,ffff-,ffff-,ffff-,ffff-,ffff-,ffff-,ffff-,ffff-,ffff-,2,1f-5f,ff7f-20001");
function flatten(values) {
    return values.reduce((accum, value) => {
        value.forEach((value) => { accum.push(value); });
        return accum;
    }, []);
}
function _nameprepTableA1(codepoint) {
    return !!matchMap(codepoint, Table_A_1_ranges);
}
function _nameprepTableB2(codepoint) {
    let range = matchMap(codepoint, Table_B_2_ranges);
    if (range) {
        return [codepoint + range.s];
    }
    let codes = Table_B_2_lut_abs[codepoint];
    if (codes) {
        return codes;
    }
    let shift = Table_B_2_lut_rel[codepoint];
    if (shift) {
        return [codepoint + shift[0]];
    }
    let complex = Table_B_2_complex[codepoint];
    if (complex) {
        return complex;
    }
    return null;
}
function _nameprepTableC(codepoint) {
    return !!matchMap(codepoint, Table_C_ranges);
}
function nameprep(value) {
    // This allows platforms with incomplete normalize to bypass
    // it for very basic names which the built-in toLowerCase
    // will certainly handle correctly
    if (value.match(/^[a-z0-9-]*$/i) && value.length <= 59) {
        return value.toLowerCase();
    }
    // Get the code points (keeping the current normalization)
    let codes = toUtf8CodePoints(value);
    codes = flatten(codes.map((code) => {
        // Substitute Table B.1 (Maps to Nothing)
        if (Table_B_1_flags.indexOf(code) >= 0) {
            return [];
        }
        if (code >= 0xfe00 && code <= 0xfe0f) {
            return [];
        }
        // Substitute Table B.2 (Case Folding)
        let codesTableB2 = _nameprepTableB2(code);
        if (codesTableB2) {
            return codesTableB2;
        }
        // No Substitution
        return [code];
    }));
    // Normalize using form KC
    codes = toUtf8CodePoints(_toUtf8String(codes), UnicodeNormalizationForm.NFKC);
    // Prohibit Tables C.1.2, C.2.2, C.3, C.4, C.5, C.6, C.7, C.8, C.9
    codes.forEach((code) => {
        if (_nameprepTableC(code)) {
            throw new Error("STRINGPREP_CONTAINS_PROHIBITED");
        }
    });
    // Prohibit Unassigned Code Points (Table A.1)
    codes.forEach((code) => {
        if (_nameprepTableA1(code)) {
            throw new Error("STRINGPREP_CONTAINS_UNASSIGNED");
        }
    });
    // IDNA extras
    let name = _toUtf8String(codes);
    // IDNA: 4.2.3.1
    if (name.substring(0, 1) === "-" || name.substring(2, 4) === "--" || name.substring(name.length - 1) === "-") {
        throw new Error("invalid hyphen");
    }
    return name;
}

const lib_esm$6 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    get UnicodeNormalizationForm () { return UnicodeNormalizationForm; },
    Utf8ErrorFuncs,
    get Utf8ErrorReason () { return Utf8ErrorReason; },
    _toEscapedUtf8String,
    formatBytes32String,
    nameprep,
    parseBytes32String,
    toUtf8Bytes,
    toUtf8CodePoints,
    toUtf8String
}, Symbol.toStringTag, { value: 'Module' }));

const lib_esm$5 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    decode,
    encode
}, Symbol.toStringTag, { value: 'Module' }));

const lib_esm$4 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    _TypedDataEncoder: TypedDataEncoder,
    dnsEncode,
    ensNormalize,
    hashMessage,
    id,
    isValidName,
    messagePrefix,
    namehash
}, Symbol.toStringTag, { value: 'Module' }));

const lib_esm$3 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    AbiCoder,
    ConstructorFragment,
    ErrorFragment,
    EventFragment,
    FormatTypes,
    Fragment,
    FunctionFragment,
    Indexed,
    Interface,
    LogDescription,
    ParamType,
    TransactionDescription,
    checkResultErrors,
    defaultAbiCoder
}, Symbol.toStringTag, { value: 'Module' }));

const lib_esm$2 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    get SupportedAlgorithm () { return SupportedAlgorithm; },
    computeHmac,
    ripemd160,
    sha256: sha256$1,
    sha512
}, Symbol.toStringTag, { value: 'Module' }));

const lib_esm$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    randomBytes,
    shuffled
}, Symbol.toStringTag, { value: 'Module' }));

const version = "solidity/5.7.0";

const regexBytes = new RegExp("^bytes([0-9]+)$");
const regexNumber = new RegExp("^(u?int)([0-9]*)$");
const regexArray = new RegExp("^(.*)\\[([0-9]*)\\]$");
const Zeros = "0000000000000000000000000000000000000000000000000000000000000000";
const logger = new Logger(version);
function _pack(type, value, isArray) {
    switch (type) {
        case "address":
            if (isArray) {
                return zeroPad(value, 32);
            }
            return arrayify(value);
        case "string":
            return toUtf8Bytes(value);
        case "bytes":
            return arrayify(value);
        case "bool":
            value = (value ? "0x01" : "0x00");
            if (isArray) {
                return zeroPad(value, 32);
            }
            return arrayify(value);
    }
    let match = type.match(regexNumber);
    if (match) {
        //let signed = (match[1] === "int")
        let size = parseInt(match[2] || "256");
        if ((match[2] && String(size) !== match[2]) || (size % 8 !== 0) || size === 0 || size > 256) {
            logger.throwArgumentError("invalid number type", "type", type);
        }
        if (isArray) {
            size = 256;
        }
        value = BigNumber.from(value).toTwos(size);
        return zeroPad(value, size / 8);
    }
    match = type.match(regexBytes);
    if (match) {
        const size = parseInt(match[1]);
        if (String(size) !== match[1] || size === 0 || size > 32) {
            logger.throwArgumentError("invalid bytes type", "type", type);
        }
        if (arrayify(value).byteLength !== size) {
            logger.throwArgumentError(`invalid value for ${type}`, "value", value);
        }
        if (isArray) {
            return arrayify((value + Zeros).substring(0, 66));
        }
        return value;
    }
    match = type.match(regexArray);
    if (match && Array.isArray(value)) {
        const baseType = match[1];
        const count = parseInt(match[2] || String(value.length));
        if (count != value.length) {
            logger.throwArgumentError(`invalid array length for ${type}`, "value", value);
        }
        const result = [];
        value.forEach(function (value) {
            result.push(_pack(baseType, value, true));
        });
        return concat(result);
    }
    return logger.throwArgumentError("invalid type", "type", type);
}
// @TODO: Array Enum
function pack(types, values) {
    if (types.length != values.length) {
        logger.throwArgumentError("wrong number of values; expected ${ types.length }", "values", values);
    }
    const tight = [];
    types.forEach(function (type, index) {
        tight.push(_pack(type, values[index]));
    });
    return hexlify(concat(tight));
}
function keccak256(types, values) {
    return keccak256$1(pack(types, values));
}
function sha256(types, values) {
    return sha256$1(pack(types, values));
}

const lib_esm = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    keccak256,
    pack,
    sha256
}, Symbol.toStringTag, { value: 'Module' }));

var utils = {};

const require$$0$1 = /*@__PURE__*/getAugmentedNamespace(lib_esm$3);

const require$$1$2 = /*@__PURE__*/getAugmentedNamespace(lib_esm$7);

const require$$2$1 = /*@__PURE__*/getAugmentedNamespace(lib_esm$5);

const require$$3 = /*@__PURE__*/getAugmentedNamespace(lib_esm$8);

const require$$0 = /*@__PURE__*/getAugmentedNamespace(lib_esm$9);

const require$$2 = /*@__PURE__*/getAugmentedNamespace(lib_esm$4);

const require$$6 = /*@__PURE__*/getAugmentedNamespace(lib_esm$a);

const require$$7 = /*@__PURE__*/getAugmentedNamespace(lib_esm$b);

const require$$8 = /*@__PURE__*/getAugmentedNamespace(lib_esm$c);

const require$$9 = /*@__PURE__*/getAugmentedNamespace(lib_esm$d);

const require$$10 = /*@__PURE__*/getAugmentedNamespace(lib_esm$2);

const require$$1$1 = /*@__PURE__*/getAugmentedNamespace(lib_esm);

const require$$12 = /*@__PURE__*/getAugmentedNamespace(lib_esm$1);

const require$$13 = /*@__PURE__*/getAugmentedNamespace(lib_esm$e);

const require$$14 = /*@__PURE__*/getAugmentedNamespace(lib_esm$f);

const require$$15 = /*@__PURE__*/getAugmentedNamespace(lib_esm$g);

const require$$16 = /*@__PURE__*/getAugmentedNamespace(lib_esm$6);

const require$$17 = /*@__PURE__*/getAugmentedNamespace(lib_esm$h);

const require$$18 = /*@__PURE__*/getAugmentedNamespace(lib_esm$i);

const require$$19 = /*@__PURE__*/getAugmentedNamespace(lib_esm$j);

const require$$1 = /*@__PURE__*/getAugmentedNamespace(lib_esm$k);

var hasRequiredUtils;

function requireUtils () {
	if (hasRequiredUtils) return utils;
	hasRequiredUtils = 1;
	(function (exports) {
		var __createBinding = (utils && utils.__createBinding) || (Object.create ? (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
		}) : (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    o[k2] = m[k];
		}));
		var __setModuleDefault = (utils && utils.__setModuleDefault) || (Object.create ? (function(o, v) {
		    Object.defineProperty(o, "default", { enumerable: true, value: v });
		}) : function(o, v) {
		    o["default"] = v;
		});
		var __importStar = (utils && utils.__importStar) || function (mod) {
		    if (mod && mod.__esModule) return mod;
		    var result = {};
		    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
		    __setModuleDefault(result, mod);
		    return result;
		};
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.formatBytes32String = exports.Utf8ErrorFuncs = exports.toUtf8String = exports.toUtf8CodePoints = exports.toUtf8Bytes = exports._toEscapedUtf8String = exports.nameprep = exports.hexDataSlice = exports.hexDataLength = exports.hexZeroPad = exports.hexValue = exports.hexStripZeros = exports.hexConcat = exports.isHexString = exports.hexlify = exports.base64 = exports.base58 = exports.TransactionDescription = exports.LogDescription = exports.Interface = exports.SigningKey = exports.HDNode = exports.defaultPath = exports.isBytesLike = exports.isBytes = exports.zeroPad = exports.stripZeros = exports.concat = exports.arrayify = exports.shallowCopy = exports.resolveProperties = exports.getStatic = exports.defineReadOnly = exports.deepCopy = exports.checkProperties = exports.poll = exports.fetchJson = exports._fetchData = exports.RLP = exports.Logger = exports.checkResultErrors = exports.FormatTypes = exports.ParamType = exports.FunctionFragment = exports.EventFragment = exports.ErrorFragment = exports.ConstructorFragment = exports.Fragment = exports.defaultAbiCoder = exports.AbiCoder = void 0;
		exports.Indexed = exports.Utf8ErrorReason = exports.UnicodeNormalizationForm = exports.SupportedAlgorithm = exports.mnemonicToSeed = exports.isValidMnemonic = exports.entropyToMnemonic = exports.mnemonicToEntropy = exports.getAccountPath = exports.verifyTypedData = exports.verifyMessage = exports.recoverPublicKey = exports.computePublicKey = exports.recoverAddress = exports.computeAddress = exports.getJsonWalletAddress = exports.TransactionTypes = exports.serializeTransaction = exports.parseTransaction = exports.accessListify = exports.joinSignature = exports.splitSignature = exports.soliditySha256 = exports.solidityKeccak256 = exports.solidityPack = exports.shuffled = exports.randomBytes = exports.sha512 = exports.sha256 = exports.ripemd160 = exports.keccak256 = exports.computeHmac = exports.commify = exports.parseUnits = exports.formatUnits = exports.parseEther = exports.formatEther = exports.isAddress = exports.getCreate2Address = exports.getContractAddress = exports.getIcapAddress = exports.getAddress = exports._TypedDataEncoder = exports.id = exports.isValidName = exports.namehash = exports.hashMessage = exports.dnsEncode = exports.parseBytes32String = void 0;
		var abi_1 = require$$0$1;
		Object.defineProperty(exports, "AbiCoder", { enumerable: true, get: function () { return abi_1.AbiCoder; } });
		Object.defineProperty(exports, "checkResultErrors", { enumerable: true, get: function () { return abi_1.checkResultErrors; } });
		Object.defineProperty(exports, "ConstructorFragment", { enumerable: true, get: function () { return abi_1.ConstructorFragment; } });
		Object.defineProperty(exports, "defaultAbiCoder", { enumerable: true, get: function () { return abi_1.defaultAbiCoder; } });
		Object.defineProperty(exports, "ErrorFragment", { enumerable: true, get: function () { return abi_1.ErrorFragment; } });
		Object.defineProperty(exports, "EventFragment", { enumerable: true, get: function () { return abi_1.EventFragment; } });
		Object.defineProperty(exports, "FormatTypes", { enumerable: true, get: function () { return abi_1.FormatTypes; } });
		Object.defineProperty(exports, "Fragment", { enumerable: true, get: function () { return abi_1.Fragment; } });
		Object.defineProperty(exports, "FunctionFragment", { enumerable: true, get: function () { return abi_1.FunctionFragment; } });
		Object.defineProperty(exports, "Indexed", { enumerable: true, get: function () { return abi_1.Indexed; } });
		Object.defineProperty(exports, "Interface", { enumerable: true, get: function () { return abi_1.Interface; } });
		Object.defineProperty(exports, "LogDescription", { enumerable: true, get: function () { return abi_1.LogDescription; } });
		Object.defineProperty(exports, "ParamType", { enumerable: true, get: function () { return abi_1.ParamType; } });
		Object.defineProperty(exports, "TransactionDescription", { enumerable: true, get: function () { return abi_1.TransactionDescription; } });
		var address_1 = require$$1$2;
		Object.defineProperty(exports, "getAddress", { enumerable: true, get: function () { return address_1.getAddress; } });
		Object.defineProperty(exports, "getCreate2Address", { enumerable: true, get: function () { return address_1.getCreate2Address; } });
		Object.defineProperty(exports, "getContractAddress", { enumerable: true, get: function () { return address_1.getContractAddress; } });
		Object.defineProperty(exports, "getIcapAddress", { enumerable: true, get: function () { return address_1.getIcapAddress; } });
		Object.defineProperty(exports, "isAddress", { enumerable: true, get: function () { return address_1.isAddress; } });
		var base64 = __importStar(require$$2$1);
		exports.base64 = base64;
		var basex_1 = require$$3;
		Object.defineProperty(exports, "base58", { enumerable: true, get: function () { return basex_1.Base58; } });
		var bytes_1 = require$$0;
		Object.defineProperty(exports, "arrayify", { enumerable: true, get: function () { return bytes_1.arrayify; } });
		Object.defineProperty(exports, "concat", { enumerable: true, get: function () { return bytes_1.concat; } });
		Object.defineProperty(exports, "hexConcat", { enumerable: true, get: function () { return bytes_1.hexConcat; } });
		Object.defineProperty(exports, "hexDataSlice", { enumerable: true, get: function () { return bytes_1.hexDataSlice; } });
		Object.defineProperty(exports, "hexDataLength", { enumerable: true, get: function () { return bytes_1.hexDataLength; } });
		Object.defineProperty(exports, "hexlify", { enumerable: true, get: function () { return bytes_1.hexlify; } });
		Object.defineProperty(exports, "hexStripZeros", { enumerable: true, get: function () { return bytes_1.hexStripZeros; } });
		Object.defineProperty(exports, "hexValue", { enumerable: true, get: function () { return bytes_1.hexValue; } });
		Object.defineProperty(exports, "hexZeroPad", { enumerable: true, get: function () { return bytes_1.hexZeroPad; } });
		Object.defineProperty(exports, "isBytes", { enumerable: true, get: function () { return bytes_1.isBytes; } });
		Object.defineProperty(exports, "isBytesLike", { enumerable: true, get: function () { return bytes_1.isBytesLike; } });
		Object.defineProperty(exports, "isHexString", { enumerable: true, get: function () { return bytes_1.isHexString; } });
		Object.defineProperty(exports, "joinSignature", { enumerable: true, get: function () { return bytes_1.joinSignature; } });
		Object.defineProperty(exports, "zeroPad", { enumerable: true, get: function () { return bytes_1.zeroPad; } });
		Object.defineProperty(exports, "splitSignature", { enumerable: true, get: function () { return bytes_1.splitSignature; } });
		Object.defineProperty(exports, "stripZeros", { enumerable: true, get: function () { return bytes_1.stripZeros; } });
		var hash_1 = require$$2;
		Object.defineProperty(exports, "_TypedDataEncoder", { enumerable: true, get: function () { return hash_1._TypedDataEncoder; } });
		Object.defineProperty(exports, "dnsEncode", { enumerable: true, get: function () { return hash_1.dnsEncode; } });
		Object.defineProperty(exports, "hashMessage", { enumerable: true, get: function () { return hash_1.hashMessage; } });
		Object.defineProperty(exports, "id", { enumerable: true, get: function () { return hash_1.id; } });
		Object.defineProperty(exports, "isValidName", { enumerable: true, get: function () { return hash_1.isValidName; } });
		Object.defineProperty(exports, "namehash", { enumerable: true, get: function () { return hash_1.namehash; } });
		var hdnode_1 = require$$6;
		Object.defineProperty(exports, "defaultPath", { enumerable: true, get: function () { return hdnode_1.defaultPath; } });
		Object.defineProperty(exports, "entropyToMnemonic", { enumerable: true, get: function () { return hdnode_1.entropyToMnemonic; } });
		Object.defineProperty(exports, "getAccountPath", { enumerable: true, get: function () { return hdnode_1.getAccountPath; } });
		Object.defineProperty(exports, "HDNode", { enumerable: true, get: function () { return hdnode_1.HDNode; } });
		Object.defineProperty(exports, "isValidMnemonic", { enumerable: true, get: function () { return hdnode_1.isValidMnemonic; } });
		Object.defineProperty(exports, "mnemonicToEntropy", { enumerable: true, get: function () { return hdnode_1.mnemonicToEntropy; } });
		Object.defineProperty(exports, "mnemonicToSeed", { enumerable: true, get: function () { return hdnode_1.mnemonicToSeed; } });
		var json_wallets_1 = require$$7;
		Object.defineProperty(exports, "getJsonWalletAddress", { enumerable: true, get: function () { return json_wallets_1.getJsonWalletAddress; } });
		var keccak256_1 = require$$8;
		Object.defineProperty(exports, "keccak256", { enumerable: true, get: function () { return keccak256_1.keccak256; } });
		var logger_1 = require$$9;
		Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return logger_1.Logger; } });
		var sha2_1 = require$$10;
		Object.defineProperty(exports, "computeHmac", { enumerable: true, get: function () { return sha2_1.computeHmac; } });
		Object.defineProperty(exports, "ripemd160", { enumerable: true, get: function () { return sha2_1.ripemd160; } });
		Object.defineProperty(exports, "sha256", { enumerable: true, get: function () { return sha2_1.sha256; } });
		Object.defineProperty(exports, "sha512", { enumerable: true, get: function () { return sha2_1.sha512; } });
		var solidity_1 = require$$1$1;
		Object.defineProperty(exports, "solidityKeccak256", { enumerable: true, get: function () { return solidity_1.keccak256; } });
		Object.defineProperty(exports, "solidityPack", { enumerable: true, get: function () { return solidity_1.pack; } });
		Object.defineProperty(exports, "soliditySha256", { enumerable: true, get: function () { return solidity_1.sha256; } });
		var random_1 = require$$12;
		Object.defineProperty(exports, "randomBytes", { enumerable: true, get: function () { return random_1.randomBytes; } });
		Object.defineProperty(exports, "shuffled", { enumerable: true, get: function () { return random_1.shuffled; } });
		var properties_1 = require$$13;
		Object.defineProperty(exports, "checkProperties", { enumerable: true, get: function () { return properties_1.checkProperties; } });
		Object.defineProperty(exports, "deepCopy", { enumerable: true, get: function () { return properties_1.deepCopy; } });
		Object.defineProperty(exports, "defineReadOnly", { enumerable: true, get: function () { return properties_1.defineReadOnly; } });
		Object.defineProperty(exports, "getStatic", { enumerable: true, get: function () { return properties_1.getStatic; } });
		Object.defineProperty(exports, "resolveProperties", { enumerable: true, get: function () { return properties_1.resolveProperties; } });
		Object.defineProperty(exports, "shallowCopy", { enumerable: true, get: function () { return properties_1.shallowCopy; } });
		var RLP = __importStar(require$$14);
		exports.RLP = RLP;
		var signing_key_1 = require$$15;
		Object.defineProperty(exports, "computePublicKey", { enumerable: true, get: function () { return signing_key_1.computePublicKey; } });
		Object.defineProperty(exports, "recoverPublicKey", { enumerable: true, get: function () { return signing_key_1.recoverPublicKey; } });
		Object.defineProperty(exports, "SigningKey", { enumerable: true, get: function () { return signing_key_1.SigningKey; } });
		var strings_1 = require$$16;
		Object.defineProperty(exports, "formatBytes32String", { enumerable: true, get: function () { return strings_1.formatBytes32String; } });
		Object.defineProperty(exports, "nameprep", { enumerable: true, get: function () { return strings_1.nameprep; } });
		Object.defineProperty(exports, "parseBytes32String", { enumerable: true, get: function () { return strings_1.parseBytes32String; } });
		Object.defineProperty(exports, "_toEscapedUtf8String", { enumerable: true, get: function () { return strings_1._toEscapedUtf8String; } });
		Object.defineProperty(exports, "toUtf8Bytes", { enumerable: true, get: function () { return strings_1.toUtf8Bytes; } });
		Object.defineProperty(exports, "toUtf8CodePoints", { enumerable: true, get: function () { return strings_1.toUtf8CodePoints; } });
		Object.defineProperty(exports, "toUtf8String", { enumerable: true, get: function () { return strings_1.toUtf8String; } });
		Object.defineProperty(exports, "Utf8ErrorFuncs", { enumerable: true, get: function () { return strings_1.Utf8ErrorFuncs; } });
		var transactions_1 = require$$17;
		Object.defineProperty(exports, "accessListify", { enumerable: true, get: function () { return transactions_1.accessListify; } });
		Object.defineProperty(exports, "computeAddress", { enumerable: true, get: function () { return transactions_1.computeAddress; } });
		Object.defineProperty(exports, "parseTransaction", { enumerable: true, get: function () { return transactions_1.parse; } });
		Object.defineProperty(exports, "recoverAddress", { enumerable: true, get: function () { return transactions_1.recoverAddress; } });
		Object.defineProperty(exports, "serializeTransaction", { enumerable: true, get: function () { return transactions_1.serialize; } });
		Object.defineProperty(exports, "TransactionTypes", { enumerable: true, get: function () { return transactions_1.TransactionTypes; } });
		var units_1 = require$$18;
		Object.defineProperty(exports, "commify", { enumerable: true, get: function () { return units_1.commify; } });
		Object.defineProperty(exports, "formatEther", { enumerable: true, get: function () { return units_1.formatEther; } });
		Object.defineProperty(exports, "parseEther", { enumerable: true, get: function () { return units_1.parseEther; } });
		Object.defineProperty(exports, "formatUnits", { enumerable: true, get: function () { return units_1.formatUnits; } });
		Object.defineProperty(exports, "parseUnits", { enumerable: true, get: function () { return units_1.parseUnits; } });
		var wallet_1 = require$$19;
		Object.defineProperty(exports, "verifyMessage", { enumerable: true, get: function () { return wallet_1.verifyMessage; } });
		Object.defineProperty(exports, "verifyTypedData", { enumerable: true, get: function () { return wallet_1.verifyTypedData; } });
		var web_1 = require$$1;
		Object.defineProperty(exports, "_fetchData", { enumerable: true, get: function () { return web_1._fetchData; } });
		Object.defineProperty(exports, "fetchJson", { enumerable: true, get: function () { return web_1.fetchJson; } });
		Object.defineProperty(exports, "poll", { enumerable: true, get: function () { return web_1.poll; } });
		////////////////////////
		// Enums
		var sha2_2 = require$$10;
		Object.defineProperty(exports, "SupportedAlgorithm", { enumerable: true, get: function () { return sha2_2.SupportedAlgorithm; } });
		var strings_2 = require$$16;
		Object.defineProperty(exports, "UnicodeNormalizationForm", { enumerable: true, get: function () { return strings_2.UnicodeNormalizationForm; } });
		Object.defineProperty(exports, "Utf8ErrorReason", { enumerable: true, get: function () { return strings_2.Utf8ErrorReason; } });
		
	} (utils));
	return utils;
}

var utilsExports = /*@__PURE__*/ requireUtils();

/**
 * @internal
 */
function normalizeChainId(chainId) {
  if (typeof chainId === "string") {
    return Number.parseInt(chainId, chainId.trim().substring(0, 2) === "0x" ? 16 : 10);
  }
  if (typeof chainId === "bigint") {
    return Number(chainId);
  }
  return chainId;
}

class Connector extends EventEmitter$1 {}

class WrappedSigner extends Signer {
  constructor(signer) {
    super();
    this.signer = signer;
    utilsExports.defineReadOnly(this, "provider", signer.provider);
  }
  async getAddress() {
    return await this.signer.getAddress();
  }
  async signMessage(message) {
    return await this.signer.signMessage(message);
  }
  async signTransaction(transaction) {
    return await this.signer.signTransaction(transaction);
  }
  connect(provider) {
    return new WrappedSigner(this.signer.connect(provider));
  }
  _signTypedData(domain, types, value) {
    return this.signer._signTypedData(domain, types, value);
  }
  async sendTransaction(transaction) {
    if (!this.provider) {
      throw new Error("Provider not found");
    }
    const gas = await getDefaultGasOverrides(this.provider);
    const txWithGas = {
      ...gas,
      ...transaction
    };
    return await this.signer.sendTransaction(txWithGas);
  }
}

var _provider = /*#__PURE__*/new WeakMap();
var _signer = /*#__PURE__*/new WeakMap();
class LocalWalletConnector extends Connector {
  constructor(options) {
    super();
    _defineProperty(this, "id", "local_wallet");
    _defineProperty(this, "name", "Local Wallet");
    _classPrivateFieldInitSpec(this, _provider, {
      writable: true,
      value: void 0
    });
    _classPrivateFieldInitSpec(this, _signer, {
      writable: true,
      value: void 0
    });
    _defineProperty(this, "shimDisconnectKey", "localWallet.shimDisconnect");
    _defineProperty(this, "onChainChanged", chainId => {
      const id = normalizeChainId(chainId);
      const unsupported = !this.options.chains.find(c => c.chainId === id);
      this.emit("change", {
        chain: {
          id,
          unsupported
        }
      });
    });
    this.options = options;
  }
  async connect(args) {
    if (args.chainId) {
      this.switchChain(args.chainId);
    }
    const signer = await this.getSigner();
    const address = await signer.getAddress();
    return address;
  }
  async disconnect() {
    _classPrivateFieldSet(this, _provider, undefined);
    _classPrivateFieldSet(this, _signer, undefined);
  }
  async getAddress() {
    const signer = await this.getSigner();
    if (!signer) {
      throw new Error("No signer found");
    }
    return await signer.getAddress();
  }
  async isConnected() {
    try {
      const addr = await this.getAddress();
      return !!addr;
    } catch {
      return false;
    }
  }
  async getProvider() {
    if (!_classPrivateFieldGet(this, _provider)) {
      _classPrivateFieldSet(this, _provider, getChainProvider(this.options.chain, {
        clientId: this.options.clientId,
        secretKey: this.options.secretKey
      }));
    }
    return _classPrivateFieldGet(this, _provider);
  }
  async getSigner() {
    if (!_classPrivateFieldGet(this, _signer)) {
      const provider = await this.getProvider();
      _classPrivateFieldSet(this, _signer, getSignerFromEthersWallet(this.options.ethersWallet, provider));
    }
    return _classPrivateFieldGet(this, _signer);
  }
  async switchChain(chainId) {
    const chain = this.options.chains.find(c => c.chainId === chainId);
    if (!chain) {
      throw new Error(`Chain not found for chainId ${chainId}, please add it to the chains property when creating this wallet`);
    }
    _classPrivateFieldSet(this, _provider, getChainProvider(chain, {
      clientId: this.options.clientId,
      secretKey: this.options.secretKey
    }));
    _classPrivateFieldSet(this, _signer, getSignerFromEthersWallet(this.options.ethersWallet, _classPrivateFieldGet(this, _provider)));
    this.onChainChanged(chainId);
  }
  async setupListeners() {}
  updateChains(chains) {
    this.options.chains = chains;
  }
}
function getSignerFromEthersWallet(ethersWallet, provider) {
  let signer = ethersWallet;
  if (provider) {
    signer = ethersWallet.connect(provider);
  }
  return new WrappedSigner(signer);
}

export { LocalWalletConnector };
