import { ag as encodeAddress, ah as decodeAddress, ai as u8aEq, aj as objectSpread } from './index-B5nhZq78.js';

function documentReadyPromise(creator) {
    return new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve(creator());
        }
        else {
            window.addEventListener('load', () => resolve(creator()));
        }
    });
}

const win = window;
win.injectedWeb3 = win.injectedWeb3 || {};
web3IsInjected();
let web3EnablePromise = null;
/** @internal true when anything has been injected and is available */
function web3IsInjected() {
    return Object
        .values(win.injectedWeb3)
        .filter(({ connect, enable }) => !!(connect || enable))
        .length !== 0;
}
/** @internal throw a consistent error when not extensions have not been enabled */
function throwError(method) {
    throw new Error(`${method}: web3Enable(originName) needs to be called before ${method}`);
}
/** @internal map from Array<InjectedAccount> to Array<InjectedAccountWithMeta> */
function mapAccounts(source, list, ss58Format) {
    return list.map(({ address, genesisHash, name, type }) => ({
        address: address.length === 42
            ? address
            : encodeAddress(decodeAddress(address), ss58Format),
        meta: { genesisHash, name, source },
        type
    }));
}
/** @internal filter accounts based on genesisHash and type of account */
function filterAccounts(list, genesisHash, type) {
    return list.filter((a) => (!a.type || !type || type.includes(a.type)) &&
        (!a.genesisHash || !genesisHash || a.genesisHash === genesisHash));
}
/** @internal retrieves all the extensions available on the window */
function getWindowExtensions(originName) {
    return Promise
        .all(Object
        .entries(win.injectedWeb3)
        .map(([nameOrHash, { connect, enable, version }]) => Promise
        .resolve()
        .then(() => connect
        // new style, returning all info
        ? connect(originName)
        : enable
            // previous interface, leakages on name/version
            ? enable(originName).then((e) => objectSpread({ name: nameOrHash, version: version || 'unknown' }, e))
            : Promise.reject(new Error('No connect(..) or enable(...) hook found')))
        .catch(({ message }) => {
        console.error(`Error initializing ${nameOrHash}: ${message}`);
    })))
        .then((exts) => exts.filter((e) => !!e));
}
/** @internal Ensure the enable promise is resolved and filter by extensions */
async function filterEnable(caller, extensions) {
    if (!web3EnablePromise) {
        return throwError(caller);
    }
    const sources = await web3EnablePromise;
    return sources.filter(({ name }) => !extensions ||
        extensions.includes(name));
}
/**
 * @summary Enables all the providers found on the injected window interface
 * @description
 * Enables all injected extensions that has been found on the page. This
 * should be called before making use of any other web3* functions.
 */
function web3Enable(originName, compatInits = []) {
    if (!originName) {
        throw new Error('You must pass a name for your app to the web3Enable function');
    }
    const initCompat = compatInits.length
        ? Promise.all(compatInits.map((c) => c().catch(() => false)))
        : Promise.resolve([true]);
    web3EnablePromise = documentReadyPromise(() => initCompat.then(() => getWindowExtensions(originName)
        .then((values) => values.map((e) => {
        // if we don't have an accounts subscriber, add a single-shot version
        if (!e.accounts.subscribe) {
            e.accounts.subscribe = (cb) => {
                e.accounts
                    .get()
                    .then(cb)
                    .catch(console.error);
                return () => {
                    // no ubsubscribe needed, this is a single-shot
                };
            };
        }
        return e;
    }))
        .catch(() => [])
        .then((values) => {
        const names = values.map(({ name, version }) => `${name}/${version}`);
        web3IsInjected();
        console.info(`web3Enable: Enabled ${values.length} extension${values.length !== 1 ? 's' : ''}: ${names.join(', ')}`);
        return values;
    })));
    return web3EnablePromise;
}
/**
 * @summary Retrieves all the accounts across all providers
 * @description
 * This returns the full list of account available (across all extensions) to
 * the page. Filtering options are available of a per-extension, per type and
 * per-genesisHash basis. Optionally the accounts can be encoded with the provided
 * ss58Format
 */
async function web3Accounts({ accountType, extensions, genesisHash, ss58Format } = {}) {
    const accounts = [];
    const sources = await filterEnable('web3Accounts', extensions);
    const retrieved = await Promise.all(sources.map(async ({ accounts, name: source }) => {
        try {
            const list = await accounts.get();
            return mapAccounts(source, filterAccounts(list, genesisHash, accountType), ss58Format);
        }
        catch {
            // cannot handle this one
            return [];
        }
    }));
    retrieved.forEach((result) => {
        accounts.push(...result);
    });
    console.info(`web3Accounts: Found ${accounts.length} address${accounts.length !== 1 ? 'es' : ''}`);
    return accounts;
}
/**
 * @summary Finds a specific provider based on the name
 * @description
 * This retrieves a specific source (extension) based on the name. In most
 * cases it should not be needed to call it directly (e.g. it is used internally
 * by calls such as web3FromAddress) but would allow operation on a specific
 * known extension.
 */
async function web3FromSource(source) {
    if (!web3EnablePromise) {
        return throwError('web3FromSource');
    }
    const sources = await web3EnablePromise;
    const found = source && sources.find(({ name }) => name === source);
    if (!found) {
        throw new Error(`web3FromSource: Unable to find an injected ${source}`);
    }
    return found;
}
/**
 * @summary Find a specific provider that provides a specific address
 * @description
 * Based on an address, return the provider that has makes this address
 * available to the page.
 */
async function web3FromAddress(address) {
    if (!web3EnablePromise) {
        return throwError('web3FromAddress');
    }
    const accounts = await web3Accounts();
    let found;
    if (address) {
        const accountU8a = decodeAddress(address);
        found = accounts.find((account) => u8aEq(decodeAddress(account.address), accountU8a));
    }
    if (!found) {
        throw new Error(`web3FromAddress: Unable to find injected ${address}`);
    }
    return web3FromSource(found.meta.source);
}

export { web3Accounts, web3Enable, web3EnablePromise, web3FromAddress, web3FromSource };
