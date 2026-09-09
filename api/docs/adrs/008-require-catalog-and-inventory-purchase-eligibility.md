# ADR-008: Require Catalog and Inventory Purchase Eligibility

## Status

Accepted

## Date

2026-09-06

## Context

Storefront catalog documents are eventually consistent, and inventory availability alone cannot express whether a seller still intends to offer a Product or Product Variant. Authorizing purchase from either source alone can sell a removed offer or oversell an active one.

## Decision

Quote creation and final Order creation require both current Seller Catalog intent and current Inventory capability state. The Product must be active, any selected Product Variant must be active, the Inventory Item must be reservable, and Available Quantity must cover the request. Projected catalog and search documents are discovery models and never authorize purchase.

When a Product or Product Variant becomes inactive or removed, subsequent checkout attempts fail explicitly. Existing unpaid quotes become invalid and their reservations are released through the durable lifecycle event flow; confirmed Orders remain unchanged. During an Inventory Shortage, reserved checkout attempts may complete only while sufficient On-hand Quantity remains, and later attempts fail without allowing a negative physical count.

## Considered Options

- Inventory availability alone: rejected because it does not represent seller intent.
- Projected catalog presence: rejected because projection lag is accepted by the catalog architecture.
- Seller Catalog state alone: rejected because active offers can still lack available inventory.

## Consequences

- Checkout must re-evaluate Purchase Eligibility at quote creation and final Order creation.
- Cross-capability application contracts must expose authoritative lifecycle and inventory checks without reading another capability's persistence entities.
- Lifecycle projection or reservation-cleanup lag cannot make an ineligible offer purchasable.
