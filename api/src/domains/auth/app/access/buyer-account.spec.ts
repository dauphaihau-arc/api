import { isBuyerAccount } from './buyer-account';

describe('isBuyerAccount', () => {
  it('treats a customer-only account as a buyer account', () => {
    expect(isBuyerAccount(['customer'])).toBe(true);
  });

  it('treats a seller account as non-buyer', () => {
    expect(isBuyerAccount(['seller'])).toBe(false);
  });

  it('treats an admin account as non-buyer', () => {
    expect(isBuyerAccount(['admin'])).toBe(false);
  });

  it('treats mixed customer and seller roles as non-buyer', () => {
    expect(isBuyerAccount(['customer', 'seller'])).toBe(false);
  });

  it('treats mixed customer and admin roles as non-buyer', () => {
    expect(isBuyerAccount(['customer', 'admin'])).toBe(false);
  });

  it('treats a finance-only account as non-buyer', () => {
    expect(isBuyerAccount(['finance'])).toBe(false);
  });

  it('treats an account without roles as non-buyer', () => {
    expect(isBuyerAccount([])).toBe(false);
  });
});
