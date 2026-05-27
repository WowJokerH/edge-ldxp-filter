# Privacy Policy

This extension is designed for filtering and comparing source goods on supported LDXP pages.

## Data processed by the extension

The extension runs only on supported LDXP domains declared in the extension manifest:

- `https://pay.ldxp.cn/*`
- `https://www.ldxp.cn/*`

When the user opens the extension panel and starts fetching goods, the extension may process:

- product and store information returned by LDXP source goods APIs;
- page content needed to display filtering and detail views;
- the local LDXP authentication token stored by the LDXP website, used as `Merchant-Token` when calling LDXP APIs from the user's browser.

## Data collection and transfer

The extension does not sell user data, does not transfer user data to the developer, and does not send user data to third-party analytics or advertising services.

The LDXP authentication token is used only in requests from the user's browser to the original LDXP service domains so that the user can access the data already available to their logged-in account.

## Remote code

The extension does not load or execute remote JavaScript or WebAssembly. All extension code is packaged with the extension.

## Contact

For support, use the GitHub issues page:

https://github.com/WowJokerH/edge-ldxp-filter/issues
