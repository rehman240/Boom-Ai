/**
 * The product's name, in one place. The brand is BOOOM; the product word after it is a
 * working name the client may change (or drop: set PRODUCT to ""). The backend has the
 * same pair in backend/app/brand.py.
 */
export const BRAND = "BOOOM";
export const PRODUCT = "More";
export const APP_NAME = PRODUCT ? `${BRAND} ${PRODUCT}` : BRAND;
