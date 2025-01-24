/** Types generated for queries found in "src/sql/wallet-delegation.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'NewAddress' parameters type */
export interface INewAddressParams {
  address: string;
}

/** 'NewAddress' return type */
export type INewAddressResult = void;

/** 'NewAddress' query type */
export interface INewAddressQuery {
  params: INewAddressParams;
  result: INewAddressResult;
}

const newAddressIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":49}]}],"statement":"INSERT INTO addresses (address) \nVALUES (:address!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO addresses (address) 
 * VALUES (:address!)
 * ```
 */
export const newAddress = new PreparedQuery<INewAddressParams,INewAddressResult>(newAddressIR);


/** 'NewAddressWithId' parameters type */
export interface INewAddressWithIdParams {
  address: string;
  id: number;
}

/** 'NewAddressWithId' return type */
export type INewAddressWithIdResult = void;

/** 'NewAddressWithId' query type */
export interface INewAddressWithIdQuery {
  params: INewAddressWithIdParams;
  result: INewAddressWithIdResult;
}

const newAddressWithIdIR: any = {"usedParamSet":{"address":true,"id":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":53}]},{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":59}]}],"statement":"INSERT INTO addresses (address, id) \nVALUES (:address!, :id!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO addresses (address, id) 
 * VALUES (:address!, :id!)
 * ```
 */
export const newAddressWithId = new PreparedQuery<INewAddressWithIdParams,INewAddressWithIdResult>(newAddressWithIdIR);


/** 'NewDelegation' parameters type */
export interface INewDelegationParams {
  from_id: number;
  to_id: number;
}

/** 'NewDelegation' return type */
export type INewDelegationResult = void;

/** 'NewDelegation' query type */
export interface INewDelegationQuery {
  params: INewDelegationParams;
  result: INewDelegationResult;
}

const newDelegationIR: any = {"usedParamSet":{"from_id":true,"to_id":true},"params":[{"name":"from_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":50,"b":58}]},{"name":"to_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":67}]}],"statement":"INSERT INTO delegations (from_id, to_id) \nVALUES (:from_id!, :to_id!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO delegations (from_id, to_id) 
 * VALUES (:from_id!, :to_id!)
 * ```
 */
export const newDelegation = new PreparedQuery<INewDelegationParams,INewDelegationResult>(newDelegationIR);


/** 'GetAddressFromId' parameters type */
export interface IGetAddressFromIdParams {
  id: number;
}

/** 'GetAddressFromId' return type */
export interface IGetAddressFromIdResult {
  address: string;
  id: number;
}

/** 'GetAddressFromId' query type */
export interface IGetAddressFromIdQuery {
  params: IGetAddressFromIdParams;
  result: IGetAddressFromIdResult;
}

const getAddressFromIdIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":35,"b":38}]}],"statement":"SELECT * FROM addresses\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM addresses
 * WHERE id = :id!
 * ```
 */
export const getAddressFromId = new PreparedQuery<IGetAddressFromIdParams,IGetAddressFromIdResult>(getAddressFromIdIR);


/** 'GetAddressFromAddress' parameters type */
export interface IGetAddressFromAddressParams {
  address: string;
}

/** 'GetAddressFromAddress' return type */
export interface IGetAddressFromAddressResult {
  address: string;
  id: number;
}

/** 'GetAddressFromAddress' query type */
export interface IGetAddressFromAddressQuery {
  params: IGetAddressFromAddressParams;
  result: IGetAddressFromAddressResult;
}

const getAddressFromAddressIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":48}]}],"statement":"SELECT * FROM addresses\nWHERE address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM addresses
 * WHERE address = :address!
 * ```
 */
export const getAddressFromAddress = new PreparedQuery<IGetAddressFromAddressParams,IGetAddressFromAddressResult>(getAddressFromAddressIR);


/** 'GetDelegation' parameters type */
export interface IGetDelegationParams {
  from_id: number;
  to_id: number;
}

/** 'GetDelegation' return type */
export interface IGetDelegationResult {
  from_id: number;
  to_id: number;
}

/** 'GetDelegation' query type */
export interface IGetDelegationQuery {
  params: IGetDelegationParams;
  result: IGetDelegationResult;
}

const getDelegationIR: any = {"usedParamSet":{"from_id":true,"to_id":true},"params":[{"name":"from_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":42,"b":50}]},{"name":"to_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":70}]}],"statement":"SELECT * FROM delegations\nWHERE from_id = :from_id!\nAND to_id = :to_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM delegations
 * WHERE from_id = :from_id!
 * AND to_id = :to_id!
 * ```
 */
export const getDelegation = new PreparedQuery<IGetDelegationParams,IGetDelegationResult>(getDelegationIR);


/** 'GetDelegationsFrom' parameters type */
export interface IGetDelegationsFromParams {
  from_id: number;
}

/** 'GetDelegationsFrom' return type */
export interface IGetDelegationsFromResult {
  from_id: number;
  to_id: number;
}

/** 'GetDelegationsFrom' query type */
export interface IGetDelegationsFromQuery {
  params: IGetDelegationsFromParams;
  result: IGetDelegationsFromResult;
}

const getDelegationsFromIR: any = {"usedParamSet":{"from_id":true},"params":[{"name":"from_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":42,"b":50}]}],"statement":"SELECT * FROM delegations\nWHERE from_id = :from_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM delegations
 * WHERE from_id = :from_id!
 * ```
 */
export const getDelegationsFrom = new PreparedQuery<IGetDelegationsFromParams,IGetDelegationsFromResult>(getDelegationsFromIR);


/** 'GetDelegationsFromWithAddress' parameters type */
export interface IGetDelegationsFromWithAddressParams {
  from_id: number;
}

/** 'GetDelegationsFromWithAddress' return type */
export interface IGetDelegationsFromWithAddressResult {
  from_id: number;
  id: number;
  to_address: string;
  to_id: number;
}

/** 'GetDelegationsFromWithAddress' query type */
export interface IGetDelegationsFromWithAddressQuery {
  params: IGetDelegationsFromWithAddressParams;
  result: IGetDelegationsFromWithAddressResult;
}

const getDelegationsFromWithAddressIR: any = {"usedParamSet":{"from_id":true},"params":[{"name":"from_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":139,"b":147}]}],"statement":"SELECT id, from_id, to_id, address as to_address FROM delegations\nINNER JOIN addresses ON addresses.id = delegations.to_id\nWHERE from_id = :from_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, from_id, to_id, address as to_address FROM delegations
 * INNER JOIN addresses ON addresses.id = delegations.to_id
 * WHERE from_id = :from_id!
 * ```
 */
export const getDelegationsFromWithAddress = new PreparedQuery<IGetDelegationsFromWithAddressParams,IGetDelegationsFromWithAddressResult>(getDelegationsFromWithAddressIR);


/** 'GetDelegationsTo' parameters type */
export interface IGetDelegationsToParams {
  to_id: number;
}

/** 'GetDelegationsTo' return type */
export interface IGetDelegationsToResult {
  from_id: number;
  to_id: number;
}

/** 'GetDelegationsTo' query type */
export interface IGetDelegationsToQuery {
  params: IGetDelegationsToParams;
  result: IGetDelegationsToResult;
}

const getDelegationsToIR: any = {"usedParamSet":{"to_id":true},"params":[{"name":"to_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":46}]}],"statement":"SELECT * FROM delegations\nWHERE to_id = :to_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM delegations
 * WHERE to_id = :to_id!
 * ```
 */
export const getDelegationsTo = new PreparedQuery<IGetDelegationsToParams,IGetDelegationsToResult>(getDelegationsToIR);


/** 'GetDelegationsToWithAddress' parameters type */
export interface IGetDelegationsToWithAddressParams {
  to_id: number;
}

/** 'GetDelegationsToWithAddress' return type */
export interface IGetDelegationsToWithAddressResult {
  from_address: string;
  from_id: number;
  id: number;
  to_id: number;
}

/** 'GetDelegationsToWithAddress' query type */
export interface IGetDelegationsToWithAddressQuery {
  params: IGetDelegationsToWithAddressParams;
  result: IGetDelegationsToWithAddressResult;
}

const getDelegationsToWithAddressIR: any = {"usedParamSet":{"to_id":true},"params":[{"name":"to_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":141,"b":147}]}],"statement":"SELECT id, from_id, to_id, address as from_address FROM delegations\nINNER JOIN addresses ON addresses.id = delegations.from_id\nWHERE to_id = :to_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, from_id, to_id, address as from_address FROM delegations
 * INNER JOIN addresses ON addresses.id = delegations.from_id
 * WHERE to_id = :to_id!
 * ```
 */
export const getDelegationsToWithAddress = new PreparedQuery<IGetDelegationsToWithAddressParams,IGetDelegationsToWithAddressResult>(getDelegationsToWithAddressIR);


/** 'DeleteDelegationsFrom' parameters type */
export interface IDeleteDelegationsFromParams {
  from_id: number;
}

/** 'DeleteDelegationsFrom' return type */
export type IDeleteDelegationsFromResult = void;

/** 'DeleteDelegationsFrom' query type */
export interface IDeleteDelegationsFromQuery {
  params: IDeleteDelegationsFromParams;
  result: IDeleteDelegationsFromResult;
}

const deleteDelegationsFromIR: any = {"usedParamSet":{"from_id":true},"params":[{"name":"from_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":48}]}],"statement":"DELETE FROM delegations\nWHERE from_id = :from_id!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM delegations
 * WHERE from_id = :from_id!
 * ```
 */
export const deleteDelegationsFrom = new PreparedQuery<IDeleteDelegationsFromParams,IDeleteDelegationsFromResult>(deleteDelegationsFromIR);


/** 'DeleteDelegationTo' parameters type */
export interface IDeleteDelegationToParams {
  from_id: number;
  to_id: number;
}

/** 'DeleteDelegationTo' return type */
export type IDeleteDelegationToResult = void;

/** 'DeleteDelegationTo' query type */
export interface IDeleteDelegationToQuery {
  params: IDeleteDelegationToParams;
  result: IDeleteDelegationToResult;
}

const deleteDelegationToIR: any = {"usedParamSet":{"to_id":true,"from_id":true},"params":[{"name":"to_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":38,"b":44}]},{"name":"from_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":68}]}],"statement":"DELETE FROM delegations\nWHERE to_id = :to_id!\nand from_id = :from_id!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM delegations
 * WHERE to_id = :to_id!
 * and from_id = :from_id!
 * ```
 */
export const deleteDelegationTo = new PreparedQuery<IDeleteDelegationToParams,IDeleteDelegationToResult>(deleteDelegationToIR);


/** 'DeleteAddress' parameters type */
export interface IDeleteAddressParams {
  address: string;
}

/** 'DeleteAddress' return type */
export type IDeleteAddressResult = void;

/** 'DeleteAddress' query type */
export interface IDeleteAddressQuery {
  params: IDeleteAddressParams;
  result: IDeleteAddressResult;
}

const deleteAddressIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":38,"b":46}]}],"statement":"DELETE FROM addresses\nWHERE address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM addresses
 * WHERE address = :address!
 * ```
 */
export const deleteAddress = new PreparedQuery<IDeleteAddressParams,IDeleteAddressResult>(deleteAddressIR);


/** 'DeleteAddressId' parameters type */
export interface IDeleteAddressIdParams {
  id: number;
}

/** 'DeleteAddressId' return type */
export type IDeleteAddressIdResult = void;

/** 'DeleteAddressId' query type */
export interface IDeleteAddressIdQuery {
  params: IDeleteAddressIdParams;
  result: IDeleteAddressIdResult;
}

const deleteAddressIdIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":33,"b":36}]}],"statement":"DELETE FROM addresses\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM addresses
 * WHERE id = :id!
 * ```
 */
export const deleteAddressId = new PreparedQuery<IDeleteAddressIdParams,IDeleteAddressIdResult>(deleteAddressIdIR);


/** 'UpdateAddress' parameters type */
export interface IUpdateAddressParams {
  new_address: string;
  old_address: string;
}

/** 'UpdateAddress' return type */
export type IUpdateAddressResult = void;

/** 'UpdateAddress' query type */
export interface IUpdateAddressQuery {
  params: IUpdateAddressParams;
  result: IUpdateAddressResult;
}

const updateAddressIR: any = {"usedParamSet":{"new_address":true,"old_address":true},"params":[{"name":"new_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":31,"b":43}]},{"name":"old_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":73}]}],"statement":"UPDATE addresses\nSET address = :new_address!\nWHERE address = :old_address!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE addresses
 * SET address = :new_address!
 * WHERE address = :old_address!
 * ```
 */
export const updateAddress = new PreparedQuery<IUpdateAddressParams,IUpdateAddressResult>(updateAddressIR);


/** 'UpdateDelegateTo' parameters type */
export interface IUpdateDelegateToParams {
  new_to: number;
  old_to: number;
}

/** 'UpdateDelegateTo' return type */
export type IUpdateDelegateToResult = void;

/** 'UpdateDelegateTo' query type */
export interface IUpdateDelegateToQuery {
  params: IUpdateDelegateToParams;
  result: IUpdateDelegateToResult;
}

const updateDelegateToIR: any = {"usedParamSet":{"new_to":true,"old_to":true},"params":[{"name":"new_to","required":true,"transform":{"type":"scalar"},"locs":[{"a":32,"b":39}]},{"name":"old_to","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":62}]}],"statement":"UPDATE delegations \nSET to_id = :new_to!\nWHERE to_id = :old_to!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE delegations 
 * SET to_id = :new_to!
 * WHERE to_id = :old_to!
 * ```
 */
export const updateDelegateTo = new PreparedQuery<IUpdateDelegateToParams,IUpdateDelegateToResult>(updateDelegateToIR);


/** 'UpdateDelegateFrom' parameters type */
export interface IUpdateDelegateFromParams {
  new_from: number;
  old_from: number;
  old_to: number;
}

/** 'UpdateDelegateFrom' return type */
export type IUpdateDelegateFromResult = void;

/** 'UpdateDelegateFrom' query type */
export interface IUpdateDelegateFromQuery {
  params: IUpdateDelegateFromParams;
  result: IUpdateDelegateFromResult;
}

const updateDelegateFromIR: any = {"usedParamSet":{"new_from":true,"old_from":true,"old_to":true},"params":[{"name":"new_from","required":true,"transform":{"type":"scalar"},"locs":[{"a":34,"b":43}]},{"name":"old_from","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":70}]},{"name":"old_to","required":true,"transform":{"type":"scalar"},"locs":[{"a":85,"b":92}]}],"statement":"UPDATE delegations \nSET from_id = :new_from!\nWHERE from_id = :old_from! \nAND to_id = :old_to!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE delegations 
 * SET from_id = :new_from!
 * WHERE from_id = :old_from! 
 * AND to_id = :old_to!
 * ```
 */
export const updateDelegateFrom = new PreparedQuery<IUpdateDelegateFromParams,IUpdateDelegateFromResult>(updateDelegateFromIR);


/** 'GetMainAddressFromAddress' parameters type */
export interface IGetMainAddressFromAddressParams {
  address: string;
}

/** 'GetMainAddressFromAddress' return type */
export interface IGetMainAddressFromAddressResult {
  from_address: string;
  from_id: number;
  to_address: string;
  to_id: number;
}

/** 'GetMainAddressFromAddress' query type */
export interface IGetMainAddressFromAddressQuery {
  params: IGetMainAddressFromAddressParams;
  result: IGetMainAddressFromAddressResult;
}

const getMainAddressFromAddressIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":332,"b":340}]}],"statement":"select addr.id           as to_id, \n       addr.address      as to_address,\n       main_addr.id      as from_id,      \n       main_addr.address as from_address\nfrom addresses addr\nleft join delegations         on delegations.to_id   = addr.id\nleft join addresses main_addr on delegations.from_id = main_addr.id\nwhere addr.address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * select addr.id           as to_id, 
 *        addr.address      as to_address,
 *        main_addr.id      as from_id,      
 *        main_addr.address as from_address
 * from addresses addr
 * left join delegations         on delegations.to_id   = addr.id
 * left join addresses main_addr on delegations.from_id = main_addr.id
 * where addr.address = :address!
 * ```
 */
export const getMainAddressFromAddress = new PreparedQuery<IGetMainAddressFromAddressParams,IGetMainAddressFromAddressResult>(getMainAddressFromAddressIR);


