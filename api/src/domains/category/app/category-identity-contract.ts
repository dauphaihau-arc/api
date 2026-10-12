/**
 * Version of the category identifier contract this API speaks.
 *
 * `1` = internal UUID semantics, `2` = public decimal identity. This value is
 * tied to the running transport behavior, not configurable: this build always
 * resolves public identity and rejects internal ids, so it must advertise `2`.
 * The staged cutover ships a preparatory release that adds only this endpoint
 * (advertising the then-current semantics) plus the client guard; activation
 * deploys this public build. A flag that could advertise `1` while the code
 * still spoke public identity would be a lie, so none exists.
 */
export const CATEGORY_IDENTITY_CONTRACT_VERSION = '2';
