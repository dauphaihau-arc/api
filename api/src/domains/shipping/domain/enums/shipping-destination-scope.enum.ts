/**
 * Destination scope of a Shipping Profile rate.
 *
 * A rate applies to one configured country, or to every destination that no
 * configured country rate covers. A rate only matches structured address
 * fields, never display strings or relative same-city rules.
 */
export enum ShippingDestinationScope {
  COUNTRY = 'country',
  EVERYWHERE_ELSE = 'everywhere_else',
}
