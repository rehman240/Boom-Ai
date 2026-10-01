"""The product's name, in one place.

The brand is BOOOM; the product word after it is a working name the client may change
(or drop: set PRODUCT to ""). The frontend has the same pair in frontend/src/lib/brand.ts.
"""

BRAND = "BOOOM"
PRODUCT = "More"
APP_NAME = f"{BRAND} {PRODUCT}" if PRODUCT else BRAND
# For file names, e.g. "booom-more".
APP_SLUG = APP_NAME.lower().replace(" ", "-")
